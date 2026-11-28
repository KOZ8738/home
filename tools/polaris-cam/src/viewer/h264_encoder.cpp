// Polaris Cam: a camera's pictures as H.264, made by the graphics card (h264_encoder.hpp).
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
#include "h264_encoder.hpp"
#include <d3d11_1.h>
#include <d3d10_1.h>  // ID3D10Multithread (d3d10_1.h, not d3d10.h: MSVC wants it first)
#include <dxgi1_2.h>
#include <mfapi.h>
#include <mferror.h>
#include <mfidl.h>
#include <mftransform.h>
#include <codecapi.h>
#include <icodecapi.h>
#include <algorithm>
#include <array>
#include <cstdio>
#include <cstring>

namespace polaris_cam::remote {
namespace {
template <typename T>
void drop(T*& object) noexcept {
  if (object)
    object->Release();
  object = nullptr;
}
double now_ms() noexcept {
  LARGE_INTEGER count{}, frequency{};
  QueryPerformanceCounter(&count);
  QueryPerformanceFrequency(&frequency);
  return static_cast<double>(count.QuadPart) * 1000.0 / static_cast<double>(frequency.QuadPart);
}
// The start code at i (00 00 01, or 00 00 00 01 counted from its first 0): its length, 0 when none.
std::size_t start_code(const unsigned char* data, std::size_t size, std::size_t i) noexcept {
  if (i + 3 <= size && data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1)
    return 3;
  if (i + 4 <= size && data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 0 && data[i + 3] == 1)
    return 4;
  return 0;
}
// Each NAL unit: its start (the start code) and its end.
template <typename Each>
void each_nal(const unsigned char* data, std::size_t size, Each&& each) {
  std::size_t i = 0;
  std::size_t begin = SIZE_MAX, payload = 0;
  while (i < size) {
    const std::size_t code = start_code(data, size, i);
    if (code) {
      if (begin != SIZE_MAX && payload < size)
        each(begin, payload, i);
      begin = i;
      payload = i + code;
      i += code;
    } else {
      ++i;
    }
  }
  if (begin != SIZE_MAX && payload < size)
    each(begin, payload, size);
}

// The events of an asynchronous MFT, taken without waiting (GetEvent with
// MF_EVENT_FLAG_NO_WAIT), with short sleeps on a high-resolution timer between.
// No request is ever left pending: one would hold the MFT, and with it the
// card's encoder session, after it is closed (NVIDIA's MFT does not end a
// pending BeginGetEvent on Shutdown).
class EventPoller {
 public:
  struct Event {
    MediaEventType type = MEUnknown;
    HRESULT status = S_OK;
  };
  explicit EventPoller(IMFMediaEventGenerator* generator) : generator_(generator) {
    timer_ = CreateWaitableTimerExW(nullptr, nullptr, HighResolution, TIMER_ALL_ACCESS);
    if (!timer_)  // before Windows 10 1803: a timer of the usual resolution
      timer_ = CreateWaitableTimerExW(nullptr, nullptr, 0, TIMER_ALL_ACCESS);
  }
  ~EventPoller() {
    if (timer_)
      CloseHandle(timer_);
  }
  EventPoller(const EventPoller&) = delete;
  EventPoller& operator=(const EventPoller&) = delete;
  // 1: an event; 0: none came within wait_ms; -1: the MFT gives no more.
  int next(Event& event, double wait_ms) {
    const double until = now_ms() + wait_ms;
    for (;;) {
      IMFMediaEvent* got = nullptr;
      const HRESULT status = generator_->GetEvent(MF_EVENT_FLAG_NO_WAIT, &got);
      if (SUCCEEDED(status) && got) {
        got->GetType(&event.type);
        got->GetStatus(&event.status);
        got->Release();
        return 1;
      }
      if (status != MF_E_NO_EVENTS_AVAILABLE)
        return -1;
      const double left = until - now_ms();
      if (left <= 0)
        return 0;
      pause(std::min(left, 0.5));
    }
  }

