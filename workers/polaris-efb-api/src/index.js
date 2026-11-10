/**
 * Polaris EFB — vAMSYS bridge (Cloudflare Worker)
 *
 * Keeps the vAMSYS Operations API client secret on the server and gives the EFB a few small,
 * read-only endpoints. Field names follow the official spec at https://vamsys.io/docs/operations.
 *
 *   GET /api/efb/health                 -> { ok, configured }
 *   GET /api/efb/pilot?username=XXX     -> pilot, rank, statistics, recent PIREPs
 *   GET /api/efb/bookings?username=XXX  -> the pilot's current bookings
 *   GET /api/efb/fleet                  -> fleets with their aircraft registrations
 *   GET /api/efb/live                   -> Polaris flights in the air now (vAMSYS flight map)
 *   GET /api/efb/sigmets                -> international SIGMETs and US SIGMET/AIRMETs (aviationweather.gov)
 *   GET /api/efb/charts?icao=KSFO       -> FAA d-TPP chart list for the current AIRAC cycle
 *   GET /api/efb/chart-pdf?cycle=&file= -> one FAA chart PDF (passed through, cached)
 *   GET /api/efb/airport-layout?icao=   -> runways, taxiways, stands and holds from OpenStreetMap
 *   GET /api/efb/fir                    -> FIR / ARTCC boundaries (VATSpy Data Project, CC BY-SA 4.0), simplified
 *   GET /api/efb/radar                  -> RainViewer radar frame list (tiles are loaded straight from RainViewer)
 *
 * Secrets (wrangler secret put ...): VAMSYS_CLIENT_ID, VAMSYS_CLIENT_SECRET
 * Vars (wrangler.toml): VAMSYS_SCOPE (default "ops:read"), ALLOWED_ORIGINS (comma list, or "*")
 */
const API = 'https://vamsys.io/api/v3/operations';
const TOKEN_URL = 'https://vamsys.io/oauth/token';
const TTL = { pilot: 60_000, pireps: 60_000, bookings: 30_000, stats: 300_000, lookup: 3_600_000 };

let token = null; // { value, expires }
const cache = new Map(); // key -> { at, ttl, promise }

function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.promise;
  const promise = fn().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), ttl, promise });
  return promise;
}

