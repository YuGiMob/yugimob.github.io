# Contributing

Thanks for looking. This repository is a static site with no build step and no
runtime dependencies, so the whole loop is three commands.

## Getting set up

```
node --version
npm run check
python3 -m http.server 8123
```

Open <http://localhost:8123/> to see the page.

## House rules

- **No comments.** Not in JavaScript, CSS, HTML, JSON, shell, or Markdown.
  `npm run validate:style` enforces this, along with LF endings, spaces for
  indentation, and a final newline. Make the code self-explanatory instead:
  clear names, small functions, obvious control flow.
- **No dependencies.** The page and the toolchain run on the Node standard
  library and the browser platform. Do not add a runtime or dev dependency for
  something the standard library already does.
- **No third-party requests from the page.** Fonts, images, and scripts are
  self-hosted. `validate:site` rejects a remote script, stylesheet, or preload.
- **Everything derived stays derived.** Machine numbers live in
  `data/site-data.json`; prose lives in `data/showcase.json`. Never paste a
  measured number into HTML or prose.

## Module boundaries

```
assets/js/
  ui.js             generic DOM, formatting, copy, timers, controllers
  site-data.js      shape guards and fallbacks for the fetched documents
  view-model.js     pure derivations: rows, headings, notices, JSON-LD
  render.js         DOM construction only, no data math
  lazy.js           lazy mounting behind IntersectionObserver
  charts.js         benchmark, matrix, trend, and history panels
  demo-registry.js  demo id to a dynamic module loader
  demos.js          the five card demos
  playground.js     the hashline guided run, built on hashline.js
  hashline.js       the anchored-edit session model
  avatar.js         avatar src and alt hydration
  fetch-json.js     retrying JSON fetch with a timeout
  main.js           boot, fetch, navigation, error state
```

Keep derivations in `view-model.js` or `hashline.js` so they can be tested
without a DOM. Keep DOM work in `render.js` and the demo builders. Browser
modules must not read `data/site-data.json` directly; `main.js` fetches and
passes the parsed documents down.

Scripts follow the same split: `scripts/refresh-lib.mjs` holds the pure
arithmetic, and `scripts/refresh-data.mjs` only performs I/O and gating.

## Adding a tool

1. Add the project to `data/site-data.json` and a matching entry to
   `data/showcase.json`. `validate:data` rejects a project without a showcase
   entry, a duplicate name, or a duplicate npm package.
2. Name a `demo` only if you implement it: register it in `assets/js/demos.js`
   and it becomes a valid id automatically. The `hashline` demo lives in
   `assets/js/playground.js`.
3. Add the repository to the `<noscript>` list in `index.html` with its install
   command. `validate:site` checks both directions.
4. Run `npm run build:llms` and `npm run check`.

## Generated files

These are derived. Edit the inputs, then regenerate:

| file | regenerate with |
| --- | --- |
| `llms.txt`, `index.md`, `agent-readability.json`, `feed.json` | `npm run build:llms` |
| the hero stat block in `index.html` | `npm run refresh` (or edit it in step with the data) |
| the CSP hash in `index.html` | `npm run csp` |
| `sitemap.xml` lastmod | `npm run refresh` |

`npm run refresh:check` runs the daily pipeline without writing, so a data
change can be reviewed first.

## Checks

`npm run check` runs, in order, the style validator, the data validator, the
site validator, and `node --test` with coverage thresholds. Fix the first
failure before re-running; each validator prints every problem it found.

CI runs the same command on Node 22 and 24, then the freshness check, so a data
snapshot older than two days fails every push and pull request until the daily
refresh heals it. Two more workflows gate a change: Lighthouse
(`.lighthouserc.json`) audits the committed page for accessibility and layout
stability, and zizmor audits the workflows themselves (`.github/zizmor.yml`).
Keep the README file listing in step with the tree, since `validate:site` reads
it.
