/* VATSIM controllers on the map (src/vatspy.js) and the routes that read the feed once (src/index.js):
   /api/efb/vatsim-atc (the index read from KV as scripts/atc-index.mjs writes it), /api/efb/atis and /api/efb/datalink.
   Plain Node 22, no npm packages:
     node workers/polaris-efb-api/test/vatspy.test.mjs
   The network (VATSIM's feed), the edge cache and KV are stood in for. */
import assert from 'node:assert/strict';
import { parseVatspy, atcIndex, atcLookup, atcPack, atcOpen, atcOnline, CIRCLE_NM } from '../src/vatspy.js';

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('ok', n, name); };

/* ---- a small world ---- */
const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const DAT = `;comment
[Countries]
Japan|RJ|Control
[Airports]
RJTT|Tokyo-Haneda Intl|35.553256|139.781225||RJTG|0
RJAA|Narita Intl|35.764722|140.386389|NRT|RJTG|0
KJFK|New York-John F. Kennedy Intl NY|40.63975|-73.778925|JFK|KZNY|0
EGHI|Southampton|50.950261|-1.356803|SOU|EGTT|0
EGHI|Solent|50.95|-1.35|SOLENT|EGTT|1
VVNB|Noi Bai|21.221667|105.805556|HAN|VVHN|0
KALI|Alice Intl|27.740889|-98.026944||KZHU|0
[FIRs]
RJTG|Tokyo ACC - Tokyo||RJTG
RJTG-E|Tokyo ACC East - Tokyo|RJTG_E|RJTG-E
RCAA|Taipei|TPE|RCAA
VVHN|Ha Noi||VVHN
NOPE|No outline||NOPE
EYVL-E|Vilnius East|EYVL-E|EYVL-E
KZNY|New York|NY|KZNY
[UIRs]
ASIA|Asia Control|RJTG,RCAA
[IDL]
`;
const B = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { id: 'RJTG', oceanic: '0', label_lon: '140', label_lat: '37' }, geometry: { type: 'Polygon', coordinates: [sq(138, 34, 5)] } },
  { type: 'Feature', properties: { id: 'RJTG-E', oceanic: '0', label_lon: '142', label_lat: '37' }, geometry: { type: 'Polygon', coordinates: [sq(141, 35, 2)] } },
  { type: 'Feature', properties: { id: 'RCAA', oceanic: '0', label_lon: '121', label_lat: '24' }, geometry: { type: 'MultiPolygon', coordinates: [[sq(118, 21, 6)]] } },
  { type: 'Feature', properties: { id: 'VVHN', oceanic: '0', label_lon: '105', label_lat: '20' }, geometry: { type: 'Polygon', coordinates: [sq(102, 17, 7)] } },
  { type: 'Feature', properties: { id: 'EYVL-E', oceanic: '0', label_lon: '26', label_lat: '55' }, geometry: { type: 'Polygon', coordinates: [sq(25, 54, 2)] } },
  { type: 'Feature', properties: { id: 'KZNY', oceanic: '0', label_lon: '-74', label_lat: '41' }, geometry: { type: 'Polygon', coordinates: [sq(-76, 39, 4)] } },
] };
const T = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { id: 'TYO', prefix: ['RJTT'], name: 'Tokyo Approach' }, geometry: { type: 'MultiPolygon', coordinates: [[sq(139.4, 35.2, 0.8)]] } },
  { type: 'Feature', properties: { id: 'TYO', prefix: ['RJAA'], name: 'Tokyo Approach' }, geometry: { type: 'MultiPolygon', coordinates: [[sq(140.1, 35.5, 0.6)]] } },
  /* an approach unit that logs on as _CTR (SimAware names the suffix) */
  { type: 'Feature', properties: { id: 'CZVR', prefix: ['CZVR'], suffix: 'CTR', name: 'Vancouver Centre' }, geometry: { type: 'Polygon', coordinates: [sq(-124, 48, 3)] } },
  /* the TRACON file has one FeatureCollection inside its features */
  { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { id: 'N90', prefix: ['NY'], name: 'New York Approach' }, geometry: { type: 'Polygon', coordinates: [sq(-74.5, 40.3, 1)] } },
    { type: 'Feature', properties: { id: 'N90D', prefix: ['NY'], suffix: 'DEP', name: 'New York Departure' }, geometry: { type: 'Polygon', coordinates: [sq(-74.4, 40.4, 0.5)] } },
  ] },
] };
const FULL = atcIndex(DAT, B, T), IX = atcLookup(FULL);
const C = (cs, fac, extra) => ({ cs, cid: 1, n: 'A Controller', f: '118.100', fac, r: 5, on: '2026-11-28T10:00:00Z', x: 'info for ' + cs, ...extra });

