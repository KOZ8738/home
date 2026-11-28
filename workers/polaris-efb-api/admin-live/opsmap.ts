/**
 * Flight Watch's map: the EFB's Map in Operations. MapLibre GL 5, loaded when the page is first opened from a CDN (as
 * the EFB's Cabin does), draws OpenFreeMap's vector tiles (OpenStreetMap data) in the EFB Map's colours: a globe when
 * zoomed out, a flat map when zoomed in, drawn by the graphics card. On it:
 *   - the Polaris flights, each with its track; the open flight bright, with what is left of its route to the
 *     destination and both airports named; aircraft grow to their real size close in, at the stands;
 *   - the Polaris airports, ringed in their flight category from the latest METAR;
 *   - weather radar (RainViewer), SIGMETs / AIRMETs, FIR boundaries and VATSIM traffic, as the EFB's Map shows them;
 *   - with VATSIM traffic, the controllers online as the EFB shows them: centres' and approaches' areas in the FIR
 *     green with their callsigns, and an airport's D/G/T/A (the EFB server's /api/efb/vatsim-atc, see vatspy.js);
 *   - close in at a Polaris airport: stand numbers, taxiway names and runway ends (OpenStreetMap, the EFB server).
 * The layer button in the map's corner switches these on and off (kept in this browser). A tap on a Polaris aircraft
 * opens the flight; on a VATSIM aircraft, a controller's area or airport, or a SIGMET it shows a short note.
 * If the library cannot load, the browser has no WebGL or the base map's tiles cannot be reached, the canvas globe
 * (globe.ts) is drawn instead; ?globe in the address asks for it.
 */
import { Globe, type GlobeOptions, type LiveFlight, type Layout } from './globe';

type LL = [number, number]; // [lon, lat]
type Apt = { lat: number; lon: number; icao: string; iata?: string; city?: string };
/** what live.ts asks of the map */
export interface MapApi {
  setFlights(flights: readonly LiveFlight[], selected: string | null): void;
  frameFlight(f: LiveFlight, animate?: boolean): void;
  pose(centre: LL, zoom: number, lift?: number): void;
  overview(animate?: boolean): void;
  zoomBy(factor: number): void;
  setAirports(list: readonly Apt[]): void;
  setIdleSpin(on: boolean): void;
}

/* ---------- the library ---------- */
const MLV = '5.24.1';
const LIBS = [`https://cdn.jsdelivr.net/npm/maplibre-gl@${MLV}/dist/maplibre-gl.js`, `https://unpkg.com/maplibre-gl@${MLV}/dist/maplibre-gl.js`];
const CSS = [`https://cdn.jsdelivr.net/npm/maplibre-gl@${MLV}/dist/maplibre-gl.css`, `https://unpkg.com/maplibre-gl@${MLV}/dist/maplibre-gl.css`];
const OFM = 'https://tiles.openfreemap.org';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ML = any;
let libP: Promise<ML> | null = null;
function loadLib(): Promise<ML> {
  if (libP) return libP;
  libP = new Promise<ML>((res, rej) => {
    const w = window as unknown as { maplibregl?: ML };
    if (w.maplibregl) { res(w.maplibregl); return; }
    let i = 0;
    const next = () => {
      const u = LIBS[i++];
      if (!u) { libP = null; rej(new Error('The map library could not load')); return; }
      const s = document.createElement('script');
      s.src = u; s.async = true;
      s.onload = () => (w.maplibregl ? res(w.maplibregl) : next());
      s.onerror = next;
      document.head.appendChild(s);
    };
    next();
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = CSS[0]!; l.onerror = () => { l.onerror = null; l.href = CSS[1]!; };
    document.head.appendChild(l);
  });
  return libP;
}
function webgl(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
const isDark = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const R = Math.PI / 180;

/* ---------- geometry ---------- */
/** a point k of the way along the great circle from a to b ([lat, lon]) */
function along(a: [number, number], b: [number, number], k: number): [number, number] {
  const [φ1, λ1, φ2, λ2] = [a[0] * R, a[1] * R, b[0] * R, b[1] * R];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d < 1e-9) return a;
  const A = Math.sin((1 - k) * d) / Math.sin(d), B = Math.sin(k * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return [Math.atan2(z, Math.hypot(x, y)) / R, Math.atan2(y, x) / R];
}
/** angle between two [lon, lat] points, in radians */
function arc(a: LL, b: LL): number {
  const h = Math.sin(((b[1] - a[1]) * R) / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(((b[0] - a[0]) * R) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** the middle of some [lon, lat] points on the sphere */
function middle(P: LL[]): LL {
  let x = 0, y = 0, z = 0;
  for (const [lo, la] of P) { x += Math.cos(la * R) * Math.cos(lo * R); y += Math.cos(la * R) * Math.sin(lo * R); z += Math.sin(la * R); }
  return [Math.atan2(y, x) / R, Math.atan2(z, Math.hypot(x, y)) / R];
}
/** longitudes made continuous, so a line across the date line does not go round the world the other way */
function unwrap(P: LL[]): LL[] {
  const out: LL[] = [];
  let prev: number | null = null;
  for (const [lo0, la] of P) {
    let lo = lo0;
    if (prev != null) { while (lo - prev > 180) lo -= 360; while (lo - prev < -180) lo += 360; }
    out.push([lo, la]); prev = lo;
  }
  return out;
}
/** the great circle from a to b ([lat, lon]) as [lon, lat] points about every 40 km */
function greatCircle(a: [number, number], b: [number, number]): LL[] {
  const d = arc([a[1], a[0]], [b[1], b[0]]), n = Math.max(2, Math.min(256, Math.ceil((d * 6371) / 40)));
  const P: LL[] = [];
  for (let i = 0; i <= n; i++) { const p = along(a, b, i / n); P.push([p[1], p[0]]); }
  return unwrap(P);
}
/** a point `m` metres from p ([lon, lat]) towards bearing brg (degrees) */
function offset(p: LL, brg: number, m: number): LL {
  const d = m / 6371000, φ = p[1] * R, λ = p[0] * R, θ = brg * R;
  const φ2 = Math.asin(Math.sin(φ) * Math.cos(d) + Math.cos(φ) * Math.sin(d) * Math.cos(θ));
  const λ2 = λ + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ), Math.cos(d) - Math.sin(φ) * Math.sin(φ2));
  return [λ2 / R, φ2 / R];
}
function bearingLL(a: LL, b: LL): number {
  const [φ1, φ2, dλ] = [a[1] * R, b[1] * R, (b[0] - a[0]) * R];
  return (Math.atan2(Math.sin(dλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)) / R + 360) % 360;
}
const fc = (features: unknown[]) => ({ type: 'FeatureCollection', features });
const pt = (c: LL, properties: Record<string, unknown>) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties });
const line = (c: LL[], properties: Record<string, unknown>) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c }, properties });

