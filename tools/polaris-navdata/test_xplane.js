/* Polaris Navdata with X-Plane 12, without X-Plane: a stand-in for X-Plane's Web API (REST and WebSocket) and a small
   X-Plane folder (CIFP, earth_fix.dat, earth_nav.dat). Runs main.js and checks what the EFB would get.
   node test_xplane.js   (NAVDATA_MAIN=dist/navdata-bundle.js tests the bundle; NAVDATA_EXE=dist/PolarisNavdata.exe the .exe) */
'use strict';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');

let ok = true; const ck = (name, cond, extra) => { ok = ok && !!cond; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? ' ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- the X-Plane folder ---- */
const XP = fs.mkdtempSync(path.join(os.tmpdir(), 'xp12-'));
fs.mkdirSync(path.join(XP, 'Resources', 'default data', 'CIFP'), { recursive: true });
fs.mkdirSync(path.join(XP, 'Custom Data', 'CIFP'), { recursive: true });
/* a record: [index, value] pairs into the 38 fields */
const rec = (k, v) => { const F = new Array(38).fill(' '); for (const [i, x] of Object.entries(v)) F[+i] = x; return k + ':' + F.join(',') + ';'; };
const S = (seq, rt, id, tr, fix, rg, sec, sub, pt, more) => ({ 0: seq, 1: rt, 2: id, 3: tr, 4: fix, 5: rg, 6: sec, 7: sub, 8: (more && more.desc) || 'E   ', 11: pt, ...((more && more.f) || {}) });
const cifp = [
  'RWY:RW07L,+0000,     ,00050, ,IXX ,3, ;N22183600,E113533600,0000;',
  'RWY:RW25R,+0000,     ,00050, ,ISR ,3, ;N22190600,E113555400,0100;',
  'RWY:RW07R,+0000,     ,00050, ,IYY ,3, ;N22174000,E113533000,0000;',
  'RWY:RW25L,+0000,     ,00050, ,IZZ ,3, ;N22181000,E113554800,0000;',
  /* a SID: runway transition, common route, en-route transition */
  rec('SID', S('010', '1', 'TEST1A', 'RW07L', ' ', ' ', ' ', ' ', 'CA', { f: { 20: '0730', 22: '+', 23: '01000' } })),
  rec('SID', S('020', '1', 'TEST1A', 'RW07L', 'ALPHA', 'VH', 'P', 'C', 'DF')),
  rec('SID', S('030', '2', 'TEST1A', ' ', 'BRAVO', 'VH', 'E', 'A', 'TF', { f: { 22: 'B', 23: '08000', 24: '06000', 27: '250' } })),
  rec('SID', S('040', '2', 'TEST1A', ' ', 'TAI', 'VH', 'D', ' ', 'TF', { desc: 'V   ', f: { 22: '+', 23: 'FL110' } })),
  rec('SID', S('050', '3', 'TEST1A', 'BETTY', 'BETTY', 'VH', 'E', 'A', 'TF', { desc: 'EY  ' })),
  /* a SID for both parallel runways */
  rec('SID', S('010', '4', 'BOTH1', 'RW07B', 'ALPHA', 'VH', 'P', 'C', 'DF')),
  /* a STAR: en-route transition, common route, runway transition with an RF leg */
  rec('STAR', S('010', '1', 'TEST2B', 'BETTY', 'BETTY', 'VH', 'E', 'A', 'IF')),
  rec('STAR', S('020', '1', 'TEST2B', 'BETTY', 'BRAVO', 'VH', 'E', 'A', 'TF')),
  rec('STAR', S('030', '2', 'TEST2B', ' ', 'ALPHA', 'VH', 'P', 'C', 'TF', { f: { 22: '@', 23: '04000' } })),
  rec('STAR', S('040', '3', 'TEST2B', 'RW07L', 'CHARL', 'VH', 'P', 'C', 'TF')),
  rec('STAR', S('050', '3', 'TEST2B', 'RW07L', 'DELTA', 'VH', 'P', 'C', 'RF', { f: { 9: 'R', 17: '002500', 30: 'CTR01', 31: 'VH', 32: 'P', 33: 'C' } })),
  /* an ILS: a transition, the final approach, then the missed approach after the runway (the MAP) */
  rec('APPCH', S('010', 'A', 'I07L', 'BETTY', 'BETTY', 'VH', 'E', 'A', 'IF')),
  rec('APPCH', S('020', 'A', 'I07L', 'BETTY', 'CHARL', 'VH', 'P', 'C', 'TF', { f: { 22: '+', 23: '03000' } })),
  rec('APPCH', S('030', 'I', 'I07L', ' ', 'CHARL', 'VH', 'P', 'C', 'IF', { desc: 'E  I' })),
  rec('APPCH', S('040', 'I', 'I07L', ' ', 'ECHO', 'VH', 'P', 'C', 'CF', { desc: 'E  F', f: { 20: '0730', 22: 'G', 23: '02000', 24: '02000' } })),
  rec('APPCH', S('050', 'I', 'I07L', ' ', 'RW07L', 'VH', 'P', 'G', 'CF', { desc: 'GY M', f: { 20: '0730' } })),
  rec('APPCH', S('060', 'I', 'I07L', ' ', ' ', ' ', ' ', ' ', 'CA', { desc: '  M ', f: { 20: '0730', 22: '+', 23: '01500' } })),
  rec('APPCH', S('070', 'I', 'I07L', ' ', 'TAI', 'VH', 'D', ' ', 'DF')),
  rec('APPCH', S('080', 'I', 'I07L', ' ', 'TAI', 'VH', 'D', ' ', 'HM', { f: { 9: 'L', 20: '2530', 21: 'T010' } })),
  rec('APPCH', S('010', 'R', 'R25RY', ' ', 'FOXTR', 'VH', 'P', 'C', 'IF')),
  rec('APPCH', S('020', 'R', 'R25RY', ' ', 'RW25R', 'VH', 'P', 'G', 'TF', { desc: 'GY M' })),
  /* (its missed approach not marked: it starts after the missed approach point) */
  rec('APPCH', S('030', 'R', 'R25RY', ' ', 'ALPHA', 'VH', 'P', 'C', 'DF', { f: { 22: '+', 23: '03000' } })),
  /* a VOR approach whose missed approach point is a fix before the runway, and a circling one with no runway */
  rec('APPCH', S('010', 'D', 'D07R', ' ', 'TAI', 'VH', 'D', ' ', 'IF', { desc: 'V  F' })),
  rec('APPCH', S('020', 'D', 'D07R', ' ', 'ECHO', 'VH', 'P', 'C', 'CF', { desc: 'EY M', f: { 20: '2530', 22: '-', 23: '00800' } })),
  rec('APPCH', S('030', 'D', 'D07R', ' ', 'TAI', 'VH', 'D', ' ', 'DF', { desc: 'V M ' })),
  rec('APPCH', S('010', 'V', 'VOR-A', ' ', 'TAI', 'VH', 'D', ' ', 'IF', { desc: 'V  F' })),
  rec('APPCH', S('020', 'V', 'VOR-A', ' ', 'ECHO', 'VH', 'P', 'C', 'CF', { desc: 'EY M' })),
  /* a continuation record, and an engine-out SID: not legs to show */
  'PRDAT:I07L,     ,AALL,LPV ,A,LNAV/VNAV,A,LNAV,A,           ;',
  rec('SID', S('010', '0', 'EOSID', 'RW07L', 'ALPHA', 'VH', 'P', 'C', 'DF')),
];
/* Custom Data (a newer cycle) is read before the default data */
fs.writeFileSync(path.join(XP, 'Custom Data', 'CIFP', 'VHHH.dat'), cifp.join('\r\n') + '\r\n');
fs.writeFileSync(path.join(XP, 'Resources', 'default data', 'CIFP', 'VHHH.dat'), 'RWY:RW01 ,+0000,     ,00050, ,    , , ;N22000000,E113000000,0000;\n');
const fixes = ['I', '1200 Version - data cycle 2512, build 20251130, metadata FixXP1200. Copyright (c) 2025 Test',
  '  22.31000000  113.90000000 ALPHA VHHH VH 2105430', '  22.40000000  114.10000000 BRAVO ENRT VH 4530263',
  '  22.50000000  114.30000000 BETTY ENRT VH 4530263', '  10.00000000  100.00000000 BETTY ENRT VT 4530263',
  '  22.28000000  113.80000000 CHARL VHHH VH 2105430', '  22.29000000  113.85000000 DELTA VHHH VH 2105430',
  '  22.29500000  113.83000000 CTR01 VHHH VH 2105430', '  22.30000000  113.87000000 ECHO VHHH VH 2105430',
  '  22.27000000  114.00000000 FOXTR VHHH VH 2105430', '99'];
fs.writeFileSync(path.join(XP, 'Custom Data', 'earth_fix.dat'), fixes.join('\n') + '\n');
fs.writeFileSync(path.join(XP, 'Custom Data', 'earth_nav.dat'), ['I', '1200 Version - data cycle 2512, metadata NavXP1200.',
  '3  22.29244444  114.01425000      0 11650 130   -2.000 TAI ENRT VH TAI PO VOR/DME',
  '12 22.29244444  114.01425000      0 11650 130    0.000 TAI ENRT VH TAI PO VOR/DME', '99'].join('\n') + '\n');

/* ---- the stand-in for X-Plane's Web API ---- */
const NAMES = ['sim/flightmodel/position/theta', 'sim/flightmodel/position/phi', 'sim/flightmodel/position/psi', 'sim/flightmodel/position/mag_psi',
  'sim/flightmodel/position/hpath', 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot', 'sim/flightmodel/position/true_airspeed',
  'sim/flightmodel/position/groundspeed', 'sim/flightmodel/position/vh_ind_fpm', 'sim/cockpit2/gauges/indicators/altitude_ft_pilot',
  'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot', 'sim/cockpit2/gauges/indicators/radio_altimeter_height_ft_pilot',
  'sim/cockpit2/gauges/indicators/slip_deg', 'sim/flightmodel/misc/machno', 'sim/flightmodel/failures/onground_any',
  'sim/flightmodel/position/latitude', 'sim/flightmodel/position/longitude', 'sim/cockpit2/temperature/outside_air_temp_degc',
  'sim/cockpit2/gauges/indicators/wind_speed_kts', 'sim/cockpit2/gauges/indicators/wind_heading_deg_mag', 'sim/flightmodel/forces/g_nrml',
  'sim/cockpit2/controls/parking_brake_ratio', 'sim/flightmodel/weight/m_fuel_total', 'sim/flightmodel/engine/ENGN_running', 'sim/aircraft/view/acf_ICAO'];
const ID = Object.fromEntries(NAMES.map((n, i) => [n, 1000 + i]));
const V0 = { theta: 2.5, phi: -10, psi: 75, mag_psi: 77, hpath: 76, airspeed_kts_pilot: 152.34, true_airspeed: 120, groundspeed: 110, vh_ind_fpm: -712.4,
  altitude_ft_pilot: 3021.6, barometer_setting_in_hg_pilot: 29.92, radio_altimeter_height_ft_pilot: 1234.4, slip_deg: 4, machno: 0.234, onground_any: 0,
  latitude: 22.30123456, longitude: 113.91234567, outside_air_temp_degc: 18.44, wind_speed_kts: 12.4, wind_heading_deg_mag: 270, g_nrml: 1.02,
  parking_brake_ratio: 0, m_fuel_total: 25000.5, ENGN_running: [1, 1, 0, 0, 0, 0, 0, 0], acf_ICAO: Buffer.from('A339\0\0\0\0', 'latin1').toString('base64') };
const val = (n) => V0[n.split('/').pop()];
/* mode: '' X-Plane 12.1.4 and later (capabilities, v1 and v2); 'old' 12.1.1 to 12.1.3 (v1 only, no capabilities);
   '403' Disable Incoming Traffic ticked (every request refused) */
const X = { flight: false, subs: [], conns: new Set(), refuseOne: false, mode: '', wsPath: '', apis: new Set() };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), ok = X.mode === 'old' ? ['v1'] : ['v1', 'v2'], m = u.pathname.match(/^\/api\/(v\d)\/datarefs$/);
  if (X.mode === '403') { res.statusCode = 403; res.end('{"error_code":"forbidden"}'); return; }
  if (u.pathname === '/api/capabilities' && X.mode !== 'old') { res.end(JSON.stringify({ api: { versions: ok }, 'x-plane': { version: '12.1.4' } })); return; }
  if (m && ok.includes(m[1])) {
    X.apis.add(m[1]); const nm = u.searchParams.get('filter[name]');
    /* a name it does not know (or any, before a flight is loaded): 404 invalid_dataref_name */
    if (!X.flight || !ID[nm]) { res.statusCode = 404; res.end('{"error_code":"invalid_dataref_name"}'); return; }
    res.end(JSON.stringify({ data: [{ id: ID[nm], name: nm, value_type: 'float' }] })); return;
  }
  res.statusCode = 404; res.end('{}');
});
const wsx = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, sock, head) => {
  const ok = X.mode === 'old' ? ['/api/v1'] : ['/api/v1', '/api/v2'];
  if (X.mode === '403' || !ok.includes(req.url)) return sock.destroy();
  X.wsPath = req.url; wsx.handleUpgrade(req, sock, head, (w) => wsx.emit('connection', w));
});
wsx.on('connection', (w) => {
  X.conns.add(w); w.on('close', () => X.conns.delete(w));
  w.on('message', (raw) => {
    const j = JSON.parse(String(raw)); if (j.type !== 'dataref_subscribe_values') return;
    X.subs.push(j);
    if (X.refuseOne && j.req_id === 1) { w.send(JSON.stringify({ type: 'result', req_id: j.req_id, success: false, error_code: 'invalid_dataref_id' })); return; }
    w.send(JSON.stringify({ type: 'result', req_id: j.req_id, success: true }));
    const data = {}; for (const d of j.params.datarefs) { const nm = NAMES[d.id - 1000]; data[d.id] = val(nm); }
    w.send(JSON.stringify({ type: 'dataref_update_values', data }));
  });
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const xpPort = server.address().port, port = 21050 + Math.floor(Math.random() * 500);
  /* the bundle and the .exe carry their own modules: run them without NODE_PATH */
  const EXE = process.env.NAVDATA_EXE, env = { ...process.env }; if (process.env.NAVDATA_MAIN || EXE) delete env.NODE_PATH;
  const MAIN = path.resolve(process.env.NAVDATA_MAIN || path.join(__dirname, 'main.js')), argv = ['--port', String(port), '--xp-port', String(xpPort), '--xplane', XP];
  console.log('testing ' + (EXE ? path.resolve(EXE) : MAIN));
  const child = EXE ? spawn(path.resolve(EXE), argv, { env, stdio: ['ignore', 'pipe', 'pipe'] }) : spawn(process.execPath, [MAIN, ...argv], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  try {
    /* Polaris Navdata may take a moment to start (the .exe more so): try for 15 s */
    const msgs = []; let efb = null;
    for (let i = 0; i < 60 && !efb; i++) {
      await sleep(250);
      const w = new WebSocket('ws://localhost:' + port);
      w.on('message', (m) => msgs.push(JSON.parse(String(m))));
      efb = await new Promise((r) => { w.on('open', () => r(w)); w.on('error', () => r(null)); });
    }
    if (!efb) throw new Error('Polaris Navdata did not open ws://localhost:' + port);
    const last = (cmd) => msgs.filter((m) => m.cmd === cmd).slice(-1)[0];
    const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(50); } return fn(); };
    /* X-Plane open, no flight loaded yet: its datarefs are not listed */
    const hw = await until(() => { const x = last('hello'); return x && x.xpWait ? x : null; });
    ck('X-Plane open without a flight: waiting for one (its procedures can be read already)', hw && !hw.xp && hw.sim && hw.xpName === 'X-Plane 12.1.4' && /flight to load/.test(hw.xpWait), hw);
    X.flight = true;
    const h = await until(() => { const x = last('hello'); return x && x.xp ? x : null; }, 15000);
    ck('hello: X-Plane connected', h && h.xp && h.sim && h.simName === 'X-Plane 12.1.4' && h.xpData === true, h);
    ck('the newest API it offers (v2 here)', X.wsPath === '/api/v2' && X.apis.has('v2') && !X.apis.has('v1'), { ws: X.wsPath, rest: [...X.apis] });
    efb.send(JSON.stringify({ cmd: 'live', on: true }));
    const f = await until(() => { const x = last('live'); return x && x.f; });
    ck('live frames come', !!f, f);
    if (f) {
      ck('attitude: pitch up, bank left, magnetic heading', f.p === 2.5 && f.b === -10 && f.h === 77, { p: f.p, b: f.b, h: f.h });
      ck('magnetic variation from true and magnetic heading (west negative)', f.mv === -2, f.mv);
      ck('track: magnetic, from the true track', f.k === 78, f.k);
      ck('speeds in knots', f.ias === 152.3 && f.tas === 233 && f.gs === 214, { ias: f.ias, tas: f.tas, gs: f.gs });
      ck('vertical speed, altitude, radio altitude', f.vs === -712 && f.alt === 3022 && f.ra === 1234, { vs: f.vs, alt: f.alt, ra: f.ra });
      ck('QNH in hPa', f.qnh === 1013.2, f.qnh);
      ck('wind from, true; OAT; G', f.wd === 268 && f.wsp === 12 && f.oat === 18.4 && f.gf === 1.02, { wd: f.wd, wsp: f.wsp, oat: f.oat, gf: f.gf });
      ck('position, mach, ball, in the air', f.la === 22.30123 && f.lo === 113.91235 && f.m === 0.234 && f.ball === 0.5 && f.g === 0, { la: f.la, lo: f.lo, m: f.m, ball: f.ball, g: f.g });
      ck('for Ground: aircraft, engines, brake, fuel', f.ac === 'A339' && f.eng === 2 && f.pbrk === 0 && f.fob === 25001, { ac: f.ac, eng: f.eng, pbrk: f.pbrk, fob: f.fob });
    }
    /* X-Plane sends only what changed: the rest stays */
    for (const w of X.conns) w.send(JSON.stringify({ type: 'dataref_update_values', data: { [ID['sim/flightmodel/position/theta']]: -1.25, [ID['sim/flightmodel/failures/onground_any']]: 1, [ID['sim/cockpit2/controls/parking_brake_ratio']]: 1 } }));
    const f2 = await until(() => { const x = last('live'); return x && x.f && x.f.p === -1.25 ? x.f : null; });
    ck('a change: only it changes', f2 && f2.p === -1.25 && f2.g === 1 && f2.pbrk === 1 && f2.h === 77 && f2.ias === 152.3, f2 && { p: f2.p, g: f2.g, pbrk: f2.pbrk, h: f2.h });
    ck('in the air there was no touchdown speed; on touching down, the last vertical speed in the air', f && f.tdv === 0 && f2 && f2.tdv === -712, { air: f && f.tdv, down: f2 && f2.tdv });
    const n0 = msgs.filter((m) => m.cmd === 'live').length; await sleep(1000); const rate = msgs.filter((m) => m.cmd === 'live').length - n0;
    ck('a steady 10 a second while nothing changes', rate >= 6 && rate <= 13, rate);
    efb.send(JSON.stringify({ cmd: 'live', on: false })); await sleep(300); const n1 = msgs.filter((m) => m.cmd === 'live').length; await sleep(500);
    ck('live off: no more frames', msgs.filter((m) => m.cmd === 'live').length === n1);
    /* the procedures */
    efb.send(JSON.stringify({ cmd: 'procs', icao: 'VHHH', id: 1 }));
    const pr = await until(() => msgs.find((m) => m.cmd === 'procs' && m.id === 1));
    ck('procedures answered', pr && pr.ok, pr && pr.error);
    const d = pr && pr.data;
    if (d) {
      const r07 = d.rw.find((r) => r.n === '07L'), r25 = d.rw.find((r) => r.n === '25R');
      ck('Custom Data used, with its cycle', d.rw.length === 4 && d.cy === '2512' && d.src === 'X-Plane', { rw: d.rw.map((r) => r.n), cy: d.cy });
      ck('runway 07L: threshold, true heading, length', r07 && r07.la === 22.31 && r07.lo === 113.893333 && Math.abs(r07.h - 76.8) < 0.2 && r07.len > 13000 && r07.len < 13500, r07);
      /* 07L's length runs to the far end, past 25R's displaced threshold (100 ft); 25R's to 07L's threshold */
      ck('runway 25R: the reverse heading; the displaced threshold in 07L\'s length', r25 && r07 && Math.abs(r25.h - 256.8) < 0.2 && r25.len === r07.len - 100, r25);
      ck('airport at the middle of its thresholds', Math.abs(d.la - 22.3) < 0.05 && Math.abs(d.lo - 113.9) < 0.05, { la: d.la, lo: d.lo });
      const sid = d.dep.find((p) => p.n === 'TEST1A');
      ck('SID: runway transition, common route, en-route transition', sid && sid.rt['07L'] && sid.rt['07L'].length === 2 && sid.c.length === 2 && sid.et.BETTY && sid.et.BETTY.length === 1, sid && { rt: Object.keys(sid.rt), c: sid.c.length, et: Object.keys(sid.et) });
      if (sid) {
        const [ca, df] = sid.rt['07L'], [br, tai] = sid.c, bt = sid.et.BETTY[0];
        ck('CA: course to 1000 ft or above', ca.t === 'CA' && ca.c === 73 && ca.ad === 2 && ca.a1 === 1000 && !ca.f, ca);
        ck('DF ALPHA: the terminal waypoint\'s position', df.t === 'DF' && df.f === 'ALPHA' && df.ty === 'W' && df.la === 22.31 && df.lo === 113.9, df);
        ck('BRAVO: between 6000 and 8000, 250 kt', br.ad === 4 && br.a1 === 8000 && br.a2 === 6000 && br.sp === 250 && br.la === 22.4, br);
        ck('TAI: the VOR, FL110 or above', tai.ty === 'V' && tai.la === 22.292444 && tai.ad === 2 && tai.a1 === 11000, tai);
        ck('BETTY: the one in the VH region, fly-over', bt.la === 22.5 && bt.fo === 1, bt);
      }
      const both = d.dep.find((p) => p.n === 'BOTH1');
      ck('RW07B: under 07B, 07L and 07R', both && both.rt['07B'] && both.rt['07L'] && both.rt['07R'] && !both.rt['07C'], both && Object.keys(both.rt));
      const star = d.arr.find((p) => p.n === 'TEST2B');
      ck('STAR: en-route BETTY, common, runway 07L', star && star.et.BETTY.length === 2 && star.c.length === 1 && star.rt['07L'].length === 2, star && { et: Object.keys(star.et), c: star.c.length, rt: Object.keys(star.rt) });
      if (star) { const a = star.c[0], rf = star.rt['07L'][1];
        ck('ALPHA: at 4000', a.ad === 1 && a.a1 === 4000, a);
        ck('RF DELTA: right turn about CTR01', rf.t === 'RF' && rf.tn === 'R' && rf.ac && rf.ac[0] === 22.295 && rf.ac[1] === 113.83, rf); }
      const ils = (d.apr || []).find((p) => p.id === 'I07L'), rnv = (d.apr || []).find((p) => p.id === 'R25R-Y');
      ck('ILS RW07L: named and typed as MSFS does', ils && ils.n === 'ILS RW07L' && ils.ty === 'ILS' && ils.rw === '07L', ils && { n: ils.n, id: ils.id, ty: ils.ty, rw: ils.rw });
      if (ils) {
        ck('final approach to the runway (the MAP), then the missed approach', ils.f.map((g) => g.t + ':' + (g.f || '')).join(' ') === 'IF:CHARL CF:ECHO CF:RW07L' && ils.m.map((g) => g.t + ':' + (g.f || '')).join(' ') === 'CA: DF:TAI HM:TAI', { f: ils.f.map((g) => g.t + ':' + (g.f || '')), m: ils.m.map((g) => g.t + ':' + (g.f || '')) });
        const ff = ils.f[1], rw = ils.f[2], hm = ils.m[2];
        ck('FAF at 2000 (glide slope coded G)', ff.ad === 1 && ff.a1 === 2000, ff);
        ck('the runway fix at the threshold, fly-over', rw.ty === 'R' && rw.la === 22.31 && rw.fo === 1, rw);
        ck('hold: left turns, 1 minute legs, 253°', hm.tn === 'L' && hm.d === 1 && hm.min === 1 && hm.c === 253, hm);
        ck('transition BETTY, missed approach altitude', ils.tr.BETTY && ils.tr.BETTY.length === 2 && ils.tr.BETTY[1].ad === 2 && ils.ma === 1500, { tr: Object.keys(ils.tr), ma: ils.ma });
      }
      ck('RNAV Y RW25R: its missed approach from after the missed approach point', rnv && rnv.n === 'RNAV Y RW25R' && rnv.sfx === 'Y' && rnv.rw === '25R' && rnv.f.length === 2 && rnv.m.length === 1 && rnv.m[0].f === 'ALPHA' && rnv.ma === 3000, rnv && { n: rnv.n, id: rnv.id, sfx: rnv.sfx, f: rnv.f.length, m: rnv.m.map((g) => g.f), ma: rnv.ma });
      const vd = d.apr.find((p) => p.id === 'D07R'), va = d.apr.find((p) => p.id === 'V-A');
      ck('VOR/DME RW07R: at or below 800 at the missed approach point, then the missed approach', vd && vd.n === 'VOR/DME RW07R' && vd.f.length === 2 && vd.f[1].ad === 3 && vd.f[1].a1 === 800 && vd.m.length === 1 && vd.m[0].f === 'TAI', vd && { n: vd.n, f: vd.f.map((g) => g.f), m: vd.m.map((g) => g.f) });
      ck('VOR-A (circling): no runway', va && va.n === 'VOR A' && va.rw === 'ALL' && va.sfx === 'A' && va.f.length === 2, va && { n: va.n, id: va.id, rw: va.rw });
      ck('approaches in runway order; the engine-out SID and the continuation record left out', d.apr.map((p) => p.id).join() === 'I07L,D07R,R25R-Y,V-A' && d.dep.map((p) => p.n).join() === 'BOTH1,TEST1A', { apr: d.apr.map((p) => p.id), dep: d.dep.map((p) => p.n) });
    }
    efb.send(JSON.stringify({ cmd: 'procs', icao: 'ZZZZ', id: 2 }));
    const pz = await until(() => msgs.find((m) => m.cmd === 'procs' && m.id === 2));
    ck('an airport X-Plane has no procedures for: said so', pz && !pz.ok && /no procedures/.test(pz.error), pz && pz.error);
    /* X-Plane refuses the set (one id it does not know): each value asked for on its own */
    X.refuseOne = true; X.subs = []; for (const w of X.conns) w.close();
    await until(() => X.subs.length > 5, 10000);
    ck('refused set: asked for value by value', X.subs.length >= NAMES.length && X.subs.slice(1).every((s) => s.params.datarefs.length === 1), X.subs.length);
    /* X-Plane closes */
    await until(() => { const x = last('hello'); return x && x.xp ? x : null; });
    const close = () => new Promise((r) => { server.close(r); server.closeAllConnections(); for (const w of X.conns) w.terminate(); });
    let nh = msgs.length;
    X.refuseOne = false; await close();
    const hc = await until(() => msgs.slice(nh).filter((m) => m.cmd === 'hello' && !m.xp)[0], 10000);
    ck('X-Plane closed: hello says so', hc && !hc.xp && !hc.sim && !hc.xpName, hc);
    /* an older X-Plane comes up: no capabilities, the first API */
    X.mode = 'old'; X.apis.clear(); X.wsPath = ''; nh = msgs.length;
    await new Promise((r) => server.listen(xpPort, '127.0.0.1', r));
    const ho = await until(() => msgs.slice(nh).find((m) => m.cmd === 'hello' && m.xp), 15000);
    ck('X-Plane 12.1.1 to 12.1.3 (no capabilities): the first API (v1)', ho && X.wsPath === '/api/v1' && [...X.apis].join() === 'v1' && ho.xpName === 'X-Plane 12', ho && { ws: X.wsPath, rest: [...X.apis], name: ho.xpName });
    const fo = await until(() => { const x = last('live'); return x && x.f && x.f.ac === 'A339' ? x.f : null; }, 3000);
    ck('and its values', fo && fo.h === 77 && fo.ias === 152.3, fo && { h: fo.h, ias: fo.ias });
    /* Disable Incoming Traffic ticked in X-Plane: every request refused */
    X.mode = '403'; nh = msgs.length; for (const w of X.conns) w.terminate();
    const hf = await until(() => msgs.slice(nh).find((m) => m.cmd === 'hello' && m.xpWait), 15000);
    ck('Web API turned off in X-Plane: says where to turn it on', hf && !hf.xp && hf.sim && /Disable Incoming Traffic/.test(hf.xpWait), hf && hf.xpWait);
    await close();
    efb.close();
  } catch (e) { ck('no error', false, e.stack); }
  finally { child.kill(); }
  await sleep(200);
  if (!ok) console.log('--- Polaris Navdata said:\n' + out);
  console.log(ok ? 'ALL OK' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
})();
