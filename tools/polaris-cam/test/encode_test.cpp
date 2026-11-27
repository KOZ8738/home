// Polaris Cam encode test. Run once on a PC to learn whether its graphics card can turn camera
// pictures into H.264 for the staff page fast enough, the way Polaris Cam would do it: a BGRA
// picture on the graphics card, made NV12 by the D3D11 video processor, then the card's own
// Media Foundation H.264 encoder in low-latency mode. It writes a report into a folder of its own
// under encode-test-results next to itself, with the test clips the WebCodecs test page
// (webcodecs_test.html) plays: .pch264 (the encoded frames
// with a header that describes the test picture) and .h264 (the same frames as plain Annex B).
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the rest of Polaris Cam.
#include <windows.h>
#include <initguid.h>
#include <d3d10.h>
#include <d3d11_1.h>
#include <mfapi.h>
#include <mferror.h>
#include <mfidl.h>
#include <mftransform.h>
#include <codecapi.h>
#include <icodecapi.h>
#include <mmsystem.h>
#include <wrl/client.h>
#include <algorithm>
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <utility>
#include <vector>
#include "../src/shared/broadcast_link.hpp"

namespace {
using Microsoft::WRL::ComPtr;

constexpr int Fps = 30;
constexpr int Gop = 60;        // a key frame every two seconds
constexpr int ForcedKey = 90;  // also asked for at frame 90, as a viewer joining would
constexpr int SourceWidth = 1920, SourceHeight = 1080;
constexpr LONGLONG Second = 10'000'000;  // Media Foundation time is in 100 ns
constexpr int PoolSize = 8;              // NV12 pictures per encoder, used in turn

// ---- what the test says ----
FILE* report_file = nullptr;

std::wstring wide(const std::string& text) {
  if (text.empty())
    return {};
  const int n = MultiByteToWideChar(CP_UTF8, 0, text.data(), int(text.size()), nullptr, 0);
  std::wstring out(std::size_t(std::max(n, 0)), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, text.data(), int(text.size()), out.data(), n);
  return out;
}
std::string utf8(const std::wstring& text) {
  if (text.empty())
    return {};
  const int n = WideCharToMultiByte(CP_UTF8, 0, text.data(), int(text.size()), nullptr, 0, nullptr, nullptr);
  std::string out(std::size_t(std::max(n, 0)), '\0');
  WideCharToMultiByte(CP_UTF8, 0, text.data(), int(text.size()), out.data(), n, nullptr, nullptr);
  return out;
}

__attribute__((format(printf, 1, 2))) std::string format(const char* pattern, ...) {
  char buffer[2048];
  va_list args;
  va_start(args, pattern);
  const int n = std::vsnprintf(buffer, sizeof(buffer), pattern, args);
  va_end(args);
  if (n < 0)
    return {};
  if (std::size_t(n) < sizeof(buffer))
    return std::string(buffer, std::size_t(n));
  std::string out(std::size_t(n) + 1, '\0');
  va_start(args, pattern);
  std::vsnprintf(out.data(), out.size(), pattern, args);
  va_end(args);
  out.resize(std::size_t(n));
  return out;
}

void to_report(const std::string& line) {
  if (!report_file)
    return;
  std::fputs(line.c_str(), report_file);
  std::fputs("\r\n", report_file);
  std::fflush(report_file);
}
// Shown in the window and kept in the report.
void say(const std::string& line) {
  to_report(line);
  const std::wstring text = wide(line + "\n");
  DWORD written = 0;
  const HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE);
  if (!WriteConsoleW(out, text.data(), DWORD(text.size()), &written, nullptr)) {
    const std::string bytes = line + "\n";
    WriteFile(out, bytes.data(), DWORD(bytes.size()), &written, nullptr);
  }
}
// Details only the report keeps.
void note(const std::string& line) { to_report("    " + line); }

std::string hr_text(HRESULT hr) {
  if (hr == S_OK)
    return "ok";
  static const std::pair<HRESULT, const char*> names[]{
      {MF_E_INVALIDMEDIATYPE, "MF_E_INVALIDMEDIATYPE"},
      {MF_E_INVALIDTYPE, "MF_E_INVALIDTYPE"},
      {MF_E_TRANSFORM_TYPE_NOT_SET, "MF_E_TRANSFORM_TYPE_NOT_SET"},
      {MF_E_UNSUPPORTED_D3D_TYPE, "MF_E_UNSUPPORTED_D3D_TYPE"},
      {MF_E_TRANSFORM_ASYNC_LOCKED, "MF_E_TRANSFORM_ASYNC_LOCKED"},
      {MF_E_HW_MFT_FAILED_START_STREAMING, "MF_E_HW_MFT_FAILED_START_STREAMING"},
      {MF_E_NOTACCEPTING, "MF_E_NOTACCEPTING"},
      {MF_E_ATTRIBUTENOTFOUND, "MF_E_ATTRIBUTENOTFOUND"},
      {MF_E_NO_MORE_TYPES, "MF_E_NO_MORE_TYPES"},
      {MF_E_UNEXPECTED, "MF_E_UNEXPECTED"},
      {MF_E_SHUTDOWN, "MF_E_SHUTDOWN"},
      {E_NOTIMPL, "E_NOTIMPL"},
      {E_INVALIDARG, "E_INVALIDARG"},
      {E_NOINTERFACE, "E_NOINTERFACE"},
      {E_OUTOFMEMORY, "E_OUTOFMEMORY"},
      {E_FAIL, "E_FAIL"},
      {DXGI_ERROR_UNSUPPORTED, "DXGI_ERROR_UNSUPPORTED"},
      {S_FALSE, "S_FALSE"},
  };
  std::string text = format("0x%08lX", static_cast<unsigned long>(hr));
  for (const auto& [code, name] : names)
    if (code == hr)
      return text + " " + name;
  wchar_t* message = nullptr;
  if (FormatMessageW(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, nullptr,
                     DWORD(hr), 0, reinterpret_cast<LPWSTR>(&message), 0, nullptr) &&
      message) {
    std::wstring words = message;
    LocalFree(message);
    while (!words.empty() && (words.back() == L'\n' || words.back() == L'\r' || words.back() == L' ' || words.back() == L'.'))
      words.pop_back();
    if (!words.empty())
      text += " " + utf8(words);
  }
  return text;
}

double now_ms() {
  static const double scale = [] {
    LARGE_INTEGER frequency{};
    QueryPerformanceFrequency(&frequency);
    return 1000.0 / double(frequency.QuadPart);
  }();
  LARGE_INTEGER counter{};
  QueryPerformanceCounter(&counter);
  return double(counter.QuadPart) * scale;
}

std::string windows_text() {
  using RtlGetVersion = LONG(WINAPI*)(OSVERSIONINFOW*);
  OSVERSIONINFOW version{};
  version.dwOSVersionInfoSize = sizeof(version);
  const auto ntdll = GetModuleHandleW(L"ntdll.dll");
  const auto get = ntdll ? reinterpret_cast<RtlGetVersion>(reinterpret_cast<void*>(GetProcAddress(ntdll, "RtlGetVersion"))) : nullptr;
  if (!get || get(&version) != 0)
    return "Windows（版本不明）";
  return format("Windows %s（build %lu）", version.dwBuildNumber >= 22000 ? "11" : "10", version.dwBuildNumber);
}

// NVIDIA's user-mode driver 32.0.15.6094 is the 560.94 release.
std::string driver_text(UINT vendor, LARGE_INTEGER umd) {
  const auto v = static_cast<std::uint64_t>(umd.QuadPart);
  const unsigned parts[]{unsigned(v >> 48), unsigned(v >> 32 & 0xFFFF), unsigned(v >> 16 & 0xFFFF), unsigned(v & 0xFFFF)};
  const std::string text = format("%u.%u.%u.%u", parts[0], parts[1], parts[2], parts[3]);
  if (vendor != 0x10DE || parts[3] > 9999)
    return text;
  const unsigned release = parts[2] % 10 * 10000 + parts[3];
  return format("%u.%02u", release / 100, release % 100);
}

