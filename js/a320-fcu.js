// FCU（飛行控制單元）、簡化的飛行模型、PFD 精簡版、平面地圖。
// 座標：x 向東、y 向北（海里）。跑道 09 的入口在原點，跑道向東延伸 1.5 海里，航向 090。
// 這是教學示意：沒有風、沒有襟翼和起落架的細節，物理量都是簡化的。
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
            range: 40, touchdownMsg: ''
        };
        Object.keys(F).forEach((k) => delete F[k]);
        Object.assign(F, base);
        if (name === 'cruise') {
            Object.assign(F, {
                phase: 'AIR', x: -40, y: 0, alt: 35000, hdg: 74, ap1: true, athr: true,
                spdMgd: true, hdgMgd: true, altSel: 35000, holdAlt: 35000, lat: 'NAV', vert: 'ALT', thrust: 0.78, range: 80, hdgSel: 74
            });
            F.ias = iasFromMach(0.78, 35000);
        } else if (name === 'ils') {
            Object.assign(F, {
                phase: 'AIR', x: -14, y: -2.5, alt: 3000, hdg: 60, ias: 180, ap1: true, athr: true,
                spdSel: 180, hdgSel: 60, altSel: 3000, holdAlt: 3000, lat: 'HDG', vert: 'ALT', thrust: 0.45, range: 15
            });
        } else {
            F.range = 10;
            F.hdgSel = 90;
            F.altSel = 5000;
        }
        F.power = A.sys.power();
        F.trail = [];
        fcu.invalidate();
    };

    // ---------- 速度目標 ----------
    function managedIas() {
        if (F.apprArm || F.lat === 'LOC*' || F.lat === 'LOC' || F.lat === 'LAND') {
            if (F.alt < 1000) return 135;
            if (F.alt < 4000) return 135 + ((F.alt - 1000) / 3000) * 55;
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
    const gpAlt = (x) => 50 + Math.max(0, -x) * 6076 * GP_TAN;
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
        // LOC 截獲
        if (F.locArm && F.lat !== 'LOC*' && F.lat !== 'LOC' && F.lat !== 'LAND' && ilsValid() && F.x < 0) {
            const gs = tasFromIas(F.ias, F.alt);
            const ydot = (gs / 3600) * Math.sin((F.hdg - RWY_HDG) * D2R);
            const lead = 0.3 + 18 * Math.abs(ydot);
            if (Math.abs(F.y) < lead && Math.abs(wrap180(F.hdg - RWY_HDG)) < 75) {
                F.lat = 'LOC*';
                F.locArm = false;
                F.hdgMgd = false;
                A.toast('LOC*：截獲航向台');
            }
        }
        if (F.lat === 'LOC*' && Math.abs(F.y) < 0.12 && Math.abs(wrap180(F.hdg - RWY_HDG)) < 10) F.lat = 'LOC';
        // G/S 截獲（只能由下往上）
        if (F.apprArm && (F.lat === 'LOC*' || F.lat === 'LOC') && !['G/S*', 'G/S', 'LAND', 'FLARE'].includes(F.vert)) {
            const delta = F.alt - gpAlt(F.x);
            if (delta >= -35 && delta <= 110 && F.x < -0.5) {
                F.vert = 'G/S*';
                F.apprArm = false;
                A.toast('G/S*：截獲下滑道');
            }
        }
        if (F.vert === 'G/S*' && Math.abs(F.alt - gpAlt(F.x)) < 20) F.vert = 'G/S';
        // LAND / FLARE
        if ((F.vert === 'G/S' || F.vert === 'G/S*') && F.lat === 'LOC' && F.alt < 400) { F.lat = 'LAND'; F.vert = 'LAND'; }
        if ((F.vert === 'LAND' || F.vert === 'G/S') && F.alt < 40) F.vert = 'FLARE';
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
            case 'G/S*': case 'G/S': case 'LAND': {
                const err = F.alt - gpAlt(F.x);
                return -(gs * 5.3) - clamp(err * 2.5, -500, 500);
            }
            case 'FLARE': return -clamp(F.alt * 6, 120, 700);
            default: return F.vs; // 沒有自動駕駛：維持目前的垂直速度
        }
    }

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

    function latCmd() {
        switch (F.lat) {
            case 'HDG': return F.hdgSel;
            case 'NAV': return navBearing();
            case 'LOC*': case 'LOC': case 'LAND': return RWY_HDG + clamp(F.y * 25, -40, 40);
            case 'RWY': case 'ROLL OUT': return RWY_HDG;
            default: return F.hdg;
        }
    }

    // ---------- 自動駕駛開關 ----------
    function engageDefaults() {
        if (!F.lat) {
            if (F.hdgMgd && F.route.length && F.wp < F.route.length) F.lat = 'NAV';
            else { F.lat = 'HDG'; F.hdgSel = Math.round(F.hdg) % 360 || 360; F.hdgMgd = false; F.hdgPreset = false; }
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
        if (F.lat === 'LOC*' || F.lat === 'LOC') {
            F.lat = 'HDG'; F.hdgSel = Math.round(F.hdg) % 360 || 360; F.hdgMgd = false; F.apprArm = false;
            if (['G/S*', 'G/S'].includes(F.vert)) { F.vert = 'V/S'; F.vsSel = Math.round(F.vs / 100) * 100; }
        } else {
            F.locArm = !F.locArm;
            if (!F.locArm) F.apprArm = false;
        }
        fcu.invalidate();
    }

    function pressAPPR() {
        if (!needAP('APPR 需要自動駕駛：先按 AP1。')) return;
        const engaged = F.lat === 'LOC*' || F.lat === 'LOC' || ['G/S*', 'G/S'].includes(F.vert);
        if (F.apprArm || engaged) {
            F.apprArm = false;
            if (!engaged) F.locArm = false;
            else {
                F.lat = 'HDG'; F.hdgSel = Math.round(F.hdg) % 360 || 360; F.hdgMgd = false;
                if (['G/S*', 'G/S'].includes(F.vert)) { F.vert = 'V/S'; F.vsSel = Math.round(F.vs / 100) * 100; }
            }
        } else { F.apprArm = true; F.locArm = F.lat !== 'LOC*' && F.lat !== 'LOC'; }
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
            if (F.phase === 'AIR' && apOn() && !['LOC*', 'LOC', 'LAND'].includes(F.lat)) {
                if (F.route.length && F.wp < F.route.length) { F.lat = 'NAV'; A.toast('NAV：沿著航線飛。'); }
                else { A.toast('這個情境沒有可飛的航線，維持目前航向。'); F.hdgMgd = false; }
            }
        },
        hdgPull() {
            if (!F.power) return;
            if (F.hdgMgd && !F.hdgPreset) F.hdgSel = Math.round(F.hdg) % 360 || 360;
            F.hdgMgd = false; F.hdgPreset = false;
            if (F.phase === 'AIR' && apOn() && F.lat !== 'RWY') {
                if (['LOC*', 'LOC'].includes(F.lat)) { F.locArm = F.apprArm = false; if (['G/S*', 'G/S'].includes(F.vert)) { F.vert = 'V/S'; F.vsSel = round100(F.vs); } }
                if (F.lat !== 'LAND') F.lat = 'HDG';
            }
        },
        altTurn(d) { if (!F.power) return; F.altSel = clamp(F.altSel + d * F.altStep, 100, 49000); },
        altRing() { if (!F.power) return; F.altStep = F.altStep === 100 ? 1000 : 100; },
        altGo(managed) {
            if (!F.power) return;
            if (!needAP('先接上 AP1，才能用高度旋鈕啟動爬升或下降。')) return;
            if (['G/S*', 'G/S', 'LAND', 'FLARE', 'SRS'].includes(F.vert)) return;
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
            if (['G/S*', 'G/S', 'LAND', 'FLARE', 'SRS'].includes(F.vert)) return;
            if (!F.vsPreset) F.vsSel = round100(F.vs);
            F.vsPreset = false; F.expedite = false; F.vert = 'V/S';
        },
        vsPush() {
            if (!F.power || !needAP('先接上 AP1，才能用 V/S。')) return;
            if (['G/S*', 'G/S', 'LAND', 'FLARE', 'SRS'].includes(F.vert)) return;
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
        F.phase = 'TO'; F.x = 0.05; F.y = 0; F.hdg = RWY_HDG; F.lat = 'RWY'; F.vert = 'SRS'; F.vs = 0;
        F.touchdownMsg = '';
        F.athr = true;
        A.toast('起飛推力。到 150 節自動抬輪；離地後按 AP1，到 1500 呎會自動轉成爬升。');
        fcu.invalidate();
    };

    function land(vsAtTouch) {
        F.phase = 'ROLL';
        F.gearDown = true;
        F.alt = 0; F.vs = 0; F.bank = 0; F.pitch = 0;
        F.ap1 = F.ap2 = false; F.athr = false;
        F.lat = 'ROLL OUT'; F.vert = ''; F.locArm = F.apprArm = false; F.expedite = false;
        F.touchdownMsg = vsAtTouch < -900 ? '重落地（下降率 ' + Math.round(-vsAtTouch) + ' 呎／分）' : '接地，下降率 ' + Math.round(-vsAtTouch) + ' 呎／分';
        A.toast(F.touchdownMsg + '。減速滑行中。');
        if (A.snd) A.snd.touch(vsAtTouch);
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
            F.x += (v / 3600) * dt;
            if (F.ias >= 150) { F.phase = 'AIR'; F.alt = 1; F.gearDown = true; A.toast('V1、抬輪。'); }
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

        // SRS 到 1500 呎後轉成爬升
        if (F.vert === 'SRS' && F.alt >= 1500) {
            if (apOn()) {
                F.lat = F.hdgMgd && F.route.length ? 'NAV' : 'HDG';
                if (F.lat === 'HDG' && F.hdgMgd) F.hdgMgd = false;
                F.vert = F.altSel > F.alt + 100 ? (F.spdMgd ? 'CLB' : 'OP CLB') : 'ALT';
                if (F.vert === 'ALT') F.holdAlt = F.altSel;
                A.toast('1500 呎：轉成爬升模式。');
            } else if (!F.warnedAp) {
                F.warnedAp = true;
                A.toast('1500 呎了還沒接 AP：按 AP1，不然飛機只會維持目前的爬升率。');
                F.lat = ''; F.vert = '';
            }
        }
        if (!F.vert && !apOn()) F.warnedAp = false;

        const tgt = targetIas();
        const tas = tasFromIas(F.ias, F.alt);
        const gs = tas;

        // 垂直速度
        const cmd = vertCmd(tgt, gs);
        const manual = !apOn() && F.vert !== 'SRS';
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
        const hdgTarget = (apOn() || F.lat === 'RWY') ? latCmd() : F.hdg;
        const err = wrap180(hdgTarget - F.hdg);
        const V = tas * 0.5144;
        const bankMax = 25;
        const bankCmd = apOn() || F.lat === 'RWY' ? clamp(err * 1.1, -bankMax, bankMax) : 0;
        F.bank += (bankCmd - F.bank) * Math.min(1, dt / 1.2);
        const turn = Math.min(3, Math.abs(9.81 * Math.tan(F.bank * D2R) / V) * R2D) * Math.sign(F.bank);
        F.hdg = wrap360(F.hdg + turn * dt);

        // 位置和高度
        F.x += (gs / 3600) * Math.sin(F.hdg * D2R) * dt;
        F.y += (gs / 3600) * Math.cos(F.hdg * D2R) * dt;
        F.alt = clamp(F.alt + (F.vs / 60) * dt, 0, 41000);

        // 姿態角（顯示用）
        const gamma = Math.atan2(F.vs, tas * 101.27) * R2D;
        const aoa = clamp(3 + (200 - F.ias) * 0.04, 1.5, 8);
        F.pitch = gamma + aoa;

        F.gearDown = F.alt < 2300 && (['LOC*', 'LOC', 'LAND'].includes(F.lat) || ['G/S*', 'G/S', 'LAND', 'FLARE'].includes(F.vert) || F.vert === 'SRS');

        if (F.alt <= 0 && F.vs <= 0) { land(F.vs); return; }

        // 軌跡
        F.trailT = (F.trailT || 0) + dt;
        if (F.trailT >= 4) { F.trailT = 0; F.trail.push([F.x, F.y]); if (F.trail.length > 90) F.trail.shift(); }
    };

    // ---------- 說明文字 ----------
    function vertHelp() {
        const tgt = pad(F.altSel, 0);
        switch (F.vert) {
            case 'SRS': return '起飛中：SRS 用俯仰維持起飛速度（V2＋10 節），到 1500 呎轉成爬升。';
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
            default: return apOn() || F.phase !== 'AIR' ? '' : 'AP 沒有接上：飛機維持目前的航向和垂直速度，不會自動修正。';
        }
    }
    function latHelp() {
        switch (F.lat) {
            case 'HDG': return `HDG：飛選定航向 ${pad(F.hdgSel, 3)}°。`;
            case 'NAV': return F.wp < F.route.length ? `NAV：沿航線飛向 ${F.route[F.wp].n}。` : 'NAV：航線結束，維持最後的航向。';
            case 'LOC*': return 'LOC*：正在截獲航向台中心線。';
            case 'LOC': return 'LOC：沿著航向台中心線（跑道 09，航向 090）。';
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
            loc: F.power && (F.locArm || F.lat === 'LOC*' || F.lat === 'LOC' || F.lat === 'LAND'),
            appr: F.power && (F.apprArm || ['G/S*', 'G/S', 'LAND', 'FLARE'].includes(F.vert)),
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
        if (F.phase === 'TO') thr = 'MAN TOGA';
        else if (F.athr && F.phase === 'AIR') thr = ['OP CLB', 'CLB'].includes(F.vert) ? 'THR CLB' : ['OP DES', 'DES'].includes(F.vert) ? 'THR IDLE' : usingMach() ? 'MACH' : 'SPEED';
        fmaSet(0, thr, thr === 'MAN TOGA' ? 'w' : 'g', '', '');
        // 垂直
        let v1 = F.vert, armedV = '', armedC = 'b';
        if (F.expedite && v1) v1 += ' ·EXPED';
        const heading = ['OP CLB', 'OP DES', 'CLB', 'DES', 'V/S'].includes(F.vert) && Math.abs(F.vs) > 50 && Math.sign(F.altSel - F.alt) === Math.sign(F.vs);
        if (heading) armedV = 'ALT';
        if (F.apprArm && !['G/S*', 'G/S', 'LAND', 'FLARE'].includes(F.vert)) armedV = armedV ? armedV + ' G/S' : 'G/S';
        fmaSet(1, v1, 'g', armedV, armedC);
        // 橫向
        const l2 = F.locArm ? 'LOC' : '';
        fmaSet(2, F.lat, 'g', l2, 'b');
        // 進場能力
        const appr = (F.apprArm || ['LOC*', 'LOC', 'LAND'].includes(F.lat)) && apOn();
        fmaSet(3, appr ? (F.ap1 && F.ap2 ? 'CAT3' : 'CAT2') : '', 'w', appr ? (F.ap1 && F.ap2 ? 'DUAL' : 'SINGLE') : '', 'w');
        // 自動駕駛
        const apTxt = F.ap1 && F.ap2 ? 'AP1+2' : F.ap1 ? 'AP1' : F.ap2 ? 'AP2' : '';
        fmaSet(4, apTxt, 'w', F.athr ? 'A/THR' : '', F.phase === 'AIR' ? 'w' : 'b');
    }

    // ---------- 畫面：PFD ----------
    let pfd = null;
    const PXD = 4.2;     // 每度俯仰的像素
    const PXK = 3.2;     // 每節
    const PXF = 0.32;    // 每呎
    const PXH = 3.4;     // 每度航向

    function buildPFD(host) {
        host.textContent = '';
        const svg = svgEl('svg', { viewBox: '0 0 400 300', class: 'ck-pfd-svg', role: 'img', 'aria-label': '主飛行顯示器（PFD）精簡版' });
        const defs = svgEl('defs', {}, svg);
        const clip = (id, x, y, w, h) => { const c = svgEl('clipPath', { id }, defs); svgEl('rect', { x, y, width: w, height: h }, c); };
        clip('cpAdi', 82, 20, 216, 200); clip('cpSpd', 6, 20, 64, 200); clip('cpAlt', 310, 20, 62, 200); clip('cpHdg', 82, 236, 216, 50);
        svgEl('rect', { x: 0, y: 0, width: 400, height: 300, class: 'pf-bg' }, svg);
        pfd = {};

        // 姿態
        const adiClip = svgEl('g', { 'clip-path': 'url(#cpAdi)' }, svg);
        pfd.adi = svgEl('g', {}, adiClip);
        svgEl('rect', { x: -400, y: -800, width: 800, height: 800, class: 'pf-sky' }, pfd.adi);
        svgEl('rect', { x: -400, y: 0, width: 800, height: 800, class: 'pf-gnd' }, pfd.adi);
        svgEl('line', { x1: -400, y1: 0, x2: 400, y2: 0, class: 'pf-hor' }, pfd.adi);
        for (let p = -30; p <= 30; p += 2.5) {
            if (p === 0) continue;
            const big = p % 10 === 0, mid = p % 5 === 0;
            const w = big ? 34 : mid ? 18 : 8;
            svgEl('line', { x1: -w, y1: -p * PXD, x2: w, y2: -p * PXD, class: 'pf-lad' }, pfd.adi);
            if (big) {
                [-1, 1].forEach((s) => {
                    const t = svgEl('text', { x: s * (w + 8), y: -p * PXD + 3.5, class: 'pf-t', 'text-anchor': 'middle' }, pfd.adi);
                    t.textContent = Math.abs(p);
                });
            }
        }
        pfd.roll = svgEl('g', {}, adiClip);   // 隨水平線轉動的橫滾指標
        svgEl('polygon', { points: '0,-98 -6,-108 6,-108', class: 'pf-roll' }, pfd.roll);
        const fix = svgEl('g', { transform: 'translate(190 120)' }, svg);
        [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60].forEach((a) => {
            const r1 = 98, r2 = Math.abs(a) % 30 === 0 || Math.abs(a) === 45 ? 108 : 103;
            svgEl('line', { x1: Math.sin(a * D2R) * r1, y1: -Math.cos(a * D2R) * r1, x2: Math.sin(a * D2R) * r2, y2: -Math.cos(a * D2R) * r2, class: 'pf-tick' }, fix);
        });
        svgEl('polygon', { points: '0,-98 -5,-90 5,-90', class: 'pf-idx' }, fix);
        svgEl('path', { d: 'M-62 0 H-26 V8 M62 0 H26 V8', class: 'pf-ac' }, fix);
        svgEl('rect', { x: -3, y: -3, width: 6, height: 6, class: 'pf-ac-dot' }, fix);

        // LOC / G/S
        pfd.ils = svgEl('g', { class: 'pf-ils' }, svg);
        for (let i = -2; i <= 2; i++) {
            if (i === 0) svgEl('line', { x1: 190, y1: 207, x2: 190, y2: 217, class: 'pf-ilsc' }, pfd.ils);
            else svgEl('circle', { cx: 190 + i * 24, cy: 212, r: 2.6, class: 'pf-dot' }, pfd.ils);
            if (i === 0) svgEl('line', { x1: 284, y1: 120, x2: 292, y2: 120, class: 'pf-ilsc' }, pfd.ils);
            else svgEl('circle', { cx: 288, cy: 120 + i * 22, r: 2.6, class: 'pf-dot' }, pfd.ils);
        }
        pfd.locD = svgEl('polygon', { points: '0,-6 6,0 0,6 -6,0', class: 'pf-dia' }, pfd.ils);
        pfd.gsD = svgEl('polygon', { points: '0,-6 6,0 0,6 -6,0', class: 'pf-dia' }, pfd.ils);

        // 速度帶
        svgEl('rect', { x: 6, y: 20, width: 64, height: 200, class: 'pf-tape' }, svg);
        const sg = svgEl('g', { 'clip-path': 'url(#cpSpd)' }, svg);
        pfd.spdTape = svgEl('g', {}, sg);
        for (let v = 30; v <= 400; v += 10) {
            const y = -v * PXK;
            svgEl('line', { x1: 56, y1: y, x2: 70, y2: y, class: 'pf-tick' }, pfd.spdTape);
            if (v % 20 === 0) { const t = svgEl('text', { x: 50, y: y + 4, class: 'pf-t', 'text-anchor': 'end' }, pfd.spdTape); t.textContent = v; }
        }
        pfd.spdBug = svgEl('polygon', { points: '70,0 60,-6 60,6', class: 'pf-bug' }, svg);
        svgEl('polygon', { points: '6,108 54,108 54,114 66,120 54,126 54,132 6,132', class: 'pf-box' }, svg);
        pfd.spdTxt = svgEl('text', { x: 50, y: 126, class: 'pf-big', 'text-anchor': 'end' }, svg);
        pfd.mach = svgEl('text', { x: 38, y: 232, class: 'pf-t pf-g', 'text-anchor': 'middle' }, svg);
        pfd.spdSel = svgEl('text', { x: 38, y: 14, class: 'pf-t pf-c', 'text-anchor': 'middle' }, svg);

        // 高度帶
        svgEl('rect', { x: 310, y: 20, width: 62, height: 200, class: 'pf-tape' }, svg);
        const ag = svgEl('g', { 'clip-path': 'url(#cpAlt)' }, svg);
        pfd.altTape = svgEl('g', {}, ag);
        pfd.altPool = [];
        for (let i = 0; i < 12; i++) {
            const ln = svgEl('line', { x1: 310, x2: 322, class: 'pf-tick' }, pfd.altTape);
            const tx = svgEl('text', { x: 328, class: 'pf-t' }, pfd.altTape);
            pfd.altPool.push([ln, tx]);
        }
        pfd.altBug = svgEl('polygon', { points: '310,0 320,-6 320,6', class: 'pf-bug pf-bug-c' }, svg);
        svgEl('polygon', { points: '374,108 330,108 330,114 318,120 330,126 330,132 374,132', class: 'pf-box' }, svg);
        pfd.altTxt = svgEl('text', { x: 371, y: 125, class: 'pf-big', 'text-anchor': 'end' }, svg);
        pfd.altTxt.style.fontSize = '13px';
        pfd.altSel = svgEl('text', { x: 341, y: 14, class: 'pf-t pf-c', 'text-anchor': 'middle' }, svg);

        // V/S
        svgEl('rect', { x: 376, y: 20, width: 20, height: 200, class: 'pf-tape' }, svg);
        [-2, -1, 0, 1, 2].forEach((m) => {
            const y = 120 - m * 42;
            svgEl('line', { x1: 378, y1: y, x2: 386, y2: y, class: 'pf-tick' }, svg);
        });
        pfd.vsPtr = svgEl('line', { x1: 376, y1: 120, x2: 395, y2: 120, class: 'pf-vs' }, svg);
        pfd.vsTxt = svgEl('text', { x: 394, y: 232, class: 'pf-t pf-g', 'text-anchor': 'end' }, svg);

        // 航向帶
        svgEl('rect', { x: 82, y: 236, width: 216, height: 50, class: 'pf-tape' }, svg);
        const hg = svgEl('g', { 'clip-path': 'url(#cpHdg)' }, svg);
        pfd.hdgPool = [];
        for (let i = 0; i < 16; i++) {
            const ln = svgEl('line', { y1: 236, class: 'pf-tick' }, hg);
            const tx = svgEl('text', { y: 262, class: 'pf-t', 'text-anchor': 'middle' }, hg);
            pfd.hdgPool.push([ln, tx]);
        }
        pfd.hdgBug = svgEl('polygon', { points: '0,236 -6,246 6,246', class: 'pf-bug pf-bug-c' }, svg);
        svgEl('polygon', { points: '190,236 184,226 196,226', class: 'pf-idx' }, svg);
        pfd.hdgTxt = svgEl('text', { x: 190, y: 222, class: 'pf-t pf-g', 'text-anchor': 'middle' }, svg);
        pfd.hdgTxt.setAttribute('dy', '-1');

        // 旗標
        pfd.flag = svgEl('text', { x: 190, y: 120, class: 'pf-flag', 'text-anchor': 'middle' }, svg);
        host.append(svg);
        pfd.svg = svg;
        pfd.host = host;
    }

    function renderPFD() {
        if (!pfd) return;
        const on = F.power;
        pfd.host.classList.toggle('off', !on);
        if (!on) return;
        const att = A.sys.attOK() > 0;
        pfd.flag.textContent = att ? '' : 'ATT';
        const bank = att ? F.bank : 0, pitch = att ? F.pitch : 0;
        pfd.adi.setAttribute('transform', `translate(190 120) rotate(${(-bank).toFixed(2)}) translate(0 ${(pitch * PXD).toFixed(2)})`);
        pfd.roll.setAttribute('transform', `translate(190 120) rotate(${(-bank).toFixed(2)})`);
        pfd.svg.classList.toggle('noatt', !att);

        // 速度
        const ias = Math.max(30, F.ias);
        pfd.spdTape.setAttribute('transform', `translate(0 ${(120 + ias * PXK).toFixed(2)})`);
        pfd.spdTxt.textContent = Math.round(F.ias);
        const tgt = F.phase === 'AIR' ? targetIas() : null;
        if (tgt !== null) {
            const y = clamp(120 - (tgt - ias) * PXK, 28, 212);
            pfd.spdBug.setAttribute('transform', `translate(0 ${y.toFixed(1)})`);
            pfd.spdBug.setAttribute('class', 'pf-bug ' + (F.spdMgd ? 'pf-bug-m' : 'pf-bug-c'));
            pfd.spdBug.style.display = '';
        } else pfd.spdBug.style.display = 'none';
        const m = machOf(Math.max(1, F.ias), F.alt);
        pfd.mach.textContent = m >= 0.5 ? 'M ' + m.toFixed(2).replace(/^0/, '') : '';
        pfd.spdSel.textContent = '';

        // 高度
        const alt = F.alt;
        const base = Math.floor(alt / 100) * 100 - 500;
        pfd.altPool.forEach(([ln, tx], i) => {
            const v = base + i * 100;
            const y = 120 - (v - alt) * PXF;
            ln.setAttribute('y1', y.toFixed(1)); ln.setAttribute('y2', y.toFixed(1));
            ln.style.display = v < 0 ? 'none' : '';
            const lab = v >= 0 && v % 200 === 0;
            tx.style.display = lab ? '' : 'none';
            if (lab) { tx.setAttribute('y', (y + 4).toFixed(1)); tx.textContent = v; }
        });
        pfd.altTxt.textContent = Math.round(alt / 20) * 20;
        pfd.altBug.setAttribute('transform', `translate(0 ${clamp(120 - (F.altSel - alt) * PXF, 28, 212).toFixed(1)})`);
        pfd.altSel.textContent = F.altSel;
        const vs = F.vs;
        const vy = Math.abs(vs) <= 2000 ? vs * 0.021 : Math.sign(vs) * (42 + Math.min(1, (Math.abs(vs) - 2000) / 4000) * 40);
        pfd.vsPtr.setAttribute('y2', (120 - vy).toFixed(1));
        pfd.vsTxt.textContent = Math.abs(vs) >= 100 ? (vs > 0 ? '+' : '−') + Math.round(Math.abs(vs) / 100) * 100 : '';

        // 航向
        const h = F.hdg;
        const b0 = Math.floor(h / 5) * 5 - 40;
        pfd.hdgPool.forEach(([ln, tx], i) => {
            const v = b0 + i * 5;
            const x = 190 + wrap180(v - h) * PXH;
            ln.setAttribute('x1', x.toFixed(1)); ln.setAttribute('x2', x.toFixed(1));
            ln.setAttribute('y2', v % 10 === 0 ? 248 : 243);
            const lab = ((v % 10) + 10) % 10 === 0;
            tx.style.display = lab ? '' : 'none';
            if (lab) { tx.setAttribute('x', x.toFixed(1)); const hn = wrap360(v) / 10; tx.textContent = pad(hn === 0 ? 36 : hn, 2); }
        });
        pfd.hdgTxt.textContent = pad(wrap360(h), 3);
        const hb = F.hdgMgd ? null : F.hdgSel;
        if (hb !== null && F.phase === 'AIR') {
            const x = clamp(190 + wrap180(hb - h) * PXH, 90, 290);
            pfd.hdgBug.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
            pfd.hdgBug.style.display = '';
        } else pfd.hdgBug.style.display = 'none';

        // LOC / GS
        const showIls = F.phase === 'AIR' && (F.locArm || F.apprArm || ['LOC*', 'LOC', 'LAND'].includes(F.lat)) && ilsValid();
        pfd.ils.style.display = showIls ? '' : 'none';
        if (showIls) {
            const ld = clamp(locDots(), -2.6, 2.6);
            pfd.locD.setAttribute('transform', `translate(${(190 + ld * 24).toFixed(1)} 212)`);
            const gd = clamp(gsDots(), -2.6, 2.6);
            pfd.gsD.setAttribute('transform', `translate(288 ${(120 - gd * 22).toFixed(1)})`);
        }
    }

    // ---------- 畫面：平面地圖 ----------
    let map = null;
    const RANGES = [5, 10, 20, 40, 80, 160];
    function buildMap(host) {
        host.textContent = '';
        const svg = svgEl('svg', { viewBox: '-100 -100 200 200', class: 'ck-map-svg', role: 'img', 'aria-label': '平面地圖，北方朝上' });
        map = { svg };
        map.rings = svgEl('g', { class: 'mp-rings' }, svg);
        map.world = svgEl('g', {}, svg);
        map.loc = svgEl('line', { class: 'mp-loc' }, map.world);
        map.rwy = svgEl('line', { class: 'mp-rwy' }, map.world);
        map.route = svgEl('polyline', { class: 'mp-route', fill: 'none' }, map.world);
        map.wps = svgEl('g', {}, map.world);
        map.trail = svgEl('polyline', { class: 'mp-trail', fill: 'none' }, map.world);
        map.ac = svgEl('g', {}, svg);
        svgEl('polygon', { points: '0,-7 5,6 0,3 -5,6', class: 'mp-ac' }, map.ac);
        map.scale = svgEl('text', { x: -96, y: 96, class: 'mp-t' }, svg);
        host.append(svg);
    }
    function renderMap() {
        if (!map) return;
        const R = F.range;
        const s = 90 / R;
        const P = (x, y) => [((x - F.x) * s).toFixed(1), (-(y - F.y) * s).toFixed(1)];
        const key = 'map' + R;
        if (cache[key] !== true) {
            cache[key] = true;
            map.rings.textContent = '';
            [0.5, 1].forEach((f) => svgEl('circle', { cx: 0, cy: 0, r: 90 * f, class: 'mp-ring' }, map.rings));
            map.scale.textContent = `${R} NM`;
        }
        const set2 = (ln, a, b) => { ln.setAttribute('x1', a[0]); ln.setAttribute('y1', a[1]); ln.setAttribute('x2', b[0]); ln.setAttribute('y2', b[1]); };
        set2(map.rwy, P(0, 0), P(1.5, 0));
        set2(map.loc, P(-26, 0), P(0, 0));
        map.loc.style.display = F.scenario === 'ils' || F.locArm || F.apprArm ? '' : 'none';
        map.route.setAttribute('points', F.route.length ? [[F.x, F.y]].concat(F.route.slice(F.wp).map((w) => [w.x, w.y])).map((p) => P(p[0], p[1]).join(',')).join(' ') : '');
        map.wps.textContent = '';
        F.route.forEach((w, i) => {
            const p = P(w.x, w.y);
            if (Math.abs(p[0]) > 98 || Math.abs(p[1]) > 98) return;
            const c = svgEl('circle', { cx: p[0], cy: p[1], r: 2.6, class: 'mp-wp' + (i === F.wp ? ' act' : '') }, map.wps);
            void c;
            const t = svgEl('text', { x: Number(p[0]) + 5, y: Number(p[1]) + 3, class: 'mp-t' }, map.wps);
            t.textContent = w.n;
        });
        map.trail.setAttribute('points', F.trail.map((p) => P(p[0], p[1]).join(',')).join(' '));
        map.ac.setAttribute('transform', `rotate(${F.hdg.toFixed(1)})`);
    }

    // ---------- 總渲染 ----------
    let help = null, readout = null;
    fcu.build = function (h) {
        buildFCU(h.fcu);
        buildFMA(h.fma);
        buildPFD(h.pfd);
        buildMap(h.map);
        help = h.help;
        readout = h.readout;
        if (h.zoomIn) h.zoomIn.addEventListener('click', () => { const i = RANGES.indexOf(F.range); F.range = RANGES[clamp(i - 1, 0, RANGES.length - 1)]; delete cache['map' + F.range]; cache = {}; });
        if (h.zoomOut) h.zoomOut.addEventListener('click', () => { const i = RANGES.indexOf(F.range); F.range = RANGES[clamp(i + 1, 0, RANGES.length - 1)]; cache = {}; });
    };

    fcu.renderFast = function () { renderPFD(); renderMap(); };
    fcu.renderSlow = function () {
        renderPanel();
        renderFMA();
        const txt = F.power ? modeHelp() : 'FCU 沒有電：到頂板打開 BAT 1、BAT 2，或接上地面電源。';
        set1(help, txt);
        if (readout) {
            const r = F.power && F.phase !== 'GND' ? `速度 ${Math.round(F.ias)} 節（M${machOf(Math.max(1, F.ias), F.alt).toFixed(2)}）　高度 ${Math.round(F.alt)} 呎　航向 ${pad(F.hdg, 3)}°　垂直速度 ${Math.round(F.vs / 10) * 10} 呎／分` : '';
            set1(readout, r);
        }
    };
    function set1(node, txt) {
        if (!node) return;
        const key = 'txt' + (node.id || '');
        if (cache[key] !== txt) { cache[key] = txt; node.textContent = txt; }
    }

    fcu.canTakeoff = () => F.phase === 'GND' && F.power && A.sys.enginesRunning() === 2;
})(window);
