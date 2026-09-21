import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyVisibility,
  renderActivity,
  renderDegradedNotice,
  renderEvidence,
  renderFooter,
  renderHeroStats,
  renderIdentity,
  renderIntro,
  renderProblems,
  renderStructuredData,
} from '../assets/js/render.js';
import { element, findAll, register, registerQuery, withDom } from './dom.mjs';

const PROJECT_A = {
  name: 'tool-a',
  description: 'A tool.',
  language: 'TypeScript',
  license: 'MIT',
  stars: 12,
  forks: 4,
  npm: 'tool-a',
  url: 'https://github.com/tester/tool-a',
  npmWeeklyDownloads: 34,
  pushedAt: '2026-09-17T20:24:02Z',
};

const PROJECT_B = { name: 'tool-b', url: 'https://github.com/tester/tool-b' };
const PROJECT_C = { name: 'tool-c', url: 'https://github.com/tester/tool-c', stars: 0, forks: 0 };
const PROJECT_D = { name: 'tool-d', url: 'https://github.com/tester/tool-d', stars: 0, forks: 0 };

const DATA = {
  identity: {
    displayName: 'Tester',
    classTitle: 'Testing things',
    tagline: 'A tagline.',
    avatarUrl: 'avatar.png?s=108',
    links: { github: 'https://github.com/tester' },
  },
  projects: [PROJECT_A, PROJECT_B, PROJECT_C, PROJECT_D],
  stats: { totalStars: 12, npmPackages: 1, publicRepos: 3, forksReceived: 2 },
  activity: {
    pushes: 7,
    window: '2026-09-03..17',
    fetchedAt: '2026-09-18',
    highlights: ['closed issue #1'],
    daily: [
      { date: '2026-09-03', events: 2, pushes: 2 },
      { date: '2026-09-04', events: 0, pushes: 0 },
    ],
  },
  history: [
    { date: '2026-09-16', totalStars: 10, totalDownloads: 30 },
    { date: '2026-09-17', totalStars: 12, totalDownloads: 34 },
  ],
  sections: {},
};

const SHOWCASE = {
  intro: { headline: 'A headline.', paragraphs: ['One paragraph.', 'Two.'] },
  problems: [
    { name: 'tool-a', kicker: 'Kicker', headline: 'The first failure', problem: 'Something broke.', answer: 'I fixed it.', highlights: ['One', 'Two'], demo: 'hashline', size: 'hero' },
    { name: 'tool-b', kicker: 'Kicker', headline: 'The second failure', problem: 'Broke again.', answer: 'Fixed again.', highlights: ['Three'], demo: 'trace', size: 'default' },
    { name: 'tool-c', kicker: 'Kicker', headline: 'The third failure', problem: 'Broke twice.', answer: 'Fixed twice.', highlights: ['Four'], demo: 'ghost-demo', size: 'default' },
    { name: 'tool-d', kicker: 'Kicker', headline: 'The fourth failure', problem: 'No demo.', answer: 'Still fixed.', highlights: ['Five'], size: 'default' },
  ],
  evidence: {
    name: 'tool-b',
    kicker: 'Evidence',
    headline: 'The evidence',
    problem: 'Proof?',
    answer: 'Here.',
    highlights: ['Trace'],
    demo: 'trace',
    intro: 'The figures come from committed reports.',
  },
  principles: ['Principle one'],
  colophon: ['Paragraph one.'],
};

const BENCHMARK = {
  source: 'https://github.com/YuGiMob/pi-edit-benchmark',
  reportUrl: 'https://github.com/YuGiMob/pi-edit-benchmark/blob/main/results/llm-report.json',
  tracesUrl: 'https://github.com/YuGiMob/pi-edit-benchmark/tree/main/results/traces',
  generatedAt: '2026-09-20T12:03:04.357Z',
  models: 1,
  scenarios: 1,
  focusCounts: { core: 1, staleness: 0, 'served-state': 0 },
  contenderCount: 1,
  runsPerContender: 1,
  totalRuns: 1,
  costUsd: 0.1,
  contenders: [
    { id: 'tool-a', label: 'tool-a', version: '1.0.0', highlight: true, overall: 100, safety: null, served: null, low: 20, high: 100, runs: 1, passed: 1, errors: 0, outcomes: { applied: 1 }, traceUrl: 'https://github.com/tester/trace.json' },
  ],
};

