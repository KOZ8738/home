/* Polaris Navdata sending to the EFB server by itself (cloud.js), without a simulator or the server: a stand-in X-Plane
   flies a short flight, a stand-in EFB server takes what Navdata sends. node test_cloud.js */
'use strict';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');
const { DR } = require('./xplane');
let ok = true; const ck = (name, cond, extra) => { ok = ok && !!cond; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(100); } return fn(); };
const KEY = 'nk.eyJ1IjoiUEFXMDAwNiJ9.c2lnbmF0dXJl';

/* ---- an X-Plane folder with VHHH's procedures (its runways place the airport) ---- */
const XPD = fs.mkdtempSync(path.join(os.tmpdir(), 'xpc-')), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pnd-'));
fs.mkdirSync(path.join(XPD, 'Resources', 'default data', 'CIFP'), { recursive: true });
const rec = (k, v) => { const F = new Array(38).fill(' '); for (const [i, x] of Object.entries(v)) F[+i] = x; return k + ':' + F.join(',') + ';'; };
fs.writeFileSync(path.join(XPD, 'Resources', 'default data', 'CIFP', 'VHHH.dat'), ['RWY:RW07L,+0000,     ,00028, ,IZSL,3,   ;N22183600,E113533600,0000;', 'RWY:RW25R,+0000,     ,00028, ,ITFR,3,   ;N22190600,E113555400,0000;',
  rec('SID', { 0: '010', 1: '5', 2: 'OCEAN2', 3: ' ', 4: 'PORPA', 5: 'VH', 6: 'P', 7: 'C', 8: 'E   ', 11: 'DF' })].join('\n') + '\n');
fs.writeFileSync(path.join(XPD, 'Resources', 'default data', 'earth_fix.dat'), 'I\n1200 Version - data cycle 2511.\n  22.34000000  114.05000000 PORPA VHHH VH 2105430\n99\n');
fs.writeFileSync(path.join(XPD, 'Resources', 'default data', 'earth_nav.dat'), 'I\n1200 Version\n99\n');

/* ---- X-Plane's Web API: the values of V, to whoever subscribed, 10 times a second ---- */
const ID = Object.fromEntries(DR.map((d, i) => [d[1], 800 + i])), KEYOF = Object.fromEntries(DR.map((d, i) => [800 + i, d[0]]));
const V = { theta: 0, phi: 0, psi: 70, mpsi: 73, hpath: 70, ias: 0, ias2: 0, tas: 0, gs: 0, vs: 0, alt: 28, baro: 29.92, ra: 0, slip: 0, mach: 0, gnd: 1, la: 22.3100, lo: 113.8950, oat: 24, wsp: 5, wd: 80, gf: 1, pbrk: 1, fob: 30000, eng: [0, 0], icao: Buffer.from('A339').toString('base64') };
const XS = { subs: 0, unsubs: 0, socks: new Set() };
const xsrv = http.createServer((q, r) => { const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/capabilities') return r.end(JSON.stringify({ api: { versions: ['v1', 'v2'] }, 'x-plane': { version: '12.2.0' } }));
  const nm = u.searchParams.get('filter[name]'); if (ID[nm]) return r.end(JSON.stringify({ data: [{ id: ID[nm], name: nm }] })); r.statusCode = 404; r.end('{}'); });
const xw = new WebSocketServer({ noServer: true }); xsrv.on('upgrade', (q, s, h) => xw.handleUpgrade(q, s, h, (w) => xw.emit('connection', w)));
xw.on('connection', (w) => { XS.socks.add(w); w.sub = false; w.on('close', () => XS.socks.delete(w));
  w.on('message', (m) => { const j = JSON.parse(String(m)); if (j.type === 'dataref_subscribe_values') { w.sub = true; XS.subs++; } if (j.type === 'dataref_unsubscribe_values') { w.sub = false; XS.unsubs++; } w.send(JSON.stringify({ type: 'result', req_id: j.req_id, success: true })); }); });
setInterval(() => { for (const w of XS.socks) if (w.sub) { const data = {}; for (const [id, k] of Object.entries(KEYOF)) data[id] = V[k]; w.send(JSON.stringify({ type: 'dataref_update_values', data })); } }, 100).unref();

