/* ---------- The final loadsheet: an automatic AOC 15 minutes before departure ----------
   As an airline's load control sends the crew the final loadsheet by ACARS before departure, the EFB sends the
   Worker the weights of the plan loaded for the flight the pilot checked in to (SimBrief: planned passengers, bags,
   cargo, fuel and the weight limits), and 15 minutes before STD the crew get "LOADSHEET FINAL" as an AOC message.
   The figures are the plan's with the small changes a real departure has (a few no-shows or a standby passenger,
   a little more or less cargo), always the same for a booking and never over a limit, and the changes from the plan
   are listed so the crew can update the FMS. No centre of gravity is given: the simulator's own is the one to use.

   The weights are kept with the pilot's check-in in the crew Durable Object (crew.js, job "ls"). Staff can turn the
   message off on /admin (Auto AOC tab). */

const num = (v, lo, hi) => { const n = +v; return isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null; };
const str = (v, n) => String(v == null ? '' : v).replace(/[^\w\- ./]/g, '').trim().slice(0, n);

/* what the EFB sends, checked: weights in the plan's units (kgs or lbs) */
export function cleanWeights(w) {
  if (!w || typeof w !== 'object') return null;
  const W = 2_000_000, o = {
    units: w.units === 'lbs' ? 'lbs' : 'kgs',
    zfw: num(w.zfw, 1000, W), mzfw: num(w.mzfw, 1000, W), tow: num(w.tow, 1000, W), mtow: num(w.mtow, 1000, W), ldw: num(w.ldw, 1000, W), mlw: num(w.mlw, 1000, W), oew: num(w.oew, 500, W),
    pax: num(w.pax, 0, 1000), bags: num(w.bags, 0, 3000), paxWt: num(w.paxWt, 30, 400), bagWt: num(w.bagWt, 5, 200), cargo: num(w.cargo, 0, W), freight: num(w.freight, 0, W), payload: num(w.payload, 0, W),
    block: num(w.block, 0, W), tof: num(w.tof, 0, W), trip: num(w.trip, 0, W), taxi: num(w.taxi, 0, 50_000), seats: num(w.seats, 0, 1000),
    reg: str(w.reg, 10).toUpperCase(), type: str(w.type, 6).toUpperCase(), gen: str(w.gen, 24),
  };
  if (o.zfw == null || o.tow == null) return null;
  if (o.tof == null && o.tow != null) o.tof = o.tow - o.zfw;
  return o;
}

