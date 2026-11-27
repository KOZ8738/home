// Polaris Cam: one camera's broadcast picture.
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built into.
#pragma once

#include <d3d12.h>
#include <array>
#include <cstdint>
#include "../shared/broadcast_link.hpp"

namespace taxi_camera {
// Turns a completed camera snapshot into a picture another program can show:
// the simulator's exposure and tone curve for an HDR view (the same conversion
// as CameraCompositorD3D12's display_rgb, without its bloom), written into one
// of three B8G8R8A8_UNORM textures that are shared by name with the Polaris
// Cam window (polaris_cam::texture_name).
//
// Like SceneFrameOutput it records on its own direct queue, and the caller
// brackets submit with the capture manager's begin/end_private_submission and
// then hands the snapshot back with finish_consumption. Nothing here waits for
// the GPU. All calls are serialized by the caller (scene_runtime's mutex).
class BroadcastOutput {
 public:
  static constexpr unsigned Slots = polaris_cam::Slots;
  static constexpr DXGI_FORMAT Format = DXGI_FORMAT_B8G8R8A8_UNORM;
  static constexpr UINT ToneTexels = 64;
  static constexpr std::size_t ToneTableTexels = std::size_t{ToneTexels} * ToneTexels * ToneTexels;

  BroadcastOutput() = default;
  BroadcastOutput(const BroadcastOutput&) = delete;
  BroadcastOutput& operator=(const BroadcastOutput&) = delete;
  // GPU objects are kept until the process ends, as SceneFrameOutput's are.
  ~BroadcastOutput() = default;

  // Compiles the two shaders once per process (optional; initialize does it too).
  static bool prepare_shaders() noexcept;
  bool initialize(ID3D12Device* device) noexcept;
  bool initialized() const noexcept { return pipeline_ != nullptr && !failed_; }
  bool failed() const noexcept { return failed_; }
  // Back to a new output, so that initialize can try again after a failure:
  // every GPU object and the textures are let go. Refused (false) while a
  // recording is prepared or submitted work may still be executing, which
  // stays so after a failed completion signal.
  bool reset() noexcept;

  // The three shared textures at this picture size, named for (pid,
  // generation, feed). Only while idle with nothing prepared; the previous
  // textures are let go (a window that still has them open keeps them alive).
  bool resize(UINT width, UINT height, std::uint32_t pid, std::uint32_t generation, unsigned feed) noexcept;
  // Lets the textures go, e.g. when the broadcast is turned off. Only while idle.
  bool release_textures() noexcept;
  UINT width() const noexcept { return width_; }
  UINT height() const noexcept { return height_; }
  std::uint32_t generation() const noexcept { return generation_; }
  ID3D12Resource* texture(unsigned slot) const noexcept { return slot < Slots ? textures_[slot] : nullptr; }

  // CameraCompositorD3D12::set_display_exposure / set_tone_curve. A table is
  // taken only while idle (false otherwise: offer it again).
  bool set_display_exposure(float ev) noexcept;
  bool set_tone_curve(float exposure, const std::uint32_t* table) noexcept;
  bool tone_curve_active() const noexcept { return tone_exposure_ > 0 && (tone_ready_ || tone_pending_); }

  // Records source -> textures[slot]. The source is a completed snapshot in
  // COPY_DEST, at the picture's width and trim rows shorter (the picture
  // repeats its first and last row to make up for them); it is returned to
  // COPY_DEST. format is the typed view of the source.
  bool prepare(ID3D12Resource* source, DXGI_FORMAT format, unsigned slot) noexcept;
  bool prepared() const noexcept { return prepared_; }
  bool discard_prepared() noexcept;
  bool submit() noexcept;
  // Nothing submitted is still executing.
  bool idle() const noexcept;
  ID3D12CommandQueue* queue() const noexcept { return queue_; }
  std::uint64_t submissions() const noexcept { return submitted_; }
  const char* error() const noexcept { return error_; }

 private:
  bool fail(const char* error) noexcept;
  bool create_pipeline() noexcept;
  bool create_tone_table() noexcept;
  void close_textures() noexcept;

  ID3D12Device* device_ = nullptr;
  ID3D12CommandQueue* queue_ = nullptr;
  ID3D12CommandAllocator* allocator_ = nullptr;
  ID3D12GraphicsCommandList* list_ = nullptr;
  ID3D12Fence* fence_ = nullptr;
  ID3D12RootSignature* root_signature_ = nullptr;
  ID3D12PipelineState* pipeline_ = nullptr;
  ID3D12DescriptorHeap* srv_heap_ = nullptr;
  ID3D12DescriptorHeap* rtv_heap_ = nullptr;
  ID3D12Resource* tone_table_ = nullptr;
  ID3D12Resource* tone_upload_ = nullptr;
  unsigned char* tone_mapped_ = nullptr;
  std::array<ID3D12Resource*, Slots> textures_{};
  std::array<HANDLE, Slots> handles_{};
  UINT width_ = 0, height_ = 0;
  std::uint32_t generation_ = 0;
  float exposure_ev_ = -8.8f;
  float tone_exposure_ = 0;
  bool tone_pending_ = false, tone_ready_ = false, tone_recorded_ = false, tone_was_ready_ = false;
  std::uint64_t submitted_ = 0;
  bool prepared_ = false, failed_ = false;
  const char* error_ = "";
};
}  // namespace taxi_camera
