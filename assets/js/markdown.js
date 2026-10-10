/* 轻量 Markdown 渲染器（零依赖，自带实现，不依赖任何 CDN 或构建步骤）。
   支持：标题、段落、列表（含嵌套）、引用、代码块、行内代码、表格、分隔线、
        链接、图片、加粗/斜体/删除线、脚注式链接、行内与块级数学公式，
        以及 ::: 提示块（note/tip/warn/key）、定理块（definition/theorem/example/proof），
        和 ::: video 外链卡片。
   设计约束：先抽取代码片段与数学公式，再做 HTML 转义，因此公式中的 < > & 不会被破坏。 */
import { escapeHtml, safeUrl, el } from './util.js?v=20261010-publication-preview';

/* 提示块与定理块的类型注册表——要加新类型，只改这里。 */
const CONTAINER_TYPES = {
  note: { className: 'callout callout--note', defaultTitle: '说明' },
  tip: { className: 'callout callout--tip', defaultTitle: '提示' },
  warn: { className: 'callout callout--warn', defaultTitle: '注意' },
  key: { className: 'callout callout--key', defaultTitle: '要点' },
  info: { className: 'callout callout--note', defaultTitle: '说明' },
  definition: { className: 'theorem theorem--definition', defaultTitle: '定义' },
  theorem: { className: 'theorem theorem--theorem', defaultTitle: '定理' },
  example: { className: 'theorem theorem--example', defaultTitle: '例题' },
  proof: { className: 'theorem theorem--proof', defaultTitle: '证明' },
  solution: { className: 'theorem theorem--example', defaultTitle: '解答' },
};

const CALLOUT_CLASSES = new Set(['callout callout--note', 'callout callout--tip', 'callout callout--warn', 'callout callout--key']);

export function slugifyHeading(text) {
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5\-.]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'section';
}

/** 行内渲染：数学 → 行内代码 → 图片/链接 → 强调 → 转义。 */
export function renderInline(source) {
  const vault = [];
  const stash = (html) => `\u0000${vault.push(html) - 1}\u0000`;

  let text = String(source ?? '');

  // 1) 行内数学 $...$（不跨行；\$ 转义，$ 后不能是空格）
  text = text.replace(/(?<!\\)\$(?!\s)((?:[^$\\\n]|\\.)+?)(?<!\\)\$/g, (match, body) => {
    const tex = body.replace(/\\\$/g, '$');
    return stash(`<span class="math-inline" data-tex="${escapeHtml(tex)}"></span>`);
  });

  // 2) 行内代码 `...`
  text = text.replace(/`([^`\n]+)`/g, (match, code) => stash(`<code>${escapeHtml(code)}</code>`));

  // 3) 转义其余文本
  text = escapeHtml(text);

  // 4) 图片 ![alt](src "title")
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (match, alt, src, title) => {
    const url = escapeHtml(safeUrl(src));
    const caption = alt ? ` alt="${escapeHtml(alt)}"` : ' alt=""';
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return stash(`<img src="${url}"${caption}${titleAttr} loading="lazy" decoding="async">`);
  });

  // 5) 链接 [text](href "title")
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (match, label, href, title) => {
    const url = safeUrl(href);
    const external = /^https?:/i.test(url);
    const attrs = external ? ' target="_self" rel="noopener noreferrer"' : '';
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return stash(`<a href="${escapeHtml(url)}"${attrs}${titleAttr}>${label}</a>`);
  });

  // 6) 强调
  text = text
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '<em>$1</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  // 7) 换行
  text = text.replace(/ {2,}\n/g, '<br>\n');

  // 8) 还原
  return text.replace(/\u0000(\d+)\u0000/g, (match, index) => vault[Number(index)] ?? '');
}

function parseTableRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');
}

function isBlockStart(lines, index) {
  const line = lines[index];
  if (typeof line !== 'string') return true;
  if (/^\s*$/.test(line)) return true;
  if (/^\s*(```|~~~)/.test(line)) return true;
  if (/^\s*\$\$\s*$/.test(line)) return true;
  if (/^\s*:::\s*\S/.test(line)) return true;
  if (/^#{1,6}\s/.test(line)) return true;
  if (/^\s*>/.test(line)) return true;
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return true;
  if (/^\s*\d+[.)]\s/.test(line)) return true;
  if (/^\s*[-*+]\s/.test(line)) return true;
  return false;
}

