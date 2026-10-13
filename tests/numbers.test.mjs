import test from 'node:test';
import assert from 'node:assert/strict';
import { elapsedDays, extent, formatNumber, localDateString } from '../assets/js/numbers.js';

test('formatNumber groups thousands', () => {
  assert.equal(formatNumber(1234567), '1,234,567');
  assert.equal(formatNumber(0), '0');
});

test('formatNumber falls back to zero for unusable values', () => {
  assert.equal(formatNumber(NaN), '0');
  assert.equal(formatNumber(Infinity), '0');
  assert.equal(formatNumber(undefined), '0');
  assert.equal(formatNumber('12'), '0');
});

test('extent returns the low and high values of a series', () => {
  assert.deepEqual(extent([3, 1, 2]), [1, 3]);
  assert.deepEqual(extent([5]), [5, 5]);
  assert.deepEqual(extent([]), [0, 0]);
});

test('elapsedDays counts whole days against a date or a timestamp', () => {
  assert.equal(elapsedDays('2026-09-18', '2026-09-20'), 2);
  assert.equal(elapsedDays('2026-09-19', Date.parse('2026-09-21T12:00:00Z')), 2);
  assert.equal(elapsedDays('2026-09-20', '2026-09-18'), 0);
});

test('elapsedDays rejects unusable dates', () => {
  assert.equal(elapsedDays('nope', '2026-09-20'), null);
  assert.equal(elapsedDays('2026-09-20', 'nope'), null);
});

test('localDateString formats a local date and passes a calendar date through', () => {
  assert.equal(localDateString(new Date(2026, 0, 2)), '2026-01-02');
  assert.equal(localDateString(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  assert.equal(localDateString('2026-10-11'), '2026-10-11');
  assert.equal(localDateString('2026-02-30'), '');
  assert.equal(localDateString('nope'), '');
  assert.equal(localDateString(null), '');
});
