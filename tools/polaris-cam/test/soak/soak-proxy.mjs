#!/usr/bin/env node
// Polaris Cam Stage 3: the soak proxy (long-run + throttled-upload stress test).
// Plain Node 22, no npm packages.
//
//   node soak-proxy.mjs --local    [--port 18787] [--token <24-40 chars>] [--preset quick|soak] [--duration-min N] [--out-dir DIR]
//   node soak-proxy.mjs --upstream https://efb-api.koz8738.com/live/cam/<token> [same options]
//
// --local     the repository's real CamRelay (workers/polaris-efb-api/src/cam.js) behind a real RFC 6455 server,
//             ws://127.0.0.1:<port>/live/cam/<token>/ws, with two simulated back-office viewers in it (fast, slow)
//             and /view, a WebCodecs page that shows the four cameras.
// --upstream  a throttling, disconnect-injecting pass-through to the real relay: polaris-cam.exe connects to
//             ws://127.0.0.1:<port>/live/cam/<token>/ws, and every message goes on to wss://<host>/live/cam/<token>/ws
//             (and back), through Node's own WebSocket. No admin rights, no Clumsy.
//
// The upload (polaris-cam.exe -> here) is throttled at the TCP level: a token bucket pauses the socket's reading, so
// the OS receive window fills and WinHttpWebSocketSend in polaris-cam.exe really blocks. Nothing else is throttled.
//
//   GET /metrics            live JSON (?full=1: with the per-second series)
//   GET /control?...        phase=<name> | throttle=<kbps>|auto | disconnect=1 | slow=pause|resume|auto | stop=1
//   GET /view               (local) the four cameras, WebCodecs, in Chrome/Edge
//   WS  /admin/api/cam/ws   (local) a back-office viewer of the local CamRelay (the /view page uses it)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------- options
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const flag = (name) => argv.includes('--' + name);
if (flag('help') || flag('h')) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 26).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
const UPSTREAM = opt('upstream', '');
const MODE = UPSTREAM ? 'upstream' : 'local';
if (!UPSTREAM && !flag('local')) { console.error('soak-proxy: give --local or --upstream <link>'); process.exit(2); }
const PORT = Number(opt('port', 18787));
const PRESET = opt('preset', 'quick') === 'soak' ? 'soak' : 'quick';
const DURATION_S = Math.round(Number(opt('duration-min', PRESET === 'quick' ? 3 : 180)) * 60);
const WARMUP_MAX_S = Number(opt('warmup-max-sec', MODE === 'local' ? 60 : 300));
const OUT_DIR = opt('out-dir', '');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CAM_JS = opt('cam-js', path.resolve(HERE, '../../../../workers/polaris-efb-api/src/cam.js'));
const LAG_H264 = 45;   // cam.js: a viewer this far behind gets no frames that depend on missed ones
const CAMS = 4;

let TOKEN = opt('token', '');
let upstreamWs = '';
if (UPSTREAM) {
  let u; try { u = new URL(UPSTREAM.trim()); } catch (e) { console.error('soak-proxy: --upstream is not a link'); process.exit(2); }
  const m = u.pathname.match(/^\/live\/cam\/([A-Za-z0-9_-]{1,256})(?:\/ws)?\/?$/);
  if (!m) { console.error('soak-proxy: --upstream must be https://<host>/live/cam/<token>'); process.exit(2); }
  TOKEN = m[1];
  upstreamWs = (u.protocol === 'http:' || u.protocol === 'ws:' ? 'ws://' : 'wss://') + u.host + '/live/cam/' + TOKEN + '/ws';
}
if (!TOKEN) TOKEN = crypto.randomBytes(18).toString('base64url');
const masked = (s) => s.replace(TOKEN, TOKEN.slice(0, 4) + '…');

const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(7) + 's';
let logStream = null;
if (OUT_DIR) { fs.mkdirSync(OUT_DIR, { recursive: true }); logStream = fs.createWriteStream(path.join(OUT_DIR, 'proxy-events.log'), { flags: 'a' }); }
const events = [];
function log(...a) {
  const s = stamp() + '  ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  console.log(s); if (logStream) logStream.write(s + '\n');
  events.push(s); if (events.length > 400) events.shift();
}

// ---------------------------------------------------------------- presets
// slowCycle: the slow viewer stops acking for 12 s from 4 s into the phase, every 30 s.
// disconnect: close polaris-cam's socket (1011) `at` s in, then refuse it for `refuseSec`.
// idle: no viewer at all (watch n=0) for that step.
function presetPhases(preset, mode) {
  const live = mode === 'upstream';
  const q = [
    { name: 'baseline', sec: 30, kbps: 0, slowCycle: true },
    { name: 'mild_throttle', sec: 25, kbps: 1500 },
    { name: 'severe_congestion', sec: 35, kbps: 250 },
    { name: 'disconnect_blackout', sec: 25, kbps: 0, disconnect: { at: 2, refuseSec: 10 } },
    { name: 'recovery', sec: 30, kbps: 0, slowCycle: true },
    ...(live ? [{ name: 'normal_cruise', sec: 35, kbps: 0 }]
      : [{ name: 'idle_and_resume', step: 'idle', sec: 20, kbps: 0, idle: true }, { name: 'idle_and_resume', step: 'resume', sec: 15, kbps: 0 }]),
  ];
  if (preset === 'quick') return q;
  return [   // about 20 minutes a cycle
    { name: 'baseline', sec: 180, kbps: 0, slowCycle: true },
    { name: 'mild_throttle', sec: 180, kbps: 1500, slowCycle: true },
    { name: 'severe_congestion', sec: 240, kbps: 250 },
    { name: 'disconnect_blackout', sec: 120, kbps: 0, disconnect: { at: 5, refuseSec: 10 } },
    { name: 'recovery', sec: 240, kbps: 0, slowCycle: true },
    ...(live ? [{ name: 'normal_cruise', sec: 240, kbps: 0 }]
      : [{ name: 'idle_and_resume', step: 'idle', sec: 120, kbps: 0, idle: true }, { name: 'idle_and_resume', step: 'resume', sec: 120, kbps: 0 }]),
  ];
}
const PHASES = presetPhases(PRESET, MODE);
const CYCLE_S = PHASES.reduce((a, p) => a + p.sec, 0);

