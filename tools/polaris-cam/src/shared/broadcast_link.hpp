// Polaris Cam: the link between the bridge inside MSFS and the Polaris Cam window.
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built into.
#pragma once
#include <windows.h>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>

namespace polaris_cam {
// One shared-memory block. The window writes Control, the bridge writes Status.
// Camera pictures never pass through it: each camera has three GPU textures
// (shared by name, see texture_name) and Status says which one holds the
// newest complete picture.
inline constexpr wchar_t LinkName[] = L"Local\\PolarisCam.Link.1";
// Set by the bridge each time a camera has a new picture (auto-reset), so the
// window need not poll for it.
inline constexpr wchar_t FrameEventName[] = L"Local\\PolarisCam.Frame.1";
// The prototype's own version, beside the Taxi Cam version it is built on.
#define POLARIS_CAM_VERSION "0.1.1"
#define POLARIS_CAM_VERSION_WIDE L"0.1.1"
inline constexpr std::uint32_t LinkMagic = 0x4D434C50;  // "PLCM"
inline constexpr std::uint32_t LinkVersion = 1;
inline constexpr unsigned Feeds = 4;  // Taxi Cam's four camera views
inline constexpr unsigned Slots = 3;  // textures per camera: newest, being read, being written
inline constexpr std::uint32_t NoSlot = Slots;
inline constexpr std::uint64_t ControlStaleMs = 5000;  // a window that stopped writing is off
inline constexpr unsigned MinimumFps = 5, MaximumFps = 60, DefaultFps = 30;

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
  std::uint32_t reserved;
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
  char aircraft[260];          // AircraftLoaded path
  char message[160];
  FeedStatus feeds[Feeds];
};
struct Link {
  std::uint32_t magic, version;
  Control control;
  Status status;
};

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
// What the bridge acts on: a complete, checked copy of Control.
struct Request {
  bool on = false;
  std::uint32_t width = 0, height = 0, fps = DefaultFps, feed_mask = 0;
  bool use_mounts = false;
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
