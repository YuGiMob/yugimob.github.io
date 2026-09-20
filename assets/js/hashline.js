const ANCHOR_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ANCHOR_SPACE = ANCHOR_LETTERS.length ** 4;
const MINT_STRIDE = 3000017;

function anchorAt(index) {
  let value = ((index % ANCHOR_SPACE) + ANCHOR_SPACE) % ANCHOR_SPACE;
  let anchor = '';
  for (let position = 0; position < 4; position += 1) {
    anchor = ANCHOR_LETTERS[value % ANCHOR_LETTERS.length] + anchor;
    value = Math.floor(value / ANCHOR_LETTERS.length);
  }
  return anchor;
}

function seedMintIndex(random) {
  return Math.floor(random() * ANCHOR_SPACE);
}

function allocateAnchor(session) {
  for (let attempt = 0; attempt < ANCHOR_SPACE; attempt += 1) {
    const candidate = anchorAt(session.mintIndex);
    session.mintIndex = (session.mintIndex + MINT_STRIDE) % ANCHOR_SPACE;
    if (!session.anchors.has(candidate)) {
      session.anchors.add(candidate);
      return candidate;
    }
  }
  throw new Error('anchor pool exhausted');
}

function snapshot(session) {
  return {
    lines: session.lines.map((line) => ({ anchor: line.anchor, text: line.text })),
    anchors: new Set(session.anchors),
    served: new Map(session.served),
    mintIndex: session.mintIndex,
  };
}

export function createSession(sourceLines, random = Math.random) {
  const session = { lines: [], anchors: new Set(), served: new Map(), mintIndex: seedMintIndex(random), undo: null };
  for (const text of sourceLines) {
    session.lines.push({ anchor: allocateAnchor(session), text });
  }
  serveAll(session);
  return session;
}

export function serveAll(session) {
  for (const line of session.lines) session.served.set(line.anchor, line.text);
}

export function readRows(session) {
  return session.lines.map((line) => ({ kind: 'context', anchor: line.anchor, text: line.text }));
}

export function isStale(session, line) {
  return session.served.get(line.anchor) !== line.text;
}

function rangeRows(session, from, to) {
  const start = Math.max(0, from - 1);
  const end = Math.min(session.lines.length - 1, to + 1);
  return session.lines.slice(start, end + 1).map((line) => ({ kind: 'context', anchor: line.anchor, text: line.text }));
}

function serveRows(session, rows) {
  for (const row of rows) {
    if (row.kind !== 'removed') session.served.set(row.anchor, row.text);
  }
}

function refuse(session, code, message, rows) {
  const served = rows || readRows(session);
  serveRows(session, served);
  return { ok: false, code, message: `[${code}] ${message}`, rows: served };
}

export function replace(session, request) {
  const removeFrom = String(request.remove_from ?? '');
  const rawRemoveTo = request.remove_to;
  const removeTo = rawRemoveTo == null || String(rawRemoveTo) === '' ? removeFrom : String(rawRemoveTo);
  let fromIndex = session.lines.findIndex((line) => line.anchor === removeFrom);
  let toIndex = session.lines.findIndex((line) => line.anchor === removeTo);
  if (fromIndex < 0 || toIndex < 0) {
    return refuse(session, 'E_STALE_ANCHOR', 'Anchor is not owned in this session. Read the file before editing.');
  }
  if (fromIndex > toIndex) {
    const swap = fromIndex;
    fromIndex = toIndex;
    toIndex = swap;
  }
  for (let index = fromIndex; index <= toIndex; index += 1) {
    const line = session.lines[index];
    if (isStale(session, line)) {
      return refuse(session, 'E_RANGE_STALE', 'The range changed on disk since it was served. Fresh anchors below.', rangeRows(session, fromIndex, toIndex));
    }
  }
  if (request.replacement_lines != null && !Array.isArray(request.replacement_lines)) {
    return refuse(session, 'E_BAD_SHAPE', 'replace needs replacement_lines as an array.', rangeRows(session, fromIndex, toIndex));
  }
  const replacements = Array.isArray(request.replacement_lines) ? request.replacement_lines.map(String) : [];
  if (replacements.some((text) => text.includes('\u0000'))) {
    return refuse(session, 'E_BAD_SHAPE', 'Replacement text contains a NUL byte.', rangeRows(session, fromIndex, toIndex));
  }
  session.undo = snapshot(session);
  const removed = session.lines.slice(fromIndex, toIndex + 1);
  for (const line of removed) {
    session.anchors.delete(line.anchor);
    session.served.delete(line.anchor);
  }
  const added = replacements.map((text) => ({ anchor: allocateAnchor(session), text }));
  session.lines.splice(fromIndex, removed.length, ...added);
  const rows = [];
  const before = session.lines[fromIndex - 1];
  const after = session.lines[fromIndex + added.length];
  if (before) rows.push({ kind: 'context', anchor: before.anchor, text: before.text });
  for (const line of removed) rows.push({ kind: 'removed', anchor: line.anchor, text: line.text });
  for (const line of added) rows.push({ kind: 'added', anchor: line.anchor, text: line.text });
  if (after) rows.push({ kind: 'context', anchor: after.anchor, text: after.text });
  serveRows(session, rows);
  return { ok: true, code: null, message: `replace('${removeFrom}'${removeTo === removeFrom ? '' : `, '${removeTo}'`}): ${added.length} added, ${removed.length} removed`, rows };
}

