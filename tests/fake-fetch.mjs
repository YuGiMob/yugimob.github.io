import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = process.env.YUGIMOB_FIXTURES;
const REPORT = process.env.YUGIMOB_LLM_REPORT ?? 'llm-report.json';

function fixtureText(name) {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function fixtureJson(name) {
  return JSON.parse(fixtureText(name));
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => value,
    text: async () => JSON.stringify(value),
  };
}

function textResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => JSON.parse(value),
    text: async () => value,
  };
}

function pageOf(url) {
  return Number(new URL(url).searchParams.get('page') ?? '1');
}

globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.startsWith('https://api.github.com/users/YuGiMob/repos')) {
    return pageOf(target) === 1 ? jsonResponse(fixtureJson('repos.json')) : jsonResponse([]);
  }
  if (target.startsWith('https://api.github.com/users/YuGiMob/events/public')) {
    return pageOf(target) === 1 ? jsonResponse(fixtureJson('events.json')) : jsonResponse([]);
  }
  if (target === 'https://api.github.com/users/YuGiMob') return jsonResponse(fixtureJson('user.json'));
  const npm = target.match(/^https:\/\/api\.npmjs\.org\/downloads\/point\/last-week\/(.+)$/);
  if (npm) return jsonResponse(fixtureJson(`npm-${npm[1]}.json`));
  if (target.endsWith('/llm-report.json')) return jsonResponse(fixtureJson(REPORT));
  if (target.endsWith('/scenarios/index.ts')) return textResponse(fixtureText('scenarios-index.ts'));
  if (target.endsWith('/scenarios/better-edit.ts')) return textResponse(fixtureText('scenarios-better-edit.ts'));
  return jsonResponse(null, 404);
};