 private:
  static constexpr DWORD HighResolution = 0x00000002;  // CREATE_WAITABLE_TIMER_HIGH_RESOLUTION
  void pause(double ms) {
    LARGE_INTEGER due{};
    due.QuadPart = -static_cast<LONGLONG>(ms * 10000.0);
    if (timer_ && SetWaitableTimer(timer_, &due, 0, nullptr, nullptr, FALSE))
      WaitForSingleObject(timer_, 100);
    else
      Sleep(1);
  }
  IMFMediaEventGenerator* generator_;  // held by the encoder
  HANDLE timer_ = nullptr;
};

std::wstring hresult_text(const wchar_t* what, HRESULT status) {
  wchar_t text[160];
  std::swprintf(text, 160, L"%ls (0x%08lX)", what, static_cast<unsigned long>(status));
  return text;
}
bool set_uint(ICodecAPI* api, const GUID& property, ULONG value, HRESULT* result = nullptr) {
  VARIANT v{};
  v.vt = VT_UI4;
  v.ulVal = value;
  const HRESULT status = api->SetValue(&property, &v);
  if (result)
    *result = status;
  return SUCCEEDED(status);
}
bool set_bool(ICodecAPI* api, const GUID& property, bool value) {
  VARIANT v{};
  v.vt = VT_BOOL;
  v.boolVal = value ? VARIANT_TRUE : VARIANT_FALSE;
  return SUCCEEDED(api->SetValue(&property, &v));
}
// BT.709, 16..235, progressive, square pixels: on both the encoder's input and its output.
void describe_video(IMFMediaType* type, unsigned width, unsigned height, unsigned fps) {
  MFSetAttributeSize(type, MF_MT_FRAME_SIZE, width, height);
  MFSetAttributeRatio(type, MF_MT_FRAME_RATE, fps, 1);
  MFSetAttributeRatio(type, MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
  type->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
  type->SetUINT32(MF_MT_VIDEO_NOMINAL_RANGE, MFNominalRange_16_235);
  type->SetUINT32(MF_MT_YUV_MATRIX, MFVideoTransferMatrix_BT709);
  type->SetUINT32(MF_MT_VIDEO_PRIMARIES, MFVideoPrimaries_BT709);
  type->SetUINT32(MF_MT_TRANSFER_FUNCTION, MFVideoTransFunc_709);
}
}  // namespace

NalScan scan_nals(const unsigned char* data, std::size_t size) noexcept {
  NalScan scan;
  if (!data)
    return scan;
  each_nal(data, size, [&](std::size_t, std::size_t payload, std::size_t) {
    const unsigned type = data[payload] & 0x1F;
    ++scan.count;
    if (type == 5)
      scan.idr = true;
    else if (type == 1)
      scan.slice = true;
    else if (type == 7)
      scan.sps = true;
    else if (type == 8)
      scan.pps = true;
  });
  return scan;
}

std::vector<unsigned char> parameter_sets(const unsigned char* data, std::size_t size) {
  std::vector<unsigned char> out;
  if (!data)
    return out;
  each_nal(data, size, [&](std::size_t, std::size_t payload, std::size_t end) {
    const unsigned type = data[payload] & 0x1F;
    if (type != 7 && type != 8)
      return;
    // Trailing zeros before the next start code belong to no unit.
    while (end > payload + 1 && data[end - 1] == 0)
      --end;
    static constexpr unsigned char Code[]{0, 0, 0, 1};
    out.insert(out.end(), Code, Code + 4);
    out.insert(out.end(), data + payload, data + end);
  });
  return out;
}

bool complete_key_frame(std::vector<unsigned char>& frame, const std::vector<unsigned char>& sequence_header) {
  const NalScan scan = scan_nals(frame.data(), frame.size());
  if (!scan.idr)
    return false;
  if ((scan.sps && scan.pps) || sequence_header.empty())
    return true;
  // After an access unit delimiter (type 9), which has to come first.
  std::size_t at = 0;
  bool first = true;
  each_nal(frame.data(), frame.size(), [&](std::size_t, std::size_t payload, std::size_t end) {
    if (first && (frame[payload] & 0x1F) == 9)
      at = end;
    first = false;
  });
  frame.insert(frame.begin() + static_cast<std::ptrdiff_t>(at), sequence_header.begin(), sequence_header.end());
  return true;
}

unsigned h264_bitrate(unsigned width, unsigned height) noexcept {
  const double area = static_cast<double>(width) * height;
  constexpr double Small = 640.0 * 360, Large = 960.0 * 540;
  double rate = 0;
  if (area <= Small)
    rate = 1200000.0 * area / Small;
  else if (area <= Large)
    rate = 1200000.0 + (2000000.0 - 1200000.0) * (area - Small) / (Large - Small);
  else
    rate = 2000000.0 * area / Large;
  return static_cast<unsigned>(std::clamp(rate, 200000.0, 12000000.0));
}

namespace {
bool enumerate(IMFActivate*** list, UINT32* count) {
  MFT_REGISTER_TYPE_INFO input{MFMediaType_Video, MFVideoFormat_NV12};
  MFT_REGISTER_TYPE_INFO output{MFMediaType_Video, MFVideoFormat_H264};
  return SUCCEEDED(MFTEnumEx(MFT_CATEGORY_VIDEO_ENCODER, MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER, &input, &output, list, count));
}
void free_list(IMFActivate** list, UINT32 count) {
  for (UINT32 i = 0; i < count; ++i)
    if (list[i])
      list[i]->Release();
  CoTaskMemFree(list);
}
}  // namespace

bool hardware_h264_available() {
  IMFActivate** list = nullptr;
  UINT32 count = 0;
  if (!enumerate(&list, &count))
    return false;
  free_list(list, count);
  return count > 0;
}

// --- the encoder ------------------------------------------------------------------
struct H264Encoder::Impl {
  static constexpr unsigned Ring = 6;  // NV12 pictures: the encoder may still hold a few

  EncoderSettings settings;
  bool open = false;
  bool mf_started = false;
  std::wstring description, error;
  EncoderStats stats;
  std::vector<unsigned char> sequence_header;