// ---- the test picture ----
// Everything is placed in fractions of the picture, so the page finds it at any size: colour
// patches to check the colours, a black-to-white strip for the range, a bar that moves, and the
// frame number as 12 black or white cells (most significant first).
struct Area {
  float x, y, w, h;
};
struct Patch {
  const char* name;
  Area area;
  int r, g, b;
};
constexpr int Background[3]{24, 28, 36};
constexpr Patch Patches[]{
    {"white", {0.04f, 0.06f, 0.10f, 0.18f}, 255, 255, 255}, {"black", {0.16f, 0.06f, 0.10f, 0.18f}, 0, 0, 0},
    {"gray", {0.28f, 0.06f, 0.10f, 0.18f}, 128, 128, 128},  {"red", {0.40f, 0.06f, 0.10f, 0.18f}, 230, 30, 30},
    {"green", {0.52f, 0.06f, 0.10f, 0.18f}, 30, 200, 60},   {"blue", {0.64f, 0.06f, 0.10f, 0.18f}, 30, 60, 230},
    {"yellow", {0.76f, 0.06f, 0.10f, 0.18f}, 240, 200, 40}, {"sky", {0.88f, 0.06f, 0.10f, 0.18f}, 120, 170, 230},
};
constexpr Area Gradient{0.04f, 0.32f, 0.92f, 0.08f};
constexpr Area BarLane{0.04f, 0.50f, 0.92f, 0.14f};
constexpr float BarWidth = 0.02f, BarStep = 0.008f;
constexpr Area Counter{0.04f, 0.80f, 0.48f, 0.0711f};
constexpr int CounterBits = 12;

struct Rect {
  int left, top, right, bottom;
};
Rect pixels(const Area& a, int width, int height) {
  return {int(std::lround(a.x * float(width))), int(std::lround(a.y * float(height))), int(std::lround((a.x + a.w) * float(width))),
          int(std::lround((a.y + a.h) * float(height)))};
}
Area bar_area(int frame) {
  const float x = BarLane.x + std::fmod(float(frame) * BarStep, BarLane.w - BarWidth);
  return {x, BarLane.y, BarWidth, BarLane.h};
}
Area counter_cell(int bit) {
  return {Counter.x + Counter.w * float(bit) / float(CounterBits), Counter.y, Counter.w / float(CounterBits), Counter.h};
}
constexpr std::uint32_t bgra(int r, int g, int b) {
  return 0xFF000000u | std::uint32_t(r) << 16 | std::uint32_t(g) << 8 | std::uint32_t(b);
}

class Pattern {
 public:
  Pattern(int width, int height)
      : width_(width), height_(height), base_(std::size_t(width) * std::size_t(height), bgra(Background[0], Background[1], Background[2])) {
    for (const auto& patch : Patches)
      fill(base_, pixels(patch.area, width, height), bgra(patch.r, patch.g, patch.b));
    const Rect strip = pixels(Gradient, width, height);
    const int span = std::max(1, strip.right - strip.left - 1);
    for (int x = strip.left; x < strip.right; ++x) {
      const int v = int(std::lround(255.0 * double(x - strip.left) / double(span)));
      fill(base_, {x, strip.top, x + 1, strip.bottom}, bgra(v, v, v));
    }
    picture_ = base_;
  }
  // Draws frame n over the one before it, and notes which parts changed.
  void frame(int n) {
    dirty_.clear();
    if (bar_.right > bar_.left) {
      for (int y = bar_.top; y < bar_.bottom; ++y)
        std::copy(base_.begin() + offset(bar_.left, y), base_.begin() + offset(bar_.right, y), picture_.begin() + offset(bar_.left, y));
      dirty_.push_back(bar_);
    }
    bar_ = pixels(bar_area(n), width_, height_);
    fill(picture_, bar_, bgra(255, 255, 255));
    dirty_.push_back(bar_);
    const int value = n % (1 << CounterBits);
    Rect cells{width_, height_, 0, 0};
    for (int bit = 0; bit < CounterBits; ++bit) {
      const Rect cell = pixels(counter_cell(bit), width_, height_);
      const bool on = (value >> (CounterBits - 1 - bit) & 1) != 0;
      fill(picture_, cell, on ? bgra(255, 255, 255) : bgra(0, 0, 0));
      cells = {std::min(cells.left, cell.left), std::min(cells.top, cell.top), std::max(cells.right, cell.right),
               std::max(cells.bottom, cell.bottom)};
    }
    dirty_.push_back(cells);
  }
  void upload(ID3D11DeviceContext* context, ID3D11Texture2D* texture, bool everything) const {
    const UINT pitch = UINT(width_) * 4;
    if (everything) {
      context->UpdateSubresource(texture, 0, nullptr, picture_.data(), pitch, 0);
      return;
    }
    for (const Rect& r : dirty_) {
      if (r.right <= r.left || r.bottom <= r.top)
        continue;
      const D3D11_BOX box{UINT(r.left), UINT(r.top), 0, UINT(r.right), UINT(r.bottom), 1};
      context->UpdateSubresource(texture, 0, &box, picture_.data() + offset(r.left, r.top), pitch, 0);
    }
  }

 private:
  std::size_t offset(int x, int y) const { return std::size_t(y) * std::size_t(width_) + std::size_t(x); }
  void fill(std::vector<std::uint32_t>& image, Rect r, std::uint32_t colour) const {
    r = {std::clamp(r.left, 0, width_), std::clamp(r.top, 0, height_), std::clamp(r.right, 0, width_), std::clamp(r.bottom, 0, height_)};
    for (int y = r.top; y < r.bottom; ++y)
      std::fill(image.begin() + offset(r.left, y), image.begin() + offset(r.right, y), colour);
  }
  int width_, height_;
  std::vector<std::uint32_t> base_, picture_;
  std::vector<Rect> dirty_;
  Rect bar_{0, 0, 0, 0};
};

