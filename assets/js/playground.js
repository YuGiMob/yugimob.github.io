import { el, append, announce } from './ui.js';
import { createSession, replace, undo, externalEdit, isStale } from './hashline.js';

const SOURCE = [
  "import { anchorIndex } from './anchors'",
  '',
  'export function replace(lines, req) {',
  '  const from = anchorIndex(lines, req.remove_from)',
  '  const to = anchorIndex(lines, req.remove_to)',
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

export const PLAYGROUND_ID = 'hashline';

const TARGET = 5;
const REPLACEMENT = "  if (from < 0 || to < 0) return stale(lines, 'range')";
const DRIFT = '  if (from < 0 || to < 0) return staleRange(lines)';

export function buildPlayground() {
  let session = createSession(SOURCE);
  let selection = null;
  let stepIndex = 0;
  let replacementText = REPLACEMENT;
  let flashAnchors = new Set();

  const root = el('div', 'pg');

  const fileLabel = el('span', 'pg-file');
  const stepLabel = el('span', 'pg-step');
  const head = el('div', 'pg-head');
  append(head, fileLabel, el('span', 'pg-head-spacer'), stepLabel);

  const claimTitle = el('p', 'pg-claim-title');
  const claimText = el('p', 'pg-claim-text');
  const call = el('p', 'pg-call');
  const claim = el('div', 'pg-claim');
  append(claim, claimTitle, claimText, call);

  const code = el('ol', 'pg-code');
  const codePane = el('div', 'pg-code-pane');
  codePane.appendChild(code);

  const runButton = el('button', 'pg-action pg-apply');
  runButton.type = 'button';
  const resetButton = el('button', 'pg-action', 'start over');
  resetButton.type = 'button';
  const actions = el('div', 'pg-actions');
  append(actions, runButton, resetButton);

  const feedbackMsg = el('p', 'pg-feedback-msg');
  const diff = el('ol', 'pg-diff');
  const feedback = el('div', 'pg-feedback');
  append(feedback, feedbackMsg, diff);
  const resultBlock = el('div', 'pg-block');
  append(resultBlock, el('p', 'pg-block-title', 'result'), feedback);

  const requestBody = el('pre', 'pg-request-body');
  const requestDetails = el('details', 'pg-request');
  append(requestDetails, el('summary', null, 'show the request'), requestBody);

  const side = el('div', 'pg-side');
  append(side, actions, resultBlock, requestDetails);

  const body = el('div', 'pg-body');
  append(body, codePane, side);
  append(root, head, claim, body);

  const caption = el('p', 'pg-caption', 'This panel runs the same anchor, staleness, and undo rules as the tool, reduced to one file. Press the button to walk through six steps of one edit.');

  function buildRequest() {
    return {
      remove_from: selection ? session.lines[selection.from]?.anchor ?? '' : '',
      remove_to: selection ? session.lines[selection.to]?.anchor ?? '' : '',
      replacement_lines: replacementText.split('\n'),
    };
  }

  function renderRequest() {
    requestBody.textContent = JSON.stringify(buildRequest(), null, 2);
    if (!selection) {
      call.hidden = true;
      call.textContent = '';
      return;
    }
    const from = session.lines[selection.from]?.anchor ?? '';
    const to = session.lines[selection.to]?.anchor ?? '';
    call.hidden = false;
    call.textContent = to && to !== from ? `replace('${from}', '${to}')` : `replace('${from}')`;
  }

  function renderCode() {
    code.replaceChildren();
    session.lines.forEach((line, index) => {
      const item = el('li', 'pg-line');
      if (selection && index >= selection.from && index <= selection.to) item.classList.add('is-selected');
      if (isStale(session, line)) item.classList.add('is-drifted');
      if (flashAnchors.has(line.anchor)) item.classList.add('is-flash');
      append(item, el('span', 'pg-anchor', line.anchor), el('code', 'pg-text', line.text || '\u00a0'));
      code.appendChild(item);
    });
    fileLabel.textContent = `src/anchors.ts · ${session.lines.length} lines`;
  }

  function renderRow(row) {
    const item = el('li', 'pg-diff-row');
    const prefix = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' ';
    item.classList.add(row.kind === 'added' ? 'is-add' : row.kind === 'removed' ? 'is-del' : 'is-ctx');
    const prefixNode = el('span', 'pg-diff-prefix', prefix);
    prefixNode.setAttribute('aria-hidden', 'true');
    append(item, prefixNode, el('span', 'pg-anchor', row.anchor), el('code', 'pg-text', row.text || '\u00a0'));
    return item;
  }

  function renderDiff(rows) {
    diff.replaceChildren();
    for (const row of rows) diff.appendChild(renderRow(row));
    diff.hidden = rows.length === 0;
  }

  function setResult(status, message, rows) {
    feedback.classList.remove('is-ok', 'is-error', 'is-warn', 'is-info');
    feedback.classList.add(`is-${status}`);
    feedbackMsg.textContent = message;
    renderDiff(rows || []);
    announce(message);
  }

  function selectLine(index) {
    selection = { from: index, to: index };
    renderCode();
    renderRequest();
  }

  function applyEdit(replacement) {
    if (replacement != null) replacementText = replacement;
    if (!selection) selectLine(TARGET);
    const result = replace(session, buildRequest());
    flashAnchors = result.ok ? new Set(result.rows.filter((row) => row.kind === 'added').map((row) => row.anchor)) : new Set();
    renderCode();
    renderRequest();
    return result;
  }

  function doUndo() {
    const result = undo(session);
    flashAnchors = new Set();
    renderCode();
    renderRequest();
    return result;
  }

  const steps = [
    {
      title: 'Read hands out the addresses',
      text: 'Read serves every row with its own 4-letter anchor. Nothing is addressed by line number, because numbers shift the moment the file changes.',
      action: 'Address a row',
      run() {
        selectLine(TARGET);
        return { status: 'info', message: `The row is addressed as ${session.lines[TARGET].anchor}. An edit can only name it that way.` };
      },
    },
    {
      title: 'Replace by anchor',
      text: 'replace(…) names one anchor. The edited row gets a fresh anchor, and every row you did not touch keeps its own, so the next edit needs no re-read.',
      action: 'Replace the row',
      run() {
        const result = applyEdit(REPLACEMENT);
        return { status: 'ok', message: 'Landed. The edited row now carries a new anchor; every untouched row kept the one it had.', rows: result.rows };
      },
    },
    {
      title: 'The file changes behind the tool’s back',
      text: 'Another process writes to that row after it was served. The session still remembers the text it served, so its record no longer matches the file.',
      action: 'Edit the file on disk',
      run() {
        flashAnchors = new Set();
        externalEdit(session, session.lines[TARGET].anchor, DRIFT);
        selectLine(TARGET);
        return { status: 'warn', message: 'The row changed on disk. The anchor still points at the served text, so the session record is stale.' };
      },
    },
    {
      title: 'The stale edit is refused',
      text: 'Try the same replace anyway. The tool answers [E_RANGE_STALE] with the current range and fresh anchors instead of silently editing a neighbour.',
      action: 'Try the same replace',
      run() {
        const result = applyEdit();
        return { status: result.ok ? 'ok' : 'error', message: result.message, rows: result.rows };
      },
    },
    {
      title: 'Retry after the refusal',
      text: 'The refusal re-served the current text for that range. Sending the same request again lands, with nothing re-read by hand.',
      action: 'Replace again',
      run() {
        const result = applyEdit();
        return { status: 'ok', message: 'Landed. The refusal had already refreshed the row, so the same request went through.', rows: result.rows };
      },
    },
    {
      title: 'Undo restores the session',
      text: 'The last replace reverts to the exact text this session served before it, and the session record comes back with it.',
      action: 'Undo',
      run() {
        doUndo();
        return { status: 'ok', message: 'Reverted. The row is byte-identical to the state before the replace.' };
      },
    },
  ];

  const done = {
    title: 'That is the loop',
    text: 'Anchors that survive edits, a refusal instead of a guess, and an undo that restores the bytes.',
    action: 'Run it again',
  };

  function currentStep() {
    return steps[stepIndex] || done;
  }

  function renderStep() {
    const step = currentStep();
    claimTitle.textContent = step.title;
    claimText.textContent = step.text;
    runButton.textContent = step.action;
    stepLabel.textContent = stepIndex < steps.length ? `step ${stepIndex + 1} / ${steps.length}` : 'done';
  }

  function runStep() {
    if (stepIndex >= steps.length) {
      reset();
      return;
    }
    const result = steps[stepIndex].run();
    if (result) setResult(result.status, result.message, result.rows);
    stepIndex += 1;
    renderStep();
  }

  function reset() {
    session = createSession(SOURCE);
    selection = null;
    stepIndex = 0;
    replacementText = REPLACEMENT;
    flashAnchors = new Set();
    renderCode();
    renderRequest();
    renderStep();
    setResult('info', 'Fresh session. read served every row again.', []);
  }

  runButton.addEventListener('click', runStep);
  resetButton.addEventListener('click', reset);

  renderCode();
  renderRequest();
  renderStep();
  setResult('info', 'A guided run through one edit. Press the button to start.', []);

  return {
    node: root,
    caption,
    start() {},
    stop() {},
    destroy() {
      this.stop();
    },
  };
}
