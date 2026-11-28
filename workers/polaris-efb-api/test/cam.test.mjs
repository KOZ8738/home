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

function frame({ cam = 0, codec = 1, flags = 1, w = 960, h = 540, seq = 1, magic = 0x50, ver = 1, dur = 0, payload } = {}) {
  const pl = payload || Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9);
  const b = new Uint8Array(16 + pl.length), d = new DataView(b.buffer);
  b[0] = magic; b[1] = ver; b[2] = cam; b[3] = codec; b[4] = flags; b[5] = 0;
  d.setUint16(6, w, true); d.setUint16(8, h, true); d.setUint16(10, dur, true); d.setUint32(12, seq, true);
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
async function admin(R, email, path, { method = 'GET', body, ws = false, origin = ORIGIN, ctype = 'application/json' } = {}) {
  const headers = { 'Cf-Access-Jwt-Assertion': await signIn(email) };
  if (ws) { headers.Upgrade = 'websocket'; if (origin) headers.Origin = origin; }
  if (body && ctype) headers['Content-Type'] = ctype;
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
  /* exactly 1 MiB, and a typed array, are fine; H.264 is passed on, and kept apart from the JPEGs */
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

await test('slow page: a page with many pictures out is not sent more than 96 seqs are kept for, and memory stays at 1 picture a camera', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token, p = await pubJoin(R, t), slow = await viewer(R, 'view');
  for (let s = 1; s <= 500; s++) { NOW += 3001; for (let c = 0; c < 4; c++) await send(R, p, frame({ cam: c, seq: s })); }
  for (let c = 0; c < 4; c++) { assert.ok(R.relay.flow.get(slow)[c].ring.length <= 96); assert.equal(R.relay.last[c].seq, 500); }
});

