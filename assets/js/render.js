import { hydrateAvatar } from './avatar.js';
import { extent, formatNumber, localDateString } from './numbers.js';
import { el, append, copyButton, animateValue, svg, setText, setMeta, observeVisibility, timeNode } from './ui.js';
import { lazyMount } from './lazy.js';
import { loadDemo } from './demo-registry.js';
import { fetchJson } from './fetch-json.js';
import {
  activityLine,
  dataRefreshedNote,
  heroStatRows,
  problemId,
  repositoryFacts,
  sectionVisibility,
  stalenessNotice,
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

function renderedStatValue(item) {
  const value = typeof item?.querySelector === 'function' ? item.querySelector('.stat-value') : null;
  if (!value) return null;
  const parsed = Number(String(value.textContent).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function renderHeroStats(data) {
  const list = document.getElementById('hero-stats');
  if (!list) return;
  const previous = [...list.children].map(renderedStatValue);
  list.replaceChildren();
  heroStatRows(data).forEach((stat, index) => {
    const from = previous[index];
    const item = el('div', 'stat');
    const dd = el('dd', 'stat-value', formatNumber(from ?? 0));
    dd.setAttribute('aria-hidden', 'true');
    const readout = el('dd', 'sr-only', formatNumber(stat.value));
    append(item, el('dt', 'stat-label', stat.label), dd, readout);
    list.appendChild(item);
    let animated = false;
    observeVisibility(dd, () => {
      if (animated) return;
      animated = true;
      if (from === stat.value) return;
      animateValue(dd, stat.value, formatNumber, 900, from ?? 0);
    }, () => {});
  });
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
    const pushWord = value === 1 ? 'push' : 'pushes';
    const events = Number.isFinite(entry.events) ? entry.events : 0;
    const eventWord = events === 1 ? 'event' : 'events';
    label.textContent = `${entry.date}: ${value} ${pushWord}, ${events} ${eventWord}`;
    bar.appendChild(label);
    chart.appendChild(bar);
  });
  return chart;
}

export async function renderActivity(data) {
  const panel = document.getElementById('activity-panel');
  const activity = data.activity;
  if (!panel || !activity) return;
  panel.replaceChildren();
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
    const events = daily.reduce((sum, entry) => sum + (Number.isFinite(entry.events) ? entry.events : 0), 0);
    const [low, high] = extent(values);
    panel.appendChild(el('p', 'sr-only', `${values.length} days recorded, ${formatNumber(total)} pushes and ${formatNumber(events)} public events total, between ${formatNumber(low)} and ${formatNumber(high)} pushes per day.`));
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
  if (daily.length > 0 || history.length > 0) {
    const charts = await import('./charts.js').catch(() => null);
    const table = charts && daily.length > 0 ? charts.activityTable(daily) : null;
    if (table) panel.appendChild(table);
    const growth = charts && history.length > 0 ? charts.historyPanel(history) : null;
    if (growth) panel.appendChild(growth);
    if (!charts) panel.appendChild(el('p', 'chart-note', 'The charts could not be loaded from the data.'));
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
  setText('data-refreshed', dataRefreshedNote(data));
  const notice = document.getElementById('data-age');
  if (notice) {
    const message = stalenessNotice(data, localDateString());
    notice.textContent = message ?? '';
    notice.hidden = !message;
  }
}

export function applyVisibility(sections, showcase) {
  const visible = sectionVisibility(sections, showcase);
  for (const [id, shown] of Object.entries(visible)) {
    const node = document.getElementById(id);
    if (node) node.hidden = !shown;
  }
}
