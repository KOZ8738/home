// ================= 設定 =================
// 會員編號、Worker 網址等在 site-config.json 改（執行 node scripts/sync-shared.mjs 後寫進 config.js）。
// 歷史航班來自 vatsim-history.js（從 VATSIM 官方紀錄整理的快照）。
const SITE = window.SITE_CONFIG || {};
const CONFIG = {
    VATSIM_CID: SITE.vatsimCid,
    // TRAIL_URL：Cloudflare Worker 的軌跡網址（見 workers/flight-trail/README.md）。
    // 沒有設定就只用這個瀏覽器自己記錄的軌跡。
    TRAIL_URL: SITE.trailBase ? SITE.trailBase + '/trail' : '',
    // LIVE_URL：同一個 Worker 的即時資料網址，只回傳你這位飛行員（很小）。
    // 讀不到時會自動退回直接讀 VATSIM 全球資料；沒有設定就一律直接讀 VATSIM。
    LIVE_URL: SITE.trailBase ? SITE.trailBase + '/live' : '',
    POLL_ONLINE_MS: 20000,   // 在線時每 20 秒更新一次位置
    POLL_OFFLINE_MS: 60000   // 不在線時每 60 秒檢查是否上線
};

const SNAPSHOT = window.VATSIM_HISTORY || { flights: [] };
const FLIGHTS = SNAPSHOT.flights;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const $ = (id) => document.getElementById(id);
const sections = { loading: $('loadingSection'), live: $('liveSection'), history: $('historySection') };

function show(name) {
    Object.entries(sections).forEach(([key, el]) => { el.hidden = key !== name; });
}

function setStatus(state) {
    const badge = $('statusBadge');
    if (!state) { badge.hidden = true; return; }
    badge.hidden = false;
    badge.dataset.state = state;
    $('statusText').textContent = state === 'online' ? '在線' : '離線';
}

function setNotice(text) {
    const box = $('notice');
    if (!text) { box.replaceChildren(); return; }
    const p = document.createElement('p');
    p.className = 'notice body-5';
    p.setAttribute('role', 'status');
    p.textContent = text;
    box.replaceChildren(p);
}

// ---------- 歷史航班 ----------
function statTile(label, value) {
    const tile = document.createElement('div');
    tile.className = 'summary-tile';
    const l = document.createElement('p');
    l.className = 'caption-1 muted';
    l.textContent = label;
    const v = document.createElement('p');
    v.className = 'heading-5';
    v.textContent = value;
    tile.append(l, v);
    return tile;
}

function formatMinutes(total) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h ? `${h} 小時 ${m} 分` : `${m} 分`;
}

// ---------- 世界地圖：飛過的機場和航線 ----------
let worldMap = null, worldLayer = null;

// 大圓航線：沿球面插點，經度接續不跳號
function arcPoints(a, b, n = 64) {
    const rad = Math.PI / 180;
    const toVec = ([la, lo]) => [Math.cos(la * rad) * Math.cos(lo * rad), Math.cos(la * rad) * Math.sin(lo * rad), Math.sin(la * rad)];
    const v1 = toVec(a), v2 = toVec(b);
    const dot = Math.min(1, Math.max(-1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
    const om = Math.acos(dot);
    if (om < 1e-6) return [a, b];
    const out = [];
    let prevLon = a[1];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const k1 = Math.sin((1 - t) * om) / Math.sin(om), k2 = Math.sin(t * om) / Math.sin(om);
        const x = k1 * v1[0] + k2 * v2[0], y = k1 * v1[1] + k2 * v2[1], z = k1 * v1[2] + k2 * v2[2];
        let lon = Math.atan2(y, x) / rad;
        while (lon - prevLon > 180) lon -= 360;
        while (lon - prevLon < -180) lon += 360;
        prevLon = lon;
        out.push([Math.atan2(z, Math.hypot(x, y)) / rad, lon]);
    }
    return out;
}

function renderWorld(flights) {
    const card = $('worldCard');
    const AP = SNAPSHOT.airports;
    if (typeof L === 'undefined' || !AP) { card.hidden = true; return; }
    card.hidden = false;
    if (!worldMap) {
        worldMap = L.map('worldMap', {
            scrollWheelZoom: true, worldCopyJump: true, minZoom: 2, maxZoom: 9,
            zoomAnimation: !reduced.matches, fadeAnimation: !reduced.matches
        });
        worldMap.attributionControl.setPrefix(false);   // 拿掉 Leaflet 字樣和旗子，保留 Esri 資料來源
        worldMap.createPane('labels').style.zIndex = 250;
        worldMap.getPane('labels').style.pointerEvents = 'none';
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 9, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
        }).addTo(worldMap);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 9, pane: 'labels'
        }).addTo(worldMap);
        worldLayer = L.layerGroup().addTo(worldMap);
    }
    worldLayer.clearLayers();

    const airports = new Map(), routes = new Map();
    flights.forEach((f) => {
        if (!f.from || !f.to || !AP[f.from] || !AP[f.to]) return;
        [f.from, f.to].forEach((c) => airports.set(c, (airports.get(c) || 0) + 1));
        if (f.from === f.to) return;
        const key = [f.from, f.to].sort().join(' ');
        routes.set(key, (routes.get(key) || 0) + 1);
    });

    routes.forEach((n, key) => {
        const [a, b] = key.split(' ');
        L.polyline(arcPoints(AP[a], AP[b]), {
            color: '#ffffff', weight: 1.5 + Math.min(2, n * 0.25), opacity: Math.min(0.85, 0.3 + n * 0.1), interactive: false
        }).addTo(worldLayer);
    });
    airports.forEach((n, code) => {
        const dot = L.circleMarker([AP[code][0], AP[code][1]], {
            radius: 5 + Math.min(5, Math.sqrt(n)), color: '#ffffff', weight: 1.5, fillColor: '#ff9ed9', fillOpacity: 0.95
        }).addTo(worldLayer);
        dot.bindTooltip(`${code} ${AP[code][2]}，${n} 趟，點一下篩選`, { className: 'world-tip', direction: 'top' });
        dot.on('click', () => {
            $('fSearch').value = code;
            filters.q = code;
            renderHistory();
        });
    });

    $('worldStat').textContent = airports.size ? `${airports.size} 個機場，${routes.size} 條航線` : '沒有符合的航線';
    const pts = [...airports.keys()].map((c) => [AP[c][0], AP[c][1]]);
    const fit = () => {
        worldMap.invalidateSize();
        if (pts.length) worldMap.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 6, animate: false });
        else worldMap.setView([30, 110], 3);
    };
    fit();
    setTimeout(fit, 300);
}

// ---------- 篩選和搜尋 ----------
const filters = { q: '', type: '', from: '', to: '', year: '', month: '', shift: '', detail: '' };
let filtersBuilt = false;

const SHIFTS = [
    ['', '全部'], ['morning', '早班'], ['afternoon', '午班'], ['evening', '晚班']
];
const DETAILS = [['', '全部'], ['yes', '有詳細數據'], ['no', '沒有詳細數據']];

// 早班 05:00 到 12:00，午班 12:00 到 18:00，晚班 18:00 到隔天 05:00，用連線時間（台北時間）
function shiftOf(h) {
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 18) return 'afternoon';
    return 'evening';
}

function haystack(f) {
    return [f.callsign, f.from, f.to, f.aircraft, f.registration, f.v && f.v.fn, f.date]
        .filter(Boolean).join(' ').toLowerCase();
}

