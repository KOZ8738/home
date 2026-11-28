/* ---------- Polaris Cam (Operations admin › Broadcast and Flight Watch, Nov 2026) ----------
   The cockpit cameras of a pilot's simulator PC, live in the admin: Polaris Cam on that PC sends each camera's latest
   picture here, and this server passes it on to the staff watching. Its own Durable Object class, apart from the
   broadcast desk (desk.js): whatever happens to the pictures, the desk carries on. One object a channel:
     'cam'          Broadcast's own channel: the streaming PC connected by hand, with Broadcast's link (as before)
     'pilot:<ID>'   each pilot's own channel (ID: 2-16 letters and digits, upper case, e.g. PAW0006), for Flight Watch,
                    and for Broadcast when no PC is on its own channel but a streaming pilot is set (its "Auto" source)
   The 'cam' object also keeps the small list of the pilots whose Polaris Cam is on now: each pilot's object tells it
   when theirs connects, says hello or goes (never a word a picture).
     GET  /admin/api/cam[?pilot=ID]        -> { pub, watchers, token (directors only) }
     POST /admin/api/cam  { op:'token'[, pilot] }   a new connection link; the old one stops     (staff who may direct)
     GET  /admin/api/cam/ws[?pilot=ID]     (WebSocket) the pictures, live: a director's ('dir') or a watcher's ('view')
     GET  /admin/api/cam/online            -> { online: { ID: { v, mode, cams, at } } }   whose Polaris Cam is on now
          Broadcast's own channel is for staff who see Broadcast; a pilot's for those who see Flight Watch or Broadcast.
     GET  /live/cam/<token>/ws             (WebSocket) Polaris Cam, on Broadcast's own channel (no sign-in: the token)
     GET  /live/cam/pilot/ws?ticket=       (WebSocket) Polaris Cam, on its pilot's channel, signed in by Polaris Navdata
                                           (a ticket from /api/nav/ticket, good for 60 s)
     GET  /live/cam/p/<ID>/<token>/ws      (WebSocket) Polaris Cam, on that pilot's channel with the channel's own link
                                           (made in Flight Watch, for a PC without Polaris Navdata)
   Text messages are JSON:
     Polaris Cam -> here    { t:'hello', v, mode:'jpeg'|'h264', cams:[{ i:0..3, name, on, w, h, codec:'jpeg'|'h264' }] }
                            (a camera without its own codec has the top-level mode)
     here -> Polaris Cam    { t:'id', pilot }  on a pilot's channel, as it connects: whose channel it is on
                            { t:'watch', n }   how many staff are watching (0: no one, nothing need be sent)
                            { t:'key', cam }   an H.264 key frame (IDR, with SPS/PPS) of that camera, now please
                                               (at most once a second a camera, however many pages ask)
     here -> the admin      { t:'hello', role, token (dir only), pub, watchers }, { t:'pub', pub, watchers },
                            { t:'token', token } (dir only)
     the admin -> here      { t:'ack', cam, seq }   the last picture of that camera the page has had
                            { t:'key', cam }   its decoder needs a key frame (passed on to Polaris Cam, as above)
     either way             "ping" -> "pong" (answered without waking the object)
   Polaris Cam is closed with 4000 when another Polaris Cam takes over its channel; 4001 when its ticket is missing,
   wrong or old (it asks Polaris Navdata for a new one and connects again); 4004 when its link is not, or no longer,
   the channel's link (a new link on a pilot's channel stops only the PCs that came with a link, not Navdata's).
   Binary messages are a picture, the same from Polaris Cam to here as from here to the admin: a 16-byte header,
   little-endian, then the picture:
     0 'P' (0x50) · 1 version 1 · 2 camera 0..3 · 3 codec (1 JPEG, 2 H.264 Annex-B) · 4 flags (bit 0: key frame;
     always 1 for JPEG, for H.264 an IDR with its SPS/PPS) · 5 reserved 0 · 6-7 width 1..4096 · 8-9 height 1..4096 ·
     10-11 duration_ms (the time a frame stands for; 0: the page takes 33) · 12-15 seq (each camera's own, rising, > 0) ·
     16.. the picture: a JPEG starts FF D8; H.264 is Annex-B, starting 00 00 01 or 00 00 00 01 (5 bytes at least).
     18 bytes to 1 MiB in all.
   Kept in storage: cfg { token, by, at } (each channel its own link); on 'cam' also online { ID: { v, mode, cams, at,
   seen } } (at most 200, written only as a PC connects, says hello or goes). Kept with Polaris Cam's socket (so it
   lasts while the object is away from memory): { at, pub, pilot, auth }. Not kept: the pictures. In memory only, so a
   page opened midway shows something at once: a JPEG camera's latest picture; an H.264 camera's frames since its latest
   key frame (the GOP: at most 75 frames and 768 KB a camera; past that it stops keeping them until the next key frame,
   and a page opening then asks Polaris Cam for one). Dropped when Polaris Cam leaves or comes back, and a camera's when
   its codec changes.
   A slow page is not sent more than it can take. JPEG: once 8 pictures of a camera have gone to it without an ack that
   catches up, that camera pauses for that page (one fresh picture every 3 s, to see if it has caught up) until it acks.
   H.264: once 45 frames are out unacked, it is sent no more frames that depend on the ones it missed: nothing until a
   key frame, and while it is still behind only one key frame every 3 s; when its acks bring it under 15, Polaris Cam is
   asked for a key frame, and the next one starts it again. A page never gets a broken GOP. */
