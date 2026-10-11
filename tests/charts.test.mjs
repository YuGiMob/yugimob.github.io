import test from 'node:test';
import assert from 'node:assert/strict';
import { historyPanel, historyTableRows, sparklinePoints } from '../assets/js/charts.js';
import { findAll, withDom } from './dom.mjs';

const HISTORY = [
  { date: '2026-09-17', totalStars: 94, totalDownloads: 5296 },
  { date: '2026-09-24', totalStars: 101, totalDownloads: 4962 },
  { date: '2026-10-01', totalStars: 111, totalDownloads: 5495 },
];

const classes = (node, name) => findAll(node, (entry) => entry.classList?.contains(name) === true);

test('sparklinePoints spans the full width and inverts the y axis', () => {
  const points = sparklinePoints([0, 10], 120, 28);
  assert.equal(points, '0.0 26.0 120.0 2.0');
});

test('sparklinePoints flattens a constant series', () => {
  assert.equal(sparklinePoints([5, 5, 5], 120, 28), '0.0 26.0 60.0 26.0 120.0 26.0');
});

test('historyTableRows drops unusable snapshots and sorts by date', () => {
  const rows = historyTableRows([
    { date: '2026-09-24', totalStars: 101, totalDownloads: 4962 },
    { date: '2026-09-20', totalStars: 1 },
    { date: '2026-09-17', totalStars: 94, totalDownloads: 5296 },
    { date: '2026-09-17', totalStars: 94 },
  ]);
  assert.deepEqual(rows.map((row) => row.date), ['2026-09-17', '2026-09-24']);
  assert.deepEqual(rows[0], { date: '2026-09-17', stars: '94', downloads: '5,296' });
});

test('historyPanel renders sparklines and a table and refuses unusable snapshots', () => {
  withDom(() => {
    const panel = historyPanel(HISTORY);
    assert.ok(panel);
    assert.equal(classes(panel, 'growth-row').length, 2);
    assert.equal(classes(panel, 'growth-spark').length, 2);
    const table = findAll(panel, (entry) => entry.tagName === 'TABLE')[0];
    assert.ok(table);
    assert.equal(findAll(table, (entry) => entry.tagName === 'TR').length, 4);
    assert.equal(historyPanel([]), null);
    assert.equal(historyPanel([{ date: 'nope' }]), null);
  });
});

test('historyPanel describes a single snapshot without a delta', () => {
  withDom(() => {
    const panel = historyPanel([{ date: '2026-09-17', totalStars: 94, totalDownloads: 5296 }]);
    assert.match(findAll(panel, (entry) => entry.classList?.contains('chart-note'))[0].textContent, /1 snapshot since 2026-09-17/);
  });
});

test('historyPanel marks a falling series down and a rising series up', () => {
  withDom(() => {
    const rising = historyPanel(HISTORY);
    assert.equal(classes(rising, 'is-up').length, 2);
    const fallingHistory = [
      { date: '2026-09-17', totalStars: 111, totalDownloads: 5495 },
      { date: '2026-09-24', totalStars: 101, totalDownloads: 4962 },
      { date: '2026-10-01', totalStars: 94, totalDownloads: 5296 },
    ];
    const falling = historyPanel(fallingHistory);
    assert.equal(classes(falling, 'is-down').length, 2);
  });
});
