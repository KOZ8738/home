// Polaris Cam: one camera's broadcast picture.
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built into.
#include "broadcast_output.hpp"

#include <d3dcompiler.h>
#include <cmath>
#include <cstring>
#include <limits>

namespace taxi_camera {
namespace {
// The HDR conversion is CameraCompositorD3D12's (its ToneShader notes): the
// simulator's tonemapper as read from MSFS 1.8.16.0, or Taxi Cam's exposure
// with Reinhard compression while no tone curve applies. Mode 0 copies a
// display-referred 8-bit view, 1 is the fallback, 2 the simulator's curve.
// The picture is Trim rows taller above and below than the view: those rows
// repeat the view's first and last row.
constexpr char Shader[] = R"(
cbuffer Display : register(b0) { uint Mode; float Exposure; int Trim; int LastRow; };
Texture2D<float4> Source : register(t0);
Texture3D<float4> ToneCurve : register(t1);
SamplerState LinearClamp : register(s0);
float srgb_code(float value) {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * pow(max(value, 0), 1.0 / 2.4) - 0.055;
}
float hdr_channel(float value) {
  if (!isfinite(value)) return value > 0 ? 1 : 0;
  float exposed = max(value, 0) * Exposure;
  return srgb_code(exposed / (1 + exposed));
}
float3 simulator_rgb(float3 rgb) {
  float3 x = max(rgb, 0) * Exposure;
  float3 u = log2(1 + x) / 13.4501 * (63.0 / 64) + 0.5 / 64;
  float3 y = (exp2(ToneCurve.SampleLevel(LinearClamp, u, 0).rgb * 13.4501) - 1) / 11190.6 * (1e4 / 300);
  y = y < 0.22 ? y : 0.22 + 0.78 * (1 - exp2(-1.84961 * (y - 0.22)));
  y = saturate(y);
  return float3(srgb_code(y.r), srgb_code(y.g), srgb_code(y.b));
}
float4 vs_main(uint id : SV_VertexID) : SV_Position {
  float2 uv = float2((id << 1) & 2, id & 2);
  return float4(uv.x * 2 - 1, 1 - uv.y * 2, 0, 1);
}
float4 ps_main(float4 position : SV_Position) : SV_Target {
  int2 texel = int2(position.xy);
  texel.y = clamp(texel.y - Trim, 0, LastRow);
  float3 rgb = Source.Load(int3(texel, 0)).rgb;
  if (Mode == 0) return float4(saturate(rgb), 1);
  if (Mode == 2 && all(isfinite(rgb))) return float4(simulator_rgb(rgb), 1);
  return float4(hdr_channel(rgb.r), hdr_channel(rgb.g), hdr_channel(rgb.b), 1);
}
// Anti-aliasing, the second pass over the picture ps_main made (Source):
// FXAA, after the quality version of Timothy Lottes' fast approximate
// anti-aliasing. Edges are found by the contrast in luma (gamma-encoded, as
// the picture is); a pixel on one is resampled across it, the more the nearer
// it is to where the edge ends, and a pixel that stands out from all of its
// neighbours (a thin line, a lone dot) is blended a little as well.
static const float EdgeThreshold = 0.125, EdgeThresholdMinimum = 0.0312, SubpixelBlend = 0.75;
static const float SearchSteps[11] = {1, 1, 1, 1, 1.5, 2, 2, 2, 2, 4, 8};
float luma(float3 rgb) {
  return dot(rgb, float3(0.299, 0.587, 0.114));
}
float luma_at(float2 uv) {
  return luma(Source.SampleLevel(LinearClamp, uv, 0).rgb);
}
float4 ps_fxaa(float4 position : SV_Position) : SV_Target {
  uint width = 1, height = 1;
  Source.GetDimensions(width, height);
  float2 texel = float2(1.0 / (float)width, 1.0 / (float)height);
  float2 uv = position.xy * texel;
  float3 centre = Source.SampleLevel(LinearClamp, uv, 0).rgb;
  float m = luma(centre);
  float n = luma_at(uv + float2(0, -texel.y)), s = luma_at(uv + float2(0, texel.y));
  float w = luma_at(uv + float2(-texel.x, 0)), e = luma_at(uv + float2(texel.x, 0));
  float lowest = min(m, min(min(n, s), min(w, e))), highest = max(m, max(max(n, s), max(w, e)));
  float range = highest - lowest;
  if (range < max(EdgeThresholdMinimum, highest * EdgeThreshold))
    return float4(centre, 1);
  float nw = luma_at(uv + float2(-texel.x, -texel.y)), ne = luma_at(uv + float2(texel.x, -texel.y));
  float sw = luma_at(uv + float2(-texel.x, texel.y)), se = luma_at(uv + float2(texel.x, texel.y));
  float neighbourhood = (2 * (n + s + w + e) + (nw + ne + sw + se)) / 12;
  float contrast = saturate(abs(neighbourhood - m) / range);
  float blend = (3 - 2 * contrast) * contrast * contrast;
  float subpixel = blend * blend * SubpixelBlend;
  // A horizontal edge changes most from row to row, a vertical one from column to column.
  float across_rows = abs(nw + sw - 2 * w) + 2 * abs(n + s - 2 * m) + abs(ne + se - 2 * e);
  float across_columns = abs(nw + ne - 2 * n) + 2 * abs(w + e - 2 * m) + abs(sw + se - 2 * s);
  bool horizontal = across_rows >= across_columns;
  // Across the edge: towards the neighbour that differs most.
  float before = horizontal ? n : w, after = horizontal ? s : e;
  float gradient_before = abs(before - m), gradient_after = abs(after - m);
  float across = horizontal ? texel.y : texel.x;
  float side = 0.5 * (after + m);
  if (gradient_before >= gradient_after) {
    across = -across;
    side = 0.5 * (before + m);
  }
  float gradient = 0.25 * max(gradient_before, gradient_after);
  // From halfway across, along the edge both ways to where its luma changes.
  float2 edge = uv;
  if (horizontal)
    edge.y += 0.5 * across;
  else
    edge.x += 0.5 * across;
  float2 along = horizontal ? float2(texel.x, 0) : float2(0, texel.y);
  float2 uv1 = edge - along, uv2 = edge + along;
  float end1 = 0, end2 = 0;
  bool found1 = false, found2 = false;
  [loop] for (int i = 0; i < 11; ++i) {
    if (!found1) {
      end1 = luma_at(uv1) - side;
      found1 = abs(end1) >= gradient;
    }
    if (!found2) {
      end2 = luma_at(uv2) - side;
      found2 = abs(end2) >= gradient;
    }
    if (found1 && found2)
      break;
    if (!found1)
      uv1 -= along * SearchSteps[i];
    if (!found2)
      uv2 += along * SearchSteps[i];
  }
  float distance1 = horizontal ? uv.x - uv1.x : uv.y - uv1.y;
  float distance2 = horizontal ? uv2.x - uv.x : uv2.y - uv.y;
  bool nearer1 = distance1 < distance2;
  float span = distance1 + distance2;
  float edge_offset = 0.5 - min(distance1, distance2) / span;
  // Only when the nearer end lies across the side's average from the centre.
  bool towards = ((nearer1 ? end1 : end2) < 0) != (m < side);
  float offset = max(towards ? edge_offset : 0, subpixel);
  float2 resampled = uv;
  if (horizontal)
    resampled.y += offset * across;
  else
    resampled.x += offset * across;
  return float4(Source.SampleLevel(LinearClamp, resampled, 0).rgb, 1);
}
)";
constexpr DXGI_FORMAT ToneFormat = DXGI_FORMAT_R10G10B10A2_UNORM;
constexpr UINT ToneRowPitch = 256;  // 64 texels x 4 bytes, already D3D12-aligned
constexpr UINT RootConstants = 4;
constexpr UINT ToneSlot = 1, PictureSlot = 2, SrvCount = 3;  // after the source at 0
// The intermediate picture's RTV, after the three shared textures'.
constexpr UINT PictureRtv = BroadcastOutput::Slots;
constexpr std::array<const char*, 3> ShaderEntries{"vs_main", "ps_main", "ps_fxaa"};

struct ShaderCache {
  SRWLOCK lock = SRWLOCK_INIT;
  std::array<ID3DBlob*, 3> bytecode{};  // vertex, pixel, anti-aliasing; kept until the process ends
  bool antialias_failed = false;        // tried once: the pictures go out without it
};
ShaderCache& shader_cache() noexcept {
  static ShaderCache cache;
  return cache;
}
ID3DBlob* cached_shader(unsigned index) noexcept {
  auto& cache = shader_cache();
  AcquireSRWLockExclusive(&cache.lock);
  if (!cache.bytecode[index] && !(index == 2 && cache.antialias_failed)) {
    ID3DBlob* blob = nullptr;
    ID3DBlob* diagnostics = nullptr;
    const HRESULT status =
        D3DCompile(Shader, sizeof(Shader) - 1, "polaris_cam_broadcast", nullptr, nullptr, ShaderEntries[index], index ? "ps_5_0" : "vs_5_0",
                   D3DCOMPILE_ENABLE_STRICTNESS | D3DCOMPILE_OPTIMIZATION_LEVEL3 | D3DCOMPILE_WARNINGS_ARE_ERRORS, 0, &blob, &diagnostics);
    if (diagnostics)
      diagnostics->Release();
    if (SUCCEEDED(status) && blob)
      cache.bytecode[index] = blob;
    else if (blob)
      blob->Release();
    cache.antialias_failed = index == 2 && !cache.bytecode[index];
  }
  auto* bytecode = cache.bytecode[index];
  ReleaseSRWLockExclusive(&cache.lock);
  return bytecode;
}
void transition(ID3D12GraphicsCommandList* list, ID3D12Resource* texture, D3D12_RESOURCE_STATES before, D3D12_RESOURCE_STATES after) noexcept {
  D3D12_RESOURCE_BARRIER barrier{};
  barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
  barrier.Transition.pResource = texture;
  barrier.Transition.Subresource = 0;
  barrier.Transition.StateBefore = before;
  barrier.Transition.StateAfter = after;
  list->ResourceBarrier(1, &barrier);
}
bool hdr_format(DXGI_FORMAT format) noexcept {
  return format == DXGI_FORMAT_R11G11B10_FLOAT || format == DXGI_FORMAT_R16G16B16A16_FLOAT;
}
// The typed views a snapshot of this resource format can be read through.
bool view_of(DXGI_FORMAT resource, DXGI_FORMAT view) noexcept {
  switch (view) {
    case DXGI_FORMAT_R11G11B10_FLOAT:
      return resource == DXGI_FORMAT_R11G11B10_FLOAT;
    case DXGI_FORMAT_R16G16B16A16_FLOAT:
      return resource == DXGI_FORMAT_R16G16B16A16_FLOAT || resource == DXGI_FORMAT_R16G16B16A16_TYPELESS;
    case DXGI_FORMAT_R8G8B8A8_UNORM:
      return resource == DXGI_FORMAT_R8G8B8A8_UNORM || resource == DXGI_FORMAT_R8G8B8A8_TYPELESS;
    case DXGI_FORMAT_B8G8R8A8_UNORM:
      return resource == DXGI_FORMAT_B8G8R8A8_UNORM || resource == DXGI_FORMAT_B8G8R8A8_TYPELESS;
    default:
      return false;
  }
}
template <typename T>
void drop(T*& object) noexcept {
  if (object)
    object->Release();
  object = nullptr;
}
}  // namespace

