// Polaris Cam: the test of the back-office stream (src/viewer/remote_stream.cpp), on Windows.
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
//
//   polaris-cam-remote-test.exe        (Node.js 18 or later on PATH)
//
// First the parts on their own: links, the picture header, the hello, the
// relay's messages, NAL units, the halving, and the H.264 encoder on this
// computer's graphics card (its NV12 colours, key pictures, P pictures, a key
// picture when asked). Then the real thing against a stand-in for the
// website's relay: a WebSocket server written here in plain Node (http +
// crypto, RFC 6455), started on 127.0.0.1 with a port of its own. It checks
// what arrives (the hello's JSON, every picture's header and sequence, each
// JPEG, each H.264 picture's NAL units and its SPS's size and colour) and
// plays the relay's part: watch 1 and 0, a key picture asked for, a network
// that stops, a close with 4004, 1011 and 4000, a refused link, one that never
// answers. Its findings come back as lines on its output. Camera 0's pictures
// are copied from a Direct3D 11 texture on the software adapter, as the window
// does with the bridge's. Without a hardware H.264 encoder only JPEG is tested.
// Exit code 0 when everything held.
#include "../src/viewer/remote_stream.hpp"
#include "../src/viewer/h264_encoder.hpp"
#include <d3d11_1.h>
#include <wincodec.h>
#include <windows.h>
#include <psapi.h>
#include <algorithm>
#include <chrono>
#include <clocale>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cwchar>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {
using namespace polaris_cam::remote;

int failures = 0;
void check(bool ok, const char* what, int line) {
  if (!ok) {
    ++failures;
    std::printf("FAIL (line %d): %s\n", line, what);
    std::fflush(stdout);
  }
}
#define CHECK(condition) check((condition), #condition, __LINE__)

std::uint64_t now_ms() {
  return GetTickCount64();
}
void sleep_ms(unsigned ms) {
  std::this_thread::sleep_for(std::chrono::milliseconds(ms));
}
// A short sleep of about 1 ms (Sleep's is 15.6 ms on most computers): the
// bridge's 30 pictures a second have to be kept to.
void nap() {
  static thread_local HANDLE timer = [] {
    HANDLE t = CreateWaitableTimerExW(nullptr, nullptr, 0x00000002 /* high resolution */, TIMER_ALL_ACCESS);
    return t ? t : CreateWaitableTimerExW(nullptr, nullptr, 0, TIMER_ALL_ACCESS);
  }();
  LARGE_INTEGER due{};
  due.QuadPart = -10000;
  if (timer && SetWaitableTimer(timer, &due, 0, nullptr, nullptr, FALSE))
    WaitForSingleObject(timer, 100);
  else
    Sleep(1);
}

// --- the parts on their own ------------------------------------------------------
void test_parse() {
  Endpoint e;
  CHECK(parse_url(L"https://example.com/live/cam/abc123", e) && e.host == L"example.com" && e.port == 443 && e.secure &&
        e.path == L"/live/cam/abc123/ws" && !e.local);
  CHECK(parse_url(L"  wss://Example.COM:8443/live/cam/Ab_c-9/ws \r\n", e) && e.host == L"example.com" && e.port == 8443 && e.secure &&
        e.path == L"/live/cam/Ab_c-9/ws");
  CHECK(parse_url(L"wss://cam.example.org/live/cam/tok", e) && e.port == 443 && e.secure && e.path == L"/live/cam/tok/ws");
  CHECK(parse_url(L"https://example.com/live/cam/tok/", e) && e.path == L"/live/cam/tok/ws");
  CHECK(parse_url(L"https://example.com/live/cam/tok?from=admin#x", e) && e.path == L"/live/cam/tok/ws");
  CHECK(parse_url(L"http://127.0.0.1:8787/live/cam/tok", e) && !e.secure && e.local && e.port == 8787 && e.host == L"127.0.0.1");
  CHECK(parse_url(L"ws://localhost:9000/live/cam/tok/ws", e) && !e.secure && e.local && e.port == 9000);
  CHECK(parse_url(L"http://localhost/live/cam/tok", e) && !e.secure && e.port == 80);
  // Not this computer: TLS whatever the link says.
  CHECK(parse_url(L"http://example.com/live/cam/tok", e) && e.secure && e.port == 443 && !e.local);
  CHECK(parse_url(L"ws://192.168.1.20:8787/live/cam/tok/ws", e) && e.secure && e.port == 8787);
  for (const wchar_t* bad :
       {L"", L"   ", L"example.com/live/cam/tok", L"ftp://example.com/live/cam/tok", L"https://example.com/live/cam/",
        L"https://example.com/live/cam", L"https://example.com/live/cam/a/b", L"https://example.com/live/cam/a/ws/x",
        L"https://user@example.com/live/cam/tok", L"https://example.com:0/live/cam/tok", L"https://example.com:99999/live/cam/tok",
        L"https://example.com:/live/cam/tok", L"https://example.com/other/cam/tok", L"https://[::1]/live/cam/tok",
        L"https://example.com/live/cam/to ken", L"https:///live/cam/tok", L"https://example.com/live/cam/..",
        L"https://example.com/LIVE/cam/tok", L"連線碼"}) {
    if (parse_url(bad, e)) {
      std::printf("FAIL: taken as a link: \"%ls\"\n", bad);
      ++failures;
    }
  }
}
void test_header() {
  unsigned char h[HeaderSize];
  std::memset(h, 0xEE, sizeof(h));
  write_header(h, 2, Codec::jpeg, false, 960, 540, 200, 0x01020304u);
  const unsigned char want[HeaderSize]{0x50, 1, 2, 1, 1, 0, 0xC0, 0x03, 0x1C, 0x02, 200, 0, 0x04, 0x03, 0x02, 0x01};
  CHECK(std::memcmp(h, want, HeaderSize) == 0);  // a JPEG is always a key picture
  write_header(h, 0, Codec::jpeg, true, 640, 360, 200, 1);
  CHECK(h[2] == 0 && h[6] == 0x80 && h[7] == 0x02 && h[8] == 0x68 && h[9] == 0x01 && h[12] == 1 && h[13] == 0 && h[14] == 0 && h[15] == 0);
  write_header(h, 3, Codec::h264, true, 960, 540, 33, 7);
  const unsigned char key[HeaderSize]{0x50, 1, 3, 2, 1, 0, 0xC0, 0x03, 0x1C, 0x02, 33, 0, 7, 0, 0, 0};
  CHECK(std::memcmp(h, key, HeaderSize) == 0);
  write_header(h, 1, Codec::h264, false, 640, 360, 33, 0x10000u);
  const unsigned char p[HeaderSize]{0x50, 1, 1, 2, 0, 0, 0x80, 0x02, 0x68, 0x01, 33, 0, 0, 0, 1, 0};
  CHECK(std::memcmp(h, p, HeaderSize) == 0);
  write_header(h, 0, Codec::h264, false, 4096, 4096, 300000, 1);
  CHECK(h[10] == 0xFF && h[11] == 0xFF);  // at most 65535
}
void test_json() {
  std::array<CamInfo, Cams> cams{};
  cams[0] = {true, L"二排中", 960, 540};
  cams[1] = {false, L"A\"B\\C\n", 960, 540};
  auto hello = hello_json(cams);
  std::printf("hello: %s\n", hello.c_str());
  CHECK(hello.rfind("{\"t\":\"hello\",\"v\":\"", 0) == 0);
  CHECK(hello.find("\"mode\":\"jpeg\",\"cams\":[{\"i\":0,\"name\":\"\xE4\xBA\x8C\xE6\x8E\x92\xE4\xB8\xAD\",\"on\":true,\"w\":960,\"h\":540,"
                   "\"codec\":\"jpeg\"}") != std::string::npos);
  CHECK(hello.find("{\"i\":1,\"name\":\"A\\\"B\\\\C\\n\",\"on\":false,\"w\":960,\"h\":540,\"codec\":\"jpeg\"}") != std::string::npos);
  CHECK(hello.find("{\"i\":3,\"name\":\"\",\"on\":false,\"w\":0,\"h\":0,\"codec\":\"jpeg\"}]}") != std::string::npos);
  // H.264 when a camera that is on goes so; one that is off does not count.
  cams[1].codec = Codec::h264;
  CHECK(hello_json(cams).find("\"mode\":\"jpeg\"") != std::string::npos);
  CHECK(hello_json(cams).find("{\"i\":1,\"name\":\"A\\\"B\\\\C\\n\",\"on\":false,\"w\":960,\"h\":540,\"codec\":\"h264\"}") != std::string::npos);
  cams[0].codec = Codec::h264;
  hello = hello_json(cams);
  std::printf("hello: %s\n", hello.c_str());
  CHECK(hello.find("\"mode\":\"h264\"") != std::string::npos);
  CHECK(hello.find("\"on\":true,\"w\":960,\"h\":540,\"codec\":\"h264\"}") != std::string::npos);
  CHECK(json_escape(std::string("\x01", 1)) == "\\u0001");
  CHECK(watch_count("{\"t\":\"watch\",\"n\":3}") == 3);
  CHECK(watch_count("{ \"n\" : 0 , \"t\" : \"watch\" }") == 0);
  CHECK(watch_count("{\"t\":\"watch\",\"n\":-2}") == 0);
  CHECK(watch_count("{\"t\":\"key\",\"cam\":0}") == -1);
  CHECK(watch_count("{\"t\":\"watch\"}") == -1);
  CHECK(watch_count("pong") == -1);
  CHECK(watch_count("{\"x\":\"t\",\"t\":\"watch\",\"n\":12}") == 12);
  CHECK(key_request("{\"t\":\"key\",\"cam\":0}") == 0);
  CHECK(key_request("{ \"cam\" : 3, \"t\" : \"key\" }") == 3);
  CHECK(key_request("{\"t\":\"key\",\"cam\":4}") == -1);
  CHECK(key_request("{\"t\":\"key\",\"cam\":-1}") == -1);
  CHECK(key_request("{\"t\":\"key\"}") == -1);
  CHECK(key_request("{\"t\":\"key\",\"cam\":\"1\"}") == 1);
  CHECK(key_request("{\"t\":\"watch\",\"n\":1}") == -1);
}

