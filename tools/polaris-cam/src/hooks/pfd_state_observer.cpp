#include "pfd_state_observer.hpp"
#include <array>
#include <atomic>
#include <limits>
#include <unordered_map>
#include "../shared/hook_timing.hpp"
#ifdef TAXI_PFD_STATE_OBSERVER_VALIDATION
extern "C" BOOL taxi_pfd_test_virtual_protect(void*, SIZE_T, DWORD, PDWORD) noexcept;
#endif

namespace taxi_camera::engine_hook::pfd_state {
namespace {
using Reset = HRESULT(STDMETHODCALLTYPE*)(ID3D12GraphicsCommandList*, ID3D12CommandAllocator*, ID3D12PipelineState*);
using Heaps = void(STDMETHODCALLTYPE*)(ID3D12GraphicsCommandList*, UINT, ID3D12DescriptorHeap* const*);
using Cbv = void(STDMETHODCALLTYPE*)(ID3D12GraphicsCommandList*, UINT, D3D12_GPU_VIRTUAL_ADDRESS);
using Root = void(STDMETHODCALLTYPE*)(ID3D12GraphicsCommandList*, ID3D12RootSignature*);
using Table = void(STDMETHODCALLTYPE*)(ID3D12GraphicsCommandList*, UINT, D3D12_GPU_DESCRIPTOR_HANDLE);
struct Slot {
  unsigned index;
  void** address = nullptr;
  void* forward = nullptr;
  void* wrapper = nullptr;
  bool installed = false;
};
SRWLOCK registry_lock = SRWLOCK_INIT;
SRWLOCK control_lock = SRWLOCK_INIT;
// Static allocation intentionally survives explicit remove: a thread may have
// already fetched a wrapper address. No hot-unload or context disposal contract.
std::unordered_map<ID3D12GraphicsCommandList*, std::uint64_t> identities;
Callbacks callbacks;
std::atomic<bool> enabled{false};
bool configured = false, removed = false;
thread_local bool inside = false;
void* saved_table = nullptr;
void** pending_slot = nullptr;
DWORD pending_access = 0;
std::atomic<Reset> original_reset{nullptr};
std::atomic<Heaps> original_heaps{nullptr};
std::atomic<Cbv> original_cbv{nullptr};
std::atomic<Root> original_root{nullptr};
std::atomic<Table> original_table{nullptr};
std::array<Slot, 5> slots{{{10}, {28}, {38}, {30}, {32}}};
struct Lock {
  SRWLOCK& value;
  bool exclusive;
  Lock(SRWLOCK& v, bool write) : value(v), exclusive(write) {
    if (write)
      AcquireSRWLockExclusive(&v);
    else
      AcquireSRWLockShared(&v);
  }
  ~Lock() {
    if (exclusive)
      ReleaseSRWLockExclusive(&value);
    else
      ReleaseSRWLockShared(&value);
  }
};
std::uint64_t lookup(ID3D12GraphicsCommandList* list) noexcept {
  if (!enabled.load(std::memory_order_acquire))
    return 0;
  const Lock lock(registry_lock, false);
  const auto found = identities.find(list);
  return found == identities.end() ? 0 : found->second;
}
struct Guard {
  Guard() { inside = true; }
  ~Guard() { inside = false; }
};
HRESULT STDMETHODCALLTYPE reset(ID3D12GraphicsCommandList* list, ID3D12CommandAllocator* allocator, ID3D12PipelineState* pso) noexcept {
  const auto original = original_reset.load(std::memory_order_acquire);
  if (inside)
    return original(list, allocator, pso);
  const Guard guard;
  const hook_timing::Scope timing(hook_timing::reset);
  const auto generation = lookup(list);
  const HRESULT hr = hook_timing::forward(original, list, allocator, pso);
  if (generation && lookup(list) == generation)
    callbacks.reset_completed(callbacks.context, list, generation, hr, pso);
  return hr;
}
void STDMETHODCALLTYPE heaps(ID3D12GraphicsCommandList* list, UINT count, ID3D12DescriptorHeap* const* values) noexcept {
  const auto original = original_heaps.load(std::memory_order_acquire);
  if (inside) {
    original(list, count, values);
    return;
  }
  const Guard guard;
  const hook_timing::Scope timing(hook_timing::state);
  const auto generation = lookup(list);
  hook_timing::forward(original, list, count, values);
  if (generation && lookup(list) == generation)
    callbacks.heaps_changed(callbacks.context, list, generation, count, values);
}
void STDMETHODCALLTYPE cbv(ID3D12GraphicsCommandList* list, UINT index, D3D12_GPU_VIRTUAL_ADDRESS address) noexcept {
  const auto original = original_cbv.load(std::memory_order_acquire);
  if (inside) {
    original(list, index, address);
    return;
  }
  const Guard guard;
  const hook_timing::Scope timing(hook_timing::state);
  const auto generation = lookup(list);
  hook_timing::forward(original, list, index, address);
  if (generation && lookup(list) == generation)
    callbacks.graphics_cbv(callbacks.context, list, generation, index, address);
}
void STDMETHODCALLTYPE root(ID3D12GraphicsCommandList* list, ID3D12RootSignature* signature) noexcept {
  const auto original = original_root.load(std::memory_order_acquire);
  if (inside) {
    original(list, signature);
    return;
  }
  const Guard guard;
  const hook_timing::Scope timing(hook_timing::state);
  const auto generation = lookup(list);
  hook_timing::forward(original, list, signature);
  if (generation && callbacks.graphics_root && lookup(list) == generation)
    callbacks.graphics_root(callbacks.context, list, generation, signature);
}
void STDMETHODCALLTYPE graphics_table(ID3D12GraphicsCommandList* list, UINT index, D3D12_GPU_DESCRIPTOR_HANDLE handle) noexcept {
  const auto original = original_table.load(std::memory_order_acquire);
  if (inside) {
    original(list, index, handle);
    return;
  }
  const Guard guard;
  const hook_timing::Scope timing(hook_timing::state);
  const auto generation = lookup(list);
  hook_timing::forward(original, list, index, handle);
  if (generation && callbacks.graphics_table && lookup(list) == generation)
    callbacks.graphics_table(callbacks.context, list, generation, index, handle);
}
bool region(const void* address, std::size_t size, MEMORY_BASIC_INFORMATION& info) noexcept {
  if (!address || VirtualQuery(address, &info, sizeof(info)) != sizeof(info) || info.State != MEM_COMMIT ||
      (info.Protect & (PAGE_GUARD | PAGE_NOACCESS)))
    return false;
  const auto access = info.Protect & 255;
  if (access != PAGE_READONLY && access != PAGE_READWRITE && access != PAGE_WRITECOPY && access != PAGE_EXECUTE_READ &&
      access != PAGE_EXECUTE_READWRITE && access != PAGE_EXECUTE_WRITECOPY)
    return false;
  const auto base = reinterpret_cast<std::uintptr_t>(info.BaseAddress), point = reinterpret_cast<std::uintptr_t>(address);
  return info.RegionSize <= UINTPTR_MAX - base && point >= base && point <= base + info.RegionSize &&
         size <= base + info.RegionSize - point;
}
bool pointer(const void* address, void*& value) noexcept {
  MEMORY_BASIC_INFORMATION info{};
  SIZE_T bytes = 0;
  return reinterpret_cast<std::uintptr_t>(address) % 8 == 0 && region(address, 8, info) &&
         ReadProcessMemory(GetCurrentProcess(), address, &value, 8, &bytes) && bytes == 8;
}
bool data_slot(void** address) noexcept {
  MEMORY_BASIC_INFORMATION info{};
  if (!region(address, 8, info))
    return false;
  const auto access = info.Protect & 255;
  return access == PAGE_READONLY || access == PAGE_READWRITE || access == PAGE_WRITECOPY;
}
bool pin(void* code) noexcept {
  MEMORY_BASIC_INFORMATION info{};
  HMODULE module = nullptr;
  if (!region(code, 1, info) || info.Type != MEM_IMAGE)
    return false;
  const auto access = info.Protect & 255;
  return (access == PAGE_EXECUTE_READ || access == PAGE_EXECUTE_READWRITE || access == PAGE_EXECUTE_WRITECOPY) &&
         GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_PIN | GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, reinterpret_cast<LPCWSTR>(code),
                            &module);
}
BOOL protect(void* address, SIZE_T bytes, DWORD access, DWORD* previous) noexcept {
#ifdef TAXI_PFD_STATE_OBSERVER_VALIDATION
  return taxi_pfd_test_virtual_protect(address, bytes, access, previous);
#else
  return VirtualProtect(address, bytes, access, previous);
#endif
}
bool repair(DWORD& error) noexcept {
  if (!pending_slot)
    return true;
  DWORD discarded = 0;
  if (!protect(pending_slot, 8, pending_access, &discarded)) {
    error = GetLastError();
    return false;
  }
  pending_slot = nullptr;
  pending_access = 0;
  return true;
}
Result result(const char* status, DWORD error = 0, bool ready = false) noexcept {
  return {ready, pending_slot == nullptr, error, status};
}
bool exchange(Slot& slot, bool install, DWORD& error) noexcept {
  DWORD prior = 0;
  if (!data_slot(slot.address) || !protect(slot.address, 8, PAGE_READWRITE, &prior)) {
    error = GetLastError();
    return false;
  }
  pending_slot = slot.address;
  pending_access = prior;
  void* expected = install ? slot.forward : slot.wrapper;
  void* replacement = install ? slot.wrapper : slot.forward;
  bool changed = InterlockedCompareExchangePointer(reinterpret_cast<void* volatile*>(slot.address), replacement, expected) == expected;
  if (changed)
    slot.installed = install;
  else
    error = ERROR_INVALID_STATE;
  if (!repair(error))
    return false;
  return changed;
}
bool same_callbacks(const Callbacks& a, const Callbacks& b) noexcept {
  return a.context == b.context && a.heaps_changed == b.heaps_changed && a.graphics_cbv == b.graphics_cbv &&
         a.reset_completed == b.reset_completed && a.graphics_root == b.graphics_root && a.graphics_table == b.graphics_table;
}
}  // namespace

