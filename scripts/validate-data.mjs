#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_IDS } from '../assets/js/demos.js';
import { PLAYGROUND_ID } from '../assets/js/playground.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dataPath = args[0] ? resolve(args[0]) : join(ROOT, 'data', 'site-data.json');
const showcasePath = args[1] ? resolve(args[1]) : join(ROOT, 'data', 'showcase.json');
const schemaPath = join(ROOT, 'data', 'site-data.schema.json');
const showcaseSchemaPath = join(ROOT, 'data', 'showcase.schema.json');

class ValidationError extends Error {}

const errors = [];
const projectNames = new Set();
const usedShowcaseNames = new Set();

function fail(message) {
  throw new ValidationError(message);
}

function run(validate) {
  try {
    validate();
  } catch (err) {
    if (err instanceof ValidationError) errors.push(err.message);
    else throw err;
  }
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

function isCalendarDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function hasOnly(obj, allowed) {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) fail(`unexpected key ${key}`);
}

function needObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} invalid`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function needStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} invalid`);
  for (const entry of value) needString(entry, `${label} entry`);
}

function checkIntegers(obj, keys, prefix) {
  for (const key of keys) needInteger(obj[key], `${prefix}${key}`);
}

function checkBooleans(obj, keys, prefix) {
  for (const key of keys) needBoolean(obj[key], `${prefix}${key}`);
}

function checkSortedDates(entries, label) {
  let previous = null;
  for (const entry of entries) {
    if (!entry || typeof entry.date !== 'string') continue;
    if (previous !== null && entry.date <= previous) fail(`${label} dates must be unique and sorted: ${entry.date}`);
    previous = entry.date;
  }
}

function readJson(path, label) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    errors.push(`${label} unreadable: ${err.message}`);
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    errors.push(`${label} unparsable: ${err.message}`);
    return undefined;
  }
}

function validateIdentity(identity) {
  needObject(identity, 'identity');
  hasOnly(identity, ['displayName', 'classTitle', 'tagline', 'avatarUrl', 'links']);
  for (const key of ['displayName', 'classTitle', 'tagline']) needString(identity[key], `identity.${key}`);
  needUri(identity.avatarUrl, 'identity.avatarUrl');
  needObject(identity.links, 'identity.links');
  hasOnly(identity.links, ['github', 'email']);
  needUri(identity.links.github, 'identity.links.github');
  if (identity.links.email !== null) {
    if (typeof identity.links.email !== 'string' || !isEmail(identity.links.email)) fail('identity.links.email invalid');
  }
}

const PROJECT_KEYS = ['name', 'description', 'language', 'stars', 'forks', 'url', 'npm', 'license', 'npmWeeklyDownloads', 'pushedAt'];

function validateProject(project) {
  needObject(project, 'project');
  hasOnly(project, PROJECT_KEYS);
  for (const key of ['name', 'url', 'pushedAt']) needString(project[key], `project ${project.name || '?'} ${key}`);
  if (projectNames.has(project.name)) fail(`project duplicated: ${project.name}`);
  projectNames.add(project.name);
  needUri(project.url, `project ${project.name} url`);
  checkIntegers(project, ['stars', 'forks'], `project ${project.name} `);
  needStringOrNull(project.description, `project ${project.name} description`);
  needStringOrNull(project.language, `project ${project.name} language`);
  needStringOrNull(project.npm, `project ${project.name} npm`);
  needStringOrNull(project.license, `project ${project.name} license`);
  if ('npmWeeklyDownloads' in project) needInteger(project.npmWeeklyDownloads, `project ${project.name} npmWeeklyDownloads`);
  if (!isTimestamp(project.pushedAt)) fail(`project ${project.name} pushedAt invalid`);
}

function validateProjects(projects) {
  if (!Array.isArray(projects) || projects.length === 0) fail('projects invalid');
  for (const project of projects) run(() => validateProject(project));
}

function validateStats(stats) {
  needObject(stats, 'stats');
  hasOnly(stats, ['totalStars', 'npmPackages', 'publicRepos', 'starsGiven', 'forksReceived']);
  checkIntegers(stats, ['totalStars', 'npmPackages', 'publicRepos', 'starsGiven', 'forksReceived'], 'stats.');
}

function validateDailyEntry(entry) {
  needObject(entry, 'activity.daily entry');
  hasOnly(entry, ['date', 'events', 'pushes']);
  needString(entry.date, 'activity.daily date');
  if (!isCalendarDate(entry.date)) fail('activity.daily date invalid');
  checkIntegers(entry, ['events', 'pushes'], 'activity.daily ');
}

