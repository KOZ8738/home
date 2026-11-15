/**
 * Live globe for the Network page: orthographic projection drawn on a canvas with d3-geo.
 * Drag to turn the globe, scroll or pinch-buttons to zoom, click an aircraft to pick it.
 * Colours come from CSS custom properties on the canvas (--g-*), so light and dark mode just work.
 */
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
const prefersReducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('rm');
type Apt = { lat: number; lon: number; icao: string; iata?: string };
export interface LiveFlight { callsign: string; lat: number; lon: number; heading: number; trail: [number, number][]; dep?: Apt | null; arr?: Apt | null;
  /** wingspan in metres: zoomed in close, the aircraft is drawn to scale */ span?: number; ground?: boolean }
type Pt = [number, number];
/** Airport diagram from the EFB server (/api/efb/airport-layout, OpenStreetMap); points are [lon, lat] */
export interface Layout {
  airport: { icao: string; lat: number | null; lon: number | null };
  runways: { ref: string; width: number | null; pts: Pt[] }[];
  taxiways: { ref: string; kind: string; width: number | null; pts: Pt[] }[];
  aprons: Pt[][]; apronHoles?: Pt[][];
  buildings: { name?: string; pts: Pt[] }[];
  stands: { ref: string; pt: Pt }[];
}
const EARTH_KM = 6371;
const smooth = (x: number, a: number, b: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
import { LAND_RINGS } from './land';

export type LonLat = [number, number];

const LAND: GeoPermissibleObjects = {
  type: 'MultiPolygon',
  coordinates: LAND_RINGS.map((flat) => {
    const ring: LonLat[] = [];
    for (let i = 0; i < flat.length; i += 2) ring.push([flat[i]!, flat[i + 1]!]);
    ring.push(ring[0]!);
    return [ring];
  }),
};
const GRATICULE = geoGraticule10();
const SPHERE: GeoPermissibleObjects = { type: 'Sphere' };

const MIN_ZOOM = 1;
/** Close enough to read taxiway letters (about 1.5 m a pixel on a laptop screen) */
const MAX_ZOOM = 14000;
/** Globe radius at zoom 1, as a share of the shorter canvas side. */
const BASE_RADIUS = 0.4;
const PICK_RADIUS_PX = 18;
const IDLE_SPIN_DEG_PER_S = 6;
/** After a drag or zoom, the planet starts turning again this soon. */
const IDLE_AFTER_MS = 2000;
/** The idle spin only runs while most of the planet is in view. */
const SPIN_MAX_ZOOM = 2.5;
/** After a fling the globe keeps turning and slows down with this time constant. */
const COAST_TAU_MS = 380;
/** Airport diagrams: fetched from this many pixels per km, drawn from DIAGRAM_FROM up */
const DIAGRAM_FETCH = 2.5, DIAGRAM_FROM = 6;

/** Aircraft silhouette pointing up, about 20 px tall. */
const PLANE = new Path2D('M0,-10 L1.5,-6.5 L1.5,-2.2 L9,2.2 L9,4 L1.5,2 L1.2,6.6 L4,8.6 L4,10 L0,9 L-4,10 L-4,8.6 L-1.2,6.6 L-1.5,2 L-9,4 L-9,2.2 L-1.5,-2.2 L-1.5,-6.5Z');

const ll = (lat: number, lon: number): LonLat => [lon, lat];

/** Point `deg` degrees along a heading from (lat, lon). */
function ahead(lat: number, lon: number, heading: number, deg = 0.6): LonLat {
  const r = Math.PI / 180;
  const [φ, λ, θ, δ] = [lat * r, lon * r, heading * r, deg * r];
  const φ2 = Math.asin(Math.sin(φ) * Math.cos(δ) + Math.cos(φ) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ), Math.cos(δ) - Math.sin(φ) * Math.sin(φ2));
  return [λ2 / r, φ2 / r];
}

export interface GlobeOptions {
  onPick: (callsign: string) => void;
  /** Loads an airport diagram; called when an airport comes into close view. */
  layout?: (icao: string) => Promise<Layout | null>;
  /** Called when the visitor turns or zooms the globe by hand. */
  onUserMove?: () => void;
  signal: AbortSignal;
}

