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
    const refs = { pb: {}, sel: {}, tg: {}, ir: [], live: {} };
    sys.state = null;

    function fresh() {
        return {
            pb: {
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
            },
            sel: {
                ir1: 'OFF', ir2: 'OFF', ir3: 'OFF', xbleed: 'AUTO', mode: 'NORM', m1: 'OFF', m2: 'OFF',
                strobe: 'AUTO', beacon: 'OFF', wing: 'OFF', navlogo: 'OFF', rwyto: 'OFF', landl: 'OFF', landr: 'OFF', nose: 'OFF',
                seat: 'OFF', nosmk: 'OFF', emer: 'ARM',
                tempC: 'MED', tempF: 'MED', tempA: 'MED', flow: 'NORM', cabMode: 'AUTO', wipC: 'OFF', wipF: 'OFF', dome: 'OFF', ann: 'BRT'
            },
            flash: {},
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
        const gen1 = p.gen1 && !p.idg1 && !p.fire1 && e[0].n2 >= 50;
        const gen2 = p.gen2 && !p.idg2 && !p.fire2 && e[1].n2 >= 50;
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
        let g = e[0].n2 >= 50 && p.hydEng1 && !p.fire1 ? 3000 : 0;
        let y = (e[1].n2 >= 50 && p.hydEng2 && !p.fire2) || (p.hydYel && b.ac2) ? 3000 : 0;
        const bl = p.hydBlue && b.ac2 && (e[0].n2 >= 50 || e[1].n2 >= 50) ? 3000 : 0;
        if (p.ptu) {
            if (g < 500 && y > 2000 && b.dcbat) g = 2500;
            else if (y < 500 && g > 2000 && b.dcbat) y = 2500;
        }
        h.g = approach(h.g, g, 1500, dt);
        h.b = approach(h.b, bl, 1500, dt);
        h.y = approach(h.y, y, 1500, dt);

        // 引氣
        const apuAir = p.apubleed && a.s === 'run';
        const eAir = (i) => (e[i].n2 >= 50 && (i === 0 ? p.bleed1 && !p.fire1 : p.bleed2 && !p.fire2));
        const xOpen = st.sel.xbleed === 'OPEN' || (st.sel.xbleed === 'AUTO' && apuAir);
        const L = eAir(0) || (xOpen && (apuAir || eAir(1)));
        const R = eAir(1) || (xOpen && (apuAir || eAir(0)));
        st.air.L = approach(st.air.L, L ? 35 : 0, 40, dt);
        st.air.R = approach(st.air.R, R ? 35 : 0, 40, dt);

        // 燃油消耗
        const f = st.fuel;
        for (let i = 0; i < 2; i++) {
            const use = (e[i].ff / 3600) * dt;
            if (use <= 0) continue;
            const useC = (p.fC1 || p.fC2) && f.C > 0 && b.acess;
            if (useC) f.C = Math.max(0, f.C - use);
            else if (i === 0) f.L = Math.max(0, f.L - use);
            else f.R = Math.max(0, f.R - use);
        }
        if (a.s === 'run') f.L = Math.max(0, f.L - (130 / 3600) * dt);
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

    function press(id) {
        const p = st.pb;
        if (id === 'apustart') { apuStart(); return sys.refresh(); }
        if (id === 'ext' && !p.ext && !extAvailNow()) {
            A.toast(onGround() && sys.enginesRunning() === 0 ? '這個機位沒有地面電源。' : '發動機運轉中或在空中，不能接地面電源。');
            return;
        }
        if (id.startsWith('call')) { st.flash[id] = st.t + 1.2; A.toast('呼叫送出。'); return sys.refresh(); }
        p[id] = !p[id];
        if (/^fire(1|2|apu)$/.test(id) && p[id]) A.toast('FIRE 按鈕按下：關閉該側的燃油、引氣、液壓和發電機，發動機或 APU 停車。再按一次可放開。');
        if (id === 'apumaster' && p.apumaster) A.toast('APU MASTER SW ON。接著按 START。');
        if (id === 'apumaster' && !p.apumaster && st.apu.s === 'run') A.toast('APU 關閉中。');
        sys.refresh();
    }

    const off = (id, fault) => (s) => [fault ? fault(s) : false, !s.pb[id]];
    const on = (id, top) => (s) => [top ? top(s) : false, !!s.pb[id]];

    function tgl(def) {
        const wrap = el('div', 'ck-tgl');
        wrap.dataset.id = def.id;
        const row = el('div', 'ck-tgl-row');
        const btns = def.opts.map((o) => {
            const bt = el('button', 'ck-opt', o);
            bt.type = 'button';
            bt.dataset.v = o;
            bt.addEventListener('click', () => setSel(def.id, o));
            row.append(bt);
            return bt;
        });
        wrap.append(el('span', 'ck-pb-label', def.label), row);
        return {
            el: wrap,
            set(v) { btns.forEach((bt) => { const o = bt.dataset.v === v; bt.classList.toggle('on', o); bt.setAttribute('aria-pressed', String(o)); }); }
        };
    }

    function build(host) {
        host.textContent = '';
        const cols = [el('div', 'ck-oh-col'), el('div', 'ck-oh-col ck-oh-mid'), el('div', 'ck-oh-col')];
        cols.forEach((c) => host.append(c));
        const row = (col) => { const r = el('div', 'ck-oh-row'); col.append(r); return r; };
        const sec = (parent, title, note) => {
            const s2 = el('section', 'ck-sec');
            const hd = el('div', 'ck-sec-hd');
            hd.append(el('h3', 'ck-sec-title', title));
            if (note) hd.append(el('span', 'ck-sec-note', note));
            const body = el('div', 'ck-sec-body');
            s2.append(hd, body);
            parent.append(s2);
            return body;
        };
        const addPb = (body, id, label, top, bot, lt) => {
            const x = U.pushButton({ id, label, top, bot }, () => press(id));
            x.lt = lt;
            refs.pb[id] = x;
            body.append(x.el);
        };
        const addTgl = (body, id, label, opts) => {
            const x = tgl({ id, label, opts });
            refs.tg[id] = x;
            body.append(x.el);
        };
        const live = (body, key) => {
            const p = el('p', 'ck-live caption-5');
            refs.live[key] = p;
            body.append(p);
        };
        const brk = (body) => body.append(el('span', 'ck-brk'));
        const F = ['FAULT', 'amber'], OFFL = ['OFF', 'white'], ONL = ['ON', 'blue'];
        const [L, C, R] = cols;

        // ================= 左側（機長側）=================
        let b = sec(L, 'ADIRS', '慣性基準');
        const irRow = el('div', 'ck-row ck-row-ir');
        [1, 2, 3].forEach((n) => {
            const col = el('div', 'ck-ir');
            const al = U.ann('ALIGN', 'green');
            const sl = U.selector({ id: 'ir' + n, label: 'IR ' + n, opts: ['OFF', 'NAV', 'ATT'] }, setSel);
            col.append(al, sl.el);
            irRow.append(col);
            refs.ir.push(al);
            refs.sel['ir' + n] = sl;
        });
        b.append(irRow);
        refs.onbat = U.ann('ON BAT', 'white');
        const ob = el('div', 'ck-onbat');
        ob.append(refs.onbat);
        b.append(ob);
        live(b, 'adirs');

        b = sec(L, 'FLT CTL', '飛控電腦（左）');
        addPb(b, 'elac1', 'ELAC 1', F, OFFL, off('elac1'));
        addPb(b, 'sec1', 'SEC 1', F, OFFL, off('sec1'));
        addPb(b, 'sec3', 'SEC 3', F, OFFL, off('sec3'));
        addPb(b, 'fac1', 'FAC 1', F, OFFL, off('fac1'));

        let r = row(L);
        b = sec(r, 'EVAC', '撤離');
        addPb(b, 'evacHorn', 'HORN SHUT OFF', null, ['SHUT OFF', 'white'], on('evacHorn'));
        b = sec(r, 'EMER ELEC', '緊急電力');
        addPb(b, 'emerMan', 'MAN ON', F, ONL, on('emerMan'));

        b = sec(L, 'GPWS', '近地警告');
        addPb(b, 'gpwsSys', 'SYS', F, OFFL, off('gpwsSys'));
        addPb(b, 'gpwsGs', 'G/S MODE', null, OFFL, off('gpwsGs'));
        addPb(b, 'gpwsFlap', 'FLAP MODE', null, OFFL, off('gpwsFlap'));
        addPb(b, 'gpwsTerr', 'TERR', null, OFFL, off('gpwsTerr'));

        r = row(L);
        b = sec(r, 'RCDR', '記錄器');
        addPb(b, 'rcdr', 'GND CTL', null, ONL, on('rcdr'));
        b = sec(r, 'OXYGEN', '氧氣');
        addPb(b, 'oxy', 'CREW SUPPLY', null, OFFL, off('oxy'));

        b = sec(L, 'CALLS', '呼叫（按一下）');
        [['callMech', 'MECH'], ['callCapt', 'CAPT'], ['callAll', 'ALL'], ['callFwd', 'FWD'], ['callAft', 'AFT'], ['callPurs', 'PURS']]
            .forEach(([id, l]) => addPb(b, id, l, ['CALL', 'white'], null, (s2) => [(s2.flash[id] || 0) > s2.t, false]));

        b = sec(L, 'WIPER', '機長雨刷');
        addTgl(b, 'wipC', 'WIPER', ['OFF', 'SLOW', 'FAST']);

        // ================= 中央 =================
        b = sec(C, 'FIRE', '火警');
        addPb(b, 'fire1', 'ENG 1 FIRE', ['FIRE', 'red'], null, (s2) => [!!s2.pb.fire1, false]);
        addPb(b, 'fireapu', 'APU FIRE', ['FIRE', 'red'], null, (s2) => [!!s2.pb.fireapu, false]);
        addPb(b, 'fire2', 'ENG 2 FIRE', ['FIRE', 'red'], null, (s2) => [!!s2.pb.fire2, false]);

        r = row(C);
        b = sec(r, 'HYD', '液壓');
        addPb(b, 'hydEng1', 'ENG 1 PUMP', F, OFFL, off('hydEng1', (s2) => s2.eng[0].s === 'run' && s2.pb.hydEng1 && s2.hyd.g < 1500));
        addPb(b, 'hydBlue', 'BLUE ELEC', F, OFFL, off('hydBlue', (s2) => s2.pb.hydBlue && sys.enginesRunning() > 0 && s2.hyd.b < 1500));
        addPb(b, 'hydEng2', 'ENG 2 PUMP', F, OFFL, off('hydEng2', (s2) => s2.eng[1].s === 'run' && s2.pb.hydEng2 && s2.hyd.y < 1500));
        addPb(b, 'ptu', 'PTU', F, OFFL, off('ptu'));
        addPb(b, 'hydYel', 'YELLOW ELEC', F, ONL, on('hydYel'));
        b = sec(r, 'FUEL', '燃油');
        [['fL1', 'L TK 1'], ['fC1', 'CTR 1'], ['fR1', 'R TK 1'], ['fL2', 'L TK 2'], ['fC2', 'CTR 2'], ['fR2', 'R TK 2']]
            .forEach(([id, l]) => addPb(b, id, l, F, OFFL, off(id, (s2) => (id[1] === 'C' ? s2.pb[id] && s2.fuel.C <= 0 : false))));
        addPb(b, 'xfeed', 'X FEED', null, ['OPEN', 'green'], on('xfeed'));

        b = sec(C, 'ELEC', '電力');
        addPb(b, 'bat1', 'BAT 1', F, OFFL, (s2) => [s2.pb.bat1 && s2.bat[0] <= 0, !s2.pb.bat1]);
        addPb(b, 'bat2', 'BAT 2', F, OFFL, (s2) => [s2.pb.bat2 && s2.bat[1] <= 0, !s2.pb.bat2]);
        brk(b);
        addPb(b, 'idg1', 'IDG 1', F, null, (s2) => [!!s2.pb.idg1, false]);
        addPb(b, 'gen1', 'GEN 1', F, OFFL, off('gen1', (s2) => s2.pb.gen1 && s2.eng[0].s === 'run' && s2.eng[0].n2 < 50));
        addPb(b, 'ext', 'EXT PWR', ['AVAIL', 'green'], ONL, (s2) => [extAvailNow() && !s2.pb.ext, s2.pb.ext && extAvailNow()]);
        addPb(b, 'apugen', 'APU GEN', ['AVAIL', 'green'], ['OFF', 'white'], (s2) => [s2.apu.s === 'run' && s2.pb.apugen, !s2.pb.apugen]);
        addPb(b, 'gen2', 'GEN 2', F, OFFL, off('gen2', (s2) => s2.pb.gen2 && s2.eng[1].s === 'run' && s2.eng[1].n2 < 50));
        addPb(b, 'idg2', 'IDG 2', F, null, (s2) => [!!s2.pb.idg2, false]);
        brk(b);
        addPb(b, 'galy', 'GALY & CAB', F, OFFL, off('galy'));
        addPb(b, 'commercial', 'COMMERCIAL', null, OFFL, off('commercial'));
        addPb(b, 'bustie', 'BUS TIE', null, OFFL, off('bustie'));
        addPb(b, 'acess', 'AC ESS FEED', F, ['ALTN', 'white'], on('acess'));

        b = sec(C, 'AIR COND', '空調與引氣');
        addTgl(b, 'tempC', 'COCKPIT', ['COLD', 'MED', 'HOT']);
        addTgl(b, 'tempF', 'FWD CABIN', ['COLD', 'MED', 'HOT']);
        addTgl(b, 'tempA', 'AFT CABIN', ['COLD', 'MED', 'HOT']);
        brk(b);
        addPb(b, 'hotAir', 'HOT AIR', F, OFFL, off('hotAir'));
        addPb(b, 'pack1', 'PACK 1', F, OFFL, off('pack1'));
        addTgl(b, 'flow', 'PACK FLOW', ['LO', 'NORM', 'HI']);
        addPb(b, 'pack2', 'PACK 2', F, OFFL, off('pack2'));
        addPb(b, 'ram', 'RAM AIR', null, ONL, on('ram'));
        brk(b);
        addPb(b, 'bleed1', 'ENG 1 BLEED', F, OFFL, off('bleed1'));
        addPb(b, 'apubleed', 'APU BLEED', F, ONL, on('apubleed'));
        addPb(b, 'bleed2', 'ENG 2 BLEED', F, OFFL, off('bleed2'));
        addTgl(b, 'xbleed', 'X BLEED', ['SHUT', 'AUTO', 'OPEN']);
        live(b, 'air');

        r = row(C);
        b = sec(r, 'ANTI ICE', '防冰');
        addPb(b, 'probe', 'PROBE/WINDOW', null, ONL, on('probe'));
        addPb(b, 'wai', 'WING', F, ONL, on('wai'));
        addPb(b, 'eai1', 'ENG 1', F, ONL, on('eai1'));
        addPb(b, 'eai2', 'ENG 2', F, ONL, on('eai2'));
        b = sec(r, 'APU', '輔助動力');
        addPb(b, 'apumaster', 'MASTER SW', F, ONL, on('apumaster'));
        addPb(b, 'apustart', 'START', ONL, ['AVAIL', 'green'], (s2) => [s2.apu.s === 'start', s2.apu.s === 'run']);
        live(b, 'apu');

        b = sec(C, 'EXT LT', '外部燈光');
        addTgl(b, 'strobe', 'STROBE', ['ON', 'AUTO', 'OFF']);
        addTgl(b, 'beacon', 'BEACON', ['ON', 'OFF']);
        addTgl(b, 'wing', 'WING', ['ON', 'OFF']);
        addTgl(b, 'navlogo', 'NAV & LOGO', ['1', 'OFF', '2']);
        addTgl(b, 'rwyto', 'RWY TURN OFF', ['ON', 'OFF']);
        addTgl(b, 'landl', 'LAND L', ['ON', 'RETR', 'OFF']);
        addTgl(b, 'landr', 'LAND R', ['ON', 'RETR', 'OFF']);
        addTgl(b, 'nose', 'NOSE', ['T.O', 'TAXI', 'OFF']);

        // ================= 右側（副駕駛側）=================
        b = sec(R, 'FLT CTL', '飛控電腦（右）');
        addPb(b, 'elac2', 'ELAC 2', F, OFFL, off('elac2'));
        addPb(b, 'sec2', 'SEC 2', F, OFFL, off('sec2'));
        addPb(b, 'fac2', 'FAC 2', F, OFFL, off('fac2'));

        b = sec(R, 'VENTILATION', '通風');
        addPb(b, 'blower', 'BLOWER', F, ['OVRD', 'white'], on('blower'));
        addPb(b, 'extract', 'EXTRACT', F, ['OVRD', 'white'], on('extract'));

        b = sec(R, 'ENG MAN START', '手動啟動');
        addPb(b, 'manStart1', 'ENG 1', null, ONL, on('manStart1'));
        addPb(b, 'manStart2', 'ENG 2', null, ONL, on('manStart2'));

        b = sec(R, 'CAB PRESS', '客艙增壓');
        addTgl(b, 'cabMode', 'MODE SEL', ['AUTO', 'MAN']);
        addPb(b, 'ditch', 'DITCHING', null, ONL, on('ditch'));
        live(b, 'cab');

        b = sec(R, 'WIPER', '副駕駛雨刷');
        addTgl(b, 'wipF', 'WIPER', ['OFF', 'SLOW', 'FAST']);

        b = sec(R, 'SIGNS', '客艙燈號');
        addTgl(b, 'seat', 'SEAT BELTS', ['ON', 'AUTO', 'OFF']);
        addTgl(b, 'nosmk', 'NO SMOKING', ['ON', 'AUTO', 'OFF']);
        addTgl(b, 'emer', 'EMER EXIT LT', ['ON', 'ARM', 'OFF']);

        b = sec(R, 'INT LT', '駕駛艙燈光');
        addTgl(b, 'dome', 'DOME', ['BRT', 'DIM', 'OFF']);
        addTgl(b, 'ann', 'ANN LT', ['TEST', 'BRT', 'DIM']);

        // ================= 中央座（不在頂板，這裡放在下面方便操作）=================
        const ped = el('div', 'ck-oh-ped');
        host.append(ped);
        b = sec(ped, 'ENGINE', '中央座：發動機啟動（不在頂板上）');
        addTgl(b, 'mode', 'ENG MODE', ['CRANK', 'NORM', 'IGN/START']);
        addTgl(b, 'm1', 'MASTER 1', ['OFF', 'ON']);
        addTgl(b, 'm2', 'MASTER 2', ['OFF', 'ON']);
        live(b, 'eng');
    }

    sys.build = build;

    // ---------- 更新畫面 ----------
    sys.refresh = function () {
        if (!st) return;
        const pw = st.buses.dcbat;
        for (const id in refs.pb) {
            const x = refs.pb[id];
            const r = x.lt(st);
            if (x.top) x.top.set(pw && !!r[0], r[0] === 'blink');
            if (x.bot) x.bot.set(pw && !!r[1], r[1] === 'blink');
            x.btn.setAttribute('aria-pressed', String(!!st.pb[id]));
            x.btn.setAttribute('aria-label', `${x.el.querySelector('.ck-pb-label').textContent}，目前${st.pb[id] ? '按下' : '放開'}`);
        }
        for (const id in refs.sel) refs.sel[id].set(st.sel[id]);
        for (const id in refs.tg) refs.tg[id].set(st.sel[id]);
        st.ir.forEach((r, i) => {
            const m = st.sel['ir' + (i + 1)];
            refs.ir[i].set(pw && ((m === 'NAV' && r.p < 1) || (m === 'ATT' && r.p < 1)), false);
        });
        refs.onbat.set(pw && st.buses.batOnly, false);
        const lv = refs.live;
        if (lv.adirs) lv.adirs.textContent = pw ? `對準 ${st.ir.map((r, i) => (st.sel['ir' + (i + 1)] === 'NAV' ? Math.round(r.p * 100) + '%' : '—')).join('　')}（實機約 10 分鐘，這裡縮短）` : '沒有電，ADIRS 不運作。';
        if (lv.apu) lv.apu.textContent = pw ? `APU N ${Math.round(st.apu.n)}%　EGT ${Math.round(st.apu.egt)}°C` : '';
        if (lv.air) lv.air.textContent = pw ? `引氣壓力 左 ${Math.round(st.air.L)}　右 ${Math.round(st.air.R)} psi` : '';
        if (lv.cab) {
            const alt = (A.fcu && A.fcu.state.alt) || 0;
            const pres = pw && sys.enginesRunning() > 0 && st.pb.pack1 && st.air.L >= 15;
            const cab = pres ? Math.min(alt, 1500 + alt * 0.16) : alt;
            const pr = (h) => 14.7 * Math.pow(1 - 6.8756e-6 * h, 5.2559);
            lv.cab.textContent = pw ? `客艙高度 ${Math.round(cab / 50) * 50} 呎　壓差 ${Math.max(0, pr(cab) - pr(alt)).toFixed(1)} psi` : '';
        }
        if (lv.eng) lv.eng.textContent = `N2 ${st.eng[0].n2.toFixed(0)}% / ${st.eng[1].n2.toFixed(0)}%`;
    };

    // ---------- 情境 ----------
    sys.apply = function (name) {
        st = fresh();
        sys.state = st;
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
    sys.pumpsOK = pumpsOK;
})(window);
