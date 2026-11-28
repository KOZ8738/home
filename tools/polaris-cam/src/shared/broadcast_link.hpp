// Polaris Cam: the link between the bridge inside MSFS and the Polaris Cam window.
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built into.
#pragma once
#include <windows.h>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>

namespace polaris_cam {
// One shared-memory block. The window writes Control, the bridge writes Status.
// Camera pictures never pass through it: each camera has three GPU textures
// (shared by name, see texture_name) and Status says which one holds the
// newest complete picture. Each LinkVersion has a block of its own, under
// its own name: a window and a bridge of different versions never share one,
// and the window can still see a bridge of an earlier version (older_bridge).
inline constexpr wchar_t LinkName[] = L"Local\\PolarisCam.Link.4";
// Set by the bridge each time a camera has a new picture (auto-reset), so the
// window need not poll for it.
inline constexpr wchar_t FrameEventName[] = L"Local\\PolarisCam.Frame.4";
// The prototype's own version, beside the Taxi Cam version it is built on.
#define POLARIS_CAM_VERSION "0.2.0"
#define POLARIS_CAM_VERSION_WIDE L"0.2.0"
inline constexpr std::uint32_t LinkMagic = 0x4D434C50;  // "PLCM"
// Each version's block is "Local\PolarisCam.Link.<version>".
// 1: 0.1.0 and 0.1.1, and the 0.1.0 builds with the guarded status text
// (their Status::protocol is 2, but they share block 1 with 0.1.0).
// 2: 0.1.2, the memory guard and the bridge's own version.
// 3: 0.1.3 to 0.1.5, the cameras' draw distance and the anti-aliasing.
// 4: 0.2.0: Status::message is 156 bytes and text_serial guards aircraft and
// message (write_status_text / read_status_text).
inline constexpr std::uint32_t LinkVersion = 4;
inline constexpr unsigned Feeds = 4;  // Taxi Cam's four camera views
inline constexpr unsigned Slots = 3;  // textures per camera: newest, being read, being written
inline constexpr std::uint32_t NoSlot = Slots;
inline constexpr std::uint64_t ControlStaleMs = 5000;  // a window that stopped writing is off
inline constexpr unsigned MinimumFps = 5, MaximumFps = 60, DefaultFps = 30;
// How far the cameras draw, in metres: 0 is as far as the main view (MSFS
// 2024 draws about 357 km). Nearer, the views have less scenery to cull,
// draw and keep: terrain, objects and clouds end there.
inline constexpr std::uint32_t MinimumDrawDistanceM = 1000, MaximumDrawDistanceM = 400000;

// right, up, forward in metres from the aircraft's reference point; pitch and
// yaw in degrees (yaw 0 looks forward, 90 right, 180 aft); fov in radians.
using Mount = std::array<double, 6>;

// The two picture sizes. The camera view itself is rendered two rows shorter
// (pane_height), so that it is never the size of one of the simulator's own
// full-screen textures, which the bridge would then have to watch as well;
// the top and bottom row are repeated in the picture that is sent.
inline constexpr bool valid_size(std::uint32_t width, std::uint32_t height) noexcept {
  return (width == 1280 && height == 720) || (width == 1920 && height == 1080);
}
inline constexpr std::uint32_t PaneTrim = 2;
inline constexpr std::uint32_t pane_height(std::uint32_t height) noexcept {
  return height - PaneTrim;
}
// Packed pane for the profile (0: no broadcast): width in the high half.
inline constexpr std::uint32_t pane_code(std::uint32_t width, std::uint32_t height) noexcept {
  return valid_size(width, height) ? (width << 16) | pane_height(height) : 0u;
}

struct Control {
  // Odd while the window is writing; the bridge reads until it sees the same
  // even value before and after.
  LONG serial;
  std::uint32_t enabled;
  std::uint32_t width, height;  // valid_size
  std::uint32_t fps;            // pictures per second, per camera
  std::uint32_t feed_mask;      // bit per camera that renders
  std::uint32_t use_mounts;     // 1: mounts below instead of Taxi Cam's own
  std::uint32_t memory_guard;   // 1: the cameras pause while graphics memory runs out (MemoryGuard)
  std::uint32_t draw_distance_m;  // MinimumDrawDistanceM..MaximumDrawDistanceM, or 0
  std::uint32_t antialias;        // 1: FXAA over the pictures (0.1.5; 0 from a window before it)
  std::uint64_t heartbeat_ms;  // the window's GetTickCount64
  double mounts[Feeds][6];
};
struct FeedStatus {
  // Names this camera's textures (texture_name); 0 while it has none. A new
  // size makes new textures under a new generation.
  LONG generation;
  std::uint32_t width, height;
  std::uint32_t state;  // FeedState
  // (pictures so far << 8) | slot of the newest complete one. One 64-bit
  // write, so a reader never sees a count without its slot.
  LONG64 published;
  // The slot the window is copying from, written by the window; the bridge
  // never writes into it or into the newest one.
  LONG reading;
  std::uint32_t reserved;
  std::uint64_t published_ms;  // GetTickCount64 of the newest picture
};
enum FeedState : std::uint32_t { feed_off, feed_waiting, feed_live, feed_failed };
enum LinkState : std::uint32_t {
  link_idle,       // bridge loaded, broadcast off
  link_waiting,    // broadcast asked for, no picture yet (see reason)
  link_live,       // pictures are being sent
  link_not_ready,  // the cameras cannot run now (see reason)
};
// Why there is no picture; the window words it.
enum LinkReason : std::uint32_t {
  reason_none,
  reason_not_connected,  // Taxi Cam's window is not connected to the simulator
  reason_loading,        // the flight is loading
  reason_aircraft,       // the aircraft has no setup in Taxi Cam
  reason_stalled,        // the simulator stalled and the cameras were stopped
  reason_starting,       // the cameras are being created
  reason_resizing,       // the cameras are changing size
  reason_failed,         // the cameras could not be started (message says why)
  reason_memory,         // the memory guard paused the cameras (memory_mb, memory_budget_mb)
};
enum GuardState : std::uint32_t {
  guard_off,       // not broadcasting, or the window has the guard off
  guard_watching,  // the cameras run; the guard watches the readings
  guard_paused,    // the cameras are paused until there is room again
};
struct Status {
  std::uint64_t heartbeat_ms;  // the bridge's GetTickCount64, about every 25 ms
  std::uint32_t pid;           // FlightSimulator2024.exe
  std::uint32_t state;         // LinkState
  std::uint32_t reason;        // LinkReason
  std::uint32_t protocol;      // LinkVersion of the bridge that writes this
  LUID adapter;                // the GPU the simulator renders on
  float sim_fps;               // simulator frames per second
  float view_ms;               // frame time one camera picture costs; 0 unknown
  std::uint32_t fps;           // pictures per second per camera in force
  std::uint32_t feed_mask;     // cameras that render
  // The simulator process's graphics memory on its card, and the budget
  // Windows gives it, in MiB; 0 while there is no reading.
  std::uint32_t memory_mb, memory_budget_mb;
  std::uint32_t guard;         // GuardState
  char version[16];            // POLARIS_CAM_VERSION of the bridge
  // aircraft and message are written together by write_status_text and read
  // by read_status_text: text_serial is odd while the bridge writes them, so
  // the window never acts on half of one path and half of the next.
  char aircraft[260];          // AircraftLoaded path
  char message[156];
  LONG text_serial;
  FeedStatus feeds[Feeds];
};
// text_serial took the last four bytes of 0.1.5's message[160]: the feeds
// stay where they were.
static_assert(offsetof(Status, aircraft) == 76 && offsetof(Status, message) == 336 && offsetof(Status, text_serial) == 492 &&
                  offsetof(Status, feeds) == 496,
              "Status text layout");
struct Link {
  std::uint32_t magic, version;
  Control control;
  Status status;
};

// Where the bridge of each earlier version writes its heartbeat and process
// id: right after its Control, at the start of its Status. A version that
// changes the size of Control adds its own line when the next one is made.
struct OlderLink {
  std::uint32_t version;
  std::size_t heartbeat, pid;  // offsets in its block
};
inline constexpr OlderLink OlderLinks[]{
    {1, 240, 248},  // 0.1.0, 0.1.1 (and 0.1.0 with the guarded text): Control of 232 bytes
    {2, 240, 248},  // 0.1.2: memory_guard took a reserved word, Control still 232 bytes
    {3, 248, 256},  // 0.1.3 to 0.1.5: draw_distance_m and antialias, Control of 240 bytes
};
static_assert(std::size(OlderLinks) == LinkVersion - 1);
// Version 3's Control is this one's (0.2.0 changed only Status), so its line
// is this version's own offsets.
static_assert(sizeof(Control) == 240 && offsetof(Link, status) == 248 && offsetof(Status, heartbeat_ms) == 0 &&
                  offsetof(Status, pid) == 8,
              "this version's heartbeat, for the line the next version adds");

// "Local\PolarisCam.<pid>.<generation>.<feed><slot>"
inline void texture_name(wchar_t* out, std::size_t count, std::uint32_t pid, std::uint32_t generation, unsigned feed, unsigned slot) noexcept {
  std::swprintf(out, count, L"Local\\PolarisCam.%lu.%lu.%u%u", static_cast<unsigned long>(pid), static_cast<unsigned long>(generation), feed,
                slot);
}

// Either side opens the block; the first one creates it, zeroed.
class LinkMapping {
 public:
  LinkMapping() = default;
  LinkMapping(const LinkMapping&) = delete;
  LinkMapping& operator=(const LinkMapping&) = delete;
  ~LinkMapping() { close(); }
  bool open() noexcept {
    if (link_)
      return true;
    mapping_ = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, sizeof(Link), LinkName);
    if (!mapping_)
      return false;
    const bool created = GetLastError() != ERROR_ALREADY_EXISTS;
    link_ = static_cast<Link*>(MapViewOfFile(mapping_, FILE_MAP_READ | FILE_MAP_WRITE, 0, 0, sizeof(Link)));
    if (!link_) {
      close();
      return false;
    }
    if (created || link_->magic != LinkMagic || link_->version != LinkVersion) {
      // Only a block nobody initialised: both sides write the same two words.
      link_->magic = LinkMagic;
      link_->version = LinkVersion;
    }
    return true;
  }
  void close() noexcept {
    if (link_)
      UnmapViewOfFile(link_);
    if (mapping_)
      CloseHandle(mapping_);
    link_ = nullptr;
    mapping_ = nullptr;
  }
  Link* get() const noexcept { return link_; }
  explicit operator bool() const noexcept { return link_ != nullptr; }

