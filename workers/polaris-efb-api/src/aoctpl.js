/* ---------- The wording of the automatic AOC messages, set on /admin › Automatic messages (Nov 2026) ----------
   Each automatic message (gate assignment, departure gate, final loadsheet, SIGMET on the route, arrival report) is written from a
   template staff can change. A template is plain text with fields in braces:

     {GATE}            the value
     {ZFW:9}           the value, right-aligned in 9 characters (for columns of figures)
     [[ TERMINAL {TERMINAL}]]   a part left out when a field inside it is empty (parts may sit inside parts)

   A line that had fields or parts and comes out empty is left out; an empty line in the template stays. What is not
   set keeps the default below. Kept in KV: aoc:v1:tpl -> { at, by, m: { gate: { title, body, … }, … } }

   Admin: GET  /admin/api/aoctpl          -> { kinds, tpl, def, at, by, last: { kind: { t, cs } } (the last one sent) }
          POST /admin/api/aoctpl          { kind, fields } saves one message ({ kind, reset: true } back to the default)
          POST /admin/api/aoctpl/preview  { kind, fields } -> { title, body } with sample values */
import { aocAutoLast } from './aoc.js';

const KEY = 'aoc:v1:tpl';
const jsonRes = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const NOTE_GATE = 'IF ATC ASSIGNS ANOTHER GATE, FOLLOW ATC', NOTE_DEP = 'IF THE GATE IS TAKEN WHEN YOU SET UP, USE A FREE GATE NEARBY AND TELL GROUND';

