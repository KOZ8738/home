/* Official FIR boundaries for the EFB Map.
   Where openAIP has a country's FIRs (published from the national AIPs), they are used. Where it has none, the
   VATSpy Data Project's outline is used, but only for FIRs whose code is a real ICAO FIR code (the list below), so
   VATSIM's own sub-sectors (VATPRC's ZGGG, ZHHH, ZSSS… in China) never appear. Outlines are simplified to about
   1 km and labelled with the ICAO FIR code. */

/* ICAO FIR codes and names (Wikipedia: List of flight information regions and area control centers) */
const FIR_LIST = `ZBPE|Beijing ZGZU|Guangzhou ZHWH|Wuhan ZJSA|Sanya ZKKP|Pyongyang ZLHW|Lanzhou ZMUB|Ulaanbaatar ZPKM|Kunming
ZSHA|Shanghai ZWUQ|Urumqi ZYSH|Shenyang RCAA|Taipei RJJJ|Fukuoka RKRR|Incheon VHHK|Hong Kong RPHI|Manila VVHM|Ho Chi Minh
VVHN|Hanoi VTBB|Bangkok VABF|Mumbai VCCF|Colombo VDPF|Phnom Penh VECF|Kolkata VGFR|Dhaka VIDF|Delhi VLVT|Vientiane
VNSM|Kathmandu VOMF|Chennai VRMF|Male VYYF|Yangon WAAF|Ujung Pandang WBFC|Kota Kinabalu WIIF|Jakarta WMFC|Kuala Lumpur
WSJC|Singapore OAKX|Kabul OBBB|Bahrain OEJD|Jeddah OIIX|Tehran OJAC|Amman OKAC|Kuwait OLBB|Beirut OMAE|Emirates OOMM|Muscat
OPKR|Karachi OPLR|Lahore ORBB|Baghdad OSTT|Damascus OTDF|Doha OYSC|Sanaa UAAA|Almaty UACN|Astana UAII|Shymkent UATT|Aktobe
UBBA|Baku UCFM|Bishkek UCFO|Osh UDDD|Yerevan UEEE|Yakutsk UGGG|Tbilisi UHHH|Khabarovsk UHMM|Magadan UIII|Irkutsk
UNKL|Krasnoyarsk UNNT|Novosibirsk USSV|Yekaterinburg USTV|Tyumen UTAA|Ashgabat UTAK|Turkmenbashi UTAT|Dashoguz
UTAV|Turkmenabat UTDD|Dushanbe UUWV|Moscow UWWW|Samara UZSD|Samarkand UZTR|Tashkent AGGG|Honiara ANAU|Nauru
AYPM|Port Moresby BGGL|Nuuk BIRD|Reykjavik CZEG|Edmonton CZQM|Moncton CZQX|Gander CZUL|Montreal CZVR|Vancouver
CZWG|Winnipeg CZYZ|Toronto DAAA|Alger DGAC|Accra DIII|Abidjan DNKK|Kano DRRR|Niamey DTTC|Tunis EBBU|Brussels EDGG|Langen
EDMM|Munchen EDUU|Rhein EDVV|Hannover EDWW|Bremen EETT|Tallinn EFIN|Finland EGGX|Shanwick EGPX|Scottish EGTT|London
EHAA|Amsterdam EISN|Shannon EKDK|Kobenhavn ENOB|Bodo ENOR|Polaris EPWW|Warszawa ESAA|Sweden EVRR|Riga EYVL|Vilnius
FACA|Cape Town FAJA|Johannesburg FAJO|Johannesburg Oceanic FBGR|Gaborone FCCC|Brazzaville FIMM|Mauritius FLFI|Lusaka
FMMM|Antananarivo FNAN|Luanda FQBE|Beira FSSS|Seychelles FTTT|NDjamena FVHF|Harare FWLL|Lilongwe FYWF|Windhoek
FZZA|Kinshasa GCCC|Canarias GLRB|Roberts GMMM|Casablanca GOOO|Dakar GVSC|Sal HAAA|Addis Ababa HBBA|Bujumbura
HCSM|Mogadishu HECC|Cairo HHAA|Asmara HJJJ|Juba HKNA|Nairobi HLLL|Tripoli HRYR|Kigali HSSS|Khartoum HTDC|Dar es Salaam
HUEC|Entebbe KZAB|Albuquerque KZAK|Oakland Oceanic KZAU|Chicago KZBW|Boston KZDC|Washington KZDV|Denver KZFW|Fort Worth
KZHU|Houston KZID|Indianapolis KZJX|Jacksonville KZKC|Kansas City KZLA|Los Angeles KZLC|Salt Lake KZMA|Miami KZME|Memphis
KZMP|Minneapolis KZNY|New York KZOA|Oakland KZOB|Cleveland KZSE|Seattle KZTL|Atlanta KZWY|New York Oceanic LAAA|Tirana
LBSR|Sofia LCCC|Nicosia LDZO|Zagreb LECB|Barcelona LECM|Madrid LFBB|Bordeaux LFEE|Reims LFFF|Paris LFMM|Marseille
LFRR|Brest LGGG|Athens LHCC|Budapest LIBB|Brindisi LIMM|Milano LIRR|Roma LJLA|Ljubljana LKAA|Praha LLLL|Tel Aviv LMMM|Malta
LOVV|Wien LPPC|Lisboa LPPO|Santa Maria LQSB|Sarajevo LRBB|Bucuresti LSAS|Switzerland LTAA|Ankara LTBB|Istanbul
LUUU|Chisinau LWSS|Skopje LYBA|Beograd LZBB|Bratislava MDCS|Santo Domingo MHCC|Central American MKJK|Kingston
MMEX|Mexico MMFO|Mazatlan Oceanic MMID|Merida MMTY|Monterrey MMZT|Mazatlan MPZL|Panama MTEG|Port au Prince MUFH|Habana
MYNA|Nassau NFFF|Nadi NTTT|Tahiti NZZC|New Zealand NZZO|Auckland Oceanic PAZA|Anchorage PAZN|Anchorage Oceanic
PHZH|Honolulu SACF|Cordoba SAEF|Ezeiza SAMF|Mendoza SARR|Resistencia SAVF|Comodoro Rivadavia SBAO|Atlantico
SBAZ|Amazonica SBBS|Brasilia SBCW|Curitiba SBRE|Recife SCCZ|Punta Arenas SCEZ|Santiago SCFZ|Antofagasta
SCIZ|Easter Island SCTZ|Puerto Montt SEFG|Guayaquil SGFA|Asuncion SKEC|Barranquilla SKED|Bogota SLLF|La Paz
SMPM|Paramaribo SOOO|Rochambeau SPIM|Lima SUEO|Montevideo SVZM|Maiquetia SYGC|Georgetown TJZS|San Juan TNCF|Curacao
TTZP|Piarco UKBV|Kyiv UKDV|Dnipro UKFV|Simferopol UKLV|Lviv UKOV|Odesa ULLL|Sankt Peterburg UMKK|Kaliningrad UMMV|Minsk
URRV|Rostov na Donu`;
const NORM = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const CODES = new Map(), BYNAME = new Map();
for (const e of FIR_LIST.split(/\s+(?=[A-Z]{4}\|)/)) { const [c, n] = e.trim().split('|'); if (!c || !n) continue; CODES.set(c, n.trim()); const k = NORM(n); if (!BYNAME.has(k)) BYNAME.set(k, c); }
/* other spellings openAIP and the AIPs use */
[['TAIBEI', 'RCAA'], ['TAIPEI', 'RCAA'], ['HONGKONG', 'VHHK'], ['MUENCHEN', 'EDMM'], ['MUNICH', 'EDMM'], ['COPENHAGEN', 'EKDK'], ['WARSAW', 'EPWW'], ['VIENNA', 'LOVV'],
 ['ROME', 'LIRR'], ['MILAN', 'LIMM'], ['PRAGUE', 'LKAA'], ['LISBON', 'LPPC'], ['BUCHAREST', 'LRBB'], ['BELGRADE', 'LYBA'], ['ALGIERS', 'DAAA'], ['SEOUL', 'RKRR'], ['ULAN BATOR', 'ZMUB'],
 ['SAINT PETERSBURG', 'ULLL'], ['ST PETERSBURG', 'ULLL'], ['BRUXELLES', 'EBBU'], ['HO CHI MINH CITY', 'VVHM'], ['MALE', 'VRMF'], ['NEW ZEALAND', 'NZZC'], ['BODO OCEANIC', 'ENOB']]
  .forEach(([n, c]) => BYNAME.set(NORM(n), c));

