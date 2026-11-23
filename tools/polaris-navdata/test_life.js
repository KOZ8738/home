/* Polaris Navdata's own life: who may connect, a page that stops answering, closing when no EFB is left, one copy at a
   time. node test_life.js   (NAVDATA_EXE=dist/PolarisNavdata.exe tests the .exe) */
'use strict';
const path = require('path'), { spawn } = require('child_process');
const { WebSocket } = require('ws');
let ok = true; const ck = (name, cond, extra) => { ok = ok && !!cond; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXE = process.env.NAVDATA_EXE, MAIN = path.join(__dirname, 'main.js');
const env = { ...process.env }; if (EXE) delete env.NODE_PATH;
/* (no X-Plane here: a port nothing listens on, and no X-Plane folder) */
const run = (port, extra) => {
  const a = ['--port', String(port), '--xp-port', '1', '--xplane', path.join(__dirname, 'no-such-folder'), '--no-link', ...extra];
  const c = EXE ? spawn(path.resolve(EXE), a, { env }) : spawn(process.execPath, [MAIN, ...a], { env });
  c.out = ''; c.stdout.on('data', (d) => { c.out += d; }); c.stderr.on('data', (d) => { c.out += d; });
  c.exited = new Promise((r) => c.on('exit', (code) => { c.code = code; r(code); })); return c;
};
const open = (port, o) => new Promise((r) => { const w = new WebSocket('ws://localhost:' + port, o); let first = null;
  w.on('message', (m) => { if (!first) { first = JSON.parse(String(m)); r({ w, hello: first }); } });
  w.on('unexpected-response', (q, res) => r({ refused: res.statusCode })); w.on('error', (e) => r({ err: e.message })); });
const upBy = async (port, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const x = await open(port); if (x.w) { x.w.close(); return true; } await sleep(250); } return false; };
const within = (p, ms) => Promise.race([p.then(() => true), sleep(ms).then(() => false)]);

(async () => {
  console.log('testing ' + (EXE ? path.resolve(EXE) : MAIN));
  const port = 22050 + Math.floor(Math.random() * 400);
  const a = run(port, ['--idle-sec', '4', '--ping-sec', '1']);
  try {
    ck('starts', await upBy(port, 15000), a.out);
    /* who may connect */
    const evil = await open(port, { origin: 'https://evil.example' });
    ck('another website: refused', evil.refused === 401, evil);
    const look = await open(port, { origin: 'https://koz8738.com.evil.example' });
    ck('a look-alike address: refused', look.refused === 401, look);
    const efb = await open(port, { origin: 'https://koz8738.com' });
    ck('the EFB (koz8738.com): connects, hello with nothing to read yet', efb.w && efb.hello.cmd === 'hello' && efb.hello.v === '1.3.0' && efb.hello.live === '' && efb.hello.sim === false, efb.hello);
    const local = await open(port, { origin: 'http://127.0.0.1:8796' }), prog = await open(port);
    ck('a page on this PC, and a program on this PC: connect', local.w && prog.w);
    local.w.close(); prog.w.close();
    /* a page that stops answering is let go (the others stay) */
    const dead = await open(port, { origin: 'https://koz8738.com', autoPong: false });
    const gone = new Promise((r) => dead.w.on('close', r));
    ck('a page that stops answering: let go after two missed answers', await within(gone, 5000));
    ck('a page that answers: kept', efb.w.readyState === 1);
    /* an EFB connected for longer than the wait: still open */
    await sleep(5500);
    ck('while an EFB is connected: stays open', a.exitCode === null && efb.w.readyState === 1);
    /* one copy at a time */
    const b = run(port, []);
    ck('a second copy: closes (the first is open)', await within(b.exited, 8000) && b.code === 0 && /already open/.test(b.out), { code: b.code, out: b.out.slice(-200) });
    const c2 = run(port, ['--from-link', 'polaris-navdata://start/']);
    ck('a second copy started by the EFB: closes at once, quietly', await within(c2.exited, 3000) && c2.code === 0 && !/already open/.test(c2.out), { code: c2.code });
    /* the last EFB goes: closes after the wait */
    const t0 = Date.now(); efb.w.close();
    ck('no EFB left: closes by itself after the wait', await within(a.exited, 9000) && a.code === 0 && Date.now() - t0 >= 3500, { code: a.code, after: Date.now() - t0 });
    ck('and says why', /No EFB on this PC for 4 s: closing/.test(a.out), a.out.split('\n').filter((l) => /closing/.test(l)));
    /* --stay keeps it open */
    const port2 = port + 1, s = run(port2, ['--idle-sec', '1', '--stay']);
    await upBy(port2, 15000); await sleep(3000);
    ck('--stay: stays open with no EFB', s.exitCode === null);
    s.kill();
  } catch (e) { ck('no error', false, e.stack); }
  finally { try { a.kill(); } catch (e) { /* gone */ } }
  if (!ok) console.log('--- Polaris Navdata said:\n' + a.out);
  console.log(ok ? 'ALL OK' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
})();