await test('VATSpy.dat sections, comments left out', async () => {
  const S = parseVatspy(DAT);
  assert.deepEqual(Object.keys(S), ['Countries', 'Airports', 'FIRs', 'UIRs', 'IDL']);
  assert.equal(S.Airports.length, 7);
  assert.deepEqual(S.FIRs[1], ['RJTG-E', 'Tokyo ACC East - Tokyo', 'RJTG_E', 'RJTG-E']);
});

await test('index: prefixes, codes, UIRs, airports, TRACONs', async () => {
  assert.deepEqual(FULL.fir.RJTG_E, ['RJTG-E', 'Tokyo ACC East - Tokyo']);
  assert.deepEqual(FULL.fir.TPE, ['RCAA', 'Taipei']);
  assert.deepEqual(FULL.fir.RCAA, ['RCAA', 'Taipei'], 'a FIR answers to its own code too');
  assert.equal(FULL.fir.NOPE, undefined, 'a FIR with no outline is left out');
  assert.deepEqual(FULL.uir.ASIA[0], ['RJTG', 'RCAA']);
  assert.deepEqual(FULL.apt.EGHI.slice(2), ['Southampton'], 'the real airport wins over the pseudo one');
  assert.equal(FULL.lid.JFK, 'KJFK');
  assert.deepEqual(FULL.lid.SOLENT, [50.95, -1.35, 'Solent', 'EGHI'], 'a pseudo airport keeps its own position');
  assert.ok(FULL.trc.TYO && FULL.trc['TYO#2'], 'two outlines with the same id are kept apart');
  assert.ok(FULL.trc.N90, 'nested features are read');
  assert.deepEqual(FULL.tra.NY.map((t) => t[1]).sort(), ['', 'DEP']);
  assert.deepEqual(FULL.fir['EYVL-E'], ['EYVL-E', 'Vilnius East'], 'a prefix with "-" kept as callsigns write it');
  assert.deepEqual(FULL.fir.EYVL_E, ['EYVL-E', 'Vilnius East'], 'and the FIR code with "_"');
  assert.deepEqual(FULL.n, { fir: Object.keys(FULL.fir).length, bnd: 6, tra: 5, apt: 6 });
});

await test('centres: the longest prefix first, then shorter, then the FIR code', async () => {
  const o = atcOnline({ ctl: [C('RJTG_E_CTR', 6), C('RJTG_1_CTR', 6), C('TPE_CTR', 6), C('VVHN_CTR', 6)], atis: [] }, IX);
  const k = Object.fromEntries(o.ctl.map((c) => [c.cs, c.k]));
  const o2 = atcOnline({ ctl: [C('EYVL-E_CTR', 6), C('NY_FSS', 1), C('NY_CTR', 6), C('CZVR_CTR', 6)], atis: [] }, IX), A2 = Object.fromEntries(o2.areas.map((a) => [a.k, a.t]));
  assert.equal(o2.ctl.find((c) => c.cs === 'EYVL-E_CTR').k, 'F:EYVL-E', 'a prefix with "-"');
  assert.equal(A2['F:KZNY'], 'ctr', 'a centre and a flight service on one FIR: a centre');
  assert.equal(A2['T:CZVR'], 'ctr', 'an outline lit by a _CTR is a centre');
  assert.equal(k.RJTG_E_CTR, 'F:RJTG-E');
  assert.equal(k.RJTG_1_CTR, 'F:RJTG', 'a relief or unknown sector falls back to its FIR');
  assert.equal(k.TPE_CTR, 'F:RCAA');
  assert.equal(k.VVHN_CTR, 'F:VVHN');
  const a = o.areas.find((x) => x.k === 'F:RJTG');
  assert.equal(a.t, 'ctr'); assert.equal(a.nm, 'Tokyo ACC - Tokyo'); assert.deepEqual([a.lx, a.ly], [140, 37]); assert.deepEqual(a.cs, ['RJTG_1_CTR']);
  /* the biggest centre first, so the small ones are drawn on top */
  assert.deepEqual(o.areas.map((x) => x.k), ['F:VVHN', 'F:RCAA', 'F:RJTG', 'F:RJTG-E']);
});

