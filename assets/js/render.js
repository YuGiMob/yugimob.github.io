import { hydrateAvatar } from './avatar.js';
import { el, append, link, copyButton, formatNumber, animateValue, svg, setText, setMeta, observeVisibility } from './ui.js';
import { buildDemo } from './demos.js';
import { buildPlayground, PLAYGROUND_ID } from './playground.js';
import { benchmarkChart, historyPanel } from './charts.js';
import { countWord, formatWindow } from './site-data.js';

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
  const heading = el('div');
  append(heading, el('p', 'problem-kicker', entry.kicker), el('h3', 'problem-title', entry.headline));
  append(head, el('span', 'problem-number', number), heading);
  return head;
}

function mountDemo(entry) {
  const box = el('div', 'problem-demo');
  const demo = entry.demo === PLAYGROUND_ID ? buildPlayground() : entry.demo ? buildDemo(entry.demo) : null;
  if (!demo) return box;
  append(box, demo.node, demo.caption);
  observeVisibility(demo.node, () => demo.start(), () => demo.stop());
  return box;
}

export function renderProblemIndex(showcase) {
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
    const arrow = el('span', 'index-arrow', '→');
    arrow.setAttribute('aria-hidden', 'true');
    append(
      anchor,
      el('span', 'index-number', String(index + 1).padStart(2, '0')),
      el('span', 'index-headline', row.headline),
      el('span', 'index-tool', row.tool),
      arrow,
    );
    const item = el('li', 'index-row');
    item.appendChild(anchor);
    list.appendChild(item);
  });
}

export function renderProblemsHeading(showcase) {
  const heading = document.getElementById('problems-heading');
  if (!heading) return;
  const word = countWord(showcase.problems.length + (showcase.evidence ? 1 : 0));
  heading.textContent = `${word.charAt(0).toUpperCase()}${word.slice(1)} things that kept going wrong`;
}

export function renderProblems(showcase, projects) {
  const container = document.getElementById('problem-list');
  if (!container) return;
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
    append(grid, copy, mountDemo(entry));
    article.appendChild(grid);
    container.appendChild(article);
  });
}

export function renderEvidence(showcase, projects) {
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
  article.id = `problem-${evidence.name}`;
  article.appendChild(el('p', 'problem-statement', evidence.problem));
  const grid = el('div', 'problem-grid');
  const copy = el('div', 'problem-copy');
  if (project) copy.appendChild(answerBlock(evidence, project));
  const demoBox = el('div', 'problem-demo');
  if (evidence.benchmark) {
    const chart = benchmarkChart(evidence.benchmark);
    demoBox.appendChild(chart.node);
    observeVisibility(chart.node, () => chart.start(), () => chart.stop());
  }
  append(grid, copy, demoBox);
  article.appendChild(grid);
  if (evidence.demo) {
    const trace = buildDemo(evidence.demo);
    if (trace) {
      const box = el('div', 'evidence-trace');
      append(box, trace.node);
      article.appendChild(box);
      observeVisibility(trace.node, () => trace.start(), () => trace.stop());
    }
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

export function renderActivity(data) {
  const panel = document.getElementById('activity-panel');
  const activity = data.activity;
  if (!panel || !activity) return;
  panel.appendChild(el('h3', 'activity-title', 'Public activity'));
  const line = el('p', 'activity-line');
  append(line, `${formatNumber(activity.pushes ?? 0)} pushes to public repositories, `, el('span', 'activity-window', formatWindow(activity.window)), '.');
  panel.appendChild(line);
  const daily = Array.isArray(activity.daily) ? activity.daily : [];
  if (daily.length > 0) {
    panel.appendChild(activityChart(daily));
    const values = daily.map((entry) => entry.pushes);
    const total = values.reduce((sum, value) => sum + value, 0);
    panel.appendChild(el('p', 'sr-only', `${values.length} days recorded, ${formatNumber(total)} pushes total, between ${formatNumber(Math.min(...values))} and ${formatNumber(Math.max(...values))} per day.`));
  }
  if (activity.fetchedAt) panel.appendChild(el('p', 'activity-note', `GitHub public events, fetched ${activity.fetchedAt}.`));
  const history = Array.isArray(data.history) ? data.history : [];
  const growth = history.length > 0 ? historyPanel(history) : null;
  if (growth) panel.appendChild(growth);
}

export function renderFooter(identity) {
  const githubLink = document.getElementById('github-link');
  if (githubLink) {
    githubLink.href = identity.links?.github || 'https://github.com/YuGiMob';
    githubLink.textContent = `${identity.displayName} on GitHub`;
  }
  setText('campfire-year', `© ${new Date().getFullYear()} ${identity.displayName}`);
}

export function renderStructuredData(data, showcase) {
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
        sameAs: project.npm ? [`https://www.npmjs.com/package/${project.npm}`] : undefined,
      },
    }));
  const list = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${data.identity.displayName} artifacts`,
    dateModified: data.activity?.fetchedAt || undefined,
    itemListElement: items,
  };
  target.textContent = JSON.stringify(list);
}

export function applyVisibility(sections, showcase) {
  const setHidden = (id, hidden) => {
    const node = document.getElementById(id);
    if (node) node.hidden = hidden;
  };
  const showArtifacts = sections.showArtifacts ?? true;
  setHidden('problems', !showArtifacts);
  setHidden('evidence', !(showArtifacts && Boolean(showcase.evidence)));
  setHidden('colophon', !(sections.showAbout ?? true));
  setHidden('campfire', !(sections.showCampfire ?? true));
  const stats = document.getElementById('hero-stats');
  if (stats) stats.hidden = !(sections.showAbilityScores ?? true);
}
