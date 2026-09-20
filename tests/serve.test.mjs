import test from 'node:test';
import assert from 'node:assert/strict';
import { contentType, createStaticServer, resolveTarget } from '../scripts/serve.mjs';
import { ROOT } from './helpers.mjs';

test('contentType maps the extensions the site serves', () => {
  assert.equal(contentType('index.html'), 'text/html; charset=utf-8');
  assert.equal(contentType('assets/js/main.js'), 'text/javascript; charset=utf-8');
  assert.equal(contentType('data/site-data.json'), 'application/json; charset=utf-8');
  assert.equal(contentType('assets/fonts/inter.woff2'), 'font/woff2');
  assert.equal(contentType('probe.unknownext'), 'application/octet-stream');
});

test('resolveTarget clamps dot segments to the root and refuses unusable paths', () => {
  assert.match(resolveTarget(ROOT, '/package.json'), /package\.json$/);
  assert.match(resolveTarget(ROOT, '/'), /index\.html$/);
  assert.equal(resolveTarget(ROOT, '/..%2fpackage.json'), resolveTarget(ROOT, '/package.json'));
  assert.equal(resolveTarget(ROOT, '/missing-file.txt'), null);
  assert.equal(resolveTarget(ROOT, '/%'), null);
  assert.equal(resolveTarget(ROOT, '/%zz'), null);
});

test('the static server serves a file and falls back to the 404 page', async () => {
  const server = createStaticServer(ROOT);
  await new Promise((done) => server.listen(0, done));
  try {
    const { port } = server.address();
    const found = await fetch(`http://127.0.0.1:${port}/package.json`);
    assert.equal(found.status, 200);
    assert.match(found.headers.get('content-type'), /application\/json/);
    assert.match(await found.text(), /yugimob-site/);

    const missing = await fetch(`http://127.0.0.1:${port}/not-a-page`);
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get('content-type'), /text\/html/);
    assert.match(await missing.text(), /404/);

    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /YuGiMob/);

    const malformed = await fetch(`http://127.0.0.1:${port}/%`);
    assert.equal(malformed.status, 404);
  } finally {
    await new Promise((done) => server.close(done));
  }
});
