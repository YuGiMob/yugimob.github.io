#!/usr/bin/env node
// scripts/refresh-data.mjs — zero-dependency data refresh for the YuGiMob site.
//
// Fetches GitHub (user, repos, events) and npm weekly downloads, then MERGES
// the results into data/site-data.json, preserving all curated fields
// (descriptions, npm links, about paragraphs, identity displayName/classTitle/
// tagline, email, stats.starsGiven). Writes atomically and always exits 0 —
// any API failure degrades to a warning and reuses the existing data.
//
// Node >= 22, global fetch, no dependencies.

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = join(ROOT, 'data', 'site-data.json');
const TMP_FILE = `${DATA_FILE}.${process.pid}.tmp`;

const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'yugimob-refresh',
};

const ACCOUNT_CREATED_YEAR = 2022;
const MAX_HIGHLIGHTS = 5;
const FETCH_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Load the existing (curated) data file, if present.
// ---------------------------------------------------------------------------
let data = null;
if (existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.warn('Could not parse existing data/site-data.json:', err.message);
  }
}
if (!data || typeof data !== 'object' || Array.isArray(data)) {
  data = {
    identity: { links: {} },
    about: { paragraphs: [] },
    projects: [],
    stats: {},
    activity: {},
    sections: {},
  };
}

// Deep copy of the loaded state, used to diff before/after for the summary.
const existing = JSON.parse(JSON.stringify(data));

const npmPackages = data.projects.filter((p) => p.npm).map((p) => p.npm);
const show = (v) => (v === undefined ? '(none)' : JSON.stringify(v));
const summary = [];
const report = (path, oldVal, newVal) => {
  if (show(oldVal) === show(newVal)) {
    summary.push(`${path}: unchanged`);
  } else {
    summary.push(`${path}: ${show(oldVal)} -> ${show(newVal)}`);
  }
};

