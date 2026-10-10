/* 内容层：站点配置、模块、文章元数据与正文的加载与缓存。 */
import { fetchJson, fetchText, normalizeDate, latestDate, byDateDesc, truncate, detectBase } from './util.js?v=20261010-publication-preview';

const SITE_DEFAULT = {
  title: 'Lemoncat的喵喵屋',
  shortTitle: 'Lemoncat的喵喵屋',
  description: '学习笔记与知识整理。',
  author: 'oslemoncat',
  lang: 'zh-CN',
  url: '',
  nav: [
    { label: '首页', href: '#/' },
    { label: '知识模块', href: '#/modules' },
    { label: '全部文章', href: '#/articles' },
    { label: '关于', href: '#/about' },
  ],
  footer: { note: '', icp: '' },
};

function cache() {
  if (!window.__OSC_CACHE__) window.__OSC_CACHE__ = new Map();
  return window.__OSC_CACHE__;
}

async function memo(key, loader) {
  const store = cache();
  if (!store.has(key)) store.set(key, loader());
  return store.get(key);
}

/** 站点根路径（末尾带 "/"）。委托给 util.detectBase，
 *  保证与 resolveUrl 用同一套规则（只取 pathname，丢掉查询串与 hash）。 */
export function baseUrl() {
  return detectBase();
}

export function loadSite() {
  return memo('site', async () => {
    try {
      const data = await fetchJson('content/site.json');
      return { ...SITE_DEFAULT, ...data, footer: { ...SITE_DEFAULT.footer, ...(data.footer || {}) } };
    } catch (error) {
      console.warn('[content] site.json 加载失败，使用默认配置：', error);
      return SITE_DEFAULT;
    }
  });
}

export function loadModules() {
  return memo('modules', async () => {
    try {
      const list = await fetchJson('content/modules.json');
      return (Array.isArray(list) ? list : [])
        .map((item, index) => ({
          slug: item.slug,
          title: item.title || item.slug,
          subtitle: item.subtitle || '',
          description: item.description || '',
          accent: item.accent || '#5b8def',
          order: Number.isFinite(item.order) ? item.order : (index + 1) * 10,
        }))
        .filter((item) => !!item.slug)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh'));
    } catch (error) {
      console.warn('[content] modules.json 加载失败：', error);
      return [];
    }
  });
}

/** 文章列表：优先用生成的索引，缺失时回退到手写清单。 */
async function loadSlugs() {
  try {
    const generated = await fetchJson('content/generated/articles-index.json');
    const slugs = Array.isArray(generated) ? generated : generated.articles;
    if (Array.isArray(slugs) && slugs.length) return slugs;
  } catch {
    /* 属于预期情况：仓库里可能还没有生成索引 */
  }
  const manual = await fetchJson('content/articles.json');
  const slugs = Array.isArray(manual) ? manual : (manual.articles || []);
  return slugs.filter((slug) => typeof slug === 'string' && slug.length > 0);
}

export function loadArticles() {
  return memo('articles', async () => {
    const [slugs, modules] = await Promise.all([loadSlugs(), loadModules()]);
    const moduleMap = new Map(modules.map((item) => [item.slug, item]));

    const results = await Promise.all(slugs.map(async (slug) => {
      try {
        const meta = await fetchJson(`content/articles/${slug}.json`);
        const moduleSlug = meta.module || 'misc';
        const module = moduleMap.get(moduleSlug);
        return {
          slug,
          title: meta.title || slug,
          summary: meta.summary || '',
          module: moduleSlug,
          moduleTitle: module ? module.title : moduleSlug,
          accent: module ? module.accent : '#6b7280',
          date: normalizeDate(meta.date),
          updated: normalizeDate(meta.updated),
          uploadedAt: meta.uploaded_at || '',
          publishedAt: meta.published_at || '',
          updatedAt: meta.updated_at || '',
          publicationId: meta.publication_id || '',
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          cover: meta.cover || '',
          images: Array.isArray(meta.images) ? meta.images : [],
          attachments: Array.isArray(meta.attachments) ? meta.attachments : [],
          draft: meta.draft === true,
          order: Number.isFinite(meta.order) ? meta.order : 0,
          video: meta.video || null,
        };
      } catch (error) {
        console.warn(`[content] 文章元数据缺失或损坏：${slug}`, error);
        return null;
      }
    }));

    return results.filter(Boolean).sort(byDateDesc);
  });
}

export function loadArticleBody(slug) {
  return memo(`body:${slug}`, () => fetchText(`content/articles/${slug}.md`));
}

export function summarize(article, limit = 110) {
  if (article.summary) return article.summary;
  return truncate(article.summary, limit);
}

/** 给模块补充文章数量与最近更新时间。 */
export function decorateModules(modules, articles) {
  return modules.map((module) => {
    const own = articles.filter((article) => article.module === module.slug);
    const dates = own.map(latestDate).filter(Boolean).sort();
    return {
      ...module,
      count: own.length,
      latest: dates.length ? dates[dates.length - 1] : '',
      articles: own,
    };
  });
}

export function findModule(modules, slug) {
  return modules.find((module) => module.slug === slug) || null;
}

export function findArticle(articles, slug) {
  return articles.find((article) => article.slug === slug) || null;
}