 private:
  HANDLE mapping_ = nullptr;
  Link* link_ = nullptr;
};

// Whether the other side wrote its heartbeat within the last limit_ms. Both
// sides read the same clock (GetTickCount64), but not at the same moment: a
// heartbeat written just after now_ms was read is later than now_ms, and is
// as fresh as can be.
inline constexpr bool fresh_heartbeat(std::uint64_t heartbeat_ms, std::uint64_t now_ms, std::uint64_t limit_ms) noexcept {
  return heartbeat_ms != 0 && (heartbeat_ms >= now_ms || now_ms - heartbeat_ms <= limit_ms);
}
inline constexpr std::uint64_t StatusStaleMs = 3000;  // a bridge that stopped writing is gone
// The LinkVersion of a bridge of an earlier version that is running in the
// simulator (one loaded before the files were replaced), or 0.
inline std::uint32_t older_bridge(std::uint64_t now_ms) noexcept {
  for (const auto& older : OlderLinks) {
    wchar_t name[48];
    std::swprintf(name, 48, L"Local\\PolarisCam.Link.%u", static_cast<unsigned>(older.version));
    HANDLE mapping = OpenFileMappingW(FILE_MAP_READ, FALSE, name);
    if (!mapping)
      continue;
    bool running = false;
    if (const auto* block = static_cast<const unsigned char*>(MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, older.pid + 4))) {
      std::uint32_t magic = 0, pid = 0;
      std::uint64_t heartbeat = 0;
      std::memcpy(&magic, block, sizeof(magic));
      std::memcpy(&heartbeat, block + older.heartbeat, sizeof(heartbeat));
      std::memcpy(&pid, block + older.pid, sizeof(pid));
      running = magic == LinkMagic && pid != 0 && fresh_heartbeat(heartbeat, now_ms, StatusStaleMs);
      UnmapViewOfFile(block);
    }
    CloseHandle(mapping);
    if (running)
      return older.version;
  }
  return 0;
}
// What the bridge acts on: a complete, checked copy of Control.
struct Request {
  bool on = false;
  std::uint32_t width = 0, height = 0, fps = DefaultFps, feed_mask = 0;
  bool use_mounts = false;
  bool memory_guard = false;
  std::uint32_t draw_distance_m = 0;  // 0: as far as the main view
  bool antialias = false;
  std::array<Mount, Feeds> mounts{};
  std::uint32_t pane() const noexcept { return on ? pane_code(width, height) : 0u; }
};
inline constexpr double MaximumPitch = 89, MinimumFov = 0.05, MaximumFov = 1.55;
inline bool valid_mount(const double* m) noexcept {
  for (unsigned i = 0; i < 6; ++i)
    if (!std::isfinite(m[i]))
      return false;
  // Within Taxi Cam's own limits for a mount (aircraft_mounts.hpp), which
  // refuses a whole set when one camera's is outside them.
  return std::abs(m[0]) <= 200 && std::abs(m[1]) <= 200 && std::abs(m[2]) <= 200 && std::abs(m[3]) <= MaximumPitch &&
         std::abs(m[4]) <= 180 && m[5] >= MinimumFov && m[5] <= MaximumFov;
}
// False when the window is in the middle of a write (try again next pass).
inline bool read_control(const Link& link, std::uint64_t now_ms, Request& out) noexcept {
  Control copy;
  auto* serial = const_cast<LONG volatile*>(&link.control.serial);
  const LONG before = InterlockedCompareExchange(serial, 0, 0);
  if (before & 1)
    return false;
  std::memcpy(&copy, &link.control, sizeof(copy));
  if (InterlockedCompareExchange(serial, 0, 0) != before)
    return false;
  Request request;
  const bool fresh = fresh_heartbeat(copy.heartbeat_ms, now_ms, ControlStaleMs);
  request.on = fresh && copy.enabled == 1 && valid_size(copy.width, copy.height) && (copy.feed_mask & ((1u << Feeds) - 1)) != 0;
  request.width = copy.width;
  request.height = copy.height;
  request.fps = copy.fps < MinimumFps ? MinimumFps : copy.fps > MaximumFps ? MaximumFps : copy.fps;
  request.feed_mask = copy.feed_mask & ((1u << Feeds) - 1);
  request.use_mounts = copy.use_mounts == 1;
  request.memory_guard = copy.memory_guard == 1;
  request.draw_distance_m =
      copy.draw_distance_m >= MinimumDrawDistanceM && copy.draw_distance_m <= MaximumDrawDistanceM ? copy.draw_distance_m : 0;
  request.antialias = copy.antialias == 1;
  for (unsigned feed = 0; feed < Feeds; ++feed) {
    if (!valid_mount(copy.mounts[feed]))
      request.use_mounts = false;
    for (unsigned i = 0; i < 6; ++i)
      request.mounts[feed][i] = copy.mounts[feed][i];
  }
  out = request;
  return true;
}
// The window's side of the same handshake.
template <typename Write>
inline void write_control(Link& link, Write&& write) noexcept {
  InterlockedIncrement(&link.control.serial);
  write(link.control);
  InterlockedIncrement(&link.control.serial);
}
// The shape the bridge gives the camera views for a broadcast: the pane every
// ticked camera renders at, and those cameras; the others keep their own
// small size, and the memory a large view takes. Another shape takes the
// bridge's reshape transition, which stops every camera for a moment, so a
// new one is taken only once the window has asked for it for SettleMs:
// ticking three cameras in a row is one transition, not three. Off is taken
// at once.
struct Shape {
  std::uint32_t pane = 0, feeds = 0;
  friend bool operator==(const Shape&, const Shape&) = default;
};
class ShapeSettle {
 public:
  static constexpr std::uint64_t SettleMs = 700;
  Shape update(const Request& request, std::uint64_t now_ms) noexcept {
    const Shape asked = request.on ? Shape{request.pane(), request.feed_mask} : Shape{};
    if (!(asked == asked_)) {
      asked_ = asked;
      since_ms_ = now_ms;
    }
    if (!(applied_ == asked_) && (!asked_.pane || now_ms < since_ms_ || now_ms - since_ms_ >= SettleMs))
      applied_ = asked_;
    return applied_;
  }
  // The shape in force is the one asked for.
  bool settled() const noexcept { return applied_ == asked_; }

