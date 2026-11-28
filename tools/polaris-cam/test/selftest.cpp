// Polaris Cam: the build's self-test, run on Windows without a simulator.
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
//
//   polaris-cam-selftest.exe --verify [--hardware]
//       Runs BroadcastOutput on a Direct3D 12 device (the software adapter
//       unless --hardware) against snapshots with known contents and compares
//       every kind of picture it makes with the same arithmetic done here:
//       an 8-bit view copied as it is, an HDR view with Taxi Cam's fallback
//       exposure, and an HDR view through a tone-curve table; the two repeated
//       rows; the three shared textures.
//
//   polaris-cam-selftest.exe --serve <seconds> <expected.txt> [--hardware]
//       Stands in for the bridge inside MSFS: answers the Polaris Cam window
//       through the shared block exactly as the bridge does and sends moving
//       test pictures for the cameras it asks for. Writes the pixels the
//       window's --check must read to expected.txt, again for each size asked
//       for. Ends early once a file expected.txt.stop exists. Exit code 0 when
//       a window asked for pictures and read them.
#include <windows.h>
#include <d3d12.h>
#include <d3d12sdklayers.h>
#include <dxgi1_4.h>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include "../src/camera/render_schedule.hpp"
#include "../src/camera/view_clip.hpp"
#include "../src/graphics/broadcast_output.hpp"
#include "../src/profiles/discovered.hpp"
#include "../src/shared/broadcast_link.hpp"
#include "../src/viewer/waiting_status.hpp"

namespace {
using taxi_camera::BroadcastOutput;
using namespace polaris_cam;

int failures = 0;
void expect(bool ok, const char* what) {
  std::printf("%s  %s\n", ok ? "ok  " : "FAIL", what);
  if (!ok)
    ++failures;
}

struct Gpu {
  ID3D12Device* device = nullptr;
  ID3D12CommandQueue* queue = nullptr;
  ID3D12CommandAllocator* allocator = nullptr;
  ID3D12GraphicsCommandList* list = nullptr;
  ID3D12Fence* fence = nullptr;
  HANDLE event = nullptr;
  std::uint64_t signalled = 0;
  LUID luid{};
  bool debug = false;

