#!/usr/bin/env node
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAgentInputs } from './llms-lib.mjs';
import { updateIndexFile } from './site-html-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { siteData, showcase } = readAgentInputs(ROOT);
const result = updateIndexFile(join(ROOT, 'index.html'), siteData, showcase);
if (!result.ok) {
  console.error(`build:static: index.html was not rewritten (${result.reason})`);
  process.exit(1);
}
console.log(`index.html: ${result.changed ? 'written' : 'unchanged'}`);
