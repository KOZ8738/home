/* ---------- AOC messages and Hoppie ACARS, for the EFB's Messages ----------
   AOC: Polaris operations (staff) send a short company message to the flight deck from /admin (behind
   Cloudflare Access; the Messages tab, sent as AOC, or the AOC button on a Live flight): to all pilots, or to one pilot
   by pilot ID or VATSIM CID, as Mail does, or to a flight's crew: the pilots listed (both seats of a two-pilot crew) and
   every EFB flying that callsign for 18 hours after it was sent. Pilots read them in the
   EFB under Flight › Messages, beside what reaches their aircraft on Hoppie's ACARS. Pilots cannot answer an AOC
   message: there is no route for it, on purpose.

   Hoppie: the EFB shows the messages waiting for the pilot's callsign on Hoppie's ACARS network. Hoppie's server does
   not answer browsers (no CORS), so the EFB asks here and this Worker asks Hoppie. It only ever uses type=peek, which
   reads messages without taking them off the network, so the aircraft's own ACARS still gets every one of them; it
   never sends anything. The pilot's Hoppie logon code comes in the request body and is not kept here.

   KV (STORE):  aoc:v1:index -> [{ id, t, title, body, to: { pilot, cid, cs, name } | { crew: 1, cs, m: [{ pilot, cid, name }] } | null, by }] */
import { crew, mailTo, crewTo, toMatch } from './crew.js';

class AocError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const IDX = 'aoc:v1:index', AOC_MAX = 300, BODY_MAX = 2000, SHOW_DAYS = 30;
const jsonRes = (body, status, headers) => new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const line = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const text = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);

let mem = null; // { at, list } a short cache for the pilots' side
async function readIndex(kv) { const v = await kv.get(IDX, 'json'); return Array.isArray(v) ? v : []; }
async function writeIndex(kv, list) { list.sort((a, b) => b.t - a.t); await kv.put(IDX, JSON.stringify(list.slice(0, AOC_MAX))); mem = null; }
const pub = (m) => ({ id: m.id, t: m.t, title: m.title, body: m.body, to: m.to ? { cs: m.to.cs || '', crew: m.to.crew ? 1 : 0 } : null });
/* is this message for the signed-in pilot (whose EFB flies callsign cs)? */
export const aocFor = (m, sess, cs, now) => toMatch(m.to, m.t, sess, cs, now);

/* GET /api/efb/aoc: the AOC messages for the signed-in pilot (the last 30 days) */
export async function aocPublic(req, env, h, sess) {
  const cs = String(new URL(req.url).searchParams.get('cs') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503, h);
  if (!sess) return jsonRes({ error: 'Sign in to read AOC messages' }, 401, h);
  try { if (!mem || Date.now() - mem.at > 20000) mem = { at: Date.now(), list: await readIndex(kv) }; }
  catch (e) { return jsonRes({ error: 'AOC messages are not available right now' }, 503, h); }
  const since = Date.now() - SHOW_DAYS * 86400_000;
  const now = Date.now(), list = mem.list.filter((m) => m.t >= since && aocFor(m, sess, cs, now)).slice(0, 100).map(pub);
  let hsh = 2166136261; const raw = JSON.stringify(list); for (let i = 0; i < raw.length; i++) { hsh ^= raw.charCodeAt(i); hsh = Math.imul(hsh, 16777619) >>> 0; }
  const tag = '"a-' + hsh.toString(36) + '"';
  if ((req.headers.get('If-None-Match') || '') === tag) return new Response(null, { status: 304, headers: { ...h, ETag: tag, 'Cache-Control': 'no-cache' } });
  return new Response(JSON.stringify({ msgs: list, at: new Date().toISOString() }), { status: 200, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: tag } });
}

