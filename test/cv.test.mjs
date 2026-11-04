/* The CV build: a print layout of the site, and nothing but the site.
 *
 * Every word in the PDF comes from the catalog the page renders, and every
 * project from the same card list in the same order. The failure these tests
 * exist to catch is mundane and expensive: a date or a project updated on
 * jc-root.xyz, a PDF still saying the old thing, and nobody noticing until
 * someone reads both.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { buildCV, STRINGS_DIR } from "../build-cv.mjs";
import { build } from "../build.mjs";
import { loadConfig } from "../lib/content.mjs";
import {
    buildCVContext,
    contactEntries,
    cvOutputName,
    cvPathFor,
    displayURL,
} from "../lib/cv-content.mjs";
import { cachePolicyForPath } from "../lib/cache-policy.mjs";
import { cv } from "../lib/cv-template.mjs";
import { esc } from "../lib/html.mjs";
import { projectCards, projectLinks } from "../lib/projects.mjs";
import { homePath, loadCatalog, LOCALES } from "../lib/strings.mjs";

const catalog = loadCatalog(STRINGS_DIR);
const root = join(import.meta.dirname, "..");
const { cvPath } = loadConfig({ publicDirectory: null, env: {} });

let outDir;
/** Rendered CV markup by locale. */
let renders;
/** The site's rendered page by locale: what the CV is held to. */
let pages;
/** The default locale's render: the one the locale-agnostic checks read. */
let html;

before(() => {
    outDir = mkdtempSync(join(tmpdir(), "jc-root-cv-"));
    const { written } = buildCV(outDir, { env: {} });
    renders = Object.fromEntries(LOCALES.map((locale) => [
        locale,
        readFileSync(join(outDir, cvOutputName(locale, "html", cvPath)), "utf8"),
    ]));
    html = renders.en;
    // Nothing is written beyond one file per locale.
    assert.deepEqual(written.sort(), LOCALES.map((l) => cvOutputName(l, "html", cvPath)).sort());

    const siteDir = join(outDir, "site");
    build(siteDir, { env: {} });
    pages = Object.fromEntries(LOCALES.map((locale) => [
        locale,
        readFileSync(join(siteDir, homePath(locale), "index.html"), "utf8"),
    ]));
});

after(() => {
    rmSync(outDir, { recursive: true, force: true });
});

/** A resolver over one locale's table, as the builders use it. */
const resolver = (table) => (code) => (table[code] === undefined ? code : table[code]);

/** Every project code the catalog defines, found by shape rather than listed. */
function catalogProjects(table) {
    return Object.keys(table)
        .map((key) => key.match(/^(p\d+)_name$/))
        .filter(Boolean)
        .map((match) => match[1]);
}

/* The CV has no catalog of its own to drift from the site's. A cv.*.strings
   file reappearing would be the first step back to two copies of the facts. */
test("The site's catalog is the only catalog", () => {
    const stray = readdirSync(STRINGS_DIR).filter((name) => name.startsWith("cv.")).sort();
    assert.deepEqual(stray, [], `CV-only catalogs in site/strings: ${stray}`);
});

/* The catalog keys that are the page's own furniture rather than facts about
   the person: what search engines and link previews read, how the page is
   navigated, how a link is worded where the CV prints the bare URL instead,
   and the contact form. Everything else in the catalog is content, and
   content is on both render targets. A key belongs here only if a printed
   page has no use for it. */
const PAGE_ONLY = new Set([
    // Search and link previews
    "meta_title", "meta_description", "meta_home_location", "og_image_alt",
    // Navigation, branding and buttons
    "skip_to_content", "nav_label", "site_label", "brand_short",
    "nav_about", "nav_experience", "nav_projects", "nav_contact",
    "lang_en", "lang_es", "lang_fr",
    "hero_cta_projects", "hero_cta_github", "hero_cta_cv",
    // Link wording; the CV prints each URL bare
    "link_appstore_suffix", "link_github_suffix", "link_site_prefix", "link_site_suffix",
    // The contact form and footer
    "cta_heading", "cta_all_links",
    "form_name", "form_email", "form_message", "form_send", "form_subject", "form_sent",
    "footer_name", "footer_github", "footer_linkedin", "footer_appstore",
]);

/** A catalog value as it reaches the page: `|`-lists render one item at a time. */
const pieces = (key, value) => (key.endsWith("_items") ? value.split("|") : [value]);

function occurrences(haystack, needle) {
    let count = 0;
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
        count += 1;
    }
    return count;
}

/* The CV mirrors the site: every content string a locale's page shows, its CV
   shows too. Derived from the catalog, not listed, so a section added to the
   site without the CV fails here in every locale.

   Presence alone is fooled by coincidence: the hero's "iOS · iPadOS · macOS"
   once passed only because a project's tags read the same. So each piece must
   appear at least as often as the catalog's content says it should, counting
   every content value it occurs inside, on the page and on the CV alike. */
