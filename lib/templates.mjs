/* The two Leaf templates, as functions returning strings.

   A port of Resources/Views/base.leaf and home.leaf. `#extend`/`#export`
   becomes `base({ ctx, body })`; `#if` and `#for` become ordinary JavaScript.
   The markup is otherwise unchanged, down to the comments: they record why
   the canvas carries its layout inline and why the JSON-LD is emitted raw.

   Every interpolation of a catalog or config value goes through `esc`. Leaf
   did that automatically; here it is a rule the test suite enforces. */

import { esc } from "./html.mjs";
import { CSP_META, REFERRER_POLICY } from "./headers.mjs";
import { sentences, shortDate } from "./cv-content.mjs";
import { projectLinks } from "./projects.mjs";

export function base(ctx, body) {
    const v = esc(ctx.assetVersion);
    /* Every root-absolute URL below goes through this. On the real site the
       prefix is empty and the output is unchanged; under a GitHub Pages
       project path it is what stops the browser asking the owner's domain for
       assets that live one directory down. */
    const u = (path) => esc(ctx.basePath + path);
    return `<!DOCTYPE html>
<html lang="${esc(ctx.locale)}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <!-- The origin serves no headers of its own: GitHub Pages cannot set them.
         What can travel in the markup travels here, so the policy holds even on
         a direct hit that bypasses the edge. The rest (nosniff, X-Frame-Options,
         Permissions-Policy, HSTS, and frame-ancestors, which is ignored in a
         meta CSP) is delivered by the Cloudflare rule documented in README.md.
         Both are generated from lib/headers.mjs so they cannot drift apart. -->
    <meta http-equiv="Content-Security-Policy" content="${esc(CSP_META)}">
    <meta name="referrer" content="${esc(REFERRER_POLICY)}">
    <title>${esc(ctx.t.meta_title)}</title>
    <meta name="description" content="${esc(ctx.t.meta_description)}">
    <link rel="canonical" href="${esc(ctx.canonicalURL)}">
${alternateLinks(ctx)}
    <meta property="og:title" content="${esc(ctx.t.meta_title)}">
    <meta property="og:description" content="${esc(ctx.t.meta_description)}">
    <meta property="og:type" content="profile">
    <meta property="og:url" content="${esc(ctx.canonicalURL)}">
    <meta property="og:locale" content="${esc(ctx.ogLocale)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(ctx.t.meta_title)}">
    <meta name="twitter:description" content="${esc(ctx.t.meta_description)}">
    <meta name="twitter:image" content="${esc(ctx.ogImageURL)}">
    <meta property="og:image" content="${esc(ctx.ogImageURL)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${esc(ctx.t.og_image_alt)}">
    <meta name="theme-color" content="#0a0a0b">
    <link rel="icon" href="${u("/icons/favicon.svg")}?v=${v}" type="image/svg+xml">
    <link rel="apple-touch-icon" href="${u("/icons/apple-touch-icon.png")}?v=${v}">
    <!-- Serialized in JS and emitted raw. HTML-escaping its values would
         publish a literal &amp; to crawlers the first time a value contained an
         ampersand, because HTML parsers do not decode entities inside a script
         element. structured-data.mjs re-escapes < > and & as JSON escapes, so
         no value can break out. -->
    <script type="application/ld+json">${ctx.jsonLD}</script>
    <link rel="stylesheet" href="${u("/vendor/bootstrap/css/bootstrap.min.css")}?v=${v}">
    <link rel="stylesheet" href="${u("/css/site.css")}?v=${v}">
</head>
<body>
    <!-- Layout styles are inline, not in site.css, on purpose: HTML and CSS are
         cached apart and under separate policies, so a returning visitor can run
         today's markup against an older stylesheet. A stale stylesheet would
         leave this canvas in normal flow as a viewport-sized block at the top of
         the page. CSP allows style attributes; it does not allow inline
         <script>. -->
    <canvas class="roots-canvas" aria-hidden="true"
            style="position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;"></canvas>
${body}
    <script src="${u("/vendor/bootstrap/js/bootstrap.bundle.min.js")}?v=${v}" defer></script>
    <script src="${u("/js/app.js")}?v=${v}" defer></script>
    <script src="${u("/js/roots.js")}?v=${v}" defer></script>
</body>
</html>
`;
}

