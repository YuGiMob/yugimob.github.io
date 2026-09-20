import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the committed data files pass the validator', () => {
  const output = execFileSync(process.execPath, [join(ROOT, 'scripts', 'validate-data.mjs')], { encoding: 'utf8' });
  assert.equal(output.trim(), 'validate: ok');
});