/* a small random generator that gives the same numbers for the same booking */
function seeded(text) {
  let h = 2166136261; for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* the final figures: { pax, dPax, load, dCargo, zfw, dZfw, tow, law, tof, trip, under, lim }. A passenger counts with
   their bags: SimBrief's passenger weight when it already includes them (about 90 kg / 200 lb or more), else that
   plus a bag. Cargo moves by up to about 2% of the freight. */
export function finalFigures(ci, w) {
  const rnd = seeded((ci.bookingId || '') + ':' + (ci.std || '') + ':' + (w.gen || ''));
  const lb = w.units === 'lbs', pw = w.paxWt || (lb ? 220 : 100), perPax = pw >= (lb ? 200 : 90) ? pw : pw + (lb ? 45 : 20), round = lb ? 20 : 10;
  const payload = w.payload != null ? w.payload : w.oew != null ? w.zfw - w.oew : null;
  const freight = w.freight != null ? w.freight : payload != null && w.pax != null ? Math.max(0, payload - w.pax * perPax) : 0;
  /* passengers: up to three no-shows, sometimes one standby */
  let dPax = 0;
  if (w.pax > 0) { dPax = -Math.floor(rnd() * 4) + (rnd() < 0.3 ? 1 : 0); if (w.seats && w.pax + dPax > w.seats) dPax = w.seats - w.pax; if (w.pax + dPax < 0) dPax = -w.pax; }
  let dCargo = freight > 0 ? Math.round(((rnd() * 4 - 2) / 100) * freight / round) * round : 0;
  /* never over a limit: take cargo off first, then passengers */
  const room = Math.min(w.mzfw != null ? w.mzfw - w.zfw : Infinity, w.mtow != null ? w.mtow - w.tow : Infinity, w.mlw != null && w.ldw != null ? w.mlw - w.ldw : Infinity);
  const dw = () => Math.round(dPax * perPax) + dCargo;
  if (dw() > room) dCargo = Math.max(-freight, dCargo - Math.ceil((dw() - Math.max(room, 0)) / round) * round);
  while (dw() > Math.max(room, 0) && dPax > -(w.pax || 0)) dPax--;
  const dW = dw(), zfw = w.zfw + dW, tof = w.tof != null ? w.tof : w.tow - w.zfw, tow = zfw + tof, trip = w.trip != null ? w.trip : w.ldw != null ? w.tow - w.ldw : 0, law = tow - trip;
  const lim = [['ZFW', w.mzfw != null ? w.mzfw - zfw : Infinity], ['TOW', w.mtow != null ? w.mtow - tow : Infinity], ['LAW', w.mlw != null ? w.mlw - law : Infinity]].sort((x, y) => x[1] - y[1])[0];
  return { pax: w.pax != null ? w.pax + dPax : null, dPax, load: payload != null ? payload + dW : null, dCargo, zfw, dZfw: dW, tow, law, tof, trip, under: isFinite(lim[1]) ? lim[1] : null, lim: isFinite(lim[1]) ? lim[0] : '' };
}

const pad = (v, n) => String(v).padStart(n);
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v).toLocaleString('en-US');
/* the message: { title, body } */
export function loadsheetMsg(ci, w, now = Date.now()) {
  const F = finalFigures(ci, w), U = w.units === 'lbs' ? 'LB' : 'KG', d = new Date(now);
  const dd = String(d.getUTCDate()).padStart(2, '0') + ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()];
  const hm = String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + 'Z';
  const fl = String(ci.callsign || ci.flight || '').replace(/\s+/g, '').toUpperCase();
  const row = (k, v, max) => k.padEnd(6) + pad(Math.round(v).toLocaleString('en-US'), 9) + (max != null ? '   MAX ' + pad(Math.round(max).toLocaleString('en-US'), 9) : '');
  const L = [
    'LOADSHEET FINAL ' + hm + '  EDNO 1',
    fl + '/' + dd + '  ' + (ci.from || '----') + '-' + (ci.to || '----'),
    [w.reg || ci.registration || '', w.type || ci.type || ''].filter(Boolean).join('  ') + (ci.std ? '  STD ' + new Date(ci.std).toISOString().slice(11, 16).replace(':', '') + 'Z' : ''),
    'ALL WEIGHTS IN ' + U,
    '',
    row('ZFW', F.zfw, w.mzfw),
    row('TOF', F.tof),
    row('TOW', F.tow, w.mtow),
    row('TIF', F.trip),
    row('LAW', F.law, w.mlw),
  ];
  if (F.under != null) L.push('UNDLD ' + pad(Math.round(F.under).toLocaleString('en-US'), 9) + '   (' + F.lim + ' LIMITING)');
  L.push('');
  if (F.pax != null) L.push('PAX   ' + pad(F.pax, 9) + (w.seats ? '   OF ' + w.seats + ' SEATS' : ''));
  if (F.load != null) L.push('LOAD  ' + pad(Math.round(F.load).toLocaleString('en-US'), 9) + '   PAX, BAGS AND CARGO');
  L.push('');
  const ch = [];
  if (F.dPax) ch.push('PAX ' + sgn(F.dPax));
  if (F.dCargo) ch.push('CARGO ' + sgn(F.dCargo) + ' ' + U);
  L.push(ch.length ? 'CHANGES FROM THE OFP: ' + ch.join(', ') + ', ZFW ' + sgn(F.dZfw) + ' ' + U : 'NO CHANGES FROM THE OFP');
  L.push('UPDATE THE FMS ZFW IF IT HAS CHANGED.', 'LMC NIL', 'PREPARED BY POLARIS LOAD CONTROL');
  return { title: 'LOADSHEET FINAL', body: L.join('\n'), figures: F };
}
