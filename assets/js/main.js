import { hydrateAvatar } from './avatar.js';
import { el, append, link, copyButton, formatNumber, animateValue, svg } from './ui.js';
import { buildDemo } from './demos.js';
import { buildPlayground } from './playground.js';
import { benchmarkChart } from './charts.js';

const DATA_URL = 'data/site-data.json';
const SHOWCASE_URL = 'data/showcase.json';

function isValidSiteData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  for (const key of ['identity', 'projects', 'stats', 'activity', 'sections']) {
    if (!(key in data)) return false;
  }
  if (!data.identity || typeof data.identity !== 'object' || Array.isArray(data.identity)) return false;
  if (!Array.isArray(data.projects) || data.projects.length === 0) return false;
  if (!data.stats || typeof data.stats !== 'object' || Array.isArray(data.stats)) return false;
  if (!data.activity || typeof data.activity !== 'object' || Array.isArray(data.activity)) return false;
  if (!data.sections || typeof data.sections !== 'object' || Array.isArray(data.sections)) return false;
  return true;
}

async function fetchJson(url) {
  const options = { cache: 'no-cache' };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') options.signal = AbortSignal.timeout(6000);
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

function fallbackShowcase(data) {
  const paragraphs = data.about?.paragraphs ?? [];
  return {
    intro: { headline: data.identity.classTitle, paragraphs },
    problems: data.projects.map((project) => ({
      name: project.name,
      kicker: project.language || 'Project',
      headline: project.description || project.name,
      problem: 'The full story for this tool could not be loaded.',
      answer: project.description || 'Public repository.',
      highlights: ['Public repository'],
      size: 'default',
    })),
    evidence: null,
    principles: [],
    colophon: paragraphs,
  };
}

function observeVisibility(element, onShow, onHide) {
  if (typeof IntersectionObserver !== 'function') {
    onShow();
    return null;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) onShow();
      else onHide();
    }
  }, { rootMargin: '120px 0px', threshold: 0.12 });
  observer.observe(element);
  return observer;
}

function setupNav() {
  const links = [...document.querySelectorAll('[data-nav]')];
  const sections = links.map((anchor) => document.getElementById(anchor.dataset.nav)).filter(Boolean);
  if (sections.length === 0 || typeof IntersectionObserver !== 'function') return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const anchor of links) anchor.classList.toggle('is-current', anchor.dataset.nav === entry.target.id);
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  for (const section of sections) observer.observe(section);
}

function setupAnchorAlignment() {
  let pending = null;
  const align = () => {
    const id = window.location.hash.replace('#', '');
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const desired = Math.round(target.getBoundingClientRect().top + window.scrollY - padding);
    if (Math.abs(desired - window.scrollY) < 6) return;
    window.scrollTo({ top: desired });
  };
  const cancel = () => {
    if (pending) clearTimeout(pending);
    pending = null;
  };
  const schedule = () => {
    cancel();
    pending = setTimeout(() => {
      pending = null;
      align();
    }, 1500);
  };
  window.addEventListener('hashchange', schedule);
  for (const anchor of document.querySelectorAll('a[href^="#"]')) anchor.addEventListener('click', schedule);
  for (const type of ['wheel', 'touchstart', 'keydown']) window.addEventListener(type, cancel, { passive: true });
  if (window.location.hash) schedule();
}

function setupChrome() {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  const update = () => bar.classList.toggle('is-scrolled', window.scrollY > 12);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node && value) node.textContent = value;
}

function setMeta(selector, value) {
  const node = document.querySelector(selector);
  if (node && value) node.setAttribute('content', value);
}

function renderIdentity(data) {
  const identity = data.identity;
  hydrateAvatar(document.getElementById('avatar'), identity.avatarUrl, identity.displayName);
  document.title = `${identity.displayName} · ${identity.classTitle}`;
  setText('display-name', identity.displayName);
  setText('class-title', identity.classTitle);
  setMeta('meta[name="description"]', identity.tagline);
  setMeta('meta[property="og:title"]', `${identity.displayName} · ${identity.classTitle}`);
  setMeta('meta[property="og:description"]', identity.tagline);
  setMeta('meta[name="twitter:title"]', `${identity.displayName} · ${identity.classTitle}`);
  setMeta('meta[name="twitter:description"]', identity.tagline);
  const navGithub = document.getElementById('nav-github');
  if (navGithub && identity.links?.github) navGithub.href = identity.links.github;
  const heroGithub = document.getElementById('hero-github');
  if (heroGithub && identity.links?.github) heroGithub.href = identity.links.github;
}

