/* Everything the CV template needs, resolved at build time.
 *
 * The CV is a third render target off the same catalogs the site uses. The
 * split is deliberate and enforced by test/cv.test.mjs:
 *
 *   <locale>.strings     facts — name, role, companies, job titles, dates,
 *                        education, languages, project names. Shared with the
 *                        site, so a date cannot say one thing on jc-root.xyz
 *                        and another in the PDF.
 *   cv.<locale>.strings  the CV's own prose — summary, skill groups, the
 *                        bullets under each role, interests.
 *
 * One CV per site locale, and each page's download button links to its own:
 * the language a visitor reads the site in is the language of the PDF.
 *
 * The email is in neither. It arrives as CONTACT_EMAIL at build time, the same
 * way the contact form's endpoint does, so the address stays out of the
 * repository. See loadConfig in content.mjs.
 */

import { readFileSync } from "node:fs";
import { basename, join, posix } from "node:path";

import { skillItems } from "./skills.mjs";
import { DEFAULT_LOCALE, parseStrings } from "./strings.mjs";

/** Site projects the CV carries, in CV order.
 *
 * The site has one more: p5 (Living Root), which the CV covers under
 * Experience instead — it is work, not a side project, and saying it twice
 * would cost a third of a page. test/cv.test.mjs holds this list against the
 * catalog so a new site project cannot be silently absent from the CV. */
export const CV_PROJECTS = ["p1", "p2", "p3", "p4"];

/** The CV's copy for one locale. The CV is published in every site locale,
    so `cv.<locale>.strings` must exist for each entry in LOCALES; the test
    suite holds the three files to one key set, as it does for the site's. */
export function loadCVCatalog(directory, locale) {
    const path = join(directory, `cv.${locale}.strings`);
    return parseStrings(readFileSync(path, "utf8"), path);
}

/**
 * How many roles the work history holds, counted from the catalog rather than
 * written down. `content.mjs` hard-codes 8; deriving it here means adding a
 * ninth role to en.strings makes this side notice on its own, and the test
 * suite then asks for its bullets instead of rendering a role with none.
 */
export function experienceCount(table) {
    const indices = Object.keys(table)
        .map((key) => key.match(/^exp(\d+)_role$/))
        .filter(Boolean)
        .map((match) => Number(match[1]));
    return indices.length === 0 ? 0 : Math.max(...indices);
}

/** A URL as a CV reads it: no scheme, no `www.`, no trailing slash. The href
    keeps the full URL, so the PDF's links still resolve when clicked. */
export function displayURL(url) {
    return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

/** The header's contact line.
 *
 * The email entry is present only when CONTACT_EMAIL was supplied. An unset
 * variable yields a CV that is correct and simply quieter, rather than one
 * carrying a placeholder that looks like an address — and CI asserts the
 * address *is* there for the copy it publishes, so the quiet version cannot
 * ship by accident.
 */
export function contactEntries(config) {
    const entries = [];
    if (config.contactEmail) {
        entries.push({ text: config.contactEmail, href: `mailto:${config.contactEmail}` });
    }
    entries.push({ text: displayURL(config.siteBaseURL), href: config.siteBaseURL });
    entries.push({ text: displayURL(config.linkedInURL), href: config.linkedInURL });
    entries.push({ text: displayURL(config.githubURL), href: config.githubURL });
    return entries;
}

/** The path a locale's CV is served at, from the configured CV_PATH.

    The default locale is CV_PATH itself; the others carry the locale before
    the extension — `/juan-carlos-estevez-cv.es.pdf` — so the three files sit
    side by side and each is named for a stranger's Downloads folder. The
    hero's button on each page links to its own locale's copy. */
export function cvPathFor(locale, cvPath) {
    if (locale === DEFAULT_LOCALE) return cvPath;
    const { dir, name, ext } = posix.parse(cvPath);
    return posix.join(dir, `${name}.${locale}${ext}`);
}

/** Where a locale's CV render is written, relative to the output directory:
    the published basename with the extension swapped. WeasyPrint keeps the
    basename, so the PDF it writes is already the file CI copies into dist/
    and uploads to the release — nothing is renamed on the way. */
export function cvOutputName(locale, extension, cvPath) {
    const { name } = posix.parse(basename(cvPathFor(locale, cvPath)));
    return `${name}.${extension}`;
}

/** The whole render context for the CV. */
export function buildCVContext({ locale, config, table, cvTable }) {
    // Same contract as buildPageContext: a missing key falls back to its own
    // code, and the test suite is what guarantees that never happens.
    const s = (code) => (table[code] === undefined ? code : table[code]);
    const c = (code) => (cvTable[code] === undefined ? code : cvTable[code]);
    const list = (code) => c(code).split("|");

    const experience = Array.from({ length: experienceCount(table) }, (_, i) => {
        const n = i + 1;
        return {
            role: s(`exp${n}_role`),
            company: s(`exp${n}_company`),
            meta: s(`exp${n}_meta`),
            // Optional: only two roles carry framing instead of a bullet list.
            note: cvTable[`cv_exp${n}_note`] ?? null,
            bullets: list(`cv_exp${n}_bullets`),
        };
    });

    /* Names, platform tags and descriptions are the site's — its copy is the
       better copy, and a second version of it here is precisely the drift this
       split exists to prevent. The CV adds only the stack and the URL, which
       the site carries as links rather than as text. */
    const projects = CV_PROJECTS.map((key) => ({
        name: s(`${key}_name`),
        meta: `${s(`${key}_tags`)} · ${c(`cv_${key}_links`)}`,
        description: s(`${key}_desc`),
    }));

    const skillGroups = [1, 2, 3, 4].map((n) => ({
        label: c(`cv_skills${n}_label`),
        items: skillItems(c(`cv_skills${n}_items`)),
    }));

    return {
        locale,
        name: s("hero_name"),
        role: s("hero_role"),
        passport: c("cv_passport"),
        contact: contactEntries(config),
        summary: c("cv_summary"),
        skillGroups,
        experience,
        projects,
        /* Education and languages are facts, so they come from the site's
           catalog verbatim. edu5 is the certification and langs_line the
           languages, which is why the right-hand column is those two. */
        education: [s("edu1"), s("edu2"), s("edu3"), s("edu4")],
        certifications: [s("edu5"), s("langs_line")],
        interests: c("cv_interests"),
        headings: {
            summary: c("cv_heading_summary"),
            skills: c("cv_heading_skills"),
            experience: c("cv_heading_experience"),
            projects: c("cv_heading_projects"),
            education: c("cv_heading_education"),
            certifications: c("cv_heading_certs"),
            interests: c("cv_heading_interests"),
        },
    };
}
