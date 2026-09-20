import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.json'), 'utf8'));
const SHOWCASE = JSON.parse(readFileSync(join(ROOT, 'data', 'showcase.json'), 'utf8'));

function runValidator(data, showcase) {
  const dir = mkdtempSync(join(tmpdir(), 'yugimob-validate-'));
  try {
    const dataPath = join(dir, 'site-data.json');
    const showcasePath = join(dir, 'showcase.json');
    writeFileSync(dataPath, JSON.stringify(data, null, 2));
    writeFileSync(showcasePath, JSON.stringify(showcase, null, 2));
    return spawnSync(process.execPath, [join(ROOT, 'scripts', 'validate-data.mjs'), dataPath, showcasePath], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the committed data files pass the validator', () => {
  const output = execFileSync(process.execPath, [join(ROOT, 'scripts', 'validate-data.mjs')], { encoding: 'utf8' });
  assert.equal(output.trim(), 'validate: ok');
});

test('the committed site structure passes the validator', () => {
  const output = execFileSync(process.execPath, [join(ROOT, 'scripts', 'validate-site.mjs')], { encoding: 'utf8' });
  assert.equal(output.trim(), 'validate:site: ok');
});

test('the validator refuses an unknown demo id', () => {
  const showcase = structuredClone(SHOWCASE);
  showcase.problems[0].demo = 'not-a-demo';
  const result = runValidator(DATA, showcase);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /demo unknown: not-a-demo/);
});

test('the validator refuses a showcase name missing from the manifest', () => {
  const showcase = structuredClone(SHOWCASE);
  showcase.problems[0].name = 'ghost-tool';
  const result = runValidator(DATA, showcase);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /showcase problem missing from site-data: ghost-tool/);
});

test('the validator reports every failure in one run', () => {
  const showcase = structuredClone(SHOWCASE);
  showcase.problems[0].demo = 'not-a-demo';
  showcase.evidence.benchmark.contenderCount = 9;
  const result = runValidator(DATA, showcase);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /demo unknown: not-a-demo/);
  assert.match(result.stderr, /contenderCount does not match contenders/);
});

test('the validator refuses unsorted history dates', () => {
  const data = structuredClone(DATA);
  data.history[1].date = data.history[0].date;
  const result = runValidator(data, SHOWCASE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /history dates must be unique and sorted/);
});

test('the validator refuses non-object documents instead of accepting them', () => {
  const nullData = runValidator(null, SHOWCASE);
  assert.equal(nullData.status, 1);
  assert.match(nullData.stderr, /site-data invalid/);
  const primitiveData = runValidator(5, SHOWCASE);
  assert.equal(primitiveData.status, 1);
  assert.match(primitiveData.stderr, /site-data invalid/);
  const nullShowcase = runValidator(DATA, null);
  assert.equal(nullShowcase.status, 1);
  assert.match(nullShowcase.stderr, /showcase invalid/);
});

test('a broken manifest does not cascade invented showcase failures', () => {
  const data = structuredClone(DATA);
  delete data.projects;
  const result = runValidator(data, SHOWCASE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing projects/);
  assert.doesNotMatch(result.stderr, /showcase problem missing from site-data/);
});

test('cross-references use declared names when a project entry is invalid', () => {
  const data = structuredClone(DATA);
  data.projects[0].url = 'not a uri';
  const result = runValidator(data, SHOWCASE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /url invalid/);
  assert.doesNotMatch(result.stderr, /showcase problem missing from site-data: pi-hashline-edit-pro/);
});
