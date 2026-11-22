/* ---------- China AIP data set (CAAC eAIP, AIP-DS) for the EFB (Nov 2026) ----------
   The CAAC eAIP (https://www.eaipchina.cn/dataset) publishes China's AIP as an AIXM 5.1.1 data set each AIRAC. It
   needs a sign-in with an image check, so it can't be fetched from here: an admin downloads the zip and drops it on
   /admin › Nav Data. The admin page opens it in the browser, checks every file against the SHA-256 in its checksum.xml,
   reduces the AIXM to what the EFB uses and sends only that here (POST /admin/api/navdata/cn). The next AIRAC can be
   uploaded early: the EFB switches to it by itself at the data set's own effective time.

   KV (STORE): cnaip:v1:idx -> { at, cycles: [{ cycle, pub, eff, issue, ver, uid, file, sha, size, st, cells, at, by }] }
               cnaip:v1:apt:<cycle> -> { ZGSZ: { i, ia, n, c, p, el, mv, rw: [{ d, len, wid, sfc, ends: [...] }], ils, fq } }
               cnaip:v1:asp:<cycle> -> GeoJSON: R, D, P, TMA, CTA and ADIZ airspace with their limits
               cnaip:v1:c:<cycle>:<lat>,<lon> -> one 8-degree cell of airways, fixes and navaids, as the IFR map's rows

   The pilots' side is for signed-in pilots only, because the data set comes from an AIP that needs an account:
     GET /api/efb/cn/ifr?lv=H|L&cell=lat,lon  airways, fixes and navaids for one IFR cell (empty outside China)
     GET /api/efb/cn/asp                       the airspace
     GET /api/efb/cn/apt?icao=ZGSZ             runways with declared distances, ILS and approach frequencies */
const P = 'cnaip:v1:', KEEP_PAST = 1, BODY_MAX = 12_000_000;
const CN_BOX = [0, 70, 56, 140]; /* lat0, lon0, lat1, lon1: what the data set covers (the Sanya FIR reaches far south), with a margin */
const jsonRes = (body, status, headers) => new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

let IDX = null, IDXT = 0, APT = null;
export async function cnIndex(env, fresh) {
  if (!fresh && IDXT && Date.now() - IDXT < 60_000) return IDX;
  IDX = await env.STORE.get(P + 'idx', 'json').catch(() => null); IDXT = Date.now(); return IDX;
}
/* the uploaded AIRAC in force now: the newest one whose effective time has come */
export function cnActive(idx, now) {
  const t = now || Date.now();
  return ((idx && idx.cycles) || []).filter((c) => Date.parse(c.eff) <= t).sort((a, b) => Date.parse(b.eff) - Date.parse(a.eff))[0] || null;
}
const cellOk = (k) => /^-?\d{1,2},-?\d{1,3}$/.test(k) && +k.split(',')[0] % 8 === 0 && +k.split(',')[1] % 8 === 0;
const lineS = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);

async function dropCycle(env, c) {
  const kv = env.STORE, keys = [P + 'apt:' + c.cycle, P + 'asp:' + c.cycle];
  let cur; do { const l = await kv.list({ prefix: P + 'c:' + c.cycle + ':', cursor: cur }); l.keys.forEach((k) => keys.push(k.name)); cur = l.list_complete ? null : l.cursor; } while (cur);
  await Promise.all(keys.map((k) => kv.delete(k).catch(() => {})));
}

