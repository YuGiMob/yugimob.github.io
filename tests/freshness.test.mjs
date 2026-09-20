import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { historyAgeDays, MAX_HISTORY_AGE_DAYS } from '../scripts/refresh-lib.mjs';
import { ROOT, withRepoCopy } from './helpers.mjs';

const SCRIPT = join(ROOT, 'scripts', 'check-freshness.mjs');
const DAY_MS = 86400000;

function dateDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}

function rewriteNewestSnapshot(copy, days) {
  const path = join(copy, 'data', 'site-data.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  data.history[data.history.length - 1] = { date: dateDaysAgo(days), totalStars: 1, totalDownloads: 1 };
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return data.history;
}

test('historyAgeDays measures the newest snapshot in whole days', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  assert.equal(historyAgeDays([{ date: '2026-09-20' }], now), 0);
  assert.equal(historyAgeDays([{ date: '2026-09-18' }], now), 2);
  assert.equal(historyAgeDays([{ date: '2026-09-01' }, { date: '2026-09-19' }], now), 1);
});

test('historyAgeDays refuses a missing, empty, or unparsable history', () => {
  assert.equal(historyAgeDays([]), null);
  assert.equal(historyAgeDays(null), null);
  assert.equal(historyAgeDays([{ date: 'not a date' }]), null);
  assert.equal(historyAgeDays([{}]), null);
});

test('check-freshness passes when the newest snapshot is within the cap', () => {
  const fresh = withRepoCopy((copy) => {
    rewriteNewestSnapshot(copy, 0);
    return spawnSync(process.execPath, [SCRIPT, copy], { encoding: 'utf8' });
  });
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.match(fresh.stdout, /^freshness: ok \(newest history snapshot: /);
});

test('check-freshness fails when the newest snapshot is older than the cap', () => {
  const stale = withRepoCopy((copy) => {
    const history = rewriteNewestSnapshot(copy, MAX_HISTORY_AGE_DAYS + 8);
    const expected = historyAgeDays(history);
    return { expected, result: spawnSync(process.execPath, [SCRIPT, copy], { encoding: 'utf8' }) };
  });
  assert.equal(stale.result.status, 1);
  assert.match(stale.result.stderr, new RegExp(`is ${stale.expected} days old; the cap is ${MAX_HISTORY_AGE_DAYS}`));
});

test('check-freshness fails when the history is missing', () => {
  const missing = withRepoCopy((copy) => {
    const path = join(copy, 'data', 'site-data.json');
    const data = JSON.parse(readFileSync(path, 'utf8'));
    delete data.history;
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
    return spawnSync(process.execPath, [SCRIPT, copy], { encoding: 'utf8' });
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing or unparsable/);
});