std::string json_text(const std::string& text) {
  std::string out = "\"";
  for (const unsigned char c : text) {
    if (c == '"' || c == '\\')
      out += {'\\', char(c)};
    else if (c < 0x20)
      out += format("\\u%04x", c);
    else
      out += char(c);
  }
  return out + "\"";
}
std::string area_json(const Area& a) {
  return format("\"x\":%.4f,\"y\":%.4f,\"w\":%.4f,\"h\":%.4f", double(a.x), double(a.y), double(a.w), double(a.h));
}
std::string pattern_json() {
  std::string out = format("{\"background\":[%d,%d,%d],\"patches\":[", Background[0], Background[1], Background[2]);
  bool first = true;
  for (const auto& p : Patches) {
    out += format("%s{\"name\":\"%s\",%s,\"rgb\":[%d,%d,%d]}", first ? "" : ",", p.name, area_json(p.area).c_str(), p.r, p.g, p.b);
    first = false;
  }
  out += "],\"gradient\":{" + area_json(Gradient) + "},\"bar\":{" + area_json(BarLane) +
         format(",\"width\":%.4f,\"step\":%.4f}", double(BarWidth), double(BarStep)) + ",\"counter\":{" + area_json(Counter) +
         format(",\"bits\":%d}}", CounterBits);
  return out;
}
std::string base64(const std::vector<std::uint8_t>& bytes) {
  static const char digits[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  for (std::size_t i = 0; i < bytes.size(); i += 3) {
    const std::uint32_t chunk = std::uint32_t(bytes[i]) << 16 | (i + 1 < bytes.size() ? std::uint32_t(bytes[i + 1]) << 8 : 0) |
                                (i + 2 < bytes.size() ? std::uint32_t(bytes[i + 2]) : 0);
    out += digits[chunk >> 18 & 63];
    out += digits[chunk >> 12 & 63];
    out += i + 1 < bytes.size() ? digits[chunk >> 6 & 63] : '=';
    out += i + 2 < bytes.size() ? digits[chunk & 63] : '=';
  }
  return out;
}

// ---- H.264 ----
struct Nals {
  bool idr = false, sps = false, pps = false, slice = false;
  std::vector<std::uint8_t> first_sps;
};
Nals scan(const std::vector<std::uint8_t>& d) {
  std::vector<std::pair<std::size_t, std::size_t>> codes;  // start code position and length
  for (std::size_t p = 0; p + 3 <= d.size();) {
    if (d[p] == 0 && d[p + 1] == 0 && d[p + 2] == 1) {
      codes.push_back({p, 3});
      p += 3;
    } else if (p + 4 <= d.size() && d[p] == 0 && d[p + 1] == 0 && d[p + 2] == 0 && d[p + 3] == 1) {
      codes.push_back({p, 4});
      p += 4;
    } else {
      ++p;
    }
  }
  Nals out;
  for (std::size_t k = 0; k < codes.size(); ++k) {
    const std::size_t begin = codes[k].first + codes[k].second, end = k + 1 < codes.size() ? codes[k + 1].first : d.size();
    if (begin >= end)
      continue;
    const int type = d[begin] & 0x1F;
    out.slice |= type >= 1 && type <= 5;
    out.idr |= type == 5;
    out.pps |= type == 8;
    if (type == 7) {
      out.sps = true;
      if (out.first_sps.empty())
        out.first_sps.assign(d.begin() + std::ptrdiff_t(begin), d.begin() + std::ptrdiff_t(end));
    }
  }
  return out;
}

// ---- the graphics card ----
struct Gpu {
  ComPtr<IDXGIAdapter1> adapter;
  std::string name, driver;
  UINT vendor = 0;
  unsigned long long memory = 0;
};
std::vector<Gpu> list_gpus() {
  std::vector<Gpu> out;
  ComPtr<IDXGIFactory1> factory;
  if (FAILED(CreateDXGIFactory1(IID_PPV_ARGS(&factory))))
    return out;
  for (UINT i = 0; i < 16; ++i) {
    ComPtr<IDXGIAdapter1> adapter;
    if (factory->EnumAdapters1(i, &adapter) == DXGI_ERROR_NOT_FOUND)
      break;
    DXGI_ADAPTER_DESC1 desc{};
    if (!adapter || FAILED(adapter->GetDesc1(&desc)) || (desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE) || desc.VendorId == 0x1414)
      continue;
    Gpu gpu;
    gpu.adapter = adapter;
    gpu.name = utf8(desc.Description);
    gpu.vendor = desc.VendorId;
    gpu.memory = desc.DedicatedVideoMemory;
    LARGE_INTEGER umd{};
    if (SUCCEEDED(adapter->CheckInterfaceSupport(__uuidof(IDXGIDevice), &umd)))
      gpu.driver = driver_text(desc.VendorId, umd);
    out.push_back(gpu);
  }
  return out;
}

struct Graphics {
  ComPtr<ID3D11Device> device;
  ComPtr<ID3D11DeviceContext> context;
  ComPtr<ID3D11VideoDevice> video;
  ComPtr<ID3D11VideoContext> video_context;
  ComPtr<ID3D11VideoContext1> video_context1;
  ComPtr<IMFDXGIDeviceManager> manager;
  ComPtr<ID3D11Texture2D> source;  // the test picture, BGRA like Polaris Cam's camera pictures
};

bool open_graphics(Graphics& g, IDXGIAdapter1* adapter) {
  const D3D_FEATURE_LEVEL levels[]{D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0};
  D3D_FEATURE_LEVEL level{};
  HRESULT hr = D3D11CreateDevice(adapter, D3D_DRIVER_TYPE_UNKNOWN, nullptr, D3D11_CREATE_DEVICE_VIDEO_SUPPORT | D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                                 levels, UINT(std::size(levels)), D3D11_SDK_VERSION, &g.device, &level, &g.context);
  if (FAILED(hr)) {
    say("開不了 D3D11（D3D11CreateDevice）：" + hr_text(hr));
    return false;
  }
  ComPtr<ID3D10Multithread> multithread;
  if (SUCCEEDED(g.device.As(&multithread)))
    multithread->SetMultithreadProtected(TRUE);
  else
    note("沒有 ID3D10Multithread");
  if (FAILED(hr = g.device.As(&g.video)) || FAILED(hr = g.context.As(&g.video_context))) {
    say("這張顯示卡的 D3D11 沒有影片功能（ID3D11VideoDevice）：" + hr_text(hr));
    return false;
  }
  if (FAILED(g.context.As(&g.video_context1)))
    note("沒有 ID3D11VideoContext1，顏色空間用舊的設定方式");
  UINT token = 0;
  if (FAILED(hr = MFCreateDXGIDeviceManager(&token, &g.manager)) || FAILED(hr = g.manager->ResetDevice(g.device.Get(), token))) {
    say("開不了 Media Foundation 的顯示卡管理（MFCreateDXGIDeviceManager）：" + hr_text(hr));
    return false;
  }
  D3D11_TEXTURE2D_DESC desc{};
  desc.Width = SourceWidth;
  desc.Height = SourceHeight;
  desc.MipLevels = 1;
  desc.ArraySize = 1;
  desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
  desc.SampleDesc.Count = 1;
  desc.Usage = D3D11_USAGE_DEFAULT;
  desc.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
  if (FAILED(hr = g.device->CreateTexture2D(&desc, nullptr, &g.source))) {
    say("開不了測試畫面（CreateTexture2D）：" + hr_text(hr));
    return false;
  }
  note(format("D3D11 feature level %x", unsigned(level)));
  return true;
}

// ---- the encoders ----
struct EncoderName {
  std::string name, vendor;
};
std::string attribute_text(IMFAttributes* attributes, const GUID& key) {
  UINT32 length = 0;
  if (FAILED(attributes->GetStringLength(key, &length)))
    return {};
  std::wstring text(std::size_t(length) + 1, L'\0');
  if (FAILED(attributes->GetString(key, text.data(), length + 1, &length)))
    return {};
  text.resize(length);
  return utf8(text);
}
std::vector<ComPtr<IMFActivate>> hardware_encoders(HRESULT* result) {
  MFT_REGISTER_TYPE_INFO output{MFMediaType_Video, MFVideoFormat_H264};
  IMFActivate** list = nullptr;
  UINT32 count = 0;
  const HRESULT hr =
      MFTEnumEx(MFT_CATEGORY_VIDEO_ENCODER, MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER, nullptr, &output, &list, &count);
  if (result)
    *result = hr;
  std::vector<ComPtr<IMFActivate>> out;
  if (SUCCEEDED(hr) && list) {
    for (UINT32 i = 0; i < count; ++i) {
      ComPtr<IMFActivate> activate;
      activate.Attach(list[i]);
      out.push_back(activate);
    }
    CoTaskMemFree(list);
  }
  return out;
}
EncoderName describe(IMFActivate* activate) {
  return {attribute_text(activate, MFT_FRIENDLY_NAME_Attribute), attribute_text(activate, MFT_ENUM_HARDWARE_VENDOR_ID_Attribute)};
}
std::string fourcc(const GUID& subtype) {
  std::string out;
  for (int i = 0; i < 4; ++i) {
    const char c = char(subtype.Data1 >> (8 * i) & 0xFF);
    out += c >= 32 && c < 127 ? c : '?';
  }
  return out;
}

struct Converter {
  ComPtr<ID3D11VideoProcessorEnumerator> enumerator;
  ComPtr<ID3D11VideoProcessor> processor;
  ComPtr<ID3D11VideoProcessorInputView> input;
};

bool open_converter(Graphics& g, Converter& c, int width, int height, std::string& why) {
  D3D11_VIDEO_PROCESSOR_CONTENT_DESC content{};
  content.InputFrameFormat = D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE;
  content.InputFrameRate = {Fps, 1};
  content.InputWidth = SourceWidth;
  content.InputHeight = SourceHeight;
  content.OutputFrameRate = {Fps, 1};
  content.OutputWidth = UINT(width);
  content.OutputHeight = UINT(height);
  content.Usage = D3D11_VIDEO_USAGE_OPTIMAL_SPEED;
  HRESULT hr = g.video->CreateVideoProcessorEnumerator(&content, &c.enumerator);
  if (FAILED(hr)) {
    why = "CreateVideoProcessorEnumerator " + hr_text(hr);
    return false;
  }
  UINT flags = 0;
  if (FAILED(c.enumerator->CheckVideoProcessorFormat(DXGI_FORMAT_B8G8R8A8_UNORM, &flags)) || !(flags & D3D11_VIDEO_PROCESSOR_FORMAT_SUPPORT_INPUT)) {
    why = "轉換器不收 BGRA";
    return false;
  }
  flags = 0;
  if (FAILED(c.enumerator->CheckVideoProcessorFormat(DXGI_FORMAT_NV12, &flags)) || !(flags & D3D11_VIDEO_PROCESSOR_FORMAT_SUPPORT_OUTPUT)) {
    why = "轉換器不出 NV12";
    return false;
  }
  ComPtr<ID3D11VideoProcessorEnumerator1> enumerator1;
  BOOL supported = FALSE;
  if (SUCCEEDED(c.enumerator.As(&enumerator1)) &&
      SUCCEEDED(enumerator1->CheckVideoProcessorFormatConversion(DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709, DXGI_FORMAT_NV12,
                                                                 DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709, &supported)))
    note(format("BGRA 全範圍 → NV12 BT.709 有限範圍：%s", supported ? "支援" : "不支援"));
  if (FAILED(hr = g.video->CreateVideoProcessor(c.enumerator.Get(), 0, &c.processor))) {
    why = "CreateVideoProcessor " + hr_text(hr);
    return false;
  }
  D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC input{};
  input.ViewDimension = D3D11_VPIV_DIMENSION_TEXTURE2D;
  if (FAILED(hr = g.video->CreateVideoProcessorInputView(g.source.Get(), c.enumerator.Get(), &input, &c.input))) {
    why = "CreateVideoProcessorInputView " + hr_text(hr);
    return false;
  }
  ID3D11VideoContext* vc = g.video_context.Get();
  ID3D11VideoProcessor* vp = c.processor.Get();
  const RECT whole{0, 0, SourceWidth, SourceHeight}, target{0, 0, width, height};
  vc->VideoProcessorSetStreamFrameFormat(vp, 0, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE);
  vc->VideoProcessorSetStreamSourceRect(vp, 0, TRUE, &whole);
  vc->VideoProcessorSetStreamDestRect(vp, 0, TRUE, &target);
  vc->VideoProcessorSetOutputTargetRect(vp, TRUE, &target);
  vc->VideoProcessorSetStreamAutoProcessingMode(vp, 0, FALSE);
  if (g.video_context1) {
    g.video_context1->VideoProcessorSetStreamColorSpace1(vp, 0, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709);
    g.video_context1->VideoProcessorSetOutputColorSpace1(vp, DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709);
  } else {
    D3D11_VIDEO_PROCESSOR_COLOR_SPACE in{}, out{};
    in.YCbCr_Matrix = 1;
    in.Nominal_Range = D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_0_255;
    out.YCbCr_Matrix = 1;
    out.Nominal_Range = D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_16_235;
    vc->VideoProcessorSetStreamColorSpace(vp, 0, &in);
    vc->VideoProcessorSetOutputColorSpace(vp, &out);
  }
  return true;
}

struct Output {
  int index = 0;
  bool key = false, headers = false;
  LONGLONG time = 0;
  double latency = -1;
  std::vector<std::uint8_t> data;
};

struct Stream {
  int number = 1, width = 0, height = 0, bitrate = 0;
  std::string tag;
  ComPtr<IMFActivate> activate;
  ComPtr<IMFTransform> encoder;
  ComPtr<IMFMediaEventGenerator> events;
  ComPtr<ICodecAPI> codec_api;
  DWORD input_id = 0, output_id = 0, sample_size = 0;
  bool provides_samples = true;
  Converter converter;
  std::vector<ComPtr<ID3D11Texture2D>> pool;
  std::vector<ComPtr<ID3D11VideoProcessorOutputView>> views;
  int wanted = 0;  // METransformNeedInput not answered yet
  bool drained = false, failed = false;
  std::string failure, codec, settings, offered;
  std::vector<double> sent;  // when each frame went in, < 0 if it did not
  std::vector<Output> outputs;
  std::vector<std::uint8_t> sequence_header, prefix;  // prefix: parameter sets that came out on their own
  int dropped = 0, errors = 0, renumbered = 0, clean_points = 0, prefixes = 0;
  HRESULT forced_key = E_NOTIMPL;
  double first_in = -1, last_out = -1;
};

bool fail(Stream& s, const std::string& why) {
  if (!s.failed)
    say(s.tag + " 失敗：" + why);
  s.failed = true;
  if (s.failure.empty())
    s.failure = why;
  return false;
}

void configure(Stream& s, bool typed) {
  if (!s.codec_api)
    return;
  struct Setting {
    const char* name;
    const GUID* key;
    VARTYPE type;
    UINT32 value;
  };
  const Setting settings[]{
      {"低延遲", &CODECAPI_AVLowLatencyMode, VT_BOOL, 1},
      {"固定碼率", &CODECAPI_AVEncCommonRateControlMode, VT_UI4, UINT32(eAVEncCommonRateControlMode_CBR)},
      {"碼率", &CODECAPI_AVEncCommonMeanBitRate, VT_UI4, UINT32(s.bitrate)},
      {"關鍵格間隔", &CODECAPI_AVEncMPVGOPSize, VT_UI4, UINT32(Gop)},
      {"不用B格", &CODECAPI_AVEncMPVDefaultBPictureCount, VT_UI4, 0},
  };
  std::string line;
  for (const Setting& setting : settings) {
    VARIANT value{};
    value.vt = setting.type;
    if (setting.type == VT_BOOL)
      value.boolVal = setting.value ? VARIANT_TRUE : VARIANT_FALSE;
    else
      value.ulVal = setting.value;
    const HRESULT hr = s.codec_api->SetValue(setting.key, &value);
    line += format(" %s=%s", setting.name, SUCCEEDED(hr) ? "ok" : hr_text(hr).c_str());
  }
  note(s.tag + (typed ? " 設定（格式定好後）:" : " 設定（格式定好前）:") + line);
  if (typed)
    s.settings = line;
}

bool open_stream(Stream& s, Graphics& g, const EncoderName& choice) {
  HRESULT hr = S_OK;
  for (auto& activate : hardware_encoders(&hr)) {
    const EncoderName name = describe(activate.Get());
    if (name.name == choice.name && name.vendor == choice.vendor) {
      s.activate = activate;
      break;
    }
  }
  if (!s.activate)
    return fail(s, "找不到編碼器 " + choice.name);
  if (FAILED(hr = s.activate->ActivateObject(IID_PPV_ARGS(&s.encoder))))
    return fail(s, "啟動編碼器（ActivateObject）" + hr_text(hr));
  ComPtr<IMFAttributes> attributes;
  if (FAILED(hr = s.encoder->GetAttributes(&attributes)) || !attributes)
    return fail(s, "GetAttributes " + hr_text(hr));
  const bool async = MFGetAttributeUINT32(attributes.Get(), MF_TRANSFORM_ASYNC, FALSE) != 0;
  const bool d3d11 = MFGetAttributeUINT32(attributes.Get(), MF_SA_D3D11_AWARE, FALSE) != 0;
  note(s.tag + format(" 非同步=%d D3D11=%d", int(async), int(d3d11)));
  if (!async)
    return fail(s, "這不是非同步的硬體編碼器");
  if (FAILED(hr = attributes->SetUINT32(MF_TRANSFORM_ASYNC_UNLOCK, TRUE)))
    return fail(s, "MF_TRANSFORM_ASYNC_UNLOCK " + hr_text(hr));
  note(s.tag + " MF_LOW_LATENCY " + hr_text(attributes->SetUINT32(MF_LOW_LATENCY, TRUE)));
  if (!d3d11)
    return fail(s, "編碼器不收顯示卡上的畫面（沒有 MF_SA_D3D11_AWARE）");
  if (FAILED(hr = s.encoder->ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, reinterpret_cast<ULONG_PTR>(g.manager.Get()))))
    return fail(s, "MFT_MESSAGE_SET_D3D_MANAGER " + hr_text(hr));
  if (FAILED(hr = s.encoder.As(&s.events)))
    return fail(s, "IMFMediaEventGenerator " + hr_text(hr));
  if (FAILED(s.encoder.As(&s.codec_api)))
    note(s.tag + " 沒有 ICodecAPI");
  hr = s.encoder->GetStreamIDs(1, &s.input_id, 1, &s.output_id);
  if (hr == E_NOTIMPL)
    s.input_id = s.output_id = 0;
  else if (FAILED(hr))
    return fail(s, "GetStreamIDs " + hr_text(hr));
  configure(s, false);

  // The H.264 side first, as encoders want.
  ComPtr<IMFMediaType> output;
  if (FAILED(hr = MFCreateMediaType(&output)))
    return fail(s, "MFCreateMediaType " + hr_text(hr));
  output->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
  output->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_H264);
  output->SetUINT32(MF_MT_AVG_BITRATE, UINT32(s.bitrate));
  MFSetAttributeSize(output.Get(), MF_MT_FRAME_SIZE, UINT32(s.width), UINT32(s.height));
  MFSetAttributeRatio(output.Get(), MF_MT_FRAME_RATE, Fps, 1);
  MFSetAttributeRatio(output.Get(), MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
  output->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
  output->SetUINT32(MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_High);
  output->SetUINT32(MF_MT_VIDEO_NOMINAL_RANGE, MFNominalRange_16_235);
  output->SetUINT32(MF_MT_YUV_MATRIX, MFVideoTransferMatrix_BT709);
  output->SetUINT32(MF_MT_VIDEO_PRIMARIES, MFVideoPrimaries_BT709);
  output->SetUINT32(MF_MT_TRANSFER_FUNCTION, MFVideoTransFunc_709);
  if (FAILED(hr = s.encoder->SetOutputType(s.output_id, output.Get(), 0))) {
    note(s.tag + " 完整的 H.264 輸出設定不收：" + hr_text(hr) + "，拿掉顏色標示再試");
    for (const GUID* key : {&MF_MT_VIDEO_NOMINAL_RANGE, &MF_MT_YUV_MATRIX, &MF_MT_VIDEO_PRIMARIES, &MF_MT_TRANSFER_FUNCTION})
      output->DeleteItem(*key);
    if (FAILED(hr = s.encoder->SetOutputType(s.output_id, output.Get(), 0))) {
      note(s.tag + " 還是不收：" + hr_text(hr) + "，再拿掉 High profile");
      output->DeleteItem(MF_MT_MPEG2_PROFILE);
      if (FAILED(hr = s.encoder->SetOutputType(s.output_id, output.Get(), 0)))
        return fail(s, "設定 H.264 輸出（SetOutputType）" + hr_text(hr));
    }
  }

  // NV12 in, from the types it offers.
  ComPtr<IMFMediaType> input;
  for (DWORD i = 0; i < 64; ++i) {
    ComPtr<IMFMediaType> type;
    if (FAILED(s.encoder->GetInputAvailableType(s.input_id, i, &type)))
      break;
    GUID subtype{};
    type->GetGUID(MF_MT_SUBTYPE, &subtype);
    s.offered += (s.offered.empty() ? "" : " ") + fourcc(subtype);
    if (subtype == MFVideoFormat_NV12 && !input)
      input = type;
  }
  note(s.tag + " 編碼器收的格式：" + (s.offered.empty() ? "（沒列出）" : s.offered));
  if (!input) {
    if (FAILED(hr = MFCreateMediaType(&input)))
      return fail(s, "MFCreateMediaType " + hr_text(hr));
    input->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    input->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_NV12);
  }
  MFSetAttributeSize(input.Get(), MF_MT_FRAME_SIZE, UINT32(s.width), UINT32(s.height));
  MFSetAttributeRatio(input.Get(), MF_MT_FRAME_RATE, Fps, 1);
  MFSetAttributeRatio(input.Get(), MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
  input->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
  if (FAILED(hr = s.encoder->SetInputType(s.input_id, input.Get(), 0))) {
    note(s.tag + " NV12 輸入不收：" + hr_text(hr) + "，用自己做的格式再試");
    ComPtr<IMFMediaType> own;
    if (SUCCEEDED(MFCreateMediaType(&own))) {
      own->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
      own->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_NV12);
      MFSetAttributeSize(own.Get(), MF_MT_FRAME_SIZE, UINT32(s.width), UINT32(s.height));
      MFSetAttributeRatio(own.Get(), MF_MT_FRAME_RATE, Fps, 1);
      MFSetAttributeRatio(own.Get(), MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
      own->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
      hr = s.encoder->SetInputType(s.input_id, own.Get(), 0);
    }
    if (FAILED(hr))
      return fail(s, "設定 NV12 輸入（SetInputType）" + hr_text(hr));
  }
  configure(s, true);

  ComPtr<IMFMediaType> current;
  if (SUCCEEDED(s.encoder->GetOutputCurrentType(s.output_id, &current))) {
    UINT8* blob = nullptr;
    UINT32 size = 0;
    if (SUCCEEDED(current->GetAllocatedBlob(MF_MT_MPEG_SEQUENCE_HEADER, &blob, &size)) && blob) {
      s.sequence_header.assign(blob, blob + size);
      CoTaskMemFree(blob);
    }
  }
  MFT_OUTPUT_STREAM_INFO info{};
  if (SUCCEEDED(s.encoder->GetOutputStreamInfo(s.output_id, &info))) {
    s.provides_samples = (info.dwFlags & (MFT_OUTPUT_STREAM_PROVIDES_SAMPLES | MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES)) != 0;
    s.sample_size = info.cbSize;
  }
  note(s.tag + format(" 輸出自帶樣本=%d 樣本大小=%lu 序列標頭=%zu bytes", int(s.provides_samples), static_cast<unsigned long>(s.sample_size),
                      s.sequence_header.size()));

  std::string why;
  if (!open_converter(g, s.converter, s.width, s.height, why))
    return fail(s, "顏色轉換：" + why);
  D3D11_TEXTURE2D_DESC desc{};
  desc.Width = UINT(s.width);
  desc.Height = UINT(s.height);
  desc.MipLevels = 1;
  desc.ArraySize = 1;
  desc.Format = DXGI_FORMAT_NV12;
  desc.SampleDesc.Count = 1;
  desc.Usage = D3D11_USAGE_DEFAULT;
  desc.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_VIDEO_ENCODER;
  for (int i = 0; i < PoolSize; ++i) {
    ComPtr<ID3D11Texture2D> texture;
    hr = g.device->CreateTexture2D(&desc, nullptr, &texture);
    if (FAILED(hr) && (desc.BindFlags & D3D11_BIND_VIDEO_ENCODER)) {
      note(s.tag + " NV12 畫面不能標成給編碼器用，改用一般的：" + hr_text(hr));
      desc.BindFlags = D3D11_BIND_RENDER_TARGET;
      hr = g.device->CreateTexture2D(&desc, nullptr, &texture);
    }
    if (FAILED(hr))
      return fail(s, "NV12 畫面（CreateTexture2D）" + hr_text(hr));
    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC view_desc{};
    view_desc.ViewDimension = D3D11_VPOV_DIMENSION_TEXTURE2D;
    ComPtr<ID3D11VideoProcessorOutputView> view;
    if (FAILED(hr = g.video->CreateVideoProcessorOutputView(texture.Get(), s.converter.enumerator.Get(), &view_desc, &view)))
      return fail(s, "轉換輸出（CreateVideoProcessorOutputView）" + hr_text(hr));
    s.pool.push_back(texture);
    s.views.push_back(view);
  }
  if (FAILED(hr = s.encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)))
    return fail(s, "開始編碼（BEGIN_STREAMING）" + hr_text(hr));
  if (FAILED(hr = s.encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)))
    return fail(s, "開始編碼（START_OF_STREAM）" + hr_text(hr));
  return true;
}

