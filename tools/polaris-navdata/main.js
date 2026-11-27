/* Polaris Navdata — runs on the simulator PC next to MSFS or X-Plane 12. The Polaris EFB (in a browser on this PC)
   talks to it on ws://localhost:2050:
   - an airport's SIDs, STARs and approaches, from the simulator's own navigation data: MSFS's through SimConnect
     (the default data, or Navigraph's if installed in the simulator), X-Plane's from its CIFP files (Navigraph's in
     Custom Data first); see navdata.js and xplane.js
   - the live values for the EFB's Backup PFD, landing rate, Ground (GSX) and OOOI times: MSFS's through SimConnect
     (msfs.js; no FSUIPC needed), X-Plane 12's through its own Web API (12.1.1 and later; xplane.js). Read from the
     simulator only while an EFB asks for them ({ cmd:"live", on, gsx })
   The pilot chooses, on the EFB (Ground › Simulator PC), how it runs on this PC:
   - with the EFB (the default): on Windows it sets up a polaris-navdata: link, so the EFB on this PC can start it (one
     tap, the browser asking once), and it closes by itself 10 minutes after the last EFB on this PC went away;
   - with Windows: it starts when the pilot signs in to Windows and keeps running, ready for the EFB. Windows starts a
     copy of this program made to have no window at all (%LOCALAPPDATA%\Polaris Navdata\PolarisNavdata-bg.exe, the
     same program marked as a windowed one that opens no window, so not even a console flashes up), through the Run
     entry in HKCU; its messages go to navdata.log there. The copy is made again when this program changes.
   A newer Polaris Navdata started while an older one runs (in the background, say) closes the older one and takes
   over; an older or the same one leaves it be and goes.
   Only the EFB's own pages (and programs on this PC) may connect. Nothing leaves this PC from here: the EFB keeps what
   it receives for its signed-in pilot only.
   Options: --safe       MSFS: read fix positions one by one instead of with the legs (for a simulator that stalls on that)
            --port N     listen on another port (the EFB uses 2050)
            --xplane DIR the X-Plane 12 folder (found by itself from X-Plane's list of installs otherwise)
            --xp-port N  X-Plane's Web API port (8086 unless X-Plane was started with --web_server_port)
            --stay       do not close when no EFB is connected
            --no-link    do not set up the polaris-navdata: link (nor read or change starting with Windows)
            --background (as Windows starts the copy) no window: messages to navdata.log
            --main EXE   (with it) the program it was copied from
            --startup    (as Polaris Navdata 1.4 and 1.5 had Windows start it) run a copy without a window and go
            --data-dir D where it keeps its log and its pairing (%LOCALAPPDATA%\\Polaris Navdata otherwise)
   With the pilot's say (on the EFB), it also sends to the EFB server by itself when no EFB is open on this PC, so
   the pilot's iPad has the PFD, Ground and the block times with only this running: see cloud.js.
   With OBS Studio set up on the EFB here (Ground › Simulator PC › Broadcast), it is also the go-between for the
   Operations admin's broadcast desk when the director puts this pilot's flight on it: OBS's scenes, pictures and
   stream state to the desk, the director's scene changes to OBS (obs.js, desk.js). It then stays open while on the
   desk, even with no EFB here. */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const { XpLink, CifpReader, findXPlane } = require('./xplane');
const { MsfsLive } = require('./msfs');
const { Cloud, dpapi } = require('./cloud');
const { ObsLink } = require('./obs');
const { Desk } = require('./desk');
/* SimConnect is for MSFS on Windows; without it (another system, or a build without it) only X-Plane is read */
let SC = null, ProcReader = null;
try { SC = require('node-simconnect'); ({ ProcReader } = require('./navdata')); } catch (e) { SC = null; }

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
/* (--as-version: the tests' stand-in for an older or newer Polaris Navdata) */
const VERSION = opt('--as-version') || '1.7.0';
const SAFE = args.includes('--safe'), STAY = args.includes('--stay'), FROM_LINK = args.includes('--from-link'), BG = args.includes('--background');
/* started by Windows at sign-in by Polaris Navdata 1.4 or 1.5's Run entry: the same program again, without a window,
   and this one goes (it then makes the copy that has none at all, and points the Run entry at it). The copy is started
   with its own entry point first, as Node is (pkg's .exe takes it the same way) */