  // Errors the Direct3D debug layer has recorded, where the machine has one
  // (the build's test machine does; a player's usually does not).
  unsigned debug_errors() {
    ID3D12InfoQueue* messages = nullptr;
    if (!debug || FAILED(device->QueryInterface(IID_PPV_ARGS(&messages))))
      return 0;
    unsigned errors = 0;
    for (UINT64 index = 0; index < messages->GetNumStoredMessages(); ++index) {
      SIZE_T size = 0;
      if (FAILED(messages->GetMessage(index, nullptr, &size)) || !size)
        continue;
      std::vector<unsigned char> bytes(size);
      auto* message = reinterpret_cast<D3D12_MESSAGE*>(bytes.data());
      if (SUCCEEDED(messages->GetMessage(index, message, &size)) && message->Severity <= D3D12_MESSAGE_SEVERITY_ERROR) {
        ++errors;
        std::printf("Direct3D 12 error %d: %s\n", static_cast<int>(message->ID), message->pDescription);
      }
    }
    messages->ClearStoredMessages();
    messages->Release();
    return errors;
  }
  bool open(bool hardware, bool with_debug_layer) {
    ID3D12Debug* layer = nullptr;
    if (with_debug_layer && SUCCEEDED(D3D12GetDebugInterface(IID_PPV_ARGS(&layer)))) {
      layer->EnableDebugLayer();
      layer->Release();
      debug = true;
    }
    IDXGIFactory4* factory = nullptr;
    if (FAILED(CreateDXGIFactory1(IID_PPV_ARGS(&factory))))
      return false;
    IDXGIAdapter1* adapter = nullptr;
    if (hardware) {
      if (FAILED(factory->EnumAdapters1(0, &adapter)))
        return false;
    } else if (FAILED(factory->EnumWarpAdapter(IID_PPV_ARGS(&adapter)))) {
      return false;
    }
    DXGI_ADAPTER_DESC1 desc{};
    adapter->GetDesc1(&desc);
    luid = desc.AdapterLuid;
    std::printf("adapter: %ls\n", desc.Description);
    if (FAILED(D3D12CreateDevice(adapter, D3D_FEATURE_LEVEL_11_0, IID_PPV_ARGS(&device))))
      return false;
    adapter->Release();
    factory->Release();
    D3D12_COMMAND_QUEUE_DESC queue_desc{};
    queue_desc.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
    event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    return SUCCEEDED(device->CreateCommandQueue(&queue_desc, IID_PPV_ARGS(&queue))) &&
           SUCCEEDED(device->CreateCommandAllocator(queue_desc.Type, IID_PPV_ARGS(&allocator))) &&
           SUCCEEDED(device->CreateCommandList(0, queue_desc.Type, allocator, nullptr, IID_PPV_ARGS(&list))) && SUCCEEDED(list->Close()) &&
           SUCCEEDED(device->CreateFence(0, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(&fence))) && event;
  }
  bool begin() { return SUCCEEDED(allocator->Reset()) && SUCCEEDED(list->Reset(allocator, nullptr)); }
  // Runs the list and waits for it: this is a test, not the bridge.
  bool run() {
    if (FAILED(list->Close()))
      return false;
    ID3D12CommandList* lists[]{list};
    queue->ExecuteCommandLists(1, lists);
    if (FAILED(queue->Signal(fence, ++signalled)) || FAILED(fence->SetEventOnCompletion(signalled, event)))
      return false;
    return WaitForSingleObject(event, 60000) == WAIT_OBJECT_0;
  }
};

// A completed camera snapshot as the capture manager leases it: a plain
// texture in COPY_DEST. pixels are 32-bit texels of the format, row by row.
ID3D12Resource* make_snapshot(Gpu& gpu, DXGI_FORMAT format, UINT width, UINT height, const std::vector<std::uint32_t>& pixels) {
  D3D12_HEAP_PROPERTIES heap{};
  heap.Type = D3D12_HEAP_TYPE_DEFAULT;
  D3D12_RESOURCE_DESC desc{};
  desc.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
  desc.Width = width;
  desc.Height = height;
  desc.DepthOrArraySize = desc.MipLevels = 1;
  desc.Format = format;
  desc.SampleDesc.Count = 1;
  ID3D12Resource* texture = nullptr;
  if (FAILED(gpu.device->CreateCommittedResource(&heap, D3D12_HEAP_FLAG_NONE, &desc, D3D12_RESOURCE_STATE_COPY_DEST, nullptr,
                                                 IID_PPV_ARGS(&texture))))
    return nullptr;
  D3D12_PLACED_SUBRESOURCE_FOOTPRINT footprint{};
  UINT64 bytes = 0;
  gpu.device->GetCopyableFootprints(&desc, 0, 1, 0, &footprint, nullptr, nullptr, &bytes);
  heap.Type = D3D12_HEAP_TYPE_UPLOAD;
  D3D12_RESOURCE_DESC buffer{};
  buffer.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
  buffer.Width = bytes;
  buffer.Height = buffer.DepthOrArraySize = buffer.MipLevels = 1;
  buffer.SampleDesc.Count = 1;
  buffer.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
  ID3D12Resource* upload = nullptr;
  void* mapped = nullptr;
  if (FAILED(gpu.device->CreateCommittedResource(&heap, D3D12_HEAP_FLAG_NONE, &buffer, D3D12_RESOURCE_STATE_GENERIC_READ, nullptr,
                                                 IID_PPV_ARGS(&upload))) ||
      FAILED(upload->Map(0, nullptr, &mapped))) {
    texture->Release();
    return nullptr;
  }
  for (UINT y = 0; y < height; ++y)
    std::memcpy(static_cast<unsigned char*>(mapped) + footprint.Offset + std::size_t{y} * footprint.Footprint.RowPitch,
                pixels.data() + std::size_t{y} * width, std::size_t{width} * 4);
  upload->Unmap(0, nullptr);
  D3D12_TEXTURE_COPY_LOCATION destination{}, source{};
  destination.pResource = texture;
  destination.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
  source.pResource = upload;
  source.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
  source.PlacedFootprint = footprint;
  const bool ok = gpu.begin() && (gpu.list->CopyTextureRegion(&destination, 0, 0, 0, &source, nullptr), gpu.run());
  upload->Release();
  if (!ok) {
    texture->Release();
    return nullptr;
  }
  return texture;
}
// One of the shared pictures, read back: 0xAARRGGBB per pixel.
std::vector<std::uint32_t> read_picture(Gpu& gpu, ID3D12Resource* texture) {
  const auto desc = texture->GetDesc();
  D3D12_PLACED_SUBRESOURCE_FOOTPRINT footprint{};
  UINT64 bytes = 0;
  gpu.device->GetCopyableFootprints(&desc, 0, 1, 0, &footprint, nullptr, nullptr, &bytes);
  D3D12_HEAP_PROPERTIES heap{};
  heap.Type = D3D12_HEAP_TYPE_READBACK;
  D3D12_RESOURCE_DESC buffer{};
  buffer.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
  buffer.Width = bytes;
  buffer.Height = buffer.DepthOrArraySize = buffer.MipLevels = 1;
  buffer.SampleDesc.Count = 1;
  buffer.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
  ID3D12Resource* readback = nullptr;
  std::vector<std::uint32_t> pixels;
  if (FAILED(gpu.device->CreateCommittedResource(&heap, D3D12_HEAP_FLAG_NONE, &buffer, D3D12_RESOURCE_STATE_COPY_DEST, nullptr,
                                                 IID_PPV_ARGS(&readback))))
    return pixels;
  D3D12_RESOURCE_BARRIER barrier{};
  barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
  barrier.Transition = {texture, 0, D3D12_RESOURCE_STATE_COMMON, D3D12_RESOURCE_STATE_COPY_SOURCE};
  D3D12_TEXTURE_COPY_LOCATION destination{}, source{};
  destination.pResource = readback;
  destination.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
  destination.PlacedFootprint = footprint;
  source.pResource = texture;
  source.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
  bool ok = gpu.begin();
  if (ok) {
    gpu.list->ResourceBarrier(1, &barrier);
    gpu.list->CopyTextureRegion(&destination, 0, 0, 0, &source, nullptr);
    std::swap(barrier.Transition.StateBefore, barrier.Transition.StateAfter);
    gpu.list->ResourceBarrier(1, &barrier);
    ok = gpu.run();
  }
  void* mapped = nullptr;
  if (ok && SUCCEEDED(readback->Map(0, nullptr, &mapped))) {
    pixels.resize(std::size_t{desc.Width} * desc.Height);
    for (UINT y = 0; y < desc.Height; ++y)
      std::memcpy(pixels.data() + std::size_t{y} * desc.Width,
                  static_cast<unsigned char*>(mapped) + footprint.Offset + std::size_t{y} * footprint.Footprint.RowPitch,
                  std::size_t{desc.Width} * 4);  // B8G8R8A8 in memory is 0xAARRGGBB as a little-endian word
    readback->Unmap(0, nullptr);
  }
  readback->Release();
  return pixels;
}
bool wait_idle(const BroadcastOutput& output) {
  for (int i = 0; i < 60000; ++i) {
    if (output.idle())
      return true;
    Sleep(1);
  }
  return false;
}

// R11G11B10_FLOAT: unsigned floats, five exponent bits, six (red, green) or five (blue) of mantissa.
std::uint32_t unsigned_float(float value, int mantissa_bits) {
  if (!(value > 0))
    return 0;
  int exponent = 0;
  const float fraction = std::frexp(value, &exponent) * 2 - 1;  // value = (1 + fraction) * 2^(exponent - 1)
  int biased = exponent - 1 + 15;
  if (biased <= 0)
    return 0;
  auto mantissa = static_cast<std::uint32_t>(std::lround(fraction * static_cast<float>(1 << mantissa_bits)));
  if (mantissa == (1u << mantissa_bits)) {
    mantissa = 0;
    ++biased;
  }
  if (biased >= 31)
    return (30u << mantissa_bits) | ((1u << mantissa_bits) - 1);
  return (static_cast<std::uint32_t>(biased) << mantissa_bits) | mantissa;
}
std::uint32_t r11g11b10(float r, float g, float b) {
  return unsigned_float(r, 6) | (unsigned_float(g, 6) << 11) | (unsigned_float(b, 5) << 22);
}
std::uint32_t rgba8(unsigned r, unsigned g, unsigned b) {
  return r | (g << 8) | (b << 16) | 0xff000000u;
}
// The shader's arithmetic (broadcast_output.cpp), for the expected pictures.
double srgb_code(double value) {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * std::pow(value, 1.0 / 2.4) - 0.055;
}
double fallback_code(double scene, double exposure) {
  const double exposed = scene * exposure;
  return srgb_code(exposed / (1 + exposed));
}
// Through a table that holds its own coordinates, the simulator's curve
// leaves 16 x exposure x scene light, then its shoulder and the sRGB code.
double table_code(double scene, double exposure) {
  double y = 16 * exposure * scene;
  y = y < 0.22 ? y : 0.22 + 0.78 * (1 - std::exp2(-1.84961 * (y - 0.22)));
  return srgb_code(std::min(y, 1.0));
}
bool near_code(std::uint32_t pixel, int shift, double code, int tolerance) {
  const int got = static_cast<int>((pixel >> shift) & 0xff), want = static_cast<int>(std::lround(code * 255));
  return std::abs(got - want) <= tolerance;
}
bool near_rgb(std::uint32_t pixel, double r, double g, double b, int tolerance = 2) {
  return near_code(pixel, 16, r, tolerance) && near_code(pixel, 8, g, tolerance) && near_code(pixel, 0, b, tolerance) && (pixel >> 24) == 0xff;
}

// What the bridge decides without the GPU: the request it reads from the
// window, the camera shape it publishes for it, and how Taxi Cam's schedule
// spreads the cameras the window ticked over the simulator's frames.
void verify_request() {
  std::printf("-- the window's request\n");
  Link link{};
  Request request;
  request.on = true;
  expect(read_control(link, 1000, request) && !request.on, "a block nobody wrote asks for nothing");
  const auto write = [&](std::uint32_t enabled, std::uint32_t width, std::uint32_t height, std::uint32_t mask, std::uint64_t heartbeat,
                         std::uint32_t memory_guard = 1, std::uint32_t draw_distance = 0) {
    write_control(link, [&](Control& c) {
      c.enabled = enabled;
      c.width = width;
      c.height = height;
      c.fps = 30;
      c.feed_mask = mask;
      c.use_mounts = 1;
      c.memory_guard = memory_guard;
      c.draw_distance_m = draw_distance;
      c.heartbeat_ms = heartbeat;
      for (auto& mount : c.mounts) {
        const double values[6]{0, 2, 10, -10, 0, 1.2};
        std::memcpy(mount, values, sizeof(values));
      }
    });
  };
  write(1, 1920, 1080, 0b0101, 1000);
  expect(read_control(link, 1000, request) && request.on && request.pane() == ((1920u << 16) | 1078u) && request.feed_mask == 0b0101 &&
             request.use_mounts && request.fps == 30 && request.memory_guard && request.draw_distance_m == 0,
         "1080p: on, cameras rendered 1920x1078, the mounts taken, the memory guard on, as far as the main view");
  expect(read_control(link, 990, request) && request.on, "a heartbeat written just after the bridge read the clock is fresh");
  expect(read_control(link, 1000 + ControlStaleMs, request) && request.on, "still fresh at the limit");
  expect(read_control(link, 1001 + ControlStaleMs, request) && !request.on && request.pane() == 0, "stale after it: off, no broadcast shape");
  write(1, 1280, 720, 0xf, 5000, 0);
  expect(read_control(link, 5000, request) && request.on && request.pane() == ((1280u << 16) | 718u) && !request.memory_guard,
         "720p: cameras rendered 1280x718; the memory guard off");
  const auto distance = [&](std::uint32_t metres) {
    write(1, 1920, 1080, 0xf, 5000, 1, metres);
    return read_control(link, 5000, request) && request.on ? request.draw_distance_m : 0xffffffffu;
  };
  expect(distance(10000) == 10000 && distance(MinimumDrawDistanceM) == MinimumDrawDistanceM &&
             distance(MaximumDrawDistanceM) == MaximumDrawDistanceM,
         "a draw distance is taken as asked");
  expect(distance(MinimumDrawDistanceM - 1) == 0 && distance(MaximumDrawDistanceM + 1) == 0 && distance(0) == 0,
         "one outside 1 to 400 km is as far as the main view");
  write(1, 1920, 1088, 0xf, 5000);
  expect(read_control(link, 5000, request) && !request.on, "another size is not a request");
  write(1, 1920, 1080, 0, 5000);
  expect(read_control(link, 5000, request) && !request.on, "no camera ticked is not a request");
  write(0, 1920, 1080, 0xf, 5000);
  expect(read_control(link, 5000, request) && !request.on, "the tick box off is off");
  write(1, 1920, 1080, 0xf, 5000);
  link.control.mounts[2][5] = 2.0;  // a view angle Taxi Cam refuses
  expect(read_control(link, 5000, request) && request.on && !request.use_mounts, "a mount outside Taxi Cam's limits: its own mounts stay");
  InterlockedIncrement(&link.control.serial);
  expect(!read_control(link, 5000, request), "a write in progress is not read");

  std::printf("-- the camera shape\n");
  using namespace taxi_camera;
  const auto& base = profiles::A380;
  const profiles::DisplayOverride none{};
  auto shaped = base;
  profiles::apply_choices(shaped, base, none, MaxDisplaySides, 0);
  expect(shaped.camera_panes == base.camera_panes, "without a broadcast the cameras keep the aircraft's own shapes");
  profiles::apply_choices(shaped, base, none, MaxDisplaySides, pane_code(1920, 1080), 0b0101);
  const auto broadcast = [](const std::array<std::int32_t, 2>& pane) { return pane[0] == 1920 && pane[1] == 1078; };
  expect(broadcast(shaped.camera_panes[0]) && broadcast(shaped.camera_panes[2]), "with one, the ticked cameras 1 and 3 are 1920x1078");
  expect(shaped.camera_panes[1] == base.camera_panes[1] && shaped.camera_panes[3] == base.camera_panes[3],
         "and the unticked cameras 2 and 4 keep the aircraft's own, small, size");
  expect(!profiles::camera_candidate(1920, 1078) && !profiles::camera_candidate(1920, 1080), "a 1920x1078 texture is no camera's before it is published");
  const auto* published = profiles::publish_override(&base, none, MaxDisplaySides, pane_code(1920, 1080), 0b0101);
  expect(published && profiles::find(base.id) == published && broadcast(published->camera_panes[2]) &&
             published->camera_panes[profiles::DoorFeed] == base.camera_panes[profiles::DoorFeed],
         "published, the aircraft's profile has that shape");
  expect(profiles::camera_candidate(1920, 1078) && !profiles::camera_candidate(1920, 1080),
         "and a 1920x1078 texture is a camera's, while the simulator's own 1920x1080 ones are not");
  expect(profiles::override_current(&base, none, MaxDisplaySides, pane_code(1920, 1080), 0b0101) &&
             !profiles::override_current(&base, none, MaxDisplaySides, pane_code(1920, 1080), 0b0111) &&
             !profiles::override_current(&base, none, MaxDisplaySides, pane_code(1280, 720), 0b0101) &&
             !profiles::override_current(&base, none, MaxDisplaySides, 0, 0),
         "other cameras, another size, or none, is another profile to publish");
  published = profiles::publish_override(&base, none, MaxDisplaySides, 0, 0b0101);
  expect(published && published->camera_panes == base.camera_panes && !profiles::camera_candidate(1920, 1078),
         "the broadcast off publishes the aircraft's own shapes again");
  expect(profiles::override_current(&base, none, MaxDisplaySides, 0, 0) && profiles::override_current(&base, none, MaxDisplaySides, 0, 0b1111),
         "with the broadcast off, which cameras were ticked makes no other profile");

  std::printf("-- settling on a camera shape\n");
  ShapeSettle settle;
  Request ask;
  const auto shape_of = [](std::uint32_t width, std::uint32_t height, std::uint32_t feeds) { return Shape{pane_code(width, height), feeds}; };
  expect(settle.update(ask, 1000) == Shape{} && settle.settled(), "off: no shape");
  ask.on = true;
  ask.width = 1280;
  ask.height = 720;
  ask.feed_mask = 0b0001;
  expect(settle.update(ask, 2000) == Shape{} && !settle.settled(), "turned on: not at once");
  expect(settle.update(ask, 2000 + ShapeSettle::SettleMs - 1) == Shape{}, "nor just before it has settled");
  expect(settle.update(ask, 2000 + ShapeSettle::SettleMs) == shape_of(1280, 720, 0b0001) && settle.settled(), "then camera 1 at 1280x718");
  ask.feed_mask = 0b0011;
  expect(settle.update(ask, 3000) == shape_of(1280, 720, 0b0001), "camera 2 ticked: the shape in force stays for now");
  ask.feed_mask = 0b0111;
  settle.update(ask, 3400);
  ask.feed_mask = 0b1111;
  expect(settle.update(ask, 3800) == shape_of(1280, 720, 0b0001) && !settle.settled(), "cameras 3 and 4 ticked soon after: still the first");
  expect(settle.update(ask, 3800 + ShapeSettle::SettleMs) == shape_of(1280, 720, 0b1111), "once settled, all four at once: one transition");
  ask.height = 1080;
  ask.width = 1920;
  expect(settle.update(ask, 6000) == shape_of(1280, 720, 0b1111) && settle.update(ask, 7000) == shape_of(1920, 1080, 0b1111),
         "another size: the same wait");
  ask.on = false;
  expect(settle.update(ask, 7001) == Shape{} && settle.settled(), "off: at once");

  std::printf("-- the cameras' draw distance\n");
  {
    using taxi_camera::native_camera::CameraClip;
    using taxi_camera::native_camera::limit_camera_far;
    const CameraClip main{0.05f, 356700.f, 356700.f};  // the camera with the main view's far, as the log shows it
    expect(limit_camera_far(main, 10000.f) == CameraClip{0.05f, 10000.f, 10000.f}, "10 km: both far values 10 km, the near plane kept");
    expect(limit_camera_far(main, 0.f) == main && limit_camera_far(main, std::nanf("")) == main && limit_camera_far(main, -5.f) == main,
           "0, or no distance at all: as far as the main view");
    expect(limit_camera_far(main, 500000.f) == main, "farther than the main view: the main view's");
    expect(limit_camera_far({0.05f, -1.f, 356700.f}, 5000.f) == CameraClip{0.05f, -1.f, 5000.f},
           "a culling far that falls back to the default stays so, the default capped");
    expect(limit_camera_far(main, 0.01f) == main, "a cap inside the near plane is refused");
  }

  std::printf("-- the memory guard\n");
  {
    MemoryGuard guard;
    constexpr std::uint32_t Budget = 13600;  // a 16 GB card's
    const auto used = [](std::uint32_t free_mb) { return Budget - free_mb; };
    expect(guard.update(false, used(100), Budget, 1000) == guard_off && !guard.paused(), "not broadcasting, or turned off: off");
    expect(guard.update(true, 0, 0, 1000) == guard_watching && !guard.paused(), "no reading: the cameras run");
    expect(guard.update(true, used(MemoryGuard::PauseFreeMb), Budget, 2000) == guard_watching, "0.8 GB free: the cameras run");
    expect(guard.update(true, used(MemoryGuard::PauseFreeMb - 1), Budget, 3000) == guard_paused, "less: paused at once");
    expect(guard.update(true, Budget + 200, Budget, 3500) == guard_paused, "over the budget: paused");
    expect(guard.update(true, used(MemoryGuard::ResumeFreeMb - 1), Budget, 4000) == guard_paused, "just under 1.6 GB free: still paused");
    expect(guard.update(true, used(MemoryGuard::ResumeFreeMb), Budget, 5000) == guard_paused, "1.6 GB free: not at once");
    expect(guard.update(true, used(MemoryGuard::ResumeFreeMb + 500), Budget, 5000 + MemoryGuard::ResumeHoldMs - 1) == guard_paused,
           "nor just before 15 s of it");
    expect(guard.update(true, used(MemoryGuard::ResumeFreeMb - 1), Budget, 5000 + MemoryGuard::ResumeHoldMs) == guard_paused,
           "a reading under 1.6 GB free at 15 s: still paused");
    expect(guard.update(true, used(MemoryGuard::ResumeFreeMb), Budget, 30000) == guard_paused &&
               guard.update(true, used(MemoryGuard::ResumeFreeMb), Budget, 30000 + MemoryGuard::ResumeHoldMs - 1) == guard_paused,
           "and the 15 s start again from the next one with room");
    expect(guard.update(true, used(MemoryGuard::ResumeFreeMb), Budget, 30000 + MemoryGuard::ResumeHoldMs) == guard_watching && !guard.paused(),
           "15 s with 1.6 GB free: the cameras run again");
    expect(guard.update(true, used(MemoryGuard::ResumeFreeMb - 1), Budget, 50000) == guard_watching, "between the two: they keep running");
    expect(guard.update(true, used(100), Budget, 51000) == guard_paused && guard.update(true, 0, 0, 52000) == guard_watching,
           "a reading that fails ends a pause");
    expect(guard.update(true, used(100), Budget, 53000) == guard_paused && guard.update(false, used(100), Budget, 54000) == guard_off &&
               guard.update(true, used(MemoryGuard::PauseFreeMb), Budget, 55000) == guard_watching,
           "so does turning the broadcast or the guard off: on again, it starts afresh");
  }

  std::printf("-- a bridge of an earlier version\n");
  // Each line's offsets, from that version's own layout: 0.1.0 to 0.1.2 have
  // a Control of 232 bytes, 0.1.3 to 0.1.5 one of 240, as 0.2.0 does.
  static_assert(std::size(OlderLinks) == 3);
  static_assert(OlderLinks[0].version == 1 && OlderLinks[0].heartbeat == 8 + 232 && OlderLinks[0].pid == 8 + 232 + 8);
  static_assert(OlderLinks[1].version == 2 && OlderLinks[1].heartbeat == 8 + 232 && OlderLinks[1].pid == 8 + 232 + 8);
  static_assert(OlderLinks[2].version == 3 && OlderLinks[2].heartbeat == offsetof(Link, status) + offsetof(Status, heartbeat_ms) &&
                OlderLinks[2].pid == offsetof(Link, status) + offsetof(Status, pid));
  // A block that is already there belongs to a Polaris Cam that is running
  // on this computer (a bridge in MSFS, or a window): the test never writes
  // into it, and older_bridge would find that one too, so it skips them all.
  bool older_running = false;
  for (const auto& older : OlderLinks) {
    wchar_t name[48];
    std::swprintf(name, 48, L"Local\\PolarisCam.Link.%u", static_cast<unsigned>(older.version));
    if (HANDLE existing = OpenFileMappingW(FILE_MAP_READ, FALSE, name)) {
      CloseHandle(existing);
      older_running = true;
    }
  }
  if (older_running)
    std::printf("SKIP  a Polaris Cam of an earlier version is running here; its block is left alone\n");
  constexpr const char* Made[]{"the block of 0.1.0 and 0.1.1 can be made", "the block of 0.1.2 can be made",
                               "the block of 0.1.3 to 0.1.5 can be made"};
  constexpr const char* Found[]{"a bridge of 0.1.1 writing its heartbeat is found", "a bridge of 0.1.2 writing its heartbeat is found",
                                "a bridge of 0.1.5 writing its heartbeat is found"};
  static_assert(std::size(Made) == std::size(OlderLinks) && std::size(Found) == std::size(OlderLinks));
  for (const auto& older : OlderLinks) {
    if (older_running)
      break;
    // That version's block as its bridge writes it, as far as its heartbeat.
    wchar_t name[48];
    std::swprintf(name, 48, L"Local\\PolarisCam.Link.%u", static_cast<unsigned>(older.version));
    const auto size = static_cast<DWORD>(older.pid + 4);
    HANDLE block = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, size, name);
    auto* bytes = block ? static_cast<unsigned char*>(MapViewOfFile(block, FILE_MAP_WRITE, 0, 0, size)) : nullptr;
    expect(bytes != nullptr, Made[older.version - 1]);
    if (bytes) {
      const auto now = GetTickCount64();
      expect(older_bridge(now) == 0, "a block nobody writes into: no bridge");
      const std::uint32_t magic = LinkMagic, pid = 4242;
      std::memcpy(bytes, &magic, sizeof(magic));
      std::memcpy(bytes + 4, &older.version, sizeof(older.version));
      std::memcpy(bytes + older.heartbeat, &now, sizeof(now));
      std::memcpy(bytes + older.pid, &pid, sizeof(pid));
      expect(older_bridge(now) == older.version, Found[older.version - 1]);
      expect(older_bridge(now + StatusStaleMs + 1) == 0, "one that stopped is not");
      UnmapViewOfFile(bytes);
    }
    if (block)
      CloseHandle(block);
  }

