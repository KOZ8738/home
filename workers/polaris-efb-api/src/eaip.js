/* ---------- Charts from the eAIPs of Hong Kong, Singapore, the UK, Norway, Malaysia, Sweden, Finland, the Netherlands
   and Denmark (Nov 2026) ----------
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
   The Charts list: /api/efb/charts?icao=VHHH (cycle HK<yyyymmdd>), WS.. (SG), EG.. (UK), EN.. (NO), WM.. WBG. WBK. (MY);
   one chart: /api/efb/chart-pdf?cycle=HK20261029&file=pdf/VH-AD-2-VHHH-ADC-1.pdf (graphics/<n>.pdf for the UK, Norway
   and Malaysia).
     Malaysia (CAAM)    https://aip.caam.gov.my/aip/eAIP/history-en-MS.html, then <eff>[-AIRAC]/html/eAIP/WM-AD-2.WMKK-en-MS.html,
                        PDFs in graphics/ (the same layout as the UK's and Norway's)

   Sweden, Finland and the Netherlands ("ix": the three use the same eAIP software, another layout):
     Sweden (LFV)       https://aro.lfv.se/content/eaip/default_offline.html
     Finland (Fintraffic) https://www.ais.fi/eaip/
     Netherlands (LVNL) https://eaip.lvnl.nl/
   Each front page lists the editions as "<name>_yyyy_mm_dd\index.html" (a folder named for the effective date). An
   aerodrome's AD 2 is several pages named with its city ("ES-AD 2 ESSA STOCKHOLM-ARLANDA 1-en-GB.html"), so the names
   come from the edition's eAIP/menu.html (several MB: read once per edition and kept in KV). Page 1 holds every chart
   of the aerodrome, one table row each: its name, then a link to its own PDF under documents/ (cycle SE…, FI…, NL…).

   Denmark, the Faroe Islands and Greenland (Naviair AIM, https://aim.naviair.dk/): no eAIP, a file tree the site reads
   from /umbraco/api/naviairapi/getnodesforparent?parentId=<id> (AIP Danmark › AIP PART 3 (AD) › AD 2 AERODROMES ›
   "København Kastrup - EKCH" › one PDF per chart, its title "64. EKCH ILS or LOC RWY 04L - 1"). Only the charts in force
   are listed; each file has its own address (/media/files/<id>/…), so a new one gets a new address. Cycle DK<the AIRAC
   date>, file media/files/<id>/<name>.pdf. */

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
    page: (i) => `html/eAIP/VH-AD-2-${i}-en-US.html`, enr: (n) => `html/eAIP/VH-ENR-${n}-en-US.html`,
  },
  SG: {
    apt: /^WS[A-Z]{2}$/, label: 'AIP Singapore', host: 'CAAS AIM-SG', home: 'https://aim-sg.caas.gov.sg/aip/',
    eds: (t) => [...t.matchAll(/aim-content\/uploads\/aip\/([^/"'<>\s]+)\/AIP\/(\d{4}-\d{2}-\d{2})-000000\/html\/index-en-GB\.html/g)].map((m) => ({ eff: m[2], pub: m[1], base: `https://aim-sg.caas.gov.sg/aim-content/uploads/aip/${m[1]}/AIP/${m[2]}-000000/`, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/SG-AD-2-${i}-en-GB.html`, enr: (n) => `html/eAIP/SG-ENR-${n}-en-GB.html`,
    skip: /\/old\//,
  },
  UK: {
    apt: /^EG[A-Z]{2}$/, label: 'UK AIP', host: 'NATS eAIP', home: 'https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/',
    eds: (t) => [...t.matchAll(/aurora\.nats\.co\.uk\/htmlAIP\/Publications\/(\d{4}-\d{2}-\d{2})-AIRAC\/html\/index-en-GB\.html/g)].map((m) => ({ eff: m[1], pub: m[1], base: `https://www.aurora.nats.co.uk/htmlAIP/Publications/${m[1]}-AIRAC/`, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/EG-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/EG-ENR-${n}-en-GB.html`,
  },
  MY: {
    apt: /^(WM[A-Z]{2}|WB[GK][A-Z])$/, label: 'AIP Malaysia', host: 'CAAM eAIP', home: 'https://aip.caam.gov.my/aip/eAIP/history-en-MS.html',
    eds: (t, at) => [...t.matchAll(/["'/]((\d{4}-\d{2}-\d{2})(?:-AIRAC)?)\/html\/index-en-MS\.html/g)].map((m) => ({ eff: m[2], pub: m[1], base: new URL(m[1] + '/', at).href, index: 'html/index-en-MS.html' })),
    page: (i) => `html/eAIP/WM-AD-2.${i}-en-MS.html`, enr: (n) => `html/eAIP/WM-ENR-${n}-en-MS.html`,
  },
  SE: { kind: 'ix', apt: /^ES[A-Z]{2}$/, label: 'AIP Sweden', host: 'LFV eAIP', home: 'https://aro.lfv.se/content/eaip/default_offline.html', idx: 'index-v2.html' },
  FI: { kind: 'ix', apt: /^EF[A-Z]{2}$/, label: 'AIP Finland', host: 'Fintraffic eAIP', home: 'https://www.ais.fi/eaip/', idx: 'index.html' },
  NL: { kind: 'ix', apt: /^EH[A-Z]{2}$/, label: 'AIP Netherlands', host: 'LVNL eAIP', home: 'https://eaip.lvnl.nl/', idx: 'index.html' },
  DK: { kind: 'dk', apt: /^(EK|BG)[A-Z]{2}$/, label: 'AIP Denmark', host: 'Naviair AIM', home: 'https://aim.naviair.dk/' },
  NO: {
    apt: /^EN[A-Z]{2}$/, label: 'AIP Norway', host: 'Avinor eAIP', home: 'https://aim-prod.avinor.no/no/AIP/',
    /* relative to the history page the front page goes on to */
    eds: (t, at) => [...t.matchAll(/["'/]((\d{4}-\d{2}-\d{2})-AIRAC)\/html\/index-(?:no-NO|en-GB)\.html/g)].map((m) => ({ eff: m[2], pub: m[2], base: new URL(m[1] + '/', at).href, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/EN-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/EN-ENR-${n}-en-GB.html`,
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
    for (const e of (R.eds || ixEds(R))(t, r.url || R.home)) { const o = by.get(e.eff); if (!o || e.pub > o.pub) by.set(e.eff, e); }
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
/* an address made of names with spaces ("AIRAC AMDT 11-2026_2026_10_29/eAIP/EH-AD 2 EHAM 1-en-GB.html"), each part escaped once */
const encPath = (p) => String(p).split('/').map((x) => { try { return encodeURIComponent(decodeURIComponent(x)); } catch (e) { return encodeURIComponent(x); } }).join('/');

/* ---------- Sweden, Finland, the Netherlands ("ix") ---------- */
/** the editions on the front page: "AIRAC AMDT 11-2026_2026_10_29\index.html" */
const ixEds = (R) => (t, at) => [...t.matchAll(/href\s*=\s*["']([^"'<>]*?_(\d{4})_(\d{2})_(\d{2}))[\\/]index[^"'<>]*?\.html["']/gi)].map((m) => {
  const folder = m[1].replace(/\\/g, '/'), eff = `${m[2]}-${m[3]}-${m[4]}`;
  return { eff, pub: folder, base: new URL(encPath(folder) + '/', at).href, index: R.idx || 'index.html' };
});
/** each aerodrome's first AD 2 page, and the ENR 4.1 / 4.4 pages, from the edition's menu (several MB, read as it comes) */
export function ixMenu(t) {
  const pages = {}, enr = {};
  for (const m of t.matchAll(/href\s*=\s*["']([A-Z]{2}-AD 2 ([A-Z]{4})\b[^"'#<>]*?) 1-[a-z]{2}-[A-Z]{2}\.html/g)) if (!pages[m[2]]) pages[m[2]] = m[1] + ' 1-en-GB.html';
  for (const m of t.matchAll(/href\s*=\s*["']([A-Z]{2}-ENR 4\.([14]))-[a-z]{2}-[A-Z]{2}\.html/g)) if (!enr[m[2]]) enr[m[2]] = m[1] + '-en-GB.html';
  return { pages, enr };
}
async function ixMenuOf(k, cur, d) {
  return d.kvStore('eaixmenu:v1:' + cycleOf(k, cur.eff), 40 * 86400_000, async () => {
    const r = await get(cur.base + 'eAIP/menu.html', 86400);
    if (!r.ok) throw new EaError(502, `${EA[k].label}: the eAIP's menu answered HTTP ${r.status}`);
    return ixMenu(await r.text());
  }, (v) => v && v.pages && Object.keys(v.pages).length > 2);
}
/** page 1 of an aerodrome: every row with a PDF is a chart, its name in the first cell */
export function ixCharts(html) {
  const out = [], seen = new Set();
  for (const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = m[1], links = [...row.matchAll(/href\s*=\s*["']([^"']+?\.pdf)["']/gi)].map((x) => unent(x[1]));
    if (!links.length) continue;
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1])).filter(Boolean);
    const file = links[links.length - 1].replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
    if (!/^documents\/[^"'<>\\?#]{1,300}\.pdf$/i.test(file) || file.includes('..') || seen.has(file)) continue;
    seen.add(file);
    const nm = (cells[0] || decodeURIComponent(file.split('/').pop()).replace(/\.pdf$/i, '')).replace(/\s+/g, ' ').trim();
    const [code, group] = eaGroup(nm, file);
    out.push({ code, group, name: eaName(nm, group), pdf: file, changed: false });
  }
  return out;
}

/* ---------- Denmark, the Faroe Islands, Greenland (Naviair AIM) ---------- */
const DK_API = 'https://aim.naviair.dk/umbraco/api/naviairapi/getnodesforparent?parentId=';
async function dkNodes(id) {
  const r = await get(DK_API + id, 1800);
  if (!r.ok) throw new EaError(502, `Naviair AIM answered HTTP ${r.status}`);
  const j = await r.json().catch(() => null);
  if (!Array.isArray(j)) throw new EaError(502, 'Naviair AIM sent no list');
  return j;
}
/** the AIRAC date now in force (cycles start every 28 days from 25 Jan 2024) */
const airacEff = (t = Date.now()) => { const ref = Date.UTC(2024, 0, 25), p = 28 * 86400_000; return new Date(ref + Math.floor((t - ref) / p) * p).toISOString().slice(0, 10); };
/** ICAO -> { id, aip, name } for every aerodrome in AD 2 of the three AIPs */
async function dkAirports(d) {
  return d.kvStore('eadk:apts:v1', 86400_000, async () => {
    const out = {}, roots = (await dkNodes('')).filter((n) => /^AIP (Danmark|Færøerne|Grønland)$/i.test(String(n.name || '').trim()));
    for (const root of roots) {
      const aip = /Grønland/i.test(root.name) ? 'AIP Greenland' : /Færøerne/i.test(root.name) ? 'AIP Faroe Islands' : 'AIP Denmark';
      const part = (await dkNodes(root.id)).find((n) => /\(AD\)\s*$/.test(n.name || ''));
      if (!part) continue;
      const ad2 = (await dkNodes(part.id)).find((n) => /^AD 2\b/.test(n.name || ''));
      if (!ad2) continue;
      for (const a of await dkNodes(ad2.id)) {
        const m = String(a.name || '').match(/\b((?:EK|BG)[A-Z]{2})\b/);
        if (m && a.isDir !== false && !out[m[1]]) out[m[1]] = { id: a.id, aip, name: String(a.name).replace(/\s*[-–(]\s*(EK|BG)[A-Z]{2}\)?\s*/, ' ').replace(/\s+/g, ' ').trim() };
      }
    }
    return { apts: out };
  }, (v) => v && v.apts && Object.keys(v.apts).length > 5);
}
async function dkChartsList(icao, head, d) {
  const eff = airacEff(), cycle = 'DK' + eff.replace(/-/g, ''), A = (await dkAirports(d)).apts[icao];
  if (!A) return { ...head, cycle, eff, charts: [], notFound: true };
  const v = await d.cached('eadk:' + icao, 3 * 3600_000, () => d.kvStore('eadk:charts:v1:' + icao, 12 * 3600_000, async () => {
    const now = Date.now(), by = new Map();
    for (const n of await dkNodes(A.id)) {
      const href = String(n.href || '');
      if (n.isDir || !/^\/media\/files\/[a-z0-9]{4,24}\/[^"'<>\\?#]{1,200}\.pdf$/i.test(href)) continue;
      if (n.publishAt && Date.parse(n.publishAt) > now) continue;
      if (n.unpublishAt && Date.parse(n.unpublishAt) <= now) continue;
      /* "64. EKCH ILS or LOC RWY 04L - 1 (CAT I+II)", else the file's own name */
      let nm = String(n.title || '').replace(/^\s*\d+\.\s*/, '').replace(new RegExp('^' + icao + '\\s*'), '').replace(/\s+/g, ' ').trim();
      if (!nm) nm = String(n.name || '').replace(/\.pdf$/i, '').replace(new RegExp('^(EK|BG)_AD_2_' + icao + '_?'), '').replace(/_(en|da)$/i, '').replace(/_/g, ' ').trim();
      if (/^text$/i.test(nm) || !nm) nm = 'Aerodrome information (AD 2 text)';
      if (!by.has(nm)) by.set(nm, href.slice(1));
    }
    const charts = [...by].map(([nm, file]) => { const [code, group] = eaGroup(nm, file); return { code, group, name: eaName(nm, group), pdf: file, changed: false }; });
    return { airport: { icao, name: A.name }, charts, notFound: !charts.length };
  }, (x) => x && !x.notFound));
  return { ...head, label: A.aip, ...v, cycle, eff, from: eff + 'T00:00:00.000Z', to: null, next: null };
}

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
  if (/AERODROME( ?\/ ?HELIPORT)? CHART|AIRPORT CHART|AERODROME LAYOUT|AIRPORT DIAGRAM/.test(u) && !/OBSTACLE/.test(u)) return ['APD', 'Airport diagram'];
  if (/PARKING|DOCKING|GROUND MOVEMENT|TAXI|HOT ?SPOT|PUSH ?BACK|INTERSECTION TAKE|\bSTANDS?\b|DE-?ICING/.test(u) || /-(?:PBP|GMC|APDC)-/.test(d)) return ['HOT', 'Hot spots'];
  if (/\bSID\b|DEPARTURE/.test(u) || /-SID-/.test(d)) return ['DP', 'Departures'];
  if (/\bSTAR\b|ARRIVAL/.test(u) || /-STAR-/.test(d)) return ['STR', 'Arrivals'];
  if (/OBSTACLE|TERRAIN|\bAOC\b|PATC|ATOC/.test(u)) return ['DAU', 'Other'];
  if (/INSTRUMENT APPROACH|INITIAL APPROACH|APPROACH CHART|TRANSITION|^(ILS|LOC|LLZ|RNP|RNAV|GNSS|GLS|VOR|NDB|DME|TACAN|LDA|SRA|PAR|VISUAL|CIRCLING)\b/.test(u) || /-IAC-|-VAC-/.test(d)) return ['IAP', 'Approaches'];
  if (/MINIMUM/.test(u)) return ['MIN', 'Minimums'];
  /* short chart codes (Sweden, Finland, the Netherlands, Denmark): "ADC", "GMC - 2", "IAC 06 ILS LOC", file EHAM-IAC-06-ILS-LOC.pdf */
  const c = u + ' ' + d.replace(/[-_./]/g, ' ');
  if (/\bA?DC\b/.test(c) && !/\bAPDC\b/.test(u)) return ['APD', 'Airport diagram'];
  if (/\b(APDC|A?GMC|PDC)\b/.test(c)) return ['HOT', 'Hot spots'];
  if (/\b(IAC|VAC|TRAN|ILS|LOC|RNP|RNAV)\b/.test(u) || /\b(IAC|VAC|TRAN)\b/.test(c)) return ['IAP', 'Approaches'];
  return ['DAU', 'Other'];
}
/** shorter names in the list: the group says what kind of chart it is */
export function eaName(name, group) {
  let n = name.replace(/\s*\(\s*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (group === 'Approaches') n = n.replace(/^INSTRUMENT APPROACH CHART\s*[-–:]?\s*(ICAO\s*[-–:]?\s*)?/i, '').replace(/^APPROACH CHART\s*[-–:]\s*/i, '');
  if (group === 'Departures') n = n.replace(/\bSTANDARD (INSTRUMENT )?DEPARTURE CHART\s*[-–:]?\s*(INSTRUMENT\s*)?(\(SID\)\s*)?[-–:]?\s*/i, '');
  if (group === 'Arrivals') n = n.replace(/\bSTANDARD (INSTRUMENT )?ARRIVAL CHART\s*[-–:]?\s*(INSTRUMENT\s*)?(\(STAR\)\s*)?[-–:]?\s*/i, '');
  /* Sweden: "IAC - ICAO ILS or LOC RWY 19L", "SID - ICAO RNAV SID RWY 26 - ARS 4K…" */
  n = n.replace(/^(IAC|VAC|SID|STAR)\s*[-–]\s*ICAO\s+/i, (m, c) => (/^(SID|STAR)$/i.test(c) && !new RegExp('\\b' + c + '\\b', 'i').test(n.slice(m.length)) ? c.toUpperCase() + ' ' : ''));
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
  if (R.kind === 'dk') return dkChartsList(icao, head, d);
  const { cur, next } = await edition(k, d), cycle = cycleOf(k, cur.eff);
  const v = await d.cached('ea4:' + cycle + ':' + icao, 6 * 3600_000, () => d.kvStore('eacharts:v4:' + cycle + ':' + icao, 7 * 86400_000, () => d.edgeCache(`ea/charts/v4/${cycle}/${icao}`, 86400, async () => {
    let pg = R.page ? R.page(icao) : null;
    if (R.kind === 'ix') { const mn = await ixMenuOf(k, cur, d); pg = mn.pages[icao] ? 'eAIP/' + encPath(mn.pages[icao]) : null; }
    if (!pg) return { airport: { icao, name: '' }, charts: [], notFound: true };
    const r = await get(cur.base + pg, 86400);
    if (r.status === 404) return { airport: { icao, name: '' }, charts: [], notFound: true };
    if (!r.ok) throw new EaError(502, `${R.label}: the page for ${icao} answered HTTP ${r.status}`);
    const t = await r.text();
    if (notFoundPage(t)) return { airport: { icao, name: '' }, charts: [], notFound: true };
    const charts = R.kind === 'ix' ? ixCharts(t) : eaCharts(t, k);
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
  const R = EA[k], fileOk = !R ? false : R.kind === 'ix' ? /^documents\/[^"'<>\\?#]{1,300}\.pdf$/i.test(file) : R.kind === 'dk' ? /^media\/files\/[a-z0-9]{4,24}\/[^"'<>\\?#/]{1,200}\.pdf$/i.test(file)
    : /^(pdf|graphics)\/[^\s"'<>\\]{1,200}\.pdf$/i.test(file);
  if (!R || !/^[A-Z]{2}\d{8}$/.test(cycle) || !fileOk || file.includes('..')) return res({ error: 'Invalid chart' }, 400);
  if (!me) return res({ error: 'Sign in to see ' + EA[k].label + ' charts' }, 401);
  const key = 'ea/' + cycle + '/' + file, ok = (body) => new Response(body, { status: 200, headers: { ...h, 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=86400', Vary: 'Authorization' } });
  if (env.CHARTS) { const o = await env.CHARTS.get(key).catch(() => null); if (o) return ok(o.body); }
  let ed = null;
  /* Denmark: one address per file, no editions */
  if (R.kind === 'dk') ed = { base: R.home };
  else {
    try { ed = (await editions(k, d)).find((e) => e.eff === eff); } catch (e) { return res({ error: e.message }, 502); }
    if (!ed) return res({ error: `That ${EA[k].label} edition is no longer listed. Open the chart list again.` }, 404);
  }
  const r = await get(ed.base + encPath(file), 7 * 86400).catch((e) => ({ ok: false, status: 0, err: e }));
  if (!r.ok) return res({ error: `${EA[k].host} answered ${r.status ? 'HTTP ' + r.status : 'nothing'} for this chart` }, 502);
  const buf = await r.arrayBuffer();
  if (buf.byteLength < 5 || new TextDecoder().decode(new Uint8Array(buf, 0, 5)) !== '%PDF-') return res({ error: `${EA[k].host} did not send a PDF for this chart` }, 502);
  if (env.CHARTS && buf.byteLength <= PDF_MAX) { const p = env.CHARTS.put(key, buf, { httpMetadata: { contentType: 'application/pdf' } }).catch(() => {}); if (d.waitUntil) d.waitUntil(p); else await p; }
  return ok(buf);
}

/* ---------- named points with their coordinates, for lining charts up on the Map (the EFB's autogeo.js) ----------
   From the same edition: ENR 4.4 (significant points: RIVMI, LAM…), ENR 4.1 (navaids: ADN, LAM…), and the airport's AD 2
   page (its ARP, runway thresholds as 07R…, navaids such as the ILS ITFC, stands). Each table row with coordinates gives
   the name in the cell before them. The country's ENR points are kept per edition; an airport gets those within
   300 km of its ARP with its own. GET /api/efb/chart-fixes?icao=VHHH -> { icao, cycle, arp: [lat, lon], pts: [[name, lat, lon]] } */
const COORD = /(\d{2})(\d{2})(\d{2}(?:[.,]\d+)?)\s*([NS])[\s,/]{0,3}(\d{3})(\d{2})(\d{2}(?:[.,]\d+)?)\s*([EW])/g;
const dms = (d, m, s, h) => { const v = +d + +m / 60 + parseFloat(String(s).replace(',', '.')) / 3600; return /[SW]/.test(h) ? -v : v; };
const NOT_ID = new Set(['VOR', 'DME', 'NDB', 'ILS', 'LOC', 'LLZ', 'GP', 'TACAN', 'VORTAC', 'DVOR', 'MHZ', 'KHZ', 'H24', 'HO', 'HX', 'NIL', 'CH', 'RWY', 'THR', 'ARP', 'MM', 'OM', 'IM', 'MKR', 'FL', 'FT', 'GND', 'SFC', 'UNL', 'REF', 'AD', 'ENR', 'RNP', 'RNAV', 'GNSS', 'IAF', 'IF', 'FAF', 'MAPT', 'SID', 'STAR', 'IAC', 'ATS', 'FIR', 'TMA', 'CTR', 'CTA', 'ATZ', 'MSL', 'AGL', 'RMK', 'NM', 'KM', 'ASPH', 'CONC', 'GRASS', 'PCN', 'TWY', 'APN', 'TBN', 'EST', 'END', 'BTN',
  /* obstacle and lighting words in the AD 2 tables */
  'LGTD', 'UNLGTD', 'LIGHTED', 'LIGHT', 'NO', 'YES', 'TREE', 'TREES', 'MAST', 'BLDG', 'TOWER', 'CRANE', 'POLE', 'POLES', 'PYLON', 'CHIMNEY', 'ANTENNA', 'AERIAL', 'HILL', 'TERRAIN', 'SPIRE', 'OBST', 'WGS', 'ELEV', 'HGT', 'AMSL', 'NIL', 'MAG', 'TRUE', 'DEG', 'ACFT', 'TWR', 'APP', 'ATIS', 'ACC', 'FIS']);
/* a point's name; not a DME channel (CH34X) */
const isId = (t) => (/^[A-Z][A-Z0-9]{1,5}$/.test(t) && !NOT_ID.has(t) && !/^CH\d{1,3}[XY]$/.test(t)) || /^(0[1-9]|[12]\d|3[0-6])[LCR]?$/.test(t);
/* the aerodrome reference point on an AD 2 page: the first coordinates after "ARP" (else the page's first) */
export function eaArp(html) {
  const plain = text(String(html || '').slice(0, 400_000)), i = plain.search(/\bARP\b/), c = [...plain.slice(Math.max(0, i)).matchAll(COORD)][0] || [...plain.matchAll(COORD)][0];
  return c ? [+dms(c[1], c[2], c[3], c[4]).toFixed(6), +dms(c[5], c[6], c[7], c[8]).toFixed(6)] : null;
}
export const eaKm = (a, b, c, d) => km(a, b, c, d);
export function eaPoints(html) {
  const out = [];
  for (const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1]));
    if (cells.length < 2) continue;
    let name = '', used = false;
    for (const cell of cells) {
      const k = cell.replace(/[#*†]+$/, '').trim();
      if (isId(k)) { name = k; used = false; continue; }
      if (!name || used) continue;
      const c = [...cell.matchAll(COORD)][0];
      if (!c) continue;
      const la = dms(c[1], c[2], c[3], c[4]), lo = dms(c[5], c[6], c[7], c[8]);
      if (!(Math.abs(la) <= 90 && Math.abs(lo) <= 180)) continue;
      out.push([name, +la.toFixed(6), +lo.toFixed(6)]); used = true;
    }
  }
  return out;
}
const km = (a, b, c, d) => { const r = Math.PI / 180, h = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(h))); };
export async function eaFixes(icao, env, me, d) {
  const k = eaRegion(icao);
  if (!k) return null;
  if (!me) return { icao, signin: true, pts: [] };
  if (EA[k].kind === 'dk') return { icao, pts: [] };
  const R = EA[k], { cur } = await edition(k, d), cycle = cycleOf(k, cur.eff);
  let mn = null; if (R.kind === 'ix') { try { mn = await ixMenuOf(k, cur, d); } catch (e) { return { icao, cycle, arp: null, pts: [] }; } }
  const enrPage = (n) => mn ? (mn.enr[n === '4.4' ? '4' : '1'] ? 'eAIP/' + encPath(mn.enr[n === '4.4' ? '4' : '1']) : null) : R.enr(n);
  const adPage = mn ? (mn.pages[icao] ? 'eAIP/' + encPath(mn.pages[icao]) : null) : R.page(icao);
  const page = async (u) => { const r = await get(cur.base + u, 86400); if (!r.ok) throw new EaError(502, `${R.label}: ${u.split('/').pop()} answered HTTP ${r.status}`); const t = await r.text(); return notFoundPage(t) ? '' : t; };
  const enr = await d.kvStore('eafix:v2:' + cycle, 30 * 86400_000, async () => {
    const pts = [];
    for (const n of ['4.4', '4.1']) { try { const u = enrPage(n); if (u) pts.push(...eaPoints(await page(u))); } catch (e) { /* the other page still counts */ } }
    return { pts };
  }, (v) => v && v.pts && v.pts.length > 20);
  const ad = await d.kvStore('eafixad:v2:' + cycle + ':' + icao, 30 * 86400_000, async () => {
    const t = adPage ? await page(adPage) : '';
    if (!t) return { arp: null, pts: [] };
    return { arp: eaArp(t), pts: eaPoints(t) };
  }, (v) => v && v.arp);
  const arp = ad.arp, near = arp ? (enr.pts || []).filter((p) => km(arp[0], arp[1], p[1], p[2]) <= 300) : [];
  return { icao, cycle, arp, pts: [...ad.pts, ...near] };
}

/* the editions and lists of these airports, so the first pilot to open them doesn't wait (the 20-minute cron) */
export async function eaWarm(icaos, env, d) {
  for (const icao of icaos) { try { await eaChartsList(icao, env, { u: 'warm' }, d); } catch (e) { /* next run */ } }
}
