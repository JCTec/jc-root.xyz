/* Cache policy is a pure function of path, so it is reviewable and testable.

   Nothing on GitHub Pages reads this — Pages serves everything `max-age=600`
   and offers no way to change it. It stays here because it is still the single
   source of truth for two things that do matter:

     1. the regression test that every long-cached asset is referenced with a
        `?v=` buster, and
     2. the Cloudflare Cache Rules that reapply this policy at the edge. The
        table in README.md is generated from these same rules by hand; keep
        them in step.

   A port of CachePolicy in Middleware/SiteHeadersMiddleware.swift. */

export function cachePolicyForPath(path) {
    const p = path.toLowerCase();
    if (p.startsWith("/vendor/") || p.startsWith("/icons/") || p === "/favicon.ico") {
        return "public, max-age=31536000, immutable";
    }
    if (p.endsWith(".css") || p.endsWith(".js") || p.endsWith(".webmanifest")) {
        return "public, max-age=86400, stale-while-revalidate=604800";
    }
    if (p === "/robots.txt" || p === "/sitemap.xml" || p === "/llms.txt") {
        return "public, max-age=3600";
    }
    return "no-cache, must-revalidate";
}
