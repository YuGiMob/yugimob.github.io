#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkUrl, collectLinks, verdictFor } from './link-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

const urls = collectLinks(readJson('data/site-data.json'), readJson('data/showcase.json'));
let failures = 0;

for (const [url, labels] of urls) {
  const status = await checkUrl(url);
  const verdict = verdictFor(status);
  if (verdict === 'fail') failures += 1;
  console.log(`${verdict.padEnd(4)} ${String(status).padEnd(3)} ${url} (${[...labels].join(', ')})`);
}

if (failures > 0) {
  console.error(`links: ${failures} of ${urls.size} unreachable`);
  process.exit(1);
}
console.log(`links: ${urls.size} checked`);
