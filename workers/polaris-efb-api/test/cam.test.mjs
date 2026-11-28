/* Polaris Cam relay (src/cam.js) and its admin routes (src/mail.js): plain Node 22, no npm packages.
     node workers/polaris-efb-api/test/cam.test.mjs
   The Workers runtime is stood in for here: WebSocketPair, a Response that takes status 101, the Durable Object's
   ctx (WebSockets with tags, storage), Cloudflare Access's keys (a key made here signs the test sign-ins), KV. */
import assert from 'node:assert/strict';

/* ---- the runtime, stood in for ---- */
class MockWS {
  constructor() { this.readyState = 1; this.sent = []; this.closed = null; this.att = null; this.tags = []; this.peer = null; }
  accept() {}
  send(d) { if (this.readyState !== 1) throw new Error('closed'); this.sent.push(d); }
  close(code, reason) { if (this.readyState >= 2) return; this.readyState = 3; this.closed = { code, reason }; }
  serializeAttachment(a) { this.att = structuredClone(a); }
  deserializeAttachment() { return this.att; }
  /* what the relay sent it */
  texts() { return this.sent.filter((m) => typeof m === 'string' && m !== 'pong').map((m) => JSON.parse(m)); }
  bins() { return this.sent.filter((m) => m instanceof ArrayBuffer); }
  clear() { this.sent = []; }
}
globalThis.WebSocketPair = class { constructor() { const c = new MockWS(), s = new MockWS(); c.peer = s; s.peer = c; this[0] = c; this[1] = s; } };
const RealResponse = globalThis.Response;
globalThis.Response = class extends RealResponse {
  constructor(body, init) {
    if (init && init.status === 101) { super(null, { status: 200 }); this._ws = init.webSocket; this._st = 101; }
    else super(body, init);
  }
  get status() { return this._st || super.status; }
  get webSocket() { return this._ws || null; }
};
let NOW = Date.now();
const realNow = Date.now; Date.now = () => NOW;

const { CamRelay, camAdmin, camPublic, frameIn, helloIn, CAM_GONE } = await import('../src/cam.js');
const { mailAdmin } = await import('../src/mail.js');

function mkCtx() {
  const socks = [], store = new Map();
  return {
    store,
    storage: { get: async (k) => (store.has(k) ? structuredClone(store.get(k)) : undefined), put: async (k, v) => { store.set(k, structuredClone(v)); } },
    acceptWebSocket(ws, tags) { ws.tags = tags; socks.push(ws); },
    getWebSockets(tag) { return socks.filter((w) => !tag || w.tags.includes(tag)); },
    getTags(ws) { return ws.tags; },
  };
}
function mkRelay() {
  const ctx = mkCtx(), relay = new CamRelay(ctx, {});
  const CAM = { idFromName: () => 'cam', get: () => ({ fetch: (input, init) => relay.fetch(input instanceof Request ? input : new Request(input, init)) }) };
  return { ctx, relay, env: { CAM } };
}
const up = (url, h = {}) => new Request(url, { headers: { Upgrade: 'websocket', ...h } });
/* a page or Polaris Cam joins: the server side of its socket (what the relay sends it is in .sent) */
async function join(R, url) { const r = await R.relay.fetch(up(url)); assert.equal(r.status, 101); return r.webSocket.peer; }
const viewer = (R, role) => join(R, 'https://cam/ws?role=' + role);
const pubJoin = async (R, token) => { const r = await camPublic(up('https://efb-api.example/live/cam/' + token + '/ws'), new URL('https://efb-api.example/live/cam/' + token + '/ws'), R.env); assert.equal(r.status, 101); return r.webSocket.peer; };
async function leave(R, ws, code = 1000) { ws.readyState = 3; await R.relay.webSocketClose(ws, code, '', true); }
const state = async (R, role) => (await (await R.relay.fetch(new Request('https://cam/state?role=' + role))).json());
const lastOf = (ws, t) => ws.texts().filter((m) => m.t === t).pop();

function frame({ cam = 0, codec = 1, flags = 1, w = 960, h = 540, seq = 1, magic = 0x50, ver = 1, payload } = {}) {
  const pl = payload || Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9);
  const b = new Uint8Array(16 + pl.length), d = new DataView(b.buffer);
  b[0] = magic; b[1] = ver; b[2] = cam; b[3] = codec; b[4] = flags; b[5] = 0;
  d.setUint16(6, w, true); d.setUint16(8, h, true); d.setUint16(10, 0, true); d.setUint32(12, seq, true);
  b.set(pl, 16); return b.buffer;
}
const seqOf = (buf) => new DataView(buf).getUint32(12, true);
const camOf = (buf) => new Uint8Array(buf)[2];
const send = (R, ws, m) => R.relay.webSocketMessage(ws, m);

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); process.exitCode = 1; }
}