async function getToken(env) {
  if (token && Date.now() < token.expires) return token.value;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.VAMSYS_CLIENT_ID || '',
    client_secret: env.VAMSYS_CLIENT_SECRET || '',
    scope: env.VAMSYS_SCOPE || 'ops:read',
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
  if (!res.ok) throw new HttpError(502, `vAMSYS token request failed (HTTP ${res.status})`);
  const j = await res.json();
  token = { value: j.access_token, expires: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000 };
  return token.value;
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function vget(env, path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  let res = await fetch(url, { headers: { Authorization: `Bearer ${await getToken(env)}`, Accept: 'application/json' } });
  if (res.status === 401) { token = null; res = await fetch(url, { headers: { Authorization: `Bearer ${await getToken(env)}`, Accept: 'application/json' } }); }
  if (res.status === 429) throw new HttpError(503, 'vAMSYS rate limit reached, try again in a minute');
  if (!res.ok) throw new HttpError(502, `vAMSYS ${path} failed (HTTP ${res.status})`);
  return res.json();
}

/** Every item of a cursor-paginated list. */
async function all(env, path, params = {}, maxPages = 20) {
  const out = []; let cursor = null;
  for (let i = 0; i < maxPages; i++) {
    const j = await vget(env, path, { ...params, 'page[size]': 100, 'page[cursor]': cursor });
    out.push(...(j.data || []));
    cursor = j.meta?.next_cursor || null;
    if (!cursor) break;
  }
  return out;
}

const airports = (env) => cached('airports', TTL.lookup, async () => new Map((await all(env, '/airports')).map((a) => [a.id, { icao: a.icao || a.iata || '', name: a.name || '' }])));
const ranks = (env) => cached('ranks', TTL.lookup, async () => new Map((await all(env, '/ranks')).map((r) => [r.id, { name: r.name, abbr: r.abbreviation, level: r.level }])));
const fleets = (env) => cached('fleet', TTL.lookup, async () => {
  const list = await all(env, '/fleet');
  const out = [];
  for (const f of list) {
    const ac = await all(env, `/fleet/${f.id}/aircraft`);
    out.push({ id: f.id, code: f.code, name: f.name, maxPax: f.max_pax ?? null, aircraft: ac.map((a) => ({ id: a.id, registration: a.registration, name: a.name, selcal: a.selcal ?? null })) });
  }
  return out;
});
async function aircraftIndex(env) {
  const m = new Map();
  for (const f of await fleets(env)) for (const a of f.aircraft) m.set(a.id, { registration: a.registration, fleet: f.code });
  return m;
}

async function findPilot(env, username) {
  const u = String(username || '').trim();
  if (!u) throw new HttpError(400, 'username is required');
  return cached('pilot:' + u.toLowerCase(), TTL.pilot, async () => {
    const j = await vget(env, '/pilots', { 'filter[username]': u, 'page[size]': 1 });
    const p = (j.data || [])[0];
    if (!p) throw new HttpError(404, `No pilot with username ${u}`);
    return p;
  });
}

const iso = (s) => (s ? String(s) : null);

async function pilotRoute(env, username) {
  const p = await findPilot(env, username);
  const [rk, ap, ac, stats, pireps] = await Promise.all([
    ranks(env).catch(() => new Map()),
    airports(env).catch(() => new Map()),
    aircraftIndex(env).catch(() => new Map()),
    cached('stats:' + p.id, TTL.stats, () => vget(env, `/statistics/pilot/${p.id}`)).then((j) => j.data ?? j).catch(() => null),
    cached('pireps:' + p.id, TTL.pireps, () => vget(env, '/pireps', { 'filter[pilot_id]': p.id, sort: '-id', 'page[size]': 30 })).then((j) => j.data || []),
  ]);
  const rank = rk.get(p.rank_id) || null;
  return {
    pilot: { id: p.id, username: p.username, name: p.name ?? null, rank: rank && rank.name, rankAbbr: rank && rank.abbr, since: iso(p.created_at) },
    stats: stats && {
      pireps: stats.pireps?.total ?? null, accepted: stats.pireps?.accepted ?? null,
      avgLandingRate: stats.pireps?.averageLandingRate ?? null, avgLandingG: stats.pireps?.averageLandingG ?? null,
      flightSeconds: stats.flightTime?.seconds ?? null, flightTime: stats.flightTime?.formatted ?? null,
      points: stats.points?.total ?? null, distanceNm: stats.transport?.distanceFlown ?? null,
      passengers: stats.transport?.passengers ?? null, fuelUsed: stats.transport?.fuelUsed ?? null,
    },
    pireps: pireps.map((r) => {
      const a = ac.get(r.aircraft_id) || {};
      return {
        id: r.id, date: iso(r.on_blocks_time || r.landing_time || r.created_at),
        flight: r.flight_number || r.callsign || '', callsign: r.callsign || '',
        from: ap.get(r.departure_airport_id)?.icao || '', to: ap.get(r.arrival_airport_id)?.icao || '',
        registration: a.registration || '', type: a.fleet || '',
        blockMinutes: r.block_length != null ? Math.round(r.block_length / 60) : null,
        flightMinutes: r.flight_length != null ? Math.round(r.flight_length / 60) : null,
        landingRate: r.landing_rate ?? null, landingG: r.landing_g ?? null,
        fuelUsed: r.fuel_used ?? null, distanceNm: r.flight_distance ?? null,
        points: r.points ?? null, status: r.status || '', network: r.network || null,
      };
    }),
  };
}

async function bookingsRoute(env, username) {
  const p = await findPilot(env, username);
  const [ap, ac, list] = await Promise.all([
    airports(env).catch(() => new Map()),
    aircraftIndex(env).catch(() => new Map()),
    cached('bookings:' + p.id, TTL.bookings, () => vget(env, '/bookings', { 'filter[pilot_id]': p.id, 'filter[status]': 'current', sort: 'id', 'page[size]': 10 })).then((j) => j.data || []),
  ]);
  return {
    bookings: list.map((b) => {
      const a = ac.get(b.aircraft_id) || {};
      return {
        id: b.id, flight: b.flight_number || '', callsign: b.callsign || '',
        from: ap.get(b.departure_id)?.icao || '', to: ap.get(b.arrival_id)?.icao || '',
        fromName: ap.get(b.departure_id)?.name || '', toName: ap.get(b.arrival_id)?.name || '',
        registration: a.registration || '', type: a.fleet || '',
        departureTime: iso(b.departure_time), arrivalTime: iso(b.estimated_arrival_time || b.arrival_time),
        altitude: b.altitude ?? null, costIndex: b.cost_index ?? null, route: b.user_route ?? null,
        passengers: b.passengers ?? null, cargo: b.cargo ?? null, network: b.network ?? null, validTo: iso(b.valid_to),
      };
    }),
  };
}

async function liveRoute(env) {
  return cached('live', 15_000, async () => {
    const j = await vget(env, '/flight-map');
    const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
    const icao = (a) => (a && (a.icao || a.identifier || a.iata)) || '';
    const flights = (j.data || []).flatMap((f) => {
      const b = f.booking || {}, pr = f.progress || {}, ac = f.aircraft || {};
      const lat = num(pr.latitude ?? pr.location?.lat), lon = num(pr.longitude ?? pr.location?.lon);
      if (lat == null || lon == null) return [];
      return [{
        callsign: b.callsign || b.flightNumber || `#${f.bookingId ?? '?'}`, flight: b.flightNumber || '',
        pilot: f.pilot?.username || '', network: b.network || null,
        type: ac.code || ac.type || ac.name || '', registration: ac.registration || '',
        from: icao(f.departureAirport), to: icao(f.arrivalAirport),
        lat, lon, altitude: num(pr.altitude) ?? num(b.altitude) ?? 0, groundspeed: num(pr.groundSpeed) ?? 0,
        heading: num(pr.magneticHeading) ?? num(pr.heading) ?? 0, phase: pr.currentPhase || '',
        distanceRemaining: num(pr.distanceRemaining),
      }];
    });
    return { flights };
  });
}

/* FIR / ARTCC boundaries from the VATSpy Data Project, with coordinates rounded to keep the payload small. */
async function firRoute() {
  return cached('fir', 24 * 3600_000, () => edgeCache('fir/v1', 7 * 86400, async () => {
    const r = await fetch('https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson', { headers: { 'User-Agent': 'PolarisEFB/1.0' } });
    if (!r.ok) throw new Error('Boundary data unavailable (HTTP ' + r.status + ')');
    const j = await r.json();
    const round = (c) => (Array.isArray(c[0]) ? c.map(round) : [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000]);
    return {
      type: 'FeatureCollection',
      features: (j.features || []).map((f) => ({ type: 'Feature', properties: { id: f.properties?.id, oceanic: f.properties?.oceanic, label_lon: f.properties?.label_lon, label_lat: f.properties?.label_lat }, geometry: f.geometry ? { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } : null })),
    };
  }));
}

/* RainViewer frame list (past radar). The EFB loads the tiles itself. */
async function radarRoute() {
  return cached('radar', 120_000, async () => {
    const r = await fetch('https://api.rainviewer.com/public/weather-maps.json', { headers: { 'User-Agent': 'PolarisEFB/1.0' } });
    if (!r.ok) throw new Error('Radar unavailable (HTTP ' + r.status + ')');
    const j = await r.json();
    return { host: j.host, radar: { past: (j.radar && j.radar.past) || [] }, generated: j.generated };
  });
}

async function sigmetRoute() {
  return cached('sigmets', 300_000, async () => {
    const opt = { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } };
    const get = (u) => fetch(u, opt).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const [intl, us] = await Promise.all([get('https://aviationweather.gov/api/data/isigmet?format=json'), get('https://aviationweather.gov/api/data/airsigmet?format=json')]);
    const coords = (c) => (Array.isArray(c) ? c : []).map((p) => [+p.lat, +p.lon]).filter((p) => isFinite(p[0]) && isFinite(p[1]));
    const out = [];
    for (const s of Array.isArray(intl) ? intl : []) {
      const c = coords(s.coords);
      if (c.length >= 3) out.push({ kind: 'SIGMET', fir: s.firId || s.icaoId || '', hazard: s.hazard || '', qualifier: s.qualifier || '', base: s.base ?? null, top: s.top ?? null, from: s.validTimeFrom ?? null, to: s.validTimeTo ?? null, coords: c, raw: s.rawSigmet || '' });
    }
    for (const s of Array.isArray(us) ? us : []) {
      const c = coords(s.coords);
      if (c.length >= 3) out.push({ kind: s.airSigmetType || 'AIRMET', fir: s.icaoId || '', hazard: s.hazard || '', qualifier: s.severity != null ? String(s.severity) : '', base: s.altitudeLow1 ?? null, top: s.altitudeHi1 ?? null, from: s.validTimeFrom ?? null, to: s.validTimeTo ?? null, coords: c, raw: s.rawAirSigmet || '' });
    }
    return { sigmets: out };
  });
}