// ---------------------------------------------------------------- RFC 6455 (server side)
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function frameHeader(opcode, len) {
  let h;
  if (len < 126) { h = Buffer.alloc(2); h[1] = len; }
  else if (len < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  h[0] = 0x80 | opcode;
  return h;
}
class Bucket {   // token bucket over bytes; kbps from a getter so the phase can change it
  constructor(getKbps) { this.getKbps = getKbps; this.tokens = 0; this.last = Date.now(); this.pausedMs = 0; this.bytes = 0; }
  take(n) {
    this.bytes += n;
    const rate = this.getKbps() * 125;   // bytes per second
    const now = Date.now();
    if (!rate) { this.tokens = 0; this.last = now; return 0; }
    const burst = Math.max(8192, rate * 0.25);
    this.tokens = Math.min(burst, this.tokens + ((now - this.last) * rate) / 1000); this.last = now;
    this.tokens -= n;
    if (this.tokens >= 0) return 0;
    const wait = Math.ceil((-this.tokens / rate) * 1000);
    this.pausedMs += wait;
    return wait;
  }
}
class WsConn {
  // socket: an upgraded net.Socket (handshake already answered). bucket: throttles reading, or null.
  constructor(socket, head, { onText, onBinary, onClose, bucket, label }) {
    this.socket = socket; this.onText = onText; this.onBinary = onBinary; this.onCloseCb = onClose;
    this.bucket = bucket; this.label = label; this.buf = Buffer.alloc(0); this.frag = null; this.fragOp = 0;
    this.closeSent = false; this.closed = false; this.closeCode = 1006; this.closeReason = '';
    this.held = []; this.holding = false; this.openedAt = Date.now();
    socket.setNoDelay(true);
    socket.on('data', (c) => this.data(c));
    socket.on('close', () => this.finish());
    socket.on('error', () => { /* 'close' follows */ });
    if (head && head.length) this.data(head);
  }
  get bufferedAmount() { return this.socket.writableLength; }
  data(chunk) {
    if (this.holding) { this.held.push(chunk); return; }
    const wait = this.bucket ? this.bucket.take(chunk.length) : 0;
    if (wait > 0) {   // over the rate: stop reading (the TCP window fills), let this chunk through later
      this.holding = true; this.socket.pause(); this.held.push(chunk);
      this.holdTimer = setTimeout(() => this.release(), wait);
      return;
    }
    this.parse(chunk);
  }
  // the held data now (its wait over, or the limit raised or lifted)
  release() {
    if (!this.holding) return;
    clearTimeout(this.holdTimer); this.holding = false;
    const list = this.held; this.held = [];
    for (const c of list) this.parse(c);
    if (!this.closed) this.socket.resume();
  }
  parse(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, maskd = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 4 * 1048576) { this.close(1009, 'too big'); return; }
      const need = off + (maskd ? 4 : 0) + len; if (b.length < need) return;
      let payload = b.subarray(off + (maskd ? 4 : 0), need);
      if (maskd) {
        const k = b.subarray(off, off + 4), p = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) p[i] = payload[i] ^ k[i & 3];
        payload = p;
      } else payload = Buffer.from(payload);
      this.buf = b.subarray(need);
      if (op >= 8) {   // control
        if (op === 9) this.raw(10, payload);
        else if (op === 8) {
          this.closeCode = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
          this.closeReason = payload.length > 2 ? payload.subarray(2).toString('utf8') : '';
          if (!this.closeSent) { this.closeSent = true; this.raw(8, payload.length >= 2 ? payload.subarray(0, 2) : Buffer.alloc(0)); }
          this.socket.end(); setTimeout(() => this.socket.destroy(), 1500).unref();
          return;
        }
        continue;
      }
      if (op === 0) { if (!this.frag) continue; this.frag.push(payload); }
      else { this.frag = [payload]; this.fragOp = op; }
      if (!fin) continue;
      const msg = this.frag.length === 1 ? this.frag[0] : Buffer.concat(this.frag); const mop = this.fragOp; this.frag = null;
      try { if (mop === 1) this.onText && this.onText(msg.toString('utf8')); else if (mop === 2) this.onBinary && this.onBinary(msg); }
      catch (e) { log('handler error', this.label, e.stack || String(e)); }
    }
  }
  raw(op, payload) {
    if (this.closed || this.socket.destroyed) return false;
    this.socket.write(frameHeader(op, payload.length)); return this.socket.write(payload);
  }
  sendText(s) { if (this.closeSent) return false; return this.raw(1, Buffer.from(s, 'utf8')); }
  sendBinary(b) { if (this.closeSent) return false; return this.raw(2, Buffer.isBuffer(b) ? b : Buffer.from(b)); }
  close(code = 1000, reason = '') {
    if (this.closeSent || this.closed) return;
    this.closeSent = true;
    const r = Buffer.from(String(reason).slice(0, 100), 'utf8'), p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0); r.copy(p, 2);
    this.raw(8, p);
    setTimeout(() => this.socket.destroy(), 2000).unref();   // no answer: gone anyway
  }
  kill() { this.socket.destroy(); }
  finish() {
    if (this.closed) return; this.closed = true;
    if (this.onCloseCb) this.onCloseCb(this.closeCode, this.closeReason);
  }
}
function handshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return false; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  return true;
}
const refuse = (socket, status, text) => { try { socket.end(`HTTP/1.1 ${status} ${text}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`); } catch (e) { /* gone */ } };

// ---------------------------------------------------------------- the Durable Object runtime, as far as CamRelay uses it
let relay = null, frameIn = null, helloIn = null, camPublic = null;
let bindConn = null;   // the WsConn the next WebSocketPair's server end belongs to
class FakeWs {         // the relay's end of one connection
  constructor() { this.conn = null; this.readyState = 0; this.tags = []; this.att = null; this.closeDelivered = false; }
  accept() { this.readyState = 1; }
  send(m) {
    if (this.readyState !== 1 || !this.conn) throw new Error('not open');
    if (typeof m === 'string') this.conn.sendText(m); else this.conn.sendBinary(Buffer.from(m));
  }
  close(code = 1000, reason = '') { if (this.readyState >= 2) return; this.readyState = 2; if (this.conn) this.conn.close(code, reason); }
  serializeAttachment(a) { this.att = structuredClone(a); }
  deserializeAttachment() { return this.att; }
}
const accepted = [];   // FakeWs, in the order accepted
let autoPair = null;
function installRuntime() {
  globalThis.WebSocketPair = class { constructor() { const s = new FakeWs(); s.conn = bindConn; this[0] = new FakeWs(); this[1] = s; } };
  globalThis.WebSocketRequestResponsePair = class { constructor(req, res) { this.request = req; this.response = res; } };
  const R0 = globalThis.Response;
  globalThis.Response = class extends R0 {
    constructor(body, init) {
      if (init && init.status === 101) { super(null, { status: 200 }); this.upgradeStatus = 101; this.webSocket = init.webSocket; }
      else super(body, init);
    }
  };
}
const storage = new Map();
const ctx = {
  storage: { async get(k) { return storage.has(k) ? structuredClone(storage.get(k)) : undefined; }, async put(k, v) { storage.set(k, structuredClone(v)); } },
  setWebSocketAutoResponse(pair) { autoPair = pair; },
  acceptWebSocket(ws, tags) { ws.readyState = 1; ws.tags = tags || []; accepted.push(ws); },
  getWebSockets(tag) { return accepted.filter((w) => !tag || w.tags.includes(tag)); },
  getTags(ws) { if (!accepted.includes(ws)) throw new Error('not accepted'); return ws.tags; },
};
// The Durable Object's input gate: one event at a time, in order.
let gate = Promise.resolve();
const serial = (fn) => (gate = gate.then(fn).catch((e) => log('relay error', e.stack || String(e))));
const relaySock = (conn) => accepted.find((w) => w.conn === conn) || null;
// One connection into the relay: the request (through camPublic for polaris-cam, as the worker routes it), then its
// messages and its close, all through the gate, so nothing it sends before the relay has it is lost or reordered.
function relayConnect(conn, url, viaPublic, { onText, onBinary, onClose } = {}) {
  serial(async () => {
    bindConn = conn;
    try {
      const req = new Request(url, { method: 'GET', headers: new Headers({ Upgrade: 'websocket' }) });
      const env = { CAM: { idFromName: () => 'cam', get: () => ({ fetch: (r, i) => relay.fetch(r instanceof Request ? r : new Request(r, i)) }) } };
      const res = viaPublic ? await camPublic(req, new URL(url), env) : await relay.fetch(req);
      if (!res || res.upgradeStatus !== 101) { log('the relay did not take the connection', res && res.status); conn.close(1011, 'relay refused'); }
    } finally { bindConn = null; }
  });
  conn.onText = (s) => {
    if (onText) onText(s);
    if (autoPair && s === autoPair.request) { conn.sendText(autoPair.response); return; }   // answered without the object
    serial(() => { const w = relaySock(conn); if (w) return relay.webSocketMessage(w, s); });
  };
  conn.onBinary = (b) => {
    if (onBinary) onBinary(b);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    serial(() => { const w = relaySock(conn); if (w) return relay.webSocketMessage(w, ab); });
  };
  conn.onCloseCb = (code, reason) => {
    if (onClose) onClose(code, reason);
    serial(async () => {
      const w = relaySock(conn); if (!w) return;
      await relay.webSocketClose(w, code, reason || '', true);   // also for one the relay closed itself: its peer answered
      w.readyState = 3;
      const i = accepted.indexOf(w); if (i >= 0) accepted.splice(i, 1);
    });
  };
}

