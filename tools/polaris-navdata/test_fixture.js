/* Unit test: a fake SimConnect handle sends facility data the way MSFS does (one message per struct, each with its
   parent's id), for made-up procedures at RCTP and ZGHA; ProcReader must rebuild them. Also writes the results for the
   EFB tests. node test_fixture.js */
'use strict';
const assert = require('assert');
const EventEmitter = require('events');
const { RawBuffer, FacilityDataType: FT } = require('node-simconnect');
const { ProcReader, legFields, DEF, F_AIRPORT, F_RUNWAY, F_PROC, F_RWTR, F_ENTR } = require('./navdata');
const LT = { AF: 1, CA: 2, CF: 4, DF: 7, FM: 11, HM: 14, IF: 15, RF: 17, TF: 18, VA: 19, VI: 21, VM: 22 };

const FIX = {
  RCTP: {
    CHALI: [24.62, 120.43], KUDOS: [25.06, 121.86], MOLKA: [26.43, 122.98], PIANO: [25.62, 121.47], ROBIN: [25.28, 121.92], TINHO: [24.45, 121.70],
    TP501: [25.130, 121.330], TP502: [25.200, 121.300], TP511: [25.020, 121.150], TP512: [24.990, 121.270], SPRAY: [25.150, 121.400],
    BRAVO: [24.48, 120.62], JAMMY: [24.70, 120.95], TONGA: [25.70, 121.90], TP601: [24.90, 121.00], TP602: [24.98, 121.10], TP603: [25.30, 121.55], TP604: [25.18, 121.36], FI05L: [24.99, 121.12],
  },
  ZGHA: { UBM: [28.40, 113.30], LIPMI: [27.80, 113.10], TP101: [28.27, 113.23], TP102: [28.10, 113.22], P41: [27.60, 113.40], OMBOD: [28.10, 113.60] },
};
function apt(icao) {
  if (icao === 'RCTP') return {
    a: [25.0777, 121.2328, -4.2], rw: [[25.0820, 121.2400, 53.5, 3660, 5, 1, 23, 2], [25.0640, 121.2460, 53.5, 3800, 5, 2, 23, 1]],
    dep: [
      ...['CHALI', 'KUDOS', 'MOLKA', 'PIANO', 'ROBIN', 'TINHO'].map((t) => ({ n: t.slice(0, 4) + '1A', rt: { '05R': [['VA', null, 53, 1000], ['DF', 'TP501']] }, c: [['TF', 'TP502']], et: { [t]: [['TF', t]] } })),
      { n: 'SPRA1A', rt: { '05R': [['VA', null, 53, 800], ['DF', 'TP501']] }, c: [['TF', 'SPRAY'], ['VM', null, 90]], et: {} },
      { n: 'CHAL1B', rt: { '23L': [['VA', null, 233, 1000], ['DF', 'TP511']] }, c: [['TF', 'TP512']], et: { CHALI: [['TF', 'CHALI']] } },
      { n: 'CHAL1C', rt: { '05L': [['CA', null, 53, 1500], ['DF', 'TP501']] }, c: [['TF', 'TP502']], et: { CHALI: [['TF', 'CHALI']] } },
      { n: 'KUDO1B', rt: { '23L': [['VA', null, 233, 1000], ['DF', 'TP511']] }, c: [['TF', 'TP504']], et: { KUDOS: [['TF', 'KUDOS']] } },
    ],
    arr: [
      { n: 'BRAV1A', et: { BRAVO: [['IF', 'BRAVO'], ['TF', 'JAMMY']] }, c: [['TF', 'TP601'], ['TF', 'TP602']], rt: { '05L': [['TF', 'TP604'], ['FM', 'TP604', 53]], '05R': [['TF', 'TP604']] } },
      { n: 'TONG1A', et: { TONGA: [['IF', 'TONGA']], KUDOS: [['IF', 'KUDOS'], ['TF', 'TONGA']] }, c: [['TF', 'TP603'], ['TF', 'TP604'], ['HM', 'TP604']], rt: {} },
    ],
    apr: [
      { ty: 4, sfx: 0, rn: 5, rd: 1, ma: 5000, tr: { JAMMY: [['IF', 'JAMMY'], ['TF', 'TP602']] }, f: [['IF', 'TP602'], ['CF', 'FI05L', 53], ['CF', 'RW05L', 53]], m: [['CA', null, 53, 1000], ['DF', 'TP501'], ['HM', 'TP501']] },
      { ty: 10, sfx: 90, rn: 23, rd: 2, ma: 4000, tr: {}, f: [['IF', 'TP604'], ['TF', 'RW23R']], m: [['CA', null, 233, 2000]] },
    ],
  };
  if (icao === 'ZGHA') return {
    a: [28.1892, 113.2196, 3.1], rw: [[28.1890, 113.2250, 0.5, 3200, 36, 2, 18, 1]],
    dep: [
      { n: 'UBM7X', rt: { '36R': [['VA', null, 3, 1000], ['DF', 'TP101']] }, c: [['TF', 'UBM']], et: {} },
      { n: 'LIP2X', rt: { '36R': [['VA', null, 3, 1000], ['DF', 'TP102']], '18L': [['VA', null, 183, 1000]] }, c: [['TF', 'LIPMI']], et: { P41: [['TF', 'P41']] } },
    ],
    arr: [{ n: 'OMB1A', et: { OMBOD: [['IF', 'OMBOD']] }, c: [['TF', 'TP101']], rt: { '36R': [['TF', 'TP102']] } }],
  };
  return null;
}

