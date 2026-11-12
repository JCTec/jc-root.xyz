#!/usr/bin/env node
/* jc-root.xyz: the whole site, built once.
 *
 * The Vapor original did this work per request. Nothing about it was dynamic:
 * no database, no session, no input that reaches the origin. So it happens
 * here instead, and the output is a directory GitHub Pages can serve.
 *
 * Usage:  node build.mjs [outDir]        (default: dist)
 * Env:    see lib/content.mjs for the full list; CANONICAL_HOST and
 *         SITE_BASE_URL are the two that decide what URLs get published.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { shippedFiles } from "./lib/asset-version.mjs";
import { buildPageContext, loadConfig } from "./lib/content.mjs";
import { robotsTxt, sitemapXML } from "./lib/seo.mjs";
import { homePath, loadCatalog, LOCALES } from "./lib/strings.mjs";
import { home } from "./lib/templates.mjs";

const root = dirname(fileURLToPath(import.meta.url));
export const SITE_DIR = join(root, "site");
export const PUBLIC_DIR = join(SITE_DIR, "public");
export const STRINGS_DIR = join(SITE_DIR, "strings");

/** Where a locale's page is written, relative to the output directory.
    `/es/` and `/fr/` are directories with an index, which is what a static
    host serves. */
function outputPath(locale) {
    const path = homePath(locale);
    return path === "/" ? "index.html" : join(path.replace(/^\/|\/$/g, ""), "index.html");
}

export function build(outDir, { env = process.env } = {}) {
    // Clean first, so a file deleted from site/ cannot survive in the output
    // and go on being served.
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const config = loadConfig({ publicDirectory: PUBLIC_DIR, env });
    const catalog = loadCatalog(STRINGS_DIR);
    const written = [];

    for (const locale of LOCALES) {
        const ctx = buildPageContext({ locale, config, table: catalog[locale] });
        const target = join(outDir, outputPath(locale));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, home(ctx), "utf8");
        written.push(outputPath(locale));
    }

    writeFileSync(join(outDir, "robots.txt"), robotsTxt(config.siteBaseURL), "utf8");
    writeFileSync(join(outDir, "sitemap.xml"), sitemapXML(config.siteBaseURL), "utf8");
    written.push("robots.txt", "sitemap.xml");

    // Copy exactly the files the asset stamp was computed over, so the two can
    // never disagree about what shipped.
    for (const relativePath of shippedFiles(PUBLIC_DIR) ?? []) {
        const target = join(outDir, relativePath);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(join(PUBLIC_DIR, relativePath), target);
        written.push(relativePath);
    }

    /* The custom domain. Written on every build, so a redeploy cannot quietly
       drop it and 404 the whole site.

       PAGES_PREVIEW withholds it, and is for exactly one situation: publishing
       to a repository before DNS points at it. A CNAME file claims the domain
       the moment it is deployed, and Pages then redirects its own
       *.github.io URL to a domain that still resolves somewhere else, so the
       preview you wanted to look at becomes unreachable. Unset it to cut
       over. */
    if (!env.PAGES_PREVIEW) {
        writeFileSync(join(outDir, "CNAME"), `${config.canonicalHost}\n`, "utf8");
    }
    // The marker that stops Pages running the output through Jekyll, which
    // would otherwise drop any file whose name starts with `_`.
    writeFileSync(join(outDir, ".nojekyll"), "", "utf8");

    return { config, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const outDir = join(root, process.argv[2] ?? "dist");
    const { config, written } = build(outDir);
    if (process.env.PAGES_PREVIEW) {
        console.log("  PAGES_PREVIEW set: no CNAME written, the custom domain is not claimed");
    }
    console.log(`built ${written.length} files → ${outDir}`);
    console.log(`  base URL     ${config.siteBaseURL}`);
    console.log(`  asset stamp  ${config.assetVersion}`);
    console.log(`  form action  ${config.formSubmitEndpoint}`);
}
