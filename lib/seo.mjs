/* Discovery surfaces are generated, not hand-maintained files, so they always
   agree with the configured base URL and the pages the build actually emits.

   A port of Controllers/SEOController.swift. */

import { DEFAULT_LOCALE, homePath, LOCALES } from "./strings.mjs";

export function robotsTxt(base) {
    return `User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`;
}

/** One <url> per locale, each listing every locale as an alternate (itself
    included, as the protocol asks) and x-default on the default locale. */
export function sitemapXML(base) {
    const homes = LOCALES.map((locale) => [locale, base + homePath(locale)]);
    const alternates = [
        ...homes.map(([locale, url]) =>
            `    <xhtml:link rel="alternate" hreflang="${locale}" href="${url}"/>`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${base + homePath(DEFAULT_LOCALE)}"/>`,
    ].join("\n");
    const urls = homes.map(([, url]) => `  <url>
    <loc>${url}</loc>
${alternates}
  </url>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}
