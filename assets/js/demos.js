import { el, append, createController, reducedMotion, svg, announce } from './ui.js';

const ANCHOR_LINE = /^([-+ ]?)([A-Za-z0-9]{4})(│)(.*)$/;
const GREP_LINE = /^(\d+[:-]│)\s([A-Za-z0-9]{4})(│)(.*)$/;

function frame(title, badge) {
  const root = el('div', 'demo');
  const bar = el('div', 'demo-bar');
  append(bar, el('span', null, title));
  if (badge) bar.appendChild(el('span', 'demo-badge', badge));
  const stage = el('div', 'demo-stage');
  append(root, bar, stage);
  return { root, stage };
}

function press(label, className) {
  const button = el('button', className ? `demo-button ${className}` : 'demo-button', label);
  button.type = 'button';
  return button;
}

function lineRow(spec) {
  const classes = ['term-line', spec.wrap ? 'is-prose' : 'is-code'];
  if (spec.kind) classes.push(`is-${spec.kind}`);
  if (spec.cls) classes.push(spec.cls);
  const row = el('div', classes.join(' '));
  if (spec.kind === 'call' && !spec.text.startsWith('$')) {
    const marker = el('span', 'term-marker', '▸');
    marker.setAttribute('aria-hidden', 'true');
    append(row, marker, ' ');
  }
  const grep = spec.kind === 'file' ? GREP_LINE.exec(spec.text) : null;
  const parts = grep ? null : spec.kind === 'file' ? ANCHOR_LINE.exec(spec.text) : null;
  if (grep) {
    append(
      row,
      el('span', 'term-gutter', grep[1]),
      ' ',
      el('span', 'term-anchor', grep[2]),
      el('span', 'term-bar', grep[3]),
      el('span', 'term-code', grep[4]),
    );
  } else if (parts) {
    append(
      row,
      el('span', 'term-sign', parts[1]),
      el('span', 'term-anchor', parts[2]),
      el('span', 'term-bar', parts[3]),
      el('span', 'term-code', parts[4]),
    );
  } else {
    row.appendChild(el('span', null, spec.text));
  }
  return row;
}

function renderLines(body, lines, count) {
  body.replaceChildren();
  for (let index = 0; index < count && index < lines.length; index += 1) {
    body.appendChild(lineRow(lines[index]));
  }
  body.scrollTop = body.scrollHeight;
}

function transcript(root, stage, lines) {
  const body = el('div', 'term-body');
  body.setAttribute('role', 'group');
  body.setAttribute('aria-label', 'Transcript');
  const actions = el('div', 'term-actions');
  const replay = press('replay');
  replay.setAttribute('aria-label', 'Replay the transcript');
  actions.appendChild(replay);
  append(stage, body, actions);

  let runtimeRef = null;

  const render = (count) => renderLines(body, lines, count);

  const play = (announceRun) => {
    if (!runtimeRef) return;
    runtimeRef.reset();
    render(0);
    if (reducedMotion()) {
      render(lines.length);
      if (announceRun) announce('transcript complete');
      return;
    }
    if (announceRun) announce('replaying the run');
    lines.forEach((spec, index) => {
      const last = index === lines.length - 1;
      runtimeRef.after(() => {
        render(index + 1);
        if (last && announceRun) announce('transcript complete');
      }, 220 + index * (spec.pause ?? 520));
    });
  };

  replay.addEventListener('click', () => play(true));
  render(lines.length);

  return createController(root, (runtime) => {
    runtimeRef = runtime;
  }, () => {
    runtimeRef = null;
    render(lines.length);
  });
}