  std::printf("-- the cameras over the simulator's frames\n");
  const auto opened = [](unsigned rate, unsigned wanted, unsigned frame_ms, unsigned frames) {
    native_camera::RenderSchedule schedule;
    schedule.configure(rate, Feeds, 0, wanted);
    std::array<unsigned, Feeds> count{};
    for (unsigned i = 0; i < frames + 20; ++i) {
      const auto gates = schedule.tick(1000 + std::uint64_t{i} * frame_ms);
      if (i >= 20)  // after its frame-time estimate has settled
        for (unsigned feed = 0; feed < Feeds; ++feed)
          count[feed] += gates[feed] ? 1 : 0;
    }
    return count;
  };
  auto count = opened(30, 0b0001, 16, 625);  // 62.5 simulator frames a second for ten seconds
  expect(count[0] >= 290 && count[0] <= 310 && !count[1] && !count[2] && !count[3], "one camera at 30 on a 62 fps simulator: about every other frame");
  // 30 x 2 x 16 ms is 0.96 of a camera per frame, which the schedule takes as one: exactly every other frame each.
  count = opened(30, 0b1010, 16, 625);
  expect(!count[0] && count[1] >= 312 && count[1] <= 313 && !count[2] && count[3] >= 312 && count[3] <= 313,
         "cameras 2 and 4 at 30: each on every other frame, the others never");
  count = opened(60, 0b1111, 33, 300);  // more than a 30 fps simulator can give
  expect(count[0] == 300 && count[1] == 300 && count[2] == 300 && count[3] == 300, "four cameras at 60 on a 30 fps simulator: every camera on every frame, no more");
  count = opened(10, 0b0111, 20, 500);
  expect(count[0] >= 95 && count[0] <= 105 && count[1] >= 95 && count[1] <= 105 && count[2] >= 95 && count[2] <= 105 && !count[3],
         "three cameras at 10 on a 50 fps simulator: ten a second each");
}

