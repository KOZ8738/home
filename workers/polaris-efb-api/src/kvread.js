/* ---------- Reading JSON kept in KV when what is read may be written back (Nov 2026) ----------
   A key that is not there is null: nothing has been kept yet, and an empty default is right. A storage error, or a
   value that is not what is kept there (a list where an object belongs, a string), is an error (503 unless the caller
   says otherwise), never an empty default: an empty list read by mistake and written back wipes what was kept (the
   mail, the roles, the gate plan, the chart and AIRAC indexes), and empty roles would let anyone in as administrator.
   Nothing here caches: a read that failed is never remembered as an answer. */
export class StoreError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const plainObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/* One change after another (P1, Nov 2026). A value kept in KV that is read, changed and written back (the AOC index,
   the mail index) loses whatever another change wrote between that read and that write: two at once in one isolate
   (the 2-minute cron's watchers, two staff saving) each write back the list without the other's. q = queue();
   q(async () => { read; change; write }) runs them in the order asked, each after the last has finished or failed. */
export function queue() {
  let tail = Promise.resolve();
  return (fn) => { const p = tail.then(() => fn()); tail = p.then(() => {}, () => {}); return p; };
}

/* o = { shape: 'object' | 'array', msg: the error's message, Err: the module's error class (status, msg), get: KV options
   such as { cacheTtl } }. Resolves to the value, or null when the key is not there. */
export async function kvJson(kv, key, o = {}) {
  const Err = o.Err || StoreError, msg = o.msg || 'Storage is temporarily unavailable; please try again';
  let v;
  try { v = await kv.get(key, o.get ? { ...o.get, type: 'json' } : 'json'); }
  catch (e) { console.warn('[kv] ' + key + ': ' + ((e && e.message) || e)); throw new Err(503, msg); }
  if (v == null) return null;
  if (o.shape === 'array' ? !Array.isArray(v) : !plainObj(v)) { console.warn('[kv] ' + key + ': not ' + (o.shape === 'array' ? 'a list' : 'an object') + ' as kept'); throw new Err(503, msg); }
  return v;
}