function consoleDemo(root, stage, scenarios) {
  const tabs = el('div', 'term-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Hashline tools');
  const bodyId = 'hashline-transcript';
  const body = el('div', 'term-body');
  body.id = bodyId;
  body.setAttribute('role', 'tabpanel');
  body.setAttribute('aria-label', 'Transcript');
  const actions = el('div', 'term-actions');
  const replay = press('replay');
  replay.setAttribute('aria-label', 'Replay the transcript');
  actions.appendChild(replay);
  append(stage, tabs, body, actions);

  let runtimeRef = null;
  let active = 0;

  function select(index, announceRun) {
    active = index;
    tabButtons.forEach((tab, position) => {
      const current = position === active;
      tab.classList.toggle('is-current', current);
      tab.setAttribute('aria-selected', String(current));
      tab.tabIndex = current ? 0 : -1;
    });
    renderLines(body, scenarios[active].lines, scenarios[active].lines.length);
    if (announceRun) announce(`${scenarios[active].label} selected`);
  }

  const tabButtons = scenarios.map((scenario, index) => {
    const tab = el('button', 'term-tab', scenario.label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', bodyId);
    tab.addEventListener('click', () => select(index, false));
    tabs.appendChild(tab);
    return tab;
  });

  tabs.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (event.key === 'Home') select(0, true);
    else if (event.key === 'End') select(scenarios.length - 1, true);
    else if (step !== 0) select((active + step + scenarios.length) % scenarios.length, true);
    else return;
    event.preventDefault();
    tabButtons[active].focus();
  });

  const play = (announceRun) => {
    if (!runtimeRef) return;
    const lines = scenarios[active].lines;
    runtimeRef.reset();
    renderLines(body, lines, 0);
    if (reducedMotion()) {
      renderLines(body, lines, lines.length);
      if (announceRun) announce('transcript complete');
      return;
    }
    if (announceRun) announce('replaying the run');
    lines.forEach((spec, index) => {
      const last = index === lines.length - 1;
      runtimeRef.after(() => {
        renderLines(body, lines, index + 1);
        if (last && announceRun) announce('transcript complete');
      }, 220 + index * (spec.pause ?? 520));
    });
  };

  replay.addEventListener('click', () => play(true));
  select(0, false);

  return createController(root, (runtime) => {
    runtimeRef = runtime;
  }, () => {
    runtimeRef = null;
    renderLines(body, scenarios[active].lines, scenarios[active].lines.length);
  });
}

const GREET_ROWS = [
  { text: 'Dafo│export function greet(name: string) {', kind: 'file' },
  { text: 'Emno│  return `hello ${name}`', kind: 'file' },
  { text: 'HDtm│}', kind: 'file' },
];

function greetRead() {
  return [{ text: 'read { "path": "src/greet.ts" }', kind: 'call' }, ...GREET_ROWS];
}

