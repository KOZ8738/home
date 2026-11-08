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
        ils: '進場：高度 3000 呎、航向 060，在跑道 09 進場。按 LOC 和 APPR，讓飛機自己截獲航向台和下滑道。',
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
        }
        root.requestAnimationFrame(frame);
    }

    function setupTabs() {
        const tabs = [$('tabFcu'), $('tabOh')];
        const panes = [$('paneFcu'), $('paneOh')];
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
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show((i + 1) % 2, true); }
            });
        });
        let saved = null;
        try { saved = localStorage.getItem('a320-tab'); } catch (e) { saved = null; }
        const params = new URLSearchParams(location.search);
        if (params.get('tab') === 'oh') show(1);
        else if (saved === '1') show(1);
        return show;
    }

    function init() {
        A.sys.build($('overhead'));
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

        root.requestAnimationFrame(frame);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // 方便除錯和自動測試
    A.testing = { apply: applyScenario, setSpeed: (v) => { speed = v; }, get speed() { return speed; } };
})(window);