// The aircraft path and message the bridge writes and the window reads
// (write_status_text / read_status_text): never half of one write.
constexpr char TextPathA[] = "SimObjects\\Airplanes\\FNX_32X\\presets\\fenix\\config\\aircraft.CFG";
constexpr char TextPathB[] = "SimObjects\\Airplanes\\Asobo_A320_NEO_LEAP\\presets\\asobo\\livery\\config\\aircraft.CFG";
struct TextHammer {
  Link* link;
  volatile LONG stop;
  LONG writes;
};
DWORD WINAPI hammer_text(void* context) {
  auto& hammer = *static_cast<TextHammer*>(context);
  for (unsigned i = 0; !InterlockedCompareExchange(&hammer.stop, 0, 0); ++i) {
    const bool a = i & 1u;
    write_status_text(*hammer.link, a ? TextPathA : TextPathB, a ? sizeof(TextPathA) : sizeof(TextPathB), a ? "message A" : "message B");
    InterlockedIncrement(&hammer.writes);
  }
  return 0;
}
void verify_status_text() {
  std::printf("-- the aircraft path and message\n");
  expect(offsetof(Status, feeds) == 496 && offsetof(Status, text_serial) == 492 && sizeof(Status::message) == 156,
         "the text serial took the end of 0.1.5's message: the feeds did not move");
  expect(LinkVersion == 4 && std::wcscmp(LinkName, L"Local\\PolarisCam.Link.4") == 0 &&
             std::wcscmp(FrameEventName, L"Local\\PolarisCam.Frame.4") == 0,
         "link version 4, under names of its own");
  static Link link{};
  char aircraft[sizeof(Status::aircraft)], message[sizeof(Status::message)];
  expect(read_status_text(link, aircraft, message) && !aircraft[0] && !message[0], "a block nobody wrote reads empty");

  // Every write moves the serial on: odd while writing, the next even after.
  LONG last = load(link.status.text_serial);
  bool rising = true;
  for (unsigned i = 0; i < 8; ++i) {
    const bool a = i & 1u;
    write_status_text(link, a ? TextPathA : TextPathB, a ? sizeof(TextPathA) : sizeof(TextPathB), a ? "message A" : "message B");
    const LONG now = load(link.status.text_serial);
    rising = rising && (now & 1) == 0 && now == last + 2;
    last = now;
  }
  expect(rising && last == 16, "eight writes: the serial goes 0, 2, 4 ... 16, even after each and larger than the last");
  expect(read_status_text(link, aircraft, message) && !std::strcmp(aircraft, TextPathA) && !std::strcmp(message, "message A"),
         "a complete write reads back whole");
  write_status_text(link, TextPathA, sizeof(TextPathA), "message A");
  expect(load(link.status.text_serial) == 16, "the same text again is not written: the serial stays");
  write_status_text(link, nullptr, 0, "only the message");
  expect(load(link.status.text_serial) == 18 && read_status_text(link, aircraft, message) && !std::strcmp(aircraft, TextPathA) &&
             !std::strcmp(message, "only the message"),
         "no aircraft given: the path stays, the message changes");

  // A write in progress (odd) is not read, and what was read before stays.
  store(link.status.text_serial, 19);
  std::snprintf(link.status.aircraft, sizeof(link.status.aircraft), "SimObjects\\Airplanes\\FNX_3");  // half written
  std::memcpy(aircraft, TextPathB, sizeof(TextPathB));
  std::snprintf(message, sizeof(message), "kept");
  expect(!read_status_text(link, aircraft, message) && !std::strcmp(aircraft, TextPathB) && !std::strcmp(message, "kept"),
         "a write in progress is not read: the last complete copy stays");
  // A bridge that died mid-write left 19: the next write starts there.
  write_status_text(link, TextPathB, sizeof(TextPathB), "message B");
  expect(load(link.status.text_serial) == 20 && read_status_text(link, aircraft, message) && !std::strcmp(aircraft, TextPathB),
         "an odd serial left behind: the next write goes 19 -> 20 and reads whole");
  // A path that fills the whole field is cut, still NUL-terminated.
  char full[sizeof(Status::aircraft) + 8];
  std::memset(full, 'x', sizeof(full));
  write_status_text(link, full, sizeof(full), "full");
  expect(read_status_text(link, aircraft, message) && std::strlen(aircraft) == sizeof(aircraft) - 1, "a path too long is cut and terminated");

  // One thread writes two aircraft in turn as fast as it can; every read that
  // succeeds is exactly one of them, with its own message.
  write_status_text(link, TextPathA, sizeof(TextPathA), "message A");
  TextHammer hammer{&link, 0, 0};
  HANDLE thread = CreateThread(nullptr, 0, hammer_text, &hammer, 0, nullptr);
  expect(thread != nullptr, "the writer thread starts");
  unsigned whole = 0, refused = 0, torn = 0;
  const auto until = GetTickCount64() + 1500;
  while (thread && GetTickCount64() < until) {
    if (!read_status_text(link, aircraft, message)) {
      ++refused;
      continue;
    }
    const bool a = !std::strcmp(aircraft, TextPathA) && !std::strcmp(message, "message A");
    const bool b = !std::strcmp(aircraft, TextPathB) && !std::strcmp(message, "message B");
    if (a || b)
      ++whole;
    else
      ++torn;
  }
  // The same race read without the serial, for comparison only.
  unsigned raw_torn = 0;
  for (unsigned i = 0; thread && i < 200000; ++i) {
    char raw[sizeof(Status::aircraft)];
    std::memcpy(raw, link.status.aircraft, sizeof(raw));
    raw[sizeof(raw) - 1] = '\0';
    if (std::strcmp(raw, TextPathA) && std::strcmp(raw, TextPathB))
      ++raw_torn;
  }
  InterlockedExchange(&hammer.stop, 1);
  if (thread) {
    WaitForSingleObject(thread, INFINITE);
    CloseHandle(thread);
  }
  std::printf("      %ld writes; %u whole reads, %u refused, %u torn; %u torn of 200000 reads without the serial\n",
              static_cast<long>(hammer.writes), whole, refused, torn, raw_torn);
  expect(torn == 0 && whole > 0, "while the bridge writes: no read is half of one aircraft and half of the next");
  const LONG end = load(link.status.text_serial);
  expect((end & 1) == 0 && end > 24, "after the writes the serial is even and has moved on");
}

