/* ---------- AIP Japan charts (JCAB, SWIM portal › AIP File Download), uploaded on /admin › Nav Data (Nov 2026) ----------
   JCAB publishes each aerodrome's AD 2 charts as separate PDFs, one folder per aerodrome named for the date its
   charts took effect (1_AIP(PDF)/<AIP date>/AD2_Separate/RJTT__20261126/RJTT__IAC (ILS Z RWY34L)_20260416.pdf). The
   portal needs a sign-in, so an admin drops that folder on /admin › Nav Data; the page sends each aerodrome folder that
   isn't here yet, file by file, then commits it. A folder dated later than today waits and takes over on its date
   (00:00 UTC); the one in force before it stays until then. The PDFs are kept in R2 (CHARTS), only for signed-in pilots.

   R2 (CHARTS): jp/<ICAO>/<yyyymmdd>/<i>.pdf
   KV (STORE):  jpch:v1:idx -> { at, apts: { RJTT: [{ eff: '20261126', n, size, at, by }] } }
                jpch:v1:a:<ICAO>:<yyyymmdd> -> { eff, files: [{ i, key, code, group, name, d, s }] }

   Admin: GET  /admin/api/navdata/jpcharts                   -> { apts } what is here
          POST /admin/api/navdata/jpcharts/put?apt=&eff=&i= -> one PDF (the body)
          POST /admin/api/navdata/jpcharts/commit { apt, eff, files: [{ i, file, s }] }
          POST /admin/api/navdata/jpcharts/delete { apt }
   Pilots: the Charts list (/api/efb/charts?icao=RJxx|ROxx) and /api/efb/chart-pdf?cycle=JPyyyymmdd&file=RJTT/<key> */
const IDXK = 'jpch:v1:idx', LK = (a, e) => 'jpch:v1:a:' + a + ':' + e, OK = (a, e, i) => 'jp/' + a + '/' + e + '/' + i + '.pdf';
const PDF_MAX = 60 * 1024 * 1024, FILES_MAX = 400, SWIM = 'https://top.swim.mlit.go.jp/swim/';
const jsonRes = (body, status, headers) => new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const aptOk = (a) => /^R[JO][A-Z]{2}$/.test(a), effOk = (e) => /^20\d{6}$/.test(e) && !isNaN(effT(e));
const effT = (e) => Date.UTC(+e.slice(0, 4), +e.slice(4, 6) - 1, +e.slice(6, 8));
const effIso = (e) => e.slice(0, 4) + '-' + e.slice(4, 6) + '-' + e.slice(6, 8);
const lineS = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);

let MEM = null;
async function readIdx(env, fresh) {
  if (!fresh && MEM && Date.now() - MEM.t < 60_000) return MEM.v;
  const v = (await env.STORE.get(IDXK, 'json').catch(() => null)) || { at: 0, apts: {} }; MEM = { v, t: Date.now() }; return v;
}
/* the version in force: the latest whose date has come, else (nothing yet) the first one to come */
export function jpPick(vers, now) {
  const t = now || Date.now(), L = (vers || []).slice().sort((a, b) => effT(a.eff) - effT(b.eff));
  const past = L.filter((v) => effT(v.eff) <= t), act = past.length ? past[past.length - 1] : L[0] || null;
  const next = act ? L.find((v) => effT(v.eff) > Math.max(t, effT(act.eff))) || null : null;
  return { act, next, pending: !!act && effT(act.eff) > t };
}

