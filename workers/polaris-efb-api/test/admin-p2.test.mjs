/* The P2 hardening of the Polaris Operations admin (Nov 2026), and the three small notes from the P1 review: plain
   Node 22, no npm packages.
     node workers/polaris-efb-api/test/admin-p2.test.mjs
   Backend
     A1  the admin's WebSockets (Broadcast's desk, Polaris Cam) keep the Access sign-in's expiry and close (4401) once it
         has passed; a role changed or taken away closes that person's sockets at once (4403, POST /revoke)
     A2  each change also needs one of the pages it is made from (ACT_PAGES, as the role editor's RL_ACTS)
     A3  "$&", "$'" in an email or a role's name never corrupt the page (replacement functions)
     A4  the page's Content-Security-Policy: object-src, base-uri, form-action
     A5  storage stays bounded: mail let go past 300 takes its attachments (and a KV location a write behind loses
         nothing this isolate wrote); documents count uploads not finished; the calendar makes way with entries that are
         over (or says it is full); a pilot's read marks (500) and a task's notes (100) are capped
     A6  Content-Type checks anchored; error messages without the server's insides
   Admin page (admin.js, admin-live), parts of it run here in a stand-in context
     B7–16 the latest answer wins (sequence numbers), a forced refresh after a write, busy flags that queue or say so,
         reconnecting with backoff (and the sign-in checked), commands waiting when the desk drops, the decoder's
         support cached and its errors backed off, the auto director's rules, timeouts, Flight Watch's errors with
         Retry, fewer redraws, small async fixes
     C17–23 the CSS and the buttons
   Cloudflare Access, KV, the Durable Objects and their SQLite (node:sqlite), WebSockets and the browser are stood in for;
   time is the test's. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

let NOW = Date.UTC(2026, 10, 29, 12, 0, 0);
const realNow = Date.now; Date.now = () => NOW;
const realWarn = console.warn, warned = []; console.warn = (...a) => { warned.push(a.join(' ')); };
process.removeAllListeners('warning');   /* node:sqlite says it is experimental: not a test failure */

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + ((e && e.stack) || e)); process.exitCode = 1; }
}
const settle = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const clone = (v) => JSON.parse(JSON.stringify(v));
const MB = 1048576;

/* ---- the Workers runtime: WebSockets, a Response that takes 101 ---- */
class MockWS {
  constructor() { this.readyState = 1; this.sent = []; this.closed = null; this.att = null; this.tags = []; this.peer = null; }
  accept() {}
  send(d) { if (this.readyState !== 1) throw new Error('closed'); this.sent.push(d); }
  close(code, reason) { if (this.readyState >= 2) return; this.readyState = 3; this.closed = { code, reason }; }
  serializeAttachment(a) { this.att = structuredClone(a); }
  deserializeAttachment() { return this.att; }
  texts() { return this.sent.filter((m) => typeof m === 'string' && m !== 'pong').map((m) => JSON.parse(m)); }
}
globalThis.WebSocketPair = class { constructor() { const c = new MockWS(), s = new MockWS(); c.peer = s; s.peer = c; this[0] = c; this[1] = s; } };
const RealResponse = globalThis.Response;
globalThis.Response = class extends RealResponse {
  constructor(body, init) { if (init && init.status === 101) { super(null, { status: 200 }); this._ws = init.webSocket; this._st = 101; } else super(body, init); }
  get status() { return this._st || super.status; }
  get webSocket() { return this._ws || null; }
};
const jsonResp = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
function mkCtx() {
  const socks = [], store = new Map();
  return {
    store, socks,
    storage: { get: async (k) => (store.has(k) ? structuredClone(store.get(k)) : undefined), put: async (k, v) => { store.set(k, structuredClone(v)); } },
    acceptWebSocket(ws, tags) { ws.tags = tags; socks.push(ws); },
    getWebSockets(tag) { return socks.filter((w) => !tag || w.tags.includes(tag)); },
    getTags(ws) { return ws.tags; },
    waitUntil() {},
  };
}
const up = (url, h = {}) => new Request(url, { headers: { Upgrade: 'websocket', ...h } });

/* ---- KV: text or bytes; list() with each key's metadata; fail: keys whose get (k), put (k:put) or delete (k:del)
   throws; stale: keys whose get answers with the value from before the last put ---- */
function mkKv(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const kv = {
    m, meta: new Map(), fail: new Set(), puts: [], dels: [], stale: new Set(), was: new Map(),
    async get(k, t) {
      if (kv.fail.has(k)) throw new Error('KV GET failed (test)');
      const v = kv.stale.has(k) && kv.was.has(k) ? kv.was.get(k) : m.get(k); if (v == null) return null;
      const type = typeof t === 'string' ? t : t && t.type;
      if (type === 'arrayBuffer') return v instanceof ArrayBuffer ? v.slice(0) : new TextEncoder().encode(v).buffer;
      if (v instanceof ArrayBuffer) return new TextDecoder().decode(v);
      return type === 'json' ? JSON.parse(v) : v;
    },
    async getWithMetadata(k, t) { const value = await kv.get(k, t); return { value, metadata: value == null ? null : kv.meta.get(k) ?? null }; },
    async put(k, v, o) {
      if (kv.fail.has(k + ':put')) throw new Error('KV PUT failed (test)');
      kv.puts.push(k); kv.was.set(k, m.get(k));
      m.set(k, typeof v === 'string' ? v : v instanceof ArrayBuffer ? v.slice(0) : ArrayBuffer.isView(v) ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : String(v));
      if (o && o.metadata) kv.meta.set(k, o.metadata);
    },
    async delete(k) { if (kv.fail.has(k + ':del')) throw new Error('KV DELETE failed (test)'); kv.dels.push(k); m.delete(k); kv.meta.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name, metadata: kv.meta.get(name) })), list_complete: true }; },
    json(k) { const v = m.get(k); return v == null ? null : JSON.parse(v); },
  };
  return kv;
}