/* the fake simulator: writes every struct with the reader's own field list, so a wrong order shows up as garbage */
class FakeSim extends EventEmitter {
  constructor(coords) { super(); this.coords = coords; this.defs = {}; this.seq = 1; }
  addToFacilityDefinition(def, f) { (this.defs[def] = this.defs[def] || []).push(f); }
  requestFacilityData(def, id, icao, region, type) { setImmediate(() => this.answer(def, id, icao, region, type)); }
  send(id, uid, parent, type, write) { const b = new RawBuffer(512); write(b); const r = new RawBuffer(b.getBuffer()); r.setOffset(0); this.emit('facilityData', { userRequestId: id, uniqueRequestId: uid, parentUniqueRequestId: parent, type, data: r }); }
  answer(def, id, icao, region, type) {
    const end = () => this.emit('facilityDataEnd', { userRequestId: id });
    if (def !== DEF.PROC) {
      const where = Object.values(FIX).map((m) => m[icao]).find(Boolean);
      if (where) this.send(id, this.seq++, 0, type === 'V' ? FT.VOR : type === 'N' ? FT.NDB : FT.WAYPOINT, (b) => { b.writeFloat64(where[0]); b.writeFloat64(where[1]); if (type === 'V') { b.writeFloat64(0); b.writeFloat64(0); } });
      return end();
    }
    const A = apt(icao); if (!A) return end();
    const F = FIX[icao], root = this.seq++;
    this.send(id, root, 0, FT.AIRPORT, (b) => { b.writeFloat64(A.a[0]); b.writeFloat64(A.a[1]); b.writeFloat32(A.a[2]); b.writeInt32(A.rw.length); b.writeInt32(A.dep.length); b.writeInt32(A.arr.length); });
    for (const r of A.rw) this.send(id, this.seq++, root, FT.RUNWAY, (b) => { b.writeFloat64(r[0]); b.writeFloat64(r[1]); b.writeFloat32(r[2]); b.writeFloat32(r[3]); for (const k of r.slice(4)) b.writeInt32(k); });
    const s8 = (b, s) => { const x = Buffer.alloc(8); x.write(s || ''); b.write(x); };
    const legsT = (parent, list, T) => list.forEach(([t, fix, crs, alt]) => this.send(id, this.seq++, parent, T, (b) => {
      const p = fix && F[fix];
      b.writeInt32(LT[t]); s8(b, fix || ''); s8(b, fix ? icao.slice(0, 2) : ''); b.writeInt32(fix ? (fix.startsWith('TP') ? 87 : 87) : 0);
      if (this.coords) { b.writeFloat64(p ? p[0] : 0); b.writeFloat64(p ? p[1] : 0); }
      b.writeInt32(0); b.writeInt32(0); b.writeInt32(crs ? 2 : 0); b.writeFloat32(crs || 0); b.writeFloat32(0); b.writeInt32(0);
      b.writeInt32(alt ? 2 : 0); b.writeFloat32(alt ? alt / 3.28084 : 0); b.writeFloat32(0); b.writeFloat32(t === 'DF' ? 210 : 0);
      if (this.coords) { b.writeFloat64(0); b.writeFloat64(0); }
    }));
    const legs = (parent, list) => legsT(parent, list, FT.APPROACH_LEG);
    for (const [type2, list] of [[FT.DEPARTURE, A.dep], [FT.ARRIVAL, A.arr]]) for (const p of list) {
      const pid = this.seq++; this.send(id, pid, root, type2, (b) => s8(b, p.n));
      for (const [rw, L] of Object.entries(p.rt)) { const k = this.seq++; this.send(id, k, pid, FT.RUNWAY_TRANSITION, (b) => { b.writeInt32(parseInt(rw, 10)); b.writeInt32(' LRC'.indexOf(rw.slice(2)) > 0 ? ' LRC'.indexOf(rw.slice(2)) : 0); }); legs(k, L); }
      for (const [nm, L] of Object.entries(p.et)) { const k = this.seq++; this.send(id, k, pid, FT.ENROUTE_TRANSITION, (b) => s8(b, nm)); legs(k, L); }
      legs(pid, p.c);
    }
    for (const a of A.apr || []) {
      const pid = this.seq++; this.send(id, pid, root, FT.APPROACH, (b) => { b.writeInt32(a.ty); b.writeInt32(a.sfx); b.writeInt32(a.rn); b.writeInt32(a.rd); b.writeFloat32(a.ma / 3.28084); });
      for (const [nm, L] of Object.entries(a.tr)) { const k = this.seq++; this.send(id, k, pid, FT.APPROACH_TRANSITION, (b) => { b.writeInt32(a.ty); s8(b, L[0][1]); s8(b, nm); }); legs(k, L); }
      legsT(pid, a.f, FT.FINAL_APPROACH_LEG); legsT(pid, a.m, FT.MISSED_APPROACH_LEG);
    }
    end();
  }
}

