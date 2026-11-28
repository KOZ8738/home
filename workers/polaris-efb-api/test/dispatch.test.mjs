/* The automatic dispatch release (src/dispatch.js) and its place in check-in (src/crew.js): plain Node 22, no npm
   packages (node:sqlite stands in for the Durable Object's SQLite):
     node workers/polaris-efb-api/test/dispatch.test.mjs
   The TAFs are aviationweather.gov's decoded JSON in the shape it sends (taken from RCTP, RJAA and KSFO, Nov 2026). */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { visM, cigFt, hazards, tafWindow, checkPlan, cleanPlan, cleanPolicy, DEF_POLICY, planKey, releaseNo, releaseMsg, fetchTafs } from '../src/dispatch.js';

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('ok', n, name); };

const H = 3600, T0 = Date.UTC(2026, 10, 29, 6, 0) / 1000; // 0600Z
const P = { ...DEF_POLICY, on: true };
/* a TAF valid T0-6h .. T0+24h: base and groups as aviationweather.gov decodes them */
const taf = (id, base, groups = []) => ({ icaoId: id, issueTime: '2026-11-29T00:00:00.000Z', validTimeFrom: T0 - 6 * H, validTimeTo: T0 + 24 * H, rawTAF: 'TAF ' + id,
  fcsts: [{ timeFrom: T0 - 6 * H, timeTo: T0 + 24 * H, fcstChange: null, probability: null, visib: '6+', wxString: null, vertVis: null, clouds: [{ cover: 'FEW', base: 3000 }], ...base }, ...groups] });
const good = (id) => taf(id, {});
/* the booking checked in to, and a plan that meets the policy: RCTP 0600Z -> RJAA, about 3 h, alternate RJTT */
const ci = { bookingId: '901', flight: 'PAW102', callsign: 'PAW102', from: 'RCTP', to: 'RJAA', std: T0 * 1000, sta: (T0 + 3.5 * H) * 1000, registration: 'B-58201', type: 'A359' };
const plan = (o = {}) => cleanPlan({ gen: T0 - 2 * H, flight: 'PAW102', reg: 'B-58201', type: 'A359', units: 'kgs',
  taxi: 600, trip: 18000, cont: 900, altn: 3200, fin: 2700, extra: 500, block: 25900, tof: 25300, minTo: 24800, tanks: 110000,
  out: T0, ete: 3 * H, txo: 900, contT: 8 * 60, finT: 30 * 60, extraT: 5 * 60,
  zfw: 170000, mzfw: 195700, tow: 195300, mtow: 280000, ldw: 177300, mlw: 207000, alts: ['RJTT'], toAlt: '', fl: 39000, ...o });
const wxAll = () => ({ RCTP: good('RCTP'), RJAA: good('RJAA'), RJTT: good('RJTT'), RJBB: good('RJBB') });
const keys = (r, sev) => r.items.filter((x) => !sev || x.sev === sev).map((x) => x.k).sort();

await test('visibility in metres and the ceiling from the decoded TAF', () => {
  assert.equal(visM('6+'), 10000); assert.equal(visM('P6SM'), 10000); assert.equal(visM(3), 4828); assert.equal(visM('1 1/2'), 2414); assert.equal(visM('1/4'), 402);
  assert.equal(visM(''), null); assert.equal(visM(null), null); assert.equal(visM('abc'), null);
  assert.equal(cigFt({ clouds: [{ cover: 'FEW', base: 1500 }, { cover: 'BKN', base: 3200 }, { cover: 'OVC', base: 8000 }] }), 3200);
  assert.equal(cigFt({ clouds: [{ cover: 'SCT', base: 1000 }] }), Infinity);
  assert.equal(cigFt({ clouds: [], vertVis: 1 }), 100);   // VV001
  assert.equal(cigFt({ clouds: [], vertVis: 200 }), 200);
  assert.deepEqual([...hazards('-TSRA BR')], ['thunderstorms']);
  assert.deepEqual([...hazards('FZRA')], ['freezing precipitation']);
  assert.deepEqual([...hazards('VCSH')], []);          // showers nearby: nothing
  assert.deepEqual([...hazards('VCTS')], ['thunderstorms']);
  assert.deepEqual([...hazards('+SHSN')], ['heavy snow']);
});

