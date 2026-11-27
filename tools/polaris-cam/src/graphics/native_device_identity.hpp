#pragma once
#include <d3d12.h>
#include <array>

namespace taxi_camera {
// ReShade's reference-counted COM extension, not a Microsoft interface:
// https://github.com/crosire/reshade/blob/v6.8.0/source/com_utils.hpp
inline constexpr GUID UnwrappedObjectId{0x7f2c9a11, 0x3b4e, 0x4d6a, {0x81, 0x2f, 0x5e, 0x9c, 0xd3, 0x7a, 0x1b, 0x42}};
inline constexpr unsigned MaxDeviceProxyHops = 4;

// Return one owned canonical identity. Keep visited identities alive so aliases
// and cycles cannot pass through a recycled address. Only E_NOINTERFACE means
// the extension is absent; malformed proxies and long chains fail closed.
inline bool resolve_unwrapped_object(IUnknown* reported, IUnknown** native) noexcept {
  if (!native)
    return false;
  *native = nullptr;
  if (!reported)
    return false;
  struct Identities {
    std::array<IUnknown*, MaxDeviceProxyHops + 1> values{};
    ~Identities() {
      for (auto* value : values)
        if (value)
          value->Release();
    }
  } seen;
  IUnknown* current{};
  HRESULT hr = reported->QueryInterface(IID_PPV_ARGS(&current));
  if (FAILED(hr) || !current) {
    if (current)
      current->Release();
    return false;
  }
  for (unsigned depth = 0; depth <= MaxDeviceProxyHops; ++depth) {
    for (unsigned i = 0; i < depth; ++i)
      if (seen.values[i] == current) {
        current->Release();
        return false;
      }
    seen.values[depth] = current;
    IUnknown* next{};
    hr = current->QueryInterface(UnwrappedObjectId, reinterpret_cast<void**>(&next));
    if (hr == E_NOINTERFACE && !next) {
      current->AddRef();
      *native = current;
      return true;
    }
    if (FAILED(hr) || !next || depth == MaxDeviceProxyHops) {
      if (next)
        next->Release();
      return false;
    }
    current = nullptr;
    hr = next->QueryInterface(IID_PPV_ARGS(&current));
    next->Release();
    if (FAILED(hr) || !current) {
      if (current)
        current->Release();
      return false;
    }
  }
  return false;
}

inline bool resolve_native_device(IUnknown* reported, ID3D12Device** native) noexcept {
  if (!native)
    return false;
  *native = nullptr;
  IUnknown* identity{};
  if (!resolve_unwrapped_object(reported, &identity))
    return false;
  const HRESULT hr = identity->QueryInterface(IID_PPV_ARGS(native));
  identity->Release();
  if (FAILED(hr) || !*native) {
    if (*native)
      (*native)->Release();
    *native = nullptr;
    return false;
  }
  return true;
}

inline bool same_device_identity(IUnknown* reported, IUnknown* expected) noexcept {
  IUnknown *actual_identity{}, *expected_identity{};
  const bool equal = resolve_unwrapped_object(reported, &actual_identity) && resolve_unwrapped_object(expected, &expected_identity) &&
                     actual_identity == expected_identity;
  if (actual_identity)
    actual_identity->Release();
  if (expected_identity)
    expected_identity->Release();
  return equal;
}

// ReShade can return its device proxy even from a native resource's GetDevice.
// Compare resolved COM identities, never an object's address or private layout.
inline bool same_native_device(ID3D12DeviceChild* child, ID3D12Device* expected_native) noexcept {
  if (!child || !expected_native)
    return false;
  ID3D12Device* reported{};
  const HRESULT hr = child->GetDevice(IID_PPV_ARGS(&reported));
  const bool equal = SUCCEEDED(hr) && reported && same_device_identity(reported, expected_native);
  if (reported)
    reported->Release();
  return equal;
}
}  // namespace taxi_camera
