import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkChart, benchmarkMatrix, benchmarkTableRows, benchmarkTrend, historyPanel, historyTableRows, sortedContenders, sparklinePoints } from '../assets/js/charts.js';
import { findAll, withDom } from './dom.mjs';

const BENCHMARK = {
  source: 'https://github.com/YuGiMob/pi-edit-benchmark',
  reportUrl: 'https://github.com/YuGiMob/pi-edit-benchmark/blob/main/results/llm-report.json',
  tracesUrl: 'https://github.com/YuGiMob/pi-edit-benchmark/tree/main/results/traces',
  generatedAt: '2026-09-20T12:03:04.357Z',
  models: 2,
  scenarios: 3,
  focusCounts: { core: 1, staleness: 1, 'served-state': 1 },
  contenderCount: 2,
  runsPerContender: 6,
  totalRuns: 12,
  costUsd: 0.5,
  contenders: [
    {
      id: 'tool-a',
      label: 'tool-a',
      version: '1.2.3',
      highlight: true,
      overall: 90,
      costUsd: 0.25,
      safety: 88,
      served: 92,
      low: 80,
      high: 95,
      runs: 10,
      passed: 9,
      errors: 1,
      outcomes: { applied: 5, recovered: 4, error: 1 },
      traceUrl: 'https://github.com/tester/trace-a.json',
    },
    {
      id: 'tool-b',
      label: 'tool-b',
      version: null,
      highlight: false,
      overall: 50,
      safety: null,
      served: null,
      low: 40,
      high: 60,
      runs: 10,
      passed: 5,
      errors: 0,
      costUsd: 0.1,
      outcomes: { applied: 10 },
      traceUrl: 'https://github.com/tester/trace-b.json',
    },
  ],
};

const HISTORY = [
  { date: '2026-09-18', totalStars: 10, totalDownloads: 3000 },
  { date: '2026-09-20', totalStars: 12, totalDownloads: 3456 },
];

const classes = (node, name) => findAll(node, (entry) => entry.classList?.contains(name) === true);
const tags = (node, tagName) => findAll(node, (entry) => entry.tagName === tagName);

test('sortedContenders orders by overall then safety and keeps the input intact', () => {
  const contenders = [
    { label: 'b', overall: 70, safety: 90 },
    { label: 'a', overall: 90, safety: 50 },
    { label: 'c', overall: 70, safety: 95 },
  ];
  assert.deepEqual(sortedContenders(contenders).map((entry) => entry.label), ['a', 'c', 'b']);
  assert.deepEqual(contenders.map((entry) => entry.label), ['b', 'a', 'c']);
});

test('sortedContenders treats a missing safety score as zero', () => {
  const contenders = [
    { label: 'unknown', overall: 90, safety: null },
    { label: 'known', overall: 90, safety: 40 },
  ];
  assert.deepEqual(sortedContenders(contenders).map((entry) => entry.label), ['known', 'unknown']);
});

test('sparklinePoints spans the full width and inverts the y axis', () => {
  assert.equal(sparklinePoints([0, 10]), '0.0 26.0 120.0 2.0');
});

test('sparklinePoints flattens a constant series', () => {
  assert.equal(sparklinePoints([7, 7, 7]), '0.0 26.0 60.0 26.0 120.0 26.0');
  assert.equal(sparklinePoints([7]), '0.0 26.0 120.0 26.0');
});

