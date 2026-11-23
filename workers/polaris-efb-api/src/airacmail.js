/* ---------- AIRAC changeover reminders by email (Nov 2026) ----------
   Some of the EFB's navigation data does not update itself: China's AIP data set and charts and Japan's AIP map data
   and charts are uploaded by staff on /admin › Nav Data each AIRAC (navdata.js). So that a new cycle is not missed,
   everyone whose role may update Nav Data (Administrator, or a role allowed "run Nav Data checks or uploads"; while
   roles are off, the ADMIN_EMAILS list) gets an email:
     · 7 days before the next AIRAC, when something for it is still not uploaded;
     · on the day it takes effect, when something is still missing (the EFB then shows the old cycle);
     · 3 days later, once more, if it is still missing.
   Only sources that are in use are counted (a region never uploaded is not asked for). Nothing is sent when all is
   uploaded. Each reminder goes once per cycle, to each person separately, and what was sent is kept for the Nav Data
   page (KV nav:v1:remind).

   Sending uses Cloudflare Email Service: the send_email binding EMAIL (wrangler.toml), from MAIL_FROM (a [vars] entry,
   an address on a domain set up for email in Cloudflare). On the Workers Free plan it can send only to addresses
   verified under Email Routing › Destination addresses; a person whose address is not verified is shown on the page. */
import { navRecipients } from './mail.js';
import { AIPCH } from './jpcharts.js';

const KEY = 'nav:v1:remind', DAY = 86400_000, BEFORE = 7 * DAY, LATE = 3 * DAY;
const ADMIN_URL = 'https://efb-api.koz8738.com/admin#navdata';
/* the sources staff upload, and whether one has the data for a cycle (null: not in use, so not asked for) */
const MANUAL = [
  { id: 'cn-aip', name: 'China · AIP data set', how: 'the AIXM data set from the CAAC eAIP', idx: 'cnaip:v1:idx' },
  { id: 'cn-charts', name: 'China · AIP charts', how: 'the AD 2.24 charts from the CAAC eAIP Full Package', ch: 'cn' },
  { id: 'jp-aip', name: 'Japan · AIP map data', how: 'the KML from the JCAB SWIM portal', idx: 'jpaip:v1:idx' },
  { id: 'jp-charts', name: 'Japan · AIP charts', how: 'the AD 2 charts from the JCAB SWIM portal', ch: 'jp' },
];
async function hasCycle(env, s, cy) {
  if (s.idx) {
    const idx = await env.STORE.get(s.idx, 'json').catch(() => null), L = (idx && idx.cycles) || [];
    return L.length ? L.some((c) => c.cycle === cy.cycle) : null;
  }
  const S = AIPCH[s.ch]; if (!env.CHARTS || !S) return null;
  const st = await S.status(env).catch(() => null), A = (st && st.apts) || {}, ids = Object.keys(A);
  if (!ids.length) return null;
  /* charts carry the AIP's effective date; a version from the cycle's first day on is that cycle's */
  const from = Date.parse(cy.from) - DAY;
  return ids.some((a) => (A[a] || []).some((v) => S.effT(v.eff) >= from));
}
/* which uploads a cycle still needs: { need: [names], done: [names] } */
export async function remindNeeds(env, cy) {
  const need = [], done = [];
  for (const s of MANUAL) { const h = await hasCycle(env, s, cy); if (h === null) continue; (h ? done : need).push(s); }
  return { need, done };
}