if (args.includes('--startup') && !BG) {
  const c = require('child_process').spawn(process.execPath, [process.argv[1], ...args.filter((a) => a !== '--startup'), '--background'], { detached: true, stdio: 'ignore', windowsHide: true });
  c.unref(); process.exit(0);
}
const PORT = +(opt('--port') || 0) || 2050;
const XP_PORT = +(opt('--xp-port') || 0) || 8086;
/* (for the tests: shorter waits) */
const IDLE_MS = (+(opt('--idle-sec') || 0) || 600) * 1000, PING_MS = (+(opt('--ping-sec') || 0) || 30) * 1000;
const S = { handle: null, reader: null, live: null, sim: '', connecting: false, cache: new Map(), clients: new Set(), lastEfb: Date.now(), closing: false };
const stamp = () => new Date().toTimeString().slice(0, 8);
/* without a window, the messages go to a file (kept to its last 256 KB) */
const LOG_DIR = opt('--data-dir') || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Polaris Navdata') : path.join(os.homedir(), '.polaris-navdata')), LOG_FILE = path.join(LOG_DIR, 'navdata.log');
if (BG) {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); const st = fs.statSync(LOG_FILE); if (st.size > 512 * 1024) { const b = fs.readFileSync(LOG_FILE); fs.writeFileSync(LOG_FILE, b.subarray(b.length - 256 * 1024)); } } catch (e) { /* a new file */ }
  console.log = (...a) => { try { fs.appendFileSync(LOG_FILE, a.map(String).join(' ') + '\n'); } catch (e) { /* no file */ } };
  console.log('--- ' + new Date().toISOString() + ' started with Windows');
}
const log = (...a) => console.log(stamp(), ...a);

/* X-Plane: its folder (for the procedures) and its Web API (for the live values) */
let XP_DIR = findXPlane(opt('--xplane')), CIFP = XP_DIR ? new CifpReader(XP_DIR) : null;
const xpDir = () => { if (!CIFP) { XP_DIR = findXPlane(opt('--xplane')); CIFP = XP_DIR ? new CifpReader(XP_DIR) : null; } return CIFP; };
let saidNoDir = false;
const XP = new XpLink({ port: XP_PORT, log, onFrame: (f) => live(f), onState: () => {
  S.cache.clear();
  if (XP.st !== 'off' && !xpDir() && !saidNoDir) { saidNoDir = true; log('The X-Plane 12 folder was not found, so its SIDs and STARs cannot be read: close this window and start Polaris Navdata with --xplane "C:\\X-Plane 12" (your folder).'); }
  tell(hello());
} });

/* starting with Windows: true or false, or null where it cannot be chosen (not the Windows program) */
let AUTO = null;
const stayNow = () => STAY || AUTO === true || DESK.want || DESK.on;
/* sim: a simulator to read procedures from (X-Plane's are in its files, so from its main menu on); live: the simulator
   whose live values Navdata can give now ('msfs', or 'xp' once a flight is loaded in X-Plane), liveName its name */
