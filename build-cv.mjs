#!/usr/bin/env node
/* jc-root.xyz — the CV, as HTML for a PDF renderer.
 *
 * The site and the CV are two views of one set of facts. This build emits the
 * second one: a single self-contained HTML file per locale, which WeasyPrint
 * turns into the PDF the site serves and the `cv` release carries.
 *
 * Splitting the render from the rasterization is what keeps the repository
 * dependency-free. Node produces the HTML and the test suite asserts against
 * it; the only thing that needs Python is the last step, and it happens in CI.
 *
 * Usage:  node build-cv.mjs [outDir]     (default: dist-cv)
 *         for f in dist-cv/*.html; do weasyprint "$f" "${f%.html}.pdf"; done
 * Env:    CONTACT_EMAIL — the address on the contact line. Unset, the CV
 *         renders without one rather than with a placeholder; CI supplies it
 *         and then checks the rendered PDF actually contains it.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./lib/content.mjs";
import { buildCVContext, cvOutputName, loadCVCatalog } from "./lib/cv-content.mjs";
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
        const cvTable = loadCVCatalog(STRINGS_DIR, locale);
        const ctx = buildCVContext({ locale, config, table: catalog[locale], cvTable });
        const name = cvOutputName(locale, "html", config.cvPath);
        writeFileSync(join(outDir, name), cv(ctx), "utf8");
        written.push(name);
    }

    return { config, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const outDir = join(root, process.argv[2] ?? "dist-cv");
    const { config, written } = buildCV(outDir);
    console.log(`built ${written.length} file(s) → ${outDir}`);
    for (const name of written) console.log(`  ${name}`);
    if (!config.contactEmail) {
        console.log("  CONTACT_EMAIL unset — the CV renders without an email address");
    }
}
