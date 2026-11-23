/* Polaris Navdata — runs on the simulator PC next to MSFS or X-Plane 12. The Polaris EFB (in a browser on this PC)
   talks to it on ws://localhost:2050:
   - an airport's SIDs, STARs and approaches, from the simulator's own navigation data: MSFS's through SimConnect
     (the default data, or Navigraph's if installed in the simulator), X-Plane's from its CIFP files (Navigraph's in
     Custom Data first); see navdata.js and xplane.js
   - with X-Plane 12, the live values for the EFB's Backup PFD and its OOOI times, through X-Plane's own Web API
     (12.1.1 and later; MSFS gives the EFB these through FSUIPC instead)
   Nothing leaves this PC from here: the EFB keeps what it receives for its signed-in pilot only.
   Options: --safe       MSFS: read fix positions one by one instead of with the legs (for a simulator that stalls on that)
            --port N     listen on another port (the EFB uses 2050)
            --xplane DIR the X-Plane 12 folder (found by itself from X-Plane's list of installs otherwise)
            --xp-port N  X-Plane's Web API port (8086 unless X-Plane was started with --web_server_port) */
'use strict';
const { WebSocketServer } = require('ws');
const { XpLink, CifpReader, findXPlane } = require('./xplane');
/* SimConnect is for MSFS on Windows; without it (another system, or a build without it) only X-Plane is read */
let SC = null, ProcReader = null;
try { SC = require('node-simconnect'); ({ ProcReader } = require('./navdata')); } catch (e) { SC = null; }

const VERSION = '1.2.0';
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const SAFE = args.includes('--safe');
const PORT = +(opt('--port') || 0) || 2050;
const XP_PORT = +(opt('--xp-port') || 0) || 8086;
const S = { handle: null, reader: null, sim: '', connecting: false, cache: new Map(), clients: new Set() };
const stamp = () => new Date().toTimeString().slice(0, 8);
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

/* sim: a simulator to read procedures from (X-Plane's are in its files, so from its main menu on); xp: X-Plane's live
   values are coming (a flight is loaded) */
function hello() {
  const xpUp = XP.st !== 'off';
  return { cmd: 'hello', app: 'Polaris Navdata', v: VERSION, sim: !!S.handle || xpUp, simName: S.handle ? S.sim : xpUp ? XP.name() : '', safe: SAFE,
    msfs: !!S.handle, xp: XP.on, xpName: xpUp ? XP.name() : '', xpWait: XP.st === 'wait' ? XP.err : '', xpData: !!CIFP };
}
function tell(msg) { const s = JSON.stringify(msg); for (const c of S.clients) try { c.send(s); } catch (e) { /* gone */ } }
/* the live values, to the pages that asked for them */
function live(f) { const s = JSON.stringify({ cmd: 'live', f }); for (const c of S.clients) if (c.live) try { c.send(s); } catch (e) { /* gone */ } }

async function connect() {
  if (!SC || S.handle || S.connecting) return; S.connecting = true;
  try {
    const { recvOpen, handle } = await SC.open('Polaris Navdata', SC.Protocol.KittyHawk);
    S.handle = handle; S.sim = recvOpen.applicationName || 'Flight Simulator'; S.cache.clear();
    S.reader = new ProcReader(handle, { coords: !SAFE });
    log('Connected to', S.sim + (SAFE ? ' (safe mode)' : ''));
    const lost = () => { if (!S.handle) return; S.handle = null; S.reader = null; S.cache.clear(); log('The simulator closed. Waiting for it again...'); tell(hello()); setTimeout(connect, 5000); };
    handle.on('quit', lost); handle.on('close', lost);
    handle.on('error', (e) => log('SimConnect:', e && e.message));
    handle.on('exception', (x) => { if (process.env.NAVDATA_DEBUG) log('SimConnect exception', x.exception, 'packet', x.sendId, 'index', x.index); });
    tell(hello());
  } catch (e) {
    setTimeout(connect, 5000);
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

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
wss.on('listening', () => log(`Polaris Navdata ${VERSION} ready for the EFB on ws://localhost:${PORT}`));
wss.on('error', (e) => { log(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use: is Polaris Navdata already open?` : 'Server: ' + e.message); });
wss.on('connection', (ws) => {
  S.clients.add(ws); ws.send(JSON.stringify(hello()));
  ws.on('close', () => S.clients.delete(ws));
  ws.on('message', async (raw) => {
    let j; try { j = JSON.parse(String(raw)); } catch (e) { return; }
    if (j.cmd === 'hello') return ws.send(JSON.stringify(hello()));
    if (j.cmd === 'live') { ws.live = j.on !== false; return; }
    if (j.cmd === 'procs') {
      try { const data = await procs(j.icao); ws.send(JSON.stringify({ cmd: 'procs', id: j.id, icao: data.icao, ok: true, data })); }
      catch (e) { ws.send(JSON.stringify({ cmd: 'procs', id: j.id, icao: String(j.icao || '').toUpperCase(), ok: false, error: e.message })); log(String(j.icao), '-', e.message); }
    }
  });
});

console.log('Polaris Navdata ' + VERSION + ' for the Polaris EFB: SIDs, STARs and approaches from ' + (SC ? 'MSFS or X-Plane 12' : 'X-Plane 12 (no MSFS on this system)') + ', and X-Plane 12\'s live values for the Backup PFD and the block times. Keep this window open while you fly.');
log('Waiting for the simulator (start ' + (SC ? 'MSFS or X-Plane 12' : 'X-Plane 12') + '; this window can stay open)...' + (XP_DIR ? ' X-Plane folder: ' + XP_DIR : ''));
connect();
XP.start();
