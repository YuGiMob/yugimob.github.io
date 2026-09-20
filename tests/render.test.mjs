import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVisibility, renderDegradedNotice, renderStructuredData } from '../assets/js/render.js';

function withDocument(element, run) {
  const original = globalThis.document;
  globalThis.document = { getElementById: () => element };
  try {
    run();
  } finally {
    globalThis.document = original;
  }
}

test('renderDegradedNotice reveals the notice before writing the message', () => {
  const notice = { hidden: true };
  let hiddenWhenWritten = null;
  Object.defineProperty(notice, 'textContent', {
    get() {
      return this.value;
    },
    set(value) {
      hiddenWhenWritten = notice.hidden;
      this.value = value;
    },
  });
  withDocument(notice, () => renderDegradedNotice('fallback in use'));
  assert.equal(hiddenWhenWritten, false);
  assert.equal(notice.hidden, false);
  assert.equal(notice.textContent, 'fallback in use');
});

test('renderDegradedNotice does nothing when the page has no notice element', () => {
  withDocument(null, () => renderDegradedNotice('fallback in use'));
});

function withElements(ids, run) {
  const nodes = new Map(ids.map((id) => [id, { hidden: false }]));
  const original = globalThis.document;
  globalThis.document = { getElementById: (id) => nodes.get(id) ?? null };
  try {
    run(nodes);
  } finally {
    globalThis.document = original;
  }
}

const VISIBLE_IDS = ['problems', 'evidence', 'colophon', 'campfire', 'hero-stats'];

test('applyVisibility hides every section the data turns off', () => {
  withElements(VISIBLE_IDS, (nodes) => {
    applyVisibility({ showArtifacts: false, showAbout: false, showAbilityScores: false, showCampfire: false }, {});
    for (const id of VISIBLE_IDS) assert.equal(nodes.get(id).hidden, true);
  });
});

test('applyVisibility defaults to showing sections and follows the evidence block', () => {
  withElements(VISIBLE_IDS, (nodes) => {
    applyVisibility({}, { evidence: { name: 'tool' } });
    for (const id of VISIBLE_IDS) assert.equal(nodes.get(id).hidden, false);
    applyVisibility({}, {});
    assert.equal(nodes.get('evidence').hidden, true);
    assert.equal(nodes.get('problems').hidden, false);
  });
});

test('renderStructuredData writes the JSON-LD through a text node', () => {
  const structured = {
    identity: { displayName: 'Tester', classTitle: 'Testing', tagline: 'A tagline.', links: {} },
    projects: [{ name: 'tool', url: 'https://github.com/tester/tool', description: 'A tool.' }],
    activity: { fetchedAt: '2026-09-20' },
  };
  const showcase = { problems: [{ name: 'tool' }] };
  let written = null;
  const script = {
    replaceChildren(node) {
      written = node.textContent;
    },
    set textContent(value) {
      throw new TypeError(`TrustedScript required, got ${value}`);
    },
  };
  const original = globalThis.document;
  globalThis.document = {
    getElementById: () => script,
    createTextNode: (value) => ({ textContent: value }),
  };
  try {
    renderStructuredData(structured, showcase);
  } finally {
    globalThis.document = original;
  }
  assert.match(written, /"@type":"ItemList"/);
  assert.match(written, /"name":"tool"/);
});
