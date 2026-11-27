#pragma once

#include "camera_contract.hpp"
#include "relocatable_contract.hpp"

#include <string_view>

namespace taxi_camera::native_camera::camera_contract_model {

// Enclosing runtime-function observations, relative to a model symbol. More
// than one span may cover a template. A negative addend denotes an interior
// window. required_pdata=false is reserved for reviewed leaf/tail bodies that
// need no stack-unwind entry; it does not invent
// unwind metadata or waive the caller's instruction/relocation checks.
struct FunctionBoundary {
  std::uint32_t symbol = 0;
  std::int32_t begin_addend = 0;
  std::uint32_t bytes = 0;
  bool required_pdata = true;
};

const relocatable::ContractModel& model();
const std::vector<FunctionBoundary>& boundaries();

// Returns UINT32_MAX for an unknown name. Names are semantic roles, never
// build-specific RVAs. Vtable slots still require an independently rechecked
// static RTTI relationship; short method bodies are not discovered as seeds.
// Where a reviewed body changed shape between shipped builds, every shape is
// declared and the loaded image decides which one resolves.
std::uint32_t symbol_index(std::string_view name) noexcept;

// Copies an already successful resolver result. This is a projection, not a
// compatibility check. Unresolved vtable roles remain zero for the caller's
// separate identity resolver; no observed-address fallback is provided.
bool bind(const std::vector<std::uint32_t>& symbols, CameraFunctions& functions, CameraImageLayout& layout) noexcept;

}  // namespace taxi_camera::native_camera::camera_contract_model
