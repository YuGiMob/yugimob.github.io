import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkTableRows, historyTableRows, sortedContenders, sparklinePoints } from '../assets/js/charts.js';

test('sortedContenders orders by overall then safety and keeps the input intact', () => {
  const contenders = [
    { label: 'b', overall: 70, safety: 90 },
    { label: 'a', overall: 90, safety: 50 },
    { label: 'c', overall: 70, safety: 95 },
  ];
  assert.deepEqual(sortedContenders(contenders).map((entry) => entry.label), ['a', 'c', 'b']);
  assert.deepEqual(contenders.map((entry) => entry.label), ['b', 'a', 'c']);
});

test('sparklinePoints spans the full width and inverts the y axis', () => {
  assert.equal(sparklinePoints([0, 10]), '0.0 26.0 120.0 2.0');
});

test('sparklinePoints flattens a constant series', () => {
  assert.equal(sparklinePoints([7, 7, 7]), '0.0 26.0 60.0 26.0 120.0 26.0');
  assert.equal(sparklinePoints([7]), '0.0 26.0 120.0 26.0');
});

test('sortedContenders treats a missing safety score as zero', () => {
  const contenders = [
    { label: 'unknown', overall: 90, safety: null },
    { label: 'known', overall: 90, safety: 40 },
  ];
  assert.deepEqual(sortedContenders(contenders).map((entry) => entry.label), ['known', 'unknown']);
});

test('benchmarkTableRows formats every contender in rank order', () => {
  const rows = benchmarkTableRows({
    contenders: [
      { label: 'b', version: null, overall: 70, safety: null, served: 80, low: 60, high: 80, runs: 10, passed: 7, errors: 0 },
      { label: 'a', version: '1.2.3', overall: 90, safety: 88, served: 92, low: 80, high: 95, runs: 1000, passed: 900, errors: 2 },
    ],
  });
  assert.deepEqual(rows, [
    { tool: 'a', version: '1.2.3', overall: '90.0%', safety: '88.0%', served: '92.0%', interval: '80.0–95.0', runs: '1,000', passed: '900', errors: '2' },
    { tool: 'b', version: '', overall: '70.0%', safety: '—', served: '80.0%', interval: '60.0–80.0', runs: '10', passed: '7', errors: '0' },
  ]);
});

test('historyTableRows drops unusable snapshots and sorts by date', () => {
  const rows = historyTableRows([
    { date: '2026-09-20', totalStars: 12, totalDownloads: 3456 },
    { date: '2026-09-18', totalStars: 10, totalDownloads: 3000 },
    { date: '2026-09-19', totalStars: null, totalDownloads: 1 },
  ]);
  assert.deepEqual(rows, [
    { date: '2026-09-18', stars: '10', downloads: '3,000' },
    { date: '2026-09-20', stars: '12', downloads: '3,456' },
  ]);
  assert.deepEqual(historyTableRows(null), []);
});