  ID3D11Device* device = nullptr;
  ID3D11DeviceContext* context = nullptr;
  ID3D11VideoDevice* video_device = nullptr;
  ID3D11VideoContext* video_context = nullptr;
  ID3D11VideoProcessorEnumerator* processor_enum = nullptr;
  ID3D11VideoProcessor* processor = nullptr;
  ID3D11Texture2D* input = nullptr;  // BGRA
  ID3D11VideoProcessorInputView* input_view = nullptr;
  std::array<ID3D11Texture2D*, Ring> nv12{};
  std::array<ID3D11VideoProcessorOutputView*, Ring> nv12_view{};
  ID3D11Texture2D* readback = nullptr;
  unsigned next = 0, last = Ring;

  IMFDXGIDeviceManager* manager = nullptr;
  UINT reset_token = 0;
  IMFTransform* mft = nullptr;
  ICodecAPI* codec = nullptr;
  IMFMediaEventGenerator* generator = nullptr;
  std::unique_ptr<EventPoller> events;
  bool async = false;
  DWORD input_id = 0, output_id = 0;
  MFT_OUTPUT_STREAM_INFO output_info{};
  unsigned need_input = 0;
  bool fatal = false;
  bool key_requested = false;
  unsigned failures = 0;  // in a row
  LONGLONG last_time = -1;
  std::uint64_t first_ms = 0;
  bool first_frame = true;

