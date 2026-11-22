/* ---------- SIGMETs on the route: an automatic AOC to the crew ----------
   An airline's dispatcher tells a crew about a SIGMET they are about to fly into. Every 10 minutes (on the 2-minute
   cron), for each Polaris flight in the air, the Worker walks the rest of the route: the great circle from the aircraft
   to its destination, which is what the Live tab knows of it. At each point it estimates the level from the cruise
   level (the VATSIM flight plan, else the present altitude), climbing about 200 ft per nm and coming down on a
   3-degree path into the destination. A SIGMET (not an AIRMET or outlook) that the route crosses within the next
   900 nm or 2½ hours, valid when the aircraft gets there and at that level, is sent to the crew as an AOC, once per
   flight for each FIR and hazard and at most three times a flight. Staff can turn it off on /admin (Auto AOC tab).

   KV (STORE): sigroute:v1:sent -> { [cs:dep:arr]: { t, ids: ['FIR|HAZARD', …] } } (a day) */
import { aocSend } from './aoc.js';
import { aocTpl, aocSigMsg } from './aoctpl.js';

const SENT = 'sigroute:v1:sent', R = 3440.065, rad = Math.PI / 180, AHEAD_NM = 900, AHEAD_MIN = 150, STEP_NM = 10, PER_FLIGHT = 3, KEEP_MS = 86400_000;
const nm = (a, b, c, d) => { const x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); };
const timeOf = (v) => (v == null || v === '' ? null : typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v));
export const levelFt = (v) => (v == null || v === '' || !isFinite(+v) ? null : +v < 1000 ? +v * 100 : +v);
const fl = (ft) => 'FL' + String(Math.round(ft / 100)).padStart(3, '0');
const z = (t) => { const d = new Date(t); return String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + 'Z'; };
const ll = (lat, lon) => { const f = (v, w, p, n) => { const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60); return String(m === 60 ? d + 1 : d).padStart(w, '0') + String(m === 60 ? 0 : m).padStart(2, '0') + (v >= 0 ? p : n); }; return f(lat, 2, 'N', 'S') + f(((lon + 540) % 360) - 180, 3, 'E', 'W'); };

/* the point a fraction t of the way along the great circle from a to b ([lat, lon]) */
export function gcPoint(a, b, t) {
  const p1 = a[0] * rad, l1 = a[1] * rad, p2 = b[0] * rad, l2 = b[1] * rad;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-9) return [a[0], a[1]];
  const A = Math.sin((1 - t) * d) / Math.sin(d), B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2), y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2), w = A * Math.sin(p1) + B * Math.sin(p2);
  return [Math.atan2(w, Math.sqrt(x * x + y * y)) / rad, Math.atan2(y, x) / rad];
}
/* a SIGMET's polygon made continuous across 180°, with its box, for quick tests */
export function prepArea(coords) {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const pts = []; let prev = coords[0][1];
  for (const [la, lo0] of coords) { let lo = lo0; while (lo - prev > 180) lo -= 360; while (lo - prev < -180) lo += 360; pts.push([la, lo]); prev = lo; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [la, lo] of pts) { if (lo < x0) x0 = lo; if (lo > x1) x1 = lo; if (la < y0) y0 = la; if (la > y1) y1 = la; }
  return { pts, x0, x1, y0, y1 };
}
function inPoly(lat, lon, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ya, xa] = poly[i], [yb, xb] = poly[j];
    if ((ya > lat) !== (yb > lat) && lon < ((xb - xa) * (lat - ya)) / (yb - ya) + xa) c = !c;
  }
  return c;
}
export function inArea(P, lat, lon) {
  if (!P || lat < P.y0 || lat > P.y1) return false;
  for (const k of [0, 360, -360, 720, -720]) { const x = lon + k; if (x >= P.x0 && x <= P.x1 && inPoly(lat, x, P.pts)) return true; }
  return false;
}
/* the level the aircraft should be at d nm ahead, toGo nm from its destination */
export function levelAhead(f, cruise, d, toGo) {
  const top = Math.max(cruise || 0, f.alt || 0);
  return Math.max(0, Math.min(top, (f.alt || 0) + 200 * d, 300 * Math.max(0, toGo - d)));
}
const isSigmet = (s) => /SIGMET/i.test(s.kind || '') && !/AIRMET|OUTLOOK/i.test(s.kind || '');
export const sigId = (s) => (String(s.fir || '').toUpperCase() + '|' + String(s.hazard || '').toUpperCase()).replace(/\s+/g, ' ');

/* the SIGMETs the rest of the route crosses: [{ s, d (nm ahead), lat, lon, t (when), alt (ft) }] in the order met */
export function sigmetsAhead(f, dest, sigs, now) {
  if (!dest || !isFinite(f.lat) || !isFinite(f.lon) || !(f.gs > 100)) return [];
  const toGo = nm(f.lat, f.lon, dest[0], dest[1]); if (!(toGo < 9000)) return [];
  const cruise = f.cruise || (f.alt >= 20000 ? f.alt : 33000), far = Math.min(toGo, AHEAD_NM, (f.gs * AHEAD_MIN) / 60);
  const areas = sigs.filter(isSigmet).map((s) => ({ s, P: prepArea(s.coords), from: timeOf(s.from), to: timeOf(s.to), lo: levelFt(s.base), hi: levelFt(s.top) })).filter((x) => x.P && (x.to == null || x.to > now));
  if (!areas.length) return [];
  const out = [], got = new Set();
  for (let d = 0; d <= far + 0.01; d += STEP_NM) {
    const [lat, lon] = toGo > 0 ? gcPoint([f.lat, f.lon], dest, Math.min(1, d / toGo)) : [f.lat, f.lon];
    const t = now + (d / f.gs) * 3600_000, alt = levelAhead(f, cruise, d, toGo);
    for (const a of areas) {
      if (got.has(a)) continue;
      if ((a.from != null && a.from > t) || (a.to != null && a.to < t)) continue;
      if ((a.lo != null && alt < a.lo - 1000) || (a.hi != null && alt > a.hi + 1000)) continue;
      if (!inArea(a.P, lat, lon)) continue;
      got.add(a); out.push({ s: a.s, d: Math.round(d), lat, lon, t, alt });
    }
  }
  return out;
}

