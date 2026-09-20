export const HISTORY_LIMIT = 120;
export const MAX_ACTIVITY_DAYS = 120;
export const MAX_HIGHLIGHTS = 5;

export function buildHighlights(events, limit = MAX_HIGHLIGHTS) {
  const highlights = [];
  for (const event of events) {
    if (highlights.length >= limit) break;
    const repoName = event.repo && event.repo.name ? event.repo.name : null;
    if (event.type === 'WatchEvent' && event.payload && event.payload.action === 'started' && repoName) {
      highlights.push(`starred ${repoName}`);
    } else if (event.type === 'IssuesEvent' && event.payload && event.payload.action && event.payload.issue && repoName) {
      highlights.push(`${event.payload.action} issue #${event.payload.issue.number} on ${repoName}`);
    }
  }
  return highlights;
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
  return [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-maxDays);
}

export function buildActivity(events, today, maxDays = MAX_ACTIVITY_DAYS) {
  const pushes = events.filter((event) => event.type === 'PushEvent').length;
  const dates = events
    .map((event) => (event.created_at ? String(event.created_at).slice(0, 10) : null))
    .filter(Boolean)
    .sort();
  let window = today;
  if (dates.length > 0) {
    const min = dates[0];
    const max = dates[dates.length - 1];
    window = min.slice(0, 7) === max.slice(0, 7) ? `${min}..${max.slice(8)}` : `${min}..${max}`;
  }
  return {
    pushes,
    highlights: buildHighlights(events),
    window,
    daily: buildDaily(events, maxDays),
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
