import test from 'node:test';
import assert from 'node:assert/strict';
import {
  benchmarkCoversFullMatrix,
  benchmarkTraceUrl,
  contenderLabel,
  isTimestamp,
  parseScenarioFocus,
  retryDelayMs,
  sleep,
  summarizeBenchmark,
  wilsonInterval,
} from '../scripts/refresh-lib.mjs';

const SCENARIO_SOURCE = `
export const scenarios: Scenario[] = [
  {
    id: "single-line",
    fileName: "single.ts",
    category: "correctness",
    focus: "core",
    name: "single-line replace",
  },
  {
    id: "stale-line",
    fileName: "stale.ts",
    category: "safety",
    focus: "staleness",
    name: "stale line",
  },
  {
    id: "undo-restore",
    fileName: "undo.ts",
    category: "safety",
    focus: "served-state",
    name: "undo",
  },
];
`;

function run(contenderId, scenarioId, extra = {}) {
  return {
    contenderId,
    contenderVersion: '1.0.0',
    scenarioId,
    modelId: 'model',
    pass: true,
    outcome: 'applied',
    costUsd: 0.001,
    tracePath: `/repo/results/traces/model/${contenderId}-${scenarioId}.json`,
    ...extra,
  };
}

test('parseScenarioFocus maps scenario ids to their focus', () => {
  const focus = parseScenarioFocus(SCENARIO_SOURCE);
  assert.deepEqual([...focus.entries()], [
    ['single-line', 'core'],
    ['stale-line', 'staleness'],
    ['undo-restore', 'served-state'],
  ]);
});

test('parseScenarioFocus ignores focus fields that precede an id', () => {
  const focus = parseScenarioFocus('const focus: "core" = 1\n{ id: "only", focus: "staleness" }');
  assert.deepEqual([...focus.keys()], ['only']);
});

test('parseScenarioFocus does not lend a later focus to an id that lacks one', () => {
  const focus = parseScenarioFocus('{ id: "no-focus", name: "x" },\n{ id: "next", focus: "staleness" }');
  assert.deepEqual([...focus.entries()], [['next', 'staleness']]);
});

test('contenderLabel strips the scope and the pi- prefix', () => {
  assert.equal(contenderLabel('pi-hashline-edit-pro'), 'hashline-edit-pro');
  assert.equal(contenderLabel('@cortexkit/aft-pi'), 'aft-pi');
  assert.equal(contenderLabel('builtin-edit'), 'built-in edit');
  assert.equal(contenderLabel('pi-hashline-edit-pro-diff0'), 'hashline-edit-pro-diff0');
});

test('wilsonInterval brackets the observed share and stays inside the range', () => {
  const wide = wilsonInterval(2, 4);
  assert.deepEqual(wide, { low: 15, high: 85 });
  const tight = wilsonInterval(98, 100);
  assert.ok(tight.low > 90 && tight.high <= 100);
  assert.deepEqual(wilsonInterval(0, 0), { low: 0, high: 0 });
  assert.deepEqual(wilsonInterval(10, 10), { low: 72.2, high: 100 });
});

test('benchmarkTraceUrl rebuilds a repository URL from a local trace path', () => {
  assert.equal(
    benchmarkTraceUrl('/home/rock/pi-edit-benchmark/results/traces/deepseek-flash/_cortexkit_aft-pi-stale-line.json'),
    'https://github.com/YuGiMob/pi-edit-benchmark/blob/main/results/traces/deepseek-flash/_cortexkit_aft-pi-stale-line.json',
  );
  assert.equal(
    benchmarkTraceUrl('/tmp/results/traces/model/a b.json'),
    'https://github.com/YuGiMob/pi-edit-benchmark/blob/main/results/traces/model/a%20b.json',
  );
  assert.equal(benchmarkTraceUrl(undefined), 'https://github.com/YuGiMob/pi-edit-benchmark/tree/main/results/traces');
});

