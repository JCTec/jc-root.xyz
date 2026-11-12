/* All UI copy, loaded from `site/strings/<locale>.strings` (Apple `.strings`
   syntax: `"code" = "value";`). Code and templates refer to string *codes*
   only, never literal copy. `en.strings` is the source of truth for the key
   set; every other locale must keep full key parity, which the test suite
   enforces.

   A direct port of Support/Localization.swift. The failure behaviour is the
   part worth preserving: a malformed line or a duplicate key throws and stops
   the build, rather than rendering a blank where copy should be. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Site locales. The locale is part of the URL (`/` = EN, `/es/` = ES,
    `/fr/` = FR); there is no cookie- or header-based detection, so every page
    stays crawlable. Adding a locale is one entry here plus a
    `site/strings/<locale>.strings` file with the full key set. */
export const LOCALES = ["en", "es", "fr"];

/** The locale everything else is an alternate of: `/` and `x-default`. */
export const DEFAULT_LOCALE = "en";

export function htmlLang(locale) {
    return locale;
}

/** Open Graph locale code for social previews. */
const OG_LOCALES = { en: "en_US", es: "es_ES", fr: "fr_FR" };

export function ogLocale(locale) {
    const code = OG_LOCALES[locale];
    if (!code) throw new Error(`No Open Graph locale for "${locale}"`);
    return code;
}

/** The path each locale's home page is published at.

    `/es/` and `/fr/` carry a trailing slash because the page is published as
    `dist/<locale>/index.html` and a static host serves a directory, not a bare
    name. It is the canonical form everywhere: hreflang, sitemap, llms.txt. */
export function homePath(locale) {
    return locale === DEFAULT_LOCALE ? "/" : `/${locale}/`;
}

/**
 * Line-based `.strings` parser: blank lines and `//` comments are skipped;
 * every other line must be `"key" = "value";`. Values support `\"`, `\\`, `\n`
 * and `\t` escapes. Anything else fails loudly rather than rendering blanks.
 */
export function parseStrings(contents, file = "<memory>") {
    const result = new Map();
    const lines = contents.split(/\r\n|\r|\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (line === "" || line.startsWith("//")) continue;
        const pair = parseLine(line);
        if (!pair) {
            throw new Error(`Malformed .strings line at ${file}:${index + 1}: ${line}`);
        }
        const [key, value] = pair;
        if (result.has(key)) {
            throw new Error(`Duplicate key "${key}" in ${file}`);
        }
        result.set(key, value);
    }
    return Object.fromEntries(result);
}

function parseLine(line) {
    let rest = line;
    const key = takeQuoted(rest);
    if (!key) return null;
    rest = key.rest.replace(/^[ \t]+/, "");
    if (!rest.startsWith("=")) return null;
    rest = rest.slice(1).replace(/^[ \t]+/, "");
    const value = takeQuoted(rest);
    if (!value) return null;
    const trailing = value.rest.replace(/^[ \t]+/, "");
    if (!trailing.startsWith(";")) return null;
    const after = trailing.slice(1).replace(/^[ \t]+/, "");
    if (after !== "" && !after.startsWith("//")) return null;
    return [key.out, value.out];
}

function takeQuoted(input) {
    if (!input.startsWith('"')) return null;
    let out = "";
    let i = 1;
    while (i < input.length) {
        const char = input[i];
        i += 1;
        if (char === "\\") {
            const escaped = input[i];
            if (escaped === undefined) return null;
            i += 1;
            if (escaped === "n") out += "\n";
            else if (escaped === "t") out += "\t";
            else out += escaped;
            continue;
        }
        if (char === '"') {
            return { out, rest: input.slice(i) };
        }
        out += char;
    }
    return null;
}

/** Every locale's table, keyed by locale. Throws if a file is missing. */
export function loadCatalog(directory) {
    const tables = {};
    for (const locale of LOCALES) {
        const path = join(directory, `${locale}.strings`);
        tables[locale] = parseStrings(readFileSync(path, "utf8"), path);
    }
    return tables;
}
