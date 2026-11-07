const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

// 置頂區：背景固定，文字依捲動進度從歡迎詞交叉淡出成自我介紹
const pinSection = document.getElementById('pinSection');
const pinInner = pinSection.querySelector('.pin-inner');
const textHello = document.getElementById('textHello');
const textName = document.getElementById('textName');
const scrollHint = document.getElementById('scrollHint');
let pinTicking = false;

function updatePinText() {
    const rect = pinSection.getBoundingClientRect();
    const scrollRange = pinSection.offsetHeight - pinInner.offsetHeight;
    const progress = Math.min(Math.max(-rect.top / scrollRange, 0), 1);
    const shift = reduced.matches ? 0 : 40;

    const helloOpacity = 1 - Math.min(progress / 0.45, 1);
    const nameOpacity = Math.max((progress - 0.55) / 0.45, 0);

    textHello.style.opacity = helloOpacity;
    textHello.style.transform = `translate(-50%, calc(-50% - ${progress * shift}px))`;
    textName.style.opacity = nameOpacity;
    textName.style.transform = `translate(-50%, calc(-50% + ${(1 - nameOpacity) * shift}px))`;
    scrollHint.style.opacity = helloOpacity;

    pinTicking = false;
}

function onPinScroll() {
    if (!pinTicking) {
        requestAnimationFrame(updatePinText);
        pinTicking = true;
    }
}

window.addEventListener('scroll', onPinScroll, { passive: true });
window.addEventListener('resize', updatePinText);
updatePinText();

// Hello 輪流換成各國語言：舊字往上淡出，新字從下方浮上來（只動 transform 與 opacity）
// 想增減語言，改下面這份清單就好：[文字, 語言代碼]
const HELLOS = [
    ['Hello', 'en'], ['你好', 'zh-TW'], ['こんにちは', 'ja'], ['안녕하세요', 'ko'],
    ['Bonjour', 'fr'], ['Hola', 'es'], ['Hallo', 'de'], ['Ciao', 'it'],
    ['Olá', 'pt'], ['Привет', 'ru'], ['مرحبًا', 'ar'], ['नमस्ते', 'hi'],
    ['สวัสดี', 'th'], ['Xin chào', 'vi'], ['Merhaba', 'tr'], ['Γεια σου', 'el'],
    ['שלום', 'he'], ['Aloha', 'haw'], ['Halo', 'id']
];
const HELLO_INTERVAL = 4500;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const helloWord = document.getElementById('helloWord');
let helloIndex = 0;
let helloBusy = false;
let heroVisible = true;

// ---- 手寫動畫 ----
// 每個字預先轉成一張透明圖（fonts/hello-words/N.png），筆畫的中線座標存在 fonts/hello-strokes.json。
// 用 canvas 畫：先把「已寫到的筆畫」畫成遮罩，再用遮罩去裁字的圖片，所以字是一筆一畫顯現的。
// 不依賴瀏覽器的字型排版、也不用 SVG 遮罩，各平台結果一致。圖片或資料載入失敗時，退回淡入淡出。
const WRITE_SPEED = 1.5;   // 筆速（座標單位／毫秒）
const WRITE_MAX = 2200;    // 一個字最久寫多久（毫秒）
const PEN_GAP = 40;        // 換筆停頓（毫秒）
let strokeData = null;
const wordImgs = [];

function getImg(i) {
    if (!wordImgs[i]) {
        wordImgs[i] = new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => { wordImgs[i] = null; reject(new Error('hello img')); };
            im.src = `fonts/hello-words/${i}.png?v=20261107p`;
        });
    }
    return wordImgs[i];
}

let redrawHello = null;   // 目前畫面上那個字的重畫函式（換深淺色時要用）