/* ---- Cloudflare Access (a key made here signs the sign-ins; exp: seconds from now) ---- */
const TEAM = 'p2.cloudflareaccess.com', AUD = 'p2-aud', ORIGIN = 'https://efb-api.example';
const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => { const s = String(u && u.url ? u.url : u); if (s === 'https://' + TEAM + '/cdn-cgi/access/certs') return jsonResp({ keys: [jwk] }); throw new Error('no network in these tests: ' + s); };
async function signIn(email, secs = 3600) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })), p = b64u(JSON.stringify({ aud: [AUD], iss: 'https://' + TEAM, email, exp: Math.floor(NOW / 1000) + secs }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(h + '.' + p));
  return h + '.' + p + '.' + b64u(new Uint8Array(sig));
}
function mkCrew() { const calls = []; return { calls, ns: { idFromName: () => 'crew', get: () => ({ fetch: async (u, init) => { const a = JSON.parse(init.body); calls.push(a); return jsonResp(a.op === 'ciList' ? { list: [] } : { ok: true }); } }) } }; }
/* a Durable Object namespace that notes what it is asked (url, body) and answers ok */
function mkNs(answer = () => ({ ok: true, closed: 0 })) {
  const calls = [];
  return { calls, ns: { idFromName: (n) => n, get: (id) => ({ fetch: async (u, init) => { const req = u instanceof Request ? u : new Request(u, init); calls.push({ id, url: req.url, method: req.method, body: req.method === 'POST' ? await req.text() : null }); return jsonResp(answer(req)); } }) } };
}
const { mailAdmin, mailPublic, accessSession, accessUser, ACT_PAGES, ROLE_ACTS } = await import('../src/mail.js');
const ENV = (kv, more = {}) => ({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, STORE: kv, CREW: mkCrew().ns, ...more });
async function admin(kv, email, path, { method = 'GET', body, headers = {}, env, opts = {}, secs } = {}) {
  const hd = { 'Cf-Access-Jwt-Assertion': await signIn(email, secs), ...headers };
  const raw = body instanceof ArrayBuffer || ArrayBuffer.isView(body) || typeof body === 'string';
  if (body !== undefined && !raw && !('Content-Type' in hd)) hd['Content-Type'] = 'application/json';
  const req = new Request(ORIGIN + path, { method, headers: hd, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  return mailAdmin(req, new URL(req.url), env || ENV(kv), opts);
}
const ROLES = 'admin:v1:roles';
const rolesOn = (roles, people) => ({ people: { 'boss@p.test': { role: 'admin' }, ...people }, roles, at: 1, by: 'boss@p.test' });
const { ADMIN_HTML } = await import('../src/admin.js');
const { LIVE_JS } = await import('../src/live-bundle.js');

/* ================= A1. the admin's WebSockets: the sign-in's expiry, and a role changed ================= */
await test('A1 accessSession: { email, exp } from the Access token (exp in seconds); accessUser still answers the email alone', async () => {
  const tok = await signIn('Boss@P.test', 900), req = new Request(ORIGIN + '/admin', { headers: { 'Cf-Access-Jwt-Assertion': tok } }), env = ENV(mkKv());
  assert.deepEqual(await accessSession(req, env), { email: 'boss@p.test', exp: Math.floor(NOW / 1000) + 900 });
  assert.equal(await accessUser(req, env), 'boss@p.test');
});

const { LiveDesk, deskAdmin, deskRevoke } = await import('../src/desk.js');
function mkDesk() {
  const ctx = mkCtx(), desk = new LiveDesk(ctx, {});
  return { ctx, desk, env: { DESK: { idFromName: () => 'desk', get: () => ({ fetch: (i, init) => desk.fetch(i instanceof Request ? i : new Request(i, init)) }) } } };
}
async function deskJoin(D, role, who, exp) { const r = await D.desk.fetch(up('https://desk/ws?role=' + role + '&who=' + encodeURIComponent(who) + '&exp=' + exp)); assert.equal(r.status, 101); return r.webSocket.peer; }
const sec = (ms = 0) => Math.floor((NOW + ms) / 1000);

await test('A1 desk: a page whose sign-in has run out is closed (4401 "Session expired") as it next speaks, and its command is not run; one still signed in is answered', async () => {
  const D = mkDesk(), old = await deskJoin(D, 'dir', 'old@p.test', sec(60_000)), fresh = await deskJoin(D, 'dir', 'new@p.test', sec(3600_000));
  assert.equal(old.texts()[0].t, 'hello'); assert.deepEqual(old.att, { who: 'old@p.test', exp: sec(60_000) });
  NOW += 61_000;
  const cmd = JSON.stringify({ cmd: { id: 'c1', op: 'start' } });
  await D.desk.webSocketMessage(old, cmd);
  assert.deepEqual(old.closed, { code: 4401, reason: 'Session expired' }); assert.equal(old.texts().filter((m) => m.t === 'ack').length, 0, 'not answered: not run');
  await D.desk.webSocketMessage(fresh, cmd);
  assert.equal(fresh.closed, null); assert.deepEqual(fresh.texts().find((m) => m.t === 'ack'), { t: 'ack', id: 'c1', ok: false, err: 'The simulator PC is not on the desk' });
  /* one that opens with a sign-in already run out: closed at once, never told the desk */
  const r = await D.desk.fetch(up('https://desk/ws?role=dir&who=late%40p.test&exp=' + sec(-1000)));
  assert.equal(r.webSocket.peer.closed.code, 4401); assert.equal(r.webSocket.peer.sent.length, 0); assert.equal(D.ctx.socks.includes(r.webSocket.peer), false);
});

await test('A1 desk: a new overlay link (and every cfg) goes only to the directors still signed in; one whose sign-in ran out is closed instead', async () => {
  const D = mkDesk(), old = await deskJoin(D, 'dir', 'old@p.test', sec(10_000)), fresh = await deskJoin(D, 'dir', 'new@p.test', sec(3600_000)), view = await deskJoin(D, 'view', 'v@p.test', sec(3600_000));
  NOW += 11_000; old.sent = []; fresh.sent = []; view.sent = [];
  const r = await D.desk.fetch(new Request('https://desk/token', { method: 'POST', body: JSON.stringify({ who: 'new@p.test' }) }));
  const tok = (await r.json()).cfg.token; assert.match(tok, /^[A-Za-z0-9_-]{24,40}$/);
  assert.equal(old.closed.code, 4401); assert.equal(old.sent.filter((m) => String(m).includes(tok)).length, 0, 'the link never went to it');
  assert.equal(fresh.texts().find((m) => m.t === 'cfg').cfg.token, tok);
  assert.equal(view.texts().find((m) => m.t === 'cfg').cfg.token, undefined, 'a watcher never sees the link');
});

await test('A1 desk: a watcher (who never speaks) whose sign-in has run out gets nothing more: the next thing the desk says closes it instead (4401)', async () => {
  const D = mkDesk(), v = await deskJoin(D, 'view', 'v@p.test', sec(5_000)), d = await deskJoin(D, 'dir', 'd@p.test', sec(3600_000));
  NOW += 6_000; v.sent = []; d.sent = [];
  const r = await D.desk.fetch(new Request('https://desk/cfg', { method: 'POST', body: JSON.stringify({ who: 'd@p.test', cfg: { title: 'First flight' } }) }));
  assert.equal(r.status, 200); assert.equal(v.closed.code, 4401); assert.equal(v.sent.length, 0, 'not the log, not the settings');
  assert.ok(d.texts().some((m) => m.t === 'log') && d.texts().some((m) => m.t === 'cfg'), 'one still signed in hears it all');
});

await test('A1 desk: POST /revoke closes the sockets of the emails given (4403), or with keep every email not in it; the others stay', async () => {
  const D = mkDesk(), a = await deskJoin(D, 'dir', 'a@p.test', sec(3600_000)), b = await deskJoin(D, 'dir', 'B@p.test', sec(3600_000)), c = await deskJoin(D, 'view', 'c@p.test', sec(3600_000));
  const j = await deskRevoke(D.env, ['b@p.test'], null);
  assert.deepEqual(j, { ok: true, closed: 1 }); assert.deepEqual(b.closed, { code: 4403, reason: 'Your access changed' }); assert.equal(a.closed, null); assert.equal(c.closed, null);
  assert.deepEqual(await deskRevoke(D.env, [], ['a@p.test']), { ok: true, closed: 1 }); assert.equal(c.closed.code, 4403); assert.equal(a.closed, null);
  assert.equal(await deskRevoke({}, ['a@p.test']), null, 'no desk: nothing to do');
});

const { CamRelay, camAdmin, camRevoke } = await import('../src/cam.js');
function mkCams() {
  const objs = new Map();
  const obj = (id) => { let o = objs.get(id); if (!o) { const ctx = mkCtx(); o = { ctx, relay: new CamRelay(ctx, env) }; objs.set(id, o); } return o; };
  const env = { CAM: { idFromName: (n) => 'id:' + n, get: (id) => ({ fetch: (i, init) => obj(id).relay.fetch(i instanceof Request ? i : new Request(i, init)) }) } };
  return { env, of: (n) => obj('id:' + n) };
}
async function camJoin(C, who, exp, pilot = '', direct = false) {
  const u = new URL(ORIGIN + '/admin/api/cam/ws' + (pilot ? '?pilot=' + pilot : ''));
  const r = await camAdmin(up(u.href), u, C.env, who, direct, true, exp); assert.equal(r.status, 101); return r.webSocket.peer;
}
await test('A1 cam: the page keeps { who, exp } with its socket; past exp its next ack closes it (4401) and the link goes only to directors still signed in', async () => {
  const C = mkCams(), v = await camJoin(C, 'ops@p.test', sec(30_000), 'PAW0006'), d1 = await camJoin(C, 'd1@p.test', sec(30_000), '', true), d2 = await camJoin(C, 'd2@p.test', sec(3600_000), '', true);
  assert.deepEqual(v.att, { who: 'ops@p.test', exp: sec(30_000) }); assert.equal(v.texts()[0].t, 'hello');
  NOW += 31_000;
  await C.of('pilot:PAW0006').relay.webSocketMessage(v, JSON.stringify({ t: 'ack', cam: 0, seq: 1 }));
  assert.deepEqual(v.closed, { code: 4401, reason: 'Session expired' });
  d1.sent = []; d2.sent = [];
  const r = await C.of('cam').relay.fetch(new Request('https://cam/token', { method: 'POST', body: JSON.stringify({ who: 'd2@p.test' }) })), tok = (await r.json()).token;
  assert.equal(d1.closed.code, 4401); assert.equal(d1.sent.length, 0); assert.equal(d2.texts().find((m) => m.t === 'token').token, tok);
  const late = await camAdmin(up(ORIGIN + '/admin/api/cam/ws'), new URL(ORIGIN + '/admin/api/cam/ws'), C.env, 'x@p.test', false, true, sec(-5));
  assert.equal(late.webSocket.peer.closed.code, 4401);
});

await test('A1 cam: POST /revoke on Broadcast\'s object closes that email\'s sockets there, and on the pilots\' channels with a Polaris Cam on or watched lately (with no PC there too)', async () => {
  const C = mkCams(); C.of('cam').ctx.store.set('online', { PAW0031: { v: '1', mode: 'jpeg', cams: [], at: 1, seen: NOW } });
  const bc = await camJoin(C, 'ops@p.test', sec(3600_000)), pl = await camJoin(C, 'ops@p.test', sec(3600_000), 'PAW0006'), other = await camJoin(C, 'boss@p.test', sec(3600_000), 'PAW0006');
  const p12 = await camJoin(C, 'OPS@p.test', sec(3600_000), 'PAW0012'); await settle();
  assert.deepEqual(Object.keys(C.of('cam').ctx.store.get('watched')).sort(), ['PAW0006', 'PAW0012'], 'the channels watched, noted on Broadcast\'s object');
  const j = await camRevoke(C.env, ['ops@p.test'], null);
  assert.deepEqual(j, { ok: true, closed: 3 }); for (const w of [bc, pl, p12]) assert.equal(w.closed.code, 4403); assert.equal(other.closed, null);
  assert.equal(await camRevoke({}, ['x']), null);
  /* noted at most once an hour a channel, and kept a week */
  const at = C.of('cam').ctx.store.get('watched').PAW0006; NOW += 60_000; await camJoin(C, 'x@p.test', sec(3600_000), 'PAW0006'); await settle();
  assert.equal(C.of('cam').ctx.store.get('watched').PAW0006, at);
  NOW += 8 * 86400_000; C.of('cam').relay.watched = null; assert.deepEqual(clone(await C.of('cam').relay.watchList()), {}, 'a week on: forgotten');
});

await test('A1 roles: a person given another role or none, a role given other pages or permissions, or roles turned on closes the WebSockets concerned (desk and cam); a pilot ID or a name alone does not', async () => {
  const D = mkNs(), Cm = mkNs(), kv = mkKv({ [ROLES]: rolesOn({ ops: { name: 'Operations', pages: ['fw', 'bc'], can: ['live'] }, view: { name: 'Watch', pages: ['fw'], can: [] } }, { 'ops@p.test': { role: 'ops' }, 'v@p.test': { role: 'view' } }) });
  const env = ENV(kv, { DESK: D.ns, CAM: Cm.ns }), revs = () => [...D.calls, ...Cm.calls].filter((c) => c.url.endsWith('/revoke')).map((c) => JSON.parse(c.body));
  const post = async (body) => { const r = await admin(kv, 'boss@p.test', '/admin/api/roles', { method: 'POST', body, env }); assert.equal(r.status, 200, JSON.stringify(await r.clone().json())); };
  await post({ email: 'ops@p.test', role: 'view' });
  assert.deepEqual(revs(), [{ emails: ['ops@p.test'], keep: null }, { emails: ['ops@p.test'], keep: null }], 'the desk and Polaris Cam both told');
  D.calls.length = 0; Cm.calls.length = 0;
  await post({ email: 'ops@p.test', role: 'view', pilot: 'PAW0007' }); assert.deepEqual(revs(), [], 'only the pilot ID changed');
  await post({ op: 'role', id: 'view', name: 'Watchers', pages: ['fw'], can: [] }); assert.deepEqual(revs(), [], 'renamed only');
  await post({ op: 'role', id: 'view', name: 'Watchers', pages: ['fw', 'bc'], can: [] });
  assert.deepEqual(revs()[0].emails.sort(), ['ops@p.test', 'v@p.test'], 'its people');
  D.calls.length = 0; Cm.calls.length = 0;
  await post({ email: 'v@p.test', role: null }); assert.deepEqual(revs()[0], { emails: ['v@p.test'], keep: null });
  /* roles off: turning them on (the first person added) closes everyone else's */
  const kv2 = mkKv(), D2 = mkNs(), env2 = ENV(kv2, { DESK: D2.ns, CAM: mkNs().ns });
  assert.equal((await admin(kv2, 'boss@p.test', '/admin/api/roles', { method: 'POST', body: { email: 'ops@p.test', role: 'admin' }, env: env2 })).status, 200);
  assert.deepEqual(JSON.parse(D2.calls.find((c) => c.url.endsWith('/revoke')).body), { emails: [], keep: ['boss@p.test', 'ops@p.test'] });
  /* the desk or Polaris Cam not answering never stops the change */
  const kv3 = mkKv({ [ROLES]: rolesOn({}, { 'x@p.test': { role: 'admin' } }) }), bad = { idFromName: () => 'x', get: () => ({ fetch: async () => { throw new Error('object down'); } }) };
  assert.equal((await admin(kv3, 'boss@p.test', '/admin/api/roles', { method: 'POST', body: { email: 'x@p.test', role: null }, env: ENV(kv3, { DESK: bad, CAM: bad }) })).status, 200);
  assert.equal(kv3.json(ROLES).people['x@p.test'], undefined); assert.ok(warned.some((w) => /could not close a WebSocket/.test(w)));
});

await test('A1 mail.js: the desk\'s and the cameras\' WebSockets are opened with who and the sign-in\'s exp, and with the roles as KV has them now (not the 10-second copy)', async () => {
  NOW += 11_000;   /* the roles another test read (kept 10 s in this isolate) are not these */
  const D = mkNs(), Cm = mkNs(), kv = mkKv({ [ROLES]: rolesOn({ ops: { name: 'Operations', pages: ['bc', 'fw'], can: ['live'] } }, { 'ops@p.test': { role: 'ops' } }) }), env = ENV(kv, { DESK: D.ns, CAM: Cm.ns });
  assert.equal((await admin(kv, 'ops@p.test', '/admin/api/desk', { env })).status, 200);   /* the roles, read and kept 10 s */
  await admin(kv, 'ops@p.test', '/admin/api/desk/ws', { env, headers: { Upgrade: 'websocket' }, secs: 1200 });
  let u = new URL(D.calls.at(-1).url); assert.equal(u.pathname, '/ws'); assert.equal(u.searchParams.get('role'), 'dir'); assert.equal(u.searchParams.get('who'), 'ops@p.test'); assert.equal(+u.searchParams.get('exp'), sec(1200_000));
  /* another isolate took "direct" away a moment ago */
  kv.m.set(ROLES, JSON.stringify(rolesOn({ ops: { name: 'Operations', pages: ['bc', 'fw'], can: [] } }, { 'ops@p.test': { role: 'ops' } })));
  await admin(kv, 'ops@p.test', '/admin/api/desk/ws', { env, headers: { Upgrade: 'websocket' } });
  u = new URL(D.calls.at(-1).url); assert.equal(u.searchParams.get('role'), 'view', 'the WebSocket read the roles afresh');
  await admin(kv, 'ops@p.test', '/admin/api/cam/ws?pilot=PAW0006', { env, headers: { Upgrade: 'websocket' }, secs: 600 });
  u = new URL(Cm.calls.at(-1).url); assert.equal(u.searchParams.get('who'), 'ops@p.test'); assert.equal(+u.searchParams.get('exp'), sec(600_000)); assert.equal(u.searchParams.get('pilot'), 'PAW0006');
});

/* ================= A2. each change needs one of its pages ================= */
await test('A2 ACT_PAGES: every change but publishing tasks is tied to pages, and holds the page the role editor (RL_ACTS) ties it to', async () => {
  const m = ADMIN_HTML.match(/const RL_ACTS=(\[[\s\S]*?\]\]);/); assert.ok(m, 'RL_ACTS in admin.js');
  const RL = vm.runInNewContext(m[1]);
  for (const [k, , , pg] of RL) { if (k === 'tasks') { assert.equal(ACT_PAGES[k], undefined); continue; } assert.ok(ACT_PAGES[k] && ACT_PAGES[k].includes(pg), k + ' -> ' + pg); }
  assert.deepEqual(Object.keys(ACT_PAGES).sort(), ROLE_ACTS.filter((a) => a !== 'tasks').sort());
  assert.deepEqual(ACT_PAGES.live, ['bc', 'fw']); assert.deepEqual(ACT_PAGES.settings, ['settings', 'gates', 'comms']); assert.deepEqual(ACT_PAGES.delay, ['fw', 'reports']);
});

await test('A2 a role that may change something without seeing any of its pages may not change it (403), and /admin/api/me does not offer it; with a page, it may; administrators always', async () => {
  NOW += 11_000;   /* the roles another test read (kept 10 s in this isolate) are not these */
  const D = mkNs();
  const kv = mkKv({ [ROLES]: rolesOn({
    blind: { name: 'Blind', pages: ['pilots'], can: ['msg', 'cal', 'live', 'settings', 'gates', 'delay', 'docs', 'navdata', 'pilots', 'tasks'] },
    fw: { name: 'Watch', pages: ['fw'], can: ['msg', 'live', 'gates', 'delay', 'cal'] },
    gp: { name: 'Gates', pages: ['gates'], can: ['settings'] },
    cm: { name: 'Messages', pages: ['comms'], can: ['msg', 'settings'] } }, { 'blind@p.test': { role: 'blind' }, 'fw@p.test': { role: 'fw' }, 'gp@p.test': { role: 'gp' }, 'cm@p.test': { role: 'cm' } }) });
  const env = ENV(kv, { DESK: D.ns, CAM: mkNs().ns });
  const me = async (e) => (await (await admin(kv, e, '/admin/api/me', { env })).json()).can;
  assert.deepEqual(await me('blind@p.test'), ['pilots', 'tasks']);
  assert.deepEqual(await me('fw@p.test'), ['msg', 'gates', 'delay', 'live']);
  assert.deepEqual(await me('gp@p.test'), ['settings']);
  const aoc = await admin(kv, 'blind@p.test', '/admin/api/aoc', { method: 'POST', body: { title: 'X', body: 'Y', to: null }, env });
  assert.equal(aoc.status, 403); assert.match((await aoc.json()).error, /cannot send messages/);
  assert.equal((await admin(kv, 'blind@p.test', '/admin/api/cal', { method: 'POST', body: {}, env })).status, 403);
  assert.equal((await admin(kv, 'fw@p.test', '/admin/api/cal', { method: 'POST', body: {}, env })).status, 403, 'cal wants Calendar');
  assert.equal((await admin(kv, 'blind@p.test', '/admin/api/ooo/reason', { method: 'POST', body: {}, env })).status, 403);
  /* "live" with Flight Watch: the pilots' camera links, never Broadcast's own desk */
  const desk = await admin(kv, 'fw@p.test', '/admin/api/desk', { method: 'POST', body: { op: 'cfg', cfg: {} }, env });
  assert.equal(desk.status, 403); assert.equal(D.calls.length, 0, 'the desk was never asked');
  /* settings with Gates: the gate plan's switches */
  const gpr = await admin(kv, 'gp@p.test', '/admin/api/settings', { method: 'POST', body: { froms: ['Ops'], tpl: [] }, env }); assert.equal(gpr.status, 200);
  /* settings with Messages: the From names and AOC templates, edited on Messages (#cmSet) */
  assert.deepEqual(await me('cm@p.test'), ['msg', 'settings']);
  assert.equal((await admin(kv, 'cm@p.test', '/admin/api/settings', { env })).status, 200);
  const cmr = await admin(kv, 'cm@p.test', '/admin/api/settings', { method: 'POST', body: { froms: ['Crew Management', 'Training'], tpl: [{ title: 'Crew message', body: '' }] }, env });
  assert.equal(cmr.status, 200); assert.deepEqual(kv.json('admin:v1:settings').froms, ['Crew Management', 'Training']);
  { const i = ADMIN_HTML.indexOf('<main id="comms"'), j = ADMIN_HTML.indexOf('</main>', i); assert.ok(i > 0 && j > i); assert.match(ADMIN_HTML.slice(i, j), /id="setSave"/, 'the editor is on Messages'); }
  assert.equal((await admin(kv, 'boss@p.test', '/admin/api/desk', { method: 'POST', body: { op: 'cfg', cfg: {} }, env })).status, 200, 'an administrator directs');
});

/* ================= A3, A4. the page: "$" in what is put in it, and its CSP ================= */
await test('A3 "$&", "$\'" and "$`" in an email or a role\'s name are put in the page as they are (never ADMIN_HTML spliced in)', async () => {
  NOW += 11_000;   /* the roles another test read (kept 10 s in this isolate) are not these */
  const n = (s, x) => s.split(x).length - 1, ends = n(ADMIN_HTML, '</html>');
  const kv = mkKv({ [ROLES]: rolesOn({ r: { name: "Ops $' $& $` team", pages: ['fw'], can: [] } }, { 'n@p.test': { role: 'r' } }) });
  const ok = await admin(kv, 'n@p.test', '/admin'); assert.equal(ok.status, 200);
  const h = await ok.text(); assert.equal(n(h, '</html>'), ends); assert.ok(h.includes('"roleName":"Ops $\' $& $` team"'), 'the name as it is');
  assert.ok(h.length < ADMIN_HTML.length + 4000);
  const deny = await admin(kv, "x$'y$`z@p.test", '/admin'); assert.equal(deny.status, 403);
  const d = await deny.text(); assert.equal(n(d, '</html>'), ends); assert.ok(d.includes("x$'y$`z@p.test")); assert.ok(d.length < ADMIN_HTML.length + 1000);
  const src = readFileSync(new URL('../src/mail.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\.replace\('<!--(DENIED|PERM)-->', '/, 'every splice is a replacement function');
});

await test('A4 /admin\'s Content-Security-Policy: frame-ancestors as before, and object-src \'none\'; base-uri \'none\'; form-action \'self\' (the deny pages too); no script limits that would stop pdf.js', async () => {
  NOW += 11_000;   /* the roles another test read (kept 10 s in this isolate) are not these */
  const kv = mkKv(), r = await admin(kv, 'boss@p.test', '/admin'), csp = r.headers.get('Content-Security-Policy');
  assert.equal(csp, "frame-ancestors 'self' https://koz8738.com https://www.koz8738.com; object-src 'none'; base-uri 'none'; form-action 'self'");
  assert.doesNotMatch(csp, /script-src|default-src/);
  const kv2 = mkKv({ [ROLES]: rolesOn({}, {}) }); assert.equal((await admin(kv2, 'nobody@p.test', '/admin')).headers.get('Content-Security-Policy'), csp);
  assert.doesNotMatch(ADMIN_HTML, /<(form|object|embed|base)\b/i, 'nothing on the page the new rules would stop');
});

/* ================= A5. storage stays bounded ================= */
const MIDX = 'mail:v1:index';
const mail = (i, att = 0) => ({ id: 'm' + i, t: NOW - (i + 1) * 60_000, sendAt: NOW - (i + 1) * 60_000, from: 'Ops', subject: 'S' + i, body: 'b', att: Array.from({ length: att }, (_, n) => ({ name: n + '.pdf', type: 'application/pdf', size: 3 })), to: null, by: 'x' });
await test('A5 mail: past 300, the mails let go take their attachments with them (a KV error on one never fails the save)', async () => {
  NOW += 11_000;   /* the roles another test read (kept 10 s in this isolate) are not these */
  const L = Array.from({ length: 300 }, (_, i) => mail(i, i >= 298 ? 2 : 0)), kv = mkKv({ [MIDX]: L });
  for (const i of [298, 299]) for (const n of [0, 1]) kv.m.set('mail:v1:att:m' + i + ':' + n, 'pdf');
  kv.fail.add('mail:v1:att:m298:1:del');
  const r1 = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: { from: 'Ops', subject: 'New 1', body: 'x' } });
  assert.equal(r1.status, 200); assert.equal(kv.json(MIDX).length, 300); assert.equal(kv.json(MIDX).some((m) => m.id === 'm299'), false);
  assert.deepEqual(kv.dels.filter((k) => k.startsWith('mail:v1:att:')), ['mail:v1:att:m299:0', 'mail:v1:att:m299:1']);
  const r2 = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: { from: 'Ops', subject: 'New 2', body: 'x' } });
  assert.equal(r2.status, 200, 'a delete that fails is only skipped'); assert.ok(kv.dels.includes('mail:v1:att:m298:0')); assert.ok(kv.m.has('mail:v1:att:m298:1'));
  assert.equal(kv.json(MIDX).some((m) => m.id === 'm298'), false);
});

