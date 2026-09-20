export const HISTORY_LIMIT = 120;
export const MAX_ACTIVITY_DAYS = 120;
export const MAX_HIGHLIGHTS = 5;
export const BENCHMARK_HISTORY_LIMIT = 120;
export const MAX_HISTORY_AGE_DAYS = 2;

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
  return dayRange(dates[0], dates[dates.length - 1])
    .map((date) => byDay.get(date) ?? { date, events: 0, pushes: 0 })
    .slice(-maxDays);
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
  const then = Date.parse(newest.date);
  return Number.isFinite(then) ? Math.max(0, Math.floor((now - then) / DAY_MS)) : null;
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

const LOG_GAMMA_COEFFICIENTS = [
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function logGamma(value) {
  const x = value - 1;
  let sum = 0.99999999999980993;
  for (let index = 0; index < LOG_GAMMA_COEFFICIENTS.length; index += 1) {
    sum += LOG_GAMMA_COEFFICIENTS[index] / (x + index + 1);
  }
  const t = x + LOG_GAMMA_COEFFICIENTS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

function logCombination(n, k) {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

export function mcnemarExact(b, c) {
  if (!Number.isInteger(b) || !Number.isInteger(c) || b < 0 || c < 0) return 1;
  const n = b + c;
  if (n === 0) return 1;
  let tail = 0;
  for (let index = 0; index <= Math.min(b, c); index += 1) {
    tail += Math.exp(logCombination(n, index) - n * Math.LN2);
  }
  return Math.round(Math.min(1, 2 * tail) * 1000000) / 1000000;
}

export function holmAdjust(values) {
  const entries = values.map((value, index) => ({
    value: Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1,
    index,
  }));
  entries.sort((a, b) => a.value - b.value || a.index - b.index);
  const adjusted = new Array(entries.length);
  let running = 0;
  const total = entries.length;
  for (let rank = 0; rank < total; rank += 1) {
    running = Math.max(running, Math.min(1, entries[rank].value * (total - rank)));
    adjusted[entries[rank].index] = Math.round(running * 1000000) / 1000000;
  }
  return adjusted;
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
      items: new Map(),
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
    entry.items.set(`${run.modelId ?? ''}|${run.scenarioId ?? ''}`, passed);
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

  const highlightedRow = rows.find((row) => row.highlight) ?? null;
  if (highlightedRow) {
    const reference = contenders.get(highlightedRow.id);
    for (const row of rows) {
      const entry = contenders.get(row.id);
      let b = 0;
      let c = 0;
      for (const [key, pass] of entry.items) {
        if (!reference.items.has(key)) continue;
        const referencePass = reference.items.get(key);
        if (referencePass && !pass) b += 1;
        else if (!referencePass && pass) c += 1;
      }
      row.vsHighlight = row === highlightedRow ? null : { b, c, p: mcnemarExact(b, c) };
    }
    const rivals = rows.filter((row) => row.vsHighlight != null);
    const adjusted = holmAdjust(rivals.map((row) => row.vsHighlight.p));
    rivals.forEach((row, index) => {
      row.vsHighlight.pAdjusted = adjusted[index];
    });
  }

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

export function benchmarkSnapshot(benchmark) {
  if (!benchmark || !isTimestamp(benchmark.generatedAt)) return null;
  const highlighted = Array.isArray(benchmark.contenders) ? benchmark.contenders.find((entry) => entry && entry.highlight === true) : null;
  if (!highlighted) return null;
  return {
    date: String(benchmark.generatedAt).slice(0, 10),
    overall: highlighted.overall,
    safety: highlighted.safety ?? null,
    served: highlighted.served ?? null,
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

export function buildScenarioMatrix(report, focusById = new Map(), contenderOrder = []) {
  const runs = Array.isArray(report?.runs) ? report.runs : [];
  const order = Array.isArray(contenderOrder) ? contenderOrder : [];
  const declared = (Array.isArray(report?.models) ? report.models : [])
    .map((model) => model?.id)
    .filter((id) => typeof id === 'string' && id.length > 0);
  const modelKey = (run) => {
    if (typeof run.modelId === 'string' && run.modelId.length > 0) return run.modelId;
    return declared.length === 1 ? declared[0] : '';
  };
  const models = [...declared];
  for (const run of runs) {
    const key = modelKey(run);
    if (!models.includes(key)) models.push(key);
  }
  const columnByContender = new Map(order.map((id, index) => [id, index]));
  const scenarios = new Map();
  for (const run of runs) {
    if (typeof run.scenarioId !== 'string' || run.scenarioId.length === 0) continue;
    if (!scenarios.has(run.scenarioId)) scenarios.set(run.scenarioId, focusById.get(run.scenarioId) ?? 'core');
  }
  const rank = (focus) => {
    const index = BENCHMARK_FOCI.indexOf(focus);
    return index === -1 ? BENCHMARK_FOCI.length : index;
  };
  const scenarioIds = [...scenarios.keys()].sort((a, b) => rank(scenarios.get(a)) - rank(scenarios.get(b)) || a.localeCompare(b));
  const rowByScenario = new Map(scenarioIds.map((id, index) => [id, index]));
  const cells = scenarioIds.map(() => order.map(() => ({ passes: new Map(), runs: 0 })));
  for (const run of runs) {
    const row = rowByScenario.get(run.scenarioId);
    const column = columnByContender.get(run.contenderId);
    if (row === undefined || column === undefined) continue;
    const cell = cells[row][column];
    cell.passes.set(models.indexOf(modelKey(run)), run.pass === true);
    cell.runs += 1;
  }
  return {
    generatedAt: typeof report?.generatedAt === 'string' ? report.generatedAt : null,
    models,
    scenarios: scenarioIds.map((id) => ({ id, focus: scenarios.get(id) })),
    contenders: order,
    cells: cells.map((row) => row.map((cell) => [
      [...cell.passes.entries()].filter(([, pass]) => pass).map(([index]) => index).sort((a, b) => a - b),
      cell.runs,
    ])),
  };
}

export function scenarioMatrixMatchesBenchmark(matrix, benchmark) {
  if (!matrix || !benchmark) return false;
  if (!Array.isArray(matrix.models) || matrix.models.length === 0) return false;
  if (!Array.isArray(matrix.scenarios) || !Array.isArray(matrix.contenders) || !Array.isArray(matrix.cells)) return false;
  if (!Array.isArray(benchmark.contenders) || benchmark.contenders.length === 0) return false;
  if (matrix.generatedAt !== benchmark.generatedAt) return false;
  if (matrix.contenders.length !== benchmark.contenderCount) return false;
  if (matrix.scenarios.length !== benchmark.scenarios) return false;
  if (matrix.cells.length !== matrix.scenarios.length) return false;
  const focusCounts = Object.fromEntries(BENCHMARK_FOCI.map((focus) => [focus, 0]));
  for (const scenario of matrix.scenarios) {
    if (!scenario || !BENCHMARK_FOCI.includes(scenario.focus)) return false;
    focusCounts[scenario.focus] += 1;
  }
  for (const focus of BENCHMARK_FOCI) {
    if ((benchmark.focusCounts?.[focus] ?? 0) !== focusCounts[focus]) return false;
  }
  const passedByContender = matrix.contenders.map(() => 0);
  const runsByContender = matrix.contenders.map(() => 0);
  const passSets = matrix.contenders.map(() => []);
  for (const row of matrix.cells) {
    if (!Array.isArray(row) || row.length !== matrix.contenders.length) return false;
    for (let column = 0; column < row.length; column += 1) {
      const cell = row[column];
      if (!Array.isArray(cell) || cell.length !== 2) return false;
      const indices = cell[0];
      const cellRuns = cell[1];
      if (!Array.isArray(indices) || !Number.isInteger(cellRuns) || cellRuns < 0) return false;
      const unique = new Set();
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= matrix.models.length) return false;
        if (unique.has(index)) return false;
        unique.add(index);
      }
      if (indices.length > cellRuns) return false;
      passedByContender[column] += indices.length;
      runsByContender[column] += cellRuns;
      passSets[column].push(unique);
    }
  }
  const byId = new Map(benchmark.contenders.map((entry) => [entry?.id, entry]));
  for (let column = 0; column < matrix.contenders.length; column += 1) {
    const contender = byId.get(matrix.contenders[column]);
    if (!contender) return false;
    if (runsByContender[column] !== contender.runs) return false;
    if (passedByContender[column] !== contender.passed) return false;
  }
  const referenceColumn = matrix.contenders.findIndex((id) => byId.get(id)?.highlight === true);
  if (referenceColumn === -1) return false;
  const rivals = [];
  for (let column = 0; column < matrix.contenders.length; column += 1) {
    const contender = byId.get(matrix.contenders[column]);
    if (column === referenceColumn) {
      if (contender.vsHighlight != null) return false;
      continue;
    }
    let b = 0;
    let c = 0;
    for (let rowIndex = 0; rowIndex < passSets[column].length; rowIndex += 1) {
      const rival = passSets[column][rowIndex];
      const reference = passSets[referenceColumn][rowIndex];
      for (const index of reference) {
        if (!rival.has(index)) b += 1;
      }
      for (const index of rival) {
        if (!reference.has(index)) c += 1;
      }
    }
    const comparison = contender.vsHighlight;
    if (!comparison) return false;
    if (comparison.b !== b || comparison.c !== c) return false;
    if (typeof comparison.p !== 'number' || comparison.p !== mcnemarExact(b, c)) return false;
    rivals.push(comparison);
  }
  const adjusted = holmAdjust(rivals.map((comparison) => comparison.p));
  for (let index = 0; index < rivals.length; index += 1) {
    const stored = rivals[index].pAdjusted;
    if (!Number.isFinite(stored) || Math.abs(stored - adjusted[index]) > 0.000001) return false;
  }
  return true;
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
