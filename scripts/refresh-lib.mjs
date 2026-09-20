export const HISTORY_LIMIT = 120;
export const MAX_ACTIVITY_DAYS = 120;
export const MAX_HIGHLIGHTS = 5;

export const BENCHMARK_REPOSITORY = 'https://github.com/YuGiMob/pi-edit-benchmark';
export const BENCHMARK_REPORT_URL = `${BENCHMARK_REPOSITORY}/blob/main/results/llm-report.json`;
export const BENCHMARK_TRACES_URL = `${BENCHMARK_REPOSITORY}/tree/main/results/traces`;
export const BENCHMARK_REPORT_RAW = 'https://raw.githubusercontent.com/YuGiMob/pi-edit-benchmark/main/results/llm-report.json';
export const BENCHMARK_SCENARIO_RAW = [
  'https://raw.githubusercontent.com/YuGiMob/pi-edit-benchmark/main/src/scenarios/index.ts',
  'https://raw.githubusercontent.com/YuGiMob/pi-edit-benchmark/main/src/scenarios/better-edit.ts',
];
export const BENCHMARK_FOCI = ['core', 'staleness', 'served-state'];
export const OUTCOME_KINDS = ['applied', 'recovered', 'rejected', 'noop', 'undo', 'error'];

const FOCUS_PATTERN = /\bid:\s*"([^"]+)"(?:(?!\bid:\s*")[\s\S])*?\bfocus:\s*"(core|staleness|served-state)"/g;

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

export function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

export function parseScenarioFocus(source) {
  const focus = new Map();
  for (const match of String(source).matchAll(FOCUS_PATTERN)) focus.set(match[1], match[2]);
  return focus;
}

export function contenderLabel(id) {
  const base = String(id).split('/').pop() ?? String(id);
  const stripped = base.startsWith('pi-') ? base.slice(3) : base;
  return stripped === 'builtin-edit' ? 'built-in edit' : stripped;
}

export function wilsonInterval(passed, total, z = 1.96) {
  if (!Number.isFinite(passed) || !Number.isFinite(total) || total <= 0) return { low: 0, high: 0 };
  const share = Math.min(1, Math.max(0, passed / total));
  const denominator = 1 + (z * z) / total;
  const centre = (share + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((share * (1 - share) + (z * z) / (4 * total)) / total)) / denominator;
  return { low: Math.round(Math.max(0, centre - margin) * 1000) / 10, high: Math.round(Math.min(1, centre + margin) * 1000) / 10 };
}

export function benchmarkTraceUrl(tracePath) {
  const segments = String(tracePath ?? '').split('/').filter(Boolean);
  if (segments.length < 2) return BENCHMARK_TRACES_URL;
  const file = segments[segments.length - 1];
  const model = segments[segments.length - 2];
  return `${BENCHMARK_REPOSITORY}/blob/main/results/traces/${encodeURIComponent(model)}/${encodeURIComponent(file)}`;
}

function emptyTally() {
  return { runs: 0, passed: 0 };
}

function rate(passed, runs) {
  if (runs <= 0) return null;
  return Math.round((passed / runs) * 1000) / 10;
}

export function summarizeBenchmark(report, focusById = new Map(), highlighted = () => false) {
  const runs = Array.isArray(report?.runs) ? report.runs : [];
  const contenders = new Map();
  const focusCounts = new Map(BENCHMARK_FOCI.map((focus) => [focus, 0]));
  for (const focus of focusById.values()) focusCounts.set(focus, (focusCounts.get(focus) ?? 0) + 1);

  let costUsd = 0;
  for (const run of runs) {
    const id = run.contenderId;
    if (!id) continue;
    const entry = contenders.get(id) ?? {
      id,
      version: run.contenderVersion ?? null,
      overall: emptyTally(),
      byFocus: new Map(BENCHMARK_FOCI.map((focus) => [focus, emptyTally()])),
      outcomes: new Map(),
      errors: 0,
      tracePath: null,
      traceRank: -1,
    };
    const focus = focusById.get(run.scenarioId) ?? null;
    const passed = run.pass === true;
    entry.overall.runs += 1;
    if (passed) entry.overall.passed += 1;
    if (focus) {
      const tally = entry.byFocus.get(focus);
      tally.runs += 1;
      if (passed) tally.passed += 1;
    }
    const outcome = OUTCOME_KINDS.includes(run.outcome) ? run.outcome : 'error';
    entry.outcomes.set(outcome, (entry.outcomes.get(outcome) ?? 0) + 1);
    if (outcome === 'error') entry.errors += 1;
    const rank = passed && outcome === 'recovered' ? 2 : passed ? 1 : 0;
    if (run.tracePath && rank > entry.traceRank) {
      entry.traceRank = rank;
      entry.tracePath = run.tracePath;
    }
    costUsd += Number.isFinite(run.costUsd) ? run.costUsd : 0;
    contenders.set(id, entry);
  }

  const rows = [...contenders.values()].map((entry) => {
    const interval = wilsonInterval(entry.overall.passed, entry.overall.runs);
    const outcomes = {};
    for (const kind of OUTCOME_KINDS) {
      const count = entry.outcomes.get(kind) ?? 0;
      if (count > 0) outcomes[kind] = count;
    }
    return {
      id: entry.id,
      label: contenderLabel(entry.id),
      version: entry.version,
      highlight: Boolean(highlighted(entry.id)),
      overall: rate(entry.overall.passed, entry.overall.runs) ?? 0,
      safety: rate(entry.byFocus.get('staleness').passed, entry.byFocus.get('staleness').runs),
      served: rate(entry.byFocus.get('served-state').passed, entry.byFocus.get('served-state').runs),
      low: interval.low,
      high: interval.high,
      runs: entry.overall.runs,
      passed: entry.overall.passed,
      errors: entry.errors,
      outcomes,
      traceUrl: benchmarkTraceUrl(entry.tracePath),
    };
  });

  rows.sort((a, b) => b.overall - a.overall || (b.safety ?? 0) - (a.safety ?? 0) || a.id.localeCompare(b.id));

  const runsPerContender = rows.length > 0 ? Math.round(runs.length / rows.length) : 0;
  const models = Array.isArray(report?.models) ? report.models.length : 0;
  return {
    source: BENCHMARK_REPOSITORY,
    reportUrl: BENCHMARK_REPORT_URL,
    tracesUrl: BENCHMARK_TRACES_URL,
    generatedAt: typeof report?.generatedAt === 'string' ? report.generatedAt : null,
    models,
    scenarios: focusById.size,
    focusCounts: Object.fromEntries(BENCHMARK_FOCI.map((focus) => [focus, focusCounts.get(focus) ?? 0])),
    contenderCount: rows.length,
    runsPerContender,
    totalRuns: runs.length,
    costUsd: Math.round(costUsd * 10000) / 10000,
    contenders: rows,
  };
}

export function benchmarkCoversFullMatrix(benchmark) {
  if (!benchmark || !Array.isArray(benchmark.contenders) || benchmark.contenders.length === 0) return false;
  if (benchmark.contenderCount !== benchmark.contenders.length) return false;
  if (!Number.isInteger(benchmark.runsPerContender) || benchmark.runsPerContender <= 0) return false;
  if (benchmark.contenders.some((entry) => entry.runs !== benchmark.runsPerContender)) return false;
  if (benchmark.totalRuns !== benchmark.contenderCount * benchmark.runsPerContender) return false;
  return benchmark.models * benchmark.scenarios === benchmark.runsPerContender;
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