await test('A5 mail: a KV location that still answers with the index from before the last write: saves keep each other, an edit is read back edited, a delete stays deleted', async () => {
  NOW += 11_000;   /* the roles another test read (kept 10 s in this isolate) are not these */
  const kv = mkKv({ [MIDX]: [] }); kv.stale.add(MIDX);
  const save = async (b) => { const r = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: { from: 'Ops', body: 'x', ...b } }); assert.equal(r.status, 200); return (await r.json()).mail; };
  const a = await save({ subject: 'A' }); NOW += 1000; const b = await save({ subject: 'B' }); NOW += 1000; const c = await save({ subject: 'C' });
  assert.deepEqual(kv.json(MIDX).map((m) => m.subject), ['C', 'B', 'A']);
  NOW += 1000; await save({ id: b.id, subject: 'B edited' });
  const list = async () => (await (await admin(kv, 'boss@p.test', '/admin/api/mail')).json()).mails.map((m) => m.subject);
  assert.deepEqual(await list(), ['B edited', 'C', 'A'], 'newest first, as kept (the edit is sent again now)');
  assert.equal((await admin(kv, 'boss@p.test', '/admin/api/mail?id=' + a.id, { method: 'DELETE' })).status, 200);
  NOW += 1000; await save({ subject: 'D' });
  /* (an edit without a send time is sent again now: B edited is newer than C) */
  assert.deepEqual(kv.json(MIDX).map((m) => m.subject), ['D', 'B edited', 'C']); assert.deepEqual(await list(), ['D', 'B edited', 'C']);
  /* two minutes on, what KV says is what is read */
  NOW += 121_000; kv.stale.clear(); assert.deepEqual(await list(), ['D', 'B edited', 'C']); void c;
});

await test('A5 mail: from a KV location a write behind, a mail just sent is first in what pilots read (never past their first 100)', async () => {
  NOW += 11_000;
  const old = Array.from({ length: 150 }, (_, i) => mail(i)), kv = mkKv({ [MIDX]: old }); kv.stale.add(MIDX);
  const r = await admin(kv, 'boss@p.test', '/admin/api/mail', { method: 'POST', body: { from: 'Ops', subject: 'Just sent', body: 'x' } }); assert.equal(r.status, 200);
  assert.equal(kv.json(MIDX)[0].subject, 'Just sent');
  const p = await mailPublic(new Request(ORIGIN + '/api/efb/mail'), ENV(kv), {}, { u: 'PAW0006', c: '1234567' }, async () => 'k'), j = await p.json();
  assert.equal(j.mails.length, 100); assert.equal(j.mails[0].subject, 'Just sent');
});

const { docsAdmin } = await import('../src/docs.js');
const DIDX = 'docs:v1:index';
const piece = (kv, id, v, size, ct = 'application/octet-stream') => { const req = new Request(ORIGIN + '/admin/api/docs/piece?id=' + id + '&v=' + v + '&i=0&size=' + size, { method: 'POST', headers: { 'Content-Type': ct }, body: new TextEncoder().encode('%PDF-1.7 x') }); return docsAdmin(req, new URL(req.url), '/admin/api/docs/piece', { STORE: kv }, 'boss@p.test', null); };
await test('A5 documents: an upload starting sweeps what was left half way a day ago, then counts the uploads still under way with the documents (700 MB), not its own earlier try', async () => {
  const kv = mkKv({ [DIDX]: [{ id: 'aaaaaaaa', title: 'Big', v: 1, n: 75, size: 600 * MB, t: 1 }] });
  const orphan = (k, s, t) => { kv.m.set(k, 'x'); kv.meta.set(k, { s, t }); };
  orphan('docs:v1:f:zzzzzzzz:1:0', 45 * MB, NOW - 3600_000); orphan('docs:v1:f:zzzzzzzz:1:1', 45 * MB, NOW - 3600_000);   /* under way */
  orphan('docs:v1:f:oldoldol:1:0', 50 * MB, NOW - 2 * 86400_000);                                                     /* left two days ago */
  const r = await piece(kv, 'newdoc01', 1, 20 * MB);
  assert.equal(r.status, 413); assert.match((await r.json()).error, /600 of 700 MB are used, and 90 MB by uploads not finished yet/);
  assert.ok(kv.dels.includes('docs:v1:f:oldoldol:1:0'), 'swept'); assert.ok(kv.m.has('docs:v1:f:zzzzzzzz:1:0'), 'one under way stays');
  assert.equal((await piece(kv, 'newdoc01', 1, 5 * MB)).status, 200, '600 + 90 + 5');
  assert.equal((await piece(kv, 'newdoc01', 1, 9 * MB)).status, 200, 'its own earlier piece is not counted');
  assert.equal((await piece(kv, 'other001', 1, 10 * MB)).status, 413, 'another upload counts this one');
});

