#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeLlmsFile } from './llms-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const changed = writeLlmsFile(ROOT);
console.log(changed ? 'llms.txt: written' : 'llms.txt: unchanged');
