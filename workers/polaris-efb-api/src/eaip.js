/* ---------- Charts from four eAIPs: Hong Kong, Singapore, United Kingdom, Norway (Nov 2026) ----------
   Each State publishes its AIP as an eAIP on the web, free and without an account, in the same layout: one folder per
   edition (named for its effective date), and in it each aerodrome's AD 2 page, whose section AD 2.24 "Charts related
   to an aerodrome" is a table of the charts' names, each linking its own PDF.
     Hong Kong (CAD)    https://www.ais.gov.hk/  eaip_<published>/<eff>-000000/html/eAIP/VH-AD-2-VHHH-en-US.html, PDFs in pdf/
                        (Macau's VMMC is in it too)
     Singapore (CAAS)   https://aim-sg.caas.gov.sg/aip/  aim-content/uploads/aip/<package>/AIP/<eff>-000000/html/eAIP/SG-AD-2-WSSS-en-GB.html
     United Kingdom     https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/ links the editions on
       (NATS)           www.aurora.nats.co.uk/htmlAIP/Publications/<eff>-AIRAC/html/eAIP/EG-AD-2.EGLL-en-GB.html, PDFs in graphics/
     Norway (Avinor)    https://aim-prod.avinor.no/no/AIP/ (goes on to View/Index/<n>/history-no-NO.html), then
                        <eff>-AIRAC/html/eAIP/EN-AD-2.ENGM-en-GB.html, PDFs in graphics/
   The list of editions comes from each one's front page (edition list), and the one in force is the latest whose date
   has come (00:00 UTC); an edition published ahead takes over by itself on its date.

   As with AIP Japan and China here: only for pilots signed in with vAMSYS, and each chart PDF is kept in R2 (CHARTS) the
   first time a pilot opens it, under ea/<cycle>/<file>, so it stays readable for that edition.
   The Charts list: /api/efb/charts?icao=VHHH (cycle HK<yyyymmdd>), WS.. (SG), EG.. (UK), EN.. (NO);
   one chart: /api/efb/chart-pdf?cycle=HK20261029&file=pdf/VH-AD-2-VHHH-ADC-1.pdf (graphics/<n>.pdf for the UK and Norway). */

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 PolarisEFB/1.0 (+https://koz8738.com/efb/)', Accept: 'text/html,application/xhtml+xml,application/pdf,*/*', 'Accept-Language': 'en-GB,en;q=0.8' };
const PDF_MAX = 40 * 1024 * 1024;

export const EA = {
  HK: {
    apt: /^V[HM][A-Z]{2}$/, label: 'AIP Hong Kong', host: 'CAD eAIP', site: 'https://www.ais.gov.hk/',
    /* the front page builds its links from ais.json: every recent edition is in the newest package, eaip_<its publication date> */
    home: 'https://www.ais.gov.hk/ais.json',
    eds: (t) => {
      let j; try { j = JSON.parse(t); } catch (e) { return []; }
      const A = (j && Array.isArray(j.amdt) ? j.amdt : []).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.effDate || '') && /^\d{4}-\d{2}-\d{2}$/.test(a.pubDate || ''));
      const pkg = A.map((a) => a.pubDate).sort().pop();
      return pkg ? A.map((a) => ({ eff: a.effDate, pub: pkg, amdt: a.no || '', base: `https://www.ais.gov.hk/eaip_${pkg.replace(/-/g, '')}/${a.effDate}-000000/`, index: 'html/index-en-US.html' })) : [];
    },
    page: (i) => `html/eAIP/VH-AD-2-${i}-en-US.html`,
  },
  SG: {
    apt: /^WS[A-Z]{2}$/, label: 'AIP Singapore', host: 'CAAS AIM-SG', home: 'https://aim-sg.caas.gov.sg/aip/',
    eds: (t) => [...t.matchAll(/aim-content\/uploads\/aip\/([^/"'<>\s]+)\/AIP\/(\d{4}-\d{2}-\d{2})-000000\/html\/index-en-GB\.html/g)].map((m) => ({ eff: m[2], pub: m[1], base: `https://aim-sg.caas.gov.sg/aim-content/uploads/aip/${m[1]}/AIP/${m[2]}-000000/`, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/SG-AD-2-${i}-en-GB.html`,
    skip: /\/old\//,
  },
  UK: {
    apt: /^EG[A-Z]{2}$/, label: 'UK AIP', host: 'NATS eAIP', home: 'https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/',
    eds: (t) => [...t.matchAll(/aurora\.nats\.co\.uk\/htmlAIP\/Publications\/(\d{4}-\d{2}-\d{2})-AIRAC\/html\/index-en-GB\.html/g)].map((m) => ({ eff: m[1], pub: m[1], base: `https://www.aurora.nats.co.uk/htmlAIP/Publications/${m[1]}-AIRAC/`, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/EG-AD-2.${i}-en-GB.html`,
  },
  NO: {
    apt: /^EN[A-Z]{2}$/, label: 'AIP Norway', host: 'Avinor eAIP', home: 'https://aim-prod.avinor.no/no/AIP/',
    /* relative to the history page the front page goes on to */
    eds: (t, at) => [...t.matchAll(/["'/]((\d{4}-\d{2}-\d{2})-AIRAC)\/html\/index-(?:no-NO|en-GB)\.html/g)].map((m) => ({ eff: m[2], pub: m[2], base: new URL(m[1] + '/', at).href, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/EN-AD-2.${i}-en-GB.html`,
  },
};
export const eaRegion = (icao) => Object.keys(EA).find((k) => EA[k].apt.test(String(icao || ''))) || null;

class EaError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function get(url, ttl) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 20000);
  try { return await fetch(url, { headers: UA, redirect: 'follow', signal: ctl.signal, cf: { cacheTtl: ttl, cacheEverything: true } }); }
  catch (e) { throw new EaError(502, 'The eAIP did not answer (' + (e.name === 'AbortError' ? 'timed out' : e.message) + ')'); }
  finally { clearTimeout(tm); }
}
/* a site's own "not found" page, sent with HTTP 200 (Singapore's is) */
const notFoundPage = (t) => /<title>\s*404\b|Page not found|404 - Not Found/i.test(t.slice(0, 3000));

/* ---------- editions ---------- */
async function editions(k, d) {
  const R = EA[k];
  return d.edgeCache('ea/eds/v1/' + k, 3 * 3600, async () => {
    const r = await get(R.home, 1800);
    if (!r.ok) throw new EaError(502, `${R.label}: the eAIP's front page answered HTTP ${r.status}`);
    const t = await r.text(), by = new Map();
    for (const e of R.eds(t, r.url || R.home)) { const o = by.get(e.eff); if (!o || e.pub > o.pub) by.set(e.eff, e); }
    return [...by.values()].sort((a, b) => a.eff.localeCompare(b.eff));
  }, (v) => Array.isArray(v) && v.length > 0);
}
async function edition(k, d, t = Date.now()) {
  const all = await editions(k, d), today = new Date(t).toISOString().slice(0, 10);
  const live = all.filter((e) => e.eff <= today), cur = live[live.length - 1];
  if (!cur) throw new EaError(502, `No ${EA[k].label} edition is in force yet`);
  return { cur, next: all.find((e) => e.eff > today) || null, all };
}
const cycleOf = (k, eff) => k + eff.replace(/-/g, '');

/* ---------- AD 2.24: the charts ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—' };
const unent = (s) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m));
const text = (h) => unent(h.replace(/<span[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
/** the section's HTML: from the heading "XXXX AD 2.24" to the next AD 2 heading */
function section(html) {
  const hs = [...html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => ({ i: m.index, t: text(m[2]) }));
  const a = hs.findIndex((h) => /\bAD 2\.24\b/.test(h.t));
  if (a < 0) return null;
  const b = hs.slice(a + 1).find((h) => /\bAD 2\.(?:2[5-9]|[3-9]\d)\b/.test(h.t) || /^\s*[A-Z]{4} AD 2\.\d/.test(h.t) && !/2\.24/.test(h.t));
  return html.slice(hs[a].i, b ? b.i : Math.min(html.length, hs[a].i + 600_000));
}
/** a chart's group in the EFB's Charts (the same groups as the FAA's and AIP Taiwan's) */
export function eaGroup(name, id) {
  const u = name.toUpperCase(), d = String(id || '').toUpperCase();
  if (/CODING|TABULAR|WAYPOINT LIST|\bTABLES?\b|\bDATA\b/.test(u)) return ['DATA', 'Procedure data'];
  if (/AERODROME CHART|AIRPORT CHART|AERODROME LAYOUT|AIRPORT DIAGRAM/.test(u) && !/OBSTACLE/.test(u)) return ['APD', 'Airport diagram'];
  if (/PARKING|DOCKING|GROUND MOVEMENT|TAXI|HOT ?SPOT|PUSH ?BACK|INTERSECTION TAKE|\bSTANDS?\b|DE-?ICING/.test(u) || /-(?:PBP|GMC|APDC)-/.test(d)) return ['HOT', 'Hot spots'];
  if (/\bSID\b|DEPARTURE/.test(u) || /-SID-/.test(d)) return ['DP', 'Departures'];
  if (/\bSTAR\b|ARRIVAL/.test(u) || /-STAR-/.test(d)) return ['STR', 'Arrivals'];
  if (/OBSTACLE|TERRAIN|\bAOC\b|PATC|ATOC/.test(u)) return ['DAU', 'Other'];
  if (/INSTRUMENT APPROACH|INITIAL APPROACH|APPROACH CHART|TRANSITION|^(ILS|LOC|LLZ|RNP|RNAV|GNSS|GLS|VOR|NDB|DME|TACAN|LDA|SRA|PAR|VISUAL|CIRCLING)\b/.test(u) || /-IAC-|-VAC-/.test(d)) return ['IAP', 'Approaches'];
  if (/MINIMUM/.test(u)) return ['MIN', 'Minimums'];
  return ['DAU', 'Other'];
}
/** shorter names in the list: the group says what kind of chart it is */
function eaName(name, group) {
  let n = name.replace(/\s*\(\s*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (group === 'Approaches') n = n.replace(/^INSTRUMENT APPROACH CHART\s*[-–:]?\s*(ICAO\s*[-–:]?\s*)?/i, '').replace(/^APPROACH CHART\s*[-–:]\s*/i, '');
  if (group === 'Departures') n = n.replace(/\bSTANDARD (INSTRUMENT )?DEPARTURE CHART\s*[-–:]?\s*(INSTRUMENT\s*)?(\(SID\)\s*)?[-–:]?\s*/i, '');
  if (group === 'Arrivals') n = n.replace(/\bSTANDARD (INSTRUMENT )?ARRIVAL CHART\s*[-–:]?\s*(INSTRUMENT\s*)?(\(STAR\)\s*)?[-–:]?\s*/i, '');
  n = n.replace(/\s*[-–]\s*ICAO\s*$/i, '').replace(/^ICAO\s*[-–]\s*/i, '').replace(/\s*[-–]\s*ICAO\s*[-–]\s*/i, ' – ');
  return n.trim() || name;
}
export function eaCharts(html, k) {
  const seg = section(html);
  if (!seg) return [];
  const R = EA[k], out = [], seen = new Set();
  let title = '';
  for (const m of seg.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = m[1], cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1]);
    const links = [...row.matchAll(/href\s*=\s*["']([^"']+?\.pdf)["']/gi)].map((x) => unent(x[1]))
      .filter((h) => !(R.skip && R.skip.test(h)));
    const first = cells.length ? text(cells[0]) : text(row);
    if (!links.length) { if (first && !/^(chart name|name of chart|page|side\/page)\b/i.test(first) && first.length > 2) title = first; continue; }
    /* the UK puts the name in a row of its own and the page reference (AD 2.EGLL-2-1) with the link in the next */
    const idLike = /^AD[\s-]?2[\s.-]/i.test(first);
    const name = idLike ? title : first;
    const id = idLike ? first : cells.length > 1 ? text(cells[1]) : '';
    for (const h of links.slice(-1)) {
      const file = h.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
      if (!/^(pdf|graphics)\/[^\s"'<>\\]{1,200}\.pdf$/i.test(file) || file.includes('..') || seen.has(file)) continue;
      seen.add(file);
      const nm = name || id.replace(/\s+\S*ACLO\S*/g, '').trim() || file.split('/').pop();
      const [code, group] = eaGroup(nm, id + ' ' + file);
      out.push({ code, group, name: eaName(nm, group), pdf: file, changed: false });
    }
  }
  return out;
}
/* "ENGM — OSLO / Gardermoen", the page's first line naming it */
const aptName = (html, icao) => {
  const t = unent(html.slice(0, 150_000).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '\n'));
  const m = t.match(new RegExp(icao + '(?:\\s*[—–]|\\s+-)\\s+([^\\n]{3,70})'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
};

/* ---------- the Charts list ---------- */
/** d: { edgeCache, kvStore(key, maxAge, fn, keep), cached(key, ttl, fn) } */
export async function eaChartsList(icao, env, me, d) {
  const k = eaRegion(icao);
  if (!k) return null;
  const R = EA[k], head = { src: 'ea', reg: k, label: R.label, host: R.host, aip: R.site || R.home, airport: { icao, name: '' } };
  if (!me) return { ...head, cycle: null, charts: [], notFound: true, signin: true };
  const { cur, next } = await edition(k, d), cycle = cycleOf(k, cur.eff);
  const v = await d.cached('ea4:' + cycle + ':' + icao, 6 * 3600_000, () => d.kvStore('eacharts:v4:' + cycle + ':' + icao, 7 * 86400_000, () => d.edgeCache(`ea/charts/v4/${cycle}/${icao}`, 86400, async () => {
    const r = await get(cur.base + R.page(icao), 86400);
    if (r.status === 404) return { airport: { icao, name: '' }, charts: [], notFound: true };
    if (!r.ok) throw new EaError(502, `${R.label}: the page for ${icao} answered HTTP ${r.status}`);
    const t = await r.text();
    if (notFoundPage(t)) return { airport: { icao, name: '' }, charts: [], notFound: true };
    const charts = eaCharts(t, k);
    return { airport: { icao, name: aptName(t, icao) }, charts, notFound: !charts.length };
  }), (x) => x && !x.notFound), (x) => x && !x.notFound);
  return { ...head, ...v, cycle, eff: cur.eff, from: cur.eff + 'T00:00:00.000Z', to: next ? next.eff + 'T00:00:00.000Z' : null,
    next: next ? { eff: next.eff } : null, aip: cur.base + cur.index };
}

/* ---------- one chart ---------- */
export async function eaChartPdf(url, env, h, me, d) {
  const cycle = url.searchParams.get('cycle') || '', file = url.searchParams.get('file') || '';
  const k = cycle.slice(0, 2), eff = cycle.length === 10 ? `${cycle.slice(2, 6)}-${cycle.slice(6, 8)}-${cycle.slice(8, 10)}` : '';
  const res = (body, status) => new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!EA[k] || !/^[A-Z]{2}\d{8}$/.test(cycle) || !/^(pdf|graphics)\/[^\s"'<>\\]{1,200}\.pdf$/i.test(file) || file.includes('..')) return res({ error: 'Invalid chart' }, 400);
  if (!me) return res({ error: 'Sign in to see ' + EA[k].label + ' charts' }, 401);
  const key = 'ea/' + cycle + '/' + file, ok = (body) => new Response(body, { status: 200, headers: { ...h, 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=86400', Vary: 'Authorization' } });
  if (env.CHARTS) { const o = await env.CHARTS.get(key).catch(() => null); if (o) return ok(o.body); }
  let ed = null;
  try { ed = (await editions(k, d)).find((e) => e.eff === eff); } catch (e) { return res({ error: e.message }, 502); }
  if (!ed) return res({ error: `That ${EA[k].label} edition is no longer listed. Open the chart list again.` }, 404);
  const r = await get(ed.base + file, 7 * 86400).catch((e) => ({ ok: false, status: 0, err: e }));
  if (!r.ok) return res({ error: `${EA[k].host} answered ${r.status ? 'HTTP ' + r.status : 'nothing'} for this chart` }, 502);
  const buf = await r.arrayBuffer();
  if (buf.byteLength < 5 || new TextDecoder().decode(new Uint8Array(buf, 0, 5)) !== '%PDF-') return res({ error: `${EA[k].host} did not send a PDF for this chart` }, 502);
  if (env.CHARTS && buf.byteLength <= PDF_MAX) { const p = env.CHARTS.put(key, buf, { httpMetadata: { contentType: 'application/pdf' } }).catch(() => {}); if (d.waitUntil) d.waitUntil(p); else await p; }
  return ok(buf);
}

/* the editions and lists of these airports, so the first pilot to open them doesn't wait (the 20-minute cron) */
export async function eaWarm(icaos, env, d) {
  for (const icao of icaos) { try { await eaChartsList(icao, env, { u: 'warm' }, d); } catch (e) { /* next run */ } }
}
