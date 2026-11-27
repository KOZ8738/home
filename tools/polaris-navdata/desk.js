/* The broadcast desk (Operations admin > Broadcast): the director switches OBS's scenes on this PC and sees what OBS
   shows, from anywhere, with nothing to do here. Polaris Navdata is the go-between: simulator PC (OBS, the simulator)
   <-> Navdata <-> EFB server (one desk, a Durable Object) <-> the admin.
   It joins the desk only when the server says this pilot's flight is the one on the desk (GET /api/nav/flight ->
   desk: true, asked every 30 s while a simulator runs or OBS is set up) and OBS is set up on the EFB here; it leaves when
   either stops, or the desk sends it away.
   To the desk: whether OBS answers, its scenes and the one on air, the stream's and the recording's state and OBS's
   load (every 2 s), the flight's numbers and phase (every 1 s, for the picture's overlay and the auto director), and,
   only while someone watches the desk, pictures: the scene on air (640x360, every second), the one the director picked
   to go next (every 2 s) and each other scene in turn (320x180, three every 2 s).
   From the desk: put a scene on air; start or stop the stream or the recording (only if allowed on the EFB here); the
   auto director's rules. Nothing else from the desk reaches OBS: a scene must be one of OBS's own.
   Auto director: by the flight's phase (from the simulator's values), the scene the director chose for that phase goes
   on air; a phase with several scenes takes them in turn (every N seconds). The director's own TAKE turns it off. */
'use strict';
const WebSocket = require('ws');

const PHASES = ['parked', 'taxi', 'takeoff', 'climb', 'cruise', 'descent', 'approach', 'landing'];
/* the phase the values show, before it is held for a moment (prev: the phase before, for a roll on the runway and
   level flight below 10,000 ft) */
function phaseRaw(f, prev) {
  const gs = +f.gs || 0, ra = +f.ra || 0, vs = +f.vs || 0, alt = +f.alt || 0;
  if (f.g) {
    if (gs < 1) return 'parked';
    if (gs < 40) return prev === 'landing' && gs > 20 ? 'landing' : 'taxi';
    return prev === 'approach' || prev === 'landing' || prev === 'descent' ? 'landing' : 'takeoff';
  }
  if (ra < 200 && vs < -50) return 'landing';
  if (ra < 1500 && vs > 300) return 'takeoff';
  if (ra < 3000 && vs < -200) return 'approach';
  if (vs > 400) return 'climb';
  if (vs < -400) return 'descent';
  if (alt > 10000) return 'cruise';
  return prev && prev !== 'parked' && prev !== 'taxi' ? prev : 'climb';
}

