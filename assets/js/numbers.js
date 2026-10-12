const DAY_MS = 86400000;

let numberFormatter = null;

export function extent(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === Infinity) return [0, 0];
  return [min, max];
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  if (!numberFormatter) numberFormatter = new Intl.NumberFormat('en-US');
  return numberFormatter.format(value);
}

export function elapsedDays(date, now) {
  const then = Date.parse(date);
  const reference = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(then) || !Number.isFinite(reference)) return null;
  return Math.max(0, Math.floor((reference - then) / DAY_MS));
}
