import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayground } from '../assets/js/playground.js';
import { findAll, withDom } from './dom.mjs';

function nodeOf(controller, className) {
  return findAll(controller.node, (entry) => entry.classList?.contains(className) === true)[0];
}

function keydown(code, target, key, shiftKey) {
  code.dispatch('keydown', { target, key, shiftKey, preventDefault() {} });
}

test('a step link replays the run to that step', () => {
  withDom((dom) => {
    dom.window.location.search = '?step=3';
    const controller = buildPlayground();
    assert.equal(nodeOf(controller, 'pg-step').textContent, 'step 4 / 8');
    assert.equal(nodeOf(controller, 'pg-apply').textContent, 'Search for “stale”');
  });
});

test('a step link beyond the run clamps to the done state', () => {
  withDom((dom) => {
    dom.window.location.search = '?step=99';
    const controller = buildPlayground();
    assert.equal(nodeOf(controller, 'pg-step').textContent, 'done');
    assert.equal(nodeOf(controller, 'pg-apply').textContent, 'Run it again');
  });
});

test('the row list selects on Enter and extends the range with shift', () => {
  withDom(() => {
    const controller = buildPlayground();
    const code = nodeOf(controller, 'pg-code');
    keydown(code, code.childNodes[1], 'Enter', false);
    assert.equal(code.childNodes[1].getAttribute('aria-selected'), 'true');
    assert.equal(code.childNodes[2].getAttribute('aria-selected'), 'false');
    keydown(code, code.childNodes[3], 'Enter', true);
    assert.equal(code.childNodes[1].getAttribute('aria-selected'), 'true');
    assert.equal(code.childNodes[2].getAttribute('aria-selected'), 'true');
    assert.equal(code.childNodes[3].getAttribute('aria-selected'), 'true');
    assert.equal(code.childNodes[4].getAttribute('aria-selected'), 'false');
  });
});

test('arrow keys move the roving tabindex', () => {
  withDom(() => {
    const controller = buildPlayground();
    const code = nodeOf(controller, 'pg-code');
    keydown(code, code.childNodes[1], 'Enter', false);
    keydown(code, code.childNodes[1], 'ArrowDown', false);
    assert.equal(code.childNodes[1].tabIndex, -1);
    assert.equal(code.childNodes[2].tabIndex, 0);
    keydown(code, code.childNodes[2], 'Home', false);
    assert.equal(code.childNodes[0].tabIndex, 0);
  });
});

test('the run button advances the guided steps', () => {
  withDom(() => {
    const controller = buildPlayground();
    assert.equal(nodeOf(controller, 'pg-claim-title').textContent, 'Read hands out the addresses');
    nodeOf(controller, 'pg-apply').dispatch('click', {});
    assert.equal(nodeOf(controller, 'pg-claim-title').textContent, 'Replace by anchor');
    assert.equal(nodeOf(controller, 'pg-step').textContent, 'step 2 / 8');
  });
});
