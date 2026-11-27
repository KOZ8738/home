#pragma once
#include "aircraft_mounts.hpp"
namespace taxi_camera::native_camera::body_math {
inline constexpr double pi = 3.14159265358979323846;
inline constexpr double radians = pi / 180.0;
inline constexpr double a = 6378137.0;
inline constexpr double e2 = 6.6943799901413165e-3;
struct Telemetry {
  double latitude = 0, longitude = 0, altitude = 0, pitch = 0, bank = 0, heading = 0;
};
inline bool valid(const Telemetry& p) noexcept {
  const double values[]{p.latitude, p.longitude, p.altitude, p.pitch, p.bank, p.heading};
  for (double x : values)
    if (!std::isfinite(x))
      return false;
  return std::abs(p.latitude) <= 90 && std::abs(p.longitude) <= 180 && p.altitude >= -1000 && p.altitude <= 100000 &&
         std::abs(p.pitch) <= 180 && std::abs(p.bank) <= 180 && std::abs(p.heading) <= 720;
}
inline Vector3 ecef(double lat, double lon, double height) noexcept {
  lat *= radians;
  lon *= radians;
  const double s = std::sin(lat), c = std::cos(lat), n = a / std::sqrt(1 - e2 * s * s);
  return {(n + height) * c * std::cos(lon), (n + height) * c * std::sin(lon), (n * (1 - e2) + height) * s};
}
inline bool geodetic(const Vector3& p, Vector3& result) noexcept {
  if (!mount_detail::finite(p))
    return false;
  const double xy = std::hypot(p[0], p[1]), radius = std::hypot(xy, p[2]);
  if (radius < 6300000 || radius > 6500000 || xy < 1)
    return false;
  double lat = std::atan2(p[2], xy * (1 - e2)), h = 0;
  for (unsigned i = 0; i < 10; ++i) {
    const double s = std::sin(lat), n = a / std::sqrt(1 - e2 * s * s);
    h = xy / std::cos(lat) - n;
    lat = std::atan2(p[2], xy * (1 - e2 * n / (n + h)));
  }
  const double s = std::sin(lat), n = a / std::sqrt(1 - e2 * s * s);
  h = xy / std::cos(lat) - n;
  result = {lat / radians, std::atan2(p[1], p[0]) / radians, h};
  return mount_detail::finite(result);
}
inline BodyPose body(const Telemetry& p, double vertical_correction) noexcept {
  BodyPose out;
  out.origin = ecef(p.latitude, p.longitude, p.altitude + vertical_correction);
  const double lat = p.latitude * radians, lon = p.longitude * radians, h = p.heading * radians, pitch = p.pitch * radians,
               bank = p.bank * radians;
  const Vector3 east{-std::sin(lon), std::cos(lon), 0};
  const Vector3 north{-std::sin(lat) * std::cos(lon), -std::sin(lat) * std::sin(lon), std::cos(lat)};
  const Vector3 up{std::cos(lat) * std::cos(lon), std::cos(lat) * std::sin(lon), std::sin(lat)};
  for (unsigned i = 0; i < 3; ++i) {
    const double f = north[i] * std::cos(h) + east[i] * std::sin(h);
    const double r = east[i] * std::cos(h) - north[i] * std::sin(h);
    const double u = up[i] * std::cos(pitch) + f * std::sin(pitch);
    out.forward[i] = f * std::cos(pitch) - up[i] * std::sin(pitch);
    out.right[i] = r * std::cos(bank) + u * std::sin(bank);
    out.up[i] = u * std::cos(bank) - r * std::sin(bank);
  }
  return out;
}
inline double distance(const Vector3& x, const Vector3& y) noexcept {
  return std::hypot(std::hypot(x[0] - y[0], x[1] - y[1]), x[2] - y[2]);
}
}  // namespace taxi_camera::native_camera::body_math
