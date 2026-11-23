/* Windows only, on the built program (NAVDATA_EXE=dist/PolarisNavdata.exe node test_win.js): starting with Windows,
   chosen on the EFB (the Run entry in this user's settings, and staying open while it is chosen); the copy Windows
   starts, made to have no window at all (%LOCALAPPDATA%\Polaris Navdata\PolarisNavdata-bg.exe), with its messages in
   navdata.log there; and Polaris Navdata 1.4 and 1.5's Run entry (--startup), still working. */
'use strict';
const path = require('path'), fs = require('fs'), { spawn, execFileSync } = require('child_process');
const { WebSocket } = require('ws');
const EXE = process.env.NAVDATA_EXE;
if (process.platform !== 'win32' || !EXE) { console.log('skipped: Windows and NAVDATA_EXE only'); process.exit(0); }
let ok = true; const ck = (name, cond, extra) => { ok = ok && !!cond; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (p, ms) => Promise.race([p.then(() => true), sleep(ms).then(() => false)]);
const exe = path.resolve(EXE), env = { ...process.env }; delete env.NODE_PATH;
const RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const runValue = () => { try { const out = execFileSync('reg', ['query', RUN, '/v', 'Polaris Navdata'], { encoding: 'utf8' }); const m = out.match(/REG_SZ\s+(.+)\r?\n/); return m ? m[1].trim() : ''; } catch (e) { return null; } };
const run = (a) => { const c = spawn(exe, a, { env }); c.out = ''; c.stdout.on('data', (d) => { c.out += d; }); c.stderr.on('data', (d) => { c.out += d; }); c.exited = new Promise((r) => c.on('exit', (code) => { c.code = code; r(); })); return c; };
const open = (port) => new Promise((r) => { const w = new WebSocket('ws://localhost:' + port, { origin: 'https://koz8738.com' }), m = [];
  w.on('message', (x) => { m.push(JSON.parse(String(x))); if (m.length === 1) r({ w, m }); }); w.on('error', () => r(null)); });
const upBy = async (port, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const x = await open(port); if (x) return x; await sleep(300); } return null; };
const answer = (x, cmd, ms) => new Promise((r) => { const t = setTimeout(() => r(null), ms || 8000); x.w.on('message', (m) => { const j = JSON.parse(String(m)); if (j.cmd === cmd) { clearTimeout(t); r(j); } }); });
const lastHello = (x) => x.m.filter((j) => j.cmd === 'hello').pop();
const LAD = path.join(process.env.LOCALAPPDATA, 'Polaris Navdata'), COPY = path.join(LAD, 'PolarisNavdata-bg.exe'), LOG = path.join(LAD, 'navdata.log');
/* a Windows program's subsystem: 2 windowed (no console), 3 console */
const subsystem = (f) => { const fd = fs.openSync(f, 'r'); try { const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0x3c); const v = Buffer.alloc(2); fs.readSync(fd, v, 0, 2, b.readUInt32LE(0) + 24 + 68); return v.readUInt16LE(0); } finally { fs.closeSync(fd); } };

(async () => {
  console.log('testing ' + exe);
  const port = 25050 + Math.floor(Math.random() * 400);
  const a = run(['--port', String(port), '--xp-port', '1', '--idle-sec', '3']);
  try {
    let x = await upBy(port, 20000);
    ck('starts', !!x, a.out);
    await sleep(1500);
    x.w.send(JSON.stringify({ cmd: 'autostart', on: false })); await answer(x, 'autostart'); await sleep(300);
    ck('not chosen: no Run entry', runValue() === null && lastHello(x).autostart === false, { run: runValue(), hello: lastHello(x).autostart });
    x.w.send(JSON.stringify({ cmd: 'autostart', on: true }));
    const on = await answer(x, 'autostart');
    ck('chosen on the EFB: starts with Windows', on && on.ok && on.on === true, on);
    ck('the Run entry: the copy, with no window, made from this program', runValue() === `"${COPY}" --background --main "${exe}"`, runValue());
    ck('the copy: this program marked as windowed (no console), this program a console one', fs.existsSync(COPY) && subsystem(COPY) === 2 && subsystem(exe) === 3 && fs.statSync(COPY).size === fs.statSync(exe).size, fs.existsSync(COPY) && { copy: subsystem(COPY), exe: subsystem(exe) });
    await sleep(300);
    ck('hello says so', lastHello(x).autostart === true, lastHello(x));
    x.w.close(); await sleep(5000);
    ck('chosen: stays open with no EFB', a.exitCode === null);
    /* as Windows starts it: the copy, as the Run entry says (on a port of its own here) */
    const port2 = port + 1, c = spawn(COPY, ['--background', '--main', exe, '--port', String(port2), '--xp-port', '1', '--no-link'], { env, stdio: 'ignore' });
    const z = await upBy(port2, 20000);
    ck('the copy Windows starts: up, in the background', !!z && lastHello(z).bg === true && lastHello(z).v, z && lastHello(z));
    let logTxt = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
    ck('its messages in navdata.log', new RegExp(`ready for the EFB on ws://localhost:${port2} \\(started with Windows, no window\\)`).test(logTxt), logTxt.slice(-300));
    if (z) { z.w.send(JSON.stringify({ cmd: 'quit' })); await sleep(1500); }
    ck('closed from the EFB', !(await open(port2)) && c.exitCode !== null, c.exitCode);
    x = await open(port);
    x.w.send(JSON.stringify({ cmd: 'autostart', on: false }));
    const off = await answer(x, 'autostart');
    ck('back to with the EFB: the Run entry gone, and the copy', off && off.ok && off.on === false && runValue() === null && !fs.existsSync(COPY), { off, run: runValue(), copy: fs.existsSync(COPY) });
    x.w.close();
    ck('and it closes again after the wait', await within(a.exited, 9000) && a.code === 0, { code: a.code });
    /* Polaris Navdata 1.4 and 1.5's Run entry: this program with --startup */
    const port3 = port + 2;
    const b = run(['--startup', '--port', String(port3), '--xp-port', '1', '--no-link']);
    ck('--startup: this copy goes at once', await within(b.exited, 8000) && b.code === 0, { code: b.code });
    const y = await upBy(port3, 20000);
    ck('and a copy without a window is there', !!y && lastHello(y).bg === true, y && lastHello(y));
    logTxt = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
    ck('its messages in navdata.log too', new RegExp(`ready for the EFB on ws://localhost:${port3} \\(started with Windows, no window\\)`).test(logTxt), logTxt.slice(-300));
    if (y) { y.w.send(JSON.stringify({ cmd: 'quit' })); await sleep(1500); }
    ck('closed from the EFB', !(await open(port3)));
  } catch (e) { ck('no error', false, e.stack); }
  finally {
    try { a.kill(); } catch (e) { /* gone */ } try { execFileSync('reg', ['delete', RUN, '/v', 'Polaris Navdata', '/f'], { stdio: 'ignore' }); } catch (e) { /* not there */ }
    for (const f of [COPY, path.join(LAD, 'PolarisNavdata-bg.json')]) try { fs.unlinkSync(f); } catch (e) { /* not there */ }
  }
  if (!ok) console.log('--- Polaris Navdata said:\n' + a.out);
  console.log(ok ? 'ALL OK' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
})();