test("Each locale's CV mirrors every content string that locale's page shows", () => {
    for (const [locale, out] of Object.entries(renders)) {
        const t = catalog[locale];
        assert.ok(out.includes(`<html lang="${locale}">`));

        const unknown = [...PAGE_ONLY].filter((key) => !(key in t));
        assert.deepEqual(unknown, [], `PAGE_ONLY names keys ${locale}.strings lacks`);

        const content = Object.entries(t)
            .filter(([key]) => !PAGE_ONLY.has(key))
            .flatMap(([key, value]) => pieces(key, value).map((piece) => ({ key, piece: esc(piece) })));
        assert.ok(content.length > 100, `only ${content.length} content strings in ${locale}`);

        for (const { key, piece } of content) {
            const expected = content.reduce((sum, other) => sum + occurrences(other.piece, piece), 0);
            assert.ok(occurrences(pages[locale], piece) >= expected,
                `${locale} page omits ${key}: ${piece}`);
            assert.ok(occurrences(out, piece) >= expected,
                `${locale} CV omits ${key}: ${piece}`);
        }

        // And the copy is that locale's, not English's.
        if (locale !== "en") {
            assert.ok(!out.includes(esc(catalog.en.about_body)), `English About on the ${locale} CV`);
        }
    }
});

/* A card added to the site must reach the PDF without a second edit — and a
   catalog project with no card is one neither render target would show. */
test("The CV lists every site project, in the site's order, with every link", () => {
    for (const [locale, out] of Object.entries(renders)) {
        const cards = projectCards(resolver(catalog[locale]));
        assert.equal(cards.length, catalogProjects(catalog[locale]).length,
            `${locale}: projects in the catalog with no card, or cards with no copy`);

        let cursor = 0;
        for (const card of cards) {
            const at = out.indexOf(`<p class="cv-entry-title">${esc(card.name)}</p>`, cursor);
            assert.ok(at > cursor, `${locale} CV lacks ${card.name}, or shows it out of site order`);
            cursor = at;
            for (const { url } of projectLinks(card)) {
                assert.ok(out.includes(`<a href="${esc(url)}">${esc(displayURL(url))}</a>`),
                    `${locale} CV lacks the ${card.name} link ${url}`);
            }
        }
    }
});

test("Every repository of a multi-repo project is linked", () => {
    for (const url of [
        "https://github.com/zhen-swift/zhen-core",
        "https://github.com/zhen-swift/zhen-app",
        "https://github.com/zhen-swift/zhen-study",
    ]) {
        assert.ok(html.includes(`href="${url}"`), `the CV does not link ${url}`);
    }
});

/** Interpolations whose value is markup this template already assembled and
    escaped, not a catalog or config value. */
const PRE_ESCAPED = new Set([
    "STYLE",                    // a constant stylesheet, no catalog values in it
    "contact",
    "skills",
    "experience",
    "projects",
    "items",
    "meta",
    "paragraphs(ctx.about)",
    "degrees",
    "details",
    "credentials",
    "languageLine(ctx.languages)",
]);

test("Every interpolation in the CV template is escaped", () => {
    const source = readFileSync(join(root, "lib/cv-template.mjs"), "utf8");
    const bare = [...source.matchAll(/\$\{([^}]*)\}/g)]
        .map((m) => m[1].trim())
        .filter((expression) => !expression.startsWith("esc("))
        .filter((expression) => !PRE_ESCAPED.has(expression));
    assert.deepEqual(bare, [], `unescaped interpolation(s) in cv-template.mjs: ${bare}`);
});

test("Hostile copy is escaped in the rendered CV", () => {
    const poison = `</style><img src=x onerror=alert(1)> & "quoted" 'single'`;
    const config = loadConfig({ publicDirectory: null, env: {} });
    const table = {
        ...catalog.en, hero_name: poison, exp1_company: poison, about_body: poison, p8_tags: poison,
    };
    const out = cv(buildCVContext({ locale: "en", config, table }));

    assert.ok(out.includes(esc(poison)), "escaped copy missing from the CV");
    assert.ok(!out.includes(poison), "raw hostile copy reached the CV markup");
    assert.ok(!out.includes("<img src=x"));
    // The stylesheet is the one raw block; nothing may close it early.
    assert.equal(out.match(/<\/style>/g).length, 1, "a value closed the style element");
});

test("The CV carries no email address unless one was supplied", () => {
    assert.ok(
        !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(html),
        "an address reached a CV built with no CONTACT_EMAIL",
    );

    const config = loadConfig({ publicDirectory: null, env: { CONTACT_EMAIL: "a@b.example" } });
    const entries = contactEntries(config);
    assert.equal(entries[0].href, "mailto:a@b.example");
    assert.equal(entries[0].text, "a@b.example");
});

