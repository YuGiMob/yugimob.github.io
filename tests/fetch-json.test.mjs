import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from '../assets/js/fetch-json.js';

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  };
}

function brokenResponse(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
  };
}

function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test('fetchJson returns the parsed body on the first success', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return jsonResponse({ ok: true });
  }, async () => {
    assert.deepEqual(await fetchJson('data/x.json', 2, 0), { ok: true });
    assert.equal(calls, 1);
  });
});

test('fetchJson retries a server error and then succeeds', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return calls === 1 ? jsonResponse(null, 503) : jsonResponse({ ok: true });
  }, async () => {
    assert.deepEqual(await fetchJson('data/x.json', 2, 0), { ok: true });
    assert.equal(calls, 2);
  });
});

test('fetchJson retries a malformed body and gives up after the attempts run out', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return brokenResponse();
  }, async () => {
    await assert.rejects(() => fetchJson('data/x.json', 3, 0), /Unexpected token/);
    assert.equal(calls, 3);
  });
});

test('fetchJson does not retry a client error', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return jsonResponse(null, 404);
  }, async () => {
    await assert.rejects(() => fetchJson('data/x.json', 3, 0), /data\/x\.json: 404/);
    assert.equal(calls, 1);
  });
});

test('fetchJson retries a throttled response', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return calls === 1 ? jsonResponse(null, 429) : jsonResponse({ ok: true });
  }, async () => {
    assert.deepEqual(await fetchJson('data/x.json', 2, 0), { ok: true });
    assert.equal(calls, 2);
  });
});

test('fetchJson surfaces a network failure after the attempts run out', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    throw new TypeError('fetch failed');
  }, async () => {
    await assert.rejects(() => fetchJson('data/x.json', 2, 0), /fetch failed/);
    assert.equal(calls, 2);
  });
});

test('fetchJson waits between retries when a delay is set', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return calls === 1 ? jsonResponse(null, 503) : jsonResponse({ ok: true });
  }, async () => {
    const started = Date.now();
    assert.deepEqual(await fetchJson('data/x.json', 2, 5), { ok: true });
    assert.equal(calls, 2);
    assert.ok(Date.now() - started >= 4);
  });
});

test('fetchJson reports the URL when no attempt is made', async () => {
  await withFetch(async () => {
    throw new Error('should not be called');
  }, async () => {
    await assert.rejects(() => fetchJson('data/missing.json', 0), /data\/missing\.json/);
  });
});
