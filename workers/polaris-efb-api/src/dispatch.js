/* ---------- Automatic dispatch release (Nov 2026) ----------
   Polaris operations is not staffed round the clock, so the server releases flights itself, as an airline's dispatch
   would after checking the plan, and staff look afterwards at what went out on the captain's word.

   When a pilot has checked in and the EFB has that flight's SimBrief plan, the EFB sends a short summary of the plan
   (cleanPlan: fuel, weights, alternates, times; the whole OFP is too big to read within a Worker's 10 ms) with the
   loadsheet weights (POST /api/efb/crew/ofp, crew.js). The crew Durable Object reads the TAFs of the departure,
   destination and alternates (aviationweather.gov, one request) and checks the plan against Polaris's dispatch policy
   (checkPlan). Each finding is
     hard   the plan cannot be flown as it is (over a weight limit, no final reserve, no alternate): plan again
     soft   below the policy; the captain may accept it with a reason (an alternate under its planning minima), and
            the release then says CAPT DISCRETION and is listed for staff
     warn   a remark on the release (thunderstorms forecast at the destination around the ETA)
   With no hard or soft finding the flight is released: the crew get an AOC "DISPATCH RELEASE" with a release number
   (wording on /admin › Automatic messages, aoctpl.js 'rel'). Nothing stops a flight that was not released (vAMSYS is
   read-only to us); Flight Watch shows one that moves without a release (watch.js).

   The policy is set on /admin › Automatic messages › Dispatch release and kept in KV disp:v1:policy; the last checks
   (200, 30 days) are kept in disp:v1:log for that page.
     GET  /admin/api/dispatch            -> { policy, def, log }
     POST /admin/api/dispatch { policy } -> { ok, policy }
   The rules are Polaris's own, simplified from EASA's and the FAA's for flying on VATSIM. They are not for real flight. */

import { aocMsg } from './aoctpl.js';

export const POLICY_KEY = 'disp:v1:policy', LOG_KEY = 'disp:v1:log';
const LOG_MAX = 200, LOG_DAYS = 30, MIN = 60_000;

/* the policy: each value with its bounds. Off until staff turn it on (it writes to every checked-in crew). */
export const POLICY = [
  ['contPct', 5, 0, 10, 'Contingency fuel, % of trip fuel'],
  ['contMin', 5, 0, 30, 'Contingency fuel, at least (minutes)'],
  ['finalMin', 30, 15, 60, 'Final reserve fuel (minutes)'],
  ['win', 60, 30, 180, 'Weather window either side of ETD and ETA (minutes)'],
  ['destCig', 200, 0, 2000, 'Destination: lowest ceiling (ft)'],
  ['destVis', 800, 0, 5000, 'Destination: lowest visibility (m)'],
  ['altnCig', 600, 0, 3000, 'Alternate: lowest ceiling (ft)'],
  ['altnVis', 3000, 0, 9999, 'Alternate: lowest visibility (m)'],
  ['depCig', 200, 0, 2000, 'Departure: lowest ceiling without a takeoff alternate (ft)'],
  ['depVis', 800, 0, 5000, 'Departure: lowest visibility without a takeoff alternate (m)'],
  ['ageH', 12, 1, 48, 'Plan older than this at departure gets a remark (hours)'],
];
export const DEF_POLICY = { on: false, altn: true, ...Object.fromEntries(POLICY.map((x) => [x[0], x[1]])) };
export function cleanPolicy(b) {
  const o = b && typeof b === 'object' ? b : {}, out = { on: o.on === true, altn: o.altn !== false };
  for (const [k, def, lo, hi, label] of POLICY) {
    const v = o[k] == null || o[k] === '' ? def : +o[k];
    if (!Number.isFinite(v) || v < lo || v > hi) throw Object.assign(new Error(label + ': between ' + lo + ' and ' + hi), { status: 400 });
    out[k] = Math.round(v * 10) / 10;
  }
  return out;
}
export async function readPolicy(env) {
  const v = env && env.STORE ? await env.STORE.get(POLICY_KEY, 'json').catch(() => null) : null;
  try { return { ...cleanPolicy({ ...DEF_POLICY, ...(v && typeof v === 'object' ? v : {}) }), at: (v && v.at) || 0, by: (v && v.by) || '' }; } catch (e) { return { ...DEF_POLICY, at: 0, by: '' }; }
}

