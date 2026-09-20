import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const FIXTURES = process.env.YUGIMOB_FIXTURES;
const REPORT = process.env.YUGIMOB_LLM_REPORT ?? 'llm-report.json';
const NO_GITHUB = process.env.YUGIMOB_NO_GITHUB === '1';
const LOG = process.env.YUGIMOB_FETCH_LOG;
const NPM_BULK_FAIL = process.env.YUGIMOB_NPM_BULK_FAIL === '1';

function fixtureText(name) {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function fixtureJson(name) {
  return JSON.parse(fixtureText(name));
}

function responseHeaders(etag = null) {
  const map = new Map();
  if (etag) map.set('etag', etag);
  return { get: (name) => map.get(String(name).toLowerCase()) ?? null };
}

function etagOf(value) {
  return `"${createHash('sha1').update(JSON.stringify(value)).digest('hex')}"`;
}

function jsonResponse(value, status = 200, etag = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: responseHeaders(etag),
    json: async () => value,
    text: async () => JSON.stringify(value),
  };
}

function textResponse(value, status = 200, etag = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: responseHeaders(etag),
    json: async () => JSON.parse(value),
    text: async () => value,
  };
}

function requestHeader(options, name) {
  const headers = options?.headers ?? {};
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] ?? null;
}

function logRequest(url, status, conditional) {
  if (!LOG) return;
  appendFileSync(LOG, `${status} ${conditional ? 'conditional' : 'plain'} ${url}\n`);
}

function conditionalJson(url, value, options) {
  const etag = etagOf(value);
  const noneMatch = requestHeader(options, 'if-none-match');
  logRequest(url, noneMatch === etag ? 304 : 200, Boolean(noneMatch));
  return noneMatch === etag ? jsonResponse(null, 304) : jsonResponse(value, 200, etag);
}

function pageOf(url) {
  return Number(new URL(url).searchParams.get('page') ?? '1');
}

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (NO_GITHUB && target.startsWith('https://api.github.com/')) return jsonResponse(null, 503);
  if (target.startsWith('https://api.github.com/users/YuGiMob/repos')) {
    return conditionalJson(target, pageOf(target) === 1 ? fixtureJson('repos.json') : [], options);
  }
  if (target.startsWith('https://api.github.com/users/YuGiMob/events/public')) {
    return conditionalJson(target, pageOf(target) === 1 ? fixtureJson('events.json') : [], options);
  }
  if (target === 'https://api.github.com/users/YuGiMob') {
    return conditionalJson(target, fixtureJson('user.json'), options);
  }
  const npm = target.match(/^https:\/\/api\.npmjs\.org\/downloads\/point\/last-week\/(.+)$/);
  if (npm) {
    const names = npm[1].split(',');
    if (NPM_BULK_FAIL && names.length > 1) return jsonResponse(null, 503);
    if (names.length === 1) return jsonResponse(fixtureJson(`npm-${names[0]}.json`));
    return jsonResponse(Object.fromEntries(names.map((name) => [name, fixtureJson(`npm-${name}.json`)])));
  }
  if (target.endsWith('/llm-report.json')) return jsonResponse(fixtureJson(REPORT));
  if (target.endsWith('/scenarios/index.ts')) return textResponse(fixtureText('scenarios-index.ts'));
  if (target.endsWith('/scenarios/better-edit.ts')) return textResponse(fixtureText('scenarios-better-edit.ts'));
  return jsonResponse(null, 404);
};
