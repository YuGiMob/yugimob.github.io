#!/usr/bin/env node

import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import {
  BENCHMARK_HISTORY_LIMIT,
  BENCHMARK_REPORT_RAW,
  BENCHMARK_SCENARIO_RAW,
  benchmarkCoversFullMatrix,
  benchmarkSnapshot,
  buildActivity,
  buildScenarioMatrix,
  isTimestamp,
  parseScenarioFocus,
  retryDelayMs,
  sleep,
  scenarioMatrixMatchesBenchmark,
  summarizeBenchmark,
  upsertHistory,
} from './refresh-lib.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { writeAgentFiles } from './llms-lib.mjs';
import { updateHeroStatsFile } from './site-html-lib.mjs';
import { updateSitemapFile } from './sitemap-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = join(ROOT, 'data', 'site-data.json');
const TMP_FILE = `${DATA_FILE}.${process.pid}.tmp`;
const MATRIX_FILE = join(ROOT, 'data', 'benchmark-matrix.json');
const MATRIX_TMP_FILE = `${MATRIX_FILE}.${process.pid}.tmp`;
const SITEMAP_FILE = join(ROOT, 'sitemap.xml');
const INDEX_FILE = join(ROOT, 'index.html');
const VALIDATOR_FILE = join(ROOT, 'scripts', 'validate-data.mjs');

function safeUnlink(path) {
  try {
    unlinkSync(path);
  } catch {}
}

function assertCandidateValid(candidateFile, message, matrixCandidate = null) {
  try {
    const args = [VALIDATOR_FILE, candidateFile];
    if (matrixCandidate) args.push(join(ROOT, 'data', 'showcase.json'), matrixCandidate);
    execFileSync(process.execPath, args, { stdio: 'pipe' });
  } catch (validationError) {
    if (validationError.stderr) console.error(String(validationError.stderr).trim());
    throw new Error(message);
  }
}

function cleanupStaleTmpFiles() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [directory, prefix] of [[join(ROOT, 'data'), 'site-data.json.'], [ROOT, 'llms.txt.'], [ROOT, 'index.md.'], [ROOT, 'agent-readability.json.'], [join(ROOT, 'data'), 'benchmark-matrix.json.'], [ROOT, 'index.html.']]) {
    try {
      for (const entry of readdirSync(directory)) {
        if (!entry.startsWith(prefix) || !entry.endsWith('.tmp')) continue;
        const path = join(directory, entry);
        try {
          if (statSync(path).mtimeMs < cutoff) safeUnlink(path);
        } catch {}
      }
    } catch {}
  }
}

function updateSitemapLastmod(date) {
  const result = updateSitemapFile(SITEMAP_FILE, date);
  if (!result.ok) {
    if (result.reason === 'missing') console.warn('sitemap.xml is missing; skipped the lastmod update');
    else if (result.reason === 'no-loc') console.warn('sitemap.xml has no <loc> entry; skipped the lastmod update');
    else console.warn('sitemap.xml update failed:', result.reason);
    return;
  }
  if (result.changed) report('sitemap.lastmod', result.previous, date);
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
const PAGE_SIZE = 100;
const FETCH_TIMEOUT_MS = 15000;
const UNLISTED_REPOS = new Set(['pi-jina-webtools', 'pi-msg-queue', 'pi-tps-status', 'mypi']);
const DRY_RUN = process.argv.includes('--check');
let data = null;
let fileUnusable = false;
let matrixText = null;
let existingMatrixText = null;
let existingMatrix = null;
if (existsSync(MATRIX_FILE)) {
  try {
    existingMatrixText = readFileSync(MATRIX_FILE, 'utf8');
    existingMatrix = JSON.parse(existingMatrixText);
  } catch (err) {
    existingMatrixText = null;
    console.warn('Could not parse data/benchmark-matrix.json:', err.message);
  }
}
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

async function request(url, headers, warnPrefix, read) {
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
        await sleep(retryDelayMs(response.headers));
        continue;
      }
      if (attempt < 2 && response.status >= 500) {
        await sleep(300);
        continue;
      }
      console.warn(`${warnPrefix}: ${response.status}${response.status === 404 ? ' (not found)' : ''}`);
      return null;
    }
    try {
      return await read(response);
    } catch (err) {
      if (attempt < 2) {
        await sleep(300);
        continue;
      }
      console.warn(`${warnPrefix}: unreadable body`, err.message);
      return null;
    }
  }
  return null;
}

function getJson(url, headers, warnPrefix) {
  return request(url, headers, warnPrefix, (response) => response.json());
}