void verify_waiting_status() {
  std::printf("-- the window's status while the cameras are created\n");
  const auto all_failed = [](std::uint32_t ticked, std::uint32_t failed) {
    return ticked_cameras_all_failed(link_waiting, reason_starting, ticked, failed);
  };
  expect(all_failed(0b0011, 0b0011), "cameras 1 and 2 ticked, both failed: they all failed");
  expect(!all_failed(0b0011, 0b0001), "cameras 1 and 2 ticked, only 1 failed: 2 is still being created");
  expect(!all_failed(0, 0), "no camera ticked: not that they all failed");
  expect(!all_failed(0, 0b0101), "no camera ticked, unticked ones failed: not that they all failed");
  expect(all_failed(0b0001, 0b0101), "camera 1 ticked and failed, unticked camera 3 failed too: they all failed");
  expect(!all_failed(0b0011, 0b0101), "cameras 1 and 2 ticked, 1 and unticked 3 failed: 2 is still being created");
  expect(all_failed(0b1111, 0b1111), "all four ticked and failed: they all failed");
  expect(!ticked_cameras_all_failed(link_live, reason_none, 0b0011, 0b0011), "while pictures are sent: the bridge's own words");
  expect(!ticked_cameras_all_failed(link_not_ready, reason_failed, 0b0011, 0b0011), "when the bridge says they failed: its own words");
  expect(!ticked_cameras_all_failed(link_not_ready, reason_loading, 0b0011, 0b0011), "while the flight loads: the bridge's own words");
  expect(!ticked_cameras_all_failed(link_idle, reason_none, 0b0011, 0b0011), "with the broadcast off: the bridge's own words");
}

void verify_sent_size() {
  std::printf("-- the size the window's status line gives while pictures are sent\n");
  // A status with feed_mask, and each camera as {state, generation, width, height}.
  struct Camera {
    FeedState state;
    LONG generation;
    std::uint32_t width, height;
  };
  const auto status = [](std::uint32_t mask, std::array<Camera, Feeds> cameras) {
    Status s{};
    s.state = link_live;
    s.feed_mask = mask;
    for (unsigned feed = 0; feed < Feeds; ++feed) {
      s.feeds[feed].state = cameras[feed].state;
      s.feeds[feed].generation = cameras[feed].generation;
      s.feeds[feed].width = cameras[feed].width;
      s.feeds[feed].height = cameras[feed].height;
    }
    return s;
  };
  const auto is = [](const Status& s, std::uint32_t width, std::uint32_t height) {
    std::uint32_t w = 1, h = 1;
    return sent_size(s, w, h) && w == width && h == height;
  };
  const auto none = [](const Status& s) {
    std::uint32_t w = 7, h = 7;
    return !sent_size(s, w, h) && w == 7 && h == 7;
  };
  constexpr Camera Off{feed_off, 0, 0, 0};
  expect(is(status(0b0011, {{{feed_live, 1, 1920, 1080}, {feed_live, 2, 1920, 1080}, Off, Off}}), 1920, 1080),
         "cameras 1 and 2 send 1920x1080: 1920x1080");
  expect(is(status(0b0011, {{{feed_live, 1, 1920, 1080}, {feed_waiting, 5, 1280, 720}, Off, Off}}), 1920, 1080),
         "720p just asked for: camera 1 still sends 1080, camera 2's new textures have no picture yet: still 1920x1080");
  expect(none(status(0b0011, {{{feed_waiting, 0, 1920, 1080}, {feed_waiting, 5, 1280, 720}, Off, Off}})),
         "both cameras changing size, neither has a picture: no size");
  expect(is(status(0b0011, {{{feed_live, 6, 1280, 720}, {feed_live, 5, 1280, 720}, Off, Off}}), 1280, 720),
         "both cameras send their first 1280x720 pictures: 1280x720");
  expect(none(status(0b0011, {{{feed_live, 1, 1920, 1080}, {feed_live, 5, 1280, 720}, Off, Off}})),
         "camera 1 sends 1080 and camera 2 already 720: no size, and not the window's setting");
  expect(is(status(0b0001, {{{feed_live, 1, 1920, 1080}, Off, {feed_live, 3, 1280, 720}, Off}}), 1920, 1080),
         "camera 3 not rendered by the bridge: its pictures are not counted");
  expect(is(status(0b0011, {{{feed_live, 1, 1920, 1080}, {feed_live, 0, 1280, 720}, Off, Off}}), 1920, 1080),
         "camera 2 marked live with its textures just withdrawn: not counted");
  expect(none(status(0b0001, {{{feed_live, 1, 0, 0}, Off, Off, Off}})), "a camera live at no valid size: no size");
  expect(none(status(0, {{{feed_live, 1, 1920, 1080}, Off, Off, Off}})), "no camera rendered by the bridge: no size");
}

