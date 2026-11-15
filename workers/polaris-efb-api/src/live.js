/* Polaris live flights for the staff admin (Live tab).
   For now they come from the VATSIM network feed that vatsimFeed() already keeps: pilots whose callsign is PAW + a
   number, flying to or from a Polaris airport (PAW is also the ICAO code of Presidential Airways, so a PAW flight
   that touches no Polaris airport is left out; one with no flight plan yet is kept). Once Polaris is on vAMSYS this
   can read vAMSYS live flights instead and hand the page the same shape. The flight phase is worked out in the page,
   which compares one update with the next (VATSIM gives position, altitude and ground speed, not the phase). */

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

/** d = vatsimFeed() result: { upd, rows: [cs, cid, name, lat, lon, alt, gs, hdg, sq, logon, ac, dep, arr, plannedAlt, rules], routes, det } */
export function liveFlights(d) {
  const flights = [];
  for (const r of d.rows || []) {
    const cs = r[0];
    if (!PAW_CS.test(cs)) continue;
    const dep = r[11] || '', arr = r[12] || '';
    if ((dep || arr) && !PAW_APTS[dep] && !PAW_APTS[arr]) continue;
    const det = (d.det && d.det[cs]) || {};
    flights.push({
      cs, cid: r[1], name: r[2], lat: r[3], lon: r[4], alt: r[5], gs: r[6], hdg: r[7], sq: r[8], logon: r[9] ? r[9] * 1000 : 0,
      ac: r[10], dep, arr, cruise: cruiseFt(r[13]), fl: r[13] || '', rules: r[14] || '',
      altn: det.altn || '', tas: det.tas || '', dt: det.dt || '', ete: det.ete || '', route: (d.routes && d.routes[cs]) || '',
    });
  }
  flights.sort((a, b) => a.cs.localeCompare(b.cs));
  return { upd: d.upd, now: Date.now(), source: 'VATSIM', flights, apts: PAW_APTS };
}
