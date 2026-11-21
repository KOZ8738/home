/* ---------- Automatic stand assignment (AOC) ----------
   About half an hour before a Polaris flight lands, Polaris operations sends its crew the arrival gate as an AOC
   message (EFB › Flight › Messages; see aoc.js). Staff keep a gate plan per airport on /admin (Gates tab): rules in
   order, each a set of gates written as ranges ("D1-D10, C5, 201-215"), for domestic or international flights (or
   both), narrowbodies, widebodies or both, with a terminal. A flight is domestic when both airports are in the same
   country (the United States with Hawaii, Alaska and its territories). The first gate of the first rule that fits the
   flight and is free is taken; when the airport's map (OpenStreetMap) is at hand, only gates on it are given, so a range
   that covers a number the airport does not have never sends a crew there. A stand is not free while
   a pilot on VATSIM sits on it (within 45 m of the stand on the OpenStreetMap airport map, at walking speed), or while
   another Polaris arrival has it within 45 minutes either side. Every 2 minutes (a cron) the Worker reads the Polaris
   flights in the air (vAMSYS ACARS, and PAW flights seen only on VATSIM, as the admin's Live tab), and sends one
   message per flight once the time to go falls under the lead time. Off until staff turn it on.

   KV (STORE):  stands:v1:plan -> { on, lead, miss: 'skip' | 'ground', apts: { ICAO: [{ stands, fl: 'all'|'dom'|'intl', ac: 'all'|'narrow'|'wide', term }] }, at, by }
                stands:v1:log  -> [{ k, t, cs, dep, arr, ac, wide, fl, eta, stand, term, by, aoc, pilot, cid, name }] (two days) */
import { aocSend } from './aoc.js';
import { PAW_APTS } from './live.js';

class StandError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const PLAN = 'stands:v1:plan', LOG = 'stands:v1:log', LEAD_DEF = 30, GAP_MS = 45 * 60_000, OCC_M = 45, RULES_MAX = 20, STANDS_MAX = 300;
const jsonRes = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const line = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const z = (t) => { const d = new Date(t); return String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + 'Z'; };

/* "D1-D10, C5, 201-215, 31L" -> ['D1', …, 'D10', 'C5', '201', …, '215', '31L'] in that order */
export function expandStands(text) {
  const out = [], seen = new Set(), bad = [];
  const add = (s) => { if (!seen.has(s) && out.length < STANDS_MAX) { seen.add(s); out.push(s); } };
  for (let part of String(text || '').toUpperCase().split(/[,;\n]+/)) {
    part = part.replace(/\s+/g, ''); if (!part) continue;
    const m = part.match(/^([A-Z]*)(\d+)([A-Z]*)[-–~]([A-Z]*)(\d+)([A-Z]*)$/);
    if (m) {
      const [, p1, a, s1, p2, b, s2] = m;
      if ((p2 && p2 !== p1) || (s2 && s2 !== s1) || +b < +a || +b - +a > 200) { bad.push(part); continue; }
      const w = a.length > 1 && a[0] === '0' ? a.length : 0; // D01-D10 keeps its zero
      for (let n = +a; n <= +b; n++) add(p1 + (w ? String(n).padStart(w, '0') : String(n)) + s1);
    } else if (/^[A-Z0-9]{1,8}$/.test(part)) add(part);
    else bad.push(part);
  }
  return { stands: out, bad };
}
/* a widebody needs a widebody stand; everything else Polaris flies (A320 family) is a narrowbody */
export const isWide = (ac) => /(A30\d|A310|A33\d|A34\d|A35\d|A38\d|B74\d|B76\d|B77\d|B78\d|B74|B76|B77|B78|74[78]|767|77[7W]|78[789]|MD11|DC10|IL96)/.test(String(ac || '').toUpperCase().replace(/[\s-]+/g, ''));
/* the country an airport is in, from its ICAO code: enough to tell a domestic flight from an international one */
const US = /^(K|P[AHGFJKMOPW]|TJ|TI)/, RU = /^U[EHILNORSUW]/, BR = /^S[BDNSW]/, IN = /^V[AEIO]/, ID = /^W[AIQR]/, CN = /^Z[BGHJLPSUWY]/;
export function countryOf(icao) {
  const s = String(icao || '').toUpperCase(); if (!/^[A-Z][A-Z0-9]{3}$/.test(s)) return '';
  if (US.test(s)) return 'US'; if (s[0] === 'C') return 'CA'; if (s[0] === 'Y') return 'AU'; if (RU.test(s)) return 'RU'; if (BR.test(s)) return 'BR';
  if (IN.test(s)) return 'IN'; if (ID.test(s)) return 'ID'; if (CN.test(s)) return 'CN'; if (/^R[JO]/.test(s)) return 'JP';
  return s.slice(0, 2);
}
/* 'dom' | 'intl' | '' (a flight with no departure airport known) */
export function flightType(dep, arr) { const a = countryOf(dep), b = countryOf(arr); return a && b ? (a === b ? 'dom' : 'intl') : ''; }
const norm = (r) => String(r || '').toUpperCase().replace(/^(GATE|STAND|STAND NO\.?|GATE NO\.?)\s*/, '').replace(/\s+/g, '').replace(/(^|[A-Z])0+(\d)/g, '$1$2');
const nmBetween = (a, b, c, d) => { const R = 3440.065, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); };

