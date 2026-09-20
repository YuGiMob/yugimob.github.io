const ANNOUNCE_DELAY = 40;
const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

let announceTimer = null;

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function append(parent, ...children) {
  for (const child of children) {
    if (child == null) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function link(href, text, className) {
  const anchor = el('a', className, text);
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}

export function setText(id, value) {
  const node = document.getElementById(id);
  if (node && value) node.textContent = value;
}

export function setMeta(selector, value) {
  const node = document.querySelector(selector);
  if (node && value) node.setAttribute('content', value);
}

export function observeVisibility(element, onShow, onHide) {
  if (typeof IntersectionObserver !== 'function') {
    onShow();
    return null;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) onShow();
      else onHide();
    }
  }, { rootMargin: '120px 0px', threshold: 0.12 });
  observer.observe(element);
  return observer;
}

export function announce(message) {
  const region = document.getElementById('live-region');
  if (!region) return;
  region.textContent = '';
  if (announceTimer) clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    announceTimer = null;
    region.textContent = message;
  }, ANNOUNCE_DELAY);
}

export function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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

export function createRuntime() {
  const timeouts = new Set();
  let frameId = 0;
  let stopped = false;
  const cancelPending = () => {
    for (const id of timeouts) clearTimeout(id);
    timeouts.clear();
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  };
  return {
    after(callback, delay) {
      const id = setTimeout(() => {
        timeouts.delete(id);
        if (!stopped) callback();
      }, delay);
      timeouts.add(id);
      return id;
    },
    frame(callback) {
      if (frameId) return;
      const loop = (time) => {
        if (stopped) {
          frameId = 0;
          return;
        }
        callback(time);
        frameId = stopped ? 0 : requestAnimationFrame(loop);
      };
      frameId = requestAnimationFrame(loop);
    },
    clear() {
      stopped = true;
      cancelPending();
    },
    reset() {
      cancelPending();
      stopped = false;
    },
  };
}

export function createController(node, setup, teardown, caption) {
  let runtime = null;
  let active = false;
  return {
    node,
    caption,
    start() {
      if (active) return;
      active = true;
      runtime = createRuntime();
      setup(runtime);
    },
    stop() {
      if (!active && !runtime) return;
      active = false;
      if (runtime) runtime.clear();
      runtime = null;
      if (teardown) teardown();
    },
    destroy() {
      this.stop();
    },
  };
}

export function typeText(node, text, runtime, options = {}) {
  const { speed = 26, instant = false, onDone } = options;
  if (instant) {
    node.textContent = text;
    if (onDone) onDone();
    return;
  }
  let index = 0;
  node.textContent = '';
  const step = () => {
    index += 1;
    node.textContent = text.slice(0, index);
    if (index < text.length) runtime.after(step, speed);
    else if (onDone) onDone();
  };
  runtime.after(step, speed);
}

export function copyText(value) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(value);
  }
  const element = document.createElement('textarea');
  element.value = value;
  element.setAttribute('readonly', '');
  element.style.position = 'fixed';
  element.style.top = '-9999px';
  element.style.opacity = '0';
  document.body.appendChild(element);
  element.focus();
  element.select();
  if (typeof element.setSelectionRange === 'function') element.setSelectionRange(0, element.value.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    element.remove();
  }
  return copied ? Promise.resolve() : Promise.reject(new Error('copy failed'));
}

export function copyButton(label, value, announceLabel) {
  const button = el('button', 'copy-btn');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', announceLabel || label);
  let resetTimer = null;
  const reset = () => {
    resetTimer = setTimeout(() => {
      button.textContent = label;
      button.classList.remove('is-copied', 'is-failed');
    }, 1500);
  };
  button.addEventListener('click', async () => {
    if (resetTimer) clearTimeout(resetTimer);
    try {
      await copyText(value);
      button.textContent = 'copied';
      button.classList.add('is-copied');
      announce(`copied ${value}`);
    } catch {
      button.textContent = 'copy failed';
      button.classList.add('is-failed');
      announce(`copy failed for ${value}`);
    }
    reset();
  });
  return button;
}

export function animateValue(node, value, formatter = formatNumber, duration = 900) {
  if (reducedMotion() || !Number.isFinite(value)) {
    node.textContent = formatter(value);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = formatter(Math.round(value * eased));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
