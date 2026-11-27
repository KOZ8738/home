/* Polaris Navdata as the go-between for the broadcast desk (obs.js, desk.js), without OBS, a simulator or the server: a
   stand-in OBS (obs-websocket 5, with its password), a stand-in EFB server (the desk's Durable Object played by this
   test) and, later, a stand-in X-Plane. node test_desk.js */
'use strict';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');
const { DR } = require('./xplane');
const { phaseRaw } = require('./desk');
let ok = true; const ck = (name, cond, extra) => { ok = ok && !!cond; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(100); } return fn(); };
const KEY = 'nk.eyJ1IjoiUEFXMDAwNiJ9.c2lnbmF0dXJl', PW = 'obs-secret-7';
const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');

/* ---- the phases, from the values alone ---- */
ck('phases: parked, taxi, takeoff roll, initial climb, climb, cruise, descent, approach, landing, rollout',
  phaseRaw({ g: 1, gs: 0 }) === 'parked' && phaseRaw({ g: 1, gs: 12 }) === 'taxi' && phaseRaw({ g: 1, gs: 90 }, 'taxi') === 'takeoff' && phaseRaw({ g: 0, ra: 600, vs: 2200, alt: 700 }, 'takeoff') === 'takeoff'
  && phaseRaw({ g: 0, ra: 9000, vs: 2000, alt: 9000 }, 'takeoff') === 'climb' && phaseRaw({ g: 0, ra: 33000, vs: 0, alt: 35000 }, 'climb') === 'cruise' && phaseRaw({ g: 0, ra: 20000, vs: -1800, alt: 22000 }, 'cruise') === 'descent'
  && phaseRaw({ g: 0, ra: 1800, vs: -700, alt: 1900 }, 'descent') === 'approach' && phaseRaw({ g: 0, ra: 40, vs: -600, alt: 60 }, 'approach') === 'landing' && phaseRaw({ g: 1, gs: 110 }, 'landing') === 'landing'
  && phaseRaw({ g: 1, gs: 25 }, 'landing') === 'landing' && phaseRaw({ g: 1, gs: 15 }, 'landing') === 'taxi' && phaseRaw({ g: 0, ra: 5000, vs: 0, alt: 6000 }, 'climb') === 'climb');