const { calAdmin } = await import('../src/cal.js');
const CIDX = 'cal:v1:index';
const ent = (id, s, o = {}) => ({ id, title: 'T ' + id, type: 'event', s, e: s + 3600_000, allDay: false, rep: '', until: 0, loc: '', body: '', to: null, efb: true, remind: 0, t: 1, by: 'x', ...o });
const calPost = (kv, b) => { const req = new Request(ORIGIN + '/admin/api/cal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return calAdmin(req, new URL(req.url), '/admin/api/cal', { STORE: kv, CREW: mkCrew().ns }, 'boss@p.test', null); };
await test('A5 calendar: at 500 the oldest entry that is over makes way (one-off entries first); a weekly entry still repeating, though it started first, is kept', async () => {
  const L = [ent('weekly', NOW - 400 * 86400_000, { rep: 'weekly' }), ent('wk-over', NOW - 300 * 86400_000, { rep: 'weekly', until: NOW - 5 * 86400_000 }),
    ent('over1', NOW - 20 * 86400_000), ent('over2', NOW - 10 * 86400_000)];
  for (let i = 0; L.length < 500; i++) L.push(ent('f' + i, NOW + (i + 1) * 3600_000));
  const kv = mkKv({ [CIDX]: L });
  const r = await calPost(kv, { title: 'New', s: NOW + 86400_000 }); assert.equal(r.status, 200);
  let ids = kv.json(CIDX).map((v) => v.id); assert.equal(ids.length, 500);
  assert.ok(ids.includes('weekly'), 'still repeating: kept'); assert.ok(!ids.includes('over1'), 'the oldest that is over: gone'); assert.ok(ids.includes('over2') && ids.includes('wk-over'));
  await calPost(kv, { title: 'New 2', s: NOW + 86400_000 }); await calPost(kv, { title: 'New 3', s: NOW + 86400_000 });
  ids = kv.json(CIDX).map((v) => v.id); assert.ok(!ids.includes('over2') && !ids.includes('wk-over'), 'one-off first, then the weekly one that stopped'); assert.ok(ids.includes('weekly'));
  /* an edit never needs room */
  assert.equal((await calPost(kv, { id: 'f3', title: 'Edited', s: NOW + 7200_000 })).status, 200);
});
await test('A5 calendar: 500 entries all to come or repeating: a new one is refused (409) and nothing is dropped or written', async () => {
  const L = [ent('weekly', NOW - 400 * 86400_000, { rep: 'weekly' })]; for (let i = 0; L.length < 500; i++) L.push(ent('f' + i, NOW + (i + 1) * 3600_000));
  const kv = mkKv({ [CIDX]: L }), r = await calPost(kv, { title: 'One more', s: NOW + 86400_000 });
  assert.equal(r.status, 409); assert.match((await r.json()).error, /full/); assert.equal(kv.puts.length, 0); assert.equal(kv.json(CIDX).length, 500);
});

const { DatabaseSync } = await import('node:sqlite');
function mkSql() {
  const db = new DatabaseSync(':memory:');
  return { db, exec(q, ...b) { const st = db.prepare(q), rows = /^\s*(SELECT|WITH)\b/i.test(q) ? st.all(...b) : (st.run(...b), []); return { toArray: () => rows }; } };
}
const { Mailbox, ST_MAX } = await import('../src/pm.js');
await test('A5 pilot messages: at most 500 read and deleted marks a pilot (marks that matter least go first, deleted marks last); ids that are no message are not kept', async () => {
  assert.equal(ST_MAX, 500);
  const box = new Mailbox({ storage: { sql: mkSql() } }, {}), U = 'PAW0006';
  for (let i = 0; i < 600; i++) box.sql.exec("INSERT INTO msg (id, t, th, kind, tu, dept, subj, body) VALUES (?, ?, ?, 'reply', ?, 'Training', 's', 'b')", 'm' + i, 1000 + i, 'm' + i, U);
  for (let i = 0; i < 10; i++) box.sql.exec("INSERT INTO msg (id, t, th, kind, fu, dept, subj, body) VALUES (?, ?, ?, 'staff', ?, 'Training', 's', 'b')", 'own' + i, 5000 + i, 'own' + i, U);
  const n = (q = '') => box.one('SELECT COUNT(*) AS n FROM st WHERE who = ?' + q, U).n, has = (id) => !!box.one('SELECT id FROM st WHERE who = ? AND id = ?', U, id);
  box.call({ op: 'state', who: U, ids: Array.from({ length: 300 }, (_, i) => 'bogus' + i), set: { read: true } }); assert.equal(n(), 0, 'not messages: nothing kept');
  box.call({ op: 'state', who: U, ids: Array.from({ length: 100 }, (_, i) => 'm' + i), set: { del: true } });
  box.call({ op: 'state', who: U, ids: Array.from({ length: 10 }, (_, i) => 'own' + i), set: { read: true } });
  box.call({ op: 'state', who: U, ids: Array.from({ length: 300 }, (_, i) => 'm' + (100 + i)), set: { read: true } });
  assert.equal(n(), 410);
  box.call({ op: 'state', who: U, ids: Array.from({ length: 200 }, (_, i) => 'm' + (400 + i)), set: { read: true } });
  assert.equal(n(), 500); assert.equal(n(' AND del = 1'), 100, 'every deleted mark kept');
  /* 110 over: the pilot's own messages' 10 read marks first, then the 100 oldest other read marks */
  assert.equal(has('own0'), false, 'the pilot\'s own messages\' read marks went first'); assert.equal(has('own9'), false);
  assert.equal(has('m100'), false); assert.equal(has('m199'), false); assert.equal(has('m200'), true); assert.equal(has('m599'), true); assert.equal(has('m0'), true);
  assert.equal(box.list(U, '').msgs.some((m) => m.id === 'm5'), false, 'a deleted message stays deleted');
});

const { Taskboard, NOTES_MAX } = await import('../src/tasks.js');
await test('A5 tasks: a task keeps 100 notes at most; the 101st is refused (400) and nothing is written', async () => {
  assert.equal(NOTES_MAX, 100);
  const tb = new Taskboard({ storage: { sql: mkSql() } });
  tb.sql.exec("INSERT INTO task (id, t, at, by, title, dept) VALUES ('k1', 1, 1, 'boss@p.test', 'Task', 'ops')");
  for (let i = 0; i < 100; i++) assert.equal(tb.call({ op: 'note', id: 'k1', text: 'note ' + i, by: 'a@p.test' }).ok, true);
  assert.throws(() => tb.call({ op: 'note', id: 'k1', text: 'one more', by: 'a@p.test' }), (e) => e.status === 400 && /100 notes/.test(e.message));
  assert.equal(tb.one("SELECT COUNT(*) AS n FROM ev WHERE id = 'k1' AND k = 'note'").n, 100);
});

/* ================= A6. Content-Type anchored; errors without the insides ================= */
const { jpChartsAdmin } = await import('../src/jpcharts.js');
await test('A6 Content-Type: the desk wants application/json, the chart uploads application/pdf or octet-stream, a cover image/jpeg or octet-stream, each from the start of the header', async () => {
  const D = mkNs(), denv = { DESK: D.ns };
  const desk = (ct) => { const req = new Request(ORIGIN + '/admin/api/desk', { method: 'POST', headers: { 'Content-Type': ct }, body: '{"op":"cfg","cfg":{}}' }); return deskAdmin(req, new URL(req.url), denv, 'boss@p.test', true); };
  for (const ct of ['text/plain; application/json', 'application/jsonp', 'x-application/json']) assert.equal((await desk(ct)).status, 415, ct);
  assert.equal((await desk('Application/JSON; charset=utf-8')).status, 200);
  const R2 = { objs: new Map(), async put(k, v) { this.objs.set(k, v); }, async head() { return null; }, async get() { return null; }, async list() { return { objects: [], truncated: false }; }, async delete() {} };
  const jp = (ct) => { const path = '/admin/api/navdata/jpcharts/put', req = new Request(ORIGIN + path + '?apt=RJTT&eff=20261126&i=0', { method: 'POST', headers: { 'Content-Type': ct }, body: new TextEncoder().encode('%PDF-1.7 c') }); return jpChartsAdmin(req, path, { STORE: mkKv(), CHARTS: R2 }, 'boss@p.test'); };
  for (const ct of ['text/plain; application/pdf', 'x-application/pdf', 'application/pdfx', 'multipart/form-data; boundary=application/octet-stream']) assert.equal((await jp(ct)).status, 415, ct);
  assert.equal((await jp('application/pdf')).status, 200);
  const kv = mkKv({ [DIDX]: [{ id: 'd1', title: 'SOP', v: 1, n: 1, size: 9, cover: false, t: 1 }] });
  const cover = (ct) => { const req = new Request(ORIGIN + '/admin/api/docs/cover?id=d1&v=1', { method: 'POST', headers: { 'Content-Type': ct }, body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]) }); return docsAdmin(req, new URL(req.url), '/admin/api/docs/cover', { STORE: kv }, 'boss@p.test', null); };
  for (const ct of ['text/html; image/jpeg', 'image/jpegx', 'application/octet-streamy']) assert.equal((await cover(ct)).status, 415, ct);
  assert.equal((await cover('image/jpeg')).status, 200);
  assert.equal((await piece(mkKv(), 'abcdefgh', 1, 10, 'text/plain; application/octet-stream')).status, 415);
});

await test('A6 errors: an upstream failure says its first line only (no stack); an unexpected error says so in plain words, never the internal message', async () => {
  const kv = mkKv(), boom = () => { const e = new Error('upstream exploded\n    at secretFn (internal.js:1:1)'); throw e; };
  const r = await admin(kv, 'boss@p.test', '/admin/api/live', { opts: { live: boom } });
  assert.equal(r.status, 502); assert.equal((await r.json()).error, 'Live flights are not available right now: upstream exploded');
  kv.fail.add('admin:v1:settings'); warned.length = 0;
  const s = await admin(kv, 'boss@p.test', '/admin/api/settings'), j = await s.json();
  assert.equal(s.status, 500); assert.equal(j.error, 'Something went wrong on the server. Please try again.'); assert.doesNotMatch(JSON.stringify(j), /KV GET failed/);
  assert.ok(warned.some((w) => /KV GET failed/.test(w)), 'logged for staff who read the logs');
  const k2 = mkKv({ [DIDX]: 'not json' }), dr = await docsAdmin(new Request(ORIGIN + '/admin/api/docs'), new URL(ORIGIN + '/admin/api/docs'), '/admin/api/docs', { STORE: k2 }, 'boss@p.test', null);
  assert.equal(dr.status, 500); assert.equal((await dr.json()).error, 'Something went wrong on the server. Please try again.');
});

/* ================= the admin page, parts of it run in a stand-in context ================= */
const slice = (a, b, what) => { const i = ADMIN_HTML.indexOf(a), j = ADMIN_HTML.indexOf(b, i + a.length); assert.ok(i > 0 && j > i, what || a); return ADMIN_HTML.slice(i, j); };
function run(src, names, g = {}) {
  const timers = [];
  const ctx = { console, Date, Promise, Map, Set, JSON, Math, Object, Array, String, Number, Error, encodeURIComponent,
    setTimeout: (f, ms) => { timers.push({ f, ms, id: timers.length + 1 }); return timers.length; }, clearTimeout: (id) => { const t = timers.find((x) => x.id === id); if (t) t.gone = true; },
    setInterval: () => 0, clearInterval() {}, requestAnimationFrame: (f) => { f(0); return 1; }, esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), ...g };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(src + '\n;globalThis.__x={' + names + '};', ctx);
  return { ctx, x: ctx.__x, timers, fire: () => { const L = timers.filter((t) => !t.gone && !t.done); for (const t of L) { t.done = true; t.f(); } return L.length; } };
}
/* answers held until the test gives them */
function held() { const calls = []; const api = (u, o) => new Promise((res, rej) => calls.push({ u, o, body: o && o.body ? JSON.parse(o.body) : null, res, rej })); return { calls, api }; }

