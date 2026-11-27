#include "view_pool.hpp"

#include <algorithm>
#include <cstddef>
#include <limits>

namespace taxi_camera::engine_camera {
namespace {

constexpr std::uint32_t kReadBudget = 8192;
constexpr std::uint64_t kArrayOffset = 2752;
constexpr std::uint64_t kAssociationOffset = 72;
constexpr std::size_t kMaximumObservations = 1 + 8 * 5 + 2 + 128;

bool byte_range(std::uint64_t pointer, std::uint64_t offset, std::uint32_t size) noexcept {
  return pointer != 0 && offset <= std::numeric_limits<std::uint64_t>::max() - pointer &&
         size <= std::numeric_limits<std::uint64_t>::max() - (pointer + offset);
}

bool pointer_range(std::uint64_t pointer, std::uint64_t offset, std::uint32_t size) noexcept {
  return pointer % 8 == 0 && byte_range(pointer, offset, size);
}

std::uint32_t u32(const std::uint8_t* bytes) noexcept {
  std::uint32_t value = 0;
  for (std::uint32_t index = 0; index < 4; ++index)
    value |= std::uint32_t(bytes[index]) << (index * 8);
  return value;
}

std::uint64_t u64(const std::uint8_t* bytes) noexcept {
  return std::uint64_t(u32(bytes)) | (std::uint64_t(u32(bytes + 4)) << 32);
}

struct Observation {
  std::uint64_t address = 0;
  std::uint32_t size = 0;
  std::int32_t slot = -1;
  std::int32_t span = -1;  // Served from this span, or -1 for its own read.
  std::array<std::uint8_t, 16> bytes{};
};

// One exact read of an object's known extent (the eight view pointers, or one
// generation control record). Fields inside it are served from that read; the
// recheck rereads the span once and compares only the bytes each field observed.
constexpr std::uint32_t kSpanBytes = 64;
constexpr std::size_t kMaximumSpans = 1 + 8;
struct Span {
  std::uint64_t address = 0;
  std::uint32_t size = 0;
  std::int32_t slot = -1;
  std::array<std::uint8_t, kSpanBytes> bytes{};
};

class BoundedReader {
 public:
  BoundedReader(MemoryReader& reader, ViewPoolSnapshot& result) noexcept : reader_(reader), result_(result) {}

  // Reads [address, address+size) now. Call only with the extent of fields this
  // inspection goes on to capture in the same object. A covered range is reused.
  bool span(std::uint64_t address, std::uint32_t size) noexcept {
    for (std::size_t index = 0; index < span_count_; ++index)
      if (covers(spans_[index], address, size))
        return true;
    if (span_count_ == spans_.size() || order_count_ == order_.size() || size == 0 || size > kSpanBytes) {
      result_.status = ViewPoolStatus::read_budget_exhausted;
      return false;
    }
    auto& value = spans_[span_count_];
    value.address = address;
    value.size = size;
    value.slot = result_.failure_slot;
    if (!read_exact(address, size, value.bytes.data()))
      return false;
    order_[order_count_++] = -1 - static_cast<std::int32_t>(span_count_++);
    return true;
  }

  bool capture(std::uint64_t address, std::uint32_t size, std::uint8_t* output) noexcept {
    if (count_ == observations_.size() || order_count_ == order_.size() || (size != 1 && size != 4 && size != 8 && size != 16)) {
      result_.status = ViewPoolStatus::read_budget_exhausted;
      return false;
    }
    std::int32_t served = -1;
    for (std::size_t index = 0; index < span_count_; ++index)
      if (covers(spans_[index], address, size)) {
        served = static_cast<std::int32_t>(index);
        break;
      }
    if (served >= 0) {
      const auto& value = spans_[static_cast<std::size_t>(served)];
      std::copy_n(value.bytes.begin() + (address - value.address), size, output);
    } else {
      if (!read_exact(address, size, output))
        return false;
      order_[order_count_++] = static_cast<std::int32_t>(count_);
    }
    auto& observation = observations_[count_++];
    observation.address = address;
    observation.size = size;
    observation.slot = result_.failure_slot;
    observation.span = served;
    std::copy_n(output, size, observation.bytes.begin());
    return true;
  }