class Desk {
  /* o = { log(), version, server() (the EFB server), api(method, path, body) (Navdata's key: cloud.js), obs (ObsLink),
           remote() (may the desk start and stop the stream), changed() (what it wants from the simulator changed) } */
  constructor(o) {
    this.o = o; this.want = false; this.ws = null; this.opening = false; this.retry = null; this.watch = 0; this.away = 0;
    this.cfg = { auto: { on: false, rules: {}, every: 180 } }; this.scenes = []; this.pgm = ''; this.pvw = '';
    this.f = null; this.fAt = 0; this.ph = ''; this.phRaw = ''; this.phSince = 0; this.lastSwitch = 0; this.rot = {};
    this.timers = []; this.shotBusy = false; this.thumbI = -1; this.tick = 0; this.statsAt = 0; this.sBytes = null;
  }
  get on() { return !!(this.ws && this.ws.readyState === 1); }
  /* the simulator's values: wanted while on the desk (the overlay's numbers, the auto director) */
  get wantLive() { return this.on; }
  /* from the server's answer: is this pilot's flight on the desk */
  set(on) {
    const want = !!on && this.o.obs.on && Date.now() > this.away;
    if (want === this.want) { if (want && !this.ws && !this.opening && !this.retry) this.open(); return; }
    this.want = want;
    if (want) { this.o.log('This flight is on the broadcast desk: joining it.'); this.open(); } else this.leave(this.ws ? 'No longer on the broadcast desk.' : '');
  }
  stopLoops() { for (const t of this.timers) clearInterval(t); this.timers = []; }
  leave(why) {
    clearTimeout(this.retry); this.retry = null; this.stopLoops();
    const w = this.ws; this.ws = null; if (w) { try { w.close(1000); } catch (e) { /* closed */ } }
    if (why) this.o.log(why);
    if (this.watch) { this.watch = 0; } this.o.changed();
  }
  async open() {
    if (this.ws || this.opening || !this.want) return; this.opening = true;
    try {
      const j = await this.o.api('POST', '/api/nav/ticket'); if (!j || !j.ticket || !this.want) { this.later(); return; }
      const w = new WebSocket(this.o.server().replace(/^http/i, 'ws') + '/api/nav/desk/ws?ticket=' + encodeURIComponent(j.ticket));
      this.ws = w;
      w.on('open', () => { if (this.ws !== w) return; this.o.log('On the broadcast desk: the director sees OBS from here.'); this.hello(); this.loops(); this.o.changed(); });
      w.on('message', (m) => { if (this.ws === w) this.msg(m); });
      w.on('close', (code) => {
        if (this.ws !== w) return; this.ws = null; this.stopLoops(); this.watch = 0; this.o.changed();
        /* 4001: the desk is not set to this flight (any more); 4000: another simulator PC of this pilot took over */
        if (code === 4001 || code === 4000) { this.want = false; this.away = Date.now() + (code === 4000 ? 60000 : 0); this.o.log(code === 4000 ? 'Another simulator PC took over the broadcast desk.' : 'The broadcast desk is not set to this flight.'); return; }
        this.later();
      });
      w.on('error', () => { /* the close follows */ });
    } finally { this.opening = false; }
  }
  later() { clearTimeout(this.retry); this.retry = null; if (this.want) this.retry = setTimeout(() => { this.retry = null; this.open(); }, 5000); }
  send(m) { const w = this.ws; if (w && w.readyState === 1) try { w.send(JSON.stringify(m)); } catch (e) { /* gone */ } }
  obsState() { const b = this.o.obs; return { st: b.st, v: b.v, err: b.err }; }
  hello() { this.send({ t: 'pc', v: this.o.version, obs: this.obsState(), remote: !!this.o.remote() }); this.refresh(); this.statsAt = 0; this.stats(); }
  /* the EFB here changed OBS's settings (port, password, whether the desk may start and stop) */
  cfgChanged() { if (!this.o.obs.on) { if (this.want) { this.want = false; this.leave('OBS is no longer set up: left the broadcast desk.'); } return; } if (this.on) this.send({ t: 'pc', v: this.o.version, obs: this.obsState(), remote: !!this.o.remote() }); }
  /* OBS connected, closed, or its error changed */
  obsChanged() { this.send({ t: 'obs', obs: this.obsState() }); if (this.o.obs.st !== 'on') { this.scenes = []; this.pgm = ''; } }
  /* the scenes (in OBS's own order, the top one first) and the one on air */
  async refresh() {
    try { const r = await this.o.obs.req('GetSceneList'); this.scenes = (r.scenes || []).map((s) => String(s.sceneName || '')).filter(Boolean).reverse(); this.pgm = String(r.currentProgramSceneName || ''); this.send({ t: 'scenes', list: this.scenes, pgm: this.pgm }); }
    catch (e) { /* OBS not there */ }
  }
  event(type, d) {
    if (type === 'CurrentProgramSceneChanged') { this.pgm = String(d.sceneName || ''); this.send({ t: 'pgm', name: this.pgm }); this.shot('pgm', this.pgm); }
    else if (type === 'SceneListChanged' || type === 'SceneNameChanged' || type === 'SceneCreated' || type === 'SceneRemoved') this.refresh();
    else if (type === 'StreamStateChanged' || type === 'RecordStateChanged') { this.statsAt = 0; this.stats(); }
  }
  loops() {
    this.stopLoops();
    this.timers = [
      setInterval(() => { this.flight(); this.auto(false); }, 1000),
      setInterval(() => this.stats(), 2000),
      setInterval(() => this.pictures(), 500),
    ];
  }
  /* ---- pictures, only while someone watches ---- */
  async shot(k, name, w, h) {
    if (!name || !this.watch || this.o.obs.st !== 'on') return;
    try {
      const r = await this.o.obs.req('GetSourceScreenshot', { sourceName: name, imageFormat: 'jpg', imageWidth: w || 640, imageHeight: h || 360, imageCompressionQuality: k === 's' ? 45 : 60 }, 5000);
      if (r.imageData) this.send({ t: 'shot', k, name, img: String(r.imageData) });
    } catch (e) { /* a scene being renamed, OBS busy */ }
  }
  async thumb() {
    const L = this.scenes.filter((s) => s !== this.pgm); if (!L.length) return;
    this.thumbI = (this.thumbI + 1) % L.length; await this.shot('s', L[this.thumbI], 320, 180);
  }
  async pictures() {
    if (!this.on || !this.watch || this.shotBusy || this.o.obs.st !== 'on') return; this.shotBusy = true;
    try {
      const n = this.tick++;
      if (n % 2 === 0) { await this.shot('pgm', this.pgm); await this.thumb(); }
      else if (n % 4 === 1 && this.pvw && this.pvw !== this.pgm && this.scenes.includes(this.pvw)) await this.shot('pvw', this.pvw);
      else await this.thumb();
    } finally { this.shotBusy = false; }
  }
  /* ---- the stream, the recording and OBS's load ---- */
  async stats() {
    if (!this.on || this.o.obs.st !== 'on' || Date.now() - this.statsAt < 1500) return; this.statsAt = Date.now();
    const b = this.o.obs, out = { t: 'stats' };
    try {
      const [s, r, g] = await Promise.all([b.req('GetStreamStatus').catch(() => null), b.req('GetRecordStatus').catch(() => null), b.req('GetStats').catch(() => null)]);
      if (s) {
        const now = Date.now(), bytes = +s.outputBytes || 0, prev = this.sBytes; this.sBytes = { bytes, now };
        out.stream = { on: !!s.outputActive, rec: !!s.outputReconnecting, dur: +s.outputDuration || 0, kbps: prev && s.outputActive && now > prev.now && bytes >= prev.bytes ? Math.round((bytes - prev.bytes) * 8 / (now - prev.now)) : 0,
          skip: +s.outputSkippedFrames || 0, frames: +s.outputTotalFrames || 0, cong: Math.round((+s.outputCongestion || 0) * 100) / 100 };
      }
      if (r) out.rec = { on: !!r.outputActive, paused: !!r.outputPaused, dur: +r.outputDuration || 0 };
      if (g) out.obs = { cpu: Math.round((+g.cpuUsage || 0) * 10) / 10, fps: Math.round((+g.activeFps || 0) * 10) / 10, rskip: +g.renderSkippedFrames || 0, rtotal: +g.renderTotalFrames || 0, oskip: +g.outputSkippedFrames || 0, ototal: +g.outputTotalFrames || 0 };
      this.send(out);
    } catch (e) { /* OBS gone */ }
  }
  /* ---- the flight: the simulator's values, once a second ---- */
  onFrame(f) { this.f = f; this.fAt = Date.now(); }
  flight() {
    if (!this.on) return; const f = this.f, fresh = !!f && Date.now() - this.fAt < 5000;
    if (fresh) {
      const raw = phaseRaw(f, this.ph);
      if (raw !== this.phRaw) { this.phRaw = raw; this.phSince = Date.now(); }
      /* a new phase holds for a moment first (2 s on the runway and near it, 8 s elsewhere) */
      const hold = raw === 'takeoff' || raw === 'landing' || this.ph === 'takeoff' || this.ph === 'landing' ? 2000 : 8000;
      if (raw !== this.ph && (!this.ph || Date.now() - this.phSince >= hold)) { this.ph = raw; this.send({ t: 'ph', ph: this.ph }); this.auto(true); }
    }
    const r = (v, n) => (Number.isFinite(+v) ? Math.round(+v * n) / n : null);
    this.send({ t: 'fl', f: fresh ? { alt: r(f.alt, 1), gs: r(f.gs, 1), ias: r(f.ias, 1), vs: r(f.vs, 1), h: r(f.h, 1), k: r(f.k, 1), mv: r(f.mv, 10), la: r(f.la, 1e5), lo: r(f.lo, 1e5), ra: r(f.ra, 1), g: f.g ? 1 : 0, m: r(f.m, 1000) } : null, ph: this.ph });
  }
  /* ---- the auto director ---- */
  auto(changed) {
    const A = this.cfg.auto; if (!this.on || !A || !A.on || !this.ph || this.o.obs.st !== 'on') return;
    const want = [].concat((A.rules && A.rules[this.ph]) || []).map(String).filter((s) => this.scenes.includes(s)); if (!want.length) return;
    const every = Math.max(20, Math.min(3600, +A.every || 180)) * 1000, now = Date.now();
    let next = null;
    if (changed) next = want[(this.rot[this.ph] || 0) % want.length];
    else if (now - this.lastSwitch < every) return;
    else if (want.length > 1) { const i = ((this.rot[this.ph] || 0) + 1) % want.length; this.rot[this.ph] = i; next = want[i]; }
    else if (!want.includes(this.pgm)) next = want[0];
    if (!next) return;
    if (next !== this.pgm) this.put(next, 'auto'); else this.lastSwitch = now;
  }
  async put(name, by) {
    this.lastSwitch = Date.now();
    /* (the desk is told first, so the change OBS reports is known to be the auto director's) */
    if (by === 'auto') this.send({ t: 'auto', name, ph: this.ph });
    try { await this.o.obs.req('SetCurrentProgramScene', { sceneName: name }); return ''; }
    catch (e) { return e.message; }
  }
  /* ---- from the desk ---- */
  async msg(raw) {
    let j; try { j = JSON.parse(String(raw)); } catch (e) { return; }
    if (!j || typeof j !== 'object') return;
    /* the desk was restarted on the server: everything again */
    if (j.hello) { this.hello(); return; }
    if (typeof j.watch === 'number') { const was = this.watch; this.watch = Math.max(0, j.watch | 0); if (this.watch && !was) { this.refresh(); this.statsAt = 0; this.stats(); } return; }
    if (j.cfg && typeof j.cfg === 'object') {
      const a = j.cfg.auto || {}, on = a.on === true, was = this.cfg.auto.on;
      this.cfg = { auto: { on, every: +a.every || 180, rules: a.rules && typeof a.rules === 'object' ? a.rules : {} } };
      if (on && !was) { this.rot = {}; this.auto(true); }
      return;
    }
    if (typeof j.pvw === 'string') { this.pvw = j.pvw; if (this.watch) this.shot('pvw', this.pvw); return; }
    if (!j.cmd || typeof j.cmd !== 'object') return;
    const c = j.cmd, id = String(c.id || '').slice(0, 40), ack = (err) => this.send({ t: 'ack', id, ok: !err, err: err || '' });
    const op = String(c.op || '');
    if (op === 'scene') {
      const name = String(c.name || '');
      if (!this.scenes.includes(name)) await this.refresh();
      if (!this.scenes.includes(name)) return ack('OBS has no scene called “' + name.slice(0, 60) + '”');
      return ack(await this.put(name, 'desk'));
    }
    if (op === 'refresh') { await this.refresh(); return ack(this.o.obs.st === 'on' ? '' : 'OBS is not connected'); }
    const OUT = { start: 'StartStream', stop: 'StopStream', recstart: 'StartRecord', recstop: 'StopRecord' };
    if (OUT[op]) {
      if (!this.o.remote()) return ack('Starting and stopping is not allowed from the desk on this PC: it is set on the EFB there (Ground › Simulator PC › Broadcast)');
      try { await this.o.obs.req(OUT[op]); this.statsAt = 0; setTimeout(() => this.stats(), 800); this.o.log('The broadcast desk: ' + { start: 'started the stream', stop: 'stopped the stream', recstart: 'started the recording', recstop: 'stopped the recording' }[op] + '.'); return ack(''); }
      catch (e) { return ack(e.message); }
    }
    return ack('Not something the desk can do');
  }
  stop() { this.want = false; this.leave(''); }
}

module.exports = { Desk, phaseRaw, PHASES };
