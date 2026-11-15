/**
 * Live globe for the Network page: orthographic projection drawn on a canvas with d3-geo.
 * Drag to turn the globe, scroll or pinch-buttons to zoom, click an aircraft to pick it.
 * Colours come from CSS custom properties on the canvas (--g-*), so light and dark mode just work.
 */
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
const prefersReducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('rm');
type Apt = { lat: number; lon: number; icao: string; iata?: string };
export interface LiveFlight { callsign: string; lat: number; lon: number; heading: number; trail: [number, number][]; dep?: Apt | null; arr?: Apt | null }
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
const MAX_ZOOM = 14;
/** Globe radius at zoom 1, as a share of the shorter canvas side. */
const BASE_RADIUS = 0.4;
const PICK_RADIUS_PX = 18;
const IDLE_SPIN_DEG_PER_S = 6;
/** After a drag or zoom, the planet starts turning again this soon. */
const IDLE_AFTER_MS = 2000;

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
    this.anim = null;
    this.lift = 0;
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor));
    this.touch();
    this.redraw();
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
    const ms = 700 + Math.min(900, distance * 500) + (this.lift ? 500 : 0);
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
      this.zoom = Math.max(MIN_ZOOM, (a.z0 + (a.z1 - a.z0) * e) * (1 - pull));
      this.lift = a.l0 + (a.l1 - a.l0) * e;
      if (k < 1) again = true;
      else {
        this.anim = null;
        again = this.spinning; // hand straight over to the idle spin, don't wait for the next poll
      }
    } else if (this.spinning && !this.drag && now - this.lastInteraction > IDLE_AFTER_MS) {
      this.spinVel += (IDLE_SPIN_DEG_PER_S - this.spinVel) * Math.min(1, dt / 500);
      this.rotation = [this.rotation[0] + (this.spinVel * dt) / 1000, this.rotation[1]];
      again = true;
    } else if (this.spinning) {
      this.spinVel = 0;
      again = true; // keep the loop alive until spinning can resume
    }
    this.draw();
    if (again) this.frame = requestAnimationFrame((t) => this.tick(t));
    else this.lastTick = 0;
  }

  private css(name: string, fallback: string): string {
    return getComputedStyle(this.canvas).getPropertyValue(name).trim() || fallback;
  }

  private draw(): void {
    const { ctx } = this;
    const { w, h, dpr } = this.size;
    const r = this.baseRadius * this.zoom;
    const [cx, cy] = [w / 2, this.insets.top + (h - this.insets.top - this.insets.bottom) / 2 + this.lift * r];
    this.projection.translate([cx, cy]).scale(r).rotate([this.rotation[0], this.rotation[1], 0]);

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

    ctx.beginPath();
    this.path(SPHERE);
    ctx.strokeStyle = this.css('--g-rim', 'rgba(255,255,255,.08)');
    ctx.lineWidth = 1;
    ctx.stroke();

    this.drawFlights(r);
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
      ctx.scale(scale * (isSel ? 1.25 : 0.85), scale * (isSel ? 1.25 : 0.85));
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
        this.drag = { x: e.clientX, y: e.clientY, rot: [...this.rotation], moved: false };
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
        const degPerPx = 180 / Math.PI / (this.baseRadius * this.zoom);
        this.rotation = [this.drag.rot[0] + dx * degPerPx, Math.max(-85, Math.min(85, this.drag.rot[1] - dy * degPerPx))];
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
      if (wasDrag) return;
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
        this.zoomBy(Math.exp(-delta * 0.0015));
      },
      { passive: false, signal },
    );
    c.addEventListener('dblclick', () => this.zoomBy(1.8), { signal });
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
