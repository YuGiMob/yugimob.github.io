import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, withRepoCopy as withRepo } from './helpers.mjs';

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

    assert.equal(data.benchmark.contenderCount, 2);
    assert.equal(data.benchmark.models, 1);
    assert.equal(data.benchmark.scenarios, 1);
    assert.equal(data.benchmark.totalRuns, 2);
    assert.equal(data.benchmarkHistory.length, 2);
    assert.deepEqual(data.benchmarkHistory.at(-1), { date: '2026-09-21', models: 1, scenarios: 1, runsPerContender: 1, overall: 100, safety: null, served: null });
    const highlighted = data.benchmark.contenders.find((entry) => entry.highlight);
    const rival = data.benchmark.contenders.find((entry) => !entry.highlight);
    assert.equal(highlighted.vsHighlight, null);
    assert.deepEqual(rival.vsHighlight, { b: 0, c: 0, bothPassed: 1, bothFailed: 0, p: 1, low: -79.3, high: 79.3, pAdjusted: 1 });

    const matrix = JSON.parse(readFileSync(join(repo, 'data', 'benchmark-matrix.json'), 'utf8'));
    assert.equal(matrix.generatedAt, data.benchmark.generatedAt);
    assert.deepEqual(matrix.contenders, data.benchmark.contenders.map((entry) => entry.id));
    assert.deepEqual(matrix.models, ['test-model']);
    assert.deepEqual(matrix.cells, [[[[0], 1], [[0], 1]]]);

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
    const matrixBefore = readFileSync(join(repo, 'data', 'benchmark-matrix.json'), 'utf8');

    const second = refresh(repo);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /No data changes/);
    assert.equal(readFileSync(join(repo, DATA_FILE), 'utf8'), dataBefore);
    assert.equal(readFileSync(join(repo, 'llms.txt'), 'utf8'), llmsBefore);
    assert.equal(readFileSync(join(repo, 'data', 'benchmark-matrix.json'), 'utf8'), matrixBefore);
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
      .replace('I\'m YuGiMob. I build extensions', 'Someone else writes here.');
    assert.notEqual(drifted, committed);
    writeFileSync(path, drifted);
    const second = refresh(repo);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /index\.html static blocks: rewritten/);
    assert.equal(readFileSync(path, 'utf8'), committed);
  });
});

