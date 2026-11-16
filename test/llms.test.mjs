/* llms.txt: the one summary of the site that is not generated from the catalogs.
 *
 * It is hand-written and served as-is, so nothing rebuilds it when the copy
 * changes, and it drifts: a project reordered or removed on the page, a claim
 * dropped everywhere else and still stated here. These tests hold it to the
 * site where that can be checked mechanically. The rest is on whoever changes
 * the copy; see CLAUDE.md.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { STRINGS_DIR } from "../build.mjs";
import { projectCards } from "../lib/projects.mjs";
import { loadCatalog } from "../lib/strings.mjs";

const root = join(import.meta.dirname, "..");
const llms = readFileSync(join(root, "site/public/llms.txt"), "utf8");
const catalog = loadCatalog(STRINGS_DIR);

/* Claims removed from the site. When a claim comes off the page, add it here
   so it cannot linger in llms.txt. */
const RETIRED = [/atomic design/i, /A\/B test/i, /full-stack IoT/i, /US visa/i,
    /health and wellness/i, /dynamic lists/i, /ten languages/i, /hydropon/i,
    /piano/i, /yoga/i, /kitesurf/i];

/** The project names under "## Selected work", in the order listed. */
function selectedWork(text) {
    const section = text.split(/^## Selected work$/m)[1]?.split(/^## /m)[0];
    assert.ok(section, "llms.txt has no \"## Selected work\" section");
    return [...section.matchAll(/^- ([^:\n]+):/gm)].map((m) => m[1]);
}

test("llms.txt lists the site's projects, in the site's order", () => {
    const cards = projectCards((code) => catalog.en[code]).map((card) => card.name);
    assert.deepEqual(selectedWork(llms), cards,
        "Selected work in site/public/llms.txt differs from lib/projects.mjs");
});

test("llms.txt repeats no claim the site has dropped", () => {
    for (const phrase of RETIRED) {
        assert.doesNotMatch(llms, phrase, `site/public/llms.txt still says ${phrase}`);
    }
});
