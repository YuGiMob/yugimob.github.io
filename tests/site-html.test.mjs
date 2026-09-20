import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildHeroStatsBlock, readHeroStatsBlock, updateHeroStatsFile } from '../scripts/site-html-lib.mjs';
import { ROOT, withRepoCopy } from './helpers.mjs';

const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'site-data.json'), 'utf8'));

test('the committed hero stat block already matches the data', () => {
  const source = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.equal(readHeroStatsBlock(source), buildHeroStatsBlock(DATA));
});

test('updateHeroStatsFile rewrites a drifted block and leaves a matching one alone', () => {
  withRepoCopy((copy) => {
    const target = join(copy, 'index.html');
    const committed = readHeroStatsBlock(readFileSync(target, 'utf8'));
    assert.equal(updateHeroStatsFile(target, DATA).changed, false);
    const drifted = buildHeroStatsBlock({ ...DATA, stats: { ...DATA.stats, totalStars: 5 } });
    writeFileSync(target, readFileSync(target, 'utf8').replace(committed, drifted));
    const result = updateHeroStatsFile(target, DATA);
    assert.equal(result.changed, true);
    assert.equal(readHeroStatsBlock(readFileSync(target, 'utf8')), committed);
  });
});

test('updateHeroStatsFile reports a missing file and a missing block', () => {
  withRepoCopy((copy) => {
    assert.equal(updateHeroStatsFile(join(copy, 'missing.html'), DATA).ok, false);
    assert.equal(updateHeroStatsFile(join(copy, '404.html'), DATA).reason, 'no-block');
  });
});
