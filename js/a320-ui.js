// A320 模擬頁的畫面小零件：標示燈、按鈕、旋鈕、七段顯示、提示訊息。
// 這個檔案只管「長相和操作手感」，系統邏輯在 a320-sys.js，飛行和 FCU 在 a320-fcu.js。
(function (root) {
    'use strict';

    const A = root.A320 = root.A320 || {};
    const NS = 'http://www.w3.org/2000/svg';

    // 很小的事件匯流排：系統狀態變了就通知畫面
    const handlers = {};
    A.on = (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); };
    A.emit = (name, arg) => { (handlers[name] || []).forEach((fn) => fn(arg)); };

    const el = (tag, cls, text) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    };
    const svgEl = (tag, attrs, parent) => {
        const n = document.createElementNS(NS, tag);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(n);
        return n;
    };

    // ---------- 提示訊息（螢幕閱讀器也會唸）----------
    let toastTimer = 0;
    function toast(text) {
        const box = document.getElementById('ckToast');
        if (!box) return;
        box.textContent = text;
        box.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => box.classList.remove('show'), 4200);
    }

    // ---------- 標示燈：暗的一層永遠在，亮的一層用 opacity 開關 ----------
    function ann(label, color) {
        const a = el('span', 'ck-ann');
        a.dataset.c = color || 'white';
        a.append(el('span', 'ck-ann-dim', label), el('span', 'ck-ann-lit', label));
        a.firstChild.setAttribute('aria-hidden', 'true');
        a.lastChild.setAttribute('aria-hidden', 'true');
        a.set = (on, blink) => {
            a.classList.toggle('on', !!on);
            a.classList.toggle('blink', !!on && !!blink);
        };
        return a;
    }

    // ---------- 按鈕（上面一個燈、下面一個燈）----------
    function pushButton(def, onPress) {
        const wrap = el('div', 'ck-pb');
        const btn = el('button', 'ck-pb-btn');
        btn.type = 'button';
        btn.dataset.id = def.id;
        const top = def.top ? ann(def.top[0], def.top[1]) : null;
        const bot = def.bot ? ann(def.bot[0], def.bot[1]) : null;
        btn.append(top || el('span', 'ck-ann ck-ann-none'), bot || el('span', 'ck-ann ck-ann-none'));
        btn.addEventListener('click', () => onPress(def.id));
        wrap.append(btn, el('span', 'ck-pb-label', def.label));
        return { el: wrap, btn, top, bot };
    }

    // ---------- 旋轉選擇開關（OFF / NAV / ATT 這種）----------
    function selector(def, onSet) {
        const wrap = el('div', 'ck-sel');
        const n = def.opts.length;
        const angles = n === 2 ? [-35, 35] : n === 3 ? [-50, 0, 50] : [-60, -20, 20, 60];
        const dial = el('button', 'ck-sel-dial');
        dial.type = 'button';
        dial.dataset.id = def.id;
        const s = svgEl('svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true' });
        svgEl('circle', { cx: 24, cy: 24, r: 17, class: 'ck-sel-body' }, s);
        const ptr = svgEl('g', { class: 'ck-sel-ptr' }, s);
        svgEl('rect', { x: 22.4, y: 8, width: 3.2, height: 14, rx: 1.2 }, ptr);
        dial.appendChild(s);
        const row = el('div', 'ck-sel-opts');
        const optBtns = def.opts.map((o) => {
            const b = el('button', 'ck-opt', o);
            b.type = 'button';
            b.dataset.v = o;
            b.addEventListener('click', () => onSet(def.id, o));
            row.appendChild(b);
            return b;
        });
        let value = def.opts[0];
        dial.addEventListener('click', () => onSet(def.id, def.opts[(def.opts.indexOf(value) + 1) % n]));
        wrap.append(dial, row, el('span', 'ck-pb-label', def.label));
        return {
            el: wrap, dial,
            set(v) {
                value = v;
                const i = Math.max(0, def.opts.indexOf(v));
                ptr.setAttribute('transform', `rotate(${angles[i]} 24 24)`);
                optBtns.forEach((b) => { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-pressed', String(b.dataset.v === v)); });
                dial.setAttribute('aria-label', `${def.label}，目前 ${v}，按一下換下一個位置`);
            }
        };
    }

    // ---------- 七段顯示（FCU 的橘色視窗）----------
    const H = (x, y, w) => `${x},${y + 1.2} ${x + 1.2},${y} ${x + w - 1.2},${y} ${x + w},${y + 1.2} ${x + w - 1.2},${y + 2.4} ${x + 1.2},${y + 2.4}`;
    const V = (x, y, h) => `${x + 1.2},${y} ${x + 2.4},${y + 1.2} ${x + 2.4},${y + h - 1.2} ${x + 1.2},${y + h} ${x},${y + h - 1.2} ${x},${y + 1.2}`;
    const SEG = { a: H(2.2, 1, 9.6), g: H(2.2, 9.8, 9.6), d: H(2.2, 18.6, 9.6), f: V(1, 2.2, 8.4), b: V(10.6, 2.2, 8.4), e: V(1, 11.4, 8.4), c: V(10.6, 11.4, 8.4), p: V(5.8, 5.4, 11.2) };
    const GLYPH = {
        '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
        '-': 'g', '+': 'gp', ' ': ''
    };
    const PITCH = 16;

    function seg7(count, label) {
        const w = count * PITCH + 2;
        const s = svgEl('svg', { viewBox: `0 0 ${w} 24`, class: 'ck-seg7', role: 'img', 'aria-label': label });
        const g = svgEl('g', { transform: 'skewX(-6) translate(2 0)' }, s);
        const cells = [];
        for (let i = 0; i < count; i++) {
            const cg = svgEl('g', { transform: `translate(${i * PITCH} 0)` }, g);
            const segs = {};
            for (const k in SEG) segs[k] = svgEl('polygon', { points: SEG[k], class: 'ck-s' }, cg);
            const dp = svgEl('circle', { cx: 13.6, cy: 20.4, r: 1.2, class: 'ck-s' }, cg);
            cells.push({ segs, dp });
        }
        return {
            el: s,
            // text 例如 "0.78"、"-----"、"+1800"；小數點會接在前一個數字上
            set(text, spoken) {
                const chars = [];
                for (const c of String(text)) {
                    if (c === '.') {
                        if (chars.length && !chars[chars.length - 1].dp) chars[chars.length - 1].dp = true;
                        else chars.push({ c: ' ', dp: true });
                    } else chars.push({ c, dp: false });
                }
                while (chars.length < count) chars.unshift({ c: ' ', dp: false });
                cells.forEach((cell, i) => {
                    const ch = chars[i] || { c: ' ', dp: false };
                    const on = GLYPH[ch.c] || '';
                    for (const k in cell.segs) cell.segs[k].classList.toggle('on', on.includes(k));
                    cell.dp.classList.toggle('on', ch.dp);
                });
                s.setAttribute('aria-label', `${label} ${spoken !== undefined ? spoken : String(text).trim()}`);
            }
        };
    }

    // ---------- 旋鈕（FCU 的 SPD / HDG / ALT / V/S）----------
    // 轉動：拖曳、滾輪、方向鍵、旁邊的 − ＋ 按鈕；按下 = push；Shift＋點、右鍵或「拉」按鈕 = pull
    function knob(def) {
        const wrap = el('div', 'ck-knob-wrap');
        const k = el('div', 'ck-knob');
        k.tabIndex = 0;
        k.setAttribute('role', 'group');
        k.dataset.id = def.id;
        const s = svgEl('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true' });
        let ring = null;
        if (def.ring) {
            ring = svgEl('circle', { cx: 32, cy: 32, r: 30.5, class: 'ck-knob-ring' }, s);
        }
        const rot = svgEl('g', { class: 'ck-knob-rot' }, s);
        svgEl('circle', { cx: 32, cy: 32, r: def.ring ? 22 : 26, class: 'ck-knob-body' }, rot);
        const r0 = def.ring ? 22 : 26;
        for (let i = 0; i < 24; i++) {
            const a = (i * 15 * Math.PI) / 180;
            svgEl('line', { x1: 32 + Math.sin(a) * (r0 - 4), y1: 32 - Math.cos(a) * (r0 - 4), x2: 32 + Math.sin(a) * (r0 - 0.6), y2: 32 - Math.cos(a) * (r0 - 0.6), class: 'ck-knob-grip' }, rot);
        }
        svgEl('rect', { x: 30.6, y: 32 - r0 + 2, width: 2.8, height: 8, rx: 1.2, class: 'ck-knob-mark' }, rot);
        k.appendChild(s);
        let angle = 0;
        const spin = (deg) => { angle += deg; rot.setAttribute('transform', `rotate(${angle} 32 32)`); };
        const turn = (dir) => { spin(dir * 15); if (A.snd) A.snd.tick(); def.onTurn(dir); };

        // 拖曳旋轉：每 18 度一格
        let drag = null;
        k.addEventListener('pointerdown', (e) => {
            if (e.button === 2) return;
            const r = k.getBoundingClientRect();
            drag = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, last: Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)), acc: 0, moved: false, x: e.clientX, y: e.clientY, id: e.pointerId };
            k.setPointerCapture(e.pointerId);
        });
        k.addEventListener('pointermove', (e) => {
            if (!drag || e.pointerId !== drag.id) return;
            const a = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx);
            let d = a - drag.last;
            if (d > Math.PI) d -= 2 * Math.PI;
            if (d < -Math.PI) d += 2 * Math.PI;
            drag.last = a;
            drag.acc += d;
            if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true;
            const step = (18 * Math.PI) / 180;
            while (Math.abs(drag.acc) >= step) {
                const dir = drag.acc > 0 ? 1 : -1;
                drag.acc -= dir * step;
                turn(dir);
            }
        });
        const end = (e) => {
            if (!drag || e.pointerId !== drag.id) return;
            const moved = drag.moved;
            drag = null;
            if (!moved && e.type === 'pointerup') (e.shiftKey ? def.onPull : def.onPush)();
        };
        k.addEventListener('pointerup', end);
        k.addEventListener('pointercancel', end);
        k.addEventListener('contextmenu', (e) => { e.preventDefault(); def.onPull(); });
        k.addEventListener('wheel', (e) => { e.preventDefault(); turn(e.deltaY < 0 ? 1 : -1); }, { passive: false });
        k.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); turn(1); }
            else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); turn(-1); }
            else if (e.key === 'Enter') { e.preventDefault(); (e.shiftKey ? def.onPull : def.onPush)(); }
            else if (e.key === ' ') { e.preventDefault(); def.onPull(); }
        });

        // 外圈（ALT 的 100／1000 切換）
        if (ring && def.onRing) {
            const hit = svgEl('circle', { cx: 32, cy: 32, r: 30.5, class: 'ck-knob-ring-hit' }, s);
            hit.addEventListener('pointerdown', (e) => e.stopPropagation());
            hit.addEventListener('pointerup', (e) => { e.stopPropagation(); def.onRing(); });
        }

        const mini = (text, label, fn, repeat) => {
            const b = el('button', 'ck-mini', text);
            b.type = 'button';
            b.setAttribute('aria-label', label);
            if (repeat) {
                let t1 = 0, t2 = 0;
                const stop = () => { clearTimeout(t1); clearInterval(t2); };
                b.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    fn();
                    t1 = setTimeout(() => { t2 = setInterval(fn, 90); }, 380);
                });
                ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop));
                b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
            } else {
                b.addEventListener('click', fn);
            }
            return b;
        };
        const stepRow = el('div', 'ck-knob-steps');
        stepRow.append(mini('−', `${def.label} 減少`, () => turn(-1), true), mini('＋', `${def.label} 增加`, () => turn(1), true));
        const pp = el('div', 'ck-knob-pp');
        pp.append(mini('推', `${def.label} 推入（${def.pushHelp || 'push'}）`, def.onPush), mini('拉', `${def.label} 拉出（${def.pullHelp || 'pull'}）`, def.onPull));
        wrap.append(k, stepRow, pp);
        k.setAttribute('aria-label', `${def.label} 旋鈕：方向鍵轉動，Enter 推入，Shift＋Enter 或空白鍵拉出`);
        return { el: wrap, knob: k };
    }

    // 平面式按鈕（FCU 的 AP1、LOC、APPR……）：一個綠燈
    function fcuButton(def, onPress) {
        const b = el('button', 'ck-fb');
        b.type = 'button';
        b.dataset.id = def.id;
        b.setAttribute('aria-pressed', 'false');
        const light = el('span', 'ck-fb-light');
        light.setAttribute('aria-hidden', 'true');
        b.append(light, el('span', 'ck-fb-label', def.label));
        b.addEventListener('click', () => onPress(def.id));
        return {
            el: b,
            set(on) { light.classList.toggle('on', !!on); b.setAttribute('aria-pressed', String(!!on)); }
        };
    }

    A.ui = { el, svgEl, ann, pushButton, selector, seg7, knob, fcuButton, toast };
    A.toast = toast;
})(window);
