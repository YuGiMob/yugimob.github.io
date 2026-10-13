import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildActivity, buildDaily, buildHighlights, historyAgeDays, isTimestamp, npmPointUrl, retryDelayMs, sleep, upsertHistory, windowRange } from '../scripts/refresh-lib.mjs';

const ROOT = new URL('..', import.meta.url);
const SCRIPT = new URL('scripts/refresh-data.mjs', ROOT);

function push(date, repo = 'tester/tool') {
  return { type: 'PushEvent', created_at: `${date}T09:00:00Z`, repo: { name: repo }, payload: { size: 1 } };
}

function watch(repo = 'other/project') {
  return { type: 'WatchEvent', created_at: '2026-09-20T09:00:00Z', repo: { name: repo }, payload: { action: 'started' } };
}

function issue(action = 'closed', number = 7, repo = 'tester/tool') {
  return { type: 'IssuesEvent', created_at: '2026-09-20T09:00:00Z', repo: { name: repo }, payload: { action, issue: { number } } };
}

function release(tag = 'v1.2.0', repo = 'tester/tool') {
  return { type: 'ReleaseEvent', created_at: '2026-09-20T09:00:00Z', repo: { name: repo }, payload: { action: 'published', release: { tag_name: tag } } };
}

function merge(number = 12, repo = 'tester/tool') {
  return { type: 'PullRequestEvent', created_at: '2026-09-20T09:00:00Z', repo: { name: repo }, payload: { pull_request: { number, merged: true } } };
}

test('buildDaily counts events and pushes per day in date order', () => {
  const daily = buildDaily([push('2026-09-18'), push('2026-09-18'), push('2026-09-19'), watch()]);
  assert.deepEqual(daily, [
    { date: '2026-09-18', events: 2, pushes: 2 },
    { date: '2026-09-19', events: 1, pushes: 1 },
    { date: '2026-09-20', events: 1, pushes: 0 },
  ]);
});

