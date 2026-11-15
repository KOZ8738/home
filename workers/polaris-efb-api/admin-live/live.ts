/**
 * Live tab of the Polaris Mail admin: the website's globe plus every Polaris (PAW) flight on VATSIM and its phase.
 * Built with esbuild into ../src/live-bundle.js (npm run build), served on /admin/live.js.
 */
import { Globe, type LiveFlight, type Layout } from './globe';

type Apt = { lat: number; lon: number; icao: string; iata: string; city: string };
type Raw = {
  cs: string; cid: number; name: string; lat: number; lon: number; alt: number; gs: number; hdg: number; sq: string; logon: number;
  ac: string; dep: string; arr: string; cruise: number | null; fl: string; rules: string; altn: string; tas: string; dt: string; ete: string; route: string;
  vs?: number; sample?: boolean;
};
type Phase = 'gate' | 'taxiout' | 'takeoff' | 'cruise' | 'descent' | 'taxiin' | 'arrived';
/** wingspan (m) by ICAO type, for drawing aircraft to scale when zoomed in */
const SPAN: Record<string, number> = { A359: 64.8, A35K: 64.8, A388: 79.8, A339: 64, A333: 60.3, A332: 60.3, B77W: 64.8, B77L: 64.8, B772: 60.9, B789: 60.1, B788: 60.1, B78X: 60.1, B744: 64.4, B748: 68.4, A21N: 35.8, A321: 35.8, A20N: 35.8, A320: 35.8, A319: 35.8, A19N: 35.8, B738: 35.8, B38M: 35.9, B739: 35.8, B39M: 35.9, E75L: 26, CRJ9: 24.9 };
type Flight = Omit<LiveFlight, 'dep' | 'arr'> & { dep: Apt | null; arr: Apt | null; raw: Raw; phase: Phase; vs: number | null; dDep: number | null; dArr: number | null; pct: number | null };

