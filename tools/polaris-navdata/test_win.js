/* Windows only, on the built program (NAVDATA_EXE=dist/PolarisNavdata.exe node test_win.js): starting with Windows,
   chosen on the EFB (the Run entry in this user's settings, and staying open while it is chosen), and the copy without
   a window that Windows starts (--startup), with its messages in %LOCALAPPDATA%\Polaris Navdata\navdata.log. */
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
    ck('the Run entry: this program, --startup', runValue() === `"${exe}" --startup`, runValue());
    await sleep(300);
    ck('hello says so', lastHello(x).autostart === true, lastHello(x));
    x.w.close(); await sleep(5000);
    ck('chosen: stays open with no EFB', a.exitCode === null);
    x = await open(port);
    x.w.send(JSON.stringify({ cmd: 'autostart', on: false }));
    const off = await answer(x, 'autostart');
    ck('back to with the EFB: the Run entry gone', off && off.ok && off.on === false && runValue() === null, { off, run: runValue() });
    x.w.close();
    ck('and it closes again after the wait', await within(a.exited, 9000) && a.code === 0, { code: a.code });
    /* as Windows starts it */
    const port2 = port + 1, LOG = path.join(process.env.LOCALAPPDATA, 'Polaris Navdata', 'navdata.log');
    const b = run(['--startup', '--port', String(port2), '--xp-port', '1', '--no-link']);
    ck('--startup: this copy goes at once', await within(b.exited, 8000) && b.code === 0, { code: b.code });
    const y = await upBy(port2, 20000);
    ck('and a copy without a window is there', !!y && lastHello(y).bg === true, y && lastHello(y));
    const logTxt = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
    ck('its messages in navdata.log', new RegExp(`ready for the EFB on ws://localhost:${port2} \\(started with Windows, no window\\)`).test(logTxt), logTxt.slice(-300));
    if (y) { y.w.send(JSON.stringify({ cmd: 'quit' })); await sleep(1500); }
    ck('closed from the EFB', !(await open(port2)));
  } catch (e) { ck('no error', false, e.stack); }
  finally { try { a.kill(); } catch (e) { /* gone */ } try { execFileSync('reg', ['delete', RUN, '/v', 'Polaris Navdata', '/f'], { stdio: 'ignore' }); } catch (e) { /* not there */ } }
  if (!ok) console.log('--- Polaris Navdata said:\n' + a.out);
  console.log(ok ? 'ALL OK' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
})();
