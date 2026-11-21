/* Polaris Navdata: reads an airport's SIDs and STARs (with their runway and en-route transitions) from the
   simulator's own navigation data through SimConnect facility data, and returns them as plain JSON for the EFB.
   Field names and types follow the MSFS SDK (SimConnect_AddToFacilityDefinition); every struct's fields arrive in
   the order they are added here. */
'use strict';
const { FacilityDataType: FT } = require('node-simconnect');

const DEF = { PROC: 401, WPT: 402, VOR: 403, NDB: 404, APT: 405 };
const LEG_TYPES = ['', 'AF', 'CA', 'CD', 'CF', 'CI', 'CR', 'DF', 'FA', 'FC', 'FD', 'FM', 'HA', 'HF', 'HM', 'IF', 'PI', 'RF', 'TF', 'VA', 'VD', 'VI', 'VM', 'VR'];
const DESIG = ['', 'L', 'R', 'C', 'W', 'A', 'B'];
const M2FT = 3.28084, M2NM = 1 / 1852;

/* [field, reader] per struct; readers: d = FLOAT64, f = FLOAT32, i = INT32, s = CHAR[8] */
const F_AIRPORT = [['LATITUDE', 'd'], ['LONGITUDE', 'd'], ['MAGVAR', 'f'], ['N_RUNWAYS', 'i'], ['N_DEPARTURES', 'i'], ['N_ARRIVALS', 'i']];
const F_RUNWAY = [['LATITUDE', 'd'], ['LONGITUDE', 'd'], ['HEADING', 'f'], ['LENGTH', 'f'], ['PRIMARY_NUMBER', 'i'], ['PRIMARY_DESIGNATOR', 'i'], ['SECONDARY_NUMBER', 'i'], ['SECONDARY_DESIGNATOR', 'i']];
const F_PROC = [['NAME', 's']];
const F_RWTR = [['RUNWAY_NUMBER', 'i'], ['RUNWAY_DESIGNATOR', 'i']];
const F_ENTR = [['NAME', 's']];
function legFields(coords) {
  const f = [['TYPE', 'i'], ['FIX_ICAO', 's'], ['FIX_REGION', 's'], ['FIX_TYPE', 'i']];
  if (coords) f.push(['FIX_LATITUDE', 'd'], ['FIX_LONGITUDE', 'd']);
  f.push(['FLY_OVER', 'i'], ['TRUE_DEGREE', 'i'], ['TURN_DIRECTION', 'i'], ['COURSE', 'f'], ['ROUTE_DISTANCE', 'f'], ['DISTANCE_MINUTE', 'i'],
    ['APPROACH_ALT_DESC', 'i'], ['ALTITUDE1', 'f'], ['ALTITUDE2', 'f'], ['SPEED_LIMIT', 'f']);
  if (coords) f.push(['ARC_CENTER_FIX_LATITUDE', 'd'], ['ARC_CENTER_FIX_LONGITUDE', 'd']);
  return f;
}
const F_WPT = [['LATITUDE', 'd'], ['LONGITUDE', 'd']];
const F_VOR = [['VOR_LATITUDE', 'd'], ['VOR_LONGITUDE', 'd'], ['DME_LATITUDE', 'd'], ['DME_LONGITUDE', 'd']];
const F_NDB = [['LATITUDE', 'd'], ['LONGITUDE', 'd']];

function read(buf, fields) {
  const o = {};
  for (const [k, t] of fields) o[k] = t === 'd' ? buf.readFloat64() : t === 'f' ? buf.readFloat32() : t === 'i' ? buf.readInt32() : buf.readString8().replace(/\0.*$/, '').trim();
  return o;
}

