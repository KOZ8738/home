/* ---------- Automatic stand assignment (AOC) ----------
   About half an hour before a Polaris flight lands, Polaris operations sends its crew the arrival gate as an AOC
   message (EFB › Flight › Messages; see aoc.js). Staff keep a gate plan per airport on /admin (Gates tab): rules in
   order, each a set of gates written as ranges ("D1-D10, C5, 201-215"), for domestic or international flights (or
   both), normal aircraft, heavies or both, with a terminal. A flight is domestic when both airports are in the same
   country (the United States with Hawaii, Alaska and its territories). The first gate of the first rule that fits the
   flight and is free is taken; when the airport's map (OpenStreetMap) is at hand, only gates on it are given, so a range
   that covers a number the airport does not have never sends a crew there. A stand is not free while
   a pilot on VATSIM sits on it (within 45 m of the stand on the OpenStreetMap airport map, at walking speed), or while
   another Polaris arrival has it within 45 minutes either side. Every 2 minutes (a cron) the Worker reads the Polaris
   flights in the air (vAMSYS ACARS, and PAW flights seen only on VATSIM, as the admin's Live tab), and sends one
   message per flight once the time to go falls under the lead time. Off until staff turn it on.

   KV (STORE):  stands:v1:plan -> { on, dep, ls, sig, inr, lead, miss: 'skip' | 'ground', apts: { ICAO: [{ stands, fl: 'all'|'dom'|'intl', ac: 'all'|'narrow'|'wide', term }] }, at, swAt, aptsAt, by }
                (ac: 'narrow' is shown as Normal, 'wide' as Heavy; swAt and aptsAt: when the switches and the gates last
                changed, at: when either did. A plan from before them reads at for both)
                stands:v1:log  -> [{ k, t, cs, dep, arr, ac, wide, fl, eta, stand, term, by, aoc, pilot, cid, name }] (two days) */
import { aocSend } from './aoc.js';
import { aocTpl, aocMsg } from './aoctpl.js';
import { PAW_APTS } from './live.js';
import { kvJson, plainObj } from './kvread.js';

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
/* a heavy needs a heavy gate; everything else Polaris flies (the A320 family) is normal. Heavy: a widebody, written
   any of the ways vAMSYS or a flight plan has it: ICAO ("A339", "A35K", "B77W"), IATA ("339", "351", "77W") or a
   name ("Airbus A330-900neo", "787-9") */
const WIDE_ANY = /(A30[0-9B]|A310|A33[0-9X]|A34[0-9]|A35[0-9K]|A38[0-9]|B74[0-9A-Z]|B76[0-9]|B77[0-9A-Z]|B78[0-9X]|MD11|DC10|IL96|IL86)/;
const WIDE_NUM = /^(30[0-9]|310|33[0-9X]|34[0-9]|35[0-9K]|38[0-9]|74[0-9A-Z]|76[0-9]|77[0-9A-Z]|78[0-9X])/;
export const isWide = (ac) => { const s = String(ac || '').toUpperCase().replace(/[\s-]+/g, '').replace(/^(AIRBUS|BOEING|MCDONNELLDOUGLAS)/, ''); return WIDE_ANY.test(s) || WIDE_NUM.test(s); };
/* a flight is heavy when any of what is known of its aircraft says so: vAMSYS's code and name, the VATSIM flight plan's
   type, or its wake category H or J (live.js). A normal aircraft fits a heavy gate; a heavy never a normal one */
export const isHeavy = (f) => !!f && (f.wake === 'H' || f.wake === 'J' || [f.ac, f.acName, f.fpAc].some(isWide));
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
   ls (final loadsheet before departure), sig (SIGMET on the route) and inr (arrival report at the gate), on unless turned off */
/* no plan yet: everything off and no gates. A storage error (or a plan that is not one) throws StandError 503: a save
   never merges into an empty plan read by mistake (kvread.js) */
