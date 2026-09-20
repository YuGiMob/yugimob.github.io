#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_IDS } from '../assets/js/demos.js';
import { PLAYGROUND_ID } from '../assets/js/playground.js';
import { BENCHMARK_FOCI, BENCHMARK_HISTORY_LIMIT, HISTORY_LIMIT, MAX_ACTIVITY_DAYS, MAX_HIGHLIGHTS, benchmarkSnapshot, holmAdjust, isTimestamp, mcnemarExact, pairedDifferenceInterval, scenarioMatrixMatchesBenchmark, wilsonInterval } from './refresh-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dataPath = args[0] ? resolve(args[0]) : join(ROOT, 'data', 'site-data.json');
const showcasePath = args[1] ? resolve(args[1]) : join(ROOT, 'data', 'showcase.json');
const schemaPath = join(ROOT, 'data', 'site-data.schema.json');
const showcaseSchemaPath = join(ROOT, 'data', 'showcase.schema.json');
const matrixPath = args[2] ? resolve(args[2]) : join(ROOT, 'data', 'benchmark-matrix.json');
const matrixSchemaPath = join(ROOT, 'data', 'benchmark-matrix.schema.json');

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
  if (!DEMO_IDS.has(item.demo) && item.demo !== PLAYGROUND_ID) fail(`${prefix} demo unknown: ${item.demo}`);
}

function validateProblem(item, knownNames) {
  if (!isPlainObject(item)) return;
  if (knownNames && !knownNames.has(item.name)) fail(`showcase problem missing from site-data: ${item.name}`);
  if (usedShowcaseNames.has(item.name)) fail(`showcase problem duplicated: ${item.name}`);
  usedShowcaseNames.add(item.name);
  checkDemo(item, `showcase problem ${item.name}`);
}