await test('flight service: the UIR (several FIRs lit as one)', async () => {
  const o = atcOnline({ ctl: [C('ASIA_FSS', 1)], atis: [] }, IX);
  assert.equal(o.areas.length, 1);
  const a = o.areas[0];
  assert.equal(a.k, 'U:ASIA'); assert.equal(a.t, 'fss'); assert.equal(a.r.length, 2);
  assert.deepEqual([a.lx, a.ly], [130.5, 30.5], 'labelled between its FIRs');
});

await test('approaches: the TRACON by prefix and suffix, else a circle, else nothing', async () => {
  const o = atcOnline({ ctl: [C('RJTT_APP', 5), C('RJAA_W_APP', 5), C('NY_APP', 5), C('NY_DEP', 5), C('VVNB_APP', 5), C('XXXX_APP', 5)], atis: [] }, IX);
  const k = Object.fromEntries(o.ctl.map((c) => [c.cs, c.k]));
  assert.equal(k.RJTT_APP, 'T:TYO');
  assert.equal(k.RJAA_W_APP, 'T:TYO#2', 'RJAA_W not found: RJAA');
  assert.equal(k.NY_APP, 'T:N90', 'an outline naming another suffix is not lit');
  assert.equal(k.NY_DEP, 'T:N90D', 'the outline naming the suffix wins');
  assert.equal(k.VVNB_APP, 'C:VVNB');
  assert.equal(k.XXXX_APP, '');
  const c = o.areas.find((x) => x.k === 'C:VVNB');
  assert.equal(c.t, 'app'); assert.equal(c.r.length, 1); assert.equal(c.r[0][0].length, 49);
  const nm = Math.hypot((c.r[0][0][0][0] - 105.805556) * Math.cos(21.22 * Math.PI / 180), c.r[0][0][0][1] - 21.221667) * 60;
  assert.ok(Math.abs(nm - CIRCLE_NM) < 0.2, 'radius ' + nm);
  assert.deepEqual(o.ctl.find((x) => x.cs === 'RJTT_APP').ap, 'RJTT');
  assert.ok(o.areas.every((a, i, l) => i === 0 || !(a.t !== 'app' && l[i - 1].t === 'app')), 'centres before approaches');
  assert.deepEqual(o.areas.find((x) => x.k === 'T:TYO').bl, [139.8, 35.2], 'an approach is labelled under its bottom middle');
});