/* "RJTT__IAC (ILS Y RWY34R(CAT II & III))_20251002.pdf" -> the Charts list's group and name */
export function jpChartInfo(file, apt) {
  const m = String(file || '').match(/^([A-Z]{4})__(.+)_(\d{8})\.pdf$/i);
  if (!m || (apt && m[1].toUpperCase() !== apt)) return null;
  const key = m[2].trim(), d = m[3], i0 = key.indexOf('('), i1 = key.lastIndexOf(')');
  /* "IAC(RNP Y RWY10" has lost its closing bracket */
  const head = (i0 > 0 ? key.slice(0, i0) : key).replace(/[＊*]/g, '').trim(), inner0 = i0 > 0 ? key.slice(i0 + 1, i1 > i0 ? i1 : key.length).trim() : '',
    inner = inner0.split('(').length > inner0.split(')').length ? inner0 + ')' : inner0;
  const nice = (s) => s.replace(/[＊*]/g, '').replace(/_/g, '/').replace(/\s+/g, ' ').trim();
  /* a SID or STAR chart with several procedures parts them with two spaces: "HIKNE  IKAROS" -> "HIKNE, IKAROS" */
  const procs = (s) => nice(s.replace(/[＊*]/g, '').trim().replace(/\s{2,}(?!-)/g, ', '));
  let code = 'DAU', group = 'Other', name = nice(key);
  if (/^ADC\b/i.test(head)) { code = 'APD'; group = 'Airport diagram'; name = 'Aerodrome chart' + (head.match(/-(\d+)$/) ? ' ' + head.match(/-(\d+)$/)[1] : ''); }
  else if (/^APDC\b/i.test(head)) { code = 'HOT'; group = 'Hot spots'; name = 'Parking and docking chart' + (inner ? ' ' + nice(inner) : ''); }
  else if (/^GMC\b/i.test(head)) { code = 'APD'; group = 'Airport diagram'; name = 'Ground movement chart' + (inner ? ' ' + nice(inner) : ''); }
  else if (/^SID\b/i.test(head)) { code = 'DP'; group = 'Departures'; name = inner ? procs(inner) : nice(key); }
  else if (/^(STAR|Standard Arrival)\b/i.test(head)) { code = 'STR'; group = 'Arrivals'; name = inner ? procs(inner) : nice(key); }
  else if (/^IAC\b/i.test(head)) { code = 'IAP'; group = 'Approaches'; name = nice(inner || key); }
  else if (/^AOC\b/i.test(head)) name = 'Obstacle chart ' + head.replace(/^AOC\s*/i, '') + (inner ? ' ' + nice(inner) : '');
  else if (/^PATC\b/i.test(head)) name = 'Precision approach terrain chart' + (inner ? ' ' + nice(inner) : '');
  else if (/^Other Chart\b/i.test(head)) name = nice(inner || key);
  else if (/^AD ?2$/i.test(head)) name = 'AD 2 aerodrome data';
  return { key, code, group, name: name.replace(/\s+/g, ' ').trim(), d };
}

async function dropVersion(env, apt, eff) {
  const pre = 'jp/' + apt + '/' + eff + '/';
  let cur; do { const l = await env.CHARTS.list({ prefix: pre, cursor: cur }); if (l.objects.length) await env.CHARTS.delete(l.objects.map((o) => o.key)); cur = l.truncated ? l.cursor : null; } while (cur);
  await env.STORE.delete(LK(apt, eff)).catch(() => {});
}

export async function jpChartsAdmin(req, path, env, by) {
  if (!env.CHARTS) return jsonRes({ error: 'The chart storage (R2) is not connected' }, 503);
  const who = lineS(typeof by === 'string' ? by : (by && by.email) || '', 120), now = Date.now(), url = new URL(req.url);
  if (path === '/admin/api/navdata/jpcharts' && req.method === 'GET') return jsonRes({ apts: (await readIdx(env, true)).apts || {} });
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405);
  if (path === '/admin/api/navdata/jpcharts/put') {
    const apt = String(url.searchParams.get('apt') || ''), eff = String(url.searchParams.get('eff') || ''), i = +url.searchParams.get('i');
    if (!aptOk(apt) || !effOk(eff) || !Number.isInteger(i) || i < 0 || i >= FILES_MAX) return jsonRes({ error: 'Bad chart' }, 400);
    const n = +(req.headers.get('Content-Length') || 0); if (n > PDF_MAX) return jsonRes({ error: 'That PDF is too large' }, 413);
    const buf = await req.arrayBuffer(); const u = new Uint8Array(buf, 0, Math.min(5, buf.byteLength));
    if (buf.byteLength > PDF_MAX) return jsonRes({ error: 'That PDF is too large' }, 413);
    if (String.fromCharCode(...u) !== '%PDF-') return jsonRes({ error: 'That is not a PDF' }, 400);
    await env.CHARTS.put(OK(apt, eff, i), buf, { httpMetadata: { contentType: 'application/pdf' } });
    return jsonRes({ ok: true, s: buf.byteLength });
  }
  if (!/application\/json/.test(req.headers.get('Content-Type') || '')) return jsonRes({ error: 'Send JSON' }, 415);
  let b = {}; try { b = await req.json(); } catch (e) {}
  const apt = String(b.apt || '');
  if (!aptOk(apt)) return jsonRes({ error: 'Bad aerodrome' }, 400);
  const idx = await readIdx(env, true); idx.apts = idx.apts || {};
  if (path === '/admin/api/navdata/jpcharts/delete') {
    const vers = idx.apts[apt] || []; for (const v of vers) await dropVersion(env, apt, v.eff);
    delete idx.apts[apt]; idx.at = now; await env.STORE.put(IDXK, JSON.stringify(idx)); MEM = null;
    return jsonRes({ ok: true });
  }
  if (path !== '/admin/api/navdata/jpcharts/commit') return jsonRes({ error: 'Not found' }, 404);
  const eff = String(b.eff || ''), files = Array.isArray(b.files) ? b.files : [];
  if (!effOk(eff) || !files.length || files.length > FILES_MAX) return jsonRes({ error: 'Bad chart list' }, 400);
  const out = [], seen = new Set();
  for (const f of files) {
    const i = +f.i, info = jpChartInfo(f.file, apt);
    if (!Number.isInteger(i) || i < 0 || i >= FILES_MAX || !info || seen.has(info.key)) return jsonRes({ error: 'Bad chart in the list: ' + lineS(f.file, 80) }, 400);
    seen.add(info.key); out.push({ i, ...info, s: +f.s || 0 });
  }
  /* every PDF must be here before the list says so */
  const heads = await Promise.all(out.map((f) => env.CHARTS.head(OK(apt, eff, f.i))));
  const miss = out.filter((f, k) => !heads[k]); if (miss.length) return jsonRes({ error: miss.length + ' of the PDFs did not arrive: send the folder again' }, 409);
  out.sort((a, c) => (a.code === 'APD' ? 0 : 1) - (c.code === 'APD' ? 0 : 1) || a.group.localeCompare(c.group) || a.name.localeCompare(c.name, 'en', { numeric: true }));
  await env.STORE.put(LK(apt, eff), JSON.stringify({ eff, files: out }));
  const size = out.reduce((s, f) => s + f.s, 0);
  let vers = (idx.apts[apt] || []).filter((v) => v.eff !== eff).concat([{ eff, n: out.length, size, at: now, by: who }]);
  /* keep the version in force and the ones to come; older ones go */
  const { act } = jpPick(vers, now), gone = vers.filter((v) => act && effT(v.eff) < effT(act.eff));
  vers = vers.filter((v) => !gone.includes(v)).sort((a, c) => effT(a.eff) - effT(c.eff));
  idx.apts[apt] = vers; idx.at = now;
  await env.STORE.put(IDXK, JSON.stringify(idx)); MEM = null;
  for (const v of gone) await dropVersion(env, apt, v.eff).catch(() => {});
  return jsonRes({ ok: true, apt, versions: vers });
}

