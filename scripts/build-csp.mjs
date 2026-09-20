#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withScriptSrcHash } from './csp-lib.mjs';

const ROOT = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = join(ROOT, 'index.html');
const source = readFileSync(PAGE, 'utf8');

const block = source.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!block) {
  console.error('csp: index.html has no inline JSON-LD block');
  process.exit(1);
}

const policy = source.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
if (!policy) {
  console.error('csp: index.html has no Content-Security-Policy meta tag');
  process.exit(1);
}

const hash = createHash('sha256').update(block[1], 'utf8').digest('base64');
const next = withScriptSrcHash(policy[1], hash);
if (next === null) {
  console.error('csp: the Content-Security-Policy has no script-src directive to anchor the hash to');
  process.exit(1);
}
if (next === policy[1]) {
  console.log(`csp: unchanged (sha256-${hash})`);
  process.exit(0);
}

const updated = source.replace(policy[0], `<meta http-equiv="Content-Security-Policy" content="${next}"`);
const tmp = `${PAGE}.${process.pid}.tmp`;
try {
  writeFileSync(tmp, updated);
  renameSync(tmp, PAGE);
} catch (err) {
  try {
    unlinkSync(tmp);
  } catch {}
  throw err;
}
console.log(`csp: updated to sha256-${hash}`);
