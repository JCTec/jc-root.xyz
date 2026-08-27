/* Everything the home template needs, resolved at build time.

   A port of Controllers/PageController.swift and the AppConfig half of
   Support/AppConfig.swift. `t` is the full string table for the page's locale;
   templates reference codes only. */

import { deriveAssetVersion } from "./asset-version.mjs";
import { homePath, htmlLang, ogLocale, otherLocale } from "./strings.mjs";
import { homePerson } from "./structured-data.mjs";

/**
 * Operational values — hosts, versions, destinations — with safe defaults.
 * Nothing here is UI copy; UI copy belongs in `site/strings/`.
 *
 * The environment still wins for every one of them, so a build can pin any
 * value by hand. Unlike the Vapor original, `CANONICAL_HOST` has a default:
 * this repository builds exactly one site, and a CI run that forgot to set it
 * would publish `http://localhost:8080` into every canonical URL, hreflang and
 * sitemap entry with nothing failing. Point a local build somewhere else with
 * `SITE_BASE_URL`, which still overrides it.
 */
export function loadConfig({ publicDirectory, env = process.env } = {}) {
    const canonicalHost = env.CANONICAL_HOST || "jc-root.xyz";
    const siteBaseURL = env.SITE_BASE_URL || `https://${canonicalHost}`;
    /* Prefix for every root-absolute URL the page emits. Empty for the real
       site, which is served from the root of its own domain. A GitHub Pages
       project site is served from a subdirectory — https://<owner>.github.io/
       <repo>/ — where a bare `/css/site.css` resolves against the owner's
       domain, not the site, and 404s. Set BASE_PATH=/<repo> to preview there;
       it goes away at the same moment PAGES_PREVIEW does. */
    const basePath = (env.BASE_PATH || "").replace(/\/+$/, "");
    const contactEmail = env.CONTACT_EMAIL || "juancarlos_tec@proton.me";
    // "dev" only survives when the public directory is unreadable.
    const assetVersion =
        env.ASSET_VERSION || (publicDirectory && deriveAssetVersion(publicDirectory)) || "dev";

    return {
        canonicalHost,
        siteBaseURL,
        basePath,
        assetVersion,
        contactEmail,
        githubURL: env.GITHUB_URL || "https://github.com/JCTec",
        linkedInURL: env.LINKEDIN_URL || "https://www.linkedin.com/in/jctec",
        appStoreURL:
            env.APPSTORE_URL ||
            "https://apps.apple.com/developer/juan-carlos-estevez-rodriguez/id1346871945",
        /* The default is the email-based endpoint (needed once for FormSubmit's
           activation email); after activation, set FORMSUBMIT_ENDPOINT to the
           random alias FormSubmit provides so the raw address never appears in
           the built HTML. */
        formSubmitEndpoint: env.FORMSUBMIT_ENDPOINT || `https://formsubmit.co/${contactEmail}`,
        /* The footer year. A server computed this per request; a static build
           freezes it, so CI rebuilds on a schedule — see .github/workflows. */
        year: Number(env.BUILD_YEAR) || new Date().getFullYear(),
    };
}

/**
 * Project cards are composed from string codes; the card *list* and its links
 * are structure, not copy. Display order is this array — the p<n> codes are
 * identifiers, not positions, so a card can move without renumbering every
 * other card in two catalogs.
 */
function projectCards(s) {
    return [
        {
            tags: s("p5_tags"), name: s("p5_name"), description: s("p5_desc"),
            appStoreURL: null, repoURL: "https://github.com/Living-Root",
        },
        {
            tags: s("p1_tags"), name: s("p1_name"), description: s("p1_desc"),
            appStoreURL: "https://apps.apple.com/mx/app/tapper-counters/id6475695007",
            repoURL: "https://github.com/JCTec/Tapper",
        },
        {
            tags: s("p2_tags"), name: s("p2_name"), description: s("p2_desc"),
            appStoreURL: "https://apps.apple.com/mx/app/mythlog/id6797111874", repoURL: null,
        },
        {
            tags: s("p3_tags"), name: s("p3_name"), description: s("p3_desc"),
            appStoreURL: null, repoURL: "https://github.com/swift-calendar/icalendarkit",
        },
        {
            tags: s("p4_tags"), name: s("p4_name"), description: s("p4_desc"),
            appStoreURL: "https://apps.apple.com/us/app/id1346871946",
            repoURL: "https://github.com/JCTec/iBase",
        },
    ];
}

/** Work history, newest first — copy comes from the strings catalog. */
function experienceCards(s) {
    return Array.from({ length: 8 }, (_, i) => {
        const index = i + 1;
        return {
            role: s(`exp${index}_role`),
            company: s(`exp${index}_company`),
            meta: s(`exp${index}_meta`),
            description: s(`exp${index}_desc`),
        };
    });
}

export function absoluteURL(path, base) {
    return base + path;
}

/** The whole render context for one locale's home page. */
export function buildPageContext({ locale, config, table }) {
    // Fallback to the code itself on a missing key — tests enforce that this
    // never happens for keys referenced by the template or built here.
    const s = (code) => (table[code] === undefined ? code : table[code]);

    const base = config.siteBaseURL;
    const homeURL = absoluteURL(homePath(locale), base);
    const links = {
        github: config.githubURL,
        linkedin: config.linkedInURL,
        appStore: config.appStoreURL,
    };

    return {
        locale: htmlLang(locale),
        ogLocale: ogLocale(locale),
        assetVersion: config.assetVersion,
        /* Prepended to every root-absolute URL in the markup. See loadConfig. */
        basePath: config.basePath,
        canonicalURL: homeURL,
        alternateEN: absoluteURL(homePath("en"), base),
        alternateES: absoluteURL(homePath("es"), base),
        otherLocalePath: homePath(otherLocale(locale)),
        t: table,
        s,
        projects: projectCards(s),
        experience: experienceCards(s),
        stackCore: s("stack_core_items").split("|"),
        stackAlso: s("stack_also_items").split("|"),
        year: config.year,
        links,
        /* FormSubmit endpoint the contact form POSTs to; the raw address is
           never rendered anywhere in the page. */
        formAction: config.formSubmitEndpoint,
        /* Where FormSubmit redirects after a successful submission. The page it
           lands on is this same page — app.js reveals the confirmation. */
        formNext: `${homeURL}?sent=1`,
        /* Absolute URL of the social preview card (og:image / twitter:image). */
        ogImageURL: `${base}/icons/og-card.png`,
        /* Pre-serialized JSON-LD, emitted raw. Built in JS because escaping it
           as markup would corrupt JSON inside a <script>; see structured-data. */
        jsonLD: homePerson({
            name: s("hero_name"),
            jobTitle: s("hero_role"),
            url: homeURL,
            sameAs: [links.github, links.linkedin, links.appStore],
        }),
    };
}