await test('the TAF in a window: prevailing and TEMPO apart, BECMG on both sides, out of reach is null', () => {
  const t = taf('RJAA', { clouds: [{ cover: 'BKN', base: 2000 }] }, [
    { timeFrom: T0 + 2 * H, timeTo: T0 + 24 * H, timeBec: T0 + 3 * H, fcstChange: 'BECMG', visib: 3, clouds: [{ cover: 'OVC', base: 800 }], wxString: 'RA' },
    { timeFrom: T0 + 2 * H, timeTo: T0 + 6 * H, fcstChange: 'TEMPO', visib: '', clouds: [{ cover: 'BKN', base: 400 }], wxString: 'TSRA' },
  ]);
  const before = tafWindow(t, (T0 - 1 * H) * 1000, (T0 + 1 * H) * 1000);
  assert.equal(before.cig, 2000); assert.equal(before.vis, 10000); assert.equal(before.tCig, Infinity);
  const at = tafWindow(t, (T0 + 3 * H) * 1000, (T0 + 4 * H) * 1000);
  assert.equal(at.cig, 800); assert.equal(at.vis, 4828); assert.equal(at.tCig, 400); assert.equal(at.tVis, Infinity); // TEMPO with no visibility: unchanged
  assert.deepEqual([...at.tHz], ['thunderstorms']); assert.deepEqual([...at.hz], []);
  assert.equal(tafWindow(t, (T0 + 30 * H) * 1000, (T0 + 31 * H) * 1000), null);
  assert.equal(tafWindow(null, 0, 1), null);
});

await test('a plan that meets the policy is released with no remarks', () => {
  const r = checkPlan(ci, plan(), wxAll(), P, (T0 - H) * 1000);
  assert.equal(r.res, 'ok', JSON.stringify(r.items)); assert.deepEqual(r.items, []);
  assert.equal(r.etd, T0 * 1000); assert.equal(r.eta, (T0 + 900 + 3 * H) * 1000);
});

await test('weights over a limit, fuel under the minimum, no reserve or alternate: not released (hard)', () => {
  assert.deepEqual(keys(checkPlan(ci, plan({ tow: 281000 }), wxAll(), P), 'hard'), ['tow']);
  assert.deepEqual(keys(checkPlan(ci, plan({ zfw: 196000, ldw: 208000 }), wxAll(), P), 'hard'), ['ldw', 'zfw']);
  assert.deepEqual(keys(checkPlan(ci, plan({ block: 25000 }), wxAll(), P), 'hard'), ['minfuel']);
  assert.deepEqual(keys(checkPlan(ci, plan({ block: 111000 }), wxAll(), P), 'hard'), ['tanks']);
  assert.deepEqual(keys(checkPlan(ci, plan({ finT: 20 * 60 }), wxAll(), P), 'hard'), ['final']);
  assert.deepEqual(keys(checkPlan(ci, plan({ fin: 0 }), wxAll(), P), 'hard'), ['final']);
  const r = checkPlan(ci, plan({ alts: [] }), wxAll(), P); assert.equal(r.res, 'fail'); assert.deepEqual(keys(r, 'hard'), ['altn']);
  /* the destination given as its own alternate does not count */
  assert.deepEqual(keys(checkPlan(ci, plan({ alts: ['RJAA'] }), wxAll(), P), 'hard'), ['altn']);
  /* no alternate needed when the policy says so */
  assert.equal(checkPlan(ci, plan({ alts: [] }), wxAll(), { ...P, altn: false }).res, 'ok');
});

await test('contingency under the policy, or no alternate fuel: the captain may accept (soft)', () => {
  const r = checkPlan(ci, plan({ cont: 500 }), wxAll(), P); assert.equal(r.res, 'hold'); assert.deepEqual(keys(r), ['cont']);
  assert.deepEqual(keys(checkPlan(ci, plan({ contT: 3 * 60 }), wxAll(), P)), ['cont']);
  assert.equal(checkPlan(ci, plan({ cont: 500 }), wxAll(), { ...P, contPct: 0, contMin: 0 }).res, 'ok');
  assert.deepEqual(keys(checkPlan(ci, plan({ altn: 0 }), wxAll(), P)), ['altnfuel']);
});

