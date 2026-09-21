import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAgentReadability, buildIndexMd, buildJsonFeed, buildLlmsTxt, writeAgentFiles, writeLlmsFile } from '../scripts/llms-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.json'), 'utf8'));
const SHOWCASE = JSON.parse(readFileSync(join(ROOT, 'data', 'showcase.json'), 'utf8'));
const COMMITTED = readFileSync(join(ROOT, 'llms.txt'), 'utf8');
const COMMITTED_INDEX = readFileSync(join(ROOT, 'index.md'), 'utf8');
const COMMITTED_READABILITY = readFileSync(join(ROOT, 'agent-readability.json'), 'utf8');
const COMMITTED_FEED = readFileSync(join(ROOT, 'feed.json'), 'utf8');

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
    if (project.npm) assert.ok(COMMITTED.includes(`pi install npm:${project.npm}`));
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

test('the committed index.md matches the generator output', () => {
  assert.equal(buildIndexMd(DATA, SHOWCASE), COMMITTED_INDEX);
});

test('index.md opens with the title and covers every showcased tool', () => {
  assert.equal(COMMITTED_INDEX.split('\n')[0], '# YuGiMob');
  for (const problem of SHOWCASE.problems) {
    assert.ok(COMMITTED_INDEX.includes(problem.headline), `${problem.name} headline is missing`);
  }
  assert.match(COMMITTED_INDEX, /## Evidence/);
  assert.match(COMMITTED_INDEX, /## Principles/);
  assert.match(COMMITTED_INDEX, /## Data/);
});

test('llms.txt follows the v2 section and link shape', () => {
  const lines = COMMITTED.split('\n');
  assert.ok(lines.some((line) => line.startsWith('## ')));
  for (const line of lines) {
    if (line.startsWith('- [')) assert.match(line, /^- \[[^\]]+\]\(https:\/\/\S+\)(?:[:\s].*)?$/);
  }
});

test('the committed agent-readability.json matches the generator output', () => {
  assert.equal(buildAgentReadability(DATA), COMMITTED_READABILITY);
  const manifest = JSON.parse(COMMITTED_READABILITY);
  assert.equal(manifest.name, DATA.identity.displayName);
  assert.equal(manifest.artifacts.llmsTxt, 'https://yugimob.github.io/llms.txt');
  assert.equal(manifest.artifacts.markdown, 'https://yugimob.github.io/index.md');
});

test('the committed feed.json matches the generator output', () => {
  assert.equal(buildJsonFeed(DATA), COMMITTED_FEED);
  const feed = JSON.parse(COMMITTED_FEED);
  assert.equal(feed.version, 'https://jsonfeed.org/version/1.1');
  assert.equal(feed.favicon, 'https://yugimob.github.io/assets/favicon.svg');
  assert.equal(feed.feed_url, 'https://yugimob.github.io/feed.json');
  assert.equal(feed.items.length, DATA.history.length + DATA.benchmarkHistory.length);
  assert.match(feed.items[0].content_text, /hashline-edit-pro/);
  assert.equal(new Set(feed.items.map((item) => item.id)).size, feed.items.length);
});

test('buildJsonFeed caps the item list and survives an empty manifest', () => {
  const benchmarkHistory = Array.from({ length: 40 }, (unused, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    overall: 90,
    safety: null,
    served: null,
  }));
  const long = buildJsonFeed({ identity: { displayName: 'Tester', tagline: 'A tagline.' }, benchmarkHistory, history: [] });
  assert.equal(JSON.parse(long).items.length, 30);
  const empty = buildJsonFeed({ identity: { displayName: 'Tester', tagline: 'A tagline.' } });
  assert.equal(JSON.parse(empty).items.length, 0);
  assert.equal(empty, buildJsonFeed({ identity: { displayName: 'Tester', tagline: 'A tagline.' } }));
});

test('buildIndexMd and buildAgentReadability stay deterministic and survive an empty manifest', () => {
  const minimal = { identity: { displayName: 'Tester', tagline: 'A tagline.' }, projects: [] };
  assert.equal(buildIndexMd(minimal, { intro: {}, problems: [] }), buildIndexMd(minimal, { intro: {}, problems: [] }));
  assert.equal(buildAgentReadability(minimal), buildAgentReadability(minimal));
  assert.ok(!buildIndexMd(minimal, { intro: {}, problems: [] }).includes('## Evidence'));
});

test('writeAgentFiles writes every agent file once and reports no change afterwards', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yugimob-agent-'));
  try {
    mkdirSync(join(dir, 'data'), { recursive: true });
    const siteData = { identity: { displayName: 'Tester', tagline: 'A tagline.' }, projects: [] };
    const showcase = { intro: {}, problems: [] };
    writeFileSync(join(dir, 'data', 'site-data.json'), JSON.stringify(siteData));
    writeFileSync(join(dir, 'data', 'showcase.json'), JSON.stringify(showcase));
    assert.deepEqual(writeAgentFiles(dir), { 'llms.txt': true, 'index.md': true, 'agent-readability.json': true, 'feed.json': true });
    assert.deepEqual(writeAgentFiles(dir), { 'llms.txt': false, 'index.md': false, 'agent-readability.json': false, 'feed.json': false });
    assert.equal(readFileSync(join(dir, 'index.md'), 'utf8'), buildIndexMd(siteData, showcase));
    assert.equal(readFileSync(join(dir, 'agent-readability.json'), 'utf8'), buildAgentReadability(siteData));
    assert.equal(readFileSync(join(dir, 'feed.json'), 'utf8'), buildJsonFeed(siteData));
    assert.deepEqual(readdirSync(dir).filter((file) => file.endsWith('.tmp')), []);
    assert.deepEqual(readdirSync(join(dir, 'data')).filter((file) => file.endsWith('.tmp')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeLlmsFile cleans up and rethrows when a write fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yugimob-llms-fail-'));
  try {
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, 'data', 'site-data.json'), JSON.stringify({ identity: { displayName: 'A', tagline: 'B' }, projects: [] }));
    writeFileSync(join(dir, 'data', 'showcase.json'), JSON.stringify({ intro: {}, problems: [] }));
    mkdirSync(join(dir, `llms.txt.${process.pid}.tmp`));
    assert.throws(() => writeLlmsFile(dir));
    assert.equal(existsSync(join(dir, 'llms.txt')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
