/* Builds the VATSIM ATC index for the EFB server's map layer (src/vatspy.js: atcIndex, atcPack) and, with --put,
   writes it to the Worker's KV. The Worker never builds it itself: that takes about 200 ms of CPU, and the Workers
   Free plan gives a request 10 ms. The "VATSIM ATC index" GitHub Action runs this every week and when vatspy.js changes.

     node workers/polaris-efb-api/scripts/atc-index.mjs [--out dir] [--src dir] [--put]

   --src dir  read VATSpy.dat, Boundaries.geojson and TRACONBoundaries.geojson from a folder instead of downloading
   --out dir  where the three values are written as files (default: workers/polaris-efb-api/.atc-index)
   --put      then write them to the STORE namespace (wrangler.toml) with `npx wrangler@4 kv key put --remote`:
              atc:v2:geo:<id> and atc:v2:apt:<id> first (kept 120 days), atc:v2:lk last, so the Worker never mixes
              two builds. Wrangler signs in with CLOUDFLARE_API_TOKEN, or with `npx wrangler login` on a computer.
   An index that looks incomplete (too few FIRs, outlines, airports or TRACONs) is refused, and nothing is written. */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atcBuild, atcIndex, atcPack } from '../src/vatspy.js';

const WORKER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = path.resolve(arg('--out') || path.join(WORKER, '.atc-index')), SRC = arg('--src'), PUT = process.argv.includes('--put');

const t0 = Date.now();
const full = SRC
  ? atcIndex(readFileSync(path.join(SRC, 'VATSpy.dat'), 'utf8'), JSON.parse(readFileSync(path.join(SRC, 'Boundaries.geojson'), 'utf8')), JSON.parse(readFileSync(path.join(SRC, 'TRACONBoundaries.geojson'), 'utf8')))
  : await atcBuild((u) => fetch(u, { headers: { 'User-Agent': 'PolarisEFB-atc-index/1.0' } }));
const n = full.n;
console.log(`FIR keys ${n.fir}, outlines ${n.bnd}, TRACONs ${n.tra}, airports ${n.apt} (${Date.now() - t0} ms)`);
if (!(n.fir > 500 && n.bnd > 800 && n.apt > 10000 && n.tra > 800)) { console.error('The index looks incomplete: nothing written.'); process.exit(1); }

const p = atcPack(full), kb = (s) => Math.round(Buffer.byteLength(s) / 1024) + ' KB';
mkdirSync(OUT, { recursive: true });
const file = (name, s) => { const f = path.join(OUT, name); writeFileSync(f, s); return f; };
const fLk = file('lk.json', p.lk), fGeo = file('geo.txt', p.geo), fApt = file('apt.txt', p.apt);
file('id.txt', p.id + '\n');
console.log(`build ${p.id}: lk ${kb(p.lk)}, geo ${kb(p.geo)}, apt ${kb(p.apt)} in ${OUT}`);

if (PUT) {
  const put = (key, f, ttl) => {
    console.log('writing ' + key);
    execFileSync('npx', ['--yes', 'wrangler@4', 'kv', 'key', 'put', key, '--path', f, '--binding', 'STORE', '--remote', ...(ttl ? ['--ttl', String(ttl)] : [])],
      { cwd: WORKER, stdio: 'inherit', shell: process.platform === 'win32' });
  };
  put('atc:v2:geo:' + p.id, fGeo, 120 * 86400);
  put('atc:v2:apt:' + p.id, fApt, 120 * 86400);
  put('atc:v2:lk', fLk);
  console.log('done: the EFB server uses build ' + p.id + ' within 6 hours (at once in a new isolate)');
}
