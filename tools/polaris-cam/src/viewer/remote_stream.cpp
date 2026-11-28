// Polaris Cam: the cameras sent to the website's back office (remote_stream.hpp).
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
#include "remote_stream.hpp"
#include <objbase.h>
#include <wincodec.h>
#include <winhttp.h>
#include <algorithm>
#include <charconv>
#include <chrono>
#include <cstdio>
#include <cstring>
#include "../shared/broadcast_link.hpp"

namespace polaris_cam::remote {
namespace {
template <typename T>
void drop(T*& object) noexcept {
  if (object)
    object->Release();
  object = nullptr;
}
bool space(wchar_t c) noexcept {
  return c == L' ' || c == L'\t' || c == L'\r' || c == L'\n' || c == 0x3000 || c == 0xFEFF || c == 0x00A0;
}
wchar_t lower(wchar_t c) noexcept {
  return c >= L'A' && c <= L'Z' ? static_cast<wchar_t>(c + 32) : c;
}
bool unreserved(wchar_t c) noexcept {
  return (c >= L'a' && c <= L'z') || (c >= L'A' && c <= L'Z') || (c >= L'0' && c <= L'9') || c == L'-' || c == L'_' || c == L'.' ||
         c == L'~';
}
std::uint64_t ticks() noexcept {
  return GetTickCount64();
}
}  // namespace

bool parse_url(std::wstring_view text, Endpoint& out) {
  while (!text.empty() && space(text.front()))
    text.remove_prefix(1);
  while (!text.empty() && space(text.back()))
    text.remove_suffix(1);
  const auto scheme_end = text.find(L"://");
  if (scheme_end == std::wstring_view::npos || scheme_end > 5)
    return false;
  std::wstring scheme;
  for (const wchar_t c : text.substr(0, scheme_end))
    scheme += lower(c);
  bool secure = false;
  if (scheme == L"https" || scheme == L"wss")
    secure = true;
  else if (scheme != L"http" && scheme != L"ws")
    return false;
  auto rest = text.substr(scheme_end + 3);
  // Query and fragment are not part of the link.
  if (const auto cut = rest.find_first_of(L"?#"); cut != std::wstring_view::npos)
    rest = rest.substr(0, cut);
  const auto slash = rest.find(L'/');
  if (slash == std::wstring_view::npos)
    return false;
  const auto authority = rest.substr(0, slash);
  auto path = rest.substr(slash);
  std::wstring_view host = authority, port_text;
  if (const auto colon = authority.rfind(L':'); colon != std::wstring_view::npos) {
    host = authority.substr(0, colon);
    port_text = authority.substr(colon + 1);
    if (port_text.empty())
      return false;
  }
  if (host.empty() || host.size() > 253 || host.front() == L'.' || host.front() == L'-' || host.back() == L'.')
    return false;
  std::wstring name;
  for (const wchar_t c : host) {
    if (!((c >= L'a' && c <= L'z') || (c >= L'A' && c <= L'Z') || (c >= L'0' && c <= L'9') || c == L'-' || c == L'.'))
      return false;  // also userinfo (@) and IPv6 ([)
    name += lower(c);
  }
  unsigned port = 0;
  if (!port_text.empty()) {
    if (port_text.size() > 5)
      return false;
    for (const wchar_t c : port_text) {
      if (c < L'0' || c > L'9')
        return false;
      port = port * 10 + static_cast<unsigned>(c - L'0');
    }
    if (port == 0 || port > 65535)
      return false;
  }
  constexpr std::wstring_view Prefix = L"/live/cam/";
  if (path.substr(0, Prefix.size()) != Prefix)
    return false;
  path.remove_prefix(Prefix.size());
  const auto token_end = std::min(path.find(L'/'), path.size());
  const auto token = path.substr(0, token_end);
  if (token.empty() || token.size() > 256 || !std::all_of(token.begin(), token.end(), unreserved) || token == L"." || token == L"..")
    return false;
  const auto tail = path.substr(token_end);
  if (!tail.empty() && tail != L"/" && tail != L"/ws" && tail != L"/ws/")
    return false;
  const bool local = name == L"127.0.0.1" || name == L"localhost";
  // Only this computer may be reached without TLS.
  if (!local)
    secure = true;
  out.host = name;
  out.port = static_cast<unsigned short>(port ? port : secure ? 443u : 80u);
  out.path = std::wstring(Prefix) + std::wstring(token) + L"/ws";
  out.secure = secure;
  out.local = local;
  return true;
}

void write_header(unsigned char* out, unsigned cam, unsigned width, unsigned height, std::uint32_t seq) noexcept {
  out[0] = 0x50;  // 'P'
  out[1] = 1;     // version
  out[2] = static_cast<unsigned char>(cam);
  out[3] = 1;  // JPEG
  out[4] = 1;  // key frame
  out[5] = 0;
  out[6] = static_cast<unsigned char>(width & 0xFF);
  out[7] = static_cast<unsigned char>((width >> 8) & 0xFF);
  out[8] = static_cast<unsigned char>(height & 0xFF);
  out[9] = static_cast<unsigned char>((height >> 8) & 0xFF);
  out[10] = 0;
  out[11] = 0;
  for (unsigned i = 0; i < 4; ++i)
    out[12 + i] = static_cast<unsigned char>((seq >> (8 * i)) & 0xFF);
}

std::string utf8(std::wstring_view text) {
  if (text.empty())
    return {};
  const int length = WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
  if (length <= 0)
    return {};
  std::string out(static_cast<std::size_t>(length), '\0');
  WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), out.data(), length, nullptr, nullptr);
  return out;
}
std::string json_escape(std::string_view text) {
  std::string out;
  out.reserve(text.size() + 2);
  for (const char c : text) {
    const auto byte = static_cast<unsigned char>(c);
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if (c == '\n') {
      out += "\\n";
    } else if (c == '\r') {
      out += "\\r";
    } else if (c == '\t') {
      out += "\\t";
    } else if (byte < 0x20) {
      char escaped[8];
      std::snprintf(escaped, sizeof(escaped), "\\u%04x", static_cast<unsigned>(byte));
      out += escaped;
    } else {
      out += c;
    }
  }
  return out;
}
std::string hello_json(const std::array<CamInfo, Cams>& cams) {
  std::string out = "{\"t\":\"hello\",\"v\":\"" POLARIS_CAM_VERSION "\",\"mode\":\"jpeg\",\"cams\":[";
  for (unsigned i = 0; i < Cams; ++i) {
    const auto& cam = cams[i];
    char sizes[96];
    std::snprintf(sizes, sizeof(sizes), "\",\"on\":%s,\"w\":%u,\"h\":%u}", cam.on ? "true" : "false", cam.width, cam.height);
    out += i ? ",{\"i\":" : "{\"i\":";
    out += std::to_string(i);
    out += ",\"name\":\"";
    out += json_escape(utf8(cam.name));
    out += sizes;
  }
  out += "]}";
  return out;
}
std::string_view json_field(std::string_view message, std::string_view key) {
  std::size_t at = 0;
  while ((at = message.find(key, at)) != std::string_view::npos) {
    const bool quoted = at > 0 && message[at - 1] == '"' && at + key.size() < message.size() && message[at + key.size()] == '"';
    std::size_t i = at + key.size() + 1;
    at += key.size();
    if (!quoted)
      continue;
    while (i < message.size() && (message[i] == ' ' || message[i] == '\t' || message[i] == '\r' || message[i] == '\n'))
      ++i;
    if (i >= message.size() || message[i] != ':')
      continue;
    ++i;
    while (i < message.size() && (message[i] == ' ' || message[i] == '\t' || message[i] == '\r' || message[i] == '\n'))
      ++i;
    if (i >= message.size())
      return {};
    if (message[i] == '"') {
      const std::size_t begin = ++i;
      while (i < message.size() && message[i] != '"')
        i += message[i] == '\\' ? 2 : 1;
      return i <= message.size() ? message.substr(begin, std::min(i, message.size()) - begin) : std::string_view{};
    }
    const std::size_t begin = i;
    while (i < message.size() && message[i] != ',' && message[i] != '}' && message[i] != ' ' && message[i] != ']')
      ++i;
    return message.substr(begin, i - begin);
  }
  return {};
}
int watch_count(std::string_view message) {
  if (json_field(message, "t") != "watch")
    return -1;
  const auto n = json_field(message, "n");
  int value = 0;
  const auto [end, error] = std::from_chars(n.data(), n.data() + n.size(), value);
  if (error != std::errc{} || end == n.data())
    return -1;
  return std::max(value, 0);
}

