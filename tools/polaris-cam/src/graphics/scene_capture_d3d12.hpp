#pragma once

#include <d3d12.h>

#include <cstdint>

namespace taxi_camera {

// One reusable, caller-serialized GPU capture packet. It never changes a
// pipeline, executes an engine list or opens a process. Copy-source capture
// leaves application state unchanged; native RT-boundary capture temporarily
// transitions the source and restores its exact incoming state/layout.
//
// Production integration requirements (not inferred by this class):
// 1. Match an actual live copy callback argument to the current scene/resource
//    generation ticket. If the scene is the application's destination, require
//    an exact whole-texture copy and capture its original source instead.
// 2. For the copy path, forward the original once. Call record_copy_source on that same OPEN
//    DIRECT list outside a render pass while the exact source is copy-readable.
//    Only whole single-mip/layer textures are supported; no state guesses. The
//    separate RT methods require the stronger native barrier proof below.
// 3. Before retire_recording, establish that every submission of this recording
//    has returned, all used ONE producer queue, and this recording cannot execute
//    again. Pre-execute/pre-reset callbacks do NOT establish this.
// 4. Only use ready_resource after the producer fence completes. Submit private
//    DIRECT compositor work using COPY_DEST as the input before state, restoring it to
//    COPY_DEST, then signal a consumer fence after ALL such uses. Only recycle
//    after that fence is complete. AddRef alone supplies no synchronization.
//
// An initialized pool reuses textures/fences without per-frame allocation.
// Pending packet destruction intentionally quarantines references until process
// exit rather than freeing GPU-referenced memory. Caller should retain packets
// and finish their recording/consumer lifecycle instead. No live-camera/PFD
// integration or render-completion inference is supplied by this primitive.
class SceneCaptureD3D12 {
 public:
  static constexpr std::uint64_t MaximumBytes = 128ull * 1024 * 1024;
  enum class State { empty, idle, recorded, retiring, ready, consuming, failed };

  SceneCaptureD3D12() = default;
  ~SceneCaptureD3D12();
  SceneCaptureD3D12(const SceneCaptureD3D12&) = delete;
  SceneCaptureD3D12& operator=(const SceneCaptureD3D12&) = delete;

  HRESULT initialize(ID3D12Device* device, const D3D12_RESOURCE_DESC& source_description) noexcept;
  // Optional overwrites require the identical retained source and list. Caller
  // must still establish that this recording has never been submitted and is
  // not reserved by a concurrent submission; the manager enforces that gate.
  bool record_copy_source(ID3D12GraphicsCommandList* list,
                          ID3D12Resource* actual_live_source,
                          bool allow_same_recording_overwrite = false) noexcept;
  // Either immediately BEFORE a real, complete native legacy transition whose
  // StateBefore is RENDER_TARGET, outside a render pass. The caller verifies
  // flags NONE and subresource zero/ALL and bypasses its own barrier observer.
  // A bound RTV/draw or a lossy public barrier callback is NOT this proof.
  // Alternatively the manager may use a private queue-tail recording after
  // actual ordered Execute, with complete immutable barrier/draw effects proving
  // the resource's final legacy RT state, a retained draw/receipt source lease,
  // and serialization excluding intervening application submissions. Unknown
  // recordings, aliases, split/partial barriers invalidate that proof.
  // Temporarily transitions this sole subresource to COPY_SOURCE, copies, then
  // restores RENDER_TARGET before the application's original barrier runs.
  // Repeated calls on the same open recording/source overwrite one snapshot;
  // the last recorded image wins. Never changes an already submitted recording.
  bool record_render_target_source(ID3D12GraphicsCommandList* list,
                                   ID3D12Resource* actual_live_source,
                                   bool proven_legacy_render_target) noexcept;
  // Separate enhanced-only source path: exact native LayoutBefore RT,
  // AccessBefore RT, complete non-split barrier and no discard. Never mixes a
  // legacy source barrier into an enhanced layout; own destination is separate.
  // The same ordered queue-tail alternative requires positive ENHANCED RT
  // layout/access evidence; a legacy state cannot substitute for that model.
  bool record_render_target_source_enhanced(ID3D12GraphicsCommandList7* list,
                                            ID3D12Resource* actual_live_source,
                                            bool proven_enhanced_render_target) noexcept;
  // Queue Signal happens here, so this must be AFTER real submission and after
  // proof the recorded copy can never be replayed. A pre-execute event is too early.
  bool retire_recording(ID3D12CommandQueue* producer_queue) noexcept;
  // Same retirement proof, but permits several DIRECT producer queues only
  // when the caller ordered EVERY submission with successful queue Wait/Signal
  // dependencies. final_queue must be after every prior producer on that chain.
  bool retire_serialized_recording(ID3D12CommandQueue* final_queue) noexcept;
  // Only after successful native Reset/destruction, no in-flight CPU receipts,
  // and proof this old recording was NEVER submitted. No GPU fence is needed.
  bool discard_unsubmitted_retired() noexcept;
  bool poll_ready() noexcept;
  ID3D12Resource* ready_resource() const noexcept;
  // Establish the fence dependency after submitting every private use. No new
  // consumer is permitted after this call, and the declared input state must
  // have been restored to COPY_DEST by those commands.
  bool finish_consumption(ID3D12Fence* consumer_fence, std::uint64_t completed_after_value) noexcept;
  bool recycle() noexcept;
  // Only idle/empty packets can be released normally. False retains references.
  bool release_idle() noexcept;

  State state() const noexcept { return state_; }
  std::uint64_t recordings() const noexcept { return recordings_; }
  std::uint64_t render_target_writes() const noexcept { return render_target_writes_; }
  std::uint64_t allocation_count() const noexcept { return allocations_; }
  std::uint64_t allocation_bytes() const noexcept { return allocation_bytes_; }
  const char* error() const noexcept { return error_; }

 private:
  bool fail(const char* message) noexcept;
  bool same_device(ID3D12DeviceChild* object) const noexcept;
  bool device_ok() const noexcept;
  bool begin_render_capture(ID3D12GraphicsCommandList*, ID3D12Resource*, bool proven) noexcept;
  void release_objects() noexcept;

  State state_ = State::empty;
  ID3D12Device* device_ = nullptr;
  ID3D12Resource* snapshot_ = nullptr;
  ID3D12Resource* source_ = nullptr;
  ID3D12GraphicsCommandList* recording_list_ = nullptr;  // Identity only; caller owns its open lifetime.
  ID3D12Fence* producer_fence_ = nullptr;
  ID3D12Fence* consumer_fence_ = nullptr;
  std::uint64_t producer_value_ = 0;
  std::uint64_t consumer_value_ = 0;
  std::uint64_t recordings_ = 0;
  std::uint64_t render_target_writes_ = 0;
  std::uint64_t allocations_ = 0;
  std::uint64_t allocation_bytes_ = 0;
  D3D12_RESOURCE_DESC description_{};
  const char* error_ = "";
};

}  // namespace taxi_camera