function seedProblemCards(dom) {
  const list = register(dom.document, 'problem-list');
  for (const entry of SHOWCASE.problems) {
    const article = element('article');
    article.id = `problem-${entry.name}`;
    const box = element('div');
    box.className = 'problem-demo';
    if (entry.demo) box.setAttribute('data-demo', entry.demo);
    article.appendChild(box);
    const command = element('code');
    command.className = 'install-command';
    command.textContent = `npm i ${entry.name}`;
    article.appendChild(command);
    list.appendChild(article);
  }
  return list;
}

function seedEvidence(dom) {
  register(dom.document, 'evidence');
  const body = register(dom.document, 'evidence-body');
  const article = element('div');
  article.className = 'evidence';
  article.id = `problem-${SHOWCASE.evidence.name}`;
  const chart = element('div');
  chart.className = 'problem-demo';
  const matrix = element('div');
  matrix.className = 'evidence-matrix';
  const trace = element('div');
  trace.className = 'evidence-trace';
  if (SHOWCASE.evidence.demo) trace.setAttribute('data-demo', SHOWCASE.evidence.demo);
  const command = element('code');
  command.className = 'install-command';
  command.textContent = `npm i ${SHOWCASE.evidence.name}`;
  article.append(chart, matrix, trace, command);
  body.appendChild(article);
  register(dom.document, `problem-${SHOWCASE.evidence.name}`, article);
  register(dom.document, 'evidence-kicker');
  register(dom.document, 'evidence-heading');
  return body;
}

const classes = (node, name) => findAll(node, (entry) => entry.classList?.contains(name) === true);

function runFrames(dom, limit = 40) {
  let count = 0;
  while (count < limit && dom.runFrame(dom.advance(200))) count += 1;
}

async function flush(rounds = 5) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function matrixFetch() {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ models: ['m'], scenarios: [{ id: 'single-line', focus: 'core' }], contenders: ['tool-a'], cells: [[[[0], 1]]] }),
  });
}

test('renderIdentity writes the title, identity text, metadata, and links', () => {
  withDom((dom) => {
    const avatar = register(dom.document, 'avatar');
    const displayName = register(dom.document, 'display-name');
    const classTitle = register(dom.document, 'class-title');
    const navGithub = register(dom.document, 'nav-github');
    const heroGithub = register(dom.document, 'hero-github');
    const description = registerQuery(dom.document, 'meta[name="description"]');
    const ogTitle = registerQuery(dom.document, 'meta[property="og:title"]');
    const ogDescription = registerQuery(dom.document, 'meta[property="og:description"]');
    const twitterTitle = registerQuery(dom.document, 'meta[name="twitter:title"]');
    const twitterDescription = registerQuery(dom.document, 'meta[name="twitter:description"]');

    renderIdentity(DATA);
    assert.equal(dom.document.title, 'Tester · Testing things');
    assert.equal(displayName.textContent, 'Tester');
    assert.equal(classTitle.textContent, 'Testing things');
    assert.equal(description.getAttribute('content'), 'A tagline.');
    assert.equal(ogTitle.getAttribute('content'), 'Tester · Testing things');
    assert.equal(ogDescription.getAttribute('content'), 'A tagline.');
    assert.equal(twitterTitle.getAttribute('content'), 'Tester · Testing things');
    assert.equal(twitterDescription.getAttribute('content'), 'A tagline.');
    assert.equal(avatar.getAttribute('src'), 'avatar.png?s=108');
    assert.equal(navGithub.getAttribute('href'), 'https://github.com/tester');
    assert.equal(heroGithub.getAttribute('href'), 'https://github.com/tester');

    renderIdentity({ ...DATA, identity: { ...DATA.identity, links: {} } });
    assert.equal(navGithub.getAttribute('href'), 'https://github.com/tester');
  });
});

test('renderIntro writes the headline and one paragraph per entry', () => {
  withDom((dom) => {
    const headline = register(dom.document, 'intro-headline');
    const paragraphs = register(dom.document, 'intro-paragraphs');
    renderIntro(SHOWCASE);
    assert.equal(headline.textContent, 'A headline.');
    assert.equal(paragraphs.childNodes.length, 2);
    assert.equal(paragraphs.textContent, 'One paragraph.Two.');
  });
  withDom(() => renderIntro({}));
});