function matches(f) {
    if (filters.q) {
        const hay = haystack(f);
        if (!filters.q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t))) return false;
    }
    if (filters.type && f.aircraft !== filters.type) return false;
    if (filters.from && f.from !== filters.from) return false;
    if (filters.to && f.to !== filters.to) return false;
    if (filters.year && f.date.slice(0, 4) !== filters.year) return false;
    if (filters.month && String(Number(f.date.slice(5, 7))) !== filters.month) return false;
    if (filters.shift && (typeof f.h !== 'number' || shiftOf(f.h) !== filters.shift)) return false;
    if (filters.detail === 'yes' && !f.v) return false;
    if (filters.detail === 'no' && f.v) return false;
    return true;
}

function filtersActive() {
    return Object.values(filters).some(Boolean);
}

function buildFilters() {
    filtersBuilt = true;
    const count = (key) => {
        const m = new Map();
        FLIGHTS.forEach((f) => { const v = key(f); if (v) m.set(v, (m.get(v) || 0) + 1); });
        return [...m.entries()];
    };
    const sortText = (a, b) => String(a[0]).localeCompare(String(b[0]), 'en', { numeric: true });
    const specs = [
        ['type', '機型', count((f) => f.aircraft).sort(sortText).map(([v, n]) => [v, `${v}（${n}）`])],
        ['from', '起飛機場', count((f) => f.from).sort(sortText).map(([v, n]) => [v, `${v}（${n}）`])],
        ['to', '降落機場', count((f) => f.to).sort(sortText).map(([v, n]) => [v, `${v}（${n}）`])],
        ['year', '年', count((f) => f.date.slice(0, 4)).sort(sortText).map(([v, n]) => [v, `${v} 年（${n}）`])],
        ['month', '月', count((f) => String(Number(f.date.slice(5, 7)))).sort(sortText).map(([v, n]) => [v, `${v} 月（${n}）`])]
    ];
    const grid = $('filterSelects');
    specs.forEach(([key, label, opts]) => {
        const wrap = el('label', 'filter-field');
        wrap.appendChild(el('span', 'caption-1 muted', label));
        const box = el('span', 'select-wrap');
        const sel = document.createElement('select');
        sel.className = 'body-2';
        sel.dataset.key = key;
        [['', '全部'], ...opts].forEach(([v, t]) => {
            const o = document.createElement('option');
            o.value = v; o.textContent = t;
            sel.appendChild(o);
        });
        sel.addEventListener('change', () => { filters[key] = sel.value; renderHistory(); });
        const caret = el('i', 'ph ph-caret-down');
        caret.setAttribute('aria-hidden', 'true');
        box.append(sel, caret);
        wrap.appendChild(box);
        grid.appendChild(wrap);
    });

    const segs = $('filterSegs');
    [
        ['shift', '早晚班', SHIFTS, '早班 05:00 到 12:00，午班 12:00 到 18:00，晚班 18:00 到隔天 05:00，以連線時間計算，台北時間。'],
        ['detail', '詳細數據', DETAILS, '']
    ].forEach(([key, label, opts, hint]) => {
        const set = el('fieldset', 'filter-seg');
        set.appendChild(el('legend', 'caption-1 muted', label));
        const row = el('div', 'seg-row');
        opts.forEach(([v, t], i) => {
            const lab = el('label', 'seg-opt');
            const input = document.createElement('input');
            input.type = 'radio'; input.name = key; input.value = v; input.checked = i === 0;
            input.addEventListener('change', () => { filters[key] = v; renderHistory(); });
            lab.append(input, el('span', 'chip caption-1', t));
            row.appendChild(lab);
        });
        set.appendChild(row);
        if (hint) set.appendChild(el('p', 'caption-2 muted', hint));
        segs.appendChild(set);
    });

    let timer = null;
    $('fSearch').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => { filters.q = e.target.value.trim(); renderHistory(); }, 150);
    });
    $('filterBar').addEventListener('submit', (e) => e.preventDefault());
    $('filterClear').addEventListener('click', clearFilters);
    $('filterBar').hidden = false;
}

function clearFilters() {
    Object.keys(filters).forEach((k) => { filters[k] = ''; });
    $('fSearch').value = '';
    document.querySelectorAll('#filterSelects select').forEach((s) => { s.value = ''; });
    document.querySelectorAll('#filterSegs input').forEach((i) => { i.checked = i.value === ''; });
    renderHistory();
}

