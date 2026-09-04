/* Invariants about the markup the build actually emits, and about the
   directory it hands to GitHub Pages.
 *
 * A port of Tests/AppTests/RenderedPageTests.swift plus the page-level
 * assertions from AppTests.swift. Every failure these describe has already
 * happened once: an asset that is referenced but not deployed, an inline
 * script the CSP forbids, and an element whose layout lived only in a
 * stylesheet cached separately from the markup that needs it.
 *
 * The header and redirect suites have no counterpart here — there is no
 * server left to assert them against. What replaced them is the CSP meta tag
 * test below, and the Cloudflare rules recorded in README.md.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { build } from "../build.mjs";
import { cachePolicyForPath } from "../lib/cache-policy.mjs";
import { loadConfig, UNSET_ENDPOINT } from "../lib/content.mjs";
import { CSP_META, REFERRER_POLICY } from "../lib/headers.mjs";
import { loadCatalog } from "../lib/strings.mjs";
import { STRINGS_DIR } from "../build.mjs";

let outDir;
let en;
let es;

before(() => {
    outDir = mkdtempSync(join(tmpdir(), "jc-root-build-"));
    // An explicit environment, so the suite asserts the defaults rather than
    // whatever the shell that ran it happened to export.
    build(outDir, { env: {} });
    en = readFileSync(join(outDir, "index.html"), "utf8");
    es = readFileSync(join(outDir, "es", "index.html"), "utf8");
});

after(() => rmSync(outDir, { recursive: true, force: true }));

/** Markup with HTML comments removed.

    Tests that scan for tags must not read commented-out markup: a comment is a
    legitimate place to *mention* a tag — a note explaining that inline
    <script> is forbidden, say — without the page containing one. */
function strippingComments(html) {
    return html.replace(/<!--[\s\S]*?-->/g, "");
}

/** Same-origin asset URLs the page tells the browser to fetch. Routes and
    in-page anchors are excluded: only paths with a file extension are assets. */
function assetReferences(rawHTML) {
    const html = strippingComments(rawHTML);
    return [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)]
        .map((m) => m[1])
        .filter((ref) => /\.[a-z0-9]+$/i.test(ref.split("?")[0]));
}

test("Both locales are published, each with its own lang and copy", () => {
    assert.ok(en.includes('lang="en"'));
    assert.ok(en.includes('hreflang="es"'));
    assert.ok(es.includes('lang="es"'));

    // No English leaking into /es/.
    const catalog = loadCatalog(STRINGS_DIR);
    assert.ok(es.includes(catalog.es.work_heading));
    assert.ok(!es.includes(catalog.en.work_heading));
});

/* The one asset `build.mjs` cannot produce. Rendering the CV needs WeasyPrint,
   which is Python and lives only in CI, so the PDF is copied into dist/ there
   rather than written here. The invariant is not weakened, only split in two:
   `The file CI publishes is the file the site links to` in cv.test.mjs reads
   the workflow and asserts that copy exists and lands under exactly this name.
   Anything else the page references must still be in the output. */
const SUPPLIED_BY_CI = new Set([loadConfig({ publicDirectory: null, env: {} }).cvPath]);

test("Every asset the page references is actually in the output", () => {
    const refs = assetReferences(en);
    // Guard the regex itself: a page that suddenly references nothing would
    // make every assertion below vacuous.
    assert.ok(refs.length >= 5, `expected several asset references, found ${refs.length}`);

    for (const ref of refs) {
        const path = ref.split("?")[0];
        if (SUPPLIED_BY_CI.has(path)) continue;
        assert.ok(
            existsSync(join(outDir, path)),
            `page references ${ref} but ${path} is not in the output`,
        );
    }
});

test("Long-cached assets are always referenced with a ?v= buster", () => {
    for (const ref of assetReferences(en)) {
        const path = ref.split("?")[0];
        const policy = cachePolicyForPath(path);
        if (!policy.includes("max-age=86400") && !policy.includes("immutable")) continue;
        assert.ok(
            ref.includes("?v="),
            `${path} is served ${policy} but referenced without a cache buster`,
        );
    }
});

test("No inline executable <script> — the CSP is script-src 'self'", () => {
    const html = strippingComments(en);
    const matches = [...html.matchAll(/<script([^>]*)>/g)];
    assert.ok(matches.length > 0, "expected the page to carry <script> tags");

    for (const [, attributes] of matches) {
        // A src'd script is fetched from 'self'. A ld+json block is a data
        // block, never executed. Anything else is inline JS and the browser
        // will refuse to run it.
        const allowed = attributes.includes("src=") || attributes.includes("application/ld+json");
        assert.ok(allowed, `inline <script${attributes}> would be blocked by the CSP`);
    }
});

