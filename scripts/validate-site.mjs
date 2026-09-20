#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function fail(message) {
  errors.push(message);
}

function readText(relativePath) {
  try {
    return readFileSync(join(ROOT, relativePath), 'utf8');
  } catch (err) {
    fail(`${relativePath} unreadable: ${err.message}`);
    return '';
  }
}

function localTarget(value) {
  if (!value) return null;
  if (/^(?:[a-z]+:)?\/\//i.test(value)) return null;
  if (value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('#')) return null;
  const clean = value.split('#')[0].split('?')[0];
  if (!clean || clean === '/') return null;
  return clean.replace(/^\//, '');
}

const pages = ['index.html', '404.html'];
const html = new Map();
for (const page of pages) html.set(page, readText(page));

for (const [page, source] of html) {
  const ids = new Set();
  for (const match of source.matchAll(/\sid="([^"]+)"/g)) {
    if (ids.has(match[1])) fail(`${page}: duplicate id ${match[1]}`);
    ids.add(match[1]);
  }
  for (const match of source.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(match[1])) fail(`${page}: missing fragment target #${match[1]}`);
  }
  for (const match of source.matchAll(/data-nav="([^"]+)"/g)) {
    if (!ids.has(match[1])) fail(`${page}: missing nav target ${match[1]}`);
  }
  for (const match of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = localTarget(match[1]);
    if (target && !existsSync(join(ROOT, target))) fail(`${page}: missing local file ${match[1]}`);
  }
}

const indexSource = html.get('index.html') || '';
const indexIds = new Set([...indexSource.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
const referencedIds = new Set();

for (const file of readdirSync(join(ROOT, 'assets', 'js'))) {
  if (!file.endsWith('.js')) continue;
  const source = readText(`assets/js/${file}`);
  for (const match of source.matchAll(/getElementById\('([^']+)'\)/g)) referencedIds.add(match[1]);
  for (const match of source.matchAll(/setText\('([^']+)'/g)) referencedIds.add(match[1]);
  for (const match of source.matchAll(/setHidden\('([^']+)'/g)) referencedIds.add(match[1]);
}
for (const id of referencedIds) {
  if (!indexIds.has(id)) fail(`index.html: missing #${id} referenced by scripts`);
}

function importTargets(source) {
  const targets = [];
  let pending = false;
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (/^import\b/.test(trimmed)) pending = true;
    if (!pending) continue;
    const match = trimmed.match(/from '(\.\S+)'/);
    if (match) {
      targets.push(match[1]);
      pending = false;
    } else if (trimmed.endsWith(';')) {
      pending = false;
    }
  }
  return targets;
}

const preloaded = new Set([...indexSource.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((match) => match[1]));
const seen = new Set();
const queue = ['assets/js/main.js'];
while (queue.length > 0) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  if (file !== 'assets/js/main.js' && !preloaded.has(file)) fail(`index.html: ${file} is not preloaded`);
  for (const target of importTargets(readText(file))) {
    queue.push(posix.normalize(posix.join(posix.dirname(file), target)));
  }
}
for (const file of preloaded) {
  if (!existsSync(join(ROOT, file))) fail(`index.html: preloaded file ${file} is missing`);
}
const siteDataPath = join(ROOT, 'data', 'site-data.json');
if (existsSync(siteDataPath)) {
  try {
    const projectNames = new Set(JSON.parse(readFileSync(siteDataPath, 'utf8')).projects.map((project) => project.name));
    const list = indexSource.match(/<ul class="noscript-list">([\s\S]*?)<\/ul>/);
    if (list) {
      for (const match of list[1].matchAll(/github\.com\/[^/"']+\/([^"']+)"/g)) {
        if (!projectNames.has(match[1])) fail(`index.html: noscript link ${match[1]} is not in site-data.json`);
      }
    }
  } catch (err) {
    fail(`site-data.json unusable for the noscript check: ${err.message}`);
  }
}
const readme = readText('README.md');
const filesBlock = readme.match(/## Files\s+```\n([\s\S]*?)```/);
if (!filesBlock) {
  fail('README.md: missing the Files listing');
} else {
  for (const line of filesBlock[1].split('\n')) {
    const listed = line.trim().split(/\s+/)[0];
    if (!listed) continue;
    if (!existsSync(join(ROOT, listed))) fail(`README.md: listed path ${listed} does not exist`);
  }
}

const stylesheet = readText('assets/css/style.css');
for (const match of stylesheet.matchAll(/url\('([^']+)'\)/g)) {
  const target = localTarget(match[1]);
  if (target && !existsSync(join(ROOT, 'assets', 'css', target))) fail(`assets/css/style.css: missing file ${match[1]}`);
}

if (errors.length > 0) {
  for (const message of errors) console.error(`validate:site: ${message}`);
  process.exit(1);
}
console.log('validate:site: ok');