/* ---- 6. Stage 2: the JSON-only link, H.264 ---- */
await test('roles: POST /admin/api/cam that is not JSON (a plain cross-site form) is refused 415, the link unchanged', async () => {
  const R = mkRelay(), t1 = (await state(R, 'dir')).token;
  for (const ctype of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', null]) {
    const r = await admin(R, 'dir@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'token' }, ctype });
    assert.equal(r.status, 415, String(ctype)); assert.deepEqual(await r.json(), { error: 'Send JSON' });
  }
  assert.equal((await state(R, 'dir')).token, t1);
  /* the role is still checked first */
  assert.equal((await admin(R, 'watch@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'token' }, ctype: 'text/plain' })).status, 403);
  const ok = await admin(R, 'dir@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'token' }, ctype: 'application/json; charset=utf-8' });
  assert.equal(ok.status, 200); assert.notEqual((await ok.json()).token, t1);
});

/* an H.264 frame: a key frame is SPS (High 3.1) + PPS + IDR, 4-byte start codes; a P frame one 4-byte slice */
const SPS = [0, 0, 0, 1, 0x67, 0x64, 0x00, 0x1f, 0xac, 0xd9, 0x40, 0x50, 0x05, 0xbb, 0x01, 0x10], PPS = [0, 0, 0, 1, 0x68, 0xeb, 0xe3, 0xcb, 0x22, 0xc0];
function h264({ cam = 0, key = false, seq, size = 0, dur = 33, w = 960, h = 540 } = {}) {
  const head = key ? [...SPS, ...PPS, 0, 0, 0, 1, 0x65, 0x88, 0x84] : [0, 0, 0, 1, 0x41, 0x9a, 0x02];
  const pl = new Uint8Array(Math.max(head.length, size)); pl.set(head); pl.fill(0x5a, head.length);
  return frame({ cam, codec: 2, flags: key ? 1 : 0, seq, w, h, dur, payload: pl });
}
const keysTo = (p) => p.texts().filter((m) => m.t === 'key');

await test('H.264: Annex-B frames (00 00 00 01 or 00 00 01) pass, anything else or too short is dropped; duration_ms is read', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token, p = await pubJoin(R, t), a = await viewer(R, 'dir');
  const good = [Uint8Array.of(0, 0, 0, 1, 0x65), Uint8Array.of(0, 0, 1, 0x65, 0x88), Uint8Array.of(0, 0, 1, 0x67, 0x64, 0, 0x1f)];
  const bad = [Uint8Array.of(0, 0, 2, 1, 0x65), Uint8Array.of(1, 0, 0, 1, 0x65), Uint8Array.of(0, 0, 0, 0, 1), Uint8Array.of(0, 0, 1, 0x65),
    Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1), Uint8Array.of(0, 0, 0, 2, 0x65)];
  for (const pl of bad) assert.equal(frameIn(frame({ codec: 2, payload: pl })), null, String(pl));
  for (const pl of good) assert.ok(frameIn(frame({ codec: 2, payload: pl })), String(pl));
  /* a JPEG sent as codec 2 is not H.264, nor H.264 as codec 1 */
  assert.equal(frameIn(frame({ codec: 1, payload: Uint8Array.of(0, 0, 0, 1, 0x65) })), null);
  const f = frameIn(frame({ codec: 2, flags: 0, dur: 50, seq: 9, payload: good[0] }));
  assert.deepEqual([f.codec, f.key, f.dur, f.seq], [2, false, 50, 9]);
  assert.equal(frameIn(frame({ codec: 1, flags: 0 })).key, true);           /* a JPEG is always a key frame */
  let s = 0; for (const pl of [...bad, ...good]) await send(R, p, frame({ codec: 2, flags: 1, seq: ++s, payload: pl }));
  assert.deepEqual(a.bins().map(seqOf), [7, 8, 9]);
  /* hello: each camera's own codec, or the top-level mode */
  const hh = helloIn({ mode: 'h264', cams: [{ i: 0 }, { i: 1, codec: 'jpeg' }, { i: 2, codec: 'vp9' }] });
  assert.deepEqual(hh.cams.map((c) => c.codec), ['h264', 'jpeg', 'h264']);
  assert.deepEqual(helloIn({ cams: [{ i: 3, codec: 'h264' }, { i: 0 }] }).cams.map((c) => c.codec), ['jpeg', 'h264']);
});

await test('H.264 GOP: a page opened midway gets the GOP from the latest key frame at once; a new key frame replaces it; past 75 frames or 768 KB it is not kept and a key frame is asked for', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token, p = await pubJoin(R, t);
  await send(R, p, h264({ key: true, seq: 1 })); for (let s = 2; s <= 10; s++) await send(R, p, h264({ seq: s }));
  /* JPEG of another camera, kept as before */
  await send(R, p, frame({ cam: 2, seq: 500 }));
  const late = await viewer(R, 'view');
  assert.deepEqual(late.bins().map((b) => [camOf(b), seqOf(b)]), [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [2, 500]]);
  assert.equal(late.bins()[0].byteLength, h264({ key: true, seq: 1 }).byteLength);
  assert.equal(keysTo(p).length, 0);                                       /* it had a whole GOP: nothing asked */
  /* the live frames after it go straight through (the replay is one picture out) */
  for (let s = 11; s <= 50; s++) await send(R, p, h264({ seq: s }));
  assert.equal(late.bins().filter((b) => camOf(b) === 0).length, 50);
  await send(R, p, h264({ key: true, seq: 51 })); await send(R, p, h264({ seq: 52 }));
  assert.deepEqual(R.relay.gop[0].frames.map((f) => f.seq), [51, 52]);
  const late2 = await viewer(R, 'view');
  assert.deepEqual(late2.bins().filter((b) => camOf(b) === 0).map(seqOf), [51, 52]);
  /* 75 frames are kept, the 76th stops it until the next key frame */
  await send(R, p, h264({ key: true, seq: 100 })); for (let s = 101; s <= 174; s++) await send(R, p, h264({ seq: s }));
  assert.equal(R.relay.gop[0].frames.length, 75); assert.equal(R.relay.gop[0].cut, false);
  await send(R, p, h264({ seq: 175 }));
  assert.equal(R.relay.gop[0].cut, true); assert.equal(R.relay.gop[0].frames.length, 0);
  await send(R, p, h264({ seq: 176 })); assert.equal(R.relay.gop[0].frames.length, 0);    /* nothing more until a key frame */
  NOW += 5000;
  const late3 = await viewer(R, 'view');
  assert.equal(late3.bins().filter((b) => camOf(b) === 0).length, 0);         /* no broken GOP */
  assert.deepEqual(keysTo(p), [{ t: 'key', cam: 0 }]);                        /* instead: a key frame, asked of Polaris Cam */
  await viewer(R, 'view'); assert.equal(keysTo(p).length, 1);                 /* a second page within the second: not again */
  /* 768 KB: a 500 KB key frame and a 300 KB P frame are not kept together */
  await send(R, p, h264({ key: true, seq: 200, size: 500 * 1024 })); assert.equal(R.relay.gop[0].frames.length, 1);
  await send(R, p, h264({ seq: 201, size: 300 * 1024 }));
  assert.equal(R.relay.gop[0].cut, true); assert.equal(R.relay.gop[0].bytes, 0);
  /* a key frame over 768 KB on its own is not kept at all */
  await send(R, p, h264({ key: true, seq: 300, size: 800 * 1024 })); assert.equal(R.relay.gop[0].cut, true); assert.equal(R.relay.gop[0].frames.length, 0);
  NOW += 1001; const late4 = await viewer(R, 'view');
  assert.equal(late4.bins().filter((b) => camOf(b) === 0).length, 0); assert.equal(keysTo(p).length, 2);
  /* never more than 768 KB a camera, whatever comes */
  await send(R, p, h264({ key: true, seq: 400, size: 100 * 1024 }));
  for (let s = 401; s < 500; s++) { await send(R, p, h264({ seq: s, size: 20 * 1024 })); assert.ok(R.relay.gop[0].bytes <= 768 * 1024 && R.relay.gop[0].frames.length <= 75); }
  /* Polaris Cam leaves: dropped */
  await leave(R, p); assert.deepEqual(R.relay.gop, [null, null, null, null]);
});

await test('H.264 slow page: past 45 frames out it gets no P frame, one key frame every 3 s only, and after its ack catches up a key frame is asked for and the next one starts it again; a page that acks gets every frame', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token, p = await pubJoin(R, t);
  const fast = await viewer(R, 'dir'), slow = await viewer(R, 'view');
  const KEYS = new Set([1, 31, 61, 91, 121]); let seq = 0;
  const shoot = async (n) => { for (let i = 0; i < n; i++) { seq++; NOW += 33; await send(R, p, h264({ seq, key: KEYS.has(seq) })); await send(R, fast, JSON.stringify({ t: 'ack', cam: 0, seq: fast.bins().map(seqOf).pop() })); } };
  const isKey = (b) => (new Uint8Array(b)[4] & 1) === 1;
  await shoot(45);
  assert.deepEqual(slow.bins().map(seqOf), Array.from({ length: 45 }, (_, i) => i + 1));
  await shoot(30);                                                            /* 46..75, with a key frame at 61: too soon */
  assert.equal(slow.bins().length, 45);
  const f = R.relay.flow.get(slow)[0]; assert.equal(f.needKey, true); assert.ok(f.pausedAt > 0);
  NOW += 3000; await shoot(30);                                                /* 76..105: the key frame at 91 goes, as a probe */
  assert.deepEqual(slow.bins().slice(45).map(seqOf), [91]);
  assert.ok(slow.bins().slice(45).every(isKey));                               /* never a P frame while paused */
  assert.equal(f.needKey, true); assert.equal(keysTo(p).length, 0);
  /* it acks the probe: caught up (under 15 out), so a key frame is asked for */
  await send(R, slow, JSON.stringify({ t: 'ack', cam: 0, seq: 91 }));
  assert.equal(f.ring.length, 0); assert.equal(f.pausedAt, 0);
  assert.deepEqual(keysTo(p), [{ t: 'key', cam: 0 }]);
  await shoot(5); assert.equal(slow.bins().length, 46);                        /* P frames still held back until a key frame */
  KEYS.add(seq + 1); await shoot(10);                                          /* Polaris Cam's key frame: on again */
  assert.deepEqual(slow.bins().slice(46).map(seqOf), Array.from({ length: 10 }, (_, i) => seq - 9 + i));
  assert.equal(isKey(slow.bins()[46]), true); assert.equal(f.needKey, false);
  /* the page that acks: every frame, none dropped */
  assert.deepEqual(fast.bins().map(seqOf), Array.from({ length: seq }, (_, i) => i + 1));
  assert.equal(R.relay.flow.get(fast)[0].needKey, false);
});

await test('H.264 key frames: a page\'s { t:"key" } goes to Polaris Cam at most once a second a camera; bad cameras are ignored', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token, p = await pubJoin(R, t), a = await viewer(R, 'dir'), b = await viewer(R, 'view');
  for (let i = 0; i < 5; i++) { await send(R, a, JSON.stringify({ t: 'key', cam: 1 })); await send(R, b, JSON.stringify({ t: 'key', cam: 1 })); NOW += 100; }
  assert.deepEqual(keysTo(p), [{ t: 'key', cam: 1 }]);
  await send(R, a, JSON.stringify({ t: 'key', cam: 2 })); assert.equal(keysTo(p).length, 2);   /* another camera: its own second */
  NOW += 600; await send(R, b, JSON.stringify({ t: 'key', cam: 1 })); assert.equal(keysTo(p).length, 3);
  for (const cam of [4, -1, '0', 1.5, null, undefined]) await send(R, a, JSON.stringify({ t: 'key', cam }));
  NOW += 2000; for (const cam of [4, -1, '0', 1.5, null]) await send(R, a, JSON.stringify({ t: 'key', cam }));
  assert.equal(keysTo(p).length, 3);
  /* Polaris Cam itself cannot ask, and nothing goes to the pages */
  await send(R, p, JSON.stringify({ t: 'key', cam: 3 })); assert.equal(keysTo(p).length, 3);
  assert.equal(a.texts().some((m) => m.t === 'key'), false);
  /* without Polaris Cam: nothing to ask, and no error */
  await leave(R, p); NOW += 2000; await send(R, a, JSON.stringify({ t: 'key', cam: 0 }));
});