const crewOf = (f) => ({ crew: 1, cs: f.cs, m: f.pilot || f.cid ? [{ pilot: f.pilot || '', cid: f.cid ? String(f.cid) : '', name: f.name && f.name !== f.pilot ? f.name : '' }] : [] });
const oneLine = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
/* { title, body } in the wording set on /admin (T: aoctpl.js's templates; the default without it) */
export function sigMsg(f, hits, now, T) {
  const items = hits.map((h, i) => {
    const s = h.s, lo = levelFt(s.base), hi = levelFt(s.top);
    const lev = lo != null || hi != null ? (lo ? fl(lo) : 'SFC') + '-' + (hi != null ? fl(hi) : '') : '';
    const val = timeOf(s.from) || timeOf(s.to) ? 'VALID ' + (timeOf(s.from) ? z(timeOf(s.from)) : '') + '-' + (timeOf(s.to) ? z(timeOf(s.to)) : '') : '';
    const mins = Math.round((h.t - now) / 60_000);
    const nmF = oneLine(s.firName, 30).toUpperCase(), fir = String(s.fir || '').toUpperCase();
    const where = nmF ? (fir && !nmF.includes(fir) && !/^[A-Z]{4}\b/.test(nmF) ? fir + ' ' : '') + nmF + (/\b(FIR|UIR|CTA)\b/.test(nmF) ? '' : ' FIR') : fir;
    const haz = oneLine([s.qualifier, s.hazard].filter(Boolean).join(' '), 40), mov = s.mov ? 'MOV ' + oneLine(s.mov, 20) : '';
    return { N: hits.length > 1 ? String(i + 1) : '', SUMMARY: [where, haz, lev, val, mov].filter(Boolean).join('  '), FIR: where, HAZARD: haz, LEVELS: lev, VALID: val, MOVE: mov,
      POSITION: h.d < STEP_NM ? 'YOU ARE IN IT NOW, ABOUT ' + fl(h.alt) : 'ABOUT ' + h.d + ' NM AHEAD, IN ABOUT ' + mins + ' MIN, NEAR ' + ll(h.lat, h.lon) + ', YOUR LEVEL ABOUT ' + fl(h.alt), RAW: s.raw ? oneLine(s.raw, 420) : '' };
  });
  return aocSigMsg(T, { CALLSIGN: f.cs, DEP: f.dep || '----', ARR: f.arr, CRUISE: f.cruise ? fl(f.cruise) : '' }, items);
}
export const sigText = (f, hits, now) => sigMsg(f, hits, now, null).body;

/* deps = { sigmets() -> { sigmets }, on: bool } */
export async function sigRouteWatch(env, live, deps, now = Date.now()) {
  const kv = env && env.STORE; if (!kv || !live || (deps && deps.on === false)) return { off: true };
  const air = (live.flights || []).filter((f) => f.cs && f.arr && f.gs > 100 && f.alt > 1500 && live.apts && live.apts[f.arr]);
  if (!air.length) return { flights: 0 };
  const sigs = await deps.sigmets().then((j) => (j && j.sigmets) || []).catch(() => []);
  if (!sigs.length) return { flights: air.length, sigmets: 0 };
  const raw = await kv.get(SENT, 'json'), sent = raw && typeof raw === 'object' ? raw : {}, out = [];
  for (const f of air) {
    const k = f.cs + ':' + (f.dep || '') + ':' + f.arr, rec = sent[k] || { t: now, ids: [] };
    if (rec.ids.length >= PER_FLIGHT) continue;
    const seen = new Set(rec.ids), hits = [];
    for (const h of sigmetsAhead(f, live.apts[f.arr], sigs, now)) { const id = sigId(h.s); if (!seen.has(id)) { seen.add(id); hits.push(h); } }
    if (!hits.length) continue;
    const use = hits.slice(0, PER_FLIGHT - rec.ids.length);
    try {
      const m = await aocSend(env, { ...sigMsg(f, use, now, await aocTpl(env).catch(() => null)), to: crewOf(f), push: true, by: 'AUTO' });
      sent[k] = { t: now, ids: [...rec.ids, ...use.map((h) => sigId(h.s))] }; out.push({ k, aoc: m.id, ids: sent[k].ids });
    } catch (e) { console.warn('[sigroute]', e && e.message); }
  }
  if (out.length) { for (const [k, v] of Object.entries(sent)) if (now - v.t > KEEP_MS) delete sent[k]; await kv.put(SENT, JSON.stringify(sent)); }
  return { flights: air.length, sent: out };
}
