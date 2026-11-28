/* ---------- Polaris documents ----------
   Company manuals, SOPs and notices as PDF files. Staff put them on /admin (Documents tab, behind Cloudflare Access);
   every signed-in pilot sees them in the EFB (Flight › Documents › Polaris Airways) and can keep them on the device to
   read offline. A file is kept in KV in pieces of up to 8 MB (one KV value holds 25 MB at most, and a request body
   should stay small), uploaded one piece per request and checked when the upload is finished. The admin page makes a
   small JPEG of the first page (the cover) in the browser. Links to a file or a cover carry a short signature that
   lasts 6 to 12 hours, as mail attachments do, because an <img> or a new tab cannot send the sign-in. Replacing a file
   makes a new version (v); the old version's pieces are deleted once the new one is in.

   A document can ask pilots to confirm they have read it (ack): the EFB shows "I have read it" in the viewer, and the
   admin lists who has and who has not, for the version now published. The receipts are kept in the crew Durable
   Object (crew.js, docAck), not in KV, so a tap is not a KV write.

   KV (STORE):  docs:v1:index           -> [{ id, title, folder, rev, name, size, pages, v, n, cover, ack, t, by, up, upBy, ed, edBy }]
                docs:v1:f:<id>:<v>:<i>  -> piece i of version v of the file (KV metadata { s: bytes, t: when })
                docs:v1:c:<id>:<v>      -> the cover (JPEG) */

import { crew } from './crew.js';

