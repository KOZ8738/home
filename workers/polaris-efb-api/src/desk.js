/* ---------- The broadcast desk (Operations admin › Broadcast, Nov 2026) ----------
   One desk for Polaris's live broadcasts (the first flight, January 2027): in the admin the director sees what OBS
   shows on the streaming pilot's simulator PC and switches its scenes; OBS's own Browser source shows this server's
   overlay page on the picture (the flight's name and route, its numbers, a mini map, LIVE). Nothing is streamed
   through here: OBS sends the stream to YouTube itself. Polaris Navdata on that PC is the go-between (its desk.js): it
   joins the desk only while the desk is on and set to that pilot, and does in OBS only what is listed below.
     GET  /admin/api/desk                  -> { cfg, pc, pvw, log, plan, oo }   (staff who see Broadcast)
     POST /admin/api/desk  { op:'cfg', cfg } | { op:'token' }                  (staff who may direct the broadcast)
     GET  /admin/api/desk/ws               (WebSocket) the desk, live: a director's, or a watcher's (sees, changes nothing)
     GET  /api/nav/desk/ws?ticket=         (WebSocket) Polaris Navdata on the streaming PC (a ticket from /api/nav/ticket)
     GET  /api/nav/flight                  says desk: true to that PC while the desk is on and set to its pilot (nav.js)
     GET  /live/o/<token>                  the overlay page for OBS's Browser source (1920 × 1080, no sign-in: the token)
     GET  /live/o/<token>/ws               (WebSocket) what it shows, live
   The director's commands to the PC: put one of OBS's scenes on air, start or stop the stream or the recording (only if
   allowed on the EFB on that PC), and the auto director's rules (Navdata switches by the flight's phase itself).
   Kept in the Durable Object's storage: cfg { on, pilot, title, sub, ov:{lt,data,map,live}, auto:{on,every,rules},
   slate, token, by, at } and the track flown for the overlay's map (a point every 20 s, for the plan loaded).
   Not kept: OBS's pictures (the last of each scene, in memory only), its numbers, the last 100 events (in memory). */
import { navWsTicketUser } from './auth.js';
import { crew } from './crew.js';
import { ADMIN_HTML } from './admin.js';

export const PHASES = ['parked', 'taxi', 'takeoff', 'climb', 'cruise', 'descent', 'approach', 'landing'];
const PH_NAME = { parked: 'Parked', taxi: 'Taxi', takeoff: 'Takeoff', climb: 'Climb', cruise: 'Cruise', descent: 'Descent', approach: 'Approach', landing: 'Landing' };
const OPS = ['scene', 'start', 'stop', 'recstart', 'recstop', 'refresh'];
const EVERY = [60, 120, 180, 300, 600];
const line = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
/* an OBS scene's name, as OBS has it (only control characters taken out: the pages show it as text) */
const sname = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);
const num = (v, d) => { const x = Number(v); return Number.isFinite(x) ? (d ? Math.round(x * d) / d : x) : null; };
const tokOk = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{24,40}$/.test(t);
const newTok = () => { const b = new Uint8Array(18); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const pilotOk = (p) => /^[A-Z]{2,4}[0-9]{1,6}$/.test(p);
const nice = (s) => line(s, 60).toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
/* the scene for "Back soon", when the director has not picked one: the first that sounds like it */
const SLATE_RE = /back|brb|soon|slate|hold|break|intermission|稍後|休息|待機/i;

/* the settings, as kept: anything missing or wrong takes its default */
export function norm(c) {
  c = c && typeof c === 'object' ? c : {};
  const ov = c.ov && typeof c.ov === 'object' ? c.ov : {}, a = c.auto && typeof c.auto === 'object' ? c.auto : {}, rules = {};
  for (const p of PHASES) { const v = a.rules && a.rules[p]; if (Array.isArray(v)) { const L = [...new Set(v.map(sname).filter(Boolean))].slice(0, 8); if (L.length) rules[p] = L; } }
  const pilot = String(c.pilot || '').toUpperCase();
  return { on: c.on === true, pilot: pilotOk(pilot) ? pilot : '', title: line(c.title, 80), sub: line(c.sub, 120),
    ov: { lt: ov.lt !== false, data: ov.data !== false, map: ov.map !== false, live: ov.live !== false },
    auto: { on: a.on === true, every: EVERY.includes(+a.every) ? +a.every : 180, rules },
    slate: sname(c.slate), token: tokOk(c.token) ? c.token : '', by: line(c.by, 120), at: +c.at || 0 };
}
/* the pilot's plan (the EFB's plan sync keeps it: crew.js), for the overlay and the flight card */
export function planOf(j, o) {
  const g = j.general || {}, A = j.aircraft || {}, T = j.times || {}, at = j.atc || {};
  const pt = (x) => { const la = parseFloat(x && x.pos_lat), lo = parseFloat(x && x.pos_long); return Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? [Math.round(la * 1e4) / 1e4, Math.round(lo * 1e4) / 1e4] : null; };
  const ap = (x) => { const p = pt(x); return x ? { icao: line(x.icao_code, 4).toUpperCase(), name: nice(x.name), la: p ? p[0] : null, lo: p ? p[1] : null } : null; };
  const R = [pt(j.origin), ...[].concat((j.navlog && j.navlog.fix) || []).map(pt), pt(j.destination)].filter(Boolean);
  const step = Math.max(1, Math.ceil(R.length / 400)), route = R.filter((p, i) => i % step === 0 || i === R.length - 1);
  return { key: line((o && (o.key || o.blob)) || '', 200), fid: line(o && o.id, 40), flight: line((o && o.flight) || String(g.icao_airline || '') + String(g.flight_number || ''), 12).toUpperCase(),
    cs: line(at.callsign, 12).toUpperCase(), ac: line(A.icaotype || A.icao_code, 8).toUpperCase(), acName: line(A.name, 40), dep: ap(j.origin), arr: ap(j.destination), route,
    out: (+T.sched_out || 0) * 1000, inn: (+(T.est_in || T.sched_in) || 0) * 1000, ete: +T.est_time_enroute || 0 };
}
async function gunzip(buf) { return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); }
const obsIn = (o) => { o = o && typeof o === 'object' ? o : {}; return { st: ['off', 'connecting', 'on', 'err'].includes(o.st) ? o.st : 'off', v: line(o.v, 20), err: line(o.err, 300) }; };
const flIn = (f) => { if (!f || typeof f !== 'object') return null; const o = {}; for (const k of ['alt', 'gs', 'ias', 'vs', 'h', 'k', 'ra']) o[k] = num(f[k], 1); o.mv = num(f.mv, 10); o.la = num(f.la, 1e5); o.lo = num(f.lo, 1e5); o.m = num(f.m, 1000); o.g = f.g ? 1 : 0; return o; };
const statsIn = (s) => {
  if (!s || typeof s !== 'object') return null;
  const n = (o, ks) => { if (!o || typeof o !== 'object') return null; const r = {}; for (const k of ks) r[k] = typeof o[k] === 'boolean' ? o[k] : num(o[k], 100) || 0; return r; };
  return { stream: n(s.stream, ['on', 'rec', 'dur', 'kbps', 'skip', 'frames', 'cong']), rec: n(s.rec, ['on', 'paused', 'dur']), obs: n(s.obs, ['cpu', 'fps', 'rskip', 'rtotal', 'oskip', 'ototal']) };
};
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const upgrade = (req) => (req.headers.get('Upgrade') || '').toLowerCase() === 'websocket';
const stub = (env) => env.DESK.get(env.DESK.idFromName('desk'));

