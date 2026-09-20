# YuGiMob

Source for [yugimob.github.io](https://yugimob.github.io): a hand-written static
showcase for the pi-coding-agent extensions and tools built by YuGiMob.
Plain HTML, CSS, and JavaScript, with no build step, no framework, and no
runtime dependencies. GitHub Pages serves the files directly, and the page
makes no third-party requests: fonts, the avatar, and every script are served
from this repository. The site code is MIT (see `LICENSE`).

The page opens with an introduction, then presents one problem per tool and
the extension that answers it, each with a live demo of the interaction it
changes. The benchmark at the end shows the runs, including the ones the
flagship loses.

## Page sections

- **Intro** (`#intro`): who I am, what the page is, and why the failure modes
  matter. Counters for stars, packages, and weekly installs, pre-rendered in the
  HTML for a no-JS read and animated once the data lands.
- **The problems** (`#problems`): an index of the failures, then one entry per
  tool. Each entry leads with the problem, then the answer: the project,
  install command, source link, and a working demo.
  - pi-hashline-edit-pro gets the flagship treatment with an interactive
    hashline playground: real 4-letter anchor allocation, a served-row record,
    real `[E_RANGE_STALE]` refusals, and a guided eight-step run through one
    edit (read, replace, insert, `anchor_grep`, drift, refusal, retry, undo)
    that can be linked at any step with `?step=N`.
  - The other entries run a pipeline graph (pi-unsloth-webtools), a Tor circuit
    (pi-tor-proxy), a workflow pipeline (pi-msg-workflow), and a guarded commit
    transcript (pi-git-commit).
- **The evidence** (`#evidence`): pi-edit-benchmark as the answer to "everyone
  claims their tool is better": benchmark pass rates from committed run
  reports, plus a scored trace showing a refusal and a recovery.
- **About** (`#colophon`): why the tools exist, the principles behind them, and
  a pushes-per-day chart built from public GitHub events.
- Footer (`#campfire`): the GitHub link and the daily-refresh note.

## How the pieces fit

```
GitHub + npm + benchmark report
        |
        v
scripts/refresh-data.mjs ---> scripts/refresh-lib.mjs (pure aggregation)
        |
        |  validate-data.mjs re-derives the numbers, then temp-file + rename
        v
data/site-data.json      machine numbers          data/showcase.json  curated prose
        |                                                   |
        +----------------------+----------------------------+
                               v
                     assets/js/main.js (fetch + guards)
                               |
                     assets/js/view-model.js (pure derivations)
                               |
                     assets/js/render.js + lazy.js
                               |
             demos.js · playground.js · charts.js (dynamic imports)
```

The same refresh rewrites the hero stat block in `index.html` and regenerates
`llms.txt`, `index.md`, and `agent-readability.json`, so the page, the machine
files, and the agent index cannot drift apart. Validators re-derive every rule
they can, and the test suite runs them against a temporary copy of the tree.

## Files

```
index.html                      page shell, meta tags, JSON-LD
404.html                        not-found page
llms.txt                        generated site map for language models
index.md                        generated markdown mirror of the page
agent-readability.json          generated machine-readable surface index
favicon.ico                     legacy favicon
sitemap.xml                     single-URL sitemap, lastmod refreshed with the data
robots.txt                      crawl policy and sitemap reference
LICENSE                         MIT license for this repository
SECURITY.md                     vulnerability reporting policy
CONTRIBUTING.md                 contributor rules, module map, and check list
.well-known/security.txt        RFC 9116 contact
assets/apple-touch-icon.png     iOS home-screen icon
assets/avatar.png               self-hosted avatar, no third-party origin
assets/og.jpg                   social preview image
assets/favicon.svg              light favicon
assets/favicon-dark.svg         dark favicon
assets/css/style.css            the entire stylesheet, fonts and both color schemes
assets/fonts/                   self-hosted Inter, Newsreader, IBM Plex Mono
assets/js/main.js               boot, fetch, navigation, error state
assets/js/render.js             all DOM rendering
assets/js/lazy.js               lazy mounting behind IntersectionObserver
assets/js/demo-registry.js      demo id to dynamic loader registry
assets/js/site-data.js          data guards, fallback model, formatting
assets/js/view-model.js         pure derivations behind the DOM
assets/js/fetch-json.js         retrying JSON fetch with a timeout
assets/js/ui.js                 DOM, formatting, copy, runtime helpers
assets/js/hashline.js           anchor allocation + edit session model
assets/js/playground.js         the flagship interactive demo
assets/js/demos.js              all five card demos
assets/js/charts.js             benchmark, trend, and history charts
assets/js/avatar.js             avatar srcset hydration
data/site-data.json             machine-refreshed data
data/site-data.schema.json      schema for the above
data/showcase.json              curated narrative and demo wiring
data/showcase.schema.json       schema for the above
data/benchmark-matrix.json      per-scenario pass counts behind the evidence chart
data/benchmark-matrix.schema.json  schema for the above
scripts/refresh-data.mjs        daily GitHub + npm refresh
scripts/refresh-lib.mjs         pure activity, history, and benchmark helpers
scripts/build-llms.mjs          regenerate llms.txt, index.md, and the agent manifest
scripts/llms-lib.mjs            agent-file content builders and atomic writers
scripts/validate-data.mjs       offline validation for the data files
scripts/validate-site.mjs       HTML, module, README, and CSS reference checks
scripts/check-links.mjs         monthly external-link check
scripts/validate-style.mjs      comment, line ending, and whitespace checks
scripts/link-lib.mjs            link collection, probing, and verdicts
scripts/build-csp.mjs           refresh the inline JSON-LD CSP hash
scripts/csp-lib.mjs             script-src directive and hash helpers
scripts/sitemap-lib.mjs         sitemap lastmod reader and atomic writer
scripts/contrast-lib.mjs        WCAG contrast helpers for the palette check
scripts/site-html-lib.mjs        hero stat block builder and atomic writer
scripts/check-freshness.mjs     fail when the newest history snapshot is too old
tests/                          node:test unit and integration tests
package.json                    scripts only, no runtime dependencies
.nvmrc                          the Node version CI and local runs share
.github/workflows/refresh-data.yml  daily refresh and commit
.github/workflows/validate.yml      validation on push and pull request
.github/workflows/links.yml         monthly external-link check
.github/workflows/codeql.yml        CodeQL analysis on push and pull request
.github/workflows/scorecard.yml     weekly OpenSSF Scorecard
.github/dependabot.yml              weekly action updates
.github/CODEOWNERS                  review ownership
.github/pull_request_template.md    the pull request checklist
```

`.omo/` is local agent scratch for planning and evidence; it is gitignored and
not part of the published site.

## Demos

A showcase entry names a `demo`, and that name must exist in the registry:

| demo | implementation |
| --- | --- |
| `hashline` | assets/js/playground.js |
| `webtools` | assets/js/demos.js |
| `tor` | assets/js/demos.js |
| `workflow` | assets/js/demos.js |
| `git` | assets/js/demos.js |
| `trace` | assets/js/demos.js |

`size` is `hero` or `default`; the hero entry gets the wider grid. The
`sections` block in `data/site-data.json` toggles the About, problems,
evidence, hero stats, and footer blocks.

## Adding a tool

1. Add or update the project in `data/site-data.json` (name, URL, npm package,
   license, description). The refresh keeps the machine fields current.
2. Add one entry to `problems` in `data/showcase.json`: kicker, headline,
   problem, answer, highlights, optional `demo`, and `size`. The name must match
   the manifest.
3. If the entry names a demo, implement it in `assets/js/demos.js` and register
   it in `BUILDERS`; the `hashline` demo lives in `assets/js/playground.js`.
4. Run `npm run build:llms` and `npm run check`. The validators reject unknown
   demo ids, names missing from the manifest, duplicated projects, unsorted
   history, and a `llms.txt` that no longer matches the data files.

## Data model

Two files, with a clean split:

**`data/site-data.json`** is owned by the refresh workflow. It holds the
identity block, the curated project manifest (name, URL, npm package, curated
description), and machine numbers: stars, forks, languages, last push,
weekly npm downloads, stats, activity (window, pushes, highlights, per-day
events), and `history`: one snapshot per day with total stars and total weekly
downloads. The About panel renders the highlights and the public-repo and
forks-received totals, and the footer prints a notice when either the activity
or the benchmark snapshot is more than three days old. The `stats` totals cover
every public repository the API returns, forks and the site repository included,
so they can differ from the sum of the curated project cards.

It also holds the `benchmark` block behind the evidence chart. The refresh
pulls the committed run report from pi-edit-benchmark, joins every run to the
scenario focus that the benchmark's own scenario sources declare, and derives
the pass rates, the staleness and served-state splits, the outcome counts, and
a 95% Wilson interval per contender. Because every contender runs the same model
× scenario grid, each one is also paired against the highlighted project with
an exact two-sided McNemar test, and the p-values are Holm-adjusted across the
comparisons, so the chart can say whether a lead is real or inside noise. Each
contender keeps a link to a committed
trace. Nothing in that block is typed by hand, so the chart cannot
drift from the runs it claims to show. Each refresh also appends one
`benchmarkHistory` snapshot for the highlighted project, so the evidence panel
can show whether the tool is improving between reports.

A second machine file, `data/benchmark-matrix.json`, records which models passed
each scenario × contender cell. The refresh derives it from the same report and
refuses to write either file unless the matrix totals and the paired comparison
counts match the benchmark block, so the McNemar figures and their Holm
adjustment are re-derived from the matrix rather than trusted. The evidence
panel fetches the matrix lazily and renders it as a grid.

The About panel renders those snapshots as a stars and weekly-installs trend.

**`data/showcase.json`** is curated by hand. It holds the introduction, one
entry per problem/tool pair (kicker, problem headline, problem paragraph,
answer paragraph, highlights, demo id, size), the evidence narrative
(problem, answer, highlights, trace demo), the principles, and the colophon
prose. It carries no numbers: the chart reads them from the machine file. The
two files are joined by project name; the validator fails if a showcased name
is missing from the manifest, duplicated, or if the same project is used for
both a problem and the evidence.

## Refreshing data

```
node scripts/refresh-data.mjs
```

`npm run refresh:check` runs the same pipeline with `--check` and writes nothing,
so a candidate can be reviewed before it lands.

The script fetches the GitHub user, repos, and public events, npm weekly
downloads for every package in the manifest, and the committed
pi-edit-benchmark run report plus its scenario sources, then updates only the
machine fields. It requires Node >= 22.8, needs no install, and makes no
authenticated requests by default; the refresh workflow passes `GITHUB_TOKEN`
so scheduled runs do not fight over a shared rate limit.

The avatar is not fetched: `assets/avatar.png` is a committed copy of the GitHub
avatar, so replace that file by hand when the profile picture changes.

What it preserves: curated prose, descriptions, identity, and the showcase
file are never touched. Forks and the site repo are skipped. The file is
written atomically (temp file then rename) with a change summary, and the
candidate is revalidated before the rename, so a document the schema rejects
can never reach `data/site-data.json`. A successful write also regenerates
`llms.txt`, `index.md`, and `agent-readability.json` from the two data files,
rewrites the hero stat block in `index.html`, and writes the benchmark matrix.
If the existing file is present but unusable,
the refresh exits with an error without
writing, so a corrupt file cannot wipe curated content.
If the file is missing entirely, the refresh exits with an error instead of
writing an empty skeleton. When nothing changed, the run only prints the
summary and leaves the file untouched. Repos listed in `UNLISTED_REPOS`
(`pi-jina-webtools`, `pi-msg-queue`, `pi-tps-status`, `mypi`) are known public
repos that are deliberately not curated, so they do not produce a warning.

Each run also appends a `history` snapshot and a `benchmarkHistory` snapshot
for the report date (replacing an existing entry for the same date, each capped
at 120 entries) and rebuilds `activity.daily` from the most recent public
events, paginating up to the GitHub API's 300-event maximum and capping the
window at 120 days.
When a fetch reaches an API pagination cap, the run prints a warning so the
truncated window is visible in the log. A run that could not read the repos leaves
`history` and `stats` untouched, so an outage cannot stamp yesterday's numbers with
today's date; activity still follows the public events when those arrive.

If the benchmark report or its scenario sources cannot be fetched, the run
warns and keeps the existing block rather than writing a partial chart. A
summary with no highlighted contender, or one whose runs do not cover the full
models × scenarios matrix, is refused the same way. A run that writes today's
history snapshot moves the `lastmod` in `sitemap.xml` to that day; a run that
only touches other machine fields leaves the sitemap alone.

The site refreshes itself daily through
`.github/workflows/refresh-data.yml` (06:00 UTC), which runs the script,
validates the data files, and commits `data/site-data.json`,
`data/benchmark-matrix.json`, `sitemap.xml`, `index.html`, `llms.txt`, `index.md`, and
`agent-readability.json` only when at least one of them changed, and fails
when the newest history snapshot is
still more than two days old, so an outage cannot pass silently. It can also be
triggered manually from the Actions tab.

## Validating

```
npm run validate
```

`npm run validate` runs three checkers. The style checker refuses comments in
any script and enforces LF endings, spaces for indentation, no trailing
whitespace, and a final newline. Its comment scan reads strings, templates,
and regexes as text, reaches comments inside template-literal expressions, and
scans HTML, CSS, and Markdown for their comment syntax too. The data validator
walks the JSON files against the schema files themselves, so a rule lives in
one place, then
cross-references showcase names with the manifest, verifies every `demo` id,
and re-derives the benchmark arithmetic (contender counts, `models × scenarios`,
outcome totals, and recomputes the Wilson interval around each pass rate), and
refuses histories,
daily activity, benchmark history, or highlight lists beyond the documented
caps. It prints
`validate: ok` and lists every failure it finds in one run. The site validator
checks internal links, element ids the scripts depend on, module preloads and
the full module reachability graph, the runtime data preloads, the README file
listing in both directions, the noscript list's completeness, local stylesheet
references, the `Content-Security-Policy` on both pages (including the Trusted
Types directive and a scan for DOM sinks that would violate it), that the CSP
hash still matches the
inline JSON-LD block, that the avatar path exists and its origin is allowed,
the sitemap `lastmod` against the newest history date, the nav order against
the section order, title and description lengths, and a set of static
accessibility rules (`lang`, `img` alt text, `aria` references, `target=_blank`
rel, heading order, a single `main`), then prints `validate:site: ok`. It also
refuses static copy that drifts from the data files (`<title>`, meta description,
social tags, `#display-name`, `#class-title`, `#intro-headline`, and
`#problems-heading`), inline `style` and event-handler attributes the CSP forbids,
a sitemap or `robots.txt` that disagrees with the canonical URL, a `security.txt`
that expires within 60 days, a palette pair below the 4.5:1 contrast minimum, an
asset group over its weight budget, an image whose real dimensions differ from
the declared ones, and a manifest project with no showcase entry. The
schema walker refuses a keyword or format it does not
implement, so a rule can never be silently unenforced. The schema files also
drive editor validation through the `$schema` keys in the data files. The
workflow runs all three on every refresh and on push. `npm run csp` rewrites the
CSP hash in place after the inline JSON-LD changes. Separate tests keep
`llms.txt`, `index.md`, and `agent-readability.json` in step with the two data
files, and `npm run build:llms` regenerates them by hand. The data validator
re-derives every McNemar comparison and its Holm adjustment from the matrix,
and refuses a benchmark matrix whose totals or paired counts disagree with the
benchmark block.

## Testing

```
npm test
```

The suite runs on `node --test` with no dependencies: unit tests for the
anchored-edit session model, the guided playground flow, the avatar srcset
helper, the retrying fetch, the data guards, the view-model derivations, the
chart transforms, the visibility rules, the sitemap lastmod writer, and the
refresh activity, history, and benchmark helpers, plus a parse check for every
script and integration checks that the committed data and site structure pass
their validators and that each validator refuses broken input, including
comments, CRLF, a comment inside a template expression or a stylesheet, a
stale hero stat block, a noscript list missing a project, and static copy that
drifted from the data.
The refresh pipeline is also driven end to end against committed API fixtures,
with and without the GitHub API and in dry-run mode, so the fetch, the benchmark
gate, the atomic write, the sitemap update, and the llms regeneration are all
exercised.

`npm run check` runs validation and the tests together. `npm run coverage`
adds `--experimental-test-coverage` (Node 22.8 or newer) with thresholds on
lines, branches, and functions. Test files and the three modules that only wire
the page together (`main.js`, `demos.js`, and `playground.js`) are excluded from
the gate, though the suite still smokes the boot path, every demo builder, and
the playground keyboard flow; everything else, including the rendering, chart,
and UI modules, is driven through a small dependency-free DOM double that the
suite installs and restores. `npm run check` uses the coverage run, so CI fails
when the covered
code slips.

## Serving locally

```
python3 -m http.server 8123
```

Then open <http://localhost:8123/>.

## Deploying

The site is served from the `main` branch, so a deploy is a normal push.

```
git add -A
git commit -m "feat(site): ..."
git push
```

GitHub Pages auto-builds from the main root after each push.

First-time setup, if the repo does not exist yet:

1. Create a public repository named `yugimob.github.io`.
2. Push this repository's `main` branch to it.
3. Enable Pages: Settings → Pages → Source → "Deploy from a branch", branch
   `main`, folder `/`.