await test('B8 opsGet: a forced refresh after a write (opsDrop) never takes a request that set out before it; a slow old answer never puts back what was there', async () => {
  const H = held(), { x } = run(slice('const OPS_PG=', '/* ACCEPT (Nov 2026)'), 'OPS,opsGet,opsDrop,opsV', { api: H.api, pgHas: () => true });
  const p1 = x.opsGet('aoc'); assert.equal(H.calls.length, 1);
  assert.equal(x.opsGet('aoc'), p1, 'an ordinary read joins the one on its way'); assert.equal(x.opsGet('aoc', 0), p1, 'a forced one too, while nothing was written since');
  x.opsDrop('aoc');                                              /* a write went through */
  const p2 = x.opsGet('aoc', 0); assert.equal(H.calls.length, 2, 'after the write: asked again'); assert.notEqual(p2, p1);
  assert.equal(x.opsGet('aoc', 0), p2, 'a second forced refresh joins the one from after the write');
  const NEW = { msgs: ['after'] }, OLD = { msgs: ['before'] };
  H.calls[1].res(NEW); assert.equal(await p2, NEW);
  H.calls[0].res(OLD); assert.equal(await p1, NEW, 'the old request answers with what is current');
  assert.equal(x.opsV('aoc'), NEW, 'and did not overwrite it');
  assert.equal(await x.opsGet('aoc'), NEW); assert.equal(H.calls.length, 2, 'fresh: from the copy');
  /* the old request failing later never marks the new data as failed */
  x.opsDrop('aoc'); const p3 = x.opsGet('aoc', 0); x.opsDrop('aoc'); const p4 = x.opsGet('aoc', 0); assert.equal(H.calls.length, 4);
  H.calls[3].res({ msgs: ['newest'] }); await p4; H.calls[2].rej(new Error('late failure')); await p3;
  assert.equal(x.OPS.aoc.err, ''); assert.deepEqual(x.opsV('aoc'), { msgs: ['newest'] });
});

await test('B13 api(): a request with no answer in its time (45 s, or opt.timeout) is stopped and throws { status: 0, timeout }; a quick one is as before', async () => {
  const src = slice('const api=async', '\nconst say='), seen = [];
  const g = { AbortController, setTimeout, clearTimeout, fetch: (u, o) => { seen.push(o); return new Promise((res, rej) => { if (u === '/quick') res(new Response('{"ok":1}', { status: 200 })); o.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); }); } };
  vm.createContext(g); vm.runInContext(src + '\n;globalThis.__api=api;', g);
  const t0 = realNow();
  await assert.rejects(g.__api('/slow', { method: 'POST', timeout: 60 }), (e) => e.timeout === true && e.status === 0 && /No answer from the server/.test(e.message));
  assert.ok(realNow() - t0 < 2000); assert.equal('timeout' in seen[0], false, 'not passed on to fetch'); assert.equal(seen[0].credentials, 'same-origin'); assert.equal(seen[0].method, 'POST');
  assert.deepEqual(clone(await g.__api('/quick')), { ok: 1 });
  assert.match(src, /\+o\.timeout\|\|45000/, 'the default: 45 s');
  for (const re of [/api\("\/admin\/api\/mail\/att",\{[^}]*\},body:f\.file,timeout:120000\}/, /api\("\/admin\/api\/navdata\/check",\{method:"POST",headers:\{"Content-Type":"application\/json"\},body:JSON\.stringify\(body\),timeout:120000\}\)/, /const ndPost=\(u,b\)=>api\(u,\{method:"POST",headers:\{"Content-Type":"application\/json"\},body:JSON\.stringify\(b\),timeout:120000\}\)/,
    /fetch\("\/admin\/api\/navdata\/jpcharts\/put\?[^)]*signal:ndTmo\(120000\)\}/, /fetch\("\/admin\/api\/navdata\/cncharts\/put\?[^)]*signal:ndTmo\(120000\)\}/]) assert.match(ADMIN_HTML, re);
});

await test('B13 dcPut: a document piece gets 2 minutes (XHR timeout), then fails with a clear message rather than waiting for ever', async () => {
  let X = null;
  class XHR { constructor() { X = this; this.upload = {}; this.h = {}; } open(m, u) { this.m = m; this.u = u; } setRequestHeader(k, v) { this.h[k] = v; } send(b) { this.b = b; } }
  const { x } = run(slice('/* one piece, with upload progress */', '$("#dcFile").addEventListener'), 'dcPut', { XMLHttpRequest: XHR });
  const p = x.dcPut('/admin/api/docs/piece?id=x', 'blob', () => {});
  assert.equal(X.timeout, 120000); assert.equal(X.h['Content-Type'], 'application/octet-stream'); X.ontimeout();
  await assert.rejects(p, /more than 2 minutes/);
});

await test('B13 beforeunload: a document being uploaded, or a Nav Data upload under way, asks before the page is left', async () => {
  const m = ADMIN_HTML.match(/\/\* \(P2\) leaving the page while a document[^\n]*\n(window\.addEventListener\("beforeunload"[^\n]*)/); assert.ok(m);
  const L = [], DC = { busy: false }, ND = { up: { cn: { busy: false }, jp: { busy: false } } };
  run(m[1], 'x:1', { addEventListener: (t, f) => { if (t === 'beforeunload') L.push(f); }, DC, ND });
  const ev = () => { const e = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } }; L[0](e); return e.prevented; };
  assert.equal(ev(), false); DC.busy = true; assert.equal(ev(), true); DC.busy = false; ND.up.jp.busy = true; assert.equal(ev(), true);
});

const camHelpers = () => slice('/* VideoDecoder.isConfigSupported, asked once a codec string', '/* a pilot ID as Polaris Cam');
function mkDoc() {
  const body = { kids: [], appendChild(el) { this.kids.push(el); } };
  const el = () => ({ attrs: {}, _h: '', btn: null, setAttribute(k, v) { this.attrs[k] = v; }, set innerHTML(h) { this._h = h; this.btn = /data-wsreload/.test(h) ? { L: {}, addEventListener(t, f) { this.L[t] = f; } } : null; }, get innerHTML() { return this._h; },
    querySelector(s) { return s === '[data-wsreload]' ? this.btn : null; }, remove() { body.kids = body.kids.filter((k) => k !== this); } });
  return { body, createElement: el, getElementById: (id) => body.kids.find((k) => k.id === id) || null, querySelector: () => null, hidden: false };
}
await test('B10 reconnecting: 3 s, 6, 12, 24, then 30 at most (a little sooner at random, never later); hello starts again from 3 s', async () => {
  const { x, ctx } = run(camHelpers(), 'wsBack,wsRetry,wsOk', { document: mkDoc(), api: async () => ({}) });
  for (let n = 0; n < 9; n++) { const top = Math.min(30000, 3000 * 2 ** n); for (let k = 0; k < 40; k++) { const d = x.wsBack(n); assert.ok(d <= top && d >= top * 0.75, n + ': ' + d); } }
  vm.runInContext('Math.random=()=>0.999999', ctx); assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(x.wsBack), [3000, 6000, 12000, 24000, 30000, 30000, 30000]);
  const X = {}; assert.deepEqual([x.wsRetry(X), x.wsRetry(X), x.wsRetry(X), x.wsRetry(X)], [3000, 6000, 12000, 24000]);
  x.wsOk(X); assert.equal(X.fails, 0); assert.equal(x.wsRetry(X), 3000);
});

await test('B10 after three drops in a row (or a close for a sign-in that ran out, 4401), /admin/api/me is asked: signed out, the page says so with Reload; offline or a server error, it says that; hello takes the notice away', async () => {
  const doc = mkDoc(), asked = []; let answer = () => Promise.reject(new TypeError('Failed to fetch'));
  const nav = { onLine: true }, { x } = run(camHelpers(), 'wsRetry,wsOk,wsNote', { document: doc, navigator: nav, location: { reload() { asked.push('reload'); } }, api: (u, o) => { asked.push([u, o.timeout]); return answer(); } });
  const X = {}; x.wsRetry(X); x.wsRetry(X); assert.equal(asked.length, 0, 'two drops: not yet');
  x.wsRetry(X); await settle(); assert.deepEqual(asked, [['/admin/api/me', 15000]]);
  const note = doc.getElementById('wsAuth'); assert.ok(note); assert.match(note.innerHTML, /sign-in has probably run out/); assert.equal(note.attrs.role, 'alert');
  note.btn.L.click(); assert.equal(asked.at(-1), 'reload');
  x.wsRetry(X); await settle(); assert.equal(asked.filter((a) => Array.isArray(a)).length, 1, 'asked at most every 20 s');
  x.wsOk(X); assert.equal(doc.getElementById('wsAuth'), null, 'connected again: the notice goes');
  NOW += 21_000; x.wsRetry({}, { code: 4401 }); await settle(); assert.equal(asked.filter((a) => Array.isArray(a)).length, 2, '4401: at once'); assert.ok(doc.getElementById('wsAuth'));
  NOW += 21_000; nav.onLine = false; x.wsRetry({}, { code: 4401 }); await settle(); assert.match(doc.getElementById('wsAuth').innerHTML, /You are offline/); nav.onLine = true;
  NOW += 21_000; answer = () => Promise.reject(Object.assign(new Error('Roles are temporarily unavailable'), { status: 503 })); x.wsRetry({}, { code: 4401 }); await settle();
  assert.match(doc.getElementById('wsAuth').innerHTML, /cannot connect right now/); assert.equal(doc.getElementById('wsAuth').btn, null);
  NOW += 21_000; answer = () => Promise.resolve({ email: 'boss@p.test' }); x.wsRetry({}, { code: 4401 }); await settle(); assert.equal(doc.getElementById('wsAuth'), null, 'still signed in: no notice');
  NOW += 21_000; answer = () => Promise.resolve(null); x.wsRetry({}, { code: 4401 }); await settle(); assert.match(doc.getElementById('wsAuth').innerHTML, /sign-in has probably run out/, 'a sign-in page (not JSON) is not signed in');
});

await test('B10 Broadcast\'s desk: when its connection drops, every command still waiting is told { ok: false, "Disconnected: check whether it happened" } and forgotten; it reconnects after wsRetry\'s delay', async () => {
  const socks = [], delays = [], codes = [];
  class WS { constructor(u) { this.url = u; socks.push(this); } send() {} close() {} }
  const BC = { ws: null, want: true, cb: {}, retry: 0, conn: false, role: 'dir' }, said = [];
  const R = run(slice('/* the desk, live */', 'function bcIn(j){'), 'bcOpen,bcCbDrop', { BC, WebSocket: WS, location: { protocol: 'https:', host: 'efb-api.example' }, document: { querySelector: () => null }, bcAll() {}, bcIn() {},
    wsRetry: (X, e) => { codes.push(e && e.code); return 4321; } });
  R.ctx.setTimeout = (f, ms) => { delays.push(ms); return 1; };
  R.x.bcOpen(); const w = socks[0]; assert.match(w.url, /^wss:\/\/efb-api\.example\/admin\/api\/desk\/ws$/);
  BC.cb.c1 = (j) => said.push(['c1', j]); BC.cb.c2 = (j) => said.push(['c2', j]);
  w.onclose({ code: 1006 });
  assert.deepEqual(clone(said), [['c1', { t: 'ack', id: 'c1', ok: false, err: 'Disconnected: check whether it happened' }], ['c2', { t: 'ack', id: 'c2', ok: false, err: 'Disconnected: check whether it happened' }]]);
  assert.deepEqual(Object.keys(BC.cb), []); assert.equal(BC.ws, null); assert.deepEqual(delays, [4321]); assert.deepEqual(codes, [1006]);
  for (const [re, what] of [[/BC\.retry=setTimeout\(bcOpen,wsRetry\(BC,e\)\)/, 'the desk'], [/V\.retry=setTimeout\(V\.open,wsRetry\(V,e\)\)/, 'the cameras'], [/case "hello":wsOk\(BC\);/, 'desk hello'], [/case "hello":wsOk\(V\);/, 'camera hello']]) assert.match(ADMIN_HTML, re, what);
  assert.doesNotMatch(ADMIN_HTML, /setTimeout\((bcOpen|V\.open),3000\)/, 'no fixed 3 s any more');
});