function firCode(name) {
  const n = NORM(name);
  for (const t of n.split(' ')) if (t.length === 4 && CODES.has(t)) return t;
  /* "GUANGZHOU - FIR GND - FL999", "HONG KONG FIR", "FIR VIENTIANE", "OAKLAND OCEANIC ARTCC FIR (PART 3)" */
  const core = n.split(' FIR ')[0].replace(/\b(FIR|UIR|ACC|ARTCC|CTA|PART \d+|GND|FL\d+|UNL|SFC)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (BYNAME.has(core)) return BYNAME.get(core);
  const words = core.split(' ');
  for (let k = words.length; k > 0; k--) { const c = BYNAME.get(words.slice(0, k).join(' ')); if (c) return c; }
  return '';
}

/* Douglas–Peucker, in degrees */
function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1; const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i]; let d;
      if (!L) d = Math.hypot(x - x1, y - y1); else { const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L)); d = Math.hypot(x - x1 - t * dx, y - y1 - t * dy); }
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]).map((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]);
}
const bbox = (r) => { let a = 180, b = 90, c = -180, d = -90; for (const [x, y] of r) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } return [a, b, c, d]; };
function inRing(x, y, r) { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o; } return o; }
/* a label point inside the outline: the middle of the widest stretch across it at the height of its centre */
function labelPt(r) {
  const [a, b, c, d] = bbox(r); let best = null;
  for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const y = b + (d - b) * f, xs = [];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y)) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi); }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) if (!best || xs[k + 1] - xs[k] > best.w) best = { w: xs[k + 1] - xs[k], x: (xs[k] + xs[k + 1]) / 2, y };
    if (best && best.w > (c - a) * 0.35) break;
  }
  return best ? [Math.round(best.x * 1000) / 1000, Math.round(best.y * 1000) / 1000] : [(a + c) / 2, (b + d) / 2];
}
const polysOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

