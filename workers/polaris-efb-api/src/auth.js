/* ---------- Pilot sign-in: "Login with vAMSYS" (Pilot API, OAuth 2.0 Authorization Code + PKCE) ----------
   The EFB sends the pilot to /auth/start; vAMSYS signs them in and returns to /auth/callback, where this Worker reads
   who they are, confirms they are a Polaris pilot, and gives the EFB its own 30-day sign-in token. The vAMSYS access
   token is used once here and thrown away; no vAMSYS token, password or email address is stored (see /privacy).

     GET  /auth/start?return=<EFB address>   -> redirect to vamsys.io/oauth/authorize
     GET  /auth/callback?code=&state=        -> back to the EFB with #auth=<token>, or an error page
     GET  /auth/me       (Bearer token)      -> { pilot: { username, name, rank, vatsim }, exp }
     POST /auth/logout   (Bearer token)      -> ends this device's sign-in

   Token: v1.<payload>.<HMAC-SHA256>, payload { u, pid, n, r, c, sid, iat, exp }. It is only good while the pilot's
   record still lists its sid, so signing out (here or by staff on /admin) ends it at once.
   Signing key: the SESSION_KEY secret, or else derived from VAMSYS_CLIENT_SECRET.
   KV (STORE):  auth:p:<USERNAME>   -> { u, pid, name, rank, cid, first, last, s: [{ sid, t, exp }] }
   Vars:        VAMSYS_PILOT_CLIENT_ID (the Pilot API client in Orwell > API), EFB_URL (default place to return to) */

const AUTHORIZE = 'https://vamsys.io/oauth/authorize', TOKEN = 'https://vamsys.io/oauth/token', PILOT_API = 'https://vamsys.io/api/v3/pilot';
const SCOPES = 'identity:basic identity:networks pilot:read flights:read';
const SESSION_MS = 30 * 86400_000, MAX_DEVICES = 8;

const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = (bytes) => { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const rand = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));

let keyMem = null; // { raw, key }
/* The signing key: the SESSION_KEY secret if set; otherwise derived from the vAMSYS client secret, which every copy of
   this Worker already has (so all of them agree, with nothing more to set up). Changing it signs every pilot out. */
async function signKey(env) {
  let raw = String(env.SESSION_KEY || '');
  if (!raw && env.VAMSYS_CLIENT_SECRET) raw = b64u(await crypto.subtle.digest('SHA-256', enc.encode('polaris-efb-session:' + env.VAMSYS_CLIENT_SECRET)));
  if (!raw) {
    if (keyMem && keyMem.kv) return keyMem.key;
    raw = (await env.STORE.get('auth:key')) || '';
    if (!raw) { raw = rand(32); await env.STORE.put('auth:key', raw); }
  }
  if (keyMem && keyMem.raw === raw) return keyMem.key;
  const key = await crypto.subtle.importKey('raw', enc.encode(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  keyMem = { raw, key, kv: !env.SESSION_KEY && !env.VAMSYS_CLIENT_SECRET };
  return key;
}
async function sign(env, kind, obj) {
  const body = b64u(enc.encode(JSON.stringify(obj)));
  return kind + '.' + body + '.' + b64u(await crypto.subtle.sign('HMAC', await signKey(env), enc.encode(kind + '.' + body)));
}
async function unsign(env, kind, tok) {
  const p = String(tok || '').split('.');
  if (p.length !== 3 || p[0] !== kind) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await signKey(env), unb64u(p[2]), enc.encode(p[0] + '.' + p[1])); } catch (e) { return null; }
  if (!ok) return null;
  try { const o = JSON.parse(dec.decode(unb64u(p[1]))); return o && o.exp && o.exp > Date.now() ? o : null; } catch (e) { return null; }
}
/** short signature for a link that must work without the sign-in header (a mail attachment opened in a new tab) */
export async function linkSig(env, text) {
  return b64u(await crypto.subtle.sign('HMAC', await signKey(env), enc.encode('link.' + text))).slice(0, 32);
}