  // Repeats every read in its original order. Each captured field is compared
  // as soon as its own read or its span has been reread.
  bool recheck() noexcept {
    for (std::size_t step = 0; step < order_count_; ++step) {
      const auto item = order_[step];
      if (item < 0) {
        const auto index = static_cast<std::int32_t>(-1 - item);
        const auto& value = spans_[static_cast<std::size_t>(index)];
        result_.failure_slot = value.slot;
        std::array<std::uint8_t, kSpanBytes> current;
        if (!read_exact(value.address, value.size, current.data()))
          return false;
        for (std::size_t observed = 0; observed < count_; ++observed) {
          const auto& observation = observations_[observed];
          if (observation.span != index)
            continue;
          result_.failure_slot = observation.slot;
          const auto* bytes = current.data() + (observation.address - value.address);
          if (!std::equal(bytes, bytes + observation.size, observation.bytes.begin())) {
            result_.status = ViewPoolStatus::changed;
            return false;
          }
        }
        continue;
      }
      const auto& observation = observations_[static_cast<std::size_t>(item)];
      result_.failure_slot = observation.slot;
      std::array<std::uint8_t, 16> current{};
      if (!read_exact(observation.address, observation.size, current.data()))
        return false;
      if (!std::equal(current.begin(), current.begin() + observation.size, observation.bytes.begin())) {
        result_.status = ViewPoolStatus::changed;
        return false;
      }
    }
    return true;
  }

 private:
  static bool covers(const Span& value, std::uint64_t address, std::uint32_t size) noexcept {
    return address >= value.address && size <= value.size && address - value.address <= value.size - size;
  }

  bool read_exact(std::uint64_t address, std::uint32_t size, std::uint8_t* output) noexcept {
    if (size > kReadBudget - result_.read_bytes) {
      result_.status = ViewPoolStatus::read_budget_exhausted;
      return false;
    }
    result_.read_bytes += size;
    if (reader_.read(address, output, size))
      return true;
    result_.status = ViewPoolStatus::read_failed;
    ++result_.read_failures;
    return false;
  }