 private:
  Shape asked_, applied_;
  std::uint64_t since_ms_ = 0;
};
// The memory guard. Windows gives the simulator a budget of the card's
// memory; at the end of it the simulator has to push its own textures out to
// system memory, and frames wait for them. The camera views make it keep
// scenery for their directions as well, so close to the end the guard pauses
// the cameras until there is room again. They keep their size, their
// textures and their last pictures, so they carry on where they stopped.
// Free is the budget less what the simulator's process uses: MSFS, its
// add-ons and the cameras together. On a 16 GB card at a busy airport, MSFS
// alone keeps about 1 GB free; the first tests' frames slowed to a crawl
// below 0.8 GB with a camera on. Readings come once a second; between them
// the last one stands.
class MemoryGuard {
 public:
  static constexpr std::uint32_t PauseFreeMb = 800;     // pause with less than this free
  static constexpr std::uint32_t ResumeFreeMb = 1600;   // resume once this much is free
  static constexpr std::uint64_t ResumeHoldMs = 15000;  // and has been for this long
  // armed: broadcasting with the guard on. A budget of 0 is no reading: it
  // never pauses and ends a pause, as a guard that cannot see stands aside.
  GuardState update(bool armed, std::uint32_t used_mb, std::uint32_t budget_mb, std::uint64_t now_ms) noexcept {
    if (!armed || !budget_mb) {
      paused_ = room_ = false;
      return armed ? guard_watching : guard_off;
    }
    const std::uint32_t free_mb = used_mb < budget_mb ? budget_mb - used_mb : 0;
    if (!paused_) {
      paused_ = free_mb < PauseFreeMb;
      room_ = false;
    } else if (free_mb < ResumeFreeMb) {
      room_ = false;
    } else if (!room_) {
      room_ = true;
      room_ms_ = now_ms;
    } else if (now_ms < room_ms_ || now_ms - room_ms_ >= ResumeHoldMs) {
      paused_ = room_ = false;
    }
    return paused_ ? guard_paused : guard_watching;
  }
  bool paused() const noexcept { return paused_; }