function renderIntro(showcase) {
  setText('intro-headline', showcase.intro?.headline);
  const paragraphs = document.getElementById('intro-paragraphs');
  if (!paragraphs) return;
  for (const paragraph of showcase.intro?.paragraphs ?? []) {
    paragraphs.appendChild(el('p', 'intro-paragraph', paragraph));
  }
}

function renderHeroStats(data) {
  const list = document.getElementById('hero-stats');
  if (!list) return;
  const totalDownloads = data.projects.reduce((sum, project) => sum + (project.npmWeeklyDownloads || 0), 0);
  const stats = [
    ['GitHub stars', data.stats.totalStars ?? 0],
    ['packages on npm', data.stats.npmPackages ?? 0],
    ['npm installs / week', totalDownloads],
  ];
  for (const [label, value] of stats) {
    const item = el('div', 'stat');
    const dd = el('dd', 'stat-value', '0');
    append(item, el('dt', 'stat-label', label), dd);
    list.appendChild(item);
    let animated = false;
    observeVisibility(dd, () => {
      if (animated) return;
      animated = true;
      animateValue(dd, value);
    }, () => {});
  }
}

function metricChip(label, value) {
  const chip = el('span', 'chip');
  append(chip, el('span', 'chip-label', label), el('span', 'chip-value', value));
  return chip;
}

function installActions(project) {
  const actions = el('div', 'actions');
  if (project.npm) {
    actions.appendChild(link(`https://www.npmjs.com/package/${project.npm}`, 'npm ↗', 'action-link'));
    actions.appendChild(copyButton(`npm i ${project.npm}`, `npm i ${project.npm}`, `copy install command for ${project.npm}`));
  }
  actions.appendChild(link(project.url, 'GitHub ↗', 'action-link'));
  return actions;
}

function projectChips(project) {
  const chips = el('div', 'chips');
  chips.appendChild(metricChip('stars', formatNumber(project.stars ?? 0)));
  if (project.npmWeeklyDownloads) chips.appendChild(metricChip('installs/wk', formatNumber(project.npmWeeklyDownloads)));
  if (project.language) chips.appendChild(metricChip('language', project.language));
  if (project.license) chips.appendChild(metricChip('license', project.license));
  if (project.pushedAt) chips.appendChild(metricChip('updated', String(project.pushedAt).slice(0, 10)));
  return chips;
}

function answerBlock(entry, project) {
  const answer = el('div', 'answer');
  answer.appendChild(el('p', 'answer-label', 'What I built'));
  const name = el('h4', 'answer-name');
  name.appendChild(link(project.url, project.name));
  answer.appendChild(name);
  answer.appendChild(el('p', 'answer-text', entry.answer));
  const points = el('ul', 'answer-points');
  for (const highlight of entry.highlights) points.appendChild(el('li', 'answer-point', highlight));
  answer.appendChild(points);
  answer.appendChild(projectChips(project));
  answer.appendChild(installActions(project));
  return answer;
}

function problemHead(number, entry) {
  const head = el('header', 'problem-head');
  const heading = el('div', 'problem-heading');
  append(heading, el('p', 'problem-kicker', entry.kicker), el('h3', 'problem-title', entry.headline));
  append(head, el('span', 'problem-number', number), heading);
  return head;
}

function mountDemo(entry, cleanups) {
  const box = el('div', 'problem-demo');
  const demo = entry.demo === 'hashline' ? buildPlayground() : entry.demo ? buildDemo(entry.demo) : null;
  if (!demo) return box;
  append(box, demo.node, demo.caption);
  const observer = observeVisibility(demo.node, () => demo.start(), () => demo.stop());
  cleanups.push(() => {
    if (observer) observer.disconnect();
    demo.destroy();
  });
  return box;
}

function renderProblemIndex(showcase) {
  const list = document.getElementById('problem-index');
  if (!list) return;
  const rows = showcase.problems.map((problem) => ({
    href: `#problem-${problem.name}`,
    headline: problem.headline,
    tool: problem.name,
  }));
  if (showcase.evidence) {
    rows.push({ href: '#evidence', headline: showcase.evidence.headline, tool: showcase.evidence.name });
  }
  rows.forEach((row, index) => {
    const anchor = el('a', 'index-link');
    anchor.href = row.href;
    append(
      anchor,
      el('span', 'index-number', String(index + 1).padStart(2, '0')),
      el('span', 'index-headline', row.headline),
      el('span', 'index-tool', row.tool),
      el('span', 'index-arrow', '→'),
    );
    const item = el('li', 'index-row');
    item.appendChild(anchor);
    list.appendChild(item);
  });
}