test('renderIntro leaves pre-rendered paragraphs and the headline alone', () => {
  withDom((dom) => {
    const headline = register(dom.document, 'intro-headline');
    headline.textContent = 'Static headline.';
    const paragraphs = register(dom.document, 'intro-paragraphs');
    paragraphs.appendChild(element('p'));
    renderIntro(SHOWCASE);
    assert.equal(headline.textContent, 'Static headline.');
    assert.equal(paragraphs.childNodes.length, 1);
  });
});

test('renderHeroStats renders three stats and animates them on first view', () => {
  withDom((dom) => {
    const list = register(dom.document, 'hero-stats');
    renderHeroStats(DATA);
    assert.deepEqual(classes(list, 'stat-label').map((node) => node.textContent), ['GitHub stars', 'packages on npm', 'npm installs / week']);
    assert.deepEqual(classes(list, 'stat-value').map((node) => node.textContent), ['0', '0', '0']);
    assert.deepEqual(classes(list, 'sr-only').map((node) => node.textContent), ['12', '1', '34']);
    assert.equal(dom.observers.length, 3);

    for (const observer of dom.observers) observer.trigger([{ isIntersecting: true }]);
    runFrames(dom);
    assert.deepEqual(classes(list, 'stat-value').map((node) => node.textContent), ['12', '1', '34']);
  });
  withDom(() => renderHeroStats(DATA));
});

test('renderProblems mounts a demo into every pre-rendered card that names one', async () => {
  await withDom(async (dom) => {
    const container = seedProblemCards(dom);
    renderProblems();
    const boxes = classes(container, 'problem-demo');
    assert.equal(boxes.length, 4);
    assert.equal(boxes.filter((box) => box.classList.contains('is-loading')).length, 3);
    assert.equal(classes(container, 'install-command').length, 0);
    assert.deepEqual(classes(container, 'copy-btn').map((node) => node.textContent), ['npm i tool-a', 'npm i tool-b', 'npm i tool-c', 'npm i tool-d']);

    dom.window.dispatch('beforeprint');
    await flush();
    assert.equal(boxes.filter((box) => box.classList.contains('is-loading')).length, 0);
    assert.equal(classes(container, 'pg').length, 1);
    assert.equal(classes(container, 'demo').length, 1);
    assert.match(container.textContent, /This panel could not be loaded from the data\./);
    assert.equal(boxes[3].childNodes.length, 0);
  });
});

test('lazyMount waits for an intersecting entry before mounting', async () => {
  await withDom(async (dom) => {
    const container = seedProblemCards(dom);
    renderProblems();
    const observer = dom.observers[0];
    observer.trigger([{ isIntersecting: false }]);
    assert.equal(classes(container, 'pg').length, 0);
    assert.equal(observer.disconnected, false);
    observer.trigger([{ isIntersecting: true }]);
    await flush();
    assert.equal(observer.disconnected, true);
    assert.equal(classes(container, 'pg').length, 1);
    assert.equal(classes(container, 'problem-demo').filter((box) => box.classList.contains('is-loading')).length, 2);
  });
});

test('renderProblems mounts its demos immediately without an IntersectionObserver', async () => {
  await withDom(async (dom) => {
    const container = seedProblemCards(dom);
    renderProblems();
    await flush();
    assert.equal(classes(container, 'pg').length, 1);
    assert.equal(classes(container, 'problem-demo').filter((box) => box.classList.contains('is-loading')).length, 0);
  }, { IntersectionObserver: undefined });
});

test('renderEvidence hides the section when the showcase has no evidence', () => {
  withDom((dom) => {
    const section = register(dom.document, 'evidence');
    register(dom.document, 'evidence-body');
    renderEvidence({ ...SHOWCASE, evidence: null }, null, []);
    assert.equal(section.hidden, true);
  });
  withDom(() => renderEvidence(SHOWCASE, null, []));
});

test('renderEvidence mounts the chart, the matrix, and the trace into the pre-rendered panel', async () => {
  await withDom(async (dom) => {
    const body = seedEvidence(dom);
    renderEvidence(SHOWCASE, BENCHMARK, [{ date: '2026-09-20', overall: 100, safety: null, served: null }]);
    assert.equal(dom.document.getElementById('evidence-kicker').textContent, 'Evidence');
    assert.equal(classes(body, 'install-command').length, 0);
    assert.deepEqual(classes(body, 'copy-btn').map((node) => node.textContent), ['npm i tool-b']);
    assert.equal(dom.document.getElementById('evidence-heading').textContent, 'The evidence');
    assert.equal(classes(body, 'chart').length, 0);

    dom.window.dispatch('beforeprint');
    await flush();
    assert.equal(classes(body, 'chart').length, 2);
    assert.match(body.textContent, /Pass rate by editing tool/);
    assert.match(body.textContent, /Where each tool loses/);
    assert.equal(classes(body, 'demo').length, 1);
  }, { fetch: matrixFetch() });
});

