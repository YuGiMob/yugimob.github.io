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
  return {
    featured: null,
    projects: data.projects.map((project) => ({
      name: project.name,
      kicker: project.language || 'Artifact',
      tagline: project.description || 'Public repository',
      highlights: ['Curated public repository'],
      size: 'small',
    })),
    benchmark: null,
    principles: [],
    about: data.about?.paragraphs ?? [],
    lab: { title: 'Benchmark results', intro: 'Benchmark figures come from committed run reports in pi-edit-benchmark.' },
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

function renderIdentity(data) {
  const identity = data.identity;
  hydrateAvatar(document.getElementById('avatar'), identity.avatarUrl, identity.displayName);
  document.title = `${identity.displayName} · ${identity.classTitle}`;
  const set = (id, value) => {
    const node = document.getElementById(id);
    if (node && value) node.textContent = value;
  };
  set('display-name', identity.displayName);
  set('class-title', identity.classTitle);
  set('tagline', identity.tagline);
  const navGithub = document.getElementById('nav-github');
  if (navGithub) {
    navGithub.href = identity.links?.github || navGithub.href;
  }
  const heroGithub = document.getElementById('hero-github');
  if (heroGithub && identity.links?.github) heroGithub.href = identity.links.github;

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
    const dt = el('dt', 'stat-label', label);
    const dd = el('dd', 'stat-value', '0');
    append(item, dt, dd);
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

function renderFeatured(featured, project) {
  const section = document.getElementById('featured');
  const panel = document.getElementById('featured-panel');
  if (!section || !panel) return;
  if (!featured || !project) {
    section.hidden = true;
    return;
  }
  const kicker = document.getElementById('featured-kicker');
  if (kicker) kicker.textContent = featured.kicker;
  const heading = document.getElementById('featured-heading');
  if (heading) heading.textContent = featured.headline;

  const copy = el('div', 'feature-copy');
  for (const paragraph of featured.summary) copy.appendChild(el('p', 'feature-summary', paragraph));
  const points = el('dl', 'feature-points');
  for (const point of featured.points) {
    const item = el('div', 'feature-point');
    append(item, el('dt', 'feature-point-title', point.title), el('dd', 'feature-point-body', point.body));
    points.appendChild(item);
  }
  copy.appendChild(points);
  copy.appendChild(projectChips(project));
  copy.appendChild(installActions(project));

  const demoBox = el('div', 'feature-demo');
  const playground = buildPlayground();
  append(demoBox, playground.node, playground.caption);
  const controller = observeVisibility(playground.node, () => playground.start(), () => playground.stop());

  const wrap = el('div', 'feature');
  append(wrap, copy, demoBox);
  panel.appendChild(wrap);
  return () => {
    if (controller) controller.disconnect();
    playground.destroy();
  };
}

function renderForge(entries, projects) {
  const grid = document.getElementById('forge-grid');
  if (!grid) return [];
  const cleanups = [];
  for (const entry of entries) {
    const project = projects.get(entry.name);
    if (!project) continue;
    const card = el('article', `forge-card ${entry.size === 'large' ? 'is-large' : 'is-small'}`);

    const copy = el('div', 'forge-copy');
    copy.appendChild(el('p', 'forge-kicker', entry.kicker));
    const title = el('h3', 'forge-title');
    title.appendChild(link(project.url, project.name));
    copy.appendChild(title);
    copy.appendChild(el('p', 'forge-tagline', entry.tagline));
    const highlights = el('ul', 'forge-highlights');
    for (const highlight of entry.highlights) highlights.appendChild(el('li', 'forge-highlight', highlight));
    copy.appendChild(highlights);
    copy.appendChild(projectChips(project));
    copy.appendChild(installActions(project));

    card.appendChild(copy);
    if (entry.demo) {
      const demo = buildDemo(entry.demo);
      if (demo) {
        const box = el('div', 'forge-demo');
        box.appendChild(demo.node);
        card.appendChild(box);
        const observer = observeVisibility(demo.node, () => demo.start(), () => demo.stop());
        cleanups.push(() => {
          if (observer) observer.disconnect();
          demo.destroy();
        });
      }
    }
    grid.appendChild(card);
  }
  return cleanups;
}

function renderLab(showcase) {
  const grid = document.getElementById('lab-grid');
  if (!grid) return [];
  const heading = document.getElementById('lab-heading');
  if (heading) heading.textContent = showcase.lab.title;
  const intro = document.getElementById('lab-intro');
  if (intro) intro.textContent = showcase.lab.intro;

  const charts = [];
  if (showcase.benchmark) {
    const chart = benchmarkChart(showcase.benchmark);
    chart.node.classList.add('is-wide');
    charts.push(chart);
  }

  const cleanups = [];
  for (const chart of charts) {
    grid.appendChild(chart.node);
    const observer = observeVisibility(chart.node, () => chart.start(), () => chart.stop());
    cleanups.push(() => {
      if (observer) observer.disconnect();
      chart.stop();
    });
  }
  return cleanups;
}

function renderAbout(showcase) {
  const prose = document.getElementById('about-prose');
  if (prose) {
    for (const paragraph of showcase.about) prose.appendChild(el('p', 'about-paragraph', paragraph));
  }
  const principles = document.getElementById('principles');
  if (principles) {
    for (const principle of showcase.principles) principles.appendChild(el('li', 'principle', principle));
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
  const year = document.getElementById('campfire-year');
  if (year) year.textContent = `© ${new Date().getFullYear()} ${identity.displayName}`;
}

function renderStructuredData(data, showcase) {
  const target = document.getElementById('structured-data');
  if (!target) return;
  const projects = showcase.featured
    ? [showcase.featured.name, ...showcase.projects.map((entry) => entry.name)]
    : data.projects.map((project) => project.name);
  const byName = new Map(data.projects.map((project) => [project.name, project]));
  const items = projects
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
        knowsAbout: showcase.principles,
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

function applyVisibility(sections) {
  const setHidden = (id, hidden) => {
    const node = document.getElementById(id);
    if (node) node.hidden = hidden;
  };
  setHidden('featured', !(sections.showArtifacts ?? true));
  setHidden('forge', !(sections.showArtifacts ?? true));
  setHidden('about', !(sections.showBackground ?? true));
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
  renderHeroStats(data);
  renderFeatured(showcase.featured, projects.get(showcase.featured?.name));
  renderForge(showcase.projects, projects);
  renderLab(showcase);
  renderAbout(showcase);
  renderActivity(data);
  renderFooter(data.identity);
  renderStructuredData(data, showcase);
  applyVisibility(data.sections);
  setupNav();
  setupAnchorAlignment();
  setupChrome();
}

init().catch((error) => {
  console.warn('YuGiMob:', error);
  const fallback = document.getElementById('display-name');
  if (fallback) fallback.textContent = 'Site data unavailable';
  const tagline = document.getElementById('tagline');
  if (tagline) tagline.textContent = 'Check data/site-data.json and data/showcase.json';
});
