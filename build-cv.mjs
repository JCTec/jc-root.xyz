#!/usr/bin/env node
/* jc-root.xyz: the CV, as HTML for a PDF renderer.
 *
 * The CV is the page's own sections in their print form (contentSections with
 * `print`) under a print stylesheet, rendered from the page's own context.
 * This build emits a single self-contained HTML file per locale, which
 * WeasyPrint turns into the tagged PDF the site serves and the `cv` release
 * carries.
 *
 * Splitting the render from the rasterization is what keeps the repository
 * dependency-free. Node produces the HTML and the test suite asserts against
 * it; the only thing that needs Python is the last step, and it happens in CI.
 *
 * Usage:  node build-cv.mjs [outDir]     (default: dist-cv; relative to the repo)
 *         for f in dist-cv/*.html; do weasyprint --pdf-tags "$f" "${f%.html}.pdf"; done
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPageContext, loadConfig } from "./lib/content.mjs";
import { cvOutputName } from "./lib/cv-content.mjs";
import { cv } from "./lib/cv-template.mjs";
import { loadCatalog, LOCALES } from "./lib/strings.mjs";

const root = dirname(fileURLToPath(import.meta.url));
export const SITE_DIR = join(root, "site");
export const STRINGS_DIR = join(SITE_DIR, "strings");

export function buildCV(outDir, { env = process.env } = {}) {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    /* publicDirectory is null on purpose: the CV references no assets, so the
       cache stamp derived from site/public/ has nothing to stamp here. */
    const config = loadConfig({ publicDirectory: null, env });
    const catalog = loadCatalog(STRINGS_DIR);
    const written = [];

    for (const locale of LOCALES) {
        const ctx = buildPageContext({ locale, config, table: catalog[locale] });
        const name = cvOutputName(locale, "html", config.cvPath);
        writeFileSync(join(outDir, name), cv(ctx, config), "utf8");
        written.push(name);
    }

    return { config, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const outDir = join(root, process.argv[2] ?? "dist-cv");
    const { written } = buildCV(outDir);
    console.log(`built ${written.length} file(s) → ${outDir}`);
    for (const name of written) console.log(`  ${name}`);
}
