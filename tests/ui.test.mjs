import test from 'node:test';
import assert from 'node:assert/strict';
import {
  animateValue,
  announce,
  append,
  copyButton,
  copyText,
  copyWithFeedback,
  createController,
  createRuntime,
  el,
  extent,
  formatNumber,
  link,
  observeVisibility,
  reducedMotion,
  setMeta,
  setText,
  timeNode,
  svg,
  typeText,
} from '../assets/js/ui.js';
import { element, register, registerQuery, withDom } from './dom.mjs';

test('formatNumber groups thousands', () => {
  assert.equal(formatNumber(1234567), '1,234,567');
  assert.equal(formatNumber(0), '0');
});

test('formatNumber falls back to zero for unusable values', () => {
  assert.equal(formatNumber(NaN), '0');
  assert.equal(formatNumber(Infinity), '0');
  assert.equal(formatNumber(undefined), '0');
  assert.equal(formatNumber('12'), '0');
});

test('extent returns the low and high values of a series', () => {
  assert.deepEqual(extent([3, 1, 2]), [1, 3]);
  assert.deepEqual(extent([5]), [5, 5]);
  assert.deepEqual(extent([]), [0, 0]);
});

test('createRuntime keeps one animation loop and stops after clear', () => {
  withDom((dom) => {
    const runtime = createRuntime();
    let frames = 0;
    runtime.frame(() => { frames += 1; });
    runtime.frame(() => { frames += 1; });
    assert.equal(dom.pendingFrames(), 1);
    assert.equal(dom.runFrame(), true);
    assert.equal(frames, 1);
    assert.equal(dom.pendingFrames(), 1);
    runtime.clear();
    assert.equal(dom.pendingFrames(), 0);
    runtime.reset();
    runtime.frame(() => { frames += 1; });
    assert.equal(dom.runFrame(), true);
    assert.equal(frames, 2);
    runtime.clear();
  });
});

test('createRuntime stops the loop when the callback clears it', () => {
  withDom((dom) => {
    const runtime = createRuntime();
    let frames = 0;
    runtime.frame(() => {
      frames += 1;
      runtime.clear();
    });
    assert.equal(dom.runFrame(), true);
    assert.equal(frames, 1);
    assert.equal(dom.pendingFrames(), 0);
  });
});

test('createRuntime drops queued timeouts after clear', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  withDom(() => {
    const runtime = createRuntime();
    let ticks = 0;
    runtime.after(() => { ticks += 1; }, 10);
    runtime.clear();
    t.mock.timers.tick(50);
    assert.equal(ticks, 0);
    runtime.reset();
    runtime.after(() => { ticks += 1; }, 10);
    t.mock.timers.tick(10);
    assert.equal(ticks, 1);
  });
});

test('createRuntime stops a frame that was already queued when cleared', () => {
  withDom((dom) => {
    const runtime = createRuntime();
    let frames = 0;
    runtime.frame(() => { frames += 1; });
    runtime.clear();
    assert.equal(dom.runFrame(), true);
    assert.equal(frames, 0);
  }, { cancelAnimationFrame: () => {} });
});

test('createController stops and destroys only once', () => {
  withDom(() => {
    let starts = 0;
    let teardowns = 0;
    const controller = createController(el('div'), () => { starts += 1; }, () => { teardowns += 1; });
    controller.start();
    controller.start();
    assert.equal(starts, 1);
    controller.stop();
    controller.stop();
    assert.equal(teardowns, 1);
    controller.destroy();
    assert.equal(teardowns, 1);
  });
});

test('el, append, and link build nodes with classes, text, and safe link attributes', () => {
  withDom(() => {
    const node = el('p', 'intro-paragraph', 'hello');
    assert.equal(node.tagName, 'P');
    assert.equal(node.className, 'intro-paragraph');
    assert.equal(node.textContent, 'hello');

    const parent = el('div');
    append(parent, node, null, undefined, 0, ' tail');
    assert.equal(parent.childNodes.length, 3);
    assert.equal(parent.textContent, 'hello0 tail');

    const anchor = link('https://example.com', 'Example', 'action-link');
    assert.equal(anchor.tagName, 'A');
    assert.equal(anchor.getAttribute('href'), 'https://example.com');
    assert.equal(anchor.getAttribute('target'), '_blank');
    assert.equal(anchor.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(anchor.textContent, 'Example');
    assert.equal(anchor.className, 'action-link');
  });
});

test('timeNode marks up a machine-readable date', () => {
  withDom(() => {
    const node = timeNode('2026-09-20');
    assert.equal(node.tagName, 'TIME');
    assert.equal(node.getAttribute('datetime'), '2026-09-20');
    assert.equal(node.textContent, '2026-09-20');
    const labelled = timeNode('2026-09-20T12:03:04Z', '20 Sep');
    assert.equal(labelled.getAttribute('datetime'), '2026-09-20T12:03:04Z');
    assert.equal(labelled.textContent, '20 Sep');
  });
});

test('setText and setMeta write to registered targets and ignore missing ones', () => {
  withDom((dom) => {
    const heading = register(dom.document, 'intro-headline', el('span'));
    setText('intro-headline', 'A new headline');
    assert.equal(heading.textContent, 'A new headline');
    setText('intro-headline', '');
    assert.equal(heading.textContent, '');
    setText('intro-headline', undefined);
    assert.equal(heading.textContent, '');
    setText('missing-id', 'ignored');

    const meta = registerQuery(dom.document, 'meta[name="description"]', el('meta'));
    setMeta('meta[name="description"]', 'A description');
    assert.equal(meta.getAttribute('content'), 'A description');
    setMeta('meta[name="description"]', null);
    assert.equal(meta.getAttribute('content'), 'A description');
    setMeta('meta[name="none"]', 'ignored');
  });
});

test('observeVisibility forwards intersection changes to the callbacks', () => {
  let shown = 0;
  let hidden = 0;
  withDom((dom) => {
    const observer = observeVisibility(element(), () => { shown += 1; }, () => { hidden += 1; });
    assert.equal(dom.observers.at(-1), observer);
    observer.trigger([{ isIntersecting: true }, { isIntersecting: false }]);
    assert.equal(shown, 1);
    assert.equal(hidden, 1);
  });
});

test('observeVisibility shows immediately without an IntersectionObserver', () => {
  let shown = 0;
  withDom(() => {
    const observer = observeVisibility(element(), () => { shown += 1; });
    assert.equal(observer, null);
    assert.equal(shown, 1);
  }, { IntersectionObserver: undefined });
});

test('svg builds namespaced nodes with attributes', () => {
  withDom(() => {
    const node = svg('rect', { x: '1', class: 'activity-bar' });
    assert.equal(node.tagName, 'RECT');
    assert.equal(node.namespaceURI, 'http://www.w3.org/2000/svg');
    assert.equal(node.getAttribute('x'), '1');
    assert.equal(node.getAttribute('class'), 'activity-bar');
  });
});

test('announce ignores a page without a live region', () => {
  withDom(() => announce('ignored'));
});

test('announce replaces the region text after the delay', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  withDom((dom) => {
    const region = register(dom.document, 'live-region', el('div'));
    announce('first');
    announce('second');
    assert.equal(region.textContent, '');
    t.mock.timers.tick(40);
    assert.equal(region.textContent, 'second');
  });
});

