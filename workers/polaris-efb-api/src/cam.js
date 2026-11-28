/* ---------- Polaris Cam (Operations admin › Broadcast, Nov 2026) ----------
   The cockpit cameras of the streaming pilot's simulator PC, live in the admin: Polaris Cam on that PC sends each
   camera's latest picture here, and this server passes it on to the staff who have the Broadcast page open. Its own
   Durable Object, apart from the broadcast desk (desk.js): whatever happens to the pictures, the desk carries on.
     GET  /admin/api/cam                   -> { pub, watchers, token (directors only) }   (staff who see Broadcast)
     POST /admin/api/cam  { op:'token' }   a new connection link; the old one stops        (staff who may direct)
     GET  /admin/api/cam/ws                (WebSocket) the pictures, live: a director's ('dir') or a watcher's ('view')
     GET  /live/cam/<token>/ws             (WebSocket) Polaris Cam on the simulator PC (no sign-in: the token)
   Text messages are JSON:
     Polaris Cam -> here    { t:'hello', v, mode:'jpeg'|'h264', cams:[{ i:0..3, name, on, w, h }] }
     here -> Polaris Cam    { t:'watch', n }   how many staff are watching (0: no one, nothing need be sent)
     here -> the admin      { t:'hello', role, token (dir only), pub, watchers }, { t:'pub', pub, watchers },
                            { t:'token', token } (dir only)
     the admin -> here      { t:'ack', cam, seq }   the last picture of that camera the page has shown
     either way             "ping" -> "pong" (answered without waking the object)
   Binary messages are a picture, the same from Polaris Cam to here as from here to the admin: a 16-byte header,
   little-endian, then the picture:
     0 'P' (0x50) · 1 version 1 · 2 camera 0..3 · 3 codec (1 JPEG, 2 H.264 Annex-B, for later) · 4 flags (bit 0: key
     frame; always 1 for JPEG) · 5 reserved 0 · 6-7 width 1..4096 · 8-9 height 1..4096 · 10-11 reserved 0 ·
     12-15 seq (each camera's own, rising, > 0) · 16.. the picture (a JPEG starts FF D8). 18 bytes to 1 MiB in all.
   Kept in storage: cfg { token, by, at }. Not kept: the pictures (only the latest of each camera, in memory, so a page
   opened midway shows something at once; dropped when Polaris Cam leaves).
   A slow page is not sent more than it can take: once 8 pictures of a camera have gone to it without an ack that
   catches up, that camera pauses for that page (one fresh picture every 3 s, to see if it has caught up) until it acks. */

const CAMS = 4, HDR = 16, MIN_LEN = HDR + 2, MAX_LEN = 1048576, LAG = 8, PROBE_MS = 3000, RING = 32;
export const CAM_GONE = 'This Polaris Cam link is no longer in use';
const line = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const tokOk = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{24,40}$/.test(t);
const newTok = () => { const b = new Uint8Array(18); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const dim = (v) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= 1 && x <= 4096 ? x : 0; };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const upgrade = (req) => (req.headers.get('Upgrade') || '').toLowerCase() === 'websocket';
const stub = (env) => env.CAM.get(env.CAM.idFromName('cam'));

