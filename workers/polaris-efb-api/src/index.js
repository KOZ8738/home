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
 *   GET /api/efb/airport?icao=KSFO      -> airport info, METAR and TAF (aviationweather.gov)
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
const cache = new Map(); // key -> { at, value }
/* Keeps finished results only. A promise must never be shared between requests: if the request that started it
   ends first, Workers refuses to settle it in another request ("This promise was created by a request that has since ended"). */
function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value);
  return fn().then((value) => { cache.set(key, { at: Date.now(), value }); return value; });
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

/* ---------- airport info, METAR and TAF (aviationweather.gov) ---------- */
async function airportRoute(icaoIn, ctx) {
  const icao = String(icaoIn || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(icao)) throw new HttpError(400, 'Enter a 4 letter ICAO code');
  const opt = { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } };
  /* null = not found (empty answer), throws = service trouble (so a failure is never cached as "not found") */
  const get = async (u, ms) => { const r = await fetchT(u, ms || 9000, opt); if (r.status === 204 || r.status === 404) return null; if (!r.ok) throw new Error('AWC ' + r.status); const t = await r.text(); if (!t.trim()) return null; return JSON.parse(t); };
  const edge = caches.default, ek = new Request('https://apt-cache.local/v2/' + icao);
  const infoP = cached('apt:' + icao, 12 * 3600_000, async () => {
    const hit = await edge.match(ek); if (hit) return await hit.json();
    let j; try { j = await get(`https://aviationweather.gov/api/data/airport?ids=${icao}&format=json`); } catch (e) { try { j = await get(`https://aviationweather.gov/api/data/airport?ids=${icao}&format=json`, 12000); } catch (e2) { throw new HttpError(504, 'The airport service is slow right now, try again'); } }
    const a = Array.isArray(j) ? j[0] : null;
    let out = null;
    if (a) {
      const freqs = Array.isArray(a.freqs) ? a.freqs.map((f) => ({ type: f.type || '', freq: String(f.freq || '') })) : typeof a.freqs === 'string' ? a.freqs.split(';').map((p) => { const [type, freq] = p.split(','); return { type: (type || '').trim(), freq: (freq || '').trim() }; }).filter((f) => f.freq) : [];
      out = { icao: a.icaoId || icao, iata: a.iataId || '', faa: a.faaId || '', name: a.name || '', state: a.state || '', country: a.country || '', lat: +a.lat, lon: +a.lon, elevM: a.elev != null ? +a.elev : null, magdec: a.magdec || '', owner: a.owner || '', tower: a.tower || '', freqs,
        runways: (Array.isArray(a.runways) ? a.runways : []).map((r) => { const [l, w] = String(r.dimension || '').split('x').map(Number); return { id: r.id || '', lengthFt: isFinite(l) ? l : null, widthFt: isFinite(w) ? w : null, surface: r.surface || '', alignment: r.alignment ?? null }; }) };
    }
    const res = new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + (out ? 43200 : 3600) } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(edge.put(ek, res)); else await edge.put(ek, res);
    return out;
  });
  const wxP = cached('aptwx:' + icao, 5 * 60_000, async () => {
    const [m, t] = await Promise.all([get(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`, 8000).catch(() => undefined), get(`https://aviationweather.gov/api/data/taf?ids=${icao}&format=json`, 8000).catch(() => undefined)]);
    if (m === undefined && t === undefined) throw new Error('weather unavailable');
    const mm = Array.isArray(m) ? m[0] : null, tt = Array.isArray(t) ? t[0] : null;
    return { metar: mm ? { raw: mm.rawOb || '', time: mm.reportTime || mm.obsTime || null, cat: mm.fltCat || mm.fltcat || '' } : null, taf: tt ? { raw: tt.rawTAF || '', time: tt.issueTime || null } : null };
  });
  const [info, wx] = await Promise.all([infoP, wxP.catch(() => ({ metar: null, taf: null, wxErr: 'Weather service is slow right now' }))]);
  return { airport: info, notFound: !info, ...wx };
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
async function edgeCache(key, ttlSec, fn, keep) {
  const req = new Request('https://polaris-efb-cache/' + key);
  const c = caches.default;
  const hit = await c.match(req);
  if (hit) return hit.json();
  const val = await fn();
  if (keep && !keep(val)) return val;
  await c.put(req, new Response(JSON.stringify(val), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttlSec}` } }));
  return val;
}
async function chartsRoute(icaoIn, env, ctx) {
  const icao = String(icaoIn || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(icao)) throw new HttpError(400, 'Enter a 3 or 4 letter airport code');
  const ac = airac();
  return cached('charts:' + ac.cycle + ':' + icao, 6 * 3600_000, () => kvStore(env, ctx, 'charts:' + ac.cycle + ':' + icao, 40 * 86400_000, () => edgeCache(`charts/${ac.cycle}/${icao}`, 86400, async () => {
    const res = await fetch(`https://aeronav.faa.gov/d-tpp/${ac.cycle}/xml_data/d-TPP_Metafile.xml`, { cf: { cacheTtl: 86400, cacheEverything: true } });
    if (!res.ok || !res.body) throw new HttpError(502, `FAA chart index for cycle ${ac.cycle} is not available (HTTP ${res.status})`);
    const keys = [`icao_ident="${icao}"`]; if (icao.length === 3) keys.push(`apt_ident="${icao}"`); else if (icao[0] === 'K') keys.push(`apt_ident="${icao.slice(1)}"`);
    const reader = res.body.getReader(), dec = new TextDecoder();
    /* scan the multi-megabyte index chunk by chunk, keeping only a short tail, so CPU time stays small */
    let buf = '', block = null, found = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      if (!found) {
        let i = -1;
        for (const k of keys) { i = buf.indexOf(k); if (i >= 0) break; }
        if (i < 0) { if (buf.length > 4000) buf = buf.slice(-1500); continue; }
        const st = buf.lastIndexOf('<airport_name', i);
        buf = buf.slice(st >= 0 ? st : 0); found = true;
      }
      const e = buf.indexOf('</airport_name>');
      if (e >= 0) { block = buf.slice(0, e); try { await reader.cancel(); } catch (_) {} break; }
    }
    if (!block) return { cycle: ac.cycle, from: ac.from, to: ac.to, airport: { icao, name: '' }, charts: [], notFound: true };
    const name = (block.match(/ID="([^"]*)"/) || [])[1] || '';
    const charts = [...block.matchAll(/<record>([\s\S]*?)<\/record>/g)].map((m) => ({
      code: xmlField(m[1], 'chart_code'), name: xmlField(m[1], 'chart_name'), pdf: xmlField(m[1], 'pdf_name'), action: xmlField(m[1], 'useraction'),
    })).filter((c) => c.pdf && c.action !== 'D').map((c) => ({ code: c.code, group: CHART_GROUP[c.code] || 'Other', name: c.name, pdf: c.pdf, changed: c.action === 'C', url: `https://aeronav.faa.gov/d-tpp/${ac.cycle}/${c.pdf}` }));
    return { cycle: ac.cycle, from: ac.from, to: ac.to, airport: { icao, name }, charts };
  }), (v) => v && !v.notFound));
}
async function chartPdfRoute(url, h) {
  const cycle = url.searchParams.get('cycle') || '', file = url.searchParams.get('file') || '';
  if (!/^\d{4}$/.test(cycle) || !/^[A-Z0-9_-]{1,60}\.PDF$/i.test(file)) return json({ error: 'Invalid chart' }, 400, h);
  const res = await fetch(`https://aeronav.faa.gov/d-tpp/${cycle}/${file}`, { cf: { cacheTtl: 7 * 86400, cacheEverything: true } });
  if (!res.ok) return json({ error: `FAA returned HTTP ${res.status}` }, 502, h);
  return new Response(res.body, { status: 200, headers: { ...h, 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=86400' } });
}

const MAJOR = ['KATL','KDFW','KDEN','KORD','KLAX','KJFK','KLAS','KMCO','KMIA','KCLT','KSEA','KPHX','KEWR','KSFO','KIAH','KBOS','KFLL','KMSP','KLGA','KDTW','KPHL','KSLC','KBWI','KIAD','KDCA','KSAN','KTPA','KBNA','KAUS','PHNL','PANC','KPDX','KMSY','KRDU','KSJC','KOAK','KSAT','KMCI','KSMF','KSTL'];
/* Permanent store (Workers KV): a value is served from the store, refreshed in the background once it is
   older than maxAge, and built on the spot only the first time. Without the binding it just builds. */
async function kvStore(env, ctx, key, maxAge, fn, keep) {
  const kv = env && env.STORE;
  if (!kv) return fn();
  let hit = null;
  try { hit = await kv.get(key, 'json'); } catch (e) { hit = null; }
  const build = async () => { const v = await fn(); if (!keep || keep(v)) { try { await kv.put(key, JSON.stringify({ t: Date.now(), v }), { expirationTtl: 120 * 86400 }); } catch (e) { /* store full or offline */ } } return v; };
  if (hit && hit.v) {
    if (Date.now() - (hit.t || 0) > maxAge && ctx && ctx.waitUntil) ctx.waitUntil(build().catch(() => {}));
    return hit.v;
  }
  return build();
}
/* ---------- airport layout from OpenStreetMap (Overpass) ---------- */
/* The public Overpass servers are often at capacity, so the query is kept cheap (a small
   bounding box, no area lookup) and is sent to several servers a few seconds apart; the
   first good answer wins. */
const OVERPASS = ['https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function overpass(query, perTry = 20_000, stagger = 2_500) {
  let done = false, last = null; const ctrls = [];
  const one = async (ep) => {
    const ctrl = new AbortController(); ctrls.push(ctrl);
    const t = setTimeout(() => ctrl.abort(), perTry);
    try {
      const r = await fetch(ep, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)' }, body: 'data=' + encodeURIComponent(query) });
      const txt = await r.text();
      if (!r.ok || txt[0] !== '{') throw new Error(`HTTP ${r.status}`);
      const j = JSON.parse(txt);
      if (j.remark && /timed out|out of memory|error/i.test(j.remark)) throw new Error('query ran out of time');
      return j;
    } catch (e) { if (!done) last = e.name === 'AbortError' ? new Error('no answer in time') : e; throw e; } finally { clearTimeout(t); }
  };
  /* start the next server as soon as one fails, or after `stagger` ms if it is just slow */
  return new Promise((resolve, reject) => {
    let i = 0, active = 0, timer = null;
    const next = () => {
      clearTimeout(timer); if (done) return;
      if (i >= OVERPASS.length) { if (!active) reject(new HttpError(503, 'OpenStreetMap is busy right now, try again in a minute' + (last ? ` (${last.message})` : ''))); return; }
      active++;
      one(OVERPASS[i++]).then((j) => { if (done) return; done = true; clearTimeout(timer); ctrls.forEach((c) => { try { c.abort(); } catch (e) { /* finished */ } }); resolve(j); }, () => { active--; next(); });
      timer = setTimeout(next, stagger);
    };
    next();
  });
}
/* Where is the airport? aviationweather.gov knows most ICAO airports; OpenStreetMap is the fallback. */
async function airportPos(icao) {
  try {
    const r = await fetch(`https://aviationweather.gov/api/data/airport?ids=${icao}&format=json`, { headers: { 'User-Agent': 'PolarisEFB/1.0' }, cf: { cacheTtl: 86400, cacheEverything: true } });
    if (r.ok) { const a = (await r.json())[0]; if (a && isFinite(a.lat) && isFinite(a.lon) && (a.lat || a.lon)) return { lat: +a.lat, lon: +a.lon, name: String(a.name || '').trim() }; }
  } catch (e) { /* fall through to OpenStreetMap */ }
  const j = await overpass(`[out:json][timeout:15];(way["aeroway"="aerodrome"]["icao"="${icao}"];relation["aeroway"="aerodrome"]["icao"="${icao}"];node["aeroway"="aerodrome"]["icao"="${icao}"];);out tags center 1;`);
  const e = (j.elements || [])[0]; if (!e) return null;
  const c = e.center || e; return isFinite(c.lat) ? { lat: c.lat, lon: c.lon, name: (e.tags || {}).name || '' } : null;
}
/* Join boundary pieces end to end into closed rings (a relation's outline usually comes in several ways). */
function stitchRings(ways) {
  const eq = (a, b) => a[0] === b[0] && a[1] === b[1], segs = ways.filter((w) => w.length > 1).map((w) => w.slice()), rings = [];
  while (segs.length) {
    let cur = segs.pop(), grew = true;
    while (grew && !eq(cur[0], cur[cur.length - 1])) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        const sg = segs[i], head = cur[0], tail = cur[cur.length - 1];
        if (eq(sg[0], tail)) cur = cur.concat(sg.slice(1));
        else if (eq(sg[sg.length - 1], tail)) cur = cur.concat(sg.slice(0, -1).reverse());
        else if (eq(sg[sg.length - 1], head)) cur = sg.slice(0, -1).concat(cur);
        else if (eq(sg[0], head)) cur = sg.slice(1).reverse().concat(cur);
        else continue;
        segs.splice(i, 1); grew = true; break;
      }
    }
    if (cur.length > 3 && eq(cur[0], cur[cur.length - 1])) rings.push(cur);
  }
  return rings;
}
const CARGO = /cargo|freight|warehouse|logistic|fedex|\bups\b|dhl|usps|mail/i;
const mid = (pts) => { let x = 0, y = 0; pts.forEach((p) => { x += p[0]; y += p[1]; }); return [Math.round(x / pts.length * 1e6) / 1e6, Math.round(y / pts.length * 1e6) / 1e6]; };
const LAYOUT_KINDS = 'runway|taxiway|taxilane|apron|terminal|hangar|holding_position|parking_position|stopway|gate';
async function layoutRoute(icaoIn, env, ctx) {
  const icao = String(icaoIn || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(icao)) throw new HttpError(400, 'Enter a 4 letter ICAO code');
  return cached('layout11:' + icao, 6 * 3600_000, () => kvStore(env, ctx, 'layout:v11:' + icao, 30 * 86400_000, () => edgeCache(`layout/v11/${icao}`, 7 * 86400, async () => {
    const pos = await airportPos(icao);
    if (!pos) return { airport: { icao, name: '', lat: null, lon: null }, runways: [], taxiways: [], aprons: [], buildings: [], stands: [], holds: [], notFound: true };
    const dLat = 0.07, dLon = dLat / Math.max(0.2, Math.cos(pos.lat * Math.PI / 180));
    const bb = [pos.lat - dLat, pos.lon - dLon, pos.lat + dLat, pos.lon + dLon].map((v) => v.toFixed(5)).join(',');
    /* two small queries: the airport outline first, then everything inside its own box (named buildings in
       a wide box around a city airport made one big query too slow) */
    const j0 = await overpass(`[out:json][timeout:20][bbox:${bb}];(way["aeroway"="aerodrome"];relation["aeroway"="aerodrome"];);out body bb geom;`);
    /* keep only what lies inside this airport: its own outline if OSM has one, else a tight box */
    const fields = (j0.elements || []).filter((e) => (e.tags || {}).aeroway === 'aerodrome' && e.bounds);
    const mine = fields.find((e) => String(e.tags.icao || '').toUpperCase() === icao)
      || fields.filter((e) => !e.tags.icao && pos.lat >= e.bounds.minlat && pos.lat <= e.bounds.maxlat && pos.lon >= e.bounds.minlon && pos.lon <= e.bounds.maxlon)
        .sort((x, y) => (x.bounds.maxlat - x.bounds.minlat) - (y.bounds.maxlat - y.bounds.minlat))[0];
    const m = 0.003, box = mine ? { a: mine.bounds.minlat - m, b: mine.bounds.maxlat + m, c: mine.bounds.minlon - m, d: mine.bounds.maxlon + m }
      : { a: pos.lat - 0.04, b: pos.lat + 0.04, c: pos.lon - dLon * 4 / 7, d: pos.lon + dLon * 4 / 7 };
    const inBox = (e) => { const p = e.type === 'node' ? e : e.bounds ? { lat: (e.bounds.minlat + e.bounds.maxlat) / 2, lon: (e.bounds.minlon + e.bounds.maxlon) / 2 } : null; return !!p && p.lat >= box.a && p.lat <= box.b && p.lon >= box.c && p.lon <= box.d; };
    const bb2 = [box.a, box.c, box.b, box.d].map((v) => v.toFixed(5)).join(',');
    const j1 = await overpass(`[out:json][timeout:40][bbox:${bb2}];(way["aeroway"~"^(${LAYOUT_KINDS})$"];node["aeroway"~"^(gate|parking_position|holding_position)$"];way["building"]["name"];relation["aeroway"~"^(apron|terminal|hangar)$"];relation["building"]["name"];);out geom qt;`, 45_000, 6_000);
    const j = { elements: (j1.elements || []).filter((e) => (e.tags || {}).aeroway !== 'aerodrome' && inBox(e)) };

    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const line = (e) => (e.geometry || []).filter((p) => p && isFinite(p.lat)).map((p) => [r6(p.lon), r6(p.lat)]);
    const out = { airport: { icao, name: (mine && mine.tags.name) || pos.name || '', lat: r6(pos.lat), lon: r6(pos.lon) }, runways: [], taxiways: [], aprons: [], apronHoles: [], buildings: [], stands: [], holds: [], places: [] };
    /* the airport boundary, so the app can paint the airfield ground under the pavement */
    if (mine) {
      const rings = mine.type === 'way' ? [mine.geometry] : (mine.members || []).filter((mb) => mb.type === 'way' && mb.role !== 'inner').map((mb) => mb.geometry);
      out.outline = stitchRings(rings.map((gm) => (gm || []).filter((p) => p && isFinite(p.lat)).map((p) => [r6(p.lon), r6(p.lat)])));
    }
    for (const e of j.elements || []) {
      const t = e.tags || {}, a = t.aeroway;
      if (e.type === 'relation') {
        /* multipolygon aprons: outer rings are pavement, inner rings are holes in it */
        if (a === 'apron') {
          const ring = (role) => stitchRings((e.members || []).filter((mb) => mb.type === 'way' && (role === 'inner' ? mb.role === 'inner' : mb.role !== 'inner')).map((mb) => (mb.geometry || []).filter((p) => p && isFinite(p.lat)).map((p) => [r6(p.lon), r6(p.lat)])));
          ring('outer').forEach((r) => out.aprons.push(r)); ring('inner').forEach((r) => out.apronHoles.push(r));
          if (t.name) { const o = ring('outer')[0]; if (o) out.places.push({ kind: 'apron', name: t.name, pt: mid(o) }); }
        }
        /* multipolygon buildings (a terminal ring around a garage, say): each outer ring with the courtyards inside it */
        else if (a === 'terminal' || a === 'hangar' || (!a && t.building && t.name)) {
          const ring = (inner) => stitchRings((e.members || []).filter((mb) => mb.type === 'way' && (inner ? mb.role === 'inner' : mb.role !== 'inner')).map((mb) => (mb.geometry || []).filter((p) => p && isFinite(p.lat)).map((p) => [r6(p.lon), r6(p.lat)])));
          const outs = ring(false), ins = ring(true);
          const inR = (p, r) => { let c = false; for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const a1 = r[i], b1 = r[k]; if ((a1[1] > p[1]) !== (b1[1] > p[1]) && p[0] < (b1[0] - a1[0]) * (p[1] - a1[1]) / (b1[1] - a1[1]) + a1[0]) c = !c; } return c; };
          const kind = CARGO.test(t.name || '') ? 'cargo' : a || (t.building === 'hangar' ? 'hangar' : 'bldg');
          outs.forEach((o, k) => { const holes = ins.filter((r) => inR(r[0], o)); out.buildings.push({ kind, name: k ? '' : (t.name || ''), pts: o, ...(holes.length ? { holes } : {}), ...(a ? {} : { osmb: true }) }); });
        }
        continue;
      }
      if (e.type === 'node') {
        if (a === 'holding_position') out.holds.push({ ref: t.ref || '', pt: [r6(e.lon), r6(e.lat)] });
        else out.stands.push({ ref: t.ref || t.name || '', kind: a, pt: [r6(e.lon), r6(e.lat)] });
        continue;
      }
      const pts = line(e); if (pts.length < 2) continue;
      if (a === 'runway' || a === 'stopway') out.runways.push({ ref: t.ref || '', width: +t.width || null, stopway: a === 'stopway', area: t.area === 'yes', pts });
      else if (a === 'taxiway' || a === 'taxilane') { if (t.area === 'yes') out.aprons.push(pts); else out.taxiways.push({ ref: t.ref || '', kind: a, width: +t.width || null, pts }); }
      else if (a === 'apron') { out.aprons.push(pts); if (t.name) out.places.push({ kind: 'apron', name: t.name, pt: mid(pts) }); }
      else if (a === 'terminal' || a === 'hangar') out.buildings.push({ kind: CARGO.test(t.name || '') ? 'cargo' : a, name: t.name || '', pts });
      else if (!a && t.building && t.name && pts.length > 3) out.buildings.push({ kind: CARGO.test(t.name) ? 'cargo' : t.building === 'hangar' ? 'hangar' : 'bldg', name: t.name, pts, osmb: true });
      else if (a === 'holding_position') out.holds.push({ ref: t.ref || '', pts });
      else if (a === 'parking_position' || a === 'gate') out.stands.push({ ref: t.ref || t.name || '', kind: a, pt: pts[Math.floor(pts.length / 2)], line: pts.length > 1 && pts.length < 60 ? pts : undefined });
    }
    /* plain named buildings only count when they stand on the airport itself */
    {
      const inRing = (p, r) => { let c = false; for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const a1 = r[i], b1 = r[k]; if ((a1[1] > p[1]) !== (b1[1] > p[1]) && p[0] < (b1[0] - a1[0]) * (p[1] - a1[1]) / (b1[1] - a1[1]) + a1[0]) c = !c; } return c; };
      const rings = out.outline || [], bb = mine && mine.bounds;
      const onAirport = (p) => rings.length ? rings.some((r) => inRing(p, r)) : bb ? p[1] >= bb.minlat && p[1] <= bb.maxlat && p[0] >= bb.minlon && p[0] <= bb.maxlon : true;
      out.buildings = out.buildings.filter((b) => !b.osmb || onAirport(mid(b.pts))).map((b) => { delete b.osmb; return b; });
      out.places = out.places.filter((p) => onAirport(p.pt));
    }
    if (out.airport.lat == null && out.runways.length) { const p = out.runways[0].pts[0]; out.airport.lon = p[0]; out.airport.lat = p[1]; }
    if (!out.runways.length && !out.taxiways.length) out.notFound = true;
    return out;
  }, (v) => !v.notFound), (v) => v && !v.notFound));
}

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return { 'Access-Control-Allow-Origin': ok ? (allowed.includes('*') ? '*' : origin) : 'null', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Accept', Vary: 'Origin' };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

/* what is stored for the major airports (for the app list and for checking) */
async function majorRoute(env) {
  const kv = env && env.STORE, cyc = airac().cycle;
  const rows = await Promise.all(MAJOR.map(async (icao) => {
    if (!kv) return { icao };
    const [l, c] = await Promise.all([kv.get('layout:v11:' + icao, 'json').catch(() => null), kv.get('charts:' + cyc + ':' + icao, 'json').catch(() => null)]);
    const v = l && l.v, cv = c && c.v;
    return { icao, name: (v && v.airport && v.airport.name) || (cv && cv.airport && cv.airport.name) || '', layoutAt: l ? l.t : null, runways: v ? v.runways.length : 0, taxiways: v ? v.taxiways.length : 0, stands: v ? v.stands.length : 0, buildings: v ? v.buildings.length : 0, chartsAt: c ? c.t : null, charts: cv ? cv.charts.length : 0 };
  }));
  return { cycle: cyc, airports: rows };
}
/* every 20 minutes: keep the major airports stored. Three layouts per run at most (missing or oldest
   first) to go easy on the public Overpass servers,
   and every chart list of the current AIRAC cycle. */
async function refreshMajor(env, ctx) {
  const kv = env && env.STORE; if (!kv) return;
  const cyc = airac().cycle, ages = await Promise.all(MAJOR.map(async (icao) => { const l = await kv.get('layout:v11:' + icao, 'json').catch(() => null); return { icao, t: l ? l.t : 0 }; }));
  const due = ages.filter((a) => Date.now() - a.t > 25 * 86400_000).sort((a, b) => a.t - b.t).slice(0, 3);
  for (const a of due) { try { const v = await layoutRoute(a.icao, null, null); if (v && !v.notFound) await kv.put('layout:v11:' + a.icao, JSON.stringify({ t: Date.now(), v }), { expirationTtl: 120 * 86400 }); } catch (e) { /* try again tomorrow */ } }
  for (const icao of MAJOR) { const c = await kv.get('charts:' + cyc + ':' + icao).catch(() => null); if (!c) { try { await chartsRoute(icao, env, null); } catch (e) { /* next run */ } } }
}


/* METARs for one 10x10 degree cell (SW corner lat,lon): flight category and wind for the map dots.
   Edge cache 5 minutes so many viewers share one aviationweather.gov request per cell. */
async function metarCellRoute(cellIn, sizeIn, ctx, h) {
  const sz = String(sizeIn) === '2' ? 2 : 10;
  const m = String(cellIn || '').match(/^(-?\d{1,2}),(-?\d{1,3})$/); if (!m) throw new HttpError(400, 'cell=lat,lon');
  const la = +m[1], lo = +m[2];
  if (la % sz || lo % sz || la < -90 || la > 90 - sz || lo < -180 || lo > 180 - sz) throw new HttpError(400, 'cell must be on the grid');
  const cache = caches.default, ck = new Request('https://metar-cache.local/' + sz + '/' + la + '/' + lo);
  let r = await cache.match(ck);
  if (!r) {
    const up = await fetch(`https://aviationweather.gov/api/data/metar?bbox=${la},${lo},${la + sz},${lo + sz}&format=json`, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } });
    if (!up.ok && up.status !== 204) throw new HttpError(502, 'METAR service ' + up.status);
    let j = []; if (up.status !== 204) { try { j = await up.json(); } catch (e) { j = []; } }
    const seen = new Set(), st = [];
    (Array.isArray(j) ? j : []).sort((a, b) => (b.obsTime || 0) - (a.obsTime || 0)).forEach((x) => {
      const i = String(x.icaoId || ''); if (!/^[A-Z0-9]{4}$/.test(i) || seen.has(i) || !isFinite(x.lat) || !isFinite(x.lon)) return; seen.add(i);
      st.push({ i, la: Math.round(x.lat * 1e4) / 1e4, lo: Math.round(x.lon * 1e4) / 1e4, c: /^(VFR|MVFR|IFR|LIFR)$/.test(x.fltCat) ? x.fltCat : null, wd: x.wdir === 'VRB' ? 'VRB' : (isFinite(x.wdir) ? +x.wdir : null), ws: isFinite(x.wspd) ? +x.wspd : null, wg: isFinite(x.wgst) ? +x.wgst : null, t: x.obsTime || null });
    });
    r = new Response(JSON.stringify({ cell: [la, lo, sz], stations: st, updatedAt: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, r.clone())); else await cache.put(ck, r.clone());
  }
  const hd = new Headers(r.headers); for (const [k, v] of Object.entries(h)) hd.set(k, v); hd.set('Cache-Control', 'public, max-age=120');
  return new Response(r.body, { status: 200, headers: hd });
}

