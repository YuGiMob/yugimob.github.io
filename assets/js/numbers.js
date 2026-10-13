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

export function localDateString(date = new Date()) {
  const pad = (part) => String(part).padStart(2, '0');
  const format = (value) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  if (typeof date === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (match) return format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) === date ? date : '';
  }
  if (date == null) return '';
  const value = date instanceof Date ? date : new Date(date);
  return Number.isNaN(value.getTime()) ? '' : format(value);
}

export function elapsedDays(date, now) {
  const then = Date.parse(date);
  const reference = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(then) || !Number.isFinite(reference)) return null;
  return Math.max(0, Math.floor((reference - then) / DAY_MS));
}