void output_size(unsigned width, unsigned height, unsigned& out_width, unsigned& out_height) noexcept {
  out_width = width;
  out_height = height;
  while (out_width > MaximumWidth && out_width >= 2 && out_height >= 2) {
    out_width /= 2;
    out_height /= 2;
  }
}
void shrink_to_bgr(const unsigned char* bgra,
                   unsigned width,
                   unsigned height,
                   std::size_t stride,
                   std::vector<unsigned char>& out,
                   unsigned& out_width,
                   unsigned& out_height) {
  output_size(width, height, out_width, out_height);
  out.resize(std::size_t{out_width} * out_height * 3);
  unsigned char* target = out.data();
  if (out_width == width) {
    for (unsigned y = 0; y < out_height; ++y) {
      const unsigned char* row = bgra + std::size_t{y} * stride;
      for (unsigned x = 0; x < out_width; ++x, row += 4, target += 3) {
        target[0] = row[0];
        target[1] = row[1];
        target[2] = row[2];
      }
    }
    return;
  }
  // Halved (once: a picture is at most 1920 wide).
  const unsigned step = width / out_width;
  if (step == 2) {
    for (unsigned y = 0; y < out_height; ++y) {
      const unsigned char* top = bgra + std::size_t{y} * 2 * stride;
      const unsigned char* bottom = top + stride;
      for (unsigned x = 0; x < out_width; ++x, top += 8, bottom += 8, target += 3)
        for (unsigned c = 0; c < 3; ++c)
          target[c] = static_cast<unsigned char>((top[c] + top[4 + c] + bottom[c] + bottom[4 + c] + 2) >> 2);
    }
    return;
  }
  // Wider still: every step-th pixel.
  for (unsigned y = 0; y < out_height; ++y) {
    const unsigned char* row = bgra + std::size_t{y} * step * stride;
    for (unsigned x = 0; x < out_width; ++x, target += 3) {
      const unsigned char* p = row + std::size_t{x} * step * 4;
      target[0] = p[0];
      target[1] = p[1];
      target[2] = p[2];
    }
  }
}

