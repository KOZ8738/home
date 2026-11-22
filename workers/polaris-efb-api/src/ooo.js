/* ---------- OOOI times and on-time performance ----------
   As an airline's ACARS reports OUT (off the gate), OFF (airborne), ON (landed) and IN (on the gate), the Worker writes
   down those four times for every Polaris flight it sees on vAMSYS or VATSIM, every 2 minutes (the same cron as the
   gate assignment, so a time is within about two minutes). A flight is compared with its schedule (the vAMSYS booking,
   as the pilot checked in to it in the EFB, or as the flight map gives it): a departure is on time within 15 minutes
   of STD (OUT), an arrival within 15 minutes of STA (IN), as the industry counts it. Staff see the figures on /admin
   (On-time tab) and can give a late flight its delay reason (the IATA delay code groups).

   KV (STORE):  ooo:v1:live -> { [cs:dep:arr]: { k, cs, pilot, cid, name, dep, arr, ac, src, first, out, off, on, in, std, sta, still, miss } }
                ooo:v1:log  -> [the same, finished, with reason] (90 days, at most 2000) */
const LIVE = 'ooo:v1:live', LOG = 'ooo:v1:log', KEEP_MS = 90 * 86400_000, GONE_MS = 10 * 60_000;
export const DELAY_REASONS = [
  ['', 'Not given'], ['pax', '11–19 Passengers and baggage'], ['cargo', '21–29 Cargo and mail'], ['ramp', '31–39 Aircraft and ramp handling'],
  ['tech', '41–48 Technical and aircraft equipment'], ['damage', '51–58 Damage and EDP failure'], ['ops', '61–69 Flight operations and crew'],
  ['wx', '71–79 Weather'], ['atc', '81–89 ATC, airport and government'], ['react', '91–96 Reactionary'], ['misc', '97–99 Miscellaneous'], ['sim', '00–09 Simulator or network'],
];
const jsonRes = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function readLive(kv) { const v = await kv.get(LIVE, 'json'); return v && typeof v === 'object' ? v : {}; }
async function readLog(kv) { const v = await kv.get(LOG, 'json'); return Array.isArray(v) ? v : []; }
const airborne = (f) => f.gs > 100 || (f.alt > 3000 && f.gs > 60);

/* one step of a flight: the stage only moves forward; returns true when something worth keeping changed */
export function oooStep(r, f, now) {
  const p = String(f.vphase || '').toLowerCase(), air = airborne(f), done = /arriv|block|park|deboard|shut|complete/.test(p);
  let ch = false; const set = (k, v) => { if (r[k] == null) { r[k] = v; ch = true; } };
  if (r.off == null) {                       // not airborne yet (off === 0: airborne, but first seen in the air)
    if (air) { r.off = r.out == null && now === r.first ? 0 : now; ch = true; }
    else if (f.gs >= 3 || (/push|taxi/.test(p) && !/in\b|arriv/.test(p))) set('out', now);
  } else if (r.on == null) {
    if (!air && f.gs < 90 && (r.off === 0 || now - r.off > 3 * 60_000)) set('on', now);
  } else if (r.in == null) {
    if (f.gs < 2 || done) { if (!r.still) { r.still = now; ch = true; } if (done || now - r.still >= 3 * 60_000) set('in', r.still); }
    else if (r.still) { r.still = 0; ch = true; }
  }
  return ch;
}
/* the minutes late (positive) or early of a departure / arrival, when both times are known */
export const late = (act, sched) => (act && sched ? Math.round((act - sched) / 60_000) : null);

/* every 2 minutes, with the Polaris flights the Live tab sees; deps.checkins() -> [{ u, to, std, sta, fl }].
   KV is written only when something changed (a new flight, a new time, a flight gone), never just to note "still here":
   a flight missing from the picture gets miss = the first tick it was missing, and is gone ten minutes after that. */
