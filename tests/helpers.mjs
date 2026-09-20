import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function withRepoCopy(run, mutate) {
  const directory = mkdtempSync(join(tmpdir(), 'yugimob-repo-'));
  try {
    const copy = join(directory, 'repo');
    cpSync(ROOT, copy, {
      recursive: true,
      filter: (source) => !['.git', '.omo'].includes(basename(source)),
    });
    if (mutate) mutate(copy);
    return run(copy);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
