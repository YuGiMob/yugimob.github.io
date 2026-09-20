#!/usr/bin/env node
import { createHash } from 'node:crypto';
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

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('base64');
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
  for (const match of source.matchAll(/<script\b[^>]*src="(https?:\/\/[^"]+)"/g)) {
    fail(`${page}: third-party script ${match[1]}`);
  }
  for (const match of source.matchAll(/<link\b[^>]*>/g)) {
    const tag = match[0];
    const rel = tag.match(/rel="([^"]+)"/)?.[1] ?? '';
    const as = tag.match(/as="([^"]+)"/)?.[1] ?? '';
    const href = tag.match(/href="(https?:\/\/[^"]+)"/)?.[1];
    if (!href) continue;
    if (rel === 'stylesheet' || rel === 'modulepreload' || (rel === 'preload' && as !== 'image')) {
      fail(`${page}: third-party ${rel || as} asset ${href}`);
    }
  }
  const policy = source.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  if (!policy) fail(`${page}: missing the Content-Security-Policy meta tag`);
  else if (!policy[1].includes("default-src 'self'")) fail(`${page}: CSP does not default to 'self'`);
}

const indexSource = html.get('index.html') || '';
const indexIds = new Set([...indexSource.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
const referencedIds = new Set();

for (const file of readdirSync(join(ROOT, 'assets', 'js'))) {
  if (!file.endsWith('.js')) continue;
  const source = readText(`assets/js/${file}`);
  for (const match of source.matchAll(/(?:getElementById|setText|setHidden)\('([^']+)'/g)) referencedIds.add(match[1]);
}
for (const id of referencedIds) {
  if (!indexIds.has(id)) fail(`index.html: missing #${id} referenced by scripts`);
}

const structuredData = indexSource.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
const policy = indexSource.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
if (structuredData && policy) {
  const declared = policy[1].match(/'sha256-([A-Za-z0-9+/=]+)'/);
  const actual = sha256(structuredData[1]);
  if (!declared) fail('index.html: the CSP has no sha256 hash for the inline JSON-LD block');
  else if (declared[1] !== actual) fail(`index.html: the CSP hash for the inline JSON-LD block is stale, expected 'sha256-${actual}'`);
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

const fetched = new Set([...indexSource.matchAll(/<link rel="preload" as="fetch" href="([^"]+)"/g)].map((match) => match[1]));
for (const file of ['data/site-data.json', 'data/showcase.json']) {
  if (!fetched.has(file)) fail(`index.html: ${file} is fetched at runtime but not preloaded`);
}

const siteDataPath = join(ROOT, 'data', 'site-data.json');
if (existsSync(siteDataPath)) {
  let siteData = null;
  try {
    siteData = JSON.parse(readFileSync(siteDataPath, 'utf8'));
  } catch (err) {
    fail(`site-data.json unusable for the noscript check: ${err.message}`);
  }
  if (siteData) {
    const projectNames = new Set(siteData.projects.map((project) => project.name));
    const list = indexSource.match(/<ul class="noscript-list">([\s\S]*?)<\/ul>/);
    if (list) {
      for (const match of list[1].matchAll(/github\.com\/[^/"']+\/([^"']+)"/g)) {
        if (!projectNames.has(match[1])) fail(`index.html: noscript link ${match[1]} is not in site-data.json`);
      }
    }
    const avatarUrl = siteData.identity && siteData.identity.avatarUrl;
    if (policy && typeof avatarUrl === 'string') {
      try {
        const origin = new URL(avatarUrl).origin;
        const imgSrc = policy[1].match(/img-src ([^;]+)/)?.[1] ?? '';
        if (!imgSrc.includes(origin)) fail(`index.html: the CSP img-src does not allow the avatar origin ${origin}`);
      } catch {
        fail('site-data.json: identity.avatarUrl is not a URL');
      }
    }
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