/* ---- pilot records ---- */
const recKey = (u) => 'auth:p:' + String(u).toUpperCase();
const recMem = new Map(); // username -> { at, rec }
async function readRec(env, u, fresh) {
  const k = String(u).toUpperCase(), hit = recMem.get(k);
  if (!fresh && hit && Date.now() - hit.at < 30_000) return hit.rec;
  const rec = await env.STORE.get(recKey(k), 'json').catch(() => null);
  recMem.set(k, { at: Date.now(), rec });
  return rec;
}
async function writeRec(env, rec) {
  rec.s = (rec.s || []).filter((x) => x.exp > Date.now());
  await env.STORE.put(recKey(rec.u), JSON.stringify(rec));
  recMem.set(String(rec.u).toUpperCase(), { at: Date.now(), rec });
}

/** Who is signed in on this request: { u, pid, n, r, c, sid, exp } or null. */
export async function sessionOf(req, env, fresh) {
  if (!env || !env.STORE) return null;
  const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const t = await unsign(env, 'v1', m[1]);
  if (!t || !t.u || !t.sid) return null;
  const rec = await readRec(env, t.u, fresh);
  if (!rec || !(rec.s || []).some((x) => x.sid === t.sid && x.exp > Date.now())) return null;
  return t;
}

/* ---- pages ---- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function page(title, text, back, status) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121213;color:#E8E8E9;font:16px/1.6 "Avenir Next","Segoe UI",system-ui,sans-serif}
main{max-width:440px;margin:24px;padding:28px;background:#1A1A1C;border:1px solid #2E2E32;border-radius:10px}h1{font:400 24px Georgia,serif;margin:0 0 10px;color:#7CC2C9}p{margin:0 0 18px;color:#C9C9CD}
a{display:inline-block;background:#1A6772;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:500}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(text)}</p>${back ? `<a href="${esc(back)}">Back to the EFB</a>` : ''}</main></body></html>`,
  { status: status || 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

function allowedReturn(env, ret) {
  const origins = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter((s) => /^https:\/\//.test(s));
  const fallback = String(env.EFB_URL || '') || (origins[0] ? origins[0] + '/efb/' : '');
  try { const u = new URL(ret); if (u.protocol === 'https:' && origins.includes(u.origin)) return u.origin + u.pathname; } catch (e) { /* use the default */ }
  return fallback;
}
const cookieOf = (req, name) => { const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)')); return m ? m[1] : ''; };
const FLOW = '__Host-pefb_login';

