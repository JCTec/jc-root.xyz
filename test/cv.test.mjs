/* The CV build: the page's own sections under a print stylesheet.
 *
 * Two failures these tests exist to catch. One is mundane and expensive: a date
 * or a project updated on jc-root.xyz, a PDF still saying the old thing, and
 * nobody noticing until someone reads both. The other is how that starts: a
 * second, hand-written layout of the CV that every site change has to be
 * repeated in. So nothing here lists what the page contains; it compares the
 * two renders.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { buildCV, STRINGS_DIR } from "../build-cv.mjs";
import { build } from "../build.mjs";
import { buildPageContext, loadConfig } from "../lib/content.mjs";
import {
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
import { heroIdentity } from "../lib/templates.mjs";

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

/** Each `<section>` a render holds, by id, in order. */
const sectionsOf = (markup) => [...markup.matchAll(/<section[^>]* id="([^"]+)">[\s\S]*?<\/section>/g)]
    .map((match) => ({ id: match[1], markup: match[0] }));

/** A section with its card links' wording removed: the page's "Visit X →" and
    the CV's bare URL are the one difference the two renders are allowed. */
const withoutLinkWording = (markup) =>
    markup.replace(/(<a class="card-link"[^>]*>)[^<]*<\/a>/g, "$1</a>");

/* The contact form is the page's one section with nothing to print. Everything
   else on the page is on the CV, in the same order, as the same markup. This
   is what makes the PDF automatic: no list of sections or fields exists to
   update, and a section added to the page outside contentSections fails here. */
test("The CV is the page's sections, not a second layout of them", () => {
    for (const [locale, out] of Object.entries(renders)) {
        assert.ok(out.includes(`<html lang="${locale}">`));

        const onPage = sectionsOf(pages[locale]).filter((section) => section.id !== "contact");
        const onCV = sectionsOf(out);
        assert.ok(onPage.length >= 7, `${locale}: only ${onPage.length} sections found on the page`);
        assert.deepEqual(onCV.map((section) => section.id), onPage.map((section) => section.id),
            `${locale}: the CV's sections are not the page's`);
        for (const [i, section] of onPage.entries()) {
            assert.equal(withoutLinkWording(onCV[i].markup), withoutLinkWording(section.markup),
                `${locale}: the #${section.id} section differs from the page's`);
        }

        // The hero's facts too: the same markup, in both.
        const identity = heroIdentity(buildPageContext({
            locale, config: loadConfig({ publicDirectory: null, env: {} }), table: catalog[locale],
        }));
        assert.ok(pages[locale].includes(identity), `${locale}: the page lacks the hero's facts`);
        assert.ok(out.includes(identity), `${locale}: the CV lacks the hero's facts`);
    }
});

/* The guard on the file itself. Layout belongs in templates.mjs; the moment this
   file gains a section, a heading or an entry, the site has a second layout to
   keep in step, and that is the thing this design removes. */
test("The CV template lays out nothing by hand", () => {
    const source = readFileSync(join(root, "lib/cv-template.mjs"), "utf8");
    const markup = source.slice(source.indexOf("export function cv("));
    const handWritten = [...markup.matchAll(/<(section|article|main|nav|footer|h[1-6]|ul|ol|dl|table)\b/g)]
        .map((match) => match[1]);
    assert.deepEqual(handWritten, [], `structural markup in cv-template.mjs: ${handWritten}`);

    // Only the document's <title> may read the catalog directly.
    const read = [...markup.matchAll(/\bctx\.t\.([A-Za-z0-9_]+)/g)].map((match) => match[1]).sort();
    assert.deepEqual(read, ["hero_name", "hero_role"], `cv-template.mjs reads the catalog: ${read}`);
});

/* Worked through end to end: a catalog edit and nothing else reaches the CV. */
test("A row added to the catalog alone reaches the CV", () => {
    const config = loadConfig({ publicDirectory: null, env: {} });
    const table = {
        ...catalog.en,
        exp99_role: "ROLE-ADDED", exp99_company: "COMPANY-ADDED", exp99_meta: "META-ADDED", exp99_desc: "DESC-ADDED",
        language99_name: "LANGUAGE-ADDED", language99_level: "LEVEL-ADDED",
    };
    const out = cv(buildPageContext({ locale: "en", config, table }), config);
    for (const copy of Object.values(table).filter((value) => value.endsWith("-ADDED"))) {
        assert.ok(out.includes(copy), `${copy} did not reach the CV`);
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
            const at = out.indexOf(`<h3 class="card-title">${esc(card.name)}</h3>`, cursor);
            assert.ok(at > cursor, `${locale} CV lacks ${card.name}, or shows it out of site order`);
            cursor = at;
            for (const { url } of projectLinks(card)) {
                assert.ok(out.includes(`href="${esc(url)}" rel="noopener">${esc(displayURL(url))}</a>`),
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
    "sections",                 // contentSections; held to `esc` by escaping.test.mjs
    "heroIdentity(ctx)",        // likewise
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
    const out = cv(buildPageContext({ locale: "en", config, table }), config);

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
        assert.match(out, /<a class="chip" href="https:\/\/vapor\.codes"[^>]*>Vapor 4 [^<]*<\/a>/, `${locale}: Vapor skill unlinked`);
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
