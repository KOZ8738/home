/* MSFS's live values through SimConnect (msfs.js), without MSFS: a stand-in connection takes the data definitions and
   sends tagged data the way SimConnect does. With node-simconnect installed (the Windows build) its own enums and
   RawBuffer are used, so the names msfs.js relies on are checked too. node test_msfs.js */
'use strict';
const EventEmitter = require('events');
const { MsfsLive, PFD, GND, GSX, DEF, REQ } = require('./msfs');
let ok = true; const ck = (name, cond, extra) => { ok = ok && !!cond; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); };

/* node-simconnect when installed; a stand-in with the same enums and buffer calls otherwise */
let SC = null, real = false;
try { SC = require('node-simconnect'); real = true; } catch (e) {
  class RawBuffer {
    constructor(n) { this.b = Buffer.alloc(typeof n === 'number' ? n : n.length); if (typeof n !== 'number') n.copy(this.b); this.o = 0; }
    writeInt32(v) { this.b.writeInt32LE(v, this.o); this.o += 4; } writeFloat64(v) { this.b.writeDoubleLE(v, this.o); this.o += 8; }
    writeString256(v) { const x = Buffer.alloc(256); x.write(v || '', 'latin1'); x.copy(this.b, this.o); this.o += 256; }
    getBuffer() { return this.b.subarray(0, this.o); } setOffset(o) { this.o = o; }
    readUint32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; } readFloat64() { const v = this.b.readDoubleLE(this.o); this.o += 8; return v; }
    readString256() { const x = this.b.subarray(this.o, this.o + 256); this.o += 256; const i = x.indexOf(0); return (i < 0 ? x : x.subarray(0, i)).toString('latin1'); }
  }
  SC = { RawBuffer, SimConnectDataType: { FLOAT64: 4, STRING256: 9 }, SimConnectPeriod: { NEVER: 0, ONCE: 1, VISUAL_FRAME: 2, SIM_FRAME: 3, SECOND: 4 },
    DataRequestFlag: { DATA_REQUEST_FLAG_DEFAULT: 0, DATA_REQUEST_FLAG_CHANGED: 1, DATA_REQUEST_FLAG_TAGGED: 2 }, SimConnectConstants: { OBJECT_ID_USER: 0 } };
}
console.log('with ' + (real ? 'node-simconnect' : 'a stand-in for node-simconnect'));
ck('the enums and constants msfs.js uses exist', SC.SimConnectDataType.FLOAT64 != null && SC.SimConnectDataType.STRING256 != null && SC.SimConnectPeriod.SIM_FRAME != null && SC.SimConnectPeriod.SECOND != null
  && SC.SimConnectPeriod.NEVER === 0 && SC.DataRequestFlag.DATA_REQUEST_FLAG_TAGGED === 2 && SC.SimConnectConstants.OBJECT_ID_USER === 0);

class FakeSim extends EventEmitter {
  constructor() { super(); this.defs = {}; this.reqs = []; this.n = 100; this.cleared = []; }
  addToDataDefinition(def, name, unit, type, eps, id) { (this.defs[def] = this.defs[def] || []).push({ name, unit, type, id }); return ++this.n; }
  clearDataDefinition(def) { this.cleared.push(def); delete this.defs[def]; return ++this.n; }
  requestDataOnSimObject(req, def, obj, period, flags, origin, interval, limit) { this.reqs.push({ req, def, obj, period, flags, interval }); return ++this.n; }
  /* tagged data: [datum id, value] pairs */
  send(req, def, pairs) {
    const b = new SC.RawBuffer(8192);
    for (const [id, v] of pairs) { b.writeInt32(id); if (typeof v === 'string') b.writeString256(v); else b.writeFloat64(v); }
    const r = new SC.RawBuffer(b.getBuffer()); r.setOffset(0);
    this.emit('simObjectData', { requestID: req, defineID: def, objectID: 0, flags: 2, entryNumber: 1, outOf: 1, defineCount: pairs.length, data: r });
  }
}
const idx = (list, k) => list.findIndex((x) => x[0] === k);
const pfd = (o) => Object.entries(o).map(([k, v]) => [idx(PFD, k), v]).filter((p) => p[0] >= 0);

const sim = new FakeSim(); let T = 1000000; const frames = [], gsx = [], logs = [];
const L = new MsfsLive(sim, SC, { onFrame: (f) => frames.push(f), onGsx: (m) => gsx.push(m), log: (m) => logs.push(m), now: () => T });
const P = sim.defs[DEF.PFD] || [], G = sim.defs[DEF.GND] || [];
ck('PFD definition: every value as FLOAT64, numbered in order', P.length === PFD.length && P.every((d, i) => d.id === i && d.type === SC.SimConnectDataType.FLOAT64 && d.name === PFD[i][1]), P.length);
ck('Ground definition: GSX’s L:vars, the OOOI values, the aircraft title last', G.length === GND.length + 1 && G.filter((d) => /^L:FSDT_GSX_/.test(d.name)).length === GSX.length
  && G.every((d) => !/^L:/.test(d.name) || d.unit === 'number') && G[G.length - 1].name === 'TITLE' && G[G.length - 1].type === SC.SimConnectDataType.STRING256 && G[G.length - 1].id === GND.length, G.map((d) => d.name).slice(-3));