void take_output(Stream& s) {
  MFT_OUTPUT_DATA_BUFFER buffer{};
  buffer.dwStreamID = s.output_id;
  ComPtr<IMFSample> own;
  if (!s.provides_samples) {
    ComPtr<IMFMediaBuffer> memory;
    const DWORD size = std::max<DWORD>(s.sample_size, DWORD(s.width) * DWORD(s.height) * 2);
    if (FAILED(MFCreateSample(&own)) || FAILED(MFCreateMemoryBuffer(size, &memory)) || FAILED(own->AddBuffer(memory.Get()))) {
      fail(s, "準備不了輸出的記憶體");
      return;
    }
    buffer.pSample = own.Get();
  }
  DWORD status = 0;
  const HRESULT hr = s.encoder->ProcessOutput(0, 1, &buffer, &status);
  if (buffer.pEvents)
    buffer.pEvents->Release();
  ComPtr<IMFSample> sample;
  if (s.provides_samples)
    sample.Attach(buffer.pSample);
  else
    sample = own;
  if (hr == MF_E_TRANSFORM_STREAM_CHANGE) {
    ComPtr<IMFMediaType> type;
    HRESULT change = s.encoder->GetOutputAvailableType(s.output_id, 0, &type);
    if (SUCCEEDED(change))
      change = s.encoder->SetOutputType(s.output_id, type.Get(), 0);
    note(s.tag + " 輸出格式變了，重設：" + hr_text(change));
    if (FAILED(change))
      fail(s, "輸出格式變了，重設不了 " + hr_text(change));
    return;
  }
  if (hr == MF_E_TRANSFORM_NEED_MORE_INPUT)
    return;
  if (FAILED(hr) || !sample) {
    ++s.errors;
    note(s.tag + " ProcessOutput " + hr_text(hr));
    if (s.errors > 5)
      fail(s, "拿不到編好的畫面（ProcessOutput）" + hr_text(hr));
    return;
  }
  const double now = now_ms();
  Output out;
  sample->GetSampleTime(&out.time);
  ComPtr<IMFMediaBuffer> contiguous;
  BYTE* bytes = nullptr;
  DWORD length = 0;
  if (FAILED(sample->ConvertToContiguousBuffer(&contiguous)) || FAILED(contiguous->Lock(&bytes, nullptr, &length))) {
    ++s.errors;
    return;
  }
  out.data.assign(bytes, bytes + length);
  contiguous->Unlock();
  // Some encoders hand out SPS/PPS as an output of their own: they go with the next picture.
  if (!scan(out.data).slice) {
    s.prefix.insert(s.prefix.end(), out.data.begin(), out.data.end());
    ++s.prefixes;
    return;
  }
  if (!s.prefix.empty()) {
    out.data.insert(out.data.begin(), s.prefix.begin(), s.prefix.end());
    s.prefix.clear();
  }
  // Frames keep their time, so the time tells which frame this is; if it does not, the order does.
  out.index = int((out.time * Fps + Second / 2) / Second);
  const int expected = s.outputs.empty() ? 0 : s.outputs.back().index + 1;
  if (out.index < 0 || std::size_t(out.index) >= s.sent.size() || out.index < expected) {
    ++s.renumbered;
    out.index = expected;
  }
  const Nals nals = scan(out.data);
  out.key = nals.idr;
  out.headers = nals.sps && nals.pps;
  if (MFGetAttributeUINT32(sample.Get(), MFSampleExtension_CleanPoint, FALSE))
    ++s.clean_points;
  if (s.codec.empty() && nals.first_sps.size() >= 4)
    s.codec = format("avc1.%02x%02x%02x", nals.first_sps[1], nals.first_sps[2], nals.first_sps[3]);
  if (std::size_t(out.index) < s.sent.size() && s.sent[std::size_t(out.index)] >= 0)
    out.latency = now - s.sent[std::size_t(out.index)];
  s.last_out = now;
  s.outputs.push_back(std::move(out));
}