bool BroadcastOutput::prepare_shaders() noexcept {
  // The anti-aliasing shader is optional: the pictures go out without it.
  cached_shader(2);
  return cached_shader(0) && cached_shader(1);
}
bool BroadcastOutput::antialias_shader_ready() noexcept {
  return cached_shader(2) != nullptr;
}
bool BroadcastOutput::fail(const char* error) noexcept {
  failed_ = true;
  error_ = error;
  return false;
}
bool BroadcastOutput::initialize(ID3D12Device* device) noexcept {
  if (failed_)
    return false;
  if (device_)
    return device_ == device && pipeline_ != nullptr;
  if (!device)
    return fail("A live native D3D12 device is required for the broadcast picture.");
  device_ = device;
  device_->AddRef();
  D3D12_COMMAND_QUEUE_DESC queue_desc{};
  queue_desc.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
  if (FAILED(device_->CreateCommandQueue(&queue_desc, IID_PPV_ARGS(&queue_))) ||
      FAILED(device_->CreateCommandAllocator(queue_desc.Type, IID_PPV_ARGS(&allocator_))) ||
      FAILED(device_->CreateCommandList(0, queue_desc.Type, allocator_, nullptr, IID_PPV_ARGS(&list_))) || FAILED(list_->Close()) ||
      FAILED(device_->CreateFence(0, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(&fence_))))
    return fail("Creating the private broadcast queue failed.");
  D3D12_DESCRIPTOR_HEAP_DESC heap{};
  heap.Type = D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV;
  heap.NumDescriptors = SrvCount;
  heap.Flags = D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE;
  if (FAILED(device_->CreateDescriptorHeap(&heap, IID_PPV_ARGS(&srv_heap_))))
    return fail("Creating the broadcast SRV heap failed.");
  heap.Type = D3D12_DESCRIPTOR_HEAP_TYPE_RTV;
  heap.NumDescriptors = Slots + 1;  // and the intermediate picture's
  heap.Flags = D3D12_DESCRIPTOR_HEAP_FLAG_NONE;
  if (FAILED(device_->CreateDescriptorHeap(&heap, IID_PPV_ARGS(&rtv_heap_))))
    return fail("Creating the broadcast RTV heap failed.");
  // A null source until the first picture, so the table is never undefined.
  D3D12_SHADER_RESOURCE_VIEW_DESC view{};
  view.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
  view.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
  view.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
  view.Texture2D.MipLevels = 1;
  device_->CreateShaderResourceView(nullptr, &view, srv_heap_->GetCPUDescriptorHandleForHeapStart());
  auto picture = srv_heap_->GetCPUDescriptorHandleForHeapStart();
  picture.ptr += SIZE_T{PictureSlot} * device_->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);
  device_->CreateShaderResourceView(nullptr, &view, picture);
  return create_tone_table() && create_pipeline();
}
bool BroadcastOutput::create_tone_table() noexcept {
  D3D12_HEAP_PROPERTIES properties{};
  properties.Type = D3D12_HEAP_TYPE_DEFAULT;
  properties.CreationNodeMask = properties.VisibleNodeMask = 1;
  D3D12_RESOURCE_DESC texture{};
  texture.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE3D;
  texture.Width = texture.Height = ToneTexels;
  texture.DepthOrArraySize = ToneTexels;
  texture.MipLevels = 1;
  texture.Format = ToneFormat;
  texture.SampleDesc.Count = 1;
  texture.Layout = D3D12_TEXTURE_LAYOUT_UNKNOWN;
  if (FAILED(device_->CreateCommittedResource(&properties, D3D12_HEAP_FLAG_NONE, &texture, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE,
                                              nullptr, IID_PPV_ARGS(&tone_table_))))
    return fail("Creating the broadcast tone-curve table failed.");
  properties.Type = D3D12_HEAP_TYPE_UPLOAD;
  D3D12_RESOURCE_DESC buffer{};
  buffer.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
  buffer.Width = UINT64{ToneRowPitch} * ToneTexels * ToneTexels;
  buffer.Height = buffer.DepthOrArraySize = buffer.MipLevels = 1;
  buffer.SampleDesc.Count = 1;
  buffer.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
  if (FAILED(device_->CreateCommittedResource(&properties, D3D12_HEAP_FLAG_NONE, &buffer, D3D12_RESOURCE_STATE_GENERIC_READ, nullptr,
                                              IID_PPV_ARGS(&tone_upload_))))
    return fail("Creating the broadcast tone-curve upload buffer failed.");
  const D3D12_RANGE none{0, 0};
  void* mapped = nullptr;
  if (FAILED(tone_upload_->Map(0, &none, &mapped)) || !mapped)
    return fail("Mapping the broadcast tone-curve upload buffer failed.");
  tone_mapped_ = static_cast<unsigned char*>(mapped);
  D3D12_SHADER_RESOURCE_VIEW_DESC view{};
  view.Format = ToneFormat;
  view.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE3D;
  view.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
  view.Texture3D.MipLevels = 1;
  auto handle = srv_heap_->GetCPUDescriptorHandleForHeapStart();
  handle.ptr += SIZE_T{ToneSlot} * device_->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);
  device_->CreateShaderResourceView(tone_table_, &view, handle);
  return true;
}
bool BroadcastOutput::create_pipeline() noexcept {
  std::array<D3D12_DESCRIPTOR_RANGE, 2> ranges{};
  std::array<D3D12_ROOT_PARAMETER, 3> parameters{};
  ranges[0].RangeType = D3D12_DESCRIPTOR_RANGE_TYPE_SRV;
  ranges[0].NumDescriptors = 1;
  ranges[0].BaseShaderRegister = 0;
  ranges[1].RangeType = D3D12_DESCRIPTOR_RANGE_TYPE_SRV;
  ranges[1].NumDescriptors = 1;
  ranges[1].BaseShaderRegister = 1;
  parameters[0].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
  parameters[0].DescriptorTable.NumDescriptorRanges = 1;
  parameters[0].DescriptorTable.pDescriptorRanges = &ranges[0];
  parameters[0].ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
  parameters[1].ParameterType = D3D12_ROOT_PARAMETER_TYPE_32BIT_CONSTANTS;
  parameters[1].Constants.Num32BitValues = RootConstants;
  parameters[1].ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
  parameters[2].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
  parameters[2].DescriptorTable.NumDescriptorRanges = 1;
  parameters[2].DescriptorTable.pDescriptorRanges = &ranges[1];
  parameters[2].ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
  D3D12_STATIC_SAMPLER_DESC sampler{};
  sampler.Filter = D3D12_FILTER_MIN_MAG_MIP_LINEAR;
  sampler.AddressU = sampler.AddressV = sampler.AddressW = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
  sampler.MaxAnisotropy = 1;
  sampler.ComparisonFunc = D3D12_COMPARISON_FUNC_ALWAYS;
  sampler.ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
  D3D12_ROOT_SIGNATURE_DESC signature{};
  signature.NumParameters = static_cast<UINT>(parameters.size());
  signature.pParameters = parameters.data();
  signature.NumStaticSamplers = 1;
  signature.pStaticSamplers = &sampler;
  ID3DBlob* serialized = nullptr;
  ID3DBlob* diagnostics = nullptr;
  HRESULT status = D3D12SerializeRootSignature(&signature, D3D_ROOT_SIGNATURE_VERSION_1, &serialized, &diagnostics);
  if (diagnostics)
    diagnostics->Release();
  if (SUCCEEDED(status))
    status = device_->CreateRootSignature(0, serialized->GetBufferPointer(), serialized->GetBufferSize(), IID_PPV_ARGS(&root_signature_));
  if (serialized)
    serialized->Release();
  if (FAILED(status))
    return fail("Creating the broadcast root signature failed.");
  auto* vertex = cached_shader(0);  // Borrowed from the process shader cache.
  auto* pixel = cached_shader(1);
  if (!vertex || !pixel)
    return fail("Compiling the broadcast shader failed.");
  D3D12_GRAPHICS_PIPELINE_STATE_DESC pipeline{};
  pipeline.pRootSignature = root_signature_;
  pipeline.VS = {vertex->GetBufferPointer(), vertex->GetBufferSize()};
  pipeline.PS = {pixel->GetBufferPointer(), pixel->GetBufferSize()};
  auto& blend = pipeline.BlendState.RenderTarget[0];
  blend.SrcBlend = blend.SrcBlendAlpha = D3D12_BLEND_ONE;
  blend.DestBlend = blend.DestBlendAlpha = D3D12_BLEND_ZERO;
  blend.BlendOp = blend.BlendOpAlpha = D3D12_BLEND_OP_ADD;
  blend.LogicOp = D3D12_LOGIC_OP_NOOP;
  blend.RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL;
  pipeline.SampleMask = UINT_MAX;
  pipeline.RasterizerState.FillMode = D3D12_FILL_MODE_SOLID;
  pipeline.RasterizerState.CullMode = D3D12_CULL_MODE_NONE;
  pipeline.RasterizerState.DepthClipEnable = TRUE;
  pipeline.DepthStencilState.DepthWriteMask = D3D12_DEPTH_WRITE_MASK_ZERO;
  pipeline.DepthStencilState.DepthFunc = D3D12_COMPARISON_FUNC_ALWAYS;
  pipeline.DepthStencilState.StencilReadMask = pipeline.DepthStencilState.StencilWriteMask = 0xff;
  pipeline.DepthStencilState.FrontFace = {D3D12_STENCIL_OP_KEEP, D3D12_STENCIL_OP_KEEP, D3D12_STENCIL_OP_KEEP,
                                          D3D12_COMPARISON_FUNC_ALWAYS};
  pipeline.DepthStencilState.BackFace = pipeline.DepthStencilState.FrontFace;
  pipeline.PrimitiveTopologyType = D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE;
  pipeline.NumRenderTargets = 1;
  pipeline.RTVFormats[0] = Format;
  pipeline.SampleDesc.Count = 1;
  if (FAILED(device_->CreateGraphicsPipelineState(&pipeline, IID_PPV_ARGS(&pipeline_))))
    return fail("Creating the broadcast pipeline failed.");
  // The same, for the anti-aliasing pass. Without it the pictures are sent as
  // ps_main makes them.
  if (auto* fxaa = cached_shader(2)) {
    pipeline.PS = {fxaa->GetBufferPointer(), fxaa->GetBufferSize()};
    if (FAILED(device_->CreateGraphicsPipelineState(&pipeline, IID_PPV_ARGS(&fxaa_pipeline_))))
      fxaa_pipeline_ = nullptr;
  }
  return true;
}

