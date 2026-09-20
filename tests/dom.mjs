class FakeClassList {
  constructor() {
    this.names = new Set();
  }

  set(value) {
    this.names = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get value() {
    return [...this.names].join(' ');
  }

  add(...names) {
    for (const name of names) this.names.add(name);
  }

  remove(...names) {
    for (const name of names) this.names.delete(name);
  }

  contains(name) {
    return this.names.has(name);
  }

  toggle(name, force) {
    const on = force === undefined ? !this.names.has(name) : Boolean(force);
    if (on) this.names.add(name);
    else this.names.delete(name);
    return on;
  }

  replace(from, to) {
    if (!this.names.has(from)) return false;
    this.names.delete(from);
    this.names.add(to);
    return true;
  }
}

class FakeNode {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
  }

  appendChild(node) {
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }

  get children() {
    return this.childNodes.filter((node) => node instanceof FakeElement);
  }
  contains(node) {
    if (node === this) return true;
    for (const child of this.childNodes) {
      if (child === node || (typeof child.contains === 'function' && child.contains(node))) return true;
    }
    return false;
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join('');
  }

  set textContent(value) {
    this.childNodes = [new FakeText(String(value))];
  }
}

class FakeText extends FakeNode {
  constructor(value) {
    super();
    this.value = value;
  }

  get textContent() {
    return this.value;
  }
}

const REFLECTED = ['id', 'src', 'srcset', 'alt', 'href', 'target', 'rel', 'title', 'type', 'viewBox', 'fill'];