/* ---- the plan summary the EFB sends (SimBrief field names in brackets, see the EFB's dispPlan) ---- */
const num = (v, lo, hi) => { if (v == null || v === '') return null; const n = +v; return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null; };
const str = (v, n) => String(v == null ? '' : v).replace(/[^\w\- ./]/g, '').trim().slice(0, n);
const icao = (v) => { const s = String(v == null ? '' : v).trim().toUpperCase(); return /^[A-Z0-9]{4}$/.test(s) ? s : ''; };
export function cleanPlan(p) {
  if (!p || typeof p !== 'object') return null;
  const W = 2_000_000, T = 2e10, D = 30 * 3600;
  const o = {
    gen: num(p.gen, 1e9, T),                 // when SimBrief made it, unix s [params.time_generated]
    flight: str(p.flight, 12).toUpperCase(), // [general.icao_airline + general.flight_number]
    reg: str(p.reg, 10).toUpperCase(), type: str(p.type, 6).toUpperCase(),
    units: p.units === 'lbs' ? 'lbs' : 'kgs',
    /* fuel, in the plan's units [fuel.*] */
    taxi: num(p.taxi, 0, W), trip: num(p.trip, 0, W), cont: num(p.cont, 0, W), altn: num(p.altn, 0, W), fin: num(p.fin, 0, W),
    extra: num(p.extra, 0, W), etops: num(p.etops, 0, W), block: num(p.block, 0, W), tof: num(p.tof, 0, W), minTo: num(p.minTo, 0, W), tanks: num(p.tanks, 0, W),
    /* times: unix s, and lengths in s [times.*] */
    out: num(p.out, 1e9, T), on: num(p.on, 1e9, T), ete: num(p.ete, 0, D), txo: num(p.txo, 0, 7200),
    contT: num(p.contT, 0, D), finT: num(p.finT, 0, D), extraT: num(p.extraT, 0, D),
    /* weights [weights.*] */
    zfw: num(p.zfw, 0, W), mzfw: num(p.mzfw, 0, W), tow: num(p.tow, 0, W), mtow: num(p.mtow, 0, W), ldw: num(p.ldw, 0, W), mlw: num(p.mlw, 0, W),
    /* alternates [alternate (one or a list)], takeoff alternate [takeoff_altn] */
    alts: [...new Set((Array.isArray(p.alts) ? p.alts : []).map(icao).filter(Boolean))].slice(0, 4),
    toAlt: icao(p.toAlt), fl: num(p.fl, 0, 60000), etopsOn: p.etopsOn === true,
  };
  if (o.block == null && o.trip == null) return null;
  return o;
}
export const planKey = (p) => [p.gen, p.block, p.tow, p.alts.join('+')].join('|');