(async () => {
  for (const coords of [true, false]) {
    const sim = new FakeSim(coords), rd = new ProcReader(sim, { coords });
    /* the definition the reader registered must match the struct sizes the fake writes */
    assert.ok(sim.defs[DEF.PROC].includes('OPEN DEPARTURE') && sim.defs[DEF.PROC].includes('CLOSE AIRPORT'));
    assert.strictEqual(sim.defs[DEF.PROC].filter((x) => x === 'OPEN APPROACH_LEG').length, 7);
    const R = await rd.airport('rctp');
    assert.strictEqual(R.icao, 'RCTP'); assert.strictEqual(R.rw.length, 4); assert.deepStrictEqual(R.rw.map((r) => r.n).sort(), ['05L', '05R', '23L', '23R']);
    assert.strictEqual(R.dep.length, 10); assert.strictEqual(R.arr.length, 2);
    const ch = R.dep.find((p) => p.n === 'CHAL1A');
    assert.deepStrictEqual(Object.keys(ch.rt), ['05R']); assert.deepStrictEqual(Object.keys(ch.et), ['CHALI']);
    assert.strictEqual(ch.rt['05R'][0].t, 'VA'); assert.strictEqual(ch.rt['05R'][0].a1, 1000); assert.strictEqual(ch.rt['05R'][0].c, 53);
    assert.strictEqual(ch.rt['05R'][1].f, 'TP501'); assert.ok(Math.abs(ch.rt['05R'][1].la - 25.13) < 1e-6, 'fix position ' + coords);
    assert.strictEqual(ch.et.CHALI[0].f, 'CHALI'); assert.ok(Math.abs(ch.et.CHALI[0].lo - 120.43) < 1e-6);
    const br = R.arr.find((p) => p.n === 'BRAV1A'); assert.deepStrictEqual(Object.keys(br.rt).sort(), ['05L', '05R']); assert.strictEqual(br.rt['05L'][1].t, 'FM');
    const r05r = R.rw.find((r) => r.n === '05R'); assert.ok(Math.abs(r05r.h - 53.5) < .01 && r05r.la < 25.0640, 'threshold before the centre');
    assert.strictEqual(R.apr.length, 2); const il = R.apr.find((a) => a.id === 'I05L'); assert.ok(il, JSON.stringify(R.apr.map((a) => a.id)));
    assert.strictEqual(il.n, 'ILS RW05L'); assert.strictEqual(il.ma, 5000); assert.deepStrictEqual(Object.keys(il.tr), ['JAMMY']); assert.strictEqual(il.f[1].f, 'FI05L'); assert.strictEqual(il.m[0].t, 'CA');
    assert.ok(Math.abs(il.f[2].la - R.rw.find((r) => r.n === '05L').la) < 1e-6, 'runway fix at the threshold'); assert.strictEqual(R.apr.find((a) => a.rw === '23R').id, 'R23R-Z');
    const Z = await rd.airport('ZGHA'); assert.strictEqual(Z.dep.length, 2); assert.deepStrictEqual(Object.keys(Z.dep.find((p) => p.n === 'LIP2X').rt).sort(), ['18L', '36R']);
    await assert.rejects(rd.airport('XXXX'), /not in the simulator/);
    console.log('ok', coords ? 'with fix positions' : 'safe mode (positions looked up)');
    if (coords) { if (process.env.NP_OUT) { require('fs').writeFileSync(process.env.NP_OUT + '/np_rctp.json', JSON.stringify(R)); require('fs').writeFileSync(process.env.NP_OUT + '/np_zgha.json', JSON.stringify(Z)); } }
  }
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
