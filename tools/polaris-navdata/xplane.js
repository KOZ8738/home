/* Polaris Navdata for X-Plane 12.
   - Live values (Backup PFD, landing rate, the OOOI times): read through X-Plane's own Web API (X-Plane 12.1.1 and
     later, http and ws on localhost:8086; nothing to install in the simulator). The datarefs are looked up by name once
     a flight is loaded, subscribed to over the WebSocket only while an EFB wants them (X-Plane then sends what changed,
     10 times a second), and handed to the EFB as frames in the same units as the EFB reads from FSUIPC for MSFS (see
     bpDecode in the EFB).
     /api/capabilities came with 12.1.4: before it there is only the first API (v1). With "Disable Incoming Traffic"
     (X-Plane's Settings > Network) every request is answered 403.
   - SIDs, STARs and approaches: read from the X-Plane folder's own navigation data, CIFP/<ICAO>.dat (the
     simplified ARINC 424 format, XP-CIFP 1101/1102), with fix positions from earth_fix.dat and earth_nav.dat. A data set
     installed in Custom Data (Navigraph, navdata.de) is used first, the default data otherwise. Returned in the same
     JSON as the MSFS reader (navdata.js), so the EFB draws them the same way. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const WebSocket = require('ws');

/* ---------- the X-Plane folder: --xplane, the list X-Plane keeps of its installs, or the usual places ---------- */
function installLists() {
  const home = os.homedir();
  if (process.platform === 'win32') return [path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'x-plane_install_12.txt')];
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Preferences', 'x-plane_install_12.txt')];
  return [path.join(home, '.x-plane', 'x-plane_install_12.txt')];
}
function usualPlaces() {
  const home = os.homedir(), out = [path.join(home, 'X-Plane 12'), path.join(home, 'Desktop', 'X-Plane 12')];
  if (process.platform === 'win32') for (const d of 'CDEFGH') out.push(d + ':\\X-Plane 12', d + ':\\Program Files (x86)\\Steam\\steamapps\\common\\X-Plane 12', d + ':\\SteamLibrary\\steamapps\\common\\X-Plane 12', d + ':\\Steam\\steamapps\\common\\X-Plane 12');
  else out.push(path.join(home, '.steam', 'steam', 'steamapps', 'common', 'X-Plane 12'), path.join(home, 'Library', 'Application Support', 'Steam', 'steamapps', 'common', 'X-Plane 12'), '/Applications/X-Plane 12');
  return out;
}
function findXPlane(opt) {
  const cands = [opt];
  for (const f of installLists()) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) if (l.trim()) cands.push(l.trim()); } catch (e) { /* no list */ } }
  cands.push(...usualPlaces());
  for (const p of cands.filter(Boolean)) {
    try { if (fs.existsSync(path.join(p, 'Resources', 'default data')) || fs.existsSync(path.join(p, 'Custom Data', 'CIFP'))) return path.resolve(p); } catch (e) { /* next */ }
  }
  return '';
}
/* a navigation data file: Custom Data's when there is one, else the default data's */
function dataFile(xp, rel) {
  for (const d of [path.join(xp, 'Custom Data'), path.join(xp, 'Resources', 'default data')]) { const f = path.join(d, rel); try { if (fs.existsSync(f)) return f; } catch (e) { /* next */ } }
  return '';
}