import { navWsTicketUser } from './auth.js';

const CAMS = 4, HDR = 16, MIN_LEN = HDR + 2, MIN_H264 = HDR + 5, MAX_LEN = 1048576, PROBE_MS = 3000, RING = 96;
const LAG_JPEG = 8, LAG_H264 = 45, RESUME_H264 = 15, GOP_FRAMES = 75, GOP_BYTES = 768 * 1024, KEY_MS = 1000;
export const CAM_GONE = 'This Polaris Cam link is no longer in use';
export const CAM_TICKET = 'Polaris Cam ticket expired or invalid';
const ONLINE_MAX = 200;
/* on 'cam' also: the pilots' channels staff watched lately (watched { ID: at }, 200 at most, a week), whether a Polaris
   Cam is on there or not, so a role taken away closes those pages too (/revoke); written at most once an hour a channel */
const WATCH_MS = 7 * 86400_000, WATCH_EVERY = 3600_000;
const line = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const tokOk = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{24,40}$/.test(t);
const newTok = () => { const b = new Uint8Array(18); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const dim = (v) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= 1 && x <= 4096 ? x : 0; };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const upgrade = (req) => (req.headers.get('Upgrade') || '').toLowerCase() === 'websocket';
const stub = (env) => env.CAM.get(env.CAM.idFromName('cam'));
/* a pilot ID as the channels are named by it: 2-16 letters and digits, upper case ('' when it is not one) */
export const normPilot = (v) => { const s = String(v == null ? '' : v).trim().toUpperCase(); return /^[A-Z0-9]{2,16}$/.test(s) ? s : ''; };
export const pilotOk = (v) => normPilot(v) !== '';
const pilotStub = (env, p) => env.CAM.get(env.CAM.idFromName('pilot:' + p));
/* an admin page's sign-in (P2, Nov 2026): kept with its socket { who, exp } (exp in seconds); once it has run out the
   socket is closed (4401) as it next speaks, and the link goes only to the directors still signed in */
export const WS_EXPIRED = 'Session expired', WS_REVOKED = 'Your access changed';
const wsExpired = (a, now = Date.now()) => !!(a && +a.exp > 0 && now > +a.exp * 1000);
/* close the admin WebSockets of these emails (and, with keep, of every email not in it) on Broadcast's own channel and
   on the channels of the pilots whose Polaris Cam is on (mail.js revokeWs, a role changed or taken away) */
