import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemo, DEMO_IDS } from '../assets/js/demos.js';
import { withDom } from './dom.mjs';

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