function hello() {
  const xpUp = XP.st !== 'off', liveSim = S.handle ? 'msfs' : XP.on ? 'xp' : '';
  return { cmd: 'hello', app: 'Polaris Navdata', v: VERSION, sim: !!S.handle || xpUp, simName: S.handle ? S.sim : xpUp ? XP.name() : '', safe: SAFE,
    msfs: !!S.handle, xp: XP.on, xpName: xpUp ? XP.name() : '', xpWait: XP.st === 'wait' ? XP.err : '', xpData: !!CIFP,
    live: liveSim, liveName: liveSim === 'msfs' ? S.sim : liveSim === 'xp' ? XP.name() : '', autostart: AUTO, bg: BG, cloud: CLOUD.on, cloudKid: CLOUD.kid, obs: obsHello() };
}
/* OBS for the broadcast desk, as the EFB shows it (never the password itself: only whether one is kept) */
function obsHello() { return { on: OBS.on, st: OBS.st, err: OBS.err, v: OBS.v, port: OBS.port, pw: !!OBS.pw, remote: OBSCFG.remote, desk: DESK.on }; }
function tell(msg) { const s = JSON.stringify(msg); for (const c of S.clients) try { c.send(s); } catch (e) { /* gone */ } }
/* the live values, to the pages that asked for them (MSFS's while it runs, X-Plane's otherwise) */
function live(f, from) {
  if (from !== 'msfs' && S.handle) return;
  CLOUD.onFrame(f, from === 'msfs' ? 'msfs' : 'xp'); DESK.onFrame(f);
  const s = JSON.stringify({ cmd: 'live', f }); for (const c of S.clients) if (c.live) try { c.send(s); } catch (e) { /* gone */ }
}
function gsxOut(m) { CLOUD.onGsx(m); const s = JSON.stringify({ cmd: 'gsx', v: m.v, g: m.g }); for (const c of S.clients) if (c.gsx) try { c.send(s); } catch (e) { /* gone */ } }
/* what the pages want, from the simulators */
function applyWant() {
  const L = [...S.clients].some((c) => c.live) || CLOUD.wantLive || DESK.wantLive, G = [...S.clients].some((c) => c.gsx) || CLOUD.wantGsx;
  XP.want(L && !S.handle);
  if (S.live) try { S.live.want(L, G); } catch (e) { log('MSFS:', e.message); }
}

/* sending to the EFB server by itself, when the pilot turned it on and no EFB is open on this PC (cloud.js) */
const CLOUD = new Cloud({ dir: LOG_DIR, server: opt('--cloud-server'), pollMs: (+(opt("--cloud-poll-sec") || 0) || 30) * 1000, log, changed: () => applyWant(), paired: () => tell(hello()),
  sim: () => (S.handle ? 'msfs' : XP.on ? 'xp' : ''), localEfb: () => S.clients.size > 0 || Date.now() - S.lastEfb < 5000, procs: (ic) => procs(ic),
  obs: () => OBS.on, deskWanted: () => OBS.on && OBS.st === 'on', desk: (on) => DESK.set(on) });
/* OBS and the broadcast desk (obs.js, desk.js): set up on the EFB here, kept in obs.json (the password in this Windows
   user's protected storage, as the key is) */
