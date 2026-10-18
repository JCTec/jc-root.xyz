/* Everything the CV template needs, resolved at build time.
 *
 * The CV is a print layout of the site, not a second document. Every word in
 * it comes from the same `<locale>.strings` catalog the page renders, and the
 * projects come from the same `projectCards` list in the same order, so a
 * string, a date or a card changed on jc-root.xyz is in the PDF on the next
 * push with nothing else to edit. There is no CV-only catalog and no list of
 * which projects the CV carries; test/cv.test.mjs holds the render to that.
 *
 * One CV per site locale, and each page's download button links to its own:
 * the language a visitor reads the site in is the language of the PDF.
 *
 * The email is not in the catalog. It arrives as CONTACT_EMAIL at build time,
 * the same way the contact form's endpoint does, so the address stays out of
 * the repository. See loadConfig in content.mjs.
 */

import { basename, posix } from "node:path";

import { credentials, degrees, languages } from "./education.mjs";
import { projectCards, projectLinks } from "./projects.mjs";
import { skillItems } from "./skills.mjs";
import { DEFAULT_LOCALE } from "./strings.mjs";

/**
 * How many roles the work history holds, counted from the catalog rather than
 * written down. The site and the CV both size their work history from this,
 * so a ninth role added to en.strings appears on both with no other edit.
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

/** The whole render context for the CV, in the site's section order. */
export function buildCVContext({ locale, config, table }) {
    // Same contract as buildPageContext: a missing key falls back to its own
    // code, and the test suite is what guarantees that never happens.
    const s = (code) => (table[code] === undefined ? code : table[code]);

    const experience = Array.from({ length: experienceCount(table) }, (_, i) => {
        const n = i + 1;
        return {
            role: s(`exp${n}_role`),
            company: s(`exp${n}_company`),
            meta: s(`exp${n}_meta`),
            description: s(`exp${n}_desc`),
        };
    });

    /* The site's cards as they are. The links the site words as buttons are
       printed as bare URLs, still clickable in the PDF. */
    const projects = projectCards(s).map((project) => ({
        name: project.name,
        tags: project.tags,
        description: project.description,
        links: projectLinks(project).map(({ url }) => ({ text: displayURL(url), href: url })),
    }));

    return {
        locale,
        name: s("hero_name"),
        role: s("hero_role"),
        platforms: s("hero_platforms"),
        status: s("hero_status"),
        contact: contactEntries(config),
        about: [s("about_body"), s("about_availability")],
        experience,
        projects,
        degrees: degrees(table),
        credentials: credentials(table),
        languages: languages(table),
        skillGroups: [
            { label: s("stack_core_label"), items: skillItems(s("stack_core_items")) },
            { label: s("stack_also_label"), items: skillItems(s("stack_also_items")) },
        ],
        headings: {
            about: s("about_heading"),
            experience: s("exp_heading"),
            projects: s("work_heading"),
            education: s("edu_heading"),
            credentials: s("cred_heading"),
            languages: s("langs_heading"),
            skills: s("stack_heading"),
        },
    };
}
