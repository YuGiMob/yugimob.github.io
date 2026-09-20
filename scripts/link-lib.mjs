import { retryDelayMs, sleep } from './refresh-lib.mjs';

const WARN_STATUSES = new Set([401, 403, 429]);
const TIMEOUT_MS = 15000;
const ATTEMPTS = 3;

const SKIP_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const SKIP_SUFFIXES = ['.localhost', '.local', '.test', '.invalid', '.example'];
const SKIP_DOMAINS = ['example.com', 'example.org', 'example.net'];

function probeable(url) {
  try {
    const { hostname } = new URL(url);
    if (SKIP_HOSTS.has(hostname)) return false;
    if (SKIP_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) return false;
    return !SKIP_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

export function collectTextLinks(text) {
  const found = new Set();
  for (const match of String(text ?? '').matchAll(/https?:\/\/[^\s)"'<>\]]+/g)) {
    const url = match[0].replace(/[.,;:]+$/, '');
    if (probeable(url)) found.add(url);
  }
  return found;
}

export function collectLinks(site, showcase, documents = []) {
  const urls = new Map();
  const add = (url, label) => {
    if (!/^https?:\/\//.test(url ?? '')) return;
    if (!urls.has(url)) urls.set(url, new Set());
    urls.get(url).add(label);
  };

  add(site.identity?.links?.github, 'identity');
  add(site.identity?.avatarUrl, 'avatar');
  for (const project of site.projects ?? []) {
    add(project.url, project.name);
    if (project.npm) add(`https://registry.npmjs.org/${project.npm}`, `${project.name} on npm`);
  }
  if (site.benchmark) {
    add(site.benchmark.source, 'benchmark');
    add(site.benchmark.reportUrl, 'benchmark report');
    add(site.benchmark.tracesUrl, 'benchmark traces');
  }
  for (const problem of showcase.problems ?? []) {
    const project = (site.projects ?? []).find((entry) => entry.name === problem.name);
    add(project?.url, `${problem.name} showcase`);
  }
  for (const { label, text } of documents) {
    for (const url of collectTextLinks(text)) add(url, label);
  }
  return urls;
}

export function verdictFor(status) {
  if (status >= 200 && status < 400) return 'ok';
  return WARN_STATUSES.has(status) ? 'warn' : 'fail';
}

async function probe(url, method, fetchImpl, timeoutMs) {
  const response = await fetchImpl(url, { redirect: 'follow', method, signal: AbortSignal.timeout(timeoutMs) });
  if (response.body) await response.body.cancel().catch(() => {});
  return response;
}

export async function checkUrl(url, options = {}) {
  const {
    attempts = ATTEMPTS,
    timeoutMs = TIMEOUT_MS,
    fetchImpl = fetch,
    sleepImpl = sleep,
  } = options;
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      let response = await probe(url, 'HEAD', fetchImpl, timeoutMs);
      if (response.status === 403 || response.status === 405 || response.status === 501) response = await probe(url, 'GET', fetchImpl, timeoutMs);
      lastStatus = response.status;
      if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
        await sleepImpl(retryDelayMs(response.headers));
        continue;
      }
      return response.status;
    } catch {
      if (attempt + 1 >= attempts) return lastStatus;
      await sleepImpl(500 * (attempt + 1));
    }
  }
  return lastStatus;
}
