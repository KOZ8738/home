/* ---------- Crew: check-in, briefing notifications, Web Push, flown tracks ----------
   One Durable Object (SQLite) named "crew". It keeps
     - the VAPID key pair for Web Push (made on first use, never leaves the object),
     - the pilots' push subscriptions (one per device) and which kinds of notification each device wants,
     - each pilot's current check-in (one vAMSYS booking) and the briefing notifications scheduled for it,
     - an outbox of pushes, sent in small batches from the object's alarm (a Worker may make only so many requests
       at once, and a notice to every pilot can mean many devices),
     - the track of a checked-in flight, read from the vAMSYS flight map every few minutes while it flies, so the
       logbook can draw it even when vAMSYS has no position reports for a PIREP.
   Push messages are encrypted for each device (RFC 8291, aes128gcm) and signed with VAPID (RFC 8292); the push
   services (Apple, Google, Mozilla) see only ciphertext.

   kinds of notification ("cats"): mail (notices, messages, staff replies), brief (check-in and briefings)

   Do Not Disturb follows the EFB on each device: the EFB sends its two switches (on now; on while flying) with the
   subscription and whenever they change. While Do Not Disturb is on, mail pushes for that device are held; "while
   flying" is decided here, from the vAMSYS flight map (the pilot's flight is airborne) or VATSIM (the pilot's CID
   above 2,500 ft and faster than 120 kt), as the EFB does. When it ends, the device gets one notification:
   "N messages arrived during your flight". Flight briefings are not held, like checklist alerts in the EFB. */

const DAY = 86_400_000, MIN = 60_000;
const BATCH = 35;                 // pushes per alarm run (each is one outgoing request)
const TRAIL_EVERY = 3 * MIN, TRAIL_MAX = 2000;
const te = (s) => new TextEncoder().encode(s);
const cat = (...a) => { const n = a.reduce((x, b) => x + b.length, 0), o = new Uint8Array(n); let i = 0; for (const b of a) { o.set(b, i); i += b.length; } return o; };
export const b64u = {
  enc: (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: (s) => { s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); },
};
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
class CrewError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/* ---------- Web Push ---------- */
export async function pushEncrypt(payload, p256dh, auth) {
  const S = crypto.subtle, ua = b64u.dec(p256dh), au = b64u.dec(auth);
  if (ua.length !== 65 || au.length < 16) throw new Error('bad subscription keys');
  const as = await S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await S.exportKey('raw', as.publicKey));
  const uaKey = await S.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await S.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const hk = async (salt, ikm, info, len) => new Uint8Array(await S.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await S.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));
  const ikm = await hk(au, shared, cat(te('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hk(salt, ikm, te('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hk(salt, ikm, te('Content-Encoding: nonce\0'), 12);
  const key = await S.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await S.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(typeof payload === 'string' ? te(payload) : payload, new Uint8Array([2]))));
  const head = new Uint8Array(21 + 65); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = 65; head.set(asPub, 21);
  return cat(head, ct);
}
export async function vapidHeader(endpoint, keys, now = Date.now()) {
  const h = b64u.enc(te('{"typ":"JWT","alg":"ES256"}'));
  const c = b64u.enc(te(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: 'https://koz8738.com/efb/' })));
  const k = await crypto.subtle.importKey('jwk', keys.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, te(h + '.' + c));
  return 'vapid t=' + h + '.' + c + '.' + b64u.enc(sig) + ', k=' + keys.pub;
}

