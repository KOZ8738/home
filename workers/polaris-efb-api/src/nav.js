/* Polaris Navdata on the pilot's simulator PC, sending straight here (no EFB open on that PC).
   Simulator -> Polaris Navdata -> this server -> the pilot's iPad: the Backup PFD's frames through the PFD relay
   (pfd.js), Ground's values, the OOOI times and the last touchdown into the pilot's Ground record (crew.js, gsxSet), and
   the procedures of the flight's airports into the pilot's own procedure store (np:<pilot>:<ICAO>, as the EFB's
   /api/efb/navproc keeps them).

   The pilot's EFB, signed in (Ground > Simulator PC, on that PC):
     POST /api/efb/nav/pair    { name }  -> { key, kid }   a key for Navdata on that PC (auth.js, navPair)
     GET  /api/efb/nav/pairs             -> { pairs: [{ kid, name, t, last }] }
     POST /api/efb/nav/unpair  { kid }   -> { ok }
   Polaris Navdata, with that key (Authorization: Bearer); it is good for nothing else:
     POST /api/nav/ticket                -> { ticket }     for /api/efb/pfd/ws?nav=1&ticket= (it only ever sends)
     GET  /api/nav/flight                -> { flight: { fid, flight, from, to, at } | null, oo: { OUT, OFF, ON, IN } }
                                            the plan the pilot has loaded (kept by the EFB's plan sync), and the
                                            times already kept for it
     POST /api/nav/gsx     { v, ac, fid, oo, land }        Ground's values (as the EFB's /api/efb/gsx), the times it
                                            stamped (only empty ones are filled) and the last touchdown
     POST /api/nav/navproc { data }      an airport's procedures read from the simulator */
import { sessionOf, navPair, navList, navUnpair, navUser, navWsTicket } from './auth.js';
import { crew } from './crew.js';

export async function navRoute(req, url, env, h) {
  const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  const path = url.pathname.replace(/\/+$/, '');
  const body = async (max) => { const t = await req.text(); if (t.length > max) return null; try { return JSON.parse(t) || {}; } catch (e) { return null; } };
  /* ---- the EFB ---- */
  if (path.startsWith('/api/efb/nav/')) {
    const me = await sessionOf(req, env, true);
    if (!me) return res({ error: 'Sign in first' }, 401);
    if (path === '/api/efb/nav/pairs' && req.method === 'GET') return res({ pairs: await navList(env, me.u) });
    if (req.method !== 'POST') return res({ error: 'Method not allowed' }, 405);
    const b = await body(2000); if (!b) return res({ error: 'Bad body' }, 400);
    if (path === '/api/efb/nav/pair') { const k = await navPair(env, me.u, b.name); return k ? res(k) : res({ error: 'Sign in again' }, 401); }
    if (path === '/api/efb/nav/unpair') return res({ ok: await navUnpair(env, me.u, String(b.kid || '')) });
    return res({ error: 'Not found' }, 404);
  }
  /* ---- Polaris Navdata ---- */
  const nav = await navUser(req, env);
  if (!nav) return res({ error: 'Not paired (pair Polaris Navdata again on the EFB, Ground > Simulator PC)' }, 401);
  const u = nav.u;
  if (path === '/api/nav/ticket' && req.method === 'POST') return res({ ticket: await navWsTicket(env, u) });
  if (path === '/api/nav/flight' && req.method === 'GET') {
    const [s, g] = await Promise.all([crew(env, { op: 'syncGet', u }), crew(env, { op: 'gsxGet', u })]);
    const o = s && s.sync && s.sync.ofp, fl = o && !o.cleared && o.id ? { fid: String(o.id), flight: o.flight || '', from: o.from || '', to: o.to || '', at: o.at || 0 } : null;
    return res({ flight: fl, oo: fl && g && g.gsx && g.gsx.fid === fl.fid ? g.gsx.oo || {} : {} });
  }
  if (path === '/api/nav/gsx' && req.method === 'POST') {
    const b = await body(20000); if (!b) return res({ error: 'Bad body' }, 400);
    return res(await crew(env, { op: 'gsxSet', u, nav: true, v: b.v && typeof b.v === 'object' ? b.v : {}, ac: b.ac, fid: b.fid, oo: b.oo, land: b.land }));
  }
  if (path === '/api/nav/navproc' && req.method === 'POST') {
    const b = await body(3_000_000); if (!b) return res({ error: 'Bad body' }, 400);
    const d = b.data, ic = String((d && d.icao) || '').toUpperCase();
    if (!d || !/^[A-Z0-9]{3,4}$/.test(ic) || !Array.isArray(d.dep) || !Array.isArray(d.arr) || !Array.isArray(d.rw)) return res({ error: 'Not procedure data' }, 400);
    await env.STORE.put('np:' + u + ':' + ic, JSON.stringify({ ...d, icao: ic, up: Date.now() }), { expirationTtl: 90 * 86400 });
    return res({ ok: true, icao: ic });
  }
  return res({ error: 'Not found' }, 404);
}
