/* The five P0 fixes from the Polaris Operations admin audit (Nov 2026): plain Node 22, no npm packages.
     node workers/polaris-efb-api/test/admin-p0.test.mjs
   1. Roles fail closed (mail.js): a KV error on admin:v1:roles is a 503, never "roles off, everyone is Administrator",
      is never cached, and a roles change re-reads KV itself before writing.
   2. A storage error is an error, never an empty list (mail.js, aoctpl.js, jpcharts.js, cnaip.js): nothing is written
      back from a read that failed, and the pilots' side answers a clean 503.
   3. Inbox (admin.js): the minute's reload keeps the reply being written (text, cursor, focus, Reply as) and a reply
      on its way (Send stays off; one send only). Run here in a stand-in page.
   4. The gate plan (stands.js, admin.js): Gates and Automatic messages save their own half (part), checked against
      when that half was last saved (base): never each other's stale half, and 409 for the same half saved over.
   5. Broadcast's keys (admin.js): 1–9 and Space never act on a focused control; Space only when there is a take.
   Cloudflare Access, KV and R2 are stood in for; time is the test's (Date.now), so the Worker's short caches can be
   passed. */
import assert from 'node:assert/strict';
import vm from 'node:vm';

let NOW = Date.now();
const realNow = Date.now; Date.now = () => NOW;
/* past every short cache in the code under test (roles 10 s, mail 20 s, the AIP and chart indexes and wording 60 s) */
const later = (ms = 61_000) => { NOW += ms; };
/* the code under test says what went wrong in storage on console.warn: kept here, not printed */
const realWarn = console.warn, warned = []; console.warn = (...a) => { warned.push(a.join(' ')); };

let passed = 0;
async function test(name, fn) {
  try { later(); await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + ((e && e.stack) || e)); process.exitCode = 1; }
}
const settle = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const clone = (v) => JSON.parse(JSON.stringify(v));

/* ---- KV, stood in for: values kept as KV keeps them (text); fail: keys whose get throws, as KV does on a hiccup ---- */
function mkKv(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const kv = {
    m, fail: new Set(), puts: [], dels: [],
    async get(k, t) {
      if (kv.fail.has(k) || kv.fail.has('*')) throw new Error('KV GET failed (test)');
      const v = m.get(k); if (v == null) return null;
      const type = typeof t === 'string' ? t : t && t.type;
      return type === 'json' ? JSON.parse(v) : v;   /* a value that is not JSON throws here, as KV's get(k, 'json') does */
    },
    async put(k, v) { kv.puts.push(k); m.set(k, v); },
    async delete(k) { kv.dels.push(k); m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
    json(k) { const v = m.get(k); return v == null ? null : JSON.parse(v); },
  };
  return kv;
}

/* ---- Cloudflare Access, stood in for: a key made here signs the test sign-ins ---- */
const TEAM = 'p0.cloudflareaccess.com', AUD = 'p0-aud';
const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => (String(u) === 'https://' + TEAM + '/cdn-cgi/access/certs' ? new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } }) : realFetch(u, init));
async function signIn(email) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })), p = b64u(JSON.stringify({ aud: [AUD], iss: 'https://' + TEAM, email, exp: Math.floor(realNow() / 1000) + 7 * 86400 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(h + '.' + p));
  return h + '.' + p + '.' + b64u(new Uint8Array(sig));
}
const ORIGIN = 'https://efb-api.example';
const { mailAdmin, mailPublic, mailAttachment, staffOfPilot, taskStaff } = await import('../src/mail.js');
async function admin(kv, email, path, { method = 'GET', body } = {}) {
  const headers = { 'Cf-Access-Jwt-Assertion': await signIn(email) };
  if (body) headers['Content-Type'] = 'application/json';
  const req = new Request(ORIGIN + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return mailAdmin(req, new URL(req.url), { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, STORE: kv }, {});
}
const ROLES = 'admin:v1:roles';
const ROLES_ON = { people: { 'boss@p.test': { role: 'admin' }, 'ops@p.test': { role: 'ops' } }, roles: { ops: { name: 'Operations', pages: ['fw', 'gates'], can: ['msg', 'gates'] } }, at: 1, by: 'boss@p.test' };

/* ================= 1. roles fail closed (mail.js) ================= */
await test('P0-1 roles: a KV error on admin:v1:roles shuts the admin (503 page, 503 JSON), never Administrator; POST /admin/api/roles writes nothing', async () => {
  const kv = mkKv({ [ROLES]: ROLES_ON }); kv.fail.add(ROLES);
  const page = await admin(kv, 'intruder@p.test', '/admin');
  assert.equal(page.status, 503);
  assert.match(page.headers.get('Content-Type'), /text\/html/);
  const html = await page.text();
  assert.match(html, /class="deny"/); assert.match(html, /Roles are temporarily unavailable; please try again/);
  assert.doesNotMatch(html, /<script>window\.PM_PERM=/, 'no permissions are handed to the page');
  for (const p of ['/admin/api/me', '/admin/api/roles', '/admin/api/mail', '/admin/api/stands', '/admin/api/tasks']) {
    const r = await admin(kv, 'intruder@p.test', p); assert.equal(r.status, 503, p);
    assert.equal((await r.json()).error, 'Roles are temporarily unavailable; please try again', p);
  }
  const w = await admin(kv, 'intruder@p.test', '/admin/api/roles', { method: 'POST', body: { email: 'intruder@p.test', role: 'admin' } });
  assert.equal(w.status, 503);
  assert.deepEqual(kv.json(ROLES), ROLES_ON, 'the roles are as they were');
  assert.equal(kv.puts.includes(ROLES), false, 'nothing was written over the roles');
  /* the same for someone who has a role: no way in while roles cannot be read */
  assert.equal((await admin(kv, 'boss@p.test', '/admin/api/me')).status, 503);
});

await test('P0-1 roles: a failed read is never kept: the moment KV answers again, an email without a role is turned away (no 10-second "roles off")', async () => {
  const kv = mkKv({ [ROLES]: ROLES_ON }); kv.fail.add(ROLES);
  assert.equal((await admin(kv, 'intruder@p.test', '/admin/api/me')).status, 503);
  kv.fail.clear();   /* within the 10 seconds a cached failure would have lasted */
  const r = await admin(kv, 'intruder@p.test', '/admin/api/me'); assert.equal(r.status, 403);
  assert.match((await r.json()).error, /has no role/);
  const b = await admin(kv, 'boss@p.test', '/admin/api/me'); assert.equal(b.status, 200);
  assert.equal((await b.json()).role, 'admin');
});

await test('P0-1 roles: a stored value that is not a roles record (a list, a string, bad JSON, no people) is 503, never roles off', async () => {
  for (const bad of ['[]', '"oops"', '42', 'not json {', JSON.stringify({ roles: {} }), JSON.stringify({ people: [], roles: {} }), JSON.stringify({ people: {}, roles: [] })]) {
    later(11_000);
    const kv = mkKv({ [ROLES]: bad });
    const r = await admin(kv, 'intruder@p.test', '/admin/api/me'); assert.equal(r.status, 503, bad);
    const w = await admin(kv, 'intruder@p.test', '/admin/api/roles', { method: 'POST', body: { email: 'intruder@p.test', role: 'admin' } });
    assert.equal(w.status, 503, bad); assert.equal(kv.m.get(ROLES), bad, 'left as it was: ' + bad);
  }
});

await test('P0-1 roles: no roles key at all (roles never turned on) still lets the first person in as Administrator and set roles up', async () => {
  const kv = mkKv();
  const me = await admin(kv, 'first@p.test', '/admin/api/me'); assert.equal(me.status, 200);
  const mj = await me.json(); assert.equal(mj.role, 'admin'); assert.equal(mj.roles, false);
  const w = await admin(kv, 'first@p.test', '/admin/api/roles', { method: 'POST', body: { email: 'ops@p.test', role: 'ops' } });
  assert.equal(w.status, 200);
  const R = kv.json(ROLES);
  assert.deepEqual(R.people['first@p.test'].role, 'admin', 'turning roles on adds the person doing it as an administrator');
  assert.deepEqual(R.people['ops@p.test'].role, 'ops');
  assert.equal((await admin(kv, 'stranger@p.test', '/admin/api/me')).status, 403, 'roles are on now');
});

await test('P0-1 roles: POST /admin/api/roles reads KV itself, not the 10-second copy: a fresh read that fails refuses the change; roles turned on meanwhile are obeyed', async () => {
  /* a: roles off when this isolate last looked; someone else has since turned them on (without a) */
  const kv = mkKv();
  assert.equal((await admin(kv, 'a@p.test', '/admin/api/me')).status, 200);   /* the copy: roles off */
  const theirs = { people: { 'b@p.test': { role: 'admin' } }, roles: {}, at: NOW, by: 'b@p.test' };
  kv.m.set(ROLES, JSON.stringify(theirs));
  const w = await admin(kv, 'a@p.test', '/admin/api/roles', { method: 'POST', body: { email: 'a@p.test', role: 'admin' } });
  assert.equal(w.status, 403, 'a is no administrator under the roles as they are now');
  assert.deepEqual(kv.json(ROLES), theirs, "b's roles are not written over");
  /* the copy says boss is an administrator; the fresh read fails: no change */
  later(11_000);
  const kv2 = mkKv({ [ROLES]: ROLES_ON });
  assert.equal((await admin(kv2, 'boss@p.test', '/admin/api/me')).status, 200);   /* the copy is warm */
  kv2.fail.add(ROLES);
  const w2 = await admin(kv2, 'boss@p.test', '/admin/api/roles', { method: 'POST', body: { email: 'new@p.test', role: 'ops' } });
  assert.equal(w2.status, 503); assert.equal(kv2.puts.includes(ROLES), false); assert.deepEqual(kv2.json(ROLES), ROLES_ON);
});

await test('P0-1 roles: staffOfPilot and taskStaff (EFB Calendar, task emails) reject with 503 on a KV error instead of answering "no staff"', async () => {
  const kv = mkKv({ [ROLES]: { ...ROLES_ON, people: { ...ROLES_ON.people, 'pilot@p.test': { role: 'ops', pilot: 'PAW0006' } } } });
  kv.fail.add(ROLES);
  await assert.rejects(staffOfPilot({ STORE: kv }, 'PAW0006'), (e) => e.status === 503);
  await assert.rejects(taskStaff({ STORE: kv }), (e) => e.status === 503);
  kv.fail.clear();
  assert.equal((await staffOfPilot({ STORE: kv }, 'PAW0006')).email, 'pilot@p.test');
  assert.deepEqual(Object.keys((await taskStaff({ STORE: kv })).ppl).sort(), ['boss@p.test', 'ops@p.test', 'pilot@p.test']);
  later(11_000);
  const none = mkKv();   /* no roles key: no staff, as before */
  assert.equal(await staffOfPilot({ STORE: none }, 'PAW0006'), null);
  assert.deepEqual((await taskStaff({ STORE: none })).ppl, {});
});

await test("P0-1 seen: a KV error on admin:v1:seen writes nothing over everyone's last-seen times", async () => {
  const seen = { 'x@p.test': NOW - 86400_000, 'y@p.test': NOW - 2 * 86400_000 };   /* recent: older than 400 days goes */
  const kv = mkKv({ 'admin:v1:seen': seen }); kv.fail.add('admin:v1:seen');
  assert.equal((await admin(kv, 'z@p.test', '/admin/api/me')).status, 200);
  assert.equal(kv.puts.includes('admin:v1:seen'), false); assert.deepEqual(kv.json('admin:v1:seen'), seen);
  kv.fail.clear(); later();
  assert.equal((await admin(kv, 'z@p.test', '/admin/api/me')).status, 200);
  assert.deepEqual(Object.keys(kv.json('admin:v1:seen')).sort(), ['x@p.test', 'y@p.test', 'z@p.test'], 'added to, once readable');
});

/* ================= 2. a storage error is an error, never an empty list ================= */
const IDX = 'mail:v1:index';
const MAILS = [1, 2, 3].map((i) => ({ id: 'm' + i, t: 1000 + i, sendAt: 1000 + i, from: 'Ops', subject: 'S' + i, body: 'B' + i, att: [], to: null, by: 'boss@p.test' }));
const newMail = { from: 'Flight Operations', subject: 'Notice', body: 'Read this' };

await test('P0-2 mail: a KV error on the mail index is 503 for staff (list, save, delete) and pilots, and never writes the index', async () => {
  const kv = mkKv({ [IDX]: MAILS }); kv.fail.add(IDX);
  const p = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: newMail });
  assert.equal(p.status, 503); assert.match((await p.json()).error, /Polaris Mail is temporarily unavailable/);
  assert.equal((await admin(kv, 'boss@p.test', '/admin/api/mail?id=m2', { method: 'DELETE' })).status, 503);
  assert.equal((await admin(kv, 'boss@p.test', '/admin/api/mail')).status, 503);
  assert.equal(kv.puts.includes(IDX), false); assert.deepEqual(kv.json(IDX), MAILS, 'all three mails are still there');
  /* the EFB: a 503 (index.js answers it as JSON), not "no mail" */
  await assert.rejects(mailPublic(new Request(ORIGIN + '/api/efb/mail'), { STORE: kv }, {}, { u: 'PAW0006', c: '1234567' }, async () => 'k'), (e) => e.status === 503);
  const att = new URL(ORIGIN + '/api/efb/mail-att?id=m1&n=0&e=' + (NOW + 3600_000) + '&k=k');
  await assert.rejects(mailAttachment(att, { STORE: kv }, {}, async () => 'k'), (e) => e.status === 503);
  /* KV back: the save goes on top of what is there */
  kv.fail.clear();
  assert.equal((await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: newMail })).status, 200);
  assert.equal(kv.json(IDX).length, 4);
});

