/* The Cloudflare response-header rules that apply the site's header and cache
   policy at the edge, generated from lib/headers.mjs and lib/cache-policy.mjs.

   Kept here rather than in scripts/cloudflare-headers.mjs so the test suite
   can read them: the script talks to Cloudflare the moment it runs, and a rule
   missing from this list is exactly the failure a test has to be able to see.
   It happened: the PDFs (the CVs, the privacy policies) matched no cache rule,
   so Cloudflare applied its own default to them (a four-hour browser cache),
   and a visitor kept getting last release's CV while cache-policy.mjs said
   "no-cache". */

import { cachePolicyForPath } from "./cache-policy.mjs";
import { EDGE_HEADERS } from "./headers.mjs";

const P = "http.request.uri.path";

const setHeaders = (headers) => ({
    action: "rewrite",
    action_parameters: {
        headers: Object.fromEntries(
            Object.entries(headers).map(([name, value]) => [name, { operation: "set", value }]),
        ),
    },
});

const cacheRule = (expression, samplePath, description) => ({
    ...setHeaders({ "Cache-Control": cachePolicyForPath(samplePath) }),
    expression,
    description,
    enabled: true,
});

/** Every rule. Mutually exclusive by construction, so rule order cannot
    change the answer. */
export function edgeRules() {
    return [
        {
            ...setHeaders(EDGE_HEADERS),
            expression: "true",
            description: "Security headers on every response",
            enabled: true,
        },
        cacheRule(
            `starts_with(${P}, "/vendor/") or starts_with(${P}, "/icons/") or ${P} == "/favicon.ico"`,
            "/vendor/x.css",
            "Vendored assets and icons: immutable for a year",
        ),
        cacheRule(
            `(ends_with(${P}, ".css") or ends_with(${P}, ".js") or ends_with(${P}, ".webmanifest"))`
                + ` and not starts_with(${P}, "/vendor/") and not starts_with(${P}, "/icons/")`,
            "/css/site.css",
            "Site CSS/JS: revalidate daily, keyed on ?v=",
        ),
        cacheRule(
            `${P} in {"/robots.txt" "/sitemap.xml" "/llms.txt"}`,
            "/robots.txt",
            "Discovery surfaces: an hour",
        ),
        cacheRule(
            `ends_with(${P}, "/") or ends_with(${P}, ".html")`,
            "/",
            "HTML is never publicly cached",
        ),
        /* The page links each build's CV with a ?v= stamp, which already gets
           a fresh file past any cache. This covers the bare URL (a bookmark, a
           link pasted into LinkedIn) and the privacy policies: revalidate on
           every request, so the browser asks before reusing a copy and gets a
           cheap 304 when it is still current. Without it Cloudflare's default
           for a PDF applies. */
        cacheRule(
            `ends_with(${P}, ".pdf")`,
            "/juan-carlos-estevez-cv.pdf",
            "PDFs (the CVs, the privacy policies): revalidate on every request",
        ),
    ];
}