export async function camRevoke(env, emails, keep) {
  if (!env || !env.CAM) return null;
  const r = await stub(env).fetch('https://cam/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails: emails || [], keep: keep || null }) });
  return r.json().catch(() => null);
}
/* a WebSocket answered and closed at once, the code saying why (to Polaris Cam) */
function refuse(code, why) { const [client, server] = Object.values(new WebSocketPair()); server.accept(); server.close(code, why); return new Response(null, { status: 101, webSocket: client }); }
/* the list of whose Polaris Cam is on, as kept: well-formed entries only, at most ONLINE_MAX (the latest seen) */
export function onlineIn(o) {
  const out = [];
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    const p = normPilot(k); if (!p || p !== k || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const h = helloIn(v); out.push([p, { v: h.v, mode: h.mode, cams: h.cams, at: Math.max(0, +v.at || 0), seen: Math.max(0, +v.seen || 0) }]);
  }
  out.sort((a, b) => b[1].seen - a[1].seen);
  return Object.fromEntries(out.slice(0, ONLINE_MAX));
}

/* what Polaris Cam says about itself, as kept */
export function helloIn(j) {
  const cams = [], seen = new Set(), mode = j && j.mode === 'h264' ? 'h264' : 'jpeg';
  for (const c of Array.isArray(j && j.cams) ? j.cams : []) {
    if (!c || typeof c !== 'object') continue;
    const i = Number(c.i); if (!Number.isInteger(i) || i < 0 || i >= CAMS || seen.has(i)) continue;
    seen.add(i); cams.push({ i, name: line(c.name, 40) || 'Camera ' + (i + 1), on: c.on !== false, w: dim(c.w), h: dim(c.h), codec: c.codec === 'h264' || c.codec === 'jpeg' ? c.codec : mode });
    if (cams.length >= CAMS) break;
  }
  cams.sort((a, b) => a.i - b.i);
  return { v: line(j && j.v, 20), mode, cams };
}
/* a picture's header, or null when it is not one (dropped without a word) */
export function frameIn(buf) {
  if (ArrayBuffer.isView(buf)) buf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  if (!(buf instanceof ArrayBuffer)) return null;
  const n = buf.byteLength; if (n < MIN_LEN || n > MAX_LEN) return null;
  const b = new Uint8Array(buf), d = new DataView(buf);
  if (b[0] !== 0x50 || b[1] !== 1) return null;
  const cam = b[2], codec = b[3]; if (cam >= CAMS || (codec !== 1 && codec !== 2)) return null;
  const w = d.getUint16(6, true), h = d.getUint16(8, true), dur = d.getUint16(10, true), seq = d.getUint32(12, true);
  if (!w || w > 4096 || !h || h > 4096 || !seq) return null;
  if (codec === 1 && (b[HDR] !== 0xff || b[HDR + 1] !== 0xd8)) return null;
  if (codec === 2 && (n < MIN_H264 || b[HDR] !== 0 || b[HDR + 1] !== 0 || !(b[HDR + 2] === 1 || (b[HDR + 2] === 0 && b[HDR + 3] === 1)))) return null;
  return { buf, cam, codec, key: codec === 1 || (b[4] & 1) === 1, w, h, dur, seq };
}

/* ---- routes ---- */
/* the admin (from mail.js, after Cloudflare Access and the role: direct = may direct the live broadcast; hasBc = sees
   Broadcast; mail.js lets in only those who see Flight Watch or Broadcast). Broadcast's own channel is for those who
   see Broadcast; a pilot's (?pilot=, or pilot in the POST) for all of them; the link, and a new one, for directors */
export async function camAdmin(req, url, env, who, direct, hasBc = true, exp = 0) {
  if (!env.CAM) return json({ error: 'Polaris Cam is not set up on the server yet' }, 503);
  const path = url.pathname.replace(/\/+$/, ''), role = direct ? 'dir' : 'view';
  if (path === '/admin/api/cam/online') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405);
    return stub(env).fetch('https://cam/online');
  }
  if (path !== '/admin/api/cam' && path !== '/admin/api/cam/ws') return json({ error: 'Not found' }, 404);
  /* which channel: a pilot's, or Broadcast's own */
  let raw = url.searchParams.get('pilot');
  if (path === '/admin/api/cam' && req.method === 'POST') {
    if (!direct) return json({ error: 'Your role cannot direct the live broadcast' }, 403);
    /* JSON only: a plain form posted from another site cannot make a new link */
    if (!/^application\/json\b/i.test(req.headers.get('Content-Type') || '')) return json({ error: 'Send JSON' }, 415);
    const t = await req.text(); if (t.length > 2000) return json({ error: 'Too large' }, 413);
    let b; try { b = JSON.parse(t); } catch (e) { return json({ error: 'Bad body' }, 400); }
    if (!b || typeof b !== 'object' || b.op !== 'token') return json({ error: 'Not something Polaris Cam can do' }, 400);
    /* the pilot in the body; one only in the address still counts (never Broadcast's own link by mistake) */
    if (b.pilot != null && String(b.pilot).trim() !== '') raw = String(b.pilot);
  }
  let pilot = '';
  if (raw != null && raw.trim() !== '') { pilot = normPilot(raw); if (!pilot) return json({ error: 'A pilot ID is 2 to 16 letters and digits, like PAW0006' }, 400); }
  else if (!hasBc) return json({ error: 'Your role does not see Broadcast. An administrator can change that under Settings › Roles.' }, 403);
  const S = pilot ? pilotStub(env, pilot) : stub(env), q = pilot ? '&pilot=' + pilot : '';
  if (path === '/admin/api/cam/ws') {
    if (!upgrade(req)) return json({ error: 'WebSocket only' }, 426);
    /* only the admin's own page (not another site the staff member has open) */
    const o = req.headers.get('Origin'); if (o && o !== url.origin) return json({ error: 'Not allowed' }, 403);
    return S.fetch(new Request('https://cam/ws?role=' + role + q + '&who=' + encodeURIComponent(who || '') + '&exp=' + (Math.floor(+exp) || 0), req));
  }
  if (req.method === 'GET' || req.method === 'HEAD') return S.fetch('https://cam/state?role=' + role + q);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  return S.fetch('https://cam/token' + (pilot ? '?pilot=' + pilot : ''), { method: 'POST', body: JSON.stringify({ who: who || '' }) });
}
/* Polaris Cam on the simulator PC (no sign-in: the token in the link, or Polaris Navdata's ticket) */
export async function camPublic(req, url, env) {
  const path = url.pathname;
  /* signed in by Polaris Navdata on that PC: its pilot's own channel, nothing to paste */
  if (/^\/live\/cam\/pilot\/ws\/?$/.test(path)) {
    if (!upgrade(req)) return new Response('WebSocket only', { status: 426 });
    if (!env.CAM) return new Response('Not set up on the server', { status: 503 });
    let u = ''; try { u = normPilot(await navWsTicketUser(env, url.searchParams.get('ticket') || '')); } catch (e) { u = ''; }
    if (!u) return refuse(4001, CAM_TICKET);
    return pilotStub(env, u).fetch(new Request('https://cam/pub?auth=ticket&pilot=' + u, req));
  }
  /* a pilot's channel, with its own link (made in Flight Watch) */
  let m = path.match(/^\/live\/cam\/p\/([^/]{1,40})\/([^/]{1,200})\/ws\/?$/);
  if (m) {
    if (!upgrade(req)) return new Response('WebSocket only', { status: 426 });
    if (!env.CAM) return new Response('Not set up on the server', { status: 503 });
    let p = ''; try { p = normPilot(decodeURIComponent(m[1])); } catch (e) { p = ''; }
    if (!p) return refuse(4004, CAM_GONE);
    return pilotStub(env, p).fetch(new Request('https://cam/pub?t=' + encodeURIComponent(m[2]) + '&pilot=' + p, req));
  }
  /* Broadcast's own channel, with Broadcast's link */
  m = path.match(/^\/live\/cam\/([^/]{1,200})\/ws\/?$/); if (!m) return json({ error: 'Not found' }, 404);
  if (!upgrade(req)) return new Response('WebSocket only', { status: 426 });
  if (!env.CAM) return new Response('Not set up on the server', { status: 503 });
  return stub(env).fetch(new Request('https://cam/pub?t=' + encodeURIComponent(m[1]), req));
}

