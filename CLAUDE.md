# jc-root.xyz: agent rules

- Site copy lives in `site/strings/{en,es,fr}.strings`; the page, meta tags, JSON-LD and
  the CV PDF are generated from it. Change copy there, in all three locales.
- `site/public/llms.txt` is the exception: hand-written, served as-is. Whenever a plan or
  task changes copy it mirrors (summary/About, specialties, citizenship or languages,
  Selected work names, order, descriptions or links), include the matching llms.txt
  update in the plan and the same change. `test/llms.test.mjs` checks project names and
  order, and copy retired from the site; add a phrase to its `RETIRED` list when you
  remove a claim from the site.
- The CV is the page's sections in their `print` form (`contentSections` in
  `lib/templates.mjs`); CV-only layout goes there, never in a second template, and the web
  page must render unchanged. Each locale's PDF must fit on two pages: CI fails otherwise,
  so render with WeasyPrint 69.0 (`--pdf-tags`) and check the page count before proposing
  copy that lengthens it.
