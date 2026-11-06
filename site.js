// 各頁共用：手機選單、捲動揭露、回到頂部
(() => {
    'use strict';

    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

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
