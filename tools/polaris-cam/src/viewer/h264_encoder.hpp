// Polaris Cam: a camera's pictures as H.264, made by the graphics card (Media Foundation).
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
//
// One H264Encoder per camera, on that camera's own thread (remote_stream.cpp),
// opened only while someone in the back office watches. It has a Direct3D 11
// device of its own on the simulator's graphics card (or, not told which, the
// one with the most memory of its own), never the window's. A picture goes in
// as 32-bit BGRA rows (encode_bgra), up to that device, through its video
// processor into NV12 (BT.709, 16..235) at the size sent, and into the card's
// own H.264 encoder (an asynchronous hardware MFT: no software encoder is ever
// used; without a hardware one open() is false and the camera goes as JPEG).
//
// What comes out is Annex-B: low latency, no B pictures, constant bit rate,
// a key picture every 60 (2 s at 30 fps) or when asked (request_keyframe).
// Every key picture carries its SPS and PPS: when the encoder leaves them out
// they are put in front from the stream's sequence header.
#pragma once
#include <windows.h>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace polaris_cam::remote {
// The NAL units of an Annex-B buffer, by type: 5 IDR slice, 1 other slice, 7 SPS, 8 PPS.
struct NalScan {
  bool idr = false, slice = false, sps = false, pps = false;
  unsigned count = 0;
};
NalScan scan_nals(const unsigned char* data, std::size_t size) noexcept;
// Only the SPS and PPS units of an Annex-B buffer, each with a 4-byte start code.
std::vector<unsigned char> parameter_sets(const unsigned char* data, std::size_t size);
// A picture as sent: true when it is a key picture (has an IDR slice). An IDR
// without its SPS or PPS gets sequence_header (Annex-B SPS + PPS) in front,
// after an access unit delimiter when it starts with one.
bool complete_key_frame(std::vector<unsigned char>& frame, const std::vector<unsigned char>& sequence_header);
// The bit rate for a size: 2.0 Mbit/s at 960 x 540, 1.2 at 640 x 360, by area between and beyond.
unsigned h264_bitrate(unsigned width, unsigned height) noexcept;
// Whether this computer has a hardware H.264 encoder at all (none is opened).
// COM has to be set up on the calling thread.
bool hardware_h264_available();

struct EncodedFrame {
  std::vector<unsigned char> data;  // Annex-B
  bool key = false;
  std::uint64_t time_ms = 0;  // the picture's, as given to encode_bgra
};

struct EncoderSettings {
  unsigned in_width = 0, in_height = 0;    // the BGRA pictures given
  unsigned out_width = 0, out_height = 0;  // the H.264 (even)
  unsigned fps = 30;
  unsigned bitrate = 0;  // 0: h264_bitrate
  unsigned gop = 60;
  bool has_adapter = false;  // the simulator's graphics card, when known
  LUID adapter{};
};

struct EncoderStats {
  std::uint64_t inputs = 0, outputs = 0, keyframes = 0, forced_keys = 0, headers_added = 0;
  double call_ms_total = 0, call_ms_max = 0;  // encode_bgra, upload to output taken
  HRESULT b_frames = S_OK;  // what the encoder said to "no B pictures" (E_INVALIDARG on NVIDIA: not fatal)
};

class H264Encoder {
 public:
  H264Encoder();
  ~H264Encoder();
  H264Encoder(const H264Encoder&) = delete;
  H264Encoder& operator=(const H264Encoder&) = delete;

  // False when there is no hardware encoder or it would not open (last_error says why).
  bool open(const EncoderSettings& settings);
  void close() noexcept;
  bool is_open() const noexcept;
  // The next picture given is made a key picture (IDR, with SPS and PPS).
  void request_keyframe() noexcept;
  // One picture of the open size. What the encoder has finished (usually this
  // picture) is added to out. False when the encoder failed (a hardware error,
  // or it stopped answering): it is then closed and of no further use.
  bool encode_bgra(const unsigned char* bgra,
                   unsigned in_width,
                   unsigned in_height,
                   std::size_t stride,
                   std::uint64_t time_ms,
                   std::vector<EncodedFrame>& out);
  // The NV12 the last picture became (Y rows, then UV rows), read back: for the test.
  bool last_nv12(std::vector<unsigned char>& out);

  const std::wstring& description() const noexcept;  // the card and the encoder
  const std::wstring& last_error() const noexcept;
  const EncoderStats& stats() const noexcept;
  const std::vector<unsigned char>& sequence_header() const noexcept;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
}  // namespace polaris_cam::remote
