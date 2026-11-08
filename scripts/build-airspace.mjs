// 下載 VATSpy 資料，整理成「航班」頁位置欄用的檔案：
//   data/airspace.json        VATSIM 管制區（ACC／FIR）的範圍，已簡化成約 270 KB（傳輸時壓縮後約 80 KB）
//   data/airports/XX.json     全世界機場的座標和名稱，依 ICAO 代碼前兩個字母分檔（ZG、RJ、ED……），
//                             網頁只會下載起飛和降落機場需要的那幾個
//
// 用法：
//   node scripts/build-airspace.mjs              從 GitHub 下載最新的 VATSpy 資料
//   node scripts/build-airspace.mjs --src 資料夾  改讀資料夾裡的 VATSpy.dat 和 Boundaries.geojson（離線測試用）
//
// 資料來源：https://github.com/vatsimnetwork/vatspy-data-project （VATSIM 官方社群維護）
// 中文名稱來自 scripts/place-names-zh.json；沒列在裡面的就用 VATSpy 的英文名稱。
// 沒有任何外部套件，Node 18 以上就能跑。內容沒變時不會改檔案，所以排程執行不會產生多餘的 commit。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseVatspy, buildUnits, buildAirportShards } from './airspace-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/';
const srcIdx = process.argv.indexOf('--src');
const SRC = srcIdx > 0 ? process.argv[srcIdx + 1] : null;

async function load(name) {
    if (SRC) return readFileSync(path.join(SRC, name), 'utf8');
    const res = await fetch(BASE + name, { headers: { 'User-Agent': 'koz8738-home-build-airspace' } });
    if (!res.ok) throw new Error(`下載 ${name} 失敗：HTTP ${res.status}`);
    return res.text();
}

const zh = JSON.parse(readFileSync(path.join(ROOT, 'scripts/place-names-zh.json'), 'utf8'));
const { airports: airportList, firNames } = parseVatspy(await load('VATSpy.dat'));
const geo = JSON.parse(await load('Boundaries.geojson'));

const units = buildUnits(geo, firNames, zh);
const shards = buildAirportShards(airportList, zh);
const airportCount = Object.values(shards).reduce((s, a) => s + a.length, 0);

// 資料明顯不對（下載到空檔、格式改了）就不要覆蓋原本好的檔案
if (!process.argv.includes('--no-check') && (units.length < 300 || airportCount < 10000)) {
    console.error(`資料數量不合理：管制區 ${units.length}、機場 ${airportCount}，已中止，沒有改任何檔案。`);
    process.exit(1);
}

let changed = 0;
function writeIfChanged(file, text) {
    const full = path.join(ROOT, file);
    let old = null;
    try { old = readFileSync(full, 'utf8'); } catch { /* 還沒有這個檔案 */ }
    if (old === text) return;
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
    changed++;
    console.log(`已更新 ${file}（${(text.length / 1024).toFixed(1)} KB）`);
}

// 一個項目一行，之後在 git 裡看差異比較容易
const asLines = (head, items) => head + '\n' + items.map((x) => JSON.stringify(x)).join(',\n') + '\n]}\n';

writeIfChanged('data/airspace.json', asLines('{"v":1,"units":[', units));
for (const key of Object.keys(shards).sort()) {
    writeIfChanged(`data/airports/${key}.json`, asLines('{"v":1,"airports":[', shards[key]));
}

console.log(`管制區 ${units.length} 個、機場 ${airportCount} 個（${Object.keys(shards).length} 個分檔）。` +
    (changed ? `更新了 ${changed} 個檔案。` : '沒有任何變動。'));