const OBS_FILE = path.join(LOG_DIR, 'obs.json'), OBSCFG = { remote: false };
const OBS = new ObsLink({ log, changed: () => { tell(hello()); DESK.obsChanged(); }, ready: () => DESK.refresh(), event: (t, d) => DESK.event(t, d) });
const DESK = new Desk({ log, version: VERSION, server: () => CLOUD.server, api: (m, p, b) => CLOUD.api(m, p, b), obs: OBS, remote: () => OBSCFG.remote, changed: () => { applyWant(); tell(hello()); } });
async function obsLoad() {
  try {
    const j = JSON.parse(fs.readFileSync(OBS_FILE, 'utf8'));
    const pw = j.pw ? (j.enc ? await dpapi('out', j.pw) : String(j.pw)) : '';
    OBSCFG.remote = j.remote === true;
    if (j.on) { OBS.config(true, j.port, pw); log('Broadcast: OBS is set up on this PC (port ' + OBS.port + ') for the Operations broadcast desk.'); }
  } catch (e) { /* not set up */ }
}
async function obsSave() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    if (!OBS.on && !OBS.pw) { try { fs.unlinkSync(OBS_FILE); } catch (e) { /* none */ } return true; }
    let pw = OBS.pw, enc = false;
    if (pw && process.platform === 'win32') { pw = await dpapi('in', OBS.pw); enc = true; if (!pw) return false; }
    fs.writeFileSync(OBS_FILE, JSON.stringify({ on: OBS.on, port: OBS.port, pw, enc, remote: OBSCFG.remote }), { mode: 0o600 });
    return true;
  } catch (e) { return false; }
}
/* from the EFB here: { on, port, pw (only when typed: '' removes it; left out, the one kept stays), remote } */
async function obsSet(j) {
  const on = j.on === true, port = j.port != null ? Math.max(1, Math.min(65535, +j.port || 0)) : OBS.port;
  if (j.port != null && !(+j.port >= 1 && +j.port <= 65535)) return 'Not a port number (OBS uses 4455)';
  if (j.pw != null && (typeof j.pw !== 'string' || j.pw.length > 200)) return 'Not a password OBS would take';
  const pw = typeof j.pw === 'string' ? j.pw : OBS.pw, remote = typeof j.remote === 'boolean' ? j.remote : OBSCFG.remote;
  const relink = on !== OBS.on || port !== OBS.port || pw !== OBS.pw || (on && OBS.st !== 'on');
  OBSCFG.remote = remote;
  if (relink) OBS.config(on, port, pw);
  if (!(await obsSave())) return 'Could not keep the settings on this PC';
  if (relink) log(on ? 'Broadcast: OBS set up on this PC (port ' + port + ')' + (remote ? '; the desk may start and stop the stream.' : '.') : 'Broadcast: OBS no longer set up on this PC.');
  else log('Broadcast: the desk ' + (remote ? 'may' : 'may not') + ' start and stop the stream from now on.');
  DESK.cfgChanged();
  return '';
}
/* MSFS not there: looked for every 5 s at first, every 15 s once it has not been seen for 2 minutes */
let simSeenAt = Date.now();
const simLater = () => (Date.now() - simSeenAt < 120000 ? 5000 : 15000);
async function connect() {
  if (!SC || S.handle || S.connecting || S.closing) return; S.connecting = true;
  try {
    const { recvOpen, handle } = await SC.open('Polaris Navdata', SC.Protocol.KittyHawk);
    S.handle = handle; S.sim = recvOpen.applicationName || 'Flight Simulator'; S.cache.clear();
    S.reader = new ProcReader(handle, { coords: !SAFE });
    S.live = new MsfsLive(handle, SC, { log, onFrame: (f) => live(f, 'msfs'), onGsx: gsxOut });
    log('Connected to', S.sim + (SAFE ? ' (safe mode)' : ''));
    const lost = () => { if (!S.handle) return; S.handle = null; S.reader = null; S.live = null; S.cache.clear(); simSeenAt = Date.now(); if (S.closing) return; log('The simulator closed. Waiting for it again...'); tell(hello()); applyWant(); setTimeout(connect, 5000); };
    handle.on('quit', lost); handle.on('close', lost);
    handle.on('error', (e) => log('SimConnect:', e && e.message));
    handle.on('exception', (x) => { if (process.env.NAVDATA_DEBUG) log('SimConnect exception', x.exception, 'packet', x.sendId, 'index', x.index); });
    applyWant(); tell(hello());
  } catch (e) {
    if (!S.closing) setTimeout(connect, simLater());
  } finally { S.connecting = false; }
}

/* the procedures come from the simulator that is running: MSFS through SimConnect, X-Plane from its files */
async function procs(icao) {
  icao = String(icao || '').toUpperCase().trim();
  const src = S.reader ? 'msfs' : XP.st !== 'off' ? 'xp' : '';
  const c = S.cache.get(src + ':' + icao); if (c && Date.now() - c.at < 3600_000) return c.data;
  if (!src) throw new Error('The simulator is not running (or not connected yet)');
  if (src === 'xp' && !xpDir()) throw new Error('The X-Plane 12 folder was not found: start Polaris Navdata with --xplane "C:\\X-Plane 12"');
  const t0 = Date.now(), data = src === 'msfs' ? await S.reader.airport(icao) : CIFP.airport(icao);
  S.cache.set(src + ':' + icao, { at: Date.now(), data });
  const legs = [...data.dep, ...data.arr].reduce((n, p) => n + p.c.length + Object.values(p.rt).flat().length + Object.values(p.et).flat().length, 0);
  log(`${icao}: ${data.dep.length} SIDs, ${data.arr.length} STARs, ${(data.apr || []).length} approaches, ${legs} legs (${src === 'xp' ? 'X-Plane' : 'MSFS'}, ${Date.now() - t0} ms)`);
  return data;
}