test('renderEvidence notes a scenario matrix that cannot be fetched', async () => {
  const original = console.warn;
  console.warn = () => {};
  try {
    await withDom(async (dom) => {
      const body = seedEvidence(dom);
      renderEvidence(SHOWCASE, BENCHMARK, []);
      dom.window.dispatch('beforeprint');
      await flush();
      assert.equal(classes(body, 'matrix-table').length, 0);
      assert.match(body.textContent, /This panel could not be loaded from the data\./);
    }, { fetch: async () => { throw new TypeError('offline'); } });
  } finally {
    console.warn = original;
  }
});

test('renderEvidence explains a missing benchmark', () => {
  withDom((dom) => {
    const body = seedEvidence(dom);
    renderEvidence(SHOWCASE, null, []);
    assert.match(body.textContent, /benchmark block is missing/);
    assert.equal(classes(body, 'evidence-trace').length, 1);
  });
});

test('renderEvidence reports a chart that cannot be built', async () => {
  const original = console.warn;
  console.warn = () => {};
  try {
    await withDom(async (dom) => {
      const body = seedEvidence(dom);
      renderEvidence(SHOWCASE, { ...BENCHMARK, contenders: undefined }, []);
      dom.window.dispatch('beforeprint');
      await flush();
      assert.match(body.textContent, /This panel could not be loaded from the data\./);
    }, { fetch: matrixFetch() });
  } finally {
    console.warn = original;
  }
});