test("Decorative canvases carry their layout inline, not in a cached stylesheet", () => {
    const html = strippingComments(en);
    const matches = [...html.matchAll(/<canvas([^>]*)>/g)];
    assert.ok(matches.length > 0, "expected the background canvas in the markup");

    for (const [, attributes] of matches) {
        const style = attributes.replace(/\s/g, "");
        assert.ok(
            style.includes("position:fixed") || style.includes("position:absolute"),
            "the canvas must declare position inline; a stale stylesheet would leave it in flow",
        );
        assert.ok(
            style.includes("pointer-events:none"),
            "the canvas must be inert inline; a stale stylesheet would let it swallow clicks",
        );
        assert.ok(
            attributes.includes('aria-hidden="true"'),
            "the canvas is decoration and must be hidden from assistive tech",
        );
    }
});

test("The policy the origin cannot send travels in the markup instead", () => {
    for (const html of [en, es]) {
        const csp = html.match(
            /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/,
        );
        assert.ok(csp, "no CSP meta tag");
        // Entity-decoded, it is exactly the policy lib/headers.mjs defines.
        assert.equal(csp[1].replaceAll("&#39;", "'"), CSP_META);
        assert.ok(html.includes(`<meta name="referrer" content="${REFERRER_POLICY}">`));
    }
});

test("The confirmation ships hidden, so the no-JS page is correct", () => {
    const catalog = loadCatalog(STRINGS_DIR);
    for (const [locale, html] of [["en", en], ["es", es]]) {
        const note = html.match(/<p class="form-sent"([^>]*)>([^<]*)<\/p>/);
        assert.ok(note, `no .form-sent paragraph on ${locale}`);
        assert.ok(note[1].includes("hidden"), ".form-sent must ship hidden");
        assert.ok(note[2].length > 0);
        // The copy is in the catalog, not in JS.
        assert.ok(catalog[locale].form_sent.length > 0);
    }
    // ...and the form sends the visitor back to the page that carries it.
    assert.ok(en.includes('name="_next" value="https://jc-root.xyz/?sent=1"'));
    assert.ok(es.includes('name="_next" value="https://jc-root.xyz/es/?sent=1"'));
});

test("JSON-LD parses, in both locales, with nothing HTML-escaped into it", () => {
    for (const [locale, html] of [["en", en], ["es", es]]) {
        const block = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
        assert.ok(block, `no JSON-LD block on ${locale}`);
        const body = block[1];
        assert.ok(!body.includes("&amp;"));
        assert.ok(!body.includes("&#39;"));
        assert.ok(!body.includes("&quot;"));

        const json = JSON.parse(body);
        assert.equal(json["@type"], "Person");
        assert.ok(json.name.length > 0);
        assert.equal(json.sameAs.length, 3);
    }
});

test("Discovery surfaces agree with the pages that were emitted", () => {
    const robots = readFileSync(join(outDir, "robots.txt"), "utf8");
    assert.ok(robots.includes("Sitemap: https://jc-root.xyz/sitemap.xml"));

    const sitemap = readFileSync(join(outDir, "sitemap.xml"), "utf8");
    assert.ok(sitemap.includes('hreflang="es"'));
    assert.ok(sitemap.includes("<loc>https://jc-root.xyz/</loc>"));
    assert.ok(sitemap.includes("<loc>https://jc-root.xyz/es/</loc>"));
    // Every URL the sitemap lists is a page the build actually wrote.
    for (const [, loc] of sitemap.matchAll(/<loc>https:\/\/jc-root\.xyz(\/[^<]*)<\/loc>/g)) {
        assert.ok(existsSync(join(outDir, loc, "index.html")), `sitemap lists ${loc}, not built`);
    }

    assert.ok(existsSync(join(outDir, "llms.txt")));
});

test("An unconfigured form names the missing variable, not a destination", () => {
    // Built with no environment, the action is a placeholder that is obviously
    // not a form target. CI refuses to publish it — a form that silently posts
    // nowhere looks fine until someone tries to use it.
    assert.ok(en.includes(UNSET_ENDPOINT), "expected the placeholder endpoint");
});

test("The output carries what GitHub Pages needs to serve it", () => {
    // Without CNAME the custom domain is dropped on the next deploy; without
    // .nojekyll, Pages runs the output through Jekyll and eats anything
    // beginning with an underscore.
    assert.equal(readFileSync(join(outDir, "CNAME"), "utf8").trim(), "jc-root.xyz");
    assert.ok(existsSync(join(outDir, ".nojekyll")));

    // ...except while previewing, when claiming the domain would redirect the
    // preview URL to a host that still points somewhere else.
    const preview = mkdtempSync(join(tmpdir(), "jc-root-preview-"));
    try {
        build(preview, { env: { PAGES_PREVIEW: "1" } });
        assert.ok(!existsSync(join(preview, "CNAME")), "a preview build claimed the domain");
        assert.ok(existsSync(join(preview, "index.html")));
        assert.ok(existsSync(join(preview, ".nojekyll")));
    } finally {
        rmSync(preview, { recursive: true, force: true });
    }
});