await test('airports: D, G, T from controllers and A from ATIS, in that order, by ICAO or local code', async () => {
  const o = atcOnline({ ctl: [C('RJTT_TWR', 4), C('RJTT_DEL', 2), C('JFK_GND', 3), C('ZZZZ_TWR', 4), C('RJTT_OBS', 0), C('XX', 4)],
    atis: [{ cs: 'RJTT_ATIS', f: '128.800', code: 'Q', on: '', x: 'TOKYO INTERNATIONAL AIRPORT\nINFORMATION Q' }, { cs: 'KJFK_ATIS', f: '128.725', code: 'B', on: '', x: '' }] }, IX);
  assert.deepEqual(o.apts.RJTT, [35.5533, 139.7812, 'Tokyo-Haneda Intl', 'DTA']);
  assert.deepEqual(o.apts.KJFK[3], 'GA');
  assert.equal(atcOnline({ ctl: [C('ALI_TWR', 4)], atis: [] }, IX).ctl[0].ap, 'KALI', 'a US airport without its local code in VATSpy');
  assert.equal(o.apts.ZZZZ, undefined);
  assert.deepEqual(o.ctl.map((c) => c.cs), ['JFK_GND', 'RJTT_DEL', 'RJTT_TWR', 'ZZZZ_TWR'], 'observers and callsigns without a facility left out');
  assert.equal(o.ctl.find((c) => c.cs === 'JFK_GND').ap, 'KJFK');
  assert.equal(o.ctl.find((c) => c.cs === 'RJTT_TWR').rt, 'C1');
  assert.equal(o.atis[1].x, 'TOKYO INTERNATIONAL AIRPORT INFORMATION Q');
  assert.equal(o.areas.length, 0, 'towers light no area');
});

await test('outlines: each polygon keeps its holes; the same outline twice is kept once', async () => {
  const hole = [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]];
  const ix = atcIndex(DAT, { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { id: 'VVHN' }, geometry: { type: 'Polygon', coordinates: [sq(0, 0, 4), hole] } },
    { type: 'Feature', properties: { id: 'VVHN' }, geometry: { type: 'Polygon', coordinates: [sq(0, 0, 4), hole] } },
    { type: 'Feature', properties: { id: 'VVHN' }, geometry: { type: 'Polygon', coordinates: [sq(3, 0, 4)] } },
  ] }, T);
  assert.equal(ix.bnd.VVHN.r.length, 2, 'two polygons, not three');
  assert.equal(ix.bnd.VVHN.r[0].length, 2, 'the first with its hole');
  const a = atcOnline({ ctl: [C('VVHN_CTR', 6)], atis: [] }, atcLookup(ix)).areas[0];
  assert.deepEqual(a.r.map((p) => p.length), [2, 1]);
});

await test('the hash changes with what is online, not with the update time', async () => {
  const a = atcOnline({ upd: '1', ctl: [C('RJTT_TWR', 4)], atis: [] }, IX), b = atcOnline({ upd: '2', ctl: [C('RJTT_TWR', 4)], atis: [] }, IX);
  const c = atcOnline({ upd: '2', ctl: [C('RJTT_TWR', 4), C('RJTT_GND', 3)], atis: [] }, IX);
  assert.equal(a.h, b.h); assert.notEqual(a.h, c.h);
});

/* ---- the index as KV keeps it: packed by atcPack, read back by atcOpen ---- */
await test('packed index: the same answers as the full one, also after a UTF-8 round trip', async () => {
  const p = atcPack(FULL), rt = (s) => new TextDecoder().decode(new TextEncoder().encode(s));
  const ix = atcOpen(JSON.parse(rt(p.lk)), rt(p.geo), rt(p.apt));
  const d = { ctl: [C('RJTG_E_CTR', 6), C('ASIA_FSS', 1), C('RJTT_APP', 5), C('NY_DEP', 5), C('VVNB_APP', 5), C('JFK_GND', 3), C('ALI_TWR', 4), C('EGHI_TWR', 4), C('EYVL-E_CTR', 6)],
    atis: [{ cs: 'RJTT_ATIS', f: '128.800', code: 'Q', on: '', x: 'INFO Q' }] };
  assert.equal(atcOnline(d, ix).json, atcOnline(d, IX).json);
  assert.match(p.id, /^\d{12}-[a-z0-9]+$/);
  for (const k of Object.keys(FULL.apt)) assert.deepEqual(ix.getA(k), FULL.apt[k], k);
  assert.equal(ix.getA('ZZZZ'), null); assert.equal(ix.getA('A'), null);
  assert.equal(ix.getB('NOPE'), null); assert.deepEqual(ix.getT('TYO#2'), FULL.trc['TYO#2']);
});