/* ---------- vAMSYS (Operations API) for the flight map, inside the object ---------- */
let opsTok = null;
async function opsGet(env, path) {
  if (!env.VAMSYS_CLIENT_ID || !env.VAMSYS_CLIENT_SECRET) throw new Error('vAMSYS keys are not set');
  if (!opsTok || Date.now() > opsTok.exp) {
    const r = await fetch('https://vamsys.io/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.VAMSYS_CLIENT_ID, client_secret: env.VAMSYS_CLIENT_SECRET, scope: env.VAMSYS_SCOPE || 'ops:read' }) });
    if (!r.ok) throw new Error('vAMSYS token ' + r.status);
    const j = await r.json(); opsTok = { v: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000 };
  }
  const r = await fetch('https://vamsys.io/api/v3/operations' + path, { headers: { Authorization: 'Bearer ' + opsTok.v, Accept: 'application/json' } });
  if (r.status === 401) opsTok = null;
  if (!r.ok) throw new Error('vAMSYS ' + path + ' ' + r.status);
  return r.json();
}
const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
/* a position report from vAMSYS, whatever it is called: [lat, lon, alt ft, ground speed kt, time ms] */
export function posrep(p) {
  if (!p || typeof p !== 'object') return null;
  const loc = p.location || p.position || {};
  const lat = num(p.latitude ?? p.lat ?? loc.lat ?? loc.latitude), lon = num(p.longitude ?? p.lon ?? p.lng ?? loc.lon ?? loc.lng ?? loc.longitude);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const t = Date.parse(p.created_at || p.createdAt || p.timestamp || p.time || p.reported_at || p.sim_time || '') || null;
  return [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, Math.round(num(p.altitude ?? p.altitude_msl ?? p.alt ?? p.altitudeMsl) ?? 0), Math.round(num(p.ground_speed ?? p.groundSpeed ?? p.groundspeed ?? p.gs) ?? 0) || null, t];
}
export function downsample(a, n) { if (a.length <= n) return a; const out = [], step = (a.length - 1) / (n - 1); for (let i = 0; i < n; i++) out.push(a[Math.round(i * step)]); return out; }

/* ---------- the Durable Object ---------- */
export class Crew {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql;
    const x = (q) => this.sql.exec(q);
    x('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    x("CREATE TABLE IF NOT EXISTS subs (ep TEXT PRIMARY KEY, u TEXT NOT NULL, cid TEXT NOT NULL DEFAULT '', p256dh TEXT NOT NULL, auth TEXT NOT NULL, cats TEXT NOT NULL DEFAULT 'mail,brief', at INTEGER NOT NULL, ok INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0)");
    x('CREATE TABLE IF NOT EXISTS ci (u TEXT PRIMARY KEY, bid TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL)');
    x('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, u TEXT NOT NULL DEFAULT \'\', data TEXT NOT NULL DEFAULT \'{}\')');
    x('CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, ep TEXT NOT NULL, payload TEXT NOT NULL, ttl INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL)');
    x("CREATE TABLE IF NOT EXISTS trk (bid TEXT PRIMARY KEY, u TEXT NOT NULL, dep TEXT NOT NULL DEFAULT '', arr TEXT NOT NULL DEFAULT '', t0 INTEGER NOT NULL, t1 INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0, pts TEXT NOT NULL DEFAULT '[]')");
    for (const c of ['dnd INTEGER NOT NULL DEFAULT 0', 'dndf INTEGER NOT NULL DEFAULT 1']) { try { x('ALTER TABLE subs ADD COLUMN ' + c); } catch (e) {} }
    x('CREATE TABLE IF NOT EXISTS held (id INTEGER PRIMARY KEY AUTOINCREMENT, ep TEXT NOT NULL, payload TEXT NOT NULL, at INTEGER NOT NULL)');
    x('CREATE INDEX IF NOT EXISTS held_ep ON held (ep)');
    x('CREATE INDEX IF NOT EXISTS subs_u ON subs (u)'); x('CREATE INDEX IF NOT EXISTS jobs_at ON jobs (at)'); x('CREATE INDEX IF NOT EXISTS trk_u ON trk (u)');
  }
  rows(q, ...b) { return this.sql.exec(q, ...b).toArray(); }
  one(q, ...b) { return this.rows(q, ...b)[0] || null; }
  async fetch(req) {
    let a; try { a = await req.json(); } catch (e) { return J({ error: 'Bad call' }, 400); }
    try { return J(await this.call(a)); } catch (e) { return J({ error: e.message || 'Error' }, e.status || 500); }
  }
  async call(a) {
    switch (a.op) {
      case 'key': return { key: (await this.vapid()).pub };
      case 'sub': { const r = this.sub(a); await this.wake(); return r; }
      case 'dnd': return this.setDnd(a);
      case 'unsub': this.sql.exec('DELETE FROM subs WHERE ep = ?', String(a.endpoint || '')); return { ok: true };
      case 'unsubAll': this.sql.exec('DELETE FROM subs WHERE u = ?', String(a.u || '')); return { ok: true };
      case 'subGet': { const s = this.one('SELECT u, cats, ok FROM subs WHERE ep = ?', String(a.endpoint || '')); return { sub: s && s.u === a.u ? { cats: s.cats.split(',').filter(Boolean), ok: s.ok } : null }; }
      case 'notify': { const n = this.enqueue(a.to || {}, a.cat || 'mail', a.payload || {}); await this.wake(); return { ok: true, devices: n }; }
      case 'schedule': this.job(a.id, a.at, a.kind, a.u || '', a.data || {}); await this.wake(); return { ok: true };
      case 'unjob': this.sql.exec('DELETE FROM jobs WHERE id = ?', String(a.id || '')); return { ok: true };
      case 'checkin': { const r = this.checkin(a); await this.wake(); return r; }
      case 'checkout': return this.checkout(a.u);
      case 'ciList': return { list: this.rows('SELECT u, data FROM ci').map((r) => { const d = JSON.parse(r.data); return { u: r.u, to: d.to || '', altn: d.altn || '', std: d.std || null, sta: d.sta || null, fl: d.callsign || d.flight || '' }; }) };
      case 'wxSeen': { const r = this.wxSeen(a); if (r.sent) await this.wake(); return r; }
      case 'ciGet': { const r = this.one('SELECT * FROM ci WHERE u = ?', String(a.u || '')); return { checkin: r ? { ...JSON.parse(r.data), at: r.at, jobs: this.rows("SELECT at, kind FROM jobs WHERE u = ? AND kind = 'brief' ORDER BY at", r.u).map((j) => ({ at: j.at, kind: j.kind })) } : null }; }
      case 'trkFind': return { track: this.trkFind(a) };
      case 'alarmSync': { const r = this.alarmSync(String(a.u || ''), a.list); await this.wake(); return r; }
      default: throw new CrewError(400, 'Unknown call');
    }
  }

  async vapid() {
    const r = this.one("SELECT v FROM kv WHERE k = 'vapid'");
    if (r) return JSON.parse(r.v);
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const keys = { jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u.enc(await crypto.subtle.exportKey('raw', kp.publicKey)) };
    this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('vapid', ?)", JSON.stringify(keys));
    return keys;
  }
  sub(a) {
    const s = a.sub || {}, ep = String(s.endpoint || ''), k = s.keys || {};
    if (!/^https:\/\/[^\s]+$/.test(ep) || ep.length > 1000) throw new CrewError(400, 'Not a push subscription');
    if (!k.p256dh || !k.auth) throw new CrewError(400, 'The subscription has no keys');
    const cats = (Array.isArray(a.cats) ? a.cats : ['mail', 'brief']).filter((c) => c === 'mail' || c === 'brief').join(',');
    const old = this.one('SELECT dnd, dndf FROM subs WHERE ep = ?', ep) || { dnd: 0, dndf: 1 };
    const dnd = a.dnd != null ? (a.dnd ? 1 : 0) : old.dnd, dndf = a.dndFlight != null ? (a.dndFlight ? 1 : 0) : old.dndf;
    this.sql.exec('INSERT OR REPLACE INTO subs (ep, u, cid, p256dh, auth, cats, at, ok, fails, dnd, dndf) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT ok FROM subs WHERE ep = ?), 0), 0, ?, ?)',
      ep, String(a.u), String(a.cid || ''), String(k.p256dh), String(k.auth), cats, Date.now(), ep, dnd, dndf);
    /* at most 6 devices per pilot: the oldest go */
    const L = this.rows('SELECT ep FROM subs WHERE u = ? ORDER BY at DESC', String(a.u));
    for (const x of L.slice(6)) this.sql.exec('DELETE FROM subs WHERE ep = ?', x.ep);
    return { ok: true, cats: cats.split(',').filter(Boolean), dnd: !!dnd, dndFlight: !!dndf };
  }
  async setDnd(a) {
    const r = this.one('SELECT u FROM subs WHERE ep = ?', String(a.endpoint || ''));
    if (!r || r.u !== String(a.u)) throw new CrewError(404, 'This device is not registered for push');
    this.sql.exec('UPDATE subs SET dnd = ?, dndf = ? WHERE ep = ?', a.dnd ? 1 : 0, a.dndFlight === false ? 0 : 1, String(a.endpoint));
    await this.wake();
    return { ok: true };
  }
  /* is this pilot flying right now? (vAMSYS flight map, else VATSIM by CID; each read at most once a minute) */
  async flying(u, cid) {
    const now = Date.now();
    if (!this.fm || now - this.fm.at > 60_000) { let d = null; try { d = (await opsGet(this.env, '/flight-map')).data || []; } catch (e) {} this.fm = { at: now, d: d || (this.fm && this.fm.d) || [] }; }
    const f = this.fm.d.find((x) => x.pilot && String(x.pilot.username || '').toUpperCase() === u);
    if (f) { const pr = f.progress || {}; if (/climb|cruise|descent|final|takeoff|airborne|en.?route/i.test(String(pr.currentPhase || pr.phase || ''))) return true; if (+pr.altitude > 2500 && +pr.groundSpeed > 120) return true; }
    if (!cid) return false;
    if (!this.vs || now - this.vs.at > 60_000) { let p = null; try { const r = await fetch('https://data.vatsim.net/v3/vatsim-data.json'); if (r.ok) p = ((await r.json()).pilots || []).map((x) => [String(x.cid), x.altitude, x.groundspeed]); } catch (e) {} this.vs = { at: now, p: p || (this.vs && this.vs.p) || [] }; }
    const v = this.vs.p.find((x) => x[0] === String(cid));
    return !!(v && v[1] > 2500 && v[2] > 120);
  }
  async dndNow(sub) { return !!sub.dnd || (!!sub.dndf && (await this.flying(sub.u, sub.cid))); }
  /* held mail pushes: one summary per device once its Do Not Disturb has ended */
  async releaseHeld() {
    const eps = this.rows('SELECT ep, COUNT(*) AS n, MIN(at) AS t0 FROM held GROUP BY ep');
    for (const h of eps) {
      const sub = this.one('SELECT * FROM subs WHERE ep = ?', h.ep);
      if (!sub) { this.sql.exec('DELETE FROM held WHERE ep = ?', h.ep); continue; }
      if (await this.dndNow(sub) && Date.now() - h.t0 < DAY) continue;
      const L = this.rows('SELECT payload FROM held WHERE ep = ? ORDER BY id', h.ep).map((r) => { try { return JSON.parse(r.payload); } catch (e) { return {}; } });
      this.sql.exec('DELETE FROM held WHERE ep = ?', h.ep);
      const first = L[0] || {}, n = L.length;
      const body = JSON.stringify({ title: n > 1 ? n + ' messages arrived while Do Not Disturb was on' : 'A message arrived while Do Not Disturb was on', body: (first.title || '') + (n > 1 ? ' and ' + (n - 1) + ' more' : first.body ? ' — ' + first.body : ''), url: '#mail', tag: 'held', cat: 'mail' });
      this.sql.exec('INSERT INTO outbox (ep, payload, ttl, tries, at) VALUES (?, ?, ?, 0, ?)', h.ep, body.slice(0, 2000), 6 * 3600, Date.now());
    }
  }
  /* queue one payload for every matching device; returns how many */
  enqueue(to, c, payload) {
    let L;
    if (to.all) L = this.rows('SELECT ep, cats FROM subs');
    else L = this.rows("SELECT ep, cats FROM subs WHERE (? != '' AND u = ?) OR (? != '' AND cid = ?)", to.u || '', to.u || '', to.cid ? String(to.cid) : '', to.cid ? String(to.cid) : '');
    L = L.filter((s) => c === 'alarm' || s.cats.split(',').includes(c));   // an alarm reaches every device with push on
    const body = JSON.stringify({ title: String(payload.title || 'Polaris EFB').slice(0, 120), body: String(payload.body || '').slice(0, 600), url: String(payload.url || '#mail').slice(0, 120), tag: String(payload.tag || '').slice(0, 64), cat: c });
    for (const s of L) this.sql.exec('INSERT INTO outbox (ep, payload, ttl, tries, at) VALUES (?, ?, ?, 0, ?)', s.ep, body, payload.ttl || 4 * 3600, Date.now());
    return L.length;
  }
  job(id, at, kind, u, data) { this.sql.exec('INSERT OR REPLACE INTO jobs (id, at, kind, u, data) VALUES (?, ?, ?, ?, ?)', String(id), Math.round(at), kind, u, JSON.stringify(data)); }
  async wake(at) {
    const nj = this.one('SELECT MIN(at) AS at FROM jobs'), ob = this.one('SELECT COUNT(*) AS n FROM outbox');
    let next = at || Infinity;
    if (ob && ob.n) next = Math.min(next, Date.now() + 50);
    if (nj && nj.at != null) next = Math.min(next, Math.max(Date.now() + 50, nj.at));
    const hd = this.one('SELECT COUNT(*) AS n FROM held'); if (hd && hd.n) next = Math.min(next, Date.now() + 2 * MIN);
    if (next === Infinity) return;
    const cur = await this.ctx.storage.getAlarm();
    if (cur == null || cur > next || cur < Date.now() - 5000) await this.ctx.storage.setAlarm(next);
  }

  /* ---- check-in ---- */
  checkin(a) {
    const u = String(a.u || ''), b = a.booking || {}; if (!u || !b.id) throw new CrewError(400, 'No booking');
    const now = Date.now(), std = Date.parse(b.departureTime || '') || 0, sta = Date.parse(b.arrivalTime || '') || 0;
    const data = { bookingId: String(b.id), flight: b.flight || '', callsign: b.callsign || '', from: b.from || '', to: b.to || '', fromName: b.fromName || '', toName: b.toName || '',
      std: std || null, sta: sta || null, altn: /^[A-Z0-9]{4}$/.test(a.altn || '') ? a.altn : '', type: b.type || '', registration: b.registration || '', altitude: b.altitude ?? null, costIndex: b.costIndex ?? null, route: b.route || '', network: b.network || '' };
    this.checkout(u, true);
    this.sql.exec('INSERT OR REPLACE INTO ci (u, bid, data, at) VALUES (?, ?, ?, ?)', u, data.bookingId, JSON.stringify(data), now);
    const fl = data.callsign || data.flight || 'your flight', hhmm = (t) => new Date(t).toISOString().slice(11, 16) + 'Z';
    this.enqueue({ u }, 'brief', { title: 'Checked in · ' + fl, body: `${data.from} → ${data.to}${std ? ' · STD ' + hhmm(std) : ''}${data.type ? ' · ' + data.type : ''}${data.registration ? ' ' + data.registration : ''}. Your briefing is ready.`, url: '#roster', tag: 'ci-' + data.bookingId });
    if (std && std - 45 * MIN > now) this.job('brief:dep:' + u, std - 45 * MIN, 'brief', u, { phase: 'dep', icao: data.from, fl, std, bid: data.bookingId });
    if (sta && sta - 40 * MIN > now) this.job('brief:arr:' + u, sta - 40 * MIN, 'brief', u, { phase: 'arr', icao: data.to, fl, sta, bid: data.bookingId });
    /* record the flown track from the flight map while it flies */
    this.sql.exec('INSERT OR REPLACE INTO trk (bid, u, dep, arr, t0, t1, seen, pts) VALUES (?, ?, ?, ?, ?, ?, 0, COALESCE((SELECT pts FROM trk WHERE bid = ?), \'[]\'))', data.bookingId, u, data.from, data.to, now, now, data.bookingId);
    this.job('trail:' + u, Math.max(now + MIN, std ? std - 30 * MIN : now + MIN), 'trail', u, { bid: data.bookingId, until: (sta || std || now) + (sta ? 4 : 20) * 3600_000 });
    return { ok: true, checkin: { ...data, at: now } };
  }
  /* the destination or alternate weather for a checked-in flight got worse (or came back): tell the pilot, once per change */
  wxSeen(a) {
    const u = String(a.u || ''), icao = String(a.icao || ''); if (!u || !icao) return { ok: false };
    const k = 'wxw:' + u + ':' + icao, row = this.one('SELECT v FROM kv WHERE k = ?', k), prev = row ? JSON.parse(row.v) : null;
    const R = { VFR: 0, MVFR: 1, IFR: 2, LIFR: 3 }, r = R[a.cat] ?? null, pr = prev ? (R[prev.cat] ?? null) : null;
    const hz = Array.isArray(a.hz) ? a.hz.map(String).slice(0, 6) : [], newHz = hz.filter((x) => !(prev && (prev.hz || []).includes(x)));
    this.sql.exec('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', k, JSON.stringify({ cat: a.cat || (prev && prev.cat) || '', hz, at: Date.now() }));
    const parts = [];
    if (r != null && r >= 2 && (pr == null || r > pr)) parts.push('now ' + a.cat);
    if (newHz.length) parts.push(newHz.join(', '));
    const better = prev && pr != null && pr >= 2 && r != null && r <= 1;
    if (!parts.length && !better) return { ok: true, sent: false };
    const who = a.role === 'altn' ? 'Alternate' : 'Destination', fl = a.fl ? ' · ' + a.fl : '';
    const title = parts.length ? `${who} ${icao}: ${parts.join(' · ')}` : `${who} ${icao}: back to ${a.cat}`;
    this.enqueue({ u }, 'brief', { title, body: String(a.raw || '').slice(0, 180) + fl, url: '#wx', tag: 'wx-' + icao });
    return { ok: true, sent: true };
  }
  checkout(u, quiet) {
    this.sql.exec('DELETE FROM ci WHERE u = ?', u);
    this.sql.exec('DELETE FROM kv WHERE k LIKE ?', 'wxw:' + u + ':%');
    this.sql.exec("DELETE FROM jobs WHERE u = ? AND kind = 'brief'", u);
    if (!quiet) this.sql.exec("DELETE FROM jobs WHERE u = ? AND kind = 'trail'", u);
    return { ok: true };
  }
  trkFind(a) {
    let r = a.bid ? this.one('SELECT * FROM trk WHERE bid = ?', String(a.bid)) : null;
    if (!r && a.u) {
      /* same pilot and airports, recorded around the PIREP's time */
      const t = +a.t || Date.now();
      r = this.rows('SELECT * FROM trk WHERE u = ? AND dep = ? AND arr = ? ORDER BY ABS(t1 - ?) LIMIT 1', String(a.u), String(a.dep || ''), String(a.arr || ''), t)[0] || null;
      if (r && Math.abs(r.t1 - t) > 2 * DAY) r = null;
    }
    if (!r) return null;
    const pts = JSON.parse(r.pts || '[]');
    return pts.length > 1 ? { pts, src: 'EFB' } : null;
  }

  /* ---- alarm: due jobs, then a batch of pushes ---- */
  async alarm() {
    const now = Date.now();
    for (const j of this.rows('SELECT * FROM jobs WHERE at <= ? ORDER BY at LIMIT 10', now + 1000)) {
      this.sql.exec('DELETE FROM jobs WHERE id = ?', j.id);
      try { await this.runJob(j, JSON.parse(j.data || '{}')); } catch (e) { console.warn('[crew job]', j.kind, e && e.message); }
    }
    try { await this.releaseHeld(); } catch (e) { console.warn('[crew held]', e && e.message); }
    await this.sendBatch();
    await this.wake();
  }
  async runJob(j, d) {
    if (j.kind === 'brief') {
      let raw = '';
      try { const r = await fetch('https://aviationweather.gov/api/data/metar?format=raw&hours=2&ids=' + encodeURIComponent(d.icao)); if (r.ok) raw = (await r.text()).trim().split('\n')[0] || ''; } catch (e) {}
      const dep = d.phase === 'dep';
      this.enqueue({ u: j.u }, 'brief', { title: (dep ? 'Departure briefing · ' : 'Arrival briefing · ') + d.icao, body: (raw || 'No current METAR for ' + d.icao + '.') + (dep ? ' · ' + d.fl + ' off-block in 45 min' : ' · ' + d.fl + ' lands in about 40 min'), url: '#roster', tag: 'brief-' + d.phase + '-' + d.bid, ttl: 3600 });
    } else if (j.kind === 'mail') {
      /* a scheduled notice: push when it goes out (it may have been moved or deleted since) */
      const list = (await this.env.STORE.get('mail:v1:index', 'json').catch(() => null)) || [], m = list.find((x) => x.id === d.id);
      if (!m) return;
      const at = m.sendAt || m.t; if (at > Date.now() + 1000) { this.job(j.id, at, 'mail', '', d); return; }
      this.enqueue(mailTo(m), 'mail', mailPayload(m));
    } else if (j.kind === 'alarm') {
      const t = d.kind === 'timer';
      this.enqueue({ u: j.u }, 'alarm', { title: t ? 'Timer' : 'Alarm · ' + (d.hm || hhmmTz(j.at, d.tz)), body: d.label || (t ? 'Your timer is done.' : 'Polaris EFB alarm'), url: '#timer', tag: 'alarm-' + d.id, ttl: 900 });
      if (!t && Array.isArray(d.rep) && d.rep.length) { const nx = alarmNext(d, Date.now() + 60_000); if (nx) this.job(j.id, nx, 'alarm', j.u, d); }
    } else if (j.kind === 'trail') {
      await this.trail(j.u, d);
    }
  }
  /* the alarms and running timer of one pilot, as the EFB last sent them (it sends the whole list each time) */
  alarmSync(u, list) {
    if (!u) throw new CrewError(400, 'No pilot');
    this.sql.exec("DELETE FROM jobs WHERE u = ? AND kind = 'alarm'", u);
    let n = 0; const now = Date.now();
    for (const x of (Array.isArray(list) ? list : []).slice(0, 30)) {
      const d = { id: String(x.id || '').replace(/[^\w-]/g, '').slice(0, 24), kind: x.kind === 'timer' ? 'timer' : 'alarm', label: String(x.label || '').slice(0, 60),
        hm: /^\d{2}:\d{2}$/.test(x.hm || '') ? x.hm : '', tz: String(x.tz || 'UTC').slice(0, 40), rep: Array.isArray(x.rep) ? x.rep.filter((k) => Number.isInteger(k) && k >= 0 && k <= 6).slice(0, 7) : [], at: Number(x.at) || 0 };
      if (!d.id) continue;
      const at = alarmNext(d, now); if (!at || at > now + 8 * 86400_000) continue;
      this.job('alarm:' + u + ':' + d.id, at, 'alarm', u, d); n++;
    }
    return { ok: true, n };
  }
  async trail(u, d) {
    const t = this.one('SELECT * FROM trk WHERE bid = ?', d.bid); if (!t) return;
    const again = () => { if (Date.now() < d.until) this.job('trail:' + u, Date.now() + TRAIL_EVERY, 'trail', u, d); };
    let j; try { j = await opsGet(this.env, '/flight-map'); } catch (e) { again(); return; }
    const f = (j.data || []).find((x) => String(x.bookingId ?? (x.booking && x.booking.id) ?? '') === String(d.bid)) || (j.data || []).find((x) => x.pilot && String(x.pilot.username || '').toUpperCase() === u);
    if (!f) { if (t.seen) return; again(); return; }   // seen and now gone: the PIREP is filed, the track is complete
    const pr = f.progress || {}, reps = (Array.isArray(pr.posreps) ? pr.posreps : []).map(posrep).filter(Boolean);
    const cur = posrep({ latitude: pr.latitude ?? (pr.location && pr.location.lat), longitude: pr.longitude ?? (pr.location && pr.location.lon), altitude: pr.altitude, groundSpeed: pr.groundSpeed, created_at: new Date().toISOString() });
    let pts = JSON.parse(t.pts || '[]');
    if (reps.length >= pts.length) pts = reps;
    if (cur) { const l = pts[pts.length - 1]; if (!l || l[0] !== cur[0] || l[1] !== cur[1]) pts.push(cur); }
    pts = downsample(pts, TRAIL_MAX);
    this.sql.exec('UPDATE trk SET pts = ?, t1 = ?, seen = 1 WHERE bid = ?', JSON.stringify(pts), Date.now(), d.bid);
    again();
  }
  async sendBatch() {
    let L = this.rows('SELECT o.*, s.p256dh, s.auth, s.u, s.cid, s.dnd, s.dndf FROM outbox o LEFT JOIN subs s ON s.ep = o.ep ORDER BY o.id LIMIT ?', BATCH);
    if (!L.length) return;
    /* Do Not Disturb: mail waits (briefings and the held-mail summary itself go out) */
    const keep = [];
    for (const o of L) {
      let cat = ''; try { const p = JSON.parse(o.payload); cat = p.cat === 'mail' && p.tag !== 'held' ? 'mail' : ''; } catch (e) {}
      if (cat === 'mail' && o.p256dh && (await this.dndNow(o))) { this.sql.exec('INSERT INTO held (ep, payload, at) VALUES (?, ?, ?)', o.ep, o.payload, Date.now()); this.sql.exec('DELETE FROM outbox WHERE id = ?', o.id); }
      else keep.push(o);
    }
    L = keep; if (!L.length) return;
    const keys = await this.vapid();
    await Promise.all(L.map(async (o) => {
      if (!o.p256dh || Date.now() - o.at > o.ttl * 1000) { this.sql.exec('DELETE FROM outbox WHERE id = ?', o.id); return; }
      let st = 0;
      try {
        const body = await pushEncrypt(o.payload, o.p256dh, o.auth);
        const r = await fetch(o.ep, { method: 'POST', body, headers: { Authorization: await vapidHeader(o.ep, keys), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(o.ttl), Urgency: 'normal' } });
        st = r.status;
      } catch (e) { st = 0; }
      if (st >= 200 && st < 300) { this.sql.exec('DELETE FROM outbox WHERE id = ?', o.id); this.sql.exec('UPDATE subs SET ok = ?, fails = 0 WHERE ep = ?', Date.now(), o.ep); }
      else if (st === 404 || st === 410 || st === 403) { this.sql.exec('DELETE FROM outbox WHERE ep = ?', o.ep); this.sql.exec('DELETE FROM subs WHERE ep = ?', o.ep); }   // the device unsubscribed, or the key no longer matches
      else if (o.tries >= 3) { this.sql.exec('DELETE FROM outbox WHERE id = ?', o.id); this.sql.exec('UPDATE subs SET fails = fails + 1 WHERE ep = ?', o.ep); }
      else this.sql.exec('UPDATE outbox SET tries = tries + 1 WHERE id = ?', o.id);
    }));
  }
}

/* who a notice goes to, and what the notification says */
export function mailTo(m) { return m.to ? { u: m.to.pilot || '', cid: m.to.cid || '' } : { all: true }; }
export function mailPayload(m) {
  const plain = String(m.body || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*#•]|^\s*-\s+/gm, '').replace(/\s+/g, ' ').trim();
  return { title: (m.from || 'Polaris Airways') + ' · ' + (m.subject || ''), body: plain.slice(0, 180), url: '#mail', tag: 'mail-' + m.id };
}

/* ---------- Worker side ---------- */
export async function crew(env, a) {
  if (!env || !env.CREW) throw new CrewError(503, 'Not set up on the server yet');
  const r = await env.CREW.get(env.CREW.idFromName('crew')).fetch('https://crew/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new CrewError(r.status, j.error || 'Not available right now');
  return j;
}
/* fire and forget, for notifications sent while answering another request */
/* when an alarm next rings: a one-off at its time; a repeating one at hh:mm in its time zone on its weekdays (0 = Sunday) */
function tzWall(t, tz) { try { const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' }).formatToParts(new Date(t)).forEach((p) => (o[p.type] = p.value)); return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, m: +o.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday) }; } catch (e) { return null; } }
function hhmmTz(t, tz) { const w = tzWall(t, tz || 'UTC'); return w ? String(w.h).padStart(2, '0') + ':' + String(w.m).padStart(2, '0') : ''; }
export function alarmNext(d, after) {
  if (!d.rep || !d.rep.length) return d.at && d.at > after - 60_000 ? d.at : null;
  const [hh, mm] = (d.hm || '').split(':').map(Number); if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  for (let k = 0; k <= 8; k++) {
    const w = tzWall(after + k * 86400_000, d.tz); if (!w) return null;
    const base = Date.UTC(w.y, w.mo - 1, w.d, hh, mm); let t = base;   // that wall time, read as UTC, then moved by the zone's offset
    for (let i = 0; i < 2; i++) { const v = tzWall(t, d.tz); t = base - (Date.UTC(v.y, v.mo - 1, v.d, v.h, v.m) - Math.floor(t / 60000) * 60000); }
    const v = tzWall(t, d.tz);
    if (t > after && v && d.rep.includes(v.wd)) return t;
  }
  return null;
}
export function crewSoon(env, ctx, a) { const p = crew(env, a).catch((e) => console.warn('[crew]', a.op, e && e.message)); if (ctx && ctx.waitUntil) ctx.waitUntil(p); return p; }

/** EFB routes: /api/efb/push/*, /api/efb/crew/*. deps: { bookings(u) -> {bookings} } */
export async function crewPublic(req, url, env, h, me, deps) {
  const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  try {
    const path = url.pathname.replace(/\/+$/, '');
    if (path === '/api/efb/push/key') return res(await crew(env, { op: 'key' }));
    if (!me) throw new CrewError(401, 'Sign in first');
    if (req.method === 'GET' && path === '/api/efb/crew') return res(await crew(env, { op: 'ciGet', u: me.u }));
    if (req.method !== 'POST') throw new CrewError(405, 'Method not allowed');
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) throw new CrewError(415, 'Send JSON');
    let b; try { b = await req.json(); } catch (e) { throw new CrewError(400, 'Bad body'); }
    switch (path) {
      case '/api/efb/push/sub': return res(await crew(env, { op: 'sub', u: me.u, cid: me.c ? String(me.c) : '', sub: b.sub, cats: b.cats, dnd: b.dnd, dndFlight: b.dndFlight }));
      case '/api/efb/push/dnd': return res(await crew(env, { op: 'dnd', u: me.u, endpoint: b.endpoint, dnd: !!b.dnd, dndFlight: b.dndFlight !== false }));
      case '/api/efb/push/unsub': return res(await crew(env, { op: 'unsub', endpoint: b.endpoint }));
      case '/api/efb/push/state': return res(await crew(env, { op: 'subGet', u: me.u, endpoint: b.endpoint }));
      case '/api/efb/push/test': return res(await crew(env, { op: 'notify', to: { u: me.u }, cat: b.cat === 'brief' ? 'brief' : 'mail', payload: { title: 'Polaris EFB', body: 'Push notifications are working on this device.', url: '#prefs', tag: 'test' } }));
      case '/api/efb/crew/checkin': {
        const L = ((await deps.bookings(me.u)) || {}).bookings || [], bk = L.find((x) => String(x.id) === String(b.bookingId));
        if (!bk) throw new CrewError(404, 'That booking is no longer in your vAMSYS bookings');
        const std = Date.parse(bk.departureTime || ''), now = Date.now();
        if (std && std - now > 12 * 3600_000) throw new CrewError(409, 'Check-in opens 12 hours before departure (' + new Date(std - 12 * 3600_000).toISOString().slice(11, 16) + 'Z).');
        return res(await crew(env, { op: 'checkin', u: me.u, booking: bk, altn: String(b.altn || '').toUpperCase() }));
      }
      case '/api/efb/crew/checkout': return res(await crew(env, { op: 'checkout', u: me.u }));
      case '/api/efb/crew/alarms': return res(await crew(env, { op: 'alarmSync', u: me.u, list: b.list }));
    }
    throw new CrewError(404, 'Not found');
  } catch (e) { return res({ error: e.message || 'Error' }, e.status || 500); }
}
