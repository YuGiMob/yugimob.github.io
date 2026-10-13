import { el, append, createController, reducedMotion, svg, announce } from './ui.js';

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

  const render = (count) => {
    body.replaceChildren();
    for (let index = 0; index < count && index < lines.length; index += 1) {
      const spec = lines[index];
      const kind = spec.wrap ? 'is-prose' : 'is-code';
      const row = el('div', `term-line ${kind}${spec.cls ? ` ${spec.cls}` : ''}`);
      row.appendChild(el('span', null, spec.text));
      body.appendChild(row);
    }
    body.scrollTop = body.scrollHeight;
  };

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

function hashlineDemo() {
  const { root, stage } = frame('read · replace · stale · retry', 'anchors');
  return transcript(root, stage, [
    { text: 'read { "path": "src/stale.ts" }' },
    { text: 'Dafo│function replace(lines, req) {' },
    { text: 'Emno│  return stale(lines)' },
    { text: 'HDtm│}' },
    { text: 'replace {', pause: 700 },
    { text: '  "remove_from": "Emno",' },
    { text: '  "remove_to": "Emno",' },
    { text: '  "text": "  return staleRange(lines)"' },
    { text: '}' },
    { text: '-Emno│  return stale(lines)', cls: 'is-err' },
    { text: '+Qwer│  return staleRange(lines)', cls: 'is-ok' },
    { text: ' HDtm│}' },
    { text: 'another process edits the file; the served row no longer matches', cls: 'is-dim', wrap: true, pause: 900 },
    { text: 'replace {', pause: 700 },
    { text: '  "remove_from": "Qwer",' },
    { text: '  "remove_to": "Qwer",' },
    { text: '  "text": "  return staleRange(lines)"' },
    { text: '}' },
    { text: '✗ [E_RANGE_STALE] The range changed on disk since it was served. Fresh anchors below.', cls: 'is-err', wrap: true },
    { text: 'Qwer│  return staleRange(lines, from, to)' },
    { text: 'HDtm│}' },
    { text: 'replace {', pause: 700 },
    { text: '  "remove_from": "Qwer",' },
    { text: '  "remove_to": "Qwer",' },
    { text: '  "text": "  return staleRange(lines)"' },
    { text: '}' },
    { text: '-Qwer│  return staleRange(lines, from, to)', cls: 'is-err' },
    { text: '+Zk9m│  return staleRange(lines)', cls: 'is-ok' },
    { text: ' HDtm│}' },
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
    viewBox: '0 0 220 460',
    direct: 'M 110 30 L 110 390',
    circuit: 'M 110 30 L 50 120 L 170 210 L 50 300 L 110 390',
    nodes: [
      { x: 110, y: 30, label: 'you' },
      { x: 110, y: 120, label: 'guard', sub: 'hop 1' },
      { x: 110, y: 210, label: 'middle', sub: 'hop 2' },
      { x: 110, y: 300, label: 'exit', sub: 'hop 3' },
      { x: 110, y: 390, label: 'site' },
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
    { text: '$ git commit -am "quick fix"' },
    { text: '✗ Mutative git commands are blocked. Ask the user to run /toggle-allow-git to allow them for this session.', cls: 'is-err', wrap: true },
    { text: '$ /commit', pause: 700 },
    { text: '✓ staged 4 files · diff summary in the transcript (ctrl+o to expand)', cls: 'is-ok', wrap: true },
    { text: 'git_commit {', pause: 700 },
    { text: '  "type": "FIX",' },
    { text: '  "message": "guard the commit path"' },
    { text: '}' },
    { text: '✓ commit 9c1f3a2  FIX: guard the commit path', cls: 'is-ok' },
    { text: '   git_commit refuses until /commit opens the flow', cls: 'is-dim', wrap: true },
    { text: '$ /amend tighten the subject', pause: 700 },
    { text: '✓ amended 9c1f3a2  FIX: guard the commit path', cls: 'is-ok' },
    { text: '   git_amend rewrites the message and timestamp only', cls: 'is-dim', wrap: true },
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
