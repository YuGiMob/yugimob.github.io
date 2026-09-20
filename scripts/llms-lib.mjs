import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatNumber } from '../assets/js/ui.js';

export const SITE_URL = 'https://yugimob.github.io';
export const SITE_REPOSITORY = 'https://github.com/YuGiMob/yugimob.github.io';

function firstSentence(text) {
  const sentence = String(text ?? '').trim();
  const end = sentence.match(/^[\s\S]*?[.!?](?=\s+[A-Z]|\s*$)/);
  return end ? end[0].trim() : sentence;
}

function dataLine(label, url, detail) {
  return `- [${label}](${url}): ${detail}`;
}

function signedPoints(value) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

function rateCell(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
}

function comparisonCell(contender) {
  const comparison = contender.vsHighlight;
  if (!comparison) return '—';
  const p = Number.isFinite(comparison.pAdjusted) ? comparison.pAdjusted : comparison.p;
  return `${signedPoints(comparison.low)} to ${signedPoints(comparison.high)} points, Holm-adjusted p=${p < 0.001 ? '< 0.001' : p.toFixed(3)}`;
}

function benchmarkTable(benchmark) {
  const contenders = Array.isArray(benchmark?.contenders) ? benchmark.contenders : [];
  if (contenders.length === 0) return [];
  const lines = [
    '| tool | version | overall | staleness | served state | 95% interval | vs the highlighted tool | runs | passed | API cost |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const contender of contenders) {
    lines.push(`| ${[
      contender.highlight ? `**${contender.label}**` : contender.label,
      contender.version ? `v${contender.version}` : '—',
      rateCell(contender.overall),
      rateCell(contender.safety),
      rateCell(contender.served),
      `${contender.low.toFixed(1)}–${contender.high.toFixed(1)}`,
      comparisonCell(contender),
      formatNumber(contender.runs),
      formatNumber(contender.passed),
      Number.isFinite(contender.costUsd) ? `$${contender.costUsd.toFixed(2)}` : '—',
    ].join(' | ')} |`);
  }
  return lines;
}

function numbered(index) {
  return String(index + 1).padStart(2, '0');
}

function projectNumbers(project) {
  return `Stars ${formatNumber(project.stars ?? 0)}, ${formatNumber(project.npmWeeklyDownloads ?? 0)} npm installs per week.`;
}

function installLine(project) {
  return project.npm ? ` Install: \`npm i ${project.npm}\`.` : '';
}

