(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- Torn paper edge on the red band ----------
    // A seeded random so the tear looks the same on every visit.
    function seeded(seed) {
        return () => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        };
    }

    const band = document.querySelector('.cover-band');
    let edge = [];           // [[xPx, yPx], ...] along the top of the band

    function tear(el, seed, depth) {
        const rand = seeded(seed);
        const width = el.getBoundingClientRect().width || window.innerWidth;
        // tear depth and tooth size scale down on narrow screens
        depth = Math.min(depth, 18 + width * 0.025);
        const pts = [];
        edge = [];
        let px = 0;
        while (px < width) {
            const x = px / width * 100;
            const wave = Math.sin(x / 9) * depth * 0.35 + Math.sin(x / 3.1) * depth * 0.12;
            const y = Math.max(0, depth * 0.45 + wave + (rand() - 0.5) * depth * 0.7);
            pts.push(`${x.toFixed(2)}% ${y.toFixed(1)}px`);
            edge.push([px, y]);
            px += 5 + rand() * 18;
        }
        edge.push([width, depth * 0.4]);
        pts.push(`100% ${(depth * 0.4).toFixed(1)}px`, '100% 100%', '0% 100%');
        el.style.clipPath = `polygon(${pts.join(',')})`;
    }

    // y (in viewport pixels) where the red band starts at a given x
    function bandTopAt(clientX) {
        const r = band.getBoundingClientRect();
        const x = clientX - r.left;
        let y = edge.length ? edge[edge.length - 1][1] : 0;
        for (let i = 1; i < edge.length; i++) {
            if (edge[i][0] >= x) {
                const [x0, y0] = edge[i - 1], [x1, y1] = edge[i];
                y = y0 + (y1 - y0) * ((x - x0) / Math.max(1, x1 - x0));
                break;
            }
        }
        return r.top + y;
    }

    if (band) tear(band, 7, 46);

    // ---------- Colour ASCII portrait ----------
    // The portrait ships as characters + palette indices only (js/portrait-data.js).
    const P = window.PORTRAIT;
    const portrait = document.getElementById('portrait');
    const canvas = portrait && portrait.querySelector('.portrait-canvas');
    const KEY = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const GLITCH = '#%@&*+=-:;<>?/\\|[]{}01';
    const FONT = '"JetBrains Mono", ui-monospace, Consolas, monospace';

    let cells = [];          // { c, r, ch, colour, glitchUntil }
    let geo = null;          // { cellW, cellH, top, w, h }
    let ctx = null;

    function layout() {
        const box = portrait.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(box.width * dpr);
        canvas.height = Math.round(box.height * dpr);
        ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const cellW = box.width / P.cols;
        const cellH = cellW / 0.6;
        const top = box.height - P.rows * cellH;     // figure sits on the bottom edge
        geo = { cellW, cellH, top, w: box.width, h: box.height };
        ctx.font = `700 ${cellH.toFixed(2)}px ${FONT}`;
        ctx.textBaseline = 'top';

        cells = [];
        for (let r = 0; r < P.rows; r++) {
            for (let c = 0; c < P.cols; c++) {
                const i = r * P.cols + c;
                const ch = P.chars[i];
                if (ch === ' ') continue;
                const k = KEY.indexOf(P.colors[i]);
                const x = box.left + (c + 0.5) * cellW;
                const y = box.top + top + (r + 0.5) * cellH;
                const onBand = band && y > bandTopAt(x);
                const dust = k === P.palette.length - 1;
                cells.push({
                    c, r, ch,
                    colour: P.palette[k],
                    // the figure is an ink silhouette (same ink as the title); on the band it lets a little red through
                    tile: dust ? null : onBand ? 'rgba(21, 19, 18, 0.86)' : 'rgb(21, 19, 18)',
                    glitchUntil: 0,
                });
            }
        }
    }

    function drawTile(cell) {
        if (!cell.tile) return;
        ctx.fillStyle = cell.tile;
        // overlap by a hair so neighbouring tiles join without seams
        ctx.fillRect(cell.c * geo.cellW - 0.3, geo.top + cell.r * geo.cellH - 0.3, geo.cellW + 0.6, geo.cellH + 0.6);
    }

    function drawCell(cell, ch) {
        ctx.fillStyle = cell.colour;
        ctx.fillText(ch, cell.c * geo.cellW, geo.top + cell.r * geo.cellH);
    }

    function drawAll(progress = 1) {
        ctx.clearRect(0, 0, geo.w, geo.h);
        // "printing" reveal: rows settle from the top down, with some noise
        const front = progress * (P.rows + 24);
        // tiles of one colour go into a single path so overlaps don't double up the alpha
        const tiles = new Map();
        for (const cell of cells) {
            if (!cell.tile || cell.r >= front) continue;
            if (!tiles.has(cell.tile)) tiles.set(cell.tile, new Path2D());
            tiles.get(cell.tile).rect(cell.c * geo.cellW - 0.3, geo.top + cell.r * geo.cellH - 0.3, geo.cellW + 0.6, geo.cellH + 0.6);
        }
        tiles.forEach((path, colour) => { ctx.fillStyle = colour; ctx.fill(path); });
        for (const cell of cells) {
            const settled = cell.r + (cell.c * 7 % 13) < front - 12;
            if (settled) drawCell(cell, cell.ch);
            else if (cell.r < front) drawCell(cell, GLITCH[(Math.random() * GLITCH.length) | 0]);
        }
    }

    function printIn() {
        if (reduceMotion) { drawAll(1); return; }
        const start = performance.now();
        const dur = 1400;
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
            const x = cell.c * geo.cellW, y = geo.top + cell.r * geo.cellH;
            ctx.clearRect(x - 0.3, y - 0.3, geo.cellW + 0.6, geo.cellH + 0.6);
            drawTile(cell);
            if (now < cell.glitchUntil) {
                drawCell(cell, GLITCH[(Math.random() * GLITCH.length) | 0]);
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
        const cx = (clientX - box.left) / geo.cellW;
        const cy = (clientY - box.top - geo.top) / geo.cellH;
        const R = 5;
        const now = performance.now();
        for (const cell of cells) {
            const dx = cell.c - cx, dy = (cell.r - cy) * 1.6;
            if (dx * dx + dy * dy < R * R) cell.glitchUntil = now + 120 + Math.random() * 260;
        }
        if (!glitchLoop) glitchLoop = requestAnimationFrame(glitchFrame);
    }

    // Two faint mirrored echoes of the portrait on the red band
    function drawGhosts() {
        const dustKey = KEY[P.palette.length - 1];
        document.querySelectorAll('canvas.ghost').forEach(g => {
            const box = g.getBoundingClientRect();
            if (!box.width) return;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            g.width = Math.round(box.width * dpr);
            g.height = Math.round(box.height * dpr);
            const gx = g.getContext('2d');
            gx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const cw = box.width / P.cols, chh = cw / 0.6;
            const top = box.height - P.rows * chh;
            gx.font = `700 ${chh.toFixed(2)}px ${FONT}`;
            gx.textBaseline = 'top';
            gx.fillStyle = '#000';
            for (let i = 0; i < P.chars.length; i++) {
                const ch = P.chars[i];
                if (ch === ' ' || P.colors[i] === dustKey) continue;
                gx.fillText(ch, (i % P.cols) * cw, top + ((i / P.cols) | 0) * chh);
            }
        });
    }

    async function initPortrait() {
        if (!P || !canvas) return;
        try { await document.fonts.load(`700 12px ${FONT}`); } catch { /* fall back to system mono */ }
        layout();
        printIn();
        drawGhosts();
        if (!reduceMotion) {
            canvas.addEventListener('pointermove', e => scrambleAt(e.clientX, e.clientY));
        }
    }

    initPortrait();

    let resizeTimer;
    let lastW = window.innerWidth;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // phones fire resize when the toolbar hides; only redo layout on real width changes
            if (window.innerWidth === lastW && cells.length) return;
            lastW = window.innerWidth;
            if (band) tear(band, 7, 46);
            if (P && canvas) { layout(); drawAll(1); drawGhosts(); }
        }, 150);
    });

    // ---------- Scroll reveal ----------
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));

    // ---------- Copy Discord name ----------
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
})();