class ProcReader {
  constructor(handle, opts = {}) {
    this.h = handle; this.coords = opts.coords !== false; this.req = 1000; this.pending = new Map(); this.queue = Promise.resolve();
    this.F_LEG = legFields(this.coords);
    this.define();
    handle.on('facilityData', (r) => this.onData(r));
    handle.on('facilityDataEnd', (r) => this.onEnd(r));
  }
  define() {
    const h = this.h, add = (def, list) => list.forEach(([k]) => h.addToFacilityDefinition(def, k));
    const legs = () => { h.addToFacilityDefinition(DEF.PROC, 'OPEN APPROACH_LEG'); add(DEF.PROC, this.F_LEG); h.addToFacilityDefinition(DEF.PROC, 'CLOSE APPROACH_LEG'); };
    const proc = (kind) => {
      h.addToFacilityDefinition(DEF.PROC, 'OPEN ' + kind); add(DEF.PROC, F_PROC);
      h.addToFacilityDefinition(DEF.PROC, 'OPEN RUNWAY_TRANSITION'); add(DEF.PROC, F_RWTR); legs(); h.addToFacilityDefinition(DEF.PROC, 'CLOSE RUNWAY_TRANSITION');
      h.addToFacilityDefinition(DEF.PROC, 'OPEN ENROUTE_TRANSITION'); add(DEF.PROC, F_ENTR); legs(); h.addToFacilityDefinition(DEF.PROC, 'CLOSE ENROUTE_TRANSITION');
      legs();
      h.addToFacilityDefinition(DEF.PROC, 'CLOSE ' + kind);
    };
    h.addToFacilityDefinition(DEF.PROC, 'OPEN AIRPORT'); add(DEF.PROC, F_AIRPORT);
    h.addToFacilityDefinition(DEF.PROC, 'OPEN RUNWAY'); add(DEF.PROC, F_RUNWAY); h.addToFacilityDefinition(DEF.PROC, 'CLOSE RUNWAY');
    proc('DEPARTURE'); proc('ARRIVAL');
    h.addToFacilityDefinition(DEF.PROC, 'CLOSE AIRPORT');
    for (const [def, kind, list] of [[DEF.WPT, 'WAYPOINT', F_WPT], [DEF.VOR, 'VOR', F_VOR], [DEF.NDB, 'NDB', F_NDB], [DEF.APT, 'AIRPORT', F_WPT]]) {
      h.addToFacilityDefinition(def, 'OPEN ' + kind); add(def, list); h.addToFacilityDefinition(def, 'CLOSE ' + kind);
    }
  }
  onData(r) {
    const p = this.pending.get(r.userRequestId); if (!p) return;
    try { p.data(r); } catch (e) { p.err = e; }
  }
  onEnd(r) { const p = this.pending.get(r.userRequestId); if (p) { this.pending.delete(r.userRequestId); clearTimeout(p.timer); p.done(); } }
  /* one request: resolves with the parsed nodes when the simulator says it is finished */
  ask(def, icao, region, type, onNode, ms) {
    return new Promise((resolve) => {
      const id = ++this.req, nodes = [];
      const p = { data: (r) => nodes.push(onNode(r)), done: () => resolve({ ok: true, nodes, err: p.err }), timer: setTimeout(() => { this.pending.delete(id); resolve({ ok: false, nodes, timeout: true }); }, ms || 20000) };
      this.pending.set(id, p);
      try { this.h.requestFacilityData(def, id, icao, region || undefined, type || undefined); }
      catch (e) { this.pending.delete(id); clearTimeout(p.timer); resolve({ ok: false, nodes, err: e }); }
    });
  }
  airport(icao) { const run = () => this.read(String(icao || '').toUpperCase().trim()); const q = this.queue.then(run, run); this.queue = q.catch(() => {}); return q; }
  async read(icao) {
    if (!/^[A-Z0-9]{3,4}$/.test(icao)) throw new Error('Not an airport code: ' + icao);
    const res = await this.ask(DEF.PROC, icao, '', '', (r) => {
      const t = r.type, b = r.data;
      const o = { t, id: r.uniqueRequestId, parent: r.parentUniqueRequestId };
      if (t === FT.AIRPORT) o.v = read(b, F_AIRPORT);
      else if (t === FT.RUNWAY) o.v = read(b, F_RUNWAY);
      else if (t === FT.DEPARTURE || t === FT.ARRIVAL) o.v = read(b, F_PROC);
      else if (t === FT.RUNWAY_TRANSITION) o.v = read(b, F_RWTR);
      else if (t === FT.ENROUTE_TRANSITION) o.v = read(b, F_ENTR);
      else if (t === FT.APPROACH_LEG) o.v = read(b, this.F_LEG);
      return o;
    }, 25000);
    if (res.err) throw res.err;
    if (!res.nodes.length) throw new Error(res.timeout ? 'The simulator did not answer for ' + icao : icao + ' is not in the simulator’s navigation data');
    const out = build(icao, res.nodes);
    await this.fillFixes(out);
    return out;
  }
  /* legs whose fix came without a position (or all of them, without FIX_LATITUDE): look the fixes up one by one */
  async fillFixes(out) {
    const need = new Map();
    const legsOf = (p) => [p.c, ...Object.values(p.rt), ...Object.values(p.et)].flat();
    for (const p of [...out.dep, ...out.arr]) for (const l of legsOf(p)) if (l.f && l.la == null && l.ty && 'WVNA'.includes(l.ty)) need.set(l.ty + '|' + l.rg + '|' + l.f, null);
    if (!need.size) return;
    const jobs = [...need.keys()].map(async (k) => {
      const [ty, rg, f] = k.split('|'), def = ty === 'V' ? DEF.VOR : ty === 'N' ? DEF.NDB : ty === 'A' ? DEF.APT : DEF.WPT;
      const r = await this.ask(def, f, ty === 'A' ? '' : rg, ty === 'A' ? '' : ty, (x) => {
        if (x.type === FT.VOR) { const v = read(x.data, F_VOR); return v.VOR_LATITUDE || v.VOR_LONGITUDE ? [v.VOR_LATITUDE, v.VOR_LONGITUDE] : [v.DME_LATITUDE, v.DME_LONGITUDE]; }
        if (x.type === FT.WAYPOINT || x.type === FT.NDB || x.type === FT.AIRPORT) { const v = read(x.data, F_WPT); return [v.LATITUDE, v.LONGITUDE]; }
        return null;
      }, 6000);
      const c = r.nodes.find((n) => n && (n[0] || n[1])); if (c) need.set(k, c);
    });
    await Promise.all(jobs);
    for (const p of [...out.dep, ...out.arr]) for (const l of legsOf(p)) if (l.f && l.la == null) { const c = need.get(l.ty + '|' + l.rg + '|' + l.f); if (c) { l.la = +c[0].toFixed(6); l.lo = +c[1].toFixed(6); } }
  }
}

