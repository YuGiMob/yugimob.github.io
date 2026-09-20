#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_IDS } from '../assets/js/demos.js';
import { PLAYGROUND_ID } from '../assets/js/playground.js';
import { BENCHMARK_FOCI, isTimestamp } from './refresh-lib.mjs';

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

function label(path, rootLabel) {
  return path || rootLabel;
}

function validateAgainstSchema(value, schema, path, rootLabel, report = fail) {
  if (!isPlainObject(schema)) return;
  const types = schemaTypes(schema);
  if (types && !types.some((type) => isSchemaType(value, type))) {
    report(`${label(path, rootLabel)} invalid`);
    return;
  }
  if ('enum' in schema && !schema.enum.some((option) => Object.is(option, value))) {
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
    if (schema.items) {
      value.forEach((entry, index) => {
        validateAgainstSchema(entry, schema.items, `${path}.${index}`, rootLabel, report);
      });
    }
  }
  if (isPlainObject(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) report(path ? `${path} missing ${key}` : `missing ${key}`);
    }
    const properties = schema.properties ?? {};
    for (const [key, entry] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (key in properties) {
        validateAgainstSchema(entry, properties[key], childPath, rootLabel, report);
        continue;
      }
      if (schema.additionalProperties === false) {
        report(path ? `${path} unexpected key ${key}` : `unexpected key ${key}`);
      } else if (isPlainObject(schema.additionalProperties)) {
        validateAgainstSchema(entry, schema.additionalProperties, childPath, rootLabel, report);
      }
    }
  }
}

function reportSchema(value, schema, rootLabel) {
  validateAgainstSchema(value, schema, '', rootLabel, (message) => errors.push(message));
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
  if (!DEMO_IDS.has(item.demo) && item.demo !== PLAYGROUND_ID) fail(`${prefix} demo unknown: ${item.demo}`);
}

function validateProblem(item, knownNames) {
  if (!isPlainObject(item)) return;
  if (knownNames && !knownNames.has(item.name)) fail(`showcase problem missing from site-data: ${item.name}`);
  if (usedShowcaseNames.has(item.name)) fail(`showcase problem duplicated: ${item.name}`);
  usedShowcaseNames.add(item.name);
  checkDemo(item, `showcase problem ${item.name}`);
}

function validateContender(contender, labels) {
  if (!isPlainObject(contender)) return;
  if (labels.has(contender.label)) fail(`benchmark contender duplicated: ${contender.label}`);
  labels.add(contender.label);
  const name = `benchmark contender ${contender.label}`;
  if (Number.isInteger(contender.passed) && Number.isInteger(contender.runs) && contender.passed > contender.runs) {
    fail(`${name} passed exceeds runs`);
  }
  if (Number.isInteger(contender.runs) && Number.isFinite(contender.overall)) {
    const expected = contender.runs > 0 ? Math.round((contender.passed / contender.runs) * 1000) / 10 : 0;
    if (Math.abs(contender.overall - expected) > 0.05) fail(`${name} overall does not match passed/runs`);
  }
  if (Number.isFinite(contender.low) && Number.isFinite(contender.high) && Number.isFinite(contender.overall)) {
    if (contender.low > contender.overall + 0.05 || contender.high < contender.overall - 0.05) {
      fail(`${name} interval does not bracket the pass rate`);
    }
  }
  if (isPlainObject(contender.outcomes) && Number.isInteger(contender.runs)) {
    const total = Object.values(contender.outcomes).reduce((sum, count) => sum + count, 0);
    if (total !== contender.runs) fail(`${name} outcomes do not sum to runs`);
  }
}

function validateProjects(projects) {
  if (!Array.isArray(projects)) return;
  for (const project of projects) {
    if (!isPlainObject(project) || typeof project.name !== 'string') continue;
    if (projectNames.has(project.name)) fail(`project duplicated: ${project.name}`);
    projectNames.add(project.name);
  }
}

function validateBenchmark(benchmark) {
  if (!isPlainObject(benchmark) || !Array.isArray(benchmark.contenders)) return;
  const labels = new Set();
  let highlighted = 0;
  for (const contender of benchmark.contenders) {
    run(() => validateContender(contender, labels));
    if (isPlainObject(contender) && contender.highlight === true) highlighted += 1;
  }
  if (highlighted === 0) fail('benchmark has no highlighted contender');
  if (highlighted > 1) fail('benchmark has more than one highlighted contender');
  if (benchmark.contenderCount !== benchmark.contenders.length) fail('benchmark contenderCount does not match contenders');
  if (benchmark.models * benchmark.scenarios !== benchmark.runsPerContender) {
    fail('benchmark runsPerContender does not match models × scenarios');
  }
  if (benchmark.contenderCount * benchmark.runsPerContender !== benchmark.totalRuns) {
    fail('benchmark totalRuns does not match contenderCount × runsPerContender');
  }
  if (isPlainObject(benchmark.focusCounts)) {
    const total = BENCHMARK_FOCI.reduce((sum, focus) => sum + (benchmark.focusCounts[focus] ?? 0), 0);
    if (total !== benchmark.scenarios) fail('benchmark focusCounts do not sum to scenarios');
  } else {
    fail('benchmark focusCounts invalid');
  }
}

function validateShowcase(showcase, knownNames) {
  if (!isPlainObject(showcase)) return;
  run(() => {
    if (!Array.isArray(showcase.problems)) return;
    for (const item of showcase.problems) run(() => validateProblem(item, knownNames));
  });
  run(() => {
    const evidence = showcase.evidence;
    if (!isPlainObject(evidence)) return;
    if (knownNames && !knownNames.has(evidence.name)) fail(`showcase evidence missing from site-data: ${evidence.name}`);
    if (usedShowcaseNames.has(evidence.name)) fail(`showcase evidence duplicated: ${evidence.name}`);
    usedShowcaseNames.add(evidence.name);
    checkDemo(evidence, 'showcase evidence');
  });
}

const data = readJson(dataPath, relative(ROOT, dataPath));
const showcase = readJson(showcasePath, relative(ROOT, showcasePath));
const dataSchema = readJson(schemaPath, relative(ROOT, schemaPath));
const showcaseSchema = readJson(showcaseSchemaPath, relative(ROOT, showcaseSchemaPath));

if (data !== undefined && dataSchema !== undefined) reportSchema(data, dataSchema, 'site-data');
if (showcase !== undefined && showcaseSchema !== undefined) reportSchema(showcase, showcaseSchema, 'showcase');

const declaredNames = isPlainObject(data) && Array.isArray(data.projects) && data.projects.length > 0
  ? new Set(data.projects.filter((project) => isPlainObject(project) && typeof project.name === 'string').map((project) => project.name))
  : null;

if (isPlainObject(data)) run(() => validateProjects(data.projects));
if (isPlainObject(data)) run(() => validateBenchmark(data.benchmark));
if (isPlainObject(showcase)) run(() => validateShowcase(showcase, declaredNames));
if (isPlainObject(data)) {
  run(() => {
    if (Array.isArray(data.activity?.daily)) checkSortedDates(data.activity.daily, 'activity.daily');
  });
  run(() => {
    if (Array.isArray(data.history)) checkSortedDates(data.history, 'history');
  });
}

if (errors.length > 0) {
  for (const message of errors) console.error(`validate: ${message}`);
  process.exit(1);
}
console.log('validate: ok');
