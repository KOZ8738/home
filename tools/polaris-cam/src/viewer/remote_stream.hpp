// Polaris Cam: the cameras sent to the website's back office ("後台監看").
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
//
// One WebSocket to the relay (the website's CamRelay), opened from a link the
// back office gives out (https://host/live/cam/<token>). Over it go a hello
// that lists the cameras, a "ping" every 25 s, and, only while someone in the
// back office watches, each camera at most 960 x 540: as H.264 from the
// graphics card's own encoder, up to 30 a second (h264_encoder.hpp), or, where
// there is none or it fails, as JPEG pictures, about five a second. Nothing of
// it runs on the window's thread but the copy of a picture out of the GPU,
// which never waits for the GPU (maybe_capture).
//
// A picture message is a 16-byte header (write_header) and the picture's bytes.
// Each camera has one place for the picture taken: a new one is only taken once
// the one before has gone on. A JPEG is made from it when it is its turn to be
// sent, so a slow network drops JPEG pictures and never queues them. H.264
// pictures are made on the camera's own thread as they come and wait in the
// camera's queue (at most 30, about a second, and 512 KB): one that would not
// fit empties the queue, and nothing more is sent of that camera until the
// key picture asked for at once has come, so the back office never gets a
// picture it cannot decode.
#pragma once
#include <d3d11_1.h>
#include <windows.h>
#include <array>
#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <mutex>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

namespace polaris_cam::remote {
inline constexpr unsigned Cams = 4;
inline constexpr std::size_t HeaderSize = 16;
inline constexpr unsigned MaximumWidth = 960;  // wider pictures are halved (2 x 2 average)
inline constexpr std::size_t MaximumMessage = 1u << 20;  // header and picture, as the relay takes them

enum class Codec : unsigned char { jpeg = 1, h264 = 2 };

// Where a link from the back office connects to.
struct Endpoint {
  std::wstring host;  // lower case
  unsigned short port = 0;
  std::wstring path;   // "/live/cam/<token>/ws"
  bool secure = true;  // TLS; only 127.0.0.1 and localhost may go without
  bool local = false;  // 127.0.0.1 or localhost: no proxy
};
// https://host[:port]/live/cam/<token>, wss://.../live/cam/<token>[/ws], and
// for a test on this computer http:// or ws:// to 127.0.0.1 or localhost.
// Spaces around it are ignored. False when it is none of these.
bool parse_url(std::wstring_view text, Endpoint& out);

// The 16 bytes before a picture: 'P', version 1, camera, codec (1 JPEG, 2 H.264
// Annex-B), flags (1: key picture; a JPEG always is), 0, width, height, its
// nominal duration in ms (16-bit), sequence (32-bit), all little-endian.
void write_header(unsigned char* out,
                  unsigned cam,
                  Codec codec,
                  bool key,
                  unsigned width,
                  unsigned height,
                  unsigned duration_ms,
                  std::uint32_t seq) noexcept;

// A camera as the hello names it.
struct CamInfo {
  bool on = false;
  std::wstring name;
  unsigned width = 0, height = 0;  // the size sent (output_size)
  Codec codec = Codec::jpeg;       // how it is sent (RemoteStream fills it in)
};
std::string utf8(std::wstring_view text);
std::string json_escape(std::string_view text);
// mode "h264" when a camera that is on goes as H.264 (or, none on, any does).
std::string hello_json(const std::array<CamInfo, Cams>& cams);
// The value of "key" in a flat JSON object: a string's text (escapes left as
// they are) or a number's characters. Empty when it is not there.
std::string_view json_field(std::string_view message, std::string_view key);
// n of {"t":"watch","n":<n>}; -1 for any other message.
int watch_count(std::string_view message);
// cam of {"t":"key","cam":<0..3>} (a key picture of it, now); -1 for any other message.
int key_request(std::string_view message);

// The size a picture is sent at: halved while wider than MaximumWidth.
void output_size(unsigned width, unsigned height, unsigned& out_width, unsigned& out_height) noexcept;
// 32-bit BGRA rows to 24-bit BGR at output_size, averaging 2 x 2 when halved.
void shrink_to_bgr(const unsigned char* bgra,
                   unsigned width,
                   unsigned height,
                   std::size_t stride,
                   std::vector<unsigned char>& out,
                   unsigned& out_width,
                   unsigned& out_height);

enum class State {
  off,          // not ticked
  no_url,       // ticked without a link
  invalid_url,  // the link is not one parse_url takes
  connecting,
  retrying,  // the connection went or did not open: trying again soon
  connected,
  expired,   // the relay closed with 4004 (or refused the link): not tried again
  replaced,  // the relay closed with 4000, another Polaris Cam took over: not tried again
};

struct Options {
  unsigned ping_ms = 25000;
  unsigned frame_interval_ms = 200;  // per camera, as JPEG
  unsigned h264_interval_ms = 33;    // per camera, as H.264 (the bridge's own rate, at most 30 fps)
  bool prefer_h264 = true;           // false: JPEG only
  unsigned h264_bitrate = 0;         // 0: h264_bitrate (2.0 Mbit/s at 960 x 540)
  unsigned queue_frames = 30;        // a camera's H.264 waiting to be sent: about 1 s
  std::size_t queue_bytes = 512 * 1024;
  unsigned fail_h264_after = 0;  // for the test: an encoder failure after this many pictures (0 never)
  unsigned silence_ms = 70000;       // nothing heard for this long: the connection is gone
  unsigned first_retry_ms = 1000, last_retry_ms = 15000;
};

class RemoteStream {
 public:
  RemoteStream() = default;
  explicit RemoteStream(const Options& options) : options_(options) {}
  ~RemoteStream();
  RemoteStream(const RemoteStream&) = delete;
  RemoteStream& operator=(const RemoteStream&) = delete;

