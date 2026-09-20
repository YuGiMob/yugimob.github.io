import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDegradedNotice } from '../assets/js/render.js';

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