// ---------------------------------------------------------------- statistics
const now = () => Date.now();
class Rate {   // events in the last 5 s
  constructor() { this.q = []; }
  add(t, n) { this.q.push([t, n]); this.trim(t); }
  trim(t) { while (this.q.length && t - this.q[0][0] > 5000) this.q.shift(); }
  count(t = now()) { this.trim(t); return this.q.length / 5; }
  bytesKbps(t = now()) { this.trim(t); let s = 0; for (const [, n] of this.q) s += n; return (s * 8) / 5 / 1000; }
}
const newCam = (i) => ({ i, frames: 0, keyframes: 0, bytes: 0, lastSeq: 0, seqGaps: 0, gapFrames: 0, gapKeyViolations: 0, seqBackwards: 0, startNonKey: 0,
  codec: '', unexpectedFallbacks: 0, wasH264: false, lastAt: 0, maxGapMs: 0, rate: new Rate(), w: 0, h: 0, connFirst: true });
const S = {
  connections: 0, connectedAt: 0, pubConnected: false, disconnectsInjected: 0, unexpectedDisconnects: 0, refusedConnections: 0, closeCodes: {},
  reconnectLatenciesMs: [], reconnectHelloMs: [], reconnects: 0, invalidFrames: 0, hello: null, hellos: 0, watchSent: -1, watchMessages: 0, keyRequestsToPub: 0,
  cams: Array.from({ length: CAMS }, (_, i) => newCam(i)),
  pending: null,   // an injected disconnect waiting for the stream to come back
  idle: { framesAfterGrace: 0, bytesAfterGrace: 0 }, resume: null, resumes: [],
};
const views = {};   // the simulated viewers, by name
function camOnFrame(c, fr, size, t) {
  c.frames++; c.bytes += size; c.rate.add(t, size); if (fr.key) c.keyframes++;
  c.w = fr.w; c.h = fr.h;
  if (c.lastAt && !c.connFirst) c.maxGapMs = Math.max(c.maxGapMs, t - c.lastAt);
  c.lastAt = t;
  const codec = fr.codec === 2 ? 'h264' : 'jpeg';
  if (codec === 'h264') c.wasH264 = true;
  else if (c.wasH264 && c.codec === 'h264') { c.unexpectedFallbacks++; log(`cam ${c.i}: H.264 -> JPEG (fallback)`); }
  c.codec = codec;
  if (c.connFirst) { c.connFirst = false; if (fr.codec === 2 && !fr.key) { c.startNonKey++; log(`cam ${c.i}: first frame of a connection is not a key frame (seq ${fr.seq})`); } }
  else if (fr.seq > c.lastSeq + 1) {
    c.seqGaps++; c.gapFrames += fr.seq - c.lastSeq - 1;
    if (!fr.key) { c.gapKeyViolations++; log(`cam ${c.i}: GAP WITHOUT KEY ${c.lastSeq} -> ${fr.seq}`); }
  } else if (fr.seq <= c.lastSeq) c.seqBackwards++;
  c.lastSeq = fr.seq;
}
function totals(t = now()) {
  const o = { frames: 0, keyframes: 0, bytes: 0, fps5s: 0, kbps5s: 0, seqGaps: 0, gapFrames: 0, gapKeyViolations: 0, startNonKey: 0, seqBackwards: 0, unexpectedFallbacks: 0 };
  for (const c of S.cams) {
    o.frames += c.frames; o.keyframes += c.keyframes; o.bytes += c.bytes; o.fps5s += c.rate.count(t); o.kbps5s += c.rate.bytesKbps(t);
    o.seqGaps += c.seqGaps; o.gapFrames += c.gapFrames; o.gapKeyViolations += c.gapKeyViolations; o.startNonKey += c.startNonKey; o.seqBackwards += c.seqBackwards; o.unexpectedFallbacks += c.unexpectedFallbacks;
  }
  o.fps5s = +o.fps5s.toFixed(2); o.kbps5s = +o.kbps5s.toFixed(1);
  return o;
}
// what came from polaris-cam
function pubBinary(b, t = now()) {
  const fr = frameIn ? frameIn(b) : null;
  if (!fr) { S.invalidFrames++; return; }
  camOnFrame(S.cams[fr.cam], fr, b.length, t);
  if (PH.cur && PH.cur.idle && t - PH.startedAt > 3000) { S.idle.framesAfterGrace++; S.idle.bytesAfterGrace += b.length; }
  const p = S.pending;
  if (p && p.acceptedAt) {
    if (!p.firstFrameAt) p.firstFrameAt = t;
    if (fr.key) p.keyed.add(fr.cam);
    if (!p.done && p.keyed.size >= Math.max(1, onCams())) {
      p.done = true; const ms = t - p.at; S.reconnectLatenciesMs.push(ms); S.reconnects++;
      log(`reconnected: stream back ${ms} ms after the injected disconnect (accepted after ${p.acceptedAt - p.at} ms, hello ${p.helloAt ? p.helloAt - p.at : '-'} ms)`);
      S.pending = null;
    }
  }
  const r = S.resume;
  if (r && !r.done) {
    if (!r.firstFrameAt) r.firstFrameAt = t;
    if (fr.key) r.keyed.add(fr.cam);
    if (r.keyed.size >= Math.max(1, onCams())) { r.done = true; r.allKeyMs = t - r.at; r.firstFrameMs = r.firstFrameAt - r.at; S.resumes.push({ firstFrameMs: r.firstFrameMs, allKeyMs: r.allKeyMs }); log(`resumed after idle: first frame ${r.firstFrameMs} ms, every camera keyed ${r.allKeyMs} ms`); }
  }
}
function pubText(s, t = now()) {
  if (s === 'ping') return;
  let j; try { j = JSON.parse(s); } catch (e) { return; }
  if (j && j.t === 'hello') {
    S.hellos++; S.hello = helloIn ? helloIn(j) : j;
    if (S.pending && S.pending.acceptedAt && !S.pending.helloAt) { S.pending.helloAt = t; S.reconnectHelloMs.push(t - S.pending.at); }
    for (const k of S.hello.cams || []) { const c = S.cams[k.i]; if (!c) continue; if (k.on && c.wasH264 && k.codec === 'jpeg') { c.unexpectedFallbacks++; log(`cam ${k.i}: hello says JPEG after H.264 (fallback)`); } }
    log('hello', { v: S.hello.v, mode: S.hello.mode, cams: (S.hello.cams || []).map((c) => `${c.i}:${c.on ? 'on' : 'off'}:${c.codec}:${c.w}x${c.h}`).join(' ') });
  }
}
function toPubText(s) {   // what went to polaris-cam
  let j; try { j = JSON.parse(s); } catch (e) { return; }
  if (!j) return;
  if (j.t === 'watch') { S.watchMessages++; if (j.n !== S.watchSent) log(`watch n=${j.n}`); S.watchSent = j.n; }
  else if (j.t === 'key') S.keyRequestsToPub++;
}
const onCams = () => { const h = S.hello; return h && h.cams ? h.cams.filter((c) => c.on).length : CAMS; };

