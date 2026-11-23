/* ---------- The arrival report: an automatic AOC to the crew at the gate ----------
   As an airline's ACARS sends an IN report when the aircraft reaches the gate, the Worker sends the crew a summary of
   the flight as soon as the OOOI watch (ooo.js) writes its IN time, domestic or international: the four OOOI times,
   block and air time, taxi-in, the arrival against the schedule (on time within 15 minutes, as the industry counts
   it), the gate AOC gave it and the arrival airport's latest METAR. It comes as an AOC message in Messages, with a push
   to the crew's devices, so it arrives even when the EFB was closed on landing. Once per flight (the OOOI record
   leaves the watch list when it is written). Staff turn it off and change its wording on /admin (Settings › Automatic
   AOC messages; Gates › message wording). */
import { aocSend } from './aoc.js';
import { aocTpl, aocMsg } from './aoctpl.js';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const z = (t) => { if (!t) return ''; const d = new Date(t); return String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + 'Z'; };
const hm = (ms) => { if (!(ms > 0)) return ''; const m = Math.round(ms / 60_000); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
const mins = (a, b) => (a && b && b > a ? String(Math.round((b - a) / 60_000)) : '');
/* ON TIME within 15 minutes of STA, else so many minutes late or early */
export function onTime(inT, sta) {
  if (!inT || !sta) return '';
  const d = Math.round((inT - sta) / 60_000);
  if (Math.abs(d) <= 15) return d === 0 ? 'ON TIME' : 'ON TIME (' + (d > 0 ? '+' : '') + d + ' MIN)';
  return Math.abs(d) + ' MIN ' + (d > 0 ? 'LATE' : 'EARLY');
}
/* the values of an OOOI record r = { cs, dep, arr, out, off, on, in, sta } (off === 0: first seen in the air) */
export function inVars(r, extra) {
  const e = extra || {}, inT = r.in || 0, out = r.out || 0, off = r.off || 0, on = r.on || 0, d = new Date(inT || Date.now());
  return {
    CALLSIGN: r.cs || '', DEP: r.dep || '', ARR: r.arr || '',
    DATE: String(d.getUTCDate()).padStart(2, '0') + MON[d.getUTCMonth()],
    OUT: z(out), OFF: z(off), ON: z(on), IN: z(inT),
    BLOCK: out && inT ? hm(inT - out) : '', AIR: off && on ? hm(on - off) : '',
    TAXIOUT: mins(out, off), TAXIIN: mins(on, inT),
    STA: z(r.sta), ONTIME: onTime(inT, r.sta),
    GATE: e.gate || '', TERMINAL: e.term || '', METAR: String(e.metar || '').replace(/\s+/g, ' ').trim().slice(0, 200),
  };
}
const crewOf = (r) => ({ crew: 1, cs: r.cs, m: r.pilot || r.cid ? [{ pilot: r.pilot || '', cid: r.cid ? String(r.cid) : '', name: r.name && r.name !== r.pilot ? r.name : '' }] : [] });

/* the arrival airport's latest METAR (raw text), or '' */
export async function latestMetar(icao) {
  if (!/^[A-Z0-9]{4}$/.test(icao || '')) return '';
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch('https://aviationweather.gov/api/data/metar?ids=' + icao + '&format=json', { signal: ctl.signal, headers: { 'User-Agent': 'PolarisEFB/1.0 (virtual airline EFB)', Accept: 'application/json' } });
    clearTimeout(t); if (!r.ok) return '';
    const j = await r.json(); const m = Array.isArray(j) ? j[0] : null;
    return (m && (m.rawOb || m.raw_text)) || '';
  } catch (e) { return ''; }
}

/* send one report. deps = { gate(cs, arr) -> { stand, term } | null, metar(icao) -> raw } */
export async function inReport(env, r, deps) {
  if (!r || !r.cs || !r.arr || !r.on || !r.in) return null;
  const d = deps || {};
  const [g, metar, T] = await Promise.all([
    d.gate ? Promise.resolve(d.gate(r.cs, r.arr)).catch(() => null) : null,
    (d.metar || latestMetar)(r.arr).catch(() => ''),
    aocTpl(env).catch(() => null),
  ]);
  const vars = inVars(r, { gate: g && g.stand, term: g && g.term, metar });
  return aocSend(env, { ...aocMsg(T, 'inr', vars), to: crewOf(r), push: true, by: 'AUTO' });
}
