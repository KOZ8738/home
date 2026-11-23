/* Polaris Navdata for MSFS 2020 and 2024: the live values for the EFB's Backup PFD and its landing rate, for Ground
   (GSX Pro) and for the OOOI times, read through SimConnect, so FSUIPC is not needed for them. Two data definitions on
   the user aircraft, each asked for only while an EFB wants it:
   - the PFD's, every third simulator frame (sent on at most 15 times a second), as frames in the units the EFB reads
     from FSUIPC (bpDecode in the EFB; the same fields as frameOf in xplane.js);
   - Ground's, once a second: GSX Pro's L:vars (an external SimConnect client can read L:vars since MSFS 2020 SU12, and
     in MSFS 2024) and what the OOOI times need (on the ground, ground speed, parking brake, engines, fuel, aircraft).
   Both come in tagged form (each value with its id): a variable the simulator does not know is left out instead of
   shifting the others. */
'use strict';

const DEF = { PFD: 501, GND: 502 }, REQ = { PFD: 601, GND: 602 };
/* [key, simulation variable, units] (all as FLOAT64) */
const PFD = [
  ['pitch', 'PLANE PITCH DEGREES', 'degrees'], ['bank', 'PLANE BANK DEGREES', 'degrees'],
  ['hm', 'PLANE HEADING DEGREES MAGNETIC', 'degrees'], ['ht', 'PLANE HEADING DEGREES TRUE', 'degrees'], ['trk', 'GPS GROUND TRUE TRACK', 'degrees'],
  ['ias', 'AIRSPEED INDICATED', 'knots'], ['tas', 'AIRSPEED TRUE', 'knots'], ['gs', 'GROUND VELOCITY', 'knots'], ['vs', 'VERTICAL SPEED', 'feet per minute'],
  ['alt', 'INDICATED ALTITUDE', 'feet'], ['qnh', 'KOHLSMAN SETTING MB', 'millibars'], ['ra', 'RADIO HEIGHT', 'feet'],
  ['ball', 'TURN COORDINATOR BALL', 'position 128'], ['mach', 'AIRSPEED MACH', 'mach'], ['gnd', 'SIM ON GROUND', 'bool'],
  ['la', 'PLANE LATITUDE', 'degrees'], ['lo', 'PLANE LONGITUDE', 'degrees'], ['oat', 'AMBIENT TEMPERATURE', 'celsius'],
  ['wsp', 'AMBIENT WIND VELOCITY', 'knots'], ['wd', 'AMBIENT WIND DIRECTION', 'degrees'], ['gf', 'G FORCE', 'gforce'],
  ['td', 'PLANE TOUCHDOWN NORMAL VELOCITY', 'feet per minute'],
];
/* GSX Pro's L:vars, by the keys the EFB uses for them (GX_L in the EFB) */
const GSX = [['coua', 'FSDT_GSX_COUATL_STARTED'], ['board', 'FSDT_GSX_BOARDING_STATE'], ['deboard', 'FSDT_GSX_DEBOARDING_STATE'], ['cater', 'FSDT_GSX_CATERING_STATE'],
  ['fuel', 'FSDT_GSX_REFUELING_STATE'], ['dep', 'FSDT_GSX_DEPARTURE_STATE'], ['deice', 'FSDT_GSX_DEICING_STATE'], ['cargoB', 'FSDT_GSX_BOARDING_CARGO_PERCENT'],
  ['cargoD', 'FSDT_GSX_DEBOARDING_CARGO_PERCENT'], ['hose', 'FSDT_GSX_FUELHOSE_CONNECTED'], ['deice2', 'FSDT_GSX_DEICE_STATE'],
  ['paxB', 'FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL'], ['paxD', 'FSDT_GSX_NUMPASSENGERS_DEBOARDING_TOTAL'], ['pax', 'FSDT_GSX_NUMPASSENGERS']];
const GND = [['gnd', 'SIM ON GROUND', 'bool'], ['kt', 'GROUND VELOCITY', 'knots'], ['pbrk', 'BRAKE PARKING POSITION', 'bool'], ['fob', 'FUEL TOTAL QUANTITY WEIGHT', 'pounds'],
  ['e1', 'GENERAL ENG COMBUSTION:1', 'bool'], ['e2', 'GENERAL ENG COMBUSTION:2', 'bool'], ['e3', 'GENERAL ENG COMBUSTION:3', 'bool'], ['e4', 'GENERAL ENG COMBUSTION:4', 'bool'],
  ...GSX.map(([k, l]) => ['x.' + k, 'L:' + l, 'number'])];
const wrap = (a) => ((a % 360) + 360) % 360;
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fx = (v, d) => +v.toFixed(d);