// --- NAL units ------------------------------------------------------------------------
void test_nal() {
  // AUD, SPS, PPS, IDR; then a P picture.
  const std::vector<unsigned char> key{0, 0, 0, 1, 0x09, 0x10, 0, 0, 0, 1, 0x67, 0x64, 0x00, 0x1F, 0xAC,
                                       0, 0, 1,    0x68, 0xEE, 0x3C, 0xB0, 0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00};
  NalScan scan = scan_nals(key.data(), key.size());
  CHECK(scan.count == 4 && scan.idr && scan.sps && scan.pps && !scan.slice);
  const std::vector<unsigned char> p{0, 0, 0, 1, 0x09, 0x30, 0, 0, 0, 1, 0x41, 0x9A, 0x02};
  scan = scan_nals(p.data(), p.size());
  CHECK(scan.count == 2 && scan.slice && !scan.idr && !scan.sps);
  const auto sets = parameter_sets(key.data(), key.size());
  const std::vector<unsigned char> want_sets{0, 0, 0, 1, 0x67, 0x64, 0x00, 0x1F, 0xAC, 0, 0, 0, 1, 0x68, 0xEE, 0x3C, 0xB0};
  CHECK(sets == want_sets);
  // An IDR on its own gets the sequence header, after its AUD.
  std::vector<unsigned char> bare{0, 0, 0, 1, 0x09, 0x10, 0, 0, 0, 1, 0x65, 0x88, 0x84};
  CHECK(complete_key_frame(bare, sets));
  std::vector<unsigned char> want{0, 0, 0, 1, 0x09, 0x10};
  want.insert(want.end(), sets.begin(), sets.end());
  want.insert(want.end(), {0, 0, 0, 1, 0x65, 0x88, 0x84});
  CHECK(bare == want);
  std::vector<unsigned char> no_aud{0, 0, 1, 0x65, 0x88};
  CHECK(complete_key_frame(no_aud, sets) && no_aud.size() == sets.size() + 5 && no_aud[4] == 0x67);
  std::vector<unsigned char> whole = key;
  CHECK(complete_key_frame(whole, sets) && whole == key);  // has them: as it is
  std::vector<unsigned char> pp = p;
  CHECK(!complete_key_frame(pp, sets) && pp == p);
  CHECK(h264_bitrate(960, 540) == 2000000 && h264_bitrate(640, 360) == 1200000);
  CHECK(h264_bitrate(1920, 1080) == 8000000);
}

// A picture to encode, which moves: BGRA rows of width + 256, read from a
// shifting start. Blue across, green down, red in stripes.
struct Moving {
  unsigned width, height;
  std::size_t stride;
  std::vector<unsigned char> pixels;
  Moving(unsigned w, unsigned h, bool noise) : width(w), height(h), stride((std::size_t{w} + 256) * 4), pixels(stride * h) {
    unsigned seed = 12345;
    for (unsigned y = 0; y < h; ++y)
      for (unsigned x = 0; x < w + 256; ++x) {
        unsigned char* p = pixels.data() + y * stride + std::size_t{x} * 4;
        if (noise) {
          seed = seed * 1103515245u + 12345u;
          p[0] = static_cast<unsigned char>(seed >> 24);
          p[1] = static_cast<unsigned char>(seed >> 16);
          p[2] = static_cast<unsigned char>(seed >> 8);
        } else {
          p[0] = static_cast<unsigned char>(x * 255 / (w + 255));
          p[1] = static_cast<unsigned char>(y * 255 / (h - 1));
          p[2] = ((x / 40 + y / 40) & 1) ? 200 : 40;
        }
        p[3] = 255;
      }
  }
  const unsigned char* frame(unsigned n) const { return pixels.data() + std::size_t{(n * 4) % 256} * 4; }
};

