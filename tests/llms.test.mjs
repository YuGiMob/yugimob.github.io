import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const EMPTY = { identity: { displayName: 'Nobody', tagline: 'Nothing here.' }, projects: [], activity: {}, history: [] };

function withTemp(run) {
  const directory = mkdtempSync(join(tmpdir(), 'yugimob-llms-'));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('the committed llms.txt matches the generator output', () => {
  assert.equal(COMMITTED, buildLlmsTxt(DATA, SHOWCASE));
});

test('llms.txt opens with a title and a summary blockquote', () => {
  assert.match(COMMITTED, /^# YuGiMob\n/);
  assert.match(COMMITTED, /^> Extensions for the pi coding agent/m);
});

test('llms.txt lists every showcased tool with its install command and numbers', () => {
  for (const problem of SHOWCASE.problems) {
    const project = DATA.projects.find((entry) => entry.name === problem.name);
    assert.ok(COMMITTED.includes(`[${project.name}](${project.url})`), project.name);
    assert.ok(COMMITTED.includes(`pi install npm:${project.npm}`), project.name);
  }
});

test('llms.txt carries the machine data links and the optional links', () => {
  for (const target of ['index.md', 'data/site-data.json', 'data/showcase.json', 'agent-readability.json', 'feed.json', 'sitemap.xml', 'robots.txt']) {
    assert.ok(COMMITTED.includes(target), target);
  }
  assert.ok(!COMMITTED.includes('benchmark'));
});

test('buildLlmsTxt stays deterministic and survives an empty manifest', () => {
  assert.equal(buildLlmsTxt(DATA, SHOWCASE), buildLlmsTxt(DATA, SHOWCASE));
  const empty = buildLlmsTxt(EMPTY, { problems: [], intro: {}, principles: [], colophon: [] });
  assert.match(empty, /^# Nobody/);
  assert.match(empty, /## Tools/);
});

test('writeLlmsFile writes once and reports no change afterwards', () => {
  withTemp((directory) => {
    const dataPath = join(directory, 'data');
    mkdirSync(dataPath, { recursive: true });
    writeFileSync(join(dataPath, 'site-data.json'), JSON.stringify(DATA));
    writeFileSync(join(dataPath, 'showcase.json'), JSON.stringify(SHOWCASE));
    assert.equal(writeLlmsFile(directory), true);
    assert.equal(writeLlmsFile(directory), false);
    assert.equal(readFileSync(join(directory, 'llms.txt'), 'utf8'), buildLlmsTxt(DATA, SHOWCASE));
  });
});

test('the committed index.md matches the generator output', () => {
  assert.equal(COMMITTED_INDEX, buildIndexMd(DATA, SHOWCASE));
});

test('index.md opens with the title and covers every showcased tool', () => {
  assert.match(COMMITTED_INDEX, /^# YuGiMob\n/);
  for (const problem of SHOWCASE.problems) {
    assert.ok(COMMITTED_INDEX.includes(problem.name), problem.name);
    assert.ok(COMMITTED_INDEX.includes(problem.headline), problem.headline);
  }
  assert.match(COMMITTED_INDEX, /^## Tools$/m);
  assert.match(COMMITTED_INDEX, /^## Principles$/m);
  assert.match(COMMITTED_INDEX, /^## About$/m);
});

test('llms.txt follows the v2 section and link shape', () => {
  const lines = COMMITTED.split('\n');
  assert.ok(lines.some((line) => line === '## Tools'));
  assert.ok(lines.some((line) => line === '## Data'));
  assert.ok(lines.some((line) => line === '## Optional'));
  for (const line of lines) {
    if (line.startsWith('- [')) assert.match(line, /^- \[[^\]]+\]\(https:\/\/\S+\)(?:[:\s].*)?$/);
  }
});

test('the committed agent-readability.json matches the generator output', () => {
  assert.equal(COMMITTED_READABILITY, buildAgentReadability(DATA));
});

test('the committed feed.json matches the generator output', () => {
  assert.equal(COMMITTED_FEED, buildJsonFeed(DATA));
});

test('buildJsonFeed caps the item list and survives an empty manifest', () => {
  const many = { ...DATA, history: Array.from({ length: 40 }, (unused, index) => ({ date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`, totalStars: index, totalDownloads: index })) };
  const feed = JSON.parse(buildJsonFeed(many));
  assert.equal(feed.items.length, 30);
  const empty = JSON.parse(buildJsonFeed(EMPTY));
  assert.deepEqual(empty.items, []);
});

test('buildIndexMd and buildAgentReadability stay deterministic and survive an empty manifest', () => {
  assert.equal(buildIndexMd(DATA, SHOWCASE), buildIndexMd(DATA, SHOWCASE));
  assert.equal(buildAgentReadability(DATA), buildAgentReadability(DATA));
  assert.match(buildIndexMd(EMPTY, { problems: [], intro: {}, principles: [], colophon: [] }), /^# Nobody/);
  assert.match(buildAgentReadability(EMPTY), /"name": "Nobody"/);
});

test('writeAgentFiles writes every agent file once and reports no change afterwards', () => {
  withTemp((directory) => {
    const dataPath = join(directory, 'data');
    mkdirSync(dataPath, { recursive: true });
    writeFileSync(join(dataPath, 'site-data.json'), JSON.stringify(DATA));
    writeFileSync(join(dataPath, 'showcase.json'), JSON.stringify(SHOWCASE));
    const first = writeAgentFiles(directory);
    assert.deepEqual(first, { 'llms.txt': true, 'index.md': true, 'agent-readability.json': true, 'feed.json': true });
    const second = writeAgentFiles(directory);
    assert.deepEqual(second, { 'llms.txt': false, 'index.md': false, 'agent-readability.json': false, 'feed.json': false });
  });
});

test('writeLlmsFile cleans up and rethrows when a write fails', () => {
  withTemp((directory) => {
    const dataPath = join(directory, 'data');
    mkdirSync(dataPath, { recursive: true });
    writeFileSync(join(dataPath, 'site-data.json'), JSON.stringify(DATA));
    writeFileSync(join(dataPath, 'showcase.json'), JSON.stringify(SHOWCASE));
    const target = join(directory, 'llms.txt');
    writeFileSync(target, 'old\n');
    chmodSync(directory, 0o500);
    try {
      assert.throws(() => writeLlmsFile(directory));
    } finally {
      chmodSync(directory, 0o700);
    }
  });
});

test('buildLlmsTxt tolerates a document without intro, principles, or colophon', () => {
  const minimal = { identity: { displayName: 'X', tagline: 'T' }, projects: DATA.projects, activity: {} };
  assert.match(buildLlmsTxt(minimal, { problems: [] }), /^# X/);
});

test('buildIndexMd tolerates a document without principles or colophon', () => {
  const minimal = { identity: { displayName: 'X', tagline: 'T' }, projects: DATA.projects, activity: {} };
  const text = buildIndexMd(minimal, { problems: [], intro: {}, principles: [], colophon: [] });
  assert.ok(!text.includes('## Principles'));
  assert.ok(!text.includes('## About'));
});

test('buildJsonFeed drops unusable history entries', () => {
  const feed = JSON.parse(buildJsonFeed({ ...DATA, history: [{ date: '2026-01-01' }, null] }));
  assert.deepEqual(feed.items, []);
});

test('buildAgentReadability tolerates a document without activity', () => {
  assert.match(buildAgentReadability({ identity: { displayName: 'X', tagline: 'T' } }), /"updated": null/);
});
