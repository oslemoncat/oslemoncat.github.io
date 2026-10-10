/* 文章详情页：正文渲染、数学公式、目录、上下篇和评论。 */
import { el, resolveUrl, formatDate, formatTimestamp, latestDate, detectBase } from '../assets/js/util.js?v=20261010-publication-preview';
import { loadSite, loadArticles, loadArticleBody, findArticle } from '../assets/js/content.js?v=20261010-publication-preview';
import { renderMarkdown, typesetMath, buildToc } from '../assets/js/markdown.js?v=20261010-publication-preview';
import { breadcrumbs, tagList, pager, emptyState } from '../assets/js/layout.js?v=20261010-publication-preview';
import { initAnchorScroll, initTocHighlight } from '../assets/js/toc.js?v=20261010-publication-preview';
import {api} from '../assets/js/auth.js?v=20261010-publication-preview';

import {createComments} from './comments.js?v=20261010-publication-preview';

import {createFilePreview} from '../assets/js/preview.js?v=20261010-publication-preview';

const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
const KATEX_JS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';

let katexPromise = null;

/** 动态加载 KaTeX（带超时）。失败时公式降级为源码显示，不影响正文。
 *  options.doc 可注入（测试用），options.enabled=false 时直接跳过加载。 */
function ensureKatex(options = {}) {
  const doc = options.doc || document;
  if (options.enabled === false) return Promise.resolve(window.katex || null);
  if (window.katex) return Promise.resolve(window.katex);
  if (katexPromise) return katexPromise;

  katexPromise = new Promise((resolve) => {
    const finish = () => resolve(window.katex || null);
    if (!doc.querySelector(`link[href="${KATEX_CSS}"]`)) {
      doc.head.appendChild(el('link', { rel: 'stylesheet', href: KATEX_CSS }));
    }
    const script = el('script', { src: KATEX_JS, defer: true, onload: finish, onerror: finish });
    setTimeout(finish, 6000);
    doc.head.appendChild(script);
    script.addEventListener('load', finish);
    script.addEventListener('error', finish);
  });
  return katexPromise;
}

function relativeTime(dateString) {
  if (!dateString) return '';
  const then = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days < 0) return '';
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

function resourceUrl(value, base) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw) || raw.startsWith('#')) return '';
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return '';
  const url = resolveUrl(raw, base);
  try {
    const parsed = new URL(url, location.origin);
    return ['http:', 'https:'].includes(parsed.protocol) ? url : '';
  } catch { return ''; }
}

function renderResources(article, base) {
  const sections = [];
  const images = (article.images || []).flatMap(item => {
    const url = resourceUrl(item?.src, base);
    if (!url) return [];
    return [el('figure', { class: 'article-image' }, [
      el('a', { href: url, target: '_self', rel: 'noopener noreferrer', 'aria-label': item.caption || '查看完整图片' }, [
        el('img', { src: url, alt: item.caption || article.title, loading: 'lazy', decoding: 'async' }),
      ]),
      item.caption ? el('figcaption', { text: item.caption }) : null,
    ])];
  });
  if (images.length) sections.push(el('section', { class: 'article-resources', 'aria-label': '文章图片' }, [
    el('h2', { text: '文章图片' }), el('div', { class: 'article-images' }, images),
  ]));

  const attachments = (article.attachments || []).flatMap(item => {
    const url = resourceUrl(item?.file, base);
    if (!url) return [];
    const pathname = new URL(url, location.origin).pathname;
    let filename = pathname.split('/').pop() || '附件';
    try { filename = decodeURIComponent(filename); } catch { /* Keep the original filename. */ }
    const extension = (pathname.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    const title = item.title || filename;
    let preview = null;
    if (['mp4', 'webm', 'ogv'].includes(extension)) {
      preview = el('video', { src: url, controls: true, preload: 'none', playsinline: true, 'aria-label': title });
    } else if (['mp3', 'm4a', 'wav', 'ogg', 'oga', 'flac'].includes(extension)) {
      preview = el('audio', { src: url, controls: true, preload: 'none', 'aria-label': title });
    } else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg'].includes(extension)) {
      preview = el('img', { src: url, alt: title, loading: 'lazy', decoding: 'async' });
    }
    return [el('li', { class: 'article-attachment' }, [
      el('div', { class: 'article-attachment__header' }, [
        el('div', {}, [
          el('a', { class: 'article-attachment__title', href: url, target: '_self', rel: 'noopener noreferrer', text: title }),
          el('span', { class: 'article-attachment__type', text: extension ? extension.toUpperCase() : '文件' }),
        ]),
        el('a', { class: 'btn btn--ghost', href: url, download: filename, text: '下载', 'aria-label': `下载 ${title}` }),
      ]),
      preview,
      createFilePreview(url,title),
    ])];
  });
  if (attachments.length) sections.push(el('section', { class: 'article-resources', 'aria-label': '附件与音视频' }, [
    el('h2', { text: '附件与音视频' }), el('ul', { class: 'article-attachments' }, attachments),
  ]));
  return sections;
}

