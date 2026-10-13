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
      assert.equal(transcript.getAttribute('role'), 'group');
      assert.equal(transcript.getAttribute('aria-live'), null);
      const replay = findAll(controller.node, (node) => node.getAttribute?.('aria-label') === 'Replay the transcript')[0];
      assert.ok(replay, `${id} has no labelled replay button`);
    }
  });
});

test('the hashline transcript separates tool calls from file content', () => {
  withDom(() => {
    const controller = buildDemo('hashline');
    const calls = findAll(controller.node, (node) => node.classList?.contains('is-call') === true);
    const args = findAll(controller.node, (node) => node.classList?.contains('is-arg') === true);
    const files = findAll(controller.node, (node) => node.classList?.contains('is-file') === true);
    const anchors = findAll(controller.node, (node) => node.classList?.contains('term-anchor') === true);
    assert.equal(calls.length, 4);
    assert.equal(args.length, 12);
    assert.equal(files.length, 11);
    assert.equal(anchors.length, files.length);
  });
});
