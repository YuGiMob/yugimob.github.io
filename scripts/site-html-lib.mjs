import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { heroStatRows, problemEntries, problemId, problemIndexRows, projectChipRows, sectionVisibility } from '../assets/js/view-model.js';
import { formatNumber } from '../assets/js/ui.js';

const BLOCK_PATTERN = /[ \t]*<dl class="intro-stats" id="hero-stats"[^>]*>[\s\S]*?<\/dl>/;
const INTRO_PATTERN = /( *<div id="intro-paragraphs">)([\s\S]*?)(<\/div>)/;

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

export function buildHeroStatsBlock(siteData) {
  const rows = heroStatRows(siteData).map((stat) => [
    '          <div class="stat">',
    `            <dt class="stat-label">${stat.label}</dt>`,
    `            <dd class="stat-value" aria-hidden="true">${formatNumber(stat.value)}</dd>`,
    `            <dd class="sr-only">${formatNumber(stat.value)}</dd>`,
    '          </div>',
  ].join('\n'));
  const hidden = siteData.sections?.showHeroStats === false ? ' hidden' : '';
  return [`        <dl class="intro-stats" id="hero-stats"${hidden}>`, ...rows, '        </dl>'].join('\n');
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

function matchingCloseIndex(source, tag, from) {
  const openTag = new RegExp(`<${tag}\\b`, 'gi');
  const closeTag = new RegExp(`</${tag}\\s*>`, 'gi');
  let depth = 1;
  let cursor = from;
  while (cursor < source.length) {
    openTag.lastIndex = cursor;
    closeTag.lastIndex = cursor;
    const nextOpen = openTag.exec(source);
    const nextClose = closeTag.exec(source);
    if (!nextClose) return -1;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
      continue;
    }
    depth -= 1;
    if (depth === 0) return nextClose.index;
    cursor = nextClose.index + nextClose[0].length;
  }
  return -1;
}

function blockBounds(source, tag, id) {
  const open = new RegExp(`[ \\t]*<${tag}\\b[^>]*\\sid="${id}"[^>]*>`).exec(source);
  if (!open) return null;
  const closeStart = matchingCloseIndex(source, tag, open.index + open[0].length);
  if (closeStart < 0) return null;
  const closeEnd = source.indexOf('>', closeStart);
  if (closeEnd < 0) return null;
  return { start: open.index, end: closeEnd + 1 };
}

export function readBlock(source, tag, id) {
  const text = String(source);
  const bounds = blockBounds(text, tag, id);
  return bounds ? text.slice(bounds.start, bounds.end) : null;
}

function replaceBlock(source, tag, id, replacement) {
  const bounds = blockBounds(source, tag, id);
  if (!bounds) return null;
  return source.slice(0, bounds.start) + replacement + source.slice(bounds.end);
}

function setElementText(source, id, text) {
  const open = new RegExp(`<([a-z0-9]+)\\b[^>]*\\sid="${id}"[^>]*>`).exec(source);
  if (!open) return source;
  const start = open.index + open[0].length;
  const closeStart = matchingCloseIndex(source, open[1], start);
  if (closeStart < 0) return source;
  return `${source.slice(0, start)}${escapeHtml(text)}${source.slice(closeStart)}`;
}

function setHiddenAttribute(source, id, hidden) {
  const pattern = new RegExp(`<[a-z0-9]+\\b[^>]*\\sid="${id}"[^>]*>`);
  return source.replace(pattern, (tag) => {
    const clean = tag.replace(/\s+hidden(?=[\s>])/g, '');
    return hidden ? clean.replace(/>$/, ' hidden>') : clean;
  });
}

function applySectionVisibility(source, sections = {}, showcase = null) {
  const visible = sectionVisibility(sections, showcase);
  let next = source;
  for (const id of ['problems', 'evidence', 'colophon', 'campfire']) {
    next = setHiddenAttribute(next, id, !visible[id]);
  }
  return next;
}

function answerBlockHtml(entry, project, headingTag = 'h4') {
  const lines = [
    '              <div class="answer">',
    '                <p class="answer-label">What I built</p>',
    `                <${headingTag} class="answer-name"><a href="${escapeAttr(project.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(project.name)}</a></${headingTag}>`,
    `                <p class="answer-text">${escapeHtml(entry.answer)}</p>`,
    '                <ul class="answer-points">',
  ];
  for (const highlight of entry.highlights ?? []) {
    lines.push(`                  <li class="answer-point">${escapeHtml(highlight)}</li>`);
  }
  lines.push('                </ul>');
  lines.push('                <div class="chips">');
  for (const chip of projectChipRows(project)) {
    lines.push(`                  <span class="chip"><span class="chip-label">${escapeHtml(chip.label)}</span><span class="chip-value">${escapeHtml(chip.value)}</span></span>`);
  }
  lines.push('                </div>');
  lines.push('                <div class="actions">');
  if (project.npm) {
    lines.push(`                  <a class="action-link" href="https://www.npmjs.com/package/${escapeAttr(project.npm)}" target="_blank" rel="noopener noreferrer">npm ↗</a>`);
    lines.push(`                  <code class="install-command">npm i ${escapeHtml(project.npm)}</code>`);
  }
  lines.push(`                  <a class="action-link" href="${escapeAttr(project.url)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>`);
  lines.push('                </div>');
  lines.push('              </div>');
  return lines.join('\n');
}

