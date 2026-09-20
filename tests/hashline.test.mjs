import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, readRows, replace, undo, externalEdit } from '../assets/js/hashline.js';

const SOURCE = ['alpha', 'beta', 'gamma', 'delta'];

function seededRandom() {
  let state = 123456789;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function session() {
  return createSession(SOURCE, seededRandom());
}

const sortedEntries = (map) => [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));

test('createSession assigns a unique four-letter anchor to every line', () => {
  const current = session();
  assert.deepEqual(current.lines.map((line) => line.text), SOURCE);
  for (const line of current.lines) assert.match(line.anchor, /^[A-Za-z]{4}$/);
  assert.equal(new Set(current.lines.map((line) => line.anchor)).size, SOURCE.length);
});

test('anchor allocation stays unique across a large file', () => {
  const lines = Array.from({ length: 2000 }, (unused, index) => `line ${index}`);
  const current = createSession(lines);
  assert.equal(new Set(current.lines.map((line) => line.anchor)).size, lines.length);
});

test('an injected random source makes anchors deterministic', () => {
  const one = session();
  const two = session();
  assert.deepEqual(one.lines.map((line) => line.anchor), two.lines.map((line) => line.anchor));
});

test('readRows serves every line as an owned context row', () => {
  const current = session();
  const rows = readRows(current);
  assert.deepEqual(rows.map((row) => row.text), SOURCE);
  for (const row of rows) {
    assert.equal(row.kind, 'context');
    assert.equal(current.served.get(row.anchor), row.text);
  }
});

test('replace swaps one anchored line and mints a fresh anchor for it', () => {
  const current = session();
  const before = current.lines.map((line) => line.anchor);
  const target = current.lines[1];
  const result = replace(current, { remove_from: target.anchor, replacement_lines: ['beta!'] });
  assert.equal(result.ok, true);
  assert.equal(result.code, null);
  assert.equal(current.lines[1].text, 'beta!');
  assert.notEqual(current.lines[1].anchor, target.anchor);
  assert.equal(current.lines[0].anchor, before[0]);
  assert.equal(current.lines[2].anchor, before[2]);
  assert.equal(current.anchors.has(target.anchor), false);
  assert.equal(current.served.has(target.anchor), false);
  const added = result.rows.filter((row) => row.kind === 'added');
  assert.deepEqual(added.map((row) => row.text), ['beta!']);
});

test('replace can span a range and insert several lines', () => {
  const current = session();
  const result = replace(current, {
    remove_from: current.lines[1].anchor,
    remove_to: current.lines[2].anchor,
    replacement_lines: ['x', 'y', 'z'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), ['alpha', 'x', 'y', 'z', 'delta']);
});

test('an unknown anchor is refused with E_STALE_ANCHOR', () => {
  const current = session();
  const result = replace(current, { remove_from: 'zzzz', replacement_lines: ['x'] });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'E_STALE_ANCHOR');
  assert.match(result.message, /^\[E_STALE_ANCHOR\]/);
});

test('a drifted line is refused and re-served, then the same request lands', () => {
  const current = session();
  const target = current.lines[2];
  externalEdit(current, target.anchor, 'gamma drifted');
  const refused = replace(current, { remove_from: target.anchor, replacement_lines: ['gamma!'] });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'E_RANGE_STALE');
  assert.ok(refused.rows.some((row) => row.kind === 'context' && row.anchor === target.anchor && row.text === 'gamma drifted'));
  const retried = replace(current, { remove_from: target.anchor, replacement_lines: ['gamma!'] });
  assert.equal(retried.ok, true);
  assert.equal(current.lines[2].text, 'gamma!');
});

test('a NUL byte in the replacement is refused with E_BAD_SHAPE', () => {
  const current = session();
  const result = replace(current, { remove_from: current.lines[0].anchor, replacement_lines: ['bad\u0000shape'] });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'E_BAD_SHAPE');
});

test('reversed anchors are normalized to a forward range', () => {
  const current = session();
  const result = replace(current, {
    remove_from: current.lines[3].anchor,
    remove_to: current.lines[1].anchor,
    replacement_lines: ['one'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), ['alpha', 'one']);
});

test('undo restores lines, anchors, and the served record', () => {
  const current = session();
  const before = current.lines.map((line) => ({ anchor: line.anchor, text: line.text }));
  const servedBefore = new Map(current.served);
  replace(current, { remove_from: current.lines[1].anchor, replacement_lines: ['beta!'] });
  const result = undo(current);
  assert.equal(result.ok, true);
  assert.deepEqual(current.lines.map((line) => ({ anchor: line.anchor, text: line.text })), before);
  assert.deepEqual(sortedEntries(current.served), sortedEntries(servedBefore));
  const again = undo(current);
  assert.equal(again.ok, false);
  assert.equal(again.code, 'E_NOTHING_TO_UNDO');
});

test('a refused edit leaves the undo record from the last replace intact', () => {
  const current = session();
  replace(current, { remove_from: current.lines[0].anchor, replacement_lines: ['alpha!'] });
  externalEdit(current, current.lines[2].anchor, 'gamma drifted');
  const refused = replace(current, { remove_from: current.lines[2].anchor, replacement_lines: ['gamma!'] });
  assert.equal(refused.ok, false);
  const restored = undo(current);
  assert.equal(restored.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), SOURCE);
});

test('an empty remove_to falls back to remove_from', () => {
  const current = session();
  const result = replace(current, { remove_from: current.lines[1].anchor, remove_to: '', replacement_lines: ['beta!'] });
  assert.equal(result.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), ['alpha', 'beta!', 'gamma', 'delta']);
});