ck('nothing asked of MSFS before an EFB wants it', sim.reqs.length === 0);
L.want(true, false);
const r1 = sim.reqs[0];
ck('PFD values asked for: every third simulator frame, tagged, on the user aircraft', r1 && r1.req === REQ.PFD && r1.def === DEF.PFD && r1.period === SC.SimConnectPeriod.SIM_FRAME && r1.interval === 2 && r1.flags === SC.DataRequestFlag.DATA_REQUEST_FLAG_TAGGED && r1.obj === 0, r1);
/* in the air: nose 2.5° up (MSFS: −2.5), banked 10° right (MSFS: −10), true heading 075 and magnetic 077 (variation 2° W) */
const air = { pitch: -2.5, bank: -10, hm: 77, ht: 75, trk: 76, ias: 152.34, tas: 233.4, gs: 214.2, vs: -712.4, alt: 3021.6, qnh: 1013.2, ra: 1234.4, ball: 63.5, mach: 0.234, gnd: 0,
  la: 22.30123456, lo: 113.91234567, oat: 18.44, wsp: 12.4, wd: 268, gf: 1.02, td: 0 };
sim.send(REQ.PFD, DEF.PFD, pfd(air));
const f = frames[0];
ck('a frame', !!f, f);
if (f) {
  ck('attitude in the EFB’s signs: pitch up, bank right; heading magnetic', f.p === 2.5 && f.b === 10 && f.h === 77, { p: f.p, b: f.b, h: f.h });
  ck('variation from true and magnetic (west negative); track magnetic', f.mv === -2 && f.k === 78, { mv: f.mv, k: f.k });
  ck('speeds, vertical speed, altitudes, QNH', f.ias === 152.3 && f.tas === 233 && f.gs === 214 && f.vs === -712 && f.alt === 3022 && f.ra === 1234 && f.qnh === 1013.2, f);
  ck('ball (−127…127 → −1…1), mach, in the air, position, wind from (true), OAT, G', f.ball === 0.5 && f.m === 0.234 && f.g === 0 && f.la === 22.30123 && f.lo === 113.91235 && f.wd === 268 && f.wsp === 12 && f.oat === 18.4 && f.gf === 1.02 && f.tdv === 0, f);
}
/* at most 15 a second: a second sample 30 ms later is not sent on */
T += 30; sim.send(REQ.PFD, DEF.PFD, pfd({ ...air, pitch: -3 }));
ck('at most 15 frames a second', frames.length === 1, frames.length);
T += 40; sim.send(REQ.PFD, DEF.PFD, pfd({ ...air, pitch: -3 }));
ck('then the next', frames.length === 2 && frames[1].p === 3, frames.length);
/* a value MSFS does not know: left out, the others unchanged (tagged) */
const noRa = pfd({ ...air, pitch: -1 }).filter((p) => p[0] !== idx(PFD, 'ra'));
T += 70; frames.length = 0; L.vals = {}; sim.send(REQ.PFD, DEF.PFD, noRa);
ck('a value missing: the others still right', frames[0] && frames[0].ra === 0 && frames[0].p === 1 && frames[0].h === 77, frames[0] && { ra: frames[0].ra, p: frames[0].p });
const raId = [...L.sent.entries()].find((e) => e[1] === 'RADIO HEIGHT')[0];
sim.emit('exception', { exception: 7, sendId: raId, index: 0 });
ck('and the simulator’s refusal is said once, by name', logs.length === 1 && /RADIO HEIGHT/.test(logs[0]), logs);
/* touchdown: −380 fpm in the air, then on the ground with MSFS's touchdown velocity 412 */
frames.length = 0; T += 70; sim.send(REQ.PFD, DEF.PFD, pfd({ ...air, vs: -380, gnd: 0, td: 150 }));
T += 70; sim.send(REQ.PFD, DEF.PFD, pfd({ ...air, vs: -60, gnd: 1, td: 412, gf: 1.3 }));
const tdF = frames[frames.length - 1];
ck('touchdown: MSFS’s own touchdown vertical speed, as a descent', tdF && tdF.g === 1 && tdF.tdv === -412, tdF && { g: tdF.g, tdv: tdF.tdv });
T += 6000; sim.send(REQ.PFD, DEF.PFD, pfd({ ...air, vs: 0, gnd: 1, td: 412 }));
ck('and 5 s later it is not repeated', frames[frames.length - 1].tdv === 0);
/* without a touchdown value from MSFS: the last vertical speed in the air */
const sim2 = new FakeSim(), fr2 = []; let T2 = 5000;
const L2 = new MsfsLive(sim2, SC, { onFrame: (x) => fr2.push(x), now: () => T2 }); L2.want(true, false);
sim2.send(REQ.PFD, DEF.PFD, pfd({ ...air, vs: -455, gnd: 0 }).filter((p) => p[0] !== idx(PFD, 'td')));
T2 += 70; sim2.send(REQ.PFD, DEF.PFD, pfd({ ...air, vs: -20, gnd: 1 }).filter((p) => p[0] !== idx(PFD, 'td')));
ck('without it: the last vertical speed in the air', fr2[fr2.length - 1].tdv === -455, fr2[fr2.length - 1].tdv);
/* Ground: once a second, tagged */
L.want(true, true);
const r2 = sim.reqs[sim.reqs.length - 1];
ck('Ground asked for once a second, tagged', r2.req === REQ.GND && r2.def === DEF.GND && r2.period === SC.SimConnectPeriod.SECOND && r2.flags === SC.DataRequestFlag.DATA_REQUEST_FLAG_TAGGED, r2);
const gv = { gnd: 1, kt: 4.26, pbrk: 0, fob: 55115.6, e1: 1, e2: 1, e3: 0, e4: 0, 'x.coua': 1, 'x.board': 5, 'x.paxB': 120, 'x.pax': 280, 'x.dep': 1 };
sim.send(REQ.GND, DEF.GND, [...Object.entries(gv).map(([k, v]) => [idx(GND, k), v]), [GND.length, 'Airbus A330-900 Polaris']]);
const m = gsx[0];
ck('Ground: GSX’s values by the EFB’s keys (0 for those not given)', m && m.v.coua === 1 && m.v.board === 5 && m.v.paxB === 120 && m.v.pax === 280 && m.v.deboard === 0 && Object.keys(m.v).length === GSX.length, m && m.v);
ck('Ground: on the ground, 4.3 kt, brake off, 2 engines, fuel in kg, the title', m && m.g.gnd === 1 && m.g.kt === 4.3 && m.g.pbrk === 0 && m.g.eng === 2 && m.g.fob === 25000 && m.g.title === 'Airbus A330-900 Polaris', m && m.g);
/* GSX Pro not running yet (COUATL_STARTED 0): after a minute, Ground's definition made afresh and asked for again */
const gs0 = { ...gv, 'x.coua': 0, 'x.board': 0 }, gsend = (o) => sim.send(REQ.GND, DEF.GND, [...Object.entries(o).map(([k, v]) => [idx(GND, k), v]), [GND.length, 'Airbus A330-900 Polaris']]);
const nReq = sim.reqs.length, nLog = logs.length;
T += 30000; gsend(gs0);
ck('GSX not running: nothing done for the first minute', sim.cleared.length === 0 && sim.reqs.length === nReq);
T += 31000; gsend(gs0);
const rq = sim.reqs.slice(nReq), G2 = sim.defs[DEF.GND] || [];
ck('after a minute: Ground stopped, its definition cleared and made again, asked for again', sim.cleared.join() === String(DEF.GND) && rq.length === 2 && rq[0].period === SC.SimConnectPeriod.NEVER && rq[1].period === SC.SimConnectPeriod.SECOND && rq[1].req === REQ.GND
  && G2.length === GND.length + 1 && G2[G2.length - 1].name === 'TITLE', { cleared: sim.cleared, rq, n: G2.length });
