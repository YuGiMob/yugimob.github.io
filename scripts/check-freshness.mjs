#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { historyAgeDays, MAX_HISTORY_AGE_DAYS } from './refresh-lib.mjs';

const ROOT = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.json'), 'utf8'));
const history = Array.isArray(data.history) ? data.history : [];
const newest = history.length > 0 ? history[history.length - 1]?.date : null;
const historyAge = historyAgeDays(history);
const errors = [];

if (historyAge === null) errors.push('the newest history snapshot is missing or unparsable');
else if (historyAge > MAX_HISTORY_AGE_DAYS) {
  errors.push(`the newest history snapshot (${newest}) is ${historyAge} days old; the cap is ${MAX_HISTORY_AGE_DAYS}`);
}

if (errors.length > 0) {
  for (const message of errors) console.error(`freshness: ${message}`);
  process.exit(1);
}

console.log(`freshness: ok (newest history snapshot: ${newest})`);
