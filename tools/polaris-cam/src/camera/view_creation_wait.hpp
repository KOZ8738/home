#pragma once

#include "entry_pair.hpp"

namespace taxi_camera::native_camera {
// Only a verified pool/queue admission refusal sets this flag. A native create
// failure, descriptor mismatch or owned-view validation failure must not use it.
// Retain it through partial-pair cleanup; only confirmed empty ownership may be
// reset. A later Stop/Start revision prevents resurrection of an old request.
class ViewCreationWait {
 public:
  void defer(std::uint64_t revision) noexcept {
    pending_ = true;
    revision_ = revision;
  }
  bool pending() const noexcept { return pending_; }
  bool resume(engine_camera::PairController& pair, std::uint64_t revision, bool requested, bool may_resume = true) noexcept {
    if (!pending_)
      return false;
    if (revision != revision_ || !requested) {
      pending_ = false;
      return false;
    }
    if (!may_resume)
      return false;
    if (pair.cancel_uncreated_request() != engine_camera::EmptyPairCancel::cancelled)
      return false;
    pending_ = false;
    return true;
  }

 private:
  bool pending_{};
  std::uint64_t revision_{};
};
}  // namespace taxi_camera::native_camera
