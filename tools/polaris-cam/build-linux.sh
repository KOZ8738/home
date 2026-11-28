#!/usr/bin/env bash
# Builds Polaris Cam for Windows on Linux, with the llvm-mingw release Taxi Cam's own build.ps1 pins
# (20260908, LLVM 23.1.1) and the same compiler flags.
#
#   LLVM_MINGW=/path/to/llvm-mingw-20260908-ucrt-ubuntu-22.04-x86_64 ./build-linux.sh <out dir> [targets...]
#
# targets (default: all): bridge   taxi-camera-bridge.dll, loaded into MSFS by taxi-cam.exe
#                         companion taxi-cam.exe, Taxi Cam's own window
#                         viewer   polaris-cam.exe, the Polaris Cam window
#                         selftest polaris-cam-selftest.exe, run by the build on Windows (test/selftest.cpp)
#         and, only when named: remotetest polaris-cam-remote-test.exe, the back-office stream against a stand-in
#                         relay in Node (test/remote_stream_test.cpp)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
OUT=${1:?out dir}; shift
TARGETS=${*:-bridge companion viewer selftest}
: "${LLVM_MINGW:?set LLVM_MINGW to the llvm-mingw directory}"
CXX=$LLVM_MINGW/bin/x86_64-w64-mingw32-clang++
WINDRES=$LLVM_MINGW/bin/x86_64-w64-mingw32-windres
mkdir -p "$OUT/generated" "$OUT/obj"
OUT=$(cd "$OUT" && pwd)
VERSION=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['releases'][0]['version'])" "$ROOT/changelog.json")
IFS=. read -r MAJ MIN PAT <<<"$VERSION"
cat > "$OUT/generated/taxi-cam-version.hpp" <<H
#pragma once
#define TAXI_CAM_VERSION "$VERSION"
#define TAXI_CAM_VERSION_MAJOR $MAJ
#define TAXI_CAM_VERSION_MINOR $MIN
#define TAXI_CAM_VERSION_PATCH $PAT
#define TAXI_CAM_BUILD_NUMBER ${BUILD_NUMBER:-0}
H
sed "s/@TAXI_CAM_VERSION@/$VERSION/g" "$ROOT/src/app/app.manifest" > "$OUT/generated/taxi-cam.manifest"
sed "s/@TAXI_CAM_VERSION@/$VERSION/g" "$ROOT/src/viewer/viewer.manifest" > "$OUT/generated/polaris-cam.manifest"
COMMON=(-std=c++20 -O2 -Wall -Wextra -Werror -fms-extensions -static -DNOMINMAX -DWIN32_LEAN_AND_MEAN -D_WIN32_WINNT=0x0A00
        -mno-avx -mno-avx2 -mno-avx512f -I "$OUT/generated")
GRAPHICS=(src/bridge/d3d12_bridge.cpp src/graphics/scene_handoff.cpp src/graphics/scene_capture_d3d12.cpp
  src/graphics/scene_capture_manager.cpp src/graphics/scene_source_state.cpp src/graphics/scene_frame_output.cpp
  src/graphics/scene_runtime.cpp src/graphics/broadcast_output.cpp src/graphics/pfd_submission_pool.cpp src/graphics/pfd_stamp_state.cpp
  src/graphics/pfd_stamp_d3d12.cpp src/hooks/queue_submit_observer.cpp src/hooks/pfd_state_observer.cpp
  src/hooks/render_boundary_observer.cpp)
ENGINE=(src/camera/probe.cpp src/camera/local_memory.cpp src/camera/code_contract.cpp src/camera/activation_mask.cpp
  src/camera/camera_contract.cpp src/camera/camera_contract_model.cpp src/camera/relocatable_contract.cpp src/camera/rtti_vtables.cpp
  src/camera/view_resize.cpp src/camera/view_aa.cpp src/camera/view_clip.cpp src/camera/source_view.cpp
  src/camera/body_pose_provider.cpp src/camera/mount_config.cpp src/camera/aircraft_inventory.cpp src/camera/entry_pair.cpp
  src/camera/view_cascades.cpp src/camera/owned_entry_inventory.cpp src/camera/owned_view.cpp src/camera/view_pool.cpp
  src/hooks/observer_hook.cpp src/hooks/observer_thunk.S tools/diagnostics/image_inventory.cpp)
