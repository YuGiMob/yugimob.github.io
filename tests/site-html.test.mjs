import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { problemsHeading } from '../assets/js/view-model.js';
import { applyGeneratedBlocks, buildColophonProseBlock, buildEvidenceBlock, buildHeroStatsBlock, buildIntroParagraphs, buildPrinciplesBlock, buildProblemIndexBlock, buildProblemListBlock, buildStructuredDataBlock, readBlock, readHeroStatsBlock, readIntroParagraphs, updateIndexFile } from '../scripts/site-html-lib.mjs';
import { ROOT, withRepoCopy } from './helpers.mjs';

const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.json'), 'utf8'));
const SHOWCASE = JSON.parse(readFileSync(join(ROOT, 'data', 'showcase.json'), 'utf8'));

test('the committed hero stat block already matches the data', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.equal(readHeroStatsBlock(source), buildHeroStatsBlock(DATA));
});

test('the committed inline JSON-LD already matches the data files', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const block = source.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/)?.[0];
  assert.equal(block, buildStructuredDataBlock(DATA, SHOWCASE));
});

test('the committed intro paragraphs already match the showcase', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.equal(readIntroParagraphs(source), buildIntroParagraphs(SHOWCASE));
});

test('buildIntroParagraphs escapes markup and tolerates a missing intro', () => {
  assert.equal(buildIntroParagraphs({}), '');
  assert.equal(buildIntroParagraphs(null), '');
  const escaped = buildIntroParagraphs({ intro: { paragraphs: ['a < b & c > d'] } });
  assert.match(escaped, /a &lt; b &amp; c &gt; d/);
});

test('the committed pre-rendered blocks already match the data files', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const projects = new Map(DATA.projects.map((project) => [project.name, project]));
  assert.equal(readBlock(source, 'ol', 'problem-index'), buildProblemIndexBlock(SHOWCASE, projects));
  assert.equal(readBlock(source, 'div', 'problem-list'), buildProblemListBlock(SHOWCASE, projects));
  assert.equal(readBlock(source, 'div', 'evidence-body'), buildEvidenceBlock(SHOWCASE, projects));
  assert.equal(readBlock(source, 'div', 'colophon-prose'), buildColophonProseBlock(SHOWCASE));
  assert.equal(readBlock(source, 'ul', 'principles'), buildPrinciplesBlock(SHOWCASE));
  const heading = source.match(/id="problems-heading"[^>]*>([^<]*)</)?.[1];
  assert.equal(heading, problemsHeading(SHOWCASE, projects));
});

test('the pre-rendered problem blocks carry every entry and escape markup', () => {
  const projects = new Map(DATA.projects.map((project) => [project.name, project]));
  const index = buildProblemIndexBlock(SHOWCASE, projects);
  assert.equal((index.match(/class="index-row"/g) ?? []).length, SHOWCASE.problems.length + 1);
  const list = buildProblemListBlock(SHOWCASE, projects);
  for (const problem of SHOWCASE.problems) {
    assert.ok(list.includes(`id="problem-${problem.name}"`));
    assert.ok(list.includes(problem.headline));
  }
  assert.ok(list.includes('class="install-command">pi install npm:'));
  assert.ok(list.includes('class="problem is-hero"'));
  assert.ok(list.includes('data-demo="hashline"'));
  const escaped = buildProblemListBlock({ problems: [{ name: 'x', kicker: 'k', headline: '<b>h</b>', problem: 'p & q', answer: 'a', highlights: ['h'] }] }, new Map([['x', { name: 'x', url: 'https://example.com', npm: null, stars: 1, forks: 0 }]]));
  assert.ok(escaped.includes('&lt;b&gt;h&lt;/b&gt;'));
  assert.ok(escaped.includes('p &amp; q'));
  assert.ok(!escaped.includes('install-command'));
  assert.ok(!escaped.includes('is-hero'));
});

