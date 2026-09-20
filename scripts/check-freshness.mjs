#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { historyAgeDays, MAX_HISTORY_AGE_DAYS } from './refresh-lib.mjs';

const ROOT = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.json'), 'utf8'));
const history = Array.isArray(data.history) ? data.history : [];
const age = historyAgeDays(history);
const newest = history.length > 0 ? history[history.length - 1]?.date : null;

if (age === null) {
  console.error('freshness: the newest history snapshot is missing or unparsable');
  process.exit(1);
}
if (age > MAX_HISTORY_AGE_DAYS) {
  console.error(`freshness: the newest history snapshot (${newest}) is ${age} days old; the cap is ${MAX_HISTORY_AGE_DAYS}`);
  process.exit(1);
}
console.log(`freshness: ok (newest history snapshot: ${newest})`);
