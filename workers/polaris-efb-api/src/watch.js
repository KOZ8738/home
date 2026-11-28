/* ---------- Flight Watch: what Polaris operations should look at now ----------
   The admin's Live tab lists alerts for the Polaris flights in the air, as an airline's flight-following desk does.
   Worked out on each request from what the Live tab already reads (vAMSYS ACARS and the VATSIM network), the airport
   weather (aviationweather.gov) and the SIGMETs, so nothing is kept here:
     red    emergency squawk 7700 / 7600 / 7500 (VATSIM); overdue (still flying 20 minutes after the vAMSYS ETA)
     amber  possible diversion (the VATSIM flight plan goes elsewhere than the booking); booked on VATSIM but not
            connected; ACARS not updating (vAMSYS far behind the VATSIM position); holding (the track circles);
            inside a SIGMET at its level; the destination IFR / LIFR or with thunderstorms, freezing precipitation,
            heavy snow or hail, within two hours of landing; with the dispatch release on (dispatch.js), a checked-in flight
            moving without a release, or released on the captain's discretion */
import { liveFlights } from './live.js';
import { prepArea, inArea } from './sigroute.js'; // point in a SIGMET, also across 180°

const R = 3440.065, rad = Math.PI / 180;
const nm = (a, b, c, d) => { const x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); };
const brg = (a, b, c, d) => { const y = Math.sin((d - b) * rad) * Math.cos(c * rad), x = Math.cos(a * rad) * Math.sin(c * rad) - Math.sin(a * rad) * Math.cos(c * rad) * Math.cos((d - b) * rad); return (Math.atan2(y, x) / rad + 360) % 360; };
const z = (t) => { const d = new Date(t); return String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + 'Z'; };
const SQUAWK = { 7700: 'Emergency (squawk 7700)', 7600: 'Radio failure (squawk 7600)', 7500: 'Unlawful interference (squawk 7500)' };

/* the track circles: in the last part of the trail the heading turns through a full circle while staying close by */
export function holdingIn(trail) {
  if (!Array.isArray(trail) || trail.length < 8) return false;
  let turn = 0, len = 0, prev = null;
  const pts = [];
  for (let i = trail.length - 1; i > 0 && len < 70; i--) {
    const [a, b] = trail[i - 1], [c, d] = trail[i], step = nm(a, b, c, d);
    if (step > 6) return false; // too far apart to see a hold
    if (step < 0.3) continue;
    len += step; pts.push([c, d]);
    const h = brg(a, b, c, d);
    if (prev != null) { let dh = h - prev; if (dh > 180) dh -= 360; if (dh < -180) dh += 360; turn += dh; }
    prev = h;
    if (Math.abs(turn) >= 340) break; // one full circle is enough
  }
  if (Math.abs(turn) < 330 || pts.length < 6) return false;
  const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length, lon = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.every((p) => nm(lat, lon, p[0], p[1]) < 15);
}
const timeOf = (v) => (v == null || v === '' ? null : typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v));
const levelFt = (v) => (v == null || v === '' || !isFinite(+v) ? null : +v < 1000 ? +v * 100 : +v);

/* deps = { vatsim() -> VATSIM rows, vamsys() -> vAMSYS live, airport(icao) -> METAR, sigmets() -> { sigmets },
           checkins() -> the crew's check-ins (crew.js ciList), dispOn() -> is the dispatch release on } */
