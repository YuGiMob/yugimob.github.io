import { el, append, link, svg, formatNumber, extent, createController } from './ui.js';
import { isValidBenchmarkMatrix } from './site-data.js';

function chartFrame(kicker, title, note) {
  const root = el('article', 'chart');
  const head = el('div');
  append(head, el('p', 'chart-kicker', kicker), el('h3', 'chart-title', title));
  if (note) head.appendChild(el('p', 'chart-note', note));
  const body = el('div', 'chart-body');
  append(root, head, body);
  return { root, body };
}

function legendItem(className, text) {
  const item = el('span', 'legend-item');
  append(item, el('span', `legend-swatch ${className}`), el('span', null, text));
  return item;
}

function meter(className, value, range) {
  const track = el('span', `meter-track ${className}`);
  track.setAttribute('aria-hidden', 'true');
  const fill = el('span', 'meter-fill');
  fill.style.setProperty('--pct', `${value}%`);
  track.appendChild(fill);
  if (range) {
    const whisker = el('span', 'meter-whisker');
    whisker.style.setProperty('--low', `${range.low}%`);
    whisker.style.setProperty('--high', `${range.high}%`);
    track.appendChild(whisker);
  }
  return track;
}

export function sortedContenders(contenders) {
  return [...contenders].sort((a, b) => b.overall - a.overall || (b.safety ?? 0) - (a.safety ?? 0));
}

export function benchmarkTableRows(bench) {
  return sortedContenders(bench.contenders).map((contender) => ({
    tool: contender.label,
    version: contender.version ?? '',
    overall: `${contender.overall.toFixed(1)}%`,
    safety: contender.safety == null ? '—' : `${contender.safety.toFixed(1)}%`,
    served: contender.served == null ? '—' : `${contender.served.toFixed(1)}%`,
    interval: `${contender.low.toFixed(1)}–${contender.high.toFixed(1)}`,
    runs: formatNumber(contender.runs),
    passed: formatNumber(contender.passed),
    errors: formatNumber(contender.errors),
  }));
}

function historyEntries(history) {
  return (Array.isArray(history) ? history : [])
    .filter((entry) => entry && typeof entry.date === 'string' && Number.isFinite(entry.totalStars) && Number.isFinite(entry.totalDownloads))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function historyTableRows(history) {
  return historyEntries(history).map((entry) => ({
    date: entry.date,
    stars: formatNumber(entry.totalStars),
    downloads: formatNumber(entry.totalDownloads),
  }));
}

function dataTable(summary, rows, caption) {
  if (rows.length === 0) return null;
  const details = el('details', 'chart-data');
  details.appendChild(el('summary', null, summary));
  const table = el('table');
  if (caption) table.appendChild(el('caption', 'sr-only', caption));
  const head = el('thead');
  const headRow = el('tr');
  for (const column of Object.keys(rows[0])) {
    const cell = el('th', null, column);
    cell.setAttribute('scope', 'col');
    headRow.appendChild(cell);
  }
  head.appendChild(headRow);
  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    for (const value of Object.values(row)) tr.appendChild(el('td', null, value));
    body.appendChild(tr);
  }
  append(table, head, body);
  details.appendChild(table);
  return details;
}

const OUTCOME_ORDER = ['applied', 'recovered', 'rejected', 'error', 'undo', 'noop'];

function outcomeStrip(contender) {
  const strip = el('span', 'bench-outcomes');
  const outcomes = contender.outcomes ?? {};
  const total = OUTCOME_ORDER.reduce((sum, kind) => sum + (outcomes[kind] ?? 0), 0);
  if (total === 0) return strip;
  for (const kind of OUTCOME_ORDER) {
    const count = outcomes[kind] ?? 0;
    if (count === 0) continue;
    const segment = el('span', `outcome-segment is-${kind}`);
    segment.style.setProperty('--share', String(count));
    segment.title = `${formatNumber(count)} ${kind}`;
    strip.appendChild(segment);
  }
  strip.setAttribute('aria-hidden', 'true');
  return strip;
}

function pLabel(value) {
  return value < 0.001 ? '< 0.001' : value.toFixed(3);
}

function adjustedP(comparison) {
  return Number.isFinite(comparison?.pAdjusted) ? comparison.pAdjusted : comparison.p;
}

function highlightOf(bench) {
  return (bench.contenders ?? []).find((entry) => entry?.highlight === true) ?? null;
}

function comparisonSentence(contender, bench) {
  const comparison = contender.vsHighlight;
  if (comparison == null) return null;
  const reference = highlightOf(bench);
  const verdict = adjustedP(comparison) < 0.05 ? 'significantly different from' : 'not significantly different from';
  return `${verdict} ${reference?.label ?? 'the highlighted tool'} (Holm-adjusted McNemar p = ${pLabel(adjustedP(comparison))})`;
}

