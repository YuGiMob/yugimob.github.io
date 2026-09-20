import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function filesIn(relativeDir, suffix) {
  return readdirSync(join(ROOT, relativeDir))
    .filter((file) => file.endsWith(suffix))
    .sort()
    .map((file) => join(relativeDir, file));
}

const files = [
  ...filesIn(join('assets', 'js'), '.js'),
  ...filesIn('scripts', '.mjs'),
  ...filesIn('tests', '.mjs'),
];

test('every script parses', async () => {
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        await run(process.execPath, ['--check', join(ROOT, file)], { stdio: 'pipe' });
        return null;
      } catch (error) {
        return `${file}: ${error.stderr?.trim() || error.message}`;
      }
    }),
  );
  assert.deepEqual(results.filter(Boolean), []);
});
