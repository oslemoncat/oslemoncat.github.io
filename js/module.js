/* 单个知识模块页：模块下的文章列表。 */
import { el } from '../assets/js/util.js?v=20261010-publication-preview';
import { loadModules, loadArticles, decorateModules, findModule } from '../assets/js/content.js?v=20261010-publication-preview';
import { breadcrumbs, pageHead, articleList, emptyState } from '../assets/js/layout.js?v=20261010-publication-preview';

export async function renderModule(container, slug) {
  const [modules, articles] = await Promise.all([loadModules(), loadArticles()]);
  const decorated = decorateModules(modules, articles);
  const module = findModule(decorated, slug);

  container.innerHTML = '';
  const wrap = el('div', { class: 'wrap' });
  wrap.appendChild(breadcrumbs([
    { label: '首页', href: '#/' },
    { label: '知识模块', href: '#/modules' },
    { label: module ? module.title : slug },
  ]));

  if (!module) {
    wrap.appendChild(pageHead('模块不存在', `没有找到 slug 为 ${slug} 的知识模块。`));
    wrap.appendChild(emptyState('检查 content/modules.json', '确认该模块已登记，且 slug 拼写一致。'));
    container.appendChild(wrap);
    return;
  }

  wrap.appendChild(pageHead(module.title, module.description));
  wrap.appendChild(el('section', { class: 'section', style: `--card-accent:${module.accent}` }, [
    el('div', { class: 'section__head' }, [
      el('h2', { class: 'section__title', text: '本模块文章' }),
      el('span', { class: 'tag', text: `${module.articles.length} 篇` }),
    ]),
    module.articles.length
      ? articleList(module.articles)
      : emptyState('这个模块还没有文章', '在写作区选择这个知识模块，就可以提交第一篇文章。'),
  ]));

  container.appendChild(wrap);
}
