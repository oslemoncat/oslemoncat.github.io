/* 最小 DOM 环境：让 Node 能跑真实的前端代码路径。
   仅实现站点实际用到的 API（元素创建、属性、classList、querySelector、
   事件冒泡、innerHTML 解析、window/history/location/localStorage/mock fetch）。
   用途：tests/render.test.mjs 与 scripts/render-test.mjs。
   不是 jsdom 的替代品——不要用它测试本文件清单之外的 API。 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr']);

/* 保存原生 fetch，避免下面安装 mock 之后自我递归 */
const nativeFetch = globalThis.fetch.bind(globalThis);

class ClassList {
  constructor(node) { this.node = node; }
  get set() { return new Set((this.node.getAttribute('class') || '').split(/\s+/).filter(Boolean)); }
  write(set) { this.node.setAttribute('class', [...set].join(' ')); }
  add(...names) { const s = this.set; names.forEach((n) => s.add(n)); this.write(s); }
  remove(...names) { const s = this.set; names.forEach((n) => s.delete(n)); this.write(s); }
  contains(name) { return this.set.has(name); }
  toggle(name, force) {
    const has = this.contains(name);
    const on = force === undefined ? !has : Boolean(force);
    if (on) this.add(name); else this.remove(name);
    return on;
  }
}

export class TextNode {
  constructor(text) { this.nodeType = 3; this.textContent = String(text); this.childNodes = []; this.parentNode = null; }
}

