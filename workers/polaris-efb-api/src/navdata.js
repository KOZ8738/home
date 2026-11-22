/* ---------- Nav Data (/admin, Nov 2026): where the EFB's navigation data comes from, region by region, and whether
   each is current ----------
   GET  /admin/api/navdata           -> { now, airac: { cur, next }, src: [ source… ], at }
   POST /admin/api/navdata/check {id} -> asks one source (or all, without id) again now, then the same answer
   A source: { id, region, name, by, link, what, how, state: 'ok'|'warn'|'bad'|'off', line, rows: [[label, value]], at }
   The checks are a few small requests (the FAA's chart index head, one FAA AIS count, the CAA Taiwan eAIP's list, one
   openAIP tile) and a look through what the EFB server keeps (airport maps, pilots' simulator procedures). They run
   every 6 hours from the 20-minute cron, or when staff press Check, and are kept in KV nav:v1:chk. Nothing here
   changes the data itself: each source keeps updating itself as before.
   deps (from index.js): { airac(t), twEdition(), major() -> { airports: [{ icao, layoutAt }] }, majorCount } */

const CHK = 'nav:v1:chk', H6 = 6 * 3600_000, DAY = 86400_000;
const AIS_FS = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/';
const UA = { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)' };
const jsonRes = (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function fetchT(u, ms, init) { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms); try { return await fetch(u, { ...(init || {}), signal: ac.signal }); } finally { clearTimeout(t); } }
const errMsg = (e) => (e && e.name === 'AbortError' ? 'no answer in time' : String((e && e.message) || e)).slice(0, 160);
const day = (t) => new Date(t).toISOString().slice(0, 10);

/* the sources, in the order the page shows them */
const SRC = [
  { id: 'us-charts', region: 'United States', name: 'Charts', by: 'FAA d-TPP', link: 'https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/', what: 'Airport diagrams, SIDs, STARs and approach charts (Charts app)', how: 'Automatic: the cycle in force, every AIRAC' },
  { id: 'us-enroute', region: 'United States', name: 'En-route data', by: 'FAA AIS open data', link: 'https://adds-faa.opendata.arcgis.com/', what: 'Airways, fixes, navaids, airspace and US runways (Map, IFR layers)', how: 'Automatic: asked live, the FAA keeps it current' },
  { id: 'tw-charts', region: 'Taiwan', name: 'AIP charts', by: 'CAA eAIP', link: 'https://ais.caa.gov.tw/eaip/', what: 'Charts for the RCxx airports (Charts app)', how: 'Automatic: each AIP amendment on its effective date' },
  { id: 'cn-aip', region: 'China', name: 'AIP data set', by: 'CAAC eAIP', link: 'https://www.eaipchina.cn/dataset', what: 'Airspace, airways, fixes, navaids and runways (AIXM 5.1.1)', how: 'Uploaded here each AIRAC (the eAIP needs a sign-in)' },
  { id: 'openaip', region: 'Worldwide', name: 'Airspace and navaids', by: 'openAIP', link: 'https://www.openaip.net/', what: 'Airspace, navaids and reporting points on the Map, FIR outlines', how: 'Automatic: openAIP updates continuously' },
  { id: 'fir', region: 'Worldwide', name: 'FIR boundaries', by: 'openAIP, VATSpy Data Project', link: 'https://github.com/vatsimnetwork/vatspy-data-project', what: 'FIR outlines and codes on the Map', how: 'Automatic: rebuilt weekly' },
  { id: 'apts', region: 'Worldwide', name: 'Airports', by: 'OurAirports', link: 'https://ourairports.com/data/', what: 'Airport names, positions and runways (search, Map)', how: 'Automatic: rebuilt every 14 days' },
  { id: 'layouts', region: 'Worldwide', name: 'Airport maps', by: 'OpenStreetMap', link: 'https://www.openstreetmap.org/', what: 'Taxiways, stands and holding points of the major airports', how: 'Automatic: kept for the major airports, others when asked' },
  { id: 'navproc', region: 'Pilots’ simulators', name: 'Procedures', by: 'Polaris Navdata', link: '', what: 'SIDs, STARs and approaches read from each pilot’s own MSFS (Set departure / arrival / approach)', how: 'From each pilot’s simulator, kept 90 days, for that pilot only' },
];

