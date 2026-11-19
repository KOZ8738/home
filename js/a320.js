// A320 頁入口：分頁、情境、模擬速度、主迴圈。
(function (root) {
    'use strict';

    const A = root.A320;
    const $ = (id) => document.getElementById(id);

    let speed = 1;
    let scenario = 'cruise';
    let last = 0;
    let slowAcc = 0;

    const INTRO = {
        cruise: '巡航：FL350、M.78，AP1 和 A/THR 已接上，沿航線飛。試試把 ALT 轉到 10000，再拉出旋鈕。',
        ils: '進場：離地約 3000 呎，正從側面切入最後進場航道。按 APPR（ILS 會同時武裝 LOC 和 G/S），讓飛機自己截獲。右邊可以換跑道、天氣、風和故障。',
        cold: '冷艙：電池關閉，所有燈都是暗的。照下方的流程表一步一步開，到「頂板」分頁操作。'
    };

    function applyScenario(name, quiet) {
        scenario = name;
        A.sys.apply(name);
        A.fcu.apply(name);
        A.sys.step(0.02);
        A.sys.refresh();
        A.ecam.render(true);
        A.fcu.renderSlow();
        if (A.snd) A.snd.reset();
        A.fault.reset();
        if (!quiet) A.toast(INTRO[name]);
    }

    function frame(ts) {
        const dt = Math.min(0.1, (ts - last) / 1000 || 0);
        last = ts;
        const sim = dt * speed;
        if (sim > 0) {
            const n = Math.max(1, Math.ceil(sim / 0.05));
            const h = sim / n;
            for (let i = 0; i < n; i++) { A.sys.step(h); A.fcu.step(h); }
        }
        A.fcu.renderFast();
        slowAcc += dt;
        if (slowAcc >= 0.1) {
            slowAcc = 0;
            A.sys.refresh();
            A.fcu.renderSlow();
            A.ecam.render();
            if (A.snd) A.snd.update(A.sys.state, A.fcu.state);
            A.fault.tick();
        }
        root.requestAnimationFrame(frame);
    }

    function setupTabs() {
        const ids = ['Fcu', 'Oh', 'Flt'];
        const tabs = ids.map((n) => $('tab' + n));
        const panes = ids.map((n) => $('pane' + n));
        const show = (i, focus) => {
            tabs.forEach((t, j) => {
                t.setAttribute('aria-selected', String(i === j));
                t.tabIndex = i === j ? 0 : -1;
                panes[j].hidden = i !== j;
            });
            if (focus) tabs[i].focus();
            try { localStorage.setItem('a320-tab', String(i)); } catch (e) { /* 無痕模式等情況，忽略 */ }
        };
        tabs.forEach((t, i) => {
            t.addEventListener('click', () => show(i));
            t.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowRight') { e.preventDefault(); show((i + 1) % tabs.length, true); }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); show((i + tabs.length - 1) % tabs.length, true); }
            });
        });
        let saved = null;
        try { saved = localStorage.getItem('a320-tab'); } catch (e) { saved = null; }
        const params = new URLSearchParams(location.search);
        const want = params.get('tab');
        if (want === 'oh') show(1);
        else if (want === 'flt') show(2);
        else if (saved === '1') show(1);
        else if (saved === '2') show(2);
        return show;
    }

    function init() {
        A.sys.build($('overhead'));
        A.fault.build($('faults'));
        A.ecam.build({ pages: $('ecamPages'), sd: $('sd'), ewd: $('ewd'), list: $('steps') });
        A.fcu.build({
            fcu: $('fcu'), fma: $('fma'), pfd: $('pfd'), map: $('ckMap'),
            help: $('modeHelp'), readout: $('readout'), zoomIn: $('mapIn'), zoomOut: $('mapOut')
        });
        setupTabs();

        const params = new URLSearchParams(location.search);
        const wanted = params.get('s');
        const start = ['cruise', 'ils', 'cold'].includes(wanted) ? wanted : 'cruise';
        const radio = document.querySelector(`input[name="scn"][value="${start}"]`);
        if (radio) radio.checked = true;
        applyScenario(start, true);

        document.querySelectorAll('input[name="scn"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) applyScenario(r.value); }));
        document.querySelectorAll('input[name="spd"]').forEach((r) => r.addEventListener('change', () => {
            if (r.checked) { speed = Number(r.value); A.toast(`模擬速度 ${speed}×`); }
        }));
        $('ckReset').addEventListener('click', () => applyScenario(scenario));
        $('btnTo').addEventListener('click', () => A.fcu.takeoff());
        $('btnGa').addEventListener('click', () => A.fcu.goAround());
        setupApproach();

        setupSound();
        root.requestAnimationFrame(frame);
    }

    // 進場設定：跑道、進場方式、天氣、風、ILS 故障
    function setupApproach() {
        const fcu = A.fcu;
        const cfg = fcu.cfg;
        const rw = $('apRwy'), wx = $('apWx');
        fcu.RUNWAYS.forEach((r) => rw.append(new Option(`${r.name}（航向 ${String(r.hdg).padStart(3, '0')}，標高 ${r.elev} 呎）`, r.id)));
        Object.keys(fcu.WX).forEach((k) => wx.append(new Option(fcu.WX[k].name, k)));
        rw.value = cfg.rwy;
        wx.value = cfg.wx;
        const windTxt = () => {
            const c = fcu.windComp();
            const t = cfg.windSpd > 0
                ? `對這條跑道：${c.head >= 0 ? '逆風' : '順風'} ${Math.abs(c.head)} 節，${c.cross ? `${c.from}側風 ${c.cross} 節` : '沒有側風'}。自動降落上限：側風 20、順風 10、逆風 30 節。`
                : '無風。';
            $('apWindTxt').textContent = t;
        };
        rw.addEventListener('change', () => { cfg.rwy = rw.value; applyScenario(scenario); windTxt(); });
        wx.addEventListener('change', () => { fcu.setCfg('wx', wx.value); A.toast('天氣：' + fcu.WX[wx.value].name + '。'); });
        document.querySelectorAll('input[name="apType"]').forEach((r) => r.addEventListener('change', () => {
            if (!r.checked) return;
            fcu.setCfg('type', r.value);
            A.toast(r.value === 'rnav' ? 'RNAV（GPS）進場：按 APPR，截獲 APP NAV 和 FINAL。不能自動降落，最低高度 350 呎。' : 'ILS 進場：按 APPR，截獲 LOC 和 G/S，可以自動降落。');
        }));
        const num = (id, key, lo, hi) => {
            const inp = $(id);
            inp.addEventListener('change', () => {
                let v = Math.round(Number(inp.value) || 0);
                v = key === 'windDir' ? ((v % 360) + 360) % 360 : Math.max(lo, Math.min(hi, v));
                inp.value = String(v);
                fcu.setCfg(key, v);
                windTxt();
            });
        };
        num('apWdir', 'windDir', 0, 360);
        num('apWspd', 'windSpd', 0, 60);
        num('apGust', 'gust', 0, 25);
        $('apFail').addEventListener('change', (e) => fcu.setCfg('ilsFail', e.target.value));
        windTxt();
    }

    function setupSound() {
        const S = A.snd;
        const row = $('sndRow');
        if (!S || !row) return;
        if (!S.supported) { row.closest('fieldset').hidden = true; return; }
        const vol = $('sndVol');
        vol.value = String(Math.round(S.getVolume() * 100));
        const radio = document.querySelector(`input[name="snd"][value="${S.isOn() ? 'on' : 'off'}"]`);
        if (radio) radio.checked = true;
        document.querySelectorAll('input[name="snd"]').forEach((r) => r.addEventListener('change', () => {
            if (r.checked) { S.setEnabled(r.value === 'on'); A.toast(r.value === 'on' ? '聲音開啟。' : '聲音關閉。'); }
        }));
        vol.addEventListener('input', () => {
            S.setVolume(Number(vol.value) / 100);
            if (!S.isOn()) { S.setEnabled(true); const on = document.querySelector('input[name="snd"][value="on"]'); if (on) on.checked = true; }
        });
        vol.addEventListener('change', () => { if (S.click) S.click(); });
        S.init();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // 方便除錯和自動測試
    A.testing = { apply: applyScenario, setSpeed: (v) => { speed = v; }, get speed() { return speed; } };
})(window);
