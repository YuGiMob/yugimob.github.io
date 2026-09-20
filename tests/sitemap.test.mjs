import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sitemapWithLastmod, updateSitemapFile } from '../scripts/sitemap-lib.mjs';

const SOURCE = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  '  <url>',
  '    <loc>https://yugimob.github.io/</loc>',
  '    <lastmod>2026-09-20</lastmod>',
  '  </url>',
  '</urlset>',
  '',
].join('\n');

test('sitemapWithLastmod replaces an existing lastmod', () => {
  const result = sitemapWithLastmod(SOURCE, '2026-09-21');
  assert.equal(result.previous, '2026-09-20');
  assert.equal(result.changed, true);
  assert.match(result.next, /<lastmod>2026-09-21<\/lastmod>/);
  assert.doesNotMatch(result.next, /2026-09-20/);
});

test('sitemapWithLastmod inserts a lastmod after the loc when none exists', () => {
  const source = SOURCE.replace('    <lastmod>2026-09-20</lastmod>\n', '');
  const result = sitemapWithLastmod(source, '2026-09-21');
  assert.equal(result.previous, undefined);
  assert.equal(result.changed, true);
  assert.match(result.next, /<\/loc>\n    <lastmod>2026-09-21<\/lastmod>/);
});

test('sitemapWithLastmod reports no change and refuses a document without a loc', () => {
  assert.equal(sitemapWithLastmod(SOURCE, '2026-09-20').changed, false);
  assert.equal(sitemapWithLastmod('<urlset></urlset>', '2026-09-21'), null);
});

test('updateSitemapFile writes atomically and reports the outcome', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yugimob-sitemap-'));
  try {
    const path = join(dir, 'sitemap.xml');
    assert.deepEqual(updateSitemapFile(path, '2026-09-21'), { ok: false, reason: 'missing' });

    writeFileSync(path, SOURCE);
    const updated = updateSitemapFile(path, '2026-09-21');
    assert.equal(updated.ok, true);
    assert.equal(updated.previous, '2026-09-20');
    assert.match(readFileSync(path, 'utf8'), /<lastmod>2026-09-21<\/lastmod>/);
    assert.equal(updateSitemapFile(path, '2026-09-21').changed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
