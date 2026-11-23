/* ---------- Tasks (Nov 2026): staff tasks in the Operations admin (/admin#tasks) ----------
   An administrator, or a role given "Publish tasks" under Settings > Roles, publishes a task to a department (a role)
   and, if they like, to one person in it. The people in that department start it, finish it, add notes, and take it
   or pass it to someone else in the department. Publishers see every department's tasks (and Home's Departments
   chart); everyone else sees their own department's.

   Storage: one Durable Object (SQLite), so two people changing tasks at the same moment both count.
     task  id, t (published), at (last change), by (publisher's email), title, body, dept (role id), who (email of
           the person on it; '' = anyone in the department), pri (0 normal, 1 high, 2 urgent), due (ms, 0 = none),
           state (todo | doing | done), started, done (ms)
     ev    what happened to a task: id, t, by, k (made | edit | dept | who | state | note), v
   A finished task goes 90 days after it was finished. The Worker decides who may do what (roles live in KV, see
   mail.js); it tells the object which department a member is in (only) and who is in which department (ppl). */

const DAY = 86_400_000, KEEP = 90 * DAY, SHOW_DONE = 14 * DAY, MAX = 2000, TITLE_MAX = 120, BODY_MAX = 4000, NOTE_MAX = 2000;
export const TASK_STATES = ['todo', 'doing', 'done'];

class TaskError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const clean = (v, n) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, n);
const line = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