  MemoryReader& reader_;
  ViewPoolSnapshot& result_;
  std::array<Observation, kMaximumObservations> observations_{};
  std::size_t count_ = 0;
  std::array<Span, kMaximumSpans> spans_{};
  std::size_t span_count_ = 0;
  // Pass-one reads in order: an observation index, or -1 - span index.
  std::array<std::int32_t, kMaximumObservations + kMaximumSpans> order_{};
  std::size_t order_count_ = 0;
};

ViewPoolSnapshot inspect_pool(MemoryReader& reader, std::uint64_t renderer, bool release) noexcept {
  ViewPoolSnapshot result;
  for (std::uint32_t index = 0; index < result.slots.size(); ++index)
    result.slots[index].index = index;
  if (!pointer_range(renderer, kArrayOffset, 8)) {
    result.status = ViewPoolStatus::invalid_renderer;
    return result;
  }
  BoundedReader source(reader, result);
  std::array<std::uint8_t, 16> bytes{};
  if (!source.capture(renderer + kArrayOffset, 8, bytes.data()))
    return result;
  result.array_address = u64(bytes.data());
  if (!pointer_range(result.array_address, 0, result.slots.size() * 8)) {
    result.status = ViewPoolStatus::invalid_array;
    return result;
  }
  // All eight view pointers in one read.
  if (!source.span(result.array_address, static_cast<std::uint32_t>(result.slots.size() * 8)))
    return result;
  for (std::uint32_t index = 0; index < result.slots.size(); ++index) {
    result.failure_slot = static_cast<std::int32_t>(index);
    auto& slot = result.slots[index];
    if (!source.capture(result.array_address + index * 8, 8, bytes.data()))
      return result;
    slot.view_address = u64(bytes.data());
    if (!pointer_range(slot.view_address, kAssociationOffset, 16)) {
      result.status = ViewPoolStatus::invalid_view;
      return result;
    }
    for (std::uint32_t previous = 0; previous < index; ++previous) {
      if (slot.view_address == result.slots[previous].view_address) {
        result.status = ViewPoolStatus::duplicate_view;
        return result;
      }
    }
    if (!source.capture(slot.view_address + kAssociationOffset, 16, bytes.data()))
      return result;
    const auto control = u64(bytes.data());
    const auto generation = u32(bytes.data() + 8);
    if (control == 0) {
      slot.association = ViewAssociation::null_control;
    } else {
      // Generation records may be packed at byte alignment. Captured native
      // MOVs use this exact pointer; never mask or round its low bits.
      if (!byte_range(control, 28, 4)) {
        result.status = ViewPoolStatus::invalid_control;
        return result;
      }
      // Payload at +0 and generation at +28 of the control record in one read.
      if (!source.span(control, 32) || !source.capture(control + 28, 4, bytes.data()))
        return result;
      if (u32(bytes.data()) != generation) {
        slot.association = ViewAssociation::stale_generation;
      } else {
        if (!source.capture(control, 8, bytes.data()))
          return result;
        slot.association = u64(bytes.data()) == 0 ? ViewAssociation::null_payload : ViewAssociation::occupied;
      }
    }
    slot.association_valid = slot.association == ViewAssociation::occupied;
    slot.free = !slot.association_valid;
    if (release) {
      if (!pointer_range(slot.view_address, 23688, 1)) {
        result.status = ViewPoolStatus::invalid_view;
        return result;
      }
      if (!source.capture(slot.view_address + 23688, 1, bytes.data()))
        return result;
      slot.release_pending = bytes[0] != 0;
    }
    ++result.slots_examined;
  }
  for (const auto offset : {2768u, 2784u}) {
    if (!release)
      break;
    result.failure_slot = -1;
    if (!pointer_range(renderer, offset, 16)) {
      result.status = ViewPoolStatus::invalid_renderer;
      return result;
    }
    if (!source.capture(renderer + offset, 16, bytes.data()))
      return result;
    const auto remaining = u32(bytes.data()), count = u32(bytes.data() + 4);
    const auto array = u64(bytes.data() + 8);
    // Native enqueue grows by 32. Unknown/large queues are unavailable, never
    // truncated into a false absence proof. Empty unallocated queues are valid.
    const auto capacity = std::uint64_t(count) + remaining;
    if (count > 64 || capacity > UINT32_MAX || (capacity && (!array || array % 8 || capacity * 8 > UINT64_MAX - array)) ||
        (array && !pointer_range(array, 0, 8))) {
      result.status = ViewPoolStatus::invalid_release_queue;
      return result;
    }
    result.release_queue_counts[(offset - 2768) / 16] = count;
    for (unsigned i = 0; i < count; ++i) {
      if (!source.capture(array + i * 8, 8, bytes.data()))
        return result;
      const auto view = u64(bytes.data());
      if (!pointer_range(view, 0, 8)) {
        result.status = ViewPoolStatus::invalid_release_queue;
        return result;
      }
      result.release_views[result.release_count++] = view;
      for (auto& slot : result.slots)
        slot.release_queued |= slot.view_address == view;
    }
  }
  if (!source.recheck())
    return result;
  for (const auto& slot : result.slots) {
    if (!slot.free)
      continue;
    if (result.free_count < result.first_free_indices.size())
      result.first_free_indices[result.free_count] = static_cast<std::int32_t>(slot.index);
    ++result.free_count;
  }
  result.failure_slot = -1;
  result.valid = true;
  result.release_checked = release;
  result.status = ViewPoolStatus::complete;
  return result;
}

}  // namespace

ViewPoolSnapshot inspect_view_pool(MemoryReader& reader, std::uint64_t renderer) noexcept {
  return inspect_pool(reader, renderer, false);
}
ViewPoolSnapshot inspect_view_creation_pool(MemoryReader& reader, std::uint64_t renderer) noexcept {
  return inspect_pool(reader, renderer, true);
}

}  // namespace taxi_camera::engine_camera
