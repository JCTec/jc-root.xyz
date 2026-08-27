#!/usr/bin/env node
/* jc-root.xyz — the checks that need a real browser.
 *
 * `node --test` can assert what the build emits. It cannot compute layout,
 * run requestAnimationFrame, resolve a focus ring, or model a visitor whose
 * browser still holds yesterday's stylesheet. Everything here needs an engine.
 *
 * Usage:  node build.mjs
 *         node scripts/serve.mjs dist 8080     (in another shell)
 *         node scripts/browser-check.mjs
 *
 * Env:    BASE_URL   default http://127.0.0.1:8080
 *         CHROME     path to a Chrome/Chromium binary
 *
 * Requires Node 22+ (global WebSocket) and a local Chrome. Exits non-zero on
 * the first failing check, so it works as a pre-deploy gate.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8080";
const PORT = 9333;
const CHROME_CANDIDATES = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- tiny CDP client ------------------------------------------------- */

class Page {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        this.consoleErrors = [];
        ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (m.id && this.pending.has(m.id)) {
                const { resolve, reject } = this.pending.get(m.id);
                this.pending.delete(m.id);
                m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
                return;
            }
            if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
                this.consoleErrors.push(m.params.entry.text);
            }
            if (m.method === "Runtime.exceptionThrown") {
                const d = m.params.exceptionDetails;
                this.consoleErrors.push(d.exception?.description || d.text);
            }
            if (m.method === "Fetch.requestPaused") this.onPaused?.(m.params);
        };
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.id;
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    /** Evaluate in the page and return the value, surfacing page-side throws. */
    async eval(expression) {
        const r = await this.send("Runtime.evaluate", {
            expression, returnByValue: true, awaitPromise: true,
        });
        if (r.exceptionDetails) {
            throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        }
        return r.result.value;
    }

    async load(path = "/", { settle = 2500 } = {}) {
        this.consoleErrors = [];
        await this.send("Page.navigate", { url: BASE_URL + path });
        await sleep(settle);
    }
}

async function connect(browserPort) {
    for (let i = 0; i < 80; i++) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json();
            const target = list.find((t) => t.type === "page");
            if (target) {
                const ws = new WebSocket(target.webSocketDebuggerUrl);
                await new Promise((r) => (ws.onopen = r));
                const page = new Page(ws);
                await page.send("Page.enable");
                await page.send("Runtime.enable");
                await page.send("Log.enable");
                await page.send("Network.enable");
                return page;
            }
        } catch { /* not up yet */ }
        await sleep(250);
    }
    throw new Error("Chrome never exposed a debuggable page");
}

/* ---- check harness ---------------------------------------------------- */