bool pump(Stream& s) {
  if (s.failed || !s.events)
    return false;
  bool any = false;
  for (int guard = 0; guard < 256; ++guard) {
    ComPtr<IMFMediaEvent> event;
    const HRESULT hr = s.events->GetEvent(MF_EVENT_FLAG_NO_WAIT, &event);
    if (hr == MF_E_NO_EVENTS_AVAILABLE)
      break;
    if (FAILED(hr) || !event) {
      fail(s, "GetEvent " + hr_text(hr));
      break;
    }
    any = true;
    MediaEventType type = MEUnknown;
    event->GetType(&type);
    HRESULT status = S_OK;
    event->GetStatus(&status);
    if (FAILED(status)) {
      ++s.errors;
      note(s.tag + format(" 事件 %lu 失敗：", static_cast<unsigned long>(type)) + hr_text(status));
      if (type == MEError || s.errors > 5) {
        fail(s, "編碼器回報錯誤 " + hr_text(status));
        break;
      }
      continue;
    }
    if (type == METransformNeedInput)
      ++s.wanted;
    else if (type == METransformHaveOutput)
      take_output(s);
    else if (type == METransformDrainComplete)
      s.drained = true;
    else
      note(s.tag + format(" 其他事件 %lu", static_cast<unsigned long>(type)));
    if (s.failed)
      break;
  }
  return any;
}