/** One hreflang link per locale, plus x-default on the default locale. */
function alternateLinks(ctx) {
    const links = ctx.alternates.map((alt) =>
        `    <link rel="alternate" hreflang="${esc(alt.locale)}" href="${esc(alt.url)}">`);
    const fallback = ctx.alternates.find((alt) => alt.locale === ctx.defaultLocale);
    links.push(`    <link rel="alternate" hreflang="x-default" href="${esc(fallback.url)}">`);
    return links.join("\n");
}

/* The facts at the top of the page, without the hero's furniture around them.
   The CV prints this too, with its address added to the citizenship line; the
   page passes none, so it never shows a raw address. */
export function heroIdentity(ctx, { email = null } = {}) {
    const { t } = ctx;
    const mailto = email ? ` · <a href="mailto:${esc(email)}">${esc(email)}</a>` : "";
    return `        <h1 class="hero-name">${esc(t.hero_name)}</h1>
        <p class="hero-role">${esc(t.hero_role)}</p>
        <p class="hero-platforms">${esc(t.hero_platforms)}</p>
        <p class="hero-status">${esc(t.hero_status)}${mailto}</p>`;
}

/** A card's link as the page words it: "Visit X →", "X on the App Store →",
    "<repo> on GitHub →". Returns escaped markup. */
function wordedLink(t) {
    return (link, project) => ({
        site: `${esc(t.link_site_prefix)} ${esc(project.name)} ${esc(t.link_site_suffix)}`,
        appStore: `${esc(project.name)} ${esc(t.link_appstore_suffix)}`,
        repo: `${esc(link.name)} ${esc(t.link_github_suffix)}`,
    }[link.kind]);
}

/* The order the CV prints its sections in. Skills come right after About, so
   a reader meets the stack before the history. A section missing from this
   list still prints, after these: a section added to the page reaches the CV
   without anyone remembering to list it here. */
export const PRINT_SECTION_ORDER = [
    "about", "skills", "experience", "projects", "education", "credentials", "events", "languages",
];

/* Every section of the page that states a fact. This is the one place those
   sections are laid out: the page and the CV both render this function, so a
   section or a field added here is on both with no second step. Only the
   contact form is left to home(), being useless on paper.

   `print` is the CV's form of the same sections, and the only place the two
   differ: the CV's section order, availability without the citizenship, a
   role's description as one bullet per sentence, one line per credential
   without its note, every date in the short form, and each card written in
   the order it reads, which is what a tagged PDF follows. `linkLabel` words a
   card's link: a "Visit X →" button on screen, a bare URL on paper. Both
   return escaped markup. */
