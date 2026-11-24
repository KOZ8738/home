/* ---------- The Polaris company calendar ----------
   Staff plan on /admin (Calendar tab): group flights, training, meetings, notices, maintenance windows. An entry happens
   once or every week (until a date), is for everyone, for some pilots or for a flight's crew, can remind its pilots by
   push before it starts, and shows in the EFB's Calendar app while "Show in EFB" is on. The vAMSYS events (the
   website's Events page) sit on the same calendar: they all show in the EFB unless staff hide one, and staff can add a
   Polaris note to one. vAMSYS events are read from vAMSYS and never written there.

   KV (STORE):  cal:v1:index -> [{ id, title, type, s, e, allDay, rep: '' | 'weekly', until, loc, body,
                                   to: null | { list: 1, m } | { crew: 1, cs, m }, efb, remind, t, by, ed, edBy }]
                cal:v1:vam   -> { [vAMSYS event id]: { hide, note, at, by } } */
import { crew, crewTo, calNext, calFor } from './crew.js';

class CalError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const IDX = 'cal:v1:index', VAM = 'cal:v1:vam', CAL_MAX = 500, BODY_MAX = 4000;
export const CAL_TYPES = ['group', 'training', 'meeting', 'event', 'notice', 'maint'];
const REMINDS = [0, 15, 30, 60, 120, 1440];
const jsonRes = (body, status, headers) => new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const line = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const text = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);

let mem = null; // { at, list, vam } a short cache for the pilots' side
async function readIndex(kv) { const v = await kv.get(IDX, 'json'); return Array.isArray(v) ? v : []; }
async function readVam(kv) { const v = await kv.get(VAM, 'json'); return v && typeof v === 'object' ? v : {}; }
async function writeIndex(kv, list) { list.sort((a, b) => a.s - b.s); await kv.put(IDX, JSON.stringify(list.slice(-CAL_MAX))); mem = null; }
/* still worth showing: not over more than 200 days ago (a weekly entry: its last week) */
const live = (v, now) => (v.rep === 'weekly' ? !v.until || +v.until > now - 200 * 86400_000 : (+v.e || +v.s) > now - 200 * 86400_000);
const pub = (v) => ({ id: v.id, title: v.title, type: v.type, s: v.s, e: v.e, allDay: !!v.allDay, rep: v.rep || '', until: v.until || 0, loc: v.loc || '', body: v.body || '', remind: v.remind || 0,
  to: v.to ? (v.to.crew ? { crew: 1, cs: v.to.cs } : { list: 1 }) : null });

/* GET /api/efb/cal?cs=: the signed-in pilot's company calendar: Polaris's entries for them, and the vAMSYS events.
   staff(sess): for a pilot linked to a staff member (Settings › People), { tasks, dept }; else null (tasks: null) */
export async function calPublic(req, env, h, sess, events, staff) {
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503, h);
  if (!sess) return jsonRes({ error: 'Sign in to see the Polaris calendar' }, 401, h);
  const cs = String(new URL(req.url).searchParams.get('cs') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8), now = Date.now();
  try { if (!mem || now - mem.at > 30000) mem = { at: now, list: await readIndex(kv), vam: await readVam(kv) }; }
  catch (e) { return jsonRes({ error: 'The calendar is not available right now' }, 503, h); }
  const items = mem.list.filter((v) => v.efb && live(v, now) && calFor(v, sess, cs, now)).map(pub);
  let vamsys = [];
  try { const j = await events(); vamsys = [].concat((j && j.current) || [], (j && j.past) || []).filter((x) => !(mem.vam[x.id] && mem.vam[x.id].hide)).map((x) => (mem.vam[x.id] && mem.vam[x.id].note ? { ...x, note: mem.vam[x.id].note } : x)); }
  catch (e) { /* vAMSYS slow: Polaris's own entries still come */ }
  let tasks; let dept = '';
  if (staff) { try { const st = await staff(sess); tasks = st ? st.tasks : null; dept = st ? st.dept : ''; } catch (e) { tasks = undefined; /* tasks not reachable: the EFB keeps the last */ } }
  return jsonRes({ items, vamsys, ...(tasks !== undefined ? { tasks, dept } : {}), at: new Date(now).toISOString() }, 200, { ...h, 'Cache-Control': 'no-cache' });
}

/* a reminder push before the next occurrence (the crew object rings it, and sets the one after for a weekly entry) */
async function remindJob(env, v) {
  try {
    await crew(env, { op: 'unjob', id: 'cal:' + v.id });
    if (!v.efb || !(+v.remind > 0)) return;
    const nx = calNext(v, Date.now()); if (nx) await crew(env, { op: 'schedule', id: 'cal:' + v.id, at: nx - v.remind * 60_000, kind: 'cal', data: { id: v.id, occ: nx } });
  } catch (e) { console.warn('[cal remind]', e && e.message); }
}

