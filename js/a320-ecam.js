// ECAM 精簡版（警告區 + 系統頁）和冷艙啟動流程表。
(function (root) {
    'use strict';

    const A = root.A320;
    const el = A.ui.el;
    const ecam = A.ecam = {};

    const PAGES = ['ENG', 'APU', 'BLEED', 'ELEC', 'HYD', 'FUEL'];
    let page = 'ENG';
    let hosts = null;
    let btns = {};
    let lastSd = '', lastEwd = '', lastList = '';
    const prev = { e0: 'off', e1: 'off', apu: 'off' };

    const S = () => A.sys.state;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const bar = (v, max, c) => `<span class="ec-bar"><span class="${c || 'g'}" style="transform:scaleX(${clamp(v / max, 0, 1).toFixed(3)})"></span></span>`;
    const row = (label, val, unit, c) => `<div class="ec-row"><span class="ec-l">${label}</span><b class="${c || 'g'}">${val}</b><i>${unit || ''}</i></div>`;
    const lamp = (text, c) => `<span class="ec-lamp ${c}">${text}</span>`;

    // ---------- 警告區 ----------
    function ewdLines() {
        const s = S();
        const f = A.fcu && A.fcu.state;
        const L = [];
        const inAir = f && f.phase === 'AIR';
        if (A.fault) A.fault.ewd().forEach((x) => L.push(x));
        if (f && f.apOffWarn) L.push({ t: 'AUTO FLT AP OFF', c: 'a' });
        if (!s.pb.fac1 && !s.pb.fac2) L.push({ t: 'AUTO FLT FAC 1+2 FAULT', c: 'a' });
        if (!s.buses.ac1 && !s.buses.ac2 && (inAir || A.sys.enginesRunning() > 0)) L.push({ t: 'ELEC AC BUS 1+2 FAULT', c: 'a' });
        if (s.buses.batOnly && (s.bat[0] < 20 || s.bat[1] < 20)) L.push({ t: 'ELEC BAT LOW', c: 'a' });
        if (s.eng[0].s === 'run' && s.eng[1].s === 'run') {
            if (s.hyd.g < 1500) L.push({ t: 'HYD G SYS LO PR', c: 'a' });
            if (s.hyd.b < 1500) L.push({ t: 'HYD B SYS LO PR', c: 'a' });
            if (s.hyd.y < 1500) L.push({ t: 'HYD Y SYS LO PR', c: 'a' });
        }
        [0, 1].forEach((i) => {
            if (s.eng[i].s === 'run' && !A.sys.pumpsOK(i)) L.push({ t: `FUEL ${i ? 'R' : 'L'} TK PUMPS LO PR`, c: 'a' });
        });
        if (L.length) L.push({ t: '', c: '' });
        // 備忘區
        const aligning = s.ir.map((r, i) => ({ r, m: s.sel['ir' + (i + 1)] })).filter((x) => x.m === 'NAV' && x.r.p < 1);
        if (aligning.length) {
            const left = Math.ceil((1 - Math.min(...aligning.map((x) => x.r.p))) * 25);
            L.push({ t: `IRS IN ALIGN ${left} S`, c: 'g' });
        }
        if (s.pb.ext && A.sys.extAvailNow()) L.push({ t: 'EXT PWR', c: 'g' });
        if (s.apu.s === 'run') L.push({ t: s.pb.apubleed ? 'APU AVAIL  APU BLEED' : 'APU AVAIL', c: 'g' });
        if (s.sel.seat === 'ON') L.push({ t: 'SEAT BELTS', c: 'g' });
        if (s.sel.nosmk === 'ON') L.push({ t: 'NO SMOKING', c: 'g' });
        if (s.pb.eai1 || s.pb.eai2) L.push({ t: 'ENG A.ICE', c: 'g' });
        if (s.pb.wai) L.push({ t: 'WING A.ICE', c: 'g' });
        if (inAir && s.sel.strobe === 'OFF') L.push({ t: 'STROBE LT OFF', c: 'g' });
        if (f && f.gearDown) L.push({ t: 'LDG GEAR DN', c: 'g' });
        if (!L.length) L.push({ t: '', c: '' });
        return L;
    }

    // ---------- 系統頁 ----------
    function sdHtml() {
        const s = S();
        if (!s.buses.dcbat) return '<p class="ec-off">ECAM 沒有電。先到頂板打開 BAT 1 和 BAT 2。</p>';
        const ac = (v) => (v ? 'g' : 'a');
        if (page === 'ENG') {
            return '<div class="ec-eng">' + [0, 1].map((i) => {
                const e = s.eng[i];
                const st = e.s === 'start' ? lamp('START', 'w') : e.s === 'run' ? lamp('AVAIL', 'g') : e.s === 'down' ? lamp('SHUTDOWN', 'a') : lamp('OFF', 'w');
                return `<div class="ec-col"><h4>ENG ${i + 1} ${st}</h4>` +
                    row('N1', e.n1.toFixed(1), '%') + bar(e.n1, 100) +
                    row('EGT', Math.round(e.egt), '°C', e.egt > 700 ? 'a' : 'g') + bar(e.egt, 900) +
                    row('N2', e.n2.toFixed(1), '%') + bar(e.n2, 100) +
                    row('FF', Math.round(e.ff), 'KG/H') + '</div>';
            }).join('') + '</div>';
        }
        if (page === 'APU') {
            const a = s.apu;
            const st = a.s === 'run' ? lamp('AVAIL', 'g') : a.s === 'start' ? lamp('STARTING', 'w') : a.s === 'down' ? lamp('SHUTDOWN', 'a') : lamp('OFF', 'w');
            return `<div class="ec-one"><h4>APU ${st}</h4>` +
                row('N', Math.round(a.n), '%') + bar(a.n, 100) +
                row('EGT', Math.round(a.egt), '°C') + bar(a.egt, 700) +
                row('GEN', a.s === 'run' && s.pb.apugen ? 'ON' : 'OFF', '', a.s === 'run' && s.pb.apugen ? 'g' : 'w') +
                row('BLEED', a.s === 'run' && s.pb.apubleed ? '35' : '0', 'PSI', a.s === 'run' && s.pb.apubleed ? 'g' : 'w') + '</div>';
        }
        if (page === 'BLEED') {
            const pk = (n) => (s.pb['pack' + n] && s.air[n === 1 ? 'L' : 'R'] >= 15 && A.sys.anyAC() ? lamp(`PACK ${n} OK`, 'g') : lamp(`PACK ${n} 無流量`, s.pb['pack' + n] ? 'a' : 'w'));
            return '<div class="ec-eng"><div class="ec-col"><h4>左側</h4>' + row('引氣壓力', Math.round(s.air.L), 'PSI', s.air.L >= 15 ? 'g' : 'w') + bar(s.air.L, 50) + pk(1) + '</div>' +
                '<div class="ec-col"><h4>右側</h4>' + row('引氣壓力', Math.round(s.air.R), 'PSI', s.air.R >= 15 ? 'g' : 'w') + bar(s.air.R, 50) + pk(2) + '</div></div>' +
                `<p class="ec-note">X BLEED：${s.sel.xbleed}　APU BLEED：${s.pb.apubleed ? 'ON' : 'OFF'}</p>`;
        }
        if (page === 'ELEC') {
            const b = s.buses;
            const src = b.src ? { GEN: '發電機', EXT: '地面電源', APU: 'APU 發電機' }[b.src] : b.batOnly ? '僅電池' : '無';
            return '<div class="ec-grid">' +
                `<div class="ec-card ${ac(b.ac1)}">AC BUS 1<b>${b.ac1 ? '115 V' : '無電'}</b></div>` +
                `<div class="ec-card ${ac(b.ac2)}">AC BUS 2<b>${b.ac2 ? '115 V' : '無電'}</b></div>` +
                `<div class="ec-card ${ac(b.dc1)}">DC 1<b>${b.dc1 ? '28 V' : '無電'}</b></div>` +
                `<div class="ec-card ${ac(b.dc2)}">DC 2<b>${b.dc2 ? '28 V' : '無電'}</b></div>` +
                `<div class="ec-card ${s.pb.bat1 ? (s.bat[0] < 20 ? 'a' : 'g') : 'w'}">BAT 1<b>${s.pb.bat1 ? Math.round(s.bat[0]) + '%' : 'OFF'}</b></div>` +
                `<div class="ec-card ${s.pb.bat2 ? (s.bat[1] < 20 ? 'a' : 'g') : 'w'}">BAT 2<b>${s.pb.bat2 ? Math.round(s.bat[1]) + '%' : 'OFF'}</b></div>` +
                '</div>' + `<p class="ec-note">電源：${src}　DC ESS：${b.dcess ? '有電' : '無電'}</p>`;
        }
        if (page === 'HYD') {
            const h = s.hyd;
            const c = (v) => (v >= 2000 ? 'g' : v > 200 ? 'a' : 'w');
            return '<div class="ec-eng3">' + [['GREEN', h.g], ['BLUE', h.b], ['YELLOW', h.y]].map(([n, v]) =>
                `<div class="ec-col"><h4>${n}</h4>${row('', Math.round(v / 10) * 10, 'PSI', c(v))}${bar(v, 3500, c(v))}</div>`).join('') + '</div>' +
                `<p class="ec-note">PTU：${s.pb.ptu ? 'AUTO' : 'OFF'}</p>`;
        }
        // FUEL
        const f = s.fuel;
        const total = f.L + f.C + f.R;
        const pump = (ids) => ids.map((id) => `<span class="ec-pump ${s.pb[id] && A.sys.anyAC() ? 'g' : 'w'}"></span>`).join('');
        return '<div class="ec-eng3">' +
            `<div class="ec-col"><h4>左</h4>${row('', Math.round(f.L), 'KG')}${bar(f.L, 6900)}<div class="ec-pumps">${pump(['fL1', 'fL2'])}</div></div>` +
            `<div class="ec-col"><h4>中央</h4>${row('', Math.round(f.C), 'KG', f.C > 0 ? 'g' : 'w')}${bar(f.C, 6200)}<div class="ec-pumps">${pump(['fC1', 'fC2'])}</div></div>` +
            `<div class="ec-col"><h4>右</h4>${row('', Math.round(f.R), 'KG')}${bar(f.R, 6900)}<div class="ec-pumps">${pump(['fR1', 'fR2'])}</div></div>` +
            `</div><p class="ec-note">合計 ${Math.round(total)} KG　X FEED：${s.pb.xfeed ? 'OPEN' : 'SHUT'}</p>`;
    }

    // ---------- 冷艙啟動流程 ----------
    const STEPS = [
        ['電池：BAT 1、BAT 2 按下（ON）', (s) => s.pb.bat1 && s.pb.bat2, '頂板 ELEC'],
        ['接上地面電源：EXT PWR 按下', (s) => s.buses.ac1 && s.buses.ac2, '頂板 ELEC'],
        ['ADIRS：IR 1、2、3 撥到 NAV，等 ALIGN 燈熄滅', (s) => A.sys.navAligned() === 3, '頂板 ADIRS'],
        ['燃油泵：六個全部打開（OFF 燈熄滅）', (s) => ['fL1', 'fL2', 'fC1', 'fC2', 'fR1', 'fR2'].every((k) => s.pb[k]), '頂板 FUEL'],
        ['APU：MASTER SW 按下，再按 START，等 AVAIL', (s) => s.apu.s === 'run' || s.eng.every((e) => e.s === 'run'), '頂板 APU'],
        ['APU BLEED 按下（供發動機啟動用的引氣）', (s) => s.pb.apubleed || s.eng.every((e) => e.s === 'run'), '頂板 AIR COND'],
        ['BEACON 開、SEAT BELTS 撥到 ON', (s) => s.sel.beacon === 'ON' && s.sel.seat === 'ON' || s.sel.seat === 'AUTO' && s.sel.beacon === 'ON', '頂板 EXT LT／SIGNS'],
        ['ENG MODE 撥到 IGN/START，MASTER 2 撥到 ON，等到 AVAIL', (s) => s.eng[1].s === 'run', '頂板 ENGINE'],
        ['MASTER 1 撥到 ON，等到 AVAIL', (s) => s.eng[0].s === 'run', '頂板 ENGINE'],
        ['ENG MODE 回 NORM，關掉 APU MASTER SW 和 APU BLEED', (s) => s.sel.mode === 'NORM' && !s.pb.apubleed && !s.pb.apumaster, '頂板 ENGINE／APU'],
        ['確認 GEN 1、GEN 2、ENG 1/2 BLEED、PACK 1/2 都在正常位置', (s) => s.pb.gen1 && s.pb.gen2 && s.pb.bleed1 && s.pb.bleed2 && s.pb.pack1 && s.pb.pack2 && s.buses.src === 'GEN', '頂板'],
        ['切到 FCU 頁，設定 SPD／HDG／ALT，按「起飛」', () => A.fcu && A.fcu.state.phase !== 'GND', 'FCU']
    ];

    function listHtml() {
        const s = S();
        const done = STEPS.map((x) => !!x[1](s));
        // 往前的步驟被後面的完成（例如發動機已經跑了）也算完成
        let last = -1;
        done.forEach((d, i) => { if (d) last = i; });
        let next = -1;
        for (let i = 0; i < STEPS.length; i++) { if (!done[i]) { next = i; break; } }
        let html = '';
        STEPS.forEach((x, i) => {
            const cls = done[i] ? 'done' : i === next ? 'next' : '';
            html += `<li class="${cls}"${i === next ? ' aria-current="step"' : ''}><span class="ck-mark" aria-hidden="true"></span><span class="ck-step-t">${x[0]}</span><span class="ck-step-w caption-5">${x[2]}</span></li>`;
        });
        void last;
        return html;
    }

    // ---------- 建立和更新 ----------
    ecam.build = function (h) {
        hosts = h;
        h.pages.textContent = '';
        PAGES.forEach((p) => {
            const b = el('button', 'ec-btn', p);
            b.type = 'button';
            b.addEventListener('click', () => { page = p; ecam.render(true); });
            h.pages.append(b);
            btns[p] = b;
        });
        const clr = el('button', 'ec-btn ec-clr', 'CLR');
        clr.type = 'button';
        clr.setAttribute('aria-label', '清除警告訊息');
        clr.addEventListener('click', () => { if (A.fcu) A.fcu.state.apOffWarn = false; ecam.render(true); });
        h.pages.append(clr);
    };

    ecam.setPage = (p) => { if (PAGES.includes(p)) { page = p; ecam.render(true); } };

    ecam.render = function (force) {
        if (!hosts || !S()) return;
        const s = S();
        // 自動換頁：有新的啟動動作就切過去
        if (s.eng[0].s === 'start' && prev.e0 !== 'start') page = 'ENG';
        if (s.eng[1].s === 'start' && prev.e1 !== 'start') page = 'ENG';
        if (s.apu.s === 'start' && prev.apu !== 'start') page = 'APU';
        prev.e0 = s.eng[0].s; prev.e1 = s.eng[1].s; prev.apu = s.apu.s;
        for (const p in btns) { btns[p].classList.toggle('on', p === page); btns[p].setAttribute('aria-pressed', String(p === page)); }

        const sd = sdHtml();
        if (force || sd !== lastSd) { hosts.sd.innerHTML = sd; lastSd = sd; }
        if (s.buses.dcbat) {
            const lines = ewdLines();
            const eh = `<p class="ec-fob">FOB ${Math.round(s.fuel.L + s.fuel.C + s.fuel.R)} KG</p>` + lines.map((l) => `<p class="ec-line ${l.c}">${l.t || '&nbsp;'}</p>`).join('');
            if (force || eh !== lastEwd) { hosts.ewd.innerHTML = eh; lastEwd = eh; }
        } else if (lastEwd !== 'off') { hosts.ewd.innerHTML = ''; lastEwd = 'off'; }
        const li = listHtml();
        if (force || li !== lastList) { hosts.list.innerHTML = li; lastList = li; }
    };
})(window);