 private:
  bool paused_ = false, room_ = false;
  std::uint64_t room_ms_ = 0;
};
// Whole-value reads and writes of the fields both sides touch.
inline LONG load(const LONG& value) noexcept {
  return InterlockedCompareExchange(const_cast<LONG volatile*>(&value), 0, 0);
}
inline LONG64 load(const LONG64& value) noexcept {
  return InterlockedCompareExchange64(const_cast<LONG64 volatile*>(&value), 0, 0);
}
inline void store(LONG& value, LONG next) noexcept {
  InterlockedExchange(&value, next);
}
inline void store(LONG64& value, LONG64 next) noexcept {
  InterlockedExchange64(&value, next);
}
// The bridge's side: aircraft (aircraft_size bytes, NUL-terminated or not)
// and message, as one change. nullptr keeps the aircraft already there. The
// bridge is the only writer of these fields, so it may read them back. Each
// write moves text_serial to the next odd value, then to the even one after
// it (4 -> 5 -> 6); an odd value left by a bridge that died mid-write is
// taken as the start of this write (7 -> 8). Nothing changes, nothing is
// written.
inline void write_status_text(Link& link, const char* aircraft, std::size_t aircraft_size, const char* message) noexcept {
  auto& s = link.status;
  char next_aircraft[sizeof(s.aircraft)]{};
  char next_message[sizeof(s.message)]{};
  if (aircraft) {
    const std::size_t length = strnlen(aircraft, aircraft_size < sizeof(next_aircraft) ? aircraft_size : sizeof(next_aircraft) - 1);
    std::memcpy(next_aircraft, aircraft, length);
  } else {
    std::memcpy(next_aircraft, s.aircraft, sizeof(next_aircraft));
    next_aircraft[sizeof(next_aircraft) - 1] = '\0';
  }
  std::snprintf(next_message, sizeof(next_message), "%s", message ? message : "");
  if ((load(s.text_serial) & 1) == 0 && std::memcmp(next_aircraft, s.aircraft, sizeof(next_aircraft)) == 0 &&
      std::memcmp(next_message, s.message, sizeof(next_message)) == 0)
    return;
  const LONG begin = load(s.text_serial) | 1;
  store(s.text_serial, begin);
  std::memcpy(s.aircraft, next_aircraft, sizeof(s.aircraft));
  std::memcpy(s.message, next_message, sizeof(s.message));
  store(s.text_serial, static_cast<LONG>(static_cast<ULONG>(begin) + 1u));  // wraps without overflow
}
// The window's side: false while the bridge is writing them or wrote them
// during the copy; the caller then keeps the last complete copy.
inline bool read_status_text(const Link& link, char (&aircraft)[sizeof(Status::aircraft)], char (&message)[sizeof(Status::message)]) noexcept {
  const LONG before = load(link.status.text_serial);
  if (before & 1)
    return false;
  char copy_aircraft[sizeof(aircraft)], copy_message[sizeof(message)];
  std::memcpy(copy_aircraft, link.status.aircraft, sizeof(copy_aircraft));
  std::memcpy(copy_message, link.status.message, sizeof(copy_message));
  if (load(link.status.text_serial) != before)
    return false;
  copy_aircraft[sizeof(copy_aircraft) - 1] = '\0';
  copy_message[sizeof(copy_message) - 1] = '\0';
  std::memcpy(aircraft, copy_aircraft, sizeof(aircraft));
  std::memcpy(message, copy_message, sizeof(message));
  return true;
}
inline std::uint64_t publication(std::uint64_t frames, unsigned slot) noexcept {
  return (frames << 8) | (slot & 0xffu);
}
inline unsigned published_slot(std::uint64_t value) noexcept {
  return static_cast<unsigned>(value & 0xffu);
}
inline std::uint64_t published_frames(std::uint64_t value) noexcept {
  return value >> 8;
}
}  // namespace polaris_cam