/* who may connect: the EFB's pages (koz8738.com), pages on this PC (a test copy), and programs on this PC (they send no
   Origin). Another website is refused. */
const okOrigin = (o) => !o || /^https:\/\/([a-z0-9-]+\.)*koz8738\.com$/i.test(o) || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(o);

/* Windows, in this user's own settings (no administrator rights), pointing at this copy of the program (set again if
   the program was moved): the polaris-navdata: link the EFB starts it with, and starting with Windows if chosen */
const WIN = process.platform === 'win32' && !!process.pkg && !args.includes('--no-link');
const reg = (a) => new Promise((r) => require('child_process').execFile('reg', a, { windowsHide: true }, (e, out) => r(e ? null : String(out))));
/* the copy Windows starts, and the program it is made from (this one, unless this is the copy) */
const BG_EXE = path.join(LOG_DIR, 'PolarisNavdata-bg.exe'), BG_META = path.join(LOG_DIR, 'PolarisNavdata-bg.json');
const IS_COPY = path.resolve(process.execPath).toLowerCase() === path.resolve(BG_EXE).toLowerCase();
const MAIN_EXE = IS_COPY && opt('--main') ? path.resolve(opt('--main')) : process.execPath;
const RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', RUN_NAME = 'Polaris Navdata';
const RUN_CMD = () => `"${BG_EXE}" --background --main "${MAIN_EXE}"` + (opt('--data-dir') ? ` --data-dir "${LOG_DIR}"` : '');
/* a Windows program marked as windowed (subsystem 2) opens no console: the copy is this program so marked (the PE
   header's subsystem field, at its optional header + 68) */
function windowless(f) {
  const fd = fs.openSync(f, 'r+');
  try {
    const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0x3c); const pe = b.readUInt32LE(0), h = Buffer.alloc(26);
    fs.readSync(fd, h, 0, 26, pe);
    if (h.toString('latin1', 0, 4) !== 'PE\0\0' || ![0x10b, 0x20b].includes(h.readUInt16LE(24))) throw new Error('not a Windows program');
    const v = Buffer.alloc(2); fs.readSync(fd, v, 0, 2, pe + 24 + 68); const sub = v.readUInt16LE(0);
    if (sub !== 3 && sub !== 2) throw new Error('not a console program (' + sub + ')');
    v.writeUInt16LE(2, 0); fs.writeSync(fd, v, 0, 2, pe + 24 + 68);
  } finally { fs.closeSync(fd); }
}
/* made (again) when the program it comes from is not the one it was made from; one that is running is moved aside
   (a running program can be renamed, not replaced) and removed once it no longer runs */