  bool fail(const wchar_t* what, HRESULT status) {
    error = hresult_text(what, status);
    return false;
  }
  bool open_device();
  bool open_processor();
  bool open_mft();
  bool set_types();
  void read_sequence_header();
  int pump(double wait_ms, std::vector<EncodedFrame>& out);  // 1 an event handled, 0 none, -1 failed
  bool take_output(std::vector<EncodedFrame>& out);
  void close() noexcept;
};

H264Encoder::H264Encoder() : impl_(std::make_unique<Impl>()) {}
H264Encoder::~H264Encoder() {
  close();
}
bool H264Encoder::is_open() const noexcept {
  return impl_->open;
}
const std::wstring& H264Encoder::description() const noexcept {
  return impl_->description;
}
const std::wstring& H264Encoder::last_error() const noexcept {
  return impl_->error;
}
const EncoderStats& H264Encoder::stats() const noexcept {
  return impl_->stats;
}
const std::vector<unsigned char>& H264Encoder::sequence_header() const noexcept {
  return impl_->sequence_header;
}
void H264Encoder::request_keyframe() noexcept {
  impl_->key_requested = true;
}
void H264Encoder::close() noexcept {
  impl_->close();
}

bool H264Encoder::open(const EncoderSettings& settings) {
  close();
  auto& s = *impl_;
  s.error.clear();
  s.stats = EncoderStats{};
  s.settings = settings;
  s.settings.out_width &= ~1u;
  s.settings.out_height &= ~1u;
  if (!s.settings.bitrate)
    s.settings.bitrate = h264_bitrate(s.settings.out_width, s.settings.out_height);
  if (!settings.in_width || !settings.in_height || s.settings.out_width < 16 || s.settings.out_height < 16 || !s.settings.fps) {
    s.error = L"size";
    return false;
  }
  const HRESULT started = MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET);
  if (FAILED(started))
    return s.fail(L"MFStartup", started);
  s.mf_started = true;
  if (!s.open_device() || !s.open_processor() || !s.open_mft()) {
    const std::wstring why = s.error;
    s.close();
    s.error = why;
    return false;
  }
  s.open = true;
  s.first_frame = true;
  s.key_requested = false;
  return true;
}

// A device of its own, on the simulator's card (or the one with the most memory of its own).
bool H264Encoder::Impl::open_device() {
  IDXGIFactory1* factory = nullptr;
  HRESULT status = CreateDXGIFactory1(IID_PPV_ARGS(&factory));
  if (FAILED(status))
    return fail(L"DXGI", status);
  IDXGIAdapter1* chosen = nullptr;
  DXGI_ADAPTER_DESC1 chosen_desc{};
  IDXGIAdapter1* adapter = nullptr;
  for (UINT index = 0; factory->EnumAdapters1(index, &adapter) != DXGI_ERROR_NOT_FOUND; ++index) {
    DXGI_ADAPTER_DESC1 desc{};
    if (FAILED(adapter->GetDesc1(&desc)) || (desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE)) {
      drop(adapter);
      continue;
    }
    const bool same = settings.has_adapter && desc.AdapterLuid.LowPart == settings.adapter.LowPart &&
                      desc.AdapterLuid.HighPart == settings.adapter.HighPart;
    const bool chosen_same = chosen && settings.has_adapter && chosen_desc.AdapterLuid.LowPart == settings.adapter.LowPart &&
                             chosen_desc.AdapterLuid.HighPart == settings.adapter.HighPart;
    if (!chosen || (same && !chosen_same) || (!chosen_same && !same && desc.DedicatedVideoMemory > chosen_desc.DedicatedVideoMemory)) {
      drop(chosen);
      chosen = adapter;
      chosen_desc = desc;
      adapter = nullptr;
    } else {
      drop(adapter);
    }
  }
  drop(factory);
  if (!chosen)
    return fail(L"no graphics card", E_FAIL);
  const D3D_FEATURE_LEVEL levels[]{D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0};
  const UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT;
  status = D3D11CreateDevice(chosen, D3D_DRIVER_TYPE_UNKNOWN, nullptr, flags, levels, 2, D3D11_SDK_VERSION, &device, nullptr, &context);
  if (status == E_INVALIDARG)
    status = D3D11CreateDevice(chosen, D3D_DRIVER_TYPE_UNKNOWN, nullptr, flags, levels + 1, 1, D3D11_SDK_VERSION, &device, nullptr, &context);
  drop(chosen);
  if (FAILED(status))
    return fail(L"Direct3D 11 video device", status);
  // The encoder uses the device from its own threads.
  ID3D10Multithread* multithread = nullptr;
  if (SUCCEEDED(device->QueryInterface(IID_PPV_ARGS(&multithread)))) {
    multithread->SetMultithreadProtected(TRUE);
    drop(multithread);
  }
  status = MFCreateDXGIDeviceManager(&reset_token, &manager);
  if (SUCCEEDED(status))
    status = manager->ResetDevice(device, reset_token);
  if (FAILED(status))
    return fail(L"DXGI device manager", status);
  description = chosen_desc.Description;
  return true;
}

// BGRA (0..255) in, NV12 (BT.709, 16..235) out, scaled.
bool H264Encoder::Impl::open_processor() {
  HRESULT status = device->QueryInterface(IID_PPV_ARGS(&video_device));
  if (SUCCEEDED(status))
    status = context->QueryInterface(IID_PPV_ARGS(&video_context));
  if (FAILED(status))
    return fail(L"no video processing", status);
  D3D11_VIDEO_PROCESSOR_CONTENT_DESC content{};
  content.InputFrameFormat = D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE;
  content.InputFrameRate = {settings.fps, 1};
  content.InputWidth = settings.in_width;
  content.InputHeight = settings.in_height;
  content.OutputFrameRate = {settings.fps, 1};
  content.OutputWidth = settings.out_width;
  content.OutputHeight = settings.out_height;
  content.Usage = D3D11_VIDEO_USAGE_OPTIMAL_SPEED;
  status = video_device->CreateVideoProcessorEnumerator(&content, &processor_enum);
  if (FAILED(status))
    return fail(L"video processor", status);
  UINT support = 0;
  if (FAILED(processor_enum->CheckVideoProcessorFormat(DXGI_FORMAT_B8G8R8A8_UNORM, &support)) ||
      !(support & D3D11_VIDEO_PROCESSOR_FORMAT_SUPPORT_INPUT))
    return fail(L"video processor: no BGRA input", E_FAIL);
  if (FAILED(processor_enum->CheckVideoProcessorFormat(DXGI_FORMAT_NV12, &support)) ||
      !(support & D3D11_VIDEO_PROCESSOR_FORMAT_SUPPORT_OUTPUT))
    return fail(L"video processor: no NV12 output", E_FAIL);
  status = video_device->CreateVideoProcessor(processor_enum, 0, &processor);
  if (FAILED(status))
    return fail(L"video processor", status);

  D3D11_TEXTURE2D_DESC desc{};
  desc.Width = settings.in_width;
  desc.Height = settings.in_height;
  desc.MipLevels = 1;
  desc.ArraySize = 1;
  desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
  desc.SampleDesc.Count = 1;
  desc.Usage = D3D11_USAGE_DEFAULT;
  desc.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
  status = device->CreateTexture2D(&desc, nullptr, &input);
  D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC input_desc{};
  input_desc.ViewDimension = D3D11_VPIV_DIMENSION_TEXTURE2D;
  if (SUCCEEDED(status))
    status = video_device->CreateVideoProcessorInputView(input, processor_enum, &input_desc, &input_view);
  if (FAILED(status))
    return fail(L"BGRA picture", status);
  desc.Width = settings.out_width;
  desc.Height = settings.out_height;
  desc.Format = DXGI_FORMAT_NV12;
  desc.BindFlags = D3D11_BIND_RENDER_TARGET;
  D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC output_desc{};
  output_desc.ViewDimension = D3D11_VPOV_DIMENSION_TEXTURE2D;
  for (unsigned i = 0; i < Ring; ++i) {
    status = device->CreateTexture2D(&desc, nullptr, &nv12[i]);
    if (SUCCEEDED(status))
      status = video_device->CreateVideoProcessorOutputView(nv12[i], processor_enum, &output_desc, &nv12_view[i]);
    if (FAILED(status))
      return fail(L"NV12 picture", status);
  }

  // Colour: full-range RGB in, BT.709 limited-range YCbCr out.
  ID3D11VideoContext1* context1 = nullptr;
  if (SUCCEEDED(video_context->QueryInterface(IID_PPV_ARGS(&context1)))) {
    context1->VideoProcessorSetStreamColorSpace1(processor, 0, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709);
    context1->VideoProcessorSetOutputColorSpace1(processor, DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709);
    drop(context1);
  } else {
    D3D11_VIDEO_PROCESSOR_COLOR_SPACE in{};
    in.RGB_Range = 0;  // 0..255
    in.YCbCr_Matrix = 1;
    in.Nominal_Range = D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_0_255;
    D3D11_VIDEO_PROCESSOR_COLOR_SPACE out{};
    out.RGB_Range = 1;
    out.YCbCr_Matrix = 1;  // BT.709
    out.Nominal_Range = D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_16_235;
    video_context->VideoProcessorSetStreamColorSpace(processor, 0, &in);
    video_context->VideoProcessorSetOutputColorSpace(processor, &out);
  }
  const RECT source{0, 0, static_cast<LONG>(settings.in_width), static_cast<LONG>(settings.in_height)};
  const RECT target{0, 0, static_cast<LONG>(settings.out_width), static_cast<LONG>(settings.out_height)};
  video_context->VideoProcessorSetStreamFrameFormat(processor, 0, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE);
  video_context->VideoProcessorSetStreamSourceRect(processor, 0, TRUE, &source);
  video_context->VideoProcessorSetStreamDestRect(processor, 0, TRUE, &target);
  video_context->VideoProcessorSetOutputTargetRect(processor, TRUE, &target);
  video_context->VideoProcessorSetStreamAutoProcessingMode(processor, 0, FALSE);
  return true;
}

// The card's own H.264 encoder: hardware only.
bool H264Encoder::Impl::open_mft() {
  IMFActivate** list = nullptr;
  UINT32 count = 0;
  if (!enumerate(&list, &count) || !count) {
    if (list)
      CoTaskMemFree(list);
    return fail(L"no hardware H.264 encoder", MF_E_NOT_FOUND);
  }
  // The one of the card the device is on, when they say whose they are ("VEN_10DE").
  IDXGIDevice* dxgi = nullptr;
  IDXGIAdapter* adapter = nullptr;
  DXGI_ADAPTER_DESC adapter_desc{};
  if (SUCCEEDED(device->QueryInterface(IID_PPV_ARGS(&dxgi))) && SUCCEEDED(dxgi->GetAdapter(&adapter)))
    adapter->GetDesc(&adapter_desc);
  drop(adapter);
  drop(dxgi);
  wchar_t vendor[16];
  std::swprintf(vendor, 16, L"VEN_%04X", adapter_desc.VendorId);
  UINT32 pick = 0;
  for (UINT32 i = 0; i < count; ++i) {
    wchar_t* id = nullptr;
    UINT32 length = 0;
    if (SUCCEEDED(list[i]->GetAllocatedString(MFT_ENUM_HARDWARE_VENDOR_ID_Attribute, &id, &length))) {
      const bool same = _wcsicmp(id, vendor) == 0;
      CoTaskMemFree(id);
      if (same) {
        pick = i;
        break;
      }
    }
  }
  wchar_t* name = nullptr;
  UINT32 name_length = 0;
  if (SUCCEEDED(list[pick]->GetAllocatedString(MFT_FRIENDLY_NAME_Attribute, &name, &name_length))) {
    description += L" · ";
    description += name;
    CoTaskMemFree(name);
  }
  HRESULT status = list[pick]->ActivateObject(IID_PPV_ARGS(&mft));
  free_list(list, count);
  if (FAILED(status))
    return fail(L"hardware H.264 encoder would not open", status);

  IMFAttributes* attributes = nullptr;
  if (SUCCEEDED(mft->GetAttributes(&attributes))) {
    UINT32 is_async = 0;
    async = SUCCEEDED(attributes->GetUINT32(MF_TRANSFORM_ASYNC, &is_async)) && is_async;
    if (async)
      attributes->SetUINT32(MF_TRANSFORM_ASYNC_UNLOCK, TRUE);
    attributes->SetUINT32(MF_LOW_LATENCY, TRUE);
    drop(attributes);
  }
  status = mft->ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, reinterpret_cast<ULONG_PTR>(manager));
  if (FAILED(status))
    return fail(L"encoder: Direct3D", status);
  status = mft->QueryInterface(IID_PPV_ARGS(&codec));
  if (FAILED(status))
    return fail(L"encoder: ICodecAPI", status);
  set_bool(codec, CODECAPI_AVLowLatencyMode, true);
  set_uint(codec, CODECAPI_AVEncCommonRateControlMode, eAVEncCommonRateControlMode_CBR);
  set_uint(codec, CODECAPI_AVEncCommonMeanBitRate, settings.bitrate);
  set_uint(codec, CODECAPI_AVEncMPVGOPSize, settings.gop);
  // NVIDIA's answers E_INVALIDARG and, at low latency, makes none anyway.
  set_uint(codec, CODECAPI_AVEncMPVDefaultBPictureCount, 0, &stats.b_frames);

