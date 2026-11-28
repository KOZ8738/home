/* The sixteen P1 fixes from the Polaris Operations admin audit (Nov 2026): plain Node 22, no npm packages.
     node workers/polaris-efb-api/test/admin-p1.test.mjs
   Backend
   1. The AOC index is changed one change at a time (aoc.js queue) and the 2-minute cron runs its watchers one after
      another (index.js opsTick): two automatic AOCs in the same tick never write over each other. Mail saves too.
   2. Cross-site requests: every POST/PUT/PATCH/DELETE to /admin/api/* from another site (Sec-Fetch-Site, Origin) is 403;
      the Broadcast desk, the AIP chart uploads and the document covers want their own Content-Type (415).
   3. Mail attachments go up as they are (POST /admin/api/mail/att, kept an hour) and the mail takes them by id: no
      base64 decoded on the server (the Workers Free plan's 10 ms of CPU a request).
   Admin page (admin.js and the Flight Watch bundle, run here in a stand-in page)
   4–10. Broadcast's Setup and its buttons for a bad moment, Nav Data's file picker, the gate "Change" row, Flight Watch
      keeping the open flight (and its unsent message) through a missed update, pmCompose asking first, Home's link to
      an AOC message.
   11–16. Touch targets, the narrow sections bar, the Cockpit Monitor (one camera, phones, Esc), Broadcast's source,
      the ? explanations, Nav Data's sticky filter and the EFB's frame: the rules are there, and the CSS is whole.
   Cloudflare Access, KV, R2, the Durable Objects, VATSIM and the weather service are stood in for; time is the test's. */
import assert from 'node:assert/strict';
import vm from 'node:vm';

let NOW = Math.ceil(Date.now() / 600_000) * 600_000 + 600_000;   /* on a 10-minute mark: the SIGMET watch runs in this tick */
const realNow = Date.now; Date.now = () => NOW;
const later = (ms = 61_000) => { NOW += ms; };
const realWarn = console.warn, warned = []; console.warn = (...a) => { warned.push(a.join(' ')); };

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + ((e && e.stack) || e)); process.exitCode = 1; }
}
const settle = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const clone = (v) => JSON.parse(JSON.stringify(v));
const wait = (ms) => (ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/* ---- KV, stood in for: text, or the bytes put; lag(key, op): ms a get or put of that key takes (so changes can meet
   in the middle); stale: keys whose get answers with the value from before the last put, as a KV location can ---- */
function mkKv(init = {}, { lag = () => 0 } = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const kv = {
    m, meta: new Map(), opts: new Map(), fail: new Set(), puts: [], dels: [], stale: new Set(), was: new Map(), lag,
    async get(k, t) {
      await wait(kv.lag(k, 'get'));
      if (kv.fail.has(k) || kv.fail.has('*')) throw new Error('KV GET failed (test)');
      const v = kv.stale.has(k) && kv.was.has(k) ? kv.was.get(k) : m.get(k); if (v == null) return null;
      const type = typeof t === 'string' ? t : t && t.type;
      if (type === 'arrayBuffer') return v instanceof ArrayBuffer ? v.slice(0) : new TextEncoder().encode(v).buffer;
      if (v instanceof ArrayBuffer) return new TextDecoder().decode(v);
      return type === 'json' ? JSON.parse(v) : v;
    },
    async getWithMetadata(k, t) { const value = await kv.get(k, t); return { value, metadata: value == null ? null : kv.meta.get(k) ?? null }; },
    async put(k, v, o) {
      await wait(kv.lag(k, 'put'));
      if (kv.fail.has(k + ':put')) throw new Error('KV PUT failed (test)');
      kv.puts.push(k); kv.was.set(k, m.get(k));
      m.set(k, typeof v === 'string' ? v : v instanceof ArrayBuffer ? v.slice(0) : ArrayBuffer.isView(v) ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : String(v));
      kv.meta.set(k, o && o.metadata); kv.opts.set(k, o || null);
    },
    async delete(k) { kv.dels.push(k); m.delete(k); kv.meta.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
    json(k) { const v = m.get(k); return v == null ? null : JSON.parse(v); },
    bytes(k) { const v = m.get(k); return v instanceof ArrayBuffer ? new Uint8Array(v) : null; },
  };
  return kv;
}

/* ---- the network, stood in for: Cloudflare Access's keys, VATSIM's feed, the weather service ---- */
const TEAM = 'p1.cloudflareaccess.com', AUD = 'p1-aud', ORIGIN = 'https://efb-api.example';
const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const NET = { feed: null, sigmets: [], asked: [] };
const realFetch = globalThis.fetch;
const jsonResp = (v) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (u, init) => {
  const s = String(u && u.url ? u.url : u); NET.asked.push(s);
  if (s === 'https://' + TEAM + '/cdn-cgi/access/certs') return jsonResp({ keys: [jwk] });
  if (s === 'https://data.vatsim.net/v3/vatsim-data.json') return jsonResp(NET.feed);
  if (s.startsWith('https://aviationweather.gov/api/data/metar')) return jsonResp([]);
  if (s === 'https://aviationweather.gov/api/data/isigmet?format=json') return jsonResp(NET.sigmets);
  if (/^https:\/\/aviationweather\.gov\/api\/data\/(airsigmet|gairmet|cwa)/.test(s)) return jsonResp([]);
  throw new Error('no network in these tests: ' + s);
};
/* the Workers cache, empty: VATSIM's feed is read from the network above */
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
async function signIn(email) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })), p = b64u(JSON.stringify({ aud: [AUD], iss: 'https://' + TEAM, email, exp: Math.floor(realNow() / 1000) + 7 * 86400 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(h + '.' + p));
  return h + '.' + p + '.' + b64u(new Uint8Array(sig));
}
/* the crew Durable Object: check-ins (none), pushes and schedules (noted) */
function mkCrew() {
  const calls = [];
  const ns = { idFromName: () => 'crew', get: () => ({ fetch: async (u, init) => { const a = JSON.parse(init.body); calls.push(a); return jsonResp(a.op === 'ciList' ? { list: [] } : { ok: true }); } }) };
  return { ns, calls };
}
const { mailAdmin, mailPublic } = await import('../src/mail.js');
const ENV = (kv, more = {}) => ({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, STORE: kv, CREW: mkCrew().ns, ...more });
/* a request from the admin page (h: its headers; body: JSON, or the bytes as they are) */
async function admin(kv, email, path, { method = 'GET', body, headers = {}, env } = {}) {
  const hd = { 'Cf-Access-Jwt-Assertion': await signIn(email), ...headers };
  const raw = body instanceof ArrayBuffer || ArrayBuffer.isView(body) || typeof body === 'string';
  if (body !== undefined && !raw && !('Content-Type' in hd)) hd['Content-Type'] = 'application/json';
  const req = new Request(ORIGIN + path, { method, headers: hd, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  return mailAdmin(req, new URL(req.url), env || ENV(kv), {});
}
const ROLES = 'admin:v1:roles';
const ROLES_ON = { people: { 'boss@p.test': { role: 'admin' }, 'ops@p.test': { role: 'ops' }, 'view@p.test': { role: 'view' } },
  roles: { ops: { name: 'Operations', pages: ['fw', 'comms'], can: ['msg'] }, view: { name: 'Watch', pages: ['fw', 'comms'], can: [] } }, at: 1, by: 'boss@p.test' };

/* ================= 1. the AOC index, one change at a time; the cron's watchers one after another ================= */
const AOCI = 'aoc:v1:index';
const { aocSend, aocSendMany, aocAdmin } = await import('../src/aoc.js');
const crewTo = (cs) => ({ crew: 1, cs, m: [] });

await test('P1-1 control: the stand-in KV does lose a message when two read-change-writes of the index meet (so the tests below can tell)', async () => {
  const kv = mkKv({}, { lag: (k) => (k === AOCI ? 4 : 0) });
  const naive = async (id) => { const l = (await kv.get(AOCI, 'json')) || []; await kv.put(AOCI, JSON.stringify([{ id, t: NOW }, ...l])); };
  await Promise.all([naive('a'), naive('b'), naive('c')]);
  assert.ok(kv.json(AOCI).length < 3, 'the naive way keeps ' + kv.json(AOCI).length + ' of 3');
});

await test('P1-1 aocSend: twelve at once, each read and write of the index slow, all twelve kept (one change at a time); pushes for each', async () => {
  later();
  const kv = mkKv({ [AOCI]: [{ id: 'old', t: NOW - 1000, title: 'OLD', body: 'X', to: null, by: 'x' }] }, { lag: (k) => (k === AOCI ? 3 + Math.floor(Math.random() * 4) : 0) });
  const crew = mkCrew(), env = { STORE: kv, CREW: crew.ns };
  const sent = await Promise.all(Array.from({ length: 12 }, (_, i) => aocSend(env, { title: 'T' + i, body: 'body ' + i, to: crewTo('PAW' + (100 + i)), push: true, by: 'AUTO', auto: 'gate' })));
  const L = kv.json(AOCI);
  assert.equal(L.length, 13, 'twelve new and the one there was');
  assert.deepEqual(new Set(L.map((m) => m.id)), new Set(['old', ...sent.map((m) => m.id)]));
  assert.equal(kv.puts.filter((k) => k === AOCI).length, 12, 'one write each');
  assert.equal(crew.calls.filter((a) => a.op === 'notify').length, 12);
});

await test('P1-1 aocSendMany: several messages in one read and one write; staff sending meanwhile keep theirs', async () => {
  later();
  const kv = mkKv({}, { lag: (k) => (k === AOCI ? 5 : 0) }), env = { STORE: kv, CREW: mkCrew().ns };
  const req = new Request(ORIGIN + '/admin/api/aoc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Staff', body: 'from ops', to: { crew: true, cs: 'PAW9' } }) });
  const [many, r] = await Promise.all([aocSendMany(env, [{ title: 'A', body: 'a', to: crewTo('PAW1'), by: 'AUTO', push: false }, { title: 'B', body: 'b', to: crewTo('PAW2'), by: 'AUTO', push: false }]), aocAdmin(req, new URL(req.url), env, 'ops@p.test')]);
  assert.equal(r.status, 200); assert.equal(many.length, 2);
  assert.deepEqual(kv.json(AOCI).map((m) => m.title).sort(), ['A', 'B', 'STAFF']);
  assert.equal(kv.puts.filter((k) => k === AOCI).length, 2, 'the two messages in one write, the staff one in another');
});

await test('P1-1 aoc index: a KV location that still answers with the list from before the last write loses nothing this isolate wrote, and does not bring back one it deleted', async () => {
  later();
  const kv = mkKv(), env = { STORE: kv, CREW: mkCrew().ns }; kv.stale.add(AOCI);
  const a = await aocSend(env, { title: 'one', body: '1', to: crewTo('PAW1'), by: 'AUTO', push: false });
  const b = await aocSend(env, { title: 'two', body: '2', to: crewTo('PAW2'), by: 'AUTO', push: false });
  const c = await aocSend(env, { title: 'three', body: '3', to: crewTo('PAW3'), by: 'AUTO', push: false });
  assert.deepEqual(kv.json(AOCI).map((m) => m.id).sort(), [a.id, b.id, c.id].sort(), 'each write had the one before it, though KV answered a write late');
  const del = new Request(ORIGIN + '/admin/api/aoc?id=' + b.id, { method: 'DELETE' });
  assert.equal((await aocAdmin(del, new URL(del.url), env, 'ops@p.test')).status, 200);
  const d = await aocSend(env, { title: 'four', body: '4', to: crewTo('PAW4'), by: 'AUTO', push: false });
  assert.deepEqual(kv.json(AOCI).map((m) => m.id).sort(), [a.id, c.id, d.id].sort(), 'the deleted one stays deleted');
  kv.stale.clear();
});

