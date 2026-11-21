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
 *                                          (airports RCxx: AIP Taiwan from the CAA eAIP, same shape, cycle "TW…")
 *   GET /api/efb/airport-layout?icao=   -> runways, taxiways, stands and holds from OpenStreetMap (&warm=1: build it ahead, small answer)
 *   GET /api/efb/fir                    -> FIR / ARTCC boundaries (VATSpy Data Project, CC BY-SA 4.0), simplified
 *   GET /api/efb/radar                  -> RainViewer radar frame list (tiles are loaded straight from RainViewer)
 *   GET /api/efb/vatsim                 -> every VATSIM pilot, slimmed (about a tenth of the network feed); ?cs= one pilot's route
 *   GET/POST /api/efb/ovgeo             -> shared chart alignment (POST: a pilot's alignment, or {revert:true})
 *   GET /api/efb/mail, /api/efb/mail-att -> Polaris Mail for the EFB; staff write it on /admin (Cloudflare Access, see mail.js)
 *   GET /api/efb/docs, /api/efb/doc-file, /api/efb/doc-cover -> Polaris documents (manuals, SOPs) for the EFB's Documents;
 *                                          staff put them on /admin, Documents tab (see docs.js)
 *   GET /api/efb/cal?cs=                -> the signed-in pilot's company calendar: Polaris entries for them and the vAMSYS events (see cal.js)
 *   GET /api/efb/aoc                    -> AOC messages from Polaris operations for the EFB's Messages (read only; staff send them
 *                                          on /admin, Messages tab, see aoc.js)
 *   POST /api/efb/hoppie {logon, cs}    -> the messages waiting for a callsign on Hoppie's ACARS, read with type=peek (never sends)
 *   GET/POST /api/efb/pm, /api/efb/pm/state -> pilots' messages to a department (see pm.js)
 *   /api/efb/push/(key|sub|unsub|state|test), /api/efb/crew, /api/efb/crew/(checkin|checkout|alarms) -> Web Push, check-in, Clock alarms (see crew.js)
 *   GET /api/efb/pirep?id=              -> one of the signed-in pilot's PIREPs with its flown track
 *   GET /api/efb/datalink               -> VATSIM stations whose info mentions DCL/PDC or CPDLC (Hoppie), with the logon code
 *   /admin/api/stands(/try|/change)      -> the admin's Stands tab: the stand plan for the automatic stand assignment (see stands.js)
 *   /admin/api/ooo, /admin/api/ooo/reason -> the admin's On-time tab: OOOI times and on-time performance (see ooo.js)
 *   GET /admin/api/watch                -> Flight Watch on the Live tab: alerts for the Polaris flights in the air (see watch.js)
 *   GET /admin/api/live, /admin/live.js -> the admin's Live tab: Polaris (PAW) flights on VATSIM and the globe (see live.js)
 *   GET/POST /api/efb/wx                -> the signed-in pilot's Weather settings (saved airports, units)
 *   GET/POST /api/efb/navproc?icao=     -> the signed-in pilot's SIDs/STARs read from their own simulator (Polaris Navdata)
 *   GET/POST /api/efb/chartnotes?k=     -> the signed-in pilot's pen marks on a chart (ICAO|chart name|page)
 *   GET /api/site/live, /api/site/events -> the Polaris website's Network and Events pages, any origin (see site.js)
 *   GET /privacy                        -> the EFB privacy policy (shown on the Login with vAMSYS consent screen)
 *   /auth/start, /auth/callback, /auth/me, /auth/logout -> pilot sign-in with vAMSYS (see auth.js)
 *
 * Secrets (wrangler secret put ...): VAMSYS_CLIENT_ID, VAMSYS_CLIENT_SECRET
 * Vars (wrangler.toml): VAMSYS_SCOPE (default "ops:read"), ALLOWED_ORIGINS (comma list, or "*")
 */
import { liveFlights } from './live.js';
import { siteRoute, siteLive, siteEvents } from './site.js';
import { PRIVACY_HTML } from './privacy.js';
import { authRoute, sessionOf, linkSig, signedInPilots, signOutPilot } from './auth.js';
import { mailPublic, mailAttachment, mailAdmin } from './mail.js';
import { docsPublic, docFile, docCover } from './docs.js';
import { aocPublic, hoppiePeek } from './aoc.js';
import { standWatch, autoPlan } from './stands.js';
import { flightWatch } from './watch.js';
import { calPublic } from './cal.js';
import { oooWatch } from './ooo.js';
import { sigRouteWatch } from './sigroute.js';
import { pmPublic } from './pm.js';
export { Mailbox } from './pm.js';
import { crewPublic, crewSoon, crew as crewCall, posrep, downsample as dsTrack } from './crew.js';
export { Crew } from './crew.js';
import { kbPublic, appsPublic, wxPrefsPublic } from './kb.js';
export { Kneeboard } from './kb.js';
export { PfdRelay } from './pfd.js';
import { pfdRoute } from './pfd.js';
import { officialFirs, trimShared } from './fir.js';
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

/* The pilot's live bookings: booked or in progress, no PIREP yet, not cancelled (vAMSYS's "Live" view). The status
   filter vAMSYS takes is asked first; if it gives nothing, the pilot's latest bookings are read without it and the
   live ones picked here, so a filter value vAMSYS does not know never hides a booking. */