/* ---------- live values: X-Plane's Web API ---------- */
/* [key, dataref]. Units: degrees, knots (IAS, wind), m/s (TAS, GS), feet, ft/min, inHg, °C, kg */
const DR = [
  ['theta', 'sim/flightmodel/position/theta'], ['phi', 'sim/flightmodel/position/phi'], ['psi', 'sim/flightmodel/position/psi'],
  ['mpsi', 'sim/flightmodel/position/mag_psi'], ['hpath', 'sim/flightmodel/position/hpath'],
  ['ias', 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot'], ['ias2', 'sim/flightmodel/position/indicated_airspeed'],
  ['tas', 'sim/flightmodel/position/true_airspeed'], ['gs', 'sim/flightmodel/position/groundspeed'], ['vs', 'sim/flightmodel/position/vh_ind_fpm'],
  ['alt', 'sim/cockpit2/gauges/indicators/altitude_ft_pilot'], ['baro', 'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot'],
  ['ra', 'sim/cockpit2/gauges/indicators/radio_altimeter_height_ft_pilot'], ['slip', 'sim/cockpit2/gauges/indicators/slip_deg'],
  ['mach', 'sim/flightmodel/misc/machno'], ['gnd', 'sim/flightmodel/failures/onground_any'],
  ['la', 'sim/flightmodel/position/latitude'], ['lo', 'sim/flightmodel/position/longitude'],
  ['oat', 'sim/cockpit2/temperature/outside_air_temp_degc'], ['wsp', 'sim/cockpit2/gauges/indicators/wind_speed_kts'],
  ['wd', 'sim/cockpit2/gauges/indicators/wind_heading_deg_mag'], ['gf', 'sim/flightmodel/forces/g_nrml'],
  ['pbrk', 'sim/cockpit2/controls/parking_brake_ratio'], ['fob', 'sim/flightmodel/weight/m_fuel_total'],
  ['eng', 'sim/flightmodel/engine/ENGN_running'], ['icao', 'sim/aircraft/view/acf_ICAO'],
];
/* without these there is no PFD: keep waiting (X-Plane lists its datarefs once a flight is loaded) */
const NEED = ['theta', 'phi', 'mpsi', 'gs', 'la', 'lo'];
const wrap = (a) => ((a % 360) + 360) % 360;
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fx = (v, d) => (v == null ? null : +v.toFixed(d));

/* one frame for the EFB, from the last values: the fields and units of the EFB's bpDecode, plus what Ground needs (ac,
   pbrk, eng, fob). td: the vertical speed at the last touchdown ({ v, at }), given as tdv for 5 s after it */
function frameOf(v, now, td) {
  const th = n(v.psi), mh = n(v.mpsi), mv = th != null && mh != null ? wrap180(th - mh) : 0, gsms = n(v.gs) || 0;
  const ias = n(v.ias) != null ? v.ias : n(v.ias2);
  let ac = '';
  if (typeof v.icao === 'string') { try { ac = Buffer.from(v.icao, 'base64').toString('latin1').replace(/\0[\s\S]*$/, '').trim(); } catch (e) { ac = ''; } }
  const eng = Array.isArray(v.eng) ? v.eng.filter((x) => Number(x) > 0).length : n(v.eng) ? 1 : 0;
  const la = n(v.la), lo = n(v.lo), pos = la != null && lo != null && (la || lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180;
  return {
    t: now, p: fx(n(v.theta) || 0, 2), b: fx(n(v.phi) || 0, 2), h: fx(wrap(mh != null ? mh : (th || 0) - mv), 2),
    k: gsms > 1 && n(v.hpath) != null ? fx(wrap(v.hpath - mv), 1) : null,
    ias: fx(ias || 0, 1), tas: Math.round((n(v.tas) || 0) * 1.943844), gs: Math.round(gsms * 1.943844), vs: Math.round(n(v.vs) || 0),
    alt: Math.round(n(v.alt) || 0), qnh: fx((n(v.baro) || 29.92) * 33.8639, 1), ra: Math.round(n(v.ra) || 0),
    ball: fx(Math.max(-1, Math.min(1, (n(v.slip) || 0) / 8)), 2), m: fx(n(v.mach) || 0, 3), g: Number(v.gnd) ? 1 : 0,
    la: pos ? fx(la, 5) : null, lo: pos ? fx(lo, 5) : null, mv: fx(mv, 1), oat: fx(n(v.oat) || 0, 1),
    /* the EFB's wind is the direction it blows from, true (FSUIPC's): X-Plane gives it magnetic */
    wsp: Math.round(n(v.wsp) || 0), wd: Math.round(wrap((n(v.wd) || 0) + mv)), gf: fx(n(v.gf) != null ? v.gf : 1, 2),
    tdv: td && now - td.at < 5000 ? td.v : 0,
    ac, pbrk: (n(v.pbrk) || 0) > 0.5 ? 1 : 0, eng, fob: Math.round(n(v.fob) || 0),
  };
}

class XpLink {
  /* o = { port (8086), onState(), onFrame(frame), log() } */
  constructor(o = {}) {
    this.port = o.port || 8086; this.onState = o.onState || (() => {}); this.onFrame = o.onFrame || (() => {}); this.log = o.log || (() => {});
    this.st = 'off'; this.ver = ''; this.api = ''; this.err = ''; this.ids = {}; this.byId = {}; this.vals = {}; this.td = null; this.ws = null; this.timer = null; this.tick = null; this.said = '';
    this.wantLive = false; this.req = 10; this.seenAt = Date.now();
  }
  get on() { return this.st === 'on'; }
  name() { return 'X-Plane ' + (this.ver || '12'); }
  start() { this.probe(); }
  /* an EFB wants the live values (or none does any more): subscribed, or unsubscribed, while connected */
  want(on) {
    on = !!on; if (on === this.wantLive) return; this.wantLive = on;
    if (this.ws && this.ws.readyState === 1) { if (on) this.subscribe(this.ws); else this.unsubscribe(this.ws); }
  }
  subscribe(w) {
    this.vals = {}; this.td = null;
    w.send(JSON.stringify({ req_id: 1, type: 'dataref_subscribe_values', params: { datarefs: Object.values(this.ids).map((id) => ({ id })) } }));
    /* a steady 10 a second for the EFB while it wants them, even while nothing changes (X-Plane sends only what changed) */
    clearInterval(this.tick); this.tick = setInterval(() => { if (this.ws === w && this.wantLive && Object.keys(this.vals).length) this.onFrame(frameOf(this.vals, Date.now(), this.td)); }, 100);
  }
  unsubscribe(w) { clearInterval(this.tick); this.tick = null; this.vals = {}; this.td = null; try { w.send(JSON.stringify({ req_id: 2, type: 'dataref_unsubscribe_values', params: { datarefs: 'all' } })); } catch (e) { /* closed */ } }
  /* X-Plane not there: looked for every 5 s at first, every 15 s once it has not been seen for 2 minutes */
  later() { return Date.now() - this.seenAt < 120000 ? 5000 : 15000; }
  stop() { clearTimeout(this.timer); clearInterval(this.tick); this.tick = null; const w = this.ws; this.ws = null; if (w) try { w.close(); } catch (e) { /* closed */ } }
  base() { return 'http://localhost:' + this.port; }
  async get(p) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 4000);
    /* an answer that is not OK carries its status (X-Plane is there); no answer at all has none (X-Plane is not) */
    try { const r = await fetch(this.base() + p, { headers: { Accept: 'application/json' }, signal: ac.signal }); if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; } return await r.json(); }
    finally { clearTimeout(t); }
  }
  set(st, err) { const ch = st !== this.st || (err || '') !== this.err; this.st = st; this.err = err || ''; if (ch) this.onState(); }
  say(msg) { if (msg !== this.said) { this.said = msg; this.log(msg); } }
  async probe() {
    clearTimeout(this.timer);
    let cap = null;
    try { cap = await this.get('/api/capabilities'); }
    catch (e) {
      if (!e.status) { if (this.st !== 'off') { this.say('X-Plane closed. Waiting for it again...'); this.seenAt = Date.now(); } this.set('off'); this.timer = setTimeout(() => this.probe(), this.later()); return; }
      if (e.status === 403) { this.ver = this.ver || '12'; const m = 'its Web API is turned off: in X-Plane, Settings > Network, untick Disable Incoming Traffic'; this.set('wait', m); this.say('X-Plane: ' + m); this.timer = setTimeout(() => this.probe(), 5000); return; }
      /* 12.1.1 to 12.1.3: no capabilities yet, the first API only */
    }
    this.seenAt = Date.now();
    const vs = (cap && cap.api && cap.api.versions) || ['v1'];
    this.api = ['v3', 'v2', 'v1'].find((v) => vs.includes(v)) || 'v1';
    this.ver = String((cap && cap['x-plane'] && cap['x-plane'].version) || '12');
    try {
      await this.lookup();
      await this.open();
    } catch (e) {
      this.set('wait', e.message); this.say('X-Plane ' + this.ver + ': ' + e.message);
      this.timer = setTimeout(() => this.probe(), 5000);
    }
  }
  /* each dataref's id, by its name (ids hold for the X-Plane session) */
  async lookup() {
    this.ids = {}; this.byId = {};
    await Promise.all(DR.map(async ([k, name]) => {
      try { const j = await this.get('/api/' + this.api + '/datarefs?filter[name]=' + name); const d = j && Array.isArray(j.data) && j.data.find((x) => x.name === name); if (d) { this.ids[k] = d.id; this.byId[String(d.id)] = k; } }
      catch (e) { /* that one is missing */ }
    }));
    const miss = NEED.filter((k) => this.ids[k] == null);
    if (miss.length === NEED.length) throw new Error('waiting for a flight to load');
    if (miss.length) throw new Error('missing ' + miss.map((k) => DR.find((d) => d[0] === k)[1]).join(', '));
  }
  open() {
    return new Promise((resolve, reject) => {
      const w = new WebSocket('ws://localhost:' + this.port + '/api/' + this.api);
      let opened = false;
      w.on('open', () => {
        opened = true; this.ws = w; this.vals = {}; this.td = null;
        if (this.wantLive) this.subscribe(w);
        this.set('on'); this.say('Connected to ' + this.name() + ' (Web API ' + this.api + ')');
        resolve();
      });
      w.on('message', (raw) => {
        let j; try { j = JSON.parse(String(raw)); } catch (e) { return; }
        if (j.type === 'dataref_update_values' && j.data && typeof j.data === 'object' && this.wantLive) {
          /* touchdown: the vertical speed X-Plane last gave in the air (at most a tenth of a second before the wheels touch) */
          const air = this.vals.gnd != null && !Number(this.vals.gnd), vs = this.vals.vs;
          for (const [id, val] of Object.entries(j.data)) { const k = this.byId[id]; if (k) this.vals[k] = val; }
          if (air && Number(this.vals.gnd)) this.td = { v: Math.round(n(vs) || 0), at: Date.now() };
        } else if (j.type === 'result' && j.success === false) {
          /* one id it does not know spoils the whole set: ask for each on its own, so the others still come */
          if (j.req_id === 1 && this.wantLive) { let i = 100; for (const id of Object.values(this.ids)) w.send(JSON.stringify({ req_id: i++, type: 'dataref_subscribe_values', params: { datarefs: [{ id }] } })); }
          else if (j.req_id >= 100) this.say('X-Plane refused one value: ' + (j.error_message || j.error_code || 'subscribe'));
        }
      });
      w.on('error', (e) => { if (!opened) reject(new Error('no WebSocket: ' + (e && e.message))); });
      w.on('close', () => {
        if (this.ws === w) { this.ws = null; clearInterval(this.tick); this.tick = null; this.set('off'); this.say('X-Plane closed the connection. Trying again...'); this.timer = setTimeout(() => this.probe(), 3000); }
        else if (!opened) reject(new Error('the WebSocket closed'));
      });
    });
  }
}

