# Polaris Cam

Broadcast cameras for Microsoft Flight Simulator 2024: up to four camera views placed anywhere on the aircraft, rendered at
1920×1080 or 1280×720 and 5 to 60 pictures a second, each shown in a window of its own for OBS to capture. A prototype, for
the first-flight stream.

**This is a changed copy of [Taxi Cam](https://github.com/rthoms334/taxi-cam) 1.4.2** (commit `adccfd6`, 2026-11-26),
Copyright (C) 2026 Robert Thomson, licensed GPL-3.0-only. The changes, made from 2026-11-27 on, are Copyright (C) 2026
Polaris and under the same licence ([LICENSE](LICENSE)). It is not Taxi Cam, is not supported by its author, and does not
update itself from Taxi Cam's releases. Everything that makes it work, the camera views inside the simulator, their
capture and the simulator's tone curve, is Taxi Cam's.

The download is `PolarisCam.zip` on this repository's
[polaris-cam release](https://github.com/KOZ8738/home/releases/tag/polaris-cam); its `使用說明.txt`
([dist/README.txt](dist/README.txt)) has the steps for using it.

## What is changed

Taxi Cam renders its camera views small, composes them into one image and writes that into a cockpit display. Here, while
the Polaris Cam window asks for it, every view is rendered at the broadcast size instead and sent out on its own; nothing
is written to the cockpit displays then. With the broadcast off it behaves as Taxi Cam does.

| File | Change |
| --- | --- |
| `src/shared/broadcast_link.hpp` (new) | The shared-memory block between the bridge and the window: what the window asks for (on, size, rate, cameras, mounts) and what the bridge reports (state, the newest picture of each camera). |
| `src/graphics/broadcast_output.hpp`, `.cpp` (new) | One camera's picture: the snapshot through the simulator's exposure and tone curve (the compositor's conversion, without its bloom) into one of three `B8G8R8A8` textures shared by name. |
| `src/graphics/scene_runtime.hpp`, `.cpp` | While broadcasting, each view's snapshots go to its `BroadcastOutput` instead of the composition. |
| `src/bridge/bridge_main.cpp` | Reads the window's request each pass; the broadcast size as a camera shape (the existing reshape transition); cameras wanted as for the scene test, with no display written; the broadcast's own rate, cameras and mounts; status for the window; the camera service on a second thread while broadcasting. |
| `src/profiles/discovered.hpp` | `apply_choices`, `override_current`, `publish_override` take the broadcast pane. |
| `src/viewer/` (new) | `polaris-cam.exe`, the window: settings, a 2×2 preview, an output window per camera. Direct3D 11, copies only. |
| `src/app/companion.cpp`, `app.rc`, `src/bridge/bridge.rc` | The title and file descriptions say it is the Polaris Cam build; the updater is off. |
| `src/camera/mount_config.cpp` | `<windows.h>` in lower case, to build on Linux. |
| `test/`, `build-linux.sh`, `dist/` (new) | The self-test, the build, and the text that goes in the download. |

Not carried over from Taxi Cam's repository: its tests, documentation, installer and Windows build scripts (they are in its
repository at that commit).

## Build

On Linux, with the llvm-mingw release Taxi Cam pins
([20260908](https://github.com/mstorsjo/llvm-mingw/releases/tag/20260908), the `ucrt-ubuntu-22.04-x86_64` archive):

    LLVM_MINGW=/path/to/llvm-mingw-20260908-ucrt-ubuntu-22.04-x86_64 ./build-linux.sh out

It makes `taxi-cam.exe`, `taxi-camera-bridge.dll`, `polaris-cam.exe` and `polaris-cam-selftest.exe` in `out`.
`.github/workflows/build-polaris-cam.yml` does this on every change, tests the result on Windows and publishes it.

## Test

Without a simulator, on Windows (the workflow's `test` job, on the software Direct3D adapter):

    polaris-cam-selftest.exe --verify
    pwsh test/window-test.ps1 -Bin <folder with the .exe files> -Out window-test

The first checks what the bridge decides from the window's request (the request itself, the camera shape it publishes,
how the ticked cameras spread over the simulator's frames) and every kind of picture `BroadcastOutput` makes against the
same arithmetic, under the Direct3D debug layer. The second runs the real window against a stand-in for the bridge, saves
what the screen shows (kept on the `polaris-cam-test` release), and reads each camera's picture back from another process.

`.github/workflows/test-polaris-cam-taxi-cam.yml` puts `src/` over Taxi Cam at the commit it was changed from and runs
Taxi Cam's own validation, which covers what it does with the broadcast off; then, on Taxi Cam's fixture,
`test/broadcast_runtime_validation.cpp`: a stand-in simulator queue draws four camera outputs, submits them through the
real capture manager, and `scene_runtime::service` has to bring each snapshot to its camera's shared picture.

What none of them can show is the part inside the simulator: the views at this size, their cost, and how long it runs.
That is tested by flying.

## How a picture travels

1. The bridge's worker reads the window's request from the shared block and, once the window has asked for the same
   cameras and size for 0.7 s, publishes the aircraft's profile with the ticked cameras' panes at the broadcast size, two
   rows short (1920×1078 or 1280×718: a view that is never the size of one of the simulator's own full-screen textures,
   which the bridge would otherwise have to watch too). The other views keep the aircraft's own small panes, and the
   graphics memory a large view takes. Another shape takes Taxi Cam's reshape transition, which stops every camera for a
   moment.
2. Taxi Cam's camera manager renders the ticked views that have the broadcast shape, at the broadcast rate, and its
   capture manager snapshots each one.
3. `scene_runtime::service` hands each snapshot to that view's `BroadcastOutput`, which converts it on a private queue
   (the two missing rows repeat the first and last) into the one of its three shared textures that is neither the newest
   nor being read, and announces it once the GPU has finished.
4. The window opens the textures by name with Direct3D 11 on the same adapter, says which one it is copying, and copies it
   into its preview and its output window.
