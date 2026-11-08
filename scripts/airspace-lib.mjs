// 把 VATSpy（VATSIM 官方社群維護的機場和管制區邊界資料）整理成網頁用的精簡檔。
// 這個檔案只有純函式，不碰檔案也不碰網路，所以 Node 和瀏覽器都能跑，方便測試。
// 實際下載和寫檔在 scripts/build-airspace.mjs。

// ---------- 解析 VATSpy.dat ----------
export function parseVatspy(text) {
    const sections = {};
    let cur = null;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        const m = line.match(/^\[(.+)\]$/);
        if (m) { cur = m[1]; sections[cur] = []; continue; }
        if (!cur || !line || line.startsWith(';')) continue;
        sections[cur].push(line.split('|'));
    }
    // 機場：ICAO|名稱|緯度|經度|IATA/LID|所屬 FIR|是否假位置
    const airports = (sections.Airports || []).map(([icao, name, lat, lon, iata, fir, pseudo]) => ({
        icao, name, lat: Number(lat), lon: Number(lon), iata: iata || '', fir, pseudo: pseudo === '1'
    })).filter((a) => a.icao && Number.isFinite(a.lat) && Number.isFinite(a.lon));
    // 管制區名稱：以「邊界代碼」（第 4 欄）為鍵；同一個邊界有好幾行時，優先用代碼和邊界相同的那一行
    const firNames = {};
    for (const [icao, name, , boundary] of sections.FIRs || []) {
        if (!boundary || !name) continue;
        if (!firNames[boundary] || icao === boundary) firNames[boundary] = name;
    }
    return { airports, firNames };
}

// ---------- 從名稱讀出高度限制 ----------
// 例如 "Kobe ACC North (Up to FL335)"、"Tokyo ACC T25 Sector (Above FL285 / Up to FL415)"、"Ljubljana Upper (FL335+)"
export function parseVertical(name) {
    let lo = null;
    let hi = null;
    let m;
    if ((m = name.match(/Up to FL\s*(\d{2,3})/i))) hi = Number(m[1]);
    if ((m = name.match(/SFC\s*-\s*FL\s*(\d{2,3})/i))) hi = hi ?? Number(m[1]);
    if ((m = name.match(/(?:Above|From)\s+FL\s*(\d{2,3})/i))) lo = Number(m[1]);
    if ((m = name.match(/\bFL\s*(\d{2,3})\s*\+/i))) lo = lo ?? Number(m[1]);
    if ((m = name.match(/\(FL\s*(\d{2,3})\s*-\s*\)/i))) lo = lo ?? Number(m[1]);
    return { lo, hi };
}

// ---------- 簡化多邊形（Douglas-Peucker）----------
function simplify(points, tol) {
    const n = points.length;
    if (n <= 4) return points.slice();
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    const tol2 = tol * tol;
    while (stack.length) {
        const [a, b] = stack.pop();
        const [ax, ay] = points[a];
        const [bx, by] = points[b];
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let maxD = 0;
        let idx = -1;
        for (let i = a + 1; i < b; i++) {
            const [px, py] = points[i];
            let d2;
            if (len2 === 0) {
                d2 = (px - ax) ** 2 + (py - ay) ** 2;
            } else {
                const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
                d2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
            }
            if (d2 > maxD) { maxD = d2; idx = i; }
        }
        if (idx > 0 && maxD > tol2) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return points.filter((_, i) => keep[i]);
}

// GeoJSON 的環是 [經度, 緯度]；輸出成 [緯度*100, 經度*100, ...] 的整數（約 1 公里的精度）
function packRing(ring, tol) {
    const pts = simplify(ring.map(([lon, lat]) => [lat, lon]), tol);
    const out = [];
    for (const [lat, lon] of pts) {
        const la = Math.round(lat * 100);
        const lo = Math.round(lon * 100);
        const n = out.length;
        if (n >= 2 && out[n - 2] === la && out[n - 1] === lo) continue;   // 去掉連續重複點
        out.push(la, lo);
    }
    return out.length >= 8 ? out : null;   // 少於 4 個點就不成多邊形
}

function ringArea(flat) {   // 平方度（只用來比大小）
    let s = 0;
    const n = flat.length / 2;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        s += flat[2 * i + 1] * flat[2 * j] - flat[2 * j + 1] * flat[2 * i];
    }
    return Math.abs(s) / 2 / 10000;
}

