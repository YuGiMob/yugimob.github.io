import { elapsedDays } from '../assets/js/numbers.js';
import { STALE_AFTER_DAYS } from '../assets/js/view-model.js';

export const HISTORY_LIMIT = 120;
export const MAX_ACTIVITY_DAYS = 120;
export const MAX_HIGHLIGHTS = 5;
export const MAX_HISTORY_AGE_DAYS = STALE_AFTER_DAYS;

export function buildHighlights(events, limit = MAX_HIGHLIGHTS) {
  const highlights = [];
  for (const event of events) {
    if (highlights.length >= limit) break;
    const repoName = event.repo && event.repo.name ? event.repo.name : null;
    if (event.type === 'WatchEvent' && event.payload && event.payload.action === 'started' && repoName) {
      highlights.push(`starred ${repoName}`);
    } else if (event.type === 'IssuesEvent' && event.payload && event.payload.action && event.payload.issue && repoName) {
      highlights.push(`${event.payload.action} issue #${event.payload.issue.number} on ${repoName}`);
    } else if (event.type === 'ReleaseEvent' && event.payload && event.payload.action === 'published' && event.payload.release && repoName) {
      highlights.push(`published release ${event.payload.release.tag_name} of ${repoName}`);
    } else if (event.type === 'PullRequestEvent' && event.payload && event.payload.pull_request && event.payload.pull_request.merged && repoName) {
      highlights.push(`merged pull request #${event.payload.pull_request.number} on ${repoName}`);
    }
  }
  return highlights;
}

const DAY_MS = 86400000;

function dayRange(first, last) {
  const days = [];
  for (let time = Date.parse(`${first}T00:00:00Z`); time <= Date.parse(`${last}T00:00:00Z`); time += DAY_MS) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

export function buildDaily(events, maxDays = MAX_ACTIVITY_DAYS) {
  const byDay = new Map();
  for (const event of events) {
    if (!event.created_at) continue;
    const date = String(event.created_at).slice(0, 10);
    const entry = byDay.get(date) ?? { date, events: 0, pushes: 0 };
    entry.events += 1;
    if (event.type === 'PushEvent') entry.pushes += 1;
    byDay.set(date, entry);
  }
  const dates = [...byDay.keys()].sort();
  if (dates.length === 0) return [];
  const first = dates[0];
  const last = dates[dates.length - 1];
  const earliest = new Date(Date.parse(`${last}T00:00:00Z`) - (maxDays - 1) * DAY_MS).toISOString().slice(0, 10);
  const start = first > earliest ? first : earliest;
  return dayRange(start, last)
    .map((date) => byDay.get(date) ?? { date, events: 0, pushes: 0 });
}

export function buildActivity(events, today, maxDays = MAX_ACTIVITY_DAYS) {
  const daily = buildDaily(events, maxDays);
  const pushes = daily.reduce((sum, entry) => sum + entry.pushes, 0);
  const first = daily[0]?.date;
  const last = daily[daily.length - 1]?.date;
  let window = today;
  if (first && last) {
    window = first.slice(0, 7) === last.slice(0, 7) ? `${first}..${last.slice(8)}` : `${first}..${last}`;
  }
  return {
    pushes,
    highlights: buildHighlights(events),
    window,
    daily,
  };
}

export function upsertHistory(history, snapshot, limit = HISTORY_LIMIT) {
  const entries = history.filter((entry) => entry && typeof entry.date === 'string');
  const index = entries.findIndex((entry) => entry.date === snapshot.date);
  if (index >= 0) entries[index] = snapshot;
  else entries.push(snapshot);
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries.slice(-limit);
}

export function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

export function historyAgeDays(history, now = Date.now()) {
  const newest = Array.isArray(history) && history.length > 0 ? history[history.length - 1] : null;
  if (!newest || typeof newest.date !== 'string') return null;
  return elapsedDays(newest.date, now);
}

export function npmPointUrl(packages) {
  const names = (Array.isArray(packages) ? packages : []).filter((name) => typeof name === 'string' && name.length > 0);
  if (names.length === 0) return null;
  if (names.some((name) => name.startsWith('@'))) return null;
  return `https://api.npmjs.org/downloads/point/last-week/${names.join(',')}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retryDelayMs(headers, now = Date.now()) {
  const value = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
  if (!value) return 1000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(Math.max(0, seconds * 1000), 60000);
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return Math.min(Math.max(0, timestamp - now), 60000);
  return 1000;
}
