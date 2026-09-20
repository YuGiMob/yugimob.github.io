import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { benchmarkSnapshot, buildActivity, buildDaily, buildHighlights, buildScenarioMatrix, scenarioCoverage, upsertHistory } from '../scripts/refresh-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function push(date, repo = 'tester/tool') {
  return { type: 'PushEvent', created_at: `${date}T10:00:00Z`, repo: { name: repo } };
}

function watch(repo = 'other/project') {
  return { type: 'WatchEvent', payload: { action: 'started' }, repo: { name: repo } };
}

function issue(action = 'closed', number = 7, repo = 'tester/tool') {
  return { type: 'IssuesEvent', payload: { action, issue: { number } }, repo: { name: repo } };
}

function release(tag = 'v1.2.0', repo = 'tester/tool') {
  return { type: 'ReleaseEvent', payload: { action: 'published', release: { tag_name: tag } }, repo: { name: repo } };
}

function merge(number = 12, repo = 'tester/tool') {
  return { type: 'PullRequestEvent', payload: { action: 'closed', pull_request: { number, merged: true } }, repo: { name: repo } };
}

test('buildDaily counts events and pushes per day in date order', () => {
  const daily = buildDaily([push('2026-09-10'), push('2026-09-09'), watch()]);
  assert.deepEqual(daily, [
    { date: '2026-09-09', events: 1, pushes: 1 },
    { date: '2026-09-10', events: 1, pushes: 1 },
  ]);
});

test('buildDaily fills the days between the first and last event with zeroes', () => {
  const daily = buildDaily([push('2026-09-11'), push('2026-09-13')]);
  assert.deepEqual(daily, [
    { date: '2026-09-11', events: 1, pushes: 1 },
    { date: '2026-09-12', events: 0, pushes: 0 },
    { date: '2026-09-13', events: 1, pushes: 1 },
  ]);
});

test('buildDaily caps the filled range at the newest days', () => {
  const daily = buildDaily([push('2026-08-01'), push('2026-08-10')], 3);
  assert.deepEqual(daily.map((entry) => entry.date), ['2026-08-08', '2026-08-09', '2026-08-10']);
  assert.equal(daily[0].pushes, 0);
});

test('buildDaily keeps only the most recent days', () => {
  const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
  const daily = buildDaily(days.map((date) => push(date)), 2);
  assert.deepEqual(daily.map((entry) => entry.date), ['2026-09-03', '2026-09-04']);
});

test('buildActivity abbreviates a same-month window', () => {
  const activity = buildActivity([push('2026-09-03'), push('2026-09-17')], '2026-09-18');
  assert.equal(activity.window, '2026-09-03..17');
  assert.equal(activity.pushes, 2);
});

test('buildActivity keeps a cross-month window explicit', () => {
  const activity = buildActivity([push('2026-08-31'), push('2026-09-02')], '2026-09-03');
  assert.equal(activity.window, '2026-08-31..2026-09-02');
});

test('buildActivity caps the window and the pushes together', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  const events = Array.from({ length: 200 }, (unused, index) => push(new Date(start + index * 86400000).toISOString().slice(0, 10)));
  const activity = buildActivity(events, '2026-08-01', 120);
  assert.equal(activity.daily.length, 120);
  assert.equal(activity.pushes, 120);
  assert.equal(activity.window, `${activity.daily[0].date}..${activity.daily[119].date}`);
});

test('buildActivity falls back to today with no events', () => {
  const activity = buildActivity([], '2026-09-18');
  assert.deepEqual(activity, { pushes: 0, highlights: [], window: '2026-09-18', daily: [] });
});

test('buildHighlights maps stars and issues and respects the limit', () => {
  const events = [watch(), issue('closed', 44), issue('opened', 45), watch('third/repo')];
  assert.deepEqual(buildHighlights(events, 3), [
    'starred other/project',
    'closed issue #44 on tester/tool',
    'opened issue #45 on tester/tool',
  ]);
  assert.deepEqual(buildHighlights(events, 2).length, 2);
});

test('buildHighlights reports releases and merged pull requests', () => {
  const events = [release('v4.3.5'), merge(56), release('v4.3.4')];
  assert.deepEqual(buildHighlights(events), [
    'published release v4.3.5 of tester/tool',
    'merged pull request #56 on tester/tool',
    'published release v4.3.4 of tester/tool',
  ]);
  assert.deepEqual(buildHighlights([{ type: 'PullRequestEvent', payload: { action: 'closed', pull_request: { number: 1, merged: false } }, repo: { name: 'tester/tool' } }]), []);
});

