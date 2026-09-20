import { el, append, link, createController } from './ui.js';

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
    'Results',
    'Pass rate by editing tool',
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
  append(legend, legendItem('meter-overall', 'overall pass rate'), legendItem('meter-safety', 'stale & drift scenarios'));
  const source = el('p', 'chart-source');
  append(source, 'Source: ', link(bench.source, 'pi-edit-benchmark'), ` · reports generated ${bench.generatedAt.slice(0, 10)}`);
  append(body, list, legend, source);
  return createController(root, (runtime) => {
    runtime.after(() => root.classList.add('is-live'), 120);
  }, () => root.classList.remove('is-live'));
}
