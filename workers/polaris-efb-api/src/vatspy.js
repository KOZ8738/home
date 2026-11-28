/* VATSIM air traffic control on the map: the area each online controller covers.
   VATSIM's data feed names a controller's callsign, facility and frequency, but not where they control: the area is
   worked out from the callsign, as VATSpy and the other VATSIM maps do.
   - centre (CTR) and flight service (FSS): the VATSpy Data Project's FIRs (VATSpy.dat: a callsign prefix, or the FIR's
     own code, to its outline in Boundaries.geojson); failing that its UIRs (one UIR is several FIRs, lit together)
   - approach and departure (APP/DEP): the SimAware TRACON Project's outlines, by callsign prefix (and suffix, where an
     outline names one); an approach with no outline gets a circle of CIRCLE_NM round its airport
   - delivery, ground and tower (DEL/GND/TWR) and ATIS: their airport (VATSpy.dat's airports, by ICAO code or by the
     local code that US callsigns use), shown on the map as the airport's D/G/T/A marks
   Both data sets are CC BY-SA 4.0. The outlines are simplified to about 1 km (TRACONs about 500 m) when the index is
   built: outside the Worker (scripts/atc-index.mjs, every week by a GitHub Action), packed into KV (atcPack) and read
   back a piece at a time (atcOpen); each answer then carries only the outlines of the areas online. */

const SRC = {
  dat: 'https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/VATSpy.dat',
  bnd: 'https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson',
  tra: 'https://github.com/vatsimnetwork/simaware-tracon-project/releases/latest/download/TRACONBoundaries.geojson',
};
export const CIRCLE_NM = 30;
/* VATSIM controller ratings (the feed's `ratings` list) */
const RATING = ['', 'OBS', 'S1', 'S2', 'S3', 'C1', 'C2', 'C3', 'I1', 'I2', 'I3', 'SUP', 'ADM'];
/* facility 2, 3, 4 -> the airport's mark */
const FAC_MARK = { 2: 'D', 3: 'G', 4: 'T' };

const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** VATSpy.dat -> { Countries: [[...]], Airports: [[...]], FIRs: [[...]], UIRs: [[...]], ... } (rows of | fields) */
export function parseVatspy(text) {
  const S = {}; let sec = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l[0] === ';') continue;
    const m = l.match(/^\[(.+)\]$/); if (m) { sec = m[1]; if (!S[sec]) S[sec] = []; continue; }
    if (sec) S[sec].push(l.split('|').map((s) => s.trim()));
  }
  return S;
}

/* Douglas–Peucker, in degrees; the points rounded to 3 decimals (about 100 m) */
function simplify(pts, tol) {
  if (!Array.isArray(pts)) return [];
  const p = pts.filter((q) => Array.isArray(q) && isFinite(q[0]) && isFinite(q[1]));
  if (p.length < 5) return p.map((q) => [r3(+q[0]), r3(+q[1])]);
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1; const st = [[0, p.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1; const x1 = +p[a][0], y1 = +p[a][1], dx = +p[b][0] - x1, dy = +p[b][1] - y1, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const x = +p[i][0], y = +p[i][1]; let d;
      if (!L) d = Math.hypot(x - x1, y - y1); else { const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L)); d = Math.hypot(x - x1 - t * dx, y - y1 - t * dy); }
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  const out = [];
  for (let i = 0; i < p.length; i++) if (keep[i]) out.push([r3(+p[i][0]), r3(+p[i][1])]);
  return out;
}
/* the polygons of a Polygon / MultiPolygon, simplified: each [outer ring, holes...] (the maps fill each polygon
   even-odd on its own, so a hole stays a hole and two polygons that overlap do not cut each other out) */
function polysOf(g, tol) {
  const polys = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const out = [];
  for (const pl of polys || []) {
    const outer = simplify((pl || [])[0], tol); if (outer.length < 4) continue;
    out.push([outer, ...pl.slice(1).map((r) => simplify(r, tol)).filter((r) => r.length >= 4)]);
  }
  return out;
}
/* polygons added to a list unless the same one is there already (VATSpy and SimAware repeat some outlines) */
function addPolys(list, polys) {
  const seen = new Set(list.map((p) => JSON.stringify(p)));
  for (const p of polys) { const k = JSON.stringify(p); if (!seen.has(k)) { seen.add(k); list.push(p); } }
  return list;
}
/* features may come nested (the TRACON file has one FeatureCollection inside its features) */
function flat(fs, out = []) {
  for (const f of fs || []) { if (f && Array.isArray(f.features)) flat(f.features, out); else if (f && f.geometry) out.push(f); }
  return out;
}
function bboxOf(polys) {
  let a = 180, b = 90, c = -180, d = -90;
  for (const pl of polys) for (const r of pl) for (const [x, y] of r) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
}