/* ---- OBS: its WebSocket server with a password, five scenes ---- */
const O = { scenes: ['CAM 1 · Centre', 'CAM 2 · Captain', 'CAM 3 · FO', 'CAM 4 · Belly', 'Back soon'], pgm: 'CAM 1 · Centre', stream: false, rec: false, socks: new Set(), auths: 0, refused: 0, shots: [], reqs: [], bytes: 0 };
const osrv = http.createServer(), ow = new WebSocketServer({ server: osrv });
ow.on('connection', (w) => {
  O.socks.add(w); w.on('close', () => O.socks.delete(w));
  const salt = crypto.randomBytes(8).toString('base64'), challenge = crypto.randomBytes(8).toString('base64');
  w.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.4', rpcVersion: 1, authentication: { salt, challenge } } }));
  w.on('message', (m) => {
    const j = JSON.parse(String(m)), d = j.d || {};
    if (j.op === 1) { O.auths++; if (d.authentication !== sha(sha(PW + salt) + challenge)) { O.refused++; w.close(4009, 'Authentication failed.'); return; } w.ident = true; w.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } })); return; }
    if (j.op !== 6 || !w.ident) return;
    const t = d.requestType, q = d.requestData || {}; O.reqs.push(t);
    const ans = (data, okk = true, comment) => w.send(JSON.stringify({ op: 7, d: { requestType: t, requestId: d.requestId, requestStatus: { result: okk, code: okk ? 100 : 600, comment }, responseData: data } }));
    const ev = (type, data) => { for (const s of O.socks) if (s.ident) s.send(JSON.stringify({ op: 5, d: { eventType: type, eventIntent: 4, eventData: data } })); };
    if (t === 'GetSceneList') return ans({ currentProgramSceneName: O.pgm, currentPreviewSceneName: null, scenes: O.scenes.map((n, i) => ({ sceneIndex: O.scenes.length - 1 - i, sceneName: n })).reverse() });
    if (t === 'SetCurrentProgramScene') { if (!O.scenes.includes(q.sceneName)) return ans({}, false, 'No source was found by the name of `' + q.sceneName + '`.'); O.pgm = q.sceneName; ans({}); return ev('CurrentProgramSceneChanged', { sceneName: O.pgm }); }
    if (t === 'GetSourceScreenshot') { O.shots.push(q.sourceName + ' ' + q.imageWidth + 'x' + q.imageHeight); return ans({ imageData: 'data:image/jpg;base64,' + Buffer.from(q.sourceName).toString('base64') }); }
    if (t === 'GetStreamStatus') { if (O.stream) O.bytes += 750000; return ans({ outputActive: O.stream, outputReconnecting: false, outputTimecode: '00:00:10.000', outputDuration: O.stream ? 10000 : 0, outputCongestion: 0, outputBytes: O.bytes, outputSkippedFrames: 0, outputTotalFrames: 300 }); }
    if (t === 'GetRecordStatus') return ans({ outputActive: O.rec, outputPaused: false, outputDuration: O.rec ? 5000 : 0, outputBytes: 0 });
    if (t === 'GetStats') return ans({ cpuUsage: 3.4, memoryUsage: 400, activeFps: 30, averageFrameRenderTime: 2, renderSkippedFrames: 0, renderTotalFrames: 9000, outputSkippedFrames: 0, outputTotalFrames: 9000 });
    if (t === 'StartStream') { O.stream = true; ans({}); return ev('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' }); }
    if (t === 'StopStream') { O.stream = false; ans({}); return ev('StreamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' }); }
    if (t === 'StartRecord') { O.rec = true; return ans({}); }
    if (t === 'StopRecord') { O.rec = false; return ans({ outputPath: 'C:/rec.mkv' }); }
    ans({}, false, 'Not in this stand-in');
  });
});

/* ---- X-Plane's Web API, started later (no simulator at first) ---- */
const ID = Object.fromEntries(DR.map((d, i) => [d[1], 800 + i])), KEYOF = Object.fromEntries(DR.map((d, i) => [800 + i, d[0]]));
const V = { theta: 0, phi: 0, psi: 70, mpsi: 73, hpath: 70, ias: 0, ias2: 0, tas: 0, gs: 0, vs: 0, alt: 28, baro: 29.92, ra: 0, slip: 0, mach: 0, gnd: 1, la: 22.3100, lo: 113.8950, oat: 24, wsp: 5, wd: 80, gf: 1, pbrk: 1, fob: 30000, eng: [0, 0], icao: Buffer.from('A321').toString('base64') };
const XS = { subs: 0, socks: new Set() };
const xsrv = http.createServer((q, r) => { const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/capabilities') return r.end(JSON.stringify({ api: { versions: ['v1', 'v2'] }, 'x-plane': { version: '12.2.0' } }));
  const nm = u.searchParams.get('filter[name]'); if (ID[nm]) return r.end(JSON.stringify({ data: [{ id: ID[nm], name: nm }] })); r.statusCode = 404; r.end('{}'); });
const xw = new WebSocketServer({ noServer: true }); xsrv.on('upgrade', (q, s, h) => xw.handleUpgrade(q, s, h, (w) => xw.emit('connection', w)));
xw.on('connection', (w) => { XS.socks.add(w); w.sub = false; w.on('close', () => XS.socks.delete(w));
  w.on('message', (m) => { const j = JSON.parse(String(m)); if (j.type === 'dataref_subscribe_values') { w.sub = true; XS.subs++; } if (j.type === 'dataref_unsubscribe_values') w.sub = false; w.send(JSON.stringify({ type: 'result', req_id: j.req_id, success: true })); }); });
setInterval(() => { for (const w of XS.socks) if (w.sub) { const data = {}; for (const [id, k] of Object.entries(KEYOF)) data[id] = V[k]; w.send(JSON.stringify({ type: 'dataref_update_values', data })); } }, 100).unref();

