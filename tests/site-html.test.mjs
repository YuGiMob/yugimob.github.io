import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGeneratedBlocks,
  buildActivityBlock,
  buildColophonProseBlock,
  buildHeroStatsBlock,
  buildIntroParagraphs,
  buildPrinciplesBlock,
  buildProblemIndexBlock,
  buildProblemListBlock,
  buildStructuredDataBlock,
  readBlock,
  readHeroStatsBlock,
  readIntroParagraphs,
  updateIndexFile,
} from '../scripts/site-html-lib.mjs';
import { SITE_URL } from '../scripts/llms-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.json'), 'utf8'));
const SHOWCASE = JSON.parse(readFileSync(join(ROOT, 'data', 'showcase.json'), 'utf8'));

const PAGE = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  `<link rel="canonical" href="${SITE_URL}/">`,
  '<title>Old title</title>',
  '<meta name="description" content="old">',
  '<meta property="og:title" content="old">',
  '<meta property="og:description" content="old">',
  '<meta name="twitter:title" content="old">',
  '<meta name="twitter:description" content="old">',
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';">`,
  '<script type="application/ld+json">{}</script>',
  '</head>',
  '<body>',
  '<p id="display-name">Old</p>',
  '<p id="class-title">Old</p>',
  '<h1><span id="intro-headline">Old</span></h1>',
  '<section id="problems"><h2 id="problems-heading"></h2>',
  '<div id="intro-paragraphs"></div>',
  '<dl class="intro-stats" id="hero-stats"><div class="stat"><dd class="stat-value" aria-hidden="true">0</dd></div></dl>',
  '<ol id="problem-index"></ol>',
  '<div id="problem-list"></div>',
  '</section>',
  '<section id="colophon"><div id="colophon-prose"></div><ul id="principles"></ul><div class="activity" id="activity-panel"></div></section>',
  '<footer id="campfire"><p class="footer-note" id="data-refreshed"></p></footer>',
  '</body>',
  '</html>',
].join('\n');

function withTemp(run) {
  const directory = mkdtempSync(join(tmpdir(), 'yugimob-html-'));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('the committed hero stat block already matches the data', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.equal(readHeroStatsBlock(source), buildHeroStatsBlock(DATA));
});

test('the committed inline JSON-LD already matches the data files', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const block = source.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[0];
  assert.equal(block, buildStructuredDataBlock(DATA, SHOWCASE, `${SITE_URL}/`));
});

test('the committed intro paragraphs already match the showcase', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.equal(readIntroParagraphs(source), buildIntroParagraphs(SHOWCASE));
});

test('the committed pre-rendered blocks already match the data files', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const projects = new Map(DATA.projects.map((project) => [project.name, project]));
  assert.equal(readBlock(source, 'ol', 'problem-index'), buildProblemIndexBlock(SHOWCASE, projects));
  assert.equal(readBlock(source, 'div', 'problem-list'), buildProblemListBlock(SHOWCASE, projects));
  assert.equal(readBlock(source, 'div', 'colophon-prose'), buildColophonProseBlock(SHOWCASE));
  assert.equal(readBlock(source, 'ul', 'principles'), buildPrinciplesBlock(SHOWCASE));
  assert.equal(readBlock(source, 'div', 'activity-panel'), buildActivityBlock(DATA));
});

test('the committed identity copy already matches the data', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.equal(applyGeneratedBlocks(source, DATA, SHOWCASE), source);
});