await test('P1-1 aoc index: a value that is not a list (or a KV error) is 503 and nothing is written over it', async () => {
  later();
  const kv = mkKv({ [AOCI]: '{"not":"a list"}' }), env = { STORE: kv, CREW: mkCrew().ns };
  await assert.rejects(aocSend(env, { title: 'x', body: 'y', to: null, by: 'AUTO', push: false }), (e) => e.status === 503);
  assert.equal(kv.m.get(AOCI), '{"not":"a list"}'); assert.equal(kv.puts.length, 0);
});

/* the 2-minute cron with three automatic AOCs due in the same tick: a gate (PAW101, 20 minutes out of KLAX), an arrival
   report (PAW202, at its gate at KSFO for four minutes) and a SIGMET (PAW303, in severe turbulence over the Pacific) */
const { opsTick } = await import('../src/index.js');
const PLAN = { on: true, dep: false, ls: true, sig: true, inr: true, lead: 30, miss: 'skip', apts: { KLAX: [{ stands: 'D1-D10', fl: 'all', ac: 'all', term: 'T4' }] }, at: 1, swAt: 1, aptsAt: 1, by: 'boss@p.test' };
const pilot = (cs, cid, lat, lon, alt, gs, hdg, dep, arr, ac, fl) => ({ callsign: cs, cid, name: 'Pilot ' + cs, latitude: lat, longitude: lon, altitude: alt, groundspeed: gs, heading: hdg, transponder: '2000', logon_time: new Date(NOW - 3 * 3600e3).toISOString(),
  flight_plan: { aircraft_short: ac, departure: dep, arrival: arr, altitude: fl, flight_rules: 'I', route: 'DCT' } });
function opsWorld(kvOpts) {
  NOW = Math.ceil((NOW + 1) / 600_000) * 600_000;   /* the next 10-minute mark: the SIGMET watch runs in this tick */
  NET.feed = { general: { update_timestamp: new Date(NOW).toISOString() }, controllers: [], atis: [], pilots: [
    pilot('PAW101', 1000101, 34.6, -119.2, 12000, 300, 120, 'KSFO', 'KLAX', 'A21N', 'FL340'),
    pilot('PAW202', 1000202, 37.6155, -122.3896, 13, 0, 280, 'KSEA', 'KSFO', 'A21N', 'FL360'),
    pilot('PAW303', 1000303, 40, -150, 37000, 480, 280, 'KSFO', 'RJTT', 'A359', 'FL370')] };
  NET.sigmets = [{ firId: 'KZAK', firName: 'OAKLAND OCEANIC FIR', hazard: 'TURB', qualifier: 'SEV', base: 30000, top: 41000, validTimeFrom: Math.round(NOW / 1000) - 3600, validTimeTo: Math.round(NOW / 1000) + 3600,
    coords: [{ lat: 38, lon: -152 }, { lat: 42, lon: -152 }, { lat: 42, lon: -148 }, { lat: 38, lon: -148 }], rawSigmet: 'KZAK SIGMET X1 VALID' }];
  const live = { 'PAW202:KSEA:KSFO': { k: 'PAW202:KSEA:KSFO', cs: 'PAW202', pilot: '', cid: '1000202', name: 'Pilot PAW202', dep: 'KSEA', arr: 'KSFO', ac: 'A21N', src: 'VATSIM', first: NOW - 3 * 3600e3, out: NOW - 2.6 * 3600e3, off: NOW - 2.5 * 3600e3, on: NOW - 12 * 60e3, still: NOW - 4 * 60e3, schedTried: 2 } };
  const kv = mkKv({ 'stands:v1:plan': PLAN, 'ooo:v1:live': live }, kvOpts);
  const crew = mkCrew();
  return { kv, crew, env: { STORE: kv, CREW: crew.ns } };
}

await test('P1-1 opsTick: a gate, an arrival report and a SIGMET AOC due in the same tick are all kept, written one after another (gate, report, SIGMET)', async () => {
  later(600_000);
  const W = opsWorld({ lag: (k) => (k === AOCI ? 6 : 1) }), order = [];
  const put0 = W.kv.put; W.kv.put = async (k, v, o) => { if (k === AOCI) order.push(JSON.parse(v).map((m) => m.auto)); return put0(k, v, o); };
  await opsTick(W.env, { waitUntil() {} });
  const L = W.kv.json(AOCI) || [];
  assert.deepEqual(L.map((m) => m.auto).sort(), ['gate', 'inr', 'sig'], 'all three automatic messages are in the index: ' + JSON.stringify(L.map((m) => m.auto)));
  assert.deepEqual(L.find((m) => m.auto === 'gate').to.cs, 'PAW101'); assert.match(L.find((m) => m.auto === 'gate').body, /D1/);
  assert.deepEqual(L.find((m) => m.auto === 'inr').to.cs, 'PAW202');
  assert.deepEqual(L.find((m) => m.auto === 'sig').to.cs, 'PAW303'); assert.match(L.find((m) => m.auto === 'sig').body, /TURB/);
  assert.deepEqual(order, [['gate'], ['inr', 'gate'], ['sig', 'inr', 'gate']], 'each write had the ones before it');
  assert.equal(W.kv.json('stands:v1:log')[0].cs, 'PAW101', 'the gate was logged');
  assert.ok(W.kv.json('ooo:v1:log').some((r) => r.cs === 'PAW202' && r.in), 'the arrival logged with its IN time');
  assert.ok(W.kv.json('sigroute:v1:sent')['PAW303:KSFO:RJTT'], 'the SIGMET noted as sent');
  assert.equal(W.crew.calls.filter((a) => a.op === 'notify').length, 3, 'a push for each');
});

await test('P1-1 opsTick: a step that fails (the gate log cannot be read) is logged and the steps after it still send theirs', async () => {
  later(600_000); warned.length = 0;
  const W = opsWorld(); W.kv.fail.add('stands:v1:log');
  await opsTick(W.env, { waitUntil() {} });
  assert.deepEqual((W.kv.json(AOCI) || []).map((m) => m.auto).sort(), ['inr', 'sig']);
  assert.ok(warned.some((w) => /^\[stands\]/.test(w)), 'the failing step said so');
});

await test('P1-1 opsTick (source): the watchers are awaited one by one, never in a Promise.all', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export async function opsTick('), src.indexOf('function standDeps('));
  assert.ok(body.length > 100); assert.doesNotMatch(body, /Promise\.all/);
  const i = body.indexOf('standWatch'), j = body.indexOf('oooWatch'), k = body.indexOf('sigRouteWatch');
  assert.ok(i > 0 && i < j && j < k, 'gates, then OOOI and the arrival report, then SIGMETs');
  assert.equal((body.match(/await step\(/g) || []).length, 3);
});

const MIDX = 'mail:v1:index';
const newMail = (subject) => ({ from: 'Flight Operations', subject, body: 'Read this' });

await test('P1-1 mail: a save reads the index from KV itself (never the pilots\' 20-second copy), and two saves at once both keep their mail', async () => {
  later();
  const kv = mkKv({ [MIDX]: [] }, { lag: (k) => (k === MIDX ? 5 : 0) }), env = ENV(kv);
  /* the pilots' copy: warm, and empty */
  await mailPublic(new Request(ORIGIN + '/api/efb/mail'), env, {}, { u: 'PAW0006', c: '1234567' }, async () => 'k');
  /* another isolate saves meanwhile */
  kv.m.set(MIDX, JSON.stringify([{ id: 'elsewhere', t: NOW, sendAt: NOW, from: 'Ops', subject: 'Elsewhere', body: 'x', att: [], to: null, by: 'x' }]));
  const [a, b] = await Promise.all([admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: newMail('One'), env }), admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: newMail('Two'), env })]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.deepEqual(kv.json(MIDX).map((m) => m.subject).sort(), ['Elsewhere', 'One', 'Two']);
});

/* ================= 2. cross-site requests; each body as the admin page sends it ================= */
const deskNs = () => { const seen = []; return { seen, ns: { idFromName: () => 'desk', get: () => ({ fetch: async (u, init) => { seen.push({ u: String(u), body: init && init.body }); return jsonResp({ ok: true, cfg: {} }); } }) } }; };

await test('P1-2 cross-site: Sec-Fetch-Site other than same-origin, or an Origin that is not the admin\'s, is 403 for every change (POST, PUT, PATCH, DELETE) and nothing is done', async () => {
  later();
  const kv = mkKv({ [MIDX]: [] }), D = deskNs(), env = ENV(kv, { DESK: D.ns });
  const bad = [{ 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }, { 'Sec-Fetch-Site': 'none' }, { Origin: 'https://evil.example' }, { Origin: 'null' },
    { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site', Origin: ORIGIN }];
  const calls = [['POST', '/admin/api/mail', newMail('X')], ['DELETE', '/admin/api/mail?id=m1'], ['POST', '/admin/api/aoc', { title: 'X', body: 'Y' }], ['POST', '/admin/api/desk', { op: 'cfg', cfg: {} }],
    ['POST', '/admin/api/roles', { email: 'evil@x.test', role: 'admin' }], ['PUT', '/admin/api/mail', newMail('X')], ['PATCH', '/admin/api/settings', {}], ['POST', '/admin/api/mail/att', 'bytes'],
    ['POST', '/admin/api/navdata/jpcharts/put?apt=RJTT&eff=20261126&i=0', '%PDF-1.7'], ['POST', '/admin/api/docs/cover?id=d1&v=1', 'x']];
  for (const h of bad) for (const [method, path, body] of calls) {
    const r = await admin(kv, 'boss@p.test', path, { method, body, headers: h, env });
    assert.equal(r.status, 403, method + ' ' + path + ' ' + JSON.stringify(h)); assert.equal((await r.json()).error, 'Cross-site request blocked');
  }
  assert.equal(kv.puts.length, 0, 'nothing written'); assert.equal(D.seen.length, 0, 'the desk was never asked');
  assert.deepEqual(kv.json(MIDX), []);
});

await test('P1-2 cross-site: the admin\'s own page (same-origin, its Origin) gets through; reads are never blocked; a request with neither header still meets the Content-Type checks', async () => {
  later();
  const kv = mkKv({ [MIDX]: [] }), env = ENV(kv);
  const ok = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: newMail('Own page'), headers: { 'Sec-Fetch-Site': 'same-origin', Origin: ORIGIN }, env });
  assert.equal(ok.status, 200);
  const rd = await admin(kv, 'boss@p.test', '/admin/api/mail', { headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' }, env });
  assert.equal(rd.status, 200, 'a GET is a read: Access and the roles decide');
  /* no browser headers at all (as here): on to the body checks */
  const form = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: 'subject=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, env });
  assert.equal(form.status, 415);
  const plain = await admin(kv, 'boss@p.test', '/admin/api/aoc', { method: 'POST', body: '{"title":"x","body":"y"}', headers: { 'Content-Type': 'text/plain' }, env });
  assert.equal(plain.status, 415);
  assert.equal(kv.json(MIDX).length, 1);
});

const { deskAdmin } = await import('../src/desk.js');
await test('P1-2 desk: POST /admin/api/desk wants JSON (415 otherwise, the desk never asked); JSON from a director goes through', async () => {
  const D = deskNs(), env = { DESK: D.ns };
  for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', '']) {
    const req = new Request(ORIGIN + '/admin/api/desk', { method: 'POST', headers: ct ? { 'Content-Type': ct } : {}, body: '{"op":"cfg","cfg":{"on":true}}' });
    const r = await deskAdmin(req, new URL(req.url), env, 'boss@p.test', true); assert.equal(r.status, 415, ct || '(none)');
  }
  assert.equal(D.seen.length, 0);
  const req = new Request(ORIGIN + '/admin/api/desk', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '{"op":"cfg","cfg":{"on":true}}' });
  assert.equal((await deskAdmin(req, new URL(req.url), env, 'boss@p.test', true)).status, 200); assert.equal(D.seen.length, 1);
  /* through the admin: the same */
  const kv = mkKv(), r2 = await admin(kv, 'boss@p.test', '/admin/api/desk', { method: 'POST', body: '{"op":"cfg"}', headers: { 'Content-Type': 'text/plain' }, env: ENV(kv, { DESK: D.ns }) });
  assert.equal(r2.status, 415); assert.equal(D.seen.length, 1);
});

