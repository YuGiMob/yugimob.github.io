import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemo, DEMO_IDS } from '../assets/js/demos.js';
import { findAll, withDom } from './dom.mjs';

test('every registered demo builds a controller with a node and a start and stop pair', () => {
  for (const id of DEMO_IDS) {
    withDom(() => {
      const controller = buildDemo(id);
      assert.ok(controller, `${id} built nothing`);
      assert.ok(controller.node, `${id} has no node`);
      assert.equal(typeof controller.start, 'function');
      assert.equal(typeof controller.stop, 'function');
      controller.start();
      controller.stop();
    });
  }
});

test('an unknown demo id builds nothing', () => {
  withDom(() => assert.equal(buildDemo('nope'), null));
});

test('transcript demos expose a labelled transcript and a labelled replay button', () => {
  withDom(() => {
    for (const id of ['hashline', 'git']) {
      const controller = buildDemo(id);
      const transcript = findAll(controller.node, (node) => node.getAttribute?.('aria-label') === 'Transcript')[0];
      assert.ok(transcript, `${id} has no labelled transcript`);
      assert.equal(transcript.getAttribute('role'), id === 'hashline' ? 'tabpanel' : 'group');
      assert.equal(transcript.getAttribute('aria-live'), null);
      const replay = findAll(controller.node, (node) => node.getAttribute?.('aria-label') === 'Replay the transcript')[0];
      assert.ok(replay, `${id} has no labelled replay button`);
    }
  });
});

test('the hashline console selects a tool and renders its edit transcript', () => {
  withDom(() => {
    const controller = buildDemo('hashline');
    const tabs = findAll(controller.node, (node) => node.getAttribute?.('role') === 'tab');
    assert.equal(tabs.length, 8);
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
    assert.equal(tabs[0].tabIndex, 0);
    assert.equal(findAll(controller.node, (node) => node.getAttribute?.('role') === 'tabpanel').length, 1);
    assert.ok(findAll(controller.node, (node) => node.classList?.contains('is-call') === true).length > 0);

    const grep = tabs.find((tab) => tab.textContent === 'grep');
    grep.dispatch('click');
    assert.equal(grep.getAttribute('aria-selected'), 'true');
    assert.equal(tabs[0].getAttribute('aria-selected'), 'false');
    assert.equal(findAll(controller.node, (node) => node.classList?.contains('term-gutter') === true).length, 2);
    assert.equal(findAll(controller.node, (node) => node.classList?.contains('is-ok') === true).length, 2);

    const undo = tabs.find((tab) => tab.textContent === 'undo_last_change');
    undo.dispatch('click');
    assert.equal(findAll(controller.node, (node) => node.classList?.contains('term-gutter') === true).length, 0);
    assert.equal(findAll(controller.node, (node) => node.classList?.contains('is-call') === true).length, 3);
    controller.stop();
  });
});

test('every hashline tool tab renders calls and anchored rows', () => {
  withDom(() => {
    const controller = buildDemo('hashline');
    const tabs = findAll(controller.node, (node) => node.getAttribute?.('role') === 'tab');
    for (const tab of tabs) {
      tab.dispatch('click');
      const calls = findAll(controller.node, (node) => node.classList?.contains('is-call') === true);
      const anchors = findAll(controller.node, (node) => node.classList?.contains('term-anchor') === true);
      assert.ok(calls.length > 0, `${tab.textContent} has no calls`);
      assert.ok(anchors.length > 0, `${tab.textContent} has no anchored rows`);
    }
    controller.stop();
  });
});

test('the hashline tool tabs move with the arrow keys', () => {
  withDom(() => {
    const controller = buildDemo('hashline');
    const tabs = findAll(controller.node, (node) => node.getAttribute?.('role') === 'tab');
    tabs[0].parentNode.dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
    assert.equal(tabs[1].focused, true);
    tabs[0].parentNode.dispatch('keydown', { key: 'End', preventDefault() {} });
    assert.equal(tabs[tabs.length - 1].getAttribute('aria-selected'), 'true');
    controller.stop();
  });
});

test('the tor graphs draw every relay on the circuit path', () => {
  withDom(() => {
    const controller = buildDemo('tor');
    const graphs = findAll(controller.node, (node) => node.classList?.contains('tor-svg') === true);
    assert.equal(graphs.length, 2);
    for (const graph of graphs) {
      const path = findAll(graph, (node) => node.classList?.contains('tor-circuit') === true)[0];
      const numbers = (path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      const vertices = [];
      for (let index = 0; index + 1 < numbers.length; index += 2) vertices.push(`${numbers[index]},${numbers[index + 1]}`);
      const relays = findAll(graph, (node) => node.classList?.contains('tor-node') === true);
      assert.equal(relays.length, 5);
      for (const relay of relays) {
        assert.ok(vertices.includes(`${relay.getAttribute('cx')},${relay.getAttribute('cy')}`));
      }
    }
  });
});
