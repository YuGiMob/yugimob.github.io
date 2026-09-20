import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptSrcHash, withScriptSrcHash } from '../scripts/csp-lib.mjs';

const POLICY = "default-src 'self'; style-src 'self'; script-src 'self' 'sha256-OLD='; connect-src 'self'";

test('scriptSrcHash reads the hash from script-src and ignores other directives', () => {
  assert.equal(scriptSrcHash(POLICY), 'OLD=');
  assert.equal(scriptSrcHash("style-src 'self' 'sha256-STYLE='; script-src 'self'"), null);
  assert.equal(scriptSrcHash("style-src 'self' 'sha256-STYLE='"), null);
  assert.equal(scriptSrcHash('default-src self'), null);
  assert.equal(scriptSrcHash(undefined), null);
});

test('scriptSrcHash does not mistake script-src-elem for script-src', () => {
  assert.equal(scriptSrcHash("script-src-elem 'self' 'sha256-ELEM='"), null);
});

test('withScriptSrcHash replaces the hash inside script-src only', () => {
  const next = withScriptSrcHash("style-src 'self' 'sha256-STYLE='; script-src 'self' 'sha256-OLD='; connect-src 'self'", 'NEW=');
  assert.match(next, /style-src 'self' 'sha256-STYLE='/);
  assert.match(next, /script-src 'self' 'sha256-NEW='/);
  assert.doesNotMatch(next, /OLD=/);
});

test('withScriptSrcHash appends a hash when script-src has none', () => {
  assert.equal(withScriptSrcHash("script-src 'self'; connect-src 'self'", 'NEW='), "script-src 'self' 'sha256-NEW='; connect-src 'self'");
  assert.equal(withScriptSrcHash('script-src', 'NEW='), "script-src 'sha256-NEW='");
  assert.equal(withScriptSrcHash("style-src 'self' 'sha256-STYLE='", 'NEW='), null);
});

test('withScriptSrcHash treats script-src-elem as a different directive', () => {
  assert.equal(withScriptSrcHash("script-src-elem 'self'", 'NEW='), null);
});
