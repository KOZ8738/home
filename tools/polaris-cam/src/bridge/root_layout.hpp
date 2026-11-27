#pragma once
#include "../graphics/pfd_stamp_state.hpp"
namespace taxi_camera::standalone {
inline PfdRootLayout native_root_layout(const void* bytes, SIZE_T size) noexcept {
  PfdRootLayout result;
  if (!bytes || !size || size > 1024 * 1024)
    return result;
  ID3D12VersionedRootSignatureDeserializer* decoder{};
  if (FAILED(D3D12CreateVersionedRootSignatureDeserializer(bytes, size, IID_PPV_ARGS(&decoder))))
    return result;
  const D3D12_VERSIONED_ROOT_SIGNATURE_DESC* description{};
  if (SUCCEEDED(decoder->GetRootSignatureDescAtVersion(D3D_ROOT_SIGNATURE_VERSION_1_0, &description)) && description) {
    const auto& desc = description->Desc_1_0;
    if (desc.NumParameters <= 64 && (!desc.NumParameters || desc.pParameters)) {
      UINT cost = 0;
      result.count = desc.NumParameters;
      result.valid = true;
      for (UINT i = 0; i < result.count; ++i) {
        const auto& p = desc.pParameters[i];
        auto& out = result.parameters[i];
        switch (p.ParameterType) {
          case D3D12_ROOT_PARAMETER_TYPE_32BIT_CONSTANTS:
            out = {PfdRootKind::constants, p.Constants.Num32BitValues};
            if (!out.count || out.count > 64)
              result.valid = false;
            cost += out.count;
            break;
          case D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE:
            out = {PfdRootKind::table, 1};
            ++cost;
            if (!p.DescriptorTable.NumDescriptorRanges || !p.DescriptorTable.pDescriptorRanges)
              result.valid = false;
            break;
          case D3D12_ROOT_PARAMETER_TYPE_CBV:
            out = {PfdRootKind::cbv, 1};
            cost += 2;
            break;
          case D3D12_ROOT_PARAMETER_TYPE_SRV:
            out = {PfdRootKind::srv, 1};
            cost += 2;
            break;
          case D3D12_ROOT_PARAMETER_TYPE_UAV:
            out = {PfdRootKind::uav, 1};
            cost += 2;
            break;
          default:
            result.valid = false;
        }
        if (!result.valid || cost > 64) {
          result = {};
          break;
        }
      }
    }
  }
  decoder->Release();
  return result;
}
}  // namespace taxi_camera::standalone