int verify(bool hardware) {
  verify_request();
  verify_status_text();
  verify_waiting_status();
  verify_sent_size();
  Gpu gpu;
  if (!gpu.open(hardware, true)) {
    std::printf("FAIL  no Direct3D 12 device\n");
    return 1;
  }
  expect(BroadcastOutput::prepare_shaders(), "the broadcast shaders compile");
  const auto pid = GetCurrentProcessId();
  for (const auto size : {std::array<UINT, 2>{1280, 720}, std::array<UINT, 2>{1920, 1080}}) {
    const UINT width = size[0], height = size[1], pane = pane_height(height);
    std::printf("-- %ux%u (camera view %ux%u)\n", width, height, width, pane);
    BroadcastOutput output;
    expect(output.initialize(gpu.device), "an output initializes on the device");
    expect(!output.resize(width + 2, height, pid, 1, 0), "a size that is not a picture size is refused");
    expect(output.resize(width, height, pid, height, 0), "three shared textures of the picture's size");
    expect(output.width() == width && output.height() == height && output.generation() == height, "it reports that size and number");
    for (unsigned slot = 0; slot < Slots; ++slot) {
      wchar_t name[96];
      texture_name(name, 96, pid, height, 0, slot);
      HANDLE handle = nullptr;
      const bool named = SUCCEEDED(gpu.device->OpenSharedHandleByName(name, GENERIC_ALL, &handle)) && handle;
      if (handle)
        CloseHandle(handle);
      expect(named, "a texture is found by its name");
    }

    // 1. An 8-bit view is copied as it is; the first and last row are sent twice.
    std::vector<std::uint32_t> ldr(std::size_t{width} * pane, rgba8(64, 128, 192));
    for (UINT x = 0; x < width; ++x) {
      ldr[x] = rgba8(255, 0, 0);
      ldr[std::size_t{pane - 1} * width + x] = rgba8(0, 0, 255);
      ldr[std::size_t{width} + x] = rgba8(0, 255, 0);
    }
    auto* snapshot = make_snapshot(gpu, DXGI_FORMAT_R8G8B8A8_UNORM, width, pane, ldr);
    expect(snapshot != nullptr, "an 8-bit snapshot");
    if (snapshot) {
      expect(output.prepare(snapshot, DXGI_FORMAT_R8G8B8A8_UNORM, 0) && output.submit() && wait_idle(output), "it is recorded and runs");
      const auto picture = read_picture(gpu, output.texture(0));
      expect(picture.size() == std::size_t{width} * height, "the picture reads back");
      if (!picture.empty()) {
        const auto at = [&](UINT x, UINT y) { return picture[std::size_t{y} * width + x]; };
        expect(at(5, 0) == 0xffff0000u && at(width - 1, 1) == 0xffff0000u, "rows 0 and 1 are the view's first row");
        expect(at(width / 2, 2) == 0xff00ff00u, "row 2 is the view's second row");
        expect(at(7, height / 2) == 0xff4080c0u, "the middle is unchanged, red first");
        expect(at(0, height - 1) == 0xff0000ffu && at(width / 2, height - 2) == 0xff0000ffu, "the last two rows are the view's last row");
      }
      // A snapshot of the picture's full height is taken without repeated rows.
      snapshot->Release();
    }
    std::vector<std::uint32_t> full(std::size_t{width} * height, rgba8(10, 20, 30));
    for (UINT x = 0; x < width; ++x)
      full[x] = rgba8(200, 100, 50);
    snapshot = make_snapshot(gpu, DXGI_FORMAT_R8G8B8A8_UNORM, width, height, full);
    if (snapshot) {
      expect(output.prepare(snapshot, DXGI_FORMAT_R8G8B8A8_UNORM, 1) && output.submit() && wait_idle(output), "a full-height snapshot is taken too");
      const auto picture = read_picture(gpu, output.texture(1));
      expect(!picture.empty() && picture[3] == 0xffc86432u && picture[std::size_t{width} + 3] == 0xff0a141eu, "with only its first row in row 0");
      snapshot->Release();
    }
    // Another size or format is refused without failing the output.
    std::vector<std::uint32_t> small(std::size_t{640} * 360, 0);
    snapshot = make_snapshot(gpu, DXGI_FORMAT_R8G8B8A8_UNORM, 640, 360, small);
    if (snapshot) {
      expect(!output.prepare(snapshot, DXGI_FORMAT_R8G8B8A8_UNORM, 0) && !output.failed() && !output.prepared(),
             "a snapshot of another size is refused, and the output carries on");
      snapshot->Release();
    }

    // 1b. Anti-aliasing: a diagonal edge black to white is softened where it
    // steps, and nothing away from it changes.
    expect(BroadcastOutput::antialias_shader_ready(), "the anti-aliasing shader compiles");
    std::vector<std::uint32_t> diagonal(std::size_t{width} * pane);
    const UINT shift = width / 4;
    for (UINT y = 0; y < pane; ++y)
      for (UINT x = 0; x < width; ++x)
        diagonal[std::size_t{y} * width + x] = x > y + shift ? rgba8(255, 255, 255) : rgba8(0, 0, 0);
    snapshot = make_snapshot(gpu, DXGI_FORMAT_R8G8B8A8_UNORM, width, pane, diagonal);
    if (snapshot) {
      output.set_antialias(true);
      expect(output.antialias(), "anti-aliasing is on, with its intermediate picture");
      expect(output.prepare(snapshot, DXGI_FORMAT_R8G8B8A8_UNORM, 0) && output.submit() && wait_idle(output), "it is recorded in two passes and runs");
      const auto picture = read_picture(gpu, output.texture(0));
      if (!picture.empty()) {
        // Picture row y + 1 is the view's row y.
        const auto red = [&](UINT x, UINT view_y) { return (picture[std::size_t{view_y + 1} * width + x] >> 16) & 0xffu; };
        expect(picture[std::size_t{pane / 2 + 1} * width + width / 8] == 0xff000000u && picture[std::size_t{11} * width + width - 10] == 0xffffffffu,
               "far from the edge, black and white as they were");
        unsigned softened = 0;
        for (UINT y = 100; y < 110; ++y) {
          const UINT edge = y + shift;  // the last black pixel of the row
          const auto inside = red(edge, y), outside = red(edge + 1, y);
          softened += (inside > 10 && inside < 245) || (outside > 10 && outside < 245) ? 1 : 0;
          expect(red(edge - 4, y) == 0 && red(edge + 5, y) == 255, "four pixels away it is unchanged");
        }
        expect(softened >= 8, "along the edge the steps are softened");
      }
      output.set_antialias(false);
      expect(!output.antialias(), "and off again");
      snapshot->Release();
    }

    // 2. An HDR view without a tone curve: Taxi Cam's exposure and Reinhard.
    std::vector<std::uint32_t> hdr(std::size_t{width} * pane, r11g11b10(0.5f, 1.0f, 2.0f));
    for (UINT x = 0; x < width / 2; ++x)
      hdr[std::size_t{pane / 2} * width + x] = r11g11b10(8.0f, 0.25f, 0.0f);
    snapshot = make_snapshot(gpu, DXGI_FORMAT_R11G11B10_FLOAT, width, pane, hdr);
    expect(snapshot != nullptr, "an HDR snapshot");
    if (snapshot) {
      expect(output.set_display_exposure(1.0f), "an exposure of +1 EV");
      expect(!output.tone_curve_active(), "no tone curve yet");
      expect(output.prepare(snapshot, DXGI_FORMAT_R11G11B10_FLOAT, 2) && output.submit() && wait_idle(output), "it is recorded and runs");
      auto picture = read_picture(gpu, output.texture(2));
      if (!picture.empty()) {
        const auto at = [&](UINT x, UINT y) { return picture[std::size_t{y} * width + x]; };
        expect(near_rgb(at(width - 3, 10), fallback_code(0.5, 2), fallback_code(1, 2), fallback_code(2, 2)), "fallback exposure: the plain area");
        expect(near_rgb(at(3, pane / 2 + 1), fallback_code(8, 2), fallback_code(0.25, 2), 0), "fallback exposure: the bright bar, one row down");
      }

      // 3. The same view through the simulator's tone curve.
      std::vector<std::uint32_t> table(BroadcastOutput::ToneTableTexels);
      for (UINT z = 0; z < 64; ++z)
        for (UINT y = 0; y < 64; ++y)
          for (UINT x = 0; x < 64; ++x)
            table[(std::size_t{z} * 64 + y) * 64 + x] = static_cast<std::uint32_t>(std::lround(x * 1023.0 / 63)) |
                                                        (static_cast<std::uint32_t>(std::lround(y * 1023.0 / 63)) << 10) |
                                                        (static_cast<std::uint32_t>(std::lround(z * 1023.0 / 63)) << 20) | (3u << 30);
      expect(output.set_tone_curve(0.00625f, table.data()) && output.tone_curve_active(), "a tone-curve table is taken while idle");
      expect(output.prepare(snapshot, DXGI_FORMAT_R11G11B10_FLOAT, 0), "it is recorded with the table");
      expect(output.discard_prepared() && output.tone_curve_active(), "a discarded recording keeps the table for the next one");
      expect(output.prepare(snapshot, DXGI_FORMAT_R11G11B10_FLOAT, 0) && output.submit() && wait_idle(output), "and runs");
      picture = read_picture(gpu, output.texture(0));
      if (!picture.empty()) {
        const auto at = [&](UINT x, UINT y) { return picture[std::size_t{y} * width + x]; };
        expect(near_rgb(at(width - 3, 10), table_code(0.5, 0.00625), table_code(1, 0.00625), table_code(2, 0.00625), 3),
               "tone curve: below the shoulder");
        expect(near_rgb(at(3, pane / 2 + 1), table_code(8, 0.00625), table_code(0.25, 0.00625), 0, 3), "tone curve: on the shoulder");
      }
      expect(output.set_tone_curve(0.05f, nullptr), "another exposure, same table");
      expect(output.prepare(snapshot, DXGI_FORMAT_R11G11B10_FLOAT, 1) && output.submit() && wait_idle(output), "runs");
      picture = read_picture(gpu, output.texture(1));
      if (!picture.empty())
        expect(near_rgb(picture[std::size_t{10} * width + width - 3], table_code(0.5, 0.05), table_code(1, 0.05), table_code(2, 0.05), 3),
               "tone curve: brighter, all three channels on the shoulder");
      // The earlier picture in another texture is untouched.
      picture = read_picture(gpu, output.texture(2));
      if (!picture.empty())
        expect(near_rgb(picture[std::size_t{10} * width + width - 3], fallback_code(0.5, 2), fallback_code(1, 2), fallback_code(2, 2)),
               "the other textures keep their pictures");
      snapshot->Release();
    }
    expect(output.release_textures() && !output.generation(), "the textures are let go");
    wchar_t name[96];
    texture_name(name, 96, pid, height, 0, 0);
    HANDLE handle = nullptr;
    expect(FAILED(gpu.device->OpenSharedHandleByName(name, GENERIC_ALL, &handle)), "and their names with them");
    if (handle)
      CloseHandle(handle);
    expect(output.resize(width, height, pid, height + 1, 3), "and made again under a new number");
    expect(!output.failed(), "the output never failed");
    if (gpu.debug)
      expect(gpu.debug_errors() == 0, "the Direct3D debug layer saw nothing wrong");
  }

  // 4. A failed output is made new and works again (the broadcast turned off and on).
  {
    std::printf("-- a failed output tried again\n");
    const UINT width = 1280, height = 720, pane = pane_height(height);
    std::vector<std::uint32_t> ldr(std::size_t{width} * pane, rgba8(64, 128, 192));
    for (UINT x = 0; x < width; ++x)
      ldr[x] = rgba8(255, 0, 0);
    auto* snapshot = make_snapshot(gpu, DXGI_FORMAT_R8G8B8A8_UNORM, width, pane, ldr);
    expect(snapshot != nullptr, "an 8-bit snapshot");
    BroadcastOutput output;
    expect(!output.initialize(nullptr) && output.failed() && !output.initialized(), "an output without a device fails");
    expect(!output.initialize(gpu.device) && output.failed(), "and stays failed on a real device");
    expect(output.reset() && !output.failed() && !output.generation(), "reset makes it new");
    expect(output.initialize(gpu.device) && output.initialized(), "it initializes on the device");
    expect(output.resize(width, height, pid, 7001, 1), "three shared textures again");
    if (snapshot) {
      expect(output.prepare(snapshot, DXGI_FORMAT_R8G8B8A8_UNORM, 0), "a picture is recorded");
      expect(!output.reset() && output.initialized() && output.prepared(), "reset is refused while a recording is prepared");
      expect(output.submit() && wait_idle(output), "and it runs");
      const auto picture = read_picture(gpu, output.texture(0));
      expect(picture.size() == std::size_t{width} * height && picture[5] == 0xffff0000u && picture[std::size_t{width} + 5] == 0xffff0000u &&
                 picture[std::size_t{height / 2} * width + 7] == 0xff4080c0u,
             "the picture is right after the reset");
    }
    expect(output.reset() && !output.initialized() && !output.generation(), "reset of an idle output lets everything go");
    wchar_t name[96];
    texture_name(name, 96, pid, 7001, 1, 0);
    HANDLE handle = nullptr;
    expect(FAILED(gpu.device->OpenSharedHandleByName(name, GENERIC_ALL, &handle)), "and the textures' names with it");
    if (handle)
      CloseHandle(handle);
    expect(output.initialize(gpu.device) && output.resize(width, height, pid, 7002, 1), "and it can be made once more");
    if (snapshot) {
      expect(output.prepare(snapshot, DXGI_FORMAT_R8G8B8A8_UNORM, 2) && output.submit() && wait_idle(output), "and draws");
      snapshot->Release();
    }
    expect(!output.failed(), "the remade output never failed");
    if (gpu.debug)
      expect(gpu.debug_errors() == 0, "the Direct3D debug layer saw nothing wrong");
  }
  std::printf("%s\n", failures ? "FAILED" : "all passed");
  return failures ? 1 : 0;
}

