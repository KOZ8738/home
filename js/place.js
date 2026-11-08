// 「航班」頁位置欄：把座標變成「在哪個機場」或「在哪個管制區」。
//
//   在起飛或降落機場（3 海浬內、地速低）                  → 機場名稱，例如「長沙黃花機場」
//   在起飛或降落機場附近的空中（40 海浬內、14,000 呎以下）→ 進近，例如「浦東進近」
//   其他時候                                              → 所在的管制區，例如「北京區調」「福岡管制區」
//
// 資料是 data/airspace.json 和 data/airports/XX.json（由 scripts/build-airspace.mjs 從 VATSpy 整理出來）。
// 注意：進近範圍是用距離和高度估的，不是真正的終端區邊界；管制區是 VATSIM 的管制範圍，和真實的飛航情報區大致相同。
(function (root) {
    'use strict';

    const GROUND_NM = 3;          // 離起降機場多近算「在機場」
    const GROUND_KT = 80;         // 地速低於這個才算在地面（降落滑跑、滑行、起飛前）
    const OTHER_FIELD_NM = 2;     // 同一個分檔裡的其他機場，範圍收小一點
    const OTHER_FIELD_KT = 60;
    const APPROACH_NM = 40;       // 進近範圍半徑
    const APPROACH_FT = 14000;    // 進近範圍高度上限（海平面高度）
    const WRAP = 36000;           // 經度 ×100 的一圈，處理跨越國際換日線的區域
    const RETRY_MS = 60000;       // 下載失敗後，隔多久才再試

    const rad = Math.PI / 180;
    function distNm(lat1, lon1, lat2, lon2) {
        const dLat = (lat2 - lat1) * rad;
        const dLon = (lon2 - lon1) * rad;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
        return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    // flat = [緯度×100, 經度×100, ...]；射線法判斷點在不在多邊形裡
    function inRing(flat, la, lo) {
        let inside = false;
        const n = flat.length;
        for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
            const yi = flat[i], xi = flat[i + 1], yj = flat[j], xj = flat[j + 1];
            if ((yi > la) !== (yj > la) && lo < ((xj - xi) * (la - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }

    function inUnit(u, la, lo) {
        const bb = u.bb;
        if (la < bb[0] || la > bb[2] || lo < bb[1] || lo > bb[3]) return false;
        for (const poly of u.p) {
            if (!inRing(poly[0], la, lo)) continue;
            let hole = false;
            for (let i = 1; i < poly.length; i++) if (inRing(poly[i], la, lo)) { hole = true; break; }
            if (!hole) return true;
        }
        return false;
    }

    function pick(units, la, lo, fl, useVertical) {
        let best = null;
        for (const u of units) {
            if (useVertical) {
                if (u.lo != null && fl < u.lo) continue;
                if (u.hi != null && fl > u.hi) continue;
            }
            if (best && u.a >= best.a) continue;   // 面積小的優先：分區比整個管制區更精確
            if (inUnit(u, la, lo) || inUnit(u, la, lo + WRAP) || inUnit(u, la, lo - WRAP)) best = u;
        }
        return best;
    }

    // 找出座標在哪個管制單位裡。有高度限制的分區（例如「到 FL335」）會看高度；都對不上就不看高度再找一次。
    function findUnit(units, lat, lon, altFt) {
        const la = lat * 100, lo = lon * 100, fl = (altFt || 0) / 100;
        return pick(units, la, lo, fl, true) || pick(units, la, lo, fl, false);
    }

    // VATSIM 資料裡的 altitude 是用當地 QNH 修正過的海平面高度；飛行高度層（FL）用的是標準氣壓 1013.25 hPa 算出來的
    // 氣壓高度。兩者差 (QNH − 1013.25) 約 27 呎／hPa，例如 QNH 1029、海平面高度 34,574 呎 → 氣壓高度 34,144 呎 = FL341。
    // 資料裡沒有 QNH 就回傳 null。
    function pressureAltitude(p) {
        const alt = Number(p && p.altitude);
        if (!Number.isFinite(alt)) return null;
        let q = Number(p.qnh_i_hg) * 33.8639;   // inHg → hPa（小數兩位，比整數的 qnh_mb 準）
        if (!(q > 850 && q < 1100)) q = Number(p.qnh_mb);
        if (!(q > 850 && q < 1100)) return null;
        return alt + 145366.45 * (1 - Math.pow(q / 1013.25, 0.190284));
    }

    const hasCjk = (s) => /[㐀-鿿]/.test(s);
    // 中文表裡用「·」隔開城市和機場（上海·浦東）：機場名稱把它換成看不見的換行點（手機上窄的時候會在這裡換行，
    // 變成「上海／浦東機場」，而不是從詞中間斷開），進近只留後半（浦東進近）
    function airportLabel(name) {
        return hasCjk(name) ? name.replace('·', '​') + '機場' : name;
    }
    function approachLabel(name) {
        if (hasCjk(name)) return name.split('·').pop() + '進近';
        // 英文：「Tokyo-Narita Intl」→「Narita Approach」
        return name.replace(/^[^-\s]+-(?=\S)/, '').replace(/\s+(Intl|International|Airport|Arpt|Apt)\b.*$/i, '') + ' Approach';
    }

    // p 是 VATSIM 的飛行員資料；data = { airports: {ICAO: [緯度, 經度, 名稱]}, units: [...] }
    // 回傳 { kind: 'airport' | 'approach' | 'acc', text, icao? }，什麼都對不上就回傳 null
    function describe(p, data) {
        if (!p || !data) return null;
        const lat = Number(p.latitude), lon = Number(p.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const alt = Number(p.altitude) || 0;
        const gs = Number(p.groundspeed) || 0;
        const airports = data.airports || {};
        const fp = p.flight_plan || {};
        const ends = [];
        for (const code of [fp.departure, fp.arrival]) {
            const icao = String(code || '').toUpperCase();
            if (airports[icao] && !ends.some((e) => e.icao === icao)) {
                const a = airports[icao];
                ends.push({ icao, name: a[2], d: distNm(lat, lon, a[0], a[1]) });
            }
        }

        // 1. 在機場
        const here = ends.filter((e) => e.d <= GROUND_NM && gs <= GROUND_KT).sort((a, b) => a.d - b.d)[0];
        if (here) return { kind: 'airport', text: airportLabel(here.name), icao: here.icao };
        let near = null;
        for (const icao in airports) {
            const a = airports[icao];
            if (Math.abs(a[0] - lat) > 0.1) continue;   // 先用緯度粗略篩掉，省掉大部分的距離計算
            const d = distNm(lat, lon, a[0], a[1]);
            if (d <= OTHER_FIELD_NM && gs <= OTHER_FIELD_KT && (!near || d < near.d)) near = { icao, name: a[2], d };
        }
        if (near) return { kind: 'airport', text: airportLabel(near.name), icao: near.icao };

        // 2. 起降機場附近的空中
        if (alt <= APPROACH_FT) {
            const app = ends.filter((e) => e.d <= APPROACH_NM).sort((a, b) => a.d - b.d)[0];
            if (app) return { kind: 'approach', text: approachLabel(app.name), icao: app.icao };
        }

        // 3. 所在的管制區（管制區的高度限制是用飛行高度層算的，所以用氣壓高度）
        const pa = pressureAltitude(p);
        const unit = findUnit(data.units || [], lat, lon, pa === null ? alt : pa);
        return unit ? { kind: 'acc', text: unit.n, id: unit.id } : null;
    }

    // ---------- 載入資料（用到才下載，下載過的共用）----------
    const store = { airports: {}, units: null };
    const jobs = new Map();   // 名稱 → { promise, failedAt }

    function once(key, fn) {
        const job = jobs.get(key);
        if (job && (!job.failedAt || Date.now() - job.failedAt < RETRY_MS)) return job.promise;
        const entry = { promise: null, failedAt: 0 };
        entry.promise = fn().catch(() => { entry.failedAt = Date.now(); });   // 失敗了不丟錯誤，位置欄退回只顯示座標
        jobs.set(key, entry);
        return entry.promise;
    }

    function getJson(url) {
        return fetch(url).then((r) => {
            if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
            return r.json();
        });
    }

    function loadUnits(base) {
        return once('units', () => getJson(base + 'airspace.json').then((j) => { store.units = j.units; }));
    }

    function loadShard(prefix, base) {
        return once('airports/' + prefix, () => getJson(base + 'airports/' + prefix + '.json').then((j) => {
            for (const [icao, lat, lon, name] of j.airports) store.airports[icao] = [lat, lon, name];
        }));
    }

    // 下載需要的資料（管制區，加上起飛和降落機場所在的分檔），然後回傳 describe 的結果
    function resolve(p, base) {
        const dir = base == null ? 'data/' : base;
        const fp = (p && p.flight_plan) || {};
        const prefixes = new Set();
        for (const code of [fp.departure, fp.arrival]) {
            const c = String(code || '').toUpperCase();
            if (/^[A-Z]{4}$/.test(c)) prefixes.add(c.slice(0, 2));
        }
        return Promise.all([loadUnits(dir), ...[...prefixes].map((x) => loadShard(x, dir))])
            .then(() => describe(p, store));
    }

    // 已經下載過的機場資料：[緯度, 經度, 名稱]；還沒下載（或沒有這個機場）就是 null
    function airport(icao) {
        return store.airports[String(icao || '').toUpperCase()] || null;
    }

    const api = { describe, resolve, findUnit, distNm, airportLabel, approachLabel, pressureAltitude, airport };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PlaceLookup = api;
})(typeof window !== 'undefined' ? window : globalThis);
