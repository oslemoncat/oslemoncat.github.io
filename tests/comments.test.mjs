import test from 'node:test';
import assert from 'node:assert/strict';
import {base,schema,route,request,fixture,post} from './comment-fixture.mjs';
test('Comments schema supports one-line console paste and repeat execution without data loss',t=>{
 const f=fixture(t);f.seed();f.sqlite.exec(schema.replace(/\r?\n/g,' '));assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,1);
});
test('Missing D1 reports setup status while the existing session still works',async t=>{
 const f=fixture(t);const r=await f.run(request(),{COMMENTS_DB:undefined});assert.equal(r.status,503);assert.equal((await r.json()).code,'COMMENTS_NOT_CONFIGURED');
 const session=await f.run(request('/api/session'),{COMMENTS_DB:undefined});assert.equal(session.status,200);assert.equal((await session.json()).comments,false);
});
test('Comments reject anonymous callers and other Origins before any write',async t=>{
 const f=fixture(t);
 assert.equal((await f.run(request(route,'POST',post(),{Authorization:''}))).status,401);
 assert.equal((await f.run(request(route,'POST',post(),{Origin:'https://foreign.test'}))).status,403);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,0);
});
test('Author and role come from the verified account instead of client fields',async t=>{
 const f=fixture(t);const r=await f.run(request(route,'POST',{...post('你好\n第二行'),author:'oslemoncat',author_id:'github:11',role:'admin'}));
 assert.equal(r.status,201);const data=await r.json();assert.equal(data.item.author,'member');assert.equal(data.item.canEdit,true);
 assert.equal(f.sqlite.prepare('SELECT author_id FROM comments').get().author_id,'github:21');assert.ok(f.calls.every(c=>c.m==='GET'));
});
test('Comment content is trimmed, bounded and stored as text using SQL parameters',async t=>{
 const f=fixture(t);const text="' ; DROP TABLE comments; --\n<script>alert(1)</script>";
 const r=await f.run(request(route,'POST',post('  '+text+'  ')));assert.equal(r.status,201);assert.equal((await r.json()).item.body,text);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,1);
});
test('Blank, oversized, control-character and nontext comments never create rows',async t=>{
 const f=fixture(t);
 for(const body of ['', ' \n ', 'a'.repeat(2001), 'x\u0000y', null]){
  assert.equal((await f.run(request(route,'POST',{...post(),body}))).status,400);
 }
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,0);
});
test('Invalid identifiers and methods fail without inserting comments',async t=>{
 const f=fixture(t);assert.equal((await f.run(request(route,'POST',{body:'文字',requestId:'not-a-uuid'}))).status,400);
 assert.equal((await f.run(request(route+'/123','DELETE'))).status,400);
 assert.equal((await f.run(request(route,'PUT',post()))).status,405);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,0);
});
test('Draft and deleted articles cannot read or accept comments',async t=>{
 for(const options of [{draft:true},{missing:true}]){
  const f=fixture(t,options);assert.equal((await f.run(request())).status,404);assert.equal((await f.run(request(route,'POST',post()))).status,404);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,0);
 }
});
test('Every comment query is bound to its article and numeric account ID',async t=>{
 const f=fixture(t);f.seed({author:22,login:'member'});f.seed({slug:'another-note'});
 const r=await f.run(request());const data=await r.json();assert.equal(data.total,1);assert.equal(data.items.length,1);
 assert.equal(data.items[0].canEdit,false);assert.equal(data.items[0].canDelete,false);
});
test('Cursor pagination handles matching timestamps without duplicates or omissions',async t=>{
 const f=fixture(t);const expected=[];
 for(let i=0;i<45;i++)expected.push(f.seed({created:1000}));
 f.seed({slug:'another-note',created:2000});
 let cursor='',actual=[];
 do{const r=await f.run(request(route+(cursor?'?cursor='+encodeURIComponent(cursor):'')));assert.equal(r.status,200);const data=await r.json();assert.equal(data.total,45);actual.push(...data.items.map(x=>x.id));cursor=data.nextCursor;}while(cursor);
 assert.equal(new Set(actual).size,45);assert.deepEqual([...actual].sort(),expected.sort());
 assert.equal((await f.run(request(route+'?cursor=bad'))).status,400);
 assert.equal((await f.run(request(route+'?cursor='+encodeURIComponent(Buffer.from(JSON.stringify([0,'bad'])).toString('base64url'))))).status,400);
});
test('Members edit only their own comments and stale edits do not overwrite',async t=>{
 const f=fixture(t);const id=f.seed(),row=f.sqlite.prepare('SELECT * FROM comments WHERE id=?').get(id);
 const r=await f.run(request(route+'/'+id,'PATCH',{body:'更新评论',updatedAt:row.updated_at}));assert.equal(r.status,200);const updated=(await r.json()).item;
 assert.equal(updated.body,'更新评论');assert.ok(updated.updatedAt>updated.createdAt);
 assert.equal((await f.run(request(route+'/'+id,'PATCH',{body:'陈旧修改',updatedAt:row.updated_at}))).status,409);
 assert.equal(f.sqlite.prepare('SELECT body FROM comments WHERE id=?').get(id).body,'更新评论');
 f.identity(22,'member');assert.equal((await f.run(request(route+'/'+id,'PATCH',{body:'伪造同名',updatedAt:updated.updatedAt}))).status,403);
});
test('Admins may remove foreign comments but do not edit another person’s voice',async t=>{
 const f=fixture(t);const id=f.seed({author:22,login:'other'});f.identity(11,'oslemoncat',true);
 const list=await (await f.run(request())).json();assert.equal(list.items[0].canDelete,true);assert.equal(list.items[0].canEdit,false);
 assert.equal((await f.run(request(route+'/'+id,'PATCH',{body:'改写',updatedAt:list.items[0].updatedAt}))).status,403);
 assert.equal((await f.run(request(route+'/'+id,'DELETE'))).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,0);
});
test('Only matching numeric identities may delete a member comment',async t=>{
 const f=fixture(t);const id=f.seed();f.identity(22,'member');
 assert.equal((await f.run(request(route+'/'+id,'DELETE',{role:'admin',author_id:'github:21'}))).status,403);
 f.identity();assert.equal((await f.run(request(route+'/'+id,'DELETE'))).status,200);
 assert.equal((await f.run(request(route+'/'+id,'DELETE'))).status,404);
});
test('Allow-list alone cannot grant administrator delete rights',async t=>{
 const f=fixture(t);const id=f.seed({author:22});f.identity(11,'oslemoncat',false);
 assert.equal((await f.run(request(route+'/'+id,'DELETE'))).status,403);
});
test('A comment from another article cannot be edited or deleted via this URL',async t=>{
 const f=fixture(t);const id=f.seed({slug:'another-note'});
 assert.equal((await f.run(request(route+'/'+id,'DELETE'))).status,404);
 assert.equal((await f.run(request(route+'/'+id,'PATCH',{body:'修改',updatedAt:0}))).status,404);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,1);
});
test('Network retries and simultaneous retries create just one comment',async t=>{
 const f=fixture(t);const input=post();const responses=await Promise.all([f.run(request(route,'POST',input)),f.run(request(route,'POST',input))]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,1);
 const again=await f.run(request(route,'POST',input));assert.equal(again.status,200);assert.equal((await again.json()).created,false);
 assert.equal((await f.run(request(route,'POST',{...input,body:'不同内容'}))).status,409);
});
test('Concurrent posts and deletion cannot bypass the atomic cooldown',async t=>{
 const f=fixture(t);const inputs=[post('第一条'),post('第二条')];
 const result=await Promise.all(inputs.map(input=>f.run(request(route,'POST',input))));assert.deepEqual(result.map(r=>r.status).sort(),[201,429]);
 const saved=f.sqlite.prepare('SELECT id FROM comments').get().id;
 await f.run(request(route+'/'+saved,'DELETE'));
 const rejected=await f.run(request(route,'POST',post('删后再发',saved)));assert.equal(rejected.status,429);assert.equal((await rejected.json()).code,'COMMENTS_RATE_LIMITED');
 f.sqlite.prepare('UPDATE comment_rate_limits SET last_post_at=?').run(Date.now()-21000);
 assert.equal((await f.run(request(route,'POST',post('稍后再发')))).status,201);
});
test('Request IDs from another author cannot expose or replace their comment',async t=>{
 const f=fixture(t);const id=f.seed({author:22});
 assert.equal((await f.run(request(route,'POST',post('已有评论',id)))).status,409);assert.equal(f.sqlite.prepare('SELECT author_id FROM comments WHERE id=?').get(id).author_id,'github:22');
});
test('Database errors are actionable and never leak SQL details',async t=>{
 const f=fixture(t);const broken={prepare(){throw Error('SQL failure: private detail');},batch(){throw Error('private detail');}};
 const r=await f.run(request(),{COMMENTS_DB:broken});assert.equal(r.status,503);const text=await r.text();assert.match(text,/COMMENTS_UNAVAILABLE/);assert.ok(!text.includes('private detail'));
});