void BroadcastOutput::close_textures() noexcept {
  for (unsigned slot = 0; slot < Slots; ++slot) {
    if (handles_[slot])
      CloseHandle(handles_[slot]);
    handles_[slot] = nullptr;
    drop(textures_[slot]);
  }
  drop(picture_);
  width_ = height_ = 0;
  generation_ = 0;
}
bool BroadcastOutput::release_textures() noexcept {
  if (prepared_ || (fence_ && !idle()))
    return false;
  close_textures();
  return true;
}
bool BroadcastOutput::reset() noexcept {
  if (prepared_)
    return false;
  if (fence_ && device_) {
    // A removed device runs nothing more; otherwise all of it has to be done.
    const auto completed = fence_->GetCompletedValue();
    const bool done = completed != UINT64_MAX && completed >= submitted_;
    if (!done && SUCCEEDED(device_->GetDeviceRemovedReason()))
      return false;
  }
  close_textures();
  if (tone_mapped_ && tone_upload_)
    tone_upload_->Unmap(0, nullptr);
  tone_mapped_ = nullptr;
  drop(tone_upload_);
  drop(tone_table_);
  drop(pipeline_);
  drop(fxaa_pipeline_);  // made with pipeline_: initialize() makes it again
  drop(root_signature_);
  drop(rtv_heap_);
  drop(srv_heap_);
  drop(fence_);
  drop(list_);
  drop(allocator_);
  drop(queue_);
  drop(device_);
  exposure_ev_ = -8.8f;
  tone_exposure_ = 0;
  tone_pending_ = tone_ready_ = tone_recorded_ = tone_was_ready_ = false;
  submitted_ = 0;
  prepared_ = failed_ = antialias_ = false;
  error_ = "";
  return true;
}
bool BroadcastOutput::resize(UINT width, UINT height, std::uint32_t pid, std::uint32_t generation, unsigned feed) noexcept {
  if (!initialized() || prepared_ || !idle() || !polaris_cam::valid_size(width, height) || !generation || feed >= polaris_cam::Feeds)
    return false;
  close_textures();
  D3D12_HEAP_PROPERTIES properties{};
  properties.Type = D3D12_HEAP_TYPE_DEFAULT;
  properties.CreationNodeMask = properties.VisibleNodeMask = 1;
  D3D12_RESOURCE_DESC desc{};
  desc.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
  desc.Width = width;
  desc.Height = height;
  desc.DepthOrArraySize = desc.MipLevels = 1;
  desc.Format = Format;
  desc.SampleDesc.Count = 1;
  desc.Layout = D3D12_TEXTURE_LAYOUT_UNKNOWN;
  // Simultaneous access: the window reads one of the three while the bridge
  // writes another, from another process and API, with no shared state model.
  desc.Flags = D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET | D3D12_RESOURCE_FLAG_ALLOW_SIMULTANEOUS_ACCESS;
  const auto stride = device_->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_RTV);
  for (unsigned slot = 0; slot < Slots; ++slot) {
    if (FAILED(device_->CreateCommittedResource(&properties, D3D12_HEAP_FLAG_SHARED, &desc, D3D12_RESOURCE_STATE_COMMON, nullptr,
                                                IID_PPV_ARGS(&textures_[slot])))) {
      close_textures();
      error_ = "Creating a shared broadcast texture failed.";
      return false;
    }
    wchar_t name[96]{};
    polaris_cam::texture_name(name, 96, pid, generation, feed, slot);
    if (FAILED(device_->CreateSharedHandle(textures_[slot], nullptr, GENERIC_ALL, name, &handles_[slot])) || !handles_[slot]) {
      handles_[slot] = nullptr;
      close_textures();
      error_ = "Sharing a broadcast texture by name failed.";
      return false;
    }
    auto handle = rtv_heap_->GetCPUDescriptorHandleForHeapStart();
    handle.ptr += SIZE_T{slot} * stride;
    device_->CreateRenderTargetView(textures_[slot], nullptr, handle);
  }
  // The intermediate picture the anti-aliasing pass reads: this process's
  // alone, kept in PIXEL_SHADER_RESOURCE between pictures. Without it the
  // pictures go out without anti-aliasing.
  desc.Flags = D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET;
  if (fxaa_pipeline_ && SUCCEEDED(device_->CreateCommittedResource(&properties, D3D12_HEAP_FLAG_NONE, &desc,
                                                                   D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE, nullptr,
                                                                   IID_PPV_ARGS(&picture_)))) {
    auto rtv = rtv_heap_->GetCPUDescriptorHandleForHeapStart();
    rtv.ptr += SIZE_T{PictureRtv} * stride;
    device_->CreateRenderTargetView(picture_, nullptr, rtv);
    D3D12_SHADER_RESOURCE_VIEW_DESC view{};
    view.Format = Format;
    view.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
    view.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
    view.Texture2D.MipLevels = 1;
    auto srv = srv_heap_->GetCPUDescriptorHandleForHeapStart();
    srv.ptr += SIZE_T{PictureSlot} * device_->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);
    device_->CreateShaderResourceView(picture_, &view, srv);
  } else {
    picture_ = nullptr;
  }
  width_ = width;
  height_ = height;
  generation_ = generation;
  error_ = "";
  return true;
}