test('buildEvidenceBlock handles a missing evidence block and a missing project', () => {
  const projects = new Map(DATA.projects.map((project) => [project.name, project]));
  assert.equal(buildEvidenceBlock({}, projects), '      <div id="evidence-body"></div>');
  const withoutProject = buildEvidenceBlock({ evidence: { name: 'ghost', problem: 'p', answer: 'a', highlights: ['h'] } }, new Map());
  assert.ok(withoutProject.includes('problem-ghost'));
  assert.ok(!withoutProject.includes('answer-name'));
  assert.ok(buildEvidenceBlock(SHOWCASE, projects).includes('section-lede'));
  assert.ok(buildEvidenceBlock(SHOWCASE, projects).includes('data-demo="trace"'));
  const withoutIntro = buildEvidenceBlock({ ...SHOWCASE, evidence: { ...SHOWCASE.evidence, intro: undefined } }, projects);
  assert.ok(!withoutIntro.includes('section-lede'));
});

test('buildColophonProseBlock and buildPrinciplesBlock tolerate missing prose', () => {
  assert.match(buildColophonProseBlock({}), /id="colophon-prose">\n\s*<\/div>/);
  assert.match(buildPrinciplesBlock({}), /id="principles">\n\s*<\/ul>/);
});

test('readBlock refuses an unclosed block and a missing id', () => {
  assert.equal(readBlock('<div id="x"><div></div>', 'div', 'x'), null);
  assert.equal(readBlock('<div id="x"></div>', 'div', 'y'), null);
  assert.equal(readBlock('<div id="x"><div><span></span></div></div>', 'div', 'x'), '<div id="x"><div><span></span></div></div>');
});

test('applyGeneratedBlocks rewrites every pre-rendered block', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const drifted = source.replace('The edit lands on the wrong line', 'A stale headline');
  const next = applyGeneratedBlocks(drifted, DATA, SHOWCASE);
  assert.ok(!next.includes('A stale headline'));
  assert.equal(readBlock(next, 'div', 'problem-list'), readBlock(source, 'div', 'problem-list'));
  const shortened = applyGeneratedBlocks(source, DATA, { ...SHOWCASE, problems: SHOWCASE.problems.slice(0, 2) });
  assert.match(shortened, /id="problems-heading">Three things that kept going wrong</);
});

test('applyGeneratedBlocks regenerates a drifted inline JSON-LD block', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const drifted = source.replace('"@context":"https://schema.org"', '"@context":"https://example.org"');
  assert.notEqual(drifted, source);
  assert.equal(applyGeneratedBlocks(drifted, DATA, SHOWCASE), source);
});

test('applyGeneratedBlocks falls back to the canonical site URL for the JSON-LD', () => {
  const next = applyGeneratedBlocks('<script type="application/ld+json">{"@context":"https://example.org"}</script>', DATA, SHOWCASE);
  assert.match(next, /"url":"https:\/\/yugimob\.github\.io\/"/);
});

test('applyGeneratedBlocks rewrites both blocks and leaves unknown markup alone', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const next = applyGeneratedBlocks(source, { ...DATA, stats: { ...DATA.stats, totalStars: 1 } }, SHOWCASE);
  assert.notEqual(next, source);
  assert.match(next, /<dd class="stat-value" aria-hidden="true">1<\/dd>/);
  assert.equal(applyGeneratedBlocks('nothing here', DATA, SHOWCASE), 'nothing here');
});

test('applyGeneratedBlocks writes dollar signs in the intro prose verbatim', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const prose = "It costs $3 a month, and $&, and $', and $$, and $1 stay literal.";
  const showcase = { ...SHOWCASE, intro: { ...SHOWCASE.intro, paragraphs: [prose] } };
  const built = buildIntroParagraphs(showcase);
  const next = applyGeneratedBlocks(source, DATA, showcase);
  assert.ok(built.includes('$3 a month'));
  assert.ok(next.includes(built));
  assert.equal(readIntroParagraphs(next), built);
});

