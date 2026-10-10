/* 应用入口：独立路径路由、统一登录、页头页脚和页面分发。
   构建为模块、文章、登录与写作区生成对应 HTML。旧 #/ 链接会跳到新路径。
   startApp 可注入测试依赖；boot 启用真实登录检查。 */
import { el } from './assets/js/util.js?v=20261010-publication-preview';
import { loadSite, loadArticles } from './assets/js/content.js?v=20261010-publication-preview';
import { renderHeader, renderFooter } from './assets/js/layout.js?v=20261010-publication-preview';
import { initTheme } from './assets/js/theme.js?v=20261010-publication-preview';
import {restoreSession} from './assets/js/auth.js?v=20261010-publication-preview';
import {renderLogin,safeNext} from './js/login.js?v=20261010-publication-preview';
import { initAnchorScroll } from './assets/js/toc.js?v=20261010-publication-preview';

const ROUTES = [
  {pattern:/^\/login\/?$/,page:'login',section:''},
  {pattern:/^\/workspace(?:\/(submissions|review|approved|published|assist))?\/?$/,page:'workspace',section:''},
  { pattern: /^\/?$/, page: 'home', section: 'home' },
  { pattern: /^\/modules\/?$/, page: 'modules', section: 'modules' },
  { pattern: /^\/module\/(.+?)\/?$/, page: 'module', section: 'modules' },
  { pattern: /^\/articles\/?$/, page: 'articles', section: 'articles' },
  { pattern: /^\/article\/(.+?)\/?$/, page: 'article', section: 'articles' },
  { pattern: /^\/about\/?$/, page: 'about', section: 'about' },
];

const LOADERS = {
  workspace:()=>import('./js/workspace.js?v=20261010-publication-preview').then(m=>m.renderWorkspace),
  login:()=>Promise.resolve(renderLogin),
  home: () => import('./js/home.js?v=20261010-publication-preview').then((mod) => mod.renderHome),
  modules: () => import('./js/modules.js?v=20261010-publication-preview').then((mod) => mod.renderModules),
  module: () => import('./js/module.js?v=20261010-publication-preview').then((mod) => mod.renderModule),
  articles: () => import('./js/articles.js?v=20261010-publication-preview').then((mod) => mod.renderArticles),
  article: () => import('./js/article.js?v=20261010-publication-preview').then((mod) => mod.renderArticle),
  about: () => import('./js/about.js?v=20261010-publication-preview').then((mod) => mod.renderAbout),
};

/** 把 location.hash 解析成 { path, params }。
 *  约定：path 一律以 "/" 开头、不带结尾斜杠，根路径为 "/"。
 *  例：#/ -> "/"，"" -> "/"，#/about -> "/about"，#/module/x?y=1 -> "/module/x" + {y:1} */
export function parseHash(hash) {
  const raw = String(hash === undefined ? location.hash : hash).replace(/^#/, '');
  const [pathPart, queryPart] = raw.split('?');
  let path = pathPart || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/';
  return { path, params: new URLSearchParams(queryPart || '') };
}

/** 路由匹配。导出以便单元测试覆盖。返回 null 表示没有对应页面。 */
export function matchRoute(path) {
  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (match) return { ...route, arg: match[1] ? decodeURIComponent(match[1]) : '' };
  }
  return null;
}

export function buildInfo(doc = document) {
  return doc.lastModified ? new Date(doc.lastModified).toISOString().slice(0, 10) : 'dev';
}

