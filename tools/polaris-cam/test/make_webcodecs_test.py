#!/usr/bin/env python3
"""Builds the WebCodecs test page (webcodecs_test.html) with its built-in test clip.

The clip is the encode test's picture (encode_test.cpp: colour patches, a black-to-white strip,
a moving bar and the frame number as 12 cells) drawn at 960x540 for 150 frames and encoded by
ffmpeg's libx264 the way the page expects a Polaris Cam stream: Annex B, High profile, no B
frames, a key frame every 60 frames and one asked for at frame 90, BT.709 limited range.

  python3 make_webcodecs_test.py <page.html> [--variants <dir>]

--variants also writes clips that are wrong on purpose, to check the page's own verdicts:
no SPS/PPS after the first key frame, full range labelled limited, BT.601 labelled BT.709,
no colour labels, a 1080p clip of 300 frames, and the built-in clip as plain .h264.
Needs numpy and an ffmpeg with libx264.
"""
import argparse
import base64
import json
import math
import os
import struct
import subprocess
import sys
import tempfile

import numpy as np

FPS, GOP, FORCED = 30, 60, 90
BACKGROUND = (24, 28, 36)
PATCHES = [("white", 0.04, (255, 255, 255)), ("black", 0.16, (0, 0, 0)), ("gray", 0.28, (128, 128, 128)),
           ("red", 0.40, (230, 30, 30)), ("green", 0.52, (30, 200, 60)), ("blue", 0.64, (30, 60, 230)),
           ("yellow", 0.76, (240, 200, 40)), ("sky", 0.88, (120, 170, 230))]
PATCH_Y, PATCH_W, PATCH_H = 0.06, 0.10, 0.18
GRADIENT = (0.04, 0.32, 0.92, 0.08)
BAR_LANE, BAR_WIDTH, BAR_STEP = (0.04, 0.50, 0.92, 0.14), 0.02, 0.008
COUNTER, BITS = (0.04, 0.80, 0.48, 0.0711), 12
f32 = np.float32


def lround(v):
    v = float(v)
    return int(math.floor(v + 0.5)) if v >= 0 else -int(math.floor(-v + 0.5))


def rect(x, y, w, h, width, height):
    # The same float arithmetic as encode_test.cpp's pixels().
    x, y, w, h = f32(x), f32(y), f32(w), f32(h)
    return (lround(x * f32(width)), lround(y * f32(height)), lround((x + w) * f32(width)), lround((y + h) * f32(height)))


def pattern_json():
    area = lambda a: {"x": a[0], "y": a[1], "w": a[2], "h": a[3]}
    return {"background": list(BACKGROUND),
            "patches": [dict(name=n, **area((x, PATCH_Y, PATCH_W, PATCH_H)), rgb=list(c)) for n, x, c in PATCHES],
            "gradient": area(GRADIENT), "bar": dict(**area(BAR_LANE), width=BAR_WIDTH, step=BAR_STEP),
            "counter": dict(**area(COUNTER), bits=BITS)}


def frames(width, height, count):
    base = np.empty((height, width, 3), np.uint8)
    base[:] = BACKGROUND
    for _, x, colour in PATCHES:
        l, t, r, b = rect(x, PATCH_Y, PATCH_W, PATCH_H, width, height)
        base[t:b, l:r] = colour
    l, t, r, b = rect(*GRADIENT, width, height)
    span = max(1, r - l - 1)
    for x in range(l, r):
        base[t:b, x] = lround(255.0 * (x - l) / span)
    for n in range(count):
        picture = base.copy()
        bar_x = f32(BAR_LANE[0]) + np.fmod(f32(n) * f32(BAR_STEP), f32(BAR_LANE[2]) - f32(BAR_WIDTH))
        l, t, r, b = rect(bar_x, BAR_LANE[1], BAR_WIDTH, BAR_LANE[3], width, height)
        picture[t:b, l:r] = 255
        value = n % (1 << BITS)
        for bit in range(BITS):
            x = f32(COUNTER[0]) + f32(COUNTER[2]) * f32(bit) / f32(BITS)
            l, t, r, b = rect(x, COUNTER[1], f32(COUNTER[2]) / f32(BITS), COUNTER[3], width, height)
            picture[t:b, l:r] = 255 if value >> (BITS - 1 - bit) & 1 else 0
        yield picture


def encode(width, height, count, bitrate, matrix="bt709", out_range="tv", labels=True):
    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "clip.h264")
        command = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", str(FPS),
                   "-i", "-", "-vf", f"scale=out_color_matrix={matrix}:out_range={out_range},format=yuv420p",
                   "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-tune", "zerolatency",
                   "-b:v", str(bitrate), "-maxrate", str(bitrate), "-bufsize", str(bitrate // 2),
                   "-g", str(GOP), "-keyint_min", str(GOP), "-sc_threshold", "0", "-bf", "0",
                   "-force_key_frames", f"expr:eq(n,{FORCED})", "-forced-idr", "1",
                   "-x264-params", "aud=1:sliced-threads=0:repeat-headers=1"]
        if labels:
            command += ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
        command += ["-f", "h264", path]
        encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
        for picture in frames(width, height, count):
            encoder.stdin.write(picture.tobytes())
        encoder.stdin.close()
        if encoder.wait() != 0:
            sys.exit("ffmpeg failed")
        return open(path, "rb").read()