// ---------------------------------------------------------------- the phases
const PH = { started: false, startAt: 0, idx: -1, cur: null, startedAt: 0, cycle: 0, done: false, override: null, slowOverride: 'auto', summaries: [], snap: null, phaseDisc: false };
function throttleKbps() { if (PH.override != null) return PH.override; return PH.cur && !PH.done ? PH.cur.kbps : 0; }
function snapshot(t = now()) {
  return { t, cams: S.cams.map((c) => ({ frames: c.frames, keyframes: c.keyframes, bytes: c.bytes, seqGaps: c.seqGaps, gapFrames: c.gapFrames, gapKeyViolations: c.gapKeyViolations, startNonKey: c.startNonKey, unexpectedFallbacks: c.unexpectedFallbacks })),
    viewerGapKeyViolations: viewerViolations(), slowP: views.slow ? views.slow.pWhilePaused : 0, fastFrames: views.fast ? views.fast.frames : 0,
    connections: S.connections, injected: S.disconnectsInjected, unexpected: S.unexpectedDisconnects, idleFrames: S.idle.framesAfterGrace, throttlePausedMs: pubBucket.pausedMs };
}
const series = [];   // one sample a second
let lastSample = null;
function sample() {
  const t = now(), s = snapshot(t);
  const row = { s: +((t - t0) / 1000).toFixed(0), phase: PH.cur ? PH.cur.name + (PH.cur.step ? '/' + PH.cur.step : '') : PH.started ? 'done' : 'warmup', kbpsLimit: throttleKbps(), watch: S.watchSent, pub: S.pubConnected ? 1 : 0,
    fps: s.cams.map((c, i) => (lastSample ? c.frames - lastSample.cams[i].frames : 0)), kbit: s.cams.map((c, i) => (lastSample ? Math.round(((c.bytes - lastSample.cams[i].bytes) * 8) / 1000) : 0)),
    keys: s.cams.reduce((a, c, i) => a + (lastSample ? c.keyframes - lastSample.cams[i].keyframes : 0), 0), fastFps: lastSample ? s.fastFrames - lastSample.fastFrames : 0, slowPaused: views.slow && views.slow.paused ? 1 : 0 };
  lastSample = s; series.push(row); if (series.length > 6 * 3600) series.shift();
  if (seriesStream) seriesStream.write(JSON.stringify(row) + '\n');
}
let seriesStream = OUT_DIR ? fs.createWriteStream(path.join(OUT_DIR, 'proxy-series.ndjson'), { flags: 'a' }) : null;
function summarize(p, from, to) {
  const dur = Math.max(0.001, (to.t - from.t) / 1000), cams = to.cams.map((c, i) => {
    const a = from.cams[i];
    return { frames: c.frames - a.frames, keyframes: c.keyframes - a.keyframes, fps: +((c.frames - a.frames) / dur).toFixed(2), kbps: +(((c.bytes - a.bytes) * 8) / dur / 1000).toFixed(1),
      seqGaps: c.seqGaps - a.seqGaps, gapFrames: c.gapFrames - a.gapFrames, gapKeyViolations: c.gapKeyViolations - a.gapKeyViolations, startNonKey: c.startNonKey - a.startNonKey,
      unexpectedFallbacks: c.unexpectedFallbacks - a.unexpectedFallbacks, codec: S.cams[i].codec };
  });
  const rows = series.filter((r) => r.s * 1000 + t0 > from.t && r.s * 1000 + t0 <= to.t);
  const tailN = Math.max(1, Math.min(10, Math.floor(rows.length / 2))), tail = rows.slice(-tailN);
  const tailFps = tail.length ? +(tail.reduce((a, r) => a + r.fps.reduce((x, y) => x + y, 0), 0) / tail.length).toFixed(2) : 0;
  const tailFpsCam = [0, 1, 2, 3].map((i) => (tail.length ? +(tail.reduce((a, r) => a + r.fps[i], 0) / tail.length).toFixed(2) : 0));
  const sum = (k) => cams.reduce((a, c) => a + c[k], 0);
  return { name: p.name, step: p.step || '', cycle: PH.cycle, kbpsLimit: p.kbps, startS: +((from.t - t0) / 1000).toFixed(1), endS: +((to.t - t0) / 1000).toFixed(1), durationS: +dur.toFixed(1),
    totalFps: +cams.reduce((a, c) => a + c.fps, 0).toFixed(2), totalKbps: +cams.reduce((a, c) => a + c.kbps, 0).toFixed(1), tailFps, tailFpsCam,
    frames: sum('frames'), keyframes: sum('keyframes'), seqGaps: sum('seqGaps'), gapFrames: sum('gapFrames'), gapKeyViolations: sum('gapKeyViolations'), startNonKey: sum('startNonKey'),
    unexpectedFallbacks: sum('unexpectedFallbacks'), codecs: cams.map((c) => c.codec), h264Cams: cams.filter((c) => c.codec === 'h264' && c.frames > 0).length, cams,
    viewerGapKeyViolations: to.viewerGapKeyViolations - from.viewerGapKeyViolations, slowViewerPFramesWhilePaused: to.slowP - from.slowP, fastViewerFps: +((to.fastFrames - from.fastFrames) / dur).toFixed(2),
    connections: to.connections - from.connections, disconnectsInjected: to.injected - from.injected, unexpectedDisconnects: to.unexpected - from.unexpected,
    idleFramesAfterGrace: to.idleFrames - from.idleFrames, throttlePausedMs: to.throttlePausedMs - from.throttlePausedMs, ...(p.extra || {}) };
}
function closePhase(t = now()) {
  if (!PH.cur) return;
  const p = PH.cur;
  if (p.disconnect) Object.assign(p.extra, { reconnectMs: S.reconnectLatenciesMs.slice(p.recFrom), reconnectHelloMs: S.reconnectHelloMs.slice(p.helloFrom), reconnectPending: !!S.pending });
  if (p.name === 'idle_and_resume' && p.step === 'resume' && S.resume) Object.assign(p.extra, { resumeFirstFrameMs: S.resume.firstFrameMs || null, resumeAllKeyMs: S.resume.allKeyMs || null });
  const s = summarize(p, PH.snap, snapshot(t)); PH.summaries.push(s); PH.cur = null;
  log(`phase end ${s.name}${s.step ? '/' + s.step : ''}: ${s.totalFps} fps ${s.totalKbps} kbps, gaps ${s.seqGaps}, gap-without-key ${s.gapKeyViolations}, tail ${s.tailFps} fps`);
}
function enterPhase(i, t = now()) {
  closePhase(t);
  if (i >= PHASES.length) { i = 0; PH.cycle++; }
  PH.idx = i; PH.cur = { ...PHASES[i], extra: {}, recFrom: S.reconnectLatenciesMs.length, helloFrom: S.reconnectHelloMs.length }; PH.startedAt = t; PH.snap = snapshot(t); PH.phaseDisc = false;
  log(`phase ${PH.cur.name}${PH.cur.step ? '/' + PH.cur.step : ''} (${PH.cur.sec} s, limit ${PH.cur.kbps ? PH.cur.kbps + ' kbps' : 'none'}, cycle ${PH.cycle + 1})`);
  if (PH.cur.idle) startIdle(); else if (MODE === 'local') ensureViewers();
  if (PH.cur.name === 'idle_and_resume' && PH.cur.step === 'resume') S.resume = { at: t, keyed: new Set(), firstFrameAt: 0, done: false };
}
let lastKbps = 0;
function tick() {
  const t = now();
  const k = throttleKbps();
  if (k !== lastKbps) {   // a higher limit, or none, applies at once: not after the wait the old one set
    if (pubConn && (!k || (lastKbps && k > lastKbps))) pubConn.release();
    pubBucket.tokens = 0; pubBucket.last = t; lastKbps = k;
  }
  if (!PH.started) {
    const allCams = S.cams.filter((c) => c.frames > 0).length >= Math.max(1, Math.min(onCams(), CAMS));
    const ready = MODE === 'local' ? S.pubConnected && allCams && S.cams.every((c) => !c.frames || c.keyframes > 0) : S.pubConnected;
    if (ready || (t - t0) / 1000 >= WARMUP_MAX_S) {
      PH.started = true; PH.startAt = t;
      log(ready ? 'warm-up done: polaris-cam is streaming' : `warm-up gave up after ${WARMUP_MAX_S} s: starting anyway`);
      enterPhase(0, t);
    }
    return;
  }
  if (PH.done) return;
  if ((t - PH.startAt) / 1000 >= DURATION_S) { finishPhases(t); return; }
  const el = (t - PH.startedAt) / 1000, p = PH.cur;
  if (p.disconnect && !PH.phaseDisc && el >= p.disconnect.at) { PH.phaseDisc = true; injectDisconnect(p.disconnect.refuseSec); }
  if (MODE === 'local' && views.slow) {
    let paused = false;
    if (PH.slowOverride === 'pause') paused = true;
    else if (PH.slowOverride === 'resume') paused = false;
    else if (p.slowCycle && el >= 4) paused = ((el - 4) % 30) < 12;
    views.slow.setPaused(paused);
  }
  if (el >= p.sec) enterPhase(PH.idx + 1, t);
}
function finishPhases(t = now()) {
  if (PH.done) return;
  closePhase(t);
  if (MODE === 'local') ensureViewers();
  PH.done = true; PH.cur = null; PH.override = null;
  if (views.slow) views.slow.setPaused(false);
  log(`all phases done (${PH.summaries.length} phase runs, ${PH.cycle} full cycle(s))`);
}

