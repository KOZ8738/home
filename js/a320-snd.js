// A320 頁的聲音：全部用 Web Audio 即時合成，不需要任何音檔。
// 瀏覽器規定要使用者點過頁面才能出聲，所以第一次點擊或按鍵之後才會啟動。
(function (root) {
    'use strict';

    const A = root.A320 = root.A320 || {};
    const snd = A.snd = {};

    const AC = root.AudioContext || root.webkitAudioContext;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    let ctx = null;
    let master = null;
    let noiseBuf = null;
    let L = null;                 // 常駐的聲音層（引擎、APU、空調…）
    let enabled = true;
    let volume = 0.5;
    let quiet = true;             // 剛換情境時，不要為了狀態跳變響起提示音
    let prev = {};
    let lastTick = 0;
    let nextIgn = 0;

    // ---------- 偏好 ----------
    try {
        const raw = localStorage.getItem('a320-snd');
        if (raw) {
            const o = JSON.parse(raw);
            if (typeof o.on === 'boolean') enabled = o.on;
            if (typeof o.vol === 'number') volume = clamp(o.vol, 0, 1);
        }
    } catch (e) { /* 無痕模式等情況，用預設值 */ }

    const save = () => { try { localStorage.setItem('a320-snd', JSON.stringify({ on: enabled, vol: volume })); } catch (e) { /* 忽略 */ } };

    snd.supported = !!AC;
    snd.isOn = () => enabled;
    snd.getVolume = () => volume;

    // ---------- 建立音訊環境 ----------
    function ensure() {
        if (ctx || !AC) return ctx;
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        master = ctx.createGain();
        master.gain.value = 0;
        master.connect(comp);
        comp.connect(ctx.destination);
        const len = ctx.sampleRate * 2;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        buildLayers();
        applyGain(1.2);
        return ctx;
    }

    function applyGain(fade) {
        if (!ctx) return;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(enabled ? volume * volume : 0, ctx.currentTime, fade || 0.08);
    }

    function unlock() {
        if (!enabled || !AC) return;
        ensure();
        if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    snd.setEnabled = (on) => {
        enabled = !!on;
        save();
        if (enabled) { unlock(); applyGain(0.4); } else if (ctx) applyGain(0.05);
    };

    snd.setVolume = (v) => {
        volume = clamp(v, 0, 1);
        save();
        applyGain(0.05);
    };

    const live = () => ctx && enabled && ctx.state === 'running';

    // ---------- 小積木 ----------
    function noiseSrc() {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        s.loop = true;
        s.start(0, Math.random() * 1.5);
        return s;
    }

    function biquad(type, f, q) {
        const b = ctx.createBiquadFilter();
        b.type = type;
        b.frequency.value = f;
        if (q) b.Q.value = q;
        return b;
    }

    function gain(v, to) {
        const g = ctx.createGain();
        g.gain.value = v;
        if (to) g.connect(to);
        return g;
    }

    function osc(type, f) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.start();
        return o;
    }

    const set = (param, v, tc) => param.setTargetAtTime(v, ctx.currentTime, tc || 0.15);

    // ---------- 常駐的聲音層 ----------
    function engineLayer(pan) {
        const out = gain(0);
        if (ctx.createStereoPanner) {
            const p = ctx.createStereoPanner();
            p.pan.value = pan;
            out.connect(p);
            p.connect(master);
        } else out.connect(master);
        const lp = biquad('lowpass', 300, 0.7);
        noiseSrc().connect(lp);
        lp.connect(gain(0.9, out));
        const whine = osc('sawtooth', 300);
        const wf = biquad('bandpass', 1800, 2);
        const wg = gain(0);
        whine.connect(wf);
        wf.connect(wg);
        wg.connect(out);
        const rum = osc('triangle', 40);
        rum.connect(gain(0.5, out));
        return { out, lp, whine, wg, rum };
    }

    function buildLayers() {
        L = { eng: [engineLayer(-0.35), engineLayer(0.35)] };

        // APU
        const apuOut = gain(0, master);
        const a = osc('sawtooth', 120);
        const af = biquad('lowpass', 700, 0.8);
        a.connect(af);
        af.connect(apuOut);
        const an = biquad('bandpass', 900, 0.7);
        noiseSrc().connect(an);
        an.connect(gain(0.6, apuOut));
        L.apu = { out: apuOut, o: a, f: af };

        // 空調（氣流聲）
        const airOut = gain(0, master);
        const airF = biquad('bandpass', 2400, 0.5);
        noiseSrc().connect(airF);
        airF.connect(airOut);
        L.air = { out: airOut };

        // 電子設備的嗡聲
        const humOut = gain(0, master);
        osc('sine', 400).connect(humOut);
        osc('sine', 1200).connect(gain(0.35, humOut));
        L.hum = { out: humOut };

        // 風切聲（在空中和滑跑時）
        const windOut = gain(0, master);
        const windF = biquad('highpass', 900, 0.5);
        noiseSrc().connect(windF);
        windF.connect(windOut);
        L.wind = { out: windOut };

        // 液壓泵
        const pumpOut = gain(0, master);
        const pf = biquad('lowpass', 800, 1);
        osc('sawtooth', 185).connect(pf);
        pf.connect(pumpOut);
        L.pump = { out: pumpOut };
    }

    // ---------- 一次性的聲音 ----------
    function burst(opts) {
        if (!live()) return;
        const t = ctx.currentTime + (opts.at || 0);
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        const f = biquad(opts.type || 'bandpass', opts.f || 1500, opts.q || 1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(opts.v || 0.3, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.d || 0.03));
        s.connect(f);
        f.connect(g);
        g.connect(master);
        s.start(t, Math.random() * 1.5, (opts.d || 0.03) + 0.05);
    }

    function tone(f, d, o) {
        if (!live()) return;
        o = o || {};
        const t = ctx.currentTime + (o.at || 0);
        const os = ctx.createOscillator();
        os.type = o.type || 'sine';
        os.frequency.setValueAtTime(f, t);
        if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + d);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(o.v || 0.2, t + (o.a || 0.006));
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        os.connect(g);
        let last = g;
        if (o.lp) { const lp = biquad('lowpass', o.lp, 0.7); g.connect(lp); last = lp; }
        last.connect(master);
        os.start(t);
        os.stop(t + d + 0.05);
    }

    snd.click = () => { burst({ f: 2200, q: 0.9, v: 0.32, d: 0.025 }); tone(140, 0.05, { v: 0.16, to: 80 }); };
    snd.clack = () => { burst({ f: 1100, q: 0.8, v: 0.4, d: 0.035 }); burst({ f: 3200, q: 1, v: 0.12, d: 0.012, at: 0.045 }); tone(190, 0.07, { v: 0.2, to: 90 }); };
    snd.flap = () => { burst({ type: 'lowpass', f: 700, v: 0.35, d: 0.07 }); tone(260, 0.09, { v: 0.1, to: 150, type: 'triangle' }); };
    snd.tick = () => {
        if (!live()) return;
        const n = performance.now();
        if (n - lastTick < 22) return;
        lastTick = n;
        burst({ f: 3600, q: 1.4, v: 0.2, d: 0.012 });
    };

    snd.chime = (n) => {
        for (let i = 0; i < (n || 1); i++) {
            tone(880, 0.7, { v: 0.2, at: i * 0.42, a: 0.01 });
            tone(1318, 0.5, { v: 0.08, at: i * 0.42, a: 0.01 });
        }
    };

    // 自動駕駛解除的「衝鋒號」
    snd.cavalry = () => {
        const seq = [523, 659, 784, 1047, 784, 1047];
        seq.forEach((f, i) => tone(f, i === 5 ? 0.5 : 0.12, { type: 'sawtooth', v: 0.12, at: i * 0.11, lp: 2600 }));
        seq.forEach((f, i) => tone(f, i === 5 ? 0.5 : 0.12, { type: 'sawtooth', v: 0.12, at: 1.0 + i * 0.11, lp: 2600 }));
    };

    snd.apOn = () => { tone(1200, 0.12, { v: 0.12 }); tone(1800, 0.1, { v: 0.05, at: 0.02 }); };

    // 連續重複鈴聲（火警）
    snd.fire = (sec) => {
        const n = Math.floor((sec || 3) / 0.22);
        for (let i = 0; i < n; i++) tone(1850, 0.18, { v: 0.14, at: i * 0.22, a: 0.004, type: 'triangle' });
    };

    snd.clunk = () => { burst({ type: 'lowpass', f: 400, v: 0.5, d: 0.08 }); tone(90, 0.12, { v: 0.3, to: 55 }); };

    snd.touch = (vs) => {
        const hard = clamp((-vs - 100) / 900, 0, 1);
        burst({ type: 'lowpass', f: 260 + hard * 300, v: 0.45 + hard * 0.35, d: 0.28 });
        tone(70, 0.3, { v: 0.3 + hard * 0.25, to: 40 });
        burst({ f: 1800, q: 0.6, v: 0.18, d: 0.35, at: 0.05 });
    };

    snd.call = (id) => {
        if (id === 'callEmer') { for (let i = 0; i < 3; i++) tone(988, 0.16, { v: 0.2, at: i * 0.2 }); return; }
        snd.chime(id === 'callMech' ? 1 : 2);
    };

    // ---------- 常駐聲音的更新（每 0.1 秒）----------
    snd.update = function (st, F) {
        if (!st || !live() || !L) { prev = {}; return; }
        const now = ctx.currentTime;
        const pw = !!st.buses.dcbat;
        const air = F && F.phase === 'AIR';
        const thrust = (F && F.thrust) || 0;

        st.eng.forEach((e, i) => {
            const l = L.eng[i];
            const f = clamp(e.n2 / 90, 0, 1.1);
            const on = e.n2 > 1 ? 1 : 0;
            const lev = on * (Math.pow(f, 1.4) * 0.5 + (e.s === 'run' ? thrust * 0.12 : 0));
            set(l.out.gain, lev, 0.2);
            set(l.lp.frequency, 160 + f * 1100 + thrust * 500, 0.25);
            set(l.whine.frequency, 260 + e.n2 * 16, 0.12);
            set(l.wg.gain, on * Math.pow(f, 2.2) * 0.07, 0.2);
            set(l.rum.frequency, 26 + e.n2 * 0.45, 0.2);
        });

        const apu = st.apu;
        const an = apu.s === 'off' ? 0 : apu.n / 100;
        set(L.apu.out.gain, an > 0.01 ? Math.pow(an, 1.2) * 0.13 : 0, 0.25);
        set(L.apu.o.frequency, 70 + apu.n * 3.4, 0.15);
        set(L.apu.f.frequency, 500 + apu.n * 12, 0.2);

        const packs = (st.pb.pack1 ? 1 : 0) + (st.pb.pack2 ? 1 : 0);
        const flowing = pw && st.air && (st.air.L > 8 || st.air.R > 8);
        set(L.air.out.gain, flowing ? 0.02 + packs * 0.018 : 0, 0.5);
        set(L.hum.out.gain, pw ? 0.012 : 0, 0.3);
        set(L.pump.out.gain, pw && st.pb.hydYel && st.hyd.y > 100 && st.buses.ac2 ? 0.02 : 0, 0.3);

        const ias = (F && F.ias) || 0;
        const moving = air || (F && F.phase === 'ROLL');
        set(L.wind.out.gain, moving ? Math.pow(clamp(ias / 320, 0, 1.2), 3) * 0.07 : 0, 0.3);

        // 點火器的答答聲
        if (st.eng.some((e) => e.s === 'start') || apu.s === 'start') {
            if (now > nextIgn) {
                burst({ f: 2600, q: 1.2, v: 0.14, d: 0.015 });
                burst({ f: 2600, q: 1.2, v: 0.1, d: 0.015, at: 0.09 });
                nextIgn = now + 0.45 + Math.random() * 0.25;
            }
        }

        // 狀態改變時才響的提示音
        const ap = !!(F && (F.ap1 || F.ap2));
        const cur = { pw, ap, seat: st.sel.seat, nosmk: st.sel.nosmk, phase: F && F.phase };
        if (!quiet && prev.pw !== undefined) {
            if (cur.pw && !prev.pw) snd.clunk();
            if (!cur.pw && prev.pw) snd.clunk();
            if (cur.ap && !prev.ap) snd.apOn();
            if (!cur.ap && prev.ap && prev.phase === cur.phase) snd.cavalry();
            if (cur.seat !== prev.seat || cur.nosmk !== prev.nosmk) snd.chime(1);
        }
        prev = cur;
        quiet = false;
    };

    // 換情境或重置時呼叫，下一次 update 不會因為狀態突變而響提示音
    snd.reset = () => { quiet = true; prev = {}; };

    // ---------- 按鍵聲：整頁一個監聽 ----------
    function onClick(e) {
        if (!enabled) return;
        const t = e.target;
        if (!t || !t.closest || !t.closest('.ck-wrap')) return;
        unlock();
        const pb = t.closest('.ck-pb-btn');
        if (t.closest('.ck-gcover')) return snd.flap();
        if (t.closest('.ck-lev') || t.closest('.ck-lopt')) return snd.clack();
        if (t.closest('.ck-dk-dial') || t.closest('.ck-dopt')) return snd.tick(), snd.click();
        if (pb) {
            const id = pb.dataset.id || '';
            if (/^fireTest/.test(id)) return snd.fire(3);
            if (/^call/.test(id)) return snd.click(), snd.call(id);
            return snd.click();
        }
        if (t.tagName === 'INPUT') return;
        if (t.closest('.ck-fcu button, .ck-fcu .ck-fcu-btn, .ck-tab, .seg-opt, .btn, .ck-mini2, .ck-opt')) snd.click();
    }

    snd.init = () => {
        document.addEventListener('click', onClick, true);
        const first = () => {
            unlock();
            ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.removeEventListener(ev, first, true));
        };
        ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, first, true));
    };
})(window);