/* ---- the routes, with the network, the edge cache and KV stood in for ---- */
const store = new Map();
globalThis.caches = { default: {
  async match(r) { const e = store.get(typeof r === 'string' ? r : r.url); if (!e || Date.now() > e.exp) return undefined; return new Response(e.body, { headers: e.headers }); },
  async put(r, res) { const m = /max-age=(\d+)/.exec(res.headers.get('Cache-Control') || ''); store.set(typeof r === 'string' ? r : r.url, { body: await res.text(), headers: Object.fromEntries(res.headers), exp: Date.now() + (m ? +m[1] * 1000 : 60000) }); },
} };
const kv = new Map();
const env = { STORE: {
  async get(k, o) { const t = typeof o === 'string' ? o : o && o.type, v = kv.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; },
  async put(k, v) { kv.set(k, v); } }, ALLOWED_ORIGINS: 'https://koz8738.com' };
const ctx = { waits: [], waitUntil(p) { this.waits.push(p); } };
const settle = async () => { await Promise.all(ctx.waits); ctx.waits = []; };
let upd = '2026-11-28T13:29:29.0Z', feedReads = 0, vatspyReads = 0;
const feed = () => ({
  general: { update_timestamp: upd },
  pilots: [{ callsign: 'PAW12', cid: 1, name: 'P', latitude: 35, longitude: 139, altitude: 30000, groundspeed: 450, heading: 90, flight_plan: { departure: 'RJTT', arrival: 'KSFO', route: 'DCT' } }],
  controllers: [
    { cid: 9, name: 'Obs', callsign: 'XX_OBS', frequency: '199.998', facility: 0, rating: 1, text_atis: null, logon_time: '2026-11-28T10:00:00Z' },
    { cid: 2, name: 'Centre', callsign: 'RJTG_E_CTR', frequency: '133.600', facility: 6, rating: 5, text_atis: ['Tokyo Control', 'CPDLC LOGON RJJJ'], logon_time: '2026-11-28T10:00:00Z' },
    { cid: 3, name: 'Tower', callsign: 'RJTT_TWR', frequency: '118.100', facility: 4, rating: 3, text_atis: ['Haneda Tower'], logon_time: '2026-11-28T11:00:00Z' },
  ],
  atis: [{ cid: 4, name: 'Atis', callsign: 'RJTT_ATIS', frequency: '128.800', facility: 4, rating: 3, atis_code: 'Q', text_atis: ['TOKYO INTERNATIONAL', 'INFORMATION Q', 'DCL AVBL'], logon_time: '2026-11-28T11:00:00Z', last_updated: '2026-11-28T13:20:00Z' }],
});
globalThis.fetch = async (u) => {
  const s = String(u);
  if (s === 'https://data.vatsim.net/v3/vatsim-data.json') { feedReads++; return new Response(JSON.stringify(feed()), { headers: { 'Content-Type': 'application/json' } }); }
  if (/vatspy|simaware|TRACON/i.test(s)) { vatspyReads++; return new Response('', { status: 500 }); }
  if (s.startsWith('https://atis.info/')) return new Response('[]', { status: 404 });
  throw new Error('unexpected fetch ' + s);
};
const { default: worker } = await import('../src/index.js');
const get = (path, headers) => worker.fetch(new Request('https://efb-api.koz8738.com' + path, { headers: { Origin: 'https://koz8738.com', ...(headers || {}) } }), env, ctx);
/* what scripts/atc-index.mjs writes */
const putIndex = (full) => { const p = atcPack(full); kv.set('atc:v2:geo:' + p.id, p.geo); kv.set('atc:v2:apt:' + p.id, p.apt); kv.set('atc:v2:lk', p.lk); return p.id; };
const realNow0 = Date.now;
let clock = 0; Date.now = () => realNow0() + clock;

await test('vatsim-atc: 503 until the index is in KV; the Worker never builds it', async () => {
  const r = await get('/api/efb/vatsim-atc'); await settle();
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /ready/);
  assert.equal(vatspyReads, 0, 'VATSpy and SimAware are never read by the Worker');
  assert.equal((await get('/api/efb/vatsim-atc')).status, 503, 'and KV is not asked again for a minute');
});

