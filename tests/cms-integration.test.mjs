import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';
import { migrate } from '../scripts/cms-migrate.mjs';
import { buildSite } from '../scripts/cms-build.mjs';
import { parsePost, readPosts } from '../scripts/cms-content.mjs';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'oslemoncat-cms-test-'));
  for (const folder of ['content/articles', 'content/posts', 'assets', 'js', 'admin']) await mkdir(path.join(root, folder), { recursive: true });
  for (const name of ['index.html', '404.html', 'app.js', '.nojekyll']) await writeFile(path.join(root, name), 'fixture');
  await writeFile(path.join(root, 'content/modules.json'), JSON.stringify([{ slug: 'math-analysis', title: '数学分析' }]));
  await writeFile(path.join(root, 'content/site.json'), JSON.stringify({ nav: [] }));
  await writeFile(path.join(root, 'admin/config.yml'), await readFile(path.join(project, 'admin/config.yml')));
  return root;
}
async function cleanup(root) {
  const target = path.resolve(root), temporaryRoot = path.resolve(os.tmpdir());
  const relative = path.relative(temporaryRoot, target);
  if (!relative.startsWith('oslemoncat-cms-test-') || relative.includes(path.sep) || path.isAbsolute(relative)) throw new Error('Invalid test cleanup path');
  await rm(target, { recursive: true, force: true });
}
const metadata = slug => ({ slug, title: '标题', summary: '摘要', module: 'math-analysis', date: '2026-10-08', updated: '2026-10-08', tags: ['极限'], order: 0, draft: false });
const savePost = (root, slug, meta, body) => writeFile(path.join(root, 'content/posts', `${slug}.md`), `---\n${YAML.stringify(meta)}---\n${body}`);
test('Migration preserves Markdown and is safe to repeat', async () => {
  const root = await fixture();
  try {
    const original = '## 数列\n\n$$a_n=1/n$$\n\n::: theorem 标题\n正文\n:::\n';
    const { slug, ...meta } = metadata('sequence');
    await writeFile(path.join(root, 'content/articles/sequence.json'), JSON.stringify(meta));
    await writeFile(path.join(root, 'content/articles/sequence.md'), original);
    assert.equal(await migrate(root), 1);
    assert.equal(parsePost(await readFile(path.join(root, 'content/posts/sequence.md'), 'utf8'), 'sequence').body, original);
    assert.equal(await migrate(root), 0);
    assert.equal(await readFile(path.join(root, 'content/articles/sequence.md'), 'utf8'), original);
  } finally { await cleanup(root); }
});
test('New articles populate both indexes and hidden posts are excluded', async () => {
  const root = await fixture();
  try {
    await savePost(root, 'published', metadata('published'), '正文');
    await savePost(root, 'draft-post', { ...metadata('draft-post'), draft: true }, '草稿正文');
    await writeFile(path.join(root, 'content/articles/stale.md'), '旧文件');
    const out = path.join(root, 'dist');
    const result = await buildSite(root, out);
    assert.equal(result.published, 1);
    for (const file of ['content/articles.json', 'content/generated/articles-index.json']) assert.deepEqual(JSON.parse(await readFile(path.join(out, file), 'utf8')).articles, ['published']);
    assert.equal(await readFile(path.join(out, 'content/articles/published.md'), 'utf8'), '正文');
    await assert.rejects(access(path.join(out, 'content/articles/draft-post.md')));
    await assert.rejects(access(path.join(out, 'content/articles/stale.md')));
    await assert.rejects(access(path.join(out, 'content/posts')));
    await assert.rejects(access(path.join(out, 'auth')));
    const config = YAML.parse(await readFile(path.join(out, 'admin/config.yml'), 'utf8'));
    assert.deepEqual(config.collections[0].fields.find(x => x.name === 'module').options, [{ label: '数学分析', value: 'math-analysis' }]);
    const site = JSON.parse(await readFile(path.join(out, 'content/site.json'), 'utf8'));
    assert.ok(!site.nav.some(x => x.href === 'admin/'));
    await access(path.join(out,'login/index.html'));
    await access(path.join(out,'workspace/review/index.html'));
    await access(path.join(out,'article/published/index.html'));
  } finally { await cleanup(root); }
});
test('Unknown modules and changed slugs fail before publication', async () => {
  const root = await fixture();
  try {
    await savePost(root, 'test-post', { ...metadata('test-post'), module: 'missing' }, '正文');
    await assert.rejects(readPosts(root), /不存在的模块/);
    await savePost(root, 'test-post', { ...metadata('different-slug') }, '正文');
    await assert.rejects(readPosts(root), /slug 必须/);
  } finally { await cleanup(root); }
});

