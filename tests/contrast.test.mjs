import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, hexToRgb, paletteFrom, relativeLuminance, rootPaletteSource } from '../scripts/contrast-lib.mjs';

test('hexToRgb parses a six-digit hex color and refuses anything else', () => {
  assert.deepEqual(hexToRgb('#ff8040'), [255, 128, 64]);
  assert.deepEqual(hexToRgb('#000000'), [0, 0, 0]);
  assert.equal(hexToRgb('red'), null);
  assert.equal(hexToRgb('#fff'), null);
  assert.equal(hexToRgb(undefined), null);
});

test('relativeLuminance follows the WCAG definition', () => {
  assert.equal(relativeLuminance([0, 0, 0]), 0);
  assert.equal(relativeLuminance([255, 255, 255]), 1);
  assert.ok(relativeLuminance([255, 128, 64]) > 0.2 && relativeLuminance([255, 128, 64]) < 0.4);
});

test('contrastRatio matches the known WCAG extremes', () => {
  assert.equal(contrastRatio('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
  assert.equal(contrastRatio('#123456', '#123456'), 1);
  assert.equal(contrastRatio('nope', '#ffffff'), null);
});

test('paletteFrom reads custom properties from a stylesheet', () => {
  const palette = paletteFrom(':root { --ink: #1b1814; --paper: #f6f1e7; --shadow: rgba(0, 0, 0, 0.15); }');
  assert.deepEqual([...palette.entries()], [['ink', '#1b1814'], ['paper', '#f6f1e7']]);
});

test('rootPaletteSource reads only the base :root block', () => {
  const source = ':root { --ink: #111111; --paper: #ffffff; }\n@media (prefers-contrast: more) { :root { --ink: #000000; } }';
  assert.equal(rootPaletteSource(source), ' --ink: #111111; --paper: #ffffff; ');
  assert.equal(rootPaletteSource('body { color: red; }'), '');
});