/* Winds and temperatures aloft from Open-Meteo (free for non-commercial use). One flight level, many 10x10 degree
   cells per request: the cells not already cached this hour go to Open-Meteo in ONE call (4 grid points per cell,
   5 degree spacing), so a whole map view costs a single upstream request. */
const WIND_LV = [700, 500, 400, 300, 250, 200];
async function windRoute(url, ctx, h) {
  const lv = +url.searchParams.get('lv'); if (!WIND_LV.includes(lv)) throw new HttpError(400, 'lv must be one of ' + WIND_LV.join(', '));
  const cells = String(url.searchParams.get('cells') || '').split(';').map((c) => c.match(/^(-?\d{1,2}),(-?\d{1,3})$/)).filter(Boolean)
    .map((m) => [+m[1], +m[2]]).filter(([la, lo]) => !(la % 10) && !(lo % 10) && la >= -90 && la <= 80 && lo >= -180 && lo <= 170);
  if (!cells.length) throw new HttpError(400, 'cells=lat,lon;lat,lon');
  /* cached in 30x30 degree blocks (36 grid points) so a view needs only a handful of cache reads:
     a Worker invocation may make at most 50 subrequests, cache reads and writes included */
  const blk = (v) => Math.floor(v / 30) * 30, blocks = [];
  cells.forEach(([la, lo]) => { const b = [blk(la), blk(lo)]; if (!blocks.some((x) => x[0] === b[0] && x[1] === b[1])) blocks.push(b); });
  blocks.splice(14);
  const hour = new Date().toISOString().slice(0, 13), cache = caches.default;
  const key = (b) => new Request('https://wind-cache.local/v3/' + hour + '/' + lv + '/' + b[0] + '/' + b[1]);
  const got = {}, miss = [];
  await Promise.all(blocks.map(async (b) => { const r = await cache.match(key(b)); if (r) got[b.join(',')] = await r.json(); else miss.push(b); }));
  let err = null;
  if (miss.length) {
    const lats = [], lons = [], owner = [];
    miss.forEach((b) => { for (let a = b[0] + 2.5; a < b[0] + 30; a += 5) for (let o = b[1] + 2.5; o < b[1] + 30; o += 5) if (Math.abs(a) <= 85) { lats.push(a); lons.push(o); owner.push(b.join(',')); } });
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&hourly=wind_speed_${lv}hPa,wind_direction_${lv}hPa,temperature_${lv}hPa&wind_speed_unit=kn&forecast_hours=1&timezone=GMT`;
    let j = null;
    for (let tries = 0; tries < 2 && !j; tries++) {
      try {
        const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 15000);
        const up = await fetch(u, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' }, signal: ac.signal }).finally(() => clearTimeout(tm));
        if (up.ok) j = await up.json(); else { err = up.status === 429 ? 'Winds service is busy, try again shortly' : 'Winds service ' + up.status; if (up.status === 429 && tries === 0) await new Promise((r) => setTimeout(r, 1500)); }
      } catch (e) { err = (e && e.name === 'AbortError') ? 'Winds service is slow, try again' : 'Winds service: ' + ((e && e.message) || e); }
    }
    if (j) {
      if (!Array.isArray(j)) j = [j];
      const fresh = {};
      j.forEach((x, i) => { const hr = x.hourly || {}, sp = (hr['wind_speed_' + lv + 'hPa'] || [])[0], d = (hr['wind_direction_' + lv + 'hPa'] || [])[0], t = (hr['temperature_' + lv + 'hPa'] || [])[0];
        (fresh[owner[i]] = fresh[owner[i]] || []).push({ la: lats[i], lo: lons[i], d: d == null ? null : Math.round(d), s: sp == null ? null : Math.round(sp), t: t == null ? null : Math.round(t) }); });
      miss.forEach((b) => { const k = b.join(','), v = fresh[k] || []; got[k] = v; const p = cache.put(key(b), new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } })); if (ctx && ctx.waitUntil) ctx.waitUntil(p); });
      err = null;
    }
  }
  /* hand back per requested 10-degree cell, as the app asks */
  const out = {};
  cells.forEach(([la, lo]) => { const v = got[blk(la) + ',' + blk(lo)]; if (v) out[la + ',' + lo] = v.filter((q) => q.la >= la && q.la < la + 10 && q.lo >= lo && q.lo < lo + 10); });
  return json({ lv, hour: hour + ':00Z', cells: out, error: err }, 200, h);
}



/* openAIP vector tiles (airspaces, navaids, reporting points, airports...), proxied so the key stays on the server; cached a week */
async function oaipVector(m, env, ctx, h) {
  const [, z, x, y] = m; if (+z < 0 || +z > 16) return new Response(null, { status: 404, headers: h });
  if (!env.OPENAIP_API_KEY) return json({ error: 'openAIP key is not set on the server' }, 503, h);
  const cache = caches.default, ck = new Request('https://oaip-cache.local/v/' + z + '/' + x + '/' + y + '.pbf');
  let r = await cache.match(ck);
  if (!r) {
    const up = await fetch('https://api.tiles.openaip.net/api/data/openaip/' + z + '/' + x + '/' + y + '.pbf?apiKey=' + encodeURIComponent(env.OPENAIP_API_KEY), { headers: { 'User-Agent': 'PolarisEFB/1.0' } });
    if (up.status === 404 || up.status === 204) r = new Response(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=604800' } });
    else if (!up.ok) return json({ error: 'openAIP tiles ' + up.status }, up.status === 401 || up.status === 403 ? 503 : 502, h);
    else r = new Response(await up.arrayBuffer(), { status: 200, headers: { 'Content-Type': 'application/x-protobuf', 'Cache-Control': 'public, max-age=604800' } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, r.clone())); else await cache.put(ck, r.clone());
  }
  const hd = new Headers(r.headers); for (const [k, v] of Object.entries(h)) hd.set(k, v); hd.set('Cache-Control', 'public, max-age=86400');
  return new Response(r.body, { status: r.status, headers: hd });
}

/* PIREPs / AIREPs for one 10x10 degree cell, last 3 h, moderate or worse turbulence / icing only. Cached 10 min. */
const PR_LV = (v) => { const t = String(v || '').toUpperCase(); if (!t || /NEG|SMTH|NIL|NONE/.test(t) && !/LGT|MOD|SEV|EXT/.test(t)) return 0; if (/EXT/.test(t)) return 4; if (/SEV/.test(t)) return 3; if (/MOD/.test(t)) return 2; if (/LGT|LT/.test(t)) return 1; return 0; };
function prParse(raw) { const r = ' ' + String(raw || '') + ' ', tb = (r.match(/\/TB\s+([^/]+)/) || [])[1], ic = (r.match(/\/IC\s+([^/]+)/) || [])[1], fl = (r.match(/\/FL\s*(\d{3})/) || [])[1], tp = (r.match(/\/TP\s+([A-Z0-9]{2,5})/) || [])[1];
  return { tb: PR_LV(tb), ic: PR_LV(ic), tbTxt: tb ? tb.trim() : '', icTxt: ic ? ic.trim() : '', fl: fl ? +fl : null, tp: tp || '' }; }
async function pirepCellRoute(cellIn, ctx, h) {
  const m = String(cellIn || '').match(/^(-?\d{1,2}),(-?\d{1,3})$/); if (!m) throw new HttpError(400, 'cell=lat,lon');
  const la = +m[1], lo = +m[2]; if (la % 10 || lo % 10 || la < -90 || la > 80 || lo < -180 || lo > 170) throw new HttpError(400, 'cell must be on the 10 degree grid');
  const cache = caches.default, ck = new Request('https://pirep-cache.local/' + la + '/' + lo);
  let r = await cache.match(ck);
  if (!r) {
    const up = await fetch(`https://aviationweather.gov/api/data/pirep?bbox=${la},${lo},${la + 10},${lo + 10}&age=3&format=json`, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } });
    if (!up.ok && up.status !== 204) throw new HttpError(502, 'PIREP service ' + up.status);
    let j = []; if (up.status !== 204) { try { j = await up.json(); } catch (e) { j = []; } }
    const out = [];
    (Array.isArray(j) ? j : []).forEach((x) => {
      const raw = String(x.rawOb || x.raw_text || ''), p = prParse(raw);
      const tb = Math.max(p.tb, PR_LV(x.tbInt1), PR_LV(x.tbInt2)), ic = Math.max(p.ic, PR_LV(x.icgInt1), PR_LV(x.icgInt2));
      const lat = +x.lat, lon = +x.lon; if (!isFinite(lat) || !isFinite(lon) || (tb < 2 && ic < 2)) return;
      const fl = isFinite(+x.fltLvl) && +x.fltLvl > 0 ? +x.fltLvl : p.fl;
      out.push({ la: Math.round(lat * 100) / 100, lo: Math.round(lon * 100) / 100, fl, ac: String(x.acType || p.tp || ''), t: x.obsTime || null, tb, ic, kind: String(x.pirepType || (/^\s*[A-Z]{3,4} UUA/.test(raw) ? 'UUA' : /AIREP|ARP/.test(raw) ? 'AIREP' : 'PIREP')), raw: raw.slice(0, 300) });
    });
    r = new Response(JSON.stringify({ cell: [la, lo], reps: out.slice(0, 300) }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, r.clone())); else await cache.put(ck, r.clone());
  }
  const hd = new Headers(r.headers); for (const [k, v] of Object.entries(h)) hd.set(k, v); hd.set('Cache-Control', 'public, max-age=180');
  return new Response(r.body, { status: 200, headers: hd });
}