test('Administrators see the missing binding while members receive the public availability message',async t=>{
 const f=fixture(t);
 const member=await (await f.run(request(),{COMMENTS_DB:undefined})).json();
 assert.equal(member.message,'评论尚未开放，请稍后再来。');
 f.identity(11,'oslemoncat',true);
 const admin=await (await f.run(request(),{COMMENTS_DB:undefined})).json();
 assert.equal(admin.code,'COMMENTS_NOT_CONFIGURED');assert.match(admin.message,/COMMENTS_DB.*lemoncat-comments/);
});
test('Missing base tables identify the existing initialization steps without writing to the database',async t=>{
 for(const table of ['comments','comment_rate_limits']){
  const f=fixture(t);f.sqlite.exec('DROP TABLE '+table);f.identity(11,'oslemoncat',true);
  const response=await f.run(request()),data=await response.json();
  assert.equal(response.status,503);assert.equal(data.code,'COMMENTS_SCHEMA_NOT_READY');assert.match(data.message,/0001_comments.sql.*0002_comment_replies.sql/);
  assert.ok(f.sqlCalls.every(sql=>sql.startsWith('SELECT ')));
  f.identity();const member=await (await f.run(request())).json();assert.equal(member.message,'评论尚未开放，请稍后再来。');
 }
});
test('Partial reply migration blocks mutations and preserves every existing comment and relation',async t=>{
 const f=fixture(t),root=f.seed(),child=f.seed({parent:root});f.sqlite.exec('DROP TABLE comment_deletions');f.identity(11,'oslemoncat',true);
 for(const req of [request(),request(route,'POST',post()),request(route+'/'+root,'DELETE'),request(route+'/'+root,'PATCH',{body:'change',updatedAt:0})]){
  const response=await f.run(req),data=await response.json();assert.equal(response.status,503);assert.equal(data.code,'COMMENTS_SCHEMA_NOT_READY');assert.match(data.message,/0002_comment_replies.sql/);
 }
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,2);
 assert.equal(f.sqlite.prepare('SELECT parent_id FROM comment_links WHERE comment_id=?').get(child).parent_id,root);
});
test('The shared handler preserves legacy pagination, retry, editing and numeric-ID delete permissions',async t=>{
 const f=fixture(t,{legacy:true}),input=post('legacy');
 const created=await (await f.run(request(route,'POST',input))).json();assert.equal(created.created,true);
 assert.equal((await (await f.run(request(route,'POST',input))).json()).created,false);
 f.identity(22,'member');assert.equal((await f.run(request(route+'/'+input.requestId,'DELETE'))).status,403);
 f.identity();assert.equal((await f.run(request(route+'/'+input.requestId,'PATCH',{body:'updated',updatedAt:created.item.updatedAt}))).status,200);
 assert.equal((await f.run(request(route+'/'+input.requestId,'PATCH',{body:'stale',updatedAt:created.item.updatedAt}))).status,409);
 for(let i=0;i<22;i++)f.seed({created:100});
 const first=await (await f.run(request())).json(),second=await (await f.run(request(route+'?cursor='+encodeURIComponent(first.nextCursor)))).json();
 assert.equal(first.repliesSupported,false);assert.equal(first.total,23);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,23);
 assert.equal((await f.run(request(route+'/'+input.requestId,'DELETE'))).status,200);
 assert.equal((await f.run(request(route,'POST',post('cooldown')))).status,429);
});