/* ---- storage ---- */
/* the plan also holds the other automatic AOC switches: dep (departure gate at check-in, off unless turned on),
   ls (final loadsheet before departure) and sig (SIGMET on the route), both on unless turned off */
async function readPlan(kv) { const v = await kv.get(PLAN, 'json'), o = v && typeof v === 'object' ? v : {}; return { on: !!o.on, dep: o.dep === true, ls: o.ls !== false, sig: o.sig !== false, lead: o.lead || LEAD_DEF, miss: o.miss === 'ground' ? 'ground' : 'skip', apts: o.apts || {}, at: o.at || 0, by: o.by || '' }; }
export const autoPlan = (env) => (env && env.STORE ? readPlan(env.STORE) : Promise.resolve(null));
async function readLog(kv) { const v = await kv.get(LOG, 'json'); return Array.isArray(v) ? v : []; }
async function writeLog(kv, list) { const since = Date.now() - 2 * 86400_000; await kv.put(LOG, JSON.stringify(list.filter((x) => x.t > since).sort((a, b) => b.t - a.t).slice(0, 300))); }

/* minutes until this flight lands, or null when it is not in the air */
export function minutesToGo(f, apts, now) {
  if (!(f.gs > 100) || !(f.alt > 1500)) return null;
  if (f.remain != null && isFinite(f.remain) && f.remain >= 0) return (f.remain / f.gs) * 60 + 4; // vAMSYS: along the route, plus a slower approach
  const e = Date.parse(f.eta || ''); if (isFinite(e) && e > now - 600_000 && e < now + 20 * 3600_000) return (e - now) / 60_000;
  const a = apts && apts[f.arr]; if (!a || !isFinite(f.lat) || !isFinite(f.lon)) return null;
  return (nmBetween(f.lat, f.lon, a[0], a[1]) / f.gs) * 60 + 8; // VATSIM only: a straight line is short of the real route
}

/* stands at icao that are taken now: a pilot on VATSIM on it, or another Polaris arrival or departure around the
   same time (a departure's time is its STD) */
async function takenAt(icao, etaMs, log, deps, skipKey) {
  const taken = new Set();
  for (const x of log) if ((x.kind === 'dep' ? x.dep : x.arr) === icao && x.k !== skipKey && x.stand && Math.abs((x.eta || x.t) - etaMs) < GAP_MS) taken.add(norm(x.stand));
  try {
    const lay = deps.layout ? await deps.layout(icao) : null, vs = deps.vatsim ? await deps.vatsim() : null;
    if (lay && Array.isArray(lay.stands) && vs && Array.isArray(vs.rows)) {
      const ground = vs.rows.filter((r) => r[6] <= 5 && isFinite(r[3]) && isFinite(r[4]));
      for (const s of lay.stands) {
        if (!s.pt || !s.ref) continue;
        const [lon, lat] = s.pt;
        if (ground.some((r) => nmBetween(lat, lon, r[3], r[4]) * 1852 < OCC_M)) taken.add(norm(s.ref));
      }
    }
  } catch (e) { /* no map or no VATSIM: the Polaris arrivals still count */ }
  return taken;
}
/* the stand for an aircraft at icao: { stand, term } | { none: 'noplan' | 'full' } */
export async function pickStand(plan, icao, ac, etaMs, log, deps, skipKey, fl) {
  const rules = (plan.apts[icao] || []).filter((r) => (r.ac === 'all' || !r.ac || (r.ac === 'wide') === isWide(ac)) && (!fl || !r.fl || r.fl === 'all' || r.fl === fl));
  if (!rules.length) return { none: 'noplan' };
  const taken = await takenAt(icao, etaMs, log, deps, skipKey);
  /* a range may cover numbers the airport does not have (D1-D14 without D13): with the airport map, only the gates on it */
  let onMap = null; try { const lay = deps && deps.layout ? await deps.layout(icao) : null; if (lay && Array.isArray(lay.stands) && lay.stands.length) onMap = new Set(lay.stands.map((x) => norm(x.ref)).filter(Boolean)); } catch (e) { /* no map: the list as written */ }
  for (const r of rules) {
    let L = expandStands(r.stands).stands;
    if (onMap && L.some((x) => onMap.has(norm(x)))) L = L.filter((x) => onMap.has(norm(x)));
    for (const s of L) if (!taken.has(norm(s))) return { stand: s, term: r.term || '' };
  }
  return { none: 'full' };
}
const standText = (f, eta, p) => [`${f.cs} ${f.dep || '----'}-${f.arr} ETA ${z(eta)}`, p.stand ? `GATE ${p.stand}${p.term ? '  TERMINAL ' + p.term.replace(/^T(ERMINAL)?\s*(?=\w)/, '') : ''}` : 'GATE: CONTACT GROUND ON ARRIVAL', 'IF ATC ASSIGNS ANOTHER GATE, FOLLOW ATC'].join('\n');
const depText = (f, std, p, ac) => [`${f.cs} ${f.dep}-${f.arr || '----'}${std ? ' STD ' + z(std) : ''}${ac ? '  ' + ac : ''}`, p.stand ? `DEPARTURE GATE ${p.stand}${p.term ? '  TERMINAL ' + p.term.replace(/^T(ERMINAL)?\s*(?=\w)/, '') : ''}` : 'NO PLANNED GATE IS FREE AROUND YOUR DEPARTURE: USE ANY FREE GATE', 'IF THE GATE IS TAKEN WHEN YOU SET UP, USE A FREE GATE NEARBY AND TELL GROUND'].join('\n');
const crewOf = (f) => ({ crew: 1, cs: f.cs, m: f.pilot || f.cid ? [{ pilot: f.pilot || '', cid: f.cid ? String(f.cid) : '', name: f.name && f.name !== f.pilot ? f.name : '' }] : [] });

