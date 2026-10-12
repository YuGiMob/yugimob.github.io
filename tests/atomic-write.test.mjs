import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from '../scripts/atomic-write.mjs';

function withTemp(run) {
  const directory = mkdtempSync(join(tmpdir(), 'yugimob-atomic-'));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('writeFileAtomic replaces the target and leaves no temp file behind', () => {
  withTemp((directory) => {
    const target = join(directory, 'file.txt');
    writeFileSync(target, 'old\n');
    writeFileAtomic(target, 'new\n');
    assert.equal(readFileSync(target, 'utf8'), 'new\n');
    assert.deepEqual(readdirSync(directory), ['file.txt']);
  });
});

test('writeFileAtomic hands the temp file to the validator before the rename', () => {
  withTemp((directory) => {
    const target = join(directory, 'file.txt');
    writeFileSync(target, 'old\n');
    assert.throws(() => writeFileAtomic(target, 'new\n', (candidate) => {
      assert.equal(readFileSync(candidate, 'utf8'), 'new\n');
      throw new Error('refused');
    }), /refused/);
    assert.equal(readFileSync(target, 'utf8'), 'old\n');
    assert.deepEqual(readdirSync(directory), ['file.txt']);
  });
});

test('writeFileAtomic cleans up when the write itself fails', () => {
  withTemp((directory) => {
    const target = join(directory, 'missing', 'file.txt');
    assert.throws(() => writeFileAtomic(target, 'new\n'));
    assert.deepEqual(readdirSync(directory), []);
  });
});
