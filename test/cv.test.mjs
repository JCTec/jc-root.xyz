/* The CV build, and the seam between the two catalogs that feed it.
 *
 * The CV exists because the site's copy is too terse to hand to a recruiter;
 * it is *correct* because the facts underneath it are not written twice. These
 * tests are what enforce that second half. The failure they exist to catch is
 * mundane and expensive: a job title updated on jc-root.xyz, a PDF still
 * claiming the old one, and nobody noticing until someone reads both.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { buildCV, STRINGS_DIR } from "../build-cv.mjs";
import { loadConfig } from "../lib/content.mjs";
import {
    buildCVContext,
    contactEntries,
    CV_LOCALES,
    CV_PROJECTS,
    cvOutputName,
    displayURL,
    experienceCount,
    loadCVCatalog,
} from "../lib/cv-content.mjs";
import { cv } from "../lib/cv-template.mjs";
import { esc } from "../lib/html.mjs";
import { loadCatalog } from "../lib/strings.mjs";

const catalog = loadCatalog(STRINGS_DIR);
const cvCatalog = loadCVCatalog(STRINGS_DIR, "en");
const root = join(import.meta.dirname, "..");

let outDir;
let html;

before(() => {
    outDir = mkdtempSync(join(tmpdir(), "jc-root-cv-"));
    buildCV(outDir, { env: {} });
    html = readFileSync(join(outDir, "cv.html"), "utf8");
});

after(() => {
    rmSync(outDir, { recursive: true, force: true });
});

test("Every CV locale has a catalog, with no empty values", () => {
    for (const locale of CV_LOCALES) {
        const table = loadCVCatalog(STRINGS_DIR, locale);
        assert.ok(Object.keys(table).length > 0, `empty CV catalog for ${locale}`);
        for (const [key, value] of Object.entries(table)) {
            assert.notEqual(value, "", `empty CV value for ${key}`);
        }
    }
});

/* The split is the whole design: facts on one side, CV prose on the other. A
   key defined in both is a fact that has started being maintained twice. */
test("The CV catalog and the site catalog share no keys", () => {
    const shared = Object.keys(cvCatalog).filter((key) => key in catalog.en);
    assert.deepEqual(shared, [], `defined in both en.strings and cv.en.strings: ${shared}`);
});

test("Every CV key is namespaced, so the split is visible at a glance", () => {
    const stray = Object.keys(cvCatalog).filter((key) => !key.startsWith("cv_")).sort();
    assert.deepEqual(stray, [], `cv.en.strings keys without a cv_ prefix: ${stray}`);
});

/* Adding a ninth role to en.strings must not silently produce a CV entry with
   no bullets under it. */
test("Every role in the work history has CV bullets", () => {
    const count = experienceCount(catalog.en);
    assert.ok(count >= 8, `expected the full work history, found ${count} roles`);
    const missing = [];
    for (let n = 1; n <= count; n += 1) {
        if (!cvCatalog[`cv_exp${n}_bullets`]) missing.push(`cv_exp${n}_bullets`);
        // Every role the site shows must also be a role the CV can title.
        assert.ok(catalog.en[`exp${n}_company`], `exp${n}_company missing from en.strings`);
    }
    assert.deepEqual(missing, [], `roles in en.strings with no CV bullets: ${missing}`);
});

/* Projects the CV deliberately leaves out, and why. A new site project that
   is not listed in one of these two places fails this test rather than
   quietly never reaching the PDF. */
const PROJECTS_COVERED_ELSEWHERE = {
    // Living Root is work, not a side project: it is the fourth bullet under
    // the current role. Repeating it here would cost a third of a page.
    p5: "covered under Experience",
};