/* ---------- procedures: CIFP ---------- */
const LEGS = new Set(['IF', 'TF', 'CF', 'DF', 'FA', 'FC', 'FD', 'FM', 'CA', 'CD', 'CI', 'CR', 'RF', 'AF', 'VA', 'VD', 'VI', 'VM', 'VR', 'PI', 'HA', 'HF', 'HM']);
/* N22191800 · E114114600: hemisphere, degrees, minutes, seconds and hundredths */
function lat(s) { const m = String(s || '').trim().match(/^([NS])(\d{2})(\d{2})(\d{2})(\d{2})$/); if (!m) return null; const v = +m[2] + +m[3] / 60 + (+m[4] + +m[5] / 100) / 3600; return m[1] === 'S' ? -v : v; }
function lon(s) { const m = String(s || '').trim().match(/^([EW])(\d{3})(\d{2})(\d{2})(\d{2})$/); if (!m) return null; const v = +m[2] + +m[3] / 60 + (+m[4] + +m[5] / 100) / 3600; return m[1] === 'W' ? -v : v; }
/* "05000" or "FL100", in feet */
function alt(s) { s = String(s || '').trim(); if (!s) return null; let m = s.match(/^FL(\d{2,3})$/); if (m) return +m[1] * 100; m = s.match(/^-?\d{1,5}$/); return m ? +s : null; }
/* ARINC 424 altitude description, as the EFB reads MSFS's: 1 at, 2 at or above, 3 at or below, 4 between (a1 the top) */
function altDesc(c, a1, a2) {
  c = String(c || '').trim();
  if (c === 'B') { if (a1 != null && a2 != null) return { ad: 4, a1: Math.max(a1, a2), a2: Math.min(a1, a2) }; c = ''; }
  if (c === 'C') return a2 != null ? { ad: 2, a1: a2 } : null;
  if (a1 == null) return null;
  if (c === '+' || c === 'H' || c === 'J' || c === 'V') return { ad: 2, a1 };
  if (c === '-' || c === 'Y') return { ad: 3, a1 };
  return { ad: 1, a1 };
}
/* section and subsection: the fix's kind, as MSFS writes it (W waypoint, V VOR, N NDB, A airport, R runway) */
function fixType(sec, sub) {
  if (sec === 'D') return sub === 'B' ? 'N' : 'V';
  if (sec === 'P') return sub === 'G' ? 'R' : sub === 'N' ? 'N' : sub === 'A' ? 'A' : sub === 'I' ? 'V' : 'W';
  return 'W';
}
/* RW16C, RW07B (both parallels), RW08T (a runway named by its true heading, as in Greenland and Antarctica) */
const rwyName = (s) => { const m = String(s || '').trim().toUpperCase().match(/^RW(\d{2})([LRCBWT]?)$/); return m ? m[1] + m[2] : ''; };
const opposite = (r) => { const m = r.match(/^(\d{2})([LRCT]?)$/); if (!m) return ''; const k = ((+m[1] + 17) % 36) + 1; return String(k).padStart(2, '0') + ({ L: 'R', R: 'L', C: 'C', T: 'T' }[m[2]] || ''); };
function dist(a, b) { const R = Math.PI / 180, x = Math.sin((b[0] - a[0]) * R / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin((b[1] - a[1]) * R / 2) ** 2; return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(x))); }
function brg(a, b) { const R = Math.PI / 180, y = Math.sin((b[1] - a[1]) * R) * Math.cos(b[0] * R), x = Math.cos(a[0] * R) * Math.sin(b[0] * R) - Math.sin(a[0] * R) * Math.cos(b[0] * R) * Math.cos((b[1] - a[1]) * R); return wrap(Math.atan2(y, x) / R); }