export class DomNode {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = String(tagName || '').toUpperCase();
    this.attributes = {};
    this.childNodes = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.listeners = new Map();
    this._classList = new ClassList(this);
  }
  get classList() { return this._classList; }
  /* 浏览器里 node.className = 'x' 等价于 setAttribute('class','x')，
     站点代码大量使用这种写法，shim 必须支持。 */
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', String(value)); }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', String(value)); }
  get value() { return this.getAttribute('value') || ''; }
  set value(v) { this.setAttribute('value', String(v)); }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }

  setAttribute(name, value) {
    const key = String(name);
    this.attributes[key] = String(value);
    if (key === 'class') this._classList = new ClassList(this);
    if (key.startsWith('data-')) {
      const camel = key.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase());
      this.dataset[camel] = String(value);
    }
    if (key === 'id' && this.ownerDocument) this.ownerDocument.registerId(String(value), this);
  }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }

  appendChild(child) {
    if (!child) return child;
    if (child.__fragment) { child.childNodes.slice().forEach((c) => this.appendChild(c)); return child; }
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument || (this.nodeType === 9 ? this : null) || child.ownerDocument;
    this.childNodes.push(child);
    return child;
  }
  /* 现代 DOM 的 append：可一次追加多个节点或字符串（页面代码大量使用） */
  append(...nodes) {
    nodes.forEach((node) => {
      if (node === null || node === undefined) return;
      this.appendChild(typeof node === 'string' ? new TextNode(node) : node);
    });
  }
  prepend(...nodes) {
    nodes.slice().reverse().forEach((node) => {
      if (node === null || node === undefined) return;
      this.insertBefore(typeof node === 'string' ? new TextNode(node) : node, this.firstChild);
    });
  }
  before(...nodes) {
    if (!this.parentNode) return;
    nodes.forEach((node) => this.parentNode.insertBefore(node, this));
  }
  after(...nodes) {
    if (!this.parentNode) return;
    const next = this.nextSibling;
    nodes.forEach((node) => this.parentNode.insertBefore(node, next));
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] || null;
  }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  insertBefore(child, ref) {
    const index = ref ? this.childNodes.indexOf(ref) : -1;
    if (index < 0) return this.appendChild(child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.childNodes.splice(index, 0, child);
    return child;
  }
  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) { this.childNodes.splice(index, 1); child.parentNode = null; }
    return child;
  }
  replaceWith(...nodes) {
    if (!this.parentNode) return;
    const parent = this.parentNode;
    const index = parent.childNodes.indexOf(this);
    parent.childNodes.splice(index, 1);
    nodes.forEach((node, offset) => {
      node.parentNode = parent;
      node.ownerDocument = parent.ownerDocument;
      parent.childNodes.splice(index + offset, 0, node);
    });
    this.parentNode = null;
  }
  /* 新版页面模块用 replaceChildren 清空并填充容器（比 innerHTML='' 更常用），
     shim 早期版本没有实现，会让渲染测试误报 container.replaceChildren is not a function */
  replaceChildren(...nodes) {
    this.childNodes.slice().forEach((child) => this.removeChild(child));
    nodes.forEach((node) => {
      if (node === null || node === undefined) return;
      this.appendChild(typeof node === 'string' ? new TextNode(node) : node);
    });
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  set textContent(value) {
    this.childNodes = [];
    if (value !== '' && value !== null && value !== undefined) this.appendChild(new TextNode(value));
  }
  get textContent() { return this.childNodes.map((c) => c.textContent || '').join(''); }

  set innerHTML(html) { this.childNodes = []; parseHtml(String(html), this); }
  get innerHTML() { return this.childNodes.map(serialize).join(''); }

  addEventListener(type, handler, options) {
    const capture = typeof options === 'boolean' ? options : Boolean(options && options.capture);
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ handler, capture });
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    const index = list.findIndex((entry) => entry.handler === handler);
    if (index >= 0) list.splice(index, 1);
  }
  dispatchEvent(event) {
    event.target = event.target || this;
    const path = [];
    let node = this;
    while (node) { path.push(node); node = node.parentNode; }
    for (const current of path) {
      event.currentTarget = current;
      for (const { handler, capture } of (current.listeners.get(event.type) || [])) {
        if (capture) handler.call(current, event);
      }
    }
    for (const current of path) {
      event.currentTarget = current;
      for (const { handler, capture } of (current.listeners.get(event.type) || [])) {
        if (!capture) handler.call(current, event);
      }
    }
    return !event.defaultPrevented;
  }
  focus() {}
  scrollIntoView() {}
  click() { this.dispatchEvent({ type: 'click', preventDefault() { this.defaultPrevented = true; } }); }

  closest(selector) {
    let node = this;
    while (node && node.nodeType === 1) {
      if (matches(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
  matches(selector) { return matches(this, selector); }
  querySelector(selector) { return queryAll(this, selector)[0] || null; }
  querySelectorAll(selector) { return queryAll(this, selector); }
  getElementsByTagName(tag) {
    const want = String(tag).toUpperCase();
    return queryAll(this, '*').filter((node) => node.tagName === want);
  }
  getElementsByClassName(name) { return queryAll(this, `.${name}`); }
  insertAdjacentHTML(position, html) {
    if (position === 'beforeend') return parseHtml(html, this);
    if (position === 'afterbegin') {
      const holder = new DomNode('#fragment');
      parseHtml(html, holder);
      holder.childNodes.slice().forEach((child) => this.insertBefore(child, this.firstChild));
      return holder;
    }
    return parseHtml(html, this.parentNode || this);
  }
}

export class DomDocument extends DomNode {
  constructor(baseURI) {
    super('#document');
    this.nodeType = 9;
    this.ownerDocument = this;
    this._ids = new Map();
    this.documentElement = new DomNode('html');
    this.documentElement.ownerDocument = this;
    this.documentElement.setAttribute('data-theme', 'light');
    this.head = new DomNode('head');
    this.head.ownerDocument = this;
    this.body = new DomNode('body');
    this.body.ownerDocument = this;
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.childNodes.push(this.documentElement);
    this.documentElement.parentNode = this;
    this.baseURI = baseURI;
    this.title = '';
    this.lastModified = new Date().toISOString();
  }
  /** 同一 id 可能先后存在多个节点（例如被 replaceWith 换掉的旧节点），
   *  按「最后挂载的优先」记录，getElementById 只返回真正在文档里的那个。 */
  registerId(id, node) {
    const list = this._ids.get(id) || [];
    const index = list.indexOf(node);
    if (index >= 0) list.splice(index, 1);
    list.push(node);
    this._ids.set(id, list);
  }
  isInDocument(node) {
    let current = node;
    while (current) {
      if (current === this.documentElement) return true;
      current = current.parentNode;
    }
    return false;
  }
  getElementById(id) {
    const list = this._ids.get(String(id));
    if (!list || !list.length) return null;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (this.isInDocument(list[i])) return list[i];
    }
    return null;
  }
  createElement(tag) { const node = new DomNode(tag); node.ownerDocument = this; return node; }
  createTextNode(text) { return new TextNode(text); }
  createDocumentFragment() { const node = new DomNode('#fragment'); node.__fragment = true; node.ownerDocument = this; return node; }
  /** 用 index.html 的真实骨架填充 body（去掉 <script>，由测试自己执行代码） */
  loadSkeleton(indexHtml) {
    const titleMatch = indexHtml.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) this.title = titleMatch[1].trim();
    const bodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = (bodyMatch ? bodyMatch[1] : '').replace(/<script[\s\S]*?<\/script>/gi, '');
    parseHtml(bodyHtml, this.body);
    return this;
  }
}

/* -------------------------------------------------- 选择器（只支持用到的） */
function splitSelector(selector) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const char of String(selector)) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === '[' || char === ']') { current += char; continue; }
    if (/[\s>]/.test(char) && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      if (char === '>') parts.push('>');
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function matchSimple(node, part) {
  if (part === '*') return true;
  let rest = part;
  const attrs = [];
  rest = rest.replace(/\[([^\]]+)\]/g, (m, body) => { attrs.push(body); return ''; });
  const idMatch = rest.match(/#([\w-]+)/);
  const classMatches = [...rest.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const tagMatch = rest.match(/^([\w-]+)/);

  if (tagMatch && node.tagName !== tagMatch[1].toUpperCase()) return false;
  if (idMatch && node.getAttribute('id') !== idMatch[1]) return false;
  for (const cls of classMatches) if (!node.classList.contains(cls)) return false;
  for (const attr of attrs) {
    const eq = attr.match(/^([\w-]+)\s*([~^$*|]?=)\s*"?([^"]*)"?$/);
    if (!eq) { if (!node.hasAttribute(attr.trim())) return false; continue; }
    const [, name, op, value] = eq;
    const actual = node.getAttribute(name);
    if (actual === null) return false;
    if (op === '=' && actual !== value) return false;
    if (op === '^=' && !actual.startsWith(value)) return false;
    if (op === '$=' && !actual.endsWith(value)) return false;
    if (op === '*=' && !actual.includes(value)) return false;
    if (op === '~=' && !actual.split(/\s+/).includes(value)) return false;
  }
  return true;
}

function matches(node, selector) {
  const parts = splitSelector(selector);
  if (!parts.length) return false;
  if (!matchSimple(node, parts[parts.length - 1])) return false;
  let nodeIndex = parts.length - 2;
  let current = node.parentNode;
  while (nodeIndex >= 0) {
    const part = parts[nodeIndex];
    if (part === '>') {
      nodeIndex -= 1;
      if (nodeIndex < 0) break;
      if (!current || current.nodeType !== 1 || !matchSimple(current, parts[nodeIndex])) return false;
      current = current.parentNode;
      nodeIndex -= 1;
      continue;
    }
    let found = null;
    while (current && current.nodeType === 1) {
      if (matchSimple(current, part)) { found = current; break; }
      current = current.parentNode;
    }
    if (!found) return false;
    current = found.parentNode;
    nodeIndex -= 1;
  }
  return true;
}

function queryAll(root, selector) {
  const results = [];
  const visit = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      if (matches(child, selector)) results.push(child);
      visit(child);
    }
  };
  visit(root);
  return results;
}