function validateActivity(activity) {
  needObject(activity, 'activity');
  hasOnly(activity, ['window', 'pushes', 'highlights', 'fetchedAt', 'daily']);
  needString(activity.window, 'activity.window');
  needInteger(activity.pushes, 'activity.pushes');
  if (!Array.isArray(activity.highlights)) fail('activity.highlights invalid');
  for (const highlight of activity.highlights) needString(highlight, 'activity highlight');
  needString(activity.fetchedAt, 'activity.fetchedAt');
  if (!isCalendarDate(activity.fetchedAt)) fail('activity.fetchedAt invalid');
  if ('daily' in activity) {
    if (!Array.isArray(activity.daily)) fail('activity.daily invalid');
    for (const entry of activity.daily) run(() => validateDailyEntry(entry));
    checkSortedDates(activity.daily, 'activity.daily');
  }
}

function validateSections(sections) {
  needObject(sections, 'sections');
  hasOnly(sections, ['showAbout', 'showArtifacts', 'showAbilityScores', 'showCampfire']);
  checkBooleans(sections, ['showAbout', 'showArtifacts', 'showAbilityScores', 'showCampfire'], 'sections.');
}

function validateHistoryEntry(entry) {
  needObject(entry, 'history entry');
  hasOnly(entry, ['date', 'totalStars', 'totalDownloads']);
  needString(entry.date, 'history date');
  if (!isCalendarDate(entry.date)) fail('history date invalid');
  checkIntegers(entry, ['totalStars', 'totalDownloads'], 'history ');
}

function validateHistory(history) {
  if (!Array.isArray(history)) fail('history invalid');
  for (const entry of history) run(() => validateHistoryEntry(entry));
  checkSortedDates(history, 'history');
}

function validateSiteData(data) {
  if (!isPlainObject(data)) {
    errors.push('site-data invalid');
    return;
  }
  run(() => {
    hasOnly(data, ['$schema', 'identity', 'projects', 'stats', 'activity', 'sections', 'history']);
    for (const key of ['identity', 'projects', 'stats', 'activity', 'sections']) {
      if (!(key in data)) fail(`missing ${key}`);
    }
    if ('$schema' in data) needString(data.$schema, 'site-data.$schema');
  });
  run(() => validateIdentity(data.identity));
  run(() => validateProjects(data.projects));
  run(() => validateStats(data.stats));
  run(() => validateActivity(data.activity));
  run(() => validateSections(data.sections));
  if ('history' in data) run(() => validateHistory(data.history));
}

function validateIntro(intro) {
  needObject(intro, 'showcase.intro');
  hasOnly(intro, ['headline', 'paragraphs']);
  needString(intro.headline, 'showcase.intro.headline');
  needStringArray(intro.paragraphs, 'showcase.intro.paragraphs');
}

function validateProblem(item, knownNames) {
  needObject(item, 'showcase problem');
  hasOnly(item, ['name', 'kicker', 'headline', 'problem', 'answer', 'highlights', 'demo', 'size']);
  for (const key of ['name', 'kicker', 'headline', 'problem', 'answer']) needString(item[key], `showcase problem ${item.name || '?'} ${key}`);
  if (knownNames && !knownNames.has(item.name)) fail(`showcase problem missing from site-data: ${item.name}`);
  if (usedShowcaseNames.has(item.name)) fail(`showcase problem duplicated: ${item.name}`);
  usedShowcaseNames.add(item.name);
  needStringArray(item.highlights, `showcase problem ${item.name} highlights`);
  if (item.size !== 'hero' && item.size !== 'default') fail(`showcase problem ${item.name} size invalid`);
  if ('demo' in item) needString(item.demo, `showcase problem ${item.name} demo`);
  if ('demo' in item && !DEMO_IDS.has(item.demo) && item.demo !== PLAYGROUND_ID) fail(`showcase problem ${item.name} demo unknown: ${item.demo}`);
}

function validateContender(contender, labels) {
  needObject(contender, 'benchmark contender');
  hasOnly(contender, ['label', 'overall', 'safety', 'errors', 'highlight']);
  needString(contender.label, 'benchmark contender label');
  if (labels.has(contender.label)) fail(`benchmark contender duplicated: ${contender.label}`);
  labels.add(contender.label);
  needNumber(contender.overall, `benchmark contender ${contender.label} overall`);
  needNumber(contender.safety, `benchmark contender ${contender.label} safety`);
  needInteger(contender.errors, `benchmark contender ${contender.label} errors`);
  if ('highlight' in contender) needBoolean(contender.highlight, `benchmark contender ${contender.label} highlight`);
}

