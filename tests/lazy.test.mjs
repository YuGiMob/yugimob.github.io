import test from 'node:test';
import assert from 'node:assert/strict';
import { lazyMount } from '../assets/js/lazy.js';
import { element, withDom } from './dom.mjs';

test('lazyMount mounts a synchronous controller without an IntersectionObserver', () => {
  withDom(() => {
    const container = element('div');
    const node = element('div');
    let started = 0;
    lazyMount(container, () => ({ node, caption: null, start: () => { started += 1; }, stop() {} }));
    assert.equal(container.children[0], node);
    assert.equal(container.classList.contains('is-loading'), false);
    assert.equal(started, 1);
  }, { IntersectionObserver: undefined });
});

test('lazyMount shows a failure note when a synchronous builder returns nothing', () => {
  withDom(() => {
    const container = element('div');
    lazyMount(container, () => null);
    assert.match(container.textContent, /could not be loaded from the data/);
    assert.equal(container.classList.contains('is-loading'), false);
  }, { IntersectionObserver: undefined });
});

test('lazyMount mounts an asynchronous controller once it resolves', async () => {
  await withDom(async () => {
    const container = element('div');
    const node = element('div');
    lazyMount(container, () => Promise.resolve({ node, caption: null, start() {}, stop() {} }));
    assert.equal(container.children.length, 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(container.children[0], node);
    assert.equal(container.classList.contains('is-loading'), false);
  }, { IntersectionObserver: undefined });
});

test('lazyMount shows a failure note when the loader rejects', async (t) => {
  const warn = t.mock.method(console, 'warn');
  await withDom(async () => {
    const container = element('div');
    lazyMount(container, () => Promise.reject(new Error('nope')));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(warn.mock.callCount(), 1);
    assert.match(container.textContent, /could not be loaded from the data/);
    assert.equal(container.classList.contains('is-loading'), false);
  }, { IntersectionObserver: undefined });
});

test('lazyMount shows a failure note when the loader throws', (t) => {
  const warn = t.mock.method(console, 'warn');
  withDom(() => {
    const container = element('div');
    lazyMount(container, () => {
      throw new Error('nope');
    });
    assert.equal(warn.mock.callCount(), 1);
    assert.match(container.textContent, /could not be loaded from the data/);
    assert.equal(container.classList.contains('is-loading'), false);
  }, { IntersectionObserver: undefined });
});
