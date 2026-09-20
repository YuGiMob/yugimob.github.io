import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLlmsTxt, writeLlmsFile } from '../scripts/llms-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.json'), 'utf8'));
const SHOWCASE = JSON.parse(readFileSync(join(ROOT, 'data', 'showcase.json'), 'utf8'));
const COMMITTED = readFileSync(join(ROOT, 'llms.txt'), 'utf8');

test('the committed llms.txt matches the generator output', () => {
  assert.equal(buildLlmsTxt(DATA, SHOWCASE), COMMITTED);
});

test('llms.txt opens with a title and a summary blockquote', () => {
  const lines = COMMITTED.split('\n');
  assert.equal(lines[0], '# YuGiMob');
  assert.match(lines[2], /^> \S/);
});

test('llms.txt lists every showcased tool with its install command and numbers', () => {
  const projects = new Map(DATA.projects.map((project) => [project.name, project]));
  for (const problem of SHOWCASE.problems) {
    const project = projects.get(problem.name);
    assert.ok(project, `${problem.name} is not in the manifest`);
    assert.match(COMMITTED, new RegExp(`\\[${project.name}\\]\\(${project.url}\\)`));
    if (project.npm) assert.ok(COMMITTED.includes(`npm i ${project.npm}`));
    assert.ok(COMMITTED.includes(`Stars ${project.stars.toLocaleString('en-US')}`));
  }
});

test('llms.txt carries the evidence links and the machine data links', () => {
  assert.ok(COMMITTED.includes(DATA.benchmark.source));
  assert.ok(COMMITTED.includes(DATA.benchmark.reportUrl));
  assert.ok(COMMITTED.includes(DATA.benchmark.tracesUrl));
  assert.ok(COMMITTED.includes('https://yugimob.github.io/data/site-data.json'));
  assert.ok(COMMITTED.includes('https://yugimob.github.io/data/showcase.json'));
});

test('buildLlmsTxt stays deterministic and survives an empty manifest', () => {
  const minimal = { identity: { displayName: 'Tester', tagline: 'A tagline.' }, projects: [] };
  const once = buildLlmsTxt(minimal, { intro: {}, problems: [] });
  const twice = buildLlmsTxt(minimal, { intro: {}, problems: [] });
  assert.equal(once, twice);
  assert.ok(once.startsWith('# Tester\n'));
  assert.ok(!once.includes('## Evidence'));
  assert.match(once, /## Data/);
});

test('writeLlmsFile writes once and reports no change afterwards', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yugimob-llms-'));
  try {
    mkdirSync(join(dir, 'data'), { recursive: true });
    const siteData = { identity: { displayName: 'Tester', tagline: 'A tagline.' }, projects: [] };
    const showcase = { intro: {}, problems: [] };
    writeFileSync(join(dir, 'data', 'site-data.json'), JSON.stringify(siteData));
    writeFileSync(join(dir, 'data', 'showcase.json'), JSON.stringify(showcase));
    assert.equal(writeLlmsFile(dir), true);
    const text = readFileSync(join(dir, 'llms.txt'), 'utf8');
    assert.equal(text, buildLlmsTxt(siteData, showcase));
    assert.equal(writeLlmsFile(dir), false);
    assert.equal(readFileSync(join(dir, 'llms.txt'), 'utf8'), text);
    assert.deepEqual(readdirSync(join(dir)).filter((file) => file.endsWith('.tmp')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
