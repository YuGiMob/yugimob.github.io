import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl, collectLinks, collectTextLinks, verdictFor } from '../scripts/link-lib.mjs';

const SITE = {
  identity: { links: { github: 'https://github.com/tester' }, avatarUrl: 'assets/avatar.png' },
  projects: [
    { name: 'tool-a', url: 'https://github.com/tester/tool-a', npm: 'tool-a' },
    { name: 'tool-b', url: 'https://github.com/tester/tool-b' },
  ],
};

const SHOWCASE = { problems: [{ name: 'tool-a' }, { name: 'ghost' }] };

const response = (status, extra = {}) => ({ status, headers: new Headers(), body: null, ...extra });

test('collectLinks gathers absolute URLs and every label', () => {
  const urls = collectLinks(SITE, SHOWCASE);
  assert.ok(urls.has('https://github.com/tester'));
  assert.ok(urls.has('https://github.com/tester/tool-a'));
  assert.ok(urls.has('https://registry.npmjs.org/tool-a'));
  assert.ok(urls.get('https://github.com/tester/tool-a').has('tool-a'));
  assert.ok(urls.get('https://github.com/tester/tool-a').has('tool-a showcase'));
});

test('collectLinks tolerates a partial document', () => {
  const urls = collectLinks({}, {});
  assert.equal(urls.size, 0);
});

test('collectTextLinks keeps probeable URLs and drops local or reserved hosts', () => {
  const links = collectTextLinks('See https://example.com/x and https://real.test.dev/page and http://localhost:3000 and https://foo.invalid/.');
  assert.deepEqual([...links], ['https://real.test.dev/page']);
});

test('collectLinks merges document URLs with their labels and dedupes', () => {
  const urls = collectLinks(SITE, SHOWCASE, [{ label: 'README', text: 'https://github.com/tester/tool-a and https://github.com/tester/tool-a' }]);
  assert.equal(urls.get('https://github.com/tester/tool-a').size, 3);
});

test('verdictFor maps statuses to ok, warn, and fail', () => {
  assert.equal(verdictFor(200), 'ok');
  assert.equal(verdictFor(301), 'ok');
  assert.equal(verdictFor(403), 'warn');
  assert.equal(verdictFor(429), 'warn');
  assert.equal(verdictFor(404), 'fail');
  assert.equal(verdictFor(500), 'fail');
});

test('checkUrl cancels the response body and accepts a success', async () => {
  let cancelled = false;
  const status = await checkUrl('https://ok.test/', {
    fetchImpl: async () => response(200, { body: { cancel: async () => { cancelled = true; } } }),
    sleepImpl: async () => {},
  });
  assert.equal(status, 200);
  assert.equal(cancelled, true);
});

test('checkUrl retries a server error and returns the final status', async () => {
  let calls = 0;
  const status = await checkUrl('https://retry.test/', {
    attempts: 3,
    fetchImpl: async () => {
      calls += 1;
      return response(500);
    },
    sleepImpl: async () => {},
  });
  assert.equal(status, 500);
  assert.equal(calls, 3);
});

test('checkUrl falls back to GET when HEAD is not allowed', async () => {
  const methods = [];
  const status = await checkUrl('https://head.test/', {
    fetchImpl: async (url, options) => {
      methods.push(options.method);
      return response(options.method === 'HEAD' ? 405 : 200);
    },
    sleepImpl: async () => {},
  });
  assert.equal(status, 200);
  assert.deepEqual(methods, ['HEAD', 'GET']);
});

test('checkUrl retries with GET when HEAD is refused', async () => {
  const methods = [];
  const status = await checkUrl('https://forbidden.test/', {
    fetchImpl: async (url, options) => {
      methods.push(options.method);
      return response(options.method === 'HEAD' ? 403 : 200);
    },
    sleepImpl: async () => {},
  });
  assert.equal(status, 200);
  assert.deepEqual(methods, ['HEAD', 'GET']);
});

test('checkUrl retries a network failure before succeeding', async () => {
  let calls = 0;
  const status = await checkUrl('https://flaky.test/', {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return response(200);
    },
    sleepImpl: async () => {},
  });
  assert.equal(status, 200);
  assert.equal(calls, 2);
});

test('checkUrl returns the last known status after repeated network failures', async () => {
  const status = await checkUrl('https://down.test/', {
    attempts: 2,
    fetchImpl: async () => {
      throw new Error('offline');
    },
    sleepImpl: async () => {},
  });
  assert.equal(status, 0);
});
