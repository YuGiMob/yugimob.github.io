const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function anchorFor(text) {
  let hash = FNV_OFFSET;
  const sample = text.slice(0, 500);
  for (let index = 0; index < sample.length; index += 1) {
    hash ^= sample.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(36).padStart(4, '0').slice(-4);
}

function allocateAnchor(session, text) {
  let candidate = anchorFor(text);
  let attempt = 0;
  while (session.anchors.has(candidate)) {
    attempt += 1;
    candidate = anchorFor(`${text}\u0000${attempt}`);
  }
  session.anchors.add(candidate);
  return candidate;
}

function snapshot(session) {
  return {
    lines: session.lines.map((line) => ({ anchor: line.anchor, text: line.text })),
    anchors: new Set(session.anchors),
    served: new Map(session.served),
  };
}

export function createSession(sourceLines) {
  const session = { lines: [], anchors: new Set(), served: new Map(), undo: null };
  for (const text of sourceLines) {
    session.lines.push({ anchor: allocateAnchor(session, text), text });
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
  const removeTo = String(request.remove_to ?? removeFrom);
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
  const replacements = Array.isArray(request.replacement_lines) ? request.replacement_lines.map(String) : [];
  if (replacements.some((text) => text.includes('\u0000'))) {
    return refuse(session, 'E_BAD_SHAPE', 'Replacement text contains a NUL byte.', rangeRows(session, fromIndex, toIndex));
  }
  session.undo = snapshot(session);
  const removed = session.lines.slice(fromIndex, toIndex + 1);
  for (const line of removed) session.anchors.delete(line.anchor);
  const added = replacements.map((text) => ({ anchor: allocateAnchor(session, text), text }));
  session.lines.splice(fromIndex, removed.length, ...added);
  const rows = [];
  const before = session.lines[fromIndex - 1];
  const after = session.lines[fromIndex + added.length];
  if (before) rows.push({ kind: 'context', anchor: before.anchor, text: before.text });
  for (const line of removed) rows.push({ kind: 'removed', anchor: line.anchor, text: line.text });
  for (const line of added) rows.push({ kind: 'added', anchor: line.anchor, text: line.text });
  if (after) rows.push({ kind: 'context', anchor: after.anchor, text: after.text });
  serveRows(session, rows);
  return { ok: true, code: null, message: `replace('${removeFrom}'${removeTo === removeFrom ? '' : `, '${removeTo}'`}) → ${added.length} added, ${removed.length} removed`, rows };
}

export function undo(session) {
  if (!session.undo) {
    return { ok: false, code: 'E_NOTHING_TO_UNDO', message: '[E_NOTHING_TO_UNDO] No replace or insert to revert.', rows: [] };
  }
  const restored = session.undo;
  const count = session.lines.length;
  session.lines = restored.lines.map((line) => ({ anchor: line.anchor, text: line.text }));
  session.anchors = new Set(restored.anchors);
  session.served = new Map(restored.served);
  session.undo = null;
  return { ok: true, code: null, message: `undo_last_change → restored ${count} lines`, rows: readRows(session) };
}

export function externalEdit(session, anchor, text) {
  const line = session.lines.find((candidate) => candidate.anchor === anchor);
  if (!line) return false;
  line.text = text;
  return true;
}

export function staleCount(session) {
  return session.lines.filter((line) => isStale(session, line)).length;
}