// ---------------------------------------------------------------------------
// Fetch helper: never throws, warns and returns null on any failure.
// Retries once on transient network errors / 5xx; 404s and 4xx fail fast.
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, headers, warnPrefix) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response;
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      if (attempt < 2) {
        await sleep(300);
        continue;
      }
      console.warn(`${warnPrefix}:`, err.message);
      return null;
    }
    if (!response.ok) {
      if (attempt < 2 && response.status >= 500) {
        await sleep(300);
        continue;
      }
      console.warn(`${warnPrefix}:`, response.status);
      return null;
    }
    try {
      return await response.json();
    } catch (err) {
      if (attempt < 2) {
        await sleep(300);
        continue;
      }
      console.warn(`${warnPrefix}: non-JSON body`, err.message);
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. GitHub API: user, repos, events. Each failure is isolated.
// ---------------------------------------------------------------------------
const [user, reposRaw, events] = await Promise.all([
  getJson('https://api.github.com/users/YuGiMob', GITHUB_HEADERS, 'GitHub API error for /users/YuGiMob'),
  getJson('https://api.github.com/users/YuGiMob/repos?per_page=100', GITHUB_HEADERS, 'GitHub API error for /repos'),
  getJson('https://api.github.com/users/YuGiMob/events/public?per_page=100', GITHUB_HEADERS, 'GitHub API error for /events/public'),
]);
const repos = Array.isArray(reposRaw) ? reposRaw : [];

if (Array.isArray(reposRaw)) {
  const repoNames = new Set(repos.map((r) => r.name));
  for (const repo of repos) {
    if (repo.name.endsWith('.github.io')) continue;
    if (!data.projects.some((p) => p.name === repo.name)) {
      console.warn(`repo not curated in data/site-data.json: ${repo.name}`);
    }
  }
  for (const project of data.projects) {
    if (!repoNames.has(project.name)) {
      console.warn(`project in data/site-data.json not found on GitHub: ${project.name}`);
    }
  }
}

// identity.links.github — refreshed from the user API login.
if (user && user.login) {
  data.identity.links.github = `https://github.com/${user.login}`;
}
report('identity.links.github', existing.identity.links.github, data.identity.links.github);

// stats — recomputed from the APIs, except starsGiven which the GitHub user
// API does not expose (preserved as curated; no invented source).
if (repos.length > 0) {
  const totalStars = repos.reduce((s, r) => s + (r.stargazers_count ?? 0), 0);
  const forksReceived = repos.reduce((s, r) => s + (r.forks_count ?? 0), 0);
  data.stats.totalStars = totalStars;
  data.stats.forksReceived = forksReceived;
  report('stats.totalStars', existing.stats.totalStars, totalStars);
  report('stats.forksReceived', existing.stats.forksReceived, forksReceived);
}
if (user) {
  data.stats.publicRepos = typeof user.public_repos === 'number' ? user.public_repos : repos.length;
  report('stats.publicRepos', existing.stats.publicRepos, data.stats.publicRepos);
}
data.stats.npmPackages = npmPackages.length;
report('stats.npmPackages', existing.stats.npmPackages, data.stats.npmPackages);
data.stats.accountYears = new Date().getFullYear() - ACCOUNT_CREATED_YEAR;
report('stats.accountYears', existing.stats.accountYears, data.stats.accountYears);

// per-project stars/forks/language refreshed from the repos API; description
// only filled when the curated value is empty/missing (curated prose wins).
const repoByName = new Map(repos.map((r) => [r.name, r]));
for (const project of data.projects) {
  const repo = repoByName.get(project.name);
  if (!repo) continue;
  const prev = existing.projects.find((p) => p.name === project.name);
  if (typeof repo.stargazers_count === 'number') {
    report(`projects.${project.name}.stars`, prev?.stars, repo.stargazers_count);
    project.stars = repo.stargazers_count;
  }
  if (typeof repo.forks_count === 'number') {
    report(`projects.${project.name}.forks`, prev?.forks, repo.forks_count);
    project.forks = repo.forks_count;
  }
  if (repo.language) {
    report(`projects.${project.name}.language`, prev?.language, repo.language);
    project.language = repo.language;
  }
  if (repo.description && (project.description === null || project.description === undefined || project.description === '')) {
    report(`projects.${project.name}.description`, prev?.description, repo.description);
    project.description = repo.description;
  }
}

// activity — pushes (PushEvent count), highlights from events, window, fetchedAt.
const today = new Date().toISOString().slice(0, 10);
if (Array.isArray(events)) {
  const pushes = events.filter((e) => e.type === 'PushEvent').length;
  data.activity.pushes = pushes;
  report('activity.pushes', existing.activity.pushes, pushes);

  const highlights = [];
  for (const e of events) {
    if (highlights.length >= MAX_HIGHLIGHTS) break;
    const repoName = e.repo && e.repo.name ? e.repo.name : null;
    if (e.type === 'WatchEvent' && e.payload && e.payload.action === 'started' && repoName) {
      highlights.push(`starred ${repoName}`);
    } else if (e.type === 'IssuesEvent' && e.payload && e.payload.action && e.payload.issue && repoName) {
      highlights.push(`${e.payload.action} issue #${e.payload.issue.number} on ${repoName}`);
    }
  }
  data.activity.highlights = highlights;
  report('activity.highlights', existing.activity.highlights, highlights);

  const dates = events
    .map((e) => (e.created_at ? String(e.created_at).slice(0, 10) : null))
    .filter(Boolean)
    .sort();
  if (dates.length > 0) {
    const min = dates[0];
    const max = dates[dates.length - 1];
    data.activity.window =
      min.slice(0, 7) === max.slice(0, 7) ? `${min}..${max.slice(8)}` : `${min}..${max}`;
  } else {
    data.activity.window = today;
  }
  report('activity.window', existing.activity.window, data.activity.window);
}

// ---------------------------------------------------------------------------
// 2. npm weekly downloads for the published pi packages (skip on failure).
//    Fetched sequentially with a small pause to avoid connection flakiness.
// ---------------------------------------------------------------------------
const npmResults = [];
for (const pkg of npmPackages) {
  const json = await getJson(
    `https://api.npmjs.org/downloads/point/last-week/${pkg}`,
    { Accept: 'application/json' },
    `npm API error for ${pkg}`,
  );
  npmResults.push({ pkg, json });
  await sleep(50);
}
for (const { pkg, json } of npmResults) {
  const project = data.projects.find((p) => p.npm === pkg);
  if (!project || !json || typeof json.downloads !== 'number') continue;
  const prev = existing.projects.find((p) => p.name === project.name);
  report(
    `projects.${project.name}.npmWeeklyDownloads`,
    prev?.npmWeeklyDownloads,
    json.downloads,
  );
  project.npmWeeklyDownloads = json.downloads;
}

if (
  user !== null ||
  Array.isArray(reposRaw) ||
  Array.isArray(events) ||
  npmResults.some(({ json }) => json && typeof json.downloads === 'number')
) {
  data.activity.fetchedAt = today;
  report('activity.fetchedAt', existing.activity.fetchedAt, data.activity.fetchedAt);
}

// ---------------------------------------------------------------------------
// 4. Atomic write: tmp file + rename.
// ---------------------------------------------------------------------------
writeFileSync(TMP_FILE, `${JSON.stringify(data, null, 2)}\n`);
renameSync(TMP_FILE, DATA_FILE);

// ---------------------------------------------------------------------------
// 5. Change summary.
// ---------------------------------------------------------------------------
console.log('Refresh complete. Changes:');
for (const line of summary) {
  console.log(`  ${line}`);
}
console.log(`Data written to ${DATA_FILE}`);