function renderList(lines, startIndex) {
  const first = lines[startIndex];
  const ordered = /^\s*\d+[.)]\s/.test(first);
  const indent = first.match(/^\s*/)[0].length;
  const itemPattern = ordered ? /^(\s*)\d+[.)]\s+(.*)$/ : /^(\s*)[-*+]\s+(.*)$/;

  const items = [];
  let current = null;
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*$/.test(line)) {
      // 空行后如果还有同层或更深层的列表项，继续；否则结束
      const next = lines[index + 1];
      if (next === undefined) break;
      const nextMatch = next.match(itemPattern);
      const nextIndent = next.match(/^\s*/)[0].length;
      if (!nextMatch && nextIndent <= indent) break;
      index += 1;
      continue;
    }
    const match = line.match(itemPattern);
    if (match && match[1].length <= indent) {
      if (current) items.push(current);
      current = [match[2]];
      index += 1;
      continue;
    }
    if (current) {
      current.push(line.replace(new RegExp(`^\\s{0,${indent + 2}}`), ''));
      index += 1;
      continue;
    }
    break;
  }
  if (current) items.push(current);

  const listItems = items.map((itemLines) => {
    const nested = [];
    const own = [];
    let seenNested = false;
    for (const line of itemLines) {
      if (/^\s*(\d+[.)]|[-*+])\s/.test(line) && !seenNested) {
        seenNested = true;
      }
      if (seenNested) nested.push(line);
      else own.push(line);
    }
    const inner = [];
    if (own.length) inner.push(renderInline(own.join(' ').trim()));
    if (nested.length) inner.push(renderBlocks(nested).html);
    return `<li>${inner.join('')}</li>`;
  });

  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && /^\s*(\d+)/.test(first) && first.match(/^\s*(\d+)/)[1] !== '1'
    ? ` start="${first.match(/^\s*(\d+)/)[1]}"`
    : '';
  return { html: `<${tag}${startAttr}>${listItems.join('')}</${tag}>`, next: index };
}

function renderContainer(lines, startIndex, context) {
  const opener = lines[startIndex].match(/^\s*:::\s*([a-zA-Z-]+)\s*(.*)$/);
  const type = (opener[1] || 'note').toLowerCase();
  const title = opener[2].trim();
  const bodyLines = [];
  let index = startIndex + 1;

  while (index < lines.length) {
    if (/^\s*:::\s*$/.test(lines[index])) break;
    bodyLines.push(lines[index]);
    index += 1;
  }
  const next = index + 1; // 跳过闭合的 :::

  // 视频外链卡片
  if (type === 'video') {
    return { html: renderVideoCard(title, bodyLines), next };
  }

  const spec = CONTAINER_TYPES[type] || CONTAINER_TYPES.note;
  const heading = title || spec.defaultTitle;
  const isCallout = CALLOUT_CLASSES.has(spec.className);
  const body = renderBlocks(bodyLines, context).html;

  if (isCallout) {
    return {
      html: `<aside class="${spec.className}"><p class="callout__title">${renderInline(heading)}</p>${body}</aside>`,
      next,
    };
  }
  return {
    html: `<div class="${spec.className}"><span class="theorem__label">${escapeHtml(heading)}</span>`
      + `<div class="theorem__body">${body}</div></div>`,
    next,
  };
}