// --- the picture's JPEG ------------------------------------------------------
namespace {
// WIC on the worker's thread. Each picture is written straight after its
// header into one buffer that is kept, so sending copies nothing.
class Jpeg {
 public:
  ~Jpeg() { drop(factory_); }
  // header + JPEG in message; false when it could not be made.
  bool encode(const std::vector<unsigned char>& bgr,
              unsigned width,
              unsigned height,
              std::vector<unsigned char>& message,
              std::size_t& size) {
    size = 0;
    if (!factory_ && FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory_))))
      return false;
    // A JPEG at this quality is far smaller than its pixels; one that is not is dropped.
    const std::size_t capacity = std::size_t{width} * height * 3 + 65536;
    if (message.size() < HeaderSize + capacity)
      message.resize(HeaderSize + capacity);
    IWICStream* stream = nullptr;
    IWICBitmapEncoder* encoder = nullptr;
    IWICBitmapFrameEncode* frame = nullptr;
    IPropertyBag2* options = nullptr;
    bool ok = SUCCEEDED(factory_->CreateStream(&stream)) &&
              SUCCEEDED(stream->InitializeFromMemory(message.data() + HeaderSize, static_cast<DWORD>(capacity))) &&
              SUCCEEDED(CoCreateInstance(CLSID_WICJpegEncoder, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&encoder))) &&
              SUCCEEDED(encoder->Initialize(stream, WICBitmapEncoderNoCache)) && SUCCEEDED(encoder->CreateNewFrame(&frame, &options));
    if (ok) {
      wchar_t name[] = L"ImageQuality";
      PROPBAG2 option{};
      option.pstrName = name;
      VARIANT value{};
      value.vt = VT_R4;
      value.fltVal = 0.75f;
      options->Write(1, &option, &value);
      WICPixelFormatGUID format = GUID_WICPixelFormat24bppBGR;
      ok = SUCCEEDED(frame->Initialize(options)) && SUCCEEDED(frame->SetSize(width, height)) && SUCCEEDED(frame->SetPixelFormat(&format)) &&
           IsEqualGUID(format, GUID_WICPixelFormat24bppBGR) &&
           SUCCEEDED(frame->WritePixels(height, width * 3, static_cast<UINT>(bgr.size()), const_cast<BYTE*>(bgr.data()))) &&
           SUCCEEDED(frame->Commit()) && SUCCEEDED(encoder->Commit());
    }
    if (ok) {
      ULARGE_INTEGER position{};
      ok = SUCCEEDED(stream->Seek(LARGE_INTEGER{}, STREAM_SEEK_CUR, &position)) && position.QuadPart >= 4 && position.QuadPart <= capacity;
      if (ok)
        size = HeaderSize + static_cast<std::size_t>(position.QuadPart);
    }
    drop(options);
    drop(frame);
    drop(encoder);
    drop(stream);
    return ok;
  }

 private:
  IWICImagingFactory* factory_ = nullptr;
};
bool send_text(HINTERNET socket, std::string_view text) {
  return WinHttpWebSocketSend(socket, WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE, const_cast<char*>(text.data()),
                              static_cast<DWORD>(text.size())) == NO_ERROR;
}
}  // namespace

