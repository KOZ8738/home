// A320 頂板：系統狀態和邏輯（簡化版，只做教學示意，不是真實飛機資料）。
// 時間壓縮：ADIRS 對準 25 秒（實機約 10 分鐘）、APU 啟動 15 秒、引擎啟動 14 秒。模擬速度 4×、10× 會再加快。
(function (root) {
    'use strict';

    const A = root.A320;
    const U = A.ui;
    const el = U.el;
    const sys = A.sys = {};

    const ALIGN_T = 25, APU_T = 15, START_T = 14, DOWN_T = 8, IDLE_N2 = 63, IDLE_N1 = 19.5;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const approach = (v, to, rate, dt) => (v < to ? Math.min(to, v + rate * dt) : Math.max(to, v - rate * dt));

    let st = null;
    const DEF = {};   // 畫面上新增的按鈕預設值（build 時登記）
    const refs = { pb: {}, sel: {}, tg: {}, ir: [], live: {}, guard: {}, extra: [] };
    sys.state = null;

    function fresh() {
        return {
            pb: Object.assign({}, DEF, {
                bat1: false, bat2: false, ext: false, gen1: true, gen2: true, apugen: true, bustie: true,
                apumaster: false, apustart: false, apubleed: false, bleed1: true, bleed2: true, pack1: true, pack2: true,
                hydEng1: true, hydEng2: true, hydBlue: true, hydYel: false, ptu: true,
                fL1: true, fL2: true, fC1: true, fC2: true, fR1: true, fR2: true, xfeed: false,
                wai: false, eai1: false, eai2: false,
                elac1: true, elac2: true, sec1: true, sec2: true, sec3: true, fac1: true, fac2: true,
                fire1: false, fireapu: false, fire2: false, idg1: false, idg2: false,
                galy: true, commercial: true, acess: false,
                gpwsSys: true, gpwsGs: true, gpwsFlap: true, gpwsTerr: true,
                evacHorn: false, emerMan: false, rcdr: false, oxy: true,
                hotAir: true, ram: false, blower: false, extract: false,
                manStart1: false, manStart2: false, ditch: false, probe: false
            }),
            sel: {
                ir1: 'OFF', ir2: 'OFF', ir3: 'OFF', xbleed: 'AUTO', mode: 'NORM', m1: 'OFF', m2: 'OFF',
                strobe: 'AUTO', beacon: 'OFF', wing: 'OFF', navlogo: 'OFF', rwyto: 'OFF', landl: 'OFF', landr: 'OFF', nose: 'OFF',
                seat: 'OFF', nosmk: 'OFF', emer: 'ARM',
                evacCapt: 'CAPT', door: 'NORM', audioIntRad: 'INT', ldgElev: 'AUTO', ovhd: 'OFF', iceInd: 'OFF', cabVs: 'UP', cargoFwd: 'MED', cargoAft: 'MED', tempC: 'MED', tempF: 'MED', tempA: 'MED', flow: 'NORM', cabMode: 'AUTO', wipC: 'OFF', wipF: 'OFF', dome: 'OFF', ann: 'BRT'
            },
            flash: {},
            flt: {},
            cabAlt: null,
            rat: false,
            eng: [{ s: 'off', n2: 0, n1: 0, egt: 20, ff: 0 }, { s: 'off', n2: 0, n1: 0, egt: 20, ff: 0 }],
            apu: { s: 'off', n: 0, egt: 20 },
            ir: [{ p: 0 }, { p: 0 }, { p: 0 }],
            bat: [100, 100],
            hyd: { g: 0, b: 0, y: 0 },
            fuel: { L: 3400, C: 2600, R: 3400 },
            buses: { ac1: false, ac2: false, acess: false, dc1: false, dc2: false, dcbat: false, dcess: false, src: '', batOnly: false },
            air: { L: 0, R: 0 },
            extAvail: true,
            t: 0
        };
    }

    // ---------- 外部查詢 ----------
    const thrust = () => (A.fcu && A.fcu.state.thrust) || 0;
    const onGround = () => !A.fcu || A.fcu.state.phase !== 'AIR';
    sys.power = () => !!st.buses.dcess;
    sys.running = (i) => st.eng[i].s === 'run';
    sys.enginesRunning = () => (st.eng[0].s === 'run' ? 1 : 0) + (st.eng[1].s === 'run' ? 1 : 0);
    sys.navAligned = () => st.ir.reduce((n, r, i) => n + (st.sel['ir' + (i + 1)] === 'NAV' && r.p >= 1 ? 1 : 0), 0);
    sys.attOK = () => st.ir.reduce((n, r, i) => {
        const m = st.sel['ir' + (i + 1)];
        return n + ((m === 'NAV' && r.p >= 0.2) || (m === 'ATT' && r.p >= 1) ? 1 : 0);
    }, 0);
    sys.flightCtlOK = () => (st.pb.fac1 || st.pb.fac2) && (st.pb.elac1 || st.pb.elac2);
    sys.apuAvail = () => st.apu.s === 'run';
    sys.anyAC = () => st.buses.ac1 || st.buses.ac2;

    const extAvailNow = () => st.extAvail && onGround() && sys.enginesRunning() === 0;

    // ---------- 發動機啟動 ----------
    const pumpsOK = (i) => {
        const p = st.pb;
        const own = i === 0 ? (p.fL1 || p.fL2 || p.fC1 || p.fC2) : (p.fR1 || p.fR2 || p.fC1 || p.fC2);
        const other = i === 0 ? (p.fR1 || p.fR2) : (p.fL1 || p.fL2);
        return own || (p.xfeed && other);
    };

    function startBlocker(i) {
        if (!st.buses.dcbat) return '沒有電，發動機啟動不了。';
        const ef = st.flt['eng' + (i + 1) + 'fail'];
        if (ef && !ef.restartable) return `ENG ${i + 1} 已經損壞，無法重新啟動。`;
        if (i === 0 ? st.pb.fire1 : st.pb.fire2) return `ENG ${i + 1} FIRE 按鈕被按下，發動機鎖住了：先把它放開。`;
        if (st.sel.mode !== 'IGN/START') return 'ENG MODE 要先撥到 IGN/START，MASTER 才會開始啟動。';
        if (st.air[i === 0 ? 'L' : 'R'] < 25) return '沒有足夠的引氣：先開 APU 和 APU BLEED（或用另一具發動機的引氣）。';
        if (!sys.anyAC()) return '燃油泵需要交流電。';
        if (!pumpsOK(i)) return '這一側的燃油泵全都關了，先把燃油泵打開。';
        return '';
    }

    function setMaster(i, v) {
        const key = 'm' + (i + 1);
        const e = st.eng[i];
        if (v === 'ON') {
            if (e.s === 'run' || e.s === 'start') { st.sel[key] = 'ON'; return; }
            const why = startBlocker(i);
            if (why) { st.sel[key] = 'OFF'; A.toast(`ENG ${i + 1} MASTER 沒有啟動：${why}`); return; }
            st.sel[key] = 'ON';
            e.s = 'start';
            A.toast(`ENG ${i + 1} 啟動中，N2 升到慢車約需 ${START_T} 秒。`);
        } else {
            st.sel[key] = 'OFF';
            if (e.s === 'run' || e.s === 'start') { e.s = 'down'; }
        }
    }

    function apuStart() {
        const a = st.apu;
        if (st.flt.apuFire) { A.toast('APU 火警之後 APU 被鎖住，不能再啟動。'); return; }
        if (st.pb.fireapu) { A.toast('APU FIRE 按鈕被按下，APU 鎖住了：先把它放開。'); return; }
        if (!st.pb.apumaster) { A.toast('先把 APU MASTER SW 按下（ON 亮藍燈），再按 START。'); return; }
        if (!st.buses.dcbat) { A.toast('沒有電，APU 啟動不了。'); return; }
        if (a.s === 'off') { a.s = 'start'; a.n = 0; A.toast(`APU 啟動中，約 ${APU_T} 秒後 AVAIL。`); }
    }

    // ---------- 每一步 ----------
    sys.step = function (dt) {
        const p = st.pb, e = st.eng, a = st.apu, b = st.buses;
        st.t += dt;
        const th = thrust();
        if (A.fault) A.fault.step(dt);
        if (p.fire1 && (e[0].s === 'run' || e[0].s === 'start')) { e[0].s = 'down'; st.sel.m1 = 'OFF'; }
        if (p.fire2 && (e[1].s === 'run' || e[1].s === 'start')) { e[1].s = 'down'; st.sel.m2 = 'OFF'; }
        if (p.fireapu && (a.s === 'start' || a.s === 'run')) { a.s = 'down'; p.apumaster = false; }

        // 發動機
        for (let i = 0; i < 2; i++) {
            const en = e[i];
            const side = i === 0 ? 'L' : 'R';
            if (en.s === 'start') {
                if (st.air[side] >= 20) en.n2 += (IDLE_N2 / START_T) * dt;
                if (en.n2 >= IDLE_N2) { en.n2 = IDLE_N2; en.s = 'run'; A.toast(`ENG ${i + 1} 已達慢車。`); }
                const pr = clamp(en.n2 / IDLE_N2, 0, 1);
                en.n1 = IDLE_N1 * pr * pr;
                en.egt = 30 + 590 * (pr < 0.6 ? pr / 0.6 : 1 - ((pr - 0.6) / 0.4) * 0.25);
                en.ff = pr > 0.3 ? 120 + 160 * pr : 0;
            } else if (en.s === 'run') {
                const n1 = IDLE_N1 + th * 75;
                const n2 = IDLE_N2 + (n1 - IDLE_N1) * 0.45;
                en.n1 = approach(en.n1, n1, 14, dt);
                en.n2 = approach(en.n2, n2, 10, dt);
                en.egt = approach(en.egt, 450 + th * 220, 80, dt);
                en.ff = 280 + th * 1250;
            } else if (en.s === 'down') {
                en.n2 = Math.max(0, en.n2 - (IDLE_N2 / DOWN_T) * dt);
                en.n1 = Math.max(0, en.n1 - (IDLE_N1 / DOWN_T) * dt * 2);
                en.egt = Math.max(20, en.egt - 90 * dt);
                en.ff = 0;
                if (en.n2 <= 0) { en.n2 = 0; en.n1 = 0; en.s = 'off'; }
            } else {
                en.ff = 0;
                en.egt = Math.max(20, en.egt - 60 * dt);
            }
        }

        // APU
        if (!p.apumaster && (a.s === 'start' || a.s === 'run')) a.s = 'down';
        if (a.s === 'start') {
            a.n = Math.min(100, a.n + (100 / APU_T) * dt);
            a.egt = 30 + a.n * 5.2 * (a.n < 70 ? 1 : 1 - (a.n - 70) / 30 * 0.4);
            if (a.n >= 100) { a.s = 'run'; A.toast('APU AVAIL。可以開 APU BLEED 和 APU GEN 了。'); }
        } else if (a.s === 'run') {
            a.egt = approach(a.egt, 380, 40, dt);
        } else if (a.s === 'down') {
            a.n = Math.max(0, a.n - (100 / 6) * dt);
            a.egt = Math.max(20, a.egt - 60 * dt);
            if (a.n <= 0) a.s = 'off';
        } else a.egt = Math.max(20, a.egt - 40 * dt);
        p.apustart = false;

        // 電力
        const gen1 = p.gen1 && !p.idg1 && !p.fire1 && !st.flt.gen1 && e[0].n2 >= 50;
        const gen2 = p.gen2 && !p.idg2 && !p.fire2 && !st.flt.gen2 && e[1].n2 >= 50;
        const extOn = p.ext && extAvailNow();
        if (p.ext && !extOn && sys.enginesRunning() > 0) p.ext = false;
        const apuG = p.apugen && a.s === 'run';
        const gnd = extOn ? 'EXT' : apuG ? 'APU' : '';
        const tie = p.bustie;
        b.ac1 = gen1 || !!gnd || (tie && gen2);
        b.ac2 = gen2 || !!gnd || (tie && gen1);
        b.src = gen1 || gen2 ? 'GEN' : gnd;
        b.acess = b.ac1 || b.ac2;
        b.dc1 = b.ac1;
        b.dc2 = b.ac2;
        const anyBat = (p.bat1 && st.bat[0] > 0) || (p.bat2 && st.bat[1] > 0);
        b.batOnly = !b.dc1 && !b.dc2 && anyBat;
        b.dcbat = b.dc1 || b.dc2 || anyBat;
        b.dcess = b.dcbat;
        // 兩具發電機都掉了：ELEC EMER CONFIG，靠 RAT 帶動的應急發電機供 AC ESS
        const fl = A.fcu && A.fcu.state;
        st.rat = false;
        if (st.flt.elecEmer && !extOn && !apuG) {
            const ratOK = !!fl && fl.phase === 'AIR' && fl.ias >= 125;
            st.rat = ratOK;
            b.ac1 = b.ac2 = b.dc1 = b.dc2 = false;
            b.src = '';
            b.acess = ratOK;
            b.batOnly = !ratOK;
            b.dcbat = ratOK || anyBat;
            b.dcess = b.dcbat;
        }
        for (let i = 0; i < 2; i++) {
            const on = i === 0 ? p.bat1 : p.bat2;
            if (b.batOnly && on) st.bat[i] = Math.max(0, st.bat[i] - (100 / 2700) * dt);
            else if (on && (b.dc1 || b.dc2)) st.bat[i] = Math.min(100, st.bat[i] + (100 / 600) * dt);
        }

        // ADIRS
        st.ir.forEach((r, i) => {
            const m = st.sel['ir' + (i + 1)];
            if (!b.dcbat || m === 'OFF') r.p = 0;
            else if (m === 'NAV') r.p = Math.min(1, r.p + dt / ALIGN_T);
            else r.p = Math.min(1, r.p + dt / 6);
        });

        // 液壓
        const h = st.hyd;
        let g = e[0].n2 >= 50 && p.hydEng1 && !p.fire1 && !st.flt.hydG ? 3000 : 0;
        let y = ((e[1].n2 >= 50 && p.hydEng2 && !p.fire2) || (p.hydYel && b.ac2)) && !st.flt.hydY ? 3000 : 0;
        const bl = p.hydBlue && b.ac2 && (e[0].n2 >= 50 || e[1].n2 >= 50) ? 3000 : (st.rat ? 2600 : 0);
        if (p.ptu) {
            if (g < 500 && y > 2000 && b.dcbat && !st.flt.hydG) g = 2500;
            else if (y < 500 && g > 2000 && b.dcbat && !st.flt.hydY) y = 2500;
        }
        h.g = approach(h.g, g, 1500, dt);
        h.b = approach(h.b, bl, 1500, dt);
        h.y = approach(h.y, y, 1500, dt);

        // 引氣
        const apuAir = p.apubleed && a.s === 'run';
        const eAir = (i) => (e[i].n2 >= 50 && !st.flt['bleed' + (i + 1)] && (i === 0 ? p.bleed1 && !p.fire1 : p.bleed2 && !p.fire2));
        const xOpen = st.sel.xbleed === 'OPEN' || (st.sel.xbleed === 'AUTO' && apuAir);
        const L = eAir(0) || (xOpen && (apuAir || eAir(1)));
        const R = eAir(1) || (xOpen && (apuAir || eAir(0)));
        st.air.L = approach(st.air.L, L ? 35 : 0, 40, dt);
        st.air.R = approach(st.air.R, R ? 35 : 0, 40, dt);

        // 燃油消耗（有漏油時，漏的是發動機油管：那具發動機運轉中就一直漏）
        const f = st.fuel;
        for (let i = 0; i < 2; i++) {
            const own = i === 0 ? 'L' : 'R';
            const oth = i === 0 ? 'R' : 'L';
            const use = (e[i].ff / 3600) * dt;
            const useC = (p.fC1 || p.fC2) && f.C > 0 && b.acess;
            const tk = f[own] > 0 ? own : (p.xfeed && f[oth] > 0 ? oth : own);
            if (use > 0) {
                if (useC) f.C = Math.max(0, f.C - use);
                else f[tk] = Math.max(0, f[tk] - use);
            }
            if (e[i].s === 'run' && st.flt['fuelLeak' + (i + 1)]) f[tk] = Math.max(0, f[tk] - (400 / 60) * dt);
            // 燃油用完：發動機熄火
            const fed = useC || f[own] > 0 || (p.xfeed && f[oth] > 0);
            if (e[i].s === 'run' && !fed && A.fault) A.fault.inject('eng' + (i + 1) + 'fail', 0, { restartable: true, reason: 'fuel' });
        }
        if (a.s === 'run') f.L = Math.max(0, f.L - (130 / 3600) * dt);

        // 客艙高度
        const alt = (fl && fl.alt) || 0;
        const pres = b.dcbat && sys.enginesRunning() > 0 && p.pack1 && st.air.L >= 15 && !st.flt.decomp;
        const cabTgt = pres ? Math.min(alt, 1500 + alt * 0.16) : alt;
        if (st.cabAlt === null) st.cabAlt = cabTgt;
        st.cabAlt = approach(st.cabAlt, cabTgt, (st.flt.decomp ? 3500 : 600) / 60, dt);
    };

    // ---------- 燈號邏輯 ----------
    // ---------- 建立畫面 ----------
    function setSel(id, v) {
        if (id === 'm1') return setMaster(0, v), sys.refresh();
        if (id === 'm2') return setMaster(1, v), sys.refresh();
        st.sel[id] = v;
        if (id === 'mode' && v === 'IGN/START') A.toast('ENG MODE：IGN/START。接著把 ENG MASTER 撥到 ON。');
        sys.refresh();
    }

    const MOMENTARY = /^(call|fireTest|smokeTest|cvrTest|emerTest)/;

    function press(id) {
        const p = st.pb;
        if (id === 'apustart') { apuStart(); return sys.refresh(); }
        const AG = { ag1a: 'fire1', ag1b: 'fire1', ag2a: 'fire2', ag2b: 'fire2', agapu: 'fireapu' };
        if (AG[id]) {
            if (p[id]) { A.toast('滅火瓶已經放出，沒辦法收回。'); return; }
            if (!p[AG[id]]) { A.toast('要先按下對應的 FIRE 按鈕，SQUIB 燈亮了才能放出滅火劑。'); return; }
        }
        if (id === 'ext' && !p.ext && !extAvailNow()) {
            A.toast(onGround() && sys.enginesRunning() === 0 ? '這個機位沒有地面電源。' : '發動機運轉中或在空中，不能接地面電源。');
            return;
        }
        if (MOMENTARY.test(id)) {
            const fire = id.startsWith('fireTest');
            if (fire) A.toast('FIRE 測試：火警燈全亮 3 秒。');
            st.flash[fire ? 'fireTest' : id] = st.t + (fire ? 3 : 1.2);
            return sys.refresh();
        }
        p[id] = !p[id];
        if (/^fire(1|2|apu)$/.test(id) && p[id]) A.toast('FIRE 按鈕按下：關閉該側的燃油、引氣、液壓和發電機，發動機或 APU 停車。再按一次可放開。');
        if (id === 'apumaster' && p.apumaster) A.toast('APU MASTER SW ON。接著按 START。');
        if (id === 'apumaster' && !p.apumaster && st.apu.s === 'run') A.toast('APU 關閉中。');
        sys.refresh();
    }

    const off = (id, fault) => (s) => [fault ? fault(s) : false, !s.pb[id]];
    const on = (id, top) => (s) => [top ? top(s) : false, !!s.pb[id]];

    // 撥桿開關：真機是直立的，選項由上到下排（第一個在最上面＝桿子往上扳）。
    // 點桿子切到下一格，或直接點旁邊的文字。
    function tgl(def) {
        const n = def.opts.length;
        const ys = n === 2 ? [-10, 10] : n === 3 ? [-10, 0, 10] : [-11, -4, 4, 11];
        const wrap = el('div', 'ck-tgl');
        wrap.dataset.id = def.id;
        const lev = el('button', 'ck-lev');
        lev.type = 'button';
        lev.dataset.id = def.id;
        const sv = U.svgEl('svg', { viewBox: '-14 -16 28 32', 'aria-hidden': 'true' });
        U.svgEl('polygon', { points: '0,-11 9.5,-5.5 9.5,5.5 0,11 -9.5,5.5 -9.5,-5.5', class: 'ck-lev-nut' }, sv);
        U.svgEl('circle', { cx: 0, cy: 0, r: 6, class: 'ck-lev-well' }, sv);
        const stem = U.svgEl('line', { x1: 0, y1: 0, x2: 0, y2: -10, class: 'ck-lev-stem' }, sv);
        const ball = U.svgEl('circle', { cx: 0, cy: -10, r: 3, class: 'ck-lev-ball' }, sv);
        lev.append(sv);
        let cur = def.opts[0];
        lev.addEventListener('click', () => setSel(def.id, def.opts[(def.opts.indexOf(cur) + 1) % n]));
        const col = el('div', 'ck-tgl-row');
        const btns = def.opts.map((o) => {
            const bt = el('button', 'ck-opt ck-lopt', o);
            bt.type = 'button';
            bt.dataset.v = o;
            bt.addEventListener('click', () => setSel(def.id, o));
            col.append(bt);
            return bt;
        });
        const body = el('div', 'ck-tgl-body');
        body.append(lev, col);
        wrap.append(el('span', 'ck-pb-label', def.label), body);
        return {
            el: wrap,
            set(v) {
                cur = v;
                const k = Math.max(0, def.opts.indexOf(v));
                const y = ys[k];
                const mid = n === 3 && k === 1;
                stem.setAttribute('y2', mid ? 0 : y);
                ball.setAttribute('cy', mid ? 0 : y);
                ball.setAttribute('r', mid ? 4.6 : 3);
                lev.setAttribute('aria-label', `${def.label}：${v}，點一下切到下一格`);
                btns.forEach((bt) => { const o = bt.dataset.v === v; bt.classList.toggle('on', o); bt.setAttribute('aria-pressed', String(o)); });
            }
        };
    }

    // 旋鈕：厚重的鈕頭加一條指示線，選項文字排在四周
    function dialKnob(def, onSet) {
        const n = def.opts.length;
        const ang = def.angles || (n === 2 ? [-45, 45] : [-60, 0, 60]);
        const wrap = el('div', 'ck-dk');
        if (def.label) wrap.append(el('span', 'ck-pb-label', def.label));
        const area = el('div', 'ck-dk-a');
        const ticks = U.svgEl('svg', { class: 'ck-dk-ticks', viewBox: '-38 -38 76 76', 'aria-hidden': 'true' });
        ang.forEach((a) => {
            const r = a * Math.PI / 180;
            U.svgEl('line', { x1: Math.sin(r) * 24, y1: -Math.cos(r) * 24, x2: Math.sin(r) * 28, y2: -Math.cos(r) * 28, class: 'ck-dk-tick' }, ticks);
        });
        area.append(ticks);
        const dial = el('button', 'ck-sel-dial ck-dk-dial');
        dial.type = 'button';
        dial.dataset.id = def.id;
        const sv = U.svgEl('svg', { viewBox: '-20 -20 40 40', 'aria-hidden': 'true' });
        U.svgEl('circle', { cx: 0, cy: 1.5, r: 18, class: 'ck-dk-shadow' }, sv);
        const head = U.svgEl('g', { class: 'ck-dk-head' }, sv);
        U.svgEl('circle', { cx: 0, cy: 0, r: 18, class: 'ck-dk-side' }, head);
        U.svgEl('circle', { cx: 0, cy: 0, r: 15, class: 'ck-dk-top' }, head);
        U.svgEl('rect', { x: -1.5, y: -14, width: 3, height: 12, rx: 1.2, class: 'ck-dk-slot' }, head);
        dial.append(sv);
        area.append(dial);
        let cur = def.opts[0];
        dial.addEventListener('click', () => onSet(def.id, def.opts[(def.opts.indexOf(cur) + 1) % n]));
        const btns = def.opts.map((o, k) => {
            const bt = el('button', 'ck-opt ck-dopt', o);
            bt.type = 'button';
            bt.dataset.v = o;
            const r = ang[k] * Math.PI / 180;
            bt.style.left = 38 + Math.sin(r) * 34 + 'px';
            bt.style.top = 38 - Math.cos(r) * 34 + 'px';
            bt.addEventListener('click', () => onSet(def.id, o));
            area.append(bt);
            return bt;
        });
        wrap.append(area);
        return {
            el: wrap,
            set(v) {
                cur = v;
                const k = Math.max(0, def.opts.indexOf(v));
                head.style.transform = `rotate(${ang[k]}deg)`;
                dial.setAttribute('aria-label', `${def.label || def.id}：${v}，點一下切到下一格`);
                btns.forEach((bt) => { const o = bt.dataset.v === v; bt.classList.toggle('on', o); bt.setAttribute('aria-pressed', String(o)); });
            }
        };
    }

    // ================= 頂板（照真機頂板照片的位置）=================
    // 座標：照片上的像素位置（照片約 1482 × 1403）乘上 K，換成「舞台」的像素。
    // 每個控制件都以自己的中心點定位；畫面寬度不夠時整個舞台一起縮小（最小 0.62 倍），再不夠就左右捲動。
    const K = 0.8;
    const S = (v) => Math.round(v * K);
    const STAGE_W = S(1456), STAGE_H = S(1405);

    function build(host) {
        host.textContent = '';
        const wrap = el('div', 'ck-oh-wrap');
        const box = el('div', 'ck-oh-box');
        const stage = el('div', 'ck-stage');
        stage.style.width = STAGE_W + 'px';
        stage.style.height = STAGE_H + 'px';
        box.append(stage);
        wrap.append(box);
        host.append(wrap);

        // 鉻色旋鈕用的漸層（整個舞台共用）
        const defs = U.svgEl('svg', { class: 'ck-defs', width: 0, height: 0, 'aria-hidden': 'true' });
        const dd = U.svgEl('defs', {}, defs);
        const grad = (id, stops, x2, y2) => {
            const g = U.svgEl('linearGradient', { id, x1: 0, y1: 0, x2, y2 }, dd);
            stops.forEach(([o, c]) => U.svgEl('stop', { offset: o, 'stop-color': c }, g));
        };
        grad('ckChrome', [['0', '#7c8288'], ['0.3', '#eef0f1'], ['0.6', '#b9bec3'], ['1', '#6a7076']], 1, 0);
        grad('ckChromeSide', [['0', '#3d4247'], ['0.5', '#9aa0a6'], ['1', '#30353a']], 1, 0);
        stage.append(defs);

        const svg = U.svgEl('svg', { class: 'ck-lines', width: STAGE_W, height: STAGE_H, 'aria-hidden': 'true' });
        stage.append(svg);
        const line = (pts) => U.svgEl('polyline', { points: pts.trim().split(/\s+/).map((q) => q.split(',').map((v) => S(Number(v))).join(',')).join(' '), class: 'ck-ln', fill: 'none' }, svg);
        const lines = (arr) => arr.forEach(line);

        const at = (node, x, y, cls) => {
            node.classList.add('ck-at');
            if (cls) node.classList.add(...cls.split(' '));
            node.style.left = S(x) + 'px';
            node.style.top = S(y) + 'px';
            stage.append(node);
            return node;
        };
        const panel = (x, y, w, h, cls) => {
            const d = el('div', 'ck-pn' + (cls ? ' ' + cls : ''));
            d.style.cssText = `left:${S(x)}px;top:${S(y)}px;width:${S(w)}px;height:${S(h)}px`;
            stage.append(d);
            return d;
        };
        const ttl = (text, x, y, cls) => at(el('span', 'ck-pn-t' + (cls ? ' ' + cls : ''), text), x, y);
        const tag = (text, x, y, cls) => at(el('span', 'ck-tag' + (cls ? ' ' + cls : ''), text), x, y);
        const box2 = (text, x, y) => tag(text, x, y, 'ck-tagbox');
        const vtag = (text, x, y) => {
            const t = el('span', 'ck-vt');
            text.split('').forEach((ch) => t.append(el('i', '', ch === ' ' ? ' ' : ch)));
            at(t, x, y);
        };
        const F = ['FAULT', 'amber'], OFFL = ['OFF', 'white'], ONL = ['ON', 'blue'];

        // kind: 'off'（預設按下）或 'on'（預設放開）
        const pb = (id, label, top, bot, lt, x, y, kind, cls) => {
            if (kind === 'off') DEF[id] = true;
            const b = U.pushButton({ id, label, top, bot }, () => press(id));
            b.lt = lt;
            refs.pb[id] = b;
            at(b.el, x, y, cls);
            if (/\b(red|ck-fire|ck-gk)\b/.test(cls || '') || /^ag(1a|1b|apu|2a|2b)$/.test(id)) addGuard(b, id, label, /ck-gk/.test(cls || ''));
            return b;
        };
        // 護蓋：先掀開才按得到；按下去的按鈕蓋子會保持掀開
        const addGuard = (b, id, label, black) => {
            const g = el('div', 'ck-gw' + (black ? ' gk' : ''));
            const cover = el('button', 'ck-gcover');
            cover.type = 'button';
            cover.dataset.for = id;
            const setOpen = (o) => {
                g.classList.toggle('open', o);
                cover.setAttribute('aria-expanded', String(o));
                cover.setAttribute('aria-label', `${label} 護蓋，目前${o ? '掀開，點一下蓋上' : '蓋著，點一下掀開'}`);
                b.btn.tabIndex = o ? 0 : -1;
            };
            cover.addEventListener('click', () => {
                const o = !g.classList.contains('open');
                if (!o && st && st.pb[id]) { A.toast('這個按鈕還按著，先放開才能蓋上護蓋。'); return; }
                setOpen(o);
            });
            b.btn.replaceWith(g);
            g.append(b.btn, cover);
            refs.guard[id] = { setOpen, isOpen: () => g.classList.contains('open') };
            setOpen(false);
        };
        const none = () => [false, false];
        const plain = (id, label, x, y, kind, cls, top, bot) => {
            const bo = bot || null;
            return pb(id, label, top || null, bo, (s2) => [false, bo ? !!s2.pb[id] : false], x, y, kind, cls);
        };
        const round = (id, label, x, y, cls) => pb(id, label, null, null, none, x, y, 'on', 'ck-round' + (cls ? ' ' + cls : ''));
        const sw = (id, label, opts, x, y) => {
            const t = tgl({ id, label, opts });
            refs.tg[id] = t;
            at(t.el, x, y);
        };
        const knob = (id, label, opts, x, y, angles) => {
            const k = dialKnob({ id, label, opts, angles }, setSel);
            refs.sel[id] = k;
            at(k.el, x, y, 'ck-at-knob');
        };
        const lcd = (key, x, y, cls, text) => {
            const d = el('div', 'ck-lcd ' + (cls || ''), text || '');
            if (key) refs.live[key] = d;
            return at(d, x, y);
        };

        // ================= 左欄 =================
        panel(15, 0, 335, 93);
        pb('doorVid', 'COCKPIT DOOR\nVIDEO', null, OFFL, off('doorVid'), 283, 62, 'off');

        // ADIRS
        panel(15, 98, 335, 307);
        ttl('ADIRS', 185, 114);
        lcd('adirs', 185, 141, 'ck-lcd-dark');
        const onb = el('div', 'ck-box');
        refs.onbat = U.ann('ON BAT', 'white');
        onb.append(refs.onbat);
        at(onb, 300, 141);
        [[1, 88], [3, 185], [2, 278]].forEach(([n, x]) => {
            const bx = el('div', 'ck-box ck-irbox');
            const fl = U.ann('FAULT', 'amber');
            const al = U.ann('ALIGN', 'white');
            bx.append(fl, al);
            bx.append(el('span', 'ck-pb-label', 'IR' + n));
            refs.ir[n - 1] = al;
            at(bx, x, 203);
            knob('ir' + n, '', ['OFF', 'NAV', 'ATT'], x - 2, 283, [-62, 0, 62]);
        });
        [[1, 88], [3, 185], [2, 278]].forEach(([n, x]) => pb('adr' + n, 'ADR' + n, null, OFFL, off('adr' + n), x, 360, 'off'));

        panel(15, 408, 335, 82);
        panel(15, 493, 335, 107);
        ttl('FLT CTL', 218, 509);
        pb('elac1', 'ELAC 1', F, OFFL, off('elac1'), 153, 557, 'off');
        pb('sec1', 'SEC 1', F, OFFL, off('sec1'), 218, 557, 'off');
        pb('fac1', 'FAC 1', F, OFFL, off('fac1'), 283, 557, 'off');

        panel(15, 603, 335, 92);
        ttl('EVAC', 218, 612);
        plain('evacCmd', 'COMMAND', 144, 660, 'on', 'ck-gk', null, ['ON', 'white']);
        round('evacHorn', 'HORN\nSHUT OFF', 219, 668);
        sw('evacCapt', 'CAPT & PURS', ['C&P', 'CAPT'], 296, 660);

        panel(15, 697, 335, 128);
        ttl('EMER ELEC PWR', 185, 710);
        pb('emerTest', 'EMER GEN\nTEST', null, ['TEST', 'white'], (s2) => [false, (s2.flash.emerTest || 0) > s2.t], 70, 770, 'on', 'ck-gk');
        plain('gen1Line', 'GEN 1 LINE', 145, 778, 'on', '', ['SMOKE', 'amber'], ['OFF', 'white']);
        pb('ratEmer', 'RAT &\nEMER GEN', ['FAULT', 'amber'], null, none, 212, 778, 'on');
        plain('emerMan', 'MAN ON', 272, 768, 'on', 'red', ['FAULT', 'amber'], ONL);

        panel(15, 828, 335, 97);
        ttl('GPWS', 183, 833);
        pb('gpwsTerr', 'TERR', F, OFFL, off('gpwsTerr'), 66, 892, 'off');
        pb('gpwsSys', 'SYS', null, OFFL, off('gpwsSys'), 130, 892, 'off');
        pb('gpwsGs', 'G/S\nMODE', null, OFFL, off('gpwsGs'), 193, 892, 'off');
        pb('gpwsFlap', 'FLAP\nMODE', null, OFFL, off('gpwsFlap'), 247, 892, 'off');
        pb('gpwsLdg', 'LDG\nFLAP 3', null, ['ON', 'blue'], on('gpwsLdg'), 300, 892, 'on');

        panel(15, 927, 335, 75);
        ttl('RCDR', 217, 929);
        pb('rcdr', 'GND CTL', null, ONL, on('rcdr'), 143, 976, 'on');
        round('cvrErase', 'CVR ERASE', 218, 976);
        round('cvrTest', 'CVR TEST', 295, 976);

        panel(15, 1004, 335, 104);
        ttl('OXYGEN', 217, 1013);
        plain('hiAlt', 'HIGH ALT\nLANDING', 66, 1076, 'on', 'red', null, ['ON', 'white']);
        plain('maskMan', 'MASK\nMAN ON', 140, 1068, 'on', 'red', null, ['ON', 'white']);
        pb('paxOxy', 'PASSENGER', null, ['ON', 'white'], on('paxOxy'), 218, 1079, 'on');
        pb('oxy', 'CREW SUPPLY', null, OFFL, off('oxy'), 294, 1079, 'off');

        panel(15, 1110, 335, 87);
        ttl('CALLS', 184, 1124);
        [['callMech', 'MECH', 68], ['callAll', 'ALL', 126], ['callFwd', 'FWD', 184], ['callAft', 'AFT', 240]].forEach(([id, l, x]) => round(id, l, x, 1168));
        pb('callEmer', 'EMER', ['CALL', 'white'], null, (s2) => [(s2.flash.callEmer || 0) > s2.t, false], 298, 1166, 'on');

        panel(15, 1200, 335, 205);
        ttl('RAIN RPLNT', 160, 1213);
        ttl('WIPER', 255, 1210);
        round('rainRplnt', '', 143, 1252);
        knob('wipC', '', ['OFF', 'SLOW', 'FAST'], 252, 1278, [0, 55, 100]);

        // ================= 中欄 =================
        panel(355, 0, 730, 130);
        sw('door', 'CKPT DOOR', ['NORM', 'BK UP', 'OFF'], 433, 58);
        pb('doorCtl', 'CTL', null, null, none, 533, 82, 'on');

        // FIRE
        panel(355, 135, 730, 170);
        vtag('FIRE', 370, 205); vtag('FIRE', 1070, 205);
        ttl('ENG 1', 512, 158, 'ck-pn-big'); ttl('APU', 722, 148, 'ck-pn-big'); ttl('ENG 2', 933, 160, 'ck-pn-big');
        const agent = (id, fid, x, y) => pb(id, id === 'agapu' ? 'AGENT' : id.endsWith('a') ? 'AGENT 1' : 'AGENT 2', ['SQUIB', 'white'], ['DISCH', 'amber'], (s2) => [!!s2.pb[fid], !!s2.pb[id]], x, y, 'on');
        const fireLt = (fid) => (s2) => [!!s2.pb[fid] || (s2.flash.fireTest || 0) > s2.t, false];
        agent('ag1a', 'fire1', 409, 193); agent('ag1b', 'fire1', 611, 196);
        pb('fire1', 'ENG 1 FIRE', ['FIRE', 'red'], null, fireLt('fire1'), 511, 232, 'on', 'ck-fire');
        round('fireTest', 'TEST', 409, 247, 'ck-mini');
        pb('fireapu', 'APU FIRE', ['FIRE', 'red'], null, fireLt('fireapu'), 722, 215, 'on', 'ck-fire');
        agent('agapu', 'fireapu', 668, 280);
        round('fireTestB', 'TEST', 775, 274, 'ck-mini');
        agent('ag2a', 'fire2', 831, 193); agent('ag2b', 'fire2', 1033, 196);
        pb('fire2', 'ENG 2 FIRE', ['FIRE', 'red'], null, fireLt('fire2'), 933, 237, 'on', 'ck-fire');
        round('fireTestC', 'TEST', 1037, 254, 'ck-mini');

        // HYD
        panel(355, 308, 730, 150);
        vtag('HYD', 370, 385); vtag('HYD', 1070, 385);
        box2('GREEN', 507, 318); box2('BLUE', 722, 320); box2('YELLOW', 938, 320); box2('PTU', 833, 342);
        lines(['507,326 507,360', '507,360 938,360', '507,360 507,400', '722,328 722,400', '938,328 938,400', '613,360 613,380', '833,350 833,358']);
        pb('hydEng1', 'ENG 1 PUMP', F, OFFL, off('hydEng1', (s2) => s2.eng[0].s === 'run' && s2.pb.hydEng1 && s2.hyd.g < 1500), 505, 426, 'off');
        plain('ratMan', 'RAT MAN ON', 613, 396, 'on', 'red', null, ['ON', 'white']);
        pb('hydBlue', 'ELEC PUMP', F, OFFL, off('hydBlue', (s2) => s2.pb.hydBlue && sys.enginesRunning() > 0 && s2.hyd.b < 1500), 720, 424, 'off');
        pb('ptu', '', F, OFFL, off('ptu'), 830, 384, 'off');
        pb('hydEng2', 'ENG 2 PUMP', F, OFFL, off('hydEng2', (s2) => s2.eng[1].s === 'run' && s2.pb.hydEng2 && s2.hyd.y < 1500), 937, 428, 'off');
        pb('hydYel', 'ELEC PUMP', F, ONL, on('hydYel'), 1010, 414, 'on');

        // FUEL
        panel(355, 460, 730, 143);
        vtag('FUEL', 370, 520); vtag('FUEL', 1070, 520);
        box2('ENG 1', 507, 475); box2('APU', 650, 476); box2('ENG 2', 936, 477);
        lines(['507,483 507,505', '507,505 936,505', '650,484 650,505', '936,485 936,505', '720,505 720,520', '473,505 473,540', '535,505 535,540', '658,505 658,540', '783,505 783,540', '904,505 904,540', '966,505 966,540']);
        pb('xfeed', 'X FEED', null, ONL, on('xfeed'), 720, 493, 'on');
        const fp = (id, label, x, y) => pb(id, label, F, OFFL, off(id, (s2) => (id[1] === 'C' ? s2.pb[id] && s2.fuel.C <= 0 : false)), x, y, 'off');
        tag('L TK PUMPS', 504, 514); tag('R TK PUMPS', 935, 514);
        fp('fL1', '1', 473, 565); fp('fL2', '2', 535, 565);
        fp('fC1', 'CTR TK\nL XFR', 658, 568);
        pb('fuelMode', 'MODE SEL', ['FAULT', 'amber'], ['MAN', 'white'], on('fuelMode'), 718, 568, 'on');
        fp('fC2', 'CTR TK\nR XFR', 783, 568);
        fp('fR1', '1', 904, 567); fp('fR2', '2', 966, 567);

        // ELEC
        panel(355, 607, 730, 233);
        vtag('ELEC', 370, 715); vtag('ELEC', 1070, 705);
        box2('DC BUS 1', 507, 630); box2('DC BUS 2', 931, 631);
        lines(['507,642 507,684', '545,692 688,692', '752,692 893,692', '931,643 931,685', '720,701 720,738', '507,700 507,768', '930,700 930,768', '720,775 720,792', '629,775 629,792']);
        tag('BAT 1', 598, 616); tag('BAT', 694, 612); tag('BAT 2', 790, 616);
        lcd('bat1v', 598, 655, 'ck-lcd-red');
        lcd('bat2v', 790, 655, 'ck-lcd-red');
        pb('bat1', '1', F, OFFL, (s2) => [s2.pb.bat1 && s2.bat[0] <= 0, !s2.pb.bat1], 672, 655, 'on');
        pb('bat2', '2', F, OFFL, (s2) => [s2.pb.bat2 && s2.bat[1] <= 0, !s2.pb.bat2], 717, 655, 'on');
        pb('commercial', 'COMMERCIAL', F, OFFL, off('commercial'), 432, 648, 'off');
        pb('galy', 'GALLEY & CAB', F, OFFL, off('galy'), 432, 712, 'off');
        pb('acess', 'AC ESS FEED', F, ['ALTN', 'white'], on('acess'), 864, 680, 'on');
        const busBox = (key, label, x, y) => { const d = el('div', 'ck-busbox', label); refs.live[key] = d; at(d, x, y); };
        busBox('ac1', 'AC BUS 1', 507, 692); busBox('acEss', 'AC ESS BUS', 720, 693); busBox('ac2', 'AC BUS 2', 932, 694);
        pb('bustie', 'BUS TIE', null, OFFL, off('bustie'), 718, 756, 'off');
        pb('ext', 'EXT PWR', ['AVAIL', 'green'], ONL, (s2) => [extAvailNow() && !s2.pb.ext, s2.pb.ext && extAvailNow()], 808, 791, 'on');
        pb('idg1', 'IDG 1', F, null, (s2) => [!!s2.pb.idg1, false], 432, 791, 'on', 'red');
        pb('gen1', 'GEN 1', F, OFFL, off('gen1', (s2) => s2.pb.gen1 && s2.eng[0].s === 'run' && s2.eng[0].n2 < 50), 507, 790, 'off');
        pb('apugen', 'APU GEN', ['AVAIL', 'green'], OFFL, (s2) => [s2.apu.s === 'run' && s2.pb.apugen, !s2.pb.apugen], 629, 797, 'off');
        pb('gen2', 'GEN 2', F, OFFL, off('gen2', (s2) => s2.pb.gen2 && s2.eng[1].s === 'run' && s2.eng[1].n2 < 50), 930, 792, 'off');
        pb('idg2', 'IDG 2', F, null, (s2) => [!!s2.pb.idg2, false], 1005, 794, 'on', 'red');

        // AIR COND
        panel(355, 845, 730, 252);
        vtag('AIR COND', 370, 960); vtag('AIR COND', 1070, 960);
        lines(['606,950 606,962', '719,950 719,962', '832,950 832,962', '503,962 930,962', '503,962 503,978', '930,962 930,978', '423,1010 930,1010', '505,1010 505,1022', '617,1010 617,1022', '716,1010 716,1022', '928,1010 928,1022', '503,992 503,1010', '930,992 930,1010', '825,1000 825,1022']);
        knob('flow', 'PACK FLOW', ['LO', 'NORM', 'HI'], 440, 908, [-68, -8, 52]);
        box2('COCKPIT', 606, 851); box2('FWD CABIN', 719, 852); box2('AFT CABIN', 832, 852);
        knob('tempC', '', ['COLD', 'MED', 'HOT'], 606, 910, [-115, 0, 115]);
        knob('tempF', '', ['COLD', 'MED', 'HOT'], 719, 910, [-115, 0, 115]);
        knob('tempA', '', ['COLD', 'MED', 'HOT'], 832, 910, [-115, 0, 115]);
        pb('hotAir', 'HOT AIR', F, OFFL, off('hotAir'), 983, 906, 'off');
        pb('pack1', 'PACK 1', F, OFFL, off('pack1'), 423, 982, 'off');
        pb('pack2', 'PACK 2', F, OFFL, off('pack2'), 1011, 986, 'off');
        box2('PACK 1', 503, 972); box2('PACK 2', 930, 973);
        tag('X BLEED', 825, 970);
        pb('bleed1', 'ENG 1 BLEED', F, OFFL, off('bleed1'), 505, 1050, 'off');
        pb('ram', 'RAM AIR', null, ONL, on('ram'), 617, 1050, 'on', 'red');
        pb('apubleed', 'APU BLEED', F, ONL, on('apubleed'), 716, 1052, 'on');
        knob('xbleed', '', ['SHUT', 'AUTO', 'OPEN'], 825, 1056, [-68, 0, 68]);
        pb('bleed2', 'ENG 2 BLEED', F, OFFL, off('bleed2'), 928, 1052, 'off');

        // ANTI ICE / PROBE / CABIN PRESS
        panel(355, 1100, 300, 110);
        ttl('ANTI ICE', 515, 1112);
        pb('wai', 'WING', F, ONL, on('wai'), 407, 1168, 'on');
        pb('eai1', 'ENG 1', F, ONL, on('eai1'), 553, 1170, 'on');
        pb('eai2', 'ENG 2', F, ONL, on('eai2'), 621, 1168, 'on');
        panel(658, 1100, 102, 110);
        ttl('PROBE/WINDOW', 709, 1112, 'ck-pn-s'); ttl('HEAT', 709, 1126, 'ck-pn-s');
        pb('probe', '', null, ONL, on('probe'), 713, 1168, 'on');
        panel(763, 1100, 322, 110);
        ttl('CABIN PRESS', 862, 1112); ttl('LDG ELEV', 950, 1115, 'ck-pn-s');
        sw('cabVs', 'MAN V/S CTL', ['UP', 'DN'], 800, 1166);
        const cm = U.pushButton({ id: 'cabMode', label: 'MODE SEL', top: F, bot: ['MAN', 'white'] }, () => setSel('cabMode', st.sel.cabMode === 'MAN' ? 'AUTO' : 'MAN'));
        at(cm.el, 866, 1166);
        refs.extra.push((pw2) => {
            cm.top.set(false, false);
            cm.bot.set(pw2 && st.sel.cabMode === 'MAN', false);
            cm.btn.setAttribute('aria-pressed', String(st.sel.cabMode === 'MAN'));
        });
        knob('ldgElev', '', ['AUTO', '0', '4', '8', '12'], 947, 1176, [0, 38, 76, 114, 152]);
        pb('ditch', 'DITCHING', null, ONL, on('ditch'), 1022, 1166, 'on', 'red');

        // EXT LT / APU / INT LT / SIGNS
        panel(355, 1213, 303, 192);
        ttl('EXT LT', 508, 1217);
        sw('strobe', 'STROBE', ['ON', 'AUTO', 'OFF'], 402, 1268);
        sw('beacon', 'BEACON', ['ON', 'OFF'], 468, 1268);
        sw('wing', 'WING', ['ON', 'OFF'], 546, 1268);
        sw('navlogo', 'NAV & LOGO', ['2', 'OFF', '1'], 625, 1268);
        sw('rwyto', 'RWY TURN\nOFF', ['ON', 'OFF'], 410, 1352);
        sw('landl', 'LAND L', ['ON', 'OFF', 'RETR'], 475, 1352);
        sw('landr', 'LAND R', ['ON', 'OFF', 'RETR'], 550, 1352);
        sw('nose', 'NOSE', ['T.O', 'TAXI', 'OFF'], 625, 1352);
        panel(660, 1213, 100, 192);
        ttl('APU', 716, 1217);
        pb('apumaster', 'MASTER SW', F, ONL, on('apumaster'), 716, 1284, 'on');
        pb('apustart', 'START', ONL, ['AVAIL', 'green'], (s2) => [s2.apu.s === 'start', s2.apu.s === 'run'], 716, 1352, 'on');
        panel(763, 1213, 322, 92);
        ttl('INT LT', 930, 1217);
        knob('ovhd', 'OVHD INTEG LT', ['OFF', 'BRT'], 797, 1268, [-60, 60]);
        sw('iceInd', 'ICE IND &\nSTBY COMPASS', ['ON', 'OFF'], 868, 1262);
        sw('dome', 'DOME', ['BRT', 'DIM', 'OFF'], 933, 1262);
        sw('ann', 'ANN LT', ['TEST', 'BRT', 'DIM'], 1007, 1262);
        panel(763, 1307, 322, 98);
        ttl('SIGNS', 928, 1314);
        sw('seat', 'SEAT BELTS', ['ON', 'AUTO', 'OFF'], 790, 1366);
        sw('nosmk', 'NO SMOKING', ['ON', 'AUTO', 'OFF'], 857, 1366);
        pb('emerLt', 'EMER EXIT LT', null, ['OFF', 'amber'], off('emerLt'), 930, 1364, 'off');
        sw('emer', '', ['ON', 'ARM', 'OFF'], 997, 1364);

        // ================= 右欄 =================
        panel(1090, 0, 350, 165, 'ck-deco');
        [1155, 1195, 1233, 1273, 1313, 1353, 1393].forEach((x) => { at(el('i', 'ck-pk'), x, 38); at(el('i', 'ck-pk'), x, 128); });
        sw('audioIntRad', 'INT / RAD', ['INT', 'RAD'], 1150, 96);
        round('audioVoice', 'VOICE', 1250, 96, 'ck-mini');
        round('audioReset', 'RESET', 1295, 96, 'ck-mini');
        panel(1090, 170, 350, 200, 'ck-deco');
        tag('ACTIVE', 1182, 185); tag('STBY/CRS', 1346, 185);
        lcd(null, 1182, 214, 'ck-lcd-red', 'dAtA');
        lcd(null, 1346, 214, 'ck-lcd-red', '118.000');
        at(el('span', 'ck-xfr', '⇄'), 1264, 214);
        [['VHF1', 1143, 263], ['VHF2', 1183, 263], ['VHF3', 1225, 263], ['HF1', 1143, 298], ['HF2', 1222, 298], ['AM', 1263, 298],
            ['NAV', 1143, 345], ['VOR', 1182, 345], ['LS', 1222, 345], ['GLS', 1263, 345], ['ADF', 1304, 345], ['BFO', 1344, 345]].forEach(([t, x, y]) => at(el('span', 'ck-rmp-b', t), x, y));
        at(el('i', 'ck-silver'), 1337, 275);
        panel(1090, 372, 350, 150, 'ck-blank');

        panel(1090, 525, 350, 85);
        ttl('FLT CTL', 1257, 543);
        pb('elac2', 'ELAC 2', F, OFFL, off('elac2'), 1160, 588, 'off');
        pb('sec2', 'SEC 2', F, OFFL, off('sec2'), 1224, 588, 'off');
        pb('sec3', 'SEC 3', F, OFFL, off('sec3'), 1289, 588, 'off');
        pb('fac2', 'FAC 2', F, OFFL, off('fac2'), 1357, 588, 'off');

        panel(1090, 635, 350, 180);
        ttl('CARGO HEAT', 1256, 645);
        pb('cargoHot', 'HOT AIR', F, OFFL, off('cargoHot'), 1287, 692, 'off');
        pb('aftIsol', 'AFT ISOL\nVALVE', F, OFFL, off('aftIsol'), 1370, 692, 'off');
        knob('cargoAft', 'AFT', ['COLD', 'MED', 'HOT'], 1340, 772, [-115, 0, 115]);

        panel(1090, 817, 350, 198);
        ttl('CARGO SMOKE', 1253, 820);
        pb('smokeFwd', 'FWD', ['SMOKE', 'amber'], null, none, 1160, 868, 'on');
        round('smokeTest', 'TEST', 1257, 866);
        pb('smokeAft', 'AFT', ['SMOKE', 'amber'], null, none, 1352, 868, 'on');
        pb('smokeFwd2', '', null, null, none, 1252, 928, 'on');
        plain('disch1', 'AGENT 1', 1145, 988, 'on', 'red', null, ['DISCH', 'amber']);
        pb('smokeFwd3', '', null, null, none, 1252, 988, 'on');
        plain('disch2', 'AGENT 2', 1363, 988, 'on', 'red', null, ['DISCH', 'amber']);

        panel(1090, 1018, 350, 87);
        ttl('VENTILATION', 1252, 1024);
        pb('blower', 'BLOWER', F, ['OVRD', 'white'], on('blower'), 1140, 1070, 'on');
        pb('extract', 'EXTRACT', F, ['OVRD', 'white'], on('extract'), 1212, 1070, 'on');
        pb('cabFans', 'CAB FANS', null, OFFL, off('cabFans'), 1362, 1072, 'off');

        panel(1090, 1108, 350, 102);
        ttl('ENG', 1252, 1115);
        tag('MAN START', 1170, 1128);
        pb('manStart1', '1', null, ONL, on('manStart1'), 1140, 1172, 'on');
        pb('manStart2', '2', null, ONL, on('manStart2'), 1210, 1172, 'on');

        panel(1090, 1213, 350, 192);
        ttl('WIPER', 1180, 1218); ttl('RAIN RPLNT', 1290, 1220);
        knob('wipF', '', ['OFF', 'SLOW', 'FAST'], 1180, 1284, [0, 55, 100]);
        round('rainRplnt2', '', 1290, 1258);

        // ---------------- 下方狀態列與中央座 ----------------
        const info = el('div', 'ck-oh-info');
        ['apu', 'air', 'cab'].forEach((k2) => { const p = el('p', 'ck-live caption-5'); refs.live[k2] = p; info.append(p); });
        host.append(info);
        const ped = el('div', 'ck-sec ck-oh-ped');
        const hd = el('div', 'ck-sec-hd');
        hd.append(el('h3', 'ck-sec-title', 'ENGINE'), el('span', 'ck-sec-note', '中央座：發動機啟動（不在頂板上）'));
        const body = el('div', 'ck-sec-body');
        ped.append(hd, body);
        host.append(ped);
        [['mode', 'ENG MODE', ['CRANK', 'NORM', 'IGN/START']], ['m1', 'MASTER 1', ['ON', 'OFF']], ['m2', 'MASTER 2', ['ON', 'OFF']]].forEach(([id, l, o]) => {
            const t = tgl({ id, label: l, opts: o });
            refs.tg[id] = t;
            body.append(t.el);
        });
        const lv = el('p', 'ck-live caption-5');
        refs.live.eng = lv;
        body.append(lv);

        // 依容器寬度縮放舞台
        const fit = () => {
            const w = wrap.clientWidth;
            if (w < 50) return;
            const sc = Math.max(0.62, Math.min(1.5, w / STAGE_W));
            stage.style.transform = `scale(${sc})`;
            box.style.width = STAGE_W * sc + 'px';
            box.style.height = STAGE_H * sc + 'px';
        };
        if (root.ResizeObserver) new ResizeObserver(fit).observe(wrap);
        else root.addEventListener('resize', fit);
        fit();
    }

    sys.build = build;

    // ---------- 更新畫面 ----------
    sys.refresh = function () {
        if (!st) return;
        const pw = st.buses.dcbat;
        for (const id in refs.pb) {
            const x = refs.pb[id];
            const r = x.lt(st);
            if (A.fault && A.fault.lit(id)) r[0] = true;
            if (x.top) x.top.set(pw && !!r[0], r[0] === 'blink');
            if (x.bot) x.bot.set(pw && !!r[1], r[1] === 'blink');
            x.btn.setAttribute('aria-pressed', String(!!st.pb[id]));
            x.btn.setAttribute('aria-label', `${x.el.querySelector('.ck-pb-label').textContent}，目前${st.pb[id] ? '按下' : '放開'}`);
        }
        for (const id in refs.guard) if (st.pb[id] && !refs.guard[id].isOpen()) refs.guard[id].setOpen(true);
        refs.extra.forEach((f) => f(pw));
        for (const id in refs.sel) refs.sel[id].set(st.sel[id]);
        for (const id in refs.tg) refs.tg[id].set(st.sel[id]);
        st.ir.forEach((r, i) => {
            const m = st.sel['ir' + (i + 1)];
            refs.ir[i].set(pw && ((m === 'NAV' && r.p < 1) || (m === 'ATT' && r.p < 1)), false);
        });
        refs.onbat.set(pw && st.buses.batOnly, false);
        const lv = refs.live;
        if (lv.adirs) lv.adirs.textContent = pw ? 'IR ' + [0, 1, 2].map((i) => (st.sel['ir' + (i + 1)] === 'NAV' ? (st.ir[i].p >= 1 ? 'OK' : Math.round(st.ir[i].p * 100) + '%') : st.sel['ir' + (i + 1)] === 'ATT' ? 'ATT' : '--')).join(' ') : '';
        const bs = st.buses;
        const setBox = (node, on2) => { if (node) node.classList.toggle('on', !!on2); };
        setBox(lv.ac1, bs.ac1); setBox(lv.ac2, bs.ac2); setBox(lv.acEss, bs.acess);
        if (lv.bat1v) lv.bat1v.textContent = pw && st.pb.bat1 ? (bs.batOnly ? '26.' + (st.bat[0] > 50 ? '8' : '1') : '27.9') + ' V' : '';
        if (lv.bat2v) lv.bat2v.textContent = pw && st.pb.bat2 ? (bs.batOnly ? '26.' + (st.bat[1] > 50 ? '8' : '1') : '27.9') + ' V' : '';
        if (lv.apu) lv.apu.textContent = pw ? `APU N ${Math.round(st.apu.n)}%　EGT ${Math.round(st.apu.egt)}°C` : '';
        if (lv.air) lv.air.textContent = pw ? `引氣壓力 左 ${Math.round(st.air.L)}　右 ${Math.round(st.air.R)} psi` : '';
        if (lv.cab) {
            const alt = (A.fcu && A.fcu.state.alt) || 0;
            const cab = st.cabAlt === null ? alt : st.cabAlt;
            const pr = (h) => 14.7 * Math.pow(1 - 6.8756e-6 * h, 5.2559);
            lv.cab.textContent = pw ? `客艙高度 ${Math.round(cab / 50) * 50} 呎　壓差 ${Math.max(0, pr(cab) - pr(alt)).toFixed(1)} psi` : '';
        }
        if (lv.eng) lv.eng.textContent = `N2 ${st.eng[0].n2.toFixed(0)}% / ${st.eng[1].n2.toFixed(0)}%`;
    };

    // ---------- 情境 ----------
    sys.apply = function (name) {
        st = fresh();
        sys.state = st;
        for (const id in refs.guard) refs.guard[id].setOpen(false);
        if (name !== 'cold') {
            st.pb.bat1 = st.pb.bat2 = true;
            st.sel.ir1 = st.sel.ir2 = st.sel.ir3 = 'NAV';
            st.ir.forEach((r) => { r.p = 1; });
            st.eng.forEach((e) => { e.s = 'run'; e.n2 = 90; e.n1 = 84; e.egt = 620; e.ff = 1250; });
            st.sel.m1 = st.sel.m2 = 'ON';
            st.sel.beacon = 'ON';
            st.sel.navlogo = '1';
            st.sel.strobe = 'ON';
            st.sel.seat = 'AUTO';
            st.sel.nosmk = 'AUTO';
            st.hyd = { g: 3000, b: 3000, y: 3000 };
            st.air = { L: 35, R: 35 };
            st.fuel = name === 'ils' ? { L: 2100, C: 0, R: 2100 } : { L: 5200, C: 1800, R: 5200 };
            st.extAvail = false;
            if (name === 'ils') { st.sel.landl = st.sel.landr = 'ON'; st.sel.nose = 'TAXI'; }
        }
        sys.step(0.05);
        sys.refresh();
    };

    // 給 ECAM 和流程表用的小工具
    sys.ref = refs;
    sys.extAvailNow = extAvailNow;
    sys.cabAlt = () => (st.cabAlt === null ? 0 : st.cabAlt);
    sys.pumpsOK = pumpsOK;
})(window);