await test('H.264 <-> JPEG on the same camera: what is kept and each page\'s flow follow the codec, nothing left over', async () => {
  const R = mkRelay(), t = (await state(R, 'dir')).token, p = await pubJoin(R, t), a = await viewer(R, 'dir');
  for (let s = 1; s <= 10; s++) await send(R, p, frame({ seq: s }));          /* JPEG, unacked: a is paused at 8 */
  assert.equal(a.bins().length, 8); assert.equal(R.relay.last[0].seq, 10);
  /* it says camera 1 is H.264 now: the JPEG kept of it goes */
  await send(R, p, JSON.stringify({ t: 'hello', v: '2.0.0', mode: 'jpeg', cams: [{ i: 0, name: 'Cockpit', codec: 'h264' }] }));
  assert.equal(R.relay.last[0], null);
  assert.equal(lastOf(a, 'pub').pub.cams[0].codec, 'h264');
  /* its first frame is a P frame: not sent (the flow starts afresh, waiting for a key frame), a key frame asked for */
  await send(R, p, h264({ seq: 11 }));
  assert.equal(a.bins().length, 8); assert.deepEqual(keysTo(p), [{ t: 'key', cam: 0 }]);
  await send(R, p, h264({ key: true, seq: 12 })); await send(R, p, h264({ seq: 13 }));
  assert.deepEqual(a.bins().slice(8).map(seqOf), [12, 13]);                    /* the JPEG pause is not carried over */
  assert.deepEqual(R.relay.flow.get(a)[0].ring, [12, 13]); assert.equal(R.relay.flow.get(a)[0].codec, 2);
  assert.deepEqual(R.relay.gop[0].frames.map((f) => f.seq), [12, 13]); assert.equal(R.relay.last[0], null);
  const late = await viewer(R, 'view'); assert.deepEqual(late.bins().map(seqOf), [12, 13]);
  /* back to JPEG (without a hello first): the GOP goes, the latest JPEG is kept, every page gets it */
  await send(R, p, frame({ seq: 14 }));
  assert.equal(R.relay.gop[0], null); assert.equal(R.relay.last[0].seq, 14);
  assert.equal(seqOf(a.bins().pop()), 14); assert.equal(seqOf(late.bins().pop()), 14);
  assert.deepEqual(R.relay.flow.get(a)[0].ring, [14]); assert.equal(R.relay.flow.get(a)[0].codec, 1);
  const late2 = await viewer(R, 'view'); assert.deepEqual(late2.bins().map(seqOf), [14]);
  /* a hello saying JPEG drops a GOP kept */
  await send(R, p, h264({ key: true, seq: 15 })); assert.ok(R.relay.gop[0]);
  await send(R, p, JSON.stringify({ t: 'hello', mode: 'jpeg', cams: [{ i: 0 }] })); assert.equal(R.relay.gop[0], null);
  /* Polaris Cam comes back: nothing kept from before */
  await send(R, p, h264({ key: true, seq: 16 }));
  const p2 = await pubJoin(R, t); assert.deepEqual(R.relay.gop, [null, null, null, null]); assert.deepEqual(R.relay.last, [null, null, null, null]);
  assert.equal(R.relay.flow.size, 0); assert.equal(p2.closed, null);
});

