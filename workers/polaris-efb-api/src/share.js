/* ---------- Share my flight: a public link to the pilot's flight on a map ----------
   The pilot turns it on in the EFB (Map › ⋯ › Share my flight); anyone with the link sees the aircraft, its route and
   the track flown so far, until the pilot stops sharing or the link runs out (the flight time plus 3 hours, 24 hours at
   most). Nothing else about the pilot is shown: callsign, the two airports, the route, position, altitude, speed.
     POST   /api/efb/share   (signed in) {cs, dep, arr, depN, arrN, route:[[lat,lon]...], ete}  -> { t, url, exp }
     GET    /api/efb/share   (signed in)                                                     -> { t, url, exp } | { none }
     POST   /api/efb/share   (signed in) {off:true} (or DELETE)                               -> { ok }
     GET    /s/<t>           the page (no sign-in)
     GET    /s/<t>/data      what the page shows, JSON (no sign-in)
   Where the aircraft is: the pilot's simulator through the Backup PFD relay (src/pfd.js), which keeps the last reading
   and, only while a share is on, a point every 30 s for the track; else the Polaris flight with that callsign on
   vAMSYS / VATSIM. Records: KV "sh:<t>" (the share) and "shu:<pilot>" (the pilot's one share), both gone when it ends. */
import { sessionOf } from './auth.js';

