# Third-party components

Everything this site serves is first-party by policy (the CSP is
`default-src 'self'` and would block anything else), so third-party code is
vendored into the repository rather than fetched at runtime. This is the
complete list.

## Bootstrap 5.3.8

- **Files:** `site/public/vendor/bootstrap/css/bootstrap.min.css`,
  `site/public/vendor/bootstrap/js/bootstrap.bundle.min.js`
- **License:** MIT, © 2011–2025 The Bootstrap Authors
- **Source:** https://github.com/twbs/bootstrap/releases

Both files carry their license banner inline; this entry exists so the
dependency is findable without opening a minified file. Only the minified CSS
and the bundled JS are vendored: no source maps, RTL builds, or examples. See
"Upgrading Bootstrap" in `README.md` for the update procedure.

## Everything else

There is nothing else. The build has no dependencies: no `node_modules`, no
lockfile, no toolchain beyond the Node standard library. The Vapor original
resolved Swift packages at build time and pinned them in `Package.resolved`;
none of that survived the move to a static build, which is most of the point.
