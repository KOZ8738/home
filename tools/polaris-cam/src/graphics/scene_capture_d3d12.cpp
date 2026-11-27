#include "scene_capture_d3d12.hpp"
#include "native_device_identity.hpp"

#include <limits>

namespace taxi_camera {
namespace {
unsigned pixel_bytes(DXGI_FORMAT format) noexcept {
  switch (format) {
    case DXGI_FORMAT_R8G8B8A8_UNORM:
    case DXGI_FORMAT_R8G8B8A8_UNORM_SRGB:
    case DXGI_FORMAT_R8G8B8A8_TYPELESS:
    case DXGI_FORMAT_B8G8R8A8_UNORM:
    case DXGI_FORMAT_B8G8R8A8_UNORM_SRGB:
    case DXGI_FORMAT_B8G8R8A8_TYPELESS:
    case DXGI_FORMAT_R11G11B10_FLOAT:
      return 4;
    case DXGI_FORMAT_R16G16B16A16_FLOAT:
      return 8;  // Capture only; downstream color conversion is not implied.
    default:
      return 0;
  }
}

bool valid_description(const D3D12_RESOURCE_DESC& desc) noexcept {
  const auto bytes = pixel_bytes(desc.Format);
  return bytes != 0 && desc.Dimension == D3D12_RESOURCE_DIMENSION_TEXTURE2D && desc.Width >= 1 && desc.Width <= 8192 && desc.Height >= 1 &&
         desc.Height <= 8192 && desc.DepthOrArraySize == 1 && desc.MipLevels == 1 && desc.SampleDesc.Count == 1 &&
         desc.SampleDesc.Quality == 0 && desc.Layout == D3D12_TEXTURE_LAYOUT_UNKNOWN &&
         (desc.Flags & D3D12_RESOURCE_FLAG_ALLOW_DEPTH_STENCIL) == 0 &&
         desc.Width * desc.Height * bytes + D3D12_DEFAULT_RESOURCE_PLACEMENT_ALIGNMENT <= SceneCaptureD3D12::MaximumBytes;
}

bool compatible(const D3D12_RESOURCE_DESC& first, const D3D12_RESOURCE_DESC& second) noexcept {
  return valid_description(first) && first.Width == second.Width && first.Height == second.Height && first.Format == second.Format;
}
}  // namespace

SceneCaptureD3D12::~SceneCaptureD3D12() {
  // Dropping these raw owning references without Release is deliberate if the
  // recording or consumer might still use them. Never silently free in-flight
  // GPU storage because its CPU owner went out of scope.
  release_idle();
}

bool SceneCaptureD3D12::fail(const char* message) noexcept {
  error_ = message;
  return false;
}

bool SceneCaptureD3D12::device_ok() const noexcept {
  return device_ != nullptr && SUCCEEDED(device_->GetDeviceRemovedReason());
}

bool SceneCaptureD3D12::same_device(ID3D12DeviceChild* object) const noexcept {
  return same_native_device(object, device_);
}

HRESULT SceneCaptureD3D12::initialize(ID3D12Device* device, const D3D12_RESOURCE_DESC& description) noexcept {
  if (state_ != State::empty || device == nullptr || !valid_description(description)) {
    fail("An empty packet, live device and supported bounded single-subresource texture are required.");
    return E_INVALIDARG;
  }
  if (FAILED(device->GetDeviceRemovedReason()))
    return DXGI_ERROR_DEVICE_REMOVED;
  device_ = device;
  device_->AddRef();
  description_ = description;
  description_.Alignment = 0;
  description_.Flags = D3D12_RESOURCE_FLAG_NONE;
  const auto allocation = device_->GetResourceAllocationInfo(0, 1, &description_);
  if (allocation.SizeInBytes == 0 || allocation.SizeInBytes > MaximumBytes) {
    release_objects();
    fail("The device-reported texture allocation exceeds the packet's byte limit.");
    return E_INVALIDARG;
  }
  allocation_bytes_ = allocation.SizeInBytes;
  D3D12_HEAP_PROPERTIES heap{};
  heap.Type = D3D12_HEAP_TYPE_DEFAULT;
  heap.CreationNodeMask = heap.VisibleNodeMask = 1;
  HRESULT result = device_->CreateCommittedResource(&heap, D3D12_HEAP_FLAG_NONE, &description_, D3D12_RESOURCE_STATE_COPY_DEST, nullptr,
                                                    IID_PPV_ARGS(&snapshot_));
  if (SUCCEEDED(result))
    result = device_->CreateFence(0, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(&producer_fence_));
  if (FAILED(result)) {
    release_objects();
    fail("Preallocating the capture texture or completion fence failed.");
    return result;
  }
  ++allocations_;
  state_ = State::idle;
  error_ = "";
  return S_OK;
}

bool SceneCaptureD3D12::record_copy_source(ID3D12GraphicsCommandList* list, ID3D12Resource* source, bool allow_overwrite) noexcept {
  const bool overwrite = allow_overwrite && state_ == State::recorded;
  if ((state_ != State::idle && !overwrite) || list == nullptr || source == nullptr || source == snapshot_ || !device_ok() ||
      !same_device(list) || !same_device(source))
    return fail("Capture requires an idle packet and live same-device API-event arguments.");
  if (overwrite && (source_ != source || recording_list_ != list))
    return fail("A copy capture may only overwrite its own recording's retained source.");
  const auto type = list->GetType();
  if (type != D3D12_COMMAND_LIST_TYPE_DIRECT || !compatible(source->GetDesc(), description_))
    return fail("Only a matching whole single-subresource texture on a DIRECT list can be captured.");
  // The caller established source access from the real application copy. No
  // source barrier is emitted; only our already-COPY_DEST texture is written.
  if (!overwrite) {
    source->AddRef();
    source_ = source;
    recording_list_ = list;
    ++recordings_;
  }
  list->CopyResource(snapshot_, source);
  state_ = State::recorded;
  error_ = "";
  return true;
}

bool SceneCaptureD3D12::begin_render_capture(ID3D12GraphicsCommandList* list, ID3D12Resource* source, bool proven) noexcept {
  if (!proven || !list || !source || source == snapshot_ || (state_ != State::idle && state_ != State::recorded) || !device_ok() ||
      !same_device(list) || !same_device(source) || list->GetType() != D3D12_COMMAND_LIST_TYPE_DIRECT)
    return fail("Render capture requires a proven native RT boundary on a live DIRECT recording.");
  if (state_ == State::recorded && (source_ != source || recording_list_ != list))
    return fail("A render capture may only overwrite its own recording's retained source.");
  const auto desc = source->GetDesc();
  if (!compatible(desc, description_) || (desc.Flags & D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET) == 0 ||
      (desc.Flags & D3D12_RESOURCE_FLAG_ALLOW_SIMULTANEOUS_ACCESS) != 0)
    return fail("Render capture requires a matching ordinary single-subresource color render target.");
  if (state_ == State::idle) {
    source->AddRef();
    source_ = source;
    recording_list_ = list;
    ++recordings_;
  }
  return true;
}

bool SceneCaptureD3D12::record_render_target_source(ID3D12GraphicsCommandList* list,
                                                    ID3D12Resource* source,
                                                    bool proven_legacy_render_target) noexcept {
  if (!begin_render_capture(list, source, proven_legacy_render_target))
    return false;
  D3D12_RESOURCE_BARRIER barrier{};
  barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
  barrier.Transition = {source, 0, D3D12_RESOURCE_STATE_RENDER_TARGET, D3D12_RESOURCE_STATE_COPY_SOURCE};
  list->ResourceBarrier(1, &barrier);
  list->CopyResource(snapshot_, source);
  barrier.Transition.StateBefore = D3D12_RESOURCE_STATE_COPY_SOURCE;
  barrier.Transition.StateAfter = D3D12_RESOURCE_STATE_RENDER_TARGET;
  list->ResourceBarrier(1, &barrier);
  state_ = State::recorded;
  ++render_target_writes_;
  error_ = "";
  return true;
}

bool SceneCaptureD3D12::record_render_target_source_enhanced(ID3D12GraphicsCommandList7* list,
                                                             ID3D12Resource* source,
                                                             bool proven_enhanced_render_target) noexcept {
  if (!begin_render_capture(list, source, proven_enhanced_render_target))
    return false;
  D3D12_TEXTURE_BARRIER barrier{};
  barrier.SyncBefore = D3D12_BARRIER_SYNC_ALL;
  barrier.SyncAfter = D3D12_BARRIER_SYNC_COPY;
  barrier.AccessBefore = D3D12_BARRIER_ACCESS_RENDER_TARGET;
  barrier.AccessAfter = D3D12_BARRIER_ACCESS_COPY_SOURCE;
  barrier.LayoutBefore = D3D12_BARRIER_LAYOUT_RENDER_TARGET;
  barrier.LayoutAfter = D3D12_BARRIER_LAYOUT_COPY_SOURCE;
  barrier.pResource = source;
  barrier.Subresources.NumMipLevels = barrier.Subresources.NumArraySlices = barrier.Subresources.NumPlanes = 1;
  D3D12_BARRIER_GROUP group{};
  group.Type = D3D12_BARRIER_TYPE_TEXTURE;
  group.NumBarriers = 1;
  group.pTextureBarriers = &barrier;
  list->Barrier(1, &group);
  list->CopyResource(snapshot_, source);
  barrier.SyncBefore = D3D12_BARRIER_SYNC_COPY;
  barrier.SyncAfter = D3D12_BARRIER_SYNC_ALL;
  barrier.AccessBefore = D3D12_BARRIER_ACCESS_COPY_SOURCE;
  barrier.AccessAfter = D3D12_BARRIER_ACCESS_RENDER_TARGET;
  barrier.LayoutBefore = D3D12_BARRIER_LAYOUT_COPY_SOURCE;
  barrier.LayoutAfter = D3D12_BARRIER_LAYOUT_RENDER_TARGET;
  list->Barrier(1, &group);
  state_ = State::recorded;
  ++render_target_writes_;
  error_ = "";
  return true;
}

bool SceneCaptureD3D12::retire_recording(ID3D12CommandQueue* queue) noexcept {
  return retire_serialized_recording(queue);
}

bool SceneCaptureD3D12::discard_unsubmitted_retired() noexcept {
  if (state_ != State::recorded || !source_)
    return fail("Only a never-submitted, definitively retired recording may be discarded.");
  source_->Release();
  source_ = nullptr;
  recording_list_ = nullptr;
  state_ = State::idle;
  error_ = "";
  return true;
}

bool SceneCaptureD3D12::retire_serialized_recording(ID3D12CommandQueue* queue) noexcept {
  if (state_ != State::recorded || queue == nullptr || !device_ok() || !same_device(queue) ||
      queue->GetDesc().Type != D3D12_COMMAND_LIST_TYPE_DIRECT || producer_value_ == std::numeric_limits<std::uint64_t>::max() - 1)
    return fail("Retirement requires the actual completed-submission queue and a non-exhausted fence sequence.");
  ++producer_value_;
  if (FAILED(queue->Signal(producer_fence_, producer_value_))) {
    state_ = State::failed;
    return fail("Producer queue Signal failed; the capture remains quarantined.");
  }
  state_ = State::retiring;
  return true;
}

bool SceneCaptureD3D12::poll_ready() noexcept {
  if (state_ == State::ready)
    return device_ok();
  if (state_ != State::retiring || !device_ok())
    return false;
  const auto completed = producer_fence_->GetCompletedValue();
  if (completed == std::numeric_limits<std::uint64_t>::max()) {
    state_ = State::failed;
    return fail("Producer fence reported device removal.");
  }
  if (completed < producer_value_)
    return false;
  source_->Release();
  source_ = nullptr;
  recording_list_ = nullptr;
  state_ = State::ready;
  return true;
}

ID3D12Resource* SceneCaptureD3D12::ready_resource() const noexcept {
  return state_ == State::ready && device_ok() ? snapshot_ : nullptr;
}

bool SceneCaptureD3D12::finish_consumption(ID3D12Fence* fence, std::uint64_t value) noexcept {
  if (state_ != State::ready || fence == nullptr || value == 0 || value == std::numeric_limits<std::uint64_t>::max() ||
      !same_device(fence) || !device_ok())
    return fail("Consumption requires a same-device fence value covering every submitted reader.");
  fence->AddRef();
  consumer_fence_ = fence;
  consumer_value_ = value;
  state_ = State::consuming;
  return true;
}

bool SceneCaptureD3D12::recycle() noexcept {
  if (state_ != State::consuming || !device_ok())
    return false;
  const auto completed = consumer_fence_->GetCompletedValue();
  if (completed == std::numeric_limits<std::uint64_t>::max()) {
    state_ = State::failed;
    return fail("Consumer fence reported device removal.");
  }
  if (completed < consumer_value_)
    return false;
  consumer_fence_->Release();
  consumer_fence_ = nullptr;
  consumer_value_ = 0;
  state_ = State::idle;
  error_ = "";
  return true;
}

bool SceneCaptureD3D12::release_idle() noexcept {
  if (state_ != State::idle && state_ != State::empty)
    return false;
  release_objects();
  state_ = State::empty;
  return true;
}

void SceneCaptureD3D12::release_objects() noexcept {
  if (snapshot_)
    snapshot_->Release();
  if (producer_fence_)
    producer_fence_->Release();
  if (device_)
    device_->Release();
  snapshot_ = nullptr;
  producer_fence_ = nullptr;
  device_ = nullptr;
  allocation_bytes_ = 0;
}
}  // namespace taxi_camera