// 建立某個字的 canvas，回傳 { canvas, play }；play(instant) 會跑一遍書寫動畫並回傳 Promise
function buildHello(i, img) {
    const wd = strokeData.words[i];
    const [y0, y1] = strokeData.y;
    const [x0, x1] = wd.x;
    const vw = x1 - x0, vh = y1 - y0;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssH = parseFloat(getComputedStyle(document.documentElement).fontSize) * 6.5;
    const H = Math.round(cssH * dpr), W = Math.round(H * vw / vh);
    const sc = W / vw;

    const canvas = document.createElement('canvas');
    canvas.className = 'hello-svg';
    canvas.width = W; canvas.height = H;
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    const mask = document.createElement('canvas');
    mask.width = W; mask.height = H;
    const mctx = mask.getContext('2d');

    const items = wd.p.map((p) => (typeof p[0] === 'number'
        ? { dot: true, x: p[0], y: p[1], w: p[2], k: 0 }
        : { path: new Path2D(p[0]), w: p[1], len: p[2], k: 0 }));

    // all：整個字淡入補滿的程度（0～1），收尾時用來補上骨架沒描到的細節
    function draw(all) {
        mctx.setTransform(1, 0, 0, 1, 0, 0);
        mctx.globalAlpha = 1;
        mctx.clearRect(0, 0, W, H);
        mctx.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc);
        mctx.strokeStyle = '#fff'; mctx.fillStyle = '#fff';
        mctx.lineCap = 'round'; mctx.lineJoin = 'round';
        for (const it of items) {
            if (it.k <= 0) continue;
            if (it.dot) {
                mctx.globalAlpha = it.k;
                mctx.beginPath(); mctx.arc(it.x, it.y, it.w / 2, 0, Math.PI * 2); mctx.fill();
                mctx.globalAlpha = 1;
            } else {
                mctx.lineWidth = it.w;
                mctx.setLineDash([Math.max(it.len * it.k, 0.01), it.len * 4]);
                mctx.stroke(it.path);
            }
        }
        mctx.setLineDash([]);
        if (all > 0) {
            mctx.setTransform(1, 0, 0, 1, 0, 0);
            mctx.globalAlpha = all;
            mctx.fillRect(0, 0, W, H);
            mctx.globalAlpha = 1;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(img, 0, 0, W, H);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = getComputedStyle(helloWord).color;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
    }

    let finished = false;
    const finish = () => { finished = true; items.forEach((it) => { it.k = 1; }); draw(1); };
    redrawHello = () => { if (canvas.isConnected && finished) draw(1); };

    function play(instant) {
        if (instant) { finish(); return Promise.resolve(); }
        const total = items.reduce((n, it) => n + (it.dot ? 0 : it.len), 0);
        const speed = Math.max(WRITE_SPEED, total / WRITE_MAX);
        let time = 0;
        for (const it of items) {
            it.t = time;
            it.dur = it.dot ? 90 : Math.max(it.len / speed, 90);
            time += it.dur + PEN_GAP;
        }
        const fadeAt = time, end = time + 260;
        draw(0);
        return new Promise((resolve) => {
            const t0 = performance.now();
            // 保險：就算 rAF 被節流，時間到了也一定把完整的字畫出來
            const guard = setTimeout(() => { if (canvas.isConnected) finish(); resolve(); }, end + 400);
            const frame = (now) => {
                if (!canvas.isConnected) { clearTimeout(guard); return resolve(); }   // 已被下一個字換掉
                const e = now - t0;
                for (const it of items) it.k = Math.min(Math.max((e - it.t) / it.dur, 0), 1);
                if (e < end) {
                    draw(Math.min(Math.max((e - fadeAt) / 260, 0), 1));
                    requestAnimationFrame(frame);
                } else {
                    clearTimeout(guard); finish(); resolve();
                }
            };
            requestAnimationFrame(frame);
        });
    }
    return { canvas, play };
}

async function showHello(i, instant) {
    helloWord.getAnimations().forEach((a) => a.cancel());
    const [text, lang] = HELLOS[i];
    let built = null;
    if (strokeData) {
        try { built = buildHello(i, await getImg(i)); } catch (err) { built = null; }
    }
    if (!built) {
        // 退回方案：直接換字、淡入
        redrawHello = null;
        helloWord.textContent = text;
        helloWord.lang = lang;
        helloWord.dir = (lang === 'ar' || lang === 'he') ? 'rtl' : 'ltr';
        helloWord.style.visibility = 'visible';
        await helloWord.animate(
            [{ opacity: 0, transform: `translateY(${reduced.matches ? 0 : 16}px)` }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 800, easing: EASE, fill: 'forwards' }
        ).finished;
        return;
    }
    helloWord.replaceChildren(built.canvas);
    helloWord.style.visibility = 'visible';
    helloWord.style.opacity = 1;
    await built.play(instant || reduced.matches);
}