/* ATIS for one airport: real-world D-ATIS (atis.info, FAA airports) and VATSIM ATIS (network data feed). Cached 60-120 s. */
async function fetchT(u, ms, init) { const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms); try { return await fetch(u, { ...(init || {}), signal: ac.signal }); } finally { clearTimeout(tm); } }
async function vatsimAtisAll(ctx) {
  const cache = caches.default, ck = new Request('https://vatsim-atis-cache.local/all');
  let r = await cache.match(ck); if (r) return await r.json();
  const up = await fetchT('https://data.vatsim.net/v3/vatsim-data.json', 10000, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)' } });
  if (!up.ok) throw new Error('VATSIM ' + up.status);
  const j = await up.json();
  const list = (j.atis || []).map((a) => ({ cs: a.callsign, f: a.frequency, code: a.atis_code || '', text: Array.isArray(a.text_atis) ? a.text_atis.join(' ') : String(a.text_atis || ''), since: a.logon_time || null, upd: a.last_updated || null }));
  const out = { at: j.general && j.general.update_timestamp, list };
  const res = new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } });
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, res)); else await cache.put(ck, res);
  return out;
}
async function datisReal(icao, ctx) {
  const cache = caches.default, ck = new Request('https://datis-cache.local/' + icao);
  let r = await cache.match(ck); if (r) return await r.json();
  const up = await fetchT('https://atis.info/api/' + icao, 8000, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } });
  let j = null; try { j = await up.json(); } catch (e) { j = null; }
  if (!up.ok && up.status !== 404 && !(j && j.error)) throw new Error('D-ATIS ' + up.status);
  const list = Array.isArray(j) ? j.map((a) => ({ type: a.type || 'combined', code: a.code || '', text: a.datis || '', time: a.time || '', upd: a.updatedAt || null })) : [];
  const res = new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' } });
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, res)); else await cache.put(ck, res);
  return list;
}
async function atisRoute(icaoIn, ctx, h) {
  const icao = String(icaoIn || '').toUpperCase(); if (!/^[A-Z0-9]{3,4}$/.test(icao)) throw new HttpError(400, 'icao is required');
  const [re, va] = await Promise.allSettled([datisReal(icao, ctx), vatsimAtisAll(ctx)]);
  const vat = va.status === 'fulfilled' ? va.value.list.filter((a) => a.cs === icao + '_ATIS' || new RegExp('^' + icao + '_[A-Z0-9]+_ATIS$').test(a.cs)) : [];
  return json({ icao, real: re.status === 'fulfilled' ? re.value : [], realErr: re.status === 'rejected' ? String(re.reason && re.reason.message || re.reason) : null,
    vatsim: vat, vatsimErr: va.status === 'rejected' ? String(va.reason && va.reason.message || va.reason) : null }, 200, { ...h, 'Cache-Control': 'public, max-age=60' });
}