test('renderActivity draws the chart, facts, highlights, and history panel', async () => {
  await withDom(async (dom) => {
    const panel = register(dom.document, 'activity-panel');
    await renderActivity(DATA);
    await flush();
    assert.match(panel.textContent, /Public activity/);
    assert.match(panel.textContent, /7 pushes to public repositories, 2026-09-03 to 2026-09-17\./);
    assert.equal(classes(panel, 'activity-bar').length, 2);
    assert.equal(classes(panel, 'activity-bar').filter((bar) => bar.classList.contains('is-empty')).length, 1);
    assert.match(panel.textContent, /2 days recorded, 2 pushes total/);
    assert.match(panel.textContent, /3 public repositories · 2 forks received\./);
    assert.match(panel.textContent, /closed issue #1/);
    assert.match(panel.textContent, /fetched 2026-09-18/);
    assert.equal(classes(panel, 'growth').length, 1);
  });
  await withDom(async () => {
    await renderActivity(DATA);
  });
});

test('renderActivity skips the chart and highlights for empty data', async () => {
  await withDom(async (dom) => {
    const panel = register(dom.document, 'activity-panel');
    await renderActivity({ ...DATA, activity: { pushes: 0, window: '2026-09-20', fetchedAt: '2026-09-20' }, history: [] });
    assert.equal(classes(panel, 'activity-chart').length, 0);
    assert.equal(classes(panel, 'activity-highlights').length, 0);
    assert.match(panel.textContent, /0 pushes to public repositories\./);
  });
});

test('the activity chart keeps every bar inside the viewBox at the 120-day cap', () => {
  withDom((dom) => {
    const panel = register(dom.document, 'activity-panel');
    const daily = Array.from({ length: 120 }, (unused, index) => ({ date: `2026-01-${index + 1}`, events: index, pushes: index % 9 }));
    renderActivity({ ...DATA, activity: { ...DATA.activity, daily }, history: [] });
    const bars = findAll(panel, (node) => node.tagName === 'RECT');
    assert.equal(bars.length, 120);
    for (const bar of bars) assert.ok(Number(bar.getAttribute('width')) > 0, 'every bar has a positive width');
    const last = bars[bars.length - 1];
    assert.ok(Number(last.getAttribute('x')) + Number(last.getAttribute('width')) <= 320);
  });
});

test('renderFooter writes the link, the year, and the staleness notice', () => {
  withDom((dom) => {
    const github = register(dom.document, 'github-link');
    register(dom.document, 'campfire-year');
    const notice = register(dom.document, 'data-age');
    renderFooter({ ...DATA, activity: { fetchedAt: '2000-01-01' }, benchmark: { generatedAt: '2000-01-01T00:00:00Z' } });
    assert.equal(github.getAttribute('href'), 'https://github.com/tester');
    assert.equal(github.textContent, 'Tester on GitHub');
    assert.match(dom.document.getElementById('campfire-year').textContent, /© \d{4} Tester/);
    assert.equal(notice.hidden, false);
    assert.match(notice.textContent, /days ago; the newest benchmark report is \d+ days old\./);
  });
  withDom((dom) => {
    register(dom.document, 'data-age');
    const today = new Date().toISOString().slice(0, 10);
    renderFooter({ ...DATA, activity: { fetchedAt: today }, benchmark: { generatedAt: `${today}T00:00:00Z` } });
    assert.equal(dom.document.getElementById('data-age').hidden, true);
    assert.equal(dom.document.getElementById('data-age').textContent, '');
  });
  withDom(() => renderFooter(DATA));
});

test('applyVisibility hides every section the data turns off', () => {
  withDom((dom) => {
    const ids = ['problems', 'evidence', 'colophon', 'campfire', 'hero-stats'];
    const nodes = new Map(ids.map((id) => [id, register(dom.document, id)]));
    applyVisibility({ showProblems: false, showAbout: false, showHeroStats: false, showCampfire: false }, {});
    for (const id of ids) assert.equal(nodes.get(id).hidden, true);
  });
});

test('applyVisibility defaults to showing sections and follows the evidence block', () => {
  withDom((dom) => {
    const ids = ['problems', 'evidence', 'colophon', 'campfire', 'hero-stats'];
    const nodes = new Map(ids.map((id) => [id, register(dom.document, id)]));
    applyVisibility({}, { evidence: { name: 'tool' } });
    for (const id of ids) assert.equal(nodes.get(id).hidden, false);
    applyVisibility({}, {});
    assert.equal(nodes.get('evidence').hidden, true);
    applyVisibility({ showEvidence: false }, { evidence: { name: 'tool' } });
    assert.equal(nodes.get('evidence').hidden, true);
    assert.equal(nodes.get('problems').hidden, false);
  });
});

test('renderDegradedNotice reveals the notice before writing the message', () => {
  const notice = { hidden: true, hiddenWhenWritten: null, value: null };
  Object.defineProperty(notice, 'textContent', {
    get() {
      return this.value;
    },
    set(value) {
      this.hiddenWhenWritten = notice.hidden;
      this.value = value;
    },
  });
  withDom((dom) => {
    dom.document.elements.set('data-notice', notice);
    renderDegradedNotice('fallback in use');
  });
  assert.equal(notice.hiddenWhenWritten, false);
  assert.equal(notice.hidden, false);
  assert.equal(notice.textContent, 'fallback in use');
});

test('renderDegradedNotice does nothing when the page has no notice element', () => {
  withDom(() => renderDegradedNotice('fallback in use'));
});

test('renderStructuredData writes the JSON-LD through a text node', () => {
  withDom((dom) => {
    const target = register(dom.document, 'structured-data');
    renderStructuredData(DATA, SHOWCASE);
    assert.equal(target.childNodes.length, 1);
    assert.match(target.textContent, /"@type":"ItemList"/);
    assert.match(target.textContent, /"name":"tool-a"/);
  });
  withDom(() => renderStructuredData(DATA, SHOWCASE));
});

test('renderStructuredData never assigns textContent on the script element', () => {
  const script = {
    written: null,
    replaceChildren(node) {
      this.written = node.textContent;
    },
    set textContent(value) {
      throw new TypeError(`TrustedScript required, got ${value}`);
    },
  };
  withDom((dom) => {
    dom.document.elements.set('structured-data', script);
    renderStructuredData(DATA, SHOWCASE);
  });
  assert.match(script.written, /"@type":"ItemList"/);
});

test('renderStructuredData resolves the canonical URL for the machine-readable copy', () => {
  withDom((dom) => {
    const target = register(dom.document, 'structured-data');
    const canonical = registerQuery(dom.document, 'link[rel="canonical"]', element('link'));
    canonical.href = 'https://yugimob.github.io/';
    renderStructuredData(DATA, SHOWCASE);
    assert.match(target.textContent, /"image":"https:\/\/yugimob\.github\.io\/avatar\.png\?s=108"/);
  });
});