/* one PFD frame from the last values (td: the touchdown vertical speed, given as tdv for 5 s after it) */
function frameOf(v, now, td) {
  const ht = n(v.ht), hm = n(v.hm), mv = ht != null && hm != null ? wrap180(ht - hm) : 0, gs = n(v.gs) || 0;
  const la = n(v.la), lo = n(v.lo), pos = la != null && lo != null && (la || lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180;
  return {
    /* MSFS's pitch is positive nose down and its bank positive to the left (as FSUIPC's): the EFB's are the other way */
    t: now, p: fx(-(n(v.pitch) || 0), 2), b: fx(-(n(v.bank) || 0), 2), h: fx(wrap(hm != null ? hm : (ht || 0) - mv), 2),
    k: gs > 1 && n(v.trk) != null ? fx(wrap(v.trk - mv), 1) : null,
    ias: fx(n(v.ias) || 0, 1), tas: Math.round(n(v.tas) || 0), gs: Math.round(gs), vs: Math.round(n(v.vs) || 0),
    alt: Math.round(n(v.alt) || 0), qnh: fx(n(v.qnh) || 1013.25, 1), ra: Math.round(n(v.ra) || 0),
    ball: fx(Math.max(-1, Math.min(1, (n(v.ball) || 0) / 127)), 2), m: fx(n(v.mach) || 0, 3), g: Number(v.gnd) ? 1 : 0,
    la: pos ? fx(la, 5) : null, lo: pos ? fx(lo, 5) : null, mv: fx(mv, 1), oat: fx(n(v.oat) || 0, 1),
    wsp: Math.round(n(v.wsp) || 0), wd: Math.round(wrap(n(v.wd) || 0)), gf: fx(n(v.gf) != null ? v.gf : 1, 2),
    tdv: td && now - td.at < 5000 ? td.v : 0,
  };
}

class MsfsLive {
  /* handle: node-simconnect's connection; SC: the node-simconnect module (its enums and constants);
     o = { onFrame(frame), onGsx({ v, g }), log(), now() } */
  constructor(handle, SC, o = {}) {
    this.h = handle; this.SC = SC; this.onFrame = o.onFrame || (() => {}); this.onGsx = o.onGsx || (() => {}); this.log = o.log || (() => {});
    this.now = o.now || Date.now; this.fast = false; this.gsx = false; this.vals = {}; this.td = null; this.prevGnd = null; this.prevTd = null; this.airVs = 0; this.sentAt = 0;
    this.keys = { [DEF.PFD]: PFD, [DEF.GND]: GND }; this.sent = new Map(); this.bad = new Set();
    this.define();
    handle.on('simObjectData', (r) => { try { this.onData(r); } catch (e) { this.log('MSFS values: ' + e.message); } });
    handle.on('exception', (x) => { const nm = this.sent.get(x && x.sendId); if (nm && !this.bad.has(nm)) { this.bad.add(nm); this.log('MSFS does not give ' + nm + ' (SimConnect exception ' + x.exception + '): left out'); } });
  }
  define() {
    const T = this.SC.SimConnectDataType;
    for (const [def, list] of [[DEF.PFD, PFD], [DEF.GND, GND]]) {
      list.forEach(([, name, unit], i) => { const id = this.h.addToDataDefinition(def, name, unit, T.FLOAT64, 0, i); this.sent.set(id, name); });
    }
    /* the aircraft's title last (index after the numbers) */
    const id = this.h.addToDataDefinition(DEF.GND, 'TITLE', null, T.STRING256, 0, GND.length); this.sent.set(id, 'TITLE');
  }
  /* fast: the PFD's values; gsx: Ground's. Asked for, or stopped, only when that changes */
  want(fast, gsx) {
    const P = this.SC.SimConnectPeriod, F = this.SC.DataRequestFlag.DATA_REQUEST_FLAG_TAGGED, U = this.SC.SimConnectConstants.OBJECT_ID_USER;
    if (!!fast !== this.fast) {
      this.fast = !!fast; this.vals = {}; this.td = null; this.prevGnd = null;
      this.h.requestDataOnSimObject(REQ.PFD, DEF.PFD, U, fast ? P.SIM_FRAME : P.NEVER, F, 0, fast ? 2 : 0, 0);
    }
    if (!!gsx !== this.gsx) { this.gsx = !!gsx; this.h.requestDataOnSimObject(REQ.GND, DEF.GND, U, gsx ? P.SECOND : P.NEVER, F, 0, 0, 0); }
  }
  stop() { try { this.want(false, false); } catch (e) { /* closed */ } }
  /* tagged data: datum id, then its value, for each value the simulator gave */
  read(r) {
    const L = this.keys[r.defineID], out = {};
    for (let i = 0; i < r.defineCount; i++) {
      const id = r.data.readUint32();
      if (id === L.length) out.title = r.data.readString256().trim();
      else { const v = r.data.readFloat64(); if (L[id]) out[L[id][0]] = v; }
    }
    return out;
  }
  onData(r) {
    if (r.requestID === REQ.PFD && this.fast) {
      const v = Object.assign(this.vals, this.read(r)), now = this.now(), g = Number(v.gnd) ? 1 : 0;
      /* touchdown: the vertical speed the simulator gives for it, or else the last one in the air */
      if (this.prevGnd === 0 && g === 1) this.td = { v: Math.round(this.airVs), at: now, td0: this.prevTd };
      if (this.td && now - this.td.at < 1000 && n(v.td) && v.td !== this.td.td0) { this.td.v = -Math.round(Math.abs(v.td)); this.td.td0 = v.td; }
      if (!g) this.airVs = n(v.vs) || 0;
      this.prevGnd = g; this.prevTd = n(v.td);
      if (now - this.sentAt < 60 && !(this.td && this.td.at === now)) return;
      this.sentAt = now; this.onFrame(frameOf(v, now, this.td));
    } else if (r.requestID === REQ.GND && this.gsx) {
      const v = this.read(r), x = {};
      for (const [k] of GSX) x[k] = Math.round(n(v['x.' + k]) || 0);
      this.onGsx({ v: x, g: { title: v.title || '', gnd: Number(v.gnd) ? 1 : 0, kt: fx(n(v.kt) || 0, 1), pbrk: Number(v.pbrk) ? 1 : 0,
        eng: ['e1', 'e2', 'e3', 'e4'].filter((k) => Number(v[k]) > 0).length, fob: Math.round((n(v.fob) || 0) * 0.45359237) } });
    }
  }
}

module.exports = { MsfsLive, frameOf, PFD, GND, GSX, DEF, REQ };
