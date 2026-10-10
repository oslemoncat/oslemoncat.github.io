/* 布局与共享组件：页头、页脚、卡片、列表、分页、面包屑。 */
import { el, formatDate, formatTimestamp, latestDate, resolveUrl, escapeHtml } from './util.js?v=20261010-publication-preview';
import { icon } from './theme.js?v=20261010-publication-preview';

/* ------------------------------------------------------------------ 页头 */
export function renderHeader(site, activeSection = '', user = null) {
  const navLinks = (site.nav || []).map((item) => {
    const key = (item.href || '').replace(/^#\//, '').split('/')[0] || 'home';
    const isActive = key === activeSection;
    return el('a', {
      href: item.href,
      target: '_self',
      text: item.label,
      ...(isActive ? { 'aria-current': 'page' } : {}),
    });
  });

  const nav = el('nav', { class: 'site-nav', id: 'site-nav', 'aria-label': '主导航' }, navLinks);
  const themeBtn = el('button', { class: 'icon-btn', id: 'theme-toggle', type: 'button' });
  const toggle = el('button', {
    class: 'icon-btn nav-toggle',
    id: 'nav-toggle',
    type: 'button',
    'aria-label': '展开导航',
    'aria-expanded': 'false',
    'aria-controls': 'site-nav',
    html: icon('menu'),
  });

  const header = el('header', { class: 'site-header' }, [
    el('div', { class: 'wrap site-header__inner' }, [
      el('a', { class: 'brand', href: '#/', target: '_self' }, [
        el('img',{class:'brand__mark',src:'/assets/images/favicon.svg?v=4',alt:'',width:48,height:48}),
        el('span', { text: site.shortTitle || site.title }),
      ]),
      nav,
      el('div',{class:'header-actions'},[themeBtn,el('a',{class:'account-link',href:user?'/workspace/':'/login/','aria-label':user?'进入写作区':'登录'},user?[el('img',{src:user.avatar||'/assets/images/favicon.svg?v=4',alt:'',width:36,height:36}),el('span',{text:user.login})]:[el('span',{text:'登录'})]),toggle]),
    ]),
  ]);

  return { header, themeBtn, toggle, nav };
}

export function renderFooter(site, buildInfo = '') {
  const children = [
    el('span', { text: `© ${new Date().getFullYear()} ${site.author || site.shortTitle || ''}` }),
    el('span', { text: site.footer?.note || '' }),

  ];
  if (site.footer?.icp) children.push(el('span', { text: site.footer.icp }));
  return el('footer', { class: 'site-footer' }, [el('div', { class: 'wrap site-footer__inner' }, children)]);
}

/* ---------------------------------------------------------------- 通用件 */
export function sectionHead(title, options = {}) {
  const children = [el('h2', { class: 'section__title', text: title })];
  if (options.note) children.push(el('span', { class: 'tag', text: options.note }));
  if (options.more) {
    children.push(el('a', { class: 'section__more', href: options.more.href, text: options.more.label }));
  }
  return el('div', { class: 'section__head' }, children);
}

export function pageHead(title, description) {
  return el('div', { class: 'page-head' }, [
    el('h1', { text: title }),
    description ? el('p', { text: description }) : null,
  ]);
}

export function breadcrumbs(items) {
  const list = el('ol');
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    list.appendChild(el('li', {}, [
      isLast || !item.href ? el('span', { text: item.label }) : el('a', { href: item.href, text: item.label }),
    ]));
  });
  return el('nav', { class: 'crumbs', 'aria-label': '面包屑' }, [list]);
}

export function tagList(tags = []) {
  if (!tags.length) return null;
  return el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' }, tags.map((tag) => el('span', { class: 'tag', text: tag })));
}

/* ------------------------------------------------------------ 模块卡片 */
/* 链接带 module-card__link 类：CSS 用它把点击区域铺满整张卡片（stretched link），
   因此整块区域可点，而不是只有标题文字。 */
export function moduleCard(module,index=0){return el('article',{class:'card card--module'},[el('span',{class:'module-number',text:String(index+1).padStart(2,'0')}),el('div',{class:'module-copy'},[el('h3',{class:'card__title'},[el('a',{class:'module-card__link',href:`#/module/${module.slug}`,text:module.title})]),el('p',{class:'card__desc',text:module.subtitle||module.description})]),el('span',{class:'module-count',text:`${module.count??0} 篇文章`})]);}
/* ------------------------------------------------------------ 文章卡片 */
export function articleCard(article, base) {
  const cover = article.cover
    ? el('div', { class: 'article-card__cover' }, [
      el('img', { src: resolveUrl(article.cover, base), alt: '', loading: 'lazy', decoding: 'async' }),
    ])
    : null;
  return el('article', { class: 'card', style: `--card-accent:${article.accent}` }, [
    el('div', { class: 'card__accent' }),
    el('h3', { class: 'card__title' }, [el('a', { href: `#/article/${article.slug}`, text: article.title })]),
    article.summary ? el('p', { class: 'card__desc', text: article.summary }) : null,
    el('div', { class: 'card__meta' }, [
      el('a', { class: 'tag tag--accent', href: `#/module/${article.module}`, text: article.moduleTitle }),
      article.date ? el('span', { text: formatTimestamp(article.uploadedAt||article.publishedAt||article.date) }) : null,
    ]),
    cover,
  ]);
}

/* -------------------------------------------------------------- 列表行 */
export function articleList(articles) {
  const list = el('div', { class: 'list' });
  for (const article of articles) {
    list.appendChild(el('a', { class: 'list__item', href: `#/article/${article.slug}` }, [
      el('span', { class: 'list__date', text: formatTimestamp(article.uploadedAt||article.publishedAt||article.date) || '—' }),
      el('span', { class: 'list__body' }, [
        el('span', { class: 'list__title', text: article.title }),
        article.summary ? el('span', { class: 'list__summary', text: article.summary }) : null,
      ]),
      el('span', { class: 'list__module', text: article.moduleTitle }),
    ]));
  }
  return list;
}

/* ---------------------------------------------------------------- 分页 */
export function pager(prev, next) {
  if (!prev && !next) return null;
  const cell = (article, kind) => {
    if (!article) return el('div', { class: 'pager__link pager__link--empty' });
    return el('a', { class: `pager__link pager__link--${kind}`, href: `#/article/${article.slug}` }, [
      el('span', { class: 'pager__label', text: kind === 'prev' ? '← 上一篇' : '下一篇 →' }),
      el('span', { class: 'pager__title', text: article.title }),
    ]);
  };
  return el('div', { class: 'pager' }, [cell(prev, 'prev'), cell(next, 'next')]);
}

export function emptyState(title, hintHtml) {
  return el('div', { class: 'empty' }, [
    el('p', { text: title }),
    hintHtml ? el('p', { html: hintHtml }) : null,
  ]);
}

export function notice(html) {
  return el('div', { class: 'notice', html });
}
