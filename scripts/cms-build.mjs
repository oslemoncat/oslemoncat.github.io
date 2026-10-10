import { mkdir, writeFile, cp, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { readJson, readPosts } from './cms-content.mjs';

const ignoredLegacy = new Set(['articles', 'posts', 'generated', 'articles.json']);
// A fresh output directory prevents deleted/unpublished posts remaining online.
// No recursive delete is needed: each build uses a new directory.
export async function buildSite(root, out) {
  try { await lstat(out); throw new Error(`输出目录已存在：${out}；请选择一个新的空目录。`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const { modules, posts } = await readPosts(root);
  const published = posts.filter(post => post.meta.draft !== true);
  await mkdir(path.join(out, 'content/articles'), { recursive: true });
  for (const name of ['index.html', '404.html', 'app.js', '.nojekyll', 'assets', 'js', 'admin']) {
    await cp(path.join(root, name), path.join(out, name), { recursive: true });
  }
  try{await lstat(path.join(root,'lemon-cat'));await cp(path.join(root,'lemon-cat'),path.join(out,'lemon-cat'),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
  // Keep existing content-layer side files; author sources and legacy indexes are excluded.
  const { readdir, readFile } = await import('node:fs/promises');
  for (const name of await readdir(path.join(root, 'content'))) {
    if (!ignoredLegacy.has(name)) await cp(path.join(root, 'content', name), path.join(out, 'content', name), { recursive: true });
  }
  for (const { slug, meta, body } of published) {
    const { slug: ignored, ...frontendMeta } = meta;
    await writeFile(path.join(out, 'content/articles', `${slug}.json`), JSON.stringify(frontendMeta, null, 2) + '\n');
    await writeFile(path.join(out, 'content/articles', `${slug}.md`), body);
  }
  await writeFile(path.join(out,'build-info.json'),JSON.stringify({commit:process.env.GITHUB_SHA||null,builtAt:new Date().toISOString(),publications:published.filter(p=>p.meta.publication_id).map(p=>({id:p.meta.publication_id,slug:p.slug}))},null,2)+'\n');
  const index = JSON.stringify({ articles: published.map(x => x.slug) }, null, 2) + '\n';
  await writeFile(path.join(out, 'content/articles.json'), index);
  await mkdir(path.join(out, 'content/generated'), { recursive: true });
  await writeFile(path.join(out, 'content/generated/articles-index.json'), index);
  const config = YAML.parse(await readFile(path.join(root, 'admin/config.yml'), 'utf8'));
  config.collections.find(x => x.name === 'posts').fields.find(x => x.name === 'module').options = modules.map(x => ({ label: x.title, value: x.slug }));
  await writeFile(path.join(out, 'admin/config.yml'), YAML.stringify(config));
  const template=await readFile(path.join(out,'index.html'),'utf8');
  const routes=['modules','articles','about','login','workspace','workspace/submissions','workspace/review','workspace/approved','workspace/published','workspace/assist',...modules.map(m=>{if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.slug))throw new Error('Invalid module slug');return 'module/'+m.slug;}),...published.map(p=>'article/'+p.slug)];
  for(const route of routes){await mkdir(path.join(out,route),{recursive:true});await writeFile(path.join(out,route,'index.html'),template);}
  return { total: posts.length, published: published.length };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = path.join(root, 'dist');
  const result = await buildSite(root, out);
  console.log(`构建完成：${result.published}/${result.total} 篇文章发布到 dist/。`);
}