function significanceNote(bench) {
  const reference = highlightOf(bench);
  if (!reference) return null;
  const rival = sortedContenders(bench.contenders).find((entry) => entry !== reference && entry?.vsHighlight != null);
  if (!rival) return null;
  const gap = Math.abs(reference.overall - rival.overall).toFixed(1);
  const verdict = adjustedP(rival.vsHighlight) < 0.05 ? 'a significant paired difference' : 'not a significant paired difference';
  const p = `(Holm-adjusted McNemar p ${pLabel(adjustedP(rival.vsHighlight))})`;
  if (gap === '0.0') return `${reference.label} and ${rival.label} are tied on overall pass rate; the paired difference is ${verdict} ${p}.`;
  const direction = reference.overall > rival.overall ? 'leads' : 'trails';
  return `${reference.label} ${direction} ${rival.label} by ${gap} points on the same model × scenario pairs — ${verdict} ${p}.`;
}

function contenderDetail(contender, bench) {
  const parts = [`${contender.overall.toFixed(1)}% overall`];
  const focusCounts = bench.focusCounts ?? {};
  if (contender.safety != null) parts.push(`${contender.safety.toFixed(1)}% on ${focusCounts.staleness ?? 0} staleness scenarios`);
  if (contender.served != null) parts.push(`${contender.served.toFixed(1)}% on ${focusCounts['served-state'] ?? 0} served-state scenarios`);
  const outcomes = contender.outcomes ?? {};
  const split = OUTCOME_ORDER.filter((kind) => outcomes[kind] > 0).map((kind) => `${formatNumber(outcomes[kind])} ${kind}`);
  if (split.length > 0) parts.push(`out of ${formatNumber(contender.runs)} runs: ${split.join(', ')}`);
  const comparison = comparisonSentence(contender, bench);
  if (comparison) parts.push(comparison);
  return parts.join('; ');
}

export function benchmarkChart(bench, benchmarkHistory) {
  const cost = Number.isFinite(bench.costUsd) ? ` · $${bench.costUsd.toFixed(2)} in API cost` : '';
  const { root, body } = chartFrame(
    'Results',
    'Pass rate by editing tool',
    `${bench.models} models × ${bench.scenarios} scenarios × ${bench.contenderCount} contenders · ${bench.runsPerContender} runs each · ${formatNumber(bench.totalRuns)} runs${cost}`
  );
  const list = el('ul', 'bench-rows');
  for (const contender of sortedContenders(bench.contenders)) {
    const item = el('li', `bench-row${contender.highlight ? ' is-highlight' : ''}`);
    const label = el('span', 'bench-label');
    label.appendChild(el('span', 'bench-name', contender.label));
    if (contender.version) label.appendChild(el('span', 'bench-version', `v${contender.version}`));
    if (contender.highlight) label.appendChild(el('span', 'bench-flag', 'this project'));
    if (contender.traceUrl) {
      const trace = link(contender.traceUrl, 'trace', 'bench-trace');
      trace.setAttribute('aria-label', `committed run trace for ${contender.label}`);
      label.appendChild(trace);
    }
    if (contender.errors > 0) label.appendChild(el('span', 'bench-errors', `${contender.errors} ${contender.errors === 1 ? 'error' : 'errors'}`));
    if (contender.vsHighlight != null) {
      const badge = el('span', 'bench-significance', `p=${pLabel(adjustedP(contender.vsHighlight))}`);
      badge.title = `Holm-adjusted exact McNemar test against ${highlightOf(bench)?.label ?? 'the highlighted tool'}: ${formatNumber(contender.vsHighlight.b)} pairs it passed and this tool did not, ${formatNumber(contender.vsHighlight.c)} the other way (raw p ${pLabel(contender.vsHighlight.p)})`;
      label.appendChild(badge);
    }
    label.appendChild(el('span', 'sr-only', contenderDetail(contender, bench)));
    const bars = el('span', 'bench-bars');
    append(
      bars,
      meter('meter-overall', contender.overall, { low: contender.low, high: contender.high }),
      meter('meter-safety', contender.safety ?? 0),
      meter('meter-served', contender.served ?? 0),
      outcomeStrip(contender),
    );
    const value = el('span', 'bench-value');
    value.appendChild(el('span', 'bench-rate', `${contender.overall.toFixed(1)}%`));
    const interval = el('span', 'bench-interval', `${contender.low.toFixed(1)}–${contender.high.toFixed(1)}`);
    interval.title = '95% confidence interval';
    value.appendChild(interval);
    append(item, label, bars, value);
    list.appendChild(item);
  }
  const present = OUTCOME_ORDER.filter((kind) => bench.contenders.some((entry) => (entry.outcomes?.[kind] ?? 0) > 0));
  const legend = el('p', 'chart-legend');
  append(
    legend,
    legendItem('meter-overall', 'overall pass rate'),
    legendItem('meter-safety', `staleness (${bench.focusCounts?.staleness ?? 0})`),
    legendItem('meter-served', `served state (${bench.focusCounts?.['served-state'] ?? 0})`),
  );
  const outcomeLegend = el('p', 'chart-legend');
  for (const kind of present) outcomeLegend.appendChild(legendItem(`outcome-segment is-${kind}`, kind));
  const method = el('p', 'chart-method', 'Real models drive each contender’s own tools through a tool-calling loop, and every row links to a committed trace. Staleness and served-state scenarios are scored separately, so refusing a stale edit is not counted against the tool. Each rival is paired with the highlighted project on the shared model × scenario grid, and the exact two-sided McNemar p-values are Holm-adjusted across the comparisons.');
  const source = el('p', 'chart-source');
  append(
    source,
    'Source: ',
    link(bench.source, 'pi-edit-benchmark'),
    ' · ',
    link(bench.reportUrl, 'run report'),
    ' · ',
    link(bench.tracesUrl, 'traces'),
    ' · ',
    link('data/site-data.json', 'raw data'),
    ` · generated ${String(bench.generatedAt).slice(0, 10)}`
  );
  const note = significanceNote(bench);
  const noteNode = note ? el('p', 'chart-note bench-significance-note', note) : null;
  append(body, list, legend, outcomeLegend, noteNode, method, source);
  const trend = benchmarkTrend(benchmarkHistory);
  if (trend) body.appendChild(trend);
  const table = dataTable('View the numbers as a table', benchmarkTableRows(bench), 'Pass rate, staleness, served state, interval, and run counts per contender.');
  if (table) body.appendChild(table);
  return createController(root, (runtime) => {
    runtime.after(() => root.classList.add('is-live'), 120);
  }, () => root.classList.remove('is-live'));
}