// ---------------------------------------------------------------- polaris-cam's side
const pubBucket = new Bucket(() => throttleKbps());
let pubConn = null, upConn = null, refuseUntil = 0;
function injectDisconnect(refuseSec) {
  const t = now();
  S.disconnectsInjected++;
  refuseUntil = t + refuseSec * 1000;
  S.pending = { at: t, refuseUntil, acceptedAt: 0, helloAt: 0, firstFrameAt: 0, keyed: new Set(), done: false };
  log(`DISCONNECT injected: closing polaris-cam's socket (1011), refusing it for ${refuseSec} s`);
  if (pubConn) { const c = pubConn; c.injected = true; c.close(1011, 'soak: injected disconnect'); setTimeout(() => c.kill(), 800).unref(); }
  if (upConn) { try { upConn.close(1000, 'soak: injected disconnect'); } catch (e) { /* gone */ } }
}
function pubUpgrade(req, socket, head) {
  const t = now();
  if (t < refuseUntil) { S.refusedConnections++; log('refused a connection (blackout): 503'); refuse(socket, 503, 'Service Unavailable'); return; }
  if (MODE === 'upstream') return upstreamUpgrade(req, socket, head);
  if (!handshake(req, socket)) return;
  const conn = new WsConn(socket, null, { bucket: pubBucket, label: 'pub' });
  const send = conn.sendText.bind(conn); conn.sendText = (s) => { toPubText(s); return send(s); };
  pubAttach(conn, t);
  relayConnect(conn, `http://127.0.0.1:${PORT}${req.url.split('?')[0]}`, true, {
    onText: (s) => pubText(s), onBinary: (b) => pubBinary(b), onClose: (code, reason) => pubDetach(conn, code, reason),
  });
}
function pubAttach(conn, t) {
  S.connections++; S.pubConnected = true; S.connectedAt = t; pubConn = conn;
  for (const c of S.cams) c.connFirst = true;
  if (S.pending && !S.pending.acceptedAt) S.pending.acceptedAt = t;
  log(`polaris-cam connected (connection #${S.connections})`);
}
function pubDetach(conn, code, reason) {
  if (pubConn === conn) { pubConn = null; S.pubConnected = false; }
  S.closeCodes[code] = (S.closeCodes[code] || 0) + 1;
  if (!conn.injected) S.unexpectedDisconnects++;
  log(`polaris-cam disconnected: ${code}${reason ? ' ' + reason : ''}${conn.injected ? ' (injected)' : ' (NOT injected)'} after ${((now() - conn.openedAt) / 1000).toFixed(1)} s`);
}
// --upstream: polaris-cam <-> here <-> the real relay
function upstreamUpgrade(req, socket, head) {
  const t = now();
  let up; try { up = new WebSocket(upstreamWs); } catch (e) { refuse(socket, 502, 'Bad Gateway'); return; }
  up.binaryType = 'arraybuffer';
  let conn = null, opened = false;
  const timer = setTimeout(() => { if (!opened) { log('upstream did not open in 10 s'); try { up.close(); } catch (e) { /* */ } refuse(socket, 504, 'Gateway Timeout'); } }, 10000);
  up.addEventListener('open', () => {
    opened = true; clearTimeout(timer);
    if (socket.destroyed || !handshake(req, socket)) { try { up.close(1000); } catch (e) { /* */ } return; }
    upConn = up;
    conn = new WsConn(socket, head, {
      bucket: pubBucket, label: 'pub',
      onText: (s) => { pubText(s); if (up.readyState === 1) up.send(s); },
      onBinary: (b) => {
        pubBinary(b);
        if (up.readyState === 1) up.send(b);
        // the real relay slower than polaris-cam: stop reading too (the same backpressure, one hop further)
        if (up.bufferedAmount > 1 << 20 && !socket.isPaused()) { socket.pause(); const w = setInterval(() => { if (up.readyState !== 1 || up.bufferedAmount < 256 << 10) { clearInterval(w); if (!conn.holding && !conn.closed) socket.resume(); } }, 50); }
      },
      onClose: (code, reason) => { pubDetach(conn, code, reason); if (upConn === up) upConn = null; try { up.close(1000, 'polaris-cam left'); } catch (e) { /* */ } },
    });
    const send = conn.sendText.bind(conn); conn.sendText = (s) => { toPubText(s); return send(s); };
    pubAttach(conn, t);
    log(`upstream open (${masked(upstreamWs)})`);
  });
  up.addEventListener('message', (e) => { if (!conn) return; if (typeof e.data === 'string') conn.sendText(e.data); else conn.sendBinary(Buffer.from(e.data)); });
  up.addEventListener('close', (e) => {
    clearTimeout(timer);
    if (upConn === up) upConn = null;
    if (!opened) { log(`upstream refused: ${e.code} ${e.reason || ''}`); refuse(socket, 502, 'Bad Gateway'); return; }
    log(`upstream closed: ${e.code} ${e.reason || ''}`);
    if (conn && !conn.closeSent) conn.close(e.code >= 3000 || e.code === 1000 ? e.code : 1011, e.reason || 'upstream closed');
  });
  up.addEventListener('error', () => { /* 'close' follows */ });
}