bool convert(Graphics& g, Stream& s, int index) {
  D3D11_VIDEO_PROCESSOR_STREAM stream{};
  stream.Enable = TRUE;
  stream.pInputSurface = s.converter.input.Get();
  const HRESULT hr =
      g.video_context->VideoProcessorBlt(s.converter.processor.Get(), s.views[std::size_t(index % PoolSize)].Get(), UINT(index), 1, &stream);
  if (FAILED(hr))
    return fail(s, "顏色轉換（VideoProcessorBlt）" + hr_text(hr));
  return true;
}

void feed(Stream& s, int index) {
  ComPtr<IMFMediaBuffer> buffer;
  HRESULT hr = MFCreateDXGISurfaceBuffer(__uuidof(ID3D11Texture2D), s.pool[std::size_t(index % PoolSize)].Get(), 0, FALSE, &buffer);
  if (FAILED(hr)) {
    fail(s, "MFCreateDXGISurfaceBuffer " + hr_text(hr));
    return;
  }
  ComPtr<IMF2DBuffer> planes;
  DWORD length = 0;
  if (SUCCEEDED(buffer.As(&planes)) && SUCCEEDED(planes->GetContiguousLength(&length)))
    buffer->SetCurrentLength(length);
  ComPtr<IMFSample> sample;
  hr = MFCreateSample(&sample);
  if (SUCCEEDED(hr))
    hr = sample->AddBuffer(buffer.Get());
  if (SUCCEEDED(hr))
    hr = sample->SetSampleTime(LONGLONG(index) * Second / Fps);
  if (SUCCEEDED(hr))
    hr = sample->SetSampleDuration(Second / Fps);
  if (FAILED(hr)) {
    fail(s, "準備畫面 " + hr_text(hr));
    return;
  }
  if (index == ForcedKey && s.codec_api) {
    VARIANT value{};
    value.vt = VT_UI4;
    value.ulVal = 1;
    s.forced_key = s.codec_api->SetValue(&CODECAPI_AVEncVideoForceKeyFrame, &value);
  }
  const double now = now_ms();
  s.sent[std::size_t(index)] = now;
  if (s.first_in < 0)
    s.first_in = now;
  --s.wanted;
  if (FAILED(hr = s.encoder->ProcessInput(s.input_id, sample.Get(), 0))) {
    s.sent[std::size_t(index)] = -1;
    fail(s, format("送第 %d 格（ProcessInput）", index) + hr_text(hr));
  }
}

// ---- the runs ----
struct Run {
  const char* file;
  const char* title;
  int width, height, streams, frames, bitrate;
  bool paced, save;
};
struct Result {
  std::string title, verdict;
  bool ok = false, ran = false;
  bool forced_key = false, headers_on_keys = true;
  double mean = 0, fps = 0;
};

struct Measure {
  int in = 0, out = 0;
  double first = -1, mean = 0, p95 = 0, worst = 0, mbps = 0;
  std::vector<int> keys;
  int keys_with_headers = 0;
  std::size_t biggest = 0;
};
Measure measure(const Stream& s) {
  Measure m;
  for (const double t : s.sent)
    m.in += t >= 0;
  m.out = int(s.outputs.size());
  std::vector<double> later;
  std::size_t bytes = 0;
  for (const Output& o : s.outputs) {
    bytes += o.data.size();
    m.biggest = std::max(m.biggest, o.data.size());
    if (o.key) {
      m.keys.push_back(o.index);
      m.keys_with_headers += o.headers;
    }
    if (o.latency < 0)
      continue;
    if (m.first < 0)
      m.first = o.latency;
    else
      later.push_back(o.latency);
  }
  if (!later.empty()) {
    std::sort(later.begin(), later.end());
    double sum = 0;
    for (const double v : later)
      sum += v;
    m.mean = sum / double(later.size());
    m.p95 = later[std::min(later.size() - 1, later.size() * 95 / 100)];
    m.worst = later.back();
  }
  if (m.in > 0)
    m.mbps = double(bytes) * 8.0 / (double(m.in) / Fps) / 1e6;
  return m;
}

std::string key_list(const std::vector<int>& keys) {
  std::string out;
  for (std::size_t i = 0; i < keys.size() && i < 16; ++i)
    out += (i ? "," : "") + std::to_string(keys[i]);
  if (keys.size() > 16)
    out += ",…";
  return out.empty() ? "（沒有）" : out;
}

