import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActivity, buildDaily, buildHighlights, upsertHistory } from '../scripts/refresh-lib.mjs';

function push(date, repo = 'tester/tool') {
  return { type: 'PushEvent', created_at: `${date}T10:00:00Z`, repo: { name: repo } };
}

function watch(repo = 'other/project') {
  return { type: 'WatchEvent', payload: { action: 'started' }, repo: { name: repo } };
}

function issue(action = 'closed', number = 7, repo = 'tester/tool') {
  return { type: 'IssuesEvent', payload: { action, issue: { number } }, repo: { name: repo } };
}

test('buildDaily counts events and pushes per day in date order', () => {
  const daily = buildDaily([push('2026-09-10'), push('2026-09-09'), watch()]);
  assert.deepEqual(daily, [
    { date: '2026-09-09', events: 1, pushes: 1 },
    { date: '2026-09-10', events: 1, pushes: 1 },
  ]);
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