const PLAN_DOWN = 'The gate plan is temporarily unavailable; please try again';
const SW_KEYS = ['on', 'dep', 'ls', 'sig', 'inr', 'lead', 'miss'];
const swOf = (o) => ({ on: !!o.on, dep: o.dep === true, ls: o.ls !== false, sig: o.sig !== false, inr: o.inr !== false, lead: o.lead || LEAD_DEF, miss: o.miss === 'ground' ? 'ground' : 'skip' });
const tOf = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
async function readPlan(kv) {
  const v = await kvJson(kv, PLAN, { shape: 'object', msg: PLAN_DOWN, Err: StandError }), o = v || {};
  if (o.apts != null && !plainObj(o.apts)) { console.warn('[stands] the stored gate plan is not a plan'); throw new StandError(503, PLAN_DOWN); }
  const at = tOf(o.at, 0);
  return { ...swOf(o), apts: o.apts || {}, at, swAt: tOf(o.swAt, at), aptsAt: tOf(o.aptsAt, at), by: o.by || '' };
}
/* the arrival gate AOC gave a flight in the last 12 hours: { stand, term } or null (the arrival report) */
export async function arrivalGate(env, cs, arr, now = Date.now()) {
  const kv = env && env.STORE; if (!kv) return null;
  const x = (await readLog(kv)).find((r) => r.kind !== 'dep' && r.cs === cs && r.arr === arr && now - r.t < 12 * 3600_000 && r.stand);
  return x ? { stand: x.stand, term: x.term || '' } : null;
}
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

/* stands at icao with a pilot on VATSIM parked on them now (norm refs; empty without the airport map or VATSIM) */
async function vatsimAt(icao, deps) {
  const on = new Set();
  try {
    const lay = deps && deps.layout ? await deps.layout(icao) : null, vs = deps && deps.vatsim ? await deps.vatsim() : null;
    if (lay && Array.isArray(lay.stands) && vs && Array.isArray(vs.rows)) {
      const ground = vs.rows.filter((r) => r[6] <= 5 && isFinite(r[3]) && isFinite(r[4]));
      for (const s of lay.stands) {
        if (!s.pt || !s.ref) continue;
        const [lon, lat] = s.pt;
        if (ground.some((r) => nmBetween(lat, lon, r[3], r[4]) * 1852 < OCC_M)) on.add(norm(s.ref));
      }
    }
  } catch (e) { /* no map or no VATSIM */ }
  return on;
}
/* stands at icao that are taken now: a pilot on VATSIM on it, or another Polaris arrival or departure around the
   same time (a departure's time is its STD) */
