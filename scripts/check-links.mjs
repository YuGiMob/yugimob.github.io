#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 15000;
const WARN_STATUSES = new Set([401, 403, 429]);

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

const site = readJson('data/site-data.json');
const showcase = readJson('data/showcase.json');
const urls = new Map();

function add(url, label) {
  if (!url) return;
  if (!urls.has(url)) urls.set(url, new Set());
  urls.get(url).add(label);
}

add(site.identity.links.github, 'identity');
for (const project of site.projects) {
  add(project.url, project.name);
  if (project.npm) add(`https://registry.npmjs.org/${project.npm}`, `${project.name} on npm`);
}
if (showcase.evidence?.benchmark?.source) add(showcase.evidence.benchmark.source, 'benchmark');

async function check(url) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.body) await response.body.cancel().catch(() => {});
      return response.status;
    } catch {
      if (attempt === 1) return 0;
    }
  }
  return 0;
}

let failures = 0;
for (const [url, labels] of urls) {
  const status = await check(url);
  const ok = status >= 200 && status < 400;
  const verdict = ok ? 'ok' : WARN_STATUSES.has(status) ? 'warn' : 'fail';
  if (verdict === 'fail') failures += 1;
  console.log(`${verdict.padEnd(4)} ${String(status).padEnd(3)} ${url} (${[...labels].join(', ')})`);
}

if (failures > 0) {
  console.error(`links: ${failures} of ${urls.size} unreachable`);
  process.exit(1);
}
console.log(`links: ${urls.size} checked`);