/* ---- the checks (each returns what the page needs from it) ---- */
const CHECKS = {
  async 'us-charts'(env, d) {
    const c = d.airac(), n = d.airac(Date.parse(c.to) + 60_000);
    const has = async (cy) => { const r = await fetchT(`https://aeronav.faa.gov/d-tpp/${cy}/xml_data/d-TPP_Metafile.xml`, 15000, { method: 'HEAD', headers: UA }); return r.ok; };
    const [a, b] = await Promise.all([has(c.cycle).catch((e) => ({ err: errMsg(e) })), has(n.cycle).catch(() => false)]);
    if (a && a.err) return { err: a.err, cur: c.cycle, next: n.cycle };
    return { cur: c.cycle, curOk: !!a, next: n.cycle, nextOk: !!b, nextFrom: n.from };
  },
  async 'us-enroute'() {
    const q = new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json', geometry: '-123,37,-121,38.5', geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' });
    const r = await fetchT(AIS_FS + 'ATS_Route/FeatureServer/0/query?' + q, 15000, { headers: { ...UA, Accept: 'application/json' } });
    if (!r.ok) return { err: 'HTTP ' + r.status };
    const j = await r.json().catch(() => null);
    if (!j || j.error || !(j.count >= 0)) return { err: (j && j.error && j.error.message) || 'no answer' };
    return { count: j.count };
  },
  async 'tw-charts'(env, d) {
    const { cur, next } = await d.twEdition();
    return { amdt: cur.amdt, eff: cur.eff, next: next ? { amdt: next.amdt, eff: next.eff } : null };
  },
  async openaip(env) {
    if (!env.OPENAIP_API_KEY) return { err: 'No openAIP key on the server (OPENAIP_API_KEY)' };
    const r = await fetchT('https://api.tiles.openaip.net/api/data/openaip/7/107/54.pbf?apiKey=' + encodeURIComponent(env.OPENAIP_API_KEY), 15000, { headers: UA });
    if (r.status === 401 || r.status === 403) return { err: 'openAIP refused the key (HTTP ' + r.status + ')' };
    if (!r.ok && r.status !== 204) return { err: 'HTTP ' + r.status };
    const n = r.status === 204 ? 0 : (await r.arrayBuffer()).byteLength;
    return { bytes: n };
  },
  async layouts(env, d) {
    const L = ((await d.major()) || {}).airports || [], have = L.filter((a) => a.layoutAt);
    return { n: have.length, of: L.length, oldest: have.length ? Math.min(...have.map((a) => a.layoutAt)) : 0, missing: L.filter((a) => !a.layoutAt).map((a) => a.icao).slice(0, 12) };
  },
  async navproc(env) {
    const kv = env.STORE, apts = new Set(), pilots = new Set(); let n = 0, last = 0, cursor;
    for (let p = 0; p < 10; p++) {
      const r = await kv.list({ prefix: 'np:', cursor, limit: 1000 });
      for (const k of r.keys) { const m = k.name.match(/^np:([^:]+):([A-Z0-9]{3,4})$/); if (!m) continue; n++; pilots.add(m[1]); apts.add(m[2]); if (k.expiration) last = Math.max(last, k.expiration * 1000 - 90 * DAY); }
      if (r.list_complete) break; cursor = r.cursor;
    }
    return { n, apts: apts.size, pilots: pilots.size, last, top: [...apts].sort().slice(0, 40) };
  },
};

async function readChk(kv) { try { return (await kv.get(CHK, 'json')) || { at: 0, r: {} }; } catch (e) { return { at: 0, r: {} }; } }
/* ask one source (or all) again and keep the answers */
export async function navCheck(env, d, only) {
  const kv = env.STORE, chk = await readChk(kv), ids = only ? [only] : Object.keys(CHECKS);
  await Promise.all(ids.filter((id) => CHECKS[id]).map(async (id) => {
    const t = Date.now(); let v;
    try { v = await CHECKS[id](env, d); } catch (e) { v = { err: errMsg(e) }; }
    chk.r[id] = { ...v, at: Date.now(), ms: Date.now() - t };
  }));
  if (!only) chk.at = Date.now();
  await kv.put(CHK, JSON.stringify(chk));
  return chk;
}
/* from the 20-minute cron: all of them, every 6 hours */
export async function navCron(env, d) {
  if (!env || !env.STORE) return;
  const chk = await readChk(env.STORE);
  if (Date.now() - (chk.at || 0) > H6) await navCheck(env, d).catch((e) => console.warn('[navdata]', e && e.message));
}

