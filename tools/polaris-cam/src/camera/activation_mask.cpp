#include "activation_mask.hpp"

#include <algorithm>

namespace taxi_camera::native_camera {

ActivationMaskInventory inspect_activation_disable_mask(discovery::ImageReader& reader,
                                                        const discovery::Inventory& image,
                                                        const CameraImageLayout& layout) {
  ActivationMaskInventory result;
  const auto rva = layout.activation_disable_mask;
  constexpr std::uint32_t size = 16;
  constexpr std::uint32_t required = 0x40000000;
  constexpr std::uint32_t excluded = 0xa2000000;
  if (!camera_layout_detail::image_rva(rva, size, 8) || !image.valid_image || image.machine != 0x8664 || image.image_size == 0 ||
      image.image_size > 0x80000000u || image.section_count == 0 || image.section_count > 96 || image.sections.empty() ||
      image.sections.size() > image.section_count || rva > image.image_size || size > image.image_size - rva) {
    result.error = "The activation-mask image metadata or bounds are invalid.";
    return result;
  }
  const auto section = std::find_if(image.sections.begin(), image.sections.end(), [&](const auto& item) {
    return item.rva <= image.image_size && item.size <= image.image_size - item.rva && (item.flags & required) == required &&
           (item.flags & excluded) == 0 && rva >= item.rva && rva - item.rva <= item.size && size <= item.size - (rva - item.rva);
  });
  if (section == image.sections.end()) {
    result.error = "The fixed activation-mask pair is outside readable static image data.";
    return result;
  }
  const auto exact = [&](std::array<std::uint8_t, size>& output) {
    result.read_bytes += size;
    std::uint32_t offset = 0;
    while (offset < size) {
      const auto window = reader.query(rva + offset, size - offset);
      if (!window.readable || window.size == 0 || window.size > size - offset ||
          !reader.read(rva + offset, output.data() + offset, window.size)) {
        ++result.read_failures;
        result.error = "The fixed activation-mask pair could not be read exactly.";
        return false;
      }
      offset += window.size;
    }
    return true;
  };
  std::array<std::uint8_t, size> first{}, second{};
  if (!exact(first))
    return result;
  for (unsigned word = 0; word < 2; ++word)
    for (unsigned byte = 0; byte < 8; ++byte)
      result.words[word] |= std::uint64_t(first[word * 8 + byte]) << (byte * 8);
  if (!exact(second))
    return result;
  if (first != second) {
    result.error = "The fixed activation-mask pair changed during its full reread.";
    return result;
  }
  if (result.words != std::array<std::uint64_t, 2>{1, 0}) {
    result.error = "The captured activation mask is not the required bit-zero-only pair {1,0}.";
    return result;
  }
  result.valid = true;
  return result;
}

}  // namespace taxi_camera::native_camera