export class Globe {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly projection = geoOrthographic().clipAngle(90).precision(0.4);
  private readonly path;
  private rotation: LonLat = [-150, -25]; // projection.rotate() keeps [-lon, -lat] of the centre
  private zoom = 1;
  private size = { w: 1, h: 1, dpr: 1 };
  /** Space taken by overlays at the top and bottom; the globe centres in what is left. */
  private insets = { top: 0, bottom: 0 };
  private flights: readonly LiveFlight[] = [];
  private selected: string | null = null;
  private hits: { callsign: string; x: number; y: number }[] = [];
  private frame = 0;
  /** Globe centre pushed down by this share of its radius (the opening shot shows only the top of the planet). */
  private lift = 0;
  private anim: { from: LonLat; to: LonLat; z0: number; z1: number; l0: number; l1: number; t0: number; ms: number; pull: boolean; easeOut?: boolean } | null = null;
  private drag: { x: number; y: number; rot: LonLat; moved: boolean } | null = null;
  private lastInteraction = 0;
  private spinning = false;
  /** Current idle spin speed (deg/s); eases up to IDLE_SPIN_DEG_PER_S instead of jumping. */
  private spinVel = 0;
  private lastTick = 0;
  /** fling: rotation speed in degrees per ms, decaying */
  private coast: { vx: number; vy: number } | null = null;
  private moves: { t: number; x: number; y: number }[] = [];
  private airports: Apt[] = [];
  private layouts = new Map<string, Layout | 'loading' | null>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: GlobeOptions,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.path = geoPath(this.projection, this.ctx);
    const { signal } = opts;