/* ------------------------------------------------------------ HTML 解析器 */
function parseHtml(html, parent) {
  const stack = [parent];
  const tokenPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>`]+))?)*)\s*(\/?)>|([^<]+)/gi;
  let match;
  while ((match = tokenPattern.exec(html))) {
    const [token, closeTag, openTag, rawAttrs, selfClose, text] = match;
    const top = stack[stack.length - 1];
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    if (closeTag) {
      const name = closeTag.toUpperCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tagName === name) { stack.length = i; break; }
      }
      continue;
    }
    if (openTag) {
      const node = new DomNode(openTag);
      node.ownerDocument = parent.ownerDocument;
      if (rawAttrs) {
        const attrPattern = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g;
        let attrMatch;
        while ((attrMatch = attrPattern.exec(rawAttrs))) {
          const name = attrMatch[1];
          const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
          node.setAttribute(name, decodeEntities(value));
        }
      }
      top.appendChild(node);
      if (!selfClose && !VOID_TAGS.has(openTag.toLowerCase())) stack.push(node);
      continue;
    }
    if (text && text.trim()) top.appendChild(new TextNode(decodeEntities(text)));
  }
  return parent;
}

function decodeEntities(text) {
  return String(text)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function serialize(node) {
  if (node.nodeType === 3) return node.textContent;
  const attrs = Object.entries(node.attributes).map(([k, v]) => ` ${k}="${v}"`).join('');
  const inner = node.childNodes.map(serialize).join('');
  return `<${node.tagName.toLowerCase()}${attrs}>${inner}</${node.tagName.toLowerCase()}>`;
}

/* ------------------------------------------------------------- 环境装配 */
/**
 * 建立 window/document/location/history/fetch 等，并装载到 globalThis，
 * 这样随后 import 的站点模块会看到这套 DOM。
 * @param {{origin?: string, port?: number|string, repoRoot: string}} options
 */
export function installDom({ origin, port = '8000', repoRoot }) {
  const ORIGIN = origin || `http://127.0.0.1:${port}/`;
  const document = new DomDocument(ORIGIN);
  const storage = new Map();
  const windowListeners = new Map();

  const location = {
    href: `${ORIGIN}#/`,
    pathname: '/',
    search: '',
    hash: '#/',
    origin: ORIGIN.replace(/\/$/, ''),
    replace(url) {
      const next = new URL(String(url), ORIGIN);
      const hashChanged = next.hash !== location.hash;
      location.href = next.href;
      location.pathname = next.pathname;
      location.hash = next.hash;
      if (hashChanged) dispatchWindow('hashchange', { oldURL: '', newURL: next.href });
    },
    assign(url) { location.replace(url); },
  };

  function dispatchWindow(type, event) {
    const payload = { type, target: windowObj, currentTarget: windowObj, ...event };
    for (const { handler, capture } of (windowListeners.get(type) || [])) {
      if (!capture) handler.call(windowObj, payload);
    }
    return payload;
  }

  const windowObj = {
    document,
    location,
    history: {
      replaceState(_state, _title, url) {
        if (!url) return;
        const next = new URL(String(url), ORIGIN);
        location.href = next.href;
        location.pathname = next.pathname;
        location.search = next.search;
        if (next.hash) location.hash = next.hash;
      },
      pushState(state, title, url) { windowObj.history.replaceState(state, title, url); },
    },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'node-dom-shim' },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener(type, handler, options) {
      const capture = typeof options === 'boolean' ? options : Boolean(options && options.capture);
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push({ handler, capture });
    },
    removeEventListener(type, handler) {
      const list = windowListeners.get(type) || [];
      const index = list.findIndex((entry) => entry.handler === handler);
      if (index >= 0) list.splice(index, 1);
    },
    dispatchEvent(event) { return dispatchWindow(event.type || 'unknown', event); },
    scrollTo() {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
  };
  windowObj.window = windowObj;
  windowObj.self = windowObj;
  windowObj.globalThis = windowObj;
  windowObj.console = console;

  const fetchImpl = async (input, init) => {
    const url = new URL(String(input), ORIGIN).href;
    return nativeFetch(url, init);
  };
  windowObj.fetch = fetchImpl;

  // Node 里有些全局属性是只读 getter（例如 navigator），直接赋值会抛错
  const globals = {
    window: windowObj,
    document,
    location,
    history: windowObj.history,
    navigator: windowObj.navigator,
    localStorage: windowObj.localStorage,
    matchMedia: windowObj.matchMedia,
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() {} unobserve() {} disconnect() {}
    },
    scrollTo: windowObj.scrollTo,
    requestAnimationFrame: windowObj.requestAnimationFrame,
    fetch: fetchImpl,
  };
  for (const [key, value] of Object.entries(globals)) {
    try {
      globalThis[key] = value;
    } catch {
      Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    }
  }

  /** 把真实的 index.html 骨架装进 document */
  function loadSkeleton() {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    document.loadSkeleton(html);
    return document;
  }

  /** 把 location 切到某个 hash（并入队 hashchange，模拟用户导航） */
  function goto(hash) {
    location.hash = hash;
    dispatchWindow('hashchange', { oldURL: '', newURL: `${ORIGIN}${hash}` });
  }

  return { document, window: windowObj, location, history: windowObj.history, goto, loadSkeleton, dispatchWindow, ORIGIN };
}

export { parseHtml };