/* ---- 7. the admin page's player (admin.js), run here with WebCodecs stood in for ---- */
const { ADMIN_HTML } = await import('../src/admin.js');
const camSrc = (() => {
  const a = ADMIN_HTML.indexOf('/* Polaris Cam (cam.js): its cockpit cameras'), b = ADMIN_HTML.indexOf('async function camTok(t)');
  assert.ok(a > 0 && b > a, 'the Polaris Cam player in admin.js');
  return ADMIN_HTML.slice(a, b) + '\n;globalThis.__cam={CAM,camFrame,camIn,camAvcCodec,camBlank,camClose,camTick,camAck,camUi};';
})();
function mkPage({ wc = true } = {}) {
  const vm = globalThis.__vm, st = { made: 0, closed: 0, decs: [], raf: [], T: 1000 };
  class VideoFrame { constructor(ts) { this.timestamp = ts; this.displayWidth = 960; this.displayHeight = 540; this.done = false; st.made++; } close() { if (!this.done) { this.done = true; st.closed++; } } }
  class VideoDecoder {
    constructor({ output, error }) { this.output = output; this.error = error; this.state = 'unconfigured'; this.decodeQueueSize = 0; this.chunks = []; st.decs.push(this); }
    configure(c) { if (this.state === 'closed') throw new Error('closed'); this.config = c; this.state = 'configured'; }
    decode(ch) { if (this.state !== 'configured') throw new Error('not configured'); this.chunks.push(ch); this.output(new VideoFrame(ch.timestamp)); }
    close() { this.state = 'closed'; }
  }
  class EncodedVideoChunk { constructor(o) { this.type = o.type; this.timestamp = o.timestamp; this.data = o.data; } }
  const mkCell = () => {
    const canvas = { hidden: true, width: 0, height: 0, draws: 0, getContext() { return { drawImage: () => { canvas.draws++; } }; } };
    const span = { textContent: '' }, em = { textContent: '' }, cap = { querySelector: (s) => (s === 'span' ? span : em) }, ph = { hidden: false, textContent: '' };
    return { canvas, em, ph, classList: { toggle() {} }, setAttribute() {}, querySelector: (s) => (s === 'canvas' ? canvas : s === '.bc-cap' ? cap : s === '.bc-ph' ? ph : null) };
  };
  const cells = [mkCell(), mkCell(), mkCell(), mkCell()], els = { '#bcCamG': { classList: { toggle() {} } }, '#bcCamSt': { innerHTML: '' }, '#bcCamW': { hidden: true }, '#bcCamUrl': { value: '' } };
  const ws = { readyState: 1, sent: [], send(m) { this.sent.push(m); }, close() {}, texts() { return this.sent.map((m) => JSON.parse(m)); } };
  const document = { hidden: false, querySelector(s) { const m = /data-camc="(\d)"/.exec(s); return m ? cells[+m[1]] : null; } };
  const g = {
    document, $: (s) => els[s], esc: (s) => String(s), location: { origin: ORIGIN, protocol: 'https:', host: 'efb-api.example' }, Date, Blob, URL, console,
    performance: { now: () => st.T }, requestAnimationFrame: (cb) => { st.raf.push(cb); return st.raf.length; },
    createImageBitmap: async () => ({ width: 960, height: 540, close() {} }), setTimeout, clearTimeout,
    ...(wc ? { VideoDecoder, EncodedVideoChunk, VideoFrame } : {}),
  };
  vm.createContext(g); vm.runInContext(camSrc, g);
  const P = g.__cam; P.CAM.ws = ws;
  P.camIn({ t: 'hello', role: 'view', pub: { on: true, v: '2.0.0', mode: 'h264', cams: [{ i: 0, name: 'Cockpit', on: true, w: 960, h: 540, codec: 'h264' }] }, watchers: 1 });
  /* a screen refresh, `ms` later */
  const tick = (ms = 16) => { st.T += ms; const L = st.raf.splice(0); for (const cb of L) cb(st.T); };
  return { P, st, ws, cells, document, tick, g };
}
globalThis.__vm = await import('node:vm');