  DWORD inputs = 0, outputs = 0;
  if (SUCCEEDED(mft->GetStreamCount(&inputs, &outputs)) && inputs == 1 && outputs == 1) {
    status = mft->GetStreamIDs(1, &input_id, 1, &output_id);
    if (status == E_NOTIMPL)
      input_id = output_id = 0;
  }
  if (!set_types())
    return false;
  status = mft->GetOutputStreamInfo(output_id, &output_info);
  if (FAILED(status))
    return fail(L"encoder: output", status);
  status = mft->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0);
  if (SUCCEEDED(status))
    status = mft->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0);
  if (FAILED(status))
    return fail(L"encoder: start", status);
  if (async) {
    status = mft->QueryInterface(IID_PPV_ARGS(&generator));
    if (FAILED(status))
      return fail(L"encoder: events", status);
    events = std::make_unique<EventPoller>(generator);
  }
  if (stats.b_frames == E_INVALIDARG)
    description += L" · B=0 by low latency";
  return true;
}

bool H264Encoder::Impl::set_types() {
  IMFMediaType* output = nullptr;
  HRESULT status = MFCreateMediaType(&output);
  if (FAILED(status))
    return fail(L"encoder: type", status);
  output->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
  output->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_H264);
  output->SetUINT32(MF_MT_AVG_BITRATE, settings.bitrate);
  output->SetUINT32(MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_High);
  describe_video(output, settings.out_width, settings.out_height, settings.fps);
  status = mft->SetOutputType(output_id, output, 0);
  if (FAILED(status)) {  // an encoder without High: its own choice
    output->DeleteItem(MF_MT_MPEG2_PROFILE);
    status = mft->SetOutputType(output_id, output, 0);
  }
  drop(output);
  if (FAILED(status))
    return fail(L"encoder: H.264 type", status);
  // NV12 as the encoder offers it, with the size and colour said.
  IMFMediaType* in_type = nullptr;
  for (DWORD i = 0; SUCCEEDED(mft->GetInputAvailableType(input_id, i, &in_type)); ++i) {
    GUID subtype{};
    if (SUCCEEDED(in_type->GetGUID(MF_MT_SUBTYPE, &subtype)) && IsEqualGUID(subtype, MFVideoFormat_NV12))
      break;
    drop(in_type);
  }
  if (!in_type) {
    status = MFCreateMediaType(&in_type);
    if (FAILED(status))
      return fail(L"encoder: type", status);
    in_type->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    in_type->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_NV12);
  }
  describe_video(in_type, settings.out_width, settings.out_height, settings.fps);
  status = mft->SetInputType(input_id, in_type, 0);
  drop(in_type);
  if (FAILED(status))
    return fail(L"encoder: NV12 type", status);
  read_sequence_header();
  return true;
}

