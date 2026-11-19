// FCU（飛行控制單元）、簡化的飛行模型、PFD 精簡版、平面地圖。
// 座標：以「跑道座標」計算——跑道入口在原點，跑道沿 +x 延伸 1.5 海里，內部航向 090。
// 選別的跑道時，只是把顯示的航向和地圖轉 (跑道航向 − 90) 度；機場標高加在高度上。
// 這是教學示意：風在各高度都一樣、沒有風切，沒有襟翼和起落架的細節，物理量都是簡化的。
(function (root) {
    'use strict';

    const A = root.A320;
    const U = A.ui;
    const el = U.el, svgEl = U.svgEl;
    const fcu = A.fcu = {};
    const F = fcu.state = {};

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const approach = (v, to, rate, dt) => (v < to ? Math.min(to, v + rate * dt) : Math.max(to, v - rate * dt));
    const wrap180 = (d) => ((d + 540) % 360) - 180;
    const wrap360 = (d) => ((d % 360) + 360) % 360;
    const D2R = Math.PI / 180;
    const R2D = 180 / Math.PI;
    const pad = (n, w) => String(Math.round(n)).padStart(w, '0');
    const GP_TAN = Math.tan(3 * D2R);
    const LOC_ANT = 1.9;   // 航向台天線位置（跑道盡頭，海里）
    const RWY_HDG = 90;

    // ---------- 跑道、天氣、進場設定 ----------
    // 跑道方向和機場標高是近似值，只用來示意，不能拿來導航。
    const RUNWAYS = [
        { id: 'TRN09', name: '教學跑道 09', rwy: '09', hdg: 90, elev: 0 },
        { id: 'RCTP05L', name: '桃園 RCTP 05L', rwy: '05L', hdg: 53, elev: 106 },
        { id: 'RCTP23R', name: '桃園 RCTP 23R', rwy: '23R', hdg: 233, elev: 106 },
        { id: 'RCSS10', name: '松山 RCSS 10', rwy: '10', hdg: 97, elev: 18 },
        { id: 'RCKH09', name: '高雄 RCKH 09', rwy: '09', hdg: 91, elev: 31 },
        { id: 'VHHH07R', name: '香港 VHHH 07R', rwy: '07R', hdg: 73, elev: 28 },
        { id: 'RJTT34R', name: '羽田 RJTT 34R', rwy: '34R', hdg: 337, elev: 21 }
    ];
    // contact：在離地多高時看得到跑道燈（呎）
    const WX = {
        clear: { name: '晴天，能見度 10 公里以上', contact: 1e9 },
        low: { name: '低雲，雲底 300 呎', contact: 300 },
        rvr350: { name: '霧，跑道視程 350 公尺', contact: 110 },
        rvr200: { name: '濃霧，跑道視程 200 公尺', contact: 60 },
        rvr75: { name: '極濃霧，跑道視程 75 公尺', contact: 15 }
    };
    // 各種進場能力的最低高度（離地呎）。CAT 3 DUAL 沒有決斷高，100 呎是警戒高。
    const MINS = { 'CAT 1': 200, 'CAT 2': 100, 'CAT 3 SINGLE': 50, 'CAT 3 DUAL': 100, RNAV: 350 };
    const AUTOLAND = { cross: 20, tail: 10, head: 30 };   // 自動降落風限（節）
    const cfg = fcu.cfg = { rwy: 'TRN09', type: 'ils', wx: 'clear', windDir: 0, windSpd: 0, gust: 0, ilsFail: 'none' };
    fcu.RUNWAYS = RUNWAYS;
    fcu.WX = WX;
    const runway = () => RUNWAYS.find((r) => r.id === cfg.rwy) || RUNWAYS[0];
    const toReal = (h) => wrap360(h + (F.off || 0));
    const toInt = (h) => wrap360(h - (F.off || 0));
    const agl = () => F.alt - (F.elev || 0);
    const LAT_APP = ['LOC*', 'LOC', 'LAND', 'APP NAV'];
    const VERT_APP = ['G/S*', 'G/S', 'LAND', 'FLARE', 'FINAL'];
    const rnav = () => F.apprType === 'rnav';
    // 風：吹來的方向（真實航向）和風速 → 跑道座標下的風向量（節，x 向東、y 向北）
    function windVec() {
        const d = toInt(cfg.windDir) * D2R;
        return { x: -cfg.windSpd * Math.sin(d), y: -cfg.windSpd * Math.cos(d) };
    }
    fcu.windComp = function () {
        const w = windVec();
        return { head: Math.round(-w.x), cross: Math.round(Math.abs(w.y)), from: w.y < 0 ? '左' : '右' };
    };
    // 要飛某個地面航跡時應該對準的航向（扣掉側風造成的偏流）
    function headingForTrack(trk) {
        const tas = Math.max(60, tasFromIas(F.ias, F.alt));
        const w = windVec();
        const cross = w.x * Math.cos(trk * D2R) - w.y * Math.sin(trk * D2R);
        return wrap360(trk + Math.asin(clamp(-cross / tas, -0.5, 0.5)) * R2D);
    }

    // ---------- 大氣 ----------
    function isa(alt) {
        const h = alt * 0.3048;
        let T, p;
        if (h <= 11000) { T = 288.15 - 0.0065 * h; p = Math.pow(T / 288.15, 5.2559); }
        else { T = 216.65; p = 0.22336 * Math.exp(-(h - 11000) / 6341.6); }
        return { T, sigma: p / (T / 288.15) };
    }
    const tasFromIas = (ias, alt) => ias / Math.sqrt(isa(alt).sigma);
    const speedOfSound = (alt) => 38.967 * Math.sqrt(isa(alt).T);
    const machOf = (ias, alt) => tasFromIas(ias, alt) / speedOfSound(alt);
    const iasFromMach = (m, alt) => m * speedOfSound(alt) * Math.sqrt(isa(alt).sigma);
    fcu.machOf = machOf;

    // ---------- 情境 ----------
    const ROUTES = {
        cruise: [{ x: 30, y: 20, n: 'ALPHA' }, { x: 90, y: 60, n: 'BRAVO' }, { x: 150, y: 60, n: 'CHARLIE' }],
        cold: [{ x: 22, y: 6, n: 'DEPAR' }, { x: 60, y: 40, n: 'ENRTE' }, { x: 110, y: 40, n: 'FINAL' }],
        ils: []
    };

    fcu.apply = function (name) {
        const base = {
            power: false, phase: 'GND', x: 0.05, y: 0, alt: 0, hdg: 90, ias: 0, vs: 0, bank: 0, pitch: 0,
            ap1: false, ap2: false, athr: false,
            spdMgd: false, spdSel: 220, spdPreset: false, machMode: false, machSel: 0.78,
            hdgMgd: false, hdgSel: 90, hdgPreset: false,
            altSel: 5000, altStep: 100, vsSel: 0, vsPreset: false,
            expedite: false, locArm: false, apprArm: false,
            lat: '', vert: '', holdAlt: 0, thrust: 0, apOffWarn: false, gearDown: false,
            route: (ROUTES[name] || []).map((w) => Object.assign({}, w)), wp: 0, trail: [], scenario: name,
            range: 40, touchdownMsg: '', dh: null, mda: null, vr: null, iasTr: 0, fdBank: 0, fdVs: 0,
            off: runway().hdg - 90, elev: runway().elev, apprType: cfg.type, ga: false, gaTrk: 90,
            locOK: true, gsOK: true, failAt: null, failWhat: '', minDone: false, hundredDone: false,
            handFly: false, noAutoland: false, windChk: false, gust: 0, gsKt: 0, vxKt: 0, vyKt: 0, trk: 90
        };
        Object.keys(F).forEach((k) => delete F[k]);
        Object.assign(F, base);
        if (name === 'cruise') {
            Object.assign(F, {
                phase: 'AIR', x: -40, y: 0, alt: 35000, hdg: 74, ap1: true, athr: true,
                spdMgd: true, hdgMgd: true, altSel: 35000, holdAlt: 35000, lat: 'NAV', vert: 'ALT', thrust: 0.78, range: 80
            });
            F.hdgSel = Math.round(toReal(74));
            F.ias = iasFromMach(0.78, 35000);
        } else if (name === 'ils') {
            const a0 = Math.round((F.elev + 3000) / 100) * 100;
            Object.assign(F, {
                phase: 'AIR', x: -14, y: -2.5, alt: a0, hdg: 60, ias: 180, ap1: true, athr: true, spdMgd: true,
                spdSel: 180, altSel: a0, holdAlt: a0, lat: 'HDG', vert: 'ALT', thrust: 0.45, range: 20
            });
            F.hdgSel = Math.round(toReal(60)) || 360;
            const rw = runway().rwy;
            F.route = [{ x: -11, y: 0, n: 'CF' + rw }, { x: -6, y: 0, n: 'FF' + rw }];
        } else {
            F.range = 10;
            F.alt = F.elev;
            F.hdgSel = Math.round(toReal(90)) || 360;
            F.altSel = Math.round((F.elev + 5000) / 100) * 100;
        }
        setupFailure();
        if (fcu.syncEfis) fcu.syncEfis();
        F.power = A.sys.power();
        F.trail = [];
        fcu.invalidate();
    };

    // ---------- 速度目標 ----------
    function managedIas() {
        if (F.apprArm || LAT_APP.includes(F.lat) || F.handFly) {
            const h = agl();
            if (h < 1000) return 135;
            if (h < 4000) return 135 + ((h - 1000) / 3000) * 55;
            return 190;
        }
        if (F.vert === 'SRS') return 150;
        if (F.alt < 10000) return 250;
        return Math.min(280, iasFromMach(0.78, F.alt));
    }
    function usingMach() {
        if (F.spdMgd) return F.alt >= 10000 && iasFromMach(0.78, F.alt) < 280;
        return F.machMode;
    }
    function targetIas() {
        if (F.vert === 'SRS') return 150;
        let t;
        if (F.spdMgd) t = managedIas();
        else t = F.machMode ? iasFromMach(F.machSel, F.alt) : F.spdSel;
        if (F.expedite && ['OP CLB', 'OP DES', 'CLB', 'DES'].includes(F.vert)) t = Math.min(300, iasFromMach(0.8, F.alt));
        const vmax = Math.min(340, iasFromMach(0.82, F.alt));
        return clamp(t, 125, vmax);
    }
    fcu.targetIas = targetIas;

    // ---------- 進場幾何 ----------
    const gpAlt = (x) => (F.elev || 0) + 50 + Math.max(0, -x) * 6076 * GP_TAN;
    const locDots = () => (Math.atan2(F.y, LOC_ANT - F.x) * R2D) / 1.25;
    const gsDots = () => {
        const dist = Math.max(0.3, -F.x + 0.1) * 6076;
        const ang = Math.atan2(gpAlt(F.x) - F.alt, dist) * R2D;
        return ang / 0.35;
    };
    const ilsValid = () => F.x > -26 && F.x < 1.5 && Math.abs(F.y) < 9;

    // ---------- 模式判斷 ----------
    const apOn = () => F.ap1 || F.ap2;

    function checkArmed() {
        // LOC（或 RNAV 的 APP NAV）截獲
        const latOK = rnav() || F.locOK;
        if (F.locArm && !LAT_APP.includes(F.lat) && latOK && ilsValid() && F.x < 0) {
            const lead = 0.3 + 18 * Math.abs(F.vyKt / 3600);
            if (Math.abs(F.y) < lead && Math.abs(wrap180(F.hdg - RWY_HDG)) < 75) {
                F.lat = rnav() ? 'APP NAV' : 'LOC*';
                F.locArm = false;
                F.hdgMgd = false;
                A.toast(rnav() ? 'APP NAV：沿 GPS 算出的最後進場航道飛。' : 'LOC*：截獲航向台');
            }
        }
        if (F.lat === 'LOC*' && Math.abs(F.y) < 0.12 && Math.abs(wrap180(F.trk - RWY_HDG)) < 10) F.lat = 'LOC';
        // G/S（或 RNAV 的 FINAL）截獲：只能由下往上
        if (F.apprArm && ['LOC*', 'LOC', 'APP NAV'].includes(F.lat) && !VERT_APP.includes(F.vert) && (rnav() || F.gsOK)) {
            const delta = F.alt - gpAlt(F.x);
            if (delta >= -35 && delta <= 110 && F.x < -0.5) {
                F.vert = rnav() ? 'FINAL' : 'G/S*';
                F.apprArm = false;
                A.toast(rnav() ? 'FINAL APP：沿 GPS 計算的 3° 下降路徑下降。' : 'G/S*：截獲下滑道');
            }
        }
        if (F.vert === 'G/S*' && Math.abs(F.alt - gpAlt(F.x)) < 20) F.vert = 'G/S';
        // LAND / FLARE（只有 ILS 可以自動降落）
        if ((F.vert === 'G/S' || F.vert === 'G/S*') && F.lat === 'LOC' && agl() < 400) { F.lat = 'LAND'; F.vert = 'LAND'; }
        if ((F.vert === 'LAND' || F.vert === 'G/S') && agl() < 40) F.vert = 'FLARE';
        // 高度截獲
        if (['OP CLB', 'OP DES', 'CLB', 'DES', 'V/S'].includes(F.vert)) {
            const err = F.altSel - F.alt;
            const toward = Math.abs(F.vs) > 50 && Math.sign(err) === Math.sign(F.vs);
            if (toward && Math.abs(err) <= Math.abs(F.vs) * 0.17 + 40) { F.vert = 'ALT*'; F.holdAlt = F.altSel; F.expedite = false; }
            else if (F.vert !== 'V/S' && Math.abs(err) > 60 && Math.sign(err) !== (F.vert === 'OP CLB' || F.vert === 'CLB' ? 1 : -1)) {
                F.vert = 'ALT'; F.holdAlt = Math.round(F.alt / 100) * 100; F.expedite = false;
                A.toast('目標高度在反方向，改成保持目前高度。');
            }
        }
        if (F.vert === 'ALT*' && Math.abs(F.holdAlt - F.alt) < 25 && Math.abs(F.vs) < 250) F.vert = 'ALT';
    }

    // ---------- 縱向／橫向指令 ----------
    function climbCap() { return Math.max(600, 3300 - F.alt * 0.055); }

    function vertCmd(tgt, gs) {
        switch (F.vert) {
            case 'SRS': return 2200;
            case 'ALT': return clamp((F.holdAlt - F.alt) * 3, -800, 800);
            case 'ALT*': return clamp((F.holdAlt - F.alt) * 3.2, -3500, 3500);
            case 'OP CLB': case 'CLB': {
                let c = climbCap() * clamp(1 - Math.max(0, tgt - F.ias) / 60 * 0.7, 0.3, 1);
                if (F.expedite) c *= 1.25;
                return c;
            }
            case 'OP DES': {
                let d = clamp(1800 + (F.ias - 250) * 8, 1200, 4500);
                if (F.expedite) d *= 1.4;
                return -d;
            }
            case 'DES': {
                let d = clamp(gs * 5.3, 1200, 3000);
                if (F.expedite) d *= 1.4;
                return -d;
            }
            case 'V/S': return F.vsSel;
            case 'G/S*': case 'G/S': case 'LAND': case 'FINAL': return pathCmd(gs);
            case 'FLARE': return flareCmd();
            default: return F.vs; // 沒有自動駕駛：維持目前的垂直速度
        }
    }

    function pathCmd(gs) {
        const err = F.alt - gpAlt(F.x);
        return -(gs * 5.3) - clamp(err * 2.5, -500, 500);
    }
    const flareCmd = () => -clamp(agl() * 6, 120, 700);

    function navBearing() {
        const r = F.route;
        if (!r.length || F.wp >= r.length) return F.hdg;
        const w = r[F.wp];
        const dx = w.x - F.x, dy = w.y - F.y;
        if (Math.hypot(dx, dy) < 1.6) {
            A.toast(`通過 ${w.n}`);
            F.wp++;
            return navBearing();
        }
        return wrap360(Math.atan2(dx, dy) * R2D);
    }

    const locHeading = () => headingForTrack(RWY_HDG + clamp(F.y * 25, -40, 40));

    function latCmd() {
        switch (F.lat) {
            case 'HDG': return toInt(F.hdgSel);
            case 'NAV': return headingForTrack(navBearing());
            case 'LOC*': case 'LOC': case 'LAND': case 'APP NAV': return locHeading();
            case 'GA TRK': return headingForTrack(F.gaTrk);
            case 'RWY': case 'ROLL OUT': return RWY_HDG;
            default: return F.hdg;
        }
    }

    // ---------- 自動駕駛開關 ----------
    function engageDefaults() {
        if (!F.lat) {
            if (F.hdgMgd && F.route.length && F.wp < F.route.length) F.lat = 'NAV';
            else { F.lat = 'HDG'; F.hdgSel = Math.round(toReal(F.hdg)) % 360 || 360; F.hdgMgd = false; F.hdgPreset = false; }
        }
        if (!F.vert) {
            if (Math.abs(F.vs) < 150) { F.vert = 'ALT'; F.holdAlt = Math.round(F.alt / 100) * 100; }
            else { F.vert = 'V/S'; F.vsSel = Math.round(F.vs / 100) * 100; }
        }
    }

    function disengageAll(warn) {
        F.ap1 = F.ap2 = false;
        F.lat = ''; F.vert = '';
        F.locArm = F.apprArm = false; F.expedite = false;
        if (warn && F.phase === 'AIR') F.apOffWarn = true;
    }

    function pressAP(n) {
        const key = 'ap' + n;
        if (!F.power) return;
        if (F[key]) {
            F[key] = false;
            if (!apOn()) { disengageAll(true); A.toast('AP 已斷開。飛機會維持目前的航向和垂直速度，不再自動修正。'); }
            fcu.invalidate();
            return;
        }
        if (F.phase !== 'AIR') { A.toast('AP 只能在空中接上：先按「起飛」。'); return; }
        if (A.sys.attOK() < 1) { A.toast('AP 接不上：沒有有效的姿態資料（ADIRS 還沒對準）。'); return; }
        if (!A.sys.flightCtlOK()) { A.toast('AP 接不上：FAC 或 ELAC 被關掉了（頂板 FLT CTL）。'); return; }
        F[key] = true;
        F.apOffWarn = false;
        if (F.vert !== 'SRS' && F.lat !== 'RWY') engageDefaults();
        fcu.invalidate();
    }

    function pressATHR() {
        if (!F.power) return;
        F.athr = !F.athr;
        A.toast(F.athr ? 'A/THR 接上：自動推力開始控制速度。' : 'A/THR 斷開：速度維持不變，不再自動調整推力。');
        fcu.invalidate();
    }

    function needAP(msg) {
        if (!F.power) return false;
        if (F.phase !== 'AIR') { A.toast('起飛之後才能用這個。'); return false; }
        if (!apOn()) { A.toast(msg || '先接上 AP1 或 AP2。'); return false; }
        return true;
    }

    function pressLOC() {
        if (!needAP('LOC 需要自動駕駛：先按 AP1。')) return;
        if (cfg.type === 'rnav' && !['LOC*', 'LOC'].includes(F.lat)) { A.toast('現在設定的是 RNAV（GPS）進場，沒有航向台：直接按 APPR。'); return; }
        if (F.lat === 'LOC*' || F.lat === 'LOC') {
            F.lat = 'HDG'; F.hdgSel = Math.round(toReal(F.hdg)) % 360 || 360; F.hdgMgd = false; F.apprArm = false;
            if (['G/S*', 'G/S'].includes(F.vert)) { F.vert = 'V/S'; F.vsSel = Math.round(F.vs / 100) * 100; }
        } else {
            F.locArm = !F.locArm;
            if (!F.locArm) F.apprArm = false;
        }
        fcu.invalidate();
    }

    function pressAPPR() {
        if (!needAP('APPR 需要自動駕駛：先按 AP1。')) return;
        if (['LAND', 'FLARE'].includes(F.vert)) { A.toast('已經在自動降落最後階段，不能取消 APPR：要中止就按「重飛」。'); return; }
        const engaged = ['LOC*', 'LOC', 'APP NAV'].includes(F.lat) || ['G/S*', 'G/S', 'FINAL'].includes(F.vert);
        if (F.apprArm || engaged) {
            F.apprArm = false;
            if (!engaged) F.locArm = false;
            else {
                F.lat = 'HDG'; F.hdgSel = Math.round(toReal(F.hdg)) % 360 || 360; F.hdgMgd = false;
                if (['G/S*', 'G/S', 'FINAL'].includes(F.vert)) { F.vert = 'V/S'; F.vsSel = Math.round(F.vs / 100) * 100; }
            }
        } else {
            F.apprType = cfg.type;
            F.apprArm = true;
            F.locArm = !['LOC*', 'LOC', 'APP NAV'].includes(F.lat);
            F.minDone = false; F.hundredDone = false; F.windChk = false; F.noAutoland = false;
            if (!rnav() && !F.locOK) A.toast('注意：航向台（LOC）沒有訊號，APPR 會一直等不到截獲。改用 RNAV（GPS）進場比較好。');
            else if (!rnav() && !F.gsOK) A.toast('注意：下滑道（G/S）沒有訊號，只會截獲 LOC，不會自動下降。');
        }
        fcu.invalidate();
    }

    function pressEXPED() {
        if (!needAP()) return;
        if (!['OP CLB', 'OP DES', 'CLB', 'DES'].includes(F.vert)) { A.toast('EXPED 只用在爬升或下降模式（CLB、DES、OP CLB、OP DES）。'); return; }
        F.expedite = !F.expedite;
        fcu.invalidate();
    }

    // ---------- 旋鈕 ----------
    const round100 = (v) => Math.round(v / 100) * 100;
    const k = {
        spdTurn(d) {
            if (!F.power) return;
            if (F.spdMgd) F.spdPreset = true;
            if (F.machMode) F.machSel = clamp(Math.round((F.machSel + d * 0.01) * 100) / 100, 0.1, 0.89);
            else F.spdSel = clamp(F.spdSel + d, 100, 350);
        },
        spdPush() { if (!F.power) return; F.spdMgd = true; F.spdPreset = false; },
        spdPull() {
            if (!F.power) return;
            if (F.spdMgd && !F.spdPreset) {
                if (F.machMode) F.machSel = Math.round(machOf(F.ias, F.alt) * 100) / 100;
                else F.spdSel = clamp(Math.round(F.ias), 100, 350);
            }
            F.spdMgd = false; F.spdPreset = false;
        },
        spdMach() {
            if (!F.power) return;
            F.machMode = !F.machMode;
            if (F.machMode) F.machSel = clamp(Math.round(machOf(F.ias || 150, F.alt) * 100) / 100, 0.1, 0.89);
            else F.spdSel = clamp(Math.round(F.ias || 150), 100, 350);
        },
        hdgTurn(d) { if (!F.power) return; F.hdgSel = wrap360(F.hdgSel + d); if (F.hdgMgd) F.hdgPreset = true; },
        hdgPush() {
            if (!F.power) return;
            F.hdgMgd = true; F.hdgPreset = false;
            if (F.phase === 'AIR' && apOn() && !LAT_APP.includes(F.lat) && F.lat !== 'GA TRK') {
                if (F.route.length && F.wp < F.route.length) { F.lat = 'NAV'; A.toast('NAV：沿著航線飛。'); }
                else { A.toast('這個情境沒有可飛的航線，維持目前航向。'); F.hdgMgd = false; }
            }
        },
        hdgPull() {
            if (!F.power) return;
            if (F.hdgMgd && !F.hdgPreset) F.hdgSel = Math.round(toReal(F.hdg)) % 360 || 360;
            F.hdgMgd = false; F.hdgPreset = false;
            if (F.phase === 'AIR' && apOn() && F.lat !== 'RWY') {
                if (['LOC*', 'LOC', 'APP NAV'].includes(F.lat)) { F.locArm = F.apprArm = false; if (['G/S*', 'G/S', 'FINAL'].includes(F.vert)) { F.vert = 'V/S'; F.vsSel = round100(F.vs); } }
                if (F.lat !== 'LAND') F.lat = 'HDG';
            }
        },
        altTurn(d) { if (!F.power) return; F.altSel = clamp(F.altSel + d * F.altStep, 100, 49000); },
        altRing() { if (!F.power) return; F.altStep = F.altStep === 100 ? 1000 : 100; },
        altGo(managed) {
            if (!F.power) return;
            if (!needAP('先接上 AP1，才能用高度旋鈕啟動爬升或下降。')) return;
            if (VERT_APP.includes(F.vert) || F.vert === 'SRS') return;
            const err = F.altSel - F.alt;
            F.expedite = false;
            if (Math.abs(err) <= 60) { F.vert = 'ALT'; F.holdAlt = F.altSel; return; }
            F.vert = err > 0 ? (managed ? 'CLB' : 'OP CLB') : (managed ? 'DES' : 'OP DES');
        },
        vsTurn(d) {
            if (!F.power) return;
            if (F.vert !== 'V/S' && !F.vsPreset) { F.vsSel = round100(F.vs); F.vsPreset = true; }
            F.vsSel = clamp(F.vsSel + d * 100, -6000, 6000);
        },
        vsPull() {
            if (!F.power || !needAP('先接上 AP1，才能用 V/S。')) return;
            if (VERT_APP.includes(F.vert) || F.vert === 'SRS') return;
            if (!F.vsPreset) F.vsSel = round100(F.vs);
            F.vsPreset = false; F.expedite = false; F.vert = 'V/S';
        },
        vsPush() {
            if (!F.power || !needAP('先接上 AP1，才能用 V/S。')) return;
            if (VERT_APP.includes(F.vert) || F.vert === 'SRS') return;
            F.vsSel = 0; F.vsPreset = false; F.expedite = false; F.vert = 'V/S';
        }
    };
    fcu.act = k;

    // ---------- 起飛 ----------
    fcu.takeoff = function () {
        if (F.phase !== 'GND') { A.toast('飛機已經在空中或正在滑行。'); return; }
        if (!F.power) { A.toast('FCU 沒有電：先到頂板開電池。'); return; }
        if (A.sys.enginesRunning() < 2) { A.toast('兩具發動機都要在 AVAIL 才能起飛：先到頂板啟動發動機。'); return; }
        if (A.sys.attOK() < 1) { A.toast('ADIRS 還沒有姿態資料，等 ALIGN 燈熄滅。'); return; }
        F.phase = 'TO'; F.x = 0.05; F.y = 0; F.hdg = RWY_HDG; F.lat = 'RWY'; F.vert = 'SRS'; F.vs = 0; F.alt = F.elev;
        F.ga = false; F.minDone = false; F.handFly = false;
        F.touchdownMsg = '';
        F.athr = true;
        A.toast('起飛推力。到 150 節自動抬輪；離地後按 AP1，到 1500 呎會自動轉成爬升。');
        fcu.invalidate();
    };

    function land(vsAtTouch) {
        F.phase = 'ROLL';
        F.gearDown = true;
        const auto = F.lat === 'LAND' || F.vert === 'FLARE';
        F.alt = F.elev; F.vs = 0; F.bank = 0; F.pitch = 0;
        F.ap1 = F.ap2 = false; F.athr = false; F.handFly = false;
        F.lat = 'ROLL OUT'; F.vert = ''; F.locArm = F.apprArm = false; F.expedite = false;
        const wc = fcu.windComp();
        let msg = (vsAtTouch < -900 ? '重落地（下降率 ' : (auto ? '自動降落接地，下降率 ' : '接地，下降率 ')) + Math.round(-vsAtTouch) + ' 呎／分';
        if (wc.cross >= 5) msg += `，${wc.from}側風 ${wc.cross} 節`;
        if (wc.cross > 38) msg += '（超過 A320 示範過的最大側風 38 節）';
        else if (auto && wc.cross > AUTOLAND.cross) msg += `（超過自動降落側風限制 ${AUTOLAND.cross} 節）`;
        if (Math.abs(F.y) > 0.012) msg += `，偏離中心線約 ${Math.round(Math.abs(F.y) * 1852)} 公尺`;
        F.touchdownMsg = msg;
        A.toast(F.touchdownMsg + '。減速滑行中。');
        if (A.snd) A.snd.touch(vsAtTouch);
    }

    // ---------- 重飛 ----------
    fcu.goAround = function (why) {
        if (F.phase !== 'AIR') { A.toast('只有在空中才能重飛。'); return; }
        if (!F.power) return;
        if (A.sys.enginesRunning() === 0) { A.toast('沒有推力，沒辦法重飛。'); return; }
        F.ga = true;
        F.handFly = false;
        F.minDone = true;
        F.gaTrk = F.trk;
        F.vert = 'SRS';
        F.lat = 'GA TRK';
        F.locArm = F.apprArm = false; F.expedite = false;
        F.athr = true;
        F.hdgMgd = false; F.hdgSel = Math.round(toReal(F.hdg)) % 360 || 360;
        F.spdMgd = true; F.spdPreset = false;
        const maa = Math.round((F.elev + 3000) / 100) * 100;
        if (F.altSel <= F.alt + 300) F.altSel = Math.max(maa, Math.ceil((F.alt + 1000) / 100) * 100);
        F.gaCount = (F.gaCount || 0) + 1;
        A.toast(why || `GO AROUND：推力推到 TOGA，SRS 拉起、收起落架，沿目前航跡爬升，目標 ${F.altSel} 呎。`);
        fcu.invalidate();
    };

    // ---------- ILS 故障 ----------
    function setupFailure() {
        F.locOK = cfg.ilsFail !== 'loc';
        F.gsOK = cfg.ilsFail !== 'gs';
        F.failAt = cfg.ilsFail === 'random' ? F.elev + 500 + Math.random() * 1300 : null;
        F.failWhat = Math.random() < 0.5 ? 'loc' : 'gs';
    }
    fcu.setCfg = function (key, val) {
        cfg[key] = val;
        if (key === 'ilsFail') {
            const wasLoc = F.locOK, wasGs = F.gsOK;
            setupFailure();
            if (wasLoc && !F.locOK) loseSignal('loc');
            if (wasGs && !F.gsOK) loseSignal('gs');
        }
        fcu.invalidate();
    };
    function loseSignal(what) {
        if (what === 'loc') F.locOK = false; else F.gsOK = false;
        if (rnav()) return;
        const inApp = F.phase === 'AIR' && (F.apprArm || F.locArm || LAT_APP.includes(F.lat) || VERT_APP.includes(F.vert));
        if (!inApp) { A.toast(what === 'loc' ? '航向台（LOC）訊號失效。' : '下滑道（G/S）訊號失效。'); return; }
        const low = agl() < 1000;
        if (what === 'loc') {
            if (['LOC*', 'LOC', 'LAND'].includes(F.lat)) { F.lat = 'HDG'; F.hdgSel = Math.round(toReal(F.hdg)) % 360 || 360; F.hdgMgd = false; }
            F.locArm = false;
        }
        if (['G/S*', 'G/S', 'LAND', 'FLARE'].includes(F.vert)) { F.vert = 'V/S'; F.vsSel = round100(F.vs); }
        if (F.lat === 'LAND') F.lat = 'LOC';
        F.apprArm = false;
        if (low && apOn()) {
            fcu.goAround(`${what === 'loc' ? 'LOC' : 'G/S'} 訊號失效，已經低於 1000 呎，進場不再穩定：GO AROUND。`);
            return;
        }
        A.toast(what === 'loc'
            ? 'LOC 訊號失效：PFD 出現紅色 LOC 旗標，模式退回 HDG 和 V/S。按「重飛」，或把進場方式改成 RNAV（GPS）再按 APPR。'
            : 'G/S 訊號失效：PFD 出現紅色 G/S 旗標，垂直模式退回 V/S。按「重飛」，或改成 RNAV（GPS）再按 APPR。');
    }
    function checkFailure() {
        if (F.failAt === null || F.apprType !== 'ils' || !(LAT_APP.includes(F.lat) || VERT_APP.includes(F.vert))) return;
        if (F.alt <= F.failAt && F.vs < 0) { F.failAt = null; loseSignal(F.failWhat); }
    }

    // ---------- 進場能力（CAT）與最低高度 ----------
    // 簡化規則：CAT 3 DUAL 要雙 AP、A/THR、雙發、三套液壓、兩台 ELAC 和 FAC、兩條 AC 匯流排；
    // CAT 3 SINGLE 要單 AP、A/THR、雙發、至少兩套液壓；只剩 AP 就是 CAT 2；沒有 AP 是 CAT 1。
    function capability() {
        if (!(F.apprArm || LAT_APP.includes(F.lat) || VERT_APP.includes(F.vert))) return '';
        if (rnav()) return 'RNAV';
        if (!F.locOK || !F.gsOK) return '';
        if (!apOn()) return 'CAT 1';
        const s = A.sys.state;
        const pb = s.pb;
        const hyd = [s.hyd.g, s.hyd.b, s.hyd.y].filter((v) => v > 1500).length;
        const eng = A.sys.enginesRunning();
        const elac = (pb.elac1 ? 1 : 0) + (pb.elac2 ? 1 : 0);
        const fac = (pb.fac1 ? 1 : 0) + (pb.fac2 ? 1 : 0);
        const ac = (s.buses.ac1 ? 1 : 0) + (s.buses.ac2 ? 1 : 0);
        if (F.ap1 && F.ap2 && F.athr && eng === 2 && hyd === 3 && elac === 2 && fac === 2 && ac === 2) return 'CAT 3 DUAL';
        if (F.athr && eng === 2 && hyd >= 2 && elac >= 1 && fac >= 1) return 'CAT 3 SINGLE';
        if (elac >= 1 && fac >= 1) return 'CAT 2';
        return 'CAT 1';
    }
    fcu.capability = capability;
    // 最低高度（離地呎）：MCDU PERF APPR 輸入的 DH／MDA 優先
    function minFor(cap) {
        if (!cap) return null;
        if (cap === 'RNAV') return F.mda !== null ? Math.max(0, F.mda - F.elev) : MINS.RNAV;
        if (cap === 'CAT 3 DUAL') return typeof F.dh === 'number' ? F.dh : MINS[cap];
        return typeof F.dh === 'number' ? Math.max(F.dh, MINS[cap]) : MINS[cap];
    }
    fcu.minimum = () => minFor(capability());

    function checkMinimums() {
        const active = LAT_APP.includes(F.lat) || VERT_APP.includes(F.vert);
        if (F.phase !== 'AIR' || F.minDone || F.ga || !active || F.vs >= 0) return;
        const h = agl();
        const cap = capability();
        // 1000 呎：自動降落風限檢查
        if (!F.windChk && h < 1000 && !rnav()) {
            F.windChk = true;
            const wc = fcu.windComp();
            const over = wc.cross > AUTOLAND.cross ? `側風 ${wc.cross} 節（上限 ${AUTOLAND.cross}）`
                : wc.head < -AUTOLAND.tail ? `順風 ${-wc.head} 節（上限 ${AUTOLAND.tail}）`
                    : wc.head > AUTOLAND.head ? `逆風 ${wc.head} 節（上限 ${AUTOLAND.head}）` : '';
            if (over) {
                F.noAutoland = true;
                A.toast(`1000 呎：${over}，超過自動降落限制。到最低高度時 AP 會斷開改手動落地，看不到跑道就重飛。`);
            }
        }
        if (!cap) return;
        const m = minFor(cap);
        const noDh = cap === 'CAT 3 DUAL' && typeof F.dh !== 'number';
        if (!F.hundredDone && h <= m + 100 && !noDh) { F.hundredDone = true; A.toast('HUNDRED ABOVE：再一百呎到最低高度。'); }
        if (h > m) return;
        F.minDone = true;
        const w = WX[cfg.wx] || WX.clear;
        const see = noDh || w.contact >= m;
        if (!see) {
            fcu.goAround(`MINIMUM：${cap === 'RNAV' ? `RNAV 最低高度 ${m} 呎（離地）` : `${cap}，決斷高 ${m} 呎`}，${w.name}，看不到跑道。GO AROUND。`);
            return;
        }
        if (cap === 'RNAV' || F.noAutoland) {
            disengageAll(false);
            F.handFly = true;
            A.toast(cap === 'RNAV'
                ? 'MINIMUM：看到跑道了。RNAV 進場不能自動降落，AP 斷開，機長目視手動落地（模擬）。'
                : 'MINIMUM：看到跑道。風超過自動降落限制，AP 斷開，機長手動落地（模擬）。');
            return;
        }
        A.toast(noDh ? 'ALERT HEIGHT 100 呎：雙自動駕駛正常，NO DH，繼續自動降落。' : `MINIMUM：看到跑道燈，繼續自動降落（${cap}，決斷高 ${m} 呎）。`);
    }

    // ---------- 飛行模型 ----------
    fcu.step = function (dt) {
        F.power = A.sys.power();
        if (!F.power && apOn()) disengageAll(true);
        if (F.phase === 'GND') { F.thrust = approach(F.thrust, 0, 1, dt); F.ias = 0; return; }

        const engines = A.sys.enginesRunning();
        if (F.phase === 'TO') {
            F.thrust = approach(F.thrust, 1, 0.6, dt);
            F.ias += 5.5 * dt;
            const v = tasFromIas(F.ias, 0);
            F.x += (Math.max(0, v + windVec().x) / 3600) * dt;
            if (F.ias >= (F.vr || 150)) { F.phase = 'AIR'; F.alt = F.elev + 1; F.gearDown = true; A.toast('V1、抬輪。'); }
            return;
        }
        if (F.phase === 'ROLL') {
            F.ias = Math.max(0, F.ias - 2.8 * dt);
            F.thrust = approach(F.thrust, 0, 0.5, dt);
            F.hdg += wrap180(RWY_HDG - F.hdg) * Math.min(1, dt * 1.5);
            F.y += (0 - F.y) * Math.min(1, dt * 0.6);
            F.x += (F.ias / 3600) * dt;
            if (F.ias < 3) { F.phase = 'GND'; F.ias = 0; F.lat = ''; F.gearDown = true; A.toast('已停止。可以再按「起飛」，或換一個情境。'); }
            return;
        }

        // ---- 空中 ----
        if (apOn() && A.sys.attOK() < 1) { disengageAll(true); A.toast('AP 斷開：姿態資料消失。'); }
        checkArmed();
        checkFailure();
        checkMinimums();
        if (F.phase !== 'AIR') return;

        // SRS 到離地 1500 呎後轉成爬升（起飛或重飛）
        if (F.vert === 'SRS' && agl() >= 1500) {
            if (apOn()) {
                const wasGa = F.ga;
                F.lat = !wasGa && F.hdgMgd && F.route.length ? 'NAV' : 'HDG';
                if (F.lat === 'HDG') { F.hdgMgd = false; if (wasGa) F.hdgSel = Math.round(toReal(F.hdg)) % 360 || 360; }
                F.vert = F.altSel > F.alt + 100 ? (F.spdMgd ? 'CLB' : 'OP CLB') : 'ALT';
                if (F.vert === 'ALT') F.holdAlt = F.altSel;
                F.ga = false;
                A.toast(wasGa ? '離地 1500 呎：加速高度，推力收回 CLB，轉成爬升到 FCU 高度。可以用 HDG 繞回來，再按 APPR 重新進場。' : '1500 呎：轉成爬升模式。');
            } else if (!F.warnedAp) {
                F.warnedAp = true;
                A.toast('1500 呎了還沒接 AP：按 AP1，不然飛機只會維持目前的爬升率。');
                F.lat = ''; F.vert = ''; F.ga = false;
            }
        }
        if (!F.vert && !apOn()) F.warnedAp = false;

        // 陣風：指示空速隨機起伏，A/THR 會去修正
        if (cfg.gust > 0) {
            const g0 = F.gust;
            F.gust = clamp(F.gust + (-F.gust * 0.8 + (Math.random() * 2 - 1) * cfg.gust * 2.2) * dt, -cfg.gust, cfg.gust);
            F.ias += F.gust - g0;
        } else F.gust = 0;

        const tgt = targetIas();
        const tas = tasFromIas(F.ias, F.alt);
        const gs = Math.max(40, F.gsKt || tas);

        // 垂直速度
        const cmd = F.handFly ? (agl() < 40 ? flareCmd() : pathCmd(gs)) : vertCmd(tgt, gs);
        const manual = !apOn() && F.vert !== 'SRS' && !F.handFly;
        if (!manual || F.vert === 'SRS') F.vs += (cmd - F.vs) * Math.min(1, dt / 1.4);
        // 只剩一具發動機：爬升率受限，高度超過 FL205 就會慢慢飄降
        if (engines === 1) { if (F.alt >= 20450 && F.vs > -700) F.vs = -700; else F.vs = Math.min(F.vs, 900); }

        // 速度
        if (engines === 0) { F.athr = false; F.ias = Math.max(170, F.ias - 1.2 * dt); }
        else if (F.athr || F.vert === 'SRS') F.ias = approach(F.ias, tgt, F.ias < tgt ? 1.6 : 2.2, dt);

        // 推力（只是顯示用）
        let thr;
        if (F.vert === 'SRS') thr = 1;
        else if (!engines) thr = 0;
        else if (F.vert === 'OP CLB' || F.vert === 'CLB') thr = 0.95;
        else if (F.vert === 'OP DES' || F.vert === 'DES') thr = 0.04;
        else thr = clamp(0.62 + F.alt / 100000 * 0.35 + F.vs / 4000 * 0.25 + clamp((tgt - F.ias) / 40, -0.1, 0.2), 0.08, 0.97);
        F.thrust = approach(F.thrust, thr, 0.25, dt);
        if (F.vert === 'SRS' && F.alt > 1000) F.thrust = Math.min(F.thrust, 0.97);

        // 橫向
        const guided = apOn() || F.lat === 'RWY' || F.lat === 'GA TRK' || F.handFly;
        const hdgTarget = F.handFly ? locHeading() : guided ? latCmd() : F.hdg;
        const err = wrap180(hdgTarget - F.hdg);
        const V = tas * 0.5144;
        const bankMax = 25;
        const bankCmd = guided ? clamp(err * 1.1, -bankMax, bankMax) : 0;
        F.fdBank = bankCmd;
        F.fdVs = cmd;
        const ip = F.iasPrev === undefined ? F.ias : F.iasPrev;
        F.iasTr += ((F.ias - ip) / Math.max(dt, 1e-3) - F.iasTr) * Math.min(1, dt * 1.2);
        F.iasPrev = F.ias;
        F.bank += (bankCmd - F.bank) * Math.min(1, dt / 1.2);
        const turn = Math.min(3, Math.abs(9.81 * Math.tan(F.bank * D2R) / V) * R2D) * Math.sign(F.bank);
        F.hdg = wrap360(F.hdg + turn * dt);

        // 位置和高度
        const w = windVec();
        F.vxKt = tas * Math.sin(F.hdg * D2R) + w.x;
        F.vyKt = tas * Math.cos(F.hdg * D2R) + w.y;
        F.gsKt = Math.hypot(F.vxKt, F.vyKt);
        F.trk = wrap360(Math.atan2(F.vxKt, F.vyKt) * R2D);
        F.x += (F.vxKt / 3600) * dt;
        F.y += (F.vyKt / 3600) * dt;
        F.alt = clamp(F.alt + (F.vs / 60) * dt, F.elev, 41000);
        // 飛過的航點自動往下一個排（不管現在是不是 NAV 模式）
        if (F.wp < F.route.length && F.lat !== 'NAV') {
            const w = F.route[F.wp];
            const dx = w.x - F.x, dy = w.y - F.y;
            const ahead = dx * F.vxKt + dy * F.vyKt;
            if (Math.hypot(dx, dy) < 1.6 || (ahead < 0 && Math.hypot(dx, dy) < 8)) F.wp++;
        }

        // 姿態角（顯示用）
        const gamma = Math.atan2(F.vs, tas * 101.27) * R2D;
        const aoa = clamp(3 + (200 - F.ias) * 0.04, 1.5, 8);
        F.pitch = gamma + aoa;

        F.gearDown = agl() < 2300 && !(F.ga && F.vs > 300) && (LAT_APP.includes(F.lat) || VERT_APP.includes(F.vert) || F.vert === 'SRS' || F.handFly);

        if (F.alt <= F.elev && F.vs <= 0) { land(F.vs); return; }

        // 軌跡
        F.trailT = (F.trailT || 0) + dt;
        if (F.trailT >= 4) { F.trailT = 0; F.trail.push([F.x, F.y]); if (F.trail.length > 90) F.trail.shift(); }
    };

    // ---------- 說明文字 ----------
    function vertHelp() {
        const tgt = pad(F.altSel, 0);
        switch (F.vert) {
            case 'SRS': return F.ga ? `重飛 SRS：TOGA 推力，用俯仰維持速度爬升；離地 1500 呎轉成爬升到 ${tgt} 呎。` : '起飛中：SRS 用俯仰維持起飛速度（V2＋10 節），到 1500 呎轉成爬升。';
            case 'FINAL': return 'FINAL APP：RNAV（GPS）進場，沿電腦算出的 3° 路徑下降。最低高度 350 呎時要看到跑道，AP 會斷開改目視落地。';
            case 'ALT': return `ALT：保持 ${Math.round(F.holdAlt)} 呎。`;
            case 'ALT*': return `ALT*：正在平順地截獲 ${Math.round(F.holdAlt)} 呎。`;
            case 'OP CLB': return `OP CLB（開放爬升）：用爬升推力，靠俯仰維持速度，一路爬到 FCU 高度 ${tgt} 呎。`;
            case 'OP DES': return `OP DES（開放下降）：推力收到慢車，靠俯仰維持速度，一路下降到 FCU 高度 ${tgt} 呎。`;
            case 'CLB': return `CLB（管理爬升）：依飛行計畫的速度剖面爬升到 FCU 高度 ${tgt} 呎。`;
            case 'DES': return `DES（管理下降）：沿著電腦算出的約 3° 路徑下降到 FCU 高度 ${tgt} 呎。`;
            case 'V/S': return `V/S：維持 ${F.vsSel >= 0 ? '+' : ''}${F.vsSel} 呎／分。如果方向對，會自動截獲 FCU 高度 ${tgt} 呎。`;
            case 'G/S*': return 'G/S*：正在截獲下滑道。';
            case 'G/S': return 'G/S：沿著 3° 下滑道下降，速度由推力控制。';
            case 'LAND': return 'LAND：自動進場最後階段，AP 沿著航向台和下滑道飛。';
            case 'FLARE': return 'FLARE：拉平，把下降率收小再接地。';
            default:
                if (F.handFly) return '目視手動落地（模擬）：AP 已斷開，機長沿跑道中心線和 3° 路徑落地。';
                return apOn() || F.phase !== 'AIR' ? '' : 'AP 沒有接上：飛機維持目前的航向和垂直速度，不會自動修正。';
        }
    }
    function latHelp() {
        switch (F.lat) {
            case 'HDG': return `HDG：飛選定航向 ${pad(F.hdgSel, 3)}°。`;
            case 'NAV': return F.wp < F.route.length ? `NAV：沿航線飛向 ${F.route[F.wp].n}。` : 'NAV：航線結束，維持最後的航向。';
            case 'LOC*': return 'LOC*：正在截獲航向台中心線。';
            case 'LOC': return `LOC：沿著航向台中心線（${runway().name}，航向 ${pad(runway().hdg, 3)}）。`;
            case 'APP NAV': return `APP NAV：沿 GPS 最後進場航道（${runway().name}）。`;
            case 'GA TRK': return 'GA TRK：重飛時保持目前的地面航跡。';
            case 'LAND': return '';
            case 'RWY': return 'RWY：起飛滾行時保持跑道方向。';
            case 'ROLL OUT': return 'ROLL OUT：著陸滾行，沿跑道中心線減速。';
            default: return '';
        }
    }
    function modeHelp() {
        const a = [vertHelp(), latHelp()].filter(Boolean);
        if (F.athr && F.phase === 'AIR') {
            a.push(['OP CLB', 'CLB'].includes(F.vert) ? 'A/THR：THR CLB，推力固定在爬升推力。' : ['OP DES', 'DES'].includes(F.vert) ? 'A/THR：THR IDLE，推力在慢車。' : `A/THR：${usingMach() ? 'MACH' : 'SPEED'}，推力自動調整來維持目標速度。`);
        }
        if (F.phase === 'AIR') {
            const cap = capability();
            if (cap) {
                const w = WX[cfg.wx] || WX.clear;
                const mm = minFor(cap);
                a.push(cap === 'RNAV' ? `進場能力：RNAV（GPS），MDA ${Math.round(F.elev + mm)} 呎（離地 ${mm} 呎）。天氣：${w.name}。`
                    : `進場能力：${cap}，${cap === 'CAT 3 DUAL' && typeof F.dh !== 'number' ? 'NO DH（警戒高 100 呎）' : `決斷高 ${mm} 呎`}。天氣：${w.name}。`);
            }
            if (!F.locOK || !F.gsOK) a.push(`ILS 故障：${!F.locOK ? 'LOC' : ''}${!F.locOK && !F.gsOK ? '、' : ''}${!F.gsOK ? 'G/S' : ''} 沒有訊號。`);
        }
        if (F.touchdownMsg && F.phase !== 'AIR') a.unshift(F.touchdownMsg + '。');
        return a.join('\n');
    }

    // ---------- 畫面：FCU ----------
    let ui = null;
    let cache = {};
    fcu.invalidate = function () { cache = {}; };

    function winText(kind) {
        if (!F.power) return '';
        switch (kind) {
            case 'spd':
                if (F.spdMgd && !F.spdPreset) return '---';
                return F.machMode ? F.machSel.toFixed(2).replace(/^0/, '') : String(F.spdSel);
            case 'hdg': return F.hdgMgd && !F.hdgPreset ? '---' : pad(F.hdgSel, 3);
            case 'alt': return String(F.altSel);
            case 'vs':
                if (F.vert === 'V/S' || F.vsPreset) return (F.vsSel < 0 ? '-' : '+') + pad(Math.abs(F.vsSel), 4);
                return '-----';
        }
        return '';
    }

    function buildFCU(host) {
        host.textContent = '';
        const grp = (cls) => { const g = el('div', 'ck-fcu-grp ' + cls); host.append(g); return g; };
        const label = (g, spans) => {
            const r = el('div', 'ck-fcu-lab');
            const o = {};
            spans.forEach(([key, t]) => { const s = el('span', '', t); r.append(s); o[key] = s; });
            g.append(r);
            return o;
        };
        const win = (g, n, name) => {
            const w = el('div', 'ck-win');
            const d = U.seg7(n, name);
            const dot = el('i', 'ck-md');
            dot.setAttribute('aria-hidden', 'true');
            w.append(d.el, dot);
            g.append(w);
            return { d, dot };
        };
        ui = {};

        // SPD
        let g = grp('g-spd');
        ui.spdLab = label(g, [['spd', 'SPD'], ['mach', 'MACH']]);
        ui.spd = win(g, 3, '速度視窗');
        g.append(U.knob({ id: 'spd', label: 'SPD', onTurn: k.spdTurn, onPush: k.spdPush, onPull: k.spdPull, pushHelp: '管理速度', pullHelp: '選定速度' }).el);
        const sm = el('button', 'ck-fb ck-fb-wide', 'SPD／MACH');
        sm.type = 'button';
        sm.addEventListener('click', k.spdMach);
        g.append(sm);

        // HDG
        g = grp('g-hdg');
        ui.hdgLab = label(g, [['hdg', 'HDG'], ['trk', 'TRK']]);
        ui.hdg = win(g, 3, '航向視窗');
        g.append(U.knob({ id: 'hdg', label: 'HDG', onTurn: k.hdgTurn, onPush: k.hdgPush, onPull: k.hdgPull, pushHelp: '管理航向（NAV）', pullHelp: '選定航向（HDG）' }).el);

        // 中央按鈕
        g = grp('g-mid');
        ui.btn = {};
        const defs = [['loc', 'LOC', pressLOC], ['ap1', 'AP1', () => pressAP(1)], ['ap2', 'AP2', () => pressAP(2)],
            ['appr', 'APPR', pressAPPR], ['athr', 'A/THR', pressATHR], ['exped', 'EXPED', pressEXPED]];
        const grid = el('div', 'ck-fcu-btns');
        defs.forEach(([id, l, fn]) => { const b = U.fcuButton({ id, label: l }, fn); ui.btn[id] = b; grid.append(b.el); });
        g.append(grid);

        // ALT
        g = grp('g-alt');
        ui.altLab = label(g, [['alt', 'ALT'], ['step', '100']]);
        ui.alt = win(g, 5, '高度視窗');
        const altK = U.knob({ id: 'alt', label: 'ALT', ring: true, onTurn: k.altTurn, onPush: () => k.altGo(true), onPull: () => k.altGo(false), onRing: k.altRing, pushHelp: '管理爬升／下降', pullHelp: '開放爬升／下降' });
        g.append(altK.el);
        ui.altStep = el('p', 'ck-note caption-5', '外圈：點一下切換 100／1000 呎');
        g.append(ui.altStep);

        // V/S
        g = grp('g-vs');
        ui.vsLab = label(g, [['vs', 'V/S'], ['fpa', 'FPA']]);
        ui.vs = win(g, 5, '垂直速度視窗');
        g.append(U.knob({ id: 'vs', label: 'V/S', onTurn: k.vsTurn, onPush: k.vsPush, onPull: k.vsPull, pushHelp: '垂直速度歸零', pullHelp: '啟動 V/S' }).el);
    }

    function renderPanel() {
        if (!ui) return;
        const set = (key, val, fn) => { if (cache[key] !== val) { cache[key] = val; fn(val); } };
        set('spd', winText('spd'), (t) => ui.spd.d.set(t));
        set('hdg', winText('hdg'), (t) => ui.hdg.d.set(t));
        set('alt', winText('alt'), (t) => ui.alt.d.set(t));
        set('vs', winText('vs'), (t) => ui.vs.d.set(t));
        set('spdDot', F.power && F.spdMgd, (v) => ui.spd.dot.classList.toggle('on', v));
        set('hdgDot', F.power && F.hdgMgd, (v) => ui.hdg.dot.classList.toggle('on', v));
        set('mach', F.power && F.machMode, (v) => { ui.spdLab.mach.classList.toggle('on', v); ui.spdLab.spd.classList.toggle('on', !v && F.power); });
        set('step', F.altStep, (v) => { ui.altLab.step.textContent = String(v); });
        const lit = {
            ap1: F.power && F.ap1, ap2: F.power && F.ap2, athr: F.power && F.athr,
            loc: F.power && !rnav() && (F.locArm || F.lat === 'LOC*' || F.lat === 'LOC' || F.lat === 'LAND'),
            appr: F.power && (F.apprArm || VERT_APP.includes(F.vert) || (rnav() && F.lat === 'APP NAV')),
            exped: F.power && F.expedite
        };
        for (const id in lit) set('b' + id, lit[id], (v) => ui.btn[id].set(v));
    }

    // ---------- 畫面：FMA ----------
    let fmaEls = null;
    function buildFMA(host) {
        host.textContent = '';
        fmaEls = [];
        for (let i = 0; i < 5; i++) {
            const c = el('div', 'ck-fma-c');
            const a = el('p', 'ck-fma-l1');
            const b = el('p', 'ck-fma-l2');
            c.append(a, b);
            host.append(c);
            fmaEls.push([a, b]);
        }
    }
    function fmaSet(i, l1, c1, l2, c2) {
        const [a, b] = fmaEls[i];
        const key = 'fma' + i;
        const v = [l1, c1, l2, c2].join('|');
        if (cache[key] === v) return;
        cache[key] = v;
        a.textContent = l1 || ' '; a.dataset.c = c1 || '';
        b.textContent = l2 || ' '; b.dataset.c = c2 || '';
    }
    function renderFMA() {
        if (!fmaEls) return;
        if (!F.power) { for (let i = 0; i < 5; i++) fmaSet(i, '', '', '', ''); return; }
        // 推力
        let thr = '';
        if (F.phase === 'TO' || (F.ga && F.vert === 'SRS')) thr = 'MAN TOGA';
        else if (F.athr && F.phase === 'AIR') thr = ['OP CLB', 'CLB'].includes(F.vert) ? 'THR CLB' : ['OP DES', 'DES'].includes(F.vert) ? 'THR IDLE' : usingMach() ? 'MACH' : 'SPEED';
        fmaSet(0, thr, thr === 'MAN TOGA' ? 'w' : 'g', '', '');
        // 垂直
        let v1 = F.vert, armedV = '', armedC = 'b';
        if (F.expedite && v1) v1 += ' ·EXPED';
        const heading = ['OP CLB', 'OP DES', 'CLB', 'DES', 'V/S'].includes(F.vert) && Math.abs(F.vs) > 50 && Math.sign(F.altSel - F.alt) === Math.sign(F.vs);
        if (heading) armedV = 'ALT';
        if (F.apprArm && !VERT_APP.includes(F.vert)) { const g = rnav() ? 'FINAL' : 'G/S'; armedV = armedV ? armedV + ' ' + g : g; }
        let lat1 = F.lat;
        if (F.vert === 'FINAL' && F.lat === 'APP NAV') { v1 = 'FINAL APP'; lat1 = ''; }
        fmaSet(1, v1, 'g', armedV, armedC);
        // 橫向
        const l2 = F.locArm ? (rnav() ? 'APP NAV' : 'LOC') : '';
        fmaSet(2, lat1, 'g', l2, 'b');
        // 進場能力與最低高度
        const cap = capability();
        let c1 = '', c2 = '';
        const mm = minFor(cap);
        if (cap === 'CAT 3 DUAL') { c1 = 'CAT 3 DUAL'; c2 = typeof F.dh === 'number' ? 'DH ' + mm : 'NO DH'; }
        else if (cap === 'CAT 3 SINGLE') { c1 = 'CAT 3 SINGLE'; c2 = 'DH ' + mm; }
        else if (cap === 'CAT 2' || cap === 'CAT 1') { c1 = cap; c2 = 'DH ' + mm; }
        else if (cap === 'RNAV') { c1 = ''; c2 = 'MDA ' + Math.round(F.elev + mm); }
        fmaSet(3, c1, 'w', c2, 'b');
        // 自動駕駛
        const apTxt = F.ap1 && F.ap2 ? 'AP1+2' : F.ap1 ? 'AP1' : F.ap2 ? 'AP2' : '';
        fmaSet(4, apTxt, 'w', F.athr ? 'A/THR' : '', F.phase === 'AIR' ? 'w' : 'b');
    }

    // ---------- 畫面：PFD（照 A320 PFD 的符號）----------
    // 灰色速度帶和高度帶、黃色參考線、鼓輪式高度讀數、V/S 指針、FD 指引桿、速度趨勢箭頭、VLS 和 VMAX。
    let pfd = null;
    const CX = 200, CY = 160;
    const PXD = 4.6;     // 每度俯仰的像素
    const PXK = 2.2;     // 每節
    const PXF = 0.16;    // 每呎
    const PXH = 4.4;     // 每度航向
    const TT = 70, TB = 250;   // 速度帶、高度帶的上下緣

    // 速度限制（沒有模擬襟翼，進場、起飛和低速時當作襟翼已放）
    function speedLimits() {
        const conf = F.phase !== 'AIR' || F.gearDown || F.apprArm || LAT_APP.includes(F.lat) || VERT_APP.includes(F.vert) ||
            F.handFly || F.ga || F.vert === 'SRS' || (F.ias < 200 && agl() < 10000);
        if (conf) return { vmax: F.gearDown ? 200 : 215, vls: 123, gd: null };
        const hi = Math.max(0, (F.alt - 20000) / 1000);
        return { vmax: Math.min(340, iasFromMach(0.82, F.alt)), vls: 178 + hi * 1.2, gd: 205 + hi };
    }
    // V/S 刻度：1000 呎／分以內比較疏，6000 封頂
    const vsY = (v) => {
        const a = Math.abs(v);
        const y = a <= 1000 ? a * 0.045 : a <= 2000 ? 45 + (a - 1000) * 0.02 : 65 + Math.min(4000, a - 2000) * 0.00525;
        return Math.sign(v) * Math.min(88, y);
    };

    function buildPFD(host) {
        host.textContent = '';
        const svg = svgEl('svg', { viewBox: '0 0 420 330', class: 'ck-pfd-svg', role: 'img', 'aria-label': '主飛行顯示器（PFD）' });
        const defs = svgEl('defs', {}, svg);
        const clipD = (id, d) => { const c = svgEl('clipPath', { id }, defs); svgEl('path', { d }, c); };
        clipD('cpAdi', 'M118,76 Q200,54 282,76 L282,244 Q200,266 118,244 Z');
        clipD('cpSpd', `M30,${TT} H110 V${TB} H30 Z`);
        clipD('cpAlt', `M300,${TT} H344 V${TB} H300 Z`);
        clipD('cpHdg', 'M128,280 H272 V312 H128 Z');
        clipD('cpDrum', `M353,${CY - 21} H381 V${CY + 21} H353 Z`);
        const pat = (id, c1) => {
            const p = svgEl('pattern', { id, width: 6, height: 8, patternUnits: 'userSpaceOnUse' }, defs);
            svgEl('rect', { width: 6, height: 8, fill: '#000' }, p);
            svgEl('rect', { width: 6, height: 4, fill: c1 }, p);
        };
        pat('pfVmax', '#ff2b2b');
        pat('pfAprot', '#ffb224');
        svgEl('rect', { x: 0, y: 0, width: 420, height: 330, class: 'pf-bg' }, svg);
        pfd = {};

        // 姿態球
        const adiClip = svgEl('g', { 'clip-path': 'url(#cpAdi)' }, svg);
        pfd.adi = svgEl('g', {}, adiClip);
        svgEl('rect', { x: -400, y: -800, width: 800, height: 800, class: 'pf-sky' }, pfd.adi);
        svgEl('rect', { x: -400, y: 0, width: 800, height: 800, class: 'pf-gnd' }, pfd.adi);
        svgEl('line', { x1: -400, y1: 0, x2: 400, y2: 0, class: 'pf-hor' }, pfd.adi);
        for (let p = -30; p <= 30; p += 2.5) {
            if (p === 0) continue;
            const big = p % 10 === 0, mid = p % 5 === 0;
            const w = big ? 24 : mid ? 12 : 5;
            svgEl('line', { x1: -w, y1: -p * PXD, x2: w, y2: -p * PXD, class: 'pf-lad' }, pfd.adi);
            if (big) {
                [-1, 1].forEach((s) => {
                    const t = svgEl('text', { x: s * (w + 11), y: -p * PXD + 4, class: 'pf-t', 'text-anchor': 'middle' }, pfd.adi);
                    t.textContent = Math.abs(p);
                });
            }
        }
        // 橫滾刻度（固定）與天空指標（跟著轉）
        const rs = svgEl('g', { transform: `translate(${CX} ${CY})` }, svg);
        const R = 96;
        svgEl('path', { d: `M${-Math.sin(45 * D2R) * R},${-Math.cos(45 * D2R) * R} A${R},${R} 0 0 1 ${Math.sin(45 * D2R) * R},${-Math.cos(45 * D2R) * R}`, class: 'pf-arc' }, rs);
        [-45, -30, -20, -10, 10, 20, 30, 45].forEach((a) => {
            const r2 = Math.abs(a) === 30 || Math.abs(a) === 45 ? R + 10 : R + 6;
            svgEl('line', { x1: Math.sin(a * D2R) * R, y1: -Math.cos(a * D2R) * R, x2: Math.sin(a * D2R) * r2, y2: -Math.cos(a * D2R) * r2, class: 'pf-tick' }, rs);
        });
        svgEl('polygon', { points: `0,${-R} -6,${-R - 10} 6,${-R - 10}`, class: 'pf-yel' }, rs);
        pfd.sky = svgEl('g', {}, rs);
        svgEl('polygon', { points: `0,${-R + 2} -6,${-R + 11} 6,${-R + 11}`, class: 'pf-yel' }, pfd.sky);
        svgEl('rect', { x: -7, y: -R + 13, width: 14, height: 4, class: 'pf-yel' }, pfd.sky);

        // 飛行指引桿（綠色）
        pfd.fdH = svgEl('line', { x1: CX - 46, x2: CX + 46, y1: CY, y2: CY, class: 'pf-fd' }, svg);
        pfd.fdV = svgEl('line', { x1: CX, x2: CX, y1: CY - 46, y2: CY + 46, class: 'pf-fd' }, svg);
        // 飛機符號（黃色機翼，黑邊）
        svgEl('path', { d: `M${CX - 80},${CY - 3} H${CX - 30} V${CY + 11} H${CX - 36} V${CY + 3} H${CX - 80} Z`, class: 'pf-acs' }, svg);
        svgEl('path', { d: `M${CX + 80},${CY - 3} H${CX + 30} V${CY + 11} H${CX + 36} V${CY + 3} H${CX + 80} Z`, class: 'pf-acs' }, svg);
        svgEl('rect', { x: CX - 4, y: CY - 4, width: 8, height: 8, class: 'pf-acc' }, svg);

        // LOC / G/S 偏差
        pfd.ils = svgEl('g', {}, svg);
        for (let i = -2; i <= 2; i++) {
            if (i === 0) {
                svgEl('line', { x1: CX, y1: 262, x2: CX, y2: 274, class: 'pf-ilsc' }, pfd.ils);
                svgEl('line', { x1: 286, y1: CY, x2: 298, y2: CY, class: 'pf-ilsc' }, pfd.ils);
            } else {
                svgEl('circle', { cx: CX + i * 26, cy: 268, r: 3, class: 'pf-dot' }, pfd.ils);
                svgEl('circle', { cx: 292, cy: CY + i * 22, r: 3, class: 'pf-dot' }, pfd.ils);
            }
        }
        pfd.locD = svgEl('polygon', { points: '0,-6 7,0 0,6 -7,0', class: 'pf-dia' }, pfd.ils);
        pfd.gsD = svgEl('polygon', { points: '0,-7 6,0 0,7 -6,0', class: 'pf-dia' }, pfd.ils);
        pfd.locF = svgEl('text', { x: CX, y: 272, class: 'pf-flag pf-flag-s', 'text-anchor': 'middle' }, svg);
        pfd.locF.textContent = 'LOC';
        pfd.gsF = svgEl('text', { x: 292, y: CY + 4, class: 'pf-flag pf-flag-s', 'text-anchor': 'middle' }, svg);
        pfd.gsF.textContent = 'G/S';
        pfd.ra = svgEl('text', { x: CX, y: 238, class: 'pf-ra', 'text-anchor': 'middle' }, svg);

        // 速度帶
        svgEl('rect', { x: 30, y: TT, width: 66, height: TB - TT, class: 'pf-tape' }, svg);
        const sg = svgEl('g', { 'clip-path': 'url(#cpSpd)' }, svg);
        pfd.spdTape = svgEl('g', {}, sg);
        for (let v = 30; v <= 420; v += 10) {
            const y = -v * PXK;
            svgEl('line', { x1: 86, y1: y, x2: 96, y2: y, class: 'pf-tick' }, pfd.spdTape);
            if (v % 20 === 0) { const t = svgEl('text', { x: 82, y: y + 4.5, class: 'pf-tn', 'text-anchor': 'end' }, pfd.spdTape); t.textContent = v < 100 ? String(v) : String(v); }
        }
        pfd.vmax = svgEl('rect', { x: 96, width: 7, fill: 'url(#pfVmax)' }, pfd.spdTape);
        pfd.vls = svgEl('rect', { x: 96, width: 3, class: 'pf-vls' }, pfd.spdTape);
        pfd.aprot = svgEl('rect', { x: 96, width: 7, fill: 'url(#pfAprot)' }, pfd.spdTape);
        pfd.amax = svgEl('rect', { x: 96, width: 7, class: 'pf-amax' }, pfd.spdTape);
        pfd.gd = svgEl('circle', { cx: 101, r: 3.5, class: 'pf-gd' }, pfd.spdTape);
        pfd.spdTgt = svgEl('polygon', { points: '97,0 109,-7 109,7', class: 'pf-tgt' }, sg);
        svgEl('line', { x1: 30, y1: TT, x2: 104, y2: TT, class: 'pf-edge' }, svg);
        svgEl('line', { x1: 30, y1: TB, x2: 104, y2: TB, class: 'pf-edge' }, svg);
        svgEl('line', { x1: 96, y1: TT, x2: 96, y2: TB, class: 'pf-edge' }, svg);
        pfd.trend = svgEl('path', { class: 'pf-trend' }, svg);
        svgEl('line', { x1: 22, y1: CY, x2: 112, y2: CY, class: 'pf-yref' }, svg);
        svgEl('polygon', { points: `${96},${CY} ${108},${CY - 6} ${108},${CY + 6}`, class: 'pf-yel' }, svg);
        pfd.spdTxt = svgEl('text', { x: 63, y: TT - 6, class: 'pf-tn', 'text-anchor': 'middle' }, svg);
        pfd.mach = svgEl('text', { x: 63, y: TB + 18, class: 'pf-g pf-tn', 'text-anchor': 'middle' }, svg);

        // 高度帶
        svgEl('rect', { x: 300, y: TT, width: 40, height: TB - TT, class: 'pf-tape' }, svg);
        const ag = svgEl('g', { 'clip-path': 'url(#cpAlt)' }, svg);
        pfd.gndRib = svgEl('rect', { x: 300, width: 40, class: 'pf-gndrib' }, ag);
        pfd.altPool = [];
        for (let i = 0; i < 14; i++) {
            const ln = svgEl('line', { x1: 300, x2: 308, class: 'pf-tick' }, ag);
            const tx = svgEl('text', { x: 336, class: 'pf-tn', 'text-anchor': 'end' }, ag);
            pfd.altPool.push([ln, tx]);
        }
        pfd.altSelBox = svgEl('g', {}, ag);
        svgEl('rect', { x: 301, y: -9, width: 38, height: 18, class: 'pf-selbox' }, pfd.altSelBox);
        pfd.altSelIn = svgEl('text', { x: 320, y: 4, class: 'pf-c pf-ts', 'text-anchor': 'middle' }, pfd.altSelBox);
        svgEl('line', { x1: 300, y1: TT, x2: 344, y2: TT, class: 'pf-edge' }, svg);
        svgEl('line', { x1: 300, y1: TB, x2: 344, y2: TB, class: 'pf-edge' }, svg);
        svgEl('path', { d: `M296,${CY - 13} H353 V${CY - 22} H382 V${CY + 22} H353 V${CY + 13} H296 Z`, class: 'pf-altwin' }, svg);
        pfd.altBig = svgEl('text', { x: 351, y: CY + 7, class: 'pf-altbig', 'text-anchor': 'end' }, svg);
        const dg = svgEl('g', { 'clip-path': 'url(#cpDrum)' }, svg);
        pfd.drum = [];
        for (let k = 0; k < 5; k++) pfd.drum.push(svgEl('text', { x: 379, class: 'pf-drum', 'text-anchor': 'end' }, dg));
        pfd.altSelTxt = svgEl('text', { x: 322, class: 'pf-c pf-tn', 'text-anchor': 'middle' }, svg);
        pfd.baro = svgEl('text', { x: 322, y: TB + 32, class: 'pf-c pf-tn', 'text-anchor': 'middle' }, svg);

        // V/S
        svgEl('path', { d: `M386,${CY - 92} H398 L412,${CY - 56} V${CY + 56} L398,${CY + 92} H386 Z`, class: 'pf-tape' }, svg);
        [500, 1000, 1500, 2000, 6000].forEach((v) => [1, -1].forEach((s) => {
            const y = CY - vsY(v * s);
            const long = v === 1000 || v === 2000 || v === 6000;
            svgEl('line', { x1: 386, y1: y, x2: long ? 393 : 390, y2: y, class: 'pf-tick' }, svg);
            if (long) { const t = svgEl('text', { x: 397, y: y + 3.5, class: 'pf-ts' }, svg); t.textContent = String(v / 1000); }
        }));
        svgEl('line', { x1: 384, y1: CY, x2: 394, y2: CY, class: 'pf-yref' }, svg);
        pfd.vsN = svgEl('line', { class: 'pf-vs' }, svg);
        pfd.vsBox = svgEl('rect', { x: 389, width: 22, height: 13, class: 'pf-vsbox' }, svg);
        pfd.vsTxt = svgEl('text', { x: 400, class: 'pf-g pf-ts', 'text-anchor': 'middle' }, svg);

        // 航向帶
        svgEl('rect', { x: 128, y: 280, width: 144, height: 30, class: 'pf-tape' }, svg);
        const hg = svgEl('g', { 'clip-path': 'url(#cpHdg)' }, svg);
        pfd.hdgPool = [];
        for (let i = 0; i < 12; i++) {
            const ln = svgEl('line', { y1: 280, class: 'pf-tick' }, hg);
            const tx = svgEl('text', { y: 305, class: 'pf-tn', 'text-anchor': 'middle' }, hg);
            pfd.hdgPool.push([ln, tx]);
        }
        pfd.crs = svgEl('line', { y1: 280, y2: 296, class: 'pf-crs' }, hg);
        pfd.trk = svgEl('polygon', { points: '0,281 4,286 0,291 -4,286', class: 'pf-trk' }, hg);
        pfd.hdgBug = svgEl('polygon', { points: '0,280 -6,272 6,272', class: 'pf-hsel' }, svg);
        pfd.hdgSelTxt = svgEl('text', { y: 300, class: 'pf-c pf-tn' }, svg);
        svgEl('line', { x1: CX, y1: 270, x2: CX, y2: 292, class: 'pf-yref' }, svg);

        pfd.flag = svgEl('text', { x: CX, y: CY - 20, class: 'pf-flag', 'text-anchor': 'middle' }, svg);
        host.append(svg);
        pfd.svg = svg;
        pfd.host = host;
    }

    function renderPFD() {
        if (!pfd) return;
        const on = F.power;
        pfd.host.classList.toggle('off', !on);
        if (!on) return;
        const air = F.phase === 'AIR';
        const att = A.sys.attOK() > 0;
        pfd.flag.textContent = att ? '' : 'ATT';
        const bank = att ? F.bank : 0, pitch = att ? F.pitch : 0;
        pfd.adi.setAttribute('transform', `translate(${CX} ${CY}) rotate(${(-bank).toFixed(2)}) translate(0 ${(pitch * PXD).toFixed(2)})`);
        pfd.sky.setAttribute('transform', `rotate(${(-bank).toFixed(2)})`);
        pfd.svg.classList.toggle('noatt', !att);

        // 飛行指引
        const fd = att && air && (apOn() || F.vert === 'SRS' || F.lat === 'GA TRK' || F.handFly);
        pfd.fdH.style.display = pfd.fdV.style.display = fd ? '' : 'none';
        if (fd) {
            const dy = clamp(((F.fdVs || 0) - F.vs) / 40, -40, 40);
            const dx = clamp(((F.fdBank || 0) - F.bank) * 2.2, -40, 40);
            pfd.fdH.setAttribute('transform', `translate(0 ${(-dy).toFixed(1)})`);
            pfd.fdV.setAttribute('transform', `translate(${dx.toFixed(1)} 0)`);
        }

        // 速度帶
        const ias = Math.max(30, F.ias);
        pfd.spdTape.setAttribute('transform', `translate(0 ${(CY + ias * PXK).toFixed(2)})`);
        const lim = speedLimits();
        const vis = (on2) => (on2 ? '' : 'none');
        pfd.vmax.setAttribute('y', (-420 * PXK).toFixed(1));
        pfd.vmax.setAttribute('height', ((420 - lim.vmax) * PXK).toFixed(1));
        pfd.vmax.style.display = vis(air || F.phase === 'TO');
        pfd.vls.setAttribute('y', (-lim.vls * PXK).toFixed(1));
        pfd.vls.setAttribute('height', (8 * PXK).toFixed(1));
        pfd.aprot.setAttribute('y', (-(lim.vls - 8) * PXK).toFixed(1));
        pfd.aprot.setAttribute('height', (9 * PXK).toFixed(1));
        pfd.amax.setAttribute('y', (-(lim.vls - 17) * PXK).toFixed(1));
        pfd.amax.setAttribute('height', ((lim.vls - 47) * PXK).toFixed(1));
        [pfd.vls, pfd.aprot, pfd.amax].forEach((n) => { n.style.display = vis(air); });
        pfd.gd.style.display = vis(air && lim.gd !== null);
        if (lim.gd !== null) pfd.gd.setAttribute('cy', (-lim.gd * PXK).toFixed(1));
        // 目標速度：管理是洋紅色、選定是青色
        const tgt = air || F.phase === 'TO' ? targetIas() : null;
        const tcls = F.spdMgd && !F.spdPreset ? 'pf-tgt m' : 'pf-tgt c';
        if (tgt !== null) {
            const y = CY - (tgt - ias) * PXK;
            const inside = y > TT + 4 && y < TB - 4;
            pfd.spdTgt.setAttribute('transform', `translate(0 ${y.toFixed(1)})`);
            pfd.spdTgt.setAttribute('class', tcls);
            pfd.spdTgt.style.display = vis(inside);
            pfd.spdTxt.textContent = inside ? '' : String(Math.round(tgt));
            pfd.spdTxt.setAttribute('y', y <= TT + 4 ? TT - 6 : TB + 18);
            pfd.spdTxt.setAttribute('class', 'pf-tn ' + (F.spdMgd && !F.spdPreset ? 'pf-m' : 'pf-c'));
        } else { pfd.spdTgt.style.display = 'none'; pfd.spdTxt.textContent = ''; }
        // 速度趨勢（10 秒後的速度）
        const tr = (F.iasTr || 0) * 10;
        if (air && Math.abs(tr) > 2) {
            const y2 = CY - clamp(tr, -38, 38) * PXK;
            const d = tr > 0 ? 1 : -1;
            pfd.trend.setAttribute('d', `M90,${CY} V${y2.toFixed(1)} M85,${(y2 + d * 7).toFixed(1)} L90,${y2.toFixed(1)} L95,${(y2 + d * 7).toFixed(1)}`);
            pfd.trend.style.display = '';
        } else pfd.trend.style.display = 'none';
        const m = machOf(Math.max(1, F.ias), F.alt);
        pfd.mach.textContent = m >= 0.5 ? '.' + Math.round(m * 100) : '';
        // 速度帶背景在 ias 低於 30 時不要動

        // 高度帶（數字以百呎為單位，每 500 呎一個）
        const alt = F.alt;
        const base = Math.floor(alt / 100) * 100 - 600;
        pfd.altPool.forEach(([ln, tx], i) => {
            const v = base + i * 100;
            const y = CY - (v - alt) * PXF;
            ln.setAttribute('y1', y.toFixed(1)); ln.setAttribute('y2', y.toFixed(1));
            ln.setAttribute('x2', v % 500 === 0 ? 310 : 306);
            const lab = v % 500 === 0 && v >= 0;
            tx.style.display = lab ? '' : 'none';
            if (lab) { tx.setAttribute('y', (y + 4.5).toFixed(1)); tx.textContent = String(v / 100); }
        });
        // 地面參考（紅色）
        const gy = CY - (F.elev - alt) * PXF;
        pfd.gndRib.setAttribute('y', Math.max(TT, gy).toFixed(1));
        pfd.gndRib.setAttribute('height', Math.max(0, TB - Math.max(TT, gy)).toFixed(1));
        // 讀數：大字是百呎，鼓輪是 20 呎一格
        const a = Math.max(0, alt);
        pfd.altBig.textContent = String(Math.floor(a / 100));
        const b20 = Math.floor(a / 20) * 20;
        const frac = (a - b20) / 20;
        pfd.drum.forEach((t, k) => {
            const off = k - 2;
            const v = (((b20 + off * 20) % 100) + 100) % 100;
            t.textContent = String(v).padStart(2, '0');
            t.setAttribute('y', (CY + 5 + (-off + frac) * 15).toFixed(1));
        });
        // 選定高度
        const std = alt >= 11000 || F.altSel >= 11000;
        const sy = CY - (F.altSel - alt) * PXF;
        const selIn = sy > TT + 8 && sy < TB - 8;
        pfd.altSelBox.style.display = vis(selIn);
        if (selIn) { pfd.altSelBox.setAttribute('transform', `translate(0 ${sy.toFixed(1)})`); pfd.altSelIn.textContent = String(Math.round(F.altSel / 100)); }
        pfd.altSelTxt.textContent = selIn ? '' : (std && F.altSel >= 11000 ? 'FL' + Math.round(F.altSel / 100) : String(F.altSel));
        pfd.altSelTxt.setAttribute('y', sy <= TT + 8 ? TT - 6 : TB + 18);
        pfd.baro.textContent = alt >= 11000 ? 'STD' : 'QNH 1013';

        // V/S 指針
        const vs = F.vs;
        const yv = CY - vsY(vs);
        const px = 430, py = CY;
        const u = (412 - 388) / (px - 388);
        pfd.vsN.setAttribute('x1', 388); pfd.vsN.setAttribute('y1', yv.toFixed(1));
        pfd.vsN.setAttribute('x2', (388 + (px - 388) * u).toFixed(1)); pfd.vsN.setAttribute('y2', (yv + (py - yv) * u).toFixed(1));
        const showVs = Math.abs(vs) >= 200;
        pfd.vsTxt.textContent = showVs ? String(Math.round(Math.abs(vs) / 100)).padStart(2, '0') : '';
        const ty = vs > 0 ? yv - 6 : yv + 16;
        pfd.vsTxt.setAttribute('y', ty.toFixed(1));
        pfd.vsBox.setAttribute('y', (ty - 10).toFixed(1));
        pfd.vsBox.style.display = vis(showVs);
        const vsWarn = Math.abs(vs) > 6000 || (air && agl() < 2500 && vs < -2000);
        pfd.vsN.classList.toggle('warn', vsWarn);
        pfd.vsTxt.classList.toggle('pf-a', vsWarn);

        // 航向帶（數字是航向除以 10）
        const h = toReal(F.hdg);
        const b0 = Math.floor(h / 5) * 5 - 25;
        pfd.hdgPool.forEach(([ln, tx], i) => {
            const v = b0 + i * 5;
            const x = CX + wrap180(v - h) * PXH;
            ln.setAttribute('x1', x.toFixed(1)); ln.setAttribute('x2', x.toFixed(1));
            ln.setAttribute('y2', v % 10 === 0 ? 290 : 286);
            const lab = ((v % 10) + 10) % 10 === 0;
            tx.style.display = lab ? '' : 'none';
            if (lab) {
                const hn = wrap360(v) / 10;
                tx.setAttribute('x', x.toFixed(1));
                tx.textContent = String(hn === 0 ? 0 : hn);
                tx.setAttribute('class', 'pf-tn' + (hn % 3 === 0 ? ' pf-tb' : ''));
            }
        });
        const trkX = CX + wrap180(toReal(F.trk) - h) * PXH;
        pfd.trk.setAttribute('transform', `translate(${trkX.toFixed(1)} 0)`);
        pfd.trk.style.display = vis(air);
        const lsOn = air && !rnav() && (F.apprArm || F.locArm || LAT_APP.includes(F.lat) || VERT_APP.includes(F.vert)) && F.locOK;
        const cx2 = CX + wrap180(runway().hdg - h) * PXH;
        pfd.crs.setAttribute('x1', cx2.toFixed(1)); pfd.crs.setAttribute('x2', cx2.toFixed(1));
        pfd.crs.style.display = vis(lsOn);
        const showSel = air && !(F.hdgMgd && !F.hdgPreset);
        const dh = wrap180(F.hdgSel - h);
        if (showSel && Math.abs(dh) <= 16) {
            pfd.hdgBug.setAttribute('transform', `translate(${(CX + dh * PXH).toFixed(1)} 0)`);
            pfd.hdgBug.style.display = '';
            pfd.hdgSelTxt.textContent = '';
        } else {
            pfd.hdgBug.style.display = 'none';
            pfd.hdgSelTxt.textContent = showSel ? pad(F.hdgSel, 3) : '';
            pfd.hdgSelTxt.setAttribute('x', dh < 0 ? 124 : 276);
            pfd.hdgSelTxt.setAttribute('text-anchor', dh < 0 ? 'end' : 'start');
        }

        // LOC / G/S（RNAV 時顯示 GPS 計算的偏差）
        const wantIls = air && (F.locArm || F.apprArm || LAT_APP.includes(F.lat) || VERT_APP.includes(F.vert) || F.handFly);
        const showIls = wantIls && ilsValid();
        pfd.ils.style.display = vis(showIls);
        const ilsType = !rnav();
        pfd.locF.style.display = vis(wantIls && ilsType && !F.locOK);
        pfd.gsF.style.display = vis(wantIls && ilsType && !F.gsOK);
        if (showIls) {
            pfd.locD.style.display = vis(!(ilsType && !F.locOK));
            pfd.gsD.style.display = vis(!(ilsType && !F.gsOK));
            pfd.locD.setAttribute('transform', `translate(${(CX + clamp(locDots(), -2.4, 2.4) * 26).toFixed(1)} 268)`);
            pfd.gsD.setAttribute('transform', `translate(292 ${(CY - clamp(gsDots(), -2.4, 2.4) * 22).toFixed(1)})`);
        }
        // 無線電高度：低於 2500 呎顯示，接近最低高度變琥珀色
        const ra = agl();
        pfd.ra.textContent = air && ra < 2500 ? String(ra < 50 ? Math.max(0, Math.round(ra)) : ra < 100 ? Math.round(ra / 5) * 5 : Math.round(ra / 10) * 10) : '';
        const mn = air && !F.minDone ? fcu.minimum() : null;
        pfd.ra.classList.toggle('below', mn !== null && ra <= mn + 100);
    }

    // ---------- 畫面：ND（導航顯示器）----------
    // ARC：機頭朝上的 90° 扇形；ROSE NAV：機頭朝上的整圈羅盤；PLAN：北方朝上，以下一個航點為中心。
    let nd = null;
    const ND_RANGES = [10, 20, 40, 80, 160, 320];
    fcu.ndMode = 'ARC';
    const ND_GEOM = { ARC: { cx: 200, cy: 334, R: 272 }, NAV: { cx: 200, cy: 212, R: 152 }, PLAN: { cx: 200, cy: 212, R: 152 } };
    function buildND(host) {
        host.textContent = '';
        const svg = svgEl('svg', { viewBox: '0 0 400 400', class: 'ck-nd-svg', role: 'img', 'aria-label': '導航顯示器（ND）' });
        nd = { svg, host, mode: '' };
        const defs = svgEl('defs', {}, svg);
        const cp = svgEl('clipPath', { id: 'cpNd' }, defs);
        nd.clip = svgEl('circle', {}, cp);
        svgEl('rect', { width: 400, height: 400, class: 'nd-bg' }, svg);
        nd.fixed = svgEl('g', {}, svg);
        const cg = svgEl('g', { 'clip-path': 'url(#cpNd)' }, svg);
        nd.cl = svgEl('line', { class: 'nd-cl' }, cg);
        nd.rwy = svgEl('polygon', { class: 'nd-rwy' }, cg);
        nd.route = svgEl('polyline', { class: 'nd-route', fill: 'none' }, cg);
        nd.wps = svgEl('g', {}, cg);
        nd.rose = svgEl('g', {}, svg);
        nd.hsel = svgEl('polygon', { points: '0,0 -6,-10 6,-10', class: 'nd-hsel' }, svg);
        nd.trk = svgEl('polygon', { points: '0,-5 4,0 0,5 -4,0', class: 'nd-trk' }, svg);
        nd.lubber = svgEl('line', { class: 'nd-lub' }, svg);
        nd.ac = svgEl('path', { d: 'M0,-13 V24 M-19,0 H19 M-7,19 H7', class: 'nd-ac' }, svg);
        const T = (x, y, cls, anchor) => svgEl('text', { x, y, class: cls, 'text-anchor': anchor || 'start' }, svg);
        nd.gsL = T(8, 20, 'nd-w nd-s'); nd.gsL.textContent = 'GS';
        nd.gsV = T(30, 20, 'nd-g');
        nd.tasL = T(70, 20, 'nd-w nd-s'); nd.tasL.textContent = 'TAS';
        nd.tasV = T(97, 20, 'nd-g');
        nd.wind = T(8, 40, 'nd-g');
        nd.warr = svgEl('path', { d: 'M0,-9 V9 M-4,4 L0,9 L4,4', class: 'nd-warr' }, svg);
        nd.toN = T(316, 20, 'nd-w', 'end');
        nd.toB = T(392, 20, 'nd-g', 'end');
        nd.toD = T(372, 40, 'nd-g', 'end');
        nd.toNM = T(392, 40, 'nd-c nd-s', 'end'); nd.toNM.textContent = 'NM';
        nd.toE = T(392, 60, 'nd-g', 'end');
        nd.msg = T(200, 392, 'nd-w nd-s', 'middle');
        nd.appr = T(200, 20, 'nd-w', 'middle');
        host.append(svg);
    }

    function ndRebuild(mode, range) {
        const g = ND_GEOM[mode];
        nd.mode = mode; nd.range = range;
        nd.clip.setAttribute('cx', g.cx); nd.clip.setAttribute('cy', g.cy); nd.clip.setAttribute('r', mode === 'PLAN' ? 400 : g.R);
        nd.fixed.textContent = '';
        nd.rose.textContent = '';
        const fr = mode === 'ARC' ? [0.25, 0.5, 0.75] : [0.5];
        fr.forEach((f) => {
            const r = g.R * f;
            svgEl('circle', { cx: g.cx, cy: g.cy, r, class: 'nd-ring' }, nd.fixed);
            const a = mode === 'ARC' ? -42 : -45;
            const t = svgEl('text', { x: g.cx + Math.sin(a * D2R) * r - 4, y: g.cy - Math.cos(a * D2R) * r - 4, class: 'nd-c nd-s', 'text-anchor': 'end' }, nd.fixed);
            t.textContent = String(+(range * f).toFixed(1)).replace(/\.0$/, '');
        });
        if (mode === 'PLAN') {
            svgEl('circle', { cx: g.cx, cy: g.cy, r: g.R, class: 'nd-rose' }, nd.fixed);
            [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([l, a]) => {
                const t = svgEl('text', { x: g.cx + Math.sin(a * D2R) * (g.R - 14), y: g.cy - Math.cos(a * D2R) * (g.R - 14) + 5, class: 'nd-w nd-b', 'text-anchor': 'middle' }, nd.fixed);
                t.textContent = l;
            });
            return;
        }
        // 羅盤刻度（跟著航向轉）
        svgEl('circle', { cx: 0, cy: 0, r: g.R, class: 'nd-rose' }, nd.rose);
        for (let a = 0; a < 360; a += 5) {
            const r2 = a % 10 === 0 ? g.R + 11 : g.R + 6;
            svgEl('line', { x1: Math.sin(a * D2R) * g.R, y1: -Math.cos(a * D2R) * g.R, x2: Math.sin(a * D2R) * r2, y2: -Math.cos(a * D2R) * r2, class: 'nd-tick' }, nd.rose);
            if (a % 10 === 0) {
                const rx = Math.sin(a * D2R) * (g.R + 22), ry = -Math.cos(a * D2R) * (g.R + 22) + 5;
                const t = svgEl('text', { x: rx, y: ry, class: 'nd-w ' + (a % 30 === 0 ? 'nd-b' : 'nd-s'), 'text-anchor': 'middle', transform: `rotate(${a} ${rx} ${ry - 5})` }, nd.rose);
                t.textContent = String(a / 10);
            }
        }
    }

    function renderND() {
        if (!nd) return;
        nd.host.classList.toggle('off', !F.power);
        if (!F.power) return;
        const mode = fcu.ndMode, range = F.range;
        if (nd.mode !== mode || nd.range !== range) ndRebuild(mode, range);
        const g = ND_GEOM[mode];
        const air = F.phase === 'AIR';
        const hReal = toReal(F.hdg);
        const s = g.R / range;
        // 中心點：PLAN 以下一個航點（沒有就用跑道）為中心
        const plan = mode === 'PLAN';
        const fp = fcu.api.plan();
        const toWp = fp.find((p) => p.type === 'to') || fp.find((p) => p.type === 'dest');
        const c0 = plan && toWp ? { x: toWp.x, y: toWp.y } : { x: F.x, y: F.y };
        const rot = (plan ? (F.off || 0) : -F.hdg) * D2R;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const P = (x, y) => {
            const dx = (x - c0.x) * s, dy = -(y - c0.y) * s;
            return [g.cx + dx * cs - dy * sn, g.cy + dx * sn + dy * cs];
        };
        const fmt = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);
        // 羅盤
        nd.rose.setAttribute('transform', `translate(${g.cx} ${g.cy}) rotate(${(-hReal).toFixed(1)})`);
        nd.rose.style.display = plan ? 'none' : '';
        nd.lubber.style.display = plan ? 'none' : '';
        nd.lubber.setAttribute('x1', g.cx); nd.lubber.setAttribute('x2', g.cx);
        nd.lubber.setAttribute('y1', g.cy - g.R - 18); nd.lubber.setAttribute('y2', g.cy - g.R + 8);
        // 飛機符號
        const acp = P(F.x, F.y);
        const acRot = plan ? hReal : 0;
        nd.ac.setAttribute('transform', `translate(${acp[0].toFixed(1)} ${acp[1].toFixed(1)}) rotate(${acRot.toFixed(1)})`);
        // 航跡菱形與選定航向
        const onRose = (deg, node, r) => {
            const a = (deg - hReal) * D2R;
            node.setAttribute('transform', `translate(${(g.cx + Math.sin(a) * r).toFixed(1)} ${(g.cy - Math.cos(a) * r).toFixed(1)}) rotate(${(deg - hReal).toFixed(1)})`);
        };
        nd.trk.style.display = !plan && air ? '' : 'none';
        if (!plan && air) onRose(toReal(F.trk), nd.trk, g.R - 6);
        const showSel = !plan && air && !(F.hdgMgd && !F.hdgPreset);
        nd.hsel.style.display = showSel ? '' : 'none';
        if (showSel) onRose(F.hdgSel, nd.hsel, g.R);
        // 跑道與延伸中心線
        const a1 = P(0, 0.025), a2 = P(1.5, 0.025), a3 = P(1.5, -0.025), a4 = P(0, -0.025);
        nd.rwy.setAttribute('points', [a1, a2, a3, a4].map(fmt).join(' '));
        const c1 = P(-12, 0), c2 = P(0, 0);
        nd.cl.setAttribute('x1', c1[0].toFixed(1)); nd.cl.setAttribute('y1', c1[1].toFixed(1));
        nd.cl.setAttribute('x2', c2[0].toFixed(1)); nd.cl.setAttribute('y2', c2[1].toFixed(1));
        // 航路（綠色），下一個航點白色
        const di = fp.findIndex((p) => p.type === 'disc');
        const pts = [[F.x, F.y]].concat((di >= 0 ? fp.slice(0, di) : fp).filter((p) => p.type !== 'from').map((p) => [p.x, p.y]));
        nd.route.setAttribute('points', pts.map((p) => fmt(P(p[0], p[1]))).join(' '));
        nd.wps.textContent = '';
        fp.forEach((p) => {
            if (p.type === 'from' || p.type === 'dest' || p.type === 'disc') return;
            const q = P(p.x, p.y);
            const cls = p.type === 'to' ? 'nd-wpt to' : 'nd-wpt';
            svgEl('polygon', { points: `${q[0]},${q[1] - 5} ${q[0] + 5},${q[1]} ${q[0]},${q[1] + 5} ${q[0] - 5},${q[1]}`, class: cls }, nd.wps);
            const t = svgEl('text', { x: q[0] + 9, y: q[1] + 4, class: p.type === 'to' ? 'nd-w' : 'nd-g' }, nd.wps);
            t.textContent = p.n;
        });
        // 左上：地速、真空速、風
        set1(nd.gsV, air ? String(Math.round(F.gsKt)) : '0');
        set1(nd.tasV, air ? String(Math.round(tasFromIas(F.ias, F.alt))) : '---');
        const wOn = air && cfg.windSpd > 0;
        set1(nd.wind, air ? (cfg.windSpd > 0 ? `${pad(cfg.windDir, 3)}/${cfg.windSpd}` : '---/---') : '');
        nd.warr.style.display = wOn ? '' : 'none';
        if (wOn) nd.warr.setAttribute('transform', `translate(18 62) rotate(${((cfg.windDir + 180 - (plan ? 0 : hReal)) % 360).toFixed(0)})`);
        // 右上：下一個航點
        const tw = fp.find((p) => p.type === 'to') || fp.find((p) => p.type === 'dest');
        if (tw) {
            set1(nd.toN, tw.n);
            set1(nd.toB, pad(tw.brg, 3) + '°');
            set1(nd.toD, tw.dist < 20 ? tw.dist.toFixed(1) : String(Math.round(tw.dist)));
            set1(nd.toE, tw.eta);
        }
        [nd.toN, nd.toB, nd.toD, nd.toNM, nd.toE].forEach((n) => { n.style.display = tw ? '' : 'none'; });
        const cap = capability();
        set1(nd.appr, cap ? (cap === 'RNAV' ? 'RNAV' : 'ILS') + ' ' + runway().rwy : '');
        set1(nd.msg, F.phase === 'GND' && A.sys.attOK() < 1 ? 'ALIGN IRS' : '');
    }

    // ---------- 總渲染 ----------
    let help = null, readout = null;
    fcu.build = function (h) {
        buildFCU(h.fcu);
        buildFMA(h.fma);
        buildPFD(h.pfd);
        buildND(h.map);
        help = h.help;
        readout = h.readout;
        const rngTxt = () => { if (h.ndRange) h.ndRange.textContent = F.range + ' NM'; };
        const step = (d) => {
            const i = ND_RANGES.indexOf(F.range);
            F.range = ND_RANGES[clamp((i < 0 ? 2 : i) + d, 0, ND_RANGES.length - 1)];
            rngTxt();
            if (A.snd && A.snd.click) A.snd.click();
        };
        if (h.zoomIn) h.zoomIn.addEventListener('click', () => step(-1));
        if (h.zoomOut) h.zoomOut.addEventListener('click', () => step(1));
        fcu.syncEfis = () => {
            rngTxt();
            if (h.ndModes) h.ndModes.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === fcu.ndMode)));
        };
        if (h.ndModes) h.ndModes.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
            fcu.ndMode = b.dataset.mode;
            fcu.syncEfis();
            if (A.snd && A.snd.click) A.snd.click();
        }));
        fcu.syncEfis();
    };

    fcu.renderFast = function () { renderPFD(); renderND(); };
    fcu.renderSlow = function () {
        renderPanel();
        renderFMA();
        const txt = F.power ? modeHelp() : 'FCU 沒有電：到頂板打開 BAT 1、BAT 2，或接上地面電源。';
        set1(help, txt);
        if (readout) {
            const r = F.power && F.phase !== 'GND' ? `速度 ${Math.round(F.ias)} 節（M${machOf(Math.max(1, F.ias), F.alt).toFixed(2)}）　高度 ${Math.round(F.alt)} 呎（離地 ${Math.round(agl())}）　航向 ${pad(toReal(F.hdg), 3)}°　垂直速度 ${Math.round(F.vs / 10) * 10} 呎／分` : '';
            set1(readout, r);
        }
    };
    function set1(node, txt) {
        if (!node) return;
        if (node.textContent !== txt) node.textContent = txt;
    }

    // ---------- 給 MCDU 和 ND 用的資料 ----------
    const utc = (msAhead) => { const d = new Date(Date.now() + msAhead); return String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0'); };
    function phaseName() {
        if (F.phase === 'GND') return F.touchdownMsg ? 'DONE' : 'PREFLIGHT';
        if (F.phase === 'ROLL') return 'DONE';
        if (F.phase === 'TO' || (F.vert === 'SRS' && !F.ga)) return 'TAKE OFF';
        if (F.ga) return 'GO AROUND';
        if (F.apprArm || LAT_APP.includes(F.lat) || VERT_APP.includes(F.vert) || F.handFly) return 'APPR';
        if (['CLB', 'OP CLB'].includes(F.vert) || F.vs > 500) return 'CLB';
        if (['DES', 'OP DES'].includes(F.vert) || F.vs < -500) return 'DES';
        return 'CRZ';
    }
    const altStr = (a) => (a >= 11000 ? 'FL' + String(Math.round(a / 100)).padStart(3, '0') : String(Math.round(a / 10) * 10));
    fcu.api = {
        runway, toReal, agl, capability, phase: phaseName, cfg,
        icao: () => (runway().name.match(/[A-Z]{4}/) || ['ZZZZ'])[0],
        // 飛行計畫：FROM（上一個航點）、TO、之後的航點、目的地跑道
        plan() {
            const r = F.route;
            const gs = F.phase === 'AIR' ? Math.max(120, F.gsKt) : 250;
            const out = [];
            const rwName = 'RW' + runway().rwy;
            out.push({ type: 'from', n: F.wp > 0 ? r[F.wp - 1].n : F.phase === 'AIR' ? 'PPOS' : rwName, x: F.x, y: F.y, dist: 0, brg: 0, eta: '', spd: '', alt: '' });
            let px = F.x, py = F.y, cum = 0;
            const legs = r.slice(F.wp).map((w, k) => ({ w, idx: F.wp + k })).concat([{ w: { x: 0, y: 0, n: rwName }, idx: -1 }]);
            // 航路最後一點不是進場點時，和目的地之間是航路中斷（F-PLN DISCONTINUITY）
            const disc = r.length > 0 && !/^(CF|FF)/.test(r[r.length - 1].n) && F.wp < r.length;
            legs.forEach(({ w, idx }, k) => {
                if (idx < 0 && disc) out.push({ type: 'disc', n: '', x: px, y: py });
                const d = Math.hypot(w.x - px, w.y - py);
                cum += d;
                const brg = Math.round(toReal(Math.atan2(w.x - px, w.y - py) * R2D)) % 360 || 360;
                const dest = idx < 0;
                let alt, spd;
                if (dest) { alt = String(Math.round(F.elev)); spd = '---'; }
                else if (/^(CF|FF)/.test(w.n)) { alt = String(Math.round(gpAlt(w.x) / 10) * 10); spd = w.n.startsWith('FF') ? '160' : '180'; }
                else { const a = F.phase === 'AIR' ? Math.max(F.alt, F.altSel) : F.altSel; alt = altStr(a); spd = a >= 26000 ? '.78' : '250'; }
                out.push({ type: dest ? 'dest' : k === 0 ? 'to' : 'wpt', n: w.n, idx, x: w.x, y: w.y, dist: dest ? cum : d, legDist: d, cum, brg, eta: utc(cum / gs * 3600000), spd, alt });
                px = w.x; py = w.y;
            });
            return out;
        },
        dirTo(i) {
            if (i < 0 || i >= F.route.length) return false;
            F.wp = i;
            F.hdgMgd = true; F.hdgPreset = false;
            if (F.phase === 'AIR' && apOn() && !LAT_APP.includes(F.lat) && !['GA TRK', 'RWY', 'ROLL OUT'].includes(F.lat)) F.lat = 'NAV';
            A.toast(`DIR TO ${F.route[i].n}：直飛這個航點${F.lat === 'NAV' ? '，NAV 模式已接上' : '（按 HDG 旋鈕推入就會用 NAV 飛過去）'}。`);
            fcu.invalidate();
            return true;
        },
        getDH: () => F.dh, getMDA: () => F.mda, getVR: () => F.vr,
        setDH(v) { F.dh = v; fcu.invalidate(); },
        setMDA(v) { F.mda = v; fcu.invalidate(); },
        setVR(v) { F.vr = v; },
        vapp: () => 123 + 5 + Math.min(15, Math.round(Math.max(0, fcu.windComp().head) / 3)),
        windComp: () => fcu.windComp()
    };

    fcu.canTakeoff = () => F.phase === 'GND' && F.power && A.sys.enginesRunning() === 2;
})(window);
