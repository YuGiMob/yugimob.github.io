import { el, append, announce, createRuntime, reducedMotion } from './ui.js';
import { createSession, replace, undo, externalEdit, isStale, staleCount } from './hashline.js';

const SOURCE = [
  "import { anchorFor } from './hash'",
  '',
  'export function replace(lines, req) {',
  '  const from = indexOf(lines, req.from)',
  '  const to = indexOf(lines, req.to)',
  '  if (from < 0 || to < 0) return stale(lines)',
  '  for (let i = from; i <= to; i += 1) {',
  '    const line = lines[i]',
  '    if (served.get(line.anchor) !== line.text) {',
  '      return staleRange(lines, from, to)',
  '    }',
  '  }',
  '  return splice(lines, from, to, req.replacement_lines)',
  '}',
];

const TOUR_REPLACEMENT = "  if (from < 0 || to < 0) return stale(lines, 'range')";
const TOUR_DRIFT = '  const from = indexOf(lines, req.from) // drift';
const TOUR_RETRY = '  const from = indexOf(lines, req.remove_from)';

export function buildPlayground() {
  let session = createSession(SOURCE);
  let selection = { from: 0, to: 0 };
  let runtime = null;
  let tourRuntime = null;
  let tourActive = false;
  let tourRan = false;
  let active = false;
  let flashAnchors = new Set();

  const root = el('div', 'pg');
  const head = el('div', 'pg-head');
  const fileLabel = el('span', 'pg-file');
  const ownedBadge = el('span', 'pg-badge pg-owned');
  const undoBadge = el('span', 'pg-badge pg-undo');
  append(head, fileLabel, el('span', 'pg-head-spacer'), ownedBadge, undoBadge);

  const code = el('ol', 'pg-code');
  const codePane = el('div', 'pg-code-pane');
  codePane.appendChild(code);

  const requestView = el('pre', 'pg-request');
  const input = document.createElement('textarea');
  input.className = 'pg-input';
  input.rows = 3;
  input.spellcheck = false;
  input.setAttribute('aria-label', 'replacement_lines, one line per element');

  const applyButton = action('pg-apply', 'replace ');
  const driftButton = action('pg-drift', 'external edit');
  const undoButton = action('pg-undo-action', 'undo');
  const resetButton = action('pg-reset', 'reset');
  const tourButton = action('pg-tour', 'take the tour');
  const actions = el('div', 'pg-actions');
  append(actions, applyButton, driftButton, undoButton, resetButton, tourButton);

  const feedbackMsg = el('p', 'pg-feedback-msg');
  const diff = el('ol', 'pg-diff');
  const feedback = el('div', 'pg-feedback');
  append(feedback, feedbackMsg, diff);

  const side = el('div', 'pg-side');
  const requestBlock = el('div', 'pg-block');
  append(requestBlock, el('p', 'pg-block-title', 'request'), requestView);
  const inputBlock = el('div', 'pg-block');
  append(inputBlock, el('p', 'pg-block-title', 'replacement_lines'), input);
  append(side, requestBlock, inputBlock, actions, feedback);

  const body = el('div', 'pg-body');
  append(body, codePane, side);
  append(root, head, body);

  const caption = el('p', 'pg-caption', 'A live simulation of the hashline protocol: real FNV-1a anchors, a real served-row record, real stale refusals. Nothing leaves this page.');

  function action(className, label) {
    const button = el('button', `pg-action ${className}`, label);
    button.type = 'button';
    return button;
  }

  function setFeedback(kind, message) {
    feedback.classList.remove('is-ok', 'is-error', 'is-warn', 'is-info');
    feedback.classList.add(`is-${kind}`);
    feedbackMsg.textContent = message;
    diff.replaceChildren();
  }

  function renderRow(row) {
    const item = el('li', 'pg-diff-row');
    const prefix = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' ';
    item.classList.add(row.kind === 'added' ? 'is-add' : row.kind === 'removed' ? 'is-del' : 'is-ctx');
    const prefixNode = el('span', 'pg-diff-prefix', prefix);
    const anchorNode = el('span', 'pg-anchor', row.anchor);
    const textNode = el('code', 'pg-text', row.text || '\u00a0');
    append(item, prefixNode, anchorNode, textNode);
    return item;
  }

  function renderDiff(result) {
    diff.replaceChildren();
    for (const row of result.rows) diff.appendChild(renderRow(row));
    diff.hidden = result.rows.length === 0;
  }

  function renderCode() {
    code.replaceChildren();
    session.lines.forEach((line, index) => {
      const selected = index >= selection.from && index <= selection.to;
      const item = el('li', 'pg-line');
      if (selected) item.classList.add('is-selected');
      if (isStale(session, line)) item.classList.add('is-drifted');
      if (flashAnchors.has(line.anchor)) item.classList.add('is-flash');
      const button = el('button', 'pg-line-btn');
      button.type = 'button';
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      append(button, el('span', 'pg-anchor', line.anchor), el('span', 'pg-lineno', String(index + 1)), el('code', 'pg-text', line.text || '\u00a0'));
      button.addEventListener('click', (event) => {
        if (tourActive) cancelTour();
        selection = event.shiftKey ? { from: selection.from, to: index } : { from: index, to: index };
        input.value = session.lines.slice(selection.from, selection.to + 1).map((entry) => entry.text).join('\n');
        renderCode();
        renderRequest();
        input.focus();
      });
      item.appendChild(button);
      code.appendChild(item);
    });
    fileLabel.textContent = `src/anchors.ts · ${session.lines.length} lines`;
  }

  function buildRequest() {
    return {
      remove_from: session.lines[selection.from]?.anchor ?? '',
      remove_to: session.lines[selection.to]?.anchor ?? '',
      replacement_lines: input.value.split('\n'),
    };
  }

  function renderRequest() {
    requestView.textContent = JSON.stringify(buildRequest(), null, 2);
  }

  function updateBadges() {
    const stale = staleCount(session);
    ownedBadge.classList.toggle('is-warn', stale > 0);
    ownedBadge.textContent = stale > 0
      ? `${stale} stale row${stale === 1 ? '' : 's'} — replace will refuse`
      : `${session.anchors.size} anchors owned · served`;
    undoBadge.classList.toggle('is-ready', Boolean(session.undo));
    undoBadge.textContent = session.undo ? 'undo ready' : 'no undo';
  }

  function applyEdit() {
    const result = replace(session, buildRequest());
    if (result.ok) {
      flashAnchors = new Set(result.rows.filter((row) => row.kind === 'added').map((row) => row.anchor));
      setFeedback('ok', result.message);
    } else {
      flashAnchors = new Set();
      setFeedback('error', result.message);
    }
    renderDiff(result);
    renderCode();
    renderRequest();
    updateBadges();
    announce(result.message);
  }

  function selectLine(index) {
    selection = { from: index, to: index };
    input.value = session.lines[index].text;
    renderCode();
    renderRequest();
  }

  function driftLine(index, text) {
    externalEdit(session, session.lines[index].anchor, text);
    selectLine(index);
    updateBadges();
  }

  function manualDrift() {
    if (tourActive) cancelTour();
    const candidates = session.lines
      .map((line, index) => ({ line, index }))
      .filter(({ index }) => index < selection.from || index > selection.to);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (!pick) return;
    driftLine(pick.index, `${pick.line.text} // changed on disk`);
    setFeedback('warn', `Another process edited line ${pick.index + 1} after it was served. Try to replace it and watch the refusal.`);
  }

  function doUndo() {
    const result = undo(session);
    flashAnchors = new Set();
    setFeedback(result.ok ? 'ok' : 'warn', result.message);
    renderDiff(result);
    renderCode();
    renderRequest();
    updateBadges();
    announce(result.message);
  }

  function reset() {
    cancelTour();
    session = createSession(SOURCE);
    selection = { from: 0, to: 0 };
    input.value = session.lines[0].text;
    flashAnchors = new Set();
    setFeedback('info', 'Session reset. read served every row again.');
    diff.hidden = true;
    renderCode();
    renderRequest();
    updateBadges();
  }

  function runTour() {
    if (tourActive) {
      cancelTour();
      return;
    }
    tourActive = true;
    tourButton.textContent = 'stop the tour';
    tourRuntime = createRuntime();
    const steps = [
      { at: 200, run: () => setFeedback('info', 'read served every row with a 4-character anchor. Select a line to address it instead of a number.') },
      { at: 2200, run: () => { selectLine(6); input.value = TOUR_REPLACEMENT; renderRequest(); setFeedback('info', "The request names anchors, not line numbers: replace('" + session.lines[6].anchor + "')."); } },
      { at: 3800, run: applyEdit },
      { at: 5400, run: () => setFeedback('info', 'The post-edit diff carries fresh anchors, so the next edit needs no re-read. Untouched lines keep theirs.') },
      { at: 6800, run: () => { driftLine(3, TOUR_DRIFT); setFeedback('warn', 'Line 4 changed on disk after it was served. The session record is now stale.'); } },
      { at: 8600, run: () => { selectLine(3); input.value = TOUR_RETRY; renderRequest(); setFeedback('info', 'Try to replace the stale line anyway.'); } },
      { at: 10200, run: applyEdit },
      { at: 11800, run: () => setFeedback('info', '[E_RANGE_STALE] returned the current range with fresh anchors instead of editing a neighbor. Retrying with them works.') },
      { at: 13400, run: applyEdit },
      { at: 15000, run: () => { doUndo(); setFeedback('ok', 'undo_last_change restored the bytes, BOM and line endings included. That is the whole loop.'); } },
      { at: 16800, run: () => { tourActive = false; tourButton.textContent = 'take the tour'; tourRuntime = null; } },
    ];
    for (const step of steps) tourRuntime.after(step.run, step.at);
  }

  function cancelTour() {
    if (!tourActive) return;
    tourActive = false;
    tourButton.textContent = 'take the tour';
    if (tourRuntime) tourRuntime.clear();
    tourRuntime = null;
  }

  applyButton.addEventListener('click', () => { if (tourActive) cancelTour(); applyEdit(); });
  driftButton.addEventListener('click', manualDrift);
  undoButton.addEventListener('click', () => { if (tourActive) cancelTour(); doUndo(); });
  resetButton.addEventListener('click', reset);
  tourButton.addEventListener('click', runTour);
  input.addEventListener('input', renderRequest);
  root.addEventListener('pointerdown', (event) => {
    if (tourActive && !tourButton.contains(event.target)) cancelTour();
  });

  input.value = session.lines[0].text;
  renderCode();
  renderRequest();
  updateBadges();
  setFeedback('info', 'read → every line arrives with an anchor. Pick a line and press replace.');

  return {
    node: root,
    caption,
    start() {
      if (active) return;
      active = true;
      runtime = createRuntime();
      if (!tourRan && !reducedMotion()) {
        tourRan = true;
        runtime.after(runTour, 700);
      }
    },
    stop() {
      active = false;
      if (runtime) runtime.clear();
      runtime = null;
      cancelTour();
    },
    destroy() {
      this.stop();
    },
  };
}