/** deps: { cors(req, env), json(body, status, headers), display(env, username) -> { name, rank } } */
export async function authRoute(req, url, env, deps) {
  const path = url.pathname.replace(/\/+$/, ''), clientId = String(env.VAMSYS_PILOT_CLIENT_ID || '').trim();
  const redirectUri = url.origin + '/auth/callback';
  if (!env.STORE) return page('Sign-in is not available', 'Storage is not set up on the EFB server.', '', 503);

  if (path === '/auth/start' && req.method === 'GET') {
    const ret = allowedReturn(env, url.searchParams.get('return') || '');
    if (!clientId) return page('Sign-in is not set up yet', 'The vAMSYS Pilot API client is missing on the EFB server (VAMSYS_PILOT_CLIENT_ID).', ret, 503);
    const verifier = rand(48), state = rand(18);
    const challenge = b64u(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
    /* the verifier stays in this browser (signed, HTTP-only), so the answer only works where the sign-in started */
    const flow = await sign(env, 'f1', { v: verifier, s: state, r: ret, exp: Date.now() + 600_000 });
    const to = new URL(AUTHORIZE);
    to.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
    return new Response(null, { status: 302, headers: { Location: to.toString(), 'Set-Cookie': `${FLOW}=${flow}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`, 'Cache-Control': 'no-store' } });
  }

  if (path === '/auth/callback' && req.method === 'GET') {
    const clear = `${FLOW}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
    const flow = await unsign(env, 'f1', cookieOf(req, FLOW));
    const ret = (flow && flow.r) || allowedReturn(env, '');
    const fail = (title, text, status) => { const r = page(title, text, ret, status); r.headers.append('Set-Cookie', clear); return r; };
    if (url.searchParams.get('error')) return fail('Sign-in was cancelled', url.searchParams.get('error') === 'access_denied' ? 'You did not allow the Polaris EFB to use your vAMSYS account. Nothing was shared.' : 'vAMSYS did not complete the sign-in. Please try again.');
    const code = url.searchParams.get('code') || '';
    if (!flow || !code || url.searchParams.get('state') !== flow.s) return fail('Sign-in expired', 'This sign-in took too long or was started in another browser. Please start again from the EFB.');
    let user;
    try {
      const tr = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri, code, code_verifier: flow.v }) });
      if (!tr.ok) throw new Error('token HTTP ' + tr.status);
      const tok = await tr.json();
      const ur = await fetch(PILOT_API + '/user', { headers: { Authorization: 'Bearer ' + tok.access_token, Accept: 'application/json' } });
      if (!ur.ok) throw new Error('user HTTP ' + ur.status);
      user = (await ur.json()).data || {};
      /* the vAMSYS tokens are not kept: they go out of scope here */
    } catch (e) {
      console.warn('[auth]', e && e.message);
      return fail('Sign-in failed', 'vAMSYS could not confirm your account just now. Please try again in a moment.', 502);
    }
    const p = user.pilot;
    if (!p || !p.username) return fail('Not a Polaris pilot', 'This vAMSYS account has no pilot profile at Polaris Airways. Join Polaris in vAMSYS first, then sign in again.', 403);
    if (p.banned) return fail('Sign-in refused', 'This pilot account cannot use the Polaris EFB. Contact Polaris staff if you think this is a mistake.', 403);
    const u = String(p.username).toUpperCase(), now = Date.now();
    /* the name and rank Polaris shows for this pilot (the pilot's chosen display name, not the full legal name) */
    let shown = { name: '', rank: '' };
    try { shown = (await deps.display(env, u)) || shown; } catch (e) { /* first name only */ }
    const cid = user.networks && user.networks.vatsim_id ? String(user.networks.vatsim_id) : '';
    const old = await readRec(env, u, true);
    const sid = rand(12), exp = now + SESSION_MS;
    const rec = { u, pid: p.id, name: shown.name || String(user.first_name || '').slice(0, 40), rank: shown.rank || '', cid, first: (old && old.first) || now, last: now,
      s: [{ sid, t: now, exp }, ...((old && old.s) || [])].slice(0, MAX_DEVICES) };
    await writeRec(env, rec);
    const token = await sign(env, 'v1', { u, pid: p.id, n: rec.name, r: rec.rank, c: cid, sid, iat: now, exp });
    return new Response(null, { status: 302, headers: { Location: ret + '#auth=' + token, 'Set-Cookie': clear, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }

  const h = { ...deps.cors(req, env), 'Access-Control-Allow-Headers': 'Accept, Authorization, Content-Type', 'Access-Control-Max-Age': '86400' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (path === '/auth/me' && req.method === 'GET') {
    const s = await sessionOf(req, env, true);
    if (!s) return deps.json({ error: 'Not signed in' }, 401, h);
    return deps.json({ pilot: { username: s.u, name: s.n || '', rank: s.r || '', vatsim: s.c || '' }, exp: s.exp }, 200, h);
  }
  if (path === '/auth/logout' && req.method === 'POST') {
    const s = await sessionOf(req, env, true);
    if (s) { const rec = await readRec(env, s.u, true); if (rec) { rec.s = (rec.s || []).filter((x) => x.sid !== s.sid); await writeRec(env, rec); } }
    return deps.json({ ok: true }, 200, h);
  }
  return deps.json({ error: 'Not found' }, 404, h);
}

/* ---- staff admin (Pilots tab) ---- */
/** Every pilot who has signed in to the EFB. */
export async function signedInPilots(env) {
  const out = []; let cursor;
  do {
    const l = await env.STORE.list({ prefix: 'auth:p:', cursor });
    const recs = await Promise.all(l.keys.map((k) => env.STORE.get(k.name, 'json').catch(() => null)));
    for (const r of recs) if (r && r.u) out.push({ u: r.u, name: r.name || '', rank: r.rank || '', cid: r.cid || '', first: r.first || 0, last: r.last || 0, devices: (r.s || []).filter((x) => x.exp > Date.now()).length });
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return out;
}
/** Ends every sign-in of one pilot (they can sign in again with vAMSYS). */
export async function signOutPilot(env, username) {
  const rec = await readRec(env, username, true);
  if (!rec) return false;
  rec.s = [];
  await writeRec(env, rec);
  return true;
}
