import { el, append, link, createController, createRuntime, typeText, reducedMotion, formatNumber, svg } from './ui.js';
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

const SEARCH = {
  tool: 'web_search',
  engine: 'DuckDuckGo',
  note: 'SSRF guard · refused http://127.0.0.1:8080 — private address',
  reader: [
    '# pi-hashline-edit-pro',
    '',
    'Every line comes back as `anchor│content`, and you edit by anchor.',
    '',
    '## Installation',
    '',
    'pi install npm:pi-hashline-edit-pro',
  ],
  queries: [
    {
      q: 'hashline edit anchors',
      results: [
        ['pi-hashline-edit-pro — GitHub', 'github.com/YuGiMob/pi-hashline-edit-pro', 'Hash-anchored read, replace, and undo tools for the pi coding agent. Every line gets a unique 4-character anchor.'],
        ['pi-hashline-edit — GitHub', 'github.com/RimuruW/pi-hashline-edit', 'The original hash-anchored editing extension for pi, with 3-character anchors.'],
        ['pi-edit-benchmark — GitHub', 'github.com/YuGiMob/pi-edit-benchmark', 'Deterministic benchmark scoring edit tools on correctness, safety, and stale handling.'],
      ],
    },
    {
      q: 'tor proxy for coding agents',
      results: [
        ['pi-tor-proxy — GitHub', 'github.com/YuGiMob/pi-tor-proxy', 'Routes pi agent requests through Tor with a bundled Tor binary, per-instance circuits, and a verified exit IP.'],
        ['How Tor circuits work', 'community.torproject.org', 'Three relays, layered encryption, and a new circuit per request.'],
        ['npm: pi-tor-proxy', 'npmjs.com/package/pi-tor-proxy', 'Install command, weekly downloads, and version history.'],
      ],
    },
    {
      q: 'pi coding agent extensions',
      results: [
        ['pi — the coding agent', 'pi.dev', 'Extensions, tools, sessions, and a terminal UI built for real repositories.'],
        ['mypi — personal configuration', 'github.com/YuGiMob/mypi', 'Extensions, model routing, and settings in one versioned repository.'],
        ['YuGiMob on GitHub', 'github.com/YuGiMob', 'Published pi extensions and the benchmark that keeps them honest.'],
      ],
    },
  ],
};