/* ---- 1. the token ---- */
await test('token: made on first read, kept, 24-40 URL-safe characters', async () => {
  const R = mkRelay();
  const s = await state(R, 'dir');
  assert.match(s.token, /^[A-Za-z0-9_-]{24,40}$/);
  assert.equal(R.ctx.store.get('cfg').token, s.token);
  assert.deepEqual({ pub: s.pub.on, watchers: s.watchers }, { pub: false, watchers: 0 });
  /* a new object over the same storage reads the same token */
  const again = new CamRelay(R.ctx, {});
  assert.equal((await (await again.fetch(new Request('https://cam/state?role=dir'))).json()).token, s.token);
  assert.equal((await state(R, 'view')).token, undefined);
});

await test('token: a wrong link is closed 4004; a new link stops the old Polaris Cam (4004), the new one connects', async () => {
  const R = mkRelay(), t1 = (await state(R, 'dir')).token;
  const bad = await pubJoin(R, 'x'.repeat(30));
  assert.deepEqual(bad.closed, { code: 4004, reason: CAM_GONE });
  const p1 = await pubJoin(R, t1);
  assert.equal(p1.closed, null); assert.equal((await state(R, 'view')).pub.on, true);
  const dir = await viewer(R, 'dir'), view = await viewer(R, 'view');
  dir.clear(); view.clear();
  const r = await R.relay.fetch(new Request('https://cam/token', { method: 'POST', body: JSON.stringify({ who: 'a@b.c' }) }));
  const j = await r.json();
  assert.equal(j.ok, true); assert.notEqual(j.token, t1); assert.match(j.token, /^[A-Za-z0-9_-]{24,40}$/);
  assert.equal(j.pub.on, false); assert.equal(j.watchers, 2);
  assert.deepEqual(p1.closed, { code: 4004, reason: CAM_GONE });
  assert.deepEqual(lastOf(dir, 'token'), { t: 'token', token: j.token });
  assert.equal(view.texts().some((m) => m.t === 'token' || 'token' in m || JSON.stringify(m).includes(j.token)), false);
  assert.equal(lastOf(view, 'pub').pub.on, false);
  /* the old link no longer works, the new one does */
  const old = await pubJoin(R, t1); assert.equal(old.closed.code, 4004);
  const p2 = await pubJoin(R, j.token); assert.equal(p2.closed, null);
  assert.deepEqual(p2.texts()[0], { t: 'watch', n: 2 });
  /* the old socket's late close does not take the new one off */
  await leave(R, p1, 4004); assert.equal((await state(R, 'view')).pub.on, true);
});

await test('one Polaris Cam at a time: a second one takes over (4000), and the first one leaving changes nothing', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token;
  const a = await pubJoin(R, t), b = await pubJoin(R, t);
  assert.deepEqual(a.closed, { code: 4000, reason: 'Another Polaris Cam took over' });
  assert.equal(b.closed, null);
  await leave(R, a, 4000);
  assert.equal((await state(R, 'view')).pub.on, true);
});