// 切換深淺色時，畫面上的字要用新的顏色重畫
new MutationObserver(() => { if (redrawHello) redrawHello(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });

async function nextHello() {
    if (helloBusy || !heroVisible || document.hidden) return;
    helloBusy = true;
    helloIndex = (helloIndex + 1) % HELLOS.length;
    const move = reduced.matches ? 0 : 16; // 減少動態時只淡入淡出

    try {
        helloWord.getAnimations().forEach((a) => a.cancel());
        await helloWord.animate(
            [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: `translateY(${-move}px)` }],
            { duration: 500, easing: EASE, fill: 'forwards' }
        ).finished;
        helloWord.getAnimations().forEach((a) => a.cancel());
        helloWord.style.opacity = 0;
        await showHello(helloIndex, false);
    } catch (err) {
        // 動畫被取消時直接略過
    }
    helloBusy = false;
}

// 先把筆畫資料和第一張字圖備好，再開始寫第一個 Hello；任何一步失敗就退回舊做法
(async () => {
    const giveUp = setTimeout(() => { helloWord.style.visibility = 'visible'; }, 3000);
    try {
        const res = await fetch('fonts/hello-strokes.json?v=20261107p');
        if (!res.ok) throw new Error('hello data');
        const data = await res.json();
        if (data.words.length !== HELLOS.length) throw new Error('hello data');
        strokeData = data;
        await getImg(0);
        clearTimeout(giveUp);
        helloBusy = true;
        helloWord.style.opacity = 1;
        await showHello(0, reduced.matches);
        helloBusy = false;
        HELLOS.forEach((_, i) => { getImg(i).catch(() => {}); });   // 其餘字圖背景預載
    } catch (err) {
        clearTimeout(giveUp);
        strokeData = null;
        helloWord.style.visibility = 'visible';
        helloBusy = false;
    }
})();

// 只在首屏看得到時才輪播，離開後暫停
new IntersectionObserver((entries) => {
    heroVisible = entries[0].isIntersecting;
}).observe(pinSection);

setInterval(nextHello, HELLO_INTERVAL);

// 簡歷手風琴：點一張展開，其餘收回（至少保持一張打開）
// 版面變化用 FLIP：先記下舊位置，再用 transform 滑到新位置，不去動高度
const accCards = [...document.querySelectorAll('.acc-card')];

function openCard(target) {
    if (target.classList.contains('is-open')) return;

    const animate = !reduced.matches;
    const firstTops = animate ? accCards.map((c) => c.getBoundingClientRect().top) : [];

    accCards.forEach((card) => {
        const on = card === target;
        card.classList.toggle('is-open', on);
        card.querySelector('.acc-header').setAttribute('aria-expanded', String(on));
        card.querySelector('.acc-panel').hidden = !on;
    });

    target.classList.add('is-entering');
    target.addEventListener('animationend', () => target.classList.remove('is-entering'), { once: true });

    if (!animate) return;

    accCards.forEach((card, i) => {
        const dy = firstTops[i] - card.getBoundingClientRect().top;
        if (!dy) return;

        card.style.transition = 'none';
        card.style.transform = `translateY(${dy}px)`;
        void card.offsetHeight; // 強制套用起點
        card.style.transition = 'transform 500ms cubic-bezier(0.22, 1, 0.36, 1)';
        card.style.transform = '';

        const cleanup = (e) => {
            if (e.target !== card || e.propertyName !== 'transform') return;
            card.style.transition = '';
            card.removeEventListener('transitionend', cleanup);
        };
        card.addEventListener('transitionend', cleanup);
    });
}

accCards.forEach((card) => {
    card.querySelector('.acc-header').addEventListener('click', () => openCard(card));
});