export function contentSections(ctx, { linkLabel = wordedLink(ctx.t), print = false } = {}) {
    const { t } = ctx;
    const date = (text) => (print ? shortDate(text, ctx.locale) : text);

    /* One bullet per sentence, the sentences unchanged. */
    const bullets = (text) => sentences(text)
        .map((sentence) => `\n                        <li>${esc(sentence)}</li>`)
        .join("");

    const experience = ctx.experience.map((job) => {
        const description = print
            ? `<ul class="exp-bullets">${bullets(job.description)}\n                    </ul>`
            : `<p class="exp-desc">${esc(job.description)}</p>`;
        return `                <article class="exp-item">
                    <div class="d-flex justify-content-between align-items-baseline flex-wrap gap-1">
                        <h3 class="exp-role">${esc(job.role)}</h3>
                        <p class="exp-meta">${esc(date(job.meta))}</p>
                    </div>
                    <p class="exp-company">${esc(job.company)}</p>
                    ${description}
                </article>`;
    }).join("\n");

    const cardLink = (link, project) => {
        const label = linkLabel(link, project);
        return `\n                    <a class="card-link" href="${esc(link.url)}" rel="noopener">${label}</a>`;
    };

    /* Laid out like the work history. The lines a degree may not have (a
       school, how it is taken, a note, an in-progress marker, a link to the
       school) are left out when empty; how it is taken follows the school on
       its line, "School · Online · City, Country". The page shows the
       in-progress marker as a badge under the title and the link last, worded
       like a credential's; on paper the school comes first, under the title
       like any other degree's, with the link's address at the end of its
       line, and the marker after it. */
    const degrees = ctx.degrees.map((degree) => {
        const link = degree.url && degree.school
            ? cardLink({ kind: "site", url: degree.url }, { name: degree.school })
            : "";
        const [printedLink, pageLink] = print ? [link, ""] : ["", link];
        const status = degree.status && `<p class="degree-status">${esc(degree.status)}</p>`;
        const schoolLine = [degree.school, degree.mode].filter(Boolean).map(esc).join(" · ");
        const school = degree.school
            && `<p class="exp-company">${schoolLine}${printedLink}</p>`;
        const note = degree.note && `<p class="exp-desc">${esc(degree.note)}</p>`;
        const details = (print ? [school, status, note] : [status, school, note])
            .filter(Boolean).map((line) => "\n                    " + line).join("");
        return `                <article class="exp-item">
                    <div class="d-flex justify-content-between align-items-baseline flex-wrap gap-1">
                        <h3 class="exp-role">${esc(degree.title)}</h3>
                        <p class="exp-meta">${esc(date(degree.dates))}</p>
                    </div>${details}${pageLink}
                </article>`;
    }).join("\n");

    /* A credential's note, what it covered, and its link, where to check it,
       are each left out when it has none. The link is worded like a project's
       site link, "Visit <title> →", and prints as its address on the CV.

       On paper a credential is one line, "Title (Type): Issuer · Date · link",
       written in that order and without its note. Conferences and workshops
       are laid out the same way, in a section of their own. */
    const credentialCards = (rows) => rows.map((credential) => {
        const sourceLink = credential.url
            ? cardLink({ kind: "site", url: credential.url }, { name: credential.title })
            : "";
        if (print) {
            return `                <article class="cred-card">
                    <p class="cred-line"><span class="cred-title">${esc(credential.title)}</span> (${esc(credential.type)}): ${esc(credential.issuer)} · ${esc(date(credential.dates))}${sourceLink}</p>
                </article>`;
        }
        const noteLine = credential.note
            ? `\n                    <p class="cred-note">${esc(credential.note)}</p>`
            : "";
        return `                <article class="cred-card">
                    <p class="cred-type">${esc(credential.type)}</p>
                    <h3 class="cred-title">${esc(credential.title)}</h3>
                    <p class="cred-issuer">${esc(credential.issuer)}</p>
                    <p class="cred-dates">${esc(credential.dates)}</p>${noteLine}${sourceLink}
                </article>`;
    }).join("\n");
    const credentials = credentialCards(ctx.credentials);
    const events = credentialCards(ctx.events);

    /* Name over level, read and shown in that order: "English, C2". */
    const languages = ctx.languages.map((language) => `                <div class="language-tile">
                    <dt class="language-name">${esc(language.name)}</dt>
                    <dd class="language-level">${esc(language.level)}</dd>
                </div>`).join("\n");

    /* On paper: the name, then "tags · link · link", then the description. */
    const projects = ctx.projects.map((project) => {
        const links = projectLinks(project).map((link) => cardLink(link, project)).join("");
        if (print) {
            return `                <article class="card-project">
                    <h3 class="card-title">${esc(project.name)}</h3>
                    <p class="card-meta"><span class="card-tags">${esc(project.tags)}</span>${links}</p>
                    <p class="card-desc">${esc(project.description)}</p>
                </article>`;
        }
        return `                <article class="card-project">
                    <p class="card-tags">${esc(project.tags)}</p>
                    <h3 class="card-title">${esc(project.name)}</h3>
                    <p class="card-desc">${esc(project.description)}</p>${links}
                </article>`;
    }).join("\n");

    const chips = (items) => items
        .map(({ text, href }) => href
            ? `                <a class="chip" href="${esc(href)}" rel="noopener">${esc(text)}</a>`
            : `                <span class="chip">${esc(text)}</span>`)
        .join("\n");

    /* About closes with the personal sentence, on the page and the CV alike.
       The availability line closes with the citizenship on the page only; the
       CV leaves it out, the citizenship being on its header already. */
    const aboutBody = `${esc(t.about_body)} ${esc(t.about_personal)}`;
    const availability = print
        ? esc(t.about_availability)
        : `${esc(t.about_availability)} ${esc(t.about_citizenship)}`;

    const sections = {
        about: `    <section class="about" id="about">
        <div class="page-col">
            <h2 class="section-heading">${esc(t.about_heading)}</h2>
            <p class="about-body">${aboutBody}</p>
            <p class="about-availability">${availability}</p>
        </div>
    </section>`,

        experience: `    <section class="experience" id="experience">
        <div class="page-col">
            <h2 class="section-heading">${esc(t.exp_heading)}</h2>
            <div class="vstack exp-list">
${experience}
            </div>
        </div>
    </section>`,

        projects: `    <section class="work" id="projects">
        <div class="page-col">
            <h2 class="ghost-heading">${esc(t.work_heading)}</h2>
            <div class="vstack gap-3 work-list">
${projects}
            </div>
        </div>
    </section>`,

        education: `    <section class="edu-section" id="education">
        <div class="page-col">
            <h2 class="section-heading">${esc(t.edu_heading)}</h2>
            <div class="vstack">
${degrees}
            </div>
        </div>
    </section>`,

        credentials: `    <section class="cred-section" id="credentials">
        <div class="page-col">
            <h2 class="section-heading">${esc(t.cred_heading)}</h2>
            <div class="cred-grid">
${credentials}
            </div>
        </div>
    </section>`,

        events: `    <section class="cred-section events-section" id="events">
        <div class="page-col">
            <h2 class="section-heading">${esc(t.events_heading)}</h2>
            <div class="cred-grid">
${events}
            </div>
        </div>
    </section>`,

        languages: `    <section class="langs-section" id="languages">
        <div class="page-col">
            <h2 class="section-heading">${esc(t.langs_heading)}</h2>
            <dl class="language-tiles">
${languages}
            </dl>
        </div>
    </section>`,

        skills: `    <section class="stack-section" id="skills">
        <div class="page-col">
            <h2 class="section-heading">${esc(t.stack_heading)}</h2>
            <p class="stack-group-label">${esc(t.stack_core_label)}</p>
            <div class="d-flex flex-wrap gap-2">
${chips(ctx.stackCore)}
            </div>
            <p class="stack-group-label">${esc(t.stack_also_label)}</p>
            <div class="d-flex flex-wrap gap-2">
${chips(ctx.stackAlso)}
            </div>
            <p class="stack-group-label">${esc(t.stack_media_label)}</p>
            <div class="d-flex flex-wrap gap-2">
${chips(ctx.stackMedia)}
            </div>
        </div>
    </section>`,
    };

    const order = print
        ? [...PRINT_SECTION_ORDER, ...Object.keys(sections).filter((id) => !PRINT_SECTION_ORDER.includes(id))]
        : Object.keys(sections);
    return order.map((id) => sections[id]).join("\n\n");
}

