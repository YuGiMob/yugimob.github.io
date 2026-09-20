import { el, append, announce, copyText, createController } from './ui.js';
import { createSession, replace, insert, anchorGrep, undo, externalEdit, isStale } from './hashline.js';

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

const TARGET_LINE = '  if (from < 0 || to < 0) return stale(lines)';
const TARGET = SOURCE.indexOf(TARGET_LINE);
const REPLACEMENT = "  if (from < 0 || to < 0) return stale(lines, 'range')";
const DRIFT = '  if (from < 0 || to < 0) return staleRange(lines)';
const INSERTED = ['  if (from > to) [from, to] = [to, from]'];
const GREP_PATTERN = 'stale';
const STEP_PARAM = 'step';

function requestedStep() {
  if (typeof window === 'undefined' || !window.location?.search) return 0;
  const value = Number(new URLSearchParams(window.location.search).get(STEP_PARAM));
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function buildPlayground() {
  let session = createSession(SOURCE);
  let selection = null;
  let stepIndex = 0;
  let replacementText = REPLACEMENT;
  let targetAnchor = session.lines[TARGET].anchor;
  let flashAnchors = new Set();
  let replaying = false;

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
  code.setAttribute('role', 'listbox');
  code.setAttribute('aria-label', 'File rows, each addressed by its own anchor. Select a row with Enter or a click.');
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
  const copyRequest = el('button', 'pg-copy-request', 'copy');
  copyRequest.type = 'button';
  const requestDetails = el('details', 'pg-request');
  append(requestDetails, el('summary', null, 'show the request'), requestBody, copyRequest);

  const side = el('div', 'pg-side');
  append(side, actions, resultBlock, requestDetails);

  const body = el('div', 'pg-body');
  append(body, codePane, side);
  append(root, head, claim, body);

  const caption = el('p', 'pg-caption', 'This panel runs the same anchor, staleness, insert, and undo rules as the tool, reduced to one file. Click or focus a row to select it, then press the button to walk through the steps of one edit.');

  function lineIndexByAnchor(anchor) {
    return session.lines.findIndex((line) => line.anchor === anchor);
  }

  function replaceRequest() {
    return {
      remove_from: selection ? session.lines[selection.from]?.anchor ?? '' : '',
      remove_to: selection ? session.lines[selection.to]?.anchor ?? '' : '',
      replacement_lines: replacementText.split('\n'),
    };
  }

  function insertRequest() {
    return { anchor: targetAnchor, direction: 'after', lines: INSERTED };
  }

  function grepRequest() {
    return { pattern: GREP_PATTERN, path: 'src/anchors.ts', context: 1 };
  }

  function renderRequest(preview) {
    if (replaying) return;
    requestBody.textContent = JSON.stringify(preview ? preview() : replaceRequest(), null, 2);
  }

  function focusRow(index) {
    const node = code.querySelector(`[data-index="${index}"]`);
    if (node) node.focus({ preventScroll: true });
  }

  function renderCode() {
    if (replaying) return;
    const focused = document.activeElement && code.contains(document.activeElement)
      ? Number(document.activeElement.dataset.index)
      : null;
    code.replaceChildren();
    session.lines.forEach((line, index) => {
      const item = el('li', 'pg-line');
      item.dataset.index = String(index);
      item.dataset.anchor = line.anchor;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', selection && index >= selection.from && index <= selection.to ? 'true' : 'false');
      item.setAttribute('aria-label', `line ${index + 1}, anchor ${line.anchor}: ${line.text || 'blank'}`);
      item.tabIndex = selection ? (index === selection.from ? 0 : -1) : index === 0 ? 0 : -1;
      if (selection && index >= selection.from && index <= selection.to) item.classList.add('is-selected');
      if (isStale(session, line)) item.classList.add('is-drifted');
      if (flashAnchors.has(line.anchor)) item.classList.add('is-flash');
      append(item, el('span', 'pg-anchor', line.anchor), el('code', 'pg-text', line.text || '\u00a0'));
      code.appendChild(item);
    });
    fileLabel.textContent = `src/anchors.ts · ${session.lines.length} lines`;
    if (focused != null) focusRow(focused);
  }

  function renderRow(row) {
    const item = el('li', 'pg-diff-row');
    const prefix = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : row.kind === 'match' ? '›' : ' ';
    item.classList.add(row.kind === 'added' ? 'is-add' : row.kind === 'removed' ? 'is-del' : row.kind === 'match' ? 'is-match' : 'is-ctx');
    const prefixNode = el('span', 'pg-diff-prefix', prefix);
    prefixNode.setAttribute('aria-hidden', 'true');
    const lineNumber = Number.isInteger(row.line) ? el('span', 'pg-line-number', String(row.line)) : null;
    append(item, prefixNode, lineNumber, el('span', 'pg-anchor', row.anchor), el('code', 'pg-text', row.text || '\u00a0'));
    return item;
  }

  function renderDiff(rows) {
    diff.replaceChildren();
    for (const row of rows) diff.appendChild(renderRow(row));
    diff.hidden = rows.length === 0;
  }

  function setResult(status, message, rows) {
    if (replaying) return;
    feedback.classList.remove('is-ok', 'is-error', 'is-warn', 'is-info');
    feedback.classList.add(`is-${status}`);
    feedbackMsg.textContent = message;
    renderDiff(rows || []);
    announce(message);
  }

  function selectLine(index) {
    selection = { from: index, to: index };
    renderCode();
    renderRequest(currentStep().preview);
  }

  function extendSelection(index) {
    if (!selection) {
      selectLine(index);
      return;
    }
    selection = { from: Math.min(selection.from, index), to: Math.max(selection.from, index) };
    renderCode();
    renderRequest(currentStep().preview);
  }

  function applyEdit(replacement) {
    if (replacement != null) replacementText = replacement;
    if (!selection) selectLine(lineIndexByAnchor(targetAnchor));
    const result = replace(session, replaceRequest());
    flashAnchors = result.ok ? new Set(result.rows.filter((row) => row.kind === 'added').map((row) => row.anchor)) : new Set();
    renderCode();
    renderRequest(currentStep().preview);
    return result;
  }

  function replaceTarget(replacement) {
    const index = lineIndexByAnchor(targetAnchor);
    if (index >= 0) selectLine(index);
    const result = applyEdit(replacement);
    const line = session.lines[index];
    if (result.ok && line) targetAnchor = line.anchor;
    return result;
  }

  function runInsert() {
    const result = insert(session, insertRequest());
    flashAnchors = result.ok ? new Set(result.rows.filter((row) => row.kind === 'added').map((row) => row.anchor)) : new Set();
    renderCode();
    renderRequest(currentStep().preview);
    return result;
  }

  function runGrep() {
    const result = anchorGrep(session, grepRequest());
    const match = result.rows.find((row) => row.kind === 'match' && row.anchor === targetAnchor);
    if (match) selectLine(lineIndexByAnchor(match.anchor));
    else renderDiff(result.rows);
    return result;
  }

  const steps = [
    {
      title: 'Read hands out the addresses',
      text: 'Read serves every row with its own 4-letter anchor. Nothing is addressed by line number, because numbers shift the moment the file changes.',
      action: 'Address a row',
      preview: () => ({ path: 'src/anchors.ts', offset: 1, limit: 20 }),
      call: () => '',
      run() {
        selectLine(lineIndexByAnchor(targetAnchor));
        return { status: 'info', message: `The row is addressed as ${targetAnchor}. An edit can only name it that way.` };
      },
    },
    {
      title: 'Replace by anchor',
      text: 'replace(…) names one anchor. The edited row gets a fresh anchor, and every row you did not touch keeps its own, so the next edit needs no re-read.',
      action: 'Replace the row',
      preview: replaceRequest,
      call: () => `replace('${targetAnchor}')`,
      run() {
        const result = replaceTarget(REPLACEMENT);
        return { status: 'ok', message: 'Landed. The edited row now carries a new anchor; every untouched row kept the one it had.', rows: result.rows };
      },
    },
    {
      title: 'Insert beside an anchor',
      text: 'insert(…) adds lines before or after an anchor and removes nothing. The anchor line survives with its own anchor, and insert never runs the boundary de-duplication that replace uses.',
      action: 'Insert a line',
      preview: insertRequest,
      call: () => `insert('${targetAnchor}', 'after')`,
      run() {
        const result = runInsert();
        return { status: 'ok', message: 'Added below the anchor. The anchor line kept its address; the new row got its own.', rows: result.rows };
      },
    },
    {
      title: 'Find a row by anchor',
      text: 'anchor_grep returns each match and its context as lineNumber │ anchor│content, served exactly like read output. A search result is already editable, so it never needs a follow-up read.',
      action: `Search for “${GREP_PATTERN}”`,
      preview: grepRequest,
      call: () => `anchor_grep('${GREP_PATTERN}')`,
      run() {
        const result = runGrep();
        return { status: 'info', message: 'The matching row carries the same anchor read handed out, so it can be edited in place.', rows: result.rows };
      },
    },
    {
      title: 'The file changes behind the tool’s back',
      text: 'Another process writes to that row after it was served. The session still remembers the text it served, so its record no longer matches the file.',
      action: 'Edit the file on disk',
      preview: replaceRequest,
      call: () => `replace('${targetAnchor}')`,
      run() {
        flashAnchors = new Set();
        externalEdit(session, targetAnchor, DRIFT);
        selectLine(lineIndexByAnchor(targetAnchor));
        return { status: 'warn', message: 'The row changed on disk. The anchor still points at the served text, so the session record is stale.' };
      },
    },
    {
      title: 'The stale edit is refused',
      text: 'Try the same replace anyway. The tool answers [E_RANGE_STALE] with the current range and fresh anchors instead of silently editing a neighbour.',
      action: 'Try the same replace',
      preview: replaceRequest,
      call: () => `replace('${targetAnchor}')`,
      run() {
        const index = lineIndexByAnchor(targetAnchor);
        if (index >= 0) selectLine(index);
        const result = applyEdit();
        return { status: result.ok ? 'ok' : 'error', message: result.message, rows: result.rows };
      },
    },
    {
      title: 'Retry after the refusal',
      text: 'The refusal re-served the current text for that range. Sending the same request again lands, with nothing re-read by hand.',
      action: 'Replace again',
      preview: replaceRequest,
      call: () => `replace('${targetAnchor}')`,
      run() {
        const result = applyEdit();
        return { status: 'ok', message: 'Landed. The refusal had already refreshed the row, so the same request went through.', rows: result.rows };
      },
    },
    {
      title: 'Undo restores the session',
      text: 'Undo reverts the most recent replace or insert, and only that one: the line inserted in step 3 stays where it is. The record comes back with the bytes.',
      action: 'Undo',
      preview: () => ({ path: 'src/anchors.ts' }),
      call: () => 'undo_last_change()',
      run() {
        const result = undo(session);
        flashAnchors = new Set();
        renderCode();
        renderRequest(currentStep().preview);
        return { status: result.ok ? 'ok' : 'error', message: result.ok ? 'Reverted. The row is byte-identical to the state before the last replace.' : result.message };
      },
    },
  ];

  const done = {
    title: 'That is the loop',
    text: 'Anchors that survive edits, insertions that never renumber, a search that is already editable, a refusal instead of a guess, and an undo that restores the bytes.',
    action: 'Run it again',
    preview: replaceRequest,
    call: () => '',
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
    const callText = step.call ? step.call() : '';
    call.hidden = callText.length === 0;
    call.textContent = callText;
    renderRequest(step.preview);
  }

  function updateUrl() {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const url = new URL(window.location.href);
    if (stepIndex > 0) url.searchParams.set(STEP_PARAM, String(stepIndex));
    else url.searchParams.delete(STEP_PARAM);
    window.history.replaceState(null, '', url);
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
    updateUrl();
  }

  function replayTo(count) {
    replaying = true;
    for (let index = 0; index < count && index < steps.length; index += 1) {
      steps[index].run();
      stepIndex = index + 1;
    }
    replaying = false;
  }

  function reset() {
    session = createSession(SOURCE);
    selection = null;
    stepIndex = 0;
    replacementText = REPLACEMENT;
    targetAnchor = session.lines[TARGET].anchor;
    flashAnchors = new Set();
    renderCode();
    renderStep();
    setResult('info', 'Fresh session. read served every row again.', []);
    updateUrl();
  }

  code.addEventListener('click', (event) => {
    const row = event.target.closest('.pg-line');
    if (!row) return;
    const index = Number(row.dataset.index);
    if (event.shiftKey) extendSelection(index);
    else selectLine(index);
  });

  code.addEventListener('keydown', (event) => {
    const row = event.target.closest('.pg-line');
    if (!row) return;
    const index = Number(row.dataset.index);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (event.shiftKey) extendSelection(index);
      else selectLine(index);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? Math.min(session.lines.length - 1, index + 1) : Math.max(0, index - 1);
    const node = code.querySelector(`[data-index="${next}"]`);
    if (!node) return;
    for (const option of code.querySelectorAll('.pg-line')) option.tabIndex = -1;
    node.tabIndex = 0;
    node.focus();
  });

  copyRequest.addEventListener('click', async () => {
    try {
      await copyText(requestBody.textContent);
      copyRequest.textContent = 'copied';
      announce('copied the request');
    } catch {
      copyRequest.textContent = 'copy failed';
      announce('copy failed for the request');
    }
    setTimeout(() => {
      copyRequest.textContent = 'copy';
    }, 1500);
  });

  runButton.addEventListener('click', runStep);
  resetButton.addEventListener('click', reset);

  replayTo(Math.min(requestedStep(), steps.length));
  renderCode();
  renderStep();
  if (stepIndex === 0) setResult('info', 'A guided run through one edit. Press the button to start.', []);
  else setResult('info', `Replayed ${stepIndex} of ${steps.length} steps from the link.`, []);

  return createController(root, () => {}, null, caption);
}
