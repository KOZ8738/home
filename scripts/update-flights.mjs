// 自動更新 vatsim-history.js：
// 1. 從 VATSIM 抓最近的連線紀錄，新的連線合併成航班（同呼號、中斷不超過 60 分鐘算同一趟）
// 2. 從 SimBrief 抓最新一份飛行計畫，存進 data/simbrief.json（SimBrief 只提供最新一份）
// 3. 用呼號和時間把飛行計畫對到航班，補上起降機場、機型和註冊號
// vAMSYS 的詳細數據（軌跡、跑道剖面）沒有公開介面，不在這裡更新。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

// 會員編號和 SimBrief 編號統一寫在 site-config.json（不要在這裡另外寫一份）
const SITE = JSON.parse(readFileSync(new URL('../site-config.json', import.meta.url), 'utf8'));
const CID = SITE.vatsimCid;
const SIMBRIEF_ID = SITE.simbriefId;
const DATA_FILE = process.env.DATA_FILE || 'vatsim-history.js';
const STORE_FILE = process.env.STORE_FILE || 'data/simbrief.json';
const MERGE_GAP_MS = 60 * 60 * 1000;
const HEADER = `// VATSIM 飛行紀錄快照（CID ${CID}），資料來源：api.vatsim.net、SimBrief 飛行歷史與 vAMSYS PIREP。\n` +
    '// 同一個呼號、中斷時間不超過 60 分鐘的連線合併成一趟。由 .github/workflows/update-flights.yml 定時更新。\n';

async function getJson(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'koz8738-home-flights/1.0' } });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
}

function readData() {
    const text = readFileSync(DATA_FILE, 'utf8');
    const m = text.match(/window\.VATSIM_HISTORY = ([\s\S]*);\s*$/);
    if (!m) throw new Error('讀不到 vatsim-history.js 的資料');
    return JSON.parse(m[1]);
}

function writeData(data) {
    const body = JSON.stringify(data).replace(/\},\{"date"/g, '},\n{"date"');
    writeFileSync(DATA_FILE, `${HEADER}window.VATSIM_HISTORY = ${body};\n`);
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const ymd = (ms) => iso(ms).slice(0, 10).replace(/-/g, '/');
const taipeiHour = (ms) => new Date(ms + 8 * 3600e3).getUTCHours();
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

// ---------- SimBrief ----------
async function updateStore() {
    const store = existsSync(STORE_FILE) ? JSON.parse(readFileSync(STORE_FILE, 'utf8')) : { ofps: [] };
    try {
        const j = await getJson(`https://www.simbrief.com/api/xml.fetcher.php?userid=${SIMBRIEF_ID}&json=1`);
        const gen = Number(j.params && j.params.time_generated);
        const callsign = (j.atc && j.atc.callsign) || '';
        if (gen && callsign && !store.ofps.some((o) => o.gen === gen)) {
            store.ofps.push({
                gen, callsign,
                from: j.origin.icao_code, to: j.destination.icao_code,
                type: j.aircraft.icaocode, reg: j.aircraft.reg,
                out: Number(j.times && j.times.sched_out) || null,
                fromPos: [Number(j.origin.pos_lat), Number(j.origin.pos_long), titleCase(j.origin.name)],
                toPos: [Number(j.destination.pos_lat), Number(j.destination.pos_long), titleCase(j.destination.name)]
            });
            store.ofps.sort((a, b) => a.gen - b.gen);
            store.ofps = store.ofps.slice(-200);
            mkdirSync(STORE_FILE.replace(/[^/\\]+$/, '') || '.', { recursive: true });
            writeFileSync(STORE_FILE, JSON.stringify(store, null, 1) + '\n');
            console.log('新的 SimBrief 飛行計畫', callsign, j.origin.icao_code, j.destination.icao_code);
        }
    } catch (err) {
        console.warn('SimBrief 抓取失敗，這次略過：', err.message);
    }
    return store;
}

// 呼號相同、在連線開始前 24 小時到連線結束之間產生的飛行計畫，取最晚的一份
function findOfp(store, flight) {
    const st = Date.parse(flight.st), en = Date.parse(flight.en);
    return store.ofps
        .filter((o) => o.callsign === flight.callsign && o.gen * 1000 >= st - 24 * 3600e3 && o.gen * 1000 <= en)
        .sort((a, b) => b.gen - a.gen)[0];
}

function applyOfp(data, flight, ofp) {
    flight.from = ofp.from; flight.to = ofp.to; flight.aircraft = ofp.type; flight.registration = ofp.reg;
    data.airports = data.airports || {};
    if (!data.airports[ofp.from]) data.airports[ofp.from] = ofp.fromPos;
    if (!data.airports[ofp.to]) data.airports[ofp.to] = ofp.toPos;
}

// ---------- 主流程 ----------
const data = readData();
const store = await updateStore();
const before = JSON.stringify(data);

const res = await getJson(`https://api.vatsim.net/v2/members/${CID}/history?limit=100`);
const since = Date.parse(data.syncedThrough || '1970-01-01T00:00:00Z');
// 還在連線中（沒有結束時間）的先不算，下次再處理
const sessions = (res.items || [])
    .filter((s) => s.end && Date.parse(s.start) > since)
    .map((s) => ({ callsign: s.callsign, start: Date.parse(s.start), end: Date.parse(s.end) }))
    .sort((a, b) => a.start - b.start);

let latestEnd = since;
for (const s of sessions) {
    latestEnd = Math.max(latestEnd, s.end);
    const last = data.flights.find((f) => f.st && f.callsign === s.callsign && s.start - Date.parse(f.en) <= MERGE_GAP_MS && s.start >= Date.parse(f.st));
    const mins = Math.round((s.end - s.start) / 60000);
    if (last) {
        last.en = iso(Math.max(Date.parse(last.en), s.end));
        last.minutes += mins;
        continue;
    }
    data.flights.unshift({ date: ymd(s.start), callsign: s.callsign, minutes: mins, h: taipeiHour(s.start), st: iso(s.start), en: iso(s.end) });
}

// 還沒有航線資料的航班，嘗試用 SimBrief 的飛行計畫補上
for (const f of data.flights) {
    if (f.from || !f.st) continue;
    const ofp = findOfp(store, f);
    if (ofp) { applyOfp(data, f, ofp); console.log('對到飛行計畫', f.callsign, f.date, ofp.from, ofp.to); }
}

data.syncedThrough = iso(latestEnd);

if (JSON.stringify({ ...data, updated: 0 }) !== JSON.stringify({ ...JSON.parse(before), updated: 0 })) {
    data.updated = ymd(Date.now() + 8 * 3600e3);
    writeData(data);
    console.log('已更新', DATA_FILE);
} else {
    console.log('沒有新資料');
}
