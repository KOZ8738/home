#pragma once

#include <d3d12.h>
#include <array>
#include <cstdint>
#include <cstring>
#include <limits>
#include "native_device_identity.hpp"

namespace taxi_camera {
struct GpuTimingStatistics {
  std::uint64_t samples = 0, rejected = 0;
  double total_ms = 0, maximum_ms = 0;
  void merge(const GpuTimingStatistics& other) noexcept {
    samples += other.samples;
    rejected += other.rejected;
    total_ms += other.total_ms;
    if (other.maximum_ms > maximum_ms)
      maximum_ms = other.maximum_ms;
  }
};

// Optional diagnostics for ONE owned, non-replayable recording at a time.
// Caller serializes all access and supplies its existing successful submission
// fence. Never insert this into application lists: replay invalidates query-slot
// ownership. No waits, per-frame allocations or application state changes.
// Like the output/capture owners, outstanding objects survive process teardown
// rather than releasing memory that may still be referenced by the GPU.
template <std::size_t Spans>
class OwnedGpuTiming {
 public:
  static_assert(Spans > 0 && Spans <= 8);
  OwnedGpuTiming() = default;
  ~OwnedGpuTiming() = default;
  OwnedGpuTiming(const OwnedGpuTiming&) = delete;
  OwnedGpuTiming& operator=(const OwnedGpuTiming&) = delete;

  bool begin(ID3D12Device* device, ID3D12CommandQueue* queue, ID3D12GraphicsCommandList* list) noexcept {
    poll();
    if (state_ != State::idle || !device || !queue || !list || queue->GetDesc().Type != D3D12_COMMAND_LIST_TYPE_DIRECT ||
        list->GetType() != D3D12_COMMAND_LIST_TYPE_DIRECT || !same_native_device(queue, device) || !same_native_device(list, device))
      return false;
    UINT64 frequency = 0;
    if (FAILED(queue->GetTimestampFrequency(&frequency)) || !frequency || !initialize(device)) {
      ++statistics_[0].rejected;
      return false;
    }
    frequency_ = frequency;
    list_ = list;
    started_ = ended_ = 0;
    state_ = State::recording;
    return true;
  }
  void start(std::size_t span) noexcept {
    if (state_ != State::recording || span >= Spans || (started_ & (1u << span)))
      return;
    list_->EndQuery(heap_, D3D12_QUERY_TYPE_TIMESTAMP, static_cast<UINT>(2 * span));
    started_ |= 1u << span;
  }
  void end(std::size_t span) noexcept {
    if (state_ != State::recording || span >= Spans || !(started_ & (1u << span)) || (ended_ & (1u << span)))
      return;
    list_->EndQuery(heap_, D3D12_QUERY_TYPE_TIMESTAMP, static_cast<UINT>(2 * span + 1));
    ended_ |= 1u << span;
  }
  void resolve() noexcept {
    if (state_ != State::recording)
      return;
    // Resolve only initialized pairs; incomplete spans are never read.
    for (std::size_t span = 0; span < Spans; ++span)
      if (ended_ & (1u << span))
        list_->ResolveQueryData(heap_, D3D12_QUERY_TYPE_TIMESTAMP, static_cast<UINT>(2 * span), 2, readback_, 2 * span * sizeof(UINT64));
    list_ = nullptr;
    state_ = State::prepared;
  }
  // Call only AFTER the existing completion Signal succeeds.
  void submitted(ID3D12Fence* fence, std::uint64_t value) noexcept {
    if (state_ != State::prepared)
      return;
    if (!fence || !value || value == std::numeric_limits<std::uint64_t>::max()) {
      abandon();
      return;
    }
    fence->AddRef();
    fence_ = fence;
    value_ = value;
    state_ = State::pending;
  }
  // Only after successful Reset/discard of a NEVER submitted owned recording.
  void discard_unsubmitted() noexcept {
    if (state_ == State::recording || state_ == State::prepared) {
      list_ = nullptr;
      state_ = State::idle;
    }
  }
  void abandon() noexcept {
    if (state_ != State::idle)
      state_ = State::abandoned;
  }
  bool poll() noexcept {
    if (state_ != State::pending)
      return state_ == State::idle;
    const auto completed = fence_->GetCompletedValue();
    if (completed == std::numeric_limits<std::uint64_t>::max()) {
      abandon();
      return false;
    }
    if (completed < value_)
      return false;
    std::array<UINT64, Spans * 2> ticks{};
    const D3D12_RANGE range{0, sizeof(ticks)};
    void* mapped = nullptr;
    const bool readable = SUCCEEDED(readback_->Map(0, &range, &mapped)) && mapped;
    if (readable) {
      std::memcpy(ticks.data(), mapped, sizeof(ticks));
      const D3D12_RANGE written{0, 0};
      readback_->Unmap(0, &written);
    }
    for (std::size_t span = 0; span < Spans; ++span) {
      if (!(ended_ & (1u << span)))
        continue;
      auto& result = statistics_[span];
      if (!readable || ticks[2 * span + 1] < ticks[2 * span]) {
        ++result.rejected;
        continue;
      }
      const double ms = static_cast<double>(ticks[2 * span + 1] - ticks[2 * span]) * 1000.0 / static_cast<double>(frequency_);
      ++result.samples;
      result.total_ms += ms;
      if (ms > result.maximum_ms)
        result.maximum_ms = ms;
    }
    fence_->Release();
    fence_ = nullptr;
    state_ = State::idle;
    return true;
  }
  const std::array<GpuTimingStatistics, Spans>& statistics() const noexcept { return statistics_; }