/** The lookup tables, from the three files as read (VATSpy.dat text, the two GeoJSON objects):
 *   fir: callsign key (prefix, or the FIR's code with "-" as "_") -> [boundary id, name]
 *   uir: UIR id -> [[boundary ids], name]
 *   bnd: boundary id -> { r: polygons, lx, ly, oc }   tra: callsign prefix -> [[TRACON key, suffix]]
 *   trc: TRACON key -> { r: polygons, nm, lx, ly }    apt: ICAO -> [lat, lon, name]
 *   (a polygon: [outer ring, holes...], each ring [[lon, lat], ...])
 *   lid: local / IATA code -> ICAO, or [lat, lon, name, ICAO] for VATSpy's pseudo airports (positions such as SOLENT) */
export function atcIndex(datText, boundaries, tracons) {
  const S = parseVatspy(datText);
  const fir = {}, byCode = {}, uir = {}, bnd = {}, tra = {}, trc = {}, apt = {}, lid = {};
  /* outlines first: a FIR or UIR without one is left out */
  for (const f of flat(boundaries && boundaries.features)) {
    const p = f.properties || {}, id = String(p.id || '').toUpperCase(); if (!id) continue;
    const rings = polysOf(f.geometry, 0.01); if (!rings.length) continue;
    const e = bnd[id];
    if (e) { addPolys(e.r, rings); continue; }
    const lx = +p.label_lon, ly = +p.label_lat;
    bnd[id] = { r: addPolys([], rings), lx: isFinite(lx) ? r3(lx) : null, ly: isFinite(ly) ? r3(ly) : null, oc: String(p.oceanic) === '1' ? 1 : 0 };
  }
  for (const [icao, name, prefix, b] of S.FIRs || []) {
    if (!icao) continue;
    const bid = String(b || icao).toUpperCase(); if (!bnd[bid]) continue;
    /* a prefix as callsigns use it (some have "-": ML-ASP_CTR, NZCH-B_CTR); a FIR code with "-" as callsigns write it ("_") */
    const pk = String(prefix || '').toUpperCase(), ck = icao.toUpperCase().replace(/-/g, '_');
    if (pk && !fir[pk]) fir[pk] = [bid, name || ''];
    if (!byCode[ck]) byCode[ck] = [bid, name || ''];
  }
  /* a FIR's own code answers where no FIR uses it as a callsign prefix */
  for (const [k, v] of Object.entries(byCode)) if (!fir[k]) fir[k] = v;
  for (const [id, name, list] of S.UIRs || []) {
    if (!id) continue;
    const ids = String(list || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      .map((c) => (byCode[c.replace(/-/g, '_')] ? byCode[c.replace(/-/g, '_')][0] : c)).filter((c, i, a) => bnd[c] && a.indexOf(c) === i);
    if (ids.length) uir[id.toUpperCase()] = [ids, name || ''];
  }
  /* airports: a real airport's row wins over a pseudo one with the same code */
  const rows = (S.Airports || []).filter((r) => r[0] && isFinite(+r[2]) && isFinite(+r[3]));
  for (const pass of ['0', '1']) for (const r of rows) {
    const [icao, name, la, lo, code, , pseudo] = r, ic = icao.toUpperCase(), ps = pseudo === '1' ? '1' : '0';
    if (ps !== pass) continue;
    if (!apt[ic]) apt[ic] = [r4(+la), r4(+lo), name || ''];
    const lc = String(code || '').toUpperCase();
    if (lc && lc !== ic && lid[lc] == null && !apt[lc]) lid[lc] = ps === '1' ? [r4(+la), r4(+lo), name || '', ic] : ic;
  }
  /* TRACONs: one key per outline (the same id is used by several outlines) */
  const used = {};
  for (const f of flat(tracons && tracons.features)) {
    const p = f.properties || {}, id = String(p.id || '').toUpperCase(); if (!id) continue;
    const rings = polysOf(f.geometry, 0.005); if (!rings.length) continue;
    used[id] = (used[id] || 0) + 1;
    const key = used[id] > 1 ? id + '#' + used[id] : id, lx = +p.label_lon, ly = +p.label_lat;
    trc[key] = { r: addPolys([], rings), nm: String(p.name || ''), lx: isFinite(lx) ? r3(lx) : null, ly: isFinite(ly) ? r3(ly) : null };
    const suf = String(p.suffix || '').toUpperCase();
    for (const pre of Array.isArray(p.prefix) ? p.prefix : [p.prefix]) {
      const k = String(pre || '').toUpperCase(); if (!k) continue;
      (tra[k] || (tra[k] = [])).push([key, suf]);
    }
  }
  return { fir, uir, bnd, tra, trc, apt, lid, n: { fir: Object.keys(fir).length, bnd: Object.keys(bnd).length, tra: Object.keys(trc).length, apt: Object.keys(apt).length }, built: new Date().toISOString() };
}

/** downloads the three files and builds the index (throws when VATSpy's two files can't be read; without the TRACONs
 *  the approaches get circles) */
export async function atcBuild(get) {
  const fetchT = get || ((u) => fetch(u, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)' } }));
  const [dat, bnd, tra] = await Promise.all([
    fetchT(SRC.dat).then((r) => { if (!r.ok) throw new Error('VATSpy.dat HTTP ' + r.status); return r.text(); }),
    fetchT(SRC.bnd).then((r) => { if (!r.ok) throw new Error('VATSpy boundaries HTTP ' + r.status); return r.json(); }),
    fetchT(SRC.tra).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  return atcIndex(dat, bnd, tra);
}

/* a circle of `nm` nautical miles round a point, as a ring (good enough at a TRACON's size) */
function circle(lat, lon, nm) {
  const out = [], d = nm / 60, k = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) { const a = (i / 48) * 2 * Math.PI; out.push([r3(lon + (d * Math.sin(a)) / k), r3(lat + d * Math.cos(a))]); }
  return out;
}
/* FNV-1a, for the answer's ETag */
function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }

/* ---- the index as the Worker keeps it (KV), and reading it back ----
   The Workers Free plan gives a request 10 ms of CPU: too little to build the index (about 200 ms), or even to parse all
   of it (2.4 MB of JSON, about 35 ms) when an isolate starts. So it is built outside the Worker (scripts/atc-index.mjs,
   by a GitHub Action) and written to KV as three values that the Worker reads without parsing them whole:
     lk   JSON, the callsign tables (fir, uir, tra, lid: about 180 KB) and the build's id `b`;
     geo  text: a first line of JSON, { key: [start, length] } ('B:' + boundary id, 'T:' + TRACON key), then the
          records themselves (JSON) one after another: one is parsed when an area with it comes online;
     apt  text: one fixed-width line per airport (ICAO, latitude, longitude, name), sorted by ICAO: found by halving.
   The geo and apt values are written under the build's id first and lk last, so a reader never mixes two builds. */
const APT_W = { k: 8, la: 10, lo: 11, n: 40 }, APT_REC = APT_W.k + APT_W.la + APT_W.lo + APT_W.n + 1;
/** the lookups atcOnline asks of an index, over atcIndex()'s plain tables */
export function atcLookup(full) {
  return { fir: full.fir, uir: full.uir, tra: full.tra, lid: full.lid, n: full.n, id: full.id || '',
    getB: (id) => full.bnd[id] || null, getT: (k) => full.trc[k] || null, getA: (c) => full.apt[c] || null };
}
/** atcIndex() -> { id, lk, geo, apt }: the three values to keep (strings) */
export function atcPack(full) {
  const off = {}, parts = []; let at = 0;
  const put = (key, v) => { const s = JSON.stringify(v); off[key] = [at, s.length]; parts.push(s); at += s.length; };
  for (const [id, v] of Object.entries(full.bnd)) put('B:' + id, v);
  for (const [k, v] of Object.entries(full.trc)) put('T:' + k, v);
  const body = parts.join('');
  const cut = (v, w) => { const s = String(v); return s.length > w ? s.slice(0, w) : s.padEnd(w); };
  const apt = Object.keys(full.apt).filter((k) => k.length <= APT_W.k && !/\s/.test(k)).sort()
    .map((k) => { const a = full.apt[k]; return cut(k, APT_W.k) + cut(a[0], APT_W.la) + cut(a[1], APT_W.lo) + cut(String(a[2]).replace(/[\r\n]/g, ' '), APT_W.n) + '\n'; }).join('');
  /* the build's id: when, and a hash of all it holds (a build that changes only the callsign tables is a new build) */
  const tables = JSON.stringify([full.fir, full.uir, full.tra, full.lid]), id = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '-' + hash(body + '|' + tables + '|' + apt);
  const lk = { v: 2, id, built: full.built || new Date().toISOString(), n: full.n, aw: APT_REC, fir: full.fir, uir: full.uir, tra: full.tra, lid: full.lid };
  return { id, lk: JSON.stringify(lk), geo: JSON.stringify(off) + '\n' + body, apt };
}
/** the lookups over the three kept values (lk parsed; geo and apt as text); records are parsed when first asked for */
export function atcOpen(lk, geo, apt) {
  const nl = geo.indexOf('\n'), off = JSON.parse(geo.slice(0, nl)), base = nl + 1, gm = new Map(), am = new Map();
  const rec = (key) => {
    if (gm.has(key)) return gm.get(key);
    const o = off[key]; let v = null;
    if (o) { try { v = JSON.parse(geo.substr(base + o[0], o[1])); } catch (e) { v = null; } }
    gm.set(key, v); return v;
  };
  const W = lk.aw || APT_REC, n = Math.floor(apt.length / W);
  const getA = (c) => {
    if (am.has(c)) return am.get(c);
    let lo = 0, hi = n - 1, v = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, p = mid * W, k = apt.substr(p, APT_W.k).trimEnd();
      if (k === c) { v = [+apt.substr(p + APT_W.k, APT_W.la), +apt.substr(p + APT_W.k + APT_W.la, APT_W.lo), apt.substr(p + APT_W.k + APT_W.la + APT_W.lo, APT_W.n).trimEnd()]; break; }
      if (k < c) lo = mid + 1; else hi = mid - 1;
    }
    am.set(c, v); return v;
  };
  return { fir: lk.fir, uir: lk.uir, tra: lk.tra, lid: lk.lid, n: lk.n, id: lk.id, getB: (id) => rec('B:' + id), getT: (k) => rec('T:' + k), getA };
}

/** The controllers online and what they cover, from vatsimFeed()'s `ctl` and `atis` (index.js) and the index:
 *   areas: [{ k, t: 'ctr'|'fss'|'app', id, nm, lx, ly, bl: [lon, lat] (an approach's bottom middle), r: polygons, cs: [callsigns] }]
 *          centres first, the biggest first, then the approaches (drawn in that order, the small ones on top)
 *   ctl:   [{ cs, cid, n, f, fac, rt, on, k (its area, or ''), ap (its airport, or ''), x (controller info) }]
 *   atis:  [{ cs, f, code, ap, on, x }]
 *   apts:  { ICAO: [lat, lon, name, marks] }, marks: the letters of D, G, T, A online
 *   h:     a hash of all that, the same while nothing changes (the ETag)
 *  ix: atcLookup(atcIndex(...)) or atcOpen(...) */
export function atcOnline(d, ix) {
  const areas = new Map(), apts = {}, ctl = [], atis = [];
  const aptOf = (code) => {
    const c = String(code || '').toUpperCase(), a = ix.getA(c); if (a) return [c, a[0], a[1], a[2]];
    const l = ix.lid[c];
    /* a US airport VATSpy lists without its local code (ALI_TWR: KALI) */
    if (l == null) { const k = /^[A-Z]{3}$/.test(c) && ix.getA('K' + c); return k ? ['K' + c, k[0], k[1], k[2]] : null; }
    if (typeof l === 'string') { const b = ix.getA(l); return b ? [l, b[0], b[1], b[2]] : null; }
    return [l[3], l[0], l[1], l[2]];
  };
  const mark = (code, letter) => {
    const a = aptOf(code); if (!a) return '';
    const e = apts[a[0]] || (apts[a[0]] = [a[1], a[2], a[3], '']);
    if (letter && !e[3].includes(letter)) e[3] = 'DGTA'.split('').filter((l) => l === letter || e[3].includes(l)).join('');
    return a[0];
  };
  const area = (k, t, id, nm, rings, lx, ly) => {
    let a = areas.get(k);
    if (!a) {
      const b = bboxOf(rings);
      a = { k, t, id, nm, lx: lx != null ? lx : r3((b[0] + b[2]) / 2), ly: ly != null ? ly : r3((b[1] + b[3]) / 2), bl: [r3((b[0] + b[2]) / 2), r3(b[1])], r: rings, cs: [], _a: (b[2] - b[0]) * (b[3] - b[1]) };
      areas.set(k, a);
    }
    return a;
  };
  const firArea = (bid, nm, t) => { const b = ix.getB(bid); return b ? area('F:' + bid, t, bid, nm, b.r, b.lx, b.ly) : null; };
  const uirArea = (id, u, t) => {
    const rings = [], lab = [];
    for (const bid of u[0]) { const b = ix.getB(bid); if (!b) continue; addPolys(rings, b.r); if (b.lx != null) lab.push([b.lx, b.ly]); }
    if (!rings.length) return null;
    return area('U:' + id, t, id, u[1], rings, lab.length ? r3(lab.reduce((s, p) => s + p[0], 0) / lab.length) : null, lab.length ? r3(lab.reduce((s, p) => s + p[1], 0) / lab.length) : null);
  };
  /* the TRACON outlines a callsign lights: those naming its suffix, else those naming none (`exact`: suffix only) */
  const traArea = (pre, cs, exact, t) => {
    for (let n = pre.length; n >= 1; n--) {
      const key = pre.slice(0, n).join('_'), cand = ix.tra[key]; if (!cand) continue;
      const bySuf = cand.filter(([, s]) => s && cs.endsWith('_' + s));
      const pick = bySuf.length ? bySuf : exact ? [] : cand.filter(([, s]) => !s);
      if (!pick.length) continue;
      const keys = [...new Set(pick.map((p) => p[0]))].filter((k) => ix.getT(k)).sort(); if (!keys.length) continue;
      const rings = [], t0 = ix.getT(keys[0]);
      for (const k of keys) addPolys(rings, ix.getT(k).r);
      return area('T:' + keys.join('+'), t, key, t0.nm, rings, t0.lx, t0.ly);
    }
    return null;
  };
  const ctrArea = (pre, cs, fss) => {
    for (let n = pre.length; n >= 1; n--) {
      const key = pre.slice(0, n).join('_');
      const f = ix.fir[key], u = ix.uir[key];
      if (fss && u) return uirArea(key, u, 'fss');
      if (f) { const a = firArea(f[0], f[1], fss ? 'fss' : 'ctr'); if (a) return a; }
      if (u) return uirArea(key, u, fss ? 'fss' : 'ctr');
    }
    return null;
  };
  for (const c of (d && d.ctl) || []) {
    const fac = +c.fac || 0; if (!fac) continue; // observers and supervisors
    const cs = String(c.cs || '').toUpperCase(), parts = cs.split('_').filter(Boolean); if (parts.length < 2) continue;
    const pre = parts.slice(0, -1);
    let a = null, ap = '';
    /* SimAware draws a few approach units that log on as _CTR */
    if (fac === 6) a = traArea(pre, cs, true, 'ctr') || ctrArea(pre, cs, false);
    else if (fac === 1) a = ctrArea(pre, cs, true);
    else if (fac === 5) {
      const p = aptOf(pre[0]); ap = p ? p[0] : '';
      a = traArea(pre, cs, false, 'app') || (p ? area('C:' + p[0], 'app', p[0], p[3], [[circle(p[1], p[2], CIRCLE_NM)]], p[2], p[1]) : null);
    } else if (FAC_MARK[fac]) ap = mark(pre[0], FAC_MARK[fac]);
    if (a) { a.cs.push(cs); if (fac === 6 && a.t === 'fss') a.t = 'ctr'; } // a centre and a flight service on one FIR: a centre
    ctl.push({ cs, cid: c.cid || 0, n: String(c.n || '').slice(0, 60), f: String(c.f || ''), fac: parts[parts.length - 1], rt: RATING[+c.r] || '', on: c.on || '', k: a ? a.k : '', ap, x: String(c.x || '').slice(0, 600) });
  }
  for (const s of (d && d.atis) || []) {
    const cs = String(s.cs || '').toUpperCase(), ap = mark(cs.split('_')[0], 'A');
    atis.push({ cs, f: String(s.f || ''), code: String(s.code || ''), ap, on: s.on || '', x: String(s.x || '').replace(/\n/g, ' ').slice(0, 1000) });
  }
  const order = { ctr: 0, fss: 0, app: 1 };
  const list = [...areas.values()].sort((p, q) => order[p.t] - order[q.t] || q._a - p._a || (p.k < q.k ? -1 : 1)).map(({ _a, ...a }) => a);
  ctl.sort((p, q) => (p.cs < q.cs ? -1 : p.cs > q.cs ? 1 : 0));
  atis.sort((p, q) => (p.cs < q.cs ? -1 : p.cs > q.cs ? 1 : 0));
  const body = { areas: list, ctl, atis, apts }, json = JSON.stringify(body), out = { ...body, h: hash(json) };
  /* the same as JSON, for the answer (not enumerable: not part of the object itself) */
  Object.defineProperty(out, 'json', { value: json });
  return out;
}