class FakeElement extends FakeNode {
  constructor(tagName, namespace = null) {
    super();
    this.tagName = String(tagName).toUpperCase();
    this.namespaceURI = namespace;
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.style = {
      values: new Map(),
      setProperty(name, value) {
        this.values.set(name, String(value));
      },
    };
    this.dataset = new Proxy({}, {
      set: (target, key, value) => {
        target[key] = String(value);
        const attribute = `data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
        this.attributes.set(attribute, String(value));
        return true;
      },
    });
    this.listeners = new Map();
    this.hidden = false;
    this.tabIndex = 0;
  }

  get className() {
    return this.classList.value;
  }

  set className(value) {
    this.classList.set(value);
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node instanceof FakeNode ? node : new FakeText(String(node)));
  }

  replaceChildren(...nodes) {
    this.childNodes = [];
    for (const node of nodes) this.appendChild(node);
  }

  setAttribute(name, value) {
    if (name === 'class') {
      this.classList.set(value);
      return;
    }
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    if (name === 'class') return this.classList.value || null;
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    if (name === 'class') return this.classList.names.size > 0;
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    if (name === 'class') {
      this.classList.set('');
      return;
    }
    this.attributes.delete(name);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = (this.listeners.get(type) ?? []).filter((entry) => entry !== handler);
    this.listeners.set(type, handlers);
  }

  dispatch(type, event = {}) {
    return (this.listeners.get(type) ?? []).map((handler) => handler(event));
  }

  querySelector(selector) {
    return querySelectorIn(this, selector, true);
  }

  querySelectorAll(selector) {
    return querySelectorIn(this, selector, false);
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (typeof node.matches === 'function' && node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  focus() {
    this.focused = true;
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  getTotalLength() {
    return 100;
  }

  getPointAtLength() {
    return { x: 0, y: 0 };
  }

  select() {
    this.selected = true;
  }

  setSelectionRange() {}

  remove() {
    if (this.parentNode) {
      this.parentNode.childNodes = this.parentNode.childNodes.filter((node) => node !== this);
      this.parentNode = null;
    }
  }
}

for (const name of REFLECTED) {
  Object.defineProperty(FakeElement.prototype, name, {
    configurable: true,
    get() {
      return this.attributes.has(name) ? this.attributes.get(name) : undefined;
    },
    set(value) {
      if (value == null) this.attributes.delete(name);
      else this.attributes.set(name, String(value));
    },
  });
}

function matchesSelector(node, selector) {
  if (!(node instanceof FakeElement)) return false;
  const tokens = selector.match(/\[[^\]]+\]|\.[\w-]+|#[\w-]+|[a-zA-Z][\w-]*/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith('.')) {
      if (!node.classList.contains(token.slice(1))) return false;
    } else if (token.startsWith('#')) {
      if (node.getAttribute('id') !== token.slice(1)) return false;
    } else if (token.startsWith('[')) {
      const match = token.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      if (!match || !node.hasAttribute(match[1])) return false;
      if (match[2] !== undefined && node.getAttribute(match[1]) !== match[2]) return false;
    } else if (node.tagName !== token.toUpperCase()) {
      return false;
    }
  }
  return tokens.length > 0;
}

function querySelectorIn(root, selector, first) {
  const found = [];
  const walk = (node) => {
    if (first && found.length > 0) return;
    if (node !== root && matchesSelector(node, selector)) found.push(node);
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(root);
  return first ? found[0] ?? null : found;
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.queries = new Map();
    this.body = new FakeElement('body');
    this.documentElement = new FakeElement('html');
    this.title = '';
    this.execCommandResult = true;
    this.execCommandCalls = [];
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createElementNS(namespace, tagName) {
    return new FakeElement(tagName, namespace);
  }

  createTextNode(value) {
    return new FakeText(String(value));
  }

  getElementById(id) {
    return this.elements.get(id) ?? null;
  }

  querySelector(selector) {
    return this.queries.get(selector) ?? null;
  }

  querySelectorAll() {
    return [];
  }

  execCommand(command) {
    this.execCommandCalls.push(command);
    return this.execCommandResult;
  }
}

export function withDom(run, overrides = {}) {
  const document = new FakeDocument();
  const observers = [];
  const frames = new Map();
  let nextFrameId = 0;
  let time = 0;

  class FakeIntersectionObserver {
    constructor(callback, options = {}) {
      this.callback = callback;
      this.options = options;
      this.targets = [];
      this.disconnected = false;
      observers.push(this);
    }

    observe(target) {
      this.targets.push(target);
    }

    disconnect() {
      this.disconnected = true;
    }

    trigger(entries) {
      this.callback(entries, this);
    }
  }

  const window = {
    listeners: new Map(),
    location: { hash: '', search: '', href: 'http://localhost/' },
    history: {
      replaceState() {},
      pushState() {},
    },
    scrollY: 0,
    scrollTo() {},
    addEventListener(type, handler) {
      const handlers = this.listeners.get(type) ?? [];
      handlers.push(handler);
      this.listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry !== handler));
    },
    dispatch(type, event = {}) {
      for (const handler of this.listeners.get(type) ?? []) handler(event);
    },
  };

  const dom = {
    document,
    window,
    observers,
    Node: FakeNode,
    Element: FakeElement,
    navigator: {},
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ scrollPaddingTop: '0px' }),
    IntersectionObserver: FakeIntersectionObserver,
    requestAnimationFrame: (callback) => {
      nextFrameId += 1;
      frames.set(nextFrameId, callback);
      return nextFrameId;
    },
    cancelAnimationFrame: (id) => {
      frames.delete(id);
    },
    performance: { now: () => time },
    runFrame: (next = time) => {
      const entry = [...frames.entries()][0];
      if (!entry) return false;
      time = next;
      frames.delete(entry[0]);
      entry[1](next);
      return true;
    },
    pendingFrames: () => frames.size,
    advance: (ms) => {
      time += ms;
      return time;
    },
  };

  const values = {
    document,
    window,
    Node: FakeNode,
    navigator: dom.navigator,
    matchMedia: dom.matchMedia,
    IntersectionObserver: FakeIntersectionObserver,
    requestAnimationFrame: dom.requestAnimationFrame,
    cancelAnimationFrame: dom.cancelAnimationFrame,
    performance: dom.performance,
    getComputedStyle: dom.getComputedStyle,
    ...overrides,
  };

  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key) ?? null;
    previous.set(key, descriptor);
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true, enumerable: descriptor?.enumerable ?? true });
  }

  const restore = () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };

  let result;
  try {
    result = run(dom);
  } catch (err) {
    restore();
    throw err;
  }
  if (result && typeof result.then === 'function') return result.finally(restore);
  restore();
  return result;
}

export function element(tagName = 'div') {
  return new FakeElement(tagName);
}

export function register(document, id, node = element()) {
  document.elements.set(id, node);
  return node;
}

export function registerQuery(document, selector, node = element()) {
  document.queries.set(selector, node);
  return node;
}

export function findAll(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of node.childNodes ?? []) findAll(child, predicate, found);
  return found;
}
