import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { heroStatRows } from '../assets/js/view-model.js';
import { formatNumber } from '../assets/js/ui.js';

const BLOCK_PATTERN = /[ \t]*<dl class="intro-stats" id="hero-stats">[\s\S]*?<\/dl>/;
const INTRO_PATTERN = /( *<div id="intro-paragraphs">)([\s\S]*?)(<\/div>)/;

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildHeroStatsBlock(siteData) {
  const rows = heroStatRows(siteData).map((stat) => [
    '          <div class="stat">',
    `            <dt class="stat-label">${stat.label}</dt>`,
    `            <dd class="stat-value" aria-hidden="true">${formatNumber(stat.value)}</dd>`,
    `            <dd class="sr-only">${formatNumber(stat.value)}</dd>`,
    '          </div>',
  ].join('\n'));
  return ['        <dl class="intro-stats" id="hero-stats">', ...rows, '        </dl>'].join('\n');
}

export function readHeroStatsBlock(source) {
  return String(source).match(BLOCK_PATTERN)?.[0] ?? null;
}

export function buildIntroParagraphs(showcase) {
  const paragraphs = Array.isArray(showcase?.intro?.paragraphs) ? showcase.intro.paragraphs : [];
  return paragraphs.map((text) => `          <p class="intro-paragraph">${escapeHtml(text)}</p>`).join('\n');
}

export function readIntroParagraphs(source) {
  const inner = String(source).match(INTRO_PATTERN)?.[2];
  if (inner === undefined) return null;
  return inner.replace(/^\n/, '').replace(/\n[ \t]*$/, '');
}

export function applyGeneratedBlocks(source, siteData, showcase = null) {
  let next = source;
  if (readHeroStatsBlock(next)) next = next.replace(BLOCK_PATTERN, () => buildHeroStatsBlock(siteData));
  const intro = INTRO_PATTERN.exec(next);
  if (showcase && intro) {
    next = next.replace(INTRO_PATTERN, () => `${intro[1]}\n${buildIntroParagraphs(showcase)}\n        ${intro[3]}`);
  }
  return next;
}

export function updateIndexFile(target, siteData, showcase = null) {
  if (!existsSync(target)) return { ok: false, reason: 'missing' };
  const source = readFileSync(target, 'utf8');
  if (!readHeroStatsBlock(source)) return { ok: false, reason: 'no-block' };
  const next = applyGeneratedBlocks(source, siteData, showcase);
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