/* ---- the EFB server, and the desk (played here) ---- */
const SV = { calls: [], urls: [], desk: false, pc: null, pcUrl: '', pcOrigin: '', m: [], joins: 0, closeWith: 0 };
const esrv = http.createServer((q, r) => { let b = ''; q.on('data', (d) => { b += d; }); q.on('end', () => {
  const p = q.url.split('?')[0]; SV.calls.push(q.method + ' ' + p); SV.urls.push(q.url);
  const send = (o, s = 200) => { r.statusCode = s; r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify(o)); };
  if (q.headers.authorization !== 'Bearer ' + KEY) return send({ error: 'Not paired' }, 401);
  if (p === '/api/nav/ticket') return send({ ticket: 'T9' });
  if (p === '/api/nav/flight') return send({ flight: null, oo: {}, want: [], desk: SV.desk });
  if (p === '/api/nav/gsx' || p === '/api/nav/navproc') return send({ ok: true });
  send({ error: 'Not found' }, 404); }); });
const ew = new WebSocketServer({ noServer: true });
esrv.on('upgrade', (q, s, h) => {
  if (!q.url.startsWith('/api/nav/desk/ws')) { s.destroy(); return; }
  SV.pcUrl = q.url; SV.pcOrigin = q.headers.origin || '';
  ew.handleUpgrade(q, s, h, (w) => {
    SV.joins++; if (SV.closeWith) { const c = SV.closeWith; SV.closeWith = 0; w.close(c, 'away'); return; }
    SV.pc = w; w.on('close', () => { if (SV.pc === w) SV.pc = null; });
    w.on('message', (m) => SV.m.push(JSON.parse(String(m))));
  });
});
const toPc = (o) => SV.pc && SV.pc.send(JSON.stringify(o));
const got = (t, f) => SV.m.filter((x) => x.t === t && (!f || f(x)));
const last = (t) => got(t).pop();

