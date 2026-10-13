import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatNumber } from '../assets/js/numbers.js';
import { dataRefreshedDate, dataRefreshedNote } from '../assets/js/view-model.js';
import { writeFileAtomic } from './atomic-write.mjs';

export const SITE_URL = 'https://yugimob.github.io';
export const SITE_REPOSITORY = 'https://github.com/YuGiMob/yugimob.github.io';

const SENTENCE_END = /[.!?](?=\s+[A-Z]|\s*$)/g;
const ABBREVIATIONS = /(?:\b(?:e\.g|i\.e|etc|cf|vs|Dr|Mr|Mrs|Ms|St|No|Inc|Ltd)\.|(?:\b[A-Z]\.){2,})$/;

function firstSentence(text) {
  const sentence = String(text ?? '').trim();
  for (const match of sentence.matchAll(SENTENCE_END)) {
    const candidate = sentence.slice(0, match.index + 1);
    if (!ABBREVIATIONS.test(candidate)) return candidate.trim();
  }
  return sentence;
}

function dataLine(label, url, detail) {
  return `- [${label}](${url}): ${detail}`;
}

function numbered(index) {
  return String(index + 1).padStart(2, '0');
}

function projectNumbers(project) {
  return `Stars ${formatNumber(project.stars ?? 0)}, ${formatNumber(project.npmWeeklyDownloads ?? 0)} npm installs per week.`;
}

function installLine(project) {
  return project.npm ? ` Install: \`pi install npm:${project.npm}\`.` : '';
}