void H264Encoder::Impl::read_sequence_header() {
  IMFMediaType* current = nullptr;
  if (FAILED(mft->GetOutputCurrentType(output_id, &current)))
    return;
  UINT32 size = 0;
  if (SUCCEEDED(current->GetBlobSize(MF_MT_MPEG_SEQUENCE_HEADER, &size)) && size > 0 && size < 4096) {
    std::vector<unsigned char> blob(size);
    if (SUCCEEDED(current->GetBlob(MF_MT_MPEG_SEQUENCE_HEADER, blob.data(), size, nullptr))) {
      auto sets = parameter_sets(blob.data(), blob.size());
      if (!sets.empty())
        sequence_header = std::move(sets);
    }
  }
  drop(current);
}

// One event handled, waiting at most wait_ms for it.
int H264Encoder::Impl::pump(double wait_ms, std::vector<EncodedFrame>& out) {
  EventPoller::Event event;
  const int got = events->next(event, wait_ms);
  if (got < 0) {
    fatal = true;
    fail(L"encoder: events", E_FAIL);
    return -1;
  }
  if (!got)
    return 0;
  if (FAILED(event.status) || event.type == MEError) {
    fatal = true;
    error = hresult_text(L"encoder event", FAILED(event.status) ? event.status : E_FAIL);
    return -1;
  }
  if (event.type == METransformNeedInput)
    ++need_input;
  else if (event.type == METransformHaveOutput && !take_output(out))
    return -1;
  return 1;
}

