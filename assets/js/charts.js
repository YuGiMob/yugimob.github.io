import { el, append, link, svg, formatNumber, extent, createController } from './ui.js';

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

function meter(className, value) {
  const track = el('span', `meter-track ${className}`);
  track.setAttribute('aria-hidden', 'true');
  const fill = el('span', 'meter-fill');
  fill.style.setProperty('--pct', `${value}%`);
  track.appendChild(fill);
  return track;
}

export function sortedContenders(contenders) {
  return [...contenders].sort((a, b) => b.overall - a.overall || (b.safety ?? 0) - (a.safety ?? 0));
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

function contenderDetail(contender, bench) {
  const parts = [`${contender.overall.toFixed(1)}% overall`];
  const focusCounts = bench.focusCounts ?? {};
  if (contender.safety != null) parts.push(`${contender.safety.toFixed(1)}% on ${focusCounts.staleness ?? 0} staleness scenarios`);
  if (contender.served != null) parts.push(`${contender.served.toFixed(1)}% on ${focusCounts['served-state'] ?? 0} served-state scenarios`);
  const outcomes = contender.outcomes ?? {};
  const split = OUTCOME_ORDER.filter((kind) => outcomes[kind] > 0).map((kind) => `${formatNumber(outcomes[kind])} ${kind}`);
  if (split.length > 0) parts.push(`out of ${formatNumber(contender.runs)} runs: ${split.join(', ')}`);
  return parts.join('; ');
}

export function benchmarkChart(bench) {
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
    label.appendChild(el('span', 'sr-only', contenderDetail(contender, bench)));
    const bars = el('span', 'bench-bars');
    append(
      bars,
      meter('meter-overall', contender.overall),
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
  const method = el('p', 'chart-method', 'Real models drive each contender’s own tools through a tool-calling loop, and every row links to a committed trace. Staleness and served-state scenarios are scored separately, so refusing a stale edit is not counted against the tool.');
  const source = el('p', 'chart-source');
  append(
    source,
    'Source: ',
    link(bench.source, 'pi-edit-benchmark'),
    ' · ',
    link(bench.reportUrl, 'run report'),
    ' · ',
    link(bench.tracesUrl, 'traces'),
    ` · generated ${String(bench.generatedAt).slice(0, 10)}`
  );
  append(body, list, legend, outcomeLegend, method, source);
  return createController(root, (runtime) => {
    runtime.after(() => root.classList.add('is-live'), 120);
  }, () => root.classList.remove('is-live'));
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

function growthRow(label, values, delta) {
  const row = el('div', 'growth-row');
  row.appendChild(el('span', 'growth-label', label));
  row.appendChild(sparkline(values, label));
  const value = el('span', 'growth-value', formatNumber(values[values.length - 1]));
  const trend = delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : '';
  value.appendChild(el('span', `growth-delta${trend}`, `${delta > 0 ? '+' : ''}${formatNumber(delta)}`));
  row.appendChild(value);
  return row;
}

export function historyPanel(history) {
  const entries = history
    .filter((entry) => entry && typeof entry.date === 'string' && Number.isFinite(entry.totalStars) && Number.isFinite(entry.totalDownloads))
    .sort((a, b) => a.date.localeCompare(b.date));
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
  return root;
}
