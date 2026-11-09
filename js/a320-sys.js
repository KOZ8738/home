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
                evacCapt: 'CAPT', cabVs: 'UP', cargoFwd: 'MED', cargoAft: 'MED', tempC: 'MED', tempF: 'MED', tempA: 'MED', flow: 'NORM', cabMode: 'AUTO', wipC: 'OFF', wipF: 'OFF', dome: 'OFF', ann: 'BRT'
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
        const ticks = U.svgEl('svg', { class: 'ck-dk-ticks', viewBox: '-29 -29 58 58', 'aria-hidden': 'true' });
        ang.forEach((a) => {
            const r = a * Math.PI / 180;
            U.svgEl('line', { x1: Math.sin(r) * 16, y1: -Math.cos(r) * 16, x2: Math.sin(r) * 20, y2: -Math.cos(r) * 20, class: 'ck-dk-tick' }, ticks);
        });
        area.append(ticks);
        const dial = el('button', 'ck-sel-dial ck-dk-dial');
        dial.type = 'button';
        dial.dataset.id = def.id;
        const sv = U.svgEl('svg', { viewBox: '-20 -20 40 40', 'aria-hidden': 'true' });
        U.svgEl('circle', { cx: 0, cy: 1.5, r: 15.5, class: 'ck-dk-shadow' }, sv);
        const head = U.svgEl('g', { class: 'ck-dk-head' }, sv);
        U.svgEl('path', { d: 'M-8,-15 Q0,-18 8,-15 L14,9 Q0,17 -14,9 Z', class: 'ck-dk-side' }, head);
        U.svgEl('path', { d: 'M-7,-14 Q0,-16.5 7,-14 L12,7 Q0,14 -12,7 Z', class: 'ck-dk-top' }, head);
        U.svgEl('rect', { x: -1.7, y: -13, width: 3.4, height: 18, rx: 1.2, class: 'ck-dk-slot' }, head);
        dial.append(sv);
        area.append(dial);
        let cur = def.opts[0];
        dial.addEventListener('click', () => onSet(def.id, def.opts[(def.opts.indexOf(cur) + 1) % n]));
        const btns = def.opts.map((o, k) => {
            const bt = el('button', 'ck-opt ck-dopt', o);
            bt.type = 'button';
            bt.dataset.v = o;
            const r = ang[k] * Math.PI / 180;
            bt.style.left = 29 + Math.sin(r) * 26 + 'px';
            bt.style.top = 29 - Math.cos(r) * 26 + 'px';
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

    // ================= 頂板（照真機頂板的實際位置）=================
    // 座標系統：928 × 930 的「舞台」，位置照真機頂板圖；畫面寬度不夠時整個縮小（最小 0.62 倍），再不夠就左右捲動。
    const STAGE_W = 928, STAGE_H = 886;

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

        const svg = U.svgEl('svg', { class: 'ck-lines', width: STAGE_W, height: STAGE_H, 'aria-hidden': 'true' });
        stage.append(svg);
        const line = (pts) => U.svgEl('polyline', { points: pts, class: 'ck-ln', fill: 'none' }, svg);

        const at = (node, x, y, cls) => {
            node.classList.add('ck-at');
            if (cls) node.classList.add(cls);
            node.style.left = x + 'px';
            node.style.top = y + 'px';
            stage.append(node);
            return node;
        };
        const panel = (x, y, w, h, title, cls) => {
            const d = el('div', 'ck-pn' + (cls ? ' ' + cls : ''));
            d.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
            if (title) d.append(el('span', 'ck-pn-t', title));
            stage.append(d);
            return d;
        };
        const tag = (text, x, y, cls) => at(el('span', 'ck-tag' + (cls ? ' ' + cls : ''), text), x, y);
        const vtag = (text, x, y) => { const t = el('span', 'ck-vt', text); t.style.left = x + 'px'; t.style.top = y + 'px'; stage.append(t); };
        const F = ['FAULT', 'amber'], OFFL = ['OFF', 'white'], ONL = ['ON', 'blue'];

        // kind: 'off'（預設按下）或 'on'（預設放開）
        const pb = (id, label, top, bot, lt, x, y, kind, cls) => {
            if (kind === 'off') DEF[id] = true;
            const b = U.pushButton({ id, label, top, bot }, () => press(id));
            b.lt = lt;
            refs.pb[id] = b;
            at(b.el, x, y, cls);
            if (/\b(red|ck-fire)\b/.test(cls || '') || /^ag(1a|1b|apu|2a|2b)$/.test(id)) addGuard(b, id, label);
            return b;
        };
        // 護蓋：先掀開才按得到；按下去的按鈕蓋子會保持掀開
        const addGuard = (b, id, label) => {
            const g = el('div', 'ck-gw');
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
        const plain = (id, label, x, y, kind, cls, top, bot) => {
            const t = top || null, bo = bot || null;
            return pb(id, label, t, bo, (s2) => [false, bo ? !!s2.pb[id] : false], x, y, kind, cls);
        };
        const flashLt = (id) => (s2) => (s2.flash[id] || 0) > s2.t;

        // ---------------- 左欄（x 22–228）----------------
        const L = 22, LW = 206, MX = 232, MW = 463, R = 698, RW = 210;
        panel(L, 22, LW, 48, '', 'ck-blank');

        let T = 72;
        panel(L, T, LW, 168, 'ADIRS');
        const lcd = el('div', 'ck-lcd');
        refs.live.adirs = lcd;
        at(lcd, 88, T + 14);
        const onb = el('div', 'ck-box');
        refs.onbat = U.ann('ON BAT', 'white');
        onb.append(refs.onbat);
        at(onb, 184, T + 14);
        [[1, 60], [3, 125], [2, 190]].forEach(([n, x]) => {
            const bx = el('div', 'ck-box ck-box-s');
            const al = U.ann('ALIGN', 'green');
            bx.append(al);
            refs.ir[n - 1] = al;
            at(bx, x, T + 56);
            tag('IR ' + n, x, T + 44);
            knob('ir' + n, '', ['OFF', 'NAV', 'ATT'], x, T + 84);
        });

        T = 242;
        panel(L, T, LW, 70, 'FLT CTL');
        pb('elac1', 'ELAC 1', F, OFFL, off('elac1'), 62, T + 14, 'off');
        pb('sec1', 'SEC 1', F, OFFL, off('sec1'), 125, T + 14, 'off');
        pb('fac1', 'FAC 1', F, OFFL, off('fac1'), 188, T + 14, 'off');

        T = 314;
        panel(L, T, LW, 70, 'EVAC');
        plain('evacCmd', 'COMMAND', 56, T + 14, 'on', 'red', null, ['ON', 'white']);
        plain('evacHorn', 'HORN SHUT OFF', 112, T + 14, 'on', '', null, ['OFF', 'white']);
        sw('evacCapt', 'CAPT & PURS', ['C&P', 'CAPT'], 180, T + 16);

        T = 386;
        panel(L, T, LW, 70, 'EMER ELEC PWR');
        pb('emerTest', 'EMER GEN TEST', null, ['TEST', 'white'], (s2) => [false, (s2.flash.emerTest || 0) > s2.t], 46, T + 14, 'on');
        plain('gen1Line', 'GEN 1 LINE', 96, T + 14, 'on', '', ['SMOKE', 'amber'], ['ON', 'white']);
        pb('ratEmer', 'RAT & EMER GEN', ['FAULT', 'amber'], null, () => [false, false], 146, T + 14, 'on');
        plain('emerMan', 'MAN ON', 190, T + 14, 'on', 'red', ['FAULT', 'amber'], ONL);

        T = 458;
        panel(L, T, LW, 70, 'GPWS');
        pb('gpwsTerr', 'TERR', null, OFFL, off('gpwsTerr'), 40, T + 14, 'off');
        pb('gpwsSys', 'SYS', F, OFFL, off('gpwsSys'), 81, T + 14, 'off');
        pb('gpwsGs', 'G/S MODE', null, OFFL, off('gpwsGs'), 122, T + 14, 'off');
        pb('gpwsFlap', 'FLAP MODE', null, OFFL, off('gpwsFlap'), 163, T + 14, 'off');
        pb('gpwsLdg', 'LDG FLAP 3', null, ['ON', 'blue'], on('gpwsLdg'), 204, T + 14, 'on');

        T = 530;
        panel(L, T, LW, 66, 'RCDR');
        pb('rcdr', 'GND CTL', null, ONL, on('rcdr'), 58, T + 12, 'on', 'ck-small');
        pb('cvrErase', 'CVR ERASE', null, null, () => [false, false], 125, T + 12, 'on', 'ck-small');
        pb('cvrTest', 'CVR TEST', null, null, () => [false, false], 190, T + 12, 'on', 'ck-small');

        T = 598;
        panel(L, T, LW, 70, 'OXYGEN');
        plain('hiAlt', 'HIGH ALT LANDING', 46, T + 14, 'on', 'red', null, ['ON', 'white']);
        plain('maskMan', 'MASK MAN ON', 98, T + 14, 'on', 'red', null, ['ON', 'white']);
        pb('paxOxy', 'PASSENGERS', null, ['ON', 'white'], on('paxOxy'), 150, T + 14, 'on');
        pb('oxy', 'CREW SUPPLY', null, OFFL, off('oxy'), 202, T + 14, 'off');

        T = 670;
        panel(L, T, LW, 70, 'CALLS');
        [['callMech', 'MECH', 52], ['callFwd', 'FWD', 100], ['callAft', 'AFT', 148], ['callEmer', 'EMER', 196]].forEach(([id, l, x]) =>
            pb(id, l, ['CALL', 'white'], null, (s2) => [(s2.flash[id] || 0) > s2.t, false], x, T + 14, 'on', 'ck-small'));

        T = 742;
        panel(L, T, LW, 90, 'RAIN RPLNT   WIPER');
        pb('rainRplnt', 'RAIN RPLNT', null, null, () => [false, false], 62, T + 16, 'on', 'ck-small');
        knob('wipC', 'WIPER', ['OFF', 'SLOW', 'FAST'], 150, T + 14);

        // ---------------- 中欄（x 232–695）----------------
        panel(MX, 22, MW, 48, '', 'ck-blank');

        // FIRE
        T = 72;
        panel(MX, T, MW, 124, '');
        vtag('FIRE', MX + 6, T + 40); vtag('FIRE', MX + MW - 16, T + 40);
        tag('ENG 1', 316, T + 3); tag('APU', 463, T + 3); tag('ENG 2', 610, T + 3);
        const agent = (id, fid, x) => pb(id, 'AGENT', ['SQUIB', 'white'], ['DISCH', 'amber'], (s2) => [!!s2.pb[fid], !!s2.pb[id]], x, T + 14, 'on');
        const fireLt = (fid) => (s2) => [!!s2.pb[fid] || (s2.flash.fireTest || 0) > s2.t, false];
        agent('ag1a', 'fire1', 268); pb('fire1', 'ENG 1 FIRE', ['FIRE', 'red'], null, fireLt('fire1'), 316, T + 14, 'on', 'ck-fire'); agent('ag1b', 'fire1', 364);
        pb('fireapu', 'APU FIRE', ['FIRE', 'red'], null, fireLt('fireapu'), 440, T + 14, 'on', 'ck-fire'); agent('agapu', 'fireapu', 490);
        agent('ag2a', 'fire2', 562); pb('fire2', 'ENG 2 FIRE', ['FIRE', 'red'], null, fireLt('fire2'), 610, T + 14, 'on', 'ck-fire'); agent('ag2b', 'fire2', 658);
        pb('fireTest', 'ENG 1 TEST', null, null, () => [false, false], 316, T + 82, 'on', 'ck-small');
        pb('fireTestB', 'APU TEST', null, null, () => [false, false], 463, T + 82, 'on', 'ck-small');
        pb('fireTestC', 'ENG 2 TEST', null, null, () => [false, false], 610, T + 82, 'on', 'ck-small');

        // HYD
        T = 198;
        panel(MX, T, MW, 78, '');
        vtag('HYD', MX + 6, T + 22); vtag('HYD', MX + MW - 16, T + 22);
        line(`300,${T + 18} 625,${T + 18}`);
        ['300', '456', '540', '625'].forEach((x) => line(`${x},${T + 12} ${x},${T + 22}`));
        tag('GREEN', 300, T + 5, 'ck-tagbox'); tag('BLUE', 456, T + 5, 'ck-tagbox'); tag('PTU', 540, T + 5, 'ck-tagbox'); tag('YELLOW', 625, T + 5, 'ck-tagbox');
        pb('hydEng1', 'ENG 1 PUMP', F, OFFL, off('hydEng1', (s2) => s2.eng[0].s === 'run' && s2.pb.hydEng1 && s2.hyd.g < 1500), 300, T + 24, 'off');
        plain('ratMan', 'RAT MAN ON', 372, T + 24, 'on', 'red', null, ['ON', 'white']);
        pb('hydBlue', 'BLUE PUMP', F, OFFL, off('hydBlue', (s2) => s2.pb.hydBlue && sys.enginesRunning() > 0 && s2.hyd.b < 1500), 456, T + 24, 'off');
        pb('ptu', 'PTU', F, OFFL, off('ptu'), 540, T + 24, 'off');
        pb('hydEng2', 'ENG 2 PUMP', F, OFFL, off('hydEng2', (s2) => s2.eng[1].s === 'run' && s2.pb.hydEng2 && s2.hyd.y < 1500), 600, T + 24, 'off');
        pb('hydYel', 'YEL ELEC PUMP', F, ONL, on('hydYel'), 654, T + 24, 'on');

        // FUEL
        T = 278;
        panel(MX, T, MW, 94, '');
        vtag('FUEL', MX + 6, T + 40); vtag('FUEL', MX + MW - 16, T + 40);
        line(`311,${T + 20} 620,${T + 20}`);
        ['311', '417', '613'].forEach((x) => line(`${x},${T + 12} ${x},${T + 20}`));
        tag('ENG 1', 311, T + 5, 'ck-tagbox'); tag('APU', 417, T + 5, 'ck-tagbox'); tag('ENG 2', 613, T + 5, 'ck-tagbox');
        const fp = (id, label, x) => pb(id, label, F, OFFL, off(id, (s2) => (id[1] === 'C' ? s2.pb[id] && s2.fuel.C <= 0 : false)), x, T + 40, 'off');
        tag('L TK PUMPS', 311, T + 27); fp('fL1', '1', 292); fp('fL2', '2', 332);
        tag('CTR TK PUMPS', 463, T + 27); fp('fC1', '1', 420); fp('fC2', '2', 506);
        tag('R TK PUMPS', 613, T + 27); fp('fR1', '1', 594); fp('fR2', '2', 634);
        pb('xfeed', 'X FEED', null, ['OPEN', 'green'], on('xfeed'), 463, T + 40, 'on');
        pb('fuelMode', 'MODE SEL', ['MAN', 'amber'], null, on('fuelMode'), 380, T + 40, 'on');

        // ELEC
        T = 374;
        panel(MX, T, MW, 150, '');
        vtag('ELEC', MX + 6, T + 50); vtag('ELEC', MX + MW - 16, T + 50);
        pb('commercial', 'COMMERCIAL', F, OFFL, off('commercial'), 272, T + 14, 'off');
        pb('galy', 'GALLEY', F, OFFL, off('galy'), 318, T + 14, 'off');
        tag('DC BUS 1', 388, T + 5, 'ck-tagbox'); tag('DC BUS 2', 540, T + 5, 'ck-tagbox');
        const dc = (id, x) => { const d = el('div', 'ck-lcd ck-lcd-s'); refs.live[id] = d; at(d, x, T + 22); };
        dc('bat1v', 388); dc('bat2v', 540);
        pb('bat1', 'BAT 1', F, OFFL, (s2) => [s2.pb.bat1 && s2.bat[0] <= 0, !s2.pb.bat1], 448, T + 14, 'on');
        pb('bat2', 'BAT 2', F, OFFL, (s2) => [s2.pb.bat2 && s2.bat[1] <= 0, !s2.pb.bat2], 486, T + 14, 'on');
        pb('acess', 'AC ESS FEED', F, ['ALTN', 'white'], on('acess'), 620, T + 14, 'on');
        line(`388,${T + 12} 388,${T + 4}`);
        const busBox = (key, label, x) => { const d = el('div', 'ck-busbox', label); refs.live[key] = d; at(d, x, T + 72); };
        line(`322,${T + 82} 610,${T + 82}`);
        busBox('ac1', 'AC BUS 1', 322); busBox('acEss', 'AC ESS BUS', 463); busBox('ac2', 'AC BUS 2', 610);
        const C = T + 96;
        pb('idg1', 'IDG 1', F, null, (s2) => [!!s2.pb.idg1, false], 258, C, 'on', 'red');
        pb('gen1', 'GEN 1', F, OFFL, off('gen1', (s2) => s2.pb.gen1 && s2.eng[0].s === 'run' && s2.eng[0].n2 < 50), 322, C, 'off');
        pb('apugen', 'APU GEN', ['AVAIL', 'green'], OFFL, (s2) => [s2.apu.s === 'run' && s2.pb.apugen, !s2.pb.apugen], 396, C, 'off');
        pb('bustie', 'BUS TIE', null, OFFL, off('bustie'), 463, C, 'off');
        pb('ext', 'EXT PWR', ['AVAIL', 'green'], ONL, (s2) => [extAvailNow() && !s2.pb.ext, s2.pb.ext && extAvailNow()], 530, C, 'on');
        pb('gen2', 'GEN 2', F, OFFL, off('gen2', (s2) => s2.pb.gen2 && s2.eng[1].s === 'run' && s2.eng[1].n2 < 50), 604, C, 'off');
        pb('idg2', 'IDG 2', F, null, (s2) => [!!s2.pb.idg2, false], 664, C, 'on', 'red');

        // AIR COND
        T = 526;
        panel(MX, T, MW, 128, '');
        vtag('AIR COND', MX + 6, T + 40); vtag('AIR COND', MX + MW - 16, T + 40);
        knob('flow', 'PACK FLOW', ['LO', 'NORM', 'HI'], 282, T + 6, [-65, -5, 60]);
        knob('tempC', 'COCKPIT', ['COLD', 'MED', 'HOT'], 380, T + 6, [-115, 0, 115]);
        knob('tempF', 'FWD CABIN', ['COLD', 'MED', 'HOT'], 462, T + 6, [-115, 0, 115]);
        knob('tempA', 'AFT CABIN', ['COLD', 'MED', 'HOT'], 544, T + 6, [-115, 0, 115]);
        pb('hotAir', 'HOT AIR', F, OFFL, off('hotAir'), 636, T + 10, 'off');
        const Y = T + 74;
        line(`270,${Y - 4} 658,${Y - 4}`);
        pb('pack1', 'PACK 1', F, OFFL, off('pack1'), 270, Y, 'off');
        pb('bleed1', 'ENG 1 BLEED', F, OFFL, off('bleed1'), 324, Y, 'off');
        pb('ram', 'RAM AIR', null, ONL, on('ram'), 394, Y, 'on', 'red');
        pb('apubleed', 'APU BLEED', F, ONL, on('apubleed'), 463, Y, 'on');
        knob('xbleed', 'X BLEED', ['SHUT', 'AUTO', 'OPEN'], 538, Y - 4, [-65, 0, 65]);
        pb('bleed2', 'ENG 2 BLEED', F, OFFL, off('bleed2'), 614, Y, 'off');
        pb('pack2', 'PACK 2', F, OFFL, off('pack2'), 660, Y, 'off');

        // 下排：ANTI ICE / PROBE / CABIN PRESS
        T = 656;
        panel(MX, T, 186, 72, 'ANTI ICE');
        pb('wai', 'WING', F, ONL, on('wai'), 270, T + 14, 'on');
        pb('eai1', 'ENG 1', F, ONL, on('eai1'), 340, T + 14, 'on');
        pb('eai2', 'ENG 2', F, ONL, on('eai2'), 388, T + 14, 'on');
        panel(MX + 188, T, 76, 72, 'PROBE');
        pb('probe', 'AUTO', null, ONL, on('probe'), 458, T + 14, 'on');
        panel(MX + 266, T, 197, 72, 'CABIN PRESS');
        sw('cabVs', 'MAN V/S CTL', ['UP', 'DN'], 546, T + 14);
        const cm = U.pushButton({ id: 'cabMode', label: 'MODE SEL', top: F, bot: ['MAN', 'white'] }, () => setSel('cabMode', st.sel.cabMode === 'MAN' ? 'AUTO' : 'MAN'));
        at(cm.el, 606, T + 14);
        refs.extra.push((pw2) => {
            cm.top.set(false, false);
            cm.bot.set(pw2 && st.sel.cabMode === 'MAN', false);
            cm.btn.setAttribute('aria-pressed', String(st.sel.cabMode === 'MAN'));
        });
        pb('ditch', 'DITCHING', null, ONL, on('ditch'), 668, T + 14, 'on');

        // EXT LT / APU / INT LT / SIGNS
        T = 730;
        panel(MX, T, 204, 148, 'EXT LT');
        sw('strobe', 'STROBE', ['ON', 'AUTO', 'OFF'], 268, T + 14);
        sw('beacon', 'BEACON', ['ON', 'OFF'], 330, T + 14);
        sw('wing', 'WING', ['ON', 'OFF'], 376, T + 14);
        sw('navlogo', 'NAV&LOGO', ['2', 'OFF', '1'], 264, T + 58);
        sw('rwyto', 'RWY TURN OFF', ['ON', 'OFF'], 328, T + 58);
        sw('nose', 'NOSE', ['T.O', 'TAXI', 'OFF'], 394, T + 58);
        sw('landl', 'LAND L', ['ON', 'OFF', 'RETR'], 270, T + 102);
        sw('landr', 'LAND R', ['ON', 'OFF', 'RETR'], 346, T + 102);

        panel(MX + 206, T, 58, 148, 'APU');
        pb('apumaster', 'MASTER SW', F, ONL, on('apumaster'), 467, T + 18, 'on');
        pb('apustart', 'START', ONL, ['AVAIL', 'green'], (s2) => [s2.apu.s === 'start', s2.apu.s === 'run'], 467, T + 76, 'on');

        panel(MX + 266, T, 197, 62, 'INT LT');
        sw('dome', 'DOME', ['BRT', 'DIM', 'OFF'], 540, T + 14);
        sw('ann', 'ANN LT', ['TEST', 'BRT', 'DIM'], 626, T + 14);
        panel(MX + 266, T + 64, 197, 84, 'SIGNS');
        sw('seat', 'SEAT BELTS', ['ON', 'AUTO', 'OFF'], 528, T + 81);
        sw('nosmk', 'NO SMOKING', ['ON', 'AUTO', 'OFF'], 598, T + 81);
        sw('emer', 'EMER EXIT', ['ON', 'ARM', 'OFF'], 666, T + 81);

        // ---------------- 右欄（x 698–908）----------------
        const ap = panel(R, 22, RW, 90, '');
        ap.classList.add('ck-deco');
        ap.append(el('p', 'ck-deco-t', 'AUDIO SWITCHING'));
        const dots = el('div', 'ck-deco-dots');
        ['VHF1', 'VHF2', 'VHF3', 'HF1', 'HF2', 'INT', 'CAB', 'PA'].forEach((t) => dots.append(el('span', '', t)));
        ap.append(dots);
        const rmp = panel(R, 114, RW, 110, '');
        rmp.classList.add('ck-deco');
        const disp = el('div', 'ck-freq');
        disp.append(el('span', '', '128.175'), el('i', '', '↔'), el('span', '', '135.550'));
        rmp.append(el('p', 'ck-deco-t', 'RMP 1'), disp);
        const rb = el('div', 'ck-deco-btns');
        ['VHF1', 'VHF2', 'VHF3', 'HF1', 'SEL', 'HF2', 'AM', 'NAV', 'VOR', 'ILS', 'ADF', 'BFO'].forEach((t) => rb.append(el('span', '', t)));
        rmp.append(rb);
        panel(R, 226, RW, 66, '', 'ck-blank');

        T = 294;
        panel(R, T, RW, 70, 'FLT CTL');
        pb('elac2', 'ELAC 2', F, OFFL, off('elac2'), 736, T + 14, 'off');
        pb('sec2', 'SEC 2', F, OFFL, off('sec2'), 786, T + 14, 'off');
        pb('sec3', 'SEC 3', F, OFFL, off('sec3'), 836, T + 14, 'off');
        pb('fac2', 'FAC 2', F, OFFL, off('fac2'), 884, T + 14, 'off');

        T = 366;
        panel(R, T, RW, 138, 'CARGO HEAT');
        pb('fwdIsol', 'FWD ISOL VLV', F, ['OFF', 'white'], off('fwdIsol'), 738, T + 14, 'off');
        pb('cargoHot', 'HOT AIR', F, ['OFF', 'white'], off('cargoHot'), 803, T + 14, 'off');
        pb('aftIsol', 'AFT ISOL VLV', F, ['OFF', 'white'], off('aftIsol'), 868, T + 14, 'off');
        knob('cargoFwd', 'FWD', ['COLD', 'MED', 'HOT'], 756, T + 64, [-115, 0, 115]);
        knob('cargoAft', 'AFT', ['COLD', 'MED', 'HOT'], 850, T + 64, [-115, 0, 115]);

        T = 506;
        panel(R, T, RW, 70, 'CARGO SMOKE');
        pb('disch1', 'DISCH', null, ['DISCH', 'amber'], on('disch1'), 726, T + 14, 'on', 'red');
        pb('smokeFwd', 'FWD', null, null, () => [false, false], 772, T + 14, 'on', 'ck-small');
        pb('smokeTest', 'TEST', null, null, () => [false, false], 803, T + 14, 'on', 'ck-small');
        pb('smokeAft', 'AFT', null, null, () => [false, false], 834, T + 14, 'on', 'ck-small');
        pb('disch2', 'DISCH', null, ['DISCH', 'amber'], on('disch2'), 880, T + 14, 'on', 'red');

        T = 578;
        panel(R, T, RW, 70, 'VENTILATION');
        pb('blower', 'BLOWER', F, ['OVRD', 'white'], on('blower'), 740, T + 14, 'on', 'ck-small');
        pb('extract', 'EXTRACT', F, ['OVRD', 'white'], on('extract'), 803, T + 14, 'on', 'ck-small');
        pb('cabFans', 'CAB FANS', null, OFFL, off('cabFans'), 868, T + 14, 'off', 'ck-small');

        T = 650;
        panel(R, T, RW, 70, 'ENG');
        tag('MAN START', 762, T + 4); tag('N1 MODE', 850, T + 4);
        pb('manStart1', '1', null, ONL, on('manStart1'), 726, T + 14, 'on');
        pb('manStart2', '2', null, ONL, on('manStart2'), 770, T + 14, 'on');
        pb('n1mode1', '1', F, ['MAN', 'white'], on('n1mode1'), 830, T + 14, 'on');
        pb('n1mode2', '2', F, ['MAN', 'white'], on('n1mode2'), 874, T + 14, 'on');

        T = 722;
        panel(R, T, RW, 130, 'WIPER');
        knob('wipF', 'WIPER', ['OFF', 'SLOW', 'FAST'], 764, T + 20);
        pb('rainRplnt2', 'RAIN RPLNT', null, null, () => [false, false], 862, T + 24, 'on', 'ck-small');

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