test("Every site project is either in the CV or deliberately excluded", () => {
    const siteProjects = Object.keys(catalog.en)
        .map((key) => key.match(/^(p\d+)_name$/))
        .filter(Boolean)
        .map((match) => match[1]);
    assert.ok(siteProjects.length > 0, "no projects found in en.strings");

    const accounted = new Set([...CV_PROJECTS, ...Object.keys(PROJECTS_COVERED_ELSEWHERE)]);
    const unaccounted = siteProjects.filter((key) => !accounted.has(key)).sort();
    assert.deepEqual(unaccounted, [], `site projects absent from the CV: ${unaccounted}`);

    // And nothing in the CV may point at a project the site has dropped.
    const dangling = CV_PROJECTS.filter((key) => !siteProjects.includes(key));
    assert.deepEqual(dangling, [], `CV projects with no entry in en.strings: ${dangling}`);
});

/* Codes the CV assembles at runtime, which a static scan of the source cannot
   see. Same contract as DYNAMIC_KEY_PATTERNS in strings.test.mjs: every entry
   is a claim that some loop builds those keys. */
const DYNAMIC_CV_PATTERNS = [
    /^cv_exp[0-9]+_(bullets|note)$/,
    /^cv_p[0-9]+_links$/,
    /^cv_skills[0-9]+_(label|items)$/,
];

test("Every CV string code is referenced, and every reference resolves", () => {
    const source = readFileSync(join(root, "lib/cv-content.mjs"), "utf8");
    const referenced = new Set([
        ...[...source.matchAll(/\bc\("([A-Za-z0-9_]+)"\)/g)].map((m) => m[1]),
        ...[...source.matchAll(/\blist\("([A-Za-z0-9_]+)"\)/g)].map((m) => m[1]),
    ]);

    const defined = new Set(Object.keys(cvCatalog));
    const missing = [...referenced].filter((code) => !defined.has(code)).sort();
    assert.deepEqual(missing, [], `referenced but absent from cv.en.strings: ${missing}`);

    const unused = [...defined]
        .filter((code) => !referenced.has(code))
        .filter((code) => !DYNAMIC_CV_PATTERNS.some((pattern) => pattern.test(code)))
        .sort();
    assert.deepEqual(unused, [], `defined in cv.en.strings but never used: ${unused}`);
});

/** Interpolations whose value is markup this template already assembled and
    escaped, not a catalog or config value. */
const PRE_ESCAPED = new Set([
    "STYLE",                    // a constant stylesheet, no catalog values in it
    "contact",
    "skills",
    "experience",
    "projects",
    "note",
    "items",
    "bullets(entry.bullets)",
    "lines(ctx.education)",
    "lines(ctx.certifications)",
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
    const table = { ...catalog.en, hero_name: poison, exp1_company: poison };
    const cvTable = { ...cvCatalog, cv_summary: poison, cv_interests: poison };
    const out = cv(buildCVContext({ locale: "en", config, table, cvTable }));

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

test("The built CV states the facts the site states", () => {
    const en = catalog.en;
    assert.ok(html.includes(esc(en.hero_name)));
    assert.ok(html.includes(esc(en.hero_role)));

    // Every role, company and date range, straight from the shared catalog.
    for (let n = 1; n <= experienceCount(en); n += 1) {
        for (const field of ["role", "company", "meta"]) {
            const value = en[`exp${n}_${field}`];
            assert.ok(html.includes(esc(value)), `CV omits exp${n}_${field}: ${value}`);
        }
    }
    for (const key of CV_PROJECTS) {
        for (const field of ["name", "tags", "desc"]) {
            const value = en[`${key}_${field}`];
            assert.ok(html.includes(esc(value)), `CV omits ${key}_${field}: ${value}`);
        }
    }
    for (const key of ["edu1", "edu2", "edu3", "edu4", "edu5", "langs_line"]) {
        assert.ok(html.includes(esc(en[key])), `CV omits ${key}`);
    }
});

test("The CV renders one self-contained file per locale", () => {
    assert.equal(cvOutputName("en", "html"), "cv.html");
    assert.equal(cvOutputName("en", "pdf"), "cv.pdf");
    assert.equal(cvOutputName("es", "pdf"), "cv.es.pdf");

    // Self-contained: nothing to fetch, so nothing to go stale or 404.
    assert.ok(!html.includes("<link"), "the CV links an external stylesheet");
    assert.ok(!html.includes("<script"), "the CV carries script");
    assert.ok(html.includes("<style>"), "the CV has no inline stylesheet");
});
