import { retryDelayMs, sleep } from './refresh-lib.mjs';

const WARN_STATUSES = new Set([401, 403, 429]);
const TIMEOUT_MS = 15000;
const ATTEMPTS = 3;

export function collectLinks(site, showcase) {
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
      if (response.status === 405 || response.status === 501) response = await probe(url, 'GET', fetchImpl, timeoutMs);
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
