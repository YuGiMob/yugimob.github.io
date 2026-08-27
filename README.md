# YuGiMob

This is the source for [yugimob.github.io](https://yugimob.github.io), a static
single-page profile site for the GitHub account YuGiMob: plain HTML, CSS, and
JavaScript with a Dungeons & Dragons theme. It has a hero header, a short
background, artifact cards (one per curated public repo), a quest log of recent
activity, ability-score stat bars, and a campfire footer with a GitHub link.

Everything renders from one data file, `data/site-data.json`, with no build
step and no framework. GitHub Pages serves these files directly.

## Sections

- **Hero** (`#hero`): avatar, display name, class title, tagline
- **Background** (`#background`): prose paragraphs
- **Artifacts** (`#artifacts`): cards for the curated public repos
- **Quest log** (`#quest-log`): recent activity snapshot
- **Ability scores** (`#ability-scores`): stat bars
- **Campfire** (`#campfire`): footer with GitHub link

## Editing content

All content lives in `data/site-data.json`. Edit it by hand, then commit.

### identity

- `displayName`: name shown in the hero
- `classTitle`: D&D-flavored subtitle
- `tagline`: one-line description
- `avatarUrl`: avatar image URL
- `links.github`: GitHub profile link
- `links.email`: leave `null` (privacy default). The site shows no email
  address unless you choose to add one.

The `<head>` of `index.html` also hardcodes the display name, class title, and
tagline in its meta tags (description, title, Open Graph, Twitter) for search
engines and link previews, which do not run JavaScript — update those tags
whenever you change the identity fields.

### about

- `about.paragraphs`: an array of strings rendered as prose paragraphs.

### projects

An array of entries, one per curated public repo, each with `name`, `description`,
`language`, `stars`, `forks`, `url`, `npm`, `license`, `npmWeeklyDownloads`,
and `pushedAt` (`npm` and `license` are `null` when not applicable;
`npmWeeklyDownloads` is absent for non-npm projects; `pushedAt` is the last
push date from the GitHub API). Cards sort by `stars` descending, show the
license when present, the weekly npm download count when positive, and the
last push date as "updated <month year>"; the rarity tier comes from the star
count:

| Stars | Rarity |
| --- | --- |
| 0 | common |
| 1-9 | uncommon |
| 10-29 | rare |
| 30-49 | epic |
| 50+ | legendary |

### stats

Six numbers mapped to the D&D ability bars: `totalStars` = Strength,
`npmPackages` = Dexterity, `publicRepos` = Intelligence, `starsGiven` = Wisdom,
`forksReceived` = Charisma, `accountYears` = Constitution.

### activity

- `window`: date range covered
- `pushes`: push count in that window
- `highlights`: notable events
- `fetchedAt`: when the data was last fetched (shown in the quest log header)

### sections

- `showBackground`, `showArtifacts`, `showQuestLog`, `showAbilityScores`,
  `showCampfire`: set one to `false` to hide that section.

## Refreshing data

Run:

```
node scripts/refresh-data.mjs
```

This re-fetches the GitHub API (user, repos, events) and npm weekly downloads
for the nine published pi packages, then updates the numbers: stars, forks,
last-push dates, pushes, downloads. It requires Node >= 22, needs no install,
and makes no authenticated requests, so no credentials are needed.

The site also refreshes itself daily via a scheduled GitHub Actions workflow
(`.github/workflows/refresh-data.yml`, 06:00 UTC) that runs the same script and
commits the result only when the data actually changed. It can be triggered
manually from the Actions tab as well.

Curated prose is preserved: descriptions, about paragraphs, the identity block,
and anything you wrote are never overwritten, only numbers and machine-fetched
fields change. The file is written atomically (temp file then rename), and a
change summary is printed. Repos on GitHub that are not yet curated in the
manifest, and curated projects that no longer exist on GitHub, are reported
as warnings.

## Serving locally

From this directory:

```
python3 -m http.server 8123
```

Then open http://localhost:8123/ in a browser.

## Deploying

The site is served from the `main` branch of the `yugimob.github.io` repo, so a
deploy is a normal push:

```
git add README.md
git commit -m "docs(site): update site"
git push
```

GitHub Pages auto-builds from the main root after each push.

First-time setup, if the repo does not exist yet:

1. Create a public repository named `yugimob.github.io`.
2. Push this repository's `main` branch to it.
3. Enable Pages: Settings → Pages → Source → "Deploy from a branch", branch
   `main`, folder `/`.
