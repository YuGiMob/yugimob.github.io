// YuGiMob — renders the site from the local data manifest.
// ES module, vanilla JS, zero dependencies.

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

function rarityFor(stars) {
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

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function link(href, text) {
  const a = el('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  return a;
}

function setHidden(id, isHidden) {
  const section = document.getElementById(id);
  if (section) section.hidden = isHidden;
}

function renderIdentity(identity) {
  const avatar = document.getElementById('avatar');
  avatar.src = identity.avatarUrl;
  avatar.alt = identity.displayName;
  document.title = `${identity.displayName} — ${identity.classTitle}`;
  document.getElementById('display-name').textContent = identity.displayName;
  document.getElementById('class-title').textContent = identity.classTitle;
  document.getElementById('tagline').textContent = identity.tagline;
}

function renderBackground(about) {
  const section = document.getElementById('background');
  section.appendChild(el('h2')).textContent = 'Background';
  for (const paragraph of about.paragraphs) {
    section.appendChild(el('p')).textContent = paragraph;
  }
}

function renderProjects(projects) {
  const grid = document.getElementById('project-grid');
  const sorted = [...projects].sort((a, b) =>
    b.stars - a.stars || a.name.localeCompare(b.name),
  );

  for (const project of sorted) {
    const card = el('div', `project-card rarity-${rarityFor(project.stars).cls}`);

    const name = el('h3');
    name.textContent = project.name;
    card.appendChild(name);

    const language = el('span', 'language');
    language.textContent = project.language || 'Unknown';
    card.appendChild(language);

    const meta = el('span', 'meta');
    const stars = el('span', 'stars');
    stars.textContent = `★ ${project.stars}`;
    const forks = el('span', 'forks');
    forks.textContent = `⑂ ${project.forks}`;
    meta.append(stars, forks);

    const downloadsLabel = formatDownloads(project.npmWeeklyDownloads);
    if (downloadsLabel) {
      const downloads = el('span', 'downloads');
      downloads.textContent = `↓ ${downloadsLabel}/wk`;
      meta.append(downloads);
    }
    card.appendChild(meta);

    const desc = el('p', 'description');
    desc.textContent = project.description;
    card.appendChild(desc);

    const actions = el('p', 'actions');
    if (project.npm) {
      actions.appendChild(
        link(`https://www.npmjs.com/package/${project.npm}`, `npm · ${project.npm}`),
      );
    }
    actions.appendChild(link(project.url, 'GitHub'));

    card.appendChild(actions);
    grid.appendChild(card);
  }
}

function renderAbilityScores(stats) {
  const list = document.getElementById('ability-list');
  for (const [key, label] of ABILITY_ORDER) {
    const value = Number.isFinite(stats?.[key]) ? stats[key] : 0;

    const dt = el('dt');
    dt.textContent = label;
    list.appendChild(dt);

    const dd = el('dd');
    const bar = el('div', 'bar-fill');
    bar.style.width = `${Math.min((value / 55) * 100, 100)}%`;
    const score = el('span');
    score.textContent = value;
    dd.append(bar, score);
    list.appendChild(dd);
  }
}

function renderQuestLog(activity) {
  const section = document.getElementById('quest-log');
  section.appendChild(el('h2')).textContent = 'Quest Log';

  const windowSpan = el('span', 'window');
  windowSpan.textContent = `Quest log — ${activity.window}`;
  const pushes = el('span', 'pushes');
  pushes.textContent = `${activity.pushes} pushes`;
  const line = el('p');
  line.append(windowSpan, ' · ', pushes);
  if (activity.fetchedAt) {
    const fetched = el('span', 'fetched');
    fetched.textContent = `updated ${activity.fetchedAt}`;
    line.append(' · ', fetched);
  }
  section.appendChild(line);

  const ul = el('ul');
  for (const highlight of activity.highlights) {
    ul.appendChild(el('li')).textContent = highlight;
  }
  section.appendChild(ul);
}

function renderFooter(identity) {
  const link = document.getElementById('github-link');
  link.href = identity.links.github;
  link.textContent = identity.displayName || 'GitHub';

  const year = document.createElement('span');
  year.textContent = `© ${new Date().getFullYear()} YuGiMob`;
  document.getElementById('campfire').appendChild(year);
}

function applyVisibility(sections) {
  setHidden('background', !sections.showBackground);
  setHidden('artifacts', !sections.showArtifacts);
  setHidden('quest-log', !sections.showQuestLog);
  setHidden('ability-scores', !sections.showAbilityScores);
  setHidden('campfire', !sections.showCampfire);
}

async function init() {
  const response = await fetch('data/site-data.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  const data = await response.json();

  renderIdentity(data.identity);
  renderBackground(data.about);
  renderProjects(data.projects);
  renderAbilityScores(data.stats);
  renderQuestLog(data.activity);
  renderFooter(data.identity);
  applyVisibility(data.sections);
}

init().catch(() => {
  document.getElementById('display-name').textContent =
    'Site data unavailable — check data/site-data.json';
  console.warn('YuGiMob: could not load data/site-data.json');
});
