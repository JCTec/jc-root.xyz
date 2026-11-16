/* jc-root.xyz: ambient root filaments.
   Decoration only: pale threads drift in from the viewport edges, fork once or
   twice, and fade out again. Nothing in the layout or content depends on this
   file, and the canvas is inert (pointer-events: none, aria-hidden).
   The loop stops while the tab is hidden, and prefers-reduced-motion gets a
   single static frame instead of an animation. */
(function () {
    "use strict";

    var canvas = document.querySelector(".roots-canvas");
    if (!canvas || typeof canvas.getContext !== "function") {
        return;
    }
    var ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }

    /* Tuning. Alphas sit low on #0a0a0b, so body copy keeps its full
       contrast; all three were raised by a fifth together (from 0.15, 0.035,
       0.045) so the roots read a little whiter while each generation keeps
       its share. See MASK_MAX for the extra quieting behind text. */
    var STROKE = "214, 224, 216";
    var BASE_ALPHA = 0.18;
    var GEN_FALLOFF = 0.042;
    var MIN_ALPHA = 0.054;
    var MAX_FILAMENTS = 120;
    var MAX_DPR = 2;
    var STEP_MS = 1000 / 30;   /* growth is wall-clock paced, not frame paced */
    var MAX_STEPS_PER_FRAME = 4;
    var FADE_IN_STEPS = 34;
    var DECAY_STEPS = 80;
    var EDGE_PAD = 40;
    var COLUMN = 768;          /* .page-col max-width plus its inline padding */
    var MASK_MAX = 0.6;        /* share of alpha removed dead-centre */
    var NARROW_DAMP = 0.45;    /* flat scrim when there is no margin to trade */
    var SPAWN_REF_AREA = 1440 * 900;

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var filaments = [];
    var columnMask = null;
    var W = 0;
    var H = 0;
    var dpr = 1;
    var rafId = 0;
    var lastTime = 0;
    var accumulator = 0;
    var nextSpawnAt = 0;
    var staticFrame = false;
    var resizePending = false;
    var spawnScale = 1;

    /* Cheap LCG. Statistical quality is irrelevant for drifting lines; not
       allocating and not calling into crypto every step is not. */
    var seed = Date.now() % 233280;
    function rand() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    }

    /* ---- geometry ---------------------------------------------------- */

    function applySize() {
        dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        /* Resizing the bitmap resets all context state, so re-apply it here. */
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        /* Spawning is wall-clock paced, so without this a phone would get the
           same number of filaments as a desktop in a third of the area. */
        spawnScale = Math.max(0.75, Math.min(2.5, Math.sqrt(SPAWN_REF_AREA / Math.max(W * H, 1))));
        buildMask();
    }

    /* Quiet the filaments directly behind the centred text column and let them
       read a little more in the open margins. Where the viewport is narrow
       enough that the column *is* the page there is no margin to trade, so
       damp the whole field evenly rather than shaping it. */
    function buildMask() {
        var margin = (W - COLUMN) / 2;
        if (margin < 90) {
            columnMask = "rgba(0, 0, 0, " + NARROW_DAMP + ")";
            return;
        }
        var strength = Math.min(margin / 260, 1) * MASK_MAX;
        var edge = margin / W;
        var gradient = ctx.createLinearGradient(0, 0, W, 0);
        gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
        gradient.addColorStop(edge, "rgba(0, 0, 0, 0)");
        gradient.addColorStop(0.5, "rgba(0, 0, 0, " + strength.toFixed(3) + ")");
        gradient.addColorStop(1 - edge, "rgba(0, 0, 0, 0)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        columnMask = gradient;
    }

    /* ---- filaments --------------------------------------------------- */

    function spawn(gen, x, y, heading, energy, width) {
        if (filaments.length >= MAX_FILAMENTS) {
            return;
        }
        filaments.push({
            xs: [x],
            ys: [y],
            x: x,
            y: y,
            heading: heading,
            seedA: rand() * 10,
            seedB: rand() * 10,
            stepLen: 1.6 + rand() * 0.7,
            energy: energy,
            steps: 0,
            gen: gen,
            width: width,
            growing: true,
            decay: 0,
            forkAt: 45 + rand() * 90,
            forked: false
        });
    }

    function spawnFromEdge() {
        var edge = Math.floor(rand() * 4);
        var inset = 6;
        var x;
        var y;
        var heading;
        if (edge === 0) {
            x = -inset; y = rand() * H; heading = 0;
        } else if (edge === 1) {
            x = W + inset; y = rand() * H; heading = Math.PI;
        } else if (edge === 2) {
            x = rand() * W; y = -inset; heading = Math.PI / 2;
        } else {
            x = rand() * W; y = H + inset; heading = -Math.PI / 2;
        }
        /* Spread the inward heading so no filament aims at a common centre. */
        heading += (rand() - 0.5) * 1.1;
        spawn(0, x, y, heading, 180 + rand() * 160, 1 + rand() * 0.6);
    }

    function advance(f) {
        if (!f.growing) {
            f.decay++;
            return;
        }
        if (f.steps >= f.energy) {
            f.growing = false;
            return;
        }

        /* Two slow sines of different periods: organic wander, no cycle the
           eye can lock onto. */
        var drift = Math.sin(f.steps * 0.045 + f.seedA) * 0.5 +
                    Math.sin(f.steps * 0.017 + f.seedB) * 0.5;
        f.heading += drift * 0.05;
        f.x += Math.cos(f.heading) * f.stepLen;
        f.y += Math.sin(f.heading) * f.stepLen;
        f.xs.push(f.x);
        f.ys.push(f.y);
        f.steps++;

        if (!f.forked && f.gen < 3 && f.steps >= f.forkAt && f.energy - f.steps > 40) {
            f.forked = true;
            var side = rand() < 0.5 ? -1 : 1;
            spawn(
                f.gen + 1,
                f.x,
                f.y,
                f.heading + side * (0.3 + rand() * 0.35),
                (f.energy - f.steps) * 0.75,
                f.width * 0.62
            );
        }

        if (f.x < -EDGE_PAD || f.x > W + EDGE_PAD || f.y < -EDGE_PAD || f.y > H + EDGE_PAD) {
            f.growing = false;
        }
    }

    function step() {
        /* Snapshot the length so forks born this step wait for the next one. */
        var n = filaments.length;
        var i;
        for (i = 0; i < n; i++) {
            advance(filaments[i]);
        }
        var kept = [];
        for (i = 0; i < filaments.length; i++) {
            if (filaments[i].growing || filaments[i].decay < DECAY_STEPS) {
                kept.push(filaments[i]);
            }
        }
        /* Hard ceiling on top of the natural life cycle, so a page left open
           for hours can never accumulate filaments without bound. */
        if (kept.length > MAX_FILAMENTS) {
            kept = kept.slice(kept.length - MAX_FILAMENTS);
        }
        filaments = kept;
    }

    /* ---- drawing ----------------------------------------------------- */

    function alphaFor(f) {
        var a = BASE_ALPHA - f.gen * GEN_FALLOFF;
        if (a < MIN_ALPHA) {
            a = MIN_ALPHA;
        }
        if (staticFrame) {
            return a;
        }
        if (f.steps < FADE_IN_STEPS) {
            a *= f.steps / FADE_IN_STEPS;
        }
        if (!f.growing) {
            a *= 1 - f.decay / DECAY_STEPS;
        }
        return a > 0 ? a : 0;
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        for (var i = 0; i < filaments.length; i++) {
            var f = filaments[i];
            if (f.xs.length < 2) {
                continue;
            }
            var a = alphaFor(f);
            if (a <= 0.004) {
                continue;
            }
            ctx.beginPath();
            ctx.moveTo(f.xs[0], f.ys[0]);
            for (var j = 1; j < f.xs.length; j++) {
                ctx.lineTo(f.xs[j], f.ys[j]);
            }
            ctx.strokeStyle = "rgba(" + STROKE + ", " + a.toFixed(3) + ")";
            ctx.lineWidth = f.width;
            ctx.stroke();
        }
        if (columnMask) {
            ctx.globalCompositeOperation = "destination-out";
            ctx.fillStyle = columnMask;
            ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = "source-over";
        }
    }

    /* ---- loop -------------------------------------------------------- */

    function frame(now) {
        rafId = 0;
        if (lastTime === 0) {
            lastTime = now;
            nextSpawnAt = now + 240;
        }
        var dt = now - lastTime;
        lastTime = now;
        accumulator += dt;

        var steps = Math.floor(accumulator / STEP_MS);
        if (steps > MAX_STEPS_PER_FRAME) {
            /* A long stall (throttled tab, blocked main thread) must not be
               replayed at speed; drop the backlog instead of banking it. */
            steps = MAX_STEPS_PER_FRAME;
            accumulator = 0;
        } else {
            accumulator -= steps * STEP_MS;
        }

        while (steps > 0) {
            step();
            steps--;
        }
        if (now >= nextSpawnAt) {
            spawnFromEdge();
            nextSpawnAt = now + (520 + rand() * 900) * spawnScale;
        }

        draw();
        schedule();
    }

    function schedule() {
        if (rafId === 0 && !staticFrame && document.visibilityState === "visible") {
            rafId = window.requestAnimationFrame(frame);
        }
    }

    function stop() {
        if (rafId !== 0) {
            window.cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    /* Grow a scene without animating it, then paint it once. */
    function renderStatic() {
        filaments = [];
        for (var i = 0; i < 9; i++) {
            spawnFromEdge();
        }
        for (var s = 0; s < 150; s++) {
            step();
        }
        draw();
    }

    function start() {
        applySize();
        staticFrame = reduceMotion.matches;
        if (staticFrame) {
            stop();
            renderStatic();
            return;
        }
        filaments = [];
        lastTime = 0;
        accumulator = 0;
        nextSpawnAt = 0;
        schedule();
    }

    /* ---- wiring ------------------------------------------------------ */

    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            lastTime = 0;   /* resync the clock so nothing fast-forwards */
            schedule();
        } else {
            stop();
        }
    });

    /* Coalesced to one resize per frame: reallocating the bitmap is the
       expensive part, and dragging a window edge fires far more often. */
    window.addEventListener("resize", function () {
        if (resizePending) {
            return;
        }
        resizePending = true;
        window.requestAnimationFrame(function () {
            resizePending = false;
            if (window.innerWidth === W && window.innerHeight === H) {
                return;
            }
            applySize();
            if (staticFrame) {
                renderStatic();
            }
            /* Live filaments keep their CSS-pixel coordinates, so the next
               frame simply redraws them against the new bounds; nothing is
               stretched, and off-screen ones age out on their own. */
        });
    });

    if (typeof reduceMotion.addEventListener === "function") {
        reduceMotion.addEventListener("change", start);
    }

    start();
})();
