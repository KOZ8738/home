// Polaris Cam: what the window's status line says from the bridge's status.
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
#pragma once
#include <cstdint>
#include "../shared/broadcast_link.hpp"

namespace polaris_cam {
// The size the bridge is sending pictures at, as it reports it: that of every
// camera it renders (feed_mask) with a picture under its current textures.
// Never the window's own setting, which changes before the bridge does: while
// the cameras change size, one that still sends the old size keeps it, and one
// whose new textures have no picture yet is not counted. False when no camera
// is sending, or while those that are send different sizes (they change one
// by one): the status line then gives no size.
inline bool sent_size(const Status& status, std::uint32_t& width, std::uint32_t& height) noexcept {
  std::uint32_t found_width = 0, found_height = 0;
  for (unsigned feed = 0; feed < Feeds; ++feed) {
    const auto& announced = status.feeds[feed];
    if (!((status.feed_mask >> feed) & 1u) || announced.state != feed_live || load(announced.generation) == 0 ||
        !valid_size(announced.width, announced.height))
      continue;
    if (found_width && (announced.width != found_width || announced.height != found_height))
      return false;
    found_width = announced.width;
    found_height = announced.height;
  }
  if (!found_width)
    return false;
  width = found_width;
  height = found_height;
  return true;
}
// The bridge says the cameras are still being created, yet every ticked camera
// has failed on its own (the bridge could not start it, or the window could
// not open its pictures), so none of them will show a picture. ticked and
// failed hold one bit per camera. Not while a ticked camera is still being
// created, nor while none is ticked, nor when the bridge gives another reason.
inline bool ticked_cameras_all_failed(std::uint32_t state, std::uint32_t reason, std::uint32_t ticked, std::uint32_t failed) noexcept {
  return state == link_waiting && reason == reason_starting && ticked != 0 && (ticked & ~failed) == 0;
}
}  // namespace polaris_cam