/* ---- the page's answer ---- */
const ago = (t, now) => { const m = Math.round((now - t) / 60000); return m < 2 ? 'just now' : m < 120 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
const inDays = (t, now) => { const d = Math.ceil((t - now) / DAY); return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'; };
async function navStatus(env, d) {
  const kv = env.STORE, now = Date.now(), cur = d.airac(now), next = d.airac(Date.parse(cur.to) + 60_000), chk = await readChk(kv);
  const [fir, aptsT, cn] = await Promise.all([kv.get('fir:v2b', 'json').catch(() => null), kv.get('apts:v1:t').catch(() => null), kv.get('cnaip:v1:idx', 'json').catch(() => null)]);
  const soon = Date.parse(cur.to) - now < 7 * DAY;
  const out = SRC.map((s) => {
    const r = chk.r[s.id] || null, o = { ...s, state: 'ok', line: '', rows: [], at: r ? r.at : 0 };
    const fail = (t) => { o.state = 'bad'; o.line = t; };
    switch (s.id) {
      case 'us-charts':
        if (!r) { o.state = 'off'; o.line = 'Not checked yet'; break; }
        if (r.err) { fail('The FAA chart index did not answer: ' + r.err); break; }
        if (!r.curOk) { fail('AIRAC ' + r.cur + ' is not on the FAA server'); break; }
        o.line = 'AIRAC ' + r.cur + ' in use';
        o.rows.push(['In use', 'AIRAC ' + r.cur + ' · since ' + day(Date.parse(cur.from))]);
        o.rows.push(['Next', 'AIRAC ' + r.next + ' · ' + day(Date.parse(r.nextFrom)) + ' · ' + (r.nextOk ? 'published, switches by itself' : 'not published yet')]);
        if (!r.nextOk && soon) { o.state = 'warn'; o.line = 'AIRAC ' + r.next + ' starts ' + inDays(Date.parse(r.nextFrom), now) + ' and is not on the FAA server yet'; }
        break;
      case 'us-enroute':
        if (!r) { o.state = 'off'; o.line = 'Not checked yet'; break; }
        if (r.err) { fail('FAA AIS did not answer: ' + r.err); break; }
        o.line = 'Answering · current as the FAA publishes it';
        o.rows.push(['Test', r.count + ' airways around San Francisco · ' + r.ms + ' ms']);
        break;
      case 'tw-charts':
        if (!r) { o.state = 'off'; o.line = 'Not checked yet'; break; }
        if (r.err) { fail('The CAA eAIP did not answer: ' + r.err); break; }
        o.line = 'AMDT ' + r.amdt + ' in use';
        o.rows.push(['In use', 'AIP AMDT ' + r.amdt + ' · since ' + r.eff]);
        o.rows.push(['Next', r.next ? 'AMDT ' + r.next.amdt + ' · ' + r.next.eff + ' · switches by itself' : 'None announced yet']);
        break;
      case 'cn-aip': {
        o.at = cn && cn.at || 0;
        const has = (cy) => !!(cn && (cn.cycles || []).some((c) => c.cycle === cy));
        o.rows.push(['In use', has(cur.cycle) ? 'AIRAC ' + cur.cycle : 'Nothing yet']);
        o.rows.push(['Next', 'AIRAC ' + next.cycle + ' · ' + day(Date.parse(next.from)) + ' · ' + (has(next.cycle) ? 'uploaded, switches by itself' : 'not uploaded')]);
        if (!cn) { o.state = 'off'; o.line = 'Waiting for the first upload'; break; }
        if (!has(cur.cycle)) { fail('AIRAC ' + cur.cycle + ' is not uploaded: the EFB shows no China data'); break; }
        o.line = 'AIRAC ' + cur.cycle + ' in use';
        if (!has(next.cycle) && Date.parse(cur.to) - now < 14 * DAY) { o.state = 'warn'; o.line = 'AIRAC ' + next.cycle + ' starts ' + inDays(Date.parse(next.from), now) + ': upload it'; }
        break; }
      case 'openaip':
        if (!r) { o.state = 'off'; o.line = 'Not checked yet'; break; }
        if (r.err) { fail(r.err); break; }
        o.line = 'Answering · updated continuously by openAIP';
        o.rows.push(['Test', 'A map tile over Taiwan · ' + Math.round(r.bytes / 1024) + ' KB · ' + r.ms + ' ms']);
        break;
      case 'fir': {
        const st = fir && fir.v && fir.v.stat;
        if (!fir) { o.state = 'off'; o.line = 'Built the first time the Map asks'; break; }
        o.at = fir.t; o.line = (st ? st.oaip + ' FIRs from openAIP, ' + st.vatspy + ' from VATSpy' : 'Built') + ' · ' + ago(fir.t, now);
        o.rows.push(['Built', day(fir.t) + ' · ' + ago(fir.t, now)]);
        if (st && st.err) o.rows.push(['Note', 'openAIP: ' + st.err]);
        if (now - fir.t > 14 * DAY) { o.state = 'warn'; o.line = 'Not rebuilt for ' + Math.round((now - fir.t) / DAY) + ' days'; }
        break; }
      case 'apts': {
        const t = +aptsT || 0;
        if (!t) { o.state = 'off'; o.line = 'Built the first time the EFB asks'; break; }
        o.at = t; o.line = 'Built ' + ago(t, now); o.rows.push(['Built', day(t) + ' · ' + ago(t, now)]);
        if (now - t > 30 * DAY) { o.state = 'warn'; o.line = 'Not rebuilt for ' + Math.round((now - t) / DAY) + ' days'; }
        break; }
      case 'layouts':
        if (!r) { o.state = 'off'; o.line = 'Not checked yet'; break; }
        if (r.err) { fail(r.err); break; }
        o.line = r.n + ' of ' + r.of + ' major airports ready';
        o.rows.push(['Ready', r.n + ' of ' + r.of + (r.oldest ? ' · the oldest built ' + ago(r.oldest, now) : '')]);
        if (r.missing && r.missing.length) o.rows.push(['Still to build', r.missing.join(', ') + ' (three every 20 minutes)']);
        if (r.n < r.of / 2) o.state = 'warn';
        break;
      case 'navproc':
        if (!r) { o.state = 'off'; o.line = 'Not checked yet'; break; }
        if (r.err) { fail(r.err); break; }
        if (!r.n) { o.state = 'off'; o.line = 'No pilot has read procedures from a simulator yet'; break; }
        o.line = r.apts + ' airport' + (r.apts === 1 ? '' : 's') + ' from ' + r.pilots + ' pilot' + (r.pilots === 1 ? '' : 's') + "' simulators";
        o.rows.push(['Kept', r.n + ' airport lists · the newest ' + ago(r.last, now)]);
        if (r.top && r.top.length) o.rows.push(['Airports', r.top.join(' ')]);
        break;
    }
    return o;
  });
  return { now, airac: { cur, next }, src: out, at: chk.at || 0 };
}

export async function navdataAdmin(req, path, env, d) {
  if (!env || !env.STORE) return jsonRes({ error: 'Storage is not set up' }, 503);
  try {
    if (path === '/admin/api/navdata' && req.method === 'GET') return jsonRes(await navStatus(env, d));
    if (path === '/admin/api/navdata/check' && req.method === 'POST') {
      if (!/application\/json/.test(req.headers.get('Content-Type') || '')) return jsonRes({ error: 'Send JSON' }, 415);
      let b = {}; try { b = await req.json(); } catch (e) { b = {}; }
      const id = b && b.id ? String(b.id) : '';
      if (id && !CHECKS[id]) return jsonRes({ error: 'That source is not checked from here' }, 400);
      await navCheck(env, d, id || null);
      return jsonRes(await navStatus(env, d));
    }
    return jsonRes({ error: 'Not found' }, 404);
  } catch (e) { return jsonRes({ error: errMsg(e) }, 500); }
}