test('Published article resources keep their references and uploaded files', async () => {
  const root = await fixture();
  try {
    const images = [{ src: '/assets/images/uploads/diagram.png', caption: '示意图' }];
    const attachments = [{ title: '讲义', file: '/assets/files/uploads/notes.pdf' }, { file: '/assets/files/uploads/slides.pptx' }];
    await mkdir(path.join(root, 'assets/images/uploads'), { recursive: true });
    await mkdir(path.join(root, 'assets/files/uploads'), { recursive: true });
    const binary = Buffer.from([0, 128, 255, 10]);
    await writeFile(path.join(root, 'assets/images/uploads/diagram.png'), binary);
    for (const filename of ['notes.pdf', 'slides.pptx']) await writeFile(path.join(root, 'assets/files/uploads', filename), binary);
    await savePost(root, 'with-resources', { ...metadata('with-resources'), images, attachments }, '带附件的正文');
    const out = path.join(root, 'dist');
    await buildSite(root, out);
    const meta = JSON.parse(await readFile(path.join(out, 'content/articles/with-resources.json'), 'utf8'));
    assert.deepEqual(meta.images, images);
    assert.deepEqual(meta.attachments, attachments);
    for (const resource of [...images.map(x => x.src), ...attachments.map(x => x.file)]) {
      assert.deepEqual(await readFile(path.join(out, resource.slice(1))), binary);
    }
  } finally { await cleanup(root); }
});

test('Incomplete image and attachment records fail before publication', async () => {
  const root = await fixture();
  try {
    await savePost(root, 'incomplete', { ...metadata('incomplete'), attachments: [{ title: '没有文件' }] }, '正文');
    await assert.rejects(readPosts(root), /附件.*缺少文件地址/);
    await savePost(root, 'incomplete', { ...metadata('incomplete'), images: [{ src: 123 }] }, '正文');
    await assert.rejects(readPosts(root), /文章图片.*缺少文件地址/);
  } finally { await cleanup(root); }
});

test('Deployment evidence includes only actual published versions and preserves exact timestamps',async()=>{
 const root=await fixture(),id='11111111-2222-3333-4444-555555555555',time='2026-10-10T05:06:07.123Z';
 try{
  await savePost(root,'live-time',{...metadata('live-time'),uploaded_at:time,published_at:time,publication_id:id},'已发布正文');
  await savePost(root,'draft-time',{...metadata('draft-time'),draft:true,publication_id:'99999999-2222-3333-4444-555555555555'},'未审核正文');
  const out=path.join(root,'dist');await buildSite(root,out);
  assert.deepEqual(JSON.parse(await readFile(path.join(out,'build-info.json'),'utf8')).publications,[{id,slug:'live-time'}]);
  assert.equal(JSON.parse(await readFile(path.join(out,'content/articles/live-time.json'),'utf8')).uploaded_at,time);
  await access(path.join(out,'workspace/approved/index.html'));
  await savePost(root,'live-time',{...metadata('live-time'),uploaded_at:'bad-date'},'正文');
  await assert.rejects(readPosts(root),/时间戳无效/);
 }finally{await cleanup(root);}
});
