/* ---------- Official AIP data for the EFB's map: China and Japan (Nov 2026) ----------
   China: the CAAC eAIP (https://www.eaipchina.cn/dataset) publishes the AIP as an AIXM 5.1.1 data set each AIRAC.
   Japan: JCAB's SWIM portal (AIP File Download, 3_AIP(Shapefile, KML)) publishes the AIP's map data as KML each AIRAC.
   Both need a sign-in that can't be done from here (China's has an image check), so an admin downloads the zip and drops
   it on /admin › Nav Data. The admin page opens it in the browser (China: every file checked against the SHA-256 in its
   checksum.xml), reduces it to what the EFB uses and sends only that here (POST /admin/api/navdata/cn or /jp). The next
   AIRAC can be uploaded early: the EFB switches to it by itself at its effective time (China: 00:00 Beijing, the day
   before the AIRAC date; Japan: 00:00 UTC on the AIRAC date).

   KV (STORE), with <p> = cnaip:v1: or jpaip:v1:
     <p>idx -> { at, cycles: [{ cycle, pub, eff, issue, ver, uid, file, sha, size, st, cells, at, by }] }
     <p>apt:<cycle> -> { ZGSZ: { i, ia, n, c, p, el, mv, rw: [{ d, len, wid, sfc, ends: [...] }], ils, fq } } (China only)
     <p>asp:<cycle> -> GeoJSON airspace with its limits
     <p>c:<cycle>:<lat>,<lon> -> one 8-degree cell of airways, fixes and navaids, as the IFR map's rows

   The pilots' side is for signed-in pilots only, because the data comes from AIPs that need an account:
     GET /api/efb/aip/ifr?lv=H|L&cell=lat,lon  airways, fixes and navaids of every region in one IFR cell
                                                (/api/efb/cn/ifr is the same, for EFBs from before Japan)
     GET /api/efb/cn/asp, /api/efb/jp/asp      the airspace
     GET /api/efb/cn/apt?icao=ZGSZ             runways with declared distances, ILS and approach frequencies */
const KEEP_PAST = 1, BODY_MAX = 12_000_000;
/* box: lat0, lon0, lat1, lon1 of what each covers, with a margin (China's Sanya FIR reaches far south; Japan's Fukuoka
   FIR far east over the Pacific) */
export const AIP_REG = {
  cn: { p: 'cnaip:v1:', box: [0, 70, 56, 140], product: /^AIP-DS$/i, apt: true, name: 'China' },
  jp: { p: 'jpaip:v1:', box: [17, 120, 50, 170], product: /^AIP-JP$/i, apt: false, name: 'Japan' },
};
const jsonRes = (body, status, headers) => new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

const IDX = {}, APT = {};
export async function cnIndex(env, fresh, rg) {
  const r = AIP_REG[rg || 'cn'], m = IDX[rg || 'cn'];
  if (!fresh && m && Date.now() - m.t < 60_000) return m.v;
  const v = await env.STORE.get(r.p + 'idx', 'json').catch(() => null); IDX[rg || 'cn'] = { v, t: Date.now() }; return v;
}
/* the uploaded AIRAC in force now: the newest one whose effective time has come */
export function cnActive(idx, now) {
  const t = now || Date.now();
  return ((idx && idx.cycles) || []).filter((c) => Date.parse(c.eff) <= t).sort((a, b) => Date.parse(b.eff) - Date.parse(a.eff))[0] || null;
}
const cellOk = (k) => /^-?\d{1,2},-?\d{1,3}$/.test(k) && +k.split(',')[0] % 8 === 0 && +k.split(',')[1] % 8 === 0;
const lineS = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);
const setIdx = (rg, v) => { IDX[rg] = { v, t: Date.now() }; delete APT[rg]; };

async function dropCycle(env, rg, c) {
  const kv = env.STORE, p = AIP_REG[rg].p, keys = [p + 'apt:' + c.cycle, p + 'asp:' + c.cycle];
  let cur; do { const l = await kv.list({ prefix: p + 'c:' + c.cycle + ':', cursor: cur }); l.keys.forEach((k) => keys.push(k.name)); cur = l.list_complete ? null : l.cursor; } while (cur);
  await Promise.all(keys.map((k) => kv.delete(k).catch(() => {})));
}