// The encoder on its own, on this computer's graphics card.
bool hardware = false;
void test_encoder() {
  std::printf("== H.264 encoder on its own\n");
  hardware = hardware_h264_available();
  std::printf("  hardware H.264 encoder: %s\n", hardware ? "yes" : "no");
  if (!hardware) {
    std::printf("  (none on this computer: the H.264 tests below are skipped, JPEG takes over)\n");
    return;
  }
  // 1. Colour: quarters of white, black, red and grey, 1920 x 1080 into 960 x 540 NV12.
  {
    std::vector<unsigned char> card(1920 * 1080 * 4);
    for (unsigned y = 0; y < 1080; ++y)
      for (unsigned x = 0; x < 1920; ++x) {
        unsigned char* p = card.data() + (std::size_t{y} * 1920 + x) * 4;
        const unsigned q = x / 480;
        const unsigned char white[4]{255, 255, 255, 255}, black[4]{0, 0, 0, 255}, red[4]{0, 0, 255, 255}, grey[4]{128, 128, 128, 255};
        std::memcpy(p, q == 0 ? white : q == 1 ? black : q == 2 ? red : grey, 4);
      }
    H264Encoder encoder;
    EncoderSettings settings;
    settings.in_width = 1920;
    settings.in_height = 1080;
    settings.out_width = 960;
    settings.out_height = 540;
    const bool opened = encoder.open(settings);
    if (!opened)
      std::printf("  open failed: %ls\n", encoder.last_error().c_str());
    CHECK(opened);
    if (!opened)
      return;
    std::printf("  encoder: %ls\n", encoder.description().c_str());
    std::printf("  \"no B pictures\" answered 0x%08lX%s\n", static_cast<unsigned long>(encoder.stats().b_frames),
                encoder.stats().b_frames == E_INVALIDARG ? " (E_INVALIDARG: not fatal, low latency makes none)" : "");
    std::vector<EncodedFrame> out;
    CHECK(encoder.encode_bgra(card.data(), 1920, 1080, 1920 * 4, 1000, out));
    std::vector<unsigned char> nv12;
    CHECK(encoder.last_nv12(nv12) && nv12.size() == 960 * 540 * 3 / 2);
    if (nv12.size() == 960 * 540 * 3 / 2) {
      struct Want {
        const char* name;
        int y, u, v;
      };
      // BT.709 limited range: Y = 16 + 219 Y', Cb/Cr = 128 + 224 (B'-Y')/1.8556, (R'-Y')/1.5748.
      const Want want[4]{{"white", 235, 128, 128}, {"black", 16, 128, 128}, {"red", 63, 102, 240}, {"grey", 126, 128, 128}};
      int worst = 0;
      for (unsigned q = 0; q < 4; ++q) {
        const unsigned x = q * 240 + 120, y = 270;
        const int Y = nv12[std::size_t{y} * 960 + x];
        const unsigned char* uv = nv12.data() + 960 * 540 + std::size_t{y / 2} * 960 + (x & ~1u);
        std::printf("  NV12 %-5s Y %3d Cb %3d Cr %3d (BT.709 16..235: %d %d %d)\n", want[q].name, Y, uv[0], uv[1], want[q].y, want[q].u,
                    want[q].v);
        worst = std::max({worst, std::abs(Y - want[q].y), std::abs(uv[0] - want[q].u), std::abs(uv[1] - want[q].v)});
      }
      CHECK(worst <= 3);
    }
    // 1280 x 720 into 640 x 360, its own bit rate.
    settings.in_width = 1280;
    settings.in_height = 720;
    settings.out_width = 640;
    settings.out_height = 360;
    CHECK(encoder.open(settings));
    std::vector<unsigned char> hd720(1280 * 720 * 4, 90);
    out.clear();
    CHECK(encoder.encode_bgra(hd720.data(), 1280, 720, 1280 * 4, 0, out));
    CHECK(out.empty() || (out[0].key && scan_nals(out[0].data.data(), out[0].data.size()).sps));
  }
  // 2. A moving picture at 30 a second for 3 s: a key picture first, P pictures,
  //    a key picture when asked (picture 45), and every 60 on its own.
  {
    H264Encoder encoder;
    EncoderSettings settings;
    settings.in_width = 1920;
    settings.in_height = 1080;
    settings.out_width = 960;
    settings.out_height = 540;
    CHECK(encoder.open(settings));
    const Moving moving(1920, 1080, false);
    std::vector<EncodedFrame> out;
    std::vector<int> keys;
    unsigned pictures = 0, bad = 0;
    std::size_t bytes = 0, largest = 0;
    const auto began = now_ms();
    for (unsigned n = 0; n < 90; ++n) {
      if (n == 45)
        encoder.request_keyframe();
      const std::size_t before = out.size();
      if (!encoder.encode_bgra(moving.frame(n), 1920, 1080, moving.stride, began + n * 33, out)) {
        std::printf("  encode failed: %ls\n", encoder.last_error().c_str());
        ++bad;
        break;
      }
      for (std::size_t i = before; i < out.size(); ++i) {
        const auto& f = out[i];
        const NalScan scan = scan_nals(f.data.data(), f.data.size());
        if (f.key) {
          keys.push_back(static_cast<int>(pictures));
          if (!(scan.sps && scan.pps && scan.idr))
            ++bad;
        } else if (!scan.slice || scan.idr) {
          ++bad;
        }
        bytes += f.data.size();
        largest = std::max(largest, f.data.size());
        ++pictures;
      }
      const auto next = began + (n + 1) * 33;
      while (now_ms() < next)
        nap();
    }
    const auto& stats = encoder.stats();
    std::printf("  90 pictures in: %u out, %zu bytes (largest %zu), key pictures at", pictures, bytes, largest);
    for (int k : keys)
      std::printf(" %d", k);
    std::printf("\n  encode_bgra: %.2f ms on average, %.2f ms at most (upload, NV12, encoder, output); forced %llu, SPS/PPS added %llu\n",
                stats.call_ms_total / static_cast<double>(std::max<std::uint64_t>(stats.inputs, 1)), stats.call_ms_max,
                static_cast<unsigned long long>(stats.forced_keys), static_cast<unsigned long long>(stats.headers_added));
    std::printf("  sequence header %zu bytes\n", encoder.sequence_header().size());
    CHECK(bad == 0);
    CHECK(pictures >= 88);
    CHECK(!keys.empty() && keys[0] == 0);
    // Asked at 45: within a few; then 60 on.
    CHECK(std::any_of(keys.begin(), keys.end(), [](int k) { return k >= 45 && k <= 48; }));
    CHECK(std::none_of(keys.begin(), keys.end(), [](int k) { return k > 0 && k < 45; }));
    CHECK(!encoder.sequence_header().empty());
    // Closed at once: the card's encoder session goes with it.
    const auto before = now_ms();
    encoder.close();
    const auto took = now_ms() - before;
    std::printf("  closed in %llu ms\n", static_cast<unsigned long long>(took));
    CHECK(took < 200 && !encoder.is_open());
  }
}
void test_shrink() {
  unsigned w = 0, h = 0;
  output_size(1920, 1080, w, h);
  CHECK(w == 960 && h == 540);
  output_size(1280, 720, w, h);
  CHECK(w == 640 && h == 360);
  output_size(960, 540, w, h);
  CHECK(w == 960 && h == 540);
  output_size(640, 360, w, h);
  CHECK(w == 640 && h == 360);
  // 1920 x 2: one row of 960, each the average of its 2 x 2.
  std::vector<unsigned char> source(1920 * 2 * 4 + 64, 0);
  const std::size_t stride = 1920 * 4 + 64;  // a row pitch wider than the row, as a mapped texture's may be
  source.resize(stride * 2);
  auto at = [&](unsigned x, unsigned y) { return source.data() + y * stride + x * 4; };
  const unsigned char a[4]{10, 20, 30, 255}, b[4]{20, 40, 60, 255}, c[4]{30, 60, 90, 255}, d[4]{41, 80, 121, 255};
  std::memcpy(at(0, 0), a, 4);
  std::memcpy(at(1, 0), b, 4);
  std::memcpy(at(0, 1), c, 4);
  std::memcpy(at(1, 1), d, 4);
  std::vector<unsigned char> out;
  shrink_to_bgr(source.data(), 1920, 2, stride, out, w, h);
  CHECK(w == 960 && h == 1 && out.size() == 960 * 3);
  CHECK(out[0] == 25 && out[1] == 50 && out[2] == 75);    // (10+20+30+41+2)/4 = 25
  shrink_to_bgr(source.data(), 2, 2, stride, out, w, h);  // not halved: BGR as it is
  CHECK(w == 2 && h == 2 && out[0] == 10 && out[3] == 20 && out[6] == 30 && out[8] == 90);
}