bool write_clip(const std::wstring& path, const std::string& header, const std::vector<Output>& outputs, bool raw) {
  FILE* file = _wfopen(path.c_str(), L"wb");
  if (!file)
    return false;
  bool ok = true;
  if (!raw) {
    const std::uint32_t length = std::uint32_t(header.size());
    ok &= std::fwrite("PCH264v1", 1, 8, file) == 8;
    ok &= std::fwrite(&length, 4, 1, file) == 1;
    ok &= std::fwrite(header.data(), 1, header.size(), file) == header.size();
  }
  for (const Output& o : outputs) {
    if (!raw) {
      std::uint8_t record[20]{};
      const std::uint32_t size = std::uint32_t(o.data.size()), index = std::uint32_t(o.index);
      const std::int64_t time = o.time;
      std::memcpy(record, &size, 4);
      record[4] = std::uint8_t((o.key ? 1 : 0) | (o.headers ? 2 : 0));
      std::memcpy(record + 8, &time, 8);
      std::memcpy(record + 16, &index, 4);
      ok &= std::fwrite(record, 1, sizeof(record), file) == sizeof(record);
    }
    ok &= std::fwrite(o.data.data(), 1, o.data.size(), file) == o.data.size();
  }
  ok &= std::fclose(file) == 0;
  return ok;
}

Result run_test(Graphics& g, Pattern& pattern, const Gpu& gpu, const EncoderName& choice, const Run& run, const std::wstring& folder) {
  Result result;
  result.title = run.title;
  say("");
  say(format("── %s（%d×%d，%d 格，%.1f Mbps%s）──", run.title, run.width, run.height, run.frames, run.bitrate / 1e6,
             run.paced ? "，每秒 30 格" : "，能多快就多快"));
  std::vector<Stream> streams(std::size_t(run.streams));
  for (std::size_t i = 0; i < streams.size(); ++i) {
    Stream& s = streams[i];
    s.number = int(i) + 1;
    s.tag = run.streams > 1 ? format("[%s 第%d路]", run.title, s.number) : format("[%s]", run.title);
    s.width = run.width;
    s.height = run.height;
    s.bitrate = run.bitrate;
    s.sent.assign(std::size_t(run.frames), -1.0);
    open_stream(s, g, choice);
  }
  const auto live = [&] { return std::any_of(streams.begin(), streams.end(), [](const Stream& s) { return !s.failed; }); };
  const auto close_all = [&] {
    for (Stream& s : streams) {
      if (s.encoder)
        s.encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_END_STREAMING, 0);
      s.events.Reset();
      s.codec_api.Reset();
      s.encoder.Reset();
      if (s.activate)
        s.activate->ShutdownObject();
    }
  };
  if (!live()) {
    close_all();
    result.verdict = "開不起來：" + streams[0].failure;
    return result;
  }
  result.ran = true;

  // Wait for every encoder to ask for its first frame.
  const double ready_by = now_ms() + 3000;
  while (now_ms() < ready_by) {
    for (Stream& s : streams)
      pump(s);
    if (std::all_of(streams.begin(), streams.end(), [](const Stream& s) { return s.failed || s.wanted > 0; }))
      break;
    Sleep(1);
  }
  for (Stream& s : streams)
    if (!s.failed && s.wanted <= 0)
      fail(s, "編碼器 3 秒內沒有要第一格");

  pattern.frame(0);
  pattern.upload(g.context.Get(), g.source.Get(), true);
  const double period = 1000.0 / Fps;
  const double start = now_ms();
  double last_progress = start, drain_started = -1, prepare = 0;
  int next = 0;
  while (live()) {
    bool busy = false;
    for (Stream& s : streams)
      busy |= pump(s);
    double now = now_ms();
    if (next < run.frames) {
      const bool due = run.paced ? now >= start + next * period
                                 : std::all_of(streams.begin(), streams.end(), [](const Stream& s) { return s.failed || s.wanted > 0; });
      if (due) {
        const double before = now_ms();
        if (next > 0) {
          pattern.frame(next);
          pattern.upload(g.context.Get(), g.source.Get(), false);
        }
        for (Stream& s : streams) {
          if (s.failed)
            continue;
          if (s.wanted <= 0) {
            ++s.dropped;  // it has not asked for more yet: a live picture would be skipped
            continue;
          }
          if (convert(g, s, next))
            feed(s, next);
        }
        prepare += now_ms() - before;
        ++next;
        busy = true;
      }
    } else if (drain_started < 0) {
      for (Stream& s : streams) {
        if (s.failed)
          continue;
        s.encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, s.input_id);
        const HRESULT hr = s.encoder->ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN, s.input_id);
        if (FAILED(hr)) {
          note(s.tag + " DRAIN " + hr_text(hr));
          s.drained = true;
        }
      }
      drain_started = now;
    } else if (std::all_of(streams.begin(), streams.end(), [](const Stream& s) { return s.failed || s.drained; })) {
      break;
    } else if (now - drain_started > 3000) {
      note("等最後幾格超過 3 秒，不等了");
      break;
    }
    now = now_ms();
    if (busy)
      last_progress = now;
    if (now - last_progress > 5000) {
      for (Stream& s : streams)
        if (!s.failed && !s.drained)
          fail(s, "編碼器 5 秒沒有動靜");
      break;
    }
    if (!busy)
      Sleep(1);
  }
  close_all();
  if (next > 0)
    note(format("準備一格（畫測試圖、上傳、轉換、送出）平均 %.2f ms", prepare / next));

  bool all_ok = true;
  double worst_mean = 0;
  for (Stream& s : streams) {
    const Measure m = measure(s);
    if (s.outputs.empty()) {
      all_ok = false;
      say(s.tag + " 沒有編出任何畫面" + (s.failure.empty() ? "" : "：" + s.failure));
      continue;
    }
    say(s.tag + format(" 進 %d 格、出 %d 格、丟 %d 格", m.in, m.out, s.dropped) + (s.codec.empty() ? "" : "，" + s.codec));
    say(format("    延遲：第一格 %.1f ms，之後平均 %.1f ms，95%% 在 %.1f ms 內，最慢 %.1f ms", m.first, m.mean, m.p95, m.worst));
    say(format("    實際 %.2f Mbps，最大一格 %zu KB；關鍵格 %s（%d 個裡 %d 個帶 SPS/PPS）", m.mbps, (m.biggest + 512) / 1024, key_list(m.keys).c_str(),
               int(m.keys.size()), m.keys_with_headers));
    const bool forced = std::find(m.keys.begin(), m.keys.end(), ForcedKey) != m.keys.end();
    if (run.frames > ForcedKey)
      say(format("    第 %d 格要求關鍵格：%s", ForcedKey, forced ? "有" : (FAILED(s.forced_key) ? ("設定失敗 " + hr_text(s.forced_key)).c_str() : "沒有出現")));
    if (s.renumbered)
      note(s.tag + format(" %d 格的時間對不上，照順序編號", s.renumbered));
    if (s.prefixes)
      note(s.tag + format(" 有 %d 次單獨送出 SPS/PPS，已併到下一格", s.prefixes));
    if (s.clean_points != int(m.keys.size()))
      note(s.tag + format(" 標成關鍵格的有 %d 格，帶 IDR 的有 %zu 格", s.clean_points, m.keys.size()));
    note(s.tag + " 設定：" + s.settings);
    result.forced_key = forced || result.forced_key;
    result.headers_on_keys = result.headers_on_keys && m.keys_with_headers == int(m.keys.size());
    worst_mean = std::max(worst_mean, m.mean);
    const bool ok = !s.failed && s.dropped == 0 && m.out == m.in && m.in == run.frames && s.errors == 0 && (!run.paced || m.p95 < period);
    all_ok = all_ok && ok;
    if (!run.paced && m.out > 1 && s.last_out > s.first_in)
      result.fps = double(m.out) / ((s.last_out - s.first_in) / 1000.0);

    if (run.save) {
      const std::string name = run.streams > 1 ? format("%s-%d", run.file, s.number) : run.file;
      const std::string header =
          "{\"format\":\"pch264\",\"version\":1,\"tool\":" + json_text("polaris-cam-encode-test " POLARIS_CAM_VERSION) +
          ",\"encoder\":" + json_text(choice.name) + ",\"adapter\":" + json_text(gpu.name) + ",\"driver\":" + json_text(gpu.driver) +
          ",\"run\":" + json_text(run.title) + format(",\"stream\":%d,\"streams\":%d,\"width\":%d,\"height\":%d,\"fps\":%d,\"bitrate\":%d", s.number,
                                                      run.streams, run.width, run.height, Fps, run.bitrate) +
          format(",\"gop\":%d,\"forcedKey\":%d,\"frames\":%d,\"codec\":", Gop, ForcedKey, run.frames) + json_text(s.codec) +
          format(",\"latencyMs\":{\"first\":%.2f,\"mean\":%.2f,\"p95\":%.2f,\"max\":%.2f}", m.first, m.mean, m.p95, m.worst) +
          ",\"sequenceHeader\":" + json_text(base64(s.sequence_header)) + ",\"pattern\":" + pattern_json() + "}";
      const std::wstring base = folder + L"\\" + wide(name);
      const bool saved = write_clip(base + L".pch264", header, s.outputs, false) && write_clip(base + L".h264", header, s.outputs, true);
      if (!saved)
        say("    存不了測試片 " + name + ".pch264");
    }
  }
  result.ok = all_ok;
  result.mean = worst_mean;
  if (!run.paced)
    result.verdict = result.fps > 0 ? format("每秒約 %.0f 格", result.fps) : "沒跑完";
  else
    result.verdict = all_ok ? format("穩（平均延遲 %.1f ms）", worst_mean) : "不穩，看上面的數字";
  return result;
}