test('benchmarkTableRows formats every contender in rank order', () => {
  const rows = benchmarkTableRows({
    contenders: [
      { label: 'b', version: null, overall: 70, safety: null, served: 80, low: 60, high: 80, runs: 10, passed: 7, errors: 0 },
      { label: 'a', version: '1.2.3', overall: 90, safety: 88, served: 92, low: 80, high: 95, runs: 1000, passed: 900, errors: 2, costUsd: 0.5 },
    ],
  });
  assert.deepEqual(rows, [
    { tool: 'a', version: '1.2.3', overall: '90.0%', safety: '88.0%', served: '92.0%', interval: '80.0–95.0', difference: '—', runs: '1,000', passed: '900', errors: '2', cost: '$0.50' },
    { tool: 'b', version: '', overall: '70.0%', safety: '—', served: '80.0%', interval: '60.0–80.0', difference: '—', runs: '10', passed: '7', errors: '0', cost: '—' },
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

test('benchmarkChart renders rows, meters, outcomes, legends, sources, and a table', () => {
  withDom((dom) => {
    const controller = benchmarkChart(BENCHMARK, []);
    const { node } = controller;
    assert.equal(node.tagName, 'ARTICLE');
    assert.ok(node.classList.contains('chart'));
    assert.match(node.textContent, /Pass rate by editing tool/);
    assert.match(node.textContent, /2 models × 3 scenarios × 2 contenders/);
    assert.match(node.textContent, /\$0.50 in API cost/);

    const rows = classes(node, 'bench-row');
    assert.equal(rows.length, 2);
    assert.equal(classes(rows[0], 'bench-row').length, 1);
    assert.ok(classes(node, 'is-highlight').length >= 1);
    assert.match(node.textContent, /this project/);
    assert.match(node.textContent, /1 error/);
    assert.match(node.textContent, /90\.0% overall/);

    const fills = classes(node, 'meter-fill');
    assert.deepEqual(fills.map((entry) => entry.style.values.get('--pct')), ['90%', '88%', '92%', '50%', '0%', '0%']);
    const whiskers = classes(node, 'meter-whisker');
    assert.equal(whiskers[0].style.values.get('--low'), '80%');
    assert.equal(whiskers[0].style.values.get('--high'), '95%');

    const segments = classes(node, 'outcome-segment');
    assert.equal(segments[0].style.values.get('--share'), '5');
    assert.equal(segments[0].title, '5 applied');

    const links = tags(node, 'A');
    assert.deepEqual(
      links.map((entry) => entry.getAttribute('href')),
      [
        'https://github.com/tester/trace-a.json',
        'https://github.com/tester/trace-b.json',
        'https://github.com/YuGiMob/pi-edit-benchmark',
        BENCHMARK.reportUrl,
        BENCHMARK.tracesUrl,
        'data/site-data.json',
      ],
    );
    assert.match(node.textContent, /generated 2026-09-20/);

    const table = classes(node, 'chart-data');
    assert.equal(table.length, 1);
    assert.equal(tags(table[0], 'TR').length, 3);
    assert.equal(tags(table[0], 'TH').length, 11);
    assert.deepEqual(tags(table[0], 'TH').slice(0, 3).map((cell) => cell.textContent), ['tool', 'version', 'overall pass rate']);
    assert.equal(classes(node, 'bench-cost').length, 2);

  });
});

test('benchmarkChart turns live after the start delay and off again on stop', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  withDom(() => {
    const controller = benchmarkChart(BENCHMARK, []);
    controller.start();
    assert.equal(controller.node.classList.contains('is-live'), false);
    t.mock.timers.tick(120);
    assert.equal(controller.node.classList.contains('is-live'), true);
    controller.stop();
    assert.equal(controller.node.classList.contains('is-live'), false);
  });
});

test('benchmarkChart tolerates an empty contender list', () => {
  withDom(() => {
    const controller = benchmarkChart({ ...BENCHMARK, contenders: [] }, []);
    assert.equal(classes(controller.node, 'bench-row').length, 0);
    assert.equal(classes(controller.node, 'chart-data').length, 0);
  });
});

test('benchmarkChart adds the pass-rate trend when history has two reports', () => {
  withDom(() => {
    const single = benchmarkChart(BENCHMARK, [{ date: '2026-09-20', overall: 90, safety: 88, served: 92 }]);
    assert.equal(classes(single.node, 'bench-trend').length, 0);

    const history = [
      { date: '2026-09-18', overall: 80, safety: 70, served: 60 },
      { date: '2026-09-20', overall: 90, safety: 88, served: 92 },
    ];
    const controller = benchmarkChart(BENCHMARK, history);
    const trend = classes(controller.node, 'bench-trend');
    assert.equal(trend.length, 1);
    assert.match(trend[0].textContent, /2 benchmark reports since 2026-09-18/);
    assert.equal(classes(trend[0], 'growth-row').length, 3);
    assert.match(trend[0].textContent, /\+10\.0%/);
  });
});

test('historyPanel renders sparklines and a table and refuses unusable snapshots', () => {
  withDom(() => {
    assert.equal(historyPanel([]), null);
    assert.equal(historyPanel([{ date: '2026-09-20', totalStars: null, totalDownloads: null }]), null);

    const panel = historyPanel(HISTORY);
    assert.match(panel.textContent, /Since the first snapshot/);
    assert.match(panel.textContent, /GitHub stars/);
    assert.match(panel.textContent, /2 snapshots since 2026-09-18/);
    assert.equal(classes(panel, 'growth-row').length, 2);
    assert.equal(tags(panel, 'POLYLINE').length, 2);
    assert.equal(classes(panel, 'chart-data').length, 1);
    assert.match(panel.textContent, /\+2/);
  });
});

test('historyPanel describes a single snapshot without a delta', () => {
  withDom(() => {
    const panel = historyPanel([{ date: '2026-09-20', totalStars: 12, totalDownloads: 3456 }]);
    assert.match(panel.textContent, /1 snapshot since 2026-09-20/);
  });
});

test('benchmarkTrend returns null without two usable reports', () => {
  assert.equal(benchmarkTrend([]), null);
  assert.equal(benchmarkTrend([{ date: '2026-09-20', overall: 90 }]), null);
  assert.equal(benchmarkTrend([{ date: '2026-09-19' }, { date: '2026-09-20', overall: 90 }]), null);
});

test('benchmarkChart marks the paired comparison against the highlighted tool', () => {
  const bench = {
    ...BENCHMARK,
    contenders: [
      { ...BENCHMARK.contenders[0] },
      { ...BENCHMARK.contenders[1], vsHighlight: { b: 6, c: 0, p: 0.03125, pAdjusted: 0.3125, low: -60, high: -13.2 } },
    ],
  };
  withDom(() => {
    const controller = benchmarkChart(bench, []);
    const badges = classes(controller.node, 'bench-significance');
    assert.equal(badges.length, 1);
    assert.equal(badges[0].textContent, 'p=0.313');
    assert.match(badges[0].title, /Holm-adjusted exact McNemar test against tool-a/);
    assert.match(badges[0].title, /raw p 0\.031/);
    assert.match(controller.node.textContent, /no significant paired difference from tool-a \(95% interval for the difference -60\.0 to -13\.2 points; Holm-adjusted McNemar p = 0\.313\)/);
    assert.match(controller.node.textContent, /tool-a leads tool-b by 40\.0 points on the same model × scenario pairs/);
    assert.match(controller.node.textContent, /no significant paired difference \(Holm-adjusted McNemar p 0\.313; 95% interval for the difference -60\.0 to -13\.2 points\)/);
  });
});

test('benchmarkChart words a tie against the highlighted tool as a tie', () => {
  const bench = {
    ...BENCHMARK,
    contenders: [
      { ...BENCHMARK.contenders[0], overall: 90 },
      { ...BENCHMARK.contenders[1], overall: 90, safety: 50, vsHighlight: { b: 4, c: 4, p: 1, pAdjusted: 1, low: -45.6, high: 45.6 } },
    ],
  };
  withDom(() => {
    const controller = benchmarkChart(bench, []);
    assert.match(controller.node.textContent, /tool-a and tool-b are tied on overall pass rate; no significant paired difference \(Holm-adjusted McNemar p 1\.000; 95% interval for the difference -45\.6 to \+45\.6 points\)\./);
  });
});

test('benchmarkChart bases the verdict on the adjusted p-value, not the raw one', () => {
  const bench = {
    ...BENCHMARK,
    contenders: [
      { ...BENCHMARK.contenders[0] },
      { ...BENCHMARK.contenders[1], vsHighlight: { b: 9, c: 1, p: 0.0215, pAdjusted: 0.11, low: -96.4, high: -19.2 } },
    ],
  };
  withDom(() => {
    const controller = benchmarkChart(bench, []);
    assert.equal(classes(controller.node, 'bench-significance')[0].textContent, 'p=0.110');
    assert.match(controller.node.textContent, /no significant paired difference from tool-a \(95% interval for the difference -96\.4 to -19\.2 points; Holm-adjusted McNemar p = 0\.110\)/);
  });
});

test('benchmarkMatrix renders a scenario grid of pass counts', () => {
  const matrix = {
    models: ['m1', 'm2'],
    scenarios: [{ id: 'single-line', focus: 'core' }, { id: 'stale-line', focus: 'staleness' }],
    contenders: ['tool-a', 'tool-b'],
    cells: [[[[0], 1], [[], 1]], [[[0, 1], 2], [[0], 2]]],
  };
  withDom(() => {
    const controller = benchmarkMatrix(BENCHMARK, matrix);
    assert.match(controller.node.textContent, /Where each tool loses/);
    assert.match(controller.node.textContent, /2 scenarios × 2 contenders/);
    assert.equal(tags(controller.node, 'TR').length, 3);
    assert.equal(tags(controller.node, 'TH').length, 5);
    assert.deepEqual(classes(controller.node, 'matrix-cell').map((cell) => cell.textContent), ['1/1 for tool-a', '0/1 for tool-b', '2/2 for tool-a', '1/2 for tool-b']);
    assert.deepEqual(classes(controller.node, 'matrix-cell').map((cell) => cell.classList.contains('is-full')), [true, false, true, false]);
    assert.equal(classes(controller.node, 'matrix-cell')[1].title, 'tool-b on single-line: 0 of 1 runs passed; failed for m1, m2');
    const scroll = classes(controller.node, 'matrix-scroll')[0];
    assert.equal(scroll.getAttribute('role'), 'region');
    assert.equal(scroll.getAttribute('tabindex'), '0');
    const focusButtons = classes(controller.node, 'matrix-filter-button');
    assert.deepEqual(focusButtons.map((button) => button.textContent), ['every focus', 'core', 'staleness']);
    assert.deepEqual(classes(controller.node, 'matrix-cell').map((cell) => !cell.parentNode.hidden), [true, true, true, true]);
    focusButtons[2].dispatch('click');
    assert.deepEqual(classes(controller.node, 'matrix-cell').map((cell) => !cell.parentNode.hidden), [false, false, true, true]);
    assert.equal(focusButtons[2].getAttribute('aria-pressed'), 'true');
    assert.equal(benchmarkMatrix(BENCHMARK, null), null);
    assert.equal(benchmarkMatrix(BENCHMARK, { models: ['m'], scenarios: [], contenders: [], cells: [] }), null);
  });
});

test('benchmarkMatrix omits the sweep note when the highlight is not a column', () => {
  const matrix = {
    models: ['m1'],
    scenarios: [{ id: 'single-line', focus: 'core' }],
    contenders: ['tool-b'],
    cells: [[[[0], 1]]],
  };
  withDom(() => {
    const controller = benchmarkMatrix(BENCHMARK, matrix);
    assert.ok(controller);
    assert.doesNotMatch(controller.node.textContent, /passes every recorded run/);
  });
});

test('benchmarkMatrix names the scenarios the highlighted contender loses', () => {
  const matrix = {
    models: ['m1', 'm2'],
    scenarios: [{ id: 'single-line', focus: 'core' }, { id: 'stale-line', focus: 'staleness' }],
    contenders: ['tool-a', 'tool-b'],
    cells: [[[[0], 1], [[], 1]], [[[], 2], [[0], 2]]],
  };
  withDom(() => {
    const controller = benchmarkMatrix(BENCHMARK, matrix);
    assert.match(controller.node.textContent, /tool-a does not sweep every scenario: stale-line \(0\/2\)\./);
  });
});
