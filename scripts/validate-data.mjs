#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_IDS } from '../assets/js/demos.js';
import { HISTORY_LIMIT, isTimestamp, MAX_ACTIVITY_DAYS, MAX_HIGHLIGHTS } from './refresh-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dataPath = args[0] ? resolve(args[0]) : join(ROOT, 'data', 'site-data.json');
const showcasePath = args[1] ? resolve(args[1]) : join(ROOT, 'data', 'showcase.json');
const schemaPath = join(ROOT, 'data', 'site-data.schema.json');
const showcaseSchemaPath = join(ROOT, 'data', 'showcase.schema.json');

class ValidationError extends Error {}

const errors = [];
const projectNames = new Set();
const npmNames = new Set();
const usedShowcaseNames = new Set();

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

const SCHEMA_ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly']);
const SCHEMA_KEYWORDS = new Set(['type', 'enum', 'const', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'pattern', 'format', 'minimum', 'maximum', 'minProperties', 'maxProperties', '$ref', 'definitions', 'oneOf', 'anyOf', 'allOf', 'not']);
const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'integer', 'number', 'boolean', 'null']);
const SCHEMA_FORMATS = new Set(['uri', 'email', 'date-time']);

function isSchemaType(value, type) {
  switch (type) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function schemaTypes(schema) {
  if (schema.type === undefined) return null;
  return Array.isArray(schema.type) ? schema.type : [schema.type];
}

function matchesFormat(value, format) {
  if (format === 'uri') return isUri(value);
  if (format === 'email') return isEmail(value);
  if (format === 'date-time') return isTimestamp(value);
  return true;
}

function checkSchemaDocument(schema, path, rootLabel, report) {
  if (!isPlainObject(schema)) return;
  const where = label(path, rootLabel);
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_KEYWORDS.has(key) && !SCHEMA_ANNOTATIONS.has(key)) report(`${where} schema uses an unsupported keyword ${key}`);
  }
  for (const type of schemaTypes(schema) ?? []) {
    if (!SCHEMA_TYPES.has(type)) report(`${where} schema uses an unsupported type ${type}`);
  }
  if (typeof schema.format === 'string' && !SCHEMA_FORMATS.has(schema.format)) {
    report(`${where} schema uses an unsupported format ${schema.format}`);
  }
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    checkSchemaDocument(child, path ? `${path}.${key}` : key, rootLabel, report);
  }
  if (Array.isArray(schema.items)) schema.items.forEach((child, index) => checkSchemaDocument(child, path ? `${path}.items.${index}` : `items.${index}`, rootLabel, report));
  else if (isPlainObject(schema.items)) checkSchemaDocument(schema.items, path ? `${path}.items` : 'items', rootLabel, report);
  if (isPlainObject(schema.additionalProperties)) {
    checkSchemaDocument(schema.additionalProperties, path ? `${path}.*` : '*', rootLabel, report);
  }
  for (const [key, child] of Object.entries(schema.definitions ?? {})) {
    checkSchemaDocument(child, `definitions.${key}`, rootLabel, report);
  }
  for (const branch of ['not']) {
    if (isPlainObject(schema[branch])) checkSchemaDocument(schema[branch], path ? `${path}.${branch}` : branch, rootLabel, report);
  }
  for (const branch of ['oneOf', 'anyOf', 'allOf']) {
    if (!Array.isArray(schema[branch])) continue;
    schema[branch].forEach((child, index) => checkSchemaDocument(child, path ? `${path}.${branch}.${index}` : `${branch}.${index}`, rootLabel, report));
  }
}

function label(path, rootLabel) {
  return path || rootLabel;
}

function resolveRef(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  let node = root;
  for (const segment of ref.slice(2).split('/')) {
    if (!isPlainObject(node)) return null;
    node = node[segment];
  }
  return isPlainObject(node) ? node : null;
}

function schemaMatches(value, schema, path, rootLabel, root) {
  let valid = true;
  validateAgainstSchema(value, schema, path, rootLabel, () => { valid = false; }, root);
  return valid;
}