// --- the stand-in for the relay -----------------------------------------------------
constexpr char Relay[] = R"JS(
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const outDir = process.argv[2];
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const counts = {}, conns = {};
function onUpgrade(req, socket) {
  const m = /^\/live\/cam\/([A-Za-z0-9_-]+)\/ws$/.exec(req.url);
  const token = m ? m[1] : '';
  if (!m || token === 'missing') {
    log('REFUSED', token || req.url);
    socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    return;
  }
  if (token === 'hang') { log('HANGING'); socket.on('error', () => {}); return; }  // never answers
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13') log('BADUPGRADE', token);
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  counts[token] = (counts[token] || 0) + 1;
  log('CONNECT', token, counts[token]);
  conns[token] = new Conn(socket, token, counts[token]);
}
function frame(op, payload) {
  const n = payload.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, payload]);
}
// Annex-B NAL units: [type, payload without start code]
function nals(b) {
  const out = []; let start = -1;
  for (let i = 0; i + 2 < b.length; i++) {
    if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1) {
      if (start >= 0) { let end = i; while (end > start && b[end - 1] === 0) end--; out.push(b.subarray(start, end)); }
      start = i + 3; i += 2;
    }
  }
  if (start >= 0 && start < b.length) out.push(b.subarray(start));
  return out.map(n => [n[0] & 0x1f, n]);
}
// The size and colour an SPS says (High profile and the rest).
function sps(nal) {
  const b = [];
  for (let i = 1; i < nal.length; i++) { if (i >= 3 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue; b.push(nal[i]); }
  let pos = 0;
  const bit = () => (b[pos >> 3] >> (7 - (pos++ & 7))) & 1, bits = n => { let v = 0; while (n--) v = v * 2 + bit(); return v; };
  const ue = () => { let z = 0; while (!bit() && z < 32) z++; return (2 ** z) - 1 + bits(z); }, se = () => { const k = ue(); return k & 1 ? (k + 1) / 2 : -(k / 2); };
  const profile = bits(8); bits(8); const level = bits(8); ue();
  let chroma = 1;
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
    chroma = ue(); if (chroma === 3) bit(); ue(); ue(); bit();
    if (bit()) for (let i = 0; i < (chroma !== 3 ? 8 : 12); i++) if (bit()) { let last = 8, next = 8; for (let j = 0; j < (i < 6 ? 16 : 64); j++) { if (next) next = (last + se() + 256) % 256; last = next || last; } }
  }
  ue(); const poc = ue(); if (poc === 0) ue(); else if (poc === 1) { bit(); se(); se(); const n = ue(); for (let i = 0; i < n; i++) se(); }
  const refs = ue(); bit(); const wmb = ue() + 1, hmu = ue() + 1, fmo = bit(); if (!fmo) bit(); bit();
  let cl = 0, cr = 0, ct = 0, cb = 0; if (bit()) { cl = ue(); cr = ue(); ct = ue(); cb = ue(); }
  const r = { profile, level, refs, w: wmb * 16 - 2 * (cl + cr), h: hmu * 16 * (2 - fmo) - 2 * (2 - fmo) * (ct + cb), full: -1, primaries: -1, transfer: -1, matrix: -1, reorder: -1 };
  if (bit()) {  // VUI
    if (bit()) { if (bits(8) === 255) bits(32); }
    if (bit()) bit();
    if (bit()) { bits(3); r.full = bit(); if (bit()) { r.primaries = bits(8); r.transfer = bits(8); r.matrix = bits(8); } }
    if (bit()) { ue(); ue(); }
    if (bit()) { bits(32); bits(32); bit(); }
    const hrd = () => { const n = ue() + 1; bits(4); bits(4); for (let i = 0; i < n; i++) { ue(); ue(); bit(); } bits(5); bits(5); bits(5); bits(5); };
    const nal_hrd = bit(); if (nal_hrd) hrd(); const vcl_hrd = bit(); if (vcl_hrd) hrd(); if (nal_hrd || vcl_hrd) bit();
    bit();
    if (bit()) { bit(); ue(); ue(); ue(); ue(); r.reorder = ue(); ue(); }
  }
  return r;
}
)JS"
    R"JS(class Conn {
  constructor(s, token, n) {
    Object.assign(this, { s, token, n, buf: Buffer.alloc(0), frag: null, fragOp: 0, watching: false, unwatchedAt: 0, lastSeq: [0, 0, 0, 0],
                          valid: 0, h264: [0, 0, 0, 0], jpegs: 0, closed: false, closeSent: false, helloSeen: false, hello: null,
                          onframe: null, keyAsk: null, stalled: false, afterResume: 0, gapKeys: 0 });
    s.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    s.on('close', () => log('SOCKETCLOSED', token, n));
    s.on('error', e => log('SOCKETERROR', token, e.code));
  }
  send(op, data) { if (!this.closed) this.s.write(frame(op, Buffer.isBuffer(data) ? data : Buffer.from(data))); }
  text(t) { this.send(1, t); }
  close(code, reason) {
    const p = Buffer.alloc(2 + Buffer.byteLength(reason)); p.writeUInt16BE(code, 0); p.write(reason, 2);
    this.send(8, p); this.closeSent = true; log('SERVERCLOSE', this.token, code);
  }
  watch(n) { this.watching = n > 0; if (!this.watching) this.unwatchedAt = Date.now(); log('WATCH', this.token, n); this.text('{"t":"watch","n":' + n + '}'); }
  parse() {
    for (;;) {
      if (this.stalled) return;
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1], fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let n = b1 & 0x7f, off = 2;
      if (n === 126) { if (this.buf.length < 4) return; n = this.buf.readUInt16BE(2); off = 4; }
      else if (n === 127) { if (this.buf.length < 10) return; n = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      const start = off + (masked ? 4 : 0), end = start + n;
      if (this.buf.length < end) return;
      if (!masked) log('UNMASKED', this.token);
      const payload = Buffer.from(this.buf.subarray(start, end));
      if (masked) { const mask = this.buf.subarray(off, off + 4); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]; }
      this.buf = this.buf.subarray(end);
      if (op === 0) { this.frag = Buffer.concat([this.frag, payload]); if (fin) { const p = this.frag; this.frag = null; this.message(this.fragOp, p); } }
      else if (op === 1 || op === 2) { if (fin) this.message(op, payload); else { this.frag = payload; this.fragOp = op; } }
      else if (op === 8) {
        log('CLIENTCLOSE', this.token, payload.length >= 2 ? payload.readUInt16BE(0) : 1005);
        if (!this.closeSent) this.send(8, payload.subarray(0, 2));
        this.closed = true; this.s.end(); return;
      }
      else if (op === 9) this.send(10, payload);
    }
  }
  message(op, p) {
    if (op === 2) return this.binary(p);
    const t = p.toString('utf8');
    if (t === 'ping') { log('PING', this.token); this.text('pong'); return; }
    let j;
    try { j = JSON.parse(t); } catch { log('BADTEXT', this.token, JSON.stringify(t)); return; }
    if (j.t !== 'hello') { log('TEXT', this.token, t); return; }
    const codecs = Array.isArray(j.cams) ? j.cams.map(c => c.codec) : [];
    const onH264 = Array.isArray(j.cams) && j.cams.some(c => c.on && c.codec === 'h264');
    const ok = typeof j.v === 'string' && j.v.length > 0 && (j.mode === 'jpeg' || j.mode === 'h264') && Array.isArray(j.cams) && j.cams.length === 4 &&
      j.cams.every((c, i) => c.i === i && typeof c.name === 'string' && typeof c.on === 'boolean' && c.w > 0 && c.h > 0 &&
                              (c.codec === 'jpeg' || c.codec === 'h264')) &&
      (j.mode === 'h264') === onH264 && j.cams[0].on === true && j.cams[0].name === '機長側 "左"';
    this.hello = j;
    log(ok ? 'HELLO_OK' : 'HELLO_BAD', this.token, 'mode=' + j.mode, 'codecs=' + codecs.join(','),
        'sizes=' + (j.cams || []).map(c => c.w + 'x' + c.h).join(','));
    if (!this.helloSeen) { this.helloSeen = true; scenario(this); }
  }
  binary(p) {
    if (!this.watching) {
      const late = this.unwatchedAt && Date.now() - this.unwatchedAt < 500;
      log(late ? 'INFLIGHTFRAME' : 'EARLYFRAME', this.token, p.length);
      return;
    }
    let why = '';
    if (p.length < 18) why = 'short';
    else if (p.length > 1048576) why = 'long';
    else if (p[0] !== 0x50) why = 'magic'; else if (p[1] !== 1) why = 'version'; else if (p[3] !== 1 && p[3] !== 2) why = 'codec';
    else if (p[5] !== 0) why = 'reserved';
    if (why) { log('BADFRAME', this.token, why); return; }
    const cam = p[2], codec = p[3], key = p[4] === 1, w = p.readUInt16LE(6), h = p.readUInt16LE(8), dur = p.readUInt16LE(10), seq = p.readUInt32LE(12);
    const body = p.subarray(16);
    const want = this.hello && this.hello.cams[cam];
    if (cam > 3) why = 'cam ' + cam;
    else if (!want || want.w !== w || want.h !== h) why = 'size ' + w + 'x' + h + ' hello ' + (want ? want.w + 'x' + want.h : '-');
    else if (seq <= this.lastSeq[cam]) why = 'seq ' + seq + ' after ' + this.lastSeq[cam];
    if (why) { log('BADFRAME', this.token, why); return; }
    const gap = this.lastSeq[cam] === 0 || seq !== this.lastSeq[cam] + 1;
    this.lastSeq[cam] = seq;
    if (codec === 1) return this.jpeg(cam, key, w, h, dur, seq, body);
    // H.264: Annex-B; a key picture is AUD? SPS PPS IDR, and nothing that cannot be decoded is ever sent.
    const list = nals(body), types = list.map(x => x[0]);
    const idr = types.includes(5), hasSps = types.includes(7), hasPps = types.includes(8), slice = types.includes(1);
    if (dur !== 33) why = 'duration ' + dur;
    else if (p[4] > 1) why = 'flags ' + p[4];
    else if (key !== idr) why = 'key flag ' + key + ' but IDR ' + idr;
    else if (key && !(hasSps && hasPps && types.indexOf(7) < types.indexOf(8) && types.indexOf(8) < types.indexOf(5))) why = 'key without SPS PPS: ' + types;
    else if (!key && !slice) why = 'no slice: ' + types;
    else if (gap && !key) why = 'P picture after a gap (seq ' + seq + ')';
    else if (want.codec !== 'h264') why = 'H.264 of a JPEG camera';
    if (!why && hasSps) {
      const s = sps(list.find(x => x[0] === 7)[1]);
      if (s.w !== w || s.h !== h) why = 'SPS size ' + s.w + 'x' + s.h;
      else if (s.full !== 0 || s.primaries !== 1 || s.transfer !== 1 || s.matrix !== 1) why = 'SPS colour ' + JSON.stringify(s);
      else if (s.reorder > 0) why = 'reorder ' + s.reorder;
      if (!this.spsLogged) { this.spsLogged = true; log('SPS', this.token, JSON.stringify(s)); }
    }
    if (why) { log('BADFRAME', this.token, why); return; }
    this.h264[cam]++;
    if (gap && this.h264[cam] > 1) { this.gapKeys++; log('GAPKEY', this.token, 'cam=' + cam, 'seq=' + seq); }
    if (this.afterResume >= 0 && this.resumed) this.afterResume++;
    if (key) log('KEY', this.token, 'cam=' + cam, 'w=' + w, 'h=' + h, 'seq=' + seq, 'n=' + this.h264[cam], 'size=' + body.length, 'nals=' + types.join(','));
    process.stdout.write('HF ' + this.token + ' cam=' + cam + ' seq=' + seq + ' key=' + (key ? 1 : 0) + ' size=' + body.length + '\n');
    if (this.keyAsk && cam === this.keyAsk.cam && key) { log('KEYGOT', this.token, 'cam=' + cam, 'after=' + (this.h264[cam] - this.keyAsk.at)); this.keyAsk = null; }
    if (this.onframe) this.onframe(cam, key);
  }
  jpeg(cam, key, w, h, dur, seq, jpg) {
    let why = '';
    if (!key) why = 'flags';
    else if (dur !== 200) why = 'duration ' + dur;
    else if (!(jpg[0] === 0xFF && jpg[1] === 0xD8 && jpg[jpg.length - 2] === 0xFF && jpg[jpg.length - 1] === 0xD9)) why = 'jpeg markers';
    let jw = 0, jh = 0;  // the JPEG's own size, from its frame header
    for (let i = 2; !why && i + 9 < jpg.length && jpg[i] === 0xFF;) {
      const marker = jpg[i + 1];
      if (marker >= 0xC0 && marker <= 0xC2) { jh = jpg.readUInt16BE(i + 5); jw = jpg.readUInt16BE(i + 7); break; }
      i += 2 + jpg.readUInt16BE(i + 2);
    }
    if (!why && (jw !== w || jh !== h)) why = 'jpeg size ' + jw + 'x' + jh + ' header ' + w + 'x' + h;
    if (!why && cam !== 0) why = 'cam ' + cam;
    if (!why && this.hello.cams[cam].codec !== 'jpeg') why = 'JPEG of an H.264 camera';
    if (why) { log('BADFRAME', this.token, why); return; }
    this.valid++; this.jpegs++;
    if (this.valid === 1) fs.writeFileSync(path.join(outDir, 'frame1.jpg'), jpg);
    log('FRAME', this.token, 'cam=' + cam, 'w=' + w, 'h=' + h, 'seq=' + seq, 'jpeg=' + jpg.length);
    if (this.onframe) this.onframe(cam, true);
  }
}
)JS"
    R"JS(function scenario(c) {
  if (c.token === 'expire') {
    // 1.5 s unwatched (nothing may come), then watched for ten pictures,
    // unwatched again for 1.5 s (nothing may come), then the link is gone.
    setTimeout(() => {
      c.watch(1);
      c.onframe = () => {
        if (c.valid < 10) return;
        c.onframe = null; c.watch(0);
        setTimeout(() => c.close(4004, 'expired'), 1500);
      };
    }, 1500);
  } else if (c.token === 'drop') {
    setTimeout(() => c.close(c.n === 1 ? 1011 : 4000, c.n === 1 ? 'restart' : 'replaced'), 300);
  } else if (c.token === 'h264') {
    // 1.5 s unwatched, then two cameras watched: a key picture asked for of
    // camera 0 at its 40th; once it came and both have enough, unwatched, and gone.
    setTimeout(() => {
      c.watch(1);
      c.onframe = (cam) => {
        if (cam === 0 && c.h264[0] === 40 && !c.asked) { c.asked = true; c.keyAsk = { cam: 0, at: 40 }; log('KEYASK', c.token, 'cam=0'); c.text('{"t":"key","cam":0}'); }
        if (c.asked && !c.keyAsk && c.h264[0] >= 150 && c.h264[1] >= 90 && !c.done) {
          c.done = true; c.onframe = null; c.watch(0);
          setTimeout(() => c.close(4004, 'expired'), 1500);
        }
      };
    }, 1500);
  } else if (c.token === 'stall') {
    // Watched; at the first key picture the relay stops reading (a network that
    // has stopped) until told to go on.
    c.watch(1);
    c.onframe = (cam, key) => {
      if (key && !c.stalled && !c.resumed) { c.stalled = true; log('STALL', c.token); c.s.pause(); }
    };
  } else if (c.token === 'fallback') {
    c.watch(1);
    c.onframe = () => { if (c.jpegs >= 5 && !c.done) { c.done = true; c.close(4004, 'expired'); } };
  }
}
// Commands from the test, one a line.
let pending = '';
process.stdin.on('data', d => {
  pending += d.toString();
  for (let i; (i = pending.indexOf('\n')) >= 0;) {
    const line = pending.slice(0, i).trim(); pending = pending.slice(i + 1);
    if (line === 'resume stall' && conns.stall) {
      const c = conns.stall; c.stalled = false; c.resumed = true; c.afterResume = 0; c.lastGapKeys = c.gapKeys;
      log('RESUMED', c.token); c.s.resume(); c.parse();
    } else if (line === 'stats stall' && conns.stall) {
      const c = conns.stall; log('STALLSTATS', 'h264=' + c.h264[0], 'gapkeys=' + c.gapKeys, 'after=' + c.afterResume);
    }
  }
});
const server = http.createServer((req, res) => { res.writeHead(426); res.end(); });
server.on('upgrade', onUpgrade);
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  // localhost may be ::1 first
  const six = http.createServer((req, res) => { res.writeHead(426); res.end(); });
  six.on('upgrade', onUpgrade);
  six.on('error', () => {});
  six.listen(port, '::1', () => {});
  log('PORT', port);
});
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
)JS";

