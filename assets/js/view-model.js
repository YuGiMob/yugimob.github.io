import { countWord, formatWindow } from './site-data.js';
import { elapsedDays, formatNumber } from './numbers.js';

const SPDX_ALIASES = new Map([['AGPL-3.0', 'AGPL-3.0-only']]);

export function problemId(name) {
  return `problem-${name}`;
}

function numbered(index) {
  return String(index + 1).padStart(2, '0');
}

export function problemEntries(showcase, projects) {
  const problems = Array.isArray(showcase?.problems) ? showcase.problems : [];
  const rows = [];
  for (const entry of problems) {
    const project = projects.get(entry.name);
    if (!project) continue;
    rows.push({ entry, project, number: numbered(rows.length) });
  }
  return rows;
}

export function problemIndexRows(showcase, projects) {
  return problemEntries(showcase, projects).map(({ entry, number }) => ({
    href: `#${problemId(entry.name)}`,
    headline: entry.headline,
    tool: entry.name,
    number,
  }));
}

export function problemsHeading(showcase, projects) {
  const count = problemEntries(showcase, projects).length;
  const word = countWord(count);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} rules the tools enforce`;
}

export function heroStatRows(data) {
  const totalDownloads = data.projects.reduce((sum, project) => sum + (project.npmWeeklyDownloads || 0), 0);
  return [
    { label: 'GitHub stars', value: data.stats.totalStars ?? 0 },
    { label: 'packages on npm', value: data.stats.npmPackages ?? 0 },
    { label: 'npm installs / week', value: totalDownloads },
  ];
}

export function projectChipRows(project) {
  const chips = [
    { label: 'stars', value: formatNumber(project.stars ?? 0) },
    { label: 'forks', value: formatNumber(project.forks ?? 0) },
  ];
  if (project.npmWeeklyDownloads) chips.push({ label: 'installs/wk', value: formatNumber(project.npmWeeklyDownloads) });
  if (project.language) chips.push({ label: 'language', value: project.language });
  if (project.license) chips.push({ label: 'license', value: project.license });
  if (project.pushedAt) chips.push({ label: 'updated', value: String(project.pushedAt).slice(0, 10) });
  return chips;
}

export function activityLine(activity) {
  const range = typeof activity.window === 'string' && activity.window.includes('..') ? formatWindow(activity.window) : '';
  return {
    pushes: `${formatNumber(activity.pushes ?? 0)} pushes to public repositories`,
    window: range,
  };
}

export function repositoryFacts(stats) {
  return {
    repositories: formatNumber(stats?.publicRepos ?? 0),
    forks: formatNumber(stats?.forksReceived ?? 0),
  };
}

export function sectionVisibility(sections = {}, showcase = null) {
  const showProblems = sections.showProblems ?? true;
  return {
    problems: showProblems && (showcase ? showcase.problems.length > 0 : true),
    colophon: sections.showAbout ?? true,
    campfire: sections.showCampfire ?? true,
    'hero-stats': sections.showHeroStats ?? true,
  };
}

export const STALE_AFTER_DAYS = 2;

function dayCount(days) {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export const staleDays = elapsedDays;

export function stalenessNotice(data, today, limit = STALE_AFTER_DAYS) {
  const activityDays = staleDays(data.activity?.fetchedAt, today);
  if (activityDays == null || activityDays <= limit) return null;
  return `The daily refresh last updated this page ${dayCount(activityDays)} ago.`;
}

function resolvedUrl(value, baseUrl) {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  if (!baseUrl) return value;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

export function structuredData(data, showcase, baseUrl = '') {
  const names = new Set(
    Array.isArray(showcase?.problems) ? showcase.problems.map((problem) => problem.name) : [],
  );
  const byName = new Map(data.projects.map((project) => [project.name, project]));
  const items = [...names]
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
        license: project.license ? `https://spdx.org/licenses/${SPDX_ALIASES.get(project.license) ?? project.license}` : undefined,
        url: project.url,
        sameAs: project.npm ? [`https://www.npmjs.com/package/${project.npm}`] : undefined,
      },
    }));
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    dateModified: data.activity?.fetchedAt || undefined,
    mainEntity: {
      '@type': 'Person',
      name: data.identity.displayName,
      description: data.identity.tagline,
      url: resolvedUrl(baseUrl),
      image: resolvedUrl(data.identity.avatarUrl, baseUrl),
      sameAs: data.identity.links?.github ? [data.identity.links.github] : undefined,
    },
    hasPart: {
      '@type': 'ItemList',
      name: `${data.identity.displayName} projects`,
      numberOfItems: items.length,
      itemListElement: items,
    },
  };
}
