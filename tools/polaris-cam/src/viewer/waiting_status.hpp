// Polaris Cam: what the window's status line says while the broadcast waits.
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
#pragma once
#include <cstdint>
#include "../shared/broadcast_link.hpp"

namespace polaris_cam {
// The bridge says the cameras are still being created, yet every ticked camera
// has failed on its own (the bridge could not start it, or the window could
// not open its pictures), so none of them will show a picture. ticked and
// failed hold one bit per camera. Not while a ticked camera is still being
// created, nor while none is ticked, nor when the bridge gives another reason.
inline bool ticked_cameras_all_failed(std::uint32_t state, std::uint32_t reason, std::uint32_t ticked, std::uint32_t failed) noexcept {
  return state == link_waiting && reason == reason_starting && ticked != 0 && (ticked & ~failed) == 0;
}
}  // namespace polaris_cam
