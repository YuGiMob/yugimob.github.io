#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAgentFiles } from './llms-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const changed = writeAgentFiles(ROOT);
for (const [file, written] of Object.entries(changed)) {
  console.log(`${file}: ${written ? 'written' : 'unchanged'}`);
}
