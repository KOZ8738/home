/* Polaris Cam relay (src/cam.js), its admin routes (src/mail.js) and the admin page's players (src/admin.js: Broadcast,
   Flight Watch): plain Node 22, no npm packages.
     node workers/polaris-efb-api/test/cam.test.mjs
   The Workers runtime is stood in for here: WebSocketPair, a Response that takes status 101, the Durable Object's
   ctx (WebSockets with tags, storage), Cloudflare Access's keys (a key made here signs the test sign-ins), KV; and
   for several channels at once (Broadcast's 'cam' and each 'pilot:<ID>'), a namespace of objects with their own
   storage, which can be taken out of memory and woken again (hibernation). */
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

const { CamRelay, camAdmin, camPublic, frameIn, helloIn, CAM_GONE, CAM_TICKET, normPilot, pilotOk, onlineIn } = await import('../src/cam.js');
const { mailAdmin } = await import('../src/mail.js');
const { navWsTicket, wsTicket } = await import('../src/auth.js');

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
  people: { 'dir@p.test': { role: 'director' }, 'watch@p.test': { role: 'watcher' }, 'ops@p.test': { role: 'nobc' },
    'fw@p.test': { role: 'fwonly' }, 'fwdir@p.test': { role: 'fwdir' }, 'cal@p.test': { role: 'calonly' }, 'adm@p.test': { role: 'admin' } },
  roles: { director: { name: 'Director', pages: ['bc'], can: ['live'] }, watcher: { name: 'Watcher', pages: ['bc'], can: [] }, nobc: { name: 'Ops', pages: ['fw'], can: ['msg'] },
    fwonly: { name: 'Flight Watch', pages: ['fw'], can: [] }, fwdir: { name: 'Flight Watch lead', pages: ['fw'], can: ['live'] }, calonly: { name: 'Calendar', pages: ['cal'], can: ['cal'] } },
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
  /* st.hold: the decoder keeps what it is given (decodeQueueSize grows) until flush(), as a busy real one does */
  const vm = globalThis.__vm, st = { made: 0, closed: 0, decs: [], raf: [], T: 1000, hold: false };
  class VideoFrame { constructor(ts) { this.timestamp = ts; this.displayWidth = 960; this.displayHeight = 540; this.done = false; st.made++; } close() { if (!this.done) { this.done = true; st.closed++; } } }
  class VideoDecoder {
    constructor({ output, error }) { this.output = output; this.error = error; this.state = 'unconfigured'; this.decodeQueueSize = 0; this.chunks = []; st.decs.push(this); }
    configure(c) { if (this.state === 'closed') throw new Error('closed'); this.config = c; this.state = 'configured'; }
    decode(ch) { if (this.state !== 'configured') throw new Error('not configured'); this.chunks.push(ch); if (st.hold) this.decodeQueueSize++; else this.output(new VideoFrame(ch.timestamp)); }
    flush() { const L = this.chunks.slice(this.chunks.length - this.decodeQueueSize); this.decodeQueueSize = 0; for (const ch of L) if (this.state === 'configured') this.output(new VideoFrame(ch.timestamp)); }
    close() { this.state = 'closed'; this.decodeQueueSize = 0; }
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

await test('admin player: a whole GOP replayed at once (75 frames queued in the decoder) is not taken for a stuck decoder; past 90 it is', async () => {
  const { P, st, ws } = mkPage();
  const c = P.CAM.c[0], keys = () => ws.texts().filter((m) => m.t === 'key');
  st.hold = true;
  P.camFrame(h264({ key: true, seq: 1 })); for (let s = 2; s <= 75; s++) P.camFrame(h264({ seq: s }));
  const d = st.decs[0];
  assert.equal(st.decs.length, 1); assert.equal(c.dec, d); assert.equal(d.decodeQueueSize, 75); assert.equal(keys().length, 0);
  st.hold = false; d.flush();
  assert.equal(d.chunks.length, 75); assert.equal(c.needKey, false); assert.ok(c.q.length > 0 && c.q.length <= 24);
  /* a decoder that really is stuck: reset, and a key frame asked for */
  st.hold = true; for (let s = 76; s <= 166; s++) P.camFrame(h264({ seq: s }));
  assert.equal(d.decodeQueueSize, 91); assert.equal(c.dec, d);
  P.camFrame(h264({ seq: 167 }));
  assert.equal(d.state, 'closed'); assert.equal(c.dec, null); assert.equal(c.needKey, true); assert.equal(keys().length, 1);
  assert.equal(st.made, st.closed);
});

await test('admin player: when Polaris Cam says a camera is now JPEG, off or gone, its decoder and frames are closed at once', async () => {
  const { P, st } = mkPage();
  for (let i = 0; i < 4; i++) { P.camFrame(h264({ cam: i, key: true, seq: 1 })); P.camFrame(h264({ cam: i, seq: 2 })); }
  const cams = (over) => [0, 1, 2, 3].map((i) => ({ i, name: 'Cam ' + i, on: true, w: 960, h: 540, codec: 'h264', ...(over[i] || {}) }));
  /* a pub with the cameras as they were: nothing changes */
  P.camIn({ t: 'pub', pub: { on: true, mode: 'h264', cams: cams({}) }, watchers: 1 });
  assert.ok(st.decs.every((d) => d.state === 'configured'));
  /* camera 1 to JPEG, camera 2 off, camera 3 gone from the list; camera 0 stays H.264 */
  P.camIn({ t: 'pub', pub: { on: true, mode: 'h264', cams: cams({ 1: { codec: 'jpeg' }, 2: { on: false } }).slice(0, 3) }, watchers: 1 });
  assert.equal(st.decs[0].state, 'configured'); assert.equal(P.CAM.c[0].dec, st.decs[0]); assert.ok(P.CAM.c[0].q.length > 0);
  for (const i of [1, 2, 3]) { assert.equal(st.decs[i].state, 'closed', 'cam ' + i); assert.equal(P.CAM.c[i].dec, null); assert.equal(P.CAM.c[i].q.length, 0); assert.equal(P.CAM.c[i].needKey, true); }
  assert.equal(st.made - st.closed, P.CAM.c[0].q.length);
  /* a pub that lists no cameras yet (before its hello) leaves camera 0 alone; the top-level mode counts when a camera has no codec */
  P.camIn({ t: 'pub', pub: { on: true, mode: 'h264', cams: [] }, watchers: 1 }); assert.equal(st.decs[0].state, 'configured');
  P.camIn({ t: 'pub', pub: { on: true, mode: 'h264', cams: [{ i: 0, on: true }] }, watchers: 1 }); assert.equal(st.decs[0].state, 'configured');
  P.camIn({ t: 'pub', pub: { on: true, mode: 'jpeg', cams: [{ i: 0, on: true }] }, watchers: 1 }); assert.equal(st.decs[0].state, 'closed');
  assert.equal(st.made, st.closed);
});

/* ---- 8. several channels: Broadcast's own ('cam') and each pilot's ('pilot:<ID>'), one object each ---- */
function mkCluster() {
  const objs = new Map(), pending = [];
  const env = { SESSION_KEY: 'polaris-cam-test-session-key' };
  const obj = (id) => {
    let o = objs.get(id);
    if (!o) { const ctx = mkCtx(); ctx.waitUntil = (p) => { pending.push(p); }; o = { ctx, relay: new CamRelay(ctx, env) }; objs.set(id, o); }
    return o;
  };
  env.CAM = { idFromName: (n) => 'id:' + n, get: (id) => ({ fetch: (input, init) => obj(id).relay.fetch(input instanceof Request ? input : new Request(input, init)) }) };
  return {
    env, objs, of: (name) => obj('id:' + name),
    has: (name) => objs.has('id:' + name),
    /* what the objects were told to do in the background (the list of who is online), done */
    async settle() { while (pending.length) await pending.shift(); },
    /* the object leaves memory and is woken again: the same storage and sockets (and what is kept with them), nothing else */
    hibernate(name) { const o = obj('id:' + name); o.relay = new CamRelay(o.ctx, env); return o.relay; },
  };
}
const LIVE = 'https://efb-api.example';
async function pubAt(C, path) { const r = await camPublic(up(LIVE + path), new URL(LIVE + path), C.env); assert.equal(r.status, 101); return r.webSocket.peer; }
const ticketJoin = (C, ticket) => pubAt(C, '/live/cam/pilot/ws' + (ticket == null ? '' : '?ticket=' + encodeURIComponent(ticket)));
const navJoin = async (C, u) => ticketJoin(C, await navWsTicket(C.env, u));
const linkJoin = (C, pilot, token) => pubAt(C, '/live/cam/p/' + pilot + '/' + token + '/ws');
const bcJoin = (C, token) => pubAt(C, '/live/cam/' + token + '/ws');
const chan = (pilot) => (pilot ? 'pilot:' + pilot : 'cam');
async function stateAt(C, pilot, role = 'dir') { return (await C.of(chan(pilot)).relay.fetch(new Request('https://cam/state?role=' + role + (pilot ? '&pilot=' + pilot : '')))).json(); }
async function viewerAt(C, pilot, role = 'view') { const r = await C.of(chan(pilot)).relay.fetch(up('https://cam/ws?role=' + role + (pilot ? '&pilot=' + pilot : ''))); assert.equal(r.status, 101); return r.webSocket.peer; }
const sendAt = (C, pilot, ws, m) => C.of(chan(pilot)).relay.webSocketMessage(ws, m);
async function leaveAt(C, pilot, ws, code = 1000) { ws.readyState = 3; await C.of(chan(pilot)).relay.webSocketClose(ws, code, '', true); }
async function rotateAt(C, pilot) { return (await C.of(chan(pilot)).relay.fetch(new Request('https://cam/token' + (pilot ? '?pilot=' + pilot : ''), { method: 'POST', body: JSON.stringify({ who: 't@p.test' }) }))).json(); }
async function onlineNow(C) { await C.settle(); const u = new URL(ORIGIN + '/admin/api/cam/online'); return (await (await camAdmin(new Request(u), u, C.env, 'x@p.test', false, false)).json()).online; }

await test('pilot IDs: normPilot trims and upper-cases 2-16 letters and digits; anything else is not one', async () => {
  assert.equal(normPilot(' paw0006 '), 'PAW0006'); assert.equal(normPilot('AB'), 'AB'); assert.equal(normPilot('A'.repeat(16)), 'A'.repeat(16));
  for (const bad of ['', 'A', 'A'.repeat(17), 'PAW-0006', 'PAW 0006', 'PAW_06', 'pilot:PAW', null, undefined, {}, 'ＰＡＷ０６']) assert.equal(normPilot(bad), '', String(bad));
  assert.equal(pilotOk('paw0012'), true); assert.equal(pilotOk('x'), false);
});

await test('pilot channel, signed in by Polaris Navdata: a good ticket joins pilot:<ID>, which says { t:"id" } then { t:"watch" }; a missing, wrong, other-kind or old ticket is closed 4001', async () => {
  const C = mkCluster();
  const p = await navJoin(C, 'paw0006');
  assert.equal(p.closed, null); assert.deepEqual(p.tags, ['pub']);
  assert.deepEqual(p.texts().slice(0, 2), [{ t: 'id', pilot: 'PAW0006' }, { t: 'watch', n: 0 }]);
  assert.equal(p.att.pilot, 'PAW0006'); assert.equal(p.att.auth, 'ticket');
  assert.equal(C.of('pilot:PAW0006').relay.pilot, 'PAW0006');
  /* its own channel, not Broadcast's: no PC there */
  assert.equal((await stateAt(C, 'PAW0006', 'view')).pub.on, true);
  assert.equal((await stateAt(C, '', 'view')).pub.on, false);
  const v = await viewerAt(C, 'PAW0006'); assert.deepEqual(lastOf(p, 'watch'), { t: 'watch', n: 1 });
  assert.equal(v.texts()[0].pub.on, true);
  /* turned away, closed 4001 (so Polaris Cam asks Navdata for a new ticket) */
  const bad = [null, '', 'nope', 'wn.e30.AAAA', await wsTicket(C.env, 'PAW0006'), await navWsTicket({ SESSION_KEY: 'another-key' }, 'PAW0006'),
    await navWsTicket(C.env, 'A'), await navWsTicket(C.env, 'PAW-0006'), await navWsTicket(C.env, 'X'.repeat(17))];
  for (const t of bad) { const b = await ticketJoin(C, t); assert.deepEqual(b.closed, { code: 4001, reason: CAM_TICKET }, String(t)); }
  assert.equal(CAM_TICKET, 'Polaris Cam ticket expired or invalid');
  const old = await navWsTicket(C.env, 'PAW0006'); NOW += 61000;
  assert.equal((await ticketJoin(C, old)).closed.code, 4001);
  assert.equal(p.closed, null);                                         /* none of them touched the one connected */
  /* not a WebSocket: 426; no Durable Object: 503 */
  const u = LIVE + '/live/cam/pilot/ws?ticket=x';
  assert.equal((await camPublic(new Request(u), new URL(u), C.env)).status, 426);
  assert.equal((await camPublic(up(u), new URL(u), { SESSION_KEY: 'k' })).status, 503);
  /* the route: all three forms go to camPublic, and "pilot" is never a token of Broadcast's */
  const src = (await import('node:fs')).readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const re = new RegExp(/if \(\/(\^\\\/live\\\/cam\\\/.*?)\/\.test\(new URL\(req\.url\)\.pathname\)\) \{ try \{ return await camPublic/.exec(src)[1]);
  for (const ok of ['/live/cam/pilot/ws', '/live/cam/pilot/ws/', '/live/cam/p/PAW0006/' + 'a'.repeat(32) + '/ws', '/live/cam/' + 'a'.repeat(32) + '/ws']) assert.ok(re.test(ok), ok);
  for (const no of ['/live/cam/pilot', '/live/cam/p/PAW0006/ws/x', '/live/cam//ws', '/live/camx/a/ws']) assert.equal(re.test(no), false, no);
  const viaToken = await camPublic(up(LIVE + '/live/cam/pilot/ws'), new URL(LIVE + '/live/cam/pilot/ws'), C.env);
  assert.equal(viaToken.webSocket.peer.closed.code, 4001);              /* not 4004: it was not taken for a Broadcast link */
});

await test('several pilots at once: PAW0006 and PAW0012 do not take over from each other; pictures, hellos and watch counts stay on their own channel; a second PAW0006 takes over only PAW0006 (4000)', async () => {
  const C = mkCluster();
  const a = await navJoin(C, 'PAW0006'), b = await navJoin(C, 'PAW0012');
  assert.equal(a.closed, null); assert.equal(b.closed, null);
  const va = await viewerAt(C, 'PAW0006'), vb = await viewerAt(C, 'PAW0012'), vb2 = await viewerAt(C, 'PAW0012', 'dir');
  assert.equal(lastOf(a, 'watch').n, 1); assert.equal(lastOf(b, 'watch').n, 2);
  await sendAt(C, 'PAW0006', a, frame({ cam: 0, seq: 1 })); await sendAt(C, 'PAW0012', b, frame({ cam: 1, seq: 7 }));
  await sendAt(C, 'PAW0012', b, h264({ cam: 2, key: true, seq: 8 }));
  assert.deepEqual(va.bins().map(seqOf), [1]); assert.deepEqual(vb.bins().map(seqOf), [7, 8]); assert.deepEqual(vb2.bins().map(seqOf), [7, 8]);
  await sendAt(C, 'PAW0006', a, JSON.stringify({ t: 'hello', v: '2.1.0', mode: 'h264', cams: [{ i: 0, name: 'Cockpit' }] }));
  assert.equal(lastOf(va, 'pub').pub.v, '2.1.0');
  assert.equal([...vb.texts(), ...vb2.texts()].some((m) => m.pub && m.pub.v === '2.1.0'), false);
  /* a page leaving PAW0012 changes only PAW0012's count */
  await leaveAt(C, 'PAW0012', vb); assert.equal(lastOf(b, 'watch').n, 1); assert.equal(lastOf(a, 'watch').n, 1);
  /* a second PC for PAW0006: only the old PAW0006 goes */
  const a2 = await navJoin(C, 'PAW0006');
  assert.deepEqual(a.closed, { code: 4000, reason: 'Another Polaris Cam took over' });
  assert.equal(b.closed, null); assert.equal(a2.closed, null);
  assert.deepEqual(a2.texts().slice(0, 2), [{ t: 'id', pilot: 'PAW0006' }, { t: 'watch', n: 1 }]);
  await leaveAt(C, 'PAW0006', a, 4000); assert.equal((await stateAt(C, 'PAW0006', 'view')).pub.on, true);
  /* Broadcast's own channel: a PC there takes over no pilot, and its pages see neither pilot's pictures */
  const m = await bcJoin(C, (await stateAt(C, '', 'dir')).token), vm2 = await viewerAt(C, '');
  assert.equal(m.closed, null); assert.equal(a2.closed, null); assert.equal(b.closed, null);
  assert.equal(m.texts().some((x) => x.t === 'id'), false);             /* Broadcast's own channel has no pilot to say */
  await sendAt(C, 'PAW0006', a2, frame({ seq: 50 })); await sendAt(C, 'PAW0012', b, frame({ seq: 60 }));
  assert.equal(vm2.bins().length, 0); assert.deepEqual(va.bins().map(seqOf), [1, 50]);
  await sendAt(C, '', m, frame({ seq: 70 })); assert.deepEqual(vm2.bins().map(seqOf), [70]); assert.equal(va.bins().length, 2);
});

await test('a pilot\'s own link /live/cam/p/<ID>/<token>/ws: its channel\'s own token (not Broadcast\'s, not another pilot\'s), a new one apart from Broadcast\'s; a wrong one is closed 4004, and a new link never stops a PC signed in with Navdata', async () => {
  const C = mkCluster();
  const tok = (await stateAt(C, 'PAW0006')).token, bc = (await stateAt(C, '')).token, tok12 = (await stateAt(C, 'PAW0012')).token;
  assert.match(tok, /^[A-Za-z0-9_-]{24,40}$/); assert.notEqual(tok, bc); assert.notEqual(tok, tok12);
  assert.equal((await stateAt(C, 'PAW0006', 'view')).token, undefined);
  const p = await linkJoin(C, 'paw0006', tok);                          /* the ID is read as upper case */
  assert.equal(p.closed, null); assert.deepEqual(p.texts().slice(0, 2), [{ t: 'id', pilot: 'PAW0006' }, { t: 'watch', n: 0 }]); assert.equal(p.att.auth, 'token');
  for (const [pilot, t] of [['PAW0006', bc], ['PAW0006', tok12], ['PAW0012', tok], ['PAW0006', 'x'.repeat(30)], ['PAW-06', tok], ['A', tok]]) assert.deepEqual((await linkJoin(C, pilot, t)).closed, { code: 4004, reason: CAM_GONE }, pilot + ' ' + t);
  assert.equal((await bcJoin(C, tok)).closed.code, 4004);              /* a pilot's token is not Broadcast's link */
  assert.equal(p.closed, null);
  /* a new link for PAW0006: that PC stops (4004), the old link no longer works, Broadcast's and PAW0012's are as they were */
  const d = await viewerAt(C, 'PAW0006', 'dir'), w = await viewerAt(C, 'PAW0006', 'view'), dbc = await viewerAt(C, '', 'dir');
  const j = await rotateAt(C, 'PAW0006');
  assert.notEqual(j.token, tok); assert.equal(j.pub.on, false); assert.deepEqual(p.closed, { code: 4004, reason: CAM_GONE });
  assert.deepEqual(lastOf(d, 'token'), { t: 'token', token: j.token }); assert.equal(JSON.stringify(w.texts()).includes(j.token), false);
  assert.equal(dbc.texts().some((m) => m.t === 'token'), false);
  assert.equal((await stateAt(C, '')).token, bc); assert.equal((await stateAt(C, 'PAW0012')).token, tok12);
  assert.equal((await linkJoin(C, 'PAW0006', tok)).closed.code, 4004);
  const p2 = await linkJoin(C, 'PAW0006', j.token); assert.equal(p2.closed, null);
  /* and Broadcast's new link leaves the pilots' alone */
  const nb = await rotateAt(C, ''); assert.notEqual(nb.token, bc); assert.equal(p2.closed, null); assert.equal((await stateAt(C, 'PAW0006')).token, j.token);
  /* a PC signed in by Navdata on PAW0012 is not a link's: a new PAW0012 link does not stop it */
  const n = await navJoin(C, 'PAW0012'); const j12 = await rotateAt(C, 'PAW0012');
  assert.notEqual(j12.token, tok12); assert.equal(n.closed, null); assert.equal(j12.pub.on, true);
  /* the ticket is checked only for /live/cam/pilot/ws: auth=ticket is no way round a link, nor a way onto Broadcast's channel */
  const R = mkRelay(); await state(R, 'dir');
  const sneak = await join(R, 'https://cam/pub?auth=ticket'); assert.equal(sneak.closed.code, 4004);
  const sneak2 = await C.of('cam').relay.fetch(up('https://cam/pub?auth=ticket&pilot=')); assert.equal(sneak2.webSocket.peer.closed.code, 4004);
  /* not a WebSocket: 426 */
  const u = LIVE + '/live/cam/p/PAW0006/' + j.token + '/ws'; assert.equal((await camPublic(new Request(u), new URL(u), C.env)).status, 426);
});

await test('who is online (GET /admin/api/cam/online): on as a PC connects, its hello, off as it goes (also after the objects were away from memory); written only then; a wrong entry is put right when a page opens that channel', async () => {
  const C = mkCluster();
  assert.deepEqual(await onlineNow(C), {});
  let writes = 0; const put = C.of('cam').ctx.storage.put; C.of('cam').ctx.storage.put = async (k, v) => { if (k === 'online') writes++; return put(k, v); };
  const a = await navJoin(C, 'PAW0006'), at = NOW;
  let o = await onlineNow(C);
  assert.deepEqual(o, { PAW0006: { v: '', mode: 'jpeg', cams: [], at } }); assert.equal(writes, 1);
  await sendAt(C, 'PAW0006', a, JSON.stringify({ t: 'hello', v: '2.1.0', mode: 'h264', cams: [{ i: 0, name: 'Cockpit <1>', w: 1280, h: 720 }, { i: 2, name: 'Wing', codec: 'jpeg', on: false }] }));
  o = await onlineNow(C);
  assert.equal(o.PAW0006.v, '2.1.0'); assert.equal(o.PAW0006.mode, 'h264'); assert.equal(o.PAW0006.at, at);
  assert.deepEqual(o.PAW0006.cams.map((c) => [c.i, c.name, c.codec, c.on]), [[0, 'Cockpit 1', 'h264', true], [2, 'Wing', 'jpeg', false]]);
  assert.equal(writes, 2);
  /* pictures and pages change nothing kept */
  for (let s = 1; s <= 20; s++) await sendAt(C, 'PAW0006', a, frame({ seq: s }));
  const v = await viewerAt(C, 'PAW0006'); await leaveAt(C, 'PAW0006', v); await stateAt(C, 'PAW0006', 'view');
  await onlineNow(C); assert.equal(writes, 2);
  /* a second pilot by link, then the first one goes */
  const b = await linkJoin(C, 'PAW0012', (await stateAt(C, 'PAW0012')).token);
  assert.deepEqual(Object.keys(await onlineNow(C)).sort(), ['PAW0006', 'PAW0012']);
  await leaveAt(C, 'PAW0006', a);
  assert.deepEqual(Object.keys(await onlineNow(C)), ['PAW0012']);
  /* PAW0012's object leaves memory; its PC's socket closing wakes it: it still knows whose channel it is */
  const r12 = C.hibernate('pilot:PAW0012'); assert.equal(r12.pilot, '');
  b.readyState = 3; await r12.webSocketClose(b, 1006, '', false);
  assert.deepEqual(await onlineNow(C), {});
  /* the same for a hello after the object was away: listed under the right pilot, with when it connected */
  const c = await navJoin(C, 'PAW0020'), cAt = NOW; NOW += 5000;
  const r20 = C.hibernate('pilot:PAW0020');
  await r20.webSocketMessage(c, JSON.stringify({ t: 'hello', v: '3.0.0', mode: 'jpeg', cams: [{ i: 1, name: 'Overhead' }] }));
  o = await onlineNow(C); assert.equal(o.PAW0020.v, '3.0.0'); assert.equal(o.PAW0020.at, cAt); assert.equal(r20.pilot, 'PAW0020');
  /* Broadcast's own object leaves memory too: the list is read back from storage */
  C.hibernate('cam'); assert.deepEqual(Object.keys(await onlineNow(C)), ['PAW0020']);
  /* a PC on Broadcast's own channel is no pilot: not listed */
  await bcJoin(C, (await stateAt(C, '')).token); assert.deepEqual(Object.keys(await onlineNow(C)), ['PAW0020']);
  /* put right: an entry for a PC that went without a word ... */
  await C.of('cam').relay.fetch(new Request('https://cam/presence', { method: 'POST', body: JSON.stringify({ pilot: 'PAW0031', on: true, pub: { v: '1', mode: 'jpeg', cams: [], at: 1 } }) }));
  assert.ok('PAW0031' in await onlineNow(C));
  await viewerAt(C, 'PAW0031'); assert.equal('PAW0031' in await onlineNow(C), false);
  /* ... and one missing while its PC is on */
  await C.of('cam').relay.fetch(new Request('https://cam/presence', { method: 'POST', body: JSON.stringify({ pilot: 'PAW0020', on: false }) }));
  assert.equal('PAW0020' in await onlineNow(C), false);
  await viewerAt(C, 'PAW0020'); assert.equal((await onlineNow(C)).PAW0020.v, '3.0.0');
  /* nonsense is refused; a pilot's channel keeps no list */
  for (const body of [{}, { pilot: 'bad id', on: true }, 'x']) assert.equal((await C.of('cam').relay.fetch(new Request('https://cam/presence', { method: 'POST', body: JSON.stringify(body) }))).status, 400);
  assert.equal((await C.of('pilot:PAW0020').relay.fetch(new Request('https://cam/presence', { method: 'POST', body: JSON.stringify({ pilot: 'PAW0099', on: true }) }))).status, 404);
});

await test('who is online, as kept: malformed entries dropped, at most 200 (the latest seen); a lone relay without the namespace (no env.CAM) never fails', async () => {
  const C = mkCluster(), M = C.of('cam');
  M.ctx.store.set('online', { PAW0001: { v: '1.0', mode: 'h264', cams: [{ i: 9 }, { i: 0, name: 'A' }], at: 5, seen: 9 }, 'bad id': { at: 1 }, paw0002: { at: 1 }, PAW0003: 'x', PAW0004: [1], PAW0005: null, PAW0006: { at: -4, mode: 'vp9' } });
  C.hibernate('cam');
  const o = await onlineNow(C);
  assert.deepEqual(Object.keys(o).sort(), ['PAW0001', 'PAW0006']);
  assert.deepEqual(o.PAW0001, { v: '1.0', mode: 'h264', cams: [{ i: 0, name: 'A', on: true, w: 0, h: 0, codec: 'h264' }], at: 5 });
  assert.deepEqual(o.PAW0006, { v: '', mode: 'jpeg', cams: [], at: 0 });
  assert.equal('seen' in o.PAW0001, false);
  const many = {}; for (let i = 0; i < 250; i++) many['P' + String(i).padStart(4, '0')] = { at: i, seen: 1000 + i };
  assert.equal(Object.keys(onlineIn(many)).length, 200); assert.ok('P0249' in onlineIn(many)); assert.equal('P0049' in onlineIn(many), false);
  M.ctx.store.set('online', many); C.hibernate('cam');
  await C.of('cam').relay.fetch(new Request('https://cam/presence', { method: 'POST', body: JSON.stringify({ pilot: 'NEW1', on: true, pub: { at: 1 } }) }));
  const after = await onlineNow(C); assert.equal(Object.keys(after).length, 200); assert.ok('NEW1' in after); assert.equal(Object.keys(M.ctx.store.get('online')).length, 200);
  /* the single relay the older tests use: a pilot's channel there has nobody to tell, and says nothing */
  const R = mkRelay();
  const r = await R.relay.fetch(up('https://cam/pub?auth=ticket&pilot=PAW0006')); assert.equal(r.status, 101);
  assert.equal(r.webSocket.peer.closed, null); assert.equal(R.relay.presence(true), null);
  await leave(R, r.webSocket.peer); assert.equal((await state(R, 'view')).pub.on, false);
});

/* ---- 9. who may watch whom (mail.js -> camAdmin) ---- */
await test('roles: Flight Watch only (no Broadcast, no "live"): who is online, a pilot\'s state and pictures (no token); not Broadcast\'s own channel, no new link', async () => {
  const C = mkCluster(), ptok = (await stateAt(C, 'PAW0006')).token;
  await navJoin(C, 'PAW0006');
  for (const who of ['fw@p.test', 'ops@p.test']) {
    const on = await admin(C, who, '/admin/api/cam/online'); assert.equal(on.status, 200);
    assert.deepEqual(Object.keys((await on.json()).online), ['PAW0006']);
    const g = await admin(C, who, '/admin/api/cam?pilot=paw0006'); assert.equal(g.status, 200);
    const gj = await g.json(); assert.equal('token' in gj, false); assert.equal(gj.pub.on, true);
    const w = await admin(C, who, '/admin/api/cam/ws?pilot=PAW0006', { ws: true }); assert.equal(w.status, 101);
    const wv = w.webSocket.peer; assert.deepEqual(wv.tags, ['view']);
    const h = wv.texts()[0]; assert.equal(h.t, 'hello'); assert.equal(h.role, 'view'); assert.equal('token' in h, false); assert.equal(JSON.stringify(wv.texts()).includes(ptok), false);
    assert.equal((await admin(C, who, '/admin/api/cam')).status, 403);
    assert.equal((await admin(C, who, '/admin/api/cam?pilot=')).status, 403);   /* no pilot: Broadcast's own */
    assert.equal((await admin(C, who, '/admin/api/cam/ws', { ws: true })).status, 403);
    assert.equal((await admin(C, who, '/admin/api/cam', { method: 'POST', body: { op: 'token' } })).status, 403);
    assert.equal((await admin(C, who, '/admin/api/cam', { method: 'POST', body: { op: 'token', pilot: 'PAW0006' } })).status, 403);
    assert.equal((await admin(C, who, '/admin/api/cam?pilot=PAW-6')).status, 400);
    assert.equal((await admin(C, who, '/admin/api/cam/ws?pilot=x', { ws: true })).status, 400);
    assert.equal((await admin(C, who, '/admin/api/cam/ws?pilot=PAW0006', { ws: true, origin: 'https://evil.example' })).status, 403);
    assert.equal((await admin(C, who, '/admin/api/cam/ws?pilot=PAW0006')).status, 426);
  }
  assert.equal((await stateAt(C, 'PAW0006')).token, ptok);
  /* a role that sees neither page: nothing at all */
  for (const p of ['/admin/api/cam/online', '/admin/api/cam?pilot=PAW0006', '/admin/api/cam']) assert.equal((await admin(C, 'cal@p.test', p)).status, 403, p);
  assert.equal((await admin(C, 'cal@p.test', '/admin/api/cam/ws?pilot=PAW0006', { ws: true })).status, 403);
  assert.equal((await admin(C, 'stranger@p.test', '/admin/api/cam/online')).status, 403);
});

await test('roles: a Broadcast watcher (no "live"): Broadcast\'s own and any pilot\'s, read and live, never a token; no new link of either', async () => {
  const C = mkCluster(), btok = (await stateAt(C, '')).token, ptok = (await stateAt(C, 'PAW0006')).token;
  for (const [p, t] of [['/admin/api/cam', btok], ['/admin/api/cam?pilot=PAW0006', ptok]]) {
    const r = await admin(C, 'watch@p.test', p); assert.equal(r.status, 200); assert.equal('token' in (await r.json()), false);
    const w = await admin(C, 'watch@p.test', p.replace('/admin/api/cam', '/admin/api/cam/ws'), { ws: true }); assert.equal(w.status, 101);
    assert.equal(w.webSocket.peer.texts()[0].role, 'view'); assert.equal(JSON.stringify(w.webSocket.peer.texts()).includes(t), false);
  }
  assert.equal((await admin(C, 'watch@p.test', '/admin/api/cam/online')).status, 200);
  assert.equal((await admin(C, 'watch@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'token' } })).status, 403);
  assert.equal((await admin(C, 'watch@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'token', pilot: 'PAW0006' } })).status, 403);
  assert.equal((await stateAt(C, '')).token, btok); assert.equal((await stateAt(C, 'PAW0006')).token, ptok);
});

await test('roles: directors ("live") and administrators read and renew both links, each apart; "live" without Broadcast only the pilots\'', async () => {
  const C = mkCluster();
  for (const who of ['dir@p.test', 'adm@p.test']) {
    const btok = (await stateAt(C, '')).token, ptok = (await stateAt(C, 'PAW0006')).token;
    assert.equal((await (await admin(C, who, '/admin/api/cam')).json()).token, btok);
    assert.equal((await (await admin(C, who, '/admin/api/cam?pilot=PAW0006')).json()).token, ptok);
    const dw = (await admin(C, who, '/admin/api/cam/ws?pilot=PAW0006', { ws: true })).webSocket.peer, bw = (await admin(C, who, '/admin/api/cam/ws', { ws: true })).webSocket.peer;
    assert.equal(dw.texts()[0].role, 'dir'); assert.equal(dw.texts()[0].token, ptok); assert.equal(bw.texts()[0].token, btok);
    /* the pilot's new link: to that channel's directors, Broadcast's unchanged */
    const r = await admin(C, who, '/admin/api/cam', { method: 'POST', body: { op: 'token', pilot: 'paw0006' } }); assert.equal(r.status, 200);
    const nt = (await r.json()).token; assert.notEqual(nt, ptok);
    assert.equal((await stateAt(C, 'PAW0006')).token, nt); assert.equal((await stateAt(C, '')).token, btok);
    assert.deepEqual(lastOf(dw, 'token'), { t: 'token', token: nt }); assert.equal(bw.texts().some((m) => m.t === 'token'), false);
    /* Broadcast's new link: the pilot's unchanged */
    const rb = await admin(C, who, '/admin/api/cam', { method: 'POST', body: { op: 'token' } }); assert.equal(rb.status, 200);
    const nb = (await rb.json()).token; assert.notEqual(nb, btok); assert.equal((await stateAt(C, 'PAW0006')).token, nt);
    assert.equal(lastOf(bw, 'token').token, nb);
    assert.equal((await admin(C, who, '/admin/api/cam', { method: 'POST', body: { op: 'token', pilot: 'bad id' } })).status, 400);
    /* a pilot named only in the address still means that pilot's link, never Broadcast's own */
    const rq = await admin(C, who, '/admin/api/cam?pilot=PAW0006', { method: 'POST', body: { op: 'token' } }); assert.equal(rq.status, 200);
    const nq = (await rq.json()).token; assert.notEqual(nq, nt); assert.equal((await stateAt(C, 'PAW0006')).token, nq); assert.equal((await stateAt(C, '')).token, nb);
  }
  /* "live" with Flight Watch but not Broadcast: the pilots' links, not Broadcast's */
  const ptok = (await stateAt(C, 'PAW0012')).token;
  assert.equal((await (await admin(C, 'fwdir@p.test', '/admin/api/cam?pilot=PAW0012')).json()).token, ptok);
  assert.equal((await admin(C, 'fwdir@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'token', pilot: 'PAW0012' } })).status, 200);
  assert.equal((await admin(C, 'fwdir@p.test', '/admin/api/cam')).status, 403);
  assert.equal((await admin(C, 'fwdir@p.test', '/admin/api/cam', { method: 'POST', body: { op: 'token' } })).status, 403);
  /* camAdmin called as before (no hasBc): Broadcast's own channel as it was */
  const u = new URL(ORIGIN + '/admin/api/cam'); assert.equal((await camAdmin(new Request(u), u, C.env, 'x', false)).status, 200);
});

/* ---- 10. the admin page: Broadcast's automatic linkage and Flight Watch's Cockpit Monitor (admin.js, in a stand-in page) ---- */
const uiSrc = (() => {
  const a = ADMIN_HTML.indexOf('/* Polaris Cam (cam.js): its cockpit cameras'), b = ADMIN_HTML.indexOf('PG_LOAD.bc=()=>{BC.want=true;bcOpen();bcAll();bcCamOn()};');
  assert.ok(a > 0 && b > a, 'the players in admin.js');
  return ADMIN_HTML.slice(a, b) + '\n;globalThis.__ui={CAM,CAMP,CAMB,FWV,FW_CAM,CAM_VIEWS,bcCamLink,bcCamOn,bcCamOff,camUi,fwCamSync,fwCamLoad,fwCamRows,fwCamStrip,fwCamUi};';
})();
function mkUi({ perm = null } = {}) {
  const vm = globalThis.__vm, S = { socks: [], timers: [], T: 0, online: {}, flights: [], rows: [], shown: [], calls: [], doc: {}, win: {} };
  class WS { constructor(u) { this.url = u; this.readyState = 0; this.sent = []; this.closed = false; S.socks.push(this); } send(m) { this.sent.push(m); } close() { this.closed = true; this.readyState = 3; } }
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, hidden: true, innerHTML: '', textContent: '', value: '', placeholder: '', title: '', disabled: false, classList: { toggle() {} }, setAttribute() {}, querySelector: () => null });
  const document = {
    hidden: false,
    querySelector: (s) => (/^#[A-Za-z0-9_-]+$/.test(s) ? el(s) : null),
    querySelectorAll: (s) => (s === '#lvList [data-cs]' ? S.rows : []),
    addEventListener: (t, f) => { (S.doc[t] = S.doc[t] || []).push(f); },
    createElement: () => ({ className: '', innerHTML: '', title: '' }),
  };
  const window = { addEventListener: (t, f) => { (S.win[t] = S.win[t] || []).push(f); }, pmLive: { flights: () => S.flights.map((f) => ({ ...f })), show: (cs) => S.shown.push(cs) } };
  const g = {
    document, window, $: (s) => document.querySelector(s), esc: (s) => String(s), location: { origin: ORIGIN, protocol: 'https:', host: 'efb-api.example' },
    WebSocket: WS, Date, Blob, URL, console, performance: { now: () => S.T }, requestAnimationFrame: () => 0, navigator: {},
    setTimeout: (fn, ms) => { const t = { fn, at: S.T + (ms || 0), id: S.timers.length + 1 }; S.timers.push(t); return t.id; },
    clearTimeout: (id) => { S.timers = S.timers.filter((t) => t.id !== id); }, setInterval: () => 0,
    PERM: perm, pgNow: '', BC: { cfg: null }, FO: { f: null }, pgHas: () => true, bcSay: () => {},
    api: async (path, opt) => { S.calls.push([path, opt && opt.method || 'GET', opt && opt.body]); if (path === '/admin/api/cam/online') return { online: JSON.parse(JSON.stringify(S.online)) }; if (opt && opt.method === 'POST') return { ok: true, token: 'N'.repeat(30) }; return { token: 'G'.repeat(30), pub: { on: false } }; },
  };
  vm.createContext(g); vm.runInContext(uiSrc, g);
  const U = {
    g, S, ui: g.__ui, $: (s) => el(s),
    open: () => S.socks.filter((w) => !w.closed),
    fw: () => S.socks.filter((w) => !w.closed && /\?pilot=/.test(w.url) && w.fw),
    hello: (w, j = {}) => { w.readyState = 1; w.onmessage({ data: JSON.stringify({ t: 'hello', role: 'view', watchers: 1, pub: { on: false, cams: [] }, ...j }) }); },
    say: (w, j) => w.onmessage({ data: JSON.stringify(j) }),
    drop: (w) => { w.readyState = 3; w.closed = true; w.onclose(); },   /* the server or the network closed it */
    advance: (ms) => { S.T += ms; for (;;) { const due = S.timers.filter((t) => t.at <= S.T).sort((x, y) => x.at - y.at)[0]; if (!due) break; S.timers = S.timers.filter((t) => t !== due); due.fn(); } },
    fireDoc: (t, e = {}) => (S.doc[t] || []).forEach((f) => f(e)),
    fireWin: (t, e = {}) => (S.win[t] || []).forEach((f) => f(e)),
    /* a click on something with these data- attributes (closest() finds it only for a selector that names one of them) */
    click: (data) => { const t = { dataset: data, disabled: false, id: '', textContent: '' }; t.closest = (sel) => (Object.keys(data).some((k) => sel.includes('[data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ']')) ? t : null); U.fireDoc('click', { target: t }); return t; },
    row: (cs) => { const kids = []; const r = { dataset: { cs }, kids, querySelector: (q) => (q === '.fw-cb' ? kids.find((k) => k.className === 'fw-cb') || null : q === '.lv-cs' ? { appendChild: (s) => { s.remove = () => kids.splice(kids.indexOf(s), 1); kids.push(s); } } : null) }; S.rows.push(r); return r; },
  };
  return U;
}
const pilotWs = (U) => U.open().filter((w) => /\?pilot=/.test(w.url));

await test('admin page, Broadcast (Option A): a PC on Broadcast\'s own channel shows first ("Direct link"); else the streaming pilot\'s own channel ("Auto · <ID>"); else Offline; never two streams at once', async () => {
  const U = mkUi(), { ui, g } = U, st = () => U.$('#bcCamSt').innerHTML;
  g.pgNow = 'bc'; g.BC.cfg = { pilot: 'paw0006' };
  ui.bcCamOn();
  assert.deepEqual(U.open().map((w) => w.url), ['wss://efb-api.example/admin/api/cam/ws']);   /* nothing for the pilot before Broadcast's own says */
  const m = U.open()[0];
  U.hello(m, { role: 'dir', token: 'T'.repeat(30) });
  assert.equal(U.open().length, 2); const p1 = pilotWs(U)[0];
  assert.equal(p1.url, 'wss://efb-api.example/admin/api/cam/ws?pilot=PAW0006'); assert.equal(ui.CAMB.src, 'pilot');
  assert.match(st(), /Auto · PAW0006/); assert.match(st(), /Connecting/);
  assert.equal(U.$('#bcCamW').hidden, false); assert.equal(U.$('#bcCamUrl').value, ORIGIN + '/live/cam/' + 'T'.repeat(30));   /* the link stays as the fallback */
  U.hello(p1, { pub: { on: true, v: '2.0.0', mode: 'h264', cams: [{ i: 0, on: true, codec: 'h264' }] } });
  assert.match(st(), /Auto · PAW0006/); assert.match(st(), /Online/); assert.match(st(), /v2\.0\.0/);
  /* case 1: a PC comes on Broadcast's own channel: the pilot's socket goes at once */
  U.say(m, { t: 'pub', pub: { on: true, v: '1.9.0', mode: 'jpeg', cams: [] }, watchers: 1 });
  assert.equal(p1.closed, true); assert.deepEqual(U.open(), [m]); assert.equal(ui.CAMB.src, 'master');
  assert.match(st(), /Direct link/); assert.doesNotMatch(st(), /Auto/); assert.match(st(), /v1\.9\.0/);
  g.BC.cfg = { pilot: 'PAW0012' }; ui.bcCamLink(); assert.deepEqual(U.open(), [m]);     /* still only the one */
  /* it goes: Auto again, for the pilot set now */
  U.say(m, { t: 'pub', pub: { on: false, cams: [] }, watchers: 1 });
  assert.equal(U.open().length, 2); const p2 = pilotWs(U)[0]; assert.match(p2.url, /\?pilot=PAW0012$/); assert.equal(ui.CAMB.src, 'pilot');
  /* another streaming pilot (Setup): the one before closes, then the new one opens */
  g.BC.cfg = { pilot: 'PAW0013' }; ui.bcCamLink();
  assert.equal(p2.closed, true); assert.equal(pilotWs(U).length, 1); const p3 = pilotWs(U)[0]; assert.match(p3.url, /PAW0013$/);
  /* Broadcast's own socket drops and comes back: the pilot's stays meanwhile */
  U.drop(m); assert.equal(p3.closed, false); assert.equal(ui.CAMB.src, 'pilot');
  U.advance(3000); const m2 = U.open().find((w) => /cam\/ws$/.test(w.url)); assert.ok(m2 && m2 !== m);
  U.hello(m2, { role: 'dir' }); assert.equal(p3.closed, false); assert.equal(U.open().length, 2);
  /* case 3: no streaming pilot: Offline, only Broadcast's own open */
  g.BC.cfg = { pilot: '' }; ui.bcCamLink();
  assert.equal(p3.closed, true); assert.equal(ui.CAMB.src, ''); assert.deepEqual(U.open(), [m2]); assert.match(st(), /Offline/); assert.doesNotMatch(st(), /Auto|Direct/);
  g.BC.cfg = { pilot: 'not a pilot!' }; ui.bcCamLink(); assert.deepEqual(U.open(), [m2]);
  /* hidden for a minute: everything closes; back in view: open again */
  g.BC.cfg = { pilot: 'PAW0006' }; ui.bcCamLink(); assert.equal(U.open().length, 2);
  g.document.hidden = true; U.fireDoc('visibilitychange'); U.advance(59000); assert.equal(U.open().length, 2);
  U.advance(1000); assert.equal(U.open().length, 0); assert.equal(ui.CAMB.src, '');
  g.document.hidden = false; U.fireDoc('visibilitychange'); assert.equal(U.open().length, 1);
  U.hello(U.open()[0]); assert.equal(pilotWs(U).length, 1);
  /* leaving Broadcast closes both */
  g.pgNow = 'fw'; U.fireWin('pm:tab'); assert.equal(U.open().length, 0);
  assert.ok(U.S.socks.every((w) => w.closed));
});

await test('admin page, Flight Watch: who is online marks their flights and the strip; the open flight\'s pilot is watched at once while online, never while not (Connect waits), one pilot at a time; closed when the flight changes or closes, the page is left, or the tab is hidden a minute', async () => {
  const U = mkUi({ perm: { pages: new Set(['fw']), can: new Set(['live']) } }), { ui, g } = U;
  const one = () => assert.ok(pilotWs(U).length <= 1, 'never two pilots at once');
  g.pgNow = 'fw';
  U.S.online = { PAW0006: { v: '2.0.0', mode: 'h264', cams: [{ i: 0, on: true }], at: 1 }, PAW0099: { v: '2.0.0', mode: 'jpeg', cams: [], at: 2 } };
  U.S.flights = [{ cs: 'PAW806', pilot: 'PAW0006', sample: false }, { cs: 'PAW812', pilot: 'PAW0012', sample: false }, { cs: 'PAW900', pilot: '', sample: false }, { cs: 'PAW1', pilot: 'PAW0099', sample: true }];
  const r806 = U.row('PAW806'), r812 = U.row('PAW812'), r1 = U.row('PAW1');
  await ui.fwCamLoad();
  assert.equal(r806.kids.length, 1); assert.equal(r806.kids[0].className, 'fw-cb'); assert.equal(r812.kids.length, 0); assert.equal(r1.kids.length, 0);   /* not the sample */
  const strip = U.$('#fwCam'); assert.equal(strip.hidden, false);
  assert.match(strip.innerHTML, /2 online/); assert.match(strip.innerHTML, /data-fwcp="PAW0006"[^]*PAW806/); assert.match(strip.innerHTML, /data-fwcp="PAW0099"[^]*on ground/);
  assert.equal(U.open().length, 0);                                       /* no one is watched before a flight is open */
  /* a flight whose pilot is online: watched at once */
  g.FO.f = { cs: 'PAW806', pilot: 'PAW0006' }; ui.fwCamSync(true); one();
  let w = pilotWs(U); assert.equal(w.length, 1); assert.equal(w[0].url, 'wss://efb-api.example/admin/api/cam/ws?pilot=PAW0006');
  assert.match(U.$('#foCam').innerHTML, /Cockpit Monitor <small>PAW0006/); assert.match(U.$('#foCam').innerHTML, /Manual link for PAW0006/);
  U.hello(w[0], { role: 'dir', token: 'P'.repeat(30), pub: { on: true, v: '2.0.0', mode: 'h264', cams: [{ i: 0, on: true, codec: 'h264' }, { i: 1, on: true, codec: 'h264' }] } });
  assert.match(U.$('#foCamSt').innerHTML, /Online/); assert.match(U.$('#foCamSt').innerHTML, /2 cameras/);
  assert.equal(U.$('#foCamG').hidden, false); assert.equal(U.$('#foCamGo').textContent, 'Pause');
  assert.equal(U.$('#foCamUrl').value, ORIGIN + '/live/cam/p/PAW0006/' + 'P'.repeat(30));
  /* the panel drawn again with the same flight (pm:sel): the same socket, not a second */
  ui.fwCamSync(true); assert.equal(pilotWs(U).length, 1); assert.equal(w[0].closed, false);
  /* another flight, its pilot offline: the first closes, nothing opens (no idle socket) */
  g.FO.f = { cs: 'PAW812', pilot: 'PAW0012' }; ui.fwCamSync(true);
  assert.equal(w[0].closed, true); assert.equal(U.open().length, 0);
  assert.match(U.$('#foCamSt').innerHTML, /Offline/); assert.equal(U.$('#foCamGo').textContent, 'Connect'); assert.equal(U.$('#foCamG').hidden, true);
  assert.equal(U.$('#foCamUrl').value, '');
  /* a director opens the manual link: asked of the pilot's channel */
  U.$('#foCamK').id = 'foCamK'; U.$('#foCamK').open = true; U.fireDoc('toggle', { target: U.$('#foCamK') }); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(U.S.calls.pop(), ['/admin/api/cam?pilot=PAW0012', 'GET', undefined]); assert.equal(U.$('#foCamUrl').value, ORIGIN + '/live/cam/p/PAW0012/' + 'G'.repeat(30));
  /* Connect: waits for their Polaris Cam */
  U.click({ fwc: 'go' }); one(); w = pilotWs(U); assert.equal(w.length, 1); assert.match(w[0].url, /PAW0012$/);
  U.hello(w[0], { pub: { on: false, cams: [] } }); assert.equal(w[0].closed, false); assert.match(U.$('#foCamSt').innerHTML, /Waiting for Polaris Cam/);
  assert.equal(U.$('#foCamGo').textContent, 'Cancel');
  /* Cancel: back to Offline, no socket; Connect again */
  U.click({ fwc: 'go' }); assert.equal(w[0].closed, true); assert.equal(U.open().length, 0); assert.match(U.$('#foCamSt').innerHTML, /Offline/); assert.equal(U.$('#foCamGo').textContent, 'Connect');
  U.click({ fwc: 'go' }); one(); w = pilotWs(U); assert.equal(w.length, 1); U.hello(w[0], { pub: { on: false, cams: [] } });
  U.say(w[0], { t: 'pub', pub: { on: true, v: '2.0.0', mode: 'jpeg', cams: [] }, watchers: 1 });
  assert.ok('PAW0012' in ui.FW_CAM.online); assert.equal(r812.kids.length, 1);                 /* its own channel counts: marked now */
  /* Pause, then Watch */
  U.click({ fwc: 'go' }); assert.equal(w[0].closed, true); assert.equal(U.open().length, 0); assert.match(U.$('#foCamSt').innerHTML, /Paused/); assert.equal(U.$('#foCamGo').textContent, 'Watch');
  await ui.fwCamLoad(); assert.equal(U.open().length, 0);                                          /* paused stays paused */
  U.click({ fwc: 'go' }); one(); w = pilotWs(U); assert.equal(w.length, 1);
  U.hello(w[0], { pub: { on: true, mode: 'jpeg', cams: [] } });
  /* they go: closed at once (no idle socket), the mark goes; back on the list's next ask: watched again */
  U.say(w[0], { t: 'pub', pub: { on: false, cams: [] }, watchers: 1 });
  assert.equal(w[0].closed, true); assert.equal(U.open().length, 0); assert.equal(r812.kids.length, 0);
  U.S.online.PAW0012 = { v: '2.0.0', mode: 'jpeg', cams: [], at: 3 }; await ui.fwCamLoad(); one();
  w = pilotWs(U); assert.equal(w.length, 1); assert.match(w[0].url, /PAW0012$/);
  U.hello(w[0], { pub: { on: true, mode: 'jpeg', cams: [] } });
  /* the flight closes: closed */
  g.FO.f = null; ui.fwCamSync(true); assert.equal(U.open().length, 0); assert.equal(U.$('#foCam').innerHTML, '');
  /* a pilot with no flight on the map, from the strip: watched under it; a pilot with a flight: that flight opens */
  U.click({ fwcp: 'PAW0099' }); one(); w = pilotWs(U); assert.equal(w.length, 1); assert.match(w[0].url, /PAW0099$/);
  assert.equal(U.$('#fwCamGround').hidden, false); assert.match(U.$('#fwCamGround').innerHTML, /Cockpit Monitor <small>PAW0099/); assert.match(U.$('#fwCamGround').innerHTML, /on the map: parked, or testing/);
  U.click({ fwcp: 'PAW0006' }); assert.deepEqual(U.S.shown, ['PAW806']);
  /* ... which (as live.js opens it) replaces the pilot on ground: never two */
  g.FO.f = { cs: 'PAW806', pilot: 'PAW0006' }; ui.fwCamSync(true); one();
  assert.equal(w[0].closed, true); assert.match(pilotWs(U)[0].url, /PAW0006$/); assert.equal(U.$('#fwCamGround').hidden, true); assert.equal(U.$('#fwCamGround').innerHTML, '');
  assert.equal(ui.FW_CAM.ground, '');
  /* the tab hidden for a minute: closed; back in view: watched again */
  g.document.hidden = true; U.fireDoc('visibilitychange'); U.advance(59000); assert.equal(pilotWs(U).length, 1);
  U.advance(1000); assert.equal(U.open().length, 0);
  g.document.hidden = false; U.fireDoc('visibilitychange'); one(); assert.equal(pilotWs(U).length, 1);
  await new Promise((r) => setTimeout(r, 0));
  /* leaving Flight Watch: closed */
  g.pgNow = 'bc'; U.fireWin('pm:tab'); assert.equal(pilotWs(U).length, 0);
  g.pgNow = 'fw'; U.fireWin('pm:tab'); one();
  /* a sample flight, or one without a pilot ID: no monitor */
  g.FO.f = { cs: 'PAW1', pilot: 'PAW0099', sample: true }; ui.fwCamSync(true); assert.equal(U.open().length, 0); assert.equal(U.$('#foCam').innerHTML, '');
  g.FO.f = { cs: 'PAW900', pilot: '' }; ui.fwCamSync(true); assert.equal(U.open().length, 0);
  /* a role without "live": no manual link */
  const V = mkUi({ perm: { pages: new Set(['fw']), can: new Set() } }); V.g.pgNow = 'fw'; V.g.FO.f = { cs: 'PAW806', pilot: 'PAW0006' }; V.ui.fwCamSync(true);
  assert.match(V.$('#foCam').innerHTML, /Cockpit Monitor/); assert.doesNotMatch(V.$('#foCam').innerHTML, /Manual link/);
});

/* ---- 11. the files changed parse: each with node --check, and the admin page's own scripts as the browser gets them ---- */
await test('syntax: cam.js, mail.js, index.js, admin.js pass node --check; every inline <script> of the admin page parses', async () => {
  const { execFileSync } = await import('node:child_process'), { fileURLToPath } = await import('node:url');
  for (const f of ['cam.js', 'mail.js', 'index.js', 'admin.js', 'auth.js']) execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../src/' + f, import.meta.url))], { stdio: 'pipe' });
  const vm = globalThis.__vm, L = [...ADMIN_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  assert.ok(L.length >= 2 && L.some((s) => s.includes('function mkCamView(')));
  for (const s of L) assert.doesNotThrow(() => new vm.Script(s, { filename: 'admin-inline.js' }));
});

globalThis.fetch = realFetch; Date.now = realNow;
console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ', all passed'));