await test('destination below its minima needs a second alternate; TEMPO and thunderstorms are remarks', () => {
  const low = { ...wxAll(), RJAA: taf('RJAA', { visib: '1/4', clouds: [{ cover: 'OVC', base: 100 }], wxString: 'FG' }) };
  const r = checkPlan(ci, plan(), low, P); assert.equal(r.res, 'hold'); assert.deepEqual(keys(r), ['destwx']);
  assert.match(r.items[0].t, /RJAA forecast below the destination minima around 0915Z \(ceiling 100 ft, visibility 402 m\)/);
  assert.equal(checkPlan(ci, plan({ alts: ['RJTT', 'RJBB'] }), low, P).res, 'ok');
  const tempo = { ...wxAll(), RJAA: taf('RJAA', {}, [{ timeFrom: T0 + 2 * H, timeTo: T0 + 5 * H, fcstChange: 'TEMPO', visib: '1/4', clouds: [{ cover: 'BKN', base: 100 }], wxString: 'TSRA' }]) };
  const t = checkPlan(ci, plan(), tempo, P); assert.equal(t.res, 'remarks'); assert.deepEqual(keys(t), ['desthz', 'desttempo']);
  assert.match(t.items.find((x) => x.k === 'desthz').t, /thunderstorms forecast around 0915Z: consider extra fuel/);
  assert.doesNotMatch(checkPlan(ci, plan({ extraT: 30 * 60 }), tempo, P).items.find((x) => x.k === 'desthz').t, /extra fuel/);
  /* the weather around the ETA only: low cloud long after landing does not count */
  const later = { ...wxAll(), RJAA: taf('RJAA', {}, [{ timeFrom: T0 + 8 * H, timeTo: T0 + 24 * H, fcstChange: 'FM', visib: '1/4', clouds: [{ cover: 'OVC', base: 100 }] }]) };
  assert.equal(checkPlan(ci, plan(), later, P).res, 'ok');
});

await test('an alternate under its planning minima, or with no TAF: soft; one good alternate is enough', () => {
  const low = { ...wxAll(), RJTT: taf('RJTT', { visib: 1, clouds: [{ cover: 'BKN', base: 400 }] }) };
  const r = checkPlan(ci, plan(), low, P); assert.equal(r.res, 'hold'); assert.deepEqual(keys(r), ['altnwx']);
  assert.match(r.items[0].t, /RJTT forecast below the alternate minima \(ceiling 400 ft, visibility 1609 m; the policy is 600 ft and 3000 m\)/);
  assert.equal(checkPlan(ci, plan({ alts: ['RJTT', 'RJBB'] }), low, P).res, 'ok');
  const none = wxAll(); delete none.RJTT;
  assert.deepEqual(keys(checkPlan(ci, plan(), none, P)), ['altntaf']);
});

await test('no forecast for the destination: a second alternate; the weather not read: a remark only', () => {
  const none = wxAll(); delete none.RJAA;
  assert.deepEqual(keys(checkPlan(ci, plan(), none, P)), ['desttaf']);
  assert.equal(checkPlan(ci, plan({ alts: ['RJTT', 'RJBB'] }), none, P).res, 'ok');
  const r = checkPlan(ci, plan(), null, P); assert.equal(r.res, 'remarks'); assert.deepEqual(keys(r), ['wx']);
});

await test('departure below landing minima: a takeoff alternate', () => {
  const fog = { ...wxAll(), RCTP: taf('RCTP', { visib: '1/4', clouds: [{ cover: 'OVC', base: 100 }], wxString: 'FG' }) };
  assert.deepEqual(keys(checkPlan(ci, plan(), fog, P)), ['toalt']);
  assert.equal(checkPlan(ci, plan({ toAlt: 'RCKH' }), fog, P).res, 'ok');
});

