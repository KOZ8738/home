/* ---------- The Polaris website (Network and Events pages) ----------
   The site is static, so it cannot keep the vAMSYS key: it reads these two public endpoints instead, and the key
   stays in this Worker's secrets. Same answers as the site's own dev proxy (polaris AIRWAUS WEB/server/vamsys.ts),
   field for field (src/lib/vamsys/types.ts there):
     GET /api/site/live    -> { flights: LiveFlightDto[], updatedAt }   cached 15 s
     GET /api/site/events  -> { current: EventDto[], past: EventDto[], updatedAt }   cached 5 min
   Both are public, read-only data that the site shows anyway, so any origin may read them. Answers are kept in this
   isolate and in the colo's edge cache, so visitors do not add vAMSYS requests (100 a minute per airline). */

const TRAIL_POINTS = 160;
const PAST_EVENTS = 6;

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' && v ? v : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(+v) ? +v : null);

function airportOf(v) {
  const a = obj(v), lat = num(a.lat), lon = num(a.lon), icao = str(a.icao) || str(a.identifier);
  return icao && lat != null && lon != null ? { icao, iata: str(a.iata), name: str(a.name) || icao, country: str(obj(a.country).name), lat, lon } : null;
}
function downsample(points, max) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

async function live(vget) {
  const json = await vget('/flight-map', { include_posreps: 'true' });
  const flights = arr(json.data).flatMap((f) => {
    const booking = obj(f.booking), progress = obj(f.progress), aircraft = obj(f.aircraft), route = obj(f.route);
    const lat = num(progress.latitude) ?? num(obj(progress.location).lat);
    const lon = num(progress.longitude) ?? num(obj(progress.location).lon);
    if (lat == null || lon == null) return [];
    const altitude = num(progress.altitude) ?? num(booking.altitude) ?? 0;
    const trail = arr(progress.posreps).flatMap((p) => { const a = num(p.latitude), b = num(p.longitude); return a == null || b == null ? [] : [[a, b, num(p.altitude) ?? 0]]; });
    trail.push([lat, lon, altitude]);
    const pilot = obj(f.pilot);
    return [{
      callsign: str(booking.callsign) || str(booking.flightNumber) || `#${num(f.bookingId) ?? '?'}`,
      flightNumber: str(booking.flightNumber) || '',
      pilot: str(pilot.username) || '',
      pilotRank: str(obj(pilot.rank).name) || '',
      network: str(booking.network),
      aircraft: str(aircraft.code) || str(aircraft.type) || str(aircraft.name) || '',
      aircraftName: str(aircraft.type) || str(aircraft.name) || '',
      registration: str(aircraft.registration) || '',
      image: str(aircraft.image),
      imageCredit: str(aircraft.imageAttribution),
      passengers: num(booking.passengers),
      costIndex: str(booking.costIndex) ?? (num(booking.costIndex) != null ? String(num(booking.costIndex)) : null),
      dep: airportOf(f.departureAirport),
      arr: airportOf(f.arrivalAirport),
      lat, lon, altitude,
      groundspeed: num(progress.groundSpeed) ?? 0,
      heading: num(progress.magneticHeading) ?? 0,
      phase: str(progress.currentPhase) || '',
      route: str(route.userRoute) || str(route.companyRoute) || '',
      routeDistance: num(progress.routeDistance),
      distanceRemaining: num(progress.distanceRemaining),
      departedAt: str(progress.atd) || str(progress.departureTime),
      eta: str(progress.estimatedArrivalTime) || str(progress.eta),
      trail: downsample(trail, TRAIL_POINTS),
    }];
  });
  return { flights };
}

/* id -> label (airports, fleets) for events; a list the airline has not enabled just stays empty */
async function lookup(all, path, label) {
  const map = {};
  try { for (const item of await all(path)) { const id = num(item.id), value = label(item); if (id != null && value) map[id] = value; } }
  catch (e) { if (!(e && (e.status === 403 || e.status === 404 || /HTTP (403|404)/.test(String(e.message))))) throw e; }
  return map;
}
const merged = (v) => (Array.isArray(v) ? Object.assign({}, ...v.map(obj)) : obj(v));
const ids = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).map(num).filter((n) => n != null);

