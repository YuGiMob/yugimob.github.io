#!/usr/bin/env node

import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
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
let data = null;
let fileUnusable = false;
const fileExists = existsSync(DATA_FILE);
if (fileExists) {
  try {
    data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    fileUnusable = true;
    console.warn('Could not parse existing data/site-data.json:', err.message);
  }
}
if (
  !data ||
  typeof data !== 'object' ||
  Array.isArray(data) ||
  !data.identity ||
  !data.identity.links ||
  typeof data.identity.links !== 'object' ||
  !Array.isArray(data.projects) ||
  !data.stats ||
  typeof data.stats !== 'object' ||
  !data.activity ||
  typeof data.activity !== 'object'
) {
  fileUnusable = fileUnusable || fileExists;
  data = {
    identity: { links: {} },
    about: { paragraphs: [] },
    projects: [],
    stats: {},
    activity: {},
    sections: {},
  };
}
if (fileUnusable) {
  console.warn('data/site-data.json is unusable; write skipped to preserve the existing file');
  process.exit(0);
}
const existing = JSON.parse(JSON.stringify(data));

const npmPackages = data.projects.filter((p) => p.npm).map((p) => p.npm);
const projectByNpm = new Map(data.projects.filter((p) => p.npm).map((p) => [p.npm, p]));
const show = (v) => (v === undefined ? '(none)' : JSON.stringify(v));
const summary = [];
const report = (path, oldVal, newVal) => {
  if (show(oldVal) === show(newVal)) {
    summary.push(`${path}: unchanged`);
  } else {
    summary.push(`${path}: ${show(oldVal)} -> ${show(newVal)}`);
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function retryDelayMs(response) {
  const v = response.headers.get('retry-after');
  if (!v) return 1000;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.min(n * 1000, 60000);
  const t = Date.parse(v);
  if (!Number.isNaN(t)) return Math.min(Math.max(0, t - Date.now()), 60000);
  return 1000;
}
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
      if (attempt < 2 && response.status === 429) {
        await sleep(retryDelayMs(response));
        continue;
      }
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
async function fetchStarredCount() {
  let page = 1;
  let total = 0;
  let retries429 = 0;
  while (true) {
    const url = `https://api.github.com/users/YuGiMob/starred?per_page=100&page=${page}`;
    let response;
    try {
      response = await fetch(url, { headers: GITHUB_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      console.warn('GitHub API error for /starred:', err.message);
      return null;
    }
    if (!response.ok) {
      if (response.status === 429 && retries429 < 3) {
        retries429 += 1;
        await sleep(retryDelayMs(response));
        continue;
      }
      if (response.status === 429) {
        console.warn('GitHub API error for /starred: 429 retries exhausted');
        return null;
      }
      console.warn('GitHub API error for /starred:', response.status);
      return null;
    }
    retries429 = 0;
    const arr = await response.json().catch(() => null);
    if (!Array.isArray(arr)) {
      console.warn('GitHub API error for /starred: non-array body');
      return null;
    }
    total += arr.length;
    const link = response.headers.get('link') || '';
    const hasNext = link.split(',').some((part) => part.split(';').some((segment) => segment.trim() === 'rel="next"'));
    if (arr.length < 100 || !hasNext) break;
    page += 1;
    await sleep(50);
  }
  return total;
}
const [user, reposRaw, events, starsGiven] = await Promise.all([
  getJson('https://api.github.com/users/YuGiMob', GITHUB_HEADERS, 'GitHub API error for /users/YuGiMob'),
  getJson('https://api.github.com/users/YuGiMob/repos?per_page=100', GITHUB_HEADERS, 'GitHub API error for /repos'),
  getJson('https://api.github.com/users/YuGiMob/events/public?per_page=100', GITHUB_HEADERS, 'GitHub API error for /events/public'),
  fetchStarredCount(),
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
if (user && user.login) {
  data.identity.links.github = `https://github.com/${user.login}`;
}
report('identity.links.github', existing.identity.links.github, data.identity.links.github);
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
if (typeof starsGiven === 'number') {
  data.stats.starsGiven = starsGiven;
  report('stats.starsGiven', existing.stats.starsGiven, starsGiven);
}

const repoByName = new Map(repos.map((r) => [r.name, r]));
const existingByName = new Map(existing.projects.map((p) => [p.name, p]));
for (const project of data.projects) {
  const repo = repoByName.get(project.name);
  if (!repo) continue;
  const prev = existingByName.get(project.name);
  const sync = (repoKey, projKey, pred) => {
    const val = repo[repoKey];
    if (!pred(val)) return;
    if (projKey === 'description' && project.description !== null && project.description !== undefined && project.description !== '') return;
    report(`projects.${project.name}.${projKey}`, prev?.[projKey], val);
    project[projKey] = val;
  };
  sync('stargazers_count', 'stars', (v) => typeof v === 'number');
  sync('forks_count', 'forks', (v) => typeof v === 'number');
  sync('language', 'language', (v) => Boolean(v));
  sync('pushed_at', 'pushedAt', (v) => typeof v === 'string');
  sync('description', 'description', (v) => Boolean(v));
}
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
let anyNpmSuccess = false;
for (const pkg of npmPackages) {
  const json = await getJson(
    `https://api.npmjs.org/downloads/point/last-week/${pkg}`,
    { Accept: 'application/json' },
    `npm API error for ${pkg}`,
  );
  const project = projectByNpm.get(pkg);
  if (project && json && typeof json.downloads === 'number') {
    anyNpmSuccess = true;
    const prev = existingByName.get(project.name);
    report(
      `projects.${project.name}.npmWeeklyDownloads`,
      prev?.npmWeeklyDownloads,
      json.downloads,
    );
    project.npmWeeklyDownloads = json.downloads;
  }
  await sleep(50);
}

if (
  user !== null ||
  Array.isArray(reposRaw) ||
  Array.isArray(events) ||
  anyNpmSuccess ||
  typeof starsGiven === 'number'
) {
  data.activity.fetchedAt = today;
  report('activity.fetchedAt', existing.activity.fetchedAt, data.activity.fetchedAt);
}
try {
  writeFileSync(TMP_FILE, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(TMP_FILE, DATA_FILE);
} catch (err) {
  try { if (existsSync(TMP_FILE)) unlinkSync(TMP_FILE); } catch {}
  throw err;
}
console.log('Refresh complete. Changes:');
for (const line of summary) {
  console.log(`  ${line}`);
}
console.log(`Data written to ${DATA_FILE}`);
