/* Polaris Navdata sending straight to the EFB server: simulator -> Navdata -> EFB server -> the pilot's iPad, with no
   EFB open on the simulator PC. The pilot turns it on in the EFB on that PC (Ground > Simulator PC), which asks the
   server for a key for this PC and hands it over ({ cmd:"cloud", key }); the key is good only for /api/nav/* on the
   server, is kept in this Windows user's protected storage (DPAPI), and is removed on the EFB.
   While an EFB is open on this PC it does the work as before and this stands by. With none (for 5 s), and a simulator
   running, it:
   - asks the server once a minute which plan the pilot has loaded (GET /api/nav/flight). A plan loaded in the last 24
     hours whose times are not all stamped is the flight under way;
   - keeps a sending connection to the pilot's PFD relay, so it hears when a device watches, and sends the PFD's
     frames only then;
   - for the flight under way: stamps OUT, OFF, ON and IN as the EFB does (OUT only within 15 NM of the plan's
     departure airport, so another flight flown with an old plan still loaded is left alone), catches the touchdown,
     reads GSX's values (MSFS) and posts them all (POST /api/nav/gsx: on a change, and every 30 s), and reads the
     departure and arrival airports' procedures once and posts them (POST /api/nav/navproc).
   It reads the simulator only for that: the fast values while a device watches the PFD, or in flight for the
   touchdown (X-Plane: for the whole flight, its ground values come with them); MSFS's once-a-second values for the
   flight. Posts carry the whole state, so one lost while offline is made good by the next. */
'use strict';
const fs = require('fs'), path = require('path');
const WebSocket = require('ws');

const DEFAULT_SERVER = 'https://efb-api.koz8738.com';
const OO = ['OUT', 'OFF', 'ON', 'IN'];
const okServer = (s) => /^https:\/\/([a-z0-9-]+\.)*koz8738\.com$/i.test(String(s || ''));
const nm = (a, b) => { const R = Math.PI / 180, x = Math.sin((b[0] - a[0]) * R / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin((b[1] - a[1]) * R / 2) ** 2; return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(x))); };
const hhmm = (t) => { const d = new Date(t); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };

/* the key at rest: Windows keeps it for this user only (DPAPI, through PowerShell; the key goes in by the environment,
   not on the command line); elsewhere (the tests) a file only this user can read */
function dpapi(mode, text) {
  return new Promise((res) => {
    const ps = mode === 'in'
      ? "Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($env:PN_SECRET), $null, 'CurrentUser'))"
      : "Add-Type -AssemblyName System.Security; [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($env:PN_SECRET), $null, 'CurrentUser'))";
    require('child_process').execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, env: { ...process.env, PN_SECRET: text } }, (e, out) => res(e ? '' : String(out).trim()));
  });
}