// ---------- 名稱 ----------
const isMainlandChina = (id) => /^Z[BGHJLPSUWY]/.test(id);

// base：邊界代碼去掉「-」後面的分區（ZSSS-SHE → ZSSS）；rawName 例如 "Beijing ACC - Beijing FIR - Beijing"
export function labelFor(base, rawName, oceanicFlag, zh) {
    const segs = rawName.split(' - ');
    const cityEn = segs[segs.length - 1].replace(/\s*\(.*$/, '').replace(/\s+\d[\d.*() ]*$/, '').trim();
    const oceanic = oceanicFlag || /Oceanic/i.test(rawName);
    const plain = cityEn.replace(/\s+Oceanic$/i, '');   // "Tokyo Oceanic" → "Tokyo"，查表時用不含 Oceanic 的名稱
    const city = (zh.firs && zh.firs[base]) || (zh.cities && zh.cities[plain]);
    if (city) {
        if (oceanic) return city + '洋區管制';
        return city + (isMainlandChina(base) ? '區調' : '管制區');
    }
    return /Oceanic|Control|Radar|Radio/i.test(cityEn) ? cityEn : cityEn + ' Control';
}

// ---------- 管制區 ----------
// 輸出每個管制單位：{ id, n 顯示名稱, lo/hi 高度限制(FL), a 面積, bb [最小緯,最小經,最大緯,最大經]×100, p 多邊形們 }
export function buildUnits(geo, firNames, zh, tolerance = 0.03) {
    const features = geo.features || [];
    const baseIds = new Set(features.map((f) => f.properties.id.split('-')[0]));
    const units = [];
    for (const f of features) {
        const id = f.properties.id;
        const base = id.split('-')[0];
        const name = firNames[id] || firNames[base] || '';
        const { lo, hi } = parseVertical(name);
        // 純地理的分區（沒有高度限制，母單位已經涵蓋同一個範圍和名稱）不用另外存
        if (id !== base && lo == null && hi == null && baseIds.has(base)) continue;

        const polys = [];
        let area = 0;
        let minLat = 1e9, minLon = 1e9, maxLat = -1e9, maxLon = -1e9;
        const coords = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        for (const poly of coords) {
            const rings = poly.map((r) => packRing(r, tolerance)).filter(Boolean);
            if (!rings.length) continue;
            area += ringArea(rings[0]) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0);
            for (let i = 0; i < rings[0].length; i += 2) {
                minLat = Math.min(minLat, rings[0][i]); maxLat = Math.max(maxLat, rings[0][i]);
                minLon = Math.min(minLon, rings[0][i + 1]); maxLon = Math.max(maxLon, rings[0][i + 1]);
            }
            polys.push(rings);
        }
        if (!polys.length) continue;
        const parentName = firNames[base] || name;
        const unit = {
            id,
            n: labelFor(base, parentName, f.properties.oceanic === '1', zh),
            a: Math.round(area * 100) / 100,
            bb: [minLat, minLon, maxLat, maxLon],
            p: polys
        };
        if (lo != null) unit.lo = lo;
        if (hi != null) unit.hi = hi;
        units.push(unit);
    }
    return units;
}

// ---------- 機場 ----------
// 全部有 4 個英文字母代碼的機場（扣掉 VATSpy 的「假機場」），依代碼前兩個字母分成很多小檔，
// 網頁只下載起飛和降落機場需要的那幾個。輸出 { "ZG": [[ICAO, 緯度, 經度, 名稱], ...], ... }
export function buildAirportShards(list, zh) {
    const shards = {};
    for (const a of list) {
        if (a.pseudo || !/^[A-Z]{4}$/.test(a.icao)) continue;
        const name = (zh.airports && zh.airports[a.icao]) || a.name;
        (shards[a.icao.slice(0, 2)] ||= []).push([a.icao, Math.round(a.lat * 1000) / 1000, Math.round(a.lon * 1000) / 1000, name]);
    }
    for (const k in shards) shards[k].sort((x, y) => (x[0] < y[0] ? -1 : 1));
    return shards;
}
