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
  `nosniff`, frame denial and a per-path cache policy (vendored assets
  immutable + `?v=ASSET_VERSION` busting; HTML never publicly cached).
- **The default test suite is hermetic** — no network, no credentials — and
  asserts invariants: locale parity, template/key integrity, headers,
  discovery surfaces, canonical-host redirect.

## Running locally

```sh
swift run App serve --hostname 127.0.0.1 --port 8080
# http://127.0.0.1:8080  (EN)   http://127.0.0.1:8080/es  (ES)
swift test
```

## Configuration (environment)

| Var | Default | Purpose |
|---|---|---|
| `CANONICAL_HOST` | unset | When set (`jc-root.xyz`), other hosts 301 to it. Leave unset locally. |
| `SITE_BASE_URL` | derived from host, else `http://localhost:8080` | Base for canonical/hreflang/sitemap URLs. |
| `ASSET_VERSION` | `dev` | Deploy stamp for `?v=` cache busting. Set by CI to the Git SHA. |
| `CONTACT_EMAIL` | `juancarlos_tec@proton.me` | CTA / mailto address. |
| `GITHUB_URL` | `https://github.com/JCTec` | Hero + footer link. |
| `LINKEDIN_URL` | `#` (**TODO: set real URL**) | Footer link. |
| `APPSTORE_URL` | `#` (**TODO: set real URL**) | Footer link. |

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

- Real project screenshots to replace the two placeholders (`hasScreenshot`
  cards in `PageController`).
- Real `LINKEDIN_URL` / `APPSTORE_URL` values.
- `Package.resolved` should be committed after the first local
  `swift package resolve` so Docker builds are reproducible
  (`--force-resolved-versions`).
- The design's `About` nav link currently anchors to the Stack section.
