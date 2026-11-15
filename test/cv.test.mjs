/* The CV build: the page's own sections, in their print form, under a print
 * stylesheet.
 *
 * Two failures these tests exist to catch. One is mundane and expensive: a date
 * or a project updated on jc-root.xyz, a PDF still saying the old thing, and
 * nobody noticing until someone reads both. The other is how that starts: a
 * second, hand-written layout of the CV that every site change has to be
 * repeated in. The CV is laid out for paper (its own section order, bullets,
 * one-line credentials, short dates) by the same function that lays out the
 * page, and these tests hold it to the page's facts: every section, role,
 * sentence, project, link, credential, skill and language the page shows.
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
    CV_EMAIL,
    cvOutputName,
    cvPathFor,
    cvVersion,
    displayURL,
    sentences,
    shortDate,
} from "../lib/cv-content.mjs";
import { cachePolicyForPath } from "../lib/cache-policy.mjs";
import { cv } from "../lib/cv-template.mjs";
import { esc } from "../lib/html.mjs";
import { projectCards, projectLinks } from "../lib/projects.mjs";
import { homePath, loadCatalog, LOCALES } from "../lib/strings.mjs";
import { heroIdentity, PRINT_SECTION_ORDER } from "../lib/templates.mjs";

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

/** The render context the CV for `locale` was built from. */
const contextFor = (locale) => buildPageContext({
    locale, config: loadConfig({ publicDirectory: null, env: {} }), table: catalog[locale],
});

/** The text of every element of one class in a render, unescaped back to copy
    only as far as comparing against `esc(copy)` requires: callers compare
    escaped forms. */
const textsOf = (markup, className) =>
    [...markup.matchAll(new RegExp(`class="${className}">([^<]*)<`, "g"))].map((match) => match[1]);

/* The contact form is the page's one section with nothing to print. Every
   other section of the page is on the CV, in the CV's order: About, Skills,
   Experience, Selected Work, Education, Diplomas & Certifications, Languages.
   A section added to the page and missing from that list still prints, after
   them; this is what fails if one is dropped instead. */
test("The CV prints every section the page has, in the CV's order", () => {
    for (const [locale, out] of Object.entries(renders)) {
        assert.ok(out.includes(`<html lang="${locale}">`));

        const onPage = sectionsOf(pages[locale]).map((section) => section.id).filter((id) => id !== "contact");
        const onCV = sectionsOf(out).map((section) => section.id);
        assert.ok(onPage.length >= 7, `${locale}: only ${onPage.length} sections found on the page`);
        const expected = [...PRINT_SECTION_ORDER, ...onPage.filter((id) => !PRINT_SECTION_ORDER.includes(id))];
        assert.deepEqual(onCV, expected, `${locale}: the CV's sections are not the page's, in the CV's order`);
    }
    assert.deepEqual(PRINT_SECTION_ORDER,
        ["about", "skills", "experience", "projects", "education", "credentials", "events", "languages"]);
});

/* Same words, laid out for paper: a role's description is one bullet per
   sentence, and joined back the bullets are the description. */
test("Every role prints with its dates and company, its description as one bullet per sentence", () => {
    for (const [locale, out] of Object.entries(renders)) {
        for (const job of contextFor(locale).experience) {
            assert.ok(out.includes(`<h3 class="exp-role">${esc(job.role)}</h3>`), `${locale}: ${job.role} missing`);
            assert.ok(out.includes(`<p class="exp-company">${esc(job.company)}</p>`), `${locale}: ${job.company} missing`);
            assert.ok(out.includes(`<p class="exp-meta">${esc(shortDate(job.meta, locale))}</p>`),
                `${locale}: ${job.role} dates missing`);
            const bullets = sentences(job.description);
            assert.equal(bullets.join(" "), job.description, `${locale}: ${job.role} does not split into its own words`);
            const list = `<ul class="exp-bullets">${bullets.map((b) => `\n                        <li>${esc(b)}</li>`).join("")}`;
            assert.ok(out.includes(list), `${locale}: ${job.role} is not printed as one bullet per sentence`);
        }
        assert.ok(!out.includes(`class="exp-desc">${esc(contextFor(locale).experience[0].description)}`),
            `${locale}: a role's description printed as a paragraph`);
    }
});