test('benchmarkSnapshot reads the highlighted contender on the report date', () => {
  const benchmark = {
    generatedAt: '2026-09-20T12:03:04.357Z',
    contenders: [
      { highlight: false, overall: 10 },
      { highlight: true, overall: 97.8, safety: 98.9, served: 92.1 },
    ],
  };
  assert.deepEqual(benchmarkSnapshot(benchmark), { date: '2026-09-20', overall: 97.8, safety: 98.9, served: 92.1 });
});

test('benchmarkSnapshot refuses a report without a highlighted contender or a date', () => {
  assert.equal(benchmarkSnapshot(null), null);
  assert.equal(benchmarkSnapshot({ generatedAt: '2026-09-20T12:03:04.357Z', contenders: [{ highlight: false }] }), null);
  assert.equal(benchmarkSnapshot({ generatedAt: 'not a date', contenders: [{ highlight: true, overall: 1 }] }), null);
});

test('upsertHistory replaces a same-date snapshot and sorts', () => {
  const history = [
    { date: '2026-09-01', totalStars: 1, totalDownloads: 10 },
    { date: '2026-09-02', totalStars: 2, totalDownloads: 20 },
  ];
  const next = upsertHistory(history, { date: '2026-09-02', totalStars: 5, totalDownloads: 50 });
  assert.deepEqual(next.map((entry) => entry.totalStars), [1, 5]);
  assert.equal(next[0].date, '2026-09-01');
  assert.equal(next[1].date, '2026-09-02');
});

test('upsertHistory appends a new date and caps the list', () => {
  const history = [
    { date: '2026-09-01', totalStars: 1, totalDownloads: 10 },
    { date: '2026-09-02', totalStars: 2, totalDownloads: 20 },
  ];
  const next = upsertHistory(history, { date: '2026-09-03', totalStars: 3, totalDownloads: 30 }, 2);
  assert.deepEqual(next.map((entry) => entry.date), ['2026-09-02', '2026-09-03']);
});

test('refresh-data.mjs imports every refresh-lib helper it calls', async () => {
  const source = readFileSync(join(ROOT, 'scripts', 'refresh-data.mjs'), 'utf8');
  const block = source.match(/import \{([^{}]*)\} from '\.\/refresh-lib\.mjs'/);
  assert.ok(block, 'refresh-data.mjs must import from refresh-lib.mjs');
  const imported = new Set(block[1].split(',').map((name) => name.trim()).filter(Boolean));
  const library = await import('../scripts/refresh-lib.mjs');
  assert.deepEqual([...imported].filter((name) => !(name in library)), []);
  const body = source.slice(block.index + block[0].length);
  const missing = Object.keys(library).filter((name) => !imported.has(name) && new RegExp(`\\b${name}\\b`).test(body));
  assert.deepEqual(missing, []);
});

test('scenarioCoverage accepts only a report whose scenarios all declare a focus', () => {
  const focusById = new Map([['single-line', 'core'], ['stale-line', 'staleness']]);
  assert.equal(scenarioCoverage({ runs: [{ scenarioId: 'single-line' }, { scenarioId: 'stale-line' }] }, focusById), true);
  assert.equal(scenarioCoverage({ runs: [{ scenarioId: 'ghost' }] }, focusById), false);
  assert.equal(scenarioCoverage({ runs: [{ scenarioId: 'single-line' }, {}] }, focusById), false);
  assert.equal(scenarioCoverage({}, focusById), true);
  assert.equal(scenarioCoverage({ runs: [{ scenarioId: 'single-line' }] }), false);
});

test('buildScenarioMatrix dedupes declared models and drops runs it cannot place', () => {
  const report = {
    generatedAt: '2026-09-20T00:00:00.000Z',
    models: [{ id: 'm1' }, { id: 'm1' }],
    runs: [
      { contenderId: 'a', scenarioId: 's1', modelId: 'm1', pass: true },
      { contenderId: 'a', scenarioId: 's1', pass: true },
      { contenderId: 'b', scenarioId: 's1', modelId: 'm2', pass: false },
    ],
  };
  const matrix = buildScenarioMatrix(report, new Map([['s1', 'core']]), ['a', 'b']);
  assert.deepEqual(matrix.models, ['m1', 'm2']);
  assert.deepEqual(matrix.cells, [[[[0], 1], [[], 1]]]);

  const unplaceable = buildScenarioMatrix(
    { models: [{ id: 'm1' }, { id: 'm2' }], runs: [{ contenderId: 'a', scenarioId: 's1', pass: true }] },
    new Map([['s1', 'core']]),
    ['a'],
  );
  assert.deepEqual(unplaceable.cells, [[[[], 0]]]);
});