/* the Charts list for a Japanese aerodrome, or null when none were uploaded (the FAA's empty answer then) */
export async function jpChartsList(icao, env, me) {
  if (!env.CHARTS || !aptOk(icao)) return null;
  const vers = ((await readIdx(env)).apts || {})[icao];
  if (!vers || !vers.length) return null;
  const base = { src: 'jp', label: 'AIP Japan', aip: SWIM, airport: { icao, name: '' } };
  if (!me) return { ...base, cycle: null, charts: [], notFound: true, signin: true };
  const { act, next, pending } = jpPick(vers);
  const L = await env.STORE.get(LK(icao, act.eff), { type: 'json', cacheTtl: 300 }).catch(() => null);
  if (!L) return { ...base, cycle: null, charts: [], notFound: true };
  return { ...base, cycle: 'JP' + act.eff, eff: effIso(act.eff), from: new Date(effT(act.eff)).toISOString(), to: next ? new Date(effT(next.eff)).toISOString() : null,
    next: next ? { eff: effIso(next.eff) } : null, pending,
    charts: L.files.map((f) => ({ code: f.code, group: f.group, name: f.name, pdf: icao + '/' + f.key, changed: f.d === act.eff })), notFound: false };
}

/* one chart PDF: cycle=JPyyyymmdd&file=RJTT/<key> */
export async function jpChartPdf(url, env, h, me) {
  const cycle = url.searchParams.get('cycle') || '', file = url.searchParams.get('file') || '';
  const eff = cycle.slice(2), apt = file.slice(0, 4), key = file.slice(5);
  if (!/^JP\d{8}$/.test(cycle) || !aptOk(apt) || file[4] !== '/' || !key || key.length > 240) return jsonRes({ error: 'Invalid chart' }, 400, h);
  if (!me) return jsonRes({ error: 'Sign in to see AIP Japan charts' }, 401, h);
  if (!env.CHARTS) return jsonRes({ error: 'Chart storage is not connected' }, 503, h);
  const L = await env.STORE.get(LK(apt, eff), { type: 'json', cacheTtl: 300 }).catch(() => null);
  const f = L && L.files.find((x) => x.key === key);
  if (!f) return jsonRes({ error: 'That chart is no longer in AIP Japan here. Open the chart list again.' }, 404, h);
  const o = await env.CHARTS.get(OK(apt, eff, f.i));
  if (!o) return jsonRes({ error: 'The chart file is missing' }, 404, h);
  return new Response(o.body, { status: 200, headers: { ...h, 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=86400', Vary: 'Authorization' } });
}

/* for Nav Data */
export async function jpChartsStatus(env) { return readIdx(env, true); }