ck('said once', logs.length === nLog + 1 && /GSX Pro not running/.test(logs[logs.length - 1]), logs.slice(nLog));
T += 61000; gsend(gs0);
ck('and again a minute later (said only once)', sim.cleared.length === 2 && logs.length === nLog + 1, { cleared: sim.cleared.length, logs: logs.length - nLog });
/* GSX starts: its values come, nothing made afresh any more */
T += 61000; gsend({ ...gs0, 'x.coua': 1, 'x.board': 3 });
T += 61000; gsend({ ...gs0, 'x.coua': 1, 'x.board': 4 });
ck('GSX running: left alone', sim.cleared.length === 2 && gsx[gsx.length - 1].v.board === 4, sim.cleared.length);
/* not wanted any more: stopped */
L.want(false, false);
const st = sim.reqs.slice(-2);
ck('stopped when no EFB wants them (period NEVER)', st.length === 2 && st.every((x) => x.period === SC.SimConnectPeriod.NEVER) && st.map((x) => x.req).sort().join() === [REQ.PFD, REQ.GND].sort().join(), st);
const nf = frames.length; sim.send(REQ.PFD, DEF.PFD, pfd(air));
ck('and what still comes in is not sent on', frames.length === nf);
L.want(false, false);
ck('asked again only when it changes', sim.reqs.length === 8, sim.reqs.length);
console.log(ok ? 'ALL OK' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
