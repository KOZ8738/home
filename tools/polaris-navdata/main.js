/* Polaris Navdata — runs on the simulator PC next to MSFS. The Polaris EFB (in a browser on this PC) asks it for an
   airport's SIDs, STARs and approaches on ws://localhost:2050; it reads them from the simulator's own navigation data (the default
   data, or Navigraph's if installed in the simulator) through SimConnect. Nothing leaves this PC from here: the EFB
   keeps what it receives for its signed-in pilot only.
   Options: --safe   read fix positions one by one instead of with the legs (for a simulator that stalls on that)
            --port N listen on another port (the EFB uses 2050) */
'use strict';
const { open, Protocol } = require('node-simconnect');
const { WebSocketServer } = require('ws');
const { ProcReader } = require('./navdata');

const VERSION = '1.1.0';
const args = process.argv.slice(2);
const SAFE = args.includes('--safe');
const PORT = +(args[args.indexOf('--port') + 1] || 0) || 2050;
const S = { handle: null, reader: null, sim: '', connecting: false, cache: new Map(), clients: new Set() };
const stamp = () => new Date().toTimeString().slice(0, 8);
const log = (...a) => console.log(stamp(), ...a);

function hello() { return { cmd: 'hello', app: 'Polaris Navdata', v: VERSION, sim: !!S.handle, simName: S.sim, safe: SAFE }; }
function tell(msg) { const s = JSON.stringify(msg); for (const c of S.clients) try { c.send(s); } catch (e) {} }

async function connect() {
  if (S.handle || S.connecting) return; S.connecting = true;
  try {
    const { recvOpen, handle } = await open('Polaris Navdata', Protocol.KittyHawk);
    S.handle = handle; S.sim = recvOpen.applicationName || 'Flight Simulator'; S.cache.clear();
    S.reader = new ProcReader(handle, { coords: !SAFE });
    log('Connected to', S.sim + (SAFE ? ' (safe mode)' : ''));
    const lost = () => { if (!S.handle) return; S.handle = null; S.reader = null; log('The simulator closed. Waiting for it again...'); tell(hello()); setTimeout(connect, 5000); };
    handle.on('quit', lost); handle.on('close', lost);
    handle.on('error', (e) => log('SimConnect:', e && e.message));
    handle.on('exception', (x) => { if (process.env.NAVDATA_DEBUG) log('SimConnect exception', x.exception, 'packet', x.sendId, 'index', x.index); });
    tell(hello());
  } catch (e) {
    if (!S.waitSaid) { log('Waiting for the simulator (start MSFS; this window can stay open)...'); S.waitSaid = true; }
    setTimeout(connect, 5000);
  } finally { S.connecting = false; }
}

async function procs(icao) {
  icao = String(icao || '').toUpperCase().trim();
  const c = S.cache.get(icao); if (c && Date.now() - c.at < 3600_000) return c.data;
  if (!S.reader) throw new Error('The simulator is not running (or not connected yet)');
  const t0 = Date.now(), data = await S.reader.airport(icao);
  S.cache.set(icao, { at: Date.now(), data });
  const legs = [...data.dep, ...data.arr].reduce((n, p) => n + p.c.length + Object.values(p.rt).flat().length + Object.values(p.et).flat().length, 0);
  log(`${icao}: ${data.dep.length} SIDs, ${data.arr.length} STARs, ${(data.apr || []).length} approaches, ${legs} legs (${Date.now() - t0} ms)`);
  return data;
}

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
wss.on('listening', () => log(`Polaris Navdata ${VERSION} ready for the EFB on ws://localhost:${PORT}`));
wss.on('error', (e) => { log(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use: is Polaris Navdata already open?` : 'Server: ' + e.message); });
wss.on('connection', (ws, req) => {
  S.clients.add(ws); ws.send(JSON.stringify(hello()));
  ws.on('close', () => S.clients.delete(ws));
  ws.on('message', async (raw) => {
    let j; try { j = JSON.parse(String(raw)); } catch (e) { return; }
    if (j.cmd === 'hello') return ws.send(JSON.stringify(hello()));
    if (j.cmd === 'procs') {
      try { const data = await procs(j.icao); ws.send(JSON.stringify({ cmd: 'procs', id: j.id, icao: data.icao, ok: true, data })); }
      catch (e) { ws.send(JSON.stringify({ cmd: 'procs', id: j.id, icao: String(j.icao || '').toUpperCase(), ok: false, error: e.message })); log(String(j.icao), '-', e.message); }
    }
  });
});

console.log('Polaris Navdata ' + VERSION + ' — SIDs and STARs from your simulator for the Polaris EFB. Keep this window open while you plan.');
connect();