await test('admin player: camAvcCodec reads profile, constraints and level from the SPS (High 3.1, High 4.0, Main, Baseline), or falls back by width', async () => {
  const { P } = mkPage();
  const C = (a, w = 960) => P.camAvcCodec(Uint8Array.from(a), w);
  assert.equal(C([...SPS, ...PPS, 0, 0, 0, 1, 0x65, 0x88]), 'avc1.64001f');
  assert.equal(C([0, 0, 0, 1, 0x67, 0x64, 0x00, 0x28, 0xac, 0xd9, 0x40, 0x78, 0x02, 0x27, 0xe5, 0, 0, 0, 1, 0x68, 0xeb, 0, 0, 1, 0x65, 0x88]), 'avc1.640028');
  assert.equal(C([0, 0, 0, 1, 0x09, 0xf0, 0, 0, 1, 0x67, 0x4d, 0x40, 0x29, 0x95, 0xa0, 0x1e]), 'avc1.4d4029');   /* after an AUD, 3-byte start code */
  assert.equal(C([0, 0, 1, 0x27, 0x42, 0xc0, 0x1e, 0x8c, 0x8d]), 'avc1.42c01e');                               /* nal_ref_idc 1 */
  assert.equal(C([0, 0, 0, 1, 0x65, 0x88, 0x84, 0, 0]), 'avc1.64001f');                                        /* no SPS: by width */
  assert.equal(C([0, 0, 0, 1, 0x65, 0x88, 0x84, 0, 0], 1920), 'avc1.640028');
  assert.equal(C([0, 0, 0, 1, 0x67, 0x64]), 'avc1.64001f');                                                    /* cut short */
  assert.equal(C([]), 'avc1.64001f');
});

