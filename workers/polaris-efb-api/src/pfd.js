/* Backup PFD relay (the EFB's PFD app, pfd.js in the EFB).
   The EFB on the simulator PC reads the aircraft's attitude, speeds and altitude from FSUIPC 15 times a second and sends
   them here over a WebSocket ("pub"); the pilot's iPad or phone receives them over another ("sub"). One relay (a Durable
   Object) per pilot, so only the pilot's own devices see the pilot's aircraft. Nothing is stored.
     POST /api/efb/pfd/ticket            (signed in)  -> { ticket }   valid 60 s, for one WebSocket connection
     GET  /api/efb/pfd/ws?role=pub|sub&ticket=...    (WebSocket)
   Messages: the PC's frames are passed on as they are (the last one goes to a device that joins); {"ping":n} is answered
   {"pong":n} (for the latency shown); the relay tells the PC how many devices watch ({"subs":n}, so it reads and sends
   only while someone does) and the devices whether the PC is there ({"pub":true|false}). */
import { sessionOf, wsTicket, wsTicketUser, navWsTicketUser } from './auth.js';

export async function pfdRoute(req, url, env, h) {
  const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/api/efb/pfd/ticket') {
    if (req.method !== 'POST') return res({ error: 'Method not allowed' }, 405);
    const me = await sessionOf(req, env);
    if (!me) return res({ error: 'Sign in first' }, 401);
    return res({ ticket: await wsTicket(env, me.u) });
  }
  if (path === '/api/efb/pfd/ws') {
    if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return res({ error: 'WebSocket only' }, 426);
    /* Polaris Navdata on the simulator PC (nav=1, with its own kind of ticket: see nav.js) only ever sends */
    const nav = url.searchParams.get('nav') === '1';
    const origin = req.headers.get('Origin') || '', allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim());
    if (!nav && !allowed.includes(origin)) return new Response('Not allowed', { status: 403 });
    const u = nav ? await navWsTicketUser(env, url.searchParams.get('ticket')) : await wsTicketUser(env, url.searchParams.get('ticket'));
    if (!u) return new Response('Sign in first', { status: 401 });
    const role = nav || url.searchParams.get('role') === 'pub' ? 'pub' : 'sub';
    const stub = env.PFD.get(env.PFD.idFromName(u));
    return stub.fetch(new Request('https://pfd/ws?role=' + role, req));
  }
  return res({ error: 'Not found' }, 404);
}

export class PfdRelay {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.last = null; }
  socks(tag, except) { return this.ctx.getWebSockets(tag).filter((w) => w !== except && w.readyState !== 3 && w.readyState !== 2); }
  send(w, m) { try { w.send(typeof m === 'string' ? m : JSON.stringify(m)); } catch (e) {} }
  tellPub(except) { const n = this.socks('sub', except).length; for (const w of this.socks('pub', except)) this.send(w, { subs: n }); }
  tellSubs(on, except) { for (const w of this.socks('sub', except)) this.send(w, { pub: on }); }
  async fetch(req) {
    const role = new URL(req.url).searchParams.get('role') === 'pub' ? 'pub' : 'sub';
    const [client, server] = Object.values(new WebSocketPair());
    /* one PC at a time: a new one replaces the old */
    if (role === 'pub') for (const w of this.socks('pub')) { try { w.close(4000, 'Another simulator PC took over'); } catch (e) {} }
    this.ctx.acceptWebSocket(server, [role]);
    if (role === 'pub') { this.send(server, { hello: 1, subs: this.socks('sub').length }); this.tellSubs(true); }
    else { this.send(server, { hello: 1, pub: this.socks('pub').length > 0 }); if (this.last) this.send(server, this.last); this.tellPub(); }
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 4000) return;
    if (msg.startsWith('{"ping"')) { this.send(ws, '{"pong"' + msg.slice(7)); return; }
    if (this.ctx.getTags(ws)[0] !== 'pub') return;
    this.last = msg;
    for (const w of this.socks('sub')) this.send(w, msg);
  }
  gone(ws) {
    const role = this.ctx.getTags(ws)[0];
    if (role === 'sub') this.tellPub(ws);
    else if (!this.socks('pub', ws).length) { this.last = null; this.tellSubs(false, ws); }
  }
  webSocketClose(ws, code) { try { ws.close(code === 1005 || code === 1006 ? 1000 : code, ''); } catch (e) {} this.gone(ws); }
  webSocketError(ws) { this.gone(ws); }
}
