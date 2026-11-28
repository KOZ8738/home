// Polaris Cam: the cameras sent to the website's back office ("後台監看").
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
//
// One WebSocket to the relay (the website's CamRelay), opened from a link the
// back office gives out (https://host/live/cam/<token>, or a pilot's own
// https://host/live/cam/p/<pilot>/<token>), or, with no link at all, as the
// pilot Polaris Navdata on this PC is paired as (the automatic mode: its key,
// kept in %LOCALAPPDATA%\Polaris Navdata\cloud.json under this Windows user's
// DPAPI, buys a one-use ticket from POST /api/nav/ticket for
// /live/cam/pilot/ws?ticket=). Over it go a hello
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
  std::wstring path;   // "/live/cam/<token>/ws" or "/live/cam/p/<PILOT>/<token>/ws"
  bool secure = true;  // TLS; only 127.0.0.1 and localhost may go without
  bool local = false;  // 127.0.0.1 or localhost: no proxy
};
// https://host[:port]/live/cam/<token>, wss://.../live/cam/<token>[/ws], a
// pilot's own https://host[:port]/live/cam/p/<pilot>/<token>[/ws] (pilot 2 to
// 16 letters and digits, upper-cased in path), and for a test on this computer
// http:// or ws:// to 127.0.0.1 or localhost. Spaces around it are ignored.
// False when it is none of these (/live/cam/pilot is the automatic mode's,
// with a ticket: never a link).
bool parse_url(std::wstring_view text, Endpoint& out);

// --- the automatic mode: as the pilot Polaris Navdata is paired as -------------
inline constexpr wchar_t DefaultNavdataServer[] = L"https://efb-api.koz8738.com";
// %LOCALAPPDATA%\Polaris Navdata\cloud.json (where tools/polaris-navdata keeps
// its pairing); empty when LOCALAPPDATA is not set.
std::wstring default_navdata_cloud_path();
// The EFB server a pairing may send its key to: https:// to koz8738.com or a
// name under it, or, for a test on this computer, http(s):// to 127.0.0.1 or
// localhost (with a port). Nothing after the host but one "/". False for any
// other: the key never goes anywhere else.
bool parse_navdata_server(std::wstring_view text, Endpoint& out);
// nk.<base64url>.<base64url>, as Polaris Navdata takes it.
bool navdata_key_ok(std::string_view key);
// The pilot the key is for: "u" of its middle part (base64url JSON), upper
// case, 2 to 16 letters and digits; empty when it has none such.
std::string navdata_key_pilot(std::string_view key);
// A pilot's name as shown and sent: 2 to 16 ASCII letters and digits, upper
// case; empty when it is not one.
std::string pilot_name(std::string_view text);
// A WebSocket ticket: 16 to 512 of [A-Za-z0-9_.-].
bool ticket_ok(std::string_view ticket);
// pilot of {"t":"id","pilot":"..."} (the relay's word on who this is), as
// pilot_name; empty for any other message.
std::string id_pilot(std::string_view message);
// Standard (url false) or base64url (url true) to bytes; padding optional,
// whitespace skipped. False on anything else.
bool base64_decode(std::string_view text, std::vector<unsigned char>& out, bool url);

// A pairing as read from cloud.json. The key is the pilot's: never logged,
// zeroed when this goes.
struct NavdataPairing {
  std::string key;     // nk.<payload>.<signature>
  std::string pilot;   // navdata_key_pilot(key), maybe empty
  Endpoint server;     // the EFB server (its path unused)
  NavdataPairing() = default;
  NavdataPairing(const NavdataPairing&) = delete;
  NavdataPairing& operator=(const NavdataPairing&) = delete;
  ~NavdataPairing();
  void clear() noexcept;
};
enum class PairingRead {
  ok,
  missing,  // no file (not paired, or unpaired)
  invalid,  // there, but not a pairing this can use (not JSON, no key, DPAPI refused, another server)
};
// cloud.json: {"key":"<base64 of a CurrentUser DPAPI blob of the key's UTF-8>",
// "enc":true, "server":"https://...", ...}; with "enc" false or not there,
// key is the key itself. server not there: DefaultNavdataServer.
PairingRead read_navdata_pairing(const std::wstring& path, NavdataPairing& out);
// When and how big a file was last written: a pairing refused (401) is read
// again only once this changes.
struct FileStamp {
  bool exists = false;
  std::uint64_t write_time = 0, size = 0;
  bool operator==(const FileStamp&) const = default;
};
FileStamp file_stamp(const std::wstring& path);

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
  no_url,       // (no longer: ticked without a link is the automatic mode)
  invalid_url,  // the link is not one parse_url takes
  connecting,
  retrying,  // the connection went or did not open (or, automatic, the ticket): trying again soon
  connected,
  expired,   // the relay closed with 4004 (or refused the link), or, automatic, the server
             // refused Navdata's key (401): not tried again (automatic: until cloud.json changes)
  replaced,  // the relay closed with 4000, another Polaris Cam took over: not tried again
  not_paired,  // automatic, and no pairing in cloud.json that can be used: looked at again every pair_poll_ms
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
  // The automatic mode (no link): Navdata's pairing, empty for
  // default_navdata_cloud_path(); how often it is looked at again while there
  // is none (or it was refused); the wait after the relay refused a ticket (4001)
  // before a fresh one (the first time; again at once, the waits above).
  std::wstring navdata_cloud_path;
  unsigned pair_poll_ms = 10000;
  unsigned ticket_retry_ms = 200;
};

class RemoteStream {
 public:
  RemoteStream() = default;
  explicit RemoteStream(const Options& options) : options_(options) {}
  ~RemoteStream();
  RemoteStream(const RemoteStream&) = delete;
  RemoteStream& operator=(const RemoteStream&) = delete;

  // On or off, and the link. Connects again only when either changed. On with
  // no link (or only spaces): the automatic mode, as Polaris Navdata's pilot.
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
  // On without a link: as Polaris Navdata's pilot.
  bool auto_mode() const noexcept { return auto_.load(); }
  // The pilot: as the relay said ({"t":"id"}), or else as Navdata's key says
  // (the automatic mode's); empty when neither.
  std::wstring pilot();
  // POST /api/nav/ticket answered so far (the automatic mode's).
  unsigned tickets() const noexcept { return tickets_.load(); }
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
  // POST /api/nav/ticket's answer: http 0 when there was none (the network, a
  // wait run out, or cut); ticket only with 200 and one ticket_ok takes.
  struct Ticket {
    DWORD http = 0;
    std::string ticket;
    Ticket() = default;
    Ticket(const Ticket&) = delete;
    Ticket& operator=(const Ticket&) = delete;
    ~Ticket();
  };
  void start(const Endpoint& endpoint);
  void run(Endpoint endpoint);
  void run_link(const Endpoint& endpoint);  // a link's: as it always was
  void run_auto();                          // no link: as Navdata's pilot
  void pause(unsigned ms);                  // a wait that stop() ends
  // The session, connection and request to endpoint (its path), where stop()
  // can cut them. False when no session could be opened (or stop() came
  // first); request (an HINTERNET) null when the rest could not be.
  bool open_request(const Endpoint& endpoint, const wchar_t* verb, void*& request);
  void fetch_ticket(const NavdataPairing& pairing, Ticket& out);
  void set_key_pilot(const std::string& pilot);
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
  std::atomic<bool> auto_{false};
  std::atomic<unsigned> tickets_{0};
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
  std::string key_pilot_;    // the automatic mode's pilot, as Navdata's key says
  std::string relay_pilot_;  // as the relay said ({"t":"id"})
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