function renderHistory() {
    const summary = $('summary');
    const list = $('flightList');
    summary.replaceChildren();
    list.replaceChildren();

    if (FLIGHTS.length === 0) {
        const card = document.createElement('div');
        card.className = 'state-card';
        card.innerHTML = '<div class="state-icon"><i class="ph ph-airplane-takeoff" aria-hidden="true"></i></div>' +
            '<h2 class="heading-6">還沒有航班紀錄</h2>' +
            '<p class="body-3">飛過的航班會整理在這裡。連線飛行時，這一頁會改成顯示即時位置。</p>';
        list.appendChild(card);
        return;
    }

    if (!filtersBuilt) buildFilters();

    const flights = FLIGHTS.filter(matches).sort((a, b) => {
        const da = Date.parse(a.date.replace(/\//g, '-'));
        const db = Date.parse(b.date.replace(/\//g, '-'));
        return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
    });
    const totalMinutes = flights.reduce((sum, f) => sum + (Number(f.minutes) || 0), 0);

    summary.append(
        statTile('航班數', `${flights.length} 趟`),
        statTile('累計飛行時間', formatMinutes(totalMinutes)),
        statTile('最近一趟', flights.length ? flights[0].date : '沒有'),
        statTile('有詳細數據', `${flights.filter((f) => f.v).length} 趟`)
    );

    try { renderWorld(flights); } catch (err) { $('worldCard').hidden = true; }

    const active = filtersActive();
    $('filterClear').disabled = !active;
    const hint = (filters.type || filters.from || filters.to) ? '，沒有航線資料的舊航班不會顯示' : '';
    $('filterCount').textContent = active ? `符合的航班 ${flights.length} 趟${hint}` : '';

    if (flights.length === 0) {
        const card = document.createElement('div');
        card.className = 'state-card';
        card.innerHTML = '<div class="state-icon"><i class="ph ph-magnifying-glass" aria-hidden="true"></i></div>' +
            '<h2 class="heading-6">沒有符合的航班</h2>' +
            '<p class="body-3">換個關鍵字或條件試試，或清除篩選看全部航班。</p>';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-on-light button-sm';
        btn.textContent = '清除篩選';
        btn.addEventListener('click', clearFilters);
        card.appendChild(btn);
        list.appendChild(card);
    }

    flights.forEach((f) => {
        const card = document.createElement('article');
        card.className = 'flight-card';

        const date = document.createElement('p');
        date.className = 'caption-1 muted';
        date.textContent = f.date;

        const route = document.createElement('h2');
        route.className = 'heading-6 flight-route';
        const from = document.createElement('span');
        from.textContent = f.from;
        const arrow = document.createElement('i');
        arrow.className = 'ph ph-airplane-in-flight';
        arrow.setAttribute('aria-label', '飛往');
        const to = document.createElement('span');
        to.textContent = f.to;
        let callsign = null;
        if (f.from && f.to) {
            route.append(from, arrow, to);
            callsign = document.createElement('p');
            callsign.className = 'heading-4 flight-callsign';
            callsign.textContent = f.callsign;
        } else {
            route.className = 'heading-4 flight-route';
            route.textContent = f.callsign;
        }

        const chips = document.createElement('div');
        chips.className = 'chip-row';
        [f.aircraft, f.registration, f.minutes ? formatMinutes(Number(f.minutes)) : null]
            .filter(Boolean)
            .forEach((text) => {
                const chip = document.createElement('span');
                chip.className = 'chip caption-1';
                chip.textContent = text;
                chips.appendChild(chip);
            });

        card.append(date);
        if (callsign) card.append(callsign);
        card.append(route, chips);

        if (f.v) {
            card.classList.add('has-detail');
            const badge = document.createElement('span');
            badge.className = 'chip chip-detail caption-1';
            badge.innerHTML = '<i class="ph ph-chart-line-up" aria-hidden="true"></i>';
            badge.append('vAMSYS 詳細數據');
            chips.prepend(badge);

            const open = document.createElement('button');
            open.type = 'button';
            open.className = 'detail-link button-sm';
            open.innerHTML = '<span></span><i class="ph ph-arrow-right" aria-hidden="true"></i>';
            open.firstChild.textContent = '查看詳細數據';
            open.setAttribute('aria-label', `查看 ${f.callsign} ${f.date} 的詳細數據`);
            open.addEventListener('click', () => openDetail(f, open));
            card.appendChild(open);
        }

        list.appendChild(card);
    });

    if (SNAPSHOT.updated) {
        const note = document.createElement('p');
        note.className = 'caption-1 muted';
        note.textContent = `連線紀錄來自 VATSIM，航線、機型和註冊號對照 vAMSYS 和 SimBrief，標有「vAMSYS 詳細數據」的航班可以點開查看軌跡和數據，整理於 ${SNAPSHOT.updated}。8 月 28 日之前的航班沒有可對照的紀錄。`;
        list.appendChild(note);
    }
}

// ---------- 航班詳細數據視窗 ----------
const modal = $('flightModal');
const fmCard = $('fmCard');
let lastOpener = null;
let trackJob = null;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

const ft = (n) => Math.round(n).toLocaleString('en-US');

// 標準值檢查：回傳 {std, bad}，bad 為 true 時磚塊用紅框標示
let flagCount = 0;
const num = (str) => {
    const m = String(str || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
};
function chk(value, { min, max }, std) {
    const n = num(value);
    if (n === null) return null;
    const bad = (min !== undefined && n < min) || (max !== undefined && n > max);
    if (bad) flagCount++;
    return { std, bad };
}

function fmSection(title, rows) {
    const items = rows.filter((r) => r[1]);
    if (!items.length) return null;
    const box = el('section', 'fm-section');
    box.appendChild(el('h3', 'title-3', title));
    const grid = el('div', 'fm-grid');
    items.forEach(([label, value, check]) => {
        const tile = el('div', 'fm-tile' + (check && check.bad ? ' bad' : ''));
        tile.append(el('p', 'caption-1 muted', label), el('p', 'title-3', value));
        if (check && check.std) {
            tile.appendChild(el('p', 'caption-1 ' + (check.bad ? 'fm-flag' : 'muted'), (check.bad ? '不符合標準，' : '標準 ') + (check.bad ? '應為 ' : '') + check.std));
        }
        grid.appendChild(tile);
    });
    box.appendChild(grid);
    return box;
}

// 軌跡資料：每個點是和上一點的差值，用 36 進位存，順序為緯度、經度、高度
function decodeTrack(str) {
    let prev = [0, 0, 0];
    return str.split(';').map((seg) => {
        const d = seg.split(',').map((x) => parseInt(x, 36));
        prev = prev.map((v, i) => v + d[i]);
        return { lat: prev[0] / 1000, lon: prev[1] / 1000, alt: prev[2] * 100 };
    });
}

function distNm(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 取一個好看的刻度間距，讓刻度數不超過 max
function niceStep(range, candidates, maxTicks) {
    return candidates.find((c) => range / c <= maxTicks) || candidates[candidates.length - 1];
}

function profileSvg(pts, from, to) {
    const W = 600, H = 272, padL = 76, padR = 24, padT = 36, padB = 52;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distNm(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1] || 1;
    const peak = Math.max(...pts.map((p) => p.alt));
    const yStep = niceStep(Math.max(peak, 1000), [1000, 2000, 5000, 10000], 7);
    const maxAlt = Math.max(yStep, Math.ceil((peak * 1.08) / yStep) * yStep);
    const xStep = niceStep(total, [5, 10, 20, 25, 50, 100, 200, 250, 500], 8);
    const pw = W - padL - padR, ph = H - padT - padB;
    const x = (d) => padL + (d / total) * pw;
    const y = (a) => padT + (1 - Math.max(0, a) / maxAlt) * ph;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'fm-profile');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `高度剖面圖，${from} 到 ${to}，最高 ${ft(peak)} 呎，航程約 ${Math.round(total)} 海浬`);
    const add = (tag, attrs, text, parent) => {
        const n = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
        if (text !== undefined) n.textContent = text;
        (parent || svg).appendChild(n);
        return n;
    };
    // 橫線：高度
    for (let a = 0; a <= maxAlt; a += yStep) {
        const gy = y(a);
        add('line', { x1: padL, x2: W - padR, y1: gy.toFixed(1), y2: gy.toFixed(1), class: 'fm-grid-line' });
        add('text', { x: padL - 8, y: (gy + 4).toFixed(1), 'text-anchor': 'end', class: 'fm-axis' }, ft(a));
    }
    // 直線：距離
    for (let d = 0; d <= total; d += xStep) {
        const gx = x(d);
        add('line', { x1: gx.toFixed(1), x2: gx.toFixed(1), y1: padT, y2: padT + ph, class: 'fm-grid-line' });
        add('text', { x: gx.toFixed(1), y: padT + ph + 16, 'text-anchor': 'middle', class: 'fm-axis' }, String(d));
    }
    add('text', { x: padL - 8, y: 24, 'text-anchor': 'end', class: 'fm-axis' }, '呎');
    add('text', { x: padL + pw / 2, y: H - 6, 'text-anchor': 'middle', class: 'fm-axis' }, '飛行距離（海浬）');
    add('text', { x: padL, y: H - 6, 'text-anchor': 'start', class: 'fm-axis fm-axis-strong' }, from);
    add('text', { x: W - padR + 12, y: H - 6, 'text-anchor': 'end', class: 'fm-axis fm-axis-strong' }, to);

    const line = pts.map((p, i) => `${x(cum[i]).toFixed(1)},${y(p.alt).toFixed(1)}`);
    add('polygon', { points: `${x(0).toFixed(1)},${y(0).toFixed(1)} ${line.join(' ')} ${x(total).toFixed(1)},${y(0).toFixed(1)}`, class: 'fm-profile-area' });
    add('polyline', { points: line.join(' '), class: 'fm-profile-line' });

    // 最高點
    const pi = pts.findIndex((p) => p.alt === peak);
    const px = x(cum[pi]);
    add('circle', { cx: px.toFixed(1), cy: y(peak).toFixed(1), r: 4, class: 'fm-rw-dot' });
    const pAnchor = px < padL + 70 ? 'start' : px > W - 90 ? 'end' : 'middle';
    add('text', { x: px.toFixed(1), y: (y(peak) - 9).toFixed(1), 'text-anchor': pAnchor, class: 'fm-axis fm-axis-strong' }, `最高 ${ft(peak)} 呎`);

    // 指到哪裡就顯示那一點的距離和高度
    const cursor = add('g', { class: 'fm-cursor', visibility: 'hidden' });
    const cLine = add('line', { y1: padT, y2: padT + ph, class: 'fm-cursor-line' }, undefined, cursor);
    const cDot = add('circle', { r: 4, class: 'fm-rw-dot' }, undefined, cursor);
    const cText = add('text', { x: padL + 4, y: 24, 'text-anchor': 'start', class: 'fm-axis fm-axis-strong' }, '', cursor);
    const hit = add('rect', { x: padL, y: padT, width: pw, height: ph, fill: 'transparent', class: 'fm-hit' });
    const move = (e) => {
        const box = svg.getBoundingClientRect();
        const vx = ((e.clientX - box.left) / box.width) * W;
        const d = Math.min(total, Math.max(0, ((vx - padL) / pw) * total));
        let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const t = cum[i] === cum[i - 1] ? 0 : (d - cum[i - 1]) / (cum[i] - cum[i - 1]);
        const alt = pts[i - 1].alt + (pts[i].alt - pts[i - 1].alt) * t;
        const cx = x(d);
        cLine.setAttribute('x1', cx.toFixed(1)); cLine.setAttribute('x2', cx.toFixed(1));
        cDot.setAttribute('cx', cx.toFixed(1)); cDot.setAttribute('cy', y(alt).toFixed(1));
        cText.textContent = `${Math.round(d)} 海浬，${ft(alt)} 呎`;
        cursor.setAttribute('visibility', 'visible');
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => cursor.setAttribute('visibility', 'hidden'));
    return svg;
}

// 跑道資料：開頭是跑道長、寬、離地或接地距離（呎），後面每點是沿跑道和橫向位置的差值，皆為 36 進位
function decodeRunway(str) {
    const [head, ...seg] = str.split(';');
    const [len, wid, mark] = head.split(',').map((x) => parseInt(x, 36));
    let a = 0, c = 0;
    const pts = seg.map((s) => {
        const d = s.split(',').map((x) => parseInt(x, 36));
        a += d[0]; c += d[1];
        return { a, c };
    });
    return { len, wid, mark, pts };
}

function runwayFigure(kind, rw, name) {
    const isArr = kind === 'arr';
    let pts = rw.pts;
    let cutHit = false;
    if (isArr) {
        // 落地後飛機滑出跑道，後面的滑行路徑不畫，只留到離開跑道的那一點
        const ti = Math.max(0, pts.findIndex((p) => p.a >= rw.mark));
        const lim = rw.wid / 2 + 40;
        for (let i = ti + 1; i < pts.length; i++) {
            if (Math.abs(pts[i].c) > lim) { pts = pts.slice(0, i + 1); cutHit = true; break; }
        }
    }
    const scalePts = cutHit ? pts.slice(0, -1) : pts;
    const maxC = Math.max(rw.wid / 2, ...scalePts.map((p) => Math.abs(p.c)));
    const R = [200, 400, 800, 1600].find((t) => t >= maxC * 1.15) || 1600;
    const x0 = Math.min(0, ...scalePts.map((p) => p.a));
    const x1 = Math.max(rw.len, ...scalePts.map((p) => p.a));

    const W = 600, H = 150, padL = 12, padR = 12, padT = 28, padB = 24;
    const ph = H - padT - padB;
    const xs = (W - padL - padR) / (x1 - x0);
    const ys = ph / (2 * R);
    const cy = padT + ph / 2;
    const X = (a) => padL + (a - x0) * xs;
    const Y = (c) => cy + c * ys;

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'fm-rw');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${isArr ? '落地' : '起飛'}跑道剖面圖，跑道 ${name || ''}，長 ${ft(rw.len)} 呎，${isArr ? '接地點' : '離地點'}距跑道頭 ${ft(rw.mark)} 呎`);
    const add = (parent, tag, attrs, text) => {
        const n = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
        if (text !== undefined) n.textContent = text;
        parent.appendChild(n);
        return n;
    };

    const clipId = isArr ? 'fmRwClipArr' : 'fmRwClipDep';
    const defs = add(svg, 'defs', {});
    const clip = add(defs, 'clipPath', { id: clipId });
    add(clip, 'rect', { x: padL, y: padT, width: W - padL - padR, height: ph });

    const g = add(svg, 'g', { 'clip-path': `url(#${clipId})` });
    const roadTop = Y(-rw.wid / 2), roadH = rw.wid * ys;
    add(g, 'rect', { x: X(0).toFixed(1), y: roadTop.toFixed(1), width: ((rw.len) * xs).toFixed(1), height: roadH.toFixed(1), class: 'fm-rw-road' });
    if (isArr) {
        add(g, 'rect', { x: X(0).toFixed(1), y: roadTop.toFixed(1), width: (Math.min(3000, rw.len) * xs).toFixed(1), height: roadH.toFixed(1), class: 'fm-rw-zone' });
    }
    add(g, 'line', { x1: X(0).toFixed(1), x2: X(rw.len).toFixed(1), y1: cy, y2: cy, class: 'fm-rw-center' });
    // 跑道標線：兩端的門檻條紋，和距跑道頭 400 公尺（1,312 呎）的瞄準點大白塊
    const mark = (a0, len, c0, wid) => add(g, 'rect', {
        x: X(a0).toFixed(1), y: Y(c0).toFixed(1),
        width: Math.max(1, len * xs).toFixed(1), height: Math.max(1, wid * ys).toFixed(1), class: 'fm-rw-mark-white'
    });
    [false, true].forEach((far) => {
        const at = (d, l) => (far ? rw.len - d - l : d);
        const stripe = rw.wid / 16;
        for (let i = 0; i < 8; i++) {
            mark(at(20, 100), 100, -rw.wid / 2 + stripe * 0.5 + i * stripe * 2, stripe);
        }
        [-1, 1].forEach((side) => mark(at(1312, 197), 197, side > 0 ? 30 : -63, 33));
    });
    add(g, 'polyline', { points: pts.map((p) => `${X(p.a).toFixed(1)},${Y(p.c).toFixed(1)}`).join(' '), class: 'fm-rw-path' });

    // 離地或接地點
    let near = pts[0];
    pts.forEach((p) => { if (Math.abs(p.a - rw.mark) < Math.abs(near.a - rw.mark)) near = p; });
    const mx = X(rw.mark);
    add(svg, 'line', { x1: mx.toFixed(1), x2: mx.toFixed(1), y1: padT - 6, y2: padT + ph, class: 'fm-rw-mark' });
    add(svg, 'circle', { cx: mx.toFixed(1), cy: Y(near.c).toFixed(1), r: 5, class: 'fm-rw-dot' });
    const anchor = mx < 110 ? 'start' : mx > W - 110 ? 'end' : 'middle';
    add(svg, 'text', { x: mx.toFixed(1), y: padT - 12, 'text-anchor': anchor, class: 'fm-axis' }, `${isArr ? '接地' : '離地'} ${ft(rw.mark)} 呎`);

    add(svg, 'text', { x: X(0).toFixed(1), y: H - 6, 'text-anchor': 'middle', class: 'fm-axis' }, '0');
    add(svg, 'text', { x: X(rw.len).toFixed(1), y: H - 6, 'text-anchor': 'end', class: 'fm-axis' }, `${ft(rw.len)} 呎`);

    const ratio = ys / xs;
    const fig = el('figure', 'fm-figure');
    fig.appendChild(el('h4', 'title-4', '跑道剖面'));
    fig.appendChild(svg);
    fig.appendChild(el('p', 'caption-1 muted',
        `Runway Profile，從上方俯視。深色是跑道，粉紅線是實際路徑，白點是${isArr ? '接地' : '離地'}位置，兩塊大白塊是瞄準點標線（距跑道頭 1,312 呎）${isArr ? '，粉紅色底是接地區（前 3,000 呎）' : ''}。橫向放大約 ${ratio >= 2 ? Math.round(ratio) : ratio.toFixed(1)} 倍，顯示範圍左右各 ${ft(R)} 呎。`));
    return fig;
}

// 機場地面軌跡：每點是和上一點的差值（36 進位），順序為緯度、經度（1e-5 度，約 1 公尺）、地速（節）、秒
function decodeGround(str) {
    let la = 0, lo = 0, t = 0;
    return str.split(';').map((seg) => {
        const d = seg.split(',').map((x) => parseInt(x, 36));
        la += d[0]; lo += d[1]; t += d[3];
        return { lat: la / 1e5, lon: lo / 1e5, gs: d[2], t };
    });
}

const mmss = (sec) => {
    const s = Math.max(0, Math.round(sec));
    return s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`;
};

// 滑行的範圍：起飛是從起點到開始滑跑（地速達 35 節），落地是從減速到 35 節以下到停妥
function groundAnalysis(kind, pts) {
    const isArr = kind === 'arr';
    let from = 0, to = pts.length - 1;
    if (isArr) {
        for (let i = pts.length - 1; i >= 0; i--) { if (pts[i].gs > 35) { from = i; break; } }
    } else {
        const r = pts.findIndex((p) => p.gs >= 35);
        if (r > 0) to = r;
    }
    let dist = 0, maxGs = 0;
    for (let i = from + 1; i <= to; i++) {
        dist += distNm(pts[i - 1], pts[i]);
        if (isArr || i < to) maxGs = Math.max(maxGs, pts[i].gs);
    }
    // 停等：位置幾乎沒動，但下一點隔了 25 秒以上
    const stops = [];
    for (let i = Math.max(from, isArr ? from : 1); i < to; i++) {
        const dt = pts[i + 1].t - pts[i].t;
        if (dt >= 25 && distNm(pts[i], pts[i + 1]) * 1852 < 15) stops.push({ i, sec: dt });
    }
    return { from, to, time: pts[to].t - pts[from].t, dist, maxGs, stops };
}

// 機場地面段：解碼、分析，並備好地圖要用的座標
function prepGround(kind, str) {
    if (!str) return null;
    const pts = decodeGround(str);
    const info = groundAnalysis(kind, pts);
    return { kind, pts, info, ll: pts.map((p) => [p.lat, p.lon]) };
}

// 滑行數據的小節：地圖已經整合在上面的飛行軌跡裡
function groundFigure(g) {
    const isArr = g.kind === 'arr';
    const { info } = g;
    const fig = el('figure', 'fm-figure');
    fig.appendChild(el('h4', 'title-4', '機場滑行'));
    fig.appendChild(el('p', 'caption-1 muted',
        `${isArr ? '落地後' : '起飛前'}的滑行路線畫在上面的飛行軌跡地圖裡，按「${isArr ? '落地機場' : '起飛機場'}」可以放大到衛星圖。` +
        '停等是位置沒有動超過 25 秒。'));
    const grid = el('div', 'fm-grid');
    [
        [isArr ? '滑行時間' : '滑行到起飛線', mmss(info.time)],
        ['滑行距離', `${info.dist.toFixed(1)} 海里`],
        ['最高滑行速度', `${info.maxGs} kt`],
        ['停等', info.stops.length ? `${info.stops.length} 次，共 ${mmss(info.stops.reduce((a, s) => a + s.sec, 0))}` : '沒有']
    ].forEach(([label, value]) => {
        const tile = el('div', 'fm-tile');
        tile.append(el('p', 'caption-1 muted', label), el('p', 'title-3', value));
        grid.appendChild(tile);
    });
    fig.appendChild(grid);
    return fig;
}

// 整條路線：起飛機場的高精度滑行段 + 中段的簡化軌跡 + 落地機場的高精度滑行段
function mergedRoute(pts, ground) {
    let route = pts.map((p) => ({ lat: p.lat, lon: p.lon }));
    const dep = ground.dep, arr = ground.arr;
    const radius = (g, o) => Math.max(...g.pts.map((p) => distNm(o, p))) + 0.3;
    if (dep) {
        const o = dep.pts[0], r = radius(dep, o);
        let k = 0;
        while (k < route.length && distNm(o, route[k]) <= r) k++;
        route = dep.pts.map((p) => ({ lat: p.lat, lon: p.lon })).concat(route.slice(k));
    }
    if (arr) {
        const e = arr.pts[arr.pts.length - 1], r = radius(arr, e);
        let k = route.length;
        while (k > 0 && distNm(e, route[k - 1]) <= r) k--;
        route = route.slice(0, k).concat(arr.pts.map((p) => ({ lat: p.lat, lon: p.lon })));
    }
    return route.map((p) => [p.lat, p.lon]);
}

let fmMap = null, fmLayer = null, fmBase = null;
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';

function showTrackMap(box, pts, ground, tools) {
    if (typeof L === 'undefined') { box.hidden = true; if (tools) tools.hidden = true; return; }
    if (fmMap) { fmMap.remove(); fmMap = null; }
    fmMap = L.map(box, { zoomControl: true, scrollWheelZoom: true });
    fmMap.attributionControl.setPrefix(false);
    const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
    const sat = L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 17, maxZoom: 19, attribution: 'Imagery &copy; Esri' });
    fmBase = null;
    const setBase = (kind) => {
        if (fmBase === kind) return;
        if (fmBase) fmMap.removeLayer(fmBase === 'sat' ? sat : street);
        (kind === 'sat' ? sat : street).addTo(fmMap);
        fmBase = kind;
        box.classList.toggle('is-sat', kind === 'sat');
    };
    setBase('street');
    if (fmLayer) fmLayer.remove();
    const route = (ground.dep || ground.arr) ? mergedRoute(pts, ground) : pts.map((p) => [p.lat, p.lon]);
    const dot = (ll, cls, tip) => {
        const mk = L.marker(ll, {
            icon: L.divIcon({ className: 'fm-pin ' + cls, iconSize: [14, 14], iconAnchor: [7, 7] }),
            interactive: !!tip, keyboard: false
        });
        return tip ? mk.bindTooltip(tip, { direction: 'top', offset: [0, -8] }) : mk;
    };
    const layers = [
        L.polyline(route, { color: '#000000', weight: 6, opacity: 0.35, lineJoin: 'round' }),
        L.polyline(route, { color: '#d6479f', weight: 3, lineJoin: 'round' }),
        dot(route[0], 'start', '起點'),
        dot(route[route.length - 1], 'end', '終點')
    ];
    ['dep', 'arr'].forEach((k) => {
        const g = ground[k];
        if (!g) return;
        g.info.stops.forEach((st) => {
            layers.push(L.marker([g.pts[st.i].lat, g.pts[st.i].lon], {
                icon: L.divIcon({ className: 'fm-pin fm-stop', iconSize: [10, 10], iconAnchor: [5, 5] }),
                keyboard: false
            }).bindTooltip(`停等 ${mmss(st.sec)}`, { direction: 'top', offset: [0, -6] }));
        });
    });
    fmLayer = L.layerGroup(layers).addTo(fmMap);

    let target = null;
    const fitTo = (ll, maxZoom) => {
        fmMap.invalidateSize();
        fmMap.fitBounds(L.latLngBounds(ll), { padding: [24, 24], maxZoom, animate: false });
    };
    const go = (which) => {
        target = which;
        if (which === 'all') { setBase('street'); fitTo(route, 12); } else { setBase('sat'); fitTo(ground[which].ll, 18); }
        if (tools) tools.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.go === which)));
    };
    if (tools) {
        tools.replaceChildren();
        [['all', '全航程'], ['dep', '起飛機場'], ['arr', '落地機場']].forEach(([key, label]) => {
            if (key !== 'all' && !ground[key]) return;
            const b = el('button', 'chip fm-tool caption-1', label);
            b.type = 'button';
            b.dataset.go = key;
            b.addEventListener('click', () => go(key));
            tools.appendChild(b);
        });
        tools.hidden = tools.children.length < 2;
    }
    go('all');
    setTimeout(() => { if (target) go(target); }, 550);
}

function openDetail(f, opener) {
    const v = f.v;
    lastOpener = opener;
    fmCard.replaceChildren();
    trackJob = null;

    const ground = { dep: prepGround('dep', v.gd), arr: prepGround('arr', v.ga) };

    const head = el('div', 'fm-head');
    head.appendChild(el('p', 'caption-1 muted', f.date));
    head.appendChild(el('p', 'heading-4 flight-callsign', f.callsign));
    const title = el('h2', 'heading-5 flight-route');
    title.id = 'fmTitle';
    const arrow = el('i', 'ph ph-airplane-in-flight');
    arrow.setAttribute('aria-label', '飛往');
    title.append(el('span', '', f.from), arrow, el('span', '', f.to));
    head.appendChild(title);
    const chips = el('div', 'chip-row');
    [v.fn ? `航班編號 ${v.fn}` : null, f.aircraft, f.registration, v.score ? `總分 ${v.score}` : null].filter(Boolean)
        .forEach((t) => chips.appendChild(el('span', 'chip caption-1', t)));
    head.appendChild(chips);
    fmCard.appendChild(head);

    if (v.trk) {
        const pts = decodeTrack(v.trk);
        const mapSec = el('section', 'fm-section');
        mapSec.appendChild(el('h3', 'title-3', '飛行軌跡'));
        const box = el('div', 'fm-map');
        box.setAttribute('role', 'img');
        box.setAttribute('aria-label', `${f.from} 到 ${f.to} 的飛行軌跡地圖`);
        const tools = el('div', 'fm-map-tools');
        mapSec.append(tools, box);
        mapSec.appendChild(el('p', 'caption-1 muted', (ground.dep || ground.arr)
            ? '粉紅線是實際走過的路線：兩端的機場滑行段精度約 1 公尺，中段經過簡化。按上面的按鈕可以放大到機場，看滑行路線。白點是停等超過 25 秒的地方，圓點分別是起點和終點。'
            : '粉紅色線是實際飛行的路線，經過簡化。圓點分別是起點和終點。'));
        fmCard.appendChild(mapSec);
        trackJob = { box, pts, ground, tools };

        const profSec = el('section', 'fm-section');
        profSec.appendChild(el('h3', 'title-3', '高度剖面'));
        profSec.appendChild(profileSvg(pts, f.from, f.to));
        profSec.appendChild(el('p', 'caption-1 muted', '把游標移到線上，或用手指滑過，可以看每一點的距離和高度。'));
        fmCard.appendChild(profSec);
    }

    const d = v.dep || {};
    const a = v.arr || {};
    flagCount = 0;
    // 擦機尾和拉平姿態上限：A320 系列手冊（FCTM）與東航 SOP，其他機型沒有手冊數值
    const FAMILY = { A319: 'A319', A19N: 'A319', A320: 'A320', A20N: 'A320', A321: 'A321', A21N: 'A321' };
    const LIMITS = { A319: { lift: 15.5, td: 10 }, A320: { lift: 13.5, td: 10 }, A321: { lift: 11.2, td: 7.5 } };
    const fam = FAMILY[f.aircraft];
    const lim = fam ? LIMITS[fam] : null;
    const noRef = { std: '此機型沒有手冊數值，不判定', bad: false };
    const rwaLen = num(a.td) !== null && num(a.lda) !== null ? num(a.td) + num(a.lda) : null;
    const tdMax = rwaLen ? Math.min(3000, rwaLen / 3) : 3000;
    const withProfile = (kind, title, rows, rwStr, rwy, g) => {
        let box = fmSection(title, rows);
        if (rwStr || g) {
            if (!box) { box = el('section', 'fm-section'); box.appendChild(el('h3', 'title-3', title)); }
            // 起飛：先滑行再上跑道；落地：先在跑道上再滑行
            // 起飛：滑行圖、跑道圖、數據；落地：跑道圖、數據、滑行圖
            const grid = box.querySelector(':scope > .fm-grid');
            const before = (fig) => (grid ? box.insertBefore(fig, grid) : box.appendChild(fig));
            if (kind === 'dep' && g) before(groundFigure(g));
            if (rwStr) before(runwayFigure(kind, decodeRunway(rwStr), rwy));
            if (kind === 'arr' && g) box.appendChild(groundFigure(g));
        }
        return box;
    };
    [
        fmSection('時間', [['空中時間', v.air], ['艙內時間', v.block], ['計畫時間', v.sched], ['預估時間', v.est]]),
        withProfile('dep', `起飛${d.rwy ? '，跑道 ' + d.rwy : ''}`, [
            ['離地速度', d.spd],
            ['離地仰角', d.pitch, lim ? chk(d.pitch, { max: lim.lift }, `≤ ${lim.lift}°`) : noRef],
            ['滑跑距離', d.roll],
            ['爬升梯度', d.grad, chk(d.grad, { min: 200 }, '≥ 200 ft/NM')],
            ['爬升率', d.rate],
            ['中線偏移', d.dev]
        ], v.rwd, d.rwy, ground.dep),
        withProfile('arr', `落地${a.rwy ? '，跑道 ' + a.rwy : ''}`, [
            ['下沉率', a.rate, chk(a.rate, { max: 600 }, '≤ 600 fpm')],
            ['G 值', a.g, chk(a.g, { max: 2 }, '≤ 2.0 G')],
            ['接地點', a.td, chk(a.td, { min: 500, max: tdMax }, `${ft(500)} 到 ${ft(tdMax)} ft`)],
            ['可用著陸距離', a.lda],
            ['滑行距離', a.roll, num(a.lda) !== null ? chk(a.roll, { max: num(a.lda) }, `≤ ${a.lda}`) : null],
            ['接地速度', a.spd, { std: 'Vapp 到 Vapp + 5 kt 直到拉平，需要當次的 Vapp，不判定', bad: false }],
            ['接地仰角', a.pitch, lim ? chk(a.pitch, { min: -2.5, max: lim.td }, `−2.5° 到 ${lim.td}°`) : noRef]
        ], v.rwa, a.rwy, ground.arr)
    ].filter(Boolean).forEach((n) => fmCard.appendChild(n));
    if (flagCount) chips.appendChild(el('span', 'chip chip-alert caption-1', `${flagCount} 項不符合標準`));

    const notes = el('section', 'fm-section');
    notes.appendChild(el('h3', 'title-3', '標準值說明'));
    notes.appendChild(el('p', 'body-5 muted', '標準值來自東航 A320 標準操作程序（SOP）和 A320 系列飛行機組訓練手冊（FCTM）。手冊沒有給數字的項目，用公開資料的參考值補上並寫明。各航空公司會有出入，紅框表示這一項超出標準。'));
    const ul = el('ul', 'fm-notes');
    [
        '離地仰角：FCTM 的擦機尾俯仰極限，起落架伸展時 A319 為 15.5°、A320 為 13.5°、A321 為 11.2°，A320neo 和 A321neo 沿用同系列。標準抬輪速率約每秒 3°，低於每秒 2° 要避免。',
        '接地仰角：SOP 拉平時 PM 要報出的上限，A319 和 A320 是 10°，A321 是 7.5°，下限是 −2.5°。FCTM 的接地幾何極限是 A320 13.5°、A321 10.8°。',
        '空中巴士 A330 和 A350 等其他機型，手冊沒有給這兩項數值，所以只列出數字，不判定。',
        '下沉率 600 fpm、G 值 2.0：手冊沒有給一般重量的重落地數值，這是多數航空公司的通報門檻。FCTM 另外規定超重著陸接地超過 360 fpm 需要維護檢查，這裡沒有重量資料，所以沒有用它判定。',
        '接地點：SOP 只要求在正常接地區內接地，沒有給數字。這裡用接地區定義：跑道前 3,000 呎或前三分之一（取較小），標線從 500 呎開始。',
        '滑行距離不能超過可用著陸距離，也就是要在跑道內停下。',
        '爬升梯度 200 ft/NM（3.3%）：ICAO 離場程序預設的最低梯度，手冊沒有給數字。',
        '接地速度：SOP 要求維持在 Vapp 到 Vapp + 5 kt 直到拉平，穩定進近範圍是 Vapp − 5 到 Vapp + 10 kt。Vapp 要看當次的重量，這裡沒有資料，所以不判定。'
    ].forEach((t) => ul.appendChild(el('li', 'caption-1 muted', t)));
    notes.appendChild(ul);
    fmCard.appendChild(notes);

    if (v.route) {
        const box = el('section', 'fm-section');
        box.appendChild(el('h3', 'title-3', '飛行航路'));
        box.appendChild(el('p', 'body-5 fm-route', v.route));
        fmCard.appendChild(box);
    }

    if (v.id) {
        const link = el('a', 'btn btn-on-light button-sm fm-link');
        link.href = `https://vamsys.io/phoenix/flight-center/pireps/${v.id}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.innerHTML = '<span>在 vAMSYS 查看完整紀錄</span><i class="ph ph-arrow-square-out" aria-hidden="true"></i>';
        fmCard.append(link, el('p', 'caption-1 muted', '完整紀錄需要登入 vAMSYS 才看得到。'));
    }

    modal.classList.add('show');
    document.documentElement.classList.add('modal-open');
    fmCard.scrollTop = 0;
    if (trackJob) {
        try { showTrackMap(trackJob.box, trackJob.pts, trackJob.ground, trackJob.tools); } catch (e) { trackJob.box.hidden = true; trackJob.tools.hidden = true; }
    }
    $('fmClose').focus();
}

function closeDetail() {
    modal.classList.remove('show');
    document.documentElement.classList.remove('modal-open');
    if (lastOpener) lastOpener.focus();
}

$('fmClose').addEventListener('click', closeDetail);
modal.addEventListener('click', (e) => { if (e.target === modal) closeDetail(); });
document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('show')) return;
    if (e.key === 'Escape') { closeDetail(); return; }
    if (e.key === 'Tab') {
        const focusable = [$('fmClose'), ...fmCard.querySelectorAll('a[href]')];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
});

// ---------- 即時位置 ----------
const COMPASS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];