/* every 2 minutes: deps = { live() -> liveFlights answer, vatsim() -> VATSIM rows, layout(icao) -> cached airport map } */
export async function standWatch(env, deps) {
  const kv = env && env.STORE; if (!kv) return { off: true };
  const plan = deps.plan || (await readPlan(kv)); if (!plan.on) return { off: true };
  const live = await deps.live(), now = Date.now(), log = await readLog(kv), sent = [];
  const apts = {}; for (const [k, v] of Object.entries((live && live.apts) || {})) apts[k] = v;
  for (const f of (live && live.flights) || []) {
    if (!f.cs || !f.arr || !/^[A-Z0-9]{3,4}$/.test(f.arr)) continue;
    const k = f.cs + ':' + f.arr;
    if (log.some((x) => x.k === k && now - x.t < 12 * 3600_000)) continue; // once a flight (a diversion is a new arrival airport)
    const ttg = minutesToGo(f, apts, now); if (ttg == null || ttg > plan.lead) continue;
    const eta = Math.round(now + Math.max(0, ttg) * 60_000), ac = f.ac || f.acName || '', fl = flightType(f.dep, f.arr);
    const p = await pickStand(plan, f.arr, ac, eta, log, deps, null, fl);
    if (p.none === 'noplan' && plan.miss !== 'ground') continue;
    const m = await aocSend(env, { title: 'GATE ASSIGNMENT', body: standText(f, eta, p), to: crewOf(f), push: true, by: 'AUTO' });
    const rec = { k, t: now, cs: f.cs, dep: f.dep || '', arr: f.arr, ac, wide: isWide(ac), fl, eta, stand: p.stand || '', term: p.term || '', by: 'AUTO', aoc: m.id, pilot: f.pilot || '', cid: f.cid ? String(f.cid) : '', name: f.name || '' };
    log.unshift(rec); sent.push(rec);
  }
  if (sent.length) await writeLog(kv, log);
  return { sent };
}

/* when a pilot checks in for a flight in the EFB: a gate at the departure airport from the plan, as an AOC to the
   crew (staff turn this on on /admin). b = { cs, dep, arr, ac, std, pilot, name } */
export async function departureGate(env, b, deps, now = Date.now()) {
  const kv = env && env.STORE; if (!kv) return null;
  const plan = await readPlan(kv); if (!plan.dep) return { off: true };
  const cs = String(b.cs || '').replace(/\s+/g, '').toUpperCase(), dep = String(b.dep || '').toUpperCase(), arr = String(b.arr || '').toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(cs) || !okIcao(dep)) return null;
  const std = b.std && b.std > now - 3600_000 ? b.std : now + 3600_000, k = 'dep:' + cs + ':' + dep, log = await readLog(kv);
  if (log.some((x) => x.k === k && Math.abs((x.eta || x.t) - std) < 6 * 3600_000)) return { dup: true }; // once a departure
  const ac = String(b.ac || '').toUpperCase(), fl = flightType(dep, arr);
  const p = await pickStand(plan, dep, ac, std, log, deps || {}, null, fl);
  if (p.none === 'noplan') return { none: 'noplan' };
  const f = { cs, dep, arr, pilot: b.pilot || '', cid: b.cid ? String(b.cid) : '', name: b.name || '' };
  const m = await aocSend(env, { title: 'DEPARTURE GATE', body: depText(f, b.std || 0, p, ac), to: crewOf(f), push: true, by: 'AUTO' });
  const rec = { k, kind: 'dep', t: now, cs, dep, arr, ac, wide: isWide(ac), fl, eta: std, stand: p.stand || '', term: p.term || '', by: 'AUTO', aoc: m.id, pilot: f.pilot, cid: f.cid, name: f.name };
  log.unshift(rec); await writeLog(kv, log);
  return rec;
}

