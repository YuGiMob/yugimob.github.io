import test from 'node:test';
import assert from 'node:assert/strict';
import { element, findAll, register, registerQuery, withDom } from './dom.mjs';

const PROJECT_A = { name: 'tool-a', url: 'https://github.com/tester/tool-a', description: 'A tool.', stars: 10, forks: 2, npmWeeklyDownloads: 100, language: 'TypeScript', license: 'MIT', pushedAt: '2026-09-20T00:00:00Z' };
const PROJECT_B = { name: 'tool-b', url: 'https://github.com/tester/tool-b' };

const DATA = {
  identity: {
    displayName: 'Tester',
    classTitle: 'Testing things',
    tagline: 'A tagline for the tester.',
    avatarUrl: 'assets/avatar.png',
    links: { github: 'https://github.com/tester' },
  },
  projects: [PROJECT_A, PROJECT_B],
  stats: { totalStars: 10, npmPackages: 2, publicRepos: 3, forksReceived: 4 },
  activity: {
    window: '2026-09-18..20',
    pushes: 4,
    highlights: ['starred a/b'],
    fetchedAt: new Date().toISOString().slice(0, 10),
    daily: [{ date: '2026-09-18', events: 1, pushes: 1 }, { date: '2026-09-19', events: 0, pushes: 0 }, { date: '2026-09-20', events: 3, pushes: 3 }],
  },
  sections: {},
  history: [{ date: '2026-09-18', totalStars: 8, totalDownloads: 50 }, { date: '2026-09-20', totalStars: 10, totalDownloads: 100 }],
};

const SHOWCASE = {
  intro: { headline: 'A headline.', paragraphs: ['One paragraph.'] },
  problems: [{ name: 'tool-a', kicker: 'Rule', headline: 'A problem.', problem: 'Broke.', answer: 'Fixed.', highlights: ['One'], size: 'default', demo: 'git' }],
  principles: [],
  colophon: [],
};

const IDS = [
  'avatar', 'display-name', 'class-title', 'intro-headline', 'intro-paragraphs', 'data-notice',
  'problems', 'hero-stats', 'problem-list', 'colophon', 'campfire', 'activity-panel', 'github-link',
  'campfire-year', 'data-age', 'nav-github', 'hero-github',
];

const SIZE_BEFORE = `stale text that should never win`;

function prepare(dom) {
  for (const id of IDS) {
    register(dom.document, id);
    if (id === 'hero-stats') {
      const stat = element('div');
      stat.className = 'stat';
      const value = element('dd');
      value.className = 'stat-value';
      stat.appendChild(value);
      dom.document.getElementById('hero-stats').appendChild(stat);
    }
  }
  for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[name="twitter:title"]', 'meta[name="twitter:description"]']) {
    registerQuery(dom.document, selector);
  }
  registerQuery(dom.document, '.nav-links', element());
}

function flush(rounds = 8) {
  let chain = Promise.resolve();
  for (let index = 0; index < rounds; index += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

test('renderIdentity writes the title, identity text, metadata, and links', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    const { renderIdentity } = await import('../assets/js/render.js');
    renderIdentity(DATA);
    assert.equal(dom.document.title, 'Tester · Testing things');
    assert.equal(dom.document.getElementById('display-name').textContent, 'Tester');
    assert.equal(dom.document.getElementById('class-title').textContent, 'Testing things');
    assert.equal(dom.document.getElementById('avatar').src, 'assets/avatar.png');
    assert.equal(dom.document.getElementById('avatar').alt, 'Tester');
    assert.equal(dom.document.querySelector('meta[name="description"]').getAttribute('content'), 'A tagline for the tester.');
    assert.equal(dom.document.getElementById('nav-github').href, 'https://github.com/tester');
    assert.equal(dom.document.getElementById('hero-github').href, 'https://github.com/tester');
  });
});