function matrixCellClass(passed, runs) {
  if (runs === 0) return 'matrix-cell is-empty';
  if (passed === runs) return 'matrix-cell is-full';
  if (passed === 0) return 'matrix-cell is-none';
  return 'matrix-cell is-partial';
}

export function benchmarkMatrix(bench, matrix) {
  if (!isValidBenchmarkMatrix(matrix)) return null;
  const labels = new Map((bench.contenders ?? []).map((entry) => [entry.id, entry.label]));
  const { root, body } = chartFrame(
    'Per scenario',
    'Where each tool loses',
    `${matrix.scenarios.length} scenarios × ${matrix.contenders.length} contenders; every cell counts the models that passed, out of the runs recorded.`
  );
  const scroll = el('div', 'matrix-scroll');
  const table = el('table', 'matrix-table');
  table.appendChild(el('caption', 'sr-only', 'Models that passed per scenario and contender.'));
  const head = el('thead');
  const headRow = el('tr');
  const scenarioHeader = el('th', 'matrix-scenario', 'scenario');
  scenarioHeader.setAttribute('scope', 'col');
  headRow.appendChild(scenarioHeader);
  for (const id of matrix.contenders) {
    const header = el('th', 'matrix-contender', labels.get(id) ?? id);
    header.setAttribute('scope', 'col');
    headRow.appendChild(header);
  }
  head.appendChild(headRow);
  const rows = el('tbody');
  matrix.scenarios.forEach((scenario, rowIndex) => {
    const row = el('tr');
    const heading = el('th', 'matrix-scenario');
    heading.setAttribute('scope', 'row');
    append(heading, el('span', 'matrix-id', scenario.id), el('span', 'matrix-focus', scenario.focus));
    row.appendChild(heading);
    const cells = Array.isArray(matrix.cells[rowIndex]) ? matrix.cells[rowIndex] : [];
    matrix.contenders.forEach((id, column) => {
      const cell = Array.isArray(cells[column]) ? cells[column] : [[], 0];
      const passedModels = Array.isArray(cell[0]) ? cell[0] : [];
      const runs = Number.isInteger(cell[1]) ? cell[1] : 0;
      const passed = passedModels.length;
      const node = el('td', matrixCellClass(passed, runs));
      append(node, runs > 0 ? `${passed}/${runs}` : '—');
      if (runs > 0) node.appendChild(el('span', 'sr-only', ` for ${labels.get(id) ?? id}`));
      node.title = `${labels.get(id) ?? id} on ${scenario.id}: ${passed} of ${runs} runs passed`;
      row.appendChild(node);
    });
    rows.appendChild(row);
  });
  append(table, head, rows);
  scroll.appendChild(table);
  const highlighted = (bench.contenders ?? []).find((entry) => entry.highlight === true) ?? null;
  const highlightColumn = highlighted ? matrix.contenders.indexOf(highlighted.id) : -1;
  const losses = [];
  if (highlightColumn >= 0) {
    matrix.scenarios.forEach((scenario, rowIndex) => {
      const cells = Array.isArray(matrix.cells[rowIndex]) ? matrix.cells[rowIndex] : [];
      const cell = Array.isArray(cells[highlightColumn]) ? cells[highlightColumn] : [[], 0];
      const passed = Array.isArray(cell[0]) ? cell[0].length : 0;
      const runs = Number.isInteger(cell[1]) ? cell[1] : 0;
      if (runs > 0 && passed < runs) losses.push(`${scenario.id} (${passed}/${runs})`);
    });
  }
  const lossNote = highlighted && highlightColumn >= 0
    ? losses.length > 0
      ? `${highlighted.label} does not sweep every scenario: ${losses.join(', ')}.`
      : `${highlighted.label} passes every recorded run in every scenario.`
    : null;
  append(
    body,
    scroll,
    el('p', 'chart-note', 'A full cell means every recorded model passed that scenario; an empty row means the scenario never reached the contender. The matrix is the same run set as the chart above.'),
    lossNote ? el('p', 'chart-note', lossNote) : null,
  );
  return createController(root, () => {});
}