function searchDemo() {
  const { root, stage } = frame(SEARCH.tool, SEARCH.engine);

  const bar = el('div', 'search-bar');
  const prompt = el('span', 'search-prompt', '›');
  const query = el('span', 'search-query');
  const caret = el('span', 'search-caret');
  append(bar, prompt, query, caret);
  const meta = el('p', 'search-meta');
  const results = el('ul', 'search-results');
  const chips = el('div', 'search-chips');
  const tail = el('pre', 'search-reader');
  append(stage, bar, meta, results, tail, chips);

  let queryIndex = 0;
  let generation = 0;

  for (const [index, entry] of SEARCH.queries.entries()) {
    const chip = press(entry.q, 'search-chip');
    chip.addEventListener('click', () => {
      show(index, runtimeRef);
    });
    chips.appendChild(chip);
    chip.dataset.index = String(index);
  }

  let runtimeRef = null;

  function skeleton() {
    results.replaceChildren();
    for (let index = 0; index < 3; index += 1) {
      const item = el('li', 'search-result is-skeleton');
      append(item, el('span', 'skel skel-title'), el('span', 'skel skel-url'), el('span', 'skel skel-line'));
      results.appendChild(item);
    }
  }

  function renderResults(entry) {
    results.replaceChildren();
    entry.results.forEach((item, index) => {
      const [title, url, snippet] = item;
      const row = el('li', 'search-result');
      row.style.animationDelay = `${index * 90}ms`;
      const anchor = link(`https://${url.replace(/^https?:\/\//, '')}`, title, 'search-title');
      append(row, anchor, el('span', 'search-url', url), el('p', 'search-snippet', snippet));
      results.appendChild(row);
    });
    meta.textContent = `${SEARCH.tool} · ${SEARCH.engine} · ${entry.results.length} results`;
  }

  function show(index, runtime) {
    queryIndex = index;
    const entry = SEARCH.queries[index];
    generation += 1;
    const token = generation;
    for (const chip of chips.children) chip.classList.toggle('is-current', chip.dataset.index === String(index));
    tail.textContent = '';
    tail.classList.remove('is-visible');
    meta.textContent = `${SEARCH.tool} · ${SEARCH.engine} · searching…`;
    if (!runtime || reducedMotion()) {
      query.textContent = entry.q;
      renderResults(entry);
      tail.textContent = SEARCH.reader.join('\n');
      tail.classList.add('is-visible');
      return;
    }
    skeleton();
    typeText(query, entry.q, runtime, {
      speed: 45,
      onDone: () => {
        if (token !== generation) return;
        runtime.after(() => {
          if (token !== generation) return;
          renderResults(entry);
          runtime.after(() => {
            if (token !== generation) return;
            tail.classList.add('is-visible');
            typeText(tail, SEARCH.reader.join('\n'), runtime, { speed: 6 });
          }, 350);
        }, 620);
      },
    });
  }

  const note = el('p', 'search-note', SEARCH.note);
  stage.appendChild(note);
  show(0, null);

  return controller(root, (runtime) => {
    runtimeRef = runtime;
    show(queryIndex, runtime);
    if (reducedMotion()) return;
    runtime.every(() => {
      const next = (queryIndex + 1) % SEARCH.queries.length;
      show(next, runtime);
    }, 9000);
  });
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

function tpsDemo() {
  const { root, stage } = frame('status line', 'live');
  const top = el('div', 'tps-top');
  const icon = el('span', 'tps-icon', '');
  const value = el('span', 'tps-value', '0.0');
  const unit = el('span', 'tps-unit', 'tok/s');
  const pause = press('pause', 'tps-pause');
  append(top, icon, value, unit, pause);
  const canvas = document.createElement('canvas');
  canvas.className = 'tps-canvas';
  canvas.width = 560;
  canvas.height = 96;
  const foot = el('p', 'tps-foot');
  const tokensLabel = el('span', 'tps-stat');
  const windowLabel = el('span', 'tps-stat');
  const modelLabel = el('span', 'tps-stat tps-model', 'glm-5.1 · hyper');
  append(foot, tokensLabel, windowLabel, modelLabel);
  append(stage, top, canvas, foot);

  const samples = [];
  const MAX = 72;
  let paused = false;
  let tokens = 0;
  let started = performance.now();

  function draw() {
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 560;
    const height = 96;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const mid = height * 0.62;
    context.strokeStyle = 'rgba(212, 160, 23, 0.18)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, mid);
    context.lineTo(width, mid);
    context.stroke();
    if (samples.length < 2) return;
    const max = Math.max(80, ...samples);
    const step = width / (MAX - 1);
    context.beginPath();
    samples.forEach((sample, index) => {
      const x = index * step;
      const y = height - (sample / max) * (height - 16) - 6;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = '#e8b64c';
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.stroke();
    context.lineTo((samples.length - 1) * step, height);
    context.lineTo(0, height);
    context.closePath();
    const fill = context.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, 'rgba(232, 182, 76, 0.28)');
    fill.addColorStop(1, 'rgba(232, 182, 76, 0)');
    context.fillStyle = fill;
    context.fill();
    const headX = (samples.length - 1) * step;
    const headY = height - (samples[samples.length - 1] / max) * (height - 16) - 6;
    context.beginPath();
    context.arc(headX, headY, 3.5, 0, Math.PI * 2);
    context.fillStyle = '#ff6b35';
    context.fill();
  }

  function sample() {
    const base = 46 + Math.sin(performance.now() / 2600) * 6;
    const noise = (Math.random() - 0.5) * 14;
    const burst = Math.random() < 0.06 ? 24 : 0;
    return Math.max(4, base + noise + burst);
  }

  function tick() {
    if (paused) return;
    const value2 = sample();
    samples.push(value2);
    if (samples.length > MAX) samples.shift();
    const current = samples.slice(-8).reduce((sum, entry) => sum + entry, 0) / Math.min(8, samples.length);
    value.textContent = current.toFixed(1);
    tokens += Math.round(current * 0.13);
    tokensLabel.textContent = `${formatNumber(tokens)} tokens`;
    const elapsed = Math.round((performance.now() - started) / 1000);
    windowLabel.textContent = `${Math.floor(elapsed / 60)}m ${String(elapsed % 60).padStart(2, '0')}s`;
    draw();
  }

  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'resume' : 'pause';
  });

  for (let index = 0; index < MAX; index += 1) samples.push(44 + Math.sin(index / 6) * 5);
  value.textContent = '46.2';
  tokensLabel.textContent = '12,480 tokens';
  windowLabel.textContent = '4m 56s';
  draw();

  return controller(root, (runtime) => {
    if (reducedMotion()) return;
    started = performance.now();
    runtime.every(tick, 130);
  });
}


