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
  matter. Live counters for stars, packages, and weekly installs.
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

## Files

```
index.html                      page shell, meta tags, JSON-LD
404.html                        not-found page
favicon.ico                     legacy favicon
sitemap.xml                     single-URL sitemap, lastmod refreshed with the data
robots.txt                      crawl policy and sitemap reference
LICENSE                         MIT license for this repository
assets/apple-touch-icon.png     iOS home-screen icon
assets/avatar.png               self-hosted avatar, no third-party origin
assets/og.jpg                   social preview image
assets/css/style.css            the entire stylesheet, fonts and both color schemes
assets/fonts/                   self-hosted Inter, Newsreader, IBM Plex Mono
assets/js/main.js               boot, fetch, navigation, error state
assets/js/render.js             all DOM rendering
assets/js/site-data.js          data guards, fallback model, formatting
assets/js/view-model.js         pure derivations behind the DOM
assets/js/fetch-json.js         retrying JSON fetch with a timeout
assets/js/ui.js                 DOM, formatting, copy, runtime helpers
assets/js/hashline.js           anchor allocation + edit session model
assets/js/playground.js         the flagship interactive demo
assets/js/demos.js              all five card demos
assets/js/charts.js             benchmark and history charts
assets/js/avatar.js             avatar srcset hydration
data/site-data.json             machine-refreshed data
data/site-data.schema.json      schema for the above
data/showcase.json              curated narrative and demo wiring
data/showcase.schema.json       schema for the above
scripts/refresh-data.mjs        daily GitHub + npm refresh
scripts/refresh-lib.mjs         pure activity and history helpers
scripts/validate-data.mjs       offline validation for both data files
scripts/validate-site.mjs       HTML, module, README, and CSS reference checks
scripts/check-links.mjs         monthly external-link check
tests/                          node:test unit and integration tests
package.json                    scripts only, no runtime dependencies
.github/workflows/refresh-data.yml  daily refresh and commit
.github/workflows/validate.yml      validation on push and pull request
.github/workflows/links.yml         monthly external-link check
.github/dependabot.yml              weekly action updates
```

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
4. Run `npm run check`. The validators reject unknown demo ids, names missing
   from the manifest, duplicated projects, and unsorted history.

## Data model

Two files, with a clean split:

**`data/site-data.json`** is owned by the refresh workflow. It holds the
identity block, the curated project manifest (name, URL, npm package, curated
description), and machine numbers: stars, forks, languages, last push,
weekly npm downloads, stats, activity (window, pushes, highlights, per-day
events), and `history`: one snapshot per day with total stars and total weekly
downloads. The About panel renders the highlights and the public-repo and
forks-received totals, and the footer prints a notice when either the activity
or the benchmark snapshot is more than three days old.

It also holds the `benchmark` block behind the evidence chart. The refresh
pulls the committed run report from pi-edit-benchmark, joins every run to the
scenario focus that the benchmark's own scenario sources declare, and derives
the pass rates, the staleness and served-state splits, the outcome counts, and
a 95% Wilson interval per contender. Each contender keeps a link to a
committed trace. Nothing in that block is typed by hand, so the chart cannot
drift from the runs it claims to show.

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
written atomically (temp file then rename) with a change summary. If the
existing file is present but unusable, the refresh exits with an error without
writing, so a corrupt file cannot wipe curated content.
If the file is missing entirely, the refresh exits with an error instead of
writing an empty skeleton. When nothing changed, the run only prints the
summary and leaves the file untouched. Repos listed in `UNLISTED_REPOS`
(`pi-jina-webtools`, `pi-msg-queue`, `pi-tps-status`, `mypi`) are known public
repos that are deliberately not curated, so they do not produce a warning.

Each run also appends a `history` snapshot for the day (replacing an existing
snapshot for the same date, capped at 120 entries) and rebuilds
`activity.daily` from the most recent public events, paginating up to the
GitHub API's 300-event maximum and capping the window at 120 days.
When a fetch reaches an API pagination cap, the run prints a warning so the
truncated window is visible in the log.

If the benchmark report or its scenario sources cannot be fetched, the run
warns and keeps the existing block rather than writing a partial chart. A
summary with no highlighted contender, or one whose runs do not cover the full
models × scenarios matrix, is refused the same way. A run that writes today's
history snapshot moves the `lastmod` in `sitemap.xml` to that day; a run that
only touches other machine fields leaves the sitemap alone.

The site refreshes itself daily through
`.github/workflows/refresh-data.yml` (06:00 UTC), which runs the script,
validates both data files, and commits `data/site-data.json` and `sitemap.xml`
only when one of them changed. It can also be triggered manually from the Actions
tab.

## Validating

```
npm run validate
```

`npm run validate` runs both checkers. The data validator walks both JSON files
against the schema files themselves, so a rule lives in one place, then
cross-references showcase names with the manifest, verifies every `demo` id,
and re-derives the benchmark arithmetic (contender counts, `models × scenarios`,
outcome totals, and the interval around each pass rate), and refuses histories,
daily activity, or highlight lists beyond the documented caps. It prints
`validate: ok` and lists every failure it finds in one run. The site validator
checks internal links, element ids the scripts depend on, module preloads, the
runtime data preloads, README file paths, local stylesheet references, the
`Content-Security-Policy` on both pages, that the CSP hash still matches the
inline JSON-LD block, that the avatar path exists and its origin is allowed,
the sitemap `lastmod` against the newest history date, the nav order against
the section order, title and description lengths, and a set of static
accessibility rules (`lang`, `img` alt text, `aria` references, `target=_blank`
rel, heading order, a single `main`), then prints `validate:site: ok`. The
schema files also
drive editor validation through the `$schema` keys in both data files. The
workflow runs both on every refresh and on push.

## Testing

```
npm test
```

The suite runs on `node --test` with no dependencies: unit tests for the
anchored-edit session model, the guided playground flow, the avatar srcset
helper, the retrying fetch, the data guards, the view-model derivations, the
chart transforms, the visibility rules, and the refresh activity, history, and
benchmark helpers, plus a parse check for every script
and integration checks that the committed data and site structure pass their
validators and that the validator refuses broken input.

`npm run check` runs validation and the tests together. `npm run coverage`
adds `--experimental-test-coverage` (Node 22.8 or newer) with thresholds on
lines, branches, and functions. Test files and the DOM-bound modules
(`render.js`, `main.js`, `demos.js`, `playground.js`, `charts.js`, `ui.js`,
`avatar.js`) are excluded from the gate: they are exercised through the site
validator and by hand, while the gate covers the logic modules that the unit
suite actually drives. `npm run check` uses the coverage run, so CI fails when
the covered code slips.

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
