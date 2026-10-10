/* 通用工具：DOM、文本、日期、数据获取。零依赖。 */

/** 从 location.pathname 推导站点根路径（末尾带 "/"）。
 *  刻意只用 pathname：它天然不含查询串与 hash。
 *  baseURI 会带上 ?v=... 之类的查询串，用它拼接会让
 *  fetch('content/site.json') 变成 '/content/site.json?v=...'，
 *  静态服务器会返回 404 页面（HTML），于是 JSON 解析报
 *  "Unexpected token '<'"。本地 file:// 直接打开时同样可用。 */
export function detectBase() {
  if(typeof window !== 'undefined' && window.__OSC_BASE__)return window.__OSC_BASE__;
  const pathname = (typeof location !== 'undefined' && location.pathname) || '/';
  return pathname.replace(/[^/]*$/, '');
}

export function resolveUrl(path, base) {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('#')) return path;
  let root = String(base || detectBase()).replace(/[?#].*$/, '');
  // 显式传入的 base 视作目录根：不以 "/" 结尾时补上，
  // 避免 resolveUrl('a.json', '/index.html') 拼出 '/index.htmla.json'
  const lastSegment = root.slice(root.lastIndexOf('/') + 1);
  if (lastSegment) root += '/';
  return root + String(path).replace(/^\.?\//, '');
}

/** 生成 DOM 元素。 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  if(tag==='a' && node.getAttribute('href')?.startsWith('#/')){const [route,query]=node.getAttribute('href').slice(1).split('?');node.setAttribute('href',route.replace(/\/$/,'')+'/' +(query?'?'+query:''));}
  return node;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 只保留安全协议，防止 markdown 里塞进 javascript: 链接。 */
export function safeUrl(url) {
  const trimmed = String(url || '').trim();
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(trimmed)) return trimmed;
  return '#';
}

/** 2026-10-08 / 2026/10/8 / 2026-10-08T12:00:00Z → 2026-10-08 */
export function normalizeDate(input) {
  if (!input) return '';
  const match = String(input).match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return String(input);
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function formatDate(input) {
  const iso = normalizeDate(input);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  return `${match[1]} 年 ${Number(match[2])} 月 ${Number(match[3])} 日`;
}

/** 取文章里最新的日期，用于「最近更新」。 */
export function latestDate(meta) {
  const candidates = [meta.updated, meta.date].filter(Boolean).map(normalizeDate).filter(Boolean).sort();
  return candidates.length ? candidates[candidates.length - 1] : '';
}

/** 截断到指定字数，尽量在标点处收尾。 */
export function truncate(text, limit = 120) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const slice = clean.slice(0, limit);
  const punct = Math.max(
    slice.lastIndexOf('。'), slice.lastIndexOf('；'),
    slice.lastIndexOf('，'), slice.lastIndexOf('.'),
  );
  return (punct > limit * 0.6 ? slice.slice(0, punct + 1) : slice) + '…';
}

/** 取 JSON 数据。
 *  返回 HTML 时给出可读的诊断——静态托管下这几乎总是数据文件路径不对，
 *  而不是数据内容有问题（浏览器只会报 "Unexpected token '<'"）。 */
export async function fetchJson(path, base) {
  const url = resolveUrl(path, base);
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`无法加载 ${path}（HTTP ${response.status}）`);
      const contentType = response.headers.get('content-type') || '';
      if (/text\/html/i.test(contentType)) {
        throw new Error(`${path} 返回的是 HTML 而不是 JSON——数据文件路径不对`
          + `（请求地址 ${url}，请检查服务器根目录是否为项目根目录）`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 120 * attempt));
    }
  }
  throw lastError;
}

export async function fetchText(path, base) {
  const url = resolveUrl(path, base);
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`无法加载 ${path}（HTTP ${response.status}）`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 120 * attempt));
    }
  }
  throw lastError;
}

export function setMeta(name, content) {
  if (!content) return;
  let tag = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
  if (!tag) {
    const isProperty = name.startsWith('og:');
    tag = document.createElement('meta');
    tag.setAttribute(isProperty ? 'property' : 'name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

export function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** 按 key 稳定分组，保持插入顺序。 */
export function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function byDateDesc(a, b) {
  return String(b.updatedAt||b.publishedAt||b.uploadedAt||latestDate(b)).localeCompare(String(a.updatedAt||a.publishedAt||a.uploadedAt||latestDate(a)));
}

export function renderSkeleton(container, lines = 3) {
  container.innerHTML = '';
  const box = el('div', { class: 'skeleton' }, [el('div', { class: 'skeleton__bar skeleton__bar--title' })]);
  for (let i = 0; i < lines; i += 1) {
    box.appendChild(el('div', { class: `skeleton__bar${i === lines - 1 ? ' skeleton__bar--short' : ''}` }));
  }
  container.appendChild(box);
}

export function renderError(container, error) {
  container.innerHTML = '';
  container.appendChild(el('div', { class: 'empty' }, [
    el('p', { text: '内容加载失败' }),
    el('p', { html: `<code>${escapeHtml(error && error.message ? error.message : String(error))}</code>` }),
    el('p', { html: '如果你是双击 HTML 文件打开的页面，浏览器的安全策略会阻止读取数据文件。请在项目目录下运行 <code>python -m http.server 8000</code>，再访问 <code>http://localhost:8000</code>。' }),
  ]));
}

/** Exact server timestamps shown in Asia/Shanghai; legacy dates remain dates. */
export function formatTimestamp(value){
 if(!value)return '';
 if(!/T/.test(value))return normalizeDate(value);
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