/* ---- /admin, Stands tab ---- */
const okIcao = (s) => /^[A-Z0-9]{4}$/.test(s);
function cleanPlan(b) {
  const lead = Math.round(+b.lead); if (!(lead >= 10 && lead <= 90)) throw new StandError(400, 'Send between 10 and 90 minutes before landing');
  const apts = {};
  for (const [icao, rules] of Object.entries(b.apts || {})) {
    const I = String(icao).toUpperCase(); if (!okIcao(I)) throw new StandError(400, 'Not an airport: ' + icao);
    if (!Array.isArray(rules)) continue;
    const R = [];
    for (const r of rules.slice(0, RULES_MAX)) {
      const stands = line(r && r.stands, 600); if (!stands) continue;
      const e = expandStands(stands); if (e.bad.length) throw new StandError(400, I + ': cannot read "' + e.bad[0] + '" (write gates like D1-D10, C5)');
      R.push({ stands, fl: ['dom', 'intl'].includes(r.fl) ? r.fl : 'all', ac: ['narrow', 'wide'].includes(r.ac) ? r.ac : 'all', term: line(r.term, 20).toUpperCase() });
    }
    if (R.length) apts[I] = R;
  }
  return { on: !!b.on, dep: !!b.dep, ls: b.ls !== false, sig: b.sig !== false, lead, miss: b.miss === 'ground' ? 'ground' : 'skip', apts };
}
export async function standsAdmin(req, url, path, env, who, deps) {
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503);
  try {
    if (req.method === 'GET' && path === '/admin/api/stands') return jsonRes({ plan: await readPlan(kv), log: await readLog(kv), apts: PAW_APTS, now: Date.now() });
    if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405);
    /* same-origin only: the admin page posts as JSON, which a form on another site cannot send */
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new StandError(415, 'Send JSON');
    let b; try { b = await req.json(); } catch (e) { throw new StandError(400, 'Bad body'); }
    if (path === '/admin/api/stands') { const p = { ...cleanPlan(b), at: Date.now(), by: who }; await kv.put(PLAN, JSON.stringify(p)); return jsonRes({ ok: true, plan: p }); }
    /* which stand a flight would get now (nothing is sent) */
    if (path === '/admin/api/stands/try') {
      const I = String(b.icao || '').toUpperCase(); if (!okIcao(I)) throw new StandError(400, 'Pick an airport');
      const plan = b.apts ? { ...cleanPlan({ ...b, lead: LEAD_DEF }) } : await readPlan(kv);
      return jsonRes(await pickStand(plan, I, b.wide ? 'A359' : 'A21N', Date.now() + 30 * 60_000, await readLog(kv), deps, null, ['dom', 'intl'].includes(b.fl) ? b.fl : ''));
    }
    /* staff move an assignment to another stand: the crew get a STAND CHANGE */
    if (path === '/admin/api/stands/change') {
      const log = await readLog(kv), x = log.find((r) => r.k === b.k && r.t === +b.t); if (!x) throw new StandError(404, 'That assignment is no longer listed');
      const stand = line(b.stand, 8).toUpperCase().replace(/\s+/g, ''); if (!/^[A-Z0-9]{1,8}$/.test(stand)) throw new StandError(400, 'Write the new gate');
      const term = b.term != null ? line(b.term, 20).toUpperCase() : x.term;
      const f = { cs: x.cs, dep: x.dep, arr: x.arr, pilot: x.pilot, cid: x.cid, name: x.name };
      const m = x.kind === 'dep' ? await aocSend(env, { title: 'DEPARTURE GATE CHANGE', body: depText(f, x.eta, { stand, term }, x.ac), to: crewOf(f), push: true, by: who })
        : await aocSend(env, { title: 'GATE CHANGE', body: standText(f, x.eta, { stand, term }), to: crewOf(f), push: true, by: who });
      Object.assign(x, { stand, term, by: who, aoc: m.id, changed: Date.now() }); await writeLog(kv, log);
      return jsonRes({ ok: true, rec: x });
    }
    return jsonRes({ error: 'Not found' }, 404);
  } catch (e) { return jsonRes({ error: e.message || 'Error' }, e.status || 500); }
}
