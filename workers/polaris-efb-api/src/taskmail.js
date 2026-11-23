/* ---------- Task emails (Nov 2026) ----------
   Staff hear about their tasks (tasks.js) by email, sent with Cloudflare Email Service as the AIRAC reminders are (the
   EMAIL binding, from MAIL_FROM; see airacmail.js and wrangler.toml):
     · a task published to them, or to their department while nobody is on it, or passed to them;
     · a task they published, finished by someone else;
     · a task on them (or their department's, nobody on it) due within 24 hours and not done: once (the 20-minute cron).
   Never to the one who made the change. Each person can turn them off for themselves on the Tasks page (KV
   tk:mailoff, a list of addresses). Nothing is sent while email is not set up on the server. */

const OFF_KEY = 'tk:mailoff', ADMIN_URL = 'https://efb-api.koz8738.com/admin#tasks', SOON = 24 * 3600_000;
const PRI = ['', '[High] ', '[Urgent] '];
const okEmail = (x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(x || ''));
const name = (e) => String(e || '').split('@')[0];
const zulu = (t) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) + ' ' + new Date(t).toISOString().slice(11, 16) + 'Z';
const hoursTo = (t, now) => { const h = Math.max(0, Math.round((t - now) / 3600_000)); return h <= 1 ? 'within the hour' : 'in ' + h + ' hours'; };

export const taskMailReady = (env) => !!(env && env.EMAIL && typeof env.EMAIL.send === 'function' && String(env.MAIL_FROM || '').trim());
export async function mailOffList(env) { const v = env && env.STORE ? await env.STORE.get(OFF_KEY, 'json').catch(() => null) : null; return Array.isArray(v) ? v : []; }
export async function setMailOff(env, email, off) {
  email = String(email || '').toLowerCase(); if (!env.STORE || !okEmail(email)) return false;
  const L = (await mailOffList(env)).filter((x) => x !== email); if (off) L.push(email);
  await env.STORE.put(OFF_KEY, JSON.stringify(L.slice(-500))); return true;
}

/* { subject, text } of one email. kind: 'new' (published to them or their department), 'given' (passed to them),
   'done' (their task finished), 'due' (due soon); t: the task; dept: its department's name; by: who did it */
export function taskMail(kind, t, dept, by, now = Date.now()) {
  const title = String(t.title || 'A task'), pri = PRI[t.pri] || '';
  const subject = kind === 'done' ? 'Done: ' + title
    : kind === 'due' ? pri + 'Due ' + hoursTo(t.due, now) + ': ' + title
    : kind === 'given' ? pri + 'Task for you: ' + title
    : pri + (t.who ? 'Task for you: ' : 'New task for ' + dept + ': ') + title;
  const head = kind === 'done' ? name(by) + ' finished a task you published, “' + title + '”, at ' + zulu(t.done || now) + '.'
    : kind === 'due' ? '“' + title + '” is due ' + zulu(t.due) + ' (' + hoursTo(t.due, now) + ') and is not done yet' + (t.who ? '.' : ': nobody in ' + dept + ' has taken it.')
    : kind === 'given' ? name(by) + ' put you on “' + title + '” (' + dept + ').'
    : name(by) + ' published a task' + (t.who ? ' for you' : ' for ' + dept + ': anyone there can take it') + '.';
  const facts = ['Department: ' + dept, 'Priority: ' + (['Normal', 'High', 'Urgent'][t.pri] || 'Normal'), t.due ? 'Due: ' + zulu(t.due) : '', 'Published by: ' + (t.by || '—')].filter(Boolean);
  const parts = [head, (kind === 'done' ? '' : facts.join('\n')), String(t.body || '').trim() ? 'Details:\n' + String(t.body).trim().slice(0, 1500) : '',
    'Open Tasks: ' + ADMIN_URL,
    'You get this because of your role in Polaris Operations. To stop task emails, untick “Email me about my tasks” on the Tasks page.'].filter(Boolean);
  return { subject: subject.slice(0, 160), text: parts.join('\n\n') };
}

/* to each address (not the one who did it, not those who turned the emails off): [{ to, ok, err }] */
export async function taskSend(env, to, m, actor) {
  if (!taskMailReady(env)) return [];
  const off = new Set(await mailOffList(env)), me = String(actor || '').toLowerCase();
  const list = [...new Set((to || []).map((x) => String(x || '').toLowerCase()))].filter((x) => okEmail(x) && x !== me && !off.has(x)).slice(0, 50);
  const from = String(env.MAIL_FROM).trim(), out = [];
  for (const x of list) {
    try { await env.EMAIL.send({ to: x, from: { email: from, name: 'Polaris Operations' }, subject: m.subject, text: m.text }); out.push({ to: x, ok: true }); }
    catch (e) { out.push({ to: x, ok: false, err: String((e && (e.code || e.message)) || e).slice(0, 160) }); }
  }
  if (out.some((r) => !r.ok)) console.warn('[task mail]', JSON.stringify(out.filter((r) => !r.ok)));
  return out;
}

/* what a change means for whom. op: the change; r: its answer from the task board ({ task, evs }); ppl: { email: role
   id }; names: { role id: name }; by: who made it. [{ kind, to }] */
export function taskNotices(op, r, ppl, names, by) {
  const t = r && r.task; if (!t) return [];
  const dept = names[t.dept] || (t.dept === 'admin' ? 'Administrator' : t.dept), members = Object.keys(ppl).filter((e) => ppl[e] === t.dept);
  /* what this change did: its events, at the task's last change, by this person */
  const evs = (r.evs || []).filter((e) => e.t === t.at && e.by === by), did = (k) => evs.some((e) => e.k === k);
  const out = [];
  if (op === 'new') out.push({ kind: 'new', to: t.who ? [t.who] : members });
  else if ((op === 'edit' || op === 'who') && did('who') && t.who) out.push({ kind: 'given', to: [t.who] });
  else if (op === 'edit' && did('dept') && !t.who) out.push({ kind: 'new', to: members });
  else if (op === 'state' && t.state === 'done' && did('state') && t.by) out.push({ kind: 'done', to: [t.by] });
  return out.map((n) => ({ ...n, dept }));
}

/* the 20-minute cron: tasks due within 24 hours, each once */
export async function taskDueCron(env, board, staff) {
  if (!taskMailReady(env) || !env.TASKS) return { off: true };
  const now = Date.now(), j = await board(env, { op: 'due', now, soon: SOON }), L = (j && j.tasks) || [];
  if (!L.length) return { none: true };
  const { ppl, names } = await staff(env), res = [];
  for (const t of L) {
    const dept = names[t.dept] || (t.dept === 'admin' ? 'Administrator' : t.dept), to = t.who ? [t.who] : Object.keys(ppl).filter((e) => ppl[e] === t.dept);
    res.push(...(await taskSend(env, to, taskMail('due', t, dept, '', now), '')));
  }
  return { sent: res.filter((r) => r.ok).length, res };
}
