/* 知识模块总览页。 */
import { el } from '../assets/js/util.js';
import { loadModules, loadArticles, decorateModules } from '../assets/js/content.js';
import { pageHead, moduleCard, emptyState } from '../assets/js/layout.js?v=20261009-module-cards-v2';

export async function renderModules(container) {
  const [modules, articles] = await Promise.all([loadModules(), loadArticles()]);
  const decorated = decorateModules(modules, articles);

  container.innerHTML = '';
  const wrap = el('div', { class: 'wrap' });
  wrap.appendChild(pageHead('知识模块', '按课程与主题划分。点进任一模块可以看到该模块下的全部文章。'));

  if (!decorated.length) {
    wrap.appendChild(emptyState(
      '还没有配置知识模块',
      '在 <code>content/modules.json</code> 中新增一项即可，字段说明见 <a href="#/about">关于</a> 页。',
    ));
  } else {
    wrap.appendChild(el('section', { class: 'section' }, [
      el('div', { class: 'grid grid--wide module-grid' }, decorated.map((m,i)=>moduleCard(m,i))),
    ]));
  }

  container.appendChild(wrap);
}