bool H264Encoder::Impl::take_output(std::vector<EncodedFrame>& out) {
  MFT_OUTPUT_DATA_BUFFER buffer{};
  buffer.dwStreamID = output_id;
  IMFSample* own = nullptr;
  if (!(output_info.dwFlags & (MFT_OUTPUT_STREAM_PROVIDES_SAMPLES | MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES))) {
    IMFMediaBuffer* memory = nullptr;
    const DWORD size = std::max<DWORD>(output_info.cbSize, 1u << 20);
    if (FAILED(MFCreateSample(&own)) || FAILED(MFCreateMemoryBuffer(size, &memory)) || FAILED(own->AddBuffer(memory))) {
      drop(memory);
      drop(own);
      return fail(L"encoder: output sample", E_OUTOFMEMORY);
    }
    drop(memory);
    buffer.pSample = own;
  }
  DWORD status_flags = 0;
  HRESULT status = mft->ProcessOutput(0, 1, &buffer, &status_flags);
  if (buffer.pEvents)
    buffer.pEvents->Release();
  IMFSample* sample = buffer.pSample;
  if (status == MF_E_TRANSFORM_STREAM_CHANGE) {
    // The encoder has a new output type to give: take it as it is.
    drop(own);
    if (sample && sample != own)
      sample->Release();
    IMFMediaType* type = nullptr;
    status = mft->GetOutputAvailableType(output_id, 0, &type);
    if (SUCCEEDED(status))
      status = mft->SetOutputType(output_id, type, 0);
    drop(type);
    if (FAILED(status))
      return fail(L"encoder: new output type", status);
    read_sequence_header();
    mft->GetOutputStreamInfo(output_id, &output_info);
    return true;
  }
  if (status == MF_E_TRANSFORM_NEED_MORE_INPUT) {
    if (sample && sample != own)
      sample->Release();
    drop(own);
    return true;
  }
  if (FAILED(status) || !sample) {
    if (sample && sample != own)
      sample->Release();
    drop(own);
    fatal = true;
    return fail(L"encoder: output", FAILED(status) ? status : E_POINTER);
  }
  IMFMediaBuffer* contiguous = nullptr;
  BYTE* bytes = nullptr;
  DWORD length = 0;
  EncodedFrame frame;
  if (SUCCEEDED(sample->ConvertToContiguousBuffer(&contiguous)) && SUCCEEDED(contiguous->Lock(&bytes, nullptr, &length))) {
    frame.data.assign(bytes, bytes + length);
    contiguous->Unlock();
  }
  drop(contiguous);
  LONGLONG time = 0;
  if (SUCCEEDED(sample->GetSampleTime(&time)))
    frame.time_ms = first_ms + static_cast<std::uint64_t>(time / 10000);
  if (sample != own)
    sample->Release();
  drop(own);
  ++stats.outputs;
  if (frame.data.empty())
    return true;
  const NalScan scan = scan_nals(frame.data.data(), frame.data.size());
  if (scan.sps && scan.pps) {
    auto sets = parameter_sets(frame.data.data(), frame.data.size());
    if (!sets.empty())
      sequence_header = std::move(sets);
  }
  if (scan.idr && (!scan.sps || !scan.pps) && !sequence_header.empty())
    ++stats.headers_added;
  frame.key = complete_key_frame(frame.data, sequence_header);
  if (frame.key)
    ++stats.keyframes;
  out.push_back(std::move(frame));
  return true;
}

bool H264Encoder::encode_bgra(const unsigned char* bgra,
                              unsigned in_width,
                              unsigned in_height,
                              std::size_t stride,
                              std::uint64_t time_ms,
                              std::vector<EncodedFrame>& out) {
  auto& s = *impl_;
  if (!s.open || s.fatal)
    return false;
  if (!bgra || in_width != s.settings.in_width || in_height != s.settings.in_height || stride < std::size_t{in_width} * 4) {
    s.error = L"picture size";
    return true;  // not this encoder's picture: nothing made, nothing broken
  }
  const double began = now_ms();
  // Up to the card, and through the video processor into this turn's NV12.
  s.context->UpdateSubresource(s.input, 0, nullptr, bgra, static_cast<UINT>(stride), 0);
  const unsigned index = s.next;
  s.next = (s.next + 1) % Impl::Ring;
  D3D11_VIDEO_PROCESSOR_STREAM stream{};
  stream.Enable = TRUE;
  stream.pInputSurface = s.input_view;
  HRESULT status = s.video_context->VideoProcessorBlt(s.processor, s.nv12_view[index], 0, 1, &stream);
  if (FAILED(status)) {
    s.fail(L"video processor", status);
    close();
    return false;
  }
  s.last = index;
  IMFMediaBuffer* buffer = nullptr;
  IMFSample* sample = nullptr;
  status = MFCreateDXGISurfaceBuffer(__uuidof(ID3D11Texture2D), s.nv12[index], 0, FALSE, &buffer);
  if (SUCCEEDED(status)) {
    IMF2DBuffer* buffer2d = nullptr;
    DWORD length = 0;
    if (SUCCEEDED(buffer->QueryInterface(IID_PPV_ARGS(&buffer2d))) && SUCCEEDED(buffer2d->GetContiguousLength(&length)))
      buffer->SetCurrentLength(length);
    drop(buffer2d);
    status = MFCreateSample(&sample);
  }
  if (SUCCEEDED(status))
    status = sample->AddBuffer(buffer);
  drop(buffer);
  if (FAILED(status)) {
    drop(sample);
    s.fail(L"encoder: input sample", status);
    close();
    return false;
  }
  // Its time, from when the encoder opened, in 100 ns; always forward.
  if (s.first_frame) {
    s.first_ms = time_ms;
    s.first_frame = false;
  }
  LONGLONG time = static_cast<LONGLONG>(time_ms - std::min(time_ms, s.first_ms)) * 10000;
  if (time <= s.last_time)
    time = s.last_time + 1;
  s.last_time = time;
  sample->SetSampleTime(time);
  sample->SetSampleDuration(10000000 / s.settings.fps);
  if (s.key_requested) {
    s.key_requested = false;
    if (set_uint(s.codec, CODECAPI_AVEncVideoForceKeyFrame, 1))
      ++s.stats.forced_keys;
  }

  bool ok = true, taken = false;
  if (s.async) {
    // Its turn: the encoder says when it takes a picture.
    const double give_up = now_ms() + 500;
    while (ok && !s.need_input && now_ms() < give_up)
      ok = s.pump(give_up - now_ms(), out) >= 0;
    if (ok && s.need_input) {
      status = s.mft->ProcessInput(s.input_id, sample, 0);
      if (SUCCEEDED(status)) {
        --s.need_input;
        taken = true;
      } else if (status != MF_E_NOTACCEPTING) {
        ok = s.fail(L"encoder: input", status);
      }
    }
    if (ok && taken) {
      // This picture's output, which at low latency comes within a few milliseconds.
      const std::size_t before = out.size();
      const double wait_until = now_ms() + 40;
      while (ok && out.size() == before && now_ms() < wait_until)
        ok = s.pump(wait_until - now_ms(), out) >= 0;
    }
    // And whatever else is already waiting.
    for (int round = 0; ok && round < 16; ++round) {
      const int handled = s.pump(0, out);
      ok = handled >= 0;
      if (handled <= 0)
        break;
    }
  } else {
    status = s.mft->ProcessInput(s.input_id, sample, 0);
    if (SUCCEEDED(status)) {
      taken = true;
      for (int round = 0; round < 8 && ok; ++round) {
        const std::size_t before = out.size();
        const auto outputs = s.stats.outputs;
        ok = s.take_output(out);
        if (out.size() == before && s.stats.outputs == outputs)
          break;  // needs more input
      }
    } else if (status != MF_E_NOTACCEPTING) {
      ok = s.fail(L"encoder: input", status);
    }
  }
  drop(sample);
  if (ok && !s.fatal) {
    if (taken) {
      ++s.stats.inputs;
      s.failures = 0;
    } else if (++s.failures >= 3) {
      ok = s.fail(L"encoder stopped taking pictures", MF_E_NOTACCEPTING);  // 1.5 s without a turn
    }
  }
  const double took = now_ms() - began;
  s.stats.call_ms_total += took;
  s.stats.call_ms_max = std::max(s.stats.call_ms_max, took);
  if (!ok || s.fatal) {
    const std::wstring why = s.error;
    close();
    s.error = why;
    return false;
  }
  return true;
}