/* ---- routes ---- */
/* GET /api/nav/flight: is this pilot's flight the one on the desk */
export async function deskOn(env, u) {
  if (!env || !env.DESK) return false;
  try { const r = await stub(env).fetch('https://desk/on?u=' + encodeURIComponent(u)); return (await r.json()).on === true; } catch (e) { return false; }
}
/* Polaris Navdata joins the desk (from nav.js, with its own kind of ticket) */
export async function deskNav(req, url, env) {
  if (!upgrade(req)) return new Response('WebSocket only', { status: 426 });
  if (!env.DESK) return new Response('Not set up on the server', { status: 503 });
  const u = await navWsTicketUser(env, url.searchParams.get('ticket'));
  if (!u) return new Response('Pair Polaris Navdata again on the EFB', { status: 401 });
  return stub(env).fetch(new Request('https://desk/pc?u=' + encodeURIComponent(u), req));
}
/* the admin (from mail.js, after Cloudflare Access and the role: direct = may direct the live broadcast) */
export async function deskAdmin(req, url, env, who, direct) {
  if (!env.DESK) return json({ error: 'The broadcast desk is not set up on the server yet' }, 503);
  const path = url.pathname.replace(/\/+$/, ''), role = direct ? 'dir' : 'view';
  if (path === '/admin/api/desk/ws') {
    if (!upgrade(req)) return json({ error: 'WebSocket only' }, 426);
    /* only the admin's own page (not another site the staff member has open) */
    const o = req.headers.get('Origin'); if (o && o !== url.origin) return json({ error: 'Not allowed' }, 403);
    return stub(env).fetch(new Request('https://desk/ws?role=' + role + '&who=' + encodeURIComponent(who || ''), req));
  }
  if (req.method === 'GET') return stub(env).fetch('https://desk/state?role=' + role);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!direct) return json({ error: 'Your role cannot direct the live broadcast' }, 403);
  const t = await req.text(); if (t.length > 20000) return json({ error: 'Too large' }, 413);
  let b; try { b = JSON.parse(t); } catch (e) { return json({ error: 'Bad body' }, 400); }
  return stub(env).fetch('https://desk/' + (b && b.op === 'token' ? 'token' : 'cfg'), { method: 'POST', body: JSON.stringify({ who: who || '', cfg: (b && b.cfg) || {} }) });
}
/* the overlay page and its WebSocket (no sign-in: the token) */
export async function deskPublic(req, url, env) {
  const m = url.pathname.match(/^\/live\/o\/([A-Za-z0-9_-]{24,40})(\/ws)?\/?$/); if (!m) return null;
  if (m[2]) {
    if (!upgrade(req)) return new Response('WebSocket only', { status: 426 });
    if (!env.DESK) return new Response('Not set up on the server', { status: 503 });
    return stub(env).fetch(new Request('https://desk/ov?t=' + m[1], req));
  }
  return new Response(OVERLAY_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}

/* ---- the desk: one Durable Object ---- */
export class LiveDesk {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.cfg = null; this.pc = null; this.pvw = ''; this.imgs = {}; this.logs = []; this.pend = new Map();
    this.expect = null; this.acted = {}; this.plan = undefined; this.planAt = 0; this.planBusy = false; this.oo = null; this.land = null; this.ooAt = 0; this.ooBusy = false;
    this.trk = null; this.trkKey = ''; this.trkAt = 0;
    /* the pages' keep-alive, answered without waking the desk */
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch (e) { /* not on this runtime */ }
  }
  async conf() {
    if (!this.cfg) { this.cfg = norm(await this.ctx.storage.get('cfg')); if (!this.cfg.token) { this.cfg.token = newTok(); await this.ctx.storage.put('cfg', this.cfg); } }
    return this.cfg;
  }
  socks(tag, except) { return this.ctx.getWebSockets(tag).filter((w) => w !== except && w.readyState !== 2 && w.readyState !== 3); }
  send(w, m) { if (!w) return; try { w.send(typeof m === 'string' ? m : JSON.stringify(m)); } catch (e) { /* gone */ } }
  to(tags, m, except) { const s = typeof m === 'string' ? m : JSON.stringify(m); for (const t of tags) for (const w of this.socks(t, except)) this.send(w, s); }
  desk(m) { this.to(['dir', 'view'], m); }
  pcSock() { return this.socks('pc')[0] || null; }
  watchers(except) { return this.socks('dir', except).length + this.socks('view', except).length; }
  tellPc(except) { this.send(this.pcSock(), { watch: this.watchers(except) }); }
  note(what, by) {
    const e = { t: Date.now(), what: line(what, 240), by: line(by, 120) }, L = this.logs[this.logs.length - 1];
    /* the same again from the same person within a minute (rules changed one by one): once */
    if (L && L.what === e.what && L.by === e.by && e.t - L.t < 60000) { L.t = e.t; return; }
    this.logs.push(e); if (this.logs.length > 100) this.logs.shift(); this.desk({ t: 'log', e });
  }
  newPc(u) { return { u, at: Date.now(), v: '', obs: { st: 'off', v: '', err: '' }, remote: false, scenes: [], pgm: '', stats: null, statsAt: 0, fl: null, flAt: 0, ph: '' }; }
  pcOut() { const p = this.pc; return p ? { on: true, v: p.v, obs: p.obs, remote: p.remote, scenes: p.scenes, pgm: p.pgm, stats: p.stats, statsAt: p.statsAt, fl: p.fl, flAt: p.flAt, ph: p.ph, at: p.at } : { on: false }; }
  cfgOut(role) { const c = { ...this.cfg, ov: { ...this.cfg.ov }, auto: { ...this.cfg.auto } }; if (role !== 'dir') delete c.token; return c; }
  ovOut() { const c = this.cfg; return { on: c.on, ov: c.ov, title: c.title, sub: c.sub }; }
  snapshot(role) { return { cfg: this.cfgOut(role), pc: this.pcOut(), pvw: this.pvw, log: this.logs.slice(-60), plan: this.plan || null, oo: this.oo, land: this.land }; }
  pushCfg() {
    this.to(['dir'], { t: 'cfg', cfg: this.cfgOut('dir') }); this.to(['view'], { t: 'cfg', cfg: this.cfgOut('view') });
    this.to(['ov'], { t: 'ov', cfg: this.ovOut() }); this.send(this.pcSock(), { cfg: { auto: this.cfg.auto } });
  }
  async saveCfg() { await this.ctx.storage.put('cfg', this.cfg); }
  /* the plan, the times and the touchdown: asked for again now and then while someone looks */
  refreshFlight(force) {
    const now = Date.now(), c = this.cfg; if (!c || !c.pilot || !this.env.CREW) return;
    if (!this.planBusy && (force || now - this.planAt > 300000)) { this.planBusy = true; this.planAt = now; this.loadPlan().catch(() => {}).finally(() => { this.planBusy = false; }); }
    if (!this.ooBusy && (force || now - this.ooAt > 60000)) { this.ooBusy = true; this.ooAt = now; this.loadOo().catch(() => {}).finally(() => { this.ooBusy = false; }); }
  }
  async loadPlan() {
    const u = this.cfg.pilot; if (!u) return;
    const s = await crew(this.env, { op: 'syncGet', u }), o = s && s.sync && s.sync.ofp;
    let plan = null;
    if (o && !o.cleared && o.blob) {
      if (this.plan && this.plan.key === line(o.key || o.blob, 200)) plan = this.plan;
      else { const buf = this.env.STORE ? await this.env.STORE.get(o.blob, 'arrayBuffer') : null; plan = buf ? planOf(JSON.parse(await gunzip(buf)), o) : this.plan || null; }
    }
    if (u !== this.cfg.pilot) return;
    const ch = ((plan && plan.key) || '') !== ((this.plan && this.plan.key) || '') || this.plan === undefined;
    this.plan = plan;
    if (ch) { await this.loadTrk(); this.to(['dir', 'view'], { t: 'plan', plan }); this.to(['ov'], { t: 'plan', plan, trk: this.trk || [] }); }
  }
  async loadOo() {
    const u = this.cfg.pilot; if (!u) return;
    const g = await crew(this.env, { op: 'gsxGet', u }), x = g && g.gsx, fid = this.plan && this.plan.fid;
    const mine = x && (!fid || x.fid === fid), oo = {}, src = (mine && x.oo) || {};
    for (const k of ['OUT', 'OFF', 'ON', 'IN']) if (/^\d\d:\d\d$/.test(src[k] || '')) oo[k] = src[k];
    const L = mine && x.land && typeof x.land === 'object' ? { fpm: num(x.land.fpm, 1), g: num(x.land.g, 100), t: num(x.land.t) } : null;
    if (u !== this.cfg.pilot) return;
    if (JSON.stringify(oo) !== JSON.stringify(this.oo) || JSON.stringify(L) !== JSON.stringify(this.land)) { this.oo = oo; this.land = L; this.desk({ t: 'oo', oo, land: L }); }
  }
  async loadTrk() {
    const key = (this.cfg.pilot || '') + '|' + ((this.plan && this.plan.key) || '');
    if (this.trk && this.trkKey === key) return;
    const t = await this.ctx.storage.get('trk');
    this.trkKey = key; this.trk = t && t.key === key && Array.isArray(t.p) ? t.p : [];
  }
  addTrk(f) {
    if (!f || f.la == null || f.lo == null || this.trk === null || (f.g && !(f.gs > 30))) return;
    const now = Date.now(); if (now - this.trkAt < 20000) return; this.trkAt = now;
    const p = [Math.round(f.la * 1e4) / 1e4, Math.round(f.lo * 1e4) / 1e4, Math.round(f.alt || 0)];
    this.trk.push(p); if (this.trk.length > 2000) this.trk.splice(0, this.trk.length - 2000);
    this.ctx.storage.put('trk', { key: this.trkKey, p: this.trk }).catch(() => {});
    this.to(['ov'], { t: 'trk', p });
  }
  async setCfg(b) {
    const who = line(b && b.who, 120), x = (b && b.cfg) || {}, c = this.cfg;
    if (x.pilot != null && String(x.pilot) !== '' && !pilotOk(String(x.pilot).toUpperCase().replace(/\s+/g, ''))) return json({ error: 'A pilot ID looks like PAW0006' }, 400);
    const next = { ...c, ov: { ...c.ov }, auto: { ...c.auto, rules: { ...c.auto.rules } } };
    for (const k of ['on', 'title', 'sub', 'slate']) if (x[k] !== undefined) next[k] = x[k];
    if (x.pilot !== undefined) next.pilot = String(x.pilot || '').toUpperCase().replace(/\s+/g, '');
    if (x.ov && typeof x.ov === 'object') for (const k of ['lt', 'data', 'map', 'live']) if (typeof x.ov[k] === 'boolean') next.ov[k] = x.ov[k];
    if (x.auto && typeof x.auto === 'object') { if (typeof x.auto.on === 'boolean') next.auto.on = x.auto.on; if (x.auto.every !== undefined) next.auto.every = x.auto.every; if (x.auto.rules && typeof x.auto.rules === 'object') next.auto.rules = x.auto.rules; }
    const n = norm({ ...next, token: c.token }); n.by = who; n.at = Date.now();
    if (n.on && !n.pilot) return json({ error: 'Enter the pilot ID of the pilot whose simulator PC streams' }, 400);
    /* what changed, for the log */
    const said = [];
    if (n.on !== c.on || (n.on && n.pilot !== c.pilot)) said.push(n.on ? 'Put ' + n.pilot + '’s flight on the desk' : 'Took the flight off the desk');
    else if (n.pilot !== c.pilot) said.push('Set the streaming pilot to ' + (n.pilot || 'nobody'));
    if (n.auto.on !== c.auto.on) said.push(n.auto.on ? 'Auto director on' : 'Auto director off');
    if (n.auto.every !== c.auto.every || JSON.stringify(n.auto.rules) !== JSON.stringify(c.auto.rules)) said.push('Changed the auto director’s scenes');
    const OVN = { lt: 'name and route', data: 'flight data', map: 'map', live: 'LIVE and logo' };
    for (const k of Object.keys(OVN)) if (n.ov[k] !== c.ov[k]) said.push('Overlay: ' + OVN[k] + (n.ov[k] ? ' on' : ' off'));
    if (n.title !== c.title || n.sub !== c.sub) said.push('Changed the overlay’s title');
    if (n.slate !== c.slate) said.push('“Back soon” is now ' + (n.slate || 'the scene that sounds like it'));
    this.cfg = n; await this.saveCfg();
    /* no longer this pilot's PC (or the desk off): sent away; another pilot: their plan */
    if (!n.on || n.pilot !== c.pilot) for (const w of this.socks('pc')) { try { w.close(4001, 'The broadcast desk is not set to this flight'); } catch (e) { /* gone */ } this.dropPc(w); }
    if (n.pilot !== c.pilot) { this.plan = undefined; this.oo = null; this.land = null; this.trk = null; this.planAt = 0; this.ooAt = 0; this.refreshFlight(true); }
    for (const s of said) this.note(s, who);
    this.pushCfg();
    return json({ ok: true, ...this.snapshot('dir') });
  }
  dropPc(ws) {
    if (!this.pc || this.socks('pc', ws).length) return;
    this.pc = null; this.imgs = {};
    for (const [id, p] of this.pend) this.send(p.ws, { t: 'ack', id, ok: false, err: 'The simulator PC left the desk' });
    this.pend.clear();
    this.desk({ t: 'pc', pc: { on: false } }); this.note('The simulator PC left the desk');
  }
  async fetch(req) {
    const url = new URL(req.url), p = url.pathname, cfg = await this.conf();
    if (p === '/on') return json({ on: cfg.on && !!cfg.pilot && cfg.pilot === String(url.searchParams.get('u') || '').toUpperCase() });
    if (p === '/state') { this.refreshFlight(); return json(this.snapshot(url.searchParams.get('role'))); }
    if (p === '/cfg' && req.method === 'POST') return this.setCfg(await req.json().catch(() => ({})));
    if (p === '/token' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      this.cfg.token = newTok(); this.cfg.by = line(b.who, 120); this.cfg.at = Date.now(); await this.saveCfg();
      for (const w of this.socks('ov')) { try { w.close(4004, 'This overlay link is no longer in use'); } catch (e) { /* gone */ } }
      this.note('Made a new overlay link: the old one no longer works', b.who); this.pushCfg();
      return json({ ok: true, ...this.snapshot('dir') });
    }
    if (!upgrade(req)) return json({ error: 'Not found' }, 404);
    const [client, server] = Object.values(new WebSocketPair());
    const ok = () => new Response(null, { status: 101, webSocket: client });
    if (p === '/pc') {
      const u = String(url.searchParams.get('u') || '').toUpperCase();
      if (!(cfg.on && cfg.pilot && cfg.pilot === u)) { server.accept(); server.close(4001, 'The broadcast desk is not set to this flight'); return ok(); }
      /* one PC at a time: a new one replaces the old */
      for (const w of this.socks('pc')) { try { w.close(4000, 'Another simulator PC took over'); } catch (e) { /* gone */ } }
      this.ctx.acceptWebSocket(server, ['pc']);
      this.pc = this.newPc(u); this.imgs = {};
      this.send(server, { cfg: { auto: cfg.auto } }); this.send(server, { watch: this.watchers() }); if (this.pvw) this.send(server, { pvw: this.pvw });
      this.desk({ t: 'pc', pc: this.pcOut() }); this.note('The simulator PC joined the desk');
      this.refreshFlight(true);
      return ok();
    }
    if (p === '/ws') {
      const role = url.searchParams.get('role') === 'dir' ? 'dir' : 'view', who = line(url.searchParams.get('who'), 120);
      this.ctx.acceptWebSocket(server, [role]); try { server.serializeAttachment({ who }); } catch (e) { /* kept in memory only */ }
      this.send(server, { t: 'hello', role, me: who, ...this.snapshot(role) });
      for (const [name, s] of Object.entries(this.imgs)) this.send(server, { t: 'shot', name, img: s.img, at: s.at });
      this.tellPc(); this.refreshFlight();
      return ok();
    }
    if (p === '/ov') {
      if (url.searchParams.get('t') !== cfg.token) { server.accept(); server.close(4004, 'This overlay link is no longer in use'); return ok(); }
      this.ctx.acceptWebSocket(server, ['ov']);
      if (this.plan !== undefined) await this.loadTrk();
      this.send(server, { t: 'ov', cfg: this.ovOut(), plan: this.plan || null, trk: this.trk || [], fl: this.pc ? this.pc.fl : null, ph: this.pc ? this.pc.ph : '' });
      this.refreshFlight();
      return ok();
    }
    server.accept(); server.close(4004, 'Not found'); return ok();
  }
  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 1_000_000) return;
    let j; try { j = JSON.parse(msg); } catch (e) { return; }
    if (!j || typeof j !== 'object') return;
    await this.conf();
    const role = this.ctx.getTags(ws)[0];
    if (role === 'pc') return this.fromPc(ws, j);
    if (role === 'dir' || role === 'view') return this.fromDesk(ws, role, j);
  }
  fromPc(ws, j) {
    /* the desk was away from memory a while (nothing kept): the PC tells it all again */
    if (!this.pc) { this.pc = this.newPc(this.cfg.pilot); this.send(ws, { hello: 1 }); this.send(ws, { cfg: { auto: this.cfg.auto } }); this.tellPc(); this.desk({ t: 'pc', pc: this.pcOut() }); }
    const P = this.pc, now = Date.now();
    switch (j.t) {
      case 'pc': P.v = line(j.v, 20); P.obs = obsIn(j.obs); P.remote = j.remote === true; this.desk({ t: 'pc', pc: this.pcOut() }); return;
      case 'obs': {
        const was = P.obs.st; P.obs = obsIn(j.obs);
        if (P.obs.st !== 'on') { P.scenes = []; P.pgm = ''; this.imgs = {}; }
        this.desk({ t: 'obs', obs: P.obs });
        if (was !== P.obs.st && (was === 'on' || P.obs.st === 'on')) this.note(P.obs.st === 'on' ? 'OBS connected on the simulator PC' : 'OBS on the simulator PC: ' + (P.obs.err || 'not connected'));
        return;
      }
      case 'scenes': {
        P.scenes = (Array.isArray(j.list) ? j.list : []).map(sname).filter(Boolean).slice(0, 60); P.pgm = sname(j.pgm);
        for (const k of Object.keys(this.imgs)) if (!P.scenes.includes(k)) delete this.imgs[k];
        if (this.pvw && !P.scenes.includes(this.pvw)) { this.pvw = ''; this.desk({ t: 'pvw', name: '' }); }
        this.desk({ t: 'scenes', list: P.scenes, pgm: P.pgm }); return;
      }
      case 'pgm': {
        const name = sname(j.name), was = P.pgm, x = this.expect; P.pgm = name;
        this.desk({ t: 'pgm', name });
        if (name !== was && !(x && x.name === name && now - x.at < 10000)) this.note(name + ' on air (changed in OBS)');
        if (x && x.name === name) this.expect = null;
        return;
      }
      case 'auto': { const name = sname(j.name); this.expect = { name, at: now }; this.note('Auto director: ' + name + ' (' + (PH_NAME[j.ph] || 'phase') + ')'); this.desk({ t: 'auto', name, ph: line(j.ph, 12) }); return; }
      case 'stats': {
        const s = statsIn(j); if (!s) return; const was = P.stats && P.stats.stream && P.stats.stream.on, wasR = P.stats && P.stats.rec && P.stats.rec.on;
        P.stats = s; P.statsAt = now; this.desk({ t: 'stats', stats: s, at: now });
        /* started or stopped in OBS itself (the desk's own are in the log already) */
        const on = s.stream && s.stream.on, rec = s.rec && s.rec.on, recent = (k) => this.acted[k] && now - this.acted[k] < 20000;
        if (P.stats && was !== undefined && was !== null && on !== was && !recent(on ? 'start' : 'stop')) this.note(on ? 'The stream started (in OBS)' : 'The stream ended (in OBS)');
        if (wasR !== undefined && wasR !== null && rec !== wasR && !recent(rec ? 'recstart' : 'recstop')) this.note(rec ? 'The recording started (in OBS)' : 'The recording stopped (in OBS)');
        return;
      }
      case 'fl': {
        P.fl = flIn(j.f); P.flAt = now; if (PHASES.includes(j.ph)) P.ph = j.ph;
        this.to(['dir', 'view', 'ov'], { t: 'fl', f: P.fl, ph: P.ph, at: now });
        this.addTrk(P.fl);
        if (this.watchers() || this.socks('ov').length) this.refreshFlight();
        return;
      }
      case 'ph': { if (!PHASES.includes(j.ph) || j.ph === P.ph) return; P.ph = j.ph; this.note('Phase: ' + PH_NAME[j.ph]); this.to(['dir', 'view', 'ov'], { t: 'ph', ph: P.ph }); return; }
      case 'shot': {
        const name = sname(j.name), img = String(j.img || '');
        if (!P.scenes.includes(name) || !/^data:image\/(jpe?g|png);base64,[A-Za-z0-9+/=]+$/.test(img) || img.length > 900000) return;
        this.imgs[name] = { img, at: now };
        this.desk({ t: 'shot', name, img, at: now }); return;
      }
      case 'ack': {
        const id = line(j.id, 40), q = this.pend.get(id); if (!q) return; this.pend.delete(id);
        const okk = j.ok === true, err = line(j.err, 300);
        this.send(q.ws, { t: 'ack', id, ok: okk, err });
        if (okk) {
          if (q.op === 'scene') {
            this.note(q.name + ' on air', q.who);
            /* TAKE: what was on air goes to the next one */
            if (q.swap && q.was && q.was !== q.name && P.scenes.includes(q.was)) { this.pvw = q.was; this.desk({ t: 'pvw', name: q.was, by: q.who }); this.send(this.pcSock(), { pvw: q.was }); }
          } else if (q.op !== 'refresh') this.note({ start: 'Started the stream', stop: 'Ended the stream', recstart: 'Started the recording', recstop: 'Stopped the recording' }[q.op], q.who);
        } else if (q.op !== 'refresh') { delete this.acted[q.op]; this.note('Could not ' + { scene: 'put ' + q.name + ' on air', start: 'start the stream', stop: 'end the stream', recstart: 'start the recording', recstop: 'stop the recording' }[q.op] + ': ' + err, q.who); }
        return;
      }
      default:
    }
  }
  async fromDesk(ws, role, j) {
    let who = ''; try { who = ((ws.deserializeAttachment && ws.deserializeAttachment()) || {}).who || ''; } catch (e) { /* none */ }
    if (j.cmd && typeof j.cmd === 'object') {
      const c = j.cmd, id = line(c.id, 40), op = String(c.op || ''), name = sname(c.name);
      const no = (err) => this.send(ws, { t: 'ack', id, ok: false, err });
      if (role !== 'dir') return no('Your role cannot direct the live broadcast');
      if (!OPS.includes(op)) return no('Not something the desk can do');
      const pc = this.pcSock(); if (!pc || !this.pc) return no('The simulator PC is not on the desk');
      if (op === 'scene') {
        if (!this.pc.scenes.includes(name)) return no('OBS has no scene called “' + name + '”');
        this.expect = { name, at: Date.now() };
        /* the director's own TAKE turns the auto director off */
        if (this.cfg.auto.on) { this.cfg.auto.on = false; await this.saveCfg(); this.note('Auto director off (a scene was taken by hand)', who); this.pushCfg(); }
      }
      for (const [k, v] of this.pend) if (Date.now() - v.at > 30000) this.pend.delete(k);
      this.pend.set(id, { ws, op, name, who, at: Date.now(), swap: c.swap === true, was: this.pc.pgm });
      /* OBS may say the stream started before the PC answers: it is the director's */
      if (op !== 'scene' && op !== 'refresh') this.acted[op] = Date.now();
      this.send(pc, { cmd: { id, op, name } });
      return;
    }
    if (typeof j.pvw === 'string') {
      if (role !== 'dir') return;
      const name = sname(j.pvw); if (name && (!this.pc || !this.pc.scenes.includes(name))) return;
      this.pvw = name; this.desk({ t: 'pvw', name, by: who }); this.send(this.pcSock(), { pvw: name });
    }
  }
  async webSocketClose(ws, code) { try { ws.close(code === 1005 || code === 1006 ? 1000 : code, ''); } catch (e) { /* closed */ } this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }
  gone(ws) {
    let role = ''; try { role = this.ctx.getTags(ws)[0]; } catch (e) { return; }
    if (role === 'pc') this.dropPc(ws);
    else if (role === 'dir' || role === 'view') this.tellPc(ws);
  }
}

