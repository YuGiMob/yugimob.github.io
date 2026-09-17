import { el, append, link, svg, createController, formatNumber, formatRelative } from './ui.js';

function chartFrame(kicker, title, note) {
  const root = el('article', 'chart');
  const head = el('div', 'chart-head');
  append(head, el('p', 'chart-kicker', kicker), el('h3', 'chart-title', title));
  if (note) head.appendChild(el('p', 'chart-note', note));
  const body = el('div', 'chart-body');
  append(root, head, body);
  return { root, body };
}

function legendItem(className, text) {
  const item = el('span', 'legend-item');
  append(item, el('span', `legend-swatch ${className}`), el('span', 'legend-text', text));
  return item;
}

function meter(className, value) {
  const track = el('span', `meter-track ${className}`);
  const fill = el('span', 'meter-fill');
  fill.style.setProperty('--pct', `${value}%`);
  track.appendChild(fill);
  return track;
}

export function benchmarkChart(bench) {
  const { root, body } = chartFrame(
    'Evidence',
    'Which edit tool lands the edit',
    `${bench.models} models × ${bench.scenarios} scenarios × ${bench.contenderCount} contenders · ${bench.runsPerContender} runs each`,
  );
  const list = el('ul', 'bench-rows');
  const sorted = [...bench.contenders].sort((a, b) => b.overall - a.overall || b.safety - a.safety);
  for (const contender of sorted) {
    const item = el('li', `bench-row${contender.highlight ? ' is-highlight' : ''}`);
    const label = el('span', 'bench-label');
    label.appendChild(el('span', 'bench-name', contender.label));
    if (contender.highlight) label.appendChild(el('span', 'bench-flag', 'this project'));
    const bars = el('span', 'bench-bars');
    append(bars, meter('meter-overall', contender.overall), meter('meter-safety', contender.safety));
    const value = el('span', 'bench-value', `${contender.overall.toFixed(1)}%`);
    append(item, label, bars, value);
    item.title = `${contender.label} · ${contender.overall}% overall · ${contender.safety}% on stale and drift scenarios · ${contender.errors} errors`;
    list.appendChild(item);
  }
  const legend = el('p', 'chart-legend');
  append(legend, legendItem('meter-overall', 'overall correctness'), legendItem('meter-safety', 'stale & drift scenarios'));
  const source = el('p', 'chart-source');
  append(source, 'Source: ', link(bench.source, 'pi-edit-benchmark'), ` · reports generated ${bench.generatedAt.slice(0, 10)}`);
  append(body, list, legend, source);
  return createController(root, (runtime) => {
    runtime.after(() => root.classList.add('is-live'), 120);
  }, () => root.classList.remove('is-live'));
}

export function downloadsChart(projects) {
  const packages = projects
    .filter((project) => project.npm && Number.isFinite(project.npmWeeklyDownloads))
    .sort((a, b) => b.npmWeeklyDownloads - a.npmWeeklyDownloads);
  const total = packages.reduce((sum, project) => sum + project.npmWeeklyDownloads, 0);
  const { root, body } = chartFrame('Reach', 'Weekly npm installs', `${formatNumber(total)} installs across ${packages.length} packages · npm downloads API`);
  const max = Math.max(1, ...packages.map((project) => project.npmWeeklyDownloads));
  const list = el('ul', 'dl-rows');
  for (const project of packages) {
    const item = el('li', 'dl-row');
    const label = link(`https://www.npmjs.com/package/${project.npm}`, project.npm, 'dl-label');
    const track = meter('meter-downloads', (project.npmWeeklyDownloads / max) * 100);
    const value = el('span', 'dl-value', formatNumber(project.npmWeeklyDownloads));
    append(item, label, track, value);
    item.title = `${project.npm} · ${formatNumber(project.npmWeeklyDownloads)} installs in the last week`;
    list.appendChild(item);
  }
  append(body, list);
  return createController(root, (runtime) => {
    runtime.after(() => root.classList.add('is-live'), 100);
  }, () => root.classList.remove('is-live'));
}

