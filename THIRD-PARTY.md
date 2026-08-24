# Third-party components

Everything this site serves is first-party by policy — the CSP is
`default-src 'self'` and would block anything else — so third-party code is
vendored into the repository rather than fetched at runtime. This is the
complete list.

## Bootstrap 5.3.8

- **Files:** `JCRoot/Public/vendor/bootstrap/css/bootstrap.min.css`,
  `JCRoot/Public/vendor/bootstrap/js/bootstrap.bundle.min.js`
- **License:** MIT — © 2011–2025 The Bootstrap Authors
- **Source:** https://github.com/twbs/bootstrap/releases

Both files carry their license banner inline; this entry exists so the
dependency is findable without opening a minified file. Only the minified CSS
and the bundled JS are vendored — no source maps, RTL builds, or examples. See
"Upgrading Bootstrap" in `JCRoot/README.md` for the update procedure.

## Swift packages

Resolved by SwiftPM at build time and pinned in `JCRoot/Package.resolved`; not
vendored into this repository.

| Package | License |
|---|---|
| [vapor/vapor](https://github.com/vapor/vapor) | MIT |
| [vapor/leaf](https://github.com/vapor/leaf) | MIT |

Their own transitive dependencies (SwiftNIO, swift-crypto, and others) are
listed in `Package.resolved` and are MIT or Apache-2.0.