/* ---------- the EFB Map's base map (vecStyle0 in the EFB), as a globe ---------- */
function baseStyle(dark: boolean): Record<string, unknown> {
  const C = dark
    ? { land: '#070909', water: '#0A2748', wline: '#0E3260', green: '#0A100E', urban: '#0D1012', ice: '#11161A', road: '#2A2F33', major: '#3A4046', motor: '#4A5158', casing: '#070909', bord: '#4B5866', bord2: '#2F3A44', rail: '#22272B', city: '#B9C3C8', town: '#8C979D', vill: '#6A757B', halo: '#000000', wtxt: '#5B86B8', apt: '#1C2124', rwy: '#2E3337', aptl: '#7FA7B5' }
    : { land: '#F3F4F1', water: '#C9E2EC', wline: '#B5D5E2', green: '#E2EBDD', urban: '#EBECE8', ice: '#F8FAFB', road: '#FFFFFF', major: '#FFFFFF', motor: '#FBE9C8', casing: '#D5D9D9', bord: '#9AA6AA', bord2: '#C2CACB', rail: '#D3D6D6', city: '#2F3A3D', town: '#4E5A5D', vill: '#6E797C', halo: '#FFFFFF', wtxt: '#4E7C96', apt: '#E2E4E3', rwy: '#C5C9CA', aptl: '#3D6A78' };
  const F = ['Noto Sans Regular'], FB = ['Noto Sans Bold'], name = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
  const W = (z0: number, w0: number, z1: number, w1: number) => ['interpolate', ['exponential', 1.5], ['zoom'], z0, w0, z1, w1];
  return {
    version: 8, glyphs: OFM + '/fonts/{fontstack}/{range}.pbf', sources: { o: { type: 'vector', url: OFM + '/planet' } },
    projection: { type: 'globe' },
    sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, dark ? 0.55 : 0.4, 5, dark ? 0.4 : 0.25, 7, 0] },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': C.land } },
      { id: 'lc-ice', type: 'fill', source: 'o', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'ice'], paint: { 'fill-color': C.ice } },
      { id: 'lc-green', type: 'fill', source: 'o', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'farmland', 'wetland']]], paint: { 'fill-color': C.green, 'fill-opacity': 0.7 } },
      { id: 'lu-urban', type: 'fill', source: 'o', 'source-layer': 'landuse', minzoom: 8, filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood', 'commercial', 'industrial', 'retail']]], paint: { 'fill-color': C.urban } },
      { id: 'park', type: 'fill', source: 'o', 'source-layer': 'park', minzoom: 8, paint: { 'fill-color': C.green, 'fill-opacity': 0.6 } },
      { id: 'water', type: 'fill', source: 'o', 'source-layer': 'water', paint: { 'fill-color': C.water } },
      { id: 'waterway', type: 'line', source: 'o', 'source-layer': 'waterway', minzoom: 8, paint: { 'line-color': C.wline, 'line-width': W(8, 0.5, 15, 3) } },
      { id: 'apt-area', type: 'fill', source: 'o', 'source-layer': 'aeroway', minzoom: 10, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': C.apt } },
      { id: 'apt-rwy', type: 'line', source: 'o', 'source-layer': 'aeroway', minzoom: 9, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'class'], 'runway']], paint: { 'line-color': C.rwy, 'line-width': W(9, 1, 16, 40) } },
      { id: 'apt-twy', type: 'line', source: 'o', 'source-layer': 'aeroway', minzoom: 12, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'class'], 'taxiway']], paint: { 'line-color': C.rwy, 'line-width': W(12, 0.5, 17, 12) } },
      { id: 'bld', type: 'fill', source: 'o', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': C.urban, 'fill-outline-color': C.casing } },
      { id: 'rail', type: 'line', source: 'o', 'source-layer': 'transportation', minzoom: 10, filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': C.rail, 'line-width': W(10, 0.6, 16, 2) } },
      { id: 'road-minor', type: 'line', source: 'o', 'source-layer': 'transportation', minzoom: 11, filter: ['in', ['get', 'class'], ['literal', ['minor', 'tertiary', 'service']]], paint: { 'line-color': C.road, 'line-width': W(11, 0.4, 17, 8) } },
      { id: 'road-major-c', type: 'line', source: 'o', 'source-layer': 'transportation', minzoom: 6, filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'trunk']]], paint: { 'line-color': C.casing, 'line-width': W(6, 0.8, 17, 14) } },
      { id: 'road-major', type: 'line', source: 'o', 'source-layer': 'transportation', minzoom: 6, filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'trunk']]], paint: { 'line-color': C.major, 'line-width': W(6, 0.4, 17, 11) } },
      { id: 'road-motor-c', type: 'line', source: 'o', 'source-layer': 'transportation', minzoom: 5, filter: ['==', ['get', 'class'], 'motorway'], paint: { 'line-color': C.casing, 'line-width': W(5, 1, 17, 17) } },
      { id: 'road-motor', type: 'line', source: 'o', 'source-layer': 'transportation', minzoom: 5, filter: ['==', ['get', 'class'], 'motorway'], paint: { 'line-color': C.motor, 'line-width': W(5, 0.6, 17, 14) } },
      { id: 'bord2', type: 'line', source: 'o', 'source-layer': 'boundary', minzoom: 3, filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': C.bord2, 'line-dasharray': [3, 2], 'line-width': W(3, 0.5, 10, 1.2) } },
      { id: 'bord', type: 'line', source: 'o', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': C.bord, 'line-width': W(1, 0.6, 10, 1.8) } },
      { id: 'water-name', type: 'symbol', source: 'o', 'source-layer': 'water_name', layout: { 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 10, 13], 'text-max-width': 8 }, paint: { 'text-color': C.wtxt, 'text-halo-color': C.halo, 'text-halo-width': 1 } },
      { id: 'apt-name', type: 'symbol', source: 'o', 'source-layer': 'aerodrome_label', minzoom: 8, filter: ['has', 'icao'], layout: { 'text-field': ['get', 'icao'], 'text-font': FB, 'text-size': 11, 'text-offset': [0, 1.2] }, paint: { 'text-color': C.aptl, 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
      { id: 'place-vill', type: 'symbol', source: 'o', 'source-layer': 'place', minzoom: 10, filter: ['in', ['get', 'class'], ['literal', ['village', 'suburb']]], layout: { 'text-field': name, 'text-font': F, 'text-size': 11, 'text-max-width': 7 }, paint: { 'text-color': C.vill, 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
      { id: 'place-town', type: 'symbol', source: 'o', 'source-layer': 'place', minzoom: 7, filter: ['==', ['get', 'class'], 'town'], layout: { 'text-field': name, 'text-font': F, 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 12, 14], 'text-max-width': 7 }, paint: { 'text-color': C.town, 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
      { id: 'place-city', type: 'symbol', source: 'o', 'source-layer': 'place', minzoom: 4, filter: ['==', ['get', 'class'], 'city'], layout: { 'text-field': name, 'text-font': F, 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 10, 16], 'text-max-width': 7 }, paint: { 'text-color': C.city, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } },
      { id: 'place-country', type: 'symbol', source: 'o', 'source-layer': 'place', maxzoom: 7, filter: ['==', ['get', 'class'], 'country'], layout: { 'text-field': name, 'text-font': FB, 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 14], 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 8 }, paint: { 'text-color': C.town, 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },
    ],
  };
}

/* ---------- layers that can be switched ---------- */
type Lay = 'radar' | 'sig' | 'fir' | 'wx' | 'vatsim';
const LAYS: [Lay, string][] = [['radar', 'Weather radar'], ['sig', 'SIGMETs and AIRMETs'], ['fir', 'FIR boundaries'], ['wx', 'Airport weather'], ['vatsim', 'VATSIM traffic']];
const LAY_KEY = 'pmMapLayers';
function layersSaved(): Record<Lay, boolean> {
  const d: Record<Lay, boolean> = { radar: true, sig: true, fir: true, wx: true, vatsim: true };
  try { return { ...d, ...JSON.parse(localStorage.getItem(LAY_KEY) || '{}') }; } catch { return d; }
}
const CAT_COL: Record<string, string> = { VFR: '#2FA84F', MVFR: '#2F6FD6', IFR: '#C6372E', LIFR: '#A23CB8' };
/** SIGMET hazard -> colour (as the EFB's Map) */
function sigCat(h: string): string {
  const s = h.toUpperCase();
  if (/TS|CB|TSGR|CONVECT/.test(s)) return 'ts';
  if (/TURB|TB|MTW|LLWS/.test(s)) return 'tb';
  if (/ICE|ICING|FZRA/.test(s)) return 'ic';
  if (/VA|ASH|VOLC/.test(s)) return 'va';
  return 'ot';
}
const SIG_COL = ['match', ['get', 'cat'], 'ts', '#E0342B', 'tb', '#F2A33A', 'ic', '#2BB3C8', 'va', '#C2185B', '#7F8C99'];
const lvl = (v: number | null) => (v == null ? 'SFC' : v >= 18000 ? 'FL' + String(Math.round(v / 100)).padStart(3, '0') : v === 0 ? 'SFC' : v.toLocaleString('en-US') + ' ft');
/** the size of a ring's box in square degrees (a tap on two areas picks the smaller) */
const bbAr = (rings: LL[][]) => { let a = 180, b = 90, c = -180, d = -90; for (const r of rings) for (const [x, y] of r) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } return Math.max(0, (c - a) * (d - b)); };

/* ---------- VATSIM controllers (the EFB server's /api/efb/vatsim-atc, see ../src/vatspy.js) ---------- */
/** r: the polygons, each [outer ring, holes...] */
type AtcArea = { k: string; t: 'ctr' | 'fss' | 'app'; id: string; nm: string; lx: number; ly: number; bl?: LL; r: LL[][][]; cs: string[] };
type AtcCtl = { cs: string; cid: number; n: string; f: string; fac: string; rt: string; on: string; k: string; ap: string; x: string };
type AtcAtis = { cs: string; f: string; code: string; ap: string; on: string; x: string };
type AtcAns = { upd: string; h: string; areas: AtcArea[]; ctl: AtcCtl[]; atis: AtcAtis[]; apts: Record<string, [number, number, string, string]> };
/** an area's label: its shortest callsign without the facility ("RJTG_E_CTR" -> RJTG_E) */
function atcLbl(a: AtcArea): string {
  const cs = [...(a.cs || [])].sort((p, q) => p.length - q.length || (p < q ? -1 : 1))[0];
  if (!cs) return a.id;
  const p = cs.split('_').filter(Boolean);
  return p.length > 1 ? p.slice(0, -1).join('_') : cs;
}
const ATC_FAC = ['DEL', 'GND', 'TWR', 'APP', 'DEP'];
const atcFi = (c: AtcCtl) => { const i = ATC_FAC.indexOf(c.fac); return i < 0 ? 9 : i; };
const atcFq = (f: string) => (!f || f === '199.998' ? '—' : f);
const atcSince = (on: string) => { const t = Date.parse(on); if (!isFinite(t)) return ''; const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
/** the EFB's colours for them (its --green, --map-firl, --cyan, --red, --amber) */
const atcCols = (dark: boolean) => (dark
  ? { fill: '#4FC27E', line: '#5FCF92', ctrA: 0.16, appA: 0.28, chip: '#4FC27E', chipInk: '#06180F', D: '#5CC6E0', G: '#4FC27E', T: '#F06A6A', A: '#EBA537', off: '#56636A' }
  : { fill: '#2C7A4B', line: '#2C7A4B', ctrA: 0.12, appA: 0.22, chip: '#2C7A4B', chipInk: '#FFFFFF', D: '#0A6E87', G: '#2C7A4B', T: '#B42828', A: '#A4620A', off: '#A9B3B3' });
/** a label chip, stretched round its text (icon-text-fit) */
function atcChip(fill: string): ImageData {
  const c = document.createElement('canvas'); c.width = 24; c.height = 20;
  const g = c.getContext('2d')!;
  g.fillStyle = fill; g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(0.5, 0.5, 23, 19, 5); else g.rect(0.5, 0.5, 23, 19);
  g.fill();
  return g.getImageData(0, 0, 24, 20);
}

/** the aircraft (the EFB's glyph), pointing up */
const GLYPH = 'M0,-10 L1.5,-6.5 L1.5,-2.2 L9,2.2 L9,4 L1.5,2 L1.2,6.6 L4,8.6 L4,10 L0,9 L-4,10 L-4,8.6 L-1.2,6.6 L-1.5,2 L-9,4 L-9,2.2 L-1.5,-2.2 L-1.5,-6.5Z';
/** icon image: 96 px for a glyph 22 units across, at pixel ratio 2 (48 CSS px at icon-size 1, wingspan 39.3 px) */
const ICON_PX = 96, ICON_SPAN_CSS = (18 * ICON_PX) / 22 / 2;
function plane(fill: string, halo: string, glow?: string): ImageData {
  const c = document.createElement('canvas'); c.width = c.height = ICON_PX;
  const g = c.getContext('2d')!, k = ICON_PX / 22;
  g.translate(ICON_PX / 2, ICON_PX / 2); g.scale(k, k);
  const p = new Path2D(GLYPH);
  if (glow) { g.shadowColor = glow; g.shadowBlur = 4 * k; }
  g.lineJoin = 'round'; g.lineWidth = 1.6; g.strokeStyle = halo; g.stroke(p);
  g.shadowBlur = 0; g.fillStyle = fill; g.fill(p);
  return g.getImageData(0, 0, ICON_PX, ICON_PX);
}
/** an airport: a dot, ringed in its flight category when that is known (20 CSS px square) */
function aptMark(fill: string, stroke: string, ring?: string): ImageData {
  const c = document.createElement('canvas'); c.width = c.height = 40;
  const g = c.getContext('2d')!;
  if (ring) { g.beginPath(); g.arc(20, 20, 15, 0, Math.PI * 2); g.lineWidth = 4.6; g.strokeStyle = ring; g.stroke(); }
  g.beginPath(); g.arc(20, 20, 6.4, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.strokeStyle = stroke; g.stroke();
  return g.getImageData(0, 0, 40, 40);
}
/** icon-size for an aircraft: the usual symbol (`low`: [zoom, size] stops up to zoom 11), or its real size once that
 *  is bigger (feature property k: the size at zoom 0). The zoom stops stay at the top of the expression, as MapLibre needs. */
function acSize(low: [number, unknown][]): unknown {
  const s: unknown[] = ['interpolate', ['exponential', 2], ['zoom']];
  for (const [z, v] of low) s.push(z, v);
  const base = low[low.length - 1]![1];
  for (let z = 12; z <= 20; z++) s.push(z, ['max', base, ['*', ['get', 'k'], 2 ** z]]);
  return s;
}

/* ---------- the map ---------- */
export class OpsMap implements MapApi {
  /** resolves when the map is ready, or throws when it cannot be made (the old globe is used then) */
  static async create(stage: HTMLElement, opts: GlobeOptions, onDead?: () => void): Promise<OpsMap> {
    if (!webgl()) throw new Error('No WebGL');
    const late = (what: string) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error(what + ' is slow')), 20000));
    const lib = await Promise.race([loadLib(), late('The map library')]);
    const v = String((typeof lib.getVersion === 'function' && lib.getVersion()) || lib.version || '');
    if (v && !/^5\./.test(v)) throw new Error('MapLibre ' + v + ' is not 5');
    const m = new OpsMap(lib, stage, opts);
    try { await Promise.race([m.ready, late('The map')]); } catch (e) { m.destroy(); throw e; }
    m.start(onDead);
    return m;
  }

  private readonly map: ML;
  private readonly el: HTMLDivElement;
  private dark = isDark();
  readonly ready: Promise<void>;
  private flights: readonly LiveFlight[] = [];
  private selected: string | null = null;
  private airports: Apt[] = [];
  private on = layersSaved();
  private layouts = new Map<string, Layout | 'loading' | null>();
  private wx: Record<string, string> = {};
  private vs: unknown[] = [];
  private sig: unknown[] = [];
  private atc: AtcAns | null = null;
  private fir: { lines: unknown; labels: unknown } | null = null;
  private radarTiles = '';
  private spinOn = false;
  private spinRaf = 0;
  private lastTouch = 0;
  private popup: ML = null;
  private timers: number[] = [];
  private ro: ResizeObserver | null = null;
  private mo: MutationObserver | null = null;
  private stop = new AbortController();
  private ourKey = '';
  private aptKey = '';
  private aptSrc: unknown = null;
  private baseOk = false;
  private baseErr = 0;
  private col = { route: '#E2C08C', plane: '#C9B39F', trail: 'rgba(201,179,159,.3)', label: '#fff', halo: '#000', sphere: '#12171C', cl: '#C9A13A', stand: '#9AA7AE' };

  private constructor(private readonly lib: ML, private readonly stage: HTMLElement, private readonly opts: GlobeOptions) {
    this.el = document.createElement('div');
    this.el.className = 'lv-map';
    stage.prepend(this.el);
    injectCss();
    this.readColours();
    this.map = new lib.Map({
      container: this.el, style: baseStyle(this.dark), center: [-150, 28], zoom: this.ovZoom(28), attributionControl: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0, maxZoom: 19.5, fadeDuration: 250,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
    });
    this.el.classList.toggle('dk', this.dark);
    (window as unknown as { pmMap?: ML }).pmMap = this.map; // for a look from the console
    this.map.touchZoomRotate?.disableRotation?.();
    this.map.keyboard?.disableRotation?.();
    this.map.addControl(new lib.AttributionControl({ compact: true, customAttribution: 'Radar <a href="https://www.rainviewer.com" target="_blank" rel="noopener">RainViewer</a> · SIGMETs aviationweather.gov · FIRs openAIP, VATSpy · Traffic VATSIM · ATC areas VATSpy, SimAware TRACON (CC BY-SA 4.0)' }), 'top-right');
    this.ready = new Promise<void>((res) => { this.map.once('style.load', () => res()); });
    this.map.on('style.load', () => this.onStyle());
    // the base map's tiles: seen arriving, or failing (then the old globe takes over, see start)
    this.map.on('data', (e: { dataType?: string; sourceId?: string; tile?: unknown }) => { if (e.dataType === 'source' && e.sourceId === 'o' && e.tile) this.baseOk = true; });
    this.map.on('error', (e: { sourceId?: string; error?: { message?: string; url?: string } }) => {
      const msg = String((e && e.error && (e.error.message || e.error.url)) || '');
      if ((e && e.sourceId === 'o') || /openfreemap/.test(msg)) this.baseErr++;
      console.warn('[Flight Watch map]', msg || e);
    });
    this.ro = new ResizeObserver(() => this.map.resize());
    this.ro.observe(this.el);
    opts.signal.addEventListener('abort', () => this.destroy());
  }
  /** once the map is up: input, the layer switches, light and dark, and the data that comes on its own clock */
  private start(onDead?: () => void): void {
    const signal = this.stop.signal;
    const dead = window.setTimeout(() => { if (!this.baseOk && this.baseErr && onDead) { this.destroy(); onDead(); } }, 12000);
    // on a narrow map the credits take three lines: shown first, folded to the (i) after a few seconds (a drag folds them too)
    const fold = window.setTimeout(() => { const a = this.el.querySelector('.maplibregl-ctrl-attrib'); if (a && this.el.clientWidth <= 640 && a.classList.contains('maplibregl-compact-show')) { a.classList.remove('maplibregl-compact-show'); a.removeAttribute('open'); } }, 6000);
    signal.addEventListener('abort', () => { clearTimeout(dead); clearTimeout(fold); });
    this.bind();
    this.layerUi();
    const watch = () => { const d = isDark(); if (d === this.dark) return; this.dark = d; this.el.classList.toggle('dk', d); this.readColours(); try { this.map.setStyle(baseStyle(d), { diff: false }); } catch { /* next time */ } };
    this.mo = new MutationObserver(watch);
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', watch, { signal });
    // asked only while Flight Watch is on screen
    this.every(() => this.loadVatsim(), 30_000);
    this.every(() => this.loadAtc(), 60_000);
    this.every(() => this.loadSig(), 300_000);
    this.every(() => this.loadRadar(), 300_000);
    this.every(() => this.loadWx(), 600_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.refresh(); if (this.spinOn) this.spin(); } }, { signal });
    window.addEventListener('pm:tab', () => { if (this.shown()) setTimeout(() => { this.map.resize(); this.refresh(); }, 0); }, { signal });
    this.refresh();
  }
  destroy(): void {
    this.stop.abort(); this.ro?.disconnect(); this.mo?.disconnect();
    this.timers.forEach((t) => clearInterval(t)); this.timers = [];
    cancelAnimationFrame(this.spinRaf); this.spinOn = false;
    try { this.map.remove(); } catch { /* gone */ }
    this.el.remove();
    this.stage.querySelector('[data-lvl]')?.remove();
    this.stage.querySelector('.lv-lay')?.remove();
  }

  /* ---------- MapApi ---------- */
  setFlights(flights: readonly LiveFlight[], selected: string | null): void {
    if (selected !== this.selected) this.popup?.remove();
    this.flights = flights; this.selected = selected;
    this.drawFlights();
    const key = flights.map((f) => f.callsign).join();
    if (key !== this.ourKey) { this.ourKey = key; this.drawVatsim(); }
  }
  setAirports(list: readonly Apt[]): void {
    const was = this.airports.map((a) => a.icao).join();
    this.airports = list.filter((a) => isFinite(a.lat) && isFinite(a.lon));
    this.drawAirports();
    if (was !== this.airports.map((a) => a.icao).join()) void this.loadWx();
  }
  setIdleSpin(on: boolean): void { this.spinOn = on && !reduced(); if (this.spinOn) this.spin(); }
  pose(centre: LL, zoom: number): void { this.map.jumpTo({ center: centre, zoom: this.ovZoom(centre[1]) + Math.log2(Math.max(1e-3, zoom)) }); }
  overview(animate = true): void {
    const c = this.map.getCenter();
    this.go([c.lng, Math.max(-50, Math.min(50, c.lat))], this.ovZoom(c.lat), animate);
  }
  zoomBy(factor: number): void { this.touch(); this.map.easeTo({ zoom: this.map.getZoom() + Math.log2(factor), duration: reduced() ? 0 : 300 }); }
  frameFlight(f: LiveFlight, animate = true): void {
    const { w, h } = this.size(), free = Math.min(w, h);
    if (f.ground) {
      // on the ground: about 3.5 km across, so the stands and taxiways around it show
      this.go([f.lon, f.lat], Math.log2((78271.52 * Math.cos(f.lat * R) * 0.8 * free) / 3500), animate);
      return;
    }
    const P: LL[] = [[f.lon, f.lat]];
    if (f.dep) P.push([f.dep.lon, f.dep.lat]);
    if (f.arr) P.push([f.arr.lon, f.arr.lat]);
    const c = P.length === 1 ? P[0]! : middle(P);
    const reach = Math.max(...P.map((p) => arc(c, p))) + 0.06;
    // a point `reach` from the centre lands at radius·sin(reach) on the globe: keep it inside ~80% of the map
    const Rpx = (0.4 * free) / Math.sin(Math.min(reach, Math.PI / 2));
    this.go(c, Math.min(7.5, this.zoomForRadius(Rpx, c[1])), animate);
  }

  /* ---------- camera ---------- */
  private size() { return { w: this.el.clientWidth || 1, h: this.el.clientHeight || 1 }; }
  /** MapLibre's globe: radius = world size / 2π, scaled by 1 / cos(latitude) of the centre */
  private zoomForRadius(px: number, lat: number): number { return Math.log2((px * 2 * Math.PI * Math.cos(Math.max(-80, Math.min(80, lat)) * R)) / 512); }
  private ovZoom(lat = 20): number { const { w, h } = this.size(); return this.zoomForRadius(0.4 * Math.min(w, h), lat); }
  private go(c: LL, zoom: number, animate: boolean): void {
    this.popup?.remove();
    if (!animate || reduced()) this.map.jumpTo({ center: c, zoom });
    else this.map.flyTo({ center: c, zoom, duration: 1600, essential: true });
  }
  private touch(): void { this.lastTouch = performance.now(); }
  /** the slow turn of the planet while nothing is open and nobody moves it */
  private spin(): void {
    if (this.spinRaf) return;
    let last = performance.now(), skip = false, vel = 0;
    const step = (t: number) => {
      this.spinRaf = 0;
      if (!this.spinOn || !this.shown() || document.hidden) return;
      this.spinRaf = requestAnimationFrame(step);
      const dt = Math.min(100, t - last); last = t;
      skip = !skip; if (skip) return; // every other frame is plenty for 4° a second
      if (t - this.lastTouch < 2000 || this.map.isMoving() || this.map.getZoom() > this.ovZoom(this.map.getCenter().lat) + 1.3) { vel = 0; return; }
      const c = this.map.getCenter(), d = dt * 2; // this frame and the one skipped
      if (!vel) this.popup?.remove();
      vel += (6 - vel) * Math.min(1, d / 500);
      this.map.jumpTo({ center: [c.lng - (vel * d) / 1000, c.lat] });
    };
    this.spinRaf = requestAnimationFrame(step);
  }
  private shown(): boolean { return document.body.dataset.tab === 'fw' && !!this.el.offsetParent; }

  /* ---------- input ---------- */
  private bind(): void {
    const m = this.map;
    const user = (e: { originalEvent?: unknown }) => { if (e && e.originalEvent) { this.touch(); this.opts.onUserMove?.(); } };
    m.on('dragstart', user); m.on('zoomstart', user); m.on('rotatestart', user);
    m.on('moveend', () => this.near());
    const hit = (p: { x: number; y: number }, layers: string[], r = 12) => {
      const L = layers.filter((l) => m.getLayer(l));
      return L.length ? m.queryRenderedFeatures([[p.x - r, p.y - r], [p.x + r, p.y + r]], { layers: L }) : [];
    };
    m.on('click', (e: { point: { x: number; y: number }; lngLat: unknown }) => {
      const a = hit(e.point, ['pm-ac']);
      if (a.length) { this.opts.onPick(String(a[0].properties.cs)); return; }
      // the controllers' marks and labels before a VATSIM aircraft: drawn over the traffic, a busy airport's would hide them
      const am = hit(e.point, ['atc-a'], 4);
      if (am.length) { this.note(am[0].geometry.coordinates, this.atcNote('A:' + am[0].properties.ic)); return; }
      const ac = hit(e.point, ['atc-t', 'atc-ta'], 4);
      if (ac.length) { this.note(e.lngLat, this.atcNote(String(ac[0].properties.k))); return; }
      const v = hit(e.point, ['vs-ac', 'vs-gnd']);
      if (v.length) { const p = v[0].properties; this.note(v[0].geometry.coordinates, `<b>${esc(p.c)}</b>${p.ac ? ' · ' + esc(p.ac) : ''}<br>${esc(p.dep || '····')} → ${esc(p.arr || '····')}<br>${p.g < 50 ? 'On the ground' : esc(lvl(+p.a)) + ' · ' + Math.round(+p.g) + ' kt'}<br><small>VATSIM</small>`); return; }
      const s = hit(e.point, ['sig-f']);
      // a controller's area under the tap (the smallest), unless a SIGMET there is smaller still
      const af = m.getLayer('atc-f') ? m.queryRenderedFeatures(e.point, { layers: ['atc-f'] }) : [];
      const at = af.length ? af.reduce((b: { properties: { ar: number } }, f: { properties: { ar: number } }) => (+f.properties.ar < +b.properties.ar ? f : b)) : null;
      // areas cover most of the map: with a note open, a click in one only closes it
      if (at && (!s.length || +s[0].properties.ar > +at.properties.ar)) { if (this.popup?.isOpen?.()) { this.popup.remove(); return; } this.note(e.lngLat, this.atcNote(String(at.properties.k))); return; }
      if (s.length) { const p = s[0].properties; this.note(e.lngLat, `<b>${esc(p.kind)} · ${esc(p.hz)}</b>${p.q ? ' ' + esc(p.q) : ''}${p.lv || p.fir ? '<br>' + esc([p.lv, p.fir].filter(Boolean).join(' · ')) : ''}${p.raw ? `<pre>${esc(String(p.raw).slice(0, 600))}</pre>` : ''}`); return; }
      this.popup?.remove();
    });
    m.on('mousemove', (e: { point: { x: number; y: number } }) => {
      m.getCanvas().style.cursor = hit(e.point, ['pm-ac', 'vs-ac', 'vs-gnd', 'atc-a', 'atc-t', 'atc-ta']).length ? 'pointer' : '';
    });
  }
  private note(at: unknown, html: string): void {
    this.popup?.remove();
    this.popup = new this.lib.Popup({ closeButton: true, maxWidth: '320px', className: 'lv-pop' }).setLngLat(at).setHTML(html).addTo(this.map);
  }

  /* ---------- the layer switches ---------- */
  private layerUi(): void {
    const ctl = this.stage.querySelector('.lv-ctl');
    if (ctl && !ctl.querySelector('[data-lvl]')) ctl.insertAdjacentHTML('afterbegin', '<button data-lvl aria-label="Map layers" aria-expanded="false" title="Map layers"><svg viewBox="0 0 24 24"><path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="m2.5 12.2 9.5 5 9.5-5"/><path d="m2.5 16.4 9.5 5 9.5-5"/></svg></button>');
    const box = document.createElement('div');
    box.className = 'lv-lay'; box.hidden = true;
    box.innerHTML = '<b>Map layers</b>' + LAYS.map(([k, t]) => `<label><input type="checkbox" data-lay="${k}"${this.on[k] ? ' checked' : ''}><span>${t}</span></label>`).join('');
    this.stage.appendChild(box);
    const btn = this.stage.querySelector<HTMLElement>('[data-lvl]');
    const signal = this.stop.signal;
    btn?.addEventListener('click', (e) => { e.stopPropagation(); box.hidden = !box.hidden; btn.setAttribute('aria-expanded', String(!box.hidden)); }, { signal });
    document.addEventListener('click', (e) => { if (!box.hidden && !(e.target as HTMLElement).closest('.lv-lay,[data-lvl]')) { box.hidden = true; btn?.setAttribute('aria-expanded', 'false'); } }, { signal });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) { e.stopPropagation(); box.hidden = true; btn?.setAttribute('aria-expanded', 'false'); btn?.focus(); } }, { signal, capture: true });
    box.addEventListener('change', (e) => {
      const i = e.target as HTMLInputElement, k = i.dataset.lay as Lay | undefined;
      if (!k) return;
      this.on[k] = i.checked;
      try { localStorage.setItem(LAY_KEY, JSON.stringify(this.on)); } catch { /* private mode */ }
      this.vis();
      if (i.checked) { if (k === 'vatsim') { void this.loadVatsim(true); this.drawAtc(); void this.loadAtc(true); } if (k === 'sig') void this.loadSig(true); if (k === 'radar') void this.loadRadar(true); if (k === 'wx') void this.loadWx(true); if (k === 'fir') void this.loadFir(); }
      else if (k === 'vatsim') { this.drawVatsim(); this.drawAtc(); }
      if (k === 'wx') this.drawAirports();
    }, { signal });
  }
  private vis(): void {
    const m = this.map, set = (ids: string[], on: boolean) => { for (const id of ids) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    set(['radar'], this.on.radar);
    set(['sig-f', 'sig-l', 'sig-t'], this.on.sig);
    set(['fir-l', 'fir-lo', 'fir-t'], this.on.fir);
    set(['vs-ac', 'vs-gnd', 'vs-l', 'atc-f', 'atc-l', 'atc-t', 'atc-ta', 'atc-a'], this.on.vatsim);
  }

  /* ---------- style: our sources and layers, again after every new base style ---------- */
  private readColours(): void {
    const cs = getComputedStyle(document.getElementById('live') || document.documentElement), v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
    this.col = { route: v('--g-route', '#E2C08C'), plane: v('--g-plane', '#C9B39F'), trail: v('--g-trail', 'rgba(201,179,159,.3)'), label: v('--g-label', '#fff'), halo: this.dark ? '#05080A' : '#FFFFFF', sphere: v('--g-sphere', '#12171C'), cl: v('--g-cl', '#C9A13A'), stand: v('--g-stand', '#9AA7AE') };
  }
  private onStyle(): void {
    const m = this.map, C = this.col, E = fc([]);
    const add = (id: string) => { if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: E }); };
    for (const id of ['fir', 'firl', 'sig', 'lay-st', 'lay-twy', 'lay-rw', 'pm-apt', 'vs', 'pm-trail', 'pm-route', 'pm-ac', 'atc', 'atcln', 'atct', 'atca']) add(id);
    const img = (id: string, d: ImageData) => { if (m.hasImage(id)) m.removeImage(id); m.addImage(id, d, { pixelRatio: 2 }); };
    img('pm-ac', plane(C.plane, C.halo));
    img('pm-ac-sel', plane(C.route, C.halo, C.route));
    img('vs-ac', plane(this.dark ? '#6F8A99' : '#7A8C96', C.halo));
    img('vs-gnd', plane(this.dark ? '#8A7D63' : '#A08B66', C.halo));
    img('apt', aptMark(C.sphere, C.route));
    for (const k of Object.keys(CAT_COL)) img('apt-' + k, aptMark(C.sphere, C.route, CAT_COL[k]));
    const below = m.getLayer('water-name') ? 'water-name' : undefined; // under the base map's names
    const L = (l: Record<string, unknown>, before?: string) => { if (!m.getLayer(l.id as string)) m.addLayer(l, before); };
    // weather, airspace: under the names
    if (this.radarTiles) this.addRadar();
    // controllers' areas (under the SIGMETs, as on the EFB): centres lighter, approaches stronger
    const AC = atcCols(this.dark);
    if (m.hasImage('atc-chip')) m.removeImage('atc-chip');
    m.addImage('atc-chip', atcChip(AC.chip), { pixelRatio: 2, stretchX: [[6, 18]], stretchY: [[6, 14]], content: [6, 4, 18, 16] });
    L({ id: 'atc-f', type: 'fill', source: 'atc', paint: { 'fill-color': AC.fill, 'fill-opacity': ['case', ['==', ['get', 'app'], 1], AC.appA, AC.ctrA] } }, below);
    L({ id: 'atc-l', type: 'line', source: 'atcln', layout: { 'line-join': 'round' }, paint: { 'line-color': AC.line, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.8, 5, 1.6] } }, below);
    const strong = ['==', ['get', 'sg'], 1]; // a SIGMET; AIRMET-type areas are drawn quieter
    L({ id: 'sig-f', type: 'fill', source: 'sig', paint: { 'fill-color': SIG_COL, 'fill-opacity': ['case', strong, this.dark ? 0.14 : 0.11, 0.045] } }, below);
    L({ id: 'sig-l', type: 'line', source: 'sig', paint: { 'line-color': SIG_COL, 'line-width': ['case', strong, 1.3, 0.8], 'line-opacity': ['case', strong, 0.85, 0.5] } }, below);
    const firPaint = { 'line-color': this.dark ? '#3FB98A' : '#2F9E6E', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 6, 1.1], 'line-opacity': 0.5 };
    L({ id: 'fir-l', type: 'line', source: 'fir', filter: ['!=', ['get', 'oceanic'], '1'], paint: firPaint }, below);
    L({ id: 'fir-lo', type: 'line', source: 'fir', filter: ['==', ['get', 'oceanic'], '1'], paint: { ...firPaint, 'line-dasharray': [4, 3] } }, below);
    // close in at an airport: taxiway centre lines
    L({ id: 'lay-cl', type: 'line', source: 'lay-twy', minzoom: 14.5, paint: { 'line-color': C.cl, 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 14.5, 0.6, 19, 2], 'line-opacity': 0.85 } });
    L({ id: 'lay-st', type: 'circle', source: 'lay-st', minzoom: 15, paint: { 'circle-radius': 2, 'circle-color': C.stand } });
    // labels and marks over everything of the base map
    L({ id: 'fir-t', type: 'symbol', source: 'firl', minzoom: 2.2, maxzoom: 8.5, layout: { 'text-field': ['get', 'id'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 2.2, 10, 6, 12], 'text-letter-spacing': 0.04, 'text-padding': 4 }, paint: { 'text-color': this.dark ? '#3FB98A' : '#2F9E6E', 'text-halo-color': C.halo, 'text-halo-width': 1.2, 'text-opacity': 0.85 } });
    L({ id: 'sig-t', type: 'symbol', source: 'sig', minzoom: 2.5, maxzoom: 9, layout: { 'text-field': ['case', ['==', ['get', 'lv'], ''], ['get', 'hz'], ['concat', ['get', 'hz'], '\n', ['get', 'lv']]], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-padding': 6, 'symbol-sort-key': ['-', 1, ['get', 'sg']] }, paint: { 'text-color': SIG_COL, 'text-halo-color': C.halo, 'text-halo-width': 1.4, 'text-opacity': ['case', strong, 1, 0.75] } });
    L({ id: 'lay-twy-t', type: 'symbol', source: 'lay-twy', minzoom: 14, filter: ['!=', ['get', 'ref'], ''], layout: { 'symbol-placement': 'line', 'text-field': ['get', 'ref'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'symbol-spacing': 260, 'text-rotation-alignment': 'viewport', 'text-keep-upright': true }, paint: { 'text-color': '#111111', 'text-halo-color': '#F2C230', 'text-halo-width': 3 } });
    L({ id: 'lay-st-t', type: 'symbol', source: 'lay-st', minzoom: 16, layout: { 'text-field': ['get', 'ref'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-offset': [0, -0.9], 'text-padding': 1 }, paint: { 'text-color': this.dark ? '#B8C3C9' : '#4A565C', 'text-halo-color': C.halo, 'text-halo-width': 1.2 } });
    L({ id: 'lay-rw-t', type: 'symbol', source: 'lay-rw', minzoom: 12.5, layout: { 'text-field': ['get', 'ref'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#FFFFFF', 'text-halo-color': '#1D1F22', 'text-halo-width': 3 } });
    // the Polaris airports: always shown, and the base map's names give way to them; gone close in, where the airport itself shows
    L({ id: 'pm-apt', type: 'symbol', source: 'pm-apt', maxzoom: 12.5, layout: { 'icon-image': ['case', ['!=', ['get', 'c'], ''], ['concat', 'apt-', ['get', 'c']], 'apt'], 'icon-size': ['case', ['==', ['get', 'sel'], 1], 1.25, 1], 'icon-allow-overlap': true,
      'text-field': ['get', 'code'], 'text-font': ['Noto Sans Bold'], 'text-size': ['case', ['==', ['get', 'sel'], 1], 12, 10.5], 'text-offset': [0, 0.95], 'text-anchor': 'top', 'text-optional': true, 'symbol-sort-key': ['-', 1, ['get', 'sel']] }, paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } });
    // traffic
    L({ id: 'vs-gnd', type: 'symbol', source: 'vs', minzoom: 9, filter: ['<', ['get', 'g'], 50], layout: { 'icon-image': 'vs-gnd', 'icon-size': acSize([[9, 0.3], [11, 0.36]]), 'icon-rotate': ['get', 'h'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
    L({ id: 'vs-ac', type: 'symbol', source: 'vs', filter: ['>=', ['get', 'g'], 50], layout: { 'icon-image': 'vs-ac', 'icon-size': acSize([[1, 0.22], [6, 0.32], [11, 0.4]]), 'icon-rotate': ['get', 'h'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.55, 6, 0.85] } });
    L({ id: 'vs-l', type: 'symbol', source: 'vs', minzoom: 6.5, layout: { 'text-field': ['get', 'c'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-offset': [1.1, 0], 'text-anchor': 'left', 'text-optional': true }, paint: { 'text-color': this.dark ? '#8FA3AF' : '#5E707A', 'text-halo-color': C.halo, 'text-halo-width': 1.2 } });
    // over the traffic (a busy airport's would hide them), under the Polaris flights: controllers' callsigns (a centre's at its label point, an approach's under its bottom edge) and the airports' D/G/T/A
    const chipL = { 'text-field': ['get', 't'], 'text-font': ['Noto Sans Bold'], 'text-size': 10.5, 'icon-image': 'atc-chip', 'icon-text-fit': 'both', 'icon-text-fit-padding': [1, 5, 1, 5], 'text-padding': 2 };
    L({ id: 'atc-t', type: 'symbol', source: 'atct', minzoom: 1.6, filter: ['==', ['get', 'app'], 0], layout: chipL, paint: { 'text-color': AC.chipInk } });
    L({ id: 'atc-ta', type: 'symbol', source: 'atct', minzoom: 3.5, filter: ['==', ['get', 'app'], 1], layout: { ...chipL, 'text-anchor': 'top', 'text-offset': [0, 0.5] }, paint: { 'text-color': AC.chipInk } });
    const lit = (l: 'D' | 'G' | 'T' | 'A') => ['case', ['in', l, ['get', 'm']], AC[l], AC.off];
    L({ id: 'atc-a', type: 'symbol', source: 'atca', minzoom: 4, layout: { 'text-field': ['format', ['get', 'ic'], {}, '\n', {}, 'D', { 'text-color': lit('D') }, ' ', {}, 'G', { 'text-color': lit('G') }, ' ', {}, 'T', { 'text-color': lit('T') }, ' ', {}, 'A', { 'text-color': lit('A') }],
      'text-font': ['Noto Sans Bold'], 'text-size': 10.5, 'text-anchor': 'left', 'text-justify': 'left', 'text-offset': [0.8, 0], 'text-padding': 2 }, paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } });
    // the Polaris flights
    L({ id: 'pm-trail', type: 'line', source: 'pm-trail', filter: ['==', ['get', 'sel'], 0], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.trail, 'line-width': 1.2 } });
    L({ id: 'pm-trail-gap', type: 'line', source: 'pm-trail', filter: ['==', ['get', 'sel'], 2], layout: { 'line-cap': 'round' }, paint: { 'line-color': C.route, 'line-width': 1.5, 'line-opacity': 0.45 } });
    L({ id: 'pm-route', type: 'line', source: 'pm-route', layout: { 'line-cap': 'round' }, paint: { 'line-color': C.route, 'line-width': 1.4, 'line-opacity': 0.7, 'line-dasharray': [1, 2.5] } });
    L({ id: 'pm-trail-glow', type: 'line', source: 'pm-trail', filter: ['==', ['get', 'sel'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.route, 'line-width': 9, 'line-opacity': 0.16, 'line-blur': 5 } });
    L({ id: 'pm-trail-sel', type: 'line', source: 'pm-trail', filter: ['==', ['get', 'sel'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.route, 'line-width': 2.2 } });
    const isSel = ['==', ['get', 'sel'], 1];
    L({ id: 'pm-ac', type: 'symbol', source: 'pm-ac', layout: { 'icon-image': ['case', isSel, 'pm-ac-sel', 'pm-ac'], 'icon-size': acSize([[11, ['case', isSel, 0.62, 0.48]]]), 'icon-rotate': ['get', 'hdg'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'sel'],
      'text-field': ['case', isSel, '', ['get', 'cs']], 'text-font': ['Noto Sans Bold'], 'text-size': 10.5, 'text-offset': [1.25, 0], 'text-anchor': 'left', 'text-optional': true },
      paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.4, 'icon-opacity': ['case', ['==', ['get', 'dim'], 1], 0.7, 1] } });
    L({ id: 'pm-ac-t', type: 'symbol', source: 'pm-ac', filter: isSel, layout: { 'text-field': ['get', 'cs'], 'text-font': ['Noto Sans Bold'], 'text-size': 12.5, 'text-offset': [1.35, 0], 'text-anchor': 'left', 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': C.route, 'text-halo-color': C.halo, 'text-halo-width': 1.6 } });
    this.vis();
    this.drawAirports(); this.drawFlights(); this.drawVatsim(); this.drawSig(); this.drawLayouts(); this.drawAtc();
    if (this.fir) this.setData('fir', this.fir.lines), this.setData('firl', this.fir.labels);
    this.refresh();
  }
  private setData(id: string, data: unknown): void { const s = this.map.getSource(id); if (s) s.setData(data); }
  /** everything that loads on its own, now (a page come back to, a layer switched on) */
  private refresh(): void {
    if (!this.shown()) return;
    void this.loadFir(); void this.loadSig(); void this.loadRadar(); void this.loadWx(); void this.loadVatsim(); void this.loadAtc();
  }
  private every(fn: () => unknown, ms: number): void { this.timers.push(window.setInterval(() => { if (this.shown() && !document.hidden) void fn(); }, ms)); }

  /* ---------- Polaris flights and airports ---------- */
  private drawFlights(): void {
    if (!this.map.getSource('pm-ac')) return;
    const sel = this.flights.find((f) => f.callsign === this.selected) || null;
    const ac: unknown[] = [], tr: unknown[] = [];
    for (const f of this.flights) {
      const isSel = f === sel;
      ac.push(pt([f.lon, f.lat], { cs: f.callsign, hdg: Math.round(f.heading || 0), sel: isSel ? 1 : 0, dim: sel && !isSel ? 1 : 0,
        k: (f.span || 36) / (78271.52 * Math.cos(f.lat * R) * ICON_SPAN_CSS) }));
      const T = (f.trail || []).map((p): LL => [p[1], p[0]]);
      const last = T[T.length - 1];
      if (!last || Math.abs(last[0] - f.lon) + Math.abs(last[1] - f.lat) > 1e-4) T.push([f.lon, f.lat]);
      const flown = T.length > 1 ? T : isSel && f.dep ? greatCircle([f.dep.lat, f.dep.lon], [f.lat, f.lon]) : [];
      if (flown.length > 1) tr.push(line(unwrap(flown), { sel: isSel ? 1 : 0 }));
      // the track is only what has been recorded: a thin line joins it to the departure airport
      if (isSel && f.dep && T.length > 1 && arc(T[0]!, [f.dep.lon, f.dep.lat]) * 6371 > 15) tr.push(line(greatCircle([f.dep.lat, f.dep.lon], [T[0]![1], T[0]![0]]), { sel: 2 }));
    }
    this.setData('pm-ac', fc(ac));
    this.setData('pm-trail', fc(tr));
    this.setData('pm-route', fc(sel && sel.arr && !sel.ground ? [line(greatCircle([sel.lat, sel.lon], [sel.arr.lat, sel.arr.lon]), {})] : []));
    this.drawAirports();
  }
  private drawAirports(): void {
    if (!this.map.getSource('pm-apt')) return;
    const sel = this.flights.find((f) => f.callsign === this.selected) || null;
    const ends = new Set([sel?.dep?.icao, sel?.arr?.icao].filter(Boolean) as string[]);
    const cat = (i: string) => (this.on.wx && CAT_COL[this.wx[i] || ''] ? this.wx[i]! : '');
    // the flights are drawn twice a second as they move: the airports only when something about them changed
    const key = [...ends].join() + '|' + this.airports.map((a) => a.icao + cat(a.icao)).join();
    if (key === this.aptKey && this.map.getSource('pm-apt') === this.aptSrc) return;
    this.aptKey = key; this.aptSrc = this.map.getSource('pm-apt');
    this.setData('pm-apt', fc(this.airports.map((a) => pt([a.lon, a.lat], { icao: a.icao, code: a.iata || a.icao, sel: ends.has(a.icao) ? 1 : 0, c: cat(a.icao) }))));
  }

  /* ---------- VATSIM traffic (the EFB server's slim feed) ---------- */
  private vsAt = 0;
  private async loadVatsim(force = false): Promise<void> {
    if (!this.on.vatsim || (!force && Date.now() - this.vsAt < 25_000)) return;
    this.vsAt = Date.now();
    try {
      const r = await fetch('/api/efb/vatsim', { cache: 'no-store' }), j = await r.json();
      const f: string[] = j.f || [], ix = Object.fromEntries(f.map((k, i) => [k, i])) as Record<string, number>;
      this.vs = (j.p || []).filter((p: unknown[]) => isFinite(+(p[ix.la!] as number)) && isFinite(+(p[ix.lo!] as number))).map((p: unknown[]) => pt([+(p[ix.lo!] as number), +(p[ix.la!] as number)], {
        c: p[ix.c!], h: +(p[ix.h!] as number) || 0, a: +(p[ix.a!] as number) || 0, g: +(p[ix.g!] as number) || 0, ac: String(p[ix.ac!] || '').replace(/^[A-Z]\//, '').replace(/\/.*$/, ''), dep: p[ix.dep!] || '', arr: p[ix.arr!] || '',
        k: 36 / (78271.52 * Math.cos((+(p[ix.la!] as number) || 0) * R) * ICON_SPAN_CSS) }));
      this.drawVatsim();
    } catch { /* next time */ }
  }
  /** VATSIM traffic, less the Polaris flights (those are drawn as ours) */
  private drawVatsim(): void {
    const ours = new Set(this.flights.map((f) => f.callsign));
    this.setData('vs', fc(this.on.vatsim ? (this.vs as { properties: { c: string } }[]).filter((f) => !ours.has(f.properties.c)) : []));
  }

  /* ---------- VATSIM controllers (with the VATSIM traffic layer) ---------- */
  private atcFetchAt = 0;
  /** every minute; the server answers 304 while nobody logs on or off (the browser keeps the last answer) */
  private async loadAtc(force = false): Promise<void> {
    if (!this.on.vatsim || (!force && Date.now() - this.atcFetchAt < 55_000)) return;
    this.atcFetchAt = Date.now();
    try {
      const r = await fetch('/api/efb/vatsim-atc', { cache: 'no-cache' });
      if (!r.ok) return;
      const j = (await r.json()) as AtcAns;
      if (!j || !Array.isArray(j.areas) || !Array.isArray(j.ctl) || !Array.isArray(j.atis) || !j.apts) return;
      if (this.atc && j.h && j.h === this.atc.h) return;
      this.atc = j;
      this.drawAtc();
    } catch { /* next time */ }
  }
  /** the areas (each ring a polygon), their outlines less the stretches on the date line (where VATSpy cuts an area
   *  in two), their labels, and the airports with D/G/T/A online */
  private drawAtc(): void {
    const d = this.on.vatsim ? this.atc : null, F: unknown[] = [], Ln: unknown[] = [], T: unknown[] = [], A: unknown[] = [];
    for (const a of d?.areas || []) {
      const app = a.t === 'app' ? 1 : 0, ar = bbAr(a.r.flat()), segs: LL[][] = [];
      // each polygon with its holes (two polygons of an area may overlap: each is filled on its own)
      for (const pl of a.r) F.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: pl }, properties: { k: a.k, app, ar } });
      for (const r of a.r.flat()) {
        let cur: LL[] = [];
        for (let i = 0; i < r.length; i++) {
          const p = r[i]!, q = r[i - 1];
          if (q && Math.abs(p[0]) === 180 && p[0] === q[0]) { if (cur.length > 1) segs.push(cur); cur = [p]; continue; }
          cur.push(p);
        }
        if (cur.length > 1) segs.push(cur);
      }
      if (segs.length) Ln.push({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: segs }, properties: { app } });
      T.push(pt(app && a.bl ? a.bl : [a.lx, a.ly], { t: atcLbl(a), app, k: a.k }));
    }
    for (const [ic, v] of Object.entries(d?.apts || {})) if (v && v[3]) A.push(pt([v[1], v[0]], { ic, m: v[3] }));
    this.setData('atc', fc(F)); this.setData('atcln', fc(Ln)); this.setData('atct', fc(T)); this.setData('atca', fc(A));
  }
  /** the note for an area (its controllers) or an airport (its controllers and ATIS) */
  private atcNote(id: string): string {
    const d = this.atc; if (!d) return '';
    const row = (c: AtcCtl) => `<br><b>${esc(atcFq(c.f))}</b> ${esc(c.cs)}<br><small>${esc(c.n || '—')}${c.rt ? ' · ' + esc(c.rt) : ''}${c.on ? ' · online ' + esc(atcSince(c.on)) : ''}</small>`;
    if (id.startsWith('A:')) {
      const ic = id.slice(2), v = d.apts[ic];
      const L = d.ctl.filter((c) => c.ap === ic).sort((p, q) => atcFi(p) - atcFi(q) || (p.cs < q.cs ? -1 : 1)), S = d.atis.filter((a) => a.ap === ic);
      return `<b>${esc(ic)}</b>${v && v[2] ? ' · ' + esc(v[2]) : ''}` + L.map(row).join('')
        + S.map((a) => `<br><b>${esc(atcFq(a.f))}</b> ${esc(a.cs)}${a.code ? ' · information ' + esc(a.code) : ''}${a.x ? `<pre>${esc(a.x.slice(0, 600))}</pre>` : ''}`).join('');
    }
    const a = d.areas.find((x) => x.k === id); if (!a) return '';
    const L = d.ctl.filter((c) => c.k === id), kind = a.t === 'fss' ? 'Flight service' : a.t === 'app' ? (L.length && L.every((c) => c.fac === 'DEP') ? 'Departure' : 'Approach') : 'Centre';
    return `<b>${esc(atcLbl(a))}</b> · ${kind}${a.nm ? `<br><small>${esc(a.nm)}</small>` : ''}` + L.map((c) => row(c) + (c.x ? `<pre>${esc(c.x.slice(0, 400))}</pre>` : '')).join('');
  }

  /* ---------- SIGMETs / AIRMETs ---------- */
  private sigAt = 0;
  private async loadSig(force = false): Promise<void> {
    if (!this.on.sig || (!force && Date.now() - this.sigAt < 240_000)) return;
    this.sigAt = Date.now();
    try {
      const j = await (await fetch('/api/efb/sigmets', { cache: 'no-store' })).json(), now = Date.now() / 1000;
      this.sig = (j.sigmets || []).filter((s: { to: number | string | null; coords?: unknown[] }) => { const t = typeof s.to === 'number' ? (s.to > 1e11 ? s.to / 1000 : s.to) : s.to ? Date.parse(String(s.to)) / 1000 : NaN; return Array.isArray(s.coords) && s.coords.length >= 3 && (!isFinite(t) || t > now); })
        .map((s: { coords: [number, number][]; kind: string; hazard: string; qualifier: string; base: number | null; top: number | null; fir: string; raw: string }) => {
          const ring = unwrap(s.coords.map((c): LL => [c[1], c[0]]));
          const a = ring[0]!, b = ring[ring.length - 1]!;
          if (a[0] !== b[0] || a[1] !== b[1]) ring.push([a[0], a[1]]);
          return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { ar: bbAr([ring]), kind: s.kind || 'SIGMET', sg: /SIGMET/i.test(String(s.kind || 'SIGMET')) ? 1 : 0, hz: String(s.hazard || '').replace(/_/g, ' '), q: s.qualifier || '', cat: sigCat(s.hazard || ''), lv: !s.base && !s.top ? '' : lvl(s.base) + '–' + lvl(s.top), fir: s.fir || '', raw: s.raw || '' } };
        });
      this.drawSig();
    } catch { /* next time */ }
  }
  private drawSig(): void { this.setData('sig', fc(this.sig)); }

  /* ---------- FIR boundaries ---------- */
  private firBusy = false;
  private async loadFir(): Promise<void> {
    if (!this.on.fir || this.fir || this.firBusy) return;
    this.firBusy = true;
    try {
      const j = await (await fetch('/api/efb/fir?v=3', { cache: 'default' })).json();
      const seen = new Set<string>(), labels: unknown[] = [];
      for (const f of j.features || []) {
        const p = f.properties || {}, id = String(p.id || ''), lo = +p.label_lon, la = +p.label_lat;
        if (!id || id.includes('-') || seen.has(id) || !isFinite(lo) || !isFinite(la)) continue;
        seen.add(id); labels.push(pt([lo, la], { id }));
      }
      const lines = fc((j.features || []).filter((f: { geometry?: unknown }) => f && f.geometry));
      this.fir = { lines, labels: fc(labels) };
      this.setData('fir', lines); this.setData('firl', this.fir.labels);
    } catch { /* next time */ } finally { this.firBusy = false; }
  }

  /* ---------- weather radar (RainViewer's latest frame) ---------- */
  private radarAt = 0;
  private async loadRadar(force = false): Promise<void> {
    if (!this.on.radar || (!force && Date.now() - this.radarAt < 240_000)) return;
    this.radarAt = Date.now();
    try {
      const j = await (await fetch('/api/efb/radar', { cache: 'no-store' })).json(), f = (j.radar && j.radar.past) || [], last = f[f.length - 1];
      if (!last || !j.host) return;
      const t = j.host + last.path + '/256/{z}/{x}/{y}/2/1_1.png';
      if (t === this.radarTiles) return;
      this.radarTiles = t;
      const s = this.map.getSource('radar');
      if (s && s.setTiles) s.setTiles([t]); else this.addRadar();
    } catch { /* next time */ }
  }
  private addRadar(): void {
    const m = this.map;
    if (!m.getSource('radar')) m.addSource('radar', { type: 'raster', tiles: [this.radarTiles], tileSize: 256, maxzoom: 7, attribution: '' });
    if (!m.getLayer('radar')) m.addLayer({ id: 'radar', type: 'raster', source: 'radar', layout: { visibility: this.on.radar ? 'visible' : 'none' }, paint: { 'raster-opacity': this.dark ? 0.7 : 0.62, 'raster-fade-duration': 0 } }, m.getLayer('atc-f') ? 'atc-f' : m.getLayer('sig-f') ? 'sig-f' : m.getLayer('water-name') ? 'water-name' : undefined);
  }

  /* ---------- airport weather: the flight category at the Polaris airports ---------- */
  private wxAt = 0;
  private async loadWx(force = false): Promise<void> {
    if (!this.on.wx || !this.airports.length || (!force && Date.now() - this.wxAt < 540_000)) return;
    this.wxAt = Date.now();
    const want = new Set(this.airports.map((a) => a.icao)), cells = new Map<string, [number, number]>();
    for (const a of this.airports) { const la = Math.floor(a.lat / 2) * 2, lo = Math.floor(a.lon / 2) * 2; cells.set(la + ',' + lo, [la, lo]); }
    const out: Record<string, string> = {}, keys = [...cells.keys()];
    for (let i = 0; i < keys.length; i += 4) {
      await Promise.all(keys.slice(i, i + 4).map(async (k) => {
        try { const j = await (await fetch('/api/efb/metars?size=2&cell=' + k, { cache: 'default' })).json(); for (const s of j.stations || []) if (want.has(s.i) && s.c) out[s.i] = s.c; } catch { /* that cell next time */ }
      }));
    }
    this.wx = out; this.drawAirports();
  }

  /* ---------- close in at a Polaris airport: stands, taxiway names, runway ends ---------- */
  private near(): void {
    const load = this.opts.layout;
    if (!load || this.map.getZoom() < 11.5) return;
    const b = this.map.getBounds();
    let busy = 0;
    for (const v of this.layouts.values()) if (v === 'loading') busy++;
    const sel = this.flights.find((f) => f.callsign === this.selected);
    for (const a of [sel?.dep, sel?.arr, ...this.airports]) {
      if (!a || busy >= 2) { if (busy >= 2) break; continue; }
      if (this.layouts.has(a.icao) || !b.contains([a.lon, a.lat])) continue;
      busy++; this.layouts.set(a.icao, 'loading');
      load(a.icao).then((l) => { this.layouts.set(a.icao, l && ((l.runways && l.runways.length) || (l.taxiways && l.taxiways.length)) ? l : null); this.drawLayouts(); },
        () => { this.layouts.set(a.icao, null); setTimeout(() => this.layouts.delete(a.icao), 60_000); });
    }
  }
  private drawLayouts(): void {
    if (!this.map.getSource('lay-st')) return;
    const st: unknown[] = [], tw: unknown[] = [], rw: unknown[] = [];
    const pad = (x: string) => x.trim().toUpperCase().replace(/^0+(?=\d)/, '').replace(/^(\d)(?!\d)/, '0$1');
    for (const L of this.layouts.values()) {
      if (!L || L === 'loading') continue;
      for (const s of L.stands || []) if (s.ref) st.push(pt(s.pt as LL, { ref: s.ref }));
      for (const t of L.taxiways || []) if (t.pts && t.pts.length > 1) tw.push(line(t.pts as LL[], { ref: t.ref || '' }));
      // OpenStreetMap splits a runway into several ways: join them by number and name the two far ends
      const groups = new Map<string, { ends: string[]; pts: LL[] }>();
      for (const r of L.runways || []) {
        const ends = String(r.ref || '').split('/').map(pad).filter((e) => /^(0[1-9]|[12]\d|3[0-6])[LRC]?$/.test(e));
        if (!ends.length || !r.pts || r.pts.length < 2) continue;
        const key = [...ends].sort().join('/'), g = groups.get(key) || { ends, pts: [] };
        g.pts.push(r.pts[0] as LL, r.pts[r.pts.length - 1] as LL); groups.set(key, g);
      }
      for (const g of groups.values()) {
        let a = g.pts[0]!, b2 = g.pts[1]!, best = -1;
        for (let i = 0; i < g.pts.length; i++) for (let j = i + 1; j < g.pts.length; j++) { const d = arc(g.pts[i]!, g.pts[j]!); if (d > best) { best = d; a = g.pts[i]!; b2 = g.pts[j]!; } }
        const brg = bearingLL(a, b2), n0 = parseInt(g.ends[0]!, 10) * 10, d0 = Math.abs(((brg - n0 + 540) % 360) - 180);
        const [ea, eb] = d0 <= 90 ? [g.ends[0], g.ends[1]] : [g.ends[1], g.ends[0]];
        if (ea) rw.push(pt(offset(a, brg + 180, 160), { ref: ea }));
        if (eb) rw.push(pt(offset(b2, brg, 160), { ref: eb }));
      }
    }
    this.setData('lay-st', fc(st)); this.setData('lay-twy', fc(tw)); this.setData('lay-rw', fc(rw));
  }
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function injectCss(): void {
  if (document.getElementById('lvMapCss')) return;
  const s = document.createElement('style');
  s.id = 'lvMapCss';
  s.textContent = `
.lv-stage>.lv-map{position:absolute;inset:0;z-index:0;font:inherit}
.lv-map .maplibregl-ctrl-attrib{font-size:10.5px;color:var(--label)}
.lv-map .maplibregl-ctrl-attrib a{color:var(--label)}
.lv-map .maplibregl-ctrl-attrib.maplibregl-compact{background:color-mix(in srgb,var(--bg) 88%,transparent)}
.lv-map.dk .maplibregl-ctrl-attrib-button{filter:invert(1)}
.lv-stage .lv-src,.lv-stage .lv-ctl{z-index:2}
.lv-lay{position:absolute;right:64px;bottom:16px;z-index:3;display:grid;gap:7px;min-width:190px;padding:10px 14px 12px;background:var(--bg);border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 30px -12px rgba(0,0,0,.45);font-size:13px;color:var(--ink)}
.lv-lay[hidden]{display:none}
.lv-lay b{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--label);font-weight:600}
.lv-lay label{display:flex;align-items:center;gap:9px;margin:0;padding:1px 0;font-size:13px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--ink);cursor:pointer;white-space:nowrap}
.lv-lay input{margin:0;width:15px;height:15px;accent-color:var(--accent)}
.lv-ctl [data-lvl][aria-expanded=true]{background:color-mix(in srgb,var(--ink) 10%,transparent)}
.lv-pop .maplibregl-popup-content{background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:9px 26px 9px 11px;font-size:12.5px;line-height:1.45;box-shadow:0 10px 30px -12px rgba(0,0,0,.5)}
.lv-pop .maplibregl-popup-tip{display:none}
.lv-pop .maplibregl-popup-close-button{color:var(--label);font-size:16px;right:4px;top:2px}
.lv-pop small{color:var(--label)}
.lv-pop pre{margin:6px 0 0;white-space:pre-wrap;font-size:11px;line-height:1.35;color:var(--label);max-height:160px;overflow:auto}
`;
  document.head.appendChild(s);
}

/* ---------- the map Flight Watch uses: this one, or the old globe when it cannot be made ---------- */
export function createMap(stage: HTMLElement, canvas: HTMLCanvasElement, opts: GlobeOptions): MapApi {
  const st = { flights: [] as readonly LiveFlight[], sel: null as string | null, apts: [] as readonly Apt[], spin: false, cam: null as null | ((m: MapApi, now: boolean) => void) };
  let impl: MapApi | null = null;
  const start = (m: MapApi) => { impl = m; m.setAirports(st.apts); m.setFlights(st.flights, st.sel); m.setIdleSpin(st.spin); st.cam?.(m, false); };
  const old = () => { impl = null; canvas.style.display = ''; const g = new Globe(canvas, opts); g.pose([-150, 28], 1); start(g); };
  const why = (e: unknown) => console.warn('[Flight Watch] the map could not be used, so the globe is drawn instead:', e instanceof Error ? e.message : e);
  // ?globe in the address asks for the canvas globe
  if (/[?&]globe\b/.test(location.search)) old();
  else {
    canvas.style.display = 'none';
    OpsMap.create(stage, opts, () => { why('the base map did not load'); old(); }).then((m) => { m.pose([-150, 28], 1); start(m); }, (e) => { why(e); stage.querySelector('.lv-map')?.remove(); old(); });
  }
  const later = (f: (m: MapApi, now: boolean) => void) => { st.cam = f; if (impl) f(impl, true); };
  return {
    setFlights: (f, s) => { st.flights = f; st.sel = s; impl?.setFlights(f, s); },
    setAirports: (a) => { st.apts = a; impl?.setAirports(a); },
    setIdleSpin: (on) => { st.spin = on; impl?.setIdleSpin(on); },
    frameFlight: (f, a) => later((m, now) => m.frameFlight(f, now ? a : false)),
    pose: (c, z, l) => later((m) => m.pose(c, z, l)),
    overview: (a) => later((m, now) => m.overview(now ? a : false)),
    zoomBy: (k) => impl?.zoomBy(k),
  };
}