struct Line {
  std::uint64_t ms;
  std::string text;
};
class RelayProcess {
 public:
  bool start(const std::wstring& folder) {
    const std::wstring script = folder + L"\\relay.js";
    FILE* file = _wfopen(script.c_str(), L"wb");
    if (!file)
      return false;
    std::fwrite(Relay, 1, sizeof(Relay) - 1, file);
    std::fclose(file);
    SECURITY_ATTRIBUTES inherit{sizeof(inherit), nullptr, TRUE};
    HANDLE out_write = nullptr, in_read = nullptr;
    if (!CreatePipe(&out_read_, &out_write, &inherit, 0) || !CreatePipe(&in_read, &in_write_, &inherit, 0))
      return false;
    SetHandleInformation(out_read_, HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(in_write_, HANDLE_FLAG_INHERIT, 0);
    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdInput = in_read;
    startup.hStdOutput = out_write;
    startup.hStdError = out_write;
    std::wstring command = L"node \"" + script + L"\" \"" + folder + L"\"";
    const bool started =
        CreateProcessW(nullptr, command.data(), nullptr, nullptr, TRUE, CREATE_NO_WINDOW, nullptr, nullptr, &startup, &process_);
    CloseHandle(out_write);
    CloseHandle(in_read);
    if (!started)
      return false;
    reader_ = std::thread([this] { read(); });
    return true;
  }
  ~RelayProcess() {
    if (in_write_)
      CloseHandle(in_write_);  // its stdin ends: it leaves
    if (process_.hProcess) {
      if (WaitForSingleObject(process_.hProcess, 3000) != WAIT_OBJECT_0)
        TerminateProcess(process_.hProcess, 1);
      CloseHandle(process_.hProcess);
      CloseHandle(process_.hThread);
    }
    if (reader_.joinable())
      reader_.join();
    if (out_read_)
      CloseHandle(out_read_);
  }
  void command(const char* line) {
    DWORD written = 0;
    const std::string text = std::string(line) + "\n";
    WriteFile(in_write_, text.data(), static_cast<DWORD>(text.size()), &written, nullptr);
  }
  std::size_t count(const std::string& prefix) {
    std::lock_guard lock(mutex_);
    return static_cast<std::size_t>(
        std::count_if(lines_.begin(), lines_.end(), [&](const Line& line) { return line.text.rfind(prefix, 0) == 0; }));
  }
  // The time of the n-th (from 1) line that starts so; 0 when there is none.
  std::uint64_t time_of(const std::string& prefix, std::size_t n) {
    std::lock_guard lock(mutex_);
    for (const auto& line : lines_)
      if (line.text.rfind(prefix, 0) == 0 && --n == 0)
        return line.ms;
    return 0;
  }
  std::string first(const std::string& prefix) { return nth(prefix, 1); }
  std::string nth(const std::string& prefix, std::size_t n) {
    std::lock_guard lock(mutex_);
    for (const auto& line : lines_)
      if (line.text.rfind(prefix, 0) == 0 && --n == 0)
        return line.text;
    return {};
  }
  std::string last(const std::string& prefix) {
    std::lock_guard lock(mutex_);
    for (auto line = lines_.rbegin(); line != lines_.rend(); ++line)
      if (line->text.rfind(prefix, 0) == 0)
        return line->text;
    return {};
  }
  // The lines that start so, from the n-th (from 0) on.
  std::vector<std::string> all(const std::string& prefix) {
    std::lock_guard lock(mutex_);
    std::vector<std::string> out;
    for (const auto& line : lines_)
      if (line.text.rfind(prefix, 0) == 0)
        out.push_back(line.text);
    return out;
  }

 private:
  void read() {
    std::string pending;
    char buffer[4096];
    DWORD got = 0;
    while (ReadFile(out_read_, buffer, sizeof(buffer), &got, nullptr) && got) {
      pending.append(buffer, got);
      for (std::size_t end; (end = pending.find('\n')) != std::string::npos;) {
        std::string text = pending.substr(0, end);
        pending.erase(0, end + 1);
        if (!text.empty() && text.back() == '\r')
          text.pop_back();
        if (text.rfind("HF ", 0) != 0) {  // each H.264 picture: kept, not shown
          std::printf("  relay> %s\n", text.c_str());
          std::fflush(stdout);
        }
        std::lock_guard lock(mutex_);
        lines_.push_back({now_ms(), text});
      }
    }
  }
  PROCESS_INFORMATION process_{};
  HANDLE out_read_ = nullptr, in_write_ = nullptr;
  std::thread reader_;
  std::mutex mutex_;
  std::vector<Line> lines_;
};

// A picture the size the bridge sends: blue across, green down, red half.
std::vector<unsigned char> pattern(unsigned width, unsigned height) {
  std::vector<unsigned char> pixels(std::size_t{width} * height * 4);
  for (unsigned y = 0; y < height; ++y)
    for (unsigned x = 0; x < width; ++x) {
      unsigned char* p = pixels.data() + (std::size_t{y} * width + x) * 4;
      p[0] = static_cast<unsigned char>(x * 255 / (width - 1));
      p[1] = static_cast<unsigned char>(y * 255 / (height - 1));
      p[2] = 128;
      p[3] = 255;
    }
  return pixels;
}
// The JPEG the relay kept, read back with WIC: its pixels are the pattern's, halved.
void check_jpeg_pixels(const std::wstring& path) {
  IWICImagingFactory* factory = nullptr;
  IWICBitmapDecoder* decoder = nullptr;
  IWICBitmapFrameDecode* frame = nullptr;
  IWICFormatConverter* converter = nullptr;
  UINT width = 0, height = 0;
  std::vector<unsigned char> bgr;
  const bool ok =
      SUCCEEDED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory))) &&
      SUCCEEDED(factory->CreateDecoderFromFilename(path.c_str(), nullptr, GENERIC_READ, WICDecodeMetadataCacheOnDemand, &decoder)) &&
      SUCCEEDED(decoder->GetFrame(0, &frame)) && SUCCEEDED(frame->GetSize(&width, &height)) &&
      SUCCEEDED(factory->CreateFormatConverter(&converter)) &&
      SUCCEEDED(converter->Initialize(frame, GUID_WICPixelFormat24bppBGR, WICBitmapDitherTypeNone, nullptr, 0, WICBitmapPaletteTypeCustom));
  CHECK(ok);
  if (ok) {
    GUID container{};
    decoder->GetContainerFormat(&container);
    CHECK(IsEqualGUID(container, GUID_ContainerFormatJpeg));
    CHECK(width == 960 && height == 540);
    bgr.resize(std::size_t{width} * height * 3);
    CHECK(SUCCEEDED(converter->CopyPixels(nullptr, width * 3, static_cast<UINT>(bgr.size()), bgr.data())));
    int worst = 0;
    for (const auto& [x, y] : {std::pair{100u, 100u}, std::pair{480u, 270u}, std::pair{900u, 500u}, std::pair{20u, 520u}}) {
      if (x >= width || y >= height)
        continue;
      const unsigned char* p = bgr.data() + (std::size_t{y} * width + x) * 3;
      // Source pixels 2x and 2x+1: their mean.
      const int blue = static_cast<int>(((2 * x) * 255 / 1919 + (2 * x + 1) * 255 / 1919) / 2);
      const int green = static_cast<int>(((2 * y) * 255 / 1079 + (2 * y + 1) * 255 / 1079) / 2);
      worst = std::max({worst, std::abs(p[0] - blue), std::abs(p[1] - green), std::abs(p[2] - 128)});
      std::printf("  jpeg pixel (%u,%u): B %u G %u R %u, expected about %d %d 128\n", x, y, p[0], p[1], p[2], blue, green);
    }
    std::printf("  jpeg: %ux%u, largest difference %d\n", width, height, worst);
    CHECK(worst <= 16);
  }
  if (converter)
    converter->Release();
  if (frame)
    frame->Release();
  if (decoder)
    decoder->Release();
  if (factory)
    factory->Release();
}

