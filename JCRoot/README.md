# JCRoot — jc-root.xyz

Server-rendered portfolio site. **Swift 6 · Vapor 4 · Leaf · self-hosted
Bootstrap · no JS framework · no build step · no database.**

## Conventions

- **Everything self-hosted.** Bootstrap is vendored into
  `Public/vendor/bootstrap/` (minified files only — never a CDN, never the
  full dist). The CSP is `default-src 'self'` and would block anything else.
- **No literal UI copy in code or templates.** All copy lives in
  `Resources/Strings/en.strings` and `es.strings` as `"code" = "value";`
  pairs; code and templates reference codes only. Full EN/ES key parity is
  enforced by the test suite — a feature is not done until both languages
  are complete.
- **Locale is the route.** `/` is English, `/es` is Spanish. No cookies, no
  `Accept-Language` sniffing — both pages stay crawlable and cacheable, with
  canonical + hreflang metadata and both URLs in the sitemap.
- **Headers are middleware.** `SiteHeadersMiddleware` applies the CSP,
  `nosniff`, frame denial, HSTS and a per-path cache policy (vendored assets
  immutable + `?v=` busting; HTML never publicly cached). HSTS is sent only on
  requests that arrived over TLS, and deliberately carries neither
  `includeSubDomains` nor `preload` — see the edge notes in the root README for
  why the subdomains cannot take it.
- **One canonical origin, one redirect.** `CanonicalURLMiddleware` corrects
  scheme and host together in a single 301, and does nothing at all when
  `X-Forwarded-Proto` is absent — that absence is what keeps `localhost` usable.
- **The default test suite is hermetic** — no network, no credentials — and
  asserts invariants: locale parity, template/key integrity, headers,
  discovery surfaces, canonical-host redirect, and the markup the server
  emits (every referenced asset resolves, long-cached assets carry `?v=`,
  no inline `<script>` the CSP would block).
- **Assets and markup are cached apart, so they can disagree.** HTML is
  `no-cache`; CSS and JS are `max-age=86400` keyed on `?v=ASSET_VERSION`,
  which only CI ever changes. A returning visitor can therefore run today's
  markup against yesterday's stylesheet. Anything that decides whether an
  element takes up layout space has to travel *with the markup* — inline —
  or it will strand that element in normal flow for a day.

## Running locally

```sh
swift run App serve --hostname 127.0.0.1 --port 8080
# http://127.0.0.1:8080  (EN)   http://127.0.0.1:8080/es  (ES)
swift test
```

## Testing

Two layers, split by what each can actually see.

**`swift test`** — hermetic, fast, runs in CI on every push. Invariants of
the server and of the markup it emits.

**`node ../Scripts/browser-check.mjs`** — needs a running server and a local
Chrome, so it stays out of CI (adding a browser there would mean a
third-party toolchain this repo deliberately avoids). Run it before a deploy
that touches CSS, JS or the template. It checks what only an engine can
compute: layout, focus-ring contrast, `requestAnimationFrame` behaviour, and
**the returning visitor** — today's markup rendered against the last
committed CSS/JS, which is the combination that a day of cache staleness
actually produces.

```sh
swift run App serve --port 8080 &
node ../Scripts/browser-check.mjs
```

## Configuration (environment)

| Var | Default | Purpose |
|---|---|---|
| `CANONICAL_HOST` | unset | When set (`jc-root.xyz`), other hosts 301 to it. Leave unset locally. |
| `SITE_BASE_URL` | derived from host, else `http://localhost:8080` | Base for canonical/hreflang/sitemap URLs. |
| `ASSET_VERSION` | derived from `Public/` | Stamp for `?v=` cache busting. Normally leave unset: the app hashes the bytes of `Public/` at boot, so the stamp cannot disagree with the assets it names. Setting it **overrides** that — a stale value pins every asset URL. |
| `CONTACT_EMAIL` | `juancarlos_tec@proton.me` | Only feeds the default FormSubmit endpoint; never rendered on the page. |
| `FORMSUBMIT_ENDPOINT` | `https://formsubmit.co/<CONTACT_EMAIL>` | Contact-form POST target. **After FormSubmit activation, set this to the random alias endpoint** so the address leaves the HTML entirely. |
| `GITHUB_URL` | `https://github.com/JCTec` | Hero + footer link. |
| `LINKEDIN_URL` | `https://www.linkedin.com/in/jctec` | Footer link. |
| `APPSTORE_URL` | developer page `id1346871945` | Footer link. |

## Contact form (FormSubmit)

The form POSTs to FormSubmit — no server-side mail code, no SMTP secrets.
One-time setup: submit the form once after deploy, click the activation
link FormSubmit emails you, copy the random alias endpoint from them, and
`heroku config:set FORMSUBMIT_ENDPOINT=https://formsubmit.co/<alias>`.
Until the alias is set, the fallback endpoint contains the raw address in
the form's `action` attribute. The CSP allows exactly one external
`form-action`: `https://formsubmit.co`.

## Upgrading Bootstrap

Deliberate, reviewable act — never automatic, never a CDN:

1. Read the version banner at the top of
   `Public/vendor/bootstrap/css/bootstrap.min.css` (currently **5.3.8**).
2. Fetch `bootstrap-<version>-dist.zip` from
   https://github.com/twbs/bootstrap/releases.
3. Copy **only** `css/bootstrap.min.css` and `js/bootstrap.bundle.min.js`
   into `Public/vendor/bootstrap/`. Discard source maps, RTL builds,
   examples, unminified files.
4. Re-check the pages, commit. `ASSET_VERSION` busts caches on deploy.

## Deploy

Heroku container stack, built from this directory's `Dockerfile` via
`heroku.yml`; CI splits this subtree and pushes it on green `main` (see
`../.github/workflows/ci.yml` and the root README for setup).

## Known follow-ups

- Real project screenshots for the Tapper Counters and MythLog cards. The
  unused `hasScreenshot`/`shotAlt` fields and their `*_shot_alt` strings were
  removed rather than left to rot; recover the alt-text copy from history
  (`git log -S p1_shot_alt`) when the images actually land.
- FormSubmit activation + switch `FORMSUBMIT_ENDPOINT` to the alias (see
  above). Until then the raw address is in the form's `action` attribute.
- GitHub repo link for MythLog when/if public (`repoURL` in `PageController`).
- Raise the HSTS `max-age` in steps once the current value has been served
  without incident: 300 → 86400 → 31536000.
- The two proxied Mailtrap CNAMEs should probably be DNS-only; see the root
  README. Doing so would also unblock `includeSubDomains` on HSTS.
