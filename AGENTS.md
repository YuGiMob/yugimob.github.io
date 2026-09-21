# Agent notes

This repository is the source of `yugimob.github.io`, a static site with no build
step. `README.md` describes the architecture and `CONTRIBUTING.md` states the
house rules; this file is the short version for a coding agent making a change.

## Commands

- `npm run check` — style, data, and site validation plus the full test suite with coverage thresholds. Run this before calling a change done.
- `npm test` — the test suite alone.
- `npm run validate` — the three validators alone.
- `npm run refresh:check` — run the daily data pipeline without writing anything.
- `npm run build:llms` — regenerate `llms.txt`, `index.md`, `agent-readability.json`, and `feed.json` after a change to `data/`.
- `npm run build:static` — regenerate the pre-rendered page content in `index.html` (hero stats, intro, the problems heading, problem cards, evidence, colophon) after a change to `data/`.
- `npm run csp` — rewrite the inline JSON-LD hash in `index.html` after editing that block.
- `npm run serve` — serve the site locally on port 8123.
- `npm run test:watch` — rerun the suite as files change.

## Rules the validators enforce

- No comments in any file. `npm run validate:style` rejects comment syntax in scripts, templates, markup, stylesheets, Markdown, JSON, and YAML.
- No dependencies, runtime or dev. The page and the toolchain use the Node standard library and the browser platform.
- No third-party requests from the page. Fonts, images, and scripts are self-hosted.
- Machine numbers live in `data/site-data.json`; prose lives in `data/showcase.json`. Never paste a measured number into HTML or prose.
- `index.html` embeds the hero numbers, the intro paragraphs, the problems heading, the problem cards, the evidence prose, the colophon, and the static identity copy. Edit the data and run `npm run build:static` instead of the HTML; `validate:site` refuses drift.
- Every file in `assets/js`, `scripts`, `.github/workflows`, and `data` must appear in the README Files block.
- Every module must be reachable from `assets/js/main.js`. Statically imported modules must be preloaded in `index.html`; modules behind a dynamic `import()` must not be.
- `scripts/check-freshness.mjs` fails when the newest history snapshot is more than two days old or the benchmark report is more than fourteen days old. It runs on push and schedule, not on pull requests.
- Schema changes live in `data/*.schema.json`; `validate:data` re-derives every number it can, including the Wilson and Newcombe intervals.
- `.cache/`, `.lighthouseci/`, and `.omo/` are gitignored and never published.

## Shape of the code

- Pure derivations belong in `assets/js/view-model.js`, `assets/js/hashline.js`, or `scripts/refresh-lib.mjs`.
- The card markup is pre-rendered by `scripts/site-html-lib.mjs`; `assets/js/render.js` hydrates it (mounts demos and charts), and the demo builders own their own DOM.
- I/O and gating belong in `scripts/refresh-data.mjs`; validators are `scripts/validate-*.mjs`.
- Tests live in `tests/` and use `node:test` with the dependency-free DOM double in `tests/dom.mjs`.