let etag = '';
await test('vatsim-atc: areas, controllers, airports from the index in KV', async () => {
  putIndex(FULL); clock += 61_000;
  const r = await get('/api/efb/vatsim-atc'); await settle();
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://koz8738.com');
  etag = r.headers.get('ETag'); assert.match(etag, /^"atc-[a-z0-9]+"$/);
  const j = await r.json();
  assert.equal(j.upd, upd); assert.match(j.h, /^[a-z0-9]+$/);
  assert.deepEqual(j.areas.map((a) => a.k), ['F:RJTG-E']);
  assert.deepEqual(j.ctl.map((c) => c.cs), ['RJTG_E_CTR', 'RJTT_TWR']);
  assert.equal(j.ctl[0].x, 'Tokyo Control\nCPDLC LOGON RJJJ');
  assert.deepEqual(j.apts.RJTT[3], 'TA');
  assert.equal(j.atis[0].code, 'Q');
});

await test('vatsim-atc: 304 for the same answer, also through a weak ETag', async () => {
  assert.equal((await get('/api/efb/vatsim-atc', { 'If-None-Match': etag })).status, 304);
  assert.equal((await get('/api/efb/vatsim-atc', { 'If-None-Match': 'W/' + etag })).status, 304);
  assert.equal((await get('/api/efb/vatsim-atc', { 'If-None-Match': '"atc-other"' })).status, 200);
});

await test('atis and datalink: from the same read of the feed', async () => {
  const before = feedReads;
  const a = await (await get('/api/efb/atis?icao=RJTT')).json(); await settle();
  assert.deepEqual(a.vatsim.map((x) => [x.cs, x.f, x.code, x.text]), [['RJTT_ATIS', '128.800', 'Q', 'TOKYO INTERNATIONAL INFORMATION Q DCL AVBL']]);
  assert.equal(a.vatsim[0].upd, '2026-11-28T13:20:00Z');
  const d = await (await get('/api/efb/datalink')).json();
  assert.deepEqual(d.stations.map((s) => [s.cs, s.fac, s.kind.join(), s.code]), [['RJTG_E_CTR', 'CTR', 'CPDLC', 'RJJJ'], ['RJTT_ATIS', 'ATIS', 'DCL', '']]);
  assert.equal(d.at, upd);
  assert.equal(feedReads, before, 'no second read of the network feed');
});

await test('vatsim-atc: a new update of the feed with the same people keeps the ETag', async () => {
  upd = '2026-11-28T13:29:45.0Z'; clock += 61_000; // past the feed's 16 s and the cached answer's minute
  const r = await get('/api/efb/vatsim-atc'); await settle();
  assert.equal(r.status, 200); assert.equal(r.headers.get('ETag'), etag);
  assert.equal((await r.json()).upd, upd);
});

await test("vatsim-atc: a new build is used after 6 hours; one that can't be read whole is not", async () => {
  /* a build without Tokyo East: its pieces missing first, then all there */
  const full2 = atcIndex(DAT.replace('RJTG-E|Tokyo ACC East - Tokyo|RJTG_E|RJTG-E\n', ''), B, T);
  const id2 = putIndex(full2); kv.delete('atc:v2:geo:' + id2);
  upd = '2026-11-28T20:00:00.0Z'; clock += 7 * 3600_000;
  let j = await (await get('/api/efb/vatsim-atc')).json(); await settle();
  assert.deepEqual(j.areas.map((a) => a.k), ['F:RJTG-E'], 'the old build stays while the new one is incomplete');
  putIndex(full2);
  upd = '2026-11-29T03:00:00.0Z'; clock += 7 * 3600_000;
  j = await (await get('/api/efb/vatsim-atc')).json(); await settle();
  assert.deepEqual(j.areas.map((a) => a.k), ['F:RJTG'], 'RJTG_E_CTR now falls back to RJTG');
  assert.equal(vatspyReads, 0);
});
Date.now = realNow0;

console.log(`\n${n} tests passed`);