 private:
  enum class State { idle, recording, prepared, pending, abandoned };
  bool initialize(ID3D12Device* device) noexcept {
    if (device_ == device && heap_ && readback_)
      return true;
    // begin() admits this only after prior fence completion or never-submitted
    // Reset. Device replacement cannot leave an executable query recording.
    if (heap_)
      heap_->Release();
    if (readback_)
      readback_->Release();
    if (device_)
      device_->Release();
    heap_ = nullptr;
    readback_ = nullptr;
    device_ = nullptr;
    D3D12_QUERY_HEAP_DESC queries{};
    queries.Type = D3D12_QUERY_HEAP_TYPE_TIMESTAMP;
    queries.Count = static_cast<UINT>(Spans * 2);
    if (FAILED(device->CreateQueryHeap(&queries, IID_PPV_ARGS(&heap_))))
      return false;
    D3D12_HEAP_PROPERTIES properties{};
    properties.Type = D3D12_HEAP_TYPE_READBACK;
    properties.CreationNodeMask = properties.VisibleNodeMask = 1;
    D3D12_RESOURCE_DESC buffer{};
    buffer.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    buffer.Width = Spans * 2 * sizeof(UINT64);
    buffer.Height = buffer.DepthOrArraySize = buffer.MipLevels = 1;
    buffer.SampleDesc.Count = 1;
    buffer.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
    if (FAILED(device->CreateCommittedResource(&properties, D3D12_HEAP_FLAG_NONE, &buffer, D3D12_RESOURCE_STATE_COPY_DEST, nullptr,
                                               IID_PPV_ARGS(&readback_)))) {
      heap_->Release();
      heap_ = nullptr;
      return false;
    }
    device->AddRef();
    device_ = device;
    return true;
  }
  State state_ = State::idle;
  ID3D12Device* device_ = nullptr;
  ID3D12QueryHeap* heap_ = nullptr;
  ID3D12Resource* readback_ = nullptr;
  ID3D12GraphicsCommandList* list_ = nullptr;
  ID3D12Fence* fence_ = nullptr;
  std::uint64_t frequency_ = 0, value_ = 0;
  unsigned started_ = 0, ended_ = 0;
  std::array<GpuTimingStatistics, Spans> statistics_{};
};
}  // namespace taxi_camera