// --- the connection ------------------------------------------------------------
RemoteStream::~RemoteStream() {
  stop();
  release_gpu();
}

void RemoteStream::configure(bool enabled, std::wstring_view url) {
  if (enabled == enabled_ && url == url_ && (worker_.joinable() || state_.load() != State::off))
    return;
  stop();
  enabled_ = enabled;
  url_ = url;
  if (!enabled) {
    set_state(State::off);
    return;
  }
  std::wstring_view trimmed = url;
  while (!trimmed.empty() && space(trimmed.front()))
    trimmed.remove_prefix(1);
  if (trimmed.empty()) {
    set_state(State::no_url);
    return;
  }
  Endpoint endpoint;
  if (!parse_url(url, endpoint)) {
    set_state(State::invalid_url);
    return;
  }
  start(endpoint);
}

void RemoteStream::start(const Endpoint& endpoint) {
  {
    std::lock_guard lock(mutex_);
    finished_ = false;
    received_done_ = false;
    hello_dirty_ = !hello_.empty();
    for (auto& slot : slots_)
      slot.full = false;
  }
  stop_ = false;
  watchers_ = 0;
  set_state(State::connecting);
  worker_ = std::thread([this, endpoint] { run(endpoint); });
}

void RemoteStream::stop() {
  if (!worker_.joinable())
    return;
  stop_ = true;
  {
    std::unique_lock lock(mutex_);
    wake_.notify_all();
    // A moment to say goodbye; then whatever WinHTTP still waits for is cut.
    if (!wake_.wait_for(lock, std::chrono::milliseconds(1500), [this] { return finished_; })) {
      lock.unlock();
      abort_handles();
    }
  }
  worker_.join();
  watchers_ = 0;
}

