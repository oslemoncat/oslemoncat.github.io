/* 全部文章页：模块筛选 + 关键字搜索。 */
import { el, debounce } from '../assets/js/util.js?v=20261010-publication-preview';
import { loadModules, loadArticles, decorateModules } from '../assets/js/content.js?v=20261010-publication-preview';
import { pageHead, articleList, emptyState } from '../assets/js/layout.js?v=20261010-publication-preview';

export async function renderArticles(container, params = {}) {
  const [modules, articles] = await Promise.all([loadModules(), loadArticles()]);
  const decorated = decorateModules(modules, articles);

  let activeModule = params.get('module') || 'all';
  let keyword = params.get('q') || '';

  container.innerHTML = '';
  const wrap = el('div', { class: 'wrap' });
  wrap.appendChild(pageHead('全部文章', `共 ${articles.length} 篇，按最近更新排序。`));

  /* 筛选条 */
  const chips = el('div', { class: 'filters' });
  const search = el('input', {
    class: 'search-input',
    type: 'search',
    placeholder: '搜索标题、摘要或标签…',
    value: keyword,
    'aria-label': '搜索文章',
  });

  const chipFor = (label, value) => el('button', {
    class: 'filter-chip',
    type: 'button',
    text: label,
    'aria-pressed': String(activeModule === value),
    dataset: { module: value },
  });

  chips.appendChild(chipFor('全部', 'all'));
  decorated.forEach((module) => chips.appendChild(chipFor(`${module.title} (${module.count})`, module.slug)));
  chips.appendChild(search);
  wrap.appendChild(chips);

  const resultBox = el('div');
  wrap.appendChild(resultBox);

  const apply = () => {
    const needle = keyword.trim().toLowerCase();
    const filtered = articles.filter((article) => {
      if (activeModule !== 'all' && article.module !== activeModule) return false;
      if (!needle) return true;
      const haystack = [article.title, article.summary, article.moduleTitle, ...(article.tags || [])]
        .join(' ').toLowerCase();
      return haystack.includes(needle);
    });

    resultBox.innerHTML = '';
    if (!filtered.length) {
      resultBox.appendChild(emptyState('没有匹配的文章', '换个关键字，或点「全部」清除模块筛选。'));
      return;
    }
    resultBox.appendChild(el('p', { class: 'page-head', style: 'padding:0 0 14px' }, [
      el('span', { class: 'tag', text: `${filtered.length} 篇` }),
    ]));
    resultBox.appendChild(articleList(filtered));
  };

  chips.addEventListener('click', (event) => {
    const chip = event.target.closest('.filter-chip');
    if (!chip) return;
    activeModule = chip.dataset.module;
    chips.querySelectorAll('.filter-chip').forEach((node) => {
      node.setAttribute('aria-pressed', String(node.dataset.module === activeModule));
    });
    syncUrl();
    apply();
  });

  search.addEventListener('input', debounce(() => {
    keyword = search.value;
    syncUrl();
    apply();
  }, 180));

  function syncUrl() {
    const query = new URLSearchParams();
    if (activeModule !== 'all') query.set('module', activeModule);
    if (keyword.trim()) query.set('q', keyword.trim());
    const suffix = query.toString();
    history.replaceState(null, '', `/articles/${suffix ? `?${suffix}` : ''}`);
  }

  apply();
  container.appendChild(wrap);
}
