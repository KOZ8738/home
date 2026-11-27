#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <d3d12.h>
#include <cstdint>

namespace taxi_camera::engine_hook::pfd_state {
struct Callbacks {
  void* context = nullptr;
  void (*heaps_changed)(void*, ID3D12GraphicsCommandList*, std::uint64_t object_generation, UINT, ID3D12DescriptorHeap* const*) noexcept =
      nullptr;
  void (*graphics_cbv)(void*, ID3D12GraphicsCommandList*, std::uint64_t object_generation, UINT, D3D12_GPU_VIRTUAL_ADDRESS) noexcept =
      nullptr;
  void (*reset_completed)(void*, ID3D12GraphicsCommandList*, std::uint64_t object_generation, HRESULT, ID3D12PipelineState*) noexcept =
      nullptr;
  void (*graphics_root)(void*, ID3D12GraphicsCommandList*, std::uint64_t object_generation, ID3D12RootSignature*) noexcept = nullptr;
  void (*graphics_table)(void*, ID3D12GraphicsCommandList*, std::uint64_t object_generation, UINT, D3D12_GPU_DESCRIPTOR_HANDLE) noexcept =
      nullptr;
};
struct Result {
  bool ready = false;
  bool protection_restored = true;
  DWORD error = ERROR_SUCCESS;
  const char* status = "not_installed";
};
// Exactly five documented native COM slots: Reset10, SetDescriptorHeaps28,
// SetGraphicsRootSignature30, SetGraphicsRootDescriptorTable32 and
// SetGraphicsRootConstantBufferView38. No vtable copies or instruction changes.
// The explicit object must be a current native interface supplied by the graphics bridge.
// One shared vtable and at most8192 simultaneously registered object identities.
// No AddRef, object retention, memory scan or arbitrary address API.
//
// The immutable callback context AND code must live until process exit. Both
// wrapper and original modules are pinned. Callbacks run after exact original
// forwarding, without registry locks. They must reject stale object generations
// against their own live registry before touching per-list context. Unregister
// invalidates identity but does not join a callback already in progress. This
// permits destruction/reuse without retaining thousands of native COM objects.
// A Reset callback reports HRESULT; only success permits recording retirement.
// Root signature/table notifications are optional for callers that do not track
// them; a null root pointer and every table index/handle are forwarded unchanged.
// It is distinct from the object's init/destroy incarnation generation.
// Notifications never prove GPU completion or permission to recycle resources.
Result register_list(ID3D12GraphicsCommandList*, std::uint64_t object_generation, const Callbacks&) noexcept;
void unregister_list(ID3D12GraphicsCommandList*, std::uint64_t object_generation) noexcept;
Result remove() noexcept;
Result repair_protection() noexcept;
bool operational() noexcept;
// Around owned native replay only: prevents restoration notifications from
// re-entering adapter locks. Never use around original application commands.
class ScopedBypass {
 public:
  ScopedBypass() noexcept;
  ~ScopedBypass();
  ScopedBypass(const ScopedBypass&) = delete;
  ScopedBypass& operator=(const ScopedBypass&) = delete;

 private:
  bool previous_;
};
}  // namespace taxi_camera::engine_hook::pfd_state
