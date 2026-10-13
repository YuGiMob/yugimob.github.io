import test from 'node:test';
import assert from 'node:assert/strict';
import { countWord, fallbackShowcase, formatWindow, isValidShowcase, isValidSiteData } from '../assets/js/site-data.js';

const PROJECT = { name: 'tool-a', url: 'https://github.com/tester/tool-a', description: 'A tool.' };

const VALID = {
  identity: {
    displayName: 'Tester',
    classTitle: 'Testing things',
    tagline: 'A tagline for the tester.',
    avatarUrl: 'assets/avatar.png',
    links: { github: 'https://github.com/tester' },
  },
  projects: [PROJECT],
  stats: { totalStars: 1, npmPackages: 1, publicRepos: 2, forksReceived: 3 },
  activity: { window: '2026-09-20..20', pushes: 1, highlights: [], fetchedAt: '2026-09-20', daily: [] },
  sections: {},
  history: [],
};

const SHOWCASE = {
  intro: { headline: 'A headline.', paragraphs: ['One paragraph.'] },
  problems: [{ name: 'tool-a', kicker: 'Rule', headline: 'A problem.', problem: 'Broke.', answer: 'Fixed.', highlights: ['One'], size: 'default' }],
  principles: ['A principle.'],
  colophon: ['A paragraph.'],
};

test('isValidSiteData accepts a complete document', () => {
  assert.equal(isValidSiteData(VALID), true);
});

test('isValidSiteData rejects missing top-level keys', () => {
  for (const key of ['identity', 'projects', 'stats', 'activity', 'sections']) {
    const copy = structuredClone(VALID);
    delete copy[key];
    assert.equal(isValidSiteData(copy), false, key);
  }
});

test('isValidSiteData rejects identity without its display fields', () => {
  const copy = structuredClone(VALID);
  delete copy.identity.classTitle;
  assert.equal(isValidSiteData(copy), false);
  assert.equal(isValidSiteData({ ...VALID, identity: null }), false);
});

test('isValidSiteData rejects empty or malformed projects', () => {
  assert.equal(isValidSiteData({ ...VALID, projects: [] }), false);
  assert.equal(isValidSiteData({ ...VALID, projects: [{}] }), false);
});

test('isValidSiteData rejects non-object stats, activity, and sections', () => {
  assert.equal(isValidSiteData({ ...VALID, stats: [] }), false);
  assert.equal(isValidSiteData({ ...VALID, activity: 'no' }), false);
  assert.equal(isValidSiteData({ ...VALID, sections: [] }), false);
});

test('isValidShowcase accepts a curated document and rejects shapeless ones', () => {
  assert.equal(isValidShowcase(SHOWCASE), true);
  assert.equal(isValidShowcase(null), false);
  assert.equal(isValidShowcase({ intro: { headline: 'x' } }), false);
  assert.equal(isValidShowcase({ intro: SHOWCASE.intro, problems: [] }), false);
  assert.equal(isValidShowcase({ intro: SHOWCASE.intro, problems: [{}] }), false);
  assert.equal(isValidShowcase({ intro: SHOWCASE.intro, problems: [{ name: 'a', headline: 'b', highlights: [] }] }), false);
});

test('fallbackShowcase builds a usable narrative from identity and projects', () => {
  const fallback = fallbackShowcase(VALID);
  assert.equal(fallback.intro.headline, 'Testing things');
  assert.deepEqual(fallback.intro.paragraphs, ['A tagline for the tester.']);
  assert.equal(fallback.problems.length, 1);
  assert.equal(fallback.problems[0].name, 'tool-a');
  assert.deepEqual(fallback.principles, []);
  assert.deepEqual(fallback.colophon, ['A tagline for the tester.']);
});

test('countWord spells small numbers and falls back to digits', () => {
  assert.equal(countWord(0), 'zero');
  assert.equal(countWord(5), 'five');
  assert.equal(countWord(11), '11');
});

test('formatWindow expands a range, rolls over a month or year, and collapses a same day', () => {
  assert.equal(formatWindow('2026-09-09..10'), '2026-09-09 to 2026-09-10');
  assert.equal(formatWindow('2026-08-30..2026-09-02'), '2026-08-30 to 2026-09-02');
  assert.equal(formatWindow('2026-09-09'), '2026-09-09');
  assert.equal(formatWindow('2026-09-28..02'), '2026-09-28 to 2026-10-02');
  assert.equal(formatWindow('2026-12-31..01'), '2026-12-31 to 2027-01-01');
  assert.equal(formatWindow('2026-09-20..20'), '2026-09-20');
});
