import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

export const validSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
export function parsePost(text, filename) {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${filename} 缺少 YAML frontmatter`);
  const meta = YAML.parse(match[1]);
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error(`${filename} 元数据格式无效`);
  return { meta, body: match[2] };
}
function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export async function readPosts(root) {
  const modules = await readJson(path.join(root, 'content/modules.json'));
  const moduleIds = new Set(modules.map(x => x.slug));
  const files = (await readdir(path.join(root, 'content/posts'))).filter(x => x.endsWith('.md')).sort();
  const posts = [];
  for (const file of files) {
    const { meta, body } = parsePost(await readFile(path.join(root, 'content/posts', file), 'utf8'), file);
    const slug = path.basename(file, '.md');
    if (!validSlug(slug) || meta.slug !== slug) throw new Error(`${file} 的 slug 必须与文件名一致`);
    if (typeof meta.title !== 'string' || !meta.title.trim()) throw new Error(`${file} 缺少标题`);
    if (!moduleIds.has(meta.module)) throw new Error(`${file} 引用了不存在的模块`);
    if (!isDate(meta.date) || !isDate(meta.updated) || meta.updated < meta.date) throw new Error(`${file} 日期无效`);
    for (const key of ['uploaded_at','published_at','updated_at']) if(meta[key]!=null&&!(typeof meta[key]==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(meta[key])&&Number.isFinite(Date.parse(meta[key]))))throw new Error(file+' 的时间戳无效');
    if(meta.publication_id!=null&&!(typeof meta.publication_id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(meta.publication_id)))throw new Error(file+' 的发布记录编号无效');
    if (meta.tags != null && (!Array.isArray(meta.tags) || meta.tags.some(x => typeof x !== 'string'))) throw new Error(`${file} tags 必须为文本数组`);
    if (meta.order != null && !Number.isFinite(meta.order)) throw new Error(`${file} order 必须为数字`);
    if (meta.draft != null && typeof meta.draft !== 'boolean') throw new Error(`${file} draft 必须为布尔值`);
    for (const [field, source, description] of [['images', 'src', '文章图片'], ['attachments', 'file', '附件']]) {
      if (meta[field] == null) continue;
      if (!Array.isArray(meta[field]) || meta[field].some(item => !item || typeof item !== 'object' || Array.isArray(item)
        || typeof item[source] !== 'string' || !item[source].trim()
        || ['title', 'caption'].some(key => item[key] != null && typeof item[key] !== 'string'))) {
        throw new Error(`${file} 的${description}列表格式无效，或缺少文件地址`);
      }
    }
    if (!body.trim()) throw new Error(`${file} 正文不能为空`);
    posts.push({ slug, meta, body });
  }
  return { modules, posts };
}