const results = [];
async function check(name, fn) {
    try {
        const detail = await fn();
        results.push({ name, ok: true, detail });
        console.log(`  \x1b[32m✔\x1b[0m ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
    } catch (err) {
        results.push({ name, ok: false, detail: err.message });
        console.log(`  \x1b[31m✘\x1b[0m ${name}\n      ${err.message}`);
    }
}
function assert(condition, message) {
    if (!condition) throw new Error(message);
}

/* ---- the page-side probes --------------------------------------------- */

/** Geometry that must hold no matter which revision of the CSS is in force. */
const STRUCTURE = `(function () {
    var canvas = document.querySelector("canvas[aria-hidden=true]");
    var hero = document.querySelector(".hero");
    var nav = document.querySelector(".site-nav");
    return {
        canvasPosition: canvas ? getComputedStyle(canvas).position : "absent",
        canvasPointerEvents: canvas ? getComputedStyle(canvas).pointerEvents : "absent",
        canvasZIndex: canvas ? getComputedStyle(canvas).zIndex : "absent",
        heroTop: hero ? Math.round(hero.getBoundingClientRect().top + scrollY) : -1,
        navTop: nav ? Math.round(nav.getBoundingClientRect().top) : -1,
        docHeight: document.documentElement.scrollHeight,
        overflowsHorizontally: document.documentElement.scrollWidth > innerWidth + 1,
        viewportHeight: innerHeight
    };
})()`;

/** Contrast of each interactive element's focus ring against the page. */
const FOCUS = `(function () {
    function channel(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    function lum(rgb) { return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]); }
    function parse(c) { var m = c.match(/\\d+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; }
    function ratio(a, b) {
        var l1 = lum(a), l2 = lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
    }
    var bg = parse(getComputedStyle(document.body).backgroundColor);
    var seen = [], worst = null;
    document.querySelectorAll("a[href], button, input:not([type=hidden]), textarea, select").forEach(function (el) {
        if (el.classList.contains("honey") || el.offsetParent === null && el.className !== "skip-link") return;
        el.focus();
        var s = getComputedStyle(el);
        var visible = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
        var contrast = visible ? ratio(parse(s.outlineColor), bg) : 0;
        seen.push({ el: el.tagName.toLowerCase() + "." + (el.className || "").split(" ")[0], visible: visible, contrast: contrast });
        if (!worst || contrast < worst.contrast) worst = seen[seen.length - 1];
        el.blur();
    });
    return { count: seen.length, worst: worst, allVisible: seen.every(function (s) { return s.visible; }) };
})()`;

/** Count frame callbacks the page schedules over a window. */
const countFrames = (ms) => `(function () {
    var n = 0, original = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) { n++; return original.call(window, cb); };
    return new Promise(function (resolve) {
        setTimeout(function () { window.requestAnimationFrame = original; resolve(n); }, ${ms});
    });
})()`;

/** Hash of the canvas pixels, to tell a still frame from an animating one. */
const CANVAS_HASH = `(function () {
    var c = document.querySelector("canvas[aria-hidden=true]");
    if (!c) return 0;
    var d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    var h = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i]) h = (h * 31 + d[i] + i) >>> 0;
    return h;
})()`;

/* ---- main -------------------------------------------------------------- */

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
    console.error("No Chrome found. Set CHROME=/path/to/chrome");
    process.exit(2);
}
try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
} catch {
    console.error(`No server at ${BASE_URL}. Start it with: node scripts/serve.mjs dist 8080`);
    process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), "jc-browser-check-"));
const proc = spawn(chrome, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--window-size=1440,900", "about:blank",
], { stdio: "ignore" });

let page;
try {
    page = await connect(PORT);
    await page.send("Emulation.setDeviceMetricsOverride", {
        width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });

    console.log(`\nbrowser-check → ${BASE_URL}\n`);

    /* Fresh load: the state a first-time visitor gets. */
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.load("/");

    await check("page loads with no console errors or CSP violations", () => {
        assert(page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
    });

    const fresh = await page.eval(STRUCTURE);
    await check("decorative canvas is out of flow, inert and behind content", () => {
        assert(fresh.canvasPosition === "fixed", `position is ${fresh.canvasPosition}`);
        assert(fresh.canvasPointerEvents === "none", `pointer-events is ${fresh.canvasPointerEvents}`);
        assert(Number(fresh.canvasZIndex) < 0, `z-index is ${fresh.canvasZIndex}`);
        assert(!fresh.overflowsHorizontally, "page scrolls horizontally");
        assert(fresh.navTop === 0, `nav is ${fresh.navTop}px from the top`);
    });

    /* The check this suite exists for.
     *
     * Markup is served no-cache; CSS and JS are cached for a day under a
     * ?v=ASSET_VERSION that only CI ever changes. A returning visitor can
     * therefore run today's markup against yesterday's assets. Replay that
     * combination: serve the last committed CSS/JS with the working-tree
     * markup and require the page to still be structurally sound.
     */
    const previous = {};
    for (const path of ["site/public/css/site.css", "site/public/js/app.js"]) {
        try {
            previous[path.split("/").pop()] = execFileSync("git", ["show", `HEAD:${path}`],
                { stdio: ["ignore", "pipe", "ignore"] });
        } catch { /* new file, nothing cached to go stale */ }
    }
    page.onPaused = async ({ requestId, request }) => {
        const name = request.url.split("?")[0].split("/").pop();
        if (previous[name]) {
            await page.send("Fetch.fulfillRequest", {
                requestId, responseCode: 200,
                responseHeaders: [{ name: "Content-Type", value: name.endsWith(".css") ? "text/css" : "application/javascript" }],
                body: previous[name].toString("base64"),
            });
        } else {
            await page.send("Fetch.continueRequest", { requestId });
        }
    };
    await page.send("Fetch.enable", { patterns: [{ urlPattern: "*/css/*" }, { urlPattern: "*/js/*" }] });
    await page.load("/");
    const stale = await page.eval(STRUCTURE);
    await page.send("Fetch.disable");
    page.onPaused = null;

    await check("survives a returning visitor's stale CSS/JS (today's markup, HEAD's assets)", () => {
        assert(stale.canvasPosition === "fixed",
            `canvas fell into normal flow (position: ${stale.canvasPosition}) — its layout depends on a separately cached file`);
        assert(stale.canvasPointerEvents === "none", `canvas became interactive (${stale.canvasPointerEvents})`);
        assert(stale.heroTop < stale.viewportHeight,
            `hero pushed to ${stale.heroTop}px, below the fold — something new is taking up layout space`);
        assert(!stale.overflowsHorizontally, "page scrolls horizontally with stale assets");
        return `hero at ${stale.heroTop}px, doc ${stale.docHeight}px`;
    });

    /* Focus visibility. */
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.load("/");
    await page.send("Page.bringToFront");
    const focus = await page.eval(FOCUS);
    await check("every interactive element has a focus ring at 3:1 or better", () => {
        assert(focus.count > 5, `only found ${focus.count} interactive elements`);
        assert(focus.allVisible, `${focus.worst.el} has no visible focus ring`);
        assert(focus.worst.contrast >= 3,
            `${focus.worst.el} ring is ${focus.worst.contrast.toFixed(2)}:1, WCAG 2.4.11 wants 3:1`);
        return `${focus.count} elements, worst ${focus.worst.contrast.toFixed(2)}:1`;
    });

    /* The animation must yield the CPU when nothing is watching. */
    await check("animation stops while the tab is hidden", async () => {
        await page.eval(`window.__vs = "visible";
            Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return window.__vs } });
            window.__vs = "hidden"; document.dispatchEvent(new Event("visibilitychange")); "ok"`);
        await sleep(400);
        const frames = await page.eval(countFrames(1200));
        assert(frames === 0, `${frames} frame callbacks scheduled while hidden`);
        await page.eval(`window.__vs = "visible"; document.dispatchEvent(new Event("visibilitychange")); "ok"`);
        await sleep(800);
        const a = await page.eval(CANVAS_HASH);
        await sleep(900);
        assert(a !== (await page.eval(CANVAS_HASH)), "animation did not resume when the tab became visible");
    });

    /* prefers-reduced-motion must be a still frame, not a slow one. */
    await check("prefers-reduced-motion renders one static frame and schedules no animation", async () => {
        await page.send("Emulation.setEmulatedMedia", {
            features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await page.load("/", { settle: 3000 });
        const first = await page.eval(CANVAS_HASH);
        const frames = await page.eval(countFrames(1500));
        const second = await page.eval(CANVAS_HASH);
        assert(first === second, "canvas changed between samples — it is still animating");
        assert(frames === 0, `${frames} frame callbacks scheduled under reduced motion`);
        await page.send("Emulation.setEmulatedMedia", { features: [] });
    });

    /* Canvas bitmap must track the viewport across resizes, DPR capped. */
    await check("canvas bitmap tracks the viewport across resizes", async () => {
        await page.load("/");
        const seen = [];
        for (const [width, height, dsf] of [[900, 700, 1], [1920, 1080, 2], [390, 844, 3]]) {
            await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dsf, mobile: false });
            await sleep(1200);
            const box = await page.eval(`(function () {
                var c = document.querySelector("canvas[aria-hidden=true]");
                var r = c.getBoundingClientRect();
                var capped = Math.min(devicePixelRatio, 2);
                return { ok: c.width === Math.round(innerWidth * capped) && c.height === Math.round(innerHeight * capped)
                              && Math.round(r.width) === innerWidth && Math.round(r.height) === innerHeight,
                         got: c.width + "x" + c.height, want: Math.round(innerWidth * capped) + "x" + Math.round(innerHeight * capped) };
            })()`);
            assert(box.ok, `at ${width}x${height}@${dsf}x bitmap is ${box.got}, expected ${box.want}`);
            seen.push(`${width}x${height}@${dsf}x`);
        }
        await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
        return seen.join(", ");
    });

    /* A submit lock the back button cannot clear is a dead form. */
    await check("contact form submit lock releases on a restored page", async () => {
        await page.load("/");
        await page.eval(`(function () {
            var f = document.querySelector(".contact-form");
            f.querySelector("#cf-name").value = "a";
            f.querySelector("#cf-email").value = "a@b.co";
            f.querySelector("#cf-message").value = "hi";
            f.addEventListener("submit", function (e) { e.preventDefault() });
            f.requestSubmit();
        })()`);
        await sleep(300);
        assert(await page.eval(`document.querySelector(".contact-form button[type=submit]").disabled`),
            "submitting did not lock the button");
        await page.eval(`window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); "ok"`);
        await sleep(200);
        assert((await page.eval(`document.querySelector(".contact-form button[type=submit]").disabled`)) === false,
            "button is still disabled after a restored pageshow — the form is dead on back-navigation");
    });

    /* The one behaviour that moved from the server into JavaScript when the
       site went static. The server rendered the confirmation only for a
       request carrying ?sent=1; now every copy of the page carries it hidden
       and app.js reveals it. Both halves of that are worth checking, because
       a page that shows the confirmation to everyone is worse than one that
       never shows it at all. */
    await check("the sent confirmation is hidden by default and revealed by ?sent=1", async () => {
        await page.load("/");
        const fresh = await page.eval(`(function () {
            var n = document.querySelector(".form-sent");
            return { present: !!n, visible: !!n && n.offsetParent !== null };
        })()`);
        assert(fresh.present, "the confirmation is not in the markup at all");
        assert(!fresh.visible, "the confirmation is visible on a page nobody submitted");

        await page.load("/?sent=1");
        const sent = await page.eval(`(function () {
            var n = document.querySelector(".form-sent");
            return { visible: !!n && n.offsetParent !== null, text: n ? n.textContent.trim() : "" };
        })()`);
        assert(sent.visible, "?sent=1 did not reveal the confirmation");
        assert(sent.text.length > 0, "the confirmation is visible but empty");
        return `"${sent.text.slice(0, 40)}…"`;
    });

} finally {
    try { page?.ws.close(); } catch { /* already gone */ }
    proc.kill();
    // Chrome keeps writing to its profile for a moment after SIGTERM; removing
    // it too early races that. Wait for exit, then clean up best-effort — a
    // leftover temp directory must never fail the run.
    await new Promise((resolve) => {
        const done = setTimeout(resolve, 3000);
        proc.once("exit", () => { clearTimeout(done); resolve(); });
    });
    try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch { /* best effort */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length ? 1 : 0);