void RemoteStream::abort_handles() {
  std::lock_guard lock(mutex_);
  for (HINTERNET* handle : {&socket_, &request_, &connection_, &session_}) {
    if (*handle)
      WinHttpCloseHandle(*handle);
    *handle = nullptr;
  }
}

void RemoteStream::set_cams(const std::array<CamInfo, Cams>& cams) {
  auto hello = hello_json(cams);
  std::lock_guard lock(mutex_);
  if (hello == hello_)
    return;
  hello_ = std::move(hello);
  hello_dirty_ = true;
  wake_.notify_all();
}

void RemoteStream::run(Endpoint endpoint) {
  const HRESULT com = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  unsigned retry = options_.first_retry_ms;
  while (!stopping()) {
    set_state(State::connecting);
    const Outcome outcome = connect_once(endpoint);
    if (stopping())
      break;
    if (outcome.close == 4004 || outcome.http == 401 || outcome.http == 403 || outcome.http == 404 || outcome.http == 410) {
      set_state(State::expired);
      break;
    }
    if (outcome.close == 4000) {
      set_state(State::replaced);
      break;
    }
    // A connection that held for a while starts the waits over.
    if (outcome.upgraded && outcome.lasted_ms >= 10000)
      retry = options_.first_retry_ms;
    set_state(State::retrying);
    {
      std::unique_lock lock(mutex_);
      wake_.wait_for(lock, std::chrono::milliseconds(retry), [this] { return stopping(); });
    }
    retry = std::min(retry * 2, options_.last_retry_ms);
  }
  watchers_ = 0;
  if (SUCCEEDED(com))
    CoUninitialize();
  std::lock_guard lock(mutex_);
  finished_ = true;
  wake_.notify_all();
}