export function buildLlmsTxt(siteData, showcase) {
  const identity = siteData.identity ?? {};
  const projects = new Map((siteData.projects ?? []).map((project) => [project.name, project]));
  const problems = showcase.problems ?? [];
  const lines = [];

  lines.push(`# ${identity.displayName ?? 'YuGiMob'}`);
  lines.push('');
  lines.push(`> ${identity.tagline ?? ''}`.trimEnd());
  lines.push('');
  const refreshed = dataRefreshedNote(siteData);
  if (refreshed) lines.push(refreshed, '');
  for (const paragraph of showcase.intro?.paragraphs ?? []) {
    lines.push(paragraph, '');
  }

  lines.push('## Tools');
  lines.push('');
  for (const problem of problems) {
    const project = projects.get(problem.name);
    if (!project) continue;
    lines.push(`- [${project.name}](${project.url}): ${firstSentence(problem.answer)}${installLine(project)} ${projectNumbers(project)}`);
  }
  lines.push('');

  lines.push('## Data');
  lines.push('');
  lines.push(dataLine('Markdown mirror', `${SITE_URL}/index.md`, 'the whole page as markdown, generated from the two data files'));
  lines.push(dataLine('Machine data', `${SITE_URL}/data/site-data.json`, 'stars, downloads, activity, and history, refreshed daily'));
  lines.push(dataLine('Curated showcase', `${SITE_URL}/data/showcase.json`, 'the rules behind every tool, one entry per extension'));
  lines.push(dataLine('Agent readability', `${SITE_URL}/agent-readability.json`, 'the machine-readable entry points this site publishes'));
  lines.push(dataLine('Feed', `${SITE_URL}/feed.json`, 'a JSON Feed of the daily install and star snapshots'));
  lines.push(dataLine('Sitemap', `${SITE_URL}/sitemap.xml`, 'the single canonical page'));
  lines.push('');

  lines.push('## Optional');
  lines.push('');
  lines.push(dataLine('Source repository', SITE_REPOSITORY, 'the hand-written page and the refresh pipeline that derives these files'));
  lines.push(dataLine('Security policy', `${SITE_REPOSITORY}/blob/main/SECURITY.md`, 'how to report a vulnerability'));
  lines.push(dataLine('Crawl policy', `${SITE_URL}/robots.txt`, 'the crawl rules and content signals this site declares'));
  lines.push('');

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export function buildIndexMd(siteData, showcase) {
  const identity = siteData.identity ?? {};
  const projects = new Map((siteData.projects ?? []).map((project) => [project.name, project]));
  const problems = showcase.problems ?? [];
  const lines = [];

  lines.push(`# ${identity.displayName ?? 'YuGiMob'}`);
  lines.push('');
  lines.push(`> ${identity.tagline ?? ''}`.trimEnd());
  lines.push('');
  const refreshed = dataRefreshedNote(siteData);
  if (refreshed) lines.push(refreshed, '');
  for (const paragraph of showcase.intro?.paragraphs ?? []) {
    lines.push(paragraph, '');
  }

  lines.push('## Tools');
  lines.push('');
  let entries = 0;
  for (const problem of problems) {
    const project = projects.get(problem.name);
    if (!project) continue;
    lines.push(`### ${numbered(entries)}. ${problem.headline}`);
    entries += 1;
    lines.push('');
    lines.push(`**Rule:** ${problem.kicker}`);
    lines.push('');
    lines.push(problem.problem);
    lines.push('');
    lines.push(`**Built:** [${project.name}](${project.url}) — ${problem.answer}`);
    lines.push('');
    for (const highlight of problem.highlights ?? []) lines.push(`- ${highlight}`);
    lines.push('');
    lines.push(`${installLine(project).trim()} ${projectNumbers(project)}`.trim());
    lines.push('');
  }

  if (Array.isArray(showcase.principles) && showcase.principles.length > 0) {
    lines.push('## Principles');
    lines.push('');
    for (const principle of showcase.principles) lines.push(`- ${principle}`);
    lines.push('');
  }

  if (Array.isArray(showcase.colophon) && showcase.colophon.length > 0) {
    lines.push('## About');
    lines.push('');
    for (const paragraph of showcase.colophon) lines.push(paragraph, '');
  }

  lines.push('## Data');
  lines.push('');
  lines.push(dataLine('Machine data', `${SITE_URL}/data/site-data.json`, 'stars, downloads, activity, and history, refreshed daily'));
  lines.push(dataLine('Curated showcase', `${SITE_URL}/data/showcase.json`, 'the rules behind every tool, one entry per extension'));
  lines.push(dataLine('Agent index', `${SITE_URL}/llms.txt`, 'the short index of this site for language models'));
  lines.push(dataLine('Feed', `${SITE_URL}/feed.json`, 'a JSON Feed of the daily install and star snapshots'));
  lines.push(dataLine('Sitemap', `${SITE_URL}/sitemap.xml`, 'the single canonical page'));
  lines.push('');

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

const FEED_ITEM_LIMIT = 30;

function signed(value) {
  return `${value > 0 ? '+' : ''}${formatNumber(value)}`;
}

function changeSentence(entry, previous) {
  const stars = entry.totalStars - previous.totalStars;
  const downloads = entry.totalDownloads - previous.totalDownloads;
  if (stars === 0 && downloads === 0) return ' No change in stars or weekly installs since the previous snapshot.';
  const starPart = stars === 0 ? 'no change in stars' : `${signed(stars)} ${Math.abs(stars) === 1 ? 'star' : 'stars'}`;
  const downloadPart = downloads === 0 ? 'no change in weekly installs' : `${signed(downloads)} weekly installs`;
  return ` That is ${starPart} and ${downloadPart} since the previous snapshot.`;
}

function historyFeedItem(entry, previous) {
  const change = previous ? changeSentence(entry, previous) : '';
  return {
    id: `${SITE_URL}/#history-${entry.date}`,
    url: `${SITE_URL}/#intro`,
    title: `Data refresh ${entry.date}: ${formatNumber(entry.totalStars)} stars, ${formatNumber(entry.totalDownloads)} weekly installs`,
    content_text: `${formatNumber(entry.totalStars)} GitHub stars and ${formatNumber(entry.totalDownloads)} npm installs per week across the projects on ${entry.date}.${change}`,
    date_published: `${entry.date}T00:00:00Z`,
    tags: ['data'],
  };
}

export function buildJsonFeed(siteData) {
  const identity = siteData.identity ?? {};
  const entries = (Array.isArray(siteData.history) ? siteData.history : [])
    .filter((entry) => entry && typeof entry.date === 'string' && Number.isFinite(entry.totalStars) && Number.isFinite(entry.totalDownloads))
    .sort((first, second) => first.date.localeCompare(second.date));
  const items = entries.map((entry, index) => historyFeedItem(entry, index > 0 ? entries[index - 1] : null));
  items.sort((a, b) => b.date_published.localeCompare(a.date_published) || a.id.localeCompare(b.id));
  return `${JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: identity.displayName ?? 'YuGiMob',
    home_page_url: `${SITE_URL}/`,
    feed_url: `${SITE_URL}/feed.json`,
    description: identity.tagline ?? '',
    favicon: `${SITE_URL}/assets/favicon.svg`,
    language: 'en',
    authors: [{ name: identity.displayName ?? 'YuGiMob', url: identity.links?.github ?? SITE_REPOSITORY }],
    items: items.slice(0, FEED_ITEM_LIMIT),
  }, null, 2)}\n`;
}

export function buildAgentReadability(siteData) {
  const identity = siteData.identity ?? {};
  return `${JSON.stringify({
    name: identity.displayName ?? 'YuGiMob',
    description: identity.tagline ?? '',
    site: SITE_URL,
    repository: SITE_REPOSITORY,
    language: 'en',
    license: 'MIT',
    updated: dataRefreshedDate(siteData),
    artifacts: {
      llmsTxt: `${SITE_URL}/llms.txt`,
      markdown: `${SITE_URL}/index.md`,
      agentReadability: `${SITE_URL}/agent-readability.json`,
      machineData: `${SITE_URL}/data/site-data.json`,
      curatedData: `${SITE_URL}/data/showcase.json`,
      feed: `${SITE_URL}/feed.json`,
      sitemap: `${SITE_URL}/sitemap.xml`,
    },
  }, null, 2)}\n`;
}

function writeIfChanged(target, text) {
  if (existsSync(target) && readFileSync(target, 'utf8') === text) return false;
  writeFileAtomic(target, text);
  return true;
}

export function readAgentInputs(root) {
  const siteData = JSON.parse(readFileSync(join(root, 'data', 'site-data.json'), 'utf8'));
  const showcase = JSON.parse(readFileSync(join(root, 'data', 'showcase.json'), 'utf8'));
  return { siteData, showcase };
}

export function writeAgentFiles(root) {
  const { siteData, showcase } = readAgentInputs(root);
  return {
    'llms.txt': writeIfChanged(join(root, 'llms.txt'), buildLlmsTxt(siteData, showcase)),
    'index.md': writeIfChanged(join(root, 'index.md'), buildIndexMd(siteData, showcase)),
    'agent-readability.json': writeIfChanged(join(root, 'agent-readability.json'), buildAgentReadability(siteData)),
    'feed.json': writeIfChanged(join(root, 'feed.json'), buildJsonFeed(siteData)),
  };
}