function formatPos(lat, lon) {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(3)}°${ns}\n${Math.abs(lon).toFixed(3)}°${ew}`;
}

function formatDuration(fromIso) {
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(fromIso)) / 60000));
    return formatMinutes(mins);
}

let map = null, marker = null, trail = null, trailPoints = [];
let estLine = null, restLine = null, trailId = null;

// ---- 軌跡：存在這個瀏覽器的 localStorage，重新整理或關掉再開都還在 ----
// 以「呼號＋起降機場」當作同一趟飛行；超過 3 小時沒更新就當成新的一趟
const TRAIL_KEY = 'liveTrail.v1';
const TRAIL_MAX_AGE = 3 * 3600 * 1000;
const TRAIL_MAX_POINTS = 4000;

function loadTrail(id) {
    try {
        const s = JSON.parse(localStorage.getItem(TRAIL_KEY));
        if (s && s.id === id && Date.now() - s.updated < TRAIL_MAX_AGE && Array.isArray(s.pts)) return s.pts;
    } catch (err) { /* 沒有或壞掉就當作空的 */ }
    return [];
}

function saveTrail(id, pts) {
    try { localStorage.setItem(TRAIL_KEY, JSON.stringify({ id, updated: Date.now(), pts })); } catch (err) { /* 無痕模式等 */ }
}

// 兩點之間的大圓航線（地球上的最短路徑，在地圖上看起來是彎的）
function greatCircle(a, b, n = 48) {
    const r = Math.PI / 180;
    const [la1, lo1, la2, lo2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r];
    const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
    if (!(d > 1e-4)) return [a, b];
    const out = [];
    for (let i = 0; i <= n; i++) {
        const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
        const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
        const z = A * Math.sin(la1) + B * Math.sin(la2);
        out.push([Math.atan2(z, Math.hypot(x, y)) / r, Math.atan2(y, x) / r]);
    }
    return out;
}

// ---- 伺服器軌跡（Cloudflare Worker 邊飛邊存的）----
let serverTrail = null;
let serverTrailAt = 0;

async function refreshServerTrail() {
    if (!CONFIG.TRAIL_URL || Date.now() - serverTrailAt < 15000) return;
    serverTrailAt = Date.now();
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(CONFIG.TRAIL_URL, { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        serverTrail = j && Array.isArray(j.pts) ? j : null;
    } catch (err) {
        serverTrail = null;   // 讀不到就退回瀏覽器自己的記錄
    }
}

function updateMap(lat, lon, heading, info) {
    const card = $('mapCard');
    if (typeof L === 'undefined') { card.hidden = true; return; }
    card.hidden = false;

    if (!map) {
        map = L.map('map', { zoomControl: true }).setView([lat, lon], 7);
        map.attributionControl.setPrefix(false);
        // Esri 街道圖在中國大陸放大後會顯示「Map data not yet available」，改用 OpenStreetMap 底圖；衛星圖可切換
        const liveStreet = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        const liveSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxNativeZoom: 17, maxZoom: 19, attribution: 'Imagery &copy; Esri'
        });
        L.control.layers({ '街道': liveStreet, '衛星': liveSat }, null, { position: 'topright', collapsed: true }).addTo(map);
        estLine = L.polyline([], { color: '#d6479f', weight: 3, opacity: 0.6, dashArray: '2 8' }).addTo(map);
        restLine = L.polyline([], { color: '#8a8a8a', weight: 2, opacity: 0.8, dashArray: '4 8' }).addTo(map);
        trail = L.polyline([], { color: '#d6479f', weight: 3 }).addTo(map);
        marker = L.marker([lat, lon], {
            icon: L.divIcon({
                className: 'plane-marker',
                html: '<span class="plane-arrow"></span><span class="plane-dot"></span>',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            })
        }).addTo(map);
    }

    map.invalidateSize();
    marker.setLatLng([lat, lon]);
    const el = marker.getElement();
    if (el) el.style.setProperty('--hdg', `${heading}deg`);

    // 換了一趟飛行就重新載入（或清空）軌跡
    const id = `${info.callsign}|${info.dep || ''}|${info.arr || ''}`;
    if (id !== trailId) { trailId = id; trailPoints = loadTrail(id); }
    const last = trailPoints[trailPoints.length - 1];
    if (!last || Math.abs(last[0] - lat) > 0.0005 || Math.abs(last[1] - lon) > 0.0005) {
        trailPoints.push([+lat.toFixed(4), +lon.toFixed(4)]);
        if (trailPoints.length > TRAIL_MAX_POINTS) trailPoints = trailPoints.filter((_, i) => i % 2 === 0 || i === trailPoints.length - 1);
    }
    // 有伺服器軌跡就以它為準（它在網頁關著的時候也在記），再接上目前位置
    let fromServer = false;
    if (serverTrail && serverTrail.id === id && serverTrail.pts.length) {
        const base = serverTrail.pts.map((q) => [q[0], q[1]]);
        const b = base[base.length - 1];
        if (Math.abs(b[0] - lat) > 0.0005 || Math.abs(b[1] - lon) > 0.0005) base.push([+lat.toFixed(4), +lon.toFixed(4)]);
        trailPoints = base;
        fromServer = true;
    }
    saveTrail(id, trailPoints);

    // 虛線：起飛機場到「記錄的第一個點」（頁面開啟前飛過的部分，用大圓推估）；目前位置到目的地
    const ap = (c) => { const a = c && SNAPSHOT.airports && SNAPSHOT.airports[c]; return a ? [a[0], a[1]] : null; };
    const D = ap(info.dep), A = ap(info.arr);
    const est = D ? greatCircle(D, trailPoints[0]) : [];
    const rest = A ? greatCircle(trailPoints[trailPoints.length - 1], A) : [];
    // 跨換日線時把經度接成連續的，再整組對齊到飛機標記所在的那一圈地圖
    const all = [...est, ...trailPoints, ...rest].map((q) => [q[0], q[1]]);
    for (let i = 1; i < all.length; i++) {
        while (all[i][1] - all[i - 1][1] > 180) all[i][1] -= 360;
        while (all[i][1] - all[i - 1][1] < -180) all[i][1] += 360;
    }
    const cur = est.length + trailPoints.length - 1;
    const shift = Math.round((lon - all[cur][1]) / 360) * 360;
    all.forEach((q) => { q[1] += shift; });
    estLine.setLatLngs(all.slice(0, est.length));
    trail.setLatLngs(all.slice(est.length, cur + 1));
    restLine.setLatLngs(all.slice(cur));
    $('trailNote').textContent = fromServer
        ? '實線是伺服器邊飛邊記錄的軌跡，虛線是依起降機場推估的航線。'
        : '實線是這個瀏覽器記錄到的軌跡，虛線是依起降機場推估的航線（頁面開啟前飛過的部分沒有真實紀錄）。';
    $('trailNote').hidden = !(est.length || rest.length);

    map.panTo([lat, lon], { animate: !reduced.matches });
}

function renderLive(p, updatedAt) {
    const fp = p.flight_plan;
    $('liveCallsign').textContent = p.callsign;
    $('liveRoute').textContent = fp && fp.departure && fp.arrival
        ? `${fp.departure} 至 ${fp.arrival}${fp.aircraft_short ? '，' + fp.aircraft_short : ''}`
        : '尚未提交飛行計畫';
    const time = updatedAt ? new Date(updatedAt).toLocaleTimeString('zh-TW', { hour12: false }) : '';
    $('liveMeta').textContent = `已連線 ${formatDuration(p.logon_time)}${time ? '，資料更新於 ' + time : ''}`;

    const heading = ((Math.round(p.heading) % 360) + 360) % 360;
    $('statAlt').textContent = `${Math.round(p.altitude).toLocaleString('en-US')} ft`;
    $('statSpeed').textContent = `${Math.round(p.groundspeed)} kt`;
    $('statHeading').textContent = `${String(heading).padStart(3, '0')}° ${COMPASS[Math.round(heading / 45) % 8]}`;
    $('statPos').textContent = formatPos(p.latitude, p.longitude);

    updateMap(p.latitude, p.longitude, heading, {
        callsign: p.callsign,
        dep: fp && fp.departure,
        arr: fp && fp.arrival
    });
}

// ---------- 讀取 VATSIM 即時資料 ----------
const FEED_URLS = ['https://data.vatsim.net/v3/vatsim-data.json'];

async function fetchFeed() {
    let lastError;
    for (const url of FEED_URLS) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (err) {
            lastError = err;
        }
    }
    // 備用：從官方的狀態檔找目前的資料網址
    try {
        const status = await (await fetch('https://status.vatsim.net/status.json', { cache: 'no-store' })).json();
        for (const url of status.data.v3) {
            if (FEED_URLS.includes(url)) continue;
            FEED_URLS.push(url);
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) return await res.json();
        }
    } catch (err) {
        lastError = err;
    }
    throw lastError || new Error('feed unavailable');
}

// 先問自己的 Worker（只回傳一位飛行員，檔案很小），失敗就退回直接讀 VATSIM 全球資料。
// Worker 連續失敗時暫停 2 分鐘不再試，避免每輪都白等逾時。
let liveSkipUntil = 0;

async function fetchLive() {
    if (CONFIG.LIVE_URL && Date.now() >= liveSkipUntil) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        try {
            const res = await fetch(CONFIG.LIVE_URL, { cache: 'no-store', signal: ctrl.signal });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const j = await res.json();
            if (!j || typeof j !== 'object' || !('pilot' in j)) throw new Error('bad payload');
            return { pilot: j.pilot, updatedAt: j.updated };
        } catch (err) {
            liveSkipUntil = Date.now() + 120000;
        } finally {
            clearTimeout(timer);
        }
    }
    const feed = await fetchFeed();
    return {
        pilot: feed.pilots.find((p) => p.cid === CONFIG.VATSIM_CID) || null,
        updatedAt: feed.general && feed.general.update_timestamp
    };
}

async function check() {
    try {
        const { pilot, updatedAt } = await fetchLive();
        setNotice('');
        if (pilot) {
            await refreshServerTrail();
            setStatus('online');
            renderLive(pilot, updatedAt);
            show('live');
            return true;
        }
        setStatus('offline');
        show('history');
        return false;
    } catch (err) {
        setStatus(null);
        setNotice('即時資料暫時讀不到，下面先顯示歷史航班。');
        show('history');
        return false;
    }
}

async function loop() {
    for (;;) {
        const online = await check();
        const wait = online ? CONFIG.POLL_ONLINE_MS : CONFIG.POLL_OFFLINE_MS;
        await new Promise((r) => setTimeout(r, wait));
        // 分頁在背景時暫停，回來再繼續
        while (document.hidden) await new Promise((r) => setTimeout(r, 1000));
    }
}

renderHistory();

if (CONFIG.VATSIM_CID) {
    show('loading');
    loop();
} else {
    show('history');
}
