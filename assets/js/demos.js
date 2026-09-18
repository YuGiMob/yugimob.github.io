import { el, append, createController, createRuntime, typeText, reducedMotion, svg } from './ui.js';
function frame(title, badge) {
  const root = el('div', 'demo');
  const bar = el('div', 'demo-bar');
  append(bar, el('span', 'demo-title', title));
  if (badge) bar.appendChild(el('span', 'demo-badge', badge));
  const stage = el('div', 'demo-stage');
  append(root, bar, stage);
  return { root, stage };
}

function press(label, className) {
  const button = el('button', `demo-button ${className || ''}`, label);
  button.type = 'button';
  return button;
}

const controller = createController;

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
    const text = el('span', 'term-text');
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

  const svgRoot = svg('svg', { viewBox: '0 0 520 240', class: 'flow-svg', role: 'img', 'aria-label': 'How the three webtools run internally: search fans out to seven engines and reranks the hrefs, fetch normalizes and pins the resolved address before extracting HTML or PDF text, and render sends JavaScript pages through the Jina Reader' });

  const defs = svg('defs');
  const arrow = svg('marker', { id: 'flow-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto' });
  arrow.appendChild(svg('path', { d: 'M 0 1 L 9 5 L 0 9 Z', class: 'flow-arrow-head' }));
  const warnArrow = svg('marker', { id: 'flow-arrow-warn', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto' });
  warnArrow.appendChild(svg('path', { d: 'M 0 1 L 9 5 L 0 9 Z', class: 'flow-arrow-head is-warn' }));
  append(defs, arrow, warnArrow);
  svgRoot.appendChild(defs);

  function text(x, y, className, content, anchor) {
    const node = svg('text', { x, y, class: className, 'text-anchor': anchor || 'middle' });
    node.textContent = content;
    svgRoot.appendChild(node);
  }

  function box(x, y, label, sub) {
    svgRoot.appendChild(svg('rect', { x, y, width: 118, height: 44, rx: '10', class: 'flow-node' }));
    text(x + 59, y + 19, 'flow-label', label);
    text(x + 59, y + 34, 'flow-sub', sub);
  }

  const columns = [126, 260, 394];
  const lanes = [
    { y: 10, tool: 'web_search', stages: [['DDGS.text()', '7 engines'], ['dedupe + rank', 'SimpleFilterRanker'], ['results', 'Title · URL · Snippet']] },
    { y: 98, tool: 'web_fetch', stages: [['normalize', 'http · https only'], ['resolve + pin', 'SSRF guard'], ['text + metadata', '512 KiB cap · 5 hops']] },
    { y: 186, tool: 'web_render', stages: [['Jina Reader', 'third-party'], ['Markdown', 'JavaScript pages']] },
  ];

  for (const lane of lanes) {
    svgRoot.appendChild(svg('rect', { x: 6, y: lane.y, width: 104, height: 44, rx: '10', class: 'flow-node is-tool' }));
    text(58, lane.y + 26, 'flow-label is-tool', lane.tool);
    lane.stages.forEach((stage, index) => {
      box(columns[index], lane.y, stage[0], stage[1]);
      const from = index === 0 ? 114 : columns[index - 1] + 118;
      svgRoot.appendChild(svg('path', { d: `M ${from} ${lane.y + 22} L ${columns[index] - 6} ${lane.y + 22}`, class: 'flow-edge', 'marker-end': 'url(#flow-arrow)' }));
    });
  }

  text(260, 68, 'flow-sub', 'duckduckgo · brave · google · mojeek · yahoo · yandex · wikipedia');

  svgRoot.appendChild(svg('path', { d: 'M 319 142 L 319 180', class: 'flow-edge is-warn', 'marker-end': 'url(#flow-arrow-warn)' }));
  text(327, 166, 'flow-edge-label', '403 · JS page', 'start');

  const note = el('p', 'flow-note', 'web_fetch · local files and private addresses allowed by default');
  append(stage, svgRoot, note);

  return controller(root, () => {});
}

function torDemo() {
  const { root, stage } = frame('tool: bash', 'network');

  const svgRoot = svg('svg', { viewBox: '0 0 560 200', class: 'tor-svg', role: 'img', 'aria-label': 'A request travelling through three Tor relays' });
  const defs = svg('defs');
  const gradient = svg('linearGradient', { id: 'tor-packet', x1: '0', y1: '0', x2: '1', y2: '1' });
  gradient.appendChild(svg('stop', { offset: '0', 'stop-color': '#ffd77a' }));
  gradient.appendChild(svg('stop', { offset: '1', 'stop-color': '#c04a1f' }));
  defs.appendChild(gradient);
  svgRoot.appendChild(defs);

  const directPath = svg('path', { d: 'M 52 110 L 508 110', class: 'tor-line tor-direct' });
  const circuitPath = svg('path', { d: 'M 52 110 L 160 62 L 285 150 L 410 62 L 508 110', class: 'tor-line tor-circuit', id: 'tor-path' });
  append(svgRoot, directPath, circuitPath);

  const nodes = [
    { x: 52, y: 110, label: 'you', sub: '' },
    { x: 160, y: 62, label: 'guard', sub: 'hop 1' },
    { x: 285, y: 150, label: 'middle', sub: 'hop 2' },
    { x: 410, y: 62, label: 'exit', sub: 'hop 3' },
    { x: 508, y: 110, label: 'site', sub: '' },
  ];

  for (const node of nodes) {
    svgRoot.appendChild(svg('circle', { cx: node.x, cy: node.y, r: 9, class: 'tor-node' }));
    const label = svg('text', { x: node.x, y: node.y - 18, class: 'tor-label', 'text-anchor': 'middle' }, );
    label.textContent = node.label;
    svgRoot.appendChild(label);
    if (node.sub) {
      const sub = svg('text', { x: node.x, y: node.y + 30, class: 'tor-sub', 'text-anchor': 'middle' });
      sub.textContent = node.sub;
      svgRoot.appendChild(sub);
    }
  }

  const packet = svg('g', { class: 'tor-packet' });
  const ringOuter = svg('circle', { r: 14, class: 'tor-ring ring-outer' });
  const ringMid = svg('circle', { r: 10, class: 'tor-ring ring-mid' });
  const ringInner = svg('circle', { r: 6, class: 'tor-ring ring-inner' });
  const core = svg('circle', { r: 4, class: 'tor-core' });
  append(packet, ringOuter, ringMid, ringInner, core);
  svgRoot.appendChild(packet);

  const readout = el('div', 'tor-readout');
  const toggle = el('div', 'tor-toggle');
  const directButton = press('direct', 'tor-mode is-current');
  const torButton = press('tor', 'tor-mode');
  append(toggle, directButton, torButton);
  append(stage, svgRoot, readout, toggle);

  let mode = 'tor';
  const hopTimes = [0, 720, 1440, 2160, 2880];
  const directTime = 1400;

  function setMode(next) {
    mode = next;
    directButton.classList.toggle('is-current', next === 'direct');
    torButton.classList.toggle('is-current', next === 'tor');
    directPath.classList.toggle('is-hidden', next !== 'direct');
    circuitPath.classList.toggle('is-hidden', next !== 'tor');
    ringOuter.style.opacity = next === 'tor' ? '1' : '0';
    ringMid.style.opacity = next === 'tor' ? '1' : '0';
    ringInner.style.opacity = next === 'tor' ? '1' : '0';
    readout.textContent = next === 'direct'
      ? 'direct · exit IP 203.0.113.42 (you) · 38 ms · DNS and sockets exposed'
      : 'tor · exit IP 185.220.101.7 · 812 ms · circuit fresh';
    readout.classList.toggle('is-warn', next === 'direct');
  }

  directButton.addEventListener('click', () => setMode('direct'));
  torButton.addEventListener('click', () => setMode('tor'));
  setMode('tor');
  renderTorFrame(0);

  function renderTorFrame(elapsed) {
    let position;
    if (mode === 'direct') {
      const progress = Math.min(1, (elapsed % (directTime + 900)) / directTime);
      const pathPoint = directPath.getPointAtLength(directPath.getTotalLength() * progress);
      position = pathPoint;
      const hide = progress <= 0 || progress >= 1;
      packet.style.opacity = hide ? '0' : '1';
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
      position = circuitPath.getPointAtLength(circuitPath.getTotalLength() * ((leg + progress) / (hopTimes.length - 1)));
      packet.style.opacity = time > hopTimes[hopTimes.length - 1] + 400 ? '0' : '1';
      const completed = hopTimes.slice(1).filter((time2) => time >= time2).length;
      ringOuter.style.opacity = completed >= 1 ? '0' : '1';
      ringMid.style.opacity = completed >= 2 ? '0' : '1';
      ringInner.style.opacity = completed >= 3 ? '0' : '1';
    }
    packet.setAttribute('transform', `translate(${position.x} ${position.y})`);
  }

  return controller(root, (runtime) => {
    if (reducedMotion()) {
      setMode(mode);
      renderTorFrame(hopTimes[2]);
      return;
    }
    const start = performance.now();
    runtime.frame((now) => renderTorFrame(now - start));
  });
}

function workflowDemo() {
  const { root, stage } = frame('/workflow 1', 'config');
  const lanes = el('div', 'wf-lanes');
  const laneData = [
    { title: '/msg', items: ['1 · read the codebase', '2 · list improvements', '4 · implement', '5 · validate the diff'] },
    { title: '/cmd', items: ['1 · git add .', '2 · npm test'] },
    { title: '/workflow 1', items: ['start · msgs 1 to 5', 'loop · tree 1 resets context', 'finally · msg 17 then commit'] },
  ];
  const itemNodes = [];
  for (const lane of laneData) {
    const column = el('div', 'wf-lane');
    column.appendChild(el('p', 'wf-lane-title', lane.title));
    const list = el('ul', 'wf-items');
    for (const text of lane.items) {
      const item = el('li', 'wf-item');
      append(item, el('span', 'wf-dot'), el('span', 'wf-text', text));
      list.appendChild(item);
      itemNodes.push(item);
    }
    column.appendChild(list);
    lanes.appendChild(column);
  }
  const output = el('pre', 'wf-output');
  const status = el('p', 'wf-status', 'workflow 1 · 2 rounds · 6 workflows configured');
  const actions = el('div', 'wf-actions');
  const runButton = press('run workflow', 'wf-run');
  const resetButton = press('reset', 'wf-reset');
  append(actions, runButton, resetButton);
  append(stage, lanes, output, status, actions);

  let runtimeRef = null;

  function clear() {
    for (const item of itemNodes) item.classList.remove('is-active', 'is-done');
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

  function run() {
    if (!runtimeRef) return;
    clear();
    const sequence = [
      { index: 0, status: 'start · msg 1 · read the codebase' },
      { index: 1, status: 'start · msg 2 · list improvements' },
      { index: 2, status: 'start · msg 4 · implement' },
      { index: 3, status: 'start · msg 5 · validate the diff' },
      { index: 6, status: 'loop 1/2 · tree 1 resets the context' },
      { index: 4, status: 'loop 1/2 · cmd 1 · git add .' },
      { index: 7, status: 'loop 1/2 · msg 6 then msg 7 · review the changes' },
      { index: 5, status: 'loop 1/2 · cmd 2 · npm test' },
      { index: 8, status: 'finally · msg 17 then commit' },
    ];
    if (reducedMotion()) {
      for (const item of itemNodes) item.classList.add('is-done');
      output.textContent = plan;
      output.classList.add('is-visible');
      status.textContent = 'done · 2 rounds · committed from msg 17';
      return;
    }
    sequence.forEach((step, index) => {
      runtimeRef.after(() => {
        if (index > 0) itemNodes[sequence[index - 1].index].classList.replace('is-active', 'is-done');
        itemNodes[step.index].classList.add('is-active');
        status.textContent = step.status;
      }, 240 + index * 780);
    });
    runtimeRef.after(() => {
      itemNodes[sequence[sequence.length - 1].index].classList.replace('is-active', 'is-done');
      output.textContent = plan;
      output.classList.add('is-visible');
      status.textContent = 'done · 2 rounds · committed from msg 17';
    }, 240 + sequence.length * 780);
  }

  runButton.addEventListener('click', run);
  resetButton.addEventListener('click', clear);

  return controller(root, (runtime) => {
    runtimeRef = runtime;
    if (!reducedMotion()) runtime.after(run, 900);
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
  const replay = press('replay', 'term-replay');
  actions.appendChild(replay);
  append(stage, term, actions);

  const lines = [
    { text: '$ git commit -am "quick fix"', cls: 'is-cmd', speed: 18 },
    { text: '⛔ Mutative git commands are blocked. Ask the user to run /toggle-allow-git to allow them for this session.', cls: 'is-err', speed: 8 },
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
      row.appendChild(el('span', 'term-text', line.text));
      body.appendChild(row);
    }
    body.scrollTop = body.scrollHeight;
  }

  replay.addEventListener('click', () => {
    if (typingRuntime) typingRuntime.clear();
    typingRuntime = createRuntime();
    body.replaceChildren();
    typeLines(body, lines, typingRuntime);
  });

  let runtimeRef = null;
  let typingRuntime = null;
  renderFinal();

  return controller(root, (runtime) => {
    runtimeRef = runtime;
    if (reducedMotion()) return;
    body.replaceChildren();
    typeLines(body, lines, runtime);
  }, () => {
    runtimeRef = null;
    if (typingRuntime) typingRuntime.clear();
    typingRuntime = null;
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
  const foot = el('p', 'tr-foot', 'What pi-edit-benchmark scores: refused instead of silently mis-applied.');
  const actions = el('div', 'tr-actions');
  const replay = press('replay', 'tr-replay');
  actions.appendChild(replay);
  append(stage, list, foot, actions);

  function reset() {
    for (const item of list.children) item.classList.remove('is-in');
  }

  let runtimeRef = null;
  replay.addEventListener('click', () => {
    if (!runtimeRef) return;
    reset();
    if (reducedMotion()) {
      for (const item of list.children) item.classList.add('is-in');
      return;
    }
    [...list.children].forEach((item, index) => {
      runtimeRef.after(() => item.classList.add('is-in'), 200 + index * 520);
    });
  });

  reset();

  return controller(root, (runtime) => {
    runtimeRef = runtime;
    if (reducedMotion()) {
      for (const item of list.children) item.classList.add('is-in');
      return;
    }
    [...list.children].forEach((item, index) => {
      runtime.after(() => item.classList.add('is-in'), 300 + index * 520);
    });
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

export function buildDemo(id) {
  const builder = BUILDERS[id];
  if (!builder) return null;
  return builder();
}