test('renderIntro writes the headline and one paragraph per entry', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    const { renderIntro } = await import('../assets/js/render.js');
    renderIntro(SHOWCASE);
    assert.equal(dom.document.getElementById('intro-headline').textContent, 'A headline.');
    const paragraphs = dom.document.getElementById('intro-paragraphs');
    assert.equal(paragraphs.children.length, 1);
    assert.equal(paragraphs.children[0].textContent, 'One paragraph.');
  });
});

test('renderIntro leaves pre-rendered paragraphs and the headline alone', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    const { renderIntro } = await import('../assets/js/render.js');
    const paragraphs = dom.document.getElementById('intro-paragraphs');
    paragraphs.appendChild(element('p'));
    paragraphs.children[0].textContent = 'pre-rendered';
    dom.document.getElementById('intro-headline').textContent = 'pre-rendered headline';
    renderIntro(SHOWCASE);
    assert.equal(paragraphs.children.length, 1);
    assert.equal(paragraphs.children[0].textContent, 'pre-rendered');
    assert.equal(dom.document.getElementById('intro-headline').textContent, 'pre-rendered headline');
  });
});

test('renderHeroStats renders three stats and animates them on first view', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    const { renderHeroStats } = await import('../assets/js/render.js');
    renderHeroStats(DATA);
    const list = dom.document.getElementById('hero-stats');
    assert.equal(list.children.length, 3);
    const value = list.children[0].children[1];
    assert.equal(value.textContent, '0');
    for (const observer of dom.observers) observer.trigger([{ isIntersecting: true }]);
    while (dom.pendingFrames() > 0) dom.runFrame(dom.performance.now() + 1000);
    assert.equal(value.textContent, '10');
    assert.equal(list.children[0].children[2].textContent, '10');
  });
});

test('renderProblems mounts a demo into every pre-rendered card that names one', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    const article = element('article');
    article.id = 'problem-tool-a';
    const command = element('code');
    command.className = 'install-command';
    command.textContent = 'pi install npm:tool-a';
    const box = element('div');
    box.className = 'problem-demo';
    box.setAttribute('data-demo', 'git');
    article.appendChild(command);
    article.appendChild(box);
    dom.document.getElementById('problem-list').appendChild(article);
    const { renderProblems } = await import('../assets/js/render.js');
    renderProblems();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const button = findAll(article, (node) => node.classList?.contains('copy-btn') === true)[0];
    assert.ok(button);
    assert.equal(box.querySelector('.demo') !== null, true);
  }, { IntersectionObserver: undefined, matchMedia: () => ({ matches: true }) });
});

test('renderActivity draws the chart, facts, highlights, and history panel', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    const { renderActivity } = await import('../assets/js/render.js');
    await renderActivity(DATA);
    await flush();
    const panel = dom.document.getElementById('activity-panel');
    assert.ok(findAll(panel, (node) => node.classList?.contains('activity-chart') === true)[0]);
    assert.ok(findAll(panel, (node) => node.classList?.contains('activity-highlights') === true)[0]);
    assert.ok(findAll(panel, (node) => node.classList?.contains('growth') === true)[0]);
    assert.match(findAll(panel, (node) => node.classList?.contains('activity-facts') === true)[0].textContent, /3 public repositories/);
  });
});

test('renderActivity skips the chart and highlights for empty data', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    const { renderActivity } = await import('../assets/js/render.js');
    await renderActivity({ ...DATA, activity: { window: '2026-09-20', pushes: 0, highlights: [], fetchedAt: '2026-09-20', daily: [] }, history: [] });
    await flush();
    const panel = dom.document.getElementById('activity-panel');
    assert.equal(findAll(panel, (node) => node.classList?.contains('activity-chart') === true).length, 0);
    assert.equal(findAll(panel, (node) => node.classList?.contains('activity-highlights') === true).length, 0);
  });
});

