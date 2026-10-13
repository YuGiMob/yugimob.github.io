import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, withRepoCopy } from './helpers.mjs';

const LOADER = join(ROOT, 'tests', 'fake-fetch.mjs');
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'refresh');
const DATA_FILE = join('data', 'site-data.json');

function refresh(repo, env = {}, args = []) {
  return spawnSync(process.execPath, ['--import', LOADER, join(repo, 'scripts', 'refresh-data.mjs'), ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, YUGIMOB_FIXTURES: FIXTURES, ...env },
  });
}

function readData(repo) {
  return JSON.parse(readFileSync(join(repo, DATA_FILE), 'utf8'));
}

function withRepo(run) {
  return withRepoCopy(run);
}

function staleTmpFiles(repo) {
  const old = join(repo, 'data', 'site-data.json.999999.tmp');
  const fresh = join(repo, 'data', 'site-data.json.111111.tmp');
  const other = join(repo, 'data', 'notes.tmp');
  writeFileSync(old, 'stale\n');
  writeFileSync(fresh, 'fresh\n');
  writeFileSync(other, 'unrelated\n');
  const past = new Date(Date.now() - 11 * 60 * 1000);
  utimesSync(old, past, past);
  return { old, fresh, other };
}

test('a fixture refresh writes every machine field and rebuilds the derived files', () => {
  withRepo((repo) => {
    const repos = JSON.parse(readFileSync(join(FIXTURES, 'repos.json'), 'utf8'));
    const result = refresh(repo);
    assert.equal(result.status, 0, result.stderr);

    const data = readData(repo);
    assert.equal(data.identity.links.github, 'https://github.com/YuGiMob');
    assert.equal(data.stats.totalStars, repos.reduce((sum, entry) => sum + entry.stargazers_count, 0));
    assert.equal(data.stats.forksReceived, repos.reduce((sum, entry) => sum + entry.forks_count, 0));
    assert.equal(data.stats.publicRepos, 12);
    assert.equal(data.stats.npmPackages, 5);
    assert.equal(data.projects.find((project) => project.name === 'pi-hashline-edit-pro').stars, 101);
    assert.equal(data.projects.find((project) => project.name === 'pi-hashline-edit-pro').npmWeeklyDownloads, 5123);
    assert.equal(data.activity.window, '2026-09-18..20');
    assert.equal(data.activity.pushes, 2);
    assert.deepEqual(data.activity.highlights, [
      'starred YuGiMob/pi-tor-proxy',
      'published release v4.3.6 of YuGiMob/pi-hashline-edit-pro',
      'closed issue #47 on YuGiMob/pi-hashline-edit-pro',
    ]);
    assert.equal('benchmark' in data, false);
    assert.equal('benchmarkHistory' in data, false);
    assert.equal('externalBenchmark' in data, false);
    assert.equal(data.history.at(-1).date, new Date().toISOString().slice(0, 10));
    assert.equal(data.history.at(-1).totalStars, data.stats.totalStars);
    assert.equal(data.history.at(-1).totalDownloads, 5123 + 44 + 190 + 130 + 910);

    assert.match(readFileSync(join(repo, 'llms.txt'), 'utf8'), /Stars 101/);
    const newest = data.history.at(-1).date;
    assert.match(readFileSync(join(repo, 'sitemap.xml'), 'utf8'), new RegExp(`<lastmod>${newest}</lastmod>`));

    const validated = spawnSync(process.execPath, [join(repo, 'scripts', 'validate-data.mjs')], { cwd: repo, encoding: 'utf8' });
    assert.equal(validated.status, 0, validated.stderr);
  });
});

test('a second fixture refresh writes nothing', () => {
  withRepo((repo) => {
    const first = refresh(repo);
    assert.equal(first.status, 0, first.stderr);
    const dataBefore = readFileSync(join(repo, DATA_FILE), 'utf8');
    const llmsBefore = readFileSync(join(repo, 'llms.txt'), 'utf8');

    const second = refresh(repo);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /No data changes/);
    assert.equal(readFileSync(join(repo, DATA_FILE), 'utf8'), dataBefore);
    assert.equal(readFileSync(join(repo, 'llms.txt'), 'utf8'), llmsBefore);
  });
});

test('a stale llms.txt is rebuilt even when the data is unchanged', () => {
  withRepo((repo) => {
    const first = refresh(repo);
    assert.equal(first.status, 0, first.stderr);
    writeFileSync(join(repo, 'llms.txt'), '# stale\n');
    const second = refresh(repo);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /llms\.txt: rewritten/);
    assert.match(readFileSync(join(repo, 'llms.txt'), 'utf8'), /^# YuGiMob/);
  });
});