await test('admin player: H.264 is decoded with WebCodecs (Annex-B, no description), drawn smoothly, every VideoFrame closed; an error resets it and asks for a key frame; JPEG and leaving close everything', async () => {
  const { P, st, ws, cells, document, tick } = mkPage();
  const c = P.CAM.c[0], keys = () => ws.texts().filter((m) => m.t === 'key'), acks = () => ws.texts().filter((m) => m.t === 'ack');
  /* a P frame first: nothing to decode, a key frame asked for (once a second at most) */
  P.camFrame(h264({ seq: 1 })); P.camFrame(h264({ seq: 2 }));
  assert.equal(st.decs.length, 0); assert.deepEqual(keys(), [{ t: 'key', cam: 0 }]);
  /* the key frame: a decoder, configured from its SPS */
  P.camFrame(h264({ key: true, seq: 3 }));
  assert.equal(st.decs.length, 1);
  const d0 = st.decs[0];
  assert.deepEqual({ ...d0.config }, { codec: 'avc1.64001f', optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware' });
  assert.equal('description' in d0.config, false);
  assert.equal(d0.chunks[0].type, 'key'); assert.equal(d0.chunks[0].data[4], 0x67);   /* the picture, without the header */
  for (let s = 4; s <= 12; s++) P.camFrame(h264({ seq: s, dur: s < 8 ? 33 : 0 }));
  assert.deepEqual(d0.chunks.map((x) => x.type), ['key', ...Array(9).fill('delta')]);
  const ts = d0.chunks.map((x) => x.timestamp);
  assert.ok(ts.every((x, i) => i === 0 || x - ts[i - 1] === 33000), String(ts));      /* duration_ms (0: 33) */
  /* acks: after 8 frames at once */
  assert.ok(acks().length >= 1); assert.equal(acks()[0].cam, 0);
  /* the first frame is drawn at once, then at the stream's pace */
  tick(); assert.equal(cells[0].canvas.draws, 1); assert.equal(cells[0].canvas.hidden, false);
  assert.equal(st.closed, 1);
  for (let i = 0; i < 40; i++) tick(16);
  assert.ok(cells[0].canvas.draws > 5 && cells[0].canvas.draws <= 10, String(cells[0].canvas.draws));
  /* a burst with no screen refresh: at most 24 wait, the rest closed */
  for (let s = 13; s <= 80; s++) { P.camFrame(h264({ seq: s })); assert.ok(c.q.length <= 24); }
  assert.equal(st.made - st.closed, c.q.length);
  /* far behind (over 0.65 s waiting): the oldest are dropped and closed */
  tick(16); assert.ok((c.q[c.q.length - 1].ts - c.q[0].ts) / 1000 <= 650);
  assert.equal(st.made - st.closed, c.q.length);
  /* the caption says what it is */
  P.camUi(); assert.match(cells[0].em.textContent, /^H\.264 · 960 × 540/);
  /* a hidden page keeps none */
  document.hidden = true; P.camFrame(h264({ seq: 81 })); assert.equal(c.q.length, 0); document.hidden = false;
  assert.equal(st.made, st.closed);
  /* the decoder fails: closed, its frames closed, a key frame asked for at once; P frames wait for it */
  P.camFrame(h264({ seq: 82 })); P.camFrame(h264({ seq: 83 })); assert.ok(c.q.length > 0);
  const nk = keys().length; d0.error(new Error('decode'));
  assert.equal(d0.state, 'closed'); assert.equal(c.dec, null); assert.equal(c.q.length, 0); assert.equal(c.needKey, true);
  assert.equal(keys().length, nk + 1); assert.equal(st.made, st.closed);
  P.camFrame(h264({ seq: 84 })); assert.equal(st.decs.length, 1);
  P.camFrame(h264({ key: true, seq: 85, w: 1920, h: 1080 })); assert.equal(st.decs.length, 2);
  assert.equal(st.decs[1].config.codec, 'avc1.64001f');                          /* from the SPS, not the width */
  /* decode() throwing does the same */
  st.decs[1].decode = () => { throw new Error('boom'); };
  P.camFrame(h264({ seq: 86, w: 1920, h: 1080 })); assert.equal(c.dec, null); assert.equal(c.needKey, true);
  P.camFrame(h264({ key: true, seq: 87, w: 1920, h: 1080 })); P.camFrame(h264({ seq: 88, w: 1920, h: 1080 }));
  assert.equal(st.decs.length, 3); assert.ok(c.q.length >= 1);
  /* back to JPEG: the decoder and its frames go at once, the JPEG is drawn as in Stage 1 */
  P.camFrame(frame({ seq: 89 }));
  assert.equal(st.decs[2].state, 'closed'); assert.equal(c.dec, null); assert.equal(c.q.length, 0); assert.equal(c.codec, 1);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cells[0].canvas.width, 960); P.camUi(); assert.match(cells[0].em.textContent, /^JPEG/);
  /* H.264 again on two cameras, then the page leaves: every decoder closed, every frame closed */
  P.camFrame(h264({ key: true, seq: 90 })); P.camFrame(h264({ cam: 1, key: true, seq: 1 })); P.camFrame(h264({ cam: 1, seq: 2 }));
  assert.ok(P.CAM.c[1].q.length > 0);
  P.camClose();
  assert.ok(st.decs.every((d) => d.state === 'closed')); assert.ok(P.CAM.c.every((x) => !x.dec && !x.q.length));
  assert.equal(st.made, st.closed);
});

await test('admin player: Polaris Cam going offline (and camBlank) closes all four decoders; a browser without WebCodecs says so and does not fail', async () => {
  const { P, st } = mkPage();
  for (let i = 0; i < 4; i++) { P.camFrame(h264({ cam: i, key: true, seq: 1 })); P.camFrame(h264({ cam: i, seq: 2 })); }
  assert.equal(st.decs.length, 4);
  P.camIn({ t: 'pub', pub: { on: false, cams: [] }, watchers: 1 });
  assert.ok(st.decs.every((d) => d.state === 'closed')); assert.equal(st.made, st.closed);
  const N = mkPage({ wc: false });
  assert.doesNotThrow(() => { N.P.camFrame(h264({ key: true, seq: 1 })); N.P.camFrame(h264({ seq: 2 })); });
  N.P.camUi();
  assert.equal(N.cells[0].ph.hidden, false); assert.equal(N.cells[0].ph.textContent, 'H.264 needs Chrome or Edge');
  assert.match(N.cells[0].em.textContent, /^H\.264/);
  /* and JPEG still works there */
  N.P.camFrame(frame({ seq: 3 })); await new Promise((r) => setTimeout(r, 10));
  assert.equal(N.cells[0].canvas.hidden, false); N.P.camUi(); assert.equal(N.cells[0].ph.hidden, true);
});

globalThis.fetch = realFetch; Date.now = realNow;
console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ', all passed'));
