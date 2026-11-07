// 各頁共用：淺色／深色模式、手機選單、捲動揭露、回到頂部
(() => {
    'use strict';

    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    // ---------- 淺色／深色模式 ----------
    // 沒手動選過就跟著系統；手動選過就記在這個瀏覽器
    const themeBtn = document.querySelector('.theme-toggle');
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const readStored = () => {
        try {
            const v = localStorage.getItem('theme');
            return v === 'light' || v === 'dark' ? v : null;
        } catch (e) { return null; }
    };
    const applyTheme = (theme) => {
        root.setAttribute('data-theme', theme);
        if (themeBtn) {
            themeBtn.setAttribute('aria-label', theme === 'dark' ? '切換成淺色模式' : '切換成深色模式');
        }
        document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    };
    const currentTheme = () => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

    applyTheme(readStored() || (dark.matches ? 'dark' : 'light'));

    // ---------- 彩蛋：連閃模式／燈泡壞掉 ----------
    // 3 秒內連按切換鈕 8 次，會隨機觸發其中一個（一次只會有一個）：
    //   連閃模式：黑白快速交替；燈泡壞掉：閃兩下之後整頁變黑，點一下換新燈泡。
    // 3 秒內連按切換鈕 8 次就會觸發；每秒最多閃 3 次（WCAG 的上限，不要再調快），
    // 約 12 秒後自動結束，點任意處或按任意鍵可立刻停止。
    // 系統設定為「減少動態效果」時不會觸發。
    const STROBE_BURST = 8;          // 要連按幾次
    const STROBE_WINDOW = 3000;      // 在多少毫秒內
    const STROBE_STEP = 180;         // 每隔多久換一次（每秒約 2.8 次閃，不超過 3 次上限）
    const STROBE_STEPS = 66;         // 共換幾次（約 12 秒）
    const presses = [];
    let strobe = null;

    const stopStrobe = () => {
        if (!strobe) return;
        clearInterval(strobe.timer);
        document.removeEventListener('click', strobe.onClick, true);
        document.removeEventListener('keydown', strobe.onKey, true);
        document.removeEventListener('visibilitychange', strobe.onHide);
        strobe.toast.classList.remove('show');
        const toast = strobe.toast;
        setTimeout(() => toast.remove(), 400);
        applyTheme(strobe.origin);
        strobe = null;
        presses.length = 0;
    };

    const startStrobe = () => {
        const toast = document.createElement('div');
        toast.className = 'strobe-toast';
        toast.setAttribute('role', 'status');
        toast.innerHTML = '<i class="ph ph-lightning" aria-hidden="true"></i><span>連閃模式啟動，點任意處停止</span>';
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));

        let n = 0;
        const origin = currentTheme();
        strobe = {
            origin,
            toast,
            timer: setInterval(() => {
                n += 1;
                if (n > STROBE_STEPS) { stopStrobe(); return; }
                applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
            }, STROBE_STEP),
            onClick: (e) => { e.preventDefault(); e.stopPropagation(); stopStrobe(); },
            onKey: () => stopStrobe(),
            onHide: () => { if (document.hidden) stopStrobe(); }
        };
        document.addEventListener('visibilitychange', strobe.onHide);
        // 剛觸發時使用者還在狂按，晚一點才開始接受「點任意處停止」
        const s = strobe;
        setTimeout(() => {
            if (strobe !== s) return;
            document.addEventListener('click', s.onClick, true);
            document.addEventListener('keydown', s.onKey, true);
        }, 800);
    };

    // ---- 燈泡壞掉 ----
    let blackout = null;

    const stopBlackout = () => {
        if (!blackout) return;
        const b = blackout;
        blackout = null;
        b.timers.forEach(clearTimeout);
        document.removeEventListener('click', b.onClick, true);
        document.removeEventListener('keydown', b.onKey, true);
        b.el.classList.add('leaving');
        b.el.classList.remove('show');
        setTimeout(() => b.el.remove(), 400);
        presses.length = 0;
    };

    const startBlackout = () => {
        const el = document.createElement('div');
        el.className = 'blackout';
        el.setAttribute('role', 'status');
        el.innerHTML = '<i class="ph ph-lightbulb-filament" aria-hidden="true"></i>' +
            '<p class="title-1">燈泡壞掉了</p><p class="body-3">點任意處換新燈泡</p>';
        document.body.appendChild(el);

        const timers = [];
        const at = (ms, fn) => timers.push(setTimeout(fn, ms));
        const on = () => el.classList.add('show');
        const off = () => el.classList.remove('show');

        // 閃兩下再熄滅（每秒不超過 3 次閃）。減少動態效果時直接熄滅。
        if (reduced.matches) {
            at(0, on);
        } else {
            at(0, on); at(350, off); at(700, on); at(900, off); at(1250, on);
        }
        at(2000, () => el.classList.add('hint'));
        at(14000, stopBlackout);   // 沒人理它，十幾秒後自己修好

        blackout = {
            el,
            timers,
            onClick: (e) => { e.preventDefault(); e.stopPropagation(); stopBlackout(); },
            onKey: () => stopBlackout()
        };
        const b = blackout;
        at(1500, () => {
            if (blackout !== b) return;
            document.addEventListener('click', b.onClick, true);
            document.addEventListener('keydown', b.onKey, true);
        });
    };

    const startEgg = () => {
        // 減少動態效果：不閃，只留燈泡壞掉
        if (reduced.matches || Math.random() < 0.5) startBlackout();
        else startStrobe();
    };

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const next = currentTheme() === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            try { localStorage.setItem('theme', next); } catch (e) { /* 無痕模式等情況就不記住 */ }

            const now = Date.now();
            presses.push(now);
            while (presses.length && now - presses[0] > STROBE_WINDOW) presses.shift();
            if (presses.length >= STROBE_BURST && !strobe && !blackout) {
                presses.length = 0;
                startEgg();
            }
        });
    }

    dark.addEventListener('change', (e) => {
        if (!readStored()) applyTheme(e.matches ? 'dark' : 'light');
    });

    window.addEventListener('storage', (e) => {
        if (e.key === 'theme') applyTheme(readStored() || (dark.matches ? 'dark' : 'light'));
    });

    // ---------- 手機選單 ----------
    const toggle = document.querySelector('.nav-toggle');
    const panel = document.getElementById('nav-panel');

    if (toggle && panel) {
        const setMenu = (open) => {
            panel.classList.toggle('is-open', open);
            toggle.classList.toggle('is-open', open);
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
            root.classList.toggle('menu-open', open);
            if (open) {
                panel.removeAttribute('inert');
            } else {
                panel.setAttribute('inert', '');
            }
        };

        toggle.addEventListener('click', () => {
            setMenu(!panel.classList.contains('is-open'));
        });

        panel.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => setMenu(false));
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel.classList.contains('is-open')) {
                setMenu(false);
                toggle.focus();
            }
        });

        // 放大到桌機寬度時自動收起
        window.matchMedia('(min-width: 769px)').addEventListener('change', (e) => {
            if (e.matches) setMenu(false);
        });
    }

    // ---------- 捲動揭露：每個區塊只播放一次 ----------
    const revealEls = document.querySelectorAll('.reveal');

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

        revealEls.forEach((el) => observer.observe(el));
    } else {
        revealEls.forEach((el) => el.classList.add('visible'));
    }

    // ---------- 初音回到頂部 ----------
    const miku = document.getElementById('miku-btn');
    const mikuImg = document.getElementById('miku-img');

    if (miku) {
        miku.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' });

            if (!reduced.matches && mikuImg && mikuImg.animate) {
                mikuImg.animate(
                    [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-720deg)' }],
                    { duration: 800, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
                );
            }
        });
    }
})();
