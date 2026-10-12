import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from './atomic-write.mjs';

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
  try {
    writeFileAtomic(target, result.next);
    return { ok: true, changed: true, previous: result.previous };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
