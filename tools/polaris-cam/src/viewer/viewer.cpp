// Polaris Cam: the window that shows and controls the broadcast cameras.
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
//
// The bridge inside MSFS (Taxi Cam's, with src/graphics/broadcast_output.cpp)
// renders up to four camera views at the broadcast size and writes each into
// GPU textures shared by name. This window asks for them (size, pictures per
// second, which cameras, where they are mounted) through the shared block in
// src/shared/broadcast_link.hpp, shows them in a 2 x 2 preview, and opens one
// window per camera at exactly the picture's size for OBS to capture
// (Window Capture, method "Windows 10 (1903 and up)").
//
// Pictures are only ever copied GPU to GPU: opened here with Direct3D 11 and
// copied into each window's swap chain. Nothing is compiled or drawn here.
#include <windows.h>
#include <windowsx.h>
#include <commctrl.h>
#include <d3d11_1.h>
#include <dxgi1_2.h>
#include <shellapi.h>
#include <shlobj.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdarg>
#include <cstdio>
#include <cwchar>
#include <string>
#include "../shared/broadcast_link.hpp"
#include "../shared/version.hpp"
#include "waiting_status.hpp"

namespace {
using namespace polaris_cam;

constexpr wchar_t MainClass[] = L"PolarisCamMain";
constexpr wchar_t CellClass[] = L"PolarisCamCell";
constexpr wchar_t OutputClass[] = L"PolarisCamOutput";
constexpr wchar_t AppTitle[] = L"Polaris Cam";
constexpr double Pi = 3.14159265358979323846;

// Starting positions, roughly right for an A320-family cockpit and airframe
// (the Fenix A320's door camera in Taxi Cam is 9.4 m forward and 2.84 m up).
// Every aircraft model has its own reference point: they are places to start
// from and are meant to be nudged into place.
struct Preset {
  const wchar_t* name;
  Mount mount;
};
constexpr std::array<Preset, 6> Presets{{
    {L"二排中（駕駛艙後方正中）", {0.0, 2.25, 10.2, -10.0, 0.0, 1.45}},
    {L"機長側（左前往內看）", {-1.30, 2.05, 12.5, -5.0, 120.0, 1.30}},
    {L"副駕側（右前往內看）", {1.30, 2.05, 12.5, -5.0, -120.0, 1.30}},
    {L"機腹（往前看起落架）", {0.0, -1.55, 3.0, -6.0, 0.0, 1.40}},
    {L"尾翼（垂尾頂往前看）", {0.0, 8.3, -18.0, -16.0, 0.0, 0.95}},
    {L"客艙（艙門後往後看）", {0.0, 2.6, 9.0, -12.0, 180.0, 1.35}},
}};
constexpr int CustomPreset = static_cast<int>(Presets.size());
constexpr std::array<int, Feeds> DefaultPresets{0, 1, 3, 4};
constexpr std::array<unsigned, 10> FpsChoices{5, 10, 15, 20, 24, 25, 30, 40, 50, 60};

enum ControlId : int {
  IdEnable = 100,
  IdSize1080,
  IdSize720,
  IdFps,
  IdSelect,
  IdWindows,
  IdStatus,
  IdHint,
  IdReset,
  IdCamera = 200,  // + feed
  IdPreset = 210,  // + feed
  IdField = 220,   // + 0..5
};

struct Settings {
  bool enabled = false;
  std::uint32_t height = 1080;
  std::uint32_t fps = DefaultFps;
  std::uint32_t mask = 1;
  bool windows = false;
  std::array<Mount, Feeds> mounts{};
  std::array<int, Feeds> presets = DefaultPresets;
  std::uint32_t width() const noexcept { return height == 720 ? 1280u : 1920u; }
};

// Why a camera that should show a picture cannot (update_failure).
enum class FeedFailure {
  none,
  start,     // the bridge could not start it
  textures,  // its textures did not open in this window
};

struct Feed {
  std::uint32_t generation = 0;
  UINT width = 0, height = 0;
  std::array<ID3D11Texture2D*, Slots> textures{};
  std::uint64_t frames = 0;  // the picture on show
  unsigned shown_slot = NoSlot;  // and the texture it came from
  std::uint64_t shown_ms = 0;
  std::uint64_t counted = 0;  // pictures at the last rate sample
  double fps = 0;
  HWND cell = nullptr;
  IDXGISwapChain1* cell_chain = nullptr;
  HWND output = nullptr;
  IDXGISwapChain1* output_chain = nullptr;
  // A picture is on show. It stays when the camera pauses (the simulator's
  // menu, a loading screen): a broadcast keeps its last picture.
  bool live = false;
  std::uint32_t refused = 0;  // the texture set whose failure to open is already in the log
  // While it has one, its cell says so and it shows no picture.
  FeedFailure failure = FeedFailure::none;
};

struct App {
  HINSTANCE instance = nullptr;
  HWND main = nullptr;
  HFONT font = nullptr, bold = nullptr, title = nullptr;
  UINT dpi = 96;
  LinkMapping link;
  HANDLE frame_event = nullptr;
  Settings settings;
  std::wstring aircraft;  // the key the mounts are saved under
  std::array<Feed, Feeds> feeds;
  unsigned selected = 0;
  // Direct3D 11 on the simulator's GPU.
  IDXGIFactory2* factory = nullptr;
  ID3D11Device1* device = nullptr;
  ID3D11DeviceContext* context = nullptr;
  LUID adapter{};
  std::uint64_t gpu_retry_ms = 0;
  std::wstring gpu_error;
  std::uint32_t bridge_pid = 0;
  std::uint64_t heartbeat_ms = 0, labels_ms = 0, rate_ms = 0;
  std::wstring status_text;
  bool filling = false;  // controls are being set from code
  bool ticking = false;  // tick() is running
  // The preview shown alone, large (a double click); Feeds: all four.
  unsigned enlarged = Feeds;
  // A mouse drag on a preview: which button, and where the cursor was.
  int drag = 0;  // 0 none, 1 turn (left button), 2 move (right button)
  POINT drag_at{};
  bool dragged = false;
  std::uint64_t keys_ms = 0;        // last pass of the held-key movement
  std::uint64_t mounts_dirty_ms = 0;  // unsaved mount changes since then; 0 none
} app;

template <typename T>
void drop(T*& object) noexcept {
  if (object)
    object->Release();
  object = nullptr;
}
// What happened, for a report: polaris-cam.log beside the settings (ini_path).
// Each run is added to the end under a line with its date, so the run before a
// restart is still there; past 1 MB the file becomes polaris-cam.previous.log
// before a run starts a new one. Events only, never a line per picture.
FILE* log_file = nullptr;
void note(const wchar_t* format, ...) {
  if (!log_file)
    return;
  SYSTEMTIME time{};
  GetLocalTime(&time);
  std::fwprintf(log_file, L"%02u:%02u:%02u.%03u  ", time.wHour, time.wMinute, time.wSecond, time.wMilliseconds);
  va_list arguments;
  va_start(arguments, format);
  std::vfwprintf(log_file, format, arguments);
  va_end(arguments);
  std::fputwc(L'\n', log_file);
  std::fflush(log_file);
}
int px(int value) noexcept {
  return MulDiv(value, static_cast<int>(app.dpi), 96);
}

// --- saved settings -------------------------------------------------------
// %APPDATA%\Polaris Cam\polaris-cam.ini, or the folder POLARIS_CAM_SETTINGS
// names: the build's window test sets it, so that it never touches the
// settings of the person who runs it.
std::wstring ini_path() {
  if (const DWORD length = GetEnvironmentVariableW(L"POLARIS_CAM_SETTINGS", nullptr, 0); length > 1) {
    std::wstring path(length, L'\0');
    path.resize(GetEnvironmentVariableW(L"POLARIS_CAM_SETTINGS", path.data(), length));
    while (!path.empty() && (path.back() == L'\\' || path.back() == L'/'))
      path.pop_back();
    if (!path.empty()) {
      CreateDirectoryW(path.c_str(), nullptr);
      return path + L"\\polaris-cam.ini";
    }
  }
  wchar_t folder[MAX_PATH]{};
  if (FAILED(SHGetFolderPathW(nullptr, CSIDL_APPDATA | CSIDL_FLAG_CREATE, nullptr, SHGFP_TYPE_CURRENT, folder)))
    return L"polaris-cam.ini";
  std::wstring path = std::wstring(folder) + L"\\Polaris Cam";
  CreateDirectoryW(path.c_str(), nullptr);
  return path + L"\\polaris-cam.ini";
}
// "SimObjects\Airplanes\FNX_32X\presets\..." -> "fnx_32x"; "default" without one.
std::wstring aircraft_key(const char* path) {
  std::string text(path, strnlen(path, 259));
  for (auto& c : text)
    c = c == '\\' ? '/' : c >= 'A' && c <= 'Z' ? static_cast<char>(c + 32) : c;
  const auto at = text.find("airplanes/");
  if (at == std::string::npos)
    return L"default";
  auto name = text.substr(at + 10);
  name = name.substr(0, name.find('/'));
  std::wstring key;
  for (const char c : name)
    key += (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' ? static_cast<wchar_t>(c) : L'_';
  return key.empty() ? L"default" : key;
}
void load_mounts(const std::wstring& key) {
  const auto path = ini_path();
  const auto section = L"mounts:" + key;
  for (unsigned feed = 0; feed < Feeds; ++feed) {
    wchar_t name[16], text[160]{};
    std::swprintf(name, 16, L"camera%u", feed + 1);
    GetPrivateProfileStringW(section.c_str(), name, L"", text, 160, path.c_str());
    Mount mount{};
    int preset = CustomPreset;
    if (std::swscanf(text, L"%d,%lf,%lf,%lf,%lf,%lf,%lf", &preset, &mount[0], &mount[1], &mount[2], &mount[3], &mount[4], &mount[5]) == 7 &&
        valid_mount(mount.data())) {
      app.settings.mounts[feed] = mount;
      app.settings.presets[feed] = preset >= 0 && preset <= CustomPreset ? preset : CustomPreset;
    } else {
      app.settings.presets[feed] = DefaultPresets[feed];
      app.settings.mounts[feed] = Presets[static_cast<std::size_t>(DefaultPresets[feed])].mount;
    }
  }
}
void save_mounts() {
  const auto path = ini_path();
  const auto section = L"mounts:" + (app.aircraft.empty() ? std::wstring(L"default") : app.aircraft);
  for (unsigned feed = 0; feed < Feeds; ++feed) {
    wchar_t name[16], text[160];
    const auto& m = app.settings.mounts[feed];
    std::swprintf(name, 16, L"camera%u", feed + 1);
    std::swprintf(text, 160, L"%d,%.3f,%.3f,%.3f,%.2f,%.2f,%.4f", app.settings.presets[feed], m[0], m[1], m[2], m[3], m[4], m[5]);
    WritePrivateProfileStringW(section.c_str(), name, text, path.c_str());
  }
}
void load_settings() {
  const auto path = ini_path();
  auto& s = app.settings;
  s.enabled = GetPrivateProfileIntW(L"general", L"enabled", 0, path.c_str()) == 1;
  s.height = GetPrivateProfileIntW(L"general", L"height", 1080, path.c_str()) == 720 ? 720u : 1080u;
  s.fps = std::clamp<std::uint32_t>(GetPrivateProfileIntW(L"general", L"fps", DefaultFps, path.c_str()), MinimumFps, MaximumFps);
  s.mask = GetPrivateProfileIntW(L"general", L"cameras", 1, path.c_str()) & ((1u << Feeds) - 1);
  if (!s.mask)
    s.mask = 1;
  s.windows = GetPrivateProfileIntW(L"general", L"windows", 0, path.c_str()) == 1;
  app.aircraft = L"default";
  load_mounts(app.aircraft);
}
void save_settings() {
  const auto path = ini_path();
  const auto& s = app.settings;
  const auto put = [&](const wchar_t* name, unsigned value) {
    wchar_t text[16];
    std::swprintf(text, 16, L"%u", value);
    WritePrivateProfileStringW(L"general", name, text, path.c_str());
  };
  put(L"enabled", s.enabled ? 1 : 0);
  put(L"height", s.height);
  put(L"fps", s.fps);
  put(L"cameras", s.mask);
  put(L"windows", s.windows ? 1 : 0);
  save_mounts();
}

// --- the link ------------------------------------------------------------
void write_link() {
  auto* link = app.link.get();
  if (!link)
    return;
  const auto& s = app.settings;
  app.heartbeat_ms = GetTickCount64();
  write_control(*link, [&](Control& c) {
    c.enabled = s.enabled ? 1 : 0;
    c.width = s.width();
    c.height = s.height;
    c.fps = s.fps;
    c.feed_mask = s.mask;
    c.use_mounts = 1;
    c.heartbeat_ms = app.heartbeat_ms;
    for (unsigned feed = 0; feed < Feeds; ++feed)
      for (unsigned i = 0; i < 6; ++i)
        c.mounts[feed][i] = s.mounts[feed][i];
  });
}
bool bridge_present(std::uint64_t now) {
  const auto* link = app.link.get();
  return link && link->status.pid && fresh_heartbeat(link->status.heartbeat_ms, now, StatusStaleMs);
}

// --- Direct3D 11 ---------------------------------------------------------
void close_chain(IDXGISwapChain1*& chain) {
  drop(chain);
}
void close_textures(Feed& feed) {
  for (auto& texture : feed.textures)
    drop(texture);
  feed.generation = 0;
  feed.frames = 0;
  feed.shown_slot = NoSlot;
}
void close_gpu() {
  for (auto& feed : app.feeds) {
    close_textures(feed);
    close_chain(feed.cell_chain);
    close_chain(feed.output_chain);
    feed.live = false;
  }
  if (app.context)
    app.context->ClearState();
  drop(app.context);
  drop(app.device);
  drop(app.factory);
  app.adapter = {};
}
// The device has to be on the adapter the simulator renders on: its textures
// cannot be opened from another one.
bool open_gpu(LUID luid) {
  if (app.device && app.adapter.LowPart == luid.LowPart && app.adapter.HighPart == luid.HighPart)
    return true;
  close_gpu();
  IDXGIFactory2* factory = nullptr;
  if (FAILED(CreateDXGIFactory1(IID_PPV_ARGS(&factory)))) {
    app.gpu_error = L"無法建立 DXGI。";
    return false;
  }
  IDXGIAdapter1* adapter = nullptr;
  for (UINT index = 0; factory->EnumAdapters1(index, &adapter) != DXGI_ERROR_NOT_FOUND; ++index) {
    DXGI_ADAPTER_DESC1 desc{};
    if (SUCCEEDED(adapter->GetDesc1(&desc)) && desc.AdapterLuid.LowPart == luid.LowPart && desc.AdapterLuid.HighPart == luid.HighPart)
      break;
    drop(adapter);
  }
  // The build's self-test runs on the software adapter, which a second
  // process may see under another number.
  wchar_t software[4]{};
  const bool software_allowed = GetEnvironmentVariableW(L"POLARIS_CAM_WARP", software, 4) > 0;
  if (!adapter && !software_allowed) {
    drop(factory);
    app.gpu_error = L"找不到模擬器使用的顯示卡。";
    note(L"gpu: no adapter %08lx:%08lx", static_cast<unsigned long>(luid.HighPart), static_cast<unsigned long>(luid.LowPart));
    return false;
  }
  if (adapter) {
    DXGI_ADAPTER_DESC1 desc{};
    adapter->GetDesc1(&desc);
    note(L"gpu: %ls", desc.Description);
  } else {
    note(L"gpu: software adapter (POLARIS_CAM_WARP)");
  }
  const D3D_FEATURE_LEVEL levels[]{D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0};
  const auto driver = adapter ? D3D_DRIVER_TYPE_UNKNOWN : D3D_DRIVER_TYPE_WARP;
  ID3D11Device* device = nullptr;
  ID3D11DeviceContext* context = nullptr;
  HRESULT status =
      D3D11CreateDevice(adapter, driver, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels, 2, D3D11_SDK_VERSION, &device, nullptr, &context);
  if (status == E_INVALIDARG)  // a system that does not know 11.1
    status = D3D11CreateDevice(adapter, driver, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels + 1, 1, D3D11_SDK_VERSION, &device, nullptr,
                               &context);
  drop(adapter);
  ID3D11Device1* device1 = nullptr;
  if (SUCCEEDED(status))
    status = device->QueryInterface(IID_PPV_ARGS(&device1));
  drop(device);
  if (FAILED(status) || !device1) {
    drop(context);
    drop(factory);
    wchar_t text[96];
    std::swprintf(text, 96, L"無法在模擬器的顯示卡上建立 Direct3D 11（0x%08lX）。", static_cast<unsigned long>(status));
    app.gpu_error = text;
    note(L"gpu: Direct3D 11 device failed 0x%08lx", static_cast<unsigned long>(status));
    return false;
  }
  app.factory = factory;
  app.device = device1;
  app.context = context;
  app.adapter = luid;
  app.gpu_error.clear();
  return true;
}
// A swap chain of the picture's own size. In a preview cell the picture is
// stretched to the cell; an output window has exactly the picture's size.
IDXGISwapChain1* create_chain(HWND window, UINT width, UINT height, bool flip) {
  if (!app.device || !app.factory || !window)
    return nullptr;
  DXGI_SWAP_CHAIN_DESC1 desc{};
  desc.Width = width;
  desc.Height = height;
  desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
  desc.SampleDesc.Count = 1;
  desc.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
  desc.BufferCount = flip ? 2 : 1;
  desc.Scaling = DXGI_SCALING_STRETCH;
  desc.SwapEffect = flip ? DXGI_SWAP_EFFECT_FLIP_DISCARD : DXGI_SWAP_EFFECT_DISCARD;
  desc.AlphaMode = DXGI_ALPHA_MODE_IGNORE;
  IDXGISwapChain1* chain = nullptr;
  HRESULT status = app.factory->CreateSwapChainForHwnd(app.device, window, &desc, nullptr, nullptr, &chain);
  if (FAILED(status) && flip) {
    // Windows before 10: the older presentation model shows the same picture.
    desc.BufferCount = 1;
    desc.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;
    status = app.factory->CreateSwapChainForHwnd(app.device, window, &desc, nullptr, nullptr, &chain);
  }
  if (FAILED(status)) {
    note(L"swap chain %ux%u failed 0x%08lx", width, height, static_cast<unsigned long>(status));
    return nullptr;
  }
  app.factory->MakeWindowAssociation(window, DXGI_MWA_NO_ALT_ENTER | DXGI_MWA_NO_WINDOW_CHANGES);
  return chain;
}
bool present(IDXGISwapChain1* chain, ID3D11Texture2D* picture) {
  ID3D11Texture2D* back = nullptr;
  if (!chain || FAILED(chain->GetBuffer(0, IID_PPV_ARGS(&back))))
    return false;
  app.context->CopyResource(back, picture);
  back->Release();
  const HRESULT status = chain->Present(0, 0);
  return SUCCEEDED(status) || status == DXGI_STATUS_OCCLUDED;
}
bool open_textures(Feed& feed, unsigned index, std::uint32_t pid, std::uint32_t generation) {
  for (unsigned slot = 0; slot < Slots; ++slot) {
    wchar_t name[96]{};
    texture_name(name, 96, pid, generation, index, slot);
    const HRESULT status = app.device->OpenSharedResourceByName(name, DXGI_SHARED_RESOURCE_READ, IID_PPV_ARGS(&feed.textures[slot]));
    if (FAILED(status)) {
      if (feed.refused != generation)
        note(L"camera %u: opening %ls failed 0x%08lx", index + 1, name, static_cast<unsigned long>(status));
      feed.refused = generation;
      close_textures(feed);
      return false;
    }
  }
  D3D11_TEXTURE2D_DESC desc{};
  feed.textures[0]->GetDesc(&desc);
  if (!valid_size(desc.Width, desc.Height) || desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM) {
    if (feed.refused != generation)
      note(L"camera %u: unexpected texture %ux%u format %u", index + 1, desc.Width, desc.Height, static_cast<unsigned>(desc.Format));
    feed.refused = generation;
    close_textures(feed);
    return false;
  }
  feed.width = desc.Width;
  feed.height = desc.Height;
  feed.generation = generation;
  note(L"camera %u: textures %u opened, %ux%u bind 0x%x misc 0x%x", index + 1, generation, desc.Width, desc.Height, desc.BindFlags,
       desc.MiscFlags);
  return true;
}

// --- windows per camera ---------------------------------------------------
void output_title(wchar_t* text, std::size_t count, unsigned index) {
  std::swprintf(text, count, L"Polaris Cam %u", index + 1);
}
void close_output(Feed& feed) {
  close_chain(feed.output_chain);
  if (feed.output)
    DestroyWindow(feed.output);
  feed.output = nullptr;
}
// A swap chain of this size on the window: kept, resized, or made.
void fit_chain(IDXGISwapChain1*& chain, HWND window, UINT width, UINT height, bool flip) {
  if (chain) {
    DXGI_SWAP_CHAIN_DESC1 desc{};
    if (SUCCEEDED(chain->GetDesc1(&desc)) && desc.Width == width && desc.Height == height)
      return;
    // No picture of the old size is held anywhere: the buffers can go.
    if (SUCCEEDED(chain->ResizeBuffers(0, width, height, DXGI_FORMAT_UNKNOWN, 0)))
      return;
    close_chain(chain);
    app.context->ClearState();
    app.context->Flush();
  }
  chain = create_chain(window, width, height, flip);
}
// A window that has shown pictures through its swap chain no longer shows
// what is painted on it, so "no picture" is a dark picture.
void blank(IDXGISwapChain1* chain) {
  ID3D11Texture2D* back = nullptr;
  ID3D11RenderTargetView* view = nullptr;
  if (!chain || !app.device || FAILED(chain->GetBuffer(0, IID_PPV_ARGS(&back))))
    return;
  if (SUCCEEDED(app.device->CreateRenderTargetView(back, nullptr, &view))) {
    const float dark[4]{24 / 255.f, 28 / 255.f, 36 / 255.f, 1};
    app.context->ClearRenderTargetView(view, dark);
    view->Release();
  }
  back->Release();
  chain->Present(0, 0);
}
// An output window exists for every ticked camera while "output windows" is
// on, with or without a picture, so that OBS keeps finding it and it stays
// where it was put. Its client area is the picture, pixel for pixel.
void sync_output(unsigned index) {
  auto& feed = app.feeds[index];
  if (!app.settings.windows || !((app.settings.mask >> index) & 1u)) {
    close_output(feed);
    return;
  }
  const UINT width = feed.generation ? feed.width : app.settings.width(), height = feed.generation ? feed.height : app.settings.height;
  if (!feed.output) {
    wchar_t title[32];
    output_title(title, 32, index);
    const int offset = px(48) * static_cast<int>(index + 1);
    feed.output = CreateWindowExW(0, OutputClass, title, WS_POPUP, offset, offset, static_cast<int>(width), static_cast<int>(height), nullptr,
                                  nullptr, app.instance, reinterpret_cast<void*>(static_cast<UINT_PTR>(index)));
    if (!feed.output)
      return;
    ShowWindow(feed.output, SW_SHOWNOACTIVATE);
  }
  RECT client{};
  if (GetClientRect(feed.output, &client) && (client.right != static_cast<LONG>(width) || client.bottom != static_cast<LONG>(height)))
    SetWindowPos(feed.output, nullptr, 0, 0, static_cast<int>(width), static_cast<int>(height), SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
  if (app.device && (feed.generation || feed.output_chain)) {
    fit_chain(feed.output_chain, feed.output, width, height, true);
    if (!feed.live)
      blank(feed.output_chain);
  }
}
void sync_cell(unsigned index) {
  auto& feed = app.feeds[index];
  // A failed camera's cell shows its failure in text, which a swap chain would cover.
  if (!feed.generation || !app.device || feed.failure != FeedFailure::none) {
    close_chain(feed.cell_chain);
    return;
  }
  fit_chain(feed.cell_chain, feed.cell, feed.width, feed.height, false);
}

// --- one pass --------------------------------------------------------------
// Shows a camera's newest picture, if there is one it has not shown yet.
void show_newest(unsigned index, std::uint64_t now) {
  auto& feed = app.feeds[index];
  auto& announced = app.link.get()->status.feeds[index];
  const auto pid = app.link.get()->status.pid;
  const auto generation = static_cast<std::uint32_t>(load(announced.generation));
  if (generation != feed.generation) {
    // New textures (another size), or none any more. Textures that do not
    // open yet are tried again on the next pass.
    const bool had = feed.generation != 0 || feed.live;
    close_textures(feed);
    feed.live = false;
    if (generation)
      open_textures(feed, index, pid, generation);
    if (had || feed.generation) {
      sync_cell(index);
      sync_output(index);
      InvalidateRect(feed.cell, nullptr, TRUE);
      if (feed.output)
        InvalidateRect(feed.output, nullptr, TRUE);
    }
  }
  if (!feed.generation || feed.failure != FeedFailure::none)
    return;
  auto published = load(announced.published);
  if (!published_frames(static_cast<std::uint64_t>(published)) || published_frames(static_cast<std::uint64_t>(published)) == feed.frames)
    return;
  // Say which texture is being copied, then make sure it is still the newest:
  // the bridge writes neither the newest nor the one named here.
  for (int round = 0; round < 4; ++round) {
    const auto slot = published_slot(static_cast<std::uint64_t>(published));
    if (slot >= Slots)
      return;
    store(announced.reading, static_cast<LONG>(slot));
    const auto again = load(announced.published);
    if (again == published)
      break;
    published = again;
  }
  const auto slot = published_slot(static_cast<std::uint64_t>(published));
  if (slot >= Slots || !feed.textures[slot])
    return;
  if (!feed.cell_chain)
    sync_cell(index);
  bool ok = !feed.cell_chain || present(feed.cell_chain, feed.textures[slot]);
  if (feed.output_chain)
    ok = present(feed.output_chain, feed.textures[slot]) && ok;
  app.context->Flush();
  if (!ok && FAILED(app.device->GetDeviceRemovedReason())) {
    close_gpu();
    return;
  }
  feed.frames = published_frames(static_cast<std::uint64_t>(published));
  feed.shown_slot = slot;
  feed.shown_ms = now;
  if (!feed.live) {
    feed.live = true;
    ValidateRect(feed.cell, nullptr);
    note(L"camera %u: live, picture %llu", index + 1, static_cast<unsigned long long>(feed.frames));
  }
}

const wchar_t* reason_text(std::uint32_t reason) {
  switch (reason) {
    case reason_not_connected:
      return L"Taxi Cam 還沒連上模擬器：在這份 Taxi Cam 的視窗按 Connect。";
    case reason_loading:
      return L"航班還在載入。";
    case reason_aircraft:
      return L"這架飛機還沒在 Taxi Cam 設定好（Aircraft → 設定顯示器）。";
    case reason_stalled:
      return L"模擬器剛才卡住，鏡頭已暫停，畫面恢復後會自動繼續；一直沒繼續的話，取消再勾選「直播模式」。";
    case reason_starting:
      return L"正在建立鏡頭…";
    case reason_resizing:
      return L"正在把鏡頭換成直播尺寸…";
    case reason_failed:
      return L"鏡頭無法啟動。";
    default:
      return L"";
  }
}
std::wstring widen(const char* text, std::size_t limit) {
  std::wstring out;
  for (std::size_t i = 0; i < limit && text[i]; ++i)
    out += static_cast<wchar_t>(static_cast<unsigned char>(text[i]) < 0x80 ? text[i] : '?');
  return out;
}
void update_status(std::uint64_t now) {
  std::wstring text;
  const auto* link = app.link.get();
  if (!link) {
    text = L"無法建立與模擬器之間的共享區。";
  } else if (!bridge_present(now)) {
    text = L"尚未連上模擬器。\r\n請開啟 MSFS 2024，執行同資料夾的 taxi-cam.exe 並按 Connect。";
  } else if (link->status.protocol != LinkVersion) {
    text = L"模擬器裡的 bridge 版本和這個視窗不同：請關閉 MSFS，兩個程式都用同一份下載檔重新開啟。";
  } else {
    const auto& s = link->status;
    wchar_t line[256];
    switch (s.state) {
      case link_idle:
        text = L"已連上模擬器。勾選「直播模式」開始。";
        break;
      case link_live:
        std::swprintf(line, 256, L"直播中：%u×%u，每顆鏡頭 %u fps。", app.settings.width(), app.settings.height, s.fps);
        text = line;
        break;
      default: {
        // The ticked cameras and those of them that failed (update_failure).
        const std::uint32_t ticked = app.settings.mask & ((1u << Feeds) - 1);
        std::uint32_t failed = 0;
        for (unsigned index = 0; index < Feeds; ++index)
          if (app.feeds[index].failure != FeedFailure::none)
            failed |= 1u << index;
        if (ticked_cameras_all_failed(s.state, s.reason, ticked, failed)) {
          text = L"勾選的鏡頭都無法啟動。關掉再開直播模式可再試。";
          break;
        }
        text = reason_text(s.reason);
        if (s.reason == reason_failed || s.reason == reason_aircraft)
          text += L"\r\n" + widen(s.message, sizeof(s.message));
        break;
      }
    }
    if (s.sim_fps > 0) {
      if (s.view_ms > 0 && s.state == link_live)
        std::swprintf(line, 256, L"\r\n模擬器 %.0f fps｜每張鏡頭畫面約佔 %.1f ms", static_cast<double>(s.sim_fps), static_cast<double>(s.view_ms));
      else
        std::swprintf(line, 256, L"\r\n模擬器 %.0f fps", static_cast<double>(s.sim_fps));
      text += line;
    }
    if (!app.gpu_error.empty())
      text += L"\r\n" + app.gpu_error;
  }
  if (text != app.status_text) {
    app.status_text = text;
    SetDlgItemTextW(app.main, IdStatus, text.c_str());
  }
}
void fill_mount_fields();
bool adjusting(HWND focus);
void held_keys(std::uint64_t now);
void apply_mount(Mount mount);
void save_mounts();
RECT cell_rect(unsigned index);
RECT label_rect(unsigned index);

// A camera that should show a picture and cannot: the bridge could not start
// it, or this window could not open its textures (show_newest has just tried).
// Its cell then says so, instead of "waiting" or its last picture; its output
// window stays dark, since OBS sends what that shows. announced is nullptr
// while there is no bridge to read.
void update_failure(unsigned index, const FeedStatus* announced) {
  auto& feed = app.feeds[index];
  auto failure = FeedFailure::none;
  if (announced) {
    const auto generation = static_cast<std::uint32_t>(load(announced->generation));
    if (announced->state == feed_failed)
      failure = FeedFailure::start;
    else if (app.device && generation && !feed.generation && feed.refused == generation)
      failure = FeedFailure::textures;
  }
  if (failure == feed.failure)
    return;
  feed.failure = failure;
  note(L"camera %u: %ls", index + 1,
       failure == FeedFailure::start      ? L"failed, the bridge could not start it"
       : failure == FeedFailure::textures ? L"failed, its textures did not open"
                                          : L"no longer failed");
  if (failure != FeedFailure::none)
    feed.live = false;  // its last picture is not kept on show
  sync_cell(index);
  sync_output(index);
  InvalidateRect(feed.cell, nullptr, TRUE);
  if (feed.output)
    InvalidateRect(feed.output, nullptr, TRUE);
  const RECT label = label_rect(index);
  InvalidateRect(app.main, &label, TRUE);
}
// Whether the cell and its label show the camera's failure: only while it is
// ticked and the broadcast is on, as they say so otherwise.
bool shows_failure(unsigned index) {
  return app.feeds[index].failure != FeedFailure::none && ((app.settings.mask >> index) & 1u) && app.settings.enabled;
}
const wchar_t* failure_text(FeedFailure failure) {
  return failure == FeedFailure::textures ? L"無法開啟這顆鏡頭的畫面" : L"這顆鏡頭無法啟動";
}

// One pass: the heartbeat, the bridge's state, every camera's newest picture.
// Run after each wait in the main loop and from a timer, which also fires
// while Windows runs a loop of its own (a window being dragged, a menu), so
// the pictures and the heartbeat do not stop then.
void tick() {
  if (app.ticking)
    return;
  app.ticking = true;
  struct Done {
    ~Done() { app.ticking = false; }
  } done;
  const auto now = GetTickCount64();
  auto* link = app.link.get();
  held_keys(now);
  if (app.mounts_dirty_ms && now - app.mounts_dirty_ms >= 1000) {
    app.mounts_dirty_ms = 0;
    save_mounts();
  }
  if (now - app.heartbeat_ms >= 500)
    write_link();
  const bool present_bridge = bridge_present(now);
  if (link && present_bridge) {
    // The mounts belong to the aircraft that is loaded.
    const auto key = aircraft_key(link->status.aircraft);
    if (key != app.aircraft && key != L"default") {
      save_mounts();
      app.aircraft = key;
      load_mounts(key);
      fill_mount_fields();
      write_link();
    }
    const auto luid = link->status.adapter;
    if (app.bridge_pid != link->status.pid) {
      app.bridge_pid = link->status.pid;
      note(L"bridge: pid %lu link version %u aircraft %hs", static_cast<unsigned long>(link->status.pid), link->status.protocol,
           link->status.aircraft);
    }
    if ((luid.LowPart || luid.HighPart) && link->status.protocol == LinkVersion) {
      if (!app.device && now >= app.gpu_retry_ms && !open_gpu(luid))
        app.gpu_retry_ms = now + 2000;
      else if (app.device && (app.adapter.LowPart != luid.LowPart || app.adapter.HighPart != luid.HighPart))
        close_gpu();
    }
    if (app.device)
      for (unsigned index = 0; index < Feeds && app.device; ++index)
        show_newest(index, now);
  } else if (app.device) {
    note(L"bridge: gone");
    app.bridge_pid = 0;
    close_gpu();  // The simulator went away: its textures go with it.
    for (auto& feed : app.feeds) {
      InvalidateRect(feed.cell, nullptr, TRUE);
      if (feed.output)
        InvalidateRect(feed.output, nullptr, TRUE);
    }
  }
  // A bridge of another version may not lay the status out the same way.
  const bool readable = link && present_bridge && link->status.protocol == LinkVersion;
  for (unsigned index = 0; index < Feeds; ++index)
    update_failure(index, readable ? &link->status.feeds[index] : nullptr);
  if (now - app.rate_ms >= 1000) {
    const double seconds = app.rate_ms ? static_cast<double>(now - app.rate_ms) / 1000.0 : 0;
    for (unsigned index = 0; index < Feeds; ++index) {
      auto& feed = app.feeds[index];
      feed.fps = seconds > 0 && feed.frames >= feed.counted ? static_cast<double>(feed.frames - feed.counted) / seconds : 0;
      feed.counted = feed.frames;
    }
    app.rate_ms = now;
  }
  if (now - app.labels_ms >= 500) {
    app.labels_ms = now;
    update_status(now);
    for (unsigned index = 0; index < Feeds; ++index) {
      const RECT label = label_rect(index);
      InvalidateRect(app.main, &label, TRUE);
    }
  }
}

// --- layout -----------------------------------------------------------------
constexpr int PanelWidth = 336, Margin = 16, LabelHeight = 24;
RECT preview_area() {
  RECT client{};
  GetClientRect(app.main, &client);
  return {px(PanelWidth + Margin), px(Margin), std::max(client.right - px(Margin), static_cast<LONG>(px(PanelWidth + Margin + 64))),
          std::max(client.bottom - px(Margin), static_cast<LONG>(px(Margin + 64)))};
}
// The previews: two columns of 16:9 pictures, each under its label line, as
// large as the area allows and packed from its top left.
SIZE cell_size() {
  const RECT area = preview_area();
  if (app.enlarged < Feeds) {
    const int border = px(2), label = px(LabelHeight);
    int width = std::max<int>(area.right - area.left - 2 * border, 32), height = width * 9 / 16;
    const int available = area.bottom - area.top - label - 2 * border;
    if (height > available) {
      height = std::max(available, 18);
      width = height * 16 / 9;
    }
    return {width, height};
  }
  const int gap = px(12), border = px(2), label = px(LabelHeight);
  int width = std::max<int>((area.right - area.left - gap) / 2 - 2 * border, 32), height = width * 9 / 16;
  const int available = (area.bottom - area.top - gap) / 2 - label - 2 * border;
  if (height > available) {
    height = std::max(available, 18);
    width = height * 16 / 9;
  }
  return {width, height};
}
// The cell's whole slot: its label line and, below it, the picture in its frame.
RECT slot_rect(unsigned index) {
  const RECT area = preview_area();
  const SIZE cell = cell_size();
  const int gap = px(12), border = px(2), label = px(LabelHeight);
  const int width = cell.cx + 2 * border, height = label + cell.cy + 2 * border;
  if (app.enlarged < Feeds)
    return index == app.enlarged ? RECT{area.left, area.top, area.left + width, area.top + height} : RECT{};
  const int left = area.left + static_cast<int>(index % 2) * (width + gap), top = area.top + static_cast<int>(index / 2) * (height + gap);
  return {left, top, left + width, top + height};
}
RECT label_rect(unsigned index) {
  RECT slot = slot_rect(index);
  slot.bottom = slot.top + px(LabelHeight);
  return slot;
}
RECT cell_rect(unsigned index) {
  const RECT slot = slot_rect(index);
  const SIZE cell = cell_size();
  const int left = slot.left + px(2), top = slot.top + px(LabelHeight) + px(2);
  return {left, top, left + cell.cx, top + cell.cy};
}
HWND control(int id) {
  return GetDlgItem(app.main, id);
}
void layout() {
  for (unsigned index = 0; index < Feeds; ++index) {
    const RECT cell = cell_rect(index);
    const bool shown = app.enlarged >= Feeds || index == app.enlarged;
    SetWindowPos(app.feeds[index].cell, nullptr, cell.left, cell.top, cell.right - cell.left, cell.bottom - cell.top,
                 SWP_NOZORDER | SWP_NOACTIVATE | (shown ? SWP_SHOWWINDOW : SWP_HIDEWINDOW));
  }
  RECT client{};
  GetClientRect(app.main, &client);
  // The help text takes what is left of the panel's height.
  const int hint_top = px(530);
  SetWindowPos(control(IdHint), nullptr, px(Margin), hint_top, px(PanelWidth - Margin - 8),
               std::max(static_cast<int>(client.bottom) - hint_top - px(Margin), px(20)), SWP_NOZORDER | SWP_NOACTIVATE);
  InvalidateRect(app.main, nullptr, TRUE);
}
HWND make(const wchar_t* type, const wchar_t* text, DWORD style, int x, int y, int width, int height, int id, HFONT font = nullptr) {
  HWND window = CreateWindowExW(std::wcscmp(type, L"EDIT") == 0 ? WS_EX_CLIENTEDGE : 0, type, text, WS_CHILD | WS_VISIBLE | style, px(x), px(y),
                                px(width), px(height), app.main, reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)), app.instance, nullptr);
  SendMessageW(window, WM_SETFONT, reinterpret_cast<WPARAM>(font ? font : app.font), TRUE);
  return window;
}
constexpr std::array<const wchar_t*, 6> FieldNames{L"往右 (m)", L"往上 (m)", L"往前 (m)", L"抬頭 (°)", L"右轉 (°)", L"視角 (°)"};
// A mount value as its field shows it: metres to the centimetre, degrees to a tenth.
void field_text(wchar_t* text, std::size_t count, unsigned i, const Mount& mount) {
  if (i == 5)
    std::swprintf(text, count, L"%.1f", mount[5] * 180.0 / Pi);
  else
    std::swprintf(text, count, i < 3 ? L"%.2f" : L"%.1f", mount[i]);
}
void fill_mount_fields() {
  app.filling = true;
  const auto& mount = app.settings.mounts[app.selected];
  for (unsigned i = 0; i < 6; ++i) {
    wchar_t text[32];
    field_text(text, 32, i, mount);
    SetDlgItemTextW(app.main, IdField + static_cast<int>(i), text);
  }
  SendMessageW(control(IdSelect), CB_SETCURSEL, app.selected, 0);
  for (unsigned feed = 0; feed < Feeds; ++feed) {
    SendMessageW(control(IdPreset + static_cast<int>(feed)), CB_SETCURSEL, static_cast<WPARAM>(app.settings.presets[feed]), 0);
    Button_SetCheck(control(IdCamera + static_cast<int>(feed)), (app.settings.mask >> feed) & 1u ? BST_CHECKED : BST_UNCHECKED);
  }
  app.filling = false;
}
void fill_controls() {
  app.filling = true;
  const auto& s = app.settings;
  Button_SetCheck(control(IdEnable), s.enabled ? BST_CHECKED : BST_UNCHECKED);
  Button_SetCheck(control(IdSize1080), s.height == 1080 ? BST_CHECKED : BST_UNCHECKED);
  Button_SetCheck(control(IdSize720), s.height == 720 ? BST_CHECKED : BST_UNCHECKED);
  int choice = 0;
  for (std::size_t i = 0; i < FpsChoices.size(); ++i)
    if (FpsChoices[i] <= s.fps)
      choice = static_cast<int>(i);
  SendMessageW(control(IdFps), CB_SETCURSEL, static_cast<WPARAM>(choice), 0);
  Button_SetCheck(control(IdWindows), s.windows ? BST_CHECKED : BST_UNCHECKED);
  app.filling = false;
  fill_mount_fields();
}
void create_controls() {
  make(L"STATIC", AppTitle, 0, Margin, 12, 200, 28, -1, app.title);
  make(L"STATIC", L"原型 " POLARIS_CAM_VERSION_WIDE L"（Taxi Cam " TAXI_CAM_VERSION_WIDE L"）", SS_RIGHT, 150, 20, 178, 18, -1);
  make(L"STATIC", L"", 0, Margin, 44, PanelWidth - Margin - 8, 64, IdStatus);
  make(L"BUTTON", L"直播模式", BS_AUTOCHECKBOX | WS_TABSTOP, Margin, 112, 110, 22, IdEnable, app.bold);
  make(L"STATIC", L"畫質", 0, Margin, 146, 40, 20, -1);
  make(L"BUTTON", L"1080p", BS_AUTORADIOBUTTON | WS_GROUP | WS_TABSTOP, 64, 144, 72, 22, IdSize1080);
  make(L"BUTTON", L"720p", BS_AUTORADIOBUTTON, 140, 144, 64, 22, IdSize720);
  make(L"STATIC", L"幀數", WS_GROUP, Margin, 176, 40, 20, -1);
  HWND fps = make(L"COMBOBOX", L"", CBS_DROPDOWNLIST | WS_VSCROLL | WS_TABSTOP, 64, 172, 72, 240, IdFps);
  for (const auto value : FpsChoices) {
    wchar_t text[8];
    std::swprintf(text, 8, L"%u", value);
    SendMessageW(fps, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(text));
  }
  make(L"STATIC", L"fps（每顆鏡頭）", 0, 142, 176, 150, 20, -1);
  make(L"STATIC", L"鏡頭（勾選的才會渲染）", 0, Margin, 208, 300, 20, -1, app.bold);
  for (unsigned feed = 0; feed < Feeds; ++feed) {
    wchar_t text[16];
    std::swprintf(text, 16, L"鏡頭 %u", feed + 1);
    const int y = 232 + static_cast<int>(feed) * 28;
    make(L"BUTTON", text, BS_AUTOCHECKBOX | WS_TABSTOP, Margin, y, 70, 22, IdCamera + static_cast<int>(feed));
    HWND preset = make(L"COMBOBOX", L"", CBS_DROPDOWNLIST | WS_VSCROLL | WS_TABSTOP, 90, y - 2, 238, 240, IdPreset + static_cast<int>(feed));
    for (const auto& item : Presets)
      SendMessageW(preset, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(item.name));
    SendMessageW(preset, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(L"自訂"));
  }
  make(L"STATIC", L"調整位置", 0, Margin, 352, 70, 20, -1, app.bold);
  HWND select = make(L"COMBOBOX", L"", CBS_DROPDOWNLIST | WS_TABSTOP, 90, 348, 100, 200, IdSelect);
  for (unsigned feed = 0; feed < Feeds; ++feed) {
    wchar_t text[16];
    std::swprintf(text, 16, L"鏡頭 %u", feed + 1);
    SendMessageW(select, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(text));
  }
  make(L"BUTTON", L"重設", WS_TABSTOP, 200, 347, 60, 26, IdReset);
  // Two columns: position on the left, direction and view angle on the right.
  constexpr std::array<int, 6> Column{0, 0, 0, 1, 1, 1}, Row{0, 1, 2, 0, 1, 2};
  for (unsigned i = 0; i < 6; ++i) {
    const int x = Margin + Column[i] * 160, y = 382 + Row[i] * 32;
    make(L"STATIC", FieldNames[i], 0, x, y + 4, 66, 20, -1);
    make(L"EDIT", L"", ES_AUTOHSCROLL | WS_TABSTOP, x + 68, y, 76, 25, IdField + static_cast<int>(i));
  }
  make(L"BUTTON", L"開啟給 OBS 擷取的輸出視窗", BS_AUTOCHECKBOX | WS_TABSTOP, Margin, 492, 300, 22, IdWindows);
  make(L"STATIC",
       L"直播模式開啟時，駕駛艙螢幕上的滑行鏡頭會暫停。\r\n\r\n"
       L"在預覽上：左鍵拖曳 轉向　右鍵拖曳 平移\r\n"
       L"滾輪 前進後退　Ctrl＋滾輪 拉近拉遠\r\n"
       L"雙擊 放大這顆／回到四格\r\n"
       L"點過預覽後按住 W A S D 移動、Q E 下上、\r\n"
       L"方向鍵 轉向；Shift 快、Ctrl 慢。\r\n\r\n"
       L"OBS：來源 → 視窗擷取 → 選「Polaris Cam 1」…\r\n"
       L"擷取方式選「Windows 10 (1903 以上)」。\r\n"
       L"輸出視窗可拖到別的螢幕或被其他視窗蓋住，但不要最小化；在輸出視窗上按右鍵可關閉。",
       0, Margin, 488, PanelWidth - Margin - 8, 200, IdHint);
}

// --- changes ----------------------------------------------------------------
void settings_changed(bool mounts_only = false) {
  if (!mounts_only)
    note(L"settings: %ls %ux%u %u fps cameras 0x%x windows %d", app.settings.enabled ? L"on" : L"off", app.settings.width(),
         app.settings.height, app.settings.fps, app.settings.mask, app.settings.windows ? 1 : 0);
  write_link();
  if (mounts_only)
    save_mounts();
  else
    save_settings();
  for (unsigned index = 0; index < Feeds; ++index) {
    sync_output(index);
    InvalidateRect(app.feeds[index].cell, nullptr, TRUE);
  }
  InvalidateRect(app.main, nullptr, TRUE);
}
void select_camera(unsigned index) {
  if (index >= Feeds)
    return;
  app.selected = index;
  fill_mount_fields();
  InvalidateRect(app.main, nullptr, TRUE);
}
void read_mount_fields() {
  if (app.filling)
    return;
  Mount mount = app.settings.mounts[app.selected];
  bool changed = false;
  for (unsigned i = 0; i < 6; ++i) {
    // Only a field that was typed in: one that still shows the value it was
    // filled with has not changed, though that text is rounded.
    wchar_t text[32]{}, shown[32]{};
    GetDlgItemTextW(app.main, IdField + static_cast<int>(i), text, 32);
    field_text(shown, 32, i, mount);
    if (std::wcscmp(text, shown) == 0)
      continue;
    wchar_t* end = nullptr;
    double value = std::wcstod(text, &end);
    if (end == text || !std::isfinite(value))
      continue;
    mount[i] = i == 5 ? value * Pi / 180.0 : value;
    changed = true;
  }
  if (changed)
    apply_mount(mount);
  fill_mount_fields();
}
// Mount changes. They reach the bridge at once (write_link is a few bytes of
// shared memory) and are saved a moment after the last one, so a drag does
// not write the file on every step.
void apply_mount(Mount mount) {
  if (mount[4] > 180)
    mount[4] -= 360;
  if (mount[4] < -180)
    mount[4] += 360;
  mount[3] = std::clamp(mount[3], -MaximumPitch, MaximumPitch);
  mount[5] = std::clamp(mount[5], MinimumFov, MaximumFov);
  for (unsigned i = 0; i < 3; ++i)
    mount[i] = std::clamp(mount[i], -200.0, 200.0);
  if (!valid_mount(mount.data()))
    return;
  app.settings.mounts[app.selected] = mount;
  if (app.settings.presets[app.selected] != CustomPreset) {
    app.settings.presets[app.selected] = CustomPreset;
    app.filling = true;
    SendMessageW(control(IdPreset + static_cast<int>(app.selected)), CB_SETCURSEL, CustomPreset, 0);
    app.filling = false;
  }
  fill_mount_fields();
  write_link();
  app.mounts_dirty_ms = GetTickCount64();
}
// Movement in the camera's own directions, in the aircraft's axes (right, up,
// forward): forward is where it looks, level; right is square to that.
void move_camera(Mount& mount, double forward, double right, double up) {
  const double yaw = mount[4] * Pi / 180.0;
  mount[0] += std::sin(yaw) * forward + std::cos(yaw) * right;
  mount[2] += std::cos(yaw) * forward - std::sin(yaw) * right;
  mount[1] += up;
}
double speed_scale() {
  return GetKeyState(VK_SHIFT) < 0 ? 4.0 : GetKeyState(VK_CONTROL) < 0 ? 0.2 : 1.0;
}
// Held keys move the selected camera smoothly while a preview has the
// keyboard: 1 m/s and 45 degrees/s, four times with Shift, a fifth with Ctrl.
void held_keys(std::uint64_t now) {
  const double seconds = app.keys_ms && now > app.keys_ms ? std::min((now - app.keys_ms) / 1000.0, 0.1) : 0.0;
  app.keys_ms = now;
  if (!seconds || GetForegroundWindow() != app.main || !adjusting(GetFocus()))
    return;
  const auto down = [](int key) { return GetAsyncKeyState(key) < 0; };
  const double forward = (down('W') ? 1 : 0) - (down('S') ? 1 : 0), right = (down('D') ? 1 : 0) - (down('A') ? 1 : 0),
               up = (down('E') || down('R') ? 1 : 0) - (down('Q') || down('F') ? 1 : 0),
               turn = (down(VK_RIGHT) ? 1 : 0) - (down(VK_LEFT) ? 1 : 0), tilt = (down(VK_UP) ? 1 : 0) - (down(VK_DOWN) ? 1 : 0),
               zoom = (down(VK_OEM_PLUS) || down(VK_ADD) ? 1 : 0) - (down(VK_OEM_MINUS) || down(VK_SUBTRACT) ? 1 : 0);
  if (!forward && !right && !up && !turn && !tilt && !zoom)
    return;
  const double scale = speed_scale();
  Mount mount = app.settings.mounts[app.selected];
  move_camera(mount, forward * seconds * scale, right * seconds * scale, up * seconds * scale);
  mount[4] += turn * 45 * seconds * scale;
  mount[3] += tilt * 45 * seconds * scale;
  mount[5] -= zoom * (20 * Pi / 180) * seconds * scale;  // a narrower angle is closer
  apply_mount(mount);
}
// A drag on a preview. The camera turns the way the mouse moves, as in Taxi
// Cam's own live view: across the whole picture is its whole view angle.
void drag_to(HWND cell, POINT at) {
  const int dx = at.x - app.drag_at.x, dy = at.y - app.drag_at.y;
  if (!dx && !dy)
    return;
  app.drag_at = at;
  app.dragged = true;
  RECT client{};
  GetClientRect(cell, &client);
  const double width = std::max<LONG>(client.right, 1);
  Mount mount = app.settings.mounts[app.selected];
  if (app.drag == 1) {
    const double per_pixel = mount[5] * 180.0 / Pi / width;  // the view angle across the picture
    mount[4] += dx * per_pixel;
    mount[3] -= dy * per_pixel;
  } else {
    const double per_pixel = 3.0 / width * speed_scale();  // the picture's width is 3 m of movement
    move_camera(mount, 0, dx * per_pixel, -dy * per_pixel);
  }
  apply_mount(mount);
}
void on_command(int id, int code) {
  if (app.filling)
    return;
  auto& s = app.settings;
  if (id == IdEnable && code == BN_CLICKED) {
    s.enabled = Button_GetCheck(control(IdEnable)) == BST_CHECKED;
    settings_changed();
  } else if ((id == IdSize1080 || id == IdSize720) && code == BN_CLICKED) {
    s.height = id == IdSize720 ? 720 : 1080;
    settings_changed();
  } else if (id == IdFps && code == CBN_SELCHANGE) {
    const auto choice = SendMessageW(control(IdFps), CB_GETCURSEL, 0, 0);
    if (choice >= 0 && choice < static_cast<LRESULT>(FpsChoices.size()))
      s.fps = FpsChoices[static_cast<std::size_t>(choice)];
    settings_changed();
  } else if (id == IdWindows && code == BN_CLICKED) {
    s.windows = Button_GetCheck(control(IdWindows)) == BST_CHECKED;
    settings_changed();
  } else if (id == IdSelect && code == CBN_SELCHANGE) {
    const auto choice = SendMessageW(control(IdSelect), CB_GETCURSEL, 0, 0);
    if (choice >= 0)
      select_camera(static_cast<unsigned>(choice));
  } else if (id >= IdCamera && id < IdCamera + static_cast<int>(Feeds) && code == BN_CLICKED) {
    const unsigned feed = static_cast<unsigned>(id - IdCamera);
    std::uint32_t mask = s.mask;
    if (Button_GetCheck(control(id)) == BST_CHECKED)
      mask |= 1u << feed;
    else
      mask &= ~(1u << feed);
    if (!mask) {
      // At least one camera: the last one stays ticked.
      Button_SetCheck(control(id), BST_CHECKED);
      return;
    }
    s.mask = mask;
    settings_changed();
  } else if (id >= IdPreset && id < IdPreset + static_cast<int>(Feeds) && code == CBN_SELCHANGE) {
    const unsigned feed = static_cast<unsigned>(id - IdPreset);
    const auto choice = SendMessageW(control(id), CB_GETCURSEL, 0, 0);
    if (choice >= 0 && choice < CustomPreset) {
      s.presets[feed] = static_cast<int>(choice);
      s.mounts[feed] = Presets[static_cast<std::size_t>(choice)].mount;
    } else {
      s.presets[feed] = CustomPreset;
    }
    app.selected = feed;
    fill_mount_fields();
    settings_changed(true);
  } else if (id == IdReset && code == BN_CLICKED) {
    // Back to the camera's starting place: its preset, or its default one.
    const int preset = s.presets[app.selected] < CustomPreset ? s.presets[app.selected] : DefaultPresets[app.selected];
    s.presets[app.selected] = preset;
    s.mounts[app.selected] = Presets[static_cast<std::size_t>(preset)].mount;
    fill_mount_fields();
    settings_changed(true);
  } else if (id >= IdField && id < IdField + 6 && code == EN_KILLFOCUS) {
    read_mount_fields();
  } else if (id == IDOK) {
    read_mount_fields();  // Enter in a field
  }
}

// --- painting ---------------------------------------------------------------
const wchar_t* preset_name(unsigned feed) {
  const int preset = app.settings.presets[feed];
  return preset >= 0 && preset < CustomPreset ? Presets[static_cast<std::size_t>(preset)].name : L"自訂";
}
void paint_main(HDC dc) {
  SetBkMode(dc, TRANSPARENT);
  for (unsigned index = 0; index < Feeds; ++index) {
    if (app.enlarged < Feeds && index != app.enlarged)
      continue;
    const auto& feed = app.feeds[index];
    RECT label = label_rect(index);
    const bool selected = index == app.selected, ticked = (app.settings.mask >> index) & 1u;
    wchar_t text[160];
    std::wstring name = preset_name(index);
    name = name.substr(0, name.find(L'（'));
    if (shows_failure(index))
      std::swprintf(text, 160, L"鏡頭 %u｜%ls｜失敗", index + 1, name.c_str());
    else if (feed.live && GetTickCount64() - feed.shown_ms > 2500)
      std::swprintf(text, 160, L"鏡頭 %u｜%ls｜%u×%u｜暫停中", index + 1, name.c_str(), feed.width, feed.height);
    else if (feed.live)
      std::swprintf(text, 160, L"鏡頭 %u｜%ls｜%u×%u｜%.1f fps", index + 1, name.c_str(), feed.width, feed.height, feed.fps);
    else
      std::swprintf(text, 160, L"鏡頭 %u｜%ls%ls", index + 1, name.c_str(), ticked ? L"" : L"｜未勾選");
    SelectObject(dc, selected ? app.bold : app.font);
    SetTextColor(dc, selected ? RGB(0, 90, 200) : RGB(40, 40, 40));
    DrawTextW(dc, text, -1, &label, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS | DT_NOPREFIX);
    RECT frame = cell_rect(index);
    InflateRect(&frame, px(2), px(2));
    HBRUSH brush = CreateSolidBrush(selected ? RGB(0, 120, 215) : RGB(200, 200, 200));
    for (int i = 0; i < px(2); ++i) {
      FrameRect(dc, &frame, brush);
      InflateRect(&frame, -1, -1);
    }
    DeleteObject(brush);
  }
}
constexpr COLORREF PlaceholderColor = RGB(170, 178, 190), FailureColor = RGB(255, 120, 110);
void paint_placeholder(HWND window, HDC dc, const wchar_t* text, COLORREF color = PlaceholderColor) {
  RECT client{};
  GetClientRect(window, &client);
  HBRUSH brush = CreateSolidBrush(RGB(24, 28, 36));
  FillRect(dc, &client, brush);
  DeleteObject(brush);
  SetBkMode(dc, TRANSPARENT);
  SetTextColor(dc, color);
  SelectObject(dc, app.font);
  DrawTextW(dc, text, -1, &client, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
}

// --- window procedures --------------------------------------------------------
unsigned feed_of(HWND window) {
  return static_cast<unsigned>(GetWindowLongPtrW(window, GWLP_USERDATA));
}
LRESULT CALLBACK cell_proc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
  switch (message) {
    case WM_CREATE:
      SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(reinterpret_cast<CREATESTRUCTW*>(lparam)->lpCreateParams));
      return 0;
    case WM_ERASEBKGND:
      return 1;
    case WM_PAINT: {
      const unsigned index = feed_of(window);
      PAINTSTRUCT paint{};
      HDC dc = BeginPaint(window, &paint);
      const auto& feed = app.feeds[index];
      if (feed.live && feed.cell_chain && feed.shown_slot < Slots && feed.textures[feed.shown_slot]) {
        // The picture on show again: its texture is still the one named as
        // being read, so the bridge has not written over it.
        present(feed.cell_chain, feed.textures[feed.shown_slot]);
      } else if (shows_failure(index)) {
        paint_placeholder(window, dc, failure_text(feed.failure), FailureColor);
      } else {
        const bool ticked = (app.settings.mask >> index) & 1u;
        paint_placeholder(window, dc, !ticked ? L"未勾選" : !app.settings.enabled ? L"直播模式未開啟" : L"等待畫面…");
      }
      EndPaint(window, &paint);
      return 0;
    }
    case WM_LBUTTONDOWN:
    case WM_RBUTTONDOWN:
      SetFocus(window);
      if (feed_of(window) != app.selected)
        select_camera(feed_of(window));
      app.drag = message == WM_LBUTTONDOWN ? 1 : 2;
      app.drag_at = {GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
      app.dragged = false;
      SetCapture(window);
      SetCursor(LoadCursorW(nullptr, app.drag == 1 ? IDC_HAND : IDC_SIZEALL));
      return 0;
    case WM_MOUSEMOVE:
      if (app.drag && GetCapture() == window)
        drag_to(window, {GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)});
      return 0;
    case WM_LBUTTONUP:
    case WM_RBUTTONUP:
    case WM_CAPTURECHANGED:
      if (app.drag && GetCapture() == window && message != WM_CAPTURECHANGED)
        ReleaseCapture();
      app.drag = 0;
      return 0;
    case WM_LBUTTONDBLCLK:
      // One preview large, or the four again.
      app.enlarged = app.enlarged < Feeds ? Feeds : feed_of(window);
      layout();
      SetFocus(window);
      return 0;
    case WM_MOUSEWHEEL: {
      const double notches = GET_WHEEL_DELTA_WPARAM(wparam) / static_cast<double>(WHEEL_DELTA);
      Mount mount = app.settings.mounts[app.selected];
      if (GET_KEYSTATE_WPARAM(wparam) & MK_CONTROL)
        mount[5] -= notches * 3 * Pi / 180;  // closer
      else
        move_camera(mount, notches * 0.25 * (GET_KEYSTATE_WPARAM(wparam) & MK_SHIFT ? 4 : 1), 0, 0);
      apply_mount(mount);
      return 0;
    }
    case WM_SETCURSOR:
      if (LOWORD(lparam) == HTCLIENT) {
        SetCursor(LoadCursorW(nullptr, app.drag == 2 ? IDC_SIZEALL : IDC_HAND));
        return TRUE;
      }
      return DefWindowProcW(window, message, wparam, lparam);
    case WM_SETFOCUS:
    case WM_KILLFOCUS:
      InvalidateRect(app.main, nullptr, TRUE);
      return 0;
    case WM_GETDLGCODE:
      return DLGC_WANTARROWS | DLGC_WANTCHARS;
    default:
      return DefWindowProcW(window, message, wparam, lparam);
  }
}
LRESULT CALLBACK output_proc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
  switch (message) {
    case WM_CREATE:
      SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(reinterpret_cast<CREATESTRUCTW*>(lparam)->lpCreateParams));
      return 0;
    case WM_ERASEBKGND:
      return 1;
    case WM_PAINT: {
      PAINTSTRUCT paint{};
      HDC dc = BeginPaint(window, &paint);
      const auto& feed = app.feeds[feed_of(window)];
      if (feed.live && feed.output_chain && feed.shown_slot < Slots && feed.textures[feed.shown_slot])
        present(feed.output_chain, feed.textures[feed.shown_slot]);
      else if (feed.output_chain)
        blank(feed.output_chain);
      else  // dark without a word while the camera failed: OBS sends what this shows
        paint_placeholder(window, dc, feed.failure != FeedFailure::none ? L"" : L"等待畫面…");
      EndPaint(window, &paint);
      return 0;
    }
    case WM_NCHITTEST:
      return HTCAPTION;  // drag it anywhere, by any part
    case WM_GETMINMAXINFO: {
      // Larger than the screen is fine: the picture has the size it has.
      auto* info = reinterpret_cast<MINMAXINFO*>(lparam);
      info->ptMaxTrackSize = {4096, 4096};
      info->ptMaxSize = {4096, 4096};
      return 0;
    }
    case WM_NCRBUTTONUP:
    case WM_CLOSE:
      // Closing one closes them all, through the tick box that opened them.
      app.settings.windows = false;
      fill_controls();
      settings_changed();
      return 0;
    default:
      return DefWindowProcW(window, message, wparam, lparam);
  }
}
LRESULT CALLBACK main_proc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
  switch (message) {
    case WM_COMMAND:
      on_command(LOWORD(wparam), HIWORD(wparam));
      return 0;
    case WM_TIMER:
      tick();
      return 0;
    case WM_SIZE:
      if (app.main)
        layout();
      return 0;
    case WM_GETMINMAXINFO: {
      auto* info = reinterpret_cast<MINMAXINFO*>(lparam);
      info->ptMinTrackSize = {px(900), px(620)};
      return 0;
    }
    case WM_DPICHANGED: {
      // Fonts and positions were made for the first monitor's scale; the
      // suggested rectangle keeps the window the same physical size.
      const auto* suggested = reinterpret_cast<const RECT*>(lparam);
      SetWindowPos(window, nullptr, suggested->left, suggested->top, suggested->right - suggested->left, suggested->bottom - suggested->top,
                   SWP_NOZORDER | SWP_NOACTIVATE);
      return 0;
    }
    case WM_ERASEBKGND: {
      RECT client{};
      GetClientRect(window, &client);
      FillRect(reinterpret_cast<HDC>(wparam), &client, GetSysColorBrush(COLOR_BTNFACE));
      return 1;
    }
    case WM_PAINT: {
      PAINTSTRUCT paint{};
      HDC dc = BeginPaint(window, &paint);
      paint_main(dc);
      EndPaint(window, &paint);
      return 0;
    }
    case WM_CTLCOLORSTATIC: {
      SetBkMode(reinterpret_cast<HDC>(wparam), TRANSPARENT);
      return reinterpret_cast<LRESULT>(GetSysColorBrush(COLOR_BTNFACE));
    }
    case WM_LBUTTONDOWN:
      SetFocus(window);
      return 0;
    case WM_CLOSE:
      DestroyWindow(window);
      return 0;
    case WM_DESTROY:
      PostQuitMessage(0);
      return 0;
    default:
      return DefWindowProcW(window, message, wparam, lparam);
  }
}
// Keys adjust the selected camera while a preview (or nothing in the window)
// has the keyboard; fields, lists and tick boxes keep their own keys.
bool adjusting(HWND focus) {
  if (!focus)
    return false;
  if (focus == app.main)
    return true;
  for (const auto& feed : app.feeds)
    if (focus == feed.cell)
      return true;
  return false;
}

