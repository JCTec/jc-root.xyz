/* The CV: the page's own markup, printed.
 *
 * This file lays nothing out. It takes the sections templates.mjs renders for
 * the page and puts a print stylesheet over them, so anything developed on the
 * site is in the PDF on the next push. Do not add a section or a field here;
 * add it to contentSections and it arrives. test/cv.test.mjs refuses structural
 * markup in this file.
 *
 * The only thing here the page does not show is the contact line, because the
 * page words those links as buttons and a printed page needs the addresses.
 *
 * Self-contained on purpose: no stylesheet link, no asset URLs, no `?v=` cache
 * stamp. The renderer reads this file once and emits a PDF, so there is
 * nothing to cache and nothing to go stale. Every interpolation of a catalog
 * or config value still goes through `esc`.
 */

import { contactEntries, displayURL } from "./cv-content.mjs";
import { esc } from "./html.mjs";
import { contentSections, heroIdentity } from "./templates.mjs";

/* Styled by element first, so a section added to the page prints properly
   without a rule of its own. Classes appear only where the page's screen layout
   (tiles, chips, cards) has to fold into a line of text.

   Page geometry: A4, 14mm side margins. The bottom margin is tighter than the
   top because the header already carries whitespace above the name. The CV is
   as long as the site's copy makes it; nothing here trims to a page count. */
const STYLE = `
@page {
    size: A4;
    margin: 13mm 14mm 11mm 14mm;
}

/* Liberation Sans is metric-compatible with Arial, so the fallbacks lay out
   identically when the real font is absent — a local render without
   fonts-liberation installed still paginates the same way CI does. */
html {
    font-family: "Liberation Sans", Arial, Helvetica, sans-serif;
    font-size: 9pt;
    line-height: 1.34;
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
    margin-top: 9pt;
}

/* Keeping a whole entry together is what stops a heading stranding itself at
   the foot of a page above its description. */
article {
    margin-bottom: 5.5pt;
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

/* Projects: the title, then "tags · link · link", then the description. */
.card-project {
    display: flex;
    flex-wrap: wrap;
    gap: 0 2.5pt;
}

.card-title,
.card-desc {
    width: 100%;
}

.card-title {
    order: -2;
}

.card-tags {
    order: -1;
    margin: 0;
    font-size: 8.4pt;
}

/* Before each link rather than after the tags: a card with no links must not
   end its line on a separator. */
.card-link::before {
    content: "· ";
}

.card-link {
    order: -1;
    font-size: 8.4pt;
}

/* Credentials: "Title (Type) — Issuer · Dates", one line each. */
.cred-card {
    display: flex;
    flex-wrap: wrap;
    gap: 0 2.5pt;
    margin-bottom: 2pt;
}

.cred-card > * {
    font-size: 9pt;
    font-weight: normal;
    margin: 0;
}

.cred-title {
    order: -1;
}

.cred-type::before {
    content: "(";
}

.cred-type::after {
    content: ") —";
}

.cred-issuer::after {
    content: " ·";
}

/* Its address after the dates, on the entry's line; a project card's links
   lead their line, a credential's ends it. */
.cred-card > .card-link {
    order: 0;
}

/* What it covered, on its own line under the entry. */
.cred-card > .cred-note {
    width: 100%;
    order: 1;
    font-size: 8.4pt;
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
    const sections = contentSections(ctx, PRINTED_LINKS);

    return `<!DOCTYPE html>
<html lang="${esc(ctx.locale)}">
<head>
<meta charset="utf-8">
<title>${esc(ctx.t.hero_name)} — ${esc(ctx.t.hero_role)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
${heroIdentity(ctx)}
<p class="cv-contact">${contact}</p>
</header>
${sections}
</body>
</html>
`;
}