/* About is three paragraphs, the personal one last, on the page and on the
   CV alike. */
test("About prints as its three paragraphs, as on the page", () => {
    for (const [locale, out] of Object.entries(renders)) {
        const t = catalog[locale];
        const about = [t.about_intro, t.about_work, t.about_personal]
            .map((paragraph) => `<p class="about-body">${esc(paragraph)}</p>`).join("\n            ");
        assert.ok(out.includes(about), `${locale}: the CV's About is not the page's`);
        assert.ok(pages[locale].includes(about), `${locale}: the page's About is not its three paragraphs`);
        // Availability ends at itself on paper; the citizenship is in the header.
        assert.ok(out.includes(`<p class="about-availability">${esc(t.about_availability)}</p>`),
            `${locale}: the CV's availability line is not just the availability sentence`);
        assert.ok(pages[locale].includes(
            `<p class="about-availability">${esc(t.about_availability)} ${esc(t.about_citizenship)}</p>`),
            `${locale}: the page lost the citizenship sentence`);
    }
});

/* On paper a degree reads like the others: title, then its school, then the
   in-progress marker. The page keeps the marker as a badge under the title. */
test("A degree under way prints its school before its status", () => {
    for (const [locale, out] of Object.entries(renders)) {
        for (const degree of contextFor(locale).degrees.filter((d) => d.school && d.status)) {
            const school = out.indexOf(`<p class="exp-company">${esc(degree.school)}`);
            const status = out.indexOf(`<p class="degree-status">${esc(degree.status)}</p>`);
            assert.ok(school > 0 && status > school, `${locale}: ${degree.title} prints its status before its school`);
        }
    }
});

/* "School · how it is taken · link" on one line, so a degree's link costs the
   CV no line of its own. */
test("A degree's school line carries how it is taken and its link", () => {
    for (const [locale, out] of Object.entries(renders)) {
        for (const degree of contextFor(locale).degrees.filter((d) => d.school)) {
            const start = out.indexOf(`<p class="exp-company">${esc(degree.school)}`);
            const line = out.slice(start, out.indexOf("</p>", start));
            if (degree.mode) {
                assert.ok(line.includes(`${esc(degree.school)} · ${esc(degree.mode)}`),
                    `${locale}: ${degree.title} lost how it is taken`);
            }
            if (degree.url) {
                assert.ok(line.includes(`href="${esc(degree.url)}" rel="noopener">${esc(displayURL(degree.url))}</a>`),
                    `${locale}: ${degree.title} link missing from its school line`);
            }
        }
    }
});

/* One line each, "Title (Type): Issuer · Date · link", and no note: the
   conferences and workshops as well as the diplomas. */
test("Every credential and event prints as one line with its link and without its note", () => {
    for (const [locale, out] of Object.entries(renders)) {
        assert.ok(!out.includes("cred-note"), `${locale}: a credential note reached the CV`);
        const { credentials, events } = contextFor(locale);
        for (const credential of [...credentials, ...events]) {
            const line = `<span class="cred-title">${esc(credential.title)}</span> (${esc(credential.type)}): `
                + `${esc(credential.issuer)} · ${esc(shortDate(credential.dates, locale))}`;
            assert.ok(out.includes(line), `${locale}: ${credential.title} is not one line`);
            if (credential.url) {
                assert.ok(out.includes(`href="${esc(credential.url)}" rel="noopener">${esc(displayURL(credential.url))}</a></p>`),
                    `${locale}: ${credential.title} link missing from its line`);
            }
            if (credential.note) {
                assert.ok(pages[locale].includes(esc(credential.note)), `${locale}: the page lost ${credential.title}'s note`);
            }
        }
    }
});

