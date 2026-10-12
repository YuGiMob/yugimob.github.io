import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityLine,
  heroStatRows,
  problemEntries,
  problemId,
  problemIndexRows,
  problemsHeading,
  projectChipRows,
  repositoryFacts,
  sectionVisibility,
  staleDays,
  stalenessNotice,
  structuredData,
} from '../assets/js/view-model.js';

const PROJECTS = [
  { name: 'tool-a', url: 'https://github.com/tester/tool-a', description: 'A tool.', stars: 10, forks: 2, npmWeeklyDownloads: 100, language: 'TypeScript', license: 'MIT', pushedAt: '2026-09-20T00:00:00Z' },
  { name: 'tool-b', url: 'https://github.com/tester/tool-b' },
  { name: 'tool-c', url: 'https://github.com/tester/tool-c' },
  { name: 'tool-d', url: 'https://github.com/tester/tool-d' },
  { name: 'tool-e', url: 'https://github.com/tester/tool-e' },
];

const SHOWCASE = {
  problems: [
    { name: 'tool-a', headline: 'A problem.', kicker: 'Rule A' },
    { name: 'tool-b', headline: 'B problem.', kicker: 'Rule B' },
    { name: 'tool-c', headline: 'C problem.', kicker: 'Rule C' },
    { name: 'tool-d', headline: 'D problem.', kicker: 'Rule D' },
    { name: 'tool-e', headline: 'E problem.', kicker: 'Rule E' },
  ],
};

const DATA = {
  identity: { displayName: 'Tester', classTitle: 'Testing', tagline: 'A tagline.', avatarUrl: 'assets/avatar.png', links: { github: 'https://github.com/tester' } },
  projects: PROJECTS,
  stats: { totalStars: 10, npmPackages: 5, publicRepos: 2, forksReceived: 1 },
  activity: { window: '2026-09-09..10', pushes: 3, highlights: [], fetchedAt: '2026-09-10' },
  sections: {},
};

const projectMap = () => new Map(PROJECTS.map((project) => [project.name, project]));

test('problemEntries drops a showcase entry with no project in the manifest', () => {
  const showcase = { problems: [...SHOWCASE.problems, { name: 'ghost', headline: 'Ghost.', kicker: 'Rule' }] };
  const entries = problemEntries(showcase, projectMap());
  assert.equal(entries.length, 5);
  assert.deepEqual(entries.map((entry) => entry.number), ['01', '02', '03', '04', '05']);
});

test('problemIndexRows stays in step with the rendered articles', () => {
  const rows = problemIndexRows(SHOWCASE, projectMap());
  assert.equal(rows.length, 5);
  assert.equal(rows[0].href, `#${problemId('tool-a')}`);
  assert.equal(rows[4].number, '05');
});

test('problemsHeading counts only the entries that render', () => {
  assert.equal(problemsHeading(SHOWCASE, projectMap()), 'Five rules the tools enforce');
  const short = { problems: [...SHOWCASE.problems.slice(0, 4), { name: 'ghost', headline: 'Ghost.', kicker: 'Rule' }] };
  assert.equal(problemsHeading(short, projectMap()), 'Four rules the tools enforce');
});

test('heroStatRows sums the weekly npm downloads across projects', () => {
  const rows = heroStatRows({ projects: PROJECTS, stats: { totalStars: 10, npmPackages: 5 } });
  assert.deepEqual(rows.map((row) => row.label), ['GitHub stars', 'packages on npm', 'npm installs / week']);
  assert.equal(rows[2].value, 100);
});

test('projectChipRows formats the numbers and skips absent fields', () => {
  const chips = projectChipRows(PROJECTS[0]);
  assert.deepEqual(chips.map((chip) => chip.label), ['stars', 'forks', 'installs/wk', 'language', 'license', 'updated']);
  assert.equal(chips[0].value, '10');
  assert.equal(chips[5].value, '2026-09-20');
  assert.deepEqual(projectChipRows(PROJECTS[1]).map((chip) => chip.label), ['stars', 'forks']);
});

test('activityLine expands the window range and drops a single date', () => {
  const line = activityLine({ window: '2026-09-09..10', pushes: 3 });
  assert.equal(line.pushes, '3 pushes to public repositories');
  assert.equal(line.window, '2026-09-09 to 2026-09-10');
  assert.equal(activityLine({ window: '2026-09-10', pushes: 0 }).window, '');
});

test('structuredData builds a profile page around the showcase projects', () => {
  const jsonLd = structuredData(DATA, SHOWCASE, 'https://yugimob.github.io/');
  assert.equal(jsonLd['@type'], 'ProfilePage');
  assert.equal(jsonLd.mainEntity.name, 'Tester');
  assert.equal(jsonLd.mainEntity.image, 'https://yugimob.github.io/assets/avatar.png');
  assert.deepEqual(jsonLd.mainEntity.sameAs, ['https://github.com/tester']);
  assert.equal(jsonLd.hasPart.numberOfItems, 5);
  assert.equal(jsonLd.hasPart.itemListElement[0].item.name, 'tool-a');
  assert.equal(jsonLd.hasPart.itemListElement[0].item.license, 'https://spdx.org/licenses/MIT');
});

test('repositoryFacts formats the repository totals', () => {
  assert.deepEqual(repositoryFacts({ publicRepos: 13, forksReceived: 33 }), { repositories: '13', forks: '33' });
});

test('staleDays counts whole days and rejects unusable dates', () => {
  assert.equal(staleDays('2026-09-18', '2026-09-20'), 2);
  assert.equal(staleDays('nope', '2026-09-20'), null);
});

test('stalenessNotice names the source that went stale', () => {
  const data = { activity: { fetchedAt: '2026-09-17' } };
  assert.equal(stalenessNotice(data, '2026-09-20'), 'The daily refresh last updated this page 3 days ago.');
  assert.equal(stalenessNotice(data, '2026-09-19'), null);
});

test('sectionVisibility mirrors the data toggles and the problems list', () => {
  assert.deepEqual(sectionVisibility({}, SHOWCASE), { problems: true, colophon: true, campfire: true, 'hero-stats': true });
  const hidden = sectionVisibility({ showAbout: false, showProblems: false, showCampfire: false, showHeroStats: false }, SHOWCASE);
  assert.deepEqual(hidden, { problems: false, colophon: false, campfire: false, 'hero-stats': false });
  assert.equal(sectionVisibility({}, { problems: [] }).problems, false);
  assert.equal(sectionVisibility({}, null).problems, true);
});

test('stalenessNotice ignores a document without an activity date', () => {
  assert.equal(stalenessNotice({}, '2026-09-20'), null);
  assert.equal(stalenessNotice({ activity: {} }, '2026-09-20'), null);
});

test('structuredData tolerates a missing base URL', () => {
  const jsonLd = structuredData(DATA, SHOWCASE);
  assert.equal(jsonLd.mainEntity.url, undefined);
  assert.equal(jsonLd.mainEntity.image, 'assets/avatar.png');
});

test('structuredData uses the current SPDX identifier for a deprecated license', () => {
  const projects = [{ ...PROJECTS[0], license: 'AGPL-3.0' }];
  const showcase = { problems: [{ name: 'tool-a', headline: 'A problem.', kicker: 'Rule A' }] };
  const jsonLd = structuredData({ ...DATA, projects }, showcase, '');
  assert.equal(jsonLd.hasPart.itemListElement[0].item.license, 'https://spdx.org/licenses/AGPL-3.0-only');
});