template <typename Pump>
bool wait_until(unsigned timeout_ms, Pump&& pump) {
  const auto end = now_ms() + timeout_ms;
  while (now_ms() < end) {
    if (pump())
      return true;
    sleep_ms(15);
  }
  return false;
}
// The same, a pass about each millisecond (the window's passes, at 30 pictures a second).
template <typename Pump>
bool wait_fast(unsigned timeout_ms, Pump&& pump) {
  const auto end = now_ms() + timeout_ms;
  while (now_ms() < end) {
    if (pump())
      return true;
    nap();
  }
  return false;
}

std::size_t private_mb() {
  PROCESS_MEMORY_COUNTERS_EX memory{};
  memory.cb = sizeof(memory);
  K32GetProcessMemoryInfo(GetCurrentProcess(), reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&memory), sizeof(memory));
  return memory.PrivateUsage >> 20;
}
void print_stats(RemoteStream& stream) {
  const auto s = stream.h264_stats();
  std::printf("  h264: encoders opened %llu (open now %u), key pictures sent %llu, key requests %llu, queue emptied %llu times, "
              "pictures dropped %llu, queue peak %u pictures / %zu bytes, encode %.2f ms average / %.2f ms at most, fallbacks %llu%s%ls\n",
              static_cast<unsigned long long>(s.encoders_opened), s.encoders_open, static_cast<unsigned long long>(s.keyframes_sent),
              static_cast<unsigned long long>(s.key_requests), static_cast<unsigned long long>(s.queue_overflows),
              static_cast<unsigned long long>(s.frames_dropped), s.queue_peak_frames, s.queue_peak_bytes, s.encode_ms_average, s.encode_ms_max,
              static_cast<unsigned long long>(s.fallbacks), s.fallback_reason.empty() ? "" : " (", s.fallback_reason.c_str());
  if (!s.encoder.empty())
    std::printf("  h264: %ls\n", s.encoder.c_str());
}
// Frames per second between the a-th and b-th lines that start so.
double rate(RelayProcess& relay, const std::string& prefix, std::size_t a, std::size_t b) {
  const auto first = relay.time_of(prefix, a), last = relay.time_of(prefix, b);
  return last > first ? static_cast<double>(b - a) * 1000.0 / static_cast<double>(last - first) : 0.0;
}