test("Contact links are shown bare and linked in full", () => {
    assert.equal(displayURL("https://www.linkedin.com/in/jctec"), "linkedin.com/in/jctec");
    assert.equal(displayURL("https://github.com/JCTec"), "github.com/JCTec");
    assert.equal(displayURL("https://jc-root.xyz/"), "jc-root.xyz");

    const config = loadConfig({ publicDirectory: null, env: {} });
    for (const entry of contactEntries(config)) {
        assert.ok(html.includes(`href="${esc(entry.href)}"`), `missing link ${entry.href}`);
        assert.ok(html.includes(`>${esc(entry.text)}</a>`), `missing label ${entry.text}`);
    }
});

test("The skills that link out on the site link out in the CV too", () => {
    for (const [locale, out] of Object.entries(renders)) {
        assert.match(out, /<a href="https:\/\/vapor\.codes">Vapor 4 [^<]*<\/a>/, `${locale}: Vapor skill unlinked`);
    }
});

test("The CV renders one self-contained file per locale, named as it is published", () => {
    // The render's basename is the published basename, so WeasyPrint's output
    // needs no rename: cv.html → cv.pdf under whatever CV_PATH says.
    const path = "/juan-carlos-estevez-cv.pdf";
    assert.equal(cvPathFor("en", path), path);
    assert.equal(cvPathFor("es", path), "/juan-carlos-estevez-cv.es.pdf");
    assert.equal(cvPathFor("fr", path), "/juan-carlos-estevez-cv.fr.pdf");
    assert.equal(cvOutputName("en", "html", path), "juan-carlos-estevez-cv.html");
    assert.equal(cvOutputName("es", "pdf", path), "juan-carlos-estevez-cv.es.pdf");
    // A CV_PATH with a directory keeps it on the served path, not the file.
    assert.equal(cvPathFor("fr", "/files/cv.pdf"), "/files/cv.fr.pdf");
    assert.equal(cvOutputName("fr", "pdf", "/files/cv.pdf"), "cv.fr.pdf");

    for (const [locale, out] of Object.entries(renders)) {
        // Self-contained: nothing to fetch, so nothing to go stale or 404.
        assert.ok(!out.includes("<link"), `the ${locale} CV links an external stylesheet`);
        assert.ok(!out.includes("<script"), `the ${locale} CV carries script`);
        assert.ok(out.includes("<style>"), `the ${locale} CV has no inline stylesheet`);
    }
});

/* The site links to each CV by path, and CI decides what the published files
   are called. Those live in two different files and two different languages,
   and nothing but this test connects them — a rename on one side alone
   publishes a button that 404s, which no other check here would notice
   because both files remain perfectly valid on their own.

   The render already writes each locale under its published basename, so CI
   only has to keep the basenames: render every HTML beside itself, copy every
   PDF into dist/ unrenamed, and upload every PDF unrenamed. */
test("The files CI publishes are the files the site links to", () => {
    const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");

    // Each locale's page links a path whose basename the render produced.
    for (const locale of LOCALES) {
        const served = cvPathFor(locale, cvPath);
        assert.ok(served.startsWith("/"), `${served} is not root-absolute`);
        assert.equal(served.slice(served.lastIndexOf("/") + 1), cvOutputName(locale, "pdf", cvPath));
        // And it is served from the site root, where `cp dist-cv/*.pdf dist/` puts it.
        assert.equal(served.lastIndexOf("/"), 0, `${served} is not at the site root`);
    }

    // What Pages serves: every render, copied into dist/ under its own name.
    assert.ok(workflow.includes('.venv/bin/weasyprint "$html" "${html%.html}.pdf"'),
        "ci.yml does not render each HTML to a PDF of the same basename");
    assert.ok(workflow.includes("run: cp dist-cv/*.pdf dist/"),
        "ci.yml never copies the rendered PDFs into dist/ unrenamed");

    // And the release assets, which are the same bytes under the same names.
    assert.ok(workflow.includes("path: dist-cv/*.pdf"), "the cv artifact is not every PDF");
    const uploaded = workflow.match(/gh release upload cv (\S+) --clobber/);
    assert.ok(uploaded, "no `gh release upload` line found in ci.yml");
    assert.equal(uploaded[1], "*.pdf", `the release uploads ${uploaded[1]}, not every PDF`);
    assert.ok(!/\bmv\b.*\.pdf/.test(workflow), "ci.yml renames a PDF; the render already named it");
});

/* The CVs are linked without a ?v= buster, so they must not be long-cached:
   an edited catalog has to reach a returning visitor, not sit behind a year
   of immutability. */
test("The published CVs revalidate rather than caching", () => {
    for (const locale of LOCALES) {
        assert.equal(cachePolicyForPath(cvPathFor(locale, cvPath)), "no-cache, must-revalidate");
    }
});
