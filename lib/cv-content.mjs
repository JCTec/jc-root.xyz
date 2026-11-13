/* What the printed CV needs beyond the page's own render context: how a URL
 * reads on paper, the contact line and the address in the header, how a date
 * and a description read on paper, and what each locale's file is called.
 *
 * There is deliberately no CV copy here. The CV prints the page's sections in
 * their print form (see contentSections), so there is no CV-only catalog,
 * field list or project list to keep in step with the site.
 *
 * One CV per site locale, and each page's download button links to its own:
 * the language a visitor reads the site in is the language of the PDF.
 */

import { basename, posix } from "node:path";

import { DEFAULT_LOCALE } from "./strings.mjs";

/** The address the CV prints in its header, on the citizenship line. CV only:
    the page never shows a raw address (its contact form posts to a FormSubmit
    alias), and CONTACT_EMAIL stays what it was, the FormSubmit activation
    address. */
export const CV_EMAIL = "juancarlos_tec@proton.me";

/* Full month names and the short form the work history already uses in each
   catalog ("Dec 2023", "dic. 2023", "déc. 2023"). */
const SHORT_MONTHS = {
    en: {
        January: "Jan", February: "Feb", March: "Mar", April: "Apr", May: "May", June: "Jun",
        July: "Jul", August: "Aug", September: "Sep", October: "Oct", November: "Nov", December: "Dec",
    },
    es: {
        enero: "ene.", febrero: "feb.", marzo: "mar.", abril: "abr.", mayo: "may.", junio: "jun.",
        julio: "jul.", agosto: "ago.", septiembre: "sept.", octubre: "oct.", noviembre: "nov.", diciembre: "dic.",
    },
    fr: {
        janvier: "janv.", février: "févr.", mars: "mars", avril: "avr.", mai: "mai", juin: "juin",
        juillet: "juil.", août: "août", septembre: "sept.", octobre: "oct.", novembre: "nov.", décembre: "déc.",
    },
};

/* The day part of a long date, by language: "November 11 – 12, 2026",
   "11 y 12 de noviembre de 2026", "10 novembre 2026". The look-arounds keep a
   year's digits from passing for a day. */
const DAY_PARTS = {
    en: [/\s(?<!\d)\d{1,2}(?!\d)(?:\s–\s\d{1,2})?,(?=\s\d{4})/gu],
    es: [/(?<!\d)\d{1,2}(?!\d)(?:\sy\s\d{1,2})?\sde\s/gu, /\sde(?=\s\d{4})/gu],
    fr: [/(?<!\d)\d{1,2}(?!\d)(?:\set\s\d{1,2})?\s(?=\p{L})/gu],
};

/** A catalog date in the CV's one style, month and year in the short form:
    "October 2026 – present" → "Oct 2026 – present", "November 11 – 12, 2026"
    → "Nov 2026". A date already short comes back unchanged. */
export function shortDate(text, locale) {
    const months = SHORT_MONTHS[locale];
    if (!months) return text;
    let out = text;
    for (const pattern of DAY_PARTS[locale]) out = out.replace(pattern, "");
    for (const [full, short] of Object.entries(months)) {
        out = out.replace(new RegExp(`(?<!\\p{L})${full}(?!\\p{L})`, "gu"), short);
    }
    return out;
}

/** A description as its sentences, for the CV's bullets. Joined back with
    single spaces they are the description again, word for word. */
export function sentences(text) {
    return text.split(/(?<=[.!?])\s+(?=[\p{Lu}\d¿¡"(])/u);
}

/** A URL as a CV reads it: no scheme, no `www.`, no trailing slash. The href
    keeps the full URL, so the PDF's links still resolve when clicked. */
export function displayURL(url) {
    return String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

/** The header's contact line: the site and the profiles. The address is on
    the citizenship line above it; see CV_EMAIL. */
export function contactEntries(config) {
    const entries = [];
    entries.push({ text: displayURL(config.siteBaseURL), href: config.siteBaseURL });
    entries.push({ text: displayURL(config.linkedInURL), href: config.linkedInURL });
    entries.push({ text: displayURL(config.githubURL), href: config.githubURL });
    return entries;
}

/** The path a locale's CV is served at, from the configured CV_PATH.

    The default locale is CV_PATH itself; the others carry the locale before
    the extension (`/juan-carlos-estevez-cv.es.pdf`), so the three files sit
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
    and uploads to the release: nothing is renamed on the way. */
export function cvOutputName(locale, extension, cvPath) {
    const { name } = posix.parse(basename(cvPathFor(locale, cvPath)));
    return `${name}.${extension}`;
}