std::wstring exe_folder() {
  std::wstring path(MAX_PATH, L'\0');
  for (;;) {
    const DWORD n = GetModuleFileNameW(nullptr, path.data(), DWORD(path.size()));
    if (n == 0)
      return L".";
    if (n < path.size()) {
      path.resize(n);
      break;
    }
    path.resize(path.size() * 2);
  }
  const auto slash = path.find_last_of(L"\\/");
  return slash == std::wstring::npos ? L"." : path.substr(0, slash);
}

void wait_for_enter() {
  say("");
  say("按 Enter 鍵關閉這個視窗。");
  std::fflush(stdout);
  std::getchar();
}
}  // namespace

int wmain() {
  SetConsoleOutputCP(CP_UTF8);
  SetConsoleTitleW(L"Polaris Cam 編碼測試");
  // Each run has a folder of its own, so a second run (say, with MSFS flying) keeps the first.
  SYSTEMTIME local{};
  GetLocalTime(&local);
  const std::wstring all_results = exe_folder() + L"\\encode-test-results";
  CreateDirectoryW(all_results.c_str(), nullptr);
  const std::wstring folder = all_results + L"\\" + wide(format("%04u%02u%02u-%02u%02u%02u", local.wYear, local.wMonth, local.wDay, local.wHour,
                                                             local.wMinute, local.wSecond));
  CreateDirectoryW(folder.c_str(), nullptr);
  report_file = _wfopen((folder + L"\\report.txt").c_str(), L"wb");
  if (report_file)
    std::fputs("\xEF\xBB\xBF", report_file);
  say("Polaris Cam 編碼測試（" POLARIS_CAM_VERSION "）");
  say(format("%04u-%02u-%02u %02u:%02u，%s", local.wYear, local.wMonth, local.wDay, local.wHour, local.wMinute, windows_text().c_str()));
  if (!report_file)
    say("注意：寫不了 " + utf8(folder) + "\\report.txt，結果只在這個視窗裡。");
  std::wstring lower = folder;
  std::transform(lower.begin(), lower.end(), lower.begin(), [](wchar_t c) { return wchar_t(towlower(c)); });
  if (lower.find(L"\\appdata\\local\\temp\\") != std::wstring::npos)
    say("注意：程式好像是直接從 ZIP 裡開的。請先把 ZIP 解壓縮到資料夾，再從資料夾執行，測試片才找得到。");

  timeBeginPeriod(1);
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) {
    say("CoInitializeEx " + hr_text(hr));
    wait_for_enter();
    return 1;
  }
  if (FAILED(hr = MFStartup(MF_VERSION, MFSTARTUP_FULL))) {
    say("Media Foundation 開不起來（MFStartup）：" + hr_text(hr) + "。Windows N 版需要另外裝「媒體功能套件」。");
    wait_for_enter();
    return 1;
  }

  say("");
  std::vector<Gpu> gpus = list_gpus();
  if (gpus.empty()) {
    say("找不到顯示卡。");
    wait_for_enter();
    return 1;
  }
  std::size_t main_gpu = 0;
  for (std::size_t i = 0; i < gpus.size(); ++i) {
    say(format("顯示卡 %zu：%s，%llu MB 專用記憶體，驅動 %s", i + 1, gpus[i].name.c_str(), gpus[i].memory >> 20,
               gpus[i].driver.empty() ? "不明" : gpus[i].driver.c_str()));
    if (gpus[i].memory > gpus[main_gpu].memory)
      main_gpu = i;
  }
  const Gpu& gpu = gpus[main_gpu];
  say("測試用：" + gpu.name + "（專用記憶體最多的那張，MSFS 也在這張上）");

  HRESULT enum_hr = S_OK;
  std::vector<ComPtr<IMFActivate>> encoders = hardware_encoders(&enum_hr);
  if (encoders.empty()) {
    say("找不到硬體 H.264 編碼器（MFTEnumEx " + hr_text(enum_hr) + "）。");
    wait_for_enter();
    return 1;
  }
  const std::string vendor = format("VEN_%04X", gpu.vendor);
  std::size_t chosen = encoders.size();
  for (std::size_t i = 0; i < encoders.size(); ++i) {
    const EncoderName name = describe(encoders[i].Get());
    say(format("硬體編碼器 %zu：%s（%s）", i + 1, name.name.c_str(), name.vendor.empty() ? "廠商不明" : name.vendor.c_str()));
    if (chosen == encoders.size() && _stricmp(name.vendor.c_str(), vendor.c_str()) == 0)
      chosen = i;
  }
  if (chosen == encoders.size()) {
    say("沒有一個編碼器標明是這張顯示卡的，先用第一個試。");
    chosen = 0;
  }
  const EncoderName choice = describe(encoders[chosen].Get());
  encoders.clear();
  say("測試用：" + choice.name);

  Graphics graphics;
  if (!open_graphics(graphics, gpu.adapter.Get())) {
    wait_for_enter();
    return 1;
  }
  Pattern pattern(SourceWidth, SourceHeight);
  const Run runs[]{
      {"540p", "960×540 一路", 960, 540, 1, 300, 2'000'000, true, true},
      {"1080p", "1920×1080 一路", 1920, 1080, 1, 300, 6'000'000, true, true},
      {"4x540p", "960×540 四路同時", 960, 540, 4, 300, 2'000'000, true, true},
      {"1080p-fast", "1920×1080 全速", 1920, 1080, 1, 240, 6'000'000, false, false},
  };
  std::vector<Result> results;
  for (const Run& run : runs)
    results.push_back(run_test(graphics, pattern, gpu, choice, run, folder));

  say("");
  say("══ 結果 ══");
  say("顯示卡：" + gpu.name + "，驅動 " + (gpu.driver.empty() ? "不明" : gpu.driver));
  say("編碼器：" + choice.name);
  for (const Result& r : results)
    say(r.title + "：" + (r.ran ? r.verdict : r.verdict.empty() ? "沒跑" : r.verdict));
  const bool any_ran = std::any_of(results.begin(), results.end(), [](const Result& r) { return r.ran; });
  if (any_ran) {
    const bool forced = std::any_of(results.begin(), results.end(), [](const Result& r) { return r.forced_key; });
    const bool headers = std::all_of(results.begin(), results.end(), [](const Result& r) { return !r.ran || r.headers_on_keys; });
    say(std::string("中途要關鍵格（給剛打開後台的人）：") + (forced ? "有效" : "沒效，只能等每 2 秒一次的關鍵格"));
    say(std::string("每個關鍵格都帶 SPS/PPS：") + (headers ? "是" : "不是，伺服器要幫剛加入的人補上"));
  }
  say("測試片和報告在：" + utf8(folder));
  say("下一步：用 Chrome 打開測試網頁，把這個資料夾裡的 .pch264 檔拖進去。");
  if (report_file) {
    std::fclose(report_file);
    report_file = nullptr;
  }
  std::wstring command = L"explorer.exe \"" + folder + L"\"";
  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION process{};
  if (CreateProcessW(nullptr, command.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &startup, &process)) {
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
  }
  graphics = Graphics{};
  MFShutdown();
  CoUninitialize();
  timeEndPeriod(1);
  wait_for_enter();
  return 0;
}