bool BroadcastOutput::set_display_exposure(float ev) noexcept {
  if (!std::isfinite(ev))
    return false;
  exposure_ev_ = ev < -16 ? -16 : ev > 4 ? 4 : ev;
  return true;
}
bool BroadcastOutput::set_tone_curve(float exposure, const std::uint32_t* table) noexcept {
  if (!std::isfinite(exposure) || exposure <= 0 || exposure > 1e6f || !tone_mapped_) {
    tone_exposure_ = 0;
    return false;
  }
  tone_exposure_ = exposure;
  if (!table)
    return true;
  // The upload buffer is read by a recording that copies it: offer it again.
  if (prepared_ || !idle())
    return false;
  for (UINT slice = 0; slice < ToneTexels * ToneTexels; ++slice)
    std::memcpy(tone_mapped_ + std::size_t{slice} * ToneRowPitch, table + std::size_t{slice} * ToneTexels, ToneTexels * 4);
  tone_pending_ = true;
  return true;
}
bool BroadcastOutput::idle() const noexcept {
  if (failed_ || !fence_)
    return false;
  const auto completed = fence_->GetCompletedValue();
  return completed != UINT64_MAX && completed >= submitted_;
}
bool BroadcastOutput::prepare(ID3D12Resource* source, DXGI_FORMAT format, unsigned slot) noexcept {
  if (!initialized() || prepared_ || !idle() || slot >= Slots || !textures_[slot] || !source)
    return false;
  if (FAILED(device_->GetDeviceRemovedReason()))
    return fail("The broadcast device was removed.");
  const auto desc = source->GetDesc();
  // The view's own size, or the pane the bridge asks for (PaneTrim rows shorter).
  if (desc.Dimension != D3D12_RESOURCE_DIMENSION_TEXTURE2D || desc.Width != width_ || desc.Height > height_ ||
      (height_ - desc.Height) % 2 != 0 || height_ - desc.Height > polaris_cam::PaneTrim || desc.DepthOrArraySize != 1 ||
      desc.SampleDesc.Count != 1 || !view_of(desc.Format, format)) {
    error_ = "A camera snapshot has another size or format than the broadcast picture.";
    return false;
  }
  if (FAILED(allocator_->Reset()) || FAILED(list_->Reset(allocator_, nullptr)))
    return fail("Resetting the completed private broadcast list failed.");
  D3D12_SHADER_RESOURCE_VIEW_DESC view{};
  view.Format = format;
  view.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
  view.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
  view.Texture2D.MipLevels = 1;
  device_->CreateShaderResourceView(source, &view, srv_heap_->GetCPUDescriptorHandleForHeapStart());
  transition(list_, source, D3D12_RESOURCE_STATE_COPY_DEST, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
  if (tone_pending_) {
    // Taken back if this recording is discarded unsubmitted (discard_prepared).
    tone_recorded_ = true;
    tone_was_ready_ = tone_ready_;
    transition(list_, tone_table_, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE, D3D12_RESOURCE_STATE_COPY_DEST);
    D3D12_TEXTURE_COPY_LOCATION destination{}, from{};
    destination.pResource = tone_table_;
    destination.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
    from.pResource = tone_upload_;
    from.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
    from.PlacedFootprint.Footprint = {ToneFormat, ToneTexels, ToneTexels, ToneTexels, ToneRowPitch};
    list_->CopyTextureRegion(&destination, 0, 0, 0, &from, nullptr);
    transition(list_, tone_table_, D3D12_RESOURCE_STATE_COPY_DEST, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
    tone_pending_ = false;
    tone_ready_ = true;
  }
  const bool hdr = hdr_format(format);
  const bool tone = hdr && tone_exposure_ > 0 && tone_ready_;
  // The simulator's exposure chain: scene units (16 x texel), its adapted
  // exposure, and its fixed 11190.6 and 300/10^4 scales (ToneShader notes).
  const struct {
    UINT mode;
    float exposure;
    INT trim;
    INT last_row;
  } display{!hdr ? 0u : tone ? 2u : 1u, tone ? static_cast<float>(11190.6 * 16 * 300e-4) * tone_exposure_ : std::exp2(exposure_ev_),
            static_cast<INT>((height_ - desc.Height) / 2), static_cast<INT>(desc.Height) - 1};
  static_assert(sizeof(display) == RootConstants * sizeof(UINT));
  const auto rtv_stride = device_->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_RTV);
  const auto srv_stride = device_->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);
  auto rtv = rtv_heap_->GetCPUDescriptorHandleForHeapStart(), picture_rtv = rtv;
  rtv.ptr += SIZE_T{slot} * rtv_stride;
  picture_rtv.ptr += SIZE_T{PictureRtv} * rtv_stride;
  auto tone_srv = srv_heap_->GetGPUDescriptorHandleForHeapStart(), picture_srv = tone_srv;
  tone_srv.ptr += UINT64{ToneSlot} * srv_stride;
  picture_srv.ptr += UINT64{PictureSlot} * srv_stride;
  // With anti-aliasing the conversion goes into the intermediate picture,
  // and the second pass from there into the shared texture.
  const bool antialias = antialias_ && fxaa_pipeline_ && picture_;
  list_->SetGraphicsRootSignature(root_signature_);
  list_->SetPipelineState(pipeline_);
  ID3D12DescriptorHeap* heaps[]{srv_heap_};
  list_->SetDescriptorHeaps(1, heaps);
  list_->SetGraphicsRootDescriptorTable(0, srv_heap_->GetGPUDescriptorHandleForHeapStart());
  list_->SetGraphicsRoot32BitConstants(1, RootConstants, &display, 0);
  list_->SetGraphicsRootDescriptorTable(2, tone_srv);
  list_->IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
  const D3D12_VIEWPORT viewport{0, 0, static_cast<float>(width_), static_cast<float>(height_), 0, 1};
  const D3D12_RECT scissor{0, 0, static_cast<LONG>(width_), static_cast<LONG>(height_)};
  list_->RSSetViewports(1, &viewport);
  list_->RSSetScissorRects(1, &scissor);
  if (antialias) {
    transition(list_, picture_, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE, D3D12_RESOURCE_STATE_RENDER_TARGET);
    list_->OMSetRenderTargets(1, &picture_rtv, FALSE, nullptr);
    list_->DrawInstanced(3, 1, 0, 0);
    transition(list_, picture_, D3D12_RESOURCE_STATE_RENDER_TARGET, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
    list_->SetPipelineState(fxaa_pipeline_);
    list_->SetGraphicsRootDescriptorTable(0, picture_srv);
  }
  transition(list_, textures_[slot], D3D12_RESOURCE_STATE_COMMON, D3D12_RESOURCE_STATE_RENDER_TARGET);
  list_->OMSetRenderTargets(1, &rtv, FALSE, nullptr);
  list_->DrawInstanced(3, 1, 0, 0);
  // COMMON again before the window may read it from Direct3D 11.
  transition(list_, textures_[slot], D3D12_RESOURCE_STATE_RENDER_TARGET, D3D12_RESOURCE_STATE_COMMON);
  transition(list_, source, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE, D3D12_RESOURCE_STATE_COPY_DEST);
  if (FAILED(list_->Close()))
    return fail("Closing the private broadcast list failed.");
  prepared_ = true;
  error_ = "";
  return true;
}
bool BroadcastOutput::discard_prepared() noexcept {
  if (!prepared_ || !idle())
    return false;
  if (FAILED(allocator_->Reset()) || FAILED(list_->Reset(allocator_, nullptr)) || FAILED(list_->Close()))
    return fail("Discarding the never-submitted private broadcast list failed.");
  // A tone-table copy in the discarded list never ran: record it again.
  if (tone_recorded_) {
    tone_pending_ = true;
    tone_ready_ = tone_was_ready_;
    tone_recorded_ = false;
  }
  prepared_ = false;
  return true;
}
bool BroadcastOutput::submit() noexcept {
  if (!prepared_ || failed_ || submitted_ >= std::numeric_limits<std::uint64_t>::max() - 1)
    return false;
  ID3D12CommandList* lists[]{list_};
  queue_->ExecuteCommandLists(1, lists);
  prepared_ = false;
  tone_recorded_ = false;
  ++submitted_;
  if (FAILED(queue_->Signal(fence_, submitted_)))
    return fail("Signaling the private broadcast completion fence failed.");
  return true;
}
}  // namespace taxi_camera