bool H264Encoder::last_nv12(std::vector<unsigned char>& out) {
  auto& s = *impl_;
  if (!s.open || s.last >= Impl::Ring)
    return false;
  if (!s.readback) {
    D3D11_TEXTURE2D_DESC desc{};
    s.nv12[0]->GetDesc(&desc);
    desc.Usage = D3D11_USAGE_STAGING;
    desc.BindFlags = 0;
    desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    if (FAILED(s.device->CreateTexture2D(&desc, nullptr, &s.readback)))
      return false;
  }
  s.context->CopyResource(s.readback, s.nv12[s.last]);
  D3D11_MAPPED_SUBRESOURCE mapped{};
  if (FAILED(s.context->Map(s.readback, 0, D3D11_MAP_READ, 0, &mapped)))
    return false;
  const unsigned width = s.settings.out_width, height = s.settings.out_height;
  out.resize(std::size_t{width} * height * 3 / 2);
  const auto* source = static_cast<const unsigned char*>(mapped.pData);
  for (unsigned y = 0; y < height; ++y)
    std::memcpy(out.data() + std::size_t{y} * width, source + std::size_t{y} * mapped.RowPitch, width);
  // The UV rows follow the Y rows (the texture's own height, at the same pitch).
  for (unsigned y = 0; y < height / 2; ++y)
    std::memcpy(out.data() + std::size_t{width} * height + std::size_t{y} * width,
                source + std::size_t{mapped.RowPitch} * height + std::size_t{y} * mapped.RowPitch, width);
  s.context->Unmap(s.readback, 0);
  return true;
}

void H264Encoder::Impl::close() noexcept {
  if (mft) {
    mft->ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, 0);
    mft->ProcessMessage(MFT_MESSAGE_NOTIFY_END_STREAMING, 0);
    IMFShutdown* shutdown = nullptr;
    if (SUCCEEDED(mft->QueryInterface(IID_PPV_ARGS(&shutdown)))) {
      shutdown->Shutdown();
      drop(shutdown);
    }
  }
  events.reset();
  drop(generator);
  drop(codec);
  if (mft)
    mft->ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, 0);
  drop(mft);
  drop(readback);
  for (auto& view : nv12_view)
    drop(view);
  for (auto& texture : nv12)
    drop(texture);
  drop(input_view);
  drop(input);
  drop(processor);
  drop(processor_enum);
  drop(video_context);
  drop(video_device);
  if (context) {
    context->ClearState();
    context->Flush();
  }
  drop(context);
  drop(manager);
  drop(device);
  if (mf_started)
    MFShutdown();
  mf_started = false;
  open = false;
  fatal = false;
  async = false;
  need_input = 0;
  failures = 0;
  last_time = -1;
  next = 0;
  last = Ring;
  sequence_header.clear();
  output_info = {};
}
}  // namespace polaris_cam::remote