async function oaipFirs(env) {
  const key = env && env.OPENAIP_API_KEY; if (!key) throw new Error('openAIP key is not set');
  const out = [];
  for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
    const r = await fetch(`https://api.core.openaip.net/api/airspaces?type=10&limit=1000&page=${page}`, { headers: { 'x-openaip-api-key': key, Accept: 'application/json', 'User-Agent': 'PolarisEFB/1.0' } });
    if (!r.ok) throw new Error('openAIP airspaces ' + r.status);
    const j = await r.json(); pages = +j.totalPages || 1; out.push(...(j.items || []));
  }
  return out;
}

export async function officialFirs(env) {
  const feats = [], have = new Set(), shapes = [], stat = { oaip: 0, vatspy: 0, unnamed: 0, err: '' };
  let items = [];
  try { items = await oaipFirs(env); } catch (e) { stat.err = String(e.message || e); }
  for (const it of items) {
    const name = String(it.name || '').trim(), code = firCode(name), oc = /OCEANIC/i.test(name);
    for (const poly of polysOf(it.geometry)) {
      const ring = simplify(poly[0] || [], 0.01); if (ring.length < 4) continue;
      const lp = labelPt(ring); shapes.push({ r: ring, b: bbox(ring) });
      const id = code || NORM(name).replace(/\s*-\s*FIR.*$/, '').replace(/\b(FIR|UIR)\b/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
      if (!code) stat.unnamed++;
      feats.push({ type: 'Feature', properties: { id, name: (code && CODES.get(code)) || name, oceanic: oc ? '1' : '0', label_lon: String(lp[0]), label_lat: String(lp[1]), src: 'openaip', country: it.country || '' }, geometry: { type: 'Polygon', coordinates: [ring] } });
      if (code) have.add(code); stat.oaip++;
    }
  }
  /* where openAIP has no FIR: the VATSpy outline of a real FIR */
  const r = await fetch('https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson', { headers: { 'User-Agent': 'PolarisEFB/1.0' } });
  if (r.ok) {
    const j = await r.json();
    for (const f of j.features || []) {
      const p = f.properties || {}, id = String(p.id || '');
      if (!CODES.has(id) || have.has(id)) continue;
      const lx = +p.label_lon, ly = +p.label_lat;
      if (isFinite(lx) && isFinite(ly) && shapes.some((s) => lx >= s.b[0] && lx <= s.b[2] && ly >= s.b[1] && ly <= s.b[3] && inRing(lx, ly, s.r))) continue;
      for (const poly of polysOf(f.geometry)) {
        const ring = simplify(poly[0] || [], 0.01); if (ring.length < 4) continue;
        feats.push({ type: 'Feature', properties: { id, name: CODES.get(id), oceanic: String(p.oceanic) === '1' ? '1' : '0', label_lon: String(isFinite(lx) ? lx : labelPt(ring)[0]), label_lat: String(isFinite(ly) ? ly : labelPt(ring)[1]), src: 'vatspy' }, geometry: { type: 'Polygon', coordinates: [ring] } });
        stat.vatspy++;
      }
    }
  }
  return { type: 'FeatureCollection', features: feats, stat, generated: new Date().toISOString() };
}