export function insert(session, request) {
  const anchor = String(request.anchor ?? '');
  const index = session.lines.findIndex((line) => line.anchor === anchor);
  if (index < 0) {
    return refuse(session, 'E_STALE_ANCHOR', 'Anchor is not owned in this session. Read the file before editing.');
  }
  const line = session.lines[index];
  if (isStale(session, line)) {
    return refuse(session, 'E_RANGE_STALE', 'The anchor line changed on disk since it was served. Fresh anchors below.', rangeRows(session, index, index));
  }
  const rawDirection = request.direction;
  if (rawDirection != null && rawDirection !== 'before' && rawDirection !== 'after') {
    return refuse(session, 'E_BAD_SHAPE', "insert needs a direction of 'before' or 'after'.", rangeRows(session, index, index));
  }
  const direction = rawDirection === 'before' ? 'before' : 'after';
  if (request.lines != null && !Array.isArray(request.lines)) {
    return refuse(session, 'E_BAD_SHAPE', 'insert needs lines as an array.', rangeRows(session, index, index));
  }
  const lines = Array.isArray(request.lines) ? request.lines.map(String) : [];
  if (lines.some((text) => text.includes('\u0000'))) {
    return refuse(session, 'E_BAD_SHAPE', 'Inserted text contains a NUL byte.', rangeRows(session, index, index));
  }
  if (lines.length === 0) {
    return { ok: true, code: null, message: `insert('${anchor}', ${direction}): nothing to insert`, rows: [] };
  }
  session.undo = snapshot(session);
  const added = lines.map((text) => ({ anchor: allocateAnchor(session), text }));
  const following = session.lines[index + 1];
  const at = direction === 'before' ? index : index + 1;
  session.lines.splice(at, 0, ...added);
  const rows = [];
  if (direction === 'before') {
    for (const addedLine of added) rows.push({ kind: 'added', anchor: addedLine.anchor, text: addedLine.text });
    rows.push({ kind: 'context', anchor: line.anchor, text: line.text });
  } else {
    rows.push({ kind: 'context', anchor: line.anchor, text: line.text });
    for (const addedLine of added) rows.push({ kind: 'added', anchor: addedLine.anchor, text: addedLine.text });
  }
  if (following) rows.push({ kind: 'context', anchor: following.anchor, text: following.text });
  serveRows(session, rows);
  return { ok: true, code: null, message: `insert('${anchor}', ${direction}): ${added.length} added`, rows };
}

export function anchorGrep(session, request) {
  const pattern = String(request.pattern ?? '');
  if (pattern.length === 0) {
    return refuse(session, 'E_BAD_SHAPE', 'anchor_grep needs a pattern.', []);
  }
  if (request.literal != null && typeof request.literal !== 'boolean') {
    return refuse(session, 'E_BAD_SHAPE', 'anchor_grep needs literal as a boolean.', []);
  }
  if (request.ignoreCase != null && typeof request.ignoreCase !== 'boolean') {
    return refuse(session, 'E_BAD_SHAPE', 'anchor_grep needs ignoreCase as a boolean.', []);
  }
  const literal = request.literal === true;
  const ignoreCase = request.ignoreCase === true;
  if (request.context != null && !Number.isInteger(request.context)) {
    return refuse(session, 'E_BAD_SHAPE', 'anchor_grep needs context as a whole number.', []);
  }
  if (request.limit != null && !Number.isInteger(request.limit)) {
    return refuse(session, 'E_BAD_SHAPE', 'anchor_grep needs limit as a whole number.', []);
  }
  const contextSize = Number.isInteger(request.context) ? Math.max(0, request.context) : 0;
  const limit = Number.isInteger(request.limit) ? Math.max(1, request.limit) : 100;
  let matchesLine;
  try {
    if (literal) {
      const needle = ignoreCase ? pattern.toLowerCase() : pattern;
      matchesLine = (text) => (ignoreCase ? text.toLowerCase() : text).includes(needle);
    } else {
      const expression = new RegExp(pattern, ignoreCase ? 'i' : '');
      matchesLine = (text) => expression.test(text);
    }
  } catch {
    return refuse(session, 'E_BAD_SHAPE', 'The pattern is not a valid regular expression. Search with literal: true for plain text.', []);
  }
  const matches = [];
  for (let index = 0; index < session.lines.length && matches.length < limit; index += 1) {
    if (matchesLine(session.lines[index].text)) matches.push(index);
  }
  if (matches.length === 0) {
    return { ok: true, code: null, message: `anchor_grep('${pattern}'): 0 matches`, rows: [] };
  }
  const matched = new Set(matches);
  const emitted = new Set();
  for (const index of matches) {
    for (let cursor = index - contextSize; cursor <= index + contextSize; cursor += 1) {
      if (cursor >= 0 && cursor < session.lines.length) emitted.add(cursor);
    }
  }
  const rows = [...emitted]
    .sort((a, b) => a - b)
    .map((index) => ({
      kind: matched.has(index) ? 'match' : 'context',
      anchor: session.lines[index].anchor,
      text: session.lines[index].text,
      line: index + 1,
    }));
  serveRows(session, rows);
  const word = matches.length === 1 ? 'match' : 'matches';
  return { ok: true, code: null, message: `anchor_grep('${pattern}'): ${matches.length} ${word}`, rows };
}

export function undo(session) {
  if (!session.undo) {
    return { ok: false, code: 'E_NOTHING_TO_UNDO', message: '[E_NOTHING_TO_UNDO] No replace to revert.', rows: [] };
  }
  const restored = session.undo;
  session.lines = restored.lines.map((line) => ({ anchor: line.anchor, text: line.text }));
  session.anchors = new Set(restored.anchors);
  session.served = new Map(restored.served);
  session.mintIndex = restored.mintIndex;
  session.undo = null;
  return { ok: true, code: null, message: `undo_last_change: restored the state before the last replace`, rows: readRows(session) };
}

export function externalEdit(session, anchor, text) {
  const line = session.lines.find((candidate) => candidate.anchor === anchor);
  if (!line) return false;
  line.text = text;
  return true;
}