// The test picture of a camera: colour bars, a white bar that moves with the
// phase in the left third, and fixed rows the window's --check reads.
std::array<unsigned, 3> top_colour(unsigned feed) {
  return {250, 40 * (feed + 1), 10};
}
std::array<unsigned, 3> middle_colour(unsigned feed) {
  return {50 * (feed + 1), 200, 90};
}
std::array<unsigned, 3> bottom_colour(unsigned feed) {
  return {10, 40 * (feed + 1), 250};
}
std::vector<std::uint32_t> test_picture(UINT width, UINT pane, unsigned feed, unsigned phase, unsigned phases) {
  std::vector<std::uint32_t> pixels(std::size_t{width} * pane);
  const UINT third = width / 3, bar = third / phases;
  for (UINT y = 0; y < pane; ++y)
    for (UINT x = 0; x < width; ++x) {
      std::uint32_t colour;
      if (y == 0)
        colour = rgba8(top_colour(feed)[0], top_colour(feed)[1], top_colour(feed)[2]);
      else if (y == pane - 1)
        colour = rgba8(bottom_colour(feed)[0], bottom_colour(feed)[1], bottom_colour(feed)[2]);
      else if (x < third)
        colour = x / bar == phase ? rgba8(255, 255, 255) : rgba8(20 + 50 * feed, 30, 60);
      else if (x < 2 * third)
        colour = rgba8(middle_colour(feed)[0], middle_colour(feed)[1], middle_colour(feed)[2]);
      else
        colour = rgba8((x * 255) / width, (y * 255) / pane, 60 * (feed + 1));
      pixels[std::size_t{y} * width + x] = colour;
    }
  return pixels;
}

