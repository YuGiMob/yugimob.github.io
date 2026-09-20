import { hydrateAvatar } from './avatar.js';
import { el, append, link, copyButton, formatNumber, extent, animateValue, svg, setText, setMeta, observeVisibility, timeNode } from './ui.js';
import { lazyMount } from './lazy.js';
import { loadDemo } from './demo-registry.js';
import { fetchJson } from './fetch-json.js';
import {
  activityLine,
  heroStatRows,
  problemEntries,
  problemIndexRows,
  problemId,
  problemsHeading,
  projectChipRows,
  repositoryFacts,
  stalenessNotice,
  structuredData,
} from './view-model.js';

export function renderIdentity(data) {
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

export function renderIntro(showcase) {
  setText('intro-headline', showcase.intro?.headline);
  const paragraphs = document.getElementById('intro-paragraphs');
  if (!paragraphs) return;
  for (const paragraph of showcase.intro?.paragraphs ?? []) {
    paragraphs.appendChild(el('p', 'intro-paragraph', paragraph));
  }
}

export function renderHeroStats(data) {
  const list = document.getElementById('hero-stats');
  if (!list) return;
  list.replaceChildren();
  for (const stat of heroStatRows(data)) {
    const item = el('div', 'stat');
    const dd = el('dd', 'stat-value', '0');
    append(item, el('dt', 'stat-label', stat.label), dd);
    list.appendChild(item);
    let animated = false;
    observeVisibility(dd, () => {
      if (animated) return;
      animated = true;
      animateValue(dd, stat.value);
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
  for (const chip of projectChipRows(project)) chips.appendChild(metricChip(chip.label, chip.value));
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
  const heading = el('div');
  append(heading, el('p', 'problem-kicker', entry.kicker), el('h3', 'problem-title', entry.headline));
  append(head, el('span', 'problem-number', number), heading);
  return head;
}

function mountDemo(entry) {
  const box = el('div', 'problem-demo');
  if (entry.demo) {
    lazyMount(box, () => loadDemo(entry.demo));
  }
  return box;
}

export function renderProblemIndex(showcase, projects) {
  const list = document.getElementById('problem-index');
  if (!list) return;
  for (const row of problemIndexRows(showcase, projects)) {
    const anchor = el('a', 'index-link');
    anchor.href = row.href;
    const arrow = el('span', 'index-arrow', '→');
    arrow.setAttribute('aria-hidden', 'true');
    append(
      anchor,
      el('span', 'index-number', row.number),
      el('span', 'index-headline', row.headline),
      el('span', 'index-tool', row.tool),
      arrow,
    );
    const item = el('li', 'index-row');
    item.appendChild(anchor);
    list.appendChild(item);
  }
}

export function renderProblemsHeading(showcase, projects) {
  const heading = document.getElementById('problems-heading');
  if (!heading) return;
  heading.textContent = problemsHeading(showcase, projects);
}

export function renderProblems(showcase, projects) {
  const container = document.getElementById('problem-list');
  if (!container) return;
  for (const { entry, project, number } of problemEntries(showcase, projects)) {
    const article = el('article', `problem${entry.size === 'hero' ? ' is-hero' : ''}`);
    article.id = problemId(entry.name);
    article.appendChild(problemHead(number, entry));
    article.appendChild(el('p', 'problem-statement', entry.problem));
    const grid = el('div', 'problem-grid');
    const copy = el('div', 'problem-copy');
    copy.appendChild(answerBlock(entry, project));
    append(grid, copy, mountDemo(entry));
    article.appendChild(grid);
    container.appendChild(article);
  }
}

export function renderEvidence(showcase, projects, benchmark, benchmarkHistory) {
  const section = document.getElementById('evidence');
  const body = document.getElementById('evidence-body');
  const evidence = showcase.evidence;
  if (!section || !body) return;
  if (!evidence) {
    section.hidden = true;
    return;
  }
  const project = projects.get(evidence.name);
  setText('evidence-kicker', evidence.kicker);
  setText('evidence-heading', evidence.headline);
  if (evidence.intro) body.appendChild(el('p', 'section-lede', evidence.intro));
  const article = el('div', 'evidence');
  article.id = problemId(evidence.name);
  article.appendChild(el('p', 'problem-statement', evidence.problem));
  const grid = el('div', 'problem-grid');
  const copy = el('div', 'problem-copy');
  if (project) copy.appendChild(answerBlock(evidence, project));
  const demoBox = el('div', 'problem-demo');
  if (benchmark) {
    lazyMount(demoBox, () => import('./charts.js').then((module) => module.benchmarkChart(benchmark, benchmarkHistory)));
  } else {
    demoBox.appendChild(el('p', 'chart-note', 'The benchmark block is missing from the data, so the run rates cannot be shown.'));
  }
  append(grid, copy, demoBox);
  article.appendChild(grid);
  if (benchmark) {
    const matrixBox = el('div', 'evidence-matrix');
    lazyMount(matrixBox, () => fetchJson('data/benchmark-matrix.json', 1).then((data) => import('./charts.js').then((module) => module.benchmarkMatrix(benchmark, data))));
    article.appendChild(matrixBox);
  }
  if (evidence.demo) {
    const box = el('div', 'evidence-trace');
    lazyMount(box, () => loadDemo(evidence.demo));
    article.appendChild(box);
  }
  body.appendChild(article);
}

export function renderColophon(showcase) {
  const prose = document.getElementById('colophon-prose');
  if (prose) {
    for (const paragraph of showcase.colophon ?? []) prose.appendChild(el('p', 'colophon-paragraph', paragraph));
  }
  const principles = document.getElementById('principles');
  if (principles) {
    for (const principle of showcase.principles ?? []) principles.appendChild(el('li', 'principle', principle));
  }
}

export function renderDegradedNotice(message) {
  const notice = document.getElementById('data-notice');
  if (!notice) return;
  notice.hidden = false;
  notice.textContent = message;
}

function activityChart(daily) {
  const width = 320;
  const height = 44;
  const gap = 3;
  const barWidth = (width - gap * (daily.length - 1)) / daily.length;
  const peak = Math.max(1, extent(daily.map((entry) => entry.pushes))[1]);
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

export async function renderActivity(data) {
  const panel = document.getElementById('activity-panel');
  const activity = data.activity;
  if (!panel || !activity) return;
  panel.appendChild(el('h3', 'activity-title', 'Public activity'));
  const line = el('p', 'activity-line');
  const parts = activityLine(activity);
  append(line, parts.pushes);
  if (parts.window) append(line, ', ', el('span', 'activity-window', parts.window));
  append(line, '.');
  panel.appendChild(line);
  const daily = Array.isArray(activity.daily) ? activity.daily : [];
  if (daily.length > 0) {
    panel.appendChild(activityChart(daily));
    const values = daily.map((entry) => entry.pushes);
    const total = values.reduce((sum, value) => sum + value, 0);
    const [low, high] = extent(values);
    panel.appendChild(el('p', 'sr-only', `${values.length} days recorded, ${formatNumber(total)} pushes total, between ${formatNumber(low)} and ${formatNumber(high)} per day.`));
  }
  const highlights = Array.isArray(activity.highlights) ? activity.highlights : [];
  const facts = repositoryFacts(data.stats);
  const factsLine = el('p', 'activity-facts');
  append(factsLine, `${facts.repositories} public repositories · ${facts.forks} forks received.`);
  panel.appendChild(factsLine);
  if (highlights.length > 0) {
    panel.appendChild(el('h4', 'activity-subtitle', 'Recently'));
    const list = el('ul', 'activity-highlights');
    for (const highlight of highlights) list.appendChild(el('li', 'activity-highlight', highlight));
    panel.appendChild(list);
  }
  if (activity.fetchedAt) {
    const note = el('p', 'activity-note');
    append(note, 'GitHub public events, fetched ', timeNode(activity.fetchedAt), '.');
    panel.appendChild(note);
  }
  const history = Array.isArray(data.history) ? data.history : [];
  if (history.length > 0) {
    const charts = await import('./charts.js').catch(() => null);
    const growth = charts ? charts.historyPanel(history) : null;
    if (growth) panel.appendChild(growth);
  }
}

export function renderFooter(data) {
  const identity = data.identity;
  const githubLink = document.getElementById('github-link');
  if (githubLink) {
    githubLink.href = identity.links?.github || 'https://github.com/YuGiMob';
    githubLink.textContent = `${identity.displayName} on GitHub`;
  }
  setText('campfire-year', `© ${new Date().getFullYear()} ${identity.displayName}`);
  const notice = document.getElementById('data-age');
  if (notice) {
    const message = stalenessNotice(data, new Date().toISOString().slice(0, 10));
    notice.textContent = message ?? '';
    notice.hidden = !message;
  }
}

export function renderStructuredData(data, showcase) {
  const target = document.getElementById('structured-data');
  if (!target) return;
  const canonical = document.querySelector('link[rel="canonical"]')?.href || document.baseURI;
  target.replaceChildren(document.createTextNode(JSON.stringify(structuredData(data, showcase, canonical))));
}

export function applyVisibility(sections, showcase) {
  const setHidden = (id, hidden) => {
    const node = document.getElementById(id);
    if (node) node.hidden = hidden;
  };
  const showProblems = sections.showProblems ?? true;
  setHidden('problems', !showProblems);
  setHidden('evidence', !(showProblems && Boolean(showcase.evidence)));
  setHidden('colophon', !(sections.showAbout ?? true));
  setHidden('campfire', !(sections.showCampfire ?? true));
  const stats = document.getElementById('hero-stats');
  if (stats) stats.hidden = !(sections.showHeroStats ?? true);
}
