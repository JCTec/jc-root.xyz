/* The rendered CVs: what only the PDFs can show.
 *
 * Not part of the hermetic suite (`test/*.test.mjs` does not reach this
 * directory): it needs the PDFs WeasyPrint writes into dist-cv/, and
 * poppler's pdfinfo to read them. CI runs it in the render step, right after
 * WeasyPrint. Locally:
 *
 *     node build-cv.mjs
 *     for f in dist-cv/*.html; do weasyprint --pdf-tags "$f" "${f%.html}.pdf"; done
 *     node --test test/rendered/*.test.mjs
 *
 * A missing PDF fails rather than skips: a check that quietly passes when
 * there is nothing to check is how a third page ships.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { loadConfig } from "../../lib/content.mjs";
import { cvOutputName } from "../../lib/cv-content.mjs";
import { LOCALES } from "../../lib/strings.mjs";

const CV_DIR = join(import.meta.dirname, "..", "..", "dist-cv");

/* The same config build-cv.mjs reads, so a CV_PATH override names the same files. */
const { cvPath } = loadConfig({ publicDirectory: null, env: process.env });

function pageCount(pdf) {
    const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
    const match = info.match(/^Pages:\s+(\d+)$/m);
    assert.ok(match, `pdfinfo reported no page count for ${pdf}`);
    return Number(match[1]);
}

/* Exactly two: a third page is a CV that spilled over, and a single page
   means a section went missing. */
test("Every locale's CV is exactly two pages", () => {
    for (const locale of LOCALES) {
        const pdf = join(CV_DIR, cvOutputName(locale, "pdf", cvPath));
        assert.ok(existsSync(pdf), `${locale}: ${pdf} has not been rendered`);
        assert.equal(pageCount(pdf), 2, `${locale}: ${pdf} is not two pages`);
    }
});
