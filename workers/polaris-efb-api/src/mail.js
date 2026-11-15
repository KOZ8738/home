/* ---------- Polaris Mail ----------
   Notices from Polaris staff to the pilots' EFB Mail app. Staff write them on /admin, which Cloudflare Access protects
   (email one-time PIN); every admin request is checked again here against Access's signed token, so the admin stays
   shut if Access is missing or set up wrongly. A mail goes to all pilots, or to one pilot (to: { pilot, cid, cs, name },
   picked on the Live tab or typed in). Pilots read mail signed in (Login with vAMSYS, auth.js): everyone gets the
   mails to all pilots; a mail to one pilot goes only to the session whose pilot ID or VATSIM CID matches. Attachment
   links carry a short signature that lasts 6 to 12 hours, because a link opened in a new tab cannot send the sign-in.

   KV (STORE):  mail:v1:index          -> [{ id, t, sendAt, from, subject, body, att:[{ name, type, size }], to, by, edited }]
                mail:v1:att:<id>:<n>   -> attachment bytes
   Vars:        ACCESS_TEAM_DOMAIN (e.g. polaris.cloudflareaccess.com), ACCESS_AUD (the Access application's AUD tag),
                ADMIN_EMAILS (optional extra allow list, comma separated) */
import { ADMIN_HTML } from './admin.js';
import { LIVE_JS } from './live-bundle.js';
import { pmAdmin } from './pm.js';
import { crew, mailTo, mailPayload } from './crew.js';

class MailError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const MAIL_MAX = 300, BODY_MAX = 20000, ATT_MAX = 5 * 1024 * 1024, ATT_COUNT = 5;
const ATT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];
const jsonRes = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

