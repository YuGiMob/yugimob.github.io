import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, extent, formatNumber } from '../assets/js/ui.js';

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

function withFrames(run) {
  const hadRaf = 'requestAnimationFrame' in globalThis;
  const hadCancel = 'cancelAnimationFrame' in globalThis;
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextId = 0;
  const pending = new Map();
  globalThis.requestAnimationFrame = (callback) => {
    nextId += 1;
    pending.set(nextId, callback);
    return nextId;
  };
  globalThis.cancelAnimationFrame = (id) => {
    pending.delete(id);
  };
  const runFrame = () => {
    const entry = [...pending.entries()][0];
    if (!entry) return false;
    pending.delete(entry[0]);
    entry[1](0);
    return true;
  };
  try {
    run({ pending, runFrame });
  } finally {
    if (hadRaf) globalThis.requestAnimationFrame = originalRaf;
    else delete globalThis.requestAnimationFrame;
    if (hadCancel) globalThis.cancelAnimationFrame = originalCancel;
    else delete globalThis.cancelAnimationFrame;
  }
}

test('createRuntime keeps one animation loop and stops after clear', () => {
  withFrames(({ pending, runFrame }) => {
    const runtime = createRuntime();
    let frames = 0;
    runtime.frame(() => { frames += 1; });
    runtime.frame(() => { frames += 1; });
    assert.equal(pending.size, 1);
    assert.equal(runFrame(), true);
    assert.equal(frames, 1);
    assert.equal(pending.size, 1);
    runtime.clear();
    assert.equal(pending.size, 0);
    runtime.reset();
    runtime.frame(() => { frames += 1; });
    assert.equal(runFrame(), true);
    assert.equal(frames, 2);
    runtime.clear();
  });
});

test('createRuntime stops the loop when the callback clears it', () => {
  withFrames(({ pending, runFrame }) => {
    const runtime = createRuntime();
    let frames = 0;
    runtime.frame(() => {
      frames += 1;
      runtime.clear();
    });
    assert.equal(runFrame(), true);
    assert.equal(frames, 1);
    assert.equal(pending.size, 0);
  });
});
