import fs from 'node:fs';
const want = fs.existsSync('probe/ea.txt') ? fs.readFileSync('probe/ea.txt', 'utf8').split(/\s+/).filter(Boolean) : [];
if (!want.length) process.exit(0);
const { eaChartsList, eaChartPdf, eaFixes } = await import('../mainsrc/workers/polaris-efb-api/src/eaip.js'.replace('mainsrc', process.env.EA_SRC || '.'));
const mem = new Map(), memo = async (k, fn, ok) => { if (mem.has(k)) return mem.get(k); const v = await fn(); if (!ok || ok(v)) mem.set(k, v); return v; };
const d = { edgeCache: (k, ttl, fn, ok) => memo(k, fn, ok), cached: (k, ttl, fn, ok) => memo('c' + k, fn, ok), kvStore: (k, ttl, fn, ok) => memo('kv' + k, fn, ok), waitUntil: null };
const out = {};
for (const w of want) {
  const [icao, pdfs] = w.split(':');
  try {
    const l = await eaChartsList(icao, {}, { u: 'probe' }, d);
    const res = { cycle: l.cycle, eff: l.eff, next: l.next, aip: l.aip, name: l.airport && l.airport.name, notFound: l.notFound, n: (l.charts || []).length, charts: (l.charts || []).map((c) => `${c.group} | ${c.name} | ${c.pdf}`) };
    for (const i of String(pdfs || '1').split(',').map(Number)) {
      const c = l.charts && l.charts[i - 1]; if (!c) continue;
      const r = await eaChartPdf(new URL('https://x/?cycle=' + l.cycle + '&file=' + encodeURIComponent(c.pdf)), {}, {}, { u: 'probe' }, d);
      const b = new Uint8Array(await r.arrayBuffer());
      (res.pdf ||= []).push({ i, name: c.name, status: r.status, bytes: b.length, head: new TextDecoder().decode(b.slice(0, 60)) });
    }
    try { const f = await eaFixes(icao, {}, { u: 'probe' }, d); res.fixes = { arp: f.arp, n: f.pts.length, some: f.pts.slice(0, 5) }; } catch (e) { res.fixes = 'ERR ' + e.message; }
    out[icao] = res;
  } catch (e) { out[icao] = { error: String(e.message || e), status: e.status }; }
}
fs.mkdirSync('probe/out', { recursive: true }); fs.writeFileSync('probe/out/_ea.json', JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k, v.error || `${v.cycle} n=${v.n} nf=${v.notFound} pdf=${JSON.stringify(v.pdf)} fixes=${JSON.stringify(v.fixes && v.fixes.n)}`);