/* SID route types: runway transition, common route, en-route transition (ARINC 424 5.7) */
const SID_RT = { rt: '14FT', c: '25M', et: '36SV' }, STAR_RT = { et: '147F', c: '258M', rt: '369S' };
const kindOf = (T, rt) => (T.rt.includes(rt) ? 'rt' : T.c.includes(rt) ? 'c' : T.et.includes(rt) ? 'et' : '');
/* approach route type letter -> [name, MSFS-style id letter] */
const APP_T = { I: ['ILS', 'I'], L: ['LOC', 'L'], B: ['LOC BC', 'B'], R: ['RNAV', 'R'], H: ['RNAV', 'R'], P: ['GPS', 'G'], F: ['RNAV', 'R'], D: ['VOR/DME', 'D'], S: ['VOR/DME', 'D'],
  V: ['VOR', 'V'], N: ['NDB', 'N'], Q: ['NDB/DME', 'Q'], X: ['LDA', 'X'], U: ['SDF', 'U'], G: ['IGS', 'X'], J: ['GLS', 'J'], T: ['TACAN', 'T'], M: ['MLS', 'M'], W: ['MLS', 'M'], Y: ['MLS', 'M'] };

class CifpReader {
  constructor(xp) { this.xp = xp; this.fix = null; this.nav = null; this.apt = null; this.cycle = ''; }
  /* earth_fix.dat and earth_nav.dat, once: ident -> [[lat, lon, airport or ENRT, region]] */
  load() {
    if (this.fix) return;
    this.fix = new Map(); this.nav = new Map();
    const each = (f, fn) => { if (!f) return; const t = fs.readFileSync(f, 'latin1'); let i = 0; while (i < t.length) { let j = t.indexOf('\n', i); if (j < 0) j = t.length; fn(t.slice(i, j)); i = j + 1; } };
    each(dataFile(this.xp, 'earth_fix.dat'), (l) => {
      if (!this.cycle) { const c = l.match(/data cycle (\d{4})/i); if (c) this.cycle = c[1]; }
      const p = l.trim().split(/\s+/); if (p.length < 5) return;
      const la = +p[0], lo = +p[1]; if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90) return;
      const k = p[2]; let a = this.fix.get(k); if (!a) this.fix.set(k, (a = [])); a.push([la, lo, p[3], p[4]]);
    });
    each(dataFile(this.xp, 'earth_nav.dat'), (l) => {
      const p = l.trim().split(/\s+/), code = +p[0]; if (p.length < 10 || ![2, 3, 12, 13].includes(code)) return;
      const la = +p[1], lo = +p[2]; if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
      const k = p[7]; let a = this.nav.get(k); if (!a) this.nav.set(k, (a = [])); a.push([la, lo, p[8], p[9], code === 2 ? 'N' : code === 3 ? 'V' : 'D']);
    });
    /* X-Plane 12's airport reference points: ICAO, region, latitude, longitude, ... (not in X-Plane 11's data) */
    this.apt = new Map();
    each(dataFile(this.xp, 'earth_aptmeta.dat'), (l) => {
      const p = l.trim().split(/\s+/); if (p.length < 4 || !/^[A-Z0-9]{3,7}$/.test(p[0])) return;
      const la = +p[2], lo = +p[3]; if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && (la || lo)) this.apt.set(p[0], [la, lo]);
    });
  }
  /* with no reference point and no runway thresholds: the middle of the airport's own terminal waypoints */
  terminalMiddle(icao) {
    let n = 0, la = 0, lo = 0;
    for (const L of this.fix.values()) for (const x of L) if (x[2] === icao) { n++; la += x[0]; lo += x[1]; }
    return n ? [la / n, lo / n] : null;
  }
  file(icao) { return dataFile(this.xp, path.join('CIFP', icao + '.dat')); }
  airport(icao) {
    icao = String(icao || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{3,4}$/.test(icao)) throw new Error('Not an airport code: ' + icao);
    const f = this.file(icao); if (!f) throw new Error(icao + ' has no procedures in X-Plane’s navigation data');
    this.load();
    return build(icao, fs.readFileSync(f, 'latin1'), this);
  }
  /* a fix's position: the runway thresholds and the airport for P/G and P/A, the navaids for D and P/N, the fixes for
     the rest; of several with the name, the one in the region (and the airport's terminal area), nearest the airport */
  pos(ident, rg, sec, sub, ctx) {
    if (!ident) return null;
    /* a runway is the airport's own: never one of the same name elsewhere (with no threshold given, no position) */
    if (sec === 'P' && sub === 'G') {
      const r = ctx.rw.get(rwyName(ident)); if (r) return [r.la, r.lo];
      const T = (this.fix.get(ident) || []).filter((x) => x[2] === ctx.icao); return T.length ? [T[0][0], T[0][1]] : null;
    }
    if (sec === 'P' && sub === 'A' && ident === ctx.icao && ctx.ref) return ctx.ref;
    const navFirst = sec === 'D' || (sec === 'P' && (sub === 'N' || sub === 'I'));
    const lists = navFirst ? [this.nav.get(ident), this.fix.get(ident)] : [this.fix.get(ident), this.nav.get(ident)];
    for (const L of lists) {
      if (!L || !L.length) continue;
      let C = L.filter((x) => !rg || x[3] === rg); if (!C.length) C = L;
      if (sec === 'P') { const T = C.filter((x) => x[2] === ctx.icao); if (T.length) C = T; }
      if (navFirst && sub === 'B') { const N = C.filter((x) => x[4] === 'N'); if (N.length) C = N; }
      else if (navFirst && sec === 'D') { const V = C.filter((x) => x[4] === 'V'); if (V.length) C = V; }
      if (ctx.ref && C.length > 1) C = C.slice().sort((a, b) => dist(ctx.ref, a) - dist(ctx.ref, b));
      return [C[0][0], C[0][1]];
    }
    return null;
  }
}

