/* What the printed CV needs beyond the page's own render context: how a URL
 * reads on paper, the contact line, and what each locale's file is called.
 *
 * There is deliberately no CV content here. The CV prints the page's sections,
 * see cv-template.mjs, so there is no CV-only catalog, field list or project
 * list to keep in step with the site.
 *
 * One CV per site locale, and each page's download button links to its own:
 * the language a visitor reads the site in is the language of the PDF.
 *
 * The email is not in the catalog. It arrives as CONTACT_EMAIL at build time,
 * the same way the contact form's endpoint does, so the address stays out of
 * the repository. See loadConfig in content.mjs.
 */

import { basename, posix } from "node:path";

import { DEFAULT_LOCALE } from "./strings.mjs";

/** A URL as a CV reads it: no scheme, no `www.`, no trailing slash. The href
    keeps the full URL, so the PDF's links still resolve when clicked. */
export function displayURL(url) {
    return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

/** The header's contact line.
 *
 * The email entry is present only when CONTACT_EMAIL was supplied. An unset
 * variable yields a CV that is correct and simply quieter, rather than one
 * carrying a placeholder that looks like an address.
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