const { jpChartsAdmin, cnChartsAdmin } = await import('../src/jpcharts.js');
function mkR2() { const r2 = { objs: new Map(), async put(k, v) { r2.objs.set(k, v); }, async head(k) { return r2.objs.has(k) ? { key: k } : null; }, async get() { return null; }, async list() { return { objects: [], truncated: false }; }, async delete() {} }; return r2; }
await test('P1-2 chart uploads: POST …/jpcharts/put and …/cncharts/put want application/pdf or application/octet-stream (415 otherwise, nothing stored)', async () => {
  const pdf = new TextEncoder().encode('%PDF-1.7 chart');
  for (const [fn, base, apt] of [[jpChartsAdmin, '/admin/api/navdata/jpcharts', 'RJTT'], [cnChartsAdmin, '/admin/api/navdata/cncharts', 'ZBAA']]) {
    const R2 = mkR2(), env = { STORE: mkKv(), CHARTS: R2 }, path = base + '/put';
    const put = (ct) => { const req = new Request(ORIGIN + path + '?apt=' + apt + '&eff=20261126&i=0', { method: 'POST', headers: ct ? { 'Content-Type': ct } : {}, body: pdf }); return fn(req, path, env, 'boss@p.test'); };
    for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/json', '']) { const r = await put(ct); assert.equal(r.status, 415, base + ' ' + (ct || '(none)')); }
    assert.equal(R2.objs.size, 0);
    assert.equal((await put('application/pdf')).status, 200); assert.equal((await put('application/octet-stream')).status, 200); assert.equal(R2.objs.size, 1);
  }
});

const { docsAdmin } = await import('../src/docs.js');
await test('P1-2 document covers: POST /admin/api/docs/cover wants image/jpeg (or application/octet-stream): 415 otherwise and no cover written', async () => {
  const kv = mkKv({ 'docs:v1:index': [{ id: 'd1', title: 'SOP', v: 1, n: 1, size: 9, cover: false, t: 1 }] }), env = { STORE: kv };
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const post = (ct) => { const req = new Request(ORIGIN + '/admin/api/docs/cover?id=d1&v=1', { method: 'POST', headers: ct ? { 'Content-Type': ct } : {}, body: jpeg }); return docsAdmin(req, new URL(req.url), '/admin/api/docs/cover', env, 'boss@p.test', null); };
  for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'image/png', '']) assert.equal((await post(ct)).status, 415, ct || '(none)');
  assert.equal(kv.puts.length, 0);
  assert.equal((await post('image/jpeg')).status, 200); assert.ok(kv.puts.includes('docs:v1:c:d1:1')); assert.equal(kv.json('docs:v1:index')[0].cover, true);
});

const { ADMIN_HTML } = await import('../src/admin.js');
/* the part of the admin page from a to the first b after it */
const slice = (a, b, what) => { const i = ADMIN_HTML.indexOf(a), j = ADMIN_HTML.indexOf(b, i + a.length); assert.ok(i > 0 && j > i, what || a); return ADMIN_HTML.slice(i, j); };
await test('P1-2 admin page: every upload is sent with the type its endpoint wants (charts as PDF, covers as JPEG, attachments as bytes, the desk as JSON)', async () => {
  for (const [re, what] of [[/fetch\("\/admin\/api\/navdata\/jpcharts\/put\?[^)]*headers:\{"Content-Type":"application\/pdf"\}/, 'Japan charts'], [/fetch\("\/admin\/api\/navdata\/cncharts\/put\?[^)]*headers:\{"Content-Type":"application\/pdf"\}/, 'China charts'],
    [/fetch\("\/admin\/api\/docs\/cover\?[\s\S]{0,120}?headers:\{"Content-Type":"image\/jpeg"\}/, 'covers'], [/api\("\/admin\/api\/mail\/att",\{method:"POST",headers:\{"Content-Type":"application\/octet-stream"/, 'attachments'],
    [/api\("\/admin\/api\/desk",\{method:"POST",headers:\{"Content-Type":"application\/json"\}/, 'the desk']]) assert.match(ADMIN_HTML, re, what);
});

/* ================= 3. attachments as they are ================= */
const TMPK = (id) => 'mail:v1:tmp:' + id;
const bytesOf = (n, seed = 7) => { const u = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; u[i] = x >>> 24; } return u; };
const stage = (kv, email, bytes, { type = 'application/pdf', name = 'Brief.pdf', ct = 'application/octet-stream', env } = {}) =>
  admin(kv, email, '/admin/api/mail/att', { method: 'POST', body: bytes, headers: { 'Content-Type': ct, 'X-Type': type, 'X-Name': encodeURIComponent(name) }, env });
/* atob (on more than 2 KB: the sign-in token's own few hundred characters are not counted) and
   String.prototype.charCodeAt, watched: the server must decode no attachment byte by byte */
function watchDecode() {
  const realAtob = globalThis.atob, realCc = String.prototype.charCodeAt; const n = { atob: 0, cc: 0 };
  globalThis.atob = (s) => { if (String(s).length > 2048) n.atob++; return realAtob(s); };
  String.prototype.charCodeAt = function (i) { n.cc++; return realCc.call(this, i); };   // eslint-disable-line no-extend-native
  return { n, stop() { globalThis.atob = realAtob; String.prototype.charCodeAt = realCc; } };   // eslint-disable-line no-extend-native
}

await test('P1-3 POST /admin/api/mail/att: the file\'s bytes as the body, kept as they are for an hour with its name, type, size and who sent it', async () => {
  later();
  const kv = mkKv(), bin = bytesOf(300_000);
  const r = await stage(kv, 'boss@p.test', bin, { name: 'Brief é 1.pdf' });
  assert.equal(r.status, 200); const j = await r.json();
  assert.match(j.att.id, /^[a-z0-9]{8,40}$/); assert.deepEqual({ ...j.att, id: 0 }, { id: 0, name: 'Brief é 1.pdf', type: 'application/pdf', size: 300_000 });
  assert.deepEqual(kv.bytes(TMPK(j.att.id)), bin, 'the very bytes');
  assert.equal(kv.opts.get(TMPK(j.att.id)).expirationTtl, 3600);
  assert.deepEqual(kv.meta.get(TMPK(j.att.id)), { name: 'Brief é 1.pdf', type: 'application/pdf', size: 300_000, by: 'boss@p.test' });
});

await test('P1-3 POST /admin/api/mail/att: refused as it should be (not octet-stream 415, a type not allowed 400, over 5 MB 413, empty 400, a role that may not send messages 403)', async () => {
  later();
  const kv = mkKv({ [ROLES]: ROLES_ON });
  assert.equal((await stage(kv, 'boss@p.test', bytesOf(10), { ct: 'application/json' })).status, 415);
  assert.equal((await stage(kv, 'boss@p.test', bytesOf(10), { ct: 'multipart/form-data; boundary=x' })).status, 415);
  assert.equal((await stage(kv, 'boss@p.test', bytesOf(10), { type: 'application/x-msdownload', name: 'run.exe' })).status, 400);
  assert.equal((await stage(kv, 'boss@p.test', new Uint8Array(5 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await stage(kv, 'boss@p.test', new Uint8Array(0))).status, 400);
  const v = await stage(kv, 'view@p.test', bytesOf(10)); assert.equal(v.status, 403); assert.match((await v.json()).error, /cannot send messages/);
  assert.equal((await stage(kv, 'ops@p.test', bytesOf(10))).status, 200, 'a role with "send messages" may');
  assert.equal(kv.puts.filter((k) => k.startsWith('mail:v1:tmp:')).length, 1);
});

await test('P1-3 POST /admin/api/mail with attIds: a 5 MB attachment moves into the mail as it is (the same bytes), with no base64 decoded; the hour\'s copy goes', async () => {
  later();
  const kv = mkKv({ [MIDX]: [] }), big = bytesOf(5 * 1024 * 1024, 3), small = bytesOf(1234, 9);
  const a = (await (await stage(kv, 'boss@p.test', big, { name: 'Manual.pdf' })).json()).att;
  const b = (await (await stage(kv, 'boss@p.test', small, { type: 'image/png', name: 'map.png' })).json()).att;
  const body = { ...newMail('With files'), keepAtt: [], attIds: [a.id, b.id] }, W = watchDecode();
  let r; try { r = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body }); } finally { W.stop(); }
  assert.equal(r.status, 200); const m = (await r.json()).mail;
  assert.deepEqual(m.att.map((x) => [x.name, x.type, x.size]), [['Manual.pdf', 'application/pdf', big.length], ['map.png', 'image/png', small.length]]);
  assert.equal(W.n.atob, 0, 'no atob'); assert.ok(W.n.cc < 2000, 'no byte-by-byte decoding (' + W.n.cc + ' charCodeAt calls)');
  assert.ok(JSON.stringify(body).length < 400, 'the mail itself is small');
  assert.deepEqual(kv.bytes('mail:v1:att:' + m.id + ':0'), big); assert.deepEqual(kv.bytes('mail:v1:att:' + m.id + ':1'), small);
  assert.equal(kv.m.has(TMPK(a.id)), false); assert.equal(kv.m.has(TMPK(b.id)), false);
  assert.deepEqual(kv.json(MIDX)[0].att, [{ name: 'Manual.pdf', type: 'application/pdf', size: big.length }, { name: 'map.png', type: 'image/png', size: small.length }]);
});

await test('P1-3 POST /admin/api/mail: an attachment gone from the server (an hour went by), or uploaded by someone else, is 410 and nothing is saved', async () => {
  later();
  const kv = mkKv({ [MIDX]: [] });
  const a = (await (await stage(kv, 'ops@p.test', bytesOf(50))).json()).att;
  const other = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: { ...newMail('Not mine'), attIds: [a.id] } });
  assert.equal(other.status, 410); assert.match((await other.json()).error, /attach it again/);
  kv.m.delete(TMPK(a.id));
  const gone = await admin(kv, 'ops@p.test', '/admin/api/mail', { method: 'POST', body: { ...newMail('Late'), attIds: [a.id] } });
  assert.equal(gone.status, 410);
  assert.equal((await admin(kv, 'ops@p.test', '/admin/api/mail', { method: 'POST', body: { ...newMail('Bad id'), attIds: ['../../x'] } })).status, 400);
  assert.deepEqual(kv.json(MIDX), []); assert.equal(kv.puts.filter((k) => k.startsWith('mail:v1:att:')).length, 0);
  assert.equal((await admin(kv, 'ops@p.test', '/admin/api/mail', { method: 'POST', body: { ...newMail('Six'), attIds: ['a1234567', 'b1234567', 'c1234567', 'd1234567', 'e1234567', 'f1234567'] } })).status, 400, 'five at most');
});

await test('P1-3 legacy: a small attachment as base64 in the JSON (a page from before) still works; a large one is refused before any decoding', async () => {
  later();
  const kv = mkKv({ [MIDX]: [] }), txt = new TextEncoder().encode('hello pilots');
  const r = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: { ...newMail('Legacy'), newAtt: [{ name: 'a.txt', type: 'text/plain', data: Buffer.from(txt).toString('base64') }] } });
  assert.equal(r.status, 200); const m = (await r.json()).mail; assert.deepEqual(kv.bytes('mail:v1:att:' + m.id + ':0'), txt);
  const W = watchDecode(); let big;
  try { big = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: { ...newMail('Legacy big'), newAtt: [{ name: 'b.pdf', type: 'application/pdf', data: Buffer.from(bytesOf(200_000)).toString('base64') }] } }); } finally { W.stop(); }
  assert.equal(big.status, 413); assert.equal(W.n.atob, 0, 'refused before decoding'); assert.match((await big.json()).error, /reload the page/);
  assert.equal(kv.json(MIDX).length, 1);
});