/* admin: POST /admin/api/navdata/cn|jp (an upload), POST /admin/api/navdata/cn|jp/delete { cycle } */
export async function cnAdmin(req, path, env, by) {
  const pm = path.match(/^\/admin\/api\/navdata\/(cn|jp)(\/delete)?$/); if (!pm) return jsonRes({ error: 'Not found' }, 404);
  const rg = pm[1], R = AIP_REG[rg], P = R.p;
  const kv = env.STORE, who = lineS(typeof by === 'string' ? by : (by && by.email) || '', 120), now = Date.now();
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405);
  if (!/application\/json/.test(req.headers.get('Content-Type') || '')) return jsonRes({ error: 'Send JSON' }, 415);
  if (pm[2]) {
    let b = {}; try { b = await req.json(); } catch (e) {}
    const idx = (await cnIndex(env, true, rg)) || { cycles: [] }, c = (idx.cycles || []).find((x) => x.cycle === String(b.cycle || ''));
    if (!c) return jsonRes({ error: 'That AIRAC is not uploaded' }, 404);
    idx.cycles = idx.cycles.filter((x) => x !== c); idx.at = now;
    await kv.put(P + 'idx', JSON.stringify(idx)); setIdx(rg, idx);
    await dropCycle(env, rg, c);
    return jsonRes({ ok: true, cycles: idx.cycles });
  }
  const t = await req.text();
  if (t.length > BODY_MAX) return jsonRes({ error: 'The data is too large' }, 413);
  let b; try { b = JSON.parse(t); } catch (e) { return jsonRes({ error: 'That is not JSON' }, 400); }
  const m = (b && b.meta) || {};
  if (!/^\d{6}$/.test(String(m.pub || '')) || !Date.parse(m.eff) || !R.product.test(String(m.product || ''))) return jsonRes({ error: 'The data set details are missing or wrong' }, 400);
  if (!b.apt || typeof b.apt !== 'object' || !b.asp || b.asp.type !== 'FeatureCollection' || !Array.isArray(b.asp.features) || !b.cells || typeof b.cells !== 'object') return jsonRes({ error: 'The data is incomplete' }, 400);
  const cells = Object.keys(b.cells).filter(cellOk);
  if ((R.apt && !Object.keys(b.apt).length) || !cells.length) return jsonRes({ error: R.apt ? 'The data set has no airports or airways' : 'The data set has no airways' }, 400);
  const cycle = String(m.pub).slice(2), eff = new Date(Date.parse(m.eff)).toISOString();
  await Promise.all([
    R.apt ? kv.put(P + 'apt:' + cycle, JSON.stringify(b.apt)) : null,
    kv.put(P + 'asp:' + cycle, JSON.stringify(b.asp)),
    ...cells.map((k) => { const c = b.cells[k] || {}; return kv.put(P + 'c:' + cycle + ':' + k, JSON.stringify({ routes: Array.isArray(c.routes) ? c.routes : [], fixes: Array.isArray(c.fixes) ? c.fixes : [], navs: Array.isArray(c.navs) ? c.navs : [] })); })]);
  /* a re-upload of the same AIRAC drops its old cells first, in case they differ */
  const idx = (await cnIndex(env, true, rg)) || { cycles: [] }, old = (idx.cycles || []).find((x) => x.cycle === cycle);
  if (old) { const stale = (old.cells || []).filter((k) => !cells.includes(k)); await Promise.all(stale.map((k) => kv.delete(P + 'c:' + cycle + ':' + k).catch(() => {}))); }
  const st = {}; Object.entries(b.st || {}).forEach(([k, v]) => { if (/^[a-zA-Z]{1,12}$/.test(k) && Number.isFinite(+v)) st[k] = +v; });
  const ent = { cycle, pub: String(m.pub), eff, issue: lineS(m.issue, 40), ver: lineS(m.ver, 12), uid: lineS(m.uid, 60), file: lineS(b.file, 160), sha: /^[0-9a-f]{64}$/.test(b.sha || '') ? b.sha : '', size: +b.size || 0, st, cells, at: now, by: who };
  const L = (idx.cycles || []).filter((x) => x.cycle !== cycle).concat([ent]).sort((a, c) => Date.parse(a.eff) - Date.parse(c.eff));
  /* keep what's in force now, everything uploaded for later, and the one before (to look back at); drop older ones */
  const act = cnActive({ cycles: L }, now), ai = act ? L.indexOf(act) : -1, keep = L.filter((x, i) => ai < 0 || i >= ai - KEEP_PAST), gone = L.filter((x) => !keep.includes(x));
  const out = { at: now, cycles: keep };
  await kv.put(P + 'idx', JSON.stringify(out)); setIdx(rg, out);
  await Promise.all(gone.map((c) => dropCycle(env, rg, c).catch(() => {})));
  return jsonRes({ ok: true, cycle, eff, active: (cnActive(out, now) || {}).cycle || null, cycles: keep });
}

