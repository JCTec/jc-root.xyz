# jc-root.xyz

Monorepo for the personal site of Juan Carlos Estévez Rodríguez.

| Tree | What it is |
|---|---|
| `JCRoot/` | The Vapor app — the only thing deployed. See `JCRoot/README.md`. |
| `docs/Design.pdf` | The visual design the site implements. |
| `LICENSE`, `THIRD-PARTY.md` | MIT for the code; site copy and identity reserved. |
| `Scripts/browser-check.mjs` | Pre-deploy checks that need a real browser — layout, focus contrast, animation, and a returning visitor's stale cache. See `JCRoot/README.md`. |
| `.github/workflows/ci.yml` | One gate (build + test) on every PR/push; green `main` auto-deploys to Heroku via `git subtree split`. |

## Deploying

CI deploys automatically when `main` is green. One-time setup:

1. `heroku create <app-name> --stack container` (or `heroku stack:set container` on an existing app).
2. Add repository secrets `HEROKU_API_KEY` and `HEROKU_APP_NAME` in GitHub → Settings → Secrets and variables → Actions.
3. Set production config vars: `heroku config:set CANONICAL_HOST=jc-root.xyz` (plus any overrides listed in `JCRoot/README.md`).
4. `heroku config:unset ASSET_VERSION`. CI used to stamp this on every deploy; the app now derives it from the bytes of `Public/`. A leftover value silently wins over the derived one and pins every asset URL to a stale stamp.

Manual recovery path only:

```sh
git subtree split --prefix JCRoot -b heroku-main
git push https://heroku:$HEROKU_API_KEY@git.heroku.com/<app-name>.git heroku-main:main --force
```

## Scope and licensing

The code is MIT (see `LICENSE`) — reuse it. The site's copy, biography, icons
and design are reserved: `JCRoot/Resources/Strings/`, `JCRoot/Public/icons/`,
`JCRoot/Public/llms.txt` and `docs/Design.pdf` are a CV, not a template.
Vendored third-party code is listed in `THIRD-PARTY.md`.

## Edge configuration (Cloudflare)

DNS and TLS terminate at Cloudflare in front of the Heroku origin. Two pieces
of that live outside this repository and are recorded here because nothing in
CI would catch them regressing:

- **HTTPS is forced by a Redirect Rule scoped to `jc-root.xyz` and
  `www.jc-root.xyz`**, not by the zone-wide "Always Use HTTPS" setting. The
  zone-wide switch would also capture `mt-link.jc-root.xyz` and
  `mt06.jc-root.xyz` — proxied Mailtrap CNAMEs that answer over HTTP and fail
  over HTTPS with a 525, because zone SSL is Full (strict) and Mailtrap has no
  certificate for those names. Turning it on would break email link tracking.
  `CanonicalURLMiddleware` enforces the same rule at the origin, so a direct
  hit on the Heroku app is covered too.
- **Zone SSL is Full (strict)** and the minimum TLS version is 1.2. Full
  (strict) is what makes the origin-side redirect safe: Cloudflare always
  reaches Heroku over HTTPS, so `X-Forwarded-Proto` is `https` and the
  middleware cannot put a request into a redirect loop.

Known issue, deliberately unaddressed: those two Mailtrap records are proxied
when they should almost certainly be DNS-only. `mt06` is a mail host, and
Cloudflare's proxy does not carry SMTP — it currently resolves to Cloudflare
addresses rather than Mailtrap's. Fixing that is an email-infrastructure change,
not a site change.