function hashlineDemo() {
  const { root, stage } = frame('one anchor per line', 'eight tools');
  return consoleDemo(root, stage, [
    {
      label: 'read',
      lines: [
        { text: 'the entry point: every served row is a line with its own anchor', cls: 'is-dim', wrap: true },
        { text: 'read { "path": "src/greet.ts", "limit": 2 }', kind: 'call' },
        { text: 'Dafo│export function greet(name: string) {', kind: 'file' },
        { text: 'Emno│  return `hello ${name}`', kind: 'file' },
        { text: '[Showing lines 1-2 of 3. Use offset=HDtm to continue.]', cls: 'is-dim', wrap: true },
        { text: 'read { "path": "src/greet.ts", "offset": "HDtm" }', pause: 700, kind: 'call' },
        { text: 'HDtm│}', kind: 'file' },
      ],
    },
    {
      label: 'replace',
      lines: [
        { text: 'change a line by anchor; the diff returns the anchors the next edit uses', cls: 'is-dim', wrap: true },
        ...greetRead(),
        { text: 'replace {', pause: 700, kind: 'call' },
        { text: '  "remove_from": "Emno",', kind: 'arg' },
        { text: '  "remove_to": "Emno",', kind: 'arg' },
        { text: '  "text": "  return `hi ${name}`"', kind: 'arg' },
        { text: '}', kind: 'arg' },
        { text: '-Emno│  return `hello ${name}`', cls: 'is-err', kind: 'file' },
        { text: '+Qwer│  return `hi ${name}`', cls: 'is-ok', kind: 'file' },
        { text: ' HDtm│}', kind: 'file' },
        { text: 'replace {', pause: 700, kind: 'call' },
        { text: '  "remove_from": "Qwer",', kind: 'arg' },
        { text: '  "remove_to": "Qwer",', kind: 'arg' },
        { text: '  "text": "  return `hi ${name}!`"', kind: 'arg' },
        { text: '}', kind: 'arg' },
        { text: '-Qwer│  return `hi ${name}`', cls: 'is-err', kind: 'file' },
        { text: '+Rskm│  return `hi ${name}!`', cls: 'is-ok', kind: 'file' },
        { text: ' HDtm│}', kind: 'file' },
      ],
    },
    {
      label: 'replace_match',
      lines: [
        { text: 'quote only the part that changes; everything else stays untouched', cls: 'is-dim', wrap: true },
        ...greetRead(),
        { text: 'replace_match {', pause: 700, kind: 'call' },
        { text: '  "replace_from": "Emno",', kind: 'arg' },
        { text: '  "replace_to": "Emno",', kind: 'arg' },
        { text: '  "old_string": "hello",', kind: 'arg' },
        { text: '  "new_string": "hi"', kind: 'arg' },
        { text: '}', kind: 'arg' },
        { text: '-Emno│  return `hello ${name}`', cls: 'is-err', kind: 'file' },
        { text: '+Qwer│  return `hi ${name}`', cls: 'is-ok', kind: 'file' },
        { text: ' HDtm│}', kind: 'file' },
      ],
    },
    {
      label: 'insert',
      lines: [
        { text: 'add lines next to an anchor, then edit the anchors the diff returns', cls: 'is-dim', wrap: true },
        ...greetRead(),
        { text: 'insert {', pause: 700, kind: 'call' },
        { text: '  "anchor": "Emno",', kind: 'arg' },
        { text: '  "direction": "before",', kind: 'arg' },
        { text: '  "text": "  const trimmed = name.trim()"', kind: 'arg' },
        { text: '}', kind: 'arg' },
        { text: ' Dafo│export function greet(name: string) {', kind: 'file' },
        { text: '+Qwer│  const trimmed = name.trim()', cls: 'is-ok', kind: 'file' },
        { text: ' Emno│  return `hello ${name}`', kind: 'file' },
        { text: ' HDtm│}', kind: 'file' },
        { text: 'replace {', pause: 700, kind: 'call' },
        { text: '  "remove_from": "Emno",', kind: 'arg' },
        { text: '  "remove_to": "Emno",', kind: 'arg' },
        { text: '  "text": "  return `hello ${trimmed}`"', kind: 'arg' },
        { text: '}', kind: 'arg' },
        { text: '-Emno│  return `hello ${name}`', cls: 'is-err', kind: 'file' },
        { text: '+Rskm│  return `hello ${trimmed}`', cls: 'is-ok', kind: 'file' },
        { text: ' HDtm│}', kind: 'file' },
      ],
    },
    {
      label: 'copy',
      lines: [
        { text: 'reuse a block in another file; the source stays in place', cls: 'is-dim', wrap: true },
        ...greetRead(),
        { text: 'read { "path": "src/welcome.ts" }', pause: 700, kind: 'call' },
        { text: 'Abra│export function welcome(name: string) {', kind: 'file' },
        { text: 'Wqvt│  return name', kind: 'file' },
        { text: 'Zxmb│}', kind: 'file' },
        { text: 'copy {', pause: 700, kind: 'call' },
        { text: '  "source_from": "Emno",', kind: 'arg' },
        { text: '  "source_to": "Emno",', kind: 'arg' },
        { text: '  "anchor": "Wqvt",', kind: 'arg' },
        { text: '  "direction": "before"', kind: 'arg' },
        { text: '}', kind: 'arg' },
        { text: '=== src/welcome.ts ===', cls: 'is-dim' },
        { text: ' Abra│export function welcome(name: string) {', kind: 'file' },
        { text: '+Qwer│  return `hello ${name}`', cls: 'is-ok', kind: 'file' },
        { text: ' Wqvt│  return name', kind: 'file' },
        { text: ' Zxmb│}', kind: 'file' },
      ],
    },
    {
      label: 'move',
      lines: [
        { text: 'relocate a block in one call; the lines between the source and the target stay', cls: 'is-dim', wrap: true },
        { text: 'read { "path": "src/greet.ts" }', kind: 'call' },
        { text: 'Dafo│export function greet(name: string) {', kind: 'file' },
        { text: 'Emno│  return `hello ${name}`', kind: 'file' },
        { text: 'HDtm│}', kind: 'file' },
        { text: 'Kqla│', kind: 'file' },
        { text: 'Xkbn│export function shout(name: string) {', kind: 'file' },
        { text: 'Wqst│  return greet(name).toUpperCase()', kind: 'file' },
        { text: 'Zxma│}', kind: 'file' },
        { text: 'move {', pause: 700, kind: 'call' },
        { text: '  "source_from": "Dafo",', kind: 'arg' },
        { text: '  "source_to": "HDtm",', kind: 'arg' },
        { text: '  "anchor": "Zxma",', kind: 'arg' },
        { text: '  "direction": "after"', kind: 'arg' },
        { text: '}', kind: 'arg' },
        { text: '-Dafo│export function greet(name: string) {', cls: 'is-err', kind: 'file' },
        { text: '-Emno│  return `hello ${name}`', cls: 'is-err', kind: 'file' },
        { text: '-HDtm│}', cls: 'is-err', kind: 'file' },
        { text: ' Kqla│', kind: 'file' },
        { text: ' Xkbn│export function shout(name: string) {', kind: 'file' },
        { text: ' Wqst│  return greet(name).toUpperCase()', kind: 'file' },
        { text: ' Zxma│}', kind: 'file' },
        { text: '+Dafo│export function greet(name: string) {', cls: 'is-ok', kind: 'file' },
        { text: '+Emno│  return `hello ${name}`', cls: 'is-ok', kind: 'file' },
        { text: '+HDtm│}', cls: 'is-ok', kind: 'file' },
      ],
    },
    {
      label: 'grep',
      lines: [
        { text: 'find every hit, then edit the served rows in one message', cls: 'is-dim', wrap: true },
        { text: 'grep { "pattern": "hello", "path": "src", "glob": "*.ts" }', kind: 'call' },
        { text: '=== src/greet.ts ===', cls: 'is-dim' },
        { text: '2:│ Emno│  return `hello ${name}`', kind: 'file' },
        { text: '6:│ Wqst│  return `hello there`', kind: 'file' },
        { text: 'replace_match {', pause: 700, kind: 'call' },
        { text: '  "replace_from": "Emno",', kind: 'arg' },
        { text: '  "replace_to": "Emno",', kind: 'arg' },
        { text: '  "old_string": "hello",', kind: 'arg' },
        { text: '  "new_string": "hi"', kind: 'arg' },
        { text: '}', kind: 'arg' },
        { text: 'replace_match {', pause: 700, kind: 'call' },
        { text: '  "replace_from": "Wqst",', kind: 'arg' },
        { text: '  "replace_to": "Wqst",', kind: 'arg' },
        { text: '  "old_string": "hello",', kind: 'arg' },
        { text: '  "new_string": "hi"', kind: 'arg' },
        { text: '}', kind: 'arg' },
        { text: 'In batch 1 (queued)', cls: 'is-dim', wrap: true },
        { text: 'batch 1: combined diff', cls: 'is-dim' },
        { text: '-Emno│  return `hello ${name}`', cls: 'is-err', kind: 'file' },
        { text: '+Qwer│  return `hi ${name}`', cls: 'is-ok', kind: 'file' },
        { text: '-Wqst│  return `hello there`', cls: 'is-err', kind: 'file' },
        { text: '+Rskm│  return `hi there`', cls: 'is-ok', kind: 'file' },
      ],
    },
    {
      label: 'undo_last_change',
      lines: [
        { text: 'back out the last change on a file; one undo survives restarts', cls: 'is-dim', wrap: true },
        ...greetRead(),
        { text: 'replace {', pause: 700, kind: 'call' },
        { text: '  "remove_from": "Emno",', kind: 'arg' },
        { text: '  "remove_to": "Emno",', kind: 'arg' },
        { text: '  "text": "  return `goodbye ${name}`"', kind: 'arg' },
        { text: '}', kind: 'arg' },
        { text: '-Emno│  return `hello ${name}`', cls: 'is-err', kind: 'file' },
        { text: '+Qwer│  return `goodbye ${name}`', cls: 'is-ok', kind: 'file' },
        { text: ' HDtm│}', kind: 'file' },
        { text: 'undo_last_change { "path": "src/greet.ts" }', pause: 700, kind: 'call' },
        { text: '-Qwer│  return `goodbye ${name}`', cls: 'is-err', kind: 'file' },
        { text: '+Emno│  return `hello ${name}`', cls: 'is-ok', kind: 'file' },
        { text: ' HDtm│}', kind: 'file' },
      ],
    },
  ]);
}