/* ---- TAFs (aviationweather.gov's decoded JSON) ---- */
const SM = 1609.344;
/* visibility in metres: '6+' (P6SM or 9999), 3, '1 1/2', '1/4' (statute miles) */
export function visM(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim(); if (/\+$/.test(s) || /^P/i.test(s)) return 10000;
  let n = 0;
  for (const part of s.split(/\s+/)) { const m = part.match(/^(\d+)\/(\d+)$/); if (m && +m[2]) n += +m[1] / +m[2]; else if (part !== '' && Number.isFinite(+part)) n += +part; else return null; }
  return Math.round(n * SM);
}
/* the ceiling in feet: the lowest broken or overcast layer, or the vertical visibility */
export function cigFt(f) {
  let c = Infinity;
  for (const cl of (f && f.clouds) || []) if (cl && /^(BKN|OVC|OVX)$/.test(String(cl.cover || '')) && Number.isFinite(+cl.base)) c = Math.min(c, +cl.base);
  if (f && f.vertVis != null && f.vertVis !== '' && Number.isFinite(+f.vertVis)) { const v = +f.vertVis; c = Math.min(c, v < 50 ? v * 100 : v); }
  return c;
}
const HZ = [[/TS/, 'thunderstorms'], [/FZ(RA|DZ|FG)/, 'freezing precipitation'], [/\+[A-Z]*SN/, 'heavy snow'], [/GR|GS/, 'hail'], [/FC/, 'funnel cloud'], [/[+]?(SS|DS)/, 'sand or dust storm'], [/SQ/, 'squalls']];
export function hazards(wx) {
  const out = new Set();
  for (const t of String(wx || '').toUpperCase().split(/\s+/)) { if (!t || /^VC/.test(t) && !/TS/.test(t)) continue; for (const [re, name] of HZ) if (re.test(t)) out.add(name); }
  return out;
}
/* the worst forecast in a time window (ms): prevailing (the TAF's base, FM and BECMG groups; BECMG counted from its
   start, so a change is counted on both sides of it) and temporary (TEMPO, PROB) apart. null when the TAF does not
   reach the window. */
export function tafWindow(taf, t0, t1) {
  if (!taf || !Array.isArray(taf.fcsts)) return null;
  const a = t0 / 1000, b = t1 / 1000, out = { cig: Infinity, vis: Infinity, hz: new Set(), tCig: Infinity, tVis: Infinity, tHz: new Set(), n: 0 };
  for (const f of taf.fcsts) {
    if (!f || !(+f.timeFrom < b && +f.timeTo > a)) continue;
    const temp = /TEMPO|PROB/i.test(String(f.fcstChange || '')) || (f.probability != null && f.probability !== ''), c = cigFt(f), v = visM(f.visib), hz = hazards(f.wxString);
    if (temp) { out.tCig = Math.min(out.tCig, c); if (v != null) out.tVis = Math.min(out.tVis, v); hz.forEach((x) => out.tHz.add(x)); }
    else { out.n++; out.cig = Math.min(out.cig, c); if (v != null) out.vis = Math.min(out.vis, v); hz.forEach((x) => out.hz.add(x)); }
  }
  return out.n ? out : null;
}
/* TAFs for some airports, one request: { ICAO: taf } (an airport with none is left out); null when it failed */
export async function fetchTafs(ids, fetcher = fetch) {
  const L = [...new Set(ids.filter((x) => /^[A-Z0-9]{4}$/.test(x)))]; if (!L.length) return {};
  try {
    const r = await fetcher('https://aviationweather.gov/api/data/taf?format=json&ids=' + L.join(','), { headers: { Accept: 'application/json', 'User-Agent': 'Polaris EFB' } });
    if (!r.ok) return null;
    const out = {};
    for (const t of (await r.json()) || []) { const k = String((t && t.icaoId) || '').toUpperCase(); if (k && (!out[k] || +t.issueTime > +out[k].issueTime || Date.parse(t.issueTime) > Date.parse(out[k].issueTime))) out[k] = t; }
    return out;
  } catch (e) { return null; }
}

/* ---- the check ---- */
const ft = (v) => (v === Infinity ? 'none' : Math.round(v) + ' ft'), m = (v) => (v === Infinity ? '10 km+' : v >= 9999 ? '10 km+' : Math.round(v) + ' m');
const hm = (t) => new Date(t).toISOString().slice(11, 16).replace(':', '') + 'Z';
const list = (s) => [...s].join(', ');
/* when the flight leaves and lands (ms): the booking's STD, else the plan's; landing from the plan's times */
export function flightTimes(ci, p) {
  const etd = (ci && ci.std) || (p.out ? p.out * 1000 : null);
  let eta = null;
  if (etd && p.ete) eta = etd + ((p.txo != null ? p.txo : 900) + p.ete) * 1000;
  else if (p.on) eta = p.on * 1000;
  else if (ci && ci.sta) eta = ci.sta;
  return { etd, eta };
}
/* -> { res: 'ok' | 'remarks' | 'hold' | 'fail', items: [{ k, sev: 'hard' | 'soft' | 'warn', t }], etd, eta }.
   wx: { ICAO: taf } or null (the weather could not be read) */
