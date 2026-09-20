#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { problemsHeading } from '../assets/js/view-model.js';
import { contrastRatio, paletteFrom, rootPaletteSource } from './contrast-lib.mjs';
import { scriptSrcHash } from './csp-lib.mjs';

const ROOT = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const TRUSTED_TYPES_SINKS = /innerHTML|outerHTML|insertAdjacentHTML|srcdoc|createContextualFragment|parseHTMLUnsafe|setHTMLUnsafe|parseFromString|document\.writ(?:e|eln)\(|\beval\(|new (?:Async)?(?:Generator)?Function\(|importScripts\(|execCommand\(\s*['"]insertHTML|set(?:Timeout|Interval)\(\s*['"`]|setAttribute\(\s*['"](?:on[a-z]+|srcdoc)['"]/;

function scriptSink(source) {
  const target = source.match(/(?:const|let|var)\s+(\w+)\s*=\s*document\.getElementById\(\s*['"]structured-data['"]\s*\)/);
  if (target) {
    const assignment = source.match(new RegExp(`\\b${target[1]}\\s*\\.\\s*(?:textContent|innerText|text)\\s*=`));
    if (assignment) return assignment[0].replace(/\s*=\s*$/, '');
  }
  const named = source.match(/\bscript\w*\s*\.\s*(?:src|textContent|innerText|text)\s*=/i);
  if (named) return named[0].replace(/\s*=\s*$/, '');
  const created = source.match(/(?:\bcreateElement|\bel)\(\s*['"]script['"]\s*\)/);
  return created ? created[0] : null;
}

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
  else if (!policy[1].includes("require-trusted-types-for 'script'")) fail(`${page}: CSP does not require Trusted Types for scripts`);
  if (!/<html[^>]*\slang="[^"]+"/.test(source)) fail(`${page}: <html> is missing a lang attribute`);
  for (const match of source.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="[^"]*"/.test(match[0])) fail(`${page}: <img> is missing an alt attribute`);
  }
  for (const match of source.matchAll(/<[a-z][^>]*\sstyle="/gi)) fail(`${page}: ${match[0]} uses an inline style, which the CSP forbids`);
  for (const match of source.matchAll(/<[a-z][^>]*\son[a-z]+="/gi)) fail(`${page}: ${match[0]} uses an inline event handler, which the CSP forbids`);
  for (const match of source.matchAll(/aria-(?:labelledby|describedby|controls)="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) {
      if (!ids.has(id)) fail(`${page}: aria reference to missing id ${id}`);
    }
  }
  for (const match of source.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(match[0])) fail(`${page}: a target="_blank" link has no rel=noopener`);
  }
  const headings = [...source.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index] > headings[index - 1] + 1) fail(`${page}: heading level jumps from h${headings[index - 1]} to h${headings[index]}`);
  }
  if (headings.length > 0 && headings[0] !== 1) fail(`${page}: the first heading is h${headings[0]}, not h1`);
  if ([...source.matchAll(/<main\b/g)].length !== 1) fail(`${page}: expected exactly one <main>`);
}

const indexSource = html.get('index.html') || '';
const indexIds = new Set([...indexSource.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
const referencedIds = new Set();

for (const file of readdirSync(join(ROOT, 'assets', 'js'))) {
  if (!file.endsWith('.js')) continue;
  const source = readText(`assets/js/${file}`);
  for (const match of source.matchAll(/(?:getElementById|setText|setHidden)\('([^']+)'/g)) referencedIds.add(match[1]);
  for (const match of source.matchAll(/querySelector\('#([^']+)'\)/g)) referencedIds.add(match[1]);
  const sink = source.match(TRUSTED_TYPES_SINKS);
  if (sink) fail(`assets/js/${file}: uses a DOM sink that Trusted Types forbids (${sink[0]})`);
  const scriptSinkName = scriptSink(source);
  if (scriptSinkName) fail(`assets/js/${file}: uses a DOM sink that Trusted Types forbids (${scriptSinkName})`);
}
for (const id of referencedIds) {
  if (!indexIds.has(id)) fail(`index.html: missing #${id} referenced by scripts`);
}

const structuredData = indexSource.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
const policy = indexSource.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
if (structuredData && policy) {
  const declared = scriptSrcHash(policy[1]);
  const actual = sha256(structuredData[1]);
  if (!declared) fail('index.html: the CSP has no sha256 hash for the inline JSON-LD block');
  else if (declared !== actual) fail(`index.html: the CSP hash for the inline JSON-LD block is stale, expected 'sha256-${actual}'`);
}

function importTargets(source) {
  const targets = [];
  for (const match of source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+'(\.[^']+)'/gm)) targets.push(match[1]);
  for (const match of source.matchAll(/^\s*import\s+'(\.[^']+)'/gm)) targets.push(match[1]);
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
let siteData = null;
if (existsSync(siteDataPath)) {
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
      const imgSrc = policy[1].match(/img-src ([^;]+)/)?.[1] ?? '';
      if (/^https?:\/\//.test(avatarUrl)) {
        try {
          const origin = new URL(avatarUrl).origin;
          if (!imgSrc.includes(origin)) fail(`index.html: the CSP img-src does not allow the avatar origin ${origin}`);
        } catch {
          fail('site-data.json: identity.avatarUrl is not a URL');
        }
      } else if (!imgSrc.includes("'self'")) {
        fail('index.html: the CSP img-src does not allow a local avatar');
      } else if (!existsSync(join(ROOT, avatarUrl))) {
        fail(`site-data.json: identity.avatarUrl points at a missing file ${avatarUrl}`);
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

const darkStart = stylesheet.indexOf('@media (prefers-color-scheme: dark)');
const reducedStart = stylesheet.indexOf('@media (prefers-reduced-motion', darkStart);
const lightPalette = paletteFrom(rootPaletteSource(stylesheet));
const darkSource = darkStart === -1 ? '' : rootPaletteSource(stylesheet.slice(darkStart, reducedStart === -1 ? undefined : reducedStart));
const darkPalette = new Map([...lightPalette, ...paletteFrom(darkSource)]);
const CONTRAST_PAIRS = [
  ['ink', 'paper'],
  ['ink-2', 'paper'],
  ['ink-3', 'paper'],
  ['ink', 'card'],
  ['accent', 'paper'],
  ['answer', 'paper'],
];
for (const [scheme, palette] of [['light', lightPalette], ['dark', darkPalette]]) {
  for (const [foreground, background] of CONTRAST_PAIRS) {
    const ratio = contrastRatio(palette.get(foreground), palette.get(background));
    if (ratio === null) fail(`assets/css/style.css: cannot measure the ${scheme} ${foreground} on ${background} contrast`);
    else if (ratio < 4.5) fail(`assets/css/style.css: ${scheme} ${foreground} on ${background} is ${ratio.toFixed(2)}:1, below 4.5:1`);
  }
}

for (const [page, source] of html) {
  const titleLength = (source.match(/<title>([^<]*)<\/title>/)?.[1] ?? '').length;
  if (titleLength < 5 || titleLength > 70) fail(`${page}: the title length ${titleLength} is outside 5-70`);
  const descriptionLength = (source.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '').length;
  if (descriptionLength < 50 || descriptionLength > 200) fail(`${page}: the meta description length ${descriptionLength} is outside 50-200`);
}
const pageTitle = indexSource.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
if (siteData && typeof siteData.identity?.displayName === 'string' && !pageTitle.includes(siteData.identity.displayName)) {
  fail('index.html: the title does not contain the display name');
}
const navIds = [...indexSource.matchAll(/data-nav="([^"]+)"/g)].map((match) => match[1]);
const navPositions = navIds.map((id) => indexSource.indexOf(`id="${id}"`));
if (navPositions.some((position, index) => position < 0 || (index > 0 && position < navPositions[index - 1]))) {
  fail('index.html: the nav order does not match the section order');
}
const sitemap = readText('sitemap.xml');
const lastmod = sitemap.match(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/)?.[1];
if (!lastmod) {
  fail('sitemap.xml: missing a lastmod date');
} else {
  if (lastmod > new Date().toISOString().slice(0, 10)) fail(`sitemap.xml: lastmod ${lastmod} is in the future`);
  const history = Array.isArray(siteData?.history) ? siteData.history : [];
  const newest = typeof history[history.length - 1]?.date === 'string' ? history[history.length - 1].date : null;
  if (newest && lastmod !== newest) fail(`sitemap.xml: lastmod ${lastmod} does not match the newest history date ${newest}`);
}

const llms = readText('llms.txt');
if (!/^# \S/.test(llms)) fail('llms.txt: missing an H1 title');
for (const project of siteData?.projects ?? []) {
  if (!llms.includes(project.name)) fail(`llms.txt: missing project ${project.name}`);
}

const showcasePath = join(ROOT, 'data', 'showcase.json');
let showcase = null;
if (existsSync(showcasePath)) {
  try {
    showcase = JSON.parse(readFileSync(showcasePath, 'utf8'));
  } catch (err) {
    fail(`showcase.json unusable for the drift check: ${err.message}`);
  }
}

function elementText(source, id) {
  return source.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`))?.[1] ?? null;
}

if (siteData) {
  const identity = siteData.identity ?? {};
  const tagline = typeof identity.tagline === 'string' ? identity.tagline : '';
  if (tagline.length < 50 || tagline.length > 200) {
    fail(`site-data.json: identity.tagline length ${tagline.length} is outside 50-200`);
  }
  const expectedTitle = `${identity.displayName} · ${identity.classTitle}`;
  if (pageTitle !== expectedTitle) fail(`index.html: the title should read "${expectedTitle}"`);
  const staticDescription = indexSource.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  if (staticDescription !== tagline) fail('index.html: the meta description does not match identity.tagline');
  const ogTitle = indexSource.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? '';
  const twitterTitle = indexSource.match(/<meta name="twitter:title" content="([^"]*)"/)?.[1] ?? '';
  if (ogTitle !== expectedTitle || twitterTitle !== expectedTitle) {
    fail('index.html: the social titles do not match displayName · classTitle');
  }
  const ogDescription = indexSource.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ?? '';
  const twitterDescription = indexSource.match(/<meta name="twitter:description" content="([^"]*)"/)?.[1] ?? '';
  if (ogDescription !== tagline || twitterDescription !== tagline) {
    fail('index.html: the social descriptions do not match identity.tagline');
  }
  if (elementText(indexSource, 'display-name') !== identity.displayName) {
    fail('index.html: #display-name does not match identity.displayName');
  }
  if (elementText(indexSource, 'class-title') !== identity.classTitle) {
    fail('index.html: #class-title does not match identity.classTitle');
  }
  if (elementText(indexSource, 'intro-headline') !== showcase?.intro?.headline) {
    fail('index.html: #intro-headline does not match the showcase headline');
  }
  if (showcase && Array.isArray(showcase.problems) && Array.isArray(siteData.projects)) {
    const projects = new Map(siteData.projects.map((project) => [project.name, project]));
    const expectedHeading = problemsHeading(showcase, projects);
    if (elementText(indexSource, 'problems-heading') !== expectedHeading) {
      fail(`index.html: #problems-heading should read "${expectedHeading}"`);
    }
    const showcased = new Set([...showcase.problems.map((problem) => problem?.name), showcase.evidence?.name].filter(Boolean));
    for (const project of siteData.projects) {
      if (!showcased.has(project.name)) fail(`data/showcase.json: no entry for the manifest project ${project.name}`);
    }
  }
}

const robots = readText('robots.txt');
if (!/^User-agent: \S+/m.test(robots)) fail('robots.txt: missing a User-agent line');
if (!/^Sitemap: \S+$/m.test(robots)) fail('robots.txt: missing a Sitemap line');
const sitemapLoc = sitemap.match(/<loc>([^<]+)<\/loc>/)?.[1];
const canonical = indexSource.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
if (!sitemapLoc) fail('sitemap.xml: missing a loc entry');
else if (canonical !== sitemapLoc) fail(`sitemap.xml: loc ${sitemapLoc} does not match the canonical ${canonical}`);
const robotsSitemap = robots.match(/^Sitemap: (\S+)$/m)?.[1];
if (robotsSitemap && canonical) {
  try {
    if (new URL(robotsSitemap).origin !== new URL(canonical).origin) {
      fail(`robots.txt: Sitemap ${robotsSitemap} is not on the canonical origin`);
    }
  } catch {
    fail(`robots.txt: Sitemap ${robotsSitemap} is not a URL`);
  }
}

const security = readText('.well-known/security.txt');
if (!/^Contact: \S+/m.test(security)) fail('.well-known/security.txt: missing a Contact line');
if (!/^Policy: \S+/m.test(security)) fail('.well-known/security.txt: missing a Policy line');
const expires = security.match(/^Expires: (\S+)$/m)?.[1];
const expiry = Date.parse(expires ?? '');
if (!Number.isFinite(expiry)) fail('.well-known/security.txt: missing or unparsable Expires');
else if (expiry - Date.now() < 60 * 86400000) fail('.well-known/security.txt: Expires is less than 60 days away');

function fileSize(relativePath) {
  try {
    return statSync(join(ROOT, relativePath)).size;
  } catch {
    return 0;
  }
}

const scriptFiles = readdirSync(join(ROOT, 'assets', 'js')).filter((file) => file.endsWith('.js')).map((file) => `assets/js/${file}`);
const fontFiles = readdirSync(join(ROOT, 'assets', 'fonts')).filter((file) => file.endsWith('.woff2')).map((file) => `assets/fonts/${file}`);
const budgets = [
  { label: 'scripts and styles', limit: 160 * 1024, files: [...scriptFiles, 'assets/css/style.css'] },
  { label: 'fonts', limit: 400 * 1024, files: fontFiles },
  { label: 'images', limit: 150 * 1024, files: ['assets/avatar.png', 'assets/og.jpg', 'assets/apple-touch-icon.png', 'favicon.ico'] },
];
let totalWeight = 0;
for (const budget of budgets) {
  const weight = budget.files.reduce((sum, file) => sum + fileSize(file), 0);
  totalWeight += weight;
  if (weight > budget.limit) fail(`${budget.label} weigh ${weight} bytes; the budget is ${budget.limit}`);
}
if (totalWeight > 800 * 1024) fail(`all assets weigh ${totalWeight} bytes; the budget is ${800 * 1024}`);

function imageSize(relativePath) {
  let bytes;
  try {
    bytes = readFileSync(join(ROOT, relativePath));
  } catch {
    return null;
  }
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes.toString('latin1', 1, 4) === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
  }
  return null;
}

const ogImage = imageSize('assets/og.jpg');
const declaredWidth = Number(indexSource.match(/property="og:image:width" content="(\d+)"/)?.[1] ?? NaN);
const declaredHeight = Number(indexSource.match(/property="og:image:height" content="(\d+)"/)?.[1] ?? NaN);
if (!ogImage) fail('assets/og.jpg: could not read the JPEG dimensions');
else if (ogImage.width !== declaredWidth || ogImage.height !== declaredHeight) {
  fail(`assets/og.jpg is ${ogImage.width}×${ogImage.height} but the page declares ${declaredWidth}×${declaredHeight}`);
}
const touchIcon = imageSize('assets/apple-touch-icon.png');
if (!touchIcon) fail('assets/apple-touch-icon.png: could not read the PNG dimensions');
else if (touchIcon.width !== 180 || touchIcon.height !== 180) {
  fail(`assets/apple-touch-icon.png is ${touchIcon.width}×${touchIcon.height}, not 180×180`);
}

if (errors.length > 0) {
  for (const message of errors) console.error(`validate:site: ${message}`);
  process.exit(1);
}
console.log('validate:site: ok');