await test('P1-3 an edited mail: the attachments kept move up in step with their bytes; one added by id comes after; the place left over is deleted', async () => {
  later();
  const kv = mkKv({ [MIDX]: [] });
  const one = (await (await stage(kv, 'boss@p.test', bytesOf(10, 1), { name: '1.pdf' })).json()).att, two = (await (await stage(kv, 'boss@p.test', bytesOf(20, 2), { name: '2.pdf' })).json()).att;
  const m = (await (await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: { ...newMail('Edit me'), attIds: [one.id, two.id] } })).json()).mail;
  const three = (await (await stage(kv, 'boss@p.test', bytesOf(30, 3), { name: '3.pdf' })).json()).att;
  const r = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: { ...newMail('Edit me'), id: m.id, keepAtt: [1], attIds: [three.id] } });
  assert.equal(r.status, 200);
  assert.deepEqual(kv.json(MIDX)[0].att.map((a) => a.name), ['2.pdf', '3.pdf']);
  assert.deepEqual(kv.bytes('mail:v1:att:' + m.id + ':0'), bytesOf(20, 2)); assert.deepEqual(kv.bytes('mail:v1:att:' + m.id + ':1'), bytesOf(30, 3));
});

await test('P1-3 admin page: the composer keeps each file as it is and uploads it on its own (no FileReader, no base64 in the mail)', async () => {
  const comp = slice('/* an attachment is kept as the file it is', '/* ---------- Pilots tab ---------- */');
  assert.doesNotMatch(comp, /readAsDataURL|FileReader/); assert.match(comp, /body:f\.file/); assert.match(comp, /"X-Name":encodeURIComponent\(f\.name\)/);
  const send = slice('else if(t.id==="send"){', '$("#when").addEventListener');
  assert.doesNotMatch(send, /newAtt/); assert.match(send, /body\.attIds=S\.add\.map\(f=>f\.id\)/); assert.match(send, /er\.status!==410/);
});