export function checkPlan(ci, p, wx, P, now = Date.now()) {
  const items = [], add = (k, sev, t) => items.push({ k, sev, t }), U = p.units === 'lbs' ? 'lb' : 'kg', n = (v) => Math.round(v).toLocaleString('en-US') + ' ' + U;
  const { etd, eta } = flightTimes(ci, p);
  /* the plan is the booking's */
  if (ci) {
    const fl = String(ci.callsign || ci.flight || '').replace(/\s+/g, '').toUpperCase(), fls = [ci.callsign, ci.flight].map((x) => String(x || '').replace(/\s+/g, '').toUpperCase()).filter(Boolean);
    if (p.flight && fls.length && !fls.includes(p.flight)) add('flight', 'warn', 'The plan is for ' + p.flight + '; the booking is ' + fl);
    if (p.reg && ci.registration && p.reg.replace(/-/g, '') !== String(ci.registration).toUpperCase().replace(/[\s-]/g, '')) add('reg', 'warn', 'The plan is for ' + p.reg + '; the booking is ' + String(ci.registration).toUpperCase());
  }
  if (p.gen && etd && etd - p.gen * 1000 > P.ageH * 3600_000) add('age', 'warn', 'The plan was made ' + Math.round((etd - p.gen * 1000) / 3600_000) + ' h before departure: winds and weather may have changed');
  /* weights */
  for (const [k, e, mx, name] of [['zfw', p.zfw, p.mzfw, 'Zero fuel weight'], ['tow', p.tow, p.mtow, 'Takeoff weight'], ['ldw', p.ldw, p.mlw, 'Landing weight']])
    if (e != null && mx != null && e > mx) add(k, 'hard', name + ' ' + n(e) + ' is over the limit of ' + n(mx));
  /* fuel */
  if (p.block == null) add('block', 'hard', 'The plan has no block fuel');
  else {
    if (p.minTo != null && p.block < p.minTo + (p.taxi || 0) - 1) add('minfuel', 'hard', 'Block fuel ' + n(p.block) + ' is less than the minimum takeoff fuel and taxi, ' + n(p.minTo + (p.taxi || 0)));
    if (p.tanks != null && p.tanks > 0 && p.block > p.tanks * 1.005) add('tanks', 'hard', 'Block fuel ' + n(p.block) + ' is more than the tanks hold, ' + n(p.tanks));
  }
  if (!p.fin) add('final', 'hard', 'The plan has no final reserve fuel');
  else if (p.finT != null && p.finT < P.finalMin * 60 - 30) add('final', 'hard', 'Final reserve is ' + Math.round(p.finT / 60) + ' min; the policy is ' + P.finalMin + ' min');
  if (p.trip != null && p.trip > 0) {
    const need = (P.contPct / 100) * p.trip, short = p.cont == null || p.cont < need * 0.98, shortT = p.contT != null && p.contT < P.contMin * 60 - 30;
    if (P.contPct > 0 && short) add('cont', 'soft', 'Contingency fuel ' + n(p.cont || 0) + ' is less than ' + P.contPct + '% of trip fuel (' + n(need) + ')');
    else if (P.contMin > 0 && shortT) add('cont', 'soft', 'Contingency fuel lasts ' + Math.round(p.contT / 60) + ' min; the policy is at least ' + P.contMin + ' min');
  }
  /* alternates */
  const dest = ci && ci.to, alts = p.alts.filter((x) => x !== dest);
  if (P.altn && !alts.length) add('altn', 'hard', 'The plan has no destination alternate');
  else if (alts.length && !p.altn) add('altnfuel', 'soft', 'The plan has no fuel to the alternate ' + alts[0]);
  /* the weather */
  if (wx == null) add('wx', 'warn', 'The forecasts could not be read: check the weather yourself');
  else {
    const w = P.win * MIN, at = (id, t) => (t ? tafWindow(wx[id], t - w, t + w) : null), soon = (t) => t && t - now < 30 * 3600_000;
    /* destination: under its planning minima, two alternates are needed; thunderstorms and the like, a remark */
    if (dest && eta) {
      const d = at(dest, eta);
      if (!wx[dest]) { if (alts.length < 2) add('desttaf', 'soft', 'No TAF for the destination ' + dest + ': plan a second alternate'); }
      else if (!d) add('desttaf', 'warn', 'The TAF for ' + dest + ' does not reach the ETA of ' + hm(eta) + ' yet: check again before departure');
      else {
        if ((d.cig < P.destCig || d.vis < P.destVis) && alts.length < 2) add('destwx', 'soft', dest + ' forecast below the destination minima around ' + hm(eta) + ' (ceiling ' + ft(d.cig) + ', visibility ' + m(d.vis) + '): plan a second alternate');
        else if (d.tCig < P.destCig || d.tVis < P.destVis) add('desttempo', 'warn', dest + ': TEMPO or PROB below minima around ' + hm(eta) + ' (ceiling ' + ft(d.tCig) + ', visibility ' + m(d.tVis) + ')');
        const hz = new Set([...d.hz, ...d.tHz]);
        if (hz.size) add('desthz', 'warn', dest + ': ' + list(hz) + ' forecast around ' + hm(eta) + (p.extraT != null && p.extraT < 15 * 60 ? ': consider extra fuel' : ''));
      }
    }
    /* alternates: at least one at or above the alternate minima */
    if (alts.length && eta) {
      const res = alts.map((id) => ({ id, taf: wx[id], d: at(id, eta + 45 * MIN) }));
      const good = res.filter((r) => r.d && r.d.cig >= P.altnCig && r.d.vis >= P.altnVis);
      if (!good.length) {
        const r = res[0];
        if (!r.taf) add('altntaf', 'soft', 'No TAF for the alternate ' + r.id + ': choose an alternate with a TAF');
        else if (!r.d) add('altntaf', soon(eta) ? 'soft' : 'warn', 'The TAF for ' + r.id + ' does not reach the time you could get there' + (soon(eta) ? '' : ' yet: check again before departure'));
        else add('altnwx', 'soft', r.id + ' forecast below the alternate minima (ceiling ' + ft(r.d.cig) + ', visibility ' + m(r.d.vis) + '; the policy is ' + P.altnCig + ' ft and ' + P.altnVis + ' m)');
      } else if (good[0].d.tCig < P.altnCig || good[0].d.tVis < P.altnVis) add('altntempo', 'warn', good[0].id + ': TEMPO or PROB below the alternate minima');
    }
    /* departure: below landing minima, a takeoff alternate */
    if (ci && ci.from && etd) {
      const d = at(ci.from, etd);
      if (d && (d.cig < P.depCig || d.vis < P.depVis) && !p.toAlt) add('toalt', 'soft', ci.from + ' forecast below landing minima around ' + hm(etd) + ' (ceiling ' + ft(d.cig) + ', visibility ' + m(d.vis) + '): plan a takeoff alternate');
      const hz = d ? new Set([...d.hz, ...d.tHz]) : new Set();
      if (hz.size) add('dephz', 'warn', ci.from + ': ' + list(hz) + ' forecast around ' + hm(etd));
    }
  }
  const has = (s) => items.some((x) => x.sev === s);
  return { res: has('hard') ? 'fail' : has('soft') ? 'hold' : has('warn') ? 'remarks' : 'ok', items, etd, eta };
}
export const released = (disp) => !!(disp && disp.rel);