export function buildLlmsTxt(siteData, showcase) {
  const identity = siteData.identity ?? {};
  const projects = new Map((siteData.projects ?? []).map((project) => [project.name, project]));
  const problems = showcase.problems ?? [];
  const benchmark = siteData.benchmark;
  const lines = [];

  lines.push(`# ${identity.displayName ?? 'YuGiMob'}`);
  lines.push('');
  lines.push(`> ${identity.tagline ?? ''}`.trimEnd());
  lines.push('');
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

  if (showcase.evidence && benchmark) {
    const evidence = showcase.evidence;
    const runs = `${benchmark.contenderCount} contenders over ${benchmark.models} models × ${benchmark.scenarios} scenarios, ${benchmark.runsPerContender} runs each (${formatNumber(benchmark.totalRuns)} total).`;
    lines.push('## Evidence');
    lines.push('');
    lines.push(dataLine(evidence.name, benchmark.source, `${firstSentence(evidence.answer)} ${runs}`));
    for (const contender of benchmark.contenders ?? []) {
      const splits = [`${contender.overall.toFixed(1)}% overall`];
      if (Number.isFinite(contender.safety)) splits.push(`${contender.safety.toFixed(1)}% staleness`);
      if (Number.isFinite(contender.served)) splits.push(`${contender.served.toFixed(1)}% served state`);
      const version = contender.version ? ` v${contender.version}` : '';
      const comparison = contender.vsHighlight == null ? '' : `; ${comparisonCell(contender)} against the highlighted tool`;
      const trace = contender.traceUrl ? `[${contender.label}](${contender.traceUrl})` : contender.label;
      lines.push(`- ${trace}${version}: ${splits.join(', ')} across ${formatNumber(contender.runs)} runs${comparison}`);
    }
    lines.push(dataLine('Run report', benchmark.reportUrl, 'the committed JSON every figure comes from'));
    lines.push(dataLine('Committed traces', benchmark.tracesUrl, 'one trace per scored run'));
    lines.push('');
  }

  lines.push('## Data');
  lines.push('');
  lines.push(dataLine('Markdown mirror', `${SITE_URL}/index.md`, 'the whole page as markdown, generated from the two data files'));
  lines.push(dataLine('Interactive demo', `${SITE_URL}/?step=1`, 'the anchored-edit guide, one step per URL'));
  lines.push(dataLine('Machine data', `${SITE_URL}/data/site-data.json`, 'stars, downloads, activity, history, and benchmark numbers, refreshed daily'));
  lines.push(dataLine('Curated showcase', `${SITE_URL}/data/showcase.json`, 'the narrative behind every tool, one entry per problem'));
  lines.push(dataLine('Scenario matrix', `${SITE_URL}/data/benchmark-matrix.json`, 'pass counts per scenario and contender behind the benchmark chart'));
  lines.push(dataLine('Agent readability', `${SITE_URL}/agent-readability.json`, 'the machine-readable entry points this site publishes'));
  lines.push(dataLine('Feed', `${SITE_URL}/feed.json`, 'a JSON Feed of the daily benchmark and install snapshots'));
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
  const benchmark = siteData.benchmark;
  const lines = [];

  lines.push(`# ${identity.displayName ?? 'YuGiMob'}`);
  lines.push('');
  lines.push(`> ${identity.tagline ?? ''}`.trimEnd());
  lines.push('');
  for (const paragraph of showcase.intro?.paragraphs ?? []) {
    lines.push(paragraph, '');
  }

  lines.push('## Problems');
  lines.push('');
  let entries = 0;
  for (const problem of problems) {
    const project = projects.get(problem.name);
    if (!project) continue;
    lines.push(`### ${numbered(entries)}. ${problem.headline}`);
    entries += 1;
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

  if (showcase.evidence) {
    const evidence = showcase.evidence;
    lines.push('## Evidence');
    lines.push('');
    lines.push(`### ${evidence.headline}`);
    lines.push('');
    lines.push(evidence.problem);
    lines.push('');
    const project = projects.get(evidence.name);
    const built = project ? `**Built:** [${project.name}](${project.url}) — ${evidence.answer}` : evidence.answer;
    lines.push(built);
    lines.push('');
    for (const highlight of evidence.highlights ?? []) lines.push(`- ${highlight}`);
    lines.push('');
    if (benchmark) {
      lines.push(`${benchmark.contenderCount} contenders over ${benchmark.models} models × ${benchmark.scenarios} scenarios, ${benchmark.runsPerContender} runs each (${formatNumber(benchmark.totalRuns)} total).`);
      lines.push('');
      lines.push(...benchmarkTable(benchmark));
      lines.push('');
      lines.push('Every rate is a pass rate over the shared model × scenario grid, the interval is a 95% Wilson interval, and the comparison column pairs each rival with the highlighted tool: the exact two-sided McNemar test, Holm-adjusted across rivals, with an unadjusted 95% Newcombe score interval for the difference.');
      lines.push('');
      lines.push(dataLine('Run report', benchmark.reportUrl, 'the committed JSON every figure comes from'));
      lines.push(dataLine('Committed traces', benchmark.tracesUrl, 'one trace per scored run'));
      lines.push(dataLine('Scenario matrix', `${SITE_URL}/data/benchmark-matrix.json`, 'pass counts per scenario and contender'));
      lines.push('');
    }
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
  lines.push(dataLine('Machine data', `${SITE_URL}/data/site-data.json`, 'stars, downloads, activity, history, and benchmark numbers, refreshed daily'));
  lines.push(dataLine('Curated showcase', `${SITE_URL}/data/showcase.json`, 'the narrative behind every tool, one entry per problem'));
  lines.push(dataLine('Agent index', `${SITE_URL}/llms.txt`, 'the short index of this site for language models'));
  lines.push(dataLine('Feed', `${SITE_URL}/feed.json`, 'a JSON Feed of the daily benchmark and install snapshots'));
  lines.push(dataLine('Sitemap', `${SITE_URL}/sitemap.xml`, 'the single canonical page'));
  lines.push('');

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

const FEED_ITEM_LIMIT = 30;

function benchmarkFeedItem(entry, label) {
  const splits = [`${entry.overall.toFixed(1)}% overall`];
  if (Number.isFinite(entry.safety)) splits.push(`${entry.safety.toFixed(1)}% on staleness scenarios`);
  if (Number.isFinite(entry.served)) splits.push(`${entry.served.toFixed(1)}% on served-state scenarios`);
  return {
    id: `${SITE_URL}/#benchmark-${entry.date}`,
    url: `${SITE_URL}/#evidence`,
    title: `Benchmark report ${entry.date}: ${entry.overall.toFixed(1)}% overall`,
    content_text: `${label} scored ${splits.join(', ')} in the ${entry.date} pi-edit-benchmark report.`,
    date_published: `${entry.date}T00:00:00Z`,
    tags: ['benchmark'],
  };
}

function historyFeedItem(entry) {
  return {
    id: `${SITE_URL}/#history-${entry.date}`,
    url: `${SITE_URL}/#intro`,
    title: `Data refresh ${entry.date}: ${formatNumber(entry.totalStars)} stars, ${formatNumber(entry.totalDownloads)} weekly installs`,
    content_text: `${formatNumber(entry.totalStars)} GitHub stars and ${formatNumber(entry.totalDownloads)} npm installs per week across the projects on ${entry.date}.`,
    date_published: `${entry.date}T00:00:00Z`,
    tags: ['data'],
  };
}

export function buildJsonFeed(siteData) {
  const identity = siteData.identity ?? {};
  const contenders = Array.isArray(siteData.benchmark?.contenders) ? siteData.benchmark.contenders : [];
  const label = contenders.find((contender) => contender?.highlight === true)?.label ?? 'The highlighted tool';
  const items = [];
  for (const entry of Array.isArray(siteData.benchmarkHistory) ? siteData.benchmarkHistory : []) {
    if (entry && typeof entry.date === 'string' && Number.isFinite(entry.overall)) items.push(benchmarkFeedItem(entry, label));
  }
  for (const entry of Array.isArray(siteData.history) ? siteData.history : []) {
    if (entry && typeof entry.date === 'string' && Number.isFinite(entry.totalStars) && Number.isFinite(entry.totalDownloads)) items.push(historyFeedItem(entry));
  }
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
    updated: siteData.activity?.fetchedAt ?? null,
    artifacts: {
      llmsTxt: `${SITE_URL}/llms.txt`,
      markdown: `${SITE_URL}/index.md`,
      agentReadability: `${SITE_URL}/agent-readability.json`,
      machineData: `${SITE_URL}/data/site-data.json`,
      curatedData: `${SITE_URL}/data/showcase.json`,
      scenarioMatrix: `${SITE_URL}/data/benchmark-matrix.json`,
      feed: `${SITE_URL}/feed.json`,
      sitemap: `${SITE_URL}/sitemap.xml`,
    },
  }, null, 2)}\n`;
}

function writeIfChanged(target, text) {
  if (existsSync(target) && readFileSync(target, 'utf8') === text) return false;
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, target);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw err;
  }
  return true;
}

export function readAgentInputs(root) {
  const siteData = JSON.parse(readFileSync(join(root, 'data', 'site-data.json'), 'utf8'));
  const showcase = JSON.parse(readFileSync(join(root, 'data', 'showcase.json'), 'utf8'));
  return { siteData, showcase };
}

export function writeLlmsFile(root) {
  const { siteData, showcase } = readAgentInputs(root);
  return writeIfChanged(join(root, 'llms.txt'), buildLlmsTxt(siteData, showcase));
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