/* One date style throughout the CV: month and year, short. */
test("Every date on the CV is in the short form", () => {
    const longForms = {
        en: /\b(January|February|March|April|June|July|August|September|October|November|December)\b/,
        es: /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/,
        fr: /(janvier|février|avril|juillet|septembre|octobre|novembre|décembre)/,
    };
    for (const [locale, out] of Object.entries(renders)) {
        // A credential's date is the last "·" part of its line once the link is gone.
        const credentialDates = [...out.matchAll(/<p class="cred-line">([\s\S]*?)<\/p>/g)]
            .map((m) => m[1].replace(/<a[^>]*>[\s\S]*?<\/a>/g, "").replace(/<[^>]+>/g, "").split(" · ").pop().trim());
        const dates = [...textsOf(out, "exp-meta"), ...credentialDates]
            .map((date) => date.replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
        assert.ok(dates.length >= 14, `${locale}: found only ${dates.length} dates`);
        for (const date of dates) {
            assert.doesNotMatch(date, longForms[locale], `${locale}: "${date}" is a long-form date`);
            assert.doesNotMatch(date, /(?<!\d)\d{1,2}(?!\d)/, `${locale}: "${date}" carries a day`);
        }
    }
    assert.equal(shortDate("October 2026 – present", "en"), "Oct 2026 – present");
    assert.equal(shortDate("November 11 – 12, 2026", "en"), "Nov 2026");
    assert.equal(shortDate("11 y 12 de noviembre de 2026", "es"), "nov. 2026");
    assert.equal(shortDate("2017 – julio de 2021", "es"), "2017 – jul. 2021");
    assert.equal(shortDate("10 novembre 2026", "fr"), "nov. 2026");
    assert.equal(shortDate("février – juin 2026", "fr"), "févr. – juin 2026");
    assert.equal(shortDate("Dec 2023 – Nov 2024", "en"), "Dec 2023 – Nov 2024");
});

test("Every degree, skill and language the page shows is on the CV", () => {
    for (const [locale, out] of Object.entries(renders)) {
        const ctx = contextFor(locale);
        for (const degree of ctx.degrees) {
            assert.ok(out.includes(`<h3 class="exp-role">${esc(degree.title)}</h3>`), `${locale}: ${degree.title}`);
        }
        for (const { text } of [...ctx.stackCore, ...ctx.stackAlso, ...ctx.stackMedia]) {
            assert.ok(out.includes(`>${esc(text)}</`), `${locale}: skill ${text} missing`);
        }
        for (const language of ctx.languages) {
            assert.ok(out.includes(`<dt class="language-name">${esc(language.name)}</dt>`), `${locale}: ${language.name}`);
        }
    }
});

/* The header is the page's hero facts, with the address on the citizenship
   line. The page itself never shows the address. */
test("The CV header carries the address on the citizenship line; the page does not", () => {
    for (const [locale, out] of Object.entries(renders)) {
        const ctx = contextFor(locale);
        assert.ok(out.includes(heroIdentity(ctx, { email: CV_EMAIL })), `${locale}: the CV lacks the hero's facts`);
        assert.ok(out.includes(`<p class="hero-status">${esc(ctx.t.hero_status)} · <a href="mailto:${CV_EMAIL}">${CV_EMAIL}</a></p>`),
            `${locale}: the address is not on the citizenship line`);
        assert.ok(pages[locale].includes(heroIdentity(ctx)), `${locale}: the page lacks the hero's facts`);
        assert.ok(!pages[locale].includes(CV_EMAIL), `${locale}: the page shows the address`);
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

/* A card added to the site must reach the PDF without a second edit, and a
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
    "identity",                 // heroIdentity; likewise
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
        ...catalog.en, hero_name: poison, exp1_company: poison, about_intro: poison, p8_tags: poison,
    };
    const out = cv(buildPageContext({ locale: "en", config, table }), config);

    assert.ok(out.includes(esc(poison)), "escaped copy missing from the CV");
    assert.ok(!out.includes(poison), "raw hostile copy reached the CV markup");
    assert.ok(!out.includes("<img src=x"));
    // The stylesheet is the one raw block; nothing may close it early.
    assert.equal(out.match(/<\/style>/g).length, 1, "a value closed the style element");
});

test("The contact line is the site and the profiles, the address being in the header", () => {
    const entries = contactEntries(loadConfig({ publicDirectory: null, env: { CONTACT_EMAIL: "a@b.example" } }));
    assert.ok(entries.every((entry) => !entry.href.startsWith("mailto:")), "an address reached the contact line");
    assert.ok(!html.includes("a@b.example"));
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
   and nothing but this test connects them: a rename on one side alone
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
    assert.ok(workflow.includes('.venv/bin/weasyprint --pdf-tags "$html" "${html%.html}.pdf"'),
        "ci.yml does not render each HTML to a tagged PDF of the same basename");
    // Tagged for accessibility, and held to exactly two pages: both are
    // checked on the rendered PDFs, the only place either can be seen. The
    // page count is test/rendered/, which must run after the render and
    // before the PDFs are published.
    assert.match(workflow, /pdfinfo "\$pdf"/, "ci.yml does not inspect the rendered PDFs");
    assert.match(workflow, /Tagged:/, "ci.yml does not check the PDFs are tagged");
    const render = workflow.indexOf(".venv/bin/weasyprint --pdf-tags");
    const pages = workflow.indexOf("node --test test/rendered/*.test.mjs");
    const publish = workflow.indexOf("run: cp dist-cv/*.pdf dist/");
    assert.ok(pages > render && pages < publish,
        "ci.yml does not hold the rendered CVs to two pages before publishing them");
    assert.ok(workflow.includes("run: cp dist-cv/*.pdf dist/"),
        "ci.yml never copies the rendered PDFs into dist/ unrenamed");

    // And the release assets, which are the same bytes under the same names.
    assert.ok(workflow.includes("path: dist-cv/*.pdf"), "the cv artifact is not every PDF");
    const uploaded = workflow.match(/gh release upload cv (\S+) --clobber/);
    assert.ok(uploaded, "no `gh release upload` line found in ci.yml");
    assert.equal(uploaded[1], "*.pdf", `the release uploads ${uploaded[1]}, not every PDF`);
    assert.ok(!/\bmv\b.*\.pdf/.test(workflow), "ci.yml renames a PDF; the render already named it");
});

/* The PDF keeps one name on every release, so the page links it with a ?v=
   stamp of the CV itself. What this guards is the failure that happened: a
   new CV deployed, and a returning visitor handed the old one from a cache. */
test("Each page links its CV stamped with a hash of the CV it will download", () => {
    for (const [locale, out] of Object.entries(renders)) {
        const href = `href="${cvPathFor(locale, cvPath)}?v=${cvVersion(out)}"`;
        assert.ok(pages[locale].includes(href), `${locale}: the page does not link ${href}`);
    }
    assert.match(cvVersion("x"), /^[0-9a-f]{12}$/);
});

test("Editing the copy changes the CV's stamp; rebuilding without an edit does not", () => {
    const config = loadConfig({ publicDirectory: null, env: {} });
    const stamp = (table) => buildPageContext({ locale: "en", config, table }).cvHref;
    assert.equal(stamp(catalog.en), stamp({ ...catalog.en }), "a rebuild with no edit changed the stamp");
    assert.notEqual(stamp(catalog.en), stamp({ ...catalog.en, about_intro: catalog.en.about_intro + " Edited." }),
        "editing About did not change the stamp");
    assert.notEqual(stamp(catalog.en), stamp({ ...catalog.en, exp2_desc: catalog.en.exp2_desc + " Edited." }),
        "editing a role did not change the stamp");
});

/* And at the bare URL, which bookmarks and pasted links still use, the CVs
   must not be long-cached either: an edited catalog has to reach a returning
   visitor. The edge rule that applies this is checked in cache-policy.test. */
test("The published CVs revalidate rather than caching", () => {
    for (const locale of LOCALES) {
        assert.equal(cachePolicyForPath(cvPathFor(locale, cvPath)), "no-cache, must-revalidate");
    }
});