export function home(ctx) {
    const { t, links } = ctx;
    const u = (path) => esc(ctx.basePath + path);

    // The catalog labels each locale under `lang_<locale>`; see
    // DYNAMIC_KEY_PATTERNS in strings.test.mjs, which knows these are built.
    const langToggle = ctx.alternates.map((alt) => {
        const label = esc(t["lang_" + alt.locale]);
        return alt.locale === ctx.locale
            ? `<span class="lang-current">${label}</span>`
            : `<a class="lang-link" href="${u(alt.path)}" hreflang="${esc(alt.locale)}" lang="${esc(alt.locale)}">${label}</a>`;
    }).join(`<span class="lang-sep">/</span>`);

    /* The section links, rendered twice: inline from the md breakpoint up, and
       inside the phone menu below it. Each copy is display:none at the other
       width, which also takes it out of the accessibility tree, so a screen
       reader only ever meets one. */
    const navLinks = [
        ["#about", t.nav_about],
        ["#experience", t.nav_experience],
        ["#projects", t.nav_projects],
        ["#contact", t.nav_contact],
    ].map(([href, label]) => `<a class="nav-link-mono" href="${esc(href)}">${esc(label)}</a>`);
    const navInline = navLinks.join("\n            ");
    const navMenu = navLinks.join("\n                    ");

    const body = `<a class="skip-link" href="#main">${esc(t.skip_to_content)}</a>

<!-- Below the md breakpoint the four section links fold into a <details>
     menu: it opens and closes with no JavaScript, and the bar keeps to the
     width of a phone. app.js only closes it after a link is followed. -->
<nav class="site-nav sticky-top" aria-label="${esc(t.nav_label)}">
    <div class="page-col nav-bar">
        <a class="nav-brand" href="#top">${esc(t.brand_short)}</a>
        <div class="nav-links d-none d-md-flex">
            ${navInline}
        </div>
        <div class="nav-tools">
            <details class="nav-menu d-md-none">
                <summary class="nav-menu-toggle">${esc(t.nav_menu)}</summary>
                <div class="nav-menu-panel">
                    ${navMenu}
                </div>
            </details>
            <div class="lang-toggle">
                ${langToggle}
            </div>
        </div>
    </div>
</nav>

<header class="hero" id="top">
    <div class="page-col position-relative">
        <div class="hero-ghost" aria-hidden="true">${esc(t.brand_short)}</div>
        <p class="site-label">${esc(t.site_label)}</p>
        <p class="hero-logo">${esc(t.brand_short)}</p>
${heroIdentity(ctx)}
        <div class="d-flex flex-wrap gap-2 hero-actions">
            <a class="btn-jc btn-jc-light" href="#projects">${esc(t.hero_cta_projects)}</a>
            <a class="btn-jc btn-jc-outline" href="${esc(links.github)}" rel="me noopener">${esc(t.hero_cta_github)}</a>
            <a class="btn-jc btn-jc-outline" href="${u(ctx.cvHref)}" download="${esc(ctx.cvFilename)}" type="application/pdf">${esc(t.hero_cta_cv)}</a>
        </div>
    </div>
</header>

<main id="main">
${contentSections(ctx)}

    <section class="cta" id="contact">
        <div class="page-col">
            <h2 class="cta-heading">${esc(t.cta_heading)}</h2>
            <!-- The server used to render this only after a successful POST.
                 Nothing renders per request now, so the confirmation ships with
                 every copy of the page and app.js reveals it when FormSubmit
                 sends the visitor back to ?sent=1. The hidden attribute is markup
                 rather than a class, so the no-JS state stays correct
                 even against a stylesheet a day out of date. -->
            <p class="form-sent" tabindex="-1" hidden>${esc(t.form_sent)}</p>
            <form class="contact-form" action="${esc(ctx.formAction)}" method="POST">
                <input type="hidden" name="_subject" value="${esc(t.form_subject)}">
                <input type="hidden" name="_next" value="${esc(ctx.formNext)}">
                <input type="text" name="_honey" class="honey" tabindex="-1" autocomplete="off" aria-hidden="true">
                <label class="form-label-jc" for="cf-name">${esc(t.form_name)}</label>
                <input class="form-control-jc" id="cf-name" type="text" name="name" required>
                <label class="form-label-jc" for="cf-email">${esc(t.form_email)}</label>
                <input class="form-control-jc" id="cf-email" type="email" name="email" required>
                <label class="form-label-jc" for="cf-message">${esc(t.form_message)}</label>
                <textarea class="form-control-jc" id="cf-message" name="message" rows="5" required></textarea>
                <div class="d-flex flex-wrap gap-2 align-items-center">
                    <button class="btn-jc btn-jc-accent" type="submit">${esc(t.form_send)}</button>
                    <button class="btn-jc btn-jc-outline" type="button" data-bs-toggle="collapse" data-bs-target="#contact-links" aria-expanded="false" aria-controls="contact-links">${esc(t.cta_all_links)}</button>
                </div>
            </form>
            <div class="collapse" id="contact-links">
                <div class="d-flex flex-wrap gap-3 contact-links">
                    <a class="nav-link-mono" href="${esc(links.github)}" rel="me noopener">${esc(t.footer_github)}</a>
                    <a class="nav-link-mono" href="${esc(links.linkedin)}" rel="me noopener">${esc(t.footer_linkedin)}</a>
                    <a class="nav-link-mono" href="${esc(links.appStore)}" rel="me noopener">${esc(t.footer_appstore)}</a>
                </div>
            </div>
        </div>
    </section>
</main>

<footer class="site-footer">
    <div class="page-col d-flex align-items-center justify-content-between flex-wrap gap-2">
        <p class="footer-text">© ${esc(ctx.year)} ${esc(t.footer_name)}</p>
        <div class="d-flex gap-3">
            <a class="nav-link-mono" href="${esc(links.github)}" rel="me noopener">${esc(t.footer_github)}</a>
            <a class="nav-link-mono" href="${esc(links.linkedin)}" rel="me noopener">${esc(t.footer_linkedin)}</a>
            <a class="nav-link-mono" href="${esc(links.appStore)}" rel="me noopener">${esc(t.footer_appstore)}</a>
        </div>
    </div>
</footer>`;

    return base(ctx, body);
}
