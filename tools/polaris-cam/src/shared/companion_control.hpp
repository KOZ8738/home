#pragma once
#include "protocol.hpp"
namespace taxi_camera::standalone {
// Only a complete locked message replaces the cache. Contention is not OFF.
class CompanionControl {
 public:
  CompanionControl() noexcept { settings_.enabled = 0; }
  Mailbox::LockResult refresh(Mailbox& mailbox) noexcept {
    const auto result = mailbox.try_lock();
    if (result == Mailbox::LockResult::busy) {
      ++busy_reads_;
      return result;
    }
    if (result != Mailbox::LockResult::acquired) {
      invalidate();
      return result;
    }
    const auto& message = *mailbox.data();
    if (message.magic == ProtocolMagic && message.version == ProtocolVersion && message.bytes == sizeof(Shared) && message.owner_pid &&
        valid_settings(message.settings)) {
      settings_ = message.settings;
      heartbeat_ = message.owner_heartbeat;
      owner_pid_ = message.owner_pid;
    } else {
      invalidate();
    }
    mailbox.unlock();
    return result;
  }
  // Sample now AFTER refresh: a writer may advance the heartbeat after loop entry.
  bool connected(std::uint64_t now) const noexcept { return heartbeat_ && now >= heartbeat_ && now - heartbeat_ <= MaximumHeartbeatAgeMs; }
  const Settings& settings() const noexcept { return settings_; }
  std::uint32_t owner_pid() const noexcept { return owner_pid_; }
  std::uint64_t busy_reads() const noexcept { return busy_reads_; }
  static constexpr std::uint64_t MaximumHeartbeatAgeMs = 5000;

 private:
  void invalidate() noexcept {
    settings_ = {};
    settings_.enabled = 0;
    heartbeat_ = 0;
    owner_pid_ = 0;
  }
  Settings settings_;
  std::uint64_t heartbeat_{}, busy_reads_{};
  std::uint32_t owner_pid_{};
};

// A new owner, an explicit Connect request, or a real heartbeat gap starts a
// new setup session. Cached reads during mutex contention keep the same session.
class CompanionSetupSession {
 public:
  struct Change {
    bool started{}, stopped{};
    std::uint64_t generation{};
  };
  Change observe(bool connected, bool enabled, std::uint32_t owner, std::uint64_t request) noexcept {
    const bool active = connected && enabled && owner;
    const bool started = active && (!active_ || owner != owner_ || request != request_);
    const bool stopped = active_ && !active;
    if (started && generation_ != UINT64_MAX)
      ++generation_;
    active_ = active;
    owner_ = owner;
    request_ = request;
    return {started, stopped, generation_};
  }

 private:
  bool active_{};
  std::uint32_t owner_{};
  std::uint64_t request_{}, generation_{};
};
}  // namespace taxi_camera::standalone
