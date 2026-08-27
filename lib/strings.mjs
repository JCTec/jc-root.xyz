/* All UI copy, loaded from `site/strings/<locale>.strings` (Apple `.strings`
   syntax: `"code" = "value";`). Code and templates refer to string *codes*
   only — never literal copy. `en.strings` is the source of truth for the key
   set; `es.strings` must keep full key parity, which the test suite enforces.

   A direct port of Support/Localization.swift. The failure behaviour is the
   part worth preserving: a malformed line or a duplicate key throws and stops
   the build, rather than rendering a blank where copy should be. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Site locales. The locale is part of the URL (`/` = EN, `/es/` = ES); there
    is no cookie- or header-based detection, so every page stays crawlable. */
export const LOCALES = ["en", "es"];

export function htmlLang(locale) {
    return locale;
}

/** Open Graph locale code for social previews. */
export function ogLocale(locale) {
    return locale === "es" ? "es_ES" : "en_US";
}

/** The path each locale's home page is published at.

    `/es/` carries a trailing slash because the page is published as
    `dist/es/index.html` and a static host serves a directory, not a bare name.
    It is the canonical form everywhere: hreflang, sitemap, llms.txt. */
export function homePath(locale) {
    return locale === "es" ? "/es/" : "/";
}

export function otherLocale(locale) {
    return locale === "es" ? "en" : "es";
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
