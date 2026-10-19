(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // A seeded random so the towers stand in the same place on every visit.
    function seeded(seed) {
        return () => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        };
    }

    // =========================================================
    // Boot screen — once per visit, any key or click skips it
    // =========================================================
    const boot = document.getElementById('boot');
    const booting = !!boot && !root.classList.contains('seen');
    if (booting) {
        const finish = () => {
            boot.classList.add('is-done');
            try { sessionStorage.setItem('booted', '1'); } catch { /* storage blocked */ }
            window.removeEventListener('keydown', finish);
            boot.removeEventListener('pointerdown', finish);
            setTimeout(() => boot.remove(), 800);
        };
        setTimeout(finish, 2300);
        window.addEventListener('keydown', finish);
        boot.addEventListener('pointerdown', finish);
    } else if (boot) {
        boot.remove();
    }

    // =========================================================
    // Sound — tiny menu blips synthesized with Web Audio, off by default
    // =========================================================
    const SFX = (() => {
        let ctx = null, on = false;
        try { on = localStorage.getItem('undmg-sfx') === '1'; } catch { /* storage blocked */ }

        function ensure() {
            if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) ctx = new AC();
        }

        function tone(f, f2, dur, vol, delay = 0, type = 'sine') {
            const t = ctx.currentTime + delay;
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = type;
            o.frequency.setValueAtTime(f, t);
            o.frequency.exponentialRampToValueAtTime(f2, t + dur);
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(vol, t + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g).connect(ctx.destination);
            o.start(t);
            o.stop(t + dur + 0.02);
        }

        const sounds = {
            move: () => tone(1320, 1180, 0.06, 0.05),
            ok: () => { tone(880, 880, 0.08, 0.06); tone(1320, 1320, 0.12, 0.05, 0.06); },
            back: () => { tone(990, 660, 0.12, 0.06, 0, 'triangle'); },
        };

        return {
            get on() { return on; },
            toggle() {
                on = !on;
                try { localStorage.setItem('undmg-sfx', on ? '1' : '0'); } catch { /* storage blocked */ }
                if (on) { ensure(); sounds.ok(); }
                return on;
            },
            play(name) {
                if (!on) return;
                ensure();
                if (ctx && sounds[name]) sounds[name]();
            },
        };
    })();

    const sfxBtn = document.getElementById('sfx');
    const paintSfx = () => {
        sfxBtn.setAttribute('aria-pressed', String(SFX.on));
        sfxBtn.querySelector('b').textContent = SFX.on ? 'on' : 'off';
    };
    if (sfxBtn) {
        paintSfx();
        sfxBtn.addEventListener('click', () => { SFX.toggle(); paintSfx(); });
    }

    document.querySelectorAll('[data-sfx]').forEach(el => {
        el.addEventListener('click', () => SFX.play(el.dataset.sfx));
        if (el.dataset.sfx === 'move' || el.classList.contains('menu__row')) {
            el.addEventListener('pointerenter', () => SFX.play('move'));
        }
    });

    // =========================================================
    // Cover towers — the floating memory blocks of an old console menu.
    // Plain 2D canvas: translucent boxes, drawn additively, slowly orbiting.
    // =========================================================
    const towerCanvas = document.getElementById('towers');
    if (towerCanvas) {
        const tc = towerCanvas.getContext('2d');
        const rand = seeded(2004);
        const towers = [];
        const GRID = 9, STEP = 2.6;
        for (let gx = 0; gx < GRID; gx++) {
            for (let gz = 0; gz < GRID; gz++) {
                if (rand() < 0.42) continue;
                const x = (gx - (GRID - 1) / 2) * STEP + (rand() - 0.5) * 0.6;
                const z = (gz - (GRID - 1) / 2) * STEP + (rand() - 0.5) * 0.6;
                towers.push({
                    x, z,
                    blocks: 1 + Math.floor(Math.pow(rand(), 1.6) * 9),
                    hue: rand() < 0.12 ? 'warm' : 'cool',
                    bob: rand() * Math.PI * 2,
                });
            }
        }
        const motes = Array.from({ length: 70 }, () => ({
            x: (rand() - 0.5) * 26, y: rand() * 14, z: (rand() - 0.5) * 26, s: 0.4 + rand(),
        }));

        let W = 0, H = 0, running = false, visible = true;

        function size() {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const box = towerCanvas.getBoundingClientRect();
            W = box.width; H = box.height;
            towerCanvas.width = Math.round(W * dpr);
            towerCanvas.height = Math.round(H * dpr);
            tc.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        // camera orbits the centre of the field, looking slightly down
        function projector(t) {
            const a = t * 0.00004 + 0.6;
            const R = 26, camY = 8;
            const cx = Math.sin(a) * R, cz = Math.cos(a) * R;
            const cos = Math.cos(-a), sin = Math.sin(-a);
            const pitch = 0.28, cp = Math.cos(pitch), sp = Math.sin(pitch);
            const f = Math.min(W, H * 1.6) * 0.9;
            return (x, y, z) => {
                let dx = x - cx, dy = y - camY, dz = z - cz;
                // yaw, so the camera faces the origin
                const rx = dx * cos + dz * sin;
                let rz = -dx * sin + dz * cos;
                // pitch down
                const ry = dy * cp - rz * sp;
                rz = dy * sp + rz * cp;
                const depth = -rz;
                if (depth < 0.5) return null;
                return { x: W * 0.5 + (rx / depth) * f, y: H * 0.7 - (ry / depth) * f, d: depth };
            };
        }

        const FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];

        function drawBox(P, x, y0, y1, z, hw, colour, alpha) {
            const pts = [
                P(x - hw, y0, z - hw), P(x + hw, y0, z - hw), P(x + hw, y0, z + hw), P(x - hw, y0, z + hw),
                P(x - hw, y1, z - hw), P(x + hw, y1, z - hw), P(x + hw, y1, z + hw), P(x - hw, y1, z + hw),
            ];
            if (pts.some(p => !p)) return;
            tc.fillStyle = `rgba(${colour}, ${alpha * 0.11})`;
            tc.strokeStyle = `rgba(${colour}, ${alpha * 0.6})`;
            for (const f of FACES) {
                tc.beginPath();
                tc.moveTo(pts[f[0]].x, pts[f[0]].y);
                for (let i = 1; i < 4; i++) tc.lineTo(pts[f[i]].x, pts[f[i]].y);
                tc.closePath();
                tc.fill();
                tc.stroke();
            }
        }

        function frame(t) {
            tc.clearRect(0, 0, W, H);
            const P = projector(t);
            tc.globalCompositeOperation = 'lighter';
            tc.lineWidth = 1;

            // floor grid
            tc.strokeStyle = 'rgba(90, 120, 255, 0.07)';
            const span = (GRID / 2 + 1) * STEP;
            for (let i = -span; i <= span; i += STEP) {
                const a = P(i, 0, -span), b = P(i, 0, span), c = P(-span, 0, i), d = P(span, 0, i);
                if (a && b) { tc.beginPath(); tc.moveTo(a.x, a.y); tc.lineTo(b.x, b.y); tc.stroke(); }
                if (c && d) { tc.beginPath(); tc.moveTo(c.x, c.y); tc.lineTo(d.x, d.y); tc.stroke(); }
            }

            for (const tw of towers) {
                const c = P(tw.x, 0, tw.z);
                if (!c) continue;
                const fog = Math.max(0, Math.min(1, 1.5 - c.d / 32));
                const colour = tw.hue === 'warm' ? '255, 190, 120' : '140, 170, 255';
                const lift = Math.sin(t * 0.0006 + tw.bob) * 0.08;
                for (let b = 0; b < tw.blocks; b++) {
                    const y0 = b * 0.62 + lift * b;
                    drawBox(P, tw.x, y0, y0 + 0.52, tw.z, 0.42, colour, fog * (1 - b * 0.06));
                }
            }

            for (const m of motes) {
                const y = (m.y + t * 0.0003 * m.s) % 14;
                const p = P(m.x, y, m.z);
                if (!p) continue;
                const r = Math.max(0.6, 18 / p.d) * m.s;
                tc.fillStyle = `rgba(190, 210, 255, ${Math.max(0, 0.5 - p.d / 60)})`;
                tc.fillRect(p.x, p.y, r, r);
            }
            tc.globalCompositeOperation = 'source-over';
        }

        function loop(t) {
            if (!running) return;
            frame(t);
            requestAnimationFrame(loop);
        }

        function start() {
            if (running || reduceMotion || !visible || document.hidden) return;
            running = true;
            requestAnimationFrame(loop);
        }

        size();
        frame(performance.now());
        start();

        new IntersectionObserver(([e]) => {
            visible = e.isIntersecting;
            if (visible) start(); else running = false;
        }).observe(towerCanvas);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) running = false; else start();
        });
        let lastW = window.innerWidth;
        window.addEventListener('resize', () => {
            if (window.innerWidth === lastW) return;
            lastW = window.innerWidth;
            size();
            frame(performance.now());
        });
    }

    // =========================================================
    // ASCII portrait — characters + palette indices only (js/portrait-data.js),
    // re-graded by brightness onto a navy → ice-white ramp.
    // =========================================================
    const P = window.PORTRAIT;
    const canvas = document.querySelector('.portrait-canvas');
    if (P && canvas) {
        const KEY = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        const GLITCH = '#%@&*+=-:;<>?/\\|[]{}01';
        const FONT = '"JetBrains Mono", ui-monospace, Consolas, monospace';
        const TILE = 'rgba(4, 6, 13, 0.82)';
        const dust = P.palette.length - 1;

        const grades = P.palette.map(hex => {
            const n = parseInt(hex.slice(1), 16);
            const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
            const t = Math.min(1, Math.max(0, (lum - 0.12) / 0.8));
            const lo = [40, 62, 170], hi = [236, 244, 255];
            return `rgb(${lo.map((v, i) => Math.round(v + (hi[i] - v) * Math.pow(t, 0.75))).join(',')})`;
        });

        let ctx, geo, cells = [];

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
            geo = {
                cellW, cellH,
                left: (box.width - P.cols * cellW) / 2,
                top: box.height - P.rows * cellH,
                w: box.width, h: box.height,
            };
            ctx.font = `700 ${cellH.toFixed(2)}px ${FONT}`;
            ctx.textBaseline = 'top';

            cells = [];
            for (let r = 0; r < P.rows; r++) {
                for (let c = 0; c < P.cols; c++) {
                    const i = r * P.cols + c;
                    if (P.chars[i] === ' ') continue;
                    const k = KEY.indexOf(P.colors[i]);
                    cells.push({
                        c, r, ch: P.chars[i],
                        colour: k === dust ? 'rgba(216, 230, 255, 0.22)' : grades[k],
                        tile: k !== dust,
                    });
                }
            }
        }

        function draw(progress = 1) {
            ctx.clearRect(0, 0, geo.w, geo.h);
            // "loading" reveal: rows settle from the top down, with some noise
            const front = progress * (P.rows + 24);
            const tiles = new Path2D();
            for (const cell of cells) {
                if (!cell.tile || cell.r >= front) continue;
                tiles.rect(geo.left + cell.c * geo.cellW - 0.3, geo.top + cell.r * geo.cellH - 0.3, geo.cellW + 0.6, geo.cellH + 0.6);
            }
            ctx.fillStyle = TILE;
            ctx.fill(tiles);
            for (const cell of cells) {
                if (cell.r >= front) continue;
                const settled = cell.r + (cell.c * 7 % 13) < front - 12;
                ctx.fillStyle = settled ? cell.colour : '#7d97ff';
                ctx.fillText(settled ? cell.ch : GLITCH[(Math.random() * GLITCH.length) | 0],
                    geo.left + cell.c * geo.cellW, geo.top + cell.r * geo.cellH);
            }
        }

        function loadIn() {
            if (reduceMotion) { draw(1); return; }
            const begin = performance.now();
            const step = now => {
                const p = Math.min(1, (now - begin) / 1800);
                draw(1 - Math.pow(1 - p, 2));
                if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        }

        const startPortrait = () => { layout(); loadIn(); };
        // wait for the mono font so the glyph widths are right, and for the boot screen
        const ready = document.fonts ? document.fonts.load(`700 12px ${FONT}`).catch(() => {}) : Promise.resolve();
        ready.then(() => setTimeout(startPortrait, booting ? 1600 : 0));

        let lastW = window.innerWidth, timer;
        window.addEventListener('resize', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (window.innerWidth === lastW || !geo) return;
                lastW = window.innerWidth;
                layout();
                draw(1);
            }, 150);
        });
    }

    // =========================================================
    // Scroll reveals + current section in the top bar
    // =========================================================
    const reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (!e.isIntersecting) return;
                e.target.classList.add('is-in');
                io.unobserve(e.target);
            });
        }, { rootMargin: '0px 0px -10% 0px' });
        reveals.forEach(el => io.observe(el));

        const links = new Map([...document.querySelectorAll('.bar__nav a')].map(a => [a.hash.slice(1), a]));
        const spy = new IntersectionObserver(entries => {
            entries.forEach(e => {
                const link = links.get(e.target.id);
                if (link) link.classList.toggle('is-current', e.isIntersecting);
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
    } else {
        reveals.forEach(el => el.classList.add('is-in'));
    }

    // =========================================================
    // Copy Discord handle
    // =========================================================
    const toast = document.getElementById('toast');
    let toastTimer;
    function say(msg) {
        toast.textContent = msg;
        toast.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2200);
    }

    document.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const text = btn.dataset.copy;
            const label = btn.querySelector('[data-copy-label]');
            try {
                await navigator.clipboard.writeText(text);
                say(`Saved to clipboard: ${text}`);
                if (label) {
                    label.textContent = 'Copied';
                    setTimeout(() => { label.textContent = 'Copy'; }, 1800);
                }
            } catch {
                say(`Discord: ${text}`);
            }
        });
    });
})();