def nal_starts(data):
    """(start code position, NAL type) for each NAL unit."""
    out, p, n = [], 0, len(data)
    while p + 3 <= n:
        if data[p] == 0 and data[p + 1] == 0 and data[p + 2] == 1:
            if p + 3 < n:
                out.append((p, data[p + 3] & 31))
            p += 3
        elif p + 4 <= n and data[p:p + 4] == b"\0\0\0\1":
            if p + 4 < n:
                out.append((p, data[p + 4] & 31))
            p += 4
        else:
            p += 1
    return out


def access_units(stream):
    """Splits x264's output at its access unit delimiters (aud=1)."""
    cuts = [p for p, kind in nal_starts(stream) if kind == 9] + [len(stream)]
    return [stream[a:b] for a, b in zip(cuts, cuts[1:])]


def without_repeated_headers(stream):
    """Only the first picture keeps its SPS and PPS, as from an encoder that sends them once."""
    out = bytearray()
    for number, au in enumerate(access_units(stream)):
        starts = nal_starts(au) + [(len(au), None)]
        for (a, kind), (b, _) in zip(starts, starts[1:]):
            if number == 0 or kind not in (7, 8):
                out += au[a:b]
    return bytes(out)


def pch264(stream, width, height, bitrate, run):
    aus = access_units(stream)
    sps = next(stream[p:] for p, kind in nal_starts(stream) if kind == 7)
    start = 4 if sps[:4] == b"\0\0\0\1" else 3
    codec = "avc1.%02x%02x%02x" % (sps[start + 1], sps[start + 2], sps[start + 3])
    header = {"format": "pch264", "version": 1, "tool": "make_webcodecs_test.py", "encoder": "libx264", "adapter": "", "driver": "",
              "run": run, "stream": 1, "streams": 1, "width": width, "height": height, "fps": FPS, "bitrate": bitrate, "gop": GOP,
              "forcedKey": FORCED, "frames": len(aus), "codec": codec, "latencyMs": None, "sequenceHeader": "", "pattern": pattern_json()}
    body = json.dumps(header, ensure_ascii=False, separators=(",", ":")).encode()
    out = bytearray(b"PCH264v1" + struct.pack("<I", len(body)) + body)
    for index, au in enumerate(aus):
        kinds = {kind for _, kind in nal_starts(au)}
        flags = (1 if 5 in kinds else 0) | (2 if {7, 8} <= kinds else 0)
        out += struct.pack("<IB3xqI", len(au), flags, index * 10_000_000 // FPS, index) + au
    return bytes(out), aus


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("page")
    parser.add_argument("--variants")
    args = parser.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    stream = encode(960, 540, 150, 1_500_000)
    clip, aus = pch264(stream, 960, 540, 1_500_000, "內建測試片")
    keys = [i for i, au in enumerate(aus) if 5 in {kind for _, kind in nal_starts(au)}]
    print(f"built-in clip: {len(aus)} frames, key frames {keys}, {len(clip)} bytes")
    template = open(os.path.join(here, "webcodecs_test.html"), encoding="utf-8").read()
    if template.count("@BUILTIN_CLIP@") != 1:
        sys.exit("webcodecs_test.html has no @BUILTIN_CLIP@")
    with open(args.page, "w", encoding="utf-8") as page:
        page.write(template.replace("@BUILTIN_CLIP@", base64.b64encode(clip).decode()))
    if args.variants:
        os.makedirs(args.variants, exist_ok=True)
        open(os.path.join(args.variants, "builtin.pch264"), "wb").write(clip)
        open(os.path.join(args.variants, "builtin.h264"), "wb").write(stream)
        cases = {"noheaders": None, "fullrange-as-limited": dict(out_range="pc"), "bt601-as-709": dict(matrix="bt601"),
                 "unlabelled": dict(labels=False)}
        for name, options in cases.items():
            variant = without_repeated_headers(stream) if options is None else encode(960, 540, 150, 1_500_000, **options)
            data, _ = pch264(variant, 960, 540, 1_500_000, name)
            open(os.path.join(args.variants, name + ".pch264"), "wb").write(data)
        data, _ = pch264(encode(1920, 1080, 300, 6_000_000), 1920, 1080, 6_000_000, "1080p")
        open(os.path.join(args.variants, "1080p.pch264"), "wb").write(data)
        print("variants in", args.variants)


if __name__ == "__main__":
    main()