/** 可注入依赖的启动函数，返回路由函数以便测试驱动。 */
export async function startApp(deps = {}) {
  const doc = deps.document || document;
  const win = deps.window || window;
  const loaderFor = deps.loaders || ((page) => (LOADERS[page] ? LOADERS[page]() : Promise.resolve(null)));
  const loadSiteFn = deps.loadSite || loadSite;
  const loadArticlesFn = deps.loadArticles || loadArticles;
  const buildInfoFn = deps.buildInfo || (() => buildInfo(doc));

  const site = await loadSiteFn();
  let user=null,authError='';
  if(deps.requireAuth){try{user=await restoreSession();}catch(e){authError=e.message;}win.__LEMONCAT_USER__=user;}

  const headerMount = doc.getElementById('site-header');
  const footerMount = doc.getElementById('site-footer');
  const content = doc.getElementById('content');
  if (!content) throw new Error('index.html 缺少 #content 容器');

  const { header, themeBtn, toggle, nav } = renderHeader(site, '', user);
  if (headerMount) headerMount.replaceWith(header);
  if (footerMount) footerMount.replaceWith(renderFooter(site, buildInfoFn()));

  initTheme(themeBtn, { win, doc });

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = open
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"></path></svg>';
  });

  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  initAnchorScroll(content);

  async function route() {
    let {path,params}=parseHash(win.location?.hash);
    if(!win.location?.hash?.startsWith('#/')){path=(win.location?.pathname||'/').slice((win.__OSC_BASE__||'/').length-1)||'/';if(path.length>1)path=path.replace(/\/+$/,'');params=new URLSearchParams(win.location?.search||'');}
    if(deps.requireAuth&&!user&&path!=='/login'){win.location.replace('/login/?next='+encodeURIComponent(path+(params.size?'?'+params:'')));return;}
    if(deps.requireAuth&&user&&path==='/login'){win.location.replace(safeNext(params.get('next')));return;}
    const matched = matchRoute(path);
    const section = matched ? matched.section : '';
    const page = matched ? matched.page : 'notfound';

    nav.querySelectorAll('a').forEach((link) => {
      const key = (link.getAttribute('href') || '').replace(/^#?\//, '').split('/')[0] || 'home';
      if (key === section) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    delete content.dataset.slug;
    content.innerHTML = '';
    if (typeof win.scrollTo === 'function') win.scrollTo({ top: 0, behavior: 'auto' });

    let render = null;
    let loadFailed = false;
    try {
      render = await loaderFor(page);
    } catch (error) {
      console.error('[app] 页面脚本加载失败：', error);
      loadFailed = true;
    }

    try {
      if (!render) {
        content.appendChild(el('div', { class: 'wrap' }, [
          el('div', { class: 'page-head' }, [
            el('h1', { text: loadFailed ? '页面脚本加载失败' : '页面不存在' }),
            el('p', {
              text: loadFailed
                ? `渲染 ${path} 所需的脚本没有加载成功，请刷新重试。`
                : `没有与 ${path} 对应的页面。`,
            }),
          ]),
          el('p', {}, [el('a', { class: 'btn btn--primary', href: '#/', text: '回到首页' })]),
        ]));
      } else if(page==='login'){await render(content,params,authError);
      } else if(page==='workspace'){if(matched.arg)params.set('view',matched.arg);await render(content,params);
      } else if (page === 'articles') {
        await render(content, params);
      } else if (page === 'module' || page === 'article') {
        await render(content, matched.arg);
      } else {
        await render(content);
      }
    } catch (error) {
      console.error('[app] 页面渲染失败：', error);
      content.innerHTML = '';
      content.appendChild(el('div', { class: 'wrap' }, [
        el('div', { class: 'empty' }, [
          el('p', { text: '这个页面渲染出错了' }),
          el('p', { text: String(error && error.message ? error.message : error) }),
          el('p', {}, [el('a', { href: '#/', text: '回到首页' })]),
        ]),
      ]));
    }

    if (page !== 'article') doc.title = site.title;
  }

  win.addEventListener('hashchange', route);

  // 预取文章索引，让筛选/列表更快，也提前暴露数据问题
  loadArticlesFn().catch(() => {});
  await route();

  return route;
}

async function boot() {
  // The entry module stays at the site root, including when a nested page is opened.
  window.__OSC_BASE__=new URL('./',import.meta.url).pathname;
  if(location.hash.startsWith('#/')){const r=parseHash(location.hash);location.replace(r.path.replace(/\/$/,'')+'/'+(r.params.size?'?'+r.params:''));return;}
  await startApp({requireAuth:true});
}

if (/^https?:$/.test(new URL(import.meta.url).protocol)) boot().catch((error) => {
  console.error('[app] 启动失败：', error);
  const box = el('div', { class: 'wrap' }, [
    el('div', { class: 'empty' }, [
      el('p', { text: '站点启动失败' }),
      el('p', { text: String(error && error.message ? error.message : error) }),
    ]),
  ]);
  const body = document.body || document.documentElement;
  if (body && typeof body.appendChild === 'function') body.appendChild(box);
});