test('applyGeneratedBlocks rewrites the identity copy from the data', () => {
  const next = applyGeneratedBlocks(PAGE, DATA, SHOWCASE);
  assert.match(next, /<title>YuGiMob · Extensions for the pi coding agent<\/title>/);
  assert.match(next, /<meta name="description" content="Extensions for the pi coding agent: anchored edits, keyless web tools, Tor routing, review workflows, and a human gate in front of every commit\.">/);
  assert.match(next, /<meta property="og:title" content="YuGiMob · Extensions for the pi coding agent">/);
  assert.match(next, /<meta name="twitter:description" content="Extensions for the pi coding agent: anchored edits, keyless web tools, Tor routing, review workflows, and a human gate in front of every commit\.">/);
  assert.match(next, /<p id="display-name">YuGiMob<\/p>/);
  assert.match(next, /<p id="class-title">Extensions for the pi coding agent<\/p>/);
  assert.match(next, /<span id="intro-headline">Make the wrong operation impossible, not merely discouraged\.<\/span>/);
});

test('applyGeneratedBlocks rewrites the identity copy whatever the meta attribute order', () => {
  const reordered = PAGE
    .replace('<meta name="description" content="old">', '<meta content="old" name="description">')
    .replace('<meta property="og:title" content="old">', '<meta content="old" property="og:title">');
  const next = applyGeneratedBlocks(reordered, DATA, SHOWCASE);
  assert.match(next, /<meta content="Extensions for the pi coding agent: anchored edits, keyless web tools, Tor routing, review workflows, and a human gate in front of every commit\." name="description">/);
  assert.match(next, /<meta content="YuGiMob · Extensions for the pi coding agent" property="og:title">/);
});

test('applyGeneratedBlocks escapes the identity copy and tolerates a missing identity', () => {
  const hostile = { ...DATA, identity: { ...DATA.identity, displayName: 'A & B', tagline: '"quoted" <tag>' } };
  const next = applyGeneratedBlocks(PAGE, hostile, null);
  assert.match(next, /<p id="display-name">A &amp; B<\/p>/);
  assert.match(next, /content="&quot;quoted&quot; &lt;tag&gt;"/);
  const untouched = applyGeneratedBlocks(PAGE, { projects: DATA.projects, stats: DATA.stats, sections: {} }, null);
  assert.match(untouched, /<p id="display-name">Old<\/p>/);
  assert.match(untouched, /<title>Old title<\/title>/);
});

test('buildIntroParagraphs escapes markup and tolerates a missing intro', () => {
  assert.equal(buildIntroParagraphs({ intro: { paragraphs: ['<b>one</b> & two'] } }), '          <p class="intro-paragraph">&lt;b&gt;one&lt;/b&gt; &amp; two</p>');
  assert.equal(buildIntroParagraphs({}), '');
  assert.equal(buildIntroParagraphs(null), '');
});