// ---------------------------------------------------------------- simulated viewers (local)
let viewerViolationsBase = 0;
const viewerViolations = () => viewerViolationsBase + Object.values(views).reduce((a, v) => a + v.gapKeyViolations, 0);
class Viewer {
  constructor(name, slow) {
    this.name = name; this.slow = slow; this.ws = null; this.frames = 0; this.rate = new Rate(); this.gapKeyViolations = 0; this.startNonKey = 0;
    this.paused = false; this.pWhilePaused = 0; this.probeKeys = 0; this.probeMinMs = 0; this.resumeMs = []; this.resumeSlow = 0; this.connects = 0; this.maxStallMs = 0; this.cutPauses = 0;
    this.cam = Array.from({ length: CAMS }, () => ({ last: 0, first: true, n: 0, unacked: 0, lastAckAt: 0, sinceAck: 0, lastProbeAt: 0, resumeAt: 0, codec: 0, lastAt: 0 }));
    this.want = true; this.timer = setInterval(() => this.ackTimer(), 100);
  }
  open() {
    if (this.ws || !this.want) return;
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/admin/api/cam/ws?role=view&sim=${this.name}`); ws.binaryType = 'arraybuffer'; this.ws = ws;
    ws.addEventListener('open', () => { this.connects++; for (const c of this.cam) { c.first = true; c.last = 0; c.unacked = 0; c.sinceAck = 0; c.lastAt = 0; } });
    ws.addEventListener('message', (e) => { if (typeof e.data !== 'string') this.frame(Buffer.from(e.data)); });
    ws.addEventListener('close', () => { if (this.ws === ws) this.ws = null; if (this.want) setTimeout(() => this.open(), 1000); });
    ws.addEventListener('error', () => { /* close follows */ });
  }
  shut() { this.want = false; if (this.ws) { try { this.ws.close(1000); } catch (e) { /* */ } } }
  start() { this.want = true; this.open(); }
  frame(b) {
    const fr = frameIn ? frameIn(b) : null; if (!fr) return;
    const t = now(), c = this.cam[fr.cam];
    this.frames++; this.rate.add(t, b.length); c.n++;
    if (c.lastAt && fr.codec === 2) this.maxStallMs = Math.max(this.maxStallMs, t - c.lastAt);
    c.lastAt = t;
    if (c.first) { c.first = false; if (fr.codec === 2 && !fr.key) { this.startNonKey++; this.gapKeyViolations++; log(`${this.name} viewer: cam ${fr.cam} started on a non-key frame`); } }
    else if (fr.seq > c.last + 1 && !fr.key) { this.gapKeyViolations++; log(`${this.name} viewer: cam ${fr.cam} GAP WITHOUT KEY ${c.last} -> ${fr.seq}`); }
    c.last = fr.seq; c.codec = fr.codec;
    // sinceAck is the relay's ring for this page: every frame sent after the last seq it acked. CamRelay sends the
    // k-th of them only while k-1 < 45, unless it is a key frame (a probe, at most one every 3 s).
    c.sinceAck++;
    if (this.paused) {
      if (fr.codec === 2 && c.sinceAck > LAG_H264) {
        if (fr.key) { if (c.lastProbeAt) { const d = t - c.lastProbeAt; this.probeMinMs = this.probeMinMs ? Math.min(this.probeMinMs, d) : d; } c.lastProbeAt = t; this.probeKeys++; }
        else { this.pWhilePaused++; log(`${this.name} viewer: cam ${fr.cam} P-frame ${fr.seq} while paused (#${c.sinceAck} unacked)`); }
      }
      return;
    }
    if (c.resumeAt && fr.codec === 2 && !fr.key) { const ms = t - c.resumeAt; this.resumeMs.push(ms); if (ms > 6000) this.resumeSlow++; c.resumeAt = 0; }
    c.unacked++;
    if (c.unacked >= 8) this.ack(fr.cam, t);
  }
  ack(cam, t) { const c = this.cam[cam]; if (!this.ws || this.ws.readyState !== 1 || !c.last) return; try { this.ws.send(JSON.stringify({ t: 'ack', cam, seq: c.last })); } catch (e) { /* */ } c.unacked = 0; c.sinceAck = 0; c.lastAckAt = t; }
  ackTimer() { if (this.paused) return; const t = now(); this.cam.forEach((c, i) => { if (c.unacked && t - c.lastAckAt >= 400) this.ack(i, t); }); }
  setPaused(p) {
    if (p === this.paused) return;
    this.paused = p; const t = now();
    if (p) { for (const c of this.cam) c.lastProbeAt = 0; log(`${this.name} viewer: stops acking`); }
    else { let cut = 0; this.cam.forEach((c, i) => { if (c.codec === 2 && c.sinceAck >= LAG_H264) { c.resumeAt = t; cut++; } this.ack(i, t); }); this.cutPauses += cut ? 1 : 0; log(`${this.name} viewer: acks again (${cut} camera(s) had been cut off, ${this.probeKeys} probe key frames so far)`); }
  }
  stats(t = now()) {
    return { connected: !!(this.ws && this.ws.readyState === 1), connects: this.connects, frames: this.frames, fps5s: +this.rate.count(t).toFixed(2), kbps5s: +this.rate.bytesKbps(t).toFixed(1), gapKeyViolations: this.gapKeyViolations,
      startNonKey: this.startNonKey, maxStallMs: this.maxStallMs, ...(this.slow ? { paused: this.paused, pFramesWhilePaused: this.pWhilePaused, probeKeys: this.probeKeys, probeMinIntervalMs: this.probeMinMs,
        cutPauses: this.cutPauses, resumes: this.resumeMs.length, resumeMaxMs: this.resumeMs.length ? Math.max(...this.resumeMs) : 0, resumeSlow: this.resumeSlow } : {}) };
  }
}
function ensureViewers() { for (const v of Object.values(views)) v.start(); }
const browserConns = new Set();
function startIdle() {
  log('idle: every viewer leaves (watch n=0)');
  for (const v of Object.values(views)) v.shut();
  for (const c of browserConns) c.close(4100, 'soak: idle phase');
}
function viewerUpgrade(req, socket, head, url) {
  if (PH.cur && PH.cur.idle) { if (!handshake(req, socket)) return; const c = new WsConn(socket, head, {}); c.close(4100, 'soak: idle phase'); return; }
  if (!handshake(req, socket)) return;
  const conn = new WsConn(socket, head, { label: 'view' });
  if (!url.searchParams.get('sim')) browserConns.add(conn);
  relayConnect(conn, 'https://cam/ws?role=' + (url.searchParams.get('role') === 'dir' ? 'dir' : 'view'), false, { onClose: () => browserConns.delete(conn) });
}

