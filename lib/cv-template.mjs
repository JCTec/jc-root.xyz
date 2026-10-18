/* The CV, as one self-contained HTML document for WeasyPrint to paginate.
 *
 * Self-contained on purpose: no stylesheet link, no asset URLs, no `?v=` cache
 * stamp. The renderer reads this file once and emits a PDF, so there is
 * nothing to cache and nothing to go stale — and a single file is also the
 * whole reason a CI job can render it without a checkout of site/public.
 *
 * The escaping rule from templates.mjs applies here unchanged: every
 * interpolation of a catalog or config value goes through `esc`, and
 * test/cv.test.mjs refuses a bare one.
 */

import { esc } from "./html.mjs";

/* Page geometry: A4, 14mm side margins. The bottom margin is tighter than the
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

/* Header */
.cv-name {
    font-size: 17pt;
    font-weight: bold;
    margin: 0;
    letter-spacing: -0.2pt;
}

.cv-role {
    font-size: 11pt;
    margin: 1pt 0 0;
}

.cv-contact {
    font-size: 8.2pt;
    margin: 3pt 0 0;
}

.cv-sep {
    padding: 0 2pt;
}

/* Sections. A heading must never be the last thing on a page. */
.cv-section {
    margin-top: 9pt;
}

.cv-heading {
    font-size: 9.5pt;
    font-weight: bold;
    letter-spacing: 0.9pt;
    margin: 0 0 3.5pt;
    padding-bottom: 1.5pt;
    border-bottom: 0.6pt solid #000;
    text-transform: uppercase;
    break-after: avoid;
}

.cv-para {
    margin: 0 0 2pt;
    text-align: justify;
}

/* Skills: one line per group, label in bold, items separated by a middot. */
.cv-skill-group {
    margin: 0 0 1.5pt;
}

.cv-skill-label {
    font-weight: bold;
}

/* Experience and projects. Keeping a whole entry together is what stops a
   role heading stranding itself at the foot of a page above its bullets. */
.cv-entry {
    margin-bottom: 5.5pt;
    break-inside: avoid;
}

.cv-entry:last-child {
    margin-bottom: 0;
}

.cv-entry-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6pt;
}

.cv-entry-title {
    font-size: 9.5pt;
    font-weight: bold;
    margin: 0;
}

.cv-entry-meta {
    font-size: 8.4pt;
    margin: 0;
    white-space: nowrap;
}

.cv-entry-company {
    margin: 0;
    font-style: italic;
}

.cv-entry-desc {
    margin: 0.8pt 0 0;
}

.cv-project-meta {
    margin: 0;
    font-size: 8.4pt;
}

.cv-line {
    margin: 0 0 2pt;
}
`;

/** `label: a · b · c` for one skill group. */
function skillGroup(group) {
    const items = group.items
        .map(({ text, href }) => href ? `<a href="${esc(href)}">${esc(text)}</a>` : esc(text))
        .join(" · ");
    return `        <p class="cv-skill-group"><span class="cv-skill-label">${esc(group.label)}:</span> ${items}</p>`;
}

function paragraphs(values) {
    return values
        .map((value) => `    <p class="cv-para">${esc(value)}</p>`)
        .join("\n");
}

function job(entry) {
    return `    <article class="cv-entry">
        <div class="cv-entry-head">
            <p class="cv-entry-title">${esc(entry.role)}</p>
            <p class="cv-entry-meta">${esc(entry.meta)}</p>
        </div>
        <p class="cv-entry-company">${esc(entry.company)}</p>
        <p class="cv-entry-desc">${esc(entry.description)}</p>
    </article>`;
}

/** `tags · link · link`: the card's platform line, then every link it has. */
function project(entry) {
    const meta = [
        esc(entry.tags),
        ...entry.links.map((link) => `<a href="${esc(link.href)}">${esc(link.text)}</a>`),
    ].join(" · ");
    return `    <article class="cv-entry">
        <p class="cv-entry-title">${esc(entry.name)}</p>
        <p class="cv-project-meta">${meta}</p>
        <p class="cv-entry-desc">${esc(entry.description)}</p>
    </article>`;
}

/** A degree as a work-history entry; the in-progress marker joins the dates. */
function degree(entry) {
    const meta = [entry.dates, entry.status].filter(Boolean).map(esc).join(" · ");
    const details = [
        entry.school && `<p class="cv-entry-company">${esc(entry.school)}</p>`,
        entry.note && `<p class="cv-entry-desc">${esc(entry.note)}</p>`,
    ].filter(Boolean).map((line) => "\n        " + line).join("");
    return `    <article class="cv-entry">
        <div class="cv-entry-head">
            <p class="cv-entry-title">${esc(entry.title)}</p>
            <p class="cv-entry-meta">${meta}</p>
        </div>${details}
    </article>`;
}

/** `Title (Type) — Issuer · Dates`: one line per diploma or certification. */
function credential(entry) {
    return `    <p class="cv-line">${esc(entry.title)} (${esc(entry.type)}) — ${esc(entry.issuer)} · ${esc(entry.dates)}</p>`;
}

/** `Spanish (Native) · English (C2) · …`: the site's tiles, as one line. */
function languageLine(entries) {
    const items = entries
        .map((entry) => `${esc(entry.name)} (${esc(entry.level)})`)
        .join(" · ");
    return `    <p class="cv-line">${items}</p>`;
}

/* Sections run in the site's order: About, Experience, Selected work,
   Education, Diplomas & Certifications, Languages, Skills. */
export function cv(ctx) {
    const contact = ctx.contact
        .map((entry) => `<a href="${esc(entry.href)}">${esc(entry.text)}</a>`)
        .join(`<span class="cv-sep">·</span>`);

    const experience = ctx.experience.map(job).join("\n");
    const projects = ctx.projects.map(project).join("\n");
    const degrees = ctx.degrees.map(degree).join("\n");
    const credentials = ctx.credentials.map(credential).join("\n");
    const skills = ctx.skillGroups.map(skillGroup).join("\n");

    return `<!DOCTYPE html>
<html lang="${esc(ctx.locale)}">
<head>
<meta charset="utf-8">
<title>${esc(ctx.name)} — ${esc(ctx.role)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
    <h1 class="cv-name">${esc(ctx.name)}</h1>
    <p class="cv-role">${esc(ctx.role)}</p>
    <p class="cv-contact">${esc(ctx.platforms)}</p>
    <p class="cv-contact">${esc(ctx.status)}</p>
    <p class="cv-contact">${contact}</p>
</header>

<section class="cv-section">
    <h2 class="cv-heading">${esc(ctx.headings.about)}</h2>
${paragraphs(ctx.about)}
</section>

<section class="cv-section">
    <h2 class="cv-heading">${esc(ctx.headings.experience)}</h2>
${experience}
</section>

<section class="cv-section">
    <h2 class="cv-heading">${esc(ctx.headings.projects)}</h2>
${projects}
</section>

<section class="cv-section">
    <h2 class="cv-heading">${esc(ctx.headings.education)}</h2>
${degrees}
</section>

<section class="cv-section">
    <h2 class="cv-heading">${esc(ctx.headings.credentials)}</h2>
${credentials}
</section>

<section class="cv-section">
    <h2 class="cv-heading">${esc(ctx.headings.languages)}</h2>
${languageLine(ctx.languages)}
</section>

<section class="cv-section">
    <h2 class="cv-heading">${esc(ctx.headings.skills)}</h2>
${skills}
</section>
</body>
</html>
`;
}