test('a stale static block is rewritten even when the data is unchanged', () => {
  withRepo((repo) => {
    const first = refresh(repo);
    assert.equal(first.status, 0, first.stderr);
    const path = join(repo, 'index.html');
    const committed = readFileSync(path, 'utf8');
    const drifted = committed
      .replace(/(<dd class="stat-value" aria-hidden="true">)[^<]*<\/dd>/, (unused, open) => `${open}0</dd>`)
      .replace('I build extensions for pi', 'Someone else writes here.');
    assert.notEqual(drifted, committed);
    writeFileSync(path, drifted);
    const second = refresh(repo);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /index\.html static blocks: rewritten/);
    assert.equal(readFileSync(path, 'utf8'), committed);
  });
});

test('a corrupt data file is left byte-identical and the refresh exits', () => {
  withRepo((repo) => {
    const path = join(repo, DATA_FILE);
    const corrupt = '{ nope';
    writeFileSync(path, corrupt);
    const result = refresh(repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unusable/);
    assert.equal(readFileSync(path, 'utf8'), corrupt);
  });
});

test('a missing data file fails instead of writing a skeleton', () => {
  withRepo((repo) => {
    const path = join(repo, DATA_FILE);
    rmSync(path);
    const result = refresh(repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing/);
    assert.equal(existsSync(path), false);
  });
});

test('the pre-write validator refuses a candidate the schema rejects', () => {
  withRepo((repo) => {
    const path = join(repo, DATA_FILE);
    const data = readData(repo);
    data.projects[1].npm = data.projects[0].npm;
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
    const before = readFileSync(path, 'utf8');
    const result = refresh(repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /npm package duplicated/);
    assert.equal(readFileSync(path, 'utf8'), before);
  });
});

test('a dry run reports the candidate without writing any file', () => {
  withRepo((repo) => {
    const before = readFileSync(join(repo, DATA_FILE), 'utf8');
    const result = refresh(repo, {}, ['--check']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dry run/);
    assert.equal(readFileSync(join(repo, DATA_FILE), 'utf8'), before);
    assert.equal(readdirSync(join(repo, 'data')).some((entry) => entry.endsWith('.tmp')), false);
  });
});

test('a dry run refuses a candidate the schema rejects and writes nothing', () => {
  withRepo((repo) => {
    const path = join(repo, DATA_FILE);
    const data = readData(repo);
    data.projects[1].npm = data.projects[0].npm;
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
    const before = readFileSync(path, 'utf8');
    const result = refresh(repo, {}, ['--check']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /npm package duplicated/);
    assert.equal(readFileSync(path, 'utf8'), before);
  });
});

test('a refresh without the GitHub API keeps activity, stats, and history but still updates npm', () => {
  withRepo((repo) => {
    const first = refresh(repo);
    assert.equal(first.status, 0, first.stderr);
    const before = readData(repo);
    const result = refresh(repo, { YUGIMOB_NO_GITHUB: '1' });
    assert.equal(result.status, 0, result.stderr);
    const after = readData(repo);
    assert.equal(after.stats.totalStars, before.stats.totalStars);
    assert.equal(after.activity.pushes, before.activity.pushes);
    assert.equal(after.history.length, before.history.length);
  });
});

test('a second refresh revalidates the GitHub API with the cached etags', () => {
  withRepo((repo) => {
    const log = join(repo, 'fetch.log');
    rmSync(join(repo, '.cache'), { recursive: true, force: true });
    const first = refresh(repo, { YUGIMOB_FETCH_LOG: log });
    assert.equal(first.status, 0, first.stderr);
    const firstLog = readFileSync(log, 'utf8');
    assert.match(firstLog, /200 plain https:\/\/api\.github\.com\/users\/YuGiMob/);

    const second = refresh(repo, { YUGIMOB_FETCH_LOG: log });
    assert.equal(second.status, 0, second.stderr);
    const secondLog = readFileSync(log, 'utf8');
    assert.match(secondLog, /304 conditional https:\/\/api\.github\.com\/users\/YuGiMob/);
  });
});