  // On or off, and the link. Connects again only when either changed.
  void configure(bool enabled, std::wstring_view url);
  // The cameras the hello lists; it is sent again when they change.
  void set_cams(const std::array<CamInfo, Cams>& cams);
  // The simulator's graphics card: the H.264 encoders open on it.
  void set_adapter(LUID adapter);
  // Called after a camera's picture went to its windows. Copies it to a
  // CPU-readable texture when the camera's turn has come (watched, connected,
  // its interval passed, its picture before sent), and reads that copy on a
  // later call, once the GPU has made it, into the camera's place.
  void maybe_capture(unsigned cam,
                     ID3D11Device* device,
                     ID3D11DeviceContext* context,
                     ID3D11Texture2D* texture,
                     UINT width,
                     UINT height,
                     std::uint64_t now);
  // Whether a picture of this camera would be taken now.
  bool wants_frame(unsigned cam, std::uint64_t now);
  // A picture in memory into the camera's place (what maybe_capture does once
  // it has read the copy). False when it is not wanted.
  bool submit_bgra(unsigned cam, const unsigned char* bgra, unsigned width, unsigned height, std::size_t stride, std::uint64_t now);
  // Before the Direct3D device goes: the copies made on it.
  void release_gpu();
  // Each pass of the window: the copies the GPU has made since, read without
  // waiting for the camera's next picture (which at 5 fps is 200 ms away).
  void poll(ID3D11Device* device, ID3D11DeviceContext* context);
  void stop();

  State state() const noexcept { return state_.load(); }
  int watchers() const noexcept { return watchers_.load(); }
  std::uint64_t frames_sent() const noexcept { return frames_sent_.load(); }
  std::uint64_t bytes_sent() const noexcept { return bytes_sent_.load(); }
  unsigned connections() const noexcept { return connections_.load(); }
  // How a camera goes now.
  Codec codec(unsigned cam);
  struct H264Stats {
    std::uint64_t keyframes_sent = 0;
    std::uint64_t queue_overflows = 0;  // times a camera's queue was emptied
    std::uint64_t frames_dropped = 0;   // H.264 pictures not sent (emptied, or waiting for a key picture)
    std::uint64_t key_requests = 0;     // asked of the encoders (relay, overflow, new connection or viewer)
    std::uint64_t encoders_opened = 0, fallbacks = 0;
    unsigned encoders_open = 0;  // now (each holds a session of the card's encoder)
    unsigned queue_peak_frames = 0;
    std::size_t queue_peak_bytes = 0;
    double encode_ms_average = 0, encode_ms_max = 0;
    std::wstring encoder;  // the card and the encoder last opened
    std::wstring fallback_reason;
  };
  H264Stats h264_stats();
  // The line under the link, e.g. 遠端：傳送中（1 人｜H.264｜29.8 fps｜240 KB/s）.
  std::wstring status_text(std::uint64_t now);

