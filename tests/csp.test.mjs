import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withRepoCopy } from './helpers.mjs';

function run(copy, script, ...args) {
  return spawnSync(process.execPath, [join(copy, 'scripts', script), copy, ...args], { encoding: 'utf8' });
}

function stalePolicyHash(copy) {
  const page = join(copy, 'index.html');
  const source = readFileSync(page, 'utf8');
  const policy = source.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  writeFileSync(page, source.replace(policy, policy.replace(/'sha256-[A-Za-z0-9+/=]+'/, "'sha256-STALE='")));
}

test('build-csp refreshes a stale hash so the site validator accepts the page', () => {
  const result = withRepoCopy((copy) => {
    stalePolicyHash(copy);
    const stale = run(copy, 'validate-site.mjs');
    const csp = run(copy, 'build-csp.mjs');
    const fixed = run(copy, 'validate-site.mjs');
    return { stale, csp, fixed };
  });
  assert.equal(result.stale.status, 1);
  assert.match(result.stale.stderr, /CSP hash for the inline JSON-LD block is stale/);
  assert.equal(result.csp.status, 0, result.csp.stderr);
  assert.match(result.csp.stdout, /csp: updated to sha256-/);
  assert.equal(result.fixed.status, 0, result.fixed.stderr);
});

test('build-csp leaves a matching hash alone', () => {
  const result = withRepoCopy((copy) => run(copy, 'build-csp.mjs'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /csp: unchanged/);
});

test('build-csp adds a hash to a policy that has none', () => {
  const result = withRepoCopy((copy) => {
    const page = join(copy, 'index.html');
    const source = readFileSync(page, 'utf8');
    writeFileSync(page, source.replace(/ 'sha256-[A-Za-z0-9+/=]+'/, ''));
    const csp = run(copy, 'build-csp.mjs');
    const fixed = run(copy, 'validate-site.mjs');
    return { csp, fixed, page: readFileSync(page, 'utf8') };
  });
  assert.equal(result.csp.status, 0, result.csp.stderr);
  assert.match(result.csp.stdout, /csp: updated to sha256-/);
  assert.match(result.page, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  assert.equal(result.fixed.status, 0, result.fixed.stderr);
});

test('build-csp leaves a hash in another directive alone', () => {
  const result = withRepoCopy((copy) => {
    const page = join(copy, 'index.html');
    const source = readFileSync(page, 'utf8');
    const withoutScriptHash = source.replace(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/, "script-src 'self'");
    writeFileSync(page, withoutScriptHash.replace("style-src 'self';", "style-src 'self' 'sha256-STYLEHASHKEEP=';"));
    const csp = run(copy, 'build-csp.mjs');
    const fixed = run(copy, 'validate-site.mjs');
    return { csp, fixed, page: readFileSync(page, 'utf8') };
  });
  assert.equal(result.csp.status, 0, result.csp.stderr);
  assert.match(result.csp.stdout, /csp: updated to sha256-/);
  assert.match(result.page, /style-src 'self' 'sha256-STYLEHASHKEEP='/);
  assert.match(result.page, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  assert.equal(result.fixed.status, 0, result.fixed.stderr);
});

test('build-csp refuses a policy with no script-src directive', () => {
  const result = withRepoCopy((copy) => {
    const page = join(copy, 'index.html');
    const source = readFileSync(page, 'utf8');
    writeFileSync(page, source.replace(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/, 'worker-src self'));
    return run(copy, 'build-csp.mjs');
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no script-src directive/);
});

test('build-csp does not mistake script-src-elem for script-src', () => {
  const result = withRepoCopy((copy) => {
    const page = join(copy, 'index.html');
    const source = readFileSync(page, 'utf8');
    writeFileSync(page, source.replace(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/, "script-src-elem 'self'"));
    return run(copy, 'build-csp.mjs');
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no script-src directive/);
});
