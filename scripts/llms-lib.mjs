import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatNumber } from '../assets/js/ui.js';

export const SITE_URL = 'https://yugimob.github.io';
export const SITE_REPOSITORY = 'https://github.com/YuGiMob/yugimob.github.io';

function firstSentence(text) {
  const sentence = String(text ?? '').trim();
  const end = sentence.indexOf('. ');
  return end === -1 ? sentence : sentence.slice(0, end + 1);
}

function dataLine(label, url, detail) {
  return `- [${label}](${url}): ${detail}`;
}

function highlightSummary(benchmark) {
  const contender = (benchmark?.contenders ?? []).find((entry) => entry?.highlight === true);
  if (!contender) return null;
  const splits = [`${contender.overall.toFixed(1)}% overall`];
  if (Number.isFinite(contender.safety)) splits.push(`${contender.safety.toFixed(1)}% staleness`);
  if (Number.isFinite(contender.served)) splits.push(`${contender.served.toFixed(1)}% served state`);
  return `${contender.label}: ${splits.join(', ')} across ${formatNumber(contender.runs)} runs`;
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
    const highlight = highlightSummary(benchmark);
    if (highlight) lines.push(`- ${highlight}`);
    lines.push(dataLine('Run report', benchmark.reportUrl, 'the committed JSON every figure comes from'));
    lines.push(dataLine('Committed traces', benchmark.tracesUrl, 'one trace per scored run'));
    lines.push('');
  }

  lines.push('## Data');
  lines.push('');
  lines.push(dataLine('Markdown mirror', `${SITE_URL}/index.md`, 'the whole page as markdown, generated from the two data files'));
  lines.push(dataLine('Machine data', `${SITE_URL}/data/site-data.json`, 'stars, downloads, activity, history, and benchmark numbers, refreshed daily'));
  lines.push(dataLine('Curated showcase', `${SITE_URL}/data/showcase.json`, 'the narrative behind every tool, one entry per problem'));
  lines.push(dataLine('Scenario matrix', `${SITE_URL}/data/benchmark-matrix.json`, 'pass counts per scenario and contender behind the benchmark chart'));
  lines.push(dataLine('Agent readability', `${SITE_URL}/agent-readability.json`, 'the machine-readable entry points this site publishes'));
  lines.push(dataLine('Sitemap', `${SITE_URL}/sitemap.xml`, 'the single canonical page'));
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
      const highlight = highlightSummary(benchmark);
      if (highlight) lines.push(highlight);
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
  lines.push(dataLine('Sitemap', `${SITE_URL}/sitemap.xml`, 'the single canonical page'));
  lines.push('');

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
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
  };
}