/* the players: H.264 key frames (an SPS of High 3.1) to a stand-in WebCodecs */
const camSrc = () => slice('/* CAM_DQ: frames the decoder', "/* Broadcast's grid, shared by its two players");
const h264 = (seq, key = true) => { const pl = Uint8Array.of(0, 0, 0, 1, 0x67, 0x64, 0x00, 0x1f, 0xac, 0, 0, 0, 1, key ? 0x65 : 0x41, 0x88), b = new Uint8Array(16 + pl.length), d = new DataView(b.buffer);
  b[0] = 0x50; b[1] = 1; b[2] = 0; b[3] = 2; b[4] = key ? 1 : 0; d.setUint16(6, 960, true); d.setUint16(8, 540, true); d.setUint16(10, 33, true); d.setUint32(12, seq, true); b.set(pl, 16); return b.buffer; };
function mkPlayer(VideoDecoder) {
  class EncodedVideoChunk { constructor(o) { Object.assign(this, o); } }
  const R = run(camSrc() + '\nconst V=mkCamView({grid:"#g",url:()=>"/x"});', 'V,CAM_SUP,camSup', { VideoDecoder, EncodedVideoChunk, $: () => null, document: { querySelector: () => null, hidden: false }, performance: { now: () => 0 }, location: { protocol: 'https:', host: 'x' }, CAM_VIEWS: [], navigator: {} });
  return R.x;
}
await test('B11 cameras: VideoDecoder.isConfigSupported is asked once a codec string; "no" is said on the camera and no decoder is made, however many key frames come', async () => {
  let asked = 0, made = 0;
  class VD { constructor() { made++; this.state = 'unconfigured'; this.decodeQueueSize = 0; } configure() { this.state = 'configured'; } decode() {} close() { this.state = 'closed'; } }
  VD.isConfigSupported = async (c) => { asked++; assert.equal(c.codec, 'avc1.64001f'); return { supported: false, config: c }; };
  const { V, CAM_SUP } = mkPlayer(VD), c = V.c[0];
  V.frame(h264(1)); assert.equal(made, 0, 'still asking: nothing made'); await settle(); assert.equal(asked, 1);
  assert.equal(CAM_SUP.get('avc1.64001f'), false);
  for (let i = 2; i < 12; i++) V.frame(h264(i));
  assert.equal(made, 0); assert.equal(asked, 1, 'asked once'); assert.equal(c.unsup, 'avc1.64001f');
  assert.match(slice('V.caps=()=>{', 'el.classList.toggle("z"'), /This browser cannot play this camera’s H\.264/);
});

await test('B11 cameras: a decoder that keeps failing (no picture between) is tried again after 2 s, 4, 8 … 30 s, not once a second; the first failure, or one only behind, at once; a picture resets it', async () => {
  let made = 0, mode = 'throw';
  class VD { constructor({ output }) { made++; this.output = output; this.state = 'unconfigured'; this.decodeQueueSize = 0; } configure() { this.state = 'configured'; }
    decode(ch) { if (mode === 'throw') throw new Error('unsupported profile'); this.output({ timestamp: ch.timestamp, displayWidth: 960, displayHeight: 540, close() {} }); } close() { this.state = 'closed'; } }
  const { V } = mkPlayer(VD), c = V.c[0];
  let seq = 0; const key = () => V.frame(h264(++seq));
  key(); assert.equal(made, 1); assert.equal(c.errN, 1); assert.equal(c.retryAt, 0, 'the first: at once');
  key(); assert.equal(made, 2); assert.equal(c.errN, 2); assert.equal(c.retryAt, NOW + 2000);
  key(); key(); assert.equal(made, 2, 'waiting: no decoder made');
  const waits = [];
  for (let i = 0; i < 6; i++) { NOW = c.retryAt + 1; key(); waits.push(c.retryAt - NOW); }
  assert.deepEqual(waits, [4000, 8000, 16000, 30000, 30000, 30000]); assert.equal(made, 8);
  mode = 'ok'; NOW = c.retryAt + 1; key(); assert.equal(c.errN, 0, 'a picture: counted from nothing again'); assert.equal(c.retryAt, 0);
  assert.match(camSrc(), /catch\(e\)\{V\.decErr\(i,!!e&&e\.message==="behind"\)\}/, 'only behind is not counted');
});

await test('B12 the auto director: a rule changed shows at once, and goes to the desk one change after another, each with all those before it (rapid × and + Add never undo each other); one refused puts back the desk\'s rules', async () => {
  const posts = [], draws = [];
  const BC = { cfg: { auto: { rules: { cruise: ['Wing'] } } } };
  const bcCfg = (cfg) => new Promise((r) => posts.push({ rules: clone(cfg.auto.rules), r }));
  const { x } = run(slice('/* (P2, Nov 2026) a rule changed shows at once', 'document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("#bc button'), 'bcRules', { BC, bcCfg, bcAuto: () => draws.push(clone(BC.cfg.auto.rules)) });
  /* three clicks in a row: shown at once, and sent as one (each change carries those before it) */
  const a = x.bcRules('climb', (L) => L.concat(['Cockpit'])), b = x.bcRules('climb', (L) => L.concat(['Cabin'])), c = x.bcRules('cruise', (L) => L.filter((s) => s !== 'Wing'));
  assert.deepEqual(clone(BC.cfg.auto.rules), { climb: ['Cockpit', 'Cabin'] }); assert.equal(draws.length, 3);
  await settle(); assert.equal(posts.length, 1); assert.deepEqual(posts[0].rules, { climb: ['Cockpit', 'Cabin'] });
  /* another while that one is on its way: shown, and sent after it, with it */
  const d = x.bcRules('taxi', (L) => L.concat(['Gear'])); assert.deepEqual(clone(BC.cfg.auto.rules), { climb: ['Cockpit', 'Cabin'], taxi: ['Gear'] });
  await settle(); assert.equal(posts.length, 1, 'one at a time');
  BC.cfg = { auto: { rules: { climb: ['Cockpit', 'Cabin'] } } };   /* bcPost puts in the desk's answer (without the one on its way) */
  posts[0].r(true); await settle();
  assert.equal(posts.length, 2); assert.deepEqual(posts[1].rules, { climb: ['Cockpit', 'Cabin'], taxi: ['Gear'] }); assert.deepEqual(clone(BC.cfg.auto.rules), posts[1].rules, 'still shown as it will be');
  posts[1].r(true); assert.deepEqual([await a, await b, await c, await d], [true, true, true, true]); assert.equal(BC.rw, null);
  /* refused: back to what the desk has */
  const e = x.bcRules('taxi', () => []); assert.deepEqual(clone(BC.cfg.auto.rules), { climb: ['Cockpit', 'Cabin'] }); await settle(); posts[2].r(false); assert.equal(await e, false);
  assert.deepEqual(clone(BC.cfg.auto.rules), { climb: ['Cockpit', 'Cabin'], taxi: ['Gear'] });
  /* a save that went through, then a later one refused: back to the rules of the save that went through, not older */
  const f = x.bcRules('landing', (L) => L.concat(['Wing'])); await settle();
  const g = x.bcRules('landing', (L) => L.concat(['Cabin'])); posts[3].r(true); await settle();
  assert.deepEqual(posts[4].rules, { climb: ['Cockpit', 'Cabin'], taxi: ['Gear'], landing: ['Wing', 'Cabin'] }); posts[4].r(false);
  assert.equal(await f, true); assert.equal(await g, false);
  assert.deepEqual(clone(BC.cfg.auto.rules), { climb: ['Cockpit', 'Cabin'], taxi: ['Gear'], landing: ['Wing'] });
  assert.match(ADMIN_HTML, /case "cfg":BC\.cfg=j\.cfg;if\(BC\.rw&&BC\.cfg&&BC\.cfg\.auto\)BC\.cfg\.auto\.rules=BC\.rw;/, 'a cfg from the desk keeps the rules on their way');
});