const BK_DONE = /cancel|complet|delet|expir|reject|accept|filed|pirep|used|invalid/i;
function bkLive(b, now) {
  if (!b || b.pirep_id || b.pirep || b.deleted_at || b.cancelled_at || b.completed_at) return false;
  if (b.status != null && BK_DONE.test(String(b.status))) return false;
  if (b.cancelled === true || b.is_cancelled === true) return false;
  const v = b.valid_to ? Date.parse(b.valid_to) : NaN; if (Number.isFinite(v) && v < now - 6 * 3600_000) return false;
  return true;
}
async function liveBookings(env, pilotId) {
  const now = Date.now();
  let first = [];
  try { first = ((await vget(env, '/bookings', { 'filter[pilot_id]': pilotId, 'filter[status]': 'current', sort: 'id', 'page[size]': 10 })).data || []).filter((b) => bkLive(b, now)); } catch (e) { first = []; }
  if (first.length) return first;
  const all = (await vget(env, '/bookings', { 'filter[pilot_id]': pilotId, sort: '-id', 'page[size]': 25 })).data || [];
  return all.filter((b) => b.pilot_id != null && String(b.pilot_id) === String(pilotId) && bkLive(b, now)).sort((a, b) => (a.id > b.id ? 1 : -1));
}
/* staff diagnostics: the shape of a pilot's latest bookings as vAMSYS returns them (fields and status only) */
async function bookingsProbe(env, username) {
  const p = await findPilot(env, username), out = {};
  for (const [k, q] of [['current', { 'filter[status]': 'current' }], ['any', {}]]) {
    try { const j = await vget(env, '/bookings', { 'filter[pilot_id]': p.id, sort: '-id', 'page[size]': 10, ...q });
      out[k] = (j.data || []).map((b) => ({ id: b.id, pilot_id: b.pilot_id, flight: b.flight_number || b.callsign, status: b.status ?? null, pirep_id: b.pirep_id ?? null, valid_to: b.valid_to ?? null, deleted_at: b.deleted_at ?? null, cancelled_at: b.cancelled_at ?? null, created_at: b.created_at ?? null, live: bkLive(b, Date.now()), keys: Object.keys(b) })); }
    catch (e) { out[k] = { error: e.message }; }
  }
  return { pilot: { id: p.id, username: p.username }, ...out };
}
async function bookingsRoute(env, username) {
  const p = await findPilot(env, username);
  const [ap, ac, list] = await Promise.all([
    airports(env).catch(() => new Map()),
    aircraftIndex(env).catch(() => new Map()),
    cached('bookings:' + p.id, TTL.bookings, () => liveBookings(env, p.id)),
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

/* ---- one PIREP with its flown track (the signed-in pilot's own only) ----
   vAMSYS keeps position reports for each PIREP; the Operations API path for them is tried in a few spellings and the
   one that answers is remembered. If none has points, the track the EFB server recorded from the flight map while
   the flight was checked in is used (crew.js). A filed PIREP does not change, so a found track is kept for 30 days. */
const POSREP_PATHS = ['/pireps/{id}/position-reports', '/pireps/{id}/posreps', '/pireps/{id}/positions', '/pireps/{id}/position_reports'];
let posrepPath = null;
async function pirepPosreps(env, id) {
  const tryPath = async (p) => {
    const out = []; let cursor = null;
    for (let i = 0; i < 12; i++) {
      const j = await vget(env, p.replace('{id}', id), { 'page[size]': 500, 'page[cursor]': cursor });
      const arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.data && j.data.posreps) ? j.data.posreps : Array.isArray(j.posreps) ? j.posreps : [];
      out.push(...arr);
      cursor = j && j.meta && j.meta.next_cursor; if (!cursor) break;
    }
    return out.map(posrep).filter(Boolean);
  };
  for (const p of posrepPath ? [posrepPath] : POSREP_PATHS) {
    try { const pts = await tryPath(p); posrepPath = p; return pts; } catch (e) { if (!/HTTP 404|HTTP 405/.test(e.message) && posrepPath) throw e; }
  }
  return [];
}
async function pirepRoute(env, me, idRaw) {
  const id = String(idRaw || '').replace(/\D/g, ''); if (!id) throw new HttpError(400, 'Which PIREP?');
  const p = await findPilot(env, me.u);
  const [ap, ac, list] = await Promise.all([airports(env).catch(() => new Map()), aircraftIndex(env).catch(() => new Map()),
    cached('pireps100:' + p.id, TTL.pireps, () => vget(env, '/pireps', { 'filter[pilot_id]': p.id, sort: '-id', 'page[size]': 100 })).then((j) => j.data || [])]);
  const r = list.find((x) => String(x.id) === id);
  if (!r) throw new HttpError(404, 'That PIREP is not one of your recent flights');
  const a = ac.get(r.aircraft_id) || {}, from = ap.get(r.departure_airport_id)?.icao || '', to = ap.get(r.arrival_airport_id)?.icao || '';
  const pirep = { id: r.id, flight: r.flight_number || r.callsign || '', callsign: r.callsign || '', from, to, date: r.on_blocks_time || r.landing_time || r.created_at || null,
    registration: a.registration || '', type: a.fleet || '', blockMinutes: r.block_length != null ? Math.round(r.block_length / 60) : null, flightMinutes: r.flight_length != null ? Math.round(r.flight_length / 60) : null,
    landingRate: r.landing_rate ?? null, landingG: r.landing_g ?? null, fuelUsed: r.fuel_used ?? null, distanceNm: r.flight_distance ?? null, points: r.points ?? null, status: r.status || '', network: r.network || null,
    route: r.route || r.user_route || null, departedAt: r.departure_time || r.off_blocks_time || r.takeoff_time || null, landedAt: r.landing_time || null };
  let track = env.STORE ? await env.STORE.get('trk:v1:' + id, 'json').catch(() => null) : null;
  if (!track) {
    let pts = [];
    try { pts = await pirepPosreps(env, id); } catch (e) { console.warn('[pirep posreps]', e.message); }
    if (pts.length > 1) { if (pts.every((x) => x[4])) pts.sort((x, y) => x[4] - y[4]); track = { pts: dsTrack(pts, 1500), src: 'vAMSYS' }; }
    else { try { track = (await crewCall(env, { op: 'trkFind', bid: r.booking_id || '', u: me.u, dep: from, arr: to, t: Date.parse(pirep.date || '') || Date.now() })).track; } catch (e) { track = null; } }
    if (track && env.STORE) await env.STORE.put('trk:v1:' + id, JSON.stringify(track), { expirationTtl: 30 * 86400 }).catch(() => {});
  }
  return { pirep, track: track || null };
}
/* for staff: what vAMSYS answers for a PIREP's position reports (to see which path and field names it uses) */
/* staff diagnostics: the shape of the latest PIREPs, bookings and live flights as vAMSYS returns them (for OOOI / on-time) */
async function opsProbe(env) {
  const out = {};
  for (const [k, p, q] of [['pireps', '/pireps', { sort: '-id', 'page[size]': 2 }], ['bookings', '/bookings', { sort: '-id', 'page[size]': 2 }], ['flightMap', '/flight-map', {}]]) {
    try { const j = await vget(env, p, q), arr = Array.isArray(j) ? j : j.data; out[k] = { keys: Object.keys(j || {}), first: Array.isArray(arr) ? arr[0] : arr, n: Array.isArray(arr) ? arr.length : null }; }
    catch (e) { out[k] = { error: e.message }; }
  }
  return out;
}
async function pirepProbe(env, id) {
  id = String(id || '').replace(/\D/g, ''); const out = { id, paths: {} };
  for (const p of POSREP_PATHS) {
    try { const j = await vget(env, p.replace('{id}', id), { 'page[size]': 3 }); const arr = Array.isArray(j) ? j : j.data; out.paths[p] = { ok: true, keys: Object.keys(j || {}), first: Array.isArray(arr) ? arr[0] : arr, parsed: Array.isArray(arr) ? arr.map(posrep) : null }; }
    catch (e) { out.paths[p] = { ok: false, error: e.message }; }
  }
  return out;
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
        bookingId: f.bookingId != null ? String(f.bookingId) : null,
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
/* FIR boundaries: v=2 the official FIRs (fir.js: openAIP, gaps filled from VATSpy for real ICAO FIRs only);
   without v=2 the VATSpy outlines as before (older EFB builds) */
async function firRoute(env, ctx, v2, v3) {
  if (v3) return cached('fir3', 6 * 3600_000, async () => trimShared(await firRoute(env, ctx, true)));
  if (v2) return cached('fir2b', 6 * 3600_000, () => kvStore(env, ctx, 'fir:v2b', 7 * 86400_000, () => officialFirs(env), (v) => v && !v.stat.err && v.stat.oaip > 50));
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
  return cached('sigmets4', 300_000, async () => {
    const opt = { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } };
    const get = (u) => fetch(u, opt).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const [intl, us, ga, cwa] = await Promise.all([get('https://aviationweather.gov/api/data/isigmet?format=json'), get('https://aviationweather.gov/api/data/airsigmet?format=json'),
      get('https://aviationweather.gov/api/data/gairmet?format=json'), get('https://aviationweather.gov/api/data/cwa?format=json')]);
    const coords = (c) => (Array.isArray(c) ? c : []).map((p) => [+p.lat, +p.lon]).filter((p) => isFinite(p[0]) && isFinite(p[1]));
    const out = [];
    for (const s of Array.isArray(intl) ? intl : []) {
      const c = coords(s.coords);
      if (c.length >= 3) out.push({ kind: 'SIGMET', fir: s.firId || s.icaoId || '', firName: s.firName || '', hazard: s.hazard || '', qualifier: s.qualifier || '', base: s.base ?? null, top: s.top ?? null, from: s.validTimeFrom ?? null, to: s.validTimeTo ?? null, mov: s.dir ? String(s.dir) + (s.spd ? ' ' + s.spd + 'KT' : '') : '', coords: c, raw: s.rawSigmet || '' });
    }
    for (const s of Array.isArray(us) ? us : []) {
      const c = coords(s.coords);
      if (c.length >= 3) out.push({ kind: s.airSigmetType || 'AIRMET', fir: s.icaoId || '', hazard: s.hazard || '', qualifier: s.severity != null ? String(s.severity) : '', base: s.altitudeLow1 ?? null, top: s.altitudeHi1 ?? null, from: s.validTimeFrom ?? null, to: s.validTimeTo ?? null, coords: c, raw: s.rawAirSigmet || '' });
    }
    /* G-AIRMETs come as snapshots every 3 hours: keep, for each product, the one valid closest to now */
    const hft = (v) => { if (v == null || v === '') return null; if (/SFC/i.test(v)) return 0; const n = +v; return isFinite(n) ? (n < 1000 ? n * 100 : n) : null; };
    const gaL = (Array.isArray(ga) ? ga : []).filter((g) => coords(g.coords).length >= 3 && !/LINE/i.test(g.geometryType || '') && !/FZLVL/i.test(g.hazard || ''));
    const tv = (g) => { const t = g.validTime != null ? (typeof g.validTime === 'number' ? g.validTime * 1000 : Date.parse(g.validTime)) : NaN; return isFinite(t) ? t : NaN; };
    const bestT = {}; gaL.forEach((g) => { const t = tv(g), k = g.product || g.hazard || ''; if (!isFinite(t)) return; if (bestT[k] == null || Math.abs(t - Date.now()) < Math.abs(bestT[k] - Date.now())) bestT[k] = t; });
    for (const g of gaL) {
      const t = tv(g), k = g.product || g.hazard || ''; if (isFinite(t) && bestT[k] != null && t !== bestT[k]) continue;
      const hz = String(g.hazard || '').toUpperCase();
      out.push({ kind: 'G-AIRMET', fir: (g.product || '') + (g.tag ? ' ' + g.tag : ''), hazard: hz.replace(/_/g, ' '), qualifier: [g.severity, g.due_to || g.dueTo].filter(Boolean).join(' · '), base: hft(g.base), top: hft(g.top), from: isFinite(t) ? Math.round(t / 1000) : null, to: g.expireTime ?? null, coords: coords(g.coords), raw: '' });
    }
    for (const c of Array.isArray(cwa) ? cwa : []) {
      const cc = coords(c.coords);
      if (cc.length >= 3) out.push({ kind: 'CWA', fir: c.cwsu || c.icaoId || '', hazard: c.hazard || '', qualifier: c.qualifier || '', base: c.base ?? null, top: c.top ?? null, from: c.validTimeFrom ?? null, to: c.validTimeTo ?? null, coords: cc, raw: c.cwaText || c.rawCwa || '' });
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
  if (/^RC[A-Z]{2}$/.test(icao)) return twChartsRoute(icao, env, ctx);
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
  if (/^TW/.test(cycle)) return twPdfRoute(cycle, file, h);
  if (!/^\d{4}$/.test(cycle) || !/^[A-Z0-9_-]{1,60}\.PDF$/i.test(file)) return json({ error: 'Invalid chart' }, 400, h);
  const res = await fetch(`https://aeronav.faa.gov/d-tpp/${cycle}/${file}`, { cf: { cacheTtl: 7 * 86400, cacheEverything: true } });
  if (!res.ok) return json({ error: `FAA returned HTTP ${res.status}` }, 502, h);
  return new Response(res.body, { status: 200, headers: { ...h, 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=86400' } });
}

/* ---------- AIP Taiwan charts (CAA eAIP) ----------
   The CAA publishes the AIP for the Taipei FIR at ais.caa.gov.tw/eaip/, free and without sign-in; its charts are not
   sold and are downloaded from there (GEN 3.2.3). Each AIRAC amendment is a folder ("AIRAC AIP AMDT 05-26_2026_10_29")
   with a menu of every page, and each airport's AD 2 page links its charts as separate PDFs under
   documents/Root/Taiwan_Rep/Charts/AD/AD 2 RCxx/. The list is built from those links, sorted the way the AIP orders
   them, and the PDFs are passed through from the CAA, cached. Taiwan's amendments come about six times a year, so the
   edition in force is the latest one whose effective date has come. */
const TW_EAIP = 'https://ais.caa.gov.tw/eaip/';
const TW_UA = { 'User-Agent': 'Mozilla/5.0 (compatible; PolarisEFB/1.0; +https://koz8738.com/efb/)', Accept: 'text/html,application/pdf,*/*' };
const twEnc = (p) => p.split('/').map(encodeURIComponent).join('/');
const twEntities = (t) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
async function twEditions() {
  return edgeCache('tw/editions/v1', 3 * 3600, async () => {
    const r = await fetch(TW_EAIP, { headers: TW_UA, cf: { cacheTtl: 1800, cacheEverything: true } });
    if (!r.ok) throw new HttpError(502, `The CAA Taiwan eAIP is not answering (HTTP ${r.status})`);
    const t = await r.text(), out = [], seen = new Set();
    for (const m of t.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
      let href = twEntities(m[1]); try { href = decodeURIComponent(href); } catch (e) { /* keep as is */ }
      href = href.replace(/\\/g, '/');
      const q = href.match(/(?:^|\/)([^/]*?(\d{2})-(\d{2})_(\d{4})_(\d{2})_(\d{2}))\/index\.html$/i);
      if (!q || seen.has(q[1])) continue; seen.add(q[1]);
      out.push({ folder: q[1], amdt: q[2] + '/' + q[3], eff: `${q[4]}-${q[5]}-${q[6]}`, id: 'TW' + q[2] + q[3] + q[4] + q[5] + q[6] });
    }
    return out.sort((a, b) => a.eff.localeCompare(b.eff));
  }, (v) => Array.isArray(v) && v.length > 0);
}
async function twEdition(t = Date.now()) {
  const all = await twEditions(), today = new Date(t).toISOString().slice(0, 10);
  const live = all.filter((e) => e.eff <= today), cur = live[live.length - 1];
  if (!cur) throw new HttpError(502, 'No AIP Taiwan amendment is in force yet');
  return { cur, next: all.find((e) => e.eff > today) || null };
}
/* every airport's AD 2 page in this edition: RCTP -> "RC-AD 2 RCTP …-en-GB.html" and its English name */
async function twMenu(env, ctx, ed) {
  return kvStore(env, ctx, 'twmenu:' + ed.id, 30 * 86400_000, () => edgeCache('tw/menu/' + ed.id, 86400, async () => {
    const r = await fetch(TW_EAIP + twEnc(ed.folder) + '/eAIP/menu.html', { headers: TW_UA, cf: { cacheTtl: 86400, cacheEverything: true } });
    if (!r.ok) throw new HttpError(502, `The AIP Taiwan contents did not load (HTTP ${r.status})`);
    const t = await r.text(), apts = {};
    for (const m of t.matchAll(/href\s*=\s*'(RC-AD 2 (RC[A-Z]{2}) ([^']*?)-(en-GB|zh-TW)\.html)/g)) {
      const ic = m[2], en = m[4] === 'en-GB';
      if (apts[ic] && !en) continue;
      apts[ic] = { file: twEntities(m[1]), name: m[3].replace(/[^\x20-\x7e]/g, '').replace(/^[\s-]+|[\s-]+$/g, '').replace(/\s+/g, ' ') };
    }
    return apts;
  }), (v) => v && Object.keys(v).length > 0);
}
function twGroup(n) {
  const u = n.toUpperCase();
  if (/^AERONAUTICAL DATA\b|\bDATA (OF|FOR)\b|\bWP TABLE\b|\bTABULAR\b|\bCODING\b/.test(u)) return ['DATA', 'Procedure data'];
  if (/AERODROME CHART|AIRPORT CHART|AIRPORT DIAGRAM/.test(u)) return ['APD', 'Airport diagram'];
  if (/PARKING|DOCKING|GROUND MOVEMENT|\bGMC\b|TAXI|\bTA?XI? RTE\b|\bTAX RTE\b|HOT ?SPOT|TWY CENT/.test(u)) return ['HOT', 'Hot spots'];
  if (/\b(DEP|SID)\b|DEPARTURE/.test(u)) return ['DP', 'Departures'];
  if (/\b(ARR|STAR)\b|ARRIVAL/.test(u)) return ['STR', 'Arrivals'];
  if (/^(ILS|LOC|RNP|RNAV|GNSS|GPS|VOR|NDB|TACAN|GLS|LDA|SDF|PAR|SRA|ASR|VISUAL|CIRCLING)\b/.test(u)) return ['IAP', 'Approaches'];
  if (/MINIMUM/.test(u)) return ['MIN', 'Minimums'];
  return ['DAU', 'Other'];
}
async function twChartsRoute(icao, env, ctx) {
  const { cur: ed, next } = await twEdition();
  return cached('twcharts:' + ed.id + ':' + icao, 6 * 3600_000, () => kvStore(env, ctx, 'twcharts:' + ed.id + ':' + icao, 7 * 86400_000, () => edgeCache(`twcharts/${ed.id}/${icao}`, 86400, async () => {
    const base = { cycle: ed.id, from: ed.eff + 'T00:00:00.000Z', to: next ? next.eff + 'T00:00:00.000Z' : null, src: 'tw', amdt: ed.amdt, eff: ed.eff,
      label: 'AIP Taiwan · AMDT ' + ed.amdt, aip: TW_EAIP + twEnc(ed.folder) + '/index.html', next: next ? { amdt: next.amdt, eff: next.eff } : null };
    const apts = await twMenu(env, ctx, ed), a = apts[icao];
    if (!a) return { ...base, airport: { icao, name: '' }, charts: [], notFound: true };
    const r = await fetch(TW_EAIP + twEnc(ed.folder) + '/eAIP/' + twEnc(a.file), { headers: TW_UA, cf: { cacheTtl: 86400, cacheEverything: true } });
    if (!r.ok) throw new HttpError(502, `The AIP Taiwan page for ${icao} did not load (HTTP ${r.status})`);
    const t = await r.text(), seen = new Set(), charts = [];
    for (const m of t.matchAll(/href\s*=\s*["']([^"']+?\.pdf)["']/gi)) {
      let href = twEntities(m[1]); try { href = decodeURIComponent(href); } catch (e) { /* keep */ }
      href = href.replace(/\\/g, '/');
      const i = href.indexOf('Charts/AD/'); if (i < 0) continue;
      const pdf = href.slice(i + 10);
      if (!pdf.startsWith('AD 2 ' + icao + '/') || pdf.includes('..') || seen.has(pdf)) continue; seen.add(pdf);
      const file = pdf.split('/').pop().replace(/\.pdf$/i, ''), order = parseInt(file, 10);
      const name = file.replace(/^\d+\s*-\s*/, '').replace(/_/g, ' / ').replace(/\s+/g, ' ').trim();
      const [code, group] = twGroup(name);
      charts.push({ code, group, name, pdf, changed: false, order: isFinite(order) ? order : 9999, url: TW_EAIP + twEnc(ed.folder) + '/documents/Root/Taiwan_Rep/Charts/AD/' + twEnc(pdf) });
    }
    charts.sort((x, y) => x.order - y.order);
    return { ...base, airport: { icao, name: a.name }, charts: charts.map(({ order, ...c }) => c), notFound: !charts.length };
  }), (v) => v && !v.notFound));
}
async function twPdfRoute(cycle, file, h) {
  if (!/^TW\d{12}$/.test(cycle) || !/^AD 2 RC[A-Z]{2}\/[^\\]{1,220}\.pdf$/i.test(file) || file.includes('..')) return json({ error: 'Invalid chart' }, 400, h);
  const ed = (await twEditions()).find((e) => e.id === cycle);
  if (!ed) return json({ error: 'That AIP Taiwan amendment is no longer listed' }, 404, h);
  const res = await fetch(TW_EAIP + twEnc(ed.folder) + '/documents/Root/Taiwan_Rep/Charts/AD/' + twEnc(file), { headers: TW_UA, cf: { cacheTtl: 7 * 86400, cacheEverything: true } });
  if (!res.ok) return json({ error: `The CAA eAIP returned HTTP ${res.status}` }, 502, h);
  return new Response(res.body, { status: 200, headers: { ...h, 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=86400' } });
}

/* Polaris's network outside the US first (they had no head start), then the big US airports */
const MAJOR = ['CYYZ','VHHH','RJTT','RCTP','ZBAA','ZSPD','WSSS','EGLL','LSZH','ENGM','KATL','KDFW','KDEN','KORD','KLAX','KJFK','KLAS','KMCO','KMIA','KCLT','KSEA','KPHX','KEWR','KSFO','KIAH','KBOS','KFLL','KMSP','KLGA','KDTW','KPHL','KSLC','KBWI','KIAD','KDCA','KSAN','KTPA','KBNA','KAUS','PHNL','PANC','KPDX','KMSY','KRDU','KSJC','KOAK','KSAT','KMCI','KSMF','KSTL'];
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
  return { 'Access-Control-Allow-Origin': ok ? (allowed.includes('*') ? '*' : origin) : 'null', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, If-None-Match, Authorization, Content-Type', 'Access-Control-Max-Age': '86400', 'Access-Control-Expose-Headers': 'ETag', Vary: 'Origin' };
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
/* Destination weather for checked-in flights: every cron run (20 min) the METAR at each checked-in flight's
   destination and alternate is read (the same cached report the EFB shows), and the crew object pushes a notice to
   the pilot when it gets worse: IFR or LIFR, or thunderstorms, freezing precipitation, heavy snow, hail, squalls or a
   funnel cloud appear; and once when it is back to VFR or MVFR. From 3 h before departure to 1 h after arrival. */
async function wxWatch(env, ctx) {
  if (!env || !env.CREW) return;
  const { list } = await crewCall(env, { op: 'ciList' }), now = Date.now(), by = new Map();
  for (const c of list || []) {
    if ((c.std && now < c.std - 3 * 3600_000) || (c.sta && now > c.sta + 3600_000) || (!c.sta && c.std && now > c.std + 16 * 3600_000)) continue;
    for (const [role, icao] of [['dest', c.to], ['altn', c.altn]]) if (/^[A-Z0-9]{4}$/.test(icao || '')) { if (!by.has(icao)) by.set(icao, []); by.get(icao).push({ u: c.u, role, fl: c.fl }); }
  }
  for (const [icao, who] of by) {
    let j = null; try { j = await airportRoute(icao, ctx); } catch (e) { continue; }
    const raw = j && j.metar && j.metar.raw; if (!raw) continue;
    const body = raw.replace(/\s+(RMK|TEMPO|BECMG|NOSIG)\b.*$/, ''), all = body.split(/\s+/), t0 = all.findIndex((t) => /^\d{6}Z$/.test(t));
    /* the present-weather groups only (not the station, time, wind or cloud) */
    const toks = all.slice(t0 + 1).filter((t) => /^(-|\+|VC)?(TS|SH|FZ|MI|BC|PR|DR|BL)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)*$/.test(t) && /[A-Z]{2}/.test(t));
    const hz = [];
    if (toks.some((t) => /TS/.test(t))) hz.push('thunderstorms');
    if (toks.some((t) => /^[-+]?FZ(RA|DZ)/.test(t))) hz.push('freezing precipitation');
    if (toks.some((t) => /^\+[A-Z]*SN/.test(t))) hz.push('heavy snow');
    if (toks.some((t) => /GR|GS/.test(t))) hz.push('hail');
    if (toks.some((t) => /FC/.test(t))) hz.push('funnel cloud'); else if (toks.some((t) => /SQ/.test(t))) hz.push('squalls');
    for (const w of who) await crewCall(env, { op: 'wxSeen', u: w.u, icao, role: w.role, fl: w.fl, cat: (j.metar.cat || '').toUpperCase(), hz, raw: body });
  }
}
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



/* Geostationary infrared cloud tiles, proxied and cached at the edge for 10 minutes so every pilot shares one fetch:
   GOES-East, GOES-West and Himawari from NASA GIBS, Meteosat 0 deg and Indian Ocean from EUMETSAT (its map server is
   slow, so the shared cache matters most there). The app turns the grey picture into cloud-only on the device. */
const SAT_SRC = { ge: ['gibs', 'GOES-East_ABI_Band13_Clean_Infrared'], gw: ['gibs', 'GOES-West_ABI_Band13_Clean_Infrared'], hi: ['gibs', 'Himawari_AHI_Band13_Clean_Infrared'], mf: ['eum', 'msg_fes:ir108'], mi: ['eum', 'msg_iodc:ir108'] };
async function satRoute(url, ctx, h) {
  const id = url.searchParams.get('l'), z = +url.searchParams.get('z'), x = +url.searchParams.get('x'), y = +url.searchParams.get('y'), S = SAT_SRC[id];
  if (!S || !Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > (S[0] === 'eum' ? 7 : 6) || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) throw new HttpError(400, 'l, z, x, y');
  const slot = Math.floor(Date.now() / 600000), cache = caches.default, ck = new Request(`https://sat-cache.local/v1/${slot}/${id}/${z}/${x}/${y}.png`);
  let r = await cache.match(ck);
  if (!r) {
    const T = 40075016.686 / 2 ** z, x0 = -20037508.343 + x * T, y1 = 20037508.343 - y * T;
    const up = S[0] === 'eum' ? `https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=${S[1]}&styles=&crs=EPSG:3857&bbox=${x0},${y1 - T},${x0 + T},${y1}&width=256&height=256&format=image/png&transparent=true`
      : `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${S[1]}/default/default/GoogleMapsCompatible_Level6/${z}/${y}/${x}.png`;
    let res = null; try { res = await fetchT(up, 25000, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)' } }); } catch (e) {}
    if (!res || !res.ok || !/image/.test(res.headers.get('content-type') || '')) return new Response(null, { status: 204, headers: { ...h, 'Cache-Control': 'no-store' } });
    r = new Response(await res.arrayBuffer(), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600' } });
    const p = cache.put(ck, r.clone()); if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
  }
  const hd = new Headers(r.headers); for (const [k, v] of Object.entries(h)) hd.set(k, v); hd.set('Cache-Control', 'public, max-age=600');
  return new Response(r.body, { status: 200, headers: hd });
}

/* Gridded weather from Open-Meteo for map layers: jet streams, sea-level pressure, ISA deviation, cloud cover,
   visibility, vertical velocity, tropopause height. The globe is a 5-degree lattice, fetched and cached in 30-degree
   blocks (36 points) per field for 3 hours (Open-Meteo counts every point as a call), so a map view costs at most a few upstream calls. */
const GWX_LV = [700, 500, 400, 300, 250, 200];
const GWX_F = {
  mslp: () => ['pressure_msl'],
  jet: () => ['wind_speed_250hPa', 'wind_direction_250hPa'],
  isa: (lv) => ['temperature_' + lv + 'hPa'],
  cloud: () => ['cloud_cover'],
  vis: () => ['visibility'],
  vv: (lv) => ['vertical_velocity_' + lv + 'hPa'],
  trop: () => [400, 300, 250, 200, 150, 100].flatMap((p) => ['temperature_' + p + 'hPa', 'geopotential_height_' + p + 'hPa']),
};
/* standard-atmosphere temperature at a pressure level */
const isaT = (p) => { const h = 44330.77 * (1 - Math.pow(p / 1013.25, 0.190263)); return h <= 11000 ? 15 - 0.0065 * h : -56.5; };
function gwxValue(f, lv, hr) {
  const g = (k) => { const v = (hr[k] || [])[0]; return v == null ? null : +v; };
  if (f === 'mslp') { const v = g('pressure_msl'); return v == null ? null : Math.round(v * 10) / 10; }
  if (f === 'jet') { const s = g('wind_speed_250hPa'), d = g('wind_direction_250hPa'); return s == null ? null : [Math.round(s), d == null ? null : Math.round(d)]; }
  if (f === 'isa') { const t = g('temperature_' + lv + 'hPa'); return t == null ? null : Math.round((t - isaT(lv)) * 10) / 10; }
  if (f === 'cloud') { const v = g('cloud_cover'); return v == null ? null : Math.round(v); }
  if (f === 'vis') { const v = g('visibility'); return v == null ? null : Math.round(v); }
  if (f === 'vv') { const v = g('vertical_velocity_' + lv + 'hPa'); return v == null ? null : Math.round(v * 196.85); }
  if (f === 'trop') {
    /* WMO-style: the lowest level from 400 hPa up where the lapse rate drops to 2 K/km or less */
    const P = [400, 300, 250, 200, 150, 100].map((p) => ({ t: g('temperature_' + p + 'hPa'), z: g('geopotential_height_' + p + 'hPa') }));
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; if (a.t == null || b.t == null || a.z == null || b.z == null || b.z <= a.z) continue; const lapse = (a.t - b.t) / ((b.z - a.z) / 1000); if (lapse <= 2) return Math.round(a.z * 3.28084 / 100); }
    return P[P.length - 1].z != null ? Math.round(P[P.length - 1].z * 3.28084 / 100) : null;
  }
  return null;
}
async function gwxRoute(url, ctx, h) {
  const f = String(url.searchParams.get('f') || ''); if (!GWX_F[f]) throw new HttpError(400, 'f must be one of ' + Object.keys(GWX_F).join(', '));
  const lv = +(url.searchParams.get('lv') || 250); if ((f === 'isa' || f === 'vv') && !GWX_LV.includes(lv)) throw new HttpError(400, 'lv must be one of ' + GWX_LV.join(', '));
  const blocks = String(url.searchParams.get('blocks') || '').split(';').map((c) => c.match(/^(-?\d{1,2}),(-?\d{1,3})$/)).filter(Boolean)
    .map((m) => [+m[1], +m[2]]).filter(([la, lo]) => !(la % 30) && !(lo % 30) && la >= -90 && la <= 60 && lo >= -180 && lo <= 150).slice(0, 10);
  if (!blocks.length) throw new HttpError(400, 'blocks=lat,lon;lat,lon (30 degree grid)');
  const hour = (() => { const d = new Date(); d.setUTCHours(Math.floor(d.getUTCHours() / 3) * 3); return d.toISOString().slice(0, 13); })(), cache = caches.default, lvk = f === 'isa' || f === 'vv' ? lv : 0;
  const key = (b) => new Request('https://gwx-cache.local/v2/' + hour + '/' + f + '/' + lvk + '/' + b[0] + '/' + b[1]);
  const got = {}, miss = [];
  await Promise.all(blocks.map(async (b) => { const r = await cache.match(key(b)); if (r) got[b.join(',')] = await r.json(); else miss.push(b); }));
  let err = null;
  if (miss.length) {
    const pts = [];
    miss.forEach((b) => { for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const a = b[0] + i * 5, o = b[1] + j * 5; pts.push({ b: b.join(','), i, j, a: Math.max(-89.5, Math.min(89.5, a)), o }); } });
    const vars = GWX_F[f](lv).join(','), res = {};
    for (let c = 0; c < pts.length; c += 220) {
      const part = pts.slice(c, c + 220);
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${part.map((p) => p.a).join(',')}&longitude=${part.map((p) => p.o).join(',')}&hourly=${vars}&forecast_hours=1&timezone=GMT&wind_speed_unit=kn`;
      let j = null;
      for (let tries = 0; tries < 2 && !j; tries++) {
        try { const up = await fetchT(u, 20000, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } });
          if (up.ok) j = await up.json(); else { let why = ''; try { why = String((await up.json()).reason || ''); } catch (e) {} err = up.status === 429 ? (/hour/i.test(why) ? 'Weather limit reached for this hour, try again later' : /day/i.test(why) ? 'Weather limit reached for today' : 'Weather service is busy, try again shortly') : 'Weather service ' + up.status; if (up.status === 429) break; }
        } catch (e) { err = 'Weather service is slow, try again'; }
      }
      if (!j) break;
      if (!Array.isArray(j)) j = [j];
      j.forEach((x, k) => { const p = part[k]; if (!p) return; (res[p.b] = res[p.b] || Array(36).fill(null))[p.i * 6 + p.j] = gwxValue(f, lv, x.hourly || {}); });
    }
    miss.forEach((b) => { const k = b.join(','); if (!res[k]) return; got[k] = res[k]; const pr = cache.put(key(b), new Response(JSON.stringify(res[k]), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=10800' } })); if (ctx && ctx.waitUntil) ctx.waitUntil(pr); });
    if (Object.keys(res).length === miss.length) err = null;
  }
  return json({ f, lv: lvk || null, hour: hour + ':00Z', step: 5, blocks: got, error: err }, 200, h);
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

/* VATSIM traffic for the EFB map. The network feed (~2 MB, renewed about every 15 s) is cut down to what the map
   shows: rows of values instead of objects, no routes or remarks (one pilot's route comes with ?cs=). The copy is
   kept until just after the feed's next renewal (its own time stamp + 16 s), not for a fixed 15 s from when it was
   fetched, so it is never a whole cycle behind; if the network is late, it is asked again after 5 s. The answer
   carries an ETag, so an EFB that already has this update gets a 304. */
let vsMem = null; // { exp, d } in this isolate
const vsExp = (d) => { const now = Date.now(), t = (Date.parse(d.upd) || now) + 16000; return t > now ? Math.min(t, now + 20000) : now + 5000; };
/* what the automatic stand assignment reads (see stands.js): the Polaris flights in the air as the admin's Live tab
   shows them, the VATSIM pilots, and an airport's map (stands) as the EFB already keeps it; the map is never built here */
const STAND_CRON = '*/2 * * * *';
/* every 2 minutes: the gate assignment and the OOOI times, from one read of the flights in the air; every 10, the
   SIGMETs on the routes (see sigroute.js) */
async function opsTick(env, ctx) {
  const d = standDeps(env, ctx); let lp = null; const live = () => (lp = lp || d.live());
  const plan = await autoPlan(env).catch(() => null), sigTick = Math.floor(Date.now() / 60_000) % 10 === 0;
  await Promise.all([
    plan ? standWatch(env, { ...d, live, plan }).catch((e) => console.warn('[stands]', e && e.message)) : null,
    live().then((l) => oooWatch(env, l, { checkins: async () => ((await crewCall(env, { op: 'ciList' })) || {}).list || [] })).catch((e) => console.warn('[ooo]', e && e.message)),
    sigTick && plan && plan.sig ? live().then((l) => sigRouteWatch(env, l, { sigmets: () => sigmetRoute(), on: true })).catch((e) => console.warn('[sigroute]', e && e.message)) : null,
  ]);
}
function standDeps(env, ctx) {
  const siteDeps = { vget: (p, q) => vget(env, p, q), all: (p) => all(env, p), cached, edgeCache, configured: Boolean(env.VAMSYS_CLIENT_ID && env.VAMSYS_CLIENT_SECRET) };
  return {
    live: async () => {
      const [vs, va] = await Promise.all([vatsimFeed(ctx).catch(() => null), siteDeps.configured ? siteLive(siteDeps).catch(() => null) : Promise.resolve(null)]);
      if (!vs && !va) throw new Error('neither vAMSYS nor VATSIM answered');
      return liveFlights(vs, va);
    },
    vatsim: () => vatsimFeed(ctx),
    layout: async (icao) => { const l = env.STORE ? await env.STORE.get('layout:v11:' + icao, 'json').catch(() => null) : null; return l && l.v; },
  };
}
async function vatsimFeed(ctx) {
  if (vsMem && Date.now() < vsMem.exp) return vsMem.d;
  const cache = caches.default, ck = new Request('https://vatsim-feed-cache.local/v1');
  const hit = await cache.match(ck);
  if (hit) { const d = await hit.json(), t = Date.parse(d.upd) || 0; if (Date.now() < t + 16000) { vsMem = { exp: t + 16000, d }; return d; } }
  const up = await fetchT('https://data.vatsim.net/v3/vatsim-data.json', 10000, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)' } });
  if (!up.ok) throw new HttpError(502, 'VATSIM answered HTTP ' + up.status);
  const j = await up.json(), r4 = (v) => Math.round(+v * 1e4) / 1e4, rows = [], routes = {}, det = {};
  for (const p of j.pilots || []) {
    if (!p.callsign || !isFinite(p.latitude) || !isFinite(p.longitude)) continue;
    const f = p.flight_plan || {}, cs = String(p.callsign).toUpperCase(), t = Date.parse(p.logon_time || '');
    rows.push([cs, p.cid || 0, String(p.name || '').slice(0, 60), r4(p.latitude), r4(p.longitude), Math.round(+p.altitude || 0), Math.round(+p.groundspeed || 0), Math.round(+p.heading || 0), p.transponder || '', isFinite(t) ? Math.round(t / 1000) : 0,
      f.aircraft_short || '', f.departure || '', f.arrival || '', f.altitude || '', f.flight_rules || '']);
    if (f.route) routes[cs] = String(f.route).slice(0, 2000);
    /* the rest of the flight plan and pilot details, for the one aircraft the EFB opens */
    det[cs] = { rm: String(f.remarks || '').slice(0, 1200), altn: f.alternate || '', tas: f.cruise_tas || '', dt: f.deptime || '', ete: f.enroute_time || '', fob: f.fuel_time || '', faa: f.aircraft_faa || '', acl: f.aircraft || '', rev: f.revision_id || 0, pr: p.pilot_rating ?? null, mr: p.military_rating ?? null, sv: p.server || '', qnh: p.qnh_mb || null, ass: f.assigned_transponder || '' };
  }
  const d = { upd: (j.general && j.general.update_timestamp) || new Date().toISOString(), rows, routes, det };
  const exp = vsExp(d), ttl = Math.max(1, Math.round((exp - Date.now()) / 1000));
  const res = new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + ttl } });
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, res)); else await cache.put(ck, res);
  vsMem = { exp, d };
  return d;
}
/* a pilot's VATSIM flying hours (the network's member statistics), kept for 6 hours */
async function vatsimHours(cid, ctx) {
  const cache = caches.default, ck = new Request('https://vatsim-stats-cache.local/v1/' + cid);
  try {
    const hit = await cache.match(ck); if (hit) return (await hit.json()).h;
    const r = await fetchT('https://api.vatsim.net/v2/members/' + cid + '/stats', 6000, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } });
    if (!r.ok) return null; const j = await r.json(), hrs = j && isFinite(+j.pilot) ? Math.round(+j.pilot) : null;
    const res = new Response(JSON.stringify({ h: hrs }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, res)); else await cache.put(ck, res);
    return hrs;
  } catch (e) { return null; }
}
const VS_FIELDS = ['c', 'cid', 'n', 'la', 'lo', 'a', 'g', 'h', 'sq', 't', 'ac', 'dep', 'arr', 'alt', 'rules'];
async function vatsimRoute(req, url, ctx, h) {
  const d = await vatsimFeed(ctx), cs = String(url.searchParams.get('cs') || '').toUpperCase();
  if (cs) {
    const row = d.rows.find((r) => r[0] === cs), cid = row ? row[1] : 0;
    return json({ cs, route: d.routes[cs] || '', det: (d.det && d.det[cs]) || null, hours: cid ? await vatsimHours(cid, ctx) : null, upd: d.upd }, 200, h);
  }
  const etag = '"vs-' + d.upd + '"';
  if ((req.headers.get('If-None-Match') || '') === etag) return new Response(null, { status: 304, headers: { ...h, ETag: etag, 'Cache-Control': 'no-cache' } });
  return new Response(JSON.stringify({ upd: d.upd, f: VS_FIELDS, p: d.rows }), { status: 200, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag } });
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
/* ---- datalink (DCL/PDC and CPDLC) offered by VATSIM controllers ----
   VATSIM has no datalink of its own: controllers who offer it use Hoppie's ACARS network and say so in their
   controller info or ATIS ("DCL AVBL LOGON EDDF", "CPDLC LOGON EDYY"). Those lines are public; this reads them from
   the VATSIM feed (no Hoppie account involved) and returns each station that mentions datalink, what it offers and
   the logon code when one is given. */
const DL_STOP = new Set(['WITH', 'CODE', 'ONLY', 'FROM', 'THIS', 'OVER', 'VOICE', 'WHEN', 'HTTP', 'HTTPS', 'AVBL', 'AVAIL', 'USING', 'VIA', 'PLEASE', 'PLZ', 'THEN', 'INFO', 'FREQ', 'CTOT', 'TSAT', 'TOBT', 'CPDLC', 'HOPPIE', 'ACARS', 'LOGON', 'REQUEST', 'STATION', 'UNIT', 'FULL', 'OPEN', 'ALSO', 'INOP', 'TEXT', 'SEND', 'DATA', 'LINK', 'NONE', 'NOT', 'VATSIM', 'IVAO', 'EXPECT', 'ALL', 'FOR', 'AND', 'THE', 'DEP', 'ARR', 'GND', 'TWR', 'APP', 'CTR', 'DEL']);
export function datalinkOf(text) {
  const t = ' ' + String(text || '').toUpperCase().replace(/[^A-Z0-9:=\/\-\s.,()]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const kind = [];
  if (/\b(DCL|PDC)\b|DATA ?LINK CLEARANCE|PRE ?-?DEP(ARTURE)? CLEARANCE|DEPARTURE CLEARANCE VIA|CLEARANCE VIA (HOPPIE|DATALINK|ACARS)/.test(t)) kind.push('DCL');
  if (/\bCPDLC\b/.test(t)) kind.push('CPDLC');
  if (!kind.length) return null;
  let code = '';
  const pats = [/\b(?:LOGON|LOG ON|LOGIN)\s*(?:CODE|TO|STATION|UNIT|WITH|AT)?\s*(?:IS|TO)?\s*[:=\-]?\s*([A-Z]{4})\b/g, /\b(?:STATION|UNIT)\s*(?:CODE|ID)?\s*(?:IS)?\s*[:=\-]?\s*([A-Z]{4})\b/g, /\b(?:DCL|PDC|CPDLC)\b[^.]{0,24}?\bUSE\s+([A-Z]{4})\b/g, /\b(?:DCL|PDC|CPDLC)\s*(?:AVBL|AVAILABLE|AVAIL)?\s*(?:VIA HOPPIE)?\s*[:=\-]\s*([A-Z]{4})\b/g, /\b([A-Z]{4})\s*(?:FOR\s*)?(?:DCL|PDC)\b/g];
  for (const re of pats) { let m; while ((m = re.exec(t))) { if (!DL_STOP.has(m[1])) { code = m[1]; break; } } if (code) break; }
  return { kind, code };
}
async function datalinkRoute(ctx) {
  const cache = caches.default, ck = new Request('https://vatsim-datalink-cache.local/v1');
  const hit = await cache.match(ck); if (hit) return await hit.json();
  const up = await fetchT('https://data.vatsim.net/v3/vatsim-data.json', 10000, { headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)' } });
  if (!up.ok) throw new HttpError(502, 'VATSIM answered HTTP ' + up.status);
  const j = await up.json(), out = [];
  const add = (c, isAtis) => {
    const text = Array.isArray(c.text_atis) ? c.text_atis.join(' ') : String(c.text_atis || '');
    const d = datalinkOf(text); if (!d) return;
    const cs = String(c.callsign || '').toUpperCase(), fac = cs.split('_').pop();
    out.push({ cs, f: c.frequency || '', fac: isAtis ? 'ATIS' : fac, kind: d.kind, code: d.code, text: text.replace(/\s+/g, ' ').slice(0, 400) });
  };
  for (const c of j.controllers || []) add(c, false);
  for (const a of j.atis || []) add(a, true);
  const res = { at: (j.general && j.general.update_timestamp) || null, stations: out };
  const r = new Response(JSON.stringify(res), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } });
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(ck, r)); else await cache.put(ck, r);
  return res;
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
   chart name and page. Writes come only from the EFB's own site, carry the pilot's vAMSYS username (checked once the
   vAMSYS keys are set), are range-checked, must sit near the airport, and keep the five before them for undo. */
async function ovgeoRoute(req, url, env, h) {
  const kv = env && env.STORE; if (!kv) throw new HttpError(503, 'Storage is not set up');
  const keyOf = (icao, name, page) => 'ovgeo:v1:' + icao + ':' + String(name).toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 80) + ':' + page;
  if (req.method === 'GET') {
    const icao = String(url.searchParams.get('icao') || '').toUpperCase(), name = url.searchParams.get('name') || '', page = +url.searchParams.get('page') || 1;
    if (!/^[A-Z0-9]{3,4}$/.test(icao) || !name) throw new HttpError(400, 'icao and name are required');
    const v = await kv.get(keyOf(icao, name, page), 'json').catch(() => null);
    return json({ geo: ovgeoPub(v) }, 200, h);
  }
  const origin = req.headers.get('Origin') || '', allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim());
  if (!allowed.includes(origin)) throw new HttpError(403, 'Not allowed');
  let b; try { b = JSON.parse(await req.text()); } catch (e) { throw new HttpError(400, 'Bad body'); }
  const icao = String(b.icao || '').toUpperCase(), name = String(b.name || ''), page = Math.max(1, Math.min(20, +b.page || 1)), g = b.geo || {};
  if (!/^[A-Z0-9]{3,4}$/.test(icao) || !name || name.length > 120) throw new HttpError(400, 'icao and name are required');
  /* who is writing: the pilot signed in on this EFB (Login with vAMSYS); the history below lets a bad change be undone */
  const sess = await sessionOf(req, env);
  if (!sess) throw new HttpError(401, 'Sign in to share chart alignments');
  const user = sess.u;
  const k = keyOf(icao, name, page), old = await kv.get(k, 'json').catch(() => null);
  const snap = (o) => ({ lat: o.lat, lon: o.lon, h: o.h, rot: o.rot, t: o.t || 0, by: o.by || '' });
  /* undo: the alignment before the last change comes back (five earlier ones are kept) */
  if (b.revert) {
    if (!old || !Array.isArray(old.prev) || !old.prev.length) throw new HttpError(409, 'There is no earlier alignment to go back to');
    const [back, ...rest] = old.prev;
    const v = { ...back, t: Date.now(), n: (old.n || 0) + 1, undoneBy: user, prev: rest };
    await kv.put(k, JSON.stringify(v));
    return json({ ok: true, geo: ovgeoPub(v) }, 200, h);
  }
  const num = (v) => typeof v === 'number' && isFinite(v);
  if (!num(g.lat) || !num(g.lon) || !num(g.h) || !num(g.rot) || Math.abs(g.lat) > 85 || Math.abs(g.lon) > 180 || g.h < 300 || g.h > 800000) throw new HttpError(400, 'Alignment out of range');
  /* must be near the airport (a chart centre can sit off the field, but not far) */
  try { const a = await airportRoute(icao); const ap = a && a.airport; if (ap && isFinite(ap.lat)) { const d = Math.hypot(g.lat - ap.lat, (g.lon - ap.lon) * Math.cos(ap.lat * Math.PI / 180)) * 60; if (d > Math.max(60, g.h / 1852 * 1.5)) throw new HttpError(400, 'Alignment is too far from the airport'); } } catch (e) { if (e instanceof HttpError) throw e; }
  if (old && Date.now() - (old.t || 0) < 5000 && old.by === user) return json({ ok: true, geo: ovgeoPub(old) }, 200, h);
  const prev = old ? [snap(old), ...(Array.isArray(old.prev) ? old.prev : [])].slice(0, 5) : [];
  const v = { lat: +g.lat.toFixed(7), lon: +g.lon.toFixed(7), h: Math.round(g.h * 10) / 10, rot: Math.round((((g.rot % 360) + 360) % 360) * 100) / 100, t: Date.now(), n: ((old && old.n) || 0) + 1, by: user, prev };
  await kv.put(k, JSON.stringify(v));
  return json({ ok: true, geo: ovgeoPub(v) }, 200, h);
}
/* what the EFB sees of a stored alignment: no history, just how many steps can be undone */
function ovgeoPub(v) { return v ? { lat: v.lat, lon: v.lon, h: v.h, rot: v.rot, t: v.t || 0, n: v.n || 0, by: v.by || '', undo: Array.isArray(v.prev) ? v.prev.length : 0 } : null; }

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
  async scheduled(event, env, ctx) {
    /* every 2 minutes: the automatic stand assignment (see stands.js); every 20: the airport maps and weather watch */
    if (event.cron === STAND_CRON) { ctx.waitUntil(opsTick(env, ctx)); return; }
    ctx.waitUntil(refreshMajor(env, ctx)); ctx.waitUntil(wxWatch(env, ctx).catch((e) => console.warn('[wxWatch]', e && e.message)));
  },
  async fetch(req, env, ctx) {
    /* the EFB privacy policy (linked from the "Login with vAMSYS" consent screen) */
    if (/^\/privacy\/?$/.test(new URL(req.url).pathname)) return new Response(PRIVACY_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
    /* the Polaris website's live flights and events: public, any origin (see site.js) */
    const siteDeps = { vget: (p, q) => vget(env, p, q), all: (p) => all(env, p), cached, edgeCache, configured: Boolean(env.VAMSYS_CLIENT_ID && env.VAMSYS_CLIENT_SECRET) };
    if (new URL(req.url).pathname.startsWith('/api/site/')) return siteRoute(req, new URL(req.url), siteDeps);
    /* pilot sign-in with vAMSYS (see auth.js) */
    if (new URL(req.url).pathname.startsWith('/auth/')) {
      const display = async (e, u) => { const p = await findPilot(e, u), rk = await ranks(e).catch(() => new Map()), k = rk.get(p.rank_id); return { name: p.name || '', rank: (k && k.name) || '' }; };
      try { return await authRoute(req, new URL(req.url), env, { cors, json, display: siteDeps.configured ? display : async () => null }); }
      catch (e) { console.warn('[auth]', e && e.message); return json({ error: 'Sign-in is not available right now' }, 500, cors(req, env)); }
    }
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (new URL(req.url).pathname.replace(/\/+$/, '') === '/api/efb/ovgeo' && (req.method === 'GET' || req.method === 'POST')) { try { return await ovgeoRoute(req, new URL(req.url), env, h); } catch (e) { return json({ error: e.message || 'Error' }, e.status || 500, h); } }
    /* Polaris flights online now: vAMSYS (ACARS) first, then PAW flights seen only on VATSIM; either source may be down */
    const pawLive = async () => {
      const [vs, va] = await Promise.all([vatsimFeed(ctx).catch(() => null), siteDeps.configured ? siteLive(siteDeps).catch(() => null) : Promise.resolve(null)]);
      if (!vs && !va) throw new Error('neither vAMSYS nor VATSIM answered');
      return liveFlights(vs, va);
    };
    /* pilots' messages (see pm.js) */
    if (/^\/api\/efb\/pm(\/state)?\/?$/.test(new URL(req.url).pathname) && req.method !== 'OPTIONS') {
      const me = await sessionOf(req, env);
      return pmPublic(req, new URL(req.url), env, h, me, { live: pawLive, fresh: () => sessionOf(req, env, true) });
    }
    /* Messages: what reaches the flight deck on Hoppie's ACARS, read only (see aoc.js) */
    if (/^\/api\/efb\/hoppie\/?$/.test(new URL(req.url).pathname)) return await hoppiePeek(req, env, h, await sessionOf(req, env));
    /* the apps each pilot installed from the EFB's App Store (see kb.js) */
    if (/^\/api\/efb\/apps\/?$/.test(new URL(req.url).pathname) && req.method !== 'OPTIONS') {
      const me = await sessionOf(req, env);
      return appsPublic(req, env, h, me);
    }
    /* each pilot's SIDs and STARs, read from their own simulator by Polaris Navdata on the simulator PC and kept here
       for their other devices (an iPad): per pilot only, never shared, gone after 90 days */
    if (/^\/api\/efb\/navproc\/?$/.test(new URL(req.url).pathname) && req.method !== 'OPTIONS') {
      const me = await sessionOf(req, env), u = new URL(req.url);
      const res = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      if (!me) return res({ error: 'Sign in first' }, 401);
      if (!env.STORE) return res({ error: 'Not set up on the server' }, 503);
      if (req.method === 'GET') {
        const ic = String(u.searchParams.get('icao') || '').toUpperCase();
        if (!/^[A-Z0-9]{3,4}$/.test(ic)) return res({ error: 'icao is required' }, 400);
        const v = await env.STORE.get('np:' + me.u + ':' + ic);
        return v ? new Response(v, { status: 200, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }) : res({ error: 'Not read from your simulator yet' }, 404);
      }
      if (req.method !== 'POST') return res({ error: 'Method not allowed' }, 405);
      const t = await req.text(); if (t.length > 3_000_000) return res({ error: 'Too large' }, 413);
      let b; try { b = JSON.parse(t); } catch (e) { return res({ error: 'Bad body' }, 400); }
      const d = b && b.data, ic = String((d && d.icao) || '').toUpperCase();
      if (!d || !/^[A-Z0-9]{3,4}$/.test(ic) || !Array.isArray(d.dep) || !Array.isArray(d.arr) || !Array.isArray(d.rw)) return res({ error: 'Not procedure data' }, 400);
      await env.STORE.put('np:' + me.u + ':' + ic, JSON.stringify({ ...d, icao: ic, up: Date.now() }), { expirationTtl: 90 * 86400 });
      return res({ ok: true, icao: ic });
    }
    /* each pilot's pen marks on charts (see chartsx.js), one record per chart page "ICAO|CHART NAME|page": per pilot
       only, never shared, gone a year after the last change. An empty set of strokes deletes the record. */
    if (/^\/api\/efb\/chartnotes\/?$/.test(new URL(req.url).pathname) && req.method !== 'OPTIONS') {
      const me = await sessionOf(req, env), u = new URL(req.url);
      const res = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      if (!me) return res({ error: 'Sign in first' }, 401);
      if (!env.STORE) return res({ error: 'Not set up on the server' }, 503);
      const okK = k => typeof k === 'string' && k.length <= 160 && /^[A-Z0-9]{3,4}\|[^|\n]{1,120}\|\d{1,3}$/.test(k);
      if (req.method === 'GET') {
        const k = String(u.searchParams.get('k') || '');
        if (!okK(k)) return res({ error: 'k is required' }, 400);
        const v = await env.STORE.get('cn:' + me.u + ':' + k);
        return v ? new Response(v, { status: 200, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }) : res({ error: 'No marks on this chart' }, 404);
      }
      if (req.method !== 'POST') return res({ error: 'Method not allowed' }, 405);
      const t = await req.text(); if (t.length > 600_000) return res({ error: 'Too large' }, 413);
      let b; try { b = JSON.parse(t); } catch (e) { return res({ error: 'Bad body' }, 400); }
      const k = b && b.k, n = b && b.n;
      if (!okK(k)) return res({ error: 'Bad chart key' }, 400);
      if (!n || !Array.isArray(n.s) || !n.s.length) { await env.STORE.delete('cn:' + me.u + ':' + k); return res({ ok: true, k, gone: true }); }
      if (n.s.length > 500 || !(+n.pw > 0) || !(+n.ph > 0)) return res({ error: 'Not chart marks' }, 400);
      const clean = { pw: +n.pw, ph: +n.ph, t: Number.isFinite(+n.t) && +n.t > 0 ? +n.t : Date.now(),
        s: n.s.map(x => ({ c: /^#[0-9A-Fa-f]{6}$/.test(String(x && x.c)) ? x.c : '#E5197E', w: Math.max(.02, Math.min(60, +(x && x.w) || 2)), h: x && x.h ? 1 : 0,
          p: (Array.isArray(x && x.p) ? x.p.slice(0, 6000) : []).map(Number).filter(Number.isFinite).map(v => Math.round(v * 10) / 10) })).filter(x => x.p.length >= 2 && x.p.length % 2 === 0) };
      await env.STORE.put('cn:' + me.u + ':' + k, JSON.stringify({ k, n: clean, t: clean.t }), { expirationTtl: 365 * 86400 });
      return res({ ok: true, k, t: clean.t });
    }
    /* each pilot's Weather settings (see kb.js): saved airports and units, on every device */
    if (/^\/api\/efb\/wx\/?$/.test(new URL(req.url).pathname) && req.method !== 'OPTIONS') {
      const me = await sessionOf(req, env);
      return wxPrefsPublic(req, env, h, me);
    }
    /* each pilot's kneeboard pages (see kb.js); only the pilot can read them */
    if (/^\/api\/efb\/kb\/?$/.test(new URL(req.url).pathname) && req.method !== 'OPTIONS') {
      const me = await sessionOf(req, env);
      return kbPublic(req, new URL(req.url), env, h, me);
    }
    /* backup PFD: the simulator PC's attitude and speeds relayed to the pilot's devices (see pfd.js) */
    if (/^\/api\/efb\/pfd\/(ticket|ws)\/?$/.test(new URL(req.url).pathname)) { try { return await pfdRoute(req, new URL(req.url), env, h); } catch (e) { return json({ error: e.message || 'Error' }, 500, h); } }
    /* Web Push and check-in (see crew.js) */
    if (/^\/api\/efb\/(push\/(key|sub|unsub|state|test|dnd)|crew(\/(checkin|checkout|alarms))?|gsx)\/?$/.test(new URL(req.url).pathname)) {
      const me = await sessionOf(req, env, req.method === 'POST');
      return crewPublic(req, new URL(req.url), env, h, me, { bookings: (u) => bookingsRoute(env, u) });
    }
    /* staff admin: behind Cloudflare Access, checked again in mailAdmin */
    { const pth = new URL(req.url).pathname; if (pth === '/admin' || pth === '/admin/' || pth.startsWith('/admin/')) return await mailAdmin(req, new URL(req.url), env, { live: pawLive, pilots: async () => {
      /* the vAMSYS roster with who has signed in to the EFB */
      const [inEfb, roster, rk] = await Promise.all([signedInPilots(env), siteDeps.configured ? cached('roster', 300_000, () => all(env, '/pilots')).catch(() => null) : null, siteDeps.configured ? ranks(env).catch(() => new Map()) : new Map()]);
      const by = new Map(inEfb.map((p) => [p.u, p])), out = [];
      for (const p of roster || []) { const u = String(p.username || '').toUpperCase(); if (!u) continue; const e = by.get(u); by.delete(u); const k = rk.get(p.rank_id); out.push({ u, name: p.name || (e && e.name) || '', rank: (k && k.name) || (e && e.rank) || '', cid: (e && e.cid) || '', first: (e && e.first) || 0, last: (e && e.last) || 0, devices: (e && e.devices) || 0, roster: true }); }
      for (const e of by.values()) out.push({ ...e, roster: !roster });
      return { pilots: out.sort((a, b) => (b.last - a.last) || a.u.localeCompare(b.u)), roster: !!roster };
    }, events: () => siteEvents(siteDeps), stands: standDeps(env, ctx), watch: () => flightWatch({ vatsim: () => vatsimFeed(ctx), vamsys: () => (siteDeps.configured ? siteLive(siteDeps) : Promise.resolve(null)), airport: (i) => airportRoute(i, ctx), sigmets: () => sigmetRoute() }), signOut: async (u) => { const ok = await signOutPilot(env, u); crewSoon(env, ctx, { op: 'unsubAll', u }); return ok; }, probe: (id) => pirepProbe(env, id), bkProbe: (u) => bookingsProbe(env, u), opsProbe: () => opsProbe(env), ctx }); }
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, h);
    const url = new URL(req.url);
    const configured = Boolean(env.VAMSYS_CLIENT_ID && env.VAMSYS_CLIENT_SECRET);
    try {
      const ov = url.pathname.match(/^\/api\/efb\/oaip\/v\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
      if (ov) return await oaipVector(ov, env, ctx, h);
      switch (url.pathname.replace(/\/+$/, '')) {
        case '/api/efb/health': return json({ ok: true, configured, openaip: Boolean(env.OPENAIP_API_KEY), updatedAt: new Date().toISOString() }, 200, h);
        /* a pilot's own profile, logbook and bookings: the signed-in pilot only */
        case '/api/efb/pilot': { if (!configured) break; const me = await sessionOf(req, env); if (!me) return json({ error: 'Sign in to see your vAMSYS profile' }, 401, h); return json({ ...(await pilotRoute(env, me.u)), updatedAt: new Date().toISOString() }, 200, h); }
        case '/api/efb/bookings': { if (!configured) break; const me = await sessionOf(req, env); if (!me) return json({ error: 'Sign in to see your bookings' }, 401, h); return json({ ...(await bookingsRoute(env, me.u)), updatedAt: new Date().toISOString() }, 200, h); }
        case '/api/efb/charts': return json({ ...(await chartsRoute(url.searchParams.get('icao'), env, ctx)), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/chart-pdf': return await chartPdfRoute(url, h);
        case '/api/efb/airport-layout': { const p = layoutRoute(url.searchParams.get('icao'), env, ctx); if (ctx && ctx.waitUntil) ctx.waitUntil(p.catch(() => {}));
          /* warm=1: the EFB only asks the server to have it ready; answered at once, without the diagram */
          if (url.searchParams.get('warm') === '1') { p.catch(() => {}); return json({ ok: true, warm: true }, 202, h); }
          return json({ ...(await p), updatedAt: new Date().toISOString() }, 200, h); }
        case '/api/efb/airport': return json({ ...(await airportRoute(url.searchParams.get('icao'), ctx)), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/major': return json({ ...(await majorRoute(env)), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/metars': return await metarCellRoute(url.searchParams.get('cell'), url.searchParams.get('size'), ctx, h);
        case '/api/efb/winds': return await windRoute(url, ctx, h);
        case '/api/efb/gwx': return await gwxRoute(url, ctx, h);
        case '/api/efb/sat': return await satRoute(url, ctx, h);
        case '/api/efb/apts': return await aptsRoute(url, env, ctx, h);
        case '/api/efb/awy': return await awyRoute(url, ctx, h);
        case '/api/efb/ifr': return await ifrRoute(url, ctx, h);
        case '/api/efb/vfr': return await vfrRoute(url, ctx, h);
        case '/api/efb/fc': return await fcRoute(url, ctx, h);
        case '/api/efb/tz': return await tzRoute(url, ctx, h);
        case '/api/efb/atis': return await atisRoute(url.searchParams.get('icao'), ctx, h);
        case '/api/efb/pireps': return await pirepCellRoute(url.searchParams.get('cell'), ctx, h);
        case '/api/efb/fir': return json(await firRoute(env, ctx, url.searchParams.get('v') === '2', url.searchParams.get('v') === '3'), 200, h);
        case '/api/efb/radar': return json(await radarRoute(), 200, h);
        case '/api/efb/vatsim': return await vatsimRoute(req, url, ctx, h);
        case '/api/efb/mail': return await mailPublic(req, env, h, await sessionOf(req, env), linkSig);
        case '/api/efb/mail-att': return await mailAttachment(url, env, h, linkSig);
        case '/api/efb/cal': return await calPublic(req, env, h, await sessionOf(req, env), () => siteEvents(siteDeps));
        case '/api/efb/aoc': return await aocPublic(req, env, h, await sessionOf(req, env));
        case '/api/efb/docs': return await docsPublic(req, env, h, await sessionOf(req, env), linkSig);
        case '/api/efb/doc-file': return await docFile(url, env, h, linkSig);
        case '/api/efb/doc-cover': return await docCover(url, env, h, linkSig);
        case '/api/efb/sigmets': return json({ ...(await sigmetRoute()), updatedAt: new Date().toISOString() }, 200, h);
        case '/api/efb/pirep': { if (!configured) break; const me = await sessionOf(req, env); if (!me) return json({ error: 'Sign in to see your PIREPs' }, 401, h); return json({ ...(await pirepRoute(env, me, url.searchParams.get('id'))), updatedAt: new Date().toISOString() }, 200, h); }
        case '/api/efb/datalink': return json({ ...(await datalinkRoute(ctx)), updatedAt: new Date().toISOString() }, 200, h);
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
