/* ---------- Polaris Mail: messages from pilots ----------
   Pilots can write from the EFB to a department (Crew Management, Flight Operations, Training, Fleet) and nobody
   else: the message lands in the admin's Inbox tab, staff answer there, and the answer goes back to that pilot's EFB.
   Writing to another pilot's online flight was removed (Nov 2026). Conversations between pilots from before that stay
   readable, but new messages and replies in them are refused.
   At most 20 messages per pilot in any 24 hours. Messages between pilots are never shown on the admin: the admin API only
   reads conversations with a department.

   Storage: one Durable Object (SQLite), so a message is stored once and is there for every reader at once.
     msg  id, t, th (conversation = id of its first message), kind ('staff' pilot -> department, 'reply' department ->
          pilot, 'pilot' pilot -> pilot), fu/fname/fcs (sending pilot), dept, by (staff email on a reply),
          tu/tcid/tcs/tname (receiving pilot: pilot ID, or VATSIM CID for a flight seen only on VATSIM), subj, body
     st   (id, who) -> rd, del   who = pilot ID, or 'staff' for the shared staff state
   The EFB and the admin talk to the Worker; the Worker talks to the object with small JSON calls (fetch). */

import { crew } from './crew.js';

export const PM_DEPTS = ['Crew Management', 'Flight Operations', 'Training', 'Fleet'];
export const PM_LIMIT = 20;
const DAY = 86_400_000, SUBJ_MAX = 120, BODY_MAX = 4000;

