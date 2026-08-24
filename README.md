# jc-root.xyz

Monorepo for the personal site of Juan Carlos Estévez Rodríguez.

| Tree | What it is |
|---|---|
| `JCRoot/` | The Vapor app — the only thing deployed. See `JCRoot/README.md`. |
| `Design.pdf` | The visual design the site implements. |
| `Scripts/browser-check.mjs` | Pre-deploy checks that need a real browser — layout, focus contrast, animation, and a returning visitor's stale cache. See `JCRoot/README.md`. |
| `.github/workflows/ci.yml` | One gate (build + test) on every PR/push; green `main` auto-deploys to Heroku via `git subtree split`. |

## Deploying

CI deploys automatically when `main` is green. One-time setup:

1. `heroku create <app-name> --stack container` (or `heroku stack:set container` on an existing app).
2. Add repository secrets `HEROKU_API_KEY` and `HEROKU_APP_NAME` in GitHub → Settings → Secrets and variables → Actions.
3. Set production config vars: `heroku config:set CANONICAL_HOST=jc-root.xyz` (plus any overrides listed in `JCRoot/README.md`).

Manual recovery path only:

```sh
git subtree split --prefix JCRoot -b heroku-main
git push https://heroku:$HEROKU_API_KEY@git.heroku.com/<app-name>.git heroku-main:main --force
```
