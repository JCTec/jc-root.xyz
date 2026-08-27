# jc-root.xyz

Personal site of Juan Carlos Estévez Rodríguez. **Static · plain Node build ·
self-hosted Bootstrap · no framework · no dependencies · no database.**

Generated once by `build.mjs` and served by GitHub Pages behind Cloudflare.
It was a Vapor application until it wasn't: nothing about it was ever dynamic —
no database, no session, no input that reaches the origin — so the render moved
from request time to build time and the server went away. The Swift original is
still in this repository's history — `git log -- JCRoot/` — through the commit
that removed it.

| Tree | What it is |
|---|---|
| `build.mjs` | The whole build. Reads `site/`, writes `dist/`. |
| `lib/` | One module per thing the server used to do at request time. |
| `site/strings/` | All UI copy, EN and ES, as Apple `.strings` files. |
| `site/public/` | Everything served as-is: CSS, JS, icons, vendored Bootstrap, `llms.txt`. |
| `scripts/` | A static server that matches production, and the browser checks. |
| `test/` | `node --test`. Invariants, not line coverage. |
| `docs/Design.pdf` | The visual design the site implements. |

## Conventions

- **No dependencies, of any kind.** No `node_modules`, no lockfile, no build
  toolchain — `node build.mjs` and nothing else. Bootstrap is vendored into
  `site/public/vendor/bootstrap/` (minified files only — never a CDN). The CSP
  is `default-src 'self'` and would block anything else.
- **No literal UI copy in code or templates.** All copy lives in
  `site/strings/en.strings` and `es.strings` as `"code" = "value";` pairs; code
  and templates reference codes only. Full EN/ES key parity is enforced by the
  test suite, in both directions — a code nothing references fails the build
  just as loudly as a reference to a code nothing defines.
- **Locale is the route.** `/` is English, `/es/` is Spanish. No cookies, no
  `Accept-Language` sniffing — both pages stay crawlable and cacheable, with
  canonical + hreflang metadata and both URLs in the sitemap.
- **Everything is escaped at the point of interpolation.** Leaf escaped `#()`
  automatically; a JavaScript template literal escapes nothing, so `lib/html.mjs`
  carries that obligation and `test/escaping.test.mjs` refuses a bare `${}` in
  the template. The single raw slot on the page is the JSON-LD block, and it is
  safe only because `lib/structured-data.mjs` escaped it first.
- **The test suite is hermetic** — no network, no credentials — and asserts
  invariants: locale parity, template/key integrity, the markup the build emits
  (every referenced asset is in the output, long-cached assets carry `?v=`, no
  inline `<script>` the CSP would block), and the discovery surfaces.
- **Assets and markup are cached apart, so they can disagree.** A returning
  visitor can run today's markup against an older stylesheet. Anything that
  decides whether an element takes up layout space has to travel *with the
  markup* — inline — or it will strand that element in normal flow.

## Building and running

```sh
node build.mjs                    # → dist/
node --test test/*.test.mjs
node scripts/serve.mjs dist 8080  # http://127.0.0.1:8080  ·  .../es/
```

`scripts/serve.mjs` is not just a convenience: it applies the same cache policy
and the same security headers the edge applies, and mirrors the two behaviours a
static host adds on its own — a directory serves its `index.html`, and a bare
`/es` redirects to `/es/`. What a browser sees there is what it sees in
production.

## Testing

Two layers, split by what each can actually see.

**`node --test test/*.test.mjs`** — hermetic, fast, runs in CI on every push.
Invariants of the build and of the markup it emits.

**`node scripts/browser-check.mjs`** — needs a running server and a local
Chrome, so it stays out of CI (adding a browser there would mean a third-party
toolchain this repo deliberately avoids). Run it before a deploy that touches
CSS, JS or the template. It checks what only an engine can compute: layout,
focus-ring contrast, `requestAnimationFrame` behaviour, the sent-confirmation
reveal, and **the returning visitor** — today's markup rendered against the last
committed CSS/JS, which is the combination a stale cache actually produces.

```sh
node build.mjs
node scripts/serve.mjs dist 8080 &
node scripts/browser-check.mjs
```

## Configuration (environment, at build time)