// --check: used by the build's self-test. Opens every announced camera with
// Direct3D 11, reads the newest picture back and writes a few of its pixels
// to a text file. No window. Exit code 0 when every announced camera opened.
int check(const wchar_t* out_path) {
  if (!app.link.open())
    return 10;
  const auto* link = app.link.get();
  const auto started = GetTickCount64();
  while (!bridge_present(GetTickCount64()) || link->status.state != link_live) {
    if (GetTickCount64() - started > 15000)
      return 11;
    Sleep(50);
  }
  if (!open_gpu(link->status.adapter))
    return 12;
  FILE* out = _wfopen(out_path, L"w");
  if (!out)
    return 13;
  int result = 0;
  for (unsigned index = 0; index < Feeds; ++index) {
    if (!((link->status.feed_mask >> index) & 1u))
      continue;
    Feed feed;
    const auto generation = static_cast<std::uint32_t>(load(link->status.feeds[index].generation));
    const auto published = static_cast<std::uint64_t>(load(link->status.feeds[index].published));
    const auto slot = published_slot(published);
    if (!generation || !published_frames(published) || slot >= Slots || !open_textures(feed, index, link->status.pid, generation)) {
      std::fprintf(out, "camera %u: not opened (generation %u, pictures %llu)\n", index + 1, generation,
                   static_cast<unsigned long long>(published_frames(published)));
      result = 14;
      continue;
    }
    D3D11_TEXTURE2D_DESC desc{};
    feed.textures[slot]->GetDesc(&desc);
    desc.Usage = D3D11_USAGE_STAGING;
    desc.BindFlags = 0;
    desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    desc.MiscFlags = 0;
    ID3D11Texture2D* staging = nullptr;
    D3D11_MAPPED_SUBRESOURCE mapped{};
    if (FAILED(app.device->CreateTexture2D(&desc, nullptr, &staging))) {
      result = 15;
      close_textures(feed);
      continue;
    }
    app.context->CopyResource(staging, feed.textures[slot]);
    if (FAILED(app.context->Map(staging, 0, D3D11_MAP_READ, 0, &mapped))) {
      result = 16;
    } else {
      const auto pixel = [&](UINT x, UINT y) {
        const auto* p = static_cast<const unsigned char*>(mapped.pData) + std::size_t{y} * mapped.RowPitch + std::size_t{x} * 4;
        return (static_cast<unsigned>(p[2]) << 16) | (static_cast<unsigned>(p[1]) << 8) | p[0];  // 0xRRGGBB
      };
      std::fprintf(out, "camera %u: %ux%u top %06x middle %06x bottom %06x\n", index + 1, desc.Width, desc.Height, pixel(desc.Width / 2, 0),
                   pixel(desc.Width / 2, desc.Height / 2), pixel(desc.Width / 2, desc.Height - 1));
      app.context->Unmap(staging, 0);
    }
    staging->Release();
    close_textures(feed);
  }
  std::fclose(out);
  close_gpu();
  return result;
}
}  // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int show) {
  app.instance = instance;
  int argc = 0;
  wchar_t** argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  if (argv && argc >= 3 && std::wcscmp(argv[1], L"--check") == 0)
    return check(argv[2]);
  HANDLE single = CreateMutexW(nullptr, FALSE, L"Local\\PolarisCam.Window");
  if (single && GetLastError() == ERROR_ALREADY_EXISTS) {
    if (HWND existing = FindWindowW(MainClass, nullptr)) {
      ShowWindow(existing, SW_RESTORE);
      SetForegroundWindow(existing);
    }
    return 0;
  }
  INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_STANDARD_CLASSES};
  InitCommonControlsEx(&controls);
  {
    auto path = ini_path();
    path.replace(path.size() - 3, 3, L"log");
    // Past 1 MB, put aside before it is opened; otherwise this run is added.
    WIN32_FILE_ATTRIBUTE_DATA existing{};
    if (GetFileAttributesExW(path.c_str(), GetFileExInfoStandard, &existing) &&
        ((static_cast<std::uint64_t>(existing.nFileSizeHigh) << 32) | existing.nFileSizeLow) > 1024 * 1024) {
      auto previous = path;
      previous.replace(previous.size() - 4, 4, L".previous.log");
      MoveFileExW(path.c_str(), previous.c_str(), MOVEFILE_REPLACE_EXISTING);
    }
    log_file = _wfopen(path.c_str(), L"a, ccs=UTF-8");
    if (log_file) {
      SYSTEMTIME time{};
      GetLocalTime(&time);
      std::fwprintf(log_file, L"==== %04u-%02u-%02u %02u:%02u:%02u ====\n", time.wYear, time.wMonth, time.wDay, time.wHour, time.wMinute,
                    time.wSecond);
    }
  }
  note(L"Polaris Cam " POLARIS_CAM_VERSION_WIDE L" (Taxi Cam " TAXI_CAM_VERSION_WIDE L")");
  note(app.link.open() ? L"link: open" : L"link: unavailable");
  app.frame_event = CreateEventW(nullptr, FALSE, FALSE, FrameEventName);
  load_settings();

  WNDCLASSEXW type{};
  type.cbSize = sizeof(type);
  type.hInstance = instance;
  type.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  type.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
  type.lpfnWndProc = main_proc;
  type.lpszClassName = MainClass;
  RegisterClassExW(&type);
  type.lpfnWndProc = cell_proc;
  type.lpszClassName = CellClass;
  type.style = CS_DBLCLKS;
  RegisterClassExW(&type);
  type.style = 0;
  type.lpfnWndProc = output_proc;
  type.lpszClassName = OutputClass;
  type.hCursor = LoadCursorW(nullptr, IDC_SIZEALL);
  RegisterClassExW(&type);

  app.main = CreateWindowExW(0, MainClass, AppTitle, WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN, CW_USEDEFAULT, CW_USEDEFAULT, 1180, 720, nullptr,
                             nullptr, instance, nullptr);
  if (!app.main)
    return 1;
  app.dpi = GetDpiForWindow(app.main);
  if (!app.dpi)
    app.dpi = 96;
  NONCLIENTMETRICSW metrics{};
  metrics.cbSize = sizeof(metrics);
  LOGFONTW face{};
  if (SystemParametersInfoForDpi(SPI_GETNONCLIENTMETRICS, sizeof(metrics), &metrics, 0, app.dpi))
    face = metrics.lfMessageFont;
  else
    std::wcscpy(face.lfFaceName, L"Segoe UI");
  if (!face.lfHeight)
    face.lfHeight = -px(12);
  app.font = CreateFontIndirectW(&face);
  face.lfWeight = FW_SEMIBOLD;
  app.bold = CreateFontIndirectW(&face);
  face.lfHeight = face.lfHeight * 3 / 2;
  app.title = CreateFontIndirectW(&face);
  create_controls();
  for (unsigned index = 0; index < Feeds; ++index)
    app.feeds[index].cell = CreateWindowExW(0, CellClass, L"", WS_CHILD | WS_VISIBLE, 0, 0, 16, 9, app.main, nullptr, instance,
                                            reinterpret_cast<void*>(static_cast<UINT_PTR>(index)));
  SetWindowPos(app.main, nullptr, 0, 0, px(1180), px(720), SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
  fill_controls();
  layout();
  write_link();
  update_status(GetTickCount64());
  for (unsigned index = 0; index < Feeds; ++index)
    sync_output(index);
  SetTimer(app.main, 1, USER_TIMER_MINIMUM, nullptr);
  ShowWindow(app.main, show);
  UpdateWindow(app.main);

  for (;;) {
    MsgWaitForMultipleObjects(app.frame_event ? 1 : 0, &app.frame_event, FALSE, 15, QS_ALLINPUT);
    MSG message{};
    bool quit = false;
    while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
      if (message.message == WM_QUIT) {
        quit = true;
        break;
      }
      // Held keys are read in tick(); here they are only kept from the dialog keys.
      if ((message.message == WM_KEYDOWN || message.message == WM_CHAR) && adjusting(GetFocus()) && message.wParam != VK_TAB)
        continue;
      if (IsDialogMessageW(app.main, &message))
        continue;
      TranslateMessage(&message);
      DispatchMessageW(&message);
    }
    if (quit)
      break;
    tick();
  }
  // Off before leaving: the bridge would otherwise wait out the heartbeat.
  app.settings.enabled = false;
  write_link();
  save_mounts();
  for (auto& feed : app.feeds)
    close_output(feed);
  close_gpu();
  return 0;
}