/* IANA time zone for a position (Open-Meteo timezone=auto), cached at the edge for 30 days. Used for local sun times. */
async function tzRoute(url, ctx, h) {
  const la = Math.round(+url.searchParams.get('lat') * 10) / 10, lo = Math.round(+url.searchParams.get('lon') * 10) / 10;
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new HttpError(400, 'lat and lon are required');
  const cache = caches.default, ck = new Request('https://tz-cache.local/' + la + '/' + lo);
  let r = await cache.match(ck);
  if (!r) {
    const up = await fetchT(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&timezone=auto&forecast_days=1&daily=sunrise`, 10000, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } });
    if (!up.ok) throw new HttpError(502, 'Time zone service ' + up.status);
    const j = await up.json();
    if (!j || !j.timezone) throw new HttpError(502, 'No time zone');
    r = new Response(JSON.stringify({ tz: j.timezone }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=2592000' } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, r.clone())); else await cache.put(ck, r.clone());
  }
  const hd = new Headers(r.headers); for (const [k, v] of Object.entries(h)) hd.set(k, v); hd.set('Cache-Control', 'public, max-age=86400');
  return new Response(r.body, { status: 200, headers: hd });
}

/* Model forecast for the Weather app (Open-Meteo, free for non-commercial use): 48 h hourly + 7 days, in the airport's local time. Cached 30 min. */
async function fcRoute(url, ctx, h) {
  const la = Math.round(+url.searchParams.get('lat') * 10) / 10, lo = Math.round(+url.searchParams.get('lon') * 10) / 10;
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new HttpError(400, 'lat and lon are required');
  const slot = Math.floor(Date.now() / 1800000);
  const cache = caches.default, ck = new Request('https://fc2-cache.local/' + slot + '/' + la + '/' + lo);
  let r = await cache.match(ck);
  if (!r) {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&timezone=auto&forecast_days=7&wind_speed_unit=kn`
      + '&hourly=temperature_2m,relative_humidity_2m,weather_code,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,cloud_cover_low,is_day'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max';
    let up; try { up = await fetchT(u, 12000, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } }); } catch (e) { throw new HttpError(504, 'Forecast service is slow right now'); }
    if (!up.ok) throw new HttpError(502, 'Forecast service ' + up.status);
    const j = await up.json(), H = j.hourly || {}, D = j.daily || {}, off = +j.utc_offset_seconds || 0;
    const now = Date.now(), hours = [];
    (H.time || []).forEach((t, i) => { const ms = Date.parse(t + 'Z') - off * 1000; if (ms < now - 3600000 || hours.length >= 48) return;
      hours.push({ t: new Date(ms).toISOString().slice(0, 13) + ':00Z', temp: H.temperature_2m[i], rh: H.relative_humidity_2m[i], code: H.weather_code[i], pop: H.precipitation_probability[i], wd: H.wind_direction_10m[i], ws: H.wind_speed_10m[i], wg: H.wind_gusts_10m[i], vis: H.visibility[i], low: H.cloud_cover_low[i], day: H.is_day[i] }); });
    const days = (D.time || []).map((d, i) => ({ d, code: D.weather_code[i], hi: D.temperature_2m_max[i], lo: D.temperature_2m_min[i], pop: D.precipitation_probability_max[i], ws: D.wind_speed_10m_max[i], wg: D.wind_gusts_10m_max[i] }));
    r = new Response(JSON.stringify({ tz: j.timezone || null, tzAbbr: j.timezone_abbreviation || '', off, hours, days }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800' } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, r.clone())); else await cache.put(ck, r.clone());
  }
  const hd = new Headers(r.headers); for (const [k, v] of Object.entries(h)) hd.set(k, v); hd.set('Cache-Control', 'public, max-age=600');
  return new Response(r.body, { status: 200, headers: hd });
}

/* Vector IFR enroute data (FAA AIS open data, public domain;: ATS routes, designated points, NAVAIDs) for one cell.
   lv=L: 4-degree cells, low-altitude chart items; lv=H: 8-degree cells, high-altitude chart items. Cached 7 days at the edge. */
const AIS_FS = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/';
async function aisQuery(svc, where, fields, env4, maxPages, extra) {
  const out = [];
  for (let page = 0; page < (maxPages || 4); page++) {
    const q = new URLSearchParams({ where, outFields: fields, geometry: env4.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outSR: '4326', geometryPrecision: '5', resultOffset: String(page * 2000), resultRecordCount: '2000', f: 'geojson', ...(extra || {}) });
    /* the FAA service rate-limits bursts: back off and try again a few times */
    let j = null;
    for (let tr = 0; tr < 4; tr++) {
      if (tr) await new Promise((res) => setTimeout(res, 900 * tr + Math.random() * 400));
      let r; try { r = await fetchT(AIS_FS + svc + '/FeatureServer/0/query?' + q.toString(), 15000, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } }); } catch (e) { if (tr === 3) throw new Error('FAA AIS ' + svc + ' timed out'); continue; }
      if (r.status === 429 || r.status >= 500) { if (tr === 3) throw new Error('FAA AIS ' + svc + ' ' + r.status); continue; }
      if (!r.ok) throw new Error('FAA AIS ' + svc + ' ' + r.status);
      j = await r.json();
      if (j.error) { if (/too many|rate|busy/i.test(j.error.message || '') && tr < 3) { j = null; continue; } throw new Error('FAA AIS ' + svc + ': ' + (j.error.message || 'error')); }
      break;
    }
    if (!j) throw new Error('FAA AIS ' + svc + ' is busy, try again');
    (j.features || []).forEach((f) => out.push(f));
    if (!j.exceededTransferLimit && !(j.properties && j.properties.exceededTransferLimit)) break;
  }
  return out;
}
const aisV = (v) => (v == null || +v >= 99999 ? null : +v);
async function ifrRoute(url, ctx, h) {
  const lv = url.searchParams.get('lv') === 'H' ? 'H' : 'L', sz = lv === 'H' ? 8 : 4;
  const m = String(url.searchParams.get('cell') || '').match(/^(-?\d{1,2}),(-?\d{1,3})$/); if (!m) throw new HttpError(400, 'cell=lat,lon');
  const la = +m[1], lo = +m[2]; if (la % sz || lo % sz || la < -90 || la >= 90 || lo < -180 || lo >= 180) throw new HttpError(400, 'cell must be on the ' + sz + ' degree grid');
  const cache = caches.default, ck = new Request('https://ifr-cache.local/v2/' + lv + '/' + la + '/' + lo);
  let r = await cache.match(ck);
  if (!r) {
    const env4 = [lo, la, lo + sz, la + sz], fl = lv === 'H' ? '(US_HIGH=1 OR AK_HIGH=1)' : '(US_LOW=1 OR AK_LOW=1)';
    /* one query at a time: the FAA service throttles parallel bursts */
    const rt = await aisQuery('ATS_Route', fl, 'OBJECTID,IDENT,TYPE_CODE,LEVEL_,MEA_E_VAL,MEA_W_VAL,MOCA_VAL,NMAGTRK,NREVMAGTRK,LENGTH_VAL', env4, 4);
    const pt = await aisQuery('DesignatedPoints', fl, 'OBJECTID,IDENT,TYPE_CODE,REPATC', env4, 4);
    const nv = await aisQuery('NAVAIDSystem', fl, 'OBJECTID,GLOBAL_ID,IDENT,NAME_TXT,CLASS_TXT,TYPE_CODE', env4, 1);
    /* frequencies live on the components (VOR, DME, TACAN, NDB), joined by NAVSYS_ID; prefer the VOR or NDB one */
    const fq = {};
    try { (await aisQuery('NavaidComponents', fl, 'NAVSYS_ID,FREQUENCY,NAV_TYPE', env4, 2)).forEach((f) => { const p = f.properties || {}; if (!p.NAVSYS_ID || p.FREQUENCY == null) return; const rank = p.NAV_TYPE === 3 || p.NAV_TYPE === 1 ? 2 : 1; const cur = fq[p.NAVSYS_ID];
      if (!cur || rank > cur.r) fq[p.NAVSYS_ID] = { r: rank, f: p.NAV_TYPE === 1 ? String(Math.round(+p.FREQUENCY)) : (+p.FREQUENCY).toFixed(Math.round(+p.FREQUENCY * 100) % 10 ? 2 : 1) }; }); } catch (e) {}
    const routes = rt.filter((f) => f.geometry && f.geometry.coordinates).map((f) => { const p = f.properties || {}; const g = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
      return [p.OBJECTID, p.IDENT || '', p.TYPE_CODE || '', aisV(p.MEA_E_VAL), aisV(p.MEA_W_VAL), aisV(p.MOCA_VAL), aisV(p.NMAGTRK), aisV(p.NREVMAGTRK), p.LENGTH_VAL != null ? Math.round(+p.LENGTH_VAL) : null, g]; });
    const fixes = pt.filter((f) => f.geometry && f.geometry.coordinates).map((f) => { const p = f.properties || {}, c = f.geometry.coordinates; return [p.OBJECTID, p.IDENT || '', +c[0].toFixed(5), +c[1].toFixed(5), p.REPATC === 'C' ? 1 : 0]; });
    const navs = nv.filter((f) => f.geometry && f.geometry.coordinates).map((f) => { const p = f.properties || {}, c = f.geometry.coordinates; return [p.OBJECTID, p.IDENT || '', p.NAME_TXT || '', p.CLASS_TXT || '', +c[0].toFixed(5), +c[1].toFixed(5), (fq[p.GLOBAL_ID] && fq[p.GLOBAL_ID].f) || '']; });
    r = new Response(JSON.stringify({ lv, cell: [la, lo], routes, fixes, navs }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=604800' } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, r.clone())); else await cache.put(ck, r.clone());
  }
  const hd = new Headers(r.headers); for (const [k, v] of Object.entries(h)) hd.set(k, v); hd.set('Cache-Control', 'public, max-age=86400');
  return new Response(r.body, { status: 200, headers: hd });
}

/* Vector VFR sectional data (FAA AIS open data, US only) for one 4-degree cell: class B/C/D/E airspace, special use
   airspace, airports with their runways, VFR waypoints and obstacles 200 ft AGL and taller. Airspace comes generalised
   to about 40 m, which is far finer than a sectional draws it. Cached 7 days at the edge. */
function vfrPolys(g, q) {
  if (!g) return [];
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const area = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; };
  const k = Math.pow(10, q);
  /* exterior rings counter-clockwise, holes clockwise: then the inside of the airspace is always on the left of a
     boundary line, which the app uses to put the shaded band of class E on the inside */
  return polys.map((rings) => rings.map((r, i) => { let rr = r.map((p) => [Math.round(p[0] * k) / k, Math.round(p[1] * k) / k]); const a = area(rr); if ((i === 0 && a < 0) || (i > 0 && a > 0)) rr = rr.reverse(); return rr; }));
}
/* a point well inside a polygon for its label: a coarse search for the spot farthest from every edge, refined twice */
function vfrLabelPt(polys) {
  if (!polys.length) return null;
  const areaOf = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(s / 2); };
  const P = polys.slice().sort((a, b) => areaOf(b[0]) - areaOf(a[0]))[0]; if (!P || !P[0] || P[0].length < 4) return null;
  const c = Math.cos(P[0][0][1] * Math.PI / 180);
  const inside = (x, y) => { let n = false; for (const r of P) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) n = !n; } return n; };
  const dist = (x, y) => { let m = 1e9; for (const r of P) for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i], vx = (b[0] - a[0]) * c, vy = b[1] - a[1], L = vx * vx + vy * vy; let t = L ? (((x - a[0]) * c) * vx + (y - a[1]) * vy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const dx = (a[0] - x) * c + t * vx, dy = a[1] - y + t * vy, d = dx * dx + dy * dy; if (d < m) m = d; } return Math.sqrt(m); };
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; P[0].forEach((p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; });
  let best = null, bd = -1, sx = (x1 - x0), sy = (y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let it = 0; it < 3; it++) {
    const n = it ? 7 : 14;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { const x = cx - sx / 2 + sx * i / n, y = cy - sy / 2 + sy * j / n; if (!inside(x, y)) continue; const d = dist(x, y); if (d > bd) { bd = d; best = [x, y]; } }
    if (!best) return null; cx = best[0]; cy = best[1]; sx /= 4; sy /= 4;
  }
  return [Math.round(best[0] * 1e4) / 1e4, Math.round(best[1] * 1e4) / 1e4];
}
async function vfrRoute(url, ctx, h) {
  const sz = 4, m = String(url.searchParams.get('cell') || '').match(/^(-?\d{1,2}),(-?\d{1,3})$/); if (!m) throw new HttpError(400, 'cell=lat,lon');
  const la = +m[1], lo = +m[2]; if (la % sz || lo % sz || la < -90 || la >= 90 || lo < -180 || lo >= 180) throw new HttpError(400, 'cell must be on the 4 degree grid');
  const cache = caches.default, ck = new Request('https://vfr-cache.local/v1/' + la + '/' + lo);
  let r = await cache.match(ck);
  if (!r) {
    const env4 = [lo, la, lo + sz, la + sz], gen = { maxAllowableOffset: '0.0004', geometryPrecision: '4' };
    const fv = (v) => (v == null || +v <= -9000 || +v >= 99999 ? null : +v);
    /* one query at a time: the FAA service throttles parallel bursts */
    const asF = await aisQuery('Class_Airspace', "CLASS IN ('B','C','D') OR LOCAL_TYPE IN ('CLASS_E2','CLASS_E3','CLASS_E4','MODE C') OR (LOCAL_TYPE IN ('CLASS_E5','CLASS_E6') AND LOWER_CODE='SFC' AND LOWER_VAL IN (700,1200))",
      'OBJECTID,IDENT,NAME,CLASS,LOCAL_TYPE,LOWER_VAL,LOWER_CODE,UPPER_VAL,UPPER_CODE', env4, 4, gen);
    const suF = await aisQuery('Special_Use_Airspace', '1=1', 'OBJECTID,NAME,TYPE_CODE,LOWER_VAL,LOWER_CODE,UPPER_VAL,UPPER_CODE', env4, 2, gen);
    const apF = await aisQuery('US_Airport', "OPERSTATUS='OPERATIONAL' AND TYPE_CODE IN ('AD','SP')", 'GLOBAL_ID,IDENT,ICAO_ID,NAME,ELEVATION,TYPE_CODE,PRIVATEUSE,MIL_CODE', env4, 3, { geometryPrecision: '5' });
    const rwF = await aisQuery('Runways', '1=1', 'AIRPORT_ID,DESIGNATOR,LENGTH,WIDTH,COMP_CODE,LIGHTACTV,LIGHTINTNS', env4, 4, { maxAllowableOffset: '0.00002', geometryPrecision: '5' });
    let vpF = [], obF = [];
    try { vpF = await aisQuery('DesignatedPoints', "IDENT LIKE 'VP%'", 'IDENT', env4, 1, { geometryPrecision: '5' }); } catch (e) {}
    try { obF = await aisQuery('Digital_Obstacle_File', 'AGL>=200', 'AGL,AMSL,Lighting', env4, 4, { geometryPrecision: '4' }); } catch (e) {}
    const lt = (p) => { const L = String(p.LOCAL_TYPE || ''); return L === 'MODE C' ? 'MC' : /^CLASS_E(\d)/.test(L) ? 'E' + L.slice(7) : String(p.CLASS || L.slice(6) || '?'); };
    const twr = new Set();
    const as = asF.filter((f) => f.geometry).map((f) => { const p = f.properties || {}, k = lt(p), polys = vfrPolys(f.geometry, 4); if (/^[BCD]$/.test(k) && p.IDENT) twr.add(p.IDENT);
      return [p.OBJECTID, k, fv(p.LOWER_VAL), p.LOWER_CODE || '', fv(p.UPPER_VAL), p.UPPER_CODE || '', p.NAME || '', p.IDENT || '', /^[BCD]$/.test(k) ? vfrLabelPt(polys) : null, polys]; });
    const sua = suF.filter((f) => f.geometry).map((f) => { const p = f.properties || {}, polys = vfrPolys(f.geometry, 4);
      return [p.OBJECTID, p.TYPE_CODE || '', p.NAME || '', fv(p.LOWER_VAL), p.LOWER_CODE || '', fv(p.UPPER_VAL), p.UPPER_CODE || '', vfrLabelPt(polys), polys]; });
    /* runways, grouped by airport: longest length, hard surface, lighting and the heading of the longest one */
    const byApt = {}, rwys = [];
    const brg = (a, b) => { const r = Math.PI / 180, y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r), x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r); return (Math.atan2(y, x) / r + 360) % 180; };
    rwF.forEach((f) => { const p = f.properties || {}; if (!p.AIRPORT_ID || /^H/i.test(p.DESIGNATOR || '')) return; const comp = String(p.COMP_CODE || '').toUpperCase(); if (/WATER/.test(comp)) return;
      const polys = vfrPolys(f.geometry, 5), ring = polys[0] && polys[0][0]; const len = +p.LENGTH || 0;
      const A = byApt[p.AIRPORT_ID] || (byApt[p.AIRPORT_ID] = { len: 0, hard: 0, lit: 0, brg: null, rw: [] });
      const hard = /ASPH|CONC|PEM|BIT|BRICK|TRTD/.test(comp) ? 1 : 0, lit = p.LIGHTINTNS && !/NONE/i.test(p.LIGHTINTNS) ? 1 : 0;
      if (lit) A.lit = 1; if (hard && len >= 1500) A.hard = 1;
      if (ring && len > A.len) { let a = ring[0], b = ring[1], best = -1; for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) { const d = (ring[i][0] - ring[j][0]) ** 2 + (ring[i][1] - ring[j][1]) ** 2; if (d > best) { best = d; a = ring[i]; b = ring[j]; } } A.brg = Math.round(brg(a, b)); }
      if (len > A.len) A.len = len; if (ring) A.rw.push(ring); });
    const apts = apF.filter((f) => f.geometry && f.geometry.coordinates).map((f) => { const p = f.properties || {}, c = f.geometry.coordinates, A = byApt[p.GLOBAL_ID] || { len: 0, hard: 0, lit: 0, brg: null, rw: [] };
      const id = p.IDENT || ''; A.rw.forEach((rg) => rwys.push([id, rg]));
      return [id, p.ICAO_ID || '', p.NAME || '', +c[0].toFixed(5), +c[1].toFixed(5), p.ELEVATION != null ? Math.round(+p.ELEVATION) : null, p.TYPE_CODE || 'AD', +p.PRIVATEUSE ? 1 : 0, /MIL/.test(p.MIL_CODE || '') ? 1 : 0, twr.has(id) ? 1 : 0, A.len, A.hard, A.lit, A.brg]; });
    const vps = vpF.filter((f) => f.geometry && f.geometry.coordinates).map((f) => [(f.properties || {}).IDENT || '', +f.geometry.coordinates[0].toFixed(5), +f.geometry.coordinates[1].toFixed(5)]);
    const obs = obF.filter((f) => f.geometry && f.geometry.coordinates).map((f) => { const p = f.properties || {}; return [+f.geometry.coordinates[0].toFixed(4), +f.geometry.coordinates[1].toFixed(4), Math.round(+p.AGL || 0), Math.round(+p.AMSL || 0), /^[NU]?$/.test(String(p.Lighting || '').trim()) ? 0 : 1]; });
    r = new Response(JSON.stringify({ cell: [la, lo], as, sua, apts, rwys, vps, obs }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=604800' } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, r.clone())); else await cache.put(ck, r.clone());
  }
  const hd = new Headers(r.headers); for (const [k, v] of Object.entries(h)) hd.set(k, v); hd.set('Cache-Control', 'public, max-age=86400');
  return new Response(r.body, { status: 200, headers: hd });
}