/* ---- the EFB server ---- */
const SV = { calls: [], gsx: [], np: [], frames: [], flight: null, oo: {}, deny: false, pub: null, pubUrl: '', auth: new Set(), down: false };
const esrv = http.createServer((q, r) => { let b = ''; q.on('data', (d) => { b += d; }); q.on('end', () => {
  const p = q.url.split('?')[0]; SV.calls.push(q.method + ' ' + p); SV.auth.add(q.headers.authorization || '');
  const send = (o, s = 200) => { r.statusCode = s; r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify(o)); };
  if (SV.down) return send({ error: 'down' }, 503);
  if (SV.deny || q.headers.authorization !== 'Bearer ' + KEY) return send({ error: 'Not paired' }, 401);
  if (p === '/api/nav/ticket') return send({ ticket: 'T1' });
  if (p === '/api/nav/flight') return send({ flight: SV.flight, oo: SV.oo });
  if (p === '/api/nav/gsx') { SV.gsx.push(JSON.parse(b)); return send({ ok: true }); }
  if (p === '/api/nav/navproc') { SV.np.push(JSON.parse(b).data); return send({ ok: true }); }
  send({ error: 'Not found' }, 404); }); });
const ew = new WebSocketServer({ noServer: true });
esrv.on('upgrade', (q, s, h) => { SV.pubUrl = q.url; SV.pubOrigin = q.headers.origin; ew.handleUpgrade(q, s, h, (w) => { SV.pub = w; w.send(JSON.stringify({ hello: 1, subs: 0 })); w.on('close', () => { if (SV.pub === w) SV.pub = null; });
  w.on('message', (m) => { const j = JSON.parse(String(m)); if (j.ping != null) w.send(JSON.stringify({ pong: j.ping })); else SV.frames.push(j); }); }); });
const lastG = () => SV.gsx[SV.gsx.length - 1];