/* ---- 2. who may do what ---- */
const TEAM = 'test.cloudflareaccess.com', AUD = 'test-aud';
const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => (String(u) === 'https://' + TEAM + '/cdn-cgi/access/certs' ? new RealResponse(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } }) : realFetch(u, init));
async function signIn(email) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })), p = b64u(JSON.stringify({ aud: [AUD], iss: 'https://' + TEAM, email, exp: Math.floor(realNow() / 1000) + 3600 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(h + '.' + p));
  return h + '.' + p + '.' + b64u(new Uint8Array(sig));
}
const roles = {
  people: { 'dir@p.test': { role: 'director' }, 'watch@p.test': { role: 'watcher' }, 'ops@p.test': { role: 'nobc' } },
  roles: { director: { name: 'Director', pages: ['bc'], can: ['live'] }, watcher: { name: 'Watcher', pages: ['bc'], can: [] }, nobc: { name: 'Ops', pages: ['fw'], can: ['msg'] } },
};
const kv = { m: new Map([['admin:v1:roles', JSON.stringify(roles)]]), async get(k, t) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { this.m.set(k, v); } };
const ORIGIN = 'https://efb-api.example';
async function admin(R, email, path, { method = 'GET', body, ws = false, origin = ORIGIN } = {}) {
  const headers = { 'Cf-Access-Jwt-Assertion': await signIn(email) };
  if (ws) { headers.Upgrade = 'websocket'; if (origin) headers.Origin = origin; }
  if (body) headers['Content-Type'] = 'application/json';
  const req = new Request(ORIGIN + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return mailAdmin(req, new URL(req.url), { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, STORE: kv, CAM: R.env.CAM }, {});
}

await test('roles: GET /admin/api/cam needs Broadcast; the token only for those who may direct', async () => {
  const R = mkRelay();
  const d = await admin(R, 'dir@p.test', '/admin/api/cam'); assert.equal(d.status, 200);
  const dj = await d.json(); assert.match(dj.token, /^[A-Za-z0-9_-]{24,40}$/); assert.equal(dj.watchers, 0); assert.equal(dj.pub.on, false);
  const w = await admin(R, 'watch@p.test', '/admin/api/cam'); assert.equal(w.status, 200);
  const wj = await w.json(); assert.equal('token' in wj, false);
  assert.equal((await admin(R, 'ops@p.test', '/admin/api/cam')).status, 403);
  assert.equal((await admin(R, 'stranger@p.test', '/admin/api/cam')).status, 403);
});

await test('roles: POST /admin/api/cam (a new link) needs "live"', async () => {
  const R = mkRelay(), t1 = (await state(R, 'dir')).token;
  const w = await admin(R, 'watch@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'token' } });
  assert.equal(w.status, 403); assert.equal((await state(R, 'dir')).token, t1);
  assert.equal((await admin(R, 'ops@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'token' } })).status, 403);
  const bad = await admin(R, 'dir@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'nope' } }); assert.equal(bad.status, 400);
  const d = await admin(R, 'dir@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'token' } });
  assert.equal(d.status, 200); const j = await d.json();
  assert.equal(j.ok, true); assert.notEqual(j.token, t1); assert.equal((await state(R, 'dir')).token, j.token);
});

await test('roles: GET /admin/api/cam/ws needs Broadcast and the admin\'s own page; a watcher\'s socket never sees the token', async () => {
  const R = mkRelay(), token = (await state(R, 'dir')).token;
  assert.equal((await admin(R, 'ops@p.test', '/admin/api/cam/ws', { ws: true })).status, 403);
  assert.equal((await admin(R, 'watch@p.test', '/admin/api/cam/ws', { ws: true, origin: 'https://evil.example' })).status, 403);
  assert.equal((await admin(R, 'watch@p.test', '/admin/api/cam/ws')).status, 426);   /* not a WebSocket */
  const wr = await admin(R, 'watch@p.test', '/admin/api/cam/ws', { ws: true }); assert.equal(wr.status, 101);
  const wv = wr.webSocket.peer; assert.deepEqual(wv.tags, ['view']);
  const h = wv.texts()[0]; assert.equal(h.t, 'hello'); assert.equal(h.role, 'view'); assert.equal('token' in h, false);
  assert.equal(JSON.stringify(wv.texts()).includes(token), false);
  const dr = await admin(R, 'dir@p.test', '/admin/api/cam/ws', { ws: true }); assert.equal(dr.status, 101);
  const dv = dr.webSocket.peer; assert.deepEqual(dv.tags, ['dir']);
  assert.equal(dv.texts()[0].role, 'dir'); assert.equal(dv.texts()[0].token, token);
  /* a new link: to directors only */
  await admin(R, 'dir@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'token' } });
  const nt = (await state(R, 'dir')).token;
  assert.equal(lastOf(dv, 'token').token, nt);
  assert.equal(JSON.stringify(wv.texts()).includes(nt), false);
});

/* ---- 3. who is watching ---- */
await test('watchers: Polaris Cam hears 0 -> 1 -> 2 -> 1 -> 0, and the pages hear each change', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token;
  const p = await pubJoin(R, t);
  const watch = () => p.texts().filter((m) => m.t === 'watch').map((m) => m.n);
  assert.deepEqual(watch(), [0]);
  assert.equal(p.sent[0], '{"t":"watch","n":0}');
  const a = await viewer(R, 'dir'); assert.deepEqual(watch(), [0, 1]);
  assert.equal(a.texts()[0].watchers, 1);
  const b = await viewer(R, 'view'); assert.deepEqual(watch(), [0, 1, 2]);
  assert.equal(lastOf(a, 'pub').watchers, 2);
  await leave(R, a); assert.deepEqual(watch(), [0, 1, 2, 1]);
  assert.equal(lastOf(b, 'pub').watchers, 1);
  await leave(R, b); assert.deepEqual(watch(), [0, 1, 2, 1, 0]);
  assert.equal((await state(R, 'view')).watchers, 0);
});

await test('hello from Polaris Cam: cleaned up, at most 4 cameras 0..3, and passed to the pages', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token, p = await pubJoin(R, t), v = await viewer(R, 'view');
  v.clear();
  await send(R, p, JSON.stringify({ t: 'hello', v: '0.1.0', mode: 'jpeg', cams: [
    { i: 1, name: 'Wing <left>', on: true, w: 960, h: 540 }, { i: 0, name: 'Cockpit\u0000', on: true, w: 1280, h: 720 },
    { i: 0, name: 'dup' }, { i: 7, name: 'too far' }, { i: 2, name: 'x'.repeat(90), on: false, w: 99999, h: -3 }, { i: 3, name: '' }, { i: 'a' } ] }));
  const m = lastOf(v, 'pub');
  assert.equal(m.pub.on, true); assert.equal(m.pub.v, '0.1.0'); assert.equal(m.pub.mode, 'jpeg'); assert.equal(m.watchers, 1);
  assert.deepEqual(m.pub.cams.map((c) => c.i), [0, 1, 2, 3]);
  assert.equal(m.pub.cams[0].name, 'Cockpit'); assert.equal(m.pub.cams[1].name, 'Wing left');
  assert.equal(m.pub.cams[2].name.length, 40); assert.deepEqual([m.pub.cams[2].on, m.pub.cams[2].w, m.pub.cams[2].h], [false, 0, 0]);
  assert.equal(m.pub.cams[3].name, 'Camera 4');
  assert.equal(helloIn({ mode: 'vp9' }).mode, 'jpeg'); assert.equal(helloIn({ mode: 'h264' }).mode, 'h264');
  /* a page opened later gets it in its hello */
  const late = await viewer(R, 'dir'); assert.equal(late.texts()[0].pub.cams.length, 4); assert.equal(late.texts()[0].pub.v, '0.1.0');
});

/* ---- 4. pictures ---- */
await test('pictures: a good JPEG goes to every page as it came, and the latest of each camera to a page opened later', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token, p = await pubJoin(R, t), a = await viewer(R, 'dir');
  const f1 = frame({ cam: 0, seq: 1 }), f2 = frame({ cam: 0, seq: 2 }), g1 = frame({ cam: 3, seq: 9, w: 4096, h: 4096 });
  await send(R, p, f1); await send(R, p, f2); await send(R, p, g1);
  assert.deepEqual(a.bins().map(seqOf), [1, 2, 9]);
  assert.equal(a.bins()[1], f2);                         /* passed on as it is, byte for byte */
  const late = await viewer(R, 'view');
  assert.deepEqual(late.bins().map((b) => [camOf(b), seqOf(b)]), [[0, 2], [3, 9]]);
  assert.equal(late.bins()[0], f2);
  /* Polaris Cam leaves: the pictures are dropped, the pages hear it */
  await leave(R, p);
  assert.equal(lastOf(a, 'pub').pub.on, false);
  assert.deepEqual(R.relay.last, [null, null, null, null]);
  assert.equal((await viewer(R, 'view')).bins().length, 0);
});

await test('pictures: anything else is dropped without a word and without breaking the relay', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token, p = await pubJoin(R, t), a = await viewer(R, 'dir');
  const bad = [
    frame({ magic: 0x51 }), frame({ ver: 2 }), frame({ cam: 4 }), frame({ codec: 3 }), frame({ codec: 0 }),
    frame({ w: 0 }), frame({ h: 0 }), frame({ w: 4097 }), frame({ h: 5000 }), frame({ seq: 0 }),
    frame({ payload: Uint8Array.of(0x89, 0x50, 0x4e, 0x47) }),                   /* a PNG as JPEG */
    frame({ payload: new Uint8Array(1048576 - 16 + 1).fill(0xff) }),            /* one byte over 1 MiB */
    new Uint8Array(17).buffer, new ArrayBuffer(0), Uint8Array.of(0x50, 1).buffer,
  ];
  for (const b of bad) await send(R, p, b);
  await send(R, p, JSON.stringify({ t: 'hello', cams: 'nope' })); await send(R, p, '{not json'); await send(R, p, 'x'.repeat(70000));
  await send(R, a, frame({ seq: 5 }));                                            /* pictures only from Polaris Cam */
  assert.equal(a.bins().length, 0);
  assert.deepEqual(R.relay.last, [null, null, null, null]);
  /* exactly 1 MiB, and a typed array, are fine; H.264 is passed on but not kept */
  const big = new Uint8Array(1048576 - 16); big[0] = 0xff; big[1] = 0xd8;
  await send(R, p, frame({ seq: 1, payload: big }));
  await send(R, p, new Uint8Array(frame({ seq: 2 })));
  await send(R, p, frame({ cam: 1, codec: 2, flags: 1, seq: 3, payload: Uint8Array.of(0, 0, 0, 1, 0x67) }));
  assert.deepEqual(a.bins().map(seqOf), [1, 2, 3]);
  assert.equal(a.bins()[0].byteLength, 1048576);
  assert.equal(R.relay.last[0].seq, 2); assert.equal(R.relay.last[1], null);
  assert.equal(frameIn(frame({ cam: 2, seq: 7 })).cam, 2);
  await send(R, a, 'ping'); assert.equal(a.sent[a.sent.length - 1], 'pong');
});

/* ---- 5. a slow page ---- */
await test('slow page: after 8 pictures without an ack it pauses (one every 3 s), while a page that acks gets every one', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token, p = await pubJoin(R, t);
  const fast = await viewer(R, 'dir'), slow = await viewer(R, 'view');
  let seq = 0;
  const shoot = async (n, cam = 0) => { for (let i = 0; i < n; i++) { seq++; NOW += 33; await send(R, p, frame({ cam, seq })); const s = fast.bins().filter((b) => camOf(b) === cam).map(seqOf).pop(); if (s) await send(R, fast, JSON.stringify({ t: 'ack', cam, seq: s })); } };
  await shoot(30);
  assert.equal(fast.bins().length, 30);
  assert.deepEqual(slow.bins().map(seqOf), [1, 2, 3, 4, 5, 6, 7, 8]);
  /* one fresh picture after 3 s, to see whether it has caught up */
  NOW += 3000; await shoot(5);
  assert.deepEqual(slow.bins().map(seqOf), [1, 2, 3, 4, 5, 6, 7, 8, 31]);
  assert.equal(fast.bins().length, 35);
  /* another camera is not held up by this one */
  await shoot(3, 2); assert.deepEqual(slow.bins().filter((b) => camOf(b) === 2).map(seqOf), [36, 37, 38]);
  /* an ack of something older, or never sent to it, does not let it go */
  await send(R, slow, JSON.stringify({ t: 'ack', cam: 0, seq: 3 }));   /* 6 still out */
  await send(R, slow, JSON.stringify({ t: 'ack', cam: 0, seq: 20 }));  /* never sent to it: ignored */
  await send(R, slow, JSON.stringify({ t: 'ack', cam: 9, seq: 31 })); await send(R, slow, JSON.stringify({ t: 'ack', cam: 0, seq: -1 }));
  const before = slow.bins().length; await shoot(1);
  assert.equal(slow.bins().length, before + 1);                         /* 6 out: below 8 again, so it is sent */
  /* it catches up: every picture again */
  const last = slow.bins().filter((b) => camOf(b) === 0).map(seqOf).pop();
  await send(R, slow, JSON.stringify({ t: 'ack', cam: 0, seq: last }));
  const n0 = slow.bins().length; await shoot(4);
  assert.equal(slow.bins().length, n0 + 4);
  assert.equal(fast.bins().length, 30 + 5 + 3 + 1 + 4);
  /* a page that left is forgotten */
  await leave(R, slow); assert.equal(R.relay.flow.has(slow), false);
});

await test('slow page: a page with many pictures out is not sent more than 32 seqs are kept for, and memory stays at 1 picture a camera', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token, p = await pubJoin(R, t), slow = await viewer(R, 'view');
  for (let s = 1; s <= 500; s++) { NOW += 3001; for (let c = 0; c < 4; c++) await send(R, p, frame({ cam: c, seq: s })); }
  for (let c = 0; c < 4; c++) { assert.ok(R.relay.flow.get(slow)[c].ring.length <= 32); assert.equal(R.relay.last[c].seq, 500); }
});

globalThis.fetch = realFetch; Date.now = realNow;
console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ', all passed'));
