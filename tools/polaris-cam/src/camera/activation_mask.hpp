#pragma once

#include "camera_layout.hpp"
#include "image_inventory.hpp"

#include <array>

namespace taxi_camera::native_camera {

struct ActivationMaskInventory {
  bool valid = false;
  std::string error;
  std::uint32_t read_bytes = 0;
  std::uint32_t read_failures = 0;
  // Semantic flag words, never pointers or generic raw-byte output. The first
  // observation remains diagnostic only unless valid is true.
  std::array<std::uint64_t, 2> words{};
};

// Read the 16-byte flag pair at the resolved layout's activation-disable RVA
// from declared readable, nonwritable, nonexecutable, nondiscardable image data.
// Require the complete pair {1,0} and an identical full reread (32B maximum).
// Caller separately verifies the current code contract before using the native
// activation(false) call; this helper performs no calls or memory writes and
// cannot guarantee future immutability or an engine scheduling contract.
ActivationMaskInventory inspect_activation_disable_mask(discovery::ImageReader& reader,
                                                        const discovery::Inventory& image,
                                                        const CameraImageLayout& layout = observed_store_layout());

}  // namespace taxi_camera::native_camera
