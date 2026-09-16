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
import { cvPathFor } from "../lib/cv-content.mjs";
import { CSP_META, REFERRER_POLICY } from "../lib/headers.mjs";
import { homePath, loadCatalog, LOCALES } from "../lib/strings.mjs";
import { STRINGS_DIR } from "../build.mjs";

let outDir;
/** Rendered markup by locale, in LOCALES order. */
let pages;
/** The default locale's page: the one the locale-agnostic checks read. */
let en;

before(() => {
    outDir = mkdtempSync(join(tmpdir(), "jc-root-build-"));
    // An explicit environment, so the suite asserts the defaults rather than
    // whatever the shell that ran it happened to export.
    build(outDir, { env: {} });
    pages = Object.fromEntries(LOCALES.map((locale) => [
        locale,
        readFileSync(join(outDir, homePath(locale), "index.html"), "utf8"),
    ]));
    en = pages.en;
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

test("Every locale is published, each with its own lang and copy", () => {
    assert.ok(LOCALES.length > 2, "expected at least three locales");
    const catalog = loadCatalog(STRINGS_DIR);
    for (const [locale, html] of Object.entries(pages)) {
        assert.ok(html.includes(`<html lang="${locale}">`), `${locale} page lang`);
        // Every page points at every locale, itself included, plus x-default.
        for (const other of LOCALES) {
            assert.ok(html.includes(`hreflang="${other}"`), `${locale} page lacks hreflang=${other}`);
        }
        assert.ok(html.includes('hreflang="x-default" href="https://jc-root.xyz/"'));
        // The toggle names the current locale as text and the others as links.
        assert.ok(html.includes(`<span class="lang-current">${catalog[locale][`lang_${locale}`]}</span>`));
        for (const other of LOCALES.filter((code) => code !== locale)) {
            assert.ok(
                html.includes(`href="${homePath(other)}" hreflang="${other}" lang="${other}"`),
                `${locale} page has no toggle link to ${other}`,
            );
        }
        // No other locale's copy leaking into this page.
        assert.ok(html.includes(catalog[locale].work_heading));
        for (const other of LOCALES.filter((code) => code !== locale)) {
            assert.ok(!html.includes(catalog[other].work_heading), `${other} copy on the ${locale} page`);
        }
    }
});

/* The assets `build.mjs` cannot produce. Rendering the CVs needs WeasyPrint,
   which is Python and lives only in CI, so the PDFs are copied into dist/
   there rather than written here. The invariant is not weakened, only split in
   two: `The files CI publishes are the files the site links to` in cv.test.mjs
   reads the workflow and asserts that copy exists and lands under exactly
   these names. Anything else a page references must still be in the output. */
const { cvPath } = loadConfig({ publicDirectory: null, env: {} });
const SUPPLIED_BY_CI = new Set(LOCALES.map((locale) => cvPathFor(locale, cvPath)));

test("A skill that links out does so in every locale, as a chip", () => {
    for (const [locale, html] of Object.entries(pages)) {
        const chips = [...html.matchAll(/<a class="chip" href="([^"]+)" rel="noopener">([^<]*)<\/a>/g)];
        assert.deepEqual(chips.map((m) => m[1]), ["https://vapor.codes"], `${locale}: linked chips`);
        assert.match(chips[0][2], /^Vapor 4 /, `${locale}: the linked chip is the Vapor one`);
    }
});

test("Every asset each page references is actually in the output", () => {
    for (const [locale, html] of Object.entries(pages)) {
        const refs = assetReferences(html);
        // Guard the regex itself: a page that suddenly references nothing would
        // make every assertion below vacuous.
        assert.ok(refs.length >= 5, `expected several asset references, found ${refs.length}`);

        for (const ref of refs) {
            const path = ref.split("?")[0];
            if (SUPPLIED_BY_CI.has(path)) continue;
            assert.ok(
                existsSync(join(outDir, path)),
                `${locale} page references ${ref} but ${path} is not in the output`,
            );
        }
    }
});

test("Each page's download button points at its own locale's CV", () => {
    for (const [locale, html] of Object.entries(pages)) {
        const own = cvPathFor(locale, cvPath);
        assert.ok(html.includes(`href="${own}"`), `${locale} page does not link ${own}`);
        for (const other of LOCALES.filter((code) => code !== locale)) {
            const theirs = cvPathFor(other, cvPath);
            assert.ok(!html.includes(`href="${theirs}"`), `${locale} page links the ${other} CV`);
        }
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
    for (const html of Object.values(pages)) {
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
    for (const [locale, html] of Object.entries(pages)) {
        const note = html.match(/<p class="form-sent"([^>]*)>([^<]*)<\/p>/);
        assert.ok(note, `no .form-sent paragraph on ${locale}`);
        assert.ok(note[1].includes("hidden"), ".form-sent must ship hidden");
        assert.ok(note[2].length > 0);
        // The copy is in the catalog, not in JS.
        assert.ok(catalog[locale].form_sent.length > 0);
    }
    // ...and the form sends the visitor back to the page that carries it.
    for (const [locale, html] of Object.entries(pages)) {
        assert.ok(html.includes(`name="_next" value="https://jc-root.xyz${homePath(locale)}?sent=1"`));
    }
});

test("JSON-LD parses, in every locale, with nothing HTML-escaped into it", () => {
    for (const [locale, html] of Object.entries(pages)) {
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
    for (const locale of LOCALES) {
        assert.ok(sitemap.includes(`<loc>https://jc-root.xyz${homePath(locale)}</loc>`));
        // Each <url> lists every locale as an alternate, so N urls × N links.
        assert.equal(sitemap.split(`hreflang="${locale}"`).length - 1, LOCALES.length);
    }
    assert.equal(sitemap.split('hreflang="x-default"').length - 1, LOCALES.length);
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