    const resize = new ResizeObserver(() => this.resize());
    resize.observe(canvas);
    signal.addEventListener('abort', () => {
      resize.disconnect();
      cancelAnimationFrame(this.frame);
    });
    // redraw when the theme changes (colours come from CSS)
    const themeWatch = new MutationObserver(() => this.redraw());
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    signal.addEventListener('abort', () => themeWatch.disconnect());
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.redraw(), { signal });

    this.bindInput(signal);
    this.resize();
  }

  /* ---------- public ---------- */

  setFlights(flights: readonly LiveFlight[], selected: string | null): void {
    this.flights = flights;
    this.selected = selected;
    this.redraw();
  }

  /** Turn and zoom so the whole route of this flight is in view. */
  frameFlight(f: LiveFlight, animate = true): void {
    if (f.ground) {
      // on the ground: close in on the aircraft so the taxiways around it show (about 3.5 km across)
      const free = Math.min(this.size.w, this.size.h - this.insets.top - this.insets.bottom);
      const pxPerKm = (0.8 * free) / 3.5;
      this.flyTo(ll(f.lat, f.lon), Math.min(MAX_ZOOM, (pxPerKm * EARTH_KM) / this.baseRadius), animate);
      return;
    }
    const points: LonLat[] = [ll(f.lat, f.lon)];
    if (f.dep) points.push(ll(f.dep.lat, f.dep.lon));
    if (f.arr) points.push(ll(f.arr.lat, f.arr.lon));
    const centre = points.length === 1 ? points[0]! : this.midpoint(points);
    const reach = Math.max(...points.map((p) => geoDistance(centre, p))) + 0.06; // radians from centre
    // a point `reach` from the centre lands at radius·zoom·sin(reach); keep it inside ~80% of the free band
    const free = Math.min(this.size.w, this.size.h - this.insets.top - this.insets.bottom);
    const fit = (0.8 * free) / 2 / (this.baseRadius * Math.sin(Math.min(reach, Math.PI / 2)));
    // cap the zoom so the curve of the planet stays visible
    this.flyTo(centre, Math.max(MIN_ZOOM, Math.min(4, fit)), animate);
  }

  /** [lon, lat] at the middle of the view. */
  get centre(): LonLat {
    return [-this.rotation[0], -this.rotation[1]];
  }

  /** Jump straight to a camera position (used to set up the opening shot). */
  pose(centre: LonLat, zoom: number, lift = 0): void {
    this.anim = null;
    this.rotation = [-centre[0], -centre[1]];
    this.zoom = zoom;
    this.lift = lift;
    this.redraw();
  }

  /** Camera move for the opening sequence: under way from the first frame, then settling slowly. */
  glide(centre: LonLat, zoom: number, lift: number, ms: number): void {
    if (prefersReducedMotion()) return this.pose(centre, zoom, lift);
    this.anim = { from: [-this.rotation[0], -this.rotation[1]], to: centre, z0: this.zoom, z1: zoom, l0: this.lift, l1: lift, t0: performance.now(), ms, pull: false, easeOut: true };
    this.redraw();
  }

  /** Whole planet, keeping the current centre. */
  overview(animate = true): void {
    this.flyTo([-this.rotation[0], -this.rotation[1]], MIN_ZOOM, animate);
  }

  /** Overlay heights (px). The globe centres in the free band between them. */
  setInsets(top: number, bottom: number): void {
    if (top === this.insets.top && bottom === this.insets.bottom) return;
    this.insets = { top, bottom };
    this.redraw();
  }

  zoomBy(factor: number): void {
    this.zoomAt(factor);
  }

  /** Zoom keeping the point under (x, y) where it is (the centre when no point is given). */
  zoomAt(factor: number, x?: number, y?: number): void {
    this.anim = null;
    this.coast = null;
    this.lift = 0;
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor));
    this.place();
    const before = x == null || y == null ? null : this.projection.invert!([x, y]);
    this.zoom = z;
    if (before && isFinite(before[0])) {
      for (let i = 0; i < 3; i++) {
        this.place();
        const after = this.projection.invert!([x!, y!]);
        if (!after || !isFinite(after[0])) break;
        let dl = before[0] - after[0];
        if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
        this.rotation = [this.rotation[0] - dl, Math.max(-85, Math.min(85, this.rotation[1] - (before[1] - after[1])))];
      }
    }
    this.touch();
    this.redraw();
  }

  /** Airports whose diagrams can be shown when zoomed in close. */
  setAirports(list: readonly Apt[]): void {
    this.airports = list.filter((a) => isFinite(a.lat) && isFinite(a.lon));
  }

  /** Slowly turn the planet while nobody is interacting and no flight is in focus. */
  setIdleSpin(on: boolean): void {
    this.spinning = on && !prefersReducedMotion();
    if (this.spinning) this.redraw();
  }

  /* ---------- geometry ---------- */

  private get baseRadius(): number {
    return Math.min(this.size.w, this.size.h) * BASE_RADIUS;
  }

  private midpoint(points: LonLat[]): LonLat {
    // average of unit vectors, back to lon/lat
    const r = Math.PI / 180;
    let [x, y, z] = [0, 0, 0];
    for (const [lon, lat] of points) {
      x += Math.cos(lat * r) * Math.cos(lon * r);
      y += Math.cos(lat * r) * Math.sin(lon * r);
      z += Math.sin(lat * r);
    }
    return [Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r];
  }

  private flyTo(centre: LonLat, zoom: number, animate: boolean): void {
    const to: LonLat = [-centre[0], -centre[1]];
    if (!animate || prefersReducedMotion()) {
      this.rotation = to;
      this.zoom = zoom;
      this.lift = 0;
      this.anim = null;
      this.redraw();
      return;
    }
    const from: LonLat = [-this.rotation[0], -this.rotation[1]];
    const distance = geoDistance(from, centre);
    const ms = 700 + Math.min(900, distance * 500) + Math.min(1100, Math.abs(Math.log(zoom / this.zoom)) * 130) + (this.lift ? 500 : 0);
    this.coast = null;
    this.anim = { from, to: centre, z0: this.zoom, z1: zoom, l0: this.lift, l1: 0, t0: performance.now(), ms, pull: true };
    this.redraw();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = { w: Math.max(1, rect.width), h: Math.max(1, rect.height), dpr };
    this.canvas.width = Math.round(this.size.w * dpr);
    this.canvas.height = Math.round(this.size.h * dpr);
    this.draw();
  }

  /* ---------- drawing ---------- */

  private redraw(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private tick(now: number): void {
    const dt = this.lastTick ? Math.min(100, now - this.lastTick) : 16;
    this.lastTick = now;
    let again = false;
    if (this.anim) {
      this.spinVel = 0;
      const a = this.anim;
      const k = Math.min(1, (now - a.t0) / a.ms);
      const e = a.easeOut
        ? 1 - Math.pow(1 - k, 3) // ease out: moving straight away
        : k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease in-out
      const c = geoInterpolate(a.from, a.to)(e);
      this.rotation = [-c[0], -c[1]];
      // zoom out a little mid-flight on long moves, like a camera pulling back
      const pull = a.pull ? Math.sin(Math.PI * e) * Math.min(0.35, geoDistance(a.from, a.to) / 4) : 0;
      // zoom moves in log space, so a 1x -> 3000x move looks even all the way down
      this.zoom = Math.max(MIN_ZOOM, Math.exp(Math.log(a.z0) + (Math.log(a.z1) - Math.log(a.z0)) * e) * (1 - pull));
      this.lift = a.l0 + (a.l1 - a.l0) * e;
      if (k < 1) again = true;
      else {
        this.anim = null;
        again = this.spinning && this.zoom < SPIN_MAX_ZOOM; // hand straight over to the idle spin, don't wait for the next poll
      }
    } else if (this.coast && !this.drag) {
      const c = this.coast, k = Math.exp(-dt / COAST_TAU_MS);
      this.rotation = [this.rotation[0] + c.vx * dt, Math.max(-85, Math.min(85, this.rotation[1] + c.vy * dt))];
      c.vx *= k;
      c.vy *= k;
      const pxPerMs = Math.hypot(c.vx, c.vy) / this.degPerPx();
      if (pxPerMs < 0.015) { this.coast = null; this.lastInteraction = now; }
      again = true;
    } else if (this.spinning && this.zoom < SPIN_MAX_ZOOM && !this.drag && now - this.lastInteraction > IDLE_AFTER_MS) {
      this.spinVel += (IDLE_SPIN_DEG_PER_S - this.spinVel) * Math.min(1, dt / 500);
      this.rotation = [this.rotation[0] + (this.spinVel * dt) / 1000, this.rotation[1]];
      again = true;
    } else if (this.spinning && this.zoom < SPIN_MAX_ZOOM) {
      this.spinVel = 0;
      again = true; // keep the loop alive until spinning can resume (not when zoomed in: nothing to wait for)
    }
    this.draw();
    if (again) this.frame = requestAnimationFrame((t) => this.tick(t));
    else this.lastTick = 0;
  }

  private css(name: string, fallback: string): string {
    return getComputedStyle(this.canvas).getPropertyValue(name).trim() || fallback;
  }

  private degPerPx(): number {
    return 180 / Math.PI / (this.baseRadius * this.zoom);
  }

  /** Set the projection for the current camera; returns the globe radius and centre on screen. */
  private place(): { r: number; cx: number; cy: number } {
    const { w, h } = this.size;
    const r = this.baseRadius * this.zoom;
    const [cx, cy] = [w / 2, this.insets.top + (h - this.insets.top - this.insets.bottom) / 2 + this.lift * r];
    this.projection.translate([cx, cy]).scale(r).rotate([this.rotation[0], this.rotation[1], 0]);
    // zoomed in, only what is on screen is worth cutting into paths
    this.projection.clipExtent(this.zoom > 3 ? [[-40, -40], [w + 40, h + 40]] : null);
    return { r, cx, cy };
  }

  private draw(): void {
    const { ctx } = this;
    const { w, h, dpr } = this.size;
    const { r, cx, cy } = this.place();
    const pxPerKm = r / EARTH_KM;
    // close in, the 1:110m coastline is kilometres off: fade it into plain ground under the airport diagrams
    const ground = smooth(pxPerKm, 1.2, 5);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // atmosphere glow
    const glow = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.35);
    glow.addColorStop(0, this.css('--g-glow', 'rgba(124,194,201,.14)'));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // sphere, graticule, land
    ctx.beginPath();
    this.path(SPHERE);
    ctx.fillStyle = this.css('--g-sphere', '#12161B');
    ctx.fill();

    ctx.beginPath();
    this.path(GRATICULE);
    ctx.strokeStyle = this.css('--g-grat', 'rgba(255,255,255,.05)');
    ctx.lineWidth = 0.7;
    ctx.stroke();

    ctx.beginPath();
    this.path(LAND);
    ctx.fillStyle = this.css('--g-land', '#1E242B');
    ctx.fill('evenodd');
    ctx.strokeStyle = this.css('--g-edge', '#2E3740');
    ctx.lineWidth = 0.8;
    ctx.stroke();

    if (ground > 0) {
      ctx.save();
      ctx.globalAlpha = ground;
      ctx.beginPath();
      this.path(SPHERE);
      ctx.fillStyle = this.css('--g-ground', this.css('--g-land', '#1E242B'));
      ctx.fill();
      ctx.restore();
    }
    if (pxPerKm >= DIAGRAM_FETCH) this.drawAirports(pxPerKm);

    ctx.beginPath();
    this.path(SPHERE);
    ctx.strokeStyle = this.css('--g-rim', 'rgba(255,255,255,.08)');
    ctx.lineWidth = 1;
    ctx.stroke();

    this.drawFlights(r);
  }

  /* ---------- airport diagrams (OpenStreetMap, from the EFB server) ---------- */

  private fetchLayout(icao: string): void {
    const load = this.opts.layout;
    if (!load) return;
    let busy = 0;
    for (const v of this.layouts.values()) if (v === 'loading') busy++;
    if (busy >= 2) return;
    this.layouts.set(icao, 'loading');
    const fail = () => { this.layouts.set(icao, null); setTimeout(() => this.layouts.delete(icao), 60_000); };
    load(icao).then((l) => {
      if (l && ((l.runways && l.runways.length) || (l.taxiways && l.taxiways.length))) { this.layouts.set(icao, l); this.redraw(); }
      else fail();
    }, fail);
  }

  private drawAirports(pxPerKm: number): void {
    const { ctx } = this;
    const { w, h } = this.size;
    const centre: LonLat = [-this.rotation[0], -this.rotation[1]];
    const viewKm = Math.hypot(w, h) / 2 / pxPerKm + 8;
    const near = this.airports.filter((a) => geoDistance(centre, [a.lon, a.lat]) * EARTH_KM < viewKm);
    for (const a of near) if (!this.layouts.has(a.icao)) this.fetchLayout(a.icao);
    if (pxPerKm < DIAGRAM_FROM) return;
    const alpha = smooth(pxPerKm, DIAGRAM_FROM, DIAGRAM_FROM * 2.2);
    let shown = false;
    for (const a of near) {
      const L = this.layouts.get(a.icao);
      if (!L || L === 'loading') continue;
      this.drawLayout(L, pxPerKm / 1000, alpha);
      shown = true;
    }
    if (shown) {
      ctx.save();
      ctx.font = '10px "Jost", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = this.css('--g-label', 'rgba(255,255,255,.7)');
      ctx.globalAlpha = 0.6 * alpha;
      ctx.fillText('Airport diagrams © OpenStreetMap contributors', w - 12, 18);
      ctx.restore();
    }
  }

  private drawLayout(L: Layout, pxPerM: number, alpha: number): void {
    const { ctx } = this;
    const { w, h } = this.size;
    const P = (p: Pt): [number, number] => this.projection(p as LonLat) as [number, number];
    const trace = (pts: Pt[], close = false) => {
      for (let i = 0; i < pts.length; i++) { const [x, y] = P(pts[i]!); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      if (close) ctx.closePath();
    };
    const m = (metres: number, min: number) => Math.max(min, metres * pxPerM);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';

    // aprons, with their holes cut out
    ctx.beginPath();
    for (const a of L.aprons || []) trace(a, true);
    for (const a of L.apronHoles || []) trace(a, true);
    ctx.fillStyle = this.css('--g-apron', '#262E36');
    ctx.fill('evenodd');

    // taxiway pavement
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.css('--g-twy', '#313B44');
    for (const t of L.taxiways || []) {
      ctx.beginPath();
      trace(t.pts);
      ctx.lineWidth = m(t.width || (t.kind === 'taxilane' ? 15 : 23), 1.2);
      ctx.stroke();
    }

    // runways
    const rwy = this.css('--g-rwy', '#56616D');
    for (const r of L.runways || []) {
      ctx.beginPath();
      trace(r.pts);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = rwy;
      ctx.lineWidth = m(r.width || 45, 2.2);
      ctx.stroke();
      if (pxPerM > 0.22) {
        // centreline: 36 m stripes, 24 m gaps
        ctx.setLineDash([36 * pxPerM, 24 * pxPerM]);
        ctx.strokeStyle = this.css('--g-rwy-mark', 'rgba(255,255,255,.8)');
        ctx.lineWidth = m(0.9, 1);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // taxiway centrelines
    if (pxPerM > 0.4) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.css('--g-cl', '#C9A13A');
      ctx.lineWidth = m(0.3, 1);
      for (const t of L.taxiways || []) { ctx.beginPath(); trace(t.pts); ctx.stroke(); }
    }

    // buildings
    ctx.beginPath();
    for (const b of L.buildings || []) trace(b.pts, true);
    ctx.fillStyle = this.css('--g-bldg', '#2D3842');
    ctx.fill();

    // labels: runway ends, taxiway letters, then stands; none on top of another
    const occ: [number, number, number, number][] = [];
    const free = (b: [number, number, number, number]) => b[2] > 0 && b[0] < w && b[3] > 0 && b[1] < h && !occ.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const tag = (txt: string, x: number, y: number, bg: string, fg: string, font: string, pad = 3) => {
      ctx.font = font;
      const tw = ctx.measureText(txt).width, bw = tw + pad * 2, bh = 15;
      const box: [number, number, number, number] = [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2];
      if (!free(box)) return false;
      occ.push(box);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(box[0], box[1], bw, bh, 2.5);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, x, y + 0.5);
      return true;
    };
    const mono = '600 10.5px "IBM Plex Mono", ui-monospace, monospace';
    if (pxPerM > 0.05) {
      // OpenStreetMap splits a runway into several ways (and writes 1L or 01L): join them by number, label the two far ends
      const pad = (x: string) => x.trim().toUpperCase().replace(/^0+(?=\d)/, '').replace(/^(\d)(?!\d)/, '0$1');
      const groups = new Map<string, { ends: string[]; pts: Pt[] }>();
      for (const r of L.runways || []) {
        const ends = String(r.ref || '').split('/').map(pad).filter(Boolean);
        if (!ends.length || r.pts.length < 2) continue;
        const key = [...ends].sort().join('/');
        const g = groups.get(key) || { ends, pts: [] };
        g.pts.push(r.pts[0]!, r.pts[r.pts.length - 1]!);
        groups.set(key, g);
      }
      const R2 = Math.PI / 180;
      for (const g of groups.values()) {
        let a = g.pts[0]!, b = g.pts[1]!, best = -1;
        for (let i = 0; i < g.pts.length; i++) for (let j = i + 1; j < g.pts.length; j++) {
          const p1 = g.pts[i]!, p2 = g.pts[j]!, d = (p1[0] - p2[0]) ** 2 * Math.cos(p1[1] * R2) ** 2 + (p1[1] - p2[1]) ** 2;
          if (d > best) { best = d; a = p1; b = p2; }
        }
        // which end is which: a runway number is its heading / 10, so the end you start from carries it
        const brg = (Math.atan2(Math.sin((b[0] - a[0]) * R2) * Math.cos(b[1] * R2), Math.cos(a[1] * R2) * Math.sin(b[1] * R2) - Math.sin(a[1] * R2) * Math.cos(b[1] * R2) * Math.cos((b[0] - a[0]) * R2)) / R2 + 360) % 360;
        const n0 = parseInt(g.ends[0]!, 10) * 10, d0 = Math.abs(((brg - n0 + 540) % 360) - 180);
        const [ea, eb] = d0 <= 90 ? [g.ends[0], g.ends[1]] : [g.ends[1], g.ends[0]];
        const [ax, ay] = P(a), [bx, by] = P(b), len = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / len, uy = (by - ay) / len, off = 16;
        if (ea) tag(ea, ax - ux * off, ay - uy * off, this.css('--g-rwy-tag', '#1D1F22'), '#FFFFFF', mono);
        if (eb) tag(eb, bx + ux * off, by + uy * off, this.css('--g-rwy-tag', '#1D1F22'), '#FFFFFF', mono);
      }
    }
    if (pxPerM > 0.28) {
      const placed: Record<string, [number, number][]> = {};
      const minGap = 170;
      for (const t of L.taxiways || []) {
        if (!t.ref || t.pts.length < 2) continue;
        const sp = t.pts.map(P);
        let total = 0;
        for (let i = 1; i < sp.length; i++) total += Math.hypot(sp[i]![0] - sp[i - 1]![0], sp[i]![1] - sp[i - 1]![1]);
        if (total < 45) continue;
        let need = total / 2, x = sp[0]![0], y = sp[0]![1];
        for (let i = 1; i < sp.length; i++) {
          const d = Math.hypot(sp[i]![0] - sp[i - 1]![0], sp[i]![1] - sp[i - 1]![1]);
          if (need <= d) { const k = need / (d || 1); x = sp[i - 1]![0] + (sp[i]![0] - sp[i - 1]![0]) * k; y = sp[i - 1]![1] + (sp[i]![1] - sp[i - 1]![1]) * k; break; }
          need -= d;
        }
        const same = (placed[t.ref] ||= []);
        if (same.some(([px, py]) => Math.hypot(px - x, py - y) < minGap)) continue;
        if (tag(t.ref, x, y, this.css('--g-twy-tag', '#F2C230'), '#111111', '700 10.5px "Jost", system-ui, sans-serif')) same.push([x, y]);
      }
    }
    if (pxPerM > 0.85) {
      ctx.fillStyle = this.css('--g-stand', '#9AA7AE');
      for (const st of L.stands || []) {
        if (!st.ref) continue;
        const [x, y] = P(st.pt);
        if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = this.css('--g-stand', '#9AA7AE');
        ctx.fill();
        tag(st.ref, x, y - 9, 'rgba(0,0,0,0)', this.css('--g-stand', '#9AA7AE'), '500 9.5px "Jost", system-ui, sans-serif', 1);
      }
    }
    ctx.restore();
  }

  private drawFlights(radius: number): void {
    const { ctx } = this;
    const route = this.css('--g-route', '#D9B98F');
    const plane = this.css('--g-plane', '#C9B39F');
    const faint = this.css('--g-trail', 'rgba(201,179,159,.35)');
    const label = this.css('--g-label', 'rgba(255,255,255,.7)');
    const centre: LonLat = [-this.rotation[0], -this.rotation[1]];
    const visible = (p: LonLat) => geoDistance(centre, p) < Math.PI / 2 - 0.01;
    const selected = this.flights.find((f) => f.callsign === this.selected);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // other flights' trails
    for (const f of this.flights) {
      if (f === selected || f.trail.length < 2) continue;
      ctx.beginPath();
      this.path({ type: 'LineString', coordinates: f.trail.map((p) => ll(p[0], p[1])) });
      ctx.strokeStyle = faint;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // selected flight: what is still to fly (dashed), what was flown (bright, glowing), the two airports
    if (selected) {
      const here = ll(selected.lat, selected.lon);
      if (selected.arr) {
        ctx.beginPath();
        this.path({ type: 'LineString', coordinates: [here, ll(selected.arr.lat, selected.arr.lon)] });
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = route;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      const flown = selected.trail.length > 1 ? selected.trail.map((p) => ll(p[0], p[1])) : selected.dep ? [ll(selected.dep.lat, selected.dep.lon), here] : [];
      if (flown.length > 1) {
        ctx.beginPath();
        this.path({ type: 'LineString', coordinates: flown });
        ctx.strokeStyle = route;
        ctx.lineWidth = 2;
        ctx.shadowColor = route;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      for (const a of [selected.dep, selected.arr]) {
        if (!a || !visible(ll(a.lat, a.lon))) continue;
        const [x, y] = this.projection(ll(a.lat, a.lon))!;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = this.css('--g-sphere', '#12161B');
        ctx.fill();
        ctx.strokeStyle = route;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '600 11px "IBM Plex Mono", monospace';
        ctx.fillStyle = label;
        ctx.textAlign = 'center';
        ctx.fillText(a.iata ?? a.icao, x, y + 17);
      }
    }

    // aircraft
    this.hits = [];
    const scale = Math.max(0.75, Math.min(1.25, 0.75 + radius / 900));
    const pxPerM = radius / EARTH_KM / 1000;
    for (const f of this.flights) {
      const p = ll(f.lat, f.lon);
      if (!visible(p)) continue;
      const [x, y] = this.projection(p)!;
      const [ax, ay] = this.projection(ahead(f.lat, f.lon, f.heading)) ?? [x, y - 1];
      const angle = Math.atan2(ax - x, -(ay - y)); // screen heading, so the nose follows the curve of the globe
      const isSel = f === selected;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      // the icon is 18 units across; never smaller than the usual symbol, true size when zoomed in close
      const k = Math.max(scale * (isSel ? 1.25 : 0.85), ((f.span || 36) * pxPerM) / 18);
      ctx.scale(k, k);
      if (isSel) {
        ctx.shadowColor = route;
        ctx.shadowBlur = 14;
      }
      ctx.fillStyle = isSel ? route : plane;
      ctx.globalAlpha = isSel || !selected ? 1 : 0.75;
      ctx.fill(PLANE);
      ctx.restore();
      this.hits.push({ callsign: f.callsign, x, y });
    }
  }

  /* ---------- input ---------- */

  private touch(): void {
    this.lastInteraction = performance.now();
    this.opts.onUserMove?.();
  }

  private bindInput(signal: AbortSignal): void {
    const c = this.canvas;
    c.addEventListener(
      'pointerdown',
      (e) => {
        this.anim = null;
        this.coast = null;
        this.drag = { x: e.clientX, y: e.clientY, rot: [...this.rotation], moved: false };
        this.moves = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
        c.setPointerCapture(e.pointerId);
      },
      { signal },
    );
    c.addEventListener(
      'pointermove',
      (e) => {
        if (!this.drag) return;
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
          this.drag.moved = true;
          c.classList.add('dragging');
        }
        if (!this.drag.moved) return;
        const degPerPx = this.degPerPx();
        // a degree of longitude is shorter away from the equator: keep the ground under the pointer
        const cosLat = Math.max(0.2, Math.cos((-this.rotation[1] * Math.PI) / 180));
        this.rotation = [this.drag.rot[0] + (dx * degPerPx) / cosLat, Math.max(-85, Math.min(85, this.drag.rot[1] - dy * degPerPx))];
        const t = performance.now();
        this.moves.push({ t, x: e.clientX, y: e.clientY });
        while (this.moves.length > 2 && t - this.moves[0]!.t > 100) this.moves.shift();
        this.touch();
        this.redraw();
      },
      { signal },
    );
    const end = (e: PointerEvent) => {
      if (!this.drag) return;
      const wasDrag = this.drag.moved;
      this.drag = null;
      c.classList.remove('dragging');
      if (wasDrag) {
        // fling: carry on with the speed of the last ~100 ms, unless the pointer stopped before letting go
        const now = performance.now(), m = this.moves, a = m[0], b = m[m.length - 1];
        if (a && b && b.t > a.t && now - b.t < 60 && !prefersReducedMotion()) {
          const vx = (b.x - a.x) / (b.t - a.t), vy = (b.y - a.y) / (b.t - a.t); // px per ms
          if (Math.hypot(vx, vy) > 0.08) {
            const d = this.degPerPx(), cosLat = Math.max(0.2, Math.cos((-this.rotation[1] * Math.PI) / 180));
            const cap = 4; // px per ms
            const k = Math.min(1, cap / Math.hypot(vx, vy));
            this.coast = { vx: (vx * k * d) / cosLat, vy: -vy * k * d };
            this.redraw();
          }
        }
        return;
      }
      // a click: pick the nearest aircraft under the pointer
      const rect = c.getBoundingClientRect();
      const [x, y] = [e.clientX - rect.left, e.clientY - rect.top];
      let best: { callsign: string; d: number } | null = null;
      for (const h of this.hits) {
        const d = Math.hypot(h.x - x, h.y - y);
        if (d < PICK_RADIUS_PX && (!best || d < best.d)) best = { callsign: h.callsign, d };
      }
      if (best) this.opts.onPick(best.callsign);
    };
    c.addEventListener('pointerup', end, { signal });
    c.addEventListener('pointercancel', () => (this.drag = null), { signal });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        const rect = c.getBoundingClientRect();
        this.zoomAt(Math.exp(-Math.max(-300, Math.min(300, delta)) * 0.0022), e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false, signal },
    );
    c.addEventListener('dblclick', (e) => { const rect = c.getBoundingClientRect(); this.zoomAt(2.2, e.clientX - rect.left, e.clientY - rect.top); }, { signal });
    c.addEventListener(
      'pointermove',
      (e) => {
        if (this.drag) return;
        const rect = c.getBoundingClientRect();
        const [x, y] = [e.clientX - rect.left, e.clientY - rect.top];
        c.classList.toggle('over-plane', this.hits.some((h) => Math.hypot(h.x - x, h.y - y) < PICK_RADIUS_PX));
      },
      { signal },
    );
  }
}