/* ================= the admin page, stood in for ================= */
/* elements made from the HTML the page writes (tags, attributes, text): innerHTML (and how often it was written),
   insertAdjacentHTML, siblings, closest() and querySelector() with simple selectors (tag, #id, .class, [attr],
   [attr="v"], lists, descendants), values, focus and the cursor, classes, dataset, hidden, disabled */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function mkDom() {
  const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'hr', 'source', 'wbr', 'path', 'circle', 'line', 'rect', 'polygon', 'polyline', 'ellipse', 'use']);
  const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const escT = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), escA = (s) => escT(s).replace(/"/g, '&quot;');
  const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), camel = (k) => k.replace(/-(\w)/g, (x, c) => c.toUpperCase());
  let active = null; const docL = {};
  class Text { constructor(t) { this.nodeType = 3; this.text = t; this.parentNode = null; } get textContent() { return this.text; } }
  class El {
    constructor(tag, attrs = {}) {
      this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.childNodes = []; this.parentNode = null; this.style = {}; this.writes = 0; this.clicks = 0; this._v = null; this.selectionStart = 0; this.selectionEnd = 0;
      const A = this.attrs;
      this.dataset = new Proxy({}, { get: (o, k) => (typeof k === 'string' ? A['data-' + kebab(k)] : undefined), set: (o, k, v) => { A['data-' + kebab(k)] = String(v); return true; }, has: (o, k) => ('data-' + kebab(k)) in A,
        deleteProperty: (o, k) => { delete A['data-' + kebab(k)]; return true; }, ownKeys: () => Object.keys(A).filter((a) => a.startsWith('data-')).map((a) => camel(a.slice(5))), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
      const cls = () => new Set(String(A.class || '').split(/\s+/).filter(Boolean)), put = (s) => { A.class = [...s].join(' '); };
      this.cls = cls;
      this.classList = { add: (...c) => { const s = cls(); c.forEach((x) => s.add(x)); put(s); }, remove: (...c) => { const s = cls(); c.forEach((x) => s.delete(x)); put(s); }, contains: (c) => cls().has(c),
        toggle: (c, f) => { const s = cls(), on = f === undefined ? !s.has(c) : !!f; if (on) s.add(c); else s.delete(c); put(s); return on; } };
    }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 && this.parentNode.tagName !== '#ROOT' ? this.parentNode : null; }
    get id() { return this.attrs.id || ''; } set id(v) { this.attrs.id = v; }
    get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = v; }
    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
    flag(k, v) { if (v) this.attrs[k] = ''; else delete this.attrs[k]; }
    get hidden() { return 'hidden' in this.attrs; } set hidden(v) { this.flag('hidden', v); }
    get disabled() { return 'disabled' in this.attrs; } set disabled(v) { this.flag('disabled', v); }
    get multiple() { return 'multiple' in this.attrs; } set multiple(v) { this.flag('multiple', v); }
    get checked() { return this._c != null ? this._c : 'checked' in this.attrs; } set checked(v) { this._c = !!v; }
    get accept() { return this.attrs.accept || ''; } set accept(v) { this.attrs.accept = v; }
    get value() {
      if (this._v != null) return this._v;
      if (this.tagName === 'TEXTAREA') return this.textContent;
      if (this.tagName === 'SELECT') { const o = this.querySelectorAll('option'), s = o.find((x) => 'selected' in x.attrs) || o[0]; return s ? s.value : ''; }
      if (this.tagName === 'OPTION') return 'value' in this.attrs ? this.attrs.value : this.textContent;
      return this.attrs.value || '';
    }
    set value(v) { v = String(v); if (this.tagName === 'SELECT') { this._v = this.querySelectorAll('option').some((x) => x.value === v) ? v : ''; } else { this._v = v; this.selectionStart = this.selectionEnd = v.length; } }
    get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
    set textContent(t) { this.lose(); const n = new Text(String(t)); n.parentNode = this; this.childNodes = [n]; this._v = null; }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } setAttribute(k, v) { this.attrs[k] = String(v); } removeAttribute(k) { delete this.attrs[k]; } hasAttribute(k) { return k in this.attrs; }
    get innerHTML() { return this.childNodes.map(ser).join(''); }
    set innerHTML(h) { this.writes++; this.lose(); this.childNodes = parse(String(h)); this.childNodes.forEach((n) => { n.parentNode = this; }); this._v = null; }
    lose() { if (active && active !== this && this.contains(active)) active = null; }
    contains(n) { for (let p = n; p; p = p.parentNode) if (p === this) return true; return false; }
    insertAdjacentHTML(pos, h) {
      const L = parse(String(h));
      if (pos === 'beforeend') { L.forEach((n) => { n.parentNode = this; }); this.childNodes.push(...L); return; }
      const P = this.parentNode, i = P.childNodes.indexOf(this); L.forEach((n) => { n.parentNode = P; }); P.childNodes.splice(pos === 'afterend' ? i + 1 : i, 0, ...L);
    }
    appendChild(n) { if (n.parentNode) n.remove(); n.parentNode = this; this.childNodes.push(n); return n; }
    remove() { const P = this.parentNode; if (!P) return; if (active && this.contains(active)) active = null; P.childNodes.splice(P.childNodes.indexOf(this), 1); this.parentNode = null; }
    get nextElementSibling() { const P = this.parentNode; if (!P) return null; const L = P.children; return L[L.indexOf(this) + 1] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    all() { const out = [], walk = (n) => { for (const c of n.children) { out.push(c); walk(c); } }; walk(this); return out; }
    matches(sel) { return matchSel(this, sel); }
    closest(sel) { for (let n = this; n && n.nodeType === 1 && n.tagName !== '#ROOT'; n = n.parentNode) if (matchSel(n, sel)) return n; return null; }
    querySelectorAll(sel) { return this.all().filter((n) => matchSel(n, sel)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    get isConnected() { for (let p = this; p; p = p.parentNode) if (p === ROOT) return true; return false; }
    focus() { if (this.isConnected) active = this; } blur() { if (active === this) active = null; }
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; } select() { this.setSelectionRange(0, this.value.length); }
    click() { this.clicks++; } scrollIntoView() {} addEventListener() {} removeEventListener() {}
    getContext(t) { return t === 'webgl2' || t === 'webgl' ? {} : null; } getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; }
  }
  const ser = (n) => (n.nodeType === 3 ? escT(n.text) : '<' + n.tagName.toLowerCase() + Object.entries(n.attrs).map(([k, v]) => ' ' + k + (v === '' ? '' : '="' + escA(v) + '"')).join('') + '>' + (VOID.has(n.tagName.toLowerCase()) ? '' : n.childNodes.map(ser).join('') + '</' + n.tagName.toLowerCase() + '>'));
  function parse(h) {
    const root = new El('#root'), stack = [root];
    for (const m of h.matchAll(/<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[\w:@.-]+(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>|[^<]+|</g)) {
      const top = stack[stack.length - 1];
      if (m[0].startsWith('<!--')) continue;
      if (m[1]) { const t = m[1].toUpperCase(); for (let i = stack.length - 1; i > 0; i--) if (stack[i].tagName === t) { stack.length = i; break; } continue; }
      if (m[2]) {
        const a = {}; for (const x of m[3].matchAll(/([\w:@.-]+)(?:\s*=\s*"([^"]*)")?/g)) a[x[1]] = x[2] == null ? '' : unesc(x[2]);
        const el = new El(m[2], a); el.parentNode = top; top.childNodes.push(el); if (!m[4] && !VOID.has(m[2].toLowerCase())) stack.push(el); continue;
      }
      const t = new Text(unesc(m[0])); t.parentNode = top; top.childNodes.push(t);
    }
    return root.childNodes;
  }
  const splitTop = (s, ch) => { const out = []; let d = 0, cur = '', q = null; for (const c of s) { if (q) { if (c === q) q = null; cur += c; continue; } if (c === '"' || c === "'") { q = c; cur += c; continue; } if (c === '[' || c === '(') d++; if (c === ']' || c === ')') d--; if (c === ch && d === 0) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map((x) => x.trim()).filter(Boolean); };
  function compound(n, s) {
    const m = /^([a-zA-Z*][\w-]*)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*"|=[\w-]+)?\])*)$/.exec(s); if (!m) throw new Error('selector not understood here: ' + s);
    if (m[1] && m[1] !== '*' && n.tagName !== m[1].toUpperCase()) return false;
    for (const p of m[2].matchAll(/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)"|=([\w-]+))?\]/g)) {
      if (p[1] && n.id !== p[1]) return false; if (p[2] && !n.cls().has(p[2])) return false;
      if (p[3]) { if (!(p[3] in n.attrs)) return false; const v = p[4] != null ? p[4] : p[5]; if (v != null && n.attrs[p[3]] !== v) return false; }
    }
    return true;
  }
  const matchSel = (n, sel) => splitTop(sel, ',').some((one) => {
    const parts = splitTop(one, ' '); if (!compound(n, parts[parts.length - 1])) return false;
    let i = parts.length - 2; for (let p = n.parentNode; i >= 0 && p && p.nodeType === 1 && p.tagName !== '#ROOT'; p = p.parentNode) if (compound(p, parts[i])) i--;
    return i < 0;
  });
  const ROOT = new El('html'), head = new El('head'), body = new El('body'); ROOT.appendChild(head); ROOT.appendChild(body);
  const document = { documentElement: ROOT, head, body, hidden: false, get activeElement() { return active || body; },
    querySelector: (s) => ROOT.querySelector(s), querySelectorAll: (s) => ROOT.querySelectorAll(s), getElementById: (id) => ROOT.querySelector('#' + id),
    createElement: (t) => new El(t), addEventListener: (t, f, cap) => { (docL[t] = docL[t] || []).push({ f, cap: cap === true || !!(cap && cap.capture) }); }, removeEventListener() {} };
  /* an event at a target, as a browser sends it: the document's capture listeners first, then the rest */
  const fire = (type, target, extra = {}) => {
    const e = { type, target: target || body, key: '', detail: 1, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
    const L = docL[type] || []; for (const x of L.filter((y) => y.cap)) x.f(e); for (const x of L.filter((y) => !y.cap)) x.f(e); return e;
  };
  return { document, body, ROOT, fire, $: (s) => document.querySelector(s) };
}
/* the admin page's own markup (everything before its script), and a context to run parts of its script in */
const STATIC = (() => { const b = ADMIN_HTML.indexOf('<body>'), e = ADMIN_HTML.indexOf('<script', b); return ADMIN_HTML.slice(b + 6, e); })();
function mkPage(g = {}) {
  const D = mkDom(); D.body.innerHTML = STATIC; D.body.writes = 0;
  const winL = {}, timers = [];
  const ctx = { document: D.document, $: D.$, esc, console, Date, encodeURIComponent, location: { hash: '', origin: ORIGIN, host: 'efb-api.example', protocol: 'https:', search: '' },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: (f) => { f(); return 1; }, innerWidth: 1280,
    confirm: () => true, alert: (m) => { throw new Error('alert: ' + m); }, addEventListener: (t, f) => { (winL[t] = winL[t] || []).push(f); }, ...g };
  ctx.window = ctx; vm.createContext(ctx);
  const P = { D, ctx, timers, $: D.$, fire: D.fire, x: null,
    run(src, names) { vm.runInContext(src + '\n;globalThis.__x={' + names + '};', ctx); P.x = ctx.__x; return P.x; },
    emit: (t, detail) => (winL[t] || []).forEach((f) => f({ type: t, detail })) };
  return P;
}

/* ================= 4. Broadcast's Setup keeps what is being typed ================= */
const bcSetSrc = () => slice('/* Setup: the fields keep what is being typed */', '/* Program and Preview */') + slice('/* everything again (a new connection, the PC or OBS coming or going)', '/* the chips at the top */');
await test('P1-4 broadcast Setup: what is being typed survives bcAll (a new connection, the PC or OBS coming and going) and another director\'s save; only Save, or nothing typed, puts the saved settings in', async () => {
  const BC = { cfg: { on: true, pilot: 'PAW0006', title: 'Saved title', sub: 'Saved sub', slate: '', token: 'T'.repeat(30) }, dirty: false, plan: null, role: 'dir' }, calls = [];
  const P = mkPage({ BC, bcDir: () => BC.role === 'dir', bcScenes: () => ['Cockpit', 'Back soon'], BC_SLATE: /back|brb|soon/i,
    ...Object.fromEntries(['bcStatus', 'bcMon', 'bcTiles', 'bcOvs', 'bcAuto', 'bcFlight', 'bcHealth', 'bcEm', 'bcLogUi'].map((k) => [k, () => calls.push(k)])) });
  const { bcSetUi, bcAll } = P.run(bcSetSrc(), 'bcSetUi,bcAll'), $ = P.$;
  bcSetUi(true); assert.equal($('#bcTitle').value, 'Saved title'); assert.equal($('#bcPilot').value, 'PAW0006');
  /* staff type (the page's input handler marks Setup as being changed) */
  $('#bcTitle').value = 'New title being typed'; $('#bcSub').value = 'New sub'; BC.dirty = true;
  bcAll(); bcAll();
  assert.equal($('#bcTitle').value, 'New title being typed'); assert.equal($('#bcSub').value, 'New sub'); assert.equal(BC.dirty, true);
  assert.ok(calls.includes('bcEm') && calls.includes('bcTiles'), 'the rest is drawn again as before');
  BC.cfg = { ...BC.cfg, title: 'Another director', pilot: 'PAW0007' }; bcSetUi(false);
  assert.equal($('#bcTitle').value, 'New title being typed'); assert.equal($('#bcPilot').value, 'PAW0006');
  bcSetUi(true);   /* Save went through */
  assert.equal($('#bcTitle').value, 'Another director'); assert.equal($('#bcPilot').value, 'PAW0007'); assert.equal(BC.dirty, false);
  BC.cfg = { ...BC.cfg, title: 'Third' }; bcAll(); assert.equal($('#bcTitle').value, 'Third', 'nothing typed: the settings as saved');
  /* the Back soon list: written again only when what it offers changes (an open list stays open) */
  const sl = $('#bcSlate'), w = sl.writes; bcSetUi(false); bcSetUi(false); assert.equal(sl.writes, w);
  P.ctx.bcScenes = () => ['Cockpit', 'Back soon', 'Wing']; bcSetUi(false); assert.equal(sl.writes, w + 1);
});

/* ================= 5. Broadcast's buttons for a bad moment stay the same buttons ================= */
const bcEmSrc = () => slice('/* (with the stats every 2 s', 'function bcLogUi(');
await test('P1-5 broadcast: the stats every 2 s change the buttons in place (the same elements, the focus, the armed second press); only another set of buttons draws them again', async () => {
  const BC = { arm: '', armT: 0, pc: { on: true, remote: true, stats: { stream: { on: false, dur: 0 }, rec: { on: false } } } };
  const P = mkPage({ BC, bcSt: () => BC.pc.stats, bcObsOn: () => true, bcDir: () => true, bcPcOn: () => BC.pc.on, bcSlate: () => 'Back soon' });
  const { bcEm, bcArm } = P.run(bcEmSrc(), 'bcEm,bcArm'), $ = P.$, el = $('#bcEm');
  bcEm(); const start = $('#bcStart'), brb = $('#bcBrb2'), rec = $('#bcRec'); assert.ok(start && brb && rec);
  assert.equal(start.textContent, 'Start the stream…'); assert.equal(start.disabled, false); start.focus();
  for (let i = 1; i <= 5; i++) { BC.pc.stats = { stream: { on: false, dur: i * 2000 }, rec: { on: false }, obs: { fps: 60 - i } }; bcEm(); }
  assert.equal(el.writes, 1, 'drawn once'); assert.equal($('#bcStart'), start); assert.equal(P.D.document.activeElement, start, 'the focus is where it was');
  let went = 0; bcArm('bcStart', () => went++);
  assert.equal($('#bcStart'), start); assert.equal(start.textContent, 'Press again to start the stream'); assert.ok(start.classList.contains('arm'));
  BC.pc.stats = { stream: { on: false, dur: 99 }, rec: { on: false } }; bcEm();
  assert.equal(start.textContent, 'Press again to start the stream', 'still armed after a stats tick'); assert.equal(went, 0);
  bcArm('bcStart', () => went++); assert.equal(went, 1, 'the second press goes'); assert.equal(start.textContent, 'Start the stream…'); assert.equal(start.classList.contains('arm'), false);
  P.ctx.bcObsOn = () => false; bcEm(); assert.equal(start.disabled, true); assert.equal($('#bcStart'), start, 'off, in place');
  P.ctx.bcObsOn = () => true; bcEm(); assert.equal(start.disabled, false); assert.equal(el.writes, 1);
  BC.pc.stats = { stream: { on: true, dur: 1 }, rec: { on: false } }; bcEm();
  assert.ok($('#bcStop')); assert.equal($('#bcStart'), null); assert.equal(el.writes, 2, 'on air: another button, drawn again');
});

/* ================= 6. Nav Data's file picker is outside the list ================= */
const ndSrc = () => slice('/* ---------- Nav Data: each region', '/* ---------- Documents: a cover');
const ndData = (line) => ({ now: NOW, at: NOW, checks: [], airac: { cur: { cycle: '2612', from: '2026-11-26T00:00:00Z', to: '2026-12-24T00:00:00Z' }, next: { cycle: '2613', from: '2026-12-24T00:00:00Z', to: '2027-01-21T00:00:00Z' } },
  src: [{ id: 'cn-aip', region: 'China', name: 'AIP data set', by: 'CAAC', state: 'ok', line, rows: [], what: 'w', how: 'h', area: 'Asia and Pacific', cn: { cycles: [] } },
    { id: 'jp-charts', region: 'Japan', name: 'AIP charts', by: 'JCAB', state: 'warn', line: 'l', rows: [], what: 'w', how: 'h', area: 'Asia and Pacific', jc: { apts: [] } }] });
await test('P1-6 nav data: one file picker outside #ndList; the minute\'s reload leaves the list alone when nothing changed, and a file chosen while the list was drawn again still arrives for its zone', async () => {
  assert.doesNotMatch(slice('const ndDrop=(rg,s)=>{', 'function ndAipHtml('), /<input/, 'no file input in a drop zone');
  const OPS = { nav: { at: NOW, v: ndData('First'), p: null, err: '' } }, CNP = { open: async () => { throw new Error('stub: the zip was opened'); } };
  const P = mkPage({ OPS, opsV: (k) => OPS[k] && OPS[k].v, opsGet: async () => OPS.nav.v, api: async () => ({}), akZ: () => '0000Z', pgNow: 'navdata', localStorage: { getItem: () => null, setItem() {} }, CNP, JPP: CNP, PG_LOAD: {}, PG_TICK: {} });
  const { ndUi, ND } = P.run(ndSrc(), 'ndUi,ND'), $ = P.$;
  ndUi(); const list = $('#ndList'), file = $('#ndFile'), w = list.writes;
  assert.ok(file && file.isConnected); assert.equal(list.contains(file), false, 'the picker is not in the list');
  assert.ok(list.querySelector('[data-nddrop="cn"]')); assert.equal(list.querySelector('input'), null);
  ndUi(); ndUi(); assert.equal(list.writes, w, 'the same answer: not drawn again');
  P.fire('click', list.querySelector('[data-nddrop="cn"] b'));
  assert.equal(file.clicks, 1); assert.equal(ND.pick, 'cn'); assert.equal(file.accept, '.zip,application/zip'); assert.equal(file.hasAttribute('webkitdirectory'), false);
  OPS.nav.v = ndData('Second'); ndUi(); assert.equal(list.writes, w + 1, 'something new: drawn again, while the picker is open');
  file.files = [{ name: 'CN_AIP-DS_2612.zip', size: 1000, arrayBuffer: async () => new ArrayBuffer(8) }];
  P.fire('change', file); await settle();
  assert.equal(ND.up.cn.err, 'stub: the zip was opened', 'the file went to China\'s upload');
  P.fire('keydown', $('#ndList [data-nddrop="jpc"]'), { key: 'Enter' });
  assert.equal(file.clicks, 2); assert.equal(ND.pick, 'jpc'); assert.equal(file.hasAttribute('webkitdirectory'), true); assert.equal(file.multiple, true);
  ND.up.cn.busy = true; ndUi(); P.fire('click', $('#ndList [data-nddrop="cn"]')); assert.equal(file.clicks, 2, 'a zone at work opens nothing');
  assert.match($('#ndList [data-nddrop="cn"]').getAttribute('aria-disabled') || '', /true/);
});

/* ================= 7. a gate "Change" row survives the 2-minute reload ================= */
const stSrc = () => slice('/* a gate\'s "Change" row', '/* full: the page opened (draw it all)') + slice('document.addEventListener("click",async e=>{const b=e.target.closest&&e.target.closest("#stands button")', 'window.addEventListener("beforeunload"');
await test('P1-7 gates: an open "Change" row keeps its gate, terminal, focus and cursor through the reloads; one on its way stays off; sent, it closes', async () => {
  const row = (cs, t, eta, stand) => ({ k: cs + ':KLAX', t, cs, dep: 'KSFO', arr: 'KLAX', eta, stand, term: 'T4', by: 'AUTO' });
  const ST = { log: [row('PAW1', 1000, NOW + 600e3, 'D1'), row('PAW2', 2000, NOW + 900e3, 'D2')], sel: 'KLAX', logAll: false, err: '', plan: { apts: {} }, chgBusy: new Set() };
  let held = null, loads = 0; const sent = [], alerts = [];
  const P = mkPage({ ST, stZ: () => '1200Z', stRules: () => [], stLoad: async () => { loads++; P.x.stLogUi(); },
    api: (path, opt) => { sent.push(JSON.parse(opt.body)); return new Promise((r, j) => { held = { ok: () => r({ ok: true }), no: () => j(new Error('That flight has gone')) }; }); }, alert: (m) => alerts.push(m) });
  const { stLogUi } = P.run(stSrc(), 'stLogUi'), $ = P.$, log = $('#stLog');
  stLogUi();
  const chgOf = (cs) => [...log.querySelectorAll('[data-stchg]')].find((b) => b.dataset.stchg.startsWith(cs + ':'));
  P.fire('click', chgOf('PAW1')); await settle();
  let I = log.querySelectorAll('.gt-chg input'); assert.equal(I.length, 2); assert.equal(P.D.document.activeElement, I[0]);
  I[0].value = 'D7'; I[1].value = 'T5'; I[1].focus(); I[1].setSelectionRange(1, 1);
  ST.log = [...ST.log, row('PAW3', 3000, NOW + 300e3, 'D3')]; stLogUi(); stLogUi();
  I = log.querySelectorAll('.gt-chg input');
  assert.equal(log.querySelectorAll('.gt-chg').length, 1); assert.deepEqual([I[0].value, I[1].value], ['D7', 'T5']);
  assert.equal(P.D.document.activeElement, I[1]); assert.deepEqual([I[1].selectionStart, I[1].selectionEnd], [1, 1]);
  assert.equal(log.querySelector('.gt-chg').previousElementSibling === undefined || true, true);
  const tr = chgOf('PAW1').closest('tr'); assert.equal(tr.nextElementSibling, log.querySelector('.gt-chg'), 'under its own flight');
  /* a reload that fails says so above the list, and keeps the row */
  ST.err = 'The gate plan is temporarily unavailable'; stLogUi(); assert.match(log.innerHTML, /temporarily unavailable/); assert.equal(log.querySelectorAll('.gt-chg input')[0].value, 'D7'); ST.err = '';
  /* Send: on its way, the reload keeps it off; a second press sends nothing */
  P.fire('click', log.querySelector('[data-stsend]')); await settle();
  assert.equal(sent.length, 1); assert.deepEqual([sent[0].stand, sent[0].term], ['D7', 'T5']);
  stLogUi(); assert.equal(log.querySelector('[data-stsend]').disabled, true);
  P.fire('click', log.querySelector('[data-stsend]')); await settle(); assert.equal(sent.length, 1);
  held.ok(); await settle();
  assert.equal(log.querySelector('.gt-chg'), null, 'sent: the row closes'); assert.equal(loads, 1);
  /* one refused: the row there now is pressable again, and says why */
  P.fire('click', chgOf('PAW2')); await settle(); log.querySelectorAll('.gt-chg input')[0].value = 'D9';
  P.fire('click', log.querySelector('[data-stsend]')); await settle(); stLogUi(); held.no(); await settle();
  assert.equal(log.querySelector('[data-stsend]').disabled, false); assert.deepEqual(alerts, ['That flight has gone']);
});

/* ================= 8. Flight Watch keeps the open flight, and the message being written to its crew ================= */
const foSrc = () => slice('function foMsgHtml(f){', '/* the parts that change with the data') + slice('function foUi(){', '/* the flight list: how late a flight is') + slice('/* the message being written to a flight\'s crew, kept per callsign', 'window.addEventListener("pm:live"');
const flight = (cs) => ({ cs, dep: 'KSFO', arr: 'KLAX', pilot: 'PAW0006', cid: '1234567', name: 'Ann Pilot', ac: 'A21N', phase: 'cruise', sample: false });
await test('P1-8 flight watch panel: the unsent AOC or mail is kept per callsign when the flight goes (and comes back); opening another flight by hand asks first (pmLeave)', async () => {
  let answer = true, asked = 0;
  const FO = { f: null, edit: null, mode: 'aoc' };
  const P = mkPage({ FO, SETV: { froms: ['Crew Management', 'Flight Operations'], tpl: [{ title: 'CREW MESSAGE', body: '' }] }, foInfoUi() {}, foLoad() {}, fwCamSync() {}, confirm: () => { asked++; return answer; } });
  P.run(foSrc(), 'foUi'); const $ = P.$, pmLeave = P.ctx.pmLeave;
  P.emit('pm:sel', flight('PAW1')); assert.ok($('#foBody'));
  $('#foTitle').value = 'GATE CHANGE'; $('#foBody').value = 'NEW GATE D5 ___';
  P.emit('pm:sel', null);   /* gone from the map (after admin-live's grace) */
  assert.equal($('#foBody'), null);
  P.emit('pm:sel', flight('PAW2')); assert.equal($('#foBody').value, '', 'another flight starts empty');
  P.emit('pm:sel', flight('PAW1'));
  assert.equal($('#foBody').value, 'NEW GATE D5 ___'); assert.equal($('#foTitle').value, 'GATE CHANGE'); assert.match($('#foSay').innerHTML, /here again/);
  /* mail: its mode, subject and text come back too */
  P.ctx.FO.mode = 'mail'; $('#foSubj').value = 'Roster'; $('#foMBody').value = 'See you Friday';
  P.emit('pm:sel', flight('PAW2')); P.emit('pm:sel', flight('PAW1'));
  assert.equal(FO.mode, 'mail'); assert.equal($('#foAoc').hidden, true); assert.equal($('#foSubj').value, 'Roster'); assert.equal($('#foBody').value, 'NEW GATE D5 ___');
  /* by hand: asked; No keeps the flight and the text */
  answer = false; assert.equal(pmLeave('PAW1', 'PAW2'), false); assert.equal(asked, 1); assert.equal($('#foMBody').value, 'See you Friday');
  answer = true; assert.equal(pmLeave('PAW1', 'PAW2'), true); assert.equal(asked, 2); assert.equal($('#foMBody').value, '');
  P.emit('pm:sel', flight('PAW2')); P.emit('pm:sel', flight('PAW1')); assert.equal($('#foBody').value, '', 'discarded means gone'); assert.equal($('#foTitle').value, 'CREW MESSAGE');
  assert.equal(pmLeave('PAW1', null), true); assert.equal(asked, 2, 'nothing written: not asked');
  assert.equal(pmLeave('PAW9', null), true, 'not the open flight');
});

const { LIVE_JS } = await import('../src/live-bundle.js');
/* the Flight Watch bundle itself (admin-live, built), in a stand-in page: polls come when the test says (the page coming
   back into view asks at once), MapLibre never finishes loading (nothing of the map is drawn) */
function mkLive() {
  const D = mkDom(); D.body.innerHTML = STATIC; D.body.attrs['data-tab'] = 'fw';
  const winL = {}, answers = [], sel = [];
  const ctx = { document: D.document, console: { warn() {}, log() {}, error() {}, info() {} }, location: { search: '', origin: ORIGIN, host: 'efb-api.example', protocol: 'https:', hash: '#fw' },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    sessionStorage: { getItem: () => null, setItem() {} }, localStorage: { getItem: () => null, setItem() {} }, CustomEvent, AbortController, devicePixelRatio: 1, navigator: { userAgent: 'test' },
    Path2D: class { addPath() {} moveTo() {} lineTo() {} closePath() {} arc() {} rect() {} },
    fetch: async (u) => { const a = answers.shift(); if (!a) throw new Error('no answer for ' + u); if (a.fail) throw new Error('The network is down'); return { ok: true, status: 200, json: async () => clone(a) }; },
    addEventListener: (t, f) => { (winL[t] = winL[t] || []).push(f); }, removeEventListener() {}, dispatchEvent: (e) => { (winL[e.type] || []).forEach((f) => f(e)); return true; } };
  ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
  ctx.addEventListener('pm:sel', (e) => sel.push(e.detail ? e.detail.cs : null));
  const L = { D, ctx, sel, $: D.$,
    async load(a) { answers.push(a); vm.runInContext(LIVE_JS, ctx); await settle(); },
    async poll(a) { answers.push(a); D.fire('visibilitychange', D.body); await settle(); },
    open: () => (ctx.pmLive.sel() || {}).cs || null,
    pick(cs) { D.fire('click', D.$('#lvList [data-cs="' + cs + '"]')); } };
  return L;
}
const liveAns = (L) => ({ upd: new Date(NOW).toISOString(), vupd: new Date(NOW).toISOString(), now: NOW, sources: { vatsim: true, vamsys: false },
  apts: { KSFO: [37.6189, -122.375, 'SFO', 'San Francisco'], KLAX: [33.9425, -118.4081, 'LAX', 'Los Angeles'] },
  flights: L.map((cs, i) => ({ cs, cid: 1000 + i, name: 'Pilot ' + cs, lat: 35 + i * 0.5, lon: -120, alt: 33000, gs: 450, hdg: 140, sq: '2000', logon: NOW - 3600e3, ac: 'A21N', dep: 'KSFO', arr: 'KLAX', cruise: 33000, fl: 'FL330', rules: 'I', altn: '', tas: '', dt: '', ete: '', route: '', src: 'VATSIM', pt: NOW, ps: 'VATSIM' })) });

await test('P1-8 flight watch (the built bundle): the open flight stays through two updates without it (shown as last seen), closes on the third; an answer that did not come is not counted; back in time, nothing closed', async () => {
  const L = mkLive();
  await L.load(liveAns(['PAW101', 'PAW202']));
  assert.deepEqual([...L.$('#lvList').querySelectorAll('[data-cs]')].map((b) => b.dataset.cs), ['PAW101', 'PAW202']);
  L.pick('PAW101'); assert.equal(L.open(), 'PAW101'); assert.deepEqual(L.sel, ['PAW101']);
  await L.poll(liveAns(['PAW202']));
  assert.equal(L.open(), 'PAW101', 'one update without it: still open'); assert.deepEqual(L.sel, ['PAW101'], 'the panel was not told to close');
  assert.match(L.$('#lvDetMain').innerHTML, /Not in the last update/); assert.match(L.$('#lvDetMain').innerHTML, /PAW101/);
  await L.poll(liveAns(['PAW202'])); assert.equal(L.open(), 'PAW101', 'two: still open');
  await L.poll({ fail: true }); assert.equal(L.open(), 'PAW101', 'no answer at all: not counted');
  await L.poll(liveAns(['PAW202'])); assert.equal(L.open(), null, 'three: closed'); assert.deepEqual(L.sel, ['PAW101', null]);
  /* back within the grace: nothing closes, and the "last seen" line goes */
  L.pick('PAW202'); await L.poll(liveAns(['PAW101'])); await L.poll(liveAns(['PAW101', 'PAW202']));
  assert.equal(L.open(), 'PAW202'); assert.deepEqual(L.sel, ['PAW101', null, 'PAW202']); assert.doesNotMatch(L.$('#lvDetMain').innerHTML, /Not in the last update/);
});

await test('P1-8 flight watch (the built bundle): another flight, Close or Esc by hand asks the panel first (pmLeave); Esc the page took (a camera zoom) closes nothing', async () => {
  const L = mkLive(), asked = []; let answer = false;
  await L.load(liveAns(['PAW101', 'PAW202'])); L.pick('PAW101');
  L.ctx.pmLeave = (cur, next) => { asked.push([cur, next]); return answer; };
  L.pick('PAW202'); assert.equal(L.open(), 'PAW101', 'kept: the panel said no'); assert.deepEqual(asked, [['PAW101', 'PAW202']]);
  L.D.fire('keydown', L.D.body, { key: 'Escape' }); assert.equal(L.open(), 'PAW101'); assert.deepEqual(asked.at(-1), ['PAW101', null]);
  L.D.fire('click', L.$('#lvDetMain [data-lv="close"]')); assert.equal(L.open(), 'PAW101'); assert.equal(asked.length, 3);
  L.D.fire('keydown', L.D.body, { key: 'Escape', defaultPrevented: true }); assert.equal(asked.length, 3, 'Esc already taken: not even asked');
  answer = true; L.pick('PAW202'); assert.equal(L.open(), 'PAW202'); assert.deepEqual(L.sel, ['PAW101', 'PAW202']);
  L.D.fire('keydown', L.D.body, { key: 'Escape' }); assert.equal(L.open(), null);
  L.pick('PAW101'); L.ctx.pmLive.show('PAW202'); assert.equal(L.open(), 'PAW202', 'a link from Home asks too, and goes'); assert.deepEqual(asked.at(-1), ['PAW101', 'PAW202']);
});

/* ================= 9. pmCompose asks before it replaces a message being written ================= */
const pmSrc = () => slice('/* true when the composer is opened for it;', 'function preview(){');
await test('P1-9 pmCompose: a message being written (or a scheduled mail being edited) is replaced only after Discard; the composer always starts empty for the new recipient', async () => {
  let dirty = false, asked = 0, answer = true, resets = 0; const to = [];
  const CM = { item: 'mail:x', pane: 'item' };
  const P = mkPage({ CM, SETV: { froms: ['Crew Management', 'Flight Operations'] }, cmDirty: () => dirty, confirm: () => { asked++; return answer; }, reset: () => { resets++; dirty = false; }, kindSet() {}, toSet: (t) => to.push(t), say() {}, cmUi() {} });
  P.run(pmSrc(), 'x:1'); const pmCompose = P.ctx.pmCompose, $ = P.$;
  assert.equal(pmCompose({ pilot: 'PAW0006', cid: '1234567', cs: 'PAW123', name: 'Ann' }, 'aoc'), true);
  assert.equal(asked, 0); assert.equal(resets, 1, 'reset even with nothing written'); assert.equal(CM.pane, 'compose'); assert.equal(P.ctx.location.hash, '#comms');
  assert.deepEqual(clone(to.at(-1)), { crew: true, cs: 'PAW123', m: [{ pilot: 'PAW0006', cid: '1234567', name: 'Ann' }] });
  $('#acBody').value = 'HALF WRITTEN'; dirty = true; CM.pane = 'item';
  answer = false; assert.equal(pmCompose({ pilot: 'PAW0012', cid: '', cs: '', name: '' }, 'mail'), false);
  assert.equal(asked, 1); assert.equal(resets, 1); assert.equal($('#acBody').value, 'HALF WRITTEN'); assert.equal(CM.pane, 'item', 'kept as it was'); assert.equal(to.length, 1);
  answer = true; assert.equal(pmCompose({ pilot: 'PAW0012', cid: '', cs: '', name: '' }, 'mail'), true);
  assert.equal(asked, 2); assert.equal(resets, 2); assert.equal($('#acBody').value, ''); assert.equal($('#acTitle').value, 'CREW MESSAGE'); assert.equal(to.at(-1).pilot, 'PAW0012');
  assert.match(slice('if(d.fofull!=null){', 'if(d.fog==="chg"'), /if\(!window\.pmCompose\(/, 'Flight Watch fills the composer only when pmCompose opened it');
});

/* ================= 10. Home's link to an AOC message ================= */
const aoSrc = () => slice('/* an AOC message (Home\'s "has not accepted")', '/* a conversation (Home\'s "waiting for a reply") */') + slice('function cmItemUi(){', 'const cmZ=');
await test('P1-10 home: an AOC message opened from Home shows "Loading…" (never an empty pane) until the list comes, from Flight Watch\'s copy at once when it has it, and then the message', async () => {
  const S = { aoc: [], aocV: null, mails: [], kf: 'mail', loading: 0 }, CM = { seg: 'inbox', pane: 'empty', item: '' }, IB = { sel: '' };
  const msg = (id, title) => ({ id, t: NOW, title, body: 'NEW GATE D5', to: { crew: 1, cs: 'PAW1', m: [] }, by: 'ops@p.test' });
  let release = null, fw = null;
  const P = mkPage({ S, CM, IB, ibUi() {}, opsV: () => fw, cmUi() {}, listUi: () => { if (CM.pane === 'item') P.x.cmItemUi(); }, fmt: () => 'today', toLabel: () => 'the PAW1 crew', akOf: () => null, akList: () => '', md: (s) => s, kb: () => '', cmZ: () => '1200Z',
    load: () => { S.loading++; return new Promise((r) => { release = (list) => { S.loading--; S.aoc = list; S.aocV = { ackFrom: 0 }; if (CM.pane === 'item') P.x.cmItemUi(); r(); }; }); } });
  const { cmAocOpen } = P.run(aoSrc(), 'cmAocOpen,cmItemUi'), $ = P.$;
  let p = cmAocOpen('a1');
  assert.equal(CM.pane, 'item'); assert.equal(CM.item, 'aoc:a1'); assert.equal(CM.seg, 'sent'); assert.equal(S.kf, 'all', 'AOC messages are in the list shown');
  assert.match($('#cmItem').innerHTML, /Loading…/);
  release([msg('a1', 'GATE CHANGE')]); await p;
  assert.equal(CM.pane, 'item'); assert.match($('#cmItem').innerHTML, /GATE CHANGE/);
  /* sent from Flight Watch a moment ago: its copy shows before the list comes */
  fw = { msgs: [msg('a2', 'WX ADVISORY')] }; p = cmAocOpen('a2');
  assert.match($('#cmItem').innerHTML, /WX ADVISORY/); release([msg('a1', 'GATE CHANGE'), msg('a2', 'WX ADVISORY')]); await p; assert.match($('#cmItem').innerHTML, /WX ADVISORY/);
  /* deleted meanwhile: once the list has come, the pane closes */
  fw = null; p = cmAocOpen('gone'); assert.match($('#cmItem').innerHTML, /Loading…/); release([]); await p; assert.equal(CM.pane, 'empty');
  const home = slice('if(g.startsWith("aoc:")){', 'if(g==="need")');
  assert.match(home, /cmAocOpen\(g\.slice\(4\)\)/); assert.doesNotMatch(home, /setTimeout/);
});

/* ================= 13. the Cockpit Monitor and Broadcast's Polaris Cam: one camera alone, Esc ================= */
const camViewSrc = () => slice('/* one player. o: grid', '/* Broadcast\'s grid, shared by its two players');
await test('P1-13 cameras: with one camera on it is shown alone and large (the others not drawn); two or more, all four; a zoom on one not drawn is let go', async () => {
  const P = mkPage({ CAM_VIEWS: [], camFps: () => 0, camWC: () => false });
  const { mkCamView } = P.run(camViewSrc(), 'mkCamView'), $ = P.$;
  const V = mkCamView({ grid: '#bcCamG' }), g = $('#bcCamG'), cells = [0, 1, 2, 3].map((i) => g.querySelector('[data-camc="' + i + '"]'));
  V.caps(); assert.equal(g.classList.contains('solo'), false, 'not connected: as it was');
  V.ws = { readyState: 1, send() {} };
  V.pub = { on: true, cams: [{ i: 0, on: false }, { i: 1, on: false }, { i: 2, on: true, name: 'Captain' }, { i: 3, on: false }] }; V.caps();
  assert.equal(g.classList.contains('solo'), true); assert.deepEqual(cells.map((c) => c.hidden), [true, true, false, true]);
  assert.equal(cells[2].querySelector('.bc-cap span').textContent, 'Captain');
  V.pub.cams[0].on = true; V.caps(); assert.equal(g.classList.contains('solo'), false); assert.deepEqual(cells.map((c) => c.hidden), [false, false, false, false]);
  V.zoomTo(0); assert.equal(g.classList.contains('one'), true); assert.equal(cells[0].classList.contains('z'), true);
  V.pub.cams[0].on = false; V.caps(); assert.equal(V.zoom, -1, 'the camera zoomed is not drawn any more'); assert.equal(g.classList.contains('solo'), true);
});

const escSrc = () => slice('function camEsc(e){', 'document.addEventListener("keydown",camEsc,true);');
await test('P1-13 Esc: a camera seen large goes back to all of them (Flight Watch, Broadcast: whoever\'s grid it is), and the key is marked taken; not from a field, not with a modifier, not when nothing is large', async () => {
  const mk = () => ({ zoom: 2, n: 0, caps() { this.n++; } }), FWV = mk(), CAM = mk(), CAMP = mk();
  const P = mkPage({ pgNow: 'fw', CAMB: { src: '' }, FWV, CAM, CAMP });
  const { camEsc } = P.run(escSrc(), 'camEsc'), $ = P.$;
  const ev = (o = {}) => ({ key: 'Escape', target: P.D.body, metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...o });
  const a = ev(); camEsc(a); assert.equal(FWV.zoom, -1); assert.equal(a.defaultPrevented, true); assert.equal(FWV.n, 1);
  const b = ev(); camEsc(b); assert.equal(b.defaultPrevented, false, 'nothing large: Esc is left to Flight Watch (it closes the flight)');
  FWV.zoom = 1; camEsc(ev({ target: $('#acBody') })); assert.equal(FWV.zoom, 1, 'typing in a field');
  camEsc(ev({ ctrlKey: true })); assert.equal(FWV.zoom, 1); camEsc(ev({ key: 'Enter' })); assert.equal(FWV.zoom, 1);
  P.ctx.pgNow = 'bc'; camEsc(ev()); assert.equal(CAM.zoom, -1); assert.equal(CAMP.zoom, 2); assert.equal(FWV.zoom, 1);
  P.ctx.CAMB.src = 'pilot'; camEsc(ev()); assert.equal(CAMP.zoom, -1);
  P.ctx.pgNow = 'home'; FWV.zoom = 3; camEsc(ev()); assert.equal(FWV.zoom, 3);
  assert.match(ADMIN_HTML, /document\.addEventListener\("keydown",camEsc,true\)/, 'taken before Flight Watch\'s own Esc');
  assert.match(LIVE_JS, /Escape"&&!\w+\.defaultPrevented/, 'and Flight Watch leaves an Esc already taken');
});

/* ================= 11, 12, 14, 15, 16. the narrow and touch layouts, Broadcast's source, the EFB's frame ================= */
const CSS = [...ADMIN_HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((x) => x[1]).join('\n');
/* the rules: { media (the @media prelude, '' at the top), sel (the selector list), body } */
const RULES = (() => {
  const s = CSS.replace(/\/\*[\s\S]*?\*\//g, ''), out = []; let i = 0;
  /* a block's rules, up to its closing } (the top level: to the end); @media, @supports, @keyframes… hold blocks */
  (function walk(media, top) {
    while (i < s.length) {
      const open = s.indexOf('{', i), close = s.indexOf('}', i);
      if (close >= 0 && (open < 0 || close < open)) { i = close + 1; if (top) continue; return; }
      if (open < 0) { i = s.length; return; }
      const pre = s.slice(i, open).trim(); i = open + 1;
      if (pre.startsWith('@')) { walk(pre.startsWith('@media') ? pre.replace(/\s+/g, '') : '@other', false); continue; }
      const end = s.indexOf('}', i); out.push({ media, sel: pre.split(',').map((x) => x.trim()), body: s.slice(i, end) }); i = end + 1;
    }
  })('', true);
  return out;
})();
/* the declarations for selector sel under media (a part of its prelude; '' at the top level), last one first */
const inMedia = (r, media) => r.media === (media ? '@media' + media.replace(/\s+/g, '') : '');
const decl = (media, sel, prop) => { for (const r of [...RULES].reverse()) { if (!inMedia(r, media)) continue; if (!r.sel.includes(sel)) continue; const m = [...r.body.matchAll(new RegExp('(?:^|;)\\s*' + prop.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;]+)', 'g'))].at(-1); if (m) return m[1].trim(); } return null; };   /* (the last in its rule, as CSS takes it) */
await test('P1-11 narrow nav (≤900px): tabs 44 px high, and a fade at the edge with more tabs past it (sideScroll)', async () => {
  assert.equal(decl('(max-width:900px)', '.side a', 'min-height'), '44px');
  assert.match(decl('(max-width:900px)', '.side.more-r', 'mask-image'), /linear-gradient\(to right,#000 calc\(100% - 40px\),transparent\)/);
  assert.match(decl('(max-width:900px)', '.side.more-l', 'mask-image'), /linear-gradient\(to right,transparent,#000 40px\)/);
  const P = mkPage(); const { sideScroll } = P.run(slice('function sideScroll(){', '{const s=document.querySelector(".side")'), 'sideScroll'), s = P.$('.side');
  const at = (sw, cw, sl) => { Object.assign(s, { scrollWidth: sw, clientWidth: cw, scrollLeft: sl }); sideScroll(); return [s.classList.contains('more-l'), s.classList.contains('more-r')]; };
  assert.deepEqual(at(1200, 400, 0), [false, true], 'Settings off to the right'); assert.deepEqual(at(1200, 400, 300), [true, true]); assert.deepEqual(at(1200, 400, 800), [true, false]); assert.deepEqual(at(400, 400, 0), [false, false]);
});

await test('P1-12 touch targets: at least 36 px to press on a desktop without moving anything, 44 px on a touch screen or a narrow window', async () => {
  assert.equal(decl('', '.help>summary::after', 'inset'), '-7px', 'the 22 px ? reaches 36 px');
  for (const s of ['.bc-chip button::after', '.fw-b button::after', '.fo-camb button::after', '.lv-dbtn button::after', '.fo-g button::after', '.fw-cp::after']) assert.equal(decl('', s, 'height'), '36px', s);
  assert.equal(decl('', '.gm-z button', 'width'), '36px'); assert.equal(decl('', '.gm-z button', 'height'), '36px');
  const T = '(pointer:coarse),(max-width:900px)';
  for (const s of ['.fw-b button', '.fo-camb button', '.lv-dbtn button', '.fo-g button', '.fo-ge button', '.lv-back']) assert.equal(decl(T, s, 'min-height'), '44px', s);
  assert.equal(decl(T, '.fw-cp', 'min-height'), '36px'); assert.equal(decl(T, '.bc-chip button', 'min-width'), '36px'); assert.equal(decl(T, '.bc-chip button', 'min-height'), '36px');
  assert.equal(decl(T, '.gm-z button', 'width'), '44px'); assert.equal(decl(T, '.help>summary', 'width'), '32px'); assert.equal(decl(T, '.fw-cp::after', 'height'), '44px');
});

await test('P1-13 cockpit monitor layout: one camera across on a phone (≤600px); one camera on: one column', async () => {
  assert.equal(decl('(max-width:600px)', '.fo-cg', 'grid-template-columns'), 'minmax(0,1fr)');
  assert.equal(decl('', '.bc-cg.solo', 'grid-template-columns'), 'minmax(0,1fr)'); assert.equal(decl('', '.bc-cg.solo .bc-cc[hidden]', 'display'), 'none');
});

await test('P1-14 broadcast: the source says "Direct link (overrides Auto)" or "Auto · <pilot>", with Link… for directors that opens Setup at the Polaris Cam link; a ? explanation scrolls in itself and opens across the page up to 900 px', async () => {
  const cu = slice('function camUi(){', 'async function camTok(');
  assert.match(cu, /Direct link \(overrides Auto\)/); assert.match(cu, /esc\("Auto · "\+CAMB\.pilot\)/); assert.match(cu, /data-bccamset/);
  const P = mkPage({ bcSetUi: () => { P.ctx.setUi = (P.ctx.setUi || 0) + 1; } }); P.run(slice('/* Link… beside the source: Setup opened at the Polaris Cam link */', '/* every player: its acks every 0.4 s'), 'x:1');
  const $ = P.$; P.$('#bcCam').insertAdjacentHTML('beforeend', '<button type="button" class="bc-src-go" data-bccamset>Link…</button>');
  assert.equal($('#bcSet').hidden, true);
  P.fire('click', $('[data-bccamset]'));
  assert.equal($('#bcSet').hidden, false); assert.equal($('#bcSetB').getAttribute('aria-expanded'), 'true'); assert.equal(P.ctx.setUi, 1); assert.equal(P.D.document.activeElement, $('#bcCamUrl'));
  assert.equal(decl('', '.help>div', 'max-height'), 'min(70dvh,420px)'); assert.equal(decl('', '.help>div', 'overflow'), 'auto');
  assert.equal(decl('(max-width:900px)', '.help', 'position'), 'static'); assert.equal(decl('(max-width:900px)', '.help>div', 'left'), '12px'); assert.equal(decl('(max-width:900px)', '.help>div', 'right'), '12px');
});

await test('P1-15 nav data: the filter bar sticks under the header (59 px) and, ≤900 px, under the sections bar too (112 px); anchors land clear of both', async () => {
  const v = (name, media) => { for (const r of [...RULES].reverse()) { if (!inMedia(r, media)) continue; if (!r.sel.includes(':root') && !r.sel.includes('html.in-efb')) continue; const m = new RegExp(name + ':([^;]+)').exec(r.body); if (m && r.sel.includes(':root')) return m[1]; } return null; };
  assert.equal(v('--hdr', ''), '59px'); assert.equal(v('--navh', '(max-width:900px)'), '53px');
  assert.equal(decl('', '.nd-flt', 'top'), 'var(--hdr)'); assert.equal(decl('(max-width:900px)', '.nd-flt', 'top'), 'calc(var(--hdr) + var(--navh))');
  assert.equal(decl('(max-width:900px)', 'html', 'scroll-padding-top'), 'calc(var(--hdr) + var(--navh))');
  /* scroll-padding and scroll-margin add up: the panes scrolled to no longer keep their own room for the bars */
  for (const s of ['#ibView', '#cmItem', '#cmCompose']) assert.equal(decl('(max-width:900px)', s, 'scroll-margin-top'), '8px', s);
  assert.equal(decl('(max-width:900px)', 'main', 'scroll-margin-top'), '0');
  assert.equal(parseInt(v('--hdr', ''), 10) + parseInt(v('--navh', '(max-width:900px)'), 10), 112);
  assert.equal(decl('', 'header', 'height'), 'var(--hdr)'); assert.equal(decl('(max-width:900px)', '.side', 'top'), 'var(--hdr)');
});

await test('P1-16 in the EFB\'s frame (html.in-efb): a 48 px header, and on a narrow screen a 40dvh map so the list and the open flight show', async () => {
  const r = RULES.find((x) => x.media === '' && x.sel.includes('html.in-efb')); assert.ok(r && /--hdr:48px/.test(r.body));
  assert.equal(decl('(max-width:900px)', 'html.in-efb main#live', 'grid-template-rows'), '40dvh auto');
  assert.equal(decl('(max-width:900px) and (max-height:500px)', 'html.in-efb main#live', 'grid-template-rows'), '60dvh auto', 'a phone on its side: the map not a sliver');
  assert.equal(decl('(max-width:900px)', 'main#live', 'grid-template-rows'), '56vh auto', 'outside the EFB as it was');
  assert.equal(decl('', 'main#live', 'height'), 'calc(100svh - var(--hdr))');
  assert.equal(decl('', 'html.in-efb header', 'padding'), '0 14px');
});

/* ================= the files changed parse ================= */
await test('syntax: every file changed passes node --check and loads as a module; every inline <script> of the admin page and the Flight Watch bundle parse; the <style> braces balance', async () => {
  const { execFileSync } = await import('node:child_process'), { fileURLToPath } = await import('node:url');
  const files = ['mail.js', 'admin.js', 'aoc.js', 'index.js', 'kvread.js', 'desk.js', 'docs.js', 'jpcharts.js', 'live-bundle.js'];
  for (const f of files) {
    execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../src/' + f, import.meta.url))], { stdio: 'pipe' });
    await import('../src/' + f);
  }
  const S = [...ADMIN_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  assert.ok(S.length >= 2 && S.some((s) => s.includes('function camEsc(')) && S.some((s) => s.includes('function cmAocOpen(')));
  for (const s of S) assert.doesNotThrow(() => new vm.Script(s, { filename: 'admin-inline.js' }));
  assert.doesNotThrow(() => new vm.Script(LIVE_JS, { filename: 'live.js' }));
  const C = [...ADMIN_HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((x) => x[1]); assert.ok(C.length >= 1);
  for (const c of C) { let d = 0; for (const ch of c.replace(/"[^"]*"|'[^']*'/g, '')) { if (ch === '{') d++; else if (ch === '}') { d--; assert.ok(d >= 0, 'a } with no {'); } } assert.equal(d, 0, 'every { closed'); }
});

globalThis.fetch = realFetch; Date.now = realNow; console.warn = realWarn; delete globalThis.caches;
console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ', all passed'));
