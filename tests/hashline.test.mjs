import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorGrep, createSession, insert, readRows, replace, undo, externalEdit } from '../assets/js/hashline.js';
import { seededRandom } from './helpers.mjs';

const SOURCE = ['alpha', 'beta', 'gamma', 'delta'];

function session() {
  return createSession(SOURCE, seededRandom(123456789));
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

test('insert adds lines after an anchor and keeps the anchor line', () => {
  const current = session();
  const anchor = current.lines[1].anchor;
  const result = insert(current, { anchor, direction: 'after', lines: ['beta.1', 'beta.2'] });
  assert.equal(result.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), ['alpha', 'beta', 'beta.1', 'beta.2', 'gamma', 'delta']);
  assert.equal(current.lines[1].anchor, anchor);
  assert.deepEqual(result.rows.map((row) => row.kind), ['context', 'added', 'added', 'context']);
  const added = result.rows.filter((row) => row.kind === 'added');
  assert.equal(new Set(added.map((row) => row.anchor)).size, 2);
  assert.ok(added.every((row) => current.served.get(row.anchor) === row.text));
});

test('insert before an anchor preserves the following rows', () => {
  const current = session();
  const result = insert(current, { anchor: current.lines[3].anchor, direction: 'before', lines: ['before delta'] });
  assert.equal(result.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), ['alpha', 'beta', 'gamma', 'before delta', 'delta']);
  assert.deepEqual(result.rows.map((row) => `${row.kind}:${row.text}`), ['added:before delta', 'context:delta']);
  assert.equal(new Set(result.rows.map((row) => row.anchor)).size, result.rows.length);
});

test('insert before an anchor serves the anchor and the following line once', () => {
  const current = session();
  const anchor = current.lines[1].anchor;
  const result = insert(current, { anchor, direction: 'before', lines: ['before beta'] });
  assert.deepEqual(current.lines.map((line) => line.text), ['alpha', 'before beta', 'beta', 'gamma', 'delta']);
  assert.deepEqual(result.rows.map((row) => `${row.kind}:${row.text}`), ['added:before beta', 'context:beta', 'context:gamma']);
  assert.equal(new Set(result.rows.map((row) => row.anchor)).size, result.rows.length);
});

test('insert at the end of the file omits the trailing context row', () => {
  const current = session();
  const result = insert(current, { anchor: current.lines[3].anchor, direction: 'after', lines: ['tail'] });
  assert.deepEqual(result.rows.map((row) => row.kind), ['context', 'added']);
});

test('insert refuses an unknown anchor and a drifted anchor', () => {
  const unknown = session();
  assert.equal(insert(unknown, { anchor: 'zzzz', lines: ['x'] }).code, 'E_STALE_ANCHOR');
  const drifted = session();
  const anchor = drifted.lines[2].anchor;
  externalEdit(drifted, anchor, 'gamma drifted');
  const refused = insert(drifted, { anchor, direction: 'after', lines: ['x'] });
  assert.equal(refused.code, 'E_RANGE_STALE');
  assert.ok(refused.rows.some((row) => row.kind === 'context' && row.text === 'gamma drifted'));
});

test('insert with no lines is a noop and refuses a NUL byte', () => {
  const current = session();
  const noop = insert(current, { anchor: current.lines[0].anchor, lines: [] });
  assert.equal(noop.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), SOURCE);
  const bad = insert(current, { anchor: current.lines[0].anchor, lines: ['bad\u0000shape'] });
  assert.equal(bad.code, 'E_BAD_SHAPE');
});

test('undo reverts an insert and restores the previous anchors', () => {
  const current = session();
  const before = current.lines.map((line) => ({ anchor: line.anchor, text: line.text }));
  insert(current, { anchor: current.lines[0].anchor, direction: 'after', lines: ['inserted'] });
  assert.equal(current.lines.length, SOURCE.length + 1);
  assert.equal(undo(current).ok, true);
  assert.deepEqual(current.lines.map((line) => ({ anchor: line.anchor, text: line.text })), before);
});

test('anchorGrep returns matches and context with owned anchors', () => {
  const current = session();
  const result = anchorGrep(current, { pattern: 'a', context: 1 });
  assert.equal(result.ok, true);
  assert.match(result.message, /anchor_grep\('a'\): [1-9]/);
  const matches = result.rows.filter((row) => row.kind === 'match');
  assert.ok(matches.length >= 3);
  for (const row of result.rows) assert.equal(current.served.get(row.anchor), row.text);
  assert.equal(result.rows[0].line, 1);
});

