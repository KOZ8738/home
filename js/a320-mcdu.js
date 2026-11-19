// MCDU：FMGC 的輸入面板（簡化版）。螢幕 24 字 × 14 行，兩側各 6 個行選鍵（LSK）。
// 輸入方式和真機一樣：先在鍵盤打到最下面的暫存列（scratchpad），再按旁邊的 LSK 送進欄位。
(function (root) {
    'use strict';

    const A = root.A320;
    const U = A.ui;
    const el = U.el;
    const mcdu = A.mcdu = {};
    const COLS = 24;

    const M = { page: 'MENU', sub: 0, scroll: 0, sp: '', msg: '', bright: 1, d: {}, perf: null, last: '' };
    const fcu = () => A.fcu;
    const F = () => A.fcu.state;
    const api = () => A.fcu.api;

    // ---------- 文字片段 ----------
    // c：顏色（w 白、g 綠、c 青、a 琥珀、m 洋紅、y 黃）；s：小字
    const S = (t, c, s) => ({ t: String(t), c: c || 'w', s: !!s });
    const norm = (v) => (v === undefined || v === null || v === '' ? [] : typeof v === 'string' ? [S(v)] : Array.isArray(v) ? v : [v]);
    const L = (left, right, center) => ({ left: norm(left), right: norm(right), center: norm(center) });
    const box = (n) => '□'.repeat(n);
    const pad = (n, w) => String(Math.round(n)).padStart(w, '0');
    const say = (t) => { M.msg = t; };

    // ---------- 頁面 ----------
    function phaseIdx(name) { return ['TAKE OFF', 'CLB', 'CRZ', 'DES', 'APPR', 'GO AROUND'].indexOf(name); }
    function activePerf() {
        const p = api().phase();
        if (p === 'PREFLIGHT' || p === 'DONE') return 'TAKE OFF';
        return p;
    }
    const fmsDefaults = (scn) => {
        const dest = api().icao();
        const air = scn !== 'cold';
        M.d = {
            flt: air ? 'KOZ8738' : '', from: air ? (dest === 'RCTP' ? 'RCKH' : 'RCTP') : '', to: air ? dest : '',
            ci: air ? 30 : null, crz: air ? (scn === 'cruise' ? 350 : 240) : null,
            v1: null, vr: null, v2: null, qnh: '1013', temp: '15', trans: '11000', flex: '', flaps: '',
            f: {}
        };
    };

    // 可以自由輸入的欄位（只是顯示用）：存在 M.d.f 裡
    const free = (key, empty, col) => (M.d.f[key] ? S(M.d.f[key], col || 'c') : S(empty, 'c'));
    const setFree = (key) => (sp) => { if (!sp) return 'NOT ALLOWED'; if (sp === 'CLR') { delete M.d.f[key]; return; } if (sp.length > 10) return 'FORMAT ERROR'; M.d.f[key] = sp; };

    const PAGES = {};

    PAGES.MENU = () => ({
        title: L('', '', S('MCDU MENU')),
        rows: [
            ['', S('<FMGC', 'g')], ['', S('<ATSU')], ['', S('<AIDS')], ['', S('<CFDS')], ['', ''],
            [L('', '', S('SELECT DESIRED SYSTEM', 'w', true)), L('', S('RETURN>'))]
        ],
        lsk: {
            L1: () => go(api().phase() === 'PREFLIGHT' ? 'INIT' : 'FPLN'),
            L2: () => 'NOT AVAILABLE', L3: () => 'NOT AVAILABLE', L4: () => 'NOT AVAILABLE',
            R6: () => go(M.last && M.last !== 'MENU' ? M.last : 'FPLN')
        }
    });

    PAGES.INIT = () => {
        const d = M.d;
        if (M.sub === 1) return initB();
        const ft = d.from && d.to;
        return {
            title: L('', S('↔', 'w'), S('INIT')),
            rows: [
                [L('CO RTE', 'FROM/TO'), L(ft ? S('[          ]', 'c') : S(box(10), 'a'), ft ? S(`${d.from}/${d.to}`, 'c') : S(`${box(4)}/${box(4)}`, 'a'))],
                [L('ALTN/CO RTE', 'INIT '), L(S(ft ? '----/----------' : '----/----------', ft ? 'c' : 'w'), S('REQUEST*', 'a'))],
                [L('FLT NBR'), L(d.flt ? S(d.flt, 'c') : S(box(8), 'a'), S('IRS INIT>'))],
                [L('LAT', 'LONG'), L(S('----.-', 'w'), S('-----.--', 'w'))],
                [L('COST INDEX', 'WIND/TEMP'), L(d.ci !== null ? S(String(d.ci), 'c') : S(box(3), 'a'), S('>'))],
                [L('CRZ FL/TEMP', 'TROPO'), L(d.crz !== null ? S(`FL${pad(d.crz, 3)}/${Math.round(15 - d.crz * 0.198)}°`, 'c') : S(`${box(5)}/${box(3)}°`, 'a'), S('36090', 'c', true))]
            ],
            lsk: {
                R1: (sp) => {
                    if (!sp) return 'NOT ALLOWED';
                    const m = sp.match(/^([A-Z]{4})\/([A-Z]{4})$/);
                    if (!m) return 'FORMAT ERROR';
                    d.from = m[1]; d.to = m[2];
                },
                L1: setFree('coRte'),
                R2: () => 'NOT ALLOWED',
                L3: (sp) => {
                    if (!sp) return 'NOT ALLOWED';
                    if (!/^[A-Z0-9]{1,8}$/.test(sp)) return 'FORMAT ERROR';
                    d.flt = sp;
                },
                R3: () => 'NOT AVAILABLE',
                L5: (sp) => {
                    if (!sp) return 'NOT ALLOWED';
                    if (!/^\d{1,3}$/.test(sp)) return 'FORMAT ERROR';
                    d.ci = Number(sp);
                },
                R5: () => 'NOT AVAILABLE',
                L6: (sp) => {
                    if (!sp) return 'NOT ALLOWED';
                    const m = sp.match(/^(?:FL)?(\d{2,3})(?:\/-?\d+)?$/) || sp.match(/^(\d{4,5})$/);
                    if (!m) return 'FORMAT ERROR';
                    let fl = Number(m[1]);
                    if (fl >= 1000) fl = Math.round(fl / 100);
                    if (fl < 10 || fl > 398) return 'ENTRY OUT OF RANGE';
                    d.crz = fl;
                }
            },
            slewX: () => { M.sub = 1; }
        };
    };
    function fuelT() {
        const f = A.sys.state.fuel;
        return (f.L + f.C + f.R) / 1000;
    }
    function initB() {
        const fob = fuelT();
        const zfw = 58.0;
        const plan = api().plan();
        const dest = plan[plan.length - 1];
        const trip = Math.min(fob - 1.5, dest.cum / 450 * 2.5);
        const tripMin = Math.round(dest.cum / 450 * 60);
        const fmtT = (m) => pad(Math.floor(m / 60), 2) + pad(m % 60, 2);
        return {
            title: L('', S('↔'), S('INIT')),
            rows: [
                [L('TAXI', 'ZFW/ZFWCG'), L(S('0.2', 'c', true), S(`${zfw.toFixed(1)}/27.0`, 'c'))],
                [L('TRIP/TIME', 'BLOCK'), L(S(`${Math.max(0, trip).toFixed(1)}/${fmtT(tripMin)}`, 'g', true), S(fob.toFixed(1), 'c'))],
                [L('RTE RSV/%'), L(S('0.2/5.0', 'c', true), '')],
                [L('ALTN/TIME', 'TOW'), L(S('----/----', 'w', true), S((zfw + fob - 0.2).toFixed(1), 'g', true))],
                [L('FINAL/TIME', 'LW'), L(S('1.1/0030', 'c', true), S((zfw + fob - Math.max(0, trip)).toFixed(1), 'g', true))],
                [L('EXTRA/TIME', 'TRIP WIND'), L(S(`${Math.max(0, fob - trip - 1.5).toFixed(1)}/----`, 'g', true), S('HD000', 'c', true))]
            ],
            lsk: {},
            slewX: () => { M.sub = 0; }
        };
    }

    PAGES.FPLN = () => {
        const plan = api().plan();
        const items = plan.slice();
        const dest = plan[plan.length - 1];
        const list = items.map((p) => (p.type === 'disc' ? { kind: 'end', t: '---F-PLN DISCONTINUITY--' } : { kind: 'wpt', p }));
        list.push({ kind: 'end', t: '------END OF F-PLN------' });
        list.push({ kind: 'end', t: '-----NO ALTN F-PLN------' });
        const maxScroll = Math.max(0, list.length - 5);
        M.scroll = Math.max(0, Math.min(M.scroll, maxScroll));
        const rows = [];
        const lsk = {};
        for (let k = 0; k < 5; k++) {
            const it = list[M.scroll + k];
            if (!it) { rows.push(['', '']); continue; }
            if (it.kind === 'end') { rows.push(['', L('', '', S(it.t))]); continue; }
            const p = it.p;
            const col = p.type === 'to' || p.type === 'from' || p.type === 'dest' ? 'w' : 'g';
            const lab = p.type === 'from' ? L('') : L([S(`C${pad(p.brg, 3)}°`, 'g', true)], '', S(`${Math.round(p.legDist)}NM`, 'g', true));
            const time = p.eta ? S(p.eta, 'g', true) : S('');
            const spdAlt = p.type === 'from' ? '' : [S(`${p.spd}/`, 'g', true), S(p.alt.padStart(6, ' '), 'g', true)];
            rows.push([lab, L([S(p.n.padEnd(8, ' '), col), time], spdAlt)]);
            lsk['L' + (k + 1)] = (sp) => {
                if (sp) return 'NOT ALLOWED';
                if (p.idx >= 0 && p.type !== 'from') { M.dirPick = p.idx; go('DIR'); return; }
                return 'NOT ALLOWED';
            };
        }
        rows.push([L(S('DEST   TIME  DIST  EFOB', 'w', true)), L([S(dest.n.padEnd(7, ' '), 'w'), S(dest.eta.padEnd(6, ' '), 'g', true), S(String(Math.round(dest.cum)).padStart(4, ' ') + '  ', 'g', true), S(Math.max(0, fuelT() - dest.cum / 450 * 2.5).toFixed(1), 'g', true)])]);
        return {
            title: L(S(' FROM', 'w', true), S(M.d.flt || '', 'w', true)),
            rows,
            lsk,
            slewY: (d) => { M.scroll = Math.max(0, Math.min(maxScroll, M.scroll + d)); }
        };
    };

    PAGES.DIR = () => {
        const plan = api().plan().filter((p) => p.idx >= 0 && (p.type === 'to' || p.type === 'wpt'));
        const pick = M.dirPick !== undefined && M.dirPick !== null ? plan.find((p) => p.idx === M.dirPick) : null;
        const rows = [];
        rows.push([L('WAYPOINT', 'UTC   DIST'), L(pick ? S(pick.n, 'y') : S('[        ]', 'c'), pick ? S(`${pick.eta}  ${Math.round(pick.cum)}`, 'y', true) : '')]);
        const lsk = {
            L1: (sp) => {
                if (!sp) return 'NOT ALLOWED';
                const p = plan.find((q) => q.n === sp);
                if (!p) return 'NOT IN DATA BASE';
                M.dirPick = p.idx;
            }
        };
        for (let k = 0; k < 4; k++) {
            const p = plan[k];
            const rl = k === 1 ? 'RADIAL IN' : k === 2 ? 'RADIAL OUT' : '';
            const rv = k === 1 ? free('radIn', '[ ]°') : k === 2 ? free('radOut', '[ ]°') : '';
            rows.push([L(k === 0 ? 'F-PLN WPTS' : '', rl), L(p ? S('←' + p.n, 'c') : '', rv)]);
            if (p) lsk['L' + (k + 2)] = (sp) => { if (sp) return 'NOT ALLOWED'; M.dirPick = p.idx; };
        }
        lsk.R3 = setFree('radIn');
        lsk.R4 = setFree('radOut');
        if (pick) {
            rows.push([L(''), L(S('<ERASE', 'a'), S('INSERT*', 'a'))]);
            lsk.L6 = () => { M.dirPick = null; };
            lsk.R6 = () => { api().dirTo(pick.idx); M.dirPick = null; go('FPLN'); };
        } else rows.push(['', '']);
        return { title: L('', '', S('DIR TO')), rows, lsk };
    };

    PAGES.PROG = () => {
        const ph = api().phase();
        const d = M.d;
        const plan = api().plan();
        const to = plan.find((p) => p.type === 'to') || plan[plan.length - 1];
        const gw = 58 + fuelT();
        const opt = Math.min(390, Math.round((392 - (gw - 60) * 2.2) / 10) * 10);
        const app = ph === 'APPR';
        const titleName = { PREFLIGHT: 'PREFLIGHT', 'TAKE OFF': 'TAKE OFF', CLB: 'CLB', CRZ: 'CRZ', DES: 'DES', APPR: 'APPR', 'GO AROUND': 'GO AROUND', DONE: 'DONE' }[ph] || ph;
        return {
            title: L(S(titleName, 'g'), S(d.flt || '', 'w')),
            rows: [
                [L('CRZ', 'REC MAX', 'OPT'), L(S(d.crz !== null ? 'FL' + pad(d.crz, 3) : '-----', 'c'), S('FL398', 'm'), S('FL' + pad(opt, 3), 'g'))],
                [L(''), L(S('<REPORT'), '')],
                [L('POSITION UPDATE AT'), L(S('*[      ]', 'c'), '')],
                [L(' BRG /DIST'), L([S(`${pad(to.brg, 3)}°/`, 'g'), S(`${to.dist.toFixed(1)}`.padStart(6, ' '), 'g'), S(' TO ', 'w'), S(to.n, 'g')])],
                [L('PREDICTIVE'), L(S('<GPS'), S('GPS PRIMARY', 'g'))],
                [L('REQUIRED', 'ESTIMATED', 'ACCUR'), L(S(app ? '0.30NM' : '2.00NM', 'c', true), S('0.05NM', 'g', true), S('HIGH', 'g', true))]
            ],
            lsk: { L2: () => 'NOT AVAILABLE', L3: setFree('posUpd'), L5: () => 'NOT AVAILABLE' }
        };
    };

    PAGES.PERF = () => {
        const name = M.perf || activePerf();
        const act = activePerf() === name;
        const tcol = act ? 'g' : 'w';
        const d = M.d;
        const fl = F();
        const prevNext = (ph) => {
            const i = phaseIdx(ph);
            return {
                L6: () => { if (i <= 0 || ph === 'GO AROUND') { if (ph === 'GO AROUND') M.perf = 'APPR'; else return 'NOT ALLOWED'; } else M.perf = ['TAKE OFF', 'CLB', 'CRZ', 'DES', 'APPR'][i - 1]; },
                R6: () => { if (i >= 4) { if (i === 4) M.perf = 'GO AROUND'; else return 'NOT ALLOWED'; } else M.perf = ['TAKE OFF', 'CLB', 'CRZ', 'DES', 'APPR'][i + 1]; }
            };
        };
        const vSp = (v) => (v !== null ? S(String(v), 'c') : S(box(3), 'a'));
        const vEntry = (key) => (sp) => {
            if (!sp) return 'NOT ALLOWED';
            if (sp === 'CLR') { d[key] = null; if (key === 'vr') api().setVR(null); return; }
            if (!/^\d{2,3}$/.test(sp)) return 'FORMAT ERROR';
            const v = Number(sp);
            if (v < 90 || v > 200) return 'ENTRY OUT OF RANGE';
            d[key] = v;
            if (key === 'vr') api().setVR(v);
            if (d.v1 && d.vr && d.v2 && !(d.v1 <= d.vr && d.vr <= d.v2)) say('V1/VR/V2 DISAGREE');
        };
        const mode = fl.spdMgd && !fl.spdPreset ? 'MANAGED' : 'SELECTED';
        if (name === 'TAKE OFF') {
            return {
                title: L('', '', S('TAKE OFF', tcol)),
                rows: [
                    [L('V1', 'RWY'), L(vSp(d.v1), S(api().runway().rwy, 'g'))],
                    [L('VR', 'TO SHIFT'), L(vSp(d.vr), free('toShift', '[M][    ]*'))],
                    [L('V2', 'FLAPS/THS'), L(vSp(d.v2), free('flaps', '[ ]/[    ]'))],
                    [L('TRANS ALT', 'FLEX TO TEMP'), L(S(d.trans, 'c', true), free('flex', '[ ]°'))],
                    [L('THR RED/ACC', 'ENG OUT ACC'), L(S('1500/1500', 'c', true), S('1500', 'c', true))],
                    [L('', 'NEXT '), L('', S('PHASE>'))]
                ],
                lsk: Object.assign({ L1: vEntry('v1'), L2: vEntry('vr'), L3: vEntry('v2'), R2: setFree('toShift'), R3: setFree('flaps'), R4: setFree('flex'), L4: (sp) => { if (!/^\d{3,5}$/.test(sp || '')) return sp ? 'FORMAT ERROR' : 'NOT ALLOWED'; d.trans = sp; } }, prevNext('TAKE OFF'))
            };
        }
        if (name === 'CLB' || name === 'CRZ' || name === 'DES') {
            const mgd = name === 'CLB' ? '250/.78' : name === 'CRZ' ? '.78' : '.78/300';
            const rows = [
                [L('ACT MODE'), L(S(mode, 'g'), '')],
                [L(' CI'), L(S(d.ci !== null ? String(d.ci) : '---', 'g'), '')],
                [L(' MANAGED'), L(S(mgd, 'g'), '')],
                [L(' PRESEL'), L(free('presel' + name, '*[ ]'), '')],
                name === 'CRZ' ? [L('', 'DES CABIN RATE'), L('', S('-350FT/MN', 'c', true))] : ['', ''],
                [L(' PREV', 'NEXT '), L(S('<PHASE'), S('PHASE>'))]
            ];
            return { title: L('', '', S(name, tcol)), rows, lsk: Object.assign({ L4: setFree('presel' + name) }, prevNext(name)) };
        }
        if (name === 'APPR') {
            const dh = api().getDH(), mda = api().getMDA();
            const wc = A.fcu.cfg;
            const ty = A.fcu.cfg.type === 'rnav' ? 'RNV' : 'ILS';
            return {
                title: L('', '', S('APPR', tcol)),
                rows: [
                    [L('QNH', 'FINAL'), L(S(d.qnh, 'c'), S(ty + api().runway().rwy, 'g'))],
                    [L('TEMP', 'MDA'), L(S(d.temp + '°', 'c', true), mda !== null ? S(String(mda), 'c') : S('[    ]', 'c'))],
                    [L('MAG WIND', 'DH'), L(S(`${pad(wc.windDir, 3)}°/${pad(wc.windSpd, 3)}`, 'c', true), dh === 'NO' ? S('NO', 'c') : dh !== null ? S(String(dh), 'c') : S('[    ]', 'c'))],
                    [L('TRANS FL', 'LDG CONF'), L(S('FL110', 'c', true), S('FULL', 'g'))],
                    [L('VAPP  VLS'), L([S(String(api().vapp()).padEnd(6, ' '), 'c', true), S('123', 'g', true)], S('*CONF3', 'c', true))],
                    [L(' PREV', 'NEXT '), L(S('<PHASE'), S('PHASE>'))]
                ],
                lsk: Object.assign({
                    L1: (sp) => { if (!/^\d{4}$/.test(sp || '')) return sp ? 'FORMAT ERROR' : 'NOT ALLOWED'; d.qnh = sp; },
                    L2: (sp) => { if (!/^-?\d{1,2}$/.test(sp || '')) return sp ? 'FORMAT ERROR' : 'NOT ALLOWED'; d.temp = sp; },
                    R2: (sp) => {
                        if (!sp) return 'NOT ALLOWED';
                        if (sp === 'CLR') { api().setMDA(null); return; }
                        if (!/^\d{1,5}$/.test(sp)) return 'FORMAT ERROR';
                        const v = Number(sp);
                        if (v > 5000 + F().elev) return 'ENTRY OUT OF RANGE';
                        api().setMDA(v);
                    },
                    R3: (sp) => {
                        if (!sp) return 'NOT ALLOWED';
                        if (sp === 'CLR') { api().setDH(null); return; }
                        if (sp === 'NO') { api().setDH('NO'); return; }
                        if (!/^\d{1,3}$/.test(sp)) return 'FORMAT ERROR';
                        const v = Number(sp);
                        if (v > 700) return 'ENTRY OUT OF RANGE';
                        api().setDH(v);
                    },
                    L3: () => 'NOT ALLOWED', R4: () => 'NOT ALLOWED'
                }, prevNext('APPR'))
            };
        }
        // GO AROUND
        return {
            title: L('', '', S('GO AROUND', tcol)),
            rows: [['', ''], ['', ''], ['', ''], ['', ''],
                [L('THR RED/ACC', 'ENG OUT ACC'), L(S('1500/1500', 'c', true), S('1500', 'c', true))],
                [L(' PREV'), L(S('<PHASE'), '')]],
            lsk: prevNext('GO AROUND')
        };
    };

    PAGES.RADNAV = () => {
        const ils = A.fcu.cfg.type === 'ils';
        const crs = ils ? S(pad(api().runway().hdg, 3), 'g') : free('lsCrs', '[ ]');
        return {
            title: L('', '', S('RADIO NAV')),
            rows: [
                [L('VOR1/FREQ', 'FREQ/VOR2'), L(free('vor1', '[  ]/[   . ]'), free('vor2', '[   . ]/[  ]'))],
                [L('CRS', 'CRS'), L(free('crs1', '[ ]'), free('crs2', '[ ]'))],
                [L('LS /FREQ'), L(free('ls', '[  ]/[   . ]'), '')],
                [L('CRS'), L(crs, '')],
                [L('ADF1/FREQ', 'FREQ/ADF2'), L(free('adf1', '[  ]/[   . ]'), free('adf2', '[   . ]/[  ]'))],
                ['', '']
            ],
            lsk: { L1: setFree('vor1'), R1: setFree('vor2'), L2: setFree('crs1'), R2: setFree('crs2'), L3: setFree('ls'), L4: ils ? () => 'NOT ALLOWED' : setFree('lsCrs'), L5: setFree('adf1'), R5: setFree('adf2') }
        };
    };

    PAGES.FUEL = () => {
        const plan = api().plan();
        const dest = plan[plan.length - 1];
        const fob = fuelT();
        const efob = Math.max(0, fob - dest.cum / 450 * 2.5);
        const gw = 58 + fob;
        return {
            title: L('', '', S('FUEL PRED')),
            rows: [
                [L(' AT', 'EFOB', 'UTC'), L(S(dest.n, 'w'), S(efob.toFixed(1), 'g'), S(dest.eta, 'g'))],
                [L(''), L(S('----', 'w'), S('----', 'w'), S('----', 'w'))],
                [L('RTE RSV/%', 'ZFW/ZFWCG'), L(S('0.2/5.0', 'c', true), S('58.0/27.0', 'c'))],
                [L('ALTN/TIME', 'FOB'), L(S('----/----', 'w', true), [S(fob.toFixed(1), 'g'), S('  FF+FQ', 'g', true)])],
                [L('FINAL/TIME', 'GW/CG'), L(S('1.1/0030', 'c', true), S(`${gw.toFixed(1)}/28.0`, 'g', true))],
                [L('MIN DEST FOB', 'EXTRA/TIME'), L(S('2.2', 'c', true), S(`${Math.max(0, efob - 2.2).toFixed(1)}/----`, 'g', true))]
            ],
            lsk: { R3: () => 'NOT ALLOWED' }
        };
    };

    PAGES.DATA = () => ({
        title: L('', '', S('DATA INDEX')),
        rows: [
            [L(' POSITION'), L(S('<MONITOR'), S('WAYPOINTS>'))],
            [L(' IRS'), L(S('<MONITOR'), S('NAVAIDS>'))],
            [L(' GPS'), L(S('<MONITOR'), S('RUNWAYS>'))],
            [L(''), L(S('<A/C STATUS'), S('ROUTES>'))],
            [L(' CLOSEST'), L(S('<AIRPORTS'), '')],
            [L(' EQUITIME'), L(S('<POINT'), '')]
        ],
        lsk: { L4: () => go('STATUS') }
    });
    PAGES.STATUS = () => ({
        title: L('', '', S('A320')),
        rows: [
            [L(' ENG'), L(S('SIMULATED', 'g'), '')],
            [L(' ACTIVE DATA BASE'), L(S('KOZ SIM DB', 'c'), S('AB1', 'g'))],
            [L(' SECOND DATA BASE'), L(S('NONE', 'c', true), '')],
            ['', ''],
            [L(' CHG CODE'), L(S('[  ]', 'c', true), '')],
            [L(' IDLE/PERF'), L(S('+0.0/+0.0', 'g', true), S('STATUS/XLOAD>'))]
        ],
        lsk: {}
    });
    PAGES.SEC = () => ({
        title: L('', '', S('SEC INDEX')),
        rows: [[L(''), L(S('<COPY ACTIVE'), '')], [L(''), L(S('<SEC F-PLN'), '')], [L(''), L(S('<DELETE SEC'), '')], ['', ''], ['', ''], ['', '']],
        lsk: { L1: () => 'NOT AVAILABLE', L2: () => 'NOT AVAILABLE', L3: () => 'NOT AVAILABLE' }
    });
    PAGES.ATC = () => ({
        title: L('', '', S('ATC MENU')),
        rows: [[L(''), L(S('<LAT REQ'), S('VERT REQ>'))], [L(''), L(S('<WHEN CAN WE'), S('OTHER REQ>'))], [L(''), L(S('<TEXT'), S('REPORTS>'))], ['', ''], ['', ''], [L(''), L(S('<RETURN'), S('CONNECTION>'))]],
        lsk: { L6: () => go('MENU') }
    });

    // ---------- 按鍵 ----------
    function go(page) {
        if (page !== M.page) { M.last = M.page; M.scroll = 0; M.sub = 0; }
        if (page === 'PERF') M.perf = null;
        M.page = page;
    }
    const FUNC = {
        DIR: 'DIR', PROG: 'PROG', PERF: 'PERF', INIT: 'INIT', DATA: 'DATA', 'F-PLN': 'FPLN', 'RAD NAV': 'RADNAV',
        'FUEL PRED': 'FUEL', 'SEC F-PLN': 'SEC', 'ATC COMM': 'ATC', 'MCDU MENU': 'MENU'
    };
    let pageCache = null;
    function current() { pageCache = (PAGES[M.page] || PAGES.MENU)(); return pageCache; }

    function press(key) {
        if (!A.fcu.state.power) return;
        if (A.snd && A.snd.tick) A.snd.tick();
        if (FUNC[key]) {
            if (key === 'DIR') M.dirPick = null;
            go(FUNC[key]);
        } else if (key === 'AIRPORT') {
            go('FPLN');
            M.scroll = 99;
        } else if (/^[LR][1-6]$/.test(key)) {
            const pg = current();
            const fn = pg.lsk && pg.lsk[key];
            const sp = M.msg ? '' : M.sp.trim();
            if (!fn) { if (sp) say('NOT ALLOWED'); }
            else {
                const r = fn(sp);
                if (r) say(r);
                else if (sp) M.sp = '';
            }
        } else if (key === 'CLR') {
            if (M.msg) M.msg = '';
            else if (M.sp === 'CLR') M.sp = '';
            else if (M.sp) M.sp = M.sp.slice(0, -1);
            else M.sp = 'CLR';
        } else if (key === 'SLEW_UP' || key === 'SLEW_DN') {
            const pg = current();
            if (pg.slewY) pg.slewY(key === 'SLEW_UP' ? -1 : 1);
        } else if (key === 'SLEW_L' || key === 'SLEW_R') {
            const pg = current();
            if (pg.slewX) pg.slewX(key === 'SLEW_L' ? -1 : 1);
        } else if (key === 'BRT' || key === 'DIM') {
            M.bright = Math.max(0.45, Math.min(1.15, M.bright + (key === 'BRT' ? 0.1 : -0.1)));
            if (scr) scr.style.filter = `brightness(${M.bright})`;
        } else if (key === 'OVFY') {
            typeCh('Δ');
        } else if (key === '+/-') {
            if (M.msg) M.msg = '';
            if (/-$/.test(M.sp)) M.sp = M.sp.slice(0, -1) + '+';
            else if (/\+$/.test(M.sp)) M.sp = M.sp.slice(0, -1) + '-';
            else typeCh('-');
        } else if (key === 'SP') typeCh(' ');
        else typeCh(key);
        render(true);
    }
    function typeCh(c) {
        if (M.msg) M.msg = '';
        if (M.sp === 'CLR') M.sp = '';
        if (M.sp.length < 22) M.sp += c;
    }

    // ---------- 畫面 ----------
    let scr = null, lines = [], keysWrap = null;
    function place(cells, segs, start) {
        let col = start;
        segs.forEach((g) => {
            for (const ch of g.t) {
                if (col >= 0 && col < COLS) cells[col] = { ch, c: g.c, s: g.s };
                col++;
            }
        });
    }
    function lineCells(spec, small) {
        const cells = Array.from({ length: COLS }, () => ({ ch: ' ', c: 'w', s: small }));
        if (!spec) return cells;
        const len = (segs) => segs.reduce((n, g) => n + [...g.t].length, 0);
        const mark = (segs) => segs.map((g) => ({ t: g.t, c: g.c, s: small || g.s }));
        if (spec.center.length) place(cells, mark(spec.center), Math.floor((COLS - len(spec.center)) / 2));
        if (spec.left.length) place(cells, mark(spec.left), 0);
        if (spec.right.length) place(cells, mark(spec.right), COLS - len(spec.right));
        return cells;
    }
    const asL = (v) => (v && v.left ? v : L(v));

    function render(force) {
        if (!scr) return;
        const fl = A.fcu.state;
        const on = !!fl.power;
        scr.classList.toggle('off', !on);
        const all = [];
        if (on) {
            const pg = current();
            all.push(lineCells(asL(pg.title), false));
            for (let k = 0; k < 6; k++) {
                const r = pg.rows[k] || ['', ''];
                all.push(lineCells(asL(r[0]), true));
                all.push(lineCells(asL(r[1]), false));
            }
            const sp = M.msg ? L(S(M.msg, M.msg === 'V1/VR/V2 DISAGREE' ? 'a' : 'w')) : L(S(M.sp, 'w'));
            all.push(lineCells(sp, false));
        } else for (let k = 0; k < 14; k++) all.push(lineCells(null, false));
        all.forEach((cells, i) => {
            const key = cells.map((c) => c.ch + c.c + (c.s ? 1 : 0)).join('');
            if (!force && lines[i].key === key) return;
            lines[i].key = key;
            cells.forEach((c, j) => {
                const sp = lines[i].cells[j];
                if (c.ch === '□') { sp.textContent = ''; sp.className = 'mc-ch mc-a mc-box'; return; }
                sp.textContent = c.ch;
                sp.className = 'mc-ch mc-' + c.c + (c.s ? ' mc-s' : '');
            });
        });
        // 讀螢幕的人用：整頁文字
        const txt = all.map((cells) => cells.map((c) => c.ch).join('').trimEnd()).filter(Boolean).join('\n');
        if (scr.getAttribute('aria-label') !== txt) scr.setAttribute('aria-label', 'MCDU 螢幕：\n' + txt);
    }

    mcdu.build = function (host) {
        host.textContent = '';
        const unit = el('div', 'mc-unit');
        // 螢幕與兩側行選鍵
        const top = el('div', 'mc-top');
        scr = el('div', 'mc-scr');
        scr.setAttribute('role', 'img');
        lines = [];
        for (let i = 0; i < 14; i++) {
            const ln = el('div', 'mc-ln' + (i % 2 === 1 && i < 13 ? ' mc-lab' : ''));
            const cells = [];
            for (let j = 0; j < COLS; j++) { const c = el('span', 'mc-ch', ' '); ln.append(c); cells.push(c); }
            scr.append(ln);
            lines.push({ el: ln, cells, key: '' });
        }
        const lsk = (side) => {
            const col = el('div', 'mc-lsks mc-lsks-' + side);
            for (let k = 1; k <= 6; k++) {
                const b = el('button', 'mc-lsk');
                b.type = 'button';
                const id = (side === 'l' ? 'L' : 'R') + k;
                b.dataset.k = id;
                b.setAttribute('aria-label', `行選鍵 ${id}`);
                b.addEventListener('click', () => press(id));
                col.append(b);
            }
            return col;
        };
        top.append(lsk('l'), scr, lsk('r'));
        const ann = el('div', 'mc-ann');
        ['FAIL', 'FM1', 'IND', 'RDY', 'FM2', 'FAIL'].forEach((t) => ann.append(el('span', '', t)));
        // 鍵盤
        keysWrap = el('div', 'mc-keys');
        const fn = el('div', 'mc-fn');
        const fkeys = [['DIR'], ['PROG'], ['PERF'], ['INIT'], ['DATA'], [''], ['BRT', 'mc-sm'],
            ['F-PLN'], ['RAD NAV'], ['FUEL PRED'], ['SEC F-PLN'], ['ATC COMM'], ['MCDU MENU'], ['DIM', 'mc-sm'],
            ['AIRPORT'], [''], ['', 'mc-gap'], ['', 'mc-gap'], ['', 'mc-gap'], ['', 'mc-gap'], ['', 'mc-gap']];
        fkeys.forEach(([t, cls]) => {
            const b = el('button', 'mc-k mc-f' + (cls ? ' ' + cls : '') + (t ? '' : ' mc-blank'), t);
            b.type = 'button';
            if (t) { b.dataset.k = t; b.addEventListener('click', () => press(t)); } else { b.disabled = true; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); }
            fn.append(b);
        });
        const lower = el('div', 'mc-lower');
        const left = el('div', 'mc-left');
        [['←', 'SLEW_L', '換頁（往左）'], ['↑', 'SLEW_UP', '往上捲'], [''], ['→', 'SLEW_R', '換頁（往右）'], ['↓', 'SLEW_DN', '往下捲'], [''],
            ['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8'], ['9'], ['.'], ['0'], ['+/-']].forEach(([t, k, lab]) => {
            if (!t) { left.append(el('span', 'mc-k mc-blank')); return; }
            const b = el('button', 'mc-k mc-n' + (k ? ' mc-arrow' : ''), t);
            b.type = 'button';
            b.dataset.k = k || t;
            if (lab) b.setAttribute('aria-label', lab);
            b.addEventListener('click', () => press(k || t));
            left.append(b);
        });
        const alpha = el('div', 'mc-alpha');
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['/', 'SP', 'OVFY', 'CLR']).forEach((t) => {
            const b = el('button', 'mc-k mc-a-k' + (t.length > 1 ? ' mc-sm' : ''), t === 'OVFY' ? 'OVFY' : t);
            b.type = 'button';
            b.dataset.k = t;
            b.addEventListener('click', () => press(t));
            alpha.append(b);
        });
        lower.append(left, alpha);
        keysWrap.append(fn, lower);
        unit.append(top, ann, keysWrap);
        host.append(unit);
        // 實體鍵盤：游標在 MCDU 上時可以直接打字
        unit.tabIndex = 0;
        unit.setAttribute('aria-label', 'MCDU。可以直接用鍵盤輸入字母和數字，Backspace 是 CLR。');
        unit.addEventListener('keydown', (e) => {
            if (e.target !== unit) return;
            const k = e.key.toUpperCase();
            if (/^[A-Z0-9./]$/.test(k)) { e.preventDefault(); press(k); }
            else if (k === ' ') { e.preventDefault(); press('SP'); }
            else if (k === 'BACKSPACE' || k === 'DELETE') { e.preventDefault(); press('CLR'); }
            else if (k === '-' || k === '+') { e.preventDefault(); press('+/-'); }
            else if (k === 'ARROWUP') { e.preventDefault(); press('SLEW_UP'); }
            else if (k === 'ARROWDOWN') { e.preventDefault(); press('SLEW_DN'); }
            else if (k === 'ARROWLEFT') { e.preventDefault(); press('SLEW_L'); }
            else if (k === 'ARROWRIGHT') { e.preventDefault(); press('SLEW_R'); }
        });
        render(true);
    };

    mcdu.reset = function (scn) {
        fmsDefaults(scn);
        M.sp = ''; M.msg = ''; M.scroll = 0; M.sub = 0; M.perf = null; M.dirPick = null;
        M.page = scn === 'cold' ? 'MENU' : 'FPLN';
        M.last = '';
        render(true);
    };
    mcdu.render = () => render(false);
    mcdu.press = press;
    mcdu.state = M;
})(window);
