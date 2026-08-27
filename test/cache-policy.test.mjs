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
