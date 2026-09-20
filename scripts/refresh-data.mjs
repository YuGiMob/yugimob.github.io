#!/usr/bin/env node

import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { buildActivity, upsertHistory } from './refresh-lib.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = join(ROOT, 'data', 'site-data.json');
const TMP_FILE = `${DATA_FILE}.${process.pid}.tmp`;

function safeUnlink(path) {
  try {
    unlinkSync(path);
  } catch {}
}

function cleanupStaleTmpFiles() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  try {
    for (const entry of readdirSync(join(ROOT, 'data'))) {
      if (!entry.startsWith('site-data.json.') || !entry.endsWith('.tmp')) continue;
      const path = join(ROOT, 'data', entry);
      try {
        if (statSync(path).mtimeMs < cutoff) safeUnlink(path);
      } catch {}
    }
  } catch {}
}

cleanupStaleTmpFiles();
const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'yugimob-refresh',
  'X-GitHub-Api-Version': '2022-11-28',
};
if (process.env.GITHUB_TOKEN) GITHUB_HEADERS.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const EVENT_PAGES = 3;
const REPO_PAGES = 5;
const STARRED_PAGES = 50;
const PAGE_SIZE = 100;
const FETCH_TIMEOUT_MS = 15000;
const UNLISTED_REPOS = new Set(['pi-jina-webtools', 'pi-msg-queue', 'pi-tps-status', 'mypi']);
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
    projects: [],
    stats: {},
    activity: {},
    sections: {},
  };
}
if (fileUnusable) {
  console.error('data/site-data.json is unusable; writing nothing to preserve the existing file');
  process.exit(1);
}

if (!fileExists) {
  console.error('data/site-data.json is missing; create it with the curated identity and projects first');
  process.exit(1);
}

if (!Array.isArray(data.history)) data.history = [];
if (!Array.isArray(data.activity.daily)) data.activity.daily = [];

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
const reportCount = (path, oldArray, newArray) => {
  const before = Array.isArray(oldArray) ? oldArray.length : 0;
  const after = Array.isArray(newArray) ? newArray.length : 0;
  summary.push(before === after ? `${path}: ${after} entries (unchanged)` : `${path}: ${before} -> ${after} entries`);
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
async function fetchPages(baseUrl, maxPages, warnPrefix) {
  const items = [];
  let received = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const batch = await getJson(`${baseUrl}${separator}per_page=100&page=${page}`, GITHUB_HEADERS, `${warnPrefix} page ${page}`);
    if (!Array.isArray(batch)) {
      if (received) console.warn(`${warnPrefix}: page ${page} failed, using ${items.length} partial results`);
      break;
    }
    received = true;
    items.push(...batch);
    if (batch.length < 100) break;
    await sleep(50);
  }
  return received ? items : null;
}

async function fetchStarredCount() {
  const items = await fetchPages('https://api.github.com/users/YuGiMob/starred', STARRED_PAGES, 'GitHub API error for /starred');
  return Array.isArray(items) ? items.length : null;
}
const [user, reposRaw, events, starsGiven] = await Promise.all([
  getJson('https://api.github.com/users/YuGiMob', GITHUB_HEADERS, 'GitHub API error for /users/YuGiMob'),
  fetchPages('https://api.github.com/users/YuGiMob/repos', REPO_PAGES, 'GitHub API error for /repos'),
  fetchPages('https://api.github.com/users/YuGiMob/events/public', EVENT_PAGES, 'GitHub API error for /events/public'),
  fetchStarredCount(),
]);
const repos = Array.isArray(reposRaw) ? reposRaw : [];

if (Array.isArray(events) && events.length >= EVENT_PAGES * PAGE_SIZE) {
  console.warn(`GitHub events: reached the ${EVENT_PAGES * PAGE_SIZE}-event window; older activity is not included`);
}
if (Array.isArray(reposRaw) && reposRaw.length >= REPO_PAGES * PAGE_SIZE) {
  console.warn(`GitHub repos: reached the ${REPO_PAGES * PAGE_SIZE}-repo window; totals may be incomplete`);
}
if (typeof starsGiven === 'number' && starsGiven >= STARRED_PAGES * PAGE_SIZE) {
  console.warn(`GitHub stars given: reached the ${STARRED_PAGES * PAGE_SIZE}-star window; the count may be incomplete`);
}

if (Array.isArray(reposRaw)) {
  const repoNames = new Set(repos.map((r) => r.name));
  for (const repo of repos) {
    if (repo.name.endsWith('.github.io')) continue;
    if (repo.fork) continue;
    if (!UNLISTED_REPOS.has(repo.name) && !data.projects.some((p) => p.name === repo.name)) {
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
  const activity = buildActivity(events, today);
  data.activity.pushes = activity.pushes;
  report('activity.pushes', existing.activity.pushes, activity.pushes);
  data.activity.highlights = activity.highlights;
  report('activity.highlights', existing.activity.highlights, activity.highlights);
  data.activity.window = activity.window;
  report('activity.window', existing.activity.window, activity.window);
  if (activity.daily.length > 0) data.activity.daily = activity.daily;
  reportCount('activity.daily', existing.activity.daily, data.activity.daily);
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

if (Array.isArray(events)) {
  data.activity.fetchedAt = today;
  report('activity.fetchedAt', existing.activity.fetchedAt, data.activity.fetchedAt);
}
if (
  user !== null ||
  Array.isArray(reposRaw) ||
  Array.isArray(events) ||
  anyNpmSuccess ||
  typeof starsGiven === 'number'
) {
  const totalDownloads = data.projects.reduce(
    (sum, project) => sum + (Number.isFinite(project.npmWeeklyDownloads) ? project.npmWeeklyDownloads : 0),
    0,
  );
  const snapshot = {
    date: today,
    totalStars: Number.isFinite(data.stats.totalStars) ? data.stats.totalStars : 0,
    totalDownloads,
  };
  data.history = upsertHistory(data.history, snapshot);
  reportCount('history', existing.history, data.history);
}
try {
  writeFileSync(TMP_FILE, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(TMP_FILE, DATA_FILE);
} catch (err) {
  safeUnlink(TMP_FILE);
  throw err;
}
console.log('Refresh complete. Changes:');
for (const line of summary) {
  console.log(`  ${line}`);
}
console.log(`Data written to ${DATA_FILE}`);
