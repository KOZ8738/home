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
the Polaris Cam window asks for it, the views of the cameras ticked in the window are rendered at the broadcast size
instead and each sent out on its own; the others keep their own small size and are not rendered. Nothing is written to the
cockpit displays then. With the broadcast off it behaves as Taxi Cam does.

| File | Change |
| --- | --- |
| `src/shared/broadcast_link.hpp` (new) | The shared-memory block between the bridge and the window: what the window asks for (on, size, rate, cameras, mounts, memory guard, draw distance, anti-aliasing) and what the bridge reports (state, graphics memory, its version, the aircraft path and message as one guarded write, the newest picture of each camera); the memory guard. |
| `src/graphics/broadcast_output.hpp`, `.cpp` (new) | One camera's picture: the snapshot through the simulator's exposure and tone curve (the compositor's conversion, without its bloom) into one of three `B8G8R8A8` textures shared by name; with anti-aliasing on, through an intermediate picture and an FXAA pass. |
| `src/graphics/scene_runtime.hpp`, `.cpp` | While broadcasting, each view's snapshots go to its `BroadcastOutput` instead of the composition. |
| `src/bridge/bridge_main.cpp` | Reads the window's request each pass; the broadcast size as a camera shape (the existing reshape transition); cameras wanted as for the scene test, with no display written, unless the memory guard pauses them; the broadcast's own rate, cameras and mounts; status for the window; the camera service on a second thread while broadcasting. |
| `src/profiles/discovered.hpp` | `apply_choices`, `override_current`, `publish_override` take the broadcast pane. |
| `src/camera/view_clip.hpp`, `.cpp`, `src/camera/probe.hpp`, `.cpp` | `limit_camera_far` caps the far distances each camera view is given (the main view's) at the broadcast's draw distance, set through `request_scene_draw_distance`; `plausible_camera_clip` moved into the header. |
| `src/viewer/` (new) | `polaris-cam.exe`, the window: settings, a 2×2 preview, an output window per camera (each remembers where it was), camera positions with presets the user can replace per aircraft. Direct3D 11, copies only. |
| `src/viewer/remote_stream.hpp`, `.cpp`, `h264_encoder.hpp`, `.cpp` (new) | The cameras sent to the website's back office ("後台監看") over one WebSocket to its relay: at most 960×540, as H.264 from the graphics card's own encoder (Media Foundation), or as JPEG where there is none; only while someone there watches. With no link, the automatic mode: as the pilot Polaris Navdata on the PC is paired as (its key from `%LOCALAPPDATA%\Polaris Navdata\cloud.json`, under the Windows user's DPAPI, buys a one-use ticket at `POST /api/nav/ticket` for `/live/cam/pilot/ws`); a link may be the Broadcast one or a pilot's own (`/live/cam/p/<pilot>/<token>`). |
| `src/app/companion.cpp`, `app.rc`, `src/bridge/bridge.rc` | The title and file descriptions say it is the Polaris Cam build; the updater is off. |
| `src/camera/mount_config.cpp` | `<windows.h>` in lower case, to build on Linux. |
| `test/`, `build-linux.sh`, `dist/` (new) | The self-test, the build, and the text that goes in the download. |

Not carried over from Taxi Cam's repository: its tests, documentation, installer and Windows build scripts (they are in its
repository at that commit).

## Build

On Linux, with the llvm-mingw release Taxi Cam pins
([20260908](https://github.com/mstorsjo/llvm-mingw/releases/tag/20260908), the `ucrt-ubuntu-22.04-x86_64` archive):

    LLVM_MINGW=/path/to/llvm-mingw-20260908-ucrt-ubuntu-22.04-x86_64 ./build-linux.sh out

It makes `taxi-cam.exe`, `taxi-camera-bridge.dll`, `polaris-cam.exe` and `polaris-cam-selftest.exe` in `out`; named as a
target, `remotetest` also makes `polaris-cam-remote-test.exe`, the back-office stream against a stand-in relay.
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

While the simulator's process has less than 0.8 GB of the graphics memory budget Windows gives it left, the memory guard
stops wanting the cameras: the views park as with the broadcast off, but keep their size, their textures and their last
pictures, and render again once 1.6 GB has been free for 15 s. The readings are the bridge's existing once-a-second
`QueryVideoMemoryInfo` ones; the window can turn the guard off.

MSFS draws a render-to-texture view such as these without its anti-aliasing or post passes (Taxi Cam's architecture notes,
camera AA), so the window can ask for FXAA instead: `BroadcastOutput` then converts each snapshot into an intermediate
picture and runs an FXAA pass (after the quality version of Timothy Lottes' algorithm, written here) from it into the
shared texture. If that shader does not compile, the pictures go out without it.

The window can also ask for a draw distance. Taxi Cam gives each camera view's camera the main view's far distances (the
culling frustum's far and the default far that the depth range and the shared object-LOD viewer list read, about 357 km in
MSFS 2024) before every view update; while broadcasting, both are capped at the distance asked for, from the next update
on, and the main view's come back when the broadcast stops.

The shared block has a name of its own for each version of its layout (`Local\PolarisCam.Link.4` in 0.2.0), since the
bridge stays in the simulator until it exits: a window of a newer version finds a bridge of an older one under the older
name (`Link.1`: 0.1.0 and 0.1.1; `Link.2`: 0.1.2; `Link.3`: 0.1.3 to 0.1.5), and says that the simulator has to be
restarted. Version 4 adds to 0.1.5's layout the guard on the aircraft path and the message (`text_serial`, in the last
four bytes of the old message): the window never reads half of one and half of the next.

## Versions

- 0.1.1: only the ticked cameras are made broadcast size.
- 0.1.2: the cameras pause while graphics memory runs out (the memory guard).
- 0.1.3: the window chooses how far the cameras draw.
- 0.1.4: a camera's position can replace one of the presets, per aircraft.
- 0.1.5: FXAA over the broadcast pictures.
- 0.2.0: all of these together with a failed camera shown as failed and tried again, the size the bridge sends in the
  status line, plainer labels and the key help collapsed, the OBS windows' places remembered, an fps from the ini shown as
  it is sent, the guarded aircraft path and message, and the cameras sent to the back office (JPEG, then H.264 from the
  graphics card).
- 0.3.0: the back office without a link: the link left empty, Polaris Cam connects as the pilot Polaris Navdata on the
  PC is paired as (not paired yet, it connects once the pilot pairs; the pairing refused, once it is paired again), and
  takes a pilot's own link (`/live/cam/p/<pilot>/<token>`) beside the Broadcast one. The shared block is still version 4.