function renderProblems(showcase, projects) {
  const container = document.getElementById('problem-list');
  if (!container) return [];
  const cleanups = [];
  showcase.problems.forEach((entry, index) => {
    const project = projects.get(entry.name);
    if (!project) return;
    const article = el('article', `problem${entry.size === 'hero' ? ' is-hero' : ''}`);
    article.id = `problem-${entry.name}`;
    article.appendChild(problemHead(String(index + 1).padStart(2, '0'), entry));
    article.appendChild(el('p', 'problem-statement', entry.problem));
    const grid = el('div', 'problem-grid');
    const copy = el('div', 'problem-copy');
    copy.appendChild(answerBlock(entry, project));
    append(grid, copy, mountDemo(entry, cleanups));
    article.appendChild(grid);
    container.appendChild(article);
  });
  return cleanups;
}

function renderEvidence(showcase, projects) {
  const section = document.getElementById('evidence');
  const body = document.getElementById('evidence-body');
  const evidence = showcase.evidence;
  if (!section || !body) return [];
  if (!evidence) {
    section.hidden = true;
    return [];
  }
  const project = projects.get(evidence.name);
  setText('evidence-kicker', evidence.kicker);
  setText('evidence-heading', evidence.headline);
  if (evidence.intro) body.appendChild(el('p', 'section-lede', evidence.intro));
  const article = el('div', 'evidence');
  article.id = `problem-${evidence.name}`;
  article.appendChild(el('p', 'problem-statement', evidence.problem));
  const cleanups = [];
  const grid = el('div', 'problem-grid');
  const copy = el('div', 'problem-copy');
  if (project) copy.appendChild(answerBlock(evidence, project));
  const demoBox = el('div', 'problem-demo is-wide');
  if (evidence.benchmark) {
    const chart = benchmarkChart(evidence.benchmark);
    chart.node.classList.add('is-wide');
    demoBox.appendChild(chart.node);
    const observer = observeVisibility(chart.node, () => chart.start(), () => chart.stop());
    cleanups.push(() => {
      if (observer) observer.disconnect();
      chart.stop();
    });
  }
  append(grid, copy, demoBox);
  article.appendChild(grid);
  if (evidence.demo) {
    const trace = buildDemo(evidence.demo);
    if (trace) {
      const box = el('div', 'evidence-trace');
      append(box, trace.node);
      article.appendChild(box);
      const observer = observeVisibility(trace.node, () => trace.start(), () => trace.stop());
      cleanups.push(() => {
        if (observer) observer.disconnect();
        trace.destroy();
      });
    }
  }
  body.appendChild(article);
  return cleanups;
}

function renderColophon(showcase) {
  const prose = document.getElementById('colophon-prose');
  if (prose) {
    for (const paragraph of showcase.colophon ?? []) prose.appendChild(el('p', 'colophon-paragraph', paragraph));
  }
  const principles = document.getElementById('principles');
  if (principles) {
    for (const principle of showcase.principles ?? []) principles.appendChild(el('li', 'principle', principle));
  }
}

function formatWindow(range) {
  const [start, end] = String(range).split('..');
  if (!end) return range;
  if (end.length === 2) return `${start} to ${start.slice(0, 8)}${end}`;
  return `${start} to ${end}`;
}

function activityChart(daily) {
  const width = 320;
  const height = 44;
  const gap = 3;
  const barWidth = (width - gap * (daily.length - 1)) / daily.length;
  const peak = Math.max(1, ...daily.map((entry) => entry.pushes));
  const chart = svg('svg', {
    class: 'activity-chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `Pushes per day, ${daily[0].date} to ${daily[daily.length - 1].date}`,
  });
  daily.forEach((entry, index) => {
    const value = Math.max(0, entry.pushes);
    const barHeight = Math.max(value > 0 ? 2 : 1, Math.round((value / peak) * (height - 4)));
    const bar = svg('rect', {
      x: index * (barWidth + gap),
      y: height - barHeight,
      width: barWidth,
      height: barHeight,
      rx: 1.5,
      class: value > 0 ? 'activity-bar' : 'activity-bar is-empty',
    });
    const label = svg('title');
    label.textContent = `${entry.date}: ${value} ${value === 1 ? 'push' : 'pushes'}`;
    bar.appendChild(label);
    chart.appendChild(bar);
  });
  return chart;
}