async function makeCopy() {
  if (IS_COPY) return true;
  try {
    const st = fs.statSync(MAIN_EXE), want = { src: path.resolve(MAIN_EXE), size: st.size, mtime: Math.round(st.mtimeMs), v: VERSION };
    try { const m = JSON.parse(fs.readFileSync(BG_META, 'utf8')); if (m.src === want.src && m.size === want.size && m.mtime === want.mtime && fs.existsSync(BG_EXE)) return true; } catch (e) { /* none yet */ }
    fs.mkdirSync(LOG_DIR, { recursive: true });
    /* (the bytes copied, not the file: no mark of the download comes with it, as the program itself was already
       allowed to run) */
    const tmp = BG_EXE + '.new'; await require('stream').promises.pipeline(fs.createReadStream(MAIN_EXE), fs.createWriteStream(tmp)); windowless(tmp);
    try { fs.renameSync(tmp, BG_EXE); } catch (e) { fs.renameSync(BG_EXE, BG_EXE.replace(/\.exe$/, '-old-' + Date.now() + '.exe')); fs.renameSync(tmp, BG_EXE); }
    fs.writeFileSync(BG_META, JSON.stringify(want)); tidyCopies();
    return true;
  } catch (e) { log('Could not make the copy that starts with Windows: ' + e.message); return false; }
}
function tidyCopies() { try { for (const f of fs.readdirSync(LOG_DIR)) if (/^PolarisNavdata-bg-old-\d+\.exe$/.test(f)) try { fs.unlinkSync(path.join(LOG_DIR, f)); } catch (e) { /* still running */ } } catch (e) { /* no folder */ } }
function removeCopy() { if (IS_COPY) return; for (const f of [BG_EXE, BG_META, BG_EXE + '.new']) try { fs.unlinkSync(f); } catch (e) { /* running, or none */ } tidyCopies(); }
async function autoRead() {
  if (!WIN) { AUTO = null; return; }
  const out = await reg(['query', RUN, '/v', RUN_NAME]);
  AUTO = !!out;
  /* chosen: the copy brought up to date from this program and the Run entry pointed at it (Polaris Navdata 1.4 and
     1.5's entry started the program itself; and a program that was moved is this one from now on) */
  if (out && !IS_COPY && (await makeCopy()) && !out.includes(RUN_CMD())) await reg(['add', RUN, '/v', RUN_NAME, '/t', 'REG_SZ', '/d', RUN_CMD(), '/f']);
  if (!out) removeCopy();
}
async function autoSet(on) {
  if (!WIN) return 'Only the Windows program can start with Windows';
  if (on && !(await makeCopy())) return 'Could not set up the copy that starts with Windows';
  const ok = on ? (await reg(['add', RUN, '/v', RUN_NAME, '/t', 'REG_SZ', '/d', RUN_CMD(), '/f'])) !== null : (await reg(['delete', RUN, '/v', RUN_NAME, '/f'])) !== null || (await reg(['query', RUN, '/v', RUN_NAME])) === null;
  await autoRead();
  if (!ok || AUTO !== on) return 'Windows did not take the change';
  log(on ? 'Starts with Windows from now on, without a window, and keeps running, ready for the EFB.' : 'No longer starts with Windows: the EFB starts it, and it closes 10 minutes after the EFB.');
  return '';
}
function registerLink() {
  if (!WIN || !fs.existsSync(MAIN_EXE)) return;
  /* (the program itself, also from the copy: started from the EFB, it has its window) */
  const exe = MAIN_EXE, K = 'HKCU\\Software\\Classes\\polaris-navdata', cmd = `"${exe}" --from-link "%1"`;
  (async () => {
    const now = await reg(['query', K + '\\shell\\open\\command', '/ve']);
    if (now && now.includes(cmd)) return;
    const ok = (await reg(['add', K, '/ve', '/d', 'URL:Polaris Navdata', '/f'])) !== null && (await reg(['add', K, '/v', 'URL Protocol', '/d', '', '/f'])) !== null
      && (await reg(['add', K + '\\DefaultIcon', '/ve', '/d', `"${exe}",0`, '/f'])) !== null && (await reg(['add', K + '\\shell\\open\\command', '/ve', '/d', cmd, '/f'])) !== null;
    log(ok ? 'Set up: the EFB on this PC can now start Polaris Navdata by itself (the browser asks once).' : 'Could not set up the polaris-navdata: link, so the EFB cannot start Polaris Navdata by itself: open it yourself.');
  })();
}