RemoteStream::Outcome RemoteStream::connect_once(const Endpoint& endpoint) {
  Outcome outcome;
  const auto agent = L"PolarisCam/" POLARIS_CAM_VERSION_WIDE;
  // The system's proxy (a company's, or one set up automatically); this computer never goes through one.
  HINTERNET session = WinHttpOpen(agent, endpoint.local ? WINHTTP_ACCESS_TYPE_NO_PROXY : WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                                  WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!session && !endpoint.local)
    session = WinHttpOpen(agent, WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!session)
    return outcome;
  {
    std::lock_guard lock(mutex_);
    session_ = session;
  }
  WinHttpSetTimeouts(session, 10000, 10000, 15000, 15000);
  HINTERNET connection = WinHttpConnect(session, endpoint.host.c_str(), endpoint.port, 0);
  HINTERNET request = connection ? WinHttpOpenRequest(connection, L"GET", endpoint.path.c_str(), nullptr, WINHTTP_NO_REFERER,
                                                      WINHTTP_DEFAULT_ACCEPT_TYPES, endpoint.secure ? WINHTTP_FLAG_SECURE : 0)
                                 : nullptr;
  {
    std::lock_guard lock(mutex_);
    connection_ = connection;
    request_ = request;
  }
  HINTERNET socket = nullptr;
  if (request && !stopping() && WinHttpSetOption(request, WINHTTP_OPTION_UPGRADE_TO_WEB_SOCKET, nullptr, 0) &&
      WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) &&
      WinHttpReceiveResponse(request, nullptr)) {
    DWORD status = 0, size = sizeof(status);
    WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &status, &size,
                        WINHTTP_NO_HEADER_INDEX);
    outcome.http = status;
    if (status == 101)
      socket = WinHttpWebSocketCompleteUpgrade(request, 0);
  }
  {
    std::lock_guard lock(mutex_);
    if (request_)
      WinHttpCloseHandle(request_);
    request_ = nullptr;
    socket_ = socket;
    received_done_ = false;
    unwatched_ = false;
    close_code_ = 0;
    for (auto& slot : slots_)
      slot.full = false;
  }
  if (socket && !stopping()) {
    outcome.upgraded = true;
    connections_.fetch_add(1);
    const auto opened = ticks();
    heard_ms_ = opened;
    watchers_ = 0;
    set_state(State::connected);
    std::thread receiver([this, socket] { receive(socket); });
    bool ok = true;
    std::string hello;
    {
      std::lock_guard lock(mutex_);
      hello = hello_;
      hello_dirty_ = false;
    }
    if (!hello.empty())
      ok = send_text(socket, hello);
    Jpeg jpeg;
    std::vector<unsigned char> pixels, message;
    std::uint64_t next_ping = ticks() + options_.ping_ms;
    unsigned next_cam = 0;
    while (ok) {
      std::unique_lock lock(mutex_);
      const auto now = ticks();
      if (stopping() || received_done_)
        break;
      if (now - heard_ms_.load() > options_.silence_ms)
        break;  // the relay answers every ping: it is gone
      if (unwatched_) {
        unwatched_ = false;
        for (auto& slot : slots_)
          slot.full = false;
      }
      if (hello_dirty_) {
        hello = hello_;
        hello_dirty_ = false;
        lock.unlock();
        ok = send_text(socket, hello);
        continue;
      }
      if (now >= next_ping) {
        next_ping = now + options_.ping_ms;
        lock.unlock();
        ok = send_text(socket, "ping");
        continue;
      }
      // The cameras in turn, so that one cannot keep the others waiting.
      unsigned cam = Cams;
      for (unsigned i = 0; i < Cams; ++i)
        if (slots_[(next_cam + i) % Cams].full) {
          cam = (next_cam + i) % Cams;
          break;
        }
      if (cam < Cams && watchers_.load() > 0) {
        auto& slot = slots_[cam];
        pixels.swap(slot.pixels);
        const unsigned width = slot.width, height = slot.height;
        slot.full = false;
        const std::uint32_t seq = ++slot.seq;
        next_cam = (cam + 1) % Cams;
        lock.unlock();
        std::size_t size = 0;
        if (jpeg.encode(pixels, width, height, message, size)) {
          write_header(message.data(), cam, width, height, seq);
          ok = WinHttpWebSocketSend(socket, WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE, message.data(), static_cast<DWORD>(size)) ==
               NO_ERROR;
          if (ok) {
            frames_sent_.fetch_add(1);
            bytes_sent_.fetch_add(size);
          }
        }
        continue;
      }
      const auto wait = static_cast<long long>(std::min<std::uint64_t>(next_ping - now, 1000));
      wake_.wait_for(lock, std::chrono::milliseconds(wait));
    }
    // Goodbye: a close of our own when leaving (its answer ends the receiver),
    // the answer to the relay's when it closed.
    bool closed_by_relay = false;
    {
      std::lock_guard lock(mutex_);
      closed_by_relay = received_done_ && close_code_ != 0;
    }
    bool alive = false;
    {
      std::lock_guard lock(mutex_);
      alive = socket_ == socket;  // not cut by stop()
    }
    if (alive && (ok || closed_by_relay))
      WinHttpWebSocketShutdown(socket, WINHTTP_WEB_SOCKET_SUCCESS_CLOSE_STATUS, nullptr, 0);
    {
      std::unique_lock lock(mutex_);
      wake_.wait_for(lock, std::chrono::milliseconds(1000), [this] { return received_done_; });
    }
    abort_handles();  // ends a receiver still waiting
    receiver.join();
    outcome.lasted_ms = ticks() - opened;
    std::lock_guard lock(mutex_);
    outcome.close = close_code_;
  }
  watchers_ = 0;
  abort_handles();
  return outcome;
}