function validateBenchmark(bench) {
  needObject(bench, 'showcase.evidence.benchmark');
  hasOnly(bench, ['source', 'generatedAt', 'models', 'scenarios', 'contenderCount', 'runsPerContender', 'contenders']);
  needUri(bench.source, 'showcase.evidence.benchmark.source');
  needString(bench.generatedAt, 'showcase.evidence.benchmark.generatedAt');
  if (!isTimestamp(bench.generatedAt)) fail('showcase.evidence.benchmark.generatedAt invalid');
  checkIntegers(bench, ['models', 'scenarios', 'contenderCount', 'runsPerContender'], 'showcase.evidence.benchmark.');
  if (!Array.isArray(bench.contenders) || bench.contenders.length === 0) fail('showcase.evidence.benchmark.contenders invalid');
  if (bench.contenders.length !== bench.contenderCount) fail('showcase.evidence.benchmark.contenderCount does not match contenders');
  if (bench.models * bench.scenarios !== bench.runsPerContender) fail('showcase.evidence.benchmark.runsPerContender does not match models × scenarios');
  const labels = new Set();
  for (const contender of bench.contenders) run(() => validateContender(contender, labels));
  let highlights = 0;
  for (const contender of bench.contenders) if (contender && contender.highlight === true) highlights += 1;
  if (highlights > 1) fail('showcase.evidence.benchmark has more than one highlighted contender');
}

function validateEvidence(evidence, knownNames) {
  needObject(evidence, 'showcase.evidence');
  hasOnly(evidence, ['name', 'kicker', 'headline', 'problem', 'answer', 'highlights', 'demo', 'intro', 'benchmark']);
  for (const key of ['name', 'kicker', 'headline', 'problem', 'answer']) needString(evidence[key], `showcase.evidence.${key}`);
  if (knownNames && !knownNames.has(evidence.name)) fail(`showcase evidence missing from site-data: ${evidence.name}`);
  if (usedShowcaseNames.has(evidence.name)) fail(`showcase evidence duplicated: ${evidence.name}`);
  usedShowcaseNames.add(evidence.name);
  needStringArray(evidence.highlights, 'showcase.evidence.highlights');
  if ('demo' in evidence) needString(evidence.demo, 'showcase.evidence.demo');
  if ('demo' in evidence && !DEMO_IDS.has(evidence.demo) && evidence.demo !== PLAYGROUND_ID) fail(`showcase evidence demo unknown: ${evidence.demo}`);
  if ('intro' in evidence) needString(evidence.intro, 'showcase.evidence.intro');
  validateBenchmark(evidence.benchmark);
}

function validateShowcase(showcase, knownNames) {
  if (!isPlainObject(showcase)) {
    errors.push('showcase invalid');
    return;
  }
  run(() => {
    hasOnly(showcase, ['$schema', 'intro', 'problems', 'evidence', 'principles', 'colophon']);
    for (const key of ['intro', 'problems', 'evidence', 'principles', 'colophon']) {
      if (!(key in showcase)) fail(`showcase missing ${key}`);
    }
    if ('$schema' in showcase) needString(showcase.$schema, 'showcase.$schema');
  });
  run(() => validateIntro(showcase.intro));
  run(() => {
    if (!Array.isArray(showcase.problems) || showcase.problems.length === 0) fail('showcase.problems invalid');
    for (const item of showcase.problems) run(() => validateProblem(item, knownNames));
  });
  run(() => validateEvidence(showcase.evidence, knownNames));
  run(() => needStringArray(showcase.principles, 'showcase.principles'));
  run(() => needStringArray(showcase.colophon, 'showcase.colophon'));
}

const data = readJson(dataPath, relative(ROOT, dataPath));
const showcase = readJson(showcasePath, relative(ROOT, showcasePath));
readJson(schemaPath, relative(ROOT, schemaPath));
readJson(showcaseSchemaPath, relative(ROOT, showcaseSchemaPath));

if (data !== undefined) validateSiteData(data);
const declaredNames = isPlainObject(data) && Array.isArray(data.projects) && data.projects.length > 0
  ? new Set(data.projects.filter((project) => isPlainObject(project) && typeof project.name === 'string').map((project) => project.name))
  : null;
if (showcase !== undefined) validateShowcase(showcase, declaredNames);

if (errors.length > 0) {
  for (const message of errors) console.error(`validate: ${message}`);
  process.exit(1);
}
console.log('validate: ok');