| Var | Default | Purpose |
|---|---|---|
| `CANONICAL_HOST` | `jc-root.xyz` | The custom domain. Written to `dist/CNAME` and used to derive the base URL. |
| `SITE_BASE_URL` | `https://$CANONICAL_HOST` | Base for canonical/hreflang/sitemap/og URLs. Override to build a preview. |
| `ASSET_VERSION` | derived from `site/public/` | Stamp for `?v=` cache busting. Normally leave unset: the build hashes the bytes of `site/public/`, so the stamp cannot disagree with the assets it names. Setting it **overrides** that — a stale value pins every asset URL. |
| `CONTACT_EMAIL` | `juancarlos_tec@proton.me` | Only feeds the default FormSubmit endpoint; never rendered on the page. |
| `FORMSUBMIT_ENDPOINT` | `https://formsubmit.co/<CONTACT_EMAIL>` | Contact-form POST target. **After FormSubmit activation, set this** so the address leaves the HTML entirely. In CI it is the repository variable of the same name. |
| `BUILD_YEAR` | the current year | Footer copyright. Baked in at build time; see the scheduled rebuild below. |
| `PAGES_PREVIEW` | unset | When set, `dist/CNAME` is **not** written. Only for publishing before DNS points at the repository — a CNAME file claims the domain on deploy, and Pages then redirects its own `*.github.io` URL to a host that still resolves elsewhere, making the preview unreachable. |
| `GITHUB_URL` | `https://github.com/JCTec` | Hero + footer link. |
| `LINKEDIN_URL` | `https://www.linkedin.com/in/jctec` | Footer link. |
| `APPSTORE_URL` | developer page `id1346871945` | Footer link. |

Unlike the Vapor original, `CANONICAL_HOST` has a default. There, an unset value
meant "you are on localhost". Here it would mean publishing
`http://localhost:8080` into every canonical URL, hreflang and sitemap entry
with nothing failing, so the one host this repository builds for is the default
and `SITE_BASE_URL` is how you point a build somewhere else.

## Contact form (FormSubmit)

The form POSTs to FormSubmit — no server-side mail code, no SMTP secrets, and
nothing a static host would have to run. One-time setup: submit the form once
after deploy, click the activation link FormSubmit emails you, copy the random
alias endpoint, and set the repository variable `FORMSUBMIT_ENDPOINT` to it.
Until then the fallback endpoint contains the raw address in the form's `action`
attribute. The CSP allows exactly one external `form-action`:
`https://formsubmit.co`.

FormSubmit returns the visitor to `?sent=1`. The confirmation ships hidden in
every copy of the page and `js/app.js` reveals it — the one piece of this site
that depends on JavaScript. With JS off, the form still submits and the visitor
still lands back on the page; they just don't get the confirmation line. It is
`hidden` rather than a CSS class precisely so the no-JS state stays correct
against a stylesheet a day out of date.

## Deploy

CI publishes to GitHub Pages on green `main`: the `tests` job builds `dist/` and
uploads it, and the `deploy` job publishes exactly those bytes — not a second
build that could differ. One-time setup:

1. Repository → Settings → Pages → **Source: GitHub Actions**.
2. Set the custom domain to `jc-root.xyz` and enable **Enforce HTTPS**. The
   build writes `dist/CNAME` on every run, so the domain survives redeploys.
3. Add the repository variable `FORMSUBMIT_ENDPOINT` (Settings → Secrets and
   variables → Actions → Variables) once the alias exists.
4. Point DNS at Pages (see below), then delete the `PAGES_PREVIEW` repository
   variable and re-run the workflow. Until that variable is gone the build
   withholds `dist/CNAME` on purpose, so the deploy is reachable at
   `https://<owner>.github.io/jc-root-js/` while `jc-root.xyz` still serves the
   old origin. Deleting it is the cut-over.

`dist/.nojekyll` is written on every build. Without it Pages runs the output
through Jekyll, which silently drops anything whose name begins with `_`.

**The scheduled run is load-bearing.** The footer year was computed per request
by the server and is now baked in at build time. A monthly cron rebuilds and
republishes so it cannot go stale on 1 January.

## Edge configuration (Cloudflare)

DNS and TLS terminate at Cloudflare in front of GitHub Pages. **GitHub Pages
cannot send custom response headers**, so everything `SiteHeadersMiddleware`
used to apply is reapplied here. None of it lives in this repository, and
nothing in CI would catch it regressing — which is why it is written down.

DNS: apex and `www` are both `CNAME` to `jctec.github.io`, proxied. Cloudflare
flattens the apex CNAME, so no `A` records are needed.

**Order matters when re-pointing this domain.** Zone SSL is Full (strict), and
GitHub cannot issue a certificate for a domain it cannot answer for directly:
proxy first and every request 526s. Set the records **DNS-only**, set the Pages
custom domain, wait for `https_certificate.state` to reach `approved`
(`gh api repos/JCTec/jc-root-js/pages`), *then* turn the proxy back on. The
certificate is what makes Full (strict) work, not the other way round.

**Response Header Transform Rule**, scoped to `jc-root.xyz`. Do not hand-write
it — `scripts/cloudflare-headers.mjs` generates it from `lib/headers.mjs` and
`lib/cache-policy.mjs` and applies it, so the edge cannot drift from the source
of truth. Re-running updates the existing ruleset rather than adding a second:

