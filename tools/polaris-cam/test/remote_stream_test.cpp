// Polaris Cam: the test of the back-office stream (src/viewer/remote_stream.cpp), on Windows.
// Copyright (C) 2026 Polaris. GPL-3.0-only, like the Taxi Cam sources it is built with.
//
//   polaris-cam-remote-test.exe        (Node.js 18 or later on PATH)
//
// First the parts on their own: links, the picture header, the hello, the
// relay's messages, the halving. Then the real thing against a stand-in for
// the website's relay: a WebSocket server written here in plain Node (http +
// crypto, RFC 6455), started on 127.0.0.1 with a port of its own. It checks
// what arrives (the hello's JSON, every picture's header, sequence and JPEG)
// and plays the relay's part: watch 1 and 0, a close with 4004, 1011 and 4000,
// a refused link. Its findings come back as lines on its output. The camera's
// pictures are copied from a Direct3D 11 texture on the software adapter, as
// the window does with the bridge's. Exit code 0 when everything held.
#include "../src/viewer/remote_stream.hpp"
#include <d3d11_1.h>
#include <wincodec.h>
#include <windows.h>
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
  write_header(h, 2, 960, 540, 0x01020304u);
  const unsigned char want[HeaderSize]{0x50, 1, 2, 1, 1, 0, 0xC0, 0x03, 0x1C, 0x02, 0, 0, 0x04, 0x03, 0x02, 0x01};
  CHECK(std::memcmp(h, want, HeaderSize) == 0);
  write_header(h, 0, 640, 360, 1);
  CHECK(h[2] == 0 && h[6] == 0x80 && h[7] == 0x02 && h[8] == 0x68 && h[9] == 0x01 && h[12] == 1 && h[13] == 0 && h[14] == 0 && h[15] == 0);
}
void test_json() {
  std::array<CamInfo, Cams> cams{};
  cams[0] = {true, L"二排中", 960, 540};
  cams[1] = {false, L"A\"B\\C\n", 960, 540};
  const auto hello = hello_json(cams);
  std::printf("hello: %s\n", hello.c_str());
  CHECK(hello.rfind("{\"t\":\"hello\",\"v\":\"", 0) == 0);
  CHECK(hello.find(
            "\"mode\":\"jpeg\",\"cams\":[{\"i\":0,\"name\":\"\xE4\xBA\x8C\xE6\x8E\x92\xE4\xB8\xAD\",\"on\":true,\"w\":960,\"h\":540}") !=
        std::string::npos);
  CHECK(hello.find("{\"i\":1,\"name\":\"A\\\"B\\\\C\\n\",\"on\":false,\"w\":960,\"h\":540}") != std::string::npos);
  CHECK(hello.find("{\"i\":3,\"name\":\"\",\"on\":false,\"w\":0,\"h\":0}]}") != std::string::npos);
  CHECK(json_escape(std::string("\x01", 1)) == "\\u0001");
  CHECK(watch_count("{\"t\":\"watch\",\"n\":3}") == 3);
  CHECK(watch_count("{ \"n\" : 0 , \"t\" : \"watch\" }") == 0);
  CHECK(watch_count("{\"t\":\"watch\",\"n\":-2}") == 0);
  CHECK(watch_count("{\"t\":\"key\",\"cam\":0}") == -1);
  CHECK(watch_count("{\"t\":\"watch\"}") == -1);
  CHECK(watch_count("pong") == -1);
  CHECK(watch_count("{\"x\":\"t\",\"t\":\"watch\",\"n\":12}") == 12);
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
const counts = {};
function onUpgrade(req, socket) {
  const m = /^\/live\/cam\/([A-Za-z0-9_-]+)\/ws$/.exec(req.url);
  const token = m ? m[1] : '';
  if (!m || token === 'missing') {
    log('REFUSED', token || req.url);
    socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    return;
  }
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13') log('BADUPGRADE', token);
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  counts[token] = (counts[token] || 0) + 1;
  log('CONNECT', token, counts[token]);
  new Conn(socket, token, counts[token]);
}
function frame(op, payload) {
  const n = payload.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, payload]);
}
class Conn {
  constructor(s, token, n) {
    Object.assign(this, { s, token, n, buf: Buffer.alloc(0), frag: null, fragOp: 0, watching: false, unwatchedAt: 0, lastSeq: 0, valid: 0,
                          closed: false, closeSent: false, helloSeen: false, onframe: null });
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
  parse() {
    for (;;) {
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
    const ok = typeof j.v === 'string' && j.v.length > 0 && j.mode === 'jpeg' && Array.isArray(j.cams) && j.cams.length === 4 &&
      j.cams.every((c, i) => c.i === i && typeof c.name === 'string' && typeof c.on === 'boolean' && c.w === 960 && c.h === 540) &&
      j.cams[0].on === true && j.cams[0].name === '機長側 "左"';
    log(ok ? 'HELLO_OK' : 'HELLO_BAD', this.token, t);
    if (!this.helloSeen) { this.helloSeen = true; scenario(this); }
  }
  binary(p) {
    if (!this.watching) {
      const late = this.unwatchedAt && Date.now() - this.unwatchedAt < 500;
      log(late ? 'INFLIGHTFRAME' : 'EARLYFRAME', this.token, p.length);
      return;
    }
    let why = '';
    if (p.length < 20) why = 'short';
    else if (p[0] !== 0x50) why = 'magic'; else if (p[1] !== 1) why = 'version'; else if (p[3] !== 1) why = 'codec';
    else if (p[4] !== 1) why = 'flags'; else if (p[5] !== 0) why = 'reserved'; else if (p.readUInt16LE(10) !== 0) why = 'padding';
    if (why) { log('BADFRAME', this.token, why); return; }
    const cam = p[2], w = p.readUInt16LE(6), h = p.readUInt16LE(8), seq = p.readUInt32LE(12), jpg = p.subarray(16);
    if (!(jpg[0] === 0xFF && jpg[1] === 0xD8 && jpg[jpg.length - 2] === 0xFF && jpg[jpg.length - 1] === 0xD9)) why = 'jpeg markers';
    let jw = 0, jh = 0;  // the JPEG's own size, from its frame header
    for (let i = 2; !why && i + 9 < jpg.length && jpg[i] === 0xFF;) {
      const marker = jpg[i + 1];
      if (marker >= 0xC0 && marker <= 0xC2) { jh = jpg.readUInt16BE(i + 5); jw = jpg.readUInt16BE(i + 7); break; }
      i += 2 + jpg.readUInt16BE(i + 2);
    }
    if (!why && (jw !== w || jh !== h)) why = 'jpeg size ' + jw + 'x' + jh + ' header ' + w + 'x' + h;
    if (!why && cam !== 0) why = 'cam ' + cam;
    if (!why && seq !== this.lastSeq + 1 && !(this.lastSeq === 0 && seq === 1)) why = 'seq ' + seq + ' after ' + this.lastSeq;
    this.lastSeq = seq;
    if (why) { log('BADFRAME', this.token, why); return; }
    this.valid++;
    if (this.valid === 1) fs.writeFileSync(path.join(outDir, 'frame1.jpg'), jpg);
    log('FRAME', this.token, 'cam=' + cam, 'w=' + w, 'h=' + h, 'seq=' + seq, 'jpeg=' + jpg.length);
    if (this.onframe) this.onframe();
  }
}
function scenario(c) {
  if (c.token === 'expire') {
    // 1.5 s unwatched (nothing may come), then watched for ten pictures,
    // unwatched again for 1.5 s (nothing may come), then the link is gone.
    setTimeout(() => {
      c.text('{"t":"key","cam":0}');
      c.watching = true; log('WATCH', 1); c.text('{"t":"watch","n":1}');
      c.onframe = () => {
        if (c.valid < 10) return;
        c.onframe = null; c.watching = false; c.unwatchedAt = Date.now();
        log('WATCH', 0); c.text('{"t":"watch","n":0}');
        setTimeout(() => c.close(4004, 'expired'), 1500);
      };
    }, 1500);
  } else if (c.token === 'drop') {
    setTimeout(() => c.close(c.n === 1 ? 1011 : 4000, c.n === 1 ? 'restart' : 'replaced'), 300);
  }
}
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
  std::string first(const std::string& prefix) {
    std::lock_guard lock(mutex_);
    for (const auto& line : lines_)
      if (line.text.rfind(prefix, 0) == 0)
        return line.text;
    return {};
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
        std::printf("  relay> %s\n", text.c_str());
        std::fflush(stdout);
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

    // 1. Connected, hello, nothing while unwatched, pictures while watched,
    //    nothing once unwatched, then 4004: not tried again.
    {
      std::printf("== watch 0 / watch 1 / watch 0 / close 4004\n");
      Options options;
      options.ping_ms = 400;
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
      CHECK(relay.count("HELLO_OK expire") >= 1);
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

    // 2. A close of another kind: tried again after a second; then 4000 (another
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

    // 3. A link the relay does not know (HTTP 404): not tried again.
    {
      std::printf("== refused link\n");
      RemoteStream stream;
      std::swprintf(url, 160, L"http://127.0.0.1:%d/live/cam/missing", port);
      stream.configure(true, url);
      CHECK(wait_until(10000, [&] { return stream.state() == State::expired; }));
      sleep_ms(2500);
      CHECK(relay.count("REFUSED missing") == 1);
    }

    // 4. Links that are not links.
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

    // 5. Leaving: a close of our own (1000), and quickly.
    {
      std::printf("== leaving\n");
      RemoteStream stream;
      stream.set_cams(cams);
      std::swprintf(url, 160, L"http://127.0.0.1:%d/live/cam/stay", port);
      stream.configure(true, url);
      CHECK(wait_until(10000, [&] { return stream.state() == State::connected && relay.count("HELLO_OK stay") > 0; }));
      CHECK(stream.watchers() == 0 && !stream.wants_frame(0, now_ms() + 10000));
      CHECK(stream.status_text(now_ms()) == L"遠端：已連線（無人觀看）");
      // The hello again when the cameras change.
      cams[1].on = true;
      stream.set_cams(cams);
      CHECK(wait_until(5000, [&] { return relay.count("HELLO_OK stay") >= 2; }));
      const auto before = now_ms();
      stream.stop();
      const auto took = now_ms() - before;
      std::printf("  stopped in %llu ms\n", static_cast<unsigned long long>(took));
      CHECK(took < 2000);
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
  test_shrink();
  std::printf("parts: %d failed\n", failures);
  const int relay = run_relay_tests();
  if (SUCCEEDED(com))
    CoUninitialize();
  if (relay || failures) {
    std::printf("remote stream test FAILED (%d)\n", failures + relay);
    return 1;
  }
  std::printf("remote stream test passed\n");
  return 0;
}