function validateContender(contender, labels, reference) {
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
  if (Number.isInteger(contender.passed) && Number.isInteger(contender.runs) && Number.isFinite(contender.low) && Number.isFinite(contender.high)) {
    const expected = wilsonInterval(contender.passed, contender.runs);
    if (Math.abs(contender.low - expected.low) > 0.11 || Math.abs(contender.high - expected.high) > 0.11) {
      fail(`${name} interval does not match the Wilson interval for passed/runs`);
    }
  }
  if (isPlainObject(contender.outcomes) && Number.isInteger(contender.runs)) {
    const total = Object.values(contender.outcomes).reduce((sum, count) => sum + count, 0);
    if (total !== contender.runs) fail(`${name} outcomes do not sum to runs`);
  }
  if (contender.vsHighlight != null) {
    if (contender.highlight === true) fail(`${name} is highlighted and cannot compare itself to the highlight`);
    const comparison = contender.vsHighlight;
    if (!isPlainObject(comparison) || !Number.isInteger(comparison.b) || !Number.isInteger(comparison.c)) {
      fail(`${name} vsHighlight invalid`);
    } else {
      if (comparison.b < 0 || comparison.c < 0) fail(`${name} vsHighlight invalid`);
      if (Number.isInteger(contender.runs) && comparison.b + comparison.c > contender.runs) fail(`${name} vsHighlight exceeds runs`);
      if (Math.abs(comparison.p - mcnemarExact(comparison.b, comparison.c)) > 0.000001) {
        fail(`${name} vsHighlight p does not match the exact McNemar test`);
      }
      if (!Number.isFinite(comparison.low) || !Number.isFinite(comparison.high) || comparison.low > comparison.high) {
        fail(`${name} vsHighlight interval invalid`);
      } else if (reference && Number.isInteger(reference.runs)) {
        const expected = pairedDifferenceInterval(comparison.b, comparison.c, reference.runs);
        if (!expected || Math.abs(comparison.low - expected.low) > 0.05 || Math.abs(comparison.high - expected.high) > 0.05) {
          fail(`${name} vsHighlight interval does not match the paired-difference interval`);
        }
      }
    }
  }
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

function validateComparisons(benchmark) {
  const rivals = benchmark.contenders.filter((contender) => isPlainObject(contender) && isPlainObject(contender.vsHighlight));
  const adjusted = holmAdjust(rivals.map((contender) => contender.vsHighlight.p));
  rivals.forEach((contender, index) => {
    const stored = contender.vsHighlight.pAdjusted;
    if (!Number.isFinite(stored) || Math.abs(stored - adjusted[index]) > 0.000001) {
      fail(`benchmark contender ${contender.label} vsHighlight pAdjusted does not match the Holm adjustment`);
    }
  });
}

function validateCosts(benchmark) {
  const costs = benchmark.contenders.map((contender) => (isPlainObject(contender) ? contender.costUsd : undefined));
  if (!Number.isFinite(benchmark.costUsd) || costs.some((cost) => !Number.isFinite(cost))) return;
  const total = costs.reduce((sum, cost) => sum + cost, 0);
  if (Math.abs(total - benchmark.costUsd) > 0.01) {
    fail(`benchmark costUsd ${benchmark.costUsd} does not match the contender total ${Math.round(total * 10000) / 10000}`);
  }
}

function validateBenchmark(benchmark) {
  if (!isPlainObject(benchmark) || !Array.isArray(benchmark.contenders)) return;
  const labels = new Set();
  let highlighted = 0;
  const reference = benchmark.contenders.find((entry) => isPlainObject(entry) && entry.highlight === true) ?? null;
  for (const contender of benchmark.contenders) {
    run(() => validateContender(contender, labels, reference));
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
  validateComparisons(benchmark);
  validateCosts(benchmark);
}

function validateBenchmarkHistory(benchmark, history) {
  if (!Array.isArray(history) || history.length === 0) return;
  const snapshot = benchmarkSnapshot(benchmark);
  if (!snapshot) return;
  const newest = history[history.length - 1];
  if (!isPlainObject(newest)) return;
  if (newest.date !== snapshot.date) fail(`benchmarkHistory newest entry is dated ${newest.date}, not the benchmark report date ${snapshot.date}`);
  if (newest.overall !== snapshot.overall || newest.safety !== snapshot.safety || newest.served !== snapshot.served) {
    fail('benchmarkHistory newest entry does not match the highlighted contender');
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
const matrix = readJson(matrixPath, relative(ROOT, matrixPath));
const matrixSchema = readJson(matrixSchemaPath, relative(ROOT, matrixSchemaPath));

if (data !== undefined && dataSchema !== undefined) reportSchema(data, dataSchema, 'site-data');
if (showcase !== undefined && showcaseSchema !== undefined) reportSchema(showcase, showcaseSchema, 'showcase');
if (dataSchema !== undefined) checkSchemaDocument(dataSchema, '', 'site-data', (message) => errors.push(message));
if (showcaseSchema !== undefined) checkSchemaDocument(showcaseSchema, '', 'showcase', (message) => errors.push(message));
if (matrix !== undefined && matrixSchema !== undefined) reportSchema(matrix, matrixSchema, 'benchmark-matrix');
if (matrixSchema !== undefined) checkSchemaDocument(matrixSchema, '', 'benchmark-matrix', (message) => errors.push(message));
if (matrix !== undefined && isPlainObject(data) && isPlainObject(data.benchmark)) {
  run(() => {
    if (!scenarioMatrixMatchesBenchmark(matrix, data.benchmark)) fail('benchmark-matrix does not match the benchmark block');
  });
}

const declaredNames = isPlainObject(data) && Array.isArray(data.projects) && data.projects.length > 0
  ? new Set(data.projects.filter((project) => isPlainObject(project) && typeof project.name === 'string').map((project) => project.name))
  : null;

if (isPlainObject(data)) run(() => validateProjects(data.projects));
if (isPlainObject(data)) run(() => validateBenchmark(data.benchmark));
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
  run(() => {
    if (Array.isArray(data.benchmarkHistory)) checkSortedDates(data.benchmarkHistory, 'benchmarkHistory');
    if (Array.isArray(data.benchmarkHistory) && data.benchmarkHistory.length > BENCHMARK_HISTORY_LIMIT) {
      fail(`benchmarkHistory has ${data.benchmarkHistory.length} entries; the cap is ${BENCHMARK_HISTORY_LIMIT}`);
    }
  });
  run(() => validateBenchmarkHistory(data.benchmark, data.benchmarkHistory));
}

if (errors.length > 0) {
  for (const message of errors) console.error(`validate: ${message}`);
  process.exit(1);
}
console.log('validate: ok');
