(() => {
    document.documentElement.classList.remove('no-js');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;

    // A seeded random so splatters and the skyline look the same on every visit.
    function seeded(seed) {
        return () => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        };
    }

    // =========================================================
    // SFX — synthesized with Web Audio, so there are no sound files to load
    // =========================================================
    const SFX = (() => {
        let ctx = null, master = null, muted = false;
        try { muted = localStorage.getItem('mw-muted') === '1'; } catch { /* storage blocked */ }

        function init() {
            if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = 0.5;
            master.connect(ctx.destination);
        }
        const live = () => ctx && ctx.state === 'running' && !muted;

        function tone({ type = 'square', f = 880, f2, dur = 0.05, vol = 0.06, delay = 0 }) {
            if (!live()) return;
            const t = ctx.currentTime + delay;
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = type;
            o.frequency.setValueAtTime(f, t);
            if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(vol, t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(master);
            o.start(t); o.stop(t + dur + 0.02);
        }

        function noise({ dur = 0.3, vol = 0.08, type = 'bandpass', f = 1200, f2 = 4000, q = 1.2, delay = 0 }) {
            if (!live()) return;
            const t = ctx.currentTime + delay;
            const len = Math.floor(ctx.sampleRate * dur);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const bq = ctx.createBiquadFilter();
            bq.type = type; bq.Q.value = q;
            bq.frequency.setValueAtTime(f, t);
            bq.frequency.exponentialRampToValueAtTime(f2, t + dur);
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            src.connect(bq); bq.connect(g); g.connect(master);
            src.start(t);
        }

        return {
            init,
            get muted() { return muted; },
            setMuted(m) {
                muted = m;
                try { localStorage.setItem('mw-muted', m ? '1' : '0'); } catch { /* storage blocked */ }
            },
            // menu tick, like moving between items in the MW menus
            hover() { tone({ f: 1900, dur: 0.035, vol: 0.03 }); },
            // menu accept
            click() { tone({ f: 620, f2: 1240, dur: 0.07, vol: 0.07 }); tone({ f: 1240, dur: 0.06, vol: 0.05, delay: 0.06 }); },
            // gear shift: a clunk, then a short rev blip
            shift() {
                tone({ type: 'sine', f: 130, f2: 55, dur: 0.12, vol: 0.22 });
                tone({ type: 'sawtooth', f: 95, f2: 170, dur: 0.16, vol: 0.04, delay: 0.09 });
            },
            radio() { noise({ dur: 0.18, vol: 0.05, type: 'highpass', f: 2500, f2: 3000 }); tone({ f: 1450, dur: 0.06, vol: 0.03, delay: 0.18 }); },
            siren() {
                for (let k = 0; k < 3; k++) {
                    tone({ type: 'triangle', f: 720, f2: 980, dur: 0.16, vol: 0.06, delay: k * 0.32 });
                    tone({ type: 'triangle', f: 980, f2: 720, dur: 0.16, vol: 0.06, delay: k * 0.32 + 0.16 });
                }
            },
            // key in the ignition: starter cranks, engine catches and settles into a lumpy idle
            ignition() {
                if (!live()) return;
                for (let i = 0; i < 6; i++) {
                    noise({ dur: 0.07, vol: 0.12, type: 'lowpass', f: 500, f2: 180, delay: i * 0.085 });
                    tone({ f: 85, dur: 0.05, vol: 0.05, delay: i * 0.085 });
                }
                const t = ctx.currentTime + 0.56;
                const o = ctx.createOscillator(), bq = ctx.createBiquadFilter();
                const g = ctx.createGain(), lope = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
                o.type = 'sawtooth';
                o.frequency.setValueAtTime(38, t);
                o.frequency.exponentialRampToValueAtTime(92, t + 0.22);
                o.frequency.exponentialRampToValueAtTime(48, t + 0.7);
                bq.type = 'lowpass';
                bq.frequency.setValueAtTime(900, t);
                bq.frequency.exponentialRampToValueAtTime(380, t + 0.8);
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(0.2, t + 0.05);
                g.gain.setValueAtTime(0.2, t + 1.5);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
                lfo.frequency.value = 8;
                depth.gain.value = 0.35;
                lope.gain.value = 0.65;
                lfo.connect(depth); depth.connect(lope.gain);
                o.connect(bq); bq.connect(lope); lope.connect(g); g.connect(master);
                o.start(t); lfo.start(t);
                o.stop(t + 2.7); lfo.stop(t + 2.7);
            },
        };
    })();

    // Browsers only allow audio after a user gesture
    ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => SFX.init(), { passive: true }));

    const muteBtn = document.getElementById('mute');
    function syncMute() {
        muteBtn.textContent = SFX.muted ? 'SFX off' : 'SFX on';
        muteBtn.setAttribute('aria-pressed', String(SFX.muted));
    }
    syncMute();
    muteBtn.addEventListener('click', () => {
        SFX.init();
        SFX.setMuted(!SFX.muted);
        syncMute();
        SFX.click();
    });

    document.addEventListener('pointerover', e => {
        const t = e.target.closest('[data-sfx]');
        if (t && !t.contains(e.relatedTarget)) SFX.hover();
    });
    document.addEventListener('click', e => {
        const t = e.target.closest('[data-sfx]');
        if (t && t !== muteBtn) SFX.click();
    });

    // Clicking anywhere on a rival screen (outside its own links) opens that project
    document.querySelectorAll('.rival[data-href]').forEach(el => { el.dataset.cursor = 'open project'; });
    document.addEventListener('click', e => {
        const rival = e.target.closest('.rival[data-href]');
        if (!rival || e.target.closest('a, button, iframe, input')) return;
        if (String(window.getSelection())) return;   // let people select text
        SFX.click();
        window.open(rival.dataset.href, '_blank', 'noopener');
    });

    // =========================================================
    // Ink splatter — blobs, droplets and drips with ragged edges
    // =========================================================
    const SPLAT_FILL = {
        black: 'rgba(7, 8, 4, 0.82)',
        olive: 'rgba(128, 143, 64, 0.14)',
    };

    function splatter(seed, mode) {
        const rand = seeded(seed);
        const W = 1600, H = 1000;
        let out = '';
        const blobs = 4 + Math.floor(rand() * 3);
        for (let b = 0; b < blobs; b++) {
            // keep the heavy ink near the edges so text stays readable
            const edge = rand();
            const cx = edge < 0.5 ? rand() * W : (rand() < 0.5 ? rand() * 260 : W - rand() * 260);
            const cy = edge < 0.5 ? (rand() < 0.5 ? rand() * 200 : H - rand() * 200) : rand() * H;
            const R = 50 + rand() * 150;
            out += `<circle cx="${cx | 0}" cy="${cy | 0}" r="${R | 0}"/>`;
            // a few lumps fused to the main blob
            for (let k = 0; k < 4; k++) {
                const a = rand() * Math.PI * 2, d = R * (0.5 + rand() * 0.5);
                out += `<circle cx="${(cx + Math.cos(a) * d) | 0}" cy="${(cy + Math.sin(a) * d) | 0}" r="${(R * (0.3 + rand() * 0.35)) | 0}"/>`;
            }
            // droplets flung outwards
            const drops = mode === 'olive' ? 3 + Math.floor(rand() * 5) : 10 + Math.floor(rand() * 16);
            for (let k = 0; k < drops; k++) {
                const a = rand() * Math.PI * 2, d = R * (1.1 + rand() * 1.6);
                out += `<circle cx="${(cx + Math.cos(a) * d) | 0}" cy="${(cy + Math.sin(a) * d) | 0}" r="${(2 + rand() * R * 0.09).toFixed(1)}"/>`;
            }
            // drips running down
            const drips = Math.floor(rand() * 3);
            for (let k = 0; k < drips; k++) {
                const x = cx + (rand() - 0.5) * R, w = 4 + rand() * 9, len = 60 + rand() * 260;
                out += `<rect x="${x | 0}" y="${cy | 0}" width="${w | 0}" height="${len | 0}" rx="${(w / 2) | 0}"/><circle cx="${(x + w / 2) | 0}" cy="${(cy + len) | 0}" r="${(w * 0.9) | 0}"/>`;
            }
        }
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><g fill="${SPLAT_FILL[mode] || SPLAT_FILL.black}" filter="url(#ink-edge)">${out}</g></svg>`;
    }

    document.querySelectorAll('[data-splat]').forEach(el => {
        el.innerHTML = splatter(Number(el.dataset.splat) || 1, el.dataset.splatMode);
    });

    // =========================================================
    // Rockport skyline behind the cover
    // =========================================================
    function skyline() {
        const svg = document.getElementById('skyline');
        if (!svg) return;
        const rand = seeded(2005);
        const W = 1600, H = 700;
        const R = (a, b) => a + rand() * (b - a);
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

        let plumes = '';
        // a smoke plume: blobs that grow as they drift right and up
        const plume = (x, y, s, colour) => {
            let g = `<g class="plume" fill="${colour}" filter="url(#plume-blur)">`;
            let px = x, py = y, r = 11 * s;
            const n = 7 + Math.floor(rand() * 5);
            for (let i = 0; i < n; i++) {
                g += `<circle cx="${px | 0}" cy="${py | 0}" r="${r | 0}"/>`;
                px += R(14, 30) * s; py -= R(10, 24) * s; r *= R(1.14, 1.28);
            }
            plumes += g + '</g>';
        };

        const layer = ({ fill, minH, maxH, s, smoke, windows }) => {
            let out = `<g fill="${fill}">`, lit = '';
            let x = -30;
            while (x < W) {
                const type = rand();
                if (type < 0.34) {
                    // factory block, often with a sawtooth roof
                    const w = R(90, 200) * s, h = R(minH, maxH);
                    out += `<rect x="${x | 0}" y="${(H - h) | 0}" width="${w | 0}" height="${h | 0}"/>`;
                    if (rand() < 0.55) {
                        const teeth = Math.max(2, Math.round(w / (26 * s)));
                        const tw = w / teeth;
                        let pts = '';
                        for (let i = 0; i < teeth; i++) {
                            pts += `${(x + i * tw) | 0},${(H - h) | 0} ${(x + i * tw) | 0},${(H - h - 16 * s) | 0} ${(x + (i + 1) * tw) | 0},${(H - h) | 0} `;
                        }
                        out += `<polygon points="${pts}"/>`;
                    }
                    if (windows) {
                        for (let wy = H - h + 16; wy < H - 14; wy += 18) {
                            for (let wx = x + 8; wx < x + w - 10; wx += 14) {
                                if (rand() < 0.07) lit += `<rect x="${wx | 0}" y="${wy | 0}" width="6" height="8"/>`;
                            }
                        }
                    }
                    x += w;
                } else if (type < 0.62) {
                    // smokestacks, one to three
                    const n = 1 + Math.floor(rand() * 3);
                    const baseH = R(minH * 0.6, maxH * 0.6);
                    const bw = (n * 42 + 28) * s;
                    out += `<rect x="${x | 0}" y="${(H - baseH) | 0}" width="${bw | 0}" height="${baseH | 0}"/>`;
                    for (let i = 0; i < n; i++) {
                        const cw = R(20, 34) * s, ch = R(maxH * 1.25, maxH * 1.85);
                        const cx = x + 14 * s + i * 42 * s;
                        out += `<polygon points="${cx | 0},${H} ${(cx + cw) | 0},${H} ${(cx + cw * 0.86) | 0},${(H - ch) | 0} ${(cx + cw * 0.14) | 0},${(H - ch) | 0}"/>`;
                        out += `<rect x="${(cx - 1) | 0}" y="${(H - ch - 4) | 0}" width="${(cw + 2) | 0}" height="6"/>`;
                        if (smoke && rand() < 0.75) plume(cx + cw / 2, H - ch - 8, s, smoke);
                    }
                    x += bw + R(4, 20);
                } else if (type < 0.74) {
                    // water tower on legs
                    const h = R(minH * 0.9, maxH * 1.1), tw = R(34, 48) * s;
                    out += `<rect x="${(x + 4) | 0}" y="${(H - h) | 0}" width="3" height="${h | 0}"/><rect x="${(x + tw - 7) | 0}" y="${(H - h) | 0}" width="3" height="${h | 0}"/>`;
                    out += `<rect x="${x | 0}" y="${(H - h - 30 * s) | 0}" width="${tw | 0}" height="${(32 * s) | 0}" rx="4"/>`;
                    out += `<polygon points="${x | 0},${(H - h - 30 * s) | 0} ${(x + tw / 2) | 0},${(H - h - 46 * s) | 0} ${(x + tw) | 0},${(H - h - 30 * s) | 0}"/>`;
                    x += tw + R(10, 30);
                } else if (type < 0.84) {
                    // cooling tower
                    const w = R(70, 110) * s, h = R(maxH * 0.9, maxH * 1.3);
                    out += `<path d="M${x | 0} ${H} Q${(x + w * 0.28) | 0} ${(H - h * 0.55) | 0} ${(x + w * 0.16) | 0} ${(H - h) | 0} L${(x + w * 0.84) | 0} ${(H - h) | 0} Q${(x + w * 0.72) | 0} ${(H - h * 0.55) | 0} ${(x + w) | 0} ${H} Z"/>`;
                    if (smoke) plume(x + w * 0.4, H - h - 6, s * 1.4, smoke);
                    x += w + R(6, 24);
                } else {
                    // pipe rack between buildings
                    const w = R(60, 120) * s, h = R(minH * 0.4, minH * 0.8);
                    out += `<rect x="${x | 0}" y="${(H - h) | 0}" width="${w | 0}" height="5"/><rect x="${x | 0}" y="${(H - h + 12) | 0}" width="${w | 0}" height="4"/>`;
                    for (let px = x; px < x + w; px += 22 * s) out += `<rect x="${px | 0}" y="${(H - h) | 0}" width="3" height="${h | 0}"/>`;
                    out += `<rect x="${x | 0}" y="${(H - h * 0.5) | 0}" width="${w | 0}" height="${(h * 0.5) | 0}"/>`;
                    x += w;
                }
            }
            out += '</g>';
            if (lit) out += `<g fill="#e7b25a" opacity="0.6">${lit}</g>`;
            return out;
        };

        // jagged foreground, like the treeline in a hazy valley
        const ground = (fill, base, amp) => {
            let d = `M0 ${H}`, x = 0;
            while (x <= W) {
                d += ` L${x | 0} ${(H - base - rand() * amp) | 0}`;
                x += R(6, 22);
            }
            return `<path fill="${fill}" d="${d} L${W} ${H} Z"/>`;
        };
        const haze = `<rect x="0" y="${H - 260}" width="${W}" height="260" fill="url(#haze)"/>`;

        const far = layer({ fill: '#8e8b56', minH: 170, maxH: 330, s: 0.7, smoke: 'rgba(222, 208, 160, 0.55)' });
        const farPlumes = plumes; plumes = '';
        const mid = layer({ fill: '#5a612d', minH: 120, maxH: 260, s: 0.95, smoke: 'rgba(196, 186, 136, 0.5)' });
        const midPlumes = plumes; plumes = '';
        const near = layer({ fill: '#22270f', minH: 70, maxH: 180, s: 1.15, windows: true });

        svg.innerHTML =
            '<defs><filter id="plume-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>' +
            '<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9b06c" stop-opacity="0"/><stop offset="1" stop-color="#b9b06c" stop-opacity="0.55"/></linearGradient></defs>' +
            farPlumes + far + haze + midPlumes + mid + haze + near + ground('#0f1209', 30, 60) + ground('#080905', 6, 34);
    }
    skyline();

    // =========================================================
    // Loader — once per visit, skipped for reduced motion
    // =========================================================
    const loader = document.getElementById('loader');
    let loaderOpen = false;
    let seen = false;
    try { seen = sessionStorage.getItem('mw-loaded') === '1'; } catch { /* storage blocked */ }

    const TIPS = [
        'Every rival on the blacklist has a key bar. Press 2 or 3 to jump straight to the game, the trailer or the code.',
        'Your heat level rises the further you scroll. Hit level 5 and the cops show up.',
        'Pistonart rebuilds Most Wanted\'s handling in Luau. That\'s where this whole look came from.',
        'Toggle the sound effects with the SFX button in the top right.',
        'Blokd! code RebornWithRelease unlocks the Night City theme.',
        'Press Esc on any rival screen to get back to the top.',
    ];

    function revealCover() {
        document.querySelectorAll('.cover .reveal').forEach((el, i) => {
            setTimeout(() => el.classList.add('is-in'), reduceMotion ? 0 : 200 + i * 160);
        });
        initPortrait();
    }

    // runs last, once everything below is defined
    function startLoader() {
        if (seen || reduceMotion) { revealCover(); return; }
        loaderOpen = true;
        loader.hidden = false;
        document.body.style.overflow = 'hidden';
        const fill = document.getElementById('loader-fill');
        const start = document.getElementById('loader-start');
        const startLabel = start.querySelector('span');
        document.getElementById('loader-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
        let p = 0;
        const timer = setInterval(() => {
            p = Math.min(100, p + Math.random() * 10 + 4);
            fill.style.width = p + '%';
            if (p >= 100) {
                clearInterval(timer);
                start.disabled = false;
                startLabel.textContent = finePointer ? 'Click anywhere to start' : 'Tap anywhere to start';
                start.focus({ preventScroll: true });
            }
        }, 70);

        const enter = () => {
            if (start.disabled) return;
            SFX.init();
            // init() resumes asynchronously the first time; give it a tick
            setTimeout(() => SFX.ignition(), 30);
            try { sessionStorage.setItem('mw-loaded', '1'); } catch { /* storage blocked */ }
            loader.classList.add('is-gone');
            document.body.style.overflow = '';
            loaderOpen = false;
            setTimeout(() => { loader.hidden = true; }, 850);
            revealCover();
            window.removeEventListener('keydown', onKey);
        };
        const onKey = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); } };
        loader.addEventListener('click', enter);
        window.addEventListener('keydown', onKey);
    }

    // =========================================================
    // Custom cursor (mouse / trackpad only)
    // =========================================================
    const cursor = document.getElementById('cursor');
    if (finePointer && cursor) {
        document.body.classList.add('has-cursor');
        const label = cursor.querySelector('.cursor-label');
        let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
        window.addEventListener('pointermove', e => {
            x = e.clientX; y = e.clientY;
            const t = e.target.closest('a, button, [data-cursor]');
            cursor.classList.toggle('is-hover', !!t);
            if (t) label.textContent = t.dataset.cursor || 'select';
        });
        window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
        window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));
        document.addEventListener('pointerleave', () => { cursor.style.opacity = 0; });
        document.addEventListener('pointerenter', () => { cursor.style.opacity = 1; });
        const follow = () => {
            const k = reduceMotion ? 1 : 0.32;
            cx += (x - cx) * k; cy += (y - cy) * k;
            cursor.style.transform = `translate(${cx}px, ${cy}px)`;
            requestAnimationFrame(follow);
        };
        follow();
    }

    // =========================================================
    // Key bar shortcuts: Esc / 2 / 3 act on the screen you're looking at
    // =========================================================
    function currentScreen() {
        const mid = innerHeight / 2;
        for (const el of document.querySelectorAll('[data-rival]')) {
            const r = el.getBoundingClientRect();
            if (r.top <= mid && r.bottom >= mid) return el;
        }
        return null;
    }

    window.addEventListener('keydown', e => {
        if (loaderOpen || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target.closest('input, textarea, select, [contenteditable]')) return;
        if (!['Escape', '2', '3'].includes(e.key)) return;
        const screen = currentScreen();
        const btn = screen && screen.querySelector(`.keybar [data-key="${e.key}"]`);
        if (!btn) {
            if (e.key === 'Escape') window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
            return;
        }
        e.preventDefault();
        btn.classList.add('is-pressed');
        setTimeout(() => btn.classList.remove('is-pressed'), 180);
        btn.click();
    });

    // =========================================================
    // ASCII mugshot
    // The portrait ships as characters + palette indices only (js/portrait-data.js).
    // Colours are re-graded by brightness onto MW's olive → cream ramp,
    // over dark tiles so the figure reads as a silhouette against the sky.
    // =========================================================
    const P = window.PORTRAIT;
    const portrait = document.getElementById('portrait');
    const canvas = portrait && portrait.querySelector('.portrait-canvas');
    const KEY = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const GLITCH = '#%@&*+=-:;<>?/\\|[]{}01';
    const FONT = 'ui-monospace, Consolas, "Courier New", monospace';
    const TILE = 'rgba(10, 12, 6, 0.9)';

    let cells = [];          // { c, r, ch, colour, tile, glitchUntil }
    let geo = null;          // { cellW, cellH, left, top, w, h }
    let ctx = null;
    let grades = [];

    function grade(hex) {
        const n = parseInt(hex.slice(1), 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const t = Math.min(1, Math.max(0, (lum - 0.12) / 0.8));
        const lo = [70, 80, 30], hi = [244, 236, 196];
        return `rgb(${lo.map((v, i) => Math.round(v + (hi[i] - v) * Math.pow(t, 0.8))).join(',')})`;
    }

    function layout() {
        const box = canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(box.width * dpr);
        canvas.height = Math.round(box.height * dpr);
        ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // fit the whole figure inside the box, standing on the bottom edge
        const cellW = Math.min(box.width / P.cols, box.height * 0.6 / P.rows);
        const cellH = cellW / 0.6;
        const left = (box.width - P.cols * cellW) / 2;
        const top = box.height - P.rows * cellH;
        geo = { cellW, cellH, left, top, w: box.width, h: box.height };
        ctx.font = `700 ${cellH.toFixed(2)}px ${FONT}`;
        ctx.textBaseline = 'top';

        const dust = P.palette.length - 1;
        cells = [];
        for (let r = 0; r < P.rows; r++) {
            for (let c = 0; c < P.cols; c++) {
                const i = r * P.cols + c;
                const ch = P.chars[i];
                if (ch === ' ') continue;
                const k = KEY.indexOf(P.colors[i]);
                const isDust = k === dust;
                cells.push({
                    c, r, ch,
                    colour: isDust ? 'rgba(241, 238, 224, 0.25)' : grades[k],
                    tile: isDust ? null : TILE,
                    glitchUntil: 0,
                });
            }
        }
    }

    const cellX = cell => geo.left + cell.c * geo.cellW;
    const cellY = cell => geo.top + cell.r * geo.cellH;

    function drawCell(cell, ch, colour = cell.colour) {
        ctx.fillStyle = colour;
        ctx.fillText(ch, cellX(cell), cellY(cell));
    }

    function drawAll(progress = 1) {
        ctx.clearRect(0, 0, geo.w, geo.h);
        // "printing" reveal: rows settle from the top down, with some noise
        const front = progress * (P.rows + 24);
        // tiles go into a single path so overlaps don't double up the alpha
        const tiles = new Path2D();
        for (const cell of cells) {
            if (!cell.tile || cell.r >= front) continue;
            tiles.rect(cellX(cell) - 0.3, cellY(cell) - 0.3, geo.cellW + 0.6, geo.cellH + 0.6);
        }
        ctx.fillStyle = TILE;
        ctx.fill(tiles);
        for (const cell of cells) {
            const settled = cell.r + (cell.c * 7 % 13) < front - 12;
            if (settled) drawCell(cell, cell.ch);
            else if (cell.r < front) drawCell(cell, GLITCH[(Math.random() * GLITCH.length) | 0], '#d5de6c');
        }
    }

    function printIn() {
        if (reduceMotion) { drawAll(1); return; }
        const start = performance.now();
        const dur = 1600;
        const step = now => {
            const p = Math.min(1, (now - start) / dur);
            drawAll(1 - Math.pow(1 - p, 2));
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    // Cursor scramble: glyphs near the pointer flicker, then settle back.
    let glitchLoop = 0;
    function glitchFrame() {
        const now = performance.now();
        let active = false;
        for (const cell of cells) {
            if (!cell.glitchUntil) continue;
            const x = cellX(cell), y = cellY(cell);
            ctx.clearRect(x - 0.3, y - 0.3, geo.cellW + 0.6, geo.cellH + 0.6);
            if (cell.tile) { ctx.fillStyle = cell.tile; ctx.fillRect(x - 0.3, y - 0.3, geo.cellW + 0.6, geo.cellH + 0.6); }
            if (now < cell.glitchUntil) {
                drawCell(cell, GLITCH[(Math.random() * GLITCH.length) | 0], '#d5de6c');
                active = true;
            } else {
                drawCell(cell, cell.ch);
                cell.glitchUntil = 0;
            }
        }
        glitchLoop = active ? requestAnimationFrame(glitchFrame) : 0;
    }

    function scrambleAt(clientX, clientY) {
        const box = canvas.getBoundingClientRect();
        const cx = (clientX - box.left - geo.left) / geo.cellW;
        const cy = (clientY - box.top - geo.top) / geo.cellH;
        const R = 5;
        const now = performance.now();
        for (const cell of cells) {
            const dx = cell.c - cx, dy = (cell.r - cy) * 1.6;
            if (dx * dx + dy * dy < R * R) cell.glitchUntil = now + 120 + Math.random() * 260;
        }
        if (!glitchLoop) glitchLoop = requestAnimationFrame(glitchFrame);
    }

    let portraitReady = false;
    function initPortrait() {
        if (portraitReady || !P || !canvas) return;
        portraitReady = true;
        grades = P.palette.map(grade);
        layout();
        printIn();
        if (!reduceMotion) {
            canvas.addEventListener('pointermove', e => scrambleAt(e.clientX, e.clientY));
        }
    }

    let resizeTimer;
    let lastW = window.innerWidth;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // phones fire resize when the toolbar hides; only redo layout on real width changes
            if (window.innerWidth === lastW && cells.length) return;
            lastW = window.innerWidth;
            if (portraitReady && geo) { layout(); drawAll(1); }
        }, 150);
    });

    // =========================================================
    // Scroll reveal + a gear shift as each rival rolls in
    // =========================================================
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(el => { if (!el.closest('.cover')) io.observe(el); });

    const shiftIO = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) { SFX.shift(); shiftIO.unobserve(e.target); }
        });
    }, { threshold: 0.3 });
    document.querySelectorAll('[data-section]').forEach(el => shiftIO.observe(el));

    // =========================================================
    // Heat level + bounty, driven by scroll
    // =========================================================
    const heat = document.getElementById('heat');
    const bars = heat.querySelectorAll('i');
    const bounty = document.querySelector('#bounty span');
    const heatToast = document.createElement('div');
    heatToast.className = 'heat-toast';
    heatToast.setAttribute('aria-hidden', 'true');
    document.body.appendChild(heatToast);
    const MAX_BOUNTY = 7000000;
    let level = 0, heatTimer;

    function onScroll() {
        const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        const p = Math.min(1, scrollY / max);
        const lv = Math.min(5, Math.floor(p * 5.2) + 1);
        bounty.textContent = Math.round(p * MAX_BOUNTY).toLocaleString('en-US');
        if (lv === level) return;
        const up = level !== 0 && lv > level;
        level = lv;
        bars.forEach((b, i) => b.classList.toggle('on', i < lv));
        heat.classList.toggle('is-hot', lv >= 4);
        if (up) {
            if (lv >= 4) SFX.siren(); else SFX.radio();
            heatToast.textContent = `Heat level ${lv}`;
            heatToast.classList.add('show');
            clearTimeout(heatTimer);
            heatTimer = setTimeout(() => heatToast.classList.remove('show'), 1600);
        }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // =========================================================
    // Copy Discord name
    // =========================================================
    const toast = document.getElementById('toast');
    let toastTimer;
    function say(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    document.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const text = btn.dataset.copy;
            try {
                await navigator.clipboard.writeText(text);
                say(`Copied “${text}” — add me on Discord`);
            } catch {
                say(`My Discord is: ${text}`);
            }
        });
    });

    startLoader();
})();