test('a stale cache entry is refetched and replaced', () => {
  withRepo((repo) => {
    const log = join(repo, 'fetch.log');
    const first = refresh(repo, { YUGIMOB_FETCH_LOG: log });
    assert.equal(first.status, 0, first.stderr);
    const cachePath = join(repo, '.cache', 'fetch-state.json');
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
    const userUrl = 'https://api.github.com/users/YuGiMob';
    cache[userUrl].etag = '"stale"';
    writeFileSync(cachePath, `${JSON.stringify(cache)}\n`);

    const second = refresh(repo, { YUGIMOB_FETCH_LOG: log });
    assert.equal(second.status, 0, second.stderr);
    const secondLog = readFileSync(log, 'utf8');
    assert.match(secondLog, /200 conditional https:\/\/api\.github\.com\/users\/YuGiMob/);
    const updated = JSON.parse(readFileSync(cachePath, 'utf8'));
    assert.notEqual(updated[userUrl].etag, '"stale"');
  });
});

test('a manifest with one npm package reads the single-package download response', () => {
  withRepo((repo) => {
    const dataPath = join(repo, DATA_FILE);
    const data = readData(repo);
    data.projects = data.projects.filter((project) => project.name === 'pi-hashline-edit-pro');
    writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
    const showcasePath = join(repo, 'data', 'showcase.json');
    const showcase = JSON.parse(readFileSync(showcasePath, 'utf8'));
    showcase.problems = showcase.problems.filter((problem) => problem.name === 'pi-hashline-edit-pro');
    writeFileSync(showcasePath, `${JSON.stringify(showcase, null, 2)}\n`);

    const result = refresh(repo);
    assert.equal(result.status, 0, result.stderr);
    const after = readData(repo);
    assert.equal(after.projects.length, 1);
    assert.equal(after.projects[0].npmWeeklyDownloads, 5123);
  });
});

test('a failed npm batch query falls back to per-package requests', () => {
  withRepo((repo) => {
    const result = refresh(repo, { YUGIMOB_NPM_BULK_FAIL: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /falling back to per-package requests/);
    const data = readData(repo);
    assert.equal(data.projects.find((project) => project.name === 'pi-hashline-edit-pro').npmWeeklyDownloads, 5123);
  });
});

test('the refresh sweeps its own stale temp files and leaves other scratch alone', () => {
  withRepo((repo) => {
    const { old, fresh, other } = staleTmpFiles(repo);
    const result = refresh(repo);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(old), false);
    assert.equal(existsSync(fresh), true);
    assert.equal(existsSync(other), true);
  });
});

test('a secondary GitHub rate limit is retried after the retry-after delay', () => {
  withRepo((repo) => {
    const log = join(repo, 'fetch.log');
    const result = refresh(repo, { YUGIMOB_GITHUB_SECONDARY: '1', YUGIMOB_FETCH_LOG: log });
    assert.equal(result.status, 0, result.stderr);
    const entries = readFileSync(log, 'utf8');
    assert.match(entries, /403 plain https:\/\/api\.github\.com\//);
    assert.match(entries, /200 (conditional|plain) https:\/\/api\.github\.com\/users\/YuGiMob/);
    assert.equal(readData(repo).stats.publicRepos, 12);
  });
});

test('a refresh never rewrites the curated showcase file', () => {
  withRepo((repo) => {
    const before = readFileSync(join(repo, 'data', 'showcase.json'), 'utf8');
    const result = refresh(repo);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(repo, 'data', 'showcase.json'), 'utf8'), before);
  });
});

test('unlistedRepos silences the warning for a known uncurated repo', () => {
  withRepo((repo) => {
    const result = refresh(repo);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /repo not curated in data\/site-data\.json: pi-edit-benchmark/);
  });
});

test('a repo missing from unlistedRepos warns as uncurated', () => {
  withRepo((repo) => {
    const path = join(repo, DATA_FILE);
    const data = readData(repo);
    data.unlistedRepos = data.unlistedRepos.filter((name) => name !== 'pi-edit-benchmark');
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
    const result = refresh(repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /repo not curated in data\/site-data\.json: pi-edit-benchmark/);
  });
});

test('the refresh warns when the curated license disagrees with GitHub', () => {
  withRepo((repo) => {
    const path = join(repo, DATA_FILE);
    const data = readData(repo);
    data.projects.find((project) => project.name === 'pi-hashline-edit-pro').license = 'Apache-2.0';
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
    const result = refresh(repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /license mismatch for pi-hashline-edit-pro: curated Apache-2\.0, GitHub reports MIT/);
  });
});

test('an empty repos response warns and leaves the totals and history untouched', () => {
  withRepo((repo) => {
    const before = readData(repo);
    const result = refresh(repo, { YUGIMOB_EMPTY_REPOS: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /returned no repositories; totals were left untouched/);
    const after = readData(repo);
    assert.equal(after.stats.totalStars, before.stats.totalStars);
    assert.equal(after.stats.forksReceived, before.stats.forksReceived);
    assert.equal(after.history.length, before.history.length);
  });
});
