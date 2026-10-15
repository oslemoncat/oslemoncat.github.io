import test from 'node:test';
import assert from 'node:assert/strict';
import {schema,replySchema,route,request,fixture,post} from './comment-fixture.mjs';
const data=async response=>({status:response.status,...await response.json()});
const reply=(parentId,body='一条回复',requestId=crypto.randomUUID())=>({body,requestId,parentId});
test('Additive reply migration is repeatable and preserves existing comments and links',t=>{
 const f=fixture(t),root=f.seed(),child=f.seed({parent:root});f.sqlite.exec(replySchema.replace(/\r?\n/g,' '));f.sqlite.exec(schema);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,2);assert.equal(f.sqlite.prepare('SELECT root_id FROM comment_links WHERE comment_id=?').get(child).root_id,root);
});
test('Missing reply migration keeps ordinary comments working and rejects reply writes explicitly',async t=>{
 const f=fixture(t,{legacy:true}),root=f.seed();assert.equal((await data(await f.run(request()))).repliesSupported,false);
 const r=await data(await f.run(request(route,'POST',reply(root))));assert.equal(r.status,503);assert.equal(r.code,'COMMENTS_REPLIES_NOT_CONFIGURED');assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,1);
 assert.equal((await f.run(request(route,'POST',post()))).status,201);
});
test('Reply identity and root are derived on the server rather than supplied by a client',async t=>{
 const f=fixture(t),root=f.seed({author:22,login:'reader'});const r=await data(await f.run(request(route,'POST',{...reply(root),rootId:crypto.randomUUID(),author:'oslemoncat',role:'admin'})));
 assert.equal(r.status,201);assert.equal(r.item.author,'member');assert.equal(r.item.rootId,root);assert.equal(r.item.replyTo.author,'reader');assert.equal(r.item.canEdit,true);
 assert.equal(f.sqlite.prepare('SELECT author_id FROM comments WHERE id=?').get(r.item.id).author_id,'github:21');assert.ok(f.calls.filter(x=>x.p!=='/turnstile/v0/siteverify').every(x=>x.m==='GET'));
});
test('Replying to another reply retains one root and the actual addressed author',async t=>{
 const f=fixture(t),root=f.seed({author:22,login:'reader'}),child=f.seed({author:23,login:'other',parent:root});
 const r=await data(await f.run(request(route,'POST',reply(child))));assert.equal(r.status,201);assert.equal(r.item.rootId,root);assert.equal(r.item.parentId,child);assert.equal(r.item.replyTo.author,'other');
});
test('Invalid, foreign-article, deleted and self-target comments cannot receive replies',async t=>{
 const f=fixture(t),foreign=f.seed({slug:'other-note'}),removed=f.seed();await f.run(request(route+'/'+removed,'DELETE'));
 for(const parent of ['invalid',[],foreign,removed])assert.equal((await f.run(request(route,'POST',reply(parent)))).status,typeof parent==='string'&&parent!=='invalid'?404:400);
 const id=crypto.randomUUID();assert.equal((await f.run(request(route,'POST',reply(id,'body',id)))).status,400);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments WHERE article_slug=?').get('test-note').n,0);
});
test('Root and reply pagination have no duplicates even at matching timestamps',async t=>{
 const f=fixture(t),root=f.seed({created:100}),other=f.seed(),children=[];
 for(let i=0;i<45;i++)children.push(f.seed({created:200,parent:root}));
 f.seed({parent:other});const page=await data(await f.run(request()));assert.equal(page.items.length,2);assert.equal(page.total,48);const item=page.items.find(x=>x.id===root);assert.equal(item.replies.length,3);assert.equal(item.replyCount,45);
 let cursor=item.nextRepliesCursor,actual=item.replies.map(x=>x.id);while(cursor){const r=await data(await f.run(request(route+'?thread='+root+'&cursor='+encodeURIComponent(cursor))));assert.equal(r.status,200);actual.push(...r.items.map(x=>x.id));cursor=r.nextCursor;}
 assert.equal(new Set(actual).size,45);assert.deepEqual(actual,children.sort());assert.equal((await f.run(request(route+'?thread='+other+'&cursor='+encodeURIComponent(item.nextRepliesCursor)))).status,400);
});
test('Replies remain subject to author-only edit and ordinary delete rules',async t=>{
 const f=fixture(t),root=f.seed({author:22}),child=f.seed({author:22,parent:root}),row=f.sqlite.prepare('SELECT * FROM comments WHERE id=?').get(child);
 assert.equal((await f.run(request(route+'/'+child,'PATCH',{body:'change',updatedAt:row.updated_at}))).status,403);
 assert.equal((await f.run(request(route+'/'+child,'DELETE'))).status,403);
 f.identity(22,'reader');assert.equal((await f.run(request(route+'/'+child,'PATCH',{body:'own edit',updatedAt:row.updated_at,parentId:crypto.randomUUID()}))).status,400);
 const r=await data(await f.run(request(route+'/'+child,'PATCH',{body:'own edit',updatedAt:row.updated_at})));assert.equal(r.status,200);assert.equal(r.item.parentId,root);
 assert.equal((await f.run(request(route+'/'+child,'PATCH',{body:'stale',updatedAt:row.updated_at}))).status,409);
});
test('Deleting a root erases its content but preserves replies and a safe thread placeholder',async t=>{
 const f=fixture(t),root=f.seed({body:'private original'}),child=f.seed({author:22,login:'reader',parent:root});
 const r=await data(await f.run(request(route+'/'+root,'DELETE')));assert.equal(r.status,200);assert.equal(r.item.deleted,true);assert.equal(r.item.author,'');assert.equal(f.sqlite.prepare('SELECT body FROM comments WHERE id=?').get(root).body,'该评论已删除。');
 const page=await data(await f.run(request()));assert.equal(page.total,1);assert.equal(page.items.length,1);assert.equal(page.items[0].replies[0].id,child);assert.equal(page.items[0].canEdit,false);assert.equal(page.items[0].canDelete,false);
 assert.equal((await f.run(request(route,'POST',reply(root)))).status,404);assert.equal((await f.run(request(route+'/'+root,'PATCH',{body:'resurrect',updatedAt:r.item.updatedAt}))).status,404);
});
test('Deleting a reply preserves its addressed descendants without exposing erased text',async t=>{
 const f=fixture(t),root=f.seed({author:22}),child=f.seed({body:'erase me',parent:root}),grandchild=f.seed({author:23,parent:child,root});
 assert.equal((await f.run(request(route+'/'+child,'DELETE'))).status,200);const page=await data(await f.run(request(route+'?thread='+root)));
 assert.equal(page.items.length,1);assert.equal(page.items[0].id,grandchild);assert.equal(page.items[0].replyTo.author,'已删除的评论');assert.ok(!JSON.stringify(page).includes('erase me'));
});
test('Admins can delete foreign replies and roots without granting edit rights',async t=>{
 const f=fixture(t),root=f.seed({author:22}),child=f.seed({author:23,parent:root});f.identity(11,'oslemoncat',true);
 assert.equal((await f.run(request(route+'/'+root,'PATCH',{body:'change',updatedAt:100}))).status,403);
 assert.equal((await f.run(request(route+'/'+child,'DELETE'))).status,200);assert.equal((await f.run(request(route+'/'+root,'DELETE'))).status,200);assert.equal((await data(await f.run(request()))).total,0);
});
test('Retrying the same reply creates exactly one row and cannot change its target',async t=>{
 const f=fixture(t),root=f.seed(),other=f.seed(),id=crypto.randomUUID(),input=reply(root,'retry',id);
 const results=await Promise.all([f.run(request(route,'POST',input)),f.run(request(route,'POST',input))]);assert.ok(results.every(x=>[200,201].includes(x.status)));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_links WHERE comment_id=?').get(id).n,1);
 assert.equal((await f.run(request(route,'POST',reply(other,'retry',id)))).status,409);assert.equal(f.sqlite.prepare('SELECT parent_id FROM comment_links WHERE comment_id=?').get(id).parent_id,root);
});
test('Concurrent root and reply request IDs cannot silently reparent an existing comment',async t=>{
 const f=fixture(t),root=f.seed(),id=crypto.randomUUID();const result=await Promise.all([f.run(request(route,'POST',post('root body',id))),f.run(request(route,'POST',reply(root,'reply body',id)))]);
 assert.ok(result.some(x=>x.status===201));const row=f.sqlite.prepare('SELECT * FROM comments WHERE id=?').get(id),link=f.sqlite.prepare('SELECT * FROM comment_links WHERE comment_id=?').get(id);
 if(row.body==='root body')assert.equal(link,undefined);else assert.equal(link.parent_id,root);
});
test('Parent removed between validation and transactional insert does not create an orphan',async t=>{
 const f=fixture(t),root=f.seed(),id=crypto.randomUUID();f.options.beforeBatch=db=>db.prepare('DELETE FROM comments WHERE id=?').run(root);
 assert.equal((await f.run(request(route,'POST',reply(root,'race',id)))).status,404);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments WHERE id=?').get(id).n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_links').get().n,0);
});
test('Reply relation failure rolls back comment and cooldown together',async t=>{
 const f=fixture(t),root=f.seed(),id=crypto.randomUUID();f.sqlite.exec("CREATE TRIGGER fail_reply BEFORE INSERT ON comment_links BEGIN SELECT RAISE(ABORT,'fixture'); END;");
 const r=await data(await f.run(request(route,'POST',reply(root,'rollback',id))));assert.equal(r.status,503);assert.equal(r.code,'COMMENTS_UNAVAILABLE');assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments WHERE id=?').get(id).n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_rate_limits').get().n,0);
});
test('Replies and root comments share cooldown and deletion cannot bypass it',async t=>{
 const f=fixture(t),root=f.seed({author:22}),r=await data(await f.run(request(route,'POST',reply(root))));
 assert.equal(r.status,201);assert.equal((await f.run(request(route+'/'+r.item.id,'DELETE'))).status,200);assert.equal((await f.run(request(route,'POST',post()))).status,429);
});
test('Foreign request IDs and expired sessions cannot expose or mutate replies',async t=>{
 const f=fixture(t),root=f.seed(),id=f.seed({slug:'other-note'});
 assert.equal((await f.run(request(route,'POST',reply(root,'secret',id)))).status,409);
 assert.equal((await f.run(request(route,'POST',reply(root),{Authorization:''}))).status,401);
 assert.equal((await f.run(request(route,'POST',reply(root),{Origin:'https://foreign.test'}))).status,403);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_links').get().n,0);
});