LIBS=(-ld3d12 -ldxgi -ldxguid -ld3dcompiler)
JOBS=${JOBS:-$(nproc)}
wants() { [[ " $TARGETS " == *" $1 "* ]]; }
# Objects are rebuilt when their source or any header is newer.
object() {
  local source=$1 object="$OUT/obj/$(echo "$1" | tr '/' '_').o"
  if [ ! -f "$object" ] || [ "$ROOT/$source" -nt "$object" ] || [ -n "$(find "$ROOT/src" -name '*.hpp' -newer "$object" -print -quit)" ]; then
    "$CXX" "${COMMON[@]}" -c "$ROOT/$source" -o "$object" || { echo "FAILED: $source" >&2; return 1; }
  fi
}
objects() {
  local source
  for source in "$@"; do
    while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do wait -n || exit 1; done
    object "$source" &
  done
  while [ "$(jobs -rp | wc -l)" -gt 0 ]; do wait -n || exit 1; done
}
paths() { local source; for source in "$@"; do echo "$OUT/obj/$(echo "$source" | tr '/' '_').o"; done; }
if wants bridge; then
  objects "${GRAPHICS[@]}" "${ENGINE[@]}"
  "$WINDRES" -I "$OUT/generated" -I "$ROOT/src/bridge" -i "$ROOT/src/bridge/bridge.rc" -O coff -o "$OUT/obj/bridge.res.o"
  # shellcheck disable=SC2046
  "$CXX" "${COMMON[@]}" -shared "$ROOT/src/bridge/bridge_main.cpp" $(paths "${GRAPHICS[@]}" "${ENGINE[@]}") "$OUT/obj/bridge.res.o" \
    "${LIBS[@]}" -Wl,--no-insert-timestamp -o "$OUT/taxi-camera-bridge.dll"
  echo "built taxi-camera-bridge.dll"
fi
if wants companion; then
  SETUP=(src/setup/setup_commands.cpp src/setup/setup_common.cpp src/setup/processes.cpp src/setup/prerequisites.cpp
    src/setup/saved_settings.cpp src/setup/startup_xml.cpp)
  CLIBS=(-lbcrypt -ldxgi -lversion -lshell32 -lcomctl32 -lcomdlg32 -ladvapi32 -ldwmapi -luxtheme -lwinhttp -lhid -lole32 -loleaut32
    -lshlwapi -lmsxml6 -lwindowscodecs -lgdiplus)
  "$WINDRES" -I "$OUT/generated" -I "$ROOT/src/app" -i "$ROOT/src/app/app.rc" -O coff -o "$OUT/obj/app.res.o"
  "$CXX" "${COMMON[@]}" -municode -mwindows "$ROOT/src/app/companion.cpp" "$ROOT/src/app/updater.cpp" "${SETUP[@]/#/$ROOT/}" \
    "$OUT/obj/app.res.o" "${CLIBS[@]}" -Wl,--no-insert-timestamp -o "$OUT/taxi-cam.exe"
  echo "built taxi-cam.exe"
fi
if wants viewer; then
  "$WINDRES" -I "$OUT/generated" -I "$ROOT/src/viewer" -i "$ROOT/src/viewer/viewer.rc" -O coff -o "$OUT/obj/viewer.res.o"
  "$CXX" "${COMMON[@]}" -municode -mwindows "$ROOT/src/viewer/viewer.cpp" "$ROOT/src/viewer/remote_stream.cpp" "$OUT/obj/viewer.res.o" \
    -ld3d11 -ldxgi -ldxguid -lcomctl32 -lshell32 -lole32 -lgdi32 -lwinhttp -lwindowscodecs -Wl,--no-insert-timestamp -o "$OUT/polaris-cam.exe"
  echo "built polaris-cam.exe"
fi
if wants selftest; then
  objects src/graphics/broadcast_output.cpp
  # shellcheck disable=SC2046
  "$CXX" "${COMMON[@]}" -municode "$ROOT/test/selftest.cpp" $(paths src/graphics/broadcast_output.cpp) "${LIBS[@]}" -Wl,--no-insert-timestamp \
    -o "$OUT/polaris-cam-selftest.exe"
  echo "built polaris-cam-selftest.exe"
fi
if wants remotetest; then
  "$CXX" "${COMMON[@]}" "$ROOT/test/remote_stream_test.cpp" "$ROOT/src/viewer/remote_stream.cpp" -ld3d11 -ldxgi -ldxguid -lole32 -lwinhttp \
    -lwindowscodecs -Wl,--no-insert-timestamp -o "$OUT/polaris-cam-remote-test.exe"
  echo "built polaris-cam-remote-test.exe"
fi
