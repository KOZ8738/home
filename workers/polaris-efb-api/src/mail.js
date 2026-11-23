/* ---------- Polaris Mail ----------
   Notices from Polaris staff to the pilots' EFB Mail app. Staff write them on /admin, which Cloudflare Access protects
   (email one-time PIN); every admin request is checked again here against Access's signed token, so the admin stays
   shut if Access is missing or set up wrongly. A mail goes to all pilots, or to one pilot (to: { pilot, cid, cs, name },
   picked on the Live tab or typed in), or to a flight's crew (to: { crew: 1, cs, m: [{ pilot, cid, name }] }, see crewTo in
   crew.js). Pilots read mail signed in (Login with vAMSYS, auth.js): everyone gets the
   mails to all pilots; a mail to one pilot goes only to the session whose pilot ID or VATSIM CID matches. Attachment
   links carry a short signature that lasts 6 to 12 hours, because a link opened in a new tab cannot send the sign-in.

   KV (STORE):  mail:v1:index          -> [{ id, t, sendAt, from, subject, body, att:[{ name, type, size }], to, by, edited }]
                mail:v1:att:<id>:<n>   -> attachment bytes
   Vars:        ACCESS_TEAM_DOMAIN (e.g. polaris.cloudflareaccess.com), ACCESS_AUD (the Access application's AUD tag),
                ADMIN_EMAILS (optional extra allow list, comma separated) */
import { ADMIN_HTML } from './admin.js';
import { LIVE_JS } from './live-bundle.js';
import { pmAdmin } from './pm.js';
import { crew, mailTo, mailPayload, crewTo, toMatch } from './crew.js';
import { docsAdmin } from './docs.js';
import { aocAdmin } from './aoc.js';
import { standsAdmin } from './stands.js';
import { aocTplAdmin } from './aoctpl.js';
import { calAdmin } from './cal.js';
import { oooAdmin } from './ooo.js';
import { tasksAdmin } from './tasks.js';

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
const pub = (m) => ({ id: m.id, t: m.sendAt || m.t, from: m.from, subject: m.subject, body: m.body, att: (m.att || []).map((a, i) => ({ n: i, name: a.name, type: a.type, size: a.size })), to: m.to ? (m.to.crew ? { cs: m.to.cs || '', crew: 1 } : { cs: m.to.cs || '', pilot: m.to.pilot || '' }) : null, edited: m.edited || 0 });
const LINK_MS = 6 * 3600_000;