await test('the plan for another flight, aircraft or made long before: remarks', () => {
  const r = checkPlan(ci, plan({ flight: 'PAW104', reg: 'B58202', gen: T0 - 20 * H }), wxAll(), P);
  assert.equal(r.res, 'remarks'); assert.deepEqual(keys(r), ['age', 'flight', 'reg']);
  assert.equal(checkPlan(ci, plan({ reg: 'B58201' }), wxAll(), P).res, 'ok'); // B-58201 and B58201 are one aircraft
});

await test('the plan summary and the policy are cleaned; out of bounds is refused', () => {
  const p = cleanPlan({ block: '25900', trip: 18000, alts: ['rjtt', 'RJTT', 'X', 'RJBB', 'RJCC', 'RJGG', 'RJFF'], toAlt: 'bad!', units: 'lbs', flight: 'paw<b>102', zfw: -5 });
  assert.equal(p.block, 25900); assert.deepEqual(p.alts, ['RJTT', 'RJBB', 'RJCC', 'RJGG']); assert.equal(p.toAlt, ''); assert.equal(p.units, 'lbs'); assert.equal(p.flight, 'PAWB102'); assert.equal(p.zfw, null);
  assert.equal(cleanPlan(null), null); assert.equal(cleanPlan({ alts: [] }), null);
  assert.equal(planKey(plan()), planKey(plan())); assert.notEqual(planKey(plan()), planKey(plan({ block: 26000 })));
  assert.deepEqual(cleanPolicy({}), { ...DEF_POLICY });
  assert.equal(cleanPolicy({ on: true, finalMin: 45 }).finalMin, 45);
  assert.throws(() => cleanPolicy({ finalMin: 5 }), /Final reserve fuel \(minutes\): between 15 and 60/);
  assert.throws(() => cleanPolicy({ contPct: 'x' }), /between 0 and 10/);
});

await test('the release: number, fuel, remarks and the captain’s discretion', () => {
  assert.equal(releaseNo(ci, 1), 'PAW102/29NOV/R1');
  const disp = { rel: { no: 'PAW102/29NOV/R2' }, etd: T0 * 1000, eta: (T0 + 3.25 * H) * 1000, capt: { reason: 'RJTT improving per latest METAR' },
    items: [{ k: 'altnwx', sev: 'soft', t: 'RJTT forecast below the alternate minima' }, { k: 'desthz', sev: 'warn', t: 'RJAA: thunderstorms forecast around 0915Z' }] };
  const m = releaseMsg(ci, plan(), disp, (T0 - H) * 1000);
  assert.equal(m.title, 'DISPATCH RELEASE');
  assert.match(m.body, /^DISPATCH RELEASE PAW102\/29NOV\/R2\nPAW102\/29NOV  RCTP-RJAA  ALTN RJTT\nB-58201  A359  STD 0600Z  ETA 0915Z\n\nFUEL \(KG\)\nTRIP     18,000\nCONT        900/);
  assert.match(m.body, /BLOCK    25,900\n\nCAPT DISCRETION:\n- RJTT forecast below the alternate minima\nREASON: RJTT improving per latest METAR\nREMARKS:\n- RJAA: thunderstorms forecast around 0915Z\n\nRELEASED BY POLARIS DISPATCH \(AUTOMATIC\) 0500Z$/);
  assert.match(releaseMsg(ci, plan(), { rel: { no: 'X' }, items: [] }, 0).body, /REMARKS NIL/);
});

await test('TAFs: one request for every airport, the newest kept; a failure is null', async () => {
  let asked = '';
  const fake = async (u) => { asked = u; return new Response(JSON.stringify([{ icaoId: 'RJAA', issueTime: '2026-11-29T00:00:00Z', fcsts: [] }, { icaoId: 'RJAA', issueTime: '2026-11-29T05:00:00Z', fcsts: [], n: 2 }, { icaoId: 'RCTP', issueTime: '2026-11-29T00:00:00Z', fcsts: [] }])); };
  const r = await fetchTafs(['RCTP', 'RJAA', 'RJAA', 'bad', 'RJTT'], fake);
  assert.match(asked, /ids=RCTP,RJAA,RJTT$/); assert.equal(r.RJAA.n, 2); assert.ok(r.RCTP); assert.equal(r.RJTT, undefined);
  assert.equal(await fetchTafs(['RJAA'], async () => new Response('no', { status: 502 })), null);
  assert.equal(await fetchTafs(['RJAA'], async () => { throw new Error('offline'); }), null);
  assert.deepEqual(await fetchTafs([], fake), {});
});