(async () => {
  await new Promise((r) => xsrv.listen(0, '127.0.0.1', r)); await new Promise((r) => esrv.listen(0, '127.0.0.1', r));
  const port = 27050 + Math.floor(Math.random() * 400), EXE = process.env.NAVDATA_EXE;
  const env = { ...process.env }; if (EXE) delete env.NODE_PATH;
  const argv = ['--port', String(port), '--xp-port', String(xsrv.address().port), '--xplane', XPD, '--stay', '--no-link', '--data-dir', DATA, '--cloud-server', 'http://127.0.0.1:' + esrv.address().port, '--cloud-poll-sec', '2'];
  const run = () => { const c = EXE ? spawn(path.resolve(EXE), argv, { env }) : spawn(process.execPath, [path.join(__dirname, 'main.js'), ...argv], { env }); c.out = ''; c.stdout.on('data', (d) => { c.out += d; }); c.stderr.on('data', (d) => { c.out += d; }); return c; };
  const efb = async () => { for (let i = 0; i < 60; i++) { const x = await new Promise((r) => { const w = new WebSocket('ws://localhost:' + port, { origin: 'https://koz8738.com' }), m = []; w.on('message', (d) => { m.push(JSON.parse(String(d))); if (m.length === 1) r({ w, m }); }); w.on('error', () => r(null)); }); if (x) return x; await sleep(250); } return null; };
  const hello = (x) => x.m.filter((j) => j.cmd === 'hello').pop();
  console.log('testing ' + (EXE ? path.resolve(EXE) : path.join(__dirname, 'main.js')));
  let nav = run();
  try {
    let x = await efb();
    ck('not paired: says so, asks the server nothing', x && hello(x).cloud === false && SV.calls.length === 0, x && hello(x));
    /* pairing, from the EFB on this PC */
    x.w.send(JSON.stringify({ cmd: 'cloud', key: 'not-a-key' }));
    let a = await until(() => x.m.find((j) => j.cmd === 'cloud'));
    ck('a key that is not one: refused', a && a.ok === false && a.on === false, a);
    x.m.length = 0; x.w.send(JSON.stringify({ cmd: 'cloud', key: KEY, kid: 'K1', server: 'https://evil.example', auto: true, cal: [1, 1] }));
    a = await until(() => x.m.find((j) => j.cmd === 'cloud'));
    ck('the key from the EFB: taken', a && a.ok === true && a.on === true && a.kid === 'K1', a);
    await until(() => x.m.some((j) => j.cmd === 'hello' && j.cloud === true));
    ck('hello says it is paired', x.m.some((j) => j.cmd === 'hello' && j.cloud === true && j.cloudKid === 'K1'));
    const file = path.join(DATA, 'cloud.json'), txt = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    ck('the key kept on this PC' + (process.platform === 'win32' ? ', protected (not readable in the file)' : ''), !!txt && (process.platform !== 'win32' || (!txt.includes(KEY) && JSON.parse(txt).enc === true)), txt.slice(0, 60));
    /* a flight on the server, X-Plane running; but an EFB is open on this PC: it does the work */
    SV.flight = { fid: 'F1', flight: 'PAW339', from: 'VHHH', to: 'RCTP', at: Date.now() };
    await sleep(4500);
    ck('an EFB open on this PC: Navdata stands by (nothing to the server, X-Plane not read)', SV.calls.length === 0 && XS.subs === 0, SV.calls);
    /* restarted: still paired */
    x.w.close(); nav.kill(); await sleep(600); nav = run(); x = await efb();
    await until(() => x.m.some((j) => j.cmd === 'hello' && j.cloud === true), 8000);
    ck('started again: still paired (the key read back)', x.m.some((j) => j.cmd === 'hello' && j.cloud === true && j.cloudKid === 'K1'), hello(x));
    x.w.close();
    /* no EFB on this PC: Navdata takes over */
    await until(() => SV.gsx.length > 0 && SV.pub && SV.np.length > 0, 20000);
    ck('with its key only, to the server it was started for (not the one a page named)', SV.auth.size === 1 && SV.auth.has('Bearer ' + KEY));
    ck('asked for the flight, a relay ticket, and connected to the relay as Navdata', SV.calls.includes('GET /api/nav/flight') && SV.calls.includes('POST /api/nav/ticket') && /nav=1/.test(SV.pubUrl) && /ticket=T1/.test(SV.pubUrl) && !SV.pubOrigin, SV.pubUrl);
    ck('X-Plane read for the flight', XS.subs >= 1);
    ck('the departure airport’s procedures sent', SV.np.some((d) => d.icao === 'VHHH' && d.dep.length === 1 && d.rw.length === 2 && d.src === 'sim'), SV.np.map((d) => d.icao));
    await until(() => lastG().ac, 8000);
    ck('posted: the flight, the aircraft, no times yet, no GSX values (X-Plane)', lastG().fid === 'F1' && lastG().ac === 'A339' && Object.keys(lastG().oo).length === 0 && Object.keys(lastG().v).length === 0, lastG());
    ck('nobody watches the PFD: no frames sent', SV.frames.length === 0);
    /* the flight */
    Object.assign(V, { eng: [1, 1], pbrk: 0, gs: 3 }); await until(() => lastG().oo.OUT, 6000);
    ck('OUT at the first movement', /^\d\d:\d\d$/.test(lastG().oo.OUT || ''), lastG().oo);
    SV.pub.send(JSON.stringify({ subs: 1 })); await sleep(1200);
    const fr = SV.frames[SV.frames.length - 1];
    ck('a device watches: frames to the relay, the PFD’s values only', SV.frames.length >= 8 && fr.h === 73 && fr.g === 1 && !('ac' in fr) && !('eng' in fr) && !('fob' in fr) && 'l' in fr, fr);
    Object.assign(V, { gs: 80, ias: 150, ias2: 150 }); await sleep(700);
    Object.assign(V, { gnd: 0, gs: 85, ias: 165, vs: 1800, alt: 900, ra: 870, theta: 12, la: 22.35, lo: 114.0 }); await until(() => lastG().oo.OFF, 6000);
    ck('OFF airborne', !!lastG().oo.OFF, lastG().oo);
    Object.assign(V, { vs: -640, alt: 80, ra: 30, theta: 3, ias: 140, la: 25.07, lo: 121.22 }); await sleep(900);
    Object.assign(V, { gnd: 1, vs: -50, alt: 30, ra: 0, gs: 68, ias: 132, gf: 1.27 }); await sleep(400); V.gf = 1.02;
    await until(() => lastG().oo.ON && lastG().land, 8000);
    const L = lastG().land;
    ck('ON, and the touchdown: −640 fpm, 1.27 G, for this flight', !!lastG().oo.ON && L && L.fpm === -640 && L.g === 1.27 && L.fid === 'F1' && L.fl === 'PAW339' && L.ias === 140, L);
    ck('the watching device gets it with the frames', await until(() => SV.frames.some((f) => f.ld && f.ld.fpm === -640), 3000));
    SV.pub.send(JSON.stringify({ subs: 0 })); await sleep(400); const nf = SV.frames.length;
    Object.assign(V, { gs: 0, ias: 0, ias2: 0, eng: [0, 0], pbrk: 1 }); await until(() => lastG().oo.IN, 10000);
    ck('IN once parked with the engines off', !!lastG().oo.IN && ['OUT', 'OFF', 'ON', 'IN'].every((k) => /^\d\d:\d\d$/.test(lastG().oo[k])), lastG().oo);
    ck('nobody watches any more: frames stopped', SV.frames.length <= nf + 2, SV.frames.length - nf);
    ck('the flight done, nobody watching: X-Plane no longer read', await until(() => XS.unsubs >= 1, 6000), { subs: XS.subs, unsubs: XS.unsubs });
    /* the EFB opens on this PC: it is told the times, and Navdata stands by */
    const n0 = SV.gsx.length; x = await efb(); const oo = await until(() => x.m.find((j) => j.cmd === 'oo'), 3000);
    ck('an EFB opened here: handed the times', oo && oo.fid === 'F1' && oo.oo.IN, oo);
    await sleep(3500); ck('and Navdata stops sending', SV.gsx.length <= n0 + 1 && !SV.pub, SV.gsx.length - n0);
    x.w.close();
    /* a plan loaded while the aircraft is somewhere else (an old plan, another flight): no OUT */
    Object.assign(V, { la: 35.0, lo: 139.0, gs: 0, eng: [0, 0], gnd: 1 }); SV.flight = { fid: 'F2', flight: 'PAW340', from: 'VHHH', to: 'RCTP', at: Date.now() }; SV.oo = {};
    await until(() => lastG() && lastG().fid === 'F2', 15000);
    Object.assign(V, { eng: [1, 1], gs: 6 }); await sleep(4000);
    ck('far from the plan’s departure airport: OUT not stamped', lastG().fid === 'F2' && !lastG().oo.OUT, lastG().oo);
    /* a time already on the server is taken, not stamped again */
    SV.oo = { OUT: '01:23' }; await until(() => lastG().oo.OUT === '01:23', 8000);
    ck('a time the server already has: taken as it is', lastG().oo.OUT === '01:23', lastG().oo);
    /* a plan from days ago: nothing read for it */
    V.gs = 0; SV.flight = { fid: 'F3', flight: 'PAW341', from: 'VHHH', to: 'RCTP', at: Date.now() - 30 * 3600e3 }; SV.oo = {}; const g0 = SV.gsx.length, u0 = XS.unsubs;
    await until(() => XS.unsubs > u0, 10000); await sleep(1500);
    ck('a plan loaded more than a day ago: not a flight under way (nothing read, nothing posted)', XS.unsubs > u0 && !SV.gsx.slice(g0).some((p) => p.fid === 'F3'), { unsubs: XS.unsubs - u0 });
    /* offline, then back */
    SV.flight = { fid: 'F4', flight: 'PAW342', from: 'RCTP', to: 'VHHH', at: Date.now() }; await until(() => lastG().fid === 'F4', 15000);
    SV.down = true; Object.assign(V, { eng: [1, 1], gs: 5 }); await sleep(5000); const g1 = SV.gsx.length; SV.down = false;
    await until(() => SV.gsx.length > g1 && lastG().oo.OUT, 12000);
    ck('the server away, then back: what happened meanwhile arrives (departure airport without procedures: OUT allowed)', lastG().fid === 'F4' && !!lastG().oo.OUT, lastG().oo);
    /* the key removed on the EFB */
    SV.deny = true; await until(() => !fs.existsSync(file), 15000); x = await efb();
    ck('the key no longer taken by the server: unpaired here, the file gone', !fs.existsSync(file) && hello(x).cloud === false, hello(x));
    const c0 = SV.calls.length; x.w.close(); await sleep(7000);
    ck('and nothing more is sent', SV.calls.length === c0, SV.calls.length - c0);
  } catch (e) { ck('no error', false, e.stack); }
  finally { try { nav.kill(); } catch (e) { /* gone */ } }
  if (!ok) console.log('--- Polaris Navdata said:\n' + nav.out);
  console.log(ok ? 'ALL OK' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
})();