function cleanItem(b, old, who) {
  const title = line(b.title, 100); if (!title) throw new CalError(400, 'Give the entry a title');
  const s = Math.round(+b.s), e = Math.round(+b.e || 0);
  if (!(s > Date.UTC(2020, 0, 1)) || s > Date.UTC(2100, 0, 1)) throw new CalError(400, 'The start is not a date');
  if (e && e < s) throw new CalError(400, 'The end is before the start');
  if (e && e - s > 31 * 86400_000) throw new CalError(400, 'An entry lasts at most 31 days');
  const rep = b.rep === 'weekly' ? 'weekly' : '', until = rep && b.until ? Math.round(+b.until) : 0;
  if (rep && e && e - s > 7 * 86400_000) throw new CalError(400, 'A weekly entry lasts at most a week');
  if (until && until < s) throw new CalError(400, 'It cannot stop repeating before it starts');
  let to = null;
  if (b.to && b.to.crew) to = crewTo(b.to);
  else if (b.to && b.to.list) {
    const up = (v, n) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n), m = [], seen = new Set();
    for (const x of Array.isArray(b.to.m) ? b.to.m : []) {
      const p = up(x && x.pilot, 12), c = String((x && x.cid) || '').replace(/\D/g, '').slice(0, 9), k = p || 'c' + c;
      if ((!p && !c) || seen.has(k)) continue; seen.add(k); m.push({ pilot: p, cid: c, name: line(x.name, 60) });
    }
    if (!m.length) throw new CalError(400, 'Add the pilots this entry is for');
    if (m.length > 40) throw new CalError(400, 'At most 40 pilots; for more, choose everyone');
    to = { list: 1, m };
  }
  const remind = REMINDS.includes(+b.remind) ? +b.remind : 0;
  const v = { id: old ? old.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 7), title, type: CAL_TYPES.includes(b.type) ? b.type : 'event', s, e: e || s + 3600_000,
    allDay: !!b.allDay, rep, until, loc: line(b.loc, 120), body: text(b.body, BODY_MAX), to, efb: b.efb !== false, remind, t: old ? old.t : Date.now(), by: old ? old.by : who };
  if (old) { v.ed = Date.now(); v.edBy = who; }
  return v;
}

/* /admin/api/cal (GET, POST, DELETE ?id=) and /admin/api/cal/vam (POST { id, hide, note }) */
export async function calAdmin(req, url, path, env, who, events) {
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503);
  try {
    if (req.method === 'GET' && path === '/admin/api/cal') {
      let ev = null, evErr = '';
      try { ev = events ? await events() : null; } catch (e) { evErr = 'vAMSYS events are not available right now: ' + e.message; }
      return jsonRes({ items: await readIndex(kv), vam: await readVam(kv), vamsys: ev ? [].concat(ev.current || [], ev.past || []) : [], vamsysErr: evErr, now: Date.now() });
    }
    if (req.method === 'DELETE' && path === '/admin/api/cal') {
      const id = String(url.searchParams.get('id') || ''), list = await readIndex(kv);
      if (!list.some((v) => v.id === id)) throw new CalError(404, 'That entry no longer exists');
      await writeIndex(kv, list.filter((v) => v.id !== id));
      try { await crew(env, { op: 'unjob', id: 'cal:' + id }); } catch (e) { /* no reminder to take back */ }
      return jsonRes({ ok: true });
    }
    if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405);
    /* same-origin only: the admin page posts as JSON, which a form on another site cannot send */
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new CalError(415, 'Send JSON');
    let b; try { b = await req.json(); } catch (e) { throw new CalError(400, 'Bad body'); }
    if (path === '/admin/api/cal') {
      const list = await readIndex(kv), old = b.id ? list.find((v) => v.id === b.id) : null;
      if (b.id && !old) throw new CalError(404, 'That entry no longer exists');
      const v = cleanItem(b, old, who);
      await writeIndex(kv, [...list.filter((x) => x.id !== v.id), v]);
      await remindJob(env, v);
      return jsonRes({ ok: true, item: v });
    }
    if (path === '/admin/api/cal/vam') {
      const id = Math.round(+b.id); if (!(id > 0)) throw new CalError(400, 'Not a vAMSYS event');
      const vam = await readVam(kv), note = text(b.note, 1000);
      if (!b.hide && !note) delete vam[id]; else vam[id] = { hide: !!b.hide, note, at: Date.now(), by: who };
      await kv.put(VAM, JSON.stringify(vam)); mem = null;
      return jsonRes({ ok: true, vam: vam[id] || null });
    }
    return jsonRes({ error: 'Not found' }, 404);
  } catch (e) { return jsonRes({ error: e.message || 'Error' }, e.status || 500); }
}