Result register_list(ID3D12GraphicsCommandList* list, std::uint64_t generation, const Callbacks& supplied) noexcept {
  if (inside)
    return result("reentrant_registration");
  const Lock control(control_lock, true);
  DWORD error = 0;
  if (!repair(error))
    return result("protection_restore_failed", error);
  if (removed || !list || !generation || !supplied.heaps_changed || !supplied.graphics_cbv || !supplied.reset_completed)
    return result("invalid_registration");
  if (configured && !same_callbacks(callbacks, supplied))
    return result("callback_mismatch");
  void* table = nullptr;
  if (!pointer(list, table) || !table || reinterpret_cast<std::uintptr_t>(table) > UINTPTR_MAX - 39 * 8)
    return result("invalid_object");
  if (configured && table != saved_table)
    return result("different_vtable");
  if (!configured) {
    const std::array<void*, 5> wrappers{reinterpret_cast<void*>(&reset), reinterpret_cast<void*>(&heaps), reinterpret_cast<void*>(&cbv),
                                        reinterpret_cast<void*>(&root), reinterpret_cast<void*>(&graphics_table)};
    for (unsigned n = 0; n < slots.size(); ++n) {
      auto& slot = slots[n];
      slot.address = static_cast<void**>(table) + slot.index;
      slot.wrapper = wrappers[n];
      if (!data_slot(slot.address) || !pointer(slot.address, slot.forward) || !slot.forward || slot.forward == slot.wrapper ||
          !pin(slot.forward) || !pin(slot.wrapper))
        return result("invalid_slot_or_pin", GetLastError());
    }
    callbacks = supplied;
    saved_table = table;
    original_reset.store(reinterpret_cast<Reset>(slots[0].forward), std::memory_order_release);
    original_heaps.store(reinterpret_cast<Heaps>(slots[1].forward), std::memory_order_release);
    original_cbv.store(reinterpret_cast<Cbv>(slots[2].forward), std::memory_order_release);
    original_root.store(reinterpret_cast<Root>(slots[3].forward), std::memory_order_release);
    original_table.store(reinterpret_cast<Table>(slots[4].forward), std::memory_order_release);
    configured = true;
  }
  for (auto& slot : slots) {
    void* current = nullptr;
    if (!pointer(slot.address, current) || current != (slot.installed ? slot.wrapper : slot.forward)) {
      enabled.store(false);
      return result("slot_changed");
    }
    if (!slot.installed && !exchange(slot, true, error)) {
      enabled.store(false);
      return result("installation_incomplete", error);
    }
  }
  {
    const Lock registry(registry_lock, true);
    auto found = identities.find(list);
    if (found != identities.end() && found->second != generation)
      return result("identity_not_retired");
    if (found == identities.end()) {
      if (identities.size() >= 8192)
        return result("identity_limit");
      try {
        identities.emplace(list, generation);
      } catch (...) {
        return result("allocation_failed");
      }
    }
  }
  enabled.store(true, std::memory_order_release);
  return result("registered", 0, true);
}
void unregister_list(ID3D12GraphicsCommandList* list, std::uint64_t generation) noexcept {
  const Lock registry(registry_lock, true);
  const auto found = identities.find(list);
  if (found != identities.end() && found->second == generation)
    identities.erase(found);
}
Result remove() noexcept {
  if (inside)
    return result("reentrant_removal");
  const Lock control(control_lock, true);
  enabled.store(false, std::memory_order_release);
  removed = true;
  DWORD error = 0;
  if (!repair(error))
    return result("protection_restore_failed", error);
  for (auto& slot : slots)
    if (slot.installed && !exchange(slot, false, error))
      return result("removal_incomplete", error);
  {
    const Lock registry(registry_lock, true);
    identities.clear();
  }
  return result("removed");
}
Result repair_protection() noexcept {
  const Lock control(control_lock, true);
  DWORD error = 0;
  return repair(error) ? result("protection_restored") : result("protection_restore_failed", error);
}
ScopedBypass::ScopedBypass() noexcept : previous_(inside) {
  inside = true;
}
ScopedBypass::~ScopedBypass() {
  inside = previous_;
}
bool operational() noexcept {
  return enabled.load(std::memory_order_acquire);
}
}  // namespace taxi_camera::engine_hook::pfd_state
