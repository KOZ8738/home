#pragma once

#include <cstdint>
#include <limits>

namespace taxi_camera {

// Caller supplies a monotonic clock and serializes access. The budget observes
// writes only; it never owns calibration enablement, selection or device state.
struct WriteBudget {
  static constexpr std::uint32_t default_limit = 4096;
  static constexpr std::uint32_t minimum_limit = 64;
  static constexpr std::uint32_t maximum_limit = 16384;
  static constexpr std::uint64_t fallback_ms = 50;

  std::uint64_t present_frame = 0;
  std::uint64_t window_started_ms = 0;
  std::uint64_t window_epoch = 0;
  std::uint32_t window_accepted = 0;
  std::uint64_t window_skipped = 0;
  std::uint64_t total_accepted = 0;
  std::uint64_t total_skipped = 0;
  std::uint64_t timed_window_resets = 0;
  std::uint32_t peak_accepted = 0;
  std::uint64_t peak_skipped = 0;
  // Sticky within this window after at least one rejected attempt.
  bool limit_hit = false;

  std::uint32_t limit() const { return limit_; }

  // Changing the limit grants no fresh window and clears no session statistics.
  void set_limit(std::uint32_t value) { limit_ = value < minimum_limit ? minimum_limit : value > maximum_limit ? maximum_limit : value; }

  // Explicit manual enable starts a new session while retaining its configured limit.
  void reset_session(std::uint64_t frame, std::uint64_t monotonic_ms) {
    window_epoch = 0;
    total_accepted = total_skipped = 0;
    timed_window_resets = 0;
    peak_accepted = 0;
    peak_skipped = 0;
    begin_window(frame, monotonic_ms);
  }

  bool try_acquire(std::uint64_t frame, std::uint64_t monotonic_ms) {
    // Guard subtraction if a caller violates the monotonic-clock contract. A
    // backwards clock must not create a fresh budget on every attempt.
    const bool timed_reset =
        initialized_ && frame == present_frame && monotonic_ms >= window_started_ms && monotonic_ms - window_started_ms >= fallback_ms;
    if (!initialized_ || frame != present_frame || timed_reset) {
      if (timed_reset)
        increment(timed_window_resets);
      begin_window(frame, monotonic_ms);
    }
    if (window_accepted >= limit_) {
      increment(window_skipped);
      increment(total_skipped);
      if (window_skipped > peak_skipped)
        peak_skipped = window_skipped;
      limit_hit = true;
      return false;
    }
    ++window_accepted;
    increment(total_accepted);
    if (window_accepted > peak_accepted)
      peak_accepted = window_accepted;
    return true;
  }

 private:
  std::uint32_t limit_ = default_limit;
  bool initialized_ = false;

  static void increment(std::uint64_t& value) {
    if (value != std::numeric_limits<std::uint64_t>::max())
      ++value;
  }

  void begin_window(std::uint64_t frame, std::uint64_t monotonic_ms) {
    initialized_ = true;
    present_frame = frame;
    window_started_ms = monotonic_ms;
    increment(window_epoch);
    window_accepted = 0;
    window_skipped = 0;
    limit_hit = false;
  }
};

}  // namespace taxi_camera
