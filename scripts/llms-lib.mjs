import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatNumber } from '../assets/js/ui.js';

export const SITE_URL = 'https://yugimob.github.io';

function firstSentence(text) {
  const sentence = String(text ?? '').trim();
  const end = sentence.indexOf('. ');
  return end === -1 ? sentence : sentence.slice(0, end + 1);
}

function dataLine(label, url, detail) {
  return `- [${label}](${url}): ${detail}`;
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
    const install = project.npm ? ` Install: \`npm i ${project.npm}\`.` : '';
    const numbers = `Stars ${formatNumber(project.stars ?? 0)}, ${formatNumber(project.npmWeeklyDownloads ?? 0)} npm installs per week.`;
    lines.push(`- [${project.name}](${project.url}): ${firstSentence(problem.answer)}${install} ${numbers}`);
  }
  lines.push('');

  if (showcase.evidence && benchmark) {
    const evidence = showcase.evidence;
    const runs = `${benchmark.contenderCount} contenders over ${benchmark.models} models × ${benchmark.scenarios} scenarios, ${benchmark.runsPerContender} runs each (${formatNumber(benchmark.totalRuns)} total).`;
    lines.push('## Evidence');
    lines.push('');
    lines.push(dataLine(evidence.name, benchmark.source, `${firstSentence(evidence.answer)} ${runs}`));
    lines.push(dataLine('Run report', benchmark.reportUrl, 'the committed JSON every figure comes from'));
    lines.push(dataLine('Committed traces', benchmark.tracesUrl, 'one trace per scored run'));
    lines.push('');
  }

  lines.push('## Data');
  lines.push('');
  lines.push(dataLine('Machine data', `${SITE_URL}/data/site-data.json`, 'stars, downloads, activity, history, and benchmark numbers, refreshed daily'));
  lines.push(dataLine('Curated showcase', `${SITE_URL}/data/showcase.json`, 'the narrative behind every tool, one entry per problem'));
  lines.push(dataLine('Sitemap', `${SITE_URL}/sitemap.xml`, 'the single canonical page'));
  lines.push('');

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export function writeLlmsFile(root) {
  const siteData = JSON.parse(readFileSync(join(root, 'data', 'site-data.json'), 'utf8'));
  const showcase = JSON.parse(readFileSync(join(root, 'data', 'showcase.json'), 'utf8'));
  const text = buildLlmsTxt(siteData, showcase);
  const target = join(root, 'llms.txt');
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
