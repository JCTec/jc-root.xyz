/* GitHub Pages ignores this policy; Cloudflare reapplies it. The rules stay
   tested because the README's edge configuration is generated from them by
   hand, and because the ?v= regression test in build.test.mjs asks this
   function which assets are long-cached. */

import assert from "node:assert/strict";
import { test } from "node:test";

import { cachePolicyForPath } from "../lib/cache-policy.mjs";

test("Vendored assets are immutable; site CSS/JS revalidate daily", () => {
    assert.equal(
        cachePolicyForPath("/vendor/bootstrap/css/bootstrap.min.css"),
        "public, max-age=31536000, immutable",
    );
    assert.equal(cachePolicyForPath("/icons/favicon.svg"), "public, max-age=31536000, immutable");
    assert.equal(
        cachePolicyForPath("/css/site.css"),
        "public, max-age=86400, stale-while-revalidate=604800",
    );
    assert.equal(
        cachePolicyForPath("/js/app.js"),
        "public, max-age=86400, stale-while-revalidate=604800",
    );
    assert.equal(cachePolicyForPath("/robots.txt"), "public, max-age=3600");
    assert.equal(cachePolicyForPath("/llms.txt"), "public, max-age=3600");
    assert.equal(cachePolicyForPath("/"), "no-cache, must-revalidate");
    assert.equal(cachePolicyForPath("/es/"), "no-cache, must-revalidate");
});

/* The edge rules are what visitors actually get, and the policy above is only
   true if some rule applies it. The CV PDFs once matched none, so Cloudflare
   sent its default four-hour browser cache and returning visitors kept an old
   CV. Every kind of path the site serves must match exactly one cache rule,
   and that rule must send this policy. */
import { loadConfig } from "../lib/content.mjs";
import { cvPathFor } from "../lib/cv-content.mjs";
import { edgeRules } from "../lib/edge-rules.mjs";
import { LOCALES } from "../lib/strings.mjs";

/** Cloudflare's expression language, as far as these rules use it. */
function matches(expression, path) {
    const P = "http.request.uri.path";
    const js = expression
        .replace(/starts_with\(http\.request\.uri\.path, ("[^"]*")\)/g, "path.startsWith($1)")
        .replace(/ends_with\(http\.request\.uri\.path, ("[^"]*")\)/g, "path.endsWith($1)")
        .replace(new RegExp(`${P.replace(/\./g, "\\.")} == ("[^"]*")`, "g"), "path === $1")
        .replace(new RegExp(`${P.replace(/\./g, "\\.")} in \\{([^}]*)\\}`, "g"),
            (_, list) => `[${list.trim().split(/\s+/).join(",")}].includes(path)`)
        .replace(/\band\b/g, "&&").replace(/\bor\b/g, "||").replace(/\bnot\b/g, "!");
    return new Function("path", `return (${js});`)(path);
}

test("Every path the site serves gets its cache policy from exactly one edge rule", () => {
    const { cvPath } = loadConfig({ publicDirectory: null, env: {} });
    const cvPaths = LOCALES.map((locale) => cvPathFor(locale, cvPath));
    const cacheRules = edgeRules().filter((rule) => rule.action_parameters.headers["Cache-Control"]);

    const served = [
        ...cvPaths, "/", "/es/", "/fr/", "/legal/", "/legal/tapper/index.html",
        "/css/site.css", "/js/app.js", "/vendor/bootstrap/css/bootstrap.min.css",
        "/icons/favicon.svg", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/llms.txt",
        "/legal/tapper/tapper-privacy-policy.pdf",
    ];
    for (const path of served) {
        const hits = cacheRules.filter((rule) => matches(rule.expression, path));
        assert.equal(hits.length, 1, `${path} matches ${hits.length} cache rules`);
        assert.equal(hits[0].action_parameters.headers["Cache-Control"].value, cachePolicyForPath(path),
            `${path}: the edge sends a different policy than cache-policy.mjs`);
    }
    for (const path of cvPaths) {
        assert.equal(cachePolicyForPath(path), "no-cache, must-revalidate", `${path} must revalidate`);
    }
});