/* one record's fields into a leg, as navdata.js's leg() writes it */
function leg(F, R, ctx) {
  const o = { t: (F[11] || '').trim() };
  const fix = (F[4] || '').trim();
  if (fix) {
    const sec = (F[6] || '').trim(), sub = (F[7] || '').trim();
    o.f = fix; o.rg = (F[5] || '').trim(); o.ty = fixType(sec, sub);
    const c = R.pos(fix, o.rg, sec, sub, ctx); if (c) { o.la = +c[0].toFixed(6); o.lo = +c[1].toFixed(6); }
  }
  const crs = (F[20] || '').trim();
  if (/^\d{3}T$/.test(crs)) { o.c = +crs.slice(0, 3); o.tc = 1; } else if (/^\d{4}$/.test(crs)) o.c = +(+crs / 10).toFixed(1);
  const d = (F[21] || '').trim();
  if (/^T\d{3}$/.test(d)) { o.d = +(+d.slice(1) / 10).toFixed(1); o.min = 1; } else if (/^\d{4}$/.test(d)) o.d = +(+d / 10).toFixed(1);
  const tn = (F[9] || '').trim(); if (tn === 'L' || tn === 'R') o.tn = tn;
  if ((F[8] || '')[1] === 'Y') o.fo = 1;
  const ad = altDesc(F[22], alt(F[23]), alt(F[24])); if (ad) Object.assign(o, ad);
  const sp = parseInt(F[27], 10); if (sp > 0) o.sp = sp;
  const cf = (F[30] || '').trim();
  if (cf && o.t === 'RF') { const c = R.pos(cf, (F[31] || '').trim(), (F[32] || '').trim(), (F[33] || '').trim(), ctx); if (c) o.ac = [+c[0].toFixed(6), +c[1].toFixed(6)]; }
  return o;
}