test('buildHeroStatsBlock carries the hero stat toggle and still reads back', () => {
  const block = buildHeroStatsBlock({ ...DATA, sections: { ...DATA.sections, showHeroStats: false } });
  assert.match(block, /<dl class="intro-stats" id="hero-stats" hidden>/);
  assert.equal(readHeroStatsBlock(block), block);
});

test('applyGeneratedBlocks mirrors the section toggles into hidden attributes', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const off = applyGeneratedBlocks(source, { ...DATA, sections: { ...DATA.sections, showAbout: false, showCampfire: false } }, SHOWCASE);
  assert.match(off, /<section id="colophon"[^>]*\shidden>/);
  assert.match(off, /<footer id="campfire"[^>]*\shidden>/);
  assert.ok(!/<section id="problems"[^>]*\shidden>/.test(off));
  assert.equal(applyGeneratedBlocks(off, DATA, SHOWCASE), source);
});

test('updateIndexFile rewrites a drifted block and leaves a matching one alone', () => {
  withRepoCopy((copy) => {
    const target = join(copy, 'index.html');
    assert.equal(updateIndexFile(target, DATA, SHOWCASE).changed, false);
    const committed = readHeroStatsBlock(readFileSync(target, 'utf8'));
    const drifted = buildHeroStatsBlock({ ...DATA, stats: { ...DATA.stats, totalStars: 5 } });
    const introBefore = readIntroParagraphs(readFileSync(target, 'utf8'));
    writeFileSync(target, readFileSync(target, 'utf8').replace(committed, drifted).replace(introBefore, '<p class="intro-paragraph">drifted</p>'));
    const result = updateIndexFile(target, DATA, SHOWCASE);
    assert.equal(result.changed, true);
    assert.equal(readHeroStatsBlock(readFileSync(target, 'utf8')), committed);
    assert.equal(readIntroParagraphs(readFileSync(target, 'utf8')), buildIntroParagraphs(SHOWCASE));
  });
});

test('updateIndexFile leaves the intro block alone without a showcase', () => {
  withRepoCopy((copy) => {
    const target = join(copy, 'index.html');
    const intro = readIntroParagraphs(readFileSync(target, 'utf8'));
    writeFileSync(target, readFileSync(target, 'utf8').replace('I\'m YuGiMob.', 'Someone else.'));
    assert.equal(updateIndexFile(target, DATA, null).changed, false);
    assert.match(readFileSync(target, 'utf8'), /Someone else\./);
    assert.notEqual(intro, null);
  });
});

test('updateIndexFile reports a missing file and a missing block', () => {
  withRepoCopy((copy) => {
    assert.equal(updateIndexFile(join(copy, 'missing.html'), DATA, SHOWCASE).ok, false);
    assert.equal(updateIndexFile(join(copy, '404.html'), DATA, SHOWCASE).reason, 'no-block');
  });
});

test('build-static rewrites a drifted block and reports a missing page', () => {
  withRepoCopy((copy) => {
    const script = join(copy, 'scripts', 'build-static.mjs');
    const target = join(copy, 'index.html');
    const committed = readFileSync(target, 'utf8');
    const drifted = committed.replace(/(<dd class="stat-value" aria-hidden="true">)[^<]*<\/dd>/, (unused, open) => `${open}0</dd>`);
    writeFileSync(target, drifted);
    const rewritten = spawnSync(process.execPath, [script], { cwd: copy, encoding: 'utf8' });
    assert.equal(rewritten.status, 0, rewritten.stderr);
    assert.match(rewritten.stdout, /index\.html: written/);
    assert.equal(readFileSync(target, 'utf8'), committed);
    const clean = spawnSync(process.execPath, [script], { cwd: copy, encoding: 'utf8' });
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /index\.html: unchanged/);
    rmSync(target);
    const broken = spawnSync(process.execPath, [script], { cwd: copy, encoding: 'utf8' });
    assert.equal(broken.status, 1);
    assert.match(broken.stderr, /build:static: index\.html was not rewritten \(missing\)/);
  });
});