/* ---------- the Durable Object ---------- */
export class Taskboard {
  constructor(ctx) {
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS task (id TEXT PRIMARY KEY, t INTEGER NOT NULL, at INTEGER NOT NULL, by TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', dept TEXT NOT NULL, who TEXT NOT NULL DEFAULT '', pri INTEGER NOT NULL DEFAULT 0,
      due INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'todo', started INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ev (id TEXT NOT NULL, t INTEGER NOT NULL, by TEXT NOT NULL DEFAULT '', k TEXT NOT NULL, v TEXT NOT NULL DEFAULT '')`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS task_dept ON task (dept)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS task_state ON task (state, done)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS ev_id ON ev (id, t)');
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
      case 'list': return this.list(a);
      case 'get': return this.get(a);
      case 'new': return this.make(a);
      case 'edit': return this.edit(a);
      case 'del': return this.del(a);
      case 'state': return this.setState(a);
      case 'who': return this.setWho(a);
      case 'note': return this.note(a);
      default: throw new TaskError(400, 'Unknown call');
    }
  }

  view(r) { return { id: r.id, t: r.t, at: r.at, by: r.by, title: r.title, body: r.body, dept: r.dept, who: r.who, pri: r.pri, due: r.due, state: r.state, started: r.started, done: r.done, notes: r.notes || 0 }; }
  /* one task, and for a member only one of their department's */
  task(id, only) {
    const r = this.one('SELECT * FROM task WHERE id = ?', String(id || ''));
    if (!r || (only && r.dept !== only)) throw new TaskError(404, 'That task is no longer there');
    return r;
  }
  full(id) {
    const r = this.one(`SELECT t.*, (SELECT COUNT(*) FROM ev e WHERE e.id = t.id AND e.k = 'note') AS notes FROM task t WHERE t.id = ?`, id);
    return { task: this.view(r), evs: this.rows('SELECT t, by, k, v FROM ev WHERE id = ? ORDER BY t, rowid', id) };
  }
  ev(id, by, k, v, t) { this.sql.exec('INSERT INTO ev (id, t, by, k, v) VALUES (?, ?, ?, ?, ?)', id, t, String(by || ''), k, String(v == null ? '' : v)); }
  prune(now) {
    this.sql.exec(`DELETE FROM ev WHERE id IN (SELECT id FROM task WHERE state = 'done' AND done > 0 AND done < ?)`, now - KEEP);
    this.sql.exec(`DELETE FROM task WHERE state = 'done' AND done > 0 AND done < ?`, now - KEEP);
  }

  /* what is open, and what was finished in the last 14 days; one department, or every one */
  list(a) {
    const dept = a.only ? String(a.only) : '';
    const L = this.rows(`SELECT t.*, (SELECT COUNT(*) FROM ev e WHERE e.id = t.id AND e.k = 'note') AS notes FROM task t
      WHERE (t.state != 'done' OR t.done >= ?) AND (? = '' OR t.dept = ?) ORDER BY t.t DESC LIMIT 1500`, Date.now() - SHOW_DONE, dept, dept);
    return { tasks: L.map((r) => this.view(r)) };
  }
  get(a) { const r = this.task(a.id, a.only); return this.full(r.id); }

  /* a task's details as a publisher gives them; depts = the roles there are, ppl = { email: role id } */
  fields(a, keepDept) {
    const title = line(a.title, TITLE_MAX); if (!title) throw new TaskError(400, 'Give the task a title');
    const body = clean(a.body, BODY_MAX).trim();
    const dept = String(a.dept || '');
    if (!dept || !((a.depts || []).includes(dept) || dept === keepDept)) throw new TaskError(400, 'Pick a department');
    const who = String(a.who || '').trim().toLowerCase();
    if (who && !(own(a.ppl, who) && a.ppl[who] === dept)) throw new TaskError(400, who + ' is not in that department');
    const pri = [0, 1, 2].includes(Number(a.pri)) ? Number(a.pri) : 0;
    const due = Math.round(Number(a.due) || 0);
    if (due && (due < Date.UTC(2020, 0, 1) || due > Date.UTC(2100, 0, 1))) throw new TaskError(400, 'That due time is not right');
    return { title, body, dept, who, pri, due };
  }
  make(a) {
    const now = Date.now(); this.prune(now);
    const n = this.one('SELECT COUNT(*) AS n FROM task').n;
    if (n >= MAX) throw new TaskError(409, 'There are ' + MAX + ' tasks already. Delete some finished ones first');
    const f = this.fields(a, ''), id = newId();
    this.sql.exec(`INSERT INTO task (id, t, at, by, title, body, dept, who, pri, due, state, started, done) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', 0, 0)`,
      id, now, now, String(a.by || ''), f.title, f.body, f.dept, f.who, f.pri, f.due);
    this.ev(id, a.by, 'made', '', now);
    if (f.who) this.ev(id, a.by, 'who', f.who, now);
    return { ok: true, ...this.full(id) };
  }
  edit(a) {
    const r = this.task(a.id), now = Date.now(), f = this.fields(a, r.dept);
    const ch = ['title', 'body', 'pri', 'due'].filter((k) => f[k] !== r[k]);
    if (!ch.length && f.dept === r.dept && f.who === r.who) return { ok: true, ...this.full(r.id) };
    this.sql.exec('UPDATE task SET title = ?, body = ?, dept = ?, who = ?, pri = ?, due = ?, at = ? WHERE id = ?', f.title, f.body, f.dept, f.who, f.pri, f.due, now, r.id);
    if (ch.length) this.ev(r.id, a.by, 'edit', ch.join(','), now);
    if (f.dept !== r.dept) this.ev(r.id, a.by, 'dept', f.dept, now);
    if (f.who !== r.who) this.ev(r.id, a.by, 'who', f.who, now);
    return { ok: true, ...this.full(r.id) };
  }
  del(a) {
    const r = this.task(a.id);
    this.sql.exec('DELETE FROM ev WHERE id = ?', r.id); this.sql.exec('DELETE FROM task WHERE id = ?', r.id);
    return { ok: true, id: r.id };
  }
  /* To do, In progress, Done. Starting a task nobody has makes it the starter's, when they are in its department */
  setState(a) {
    const r = this.task(a.id, a.only), st = String(a.state || '');
    if (!TASK_STATES.includes(st)) throw new TaskError(400, 'Not a task state');
    if (st === r.state) return { ok: true, ...this.full(r.id) };
    const now = Date.now(), me = String(a.by || '');
    const who = st === 'doing' && !r.who && own(a.ppl, me) && a.ppl[me] === r.dept ? me : r.who;
    const started = st === 'todo' ? 0 : r.started || now, done = st === 'done' ? now : 0;
    this.sql.exec('UPDATE task SET state = ?, who = ?, started = ?, done = ?, at = ? WHERE id = ?', st, who, started, done, now, r.id);
    this.ev(r.id, me, 'state', st, now);
    if (who !== r.who) this.ev(r.id, me, 'who', who, now);
    this.prune(now);
    return { ok: true, ...this.full(r.id) };
  }
  /* who is on it: someone in its department, or '' for anyone there */
  setWho(a) {
    const r = this.task(a.id, a.only), who = String(a.who || '').trim().toLowerCase();
    if (who && !(own(a.ppl, who) && a.ppl[who] === r.dept)) throw new TaskError(400, who + ' is not in that department');
    if (who === r.who) return { ok: true, ...this.full(r.id) };
    const now = Date.now();
    this.sql.exec('UPDATE task SET who = ?, at = ? WHERE id = ?', who, now, r.id);
    this.ev(r.id, a.by, 'who', who, now);
    return { ok: true, ...this.full(r.id) };
  }
  note(a) {
    const r = this.task(a.id, a.only), text = clean(a.text, NOTE_MAX).trim();
    if (!text) throw new TaskError(400, 'Write the note first');
    const now = Date.now();
    this.sql.exec('UPDATE task SET at = ? WHERE id = ?', now, r.id);
    this.ev(r.id, a.by, 'note', text, now);
    return { ok: true, ...this.full(r.id) };
  }
}

