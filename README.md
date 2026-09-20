# YuGiMob

Source for [yugimob.github.io](https://yugimob.github.io): a hand-written static
showcase for the pi-coding-agent extensions and tools built by YuGiMob.
Plain HTML, CSS, and JavaScript, with no build step, no framework, and no
runtime dependencies. GitHub Pages serves the files directly.

The page opens with an introduction, then presents one problem per tool and
the extension that answers it, each with a live demo of the interaction it
changes. The benchmark at the end shows the runs, including the ones the
flagship loses.

## Page sections

- **Intro** (`#intro`): who I am, what the page is, and why the failure modes
  matter. Live counters for stars, packages, and weekly installs.
- **The problems** (`#problems`): an index of six failures, then one entry per
  tool. Each entry leads with the problem, then the answer: the project,
  install command, source link, and a working demo.
  - pi-hashline-edit-pro gets the flagship treatment with an interactive
    hashline playground: real 4-letter anchor allocation, a served-row record,
    real `[E_RANGE_STALE]` refusals, and a guided six-step run through one edit.
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
assets/css/style.css            the entire stylesheet
assets/js/main.js               fetch, render, wire everything
assets/js/ui.js                 DOM, formatting, copy, runtime helpers
assets/js/hashline.js           anchor allocation + edit session model
assets/js/playground.js         the flagship interactive demo
assets/js/demos.js              all five card demos
assets/js/charts.js             the benchmark chart
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
events), and `history`: one snapshot per day with total stars, total weekly
downloads, and pushes.

**`data/showcase.json`** is curated by hand. It holds the introduction, one
entry per problem/tool pair (kicker, problem headline, problem paragraph,
answer paragraph, highlights, demo id, size), the evidence block
(with the benchmark snapshot and trace demo), the principles, and the
colophon prose. The two files are joined by project name; the validator
fails if a showcased name is missing from the manifest, duplicated, or if the
same project is used for both a problem and the evidence.

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
`activity.daily` from the last 120 days of public events.

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
