// Polaris Cam: the broadcast through Taxi Cam's real scene runtime and capture
// manager, on a Direct3D 12 device without a simulator.
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
//
// Built and run by .github/workflows/test-polaris-cam-taxi-cam.yml inside Taxi
// Cam's own tree (it uses Taxi Cam's test fixture, tests/support, and is
// copied to tests/graphics there). Modelled on Taxi Cam's
// tests/graphics/frame_order_validation.cpp: camera outputs are plain render
// targets, a "simulator" queue draws into them and submits through the capture
// manager, and scene_runtime::service does the rest with no test bypass.
//
// It checks what the self-test cannot: that each camera's captured snapshot
// reaches its own shared picture while the broadcast is on (the snapshot's
// lease, the private submission on the manager's timeline, the announcement in
// the shared block), that nothing is composed for the cockpit then, that an
// unticked camera, another size and turning the broadcast off behave, and that
// Taxi Cam composes as before afterwards. The Direct3D debug layer watches all
// of it.
#undef WIN32_LEAN_AND_MEAN
#undef NOMINMAX
#define wmain existing_compositor_validation_entry
#include "compositor_main.cpp"
#undef wmain
#include "../../src/graphics/scene_runtime.hpp"
#include "../../src/profiles/discovered.hpp"

namespace {
namespace runtime = taxi_camera::scene_runtime;
using namespace polaris_cam;

void broadcast_case(bool warp) {
  using namespace taxi_camera;
  Reference<ID3D12Debug> debug;
  const bool debug_enabled = SUCCEEDED(D3D12GetDebugInterface(IID_PPV_ARGS(debug.put())));
  if (debug_enabled)
    debug->EnableDebugLayer();
  Reference<IDXGIFactory4> factory;
  check(CreateDXGIFactory2(0, IID_PPV_ARGS(factory.put())), "Broadcast factory");
  Reference<IDXGIAdapter> adapter;
  if (warp)
    check(factory->EnumWarpAdapter(IID_PPV_ARGS(adapter.put())), "Broadcast WARP");
  Reference<ID3D12Device> device;
  check(D3D12CreateDevice(adapter.get(), D3D_FEATURE_LEVEL_12_0, IID_PPV_ARGS(device.put())), "Broadcast device");
  Reference<ID3D12InfoQueue> messages;
  if (debug_enabled)
    check(device->QueryInterface(IID_PPV_ARGS(messages.put())), "Broadcast debug messages");
  constexpr std::uint64_t key = 9201;
  constexpr UINT width = 1280, height = 720, pane = 718;
  // The camera shape the bridge publishes for a 720p broadcast.
  const profiles::DisplayOverride none{};
  require(profiles::publish_override(&profiles::A380, none, MaxDisplaySides, pane_code(width, height)) != nullptr,
          "Broadcast camera shape published");
  require(profiles::camera_candidate(width, pane), "A camera output of the broadcast shape is a camera's");
  require(runtime::init_device(key, device.get()) && runtime::prepare(key), "Broadcast actual runtime");
  auto& manager = runtime::manager();
  auto& handoff = scene_handoff();
  require(handoff.register_device(key) != 0, "Broadcast handoff device");
  Reference<ID3D12CommandQueue> queue;
  const D3D12_COMMAND_QUEUE_DESC qd{};
  check(device->CreateCommandQueue(&qd, IID_PPV_ARGS(queue.put())), "Broadcast simulator queue");
  Reference<ID3D12DescriptorHeap> heap;
  const D3D12_DESCRIPTOR_HEAP_DESC hd{D3D12_DESCRIPTOR_HEAP_TYPE_RTV, Feeds, D3D12_DESCRIPTOR_HEAP_FLAG_NONE, 0};
  check(device->CreateDescriptorHeap(&hd, IID_PPV_ARGS(heap.put())), "Broadcast RTVs");
  std::array<Reference<ID3D12Resource>, Feeds> sources;
  std::array<D3D12_CPU_DESCRIPTOR_HANDLE, Feeds> rtvs{};
  std::array<std::uint64_t, SceneFeeds> handles{};
  for (UINT feed = 0; feed < Feeds; ++feed) {
    create_texture(device.get(), texture_description(width, pane, DXGI_FORMAT_R8G8B8A8_UNORM), sources[feed].put());
    handles[feed] = reinterpret_cast<std::uint64_t>(sources[feed].get());
    require(handoff.register_resource(key, handles[feed], 601 + feed), "Broadcast resource identity");
    rtvs[feed] = {heap->GetCPUDescriptorHandleForHeapStart().ptr + SIZE_T{feed} * device->GetDescriptorHandleIncrementSize(hd.Type)};
    device->CreateRenderTargetView(sources[feed].get(), nullptr, rtvs[feed]);
  }
  handoff.begin_scene();
  require(handoff.publish(handoff.begin_capture(), {74, 1}, {201, 202, 203, 204}, handles), "Broadcast publication of four cameras");

  // The block the bridge shares with the window: here a plain object.
  static Link link{};
  runtime::set_broadcast_link(&link);

  struct Recording {
    Reference<ID3D12CommandAllocator> allocator;
    Reference<ID3D12GraphicsCommandList> list;
    std::uint64_t generation = 0;
  };
  std::array<Recording, 64> recordings;
  UINT next = 0;
  // The "simulator" renders a camera: one colour over the whole output.
  const auto record = [&](UINT feed, UINT red, UINT green, UINT blue) -> Recording& {
    require(next < recordings.size(), "Bounded broadcast recordings");
    auto& item = recordings[next++];
    item.generation = next;
    check(device->CreateCommandAllocator(qd.Type, IID_PPV_ARGS(item.allocator.put())), "Broadcast allocator");
    check(device->CreateCommandList(0, qd.Type, item.allocator.get(), nullptr, IID_PPV_ARGS(item.list.put())), "Broadcast list");
    require(manager.register_command_list(item.list.get(), key, item.generation), "Broadcast recording registration");
    const float color[]{red / 255.f, green / 255.f, blue / 255.f, 1};
    item.list->ClearRenderTargetView(rtvs[feed], color, 0, nullptr);
    require(manager.record_render_target_before_transition(item.list.get(), sources[feed].get(), true, item.generation),
            "Broadcast source capture");
    transition(item.list.get(), sources[feed].get(), D3D12_RESOURCE_STATE_RENDER_TARGET, D3D12_RESOURCE_STATE_COPY_SOURCE);
    transition(item.list.get(), sources[feed].get(), D3D12_RESOURCE_STATE_COPY_SOURCE, D3D12_RESOURCE_STATE_RENDER_TARGET);
    check(item.list->Close(), "Broadcast Close");
    return item;
  };
  // One simulator frame: every listed camera rendered in one submission.
  const auto frame = [&](std::initializer_list<Recording*> batch) {
    std::array<ID3D12CommandList*, Feeds> lists{};
    UINT count = 0;
    for (auto* item : batch)
      lists[count++] = item->list.get();
    const auto receipt = manager.before_submission(queue.get(), count, lists.data());
    require(receipt != 0, "Broadcast exact submission receipt");
    queue->ExecuteCommandLists(count, lists.data());
    manager.after_submission(queue.get(), receipt);
    require(drain_copy_queue(queue.get(), device.get()), "Broadcast producer completion");
    for (auto* item : batch)
      manager.destroy_command_list(item->list.get(), item->generation);
  };
  const auto service = [&] {
    for (unsigned pass = 0; pass < 3; ++pass) {
      // Join the private outputs' timeline before polling, as Taxi Cam's own
      // test does: no sleep or GPU-speed assumption.
      const auto flush = manager.begin_private_submission(key, queue.get());
      require(flush.receipt && manager.end_private_submission(flush.receipt), "Broadcast timeline join");
      require(drain_copy_queue(queue.get(), device.get()), "Broadcast retirement and consumption completion");
      runtime::service();
    }
    const auto status = runtime::snapshot(key);
    if (status.failed)
      std::fprintf(stderr, "runtime failed: %s\n", status.message);
    require(!status.failed && !status.capture.quarantined, "Broadcast lifecycle remains healthy");
    return status;
  };
  // A shared picture, read back through its name as another process opens it: 0xAARRGGBB of its middle and corners.
  const auto picture = [&](unsigned feed) {
    const auto& announced = link.status.feeds[feed];
    const auto published = static_cast<std::uint64_t>(load(announced.published));
    require(load(announced.generation) != 0 && published_frames(published) != 0 && published_slot(published) < Slots,
            "A picture is announced for the camera");
    wchar_t name[96];
    texture_name(name, 96, GetCurrentProcessId(), static_cast<std::uint32_t>(load(announced.generation)), feed, published_slot(published));
    HANDLE handle = nullptr;
    check(device->OpenSharedHandleByName(name, GENERIC_ALL, &handle), "The announced texture is found by its name");
    Reference<ID3D12Resource> texture;
    check(device->OpenSharedHandle(handle, IID_PPV_ARGS(texture.put())), "The announced texture opens");
    CloseHandle(handle);
    const auto desc = texture->GetDesc();
    require(desc.Width == announced.width && desc.Height == announced.height && desc.Format == DXGI_FORMAT_B8G8R8A8_UNORM,
            "The texture has the announced size");
    D3D12_PLACED_SUBRESOURCE_FOOTPRINT footprint{};
    UINT64 bytes = 0;
    device->GetCopyableFootprints(&desc, 0, 1, 0, &footprint, nullptr, nullptr, &bytes);
    auto buffer = texture_description(1, 1, DXGI_FORMAT_UNKNOWN);
    buffer.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    buffer.Width = bytes;
    buffer.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
    buffer.Flags = D3D12_RESOURCE_FLAG_NONE;
    const auto readback_heap = heap_properties(D3D12_HEAP_TYPE_READBACK);
    Reference<ID3D12Resource> readback;
    check(device->CreateCommittedResource(&readback_heap, D3D12_HEAP_FLAG_NONE, &buffer, D3D12_RESOURCE_STATE_COPY_DEST, nullptr,
                                          IID_PPV_ARGS(readback.put())),
          "Broadcast readback buffer");
    Reference<ID3D12CommandAllocator> allocator;
    Reference<ID3D12GraphicsCommandList> list;
    check(device->CreateCommandAllocator(qd.Type, IID_PPV_ARGS(allocator.put())), "Broadcast readback allocator");
    check(device->CreateCommandList(0, qd.Type, allocator.get(), nullptr, IID_PPV_ARGS(list.put())), "Broadcast readback list");
    transition(list.get(), texture.get(), D3D12_RESOURCE_STATE_COMMON, D3D12_RESOURCE_STATE_COPY_SOURCE);
    D3D12_TEXTURE_COPY_LOCATION destination{}, source{};
    destination.pResource = readback.get();
    destination.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
    destination.PlacedFootprint = footprint;
    source.pResource = texture.get();
    source.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
    list->CopyTextureRegion(&destination, 0, 0, 0, &source, nullptr);
    transition(list.get(), texture.get(), D3D12_RESOURCE_STATE_COPY_SOURCE, D3D12_RESOURCE_STATE_COMMON);
    check(list->Close(), "Broadcast readback Close");
    // Not a simulator submission: a reader in another process.
    Reference<ID3D12CommandQueue> reader;
    check(device->CreateCommandQueue(&qd, IID_PPV_ARGS(reader.put())), "Broadcast reader queue");
    ID3D12CommandList* lists[]{list.get()};
    reader->ExecuteCommandLists(1, lists);
    require(drain_copy_queue(reader.get(), device.get()), "Broadcast readback completion");
    void* mapped = nullptr;
    check(readback->Map(0, nullptr, &mapped), "Broadcast readback map");
    const auto at = [&](UINT x, UINT y) {
      std::uint32_t pixel = 0;
      std::memcpy(&pixel, static_cast<unsigned char*>(mapped) + footprint.Offset + std::size_t{y} * footprint.Footprint.RowPitch + std::size_t{x} * 4, 4);
      return pixel;
    };
    const std::array<std::uint32_t, 3> pixels{at(0, 0), at(static_cast<UINT>(desc.Width / 2), desc.Height / 2),
                                              at(static_cast<UINT>(desc.Width - 1), desc.Height - 1)};
    readback->Unmap(0, nullptr);
    require(pixels[0] == pixels[1] && pixels[1] == pixels[2], "One colour over the whole picture, its repeated rows included");
    return pixels[1];
  };
  const auto frames_of = [&](unsigned feed) { return published_frames(static_cast<std::uint64_t>(load(link.status.feeds[feed].published))); };
  const auto slot_of = [&](unsigned feed) { return published_slot(static_cast<std::uint64_t>(load(link.status.feeds[feed].published))); };
  const auto generation_of = [&](unsigned feed) { return static_cast<std::uint32_t>(load(link.status.feeds[feed].generation)); };

  // 1. Cameras 1, 2 and 4 are broadcast; camera 3 renders too but is not ticked.
  runtime::set_broadcast(key, width, height, 0b1011);
  frame({&record(0, 200, 30, 20), &record(1, 20, 200, 30), &record(2, 9, 9, 9), &record(3, 30, 20, 200)});
  auto status = service();
  require(status.capture.completed == 4, "All four camera snapshots reach the runtime");
  require(frames_of(0) == 1 && frames_of(1) == 1 && frames_of(3) == 1, "Each ticked camera has its first picture");
  require(link.status.feeds[0].state == feed_live && link.status.feeds[3].state == feed_live, "They are announced as live");
  require(generation_of(2) == 0 && frames_of(2) == 0 && link.status.feeds[2].state == feed_off, "The unticked camera has no textures and no picture");
  require(link.status.feeds[0].width == width && link.status.feeds[0].height == height, "The announced size is the picture's");
  require(picture(0) == 0xffc81e14u && picture(1) == 0xff14c81eu && picture(3) == 0xff1e14c8u, "Each picture is its own camera's snapshot");
  require(!status.output && status.frames == 1, "Nothing was composed for the cockpit displays; the round counts once");
  const std::array<unsigned, Feeds> first_slot{slot_of(0), slot_of(1), 0, slot_of(3)};

  // 2. The next pictures go to another texture than the newest; the one a
  // window says it is copying from is left alone as well.
  store(link.status.feeds[0].reading, static_cast<LONG>(first_slot[0]));
  frame({&record(0, 10, 20, 30), &record(1, 40, 50, 60)});
  status = service();
  require(frames_of(0) == 2 && frames_of(1) == 2 && frames_of(3) == 1, "Only the cameras that rendered have a second picture");
  require(slot_of(0) != first_slot[0] && slot_of(1) != first_slot[1], "The newest picture was not written over");
  require(picture(0) == 0xff0a141eu && picture(1) == 0xff28323cu && picture(3) == 0xff1e14c8u, "Second pictures, and camera 4's first still there");
  const unsigned second_slot = slot_of(0);
  frame({&record(0, 70, 80, 90)});
  status = service();
  require(frames_of(0) == 3 && slot_of(0) != second_slot && slot_of(0) != first_slot[0],
          "The third picture avoids both the newest and the one being read");
  require(picture(0) == 0xff46505au && status.frames == 3, "Third picture; three rounds counted");

  // 3. Two renders of one camera before the service runs: the newer one is sent.
  auto& older = record(1, 1, 2, 3);
  frame({&older});
  frame({&record(1, 100, 110, 120)});
  status = service();
  require(picture(1) == 0xff646e78u, "The newest snapshot is the one sent");

  // 4. Camera 3 ticked instead of 1, 2 and 4: theirs go, its own come.
  runtime::set_broadcast(key, width, height, 0b0100);
  frame({&record(0, 5, 5, 5), &record(2, 150, 160, 170)});
  status = service();
  require(generation_of(0) == 0 && generation_of(1) == 0 && generation_of(3) == 0, "Unticked cameras let their textures go");
  require(link.status.feeds[0].state == feed_off && frames_of(0) == 0, "and are announced as off");
  require(generation_of(2) != 0 && frames_of(2) == 1 && picture(2) == 0xff96a0aau, "The newly ticked camera has its picture");

  // 5. Another size asked for while the cameras still have the old one: new
  // textures under a new number, and the old-size snapshot is not sent.
  const auto old_generation = generation_of(2);
  runtime::set_broadcast(key, 1920, 1080, 0b0100);
  frame({&record(2, 1, 1, 1)});
  status = service();
  require(generation_of(2) != 0 && generation_of(2) != old_generation, "A new size makes new textures under a new number");
  require(link.status.feeds[2].width == 1920 && link.status.feeds[2].height == 1080 && frames_of(2) == 0,
          "of the new size, with no picture until the cameras have it");
  require(link.status.feeds[2].state == feed_waiting, "announced as waiting");

  // 6. Off: every texture goes, and Taxi Cam composes for the cockpit again.
  runtime::set_broadcast(key, 0, 0, 0);
  status = service();
  for (unsigned feed = 0; feed < Feeds; ++feed)
    require(generation_of(feed) == 0 && link.status.feeds[feed].state == feed_off, "Off: no camera has textures");
  const auto before = status.frames;
  frame({&record(0, 60, 60, 60), &record(1, 90, 90, 90)});
  status = service();
  require(status.frames == before + 1 && status.output, "With the broadcast off the nose and tail compose for the cockpit as before");

  // 7. On again after off.
  runtime::set_broadcast(key, width, height, 0b0001);
  frame({&record(0, 210, 220, 230)});
  status = service();
  require(frames_of(0) == 1 && picture(0) == 0xffd2dce6u, "On again: a first picture under new textures");

  handoff.stop_scene();
  runtime::reset_feed(key);
  runtime::set_broadcast(key, 0, 0, 0);
  service();
  UINT64 errors = 0;
  if (messages.get())
    for (UINT64 index = 0; index < messages->GetNumStoredMessages(); ++index) {
      SIZE_T size = 0;
      check(messages->GetMessage(index, nullptr, &size), "Broadcast debug message size");
      std::vector<unsigned char> bytes(size);
      auto* message = reinterpret_cast<D3D12_MESSAGE*>(bytes.data());
      check(messages->GetMessage(index, message, &size), "Broadcast debug message");
      if (message->Severity <= D3D12_MESSAGE_SEVERITY_ERROR) {
        ++errors;
        std::fprintf(stderr, "D3D12 error %u: %s\n", message->ID, message->pDescription);
      }
    }
  require(errors == 0, "Broadcast GPU debug validation");
  std::printf("PASS broadcast runtime %s: four cameras' snapshots to their own shared pictures through the real capture manager, an "
              "unticked camera, the newest and the read texture kept, newest snapshot wins, cameras swapped, another size, off and "
              "composing again, on again; debug=%d errors=%llu.\n",
              warp ? "WARP" : "hardware", debug_enabled, errors);
}
}  // namespace
int wmain(int argc, wchar_t** argv) {
  try {
    if (argc > 2 || (argc == 2 && std::wcscmp(argv[1], L"--warp") != 0))
      return 2;
    broadcast_case(argc == 2);
    return 0;
  } catch (const std::exception& error) {
    std::fprintf(stderr, "FAIL broadcast runtime: %s\n", error.what());
    return 1;
  }
}
