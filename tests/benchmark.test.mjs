import test from 'node:test';
import assert from 'node:assert/strict';
import {
  benchmarkCoversFullMatrix,
  benchmarkTraceUrl,
  buildScenarioMatrix,
  contenderLabel,
  holmAdjust,
  isTimestamp,
  mcnemarExact,
  pairedDifferenceInterval,
  npmPointUrl,
  parseScenarioFocus,
  retryDelayMs,
  scenarioMatrixMatchesBenchmark,
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

test('pairedDifferenceInterval brackets the paired difference and refuses bad input', () => {
  assert.deepEqual(pairedDifferenceInterval(0, 0, 315), { low: 0, high: 0 });
  assert.deepEqual(pairedDifferenceInterval(3, 3, 315), { low: -1.2, high: 1.2 });
  assert.deepEqual(pairedDifferenceInterval(18, 7, 315), { low: -5.7, high: -0.4 });
  assert.deepEqual(pairedDifferenceInterval(7, 18, 315), { low: 0.4, high: 5.7 });
  assert.deepEqual(pairedDifferenceInterval(2, 1, 4), { low: -65.8, high: 43.9 });
  assert.deepEqual(pairedDifferenceInterval(4, 4, 10), { low: -45.6, high: 45.6 });
  assert.equal(pairedDifferenceInterval(5, 1, 4), null);
  assert.equal(pairedDifferenceInterval(1, 1, 0), null);
  assert.equal(pairedDifferenceInterval(Number.NaN, 1, 4), null);
  assert.equal(pairedDifferenceInterval(1.5, 1, 4), null);
});

test('npmPointUrl batches plain packages and refuses scoped ones', () => {
  assert.equal(npmPointUrl(['one', 'two']), 'https://api.npmjs.org/downloads/point/last-week/one,two');
  assert.equal(npmPointUrl(['@scope/one']), null);
  assert.equal(npmPointUrl(['one', '@scope/two']), null);
  assert.equal(npmPointUrl([]), null);
  assert.equal(npmPointUrl(['one', '', null]), 'https://api.npmjs.org/downloads/point/last-week/one');
  assert.equal(npmPointUrl(undefined), null);
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

test('mcnemarExact matches the exact two-sided binomial tail', () => {
  assert.equal(mcnemarExact(10, 0), 0.001953);
  assert.equal(mcnemarExact(0, 10), 0.001953);
  assert.equal(mcnemarExact(14, 8), 0.286279);
  assert.equal(mcnemarExact(8, 14), 0.286279);
  assert.equal(mcnemarExact(0, 0), 1);
  assert.equal(mcnemarExact(-1, 4), 1);
  assert.equal(mcnemarExact(2.5, 4), 1);
});

test('holmAdjust applies the Holm step-down and caps at one', () => {
  assert.deepEqual(holmAdjust([0.043285, 0.002599, 1, 0.000116]), [0.08657, 0.007797, 1, 0.000464]);
  assert.deepEqual(holmAdjust([0.5]), [0.5]);
  assert.deepEqual(holmAdjust([]), []);
  assert.deepEqual(holmAdjust([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(holmAdjust([2, -1, Number.NaN]), [1, 0, 1]);
});

test('summarizeBenchmark pairs every contender against the highlighted one', () => {
  const focus = parseScenarioFocus(SCENARIO_SOURCE);
  const report = {
    generatedAt: '2026-09-20T12:03:04.357Z',
    models: [{ id: 'm' }],
    runs: [
      run('alpha', 'single-line', { modelId: 'm' }),
      run('alpha', 'stale-line', { modelId: 'm' }),
      run('beta', 'single-line', { modelId: 'm', pass: false, outcome: 'rejected' }),
      run('beta', 'stale-line', { modelId: 'm' }),
    ],
  };
  const summary = summarizeBenchmark(report, focus, (id) => id === 'alpha');
  const alpha = summary.contenders.find((entry) => entry.id === 'alpha');
  const beta = summary.contenders.find((entry) => entry.id === 'beta');
  assert.equal(alpha.vsHighlight, null);
  assert.deepEqual(beta.vsHighlight, { b: 1, c: 0, p: 1, low: -50, high: 29.3, pAdjusted: 1 });
});

test('buildScenarioMatrix counts passes per scenario and contender in focus order', () => {
  const focus = parseScenarioFocus(SCENARIO_SOURCE);
  const report = {
    generatedAt: '2026-09-20T12:03:04.357Z',
    models: [{ id: 'm' }],
    runs: [
      run('alpha', 'single-line', { modelId: 'm' }),
      run('alpha', 'stale-line', { modelId: 'm' }),
      run('alpha', 'undo-restore', { modelId: 'm', pass: false, outcome: 'error' }),
      run('beta', 'single-line', { modelId: 'm' }),
      run('beta', 'stale-line', { modelId: 'm', pass: false, outcome: 'rejected' }),
      run('beta', 'undo-restore', { modelId: 'm' }),
    ],
  };
  const matrix = buildScenarioMatrix(report, focus, ['alpha', 'beta']);
  assert.equal(matrix.generatedAt, report.generatedAt);
  assert.deepEqual(matrix.models, ['m']);
  assert.deepEqual(matrix.scenarios, [
    { id: 'single-line', focus: 'core' },
    { id: 'stale-line', focus: 'staleness' },
    { id: 'undo-restore', focus: 'served-state' },
  ]);
  assert.deepEqual(matrix.contenders, ['alpha', 'beta']);
  assert.deepEqual(matrix.cells, [
    [[[0], 1], [[0], 1]],
    [[[0], 1], [[], 1]],
    [[[], 1], [[0], 1]],
  ]);
});

test('buildScenarioMatrix keys missing model ids and records unknown ones', () => {
  const single = buildScenarioMatrix({
    generatedAt: '2026-09-20T12:03:04.357Z',
    models: [{ id: 'only' }],
    runs: [
      run('alpha', 'single-line', { modelId: undefined }),
      run('beta', 'single-line', { modelId: 'extra' }),
    ],
  }, new Map(), ['alpha', 'beta']);
  assert.deepEqual(single.models, ['only', 'extra']);
  assert.deepEqual(single.cells, [[[[0], 1], [[1], 1]]]);

  const multiple = buildScenarioMatrix({
    generatedAt: '2026-09-20T12:03:04.357Z',
    models: [{ id: 'a' }, { id: 'b' }],
    runs: [run('alpha', 'single-line', { modelId: undefined })],
  }, new Map(), ['alpha']);
  assert.deepEqual(multiple.models, ['a', 'b', '']);
  assert.deepEqual(multiple.cells, [[[[2], 1]]]);

  const unordered = buildScenarioMatrix({
    generatedAt: '2026-09-20T12:03:04.357Z',
    models: [{ id: 'a' }, { id: 'b' }],
    runs: [
      run('alpha', 'single-line', { modelId: 'b' }),
      run('alpha', 'single-line', { modelId: 'a', pass: false }),
      run('alpha', 'single-line', { modelId: 'a' }),
    ],
  }, new Map(), ['alpha']);
  assert.deepEqual(unordered.cells, [[[[0, 1], 3]]]);
});

test('buildScenarioMatrix tolerates an empty or malformed report', () => {
  const matrix = buildScenarioMatrix(null, new Map(), ['alpha']);
  assert.deepEqual(matrix, { generatedAt: null, models: [], scenarios: [], contenders: ['alpha'], cells: [] });
});

test('scenarioMatrixMatchesBenchmark accepts a consistent matrix and rejects drift', () => {
  const benchmark = {
    generatedAt: '2026-09-20T12:03:04.357Z',
    scenarios: 2,
    focusCounts: { core: 1, staleness: 1, 'served-state': 0 },
    contenderCount: 2,
    contenders: [
      { id: 'alpha', runs: 4, passed: 3, highlight: true, vsHighlight: null },
      { id: 'beta', runs: 4, passed: 2, highlight: false, vsHighlight: { b: 2, c: 1, p: 1, low: -65.8, high: 43.9, pAdjusted: 1 } },
    ],
  };
  const matrix = {
    generatedAt: '2026-09-20T12:03:04.357Z',
    models: ['m1', 'm2'],
    scenarios: [{ id: 'single-line', focus: 'core' }, { id: 'stale-line', focus: 'staleness' }],
    contenders: ['alpha', 'beta'],
    cells: [
      [[[0], 2], [[0, 1], 2]],
      [[[0, 1], 2], [[], 2]],
    ],
  };
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, benchmark), true);
  assert.equal(scenarioMatrixMatchesBenchmark(null, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, null), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, models: [] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, scenarios: null }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, { ...benchmark, contenders: [] }), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, generatedAt: '2026-01-01T00:00:00Z' }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, { ...benchmark, contenderCount: 3 }), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, scenarios: [{ id: 'x', focus: 'core' }] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[[[0], 2], [[0, 1], 2]]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, contenders: ['alpha'] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, scenarios: [{ id: 'x', focus: 'speed' }, { id: 'stale-line', focus: 'staleness' }] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, scenarios: [{ id: 'x', focus: 'served-state' }, { id: 'stale-line', focus: 'staleness' }] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [null, matrix.cells[1]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[[[0], 2]], matrix.cells[1]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[null, [[0, 1], 2]], matrix.cells[1]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[[[0]], [[0, 1], 2]], matrix.cells[1]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[[[0], 2], [0, 2]], matrix.cells[1]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[[[0], 2], [[0, 1], 2]], [[[0, 1], 1], [[], 2]]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[[[0], 2], [[0, 1], 2]], [[[0, 1], '2'], [[], 2]]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[[[0], 2], [[0, 1], 2]], [[[0, 1], 2], [[2], 2]]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[[[0], 2], [[0, 1], 2]], [[[0, 1], 2], [[-1], 2]]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[[[0], 2], [[0, 1], 2]], [[[0, 1], 2], [[0, 0, 1], 2]]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[[[0], 2], [[0, 1], 2]], [[[0, 1], 2], [[0], 1]]] }, benchmark), false);
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, contenders: ['alpha', 'ghost'] }, benchmark), false);
  const noHighlight = structuredClone(benchmark);
  for (const contender of noHighlight.contenders) contender.highlight = false;
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, noHighlight), false);
  const selfCompared = structuredClone(benchmark);
  selfCompared.contenders[0].vsHighlight = { b: 1, c: 1, p: 1 };
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, selfCompared), false);
  const missing = structuredClone(benchmark);
  delete missing.contenders[1].vsHighlight;
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, missing), false);
  const pairingDrift = structuredClone(benchmark);
  pairingDrift.contenders[1].vsHighlight = { b: 1, c: 0, p: 1 };
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, pairingDrift), false);
  const pDrift = structuredClone(benchmark);
  pDrift.contenders[1].vsHighlight.p = 0.5;
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, pDrift), false);
  const adjustedDrift = structuredClone(benchmark);
  adjustedDrift.contenders[1].vsHighlight.pAdjusted = 0.5;
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, adjustedDrift), false);
  const intervalDrift = structuredClone(benchmark);
  intervalDrift.contenders[1].vsHighlight.low = -50;
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, intervalDrift), false);
  const intervalMissing = structuredClone(benchmark);
  delete intervalMissing.contenders[1].vsHighlight.high;
  assert.equal(scenarioMatrixMatchesBenchmark(matrix, intervalMissing), false);
  const washed = structuredClone(benchmark);
  washed.contenders[1].vsHighlight = { b: 2, c: 1, p: 1 };
  assert.equal(scenarioMatrixMatchesBenchmark({ ...matrix, cells: [[[[0], 2], [[0], 2]], [[[0, 1], 2], [[0], 2]]] }, washed), false);
});