/* ---- the overlay page, for OBS's Browser source (1920 × 1080, transparent). ?demo=1 shows made-up numbers, to place
   it in OBS before the flight ---- */
const LOGO = ((ADMIN_HTML.match(/<svg class="logo"[\s\S]*?<\/svg>/) || [''])[0]).replace('class="logo"', 'class="logo" aria-label="Polaris Airways"');
const OVERLAY_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Polaris Airways · broadcast overlay</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=Marcellus&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css">
<style>
html{font-size:calc(100vw / 120)}
html,body{margin:0;width:100vw;height:100vh;overflow:hidden;background:transparent;color:#fff;font-family:Jost,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
[hidden]{display:none!important}
.glass{background:rgba(8,14,28,.8);border-radius:1rem;box-shadow:0 .3rem 1.6rem rgba(0,0,0,.35)}
#live{position:absolute;left:3rem;top:2.6rem;display:flex;align-items:center;gap:1.2rem}
#live .pill{display:flex;align-items:center;gap:.55rem;background:#E5484D;border-radius:.45rem;padding:.32rem .85rem .32rem .7rem;font:600 1.1rem/1.2 Jost,system-ui,sans-serif;letter-spacing:.16em;box-shadow:0 .2rem 1rem rgba(0,0,0,.3)}
#live .pill i{width:.6rem;height:.6rem;border-radius:50%;background:#fff;animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.25}}
#live .logo{height:2.1rem;width:auto;display:block;filter:drop-shadow(0 .1rem .5rem rgba(0,0,0,.55))}.lg1{fill:#fff}.lg2{fill:#E2B86A}
#lt{position:absolute;left:3rem;bottom:3rem;display:flex;max-width:52rem}
#lt .bar{flex:none;width:.42rem;border-radius:1rem 0 0 1rem;background:linear-gradient(#22A2AF,#1A6772)}
#lt .in{border-radius:0 1rem 1rem 0;padding:1rem 1.9rem 1.15rem 1.4rem;min-width:0}
#lt small{display:block;font:600 .95rem/1.2 Jost,system-ui,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#E2B86A}
#lt b{display:block;font:400 2.75rem/1.12 Marcellus,Georgia,serif;margin:.4rem 0 .25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lt span{display:block;font-size:1.4rem;line-height:1.3;color:#B9CBE3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#data{position:absolute;right:3rem;bottom:3rem;display:flex;padding:.95rem .4rem}
#data>div{padding:0 1.25rem;border-left:1px solid rgba(255,255,255,.14)}#data>div:first-child{border-left:0}
#data small{display:block;font:600 .8rem/1.2 Jost,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#9FB4D0}
#data b{display:block;font:500 2rem/1.25 Jost,system-ui,sans-serif;font-variant-numeric:tabular-nums;margin-top:.2rem;white-space:nowrap}#data b i{font-style:normal;font-size:1rem;color:#9FB4D0;margin-left:.3rem;font-weight:500}
#data .ph b{color:#7FD6DE}
#map{position:absolute;right:3rem;top:2.6rem;width:27rem;height:17rem;border-radius:1rem;overflow:hidden;background:#0D1B2E;box-shadow:0 .3rem 1.6rem rgba(0,0,0,.35);outline:2px solid rgba(255,255,255,.16);outline-offset:-2px}
#map .maplibregl-ctrl-attrib{font-size:.55rem;background:rgba(8,14,28,.55);color:#9FB4D0}#map .maplibregl-ctrl-attrib a{color:#9FB4D0}
#map .maplibregl-ctrl-attrib-button{display:none}
#map.off{visibility:hidden}
</style></head><body>
<div id="live" hidden><div class="pill"><i></i>LIVE</div>${LOGO}</div>
<div id="map" class="off"></div>
<div id="lt" hidden><div class="bar"></div><div class="in glass"><small>Polaris Airways</small><b id="ltT"></b><span id="ltS"></span></div></div>
<div id="data" class="glass" hidden></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js"></script>
<script>
(function(){"use strict";
const T=location.pathname.split("/")[3]||"",DEMO=/[?&]demo=1(&|$)/.test(location.search),$=s=>document.querySelector(s);
const esc=v=>String(v==null?"":v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const PN={parked:"At the gate",taxi:"Taxiing",takeoff:"Takeoff",climb:"Climbing",cruise:"Cruising",descent:"Descending",approach:"On approach",landing:"Landing"};
let C=null,P=null,F=null,PH="",TRK=[],map=null,laid=false,fitAt=0,ws=null,dead=false,plain=false;
const nm=(a,b,c,d)=>{const R=Math.PI/180,x=Math.sin((c-a)*R/2)**2+Math.cos(a*R)*Math.cos(c*R)*Math.sin((d-b)*R/2)**2;return 2*3440.065*Math.asin(Math.min(1,Math.sqrt(x)))};
const k=v=>Math.round(v).toLocaleString("en-US"),hm=t=>new Date(t).toISOString().slice(11,16)+"Z";
function eta(){const a=P&&P.arr;if(F&&!F.g&&F.gs>60&&a&&a.la!=null&&F.la!=null)return hm(Date.now()+nm(F.la,F.lo,a.la,a.lo)/F.gs*3600e3);return P&&P.inn?hm(P.inn):"—"}
function paint(){
 const o=(C&&C.ov)||{},on=!!(C&&C.on);
 $("#live").hidden=!(on&&o.live);$("#lt").hidden=!(on&&o.lt);$("#data").hidden=!(on&&o.data);
 const hasMap=!!(P&&P.route&&P.route.length>1)||TRK.length>1||!!(F&&F.la!=null);$("#map").classList.toggle("off",!(on&&o.map&&hasMap&&laid));
 $("#ltT").textContent=(C&&C.title)||"First flight";
 const auto=P?[P.ac,[P.dep&&(P.dep.name||P.dep.icao),P.arr&&(P.arr.name||P.arr.icao)].filter(Boolean).join(" → ")].filter(Boolean).join(" · "):"";
 $("#ltS").textContent=(C&&C.sub)||auto;$("#ltS").hidden=!$("#ltS").textContent;
 const f=F,alt=f?(f.alt>=18000?"FL"+String(Math.round(f.alt/100)).padStart(3,"0"):k(f.alt)+"<i>ft</i>"):"—";
 const hd=f&&f.h!=null?String(Math.round(((f.h%360)+360)%360)||360).padStart(3,"0")+"°":"—";
 $("#data").innerHTML=(PH?'<div class="ph"><small>Now</small><b>'+esc(PN[PH]||PH)+"</b></div>":"")+'<div><small>Altitude</small><b>'+alt+'</b></div><div><small>Ground speed</small><b>'+(f?k(f.gs)+"<i>kt</i>":"—")+'</b></div><div><small>Heading</small><b>'+hd+'</b></div><div><small>Arrival</small><b>'+eta()+"</b></div>";
 draw()}
function unwrap(L){let p=null;return L.map(q=>{let lo=q[1];if(p!=null){while(lo-p>180)lo-=360;while(lo-p<-180)lo+=360}p=lo;return[lo,q[0]]})}
function dark(){for(const L of map.getStyle().layers){try{
 if(L.type==="background")map.setPaintProperty(L.id,"background-color","#0D1B2E");
 else if(L.type==="fill"){const w=/water|ocean|lake|river/.test(L.id);map.setPaintProperty(L.id,"fill-color",w?"#081426":"#13253C");map.setPaintProperty(L.id,"fill-opacity",w?1:.55)}
 else if(L.type==="line")map.setPaintProperty(L.id,"line-color",/water|river/.test(L.id)?"#0A1A30":/boundary|admin/.test(L.id)?"#3A5172":"#1E3150");
 else if(L.type==="symbol"){map.setPaintProperty(L.id,"text-color","#8FA6C4");map.setPaintProperty(L.id,"text-halo-color","#0B1426")}}catch(e){}}}
function lay(){if(!map||laid)return;laid=true;if(!plain)dark();const E={type:"FeatureCollection",features:[]};
 ["route","trk","ends","ac"].forEach(s=>map.addSource(s,{type:"geojson",data:E}));
 map.addLayer({id:"route",type:"line",source:"route",paint:{"line-color":"#6F86A8","line-width":2,"line-dasharray":[2,1.6]}});
 map.addLayer({id:"trk",type:"line",source:"trk",paint:{"line-color":"#E2B86A","line-width":3.5},layout:{"line-cap":"round","line-join":"round"}});
 map.addLayer({id:"ends",type:"circle",source:"ends",paint:{"circle-radius":4.5,"circle-color":"#fff","circle-stroke-color":"#1A6772","circle-stroke-width":2}});
 const c=document.createElement("canvas");c.width=c.height=72;const g=c.getContext("2d");g.translate(36,36);g.scale(3,3);const A=new Path2D("M0-10L1.7-3.5L9 1V3.2L1.7 1.6L1.3 6.4L3.8 8.4V10L0 9L-3.8 10V8.4L-1.3 6.4L-1.7 1.6L-9 3.2V1L-1.7-3.5Z");
 g.lineJoin="round";g.strokeStyle="#0B1426";g.lineWidth=1.4;g.stroke(A);g.fillStyle="#fff";g.fill(A);map.addImage("ac",g.getImageData(0,0,72,72),{pixelRatio:2});
 map.addLayer({id:"ac",type:"symbol",source:"ac",layout:{"icon-image":"ac","icon-rotate":["get","h"],"icon-rotation-alignment":"map","icon-allow-overlap":true,"icon-ignore-placement":true}});fitAt=0;paint()}
function draw(){if(!map||!laid)return;
 const R=unwrap((P&&P.route)||[]),pos=F&&F.la!=null?[F.la,F.lo]:null;
 map.getSource("route").setData({type:"Feature",geometry:{type:"LineString",coordinates:R.length>1?R:[[0,0],[0,0]]}});
 const tk=unwrap(TRK.map(q=>[q[0],q[1]]).concat(pos?[pos]:[]));map.getSource("trk").setData({type:"Feature",geometry:{type:"LineString",coordinates:tk.length>1?tk:[[0,0],[0,0]]}});
 map.getSource("ends").setData({type:"FeatureCollection",features:R.length?[R[0],R[R.length-1]].map(c=>({type:"Feature",geometry:{type:"Point",coordinates:c}})):[]});
 const hdg=F?((F.k!=null&&F.gs>40?F.k:F.h)||0)+(F.mv||0):0;
 map.getSource("ac").setData(pos?{type:"Feature",properties:{h:hdg},geometry:{type:"Point",coordinates:[pos[1],pos[0]]}}:{type:"FeatureCollection",features:[]});
 /* the whole route and the aircraft, again every few minutes */
 if(Date.now()-fitAt>180000){const pts=R.concat(pos?[[pos[1],pos[0]]]:[]);if(pts.length){fitAt=Date.now();let w=1e3,e=-1e3,s=90,n=-90;pts.forEach(q=>{w=Math.min(w,q[0]);e=Math.max(e,q[0]);s=Math.min(s,q[1]);n=Math.max(n,q[1])});
  if(e-w<.4){w-=.4;e+=.4}if(n-s<.3){s-=.3;n+=.3}map.fitBounds([[w,s],[e,n]],{padding:28,maxZoom:9,duration:pts.length>1&&laid?1200:0})}}}
function mapOn(){if(map||typeof maplibregl==="undefined")return;try{map=new maplibregl.Map({container:"map",style:"https://tiles.openfreemap.org/styles/positron",center:[0,30],zoom:2,interactive:false,attributionControl:{compact:true},fadeDuration:0});map.on("style.load",()=>{laid=false;lay()});
 setTimeout(()=>{if(!laid&&map){plain=true;try{map.setStyle({version:8,sources:{},layers:[{id:"bg",type:"background",paint:{"background-color":"#0D1B2E"}}]})}catch(e){}}},12000)}catch(e){map=null}}
function open(){if(dead)return;try{ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+"/live/o/"+T+"/ws")}catch(e){setTimeout(open,5000);return}
 ws.onmessage=e=>{let j;try{j=JSON.parse(e.data)}catch(x){return}
  if(j.t==="ov"){if(j.cfg)C=j.cfg;if("plan"in j)P=j.plan;if(j.trk)TRK=j.trk;if("fl"in j)F=j.fl;if(j.ph!=null)PH=j.ph;fitAt=0}
  else if(j.t==="fl"){F=j.f;PH=j.ph||PH}else if(j.t==="ph")PH=j.ph;else if(j.t==="plan"){P=j.plan;TRK=j.trk||[];fitAt=0}else if(j.t==="trk"&&j.p)TRK.push(j.p);else return;
  paint()};
 ws.onclose=e=>{ws=null;if(e.code===4004){dead=true;C=null;paint();return}setTimeout(open,3000)}}
setInterval(()=>{if(ws&&ws.readyState===1)try{ws.send("ping")}catch(e){}},30000);
if(DEMO){C={on:true,ov:{lt:true,data:true,map:true,live:true},title:"First flight",sub:""};P={ac:"A321",dep:{icao:"EDHI",name:"Hamburg Finkenwerder",la:53.535,lo:9.835},arr:{icao:"KJFK",name:"John F Kennedy Intl",la:40.64,lo:-73.78},route:[[53.535,9.835],[55.6,-2],[57,-15],[56.5,-30],[53,-45],[48,-56],[44.5,-63],[40.64,-73.78]],inn:Date.now()+4*3600e3};
 TRK=[[53.535,9.835],[54.6,4],[55.6,-2],[56.6,-10],[57,-15]];F={alt:37000,gs:452,h:268,k:266,mv:0,la:57,lo:-17,g:0,vs:0};PH="cruise"}
else open();
mapOn();paint()})();
</script></body></html>`;
