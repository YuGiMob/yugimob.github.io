import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl, collectLinks, verdictFor } from '../scripts/link-lib.mjs';

const SITE = {
  identity: { links: { github: 'https://github.com/tester' }, avatarUrl: 'assets/avatar.png' },
  projects: [
    { name: 'tool-a', url: 'https://github.com/tester/tool-a', npm: 'tool-a' },
    { name: 'tool-b', url: 'https://github.com/tester/tool-b' },
  ],
  benchmark: {
    source: 'https://github.com/tester/bench',
    reportUrl: 'https://github.com/tester/bench/blob/main/results/llm-report.json',
    tracesUrl: 'https://github.com/tester/bench/tree/main/results/traces',
  },
};

const SHOWCASE = { problems: [{ name: 'tool-a' }, { name: 'ghost' }] };

const response = (status, extra = {}) => ({ status, headers: new Headers(), body: null, ...extra });

test('collectLinks gathers absolute URLs and every label', () => {
  const urls = collectLinks(SITE, SHOWCASE);
  assert.deepEqual([...urls.keys()], [
    'https://github.com/tester',
    'https://github.com/tester/tool-a',
    'https://registry.npmjs.org/tool-a',
    'https://github.com/tester/tool-b',
    'https://github.com/tester/bench',
    'https://github.com/tester/bench/blob/main/results/llm-report.json',
    'https://github.com/tester/bench/tree/main/results/traces',
  ]);
  assert.deepEqual([...urls.get('https://github.com/tester/tool-a')], ['tool-a', 'tool-a showcase']);
  assert.equal(urls.has('assets/avatar.png'), false);
});

test('collectLinks tolerates a partial document', () => {
  assert.equal(collectLinks({}, {}).size, 0);
});

test('verdictFor maps statuses to ok, warn, and fail', () => {
  assert.equal(verdictFor(200), 'ok');
  assert.equal(verdictFor(302), 'ok');
  assert.equal(verdictFor(401), 'warn');
  assert.equal(verdictFor(403), 'warn');
  assert.equal(verdictFor(429), 'warn');
  assert.equal(verdictFor(404), 'fail');
  assert.equal(verdictFor(0), 'fail');
});

test('checkUrl cancels the response body and accepts a success', async () => {
  let cancelled = false;
  const status = await checkUrl('https://example.com', {
    fetchImpl: async () => response(200, { body: { cancel: async () => { cancelled = true; } } }),
    sleepImpl: async () => {},
  });
  assert.equal(status, 200);
  assert.equal(cancelled, true);
});

test('checkUrl retries a server error and returns the final status', async () => {
  const statuses = [503, 200];
  let sleeps = 0;
  const status = await checkUrl('https://example.com', {
    fetchImpl: async () => response(statuses.shift()),
    sleepImpl: async () => { sleeps += 1; },
  });
  assert.equal(status, 200);
  assert.deepEqual(statuses, []);
  assert.equal(sleeps, 1);
});

test('checkUrl gives up on the final attempt without waiting again', async () => {
  let sleeps = 0;
  const status = await checkUrl('https://example.com', {
    attempts: 2,
    fetchImpl: async () => response(500),
    sleepImpl: async () => { sleeps += 1; },
  });
  assert.equal(status, 500);
  assert.equal(sleeps, 1);
});

test('checkUrl falls back to GET when HEAD is not allowed', async () => {
  const methods = [];
  const status = await checkUrl('https://example.com', {
    fetchImpl: async (url, options) => {
      methods.push(options.method);
      return response(options.method === 'HEAD' ? 405 : 404);
    },
    sleepImpl: async () => {},
  });
  assert.equal(status, 404);
  assert.deepEqual(methods, ['HEAD', 'GET']);
});

test('checkUrl retries a network failure before succeeding', async () => {
  let calls = 0;
  const status = await checkUrl('https://example.com', {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return response(200);
    },
    sleepImpl: async () => {},
  });
  assert.equal(status, 200);
  assert.equal(calls, 2);
});

test('checkUrl returns the last known status after repeated network failures', async () => {
  let calls = 0;
  const status = await checkUrl('https://example.com', {
    attempts: 2,
    fetchImpl: async () => {
      calls += 1;
      throw new TypeError('fetch failed');
    },
    sleepImpl: async () => {},
  });
  assert.equal(status, 0);
  assert.equal(calls, 2);
});
