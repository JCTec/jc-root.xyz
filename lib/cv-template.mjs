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

/* Page geometry, matching the CV this replaces: A4, 14mm side margins. The
   bottom margin is tighter than the top because the header already carries
   whitespace above the name, and a CV that runs to 2.1 pages is a two-page CV
   with a widow. */
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
    break-after: avoid;
}

.cv-summary {
    margin: 0;
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

.cv-entry-note {
    margin: 0.5pt 0 0;
    font-style: italic;
}

.cv-bullets {
    margin: 1.5pt 0 0;
    padding-left: 10pt;
}

.cv-bullets li {
    margin-bottom: 0.8pt;
}

.cv-project-meta {
    margin: 0;
    font-size: 8.4pt;
}

.cv-project-desc {
    margin: 0.8pt 0 0;
}

/* The closing two-column block: education on the left, certifications,
   languages and interests on the right. */
.cv-columns {
    display: flex;
    gap: 10mm;
    break-inside: avoid;
}

.cv-column {
    flex: 1;
}

.cv-line {
    margin: 0 0 2pt;
}
`;

/** `label: a · b · c` for one skill group. */
function skillGroup(group) {
    const items = group.items.map((item) => esc(item)).join(" · ");
    return `        <p class="cv-skill-group"><span class="cv-skill-label">${esc(group.label)}:</span> ${items}</p>`;
}

function bullets(lines) {
    const items = lines
        .map((line) => `            <li>${esc(line)}</li>`)
        .join("\n");
    return `        <ul class="cv-bullets">\n${items}\n        </ul>`;
}

function job(entry) {
    const note = entry.note
        ? `\n        <p class="cv-entry-note">${esc(entry.note)}</p>`
        : "";
    return `    <article class="cv-entry">
        <div class="cv-entry-head">
            <p class="cv-entry-title">${esc(entry.role)} — ${esc(entry.company)}</p>
            <p class="cv-entry-meta">${esc(entry.meta)}</p>
        </div>${note}
${bullets(entry.bullets)}
    </article>`;
}

function project(entry) {
    return `    <article class="cv-entry">
        <p class="cv-entry-title">${esc(entry.name)}</p>
        <p class="cv-project-meta">${esc(entry.meta)}</p>
        <p class="cv-project-desc">${esc(entry.description)}</p>
    </article>`;
}

function lines(values) {
    return values
        .map((value) => `        <p class="cv-line">${esc(value)}</p>`)
        .join("\n");
}

export function cv(ctx) {
    const contact = ctx.contact
        .map((entry) => `<a href="${esc(entry.href)}">${esc(entry.text)}</a>`)
        .join(`<span class="cv-sep">·</span>`);

    const experience = ctx.experience.map(job).join("\n");
    const projects = ctx.projects.map(project).join("\n");
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
    <p class="cv-contact">${esc(ctx.passport)}<span class="cv-sep">·</span>${contact}</p>
</header>

<section class="cv-section">
    <h2 class="cv-heading">${esc(ctx.headings.summary)}</h2>
    <p class="cv-summary">${esc(ctx.summary)}</p>
</section>

<section class="cv-section">
    <h2 class="cv-heading">${esc(ctx.headings.skills)}</h2>
${skills}
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
    <div class="cv-columns">
        <div class="cv-column">
            <h2 class="cv-heading">${esc(ctx.headings.education)}</h2>
${lines(ctx.education)}
        </div>
        <div class="cv-column">
            <h2 class="cv-heading">${esc(ctx.headings.certifications)}</h2>
${lines(ctx.certifications)}
            <h2 class="cv-heading" style="margin-top:7pt">${esc(ctx.headings.interests)}</h2>
            <p class="cv-line">${esc(ctx.interests)}</p>
        </div>
    </div>
</section>
</body>
</html>
`;
}