class Cloud {
  /* o = { dir, server (only this one, for the tests), log(), sim() -> 'msfs' | 'xp' | '', localEfb() -> bool,
           procs(icao) -> Promise<data>, changed() (what it wants from the simulator changed), paired() (hello changed) } */
  constructor(o) {
    this.o = o; this.file = path.join(o.dir, 'cloud.json'); this.fixed = o.server || ''; this.server = o.server || DEFAULT_SERVER;
    this.poll = o.pollMs || 60000; this.key = ''; this.kid = ''; this.auto = true; this.cal = [1, 1]; this.timer = null; this.wantLive = false; this.wantGsx = false;
    this.clear();
  }
  get on() { return !!this.key; }
  clear() {
    this.flight = null; this.flightAt = 0; this.oo = {}; this.sim = null; this.psim = null; this.v = null; this.ac = ''; this.land = null; this.lprev = null; this.landPend = null;
    this.park = 0; this.gsAt = 0; this.subs = 0; this.rtt = null; this.posted = ''; this.postAt = 0; this.urgent = false; this.posting = false; this.np = {}; this.origin = null; this.busyFlight = false;
    this.closePub();
  }
  /* ---- the key ---- */
  async load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const key = j.enc ? await dpapi('out', j.key) : String(j.key || '');
      if (!key) return;
      this.key = key; this.kid = String(j.kid || ''); this.auto = j.auto !== false; if (Array.isArray(j.cal)) this.cal = [j.cal[0] === -1 ? -1 : 1, j.cal[1] === -1 ? -1 : 1];
      if (!this.fixed && okServer(j.server)) this.server = j.server;
      this.o.log('Sends to your iPad by itself when no EFB is open on this PC (set on the EFB, Ground › Simulator PC).');
      this.start(); this.o.paired();
    } catch (e) { /* not paired */ }
  }
  async save() {
    try {
      fs.mkdirSync(this.o.dir, { recursive: true });
      if (!this.key) { try { fs.unlinkSync(this.file); } catch (e) { /* none */ } return true; }
      let key = this.key, enc = false;
      if (process.platform === 'win32') { key = await dpapi('in', this.key); enc = true; if (!key) return false; }
      fs.writeFileSync(this.file, JSON.stringify({ key, enc, kid: this.kid, server: this.server, auto: this.auto, cal: this.cal }), { mode: 0o600 });
      return true;
    } catch (e) { return false; }
  }
  /* from the EFB on this PC: { key, kid, server } pairs, { key:"" } unpairs; auto (stamp the times) and cal (the PFD's
     bank and pitch signs for MSFS) are the EFB's settings, told whenever it connects */
  async set(j) {
    if (typeof j.auto === 'boolean') this.auto = j.auto;
    if (Array.isArray(j.cal)) this.cal = [j.cal[0] === -1 ? -1 : 1, j.cal[1] === -1 ? -1 : 1];
    if (typeof j.key === 'string') {
      if (j.key && !/^nk\.[\w-]+\.[\w-]+$/.test(j.key)) return 'Not a Polaris Navdata key';
      if (j.key && !this.fixed) { if (j.server && !okServer(j.server)) return 'Not the Polaris EFB server'; this.server = j.server || DEFAULT_SERVER; }
      const was = this.key; this.key = j.key; this.kid = j.key ? String(j.kid || '') : '';
      if (!(await this.save())) { this.key = ''; this.kid = ''; this.stop(); this.o.paired(); return 'Could not keep the key on this PC'; }
      if (this.key && this.key !== was) { this.stop(); this.start(); this.o.log('Paired with the EFB server: sends to your iPad by itself when no EFB is open on this PC.'); }
      if (!this.key && was) { this.stop(); this.o.log('No longer sends by itself: the EFB on this PC does it, as before.'); }
      this.o.paired();
    } else if (this.key) await this.save();
    return '';
  }
  start() { if (!this.timer && this.key) { this.timer = setInterval(() => this.tick().catch(() => {}), 1000); } }
  stop() { clearInterval(this.timer); this.timer = null; this.clear(); this.setWant(false, false); }
  setWant(l, g) { if (l !== this.wantLive || g !== this.wantGsx) { this.wantLive = l; this.wantGsx = g; this.o.changed(); } }
  /* ---- the server ---- */
  async api(method, p, body) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 10000);
    try {
      const r = await fetch(this.server + p, { method, headers: { Authorization: 'Bearer ' + this.key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: ac.signal });
      if (r.status === 401) { if (!this.key) return null; this.o.log('The EFB server no longer takes this PC’s key (removed on the EFB, or you were signed out): turn it on again on the EFB, Ground › Simulator PC.'); this.key = ''; this.kid = ''; await this.save(); this.stop(); this.o.paired(); return null; }
      return r.ok ? await r.json() : null;
    } catch (e) { return null; } finally { clearTimeout(t); }
  }
  closePub() { clearInterval(this.pingT); const w = this.pub; this.pub = null; this.subs = 0; if (w) try { w.close(); } catch (e) { /* closed */ } }
  async openPub() {
    if (this.pub || this.pubBusy || Date.now() - (this.pubAt || 0) < 15000) return; this.pubBusy = true; this.pubAt = Date.now();
    try {
      const j = await this.api('POST', '/api/nav/ticket'); if (!j || !j.ticket || !this.timer) return;
      const w = new WebSocket(this.server.replace(/^http/i, 'ws') + '/api/efb/pfd/ws?nav=1&role=pub&ticket=' + encodeURIComponent(j.ticket)); this.pub = w;
      w.on('open', () => { clearInterval(this.pingT); this.pingT = setInterval(() => { if (w.readyState === 1) w.send(JSON.stringify({ ping: Date.now() })); }, 25000); });
      w.on('message', (m) => { let x; try { x = JSON.parse(String(m)); } catch (e) { return; } if (x.subs != null) this.subs = +x.subs || 0; if (x.pong != null) this.rtt = Date.now() - x.pong; });
      w.on('error', () => {});
      w.on('close', (code) => { if (this.pub === w) { this.pub = null; this.subs = 0; clearInterval(this.pingT); if (code === 4000) this.pubAt = Date.now() + 45000; } });
    } finally { this.pubBusy = false; }
  }
  /* ---- once a second while paired ---- */
  active() { return !!this.key && !this.o.localEfb() && !!this.o.sim(); }
  flying() { const f = this.flight; return !!f && !this.oo.IN && Date.now() - (f.at || 0) < 24 * 3600_000; }
  async tick() {
    if (!this.active()) { if (this.flight || this.pub || this.wantLive || this.wantGsx) { const np = this.np; this.clear(); this.np = np; this.setWant(false, false); } return; }
    const now = Date.now(), sim = this.o.sim();
    this.openPub();
    if (now - this.flightAt > this.poll && !this.busyFlight) {
      this.busyFlight = true;
      try {
        const j = await this.api('GET', '/api/nav/flight');
        if (j) {
          this.flightAt = Date.now();
          const f = j.flight || null;
          if ((f && f.fid) !== (this.flight && this.flight.fid)) { this.oo = {}; this.land = null; this.v = null; this.origin = null; this.posted = ''; if (f && Date.now() - (f.at || 0) < 24 * 3600_000) this.o.log('Flight ' + (f.flight || f.fid) + ' ' + f.from + ' → ' + f.to + ': sending it to your devices.'); }
          this.flight = f;
          /* times kept on the server for this flight fill the empty ones here */
          if (f && j.oo) for (const k of OO) if (!this.oo[k] && /^\d\d:\d\d$/.test(j.oo[k] || '')) this.oo[k] = j.oo[k];
        } else this.flightAt = Date.now() - this.poll * 0.75;
      } finally { this.busyFlight = false; }
    }
    if (!this.key) return;
    const fl = this.flying(), air = fl && !!this.oo.OFF && !this.oo.ON;
    /* the fast values: a device watches the PFD; in flight, for the touchdown; X-Plane, the whole flight */
    this.setWant(this.subs > 0 || (fl && (sim === 'xp' || air)), !!this.flight && sim === 'msfs' && Date.now() - (this.flight.at || 0) < 24 * 3600_000);
    if (this.flight) { this.procs(); this.post(); }
  }
  /* the flight's airports, read from the simulator once (again after 10 minutes if that failed) */
  async procs() {
    const f = this.flight; if (this.npBusy) return;
    for (const ic of [f.from, f.to]) {
      if (!/^[A-Z0-9]{3,4}$/.test(ic || '')) continue;
      const st = this.np[ic];
      if (st && st.d && ic === f.from && !this.origin) this.origin = st.pos;
      if (st && (st.d || Date.now() - st.at < 600000)) continue;
      this.npBusy = true; this.np[ic] = { at: Date.now() };
      try {
        const d = await this.o.procs(ic);
        const pos = d && Number.isFinite(d.la) && Number.isFinite(d.lo) && (d.la || d.lo) ? [d.la, d.lo] : null;
        if (ic === f.from) this.origin = pos;
        const r = await this.api('POST', '/api/nav/navproc', { data: { ...d, src: 'sim' } });
        if (r && r.ok) { this.np[ic] = { at: Date.now(), d: true, pos }; this.o.log(ic + ': its procedures sent for your devices.'); }
        else this.np[ic].pos = pos;
      } catch (e) { /* no procedures there, or the simulator is not ready: later */ } finally { this.npBusy = false; }
      return;
    }
  }
  /* ---- the times, as the EFB stamps them (gxStamp, gxOooiSim) ---- */
  stamp(k, why, need) {
    if (!this.auto || !this.flying() || this.oo[k]) return false;
    if ((need || []).some((x) => !this.oo[x])) return false;
    if (OO.slice(OO.indexOf(k) + 1).some((x) => this.oo[x])) return false;
    if (k === 'OUT' && this.origin && this.sim && this.sim.la != null && nm(this.origin, [this.sim.la, this.sim.lo]) > 15) return false;
    this.oo[k] = hhmm(Date.now()); this.urgent = true; this.o.log(k + ' ' + this.oo[k].replace(':', '') + 'Z (' + why + ')');
    return true;
  }
  simIn(s) {
    const p = this.sim; this.psim = p; this.sim = s; if (s.ac) this.ac = s.ac;
    if (!p || !this.flying()) return;
    if (p.gnd === 1 && s.gnd === 1 && s.kt > 3 && !this.oo.ON) this.stamp('OUT', 'moving');
    if (p.gnd === 1 && s.gnd === 0 && s.kt > 40) this.stamp('OFF', 'airborne', ['OUT']);
    if (p.gnd === 0 && s.gnd === 1) this.stamp('ON', 'on the ground', ['OUT', 'OFF']);
    /* IN: after ON, stopped, every engine off, for 5 s */
    if (this.oo.ON && !this.oo.IN && s.gnd === 1 && s.kt < 1 && !s.eng) { if (!this.park) this.park = Date.now(); else if (Date.now() - this.park >= 5000) { this.park = 0; this.stamp('IN', 'parked, engines off', ['OUT', 'OFF', 'ON']); } }
    else this.park = 0;
  }
  /* MSFS, once a second: GSX's values and the aircraft on the ground */
  onGsx(m) {
    if (!this.active() || !this.flight) return;
    const g = m.g || {}, v = { ...m.v }, p = this.v;
    if (!v.deice && v.deice2) v.deice = v.deice2; delete v.deice2;
    v.fob = v.fuel === 5 ? Math.round((g.fob || 0) / 10) * 10 : Math.round((g.fob || 0) / 100) * 100;
    this.simIn({ gnd: g.gnd ? 1 : 0, kt: +g.kt || 0, eng: +g.eng || 0, la: Number.isFinite(g.la) && (g.la || g.lo) ? g.la : null, lo: g.lo, ac: String(g.title || '') });
    if (p) {
      if (['board', 'deboard', 'cater', 'fuel', 'dep', 'deice', 'coua', 'hose'].some((k) => p[k] !== v[k])) this.urgent = true;
      if (p.dep !== 5 && v.dep === 5) this.stamp('OUT', 'GSX pushback');
      if (p.deboard < 4 && (v.deboard === 4 || v.deboard === 5)) this.stamp('IN', 'GSX deboarding called', ['OUT', 'OFF', 'ON']);
    } else this.urgent = true;
    this.v = v;
  }
  /* the fast values: to the relay while a device watches; the touchdown; X-Plane's ground values */
  onFrame(F, from) {
    if (!this.active()) return;
    const now = Date.now(), { ac, pbrk, eng, fob, ...f } = F; f.t = now;
    if (from === 'msfs') { f.p = +(f.p * this.cal[1]).toFixed(2); f.b = +(f.b * this.cal[0]).toFixed(2); }
    else if (this.flight && now - this.gsAt >= 500) { this.gsAt = now; this.simIn({ gnd: f.g ? 1 : 0, kt: +f.gs || 0, eng: +eng || 0, la: f.la, lo: f.lo, ac: String(ac || '') }); }
    /* touchdown (the EFB's bpLandCheck): the vertical speed at contact, and the most G in the next 1.5 s */
    const p = this.lprev; this.lprev = f;
    if (p) {
      if (p.g === 0 && f.g === 1 && p.ias > 40 && (!this.land || now - this.land.t > 20000)) this.landPend = { t: now, fpm: f.tdv || p.vs, g: Math.max(f.gf || 1, p.gf || 1), ias: Math.round(p.ias), pitch: +p.p.toFixed(1), fl: this.flight ? this.flight.flight : '', fid: this.flight ? this.flight.fid : '' };
      if (this.landPend) { const L = this.landPend; L.g = Math.max(L.g, f.gf || 0); if (!L.fpm && f.tdv) L.fpm = f.tdv; if (now - L.t > 1500) { this.landPend = null; L.g = +L.g.toFixed(2); this.land = L; this.urgent = true; this.o.log('Touchdown ' + Math.round(L.fpm) + ' fpm, ' + L.g.toFixed(2) + ' G'); } }
    }
    if (this.land && now - this.land.t < 60000) f.ld = this.land;
    const w = this.pub;
    if (w && w.readyState === 1 && this.subs > 0) { f.l = this.rtt != null ? Math.round(this.rtt / 2) : null; try { w.send(JSON.stringify(f)); } catch (e) { /* closed */ } }
  }
  /* Ground's record on the server: at a change (at most once a second for a service's state or a time, every 4 s for
     counts), and every 30 s so the devices see it is live */
  async post() {
    if (this.posting || !this.flight) return;
    const fresh = Date.now() - (this.flight.at || 0) < 24 * 3600_000; if (!fresh) return;
    const land = this.land && this.land.fid === this.flight.fid ? this.land : undefined;
    const body = { v: this.v || {}, ac: this.ac, fid: this.flight.fid, oo: this.oo, land }, s = JSON.stringify(body), now = Date.now();
    const gap = this.urgent ? 1000 : s !== this.posted ? 4000 : 30000;
    if (now - this.postAt < gap) return;
    this.posting = true; this.urgent = false; this.postAt = now;
    /* not taken (offline): the whole state goes again, 5 s later */
    try { const r = await this.api('POST', '/api/nav/gsx', body); if (r && r.ok) this.posted = s; else { this.urgent = true; this.postAt = Date.now() + 4000; } } finally { this.posting = false; }
  }
}

module.exports = { Cloud, okServer, DEFAULT_SERVER };