int serve(int seconds, const wchar_t* expected_path, bool hardware) {
  Gpu gpu;
  LinkMapping mapping;
  if (!gpu.open(hardware, false) || !mapping.open()) {
    std::printf("FAIL  no Direct3D 12 device or no link\n");
    return 1;
  }
  auto* link = mapping.get();
  HANDLE frame_event = CreateEventW(nullptr, FALSE, FALSE, FrameEventName);
  constexpr unsigned Phases = 8;
  struct Camera {
    BroadcastOutput output;
    std::array<ID3D12Resource*, Phases> pictures{};
    UINT pictures_width = 0;
    unsigned writing = NoSlot, newest = NoSlot, phase = 0;
    std::uint64_t frames = 0, total = 0, next_ms = 0;
    bool read = false;
  };
  std::array<Camera, Feeds> cameras;
  std::uint32_t generation = 0;
  bool asked = false;
  std::uint32_t expected_width = 0, expected_mask = 0;  // what expected.txt was last written for
  Request last;
  const auto pid = GetCurrentProcessId();
  const auto started = GetTickCount64(), deadline = started + static_cast<std::uint64_t>(seconds) * 1000;
  std::printf("standing in for the bridge for %d s\n", seconds);
  std::wstring stop_path = expected_path ? std::wstring(expected_path) + L".stop" : std::wstring();
  std::uint64_t stop_checked = 0;
  for (;;) {
    const auto now = GetTickCount64();
    if (now >= deadline)
      break;
    if (!stop_path.empty() && now - stop_checked >= 500) {
      stop_checked = now;
      if (GetFileAttributesW(stop_path.c_str()) != INVALID_FILE_ATTRIBUTES)
        break;
    }
    Request request;
    if (!read_control(*link, now, request))
      request = last;
    if (request.on != last.on || request.width != last.width || request.fps != last.fps || request.feed_mask != last.feed_mask)
      std::printf("%6llu ms  window asks: %s %ux%u %u fps cameras 0x%x\n", static_cast<unsigned long long>(now - started),
                  request.on ? "on" : "off", request.width, request.height, request.fps, request.feed_mask);
    last = request;
    asked = asked || request.on;
    bool live = false;
    for (unsigned feed = 0; feed < Feeds; ++feed) {
      auto& camera = cameras[feed];
      auto& announced = link->status.feeds[feed];
      if (camera.writing != NoSlot && camera.output.idle()) {
        camera.newest = camera.writing;
        camera.writing = NoSlot;
        ++camera.frames;
        ++camera.total;
        announced.published_ms = now;
        store(announced.published, static_cast<LONG64>(publication(camera.frames, camera.newest)));
        announced.state = feed_live;
        SetEvent(frame_event);
      }
      const auto reading = static_cast<unsigned>(load(announced.reading));
      camera.read = camera.read || (camera.frames && reading < Slots);
      const bool wanted = request.on && ((request.feed_mask >> feed) & 1u);
      if (!wanted) {
        if (camera.output.generation() && camera.writing == NoSlot && camera.output.release_textures()) {
          store(announced.generation, 0);
          store(announced.published, 0);
          camera.newest = NoSlot;
          camera.frames = 0;
        }
        if (!camera.output.generation())
          announced.state = feed_off;
        continue;
      }
      if (!camera.output.initialized() && !camera.output.initialize(gpu.device)) {
        announced.state = feed_failed;
        continue;
      }
      if (camera.output.width() != request.width || camera.output.height() != request.height) {
        if (camera.writing != NoSlot || !camera.output.idle())
          continue;
        store(announced.generation, 0);
        store(announced.published, 0);
        camera.newest = NoSlot;
        camera.frames = 0;
        announced.state = feed_waiting;
        if (!camera.output.resize(request.width, request.height, pid, ++generation, feed)) {
          announced.state = feed_failed;
          std::printf("FAIL  camera %u: %s\n", feed + 1, camera.output.error());
          ++failures;
          continue;
        }
        announced.width = request.width;
        announced.height = request.height;
        store(announced.reading, static_cast<LONG>(NoSlot));
        store(announced.generation, static_cast<LONG>(generation));
      }
      live = live || announced.state == feed_live;
      if (camera.writing != NoSlot || !camera.output.idle() || now < camera.next_ms)
        continue;
      if (camera.pictures_width != request.width) {
        for (auto& picture : camera.pictures) {
          if (picture)
            picture->Release();
          picture = nullptr;
        }
        for (unsigned phase = 0; phase < Phases; ++phase)
          camera.pictures[phase] = make_snapshot(gpu, DXGI_FORMAT_R8G8B8A8_UNORM, request.width, pane_height(request.height),
                                                 test_picture(request.width, pane_height(request.height), feed, phase, Phases));
        camera.pictures_width = request.width;
      }
      unsigned slot = 0;
      while (slot < Slots - 1 && (slot == camera.newest || slot == reading))
        ++slot;
      auto* picture = camera.pictures[camera.phase];
      camera.phase = (camera.phase + 1) % Phases;
      if (!picture || !camera.output.prepare(picture, DXGI_FORMAT_R8G8B8A8_UNORM, slot) || !camera.output.submit()) {
        std::printf("FAIL  camera %u: %s\n", feed + 1, camera.output.error());
        ++failures;
        break;
      }
      camera.writing = slot;
      camera.next_ms = now + 1000 / std::max(request.fps, 1u);
    }
    auto& status = link->status;
    status.pid = pid;
    status.protocol = LinkVersion;
    status.adapter = gpu.luid;
    status.sim_fps = 60;
    status.view_ms = 5.5f;
    status.fps = request.on ? request.fps : 0;
    status.feed_mask = request.on ? request.feed_mask : 0;
    status.memory_mb = 2048;
    status.memory_budget_mb = 8192;
    status.guard = request.on && request.memory_guard ? guard_watching : guard_off;
    std::snprintf(status.version, sizeof(status.version), "%s", POLARIS_CAM_VERSION);
    constexpr char aircraft[] = "SimObjects\\Airplanes\\POLARIS_SELFTEST\\presets\\a\\b\\config\\aircraft.CFG";
    write_status_text(*link, aircraft, sizeof(aircraft), "");
    status.reason = !request.on ? reason_none : live ? reason_none : reason_starting;
    status.state = !request.on ? link_idle : live ? link_live : link_waiting;
    status.heartbeat_ms = now;
    bool all_live = request.on;
    for (unsigned feed = 0; feed < Feeds; ++feed)
      all_live = all_live && (!((request.feed_mask >> feed) & 1u) ||
                              (link->status.feeds[feed].state == feed_live && cameras[feed].output.width() == request.width && cameras[feed].frames));
    if (all_live && expected_path && (expected_width != request.width || expected_mask != request.feed_mask)) {
      // What the window's --check reads from each camera, in its own words.
      if (FILE* out = _wfopen(expected_path, L"w")) {
        for (unsigned feed = 0; feed < Feeds; ++feed) {
          if (!((request.feed_mask >> feed) & 1u))
            continue;
          const auto top = top_colour(feed), middle = middle_colour(feed), bottom = bottom_colour(feed);
          std::fprintf(out, "camera %u: %ux%u top %02x%02x%02x middle %02x%02x%02x bottom %02x%02x%02x\n", feed + 1, request.width, request.height,
                       top[0], top[1], top[2], middle[0], middle[1], middle[2], bottom[0], bottom[1], bottom[2]);
        }
        std::fclose(out);
        expected_width = request.width;
        expected_mask = request.feed_mask;
      }
    }
    Sleep(1);
  }
  link->status.state = link_idle;
  link->status.heartbeat_ms = 0;
  bool read = false;
  for (unsigned feed = 0; feed < Feeds; ++feed) {
    std::printf("camera %u: %llu pictures sent%s\n", feed + 1, static_cast<unsigned long long>(cameras[feed].total),
                cameras[feed].read ? ", read by a window" : "");
    read = read || cameras[feed].read;
  }
  expect(asked, "a window asked for the broadcast");
  expect(read, "a window read pictures");
  return failures ? 1 : 0;
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  std::setvbuf(stdout, nullptr, _IONBF, 0);
  bool hardware = false;
  for (int i = 1; i < argc; ++i)
    hardware = hardware || std::wcscmp(argv[i], L"--hardware") == 0;
  if (argc >= 2 && std::wcscmp(argv[1], L"--verify") == 0)
    return verify(hardware);
  if (argc >= 4 && std::wcscmp(argv[1], L"--serve") == 0)
    return serve(_wtoi(argv[2]), argv[3], hardware);
  std::printf("usage: polaris-cam-selftest --verify [--hardware] | --serve <seconds> <expected.txt> [--hardware]\n");
  return 2;
}