function renderVideoCard(title, bodyLines) {
  const attrs = {};
  for (const line of bodyLines) {
    const match = line.match(/^\s*([a-zA-Z-]+)\s*[:：]\s*(.+)$/);
    if (match) attrs[match[1].toLowerCase()] = match[2].trim();
  }
  const href = safeUrl(attrs.url || attrs.href || '');
  const label = title || attrs.title || '外部视频';
  const source = attrs.source || attrs.platform || '';
  const duration = attrs.duration || '';
  const metaParts = [source, duration].filter(Boolean);
  return [
    `<div class="video-card">`,
    `<div class="video-card__icon" aria-hidden="true">`,
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`,
    `</div>`,
    `<div class="video-card__body">`,
    `<p class="video-card__title"><a href="${escapeHtml(href)}" target="_self" rel="noopener noreferrer">${renderInline(label)}</a></p>`,
    `<p class="video-card__meta">${metaParts.length ? escapeHtml(metaParts.join(' · ')) : '在新标签页打开'}</p>`,
    `</div>`,
    `</div>`,
  ].join('');
}

/** 块级渲染。返回 { html, headings }，headings 供目录使用。 */
export function renderBlocks(lines, context = { headings: [] }) {
  const out = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*$/.test(line)) { index += 1; continue; }

    // 代码块
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)\s*$/);
    if (fence) {
      const marker = fence[1];
      const lang = fence[2] || '';
      const code = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${marker}\\s*$`).test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      out.push(`<pre><code${langClass}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    // 块级数学 $$ ... $$
    if (/^\s*\$\$\s*$/.test(line)) {
      const math = [];
      index += 1;
      while (index < lines.length && !/^\s*\$\$\s*$/.test(lines[index])) {
        math.push(lines[index]);
        index += 1;
      }
      index += 1;
      out.push(`<div class="math-display" data-tex="${escapeHtml(math.join('\n').trim())}"></div>`);
      continue;
    }
    const singleLineMath = line.match(/^\s*\$\$(.+?)\$\$\s*$/);
    if (singleLineMath) {
      out.push(`<div class="math-display" data-tex="${escapeHtml(singleLineMath[1].trim())}"></div>`);
      index += 1;
      continue;
    }

    // ::: 容器
    if (/^\s*:::\s*[a-zA-Z-]+/.test(line)) {
      const result = renderContainer(lines, index, context);
      out.push(result.html);
      index = result.next;
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      const sourceLevel = heading[1].length;
      // 文章标题由页面渲染，正文里的 # 与 ## 统一作为节标题，避免一页出现两个 h1
      const level = Math.min(Math.max(sourceLevel + 1, 2), 4);
      const text = renderInline(heading[2]);
      const id = context.uniqueHeadingId
        ? context.uniqueHeadingId(slugifyHeading(heading[2]))
        : slugifyHeading(heading[2]);
      context.headings.push({ id, text: heading[2], html: text, level });
      out.push(`<h${level} id="${id}"><a class="heading-anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${level}>`);
      index += 1;
      continue;
    }

    // 分隔线
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      index += 1;
      continue;
    }

    // 引用
    if (/^\s*>/.test(line)) {
      const quoted = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      out.push(`<blockquote>${renderBlocks(quoted, context).html}</blockquote>`);
      continue;
    }

    // 表格
    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const header = parseTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes('|') && !/^\s*$/.test(lines[index])) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      const head = header.map((cell) => `<th>${renderInline(cell)}</th>`).join('');
      const body = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }

    // 列表
    if (/^\s*(\d+[.)]|[-*+])\s/.test(line)) {
      const result = renderList(lines, index);
      out.push(result.html);
      index = result.next;
      continue;
    }

    // 段落
    const paragraph = [];
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    if (paragraph.length) out.push(`<p>${renderInline(paragraph.join('\n'))}</p>`);
  }

  return { html: out.join('\n'), headings: context.headings };
}

/** 渲染完整 Markdown 文档。 */
export function renderMarkdown(markdown) {
  const used = new Set();
  const context = {
    headings: [],
    uniqueHeadingId(base) {
      let id = base;
      let n = 2;
      while (used.has(id)) { id = `${base}-${n}`; n += 1; }
      used.add(id);
      return id;
    },
  };
  let text = String(markdown || '').replace(/\r\n?/g, '\n');
  // 去掉 YAML front matter（元数据统一放在同名 .json 里，这里只是容错）
  text = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const { html } = renderBlocks(text.split('\n'), context);
  return { html, headings: context.headings };
}

/** 把 data-tex 占位元素交给 KaTeX 渲染；未加载 KaTeX 时降级为可读的公式源码。 */
export function typesetMath(root) {
  const targets = root.querySelectorAll('.math-inline, .math-display');
  if (!targets.length) return;

  const katex = window.katex;
  targets.forEach((node) => {
    const tex = node.getAttribute('data-tex') || '';
    const displayMode = node.classList.contains('math-display');
    if (katex && typeof katex.render === 'function') {
      try {
        katex.render(tex, node, {
          displayMode,
          throwOnError: false,
          strict: false,
          trust: false,
          macros: { '\\R': '\\mathbb{R}', '\\N': '\\mathbb{N}', '\\Q': '\\mathbb{Q}', '\\eps': '\\varepsilon' },
        });
        return;
      } catch (error) {
        console.warn('[markdown] KaTeX 渲染失败：', tex, error);
      }
    }
    // 降级：显示原始 TeX，保证内容仍然可读
    node.classList.add('math-error');
    node.textContent = displayMode ? `$$${tex}$$` : `$${tex}$`;
  });
}

/** 目录 DOM。 */
export function buildToc(headings) {
  const usable = headings.filter((item) => item.level >= 2 && item.level <= 3);
  if (usable.length < 2) return null;
  const list = el('ol');
  for (const heading of usable) {
    const link = el('a', { href: `#${heading.id}` });
    link.innerHTML = heading.html;
    list.appendChild(el('li', { class: heading.level === 3 ? 'toc__lvl-3' : 'toc__lvl-2' }, [link]));
  }
  return el('nav', { class: 'toc', 'aria-label': '本页目录' }, [
    el('p', { class: 'toc__title', text: '目录' }),
    list,
  ]);
}
