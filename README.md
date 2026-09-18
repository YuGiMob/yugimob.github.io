# YuGiMob

Source for [yugimob.github.io](https://yugimob.github.io): a hand-written static
showcase for the pi-coding-agent extensions and tools built by YuGiMob.
Plain HTML, CSS, and JavaScript — no build step, no framework, no runtime
dependencies. GitHub Pages serves the files directly.

The page is a showcase, not a list: the flagship gets a live, interactive
playground, every other artifact gets a demo of its actual interaction pattern,
and a data lab charts the numbers behind the work.

## Page sections

- **Hero** (`#hero`): avatar, name and tagline, live counters for stars,
  weekly installs, packages, and years.
- **Flagship** (`#featured`): pi-hashline-edit-pro, with an interactive
  hashline playground — real 4-letter anchor allocation, a real served-row record, real
  `[E_RANGE_STALE]` refusals, and a scripted tour that runs the whole loop.
- **The Forge** (`#forge`): seven cards, each with a live demo:
  search results and a rendered page (pi-unsloth-webtools), a Tor circuit
  (pi-tor-proxy), a live tokens-per-second widget (pi-tps-status), a workflow
  pipeline (pi-msg-workflow), a guarded commit transcript (pi-git-commit), a
  config tree (mypi), and a benchmark run trace (pi-edit-benchmark).
- **Evidence Lab** (`#lab`): benchmark pass rates, weekly npm installs, the
  download history that grows one snapshot per day, an 18-week activity
  heatmap, and a "last shipped" freshness chart.
- **About** (`#about`): prose and the principles behind the tools.
- **Campfire** (`#campfire`): footer with the GitHub link.

## Files

```
index.html                      page shell, meta tags, JSON-LD
404.html                        themed not-found page
assets/css/style.css            the entire stylesheet
assets/js/main.js               fetch, render, wire everything
assets/js/ui.js                 DOM, formatting, copy, runtime helpers
assets/js/hashline.js           anchor allocation + edit session model
assets/js/playground.js         the flagship interactive demo
assets/js/demos.js              all seven card demos
assets/js/charts.js             the five lab charts
assets/js/avatar.js             avatar srcset hydration
data/site-data.json             machine-refreshed data
data/site-data.schema.json      schema for the above
data/showcase.json              curated narrative and demo wiring
data/showcase.schema.json       schema for the above
scripts/refresh-data.mjs        daily GitHub + npm refresh
scripts/validate-data.mjs       offline validation for both data files
```

## Data model

Two files, with a clean split:

**`data/site-data.json`** is owned by the refresh workflow. It holds the
identity block, the curated project manifest (name, URL, npm package, curated
description), and machine numbers: stars, forks, languages, last push,
weekly npm downloads, stats, activity (window, pushes, highlights, per-day
events), and `history` — one snapshot per day with total stars, total weekly
downloads, and pushes.

**`data/showcase.json`** is curated by hand. It holds the featured project
narrative, one entry per showcased project (kicker, tagline,
highlights, demo id, size), the benchmark snapshot, the principles, the about
prose, and the lab intro. The two files are joined by project name; the
validator fails if a showcased name is missing from the manifest, duplicated,
or if the featured project is repeated in the grid.

## Refreshing data

```
node scripts/refresh-data.mjs
```

The script fetches the GitHub user, repos, and public events, plus npm weekly
downloads for every package in the manifest, then updates only the machine
fields. It requires Node >= 22, needs no install, and makes no authenticated
requests.

What it preserves: curated prose, descriptions, identity, and the showcase
file are never touched. Forks and the site repo are skipped. The file is
written atomically (temp file then rename) with a change summary. If the
existing file is present but unusable, the refresh warns and exits without
writing, so a corrupt file cannot wipe curated content.

Each run also appends a `history` snapshot for the day (replacing an existing
snapshot for the same date, capped at 120 entries) and rebuilds
`activity.daily` from the last 120 days of public events. Those two fields are
what the history chart and heatmap read.

The site refreshes itself daily through
`.github/workflows/refresh-data.yml` (06:00 UTC), which runs the script,
validates both data files, and commits `data/site-data.json` only when it
changed. It can also be triggered manually from the Actions tab.

## Validating

```
node scripts/validate-data.mjs
```

Checks both JSON files against their schemas and the structural rules,
cross-references showcase names with the manifest, and prints
`validate: ok`. The workflow runs it on every refresh.

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