/* ---- Hoppie ---- */
const HOPPIE = 'https://www.hoppie.nl/acars/system/connect.html';
const hopMem = new Map(); // logon|callsign -> { at, v }: Hoppie asks for one connect a minute or so per station
/* the answer is "ok {...} {...}" or "error {...}"; each {...} is "<id> <from> <type> {<packet>}" */
export function hoppieParse(s) {
  s = String(s || '').trim();
  const m = s.match(/^(ok|error)\b\s*/i); if (!m) throw new AocError(502, "Hoppie's ACARS gave an answer the EFB does not understand");
  const groups = []; let i = m[0].length, depth = 0, start = -1;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '{') { if (depth++ === 0) start = i + 1; }
    else if (c === '}' && depth > 0) { if (--depth === 0) groups.push(s.slice(start, i)); }
  }
  if (m[1].toLowerCase() === 'error') throw new AocError(400, 'Hoppie: ' + (groups[0] || s.slice(m[0].length) || 'error').trim());
  const out = [];
  for (const g of groups) {
    const b = g.indexOf('{'), head = (b < 0 ? g : g.slice(0, b)).trim().split(/\s+/), packet = b < 0 ? '' : g.slice(b + 1, g.lastIndexOf('}') > b ? g.lastIndexOf('}') : g.length);
    let id = '', p = 0; if (/^\d+$/.test(head[0] || '')) { id = head[0]; p = 1; }
    const from = line(head[p], 16).toUpperCase(), type = line(head[p + 1], 16).toLowerCase();
    if (!from || !type) continue;
    out.push({ id, from, type, packet: text(packet, 4000) });
  }
  return out;
}
/* POST /api/efb/hoppie { logon, cs }: the messages waiting for this callsign, read without taking them */
export async function hoppiePeek(req, env, h, sess) {
  if (!sess) return jsonRes({ error: "Sign in to read Hoppie's ACARS" }, 401, h);
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405, h);
  if (!/application\/json/.test(req.headers.get('Content-Type') || '')) return jsonRes({ error: 'Send JSON' }, 415, h);
  let b; try { b = await req.json(); } catch (e) { return jsonRes({ error: 'Bad body' }, 400, h); }
  const logon = String((b && b.logon) || '').trim(), cs = String((b && b.cs) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Za-z0-9]{4,32}$/.test(logon)) return jsonRes({ error: 'Add your Hoppie logon code' }, 400, h);
  if (!/^[A-Z0-9]{2,8}$/.test(cs)) return jsonRes({ error: 'Add your callsign' }, 400, h);
  const key = logon + '|' + cs, hit = hopMem.get(key);
  if (hit && Date.now() - hit.at < 45000) return jsonRes({ ...hit.v, cached: true }, 200, h);
  const form = new URLSearchParams({ logon, from: cs, to: 'SERVER', type: 'peek', packet: '' });
  let r, t;
  try {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 12000);
    try { r = await fetch(HOPPIE, { method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB; read only)' }, signal: ac.signal }); t = await r.text(); }
    finally { clearTimeout(tm); }
  } catch (e) { return jsonRes({ error: "Hoppie's ACARS did not answer; trying again shortly" }, 504, h); }
  if (!r.ok) return jsonRes({ error: "Hoppie's ACARS answered HTTP " + r.status }, 502, h);
  let msgs; try { msgs = hoppieParse(t); } catch (e) { return jsonRes({ error: e.message }, e.status || 502, h); }
  const v = { cs, msgs: msgs.slice(-100), at: new Date().toISOString() };
  hopMem.set(key, { at: Date.now(), v }); if (hopMem.size > 500) hopMem.delete(hopMem.keys().next().value);
  return jsonRes(v, 200, h);
}

/* keep an AOC message and tell its pilots' devices (staff on /admin, or the automatic stand assignment, see stands.js) */
/* notify(to, cat, payload): how to push it (the crew object passes its own outbox; by default a call to the object) */
export async function aocSend(env, { title, body, to, push, by }, notify) {
  const kv = env.STORE;
  const m = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), t: Date.now(), title: line(title, 40).toUpperCase() || 'CREW MESSAGE', body: text(body, BODY_MAX).toUpperCase(), to: to || null, by: by || '' };
  await writeIndex(kv, [m, ...(await readIndex(kv))]);
  if (push !== false) {
    const payload = { title: 'AOC · ' + m.title, body: m.body.replace(/\s+/g, ' ').slice(0, 180), url: '#messages', tag: 'aoc-' + m.id };
    /* a crew: every pilot listed (EFBs found only by the callsign get it at their next check) */
    try { if (notify) await notify(mailTo(m), 'mail', payload); else await crew(env, { op: 'notify', to: mailTo(m), cat: 'mail', payload }); } catch (e) { console.warn('[aoc push]', e && e.message); }
  }
  return m;
}

/* ---- /admin, Messages tab (sent as AOC) ---- */
export async function aocAdmin(req, url, env, who) {
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503);
  try {
    if (req.method === 'GET') return jsonRes({ msgs: await readIndex(kv), now: Date.now() });
    if (req.method === 'POST') {
      /* same-origin only: the admin page posts as JSON, which a form on another site cannot send */
      if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new AocError(415, 'Send JSON');
      let b; try { b = await req.json(); } catch (e) { throw new AocError(400, 'Bad body'); }
      const title = line(b.title, 40).toUpperCase() || 'CREW MESSAGE', body = text(b.body, BODY_MAX).toUpperCase();
      if (!body) throw new AocError(400, 'Write the message');
      let to = null;
      const up = (v, n) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n);
      if (b.to && b.to.crew) to = crewTo(b.to); // a flight's crew (see crew.js)
      else if (b.to) {
        const tp = up(b.to.pilot, 12), tcid = String(b.to.cid || '').replace(/\D/g, '').slice(0, 9);
        if (!tp && !tcid) throw new AocError(400, "Add the pilot's ID (for example PAW0006) or VATSIM CID");
        to = { pilot: tp, cid: tcid, cs: up(b.to.cs, 10), name: line(b.to.name, 60) };
      }
      return jsonRes({ ok: true, msg: await aocSend(env, { title, body, to, push: b.push !== false, by: who }) });
    }
    if (req.method === 'DELETE') {
      const id = String(url.searchParams.get('id') || ''), list = await readIndex(kv);
      if (!list.some((m) => m.id === id)) throw new AocError(404, 'That message no longer exists');
      await writeIndex(kv, list.filter((m) => m.id !== id));
      return jsonRes({ ok: true });
    }
    return jsonRes({ error: 'Method not allowed' }, 405);
  } catch (e) { return jsonRes({ error: e.message || 'Error' }, e.status || 500); }
}