/* ---- the relay: one Durable Object ---- */
export class CamRelay {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.cfg = null;
    this.pilot = '';                         /* whose channel this is ('pilot:<ID>'), '' on Broadcast's own ('cam') */
    this.online = null;                      /* on 'cam': whose Polaris Cam is on { ID: { v, mode, cams, at, seen } }, once read */
    this.watched = null;                     /* on 'cam': the pilots' channels staff watched lately { ID: at }, once read */
    this.pub = null;                         /* { v, mode, cams, at } while Polaris Cam is here */
    this.offAt = 0;                          /* when it left */
    this.last = new Array(CAMS).fill(null);  /* each JPEG camera's latest picture { buf, seq, w, h, at } */
    this.gop = new Array(CAMS).fill(null);   /* each H.264 camera's frames since its key frame { frames: [fr], bytes, cut } */
    this.keyAt = new Array(CAMS).fill(0);    /* when Polaris Cam was last asked for a key frame of each camera */
    this.flow = new Map();                   /* each page: per camera { ring (sent, not acked), acked, sent, pausedAt, needKey, codec } */
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
  att(w) { try { return (w && w.deserializeAttachment && w.deserializeAttachment()) || null; } catch (e) { return null; } }
  /* a staff page whose sign-in has run out: closed (4401), and true */
  expired(w) {
    if (!wsExpired(this.att(w))) return false;
    try { w.close(4401, WS_EXPIRED); } catch (e) { /* gone */ }
    this.flow.delete(w);
    return true;
  }
  /* whose channel this is: as asked for, or as kept with Polaris Cam's socket (the object may have been away from
     memory since, and woken by that socket closing) */
  pilotOf(ws) {
    if (this.pilot) return this.pilot;
    let L = []; try { L = this.ctx.getWebSockets('pub'); } catch (e) { L = []; }
    for (const w of [ws, ...L]) { const a = this.att(w), p = a && normPilot(a.pilot); if (p) { this.pilot = p; return p; } }
    return '';
  }
  /* a pilot's channel tells Broadcast's own object (the list of who is online) that its Polaris Cam is on or gone:
     as it connects, says hello or goes, and when a page finds the list wrong. Best effort: never in the way */
  presence(on, ws) {
    const p = this.pilotOf(ws), C = this.env && this.env.CAM;
    if (!p || !C || typeof C.idFromName !== 'function' || typeof C.get !== 'function') return null;
    let body = { pilot: p, on: false, pub: null };
    if (on) { const P = this.pubOut(); body = { pilot: p, on: true, pub: { v: P.v, mode: P.mode, cams: P.cams, at: P.at } }; }
    if (this.watchers()) body.watch = 1;   /* staff are watching this channel (for /revoke) */
    let pr = null;
    try {
      pr = Promise.resolve(C.get(C.idFromName('cam')).fetch('https://cam/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).catch(() => null);
    } catch (e) { return null; }
    try { if (this.ctx.waitUntil) this.ctx.waitUntil(pr); } catch (e) { /* not on this runtime */ }
    return pr;
  }
  /* on 'cam': the pilots' channels watched lately, from storage the first time */
  async watchList() {
    if (!this.watched) {
      let o = null; try { o = await this.ctx.storage.get('watched'); } catch (e) { o = null; }
      const now = Date.now(), out = {};
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (normPilot(k) === k && +v > now - WATCH_MS) out[k] = +v;
      this.watched = out;
    }
    return this.watched;
  }
  async noteWatch(p) {
    const W = await this.watchList(), now = Date.now(); if (now - (W[p] || 0) < WATCH_EVERY) return;
    W[p] = now;
    const keep = Object.entries(W).filter(([, t]) => t > now - WATCH_MS).sort((a, b) => b[1] - a[1]).slice(0, ONLINE_MAX);
    this.watched = Object.fromEntries(keep);
    try { await this.ctx.storage.put('watched', this.watched); } catch (e) { /* only for /revoke */ }
  }
  /* on 'cam': the list of whose Polaris Cam is on, from storage the first time */
  async onlineList() {
    if (!this.online) { let o = null; try { o = await this.ctx.storage.get('online'); } catch (e) { o = null; } this.online = onlineIn(o); }
    return this.online;
  }
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
    if (!f) { f = Array.from({ length: CAMS }, () => ({ ring: [], acked: 0, sent: 0, pausedAt: 0, needKey: false, codec: 0 })); this.flow.set(ws, f); }
    return f;
  }
  /* a key frame of that camera from Polaris Cam, at most once a second (however many pages ask) */
  requestKey(cam, now = Date.now()) {
    if (now - this.keyAt[cam] < KEY_MS) return false;
    const w = this.pubSock(); if (!w) return false;
    this.keyAt[cam] = now;
    return this.send(w, { t: 'key', cam });
  }
  /* a picture to one page, unless that page is behind on this camera */
  offer(ws, fr, now) {
    const f = this.fl(ws)[fr.cam];
    if (f.codec !== fr.codec) {                      /* the camera changed codec (or its first picture): start afresh */
      f.ring = []; f.pausedAt = 0; f.codec = fr.codec; f.needKey = fr.codec === 2 && !fr.key;
      if (f.needKey) this.requestKey(fr.cam, now);
    }
    if (fr.codec === 1) {
      if (f.ring.length >= LAG_JPEG) {               /* paused: `ring.length` pictures sent and not acked */
        if (!f.pausedAt) { f.pausedAt = now; return false; }
        if (now - f.pausedAt < PROBE_MS) return false;
        f.pausedAt = now;                            /* one fresh JPEG, to see whether it has caught up */
      }
    } else {
      if (!f.needKey && f.ring.length >= LAG_H264) { f.needKey = true; f.pausedAt = now; }   /* too far behind */
      if (f.needKey) {                               /* nothing that depends on a frame it did not get */
        if (!fr.key) return false;
        if (f.ring.length < LAG_H264) { f.needKey = false; f.pausedAt = 0; }               /* caught up: on again */
        else if (now - f.pausedAt >= PROBE_MS) f.pausedAt = now;                         /* still behind: one key frame, to see */
        else return false;
      }
    }
    if (!this.send(ws, fr.buf)) return false;
    f.ring.push(fr.seq); if (f.ring.length > RING) f.ring.shift(); f.sent++;
    return true;
  }
  /* a page opened midway: the camera's GOP so far, at once and in order. It is at most 75 frames and 768 KB, and is
     counted as one picture out (by its last seq), so the page's first ack lets the live frames after it through */
  replay(ws, g) {
    const f = this.fl(ws)[g.frames[0].cam];
    f.ring = []; f.pausedAt = 0; f.needKey = false; f.codec = 2;
    for (const fr of g.frames) { if (!this.send(ws, fr.buf)) { f.needKey = true; return false; } f.sent++; }
    f.ring.push(g.frames[g.frames.length - 1].seq);
    return true;
  }
  ack(ws, j) {
    const cam = Number(j.cam), seq = Number(j.seq);
    if (!Number.isInteger(cam) || cam < 0 || cam >= CAMS || !Number.isInteger(seq) || seq <= 0 || seq > 0xffffffff) return;
    const f = this.fl(ws)[cam], i = f.ring.lastIndexOf(seq); if (i < 0) return;   /* not one sent to it (or acked already) */
    f.ring.splice(0, i + 1); f.acked = seq;
    if (f.codec === 2) {
      /* an H.264 page waiting for a key frame has caught up: ask for one now, rather than wait for the next GOP */
      if (f.needKey && f.ring.length < RESUME_H264) { f.pausedAt = 0; this.requestKey(cam); }
    } else if (f.ring.length < LAG_JPEG) f.pausedAt = 0;
  }
  /* what is kept of each camera, for a page opened midway */
  keep(fr, now) {
    const c = fr.cam, n = fr.buf.byteLength;
    if (fr.codec === 1) { this.gop[c] = null; this.last[c] = { buf: fr.buf, seq: fr.seq, w: fr.w, h: fr.h, at: now }; return; }
    this.last[c] = null;
    if (fr.key) { this.gop[c] = n > GOP_BYTES ? { frames: [], bytes: 0, cut: true } : { frames: [fr], bytes: n, cut: false }; return; }
    const g = this.gop[c];
    if (!g || g.cut || !g.frames.length) return;     /* no key frame to start from */
    if (g.frames.length + 1 > GOP_FRAMES || g.bytes + n > GOP_BYTES) { g.cut = true; g.frames = []; g.bytes = 0; return; }
    g.frames.push(fr); g.bytes += n;
  }
  /* is the camera sending H.264 (and on), as Polaris Cam says or as its frames show? */
  camH264(c) {
    const P = this.pub, L = (P && P.cams) || [], k = L.find((x) => x.i === c);
    if (k) return k.on !== false && (k.codec || P.mode) === 'h264';
    return !!this.gop[c] || (!!P && !L.length && P.mode === 'h264');
  }
  clearPictures() { this.last = new Array(CAMS).fill(null); this.gop = new Array(CAMS).fill(null); this.keyAt = new Array(CAMS).fill(0); this.flow.clear(); }
  dropPub(ws) {
    if (this.pubSock(ws)) return;                    /* another Polaris Cam took over: still here */
    if (!this.pub && !this.last.some(Boolean) && !this.gop.some(Boolean) && this.offAt) return;
    this.pub = null; this.offAt = Date.now(); this.clearPictures();
    this.to(this.viewers(), { t: 'pub', pub: this.pubOut(ws), watchers: this.watchers() });
    this.presence(false, ws);
  }
  async fetch(req) {
    const url = new URL(req.url), p = url.pathname, cfg = await this.conf();
    /* a pilot's channel is told whose it is by every request the routes make of it (Broadcast's own never is) */
    const qp = normPilot(url.searchParams.get('pilot')); if (qp && !this.pilot) this.pilot = qp;
    /* on 'cam': the list of whose Polaris Cam is on (kept only as a PC connects, says hello or goes) */
    if (p === '/online') {
      const L = await this.onlineList();
      return json({ online: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, { v: v.v, mode: v.mode, cams: v.cams.map((c) => ({ ...c })), at: v.at }])) });
    }
    if (p === '/presence' && req.method === 'POST') {
      if (this.pilot) return json({ error: 'Not found' }, 404);
      const b = await req.json().catch(() => null), u = normPilot(b && b.pilot);
      if (!u) return json({ error: 'Bad body' }, 400);
      const L = await this.onlineList(), had = L[u];
      if (b.on) {
        const P = b.pub && typeof b.pub === 'object' ? b.pub : {}, h = helloIn(P);
        const n = { v: h.v, mode: h.mode, cams: h.cams, at: Math.max(0, +P.at || 0) || Date.now(), seen: Date.now() };
        const same = !!had && JSON.stringify([had.v, had.mode, had.cams, had.at]) === JSON.stringify([n.v, n.mode, n.cams, n.at]);
        L[u] = n;
        /* written only when it says something new (a page finding it right changes nothing kept) */
        if (!same) { this.online = onlineIn(L); await this.ctx.storage.put('online', this.online); }
      } else if (had) { delete L[u]; await this.ctx.storage.put('online', L); }
      if (b.watch) await this.noteWatch(u);
      return json({ ok: true });
    }
    if (p === '/state') {
      const r = json(this.state(url.searchParams.get('role') === 'dir' ? 'dir' : 'view'));
      if (this.pilot) this.presence(!!this.pubSock());   /* the list put right, if it was wrong */
      return r;
    }
    if (p === '/token' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      cfg.token = newTok(); cfg.by = line(b && b.who, 120); cfg.at = Date.now(); await this.ctx.storage.put('cfg', cfg);
      /* the PCs that came with the old link stop; one Polaris Navdata signed in (a pilot's channel) is not a link's */
      const old = this.socks('pub').filter((w) => { const a = this.att(w); return !(a && a.auth === 'ticket'); });
      for (const w of old) { try { w.close(4004, CAM_GONE); } catch (e) { /* gone */ } }
      if (old.length) this.dropPub(old[0]);
      this.to(this.socks('dir').filter((w) => !this.expired(w)), { t: 'token', token: cfg.token });
      return json({ ok: true, token: cfg.token, pub: this.pubOut(), watchers: this.watchers() });
    }
    if (p === '/revoke' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), L = (Array.isArray(b && b.emails) ? b.emails : []).map((e) => String(e).toLowerCase());
      const keep = b && Array.isArray(b.keep) ? b.keep.map((e) => String(e).toLowerCase()) : null;
      let n = 0;
      for (const w of this.viewers()) {
        const who = String((this.att(w) || {}).who || '').toLowerCase();
        if (L.includes(who) || (keep && !keep.includes(who))) { try { w.close(4403, WS_REVOKED); } catch (e) { /* gone */ } this.flow.delete(w); n++; }
      }
      if (n) this.tellAll();
      /* Broadcast's own object passes it on to the pilots' channels with a Polaris Cam on, or watched lately */
      const C = this.env && this.env.CAM;
      if (!this.pilot && C && typeof C.idFromName === 'function') {
        const on = [...new Set([...Object.keys(await this.onlineList()), ...Object.keys(await this.watchList())])], body = JSON.stringify({ emails: L, keep });
        const r = await Promise.allSettled(on.map((pl) => pilotStub(this.env, pl).fetch('https://cam/revoke?pilot=' + pl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).then((x) => x.json())));
        for (const x of r) if (x.status === 'fulfilled' && x.value) n += +x.value.closed || 0;
      }
      return json({ ok: true, closed: n });
    }
    if (!upgrade(req)) return json({ error: 'Not found' }, 404);
    const [client, server] = Object.values(new WebSocketPair());
    const ok = () => new Response(null, { status: 101, webSocket: client });
    if (p === '/pub') {
      /* Polaris Navdata's ticket was checked on the way here (camPublic), and only for a pilot's channel; else the link */
      const pilot = qp && qp === this.pilot ? qp : '', byTicket = !!pilot && url.searchParams.get('auth') === 'ticket';
      if (!byTicket && url.searchParams.get('t') !== cfg.token) { server.accept(); server.close(4004, CAM_GONE); return ok(); }
      /* one Polaris Cam a channel: a new one replaces the old */
      for (const w of this.socks('pub')) { try { w.close(4000, 'Another Polaris Cam took over'); } catch (e) { /* gone */ } }
      this.ctx.acceptWebSocket(server, ['pub']);
      const at = Date.now(); this.pub = { v: '', mode: 'jpeg', cams: [], at }; this.clearPictures();
      try { server.serializeAttachment({ at, pub: this.pub, pilot, auth: byTicket ? 'ticket' : 'token' }); } catch (e) { /* kept in memory only */ }
      if (pilot) this.send(server, { t: 'id', pilot });
      this.tellAll();
      if (pilot) this.presence(true, server);
      return ok();
    }
    if (p === '/ws') {
      const role = url.searchParams.get('role') === 'dir' ? 'dir' : 'view', who = line(url.searchParams.get('who'), 120), exp = Math.max(0, Math.floor(+url.searchParams.get('exp') || 0));
      if (wsExpired({ exp })) { server.accept(); server.close(4401, WS_EXPIRED); return ok(); }
      this.ctx.acceptWebSocket(server, [role]);
      try { server.serializeAttachment({ who, exp }); } catch (e) { /* kept in memory only */ }
      this.send(server, { t: 'hello', role, ...this.state(role) });
      /* what there is of each camera, so a page opened midway shows something at once: a JPEG camera's latest picture,
         an H.264 camera's GOP so far (or, when there is none whole, a key frame asked of Polaris Cam) */
      const now = Date.now();
      for (let c = 0; c < CAMS; c++) {
        const L = this.last[c], g = this.gop[c];
        if (L) this.offer(server, { buf: L.buf, cam: c, codec: 1, key: true, seq: L.seq }, now);
        else if (g && !g.cut && g.frames.length) this.replay(server, g);
        else if (this.camH264(c)) this.requestKey(c, now);
      }
      this.send(this.pubSock(), { t: 'watch', n: this.watchers() });
      this.to(this.viewers(server), { t: 'pub', pub: this.pubOut(), watchers: this.watchers() });
      /* a pilot's channel: the list put right, if it was wrong (a PC that went without a word) */
      if (this.pilot) this.presence(!!this.pubSock());
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
      this.keep(fr, now);
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
      const a = this.att(ws) || {}, was = this.pub || a.pub || a, h = helloIn(j);
      this.pub = { ...h, at: +was.at || Date.now() };
      /* a camera whose codec changed: what was kept of it is of no use now */
      for (const k of h.cams) { if (k.codec === 'h264') this.last[k.i] = null; else this.gop[k.i] = null; }
      const pilot = this.pilotOf(ws);
      try { ws.serializeAttachment({ at: this.pub.at, pub: this.pub, pilot, auth: a.auth === 'ticket' ? 'ticket' : 'token' }); } catch (e) { /* kept in memory only */ }
      this.to(this.viewers(), { t: 'pub', pub: this.pubOut(), watchers: this.watchers() });
      if (pilot) this.presence(true, ws);
      return;
    }
    if (role !== 'dir' && role !== 'view') return;
    if (this.expired(ws)) return;
    if (j.t === 'ack') this.ack(ws, j);
    else if (j.t === 'key') { const c = j.cam; if (Number.isInteger(c) && c >= 0 && c < CAMS) this.requestKey(c); }
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