/* every message: its fields (what staff edit), the values it can use, the defaults and a sample for the preview */
export const AOC_KINDS = [
  { k: 'gate', name: 'Gate assignment', when: 'To a flight before it lands, with its arrival gate',
    fields: [['title', 'Title', 1], ['titleChg', 'Title when staff change the gate', 1], ['body', 'Message', 4], ['bodyNone', 'Message when no gate can be given', 4]],
    tokens: [['CALLSIGN', 'Callsign'], ['DEP', 'Departure airport'], ['ARR', 'Arrival airport'], ['ETA', 'Landing time, as 0814Z'], ['GATE', 'The gate'], ['TERMINAL', 'The terminal, when the plan names one']],
    def: { title: 'GATE ASSIGNMENT', titleChg: 'GATE CHANGE', body: '{CALLSIGN} {DEP}-{ARR} ETA {ETA}\nGATE {GATE}[[  TERMINAL {TERMINAL}]]\n' + NOTE_GATE, bodyNone: '{CALLSIGN} {DEP}-{ARR} ETA {ETA}\nGATE: CONTACT GROUND ON ARRIVAL\n' + NOTE_GATE },
    sample: { CALLSIGN: 'PAW703', DEP: 'KSFO', ARR: 'KLAX', ETA: '1102Z', GATE: 'B12', TERMINAL: 'B' } },
  { k: 'dep', name: 'Departure gate', when: 'At check-in, with the gate to set up at',
    fields: [['title', 'Title', 1], ['titleChg', 'Title when staff change the gate', 1], ['body', 'Message', 4], ['bodyNone', 'Message when no planned gate is free', 4]],
    tokens: [['CALLSIGN', 'Callsign'], ['DEP', 'Departure airport'], ['ARR', 'Arrival airport'], ['STD', 'Departure time, as 0945Z'], ['AIRCRAFT', 'Aircraft type'], ['GATE', 'The gate'], ['TERMINAL', 'The terminal, when the plan names one']],
    def: { title: 'DEPARTURE GATE', titleChg: 'DEPARTURE GATE CHANGE', body: '{CALLSIGN} {DEP}-{ARR}[[ STD {STD}]][[  {AIRCRAFT}]]\nDEPARTURE GATE {GATE}[[  TERMINAL {TERMINAL}]]\n' + NOTE_DEP,
      bodyNone: '{CALLSIGN} {DEP}-{ARR}[[ STD {STD}]][[  {AIRCRAFT}]]\nNO PLANNED GATE IS FREE AROUND YOUR DEPARTURE: USE ANY FREE GATE\n' + NOTE_DEP },
    sample: { CALLSIGN: 'PAW703', DEP: 'KSFO', ARR: 'KLAX', STD: '0945Z', AIRCRAFT: 'A21N', GATE: 'B1', TERMINAL: '1' } },
  { k: 'ls', name: 'Final loadsheet', when: '15 minutes before departure, from the plan the pilot loaded',
    fields: [['title', 'Title', 1], ['body', 'Message', 20]],
    tokens: [['TIME', 'When it is sent, as 0930Z'], ['FLIGHT', 'Callsign'], ['DATE', 'Date, as 22NOV'], ['FROM', 'Departure airport'], ['TO', 'Arrival airport'], ['REG', 'Registration'], ['TYPE', 'Aircraft type'], ['STD', 'Departure time'],
      ['UNITS', 'KG or LB'], ['ZFW', 'Zero fuel weight'], ['MZFW', 'Its limit'], ['TOF', 'Takeoff fuel'], ['TOW', 'Takeoff weight'], ['MTOW', 'Its limit'], ['TIF', 'Trip fuel'], ['LAW', 'Landing weight'], ['MLW', 'Its limit'],
      ['UNDLD', 'Underload'], ['LIMIT', 'The limiting weight: ZFW, TOW or LAW'], ['PAX', 'Passengers'], ['SEATS', 'Seats'], ['LOAD', 'Passengers, bags and cargo'], ['CHANGES', 'What changed from the OFP, or NO CHANGES FROM THE OFP']],
    def: { title: 'LOADSHEET FINAL', body: ['LOADSHEET FINAL {TIME}  EDNO 1', '{FLIGHT}/{DATE}  {FROM}-{TO}', '[[{REG}  ]]{TYPE}[[  STD {STD}]]', 'ALL WEIGHTS IN {UNITS}', '',
      'ZFW   {ZFW:9}[[   MAX {MZFW:9}]]', 'TOF   {TOF:9}', 'TOW   {TOW:9}[[   MAX {MTOW:9}]]', 'TIF   {TIF:9}', 'LAW   {LAW:9}[[   MAX {MLW:9}]]', '[[UNDLD {UNDLD:9}   ({LIMIT} LIMITING)]]', '',
      '[[PAX   {PAX:9}[[   OF {SEATS} SEATS]]]]', '[[LOAD  {LOAD:9}   PAX, BAGS AND CARGO]]', '', '{CHANGES}', 'UPDATE THE FMS ZFW IF IT HAS CHANGED.', 'LMC NIL', 'PREPARED BY POLARIS LOAD CONTROL'].join('\n') },
    sample: { TIME: '0930Z', FLIGHT: 'PAW703', DATE: '22NOV', FROM: 'KSFO', TO: 'KLAX', REG: 'N785PL', TYPE: 'A21N', STD: '0945Z', UNITS: 'KG', ZFW: '68,420', MZFW: '75,600', TOF: '10,500', TOW: '78,920', MTOW: '97,000', TIF: '3,950',
      LAW: '74,970', MLW: '79,200', UNDLD: '4,230', LIMIT: 'LAW', PAX: '182', SEATS: '194', LOAD: '18,340', CHANGES: 'CHANGES FROM THE OFP: PAX -2, ZFW -180 KG' } },
  { k: 'sig', name: 'SIGMET on route', when: 'To a flight in the air with a SIGMET ahead on its route',
    fields: [['title', 'Title', 1], ['body', 'First line', 2], ['item', 'For each SIGMET', 5], ['foot', 'Last lines', 3]],
    tokens: [['CALLSIGN', 'Callsign'], ['DEP', 'Departure airport'], ['ARR', 'Arrival airport'], ['CRUISE', 'Cruise level, as FL370'],
      ['N', 'Its number, when there are several'], ['SUMMARY', 'FIR, hazard, levels, validity and movement in one line'], ['FIR', 'The FIR'], ['HAZARD', 'The hazard'], ['LEVELS', 'Its levels'], ['VALID', 'Its validity'], ['MOVE', 'Its movement'],
      ['POSITION', 'Where it is from the aircraft'], ['RAW', 'The SIGMET as issued']],
    def: { title: 'SIGMET ON ROUTE', body: '{CALLSIGN} {DEP}-{ARR}[[  {CRUISE}]]', item: '\n[[{N}. ]]{SUMMARY}\n{POSITION}\n{RAW}', foot: '\nSEE THE SIGMET LAYER ON THE EFB MAP. COORDINATE ANY DEVIATION OR LEVEL CHANGE WITH ATC.' },
    sample: { CALLSIGN: 'PAW703', DEP: 'KSFO', ARR: 'KLAX', CRUISE: 'FL370', N: '', SUMMARY: 'KZLA LOS ANGELES FIR  SEV TURB  FL300-FL410  VALID 0900Z-1300Z  MOV E 20KT', FIR: 'KZLA LOS ANGELES FIR', HAZARD: 'SEV TURB', LEVELS: 'FL300-FL410',
      VALID: 'VALID 0900Z-1300Z', MOVE: 'MOV E 20KT', POSITION: 'ABOUT 140 NM AHEAD, IN ABOUT 18 MIN, NEAR N3542 W12018, YOUR LEVEL ABOUT FL370', RAW: 'KZLA SIGMET B2 VALID 220900/221300 KKCI- LOS ANGELES FIR SEV TURB FCST…' } },
  { k: 'inr', name: 'Arrival report', when: 'At the gate after landing, with the flight’s times (inreport.js)',
    fields: [['title', 'Title', 1], ['body', 'Message', 8]],
    tokens: [['CALLSIGN', 'Callsign'], ['DEP', 'Departure airport'], ['ARR', 'Arrival airport'], ['DATE', 'Date, as 23NOV'],
      ['OUT', 'Off the gate, as 0814Z'], ['OFF', 'Airborne'], ['ON', 'Landed'], ['IN', 'At the gate'], ['BLOCK', 'Block time, as 1:23'], ['AIR', 'Air time'],
      ['TAXIOUT', 'Taxi-out minutes'], ['TAXIIN', 'Taxi-in minutes'], ['STA', 'Scheduled arrival'], ['ONTIME', 'ON TIME, or so many MIN LATE / EARLY'],
      ['GATE', 'The gate AOC gave it'], ['TERMINAL', 'Its terminal'], ['METAR', 'The arrival airport’s latest METAR']],
    def: { title: 'ARRIVAL REPORT', body: ['{CALLSIGN} {DEP}-{ARR}  {DATE}', '[[OUT {OUT}  ]][[OFF {OFF}  ]]ON {ON}  IN {IN}', '[[BLOCK {BLOCK}  ]][[AIR {AIR}  ]][[TAXI IN {TAXIIN} MIN]]',
      '[[STA {STA}  {ONTIME}]]', '[[GATE {GATE}[[  TERMINAL {TERMINAL}]]]]', '[[METAR {METAR}]]', '', 'THANK YOU FOR FLYING POLARIS. HAVE A GOOD REST.'].join('\n') },
    sample: { CALLSIGN: 'PAW703', DEP: 'KSFO', ARR: 'KLAX', DATE: '23NOV', OUT: '0931Z', OFF: '0944Z', ON: '1052Z', IN: '1101Z', BLOCK: '1:30', AIR: '1:08', TAXIOUT: '13', TAXIIN: '9',
      STA: '1105Z', ONTIME: 'ON TIME (-4 MIN)', GATE: '52A', TERMINAL: '5', METAR: 'KLAX 231053Z 25008KT 10SM FEW020 18/12 A2996' } },
];
const KIND = Object.fromEntries(AOC_KINDS.map((x) => [x.k, x]));
const LEN = { 1: 60, 2: 300, 3: 600, 4: 800, 5: 800, 8: 1500, 20: 3000 };