async function takenAt(icao, etaMs, log, deps, skipKey) {
  const taken = await vatsimAt(icao, deps);
  for (const x of log) if ((x.kind === 'dep' ? x.dep : x.arr) === icao && x.k !== skipKey && x.stand && Math.abs((x.eta || x.t) - etaMs) < GAP_MS) taken.add(norm(x.stand));
  return taken;
}
/* the stand for an aircraft at icao: { stand, term } | { none: 'noplan' | 'full' }. heavy: from isHeavy (else from ac) */
export async function pickStand(plan, icao, ac, etaMs, log, deps, skipKey, fl, heavy) {
  const H = heavy != null ? !!heavy : isWide(ac);
  const rules = (plan.apts[icao] || []).filter((r) => (r.ac === 'all' || !r.ac || (r.ac === 'wide') === H) && (!fl || !r.fl || r.fl === 'all' || r.fl === fl));
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
/* the two gate messages, from the wording set on /admin (aoctpl.js): { title, body } */
const termOf = (p) => (p.term ? p.term.replace(/^T(ERMINAL)?\s*(?=\w)/, '') : '');
const standMsg = (T, f, eta, p, chg) => aocMsg(T, 'gate', { CALLSIGN: f.cs, DEP: f.dep || '----', ARR: f.arr, ETA: z(eta), GATE: p.stand || '', TERMINAL: termOf(p) }, { none: !p.stand, chg });
const depMsg = (T, f, std, p, ac, chg) => aocMsg(T, 'dep', { CALLSIGN: f.cs, DEP: f.dep, ARR: f.arr || '----', STD: std ? z(std) : '', AIRCRAFT: ac || '', GATE: p.stand || '', TERMINAL: termOf(p) }, { none: !p.stand, chg });
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
    const eta = Math.round(now + Math.max(0, ttg) * 60_000), ac = f.ac || f.acName || f.fpAc || '', fl = flightType(f.dep, f.arr), heavy = isHeavy(f);
    const p = await pickStand(plan, f.arr, ac, eta, log, deps, null, fl, heavy);
    if (p.none === 'noplan' && plan.miss !== 'ground') continue;
    const m = await aocSend(env, { ...standMsg(await aocTpl(env), f, eta, p), to: crewOf(f), push: true, by: 'AUTO', auto: 'gate' });
    const rec = { k, t: now, cs: f.cs, dep: f.dep || '', arr: f.arr, ac, wide: heavy, fl, eta, stand: p.stand || '', term: p.term || '', by: 'AUTO', aoc: m.id, pilot: f.pilot || '', cid: f.cid ? String(f.cid) : '', name: f.name || '' };
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
  const ac = String(b.ac || '').toUpperCase(), fl = flightType(dep, arr), heavy = isHeavy({ ac });
  const p = await pickStand(plan, dep, ac, std, log, deps || {}, null, fl, heavy);
  if (p.none === 'noplan') return { none: 'noplan' };
  const f = { cs, dep, arr, pilot: b.pilot || '', cid: b.cid ? String(b.cid) : '', name: b.name || '' };
  const m = await aocSend(env, { ...depMsg(await aocTpl(env), f, b.std || 0, p, ac), to: crewOf(f), push: true, by: 'AUTO', auto: 'dep' });
  const rec = { k, kind: 'dep', t: now, cs, dep, arr, ac, wide: heavy, fl, eta: std, stand: p.stand || '', term: p.term || '', by: 'AUTO', aoc: m.id, pilot: f.pilot, cid: f.cid, name: f.name };
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
  return { on: !!b.on, dep: !!b.dep, ls: b.ls !== false, sig: b.sig !== false, inr: b.inr !== false, lead, miss: b.miss === 'ground' ? 'ground' : 'skip', apts };
}
/* POST /admin/api/stands: the plan has two halves, saved from two pages. Its switches (on, dep, ls, sig, inr, lead,
   miss) are Automatic messages', part: 'sw'; its gates (apts) are Gates', part: 'apts'. A part save changes only its
   half: the other is kept as KV has it now (read here, fresh; a read that fails refuses the save, 503), so one page
   never writes the other's back as it was when it opened. 'sw' is a patch: only the switches sent change. With no
   part, the whole plan (as before).
   base: the swAt (part 'sw'), aptsAt (part 'apts') or at (the whole plan) of the plan the page changed. When KV has
   moved on since (someone else saved that half), the save is refused, 409 { conflict: true, plan: the plan now },
   rather than lose their change; the other half moving on is no conflict. Without base, no check (older pages).
   lim (from the admin's roles): the half this person's role may not change is kept as it is (403 for a part save of it). */
