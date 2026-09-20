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

const LMS_FROM_LINEAR_RGB = [
  [0.31399022, 0.63951294, 0.04649755],
  [0.15537241, 0.75789446, 0.08670142],
  [0.01775239, 0.10944209, 0.87256922],
];

const DICHROMACY_MATRICES = new Map([
  ['protanopia', [[0, 1.05118294, -0.05116099], [0, 1, 0], [0, 0, 1]]],
  ['deuteranopia', [[1, 0, 0], [0.9513092, 0, 0.04866992], [0, 0, 1]]],
]);

function multiply(matrix, vector) {
  return matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);
}

function inverse(matrix) {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  const first = e * i - f * h;
  const second = f * g - d * i;
  const third = d * h - e * g;
  const determinant = a * first + b * second + c * third;
  return [
    [first / determinant, (c * h - b * i) / determinant, (b * f - c * e) / determinant],
    [second / determinant, (a * i - c * g) / determinant, (c * d - a * f) / determinant],
    [third / determinant, (b * g - a * h) / determinant, (a * e - b * d) / determinant],
  ];
}

const LINEAR_RGB_FROM_LMS = inverse(LMS_FROM_LINEAR_RGB);

function linearChannels(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
}

function encodedHex(channels) {
  const bytes = channels.map((channel) => {
    const clamped = Math.min(1, Math.max(0, channel));
    const value = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(value * 255);
  });
  return `#${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function simulateDichromacy(hex, kind) {
  const matrix = DICHROMACY_MATRICES.get(kind);
  const linear = linearChannels(hex);
  if (!matrix || !linear) return null;
  return encodedHex(multiply(LINEAR_RGB_FROM_LMS, multiply(matrix, multiply(LMS_FROM_LINEAR_RGB, linear))));
}

function labChannels(hex) {
  const linear = linearChannels(hex);
  if (!linear) return null;
  const [red, green, blue] = linear;
  const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047;
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
  const z = (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883;
  const curve = (value) => (value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116);
  const fx = curve(x);
  const fy = curve(y);
  const fz = curve(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function colorDistance(first, second) {
  const one = labChannels(first);
  const two = labChannels(second);
  if (!one || !two) return null;
  return Math.hypot(one[0] - two[0], one[1] - two[1], one[2] - two[2]);
}