// ---------------------------------------------------------------- HTTP
function metrics(full) {
  const t = now(), tot = totals(t), p = PH.cur;
  const m = {
    mode: MODE, preset: PRESET, port: PORT, link: `http://127.0.0.1:${PORT}/live/cam/${MODE === 'local' ? TOKEN : TOKEN.slice(0, 4) + '…'}`, upstream: MODE === 'upstream' ? masked(upstreamWs) : '',
    uptimeSec: +((t - t0) / 1000).toFixed(1), started: PH.started, done: PH.done, durationSec: DURATION_S, cycleSec: CYCLE_S, runSec: PH.started ? +((t - PH.startAt) / 1000).toFixed(1) : 0,
    phase: p ? p.name : PH.done ? 'done' : 'warmup', step: p ? p.step || '' : '', phaseElapsedSec: p ? +((t - PH.startedAt) / 1000).toFixed(1) : 0, phaseRemainingSec: p ? +(p.sec - (t - PH.startedAt) / 1000).toFixed(1) : 0, cycle: PH.cycle + 1,
    throttleKbps: throttleKbps(), throttleOverride: PH.override, throttlePausedMs: pubBucket.pausedMs, uploadBytesIn: pubBucket.bytes,
    pubConnected: S.pubConnected, watchers: S.watchSent, connections: S.connections, disconnectsInjected: S.disconnectsInjected, unexpectedDisconnects: S.unexpectedDisconnects, refusedConnections: S.refusedConnections,
    closeCodes: S.closeCodes, reconnects: S.reconnects, reconnectLatenciesMs: S.reconnectLatenciesMs, maxReconnectMs: S.reconnectLatenciesMs.length ? Math.max(...S.reconnectLatenciesMs) : 0, reconnectHelloMs: S.reconnectHelloMs, reconnectPending: !!S.pending,
    hello: S.hello, hellos: S.hellos, invalidFrames: S.invalidFrames, keyRequestsToPub: S.keyRequestsToPub, watchMessages: S.watchMessages,
    totalFps: tot.fps5s, totalKbps: tot.kbps5s, totalGaps: tot.seqGaps, gapKeyViolations: tot.gapKeyViolations, startNonKey: tot.startNonKey, unexpectedFallbacks: tot.unexpectedFallbacks, totals: tot,
    cams: S.cams.map((c) => ({ i: c.i, codec: c.codec, w: c.w, h: c.h, frames: c.frames, keyframes: c.keyframes, bytes: c.bytes, fps5s: +c.rate.count(t).toFixed(2), kbps5s: +c.rate.bytesKbps(t).toFixed(1), lastSeq: c.lastSeq,
      seqGaps: c.seqGaps, gapFrames: c.gapFrames, gapKeyViolations: c.gapKeyViolations, seqBackwards: c.seqBackwards, startNonKey: c.startNonKey, unexpectedFallbacks: c.unexpectedFallbacks, maxGapMs: c.maxGapMs })),
    viewers: Object.fromEntries(Object.entries(views).map(([k, v]) => [k, v.stats(t)])), browserViewers: browserConns.size,
    slowViewerPFramesWhilePaused: views.slow ? views.slow.pWhilePaused : 0, viewerGapKeyViolations: viewerViolations(),
    idle: S.idle, resumes: S.resumes,
    relay: relay ? { pubSockets: ctx.getWebSockets('pub').length, viewerSockets: ctx.getWebSockets('view').length + ctx.getWebSockets('dir').length,
      gop: relay.gop.map((g) => (g ? (g.cut ? 'cut' : g.frames.length) : null)) } : null,
    phases: PH.summaries, events: events.slice(-40),
  };
  if (full) m.series = series;
  return m;
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const send = (code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 1)); };
  if (url.pathname === '/metrics') return send(200, metrics(url.searchParams.get('full') === '1'));
  if (url.pathname === '/control') {
    const q = url.searchParams, did = [];
    if (q.has('throttle')) { const v = q.get('throttle'); PH.override = v === 'auto' ? null : Math.max(0, Number(v) || 0); did.push('throttle ' + v); }
    if (q.has('phase')) { const i = PHASES.findIndex((p) => p.name === q.get('phase') || p.name + '/' + p.step === q.get('phase')); if (i < 0) return send(400, { error: 'no such phase', phases: PHASES.map((p) => p.name + (p.step ? '/' + p.step : '')) }); if (!PH.started) { PH.started = true; PH.startAt = now(); } enterPhase(i); did.push('phase ' + q.get('phase')); }
    if (q.get('disconnect') === '1') { injectDisconnect(Number(q.get('refuse') || 10)); did.push('disconnect'); }
    if (q.has('slow')) { PH.slowOverride = ['pause', 'resume'].includes(q.get('slow')) ? q.get('slow') : 'auto'; did.push('slow ' + PH.slowOverride); }
    if (q.get('stop') === '1') { finishPhases(); did.push('stop'); }
    if (q.get('quit') === '1') { setTimeout(shutdown, 50); did.push('quit'); }
    log('control:', did.join(', ') || '(nothing)');
    return send(200, { ok: true, did, phase: PH.cur ? PH.cur.name : PH.done ? 'done' : 'warmup', throttleKbps: throttleKbps() });
  }
  if (url.pathname === '/view' && MODE === 'local') return send(200, VIEW_HTML, 'text/html; charset=utf-8');
  if (url.pathname === '/' ) return send(200, `Polaris Cam soak proxy (${MODE}, ${PRESET}). /metrics /control ${MODE === 'local' ? '/view' : ''}\n`, 'text/plain; charset=utf-8');
  send(404, { error: 'not found' });
});
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => { /* */ });
  const url = new URL(req.url, 'http://127.0.0.1');
  const m = url.pathname.match(/^\/live\/cam\/([^/]{1,256})\/ws\/?$/);
  if (m) {
    if (MODE === 'upstream' && m[1] !== TOKEN) { refuse(socket, 404, 'Not Found'); return; }
    return pubUpgrade(req, socket, head);
  }
  if (MODE === 'local' && url.pathname === '/admin/api/cam/ws') return viewerUpgrade(req, socket, head, url);
  refuse(socket, 404, 'Not Found');
});