/* ---- the release: an AOC message (wording: aoctpl.js 'rel') ---- */
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function releaseNo(ci, n, now = Date.now()) {
  const d = new Date((ci && ci.std) || now), fl = String((ci && (ci.callsign || ci.flight)) || 'PAW').replace(/\s+/g, '').toUpperCase();
  return fl + '/' + String(d.getUTCDate()).padStart(2, '0') + MON[d.getUTCMonth()] + '/R' + n;
}
export function releaseMsg(ci, p, disp, now = Date.now(), T = null) {
  const U = p.units === 'lbs' ? 'LB' : 'KG', n = (v) => (v == null ? '' : Math.round(v).toLocaleString('en-US')), d = new Date(now);
  const warn = disp.items.filter((x) => x.sev === 'warn'), soft = disp.items.filter((x) => x.sev === 'soft'), rmk = [];
  if (disp.capt) { rmk.push('CAPT DISCRETION:'); for (const x of soft) rmk.push('- ' + x.t); rmk.push('REASON: ' + disp.capt.reason); }
  if (warn.length) { rmk.push('REMARKS:'); for (const x of warn) rmk.push('- ' + x.t); }
  const vars = { RELNO: disp.rel ? disp.rel.no : '', TIME: hm(now), FLIGHT: String(ci.callsign || ci.flight || '').replace(/\s+/g, '').toUpperCase(),
    DATE: String(d.getUTCDate()).padStart(2, '0') + MON[d.getUTCMonth()], FROM: ci.from || '----', TO: ci.to || '----', ALTN: p.alts.filter((x) => x !== ci.to).join(' '),
    TOALT: p.toAlt, REG: p.reg || ci.registration || '', TYPE: p.type || ci.type || '', STD: disp.etd ? hm(disp.etd) : '', ETA: disp.eta ? hm(disp.eta) : '', UNITS: U,
    BLOCK: n(p.block), TRIP: n(p.trip), CONT: n(p.cont), ALTNF: n(p.altn), FINAL: n(p.fin), EXTRA: p.extra ? n(p.extra) : '', TAXI: n(p.taxi),
    REMARKS: rmk.length ? rmk.join('\n') : 'REMARKS NIL' };
  return aocMsg(T, 'rel', vars);
}

