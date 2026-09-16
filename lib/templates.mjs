/* The two Leaf templates, as functions returning strings.

   A port of Resources/Views/base.leaf and home.leaf. `#extend`/`#export`
   becomes `base({ ctx, body })`; `#if` and `#for` become ordinary JavaScript.
   The markup is otherwise unchanged, down to the comments — they record why
   the canvas carries its layout inline and why the JSON-LD is emitted raw.

   Every interpolation of a catalog or config value goes through `esc`. Leaf
   did that automatically; here it is a rule the test suite enforces. */

import { esc } from "./html.mjs";
import { CSP_META, REFERRER_POLICY } from "./headers.mjs";

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
         a direct hit that bypasses the edge. The rest — nosniff, X-Frame-Options,
         Permissions-Policy, HSTS, and frame-ancestors, which is ignored in a
         meta CSP — is delivered by the Cloudflare rule documented in README.md.
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

export function home(ctx) {
    const { t, links } = ctx;
    const u = (path) => esc(ctx.basePath + path);

    // The catalog labels each locale under `lang_<locale>` — see
    // DYNAMIC_KEY_PATTERNS in strings.test.mjs, which knows these are built.
    const langToggle = ctx.alternates.map((alt) => {
        const label = esc(t["lang_" + alt.locale]);
        return alt.locale === ctx.locale
            ? `<span class="lang-current">${label}</span>`
            : `<a class="lang-link" href="${u(alt.path)}" hreflang="${esc(alt.locale)}" lang="${esc(alt.locale)}">${label}</a>`;
    }).join(`<span class="lang-sep">/</span>`);

    const experience = ctx.experience.map((job) => `                <article class="exp-item">
                    <div class="d-flex justify-content-between align-items-baseline flex-wrap gap-1">
                        <h3 class="exp-role">${esc(job.role)}</h3>
                        <p class="exp-meta">${esc(job.meta)}</p>
                    </div>
                    <p class="exp-company">${esc(job.company)}</p>
                    <p class="exp-desc">${esc(job.description)}</p>
                </article>`).join("\n");

    const projects = ctx.projects.map((project) => {
        const appStore = project.appStoreURL
            ? `\n                    <a class="card-link" href="${esc(project.appStoreURL)}" rel="noopener">${esc(project.name)} ${esc(t.link_appstore_suffix)}</a>`
            : "";
        const repo = project.repoURL
            ? `\n                    <a class="card-link" href="${esc(project.repoURL)}" rel="noopener">${esc(project.name)} ${esc(t.link_github_suffix)}</a>`
            : "";
        return `                <article class="card-project">
                    <p class="card-tags">${esc(project.tags)}</p>
                    <h3 class="card-title">${esc(project.name)}</h3>
                    <p class="card-desc">${esc(project.description)}</p>${appStore}${repo}
                </article>`;
    }).join("\n");

    const chips = (items) => items
        .map(({ text, href }) => href
            ? `                <a class="chip" href="${esc(href)}" rel="noopener">${esc(text)}</a>`
            : `                <span class="chip">${esc(text)}</span>`)
        .join("\n");

    const body = `<a class="skip-link" href="#main">${esc(t.skip_to_content)}</a>

<nav class="site-nav sticky-top" aria-label="${esc(t.nav_label)}">
    <div class="page-col d-flex align-items-center justify-content-between">
        <a class="nav-brand" href="#top">${esc(t.brand_short)}</a>
        <div class="d-flex align-items-center gap-3">
            <a class="nav-link-mono" href="#about">${esc(t.nav_about)}</a>
            <a class="nav-link-mono" href="#experience">${esc(t.nav_experience)}</a>
            <a class="nav-link-mono" href="#projects">${esc(t.nav_projects)}</a>
            <a class="nav-link-mono" href="#contact">${esc(t.nav_contact)}</a>
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
        <h1 class="hero-name">${esc(t.hero_name)}</h1>
        <p class="hero-role">${esc(t.hero_role)}</p>
        <p class="hero-platforms">${esc(t.hero_platforms)}</p>
        <p class="hero-status">${esc(t.hero_status)}</p>
        <div class="d-flex flex-wrap gap-2 hero-actions">
            <a class="btn-jc btn-jc-light" href="#projects">${esc(t.hero_cta_projects)}</a>
            <a class="btn-jc btn-jc-outline" href="${esc(links.github)}" rel="me noopener">${esc(t.hero_cta_github)}</a>
            <a class="btn-jc btn-jc-outline" href="${u(ctx.cvPath)}">${esc(t.hero_cta_cv)}</a>
        </div>
    </div>
</header>

<main id="main">
    <section class="about" id="about">
        <div class="page-col">
            <h2 class="section-heading">${esc(t.about_heading)}</h2>
            <p class="about-body">${esc(t.about_body)}</p>
            <p class="about-availability">${esc(t.about_availability)}</p>
        </div>
    </section>

    <section class="experience" id="experience">
        <div class="page-col">
            <h2 class="section-heading">${esc(t.exp_heading)}</h2>
            <div class="vstack exp-list">
${experience}
            </div>
        </div>
    </section>

    <section class="work" id="projects">
        <div class="page-col">
            <h2 class="ghost-heading">${esc(t.work_heading)}</h2>
            <div class="vstack gap-3 work-list">
${projects}
            </div>
        </div>
    </section>

    <section class="edu-section" id="education">
        <div class="page-col">
            <h2 class="section-heading">${esc(t.edu_heading)}</h2>
            <p class="edu-line">${esc(t.edu1)}</p>
            <p class="edu-line">${esc(t.edu2)}</p>
            <p class="edu-line">${esc(t.edu3)}</p>
            <p class="edu-line">${esc(t.edu4)}</p>
            <p class="edu-line">${esc(t.edu5)}</p>
            <p class="langs-line">${esc(t.langs_line)}</p>
        </div>
    </section>

    <section class="stack-section" id="skills">
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
        </div>
    </section>

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