export async function renderArticle(container, slug, options = {}) {
  const [site, articles] = await Promise.all([loadSite(), loadArticles()]);
  const article = findArticle(articles, slug);
  const doc = options.doc || document;
  const base = detectBase();

  container.innerHTML = '';

  if (!article) {
    const wrap = el('div', { class: 'wrap' });
    wrap.appendChild(breadcrumbs([{ label: '首页', href: '#/' }, { label: '文章不存在' }]));
    wrap.appendChild(emptyState(
      `没有找到文章 ${slug}`,
      '可能是链接过期，或该文章尚未登记进 <code>content/articles.json</code>。'
        + ' <a href="#/articles">返回全部文章</a>',
    ));
    container.appendChild(wrap);
    return;
  }

  let markdown = '';
  try {
    markdown = await loadArticleBody(article.slug);
  } catch (error) {
    console.warn('[article] 正文加载失败：', error);
  }

  const rendered = markdown
    ? renderMarkdown(markdown)
    : { html: '<p>（这篇还没有正文内容）</p>', headings: [] };

  /* 上下篇：同一模块内，按时间排序 */
  const siblings = articles.filter((item) => item.module === article.module);
  const position = siblings.findIndex((item) => item.slug === article.slug);
  const prev = position > 0 ? siblings[position - 1] : null;
  const next = position >= 0 && position < siblings.length - 1 ? siblings[position + 1] : null;

  const wrap = el('div', { class: 'wrap' });
  wrap.appendChild(breadcrumbs([
    { label: '首页', href: '#/' },
    { label: '知识模块', href: '#/modules' },
    { label: article.moduleTitle, href: `#/module/${article.module}` },
    { label: article.title },
  ]));

  /* 正文头 */
  const header = el('header', { class: 'article__header' }, [
    el('a', { class: 'article__module', href: `#/module/${article.module}`, text: article.moduleTitle }),
    el('h1', { class: 'article__title', text: article.title }),
    article.summary ? el('p', { class: 'article__summary', text: article.summary }) : null,
    el('div', { class: 'article__meta' }, [
      article.date ? el('span', { text: `发布于 ${formatTimestamp(article.publishedAt||article.date)}` }) : null,
      article.uploadedAt ? el('span',{text:'上传于 '+formatTimestamp(article.uploadedAt)}) : null,
      article.updated ? el('span', { text: `更新于 ${formatDate(article.updated)}（${relativeTime(article.updated)}）` }) : null,
      el('span', { text: `${Math.max(1, Math.round(markdown.length / 400))} 分钟阅读` }),
    ]),
    tagList(article.tags),
    article.cover
      ? el('figure', { class: 'article__cover' }, [
        el('img', { src: resolveUrl(article.cover, base), alt: article.title, loading: 'lazy', decoding: 'async' }),
      ])
      : null,
  ]);

  const user=window.__LEMONCAT_USER__;
  if(user){
    const controls=el('div',{class:'article-controls'}),status=el('p',{class:'form-status',role:'status'});
    const draw=permissions=>{
      if(!permissions.canDelete)return;
      if(permissions.canEdit)controls.append(el('a',{class:'btn btn--ghost',href:'/workspace/?edit='+encodeURIComponent(article.slug),text:'编辑文章'}));
      const remove=el('button',{class:'btn btn--ghost danger',type:'button',text:'删除文章'});
      remove.addEventListener('click',async()=>{
        if(!confirm('确认删除“'+article.title+'”？删除后将从网站移除。'))return;
        remove.disabled=true;
        try{const result=await api('/api/articles/'+article.slug,{method:'DELETE'});controls.replaceChildren();status.textContent=result.message||'文章已删除，网站将在部署完成后更新。';status.append(' ',el('a',{href:'/articles/',text:'返回文章列表'}));}
        catch(e){status.textContent=e.message;remove.disabled=false;}
      });
      controls.append(remove);const cover=header.querySelector('.article__cover');header.insertBefore(controls,cover);header.insertBefore(status,cover);
    };
    if(user.role==='admin')draw({canDelete:true,canEdit:true});
    else api('/api/articles/'+article.slug+'/permissions').then(draw).catch(()=>{});
  }
  const prose = el('div', { class: 'prose', html: rendered.html });

  const footer = el('footer', { class: 'article__footer' }, [
    el('span', { text: '本文为学习笔记整理，欢迎交流指正。' }),
    el('button', {
      class: 'filter-chip',
      type: 'button',
      text: '复制链接',
      onclick: async (event) => {
        const button = event.currentTarget;
        try {
          await navigator.clipboard.writeText(location.href);
          button.textContent = '已复制 ✓';
        } catch {
          button.textContent = '复制失败，请手动复制地址栏';
        }
        setTimeout(() => { button.textContent = '复制链接'; }, 2200);
      },
    }),
  ]);

  const articleEl = el('article', { class: 'article' }, [header, prose, ...renderResources(article, base), footer]);
  const toc = buildToc(rendered.headings);
  const layout = el('div', { class: 'article-layout' }, [articleEl, toc]);
  wrap.appendChild(layout);

  const pagerNode = pager(prev, next);
  if (pagerNode) articleEl.appendChild(pagerNode);
  articleEl.appendChild(createComments(article,user));

  container.appendChild(wrap);
  container.dataset.slug = article.slug;
  doc.title = `${article.title} · ${site.title}`;

  initAnchorScroll(container);

  // 数学渲染后再做目录高亮，避免布局抖动导致误判
  await ensureKatex(options);
  typesetMath(prose);
  initTocHighlight();
}