export function buildProblemIndexBlock(showcase, projects) {
  const rows = problemIndexRows(showcase, projects).map((row) => [
    '        <li class="index-row">',
    `          <a class="index-link" href="${escapeAttr(row.href)}">`,
    `            <span class="index-number">${escapeHtml(row.number)}</span>`,
    `            <span class="index-headline">${escapeHtml(row.headline)}</span>`,
    `            <span class="index-tool">${escapeHtml(row.tool)}</span>`,
    '            <span class="index-arrow" aria-hidden="true">→</span>',
    '          </a>',
    '        </li>',
  ].join('\n')).join('\n');
  return ['      <ol class="problem-index" id="problem-index">', rows, '      </ol>'].join('\n');
}

export function buildProblemListBlock(showcase, projects) {
  const articles = problemEntries(showcase, projects).map(({ entry, project, number }) => [
    `        <article class="problem${entry.size === 'hero' ? ' is-hero' : ''}" id="${escapeAttr(problemId(entry.name))}">`,
    '          <header class="problem-head">',
    `            <span class="problem-number">${escapeHtml(number)}</span>`,
    '            <div>',
    `              <p class="problem-kicker">${escapeHtml(entry.kicker)}</p>`,
    `              <h3 class="problem-title">${escapeHtml(entry.headline)}</h3>`,
    '            </div>',
    '          </header>',
    `          <p class="problem-statement">${escapeHtml(entry.problem)}</p>`,
    '          <div class="problem-grid">',
    '            <div class="problem-copy">',
    answerBlockHtml(entry, project),
    '            </div>',
    `            <div class="problem-demo"${entry.demo ? ` data-demo="${escapeAttr(entry.demo)}"` : ''}></div>`,
    '          </div>',
    '        </article>',
  ].join('\n')).join('\n');
  return ['      <div class="problem-list" id="problem-list">', articles, '      </div>'].join('\n');
}

export function buildEvidenceBlock(showcase, projects) {
  const evidence = showcase?.evidence;
  if (!evidence) return '      <div id="evidence-body"></div>';
  const project = projects.get(evidence.name);
  const lines = [];
  if (evidence.intro) lines.push(`        <p class="section-lede">${escapeHtml(evidence.intro)}</p>`);
  lines.push(`        <div class="evidence" id="${escapeAttr(problemId(evidence.name))}">`);
  lines.push(`          <p class="problem-statement">${escapeHtml(evidence.problem)}</p>`);
  lines.push('          <div class="problem-grid">');
  lines.push('            <div class="problem-copy">');
  if (project) lines.push(answerBlockHtml(evidence, project, 'h3'));
  lines.push('            </div>');
  lines.push('            <div class="problem-demo"></div>');
  lines.push('          </div>');
  lines.push('          <div class="evidence-matrix"></div>');
  lines.push(`          <div class="evidence-trace"${evidence.demo ? ` data-demo="${escapeAttr(evidence.demo)}"` : ''}></div>`);
  lines.push('        </div>');
  return ['      <div id="evidence-body">', lines.join('\n'), '      </div>'].join('\n');
}

export function buildColophonProseBlock(showcase) {
  const paragraphs = (showcase?.colophon ?? []).map((text) => `          <p class="colophon-paragraph">${escapeHtml(text)}</p>`).join('\n');
  return ['        <div class="colophon-prose" id="colophon-prose">', paragraphs, '        </div>'].join('\n');
}

export function buildPrinciplesBlock(showcase) {
  const items = (showcase?.principles ?? []).map((text) => `            <li class="principle">${escapeHtml(text)}</li>`).join('\n');
  return ['          <ul class="principles" id="principles">', items, '          </ul>'].join('\n');
}

export function applyGeneratedBlocks(source, siteData, showcase = null) {
  let next = source;
  if (readHeroStatsBlock(next)) next = next.replace(BLOCK_PATTERN, () => buildHeroStatsBlock(siteData));
  const intro = INTRO_PATTERN.exec(next);
  if (showcase && intro) {
    next = next.replace(INTRO_PATTERN, () => `${intro[1]}\n${buildIntroParagraphs(showcase)}\n        ${intro[3]}`);
  }
  if (showcase) {
    const projects = new Map((siteData.projects ?? []).map((project) => [project.name, project]));
    next = replaceBlock(next, 'ol', 'problem-index', buildProblemIndexBlock(showcase, projects)) ?? next;
    next = replaceBlock(next, 'div', 'problem-list', buildProblemListBlock(showcase, projects)) ?? next;
    next = replaceBlock(next, 'div', 'evidence-body', buildEvidenceBlock(showcase, projects)) ?? next;
    next = replaceBlock(next, 'div', 'colophon-prose', buildColophonProseBlock(showcase)) ?? next;
    next = replaceBlock(next, 'ul', 'principles', buildPrinciplesBlock(showcase)) ?? next;
    next = setElementText(next, 'evidence-kicker', showcase.evidence?.kicker ?? '');
    next = setElementText(next, 'evidence-heading', showcase.evidence?.headline ?? '');
  }
  next = applySectionVisibility(next, siteData.sections ?? {}, showcase);
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
