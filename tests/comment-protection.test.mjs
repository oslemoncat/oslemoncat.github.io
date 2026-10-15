
import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,request,route,post,protectionSchema} from './comment-fixture.mjs';
const payload=async response=>({status:response.status,...await response.json()});
const moderation='/api/comment-mutes',ban=(slug,id)=>request(moderation,'POST',{slug,commentId:id,authorId:'github:999',role:'admin'});
const count=f=>f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,verifyCalls=f=>f.calls.filter(x=>x.p==='/turnstile/v0/siteverify');
test('Protection migration is repeatable and preserves comments and cooldowns',async t=>{
 const f=fixture(t),id=f.seed();await f.run(request(route,'POST',post()));f.sqlite.exec(protectionSchema);f.sqlite.exec(protectionSchema);
 assert.equal(count(f),2);assert.ok(f.sqlite.prepare('SELECT id FROM comments WHERE id=?').get(id));assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_rate_limits').get().n,1);
});
test('Missing migration preserves reading but closes posting and moderation',async t=>{
 const f=fixture(t,{protection:false});f.seed();const page=await payload(await f.run(request()));assert.equal(page.status,200);assert.equal(page.total,1);assert.equal(page.security.ready,false);
 assert.equal((await payload(await f.run(request(route,'POST',post())))).code,'COMMENTS_PROTECTION_NOT_READY');f.identity(11,'oslemoncat',true);assert.equal((await f.run(request(moderation))).status,503);assert.equal(count(f),1);assert.equal(verifyCalls(f).length,0);
});
test('Missing keys and public dummy keys cannot silently disable protection',async t=>{
 const f=fixture(t);
 for(const extra of [{TURNSTILE_SITE_KEY:undefined},{TURNSTILE_SECRET_KEY:undefined},...['1x00000000000000000000AA','2x00000000000000000000AB','1x00000000000000000000BB','2x00000000000000000000BB','3x00000000000000000000FF'].map(TURNSTILE_SITE_KEY=>({TURNSTILE_SITE_KEY})),{TURNSTILE_SECRET_KEY:'1x0000000000000000000000000000000AA'}]){
  const result=await payload(await f.run(request(route,'POST',post()),extra));assert.equal(result.status,503);assert.equal(result.code,'COMMENTS_PROTECTION_NOT_READY');
 }assert.equal(count(f),0);assert.equal(verifyCalls(f).length,0);
});
test('Missing token and foreign hostname, action or account cannot create comments',async t=>{
 for(const turnstileResult of [{success:false},{success:true,hostname:'foreign.test',action:'comment',cdata:'github_21'},{success:true,hostname:'oslemoncat.github.io',action:'login',cdata:'github_21'},{success:true,hostname:'oslemoncat.github.io',action:'comment',cdata:'github_22'}]){
  const f=fixture(t,{turnstileResult}),result=await payload(await f.run(request(route,'POST',post())));assert.equal(result.code,'COMMENTS_HUMAN_INVALID');assert.equal(count(f),0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_rate_limits').get().n,0);
 }const f=fixture(t);for(const token of [undefined,'',[], 'x'.repeat(2049)])assert.equal((await payload(await f.run(request(route,'POST',{...post(),turnstileToken:token})))).code,'COMMENTS_HUMAN_REQUIRED');assert.equal(verifyCalls(f).length,0);
});
test('Verification outage fails closed and preserves original comment text',async t=>{
 const f=fixture(t,{turnstileError:true}),id=f.seed(),before=f.sqlite.prepare('SELECT * FROM comments WHERE id=?').get(id);
 const result=await payload(await f.run(request(route+'/'+id,'PATCH',{body:'replacement',updatedAt:before.updated_at})));assert.equal(result.code,'COMMENTS_HUMAN_UNAVAILABLE');assert.equal(result.status,503);assert.equal(result.message.includes('secret'),false);assert.equal(f.sqlite.prepare('SELECT body FROM comments WHERE id=?').get(id).body,before.body);
});
test('Retry returns the existing comment without redeeming a token again',async t=>{
 let redeemed=false;const f=fixture(t,{turnstileResult:()=>{const data={success:!redeemed,hostname:'oslemoncat.github.io',action:'comment',cdata:'github_21'};redeemed=true;return data;}}),input=post();
 assert.equal((await f.run(request(route,'POST',input))).status,201);assert.equal((await payload(await f.run(request(route,'POST',input)))).created,false);assert.equal(verifyCalls(f).length,1);assert.equal(count(f),1);f.sqlite.exec('DELETE FROM comment_rate_limits');assert.equal((await payload(await f.run(request(route,'POST',post())))).code,'COMMENTS_HUMAN_INVALID');assert.equal(count(f),1);
});
test('All articles and replies share twenty seconds without consuming blocked challenges',async t=>{
 const f=fixture(t),root=f.seed({author:22});assert.equal((await f.run(request(route,'POST',post()))).status,201);
 for(const req of [request(route,'POST',{...post(),parentId:root}),request('/api/articles/other-note/comments','POST',post())]){const response=await f.run(req),data=await response.json();assert.equal(response.status,429);assert.ok(data.retryAfter>0&&data.retryAfter<=20);assert.equal(Number(response.headers.get('Retry-After')),data.retryAfter);}
 assert.equal(verifyCalls(f).length,1);f.sqlite.exec('UPDATE comment_rate_limits SET last_post_at=last_post_at-20001');assert.equal((await f.run(request(route,'POST',{...post(),parentId:root}))).status,201);
});
test('Only verified administrators may mute, list and unmute',async t=>{
 const f=fixture(t),id=f.seed({author:22});for(const req of [request(moderation),ban('test-note',id),request(moderation+'/22','DELETE')])assert.equal((await f.run(req)).status,403);
 f.identity(11,'oslemoncat',false);assert.equal((await f.run(ban('test-note',id))).status,403);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_mutes').get().n,0);
});
test('Mute uses actual author ID, survives rename, preserves deletion and can be lifted',async t=>{
 const f=fixture(t),id=f.seed();f.identity(11,'oslemoncat',true);assert.equal((await payload(await f.run(ban('test-note',id)))).id,'github:21');const page=await payload(await f.run(request(moderation)));assert.equal(page.items[0].id,'github:21');
 f.identity(21,'renamed');assert.equal((await payload(await f.run(request()))).security.muted,true);
 for(const req of [request(route,'POST',post()),request(route,'POST',{...post(),parentId:id}),request(route+'/'+id,'PATCH',{body:'edited',updatedAt:Date.now()})])assert.equal((await payload(await f.run(req))).code,'COMMENTS_MUTED');
 assert.equal(verifyCalls(f).length,0);assert.equal((await f.run(request(route+'/'+id,'DELETE'))).status,200);f.identity(11,'oslemoncat',true);assert.equal((await f.run(request(moderation+'/21','DELETE'))).status,200);f.identity(21,'renamed');assert.equal((await f.run(request(route,'POST',post()))).status,201);
});
test('Mute rejects self, foreign-article and arbitrary path targets',async t=>{
 const f=fixture(t),self=f.seed({author:11,login:'oslemoncat'}),foreign=f.seed({slug:'other-note'});f.identity(11,'oslemoncat',true);
 assert.equal((await f.run(ban('test-note',self))).status,400);assert.equal((await f.run(ban('test-note',foreign))).status,404);assert.equal((await f.run(ban('../bad',foreign))).status,400);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_mutes').get().n,0);
});
test('A mute applied during comment insertion prevents publication',async t=>{
 const f=fixture(t,{beforeBatch:db=>db.prepare('INSERT INTO comment_mutes VALUES (?,?,?,?)').run('github:21','member','github:11',Date.now())}),result=await payload(await f.run(request(route,'POST',post())));assert.equal(result.code,'COMMENTS_MUTED');assert.equal(count(f),0);
});
test('Moderation survives verification outage and has bounded pagination',async t=>{
 const f=fixture(t);for(let i=100;i<155;i++)f.sqlite.prepare('INSERT INTO comment_mutes VALUES (?,?,?,?)').run('github:'+i,'person-'+i,'github:11',1);f.identity(11,'oslemoncat',true);
 const first=await payload(await f.run(request(moderation),{TURNSTILE_SECRET_KEY:undefined}));assert.equal(first.items.length,50);assert.ok(first.next);const second=await payload(await f.run(request(moderation+'?after='+first.next)));assert.equal(second.items.length,5);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,55);assert.equal((await f.run(request(moderation+'/100','DELETE'),{TURNSTILE_SECRET_KEY:undefined})).status,200);
});

test('A mute applied during verification also prevents editing an existing comment',async t=>{
 let f;f=fixture(t,{turnstileResult:()=>{f.sqlite.prepare('INSERT INTO comment_mutes VALUES (?,?,?,?)').run('github:21','member','github:11',Date.now());return {success:true,hostname:'oslemoncat.github.io',action:'comment',cdata:'github_21'};}});
 const id=f.seed(),row=f.sqlite.prepare('SELECT * FROM comments WHERE id=?').get(id),result=await payload(await f.run(request(route+'/'+id,'PATCH',{body:'race edit',updatedAt:row.updated_at})));
 assert.equal(result.code,'COMMENTS_MUTED');assert.equal(f.sqlite.prepare('SELECT body FROM comments WHERE id=?').get(id).body,row.body);
});
