import { avatarSrcSet } from './avatar.js';
const ABILITY_ORDER = [
  ['totalStars', 'Strength'],
  ['npmPackages', 'Dexterity'],
  ['publicRepos', 'Intelligence'],
  ['starsGiven', 'Wisdom'],
  ['forksReceived', 'Charisma'],
  ['accountYears', 'Constitution'],
];

const RARITY_TIERS = [
  { min: 50, cls: 'legendary' },
  { min: 30, cls: 'epic' },
  { min: 10, cls: 'rare' },
  { min: 1, cls: 'uncommon' },
  { min: 0, cls: 'common' },
];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const ANNOUNCE_DELAY = 20;

function rarityFor(stars) {
  if (typeof stars !== 'number' || Number.isNaN(stars)) return RARITY_TIERS[RARITY_TIERS.length - 1];
  for (const tier of RARITY_TIERS) {
    if (stars >= tier.min) return tier;
  }
  return RARITY_TIERS[RARITY_TIERS.length - 1];
}

function formatDownloads(count) {
  if (!Number.isFinite(count) || count <= 0) return null;
  if (count >= 1000) return `${Math.round((count / 1000) * 10) / 10}k`;
  return String(count);
}

function formatUpdated(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function sortedProjects(projects) {
  return [...projects].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || String(a.name ?? '').localeCompare(String(b.name ?? '')));
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function appendText(parent, tag, className, text) {
  const node = el(tag, className);
  node.textContent = text;
  parent.appendChild(node);
}

function link(href, text) {
  const a = el('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = text;
  return a;
}

function announce(message) {
  const region = document.getElementById('live-region');
  if (!region) return;
  region.textContent = '';
  setTimeout(() => {
    region.textContent = message;
  }, ANNOUNCE_DELAY);
}

function setSectionHeading(section, headingId, headingText) {
  section.setAttribute('aria-labelledby', headingId);
  section.replaceChildren();
  const heading = el('h2');
  heading.id = headingId;
  heading.textContent = headingText;
  section.appendChild(heading);
}

function copyText(value) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') return navigator.clipboard.writeText(value);
  const element = document.createElement('textarea');
  element.value = value;
  element.setAttribute('readonly', '');
  element.style.position = 'fixed';
  element.style.top = '-9999px';
  element.style.opacity = '0';
  document.body.appendChild(element);
  element.focus();
  element.select();
  if (typeof element.setSelectionRange === 'function') element.setSelectionRange(0, element.value.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    element.remove();
  }
  return copied ? Promise.resolve() : Promise.reject(new Error('copy failed'));
}

function copyButton(pkg) {
  const button = el('button', 'copy-btn');
  button.type = 'button';
  const idleText = 'copy install';
  button.textContent = idleText;
  button.setAttribute('aria-label', `copy npm install ${pkg}`);
  let resetTimer = null;
  const resetDelay = 1400;
  const scheduleReset = () => {
    resetTimer = setTimeout(() => {
      button.textContent = idleText;
      button.classList.remove('copied');
    }, resetDelay);
  };
  button.addEventListener('click', async () => {
    if (resetTimer) clearTimeout(resetTimer);
    try {
      await copyText(`npm i ${pkg}`);
      button.textContent = 'copied';
      button.classList.add('copied');
      announce(`copied npm i ${pkg}`);
      scheduleReset();
    } catch {
      button.textContent = 'copy failed';
      button.classList.remove('copied');
      announce(`copy failed for ${pkg}`);
      scheduleReset();
    }
  });
  return button;
}

function setHidden(id, isHidden) {
  const section = document.getElementById(id);
  if (section) section.hidden = isHidden;
}

function renderIdentity(identity) {
  const avatar = document.getElementById('avatar');
  avatar.src = identity.avatarUrl;
  const srcSet = avatarSrcSet(identity.avatarUrl);
  if (srcSet) avatar.srcset = srcSet;
  else if (identity.avatarUrl) avatar.removeAttribute('srcset');
  avatar.alt = identity.displayName;
  document.title = `${identity.displayName} — ${identity.classTitle}`;
  document.getElementById('display-name').textContent = identity.displayName;
  document.getElementById('class-title').textContent = identity.classTitle;
  document.getElementById('tagline').textContent = identity.tagline;
}

function renderBackground(about) {
  const section = document.getElementById('background');
  setSectionHeading(section, 'background-heading', 'Background');
  for (const paragraph of about.paragraphs) {
    appendText(section, 'p', null, paragraph);
  }
}

function renderProjects(projects) {
  const section = document.getElementById('artifacts');
  const grid = document.getElementById('project-grid');
  setSectionHeading(section, 'artifacts-heading', 'Artifacts');
  section.appendChild(grid);
  grid.replaceChildren();
  const sorted = sortedProjects(projects);
  for (const project of sorted) {
    const stars = project.stars ?? 0;
    const forks = project.forks ?? 0;
    const card = el('div', `project-card rarity-${rarityFor(stars).cls}`);
    appendText(card, 'h3', null, project.name);
    appendText(card, 'span', 'language', project.language || 'Unknown');
    if (project.license) {
      appendText(card, 'span', 'license', project.license);
    }
    const meta = el('span', 'meta');
    appendText(meta, 'span', 'stars', `★ ${stars}`);
    appendText(meta, 'span', 'forks', `⑂ ${forks}`);
    const downloadsLabel = formatDownloads(project.npmWeeklyDownloads);
    if (downloadsLabel) {
      appendText(meta, 'span', 'downloads', `↓ ${downloadsLabel}/wk`);
    }
    const updatedLabel = formatUpdated(project.pushedAt);
    if (updatedLabel) {
      const updatedNode = el('span', 'updated');
      updatedNode.textContent = `updated ${updatedLabel}`;
      if (project.pushedAt) updatedNode.title = project.pushedAt;
      meta.appendChild(updatedNode);
    }
    card.appendChild(meta);
    if (project.description) {
      appendText(card, 'p', 'description', project.description);
    }
    const actions = el('p', 'actions');
    if (project.npm) {
      actions.appendChild(
        link(`https://www.npmjs.com/package/${project.npm}`, `npm · ${project.npm}`),
      );
      actions.appendChild(copyButton(project.npm));
    }
    actions.appendChild(link(project.url, 'GitHub'));
    card.appendChild(actions);
    grid.appendChild(card);
  }
}

function renderAbilityScores(stats) {
  const section = document.getElementById('ability-scores');
  const list = document.getElementById('ability-list');
  setSectionHeading(section, 'ability-heading', 'Ability Scores');
  section.appendChild(list);
  list.replaceChildren();
  for (const [key, label] of ABILITY_ORDER) {
    const value = Number.isFinite(stats?.[key]) ? stats[key] : 0;
    const dt = el('dt');
    dt.id = `ability-${key}`;
    dt.textContent = label;
    list.appendChild(dt);
    const dd = el('dd');
    dd.setAttribute('role', 'progressbar');
    dd.setAttribute('aria-valuemin', '0');
    dd.setAttribute('aria-valuemax', '55');
    dd.setAttribute('aria-valuenow', String(value));
    dd.setAttribute('aria-labelledby', dt.id);
    const bar = el('div', 'bar-fill');
    bar.setAttribute('aria-hidden', 'true');
    bar.style.width = `${Math.max(0, Math.min((value / 55) * 100, 100))}%`;
    dd.appendChild(bar);
    appendText(dd, 'span', null, value);
    list.appendChild(dd);
  }
}

function renderQuestLog(activity) {
  const section = document.getElementById('quest-log');
  setSectionHeading(section, 'quest-heading', 'Quest Log');
  const line = el('p');
  appendText(line, 'span', 'window', `Quest log — ${activity.window}`);
  line.append(' · ');
  appendText(line, 'span', 'pushes', `${activity.pushes} pushes`);
  if (activity.fetchedAt) {
    line.append(' · ');
    appendText(line, 'span', 'fetched', `updated ${activity.fetchedAt}`);
  }
  section.appendChild(line);
  const ul = el('ul');
  if (activity.highlights && activity.highlights.length > 0) {
    for (const highlight of activity.highlights) {
      appendText(ul, 'li', null, highlight);
    }
  } else {
    appendText(ul, 'li', 'empty', 'No notable deeds this window.');
  }
  section.appendChild(ul);
}

function renderFooter(identity) {
  const githubLink = document.getElementById('github-link');
  githubLink.href = identity.links.github;
  githubLink.textContent = identity.displayName || 'GitHub';
  const campfire = document.getElementById('campfire');
  const existingYear = document.getElementById('campfire-year');
  if (existingYear) existingYear.remove();
  const year = document.createElement('span');
  year.id = 'campfire-year';
  year.textContent = `© ${new Date().getFullYear()} YuGiMob`;
  campfire.appendChild(year);
}

function applyVisibility(sections) {
  setHidden('background', !(sections?.showBackground ?? true));
  setHidden('artifacts', !(sections?.showArtifacts ?? true));
  setHidden('quest-log', !(sections?.showQuestLog ?? true));
  setHidden('ability-scores', !(sections?.showAbilityScores ?? true));
  setHidden('campfire', !(sections?.showCampfire ?? true));
}

function renderStructuredData(data) {
  const target = document.getElementById('structured-data');
  if (!target) return;
  const items = sortedProjects(data.projects).map((project, index) => ({
    '@type': 'SoftwareSourceCode',
    position: index + 1,
    name: project.name,
    description: project.description || undefined,
    codeRepository: project.url,
    programmingLanguage: project.language || undefined,
    license: project.license ? `https://spdx.org/licenses/${project.license}` : undefined,
    url: project.url
  }));
  const graph = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${data.identity.displayName} artifacts`,
    itemListElement: items.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      item
    }))
  };
  target.textContent = JSON.stringify(graph);
}

function isValidSiteData(data) {
  return Boolean(data && typeof data === 'object' && !Array.isArray(data) && data.identity && typeof data.identity === 'object' && !Array.isArray(data.identity) && data.about && typeof data.about === 'object' && !Array.isArray(data.about) && Array.isArray(data.about.paragraphs) && Array.isArray(data.projects) && data.stats && typeof data.stats === 'object' && !Array.isArray(data.stats) && data.activity && typeof data.activity === 'object' && !Array.isArray(data.activity) && data.sections && typeof data.sections === 'object' && !Array.isArray(data.sections));
}

async function init() {
  const fetchOptions = { cache: 'no-cache' };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') fetchOptions.signal = AbortSignal.timeout(5000);
  const response = await fetch('data/site-data.json', fetchOptions);
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  const data = await response.json();
  if (!isValidSiteData(data)) throw new Error('invalid data');
  renderIdentity(data.identity);
  renderBackground(data.about);
  renderProjects(data.projects);
  renderAbilityScores(data.stats);
  renderQuestLog(data.activity);
  renderFooter(data.identity);
  renderStructuredData(data);
  applyVisibility(data.sections);
}

init().catch(() => {
  document.getElementById('display-name').textContent =
    'Site data unavailable — check data/site-data.json';
  console.warn('YuGiMob: could not load data/site-data.json');
});
