import { el, setText } from './ui.js';
import { isValidSiteData, fallbackShowcase } from './site-data.js';
import {
  applyVisibility,
  renderActivity,
  renderColophon,
  renderEvidence,
  renderFooter,
  renderHeroStats,
  renderIdentity,
  renderIntro,
  renderProblemIndex,
  renderProblems,
  renderProblemsHeading,
  renderStructuredData,
} from './render.js';

const DATA_URL = 'data/site-data.json';
const SHOWCASE_URL = 'data/showcase.json';

async function fetchJson(url, attempts = 2) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let retryable = true;
    try {
      const options = { cache: 'no-cache' };
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') options.signal = AbortSignal.timeout(6000);
      const response = await fetch(url, options);
      if (!response.ok) {
        retryable = response.status === 429 || response.status >= 500;
        throw new Error(`${url}: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (!retryable || attempt + 1 >= attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastError;
}

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

  const cancel = () => {
    for (const timerId of timerIds) clearTimeout(timerId);
    timerIds = [];
    pendingFocus = null;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  const schedule = () => {
    cancel();
    timerIds = [200, 800, 1600].map((delay) => setTimeout(align, delay));
    timerIds.push(setTimeout(cancel, 2600));
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
}

async function init() {
  const [data, showcaseRaw] = await Promise.all([
    fetchJson(DATA_URL),
    fetchJson(SHOWCASE_URL, 1).catch(() => null),
  ]);
  if (!isValidSiteData(data)) throw new Error('invalid site data');
  const showcase = showcaseRaw || fallbackShowcase(data);
  const projects = new Map(data.projects.map((project) => [project.name, project]));

  renderIdentity(data);
  renderIntro(showcase);
  renderHeroStats(data);
  renderProblemIndex(showcase);
  renderProblems(showcase, projects);
  renderProblemsHeading(showcase);
  renderEvidence(showcase, projects);
  renderColophon(showcase);
  renderActivity(data);
  renderFooter(data.identity);
  renderStructuredData(data, showcase);
  applyVisibility(data.sections, showcase);
  setupNav();
  setupAnchorAlignment();
  setupChrome();
}

init().catch((error) => {
  console.warn('YuGiMob:', error);
  renderError();
});

function renderError() {
  setText('intro-headline', 'This page could not load its data.');
  setText('display-name', 'YuGiMob');
  for (const id of ['problems', 'evidence', 'colophon']) {
    const section = document.getElementById(id);
    if (section) section.hidden = true;
  }
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) navLinks.hidden = true;
  const stats = document.getElementById('hero-stats');
  if (stats) stats.hidden = true;
  const paragraphs = document.getElementById('intro-paragraphs');
  if (paragraphs) {
    paragraphs.replaceChildren();
    paragraphs.appendChild(el('p', 'intro-paragraph', 'The page could not fetch its data files. Check data/site-data.json and data/showcase.json.'));
  }
  const actions = document.querySelector('.intro-actions');
  if (actions) {
    const retry = el('button', 'btn btn-primary', 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', () => window.location.reload());
    actions.replaceChildren(retry);
  }
}
