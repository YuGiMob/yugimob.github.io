#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const JS_DIRECTORIES = ['assets/js', 'scripts', 'tests'];
const TEXT_FILES = [
  'index.html',
  '404.html',
  'assets/css/style.css',
  'data/site-data.json',
  'data/showcase.json',
  'data/site-data.schema.json',
  'data/showcase.schema.json',
  'llms.txt',
  'robots.txt',
  'sitemap.xml',
  '.well-known/security.txt',
  '.github/dependabot.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/links.yml',
  '.github/workflows/refresh-data.yml',
  '.github/workflows/scorecard.yml',
  '.github/workflows/validate.yml',
  'package.json',
  '.nvmrc',
];

const REGEX_PREFIX_CHARS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>', '/']);
const REGEX_PREFIX_WORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const CONTROL_WORDS = new Set(['if', 'while', 'for', 'with']);

function scriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...scriptFiles(path));
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) files.push(path);
  }
  return files;
}

function skipString(source, index, quote) {
  let cursor = index + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === quote || char === '\n') return cursor + 1;
    cursor += 1;
  }
  return cursor;
}

function skipTemplate(source, index) {
  let cursor = index + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === '`') return cursor + 1;
    cursor += 1;
  }
  return cursor;
}

function skipRegex(source, index) {
  let cursor = index + 1;
  let inClass = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === '\n') return index + 1;
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) return cursor + 1;
    cursor += 1;
  }
  return cursor;
}

function isWordChar(char) {
  return /[A-Za-z0-9_$]/.test(char);
}

function wordBefore(source, index) {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1;
  const end = cursor + 1;
  while (cursor >= 0 && isWordChar(source[cursor])) cursor -= 1;
  return source.slice(cursor + 1, end);
}

function findComment(source) {
  const parens = [];
  let index = 0;
  let previous = '';
  let afterControlParen = false;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') return { index, kind: 'a line comment' };
    if (char === '/' && next === '*') return { index, kind: 'a block comment' };
    if (char === '"' || char === "'") {
      index = skipString(source, index, char);
      previous = char;
      afterControlParen = false;
      continue;
    }
    if (char === '`') {
      index = skipTemplate(source, index);
      previous = char;
      afterControlParen = false;
      continue;
    }
    if (char === '(') {
      parens.push(CONTROL_WORDS.has(wordBefore(source, index)));
      previous = char;
      afterControlParen = false;
      index += 1;
      continue;
    }
    if (char === ')') {
      afterControlParen = parens.pop() === true;
      previous = char;
      index += 1;
      continue;
    }
    if (char === '/' && (afterControlParen || REGEX_PREFIX_CHARS.has(previous) || REGEX_PREFIX_WORDS.has(wordBefore(source, index)))) {
      index = skipRegex(source, index);
      previous = '/';
      afterControlParen = false;
      continue;
    }
    if (!/\s/.test(char)) {
      previous = char;
      afterControlParen = false;
    }
    index += 1;
  }
  return null;
}

function lineAndColumn(source, index) {
  const before = source.slice(0, index);
  const line = before.split('\n').length;
  const column = index - before.lastIndexOf('\n');
  return `${line}:${column}`;
}

function checkScript(source, file) {
  const comment = findComment(source);
  if (comment) errors.push(`${file}:${lineAndColumn(source, comment.index)} has ${comment.kind}; this codebase does not use comments`);
}

function checkText(source, file) {
  if (source.includes('\r')) errors.push(`${file}: uses CRLF line endings, expected LF`);
  if (!source.endsWith('\n')) errors.push(`${file}: is missing a final newline`);
  const tab = source.match(/^[ \t]*\t/m);
  if (tab) errors.push(`${file}:${lineAndColumn(source, tab.index)} is indented with a tab, expected spaces`);
  const trailing = source.match(/[ \t]+\n/);
  if (trailing) errors.push(`${file}:${lineAndColumn(source, trailing.index)} has trailing whitespace`);
}

const files = [...JS_DIRECTORIES.flatMap(scriptFiles), ...TEXT_FILES];
for (const file of files) {
  let source;
  try {
    source = readFileSync(join(ROOT, file), 'utf8');
  } catch (err) {
    errors.push(`${file} unreadable: ${err.message}`);
    continue;
  }
  checkText(source, file);
  if (file.endsWith('.js') || file.endsWith('.mjs')) checkScript(source, file);
}

if (errors.length > 0) {
  for (const message of errors) console.error(`validate:style: ${message}`);
  process.exit(1);
}
console.log(`validate:style: ok (${files.length} files)`);