export function historyChart(history) {
  const points = Array.isArray(history) ? [...history].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const note = points.length > 1
    ? `${points[0].date} → ${points[points.length - 1].date} · daily snapshots from the refresh workflow`
    : 'collecting daily snapshots — this chart grows with every refresh';
  const { root, body } = chartFrame('Trajectory', 'Weekly installs over time', note);
  const width = 640;
  const height = 240;
  const pad = { left: 54, right: 20, top: 24, bottom: 30 };
  const svgRoot = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'hist-svg', role: 'img', 'aria-label': 'Weekly npm installs over time' });

  const values = points.map((point) => point.totalDownloads);
  const max = Math.max(1, ...values);
  const niceMax = Math.ceil(max / 500) * 500;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const xFor = (index) => pad.left + (points.length <= 1 ? plotWidth : (index / (points.length - 1)) * plotWidth);
  const yFor = (value) => pad.top + plotHeight - (value / niceMax) * plotHeight;

  for (const fraction of [0, 0.5, 1]) {
    const y = pad.top + plotHeight * fraction;
    const line = svg('line', { x1: pad.left, y1: y, x2: width - pad.right, y2: y, class: 'hist-grid' });
    svgRoot.appendChild(line);
    const label = svg('text', { x: pad.left - 10, y: y + 4, class: 'hist-tick', 'text-anchor': 'end' });
    label.textContent = formatNumber(Math.round(niceMax * (1 - fraction)));
    svgRoot.appendChild(label);
  }

  if (points.length >= 2) {
    const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(1)} ${yFor(point.totalDownloads).toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${xFor(points.length - 1).toFixed(1)} ${pad.top + plotHeight} L ${pad.left} ${pad.top + plotHeight} Z`;
    svgRoot.appendChild(svg('path', { d: areaPath, class: 'hist-area' }));
    svgRoot.appendChild(svg('path', { d: linePath, class: 'hist-line' }));
  }

  points.forEach((point, index) => {
    const dot = svg('circle', { cx: xFor(index), cy: yFor(point.totalDownloads), r: 3.5, class: 'hist-dot' });
    const title = svg('title');
    title.textContent = `${point.date} · ${formatNumber(point.totalDownloads)} installs · ${formatNumber(point.totalStars)} stars`;
    dot.appendChild(title);
    if (points.length <= 1 || index === 0 || index === points.length - 1) svgRoot.appendChild(dot);
  });

  const firstLabel = svg('text', { x: pad.left, y: height - 8, class: 'hist-tick', 'text-anchor': 'start' });
  firstLabel.textContent = points[0]?.date ?? 'today';
  const lastLabel = svg('text', { x: width - pad.right, y: height - 8, class: 'hist-tick', 'text-anchor': 'end' });
  lastLabel.textContent = points[points.length - 1]?.date ?? 'today';
  append(svgRoot, firstLabel, lastLabel);
  body.appendChild(svgRoot);

  return createController(root, (runtime) => {
    runtime.after(() => root.classList.add('is-live'), 150);
  }, () => root.classList.remove('is-live'));
}

export function heatmapChart(activity) {
  const daily = Array.isArray(activity?.daily) ? activity.daily : [];
  const byDate = new Map(daily.map((entry) => [entry.date, entry]));
  const weeks = 18;
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - end.getUTCDay() - (weeks - 1) * 7);

  let events = 0;
  let pushes = 0;
  for (const entry of daily) {
    events += entry.events;
    pushes += entry.pushes;
  }
  const { root, body } = chartFrame('Activity', 'Public events, last 18 weeks', `${formatNumber(events)} events · ${formatNumber(pushes)} pushes · window ${activity?.window ?? 'n/a'}`);

  const wrap = el('div', 'hm-wrap');
  const grid = el('div', 'hm-grid');
  for (let week = 0; week < weeks; week += 1) {
    const column = el('div', 'hm-week');
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + week * 7 + day);
      const key = date.toISOString().slice(0, 10);
      const entry = byDate.get(key);
      const count = entry ? entry.events : 0;
      const level = count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : 3;
      const cell = el('span', `hm-cell level-${level}`);
      cell.style.setProperty('--d', `${(week * 7 + day) * 5}ms`);
      cell.title = `${key} · ${count} event${count === 1 ? '' : 's'}${entry ? ` · ${entry.pushes} push${entry.pushes === 1 ? '' : 'es'}` : ''}`;
      if (date > end) cell.classList.add('is-future');
      column.appendChild(cell);
    }
    grid.appendChild(column);
  }
  const legend = el('p', 'hm-legend');
  append(legend, el('span', 'hm-legend-text', 'less'), el('span', 'hm-cell level-0'), el('span', 'hm-cell level-1'), el('span', 'hm-cell level-2'), el('span', 'hm-cell level-3'), el('span', 'hm-legend-text', 'more'));
  append(wrap, grid, legend);

  const deeds = el('ul', 'hm-deeds');
  const highlights = Array.isArray(activity?.highlights) ? activity.highlights : [];
  for (const highlight of highlights) deeds.appendChild(el('li', 'hm-deed', highlight));
  if (highlights.length === 0) deeds.appendChild(el('li', 'hm-deed is-empty', 'No notable deeds this window.'));
  const deedsTitle = el('p', 'hm-deeds-title', `Latest deeds · updated ${activity?.fetchedAt ?? 'n/a'}`);
  const deedsBox = el('div', 'hm-deeds-box');
  append(deedsBox, deedsTitle, deeds);
  append(body, wrap, deedsBox);

  return createController(root, (runtime) => {
    runtime.after(() => root.classList.add('is-live'), 180);
  }, () => root.classList.remove('is-live'));
}

export function freshnessChart(projects) {
  const rows = projects
    .filter((project) => project.pushedAt)
    .sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt));
  const now = Date.now();
  const { root, body } = chartFrame('Cadence', 'Last shipped', 'Days since the last push, per repository · GitHub API');
  const list = el('ul', 'fresh-rows');
  for (const project of rows) {
    const days = Math.max(0, Math.floor((now - new Date(project.pushedAt).getTime()) / 86400000));
    const recency = Math.max(0.04, Math.min(1, 1 - days / 60));
    const item = el('li', `fresh-row${days <= 7 ? ' is-fresh' : ''}`);
    item.appendChild(el('span', 'fresh-label', project.name));
    item.appendChild(meter('meter-fresh', recency * 100));
    item.appendChild(el('span', 'fresh-value', formatRelative(project.pushedAt, now)));
    item.title = `${project.name} · last push ${project.pushedAt}`;
    list.appendChild(item);
  }
  append(body, list);
  return createController(root, (runtime) => {
    runtime.after(() => root.classList.add('is-live'), 100);
  }, () => root.classList.remove('is-live'));
}
