import test from 'node:test';
import assert from 'node:assert/strict';
import { sortedContenders, sparklinePoints } from '../assets/js/charts.js';

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
