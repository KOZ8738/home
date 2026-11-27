#include "mount_config.hpp"
#include "probe.hpp"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>

#include <array>
#include <cstring>
#include <cwchar>

namespace taxi_camera::native_camera {
namespace {
SRWLOCK lifecycle_lock = SRWLOCK_INIT, status_lock = SRWLOCK_INIT;
HANDLE worker = nullptr, stop_event = nullptr;
std::array<wchar_t, 1024> config_path{};
MountConfigStatus status;
struct Lock {
  SRWLOCK& value;
  explicit Lock(SRWLOCK& lock) noexcept : value(lock) { AcquireSRWLockExclusive(&value); }
  ~Lock() { ReleaseSRWLockExclusive(&value); }
};
void set_state(const char* state) noexcept {
  const Lock lock(status_lock);
  status.state = state;
}
bool same_file(const BY_HANDLE_FILE_INFORMATION& a, const BY_HANDLE_FILE_INFORMATION& b) noexcept {
  return a.dwVolumeSerialNumber == b.dwVolumeSerialNumber && a.nFileIndexHigh == b.nFileIndexHigh && a.nFileIndexLow == b.nFileIndexLow &&
         a.nFileSizeHigh == b.nFileSizeHigh && a.nFileSizeLow == b.nFileSizeLow && a.dwFileAttributes == b.dwFileAttributes &&
         a.ftLastWriteTime.dwHighDateTime == b.ftLastWriteTime.dwHighDateTime &&
         a.ftLastWriteTime.dwLowDateTime == b.ftLastWriteTime.dwLowDateTime;
}
void check_file(std::array<char, kMountConfigMaximumBytes>& previous,
                DWORD& previous_size,
                bool& have_previous,
                const char*& previous_state) noexcept {
  {
    const Lock lock(status_lock);
    ++status.checks;
  }
  HANDLE file = CreateFileW(config_path.data(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
                            OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
  if (file == INVALID_HANDLE_VALUE) {
    const auto error = GetLastError();
    set_state(error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND ? "file_absent_current_mounts_retained"
                                                                             : "file_open_failed_current_mounts_retained");
    return;
  }
  BY_HANDLE_FILE_INFORMATION before{}, after{};
  std::array<char, kMountConfigMaximumBytes> contents{};
  DWORD bytes = 0;
  const bool permitted = GetFileType(file) == FILE_TYPE_DISK && GetFileInformationByHandle(file, &before) &&
                         !(before.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)) &&
                         before.nFileSizeHigh == 0 && before.nFileSizeLow <= contents.size();
  const bool read = permitted && ReadFile(file, contents.data(), before.nFileSizeLow, &bytes, nullptr) && bytes == before.nFileSizeLow &&
                    GetFileInformationByHandle(file, &after) && same_file(before, after);
  CloseHandle(file);
  if (!read) {
    set_state("file_read_or_stability_check_failed_current_mounts_retained");
    return;
  }
  if (WaitForSingleObject(stop_event, 0) != WAIT_TIMEOUT)
    return;
  if (have_previous && bytes == previous_size && std::memcmp(contents.data(), previous.data(), bytes) == 0) {
    set_state(previous_state);
    return;
  }
  previous = contents;
  previous_size = bytes;
  have_previous = true;
  MountPair mounts{};
  const char* error = nullptr;
  if (!parse_mount_config({contents.data(), bytes}, mounts, error)) {
    previous_state = "invalid_config_current_mounts_retained";
    set_state(previous_state);
    return;
  }
  // The file is closed and no observer/status lock is held across the mailbox.
  // This only requests numeric mounts; it cannot start a scene or call the engine.
  const bool accepted = request_scene_mounts(mounts);
  const Lock lock(status_lock);
  previous_state = accepted ? "applied" : "mailbox_refused_current_mounts_retained";
  status.state = previous_state;
  if (accepted)
    ++status.applications;
}
DWORD WINAPI run(void*) noexcept {
  std::array<char, kMountConfigMaximumBytes> previous{};
  DWORD previous_size = 0;
  bool have_previous = false;
  const char* previous_state = "waiting_for_file";
  while (WaitForSingleObject(stop_event, 0) == WAIT_TIMEOUT) {
    check_file(previous, previous_size, have_previous, previous_state);
    if (WaitForSingleObject(stop_event, 1000) != WAIT_TIMEOUT)
      break;
  }
  const Lock lock(status_lock);
  status.running = false;
  status.state = "stopped";
  return 0;
}
void close_finished_worker() noexcept {
  CloseHandle(worker);
  CloseHandle(stop_event);
  worker = nullptr;
  stop_event = nullptr;
}
}  // namespace

bool initialize_mount_config(const wchar_t* addon_path) noexcept {
  const Lock lifecycle(lifecycle_lock);
  if (worker) {
    if (WaitForSingleObject(worker, 0) == WAIT_OBJECT_0)
      close_finished_worker();
    else
      return WaitForSingleObject(stop_event, 0) == WAIT_TIMEOUT;
  }
  if (!addon_path || wcsnlen(addon_path, config_path.size()) >= config_path.size() ||
      !((addon_path[0] >= L'A' && addon_path[0] <= L'Z') || (addon_path[0] >= L'a' && addon_path[0] <= L'z')) || addon_path[1] != L':' ||
      (addon_path[2] != L'\\' && addon_path[2] != L'/')) {
    set_state("invalid_addon_path");
    return false;
  }
  const auto size = GetFullPathNameW(addon_path, static_cast<DWORD>(config_path.size()), config_path.data(), nullptr);
  if (!size || size >= config_path.size()) {
    set_state("invalid_addon_path");
    return false;
  }
  auto* name = std::wcsrchr(config_path.data(), L'\\');
  constexpr wchar_t filename[] = L"taxi-camera-mounts.cfg";
  if (!name || static_cast<std::size_t>(name + 1 - config_path.data()) + std::size(filename) > config_path.size()) {
    set_state("invalid_addon_path");
    return false;
  }
  std::memcpy(name + 1, filename, sizeof(filename));
  HMODULE pinned_module = nullptr;
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_PIN | GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, reinterpret_cast<LPCWSTR>(&run),
                          &pinned_module)) {
    set_state("worker_module_pin_failed");
    return false;
  }
  stop_event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!stop_event) {
    set_state("worker_event_failed");
    return false;
  }
  {
    const Lock lock(status_lock);
    status = {true, 0, 0, "waiting_for_file"};
  }
  worker = CreateThread(nullptr, 0, &run, nullptr, 0, nullptr);
  if (!worker) {
    CloseHandle(stop_event);
    stop_event = nullptr;
    const Lock lock(status_lock);
    status.running = false;
    status.state = "worker_start_failed";
    return false;
  }
  return true;
}
bool shutdown_mount_config() noexcept {
  const Lock lifecycle(lifecycle_lock);
  if (!worker)
    return true;
  SetEvent(stop_event);
  if (WaitForSingleObject(worker, 2000) != WAIT_OBJECT_0) {
    set_state("worker_stop_pending");
    return false;
  }
  close_finished_worker();
  return true;
}
MountConfigStatus mount_config_status() noexcept {
  const Lock lock(status_lock);
  return status;
}
}  // namespace taxi_camera::native_camera