/* an approach's runway and multiple indicator from its identifier: I16C, R16C-Y or R16CY, R16-Y, I36-1, D14L1, I08TX
   (runway 08T), and circling ones with no runway: VORA, RNVB, NDB1. A letter after the number that is not one of the
   airport's runways is the multiple indicator (R08C: RNAV C to 08); with no runway in the identifier, the runway the
   final approach ends at */
function aprRunway(id, names, fin) {
  let m = id.match(/^[A-Z](\d{2})([LRCT]?)(-?)([A-Z0-9]?)$/);
  if (m) {
    if (m[2] && !m[3] && !m[4] && names.size && !names.has(m[1] + m[2]) && names.has(m[1])) return { rw: m[1], sfx: m[2] };
    return { rw: m[1] + m[2], sfx: m[4] };
  }
  m = id.match(/^[A-Z]{3}([A-Z0-9])$/); if (m) return { rw: '', sfx: m[1] };
  const g = fin.find((r) => (r.F[6] || '').trim() === 'P' && (r.F[7] || '').trim() === 'G');
  return { rw: g ? rwyName(g.F[4]) : '', sfx: ((id.match(/-([A-Z0-9])$/) || [])[1] || '') };
}

/* CIFP/<ICAO>.dat into navdata.js's airport object: { v, icao, la, lo, mv, rw, dep, arr, apr, at } */
function build(icao, text, R) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  /* runways first: their thresholds place the airport and the runway fixes */
  const rwy = new Map(), names = new Set(), arp = R.apt && R.apt.get(icao);
  for (const l of lines) {
    if (!l.startsWith('RWY:')) continue;
    const body = l.slice(4).replace(/;\s*$/, ''), [a, b] = body.split(';'), F = a.split(','), G = (b || '').split(',');
    const nm = rwyName(F[0]), la = lat(G[0]), lo = lon(G[1]); if (nm) names.add(nm);
    /* (some runways have no threshold in the data; and a threshold far from the airport's reference point is
       another airport's, a slip in the data) */
    if (nm && la != null && lo != null && !(arp && dist(arp, [la, lo]) > 15)) rwy.set(nm, { n: nm, la: +la.toFixed(6), lo: +lo.toFixed(6), dt: parseInt(G[2], 10) || 0 });
  }
  /* the airport: its reference point (X-Plane 12), or the middle of its runway thresholds, or of its terminal waypoints */
  const R0 = [...rwy.values()];
  const ref = arp || (R0.length ? [R0.reduce((s, r) => s + r.la, 0) / R0.length, R0.reduce((s, r) => s + r.lo, 0) / R0.length] : (R.terminalMiddle && R.terminalMiddle(icao)) || null);
  const ctx = { icao, rw: rwy, ref };
  /* each runway end: true heading and length from the threshold at the other end */
  const rw = R0.map((r) => {
    const o = rwy.get(opposite(r.n)), num = +r.n.slice(0, 2);
    const h = o ? brg([r.la, r.lo], [o.la, o.lo]) : (num * 10) % 360, len = o ? Math.round(dist([r.la, r.lo], [o.la, o.lo]) * 6076.12 + (o.dt || 0)) : 0;
    return { n: r.n, la: r.la, lo: r.lo, h: +h.toFixed(1), len };
  }).sort((x, y) => x.n.localeCompare(y.n));
  const out = { v: 1, icao, la: ref ? +ref[0].toFixed(6) : 0, lo: ref ? +ref[1].toFixed(6) : 0, mv: 0, rw, dep: [], arr: [], at: Date.now(), src: 'X-Plane' };
  if (R.cycle) out.cy = R.cycle;
  /* procedures: their records in sequence */
  const S = new Map(), A = new Map();
  for (const l of lines) {
    const m = l.match(/^(SID|STAR|APPCH):(.*?);?$/); if (!m) continue;
    const F = m[2].split(','); if (F.length < 22) continue;
    const t = (F[11] || '').trim(); if (!LEGS.has(t)) continue;
    const k = m[1], id = (F[2] || '').trim(), rt = (F[1] || '').trim(), tr = (F[3] || '').trim(), seq = parseInt(F[0], 10) || 0;
    if (!id) continue;
    if (k === 'APPCH') { let p = A.get(id); if (!p) A.set(id, (p = [])); p.push({ rt, tr, seq, F }); }
    else { const key = k + '|' + id; let p = S.get(key); if (!p) S.set(key, (p = { k, id, recs: [] })); p.recs.push({ rt, tr, seq, F }); }
  }
  const legsOf = (recs) => recs.slice().sort((x, y) => x.seq - y.seq).map((r) => leg(r.F, R, ctx));
  for (const p of S.values()) {
    const T = p.k === 'SID' ? SID_RT : STAR_RT, o = { n: p.id, c: [], rt: {}, et: {} }, parts = new Map();
    for (const r of p.recs) {
      const kind = kindOf(T, r.rt); if (!kind) continue;
      const key = kind === 'c' ? 'c' : kind + '|' + (kind === 'rt' ? (rwyName(r.tr) || (r.tr === 'ALL' || !r.tr ? 'ALL' : r.tr)) : r.tr || '?');
      let a = parts.get(key); if (!a) parts.set(key, (a = [])); a.push(r);
    }
    for (const [key, recs] of parts) {
      const L = legsOf(recs);
      if (key === 'c') o.c = L; else { const [kind, name] = key.split('|'); o[kind][name] = L; }
    }
    /* RW07B is both 07L and 07R (and 07C): listed under each that has no transition of its own */
    for (const k of Object.keys(o.rt)) {
      const b = k.match(/^(\d{2})B$/); if (!b) continue; let n = 0;
      for (const d of ['L', 'R', 'C']) if (names.has(b[1] + d)) { n++; if (!o.rt[b[1] + d]) o.rt[b[1] + d] = o.rt[k]; }
      if (n) delete o.rt[k];
    }
    /* (an engine-out SID has none of these parts: not listed) */
    if (o.c.length || Object.keys(o.rt).length || Object.keys(o.et).length) (p.k === 'SID' ? out.dep : out.arr).push(o);
  }
  /* approaches: transitions (route type A), then the final approach, which carries its missed approach: from the leg
     marked as its first (the description's third letter M), or else from the leg after the missed approach point
     (fourth letter M) */
  for (const [id, recs] of A) {
    const fin = recs.filter((r) => r.rt !== 'A' && r.rt !== 'Z'), trs = recs.filter((r) => r.rt === 'A'), miss = recs.filter((r) => r.rt === 'Z');
    if (!fin.length) continue;
    const type = fin[0].rt, T = APP_T[type] || ['APP', 'A'], { rw: rwn, sfx } = aprRunway(id, names, fin);
    const sorted = fin.slice().sort((x, y) => x.seq - y.seq), map = sorted.findIndex((r) => (r.F[8] || '')[3] === 'M');
    let mi = sorted.findIndex((r) => (r.F[8] || '')[2] === 'M'); if (mi < 0 && map >= 0) mi = map + 1;
    const f = (mi >= 0 ? sorted.slice(0, mi) : sorted).map((r) => leg(r.F, R, ctx));
    const m = [...(mi >= 0 ? sorted.slice(mi) : []), ...miss.sort((x, y) => x.seq - y.seq)].map((r) => leg(r.F, R, ctx));
    const o = { n: T[0] + (sfx ? ' ' + sfx : '') + (rwn ? ' RW' + rwn : ''), id: T[1] + rwn + (sfx ? '-' + sfx : ''), ty: T[0], rw: rwn || 'ALL', sfx, f, m, tr: {} };
    const byTr = new Map(); for (const r of trs) { const k = r.tr || 'T' + byTr.size; let a = byTr.get(k); if (!a) byTr.set(k, (a = [])); a.push(r); }
    for (const [k, rs] of byTr) o.tr[k] = legsOf(rs);
    const top = m.filter((g) => g.a1).map((g) => g.a1); if (top.length) o.ma = Math.max(...top);
    if (o.f.length) (out.apr = out.apr || []).push(o);
  }
  if (out.apr) out.apr.sort((x, y) => x.rw.localeCompare(y.rw) || x.n.localeCompare(y.n));
  out.dep.sort((x, y) => x.n.localeCompare(y.n)); out.arr.sort((x, y) => x.n.localeCompare(y.n));
  return out;
}

module.exports = { XpLink, CifpReader, findXPlane, frameOf, build, DR, lat, lon, alt, altDesc };
