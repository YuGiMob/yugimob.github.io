#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retryDelayMs, sleep } from './refresh-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 15000;
const ATTEMPTS = 3;
const WARN_STATUSES = new Set([401, 403, 429]);

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

const site = readJson('data/site-data.json');
const showcase = readJson('data/showcase.json');
const urls = new Map();

function add(url, label) {
  if (!/^https?:\/\//.test(url ?? '')) return;
  if (!urls.has(url)) urls.set(url, new Set());
  urls.get(url).add(label);
}

add(site.identity.links.github, 'identity');
add(site.identity.avatarUrl, 'avatar');
for (const project of site.projects) {
  add(project.url, project.name);
  if (project.npm) add(`https://registry.npmjs.org/${project.npm}`, `${project.name} on npm`);
}
if (site.benchmark) {
  add(site.benchmark.source, 'benchmark');
  add(site.benchmark.reportUrl, 'benchmark report');
  add(site.benchmark.tracesUrl, 'benchmark traces');
}
for (const problem of showcase.problems ?? []) {
  const project = site.projects.find((entry) => entry.name === problem.name);
  add(project?.url, `${problem.name} showcase`);
}

async function probe(url, method) {
  const response = await fetch(url, { redirect: 'follow', method, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.body) await response.body.cancel().catch(() => {});
  return response;
}

async function check(url) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try {
      let response = await probe(url, 'HEAD');
      if (response.status === 405 || response.status === 501) response = await probe(url, 'GET');
      lastStatus = response.status;
      if ((response.status === 429 || response.status >= 500) && attempt + 1 < ATTEMPTS) {
        await sleep(retryDelayMs(response.headers));
        continue;
      }
      return response.status;
    } catch {
      if (attempt + 1 >= ATTEMPTS) return lastStatus;
      await sleep(500 * (attempt + 1));
    }
  }
  return lastStatus;
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