const fmtDay = (t) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const inDays = (t, now) => { const d = Math.ceil((t - now) / DAY); return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'; };
/* { subject, text } of one reminder: kind 'pre' | 'due' | 'late' | 'test' */
export function remindMail(kind, cy, needs, now) {
  const from = Date.parse(cy.from), when = fmtDay(from) + ' at ' + new Date(from).toISOString().slice(11, 16) + 'Z';
  const list = (L) => L.map((s) => '  • ' + s.name + ': ' + s.how).join('\n');
  const subject = kind === 'pre' ? 'AIRAC ' + cy.cycle + ' starts ' + inDays(from, now) + ': Nav Data uploads needed'
    : kind === 'due' ? 'AIRAC ' + cy.cycle + ' is in force: Nav Data not uploaded yet'
    : kind === 'late' ? 'Reminder: AIRAC ' + cy.cycle + ' is still not uploaded on Nav Data'
    : 'Test: AIRAC reminder from Polaris Operations';
  const head = kind === 'pre' ? 'AIRAC ' + cy.cycle + ' takes effect on ' + when + ' (' + inDays(from, now) + ').'
    : kind === 'test' ? 'This is a test of the AIRAC reminder. The next cycle, AIRAC ' + cy.cycle + ', takes effect on ' + when + ' (' + inDays(from, now) + ').'
    : 'AIRAC ' + cy.cycle + ' took effect on ' + when + '. Until the uploads below are made, pilots see the previous cycle’s data for these regions.';
  const parts = [head, needs.need.length ? 'Still to upload on Nav Data:\n' + list(needs.need) : 'Everything for AIRAC ' + cy.cycle + ' is uploaded.'];
  if (needs.done.length) parts.push('Already uploaded for AIRAC ' + cy.cycle + ':\n' + list(needs.done));
  parts.push('Open Nav Data: ' + ADMIN_URL, 'The FAA (United States), CAA Taiwan and the worldwide sources switch by themselves.\nYou get this because your role in Polaris Operations may update Nav Data.');
  const text = parts.join('\n\n');
  return { subject, text };
}

/* one email to one person: { to, ok, err } */
async function send(env, to, m) {
  if (!env.EMAIL || typeof env.EMAIL.send !== 'function') return { to, ok: false, err: 'Email is not set up on the server (the EMAIL binding)' };
  const fromAddr = String(env.MAIL_FROM || '').trim();
  if (!fromAddr) return { to, ok: false, err: 'No sender address (MAIL_FROM)' };
  try {
    await env.EMAIL.send({ to, from: { email: fromAddr, name: 'Polaris Operations' }, subject: m.subject, text: m.text });
    return { to, ok: true };
  } catch (e) { return { to, ok: false, err: String((e && (e.code || e.message)) || e).slice(0, 160) }; }
}
async function readRec(kv) { const v = await kv.get(KEY, 'json').catch(() => null); return v && typeof v === 'object' && v.c ? v : { c: {} }; }

/* from the 20-minute cron (navCron): sends what is due, once */
export async function airacRemind(env, d, now = Date.now()) {
  const kv = env && env.STORE; if (!kv) return { off: true };
  const cur = d.airac(now), next = d.airac(Date.parse(cur.to) + 60_000), curFrom = Date.parse(cur.from), nextFrom = Date.parse(next.from);
  let job = null;
  if (now >= nextFrom - BEFORE) job = { kind: 'pre', cy: next };
  else if (now < curFrom + LATE) job = { kind: 'due', cy: cur };
  else if (now < curFrom + LATE + DAY) job = { kind: 'late', cy: cur };
  if (!job) return { idle: true };
  const rec = await readRec(kv), c = rec.c[job.cy.cycle] || {}, tried = c[job.kind + 'Try'] || 0;
  /* done once someone has it; with nobody reached (email not set up yet, no one to send to) try again every 2 hours */
  if (c[job.kind]) return { sent: false, already: true };
  if (now - tried < 2 * 3600_000) return { sent: false, waiting: true };
  const needs = await remindNeeds(env, job.cy);
  if (!needs.need.length) return { sent: false, nothing: true };
  const who = await navRecipients(env), m = remindMail(job.kind, job.cy, needs, now);
  const res = [];
  for (const to of who.list) res.push(await send(env, to, m));
  const x = { t: now, need: needs.need.map((s) => s.id), res, rolesOff: !!who.rolesOff };
  if (res.some((r) => r.ok)) { c[job.kind] = x; delete c[job.kind + 'Try']; delete c[job.kind + 'Last']; } else { c[job.kind + 'Try'] = now; c[job.kind + 'Last'] = x; }
  rec.c[job.cy.cycle] = c;
  /* the last few cycles only */
  for (const k of Object.keys(rec.c).sort().slice(0, -4)) delete rec.c[k];
  await kv.put(KEY, JSON.stringify(rec));
  return { sent: res.some((r) => r.ok), kind: job.kind, cycle: job.cy.cycle, res };
}
/* for the Nav Data page: who gets the reminders, and what was sent */
export async function remindStatus(env) {
  const kv = env && env.STORE; if (!kv) return null;
  const [who, rec] = await Promise.all([navRecipients(env).catch(() => ({ list: [] })), readRec(kv)]);
  return { to: who.list, rolesOff: !!who.rolesOff, ready: !!(env.EMAIL && env.MAIL_FROM), from: env.MAIL_FROM || '', c: rec.c, test: rec.test || null };
}
/* Send me a test (Nav Data page): to the person asking only */
export async function remindTest(env, d, email, now = Date.now()) {
  const kv = env.STORE, cur = d.airac(now), next = d.airac(Date.parse(cur.to) + 60_000);
  const r = await send(env, email, remindMail('test', next, await remindNeeds(env, next), now));
  const rec = await readRec(kv); rec.test = { t: now, ...r }; await kv.put(KEY, JSON.stringify(rec));
  return r;
}