test('a partial benchmark report keeps the existing block and still refreshes the rest', () => {
  withRepo((repo) => {
    const before = readData(repo);
    const result = refresh(repo, { YUGIMOB_LLM_REPORT: 'llm-report-partial.json' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /not a complete matrix/);

    const data = readData(repo);
    assert.deepEqual(data.benchmark, before.benchmark);
    assert.deepEqual(data.benchmarkHistory, before.benchmarkHistory);
    assert.equal(data.projects.find((project) => project.name === 'pi-hashline-edit-pro').stars, 101);
  });
});

test('a benchmark scenario with no focus in the sources keeps the existing block', () => {
  withRepo((repo) => {
    const before = readData(repo);
    const result = refresh(repo, { YUGIMOB_LLM_REPORT: 'llm-report-unknown-scenario.json' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /have no focus in the sources/);

    const data = readData(repo);
    assert.deepEqual(data.benchmark, before.benchmark);
    assert.deepEqual(data.benchmarkHistory, before.benchmarkHistory);
    assert.deepEqual(data.projects.find((project) => project.name === 'pi-hashline-edit-pro').stars, 101);
  });
});

test('a corrupt data file is left byte-identical and the refresh exits', () => {
  withRepo((repo) => {
    const path = join(repo, DATA_FILE);
    writeFileSync(path, '{ not json');
    const result = refresh(repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unusable/);
    assert.equal(readFileSync(path, 'utf8'), '{ not json');
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
    const data = JSON.parse(readFileSync(path, 'utf8'));
    data.identity.extra = 'nope';
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

    const result = refresh(repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /identity unexpected key extra/);
    assert.match(result.stderr, /failed validate-data/);
    assert.equal(readData(repo).identity.extra, 'nope');
    assert.deepEqual(readdirSync(join(repo, 'data')).filter((file) => file.endsWith('.tmp')), []);
  });
});

test('a dry run reports the candidate without writing any file', () => {
  withRepo((repo) => {
    const dataBefore = readFileSync(join(repo, DATA_FILE), 'utf8');
    const llmsBefore = readFileSync(join(repo, 'llms.txt'), 'utf8');
    const sitemapBefore = readFileSync(join(repo, 'sitemap.xml'), 'utf8');

    const result = refresh(repo, {}, ['--check']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dry run: the candidate passed validate-data/);
    assert.match(result.stdout, /dry run: the candidate was not written/);
    assert.match(result.stdout, /Dry run complete; no files were written/);

    assert.equal(readFileSync(join(repo, DATA_FILE), 'utf8'), dataBefore);
    assert.equal(readFileSync(join(repo, 'llms.txt'), 'utf8'), llmsBefore);
    assert.equal(readFileSync(join(repo, 'sitemap.xml'), 'utf8'), sitemapBefore);
  });
});

test('a dry run refuses a candidate the schema rejects and writes nothing', () => {
  withRepo((repo) => {
    const fixtures = join(repo, 'tests', 'fixtures', 'refresh');
    const repos = JSON.parse(readFileSync(join(fixtures, 'repos.json'), 'utf8'));
    repos[0].pushed_at = 'not a date';
    writeFileSync(join(fixtures, 'repos.json'), JSON.stringify(repos, null, 2));
    const dataBefore = readFileSync(join(repo, DATA_FILE), 'utf8');

    const result = refresh(repo, { YUGIMOB_FIXTURES: fixtures }, ['--check']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /failed validate-data/);
    assert.equal(readFileSync(join(repo, DATA_FILE), 'utf8'), dataBefore);
  });
});

test('a refresh without the GitHub API keeps activity, stats, and history but still updates npm', () => {
  withRepo((repo) => {
    const before = readData(repo);
    const result = refresh(repo, { YUGIMOB_NO_GITHUB: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /GitHub API error/);

    const data = readData(repo);
    assert.deepEqual(data.history, before.history);
    assert.deepEqual(data.activity, before.activity);
    assert.deepEqual(data.stats, before.stats);
    assert.equal(data.projects.find((project) => project.name === 'pi-hashline-edit-pro').npmWeeklyDownloads, 5123);
  });
});

test('a second refresh revalidates the GitHub API with the cached etags', () => {
  withRepo((repo) => {
    const first = refresh(repo);
    assert.equal(first.status, 0, first.stderr);
    assert.ok(existsSync(join(repo, '.cache', 'fetch-state.json')));

    const log = join(repo, 'fetch.log');
    const second = refresh(repo, { YUGIMOB_FETCH_LOG: log });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /No data changes/);

    const githubLines = readFileSync(log, 'utf8').trim().split('\n').filter((line) => line.includes('api.github.com'));
    assert.ok(githubLines.length > 0);
    for (const line of githubLines) {
      assert.match(line, /^304 conditional /, `unexpected GitHub request: ${line}`);
    }
  });
});

test('a stale cache entry is refetched and replaced', () => {
  withRepo((repo) => {
    const first = refresh(repo);
    assert.equal(first.status, 0, first.stderr);
    const cachePath = join(repo, '.cache', 'fetch-state.json');
    const state = JSON.parse(readFileSync(cachePath, 'utf8'));
    const url = Object.keys(state).find((entry) => entry.includes('/repos'));
    state[url].etag = '"stale"';
    writeFileSync(cachePath, JSON.stringify(state, null, 2));

    const log = join(repo, 'fetch.log');
    const second = refresh(repo, { YUGIMOB_FETCH_LOG: log });
    assert.equal(second.status, 0, second.stderr);
    const lines = readFileSync(log, 'utf8');
    assert.match(lines, new RegExp(`200 conditional ${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.notEqual(JSON.parse(readFileSync(cachePath, 'utf8'))[url].etag, '"stale"');
  });
});

test('a manifest with one npm package reads the single-package download response', () => {
  withRepo((repo) => {
    const path = join(repo, DATA_FILE);
    const data = JSON.parse(readFileSync(path, 'utf8'));
    for (const project of data.projects) {
      if (project.name !== 'pi-tor-proxy') project.npm = null;
    }
    data.projects.find((project) => project.name === 'pi-tor-proxy').npmWeeklyDownloads = 1;
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

    const result = refresh(repo);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /fetch failed/);
    assert.equal(readData(repo).projects.find((project) => project.name === 'pi-tor-proxy').npmWeeklyDownloads, 44);
  });
});

test('a failed npm batch query falls back to per-package requests', () => {
  withRepo((repo) => {
    const result = refresh(repo, { YUGIMOB_NPM_BULK_FAIL: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /falling back to per-package requests/);
    assert.equal(readData(repo).projects.find((project) => project.name === 'pi-hashline-edit-pro').npmWeeklyDownloads, 5123);
  });
});

test('the refresh sweeps its own stale temp files and leaves other scratch alone', () => {
  withRepo((repo) => {
    const old = new Date(Date.now() - 3600000);
    const scratch = join(repo, 'data', 'scratch.tmp');
    const pending = join(repo, 'data', 'site-data.json.999.tmp');
    const sitemapPending = join(repo, 'sitemap.xml.999.tmp');
    for (const file of [scratch, pending, sitemapPending]) {
      writeFileSync(file, 'x');
      utimesSync(file, old, old);
    }

    const result = refresh(repo);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(scratch));
    assert.ok(!existsSync(pending));
    assert.ok(!existsSync(sitemapPending));
  });
});
