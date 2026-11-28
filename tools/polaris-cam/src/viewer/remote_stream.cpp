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
#include "h264_encoder.hpp"

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

void write_header(unsigned char* out,
                  unsigned cam,
                  Codec codec,
                  bool key,
                  unsigned width,
                  unsigned height,
                  unsigned duration_ms,
                  std::uint32_t seq) noexcept {
  out[0] = 0x50;  // 'P'
  out[1] = 1;     // version
  out[2] = static_cast<unsigned char>(cam);
  out[3] = static_cast<unsigned char>(codec);
  out[4] = codec == Codec::jpeg || key ? 1 : 0;
  out[5] = 0;
  out[6] = static_cast<unsigned char>(width & 0xFF);
  out[7] = static_cast<unsigned char>((width >> 8) & 0xFF);
  out[8] = static_cast<unsigned char>(height & 0xFF);
  out[9] = static_cast<unsigned char>((height >> 8) & 0xFF);
  duration_ms = std::min(duration_ms, 65535u);
  out[10] = static_cast<unsigned char>(duration_ms & 0xFF);
  out[11] = static_cast<unsigned char>((duration_ms >> 8) & 0xFF);
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
  bool any_on = false, on_h264 = false, any_h264 = false;
  for (const auto& cam : cams) {
    any_on = any_on || cam.on;
    on_h264 = on_h264 || (cam.on && cam.codec == Codec::h264);
    any_h264 = any_h264 || cam.codec == Codec::h264;
  }
  const bool h264 = any_on ? on_h264 : any_h264;
  std::string out = "{\"t\":\"hello\",\"v\":\"" POLARIS_CAM_VERSION "\",\"mode\":\"";
  out += h264 ? "h264" : "jpeg";
  out += "\",\"cams\":[";
  for (unsigned i = 0; i < Cams; ++i) {
    const auto& cam = cams[i];
    char sizes[128];
    std::snprintf(sizes, sizeof(sizes), "\",\"on\":%s,\"w\":%u,\"h\":%u,\"codec\":\"%s\"}", cam.on ? "true" : "false", cam.width,
                  cam.height, cam.codec == Codec::h264 ? "h264" : "jpeg");
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
int key_request(std::string_view message) {
  if (json_field(message, "t") != "key")
    return -1;
  const auto n = json_field(message, "cam");
  int value = 0;
  const auto [end, error] = std::from_chars(n.data(), n.data() + n.size(), value);
  if (error != std::errc{} || end != n.data() + n.size() || value < 0 || value >= static_cast<int>(Cams))
    return -1;
  return value;
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
    for (auto& slot : slots_)
      slot.full = false;
    for (auto& queue : queues_)
      queue = Queue{};
    // Each start tries H.264 again (a camera that failed went as JPEG until now).
    h264_failed_ = {};
    h264_available_ = true;
    build_hello_locked();
    hello_dirty_ = !hello_.empty();
  }
  stop_ = false;
  watchers_ = 0;
  set_state(State::connecting);
  worker_ = std::thread([this, endpoint] { run(endpoint); });
  if (options_.prefer_h264)
    for (unsigned cam = 0; cam < Cams; ++cam)
      encoders_[cam] = std::thread([this, cam] { encode_loop(cam); });
}

void RemoteStream::stop() {
  if (!worker_.joinable())
    return;
  const bool connected = state_.load() == State::connected;
  stop_ = true;
  {
    std::unique_lock lock(mutex_);
    wake_.notify_all();
  }
  // Not connected, the worker can only be waiting for WinHTTP (opening the
  // connection, or its answer): cut that at once. Connected, a moment for the
  // goodbye (a close of our own, answered within a round trip); then whatever
  // still waits is cut.
  if (!connected)
    abort_handles();
  {
    std::unique_lock lock(mutex_);
    if (!wake_.wait_for(lock, std::chrono::milliseconds(connected ? 400 : 0), [this] { return finished_; })) {
      lock.unlock();
      abort_handles();
    }
  }
  worker_.join();
  for (auto& encoder : encoders_)
    if (encoder.joinable())
      encoder.join();
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
  std::lock_guard lock(mutex_);
  cams_ = cams;
  build_hello_locked();
}

void RemoteStream::set_adapter(LUID adapter) {
  std::lock_guard lock(mutex_);
  adapter_ = adapter;
  has_adapter_ = adapter.LowPart || adapter.HighPart;
}

// The hello as the cameras are now, each with how it goes; sent again when it changed.
void RemoteStream::build_hello_locked() {
  for (unsigned cam = 0; cam < Cams; ++cam) {
    codecs_[cam] = options_.prefer_h264 && h264_available_ && !h264_failed_[cam] ? Codec::h264 : Codec::jpeg;
    cams_[cam].codec = codecs_[cam];
  }
  bool any = false;
  for (const auto& cam : cams_)
    any = any || cam.on || !cam.name.empty() || cam.width;
  if (!any)
    return;  // not told the cameras yet
  auto hello = hello_json(cams_);
  if (hello == hello_)
    return;
  hello_ = std::move(hello);
  hello_dirty_ = true;
  wake_.notify_all();
}

Codec RemoteStream::codec(unsigned cam) {
  std::lock_guard lock(mutex_);
  return cam < Cams ? codecs_[cam] : Codec::jpeg;
}

void RemoteStream::run(Endpoint endpoint) {
  const HRESULT com = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  // Whether there is a hardware H.264 encoder at all: if not, JPEG from the first hello.
  if (options_.prefer_h264) {
    const bool available = hardware_h264_available();
    std::lock_guard lock(mutex_);
    h264_available_ = available;
    if (!available) {
      h264_.fallback_reason = L"no hardware H.264 encoder";
      ++h264_.fallbacks;
    }
    build_hello_locked();
  }
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
    if (stopping()) {  // stop() cut the handles before this one was there
      WinHttpCloseHandle(session);
      return outcome;
    }
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
    if (!session_) {  // cut meanwhile: these go too
      if (request_)
        WinHttpCloseHandle(request_);
      if (connection_)
        WinHttpCloseHandle(connection_);
      connection_ = request_ = nullptr;
      request = nullptr;
    }
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
    if (socket && !session_) {  // cut meanwhile
      WinHttpCloseHandle(socket);
      socket = nullptr;
    }
    socket_ = socket;
    received_done_ = false;
    unwatched_ = false;
    close_code_ = 0;
    for (auto& slot : slots_)
      slot.full = false;
    restart_h264_locked();
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
    Packet packet;
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
        restart_h264_locked();
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
      // The cameras in turn, so that one cannot keep the others waiting:
      // H.264 from its queue, or a JPEG of its picture.
      unsigned cam = Cams;
      for (unsigned i = 0; i < Cams && watchers_.load() > 0; ++i) {
        const unsigned c = (next_cam + i) % Cams;
        if (!queues_[c].packets.empty() || (slots_[c].full && !slots_[c].bgra)) {
          cam = c;
          break;
        }
      }
      if (cam < Cams) {
        next_cam = (cam + 1) % Cams;
        auto& queue = queues_[cam];
        if (!queue.packets.empty()) {
          packet = std::move(queue.packets.front());
          queue.packets.pop_front();
          queue.bytes -= packet.message.size();
          lock.unlock();
          ok = WinHttpWebSocketSend(socket, WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE, packet.message.data(),
                                    static_cast<DWORD>(packet.message.size())) == NO_ERROR;
          if (ok) {
            frames_sent_.fetch_add(1);
            bytes_sent_.fetch_add(packet.message.size());
            if (packet.key) {
              std::lock_guard again(mutex_);
              ++h264_.keyframes_sent;
            }
          }
          continue;
        }
        auto& slot = slots_[cam];
        pixels.swap(slot.pixels);
        const unsigned width = slot.width, height = slot.height;
        slot.full = false;
        const std::uint32_t seq = ++slot.seq;
        lock.unlock();
        std::size_t size = 0;
        if (jpeg.encode(pixels, width, height, message, size)) {
          write_header(message.data(), cam, Codec::jpeg, true, width, height, options_.frame_interval_ms, seq);
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
    bool closed_by_relay = false, alive = false;
    {
      std::lock_guard lock(mutex_);
      closed_by_relay = received_done_ && close_code_ != 0;
      alive = socket_ == socket;  // not cut by stop()
    }
    if (alive && (ok || closed_by_relay))
      WinHttpWebSocketShutdown(socket, WINHTTP_WEB_SOCKET_SUCCESS_CLOSE_STATUS, nullptr, 0);
    {
      std::unique_lock lock(mutex_);
      wake_.wait_for(lock, std::chrono::milliseconds(stopping() ? 300 : 1000), [this] { return received_done_; });
    }
    abort_handles();  // ends a receiver still waiting
    receiver.join();
    outcome.lasted_ms = ticks() - opened;
    std::lock_guard lock(mutex_);
    outcome.close = close_code_;
  }
  watchers_ = 0;
  {
    std::lock_guard lock(mutex_);
    restart_h264_locked();
    wake_.notify_all();  // the encoders close
  }
  abort_handles();
  return outcome;
}

void RemoteStream::receive(HINTERNET socket) {
  std::string text;
  std::vector<char> buffer(8192);
  // The relay's close code, also when the receive itself failed (a close that
  // came with the connection's end): 4004 and 4000 must not be taken for a drop.
  auto read_close = [&] {
    USHORT code = 0;
    BYTE reason[WINHTTP_WEB_SOCKET_MAX_CLOSE_REASON_LENGTH]{};
    DWORD length = 0;
    if (WinHttpWebSocketQueryCloseStatus(socket, &code, reason, sizeof(reason), &length) == NO_ERROR) {
      std::lock_guard lock(mutex_);
      if (!close_code_)
        close_code_ = code ? code : 1005;
      return true;
    }
    return false;
  };
  for (;;) {
    DWORD read = 0;
    WINHTTP_WEB_SOCKET_BUFFER_TYPE type{};
    if (WinHttpWebSocketReceive(socket, buffer.data(), static_cast<DWORD>(buffer.size()), &read, &type) != NO_ERROR) {
      read_close();
      break;
    }
    heard_ms_ = ticks();
    if (type == WINHTTP_WEB_SOCKET_CLOSE_BUFFER_TYPE) {
      read_close();
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
  if (const int cam = key_request(message); cam >= 0) {
    // A viewer that has just come needs a key picture to start from.
    std::lock_guard lock(mutex_);
    if (codecs_[static_cast<unsigned>(cam)] == Codec::h264) {
      key_wanted_[static_cast<unsigned>(cam)] = true;
      ++h264_.key_requests;
      wake_.notify_all();
    }
    return;
  }
  const int watchers = watch_count(message);
  if (watchers < 0)
    return;
  const int before = watchers_.exchange(watchers);
  if (watchers == 0 && before != 0) {
    std::lock_guard lock(mutex_);
    unwatched_ = true;
    restart_h264_locked();
    wake_.notify_all();
  } else if (watchers > 0 && before == 0) {
    std::lock_guard lock(mutex_);
    wake_.notify_all();
  }
}

// --- H.264 ---------------------------------------------------------------------
// A camera's encoder is open only while it is watched over a connection.
bool RemoteStream::h264_needed_locked(unsigned cam) const {
  return codecs_[cam] == Codec::h264 && state_.load() == State::connected && watchers_.load() > 0 && !unwatched_;
}

// Whatever waits goes, and each camera starts again from a key picture.
void RemoteStream::restart_h264_locked() {
  for (unsigned cam = 0; cam < Cams; ++cam) {
    auto& queue = queues_[cam];
    h264_.frames_dropped += queue.packets.size();
    queue.packets.clear();
    queue.bytes = 0;
    queue.drop_until_key = true;
    key_wanted_[cam] = true;
  }
}

// A picture from the encoder into its camera's queue (or not). Returns true
// when the encoder is to make a key picture at once.
bool RemoteStream::push_locked(unsigned cam, const std::vector<unsigned char>& data, bool key) {
  auto& queue = queues_[cam];
  auto& slot = slots_[cam];
  const std::size_t size = HeaderSize + data.size();
  // Not sent, but counted: the back office sees the gap, and a key picture after it.
  auto skip = [&] {
    ++slot.seq;
    ++h264_.frames_dropped;
  };
  if (queue.drop_until_key && !key) {
    skip();
    return false;
  }
  if (size > MaximumMessage) {
    skip();
    queue.drop_until_key = true;
    ++h264_.key_requests;
    return true;
  }
  if (!queue.packets.empty() && (queue.packets.size() + 1 > options_.queue_frames || queue.bytes + size > options_.queue_bytes)) {
    // The network is not keeping up: what waits is a second old. All of it
    // goes, and the next picture sent is a key picture.
    h264_.frames_dropped += queue.packets.size();
    ++h264_.queue_overflows;
    queue.packets.clear();
    queue.bytes = 0;
    if (!key) {
      skip();
      queue.drop_until_key = true;
      ++h264_.key_requests;
      return true;
    }
  }
  queue.drop_until_key = false;
  Packet packet;
  packet.key = key;
  packet.message.resize(size);
  write_header(packet.message.data(), cam, Codec::h264, key, slot.width_sent, slot.height_sent, options_.h264_interval_ms, ++slot.seq);
  std::memcpy(packet.message.data() + HeaderSize, data.data(), data.size());
  queue.bytes += size;
  queue.packets.push_back(std::move(packet));
  h264_.queue_peak_frames = std::max(h264_.queue_peak_frames, static_cast<unsigned>(queue.packets.size()));
  h264_.queue_peak_bytes = std::max(h264_.queue_peak_bytes, queue.bytes);
  wake_.notify_all();
  return false;
}

// The camera goes as JPEG from now on (until the next start), and the back office is told.
void RemoteStream::fall_back_locked(unsigned cam, const std::wstring& why) {
  if (h264_failed_[cam])
    return;
  h264_failed_[cam] = true;
  ++h264_.fallbacks;
  h264_.fallback_reason = why;
  auto& queue = queues_[cam];
  h264_.frames_dropped += queue.packets.size();
  queue = Queue{};
  slots_[cam].full = false;  // BGRA, not for a JPEG
  build_hello_locked();
  wake_.notify_all();
}

// A camera's own thread: its encoder, opened when needed, its pictures into its queue.
void RemoteStream::encode_loop(unsigned cam) {
  const HRESULT com = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  H264Encoder encoder;
  std::vector<EncodedFrame> outputs;
  std::vector<unsigned char> pixels;
  unsigned in_width = 0, in_height = 0, out_width = 0, out_height = 0;
  LUID used{};
  std::uint64_t encoded = 0;
  bool counted = false;  // in h264_.encoders_open
  auto closed = [&] {   // with the lock held
    if (counted)
      --h264_.encoders_open;
    counted = false;
  };
  for (;;) {
    std::unique_lock lock(mutex_);
    wake_.wait_for(lock, std::chrono::milliseconds(100), [&] {
      return stopping() || (slots_[cam].full && slots_[cam].bgra) || (encoder.is_open() && !h264_needed_locked(cam));
    });
    if (stopping())
      break;
    if (!h264_needed_locked(cam)) {
      if (encoder.is_open()) {
        lock.unlock();
        encoder.close();  // nobody watching, or no connection: no encoder session held
        lock.lock();
      }
      closed();
      continue;
    }
    auto& slot = slots_[cam];
    if (!slot.full || !slot.bgra)
      continue;
    pixels.swap(slot.pixels);
    const unsigned width = slot.width, height = slot.height;
    const std::uint64_t taken_ms = slot.taken_ms;
    slot.full = false;
    const bool has_adapter = has_adapter_;
    const LUID adapter = adapter_;
    const bool key = key_wanted_[cam];
    key_wanted_[cam] = false;
    lock.unlock();

    if (encoder.is_open() && (width != in_width || height != in_height || (has_adapter && (adapter.LowPart != used.LowPart ||
                                                                                          adapter.HighPart != used.HighPart))))
      encoder.close();  // another size, or another card
    if (!encoder.is_open()) {
      {
        std::lock_guard again(mutex_);
        closed();
      }
      EncoderSettings settings;
      settings.in_width = width;
      settings.in_height = height;
      output_size(width, height, out_width, out_height);
      out_width &= ~1u;
      out_height &= ~1u;
      settings.out_width = out_width;
      settings.out_height = out_height;
      settings.fps = std::clamp(1000u / std::max(options_.h264_interval_ms, 1u), 1u, 30u);
      settings.bitrate = options_.h264_bitrate;
      settings.has_adapter = has_adapter;
      settings.adapter = adapter;
      const bool opened = encoder.open(settings);
      lock.lock();
      if (!opened) {
        fall_back_locked(cam, L"H.264: " + encoder.last_error());
        continue;
      }
      ++h264_.encoders_opened;
      ++h264_.encoders_open;
      counted = true;
      h264_.encoder = encoder.description();
      slot.width_sent = out_width;
      slot.height_sent = out_height;
      lock.unlock();
      in_width = width;
      in_height = height;
      used = adapter;
    }
    if (key)
      encoder.request_keyframe();
    outputs.clear();
    bool ok = encoder.encode_bgra(pixels.data(), width, height, std::size_t{width} * 4, taken_ms, outputs);
    ++encoded;
    std::wstring why = encoder.last_error();
    if (ok && options_.fail_h264_after && encoded >= options_.fail_h264_after) {
      ok = false;
      why = L"simulated encoder failure";
      encoder.close();
    }
    lock.lock();
    const auto& stats = encoder.stats();
    ++encode_calls_;
    h264_.encode_ms_max = std::max(h264_.encode_ms_max, stats.call_ms_max);
    if (stats.inputs)
      h264_.encode_ms_average = stats.call_ms_total / static_cast<double>(stats.inputs);
    if (!ok) {
      closed();
      fall_back_locked(cam, L"H.264: " + why);
      continue;
    }
    bool want_key = false;
    for (const auto& frame : outputs)
      want_key = push_locked(cam, frame.data, frame.key) || want_key;
    if (want_key || key_wanted_[cam]) {
      key_wanted_[cam] = false;
      lock.unlock();
      encoder.request_keyframe();
    }
  }
  encoder.close();
  {
    std::lock_guard lock(mutex_);
    closed();
  }
  if (SUCCEEDED(com))
    CoUninitialize();
}

RemoteStream::H264Stats RemoteStream::h264_stats() {
  std::lock_guard lock(mutex_);
  return h264_;
}

// --- pictures --------------------------------------------------------------------
// A camera's turn: its picture before gone on and its time come. Pictures
// come at the bridge's own rate and the window's passes, a few milliseconds
// early or late, so a turn may be taken up to half an interval (at most 20 ms)
// early; but the next turn counts from when this one was due, not from when
// it was taken: on average never more than 30 a second (H.264), or 5 (JPEG),
// and a picture a little late does not lose the next one.
double RemoteStream::interval_locked(unsigned cam) const {
  if (codecs_[cam] != Codec::h264)
    return options_.frame_interval_ms;
  const unsigned fps = std::clamp((1000u + options_.h264_interval_ms / 2) / std::max(options_.h264_interval_ms, 1u), 1u, 30u);
  return 1000.0 / fps;  // 33.3 ms
}
namespace {
double early(double interval) noexcept {
  return std::min(interval / 2, 20.0);
}
}  // namespace
bool RemoteStream::wants_locked(unsigned cam, std::uint64_t now) const {
  const auto& slot = slots_[cam];
  return !slot.full && (!slot.taken || static_cast<double>(now) >= slot.due_ms - early(interval_locked(cam)));
}
void RemoteStream::take_locked(unsigned cam, std::uint64_t now) {
  auto& slot = slots_[cam];
  const double interval = interval_locked(cam), at = static_cast<double>(now);
  // Far behind (no pictures for a while): start over from now.
  slot.due_ms = slot.taken ? std::max(slot.due_ms + interval, at - early(interval)) : at + interval;
  slot.taken = true;
  slot.taken_ms = now;
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
  return store(cam, bgra, width, height, stride, now, true);
}
bool RemoteStream::store(unsigned cam,
                         const unsigned char* bgra,
                         unsigned width,
                         unsigned height,
                         std::size_t stride,
                         std::uint64_t taken_ms,
                         bool take) {
  if (cam >= Cams || !bgra || !width || !height || stride < std::size_t{width} * 4 || !sending())
    return false;
  const bool h264 = codec(cam) == Codec::h264;
  unsigned out_width = 0, out_height = 0;
  if (h264) {
    // As it is: the encoder's video processor makes it smaller.
    const std::size_t row = std::size_t{width} * 4;
    scratch_.resize(row * height);
    for (unsigned y = 0; y < height; ++y)
      std::memcpy(scratch_.data() + row * y, bgra + stride * y, row);
    out_width = width;
    out_height = height;
  } else {
    shrink_to_bgr(bgra, width, height, stride, scratch_, out_width, out_height);
  }
  std::lock_guard lock(mutex_);
  auto& slot = slots_[cam];
  if (slot.full || (codecs_[cam] == Codec::h264) != h264)
    return false;
  slot.pixels.swap(scratch_);
  slot.width = out_width;
  slot.height = out_height;
  slot.bgra = h264;
  slot.full = true;
  if (take)
    take_locked(cam, taken_ms);  // maybe_capture took its turn when it copied
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
    if (gpu.pending)
      return;  // not made yet: this picture is not copied
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
  take_locked(cam, now);
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
    store(cam, static_cast<const unsigned char*>(mapped.pData), gpu.width, gpu.height, mapped.RowPitch, gpu.copied_ms, false);
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
  // How the cameras that are on go: H.264, JPEG, or some of each.
  bool h264 = false, jpeg = false;
  {
    std::lock_guard lock(mutex_);
    bool any_on = false;
    for (const auto& cam : cams_)
      any_on = any_on || cam.on;
    for (unsigned cam = 0; cam < Cams; ++cam) {
      if (any_on && !cams_[cam].on)
        continue;
      (codecs_[cam] == Codec::h264 ? h264 : jpeg) = true;
    }
  }
  const wchar_t* mode = h264 && jpeg ? L"H.264＋JPEG" : h264 ? L"H.264" : L"JPEG";
  const int watchers = this->watchers();
  wchar_t text[128];
  if (watchers <= 0) {
    std::swprintf(text, 128, L"遠端：已連線（無人觀看｜%ls）", mode);
    return text;
  }
  std::swprintf(text, 128, L"遠端：傳送中（%d 人｜%ls｜%.1f fps｜%.0f KB/s）", watchers, mode, fps_, bytes_per_second_ / 1024.0);
  return text;
}
}  // namespace polaris_cam::remote