/* ---- Cloudflare Access: who is signed in on /admin ---- */
let certs = null; // { at, keys }
const b64urlBytes = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
async function accessKeys(team, fresh) {
  if (!fresh && certs && Date.now() - certs.at < 3600_000) return certs.keys;
  const r = await fetch('https://' + team + '/cdn-cgi/access/certs');
  if (!r.ok) throw new MailError(502, 'Could not read the Cloudflare Access keys');
  const j = await r.json(); certs = { at: Date.now(), keys: j.keys || [] }; return certs.keys;
}
export async function accessUser(req, env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''), aud = String(env.ACCESS_AUD || '').trim();
  if (!team || !aud) throw new MailError(503, 'The admin is not set up yet: ACCESS_TEAM_DOMAIN and ACCESS_AUD are missing in wrangler.toml');
  const cookie = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const tok = req.headers.get('Cf-Access-Jwt-Assertion') || (cookie && cookie[1]);
  if (!tok) throw new MailError(401, 'Not signed in through Cloudflare Access');
  const parts = tok.split('.'); if (parts.length !== 3) throw new MailError(401, 'Bad sign-in token');
  let head, pay; try { head = b64urlJson(parts[0]); pay = b64urlJson(parts[1]); } catch (e) { throw new MailError(401, 'Bad sign-in token'); }
  if (head.alg !== 'RS256') throw new MailError(401, 'Bad sign-in token');
  let jwk = (await accessKeys(team)).find((k) => k.kid === head.kid);
  if (!jwk) jwk = (await accessKeys(team, true)).find((k) => k.kid === head.kid); // keys rotate
  if (!jwk) throw new MailError(401, 'Unknown sign-in key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new MailError(401, 'Sign-in token signature does not match');
  const auds = Array.isArray(pay.aud) ? pay.aud : [pay.aud];
  if (!auds.includes(aud)) throw new MailError(403, 'Sign-in token is for another application');
  if (pay.iss && pay.iss !== 'https://' + team) throw new MailError(403, 'Sign-in token is from another team');
  if (!pay.exp || pay.exp * 1000 < Date.now()) throw new MailError(401, 'Sign-in has expired; reload the page');
  const email = String(pay.email || '').toLowerCase();
  const extra = String(env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (extra.length && !extra.includes(email)) throw new MailError(403, 'This email is not on the admin list');
  return email || 'unknown';
}

/* ---- storage ---- */
let memIdx = null; // { at, list } short cache for the public list
async function readIndex(kv) { const v = await kv.get('mail:v1:index', 'json').catch(() => null); return Array.isArray(v) ? v : []; }
async function writeIndex(kv, list) { list.sort((a, b) => (b.sendAt || b.t) - (a.sendAt || a.t)); await kv.put('mail:v1:index', JSON.stringify(list.slice(0, MAIL_MAX))); memIdx = null; }
const pub = (m) => ({ id: m.id, t: m.sendAt || m.t, from: m.from, subject: m.subject, body: m.body, att: (m.att || []).map((a, i) => ({ n: i, name: a.name, type: a.type, size: a.size })), to: m.to ? { cs: m.to.cs || '', pilot: m.to.pilot || '' } : null, edited: m.edited || 0 });
const LINK_MS = 6 * 3600_000;

/* GET /api/efb/mail: what the pilots' Mail app shows (sent, not scheduled for later) */
export async function mailPublic(req, env, h, sess, linkSig) {
  const kv = env && env.STORE; if (!kv) throw new MailError(503, 'Storage is not set up');
  if (!sess) throw new MailError(401, 'Sign in to read Polaris Mail');
  if (!memIdx || Date.now() - memIdx.at > 20000) memIdx = { at: Date.now(), list: await readIndex(kv) };
  const mine = (m) => !m.to || (m.to.pilot && m.to.pilot === sess.u) || (m.to.cid && sess.c && m.to.cid === sess.c);
  const now = Date.now(), list = memIdx.list.filter((m) => (m.sendAt || m.t) <= now && mine(m)).slice(0, 100).map(pub);
  /* attachment links: good until the end of the next 6-hour block, so they stay the same between checks */
  const e = (Math.floor(now / LINK_MS) + 2) * LINK_MS;
  for (const m of list) for (const a of m.att) { a.e = e; a.k = await linkSig(env, m.id + ':' + a.n + ':' + e); }
  let hsh = 2166136261; const raw = JSON.stringify(list); for (let i = 0; i < raw.length; i++) { hsh ^= raw.charCodeAt(i); hsh = Math.imul(hsh, 16777619) >>> 0; }
  const tag = '"m-' + hsh.toString(36) + '"';
  if ((req.headers.get('If-None-Match') || '') === tag) return new Response(null, { status: 304, headers: { ...h, ETag: tag, 'Cache-Control': 'no-cache' } });
  return new Response(JSON.stringify({ mails: list, at: new Date().toISOString() }), { status: 200, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: tag } });
}
/* GET /api/efb/mail-att?id=&n=: one attachment of a sent mail */
export async function mailAttachment(url, env, h, linkSig) {
  const kv = env && env.STORE; if (!kv) throw new MailError(503, 'Storage is not set up');
  const id = String(url.searchParams.get('id') || ''), n = +url.searchParams.get('n') || 0, e = +url.searchParams.get('e') || 0, k = String(url.searchParams.get('k') || '');
  if (!(e > Date.now()) || !k || k !== await linkSig(env, id + ':' + n + ':' + e)) throw new MailError(401, 'This attachment link has expired. Open the message in the EFB again.');
  const m = (await readIndex(kv)).find((x) => x.id === id);
  if (!m || (m.sendAt || m.t) > Date.now() || !m.att || !m.att[n]) throw new MailError(404, 'No such attachment');
  const a = m.att[n], body = await kv.get('mail:v1:att:' + id + ':' + n, 'arrayBuffer');
  if (!body) throw new MailError(404, 'No such attachment');
  return new Response(body, { status: 200, headers: { ...h, 'Content-Type': a.type, 'Content-Disposition': 'inline; filename="' + a.name.replace(/[^\w.\- ]+/g, '_') + '"', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}

/* ---- /admin ---- */
const clean = (s, n) => String(s == null ? '' : s).replace(/\r\n/g, '\n').slice(0, n);
export async function mailAdmin(req, url, env, opts) {
  const path = url.pathname.replace(/\/+$/, '');
  let who;
  try { who = await accessUser(req, env); }
  catch (e) {
    if (path === '/admin') return new Response(ADMIN_HTML.replace('<!--DENIED-->', '<div class="deny"><b>The admin is locked.</b> ' + String(e.message).replace(/[<>&]/g, '') + '</div>'), { status: e.status || 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    return jsonRes({ error: e.message }, e.status || 401);
  }
  if (path === '/admin') return new Response(ADMIN_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' } });
  /* Pilots tab: who has signed in to the EFB; staff can end a pilot's sign-ins */
  if (path === '/admin/api/pilots' && req.method === 'GET') {
    try { return jsonRes(opts && opts.pilots ? await opts.pilots() : { pilots: [] }); } catch (e) { return jsonRes({ error: 'The pilot list is not available right now: ' + e.message }, 502); }
  }
  if (path === '/admin/api/pilots/signout' && req.method === 'POST') {
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) return jsonRes({ error: 'Send JSON' }, 415);
    let b; try { b = await req.json(); } catch (e) { return jsonRes({ error: 'Bad body' }, 400); }
    const ok = opts && opts.signOut ? await opts.signOut(String(b.username || '').toUpperCase().replace(/[^A-Z0-9]/g, '')) : false;
    return ok ? jsonRes({ ok: true }) : jsonRes({ error: 'That pilot has not signed in to the EFB' }, 404);
  }
  /* Live tab: the globe and page script (built from admin-live/), and the Polaris flights now on VATSIM */
  if (path === '/admin/live.js') return new Response(LIVE_JS, { status: 200, headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' } });
  if (path === '/admin/api/live') {
    try { return jsonRes(opts && opts.live ? await opts.live() : { flights: [], apts: {} }); }
    catch (e) { return jsonRes({ error: 'Live flights are not available right now: ' + e.message }, 502); }
  }
  /* staff diagnostics: what vAMSYS returns for a PIREP's position reports */
  if (path === '/admin/api/pirep-probe' && opts && opts.probe) { try { return jsonRes(await opts.probe(url.searchParams.get('id'))); } catch (e) { return jsonRes({ error: e.message }, 502); } }
  /* Inbox tab: pilots' conversations with a department (never messages between pilots, see pm.js) */
  if (path === '/admin/api/inbox' || path.startsWith('/admin/api/inbox/')) return pmAdmin(req, path, env, who);
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503);
  try {
    if (path === '/admin/api/me') return jsonRes({ email: who });
    if (path === '/admin/api/mail' && req.method === 'GET') return jsonRes({ mails: (await readIndex(kv)).map((m) => ({ ...pub(m), to: m.to || null, sendAt: m.sendAt || m.t, created: m.t, by: m.by || '' })), now: Date.now() });
    if (path === '/admin/api/mail' && req.method === 'POST') {
      /* same-origin only: the admin page posts as JSON, which a form on another site cannot send */
      if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new MailError(415, 'Send JSON');
      let b; try { b = await req.json(); } catch (e) { throw new MailError(400, 'Bad body'); }
      const list = await readIndex(kv), old = b.id ? list.find((m) => m.id === b.id) : null;
      if (b.id && !old) throw new MailError(404, 'That mail no longer exists');
      const from = clean(b.from, 60).trim(), subject = clean(b.subject, 160).trim(), body = clean(b.body, BODY_MAX).trim();
      if (!from || !subject || !body) throw new MailError(400, 'From, subject and message are all needed');
      /* one pilot: Polaris pilot ID and/or VATSIM CID (callsign and name are labels for staff) */
      let to = null;
      if (b.to) {
        const up = (v, n) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n);
        const tp = up(b.to.pilot, 12), tcid = String(b.to.cid || '').replace(/\D/g, '').slice(0, 9);
        if (!tp && !tcid) throw new MailError(400, "Add the pilot's ID (for example PAW0006) or VATSIM CID");
        to = { pilot: tp, cid: tcid, cs: up(b.to.cs, 10), name: clean(b.to.name, 60).trim() };
      }
      let sendAt = b.sendAt ? Date.parse(b.sendAt) : Date.now(); if (!isFinite(sendAt)) throw new MailError(400, 'The send time is not a date');
      if (old && (old.sendAt || old.t) <= Date.now() && sendAt > Date.now()) sendAt = old.sendAt || old.t; // a sent mail stays sent
      const id = old ? old.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      /* attachments: keep the ones still listed, add the new ones (base64) */
      const keep = (old && old.att || []).map((a, i) => ({ a, i })).filter((x) => (b.keepAtt || []).includes(x.i));
      const add = Array.isArray(b.newAtt) ? b.newAtt : [];
      if (keep.length + add.length > ATT_COUNT) throw new MailError(400, 'At most ' + ATT_COUNT + ' attachments');
      const files = [];
      for (const x of keep) files.push({ meta: x.a, bytes: await kv.get('mail:v1:att:' + id + ':' + x.i, 'arrayBuffer') });
      for (const f of add) {
        const type = String(f.type || ''), name = clean(f.name, 120).trim() || 'attachment';
        if (!ATT_TYPES.includes(type)) throw new MailError(400, name + ': only PDF, PNG, JPG, WebP or text files');
        let bin; try { bin = Uint8Array.from(atob(String(f.data || '')), (c) => c.charCodeAt(0)); } catch (e) { throw new MailError(400, name + ': could not read the file'); }
        if (bin.length > ATT_MAX) throw new MailError(400, name + ': larger than 5 MB');
        files.push({ meta: { name, type, size: bin.length }, bytes: bin.buffer });
      }
      for (let i = 0; i < files.length; i++) if (files[i].bytes) await kv.put('mail:v1:att:' + id + ':' + i, files[i].bytes);
      for (let i = files.length; i < ((old && old.att) || []).length; i++) await kv.delete('mail:v1:att:' + id + ':' + i);
      const m = { id, t: old ? old.t : Date.now(), sendAt, from, subject, body, att: files.filter((f) => f.bytes).map((f) => f.meta), to, by: old ? old.by : who };
      if (old) { m.edited = Date.now(); m.editedBy = who; }
      await writeIndex(kv, [m, ...list.filter((x) => x.id !== id)]);
      /* push: a new notice going out now, or a notice that still waits for its time (the object checks it again then) */
      try {
        const waiting = sendAt > Date.now() + 1000;
        if (waiting) await crew(env, { op: 'schedule', id: 'mail:' + id, at: sendAt, kind: 'mail', data: { id } });
        else if (!old || (old.sendAt || old.t) > Date.now()) { await crew(env, { op: 'unjob', id: 'mail:' + id }); await crew(env, { op: 'notify', to: mailTo(m), cat: 'mail', payload: mailPayload(m) }); }
      } catch (e) { console.warn('[mail push]', e && e.message); }
      return jsonRes({ ok: true, mail: pub(m) });
    }
    if (path === '/admin/api/mail' && req.method === 'DELETE') {
      const id = String(url.searchParams.get('id') || ''), list = await readIndex(kv), old = list.find((m) => m.id === id);
      if (!old) throw new MailError(404, 'That mail no longer exists');
      for (let i = 0; i < (old.att || []).length; i++) await kv.delete('mail:v1:att:' + id + ':' + i);
      await writeIndex(kv, list.filter((m) => m.id !== id));
      return jsonRes({ ok: true });
    }
    return jsonRes({ error: 'Not found' }, 404);
  } catch (e) { return jsonRes({ error: e.message || 'Error' }, e.status || 500); }
}
export { MailError };