function workflowDemo() {
  const { root, stage } = frame('/workflow improve', 'config');
  const lanes = el('div', 'wf-lanes');
  const laneData = [
    { title: '/msg', items: ['add retry to refresh-data', 'hash anchors in the diff view'] },
    { title: '/cmd', items: ['node --check assets/js/*.js', 'node scripts/validate-data.mjs'] },
    { title: '/workflow', items: ['collect', 'critique', 'rewrite', 'store as prompt'] },
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
  const status = el('p', 'wf-status', 'idle · 3 stores loaded');
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
    status.textContent = 'idle · 3 stores loaded';
  }

  function run() {
    if (!runtimeRef) return;
    clear();
    const sequence = [
      { index: 0, status: 'collecting /msg #1…' },
      { index: 2, status: 'matching /cmd #1…' },
      { index: 4, status: 'step 1/4 · collect' },
      { index: 5, status: 'step 2/4 · critique' },
      { index: 6, status: 'step 3/4 · rewrite' },
      { index: 7, status: 'step 4/4 · store as prompt' },
    ];
    if (reducedMotion()) {
      for (const item of itemNodes) item.classList.add('is-done');
      output.textContent = 'before: add retry to refresh-data\nafter:  Add bounded retry with backoff to refresh-data.mjs so a transient npm 429 cannot fail the daily refresh.';
      output.classList.add('is-visible');
      status.textContent = 'done · prompt stored as /msg #3';
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
      output.textContent = 'before: add retry to refresh-data\nafter:  Add bounded retry with backoff to refresh-data.mjs so a transient npm 429 cannot fail the daily refresh.';
      output.classList.add('is-visible');
      status.textContent = 'done · prompt stored as /msg #3';
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
    { text: '⛔ blocked by pi-git-commit: raw git commit is disabled', cls: 'is-err', speed: 14 },
    { text: '   → use the git_commit tool so the change gets a type', cls: 'is-dim', speed: 14 },
    { text: '$ pi › git_commit(type: FIX, message: "fix(site): guard the commit path")', cls: 'is-cmd', speed: 12, pause: 320 },
    { text: '✓ staged 4 files · +128 −36', cls: 'is-ok', speed: 14 },
    { text: '✓ commit 9c1f3a2  fix(site): guard the commit path', cls: 'is-ok', speed: 14 },
    { text: '   humans can still run /commit directly', cls: 'is-dim', speed: 12 },
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

function queueDemo() {
  const { root, stage } = frame('/q', 'concurrency');
  const chat = el('div', 'q-chat');
  const agent = el('div', 'q-bubble q-agent');
  const agentText = el('span', 'q-text', 'Refactoring the anchor allocator…');
  const agentBadge = el('span', 'q-badge', 'working');
  append(agent, agentText, agentBadge);
  const drained = el('div', 'q-drained');
  const queueBox = el('div', 'q-queue');
  const queueTitle = el('p', 'q-queue-title', 'queue · 0');
  const queueList = el('div', 'q-queue-list');
  append(queueBox, queueTitle, queueList);
  append(chat, agent, drained, queueBox);

  const inputRow = el('div', 'q-input-row');
  const input = document.createElement('input');
  input.className = 'q-input';
  input.type = 'text';
  input.placeholder = 'follow-up while the agent is busy…';
  input.setAttribute('aria-label', 'queued follow-up message');
  const queueButton = press('queue', 'q-add');
  append(inputRow, input, queueButton);

  const chipRow = el('div', 'q-chips');
  const suggestions = ['also add a test', 'keep the API stable', 'benchmark before/after'];
  for (const suggestion of suggestions) {
    const chip = press(suggestion, 'q-chip');
    chip.addEventListener('click', () => enqueue(suggestion));
    chipRow.appendChild(chip);
  }

  const actions = el('div', 'q-actions');
  const finishButton = press('finish turn', 'q-finish');
  const resetButton = press('reset', 'q-reset');
  append(actions, finishButton, resetButton);
  append(stage, chat, inputRow, chipRow, actions);

  const state = { queued: [], done: 0, working: true };
  let runtimeRef = null;

  function renderQueue() {
    queueTitle.textContent = `queue · ${state.queued.length}`;
    queueList.replaceChildren();
    state.queued.forEach((message, index) => {
      const bubble = el('div', 'q-bubble q-queued');
      bubble.style.animationDelay = `${index * 40}ms`;
      append(bubble, el('span', 'q-order', `#${index + 1}`), el('span', 'q-text', message));
      queueList.appendChild(bubble);
    });
  }

  function enqueue(message) {
    if (!message.trim() || state.queued.length >= 4) return;
    state.queued.push(message.trim());
    input.value = '';
    renderQueue();
  }

  function completeTurn() {
    state.working = false;
    agentText.textContent = 'Turn complete.';
    agentBadge.textContent = 'idle';
    agent.classList.remove('is-working');
    renderQueue();
    drainNext();
  }

  function drainNext() {
    if (state.queued.length === 0) {
      if (!runtimeRef) return;
      runtimeRef.after(() => {
        agentText.textContent = 'Queue empty. Ready.';
        agentBadge.textContent = 'idle';
      }, 600);
      return;
    }
    if (!runtimeRef || reducedMotion()) {
      while (state.queued.length > 0) {
        const message = state.queued.shift();
        const row = el('div', 'q-bubble q-user');
        row.appendChild(el('span', 'q-text', message));
        drained.appendChild(row);
        state.done += 1;
      }
      renderQueue();
      agentText.textContent = `Processed ${state.done} queued messages.`;
      return;
    }
    const message = state.queued.shift();
    renderQueue();
    const row = el('div', 'q-bubble q-user');
    row.appendChild(el('span', 'q-text', message));
    drained.appendChild(row);
    state.done += 1;
    agentText.textContent = 'On it…';
    agentBadge.textContent = 'working';
    agent.classList.add('is-working');
    runtimeRef.after(() => {
      agent.classList.remove('is-working');
      agentBadge.textContent = 'idle';
      drainNext();
    }, 850);
  }

  function reset() {
    if (runtimeRef) runtimeRef.clear();
    state.queued = [];
    state.done = 0;
    state.working = true;
    drained.replaceChildren();
    agentText.textContent = 'Refactoring the anchor allocator…';
    agentBadge.textContent = 'working';
    agent.classList.add('is-working');
    renderQueue();
    if (runtimeRef && !reducedMotion()) {
      runtimeRef.after(() => enqueue(suggestions[0]), 600);
      runtimeRef.after(() => enqueue(suggestions[1]), 1500);
      runtimeRef.after(completeTurn, 3400);
    }
  }

  queueButton.addEventListener('click', () => enqueue(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') enqueue(input.value);
  });
  finishButton.addEventListener('click', completeTurn);
  resetButton.addEventListener('click', reset);
  renderQueue();

  return controller(root, (runtime) => {
    runtimeRef = runtime;
    if (reducedMotion()) {
      enqueue(suggestions[0]);
      enqueue(suggestions[1]);
      completeTurn();
      return;
    }
    runtime.after(() => enqueue(suggestions[0]), 700);
    runtime.after(() => enqueue(suggestions[1]), 1700);
    runtime.after(completeTurn, 3800);
  }, () => {
    runtimeRef = null;
  });
}

const CONFIG_FILES = {
  'extensions/': {
    title: 'extensions/ · 1 active',
    content: ['sticky-autocomplete.ts'].join('\n'),
  },
  'sticky-autocomplete.ts': {
    title: 'extensions/sticky-autocomplete.ts',
    content: [
      'export function parseSlashCommand(text) {',
      "  if (!text.startsWith('/')) return null",
      '  const space = text.indexOf(" ")',
      '  if (space === -1) return null',
      '  return { commandName: text.slice(1, space) }',
      '}',
    ].join('\n'),
  },
  'settings.json': {
    title: 'settings.json',
    content: [
      '{',
      '  "theme": "dark",',
      '  "defaultThinkingLevel": "max",',
      '  "enableInstallTelemetry": false,',
      '  "compaction": { "enabled": false },',
      '  "retry": { "baseDelayMs": 5000 }',
      '}',
    ].join('\n'),
  },
  'models-store.json': {
    title: 'models-store.json',
    content: [
      '{',
      '  "opencode-go": {',
      '    "models": [',
      '      { "id": "deepseek-v4-flash", "name": "DeepSeek V4 Flash" }',
      '    ]',
      '  }',
      '}',
    ].join('\n'),
  },
};

function configDemo() {
  const { root, stage } = frame('mypi', 'repo');
  const tree = el('ul', 'cfg-tree');
  const view = el('div', 'cfg-view');
  const viewTitle = el('p', 'cfg-view-title');
  const viewBody = el('pre', 'cfg-view-body');
  append(view, viewTitle, viewBody);
  append(stage, tree, view);

  function select(key) {
    const file = CONFIG_FILES[key];
    viewTitle.textContent = file.title;
    viewBody.textContent = file.content;
    for (const button of tree.querySelectorAll('.cfg-node')) {
      button.classList.toggle('is-current', button.dataset.key === key);
    }
  }

  const treeData = [
    { key: 'extensions/', depth: 0 },
    { key: 'sticky-autocomplete.ts', depth: 1 },
    { key: 'models-store.json', depth: 0 },
    { key: 'settings.json', depth: 0 },
  ];

  for (const entry of treeData) {
    const item = el('li', 'cfg-item');
    const button = el('button', 'cfg-node');
    button.type = 'button';
    button.dataset.key = entry.key;
    button.style.paddingLeft = `${8 + entry.depth * 18}px`;
    button.textContent = entry.depth === 0 ? entry.key : `↳ ${entry.key}`;
    button.addEventListener('click', () => select(entry.key));
    item.appendChild(button);
    tree.appendChild(item);
  }

  select('extensions/');
  return controller(root, () => {});
}

function traceDemo() {
  const { root, stage } = frame('trace · stale-line', 'recovered');
  const list = el('ol', 'tr-steps');
  const steps = [
    { icon: '✓', cls: 'is-ok', name: 'read', detail: `${12} rows served · anchors owned` },
    { icon: '✗', cls: 'is-bad', name: 'edit', detail: '[E_RANGE_STALE] line 7 changed on disk' },
    { icon: '✓', cls: 'is-ok', name: 'read (auto range)', detail: 'fresh anchors returned · no blind retry' },
    { icon: '✓', cls: 'is-ok', name: 'edit', detail: 'landed on line 7 · verdict: recovered' },
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
  search: searchDemo,
  tor: torDemo,
  tps: tpsDemo,
  workflow: workflowDemo,
  git: gitDemo,
  queue: queueDemo,
  config: configDemo,
  trace: traceDemo,
};

export function buildDemo(id) {
  const builder = BUILDERS[id];
  if (!builder) return null;
  return builder();
}
