#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = join(ROOT, 'data', 'site-data.json');
const schemaPath = join(ROOT, 'data', 'site-data.schema.json');
const showcasePath = join(ROOT, 'data', 'showcase.json');
const showcaseSchemaPath = join(ROOT, 'data', 'showcase.schema.json');
function fail(message) {
  console.error(`validate: ${message}`);
  process.exit(1);
}
function isUri(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function hasOnly(obj, allowed) {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) fail(`unexpected key ${key}`);
}
function needObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} invalid`);
}
function needString(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} invalid`);
}
function needUri(value, label) {
  if (typeof value !== 'string' || !isUri(value)) fail(`${label} invalid`);
}
function needInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) fail(`${label} invalid`);
}
function needNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) fail(`${label} invalid`);
}
function needBoolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} invalid`);
}
function needStringOrNull(value, label) {
  if (value !== null && typeof value !== 'string') fail(`${label} invalid`);
}
function checkIntegers(obj, keys, prefix) {
  for (const k of keys) needInteger(obj[k], `${prefix}${k}`);
}
function checkBooleans(obj, keys, prefix) {
  for (const k of keys) needBoolean(obj[k], `${prefix}${k}`);
}
let data;
try {
  data = JSON.parse(readFileSync(dataPath, 'utf8'));
} catch (err) {
  fail(`data/site-data.json unparsable: ${err.message}`);
}
try {
  JSON.parse(readFileSync(schemaPath, 'utf8'));
} catch (err) {
  fail(`data/site-data.schema.json unparsable: ${err.message}`);
}
const topAllowed = ['identity', 'about', 'projects', 'stats', 'activity', 'sections', 'history'];
const topRequired = ['identity', 'about', 'projects', 'stats', 'activity', 'sections'];
hasOnly(data, topAllowed);
for (const key of topRequired) if (!(key in data)) fail(`missing ${key}`);
needObject(data.identity, 'identity');
hasOnly(data.identity, ['displayName', 'classTitle', 'tagline', 'avatarUrl', 'links']);
for (const k of ['displayName', 'classTitle', 'tagline']) needString(data.identity[k], `identity.${k}`);
needUri(data.identity.avatarUrl, 'identity.avatarUrl');
needObject(data.identity.links, 'identity.links');
hasOnly(data.identity.links, ['github', 'email']);
needUri(data.identity.links.github, 'identity.links.github');
if (data.identity.links.email !== null) {
  if (typeof data.identity.links.email !== 'string' || !isEmail(data.identity.links.email)) fail('identity.links.email invalid');
}
needObject(data.about, 'about');
hasOnly(data.about, ['paragraphs']);
if (!Array.isArray(data.about.paragraphs) || data.about.paragraphs.length === 0) fail('about.paragraphs invalid');
for (const p of data.about.paragraphs) needString(p, 'about paragraph');
if (!Array.isArray(data.projects) || data.projects.length === 0) fail('projects invalid');
const projectAllowed = ['name', 'description', 'language', 'stars', 'forks', 'url', 'npm', 'license', 'npmWeeklyDownloads', 'pushedAt'];
for (const proj of data.projects) {
  needObject(proj, 'project');
  hasOnly(proj, projectAllowed);
  for (const k of ['name', 'url', 'pushedAt']) needString(proj[k], `project ${proj.name || '?'} ${k}`);
  needUri(proj.url, `project ${proj.name} url`);
  checkIntegers(proj, ['stars', 'forks'], `project ${proj.name} `);
  needStringOrNull(proj.description, `project ${proj.name} description`);
  needStringOrNull(proj.language, `project ${proj.name} language`);
  needStringOrNull(proj.npm, `project ${proj.name} npm`);
  needStringOrNull(proj.license, `project ${proj.name} license`);
  if ('npmWeeklyDownloads' in proj) needInteger(proj.npmWeeklyDownloads, `project ${proj.name} npmWeeklyDownloads`);
  const d = new Date(proj.pushedAt);
  if (Number.isNaN(d.getTime())) fail(`project ${proj.name} pushedAt invalid`);
}
needObject(data.stats, 'stats');
hasOnly(data.stats, ['totalStars', 'npmPackages', 'publicRepos', 'starsGiven', 'forksReceived', 'accountYears']);
checkIntegers(data.stats, ['totalStars', 'npmPackages', 'publicRepos', 'starsGiven', 'forksReceived', 'accountYears'], 'stats.');
needObject(data.activity, 'activity');
hasOnly(data.activity, ['window', 'pushes', 'highlights', 'fetchedAt', 'daily']);
needString(data.activity.window, 'activity.window');
needInteger(data.activity.pushes, 'activity.pushes');
if (!Array.isArray(data.activity.highlights)) fail('activity.highlights invalid');
for (const h of data.activity.highlights) needString(h, 'activity highlight');
needString(data.activity.fetchedAt, 'activity.fetchedAt');
if ('daily' in data.activity) {
  if (!Array.isArray(data.activity.daily)) fail('activity.daily invalid');
  for (const entry of data.activity.daily) {
    needObject(entry, 'activity.daily entry');
    hasOnly(entry, ['date', 'events', 'pushes']);
    needString(entry.date, 'activity.daily date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) fail('activity.daily date invalid');
    checkIntegers(entry, ['events', 'pushes'], 'activity.daily ');
  }
}
needObject(data.sections, 'sections');
hasOnly(data.sections, ['showBackground', 'showArtifacts', 'showQuestLog', 'showAbilityScores', 'showCampfire']);
checkBooleans(data.sections, ['showBackground', 'showArtifacts', 'showQuestLog', 'showAbilityScores', 'showCampfire'], 'sections.');
if ('history' in data) {
  if (!Array.isArray(data.history)) fail('history invalid');
  for (const entry of data.history) {
    needObject(entry, 'history entry');
    hasOnly(entry, ['date', 'totalStars', 'totalDownloads', 'pushes']);
    needString(entry.date, 'history date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) fail('history date invalid');
    checkIntegers(entry, ['totalStars', 'totalDownloads', 'pushes'], 'history ');
  }
}
let showcase;
try {
  showcase = JSON.parse(readFileSync(showcasePath, 'utf8'));
} catch (err) {
  fail(`data/showcase.json unparsable: ${err.message}`);
}
try {
  JSON.parse(readFileSync(showcaseSchemaPath, 'utf8'));
} catch (err) {
  fail(`data/showcase.schema.json unparsable: ${err.message}`);
}
const showcaseKeys = ['featured', 'projects', 'benchmark', 'principles', 'about', 'lab'];
hasOnly(showcase, showcaseKeys);
for (const key of showcaseKeys) if (!(key in showcase)) fail(`showcase missing ${key}`);
const featured = showcase.featured;
needObject(featured, 'showcase.featured');
hasOnly(featured, ['name', 'kicker', 'headline', 'summary', 'points', 'demo']);
for (const key of ['name', 'kicker', 'headline', 'demo']) needString(featured[key], `showcase.featured.${key}`);
if (!Array.isArray(featured.summary) || featured.summary.length === 0) fail('showcase.featured.summary invalid');
for (const paragraph of featured.summary) needString(paragraph, 'showcase featured summary');
if (!Array.isArray(featured.points) || featured.points.length === 0) fail('showcase.featured.points invalid');
for (const point of featured.points) {
  needObject(point, 'showcase point');
  hasOnly(point, ['title', 'body']);
  needString(point.title, 'showcase point title');
  needString(point.body, 'showcase point body');
}
const projectNames = new Set(data.projects.map((project) => project.name));
if (!projectNames.has(featured.name)) fail(`showcase featured project missing from site-data: ${featured.name}`);
if (!Array.isArray(showcase.projects) || showcase.projects.length === 0) fail('showcase.projects invalid');
const showcaseNames = new Set();
for (const item of showcase.projects) {
  needObject(item, 'showcase project');
  hasOnly(item, ['name', 'kicker', 'tagline', 'highlights', 'demo', 'size']);
  for (const key of ['name', 'kicker', 'tagline', 'size']) needString(item[key], `showcase project ${item.name || '?'} ${key}`);
  if (!projectNames.has(item.name)) fail(`showcase project missing from site-data: ${item.name}`);
  if (item.name === featured.name) fail(`showcase project duplicates featured: ${item.name}`);
  if (showcaseNames.has(item.name)) fail(`showcase project duplicated: ${item.name}`);
  showcaseNames.add(item.name);
  if (!Array.isArray(item.highlights) || item.highlights.length === 0) fail(`showcase project ${item.name} highlights invalid`);
  for (const highlight of item.highlights) needString(highlight, `showcase project ${item.name} highlight`);
  if (item.size !== 'large' && item.size !== 'small') fail(`showcase project ${item.name} size invalid`);
  if ('demo' in item) needString(item.demo, `showcase project ${item.name} demo`);
}
const bench = showcase.benchmark;
needObject(bench, 'showcase.benchmark');
hasOnly(bench, ['source', 'generatedAt', 'models', 'scenarios', 'contenderCount', 'runsPerContender', 'contenders']);
needUri(bench.source, 'showcase.benchmark.source');
needString(bench.generatedAt, 'showcase.benchmark.generatedAt');
checkIntegers(bench, ['models', 'scenarios', 'contenderCount', 'runsPerContender'], 'showcase.benchmark.');
if (!Array.isArray(bench.contenders) || bench.contenders.length === 0) fail('showcase.benchmark.contenders invalid');
for (const contender of bench.contenders) {
  needObject(contender, 'benchmark contender');
  hasOnly(contender, ['label', 'overall', 'safety', 'errors', 'highlight']);
  needString(contender.label, 'benchmark contender label');
  needNumber(contender.overall, `benchmark contender ${contender.label} overall`);
  needNumber(contender.safety, `benchmark contender ${contender.label} safety`);
  needInteger(contender.errors, `benchmark contender ${contender.label} errors`);
  if ('highlight' in contender) needBoolean(contender.highlight, `benchmark contender ${contender.label} highlight`);
}
if (!Array.isArray(showcase.principles) || showcase.principles.length === 0) fail('showcase.principles invalid');
for (const principle of showcase.principles) needString(principle, 'showcase principle');
if (!Array.isArray(showcase.about) || showcase.about.length === 0) fail('showcase.about invalid');
for (const paragraph of showcase.about) needString(paragraph, 'showcase about paragraph');
needObject(showcase.lab, 'showcase.lab');
hasOnly(showcase.lab, ['title', 'intro']);
needString(showcase.lab.title, 'showcase.lab.title');
needString(showcase.lab.intro, 'showcase.lab.intro');
console.log('validate: ok');
