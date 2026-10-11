import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, withRepoCopy } from './helpers.mjs';
import { historyAgeDays } from '../scripts/refresh-lib.mjs';

const SCRIPT = join(ROOT, 'scripts', 'check-freshness.mjs');
const DAY_MS = 86400000;

function dateDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}

function rewriteData(copy, mutate) {
  const path = join(copy, 'data', 'site-data.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  mutate(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function run(copy) {
  return spawnSync(process.execPath, [SCRIPT, copy], { encoding: 'utf8' });
}

test('historyAgeDays measures the newest snapshot in whole days', () => {
  const now = Date.now();
  assert.equal(historyAgeDays([{ date: new Date(now - 2 * DAY_MS).toISOString().slice(0, 10) }], now), 2);
});

test('historyAgeDays refuses a missing, empty, or unparsable history', () => {
  assert.equal(historyAgeDays(null), null);
  assert.equal(historyAgeDays([]), null);
  assert.equal(historyAgeDays([{ date: 'nope' }]), null);
});

test('check-freshness passes when the newest snapshot is within the cap', () => {
  withRepoCopy((copy) => {
    rewriteData(copy, (data) => {
      data.history = [{ date: dateDaysAgo(1), totalStars: 1, totalDownloads: 1 }];
    });
    const result = run(copy);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /freshness: ok/);
  });
});

test('check-freshness fails when the newest snapshot is older than the cap', () => {
  withRepoCopy((copy) => {
    rewriteData(copy, (data) => {
      data.history = [{ date: dateDaysAgo(5), totalStars: 1, totalDownloads: 1 }];
    });
    const result = run(copy);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /is 5 days old; the cap is 2/);
  });
});

test('check-freshness fails when the history is missing', () => {
  withRepoCopy((copy) => {
    rewriteData(copy, (data) => {
      delete data.history;
    });
    const result = run(copy);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing or unparsable/);
  });
});
