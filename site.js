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

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const next = currentTheme() === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            try { localStorage.setItem('theme', next); } catch (e) { /* 無痕模式等情況就不記住 */ }
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

    // ---------- 上橫幅的 UTC 時鐘 ----------
    const clocks = document.querySelectorAll('[data-utc-clock]');
    if (clocks.length) {
        const pad = (n) => String(n).padStart(2, '0');
        const tick = () => {
            const d = new Date();
            const text = `UTC ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
            clocks.forEach((el) => {
                el.textContent = text;
                el.setAttribute('datetime', d.toISOString());
            });
        };
        tick();
        setInterval(tick, 1000);
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