int run_relay_tests() {
  wchar_t temp[MAX_PATH]{};
  GetTempPathW(MAX_PATH, temp);
  wchar_t folder_name[64];
  std::swprintf(folder_name, 64, L"polaris-cam-remote-test-%lu", GetCurrentProcessId());
  const std::wstring folder = std::wstring(temp) + folder_name;
  CreateDirectoryW(folder.c_str(), nullptr);
  int port = 0;
  {
    RelayProcess relay;
    if (!relay.start(folder)) {
      std::printf("FAIL: node could not be started (Node.js 18 or later on PATH is needed)\n");
      return 1;
    }
    if (!wait_until(10000, [&] { return relay.count("PORT ") > 0; })) {
      std::printf("FAIL: the stand-in relay did not start\n");
      return 1;
    }
    port = std::atoi(relay.first("PORT ").c_str() + 5);
    std::printf("stand-in relay on 127.0.0.1:%d\n", port);
    wchar_t url[160];

    // The camera's texture, on the software adapter, as the bridge's would be.
    ID3D11Device* device = nullptr;
    ID3D11DeviceContext* context = nullptr;
    ID3D11Texture2D* texture = nullptr;
    const auto pixels = pattern(1920, 1080);
    D3D11_TEXTURE2D_DESC desc{};
    desc.Width = 1920;
    desc.Height = 1080;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_DEFAULT;
    desc.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET;
    const D3D11_SUBRESOURCE_DATA data{pixels.data(), 1920 * 4, 0};
    const bool gpu = SUCCEEDED(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0,
                                                 D3D11_SDK_VERSION, &device, nullptr, &context)) &&
                     SUCCEEDED(device->CreateTexture2D(&desc, &data, &texture));
    CHECK(gpu);
    if (!gpu)
      return 1;

    std::array<CamInfo, Cams> cams{};
    cams[0] = {true, L"機長側 \"左\"", 960, 540};
    for (unsigned i = 1; i < Cams; ++i)
      cams[i] = {i == 2, L"鏡頭", 960, 540};

    // 1. JPEG only (H.264 turned off): connected, hello, nothing while
    //    unwatched, pictures while watched, nothing once unwatched, then 4004:
    //    not tried again.
    {
      std::printf("== JPEG: watch 0 / watch 1 / watch 0 / close 4004\n");
      Options options;
      options.ping_ms = 400;
      options.prefer_h264 = false;
      RemoteStream stream(options);
      stream.set_cams(cams);
      std::swprintf(url, 160, L"  http://127.0.0.1:%d/live/cam/expire \r\n", port);
      stream.configure(true, url);
      CHECK(stream.state() == State::connecting || stream.state() == State::connected);
      bool unwatched_wanted = false, sending_text = false;
      std::uint64_t last_picture = 0;
      const bool closed = wait_until(30000, [&] {
        const auto now = now_ms();
        if (stream.state() == State::connected && stream.watchers() == 0 && stream.wants_frame(0, now))
          unwatched_wanted = true;
        // A bridge at its slowest, 5 pictures a second, and the window's passes between them.
        if (now - last_picture >= 200) {
          last_picture = now;
          stream.maybe_capture(0, device, context, texture, 1920, 1080, now);
        }
        stream.poll(device, context);
        // The line under the link while it sends: a rate of about five.
        const auto text = stream.status_text(now);
        double fps = 0;
        if (stream.watchers() == 1 && !sending_text && std::swscanf(text.c_str(), L"遠端：傳送中（1 人｜JPEG｜%lf fps｜", &fps) == 1 &&
            fps >= 3.5 && fps <= 6.0) {
          sending_text = true;
          std::printf("  status: %ls\n", text.c_str());
        }
        return stream.state() == State::expired;
      });
      CHECK(closed);
      CHECK(!unwatched_wanted);
      CHECK(sending_text);
      const auto status = stream.status_text(now_ms());
      std::printf("  status: %ls\n", status.c_str());
      CHECK(status == L"遠端：連線碼已失效，請從後台重新複製");
      sleep_ms(4000);  // more than the longest wait before trying again
      CHECK(relay.count("CONNECT expire") == 1);
      CHECK(relay.count("HELLO_OK expire mode=jpeg codecs=jpeg,jpeg,jpeg,jpeg") >= 1);
      CHECK(relay.count("HELLO_BAD") == 0);
      CHECK(relay.count("PING expire") >= 1);
      CHECK(relay.count("FRAME expire") >= 10);
      CHECK(relay.count("BADFRAME") == 0);
      CHECK(relay.count("EARLYFRAME") == 0);
      CHECK(relay.count("UNMASKED") == 0);
      CHECK(relay.count("SERVERCLOSE expire 4004") == 1);
      CHECK(relay.first("FRAME expire").find("cam=0 w=960 h=540 seq=1 ") != std::string::npos);
      // About five a second: five pictures take about 800 ms.
      const auto first = relay.time_of("FRAME expire", 1), fifth = relay.time_of("FRAME expire", 5);
      std::printf("  pictures 1 to 5 in %llu ms (%.1f fps)\n", static_cast<unsigned long long>(fifth - first),
                  fifth > first ? 4000.0 / static_cast<double>(fifth - first) : 0.0);
      CHECK(fifth > first && fifth - first >= 600 && fifth - first <= 1200);
      CHECK(stream.frames_sent() >= 5 && stream.connections() == 1);
      check_jpeg_pixels(folder + L"\\frame1.jpg");
      stream.configure(false, url);
      CHECK(stream.state() == State::off);
      CHECK(stream.status_text(now_ms()) == L"遠端：未開啟");
    }

    if (hardware) {
      // 2. H.264 on this computer's graphics card, two cameras: camera 0 from
      //    the texture as the window copies it (1920 x 1080 -> 960 x 540),
      //    camera 1 from memory (1280 x 720 -> 640 x 360). Nothing while
      //    unwatched; a key picture with SPS and PPS first; P pictures; a key
      //    picture within a few when the relay asks; encoders closed once unwatched.
      std::printf("== H.264: two cameras, a key picture asked for, watch 0, close 4004\n");
      auto two = cams;
      two[1] = {true, L"鏡頭", 640, 360};
      two[2].on = false;
      RemoteStream stream;
      stream.set_cams(two);
      std::swprintf(url, 160, L"http://127.0.0.1:%d/live/cam/h264", port);
      stream.configure(true, url);
      const Moving big(1920, 1080, false), hd720(1280, 720, false);
      unsigned n0 = 0, n1 = 0;
      const auto started = now_ms();
      bool unwatched_wanted = false, sending_text = false, both_open = false, closed_after = false;
      std::uint64_t unwatched_at = 0;
      const bool closed = wait_fast(60000, [&] {
        const auto now = now_ms();
        if (stream.state() == State::connected && stream.watchers() == 0 && stream.wants_frame(0, now))
          unwatched_wanted = true;
        // The bridge at 30 a second: a new picture in the texture, and the window's copy of it.
        if ((now - started) * 30 / 1000 >= n0) {
          context->UpdateSubresource(texture, 0, nullptr, big.frame(++n0), static_cast<UINT>(big.stride), 0);
          stream.maybe_capture(0, device, context, texture, 1920, 1080, now);
        }
        stream.poll(device, context);
        // Camera 1's bridge, also at 30 a second.
        if ((now - started) * 30 / 1000 >= n1 && stream.submit_bgra(1, hd720.frame(n1), 1280, 720, hd720.stride, now))
          ++n1;
        else if ((now - started) * 30 / 1000 >= n1 + 1)
          ++n1;  // not wanted: the bridge goes on
        const auto text = stream.status_text(now);
        double fps = 0;
        if (stream.watchers() == 1 && !sending_text && std::swscanf(text.c_str(), L"遠端：傳送中（1 人｜H.264｜%lf fps｜", &fps) == 1 &&
            fps >= 40) {
          sending_text = true;
          std::printf("  status: %ls\n", text.c_str());
          print_stats(stream);
        }
        const auto stats = stream.h264_stats();
        if (stream.watchers() == 1 && stats.encoders_open == 2)
          both_open = true;
        if (relay.count("WATCH h264 0") && !unwatched_at)
          unwatched_at = now;
        if (unwatched_at && now - unwatched_at < 400 && stats.encoders_open == 0 && !closed_after) {
          closed_after = true;
          std::printf("  encoders closed %llu ms after watch 0\n", static_cast<unsigned long long>(now - unwatched_at));
        }
        return stream.state() == State::expired;
      });
      CHECK(closed);
      print_stats(stream);
      CHECK(!unwatched_wanted);
      CHECK(sending_text);
      CHECK(both_open);
      CHECK(closed_after);
      CHECK(relay.count("HELLO_OK h264 mode=h264 codecs=h264,h264,h264,h264 sizes=960x540,640x360,960x540,960x540") >= 1);
      CHECK(relay.count("BADFRAME") == 0);
      CHECK(relay.count("EARLYFRAME") == 0);
      CHECK(relay.count("SPS h264") == 1);
      std::printf("  %s\n", relay.first("SPS h264").c_str());
      // Each camera's first picture: a key picture (AUD? SPS PPS IDR), seq 1.
      CHECK(relay.first("KEY h264 cam=0").find("w=960 h=540 seq=1 n=1 ") != std::string::npos);
      CHECK(relay.first("KEY h264 cam=1").find("w=640 h=360 seq=1 n=1 ") != std::string::npos);
      const auto pictures0 = relay.count("HF h264 cam=0"), pictures1 = relay.count("HF h264 cam=1");
      const auto keys0 = relay.count("KEY h264 cam=0");
      std::printf("  camera 0: %zu pictures (%zu key), camera 1: %zu pictures\n", pictures0, keys0, pictures1);
      CHECK(pictures0 >= 150 && pictures1 >= 90);
      CHECK(keys0 >= 2 && keys0 <= 6);  // the first, the one asked for, one each 60
      // The one asked for, within a few pictures.
      CHECK(relay.count("KEYASK h264 cam=0") == 1 && relay.count("KEYGOT h264 cam=0") == 1);
      const auto got = relay.first("KEYGOT h264 cam=0");
      std::printf("  %s\n", got.c_str());
      CHECK(got.find("after=") != std::string::npos && std::atoi(got.c_str() + got.find("after=") + 6) <= 5);
      // The second picture of camera 0 is a P picture.
      CHECK(relay.nth("HF h264 cam=0", 2).find(" key=0 ") != std::string::npos);
      const double fps0 = rate(relay, "HF h264 cam=0", 10, 130), fps1 = rate(relay, "HF h264 cam=1", 10, 80);
      std::printf("  camera 0 at %.1f fps, camera 1 at %.1f fps\n", fps0, fps1);
      CHECK(fps0 >= 25 && fps0 <= 30.5);
      CHECK(fps1 >= 25 && fps1 <= 30.5);
      CHECK(relay.count("SERVERCLOSE h264 4004") == 1);
      CHECK(stream.codec(0) == Codec::h264);
    }

    if (hardware) {
      // 3. A network that stops: the relay stops reading. A camera's queue never
      //    holds more than a second (30 pictures, 512 KB); what would not fit
      //    empties it, P pictures are dropped until a key picture, asked for at
      //    once. Once the network goes on, the first picture after the gap is a
      //    key picture (the relay checks each one).
      std::printf("== H.264: the network stops, the queue empties, a key picture after\n");
      Options options;
      options.h264_bitrate = 8000000;  // noise at 8 Mbit/s: the socket's buffers fill in seconds
      RemoteStream stream(options);
      auto one = cams;
      one[2].on = false;
      stream.set_cams(one);
      std::swprintf(url, 160, L"http://127.0.0.1:%d/live/cam/stall", port);
      stream.configure(true, url);
      const Moving noise(1920, 1080, true);
      unsigned n = 0;
      const auto before_mb = private_mb();
      std::size_t most_mb = 0;
      auto feed = [&] {
        const auto now = now_ms();
        if (stream.submit_bgra(0, noise.frame(n), 1920, 1080, noise.stride, now))
          ++n;
        most_mb = std::max(most_mb, private_mb());
      };
      CHECK(wait_fast(15000, [&] {
        feed();
        return relay.count("STALL stall") > 0;
      }));
      const auto stalled_at = now_ms();
      const bool overflowed = wait_fast(40000, [&] {
        feed();
        return stream.h264_stats().queue_overflows >= 1;
      });
      CHECK(overflowed);
      const auto first_overflow_ms = now_ms() - stalled_at;
      const auto at_overflow_mb = private_mb();
      most_mb = 0;
      // Ten seconds more stalled: it stays bounded.
      wait_fast(10000, [&] {
        feed();
        return false;
      });
      print_stats(stream);
      const auto stalled = stream.h264_stats();
      std::printf("  first overflow %llu ms into the stall; memory: %zu MB before, %zu MB at the first overflow, at most %zu MB in the "
                  "10 s stalled after (%llu overflows)\n",
                  static_cast<unsigned long long>(first_overflow_ms), before_mb, at_overflow_mb, most_mb,
                  static_cast<unsigned long long>(stalled.queue_overflows));
      CHECK(stalled.queue_overflows >= 3);
      CHECK(most_mb <= at_overflow_mb + 16);
      CHECK(stalled.queue_peak_frames <= 30 && stalled.queue_peak_bytes <= 512 * 1024);
      CHECK(stalled.frames_dropped > 0);
      const auto sent_before = relay.count("HF stall");
      relay.command("resume stall");
      CHECK(wait_fast(20000, [&] {
        feed();
        return relay.count("GAPKEY stall") >= 1 && relay.count("HF stall") >= sent_before + 90;
      }));
      relay.command("stats stall");
      sleep_ms(200);
      std::printf("  %s\n  %s\n", relay.first("GAPKEY stall").c_str(), relay.last("STALLSTATS").c_str());
      print_stats(stream);
      CHECK(relay.count("BADFRAME") == 0);  // never a P picture after a gap
      CHECK(stream.state() == State::connected && stream.connections() == 1);
      stream.stop();
      CHECK(wait_until(5000, [&] { return relay.count("CLIENTCLOSE stall 1000") == 1; }));
    }

    if (hardware) {
      // 4. The encoder fails while sending (simulated after 20 pictures): the
      //    camera goes on as JPEG, and the hello says so.
      std::printf("== H.264 fails: JPEG takes over\n");
      Options options;
      options.fail_h264_after = 20;
      RemoteStream stream(options);
      auto one = cams;
      one[2].on = false;
      stream.set_cams(one);
      std::swprintf(url, 160, L"http://127.0.0.1:%d/live/cam/fallback", port);
      stream.configure(true, url);
      const Moving moving(1920, 1080, false);
      unsigned n = 0;
      bool jpeg_text = false;
      const bool closed = wait_fast(30000, [&] {
        const auto now = now_ms();
        if (stream.submit_bgra(0, moving.frame(n), 1920, 1080, moving.stride, now))
          ++n;
        const auto text = stream.status_text(now);
        if (!jpeg_text && stream.codec(0) == Codec::jpeg && text.find(L"｜JPEG｜") != std::wstring::npos) {
          jpeg_text = true;
          std::printf("  status: %ls\n", text.c_str());
        }
        return stream.state() == State::expired;
      });
      CHECK(closed);
      print_stats(stream);
      CHECK(jpeg_text);
      CHECK(stream.codec(0) == Codec::jpeg);
      const auto hellos = relay.all("HELLO_OK fallback");
      for (const auto& line : hellos)
        std::printf("  %s\n", line.c_str());
      CHECK(hellos.size() >= 2 && hellos.front().find("mode=h264 codecs=h264,") != std::string::npos &&
            hellos.back().find("mode=jpeg codecs=jpeg,h264,h264,h264") != std::string::npos);
      CHECK(relay.count("HF fallback") >= 10 && relay.count("FRAME fallback") >= 5);
      CHECK(relay.count("BADFRAME") == 0);
      std::printf("  %zu H.264 pictures, then %zu JPEG (%s)\n", relay.count("HF fallback"), relay.count("FRAME fallback"),
                  relay.first("FRAME fallback").c_str());
      CHECK(stream.h264_stats().fallbacks == 1);
    }

    // 5. A close of another kind: tried again after a second; then 4000 (another
    //    Polaris Cam took the link): not tried again.
    {
      std::printf("== close 1011, again, close 4000\n");
      RemoteStream stream;
      stream.set_cams(cams);
      std::swprintf(url, 160, L"ws://localhost:%d/live/cam/drop/ws", port);
      stream.configure(true, url);
      CHECK(wait_until(15000, [&] { return stream.state() == State::replaced; }));
      sleep_ms(3000);
      CHECK(relay.count("CONNECT drop") == 2);
      CHECK(relay.count("SERVERCLOSE drop 1011") == 1 && relay.count("SERVERCLOSE drop 4000") == 1);
      const auto gap = relay.time_of("CONNECT drop", 2) - relay.time_of("SERVERCLOSE drop 1011", 1);
      std::printf("  tried again %llu ms after the close\n", static_cast<unsigned long long>(gap));
      CHECK(gap >= 800 && gap <= 4000);
      CHECK(stream.status_text(now_ms()) == L"遠端：已有另一個 Polaris Cam 連線");
    }

    // 6. A link the relay does not know (HTTP 404): not tried again.
    {
      std::printf("== refused link\n");
      RemoteStream stream;
      std::swprintf(url, 160, L"http://127.0.0.1:%d/live/cam/missing", port);
      stream.configure(true, url);
      CHECK(wait_until(10000, [&] { return stream.state() == State::expired; }));
      sleep_ms(2500);
      CHECK(relay.count("REFUSED missing") == 1);
    }

    // 7. Links that are not links.
    {
      std::printf("== not a link\n");
      RemoteStream stream;
      stream.configure(true, L"https://example.com/live/other/tok");
      CHECK(stream.state() == State::invalid_url);
      CHECK(stream.status_text(now_ms()) == L"遠端：連線碼格式不正確");
      stream.configure(true, L"   ");
      CHECK(stream.state() == State::no_url);
      CHECK(!stream.wants_frame(0, now_ms()));
    }

    // 8. Turned off while the relay has not answered: at once, not after WinHTTP's waits.
    {
      std::printf("== turned off while connecting\n");
      RemoteStream stream;
      stream.set_cams(cams);
      std::swprintf(url, 160, L"http://127.0.0.1:%d/live/cam/hang", port);
      stream.configure(true, url);
      CHECK(wait_until(5000, [&] { return relay.count("HANGING") >= 1; }));
      sleep_ms(300);
      CHECK(stream.state() == State::connecting);
      const auto before = now_ms();
      stream.configure(false, url);
      const auto took = now_ms() - before;
      std::printf("  off in %llu ms\n", static_cast<unsigned long long>(took));
      CHECK(took < 250);
      CHECK(stream.state() == State::off);
    }

    // 9. Leaving: a close of our own (1000), and quickly.
    {
      std::printf("== leaving\n");
      RemoteStream stream;
      stream.set_cams(cams);
      std::swprintf(url, 160, L"http://127.0.0.1:%d/live/cam/stay", port);
      stream.configure(true, url);
      CHECK(wait_until(10000, [&] { return stream.state() == State::connected && relay.count("HELLO_OK stay") > 0; }));
      CHECK(stream.watchers() == 0 && !stream.wants_frame(0, now_ms() + 10000));
      const auto idle = stream.status_text(now_ms());
      std::printf("  status: %ls\n", idle.c_str());
      CHECK(idle == (hardware ? L"遠端：已連線（無人觀看｜H.264）" : L"遠端：已連線（無人觀看｜JPEG）"));
      CHECK(relay.count(hardware ? "HELLO_OK stay mode=h264" : "HELLO_OK stay mode=jpeg") == 1);
      // The hello again when the cameras change.
      cams[1].on = true;
      stream.set_cams(cams);
      CHECK(wait_until(5000, [&] { return relay.count("HELLO_OK stay") >= 2; }));
      const auto before = now_ms();
      stream.stop();
      const auto took = now_ms() - before;
      std::printf("  stopped in %llu ms\n", static_cast<unsigned long long>(took));
      CHECK(took < 600);
      CHECK(wait_until(5000, [&] { return relay.count("CLIENTCLOSE stay 1000") == 1; }));
      CHECK(relay.count("CONNECT stay") == 1);
    }
    texture->Release();
    context->Release();
    device->Release();
  }
  DeleteFileW((folder + L"\\relay.js").c_str());
  DeleteFileW((folder + L"\\frame1.jpg").c_str());
  RemoveDirectoryW(folder.c_str());
  return 0;
}
}  // namespace

int main() {
  SetConsoleOutputCP(CP_UTF8);
  std::setlocale(LC_ALL, ".UTF-8");
  const HRESULT com = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  test_parse();
  test_header();
  test_json();
  test_nal();
  test_shrink();
  test_encoder();
  std::printf("parts: %d failed\n", failures);
  const int relay = run_relay_tests();
  if (SUCCEEDED(com))
    CoUninitialize();
  if (relay || failures) {
    std::printf("remote stream test FAILED (%d)\n", failures + relay);
    return 1;
  }
  std::printf("remote stream test passed%s\n", hardware ? " (H.264 on this computer's graphics card, and JPEG)" : " (JPEG only)");
  return 0;
}