const val = (v) => String(v == null ? '' : v).replace(/[{}]/g, '').replace(/\[\[|\]\]/g, '');
/* one line of a template with its fields filled in; null when the line is to be left out */
function fillLine(line, vars) {
  if (!/[{[]/.test(line)) return line;
  const tok = (s, onEmpty) => s.replace(/\{([A-Z][A-Z0-9_]{0,20})(?::(\d{1,2}))?\}/g, (m, k, w) => { const v = val(vars[k]); if (!v) onEmpty(); return w ? v.padStart(+w) : v; });
  let s = line, guard = 0;
  /* the innermost parts first */
  for (;;) { const m = s.match(/\[\[((?:(?!\[\[|\]\])[\s\S])*)\]\]/); if (!m || guard++ > 40) break; let empty = false; const t = tok(m[1], () => { empty = true; }); s = s.slice(0, m.index) + (empty ? '' : t.replace(/[{}]/g, '\u0001')) + s.slice(m.index + m[0].length); }
  s = tok(s, () => {}).replace(/\u0001/g, '').replace(/\[\[|\]\]/g, '').replace(/\s+$/, '');
  return s.trim() ? s : null;
}
export function aocFill(tpl, vars) {
  return String(tpl == null ? '' : tpl).replace(/\r/g, '').split('\n').map((l) => (l.trim() ? fillLine(l, vars || {}) : '')).filter((l) => l !== null).join('\n');
}

let MEM = null;
/* the templates in use: the defaults with what staff saved over them */
export async function aocTpl(env, fresh) {
  if (!fresh && MEM && Date.now() - MEM.t < 60_000) return MEM.v;
  const raw = env && env.STORE ? await env.STORE.get(KEY, 'json').catch(() => null) : null, m = (raw && raw.m) || {}, v = {};
  for (const K of AOC_KINDS) { v[K.k] = { ...K.def }; const s = m[K.k]; if (s && typeof s === 'object') for (const [f] of K.fields) if (typeof s[f] === 'string' && s[f].trim()) v[K.k][f] = s[f]; }
  MEM = { v, t: Date.now() }; return v;
}
/* { title, body } of one message. opt: { none } no gate could be given, { chg } staff changed it */
export function aocMsg(T, kind, vars, opt) {
  const t = (T && T[kind]) || KIND[kind].def, o = opt || {};
  return { title: aocFill(o.chg ? t.titleChg || t.title : t.title, vars).replace(/\s+/g, ' ').trim().slice(0, 60) || KIND[kind].def.title, body: aocFill(o.none ? t.bodyNone || t.body : t.body, vars) };
}
/* the SIGMET message: its first line, a block for each SIGMET, the last lines */
export function aocSigMsg(T, vars, items) {
  const t = (T && T.sig) || KIND.sig.def;
  const body = [aocFill(t.body, vars)].concat(items.map((it) => aocFill(t.item, { ...vars, ...it })), [aocFill(t.foot, vars)]).join('\n');
  return { title: aocFill(t.title, vars).replace(/\s+/g, ' ').trim().slice(0, 60) || KIND.sig.def.title, body };
}

function clean(K, fields) {
  const out = {};
  for (const [f, label, rows] of K.fields) {
    let s = String((fields && fields[f]) == null ? '' : fields[f]).replace(/\r/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
    if (rows === 1) s = s.replace(/\s+/g, ' ').trim();
    if (s.length > LEN[rows]) throw Object.assign(new Error(label + ' is too long (' + LEN[rows] + ' characters at most)'), { status: 400 });
    if (!s.trim()) throw Object.assign(new Error(label + ' is empty'), { status: 400 });
    const bad = (s.match(/\{([^}]*)\}/g) || []).map((x) => x.slice(1, -1)).find((x) => !K.tokens.some((t) => t[0] === x.replace(/:\d{1,2}$/, '')));
    if (bad != null) throw Object.assign(new Error(label + ': {' + bad.slice(0, 24) + '} is not a field of this message'), { status: 400 });
    if ((s.match(/\[\[/g) || []).length !== (s.match(/\]\]/g) || []).length) throw Object.assign(new Error(label + ': a [[ has no ]] to close it'), { status: 400 });
    out[f] = s;
  }
  return out;
}
const preview = (K, t) => (K.k === 'sig' ? aocSigMsg({ sig: t }, K.sample, [K.sample]) : aocMsg({ [K.k]: t }, K.k, K.sample));

export async function aocTplAdmin(req, path, env, who) {
  const kv = env && env.STORE; if (!kv) return jsonRes({ error: 'Storage is not set up' }, 503);
  try {
    if (req.method === 'GET' && path === '/admin/api/aoctpl') {
      const raw = (await kv.get(KEY, 'json').catch(() => null)) || {}, tpl = await aocTpl(env, true);
      const titles = Object.fromEntries(AOC_KINDS.map((K) => [K.k, [...new Set([tpl[K.k].title, tpl[K.k].titleChg, K.def.title, K.def.titleChg].filter(Boolean).map((x) => String(x).toUpperCase()))]]));
      let last = {}; try { last = await aocAutoLast(env, titles); } catch (e) { last = {}; }
      return jsonRes({ kinds: AOC_KINDS.map((K) => ({ k: K.k, name: K.name, when: K.when, fields: K.fields, tokens: K.tokens, def: K.def, changed: !!(raw.m && raw.m[K.k]), preview: preview(K, tpl[K.k]) })), tpl, at: raw.at || 0, by: raw.by || '', last });
    }
    if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405);
    if (!/application\/json/.test(req.headers.get('Content-Type') || '')) return jsonRes({ error: 'Send JSON' }, 415);
    let b = {}; try { b = await req.json(); } catch (e) {}
    const K = KIND[String(b.kind || '')]; if (!K) return jsonRes({ error: 'No such message' }, 400);
    if (path === '/admin/api/aoctpl/preview') return jsonRes(preview(K, clean(K, b.fields)));
    if (path !== '/admin/api/aoctpl') return jsonRes({ error: 'Not found' }, 404);
    const raw = (await kv.get(KEY, 'json').catch(() => null)) || {}; raw.m = raw.m && typeof raw.m === 'object' ? raw.m : {};
    if (b.reset) delete raw.m[K.k]; else raw.m[K.k] = clean(K, b.fields);
    raw.at = Date.now(); raw.by = String(typeof who === 'string' ? who : (who && who.email) || '').slice(0, 120);
    await kv.put(KEY, JSON.stringify(raw)); MEM = null;
    const tpl = await aocTpl(env, true);
    return jsonRes({ ok: true, kind: K.k, fields: tpl[K.k], changed: !b.reset, preview: preview(K, tpl[K.k]) });
  } catch (e) { return jsonRes({ error: e.message || 'Error' }, e.status || 500); }
}
