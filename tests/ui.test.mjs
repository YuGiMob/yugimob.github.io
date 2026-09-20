import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber } from '../assets/js/ui.js';

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