test('the pre-rendered problem blocks carry every entry and escape markup', () => {
  const projects = new Map(DATA.projects.map((project) => [project.name, project]));
  const list = buildProblemListBlock(SHOWCASE, projects);
  for (const problem of SHOWCASE.problems) {
    assert.ok(list.includes(`id="problem-${problem.name}"`), problem.name);
    assert.ok(list.includes(problem.headline));
  }
  const hostile = { ...SHOWCASE, problems: [{ ...SHOWCASE.problems[0], answer: '<script>x</script>' }] };
  const escaped = buildProblemListBlock(hostile, projects);
  assert.ok(escaped.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(!escaped.includes('<script>x</script>'));
});

test('buildColophonProseBlock and buildPrinciplesBlock tolerate missing prose', () => {
  assert.equal(buildColophonProseBlock({}), '        <div class="colophon-prose" id="colophon-prose">\n\n        </div>');
  assert.equal(buildPrinciplesBlock({}), '          <ul class="principles" id="principles">\n\n          </ul>');
});

test('readBlock refuses an unclosed block and a missing id', () => {
  assert.equal(readBlock('<div id="x">open', 'div', 'x'), null);
  assert.equal(readBlock('<div id="x"></div>', 'div', 'y'), null);
});

test('applyGeneratedBlocks rewrites every pre-rendered block', () => {
  const next = applyGeneratedBlocks(PAGE, DATA, SHOWCASE);
  const projects = new Map(DATA.projects.map((project) => [project.name, project]));
  assert.equal(readHeroStatsBlock(next), buildHeroStatsBlock(DATA));
  assert.equal(readIntroParagraphs(next), buildIntroParagraphs(SHOWCASE));
  assert.equal(readBlock(next, 'ol', 'problem-index'), buildProblemIndexBlock(SHOWCASE, projects));
  assert.equal(readBlock(next, 'div', 'problem-list'), buildProblemListBlock(SHOWCASE, projects));
  assert.equal(readBlock(next, 'div', 'activity-panel'), buildActivityBlock(DATA));
  assert.match(next, /Data refreshed \d{4}-\d{2}-\d{2}\./);
  assert.match(next, /Five rules the tools enforce/);
});

test('applyGeneratedBlocks regenerates a drifted inline JSON-LD block', () => {
  const drifted = PAGE.replace('{}', '{"@type":"Old"}');
  const next = applyGeneratedBlocks(drifted, DATA, SHOWCASE);
  assert.equal(next, applyGeneratedBlocks(PAGE, DATA, SHOWCASE));
});

test('applyGeneratedBlocks falls back to the canonical site URL for the JSON-LD', () => {
  const next = applyGeneratedBlocks(PAGE.replace(`${SITE_URL}/`, ''), DATA, SHOWCASE);
  assert.ok(next.includes(`"url":"${SITE_URL}/"`));
});

test('applyGeneratedBlocks writes dollar signs in the intro prose verbatim', () => {
  const dollars = { ...SHOWCASE, intro: { ...SHOWCASE.intro, paragraphs: ['Costs $5 and $$10.'] } };
  const next = applyGeneratedBlocks(PAGE, DATA, dollars);
  assert.match(next, /Costs \$5 and \$\$10\./);
});

test('the hero stat toggle is carried and still reads back', () => {
  const hidden = buildHeroStatsBlock({ ...DATA, sections: { ...DATA.sections, showHeroStats: false } });
  assert.match(hidden, /id="hero-stats" hidden/);
  assert.ok(readHeroStatsBlock(hidden));
});

test('applyGeneratedBlocks mirrors the section toggles into hidden attributes', () => {
  const sections = { showAbout: false, showProblems: true, showHeroStats: false, showCampfire: false };
  const next = applyGeneratedBlocks(PAGE, { ...DATA, sections }, SHOWCASE);
  assert.match(next, /<section id="colophon"[^>]*hidden/);
  assert.match(next, /<footer id="campfire"[^>]*hidden/);
  assert.match(next, /id="hero-stats" hidden/);
  assert.ok(!/<section id="problems"[^>]*hidden/.test(next));
});

test('updateIndexFile rewrites a drifted block and leaves a matching one alone', () => {
  withTemp((directory) => {
    const path = join(directory, 'index.html');
    writeFileSync(path, PAGE);
    const first = updateIndexFile(path, DATA, SHOWCASE);
    assert.deepEqual(first, { ok: true, changed: true });
    const written = readFileSync(path, 'utf8');
    const second = updateIndexFile(path, DATA, SHOWCASE);
    assert.deepEqual(second, { ok: true, changed: false });
    assert.equal(readFileSync(path, 'utf8'), written);
  });
});

test('updateIndexFile leaves the intro block alone without a showcase', () => {
  withTemp((directory) => {
    const path = join(directory, 'index.html');
    writeFileSync(path, PAGE);
    const result = updateIndexFile(path, DATA, null);
    assert.equal(result.ok, true);
    assert.equal(readIntroParagraphs(readFileSync(path, 'utf8')), '');
  });
});

test('updateIndexFile reports a missing file and a missing block', () => {
  withTemp((directory) => {
    const missing = join(directory, 'index.html');
    assert.deepEqual(updateIndexFile(missing, DATA), { ok: false, reason: 'missing' });
    const noBlock = join(directory, 'no-block.html');
    writeFileSync(noBlock, '<html><body></body></html>');
    assert.deepEqual(updateIndexFile(noBlock, DATA), { ok: false, reason: 'no-block' });
  });
});
