/* ---------- Charts from the eAIPs of Hong Kong, Singapore, the UK, Norway, Malaysia, Sweden, Finland, the Netherlands,
   Denmark, Korea, Estonia, Iceland, Latvia, Spain, Ireland, Czech Republic, Belgium/Luxembourg, Hungary, Serbia/Montenegro,
   Poland, France, Portugal, Bosnia and Herzegovina, Austria, Albania and Kosovo (Nov 2026) ----------
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

/** one fixed folder replaced at each amendment: its cover page names the date ("Effective date: 29 OCT 2026", "EFFECTIVE DATE 01-OCT-2026") */
const coverEds = (base, index) => (t) => {
  const m = String(t).replace(/<[^>]+>/g, ' ').match(/Effective\s+date\s*:?\s*(\d{1,2})[\s-]+([A-Z]{3})[A-Z]*[\s-]+(\d{4})/i), mo = m && MON[m[2].toUpperCase()];
  return mo ? [{ eff: `${m[3]}-${mo}-${m[1].padStart(2, '0')}`, pub: m[0], base, index }] : [];
};
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
export const EA = {
  HK: {
    country: 'Hong Kong and Macau', pre: 'VHxx, VMxx', test: 'VHHH', apt: /^V[HM][A-Z]{2}$/, label: 'AIP Hong Kong', host: 'CAD eAIP', site: 'https://www.ais.gov.hk/',
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
    country: 'Singapore', pre: 'WSxx', test: 'WSSS', apt: /^WS[A-Z]{2}$/, label: 'AIP Singapore', host: 'CAAS AIM-SG', home: 'https://aim-sg.caas.gov.sg/aip/',
    eds: (t) => [...t.matchAll(/aim-content\/uploads\/aip\/([^/"'<>\s]+)\/AIP\/(\d{4}-\d{2}-\d{2})-000000\/html\/index-en-GB\.html/g)].map((m) => ({ eff: m[2], pub: m[1], base: `https://aim-sg.caas.gov.sg/aim-content/uploads/aip/${m[1]}/AIP/${m[2]}-000000/`, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/SG-AD-2-${i}-en-GB.html`, enr: (n) => `html/eAIP/SG-ENR-${n}-en-GB.html`,
    skip: /\/old\//,
  },
  UK: {
    country: 'United Kingdom', pre: 'EGxx', test: 'EGLL', apt: /^EG[A-Z]{2}$/, label: 'UK AIP', host: 'NATS eAIP', home: 'https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/',
    eds: (t) => [...t.matchAll(/aurora\.nats\.co\.uk\/htmlAIP\/Publications\/(\d{4}-\d{2}-\d{2})-AIRAC\/html\/index-en-GB\.html/g)].map((m) => ({ eff: m[1], pub: m[1], base: `https://www.aurora.nats.co.uk/htmlAIP/Publications/${m[1]}-AIRAC/`, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/EG-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/EG-ENR-${n}-en-GB.html`,
  },
  MY: {
    country: 'Malaysia', pre: 'WMxx, WBGx, WBKx', test: 'WMKK', apt: /^(WM[A-Z]{2}|WB[GK][A-Z])$/, label: 'AIP Malaysia', host: 'CAAM eAIP', home: 'https://aip.caam.gov.my/aip/eAIP/history-en-MS.html',
    eds: (t, at) => [...t.matchAll(/["'/]((\d{4}-\d{2}-\d{2})(?:-AIRAC)?)\/html\/index-en-MS\.html/g)].map((m) => ({ eff: m[2], pub: m[1], base: new URL(m[1] + '/', at).href, index: 'html/index-en-MS.html' })),
    page: (i) => `html/eAIP/WM-AD-2.${i}-en-MS.html`, enr: (n) => `html/eAIP/WM-ENR-${n}-en-MS.html`,
  },
  SE: { country: 'Sweden', pre: 'ESxx', test: 'ESSA', kind: 'ix', apt: /^ES[A-Z]{2}$/, label: 'AIP Sweden', host: 'LFV eAIP', home: 'https://aro.lfv.se/content/eaip/default_offline.html', idx: 'index-v2.html' },
  FI: { country: 'Finland', pre: 'EFxx', test: 'EFHK', kind: 'ix', apt: /^EF[A-Z]{2}$/, label: 'AIP Finland', host: 'Fintraffic eAIP', home: 'https://www.ais.fi/eaip/', idx: 'index.html' },
  NL: { country: 'Netherlands', pre: 'EHxx', test: 'EHAM', kind: 'ix', apt: /^EH[A-Z]{2}$/, label: 'AIP Netherlands', host: 'LVNL eAIP', home: 'https://eaip.lvnl.nl/', idx: 'index.html' },
  DK: { country: 'Denmark, Faroe Islands, Greenland', pre: 'EKxx, BGxx', test: 'EKCH', kind: 'dk', apt: /^(EK|BG)[A-Z]{2}$/, label: 'AIP Denmark', host: 'Naviair AIM', home: 'https://aim.naviair.dk/' },
  NO: {
    country: 'Norway', pre: 'ENxx', test: 'ENGM', apt: /^EN[A-Z]{2}$/, label: 'AIP Norway', host: 'Avinor eAIP', home: 'https://aim-prod.avinor.no/no/AIP/',
    /* relative to the history page the front page goes on to */
    eds: (t, at) => [...t.matchAll(/["'/]((\d{4}-\d{2}-\d{2})-AIRAC)\/html\/index-(?:no-NO|en-GB)\.html/g)].map((m) => ({ eff: m[2], pub: m[2], base: new URL(m[1] + '/', at).href, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/EN-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/EN-ENR-${n}-en-GB.html`,
  },
  IS: {
    country: 'Iceland', pre: 'BIxx', test: 'BIKF', kind: 'ix', apt: /^BI[A-Z]{2}$/, label: 'AIP Iceland', host: 'Avians eAIP', home: 'https://eaip.avians.is/',
    /* the front page links each edition's folder ("https://eaip.avians.is/A_11-2026_2026_11_26/"), some still on the old eaip.isavia.is */
    eds: (t, at) => [...t.matchAll(/href\s*=\s*["']((?:https?:\/\/eaip\.(?:avians|isavia)\.is\/)?([^"'<>\/\\]*?_(\d{4})_(\d{2})_(\d{2})))\/?(?:index[^"'<>]*?\.html)?["']/gi)]
      .map((m) => ({ eff: `${m[3]}-${m[4]}-${m[5]}`, pub: m[2], base: new URL(m[1] + '/', at).href, index: '' })),
  },
  LV: {
    country: 'Latvia', pre: 'EVxx', test: 'EVRA', apt: /^EV[A-Z]{2}$/, label: 'AIP Latvia', host: 'LGS eAIP', home: 'https://ais.lgs.lv/aiseaip',
    /* "eAIPfiles/2026_008_26-NOV-2026/data/2026-11-26/html/index.html"; a Non-AIRAC issue on the same date is the final one
       for it ("incorporates the changes from the previously issued AIRAC AIP AMDT"), so it wins */
    eds: (t) => [...t.matchAll(/eAIPfiles\/([A-Za-z0-9_\-]+)\/data\/(\d{4}-\d{2}-\d{2})\/html\/index(?:-en-GB)?\.html/g)]
      .map((m) => ({ eff: m[2], pub: (/Non-AIRAC/i.test(m[1]) ? '1' : '0') + m[1], base: `https://ais.lgs.lv/eAIPfiles/${m[1]}/data/${m[2]}/`, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/EV-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/EV-ENR-${n}-en-GB.html`,
    charts: (t, icao) => lvCharts(t, icao),
  },
  IE: {
    country: 'Ireland', pre: 'EIxx', test: 'EIDW', apt: /^EI[A-Z]{2}$/, label: 'AIP Ireland', host: 'AirNav Ireland eAIP', home: 'https://www.airnav.ie/air-traffic-management/aeronautical-information-management',
    /* the AIM page links each issue: "AIRAC_OCT_2026_2/2026-10-29-AIRAC/html/index.html", once "26-07-09-AIRAC" */
    eds: (t) => [...t.matchAll(/https?:\/\/www\.airnav\.ie\/([A-Za-z0-9_\-]+)\/((?:20)?(\d{2})-(\d{2})-(\d{2}))-AIRAC\/html\/index(?:-en-[A-Z]{2})?\.html/g)]
      .map((m) => ({ eff: `20${m[3]}-${m[4]}-${m[5]}`, pub: m[1], base: `https://www.airnav.ie/${m[1]}/${m[2]}-AIRAC/`, index: 'html/index.html' })),
    page: (i) => `html/eAIP/EI-AD-2.${i}-en-IE.html`, enr: (n) => `html/eAIP/EI-ENR-${n}-en-IE.html`,
  },
  ES: {
    country: 'Spain', pre: 'LExx, GCxx, GExx', test: 'LEMD', kind: 'es', fixed: true, apt: /^(LE|GC|GE)[A-Z]{2}$/, label: 'AIP Spain', host: 'ENAIRE AIP', home: 'https://aip.enaire.es/AIP/AIP-en.html',
    /* no edition folders: one page lists every chart of the country, each PDF at a fixed address replaced in place;
       the page's date ("29-OCT-26 (Incorporados AIRAC 10/26 and AMDT 412/26)") names the edition */
    eds: (t) => { const m = t.match(/(\d{2})-([A-Z]{3})-(\d{2})\s*\(\s*Incorporad/i), mo = m && MON[m[2].toUpperCase()];
      return mo ? [{ eff: `20${m[3]}-${mo}-${m[1]}`, pub: m[0], base: 'https://aip.enaire.es/AIP/', index: 'AIP-en.html' }] : []; },
    list: () => 'AIP-en.html', page: (i) => `contenido_AIP/AD/AD2/${i}/LE_AD_2_${i}_en.html`, enr: (n) => `contenido_AIP/ENR/LE_ENR_${n.replace('.', '_')}_en.html`,
    charts: (t, icao) => esCharts(t, icao), name: (t, icao) => esName(t, icao),
  },
  CZ: {
    country: 'Czech Republic', pre: 'LKxx', test: 'LKPR', apt: /^LK[A-Z]{2}$/, label: 'AIP Czech Republic', host: 'ANS CR eAIP', site: 'https://aim.rlp.cz/',
    home: 'https://aim.rlp.cz/eaip/html/LK-cover-en-GB.html', fixed: true, eds: coverEds('https://aim.rlp.cz/eaip/', 'html/index-en-GB.html'),
    page: (i) => `html/eAIP/LK-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/LK-ENR-${n}-en-GB.html`,
  },
  BE: {
    country: 'Belgium and Luxembourg', pre: 'EBxx, ELxx', test: 'EBBR', apt: /^(EB|EL)[A-Z]{2}$/, label: 'AIP Belgium and Luxembourg', host: 'skeyes eAIP', site: 'https://ops.skeyes.be/',
    home: 'https://ops.skeyes.be/html/belgocontrol_static/eaip/eAIP_Main/html/EB-cover-en-GB.html', fixed: true,
    eds: coverEds('https://ops.skeyes.be/html/belgocontrol_static/eaip/eAIP_Main/', 'html/index-en-GB.html'),
    page: (i) => `html/eAIP/EB-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/EB-ENR-${n}-en-GB.html`,
  },
  HU: {
    country: 'Hungary', pre: 'LHxx', test: 'LHBP', apt: /^LH[A-Z]{2}$/, label: 'AIP Hungary', host: 'HungaroControl eAIP', home: 'https://ais-en.hungarocontrol.hu/aip/',
    /* the front page lists the issues by date ("./2026-09-03/"); Hungary amends its AIP at some AIRAC dates only */
    eds: (t) => [...new Set([...t.matchAll(/href\s*=\s*["']\.\/(\d{4}-\d{2}-\d{2})\/["']/g)].map((m) => m[1]))]
      .map((d) => ({ eff: d, pub: d, base: `https://ais-en.hungarocontrol.hu/aip/${d}/${d}-AIRAC/`, index: 'html/index-en-HU.html' })),
    page: (i) => `html/eAIP/LH-AD-2.${i}-en-HU.html`, enr: (n) => `html/eAIP/LH-ENR-${n}-en-HU.html`,
  },
  RS: {
    country: 'Serbia and Montenegro', pre: 'LYxx', test: 'LYBE', apt: /^LY[A-Z]{2}$/, label: 'AIP Serbia/Montenegro', host: 'SMATSA eAIP', home: 'https://smatsa.rs/upload/aip/published/start_page.html',
    /* "./29-Oct-2026-A/2026-10-29-AIRAC/html/index_commands.html" */
    eds: (t, at) => [...t.matchAll(/href\s*=\s*["']\.?\/?([A-Za-z0-9_\-]+)\/((\d{4}-\d{2}-\d{2})-AIRAC)\/html\//g)]
      .map((m) => ({ eff: m[3], pub: m[1], base: new URL(`${m[1]}/${m[2]}/`, at).href, index: 'html/index_commands.html' })),
    page: (i) => `html/eAIP/LY-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/LY-ENR-${n}-en-GB.html`,
  },
  PL: {
    country: 'Poland', pre: 'EPxx', test: 'EPWA', kind: 'ix', apt: /^EP[A-Z]{2}$/, label: 'AIP Poland', host: 'PANSA eAIP', home: 'https://ais.pansa.pl/en/publications/aip-poland/', idx: 'index-v2.html',
    /* the AIS page links the IFR eAIP's own list, named for its date: docs.pansa.pl/ais/eaipifr/default_offline_2026-10-29.html */
    hop: (t) => (String(t).match(/https:\/\/docs\.pansa\.pl\/ais\/eaipifr\/default_offline_[\d-]+\.html/) || [])[0],
  },
  FR: {
    country: 'France', pre: 'LFxx', test: 'LFPG', kind: 'fr', apt: /^LF[A-Z]{2}$/, label: 'AIP France', host: 'SIA eAIP', site: 'https://www.sia.aviation-civile.gouv.fr/',
    home: 'https://www.sia.aviation-civile.gouv.fr/produits-numeriques-en-libre-disposition/eaip.html',
    /* no list of editions to read: each AIRAC's eAIP is at media/dvd/eAIP_29_OCT_2026/FRANCE/AIRAC-2026-10-29/ */
    eds: () => frEds(), page: (i) => `html/eAIP/FR-AD-2.${i}-fr-FR.html`, enr: (n) => `html/eAIP/FR-ENR-${n}-fr-FR.html`,
    charts: (t, icao) => frCharts(t, icao),
  },
  PT: {
    country: 'Portugal', pre: 'LPxx', test: 'LPPT', apt: /^LP[A-Z]{2}$/, label: 'AIP Portugal', host: 'NAV Portugal eAIP', site: 'https://ais.nav.pt/',
    home: 'https://ais.nav.pt/wp-content/uploads/AIS_Files/eAIP_Current/eAIP_Online/eAIP/html/LP-cover-en-PT.html', fixed: true,
    eds: coverEds('https://ais.nav.pt/wp-content/uploads/AIS_Files/eAIP_Current/eAIP_Online/eAIP/', 'html/index.html'),
    page: (i) => `html/eAIP/LP-AD-2.${i}-en-PT.html`, enr: (n) => `html/eAIP/LP-ENR-${n}-en-PT.html`,
  },
  BA: {
    country: 'Bosnia and Herzegovina', pre: 'LQxx', test: 'LQSA', apt: /^LQ[A-Z]{2}$/, label: 'AIP Bosnia and Herzegovina', host: 'BHANSA eAIP', site: 'https://eaip.bhansa.gov.ba/',
    /* the front page builds its list from updates.json: [{ effectiveDate: '26 NOV 2026', ... }], each at <yyyy-mm-dd>-AIRAC/ */
    home: 'https://eaip.bhansa.gov.ba/updates.json',
    eds: (t) => { let j; try { j = JSON.parse(t); } catch (e) { return []; }
      return (Array.isArray(j) ? j : []).map((u) => String(u && u.effectiveDate || '').match(/(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/i)).filter((m) => m && MON[m[2].toUpperCase()])
        .map((m) => { const d = `${m[3]}-${MON[m[2].toUpperCase()]}-${m[1].padStart(2, '0')}`; return { eff: d, pub: d, base: `https://eaip.bhansa.gov.ba/${d}-AIRAC/`, index: 'html/index.html' }; }); },
    page: (i) => `html/eAIP/LQ-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/LQ-ENR-${n}-en-GB.html`, fileName: true,
  },
  AT: {
    country: 'Austria', pre: 'LOxx', test: 'LOWW', kind: 'at', apt: /^LO[A-Z]{2}$/, label: 'AIP Austria', host: 'Austro Control eAIP', home: 'https://eaip.austrocontrol.at/',
    /* the front page links each issue as lo/<yymmdd>/index.htm; an aerodrome's charts are listed on lo/<yymmdd>/ad_2_loww.htm */
    eds: (t) => [...t.matchAll(/href\s*=\s*["'](?:\.\/)?lo\/(\d{2})(\d{2})(\d{2})\/index\.htm["']/gi)]
      .map((m) => ({ eff: `20${m[1]}-${m[2]}-${m[3]}`, pub: m[1] + m[2] + m[3], base: `https://eaip.austrocontrol.at/lo/${m[1]}${m[2]}${m[3]}/`, index: 'index.htm' })),
    page: (i) => `ad_2_${i.toLowerCase()}.htm`, enr: () => null, charts: (t, icao) => atCharts(t, icao),
  },
  AL: {
    country: 'Albania', pre: 'LAxx', test: 'LATI', apt: /^LA[A-Z]{2}$/, label: 'AIP Albania', host: 'Albcontrol eAIP', home: 'https://www.albcontrol.al/aip/',
    /* "https://www.albcontrol.al/al/aip/01-OCT-2026-A/2026-10-01-AIRAC/html" */
    eds: (t, at) => [...t.matchAll(/(?:https?:\/\/www\.albcontrol\.al)?\/al\/aip\/([A-Za-z0-9_\-]+)\/((\d{4}-\d{2}-\d{2})-AIRAC)\/html/g)]
      .map((m) => ({ eff: m[3], pub: m[1], base: `https://www.albcontrol.al/al/aip/${m[1]}/${m[2]}/`, index: 'html/index.html' })),
    page: (i) => `html/eAIP/LA-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/LA-ENR-${n}-en-GB.html`,
  },
  XK: { country: 'Kosovo', pre: 'BKxx', test: 'BKPR', kind: 'ix', apt: /^BK[A-Z]{2}$/, label: 'AIP Kosovo', host: 'ANSA eAIP', home: 'https://kans-ks.org/eAIP/default.html', idx: 'index.html' },
  EE: {
    country: 'Estonia', pre: 'EExx', test: 'EETN', apt: /^EE[A-Z]{2}$/, label: 'AIP Estonia', host: 'EANS eAIP', home: 'https://eaip.eans.ee/history-en-GB.html',
    eds: (t) => [...t.matchAll(/["'\/]((\d{4}-\d{2}-\d{2})(?:-AIRAC)?)\/html\/index-en-GB\.html/g)].map((m) => ({ eff: m[2], pub: m[1], base: `https://eaip.eans.ee/${m[1]}/`, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/EE-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/EE-ENR-${n}-en-GB.html`,
  },
  KR: {
    country: 'South Korea', pre: 'RKxx', test: 'RKSI', kind: 'kr', apt: /^RK[A-Z]{2}$/, label: 'AIP Korea', host: 'KOCA AIM', site: 'https://aim.koca.go.kr/',
    /* the history page lists every edition; a chart's own PDF is an absolute address at the package where it was last amended */
    home: 'https://aim.koca.go.kr/eaipPub/Package/history-en-GB.html', cdn: 'https://aim.koca.go.kr/eaipPub/Package/',
    eds: (t) => [...t.matchAll(/["'\/]((\d{4}-\d{2}-\d{2})(?:-AIRAC)?)\/html\/index-en-GB\.html/g)].map((m) => ({ eff: m[2], pub: m[1], base: `https://aim.koca.go.kr/eaipPub/Package/${m[1]}/`, index: 'html/index-en-GB.html' })),
    page: (i) => `html/eAIP/KR-AD-2.${i}-en-GB.html`, enr: (n) => `html/eAIP/KR-ENR-${n}-en-GB.html`,
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
    let r = await get(R.home, 1800);
    if (!r.ok) throw new EaError(502, `${R.label}: the eAIP's front page answered HTTP ${r.status}`);
    let t = await r.text();
    if (R.hop) {
      const u = R.hop(t);
      if (!u) throw new EaError(502, `${R.label}: the front page no longer links the eAIP`);
      r = await get(u, 1800);
      if (!r.ok) throw new EaError(502, `${R.label}: the eAIP's edition list answered HTTP ${r.status}`);
      t = await r.text();
    }
    const by = new Map();
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

/* ---------- Sweden, Finland, the Netherlands, Iceland ("ix") ---------- */
/** the editions on the front page: "AIRAC AMDT 11-2026_2026_10_29\index.html" */
const ixEds = (R) => (t, at) => [...t.matchAll(/href\s*=\s*["']([^"'<>]*?_(\d{4})_(\d{2})_(\d{2}))[\\/]index[^"'<>]*?\.html["']/gi)].map((m) => {
  const folder = m[1].replace(/\\/g, '/'), eff = `${m[2]}-${m[3]}-${m[4]}`;
  return { eff, pub: folder, base: new URL(encPath(folder) + '/', at).href, index: R.idx || 'index.html' };
});
/** each aerodrome's first AD 2 page, and the ENR 4.1 / 4.4 pages, from the edition's menu (several MB, read as it comes) */
/* Iceland names a page "BI-AD BIKF KEFLAVÍK - KEFLAVIK 1", without the "2 ", Poland "AD 2 EPWA 1", without the country; a space
   may come as %20, a letter as an entity */
const IX_AD = /href\s*=\s*["'](?:\.\/)?((?:[A-Z]{2}-)?AD(?: |%20)(?:2(?: |%20))?([A-Z]{4})(?=[ %&"'<>]|$)[^"'<>]*?)(?: |%20)1-[a-z]{2}-[A-Z]{2}\.html/g;
const IX_AD1 = /href\s*=\s*["'](?:\.\/)?((?:[A-Z]{2}-)?AD(?: |%20)(?:2(?: |%20))?([A-Z]{4}))-[a-z]{2}-[A-Z]{2}\.html/g;
const IX_ENR = /href\s*=\s*["'](?:\.\/)?((?:[A-Z]{2}-)?ENR(?: |%20)4\.([14]))-[a-z]{2}-[A-Z]{2}\.html/g;
export function ixMenu(t) {
  const pages = {}, enr = {};
  for (const m of t.matchAll(IX_AD)) if (!pages[m[2]]) pages[m[2]] = unent(m[1]) + ' 1-en-GB.html';
  /* Kosovo keeps an aerodrome on one page: "BK-AD 2 BKPR-en-GB.html" */
  for (const m of t.matchAll(IX_AD1)) if (!pages[m[2]]) pages[m[2]] = unent(m[1]) + '-en-GB.html';
  for (const m of t.matchAll(IX_ENR)) if (!enr[m[2]]) enr[m[2]] = m[1] + '-en-GB.html';
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
export function ixCharts(html, icao) {
  const out = [], seen = new Set();
  for (const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = m[1], links = [...row.matchAll(/href\s*=\s*["']([^"']+?\.pdf)["']/gi)].map((x) => unent(x[1]));
    if (!links.length) continue;
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1])).filter(Boolean);
    const file = links[links.length - 1].replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
    if (!/^documents\/[^"'<>\\?#]{1,300}\.pdf$/i.test(file) || file.includes('..') || seen.has(file)) continue;
    seen.add(file);
    let nm = (cells[0] || decodeURIComponent(file.split('/').pop()).replace(/\.pdf$/i, '')).replace(/\s+/g, ' ').trim();
    /* Iceland starts each name with the aerodrome: "BIKF Instrument Approach Chart - ICAO RNP RWY 01" */
    if (icao && nm.startsWith(icao + ' ') && nm.length > 10) nm = nm.slice(5);
    /* Kosovo lists only the file: "STANDARD_DEPARTURE_CHART_INSTRUMENT_SID_ICAO_RWY17_KUKAD1B", "iac_ILS_Z_or_LOC_Z_RWY_17" */
    if (!/\s/.test(nm) && nm.includes('_')) nm = nm.replace(/_/g, ' ').replace(/\bICAO\b/g, ' ').replace(/^IAC\s+/i, '').replace(/\s+/g, ' ').trim();
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
/* text an amendment deletes stays in the page, marked: <span class="deletedAIRAC"><span>Parking</span></span>, <del> */
const DELETED = /<span\b[^>]*class\s*=\s*["'][^"']*\b(?:deleted|AmdtDeleted)\w*[^"']*["'][^>]*>(?:[^<]|<span\b[^>]*>[^<]*<\/span>)*<\/span>|<del\b[^>]*>[\s\S]*?<\/del>/gi;
const text = (h) => unent(h.replace(DELETED, ' ').replace(/<span[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
/** the section's HTML: from the heading "XXXX AD 2.24" to the next AD 2 heading */
function section(html) {
  const hs = [...html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => ({ i: m.index, t: text(m[2]) }));
  const a = hs.findIndex((h) => /\bAD 2\.24\b/.test(h.t));
  if (a < 0) return null;
  const b = hs.slice(a + 1).find((h) => /\bAD 2\.(?:2[5-9]|[3-9]\d)\b/.test(h.t) || /^\s*[A-Z]{4} AD 2\.\d/.test(h.t) && !/2\.24/.test(h.t));
  return html.slice(hs[a].i, b ? b.i : Math.min(html.length, hs[a].i + 600_000));
}
/** a chart's group in the EFB's Charts (the same groups as the FAA's and AIP ROC's) */
export function eaGroup(name, id) {
  const u = name.toUpperCase(), d = String(id || '').toUpperCase();
  if (/CODING|TABULAR|WAYPOINT LIST|WAYPOINT COORDINATES|\bTABLES?\b|\bDATA\b/.test(u)) return ['DATA', 'Procedure data'];
  if (/AERODROME(\s*\/?\s*HELIPORT)? CHART|\bAD CHART\b|AIRPORT CHART|AERODROME LAYOUT|AIRPORT DIAGRAM/.test(u) && !/OBSTACLE|GROUND MOVEMENT/.test(u)) return ['APD', 'Airport diagram'];
  if (/PARKING|DOCKING|GROUND MOVEMENT|TAXI|HOT ?SPOT|PUSH ?BACK|INTERSECTION TAKE|\bSTANDS?\b|DE-?ICING/.test(u) || /-(?:PBP|GMC|APDC)-/.test(d)) return ['HOT', 'Hot spots'];
  if (/\bSID\b|DEPARTURE/.test(u) || /-SID-/.test(d)) return ['DP', 'Departures'];
  if (/\bSTAR\b|ARRIVAL/.test(u) || /-STAR-/.test(d)) return ['STR', 'Arrivals'];
  if (/OBSTACLE|TERRAIN|\bAOC\b|PATC|ATOC/.test(u)) return ['DAU', 'Other'];
  if (/INSTRUMENT APPROACH|INITIAL APPROACH|APPROACH CHART|\bAPCH\b|TRANSITION|^(ILS|LOC|LLZ|RNP|RNAV|GNSS|GLS|VOR|NDB|DME|TACAN|LDA|SRA|PAR|VISUAL|CIRCLING)\b/.test(u) || /-IAC-|-VAC-/.test(d)) return ['IAP', 'Approaches'];
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
  let n = name.replace(/\s*\(\s*\)\s*/g, ' ').replace(/\s+/g, ' ').replace(/\b(RNAV|RNP) \1\b/gi, '$1').trim();
  /* Iceland: "Military Instrument Approach Chart - VORTAC RWY 01 (CAT A-B)" */
  if (group === 'Approaches') n = n.replace(/^MILITARY INSTRUMENT APPROACH CHART\s*[-–:]?\s*(ICAO\s*[-–:]?\s*)?/i, 'MIL ');
  if (group === 'Approaches') n = n.replace(/^INSTRUMENT APPROACH CHART\s*[-–:]?\s*(ICAO\s*[-–:]?\s*)?/i, '').replace(/^APPROACH CHART\s*[-–:]\s*/i, '');
  if (group === 'Departures') n = n.replace(/\bSTANDARD (INSTRUMENT )?DEPARTURE CHART\s*[-–:]?\s*(INSTRUMENT\s*)?(\(SID\)\s*)?[-–:]?\s*/i, '');
  if (group === 'Arrivals') n = n.replace(/\bSTANDARD (INSTRUMENT )?ARRIVAL CHART\s*[-–:]?\s*(INSTRUMENT\s*)?(\(STAR\)\s*)?[-–:]?\s*/i, '');
  /* Sweden: "IAC - ICAO ILS or LOC RWY 19L", "SID - ICAO RNAV SID RWY 26 - ARS 4K…" */
  n = n.replace(/^(IAC|VAC|SID|STAR)\s*[-–]\s*ICAO\s+/i, (m, c) => (/^(SID|STAR)$/i.test(c) && !new RegExp('\\b' + c + '\\b', 'i').test(n.slice(m.length)) ? c.toUpperCase() + ' ' : ''));
  n = n.replace(/^ICAO\s*[:\-–]?\s*(?=\S)/i, '').replace(/^\((.*)\)$/, (m, x) => { let d = 0; for (const c of x) { d += c === '(' ? 1 : c === ')' ? -1 : 0; if (d < 0) return m; } return d ? m : x; });
  n = n.replace(/^\((?:IAC|SID|STAR|ADC|VAC)\)\s*[-–]\s*/i, '');  /* Albania: "(IAC) – ILS or LOC RWY 17" */
  if (/^RWY\b/i.test(n) && (group === 'Departures' || group === 'Arrivals')) n = (group === 'Departures' ? 'SID ' : 'STAR ') + n;
  n = n.replace(/\s*[-–]?\s*\bICAO\s*$/i, '').replace(/^ICAO\s*[-–]\s*/i, '').replace(/\s*[-–]\s*ICAO\s*[-–]\s*/i, ' – ').replace(/\s*[-–]\s*ICAO\s+/i, ' – ');
  return n.trim() || name;
}
const fileTitle = (file) => { let b = file.split('/').pop(); try { b = decodeURIComponent(b); } catch (e) { /* as it is */ }
  return b.replace(/\.pdf$/i, '').replace(/^[A-Z]{4}\s+AD\s*2\.24\.\d+-\d+[\s_-]*/i, '').replace(/[_\s]+\d{1,2}[_\s]+[A-Z]{3}[_\s]+\d{4}$/i, '').replace(/_/g, ' ').replace(/\bICAO\b/g, ' ').replace(/\s+/g, ' ').trim() || b; };
export function eaCharts(html, k) {
  const seg = section(html);
  if (!seg) return [];
  const R = EA[k], out = [], seen = new Set();
  let title = '';
  for (const m of seg.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = m[1], cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1]);
    const all = [...row.matchAll(/href\s*=\s*["']([^"']+?\.pdf)["']/gi)].map((x) => unent(x[1]))
      .filter((h) => !(R.skip && R.skip.test(h)));
    /* while an amendment is marked, the deleted version stays beside the new one: <div class="graphic-box AmdtDeletedAIRAC"> */
    const links = all.filter((h) => { const p = row.slice(0, row.indexOf(h)), k = p.lastIndexOf('<div'); return !(k >= 0 && /class\s*=\s*["'][^"']*AmdtDeleted/i.test(p.slice(k))); });
    if (all.length && !links.length) continue;
    const first = cells.length ? text(cells[0]) : text(row);
    if (!links.length) {
      if (first && !/^(chart name|name of chart|page|side\/page)\b/i.test(first) && first.length > 2) {
        /* Belgium, Hungary: the chart's id, then what it is ("AD_2-LHBP-SID-13L" | "STANDARD DEPARTURE CHART - INSTRUMENT (SID) - ICAO") */
        const desc = cells.length > 1 && /^AD[\s_-]?2[\s._-]/i.test(first) ? text(cells[1]) : '';
        const tail = first.replace(/^AD[\s_-]?2[\s._-]*(?:[A-Z]{4}[\s._-]*)?/i, '');
        title = desc.length > 3 ? (/\d/.test(desc) || !/\d/.test(tail) ? desc : `${desc} – ${tail}`) : first;
      }
      continue;
    }
    /* the UK puts the name in a row of its own and the page reference (AD 2.EGLL-2-1) with the link in the next */
    /* … and Ireland the name in a row of its own and, in the next, only the link (its text the file's path) */
    const idLike = /^AD[\s-]?2[\s.-]/i.test(first) || (cells.length === 1 && /\.pdf$/i.test(first));
    const name = idLike ? title : first;
    const id = idLike ? first : cells.length > 1 ? text(cells[1]) : '';
    for (const h of links.slice(-1)) {
      const file = h.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
      /* Bosnia's names have spaces: "graphics/eAIP/LQSA AD 2.24.01-1-Aerodrome_Chart_ICAO_27_NOV_2025.pdf" */
      if (!/^(pdf|graphics)\/[^"'<>\\]{1,200}\.pdf$/i.test(file) || file.includes('..') || seen.has(file)) continue;
      seen.add(file);
      /* Bosnia's table only numbers the charts; its files say what they are: "LQSA AD 2.24.12-19_Instrument_Approach_Chart_ICAO_ILS_RWY_11_11_JUN_2026" */
      const nm = R.fileName ? fileTitle(file) : name || id.replace(/\s+\S*ACLO\S*/g, '').trim() || file.split('/').pop();
      const [code, group] = eaGroup(nm, id + ' ' + file);
      out.push({ code, group, name: eaName(nm, group), pdf: file, changed: false });
    }
  }
  return out;
}
export function krCharts(html, icao) {
  /* the AD 2.24 charts are figures at the end of the page (after the AD 2.25 text), each an absolute PDF whose address
     carries the package where it was last amended; a chart name may repeat across packages, so keep the newest */
  const by = new Map();
  const re = new RegExp('href\\s*=\\s*["\\\']https?://aim\\.koca\\.go\\.kr/eaipPub/Package/((\\d{4}-\\d{2}-\\d{2})(?:-AIRAC)?/pdf/AD/' + icao + '/[^"\\\'<>]+?\\.pdf)["\\\']', 'gi');
  for (const m of html.matchAll(re)) {
    const file = unent(m[1]), date = m[2];
    let nm; try { nm = decodeURIComponent(file.split('/').pop()); } catch (e) { nm = file.split('/').pop(); }
    nm = nm.replace(/\.pdf$/i, '').replace(/^\(\s*[\d.\- ]+\)\s*/, '').replace(/_\d{6,}$/, '').replace(/\s+/g, ' ').trim();
    const prev = by.get(nm);
    if (prev && prev.date >= date) continue;
    by.set(nm, { nm, file, date });
  }
  return [...by.values()].map(({ nm, file }) => { const [code, group] = eaGroup(nm, file); return { code, group, name: eaName(nm, group), pdf: file, changed: false }; });
}
/* ---------- Latvia (LGS) ----------
   AD 2.24 is one row per kind of chart ("13. Instrument Approach Chart — ICAO"), each holding several charts; a chart
   is <div data-id="chart1851">, and while an amendment is marked it holds the deleted version and the inserted one
   (AmdtDeletedAIRAC / AmdtInsertedAIRAC). The one in force is the file numbered as the div: 1851_EVRA_2_24_13_RWY18_ILSY_LOCY_20261029.pdf.
   The files carry no title of their own, so the name comes from the row and the file's end: "ILS Y or LOC Y RWY 18". */
const LV_PROC = /^(ILS|LOC|LLZ|RNP|RNAV|GNSS|VOR|NDB|DME|LPV|LNAV|GLS)([A-Z])?$/;
function lvName(kind, tail) {
  const tk = String(tail || '').split('_').filter(Boolean), rwy = [], proc = [], rest = [];
  let last = null;
  for (const x of tk) {
    let m;
    if ((m = x.match(/^RWY(\d{2}[LRC]?)([A-Z]{0,3})$/))) { rwy.push('RWY ' + m[1] + (m[2] ? ' (' + m[2] + ')' : '')); last = rwy; }
    else if (/^\d{2}[LRC]?$/.test(x) && last === rwy) rwy[rwy.length - 1] += '/' + x;
    else if ((m = x.match(LV_PROC))) { proc.push(m[1] + (m[2] ? ' ' + m[2] : '')); last = proc; }
    /* "RWY06_VOR_Y" (the procedure's letter), "RWY06_A" (the SID's) */
    else if (/^[A-Z]$/.test(x) && last === proc && !/ [A-Z]$/.test(proc[proc.length - 1])) proc[proc.length - 1] += ' ' + x;
    else if (/^[A-Z]{1,3}$/.test(x) && last === rwy && !/\)$/.test(rwy[rwy.length - 1])) rwy[rwy.length - 1] += ' (' + x + ')';
    else { rest.push(x); last = rest; }
  }
  const k = kind.toUpperCase();
  if (/INSTRUMENT APPROACH/.test(k) && proc.length) return [proc.join(' or '), ...rwy, ...rest].join(' ');
  if (/\(SID\)|DEPARTURE CHART/.test(k)) return ['SID', ...proc, ...rwy, ...rest].join(' ');
  if (/\(STAR\)|ARRIVAL CHART/.test(k)) return ['STAR', ...proc, ...rwy, ...rest].join(' ');
  const t = [...proc, ...rwy, ...rest].join(' ');
  return kind + (t ? ' – ' + t : '');
}
export function lvCharts(html, icao) {
  const a = html.indexOf(`id="${icao}-AD-2.24"`);
  if (a < 0) return [];
  const b = html.indexOf(`id="${icao}-AD-2.25"`, a), sec = html.slice(a, b > a ? b : html.length), out = [], seen = new Set();
  for (const row of sec.matchAll(/<tr\b[^>]*data-id="chartRow\d+"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const r = row[1], tm = r.match(/data-id="chartTitle\d+"[^>]*>([\s\S]*?)<\/div>/i);
    const kind = (tm ? text(tm[1]) : '').replace(/^\d+\.\s*/, '').replace(/\s*[—–-]\s*ICAO\b/gi, '').replace(/\s+/g, ' ').trim();
    if (!kind || /\s-\s*NIL$/i.test(kind)) continue;
    const parts = r.split(/(?=<div\b[^>]*data-id="chart\d+")/i).slice(1);
    for (const part of parts) {
      const id = (part.match(/data-id="chart(\d+)"/) || [])[1];
      const links = [...part.matchAll(/href\s*=\s*["']([^"']+?\.pdf)["']/gi)].map((x) => unent(x[1]));
      const live = links.filter((l) => l.split('/').pop().startsWith(id + '_'));
      const href = live[live.length - 1] || links.filter((l, i) => !/AmdtDeleted/i.test(part.slice(0, part.indexOf(l)).split(/<div\b/).pop()))[0];
      if (!href) continue;
      const file = href.replace(/^(\.\.\/)+/, '');
      if (!/^graphics\/[^\s"'<>\\]{1,200}\.pdf$/i.test(file) || seen.has(file)) continue;
      seen.add(file);
      const tail = (file.split('/').pop().match(new RegExp('^\\d+_' + icao + '_2_24_\\d+_?(.*?)_?\\d{8}\\.pdf$', 'i')) || [])[1] || '';
      const nm = lvName(kind, tail), [code, group] = eaGroup(kind + ' ' + nm, file);
      out.push({ code, group, name: eaName(nm, group), pdf: file, changed: false });
    }
  }
  return out;
}

/* ---------- Spain (ENAIRE) ----------
   aip.enaire.es/AIP/AIP-en.html: per aerodrome a table of rows "AD 2 LEMD IAC 5" | "IAC 5 - RNP Z RWY 18L (LPV ONLY)" |
   contenido_AIP/AD/AD2/LEMD/LE_AD_2_LEMD_IAC_5_en.pdf. The chart code gives the group. */
const ES_KIND = {
  ADC: ['APD', 'Airport diagram', 'Aerodrome Chart'], PDC: ['HOT', 'Hot spots', 'Parking/Docking Chart'], GMC: ['HOT', 'Hot spots', 'Ground Movement Chart'],
  AOC: ['DAU', 'Other', 'Aerodrome Obstacle Chart'], PATC: ['DAU', 'Other', 'Precision Approach Terrain Chart'], ATCSMAC: ['MIN', 'Minimums', 'ATC Surveillance Minimum Altitude Chart'],
  SID: ['DP', 'Departures', 'SID'], DEP: ['DP', 'Departures', 'Departure'], CDEP: ['DP', 'Departures', 'Departure'],
  STAR: ['STR', 'Arrivals', 'STAR'], ARR: ['STR', 'Arrivals', 'Arrival'], CARR: ['STR', 'Arrivals', 'Arrival'], CDA: ['STR', 'Arrivals', 'CDA'],
  IAC: ['IAP', 'Approaches', ''], TRAN: ['IAP', 'Approaches', 'Transition'], VAC: ['IAP', 'Approaches', 'Visual Approach Chart'], VPT: ['IAP', 'Approaches', 'Visual Prescribed Track'],
};
export function esCharts(html, icao) {
  const dir = `contenido_AIP/AD/AD2/${icao}/`, out = [], seen = new Set(), n = {};
  const a = html.indexOf(dir); if (a < 0) return [];
  const sec = html.slice(html.lastIndexOf('<table', a), html.indexOf('</table>', a) + 8);
  const rows = [];
  for (const m of sec.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const r = m[1], pdf = (r.match(new RegExp(`href\\s*=\\s*["'](${dir}[^"'<>\\\\?#]{1,120}?\\.pdf)["']`, 'i')) || [])[1];
    if (!pdf || seen.has(pdf)) continue;
    seen.add(pdf);
    const desc = text((r.match(/<td\b[^>]*class="desc"[^>]*>([\s\S]*?)<\/td>/i) || [])[1] || '');
    const km = pdf.match(new RegExp(`LE_AD_2_${icao}_([A-Z]+)_([\\w.\\-]+?)_en\\.pdf$`));
    rows.push({ pdf, desc, code: km ? km[1] : '', num: km ? km[2] : '' });
    if (km) n[km[1]] = (n[km[1]] || 0) + 1;
  }
  for (const { pdf, desc, code, num } of rows) {
    if (!code) { out.push({ code: 'DAU', group: 'Other', name: 'Aerodrome information (AD 2 text)', pdf, changed: false }); continue; }
    const K = ES_KIND[code] || ['DAU', 'Other', code];
    /* "IAC 5 - RNP Z RWY 18L (LPV ONLY)" -> "RNP Z RWY 18L (LPV ONLY)"; "GMC 1 - NORTH CONFIGURATION" -> "Ground Movement Chart 1 – NORTH CONFIGURATION" */
    /* the file's "1_1" is the chart's "1.1" */
    const no = num.replace(/_/g, '.'), rest = desc.replace(new RegExp(`^${code}\\s*${no.replace(/\./g, '[._]')}\\s*(?:[-–—]\\s*)?`, 'i'), '').replace(/\s+/g, ' ').trim();
    const name = code === 'IAC' ? (rest || `IAC ${no}`) : `${K[2]}${n[code] > 1 || code === 'SID' || code === 'STAR' ? ' ' + no : ''}${rest ? ' – ' + rest : ''}`;
    out.push({ code: K[0], group: K[1], name, pdf, changed: false });
  }
  return out;
}
/* the section's heading: <a id="LEMD" … migapan="<a href=…>…"></a> … <h1>LEMD</h1> <h2>MADRID/Adolfo Suárez Madrid-Barajas</h2> */
const esName = (html, icao) => { const m = html.match(new RegExp(`<a id="${icao}"[\\s\\S]{0,900}?<h1[^>]*>\\s*${icao}\\s*</h1>\\s*<h2[^>]*>([\\s\\S]*?)</h2>`)); return m ? text(m[1]) : ''; };

/* ---------- Austria (Austro Control) ----------
   ad_2_loww.htm: one row per chart, <a href="Charts/LOWW/LO_AD_2_LOWW_9-1-1_en.pdf">LOWW AD 2 MAP 9-1-1</a> then its name in German
   and, in <i>, English ("Standard Departure Chart - Instrument (SID) - ICAO (RWY 11)"). */
export function atCharts(html, icao) {
  const out = [], seen = new Set();
  for (const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = m[1], a = row.match(new RegExp(`href\\s*=\\s*["'](Charts\\/${icao}\\/[\\w.\\-]{1,120}\\.pdf)["']`, 'i'));
    if (!a || seen.has(a[1])) continue;
    seen.add(a[1]);
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]), d = cells[1] || '';
    const en = (d.match(/<i\b[^>]*>([\s\S]*?)<\/i>/i) || [])[1];
    const nm = text(en || d) || text(cells[0] || '') || a[1].split('/').pop();
    const [code, group] = eaGroup(nm, a[1]);
    out.push({ code, group, name: eaName(nm, group), pdf: a[1], changed: false });
  }
  return out;
}

/* ---------- France (SIA) ----------
   AD 2.24 is figures only, each a PDF under Cartes/<ICAO>/ named for what it is: AD_2_LFPG_IAC_RWY08L_FNA_ILS_CAT123_LOC.pdf,
   AD_2_LFPG_SID_RWY08L-08R-09L-09R_RNAV_AGOPA_ERIXU.pdf, AD_2_LFPG_ADC_01.pdf. The name is built from the file's. */
function frEds(t = Date.now()) {
  const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], cur = Date.parse(airacEff(t) + 'T00:00:00Z'), out = [];
  for (const k of [-1, 0, 1]) {
    const d = new Date(cur + k * 28 * 86400_000), iso = d.toISOString().slice(0, 10), dd = iso.slice(8, 10);
    out.push({ eff: iso, pub: iso, base: `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dd}_${MO[d.getUTCMonth()]}_${iso.slice(0, 4)}/FRANCE/AIRAC-${iso}/`, index: 'html/index-fr-FR.html' });
  }
  return out;
}
const FR_KIND = {
  ADC: ['APD', 'Airport diagram', 'Aerodrome Chart'], APDC: ['HOT', 'Hot spots', 'Parking/Docking Chart'], GMC: ['HOT', 'Hot spots', 'Ground Movement Chart'],
  AOC: ['DAU', 'Other', 'Aerodrome Obstacle Chart'], PATC: ['DAU', 'Other', 'Precision Approach Terrain Chart'], MIA: ['MIN', 'Minimums', 'Minimum Altitude Chart'],
  MVA: ['MIN', 'Minimums', 'Minimum Vectoring Altitude Chart'], SID: ['DP', 'Departures', 'SID'], STAR: ['STR', 'Arrivals', 'STAR'], IAC: ['IAP', 'Approaches', ''],
  VAC: ['IAP', 'Approaches', 'Visual Approach Chart'], DATA: ['DATA', 'Procedure data', 'Coding table'], COM: ['DAU', 'Other', 'Communications'],
};
function frName(code, rest) {
  const tk = rest.split('_').filter(Boolean), rwy = [], words = [];
  let ina = false;
  for (const x of tk) {
    let m;
    if ((m = x.match(/^RWY((?:\d{2}[LRC]?)(?:-\d{2}[LRC]?)*)$/))) rwy.push('RWY ' + m[1].replace(/-/g, '/'));
    else if (x === 'RWY') rwy.push('RWY');
    else if (rwy[rwy.length - 1] === 'RWY' && /^[A-Z]+$/.test(x)) rwy[rwy.length - 1] = 'RWY ' + x;
    else if (x === 'FNA') continue;
    else if (x === 'INA') ina = true;
    else if ((m = x.match(/^CAT(1?2?3?)$/))) words.push('CAT ' + m[1].split('').map((n) => ['', 'I', 'II', 'III'][n]).join('-'));
    else words.push(/^\d+$/.test(x) ? String(+x) : x);
  }
  if (code === 'IAC') {
    const w = words.join(' ').replace(/\bILS(.*?) LOC\b/, 'ILS$1 or LOC');
    return [w || 'Approach', ...rwy].join(' ') + (ina ? ' – initial' : '');
  }
  const K = FR_KIND[code];
  return [K ? K[2] : code, ...rwy, ...words].join(' ').replace(/\s+/g, ' ').trim();
}
export function frCharts(html, icao) {
  const out = [], seen = new Set();
  for (const m of html.matchAll(new RegExp(`href\\s*=\\s*["'](Cartes\\/${icao}\\/AD_2_${icao}_([A-Z]+)_?([\\w.\\-]*?)\\.pdf)["']`, 'g'))) {
    const p = html.slice(Math.max(0, m.index - 400), m.index), k = p.lastIndexOf('<div');
    if (k >= 0 && /class\s*=\s*["'][^"']*AmdtDeleted/i.test(p.slice(k))) continue;
    const file = 'html/eAIP/' + m[1];
    if (seen.has(file)) continue;
    seen.add(file);
    const K = FR_KIND[m[2]] || ['DAU', 'Other'];
    out.push({ code: K[0], group: K[1], name: frName(m[2], m[3]), pdf: file, changed: false });
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
    let pg = R.list ? R.list(icao) : R.page ? R.page(icao) : null;
    if (R.kind === 'ix') { const mn = await ixMenuOf(k, cur, d); pg = mn.pages[icao] ? 'eAIP/' + encPath(mn.pages[icao]) : null; }
    if (!pg) return { airport: { icao, name: '' }, charts: [], notFound: true };
    const r = await get(cur.base + pg + (R.fixed ? '?v=' + cycle : ''), R.fixed ? 3600 : 86400);
    if (r.status === 404) return { airport: { icao, name: '' }, charts: [], notFound: true };
    if (!r.ok) throw new EaError(502, `${R.label}: the page for ${icao} answered HTTP ${r.status}`);
    const t = await r.text();
    if (notFoundPage(t)) return { airport: { icao, name: '' }, charts: [], notFound: true };
    const charts = R.charts ? R.charts(t, icao) : R.kind === 'ix' ? ixCharts(t, icao) : R.kind === 'kr' ? krCharts(t, icao) : eaCharts(t, k);
    return { airport: { icao, name: R.name ? R.name(t, icao) : aptName(t, icao) }, charts, notFound: !charts.length };
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
    : R.kind === 'kr' ? /^\d{4}-\d{2}-\d{2}(?:-AIRAC)?\/pdf\/(AD|ENR|GEN)\/[A-Z]{4}\/[^"'<>\\]{1,250}\.pdf$/i.test(file)
    : R.kind === 'at' ? /^Charts\/[A-Z]{4}\/[\w.\-]{1,120}\.pdf$/.test(file)
    : R.kind === 'fr' ? /^html\/eAIP\/Cartes\/[A-Z]{4}\/AD_2_[A-Z]{4}_[\w.\-]{1,160}\.pdf$/.test(file)
    : R.kind === 'es' ? /^contenido_AIP\/AD\/AD2\/[A-Z]{4}\/LE_AD_2_[A-Z]{4}[\w.\-]{0,40}_en\.pdf$/.test(file)
    : /^(pdf|graphics)\/[^"'<>\\]{1,200}\.pdf$/i.test(file);
  if (!R || !/^[A-Z]{2}\d{8}$/.test(cycle) || !fileOk || file.includes('..')) return res({ error: 'Invalid chart' }, 400);
  if (!me) return res({ error: 'Sign in to see ' + EA[k].label + ' charts' }, 401);
  const key = 'ea/' + cycle + '/' + file, ok = (body) => new Response(body, { status: 200, headers: { ...h, 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=86400', Vary: 'Authorization' } });
  if (env.CHARTS) { const o = await env.CHARTS.get(key).catch(() => null); if (o) return ok(o.body); }
  let ed = null;
  /* Denmark: one address per file, no editions */
  if (R.kind === 'dk') ed = { base: R.home };
  else if (R.kind === 'kr') ed = { base: R.cdn };
  else {
    try { ed = (await editions(k, d)).find((e) => e.eff === eff); } catch (e) { return res({ error: e.message }, 502); }
    if (!ed) return res({ error: `That ${EA[k].label} edition is no longer listed. Open the chart list again.` }, 404);
  }
  const r = await get(ed.base + encPath(file) + (R.fixed ? '?v=' + cycle : ''), 7 * 86400).catch((e) => ({ ok: false, status: 0, err: e }));
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

/* ---------- Nav Data (/admin, navdata.js): the edition in force and a test aerodrome's chart list ---------- */
export async function eaStatus(k, d, t = Date.now()) {
  const R = EA[k];
  if (R.kind === 'dk') {
    const A = (await dkAirports(d)).apts, l = await eaChartsList(R.test, {}, { u: 'navdata' }, d);
    return { kind: 'dk', apts: Object.keys(A).length, eff: airacEff(t), test: R.test, n: (l.charts || []).length, nf: !!l.notFound };
  }
  const { cur, next, all } = await edition(k, d, t);
  let n = null, nf = false, err = '';
  try { const l = await eaChartsList(R.test, {}, { u: 'navdata' }, d); n = (l.charts || []).length; nf = !!l.notFound; } catch (e) { err = String((e && e.message) || e).slice(0, 160); }
  return { eff: cur.eff, amdt: cur.amdt || '', next: next ? { eff: next.eff } : null, eds: all.length, test: R.test, n, nf, err };
}

/* the editions and lists of these airports, so the first pilot to open them doesn't wait (the 20-minute cron) */
export async function eaWarm(icaos, env, d) {
  for (const icao of icaos) { try { await eaChartsList(icao, env, { u: 'warm' }, d); } catch (e) { /* next run */ } }
}
