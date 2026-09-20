export function hexToRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function relativeLuminance(rgb) {
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground, background) {
  const first = hexToRgb(foreground);
  const second = hexToRgb(background);
  if (!first || !second) return null;
  const one = relativeLuminance(first);
  const two = relativeLuminance(second);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

export function paletteFrom(source) {
  const palette = new Map();
  for (const match of String(source).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) palette.set(match[1], match[2]);
  return palette;
}

export function rootPaletteSource(source) {
  const match = String(source).match(/:root\s*\{([^}]*)\}/);
  return match ? match[1] : '';
}