const STEPS: [Phase, string][] = [
  ['gate', 'At gate'], ['taxiout', 'Taxi out'], ['takeoff', 'Takeoff'], ['cruise', 'Cruise'], ['descent', 'Descent'], ['taxiin', 'Taxi in'], ['arrived', 'Arrived'],
];
const LABEL = Object.fromEntries(STEPS) as Record<Phase, string>;
const POLL_MS = 15_000;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T | null;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const R = Math.PI / 180;
function nm(a: [number, number], b: [number, number]): number {
  const [φ1, φ2] = [a[0] * R, b[0] * R], dφ = φ2 - φ1, dλ = (b[1] - a[1]) * R;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 3440.065 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
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
function bearing(a: [number, number], b: [number, number]): number {
  const [φ1, φ2, dλ] = [a[0] * R, b[0] * R, (b[1] - a[1]) * R];
  return (Math.atan2(Math.sin(dλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)) / R + 360) % 360;
}

/* ---------- state ---------- */
const S = {
  apts: {} as Record<string, Apt>,
  flights: [] as Flight[],
  sel: null as string | null,
  upd: '',
  fetched: 0,
  sample: false,
  error: '',
  loaded: false,
  /** last two VATSIM samples per callsign, for the vertical speed */
  hist: {} as Record<string, { t: number; alt: number }[]>,
  /** positions seen since the page opened (VATSIM has no track history) */
  trails: {} as Record<string, [number, number][]>,
  /** last phase per callsign, so a level-off or a pause does not flip the phase back */
  last: {} as Record<string, Phase>,
  timer: 0,
  globe: null as Globe | null,
  follow: false,
};
try { S.trails = JSON.parse(sessionStorage.getItem('pmTrails') || '{}'); } catch { /* none */ }

/* ---------- phase ---------- */
function phaseOf(r: Raw, vs: number | null, dDep: number | null, dArr: number | null, prev: Phase | undefined): Phase {
  const nearArr = dArr != null && (dDep == null || dArr < dDep);
  if (r.gs < 45 && r.alt < 15000) {
    // on the ground (VATSIM has no on-ground flag; nothing flies under 45 kt)
    if (nearArr && dArr! < 25) return r.gs < 3 ? 'arrived' : 'taxiin';
    if (prev === 'taxiin' || prev === 'arrived' || prev === 'descent') return r.gs < 3 ? 'arrived' : 'taxiin';
    return r.gs < 3 ? 'gate' : 'taxiout';
  }
  const cruise = r.cruise;
  // far from both ends a climb or descent is a step on the way (long-haul step climbs), still the cruise
  const enRoute = r.alt > 24000 && (dDep == null || dDep > 300) && (dArr == null || dArr > 250);
  if (vs != null && vs > 500) return enRoute || (cruise && r.alt >= cruise - 400) ? 'cruise' : 'takeoff';
  if (vs != null && vs < -500) return enRoute ? 'cruise' : 'descent';
  if (cruise && r.alt >= cruise - 1500) return 'cruise';
  // level below the planned altitude: the earlier phase decides, then how close it is to either end
  if (prev === 'descent' && !enRoute) return 'descent';
  if (prev === 'takeoff' && !enRoute) return 'takeoff';
  if (dArr != null && dArr < (r.alt / 1000) * 3.2 * 1.3 + 30 && (dDep == null || dArr < dDep)) return 'descent';
  if (dDep != null && dDep < 150 + (r.alt / 1000) * 2 && (dArr == null || dDep < dArr)) return 'takeoff';
  return 'cruise';
}

function build(list: Raw[], updMs: number): Flight[] {
  const out: Flight[] = [];
  const keep = new Set<string>();
  for (const r of list) {
    keep.add(r.cs);
    const dep = S.apts[r.dep] ?? null, arr = S.apts[r.arr] ?? null;
    let vs: number | null = r.vs ?? null;
    if (!r.sample) {
      const h = (S.hist[r.cs] ||= []);
      if (!h.length || h[h.length - 1]!.t !== updMs) { h.push({ t: updMs, alt: r.alt }); if (h.length > 3) h.shift(); }
      if (h.length > 1) { const a = h[0]!, b = h[h.length - 1]!; if (b.t > a.t) vs = Math.round(((b.alt - a.alt) / (b.t - a.t)) * 60000); }
      const tr = (S.trails[r.cs] ||= []), lp = tr[tr.length - 1];
      if (!lp || nm(lp, [r.lat, r.lon]) > 0.5) { tr.push([r.lat, r.lon]); if (tr.length > 600) tr.splice(0, tr.length - 600); }
    }
    const here: [number, number] = [r.lat, r.lon];
    const dDep = dep ? nm(here, [dep.lat, dep.lon]) : null, dArr = arr ? nm(here, [arr.lat, arr.lon]) : null;
    const phase = phaseOf(r, vs, dDep, dArr, S.last[r.cs]);
    S.last[r.cs] = phase;
    const pct = dDep != null && dArr != null ? Math.max(0, Math.min(1, dDep / Math.max(1, dDep + dArr))) : null;
    out.push({ callsign: r.cs, lat: r.lat, lon: r.lon, heading: r.hdg, span: SPAN[r.ac] || 36, ground: r.gs < 45 && r.alt < 15000, trail: r.sample ? sampleTrail(r, dep) : (S.trails[r.cs] || []), dep, arr, raw: r, phase, vs, dDep, dArr, pct });
  }
  if (!list.some((r) => r.sample)) {
    for (const k of Object.keys(S.trails)) if (!keep.has(k)) delete S.trails[k];
    try { sessionStorage.setItem('pmTrails', JSON.stringify(S.trails)); } catch { /* full */ }
  }
  const order = Object.fromEntries(STEPS.map(([k], i) => [k, i]));
  return out.sort((a, b) => order[a.phase]! - order[b.phase]! || a.callsign.localeCompare(b.callsign));
}

/* ---------- sample flights (preview only, clearly labelled) ---------- */
function sampleTrail(r: Raw, dep: Apt | null): [number, number][] {
  if (!dep) return [];
  const a: [number, number] = [dep.lat, dep.lon], b: [number, number] = [r.lat, r.lon], n = 40, t: [number, number][] = [];
  for (let i = 0; i <= n; i++) t.push(along(a, b, i / n));
  return t;
}
function samples(): Raw[] {
  const A = S.apts;
  const mk = (cs: string, dep: string, arr: string, ac: string, k: number, alt: number, gs: number, vs: number, cruise: number, name: string, at?: [number, number, number]): Raw | null => {
    if (!A[dep] || !A[arr]) return null;
    const a: [number, number] = [A[dep]!.lat, A[dep]!.lon], b: [number, number] = [A[arr]!.lat, A[arr]!.lon];
    const p = along(a, b, k), q = along(a, b, Math.min(1, k + 0.01));
    // aircraft on the ground at KSFO sit on a real stand or taxiway ([lat, lon, heading]); elsewhere along the route
    const [lat, lon, hdg] = at || [p[0], p[1], k >= 1 ? 280 : Math.round(bearing(p, q))];
    return { cs, cid: 0, name, lat, lon, alt, gs, hdg, sq: '2000', logon: Date.now() - (2 + k * 9) * 3600e3,
      ac, dep, arr, cruise, fl: 'FL' + cruise / 100, rules: 'I', altn: '', tas: String(gs > 200 ? 480 : ''), dt: '', ete: '', route: 'Sample flight: made up for the preview', vs, sample: true };
  };
  const ok = (x: Raw | null): x is Raw => !!x;
  return [
    mk('PAW102', 'KSFO', 'KLAX', 'A21N', 0, 13, 0, 0, 33000, 'Sample Pilot', [37.612402, -122.387937, 300]),
    mk('PAW810', 'KSFO', 'RCTP', 'A359', 0, 13, 17, 0, 39000, 'Sample Pilot', [37.613530, -122.381705, 28]),
    mk('PAW130', 'KSFO', 'KJFK', 'A21N', 0.012, 7400, 245, 2600, 35000, 'Sample Pilot'),
    mk('PAW806', 'KSFO', 'RJTT', 'A359', 0.46, 37000, 488, 0, 37000, 'Sample Pilot'),
    mk('PAW902', 'EGLL', 'KSFO', 'A359', 0.955, 18600, 360, -1900, 39000, 'Sample Pilot'),
    mk('PAW119', 'KSEA', 'KSFO', 'A21N', 1, 13, 16, 0, 34000, 'Sample Pilot', [37.619010, -122.379330, 220]),
    mk('PAW127', 'KSFO', 'KBOS', 'A21N', 1, 20, 0, 0, 36000, 'Sample Pilot'),
  ].filter(ok);
}

/* ---------- data ---------- */
async function poll(force = false): Promise<void> {
  clearTimeout(S.timer);
  if (!force && (document.hidden || currentTab() !== 'live')) return;
  try {
    const r = await fetch('/admin/api/live', { credentials: 'same-origin', cache: 'no-store' });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error((j && j.error) || 'HTTP ' + r.status);
    S.apts = Object.fromEntries(Object.entries(j.apts || {}).map(([k, v]) => { const a = v as [number, number, string, string]; return [k, { icao: k, lat: a[0], lon: a[1], iata: a[2], city: a[3] }]; }));
    S.upd = j.upd || ''; S.fetched = Date.now(); S.error = ''; S.loaded = true;
    S.globe?.setAirports(Object.values(S.apts));
    const raw: Raw[] = j.flights || [];
    if (raw.length) S.sample = false;
    S.flights = build(raw.length || !S.sample ? raw : samples(), Date.parse(S.upd) || Date.now());
  } catch (e) {
    S.error = (e as Error).message; S.loaded = true;
  }
  if (S.sel && !S.flights.some((f) => f.callsign === S.sel)) S.sel = null;
  render();
  if (S.follow) { const f = sel(); if (f) S.globe?.frameFlight(f); }
  S.timer = window.setTimeout(() => void poll(), POLL_MS);
}

/* ---------- render ---------- */
const sel = () => S.flights.find((f) => f.callsign === S.sel) || null;
const ft = (n: number) => (n >= 18000 ? 'FL' + String(Math.round(n / 100)).padStart(3, '0') : n.toLocaleString('en-US') + ' ft');
const dur = (ms: number) => { const m = Math.max(0, Math.round(ms / 60000)); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
const aptCode = (icao: string) => icao || '····';

function render(): void {
  const n = S.flights.length;
  const badge = $('#lvCount'); if (badge) { badge.textContent = S.sample || !n ? '' : String(n); badge.hidden = S.sample || !n; }
  if (currentTab() !== 'live') return;
  S.globe?.setFlights(S.flights, S.sel);
  S.globe?.setIdleSpin(!S.sel);

  // phase summary
  const counts = Object.fromEntries(STEPS.map(([k]) => [k, 0])) as Record<Phase, number>;
  for (const f of S.flights) counts[f.phase]++;
  $('#lvSum')!.innerHTML = STEPS.map(([k, l]) => `<div class="lv-c ph-${k}${counts[k] ? '' : ' z'}"><b>${counts[k]}</b><span>${l}</span></div>`).join('');

  // source line
  const age = S.upd ? Math.max(0, Math.round((Date.now() - Date.parse(S.upd)) / 1000)) : null;
  $('#lvSrc')!.innerHTML = S.error
    ? `<span class="lv-err">${esc(S.error)}</span>`
    : S.sample
      ? `<span class="lv-tag">SAMPLE</span> Made-up flights to preview the page · <button class="lv-link" data-lv="nosample">Back to live</button>`
      : `<span class="lv-dot"></span>VATSIM · PAW callsigns${age != null ? ` · network data ${age} s old` : ''}`;

  // list
  const list = $('#lvList')!;
  if (!S.loaded) list.innerHTML = '<div class="lv-empty">Loading…</div>';
  else if (!n) list.innerHTML = `<div class="lv-empty"><b>No Polaris flights on VATSIM right now.</b><span>Flights show here as soon as a pilot connects with a PAW callsign, for example PAW806.</span><button data-lv="sample">Preview with sample flights</button></div>`;
  else list.innerHTML = S.flights.map((f) => {
    const r = f.raw;
    return `<button class="lv-f${f.callsign === S.sel ? ' on' : ''}" data-cs="${esc(f.callsign)}">
      <span class="lv-cs">${esc(f.callsign)}</span><span class="lv-ph ph-${f.phase}">${LABEL[f.phase]}</span>
      <span class="lv-rt">${esc(aptCode(r.dep))} <i>→</i> ${esc(aptCode(r.arr))}<em>${esc(r.ac || '')}</em></span>
      <span class="lv-al">${r.gs < 45 ? (r.gs < 3 ? 'Parked' : r.gs + ' kt') : ft(r.alt) + ' · ' + r.gs + ' kt'}</span></button>`;
  }).join('');

  // detail
  const f = sel(), det = $('#lvDet')!;
  det.hidden = !f;
  if (!f) { det.innerHTML = ''; return; }
  const r = f.raw, idx = STEPS.findIndex(([k]) => k === f.phase);
  const vsTxt = f.vs == null ? '—' : (f.vs > 0 ? '+' : '') + f.vs.toLocaleString('en-US') + ' fpm';
  const eta = f.dArr != null && r.gs > 80 ? new Date(Date.now() + (f.dArr / r.gs) * 3600e3) : null;
  det.innerHTML = `
    <div class="lv-dh"><div><b>${esc(r.cs)}</b>${r.sample ? '<span class="lv-tag">SAMPLE</span>' : ''}<small>${esc(r.name || '')}${r.cid ? ' · CID ' + r.cid : ''}</small></div>
      <div class="lv-dbtn"><button class="msg" data-lv="msg"${r.sample ? ' disabled title="Sample flight: nobody to write to"' : ' title="Write a Polaris Mail message to this pilot"'}><svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.8 7l8.2 6.2L20.2 7"/></svg>Message</button><button data-lv="follow" aria-pressed="${S.follow}" title="Keep this flight in view">Follow</button><button data-lv="close" aria-label="Close">✕</button></div></div>
    <div class="lv-od">
      <div><b>${esc(aptCode(r.dep))}</b><small>${esc(f.dep?.city || (r.dep ? '' : 'No flight plan'))}</small></div>
      <div class="lv-bar"><span style="width:${f.pct == null ? 0 : (f.pct * 100).toFixed(1)}%"></span><i style="left:${f.pct == null ? 0 : (f.pct * 100).toFixed(1)}%"><svg viewBox="-10 -10 20 20"><path d="M0,-10 L1.5,-6.5 L1.5,-2.2 L9,2.2 L9,4 L1.5,2 L1.2,6.6 L4,8.6 L4,10 L0,9 L-4,10 L-4,8.6 L-1.2,6.6 L-1.5,2 L-9,4 L-9,2.2 L-1.5,-2.2 L-1.5,-6.5Z"/></svg></i></div>
      <div class="r"><b>${esc(aptCode(r.arr))}</b><small>${esc(f.arr?.city || '')}</small></div>
    </div>
    <div class="lv-dist">${f.dDep != null ? Math.round(f.dDep).toLocaleString('en-US') + ' nm flown' : ''}${f.dArr != null ? ' · ' + Math.round(f.dArr).toLocaleString('en-US') + ' nm to go' : ''}${eta ? ' · ETA ' + eta.toISOString().slice(11, 16) + 'Z' : ''}</div>
    <ol class="lv-steps">${STEPS.map(([k, l], i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><span></span><b>${l}</b></li>`).join('')}</ol>
    <dl class="lv-kv">
      <div><dt>Altitude</dt><dd>${r.gs < 45 ? 'On ground' : ft(r.alt)}</dd></div>
      <div><dt>Vertical speed</dt><dd>${vsTxt}</dd></div>
      <div><dt>Ground speed</dt><dd>${r.gs} kt</dd></div>
      <div><dt>Heading</dt><dd>${String(Math.round(r.hdg)).padStart(3, '0')}°</dd></div>
      <div><dt>Planned</dt><dd>${esc(r.fl || '—')}${r.tas ? ' · ' + esc(r.tas) + ' kt' : ''}</dd></div>
      <div><dt>Aircraft</dt><dd>${esc(r.ac || '—')}</dd></div>
      <div><dt>Squawk</dt><dd>${esc(r.sq || '—')}</dd></div>
      <div><dt>Online</dt><dd>${r.logon ? dur(Date.now() - r.logon) : '—'}</dd></div>
    </dl>
    ${r.route ? `<details class="lv-route"><summary>Route${r.altn ? ' · alternate ' + esc(r.altn) : ''}</summary><p>${esc(r.route)}</p></details>` : ''}`;
}

/* ---------- tabs ---------- */
function currentTab(): 'mail' | 'live' { return location.hash === '#live' ? 'live' : 'mail'; }
function showTab(): void {
  if (document.querySelector('.deny')) return;
  const t = currentTab();
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((a) => a.setAttribute('aria-current', String(a.dataset.tab === t)));
  const mail = $('#app'), live = $('#live');
  if (mail) mail.hidden = t !== 'mail';
  if (live) live.hidden = t !== 'live';
  document.body.classList.toggle('on-live', t === 'live');
  if (t === 'live') {
    if (!S.globe) {
      const c = $<HTMLCanvasElement>('#lvGlobe')!, ac = new AbortController();
      S.globe = new Globe(c, { signal: ac.signal, onPick: (cs) => pick(cs), layout: loadLayout, onUserMove: () => { if (S.follow) { S.follow = false; render(); } } });
      S.globe.pose([-150, 28], 1);
    }
    render();
    void poll(true);
  } else clearTimeout(S.timer);
}
/* airport diagrams for close zoom: the EFB server's OpenStreetMap layouts (same origin), kept for this page */
async function loadLayout(icao: string): Promise<Layout | null> {
  const r = await fetch('/api/efb/airport-layout?icao=' + encodeURIComponent(icao), { cache: 'default' });
  if (!r.ok) return null;
  const j = await r.json();
  return j && !j.notFound ? (j as Layout) : null;
}
function pick(cs: string | null): void {
  S.sel = cs;
  render();
  const f = sel();
  if (f) S.globe?.frameFlight(f); else S.globe?.overview();
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const fb = t.closest<HTMLElement>('[data-cs]');
  if (fb) { pick(fb.dataset.cs === S.sel ? null : fb.dataset.cs!); return; }
  const b = t.closest<HTMLElement>('[data-lv]');
  if (!b) return;
  const k = b.dataset.lv;
  if (k === 'in') S.globe?.zoomBy(1.5);
  else if (k === 'out') S.globe?.zoomBy(1 / 1.5);
  else if (k === 'all') { S.follow = false; pick(null); }
  else if (k === 'close') { S.follow = false; pick(null); }
  else if (k === 'follow') { S.follow = !S.follow; const f = sel(); if (S.follow && f) S.globe?.frameFlight(f); render(); }
  else if (k === 'msg') {
    const f = sel();
    const compose = (window as unknown as { pmCompose?: (t: { cs: string; cid: string; name: string }) => void }).pmCompose;
    if (f && !f.raw.sample && compose) compose({ cs: f.raw.cs, cid: f.raw.cid ? String(f.raw.cid) : '', name: f.raw.name || '' });
  }
  else if (k === 'sample') { S.sample = true; S.flights = build(samples(), Date.now()); pick('PAW806'); }
  else if (k === 'nosample') { S.sample = false; S.sel = null; S.flights = []; S.globe?.overview(); void poll(true); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sel && currentTab() === 'live') { S.follow = false; pick(null); } });
window.addEventListener('hashchange', showTab);
document.addEventListener('visibilitychange', () => { if (!document.hidden && currentTab() === 'live') void poll(true); });
// keep the "x s old" line and the live badge fresh between polls
setInterval(() => { if (currentTab() === 'live' && !document.hidden) { const s = $('#lvSrc'); if (s && S.upd && !S.error && !S.sample) { const age = Math.max(0, Math.round((Date.now() - Date.parse(S.upd)) / 1000)); s.innerHTML = `<span class="lv-dot"></span>VATSIM · PAW callsigns · network data ${age} s old`; } } }, 1000);
// count on the Live tab even while Mail is open (once a minute)
setInterval(() => { if (currentTab() === 'mail' && !document.hidden) void (async () => { try { const r = await fetch('/admin/api/live', { credentials: 'same-origin', cache: 'no-store' }); const j = await r.json(); const b = $('#lvCount'); if (b) { const n = (j.flights || []).length; b.textContent = n ? String(n) : ''; b.hidden = !n; } } catch { /* ignore */ } })(); }, 60_000);

// the admin is locked (not signed in through Access): leave the page as the server sent it
if (!document.querySelector('.deny')) showTab();
