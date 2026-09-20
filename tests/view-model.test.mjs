import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityLine,
  heroStatRows,
  problemEntries,
  problemIndexRows,
  problemsHeading,
  projectChipRows,
  structuredData,
} from '../assets/js/view-model.js';

const PROJECTS = [
  {
    name: 'tool-a',
    description: 'A tool.',
    language: 'TypeScript',
    license: 'MIT',
    stars: 12,
    npm: 'tool-a',
    url: 'https://github.com/tester/tool-a',
    npmWeeklyDownloads: 34,
    pushedAt: '2026-09-17T20:24:02Z',
  },
  { name: 'tool-b', url: 'https://github.com/tester/tool-b', stars: 0 },
];

const SHOWCASE = {
  problems: [
    { name: 'tool-a', headline: 'The first failure', highlights: ['one'], size: 'default', demo: 'git' },
    { name: 'ghost', headline: 'The missing tool', highlights: ['two'], size: 'default' },
    { name: 'tool-b', headline: 'The third failure', highlights: ['three'], size: 'default' },
  ],
  evidence: { name: 'tool-a', headline: 'The evidence' },
};

const DATA = {
  identity: { displayName: 'Tester', classTitle: 'Testing', tagline: 'A tagline.', links: { github: 'https://github.com/tester' } },
  projects: PROJECTS,
  stats: { totalStars: 12, npmPackages: 1 },
  activity: { pushes: 7, window: '2026-09-03..17', fetchedAt: '2026-09-18' },
  sections: {},
};

const projectMap = () => new Map(PROJECTS.map((project) => [project.name, project]));

test('problemEntries drops a showcase entry with no project in the manifest', () => {
  const entries = problemEntries(SHOWCASE, projectMap());
  assert.deepEqual(entries.map(({ entry }) => entry.name), ['tool-a', 'tool-b']);
  assert.deepEqual(entries.map(({ number }) => number), ['01', '02']);
});

test('problemIndexRows stays in step with the rendered articles and numbers the evidence row', () => {
  const rows = problemIndexRows(SHOWCASE, projectMap());
  assert.deepEqual(rows.map((row) => row.href), ['#problem-tool-a', '#problem-tool-b', '#evidence']);
  assert.deepEqual(rows.map((row) => row.number), ['01', '02', '03']);
  assert.equal(rows[2].headline, 'The evidence');
});

test('problemsHeading counts only the entries that render', () => {
  assert.equal(problemsHeading(SHOWCASE, projectMap()), 'Three things that kept going wrong');
  assert.equal(problemsHeading({ problems: [] }, projectMap()), 'Zero things that kept going wrong');
  assert.equal(
    problemsHeading({ ...SHOWCASE, evidence: null }, projectMap()),
    'Two things that kept going wrong',
  );
});

test('heroStatRows sums the weekly npm downloads across projects', () => {
  assert.deepEqual(heroStatRows(DATA), [
    { label: 'GitHub stars', value: 12 },
    { label: 'packages on npm', value: 1 },
    { label: 'npm installs / week', value: 34 },
  ]);
});

test('projectChipRows formats the numbers and skips absent fields', () => {
  assert.deepEqual(projectChipRows(PROJECTS[0]), [
    { label: 'stars', value: '12' },
    { label: 'installs/wk', value: '34' },
    { label: 'language', value: 'TypeScript' },
    { label: 'license', value: 'MIT' },
    { label: 'updated', value: '2026-09-17' },
  ]);
  assert.deepEqual(projectChipRows(PROJECTS[1]), [{ label: 'stars', value: '0' }]);
});

test('activityLine expands the window range', () => {
  assert.deepEqual(activityLine(DATA.activity), { pushes: '7 pushes to public repositories, ', window: '2026-09-03 to 2026-09-17' });
  assert.deepEqual(activityLine({}), { pushes: '0 pushes to public repositories, ', window: undefined });
});

test('structuredData lists the showcase projects in order and drops unknown names', () => {
  const list = structuredData(DATA, SHOWCASE);
  assert.equal(list['@type'], 'ItemList');
  assert.equal(list.name, 'Tester artifacts');
  assert.equal(list.dateModified, '2026-09-18');
  assert.deepEqual(list.itemListElement.map((item) => item.item.name), ['tool-a', 'tool-b']);
  assert.equal(list.itemListElement[0].position, 1);
  assert.equal(list.itemListElement[0].item.codeRepository, 'https://github.com/tester/tool-a');
  assert.deepEqual(list.itemListElement[0].item.sameAs, ['https://www.npmjs.com/package/tool-a']);
  assert.equal(list.itemListElement[1].item.license, undefined);
});
