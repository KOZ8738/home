#pragma once

namespace taxi_camera {
// Display sides: 0 captain (left), 1 first officer (right), 2 lower ECAM (SD).
// Most profiles use the first two; a profile's side count bounds every mask.
inline constexpr unsigned MaxDisplaySides = 3;
inline constexpr unsigned AllDisplaySides = (1u << MaxDisplaySides) - 1;
inline constexpr unsigned PilotDisplaySides = 3;
}  // namespace taxi_camera