class DocError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const DOC_PIECE = 8 * 1024 * 1024;
const FILE_MAX = 100 * 1024 * 1024, TOTAL_MAX = 700 * 1024 * 1024, COVER_MAX = 400 * 1024, DOCS_MAX = 300;
const LINK_MS = 6 * 3600_000;
const IDX = 'docs:v1:index';
const fKey = (id, v, i) => 'docs:v1:f:' + id + ':' + v + ':' + i;
const fPre = (id, v) => 'docs:v1:f:' + id + ':' + (v == null ? '' : v + ':');
const cKey = (id, v) => 'docs:v1:c:' + id + ':' + v;
const okId = (s) => /^[a-z0-9]{8,24}$/.test(String(s || ''));
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const jsonRes = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const fileName = (s) => String(s || 'document.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'document.pdf';

/* ---- storage ---- */
let mem = null; // { at, list } a short cache for the pilots' list
const coll = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
/* a storage error is an error (500), never an empty list: an empty list would take the documents off every pilot's device */
async function readIndex(kv) { const v = await kv.get(IDX, 'json'); return Array.isArray(v) ? v : []; }
async function writeIndex(kv, list) {
  list.sort((a, b) => coll.compare(a.folder || '', b.folder || '') || coll.compare(a.title || '', b.title || ''));
  await kv.put(IDX, JSON.stringify(list)); mem = null;
}
async function keysOf(kv, prefix) {
  const out = []; let cursor;
  do { const r = await kv.list({ prefix, cursor }); out.push(...r.keys); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return out;
}
async function dropKeys(kv, keys) { for (const k of keys) await kv.delete(k.name); }
/* the bytes of uploads not finished (or left half way, until sweep takes them), apart from this one's own earlier try
   (id, v: its pieces are written over): they count against TOTAL_MAX too (P2, Nov 2026), so uploads that never finish
   cannot fill KV */
async function pendingBytes(kv, list, id, v) {
  const live = new Set(list.map((d) => d.id + ':' + d.v)); let n = 0;
  for (const k of await keysOf(kv, 'docs:v1:f:')) {
    const p = k.name.split(':'); // docs v1 f id v i
    if (live.has(p[3] + ':' + p[4]) || (p[3] === id && +p[4] === v)) continue;
    n += (k.metadata && +k.metadata.s) || 0;
  }
  return n;
}
/* an error's message: one of ours as it is; anything else (a bug) logged and said in plain words */
const errMsg = (e) => { if (e && e.status && e.message) return e.message; console.warn('[docs]', (e && e.stack) || e); return 'Something went wrong on the server. Please try again.'; };

/* the file, piece after piece, as one response */
function fileResponse(kv, d, headers) {
  let i = 0;
  const body = new ReadableStream({
    async pull(ctl) {
      if (i >= d.n) { ctl.close(); return; }
      const buf = await kv.get(fKey(d.id, d.v, i++), 'arrayBuffer');
      if (!buf) { ctl.error(new Error('A piece of this document is missing')); return; }
      ctl.enqueue(new Uint8Array(buf));
    },
  });
  let out = body;
  /* on Cloudflare: a known length, so the EFB can show how far a download has come */
  if (typeof FixedLengthStream === 'function') { const fl = new FixedLengthStream(d.size); body.pipeTo(fl.writable).catch(() => {}); out = fl.readable; }
  return new Response(out, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="' + fileName(d.name) + '"', 'X-Doc-Size': String(d.size), 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers } });
}

/* ---- pilots (the EFB) ---- */
/* GET /api/efb/docs: every document, with a signed link for its file and cover */
export async function docsPublic(req, env, h, sess, linkSig) {
  const kv = env && env.STORE; if (!kv) throw new DocError(503, 'Storage is not set up');
  if (!sess) throw new DocError(401, 'Sign in to see Polaris documents');
  if (!mem || Date.now() - mem.at > 20000) mem = { at: Date.now(), list: await readIndex(kv) };
  /* links good until the end of the next 6-hour block, so they stay the same between checks */
  const e = (Math.floor(Date.now() / LINK_MS) + 2) * LINK_MS, docs = [];
  /* the version of each document this pilot confirmed reading, when one asks for it */
  let mine = {};
  if (mem.list.some((d) => d.ack)) { try { mine = (await crew(env, { op: 'docAcks', u: sess.u })).acks || {}; } catch (er) { mine = {}; } }
  for (const d of mem.list) {
    const r = d.ack && mine[d.id] && mine[d.id][sess.u];
    docs.push({ id: d.id, title: d.title, folder: d.folder || '', rev: d.rev || '', name: d.name || '', size: d.size || 0, pages: d.pages || 0, v: d.v, up: d.up || d.t || 0, cover: !!d.cover, e, k: await linkSig(env, 'doc:' + d.id + ':' + d.v + ':' + e),
      ...(d.ack ? { ack: true, read: r ? r.v : 0, readAt: r ? r.t : 0 } : {}) });
  }
  const raw = JSON.stringify(docs); let hsh = 2166136261;
  for (let i = 0; i < raw.length; i++) { hsh ^= raw.charCodeAt(i); hsh = Math.imul(hsh, 16777619) >>> 0; }
  const tag = '"d-' + hsh.toString(36) + '"';
  if ((req.headers.get('If-None-Match') || '') === tag) return new Response(null, { status: 304, headers: { ...h, ETag: tag, 'Cache-Control': 'no-cache' } });
  return new Response(JSON.stringify({ docs, at: new Date().toISOString() }), { status: 200, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: tag } });
}
async function linkDoc(url, env, linkSig) {
  const id = String(url.searchParams.get('id') || ''), v = +url.searchParams.get('v') || 0, e = +url.searchParams.get('e') || 0, k = String(url.searchParams.get('k') || '');
  if (!okId(id) || !(v > 0) || !(e > Date.now()) || !k || k !== await linkSig(env, 'doc:' + id + ':' + v + ':' + e)) throw new DocError(401, 'This document link has expired. Open Documents in the EFB again.');
  return { id, v };
}
/* POST /api/efb/docs/ack { id, v }: the signed-in pilot has read this version of a document that asks for it */
export async function docAckPublic(req, env, h, sess) {
  const res = (b, s) => jsonRes(b, s || 200, h);
  try {
    if (!sess) throw new DocError(401, 'Sign in to confirm documents');
    if (!/^application\/json\b/i.test(req.headers.get('Content-Type') || '')) throw new DocError(415, 'Send JSON');
    let b; try { b = await req.json(); } catch (er) { throw new DocError(400, 'Bad body'); }
    const kv = env && env.STORE; if (!kv) throw new DocError(503, 'Storage is not set up');
    const d = (await readIndex(kv)).find((x) => x.id === String(b.id || ''));
    if (!d) throw new DocError(404, 'That document no longer exists');
    if (!d.ack) throw new DocError(400, 'This document does not ask for a confirmation');
    if (+b.v !== d.v) throw new DocError(409, 'A newer version of this document is out. Open it again to read that one.');
    return res(await crew(env, { op: 'docAck', id: d.id, u: sess.u, v: d.v }));
  } catch (er) { return res({ error: er.message || 'Error' }, er.status || 500); }
}
/* GET /api/efb/doc-file?id=&v=&e=&k=: the PDF */
export async function docFile(url, env, h, linkSig) {
  const kv = env && env.STORE; if (!kv) throw new DocError(503, 'Storage is not set up');
  const { id, v } = await linkDoc(url, env, linkSig);
  const d = (await readIndex(kv)).find((x) => x.id === id);
  if (!d) throw new DocError(404, 'This document has been removed');
  if (d.v !== v) throw new DocError(410, 'There is a newer version of this document. Refresh Documents to get it.');
  return fileResponse(kv, d, h);
}
/* GET /api/efb/doc-cover?id=&v=&e=&k=: the first page, small */
export async function docCover(url, env, h, linkSig) {
  const kv = env && env.STORE; if (!kv) throw new DocError(503, 'Storage is not set up');
  const { id, v } = await linkDoc(url, env, linkSig);
  const buf = await kv.get(cKey(id, v), 'arrayBuffer');
  if (!buf) throw new DocError(404, 'No cover');
  return new Response(buf, { status: 200, headers: { ...h, 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
}

/* ---- /admin (the caller checked Cloudflare Access; who = the staff member's email) ---- */
let swept = 0;
/* pieces and covers that no document uses (an upload left half way), a day old or more: at most once an hour */
async function sweep(kv, list) {
  if (Date.now() - swept < 3600_000) return; swept = Date.now();
  const live = new Set(list.map((d) => d.id + ':' + d.v)), old = Date.now() - 86400_000;
  for (const k of await keysOf(kv, 'docs:v1:f:')) {
    const p = k.name.split(':'); // docs v1 f id v i
    if (!live.has(p[3] + ':' + p[4]) && (!k.metadata || !(k.metadata.t > old))) await kv.delete(k.name);
  }
  for (const k of await keysOf(kv, 'docs:v1:c:')) { const p = k.name.split(':'); if (!live.has(p[3] + ':' + p[4])) await kv.delete(k.name); }
}
export async function docsAdmin(req, url, path, env, who, ctx) {
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503);
  try {
    /* the list, with how much room is used */
    if (path === '/admin/api/docs' && req.method === 'GET') {
      const list = await readIndex(kv), used = list.reduce((s, d) => s + (d.size || 0), 0);
      const p = sweep(kv, list).catch(() => {}); if (ctx && ctx.waitUntil) ctx.waitUntil(p);
      /* who confirmed reading which version ({ [id]: { [pilot]: { v, t } } }) */
      let acks = {}, acksErr = '';
      if (list.some((d) => d.ack)) { try { acks = (await crew(env, { op: 'docAcks' })).acks || {}; } catch (er) { acksErr = 'Read confirmations are not available right now: ' + er.message; } }
      return jsonRes({ docs: list, used, max: TOTAL_MAX, fileMax: FILE_MAX, piece: DOC_PIECE, count: list.length, countMax: DOCS_MAX, acks, acksErr });
    }
    /* one piece of a file being uploaded: raw bytes (a form on another site cannot send this type) */
    if (path === '/admin/api/docs/piece' && req.method === 'POST') {
      if (!/^application\/octet-stream\b/i.test(req.headers.get('Content-Type') || '')) throw new DocError(415, 'Send the file as application/octet-stream');
      const id = String(url.searchParams.get('id') || ''), v = +url.searchParams.get('v'), i = +url.searchParams.get('i'), size = +url.searchParams.get('size');
      if (!okId(id) || !Number.isInteger(v) || v < 1 || v > 1e6 || !Number.isInteger(i) || i < 0 || i >= Math.ceil(FILE_MAX / DOC_PIECE)) throw new DocError(400, 'Bad upload');
      if (!(size > 0)) throw new DocError(400, 'Bad upload: the file size is missing');
      if (size > FILE_MAX) throw new DocError(413, 'This file is larger than ' + Math.round(FILE_MAX / 1048576) + ' MB');
      const list = await readIndex(kv), old = list.find((d) => d.id === id);
      if (old && v <= old.v) throw new DocError(409, 'This document changed meanwhile. Reload the page and try again.');
      if (!old && list.length >= DOCS_MAX) throw new DocError(400, 'There are already ' + DOCS_MAX + ' documents. Delete some first.');
      if (i === 0) {
        /* an upload starting: the pieces left half way a day ago or more go first (at most once an hour), then the room
           is counted with the uploads still under way */
        await sweep(kv, list).catch((e) => console.warn('[docs sweep]', e && e.message));
        const used = list.filter((d) => d.id !== id).reduce((s, d) => s + (d.size || 0), 0), pend = await pendingBytes(kv, list, id, v);
        if (used + pend + size > TOTAL_MAX) throw new DocError(413, 'Not enough room: ' + Math.round(used / 1048576) + ' of ' + Math.round(TOTAL_MAX / 1048576) + ' MB are used' + (pend ? ', and ' + Math.max(1, Math.round(pend / 1048576)) + ' MB by uploads not finished yet' : '') + '. Delete or replace a document first' + (pend ? ', or try again tomorrow' : '') + '.');
      }
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) throw new DocError(400, 'This piece is empty');
      if (buf.byteLength > DOC_PIECE) throw new DocError(413, 'This piece is too large');
      if (i === 0 && new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(5, buf.byteLength))) !== '%PDF-') throw new DocError(400, 'This is not a PDF file');
      await kv.put(fKey(id, v, i), buf, { metadata: { s: buf.byteLength, t: Date.now() } });
      return jsonRes({ ok: true, i, s: buf.byteLength });
    }
    /* finish an upload (file), or change the title, folder or revision of a document */
    if (path === '/admin/api/docs' && req.method === 'POST') {
      if (!/^application\/json\b/i.test(req.headers.get('Content-Type') || '')) throw new DocError(415, 'Send JSON');
      let b; try { b = await req.json(); } catch (e) { throw new DocError(400, 'Bad body'); }
      const id = String(b.id || '');
      if (!okId(id)) throw new DocError(400, 'Bad document id');
      const list = await readIndex(kv), old = list.find((d) => d.id === id);
      if (!old && !b.file) throw new DocError(404, 'That document no longer exists');
      if (!old && list.length >= DOCS_MAX) throw new DocError(400, 'There are already ' + DOCS_MAX + ' documents. Delete some first.');
      const title = clean(b.title, 120); if (!title) throw new DocError(400, 'Give the document a title');
      const doc = old ? { ...old } : { id, t: Date.now(), by: who };
      doc.title = title; doc.folder = clean(b.folder, 60); doc.rev = clean(b.rev, 40);
      if (b.ack != null) { if (b.ack) doc.ack = true; else delete doc.ack; }
      let gone = null;
      if (b.file) {
        const f = b.file, v = +f.v, size = +f.size, n = +f.n;
        if (!Number.isInteger(v) || v < 1 || (old && v <= old.v)) throw new DocError(409, 'This document changed meanwhile. Reload the page and try again.');
        if (!(size > 0 && size <= FILE_MAX) || n !== Math.ceil(size / DOC_PIECE)) throw new DocError(400, 'Bad file size');
        /* pieces past the end are left from an earlier try with the same version: they go */
        const all = await keysOf(kv, fPre(id, v)), keys = all.filter((k) => +k.name.split(':')[5] < n), got = keys.reduce((s, k) => s + ((k.metadata && k.metadata.s) || 0), 0);
        if (keys.length !== n || got !== size) throw new DocError(400, 'The upload is not complete (' + keys.length + ' of ' + n + ' pieces arrived). Try again.');
        await dropKeys(kv, all.filter((k) => +k.name.split(':')[5] >= n));
        const used = list.filter((d) => d.id !== id).reduce((s, d) => s + (d.size || 0), 0);
        if (used + size > TOTAL_MAX) { await dropKeys(kv, keys); throw new DocError(413, 'Not enough room for this file. Delete or replace a document first.'); }
        let cover = false;
        if (b.cover) {
          let bin; try { bin = Uint8Array.from(atob(String(b.cover).replace(/^data:image\/jpeg;base64,/, '')), (c) => c.charCodeAt(0)); } catch (e) { bin = null; }
          if (bin && bin.length <= COVER_MAX && bin[0] === 0xff && bin[1] === 0xd8) { await kv.put(cKey(id, v), bin.buffer); cover = true; }
        }
        if (old) gone = old.v;
        Object.assign(doc, { v, n, size, name: clean(f.name, 160) || 'document.pdf', pages: Math.max(0, Math.min(1e5, Math.round(+f.pages || 0))), cover, up: Date.now(), upBy: who });
      } else { doc.ed = Date.now(); doc.edBy = who; }
      await writeIndex(kv, [doc, ...list.filter((d) => d.id !== id)]);
      /* the replaced version goes */
      if (gone != null) { await dropKeys(kv, (await keysOf(kv, fPre(id))).filter((k) => !k.name.startsWith(fPre(id, doc.v)))); await kv.delete(cKey(id, gone)); }
      return jsonRes({ ok: true, doc });
    }
    if (path === '/admin/api/docs' && req.method === 'DELETE') {
      const id = String(url.searchParams.get('id') || ''), list = await readIndex(kv), old = list.find((d) => d.id === id);
      if (!old) throw new DocError(404, 'That document no longer exists');
      await writeIndex(kv, list.filter((d) => d.id !== id));
      await dropKeys(kv, await keysOf(kv, fPre(id)));
      await dropKeys(kv, await keysOf(kv, 'docs:v1:c:' + id + ':'));
      return jsonRes({ ok: true });
    }
    /* a cover for a document that has none (the admin draws the first page): POST /admin/api/docs/cover?id=&v=, a JPEG */
    if (path === '/admin/api/docs/cover' && req.method === 'POST') {
      /* the picture itself, as the admin page sends it (a form on another site cannot send this type) */
      if (!/^(image\/jpeg|application\/octet-stream)\b/i.test(req.headers.get('Content-Type') || '')) throw new DocError(415, 'Send the cover as image/jpeg');
      const id = String(url.searchParams.get('id') || ''), v = +url.searchParams.get('v'), list = await readIndex(kv), d = list.find((x) => x.id === id);
      if (!d) throw new DocError(404, 'That document no longer exists');
      if (d.v !== v) throw new DocError(409, 'This document changed meanwhile');
      const bin = new Uint8Array(await req.arrayBuffer());
      if (!bin.length || bin.length > COVER_MAX || bin[0] !== 0xff || bin[1] !== 0xd8) throw new DocError(400, 'The cover must be a JPEG of at most ' + Math.round(COVER_MAX / 1024) + ' KB');
      await kv.put(cKey(id, v), bin.buffer);
      /* the index is read again: it may have changed while the picture came */
      const now = await readIndex(kv), cur = now.find((x) => x.id === id && x.v === v);
      if (cur && !cur.cover) { cur.cover = true; await writeIndex(kv, now); }
      return jsonRes({ ok: true });
    }
    /* staff can look at what pilots get */
    if ((path === '/admin/api/docs/file' || path === '/admin/api/docs/cover') && req.method === 'GET') {
      const id = String(url.searchParams.get('id') || ''), d = (await readIndex(kv)).find((x) => x.id === id);
      if (!d) throw new DocError(404, 'That document no longer exists');
      if (path.endsWith('/file')) return fileResponse(kv, d, { 'Cache-Control': 'no-store' });
      const buf = d.cover ? await kv.get(cKey(d.id, d.v), 'arrayBuffer') : null;
      if (!buf) throw new DocError(404, 'No cover');
      return new Response(buf, { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
    }
    return jsonRes({ error: 'Not found' }, 404);
  } catch (e) { return jsonRes({ error: errMsg(e) }, (e && e.status) || 500); }
}
export { DocError };