const tokOk = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{20,40}$/.test(t);
const newTok = () => { const b = new Uint8Array(18); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>"'`]/g, '').slice(0, n);
const icao = (v) => (/^[A-Z0-9]{3,4}$/.test(String(v || '').toUpperCase()) ? String(v).toUpperCase() : '');

export async function shareRoute(req, url, env, h, deps) {
  const json = (b, s = 200, extra) => new Response(JSON.stringify(b), { status: s, headers: { ...h, ...(extra || {}), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  const base = 'https://' + url.host;
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/api/efb/share') {
    const me = await sessionOf(req, env, req.method !== 'GET');
    if (!me) return json({ error: 'Sign in first' }, 401);
    if (!env.STORE) return json({ error: 'Not set up on the server' }, 503);
    const cur = await env.STORE.get('shu:' + me.u);
    const relay = env.PFD ? env.PFD.get(env.PFD.idFromName(me.u)) : null;
    if (req.method === 'GET') {
      if (!cur) return json({ none: 1 });
      const s = await env.STORE.get('sh:' + cur, 'json');
      if (!s || s.exp < Date.now()) return json({ none: 1 });
      return json({ t: cur, url: base + '/s/' + cur, exp: s.exp, cs: s.cs });
    }
    let b = null;
    if (req.method === 'POST') { const raw = await req.text(); if (raw.length > 60_000) return json({ error: 'Too large' }, 413); try { b = JSON.parse(raw); } catch (e) { return json({ error: 'Bad body' }, 400); } }
    if (req.method === 'DELETE' || (b && b.off)) {
      if (cur) { await env.STORE.delete('sh:' + cur); await env.STORE.delete('shu:' + me.u); }
      if (relay) await relay.fetch('https://pfd/share', { method: 'POST', body: JSON.stringify({ on: false }) }).catch(() => {});
      return json({ ok: true });
    }
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const route = (Array.isArray(b.route) ? b.route.slice(0, 400) : []).map((p) => [Math.round(+p[0] * 1e4) / 1e4, Math.round(+p[1] * 1e4) / 1e4]).filter((p) => Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 540);
    const ete = Math.max(0, Math.min(20 * 3600, +b.ete || 0)), now = Date.now();
    const exp = now + Math.max(2 * 3600e3, Math.min(24 * 3600e3, (ete ? ete * 1000 : 4 * 3600e3) + 3 * 3600e3));
    const s = { u: me.u, cs: clean(b.cs, 10).toUpperCase(), dep: icao(b.dep), arr: icao(b.arr), depN: clean(b.depN, 60), arrN: clean(b.arrN, 60), route, t0: now, exp };
    if (cur) await env.STORE.delete('sh:' + cur);
    const t = newTok(), ttl = Math.ceil((exp - now) / 1000) + 60;
    await env.STORE.put('sh:' + t, JSON.stringify(s), { expirationTtl: ttl });
    await env.STORE.put('shu:' + me.u, t, { expirationTtl: ttl });
    if (relay) await relay.fetch('https://pfd/share', { method: 'POST', body: JSON.stringify({ on: true, exp }) }).catch(() => {});
    return json({ t, url: base + '/s/' + t, exp, cs: s.cs });
  }
  const m = path.match(/^\/s\/([A-Za-z0-9_-]+)(\/data)?$/);
  if (!m) return null;
  const t = m[1];
  const s = tokOk(t) && env.STORE ? await env.STORE.get('sh:' + t, 'json') : null;
  if (!m[2]) return new Response(pageHtml(s && s.exp > Date.now()), { status: s ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' } });
  const pub = { 'Access-Control-Allow-Origin': '*' };
  if (!s || s.exp < Date.now()) return json({ ended: 1 }, 404, pub);
  let pos = null, trk = [], src = '';
  if (env.PFD) {
    try {
      const r = await env.PFD.get(env.PFD.idFromName(s.u)).fetch('https://pfd/last');
      const j = await r.json();
      trk = Array.isArray(j.trk) ? j.trk : [];
      if (j.f && Date.now() - (j.at || 0) < 20_000) {
        const f = JSON.parse(j.f);
        if (isFinite(f.la) && isFinite(f.lo)) { pos = { la: f.la, lo: f.lo, alt: Math.round(f.alt || 0), gs: Math.round(f.gs || 0), hdg: Math.round((((f.k != null ? f.k : f.h) || 0) + (f.mv || 0) + 360) % 360), vs: Math.round(f.vs || 0), g: f.g ? 1 : 0, at: j.at }; src = 'sim'; }
      }
    } catch (e) {}
  }
  if (!pos && s.cs && deps && deps.pawLive) {
    try {
      const live = await deps.pawLive(), f = (live.flights || []).find((x) => x.cs === s.cs);
      if (f && isFinite(f.lat)) { pos = { la: f.lat, lo: f.lon, alt: Math.round(f.alt || 0), gs: Math.round(f.gs || 0), hdg: Math.round(f.hdg || 0), vs: 0, g: f.gs < 50 ? 1 : 0, at: f.pt || Date.now() }; src = f.ps || 'network'; if (!trk.length && Array.isArray(f.trail)) trk = f.trail.slice(-600); }
    } catch (e) {}
  }
  return json({ cs: s.cs, dep: s.dep, arr: s.arr, depN: s.depN, arrN: s.arrN, route: s.route, exp: s.exp, pos, trk, src }, 200, pub);
}

/* the page: a map with the route, the track and the aircraft, and the numbers; asks for new data every 5 s */
export function pageHtml(ok) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Polaris Airways · live flight</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css">
<style>
:root{--bg:#0B1426;--ink:#fff;--sub:#9FB4D0;--gold:#E2B86A;--glass:rgba(8,14,28,.72)}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
#map{position:absolute;inset:0}.maplibregl-ctrl-attrib{font-size:10px}
.top{position:absolute;left:max(14px,env(safe-area-inset-left));right:max(14px,env(safe-area-inset-right));top:max(14px,env(safe-area-inset-top));display:flex;justify-content:space-between;gap:12px;pointer-events:none}
.card{background:var(--glass);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:16px;padding:12px 16px}
.fl small{display:block;font:700 11px/1 inherit;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}.fl b{display:block;font-size:20px;font-weight:600;margin-top:5px}.fl span{color:var(--sub);font-size:13px}
.st{align-self:flex-start;font-size:13px;color:var(--sub);white-space:nowrap}.st i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#30D158;margin-right:6px;vertical-align:1px}.st.off i{background:#8E8E93}
.bot{position:absolute;left:max(14px,env(safe-area-inset-left));right:max(14px,env(safe-area-inset-right));bottom:max(22px,env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px 18px}
.c small{display:block;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--sub)}.c b{font:600 22px ui-monospace,Menlo,monospace}.c b i{font:500 12px inherit;font-style:normal;color:var(--sub);margin-left:4px}
.end{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:24px}.end h1{font-weight:600;font-size:26px;margin:0 0 8px}.end p{color:var(--sub);margin:0}
</style></head><body>
${ok ? `<div id="map"></div><div class="top"><div class="card fl"><small>Polaris Airways</small><b id="cs">…</b><span id="od"></span></div><div class="card st" id="st"><i></i>Loading…</div></div><div class="card bot" id="bot"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js"></script>
<script>
(function(){"use strict";const T=location.pathname.split("/")[2],$=s=>document.querySelector(s),esc=v=>String(v==null?"":v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const k=v=>Math.round(v).toLocaleString("en-US");let map=null,laid=false,fit=false,D=null,ended=0;
function unwrap(L){let p=null;return L.map(q=>{let lo=q[1];if(p!=null){while(lo-p>180)lo-=360;while(lo-p<-180)lo+=360}p=lo;return[lo,q[0]]})}
function lay(){if(!map||laid||!map.isStyleLoaded())return;laid=true;const E={type:"FeatureCollection",features:[]};
  ["route","trk","ac","ends"].forEach(s=>map.addSource(s,{type:"geojson",data:E}));
  map.addLayer({id:"route",type:"line",source:"route",paint:{"line-color":"#5A6E8C","line-width":2.5,"line-dasharray":[2,1.5]}});
  map.addLayer({id:"trk",type:"line",source:"trk",paint:{"line-color":"#E2B86A","line-width":4},layout:{"line-cap":"round","line-join":"round"}});
  map.addLayer({id:"ends",type:"circle",source:"ends",paint:{"circle-radius":5,"circle-color":"#fff","circle-stroke-color":"#1A6772","circle-stroke-width":2.5}});
  const c=document.createElement("canvas");c.width=c.height=72;const g=c.getContext("2d");g.translate(36,36);g.scale(3,3);const P=new Path2D("M0-10L1.7-3.5L9 1V3.2L1.7 1.6L1.3 6.4L3.8 8.4V10L0 9L-3.8 10V8.4L-1.3 6.4L-1.7 1.6L-9 3.2V1L-1.7-3.5Z");
  g.lineJoin="round";g.strokeStyle="#fff";g.lineWidth=1.6;g.stroke(P);g.fillStyle="#1A6772";g.fill(P);map.addImage("ac",g.getImageData(0,0,72,72),{pixelRatio:2});
  map.addLayer({id:"ac",type:"symbol",source:"ac",layout:{"icon-image":"ac","icon-rotate":["get","h"],"icon-rotation-alignment":"map","icon-allow-overlap":true,"icon-ignore-placement":true}});draw()}
function draw(){if(!D)return;$("#cs").textContent=D.cs||"Polaris flight";$("#od").textContent=[D.depN||D.dep,D.arrN||D.arr].filter(Boolean).join(" → ");
  const p=D.pos,st=$("#st");st.className="card st"+(p?"":" off");st.innerHTML="<i></i>"+(p?(p.g?"On the ground":"In flight")+" · "+new Date(p.at).toISOString().slice(11,16)+"Z":"Waiting for the aircraft");
  $("#bot").innerHTML=p?'<div class="c"><small>Altitude</small><b>'+k(p.alt)+'<i>ft</i></b></div><div class="c"><small>Ground speed</small><b>'+k(p.gs)+'<i>kt</i></b></div><div class="c"><small>Speed</small><b>'+k(p.gs*1.852)+'<i>km/h</i></b></div><div class="c"><small>Heading</small><b>'+String(p.hdg).padStart(3,"0")+'<i>°</i></b></div>':'<div class="c"><small>Status</small><b style="font-size:16px">The aircraft shows here once it is online</b></div>';
  if(!map||!laid)return;const R=unwrap(D.route||[]);map.getSource("route").setData({type:"Feature",geometry:{type:"LineString",coordinates:R.length>1?R:[[0,0],[0,0]]}});
  const tk=unwrap((D.trk||[]).map(q=>[q[0],q[1]]).concat(p?[[p.la,p.lo]]:[]));map.getSource("trk").setData({type:"Feature",geometry:{type:"LineString",coordinates:tk.length>1?tk:[[0,0],[0,0]]}});
  map.getSource("ends").setData({type:"FeatureCollection",features:R.length?[R[0],R[R.length-1]].map(c=>({type:"Feature",geometry:{type:"Point",coordinates:c}})):[]});
  map.getSource("ac").setData(p?{type:"Feature",properties:{h:p.hdg},geometry:{type:"Point",coordinates:[p.lo,p.la]}}:{type:"FeatureCollection",features:[]});
  if(!fit){const pts=R.concat(p?[[p.lo,p.la]]:[]);if(pts.length){fit=true;let w=180,e=-180,s=90,n=-90;pts.forEach(q=>{w=Math.min(w,q[0]);e=Math.max(e,q[0]);s=Math.min(s,q[1]);n=Math.max(n,q[1])});map.fitBounds([[w,s],[e,n]],{padding:{top:110,bottom:120,left:40,right:40},maxZoom:8,duration:0})}}}
function load(){fetch("/s/"+T+"/data",{cache:"no-store"}).then(r=>r.json()).then(j=>{if(j.ended){ended=1;document.body.innerHTML='<div class="end"><div><h1>This flight is no longer shared</h1><p>The pilot stopped sharing it, or the link has run out.</p></div></div>';return}D=j;draw()}).catch(()=>{}).finally(()=>{if(!ended)setTimeout(load,5000)})}
try{map=new maplibregl.Map({container:"map",style:"https://tiles.openfreemap.org/styles/positron",center:[121,25],zoom:3,attributionControl:{compact:true}});map.on("load",lay)}catch(e){}
load()})();
</script>` : `<div class="end"><div><h1>This flight is no longer shared</h1><p>The pilot stopped sharing it, or the link has run out.</p></div></div>`}
</body></html>`;
}
