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
  problems: [{ name: 'tool-a', kicker: 'Rule', headline: 'A problem.', problem: 'Broke.', answer: 'Fixed.', highlights: ['One'], size: 'default' }],
  principles: ['A principle.'],
  colophon: ['A paragraph.'],
};

const IDS = [
  'main-content', 'avatar', 'display-name', 'class-title', 'intro-headline', 'intro-paragraphs',
  'data-notice', 'hero-stats', 'problems', 'problems-heading', 'problem-index', 'problem-list',
  'colophon', 'colophon-prose', 'principles', 'activity-panel', 'github-link', 'campfire-year',
  'data-age', 'nav-github', 'hero-github', 'campfire',
];

function jsonResponse(value) {
  return { ok: true, status: 200, json: async () => value };
}

function prepare(dom) {
  for (const id of IDS) register(dom.document, id);
  registerQuery(dom.document, '.intro-actions', element());
  registerQuery(dom.document, '.nav-links', element());
  registerQuery(dom.document, 'meta[name="description"]', element('meta'));
  registerQuery(dom.document, 'meta[property="og:title"]', element('meta'));
  registerQuery(dom.document, 'meta[property="og:description"]', element('meta'));
  registerQuery(dom.document, 'meta[name="twitter:title"]', element('meta'));
  registerQuery(dom.document, 'meta[name="twitter:description"]', element('meta'));
  const article = element('article');
  article.id = 'problem-tool-a';
  const box = element('div');
  box.className = 'problem-demo';
  box.setAttribute('data-demo', 'git');
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

test('the boot path renders identity, stats, and problems', async () => {
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
    assert.equal(dom.document.getElementById('colophon').hidden, true);
    assert.equal(dom.document.getElementById('activity-panel').hidden, true);
    const actions = dom.document.querySelector('.intro-actions');
    assert.equal(dom.document.getElementById('campfire-year').textContent, `© ${new Date().getFullYear()} YuGiMob`);
    assert.equal(actions.children[0].textContent, 'Try again');
  }, { fetch: async () => ({ ok: false, status: 404, json: async () => null }) });
});

test('setupNav marks the section in view and clears the rest', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    const { setupNav } = await import('../assets/js/main.js?nav');
    await flush();
    dom.document.getElementById('problems').id = 'problems';
    dom.document.getElementById('colophon').id = 'colophon';
    const first = element('a');
    first.dataset.nav = 'problems';
    const second = element('a');
    second.dataset.nav = 'colophon';
    dom.document.body.appendChild(first);
    dom.document.body.appendChild(second);
    setupNav();
    const observer = dom.observers.at(-1);
    assert.equal(observer.targets.length, 2);
    observer.trigger([{ isIntersecting: true, target: observer.targets[0] }]);
    assert.equal(first.classList.contains('is-current'), true);
    assert.equal(first.getAttribute('aria-current'), 'location');
    assert.equal(second.getAttribute('aria-current'), null);
  }, { fetch: async (url) => jsonResponse(String(url).includes('showcase') ? SHOWCASE : DATA) });
});

test('setupChrome syncs the sticky offset and opens details before printing', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    register(dom.document, 'topbar', element('header'));
    dom.document.getElementById('problem-list').replaceChildren();
    const details = element('details');
    dom.document.body.appendChild(details);
    const { setupChrome } = await import('../assets/js/main.js?chrome');
    await flush();
    setupChrome();
    assert.equal(dom.document.documentElement.style.scrollPaddingTop, '20px');
    dom.window.scrollY = 40;
    dom.window.dispatch('scroll');
    assert.equal(dom.document.getElementById('topbar').classList.contains('is-scrolled'), true);
    dom.window.dispatch('beforeprint');
    assert.equal(details.open, true);
  }, { fetch: async (url) => jsonResponse(String(url).includes('showcase') ? SHOWCASE : DATA) });
});
