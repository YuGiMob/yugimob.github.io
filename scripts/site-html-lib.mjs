import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { heroStatRows } from '../assets/js/view-model.js';
import { formatNumber } from '../assets/js/ui.js';

const BLOCK_PATTERN = /[ \t]*<dl class="intro-stats" id="hero-stats">[\s\S]*?<\/dl>/;

export function buildHeroStatsBlock(siteData) {
  const rows = heroStatRows(siteData).map((stat) => [
    '          <div class="stat">',
    `            <dt class="stat-label">${stat.label}</dt>`,
    `            <dd class="stat-value">${formatNumber(stat.value)}</dd>`,
    '          </div>',
  ].join('\n'));
  return ['        <dl class="intro-stats" id="hero-stats">', ...rows, '        </dl>'].join('\n');
}

export function readHeroStatsBlock(source) {
  return String(source).match(BLOCK_PATTERN)?.[0] ?? null;
}

export function updateHeroStatsFile(target, siteData) {
  if (!existsSync(target)) return { ok: false, reason: 'missing' };
  const source = readFileSync(target, 'utf8');
  if (!readHeroStatsBlock(source)) return { ok: false, reason: 'no-block' };
  const next = source.replace(BLOCK_PATTERN, buildHeroStatsBlock(siteData));
  if (next === source) return { ok: true, changed: false };
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, next);
    renameSync(tmp, target);
    return { ok: true, changed: true };
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {}
    return { ok: false, reason: err.message };
  }
}