(async () => {
  await new Promise((r) => osrv.listen(0, '127.0.0.1', r)); await new Promise((r) => esrv.listen(0, '127.0.0.1', r));
  /* X-Plane's port, for later */
  const xpPort = await new Promise((r) => { const t = http.createServer(); t.listen(0, '127.0.0.1', () => { const pt = t.address().port; t.close(() => r(pt)); }); });
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pnd-desk-')), XPD = fs.mkdtempSync(path.join(os.tmpdir(), 'xpd-'));
  fs.mkdirSync(path.join(XPD, 'Resources', 'default data', 'CIFP'), { recursive: true });
  /* paired already (as the EFB does it: see test_cloud.js) */
  fs.writeFileSync(path.join(DATA, 'cloud.json'), JSON.stringify({ key: KEY, enc: false, kid: 'K1', auto: true, cal: [1, 1] }));
  const port = 28050 + Math.floor(Math.random() * 400), EXE = process.env.NAVDATA_EXE, obsPort = osrv.address().port;
  const env = { ...process.env }; if (EXE) delete env.NODE_PATH;
  const argv = ['--port', String(port), '--xp-port', String(xpPort), '--xplane', XPD, '--no-link', '--idle-sec', '3', '--data-dir', DATA, '--cloud-server', 'http://127.0.0.1:' + esrv.address().port, '--cloud-poll-sec', '1'];
  const run = () => { const c = EXE ? spawn(path.resolve(EXE), argv, { env }) : spawn(process.execPath, [path.join(__dirname, 'main.js'), ...argv], { env }); c.out = ''; c.exited = false; c.on('exit', () => { c.exited = true; }); c.stdout.on('data', (d) => { c.out += d; }); c.stderr.on('data', (d) => { c.out += d; }); return c; };
  const efb = async () => { for (let i = 0; i < 60; i++) { const x = await new Promise((r) => { const w = new WebSocket('ws://localhost:' + port, { origin: 'https://koz8738.com' }), m = []; w.on('message', (d) => { m.push(JSON.parse(String(d))); if (m.length === 1) r({ w, m }); }); w.on('error', () => r(null)); }); if (x) return x; await sleep(250); } return null; };
  const hello = (x) => x.m.filter((j) => j.cmd === 'hello').pop();
  console.log('testing ' + (EXE ? path.resolve(EXE) : path.join(__dirname, 'main.js')));
  let nav = run();
  try {
    let x = await efb();
    ck('started: OBS not set up (hello says so), the desk not asked about (no simulator, no OBS)', x && hello(x).obs && hello(x).obs.on === false && hello(x).obs.st === 'off', x && hello(x).obs);
    await sleep(2500);
    ck('nothing asked of the server', SV.calls.length === 0, SV.calls);
    /* a wrong password: refused, and not tried again and again */
    x.w.send(JSON.stringify({ cmd: 'obs', on: true, port: obsPort, pw: 'wrong', remote: false }));
    const a = await until(() => x.m.find((j) => j.cmd === 'obs'));
    ck('OBS set up from the EFB: answered', a && a.ok === true && a.obs.on === true && a.obs.pw === true && !JSON.stringify(a).includes('wrong'), a);
    await until(() => hello(x).obs.st === 'err', 6000);
    ck('a wrong password: OBS refused it, the EFB is told why', /refused the password/.test(hello(x).obs.err), hello(x).obs);
    const r0 = O.auths; await sleep(6000);
    ck('and it is not tried again by itself', O.auths === r0, O.auths - r0);
    ck('OBS set up but not answering, no simulator: the server is not asked', SV.calls.length === 0, SV.calls);
    const file = path.join(DATA, 'obs.json'), txt = fs.readFileSync(file, 'utf8');
    ck('the settings kept on this PC' + (process.platform === 'win32' ? ', the password protected (not readable in the file)' : ''), txt.includes('"on":true') && (process.platform !== 'win32' || (!txt.includes('wrong') && JSON.parse(txt).enc === true)), txt.slice(0, 80));
    x.m.length = 0; x.w.send(JSON.stringify({ cmd: 'obs', on: true, port: obsPort, pw: PW, remote: false }));
    await until(() => hello(x) && hello(x).obs.st === 'on', 8000);
    ck('the right password: connected to OBS', hello(x).obs.st === 'on' && hello(x).obs.v === '5.5.4' && hello(x).obs.err === '', hello(x).obs);
    /* OBS set up: the server asked, without a simulator, whether this flight is on the desk */
    await until(() => SV.calls.includes('GET /api/nav/flight'), 5000);
    ck('no simulator, OBS connected: asks the server whether the flight is on the desk', SV.calls.includes('GET /api/nav/flight') && SV.urls.every((u) => u === '/api/nav/flight?desk=1') && !SV.pc, SV.urls.slice(0, 3));
    /* the director puts this flight on the desk */
    SV.desk = true;
    await until(() => SV.pc && last('scenes'), 8000);
    const pc = got('pc')[0];
    ck('joined the desk with a ticket, as Navdata (no browser origin)', /ticket=T9/.test(SV.pcUrl) && !SV.pcOrigin && SV.calls.includes('POST /api/nav/ticket'), SV.pcUrl);
    ck('told the desk: its version, OBS connected, may not start the stream', pc && pc.v === require('./package.json').version && pc.obs.st === 'on' && pc.remote === false, pc);
    ck('OBS’s scenes, top first, and the one on air', last('scenes') && last('scenes').list.join('|') === O.scenes.join('|') && last('scenes').pgm === 'CAM 1 · Centre', last('scenes'));
    await until(() => last('stats'), 5000);
    ck('the stream, the recording and OBS’s load', last('stats') && last('stats').stream.on === false && last('stats').rec.on === false && last('stats').obs.fps === 30, last('stats'));
    ck('no one watching: no pictures taken', O.shots.length === 0 && !got('shot').length, O.shots);
    /* someone watches */
    toPc({ watch: 1 }); await sleep(2600);
    const sh = got('shot');
    ck('someone watches: the scene on air (640x360) every second and the others in turn (320x180)', sh.filter((s) => s.k === 'pgm' && s.name === 'CAM 1 · Centre').length >= 2 && sh.some((s) => s.k === 's') && O.shots.includes('CAM 1 · Centre 640x360') && O.shots.some((s) => /320x180$/.test(s)) && !O.shots.some((s) => s.startsWith('CAM 1 · Centre 320')), O.shots.slice(0, 8));
    ck('the pictures as OBS made them', sh[0] && /^data:image\/jpg;base64,/.test(sh[0].img));
    toPc({ pvw: 'CAM 3 · FO' }); await until(() => got('shot', (s) => s.k === 'pvw').length >= 2, 6000);
    ck('the director’s next scene: its picture too', got('shot', (s) => s.k === 'pvw' && s.name === 'CAM 3 · FO').length >= 2);
    toPc({ watch: 0 }); await sleep(800); const n0 = O.shots.length; await sleep(2000);
    ck('no one watching any more: no more pictures', O.shots.length <= n0 + 1, O.shots.length - n0);
    /* the director's commands */
    toPc({ cmd: { id: 'c1', op: 'scene', name: 'CAM 2 · Captain' } });
    let ack = await until(() => got('ack', (k) => k.id === 'c1')[0], 5000);
    ck('TAKE: the scene on air in OBS, the desk told', ack && ack.ok && O.pgm === 'CAM 2 · Captain' && (await until(() => last('pgm') && last('pgm').name === 'CAM 2 · Captain', 3000)), { ack, pgm: O.pgm });
    toPc({ cmd: { id: 'c2', op: 'scene', name: 'Desktop 1' } });
    ack = await until(() => got('ack', (k) => k.id === 'c2')[0], 5000);
    ck('a scene OBS does not have: refused, OBS left as it is', ack && !ack.ok && /no scene called/.test(ack.err) && O.pgm === 'CAM 2 · Captain', ack);
    toPc({ cmd: { id: 'c3', op: 'start' } });
    ack = await until(() => got('ack', (k) => k.id === 'c3')[0], 5000);
    ck('start the stream: not allowed on this PC (set on the EFB)', ack && !ack.ok && /not allowed/.test(ack.err) && !O.stream && !O.reqs.includes('StartStream'), ack);
    toPc({ cmd: { id: 'c4', op: 'format C:' } });
    ack = await until(() => got('ack', (k) => k.id === 'c4')[0], 5000);
    ck('anything else: not something the desk can do', ack && !ack.ok && /Not something/.test(ack.err), ack);
    /* allowed on the EFB, the password not sent again */
    const auth0 = O.auths; x.m.length = 0; x.w.send(JSON.stringify({ cmd: 'obs', on: true, port: obsPort, remote: true }));
    await until(() => x.m.find((j) => j.cmd === 'obs'));
    await until(() => got('pc', (p) => p.remote === true).length, 4000);
    ck('the EFB allows it: the desk told, OBS not connected again', got('pc', (p) => p.remote === true).length >= 1 && O.auths === auth0 && hello(x).obs.remote === true && hello(x).obs.pw === true, { auths: O.auths - auth0 });
    toPc({ cmd: { id: 'c5', op: 'start' } });
    ack = await until(() => got('ack', (k) => k.id === 'c5')[0], 5000);
    ck('start the stream from the desk: on', ack && ack.ok && O.stream === true, ack);
    await until(() => last('stats') && last('stats').stream.on, 5000); await sleep(2300);
    ck('the stream’s state and upload rate', last('stats').stream.on === true && last('stats').stream.kbps > 0, last('stats').stream);
    toPc({ cmd: { id: 'c6', op: 'recstart' } }); ack = await until(() => got('ack', (k) => k.id === 'c6')[0], 5000);
    ck('the recording: started', ack && ack.ok && O.rec === true, ack);
    /* the simulator comes: its values for the overlay and the phase */
    await new Promise((r) => xsrv.listen(xpPort, '127.0.0.1', r));
    await until(() => XS.subs > 0 && got('fl', (m) => m.f).length, 20000);
    const fl = got('fl', (m) => m.f).pop();
    ck('X-Plane read while on the desk: the flight’s numbers once a second', fl && fl.f.alt === 28 && fl.f.g === 1 && fl.f.la === 22.31, fl);
    await until(() => last('ph') && last('ph').ph === 'parked', 5000);
    ck('the phase: parked', last('ph') && last('ph').ph === 'parked', last('ph'));
    /* the auto director */
    toPc({ cfg: { auto: { on: true, every: 20, rules: { parked: ['Back soon'], taxi: ['CAM 3 · FO'], takeoff: ['CAM 4 · Belly'], cruise: ['CAM 1 · Centre', 'CAM 2 · Captain'] } } } });
    await until(() => O.pgm === 'Back soon', 4000);
    ck('auto director on: the scene for the phase on air at once', O.pgm === 'Back soon' && got('auto', (m) => m.name === 'Back soon' && m.ph === 'parked').length === 1, { pgm: O.pgm });
    Object.assign(V, { gs: 6, eng: [1, 1], pbrk: 0 });
    await until(() => last('ph').ph === 'taxi', 14000);
    ck('taxiing (held 8 s first): the taxi scene', last('ph').ph === 'taxi' && (await until(() => O.pgm === 'CAM 3 · FO', 3000)), { ph: last('ph'), pgm: O.pgm });
    Object.assign(V, { gs: 70 }); const tq = Date.now();
    await until(() => last('ph').ph === 'takeoff', 6000);
    ck('the takeoff roll (held 2 s only): the takeoff scene', last('ph').ph === 'takeoff' && Date.now() - tq < 5000 && (await until(() => O.pgm === 'CAM 4 · Belly', 3000)), { ph: last('ph'), pgm: O.pgm });
    toPc({ cfg: { auto: { on: false, every: 20, rules: {} } } }); Object.assign(V, { gs: 5 }); await sleep(10000);
    ck('auto director off: the phase changes, the scene does not', last('ph').ph === 'taxi' && O.pgm === 'CAM 4 · Belly', { ph: last('ph'), pgm: O.pgm });
    /* the director takes the flight off the desk, and puts it back */
    SV.desk = false; await until(() => !SV.pc, 6000);
    ck('taken off the desk: left it', !SV.pc && /No longer on the broadcast desk/.test(nav.out));
    SV.desk = true; await until(() => SV.pc, 8000);
    ck('put back: joined again', !!SV.pc);
    /* with no EFB on this PC it stays, while on the desk */
    x.w.close(); await sleep(6000);
    ck('no EFB here (would close after 3 s): stays open while on the desk', !nav.exited && SV.pc);
    /* sent away: another PC took over */
    SV.closeWith = 4000; const j0 = SV.joins; SV.pc.close(1012, 'restart'); await until(() => SV.joins > j0, 8000); await sleep(3500);
    ck('another simulator PC took over: not joined again for now', SV.joins === j0 + 1 && !SV.pc, SV.joins - j0);
    /* no longer on the desk, and no EFB here: it closes as before */
    await until(() => nav.exited, 9000);
    ck('no longer on the desk, no EFB here: Polaris Navdata closes as before', nav.exited, nav.out.split('\n').slice(-3));
    /* started again: OBS set up from the file, on the desk again */
    SV.desk = true; SV.m.length = 0; nav = run();
    await until(() => SV.pc && last('pc'), 12000);
    ck('started again: OBS set up from what was kept, joined the desk again', SV.pc && last('pc') && last('pc').obs.st === 'on' && last('pc').remote === true, last('pc'));
    x = await efb();
    x.w.send(JSON.stringify({ cmd: 'obs', on: false, pw: '' }));
    await until(() => !SV.pc && hello(x).obs.on === false, 6000);
    ck('OBS no longer set up (and its password removed): left the desk, OBS let go, nothing kept', !SV.pc && hello(x).obs.on === false && hello(x).obs.pw === false && !fs.existsSync(file) && [...O.socks].length === 0, hello(x).obs);
    x.w.close();
  } catch (e) { ck('no error', false, e.stack); }
  finally { try { nav.kill(); } catch (e) { /* gone */ } }
  if (!ok) console.log('--- Polaris Navdata said:\n' + nav.out);
  console.log(ok ? 'ALL OK' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
})();