// ---------------------------------------------------------------- the /view page (local)
const VIEW_HTML = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Polaris Cam soak view</title><style>
:root{--bg:#0d1117;--fg:#e6edf3;--mut:#8b949e;--bad:#f85149;--ok:#3fb950}
body{margin:0;background:var(--bg);color:var(--fg);font:13px system-ui,sans-serif}
header{padding:8px 16px;display:flex;gap:16px;flex-wrap:wrap;align-items:baseline}header b{font-size:15px}
#grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:6px;padding:0 16px 16px}
figure{margin:0;background:#000;position:relative}canvas{width:100%;aspect-ratio:16/9;display:block}
figcaption{position:absolute;left:6px;top:4px;font:12px ui-monospace,monospace;text-shadow:0 0 3px #000}.bad{color:var(--bad)}.ok{color:var(--ok)}
</style></head><body><header><b>Polaris Cam 本機壓測畫面</b><span id="st">連線中…</span><span id="ph"></span></header><div id="grid"></div><script>
const N=4,cams=[];const grid=document.getElementById('grid'),st=document.getElementById('st'),ph=document.getElementById('ph');
for(let i=0;i<N;i++){const f=document.createElement('figure'),c=document.createElement('canvas'),cap=document.createElement('figcaption');c.width=960;c.height=540;f.append(c,cap);grid.append(f);
cams.push({c,g:c.getContext('2d'),cap,dec:null,wantKey:true,last:0,n:0,fps:0,t:performance.now(),codec:0,err:0,gaps:0});}
let ws;function hex(n){return n.toString(16).padStart(2,'0')}
function sps(u8){for(let i=0;i+4<u8.length;i++){if(u8[i]===0&&u8[i+1]===0&&u8[i+2]===1&&(u8[i+3]&31)===7)return 'avc1.'+hex(u8[i+4])+hex(u8[i+5])+hex(u8[i+6]);}return null}
function mkdec(k,codec){if(k.dec)try{k.dec.close()}catch(e){}k.dec=new VideoDecoder({output:f=>{k.g.drawImage(f,0,0,k.c.width,k.c.height);f.close()},error:e=>{k.err++;k.wantKey=true;k.dec=null;askKey(cams.indexOf(k))}});k.dec.configure({codec,optimizeForLatency:true});}
function askKey(i){if(ws&&ws.readyState===1)ws.send(JSON.stringify({t:'key',cam:i}))}
function onFrame(buf){const d=new DataView(buf),u=new Uint8Array(buf);if(u[0]!==0x50)return;const i=u[2],codec=u[3],key=(u[4]&1)===1,w=d.getUint16(6,true),h=d.getUint16(8,true),seq=d.getUint32(12,true);const k=cams[i];if(!k)return;
if(k.last&&seq>k.last+1&&!key)k.gaps++;k.last=seq;k.n++;
if(codec===1){createImageBitmap(new Blob([u.subarray(16)],{type:'image/jpeg'})).then(b=>{k.g.drawImage(b,0,0,k.c.width,k.c.height);b.close()});}
else{const data=u.subarray(16);if(key){const s=sps(data);if(s&&(!k.dec||k.codecStr!==s)){k.codecStr=s;try{mkdec(k,s)}catch(e){k.err++}}k.wantKey=false}
if(k.dec&&!k.wantKey){try{k.dec.decode(new EncodedVideoChunk({type:key?'key':'delta',timestamp:seq*33333,data}))}catch(e){k.err++;k.wantKey=true;askKey(i)}}}
k.codec=codec;ws.send(JSON.stringify({t:'ack',cam:i,seq}));}
function connect(){ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/admin/api/cam/ws?role=view');ws.binaryType='arraybuffer';
ws.onopen=()=>{st.textContent='已連線';st.className='ok';cams.forEach(k=>{k.last=0;k.wantKey=true})};ws.onmessage=e=>{if(typeof e.data!=='string')onFrame(e.data)};
ws.onclose=e=>{st.textContent='已斷線（'+e.code+(e.reason?' '+e.reason:'')+'），2 秒後重連';st.className='bad';setTimeout(connect,2000)}}
setInterval(()=>{const t=performance.now();cams.forEach((k,i)=>{k.fps=(k.n*1000/(t-k.t)).toFixed(1);k.n=0;k.t=t;k.cap.textContent='CAM '+(i+1)+' · '+(k.codec===2?'H.264':k.codec===1?'JPEG':'—')+' · '+k.fps+' fps · seq '+k.last+(k.gaps?' · 缺格無關鍵格 '+k.gaps:'')+(k.err?' · 解碼錯誤 '+k.err:'')})},1000);
setInterval(()=>fetch('/metrics').then(r=>r.json()).then(m=>{ph.textContent='階段 '+m.phase+(m.step?'/'+m.step:'')+'（剩 '+Math.max(0,m.phaseRemainingSec).toFixed(0)+' s）· 限速 '+(m.throttleKbps||'無')+' kbps · 上傳 '+m.totalFps+' fps '+m.totalKbps+' kbps · 違規 '+m.gapKeyViolations}).catch(()=>{}),1000);
if(!('VideoDecoder' in window))st.textContent='此瀏覽器沒有 WebCodecs（請用 Chrome / Edge）';connect();
</script></body></html>`;

// ---------------------------------------------------------------- start
async function main() {
  installRuntime();
  const mod = await import(pathToFileURL(CAM_JS).href);
  frameIn = mod.frameIn; helloIn = mod.helloIn; camPublic = mod.camPublic;
  if (MODE === 'local') {
    storage.set('cfg', { token: TOKEN, by: 'soak', at: Date.now() });
    relay = new mod.CamRelay(ctx, {});
    if (!/^[A-Za-z0-9_-]{24,40}$/.test(TOKEN)) log('warning: the token is not one CamRelay keeps; it will make its own and polaris-cam will get 4004');
  }
  server.listen(PORT, '127.0.0.1', () => {
    log(`soak proxy ${MODE} ${PRESET}: ${DURATION_S} s of phases (${CYCLE_S} s a cycle) after warm-up, on 127.0.0.1:${PORT}`);
    log(`polaris-cam link: http://127.0.0.1:${PORT}/live/cam/${MODE === 'local' ? TOKEN : TOKEN.slice(0, 4) + '…(the same token as the real link)'}`);
    if (MODE === 'upstream') log(`upstream: ${masked(upstreamWs)}`);
    if (MODE === 'local') {
      log(`CamRelay from ${CAM_JS}`);
      log(`view the four cameras: http://127.0.0.1:${PORT}/view`);
      views.fast = new Viewer('fast', false); views.slow = new Viewer('slow', true); ensureViewers();
    }
    if (OUT_DIR) fs.writeFileSync(path.join(OUT_DIR, 'proxy-ready.json'), JSON.stringify({ port: PORT, mode: MODE, preset: PRESET, pid: process.pid }));
  });
  server.on('error', (e) => { console.error('soak-proxy: ' + e.message); process.exit(3); });
  setInterval(tick, 200);
  setInterval(sample, 1000);
}
let stopping = false;
function shutdown() {
  if (stopping) return; stopping = true;
  if (OUT_DIR) { try { fs.writeFileSync(path.join(OUT_DIR, 'proxy-final.json'), JSON.stringify(metrics(true), null, 1)); } catch (e) { /* */ } }
  log('soak proxy stopping');
  for (const v of Object.values(views)) v.shut();
  if (pubConn) pubConn.close(1001, 'soak proxy stopping');
  setTimeout(() => process.exit(0), 600);
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown); process.on('SIGBREAK', shutdown);
// run-soak.ps1 ends it with GET /control?quit=1 (which writes proxy-final.json first)
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
