import { hydrateAvatar } from './avatar.js';
import { el, append, copyButton, formatNumber, extent, animateValue, svg, setText, setMeta, observeVisibility, timeNode } from './ui.js';
import { lazyMount } from './lazy.js';
import { loadDemo } from './demo-registry.js';
import { fetchJson } from './fetch-json.js';
import {
  activityLine,
  heroStatRows,
  problemId,
  repositoryFacts,
  sectionVisibility,
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
  const paragraphs = document.getElementById('intro-paragraphs');
  if (paragraphs && paragraphs.childNodes.length > 0) return;
  setText('intro-headline', showcase.intro?.headline);
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
    dd.setAttribute('aria-hidden', 'true');
    const readout = el('dd', 'sr-only', formatNumber(stat.value));
    append(item, el('dt', 'stat-label', stat.label), dd, readout);
    list.appendChild(item);
    let animated = false;
    observeVisibility(dd, () => {
      if (animated) return;
      animated = true;
      animateValue(dd, stat.value);
    }, () => {});
  }
}

function hydrateInstallCommand(article) {
  const command = article.querySelector('.install-command');
  if (command) command.replaceWith(copyButton(command.textContent, command.textContent, `copy ${command.textContent}`));
}

export function renderProblems() {
  const container = document.getElementById('problem-list');
  if (!container) return;
  for (const article of container.children) {
    hydrateInstallCommand(article);
    const box = article.querySelector('.problem-demo[data-demo]');
    if (box) lazyMount(box, () => loadDemo(box.getAttribute('data-demo')));
  }
}

export function renderEvidence(showcase, benchmark, benchmarkHistory) {
  const section = document.getElementById('evidence');
  const body = document.getElementById('evidence-body');
  const evidence = showcase.evidence;
  if (!section || !body) return;
  if (!evidence) {
    section.hidden = true;
    return;
  }
  setText('evidence-kicker', evidence.kicker);
  setText('evidence-heading', evidence.headline);
  const article = document.getElementById(problemId(evidence.name));
  if (!article) return;
  hydrateInstallCommand(article);
  const demoBox = article.querySelector('.problem-demo');
  if (demoBox) {
    if (benchmark) lazyMount(demoBox, () => import('./charts.js').then((module) => module.benchmarkChart(benchmark, benchmarkHistory)));
    else demoBox.appendChild(el('p', 'chart-note', 'The benchmark block is missing from the data, so the run rates cannot be shown.'));
  }
  const matrixBox = article.querySelector('.evidence-matrix');
  if (matrixBox && benchmark) {
    lazyMount(matrixBox, () => fetchJson('data/benchmark-matrix.json', 1).then((data) => import('./charts.js').then((module) => module.benchmarkMatrix(benchmark, data))));
  }
  const traceBox = article.querySelector('.evidence-trace[data-demo]');
  if (traceBox) lazyMount(traceBox, () => loadDemo(traceBox.getAttribute('data-demo')));
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
  const gap = daily.length > 1 ? Math.min(3, (width / daily.length) * 0.4) : 0;
  const barWidth = Math.max(0.5, (width - gap * (daily.length - 1)) / daily.length);
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
  const visible = sectionVisibility(sections, showcase);
  for (const [id, shown] of Object.entries(visible)) {
    const node = document.getElementById(id);
    if (node) node.hidden = !shown;
  }
}
