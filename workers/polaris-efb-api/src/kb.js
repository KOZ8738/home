/* ---------- Kneeboard: each pilot's notes, synced between their devices ----------
   One Durable Object (SQLite) per pilot, named "kb:<pilot>". It keeps the pilot's kneeboard pages (typed fields and
   handwriting) so a page written on the iPad is there on the phone. Only the pilot who wrote a page can read it:
   there is no staff or admin route to this object.

   A page is { id, upd, del, data }: upd is the time the EFB last changed it (the newer copy wins), del marks a page
   the pilot deleted (kept for 30 days so other devices learn of it, then removed). Each row also has st, the
   server's own clock when the row was written, so a device asks "what changed since st N" without trusting clocks.
   The copy each page had before its last change is kept too, as a safety net. */

const DAY = 86_400_000;
export const KB_LIMITS = { pageBytes: 400_000, pages: 300, bytes: 20_000_000, batch: 40, keepDeleted: 30 * DAY };
const ID = /^[\w-]{1,32}$/;
const APP_ID = /^[a-z0-9_]{1,24}$/;
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
class KbError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

export class Kneeboard {
  constructor(ctx, env) {
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pages (u TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '', upd INTEGER NOT NULL,
      del INTEGER NOT NULL DEFAULT 0, size INTEGER NOT NULL DEFAULT 0, st INTEGER NOT NULL, PRIMARY KEY (u, id))`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS hist (u TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, upd INTEGER NOT NULL, PRIMARY KEY (u, id))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS pages_st ON pages (u, st)');
    /* the apps the pilot has installed from the EFB's App Store (one row per pilot) */
    this.sql.exec('CREATE TABLE IF NOT EXISTS apps (u TEXT PRIMARY KEY, list TEXT NOT NULL, upd INTEGER NOT NULL)');
    /* the pilot's Weather app: saved airports in their order, and the units (one row per pilot) */
    this.sql.exec('CREATE TABLE IF NOT EXISTS wx (u TEXT PRIMARY KEY, data TEXT NOT NULL, upd INTEGER NOT NULL)');
  }
  rows(q, ...b) { return this.sql.exec(q, ...b).toArray(); }
  one(q, ...b) { return this.rows(q, ...b)[0] || null; }
  /* a server clock that never repeats or goes back, so "since" never misses a write */
  tick() {
    const m = this.one("SELECT v FROM meta WHERE k='clock'"), t = Math.max(Date.now(), (m ? m.v : 0) + 1);
    this.sql.exec("INSERT INTO meta (k, v) VALUES ('clock', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", t);
    return t;
  }
  purge(u) { this.sql.exec('DELETE FROM pages WHERE u=? AND del=1 AND st<?', u, Date.now() - KB_LIMITS.keepDeleted); }

  async fetch(req) {
    let a; try { a = await req.json(); } catch (e) { return J({ error: 'Bad call' }, 400); }
    try {
      if (!a.u || typeof a.u !== 'string') throw new KbError(400, 'No pilot');
      switch (a.op) {
        case 'pull': return J(this.pull(a.u, Number(a.since) || 0));
        case 'push': return J(this.push(a.u, a.pages));
        case 'usage': return J(this.usage(a.u));
        case 'appsGet': { const r = this.one('SELECT list, upd FROM apps WHERE u=?', a.u); return J(r ? { apps: JSON.parse(r.list), upd: r.upd } : { apps: null, upd: 0 }); }
        case 'appsSet': return J(this.appsSet(a.u, a.apps, a.upd));
        case 'wxGet': { const r = this.one('SELECT data, upd FROM wx WHERE u=?', a.u); return J(r ? { wx: JSON.parse(r.data), upd: r.upd } : { wx: null, upd: 0 }); }
        case 'wxSet': return J(this.wxSet(a.u, a.wx, a.upd));
        default: throw new KbError(400, 'Unknown call');
      }
    } catch (e) { return J({ error: e.message || 'Error', ...(e.extra || {}) }, e.status || 500); }
  }

  out(r) { return { id: r.id, upd: r.upd, del: !!r.del, st: r.st, data: r.del ? null : (r.data ? JSON.parse(r.data) : null) }; }
  wxSet(u, wx, upd) {
    const UNITS = { t: ['C', 'F'], w: ['kt', 'kmh', 'ms'], p: ['inHg', 'hPa'], v: ['sm', 'km'], h: ['ft', 'm'] };
    if (!wx || typeof wx !== 'object') throw new KbError(400, 'Bad Weather settings');
    const fav = Array.isArray(wx.fav) ? [...new Set(wx.fav.filter((x) => typeof x === 'string' && /^[A-Z0-9]{3,4}$/.test(x)))].slice(0, 60) : [];
    const units = {}; for (const k of Object.keys(UNITS)) { const v = wx.units && wx.units[k]; if (UNITS[k].includes(v)) units[k] = v; }
    upd = Math.floor(Number(upd)); if (!Number.isFinite(upd) || upd <= 0) throw new KbError(400, 'Bad time');
    const cur = this.one('SELECT data, upd FROM wx WHERE u=?', u);
    if (cur && cur.upd > upd) return { ok: true, stale: true, wx: JSON.parse(cur.data), upd: cur.upd };   // a newer copy is here already
    this.sql.exec('INSERT INTO wx (u, data, upd) VALUES (?,?,?) ON CONFLICT(u) DO UPDATE SET data=excluded.data, upd=excluded.upd', u, JSON.stringify({ fav, units }), upd);
    return { ok: true, upd };
  }
  appsSet(u, list, upd) {
    if (!Array.isArray(list) || list.length > 80 || !list.every((x) => typeof x === 'string' && APP_ID.test(x))) throw new KbError(400, 'Bad app list');
    upd = Math.floor(Number(upd)); if (!Number.isFinite(upd) || upd <= 0) throw new KbError(400, 'Bad time');
    const cur = this.one('SELECT list, upd FROM apps WHERE u=?', u);
    if (cur && cur.upd > upd) return { ok: true, stale: true, apps: JSON.parse(cur.list), upd: cur.upd };   // a newer list is here already
    this.sql.exec('INSERT INTO apps (u, list, upd) VALUES (?,?,?) ON CONFLICT(u) DO UPDATE SET list=excluded.list, upd=excluded.upd', u, JSON.stringify([...new Set(list)]), upd);
    return { ok: true, apps: [...new Set(list)], upd };
  }
  usage(u) {
    const r = this.one('SELECT COUNT(*) n, COALESCE(SUM(size),0) b FROM pages WHERE u=? AND del=0', u);
    return { pages: r.n, bytes: r.b, limits: { pages: KB_LIMITS.pages, bytes: KB_LIMITS.bytes } };
  }
  pull(u, since) {
    this.purge(u);
    const now = this.tick();
    /* a device that has been away longer than tombstones are kept must start over from everything */
    const reset = since > 0 && since < Date.now() - KB_LIMITS.keepDeleted;
    const L = this.rows('SELECT * FROM pages WHERE u=? AND st>? ORDER BY st', u, reset ? 0 : since);
    return { pages: L.map((r) => this.out(r)), now, reset, usage: this.usage(u) };
  }
  push(u, pages) {
    if (!Array.isArray(pages)) throw new KbError(400, 'Send pages');
    if (pages.length > KB_LIMITS.batch) throw new KbError(400, 'Too many pages at once');
    this.purge(u);
    const applied = [], stale = [], rejected = [];
    for (const p of pages) {
      const id = String((p && p.id) || ''), upd = Math.floor(Number(p && p.upd));
      if (!ID.test(id) || !Number.isFinite(upd) || upd <= 0) { rejected.push({ id, why: 'bad page' }); continue; }
      if (upd > Date.now() + DAY) { rejected.push({ id, why: 'clock' }); continue; }
      const del = !!p.del, data = del ? '' : JSON.stringify(p.data == null ? {} : p.data), size = data.length;
      if (size > KB_LIMITS.pageBytes) { rejected.push({ id, why: 'too big' }); continue; }
      const cur = this.one('SELECT * FROM pages WHERE u=? AND id=?', u, id);
      if (cur && cur.upd > upd) { stale.push(this.out(cur)); continue; }       // the server has a newer copy: send it back
      if (cur && cur.upd === upd && !!cur.del === del) { applied.push(id); continue; }   // already here
      if (!del) {
        const tot = this.one('SELECT COUNT(*) n, COALESCE(SUM(size),0) b FROM pages WHERE u=? AND del=0 AND id<>?', u, id);
        if (tot.n + 1 > KB_LIMITS.pages) { rejected.push({ id, why: 'pages' }); continue; }
        if (tot.b + size > KB_LIMITS.bytes) { rejected.push({ id, why: 'space' }); continue; }
      }
      if (cur && !cur.del && cur.data) this.sql.exec('INSERT INTO hist (u, id, data, upd) VALUES (?,?,?,?) ON CONFLICT(u, id) DO UPDATE SET data=excluded.data, upd=excluded.upd', u, id, cur.data, cur.upd);
      if (del) this.sql.exec('DELETE FROM hist WHERE u=? AND id=?', u, id);
      this.sql.exec(`INSERT INTO pages (u, id, data, upd, del, size, st) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(u, id) DO UPDATE SET data=excluded.data, upd=excluded.upd, del=excluded.del, size=excluded.size, st=excluded.st`,
        u, id, data, upd, del ? 1 : 0, del ? 0 : size, this.tick());
      applied.push(id);
    }
    return { ok: true, applied, stale, rejected, now: this.tick(), usage: this.usage(u) };
  }
}

const kb = async (env, u, a) => {
  const stub = env.KB.get(env.KB.idFromName('kb:' + u));
  const r = await stub.fetch('https://kb/', { method: 'POST', body: JSON.stringify({ ...a, u }) });
  const b = await r.json();
  if (!r.ok) throw new KbError(r.status, b.error || 'Error');
  return b;
};

/** /api/efb/kb — GET ?since=N (changes since server time N), POST { pages:[...] }. Only for the signed-in pilot's own pages. */
export async function kbPublic(req, url, env, h, me) {
  const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  try {
    if (!me) throw new KbError(401, 'Sign in to sync your kneeboard');
    if (!env.KB) throw new KbError(503, 'Kneeboard sync is not set up on the server');
    if (req.method === 'GET') return res(await kb(env, me.u, { op: 'pull', since: url.searchParams.get('since') || 0 }));
    if (req.method !== 'POST') throw new KbError(405, 'Method not allowed');
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new KbError(415, 'Send JSON');
    const len = Number(req.headers.get('Content-Length') || 0);
    if (len > 4_500_000) throw new KbError(413, 'Too much at once');
    let b; try { b = await req.json(); } catch (e) { throw new KbError(400, 'Bad body'); }
    return res(await kb(env, me.u, { op: 'push', pages: b.pages }));
  } catch (e) { return res({ error: e.message || 'Error' }, e.status || 500); }
}

/** /api/efb/apps — GET the apps this pilot installed from the App Store, POST { apps:[ids], upd } to change them. Newest list wins. */
export async function appsPublic(req, env, h, me) {
  const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  try {
    if (!me) throw new KbError(401, 'Sign in first');
    if (!env.KB) throw new KbError(503, 'Not set up on the server');
    if (req.method === 'GET') return res(await kb(env, me.u, { op: 'appsGet' }));
    if (req.method !== 'POST') throw new KbError(405, 'Method not allowed');
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new KbError(415, 'Send JSON');
    let b; try { b = await req.json(); } catch (e) { throw new KbError(400, 'Bad body'); }
    return res(await kb(env, me.u, { op: 'appsSet', apps: b.apps, upd: b.upd }));
  } catch (e) { return res({ error: e.message || 'Error' }, e.status || 500); }
}

/** /api/efb/wx: the pilot's Weather app settings (saved airports, units), the same on every device */
export async function wxPrefsPublic(req, env, h, me) {
  const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  try {
    if (!me) throw new KbError(401, 'Sign in first');
    if (!env.KB) throw new KbError(503, 'Not set up on the server');
    if (req.method === 'GET') return res(await kb(env, me.u, { op: 'wxGet' }));
    if (req.method !== 'POST') throw new KbError(405, 'Method not allowed');
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new KbError(415, 'Send JSON');
    let b; try { b = await req.json(); } catch (e) { throw new KbError(400, 'Bad body'); }
    return res(await kb(env, me.u, { op: 'wxSet', wx: b.wx, upd: b.upd }));
  } catch (e) { return res({ error: e.message || 'Error' }, e.status || 500); }
}