test('reducedMotion follows matchMedia and defaults without it', () => {
  assert.equal(reducedMotion(), false);
  withDom(() => assert.equal(reducedMotion(), false));
  withDom(() => assert.equal(reducedMotion(), true), { matchMedia: () => ({ matches: true }) });
});

test('copyText prefers the clipboard API', async () => {
  let written = null;
  await withDom(async () => {
    await copyText('clipboard value');
  }, { navigator: { clipboard: { writeText: async (value) => { written = value; } } } });
  assert.equal(written, 'clipboard value');
});

test('copyText falls back to execCommand and rejects when it fails', async () => {
  await withDom(async (dom) => {
    await copyText('value');
    assert.deepEqual(dom.document.execCommandCalls, ['copy']);
    assert.equal(dom.document.body.childNodes.length, 0);

    dom.document.execCommandResult = false;
    await assert.rejects(() => copyText('value'), /copy failed/);
  });
});

test('copyButton reports the outcome and resets the label', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withDom(async (dom) => {
    register(dom.document, 'live-region', el('div'));
    const button = copyButton('copy', 'the value', 'copy the value');
    assert.equal(button.getAttribute('aria-label'), 'copy the value');

    await button.dispatch('click')[0];
    assert.equal(button.textContent, 'copied');
    assert.equal(button.classList.contains('is-copied'), true);
    t.mock.timers.tick(1500);
    assert.equal(button.textContent, 'copy');
    assert.equal(button.classList.contains('is-copied'), false);

    dom.document.execCommandResult = false;
    await button.dispatch('click')[0];
    assert.equal(button.textContent, 'copy failed');
    assert.equal(button.classList.contains('is-failed'), true);
    t.mock.timers.tick(1500);
    assert.equal(button.textContent, 'copy');
  });
});

test('copyWithFeedback reports a failure when the value producer throws', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withDom(async (dom) => {
    register(dom.document, 'live-region', el('div'));
    const button = el('button');
    button.textContent = 'copy link';
    copyWithFeedback(button, () => {
      throw new Error('no value');
    }, { label: 'copy link', announceFailed: 'copy failed for the link' });
    await button.dispatch('click')[0];
    assert.equal(button.textContent, 'copy failed');
    assert.equal(button.classList.contains('is-failed'), true);
    t.mock.timers.tick(1500);
    assert.equal(button.textContent, 'copy link');
  });
});

test('typeText writes one character per tick and honours instant mode', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  withDom(() => {
    const runtime = createRuntime();
    const node = el('code');
    let done = false;
    typeText(node, 'abc', runtime, { speed: 5, onDone: () => { done = true; } });
    assert.equal(node.textContent, '');
    t.mock.timers.tick(5);
    assert.equal(node.textContent, 'a');
    t.mock.timers.tick(5);
    assert.equal(node.textContent, 'ab');
    t.mock.timers.tick(5);
    assert.equal(node.textContent, 'abc');
    assert.equal(done, true);

    const instant = el('code');
    typeText(instant, 'abc', runtime, { instant: true, onDone: () => { done = true; } });
    assert.equal(instant.textContent, 'abc');
  });
});

test('animateValue animates with frames and snaps for reduced motion', () => {
  withDom((dom) => {
    const node = el('dd');
    animateValue(node, 1000, (value) => `#${value}`, 100);
    assert.equal(node.textContent, '');
    dom.runFrame(0);
    assert.equal(node.textContent, '#0');
    dom.runFrame(100);
    assert.equal(node.textContent, '#1000');
  });
  withDom(() => {
    const node = el('dd');
    animateValue(node, 42, String);
    assert.equal(node.textContent, '42');
  }, { matchMedia: () => ({ matches: true }) });
});