class PmError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, n);
const up = (v, n) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- the Durable Object ---------- */
export class Mailbox {
  constructor(ctx, env) {
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS msg (id TEXT PRIMARY KEY, t INTEGER NOT NULL, th TEXT NOT NULL, kind TEXT NOT NULL,
      fu TEXT NOT NULL DEFAULT '', fname TEXT NOT NULL DEFAULT '', fcs TEXT NOT NULL DEFAULT '', dept TEXT NOT NULL DEFAULT '', by TEXT NOT NULL DEFAULT '',
      tu TEXT NOT NULL DEFAULT '', tcid TEXT NOT NULL DEFAULT '', tcs TEXT NOT NULL DEFAULT '', tname TEXT NOT NULL DEFAULT '',
      subj TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '')`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS st (id TEXT NOT NULL, who TEXT NOT NULL, rd INTEGER NOT NULL DEFAULT 0, del INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (id, who))');
    for (const c of ['fu', 'tu', 'tcid', 'th', 't', 'kind']) this.sql.exec(`CREATE INDEX IF NOT EXISTS msg_${c} ON msg (${c})`);
  }
  rows(q, ...b) { return this.sql.exec(q, ...b).toArray(); }
  one(q, ...b) { return this.rows(q, ...b)[0] || null; }

  async fetch(req) {
    let a; try { a = await req.json(); } catch (e) { return J({ error: 'Bad call' }, 400); }
    try { return J(await this.call(a)); }
    catch (e) { return J({ error: e.message || 'Error' }, e.status || 500); }
  }

  call(a) {
    switch (a.op) {
      case 'list': return this.list(a.u, a.cid);
      case 'send': return this.send(a);
      case 'state': return this.state(a.who, a.ids, a.set);
      case 'staffList': return this.staffList();
      case 'staffReply': return this.staffReply(a);
      case 'staffState': return this.staffState(a.th, a.set);
      default: throw new PmError(400, 'Unknown call');
    }
  }

  sent24(u, now) {
    const r = this.rows('SELECT t FROM msg WHERE fu = ? AND kind != ? AND t > ? ORDER BY t', u, 'reply', now - DAY);
    return { n: r.length, next: r.length >= PM_LIMIT ? r[r.length - PM_LIMIT].t + DAY : 0 };
  }

  /* everything one pilot may see: what they sent, and what was sent to their pilot ID or VATSIM CID */
  list(u, cid) {
    const now = Date.now();
    const L = this.rows(`SELECT m.*, COALESCE(s.rd, 0) AS rd FROM msg m LEFT JOIN st s ON s.id = m.id AND s.who = ?
      WHERE (m.fu = ? OR m.tu = ? OR (? != '' AND m.tcid = ?)) AND COALESCE(s.del, 0) = 0 ORDER BY m.t DESC LIMIT 300`, u, u, u, cid || '', cid || '');
    const s = this.sent24(u, now);
    return { msgs: L.map((m) => pilotView(m, u)), sent24: s.n, limit: PM_LIMIT, nextAt: s.next };
  }

  /* a: { u, name, cid, cs, now, to: { dept } | { flight: { pilot, cid, cs, name } }, replyTo, subject, body } */
  send(a) {
    const u = up(a.u, 12); if (!u) throw new PmError(401, 'Sign in to send messages');
    const now = Date.now(), s = this.sent24(u, now);
    if (s.n >= PM_LIMIT) throw new PmError(429, `You have sent ${PM_LIMIT} messages in the last 24 hours. You can send again at ${new Date(s.next).toISOString().slice(11, 16)}Z.`);
    const body = clean(a.body, BODY_MAX).trim(); let subj = clean(a.subject, SUBJ_MAX).trim();
    if (!body) throw new PmError(400, 'Write a message first');
    const m = { id: newId(), t: now, th: '', kind: '', fu: u, fname: clean(a.name, 60), fcs: up(a.cs, 10), dept: '', by: '', tu: '', tcid: '', tcs: '', tname: '', subj, body };
    if (a.replyTo) {
      const p = this.one('SELECT * FROM msg WHERE id = ?', String(a.replyTo));
      if (!p) throw new PmError(404, 'That conversation no longer exists');
      const cid = String(a.cid || '');
      const mine = p.fu === u || p.tu === u || (cid && p.tcid === cid);
      if (!mine) throw new PmError(403, 'You are not part of that conversation');
      m.th = p.th; if (!m.subj) m.subj = /^re:/i.test(p.subj) ? p.subj : 'Re: ' + p.subj;
      if (p.kind === 'staff' || p.kind === 'reply') { m.kind = 'staff'; m.dept = p.dept; }
      else throw new PmError(410, 'Messages between pilots have ended. You can still write to Polaris staff.');
    } else {
      if (!m.subj) throw new PmError(400, 'Add a subject');
      m.th = m.id;
      const to = a.to || {};
      if (to.dept) {
        if (!PM_DEPTS.includes(to.dept)) throw new PmError(400, 'Pick a department');
        m.kind = 'staff'; m.dept = to.dept;
      } else throw new PmError(400, 'Pick a department');
    }
    this.sql.exec('INSERT INTO msg (id, t, th, kind, fu, fname, fcs, dept, by, tu, tcid, tcs, tname, subj, body) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      m.id, m.t, m.th, m.kind, m.fu, m.fname, m.fcs, m.dept, m.by, m.tu, m.tcid, m.tcs, m.tname, m.subj, m.body);
    this.sql.exec('INSERT OR REPLACE INTO st (id, who, rd, del) VALUES (?, ?, 1, 0)', m.id, u);
    if (m.kind === 'staff') this.sql.exec("DELETE FROM st WHERE who = 'staff' AND id = ?", m.th);   // a new message re-opens the conversation for staff
    const s2 = this.sent24(u, now);
    /* for the Worker: who gets a push (never sent on to the EFB) */
    const notify = m.kind === 'pilot' ? { to: { u: m.tu, cid: m.tcid }, title: (m.fu + (m.fname ? ' · ' + m.fname : '')), body: m.subj + ' — ' + m.body.replace(/\s+/g, ' ').slice(0, 160) } : null;
    return { ok: true, msg: pilotView({ ...m, rd: 1 }, u), sent24: s2.n, limit: PM_LIMIT, nextAt: s2.next, notify };
  }

  state(who, ids, set) {
    who = up(who, 12); if (!who) throw new PmError(401, 'Sign in first');
    for (const id of (Array.isArray(ids) ? ids : []).slice(0, 300)) {
      const cur = this.one('SELECT rd, del FROM st WHERE id = ? AND who = ?', String(id), who) || { rd: 0, del: 0 };
      this.sql.exec('INSERT OR REPLACE INTO st (id, who, rd, del) VALUES (?, ?, ?, ?)', String(id), who, set && set.read != null ? (set.read ? 1 : 0) : cur.rd, set && set.del ? 1 : cur.del);
    }
    return { ok: true };
  }

  /* ---- staff: conversations with a department only ---- */
  staffList() {
    const L = this.rows("SELECT * FROM msg WHERE kind IN ('staff', 'reply') ORDER BY t DESC LIMIT 2000");
    const st = new Map(this.rows("SELECT id, rd, del FROM st WHERE who = 'staff'").map((r) => [r.id, r]));
    const by = new Map();
    for (const m of L) {
      let c = by.get(m.th);
      if (!c) { c = { th: m.th, dept: m.dept, pilot: '', name: '', cs: '', subj: '', last: m.t, msgs: [] }; by.set(m.th, c); }
      c.msgs.push({ id: m.id, t: m.t, kind: m.kind, from: m.kind === 'staff' ? m.fu : m.dept, by: m.by, cs: m.fcs, subj: m.subj, body: m.body });
      if (m.kind === 'staff') { c.pilot = m.fu; c.name = m.fname || c.name; if (!c.cs) c.cs = m.fcs; }
      if (m.id === m.th) c.subj = m.subj;
    }
    const out = [];
    for (const c of by.values()) {
      c.msgs.reverse(); if (!c.subj) c.subj = c.msgs[0].subj;
      const s = st.get(c.th) || { rd: 0, del: 0 }, lastIn = [...c.msgs].reverse().find((x) => x.kind === 'staff');
      c.waiting = !!lastIn && c.msgs[c.msgs.length - 1].kind === 'staff';   // the pilot spoke last
      c.done = !!s.del; c.read = !!s.rd;
      out.push(c);
    }
    return { threads: out.sort((a, b) => b.last - a.last), depts: PM_DEPTS };
  }
  staffReply(a) {
    const first = this.one("SELECT * FROM msg WHERE th = ? AND kind = 'staff' ORDER BY t LIMIT 1", String(a.th || ''));
    if (!first) throw new PmError(404, 'That conversation no longer exists');
    const body = clean(a.body, BODY_MAX).trim(); if (!body) throw new PmError(400, 'Write a reply first');
    const dept = PM_DEPTS.includes(a.dept) ? a.dept : first.dept, root = this.one('SELECT subj FROM msg WHERE id = ?', first.th) || first;
    const m = { id: newId(), t: Date.now(), th: first.th, kind: 'reply', dept, by: clean(a.by, 120), tu: first.fu, tcs: first.fcs, tname: first.fname, subj: /^re:/i.test(root.subj) ? root.subj : 'Re: ' + root.subj, body };
    this.sql.exec("INSERT INTO msg (id, t, th, kind, fu, fname, fcs, dept, by, tu, tcid, tcs, tname, subj, body) VALUES (?, ?, ?, 'reply', '', '', '', ?, ?, ?, '', ?, ?, ?, ?)",
      m.id, m.t, m.th, m.dept, m.by, m.tu, m.tcs, m.tname, m.subj, m.body);
    this.sql.exec("INSERT OR REPLACE INTO st (id, who, rd, del) VALUES (?, 'staff', 1, 0)", m.th);
    return { ok: true, notify: { to: { u: m.tu }, title: m.dept, body: m.subj + ' — ' + m.body.replace(/\s+/g, ' ').slice(0, 160) } };
  }
  staffState(th, set) {
    th = String(th || ''); if (!this.one("SELECT id FROM msg WHERE th = ? AND kind IN ('staff', 'reply') LIMIT 1", th)) throw new PmError(404, 'That conversation no longer exists');
    const cur = this.one("SELECT rd, del FROM st WHERE id = ? AND who = 'staff'", th) || { rd: 0, del: 0 };
    this.sql.exec("INSERT OR REPLACE INTO st (id, who, rd, del) VALUES (?, 'staff', ?, ?)", th, set && set.read != null ? (set.read ? 1 : 0) : cur.rd, set && set.done != null ? (set.done ? 1 : 0) : cur.del);
    return { ok: true };
  }
}

/* what a pilot sees of one message: no staff emails, no other pilot's VATSIM CID */
function pilotView(m, u) {
  const out = m.fu === u;
  const from = m.kind === 'reply' ? { dept: m.dept } : { pilot: m.fu, name: m.fname, cs: m.fcs };
  const to = m.kind === 'staff' ? { dept: m.dept } : { pilot: m.tu, name: m.tname, cs: m.tcs };
  return { id: m.id, t: m.t, th: m.th, kind: m.kind, out, from, to, subject: m.subj, body: m.body, read: out || !!m.rd };
}
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

/* ---------- Worker side ---------- */
async function pmPush(env, n, tag) { if (!n || !n.to || (!n.to.u && !n.to.cid)) return; try { await crew(env, { op: 'notify', to: n.to, cat: 'mail', payload: { title: n.title, body: n.body, url: '#mail', tag } }); } catch (e) { console.warn('[pm push]', e && e.message); } }
async function box(env, a) {
  if (!env || !env.PM) throw new PmError(503, 'Messages are not set up on the server yet');
  const stub = env.PM.get(env.PM.idFromName('polaris'));
  const r = await stub.fetch('https://pm/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new PmError(r.status, j.error || 'Messages are not available right now');
  return j;
}

/** EFB routes. me = signed-in session ({ u, n, c }) or null. */
export async function pmPublic(req, url, env, h, me, deps) {
  const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  try {
    if (!me) throw new PmError(401, 'Sign in to use messages');
    const path = url.pathname.replace(/\/+$/, '');
    if (path === '/api/efb/pm' && req.method === 'GET') return res({ ...(await box(env, { op: 'list', u: me.u, cid: me.c ? String(me.c) : '' })), depts: PM_DEPTS });
    if (req.method !== 'POST') throw new PmError(405, 'Method not allowed');
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new PmError(415, 'Send JSON');
    let b; try { b = await req.json(); } catch (e) { throw new PmError(400, 'Bad body'); }
    if (path === '/api/efb/pm/state') return res(await box(env, { op: 'state', who: me.u, ids: b.ids, set: { read: b.read, del: b.del } }));
    if (path === '/api/efb/pm') {
      const fresh = deps.fresh ? await deps.fresh() : me;   // signed out or removed since the token was made: no sending
      if (!fresh) throw new PmError(401, 'Your sign-in has ended. Please sign in again with vAMSYS.');
      const a = { op: 'send', u: me.u, name: me.n || '', cid: me.c ? String(me.c) : '', cs: clean(b.cs, 10), replyTo: b.replyTo || '', subject: b.subject, body: b.body };
      if (!b.replyTo) {
        if (b.to && b.to.dept) a.to = { dept: String(b.to.dept) };
        else throw new PmError(400, 'Messages go to a Polaris department');
      }
      const r = await box(env, a), n = r.notify; delete r.notify;
      await pmPush(env, n, 'pm-' + (r.msg && r.msg.th));
      return res(r);
    }
    throw new PmError(404, 'Not found');
  } catch (e) { return res({ error: e.message || 'Error' }, e.status || 500); }
}

/** Admin routes (the caller has already checked Cloudflare Access): conversations with a department only. */
export async function pmAdmin(req, path, env, who) {
  const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  try {
    if (path === '/admin/api/inbox' && req.method === 'GET') return res(await box(env, { op: 'staffList' }));
    if (req.method !== 'POST') throw new PmError(405, 'Method not allowed');
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new PmError(415, 'Send JSON');
    let b; try { b = await req.json(); } catch (e) { throw new PmError(400, 'Bad body'); }
    if (path === '/admin/api/inbox/reply') { const r = await box(env, { op: 'staffReply', th: b.th, dept: b.dept, body: b.body, by: who }), n = r.notify; delete r.notify; await pmPush(env, n, 'pm-' + b.th); return res(r); }
    if (path === '/admin/api/inbox/state') return res(await box(env, { op: 'staffState', th: b.th, set: { read: b.read, done: b.done } }));
    throw new PmError(404, 'Not found');
  } catch (e) { return res({ error: e.message || 'Error' }, e.status || 500); }
}