function getText(url, headers, warnPrefix) {
  return request(url, headers, warnPrefix, (response) => response.text());
}

async function fetchPages(baseUrl, maxPages, warnPrefix) {
  const items = [];
  let received = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const batch = await getJson(`${baseUrl}${separator}per_page=${PAGE_SIZE}&page=${page}`, GITHUB_HEADERS, `${warnPrefix} page ${page}`);
    if (!Array.isArray(batch)) {
      if (received) console.warn(`${warnPrefix}: page ${page} failed, using ${items.length} partial results`);
      break;
    }
    received = true;
    items.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    await sleep(50);
  }
  return received ? items : null;
}

const [user, reposRaw, events] = await Promise.all([
  getJson('https://api.github.com/users/YuGiMob', GITHUB_HEADERS, 'GitHub API error for /users/YuGiMob'),
  fetchPages('https://api.github.com/users/YuGiMob/repos', REPO_PAGES, 'GitHub API error for /repos'),
  fetchPages('https://api.github.com/users/YuGiMob/events/public', EVENT_PAGES, 'GitHub API error for /events/public'),
]);
const repos = Array.isArray(reposRaw) ? reposRaw : [];

if (Array.isArray(events) && events.length >= EVENT_PAGES * PAGE_SIZE) {
  console.warn(`GitHub events: reached the ${EVENT_PAGES * PAGE_SIZE}-event window; older activity is not included`);
}
if (Array.isArray(reposRaw) && reposRaw.length >= REPO_PAGES * PAGE_SIZE) {
  console.warn(`GitHub repos: reached the ${REPO_PAGES * PAGE_SIZE}-repo window; totals may be incomplete`);
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
const npmResults = await Promise.all(
  npmPackages.map((pkg) =>
    getJson(
      `https://api.npmjs.org/downloads/point/last-week/${pkg}`,
      { Accept: 'application/json' },
      `npm API error for ${pkg}`,
    ),
  ),
);
npmPackages.forEach((pkg, index) => {
  const json = npmResults[index];
  const project = projectByNpm.get(pkg);
  if (!project) return;
  if (!json || typeof json.downloads !== 'number') {
    summary.push(`projects.${project.name}.npmWeeklyDownloads: unchanged (fetch failed)`);
    return;
  }
  const prev = existingByName.get(project.name);
  report(`projects.${project.name}.npmWeeklyDownloads`, prev?.npmWeeklyDownloads, json.downloads);
  project.npmWeeklyDownloads = json.downloads;
});

const scenarioSources = await Promise.all(
  BENCHMARK_SCENARIO_RAW.map((url) => getText(url, { Accept: 'text/plain' }, `benchmark scenarios ${url}`)),
);
const focusById = new Map();
for (const source of scenarioSources) {
  if (typeof source !== 'string') continue;
  for (const [id, focus] of parseScenarioFocus(source)) focusById.set(id, focus);
}
const benchmarkReport = await getJson(BENCHMARK_REPORT_RAW, { Accept: 'application/json' }, 'benchmark report');
if (!benchmarkReport || focusById.size === 0) {
  console.warn('benchmark report or scenario sources unavailable; keeping the existing block');
} else if (!Array.isArray(benchmarkReport.runs)) {
  console.warn('benchmark report has no run list; keeping the existing block');
} else {
  const unknownScenarios = new Set(
    benchmarkReport.runs
      .map((run) => run.scenarioId)
      .filter((id) => id && !focusById.has(id)),
  );
  if (unknownScenarios.size > 0) {
    console.warn(`${unknownScenarios.size} benchmark scenario(s) have no focus in the sources: ${[...unknownScenarios].join(', ')}`);
  }
  const benchmark = summarizeBenchmark(benchmarkReport, focusById, (id) =>
    data.projects.some((project) => project.name === id),
  );
  if (benchmark.contenderCount === 0 || !benchmark.contenders.some((entry) => entry.highlight)) {
    console.warn('benchmark summary has no highlighted contender; keeping the existing block');
  } else if (!benchmarkCoversFullMatrix(benchmark)) {
    console.warn(`benchmark report is not a complete matrix (${benchmark.totalRuns} runs over ${benchmark.contenderCount} contenders); keeping the existing block`);
  } else if (!isTimestamp(benchmark.generatedAt)) {
    console.warn('benchmark report has no usable generatedAt; keeping the existing block');
  } else {
    const matrix = buildScenarioMatrix(benchmarkReport, focusById, benchmark.contenders.map((entry) => entry.id));
    if (!scenarioMatrixMatchesBenchmark(matrix, benchmark)) {
      console.warn('benchmark matrix does not match the benchmark summary; keeping the existing block');
    } else {
      const previous = existing.benchmark ?? {};
      report('benchmark.generatedAt', previous.generatedAt, benchmark.generatedAt);
      report('benchmark.models', previous.models, benchmark.models);
      report('benchmark.scenarios', previous.scenarios, benchmark.scenarios);
      report('benchmark.contenderCount', previous.contenderCount, benchmark.contenderCount);
      report('benchmark.totalRuns', previous.totalRuns, benchmark.totalRuns);
      reportCount('benchmark.contenders', previous.contenders, benchmark.contenders);
      report('benchmark.costUsd', previous.costUsd, benchmark.costUsd);
      data.benchmark = benchmark;
      const snapshot = benchmarkSnapshot(benchmark);
      if (snapshot) {
        data.benchmarkHistory = upsertHistory(Array.isArray(data.benchmarkHistory) ? data.benchmarkHistory : [], snapshot, BENCHMARK_HISTORY_LIMIT);
        reportCount('benchmarkHistory', existing.benchmarkHistory, data.benchmarkHistory);
      }
      reportCount('benchmark matrix scenarios', existingMatrix?.scenarios, matrix.scenarios);
      matrixText = `${JSON.stringify({ $schema: './benchmark-matrix.schema.json', ...matrix }, null, 2)}\n`;
    }
  }
}
if (Array.isArray(events)) {
  data.activity.fetchedAt = today;
  report('activity.fetchedAt', existing.activity.fetchedAt, data.activity.fetchedAt);
}
const reposFresh = Array.isArray(reposRaw);
if (reposFresh) {
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
const dataChanged = JSON.stringify(existing) !== JSON.stringify(data);
const matrixChanged = matrixText !== null && matrixText !== existingMatrixText;
if ((dataChanged || matrixChanged) && !DRY_RUN) {
  try {
    if (dataChanged) writeFileSync(TMP_FILE, `${JSON.stringify(data, null, 2)}\n`);
    if (matrixChanged) writeFileSync(MATRIX_TMP_FILE, matrixText);
    assertCandidateValid(dataChanged ? TMP_FILE : DATA_FILE, 'the refreshed data failed validate-data; the existing file was left untouched', matrixChanged ? MATRIX_TMP_FILE : null);
    if (dataChanged) renameSync(TMP_FILE, DATA_FILE);
    if (matrixChanged) renameSync(MATRIX_TMP_FILE, MATRIX_FILE);
  } catch (err) {
    safeUnlink(TMP_FILE);
    safeUnlink(MATRIX_TMP_FILE);
    throw err;
  }
  if (dataChanged && data.history.at(-1)?.date === today) updateSitemapLastmod(today);
  if (matrixChanged) summary.push('data/benchmark-matrix.json: rewritten');
}
if (DRY_RUN && (dataChanged || matrixChanged)) {
  const candidate = join(tmpdir(), `yugimob-site-data-${process.pid}.tmp`);
  const matrixCandidate = matrixChanged ? join(tmpdir(), `yugimob-benchmark-matrix-${process.pid}.tmp`) : null;
  try {
    writeFileSync(candidate, `${JSON.stringify(data, null, 2)}\n`);
    if (matrixCandidate) writeFileSync(matrixCandidate, matrixText);
    assertCandidateValid(candidate, 'the dry-run candidate failed validate-data; nothing was written', matrixCandidate);
    summary.push('dry run: the candidate passed validate-data');
  } finally {
    safeUnlink(candidate);
    if (matrixCandidate) safeUnlink(matrixCandidate);
  }
}
if (DRY_RUN) summary.push(dataChanged || matrixChanged ? 'dry run: the candidate was not written' : 'dry run: nothing to write');
else {
  const heroBlock = updateHeroStatsFile(INDEX_FILE, data);
  if (!heroBlock.ok) console.warn('index.html hero stats: skipped', heroBlock.reason);
  else if (heroBlock.changed) summary.push('index.html hero stats: rewritten');
  const agentFiles = writeAgentFiles(ROOT);
  const rewritten = Object.entries(agentFiles).filter(([, written]) => written).map(([file]) => file);
  if (rewritten.length > 0) summary.push(`${rewritten.join(', ')}: rewritten`);
}
console.log('Refresh complete. Changes:');
for (const line of summary) {
  console.log(`  ${line}`);
}
if (DRY_RUN) console.log('Dry run complete; no files were written');
else if (dataChanged) console.log(`Data written to ${DATA_FILE}`);
else if (matrixChanged) console.log(`Matrix written to ${MATRIX_FILE}`);
else console.log(`No data changes; ${DATA_FILE} left untouched`);
