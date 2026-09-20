import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSiteData, isValidBenchmark, isValidBenchmarkMatrix, isValidShowcase, fallbackShowcase, countWord, formatWindow } from '../assets/js/site-data.js';

const VALID = {
  identity: {
    displayName: 'Tester',
    classTitle: 'Testing things',
    tagline: 'A tagline.',
    avatarUrl: 'https://example.com/a.png',
    links: { github: 'https://github.com/tester' },
  },
  projects: [{ name: 'tool', url: 'https://github.com/tester/tool', description: 'A tool.' }],
  stats: { totalStars: 1 },
  activity: { pushes: 0 },
  sections: { showAbout: true },
};

test('isValidSiteData accepts a complete document', () => {
  assert.equal(isValidSiteData(VALID), true);
});

test('isValidSiteData rejects missing top-level keys', () => {
  assert.equal(isValidSiteData({ ...VALID, sections: undefined }), false);
});

test('isValidSiteData rejects identity without its display fields', () => {
  assert.equal(isValidSiteData({ ...VALID, identity: { ...VALID.identity, tagline: undefined } }), false);
  assert.equal(isValidSiteData({ ...VALID, identity: [] }), false);
});

test('isValidSiteData rejects empty or malformed projects', () => {
  assert.equal(isValidSiteData({ ...VALID, projects: [] }), false);
  assert.equal(isValidSiteData({ ...VALID, projects: [{ name: 'tool' }] }), false);
});

test('isValidSiteData rejects non-object stats, activity, and sections', () => {
  assert.equal(isValidSiteData({ ...VALID, stats: [] }), false);
  assert.equal(isValidSiteData({ ...VALID, activity: 'none' }), false);
  assert.equal(isValidSiteData({ ...VALID, sections: null }), false);
});

test('fallbackShowcase builds a usable narrative from identity and projects', () => {
  const showcase = fallbackShowcase(VALID);
  assert.equal(showcase.intro.headline, 'Testing things');
  assert.deepEqual(showcase.intro.paragraphs, ['A tagline.']);
  assert.equal(showcase.problems.length, 1);
  assert.equal(showcase.problems[0].name, 'tool');
  assert.equal(showcase.evidence, null);
  assert.deepEqual(showcase.principles, []);
  assert.deepEqual(showcase.colophon, ['A tagline.']);
});

test('countWord spells small numbers and falls back to digits', () => {
  assert.equal(countWord(0), 'zero');
  assert.equal(countWord(6), 'six');
  assert.equal(countWord(11), '11');
});

test('formatWindow expands a same-month range', () => {
  assert.equal(formatWindow('2026-09-03..17'), '2026-09-03 to 2026-09-17');
  assert.equal(formatWindow('2026-08-01..2026-09-17'), '2026-08-01 to 2026-09-17');
  assert.equal(formatWindow('2026-09-17'), '2026-09-17');
});

const BENCHMARK = {
  generatedAt: '2026-09-20T12:03:04.357Z',
  models: 1,
  scenarios: 1,
  contenderCount: 1,
  runsPerContender: 1,
  totalRuns: 1,
  focusCounts: { core: 1, staleness: 0, 'served-state': 0 },
  contenders: [
    { label: 'tool', overall: 100, low: 20, high: 100, runs: 1, passed: 1, errors: 0, safety: null, served: null, vsHighlight: null },
  ],
};

test('isValidBenchmark rejects a malformed block and accepts a complete one', () => {
  assert.equal(isValidBenchmark(null), false);
  assert.equal(isValidBenchmark('none'), false);
  assert.equal(isValidBenchmark({ contenders: [] }), false);
  assert.equal(isValidBenchmark(BENCHMARK), true);
  assert.equal(isValidBenchmark({ ...BENCHMARK, generatedAt: undefined }), false);
  assert.equal(isValidBenchmark({ ...BENCHMARK, contenders: [{ label: 'tool' }] }), false);
  assert.equal(isValidBenchmark({ ...BENCHMARK, contenders: [{ ...BENCHMARK.contenders[0], vsHighlight: { b: 1, c: 0, p: 'x' } }] }), false);
  assert.equal(isValidBenchmark({ ...BENCHMARK, contenders: [{ ...BENCHMARK.contenders[0], vsHighlight: { b: 1, c: 0, bothPassed: 1, bothFailed: 0, p: 0.5, low: -10, high: 10 } }] }), true);
  assert.equal(isValidBenchmark({ ...BENCHMARK, contenders: [{ ...BENCHMARK.contenders[0], vsHighlight: { b: 1, c: 0, p: 0.5, low: -10, high: 10 } }] }), false);
  assert.equal(isValidBenchmark({ ...BENCHMARK, contenders: [{ ...BENCHMARK.contenders[0], vsHighlight: { b: 1, c: 0, p: 0.5 } }] }), false);
  assert.equal(isValidBenchmark({ ...BENCHMARK, contenders: [{ ...BENCHMARK.contenders[0], vsHighlight: { b: 1, c: 0, p: 0.5, low: 'x', high: 10 } }] }), false);
});

test('isValidSiteData tolerates an unusable benchmark block', () => {
  assert.equal(isValidSiteData({ ...VALID, benchmark: 'none' }), true);
  assert.equal(isValidSiteData({ ...VALID, benchmark: { contenders: [], focusCounts: {} } }), true);
});

test('isValidShowcase accepts a curated document and rejects shapeless ones', () => {
  const intro = { headline: 'A headline.', paragraphs: ['A paragraph.'] };
  const problems = [{ name: 'tool', headline: 'A problem.', highlights: ['A highlight'] }];
  assert.equal(isValidShowcase({ intro, problems }), true);
  assert.equal(isValidShowcase(fallbackShowcase(VALID)), true);
  assert.equal(isValidShowcase(null), false);
  assert.equal(isValidShowcase([]), false);
  assert.equal(isValidShowcase({}), false);
  assert.equal(isValidShowcase({ intro, problems: [] }), false);
  assert.equal(isValidShowcase({ intro: { headline: 'A headline.' }, problems }), false);
  assert.equal(isValidShowcase({ intro, problems: [{ name: 'tool' }] }), false);
  assert.equal(isValidShowcase({ intro, problems: [{ name: 'tool', headline: 'A problem.', highlights: [] }] }), false);
});

test('isValidBenchmarkMatrix accepts a shaped matrix and rejects unusable ones', () => {
  const matrix = { models: ['m'], scenarios: [{ id: 'a', focus: 'core' }], contenders: ['t'], cells: [[[[0], 1]]] };
  assert.equal(isValidBenchmarkMatrix(matrix), true);
  assert.equal(isValidBenchmarkMatrix(null), false);
  assert.equal(isValidBenchmarkMatrix([]), false);
  assert.equal(isValidBenchmarkMatrix({}), false);
  assert.equal(isValidBenchmarkMatrix({ ...matrix, models: [] }), false);
  assert.equal(isValidBenchmarkMatrix({ ...matrix, scenarios: [] }), false);
  assert.equal(isValidBenchmarkMatrix({ ...matrix, contenders: [] }), false);
  assert.equal(isValidBenchmarkMatrix({ ...matrix, cells: [] }), false);
  assert.equal(isValidBenchmarkMatrix({ ...matrix, cells: [[[[0], 1]], [[[0], 1]]] }), false);
});