function webToolsDemo() {
  const { root, stage } = frame('web_search · web_fetch', 'no api key');

  const lanes = [
    { tool: 'web_search', stages: [['engine sweep', 'duckduckgo · startpage'], ['canonicalize + fuse', 'href dedupe · rank fusion'], ['snippets', 'title · url · snippet']] },
    { tool: 'web_fetch', stages: [['normalize + validate', 'http · https only'], ['resolve + pin', 'pinned before connect'], ['extract', 'markdown · pdf · metadata']] },
    { tool: 'on refusal', stages: [['browser fingerprint', 'chrome tls shape'], ['local render', 'lightpanda · no third party']] },
  ];

  function diagram(prefix) {
    const svgRoot = svg('svg', { class: 'flow-svg', role: 'img', 'aria-label': 'How web_search and web_fetch work internally: search sweeps the engines and fuses their orderings, fetch validates and pins the resolved address before extracting HTML or PDF text, and a refused or JavaScript-rendered page escalates to a browser-fingerprint retry and a local Lightpanda render' });
    const defs = svg('defs');
    const arrowId = `${prefix}-arrow`;
    const warnId = `${prefix}-arrow-warn`;
    for (const [id, warn] of [[arrowId, false], [warnId, true]]) {
      const marker = svg('marker', { id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto' });
      marker.appendChild(svg('path', { d: 'M 0 1 L 9 5 L 0 9 Z', class: warn ? 'flow-arrow-head is-warn' : 'flow-arrow-head' }));
      defs.appendChild(marker);
    }
    svgRoot.appendChild(defs);

    function text(x, y, className, content, anchor) {
      const node = svg('text', { x, y, class: className, 'text-anchor': anchor || 'middle' });
      node.textContent = content;
      svgRoot.appendChild(node);
    }

    function plate(x, y, width, height, className) {
      svgRoot.appendChild(svg('rect', { x, y, width, height, rx: '10', class: className ? `flow-node ${className}` : 'flow-node' }));
    }

    function wire(d, warn) {
      svgRoot.appendChild(svg('path', { d, class: warn ? 'flow-edge is-warn' : 'flow-edge', 'marker-end': `url(#${warn ? warnId : arrowId})` }));
    }

    return { svgRoot, text, plate, wire };
  }

  const wide = diagram('flow-wide');
  wide.svgRoot.setAttribute('viewBox', '0 0 562 240');
  wide.svgRoot.classList.add('is-wide');
  const columns = [126, 262, 405];
  const widths = [122, 129, 149];
  const wideLaneY = (index) => 10 + index * 88;
  lanes.forEach((lane, index) => {
    const y = wideLaneY(index);
    wide.plate(6, y, 104, 44, 'is-tool');
    wide.text(58, y + 26, 'flow-label is-tool', lane.tool);
    lane.stages.forEach((stage, stageIndex) => {
      const width = widths[stageIndex];
      wide.plate(columns[stageIndex], y, width, 44);
      wide.text(columns[stageIndex] + width / 2, y + 19, 'flow-label', stage[0]);
      wide.text(columns[stageIndex] + width / 2, y + 34, 'flow-sub', stage[1]);
      const from = stageIndex === 0 ? 114 : columns[stageIndex - 1] + widths[stageIndex - 1];
      wide.wire(`M ${from} ${y + 22} L ${columns[stageIndex] - 6} ${y + 22}`);
    });
  });
  wide.text(280, 68, 'flow-sub', 'duckduckgo · startpage by default · yandex opt-in');
  const wideFetchBottom = wideLaneY(1) + 44;
  const wideFallbackTo = wideLaneY(2) - 6;
  const wideMiddle = columns[1] + widths[1] / 2;
  wide.wire(`M ${wideMiddle} ${wideFetchBottom} L ${wideMiddle} ${wideFallbackTo}`, true);
  wide.text(wideMiddle + 8, (wideFetchBottom + wideFallbackTo) / 2, 'flow-edge-label', '403 · JavaScript', 'start');

  const tall = diagram('flow-tall');
  tall.svgRoot.setAttribute('viewBox', '0 0 280 620');
  tall.svgRoot.classList.add('is-tall');
  const tallLaneTops = [];
  const TALL_STAGE = 66;
  const TALL_PLATE = 48;
  const TALL_LANE_GAP = 30;
  let top = 32;
  for (const lane of lanes) {
    tallLaneTops.push(top);
    tall.text(12, top - 8, 'flow-label is-tool', lane.tool, 'start');
    lane.stages.forEach((stage, index) => {
      const y = top + index * TALL_STAGE;
      tall.plate(10, y, 260, TALL_PLATE);
      tall.text(140, y + 21, 'flow-label', stage[0]);
      tall.text(140, y + 38, 'flow-sub', stage[1]);
      if (index < lane.stages.length - 1) tall.wire(`M 140 ${y + TALL_PLATE} L 140 ${y + TALL_STAGE - 4}`);
    });
    top += lane.stages.length * TALL_STAGE + TALL_LANE_GAP;
  }
  const tallFetchBottom = tallLaneTops[1] + (lanes[1].stages.length - 1) * TALL_STAGE + TALL_PLATE;
  const tallFallbackTo = tallLaneTops[2] - 4;
  tall.wire(`M 140 ${tallFetchBottom} L 140 ${tallFallbackTo}`, true);
  tall.text(148, (tallFetchBottom + tallFallbackTo) / 2, 'flow-edge-label', '403 · JavaScript', 'start');

  const note = el('p', 'flow-note', 'web_fetch · local files and private addresses allowed by default; the SSRF guard is opt-in');
  append(stage, wide.svgRoot, tall.svgRoot, note);

  return createController(root, () => {});
}

function torView(config) {
  const svgRoot = svg('svg', { viewBox: config.viewBox, class: `tor-svg ${config.className}`, role: 'img', 'aria-label': 'A request travelling through three Tor relays' });
  const directPath = svg('path', { d: config.direct, class: 'tor-line is-direct' });
  const circuitPath = svg('path', { d: config.circuit, class: 'tor-line tor-circuit' });
  append(svgRoot, directPath, circuitPath);
  for (const node of config.nodes) {
    svgRoot.appendChild(svg('circle', { cx: node.x, cy: node.y, r: config.radius || 9, class: 'tor-node' }));
    const label = svg('text', { x: node.lx ?? node.x, y: node.ly ?? node.y - 18, class: 'tor-label', 'text-anchor': node.anchor || 'middle' });
    label.textContent = node.label;
    svgRoot.appendChild(label);
    if (node.sub) {
      const sub = svg('text', { x: node.sx ?? node.x, y: node.sy ?? node.y + 30, class: 'tor-sub', 'text-anchor': node.sanchor || 'middle' });
      sub.textContent = node.sub;
      svgRoot.appendChild(sub);
    }
  }
  return svgRoot;
}

function torDemo() {
  const { root, stage } = frame('direct · tor', 'per-instance circuit');
  const wide = torView({
    className: 'is-wide',
    viewBox: '0 0 560 200',
    direct: 'M 52 110 L 508 110',
    circuit: 'M 52 110 L 160 62 L 285 150 L 410 62 L 508 110',
    nodes: [
      { x: 52, y: 110, label: 'you' },
      { x: 160, y: 62, label: 'guard', sub: 'hop 1' },
      { x: 285, y: 150, label: 'middle', sub: 'hop 2' },
      { x: 410, y: 62, label: 'exit', sub: 'hop 3' },
      { x: 508, y: 110, label: 'site' },
    ],
  });
  const tall = torView({
    className: 'is-tall',
    radius: 11,
    viewBox: '0 0 340 640',
    direct: 'M 170 40 L 170 600',
    circuit: 'M 170 40 L 80 180 L 250 320 L 80 460 L 170 600',
    nodes: [
      { x: 170, y: 40, label: 'you', ly: 20 },
      { x: 80, y: 180, label: 'guard', sub: 'hop 1', lx: 62, ly: 185, anchor: 'end', sx: 62, sy: 209, sanchor: 'end' },
      { x: 250, y: 320, label: 'middle', sub: 'hop 2', lx: 266, ly: 325, anchor: 'start', sx: 266, sy: 349, sanchor: 'start' },
      { x: 80, y: 460, label: 'exit', sub: 'hop 3', lx: 62, ly: 465, anchor: 'end', sx: 62, sy: 489, sanchor: 'end' },
      { x: 170, y: 600, label: 'site', lx: 188, ly: 605, anchor: 'start' },
    ],
  });
  const legend = el('p', 'flow-note', 'dashed: direct request · solid: three-hop circuit · one circuit and exit IP per pi instance, verified against check.torproject.org');
  append(stage, wide, tall, legend);
  return createController(root, () => {});
}

function workflowDemo() {
  const { root, stage } = frame('/workflow', 'plan outside the chat');
  const phases = [
    { title: 'start', steps: ['read the codebase', 'list improvements', 'value check', 'implement', 'validate the diff'] },
    { title: 'loop × 2', steps: ['tree reset · context starts fresh', 'review the changes', 'fix what the review found', 'test · stage when changed'] },
    { title: 'finally', steps: ['write the summary', 'commit'] },
  ];
  for (const phase of phases) {
    const column = el('div', 'wf-phase');
    column.appendChild(el('p', 'wf-phase-title', phase.title));
    const list = el('ol', 'wf-steps');
    for (const step of phase.steps) list.appendChild(el('li', 'wf-step', step));
    column.appendChild(list);
    stage.appendChild(column);
  }
  const note = el('p', 'flow-note', 'the plan lives in editable JSON files · rounds see only the messages they need');
  stage.appendChild(note);
  return createController(root, () => {});
}

function gitDemo() {
  const { root, stage } = frame('bash · pi', 'human gate');
  return transcript(root, stage, [
    { text: '$ git commit -am "quick fix"', kind: 'call' },
    { text: '✗ Mutative git commands are blocked. Ask the user to run /toggle-allow-git to allow them for this session.', cls: 'is-err', wrap: true },
    { text: '$ /commit', pause: 700, kind: 'call' },
    { text: '✓ staged 4 files · diff summary in the transcript (ctrl+o to expand)', cls: 'is-ok', wrap: true },
    { text: 'git_commit {', pause: 700, kind: 'call' },
    { text: '  "type": "FIX",', kind: 'arg' },
    { text: '  "message": "guard the commit path"', kind: 'arg' },
    { text: '}', kind: 'arg' },
    { text: '✓ commit 9c1f3a2  FIX: guard the commit path', cls: 'is-ok' },
    { text: '   git_commit refuses until /commit opens the flow', cls: 'is-dim', wrap: true },
    { text: '$ /amend tighten the subject', pause: 700, kind: 'call' },
    { text: '✓ amended 9c1f3a2  FIX: guard the commit path', cls: 'is-ok' },
    { text: '   git_amend stages all changes, folds them into the last commit, and refreshes the timestamp', cls: 'is-dim', wrap: true },
  ]);
}

const BUILDERS = {
  hashline: hashlineDemo,
  webtools: webToolsDemo,
  tor: torDemo,
  workflow: workflowDemo,
  git: gitDemo,
};

export const DEMO_IDS = new Set(Object.keys(BUILDERS));

export function buildDemo(id) {
  const builder = BUILDERS[id];
  if (!builder) return null;
  return builder();
}