/* ---- 7. the latest answer wins ---- */
await test('B7 stLoad: an answer that set out before a later load, or before a save, is dropped (the plan just saved never goes back)', async () => {
  const H = held(), ST = { dirty: false, plan: null, sel: 'KSFO', ready: true, log: [] }, OPS = {};
  const { x } = run(slice('/* (P2) ST.lq', 'const stDirty='), 'stLoad', { ST, OPS, api: H.api, pgHas: () => true, pgNow: 'gates', stClone: clone, stStateUi() {}, auUi() {}, stAptsUi() {}, stMainUi() {}, stMap() {}, stBusy() {}, stMapRefresh() {}, stLogUi() {} });
  const p1 = x.stLoad(), p2 = x.stLoad();
  H.calls[1].res({ log: ['new'], plan: { apts: { KSFO: [] } }, apts: {} }); await p2;
  H.calls[0].res({ log: ['old'], plan: { apts: {} }, apts: {} }); await p1;
  assert.deepEqual(ST.log, ['new']);
  const p3 = x.stLoad(); ST.lq++;   /* a save (as stSave does) */
  H.calls[2].res({ log: ['before the save'], plan: { apts: {} }, apts: {} }); await p3; assert.deepEqual(ST.log, ['new']);
  assert.match(slice('if(b.id==="stSave"){', 'catch(er){b.disabled=false;'), /ST\.lq=\(ST\.lq\|\|0\)\+1;try\{const j=await api\("\/admin\/api\/stands"[^;]*;ST\.lq\+\+;/);
});

await test('B7 tasks, inbox, the gate try-out, the automatic-message preview: only the latest answer is shown', async () => {
  /* tkLoad, with a change in between */
  let H = held(); const TK = { list: [] };
  let R = run(slice('/* (P2) TK.lq', 'function tkCount('), 'tkLoad', { TK, api: H.api, document: { querySelector: () => null }, tkCount() {}, tkUi() {}, hmUi() {}, pgNow: 'tasks' });
  const t1 = R.x.tkLoad(), t2 = R.x.tkLoad(); H.calls[1].res({ tasks: ['new'] }); await t2; H.calls[0].res({ tasks: ['old'] }); await t1; assert.deepEqual(TK.list, ['new']);
  /* ibLoad */
  H = held(); const IB = {}, sel = { options: { length: 2 } };
  R = run(slice('async function ibLoad(){', '$("#ibDept").addEventListener'), 'ibLoad', { IB, api: H.api, pgHas: () => true, $: () => sel, ibCount() {}, ibUi() {}, hmUi() {}, pgNow: 'comms' });
  const i1 = R.x.ibLoad(), i2 = R.x.ibLoad(); H.calls[1].res({ threads: ['new'], depts: [] }); await i2; H.calls[0].rej(new Error('late')); await i1;
  assert.deepEqual(IB.threads, ['new']); assert.equal(IB.err, '', 'a late failure does not show over the newer answer');
  /* stTry */
  H = held(); const ST = { sel: 'KSFO', plan: { apts: {} }, tryFl: 'all', tryAc: 'narrow', view: 'list' }, out = { innerHTML: '' };
  R = run(slice('let stTryT=0;function stTry(){', '/* ---- the gates sent ---- */'), 'stTry', { ST, api: H.api, $: () => out, stRules: () => [1], stTakenBefore: () => [], stMapRefresh() {} });
  R.x.stTry(); R.fire(); R.x.stTry(); R.fire(); assert.equal(H.calls.length, 2);
  H.calls[1].res({ stand: 'D2' }); await settle(); H.calls[0].res({ stand: 'D1' }); await settle();
  assert.equal(ST.tryRes.stand, 'D2'); assert.match(out.innerHTML, /D2/);
  /* auPrev */
  H = held(); const AT = { dirty: { gate: 1 }, ed: { gate: {} }, open: 'gate' }, el = { textContent: '', classList: { add() {}, remove() {} } };
  R = run(slice('function auPrev(k){', '/* on and off, and the arrival gate'), 'auPrev', { AT, api: H.api, $: () => el, auKind: () => ({}) });
  R.x.auPrev('gate'); R.fire(); R.x.auPrev('gate'); R.fire();
  H.calls[1].res({ title: 'T', body: 'newer' }); await settle(); H.calls[0].res({ title: 'T', body: 'older' }); await settle(); assert.equal(el.textContent, 'newer');
});

await test('B7 Flight Watch (admin-live): each poll is numbered and only the latest answer is shown, in live.ts and in the built bundle', async () => {
  const ts = readFileSync(new URL('../admin-live/live.ts', import.meta.url), 'utf8'), body = ts.slice(ts.indexOf('async function poll('), ts.indexOf('function nextPoll('));
  assert.match(body, /const q = \+\+pollSeq;/); assert.equal((body.match(/if \(q !== pollSeq\) return;/g) || []).length, 2, 'after the answer, and after a failure');
  assert.match(LIVE_JS, /let (\w+)=\+\+(\w+);try\{let \w+=await fetch\("\/admin\/api\/live"[\s\S]{0,140}?if\(\1!==\2\)return;/, 'the bundle was built from it');
  assert.match(LIVE_JS, /catch\(\w+\)\{if\((\w+)!==(\w+)\)return;\w+\.error=/);
});

/* ---- 9. busy flags ---- */
await test('B9 caLoad: one asked for while another is on its way runs once more after it (never dropped), and its callers wait for that one', async () => {
  const H = held(), CA = {}; let drawn = 0;
  const { x } = run(slice('/* one load at a time; one asked for meanwhile', 'function caNew('), 'caLoad', { CA, api: H.api, pgHas: () => true, caMonth0: () => 1, caUi: () => drawn++, caGridUi() {} });
  const a = x.caLoad(), b = x.caLoad(), c = x.caLoad(); assert.equal(H.calls.length, 1);
  let bDone = false; b.then(() => { bDone = true; });
  H.calls[0].res({ items: ['before the save'] }); await settle();
  assert.equal(H.calls.length, 2, 'once more'); assert.equal(bDone, false, 'the caller after a save waits for that one');
  H.calls[1].res({ items: ['after the save'] }); await a; await b; await c;
  assert.deepEqual(CA.items, ['after the save']); assert.equal(H.calls.length, 2, 'not once for each'); assert.equal(drawn, 2);
});

await test('B9 tkPost: a change made while another is on its way waits for it and then goes (never dropped); rlPost says to wait (and draws the roles again) rather than drop it silently', async () => {
  const H = held(), TK = { list: [], sel: '' }, said = [];
  const { x } = run(slice('/* one change at a time: one made while another is on its way waits for it, then goes', 'async function tkTick('), 'tkPost', { TK, api: H.api, tkSay: (t) => said.push(t), tkMerge() {}, tkCount() {}, tkUi() {}, hmUi() {}, pgNow: 'tasks' });
  const b1 = { disabled: false }, b2 = { disabled: false };
  const p1 = x.tkPost({ op: 'note', id: 't1', text: 'one' }, b1), p2 = x.tkPost({ op: 'note', id: 't1', text: 'two' }, b2);
  assert.equal(b2.disabled, true, 'waiting: its button is off'); await settle(); assert.equal(H.calls.length, 1);
  H.calls[0].res({ ok: 1 }); await p1; await settle(); assert.equal(H.calls.length, 2); assert.equal(H.calls[1].body.text, 'two');
  H.calls[1].res({ ok: 2 }); assert.deepEqual(clone(await p2), { ok: 2 }); assert.equal(TK.busy, false); assert.equal(b2.disabled, false);
  const RL = { busy: true }, msgs = []; let drawn = 0;
  const R2 = run(slice('async function rlPost(', 'document.addEventListener("click",async e=>{const b=e.target.closest("#rlAdd'), 'rlPost', { RL, seSay: (id, t) => msgs.push([id, t]), rlUi: () => drawn++, api: () => { throw new Error('not while busy'); } });
  assert.equal(await R2.x.rlPost({ email: 'a@p.test', role: 'ops' }), false);
  assert.equal(drawn, 1); assert.deepEqual(msgs, [['#rlMsg', 'Wait a moment: the change before this one is still being saved. Then make this one again.']]);
});

/* ---- 14. Flight Watch's panel: errors with Retry ---- */
await test('B14 Flight Watch: OOOI, gates, the loadsheet and the AOC log say when their data could not be read (with Retry), not "Not sent", "None in the last 18 hours" or "Loading…"', async () => {
  const OPS = {}, f = { cs: 'PAW1', dep: 'KSFO', arr: 'KLAX', phase: 'cruise', pilot: 'PAW0006' };
  const { x } = run(slice('/* (P2, Nov 2026) a part whose data could not be read', 'function foMsgHtml(f){'), 'foOooiHtml,foGatesHtml,foLsHtml,foLogHtml', { OPS, opsV: (k) => OPS[k] && OPS[k].v, FO: { edit: null },
    foAoc: () => [], foGates: () => ({ dep: null, arr: null }), foZ: () => '1200Z', otLate: () => 0, foChip: () => '', foMin: () => '', akChip: () => '', akList: () => '' });
  assert.match(x.foLsHtml(f, null), /Loading…/); assert.doesNotMatch(x.foLsHtml(f, null), /Not sent/, 'nothing read yet: not "Not sent"');
  OPS.aoc = { v: null, err: 'AOC messages are temporarily unavailable' }; OPS.ooo = { v: null, err: 'OOOI is temporarily unavailable' }; OPS.stands = { v: null, err: 'The gate plan is temporarily unavailable' };
  const ls = x.foLsHtml(f, null), log = x.foLogHtml(f), oo = x.foOooiHtml(f, null), gt = x.foGatesHtml(f);
  for (const [h, re] of [[ls, /AOC messages are temporarily unavailable/], [log, /AOC messages are temporarily unavailable/], [oo, /OOOI is temporarily unavailable/], [gt, /gate plan is temporarily unavailable/]]) { assert.match(h, re); assert.match(h, /data-foretry/); }
  assert.doesNotMatch(ls, /Not sent/); assert.doesNotMatch(log, /None in the last 18 hours/); assert.doesNotMatch(oo, /Loading…/); assert.doesNotMatch(gt, /Not sent/); assert.match(gt, /id="foGSay"/);
  /* data from before, and a refresh that failed: shown, and said not to be current */
  OPS.aoc = { v: { msgs: [] }, err: 'AOC messages are temporarily unavailable' };
  assert.match(x.foLogHtml(f), /None in the last 18 hours/); assert.match(x.foLogHtml(f), /showing what came before/);
  OPS.aoc.err = ''; assert.doesNotMatch(x.foLogHtml(f), /fo-err/);
  assert.match(ADMIN_HTML, /closest\("#lvOps \[data-foretry\]"\);if\(!b\|\|!FO\.f\)return;b\.disabled=true;try\{await foLoad\(true\)\}finally\{foInfoUi\(true\)\}/, 'Retry reloads the panel');
});

/* ---- 15. fewer redraws ---- */
await test('B15 Nav Data\'s search draws the list 120 ms after the last key, not on each one', async () => {
  const m = ADMIN_HTML.match(/let ndQT=0;document\.addEventListener\("input"[^\n]*?,120\)\}\);/); assert.ok(m);
  let L = null, drawn = 0; const ND = {};
  const R = run(m[0], 'x:1', { document: { addEventListener: (t, f) => { L = f; } }, ND, ndUi: () => drawn++, ndAllBtn() {} });
  for (const q of ['C', 'Ch', 'Chi', 'Chin', 'China']) L({ target: { id: 'ndQ', value: q } });
  assert.equal(drawn, 0); assert.equal(ND.q, 'China'); assert.equal(R.fire(), 1, 'one timer left'); assert.equal(drawn, 1); assert.equal(R.timers.at(-1).ms, 120);
  L({ target: { id: 'other', value: 'x' } }); assert.equal(R.fire(), 0);
});

await test('B15 the camera strip is written again only when what it shows changes (a focused button keeps its focus); the list\'s marks come once a frame', async () => {
  let writes = 0; const el = { hidden: true, _h: '', get innerHTML() { return this._h; }, set innerHTML(h) { writes++; this._h = h; } }, FW_CAM = { online: { PAW0006: {} }, ground: '' };
  const { x } = run(slice('/* the strip: every pilot online', 'const fwCamHtml='), 'fwCamStrip', { $: () => el, FW_CAM, fwCamFlights: () => ({}) });
  x.fwCamStrip(); x.fwCamStrip(); x.fwCamStrip(); assert.equal(writes, 1); assert.equal(el.hidden, false);
  FW_CAM.online.PAW0012 = {}; x.fwCamStrip(); assert.equal(writes, 2); x.fwCamStrip(); assert.equal(writes, 2);
  FW_CAM.online = {}; x.fwCamStrip(); assert.equal(el.hidden, true); assert.equal(el.innerHTML, ''); x.fwCamStrip(); assert.equal(writes, 3);
  FW_CAM.online = { PAW0006: {} }; x.fwCamStrip(); assert.equal(writes, 4, 'back: written again');
  assert.match(ADMIN_HTML, /new MutationObserver\(fwRowsSoon\)/); assert.match(ADMIN_HTML, /function fwRowsSoon\(\)\{if\(!fwRowsRaf\)fwRowsRaf=requestAnimationFrame\(fwRowsNow\)\}/);
  assert.match(ADMIN_HTML, /window\.addEventListener\("pm:live",e=>\{[^\n]*fwRowsSoon\(\)\}\);/);
});

await test('B15 the gates map: a drag moves what is drawn (transforms, no layout read, the stands\' layer not written); it is drawn again on pointerup, and 180 ms after a zoom', async () => {
  const E = {}, mk = (id) => (E[id] = { id, attrs: {}, writes: 0, reads: 0, hidden: false, style: {}, offsetWidth: 100, offsetHeight: 40, _h: '',
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, get innerHTML() { return this._h; }, set innerHTML(h) { this.writes++; this._h = h; },
    get clientWidth() { this.reads++; return 800; }, getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {} });
  ['stSvg', 'stGm', 'stBase', 'stOv', 'stPop'].forEach(mk);
  const ST = { sel: 'KSFO', maps: { KSFO: { S: [{ n: 'D1', x: 10, y: 10 }] } }, M: { i: 'KSFO', k: 1, tx: 0, ty: 0, W: 800, H: 470 }, pop: '' }, L = {}, frames = [];
  const R = run(slice('function stZoomTo(', 'function stOvHtml(') + slice('const GM={', 'document.addEventListener("change",e=>{const t=e.target;if(!t.closest||!t.closest("#stands"))return;') + slice('/* the map: drag to move', 'window.addEventListener("resize"'), 'stMapDraw,gmMove,GM,stZoomTo',
    { ST, $: (s) => E[s.slice(1)] || null, stFit() {}, stOvHtml: () => '<g></g>', stPopHtml: () => '', document: { addEventListener: (t, f) => { L[t] = f; } },
      requestAnimationFrame: (f) => { frames.push(f); return frames.length; } });
  const frame = () => { const F = frames.splice(0); F.forEach((f) => f(0)); return F.length; };
  R.x.stMapDraw(); assert.equal(E.stOv.writes, 1); assert.deepEqual(clone(R.x.GM.at), { k: 1, tx: 0, ty: 0 });
  const svg = E.stSvg, tgt = { closest: (s) => (s === '#stSvg' ? svg : null) }, reads = E.stGm.reads;
  L.pointerdown({ pointerId: 1, clientX: 100, clientY: 100, target: tgt });
  for (let i = 1; i <= 8; i++) L.pointermove({ pointerId: 1, clientX: 100 + i * 10, clientY: 100 + i * 5 });
  assert.equal(frame(), 1, 'eight moves in a frame: moved once'); E.stPop.hidden = false; L.pointermove({ pointerId: 1, clientX: 180, clientY: 140 }); frame(); assert.equal(E.stPop.hidden, true, 'the stand\'s card is hidden while it moves');
  assert.equal(E.stOv.writes, 1, 'the stands\' layer is not written while dragging'); assert.equal(E.stGm.reads, reads, 'no layout read while dragging');
  assert.equal(E.stOv.attrs.transform, 'matrix(1 0 0 1 80.00 40.00)'); assert.equal(E.stBase.attrs.transform, 'matrix(1 0 0 1 80.00 40.00)');
  L.pointerup({ pointerId: 1, target: tgt }); assert.equal(E.stOv.writes, 2, 'drawn again where it stopped'); assert.equal(E.stOv.attrs.transform, undefined);
  /* a zoom: scaled at once, drawn again 180 ms after the last */
  R.x.stZoomTo(2, 400, 235); R.x.stZoomTo(2.5, 400, 235); frame(); assert.equal(E.stOv.writes, 2); assert.match(E.stOv.attrs.transform, /^matrix\(2\.5 0 0 2\.5 /);
  const live = R.timers.filter((t) => !t.gone); assert.equal(live.length, 1); assert.equal(live[0].ms, 180); R.fire(); assert.equal(E.stOv.writes, 3);
});

/* ---- 16, 20. small async fixes; Esc ---- */
await test('B16 the attachment picker: a file that cannot be read says so, and the picker is emptied either way', async () => {
  let H = null; const said = [], S = { add: [] }; let drawn = 0;
  run(slice('/* an attachment is kept as the file it is', '/* each new attachment, uploaded'), 'x:1', { $: () => ({ addEventListener: (t, f) => { H = f; } }), S, say: (t) => said.push(t), attsUi: () => drawn++ });
  const bad = { value: 'C:\\fakepath\\brief.pdf', get files() { throw new Error('NotReadableError: the file could not be read'); } };
  H({ target: bad }); assert.match(said[0], /could not be added: NotReadableError/); assert.equal(bad.value, ''); assert.equal(drawn, 1);
  const ok = { value: 'x', files: [{ name: 'a.PDF', size: 10, type: '' }, { name: 'big.pdf', size: 6e6, type: 'application/pdf' }] };
  H({ target: ok }); assert.deepEqual(S.add.map((f) => [f.name, f.type]), [['a.PDF', 'application/pdf']]); assert.match(said.at(-1), /larger than 5 MB/); assert.equal(ok.value, '');
});

await test('B16 a Flight Watch alert\'s AOC: the flight already open switches to AOC where it is (not opened again), on Flight Watch, then its message gets the focus', async () => {
  let H = null; const shown = [], FO = { f: { cs: 'PAW1' }, mode: 'mail' }, loc = { hash: '' }, calls = [], focus = [];
  const R = run(slice('document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest(".fw button");', "/* (P2) the list's marks"), 'x:1', {
    document: { addEventListener: (t, f) => { if (t === 'click') H = f; } }, FW: { list: [{ k: 'a1', cs: 'PAW1' }, { k: 'a2', cs: 'PAW2' }], seen: {} }, FO, location: loc, pgNow: 'home',
    window: undefined, foModeUi: () => calls.push('mode'), foUi: () => calls.push('ui'), $: (s) => (s === '#foAoc' ? {} : s === '#foBody' ? { focus: () => focus.push(FO.f.cs) } : null), fwSave() {}, fwUi() {} });
  R.ctx.pmLive = { show: (cs) => shown.push(cs) }; R.ctx.window = R.ctx;
  const click = (k) => H({ target: { closest: () => ({ dataset: { fwaoc: k } }) } });
  click('a1'); assert.equal(FO.mode, 'aoc'); assert.deepEqual(shown, [], 'not opened again'); assert.deepEqual(calls, ['mode']); assert.equal(loc.hash, '#fw');
  R.fire(); assert.deepEqual(focus, ['PAW1']);
  /* another flight open (a message being written there): asked to open this one; kept as it was if it stays */
  FO.mode = 'mail'; click('a2'); assert.deepEqual(shown, ['PAW2']); assert.equal(FO.mode, 'mail'); R.fire(); assert.deepEqual(focus, ['PAW1'], 'no focus in the other flight\'s panel');
});

await test('B16 a gate sent from Flight Watch is said only in the panel of the flight it was for', async () => {
  const s = slice('if(d.fog==="send"){', 'if(b.id==="foSend"){');
  assert.match(s, /const mine=\(\)=>FO\.f&&FO\.f\.cs===f\.cs;if\(mine\(\)\)FO\.edit=null;/); assert.match(s, /if\(mine\(\)\)\{foInfoUi\(true\);const s=\$\("#foGSay"\);if\(s\)s\.innerHTML=/);
  assert.match(s, /catch\(er\)\{if\(FO\.f&&FO\.f\.cs===f\.cs\)\{const s=\$\("#foGSay"\);if\(s\)/); assert.doesNotMatch(s, /\$\("#foGSay"\)\.innerHTML/);
});

await test('B20 Esc: Gates leaves a field\'s Esc alone; Broadcast lets go of a camera seen large and of a button armed for its second press', async () => {
  let K = null, refreshed = 0; const ST = { pop: 'D1' };
  run(slice('document.addEventListener("keydown",e=>{if(e.key==="Escape"&&ST.pop', '/* the map: drag to move'), 'x:1', { document: { addEventListener: (t, f) => { K = f; } }, ST, pgNow: 'gates', stMapRefresh: () => refreshed++ });
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) { K({ key: 'Escape', target: { tagName: tag, id: '' } }); assert.equal(ST.pop, 'D1', tag); }
  K({ key: 'Escape', target: { tagName: 'svg', id: '' } }); assert.equal(ST.pop, ''); assert.equal(refreshed, 1);
  let em = 0; const BC = { arm: 'bcStart' }, tok = { textContent: 'Press again: the old link stops' }, CAM = { zoom: -1, caps() {} };
  const { x, ctx } = run(slice('function camEsc(e){', 'document.addEventListener("keydown",camEsc,true);'), 'camEsc', { pgNow: 'bc', BC, bcEm: () => em++, CAMB: { src: '' }, CAM, CAMP: { zoom: -1 }, FWV: { zoom: -1 }, document: { getElementById: (id) => (id === 'bcTok' ? tok : null) } });
  const ev = () => ({ key: 'Escape', target: { closest: () => null }, metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  let e = ev(); x.camEsc(e); assert.equal(BC.arm, ''); assert.equal(em, 1); assert.equal(e.defaultPrevented, true);
  e = ev(); x.camEsc(e); assert.equal(e.defaultPrevented, false, 'nothing to let go: Esc is left alone');
  BC.arm = 'bcTok'; CAM.zoom = 2; e = ev(); x.camEsc(e); assert.equal(BC.arm, ''); assert.equal(tok.textContent, 'New link'); assert.equal(CAM.zoom, -1); assert.equal(e.defaultPrevented, true);
  ctx.pgNow = 'fw'; BC.arm = 'bcStart'; e = ev(); x.camEsc(e); assert.equal(BC.arm, 'bcStart', 'only on Broadcast');
});

/* ================= C. the CSS and the buttons ================= */
const CSS = [...ADMIN_HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((x) => x[1]).join('\n');
const RULES = (() => {
  const s = CSS.replace(/\/\*[\s\S]*?\*\//g, ''), out = []; let i = 0;
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
const inMedia = (r, media) => r.media === (media ? '@media' + media.replace(/\s+/g, '') : '');
const decl = (media, sel, prop) => { for (const r of [...RULES].reverse()) { if (!inMedia(r, media) || !r.sel.includes(sel)) continue; const m = [...r.body.matchAll(new RegExp('(?:^|;)\\s*' + prop.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;]+)', 'g'))].at(-1); if (m) return m[1].trim(); } return null; };
const declAll = (media, sel, prop) => RULES.filter((r) => inMedia(r, media) && r.sel.includes(sel)).flatMap((r) => [...r.body.matchAll(new RegExp('(?:^|;)\\s*' + prop.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;]+)', 'g'))].map((m) => m[1].trim()));

await test('C17 dead and repeated CSS gone: the header tabs, the first main#live columns and height, the AOC pink, the first .fw-n.red', async () => {
  assert.equal(RULES.some((r) => r.sel.some((s) => /(^|[\s>+~])\.tabs\b/.test(s))), false, 'no .tabs rule');
  assert.deepEqual(declAll('', 'main#live', 'grid-template-columns'), ['minmax(0,1fr) 440px']); assert.deepEqual(declAll('', 'main#live', 'height'), ['calc(100vh - var(--hdr))', 'calc(100svh - var(--hdr))']);
  assert.equal(decl('', 'main#live', 'display'), 'grid'); assert.equal(decl('(max-width:900px)', 'main#live', 'grid-template-rows'), '56vh auto'); assert.equal(decl('(max-width:900px)', 'main#live', 'grid-template-columns'), '1fr');
  assert.doesNotMatch(CSS, /#B0487F|#E3A3C6/i); assert.equal(RULES.some((r) => r.sel.some((s) => /\.ac-m\b/.test(s))), false);
  assert.equal(decl('', '.tag.a', 'color'), 'var(--label)'); assert.equal(decl('', '.mail.aoc b', 'color'), 'var(--ink)'); assert.doesNotMatch(CSS, /!important\}\s*\.tag\.a|\.tag\.a\{[^}]*!important/);
  assert.deepEqual(declAll('', '.fw-n.red', 'background'), ['var(--red)'], 'one .fw-n.red at the top, with its dark colours apart');
});
await test('C18–23 the sidebar\'s labels, OOOI on a phone, the Messages list\'s height, the ? in the page\'s flow; every button on the page says type="button"', async () => {
  assert.equal(decl('', '.side .sg', 'color'), 'var(--label)');
  assert.equal(decl('(max-width:420px)', '.fo-t', 'grid-template-columns'), 'repeat(3,minmax(0,1fr))'); assert.equal(decl('', '.fo-t', 'grid-template-columns'), 'repeat(6,minmax(0,1fr))');
  assert.equal(decl('(max-width:420px)', '.fo-t>div:nth-child(3n+1)', 'border-left'), '0');
  assert.equal(decl('', '.cm-side', 'max-height'), 'calc(100svh - 83px - 16px)');
  assert.equal(decl('(max-width:900px)', '.help>div', 'position'), 'static'); assert.equal(decl('(max-width:900px)', '.help>div', 'width'), 'auto'); assert.equal(decl('(max-width:900px)', '.help>div', 'max-width'), 'none');
  assert.equal(decl('(max-width:900px)', '.pg-h:has(>.help[open])', 'flex-wrap'), 'wrap', 'the heading row wraps'); assert.equal(decl('(max-width:900px)', '.pg-h>.help[open]', 'flex-basis'), '100%', 'the open ? under the heading'); assert.equal(decl('(max-width:900px)', '.help', 'position'), 'static'); assert.equal(decl('(max-width:600px)', '.help>div', 'position'), 'static');
  assert.ok(decl('', '.ws-auth', 'position'), 'the sign-in notice is styled');
  const STATIC = (() => { const b = ADMIN_HTML.indexOf('<body>'), e = ADMIN_HTML.indexOf('<script', b); return ADMIN_HTML.slice(b, e); })();
  for (const id of ['send', 'cancel', 'dcSave', 'dcCancel', 'setSave']) assert.match(STATIC, new RegExp('<button type="button"[^>]*id="' + id + '"'), id);
  for (const t of ['light', 'auto', 'dark']) assert.match(STATIC, new RegExp('<button type="button" data-thm="' + t + '"'));
  for (const t of ['in', 'out', 'all']) assert.match(STATIC, new RegExp('<button type="button" data-lv="' + t + '"'));
  assert.deepEqual(STATIC.match(/<button(?![^>]*\btype=)[^>]*>/g) || [], [], 'none without a type');
});

/* ================= the files changed parse ================= */
await test('syntax: every file changed passes node --check and loads; every inline <script> and the Flight Watch bundle parse; the <style> braces balance', async () => {
  const { execFileSync } = await import('node:child_process'), { fileURLToPath } = await import('node:url');
  for (const f of ['mail.js', 'desk.js', 'cam.js', 'docs.js', 'cal.js', 'pm.js', 'tasks.js', 'jpcharts.js', 'admin.js', 'live-bundle.js', 'index.js']) {
    execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../src/' + f, import.meta.url))], { stdio: 'pipe' });
    await import('../src/' + f);
  }
  const S = [...ADMIN_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]); assert.ok(S.length >= 2);
  for (const s of S) assert.doesNotThrow(() => new vm.Script(s, { filename: 'admin-inline.js' }));
  assert.doesNotThrow(() => new vm.Script(LIVE_JS, { filename: 'live.js' }));
  const C = [...ADMIN_HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((x) => x[1]); assert.ok(C.length >= 1);
  for (const c of C) { let d = 0; for (const ch of c.replace(/"[^"]*"|'[^']*'/g, '')) { if (ch === '{') d++; else if (ch === '}') { d--; assert.ok(d >= 0, 'a } with no {'); } } assert.equal(d, 0, 'every { closed'); }
});

globalThis.fetch = realFetch; Date.now = realNow; console.warn = realWarn; globalThis.Response = RealResponse;
console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ', all passed'));