/* what Polaris Cam says about itself, as kept */
export function helloIn(j) {
  const cams = [], seen = new Set();
  for (const c of Array.isArray(j && j.cams) ? j.cams : []) {
    if (!c || typeof c !== 'object') continue;
    const i = Number(c.i); if (!Number.isInteger(i) || i < 0 || i >= CAMS || seen.has(i)) continue;
    seen.add(i); cams.push({ i, name: line(c.name, 40) || 'Camera ' + (i + 1), on: c.on !== false, w: dim(c.w), h: dim(c.h) });
    if (cams.length >= CAMS) break;
  }
  cams.sort((a, b) => a.i - b.i);
  return { v: line(j && j.v, 20), mode: j && j.mode === 'h264' ? 'h264' : 'jpeg', cams };
}
/* a picture's header, or null when it is not one (dropped without a word) */
export function frameIn(buf) {
  if (ArrayBuffer.isView(buf)) buf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  if (!(buf instanceof ArrayBuffer)) return null;
  const n = buf.byteLength; if (n < MIN_LEN || n > MAX_LEN) return null;
  const b = new Uint8Array(buf), d = new DataView(buf);
  if (b[0] !== 0x50 || b[1] !== 1) return null;
  const cam = b[2], codec = b[3]; if (cam >= CAMS || (codec !== 1 && codec !== 2)) return null;
  const w = d.getUint16(6, true), h = d.getUint16(8, true), seq = d.getUint32(12, true);
  if (!w || w > 4096 || !h || h > 4096 || !seq) return null;
  if (codec === 1 && (b[HDR] !== 0xff || b[HDR + 1] !== 0xd8)) return null;
  return { buf, cam, codec, key: (b[4] & 1) === 1, w, h, seq };
}

/* ---- routes ---- */
/* the admin (from mail.js, after Cloudflare Access and the role: direct = may direct the live broadcast) */
export async function camAdmin(req, url, env, who, direct) {
  if (!env.CAM) return json({ error: 'Polaris Cam is not set up on the server yet' }, 503);
  const path = url.pathname.replace(/\/+$/, ''), role = direct ? 'dir' : 'view';
  if (path === '/admin/api/cam/ws') {
    if (!upgrade(req)) return json({ error: 'WebSocket only' }, 426);
    /* only the admin's own page (not another site the staff member has open) */
    const o = req.headers.get('Origin'); if (o && o !== url.origin) return json({ error: 'Not allowed' }, 403);
    return stub(env).fetch(new Request('https://cam/ws?role=' + role, req));
  }
  if (req.method === 'GET') return stub(env).fetch('https://cam/state?role=' + role);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!direct) return json({ error: 'Your role cannot direct the live broadcast' }, 403);
  const t = await req.text(); if (t.length > 2000) return json({ error: 'Too large' }, 413);
  let b; try { b = JSON.parse(t); } catch (e) { return json({ error: 'Bad body' }, 400); }
  if (!b || b.op !== 'token') return json({ error: 'Not something Polaris Cam can do' }, 400);
  return stub(env).fetch('https://cam/token', { method: 'POST', body: JSON.stringify({ who: who || '' }) });
}
/* Polaris Cam on the simulator PC (no sign-in: the token in the link) */
export async function camPublic(req, url, env) {
  const m = url.pathname.match(/^\/live\/cam\/([^/]{1,200})\/ws\/?$/); if (!m) return json({ error: 'Not found' }, 404);
  if (!upgrade(req)) return new Response('WebSocket only', { status: 426 });
  if (!env.CAM) return new Response('Not set up on the server', { status: 503 });
  return stub(env).fetch(new Request('https://cam/pub?t=' + encodeURIComponent(m[1]), req));
}

