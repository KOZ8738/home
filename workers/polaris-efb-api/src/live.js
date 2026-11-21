/* Polaris live flights for the staff admin (Live tab), from two sources:
   - vAMSYS (ACARS): every flight a Polaris pilot has started, on any network or offline, with its phase, pilot,
     registration and track. Read through siteLive(), the same cached answer the website's Network page gets.
   - VATSIM: pilots whose callsign is PAW + a number, flying to or from a Polaris airport (PAW is also the ICAO code
     of Presidential Airways, so a PAW flight that touches no Polaris airport is left out; one with no flight plan yet
     is kept). These fill in flights not tracked in vAMSYS, and give a vAMSYS flight its VATSIM CID (for Message).
   A vAMSYS flight reports its phase; for VATSIM-only flights the page works it out from one update to the next. */

/** Polaris airports (same list as the website's src/data/airports.ts): icao -> [lat, lon, iata, city] */
export const PAW_APTS = {
  KSFO: [37.6189, -122.375, 'SFO', 'San Francisco'],
  KLAX: [33.9425, -118.4081, 'LAX', 'Los Angeles'],
  KSEA: [47.4502, -122.3088, 'SEA', 'Seattle'],
  KORD: [41.9786, -87.9048, 'ORD', "Chicago O'Hare"],
  KMIA: [25.7959, -80.287, 'MIA', 'Miami'],
  KBOS: [42.3656, -71.0096, 'BOS', 'Boston'],
  KJFK: [40.6413, -73.7781, 'JFK', 'New York JFK'],
  PANC: [61.1743, -149.9963, 'ANC', 'Anchorage'],
  PHNL: [21.3187, -157.9225, 'HNL', 'Honolulu'],
  CYYZ: [43.6777, -79.6248, 'YYZ', 'Toronto'],
  VHHH: [22.308, 113.9185, 'HKG', 'Hong Kong'],
  RJTT: [35.5494, 139.7798, 'HND', 'Tokyo Haneda'],
  RCTP: [25.0797, 121.2342, 'TPE', 'Taipei Taoyuan'],
  ZBAA: [40.0799, 116.6031, 'PEK', 'Beijing Capital'],
  ZSPD: [31.1443, 121.8083, 'PVG', 'Shanghai Pudong'],
  WSSS: [1.3644, 103.9915, 'SIN', 'Singapore Changi'],
  EGLL: [51.47, -0.4543, 'LHR', 'London Heathrow'],
  LSZH: [47.4647, 8.5492, 'ZRH', 'Zurich'],
  ENGM: [60.1976, 11.1004, 'OSL', 'Oslo Gardermoen'],
  /* in the company gate assignments too */
  KATL: [33.6407, -84.4277, 'ATL', 'Atlanta'],
  KDEN: [39.8561, -104.6737, 'DEN', 'Denver'],
  KLAS: [36.084, -115.1537, 'LAS', 'Las Vegas'],
  KDCA: [38.8512, -77.0402, 'DCA', 'Washington National'],
  KSAN: [32.7338, -117.1933, 'SAN', 'San Diego'],
};

const PAW_CS = /^PAW\d{1,4}[A-Z]{0,2}$/;

/** "FL350", "F350", "35000", "A045" -> feet */
function cruiseFt(s) {
  const t = String(s || '').toUpperCase().trim();
  let m = t.match(/^(?:FL|F)(\d{2,3})$/); if (m) return +m[1] * 100;
  m = t.match(/^A(\d{2,3})$/); if (m) return +m[1] * 100;
  m = t.match(/^(\d{3,5})$/); if (m) return +m[1] < 1000 ? +m[1] * 100 : +m[1];
  return null;
}

/** d = vatsimFeed() result: { upd, rows: [cs, cid, name, lat, lon, alt, gs, hdg, sq, logon, ac, dep, arr, plannedAlt, rules], routes, det }
    va = siteLive() result: { flights: LiveFlightDto[], updatedAt } (either may be null when that source is down) */
export function liveFlights(d, va) {
  const flights = [], apts = { ...PAW_APTS };
  const vsRow = {};
  for (const r of (d && d.rows) || []) vsRow[r[0]] = r;
  const seen = new Set();
  for (const f of (va && va.flights) || []) {
    const cs = String(f.callsign || '').toUpperCase().replace(/\s+/g, ''), v = vsRow[cs];
    for (const a of [f.dep, f.arr]) if (a && a.icao && !apts[a.icao]) apts[a.icao] = [a.lat, a.lon, a.iata || '', a.name || a.icao];
    seen.add(cs);
    flights.push({
      cs, cid: v ? v[1] : 0, name: v ? v[2] : '', lat: f.lat, lon: f.lon, alt: Math.round(f.altitude || 0), gs: Math.round(f.groundspeed || 0), hdg: Math.round(f.heading || 0),
      sq: v ? v[8] : '', logon: v && v[9] ? v[9] * 1000 : 0, ac: f.aircraft || '', dep: (f.dep && f.dep.icao) || '', arr: (f.arr && f.arr.icao) || '',
      cruise: v ? cruiseFt(v[13]) : null, fl: v ? v[13] || '' : '', rules: v ? v[14] || '' : '', altn: '', tas: '', dt: '', ete: '', route: f.route || '',
      src: 'vAMSYS', vphase: f.phase || '', pilot: f.pilot || '', rank: f.pilotRank || '', reg: f.registration || '', acName: f.aircraftName || '', net: f.network || '',
      departed: f.departedAt || '', eta: f.eta || '', std: f.std || '', sta: f.sta || '', remain: f.distanceRemaining ?? null, trail: (f.trail || []).map((p) => [p[0], p[1]]),
    });
  }
  for (const r of (d && d.rows) || []) {
    const cs = r[0];
    if (!PAW_CS.test(cs) || seen.has(cs)) continue;
    const dep = r[11] || '', arr = r[12] || '';
    if ((dep || arr) && !PAW_APTS[dep] && !PAW_APTS[arr]) continue;
    const det = (d.det && d.det[cs]) || {};
    flights.push({
      cs, cid: r[1], name: r[2], lat: r[3], lon: r[4], alt: r[5], gs: r[6], hdg: r[7], sq: r[8], logon: r[9] ? r[9] * 1000 : 0,
      ac: r[10], dep, arr, cruise: cruiseFt(r[13]), fl: r[13] || '', rules: r[14] || '',
      altn: det.altn || '', tas: det.tas || '', dt: det.dt || '', ete: det.ete || '', route: (d.routes && d.routes[cs]) || '', src: 'VATSIM',
    });
  }
  flights.sort((a, b) => a.cs.localeCompare(b.cs));
  const upd = (va && va.updatedAt) || (d && d.upd) || new Date().toISOString();
  return { upd, now: Date.now(), sources: { vamsys: !!va, vatsim: !!d }, flights, apts };
}