/* ---- check-in to release, in the crew Durable Object ---- */
function mkSql() {
  const db = new DatabaseSync(':memory:');
  return { exec(q, ...b) { const st = db.prepare(q); if (/^\s*(SELECT|PRAGMA)/i.test(q)) { const rows = st.all(...b); return { toArray: () => rows }; } st.run(...b); return { toArray: () => [] }; } };
}
function mkKv() { const m = new Map(); return { m, async get(k, t) { const v = m.get(k); if (v == null) return null; return t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, typeof v === 'string' ? v : String(v)); }, async delete(k) { m.delete(k); } }; }
let WX = wxAll();
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => { if (/aviationweather\.gov\/api\/data\/taf/.test(String(u))) return new Response(JSON.stringify(Object.values(WX))); throw new Error('no network in tests: ' + u); };
const realNow = Date.now; let NOW = (T0 - 2 * H) * 1000; Date.now = () => NOW;
const { Crew } = await import('../src/crew.js');
const env = { STORE: mkKv() };
const obj = new Crew({ storage: { sql: mkSql(), getAlarm: async () => null, setAlarm: async () => {} } }, env);
const call = (a) => obj.call(a);
const aocs = () => JSON.parse(env.STORE.m.get('aoc:v1:index') || '[]');
const outbox = () => obj.rows('SELECT payload FROM outbox').map((r) => JSON.parse(r.payload));
const w = { units: 'kgs', zfw: 170000, mzfw: 195700, tow: 195300, mtow: 280000, ldw: 177300, mlw: 207000, tof: 25300, trip: 18000, block: 25900, gen: String(T0 - 2 * H) };
const booking = { id: 901, flight: 'PAW102', callsign: 'PAW102', from: 'RCTP', to: 'RJAA', departureTime: new Date(T0 * 1000).toISOString(), arrivalTime: new Date((T0 + 3.5 * H) * 1000).toISOString(), type: 'A359', registration: 'B-58201' };

await test('with the policy off, check-in and the loadsheet work as before and nothing is checked', async () => {
  await call({ op: 'sub', u: 'PAW0006', sub: { endpoint: 'https://push.example/dev1', keys: { p256dh: 'k', auth: 'a' } }, cats: ['mail', 'brief'] });
  await call({ op: 'checkin', u: 'PAW0006', booking });
  const r = await call({ op: 'ciOfp', u: 'PAW0006', bookingId: '901', w, p: plan() });
  assert.equal(r.ok, true); assert.ok(r.at); assert.equal(r.disp, null);
  assert.equal(aocs().length, 0);
});