test('anchorGrep supports literal and ignoreCase searches', () => {
  const current = session();
  const literal = anchorGrep(current, { pattern: 'DELTA', literal: true, ignoreCase: true });
  assert.equal(literal.rows.filter((row) => row.kind === 'match').length, 1);
  const caseSensitive = anchorGrep(current, { pattern: 'DELTA', literal: true });
  assert.equal(caseSensitive.rows.length, 0);
});

test('anchorGrep refuses an empty or invalid pattern', () => {
  const current = session();
  assert.equal(anchorGrep(current, { pattern: '' }).code, 'E_BAD_SHAPE');
  assert.equal(anchorGrep(current, { pattern: '(' }).code, 'E_BAD_SHAPE');
});

test('a grep match can be edited without a re-read', () => {
  const current = session();
  const result = anchorGrep(current, { pattern: 'gamma' });
  const match = result.rows.find((row) => row.kind === 'match');
  const edited = replace(current, { remove_from: match.anchor, replacement_lines: ['gamma!'] });
  assert.equal(edited.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), ['alpha', 'beta', 'gamma!', 'delta']);
});

test('replace refuses a replacement_lines value that is not an array', () => {
  const current = session();
  const before = current.lines.map((line) => ({ anchor: line.anchor, text: line.text }));
  const refused = replace(current, { remove_from: current.lines[1].anchor, replacement_lines: 'beta!' });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'E_BAD_SHAPE');
  assert.match(refused.message, /^\[E_BAD_SHAPE\]/);
  assert.deepEqual(current.lines.map((line) => ({ anchor: line.anchor, text: line.text })), before);
});

test('replace still allows an explicit empty replacement to delete a range', () => {
  const current = session();
  const result = replace(current, { remove_from: current.lines[1].anchor, replacement_lines: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), ['alpha', 'gamma', 'delta']);
});

test('insert refuses an unknown direction and a non-array lines value', () => {
  const current = session();
  const before = current.lines.map((line) => ({ anchor: line.anchor, text: line.text }));
  const badDirection = insert(current, { anchor: current.lines[1].anchor, direction: 'middle', lines: ['x'] });
  assert.equal(badDirection.code, 'E_BAD_SHAPE');
  const badLines = insert(current, { anchor: current.lines[1].anchor, direction: 'after', lines: 'x' });
  assert.equal(badLines.code, 'E_BAD_SHAPE');
  assert.deepEqual(current.lines.map((line) => ({ anchor: line.anchor, text: line.text })), before);
});

test('insert still defaults an omitted direction to after', () => {
  const current = session();
  const result = insert(current, { anchor: current.lines[0].anchor, lines: ['tail'] });
  assert.equal(result.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), ['alpha', 'tail', 'beta', 'gamma', 'delta']);
});

test('anchorGrep refuses non-integer context, limit, and non-boolean flags', () => {
  const current = session();
  assert.equal(anchorGrep(current, { pattern: 'a', context: '1' }).code, 'E_BAD_SHAPE');
  assert.equal(anchorGrep(current, { pattern: 'a', limit: 1.5 }).code, 'E_BAD_SHAPE');
  assert.equal(anchorGrep(current, { pattern: 'a', literal: 'yes' }).code, 'E_BAD_SHAPE');
  assert.equal(anchorGrep(current, { pattern: 'a', ignoreCase: 1 }).code, 'E_BAD_SHAPE');
  assert.equal(anchorGrep(current, { pattern: 'a', context: 1, limit: 2 }).ok, true);
});

test('optional request values may be null and fall back to their defaults', () => {
  const current = session();
  const deleted = replace(current, { remove_from: current.lines[1].anchor, replacement_lines: null });
  assert.equal(deleted.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), ['alpha', 'gamma', 'delta']);

  const noop = insert(current, { anchor: current.lines[0].anchor, direction: null, lines: null });
  assert.equal(noop.ok, true);
  assert.deepEqual(current.lines.map((line) => line.text), ['alpha', 'gamma', 'delta']);

  const grep = anchorGrep(current, { pattern: 'a', context: null, limit: null, literal: null, ignoreCase: null });
  assert.equal(grep.ok, true);
});

test('a refused insert re-serves the anchor range', () => {
  const current = session();
  const anchor = current.lines[1].anchor;
  const result = insert(current, { anchor, direction: 'middle', lines: ['x'] });
  assert.equal(result.code, 'E_BAD_SHAPE');
  assert.ok(result.rows.some((row) => row.kind === 'context' && row.anchor === anchor && row.text === 'beta'));
});