function validateAgainstSchema(value, schema, path, rootLabel, report = fail, root = schema) {
  if (!isPlainObject(schema)) return;
  if (typeof schema.$ref === 'string') {
    const target = resolveRef(root, schema.$ref);
    if (!target) {
      report(`${label(path, rootLabel)} references the missing schema ${schema.$ref}`);
      return;
    }
    validateAgainstSchema(value, target, path, rootLabel, report, root);
    return;
  }
  const types = schemaTypes(schema);
  if (types && !types.some((type) => isSchemaType(value, type))) {
    report(`${label(path, rootLabel)} invalid`);
    return;
  }
  if ('const' in schema && !Object.is(value, schema.const)) {
    report(`${label(path, rootLabel)} invalid`);
    return;
  }
  if ('enum' in schema && !schema.enum.some((option) => Object.is(option, value))) {
    report(`${label(path, rootLabel)} invalid`);
  }
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((option) => schemaMatches(value, option, path, rootLabel, root))) {
    report(`${label(path, rootLabel)} invalid`);
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((option) => schemaMatches(value, option, path, rootLabel, root)).length;
    if (matches !== 1) report(`${label(path, rootLabel)} invalid`);
  }
  for (const option of schema.allOf ?? []) validateAgainstSchema(value, option, path, rootLabel, report, root);
  if (isPlainObject(schema.not) && schemaMatches(value, schema.not, path, rootLabel, root)) {
    report(`${label(path, rootLabel)} invalid`);
  }
  if (typeof value === 'string') {
    if ('minLength' in schema && value.length < schema.minLength) report(`${label(path, rootLabel)} invalid`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) report(`${label(path, rootLabel)} invalid`);
    if (schema.format && !matchesFormat(value, schema.format)) report(`${label(path, rootLabel)} invalid`);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if ('minimum' in schema && value < schema.minimum) report(`${label(path, rootLabel)} invalid`);
    if ('maximum' in schema && value > schema.maximum) report(`${label(path, rootLabel)} invalid`);
  }
  if (Array.isArray(value)) {
    if ('minItems' in schema && value.length < schema.minItems) report(`${label(path, rootLabel)} invalid`);
    if ('maxItems' in schema && value.length > schema.maxItems) report(`${label(path, rootLabel)} invalid`);
    if (schema.uniqueItems === true) {
      const seen = new Set();
      value.forEach((entry, index) => {
        const key = JSON.stringify(entry);
        if (seen.has(key)) report(path ? `${path}.${index} duplicates an earlier item` : `duplicate item ${index}`);
        seen.add(key);
      });
    }
    if (Array.isArray(schema.items)) {
      schema.items.forEach((child, index) => {
        if (index < value.length) validateAgainstSchema(value[index], child, `${path}.${index}`, rootLabel, report, root);
      });
    } else if (schema.items) {
      value.forEach((entry, index) => {
        validateAgainstSchema(entry, schema.items, `${path}.${index}`, rootLabel, report, root);
      });
    }
  }
  if (isPlainObject(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) report(path ? `${path} missing ${key}` : `missing ${key}`);
    }
    if ('minProperties' in schema && Object.keys(value).length < schema.minProperties) report(`${label(path, rootLabel)} invalid`);
    if ('maxProperties' in schema && Object.keys(value).length > schema.maxProperties) report(`${label(path, rootLabel)} invalid`);
    const properties = schema.properties ?? {};
    for (const [key, entry] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (key in properties) {
        validateAgainstSchema(entry, properties[key], childPath, rootLabel, report, root);
        continue;
      }
      if (schema.additionalProperties === false) {
        report(path ? `${path} unexpected key ${key}` : `unexpected key ${key}`);
      } else if (isPlainObject(schema.additionalProperties)) {
        validateAgainstSchema(entry, schema.additionalProperties, childPath, rootLabel, report, root);
      }
    }
  }
}

function reportSchema(value, schema, rootLabel) {
  validateAgainstSchema(value, schema, '', rootLabel, (message) => errors.push(message), schema);
}

function needString(value, message) {
  if (typeof value !== 'string' || value.length === 0) fail(message);
}