await test('policy on: a good plan is released at once, with an AOC to the crew and in the log', async () => {
  await env.STORE.put('disp:v1:policy', JSON.stringify({ ...DEF_POLICY, on: true }));
  const r = await call({ op: 'ciOfp', u: 'PAW0006', bookingId: '901', w, p: plan() });
  assert.equal(r.disp.res, 'ok'); assert.equal(r.disp.rel.no, 'PAW102/29NOV/R1');
  const a = aocs(); assert.equal(a.length, 1); assert.equal(a[0].title, 'DISPATCH RELEASE'); assert.equal(a[0].auto, 'rel'); assert.equal(a[0].to.cs, 'PAW102'); assert.match(a[0].body, /REMARKS NIL/);
  const log = JSON.parse(env.STORE.m.get('disp:v1:log')); assert.equal(log[0].res, 'ok'); assert.equal(log[0].rel, 'PAW102/29NOV/R1'); assert.equal(log[0].cs, 'PAW102');
  /* the same plan again: no second release */
  const again = await call({ op: 'ciOfp', u: 'PAW0006', bookingId: '901', w, p: plan(), recheck: true });
  assert.equal(again.disp.rel.no, 'PAW102/29NOV/R1'); assert.equal(aocs().length, 1);
  /* the EFB opened again later (not asked to check): the release stands even if the weather got worse since */
  NOW += 30 * 60_000; WX = { ...wxAll(), RJTT: taf('RJTT', { visib: 1, clouds: [{ cover: 'BKN', base: 400 }] }) };
  const later = await call({ op: 'ciOfp', u: 'PAW0006', bookingId: '901', w, p: plan() });
  assert.equal(later.disp.res, 'ok'); assert.equal(later.disp.rel.no, 'PAW102/29NOV/R1');
  NOW -= 30 * 60_000; WX = wxAll();
  /* the check-in shows it to the EFB (and Flight Watch) */
  const g = await call({ op: 'ciGet', u: 'PAW0006' }); assert.equal(g.checkin.disp.res, 'ok');
  const L = await call({ op: 'ciList' }); assert.deepEqual(L.list[0].disp, { res: 'ok', rel: 'PAW102/29NOV/R1', capt: false, at: NOW });
});

await test('a new plan below the policy: not released, a push; the captain accepts it: CAPT DISCRETION', async () => {
  NOW += 10 * 60_000; WX = { ...wxAll(), RJTT: taf('RJTT', { visib: 1, clouds: [{ cover: 'BKN', base: 400 }] }) };
  const r = await call({ op: 'ciOfp', u: 'PAW0006', bookingId: '901', w, p: plan({ gen: T0 - H }) });
  assert.equal(r.disp.res, 'hold'); assert.equal(r.disp.rel, null); assert.equal(aocs().length, 1);
  const push = outbox().find((x) => /Not released/.test(x.title)); assert.ok(push); assert.match(push.body, /RJTT forecast below the alternate minima.*accept it as captain/);
  await assert.rejects(call({ op: 'dispCapt', u: 'PAW0006', bookingId: '901', reason: 'ok' }), /Write why/);
  await assert.rejects(call({ op: 'dispCapt', u: 'PAW0006', bookingId: '999', reason: 'RJTT improving' }), /Check in to this flight first/);
  const c = await call({ op: 'dispCapt', u: 'PAW0006', bookingId: '901', reason: 'RJTT improving, METAR 9999' });
  assert.equal(c.disp.res, 'capt'); assert.equal(c.disp.rel.no, 'PAW102/29NOV/R2');
  const a = aocs()[0]; assert.match(a.body, /CAPT DISCRETION:\n- RJTT FORECAST BELOW THE ALTERNATE MINIMA[^\n]*\nREASON: RJTT IMPROVING, METAR 9999/);
  assert.equal(JSON.parse(env.STORE.m.get('disp:v1:log'))[0].capt.reason, 'RJTT improving, METAR 9999');
  /* checked again with nothing new: the captain's word stands, no new release */
  const again = await call({ op: 'ciOfp', u: 'PAW0006', bookingId: '901', w, p: plan({ gen: T0 - H }), recheck: true });
  assert.equal(again.disp.res, 'capt'); assert.equal(again.disp.rel.no, 'PAW102/29NOV/R2'); assert.equal(aocs().length, 2);
});

await test('a plan that cannot go: not released and the captain cannot accept it', async () => {
  const r = await call({ op: 'ciOfp', u: 'PAW0006', bookingId: '901', w, p: plan({ gen: T0 - H / 2, tow: 281000 }) });
  assert.equal(r.disp.res, 'fail'); assert.equal(r.disp.rel, null);
  await assert.rejects(call({ op: 'dispCapt', u: 'PAW0006', bookingId: '901', reason: 'it will be fine' }), /cannot be released as it is/);
  /* a check-out takes it all away */
  await call({ op: 'checkout', u: 'PAW0006' });
  assert.equal((await call({ op: 'ciGet', u: 'PAW0006' })).checkin, null);
});

Date.now = realNow; globalThis.fetch = realFetch;
console.log(n + ' passed');
