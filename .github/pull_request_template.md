## What changed

## Checks

- [ ] `npm run check` passes
- [ ] The committed data is fresh (`node scripts/check-freshness.mjs` passes)
- [ ] `npm run build:llms` was run when `data/` changed
- [ ] The inline JSON-LD and its CSP hash are unchanged, or were refreshed with `npm run build:static`
- [ ] `npm run refresh:check` was reviewed when the refresh pipeline changed
- [ ] `index.html` still matches the machine data (the hero block is written by `npm run refresh`)
- [ ] The README file listing still matches the tree