/* GET /api/efb/mail: what the pilots' Mail app shows (sent, not scheduled for later) */
export async function mailPublic(req, env, h, sess, linkSig) {
  const kv = env && env.STORE; if (!kv) throw new MailError(503, 'Storage is not set up');
  if (!sess) throw new MailError(401, 'Sign in to read Polaris Mail');
  if (!memIdx || Date.now() - memIdx.at > 20000) memIdx = { at: Date.now(), list: await readIndex(kv) };
  /* ?cs=: the callsign this EFB flies, for mail to a flight's crew */
  const cs = String(new URL(req.url).searchParams.get('cs') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const now = Date.now(), list = memIdx.list.filter((m) => (m.sendAt || m.t) <= now && toMatch(m.to, m.sendAt || m.t, sess, cs, now)).slice(0, 100).map(pub);
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

/* ---- Settings: the From names and the AOC templates the admin's composers offer ----
   KV (STORE): admin:v1:settings -> { froms: [name], tpl: [{ title, body }], at, by }. A template's {CS}, {DEP} and {ARR}
   are filled in from the flight, and ___ marks what staff must still write. */
const SETTINGS = 'admin:v1:settings';
export const SET_DEF = {
  froms: ['Crew Management', 'Flight Operations', 'Training', 'Polaris News', 'Fleet'],
  tpl: [
    { title: 'CREW MESSAGE', body: '' },
    { title: 'GATE CHANGE', body: '{CS} {DEP}-{ARR}\nNEW GATE ___\nIF ATC ASSIGNS ANOTHER GATE, FOLLOW ATC' },
    { title: 'WX ADVISORY', body: '{CS} {DEP}-{ARR}\nWX AT {ARR}: ___\nPLAN EXTRA FUEL AS REQUIRED' },
    { title: 'SLOT', body: '{CS} {DEP}-{ARR}\nNEW CTOT ___Z\nADVISE IF UNABLE' },
    { title: 'DELAY', body: '{CS} {DEP}-{ARR}\nEXPECT DELAY ___ MIN\nNEW ETD ___Z' },
    { title: 'DIVERSION', body: '{CS}\nOPS CONFIRMS DIVERSION TO ___\nADVISE ETA AND FUEL ON ARRIVAL' },
    { title: 'MAINTENANCE', body: '{CS}\nMX: ___\nCONTACT MAINTENANCE CONTROL BEFORE DEPARTURE' },
    { title: 'OPS NOTICE', body: '' },
  ],
};
async function readSettings(kv) { const v = await kv.get(SETTINGS, 'json'); return { ...SET_DEF, ...(v && typeof v === 'object' ? v : {}) }; }
function cleanSettings(b) {
  const one = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const froms = [...new Set((Array.isArray(b.froms) ? b.froms : []).map((x) => one(x, 60)).filter(Boolean))].slice(0, 20);
  if (!froms.length) throw new MailError(400, 'Keep at least one From name');
  const tpl = (Array.isArray(b.tpl) ? b.tpl : []).map((t) => ({ title: one(t && t.title, 40).toUpperCase(), body: String((t && t.body) || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000).toUpperCase() })).filter((t) => t.title).slice(0, 30);
  return { froms, tpl };
}

/* ---- roles (Nov 2026) ----
   Who may open /admin at all is Cloudflare Access (and ADMIN_EMAILS). Inside, each email has a role. Administrator
   is built in: everything, the roles themselves and staff diagnostics. Other roles are made and edited by
   administrators under Settings > Roles: which pages they see, and what they may change. Kept in KV
   (admin:v1:roles): { people: { email: { role } }, roles: { id: { name, pages, can } } }. Until the first person is
   added roles are off and everyone signed in is an administrator, as before; turning them on adds the person doing
   it as an administrator, and the last administrator cannot be removed or changed. With roles on, an email without
   one is turned away. Every request is checked here: reading by the pages a role sees (READS: what each page shows;
   Home shows the parts of those pages, so it has none of its own), changing things by what it may change. */
const ROLES = 'admin:v1:roles';
export const ROLE_PAGES = ['fw', 'gates', 'reports', 'navdata', 'pilots', 'cal', 'comms', 'docs', 'settings'];
export const ROLE_ACTS = ['msg', 'gates', 'delay', 'cal', 'docs', 'docsdel', 'pilots', 'navdata', 'settings', 'tasks'];
const ACT_NAME = { msg: 'send messages', gates: 'change gates', delay: 'give delay reasons', cal: 'edit the calendar', docs: 'upload or edit documents', docsdel: 'delete documents', pilots: 'sign pilots out', navdata: 'run Nav Data checks or uploads', settings: 'change settings', tasks: 'publish tasks' };
/* the role there was before roles could be edited, kept until an administrator changes or deletes it */
const DEFAULT_ROLES = { ops: { name: 'Operations', pages: ROLE_PAGES.filter((p) => p !== 'settings'), can: ['msg', 'gates', 'delay', 'cal'] } };
let ROLES_MEM = { at: 0, v: null };
async function readRoles(kv) {
  if (ROLES_MEM.v && Date.now() - ROLES_MEM.at < 10000) return ROLES_MEM.v;
  let v = null; try { v = await kv.get(ROLES, 'json'); } catch (e) { v = null; }
  if (!v || typeof v !== 'object') v = {};
  if (!v.people || typeof v.people !== 'object') v.people = {};
  if (!v.roles || typeof v.roles !== 'object') v.roles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
  ROLES_MEM = { at: Date.now(), v }; return v;
}
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const roleOf = (R, email) => { if (!Object.keys(R.people).length) return 'admin'; const p = own(R.people, email) ? R.people[email] : null; if (!p) return null; return p.role === 'admin' || own(R.roles, p.role) ? p.role : null; };
const roleName = (R, id) => id === 'admin' ? 'Administrator' : (own(R.roles, id) && R.roles[id].name) || id;
function permsOf(R, id) {
  if (id === 'admin') return { pages: ['home', 'tasks', ...ROLE_PAGES], can: [...ROLE_ACTS, 'roles', 'diag'] };
  const r = own(R.roles, id) ? R.roles[id] : {}; return { pages: ['home', 'tasks', ...ROLE_PAGES.filter((p) => (r.pages || []).includes(p))], can: ROLE_ACTS.filter((a) => (r.can || []).includes(a)) };
}
/* who may update Nav Data (the AIRAC reminders, airacmail.js): Administrators and the roles allowed 'navdata'; while
   roles are off (everyone signed in is an administrator), the ADMIN_EMAILS list, as no one else is known by name */
export async function navRecipients(env) {
  const kv = env && env.STORE; if (!kv) return { list: [] };
  const R = await readRoles(kv), people = Object.keys(R.people);
  if (!people.length) return { rolesOff: true, list: [...new Set(String((env && env.ADMIN_EMAILS) || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))] };
  return { list: people.filter((e) => { const id = roleOf(R, e); return !!id && permsOf(R, id).can.includes('navdata'); }) };
}
const PAGE_NAME = { fw: 'Flight Watch', gates: 'Gates', reports: 'Reports', navdata: 'Nav Data', pilots: 'Pilots', cal: 'Calendar', comms: 'Messages', docs: 'Documents', settings: 'Settings' };
/* who may read what: the pages it is shown on, any one of them (none listed: every role). The Messages composer
   (also opened from Flight Watch) needs the From names and templates; the pilot list picks recipients (Messages,
   Calendar) and shows who confirmed a document; a pilot's profile shows their flight and recent flights.
   A read not listed here is for administrators only. */
const READS = [
  [/^\/admin\/api\/me$/, []],
  [/^\/admin\/api\/tasks$/, []],
  [/^\/admin\/api\/live$/, ['fw', 'pilots']],
  [/^\/admin\/api\/ooo(\/|$)/, ['fw', 'reports', 'pilots']],
  [/^\/admin\/api\/stands\/try$/, ['gates', 'fw']],
  [/^\/admin\/api\/stands(\/|$)/, ['gates', 'settings', 'fw']],
  [/^\/admin\/api\/aoctpl(\/|$)/, ['gates', 'settings']],
  [/^\/admin\/api\/aoc$/, ['comms', 'fw']],
  [/^\/admin\/api\/(mail|inbox)(\/|$)/, ['comms']],
  [/^\/admin\/api\/settings$/, ['settings', 'comms', 'fw']],
  [/^\/admin\/api\/pilots$/, ['pilots', 'comms', 'docs', 'cal']],
  [/^\/admin\/api\/checkins$/, ['pilots']],
  [/^\/admin\/api\/docs(\/|$)/, ['docs']],
  [/^\/admin\/api\/cal(\/|$)/, ['cal']],
  [/^\/admin\/api\/watch$/, ['fw']],
  [/^\/admin\/api\/navdata(\/|$)/, ['navdata']],
];
const readPages = (path) => { for (const [re, p] of READS) if (re.test(path)) return p; return null; };
/* the classes the admin page hides what a role does not see or may not change by (Settings › Roles) */
const permClass = (perm) => [...ROLE_PAGES.filter((p) => !perm.pages.includes(p)).map((p) => 'no-p-' + p), ...[...ROLE_ACTS, 'roles'].filter((a) => !perm.can.includes(a)).map((a) => 'no-a-' + a)].join(' ');
/* what a request needs: 'read' (READS), 'admin' (the roles, staff diagnostics), or one of ROLE_ACTS;
   the gate plan is saved for gates and for the automatic-message switches (Settings): 'stands' */
function roleNeeds(method, path) {
  if (/^\/admin\/api\/(roles|pirep-probe|bookings-probe|ops-probe|eaip-probe|chart-pdf|chart-fixes|chart-list)(\/|$)/.test(path)) return 'admin';
  if (method === 'GET' || method === 'HEAD' || path === '/admin/api/aoctpl/preview' || path === '/admin/api/stands/try') return 'read';
  if (/^\/admin\/api\/(mail|aoc|inbox)(\/|$)/.test(path)) return 'msg';
  if (path === '/admin/api/stands') return 'stands';
  if (/^\/admin\/api\/stands\//.test(path)) return 'gates';
  if (path === '/admin/api/ooo/reason') return 'delay';
  if (/^\/admin\/api\/cal(\/|$)/.test(path)) return 'cal';
  if (/^\/admin\/api\/docs(\/|$)/.test(path)) return method === 'DELETE' ? 'docsdel' : 'docs';
  if (path === '/admin/api/pilots/signout') return 'pilots';
  if (/^\/admin\/api\/navdata(\/|$)/.test(path)) return 'navdata';
  if (path === '/admin/api/settings' || path === '/admin/api/aoctpl') return 'settings';
  if (path === '/admin/api/tasks') return 'task';   /* checked in tasks.js: publishers, and a department's own people */
  return 'admin';
}
const lineR = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
async function rolesApi(req, kv, who) {
  const R = await readRoles(kv);
  const list = () => {
    const n = {}; for (const p of Object.values(R.people)) n[p.role] = (n[p.role] || 0) + 1;
    return { on: Object.keys(R.people).length > 0, me: who,
      people: Object.entries(R.people).filter(([, p]) => p.role === 'admin' || own(R.roles, p.role)).map(([email, p]) => ({ email, role: p.role, by: p.by || '', at: p.at || 0 }))
        .sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : roleName(R, a.role).localeCompare(roleName(R, b.role)))),
      roles: [{ id: 'admin', name: 'Administrator', builtin: true, ...permsOf(R, 'admin'), n: n.admin || 0 },
        ...Object.entries(R.roles).map(([id, r]) => ({ id, name: r.name, builtin: false, ...permsOf(R, id), n: n[id] || 0, by: r.by || '', at: r.at || 0 })).sort((a, b) => a.name.localeCompare(b.name))] };
  };
  if (req.method === 'GET') return jsonRes(list());
  if (req.method !== 'POST') throw new MailError(405, 'Method not allowed');
  if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new MailError(415, 'Send JSON');
  let b; try { b = await req.json(); } catch (e) { throw new MailError(400, 'Bad body'); }
  const now = Date.now(), P = { ...R.people }, RS = JSON.parse(JSON.stringify(R.roles));
  if (b.op === 'role') {
    /* a new role, or an existing one renamed or given other pages and permissions */
    const name = lineR(b.name, 40); if (!name) throw new MailError(400, 'Give the role a name');
    const id = b.id ? String(b.id) : '';
    if (id && (id === 'admin' || !own(RS, id))) throw new MailError(id === 'admin' ? 403 : 404, id === 'admin' ? 'Administrator is built in and cannot be changed' : 'That role no longer exists');
    if (name.toLowerCase() === 'administrator' || Object.entries(RS).some(([k, r]) => k !== id && String(r.name).toLowerCase() === name.toLowerCase())) throw new MailError(409, 'There is already a role called ' + name);
    if (!id && Object.keys(RS).length >= 20) throw new MailError(409, 'Twenty roles at most');
    const pages = ROLE_PAGES.filter((x) => (Array.isArray(b.pages) ? b.pages : []).includes(x)), can = ROLE_ACTS.filter((x) => (Array.isArray(b.can) ? b.can : []).includes(x));
    let rid = id;
    if (!rid) { const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'role'; for (let i = 0; !rid || rid === 'admin' || own(RS, rid); i++) rid = base + '-' + (now + i).toString(36).slice(-4); }
    RS[rid] = { name, pages, can, by: who, at: now };
  } else if (b.op === 'delrole') {
    const id = String(b.id || '');
    if (id === 'admin') throw new MailError(403, 'Administrator is built in and cannot be deleted');
    if (!own(RS, id)) throw new MailError(404, 'That role no longer exists');
    const n = Object.values(P).filter((p) => p.role === id).length;
    if (n) throw new MailError(409, n + (n === 1 ? ' person has' : ' people have') + ' this role. Give ' + (n === 1 ? 'them' : 'each of them') + ' another role first');
    delete RS[id];
  } else {
    /* a person: given a role, given another, or their role taken away */
    const email = String(b.email || '').trim().toLowerCase(), role = b.role == null || b.role === '' ? null : String(b.role);
    if (!/^[^@\s<>"]{1,64}@[^@\s<>"]{1,100}\.[a-z]{2,24}$/.test(email)) throw new MailError(400, 'That is not an email address');
    if (role && role !== 'admin' && !own(RS, role)) throw new MailError(404, 'That role no longer exists');
    if (!role && !own(P, email)) throw new MailError(404, email + ' has no role');
    if (!Object.keys(P).length && who && who !== 'unknown') P[who] = { role: 'admin', by: who, at: now };
    if (role) P[email] = { role, by: who, at: now }; else delete P[email];
    if (!Object.values(P).some((p) => p.role === 'admin')) throw new MailError(409, 'Keep at least one administrator');
  }
  const v = { people: P, roles: RS, at: now, by: who }; await kv.put(ROLES, JSON.stringify(v)); ROLES_MEM = { at: Date.now(), v };
  Object.assign(R, v); return jsonRes({ ok: true, ...list() });
}

/* ---- /admin ---- */
const ADMIN_FRAME = "frame-ancestors 'self' https://koz8738.com https://www.koz8738.com";
const clean = (s, n) => String(s == null ? '' : s).replace(/\r\n/g, '\n').slice(0, n);
export async function mailAdmin(req, url, env, opts) {
  const path = url.pathname.replace(/\/+$/, '');
  let who;
  try { who = await accessUser(req, env); }
  catch (e) {
    if (path === '/admin') return new Response(ADMIN_HTML.replace('<!--DENIED-->', '<div class="deny"><b>The admin is locked.</b> ' + String(e.message).replace(/[<>&]/g, '') + '</div>'), { status: e.status || 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': ADMIN_FRAME } });
    return jsonRes({ error: e.message }, e.status || 401);
  }
  /* the role of the person signed in, and whether this request is theirs to make */
  let role = 'admin', RR = null, perm = permsOf(null, 'admin'), lim = null;
  if (env && env.STORE && path !== '/admin/signin') {
    RR = await readRoles(env.STORE); role = roleOf(RR, who);
    if (!role) {
      const msg = 'Your email (' + who + ') has no role in this admin yet. Ask a Polaris administrator to add you under Settings \u203a Roles.';
      if (path === '/admin') return new Response(ADMIN_HTML.replace('<!--DENIED-->', '<div class="deny"><b>Not given a role.</b> ' + msg.replace(/[<>&]/g, '') + '</div>'), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': ADMIN_FRAME } });
      return jsonRes({ error: msg }, 403);
    }
    perm = permsOf(RR, role);
    if (path.startsWith('/admin/api/')) {
      const need = roleNeeds(req.method, path), may = (a) => perm.can.includes(a);
      const no = (what) => jsonRes({ error: 'Your role (' + roleName(RR, role) + ') cannot ' + what + '. An administrator can change that under Settings \u203a Roles.' }, 403);
      if (need === 'admin' && role !== 'admin') return no('do this');
      if (need === 'read' && role !== 'admin') {
        const rp = readPages(path);
        if (!rp) return no('do this');
        if (rp.length && !rp.some((p) => perm.pages.includes(p))) return jsonRes({ error: 'Your role (' + roleName(RR, role) + ') does not see ' + rp.map((p) => PAGE_NAME[p]).join(' or ') + '. An administrator can change that under Settings \u203a Roles.' }, 403);
      }
      if (ROLE_ACTS.includes(need) && !may(need)) return no(ACT_NAME[need]);
      /* the gate plan: its gates are Gates, its automatic-message switches are Settings; what may not change is kept */
      if (need === 'stands') { if (!may('gates') && !may('settings')) return no(ACT_NAME.gates); lim = { sw: !may('settings'), apts: !may('gates') }; }
    }
  }
  /* the EFB's Admin app shows this page inside the EFB (koz8738.com); no other site may frame it */
  if (path === '/admin') {
    /* the role, already applied: nothing shows, and nothing is asked for, that it does not see */
    const me = { email: who, role, roleName: RR ? roleName(RR, role) : 'Administrator', roles: !!RR && Object.keys(RR.people).length > 0, pages: perm.pages, can: perm.can };
    const cls = permClass(perm), js = JSON.stringify(me).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    const html = ADMIN_HTML.replace('<html lang="en">', '<html lang="en"' + (cls ? ' class="' + cls + '"' : '') + '>').replace('<!--PERM-->', '<script>window.PM_PERM=' + js + '</script>');
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': ADMIN_FRAME, 'Referrer-Policy': 'no-referrer' } });
  }
  /* the Admin app's Sign in: Cloudflare Access signs the staff member in on the way here, then back to the EFB */
  if (path === '/admin/signin') {
    const back = String(url.searchParams.get('back') || '');
    return new Response(null, { status: 302, headers: { Location: /^https:\/\/(www\.)?koz8738\.com\/efb\/[^\s]*$/.test(back) ? back : '/admin', 'Cache-Control': 'no-store' } });
  }
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
  /* staff diagnostics: a pilot's latest bookings as vAMSYS returns them (?pilot=PAW0006) */
  /* staff diagnostics: the latest PIREP, booking and live flight as vAMSYS returns them */
  /* staff: a chart PDF and an airport's named points, as a signed-in pilot gets them (testing the EFB's chart line-up) */
  if (path === '/admin/api/chart-pdf' && opts && opts.chartPdf) { try { const r = await opts.chartPdf(url); return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('content-type') || 'application/pdf', 'Cache-Control': 'private, max-age=3600' } }); } catch (e) { return jsonRes({ error: e.message }, 502); } }
  if (path === '/admin/api/chart-fixes' && opts && opts.chartFixes) { try { return jsonRes(await opts.chartFixes(String(url.searchParams.get('icao') || '').toUpperCase(), url)); } catch (e) { return jsonRes({ error: e.message }, 502); } }
  if (path === '/admin/api/chart-list' && opts && opts.chartList) { try { return jsonRes(await opts.chartList(String(url.searchParams.get('icao') || '').trim().toUpperCase())); } catch (e) { return jsonRes({ error: e.message }, 502); } }
  /* staff diagnostics: an eAIP chart list (Hong Kong, Singapore, UK, Norway) as the server reads it; pdf=1 opens the first chart too */
  if (path === '/admin/api/eaip-probe' && opts && opts.eaProbe) { try { return jsonRes(await opts.eaProbe(url.searchParams.get('icao'), url.searchParams.get('pdf'))); } catch (e) { return jsonRes({ error: e.message }, 502); } }
  if (path === '/admin/api/ops-probe' && opts && opts.opsProbe) { try { return jsonRes(await opts.opsProbe()); } catch (e) { return jsonRes({ error: e.message }, 502); } }
  if (path === '/admin/api/bookings-probe' && opts && opts.bkProbe) { try { return jsonRes(await opts.bkProbe(url.searchParams.get('pilot'))); } catch (e) { return jsonRes({ error: e.message }, 502); } }
  /* Pilots page: who is checked in for a flight in the EFB now (see crew.js) */
  if (path === '/admin/api/checkins' && req.method === 'GET') {
    try { return jsonRes(await crew(env, { op: 'ciList' })); } catch (e) { return jsonRes({ error: 'Check-ins are not available right now: ' + e.message }, 502); }
  }
  /* Inbox tab: pilots' conversations with a department (never messages between pilots, see pm.js) */
  if (path === '/admin/api/inbox' || path.startsWith('/admin/api/inbox/')) return pmAdmin(req, path, env, who);
  /* Tasks: published to a department (a role); its people work on them */
  if (path === '/admin/api/tasks') return tasksAdmin(req, url, env, who, { role, roleName: RR ? roleName(RR, role) : 'Administrator', pub: role === 'admin' || perm.can.includes('tasks'), people: RR ? RR.people : {}, roles: RR ? RR.roles : {} });
  /* Documents tab: manuals and SOPs for the EFB's Documents (see docs.js) */
  if (path === '/admin/api/docs' || path.startsWith('/admin/api/docs/')) return docsAdmin(req, url, path, env, who, opts && opts.ctx);
  /* On-time tab: OOOI times and on-time performance (see ooo.js) */
  if (path === '/admin/api/ooo' || path.startsWith('/admin/api/ooo/')) return oooAdmin(req, url, path, env, who);
  /* Calendar tab: the company calendar, with the vAMSYS events (see cal.js) */
  if (path === '/admin/api/cal' || path.startsWith('/admin/api/cal/')) return calAdmin(req, url, path, env, who, opts && opts.events);
  /* Flight Watch on the Live tab: what operations should look at now (see watch.js) */
  if (path === '/admin/api/watch' && req.method === 'GET') {
    try { return jsonRes(opts && opts.watch ? await opts.watch() : { alerts: [] }); } catch (e) { return jsonRes({ error: 'Flight Watch is not available right now: ' + e.message }, 502); }
  }
  /* Stands tab: the stand plan for the automatic stand assignment, and what it sent (see stands.js) */
  if (path === '/admin/api/aoctpl' || path.startsWith('/admin/api/aoctpl/')) return aocTplAdmin(req, path, env, who);
  if (path === '/admin/api/stands' || path.startsWith('/admin/api/stands/')) return standsAdmin(req, url, path, env, who, opts && opts.stands, lim);
  /* Messages tab, sent as AOC: short company messages to the flight deck, shown in the EFB's Messages (see aoc.js) */
  if (path === '/admin/api/aoc') return aocAdmin(req, url, env, who);
  /* Nav Data: where the EFB's navigation data comes from, region by region, and whether it is current (see navdata.js) */
  if (path === '/admin/api/navdata' || path.startsWith('/admin/api/navdata/')) return opts && opts.navdata ? opts.navdata(req, path, who) : jsonRes({ error: 'Not available' }, 503);
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503);
  try {
    if (path === '/admin/api/me') { const R = await readRoles(kv), P = permsOf(R, role); return jsonRes({ email: who, role, roleName: roleName(R, role), roles: Object.keys(R.people).length > 0, pages: P.pages, can: P.can }); }
    if (path === '/admin/api/roles') return await rolesApi(req, kv, who);
    /* Settings page: From names and AOC templates (written only when staff press Save) */
    if (path === '/admin/api/settings' && req.method === 'GET') return jsonRes({ settings: await readSettings(kv) });
    if (path === '/admin/api/settings' && req.method === 'POST') {
      if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new MailError(415, 'Send JSON');
      let b; try { b = await req.json(); } catch (e) { throw new MailError(400, 'Bad body'); }
      const s = { ...cleanSettings(b), at: Date.now(), by: who }; await kv.put(SETTINGS, JSON.stringify(s));
      return jsonRes({ ok: true, settings: s });
    }
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
      if (b.to && b.to.crew) to = crewTo(b.to); // a flight's crew: its callsign and the pilots in it
      else if (b.to) {
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