void RemoteStream::receive(HINTERNET socket) {
  std::string text;
  std::vector<char> buffer(8192);
  for (;;) {
    DWORD read = 0;
    WINHTTP_WEB_SOCKET_BUFFER_TYPE type{};
    if (WinHttpWebSocketReceive(socket, buffer.data(), static_cast<DWORD>(buffer.size()), &read, &type) != NO_ERROR)
      break;
    heard_ms_ = ticks();
    if (type == WINHTTP_WEB_SOCKET_CLOSE_BUFFER_TYPE) {
      USHORT code = 0;
      BYTE reason[WINHTTP_WEB_SOCKET_MAX_CLOSE_REASON_LENGTH]{};
      DWORD length = 0;
      if (WinHttpWebSocketQueryCloseStatus(socket, &code, reason, sizeof(reason), &length) == NO_ERROR) {
        std::lock_guard lock(mutex_);
        close_code_ = code ? code : 1005;
      }
      break;
    }
    if (type == WINHTTP_WEB_SOCKET_UTF8_FRAGMENT_BUFFER_TYPE || type == WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE) {
      if (text.size() < 65536)
        text.append(buffer.data(), read);
      if (type == WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE) {
        handle_text(text);
        text.clear();
      }
    }
    // Binary messages are not expected from the relay: read and dropped.
  }
  std::lock_guard lock(mutex_);
  received_done_ = true;
  wake_.notify_all();
}

void RemoteStream::handle_text(std::string_view message) {
  if (message == "pong")
    return;
  const int watchers = watch_count(message);
  if (watchers < 0)
    return;  // {"t":"key",...} and the rest: not for JPEG pictures
  const int before = watchers_.exchange(watchers);
  if (watchers == 0 && before != 0) {
    std::lock_guard lock(mutex_);
    unwatched_ = true;
    wake_.notify_all();
  }
}

// --- pictures --------------------------------------------------------------------
// A camera's turn: its picture before sent and its interval passed (less a
// little, since pictures come at the bridge's own rate: 200 ms is six at 30 fps).
bool RemoteStream::wants_locked(unsigned cam, std::uint64_t now) const {
  const auto& slot = slots_[cam];
  const auto interval = options_.frame_interval_ms - options_.frame_interval_ms / 16;
  return !slot.full && (!slot.taken || now - slot.taken_ms >= interval);
}
bool RemoteStream::sending() const noexcept {
  return enabled_ && state_.load() == State::connected && watchers_.load() > 0;
}
bool RemoteStream::wants_frame(unsigned cam, std::uint64_t now) {
  if (cam >= Cams || !sending())
    return false;
  std::lock_guard lock(mutex_);
  return wants_locked(cam, now);
}

bool RemoteStream::submit_bgra(unsigned cam,
                               const unsigned char* bgra,
                               unsigned width,
                               unsigned height,
                               std::size_t stride,
                               std::uint64_t now) {
  if (!wants_frame(cam, now))
    return false;
  return store(cam, bgra, width, height, stride, now);
}
bool RemoteStream::store(unsigned cam,
                         const unsigned char* bgra,
                         unsigned width,
                         unsigned height,
                         std::size_t stride,
                         std::uint64_t taken_ms) {
  if (cam >= Cams || !bgra || !width || !height || stride < std::size_t{width} * 4 || !sending())
    return false;
  unsigned out_width = 0, out_height = 0;
  shrink_to_bgr(bgra, width, height, stride, scratch_, out_width, out_height);
  std::lock_guard lock(mutex_);
  auto& slot = slots_[cam];
  if (slot.full)
    return false;
  slot.pixels.swap(scratch_);
  slot.width = out_width;
  slot.height = out_height;
  slot.full = true;
  slot.taken = true;
  slot.taken_ms = taken_ms;
  wake_.notify_all();
  return true;
}