export async function oooWatch(env, live, deps, now = Date.now()) {
  const kv = env && env.STORE; if (!kv || !live) return { off: true };
  const L = await readLive(kv), here = new Set(), src = live.sources || {}; let changed = false, ci = null;
  for (const f of live.flights || []) {
    if (!f.cs || !f.arr) continue;
    const k = f.cs + ':' + (f.dep || '') + ':' + f.arr; here.add(k);
    let r = L[k];
    if (r && r.miss) { delete r.miss; changed = true; }
    if (r && r.tomb) continue;                   // finished, still on the map: not a new flight
    if (!r) { r = L[k] = { k, cs: f.cs, pilot: f.pilot || '', cid: f.cid ? String(f.cid) : '', name: f.name || '', dep: f.dep || '', arr: f.arr, ac: f.ac || '', src: f.src || '', first: now }; changed = true; }
    if (!r.pilot && f.pilot) { r.pilot = f.pilot; changed = true; }
    if (oooStep(r, f, now)) changed = true;
    /* the schedule: the flight map's booking times, else the pilot's EFB check-in (by pilot, or by callsign for a
       flight seen only on VATSIM). Looked for when the flight first shows and again when it leaves the gate, as a
       pilot may check in after connecting; both are ticks that write anyway. */
    if (!r.std && (r.schedTried || 0) < (r.out != null ? 2 : 1)) {
      const std = Date.parse(f.std || ''), sta = Date.parse(f.sta || '');
      if (isFinite(std)) { r.std = std; r.sta = isFinite(sta) ? sta : 0; }
      else if (deps && deps.checkins) {
        if (!ci) { try { ci = await deps.checkins(); } catch (e) { ci = []; } }
        const cs = (x) => String(x || '').toUpperCase().replace(/\s+/g, '');
        const c = ci.find((x) => ((r.pilot && x.u === r.pilot) || (x.fl && cs(x.fl) === r.cs)) && (!x.to || x.to === r.arr));
        if (c && c.std) { r.std = c.std; r.sta = c.sta || 0; if (!r.pilot) r.pilot = c.u; }
      }
      r.schedTried = r.out != null ? 2 : 1; changed = true;
    }
  }
  /* finished flights go to the log (a marker stays while the flight is still on the map); a flight gone for ten minutes
     after landing came in about when it went; one gone before landing is dropped. A source that did not answer this
     time (vAMSYS or VATSIM) does not make its flights missing. */
  const log = [];
  for (const [k, r] of Object.entries(L)) {
    const down = r.src === 'VATSIM' ? src.vatsim === false : src.vamsys === false;
    if (!here.has(k) && !r.miss && !down) { r.miss = now; changed = true; }
    const gone = !here.has(k) && r.miss && now - r.miss >= GONE_MS;
    if (r.tomb) { if (gone) { delete L[k]; changed = true; } continue; }
    if (r.in == null && !gone) continue;
    if (r.in == null && r.on) r.in = r.still || r.miss;
    if (r.on) { const { schedTried, still, miss, ...keep } = r; log.push({ ...keep, done: now }); }
    if (gone) delete L[k]; else L[k] = { k, tomb: 1 };
    changed = true;
  }
  if (log.length) { const old = await readLog(kv); await kv.put(LOG, JSON.stringify([...log, ...old].filter((r) => now - (r.in || r.done) < KEEP_MS).slice(0, 2000))); }
  if (changed) await kv.put(LIVE, JSON.stringify(L));
  return { live: Object.keys(L).length, logged: log.length };
}

/* ---- /admin: Reports (on-time performance) and Flight Watch (OOOI of the flights in progress) ---- */
export async function oooAdmin(req, url, path, env, who) {
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503);
  try {
    if (req.method === 'GET' && path === '/admin/api/ooo') return jsonRes({ live: Object.values(await readLive(kv)).filter((r) => !r.tomb), log: await readLog(kv), reasons: DELAY_REASONS, now: Date.now() });
    if (req.method === 'POST' && path === '/admin/api/ooo/reason') {
      if (!/application\/json/.test(req.headers.get('Content-Type') || '')) return jsonRes({ error: 'Send JSON' }, 415);
      let b; try { b = await req.json(); } catch (e) { return jsonRes({ error: 'Bad body' }, 400); }
      if (!DELAY_REASONS.some((x) => x[0] === b.reason)) return jsonRes({ error: 'Not a delay reason' }, 400);
      const log = await readLog(kv), r = log.find((x) => x.k === b.k && x.first === +b.first);
      if (r) { r.reason = b.reason; r.reasonBy = who; await kv.put(LOG, JSON.stringify(log)); return jsonRes({ ok: true }); }
      /* a flight still in progress (Flight Watch): the reason goes with it into the log when it parks */
      const L = await readLive(kv), x = L[b.k];
      if (!x || x.tomb || x.first !== +b.first) return jsonRes({ error: 'That flight is no longer listed' }, 404);
      x.reason = b.reason; x.reasonBy = who; await kv.put(LIVE, JSON.stringify(L));
      return jsonRes({ ok: true, live: true });
    }
    return jsonRes({ error: 'Not found' }, 404);
  } catch (e) { return jsonRes({ error: e.message || 'Error' }, e.status || 500); }
}
