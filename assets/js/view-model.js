import { countWord, formatWindow } from './site-data.js';
import { formatNumber } from './ui.js';

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
  const rows = problemEntries(showcase, projects).map(({ entry, number }) => ({
    href: `#${problemId(entry.name)}`,
    headline: entry.headline,
    tool: entry.name,
    number,
  }));
  if (showcase?.evidence?.name) {
    rows.push({
      href: '#evidence',
      headline: showcase.evidence.headline,
      tool: showcase.evidence.name,
      number: numbered(rows.length),
    });
  }
  return rows;
}

export function problemsHeading(showcase, projects) {
  const count = problemEntries(showcase, projects).length + (showcase?.evidence ? 1 : 0);
  const word = countWord(count);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} things that kept going wrong`;
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

const DAY_MS = 86400000;

function dayCount(days) {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function staleDays(date, today) {
  const then = Date.parse(date);
  const now = Date.parse(today);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.round((now - then) / DAY_MS));
}

export function stalenessNotice(data, today, limit = 3) {
  const messages = [];
  const activityDays = staleDays(data.activity?.fetchedAt, today);
  const benchmarkDays = staleDays(data.benchmark?.generatedAt, today);
  if (activityDays != null && activityDays > limit) messages.push(`the daily refresh last updated this page ${dayCount(activityDays)} ago`);
  if (benchmarkDays != null && benchmarkDays > limit) messages.push(`the newest benchmark report is ${dayCount(benchmarkDays)} old`);
  if (messages.length === 0) return null;
  const joined = messages.join('; ');
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}

export function structuredData(data, showcase) {
  const names = new Set([
    ...(Array.isArray(showcase?.problems) ? showcase.problems.map((problem) => problem.name) : []),
    ...(showcase?.evidence ? [showcase.evidence.name] : []),
  ]);
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
        license: project.license ? `https://spdx.org/licenses/${project.license}` : undefined,
        url: project.url,
        sameAs: project.npm ? [`https://www.npmjs.com/package/${project.npm}`] : undefined,
      },
    }));
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${data.identity.displayName} projects`,
    dateModified: data.activity?.fetchedAt || undefined,
    itemListElement: items,
  };
}