function eventOf(e, airports, fleets) {
  const icao = (id) => airports[id] || '';
  const subtype = str(e.subtype), criteria = merged(e.criteria), restrictions = merged(e.restrictions);
  return {
    id: num(e.id) ?? 0,
    name: str(e.name) || 'Event',
    subtype,
    description: str(e.description) || '',
    sidebarTitle: str(e.sidebar_title),
    sidebarContent: str(e.sidebar_content),
    tags: arr(e.tags).map(str).filter(Boolean),
    image: str(e.image),
    imageDark: str(e.image_dark),
    points: num(e.points),
    pointsAsPercentage: e.points_as_percentage === true,
    start: str(e.start),
    end: str(e.end),
    repeatable: e.allow_repeat_participation === true,
    registrationRequired: e.registration_required === true,
    registrationStart: str(e.registration_start),
    registrationEnd: str(e.registration_end),
    registrationCount: num(e.registration_count),
    completionCount: num(e.completion_count),
    airports: subtype === 'airports'
      ? { departures: ids(criteria.departure_airport_ids).map(icao).filter(Boolean), arrivals: ids(criteria.arrival_airport_ids).map(icao).filter(Boolean), operator: str(criteria.operator) }
      : null,
    routes: subtype === 'routes'
      ? arr(e.criteria).map((r) => ({ from: icao(num(r.departure_airport_id) ?? -1), to: icao(num(r.arrival_airport_id) ?? -1) })).filter((r) => r.from || r.to)
      : [],
    networks: (Array.isArray(restrictions.networks) ? restrictions.networks : []).map(str).filter(Boolean),
    aircraft: ids(restrictions.fleet_ids).map((id) => fleets[id] || '').filter(Boolean),
  };
}

async function events(vget, all, cached) {
  const [current, recent, airports, fleets] = await Promise.all([
    vget('/activities/events', { 'page[size]': '50', sort: 'start' }), // vAMSYS leaves out finished events by default
    vget('/activities/events', { 'page[size]': String(PAST_EVENTS * 2), sort: '-end', 'filter[include_past]': 'true' }),
    cached('site:lookup:airports', 3600_000, () => lookup(all, '/airports', (a) => str(a.icao) || str(a.iata))),
    cached('site:lookup:fleet', 3600_000, () => lookup(all, '/fleet', (f) => str(f.code) || str(f.name))),
  ]);
  const now = Date.now(), ended = (e) => { const end = str(e.end); return !!end && new Date(end).getTime() < now; };
  return {
    current: arr(current.data).filter((e) => !ended(e)).map((e) => eventOf(e, airports, fleets)),
    past: arr(recent.data).filter(ended).slice(0, PAST_EVENTS).map((e) => eventOf(e, airports, fleets)),
  };
}

const stamp = async (p) => ({ ...(await p), updatedAt: new Date().toISOString() });
/** Polaris flights from vAMSYS, the same cached answer the website gets (the admin's Live tab reads it too). */
/* the vAMSYS events (current and recent), as the website's Events page shows them; the company calendar reads them too */
export function siteEvents(deps) {
  return deps.cached('site:events', 300_000, () => deps.edgeCache('site/events/v1', 300, () => stamp(events(deps.vget, deps.all, deps.cached))));
}
export function siteLive(deps) {
  return deps.cached('site:live', 15_000, () => deps.edgeCache('site/live/v1', 15, () => stamp(live(deps.vget))));
}

/** deps: { vget(path, params), all(path), cached(key, ttlMs, fn), edgeCache(key, ttlSec, fn), configured } */
export async function siteRoute(req, url, deps) {
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept', 'Content-Type': 'application/json; charset=utf-8' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const route = url.pathname.replace(/^\/api\/site\/?/, '').replace(/\/+$/, '');
  const send = (status, body, maxAge) => new Response(JSON.stringify(body), { status, headers: { ...h, 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store' } });
  if (req.method !== 'GET' || (route !== 'live' && route !== 'events')) return send(404, { error: 'not-found' });
  if (!deps.configured) return send(503, { error: 'not-configured' });
  try {
    const body = route === 'live'
      ? await siteLive(deps)
      : await siteEvents(deps);
    return send(200, body, route === 'live' ? 10 : 120);
  } catch (e) {
    console.warn('[site]', e && e.message);
    return send(502, { error: 'upstream' });
  }
}
