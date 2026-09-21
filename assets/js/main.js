import { el, link, setText } from './ui.js';
import { fetchJson } from './fetch-json.js';
import { isValidSiteData, isValidBenchmark, isValidShowcase, fallbackShowcase } from './site-data.js';
import {
  applyVisibility,
  renderActivity,
  renderDegradedNotice,
  renderEvidence,
  renderFooter,
  renderHeroStats,
  renderIdentity,
  renderIntro,
  renderProblems,
} from './render.js';

const DATA_URL = 'data/site-data.json';
const SHOWCASE_URL = 'data/showcase.json';

document.getElementById('main-content')?.setAttribute('aria-busy', 'true');

function setupNav() {
  const links = [...document.querySelectorAll('[data-nav]')];
  const sections = links.map((anchor) => document.getElementById(anchor.dataset.nav)).filter(Boolean);
  if (sections.length === 0 || typeof IntersectionObserver !== 'function') return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const anchor of links) {
        const current = anchor.dataset.nav === entry.target.id;
        anchor.classList.toggle('is-current', current);
        if (current) anchor.setAttribute('aria-current', 'true');
        else anchor.removeAttribute('aria-current');
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  for (const section of sections) observer.observe(section);
}

function focusElement(target) {
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

function setupAnchorAlignment() {
  let timerIds = [];
  let observer = null;
  let pendingFocus = null;

  const align = () => {
    const targetId = window.location.hash.replace('#', '');
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const desired = Math.round(target.getBoundingClientRect().top + window.scrollY - padding);
    if (Math.abs(desired - window.scrollY) >= 6) window.scrollTo({ top: desired });
    if (pendingFocus === target) {
      pendingFocus = null;
      focusElement(target);
    }
  };

  const onContentVisibility = () => align();

  const cancel = () => {
    for (const timerId of timerIds) clearTimeout(timerId);
    timerIds = [];
    pendingFocus = null;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    document.removeEventListener('contentvisibilityautostatechange', onContentVisibility, true);
  };

  const schedule = () => {
    cancel();
    timerIds = [200, 800, 1600].map((delay) => setTimeout(align, delay));
    timerIds.push(setTimeout(cancel, 4000));
    document.addEventListener('contentvisibilityautostatechange', onContentVisibility, true);
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(align);
      observer.observe(document.body);
    }
  };

  window.addEventListener('hashchange', schedule);
  for (const anchor of document.querySelectorAll('a[href^="#"]')) {
    anchor.addEventListener('click', () => {
      const targetId = anchor.getAttribute('href').slice(1);
      pendingFocus = targetId ? document.getElementById(targetId) : null;
      schedule();
    });
  }
  for (const type of ['wheel', 'touchstart', 'keydown']) window.addEventListener(type, cancel, { passive: true });
  if (window.location.hash) schedule();
}

function setupChrome() {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  const update = () => bar.classList.toggle('is-scrolled', window.scrollY > 12);
  const syncPadding = () => {
    document.documentElement.style.scrollPaddingTop = `${Math.round(bar.getBoundingClientRect().height) + 20}px`;
  };
  update();
  syncPadding();
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncPadding).observe(bar);
  else window.addEventListener('resize', syncPadding, { passive: true });
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('beforeprint', () => {
    for (const details of document.querySelectorAll('details')) details.open = true;
  });
}

async function init() {
  const [data, showcaseRaw] = await Promise.all([
    fetchJson(DATA_URL),
    fetchJson(SHOWCASE_URL, 1).catch(() => null),
  ]);
  if (!isValidSiteData(data)) throw new Error('invalid site data');
  const curatedShowcase = isValidShowcase(showcaseRaw) ? showcaseRaw : null;
  const showcase = curatedShowcase ?? fallbackShowcase(data);
  const benchmark = isValidBenchmark(data.benchmark) ? data.benchmark : null;
  if (data.benchmark != null && !benchmark) console.warn('YuGiMob: ignoring an unusable benchmark block');

  applyVisibility(data.sections, showcase);
  renderIdentity(data);
  renderIntro(showcase);
  renderHeroStats(data);
  renderProblems();
  renderEvidence(showcase, benchmark, data.benchmarkHistory);
  await renderActivity(data);
  renderFooter(data);
  document.getElementById('main-content')?.removeAttribute('aria-busy');
  if (!curatedShowcase) {
    renderDegradedNotice('The curated copy in data/showcase.json could not be loaded, so this page is showing the fallback descriptions from data/site-data.json.');
  }
  setupNav();
  setupAnchorAlignment();
  setupChrome();
}

init().catch((error) => {
  console.warn('YuGiMob:', error);
  renderError();
});

function renderError() {
  document.title = 'YuGiMob · data unavailable';
  setText('intro-headline', 'This page could not load its data.');
  setText('display-name', 'YuGiMob');
  const main = document.getElementById('main-content');
  if (main) main.removeAttribute('aria-busy');
  for (const id of ['problems', 'evidence', 'colophon', 'activity-panel']) {
    const section = document.getElementById(id);
    if (section) section.hidden = true;
  }
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) navLinks.hidden = true;
  const notice = document.getElementById('data-age');
  if (notice) notice.hidden = true;
  const paragraphs = document.getElementById('intro-paragraphs');
  if (paragraphs) {
    paragraphs.replaceChildren();
    const message = el('p', 'intro-paragraph', 'The page could not fetch its data files. The machine file and the curated file are still readable by hand:');
    const source = el('p', 'intro-paragraph');
    source.append(
      link('data/site-data.json', 'data/site-data.json'),
      ' · ',
      link('data/showcase.json', 'data/showcase.json'),
    );
    paragraphs.append(message, source);
  }
  const actions = document.querySelector('.intro-actions');
  if (actions) {
    const retry = el('button', 'btn btn-primary', 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', () => window.location.reload());
    actions.replaceChildren(retry);
  }
}
