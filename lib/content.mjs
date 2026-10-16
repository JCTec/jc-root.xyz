/* Everything the home template needs, resolved at build time.

   A port of Controllers/PageController.swift and the AppConfig half of
   Support/AppConfig.swift. `t` is the full string table for the page's locale;
   templates reference codes only. */

import { deriveAssetVersion } from "./asset-version.mjs";
import { cvPathFor, experienceCount } from "./cv-content.mjs";
import { projectCards } from "./projects.mjs";
import { skillItems } from "./skills.mjs";
import { DEFAULT_LOCALE, homePath, htmlLang, LOCALES, ogLocale } from "./strings.mjs";
import { homePerson } from "./structured-data.mjs";

/** What the form points at when nothing configured it.
 *
 * Deliberately not a working endpoint and deliberately not an address: it names
 * the variable that is missing, and `node --test` and CI both fail on it, so it
 * cannot reach production quietly.
 */
export const UNSET_ENDPOINT = "https://formsubmit.co/FORMSUBMIT_ENDPOINT-is-unset";

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
    /* No address is baked in here. The endpoint is a FormSubmit alias supplied
       by the environment; CONTACT_EMAIL exists only for the one-time activation
       build, where FormSubmit needs to email the real address before it will
       issue an alias. Unset, the build emits a placeholder that is obviously
       not a form target, and CI refuses to publish it — a broken form is
       recoverable, a harvested address is not. */
    const contactEmail = env.CONTACT_EMAIL || null;
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
        /* The published CV, served from this site.

           It was a GitHub release asset first, and that was wrong: a release
           asset on a private repository is only served to an authenticated
           browser session, so the download button 404'd for precisely the
           people it exists for. Here it needs no GitHub account, no release
           tag to survive, and it goes public at the same moment the site does.

           Still never committed — CI copies it into dist/ after the render,
           the same way build.mjs writes index.html. Root-absolute so it runs
           through the base path like every other URL the page emits, and named
           for a stranger's Downloads folder rather than "cv.pdf". This is the
           default locale's copy; the others derive from it, see cvPathFor. */
        cvPath: env.CV_PATH || "/juan-carlos-estevez-cv.pdf",
        /* The default is the email-based endpoint (needed once for FormSubmit's
           activation email); after activation, set FORMSUBMIT_ENDPOINT to the
           random alias FormSubmit provides so the raw address never appears in
           the built HTML. */
        formSubmitEndpoint:
            env.FORMSUBMIT_ENDPOINT
            || (contactEmail ? `https://formsubmit.co/${contactEmail}` : UNSET_ENDPOINT),
        /* The footer year. A server computed this per request; a static build
           freezes it, so CI rebuilds on a schedule — see .github/workflows. */
        year: Number(env.BUILD_YEAR) || new Date().getFullYear(),
    };
}

/** Work history, newest first — copy comes from the strings catalog. */
function experienceCards(s, count) {
    return Array.from({ length: count }, (_, i) => {
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
        /* Every locale's home, this one included, in LOCALES order: the
           hreflang links and the language toggle are both drawn from it. */
        alternates: LOCALES.map((code) => ({
            locale: code,
            path: homePath(code),
            url: absoluteURL(homePath(code), base),
        })),
        defaultLocale: DEFAULT_LOCALE,
        t: table,
        s,
        projects: projectCards(s),
        experience: experienceCards(s, experienceCount(table)),
        stackCore: skillItems(s("stack_core_items")),
        stackAlso: skillItems(s("stack_also_items")),
        year: config.year,
        links,
        /* This locale's own CV. Same-origin, so it goes through `u()` in the
           template, not `esc()`. */
        cvPath: cvPathFor(locale, config.cvPath),
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