function shutdown(why) {
  if (S.closing) return; S.closing = true; log(why);
  try { XP.stop(); } catch (e) { /* stopped */ }
  try { CLOUD.stop(); } catch (e) { /* stopped */ }
  try { DESK.stop(); OBS.stop(); } catch (e) { /* stopped */ }
  try { if (S.live) S.live.stop(); if (S.handle) S.handle.close(); } catch (e) { /* closed */ }
  for (const c of S.clients) try { c.close(1001, 'closing'); } catch (e) { /* gone */ }
  try { if (wss) wss.close(); } catch (e) { /* closed */ }
  setTimeout(() => process.exit(0), 300);
}
const idleText = () => (IDLE_MS >= 60000 ? Math.round(IDLE_MS / 60000) + ' minutes' : Math.round(IDLE_MS / 1000) + ' s');

let wss = null, listened = false;
function serve() {
  wss = new WebSocketServer({ host: '127.0.0.1', port: PORT, verifyClient: (info) => okOrigin(info.origin) });
  wss.on('listening', onListening); wss.on('error', onServerError); wss.on('connection', onConnection);
}
/* one copy at a time: an older Polaris Navdata that is running (1.3 and later close when asked) makes way for this one */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newer = (a, b) => { const A = String(a).split('.').map((x) => parseInt(x, 10) || 0), B = String(b).split('.').map((x) => parseInt(x, 10) || 0); for (let i = 0; i < 3; i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) > (B[i] || 0); return false; };
const portFree = () => new Promise((r) => { const t = require('net').createServer(); t.once('error', () => r(false)); t.listen(PORT, '127.0.0.1', () => t.close(() => r(true))); });
let tookOver = false;
async function takeOver() {
  if (tookOver) return false;
  const o = await new Promise((r) => {
    let w; try { w = new WebSocket('ws://127.0.0.1:' + PORT); } catch (e) { r(null); return; }
    const t = setTimeout(() => { try { w.terminate(); } catch (e) { /* gone */ } r(null); }, 3000);
    w.on('message', (m) => { let j; try { j = JSON.parse(String(m)); } catch (e) { return; } if (j.cmd === 'hello') { clearTimeout(t); r({ w, v: String(j.v || '') }); } });
    w.on('error', () => { clearTimeout(t); r(null); });
  });
  if (!o) return false;
  if (!newer(VERSION, o.v)) { try { o.w.close(); } catch (e) { /* gone */ } return false; }
  tookOver = true;
  log(`Polaris Navdata ${o.v} was running: it closes, and this one (${VERSION}) takes over.`);
  try { o.w.send(JSON.stringify({ cmd: 'quit', why: 'newer' })); } catch (e) { /* gone */ }
  for (let i = 0; i < 20; i++) { await sleep(500); if (await portFree()) { serve(); return true; } }
  log(`Polaris Navdata ${o.v} did not close.`);
  return false;
}
function onListening() {
  listened = true;
  log(`Polaris Navdata ${VERSION} ready for the EFB on ws://localhost:${PORT}` + (BG ? ' (started with Windows, no window)' : ''));
  registerLink();
  CLOUD.load(); obsLoad();
  autoRead().then(() => { if (AUTO) log('Starts with Windows (chosen on the EFB, Ground › Simulator PC): it keeps running, ready for the EFB.'); tell(hello()); });
  connect();
  XP.start();
  /* a page that stopped answering (a browser that froze, or closed without a goodbye) is let go; a page in the
     background still answers, as the browser itself answers these */
  setInterval(() => { for (const c of S.clients) { if (c.alive === false) { c.terminate(); continue; } c.alive = false; try { c.ping(); } catch (e) { /* gone */ } } }, PING_MS);
  /* no EFB on this PC for 10 minutes: close (the EFB starts it again when it is needed) */
  setInterval(() => {
    if (S.clients.size) S.lastEfb = Date.now();
    else if (!stayNow() && Date.now() - S.lastEfb > IDLE_MS) shutdown(`No EFB on this PC for ${idleText()}: closing. The EFB starts Polaris Navdata again when you need it.`);
  }, Math.min(5000, Math.max(250, IDLE_MS / 4)));
}
function onServerError(e) {
  if (e.code === 'EADDRINUSE' && !listened) {
    takeOver().then((done) => {
      if (done) return;
      /* already open (perhaps in the background), and not older: this copy goes (at once when the EFB or Windows
         started it) */
      const quiet = FROM_LINK || BG;
      if (!quiet) log(`Polaris Navdata is already open (port ${PORT} is in use; it may be running in the background). This window closes.`);
      setTimeout(() => process.exit(0), quiet ? 0 : 4000);
    });
    return;
  }
  log('Server: ' + e.message);
}
function onConnection(ws) {
  ws.alive = true; ws.live = false; ws.gsx = false; ws.on('pong', () => { ws.alive = true; });
  S.clients.add(ws); S.lastEfb = Date.now(); ws.send(JSON.stringify(hello()));
  /* the times stamped while no EFB was open here, for the EFB to take over with */
  if (CLOUD.flight && Object.keys(CLOUD.oo).length) ws.send(JSON.stringify({ cmd: 'oo', fid: CLOUD.flight.fid, oo: CLOUD.oo }));
  ws.on('close', () => { S.clients.delete(ws); S.lastEfb = Date.now(); applyWant(); });
  ws.on('message', async (raw) => {
    let j; try { j = JSON.parse(String(raw)); } catch (e) { return; }
    if (j.cmd === 'hello') return ws.send(JSON.stringify(hello()));
    if (j.cmd === 'live') { ws.live = j.on === true; ws.gsx = j.gsx === true; applyWant(); return; }
    /* the pilot's choice on the EFB: start with Windows, or with the EFB */
    if (j.cmd === 'autostart') { const err = await autoSet(j.on === true); ws.send(JSON.stringify({ cmd: 'autostart', ok: !err, on: AUTO, error: err })); tell(hello()); return; }
    if (j.cmd === 'quit') { shutdown(j.why === 'newer' ? 'A newer Polaris Navdata takes over: closing.' : 'Closed from the EFB.'); return; }
    /* sending by itself: the key from the EFB (or none, to stop), and the EFB's settings for it */
    if (j.cmd === 'cloud') { const err = await CLOUD.set(j); ws.send(JSON.stringify({ cmd: 'cloud', ok: !err, on: CLOUD.on, kid: CLOUD.kid, error: err })); return; }
    /* OBS for the broadcast desk: its port and password, and whether the desk may start and stop the stream */
    if (j.cmd === 'obs') { const err = await obsSet(j); ws.send(JSON.stringify({ cmd: 'obs', ok: !err, error: err, obs: obsHello() })); tell(hello()); return; }
    if (j.cmd === 'procs') {
      try { const data = await procs(j.icao); ws.send(JSON.stringify({ cmd: 'procs', id: j.id, icao: data.icao, ok: true, data })); }
      catch (e) { ws.send(JSON.stringify({ cmd: 'procs', id: j.id, icao: String(j.icao || '').toUpperCase(), ok: false, error: e.message })); log(String(j.icao), '-', e.message); }
    }
  });
}
serve();

console.log('Polaris Navdata ' + VERSION + ' for the Polaris EFB: SIDs, STARs and approaches from ' + (SC ? 'MSFS or X-Plane 12' : 'X-Plane 12 (no MSFS on this system)') + ', and the live values for the Backup PFD, Ground and the block times. '
  + (BG ? 'Started with Windows, without a window: it keeps running, ready for the EFB.' : STAY ? 'Keep this window open while you fly.' : 'Unless you chose to start it with Windows (on the EFB, Ground › Simulator PC), it closes by itself ' + idleText() + ' after the EFB on this PC closes, and the EFB starts it again.'));
log('Waiting for the simulator (start ' + (SC ? 'MSFS or X-Plane 12' : 'X-Plane 12') + (BG ? '' : '; this window can stay open') + ')...' + (XP_DIR ? ' X-Plane folder: ' + XP_DIR : ''));