/* ---- the log (for /admin) ---- */
export async function logCheck(env, e) {
  const kv = env && env.STORE; if (!kv) return;
  try {
    const now = Date.now(), L = ((await kv.get(LOG_KEY, 'json').catch(() => null)) || []).filter((x) => x && now - x.t < LOG_DAYS * 86400_000 && !(x.bid === e.bid && x.u === e.u && x.key === e.key && x.res === e.res && !e.capt && !x.capt));
    L.unshift({ t: now, ...e, items: (e.items || []).slice(0, 12).map((x) => ({ sev: x.sev, t: String(x.t).slice(0, 200) })) });
    await kv.put(LOG_KEY, JSON.stringify(L.slice(0, LOG_MAX)));
  } catch (er) { console.warn('[dispatch log]', er && er.message); }
}

const jsonRes = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export async function dispatchAdmin(req, path, env, who) {
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503);
  try {
    if (path !== '/admin/api/dispatch') return jsonRes({ error: 'Not found' }, 404);
    if (req.method === 'GET') return jsonRes({ policy: await readPolicy(env), def: DEF_POLICY, fields: POLICY.map(([k, def, lo, hi, label]) => ({ k, def, lo, hi, label })), log: (await kv.get(LOG_KEY, 'json').catch(() => null)) || [] });
    if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405);
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) return jsonRes({ error: 'Send JSON' }, 415);
    let b = {}; try { b = await req.json(); } catch (e) {}
    const cur = await readPolicy(env), p = { ...cleanPolicy({ ...cur, ...(b.policy || {}) }), at: Date.now(), by: String(typeof who === 'string' ? who : (who && who.email) || '').slice(0, 120) };
    await kv.put(POLICY_KEY, JSON.stringify(p));
    return jsonRes({ ok: true, policy: p });
  } catch (e) { return jsonRes({ error: e.message || 'Error' }, e.status || 500); }
}