/* ---- the relay: one Durable Object ---- */
export class CamRelay {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.cfg = null;
    this.pub = null;                         /* { v, mode, cams, at } while Polaris Cam is here */
    this.offAt = 0;                          /* when it left */
    this.last = new Array(CAMS).fill(null);  /* each camera's latest JPEG { buf, seq, w, h, at } */
    this.flow = new Map();                   /* each page: per camera { ring (sent, not acked), acked, sent, pausedAt } */
    /* the keep-alive, answered without waking the relay */
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch (e) { /* not on this runtime */ }
  }
  async conf() {
    if (!this.cfg) {
      const c = (await this.ctx.storage.get('cfg')) || {};
      this.cfg = { token: tokOk(c.token) ? c.token : '', by: line(c.by, 120), at: +c.at || 0 };
      if (!this.cfg.token) { this.cfg.token = newTok(); this.cfg.at = Date.now(); await this.ctx.storage.put('cfg', this.cfg); }
    }
    return this.cfg;
  }
  socks(tag, except) { return this.ctx.getWebSockets(tag).filter((w) => w !== except && w.readyState !== 2 && w.readyState !== 3); }
  viewers(except) { return [...this.socks('dir', except), ...this.socks('view', except)]; }
  watchers(except) { return this.viewers(except).length; }
  send(w, m) { if (!w) return false; try { w.send(typeof m === 'string' || m instanceof ArrayBuffer ? m : JSON.stringify(m)); return true; } catch (e) { return false; } }
  to(list, m) { const s = typeof m === 'string' ? m : JSON.stringify(m); for (const w of list) this.send(w, s); }
  pubSock(except) { return this.socks('pub', except)[0] || null; }
  /* Polaris Cam as the pages see it (after the relay was away from memory: what it said, kept with its socket) */
  pubOut(except) {
    const w = this.pubSock(except);
    if (!w) return { on: false, v: '', mode: 'jpeg', cams: [], at: this.offAt };
    if (!this.pub) { let a = null; try { a = w.deserializeAttachment && w.deserializeAttachment(); } catch (e) { a = null; } this.pub = (a && a.pub) || { v: '', mode: 'jpeg', cams: [], at: (a && +a.at) || Date.now() }; }
    return { on: true, ...this.pub, cams: this.pub.cams.map((c) => ({ ...c })) };
  }
  state(role, except) { return { pub: this.pubOut(except), watchers: this.watchers(except), ...(role === 'dir' ? { token: this.cfg.token } : {}) }; }
  /* who is watching, to Polaris Cam (it need send nothing while no one is) and to the pages */
  tellAll(except) {
    const n = this.watchers(except);
    this.send(this.pubSock(except), { t: 'watch', n });
    this.to(this.viewers(except), { t: 'pub', pub: this.pubOut(except), watchers: n });
  }
  fl(ws) {
    let f = this.flow.get(ws);
    if (!f) { f = Array.from({ length: CAMS }, () => ({ ring: [], acked: 0, sent: 0, pausedAt: 0 })); this.flow.set(ws, f); }
    return f;
  }
  /* a picture to one page, unless that page is behind on this camera */
  offer(ws, fr, now) {
    const f = this.fl(ws)[fr.cam];
    if (f.ring.length >= LAG) {                      /* paused: `ring.length` pictures sent and not acked */
      if (!f.pausedAt) { f.pausedAt = now; return false; }
      if (fr.codec !== 1 || now - f.pausedAt < PROBE_MS) return false;
      f.pausedAt = now;                              /* one fresh JPEG, to see whether it has caught up */
    }
    if (!this.send(ws, fr.buf)) return false;
    f.ring.push(fr.seq); if (f.ring.length > RING) f.ring.shift(); f.sent++;
    return true;
  }
  ack(ws, j) {
    const cam = Number(j.cam), seq = Number(j.seq);
    if (!Number.isInteger(cam) || cam < 0 || cam >= CAMS || !Number.isInteger(seq) || seq <= 0 || seq > 0xffffffff) return;
    const f = this.fl(ws)[cam], i = f.ring.lastIndexOf(seq); if (i < 0) return;   /* not one sent to it (or acked already) */
    f.ring.splice(0, i + 1); f.acked = seq;
    if (f.ring.length < LAG) f.pausedAt = 0;
  }
  clearPictures() { this.last = new Array(CAMS).fill(null); this.flow.clear(); }
  dropPub(ws) {
    if (this.pubSock(ws)) return;                    /* another Polaris Cam took over: still here */
    if (!this.pub && !this.last.some(Boolean) && this.offAt) return;
    this.pub = null; this.offAt = Date.now(); this.clearPictures();
    this.to(this.viewers(), { t: 'pub', pub: this.pubOut(ws), watchers: this.watchers() });
  }
  async fetch(req) {
    const url = new URL(req.url), p = url.pathname, cfg = await this.conf();
    if (p === '/state') return json(this.state(url.searchParams.get('role') === 'dir' ? 'dir' : 'view'));
    if (p === '/token' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      cfg.token = newTok(); cfg.by = line(b && b.who, 120); cfg.at = Date.now(); await this.ctx.storage.put('cfg', cfg);
      const old = this.socks('pub');
      for (const w of old) { try { w.close(4004, CAM_GONE); } catch (e) { /* gone */ } }
      if (old.length) this.dropPub(old[0]);
      this.to(this.socks('dir'), { t: 'token', token: cfg.token });
      return json({ ok: true, token: cfg.token, pub: this.pubOut(), watchers: this.watchers() });
    }
    if (!upgrade(req)) return json({ error: 'Not found' }, 404);
    const [client, server] = Object.values(new WebSocketPair());
    const ok = () => new Response(null, { status: 101, webSocket: client });
    if (p === '/pub') {
      if (url.searchParams.get('t') !== cfg.token) { server.accept(); server.close(4004, CAM_GONE); return ok(); }
      /* one Polaris Cam at a time: a new one replaces the old */
      for (const w of this.socks('pub')) { try { w.close(4000, 'Another Polaris Cam took over'); } catch (e) { /* gone */ } }
      this.ctx.acceptWebSocket(server, ['pub']);
      const at = Date.now(); this.pub = { v: '', mode: 'jpeg', cams: [], at }; this.clearPictures();
      try { server.serializeAttachment({ at }); } catch (e) { /* kept in memory only */ }
      this.tellAll();
      return ok();
    }
    if (p === '/ws') {
      const role = url.searchParams.get('role') === 'dir' ? 'dir' : 'view';
      this.ctx.acceptWebSocket(server, [role]);
      this.send(server, { t: 'hello', role, ...this.state(role) });
      /* the latest picture of each camera, so a page opened midway shows something at once */
      const now = Date.now(); for (let c = 0; c < CAMS; c++) { const L = this.last[c]; if (L) this.offer(server, { buf: L.buf, cam: c, codec: 1, seq: L.seq }, now); }
      this.send(this.pubSock(), { t: 'watch', n: this.watchers() });
      this.to(this.viewers(server), { t: 'pub', pub: this.pubOut(), watchers: this.watchers() });
      return ok();
    }
    server.accept(); server.close(4004, 'Not found'); return ok();
  }
  async webSocketMessage(ws, msg) {
    let role = ''; try { role = this.ctx.getTags(ws)[0]; } catch (e) { return; }
    if (typeof msg !== 'string') {
      if (role !== 'pub') return;                    /* pictures come only from Polaris Cam */
      const fr = frameIn(msg); if (!fr) return;
      const now = Date.now();
      if (fr.codec === 1) this.last[fr.cam] = { buf: fr.buf, seq: fr.seq, w: fr.w, h: fr.h, at: now };
      for (const w of this.viewers()) this.offer(w, fr, now);
      return;
    }
    if (msg === 'ping') { this.send(ws, 'pong'); return; }   /* where the automatic answer is not there */
    if (msg.length > 65536) return;
    let j; try { j = JSON.parse(msg); } catch (e) { return; }
    if (!j || typeof j !== 'object') return;
    await this.conf();
    if (role === 'pub') {
      if (j.t !== 'hello') return;
      const was = this.pub || {}, h = helloIn(j);
      this.pub = { ...h, at: +was.at || Date.now() };
      try { ws.serializeAttachment({ at: this.pub.at, pub: this.pub }); } catch (e) { /* kept in memory only */ }
      this.to(this.viewers(), { t: 'pub', pub: this.pubOut(), watchers: this.watchers() });
      return;
    }
    if ((role === 'dir' || role === 'view') && j.t === 'ack') this.ack(ws, j);
  }
  async webSocketClose(ws, code) { try { ws.close(code === 1005 || code === 1006 ? 1000 : code, ''); } catch (e) { /* closed */ } this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }
  gone(ws) {
    let role = ''; try { role = this.ctx.getTags(ws)[0]; } catch (e) { return; }
    this.flow.delete(ws);
    if (role === 'pub') this.dropPub(ws);
    else if (role === 'dir' || role === 'view') this.tellAll(ws);
  }
}