await test('P0-2 mail: an index that is not a list is 503 and left alone; no index yet is no mail, and the first mail starts it', async () => {
  for (const bad of ['{"m1":{}}', '"x"', 'not json']) {
    const kv = mkKv({ [IDX]: bad });
    assert.equal((await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: newMail })).status, 503, bad);
    assert.equal(kv.m.get(IDX), bad);
  }
  const kv = mkKv();
  const g = await admin(kv, 'boss@p.test', '/admin/api/mail'); assert.equal(g.status, 200); assert.deepEqual((await g.json()).mails, []);
  assert.equal((await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: newMail })).status, 200);
  assert.equal(kv.json(IDX).length, 1);
});

const { aocTplAdmin, aocTpl } = await import('../src/aoctpl.js');
const TPL = 'aoc:v1:tpl';
const SAVED = { at: 5, by: 'boss@p.test', m: { gate: { title: 'STAND ALLOCATION', titleChg: 'STAND CHANGE', body: '{CALLSIGN} GATE {GATE}', bodyNone: '{CALLSIGN} CONTACT GROUND' }, dep: { title: 'DEP STAND', titleChg: 'DEP STAND CHANGE', body: '{CALLSIGN} STAND {GATE}', bodyNone: '{CALLSIGN} ANY STAND' } } };
const tplReq = (path, method = 'GET', body) => new Request(ORIGIN + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
const lsSave = { kind: 'ls', fields: { title: 'LOADSHEET', body: 'LOADSHEET {FLIGHT} {ZFW:9}' } };

await test("P0-2 aoctpl: a KV error on the saved wording refuses a save or a reset (503) and keeps every other message's wording", async () => {
  const kv = mkKv({ [TPL]: SAVED }), env = { STORE: kv };
  assert.equal((await aocTpl(env, true)).gate.title, 'STAND ALLOCATION');
  kv.fail.add(TPL);
  const s = await aocTplAdmin(tplReq('/admin/api/aoctpl', 'POST', lsSave), '/admin/api/aoctpl', env, 'boss@p.test');
  assert.equal(s.status, 503); assert.match((await s.json()).error, /temporarily unavailable/);
  assert.equal((await aocTplAdmin(tplReq('/admin/api/aoctpl', 'POST', { kind: 'dep', reset: true }), '/admin/api/aoctpl', env, 'boss@p.test')).status, 503);
  assert.equal((await aocTplAdmin(tplReq('/admin/api/aoctpl'), '/admin/api/aoctpl', env, 'boss@p.test')).status, 503, 'not the defaults shown as if saved');
  assert.equal(kv.puts.length, 0); assert.deepEqual(kv.json(TPL), SAVED);
  /* the automatic messages still go out, with the wording last read (a failure is not kept as the answer) */
  assert.equal((await aocTpl(env, true)).gate.title, 'STAND ALLOCATION');
  kv.fail.clear();
  const ok = await aocTplAdmin(tplReq('/admin/api/aoctpl', 'POST', lsSave), '/admin/api/aoctpl', env, 'boss@p.test');
  assert.equal(ok.status, 200);
  const after = kv.json(TPL);
  assert.deepEqual(after.m.gate, SAVED.m.gate); assert.deepEqual(after.m.dep, SAVED.m.dep); assert.equal(after.m.ls.title, 'LOADSHEET');
  assert.equal((await aocTpl(env)).ls.title, 'LOADSHEET', 'the copy in use is what was saved');
});

await test('P0-2 aoctpl: stored wording that is not a record is 503 and left alone; none yet starts with the one saved', async () => {
  for (const bad of ['[]', '"x"', JSON.stringify({ m: 'x' }), JSON.stringify({ m: [] })]) {
    const kv = mkKv({ [TPL]: bad });
    assert.equal((await aocTplAdmin(tplReq('/admin/api/aoctpl', 'POST', lsSave), '/admin/api/aoctpl', { STORE: kv }, 'boss@p.test')).status, 503, bad);
    assert.equal(kv.m.get(TPL), bad);
  }
  const kv = mkKv();
  assert.equal((await aocTplAdmin(tplReq('/admin/api/aoctpl', 'POST', lsSave), '/admin/api/aoctpl', { STORE: kv }, 'boss@p.test')).status, 200);
  assert.deepEqual(Object.keys(kv.json(TPL).m), ['ls']);
});

const { jpChartsAdmin, jpChartsList, jpChartPdf } = await import('../src/jpcharts.js');
const { navdataAdmin } = await import('../src/navdata.js');
const JPI = 'jpch:v1:idx';
const JPIDX = { at: 7, apts: { RJTT: [{ eff: '20261126', n: 1, size: 9, at: 7, by: 'boss' }], RJAA: [{ eff: '20261126', n: 1, size: 9, at: 7, by: 'boss' }] } };
function mkR2() {
  const r2 = { objs: new Map([['jp/RJAA/20261126/0.pdf', 1], ['jp/RJTT/20261126/0.pdf', 1], ['jp/RJBB/20261126/0.pdf', 1]]), deleted: [],
    async head(k) { return r2.objs.has(k) ? { key: k } : null; }, async put(k) { r2.objs.set(k, 1); }, async get() { return null; },
    async list({ prefix }) { return { objects: [...r2.objs.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }; },
    async delete(ks) { for (const k of [].concat(ks)) { r2.deleted.push(k); r2.objs.delete(k); } } };
  return r2;
}
const navReq = (path, body) => new Request(ORIGIN + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const commitRJBB = { apt: 'RJBB', eff: '20261126', files: [{ i: 0, file: 'RJBB__ADC_20261126.pdf', s: 9 }] };

await test("P0-2 jpcharts: a KV error on the chart index refuses commit and delete (503, also through Nav Data) and keeps every other aerodrome's charts", async () => {
  const kv = mkKv({ [JPI]: JPIDX, 'jpch:v1:a:RJTT:20261126': { eff: '20261126', files: [{ i: 0, key: 'ADC', code: 'APD', group: 'Airport diagram', name: 'Aerodrome chart', d: '20261126' }] } });
  const R2 = mkR2(), env = { STORE: kv, CHARTS: R2 };
  kv.fail.add(JPI);
  const c = await jpChartsAdmin(navReq('/admin/api/navdata/jpcharts/commit', commitRJBB), '/admin/api/navdata/jpcharts/commit', env, 'boss@p.test');
  assert.equal(c.status, 503); assert.match((await c.json()).error, /AIP Japan charts are temporarily unavailable/);
  const d = await navdataAdmin(navReq('/admin/api/navdata/jpcharts/delete', { apt: 'RJAA' }), '/admin/api/navdata/jpcharts/delete', env, {}, 'boss@p.test');
  assert.equal(d.status, 503, 'Nav Data passes the 503 on (not its catch-all 500)');
  assert.equal((await jpChartsAdmin(new Request(ORIGIN + '/admin/api/navdata/jpcharts'), '/admin/api/navdata/jpcharts', env, 'boss@p.test')).status, 503);
  assert.equal(kv.puts.includes(JPI), false); assert.deepEqual(kv.json(JPI), JPIDX);
  assert.deepEqual(R2.deleted, [], "RJAA's PDFs were not deleted");
  /* pilots: "unavailable", not "no charts here" */
  await assert.rejects(jpChartsList('RJTT', env, { u: 'PAW0006' }), (e) => e.status === 503);
  kv.fail.clear(); kv.fail.add('jpch:v1:a:RJTT:20261126');
  await assert.rejects(jpChartsList('RJTT', env, { u: 'PAW0006' }), (e) => e.status === 503);
  const pdf = await jpChartPdf(new URL(ORIGIN + '/api/efb/chart-pdf?cycle=JP20261126&file=RJTT/ADC'), env, { 'Access-Control-Allow-Origin': '*' }, { u: 'PAW0006' });
  assert.equal(pdf.status, 503); assert.equal(pdf.headers.get('Access-Control-Allow-Origin'), '*');
  kv.fail.clear();
  assert.equal((await jpChartsList('RJTT', env, { u: 'PAW0006' })).charts.length, 1);
  /* KV back: the commit adds to what is there */
  assert.equal((await jpChartsAdmin(navReq('/admin/api/navdata/jpcharts/commit', commitRJBB), '/admin/api/navdata/jpcharts/commit', env, 'boss@p.test')).status, 200);
  assert.deepEqual(Object.keys(kv.json(JPI).apts).sort(), ['RJAA', 'RJBB', 'RJTT']);
});

await test('P0-2 jpcharts: an index that is not one is 503 and left alone; none yet starts with the aerodrome committed', async () => {
  for (const bad of ['[]', JSON.stringify({ apts: [] }), 'nope']) {
    const kv = mkKv({ [JPI]: bad }), env = { STORE: kv, CHARTS: mkR2() };
    assert.equal((await jpChartsAdmin(navReq('/admin/api/navdata/jpcharts/delete', { apt: 'RJAA' }), '/admin/api/navdata/jpcharts/delete', env, 'boss@p.test')).status, 503, bad);
    assert.equal(kv.m.get(JPI), bad);
  }
  const kv = mkKv(), env = { STORE: kv, CHARTS: mkR2() };
  assert.equal((await jpChartsAdmin(navReq('/admin/api/navdata/jpcharts/commit', commitRJBB), '/admin/api/navdata/jpcharts/commit', env, 'boss@p.test')).status, 200);
  assert.deepEqual(Object.keys(kv.json(JPI).apts), ['RJBB']);
});

const { cnAdmin, cnPublic } = await import('../src/cnaip.js');
const CNI = 'cnaip:v1:idx';
const CNIDX = { at: 9, cycles: [
  { cycle: '2611', pub: '202611', eff: new Date(NOW - 20 * 86400_000).toISOString(), cells: ['16,112'], at: 9, by: 'boss' },
  { cycle: '2612', pub: '202612', eff: new Date(NOW + 8 * 86400_000).toISOString(), cells: ['16,112'], at: 9, by: 'boss' }] };
const CNCELL = { routes: [['A1']], fixes: [['F', 'FIXAA', 113, 18]], navs: [] };
const upload = { meta: { pub: '202613', eff: new Date(NOW + 36 * 86400_000).toISOString(), product: 'AIP-DS', issue: 'x' }, apt: { ZGSZ: { n: 'Shenzhen' } }, asp: { type: 'FeatureCollection', features: [] }, cells: { '16,112': { routes: [], fixes: [], navs: [] } } };
const CORS = { 'Access-Control-Allow-Origin': 'https://koz8738.com' };
const cnGet = (env, path) => cnPublic(new Request(ORIGIN + path), new URL(ORIGIN + path), env, CORS, { u: 'PAW0006' });

await test('P0-2 cnaip: a KV error on the AIRAC index refuses an upload or a delete (503) before anything is written; the uploaded AIRACs stay', async () => {
  const kv = mkKv({ [CNI]: CNIDX }), env = { STORE: kv };
  kv.fail.add(CNI);
  const u = await navdataAdmin(navReq('/admin/api/navdata/cn', upload), '/admin/api/navdata/cn', env, {}, 'boss@p.test');
  assert.equal(u.status, 503); assert.match((await u.json()).error, /China AIP data is temporarily unavailable/);
  const d = await cnAdmin(navReq('/admin/api/navdata/cn/delete', { cycle: '2611' }), '/admin/api/navdata/cn/delete', env, 'boss@p.test');
  assert.equal(d.status, 503);
  assert.deepEqual(kv.puts, [], 'not a cell, an airspace or the index was written');
  assert.deepEqual(kv.dels, [], 'no AIRAC was dropped');
  assert.deepEqual(kv.json(CNI), CNIDX);
  kv.fail.clear();
  assert.equal((await cnAdmin(navReq('/admin/api/navdata/cn', upload), '/admin/api/navdata/cn', env, 'boss@p.test')).status, 200);
  assert.deepEqual(kv.json(CNI).cycles.map((c) => c.cycle), ['2611', '2612', '2613'], 'added to the AIRACs there');
});

await test('P0-2 cnaip: pilots get a clean JSON 503 (with CORS) when the index, a cell or the airports cannot be read, not an exception or empty airways', async () => {
  const kv = mkKv({ [CNI]: CNIDX, 'cnaip:v1:c:2611:16,112': CNCELL, 'cnaip:v1:apt:2611': { ZGSZ: { n: 'Shenzhen' } }, 'cnaip:v1:asp:2611': { type: 'FeatureCollection', features: [] } }), env = { STORE: kv };
  kv.fail.add(CNI);
  for (const p of ['/api/efb/aip/ifr?lv=H&cell=16,112', '/api/efb/cn/ifr?lv=H&cell=16,112', '/api/efb/cn/asp', '/api/efb/cn/apt?icao=ZGSZ']) {
    const r = await cnGet(env, p); assert.equal(r.status, 503, p);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), CORS['Access-Control-Allow-Origin'], p);
    assert.match(r.headers.get('Cache-Control'), /no-store/, 'an error the EFB does not keep: ' + p);
    assert.match((await r.json()).error, /temporarily unavailable/, p);
  }
  kv.fail.clear(); later();
  kv.fail.add('cnaip:v1:c:2611:16,112');
  assert.equal((await cnGet(env, '/api/efb/aip/ifr?lv=H&cell=16,112')).status, 503, 'a cell that cannot be read is not an empty cell');
  kv.fail.clear(); kv.fail.add('cnaip:v1:apt:2611');
  assert.equal((await cnGet(env, '/api/efb/cn/apt?icao=ZGSZ')).status, 503);
  kv.fail.clear();
  const apt = await cnGet(env, '/api/efb/cn/apt?icao=ZGSZ'); assert.equal(apt.status, 200);
  assert.deepEqual((await apt.json()).apt, { n: 'Shenzhen' }, 'the failed read was not kept for the AIRAC as "no airports"');
  const ifr = await (await cnGet(env, '/api/efb/aip/ifr?lv=H&cell=16,112')).json();
  assert.equal(ifr.cn, 'ok'); assert.deepEqual(ifr.routes, CNCELL.routes);
});

await test('P0-2 cnaip: an index that is not one is 503 and left alone; none yet starts with the AIRAC uploaded', async () => {
  for (const bad of ['[]', JSON.stringify({ cycles: {} }), '"x"']) {
    later();
    const kv = mkKv({ [CNI]: bad });
    assert.equal((await cnAdmin(navReq('/admin/api/navdata/cn', upload), '/admin/api/navdata/cn', { STORE: kv }, 'boss@p.test')).status, 503, bad);
    assert.equal(kv.m.get(CNI), bad); assert.deepEqual(kv.puts, []);
  }
  const kv = mkKv();
  assert.equal((await cnAdmin(navReq('/admin/api/navdata/cn', upload), '/admin/api/navdata/cn', { STORE: kv }, 'boss@p.test')).status, 200);
  assert.deepEqual(kv.json(CNI).cycles.map((c) => c.cycle), ['2613']);
});

/* ================= 3. Inbox: the minute's reload keeps the reply being written (admin.js) ================= */
const { ADMIN_HTML } = await import('../src/admin.js');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slice = (a, b, what) => { const i = ADMIN_HTML.indexOf(a), j = ADMIN_HTML.indexOf(b, i); assert.ok(i > 0 && j > i, what); return ADMIN_HTML.slice(i, j); };
const inboxSrc = slice("/* ---------- Inbox tab: pilots' conversations with a department ---------- */", 'PG_LOAD.pilots=()=>plLoad();', 'the Inbox in admin.js');

/* a page with just enough DOM: innerHTML makes the elements with an id in it (what was there before is gone, as in a
   browser: a new <textarea> is empty, a new <select> has its selected option, focus on a removed element is lost) */
function mkInboxPage() {
  const reg = new Map(), docL = {}, intervals = []; let active = null;
  const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const attrsOf = (s) => { const a = {}; for (const m of s.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) a[m[1]] = m[2] == null ? '' : unesc(m[2]); return a; };
  const optionsOf = (s) => [...s.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map((m) => { const a = attrsOf(m[1]); return { value: a.value != null ? a.value : unesc(m[2]), text: unesc(m[2]), selected: 'selected' in a }; });
  const under = (el, anc) => { for (let p = el.parent; p; p = p.parent) if (p === anc) return true; return false; };
  function drop(anc) { for (const [id, el] of [...reg]) if (under(el, anc)) { reg.delete(id); el.gone = true; if (active === el) active = null; } }
  function grow(parent, html) {
    for (const m of html.matchAll(/<(\w+)\b([^>]*)>/g)) {
      const a = attrsOf(m[2]); if (!a.id) continue;
      const el = mkEl(m[1].toLowerCase(), a, parent), rest = html.slice(m.index + m[0].length);
      if (el.tagName === 'TEXTAREA') el._v = unesc(rest.slice(0, rest.indexOf('</textarea>')));
      if (el.tagName === 'SELECT') { el.options = optionsOf(rest.slice(0, rest.indexOf('</select>'))); const s = el.options.find((o) => o.selected) || el.options[0]; el._v = s ? s.value : ''; }
      reg.set(a.id, el);
    }
  }
  function mkEl(tag, a, parent) {
    const el = {
      tagName: tag.toUpperCase(), id: a.id || '', parent, gone: false, hidden: 'hidden' in a, disabled: 'disabled' in a, dataset: {}, options: [], _html: '', _v: '', selectionStart: 0, selectionEnd: 0, L: {},
      get innerHTML() { return this._html; },
      set innerHTML(h) { drop(this); this._html = String(h); if (this.tagName === 'SELECT') this.options = optionsOf(this._html); grow(this, this._html); },
      get value() { return this._v; },
      set value(v) { v = String(v); if (this.tagName === 'SELECT') this._v = this.options.some((o) => o.value === v) ? v : ''; else { this._v = v; this.selectionStart = this.selectionEnd = v.length; } },
      focus() { if (!this.gone) active = this; }, blur() { if (active === this) active = null; },
      setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
      addEventListener(t, f) { (this.L[t] = this.L[t] || []).push(f); },
      insertAdjacentHTML(pos, h) { this._html += h; if (this.tagName === 'SELECT') this.options.push(...optionsOf(h)); grow(this, h); },
      setAttribute() {}, scrollIntoView() {}, closest() { return this; },
    };
    for (const [k, v] of Object.entries(a)) if (k.startsWith('data-')) el.dataset[k.slice(5).replace(/-(\w)/g, (x, c) => c.toUpperCase())] = v;
    return el;
  }
  const body = mkEl('body', {}, null);
  for (const id of ['ibList', 'ibView', 'ibCount', 'cmIbN']) reg.set(id, mkEl('div', { id }, body));
  const dept = mkEl('select', { id: 'ibDept' }, body); dept.innerHTML = '<option value="">All departments</option>'; reg.set('ibDept', dept);
  const document = {
    hidden: false, body, get activeElement() { return active || body; },
    querySelector: (s) => (s === '.deny' ? null : /^#[\w-]+$/.test(s) ? reg.get(s.slice(1)) || null : null),
    querySelectorAll: () => [], addEventListener: (t, f) => { (docL[t] = docL[t] || []).push(f); },
  };
  /* the server: threads, departments; a reply can be held on its way (hold) */
  const S = { depts: ['Crew Management', 'Training', 'Flight Operations'], replies: [], states: [], hold: false, release: null, loads: 0,
    threads: [
      { th: 'T1', subj: 'Fuel query', pilot: 'PAW0006', name: 'Ann Pilot', cs: 'PAW703', dept: 'Crew Management', done: false, waiting: true, read: false, msgs: [{ t: 1000, kind: 'msg', body: 'Hello ops', cs: 'PAW703' }] },
      { th: 'T2', subj: 'Roster', pilot: 'PAW0012', name: 'Bo Pilot', cs: '', dept: 'Training', done: false, waiting: true, read: false, msgs: [{ t: 2000, kind: 'msg', body: 'Am I on Friday?' }] }] };
  const api = async (path, opt) => {
    if (path === '/admin/api/inbox') { S.loads++; return { threads: clone(S.threads), depts: S.depts.slice() }; }
    if (path === '/admin/api/inbox/state') { const b = JSON.parse(opt.body); S.states.push(b); const t = S.threads.find((x) => x.th === b.th); if (b.done != null) t.done = b.done; if (b.read) t.read = true; return { ok: true }; }
    if (path === '/admin/api/inbox/reply') { const b = JSON.parse(opt.body); S.replies.push(b); const t = S.threads.find((x) => x.th === b.th); const fin = () => { t.msgs.push({ t: 9000 + S.replies.length, kind: 'reply', from: b.dept, by: 'boss', body: b.body }); t.waiting = false; return { ok: true }; };
      if (S.hold) return new Promise((r) => { S.release = () => r(fin()); }); return fin(); }
    throw new Error('no such call ' + path);
  };
  const g = {
    document, $: (s) => document.querySelector(s), esc, api, ago: () => 'a minute ago', fmt: (t) => 'at ' + t, pgHas: () => true, pgNow: 'comms', pgOf: () => 'comms', hmUi() {},
    innerWidth: 1280, requestAnimationFrame: (f) => f(), alert: (m) => { throw new Error('alert: ' + m); }, console,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
  };
  vm.createContext(g); vm.runInContext(inboxSrc + '\n;globalThis.__ib={IB,ibUi,ibLoad};', g);
  const poll = intervals.find((x) => x.ms === 60000); assert.ok(poll, 'the Inbox reloads every minute');
  return {
    S, IB: g.__ib.IB, ibLoad: g.__ib.ibLoad, $: (s) => reg.get(s.replace(/^#/, '')) || null, document,
    /* the minute's reload, as the page's own setInterval runs it */
    minute: async () => { poll.fn(); await settle(); },
    /* a click on b (a browser sends none to a disabled button; force: as if it did) */
    click: (b, force) => { if (b.disabled && !force) return Promise.resolve(); return Promise.all((docL.click || []).map((f) => f({ target: { closest: () => b } }))); },
    open: async (th) => { await Promise.all((docL.click || []).map((f) => f({ target: { closest: () => ({ dataset: { ib: th } }) } }))); await settle(); },
  };
}

await test('P0-3 inbox: the minute\'s reload keeps the reply being written: the same text box, its text, cursor and focus, and "Reply as"', async () => {
  const P = mkInboxPage(); await P.ibLoad(); await P.open('T1');
  const box = P.$('#ibBody'); assert.ok(box, 'the reply box is drawn');
  box.value = 'Thanks, we will check the fuel'; box.focus(); box.setSelectionRange(7, 14);
  P.$('#ibAs').value = 'Training'; assert.equal(P.$('#ibAs').value, 'Training');
  const loads = P.S.loads;
  await P.minute(); await P.minute();
  assert.equal(P.S.loads, loads + 2, 'the reloads ran');
  assert.equal(P.$('#ibBody'), box, 'not drawn again');
  assert.equal(box.value, 'Thanks, we will check the fuel');
  assert.equal(P.document.activeElement, box); assert.deepEqual([box.selectionStart, box.selectionEnd], [7, 14]);
  assert.equal(P.$('#ibAs').value, 'Training', 'Reply as is not put back to the conversation\'s department');
  /* a new message in the conversation: the messages are drawn again, the reply box is not */
  P.S.threads[0].msgs.push({ t: 3000, kind: 'msg', body: 'Any update on this?' });
  await P.minute();
  assert.match(P.$('#ibMsgs').innerHTML, /Any update on this\?/);
  assert.equal(P.$('#ibBody'), box); assert.equal(box.value, 'Thanks, we will check the fuel');
  assert.equal(P.document.activeElement, box); assert.deepEqual([box.selectionStart, box.selectionEnd], [7, 14]);
  assert.equal(P.$('#ibAs').value, 'Training');
  /* the departments change: the reply box must be drawn again, and comes back with what was in it */
  P.S.depts.push('Fleet');
  await P.minute();
  const box2 = P.$('#ibBody');
  assert.notEqual(box2, box); assert.ok(P.$('#ibAs').options.some((o) => o.value === 'Fleet'));
  assert.equal(box2.value, 'Thanks, we will check the fuel'); assert.equal(P.document.activeElement, box2);
  assert.deepEqual([box2.selectionStart, box2.selectionEnd], [7, 14]); assert.equal(P.$('#ibAs').value, 'Training');
});

await test('P0-3 inbox: a reply on its way keeps Send off through the reloads, a second press sends nothing, and only then is the box emptied', async () => {
  const P = mkInboxPage(); await P.ibLoad(); await P.open('T1');
  P.$('#ibBody').value = 'On it'; P.$('#ibAs').value = 'Flight Operations';
  P.S.hold = true;
  const sending = P.click(P.$('#ibSend')); await settle();
  assert.equal(P.S.replies.length, 1); assert.equal(P.$('#ibSend').disabled, true);
  await P.minute();
  assert.equal(P.$('#ibSend').disabled, true, 'the reload does not turn Send back on');
  assert.equal(P.$('#ibBody').value, 'On it', 'nor empty the box before the reply is in');
  await P.click(P.$('#ibSend'), true); await P.click(P.$('#ibSend'), true); await settle();
  assert.equal(P.S.replies.length, 1, 'one reply, however often Send is pressed');
  P.S.release(); await sending; await settle();
  assert.deepEqual(P.S.replies, [{ th: 'T1', dept: 'Flight Operations', body: 'On it' }]);
  assert.equal(P.$('#ibSend').disabled, false); assert.equal(P.$('#ibBody').value, '');
  assert.match(P.$('#ibMsg').innerHTML, /Sent to PAW0006/);
  assert.match(P.$('#ibMsgs').innerHTML, /On it/, 'the reply shows in the conversation');
  /* a failed send: the text stays, Send is on again */
  P.S.hold = false; P.$('#ibBody').value = 'Second try';
  const realApi = P.S.replies.push; P.S.replies.push = () => { throw Object.assign(new Error('The pilot is not reachable'), { status: 502 }); };
  await P.click(P.$('#ibSend')); await settle(); P.S.replies.push = realApi;
  assert.equal(P.$('#ibBody').value, 'Second try'); assert.equal(P.$('#ibSend').disabled, false);
  assert.match(P.$('#ibMsg').innerHTML, /not reachable/);
});

await test('P0-3 inbox: Mark done and the reload redraw the head only; each conversation keeps its own unsent reply', async () => {
  const P = mkInboxPage(); await P.ibLoad(); await P.open('T1');
  const box = P.$('#ibBody'); box.value = 'Half written'; box.focus();
  await P.click({ dataset: { ibdone: '1' }, disabled: false }); await settle();
  assert.deepEqual(P.S.states.at(-1), { th: 'T1', done: true });
  assert.match(P.$('#ibHead').innerHTML, /Reopen/);
  assert.equal(P.$('#ibBody'), box); assert.equal(box.value, 'Half written'); assert.equal(P.document.activeElement, box);
  await P.open('T2');
  assert.equal(P.$('#ibBody').value, '', "the other conversation's box is its own");
  assert.equal(P.$('#ibAs').value, 'Training'); P.$('#ibBody').value = 'For T2';
  await P.open('T1');
  assert.equal(P.$('#ibBody').value, 'Half written', 'kept while the other was open');
  await P.open('T2'); assert.equal(P.$('#ibBody').value, 'For T2');
});

/* ================= 4. the gate plan: each page its own half, checked (stands.js, admin.js) ================= */
const { standsAdmin } = await import('../src/stands.js');
const PLAN = 'stands:v1:plan';
const PLAN0 = { on: true, dep: false, ls: true, sig: true, inr: true, lead: 30, miss: 'skip', apts: { KLAX: [{ stands: 'D1-D10', fl: 'all', ac: 'all', term: 'T4' }], KSFO: [{ stands: 'A1-A5', fl: 'dom', ac: 'narrow', term: '' }] }, at: 1000, swAt: 1000, aptsAt: 1000, by: 'boss@p.test' };
const JFK = { KJFK: [{ stands: 'B20-B30', fl: 'intl', ac: 'wide', term: '1' }] };
async function stPost(kv, body, { lim = null, who = 'boss@p.test' } = {}) {
  const req = new Request(ORIGIN + '/admin/api/stands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const r = await standsAdmin(req, new URL(req.url), '/admin/api/stands', { STORE: kv }, who, {}, lim);
  return { status: r.status, j: await r.json() };
}
async function stGet(kv) { const req = new Request(ORIGIN + '/admin/api/stands'); const r = await standsAdmin(req, new URL(req.url), '/admin/api/stands', { STORE: kv }, 'boss@p.test', {}, null); return (await r.json()).plan; }
const swOf = (p) => ({ on: p.on, dep: p.dep, ls: p.ls, sig: p.sig, inr: p.inr, lead: p.lead, miss: p.miss });
/* the admin page's own builders of what Gates and Automatic messages send */
const builders = slice('const stAt=', '/* gates given to Polaris flights around now', 'the gate plan save bodies in admin.js');
function mkPageST(plan) { const g = { ST: { plan: clone(plan), saved: clone(plan) } }; vm.createContext(g); vm.runInContext(builders + '\n;globalThis.__b={stAt,stBody,auBody};', g); return { ST: g.ST, ...g.__b }; }

await test('P0-4 stands: part "sw" changes only the switches sent; part "apts" only the gates; each keeps the other half as KV has it', async () => {
  const kv = mkKv({ [PLAN]: PLAN0 });
  const a = await stPost(kv, { part: 'sw', base: 1000, dep: true, apts: {}, on: undefined });
  assert.equal(a.status, 200);
  let p = kv.json(PLAN);
  assert.deepEqual(swOf(p), { ...swOf(PLAN0), dep: true }, 'only dep changed; on (not sent) kept');
  assert.deepEqual(p.apts, PLAN0.apts, 'the gates sent with it are ignored');
  assert.equal(p.aptsAt, 1000); assert.ok(p.swAt > 1000 && p.at === p.swAt);
  const b = await stPost(kv, { part: 'apts', base: 1000, apts: JFK, on: false, dep: false, lead: 60 });
  assert.equal(b.status, 200);
  const p2 = kv.json(PLAN);
  assert.deepEqual(p2.apts, JFK);
  assert.deepEqual(swOf(p2), swOf(p), 'the switches sent with gates are ignored');
  assert.equal(p2.swAt, p.swAt); assert.ok(p2.aptsAt > p.at && p2.at === p2.aptsAt);
});

await test('P0-4 stands: Gates and Automatic messages open at once never write back each other\'s stale half (the page\'s own save bodies)', async () => {
  const kv = mkKv({ [PLAN]: PLAN0 }), loaded = await stGet(kv);
  const gates = mkPageST(loaded), auto = mkPageST(loaded);
  /* Automatic messages turns the departure gate on, then Gates (opened before that) saves its gates */
  assert.deepEqual(Object.keys(auto.auBody({ dep: true })).sort(), ['base', 'dep', 'part'], 'no gates in a switch save');
  assert.equal((await stPost(kv, auto.auBody({ dep: true }))).status, 200);
  gates.ST.plan.apts.KLAX[0].stands = 'D1-D20';
  assert.deepEqual(Object.keys(gates.stBody()).sort(), ['apts', 'base', 'part'], 'no switches in a gates save');
  const g = await stPost(kv, gates.stBody());
  assert.equal(g.status, 200, 'the other half moving on is no conflict');
  let p = kv.json(PLAN);
  assert.equal(p.dep, true, "the switch survives Gates' save"); assert.equal(p.apts.KLAX[0].stands, 'D1-D20');
  /* the other way round: Gates saves, then Automatic messages (opened before that) flips a switch */
  const loaded2 = await stGet(kv), gates2 = mkPageST(loaded2), auto2 = mkPageST(loaded2);
  gates2.ST.plan.apts = JFK;
  assert.equal((await stPost(kv, gates2.stBody())).status, 200);
  assert.equal((await stPost(kv, auto2.auBody({ ls: false }))).status, 200);
  p = kv.json(PLAN);
  assert.deepEqual(p.apts, JFK, "the gates survive Automatic messages' save"); assert.equal(p.ls, false); assert.equal(p.dep, true);
});

await test('P0-4 stands: the same half saved over a newer save (stale base) is refused, 409 { conflict, plan }, nothing written; with the base it now has, it saves', async () => {
  const kv = mkKv({ [PLAN]: PLAN0 }), loaded = await stGet(kv);
  /* two people on Gates */
  const ann = mkPageST(loaded), bo = mkPageST(loaded);
  bo.ST.plan.apts = JFK; assert.equal((await stPost(kv, bo.stBody())).status, 200);
  const before = kv.m.get(PLAN), puts = kv.puts.length;
  ann.ST.plan.apts.KSFO[0].stands = 'A1-A9';
  const c = await stPost(kv, ann.stBody(), { who: 'ann@p.test' });
  assert.equal(c.status, 409); assert.equal(c.j.conflict, true); assert.match(c.j.error, /changed the gate plan/);
  assert.deepEqual(c.j.plan.apts, JFK, "the 409 carries the plan as it is now (Bo's)");
  assert.equal(kv.m.get(PLAN), before); assert.equal(kv.puts.length, puts, 'nothing written');
  /* the page takes the conflict's plan as its base (as admin.js does): a deliberate save now goes through */
  ann.ST.plan.aptsAt = c.j.plan.aptsAt;
  assert.equal((await stPost(kv, ann.stBody(), { who: 'ann@p.test' })).status, 200);
  assert.equal(kv.json(PLAN).apts.KSFO[0].stands, 'A1-A9');
  /* two people on Automatic messages */
  const l2 = await stGet(kv), x = mkPageST(l2), y = mkPageST(l2);
  assert.equal((await stPost(kv, x.auBody({ on: false }))).status, 200);
  const before2 = kv.m.get(PLAN);
  const c2 = await stPost(kv, y.auBody({ sig: false }));
  assert.equal(c2.status, 409); assert.equal(c2.j.plan.on, false); assert.match(c2.j.error, /automatic messages/);
  assert.equal(kv.m.get(PLAN), before2);
  y.ST.saved = clone(c2.j.plan);
  assert.equal((await stPost(kv, y.auBody({ sig: false }))).status, 200);
  const p = kv.json(PLAN); assert.equal(p.on, false); assert.equal(p.sig, false);
});

await test('P0-4 stands: a plan from before swAt/aptsAt reads at for both; a whole-plan save (no part) still works, checked against at, and keeps the gates it was not sent', async () => {
  const old = { ...PLAN0 }; delete old.swAt; delete old.aptsAt; old.at = 5000;
  const kv = mkKv({ [PLAN]: old }), loaded = await stGet(kv);
  assert.equal(loaded.swAt, 5000); assert.equal(loaded.aptsAt, 5000);
  const page = mkPageST(old);   /* a page that read the plan before the server had these times */
  assert.equal(page.stBody().base, 5000); assert.equal(page.auBody({}).base, 5000);
  assert.equal((await stPost(kv, page.auBody({ dep: true }))).status, 200);
  assert.equal((await stPost(kv, page.stBody())).status, 200, 'the gates half is still at 5000');
  /* the whole plan, as an older page sends it */
  const full = { ...swOf(PLAN0), on: false, apts: JFK };
  const s1 = await stPost(kv, full); assert.equal(s1.status, 200, 'no base: no check');
  assert.deepEqual(kv.json(PLAN).apts, JFK); assert.equal(kv.json(PLAN).on, false);
  assert.equal((await stPost(kv, { ...full, base: 5000 })).status, 409, 'a stale base for the whole plan');
  assert.equal((await stPost(kv, { ...full, on: true, base: s1.j.plan.at })).status, 200);
  const noGates = { ...swOf(PLAN0), lead: 45 };
  assert.equal((await stPost(kv, noGates)).status, 200);
  assert.deepEqual(kv.json(PLAN).apts, JFK, 'a whole-plan save without gates keeps them'); assert.equal(kv.json(PLAN).lead, 45);
});

await test('P0-4 stands: a KV error on the plan refuses every save (503), writes nothing; a part the role may not change is 403 (also through the roles)', async () => {
  const kv = mkKv({ [PLAN]: PLAN0 }); kv.fail.add(PLAN);
  for (const b of [{ part: 'sw', base: 1000, on: false }, { part: 'apts', base: 1000, apts: JFK }, { ...swOf(PLAN0), apts: JFK }]) {
    const r = await stPost(kv, b); assert.equal(r.status, 503, JSON.stringify(b)); assert.match(r.j.error, /gate plan is temporarily unavailable/);
  }
  assert.deepEqual(kv.puts, []); kv.fail.clear();
  for (const bad of ['[]', '"x"', JSON.stringify({ apts: [] })]) {
    const k2 = mkKv({ [PLAN]: bad });
    assert.equal((await stPost(k2, { part: 'sw', on: true })).status, 503, bad); assert.equal(k2.m.get(PLAN), bad);
  }
  assert.equal((await stPost(kv, { part: 'apts', base: 1000 })).status, 400, 'a gates save needs its gates');
  assert.equal((await stPost(kv, { part: 'both', base: 1000 })).status, 400);
  assert.equal((await stPost(kv, { part: 'sw', base: 'soon' })).status, 400);
  /* lim (from the roles): Gates only, or Automatic messages only */
  assert.equal((await stPost(kv, { part: 'sw', base: 1000, on: false }, { lim: { sw: true, apts: false } })).status, 403);
  assert.equal((await stPost(kv, { part: 'apts', base: 1000, apts: JFK }, { lim: { sw: false, apts: true } })).status, 403);
  assert.deepEqual(kv.json(PLAN), PLAN0);
  const r = await stPost(kv, { ...swOf(PLAN0), on: false, apts: JFK }, { lim: { sw: true, apts: false } });
  assert.equal(r.status, 200); assert.equal(kv.json(PLAN).on, true, 'switches kept for a role without them'); assert.deepEqual(kv.json(PLAN).apts, JFK);
  assert.equal(kv.json(PLAN).swAt, 1000, 'and their time with them');
  /* the same through /admin with a role that has Gates but not the automatic messages */
  const kv3 = mkKv({ [PLAN]: PLAN0, [ROLES]: { people: { 'gates@p.test': { role: 'gt' }, 'boss@p.test': { role: 'admin' } }, roles: { gt: { name: 'Gates', pages: ['gates'], can: ['gates'] } } } });
  assert.equal((await admin(kv3, 'gates@p.test', '/admin/api/stands', { method: 'POST', body: { part: 'sw', base: 1000, on: false } })).status, 403);
  assert.equal((await admin(kv3, 'gates@p.test', '/admin/api/stands', { method: 'POST', body: { part: 'apts', base: 1000, apts: JFK } })).status, 200);
  assert.equal(kv3.json(PLAN).on, true); assert.deepEqual(kv3.json(PLAN).apts, JFK);
});

await test('P0-4 stands: two saves in the same millisecond get different times, so a base always tells them apart', async () => {
  const kv = mkKv({ [PLAN]: { ...PLAN0, at: NOW, swAt: NOW, aptsAt: NOW } }), page = mkPageST(await stGet(kv));
  const a = await stPost(kv, page.auBody({ dep: true })), b = await stPost(kv, page.auBody({ ls: false }));
  assert.equal(a.status, 200); assert.ok(a.j.plan.swAt > NOW);
  assert.equal(b.status, 409, 'the second, from the same old base, is refused even in the same millisecond');
});

await test('P0-4 admin page: Gates and Automatic messages send their builders\' bodies, and take a 409\'s plan', async () => {
  assert.match(ADMIN_HTML, /body:JSON\.stringify\(stBody\(\)\)/); assert.match(ADMIN_HTML, /body:JSON\.stringify\(auBody\(patch\)\)/);
  assert.doesNotMatch(ADMIN_HTML, /stPlanNow/, 'the old whole-plan body is gone');
  assert.match(ADMIN_HTML, /er\.status===409&&er\.data&&er\.data\.plan/);
  /* api() hands a refusal's status and body on */
  const api = slice('const api=async', '\nconst say=', 'api() in admin.js');
  const g = { fetch: async () => new Response(JSON.stringify({ error: 'Someone else changed it', conflict: true, plan: { at: 9 } }), { status: 409 }) };
  vm.createContext(g); vm.runInContext(api + '\n;globalThis.__api=api;', g);
  await assert.rejects(g.__api('/admin/api/stands', { method: 'POST' }), (e) => e.message === 'Someone else changed it' && e.status === 409 && e.data.plan.at === 9);
  /* base: Gates' from the plan its edits started from; Automatic messages' from the plan shown */
  const page = mkPageST(PLAN0); page.ST.saved = { ...PLAN0, aptsAt: 7777, swAt: 8888 };
  /* (made in the page's own realm: compared as the JSON it sends) */
  assert.deepEqual(clone(page.stBody()), { part: 'apts', base: 1000, apts: PLAN0.apts }, 'a reload while editing does not move the base of the edits');
  assert.deepEqual(clone(page.auBody({ on: false })), { part: 'sw', base: 8888, on: false });
});

/* ================= 5. Broadcast's keys (admin.js) ================= */
const bcSrc = slice('/* directing */', '/* Polaris Cam (cam.js): its cockpit cameras, live', "Broadcast's directing in admin.js");
/* an element, as far as closest() goes: tag, attributes, parent (simple selectors only; anything else fails loudly) */
const matchOne = (n, s) => { const m = /^([a-z]+)?((?:\[[\w-]+(?:="[^"]*")?\])*)$/.exec(s.trim()); if (!m || !(m[1] || m[2])) throw new Error('selector not understood here: ' + s); if (m[1] && n.tag !== m[1]) return false; for (const a of m[2].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) { if (!(a[1] in n.attrs)) return false; if (a[2] != null && n.attrs[a[1]] !== a[2]) return false; } return true; };
const node = (tag, attrs = {}, parent = null) => ({ tag, attrs, parent, closest(sel) { const L = sel.split(','); for (let n = this; n; n = n.parent) if (L.some((s) => matchOne(n, s))) return n; return null; } });
function mkBc() {
  const docL = {}, take = { disabled: false };
  const BC = { pvw: '', pc: { pgm: 'Cockpit' }, n: 0, cb: {}, cfg: {}, ws: { readyState: 1, sent: [], send(m) { this.sent.push(JSON.parse(m)); } } };
  const g = { BC, pgNow: 'bc', bcDir: () => true, bcScenes: () => ['Cockpit', 'Cabin', 'Wing'], bcObsOn: () => true, bcTiles() {}, bcMon() {}, bcSay() {}, bcSlate: () => '',
    $: (s) => (s === '#bcTake' ? take : null), api: async () => ({}), console, setTimeout,
    document: { addEventListener: (t, f) => { (docL[t] = docL[t] || []).push(f); } } };
  vm.createContext(g); vm.runInContext(bcSrc, g);
  const html = node('html'), body = node('body', {}, html), bc = node('section', { id: 'bc' }, body);
  const key = (k, target = body, mods = {}) => { const e = { key: k, target, metaKey: false, ctrlKey: false, altKey: false, repeat: false, ...mods, prevented: false, preventDefault() { this.prevented = true; } }; (docL.keydown || []).forEach((f) => f(e)); return e; };
  const click = (t, detail) => (docL.click || []).forEach((f) => f({ target: { closest: () => t }, detail }));
  return { g, BC, take, body, bc, key, click, sent: () => BC.ws.sent };
}

await test('P0-5 broadcast: 1–9 and Space from the page itself still pick and take', async () => {
  const B = mkBc();
  const e2 = B.key('2'); assert.equal(e2.prevented, true); assert.equal(B.BC.pvw, 'Cabin'); assert.deepEqual(B.sent().at(-1), { pvw: 'Cabin' });
  const sp = B.key(' '); assert.equal(sp.prevented, true);
  assert.deepEqual(B.sent().at(-1).cmd, { id: 'c1', op: 'scene', name: 'Cabin', swap: true }, 'Space took Preview to Program');
  assert.equal(B.key('7').prevented, false, 'no seventh scene: the key is left alone');
});

await test('P0-5 broadcast: Space and 1–9 on a focused button, link, summary, label, [role=button] (or inside one) and fields are left to them', async () => {
  const B = mkBc(), p = B.bc;
  const targets = {
    button: node('button', {}, p), 'tile button (data-bcs)': node('button', { 'data-bcs': 'Wing', class: 'bc-tile' }, p), 'icon inside a button': node('i', {}, node('button', {}, p)),
    a: node('a', { href: '#gates' }, p), summary: node('summary', {}, node('details', {}, p)), 'inside details': node('div', {}, node('details', {}, p)), label: node('label', {}, p),
    '[role=button]': node('div', { role: 'button', tabindex: '0' }, p), '[role=link]': node('span', { role: 'link' }, p), '[role=menuitem]': node('li', { role: 'menuitem' }, p),
    '[role=switch]': node('div', { role: 'switch' }, p), input: node('input', { type: 'checkbox' }, p), textarea: node('textarea', {}, p), select: node('select', {}, p), contenteditable: node('div', { contenteditable: 'true' }, p),
  };
  B.BC.pvw = 'Cabin';
  for (const [what, t] of Object.entries(targets)) {
    const n0 = B.sent().length;
    const d = B.key('3', t); assert.equal(d.prevented, false, '3 on ' + what); assert.equal(B.BC.pvw, 'Cabin', '3 on ' + what);
    const s = B.key(' ', t); assert.equal(s.prevented, false, 'Space on ' + what + ' is the control\'s own');
    assert.equal(B.sent().length, n0, 'nothing sent from ' + what);
  }
});

await test('P0-5 broadcast: Space is left alone (no preventDefault) when there is no take: TAKE off, nothing in Preview, Preview already on air; modifiers and other pages too', async () => {
  const B = mkBc();
  B.BC.pvw = 'Cabin'; B.take.disabled = true;
  assert.equal(B.key(' ').prevented, false, 'TAKE is off'); B.take.disabled = false;
  B.BC.pvw = ''; assert.equal(B.key(' ').prevented, false, 'nothing in Preview');
  B.BC.pvw = 'Cockpit'; assert.equal(B.key(' ').prevented, false, 'Preview is what is on air');
  assert.equal(B.sent().length, 0);
  B.BC.pvw = 'Cabin';
  for (const m of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) { assert.equal(B.key(' ', B.body, m).prevented, false, JSON.stringify(m)); assert.equal(B.key('1', B.body, m).prevented, false, JSON.stringify(m)); }
  B.g.pgNow = 'fw'; assert.equal(B.key(' ').prevented, false, 'not on Broadcast'); assert.equal(B.key('1').prevented, false);
  B.g.pgNow = 'bc'; B.g.bcDir = () => false; assert.equal(B.key(' ').prevented, false, 'not directing'); assert.equal(B.sent().length, 0);
});

await test('P0-5 broadcast: a scene or TAKE clicked with the mouse hands the focus back to the page (so the keys go on working); from the keyboard it stays', async () => {
  const B = mkBc(); let blurred = 0;
  const tile = { dataset: { bcs: 'Wing' }, id: '', disabled: false, blur: () => { blurred++; } };
  B.click(tile, 1); assert.equal(blurred, 1); assert.equal(B.BC.pvw, 'Wing');
  B.click(tile, 0); assert.equal(blurred, 1, 'a keyboard press keeps the focus where it is');
  const takeBtn = { dataset: {}, id: 'bcTake', disabled: false, blur: () => { blurred++; } };
  B.click(takeBtn, 1); assert.equal(blurred, 2); assert.equal(B.sent().at(-1).cmd.op, 'scene');
  const setup = { dataset: {}, id: 'bcSetB', disabled: false, blur: () => { blurred += 100; }, setAttribute() {} };
  B.g.$ = (s) => (s === '#bcSet' ? { hidden: true } : s === '#bcTake' ? B.take : null); B.g.bcSetUi = () => {};
  B.click(setup, 1); assert.equal(blurred, 2, 'other buttons keep their focus');
});

/* ================= the files changed parse ================= */
await test('syntax: every file changed passes node --check; every inline <script> of the admin page parses; its <style> braces balance', async () => {
  const { execFileSync } = await import('node:child_process'), { fileURLToPath } = await import('node:url');
  for (const f of ['mail.js', 'admin.js', 'stands.js', 'aoctpl.js', 'jpcharts.js', 'cnaip.js', 'kvread.js', 'navdata.js', 'index.js']) execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../src/' + f, import.meta.url))], { stdio: 'pipe' });
  const S = [...ADMIN_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  assert.ok(S.length >= 2 && S.some((s) => s.includes('function ibForm(')) && S.some((s) => s.includes('BC_KEYS_OFF')));
  for (const s of S) assert.doesNotThrow(() => new vm.Script(s, { filename: 'admin-inline.js' }));
  const C = [...ADMIN_HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((x) => x[1]); assert.ok(C.length >= 1);
  for (const c of C) { let d = 0; for (const ch of c.replace(/"[^"]*"|'[^']*'/g, '')) { if (ch === '{') d++; else if (ch === '}') { d--; assert.ok(d >= 0, 'a } with no {'); } } assert.equal(d, 0, 'every { closed'); }
});

globalThis.fetch = realFetch; Date.now = realNow; console.warn = realWarn;
console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ', all passed'));
