/* Locale parity, the .strings parser, and the agreement between the codes the
   catalogs define and the codes the site references.

   A port of the Localization half of Tests/AppTests/AppTests.swift. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { STRINGS_DIR } from "../build.mjs";
import { loadCatalog, LOCALES, parseStrings } from "../lib/strings.mjs";

const catalog = loadCatalog(STRINGS_DIR);
const root = join(import.meta.dirname, "..");

test("Every locale keeps full key parity with EN, with non-empty values", () => {
    const expected = Object.keys(catalog.en).sort();
    assert.ok(expected.length > 0);
    assert.ok(LOCALES.length > 1, "expected more than one locale");
    for (const locale of LOCALES) {
        assert.deepEqual(Object.keys(catalog[locale]).sort(), expected, `${locale}.strings key set`);
        for (const [key, value] of Object.entries(catalog[locale])) {
            assert.notEqual(value, "", `empty ${locale.toUpperCase()} value for ${key}`);
        }
    }
});

/* Codes assembled at runtime instead of written out, which a static scan
   cannot see. Every entry is a claim that some loop builds those keys — keep
   the list short, and keep it honest: it is the only way a genuinely unused
   key can hide from the test below. */
const DYNAMIC_KEY_PATTERNS = [
    // content.mjs builds these for each row of the work history.
    /^exp[0-9]+_(role|company|meta|desc)$/,
    // education.mjs builds these for each degree, credential and language.
    /^deg[0-9]+_(title|dates|school|note|status)$/,
    /^cred[0-9]+_(type|title|issuer|dates|note)$/,
    /^language[0-9]+_(name|level)$/,
    // templates.mjs builds `lang_<locale>` for each entry in LOCALES.
    /^lang_[a-z]+$/,
];

test("Every locale has a label for the language toggle", () => {
    for (const locale of LOCALES) {
        assert.ok(catalog.en[`lang_${locale}`], `en.strings has no lang_${locale}`);
    }
});

test("Every string code is referenced, and every reference resolves", () => {
    const templates = readFileSync(join(root, "lib/templates.mjs"), "utf8");
    const content = readFileSync(join(root, "lib/content.mjs"), "utf8")
        + readFileSync(join(root, "lib/projects.mjs"), "utf8");

    const referenced = new Set([
        ...codes(templates, /\bt\.([A-Za-z0-9_]+)/g),
        ...codes(content, /\bs\("([A-Za-z0-9_]+)"\)/g),
    ]);
    assert.ok(referenced.size > 20, `expected many references, found ${referenced.size}`);

    const defined = new Set(Object.keys(catalog.en));
    const missing = [...referenced].filter((code) => !defined.has(code)).sort();
    assert.deepEqual(missing, [], `referenced but absent from en.strings: ${missing}`);

    const unused = [...defined]
        .filter((key) => !referenced.has(key))
        .filter((key) => !DYNAMIC_KEY_PATTERNS.some((rx) => rx.test(key)))
        .sort();
    assert.deepEqual(unused, [], `defined but referenced by nothing: ${unused}`);
});

function codes(source, pattern) {
    return [...source.matchAll(pattern)].map((m) => m[1]);
}

test(".strings parser accepts the format and rejects malformed lines", () => {
    const parsed = parseStrings(
        [
            "// comment",
            '"a_key" = "A value";',
            '"b_key" = "Escaped \\"quote\\" and newline\\n";',
        ].join("\n"),
    );
    assert.equal(parsed.a_key, "A value");
    assert.equal(parsed.b_key, 'Escaped "quote" and newline\n');

    assert.throws(() => parseStrings('"missing_semicolon" = "value"'));
    assert.throws(() => parseStrings('"dup" = "one";\n"dup" = "two";'));
});