/* one region's rows for one IFR cell: { cn: 'ok'|'none'|'outside', cycle, routes, fixes, navs } */
async function regionCell(env, rg, la, lo, sz) {
  const R = AIP_REG[rg], b = R.box, none = (why, cy) => ({ cn: why, cycle: cy || null, routes: [], fixes: [], navs: [] });
  if (la + sz <= b[0] || la >= b[2] || lo + sz <= b[1] || lo >= b[3]) return none('outside');
  const act = cnActive(await cnIndex(env, false, rg));
  if (!act) return none('none');
  const pk = (Math.floor(la / 8) * 8) + ',' + (Math.floor(lo / 8) * 8);
  if (!(act.cells || []).includes(pk)) return none('ok', act.cycle);
  const d = await env.STORE.get(R.p + 'c:' + act.cycle + ':' + pk, { type: 'json', cacheTtl: 3600 }).catch(() => null) || { routes: [], fixes: [], navs: [] };
  let { routes, fixes, navs } = d;
  if (sz === 4) { /* a 4-degree cell is a quarter of an 8-degree one */
    const inC = (x, y) => y >= la && y < la + 4 && x >= lo && x < lo + 4;
    routes = routes.filter((r) => { let x0 = 999, x1 = -999, y0 = 999, y1 = -999; (r[9] || []).forEach((g) => g.forEach((p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }));
      return x1 >= lo && x0 < lo + 4 && y1 >= la && y0 < la + 4; });
    fixes = fixes.filter((f) => inC(f[2], f[3])); navs = navs.filter((n) => inC(n[4], n[5]));
  }
  return { cn: 'ok', cycle: act.cycle, routes, fixes, navs };
}

/* named points (fixes and navaids) within km of a place, from the AIP data of China and Japan, for lining charts up
   on the Map: [[name, lat, lon], ...] */
export async function aipPoints(env, lat, lon, km = 300) {
  const out = [], seen = new Set(), c = Math.cos(lat * Math.PI / 180), dLa = km / 111.2, dLo = km / (111.2 * Math.max(0.2, c));
  const add = (n, la, lo) => { if (!n || !isFinite(la) || !isFinite(lo)) return; const d = Math.hypot(la - lat, (lo - lon) * c) * 111.2; if (d > km) return; const k = n + ',' + la.toFixed(4) + ',' + lo.toFixed(4); if (seen.has(k)) return; seen.add(k); out.push([String(n), +la, +lo]); };
  for (const rg of Object.keys(AIP_REG)) {
    const b = AIP_REG[rg].box; if (lat + dLa <= b[0] || lat - dLa >= b[2] || lon + dLo <= b[1] || lon - dLo >= b[3]) continue;
    for (let la = Math.floor((lat - dLa) / 4) * 4; la < lat + dLa; la += 4) for (let lo = Math.floor((lon - dLo) / 4) * 4; lo < lon + dLo; lo += 4) {
      const r = await regionCell(env, rg, la, lo, 4).catch(() => null); if (!r || r.cn !== 'ok') continue;
      for (const f of r.fixes) add(f[1], f[3], f[2]);
      for (const n of r.navs) add(n[1], n[5], n[4]);
    }
  }
  return out;
}

