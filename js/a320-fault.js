// A320 故障模擬：注入故障、ECAM 警告、MASTER WARN／CAUT、處置程序（會自動打勾）和連鎖後果。
// 故障的「後果」寫在 a320-sys.js 的物理模型裡（發電機、液壓、引氣、燃油、客艙高度），這裡負責觸發、警告和程序。
// 程序和數值是依 A320 的邏輯簡化的教學示意，不是真實的 QRH／FCOM，也不能用於訓練。
(function (root) {
    'use strict';

    const A = root.A320;
    const el = A.ui.el;
    const fault = A.fault = {};

    const S = () => A.sys.state;
    const F = () => A.fcu.state;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const mw = { warn: false, caut: false, cautSounded: false };
    let pending = [];
    let crcAt = 0;
    let hosts = null;
    let lastActiveHtml = '';
    let lastListHtml = '';

    const inAir = () => F().phase === 'AIR';
    const engOn = (n) => S().eng[n - 1].s === 'run';

    // ---------- 故障清單 ----------
    const DEFS = [];

    function fireDef(n) {
        const fk = 'fire' + n, mk = 'm' + n, a1 = `ag${n}a`, a2 = `ag${n}b`;
        DEFS.push({
            id: fk, group: '火警', label: `發動機 ${n} 火警`, sev: 'warn', page: 'ENG',
            desc: '紅色火警、連續鈴聲。要照程序關發動機、按 FIRE 按鈕、放滅火劑。有時第一瓶撲不滅。',
            can: () => (engOn(n) ? '' : `ENG ${n} 沒有在運轉。`),
            title: () => `ENG ${n} FIRE`,
            start: (st, d) => { d.stubborn = Math.random() < 0.4; },
            tick: (st, d) => {
                if (d.out) return 'gone';
                const p = st.pb;
                if (p[fk] && p[a1] && (!d.stubborn || p[a2])) { A.toast(`ENG ${n} 火警熄滅。`); return 'gone'; }
                if (!d.spread && st.t - d.t0 > 120) { d.spread = true; A.toast(`ENG ${n} 火勢擴大：${n === 1 ? '左' : '右'}翼油箱開始漏油。`); inject(`fuelLeak${n}`, 0, { quiet: true }); }
                return '';
            },
            lines: (st, d) => {
                const p = st.pb, t = st.t - d.t0;
                const L = [
                    { t: `THR LEVER ${n} ........ IDLE`, ok: st.eng[n - 1].s !== 'run' || st.sel[mk] === 'OFF' },
                    { t: `ENG MASTER ${n} ........ OFF`, ok: st.sel[mk] === 'OFF' },
                    { t: `ENG ${n} FIRE P/B ........ PUSH`, ok: !!p[fk] },
                    { t: 'AGENT 1 AFTER 10 S ........ DISCH', ok: !!p[a1], wait: 10 - t }
                ];
                if (d.stubborn && p[a1]) L.push({ t: 'AGENT 2 AFTER 30 S ........ DISCH', ok: !!p[a2], wait: 30 - t });
                return L;
            },
            lit: () => [fk]
        });
    }

    function engFailDef(n) {
        const mk = 'm' + n;
        DEFS.push({
            id: `eng${n}fail`, group: '發動機', label: `發動機 ${n} 熄火損壞`, sev: 'caut', page: 'ENG',
            desc: '發動機損壞停車，不能再啟動。單發動機：爬升率變差，FL205 以上會慢慢飄降。',
            can: () => (engOn(n) ? '' : `ENG ${n} 沒有在運轉。`),
            title: (st, d) => (d.reason === 'fuel' ? `ENG ${n} FLAME OUT（燃油耗盡）` : `ENG ${n} FAIL`),
            start: (st, d) => { d.restartable = !!d.restartable; st.eng[n - 1].s = 'down'; },
            tick: (st, d) => {
                if (d.restartable && st.eng[n - 1].s === 'run') { A.toast(`ENG ${n} 重新啟動成功。`); return 'gone'; }
                if (!d.restartable && st.sel[mk] === 'OFF' && (!inAir() || F().alt <= 20500)) d.done = true;
                return '';
            },
            lines: (st, d) => {
                if (d.restartable) return [
                    { t: 'FUEL X FEED ........ OPEN', ok: !!st.pb.xfeed },
                    { t: `ENG MASTER ${n} ........ OFF`, ok: st.sel[mk] === 'OFF' || st.eng[n - 1].s !== 'off' },
                    { t: `ENG MODE ........ IGN/START`, ok: st.sel.mode === 'IGN/START' || st.eng[n - 1].s === 'run' },
                    { t: `ENG MASTER ${n} ........ ON（重新啟動）`, ok: st.eng[n - 1].s === 'run' }
                ];
                const L = [
                    { t: `THR LEVER ${n} ........ IDLE`, ok: true },
                    { t: `ENG MASTER ${n} ........ OFF`, ok: st.sel[mk] === 'OFF' }
                ];
                if (inAir()) L.push({ t: 'MAX ALT ........ FL 200（只剩單發）', ok: F().alt <= 20500 });
                return L;
            },
            lit: () => []
        });
    }

    function genDef(n) {
        const gk = 'gen' + n;
        DEFS.push({
            id: gk, group: '電力', label: `發電機 ${n} 故障`, sev: 'caut', page: 'ELEC',
            desc: 'GEN 掉線，另一側靠 BUS TIE 供電。有一半機率「關掉再開」能恢復。',
            can: () => (engOn(n) && S().pb[gk] ? '' : `GEN ${n} 現在沒在供電。`),
            title: () => `ELEC GEN ${n} FAULT`,
            start: (st, d) => { d.transient = Math.random() < 0.5; d.stage = 0; },
            tick: (st, d) => {
                const on = !!st.pb[gk];
                if (d.stage === 0 && !on) d.stage = 1;
                else if (d.stage === 1 && on) { if (d.transient) { A.toast(`GEN ${n} 恢復正常。`); return 'gone'; } d.stage = 2; A.toast(`GEN ${n} 又跳掉了，這次要關掉不再使用。`); }
                else if (d.stage === 2 && !on) d.done = true;
                return '';
            },
            lines: (st, d) => {
                const on = !!st.pb[gk];
                const L = [{ t: `GEN ${n} ........ OFF THEN ON`, ok: d.stage >= 1 }];
                if (d.stage >= 1) L.push({ t: d.stage === 2 ? `GEN ${n} ........ OFF（再次故障）` : `GEN ${n} ........ ON`, ok: d.stage === 2 ? !on : on });
                return L;
            },
            lit: (st) => (st.pb[gk] ? [gk] : [])
        });
    }

    function hydDef(key, name, sysName, pumps) {
        DEFS.push({
            id: key, group: '液壓', label: `${sysName} 系統漏油`, sev: 'caut', page: 'HYD',
            desc: key === 'hydG'
                ? '綠系統壓力掉光。如果 PTU 還開著，25 秒後會把黃系統的油也抽乾，變成雙液壓故障。'
                : '黃系統壓力掉光。PTU 還開著會把綠系統的油也抽乾。',
            can: () => (A.sys.enginesRunning() > 0 ? '' : '發動機要在運轉。'),
            title: () => `HYD ${name} SYS LO PR`,
            start: (st, d) => { d.tPtu = 0; },
            tick: (st, d) => {
                const other = key === 'hydG' ? 'hydY' : 'hydG';
                if (st.pb.ptu && !st.flt[other] && st.t - d.t0 > 25) {
                    A.toast('PTU 把另一個系統的液壓油也抽乾了！');
                    inject(other, 0, { quiet: true });
                }
                if (!st.pb.ptu && pumps.every((k) => !st.pb[k])) d.done = true;
                return '';
            },
            lines: (st) => [
                { t: 'PTU ........ OFF', ok: !st.pb.ptu },
                ...pumps.map((k) => ({ t: `${{ hydEng1: 'ENG 1 PUMP', hydEng2: 'ENG 2 PUMP', hydYel: 'Y ELEC PUMP' }[k]} ........ OFF`, ok: !st.pb[k] }))
            ],
            lit: (st) => pumps.filter((k) => st.pb[k])
        });
    }

    function leakDef(n) {
        const mk = 'm' + n;
        DEFS.push({
            id: `fuelLeak${n}`, group: '燃油', label: `發動機 ${n} 油管漏油`, sev: 'caut', page: 'FUEL',
            desc: '發動機運轉時一直漏油（約每分鐘 400 公斤，已加速）。要隔離漏油、關掉那具發動機。',
            can: () => (engOn(n) ? '' : `ENG ${n} 沒有在運轉。`),
            title: () => `FUEL LEAK FROM ENG ${n}`,
            start: () => {},
            tick: (st, d) => { if (st.sel[mk] === 'OFF' && !st.pb.xfeed) d.done = true; return ''; },
            lines: (st) => [
                { t: 'FUEL X FEED ........ SHUT', ok: !st.pb.xfeed },
                { t: `ENG MASTER ${n} ........ OFF`, ok: st.sel[mk] === 'OFF' }
            ],
            lit: () => []
        });
    }

    function bleedDef(n) {
        const bk = 'bleed' + n;
        DEFS.push({
            id: bk, group: '空調與座艙', label: `發動機 ${n} 引氣漏氣`, sev: 'caut', page: 'BLEED',
            desc: '這一側引氣壓力掉光，PACK 沒有氣。把 BLEED 關掉隔離。',
            can: () => (engOn(n) ? '' : `ENG ${n} 沒有在運轉。`),
            title: () => `AIR ENG ${n} BLEED LEAK`,
            start: () => {},
            tick: (st, d) => { if (!st.pb[bk]) d.done = true; return ''; },
            lines: (st) => [{ t: `ENG ${n} BLEED ........ OFF`, ok: !st.pb[bk] }],
            lit: (st) => (st.pb[bk] ? [bk] : [])
        });
    }

    fireDef(1); fireDef(2);
    DEFS.push({
        id: 'apuFire', group: '火警', label: 'APU 火警', sev: 'warn', page: 'APU',
        desc: 'APU 會自動關機。要按 APU FIRE 按鈕、放滅火劑。',
        can: () => (['run', 'start'].includes(S().apu.s) ? '' : 'APU 沒有在運轉。'),
        title: () => 'APU FIRE',
        start: (st) => { st.apu.s = 'down'; st.pb.apumaster = false; },
        tick: (st, d) => {
            if (st.pb.fireapu && st.pb.agapu) { A.toast('APU 火警熄滅。'); return 'gone'; }
            return '';
        },
        lines: (st, d) => [
            { t: 'APU FIRE P/B ........ PUSH', ok: !!st.pb.fireapu },
            { t: 'AGENT AFTER 10 S ........ DISCH', ok: !!st.pb.agapu, wait: 10 - (st.t - d.t0) },
            { t: 'APU MASTER SW ........ OFF', ok: !st.pb.apumaster }
        ],
        lit: () => ['fireapu']
    });
    engFailDef(1); engFailDef(2);
    genDef(1); genDef(2);
    DEFS.push({
        id: 'elecEmer', group: '電力', label: '雙發電機失效（EMER CONFIG）', sev: 'warn', page: 'ELEC',
        desc: '兩具發電機都掉了。RAT 放出，只剩 AC ESS 和部分儀表。要在空中啟動 APU 才能把電力救回來。',
        can: () => (inAir() && A.sys.enginesRunning() === 2 ? '' : '要在空中、兩具發動機都運轉。'),
        title: () => 'ELEC EMER CONFIG',
        start: (st) => {
            [1, 2].forEach((n) => { if (!st.flt['gen' + n]) st.flt['gen' + n] = { t0: st.t, hidden: true, done: true, stage: 2, transient: false }; });
        },
        tick: (st, d) => {
            if (st.apu.s === 'run' && st.pb.apugen) { A.toast('APU 發電機接手，AC BUS 1+2 恢復。'); d.done = false; return 'gone'; }
            return '';
        },
        lines: (st) => [
            { t: 'RAT ........ 已自動放出', ok: st.rat },
            { t: 'APU MASTER SW ........ ON', ok: !!st.pb.apumaster },
            { t: 'APU START ........ 等 AVAIL', ok: st.apu.s === 'run' },
            { t: 'APU GEN ........ ON', ok: st.apu.s === 'run' && !!st.pb.apugen }
        ],
        lit: () => []
    });
    hydDef('hydG', 'G', '綠', ['hydEng1']);
    hydDef('hydY', 'Y', '黃', ['hydEng2', 'hydYel']);
    leakDef(1); leakDef(2);
    bleedDef(1); bleedDef(2);
    DEFS.push({
        id: 'decomp', group: '空調與座艙', label: '座艙急速失壓', sev: 'warn', page: 'BLEED',
        desc: '客艙高度很快爬升。要戴氧氣面罩、打開安全帶燈，立刻緊急下降到 10000 呎以下。',
        can: () => (inAir() && F().alt > 10000 ? '' : '要在空中、高度超過 10000 呎。'),
        title: () => 'CAB PR EXCESS CAB ALT',
        start: (st, d) => { d.masks = false; },
        tick: (st, d) => {
            if (!d.masks && st.cabAlt > 14000) {
                d.masks = true;
                A.toast('客艙高度超過 14000 呎：乘客氧氣面罩自動掉下。');
                if (A.snd) A.snd.chime(2);
            }
            if (inAir() && F().alt <= 10000) { A.toast('已降到 10000 呎以下，客艙高度回到安全範圍。'); return 'gone'; }
            return '';
        },
        lines: (st) => [
            { t: 'CREW OXY MASKS ........ ON', ok: !!st.pb.oxy },
            { t: 'SEAT BELTS ........ ON', ok: st.sel.seat === 'ON' },
            { t: 'EMER DESCENT ........ INITIATE（FCU 高度設 10000，EXPED）', ok: F().altSel <= 10000 },
            { t: 'MASK MAN ON ........ PUSH', ok: !!st.pb.maskMan },
            { t: 'ALT ........ 下降到 10000 呎以下', ok: F().alt <= 10000 }
        ],
        lit: () => []
    });

    const byId = {};
    DEFS.forEach((d) => { byId[d.id] = d; });
    fault.defs = DEFS;

    // ---------- 注入 ----------
    function start(id, opts) {
        const st = S();
        const def = byId[id];
        if (!def || st.flt[id]) return;
        const d = Object.assign({ t0: st.t }, opts || {});
        st.flt[id] = d;
        def.start(st, d);
        if (!d.quiet) {
            if (def.sev === 'warn') mw.warn = true;
            else { mw.caut = true; mw.cautSounded = false; }
            if (A.ecam && A.ecam.setPage) A.ecam.setPage(def.page);
            A.toast(`故障：${def.title(st, d)}。看 ECAM 左邊的處置程序。`);
        }
        lastActiveHtml = '';
        if (A.sys.refresh) A.sys.refresh();
    }

    // delay 秒後注入（0 = 立刻）。回傳不能注入的原因（可以注入則回傳空字串）。
    function inject(id, delay, opts) {
        const def = byId[id];
        if (!def || !S()) return '';
        const why = def.can(S());
        if (S().flt[id]) return '這個故障已經在進行中。';
        if (why && !(opts && opts.quiet)) { A.toast(`現在不能注入：${why}`); return why; }
        if (why) return why;
        if (delay > 0) {
            pending.push({ id, at: performance.now() + delay * 1000, opts });
            A.toast(`${Math.round(delay)} 秒後會發生故障（不告訴你是哪一個）。`);
            return '';
        }
        start(id, opts);
        return '';
    }

    fault.inject = inject;
    fault.clear = (id) => { const st = S(); if (st && st.flt[id]) { delete st.flt[id]; lastActiveHtml = ''; } };
    fault.clearAll = () => {
        const st = S();
        if (st) st.flt = {};
        pending = [];
        mw.warn = mw.caut = false;
        lastActiveHtml = '';
        if (A.sys.refresh) A.sys.refresh();
    };
    fault.reset = () => { pending = []; mw.warn = mw.caut = false; mw.cautSounded = false; lastActiveHtml = ''; lastListHtml = ''; };
    fault.any = () => { const st = S(); return !!st && Object.keys(st.flt).some((k) => !st.flt[k].hidden); };
    fault.master = mw;
    fault.random = (delay) => {
        const st = S();
        const ok = DEFS.filter((d) => !st.flt[d.id] && !d.can(st));
        if (!ok.length) { A.toast('現在的狀態沒有可以注入的故障：先讓發動機運轉、飛到空中。'); return; }
        inject(ok[Math.floor(Math.random() * ok.length)].id, delay || 0);
    };

    // ---------- 每個模擬步驟 ----------
    fault.step = function () {
        const st = S();
        if (!st) return;
        for (const id in st.flt) {
            const d = st.flt[id];
            const def = byId[id];
            if (!def || d.hidden && id !== 'elecEmer') continue;
            if (def.tick(st, d) === 'gone') { delete st.flt[id]; lastActiveHtml = ''; }
        }
    };

    fault.lit = (pbId) => {
        const st = S();
        if (!st) return false;
        for (const id in st.flt) {
            const def = byId[id];
            if (def && !st.flt[id].hidden && def.lit(st, st.flt[id]).includes(pbId)) return true;
        }
        return false;
    };

    // ---------- ECAM 警告區的文字 ----------
    fault.ewd = function () {
        const st = S();
        const out = [];
        const ids = Object.keys(st.flt).filter((id) => byId[id] && !st.flt[id].hidden);
        ids.sort((a, b) => (byId[a].sev === 'warn' ? 0 : 1) - (byId[b].sev === 'warn' ? 0 : 1));
        ids.forEach((id) => {
            const d = st.flt[id], def = byId[id];
            out.push({ t: def.title(st, d), c: def.sev === 'warn' ? 'r' : 'a' });
            if (d.done) return;
            const lines = def.lines(st, d);
            let shown = 0;
            lines.forEach((l) => {
                if (l.ok) { out.push({ t: '✓ ' + l.t, c: 'g' }); return; }
                if (shown++ > 3) return;
                const w = l.wait > 0 ? `　（等 ${Math.ceil(l.wait)} 秒）` : '';
                out.push({ t: '· ' + l.t + w, c: 'b' });
            });
        });
        const both = st.flt.hydG && st.flt.hydY;
        if (both) { out.push({ t: 'F/CTL ALTN LAW（保護消失）', c: 'a' }); out.push({ t: 'L/G GRVTY EXTN 備用', c: 'a' }); }
        if (st.rat) out.push({ t: 'RAT OUT', c: 'g' });
        if (A.fcu && F().phase === 'AIR') [1, 2].forEach((n) => { if (st.eng[n - 1].s === 'off') out.push({ t: `ENG ${n} SHUT DOWN`, c: 'g' }); });
        return out;
    };

    // ---------- 畫面 ----------
    function procHtml(st) {
        const ids = Object.keys(st.flt).filter((id) => byId[id] && !st.flt[id].hidden);
        if (!ids.length) return '<p class="ck-flt-none body-6">目前沒有故障。從左邊挑一個注入，或按「隨機」。</p>';
        return ids.map((id) => {
            const d = st.flt[id], def = byId[id];
            const el2 = Math.round(st.t - d.t0);
            const head = `<h4 class="title-5 ck-flt-t ${def.sev === 'warn' ? 'r' : 'a'}">${def.title(st, d)}</h4><p class="caption-5 ck-flt-s">${d.done ? '程序已完成，故障仍在' : '處置中'}　已過 ${Math.floor(el2 / 60)}:${String(el2 % 60).padStart(2, '0')}</p>`;
            if (d.done) return `<div class="ck-flt-box">${head}</div>`;
            const lines = def.lines(st, d);
            let next = lines.findIndex((l) => !l.ok);
            const li = lines.map((l, i) => {
                const cls = l.ok ? 'done' : i === next ? 'next' : '';
                const w = !l.ok && l.wait > 0 ? `等 ${Math.ceil(l.wait)} 秒` : '';
                return `<li class="${cls}"><span class="ck-mark" aria-hidden="true"></span><span class="ck-step-t">${l.t}</span><span class="ck-step-w caption-5">${w}</span></li>`;
            }).join('');
            return `<div class="ck-flt-box">${head}<ol class="ck-steps">${li}</ol></div>`;
        }).join('');
    }

    fault.build = function (host) {
        hosts = {};
        host.textContent = '';
        const top = el('div', 'ck-flt-top');
        top.append(el('p', 'caption-5 muted', '挑一個故障注入，在 ECAM 或下面照程序處置。故障的後果會真的連鎖發生：停車、掉電、液壓壓力、漏油、客艙高度都會變。'));
        const ctl = el('div', 'ck-flt-ctl');
        const seg = el('fieldset', 'filter-seg');
        seg.append(el('legend', 'caption-1', '發生時間'));
        const row = el('div', 'seg-row');
        [['0', '立刻'], ['10', '10 秒後'], ['r', '隨機 30–120 秒']].forEach(([v, t], i) => {
            const lab = el('label', 'seg-opt');
            const inp = el('input');
            inp.type = 'radio'; inp.name = 'fdelay'; inp.value = v; inp.checked = i === 0;
            lab.append(inp, el('span', 'chip caption-1', t));
            row.append(lab);
        });
        seg.append(row);
        const delay = () => {
            const v = (document.querySelector('input[name="fdelay"]:checked') || {}).value;
            return v === 'r' ? 30 + Math.random() * 90 : Number(v || 0);
        };
        const rnd = el('button', 'btn btn-on-light caption-1', '隨機一個故障');
        rnd.type = 'button';
        rnd.addEventListener('click', () => fault.random(delay()));
        const clr = el('button', 'btn btn-on-light caption-1', '清除全部故障');
        clr.type = 'button';
        clr.addEventListener('click', () => { fault.clearAll(); A.toast('故障已全部清除。已經停掉的發動機、關掉的設備要自己重新開。'); });
        ctl.append(seg, rnd, clr);
        top.append(ctl);

        const grid = el('div', 'ck-flt-grid');
        const list = el('div', 'ck-flt-list');
        const groups = [];
        DEFS.forEach((d) => { if (!groups.includes(d.group)) groups.push(d.group); });
        hosts.badges = {};
        groups.forEach((g) => {
            const sec = el('section', 'ck-card ck-flt-group');
            sec.append(el('h3', 'title-5', g));
            DEFS.filter((d) => d.group === g).forEach((d) => {
                const r = el('div', 'ck-flt-item');
                const txt = el('div', 'ck-flt-txt');
                const nm = el('b', 'caption-1', d.label);
                const badge = el('span', 'ck-flt-badge caption-5');
                hosts.badges[d.id] = badge;
                const head = el('div', 'ck-flt-head');
                head.append(nm, badge);
                txt.append(head, el('p', 'caption-5 muted', d.desc));
                const b = el('button', 'btn btn-on-light caption-1', '注入');
                b.type = 'button';
                b.setAttribute('aria-label', `注入故障：${d.label}`);
                b.addEventListener('click', () => inject(d.id, delay()));
                r.append(txt, b);
                sec.append(r);
            });
            list.append(sec);
        });
        const side = el('div', 'ck-flt-side');
        const card = el('div', 'ck-card');
        card.append(el('h3', 'title-4', '目前的故障'));
        hosts.active = el('div', 'ck-flt-active');
        hosts.active.setAttribute('aria-live', 'off');
        card.append(hosts.active);
        side.append(card);
        grid.append(list, side);
        host.append(top, grid);

        // MASTER WARN / CAUT
        const w = document.getElementById('mwWarn');
        const c = document.getElementById('mwCaut');
        if (w) w.addEventListener('click', () => { mw.warn = false; fault.tick(); });
        if (c) c.addEventListener('click', () => { mw.caut = false; fault.tick(); });
    };

    // ---------- 每 0.1 秒 ----------
    fault.tick = function () {
        const st = S();
        if (!st) return;
        const now = performance.now();
        // 排程中的故障
        pending = pending.filter((p) => {
            if (now < p.at) return true;
            const def = byId[p.id];
            if (def && !st.flt[p.id]) {
                const why = def.can(st);
                if (why) A.toast(`排定的故障「${def.label}」沒有發生：${why}`);
                else start(p.id, p.opts);
            }
            return false;
        });

        // MASTER 燈和聲音
        const w = document.getElementById('mwWarn');
        const c = document.getElementById('mwCaut');
        if (w) { w.classList.toggle('on', mw.warn); w.setAttribute('aria-pressed', String(mw.warn)); }
        if (c) { c.classList.toggle('on', mw.caut); c.setAttribute('aria-pressed', String(mw.caut)); }
        if (A.snd && st.buses.dcbat) {
            if (mw.warn && now > crcAt) { A.snd.fire(0.9); crcAt = now + 1500; }
            if (mw.caut && !mw.cautSounded) { A.snd.chime(1); mw.cautSounded = true; }
        }

        if (!hosts) return;
        const act = procHtml(st);
        if (act !== lastActiveHtml) { hosts.active.innerHTML = act; lastActiveHtml = act; }
        const state = DEFS.map((d) => {
            const x = st.flt[d.id];
            const pend = pending.some((p) => p.id === d.id);
            return x && !x.hidden ? (x.done ? 'done' : 'on') : pend ? 'pend' : '';
        }).join(',');
        if (state !== lastListHtml) {
            lastListHtml = state;
            DEFS.forEach((d) => {
                const x = st.flt[d.id];
                const pend = pending.some((p) => p.id === d.id);
                const b = hosts.badges[d.id];
                b.textContent = x && !x.hidden ? (x.done ? '已處置' : '進行中') : pend ? '排程中' : '';
                b.dataset.s = x && !x.hidden ? (x.done ? 'done' : 'on') : pend ? 'pend' : '';
            });
        }
    };
})(window);