/* admin: POST /admin/api/navdata/cn (an upload), POST /admin/api/navdata/cn/delete { cycle } */
export async function cnAdmin(req, path, env, by) {
  const kv = env.STORE, who = lineS(typeof by === 'string' ? by : (by && by.email) || '', 120), now = Date.now();
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405);
  if (!/application\/json/.test(req.headers.get('Content-Type') || '')) return jsonRes({ error: 'Send JSON' }, 415);
  if (path === '/admin/api/navdata/cn/delete') {
    let b = {}; try { b = await req.json(); } catch (e) {}
    const idx = (await cnIndex(env, true)) || { cycles: [] }, c = (idx.cycles || []).find((x) => x.cycle === String(b.cycle || ''));
    if (!c) return jsonRes({ error: 'That AIRAC is not uploaded' }, 404);
    idx.cycles = idx.cycles.filter((x) => x !== c); idx.at = now;
    await kv.put(P + 'idx', JSON.stringify(idx)); IDX = idx; IDXT = Date.now(); APT = null;
    await dropCycle(env, c);
    return jsonRes({ ok: true, cycles: idx.cycles });
  }
  const t = await req.text();
  if (t.length > BODY_MAX) return jsonRes({ error: 'The data is too large' }, 413);
  let b; try { b = JSON.parse(t); } catch (e) { return jsonRes({ error: 'That is not JSON' }, 400); }
  const m = (b && b.meta) || {};
  if (!/^\d{6}$/.test(String(m.pub || '')) || !Date.parse(m.eff) || (m.product && !/^AIP-DS$/i.test(m.product))) return jsonRes({ error: 'The data set details are missing or wrong' }, 400);
  if (!b.apt || typeof b.apt !== 'object' || !b.asp || b.asp.type !== 'FeatureCollection' || !Array.isArray(b.asp.features) || !b.cells || typeof b.cells !== 'object') return jsonRes({ error: 'The data is incomplete' }, 400);
  const cells = Object.keys(b.cells).filter(cellOk);
  if (!Object.keys(b.apt).length || !cells.length) return jsonRes({ error: 'The data set has no airports or airways' }, 400);
  const cycle = String(m.pub).slice(2), eff = new Date(Date.parse(m.eff)).toISOString();
  await Promise.all([
    kv.put(P + 'apt:' + cycle, JSON.stringify(b.apt)),
    kv.put(P + 'asp:' + cycle, JSON.stringify(b.asp)),
    ...cells.map((k) => { const c = b.cells[k] || {}; return kv.put(P + 'c:' + cycle + ':' + k, JSON.stringify({ routes: Array.isArray(c.routes) ? c.routes : [], fixes: Array.isArray(c.fixes) ? c.fixes : [], navs: Array.isArray(c.navs) ? c.navs : [] })); })]);
  /* a re-upload of the same AIRAC drops its old cells first, in case they differ */
  const idx = (await cnIndex(env, true)) || { cycles: [] }, old = (idx.cycles || []).find((x) => x.cycle === cycle);
  if (old) { const stale = (old.cells || []).filter((k) => !cells.includes(k)); await Promise.all(stale.map((k) => kv.delete(P + 'c:' + cycle + ':' + k).catch(() => {}))); }
  const st = {}; Object.entries(b.st || {}).forEach(([k, v]) => { if (/^[a-zA-Z]{1,12}$/.test(k) && Number.isFinite(+v)) st[k] = +v; });
  const ent = { cycle, pub: String(m.pub), eff, issue: lineS(m.issue, 40), ver: lineS(m.ver, 12), uid: lineS(m.uid, 60), file: lineS(b.file, 160), sha: /^[0-9a-f]{64}$/.test(b.sha || '') ? b.sha : '', size: +b.size || 0, st, cells, at: now, by: who };
  const L = (idx.cycles || []).filter((x) => x.cycle !== cycle).concat([ent]).sort((a, c) => Date.parse(a.eff) - Date.parse(c.eff));
  /* keep what's in force now, everything uploaded for later, and the one before (to look back at); drop older ones */
  const act = cnActive({ cycles: L }, now), ai = act ? L.indexOf(act) : -1, keep = L.filter((x, i) => ai < 0 || i >= ai - KEEP_PAST), gone = L.filter((x) => !keep.includes(x));
  const out = { at: now, cycles: keep };
  await kv.put(P + 'idx', JSON.stringify(out)); IDX = out; IDXT = Date.now(); APT = null;
  await Promise.all(gone.map((c) => dropCycle(env, c).catch(() => {})));
  return jsonRes({ ok: true, cycle, eff, active: (cnActive(out, now) || {}).cycle || null, cycles: keep });
}