/* pilots: GET /api/efb/aip/ifr, /api/efb/cn/*, /api/efb/jp/asp (signed in) */
export async function cnPublic(req, url, env, h, me) {
  if (req.method !== 'GET') return jsonRes({ error: 'Method not allowed' }, 405, h);
  const path = url.pathname.replace(/\/+$/, ''), priv = { 'Cache-Control': 'private, max-age=1800', Vary: 'Authorization' };
  if (path === '/api/efb/aip/ifr' || path === '/api/efb/cn/ifr') {
    const lv = url.searchParams.get('lv') === 'H' ? 'H' : 'L', sz = lv === 'H' ? 8 : 4;
    const m = String(url.searchParams.get('cell') || '').match(/^(-?\d{1,2}),(-?\d{1,3})$/); if (!m) return jsonRes({ error: 'cell=lat,lon' }, 400, h);
    const la = +m[1], lo = +m[2]; if (la % sz || lo % sz) return jsonRes({ error: 'cell must be on the ' + sz + ' degree grid' }, 400, h);
    const regs = path === '/api/efb/cn/ifr' ? ['cn'] : Object.keys(AIP_REG);
    const inside = regs.filter((rg) => { const b = AIP_REG[rg].box; return !(la + sz <= b[0] || la >= b[2] || lo + sz <= b[1] || lo >= b[3]); });
    const out = { lv, cell: [la, lo], routes: [], fixes: [], navs: [], cn: inside.length ? (me ? 'none' : 'signin') : 'outside', cycle: null, cycles: {} };
    if (inside.length && me) {
      for (const rg of inside) {
        const r = await regionCell(env, rg, la, lo, sz);
        if (r.cn !== 'ok') continue;
        out.cn = 'ok'; out.cycles[rg] = r.cycle; if (!out.cycle) out.cycle = r.cycle;
        out.routes.push(...r.routes); out.fixes.push(...r.fixes); out.navs.push(...r.navs);
      }
    }
    return jsonRes(out, 200, { ...h, ...priv });
  }
  const pm = path.match(/^\/api\/efb\/(cn|jp)\/(asp|apt)$/); if (!pm) return jsonRes({ error: 'Not found' }, 404, h);
  const rg = pm[1], R = AIP_REG[rg];
  if (!me) return jsonRes({ error: 'Sign in to see ' + R.name + ' AIP data', signin: true }, 401, h);
  const act = cnActive(await cnIndex(env, false, rg));
  if (pm[2] === 'asp') {
    if (!act) return jsonRes({ cycle: null, fc: { type: 'FeatureCollection', features: [] } }, 200, { ...h, ...priv });
    const raw = await env.STORE.get(R.p + 'asp:' + act.cycle, { cacheTtl: 3600 }).catch(() => null);
    const body = '{"cycle":' + JSON.stringify(act.cycle) + ',"eff":' + JSON.stringify(act.eff) + ',"fc":' + (raw || '{"type":"FeatureCollection","features":[]}') + '}';
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...h, ...priv } });
  }
  if (!R.apt) return jsonRes({ error: 'Not found' }, 404, h);
  const icao = String(url.searchParams.get('icao') || '').trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(icao)) return jsonRes({ error: 'Enter a 4 letter ICAO code' }, 400, h);
  if (!act) return jsonRes({ cycle: null, apt: null }, 200, { ...h, ...priv });
  if (!APT[rg] || APT[rg].cycle !== act.cycle) { const v = await env.STORE.get(R.p + 'apt:' + act.cycle, { type: 'json', cacheTtl: 3600 }).catch(() => null); APT[rg] = { cycle: act.cycle, v: v || {} }; }
  return jsonRes({ cycle: act.cycle, eff: act.eff, apt: APT[rg].v[icao] || null }, 200, { ...h, ...priv });
}