test('buildDaily fills the days between the first and last event with zeroes', () => {
  const daily = buildDaily([push('2026-09-17'), push('2026-09-20')]);
  assert.deepEqual(daily.map((entry) => entry.date), ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']);
  assert.deepEqual(daily.slice(1, 3).map((entry) => entry.pushes), [0, 0]);
});

test('buildDaily caps the filled range at the newest days', () => {
  const daily = buildDaily([push('2026-01-01'), push('2026-09-20')], 3);
  assert.deepEqual(daily.map((entry) => entry.date), ['2026-09-18', '2026-09-19', '2026-09-20']);
});

test('buildDaily survives an empty event list', () => {
  assert.deepEqual(buildDaily([]), []);
});

test('buildActivity abbreviates a same-month window', () => {
  const activity = buildActivity([push('2026-09-18'), push('2026-09-20')], '2026-09-21');
  assert.equal(activity.window, '2026-09-18..20');
  assert.equal(activity.pushes, 2);
});

test('buildActivity keeps a cross-month window explicit', () => {
  const activity = buildActivity([push('2026-08-30'), push('2026-09-02')], '2026-09-03');
  assert.equal(activity.window, '2026-08-30..2026-09-02');
});

test('buildActivity falls back to today with no events', () => {
  const activity = buildActivity([], '2026-09-21');
  assert.equal(activity.window, '2026-09-21');
  assert.equal(activity.pushes, 0);
});

test('buildHighlights maps stars and issues and respects the limit', () => {
  const highlights = buildHighlights([watch('a/b'), issue('closed', 7), watch('c/d')], 2);
  assert.deepEqual(highlights, ['starred a/b', 'closed issue #7 on tester/tool']);
});

test('buildHighlights reports releases and merged pull requests', () => {
  assert.deepEqual(buildHighlights([release('v2.0.0'), merge(12)]), [
    'published release v2.0.0 of tester/tool',
    'merged pull request #12 on tester/tool',
  ]);
});

test('upsertHistory replaces a same-date snapshot and sorts', () => {
  const history = [
    { date: '2026-09-18', totalStars: 1, totalDownloads: 1 },
    { date: '2026-09-20', totalStars: 2, totalDownloads: 2 },
  ];
  const next = upsertHistory(history, { date: '2026-09-19', totalStars: 3, totalDownloads: 3 });
  assert.deepEqual(next.map((entry) => entry.date), ['2026-09-18', '2026-09-19', '2026-09-20']);
  const replaced = upsertHistory(next, { date: '2026-09-19', totalStars: 9, totalDownloads: 9 });
  assert.equal(replaced.length, 3);
  assert.equal(replaced[1].totalStars, 9);
});

test('upsertHistory caps the list', () => {
  const history = [1, 2, 3, 4].map((day) => ({ date: `2026-09-0${day}`, totalStars: day, totalDownloads: day }));
  const next = upsertHistory(history, { date: '2026-09-05', totalStars: 5, totalDownloads: 5 }, 3);
  assert.deepEqual(next.map((entry) => entry.date), ['2026-09-03', '2026-09-04', '2026-09-05']);
});

test('historyAgeDays measures the newest snapshot in whole days', () => {
  const now = Date.parse('2026-09-21T12:00:00Z');
  assert.equal(historyAgeDays([{ date: '2026-09-19' }], now), 2);
});

test('historyAgeDays refuses a missing or unparsable history', () => {
  assert.equal(historyAgeDays([]), null);
  assert.equal(historyAgeDays([{ date: 'nope' }]), null);
});

test('npmPointUrl batches plain packages and refuses scoped ones', () => {
  assert.equal(npmPointUrl(['a', 'b']), 'https://api.npmjs.org/downloads/point/last-week/a,b');
  assert.equal(npmPointUrl(['@scope/a']), null);
  assert.equal(npmPointUrl([]), null);
});

test('retryDelayMs reads Retry-After as seconds, then as a date, and caps the wait', () => {
  const headers = (value) => ({ get: () => value });
  assert.equal(retryDelayMs(headers('5')), 5000);
  assert.equal(retryDelayMs(headers('120')), 60000);
  const dated = retryDelayMs(headers(new Date(Date.now() + 4000).toUTCString()));
  assert.ok(dated > 2000 && dated <= 4000);
  assert.equal(retryDelayMs(headers('nonsense')), 1000);
  assert.equal(retryDelayMs({}), 1000);
});

test('isTimestamp accepts an ISO timestamp and rejects anything else', () => {
  assert.equal(isTimestamp('2026-09-21T09:00:00.000Z'), true);
  assert.equal(isTimestamp('nope'), false);
  assert.equal(isTimestamp(42), false);
});

test('sleep resolves after the requested delay', async () => {
  const start = Date.now();
  await sleep(15);
  assert.ok(Date.now() - start >= 10);
});

test('refresh-data.mjs imports every refresh-lib helper it calls', () => {
  const source = readFileSync(SCRIPT, 'utf8');
  const block = source.match(/import \{([^}]*)\} from '\.\/refresh-lib\.mjs'/);
  assert.ok(block, 'refresh-data.mjs does not import refresh-lib.mjs');
  const imported = [...block[1].matchAll(/(\w+),/g)].map((match) => match[1]);
  const lib = readFileSync(new URL('scripts/refresh-lib.mjs', ROOT), 'utf8');
  for (const name of imported) {
    assert.match(lib, new RegExp(`export (function|const) ${name}\\b`), `${name} is not exported by refresh-lib.mjs`);
  }
  assert.ok(imported.length >= 5);
});

test('buildDaily bounds the filled range before applying the cap', () => {
  const daily = buildDaily([push('1970-01-01'), push('2026-09-20')], 3);
  assert.deepEqual(daily.map((entry) => entry.date), ['2026-09-18', '2026-09-19', '2026-09-20']);
});

test('windowRange abbreviates a same-month span and refuses a partial one', () => {
  assert.equal(windowRange('2026-09-09', '2026-09-10'), '2026-09-09..10');
  assert.equal(windowRange('2026-08-30', '2026-09-02'), '2026-08-30..2026-09-02');
  assert.equal(windowRange('2026-09-09', undefined), null);
});