 private:
  struct Slot {
    std::vector<unsigned char> pixels;  // BGR (JPEG, at the size sent) or BGRA (H.264, as taken)
    unsigned width = 0, height = 0;
    bool bgra = false;
    unsigned width_sent = 0, height_sent = 0;  // the H.264's (the encoder's output)
    bool full = false;  // waiting to be sent
    std::uint64_t taken_ms = 0;
    double due_ms = 0;  // the next may be taken from then (less a little)
    bool taken = false;
    std::uint32_t seq = 0;  // the last sent; never reset, so a viewer never sees it go back
  };
  struct Packet {
    std::vector<unsigned char> message;  // header and Annex-B
    bool key = false;
  };
  struct Queue {
    std::deque<Packet> packets;
    std::size_t bytes = 0;
    bool drop_until_key = false;
  };
  struct Gpu {
    ID3D11Texture2D* staging = nullptr;
    ID3D11Device* device = nullptr;  // compared only, not held
    UINT width = 0, height = 0;
    bool pending = false;  // copied, not read yet
    std::uint64_t copied_ms = 0;
  };
  struct Outcome {
    bool upgraded = false;
    DWORD http = 0;
    unsigned close = 0;
    std::uint64_t lasted_ms = 0;
  };
  void start(const Endpoint& endpoint);
  void run(Endpoint endpoint);
  Outcome connect_once(const Endpoint& endpoint);
  void receive(void* socket);  // HINTERNET (winhttp.h stays out of this header)
  void handle_text(std::string_view message);
  void abort_handles();
  void encode_loop(unsigned cam);
  bool h264_needed_locked(unsigned cam) const;
  bool push_locked(unsigned cam, const std::vector<unsigned char>& data, bool key);  // true: a key picture is wanted
  void restart_h264_locked();  // a new connection or viewer: nothing until a key picture
  void fall_back_locked(unsigned cam, const std::wstring& why);
  void build_hello_locked();
  double interval_locked(unsigned cam) const;
  void set_state(State state) noexcept { state_.store(state); }
  bool stopping() const noexcept { return stop_.load(); }
  bool wants_locked(unsigned cam, std::uint64_t now) const;
  bool sending() const noexcept;
  void read_copy(unsigned cam, ID3D11DeviceContext* context);
  bool store(unsigned cam,
             const unsigned char* bgra,
             unsigned width,
             unsigned height,
             std::size_t stride,
             std::uint64_t taken_ms,
             bool take);
  void take_locked(unsigned cam, std::uint64_t now);

  Options options_{};
  std::atomic<State> state_{State::off};
  std::atomic<int> watchers_{0};
  std::atomic<std::uint64_t> frames_sent_{0}, bytes_sent_{0};
  std::atomic<unsigned> connections_{0};
  std::atomic<bool> stop_{false};
  std::atomic<std::uint64_t> heard_ms_{0};
  bool enabled_ = false;
  std::wstring url_;
  std::thread worker_;
  std::array<std::thread, Cams> encoders_;

  std::mutex mutex_;  // everything below, and the handles
  std::condition_variable wake_;
  std::array<Slot, Cams> slots_{};
  std::array<Queue, Cams> queues_{};
  std::array<CamInfo, Cams> cams_{};
  std::array<Codec, Cams> codecs_{};
  std::array<bool, Cams> h264_failed_{};
  std::array<bool, Cams> key_wanted_{};
  bool h264_available_ = true;  // a hardware encoder is there (asked once a start)
  bool has_adapter_ = false;
  LUID adapter_{};
  H264Stats h264_{};
  std::uint64_t encode_calls_ = 0;
  std::string hello_;
  bool hello_dirty_ = false;
  bool received_done_ = false;
  bool unwatched_ = false;  // watchers went to 0: drop what waits
  bool finished_ = false;   // the worker has ended
  unsigned close_code_ = 0;
  void* session_ = nullptr;  // HINTERNET, as the rest
  void* connection_ = nullptr;
  void* request_ = nullptr;
  void* socket_ = nullptr;

  // The window's thread only.
  std::array<Gpu, Cams> gpu_{};
  std::vector<unsigned char> scratch_;
  std::uint64_t rate_ms_ = 0, rate_frames_ = 0, rate_bytes_ = 0;
  double fps_ = 0, bytes_per_second_ = 0;
};
}  // namespace polaris_cam::remote
