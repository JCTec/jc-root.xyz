/* The CV: the page's own sections in their print form, under a print stylesheet.
 *
 * This file lays nothing out. It takes the sections templates.mjs renders, in
 * their `print` form (the CV's section order, bullets, one-line credentials,
 * short dates), and puts a print stylesheet over them, so anything developed
 * on the site is in the PDF on the next push. Do not add a section or a field
 * here; add it to contentSections and it arrives. test/cv.test.mjs refuses
 * structural markup in this file.
 *
 * The only things here the page does not show are the contact line, because
 * the page words those links as buttons and a printed page needs the
 * addresses, and the email address on the citizenship line.
 *
 * Self-contained on purpose: no stylesheet link, no asset URLs, no `?v=` cache
 * stamp. The renderer reads this file once and emits a PDF, so there is
 * nothing to cache and nothing to go stale. Every interpolation of a catalog
 * or config value still goes through `esc`.
 */

import { contactEntries, CV_EMAIL, displayURL } from "./cv-content.mjs";
import { esc } from "./html.mjs";
import { contentSections, heroIdentity } from "./templates.mjs";

/* Styled by element first, so a section added to the page prints properly
   without a rule of its own. Classes appear only where the page's screen layout
   (tiles, chips, cards) has to fold into a line of text.

   Page geometry: A4, 14mm side margins. The bottom margin is tighter than the
   top because the header already carries whitespace above the name. The CV
   must fit on two pages in every locale; CI renders it and fails the build
   when one runs longer, so a copy change that tips it over is caught there. */
const STYLE = `
@page {
    size: A4;
    margin: 11mm 14mm 9mm 14mm;
}

/* Liberation Sans is metric-compatible with Arial, so the fallbacks lay out
   identically when the real font is absent: a local render without
   fonts-liberation installed still paginates the same way CI does. */
html {
    font-family: "Liberation Sans", Arial, Helvetica, sans-serif;
    font-size: 8.5pt;
    line-height: 1.25;
    color: #000;
}

body {
    margin: 0;
}

a {
    color: #000;
    text-decoration: none;
}

p {
    margin: 0 0 2pt;
}

h1 {
    font-size: 17pt;
    font-weight: bold;
    margin: 0;
    letter-spacing: -0.2pt;
}

/* A heading must never be the last thing on a page. */
h2 {
    font-size: 9.5pt;
    font-weight: bold;
    letter-spacing: 0.9pt;
    margin: 0 0 3.5pt;
    padding-bottom: 1.5pt;
    border-bottom: 0.6pt solid #000;
    text-transform: uppercase;
    break-after: avoid;
}

h3 {
    font-size: 9.5pt;
    font-weight: bold;
    margin: 0;
}

section {
    margin-top: 7.5pt;
}

/* An entry may run on to the next page, but never from its heading alone: the
   heading row, the company and a card's tags line stay with what follows, and
   a split leaves at least two lines on each side. Keeping every entry whole
   instead left page-sized gaps under the long ones and cost the CV its fit on
   two pages. A one-line credential is kept whole. */
article {
    margin-bottom: 4.5pt;
    orphans: 2;
    widows: 2;
}

.exp-item > .justify-content-between,
.exp-company,
.card-title,
.card-meta {
    break-after: avoid;
}

li {
    break-inside: avoid;
}

.cred-card {
    break-inside: avoid;
}

article:last-child {
    margin-bottom: 0;
}

/* Header */
.hero-role {
    font-size: 11pt;
    margin: 1pt 0 0;
}

.hero-platforms,
.hero-status,
.cv-contact {
    font-size: 8.2pt;
    margin: 3pt 0 0;
}

.cv-contact a:not(:last-child)::after {
    content: " ·";
}

.about-body,
.about-availability {
    text-align: justify;
}

/* Experience and education: title on the left, dates on the right. */
.justify-content-between {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6pt;
}

.exp-meta {
    font-size: 8.4pt;
    margin: 0;
    white-space: nowrap;
}

.exp-company {
    margin: 0;
    font-style: italic;
}

.exp-desc,
.card-desc {
    margin: 0.8pt 0 0;
}

.degree-status {
    font-size: 8.4pt;
    margin: 0;
}

/* A role's description: one bullet per sentence. */
.exp-bullets {
    margin: 0.8pt 0 0;
    padding-left: 10pt;
}

.exp-bullets li {
    margin: 0;
}

/* Projects: the title, then "tags · link · link", then the description. */
.card-meta {
    margin: 0;
    font-size: 8.4pt;
}

/* Before each link rather than after the tags: a card with no links must not
   end its line on a separator. */
.card-link::before {
    content: "· ";
}

/* Credentials: "Title (Type): Issuer · Date · link", one line each. */
.cred-card {
    margin-bottom: 1.5pt;
}

.cred-line {
    margin: 0;
}

.cred-title {
    font-weight: bold;
}

/* Languages: "Spanish (Native) · English (C2)", the tiles as one line. */
dl {
    margin: 0;
}

.language-tile,
.language-tile > * {
    display: inline;
    margin: 0;
}

.language-level::before {
    content: "(";
}

.language-level::after {
    content: ")";
}

.language-tile:not(:last-child) .language-level::after {
    content: ") ·";
}

/* Skills: one line per group, the label beside its items. */
.stack-group-label {
    float: left;
    clear: left;
    margin: 0 3pt 0 0;
    font-weight: bold;
}

.stack-group-label::after {
    content: ":";
}

.stack-section .d-flex {
    margin-bottom: 1.5pt;
}

.chip:not(:last-child)::after {
    content: " ·";
}
`;

/* On paper a card's button reads as the address it goes to, still clickable. */
const PRINTED_LINKS = { linkLabel: (link) => esc(displayURL(link.url)) };

/** `ctx` is the page's own render context; see buildPageContext. */
export function cv(ctx, config) {
    const contact = contactEntries(config)
        .map((entry) => `<a href="${esc(entry.href)}">${esc(entry.text)}</a>`)
        .join("\n");
    const identity = heroIdentity(ctx, { email: CV_EMAIL });
    const sections = contentSections(ctx, { ...PRINTED_LINKS, print: true });

    return `<!DOCTYPE html>
<html lang="${esc(ctx.locale)}">
<head>
<meta charset="utf-8">
<title>${esc(ctx.t.hero_name)} · ${esc(ctx.t.hero_role)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
${identity}
<p class="cv-contact">${contact}</p>
</header>
${sections}
</body>
</html>
`;
}
