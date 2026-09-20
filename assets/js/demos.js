import { el, append, createController, typeText, reducedMotion, svg, announce } from './ui.js';

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

function typeLines(container, lines, runtime, onDone) {
  let index = 0;
  const next = () => {
    if (index >= lines.length) {
      if (onDone) onDone();
      return;
    }
    const spec = lines[index];
    index += 1;
    const row = el('div', `term-line ${spec.cls || ''}`);
    const text = el('span');
    row.appendChild(text);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    typeText(text, spec.text, runtime, {
      speed: spec.speed || 12,
      instant: reducedMotion(),
      onDone: () => runtime.after(next, spec.pause ?? 160),
    });
  };
  next();
}

function webToolsDemo() {
  const { root, stage } = frame('web_search · web_fetch · web_render', 'no api key');

  const lanes = [
    { tool: 'web_search', stages: [['DDGS.text()', '7 engines'], ['dedupe + rank', 'SimpleFilterRanker'], ['results', 'Title · URL · Snippet']] },
    { tool: 'web_fetch', stages: [['normalize', 'http · https only'], ['resolve + pin', 'SSRF guard'], ['text + metadata', '512 KiB cap · 5 hops']] },
    { tool: 'web_render', stages: [['Jina Reader', 'third-party'], ['Markdown', 'JavaScript pages']] },
  ];

  function diagram(prefix) {
    const svgRoot = svg('svg', { class: 'flow-svg', role: 'img', 'aria-label': 'How the three webtools run internally: search fans out to seven engines and reranks the hrefs, fetch normalizes and pins the resolved address before extracting HTML or PDF text, and render sends JavaScript pages through the Jina Reader' });
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
  wide.svgRoot.setAttribute('viewBox', '0 0 520 240');
  wide.svgRoot.classList.add('is-wide');
  const columns = [126, 260, 394];
  const wideLaneY = (index) => 10 + index * 88;
  lanes.forEach((lane, index) => {
    const y = wideLaneY(index);
    wide.plate(6, y, 104, 44, 'is-tool');
    wide.text(58, y + 26, 'flow-label is-tool', lane.tool);
    lane.stages.forEach((stage, stageIndex) => {
      wide.plate(columns[stageIndex], y, 118, 44);
      wide.text(columns[stageIndex] + 59, y + 19, 'flow-label', stage[0]);
      wide.text(columns[stageIndex] + 59, y + 34, 'flow-sub', stage[1]);
      const from = stageIndex === 0 ? 114 : columns[stageIndex - 1] + 118;
      wide.wire(`M ${from} ${y + 22} L ${columns[stageIndex] - 6} ${y + 22}`);
    });
  });
  wide.text(260, 68, 'flow-sub', 'duckduckgo · brave · google · mojeek · yahoo · yandex · wikipedia');
  const wideFetchBottom = wideLaneY(1) + 44;
  const wideFallbackTo = wideLaneY(2) - 6;
  wide.wire(`M 319 ${wideFetchBottom} L 319 ${wideFallbackTo}`, true);
  wide.text(327, (wideFetchBottom + wideFallbackTo) / 2, 'flow-edge-label', '403 · JS page', 'start');

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
  tall.text(148, (tallFetchBottom + tallFallbackTo) / 2, 'flow-edge-label', '403 · JS page', 'start');

  const note = el('p', 'flow-note', 'web_fetch · local files and private addresses allowed by default');
  append(stage, wide.svgRoot, tall.svgRoot, note);

  return createController(root, () => {});
}

function torView(config) {
  const svgRoot = svg('svg', { viewBox: config.viewBox, class: `tor-svg ${config.className}`, role: 'img', 'aria-label': 'A request travelling through three Tor relays' });
  const directPath = svg('path', { d: config.direct, class: 'tor-line' });
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
  const packet = svg('g', { class: 'tor-packet' });
  const ringOuter = svg('circle', { r: 14, class: 'tor-ring' });
  const ringMid = svg('circle', { r: 10, class: 'tor-ring ring-mid' });
  const ringInner = svg('circle', { r: 6, class: 'tor-ring ring-inner' });
  const core = svg('circle', { r: 4, class: 'tor-core' });
  append(packet, ringOuter, ringMid, ringInner, core);
  svgRoot.appendChild(packet);
  return { svgRoot, directPath, circuitPath, packet, ringOuter, ringMid, ringInner };
}

function torDemo() {
  const { root, stage } = frame('tool: bash', 'network');

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
  const views = [wide, tall];

  const readout = el('div', 'tor-readout');
  readout.setAttribute('aria-live', 'polite');
  const toggle = el('div', 'tor-toggle');
  const directButton = press('direct', 'is-current');
  const torButton = press('tor');
  const motionButton = press('pause');
  append(toggle, directButton, torButton, motionButton);
  motionButton.hidden = reducedMotion();
  append(stage, wide.svgRoot, tall.svgRoot, readout, toggle);

  let mode = 'tor';
  const hopTimes = [0, 720, 1440, 2160, 2880];
  const directTime = 1400;
  let elapsedOffset = 0;
  let startedAt = 0;
  let running = false;
  let runtimeRef = null;

  function setMode(next) {
    mode = next;
    directButton.classList.toggle('is-current', next === 'direct');
    torButton.classList.toggle('is-current', next === 'tor');
    directButton.setAttribute('aria-pressed', String(next === 'direct'));
    torButton.setAttribute('aria-pressed', String(next === 'tor'));
    for (const view of views) {
      view.directPath.classList.toggle('is-hidden', next !== 'direct');
      view.circuitPath.classList.toggle('is-hidden', next !== 'tor');
      view.ringOuter.style.opacity = next === 'tor' ? '1' : '0';
      view.ringMid.style.opacity = next === 'tor' ? '1' : '0';
      view.ringInner.style.opacity = next === 'tor' ? '1' : '0';
    }
    readout.textContent = next === 'direct'
      ? 'direct · exit IP 203.0.113.42 (you) · 38 ms · DNS and sockets exposed'
      : 'tor · exit IP 185.220.101.7 · 812 ms · circuit fresh';
    readout.classList.toggle('is-warn', next === 'direct');
    if (!running) renderTorFrame(elapsedOffset);
  }

  function renderTorFrame(elapsed) {
    for (const view of views) {
      let position;
      if (mode === 'direct') {
        const progress = Math.min(1, (elapsed % (directTime + 900)) / directTime);
        position = view.directPath.getPointAtLength(view.directPath.getTotalLength() * progress);
        view.packet.style.opacity = progress <= 0 || progress >= 1 ? '0' : '1';
      } else {
        const cycle = hopTimes[hopTimes.length - 1] + 900;
        const time = elapsed % cycle;
        let leg = 0;
        for (let index = 1; index < hopTimes.length; index += 1) {
          if (time >= hopTimes[index]) leg = index;
        }
        const legStart = hopTimes[leg];
        const legEnd = hopTimes[leg + 1] ?? cycle;
        const progress = Math.min(1, (time - legStart) / (legEnd - legStart));
        position = view.circuitPath.getPointAtLength(view.circuitPath.getTotalLength() * ((leg + progress) / (hopTimes.length - 1)));
        view.packet.style.opacity = time > hopTimes[hopTimes.length - 1] + 400 ? '0' : '1';
        const completed = hopTimes.slice(1).filter((hop) => time >= hop).length;
        view.ringOuter.style.opacity = completed >= 1 ? '0' : '1';
        view.ringMid.style.opacity = completed >= 2 ? '0' : '1';
        view.ringInner.style.opacity = completed >= 3 ? '0' : '1';
      }
      view.packet.setAttribute('transform', `translate(${position.x} ${position.y})`);
    }
  }

  function startMotion() {
    if (!runtimeRef || running) return;
    running = true;
    startedAt = performance.now();
    runtimeRef.reset();
    runtimeRef.frame((now) => renderTorFrame(elapsedOffset + now - startedAt));
    motionButton.textContent = 'pause';
  }

  function stopMotion() {
    if (!running) return;
    running = false;
    elapsedOffset += performance.now() - startedAt;
    if (runtimeRef) runtimeRef.clear();
    motionButton.textContent = 'resume';
  }

  directButton.addEventListener('click', () => setMode('direct'));
  torButton.addEventListener('click', () => setMode('tor'));
  motionButton.addEventListener('click', () => { if (running) stopMotion(); else startMotion(); });
  setMode('tor');
  renderTorFrame(0);

  return createController(root, (runtime) => {
    runtimeRef = runtime;
    motionButton.hidden = reducedMotion();
    if (reducedMotion()) {
      setMode(mode);
      renderTorFrame(hopTimes[2]);
      return;
    }
    startMotion();
  }, () => {
    if (running) {
      elapsedOffset += performance.now() - startedAt;
      running = false;
    }
    runtimeRef = null;
    motionButton.textContent = 'pause';
  });
}

function workflowDemo() {
  const { root, stage } = frame('/workflow 1', 'config');
  const lanes = el('div', 'wf-lanes');
  const laneData = [
    {
      title: '/msg',
      items: [
        { id: 'msg1', text: '1 · read the codebase' },
        { id: 'msg2', text: '2 · list improvements' },
        { id: 'msg4', text: '4 · implement' },
        { id: 'msg5', text: '5 · validate the diff' },
      ],
    },
    {
      title: '/cmd',
      items: [
        { id: 'cmd1', text: '1 · git add .' },
        { id: 'cmd2', text: '2 · npm test' },
      ],
    },
    {
      title: '/workflow 1',
      items: [
        { id: 'start', text: 'start · msgs 1 to 5' },
        { id: 'loop', text: 'loop · tree 1 resets context' },
        { id: 'finally', text: 'finally · msg 17 then commit' },
      ],
    },
  ];
  const itemNodes = new Map();
  for (const lane of laneData) {
    const column = el('div', 'wf-lane');
    column.appendChild(el('p', 'wf-lane-title', lane.title));
    const list = el('ul', 'wf-items');
    for (const item of lane.items) {
      const node = el('li', 'wf-item');
      append(node, el('span', 'wf-dot'), el('span', null, item.text));
      list.appendChild(node);
      itemNodes.set(item.id, node);
    }
    column.appendChild(list);
    lanes.appendChild(column);
  }
  const output = el('pre', 'wf-output');
  const status = el('p', 'wf-status', 'workflow 1 · 2 rounds · 6 workflows configured');
  const actions = el('div', 'wf-actions');
  const runButton = press('run workflow');
  const resetButton = press('reset');
  append(actions, runButton, resetButton);
  append(stage, lanes, output, status, actions);

  let runtimeRef = null;

  function clear() {
    for (const item of itemNodes.values()) item.classList.remove('is-active', 'is-done');
    output.classList.remove('is-visible');
    output.textContent = '';
    status.textContent = 'workflow 1 · 2 rounds · 6 workflows configured';
  }

  const plan = [
    'workflow 1 · 2 rounds',
    'start: msg 1, msg 2, msg 3, msg 4, msg 5',
    'loop: tree 1, cmd 1, msg 6, msg 7, msg 5, cmd 1',
    'finally: msg 17, commit',
  ].join('\n');

  function run(announceRun) {
    if (!runtimeRef) return;
    runtimeRef.reset();
    clear();
    const sequence = [
      { id: 'msg1', status: 'start · msg 1 · read the codebase' },
      { id: 'msg2', status: 'start · msg 2 · list improvements' },
      { id: 'msg4', status: 'start · msg 4 · implement' },
      { id: 'msg5', status: 'start · msg 5 · validate the diff' },
      { id: 'start', status: 'loop 1/2 · tree 1 resets the context' },
      { id: 'cmd1', status: 'loop 1/2 · cmd 1 · git add .' },
      { id: 'loop', status: 'loop 1/2 · msg 6 then msg 7 · review the changes' },
      { id: 'cmd2', status: 'loop 1/2 · cmd 2 · npm test' },
      { id: 'finally', status: 'finally · msg 17 then commit' },
    ];
    if (reducedMotion()) {
      for (const item of itemNodes.values()) item.classList.add('is-done');
      output.textContent = plan;
      output.classList.add('is-visible');
      status.textContent = 'done · 2 rounds · committed from msg 17';
      if (announceRun) announce('workflow done · 2 rounds · committed from msg 17');
      return;
    }
    if (announceRun) announce('workflow started · 2 rounds');
    sequence.forEach((step, index) => {
      runtimeRef.after(() => {
        if (index > 0) itemNodes.get(sequence[index - 1].id).classList.replace('is-active', 'is-done');
        itemNodes.get(step.id).classList.add('is-active');
        status.textContent = step.status;
        if (announceRun && step.id === 'start') announce('loop 1 of 2 · context reset');
      }, 240 + index * 780);
    });
    runtimeRef.after(() => {
      itemNodes.get(sequence[sequence.length - 1].id).classList.replace('is-active', 'is-done');
      output.textContent = plan;
      output.classList.add('is-visible');
      status.textContent = 'done · 2 rounds · committed from msg 17';
      if (announceRun) announce('workflow done · 2 rounds · committed from msg 17');
    }, 240 + sequence.length * 780);
  }
  runButton.addEventListener('click', () => run(true));
  resetButton.addEventListener('click', clear);

  return createController(root, (runtime) => {
    runtimeRef = runtime;
    if (!reducedMotion()) runtime.after(() => run(false), 900);
  }, () => {
    runtimeRef = null;
  });
}

function gitDemo() {
  const { root, stage } = frame('bash · pi', 'guard');
  const term = el('div', 'term');
  const bar = el('div', 'term-bar');
  append(bar, el('span', 'term-dot'), el('span', 'term-dot'), el('span', 'term-dot'));
  const body = el('pre', 'term-body');
  append(term, bar, body);
  const actions = el('div', 'term-actions');
  const replay = press('replay');
  actions.appendChild(replay);
  append(stage, term, actions);

  const lines = [
    { text: '$ git commit -am "quick fix"', cls: 'is-cmd', speed: 18 },
    { text: 'error · mutative git commands are blocked. Run /toggle-allow-git to allow them for this session.', cls: 'is-err', speed: 8 },
    { text: '$ /commit', cls: 'is-cmd', speed: 18, pause: 320 },
    { text: '✓ staged 4 files · diff summary in the transcript (ctrl+o to expand)', cls: 'is-ok', speed: 10 },
    { text: '$ pi › git_commit(type: "FIX", message: "guard the commit path")', cls: 'is-cmd', speed: 12, pause: 320 },
    { text: '✓ commit 9c1f3a2  FIX: guard the commit path', cls: 'is-ok', speed: 14 },
    { text: '   git_commit refuses until /commit opens the flow', cls: 'is-dim', speed: 12 },
  ];

  function renderFinal() {
    body.replaceChildren();
    for (const line of lines) {
      const row = el('div', `term-line ${line.cls}`);
      row.appendChild(el('span', null, line.text));
      body.appendChild(row);
    }
    body.scrollTop = body.scrollHeight;
  }

  let runtimeRef = null;

  function play(announceRun) {
    if (!runtimeRef) return;
    runtimeRef.reset();
    body.replaceChildren();
    typeLines(body, lines, runtimeRef, () => {
      if (announceRun) announce('commit flow finished · guarded commit landed');
    });
  }

  replay.addEventListener('click', () => play(true));
  renderFinal();

  return createController(root, (runtime) => {
    runtimeRef = runtime;
    if (reducedMotion()) return;
    play(false);
  }, () => {
    runtimeRef = null;
  });
}

function traceDemo() {
  const { root, stage } = frame('trace · stale-line', 'recovered');
  const list = el('ol', 'tr-steps');
  const steps = [
    { icon: '✓', cls: 'is-ok', name: 'read', detail: `${12} rows served · anchors owned` },
    { icon: '✗', cls: 'is-bad', name: 'edit', detail: '[E_RANGE_STALE] the served range changed on disk' },
    { icon: '✓', cls: 'is-ok', name: 'read (auto range)', detail: 'fresh anchors returned · no blind retry' },
    { icon: '✓', cls: 'is-ok', name: 'edit', detail: 'landed on the anchor · verdict: recovered' },
  ];
  for (const step of steps) {
    const item = el('li', `tr-step ${step.cls}`);
    append(item, el('span', 'tr-icon', step.icon), el('span', 'tr-name', step.name), el('span', 'tr-detail', step.detail));
    list.appendChild(item);
  }
  const foot = el('p', 'tr-foot', 'pi-edit-benchmark scores the refusal itself, not only the final diff.');
  const actions = el('div', 'tr-actions');
  const replay = press('replay');
  actions.appendChild(replay);
  append(stage, list, foot, actions);

  function reset() {
    for (const item of list.children) item.classList.remove('is-in');
  }

  let runtimeRef = null;

  function play() {
    if (!runtimeRef) return;
    runtimeRef.reset();
    reset();
    if (reducedMotion()) {
      for (const item of list.children) item.classList.add('is-in');
      return;
    }
    [...list.children].forEach((item, index) => {
      runtimeRef.after(() => item.classList.add('is-in'), 300 + index * 520);
    });
  }

  replay.addEventListener('click', play);
  reset();

  return createController(root, (runtime) => {
    runtimeRef = runtime;
    play();
  }, () => {
    runtimeRef = null;
  });
}

const BUILDERS = {
  webtools: webToolsDemo,
  tor: torDemo,
  workflow: workflowDemo,
  git: gitDemo,
  trace: traceDemo,
};

export const DEMO_IDS = new Set(Object.keys(BUILDERS));

export function buildDemo(id) {
  const builder = BUILDERS[id];
  if (!builder) return null;
  return builder();
}
