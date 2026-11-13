/* What replaces Leaf's automatic escaping.
 *
 * In the Vapor original every `#()` interpolation HTML-escaped its value; a
 * JavaScript template literal escapes nothing. The obligation moved into
 * `esc`, which means it is now possible to forget it. These two tests are the
 * thing that notices: one reads the template source and refuses a bare
 * interpolation, the other renders a page whose copy is hostile and checks
 * what came out.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { STRINGS_DIR } from "../build.mjs";
import { buildPageContext, loadConfig } from "../lib/content.mjs";
import { esc } from "../lib/html.mjs";
import { loadCatalog } from "../lib/strings.mjs";
import { home } from "../lib/templates.mjs";

/** Interpolations whose value is already-escaped markup this file assembled,
    not a catalog or config value. Everything else must go through `esc`. */
const PRE_ESCAPED = new Set([
    "v",                    // esc(ctx.assetVersion), hoisted once
    "body",                 // the rendered <body> contents
    "alternateLinks(ctx)",  // hreflang <link>s, escaped as they are built
    "langToggle",
    "label",                // langToggle's esc(t["lang_" + locale]); cardLink's escaped parts
    "experience",
    "description",          // a role's description: esc()'d paragraph, or its bullets
    "bullets(job.description)", // one <li> per sentence, each esc()'d
    "aboutBody",            // esc(about_body), plus esc(about_personal) on the page
    "mailto",               // the CV's address on the status line, esc()'d; empty on the page
    "degrees",
    "details",              // a degree's optional lines, each esc()'d
    "credentials",
    "noteLine",             // a credential's optional note, esc()'d
    "sourceLink",           // a credential's optional link, built by cardLink
    "languages",
    "projects",
    "links",
    "chips(ctx.stackCore)",
    "chips(ctx.stackAlso)",
    "heroIdentity(ctx)",    // the hero's facts, each esc()'d where they are written
    "contentSections(ctx)", // the page's sections, each esc()'d where they are written
    "ctx.jsonLD",           // raw on purpose; structured-data.mjs escaped it
]);

test("Every interpolation in the template is escaped", () => {
    const source = readFileSync(join(import.meta.dirname, "..", "lib/templates.mjs"), "utf8");
    const bare = [...source.matchAll(/\$\{([^}]*)\}/g)]
        .map((m) => m[1].trim())
        .filter((expression) => !expression.startsWith("esc("))
        // `u(path)` is esc() with the base-path prefix; see templates.mjs.
        .filter((expression) => !expression.startsWith("u("))
        .filter((expression) => !PRE_ESCAPED.has(expression));
    assert.deepEqual(bare, [], `unescaped interpolation(s) in templates.mjs: ${bare}`);
});

test("Hostile copy is escaped in the markup and intact in the JSON-LD", () => {
    const poison = `</script><img src=x onerror=alert(1)> & "quoted" 'single'`;
    const catalog = loadCatalog(STRINGS_DIR);
    const table = { ...catalog.en, hero_name: poison, about_body: poison, brand_short: poison };
    const config = loadConfig({ publicDirectory: null, env: { ASSET_VERSION: "testtesttest" } });
    const html = home(buildPageContext({ locale: "en", config, table }));

    // The body carries it escaped, never raw.
    assert.ok(html.includes(esc(poison)), "escaped copy missing from the page");
    assert.ok(!html.includes(poison), "raw hostile copy reached the markup");
    // Specifically: no injected element, and no stray element terminator that
    // could close the <script> the JSON-LD lives in.
    assert.ok(!html.includes("<img src=x"));
    assert.equal(html.match(/<\/script>/g).length, 4, "a value closed a script element");

    // The JSON-LD, meanwhile, must round-trip the value exactly; escaping it
    // as markup there would publish a literal &amp; to crawlers.
    const block = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];
    assert.equal(JSON.parse(block).name, poison);
    assert.ok(!block.includes("&amp;"));
    assert.ok(!block.includes("&#39;"));
    assert.ok(!block.includes("&quot;"));
});