const rwyId = (n, d) => (n > 0 && n <= 36 ? String(n).padStart(2, '0') + (DESIG[d] || '') : n === 0 ? 'ALL' : String(n));
function dest(la, lo, brg, nm) {
  const R = Math.PI / 180, d = nm / 3440.065, a = la * R, b = lo * R, t = brg * R;
  const la2 = Math.asin(Math.sin(a) * Math.cos(d) + Math.cos(a) * Math.sin(d) * Math.cos(t));
  const lo2 = b + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(a), Math.cos(d) - Math.sin(a) * Math.sin(la2));
  return [la2 / R, lo2 / R];
}
function leg(v) {
  const ty = v.FIX_TYPE > 0 ? String.fromCharCode(v.FIX_TYPE) : '';
  const o = { t: LEG_TYPES[v.TYPE] || String(v.TYPE) };
  if (v.FIX_ICAO) { o.f = v.FIX_ICAO; o.rg = v.FIX_REGION || ''; o.ty = ty; }
  if (v.FIX_LATITUDE || v.FIX_LONGITUDE) { o.la = +v.FIX_LATITUDE.toFixed(6); o.lo = +v.FIX_LONGITUDE.toFixed(6); }
  if (v.COURSE) o.c = +v.COURSE.toFixed(1);
  if (v.TRUE_DEGREE) o.tc = 1;
  if (v.ROUTE_DISTANCE) o.d = v.DISTANCE_MINUTE ? +v.ROUTE_DISTANCE.toFixed(1) : +(v.ROUTE_DISTANCE * M2NM).toFixed(2);
  if (v.DISTANCE_MINUTE) o.min = 1;
  if (v.TURN_DIRECTION === 1) o.tn = 'L'; else if (v.TURN_DIRECTION === 2) o.tn = 'R';
  if (v.FLY_OVER) o.fo = 1;
  if (v.APPROACH_ALT_DESC) { o.ad = v.APPROACH_ALT_DESC; if (v.ALTITUDE1) o.a1 = Math.round(v.ALTITUDE1 * M2FT); if (v.ALTITUDE2) o.a2 = Math.round(v.ALTITUDE2 * M2FT); }
  if (v.SPEED_LIMIT > 0) o.sp = Math.round(v.SPEED_LIMIT);
  if (v.ARC_CENTER_FIX_LATITUDE || v.ARC_CENTER_FIX_LONGITUDE) o.ac = [+v.ARC_CENTER_FIX_LATITUDE.toFixed(6), +v.ARC_CENTER_FIX_LONGITUDE.toFixed(6)];
  return o;
}
/* the facility tree (each node knows its parent) into airport, runway ends, departures and arrivals */
function build(icao, nodes) {
  const byId = new Map(); nodes.forEach((n) => { n.kids = []; byId.set(n.id, n); });
  let root = null;
  for (const n of nodes) { const p = byId.get(n.parent); if (p && p !== n) p.kids.push(n); else if (n.t === FT.AIRPORT) root = n; }
  if (!root) throw new Error('No airport record for ' + icao);
  const a = root.v, out = { v: 1, icao, la: +a.LATITUDE.toFixed(6), lo: +a.LONGITUDE.toFixed(6), mv: +(+a.MAGVAR || 0).toFixed(1), rw: [], dep: [], arr: [], at: Date.now() };
  for (const r of root.kids.filter((k) => k.t === FT.RUNWAY)) {
    const v = r.v, half = (v.LENGTH || 0) * M2NM / 2, h = v.HEADING || 0;
    const p1 = dest(v.LATITUDE, v.LONGITUDE, h + 180, half), p2 = dest(v.LATITUDE, v.LONGITUDE, h, half);
    if (v.PRIMARY_NUMBER > 0 && v.PRIMARY_NUMBER <= 36) out.rw.push({ n: rwyId(v.PRIMARY_NUMBER, v.PRIMARY_DESIGNATOR), la: +p1[0].toFixed(6), lo: +p1[1].toFixed(6), h: +h.toFixed(1), len: Math.round((v.LENGTH || 0) * M2FT) });
    if (v.SECONDARY_NUMBER > 0 && v.SECONDARY_NUMBER <= 36) out.rw.push({ n: rwyId(v.SECONDARY_NUMBER, v.SECONDARY_DESIGNATOR), la: +p2[0].toFixed(6), lo: +p2[1].toFixed(6), h: +((h + 180) % 360).toFixed(1), len: Math.round((v.LENGTH || 0) * M2FT) });
  }
  const legsOf = (n) => n.kids.filter((k) => k.t === FT.APPROACH_LEG).map((k) => leg(k.v));
  for (const [t, list] of [[FT.DEPARTURE, out.dep], [FT.ARRIVAL, out.arr]]) {
    for (const p of root.kids.filter((k) => k.t === t)) {
      const o = { n: p.v.NAME, c: legsOf(p), rt: {}, et: {} };
      for (const k of p.kids) {
        if (k.t === FT.RUNWAY_TRANSITION) o.rt[rwyId(k.v.RUNWAY_NUMBER, k.v.RUNWAY_DESIGNATOR)] = legsOf(k);
        else if (k.t === FT.ENROUTE_TRANSITION) o.et[k.v.NAME || '?'] = legsOf(k);
      }
      if (o.n) list.push(o);
    }
  }
  /* runway fixes (RW05R) get the threshold's position */
  const rwPos = new Map(out.rw.map((r) => ['RW' + r.n, r]));
  for (const p of [...out.dep, ...out.arr]) for (const l of [p.c, ...Object.values(p.rt), ...Object.values(p.et)].flat())
    if (l.f && l.la == null && rwPos.has(l.f)) { const r = rwPos.get(l.f); l.la = r.la; l.lo = r.lo; l.ty = 'R'; }
  out.dep.sort((x, y) => x.n.localeCompare(y.n)); out.arr.sort((x, y) => x.n.localeCompare(y.n));
  return out;
}

module.exports = { ProcReader, build, legFields, DEF, read, F_AIRPORT, F_RUNWAY, F_PROC, F_RWTR, F_ENTR, F_WPT, F_VOR };
