import { extent, formatNumber } from './numbers.js';
import { el, append, svg } from './ui.js';

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

const TABLE_LABELS = {
  date: 'date',
  stars: 'GitHub stars',
  downloads: 'installs / week',
};

function dataTable(summary, rows, caption) {
  if (rows.length === 0) return null;
  const details = el('details', 'chart-data');
  details.appendChild(el('summary', null, summary));
  const table = el('table');
  if (caption) table.appendChild(el('caption', 'sr-only', caption));
  const head = el('thead');
  const headRow = el('tr');
  for (const column of Object.keys(rows[0])) {
    const cell = el('th', null, TABLE_LABELS[column] ?? column);
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
  append(value, ' ', el('span', `growth-delta${trend}`, `${delta > 0 ? '+' : ''}${formatter(delta)}`));
  row.appendChild(value);
  return row;
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