async function savePlan(kv, b, who, lim) {
  if (!plainObj(b)) throw new StandError(400, 'Bad body');
  const part = b.part == null || b.part === '' ? '' : String(b.part);
  if (part && part !== 'sw' && part !== 'apts') throw new StandError(400, 'part is sw or apts');
  if (part === 'sw' && lim && lim.sw) throw new StandError(403, 'Your role cannot change the automatic messages');
  if (part === 'apts' && lim && lim.apts) throw new StandError(403, 'Your role cannot change gates');
  if (part === 'apts' && !plainObj(b.apts)) throw new StandError(400, 'Send the gates (apts)');
  const base = b.base == null || b.base === '' ? null : +b.base;
  if (base != null && !isFinite(base)) throw new StandError(400, 'Bad base');
  const cur = await readPlan(kv), seen = part === 'sw' ? cur.swAt : part === 'apts' ? cur.aptsAt : cur.at;
  if (base != null && base !== seen) {
    const what = part === 'sw' ? 'the automatic messages' : part === 'apts' ? 'the gate plan' : 'the plan';
    const error = cur.by && cur.by === who ? 'You changed ' + what + ' in another window meanwhile, so this change was not saved. The newer one is shown now: make this one again if it is still needed.'
      : 'Someone else' + (cur.by ? ' (' + cur.by + ')' : '') + ' changed ' + what + ' while you had it open, so yours was not saved. Their change is shown now: make yours again if it is still needed.';
    return jsonRes({ error, conflict: true, plan: cur }, 409);
  }
  /* a whole-plan save without gates keeps the gates (never an empty plan by omission) */
  const chSw = part !== 'apts' && !(lim && lim.sw), chApts = part !== 'sw' && !(lim && lim.apts) && plainObj(b.apts);
  const sent = part === 'sw' ? Object.fromEntries(SW_KEYS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]])) : b;
  const src = { ...swOf(cur), ...(chSw ? sent : {}), apts: chApts ? b.apts : cur.apts };
  /* later than the plan it replaces, even within the same millisecond, so a base always tells two saves apart */
  const now = Math.max(Date.now(), cur.at + 1, cur.swAt + 1, cur.aptsAt + 1);
  const p = { ...cleanPlan(src), at: now, swAt: chSw ? now : cur.swAt, aptsAt: chApts ? now : cur.aptsAt, by: who };
  await kv.put(PLAN, JSON.stringify(p));
  return jsonRes({ ok: true, plan: p });
}
export async function standsAdmin(req, url, path, env, who, deps, lim) {
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503);
  try {
    if (req.method === 'GET' && path === '/admin/api/stands') return jsonRes({ plan: await readPlan(kv), log: await readLog(kv), apts: PAW_APTS, now: Date.now() });
    /* the Gates page's airport map: the stands with a pilot on VATSIM on them now */
    if (req.method === 'GET' && path === '/admin/api/stands/busy') {
      const I = String(url.searchParams.get('icao') || '').toUpperCase(); if (!okIcao(I)) throw new StandError(400, 'Pick an airport');
      return jsonRes({ icao: I, vat: [...(await vatsimAt(I, deps))], at: Date.now() });
    }
    if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405);
    /* same-origin only: the admin page posts as JSON, which a form on another site cannot send */
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new StandError(415, 'Send JSON');
    let b; try { b = await req.json(); } catch (e) { throw new StandError(400, 'Bad body'); }
    if (path === '/admin/api/stands') return await savePlan(kv, b, who, lim);
    /* which stand a flight would get now (nothing is sent) */
    if (path === '/admin/api/stands/try') {
      const I = String(b.icao || '').toUpperCase(); if (!okIcao(I)) throw new StandError(400, 'Pick an airport');
      const plan = b.apts ? { ...cleanPlan({ ...b, lead: LEAD_DEF }) } : await readPlan(kv);
      /* heavy as asked (the Gates page's preview), or from the flight's aircraft (Flight Watch) */
      const heavy = b.wide != null ? !!b.wide : isHeavy({ ac: line(b.ac, 40), acName: line(b.acName, 60), fpAc: line(b.fpAc, 40), wake: line(b.wake, 1).toUpperCase() });
      const fl = ['dom', 'intl'].includes(b.fl) ? b.fl : b.dep && b.arr ? flightType(String(b.dep).toUpperCase(), String(b.arr).toUpperCase()) : '';
      return jsonRes({ ...(await pickStand(plan, I, '', Date.now() + 30 * 60_000, await readLog(kv), deps, null, fl, heavy)), heavy });
    }
    /* staff give a flight its gate by hand (Flight Watch), when none was sent: the gate written, or the plan's first
       free one; the crew get GATE ASSIGNMENT (arrival) or DEPARTURE GATE */
    if (path === '/admin/api/stands/assign') {
      const up = (v, n) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n);
      const kind = b.kind === 'dep' ? 'dep' : 'arr', cs = up(b.cs, 10), dep = up(b.dep, 4), arr = up(b.arr, 4), icao = kind === 'dep' ? dep : arr;
      if (!/^[A-Z0-9]{2,10}$/.test(cs)) throw new StandError(400, 'Bad callsign');
      if (!okIcao(icao)) throw new StandError(400, 'The flight has no ' + (kind === 'dep' ? 'departure' : 'arrival') + ' airport');
      const log = await readLog(kv), k = kind === 'dep' ? 'dep:' + cs + ':' + dep : cs + ':' + arr, now = Date.now();
      const ac = line(b.ac, 8).toUpperCase(), heavy = isHeavy({ ac, acName: line(b.acName, 60), fpAc: line(b.fpAc, 40), wake: line(b.wake, 1).toUpperCase() }), eta = +b.eta > now - 6 * 3600_000 && +b.eta < now + 24 * 3600_000 ? Math.round(+b.eta) : now + (kind === 'dep' ? 3600_000 : 30 * 60_000);
      let stand = line(b.stand, 8).toUpperCase().replace(/\s+/g, ''), term = line(b.term, 20).toUpperCase();
      if (!stand) {
        const p = await pickStand(await readPlan(kv), icao, ac, eta, log, deps || {}, k, flightType(dep, arr), heavy);
        if (!p.stand) throw new StandError(400, p.none === 'full' ? 'Every gate in the plan at ' + icao + ' is taken: write one' : 'No gate plan for ' + icao + ': write the gate');
        stand = p.stand; term = p.term || '';
      }
      if (!/^[A-Z0-9]{1,8}$/.test(stand)) throw new StandError(400, 'Write the gate');
      const f = { cs, dep, arr, pilot: up(b.pilot, 12), cid: String(b.cid || '').replace(/\D/g, '').slice(0, 9), name: line(b.name, 60) };
      const T = await aocTpl(env), m = await aocSend(env, { ...(kind === 'dep' ? depMsg(T, f, eta, { stand, term }, ac) : standMsg(T, f, eta, { stand, term })), to: crewOf(f), push: true, by: who });
      const rec = { k, ...(kind === 'dep' ? { kind: 'dep' } : {}), t: now, cs, dep, arr, ac, wide: heavy, fl: flightType(dep, arr), eta, stand, term, by: who, aoc: m.id, pilot: f.pilot, cid: f.cid, name: f.name };
      log.unshift(rec); await writeLog(kv, log);
      return jsonRes({ ok: true, rec });
    }
    /* staff move an assignment to another stand: the crew get a STAND CHANGE */
    if (path === '/admin/api/stands/change') {
      const log = await readLog(kv), x = log.find((r) => r.k === b.k && r.t === +b.t); if (!x) throw new StandError(404, 'That assignment is no longer listed');
      const stand = line(b.stand, 8).toUpperCase().replace(/\s+/g, ''); if (!/^[A-Z0-9]{1,8}$/.test(stand)) throw new StandError(400, 'Write the new gate');
      const term = b.term != null ? line(b.term, 20).toUpperCase() : x.term;
      const f = { cs: x.cs, dep: x.dep, arr: x.arr, pilot: x.pilot, cid: x.cid, name: x.name };
      const T = await aocTpl(env), m = await aocSend(env, { ...(x.kind === 'dep' ? depMsg(T, f, x.eta, { stand, term }, x.ac, true) : standMsg(T, f, x.eta, { stand, term }, true)), to: crewOf(f), push: true, by: who });
      Object.assign(x, { stand, term, by: who, aoc: m.id, changed: Date.now() }); await writeLog(kv, log);
      return jsonRes({ ok: true, rec: x });
    }
    return jsonRes({ error: 'Not found' }, 404);
  } catch (e) { return jsonRes({ error: e.message || 'Error' }, e.status || 500); }
}
