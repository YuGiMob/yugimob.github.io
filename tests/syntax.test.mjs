import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

for (const file of files) {
  test(`parses: ${file}`, () => {
    execFileSync(process.execPath, ['--check', join(ROOT, file)], { stdio: 'pipe' });
  });
}