/* Airways for the route editor (FAA AIS, US only).
   ?at=lat,lon  -> the airways that pass through that point
   ?id=J84      -> the whole airway as ordered chains of named points, with each leg's MEA. Cached 7 days. */
async function aisPost(svc, params) {
  for (let tr = 0; tr < 4; tr++) {
    if (tr) await new Promise((res) => setTimeout(res, 900 * tr + Math.random() * 400));
    let r; try { r = await fetchT(AIS_FS + svc + '/FeatureServer/0/query', 15000, { method: 'POST', headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() }); } catch (e) { if (tr === 3) throw new Error('FAA AIS ' + svc + ' timed out'); continue; }
    if (r.status === 429 || r.status >= 500) { if (tr === 3) throw new Error('FAA AIS ' + svc + ' ' + r.status); continue; }
    if (!r.ok) throw new Error('FAA AIS ' + svc + ' ' + r.status);
    const j = await r.json();
    if (j.error) { if (/too many|rate|busy/i.test(j.error.message || '') && tr < 3) continue; throw new Error('FAA AIS ' + svc + ': ' + (j.error.message || 'error')); }
    return j;
  }
  throw new Error('FAA AIS ' + svc + ' is busy, try again');
}
async function awyRoute(url, ctx, h) {
  const at = url.searchParams.get('at'), id = String(url.searchParams.get('id') || '').toUpperCase();
  const cache = caches.default;
  if (at) {
    const m = at.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/); if (!m) throw new HttpError(400, 'at=lat,lon');
    const la = Math.round(+m[1] * 1000) / 1000, lo = Math.round(+m[2] * 1000) / 1000, e = 0.004;
    const ck = new Request('https://awy-at.local/v1/' + la + '/' + lo);
    let r = await cache.match(ck);
    if (!r) {
      const j = await aisPost('ATS_Route', { where: '1=1', outFields: 'IDENT,LEVEL_', geometry: [lo - e, la - e, lo + e, la + e].join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'false', returnDistinctValues: 'true', f: 'json' });
      const seen = {}, list = [];
      (j.features || []).forEach((f) => { const a = f.attributes || {}; if (!a.IDENT) return; const k = a.IDENT; if (!seen[k]) { seen[k] = { id: k, lv: a.LEVEL_ || '' }; list.push(seen[k]); } else if (seen[k].lv !== a.LEVEL_) seen[k].lv = 'B'; });
      list.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
      r = new Response(JSON.stringify({ at: [la, lo], airways: list }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=604800' } });
      if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, r.clone())); else await cache.put(ck, r.clone());
    }
    const hd = new Headers(r.headers); for (const [k, v] of Object.entries(h)) hd.set(k, v); hd.set('Cache-Control', 'public, max-age=86400');
    return new Response(r.body, { status: 200, headers: hd });
  }
  if (!/^[A-Z]{1,2}\d{1,4}[A-Z]?$/.test(id)) throw new HttpError(400, 'id=airway, for example J84');
  const ck = new Request('https://awy-id.local/v1/' + id);
  let r = await cache.match(ck);
  if (!r) {
    const segs = [];
    for (let page = 0; page < 5; page++) {
      const j = await aisPost('ATS_Route', { where: "IDENT='" + id + "'", outFields: 'OBJECTID,STARTPT_ID,ENDPT_ID,MEA_E_VAL,MEA_W_VAL,LEVEL_', returnGeometry: 'true', outSR: '4326', geometryPrecision: '6', resultOffset: String(page * 2000), resultRecordCount: '2000', f: 'json' });
      (j.features || []).forEach((f) => { const a = f.attributes || {}, g = f.geometry && f.geometry.paths; if (!g || !g.length || !a.STARTPT_ID || !a.ENDPT_ID) return; const p0 = g[0][0], pl = g[g.length - 1][g[g.length - 1].length - 1];
        segs.push({ s: a.STARTPT_ID, e: a.ENDPT_ID, ps: [p0[1], p0[0]], pe: [pl[1], pl[0]], mea: [aisV(a.MEA_E_VAL), aisV(a.MEA_W_VAL)].filter((v) => v != null).join('/'), lv: a.LEVEL_ || '' }); });
      if (!j.exceededTransferLimit) break;
    }
    /* names for the points: designated points first, then NAVAIDs */
    const ids = [...new Set(segs.flatMap((x) => [x.s, x.e]))], names = {};
    for (const [svc, fld] of [['DesignatedPoints', 'IDENT'], ['NAVAIDSystem', 'IDENT']]) {
      const left = ids.filter((x) => !names[x]);
      for (let i = 0; i < left.length; i += 150) {
        const part = left.slice(i, i + 150);
        const j = await aisPost(svc, { where: 'GLOBAL_ID IN (' + part.map((x) => "'" + x.replace(/'/g, '') + "'").join(',') + ')', outFields: 'GLOBAL_ID,' + fld, returnGeometry: 'false', f: 'json' });
        (j.features || []).forEach((f) => { const a = f.attributes || {}; if (a.GLOBAL_ID) names[a.GLOBAL_ID] = { n: a[fld], k: svc === 'NAVAIDSystem' ? 'nav' : 'fix' }; });
      }
    }
    /* walk the segments into chains (an airway can have gaps) */
    const pos = {}, adj = {};
    segs.forEach((x, i) => { pos[x.s] = x.ps; pos[x.e] = x.pe; (adj[x.s] = adj[x.s] || []).push(i); (adj[x.e] = adj[x.e] || []).push(i); });
    const used = new Set(), chains = [];
    const ends = Object.keys(adj).filter((k) => adj[k].length === 1);
    const walk = (start) => { const ch = [start], legs = []; let cur = start;
      for (;;) { const nx = (adj[cur] || []).find((i) => !used.has(i)); if (nx == null) break; used.add(nx); const x = segs[nx]; cur = x.s === cur ? x.e : x.s; ch.push(cur); legs.push(x.mea); }
      return { ch, legs }; };
    ends.forEach((k) => { if ((adj[k] || []).some((i) => !used.has(i))) chains.push(walk(k)); });
    Object.keys(adj).forEach((k) => { if ((adj[k] || []).some((i) => !used.has(i))) chains.push(walk(k)); });
    const out = chains.filter((c) => c.ch.length > 1).map((c) => ({ pts: c.ch.map((k) => { const p = pos[k], nm = names[k]; return [nm ? nm.n : '', +p[0].toFixed(6), +p[1].toFixed(6), nm ? nm.k : '']; }), mea: c.legs }));
    r = new Response(JSON.stringify({ id, chains: out }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=604800' } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, r.clone())); else await cache.put(ck, r.clone());
  }
  const hd = new Headers(r.headers); for (const [k, v] of Object.entries(h)) hd.set(k, v); hd.set('Cache-Control', 'public, max-age=86400');
  return new Response(r.body, { status: 200, headers: hd });
}

/* Shared chart alignment: when a pilot lines a chart up on the map, everyone gets it. Kept in KV per airport,
   chart name and page. Writes come only from the EFB's own site, are range-checked and must sit near the airport. */
async function ovgeoRoute(req, url, env, h) {
  const kv = env && env.STORE; if (!kv) throw new HttpError(503, 'Storage is not set up');
  const keyOf = (icao, name, page) => 'ovgeo:v1:' + icao + ':' + String(name).toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 80) + ':' + page;
  if (req.method === 'GET') {
    const icao = String(url.searchParams.get('icao') || '').toUpperCase(), name = url.searchParams.get('name') || '', page = +url.searchParams.get('page') || 1;
    if (!/^[A-Z0-9]{3,4}$/.test(icao) || !name) throw new HttpError(400, 'icao and name are required');
    const v = await kv.get(keyOf(icao, name, page), 'json').catch(() => null);
    return json({ geo: v || null }, 200, h);
  }
  const origin = req.headers.get('Origin') || '', allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim());
  if (!allowed.includes(origin)) throw new HttpError(403, 'Not allowed');
  let b; try { b = JSON.parse(await req.text()); } catch (e) { throw new HttpError(400, 'Bad body'); }
  const icao = String(b.icao || '').toUpperCase(), name = String(b.name || ''), page = Math.max(1, Math.min(20, +b.page || 1)), g = b.geo || {};
  const num = (v) => typeof v === 'number' && isFinite(v);
  if (!/^[A-Z0-9]{3,4}$/.test(icao) || !name || name.length > 120) throw new HttpError(400, 'icao and name are required');
  if (!num(g.lat) || !num(g.lon) || !num(g.h) || !num(g.rot) || Math.abs(g.lat) > 85 || Math.abs(g.lon) > 180 || g.h < 300 || g.h > 800000) throw new HttpError(400, 'Alignment out of range');
  /* must be near the airport (a chart centre can sit off the field, but not far) */
  try { const a = await airportRoute(icao); const ap = a && a.airport; if (ap && isFinite(ap.lat)) { const d = Math.hypot(g.lat - ap.lat, (g.lon - ap.lon) * Math.cos(ap.lat * Math.PI / 180)) * 60; if (d > Math.max(60, g.h / 1852 * 1.5)) throw new HttpError(400, 'Alignment is too far from the airport'); } } catch (e) { if (e instanceof HttpError) throw e; }
  const k = keyOf(icao, name, page), old = await kv.get(k, 'json').catch(() => null);
  if (old && Date.now() - (old.t || 0) < 5000) return json({ ok: true, geo: old }, 200, h);
  const v = { lat: +g.lat.toFixed(7), lon: +g.lon.toFixed(7), h: Math.round(g.h * 10) / 10, rot: Math.round((((g.rot % 360) + 360) % 360) * 100) / 100, t: Date.now(), n: ((old && old.n) || 0) + 1 };
  await kv.put(k, JSON.stringify(v));
  return json({ ok: true, geo: v }, 200, h);
}

/* Airports for the map, from OurAirports (public domain), rebuilt every 14 days and kept in KV.
   set=a: large and medium airports with a rank (1 large, 2 medium with airline service, 3 other medium);
   set=b: small airports that have an ICAO-style code (shown only zoomed in). */
async function aptsBuild(kv) {
  const r = await fetchT('https://davidmegginson.github.io/ourairports-data/airports.csv', 25000, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)' } });
  if (!r.ok) throw new HttpError(502, 'OurAirports ' + r.status);
  const t = await r.text();
  const lines = t.split('\n'), split = (ln) => { const out = []; let f = '', q = false; for (let i = 0; i < ln.length; i++) { const c = ln[i]; if (q) { if (c === '"') { if (ln[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { out.push(f); f = ''; } else if (c !== '\r') f += c; } out.push(f); return out; };
  const head = split(lines[0]), col = (n) => head.indexOf(n);
  const C = { ident: col('ident'), type: col('type'), name: col('name'), lat: col('latitude_deg'), lon: col('longitude_deg'), ctry: col('iso_country'), muni: col('municipality'), sched: col('scheduled_service'), icao: col('icao_code'), iata: col('iata_code'), gps: col('gps_code') };
  const four = (x) => /^[A-Z]{4}$/.test(x || ''), A = [], B = [];
  for (let k = 1; k < lines.length; k++) {
    const ln = lines[k]; if (!ln || !/(large_airport|medium_airport|small_airport)/.test(ln)) continue;
    const f = split(ln), type = f[C.type], lat = +f[C.lat], lon = +f[C.lon]; if (!isFinite(lat) || !isFinite(lon)) continue;
    const code = (C.icao >= 0 && four(f[C.icao]) && f[C.icao]) || (four(f[C.gps]) && f[C.gps]) || (four(f[C.ident]) && f[C.ident]) || '';
    const name = String(f[C.name] || '').replace(/\s+(International|Intl\.?)\s+Airport$/i, ' Intl').replace(/\s+Airport$/i, '').slice(0, 44), L = Math.round(lat * 1e4) / 1e4, O = Math.round(lon * 1e4) / 1e4;
    if (type === 'large_airport') A.push([code || f[C.ident], f[C.iata] || '', name, L, O, 1, f[C.ctry] || '', String(f[C.muni] || '').slice(0, 30)]);
    else if (type === 'medium_airport') A.push([code || f[C.ident], f[C.iata] || '', name, L, O, f[C.sched] === 'yes' ? 2 : 3, f[C.ctry] || '', String(f[C.muni] || '').slice(0, 30)]);
    else if (type === 'small_airport' && code) B.push([code, name, L, O]);
  }
  A.sort((x, y) => x[5] - y[5]);
  const v = new Date().toISOString().slice(0, 10), a = JSON.stringify({ v, a: A }), b = JSON.stringify({ v, a: B });
  if (kv) { await kv.put('apts:v1:a', a, { expirationTtl: 30 * 86400 }); await kv.put('apts:v1:b', b, { expirationTtl: 30 * 86400 }); await kv.put('apts:v1:t', String(Date.now()), { expirationTtl: 30 * 86400 }); }
  return { a, b };
}
async function aptsRoute(url, env, ctx, h) {
  const set = url.searchParams.get('set') === 'b' ? 'b' : 'a', kv = env && env.STORE;
  let body = kv ? await kv.get('apts:v1:' + set) : null;
  const t = kv ? +(await kv.get('apts:v1:t')) || 0 : 0;
  if (!body) body = (await aptsBuild(kv))[set];
  else if (Date.now() - t > 14 * 86400000 && ctx && ctx.waitUntil) ctx.waitUntil(aptsBuild(kv).catch(() => {}));
  return new Response(body, { status: 200, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(refreshMajor(env, ctx)); },
  async fetch(req, env, ctx) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (new URL(req.url).pathname.replace(/\/+$/, '') === '/api/efb/ovgeo' && (req.method === 'GET' || req.method === 'POST')) { try { return await ovgeoRoute(req, new URL(req.url), env, h); } catch (e) { return json({ error: e.message || 'Error' }, e.status || 500, h); } }
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, h);
    const url = new URL(req.url);
    const configured = Boolean(env.VAMSYS_CLIENT_ID && env.VAMSYS_CLIENT_SECRET);
    try {
      const ov = url.pathname.match(/^\/api\/efb\/oaip\/v\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
      if (ov) return await oaipVector(ov, env, ctx, h);
      switch (url.pathname.replace(/\/+$/, '')) {
        case '/api/efb/health': return json({ ok: true, configured, openaip: Boolean(env.OPENAIP_API_KEY), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/pilot': if (!configured) break; return json({ ...(await pilotRoute(env, url.searchParams.get('username'))), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/bookings': if (!configured) break; return json({ ...(await bookingsRoute(env, url.searchParams.get('username'))), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/charts': return json({ ...(await chartsRoute(url.searchParams.get('icao'), env, ctx)), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/chart-pdf': return await chartPdfRoute(url, h);
        case '/api/efb/airport-layout': { const p = layoutRoute(url.searchParams.get('icao'), env, ctx); if (ctx && ctx.waitUntil) ctx.waitUntil(p.catch(() => {})); return json({ ...(await p), updatedAt: new Date().toISOString() }, 200, h); }
        case '/api/efb/airport': return json({ ...(await airportRoute(url.searchParams.get('icao'), ctx)), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/major': return json({ ...(await majorRoute(env)), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/metars': return await metarCellRoute(url.searchParams.get('cell'), url.searchParams.get('size'), ctx, h);
        case '/api/efb/winds': return await windRoute(url, ctx, h);
        case '/api/efb/apts': return await aptsRoute(url, env, ctx, h);
        case '/api/efb/awy': return await awyRoute(url, ctx, h);
        case '/api/efb/ifr': return await ifrRoute(url, ctx, h);
        case '/api/efb/vfr': return await vfrRoute(url, ctx, h);
        case '/api/efb/fc': return await fcRoute(url, ctx, h);
        case '/api/efb/tz': return await tzRoute(url, ctx, h);
        case '/api/efb/atis': return await atisRoute(url.searchParams.get('icao'), ctx, h);
        case '/api/efb/pireps': return await pirepCellRoute(url.searchParams.get('cell'), ctx, h);
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
