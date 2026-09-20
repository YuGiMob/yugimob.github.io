#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { problemsHeading } from '../assets/js/view-model.js';
import { colorDistance, contrastRatio, paletteFrom, rootPaletteSource, simulateDichromacy } from './contrast-lib.mjs';
import { buildHeroStatsBlock, buildIntroParagraphs, readHeroStatsBlock, readIntroParagraphs } from './site-html-lib.mjs';
import { scriptSrcHash } from './csp-lib.mjs';
import { SITE_REPOSITORY, SITE_URL } from './llms-lib.mjs';

const ROOT = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const TRUSTED_TYPES_SINKS = /innerHTML|outerHTML|insertAdjacentHTML|srcdoc|createContextualFragment|parseHTMLUnsafe|setHTMLUnsafe|parseFromString|document\.writ(?:e|eln)\(|\beval\(|new (?:Async)?(?:Generator)?Function\(|importScripts\(|execCommand\(\s*['"]insertHTML|set(?:Timeout|Interval)\(\s*['"`]|setAttribute\(\s*['"](?:on[a-z]+|srcdoc)['"]/;
const CSP_STYLE_SINKS = /setAttribute\(\s*['"]style['"]/;

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

function listFiles(directory, suffix) {
  try {
    return readdirSync(join(ROOT, directory)).filter((file) => file.endsWith(suffix));
  } catch (err) {
    fail(`${directory} unreadable: ${err.message}`);
    return [];
  }
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
  else {
    for (const directive of ["default-src 'self'", "base-uri 'none'", "form-action 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "manifest-src 'none'", "media-src 'none'", "require-trusted-types-for 'script'", "trusted-types 'none'"]) {
      if (!policy[1].includes(directive)) fail(`${page}: CSP is missing ${directive}`);
    }
  }
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

for (const file of listFiles('assets/js', '.js')) {
  const source = readText(`assets/js/${file}`);
  for (const match of source.matchAll(/(?:getElementById|setText|setHidden)\('([^']+)'/g)) referencedIds.add(match[1]);
  for (const match of source.matchAll(/querySelector\('#([^']+)'\)/g)) referencedIds.add(match[1]);
  const sink = source.match(TRUSTED_TYPES_SINKS);
  if (sink) fail(`assets/js/${file}: uses a DOM sink that Trusted Types forbids (${sink[0]})`);
  const styleSink = source.match(CSP_STYLE_SINKS);
  if (styleSink) fail(`assets/js/${file}: sets an inline style attribute, which the CSP forbids (${styleSink[0]})`);
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

function staticImportTargets(source) {
  const targets = [];
  for (const match of source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+'(\.[^']+)'/gm)) targets.push(match[1]);
  for (const match of source.matchAll(/^\s*import\s+'(\.[^']+)'/gm)) targets.push(match[1]);
  return targets;
}

function dynamicImportTargets(source) {
  return [...source.matchAll(/\bimport\s*\(\s*'(\.[^']+)'\s*\)/g)].map((match) => match[1]);
}

const preloaded = new Set([...indexSource.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((match) => match[1]));
const reach = new Map();
const queue = [['assets/js/main.js', true]];
while (queue.length > 0) {
  const [file, eager] = queue.shift();
  const previous = reach.get(file);
  if (previous === true || (previous === false && !eager)) continue;
  reach.set(file, eager);
  const source = readText(file);
  for (const target of staticImportTargets(source)) queue.push([posix.normalize(posix.join(posix.dirname(file), target)), eager]);
  for (const target of dynamicImportTargets(source)) queue.push([posix.normalize(posix.join(posix.dirname(file), target)), false]);
}

for (const [file, eager] of reach) {
  if (file === 'assets/js/main.js') continue;
  if (eager && !preloaded.has(file)) fail(`index.html: ${file} is statically imported but not preloaded`);
  if (!eager && preloaded.has(file)) fail(`index.html: ${file} is loaded on demand but preloaded`);
}
for (const file of preloaded) {
  if (!existsSync(join(ROOT, file))) fail(`index.html: preloaded file ${file} is missing`);
}

for (const file of listFiles('assets/js', '.js')) {
  if (!reach.has(`assets/js/${file}`)) fail(`assets/js/${file}: no module imports this file`);
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
      const listed = new Set([...list[1].matchAll(/github\.com\/[^/"']+\/([^"']+)"/g)].map((match) => match[1]));
      for (const name of listed) {
        if (!projectNames.has(name)) fail(`index.html: noscript link ${name} is not in site-data.json`);
      }
      for (const name of projectNames) {
        if (!listed.has(name)) fail(`index.html: the noscript list is missing ${name}`);
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
  const listed = new Set(filesBlock[1].split('\n').map((line) => line.trim().split(/\s+/)[0]).filter(Boolean));
  for (const path of listed) {
    if (!existsSync(join(ROOT, path))) fail(`README.md: listed path ${path} does not exist`);
  }
  for (const [directory, suffix] of [['assets/js', '.js'], ['scripts', '.mjs'], ['.github/workflows', '.yml'], ['.github', '.yml'], ['data', '.json']]) {
    for (const file of listFiles(directory, suffix)) {
      if (!listed.has(`${directory}/${file}`)) fail(`README.md: ${directory}/${file} is not listed in the Files block`);
    }
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
  ['accent-strong', 'paper'],
  ['evidence', 'paper'],
  ['evidence', 'card'],
  ['green', 'paper'],
  ['red', 'paper'],
  ['ink-2', 'card'],
  ['ink-3', 'card'],
  ['accent', 'card'],
  ['answer', 'card'],
  ['term-text', 'term-bg'],
  ['term-2', 'term-bg'],
  ['term-3', 'term-bg'],
  ['term-accent', 'term-bg'],
  ['term-green', 'term-bg'],
  ['term-red', 'term-bg'],
  ['term-accent-2', 'term-bg'],
];
for (const [scheme, palette] of [['light', lightPalette], ['dark', darkPalette]]) {
  for (const [foreground, background] of CONTRAST_PAIRS) {
    const ratio = contrastRatio(palette.get(foreground), palette.get(background));
    if (ratio === null) fail(`assets/css/style.css: cannot measure the ${scheme} ${foreground} on ${background} contrast`);
    else if (ratio < 4.5) fail(`assets/css/style.css: ${scheme} ${foreground} on ${background} is ${ratio.toFixed(2)}:1, below 4.5:1`);
  }
}

const CATEGORY_COLORS = ['answer', 'evidence', 'accent', 'red', 'green', 'term-accent', 'rule-strong'];
const MIN_CATEGORY_DISTANCE = 15;
const NON_TEXT_TOKENS = new Set(['paper-2', 'rule', 'term-bg-2', 'term-bg-3', 'term-rule']);
const measuredTokens = new Set([...CONTRAST_PAIRS.flat(), ...CATEGORY_COLORS]);
for (const token of new Set([...lightPalette.keys(), ...darkPalette.keys()])) {
  if (!measuredTokens.has(token) && !NON_TEXT_TOKENS.has(token)) {
    fail(`assets/css/style.css: the palette token --${token} is neither measured for contrast nor declared decorative`);
  }
}

const DICHROMACY_KINDS = ['protanopia', 'deuteranopia'];
for (const [scheme, palette] of [['light', lightPalette], ['dark', darkPalette]]) {
  for (const kind of [null, ...DICHROMACY_KINDS]) {
    for (let first = 0; first < CATEGORY_COLORS.length; first += 1) {
      for (let second = first + 1; second < CATEGORY_COLORS.length; second += 1) {
        const one = palette.get(CATEGORY_COLORS[first]);
        const two = palette.get(CATEGORY_COLORS[second]);
        const seen = kind === null ? one : simulateDichromacy(one, kind);
        const other = kind === null ? two : simulateDichromacy(two, kind);
        const distance = colorDistance(seen, other);
        const label = kind === null ? 'normal vision' : kind;
        if (distance === null) fail(`assets/css/style.css: cannot measure the ${scheme} ${CATEGORY_COLORS[first]} and ${CATEGORY_COLORS[second]} chart colors under ${label}`);
        else if (distance < MIN_CATEGORY_DISTANCE) fail(`assets/css/style.css: the ${scheme} ${CATEGORY_COLORS[first]} and ${CATEGORY_COLORS[second]} chart colors are ${distance.toFixed(1)} apart under ${label}; the minimum is ${MIN_CATEGORY_DISTANCE}`);
      }
    }
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

const markdown = readText('index.md');
if (!/^# \S/.test(markdown)) fail('index.md: missing an H1 title');
for (const project of siteData?.projects ?? []) {
  if (!markdown.includes(project.name)) fail(`index.md: missing project ${project.name}`);
}

if (siteData) {
  const heroBlock = readHeroStatsBlock(indexSource) ?? '';
  if (heroBlock !== buildHeroStatsBlock(siteData)) fail('index.html: the hero stat block does not match the machine data');
}

for (const [rel, target] of [['describedby', 'llms.txt'], ['describedby', 'agent-readability.json'], ['describedby', 'data/benchmark-matrix.json'], ['alternate', 'index.md'], ['alternate', 'feed.json']]) {
  const pattern = new RegExp(`<link[^>]*rel="${rel}"[^>]*href="${target.replace('.', '\\.')}"`);
  if (!pattern.test(indexSource)) fail(`index.html: missing the rel=${rel} link to ${target}`);
}

const readabilityText = readText('agent-readability.json');
let readability = null;
try {
  readability = JSON.parse(readabilityText);
} catch (err) {
  fail(`agent-readability.json unusable: ${err.message}`);
}
if (readability) {
  if (readability.site !== SITE_URL) fail('agent-readability.json: site is not the canonical URL');
  if (readability.repository !== SITE_REPOSITORY) fail('agent-readability.json: repository is not the site repository');
  if (readability.name !== siteData?.identity?.displayName) fail('agent-readability.json: name does not match the display name');
  if (readability.description !== siteData?.identity?.tagline) fail('agent-readability.json: description does not match the tagline');
  if (readability.language !== 'en') fail('agent-readability.json: language is not en');
  if (readability.license !== 'MIT') fail('agent-readability.json: license is not MIT');
  if (readability.updated !== (siteData?.activity?.fetchedAt ?? null)) fail('agent-readability.json: updated does not match the activity date');
  const artifacts = readability.artifacts && typeof readability.artifacts === 'object' ? Object.values(readability.artifacts) : [];
  for (const file of ['llms.txt', 'index.md', 'feed.json', 'data/site-data.json', 'data/showcase.json', 'data/benchmark-matrix.json', 'sitemap.xml']) {
    if (!artifacts.some((url) => typeof url === 'string' && url.endsWith(`/${file}`))) {
      fail(`agent-readability.json: does not list ${file}`);
    }
  }
  for (const url of artifacts) {
    if (typeof url !== 'string' || !url.startsWith(`${SITE_URL}/`)) {
      fail(`agent-readability.json: ${url} is not on the canonical site`);
      continue;
    }
    if (!existsSync(join(ROOT, url.slice(SITE_URL.length + 1)))) fail(`agent-readability.json: ${url} does not exist`);
  }
}

const feedText = readText('feed.json');
let feed = null;
try {
  feed = JSON.parse(feedText);
} catch (err) {
  fail(`feed.json unusable: ${err.message}`);
}
if (feed) {
  if (feed.version !== 'https://jsonfeed.org/version/1.1') fail('feed.json: version is not JSON Feed 1.1');
  if (feed.home_page_url !== `${SITE_URL}/`) fail('feed.json: home_page_url is not the canonical site');
  if (feed.feed_url !== `${SITE_URL}/feed.json`) fail('feed.json: feed_url is not the canonical feed');
  if (feed.title !== siteData?.identity?.displayName) fail('feed.json: title does not match the display name');
  if (feed.description !== siteData?.identity?.tagline) fail('feed.json: description does not match the tagline');
  if (!Array.isArray(feed.items) || feed.items.length === 0) fail('feed.json: has no items');
  else {
    const ids = new Set();
    for (const item of feed.items) {
      if (!item || typeof item.id !== 'string' || typeof item.url !== 'string' || typeof item.content_text !== 'string') {
        fail('feed.json: an item is missing id, url, or content_text');
        continue;
      }
      if (ids.has(item.id)) fail(`feed.json: duplicated item id ${item.id}`);
      ids.add(item.id);
    }
  }
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

if (showcase) {
  const introBlock = readIntroParagraphs(indexSource) ?? '';
  if (introBlock !== buildIntroParagraphs(showcase)) fail('index.html: the intro paragraphs do not match the showcase');
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
  if (!structuredData) {
    fail('index.html: missing the inline JSON-LD block');
  } else {
    let jsonLd = null;
    try {
      jsonLd = JSON.parse(structuredData[1]);
    } catch (err) {
      fail(`index.html: the inline JSON-LD is unparsable: ${err.message}`);
    }
    const person = jsonLd && typeof jsonLd === 'object' ? jsonLd.mainEntity : null;
    if (jsonLd && (jsonLd['@type'] !== 'ProfilePage' || !person || person['@type'] !== 'Person')) {
      fail('index.html: the inline JSON-LD is not a ProfilePage with a Person main entity');
    } else if (person) {
      const canonicalUrl = indexSource.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? `${SITE_URL}/`;
      let avatarUrl = null;
      try {
        avatarUrl = new URL(identity.avatarUrl, canonicalUrl).href;
      } catch {}
      if (person.name !== identity.displayName) fail('index.html: the JSON-LD name does not match identity.displayName');
      if (person.description !== tagline) fail('index.html: the JSON-LD description does not match identity.tagline');
      if (person.url !== canonicalUrl) fail('index.html: the JSON-LD url does not match the canonical URL');
      if (avatarUrl && person.image !== avatarUrl) fail('index.html: the JSON-LD image does not match identity.avatarUrl');
      if (identity.links?.github && !(Array.isArray(person.sameAs) && person.sameAs.includes(identity.links.github))) {
        fail('index.html: the JSON-LD sameAs does not include identity.links.github');
      }
    }
  }
}

const robots = readText('robots.txt');
if (!/^User-agent: \S+/m.test(robots)) fail('robots.txt: missing a User-agent line');
if (!/^Sitemap: \S+$/m.test(robots)) fail('robots.txt: missing a Sitemap line');
const contentSignal = robots.match(/^Content-Signal: (.+)$/m)?.[1] ?? '';
if (!contentSignal) fail('robots.txt: missing a Content-Signal line');
else {
  for (const signal of ['search=', 'ai-input=', 'ai-train=']) {
    if (!contentSignal.includes(signal)) fail(`robots.txt: the Content-Signal line is missing ${signal}`);
  }
}
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

const scriptFiles = listFiles('assets/js', '.js').map((file) => `assets/js/${file}`);
const fontFiles = listFiles('assets/fonts', '.woff2').map((file) => `assets/fonts/${file}`);
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