/* pilots: GET /api/efb/cn/* (signed in) */
export async function cnPublic(req, url, env, h, me) {
  if (req.method !== 'GET') return jsonRes({ error: 'Method not allowed' }, 405, h);
  const path = url.pathname.replace(/\/+$/, ''), priv = { 'Cache-Control': 'private, max-age=1800', Vary: 'Authorization' };
  if (path === '/api/efb/cn/ifr') {
    const lv = url.searchParams.get('lv') === 'H' ? 'H' : 'L', sz = lv === 'H' ? 8 : 4;
    const m = String(url.searchParams.get('cell') || '').match(/^(-?\d{1,2}),(-?\d{1,3})$/); if (!m) return jsonRes({ error: 'cell=lat,lon' }, 400, h);
    const la = +m[1], lo = +m[2]; if (la % sz || lo % sz) return jsonRes({ error: 'cell must be on the ' + sz + ' degree grid' }, 400, h);
    const empty = (why, cy) => jsonRes({ lv, cell: [la, lo], routes: [], fixes: [], navs: [], cn: why, cycle: cy || null }, 200, { ...h, ...priv });
    if (la + sz <= CN_BOX[0] || la >= CN_BOX[2] || lo + sz <= CN_BOX[1] || lo >= CN_BOX[3]) return empty('outside');
    if (!me) return empty('signin');
    const act = cnActive(await cnIndex(env));
    if (!act) return empty('none');
    const pk = (Math.floor(la / 8) * 8) + ',' + (Math.floor(lo / 8) * 8);
    if (!(act.cells || []).includes(pk)) return empty('ok', act.cycle);
    const d = await env.STORE.get(P + 'c:' + act.cycle + ':' + pk, { type: 'json', cacheTtl: 3600 }).catch(() => null) || { routes: [], fixes: [], navs: [] };
    let { routes, fixes, navs } = d;
    if (sz === 4) { /* a 4-degree cell is a quarter of an 8-degree one */
      const inC = (x, y) => y >= la && y < la + 4 && x >= lo && x < lo + 4;
      routes = routes.filter((r) => { const g = r[9][0], x0 = Math.min(g[0][0], g[1][0]), x1 = Math.max(g[0][0], g[1][0]), y0 = Math.min(g[0][1], g[1][1]), y1 = Math.max(g[0][1], g[1][1]); return x1 >= lo && x0 < lo + 4 && y1 >= la && y0 < la + 4; });
      fixes = fixes.filter((f) => inC(f[2], f[3])); navs = navs.filter((n) => inC(n[4], n[5]));
    }
    return jsonRes({ lv, cell: [la, lo], routes, fixes, navs, cn: 'ok', cycle: act.cycle }, 200, { ...h, ...priv });
  }
  if (!me) return jsonRes({ error: 'Sign in to see China AIP data', signin: true }, 401, h);
  const act = cnActive(await cnIndex(env));
  if (path === '/api/efb/cn/asp') {
    if (!act) return jsonRes({ cycle: null, fc: { type: 'FeatureCollection', features: [] } }, 200, { ...h, ...priv });
    const raw = await env.STORE.get(P + 'asp:' + act.cycle, { cacheTtl: 3600 }).catch(() => null);
    const body = '{"cycle":' + JSON.stringify(act.cycle) + ',"eff":' + JSON.stringify(act.eff) + ',"fc":' + (raw || '{"type":"FeatureCollection","features":[]}') + '}';
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...h, ...priv } });
  }
  if (path === '/api/efb/cn/apt') {
    const icao = String(url.searchParams.get('icao') || '').trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(icao)) return jsonRes({ error: 'Enter a 4 letter ICAO code' }, 400, h);
    if (!act) return jsonRes({ cycle: null, apt: null }, 200, { ...h, ...priv });
    if (!APT || APT.cycle !== act.cycle) { const v = await env.STORE.get(P + 'apt:' + act.cycle, { type: 'json', cacheTtl: 3600 }).catch(() => null); APT = { cycle: act.cycle, v: v || {} }; }
    return jsonRes({ cycle: act.cycle, eff: act.eff, apt: APT.v[icao] || null }, 200, { ...h, ...priv });
  }
  return jsonRes({ error: 'Not found' }, 404, h);
}