void RemoteStream::maybe_capture(unsigned cam,
                                 ID3D11Device* device,
                                 ID3D11DeviceContext* context,
                                 ID3D11Texture2D* texture,
                                 UINT width,
                                 UINT height,
                                 std::uint64_t now) {
  if (cam >= Cams || !device || !context || !texture || !width || !height)
    return;
  auto& gpu = gpu_[cam];
  if (gpu.staging && (gpu.device != device || gpu.width != width || gpu.height != height)) {
    drop(gpu.staging);
    gpu.pending = false;
  }
  if (gpu.pending) {
    read_copy(cam, context);  // the copy asked for on an earlier picture
    return;
  }
  if (!wants_frame(cam, now))
    return;
  if (!gpu.staging) {
    D3D11_TEXTURE2D_DESC desc{};
    desc.Width = width;
    desc.Height = height;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_STAGING;
    desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    if (FAILED(device->CreateTexture2D(&desc, nullptr, &gpu.staging)))
      return;
    gpu.device = device;
    gpu.width = width;
    gpu.height = height;
  }
  context->CopyResource(gpu.staging, texture);
  context->Flush();
  gpu.pending = true;
  gpu.copied_ms = now;
  std::lock_guard lock(mutex_);
  slots_[cam].taken = true;
  slots_[cam].taken_ms = now;
}

// A copy, once the GPU has made it, into the camera's place.
void RemoteStream::read_copy(unsigned cam, ID3D11DeviceContext* context) {
  auto& gpu = gpu_[cam];
  D3D11_MAPPED_SUBRESOURCE mapped{};
  const HRESULT status = context->Map(gpu.staging, 0, D3D11_MAP_READ, D3D11_MAP_FLAG_DO_NOT_WAIT, &mapped);
  if (status == DXGI_ERROR_WAS_STILL_DRAWING)
    return;
  gpu.pending = false;
  if (SUCCEEDED(status)) {
    // Its turn was taken when it was copied (store drops it when the watchers went since).
    store(cam, static_cast<const unsigned char*>(mapped.pData), gpu.width, gpu.height, mapped.RowPitch, gpu.copied_ms);
    context->Unmap(gpu.staging, 0);
  }
}
void RemoteStream::poll(ID3D11Device* device, ID3D11DeviceContext* context) {
  if (!device || !context)
    return;
  for (unsigned cam = 0; cam < Cams; ++cam)
    if (gpu_[cam].pending && gpu_[cam].staging && gpu_[cam].device == device)
      read_copy(cam, context);
}

void RemoteStream::release_gpu() {
  for (auto& gpu : gpu_) {
    drop(gpu.staging);
    gpu = Gpu{};
  }
}

std::wstring RemoteStream::status_text(std::uint64_t now) {
  if (!rate_ms_ || now - rate_ms_ >= 1000) {
    const auto frames = frames_sent(), bytes = bytes_sent();
    const double seconds = rate_ms_ ? static_cast<double>(now - rate_ms_) / 1000.0 : 0;
    fps_ = seconds > 0 ? static_cast<double>(frames - rate_frames_) / seconds : 0;
    bytes_per_second_ = seconds > 0 ? static_cast<double>(bytes - rate_bytes_) / seconds : 0;
    rate_ms_ = now;
    rate_frames_ = frames;
    rate_bytes_ = bytes;
  }
  switch (state()) {
    case State::off:
      return L"遠端：未開啟";
    case State::no_url:
      return L"遠端：請貼上後台連線連結";
    case State::invalid_url:
      return L"遠端：連線碼格式不正確";
    case State::connecting:
      return L"遠端：連線中…";
    case State::retrying:
      return L"遠端：連線中斷，稍後自動重試…";
    case State::expired:
      return L"遠端：連線碼已失效，請從後台重新複製";
    case State::replaced:
      return L"遠端：已有另一個 Polaris Cam 連線";
    case State::connected:
      break;
  }
  const int watchers = this->watchers();
  if (watchers <= 0)
    return L"遠端：已連線（無人觀看）";
  wchar_t text[128];
  std::swprintf(text, 128, L"遠端：傳送中（%d 人｜JPEG｜%.1f fps｜%.0f KB/s）", watchers, fps_, bytes_per_second_ / 1024.0);
  return text;
}
}  // namespace polaris_cam::remote