```sh
node scripts/cloudflare-headers.mjs --dry-run   # print what it would apply
CLOUDFLARE_API_TOKEN=… node scripts/cloudflare-headers.mjs
```

The token needs **Zone → Transform Rules → Edit** on this zone; a DNS-only
token reads the ruleset list fine and then fails the write with
`request is not authorized`. What it applies:

```
Content-Security-Policy:   default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://formsubmit.co; frame-ancestors 'none'
X-Content-Type-Options:    nosniff
X-Frame-Options:           DENY
Referrer-Policy:           strict-origin-when-cross-origin
Permissions-Policy:        camera=(), microphone=(), geolocation=()
```

**No HSTS in that list, on purpose.** GitHub Pages sends
`Strict-Transport-Security: max-age=31556952` itself on a custom domain with
Enforce HTTPS, and will not let you configure it. It carries no
`includeSubDomains`, so the Mailtrap subdomains are still safe. Setting the
header at the edge could only shorten it.

The pages also carry the CSP and `Referrer-Policy` in `<meta>` tags, so those
two hold even on a request that reaches the origin directly. That is belt and
braces, not redundancy: `frame-ancestors` is **ignored** in a meta CSP, and
`nosniff`, `X-Frame-Options`, `Permissions-Policy` and HSTS have no meta
equivalent at all. The rule above is the only thing delivering them.

**Cache Rules**, mirroring `lib/cache-policy.mjs` — Pages serves everything
`max-age=600` and offers no way to change it:

| Path | `Cache-Control` |
|---|---|
| `/vendor/*`, `/icons/*`, `/favicon.ico` | `public, max-age=31536000, immutable` |
| `*.css`, `*.js`, `*.webmanifest` | `public, max-age=86400, stale-while-revalidate=604800` |
| `/robots.txt`, `/sitemap.xml`, `/llms.txt` | `public, max-age=3600` |
| everything else (HTML) | `no-cache, must-revalidate` |

Two pieces of edge config predate the move and are unchanged by it:

- **HTTPS is forced by a Redirect Rule scoped to `jc-root.xyz` and
  `www.jc-root.xyz`**, not by the zone-wide "Always Use HTTPS" setting. The
  zone-wide switch would also capture `mt-link.jc-root.xyz` and
  `mt06.jc-root.xyz` — proxied Mailtrap CNAMEs that answer over HTTP and fail
  over HTTPS with a 525, because zone SSL is Full (strict) and Mailtrap has no
  certificate for those names. Turning it on would break email link tracking.
  This rule is now the *only* thing forcing HTTPS and correcting `www` —
  `CanonicalURLMiddleware` used to back it up at the origin and no longer can.
- **Zone SSL is Full (strict)** and the minimum TLS version is 1.2.

HSTS deliberately carries neither `includeSubDomains` nor `preload`. A max-age
is a promise browsers keep after we stop making it; `includeSubDomains` would
force those two Mailtrap hosts to HTTPS in every browser that has seen this
page, for the full max-age, no matter what we served afterwards.

Known issue, deliberately unaddressed: those two Mailtrap records are proxied
when they should almost certainly be DNS-only. `mt06` is a mail host, and
Cloudflare's proxy does not carry SMTP. Fixing that is an email-infrastructure
change, not a site change.

## Upgrading Bootstrap

Deliberate, reviewable act — never automatic, never a CDN:

1. Read the version banner at the top of
   `site/public/vendor/bootstrap/css/bootstrap.min.css` (currently **5.3.8**).
2. Fetch `bootstrap-<version>-dist.zip` from
   https://github.com/twbs/bootstrap/releases.
3. Copy **only** `css/bootstrap.min.css` and `js/bootstrap.bundle.min.js` into
   `site/public/vendor/bootstrap/`. Discard source maps, RTL builds, examples,
   unminified files.
4. Rebuild, re-check the pages, commit. The asset stamp busts caches by itself.

## Scope and licensing

The code is MIT (see `LICENSE`) — reuse it. The site's copy, biography, icons
and design are reserved: `site/strings/`, `site/public/icons/`,
`site/public/llms.txt` and `docs/Design.pdf` are a CV, not a template. Vendored third-party code is
listed in `THIRD-PARTY.md`.

## Known follow-ups

- FormSubmit activation + set the `FORMSUBMIT_ENDPOINT` repository variable to
  the alias (see above). Until then the raw address is in the form's `action`.
- Real project screenshots for the Tapper Counters and MythLog cards.
- GitHub repo link for MythLog when/if public (`projectCards` in `lib/content.mjs`).
- The two proxied Mailtrap CNAMEs should probably be DNS-only; see above. Doing
  so would also unblock `includeSubDomains` on HSTS — though that would then
  have to come from the edge, since the origin's header cannot be configured.