/* ---------- FAA d-TPP charts ---------- */
const DAY = 86_400_000;
/** AIRAC cycle in effect at `t` (cycles start 0901Z every 28 days; 2401 began 25 Jan 2024). */
function airac(t = Date.now()) {
  const ref = Date.UTC(2024, 0, 25, 9, 1), period = 28 * DAY;
  const k = Math.floor((t - ref) / period), eff = ref + k * period;
  const y = new Date(eff).getUTCFullYear();
  const first = ref + Math.ceil((Date.UTC(y, 0, 1) - ref) / period) * period;
  const n = Math.round((eff - first) / period) + 1;
  return { cycle: String(y % 100).padStart(2, '0') + String(n).padStart(2, '0'), from: new Date(eff).toISOString(), to: new Date(eff + period).toISOString() };
}
const CHART_GROUP = { APD: 'Airport diagram', HOT: 'Hot spots', LAH: 'LAHSO', DP: 'Departures', ODP: 'Departures', STR: 'Arrivals', IAP: 'Approaches', MIN: 'Minimums', DAU: 'Other' };
const xmlField = (rec, k) => { const m = rec.match(new RegExp('<' + k + '>([^<]*)</' + k + '>')); return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : ''; };
async function edgeCache(key, ttlSec, fn) {
  const req = new Request('https://polaris-efb-cache/' + key);
  const c = caches.default;
  const hit = await c.match(req);
  if (hit) return hit.json();
  const val = await fn();
  await c.put(req, new Response(JSON.stringify(val), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttlSec}` } }));
  return val;
}
async function chartsRoute(icaoIn) {
  const icao = String(icaoIn || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(icao)) throw new HttpError(400, 'Enter a 3 or 4 letter airport code');
  const ac = airac();
  return cached('charts:' + ac.cycle + ':' + icao, 6 * 3600_000, () => edgeCache(`charts/${ac.cycle}/${icao}`, 86400, async () => {
    const res = await fetch(`https://aeronav.faa.gov/d-tpp/${ac.cycle}/xml_data/d-TPP_Metafile.xml`, { cf: { cacheTtl: 86400, cacheEverything: true } });
    if (!res.ok || !res.body) throw new HttpError(502, `FAA chart index for cycle ${ac.cycle} is not available (HTTP ${res.status})`);
    const keys = [`icao_ident="${icao}"`]; if (icao.length === 3) keys.push(`apt_ident="${icao}"`); else if (icao[0] === 'K') keys.push(`apt_ident="${icao.slice(1)}"`);
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '', block = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i = -1;
      for (const k of keys) { i = buf.indexOf(k); if (i >= 0) break; }
      if (i >= 0) {
        const e = buf.indexOf('</airport_name>', i);
        if (e >= 0) { block = buf.slice(buf.lastIndexOf('<airport_name', i), e); try { await reader.cancel(); } catch (_) {} break; }
        continue;
      }
      if (buf.length > 400_000) buf = buf.slice(-4000);
    }
    if (!block) return { cycle: ac.cycle, from: ac.from, to: ac.to, airport: { icao, name: '' }, charts: [], notFound: true };
    const name = (block.match(/ID="([^"]*)"/) || [])[1] || '';
    const charts = [...block.matchAll(/<record>([\s\S]*?)<\/record>/g)].map((m) => ({
      code: xmlField(m[1], 'chart_code'), name: xmlField(m[1], 'chart_name'), pdf: xmlField(m[1], 'pdf_name'), action: xmlField(m[1], 'useraction'),
    })).filter((c) => c.pdf && c.action !== 'D').map((c) => ({ code: c.code, group: CHART_GROUP[c.code] || 'Other', name: c.name, pdf: c.pdf, changed: c.action === 'C', url: `https://aeronav.faa.gov/d-tpp/${ac.cycle}/${c.pdf}` }));
    return { cycle: ac.cycle, from: ac.from, to: ac.to, airport: { icao, name }, charts };
  }));
}
async function chartPdfRoute(url, h) {
  const cycle = url.searchParams.get('cycle') || '', file = url.searchParams.get('file') || '';
  if (!/^\d{4}$/.test(cycle) || !/^[A-Z0-9_-]{1,60}\.PDF$/i.test(file)) return json({ error: 'Invalid chart' }, 400, h);
  const res = await fetch(`https://aeronav.faa.gov/d-tpp/${cycle}/${file}`, { cf: { cacheTtl: 7 * 86400, cacheEverything: true } });
  if (!res.ok) return json({ error: `FAA returned HTTP ${res.status}` }, 502, h);
  return new Response(res.body, { status: 200, headers: { ...h, 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=86400' } });
}

/* ---------- airport layout from OpenStreetMap (Overpass) ---------- */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(query) {
  let last = null;
  for (const ep of OVERPASS) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 45_000);
      const r = await fetch(ep, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)' }, body: 'data=' + encodeURIComponent(query) });
      clearTimeout(t);
      const txt = await r.text();
      if (r.ok && txt[0] === '{') return JSON.parse(txt);
      last = new Error(`HTTP ${r.status}`);
    } catch (e) { last = e; }
  }
  throw new HttpError(503, 'OpenStreetMap is busy right now, try again in a minute' + (last ? ` (${last.message})` : ''));
}
async function layoutRoute(icaoIn) {
  const icao = String(icaoIn || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(icao)) throw new HttpError(400, 'Enter a 4 letter ICAO code');
  return cached('layout:' + icao, 6 * 3600_000, () => edgeCache(`layout/v1/${icao}`, 7 * 86400, async () => {
    const q = `[out:json][timeout:40];(way["aeroway"="aerodrome"]["icao"="${icao}"];relation["aeroway"="aerodrome"]["icao"="${icao}"];)->.a;.a out tags center;.a map_to_area->.ar;` +
      `(way(area.ar)["aeroway"~"^(runway|taxiway|taxilane|apron|terminal|hangar|holding_position|parking_position|stopway|gate)$"];node(area.ar)["aeroway"~"^(gate|parking_position|holding_position)$"];);out geom qt;`;
    const j = await overpass(q);
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const line = (e) => (e.geometry || []).filter((p) => p && isFinite(p.lat)).map((p) => [r6(p.lon), r6(p.lat)]);
    const out = { airport: { icao, name: '', lat: null, lon: null }, runways: [], taxiways: [], aprons: [], buildings: [], stands: [], holds: [] };
    for (const e of j.elements || []) {
      const t = e.tags || {}, a = t.aeroway;
      if (a === 'aerodrome') { out.airport.name = t.name || ''; const c = e.center || e; if (isFinite(c.lat)) { out.airport.lat = r6(c.lat); out.airport.lon = r6(c.lon); } continue; }
      if (e.type === 'node') {
        if (a === 'holding_position') out.holds.push({ ref: t.ref || '', pt: [r6(e.lon), r6(e.lat)] });
        else out.stands.push({ ref: t.ref || t.name || '', kind: a, pt: [r6(e.lon), r6(e.lat)] });
        continue;
      }
      const pts = line(e); if (pts.length < 2) continue;
      if (a === 'runway' || a === 'stopway') out.runways.push({ ref: t.ref || '', width: +t.width || null, stopway: a === 'stopway', area: t.area === 'yes', pts });
      else if (a === 'taxiway' || a === 'taxilane') { if (t.area === 'yes') out.aprons.push(pts); else out.taxiways.push({ ref: t.ref || '', kind: a, width: +t.width || null, pts }); }
      else if (a === 'apron') out.aprons.push(pts);
      else if (a === 'terminal' || a === 'hangar') out.buildings.push({ kind: a, pts });
      else if (a === 'holding_position') out.holds.push({ ref: t.ref || '', pts });
      else if (a === 'parking_position' || a === 'gate') out.stands.push({ ref: t.ref || t.name || '', kind: a, pt: pts[Math.floor(pts.length / 2)] });
    }
    if (out.airport.lat == null && out.runways.length) { const p = out.runways[0].pts[0]; out.airport.lon = p[0]; out.airport.lat = p[1]; }
    if (!out.runways.length && !out.taxiways.length) out.notFound = true;
    return out;
  }));
}

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return { 'Access-Control-Allow-Origin': ok ? (allowed.includes('*') ? '*' : origin) : 'null', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept', Vary: 'Origin' };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, h);
    const url = new URL(req.url);
    const configured = Boolean(env.VAMSYS_CLIENT_ID && env.VAMSYS_CLIENT_SECRET);
    try {
      switch (url.pathname.replace(/\/+$/, '')) {
        case '/api/efb/health': return json({ ok: true, configured, updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/pilot': if (!configured) break; return json({ ...(await pilotRoute(env, url.searchParams.get('username'))), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/bookings': if (!configured) break; return json({ ...(await bookingsRoute(env, url.searchParams.get('username'))), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/charts': return json({ ...(await chartsRoute(url.searchParams.get('icao'))), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/chart-pdf': return await chartPdfRoute(url, h);
        case '/api/efb/airport-layout': return json({ ...(await layoutRoute(url.searchParams.get('icao'))), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/fir': return json(await firRoute(), 200, h);
        case '/api/efb/radar': return json(await radarRoute(), 200, h);
        case '/api/efb/sigmets': return json({ ...(await sigmetRoute()), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/live': if (!configured) break; return json({ ...(await liveRoute(env)), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/fleet': if (!configured) break; return json({ fleet: await fleets(env), updatedAt: new Date().toISOString() }, 200, h);
        default: return json({ error: 'Not found' }, 404, h);
      }
      return json({ error: 'vAMSYS keys are not set on the server' }, 503, h);
    } catch (e) {
      return json({ error: e.message || 'Server error' }, e.status || 500, h);
    }
  },
};