export function sparklinePoints(values, width = 120, height = 28) {
  const series = values.length > 1 ? values : [values[0], values[0]];
  const [min, max] = extent(series);
  const span = max - min || 1;
  const step = width / (series.length - 1);
  return series
    .map((value, index) => `${(index * step).toFixed(1)} ${(height - 2 - ((value - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ');
}

function sparkline(values, label) {
  const width = 120;
  const height = 28;
  const points = sparklinePoints(values, width, height);
  const node = svg('svg', {
    class: 'growth-spark',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `${label}: ${values.length} snapshots, from ${formatNumber(values[0])} to ${formatNumber(values[values.length - 1])}`,
  });
  node.appendChild(svg('polyline', { class: 'growth-line', points, fill: 'none' }));
  return node;
}

function growthRow(label, values, delta, formatter = formatNumber) {
  const row = el('div', 'growth-row');
  row.appendChild(el('span', 'growth-label', label));
  row.appendChild(sparkline(values, label));
  const value = el('span', 'growth-value', formatter(values[values.length - 1]));
  const trend = delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : '';
  value.appendChild(el('span', `growth-delta${trend}`, `${delta > 0 ? '+' : ''}${formatter(delta)}`));
  row.appendChild(value);
  return row;
}

export function benchmarkTrend(history) {
  const entries = (Array.isArray(history) ? history : [])
    .filter((entry) => entry && typeof entry.date === 'string' && Number.isFinite(entry.overall))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (entries.length < 2) return null;
  const percent = (value) => `${value.toFixed(1)}%`;
  const first = entries[0];
  const last = entries[entries.length - 1];
  const root = el('section', 'growth bench-trend');
  root.appendChild(el('p', 'chart-kicker', 'Collected daily'));
  root.appendChild(el('h3', 'chart-title', 'The project’s own pass rate'));
  const rows = el('div', 'growth-rows');
  rows.appendChild(growthRow('overall', entries.map((entry) => entry.overall), last.overall - first.overall, percent));
  const safety = entries.filter((entry) => Number.isFinite(entry.safety));
  if (safety.length >= 2) {
    rows.appendChild(growthRow('staleness', safety.map((entry) => entry.safety), safety[safety.length - 1].safety - safety[0].safety, percent));
  }
  const served = entries.filter((entry) => Number.isFinite(entry.served));
  if (served.length >= 2) {
    rows.appendChild(growthRow('served state', served.map((entry) => entry.served), served[served.length - 1].served - served[0].served, percent));
  }
  root.appendChild(rows);
  root.appendChild(el('p', 'chart-note', `${entries.length} benchmark reports since ${first.date}`));
  return root;
}

export function historyPanel(history) {
  const entries = historyEntries(history);
  if (entries.length === 0) return null;
  const root = el('section', 'growth');
  const first = entries[0];
  const last = entries[entries.length - 1];
  root.appendChild(el('p', 'chart-kicker', 'Collected daily'));
  root.appendChild(el('h3', 'chart-title', 'Since the first snapshot'));
  const rows = el('div', 'growth-rows');
  rows.appendChild(growthRow('GitHub stars', entries.map((entry) => entry.totalStars), last.totalStars - first.totalStars));
  rows.appendChild(growthRow('Installs / week', entries.map((entry) => entry.totalDownloads), last.totalDownloads - first.totalDownloads));
  root.appendChild(rows);
  const count = entries.length === 1 ? '1 snapshot' : `${entries.length} snapshots`;
  root.appendChild(el('p', 'chart-note', `${count} since ${first.date}`));
  const table = dataTable('View the snapshots as a table', historyTableRows(entries), 'Total stars and weekly installs per snapshot date.');
  if (table) root.appendChild(table);
  return root;
}