/* ---------- Worker side: /admin/api/tasks ---------- */
async function board(env, a) {
  if (!env || !env.TASKS) throw new TaskError(503, 'Tasks are not set up on the server yet');
  const stub = env.TASKS.get(env.TASKS.idFromName('polaris'));
  const r = await stub.fetch('https://tasks/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new TaskError(r.status, j.error || 'Tasks are not available right now');
  return j;
}

/* who: the staff member signed in. ctx (from mail.js): role (their role id), roleName, pub (may publish: an
   administrator, or a role with "Publish tasks"), people ({ email: { role } }), roles ({ id: { name } }) */
export async function tasksAdmin(req, url, env, who, ctx) {
  const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  try {
    const roles = ctx.roles || {}, people = ctx.people || {};
    const ppl = Object.fromEntries(Object.entries(people).filter(([, p]) => p && (p.role === 'admin' || own(roles, p.role))).map(([e, p]) => [e, p.role]));
    const n = {}; for (const r of Object.values(ppl)) n[r] = (n[r] || 0) + 1;
    const depts = [{ id: 'admin', name: 'Administrator', n: n.admin || 0 }, ...Object.entries(roles).map(([id, r]) => ({ id, name: r.name, n: n[id] || 0 })).sort((a, b) => a.name.localeCompare(b.name))];
    /* a member sees and changes only their department's tasks */
    const only = ctx.pub ? '' : String(ctx.role || '');
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) return res(await board(env, { op: 'get', id, only }));
      const L = await board(env, { op: 'list', only });
      return res({ ...L, depts: ctx.pub ? depts : depts.filter((d) => d.id === only),
        people: Object.entries(ppl).filter(([, r]) => ctx.pub || r === only).map(([email, role]) => ({ email, role })).sort((a, b) => a.email.localeCompare(b.email)),
        me: who, role: ctx.role, roleName: ctx.roleName || '', pub: !!ctx.pub, now: Date.now() });
    }
    if (req.method !== 'POST') throw new TaskError(405, 'Method not allowed');
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new TaskError(415, 'Send JSON');
    let b; try { b = await req.json(); } catch (e) { throw new TaskError(400, 'Bad body'); }
    const op = String(b.op || '');
    if (['new', 'edit', 'del'].includes(op)) { if (!ctx.pub) throw new TaskError(403, 'Your role (' + (ctx.roleName || ctx.role) + ') cannot publish tasks. An administrator can change that under Settings › Roles.'); }
    else if (!['state', 'who', 'note'].includes(op)) throw new TaskError(400, 'Unknown change');
    const a = { op, by: who, only, ppl, depts: depts.map((d) => d.id) };
    for (const k of ['id', 'title', 'body', 'dept', 'who', 'pri', 'due', 'state', 'text']) if (b[k] !== undefined) a[k] = b[k];
    return res(await board(env, a));
  } catch (e) { return res({ error: e.message || 'Error' }, e.status || 500); }
}