function checkSortedDates(entries, label) {
  let previous = null;
  for (const entry of entries) {
    if (!entry || typeof entry.date !== 'string') continue;
    if (previous !== null && entry.date <= previous) fail(`${label} dates must be unique and sorted: ${entry.date}`);
    previous = entry.date;
  }
}

function checkDemo(item, prefix) {
  if (!('demo' in item)) return;
  needString(item.demo, `${prefix} demo`);
  if (!DEMO_IDS.has(item.demo)) fail(`${prefix} demo unknown: ${item.demo}`);
}

function validateProblem(item, knownNames) {
  if (!isPlainObject(item)) return;
  if (knownNames && !knownNames.has(item.name)) fail(`showcase problem missing from site-data: ${item.name}`);
  if (usedShowcaseNames.has(item.name)) fail(`showcase problem duplicated: ${item.name}`);
  usedShowcaseNames.add(item.name);
  checkDemo(item, `showcase problem ${item.name}`);
}

function validateProjects(projects) {
  if (!Array.isArray(projects)) return;
  for (const project of projects) {
    if (!isPlainObject(project) || typeof project.name !== 'string') continue;
    if (projectNames.has(project.name)) fail(`project duplicated: ${project.name}`);
    projectNames.add(project.name);
    if (typeof project.npm !== 'string' || project.npm.length === 0) continue;
    if (npmNames.has(project.npm)) fail(`npm package duplicated: ${project.npm}`);
    npmNames.add(project.npm);
  }
}

function validateShowcase(showcase, knownNames) {
  if (!isPlainObject(showcase)) return;
  run(() => {
    if (!Array.isArray(showcase.problems)) return;
    for (const item of showcase.problems) run(() => validateProblem(item, knownNames));
  });
}

const data = readJson(dataPath, relative(ROOT, dataPath));
const showcase = readJson(showcasePath, relative(ROOT, showcasePath));
const dataSchema = readJson(schemaPath, relative(ROOT, schemaPath));
const showcaseSchema = readJson(showcaseSchemaPath, relative(ROOT, showcaseSchemaPath));

if (data !== undefined && dataSchema !== undefined) reportSchema(data, dataSchema, 'site-data');
if (showcase !== undefined && showcaseSchema !== undefined) reportSchema(showcase, showcaseSchema, 'showcase');
if (dataSchema !== undefined) checkSchemaDocument(dataSchema, '', 'site-data', (message) => errors.push(message));
if (showcaseSchema !== undefined) checkSchemaDocument(showcaseSchema, '', 'showcase', (message) => errors.push(message));

const declaredNames = isPlainObject(data) && Array.isArray(data.projects) && data.projects.length > 0
  ? new Set(data.projects.filter((project) => isPlainObject(project) && typeof project.name === 'string').map((project) => project.name))
  : null;

if (isPlainObject(data)) run(() => validateProjects(data.projects));
if (isPlainObject(showcase)) run(() => validateShowcase(showcase, declaredNames));
if (isPlainObject(data)) {
  run(() => {
    if (Array.isArray(data.activity?.daily)) checkSortedDates(data.activity.daily, 'activity.daily');
    if (Array.isArray(data.activity?.daily) && data.activity.daily.length > MAX_ACTIVITY_DAYS) {
      fail(`activity.daily has ${data.activity.daily.length} entries; the cap is ${MAX_ACTIVITY_DAYS}`);
    }
    if (Array.isArray(data.activity?.highlights) && data.activity.highlights.length > MAX_HIGHLIGHTS) {
      fail(`activity.highlights has ${data.activity.highlights.length} entries; the cap is ${MAX_HIGHLIGHTS}`);
    }
  });
  run(() => {
    if (Array.isArray(data.history)) checkSortedDates(data.history, 'history');
    if (Array.isArray(data.history) && data.history.length > HISTORY_LIMIT) {
      fail(`history has ${data.history.length} entries; the cap is ${HISTORY_LIMIT}`);
    }
  });
}

if (errors.length > 0) {
  for (const message of errors) console.error(`validate: ${message}`);
  process.exit(1);
}
console.log('validate: ok');
