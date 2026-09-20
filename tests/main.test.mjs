import test from 'node:test';
import assert from 'node:assert/strict';
import { element, register, registerQuery, withDom } from './dom.mjs';

const DATA = {
  identity: {
    displayName: 'Tester',
    classTitle: 'Testing things',
    tagline: 'A tagline for the tester.',
    avatarUrl: 'assets/avatar.png',
    links: { github: 'https://github.com/tester' },
  },
  projects: [{ name: 'tool-a', url: 'https://github.com/tester/tool-a', description: 'A tool.' }],
  stats: { totalStars: 5, npmPackages: 1, publicRepos: 2, forksReceived: 1 },
  activity: { pushes: 3, window: '2026-09-20..20', fetchedAt: '2026-09-20', highlights: [], daily: [] },
  sections: {},
  history: [],
};

const SHOWCASE = {
  intro: { headline: 'A headline.', paragraphs: ['One paragraph.'] },
  problems: [{ name: 'tool-a', kicker: 'Kicker', headline: 'A problem.', problem: 'Broke.', answer: 'Fixed.', highlights: ['One'], size: 'default' }],
  evidence: null,
  principles: ['A principle.'],
  colophon: ['A paragraph.'],
};

const IDS = [
  'main-content', 'avatar', 'display-name', 'class-title', 'intro-headline', 'intro-paragraphs',
  'data-notice', 'hero-stats', 'problems', 'problems-heading', 'problem-index', 'problem-list',
  'evidence', 'colophon',
  'evidence-kicker', 'evidence-heading', 'evidence-body', 'colophon-prose', 'principles',
  'activity-panel', 'github-link', 'campfire-year', 'data-age', 'structured-data',
  'nav-github', 'hero-github',
];

function jsonResponse(value) {
  return { ok: true, status: 200, json: async () => value };
}

function prepare(dom) {
  for (const id of IDS) register(dom.document, id);
  registerQuery(dom.document, '.intro-actions', element());
  registerQuery(dom.document, '.nav-links', element());
  const article = element('article');
  article.id = 'problem-tool-a';
  const box = element('div');
  box.className = 'problem-demo';
  box.setAttribute('data-demo', 'trace');
  article.appendChild(box);
  dom.document.getElementById('problem-list').appendChild(article);
}

function flush(rounds = 5) {
  let chain = Promise.resolve();
  for (let index = 0; index < rounds; index += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

test('the boot path renders identity, stats, problems, and structured data', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    await import('../assets/js/main.js?boot-ok');
    await flush();
    assert.equal(dom.document.title, 'Tester · Testing things');
    assert.equal(dom.document.getElementById('display-name').textContent, 'Tester');
    assert.equal(dom.document.getElementById('hero-stats').children.length, 3);
    assert.equal(dom.document.getElementById('problem-list').children.length, 1);
    assert.equal(dom.document.getElementById('problem-list').querySelector('.problem-demo').classList.contains('is-loading'), true);
    assert.equal(dom.document.getElementById('main-content').getAttribute('aria-busy'), null);
    assert.match(dom.document.getElementById('structured-data').textContent, /ItemList/);
    assert.equal(dom.document.getElementById('intro-headline').textContent, 'A headline.');
  }, { fetch: async (url) => jsonResponse(String(url).includes('showcase') ? SHOWCASE : DATA) });
});

test('the boot path falls back to the error state when the data cannot be fetched', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    await import('../assets/js/main.js?boot-fail');
    await flush();
    assert.equal(dom.document.getElementById('intro-headline').textContent, 'This page could not load its data.');
    assert.equal(dom.document.getElementById('problems').hidden, true);
    assert.equal(dom.document.getElementById('evidence').hidden, true);
    assert.equal(dom.document.getElementById('colophon').hidden, true);
    const actions = dom.document.querySelector('.intro-actions');
    assert.equal(actions.children[0].textContent, 'Try again');
  }, { fetch: async () => ({ ok: false, status: 404, json: async () => null }) });
});
