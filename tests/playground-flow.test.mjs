import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYGROUND_DRIFT,
  PLAYGROUND_INSERTED,
  PLAYGROUND_PATTERN,
  PLAYGROUND_REPLACEMENT,
  PLAYGROUND_SOURCE,
  PLAYGROUND_TARGET,
} from '../assets/js/playground.js';
import { seededRandom } from './helpers.mjs';
import { anchorGrep, createSession, externalEdit, insert, isStale, replace, undo } from '../assets/js/hashline.js';

function session() {
  return createSession(PLAYGROUND_SOURCE, seededRandom(987654321));
}

test('the guided run replaces, inserts, greps, refuses, retries, and undoes', () => {
  const current = session();
  const original = current.lines.map((line) => ({ anchor: line.anchor, text: line.text }));
  let targetAnchor = current.lines[PLAYGROUND_TARGET].anchor;
  const untouched = original.filter((unused, index) => index !== PLAYGROUND_TARGET).map((line) => line.anchor);

  const landed = replace(current, { remove_from: targetAnchor, replacement_lines: [PLAYGROUND_REPLACEMENT] });
  assert.equal(landed.ok, true);
  assert.equal(current.lines[PLAYGROUND_TARGET].text, PLAYGROUND_REPLACEMENT);
  assert.notEqual(current.lines[PLAYGROUND_TARGET].anchor, targetAnchor);
  for (const anchor of untouched) assert.equal(current.anchors.has(anchor), true);
  targetAnchor = current.lines[PLAYGROUND_TARGET].anchor;

  const inserted = insert(current, { anchor: targetAnchor, direction: 'after', lines: PLAYGROUND_INSERTED });
  assert.equal(inserted.ok, true);
  assert.equal(current.lines[PLAYGROUND_TARGET + 1].text, PLAYGROUND_INSERTED[0]);
  assert.equal(current.lines[PLAYGROUND_TARGET].anchor, targetAnchor);
  assert.equal(current.lines.length, PLAYGROUND_SOURCE.length + 1);

  const grep = anchorGrep(current, { pattern: PLAYGROUND_PATTERN, context: 1 });
  assert.equal(grep.ok, true);
  const match = grep.rows.find((row) => row.kind === 'match' && row.anchor === targetAnchor);
  assert.ok(match, 'the replaced row is a grep match with the anchor that read handed out');
  assert.equal(current.served.get(match.anchor), match.text);

  externalEdit(current, targetAnchor, PLAYGROUND_DRIFT);
  assert.equal(isStale(current, current.lines[PLAYGROUND_TARGET]), true);
  const refused = replace(current, { remove_from: targetAnchor, replacement_lines: [PLAYGROUND_REPLACEMENT] });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'E_RANGE_STALE');
  assert.ok(refused.rows.some((row) => row.kind === 'context' && row.text === PLAYGROUND_DRIFT));

  const retried = replace(current, { remove_from: targetAnchor, replacement_lines: [PLAYGROUND_REPLACEMENT] });
  assert.equal(retried.ok, true);
  assert.equal(current.lines[PLAYGROUND_TARGET].text, PLAYGROUND_REPLACEMENT);

  const reverted = undo(current);
  assert.equal(reverted.ok, true);
  assert.equal(current.lines[PLAYGROUND_TARGET].text, PLAYGROUND_DRIFT);
  assert.equal(current.lines[PLAYGROUND_TARGET].anchor, targetAnchor);
  assert.equal(current.lines.length, PLAYGROUND_SOURCE.length + 1);
  assert.equal(current.lines[PLAYGROUND_TARGET + 1].text, PLAYGROUND_INSERTED[0]);
  assert.equal(undo(current).code, 'E_NOTHING_TO_UNDO');
});

test('the guided run is deterministic for a seeded session', () => {
  const one = session();
  const two = session();
  assert.deepEqual(one.lines.map((line) => line.anchor), two.lines.map((line) => line.anchor));
});