test('summarizeBenchmark aggregates pass rates, focus splits, and outcomes', () => {
  const focus = parseScenarioFocus(SCENARIO_SOURCE);
  const report = {
    generatedAt: '2026-09-20T12:03:04.357Z',
    models: [{ id: 'a' }, { id: 'b' }],
    runs: [
      run('alpha', 'single-line'),
      run('alpha', 'stale-line'),
      run('alpha', 'stale-line', { pass: false, outcome: 'error' }),
      run('alpha', 'undo-restore'),
      run('beta', 'single-line'),
      run('beta', 'stale-line', { outcome: 'recovered' }),
      run('beta', 'undo-restore', { pass: false, outcome: 'rejected' }),
    ],
  };
  const summary = summarizeBenchmark(report, focus, (id) => id === 'beta');
  assert.equal(summary.models, 2);
  assert.equal(summary.scenarios, 3);
  assert.deepEqual(summary.focusCounts, { core: 1, staleness: 1, 'served-state': 1 });
  assert.equal(summary.contenderCount, 2);
  assert.equal(summary.totalRuns, 7);
  assert.equal(summary.runsPerContender, 4);
  assert.equal(summary.costUsd, 0.007);
  assert.equal(summary.source, 'https://github.com/YuGiMob/pi-edit-benchmark');

  const alpha = summary.contenders.find((entry) => entry.id === 'alpha');
  const beta = summary.contenders.find((entry) => entry.id === 'beta');
  assert.equal(alpha.overall, 75);
  assert.equal(alpha.safety, 50);
  assert.equal(alpha.served, 100);
  assert.equal(alpha.errors, 1);
  assert.deepEqual(alpha.outcomes, { applied: 3, error: 1 });
  assert.ok(alpha.low < alpha.overall && alpha.high > alpha.overall);
  assert.equal(alpha.traceUrl, 'https://github.com/YuGiMob/pi-edit-benchmark/blob/main/results/traces/model/alpha-single-line.json');
  assert.equal(beta.highlight, true);
  assert.equal(beta.traceUrl, 'https://github.com/YuGiMob/pi-edit-benchmark/blob/main/results/traces/model/beta-stale-line.json');
});

test('summarizeBenchmark sorts by overall pass rate then safety', () => {
  const focus = parseScenarioFocus(SCENARIO_SOURCE);
  const summary = summarizeBenchmark(
    {
      models: [],
      runs: [
        run('low', 'single-line'),
        run('low', 'stale-line', { pass: false }),
        run('high', 'single-line'),
        run('high', 'stale-line'),
      ],
    },
    focus,
  );
  assert.deepEqual(summary.contenders.map((entry) => entry.id), ['high', 'low']);
});

test('summarizeBenchmark survives an empty or malformed report', () => {
  const summary = summarizeBenchmark(null, new Map());
  assert.equal(summary.contenderCount, 0);
  assert.equal(summary.totalRuns, 0);
  assert.equal(summary.generatedAt, null);
  assert.deepEqual(summary.contenders, []);
  assert.equal(summary.scenarios, 0);
});

test('retryDelayMs reads Retry-After as seconds, then as a date, and caps the wait', () => {
  const headers = (value) => ({ get: () => value });
  assert.equal(retryDelayMs(headers('2')), 2000);
  assert.equal(retryDelayMs(headers('600')), 60000);
  assert.equal(retryDelayMs(headers(null)), 1000);
  assert.equal(retryDelayMs(undefined), 1000);
  const now = Date.parse('2026-09-20T12:00:00Z');
  assert.equal(retryDelayMs(headers('Sun, 20 Sep 2026 12:00:30 GMT'), now), 30000);
  assert.equal(retryDelayMs(headers('Sun, 20 Sep 2026 11:59:00 GMT'), now), 0);
  assert.equal(retryDelayMs(headers('not a date')), 1000);
});

test('isTimestamp accepts an ISO timestamp and rejects anything else', () => {
  assert.equal(isTimestamp('2026-09-20T12:03:04.357Z'), true);
  assert.equal(isTimestamp('2026-09-20'), true);
  assert.equal(isTimestamp(null), false);
  assert.equal(isTimestamp(''), false);
  assert.equal(isTimestamp('not a date'), false);
});

test('sleep resolves after the requested delay', async () => {
  const started = Date.now();
  await sleep(5);
  assert.ok(Date.now() - started >= 4);
});

test('benchmarkCoversFullMatrix accepts a complete report and rejects partial ones', () => {
  const complete = {
    models: 2,
    scenarios: 3,
    contenderCount: 2,
    runsPerContender: 6,
    totalRuns: 12,
    contenders: [{ runs: 6 }, { runs: 6 }],
  };
  assert.equal(benchmarkCoversFullMatrix(complete), true);
  assert.equal(benchmarkCoversFullMatrix(null), false);
  assert.equal(benchmarkCoversFullMatrix({ ...complete, contenders: [] }), false);
  assert.equal(benchmarkCoversFullMatrix({ ...complete, contenderCount: 3 }), false);
  assert.equal(benchmarkCoversFullMatrix({ ...complete, runsPerContender: 0 }), false);
  assert.equal(benchmarkCoversFullMatrix({ ...complete, contenders: [{ runs: 5 }, { runs: 6 }] }), false);
  assert.equal(benchmarkCoversFullMatrix({ ...complete, totalRuns: 11 }), false);
  assert.equal(benchmarkCoversFullMatrix({ ...complete, models: 1 }), false);
});
