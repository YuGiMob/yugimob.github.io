#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = join(ROOT, 'data', 'site-data.json');
const schemaPath = join(ROOT, 'data', 'site-data.schema.json');
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
const topAllowed = ['identity', 'about', 'projects', 'stats', 'activity', 'sections'];
hasOnly(data, topAllowed);
for (const key of topAllowed) if (!(key in data)) fail(`missing ${key}`);
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
hasOnly(data.activity, ['window', 'pushes', 'highlights', 'fetchedAt']);
needString(data.activity.window, 'activity.window');
needInteger(data.activity.pushes, 'activity.pushes');
if (!Array.isArray(data.activity.highlights)) fail('activity.highlights invalid');
for (const h of data.activity.highlights) needString(h, 'activity highlight');
needString(data.activity.fetchedAt, 'activity.fetchedAt');
needObject(data.sections, 'sections');
hasOnly(data.sections, ['showBackground', 'showArtifacts', 'showQuestLog', 'showAbilityScores', 'showCampfire']);
checkBooleans(data.sections, ['showBackground', 'showArtifacts', 'showQuestLog', 'showAbilityScores', 'showCampfire'], 'sections.');
console.log('validate: ok');
