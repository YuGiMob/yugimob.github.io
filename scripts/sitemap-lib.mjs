import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

export function sitemapWithLastmod(source, date) {
  if (!source.includes('</loc>')) return null;
  const previous = source.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
  const next = previous
    ? source.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${date}</lastmod>`)
    : source.replace('</loc>', `</loc>\n    <lastmod>${date}</lastmod>`);
  return { previous, next, changed: next !== source };
}

export function updateSitemapFile(target, date) {
  if (!existsSync(target)) return { ok: false, reason: 'missing' };
  const result = sitemapWithLastmod(readFileSync(target, 'utf8'), date);
  if (!result) return { ok: false, reason: 'no-loc' };
  if (!result.changed) return { ok: true, changed: false, previous: result.previous };
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, result.next);
    renameSync(tmp, target);
    return { ok: true, changed: true, previous: result.previous };
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {}
    return { ok: false, reason: err.message };
  }
}