test('renderFooter writes the link, the year, and the staleness notice', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    const { renderFooter } = await import('../assets/js/render.js');
    renderFooter(DATA);
    assert.equal(dom.document.getElementById('github-link').href, 'https://github.com/tester');
    assert.equal(dom.document.getElementById('github-link').textContent, 'Tester on GitHub');
    assert.match(dom.document.getElementById('campfire-year').textContent, /© \d{4} Tester/);
    assert.equal(dom.document.getElementById('data-age').hidden, true);

    const stale = { ...DATA, activity: { ...DATA.activity, fetchedAt: '2000-01-01' } };
    renderFooter(stale);
    assert.equal(dom.document.getElementById('data-age').hidden, false);
    assert.match(dom.document.getElementById('data-age').textContent, /daily refresh last updated/);
  });
});

test('applyVisibility hides every section the data turns off', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    const { applyVisibility } = await import('../assets/js/render.js');
    applyVisibility({ showAbout: false, showProblems: false, showHeroStats: false, showCampfire: false }, SHOWCASE);
    assert.equal(dom.document.getElementById('problems').hidden, true);
    assert.equal(dom.document.getElementById('colophon').hidden, true);
    assert.equal(dom.document.getElementById('campfire').hidden, true);
    assert.equal(dom.document.getElementById('hero-stats').hidden, true);
    applyVisibility({}, SHOWCASE);
    assert.equal(dom.document.getElementById('problems').hidden, false);
  });
});

test('renderDegradedNotice reveals the notice before writing the message', async () => {
  await withDom(async (dom) => {
    prepare(dom);
    const { renderDegradedNotice } = await import('../assets/js/render.js');
    const notice = dom.document.getElementById('data-notice');
    notice.hidden = true;
    renderDegradedNotice('degraded');
    assert.equal(notice.hidden, false);
    assert.equal(notice.textContent, 'degraded');
  });
});

test('renderDegradedNotice does nothing when the page has no notice element', async () => {
  await withDom(async (dom) => {
    const { renderDegradedNotice } = await import('../assets/js/render.js');
    assert.doesNotThrow(() => renderDegradedNotice('degraded'));
    assert.equal(dom.document.getElementById('data-notice'), null);
  });
});

test('SIZE_BEFORE is a plain string constant', () => {
  assert.equal(SIZE_BEFORE, 'stale text that should never win');
});

test('renderIdentity tolerates a page with no identity targets', async () => {
  await withDom(async () => {
    const { renderIdentity } = await import('../assets/js/render.js');
    assert.doesNotThrow(() => renderIdentity({ identity: { displayName: 'T', classTitle: 'C', tagline: 'G', avatarUrl: 'a.png', links: {} } }));
  });
});

test('renderIntro tolerates a page without the paragraph container', async () => {
  await withDom(async (dom) => {
    const { renderIntro } = await import('../assets/js/render.js');
    assert.doesNotThrow(() => renderIntro(SHOWCASE));
    assert.equal(dom.document.getElementById('intro-headline'), null);
  });
});

test('renderHeroStats and renderProblems tolerate missing containers', async () => {
  await withDom(async () => {
    const { renderHeroStats, renderProblems } = await import('../assets/js/render.js');
    assert.doesNotThrow(() => renderHeroStats(DATA));
    assert.doesNotThrow(() => renderProblems());
  });
});

test('renderActivity tolerates a page without the panel and missing history', async () => {
  await withDom(async () => {
    const { renderActivity } = await import('../assets/js/render.js');
    assert.doesNotThrow(() => renderActivity(DATA));
  });
  await withDom(async (dom) => {
    prepare(dom);
    const { renderActivity } = await import('../assets/js/render.js');
    await renderActivity({ ...DATA, activity: { ...DATA.activity, fetchedAt: null }, history: [] });
    assert.equal(findAll(dom.document.getElementById('activity-panel'), (node) => node.classList?.contains('activity-note') === true).length, 0);
  });
});

test('renderFooter tolerates a page without footer targets', async () => {
  await withDom(async () => {
    const { renderFooter } = await import('../assets/js/render.js');
    assert.doesNotThrow(() => renderFooter(DATA));
  });
});
