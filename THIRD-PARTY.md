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

## OpenDyslexic (reading settings font)

- **Files:** `site/public/vendor/fonts/opendyslexic-regular.77bda89f.woff2`,
  `site/public/vendor/fonts/opendyslexic-bold.77bda89f.woff2`
- **License:** SIL Open Font License 1.1, © Abbie Gonzalez, Reserved Font
  Name OpenDyslexic; full text in `site/public/vendor/fonts/OpenDyslexic-OFL.txt`
- **Source:** https://github.com/antijingoist/opendyslexic, `compiled/` at
  commit `77bda89f3f2069c78d81d33de43b461c2de6c48e` (the short hash is in the
  filenames, since `/vendor/` is cached as immutable)

## Atkinson Hyperlegible (reading settings font)

- **Files:** `site/public/vendor/fonts/atkinson-hyperlegible-latin-400.5.3.0.woff2`,
  `site/public/vendor/fonts/atkinson-hyperlegible-latin-700.5.3.0.woff2`
- **License:** SIL Open Font License 1.1, © 2020 Braille Institute of
  America, Inc.; full text in `site/public/vendor/fonts/AtkinsonHyperlegible-OFL.txt`
- **Source:** `@fontsource/atkinson-hyperlegible` 5.3.0 (Latin subset, which
  covers English, Spanish and French), version in the filenames

Both are unmodified and served only when a visitor picks them in the reading
settings; the browser never fetches a face no text uses.

## Everything else

There is nothing else. The build has no dependencies: no `node_modules`, no
lockfile, no toolchain beyond the Node standard library. The Vapor original
resolved Swift packages at build time and pinned them in `Package.resolved`;
none of that survived the move to a static build, which is most of the point.
