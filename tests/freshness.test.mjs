import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { benchmarkAgeDays, historyAgeDays, MAX_BENCHMARK_AGE_DAYS, MAX_HISTORY_AGE_DAYS } from '../scripts/refresh-lib.mjs';
import { ROOT, withRepoCopy } from './helpers.mjs';

const SCRIPT = join(ROOT, 'scripts', 'check-freshness.mjs');
const DAY_MS = 86400000;

function dateDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}

function stampDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function rewriteData(copy, mutate) {
  const path = join(copy, 'data', 'site-data.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  mutate(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return data;
}

function rewriteNewestSnapshot(copy, days, benchmarkDays = 0) {
  return rewriteData(copy, (data) => {
    data.history[data.history.length - 1] = { date: dateDaysAgo(days), totalStars: 1, totalDownloads: 1 };
    if (data.benchmark) data.benchmark.generatedAt = stampDaysAgo(benchmarkDays);
  }).history;
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

test('benchmarkAgeDays measures the report stamp and refuses an unusable one', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  assert.equal(benchmarkAgeDays({ generatedAt: '2026-09-20T12:03:04.357Z' }, now), 0);
  assert.equal(benchmarkAgeDays({ generatedAt: '2026-09-06T12:00:00Z' }, now), 14);
  assert.equal(benchmarkAgeDays({ generatedAt: 'not a date' }, now), null);
  assert.equal(benchmarkAgeDays({}, now), null);
  assert.equal(benchmarkAgeDays(null, now), null);
});

test('check-freshness passes when the newest snapshot is within the cap', () => {
  const fresh = withRepoCopy((copy) => {
    rewriteNewestSnapshot(copy, 0);
    return spawnSync(process.execPath, [SCRIPT, copy], { encoding: 'utf8' });
  });
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.match(fresh.stdout, /^freshness: ok \(newest history snapshot: /);
  assert.match(fresh.stdout, /benchmark report 0 days old\)/);
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

test('check-freshness fails when the benchmark report is older than its cap', () => {
  const stale = withRepoCopy((copy) => {
    rewriteNewestSnapshot(copy, 0, MAX_BENCHMARK_AGE_DAYS + 6);
    return spawnSync(process.execPath, [SCRIPT, copy], { encoding: 'utf8' });
  });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, new RegExp(`is ${MAX_BENCHMARK_AGE_DAYS + 6} days old; the cap is ${MAX_BENCHMARK_AGE_DAYS}`));
});

test('check-freshness reports every stale source in one run', () => {
  const both = withRepoCopy((copy) => {
    rewriteNewestSnapshot(copy, MAX_HISTORY_AGE_DAYS + 8, MAX_BENCHMARK_AGE_DAYS + 6);
    return spawnSync(process.execPath, [SCRIPT, copy], { encoding: 'utf8' });
  });
  assert.equal(both.status, 1);
  assert.match(both.stderr, /the newest history snapshot/);
  assert.match(both.stderr, /the benchmark report/);
});

test('check-freshness fails when the benchmark block has no usable stamp', () => {
  const broken = withRepoCopy((copy) => {
    rewriteData(copy, (data) => {
      data.history[data.history.length - 1] = { date: dateDaysAgo(0), totalStars: 1, totalDownloads: 1 };
      data.benchmark.generatedAt = 'not a date';
    });
    return spawnSync(process.execPath, [SCRIPT, copy], { encoding: 'utf8' });
  });
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /the benchmark block has no usable generatedAt/);
});

test('check-freshness skips the benchmark gate when the block is absent', () => {
  const withoutBenchmark = withRepoCopy((copy) => {
    rewriteData(copy, (data) => {
      delete data.benchmark;
    });
    return spawnSync(process.execPath, [SCRIPT, copy], { encoding: 'utf8' });
  });
  assert.equal(withoutBenchmark.status, 0, withoutBenchmark.stderr);
  assert.match(withoutBenchmark.stdout, /^freshness: ok \(newest history snapshot: /);
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