function renderActivity(data) {
  const panel = document.getElementById('activity-panel');
  const activity = data.activity;
  if (!panel || !activity) return;
  panel.appendChild(el('h3', 'activity-title', 'Public activity'));
  const line = el('p', 'activity-line');
  append(line, `${formatNumber(activity.pushes ?? 0)} pushes to public repositories, `, el('span', 'activity-window', formatWindow(activity.window)), '.');
  panel.appendChild(line);
  const daily = Array.isArray(activity.daily) ? activity.daily : [];
  if (daily.length > 0) panel.appendChild(activityChart(daily));
  if (activity.fetchedAt) panel.appendChild(el('p', 'activity-note', `GitHub public events, fetched ${activity.fetchedAt}.`));
}

function renderFooter(identity) {
  const githubLink = document.getElementById('github-link');
  if (githubLink) {
    githubLink.href = identity.links?.github || 'https://github.com/YuGiMob';
    githubLink.textContent = `${identity.displayName} on GitHub`;
  }
  setText('campfire-year', `© ${new Date().getFullYear()} ${identity.displayName}`);
}

function renderStructuredData(data, showcase) {
  const target = document.getElementById('structured-data');
  if (!target) return;
  const names = [
    ...showcase.problems.map((problem) => problem.name),
    ...(showcase.evidence ? [showcase.evidence.name] : []),
  ];
  const byName = new Map(data.projects.map((project) => [project.name, project]));
  const items = names
    .map((name) => byName.get(name))
    .filter(Boolean)
    .map((project, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'SoftwareSourceCode',
        name: project.name,
        description: project.description || undefined,
        codeRepository: project.url,
        programmingLanguage: project.language || undefined,
        license: project.license ? `https://spdx.org/licenses/${project.license}` : undefined,
        url: project.url,
      },
    }));
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        name: data.identity.displayName,
        description: data.identity.tagline,
        url: 'https://yugimob.github.io/',
        image: data.identity.avatarUrl,
        sameAs: [data.identity.links?.github].filter(Boolean),
        knowsAbout: showcase.principles ?? [],
      },
      {
        '@type': 'ItemList',
        name: `${data.identity.displayName} artifacts`,
        itemListElement: items,
      },
    ],
  };
  target.textContent = JSON.stringify(graph);
}

function applyVisibility(sections, showcase) {
  const setHidden = (id, hidden) => {
    const node = document.getElementById(id);
    if (node) node.hidden = hidden;
  };
  const showArtifacts = sections.showArtifacts ?? true;
  setHidden('problems', !showArtifacts);
  setHidden('evidence', !(showArtifacts && Boolean(showcase.evidence)));
  setHidden('colophon', !(sections.showBackground ?? true));
  setHidden('campfire', !(sections.showCampfire ?? true));
  const stats = document.getElementById('hero-stats');
  if (stats) stats.hidden = !(sections.showAbilityScores ?? true);
}

async function init() {
  const [data, showcaseRaw] = await Promise.all([
    fetchJson(DATA_URL),
    fetchJson(SHOWCASE_URL).catch(() => null),
  ]);
  if (!isValidSiteData(data)) throw new Error('invalid site data');
  const showcase = showcaseRaw || fallbackShowcase(data);
  const projects = new Map(data.projects.map((project) => [project.name, project]));

  renderIdentity(data);
  renderIntro(showcase);
  renderHeroStats(data);
  renderProblemIndex(showcase);
  renderProblems(showcase, projects);
  renderEvidence(showcase, projects);
  renderColophon(showcase);
  renderActivity(data);
  renderFooter(data.identity);
  renderStructuredData(data, showcase);
  applyVisibility(data.sections, showcase);
  setupNav();
  setupAnchorAlignment();
  setupChrome();
}

init().catch((error) => {
  console.warn('YuGiMob:', error);
  setText('intro-headline', 'This page could not load its data.');
  setText('display-name', 'YuGiMob');
  const paragraphs = document.getElementById('intro-paragraphs');
  if (paragraphs) paragraphs.appendChild(el('p', 'intro-paragraph', 'Check data/site-data.json and data/showcase.json.'));
});