export async function flightWatch(deps, now = Date.now()) {
  const [vs, va] = await Promise.all([deps.vatsim().catch(() => null), deps.vamsys().catch(() => null)]);
  if (!vs && !va) throw new Error('neither vAMSYS nor VATSIM answered');
  const live = liveFlights(vs, va), row = {};
  for (const r of (vs && vs.rows) || []) row[r[0]] = r;
  const sig = await deps.sigmets().then((j) => (j && j.sigmets) || []).catch(() => []);
  const sigNow = sig.filter((s) => /SIGMET|CWA/i.test(s.kind) && !/AIRMET/i.test(s.kind) && (timeOf(s.from) == null || timeOf(s.from) <= now) && (timeOf(s.to) == null || timeOf(s.to) >= now));
  const alerts = [], wxWanted = new Map();
  const who = (f) => ({ cs: f.cs, pilot: f.pilot || '', cid: f.cid ? String(f.cid) : '', name: f.name || '', dep: f.dep || '', arr: f.arr || '', src: f.src || '' });
  const add = (f, type, sev, title, detail) => alerts.push({ k: f.cs + ':' + type, type, sev, title, detail: detail || '', ...who(f) });
  for (const f of live.flights || []) {
    const v = row[f.cs], air = f.gs > 60, sq = String(f.sq || (v && v[8]) || '');
    if (SQUAWK[sq]) add(f, 'sq' + sq, 'red', SQUAWK[sq], 'Transponder ' + sq + ' on VATSIM');
    const eta = Date.parse(f.eta || '');
    if (air && isFinite(eta) && now - eta > 20 * 60_000) add(f, 'overdue', 'red', 'Overdue', 'Still flying ' + Math.round((now - eta) / 60_000) + ' min after the ETA of ' + z(eta));
    if (f.src === 'vAMSYS') {
      if (v && v[12] && f.arr && v[12] !== f.arr) add(f, 'divert', 'amber', 'Possible diversion', 'VATSIM flight plan to ' + v[12] + '; booked to ' + f.arr);
      if (!v && air && /VATSIM/i.test(f.net || '')) add(f, 'novatsim', 'amber', 'Not connected to VATSIM', 'Booked on VATSIM, flying, but not on the network');
      if (v && isFinite(v[3]) && isFinite(f.alat ?? f.lat)) { const d = nm(f.alat ?? f.lat, f.alon ?? f.lon, v[3], v[4]); if (d > 40) add(f, 'acars', 'amber', 'ACARS not updating', 'vAMSYS shows the aircraft ' + Math.round(d) + ' nm from its VATSIM position'); }
      if (air && holdingIn(f.trail)) add(f, 'hold', 'amber', 'Holding', 'The track circles' + (f.arr && f.remain != null && f.remain < 120 ? ' ' + Math.round(f.remain) + ' nm from ' + f.arr : ''));
    }
    if (air && f.alt > 1000 && isFinite(f.lat)) {
      const s = sigNow.find((x) => (levelFt(x.base) == null || f.alt >= levelFt(x.base) - 1000) && (levelFt(x.top) == null || f.alt <= levelFt(x.top) + 1000) && inArea(prepArea(x.coords), f.lat, f.lon));
      if (s) add(f, 'sigmet', 'amber', 'Inside a SIGMET', [s.hazard, s.qualifier].filter(Boolean).join(' ') + (s.fir ? ' · ' + s.fir : '') + (levelFt(s.base) != null || levelFt(s.top) != null ? ' · ' + (levelFt(s.base) != null ? 'FL' + Math.round(levelFt(s.base) / 100) : 'SFC') + '–' + (levelFt(s.top) != null ? 'FL' + Math.round(levelFt(s.top) / 100) : '') : ''));
    }
    /* the destination's weather, once landing is under two hours away */
    let ttg = null;
    if (air && f.remain != null && isFinite(f.remain)) ttg = (f.remain / f.gs) * 60;
    else if (air && isFinite(eta)) ttg = (eta - now) / 60_000;
    else if (air && live.apts && live.apts[f.arr] && isFinite(f.lat)) ttg = (nm(f.lat, f.lon, live.apts[f.arr][0], live.apts[f.arr][1]) / f.gs) * 60;
    if (ttg != null && ttg <= 120 && /^[A-Z0-9]{4}$/.test(f.arr || '')) { if (!wxWanted.has(f.arr)) wxWanted.set(f.arr, []); wxWanted.get(f.arr).push(f); }
  }
  await Promise.all([...wxWanted].slice(0, 12).map(async ([icao, fl]) => {
    let j; try { j = await deps.airport(icao); } catch (e) { return; }
    const m = j && j.metar; if (!m || !m.raw) return;
    const cat = String(m.cat || '').toUpperCase(), body = m.raw.replace(/\s+(RMK|TEMPO|BECMG|NOSIG)\b.*$/, '');
    /* the present-weather groups only (after the time; not the station, wind or cloud), as the pilots' weather watch reads them */
    const all = body.split(/\s+/), t0 = all.findIndex((t) => /^\d{6}Z$/.test(t));
    const toks = all.slice(t0 + 1).filter((t) => /^(-|\+|VC)?(TS|SH|FZ|MI|BC|PR|DR|BL)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)*$/.test(t) && /[A-Z]{2}/.test(t));
    const hz = [];
    if (toks.some((t) => /TS/.test(t))) hz.push('thunderstorms');
    if (toks.some((t) => /^[-+]?FZ(RA|DZ)/.test(t))) hz.push('freezing precipitation');
    if (toks.some((t) => /^\+[A-Z]*SN/.test(t))) hz.push('heavy snow');
    if (toks.some((t) => /GR|GS/.test(t))) hz.push('hail');
    if (cat !== 'IFR' && cat !== 'LIFR' && !hz.length) return;
    for (const f of fl) add(f, 'destwx', 'amber', f.arr + (cat === 'IFR' || cat === 'LIFR' ? ' ' + cat : '') + (hz.length ? ': ' + hz.join(', ') : ''), body);
  }));
  /* the dispatch release, for the flights whose pilot checked in */
  const dispOn = deps.dispOn ? await deps.dispOn().catch(() => false) : false, cis = dispOn && deps.checkins ? await deps.checkins().catch(() => null) : null;
  if (Array.isArray(cis)) {
    const byCs = new Map(cis.filter((c) => c && c.fl).map((c) => [String(c.fl).replace(/\s+/g, '').toUpperCase(), c]));
    const RES = { fail: 'the plan could not be released', hold: 'below the policy, not accepted by the captain', ok: 'released', remarks: 'released', capt: 'released' };
    for (const f of live.flights || []) {
      const c = byCs.get(String(f.cs || '').toUpperCase()); if (!c || (c.from && f.dep && c.from !== f.dep)) continue;
      if (!(c.disp && c.disp.rel)) { if (f.gs > 5) add(f, 'norel', 'amber', 'No dispatch release', c.disp ? 'Last check ' + z(c.disp.at) + ': ' + (RES[c.disp.res] || c.disp.res) : 'The plan was never checked: no SimBrief plan in the EFB'); }
      else if (c.disp.capt) add(f, 'capt', 'amber', 'Released on the captain’s discretion', c.disp.rel + ' · see Automatic messages › Dispatch release');
    }
  }
  const order = { red: 0, amber: 1 };
  alerts.sort((a, b) => order[a.sev] - order[b.sev] || a.cs.localeCompare(b.cs));
  return { alerts, flights: (live.flights || []).length, at: new Date(now).toISOString() };
}
