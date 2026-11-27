#pragma once

#include <cstddef>
#include <cstdint>

namespace taxi_camera::engine_camera {

class MemoryReader {
 public:
  virtual ~MemoryReader() = default;
  // Copy exactly the requested field or return false; implementations must not
  // throw. The native adapter owns page permissions, access/lifetime checks
  // and any shared read allowance. Production cores use -fno-exceptions.
  virtual bool read(std::uint64_t address, void* destination, std::size_t size) = 0;
};

}  // namespace taxi_camera::engine_camera
