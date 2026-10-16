import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,post,env,repo,hash} from './publication-fixture.mjs';
test('Same-repository staging saves source and signed author without changing main',async()=>{const f=fixture(),before=f.main(),result=await f.stage();assert.equal(f.main(),before);assert.equal(result.staging,'repository');assert.match(f.prs.get(7).head.ref,/^lemoncat\/review-21-/);assert.ok(f.prs.get(7).body.includes('lemoncat-submission:'));assert.ok(!f.calls.some(x=>x.p.includes('/forks')));const detail=await f.api('/api/submissions/7');assert.equal(detail.status,200);assert.equal(detail.data.author,'member');assert.equal(detail.data.authorId,'github:21');});
test('Other account cannot read, edit or withdraw a staged article',async()=>{const f=fixture();await f.stage();f.setUser({id:22,login:'other'});for(const method of ['GET','PATCH','DELETE'])assert.equal((await f.api('/api/submissions/7',method,method==='GET'?undefined:{post})).status,403);});
test('Forged or moved signed author record fails closed',async()=>{const f=fixture();await f.stage();f.prs.get(7).body=f.prs.get(7).body.replace('lemoncat-submission:','lemoncat-submission:evil');assert.equal((await f.api('/api/submissions/7')).status,403);});
test('Ordinary member cannot publish, approve or access another publication',async()=>{const f=fixture();const staged=await f.stage();assert.equal((await f.api('/api/submissions/7/review','POST',{action:'publish',sha:staged.sha})).status,403);assert.equal((await f.api('/api/articles','POST',{post})).status,403);});
test('Approval cannot bypass pending, required, failed or wrong-version checks',async()=>{for(const options of [{running:true},{approval:true},{failed:true},{failedJob:true},{wrongHead:true},{wrongWorkflow:true}]){const f=fixture(options),staged=await f.stage(),before=f.main();f.setUser({id:11,login:'oslemoncat'});const result=await f.api('/api/submissions/7/review','POST',{action:'publish',sha:staged.sha});assert.equal(result.status,409,JSON.stringify(result.data));assert.equal(f.main(),before);}});
test('Read version must match the submission SHA',async()=>{const f=fixture();await f.stage();f.setUser({id:11,login:'oslemoncat'});assert.equal((await f.api('/api/submissions/7/review','POST',{action:'publish',sha:hash('old')})).status,409);});
test('Approval writes article, ownership and publication in exactly one main update',async()=>{const f=fixture(),staged=await f.stage();f.setUser({id:11,login:'oslemoncat'});const result=await f.api('/api/submissions/7/review','POST',{action:'publish',sha:staged.sha});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.state,'approved');assert.equal(f.calls.filter(x=>x.m==='PATCH'&&x.p.endsWith('/heads/main')).length,1);assert.equal(f.publications()[0].reviewedSha,staged.sha);assert.match(f.source(),/author_id: "github:21"/);assert.ok(!f.calls.some(x=>x.p.endsWith('/merge')));});
test('Retry of an approved SHA makes no second main write',async()=>{const f=fixture(),staged=await f.stage();f.setUser({id:11,login:'oslemoncat'});const input={action:'publish',sha:staged.sha};await f.api('/api/submissions/7/review','POST',input);const result=await f.api('/api/submissions/7/review','POST',input);assert.equal(result.status,200);assert.equal(f.calls.filter(x=>x.m==='PATCH'&&x.p.endsWith('/heads/main')).length,1);});
test('Repository concurrency failure never forces the branch update or closes the PR',async()=>{const f=fixture({conflict:true}),staged=await f.stage();f.setUser({id:11,login:'oslemoncat'});const before=f.main(),result=await f.api('/api/submissions/7/review','POST',{action:'publish',sha:staged.sha});assert.equal(result.status,409);assert.equal(f.main(),before);assert.equal(f.prs.get(7).state,'open');assert.ok(f.calls.filter(x=>x.p.endsWith('/heads/main')).every(x=>x.body?.force!==true));});
test('Source/workflow changes in a PR remain forbidden',async()=>{const f=fixture(),staged=await f.stage();f.prs.get(7).changed_files=999;f.setUser({id:11,login:'oslemoncat'});assert.equal((await f.api('/api/submissions/7/review','POST',{action:'publish',sha:staged.sha})).status,400);});
test('Client dates and timestamps cannot backdate publication',async()=>{const f=fixture();f.setUser({id:11,login:'oslemoncat'});const before=Date.now(),result=await f.api('/api/articles','POST',{post:{...post,uploaded_at:'2000-01-01T00:00:00Z',published_at:'2000-01-01T00:00:00Z'},files:[]});assert.equal(result.status,201,JSON.stringify(result.data));assert.ok(Date.parse(result.data.publication.publishedAt)>=before);assert.ok(!f.source().includes('date: "2026-10-01"'));});
test('Editing preserves original date, upload and first-publication time',async()=>{const previous='---\nslug: "sample-note"\ntitle: "旧文"\ndate: "2026-09-20"\nupdated: "2026-09-20"\nuploaded_at: "2026-09-20T05:01:00Z"\npublished_at: "2026-09-20T05:10:00Z"\nauthor_id: "github:21"\n---\n旧正文\n',f=fixture({previous,owner:{id:'github:21',login:'member'}});f.setUser({id:11,login:'oslemoncat'});const r=await f.api('/api/articles','POST',{post,files:[]});assert.equal(r.status,201,JSON.stringify(r.data));assert.match(f.source(),/date: "2026-09-20"/);assert.match(f.source(),/published_at: "2026-09-20T05:10:00Z"/);assert.match(f.source(),/uploaded_at: "2026-09-20T05:01:00Z"/);assert.match(f.source(),/author_id: "github:21"/);});
test('Live status waits for the exact publication ID in the actual deployed site',async()=>{const f=fixture();f.setUser({id:11,login:'oslemoncat'});const result=await f.api('/api/articles','POST',{post,files:[]}),id=result.data.publication.id;assert.equal((await f.api('/api/publications/'+id)).data.status,'deploying');f.options.live=true;assert.equal((await f.api('/api/publications/'+id)).data.status,'success');});
test('Publication list and status remain author scoped',async()=>{const f=fixture();f.setUser({id:11,login:'oslemoncat'});const r=await f.api('/api/articles','POST',{post,files:[]});f.setUser({id:22,login:'other'});assert.deepEqual((await f.api('/api/publications')).data.items,[]);assert.equal((await f.api('/api/publications/'+r.data.publication.id)).status,403);});
test('PR close failure retains an idempotent saved publication',async()=>{const f=fixture({closeFailure:true}),staged=await f.stage();f.setUser({id:11,login:'oslemoncat'});const r=await f.api('/api/submissions/7/review','POST',{action:'publish',sha:staged.sha});assert.equal(r.status,200);assert.equal(f.publications().length,1);assert.match(r.data.message,/无需再次发布/);});

test('Concurrent new media cannot overwrite an existing asset during approval',async()=>{const f=fixture();const path='assets/files/uploads/new-file.pdf';const staged=await f.api('/api/submissions','POST',{post,files:[{path,content:Buffer.from('new PDF').toString('base64')}]});assert.equal(staged.status,201);f.addMain(path,'other publication PDF');f.setUser({id:11,login:'oslemoncat'});const before=f.main(),result=await f.api('/api/submissions/7/review','POST',{action:'publish',sha:staged.data.sha});assert.equal(result.status,409);assert.equal(f.main(),before);assert.match(result.data.message,/覆盖/);});

test('Member updates and withdraws own staged PR through the scoped service grant',async()=>{
 const f=fixture({enforceService:true}),staged=await f.stage();assert.equal((await f.api('/api/submissions/7','PATCH',{post:{...post,title:'修改稿件'},sha:staged.sha})).status,200);
 assert.equal((await f.api('/api/submissions/7','DELETE')).status,200);assert.equal(f.prs.get(7).state,'closed');
});
test('Publication cannot be withdrawn as a pending draft after PR-close failure',async()=>{
 const f=fixture({closeFailure:true}),staged=await f.stage();f.setUser({id:11,login:'oslemoncat'});
 assert.equal((await f.api('/api/submissions/7/review','POST',{action:'publish',sha:staged.sha})).status,200);
 f.setUser({id:21,login:'member'});assert.equal((await f.api('/api/submissions/7','DELETE')).status,409);
});

test('Authenticated members add shared tags through the scoped content service and retries do not duplicate them',async()=>{
 const f=fixture({enforceService:true}),input={module:'misc',tag:'  新知识　标签  ',path:'auth/worker.mjs',role:'admin'};
 const r=await f.api('/api/tags','POST',input);assert.equal(r.status,201,JSON.stringify(r.data));assert.deepEqual(r.data.tags,['新知识 标签']);
 assert.deepEqual(JSON.parse(f.file('content/tags.json')).modules.misc,['新知识 标签']);
 const write=f.calls.find(call=>call.m==='PUT');assert.equal(write.p,'/repos/'+repo+'/contents/content/tags.json');assert.equal(write.body.branch,'main');
 assert.match(write.body.content,/^[A-Za-z0-9+/]*={0,2}$/);assert.equal(write.body.content.length%4,0);
 assert.equal((await f.api('/api/tags','POST',input)).status,200);assert.equal(f.calls.filter(call=>call.m==='PUT').length,1);
 assert.ok(!f.calls.some(call=>call.m==='PATCH'));
});
test('Tag creation requires a valid session and exact site Origin before repository access',async()=>{
 for(const headers of [{Authorization:''},{Origin:'https://foreign.test'}]){
  const f=fixture(),r=await f.api('/api/tags','POST',{module:'misc',tag:'标签'},headers);assert.equal(r.status,headers.Authorization===''?401:403);assert.equal(f.calls.length,0);
 }
});
test('Invalid modules and tag values cannot write arbitrary repository files',async()=>{
 for(const input of [{module:'../auth',tag:'safe'},{module:'misc',tag:''},{module:'misc',tag:'x'.repeat(41)},{module:'misc',tag:'x\nY'},{module:'misc',tag:['value']}]){
  const f=fixture(),r=await f.api('/api/tags','POST',input);assert.equal(r.status,400,JSON.stringify(r.data));assert.ok(!f.calls.some(call=>call.m!=='GET'));
 }
});
test('Concurrent tag creation merges the latest history without forcing repository changes',async()=>{
 const f=fixture({tagConflictOnce:true}),r=await f.api('/api/tags','POST',{module:'misc',tag:'新标签'});assert.equal(r.status,201,JSON.stringify(r.data));
 assert.deepEqual(JSON.parse(f.file('content/tags.json')).modules.misc,['并发添加','新标签']);assert.equal(f.calls.filter(call=>call.m==='PUT').length,2);
});
test('Malformed tag history fails without overwriting it',async()=>{
 const f=fixture(),raw=JSON.stringify({version:1,modules:{misc:'invalid'}});f.addMain('content/tags.json',raw);
 const r=await f.api('/api/tags','POST',{module:'misc',tag:'safe'});assert.equal(r.status,503);assert.equal(f.file('content/tags.json'),raw);assert.ok(!f.calls.some(call=>call.m==='PUT'));
});
test('Publication stores new tag history in the same reviewed main commit and retains previous tags after edits',async()=>{
 const f=fixture();f.addMain('content/tags.json',JSON.stringify({version:1,modules:{misc:['历史标签'],python:['Python']}}));f.setUser({id:11,login:'oslemoncat'});
 const r=await f.api('/api/articles','POST',{post:{...post,tags:['新标签',' 历史标签 ','新标签']},files:[]});assert.equal(r.status,201,JSON.stringify(r.data));
 assert.deepEqual(JSON.parse(f.file('content/tags.json')).modules.misc,['历史标签','新标签']);assert.deepEqual(JSON.parse(f.file('content/tags.json')).modules.python,['Python']);
 assert.match(f.source(),/tags: \["新标签","历史标签"\]/);
 assert.equal(f.calls.filter(call=>call.m==='PATCH'&&call.p.endsWith('/heads/main')).length,1);
 assert.equal((await f.api('/api/articles','POST',{post:{...post,tags:['另外一个']},files:[]})).status,201);
 assert.deepEqual(JSON.parse(f.file('content/tags.json')).modules.misc,['历史标签','新标签','另外一个']);
});
test('Unreviewed submissions do not add public tag history; approval adds it once',async()=>{
 const f=fixture(),r=await f.api('/api/submissions','POST',{post:{...post,tags:['待审标签']},files:[]});assert.equal(r.status,201);
 assert.equal(f.file('content/tags.json'),null);f.setUser({id:11,login:'oslemoncat'});
 assert.equal((await f.api('/api/submissions/7/review','POST',{action:'publish',sha:r.data.sha})).status,200);
 assert.deepEqual(JSON.parse(f.file('content/tags.json')).modules.misc,['待审标签']);
});
test('The module tag limit returns a clear error and leaves history untouched',async()=>{
 const f=fixture(),raw=JSON.stringify({version:1,modules:{misc:Array.from({length:200},(_,i)=>'标签'+i)}});f.addMain('content/tags.json',raw);
 assert.equal((await f.api('/api/tags','POST',{module:'misc',tag:'overflow'})).status,400);assert.equal(f.file('content/tags.json'),raw);
});
test('Unpublished articles are reported as removed rather than an endless deployment',async()=>{
 const f=fixture();f.setUser({id:11,login:'oslemoncat'});const r=await f.api('/api/articles','POST',{post,files:[]});
 f.addMain('content/posts/sample-note.md',f.source().replace('draft: false','draft: true'));
 const status=await f.api('/api/publications/'+r.data.publication.id);assert.equal(status.data.status,'removed');assert.match(status.data.message,/下架/);
});

test('Only administrators publish announcements and ordinary submissions cannot impersonate them',async()=>{
 const f=fixture(),announcement={...post,kind:'announcement',module:'announcements',tags:['网站动态']};
 for(const path of ['/api/articles','/api/submissions'])assert.equal((await f.api(path,'POST',{post:announcement,role:'admin'})).status,403);
 assert.ok(!f.calls.some(call=>call.m!=='GET'));f.setUser({id:11,login:'oslemoncat'});
 const r=await f.api('/api/articles','POST',{post:announcement});assert.equal(r.status,201,JSON.stringify(r.data));assert.match(f.source(),/kind: "announcement"/);assert.match(f.source(),/module: "announcements"/);
 assert.deepEqual(JSON.parse(f.file('content/tags.json')).modules.announcements,['网站动态']);
});
test('Announcement labels also require administrator privileges',async()=>{
 const f=fixture();assert.equal((await f.api('/api/tags','POST',{module:'announcements',tag:'置顶'})).status,403);
 assert.ok(!f.calls.some(call=>call.m==='PUT'));f.setUser({id:11,login:'oslemoncat'});assert.equal((await f.api('/api/tags','POST',{module:'announcements',tag:'置顶'})).status,201);
});
test('An ordinary submission cannot change an existing announcement even when its author ID matches',async()=>{
 const previous='---\nslug: "sample-note"\nkind: "announcement"\nmodule: "announcements"\nauthor_id: "github:21"\n---\n公告正文\n';
 const f=fixture({previous,owner:{id:'github:21',login:'member'}}),staged=await f.stage(),before=f.main();f.setUser({id:11,login:'oslemoncat'});
 assert.equal((await f.api('/api/submissions/7/review','POST',{action:'publish',sha:staged.sha})).status,403);assert.equal(f.main(),before);assert.equal(f.source(),previous);
});
test('Administrator edits retain the announcement type and URL when an older client omits the type',async()=>{
 const previous='---\nslug: "sample-note"\ntitle: "原公告"\nkind: "announcement"\nmodule: "announcements"\ndate: "2026-10-01"\n---\n原公告\n';
 const f=fixture({previous});f.setUser({id:11,login:'oslemoncat'});
 assert.equal((await f.api('/api/articles','POST',{post})).status,201);assert.match(f.source(),/kind: "announcement"/);assert.match(f.source(),/slug: "sample-note"/);
});

test('Administrator review changes only the publication module and keeps the submitted author, body and upload time',async()=>{
 const f=fixture();f.addMain('content/modules.json',JSON.stringify([{slug:'misc',title:'杂记'},{slug:'python',title:'python'}]));
 const submitted={...post,body:'正文保留\n\nmodule: "misc"\n\n结束',tags:['审核标签']},staged=await f.api('/api/submissions','POST',{post:submitted,files:[]});
 const memberDetail=await f.api('/api/submissions/7');assert.equal(memberDetail.data.canSetModule,false);
 f.setUser({id:11,login:'oslemoncat'});assert.equal((await f.api('/api/submissions/7')).data.canSetModule,true);
 const input={action:'publish',sha:staged.data.sha,module:'python',confirmed:true},result=await f.api('/api/submissions/7/review','POST',input);
 assert.equal(result.status,200,JSON.stringify(result.data));assert.match(f.source(),/^module: "python"$/m);assert.match(f.source(),/author_id: "github:21"/);
 assert.equal(f.source().split('\n---\n')[1],submitted.body+'\n');assert.equal(result.data.publication.uploadedAt,staged.data.uploadedAt);
 assert.deepEqual(JSON.parse(f.file('content/tags.json')).modules.python,['审核标签']);
 assert.equal(f.calls.filter(c=>c.m==='PATCH'&&c.p.endsWith('/heads/main')).length,1);
 assert.equal((await f.api('/api/submissions/7/review','POST',input)).data.publication.id,result.data.publication.id);
 assert.equal(f.calls.filter(c=>c.m==='PATCH'&&c.p.endsWith('/heads/main')).length,1);
});

test('Review module changes reject announcement, unknown and malformed module values without publishing',async()=>{
 for(const module of ['announcements','unknown-module',null,{},'misc\nkind: announcement']){
  const f=fixture(),staged=await f.stage(),before=f.main();f.setUser({id:11,login:'oslemoncat'});
  const result=await f.api('/api/submissions/7/review','POST',{action:'publish',sha:staged.sha,module});
  assert.equal(result.status,400,JSON.stringify(result.data));assert.equal(f.main(),before);assert.equal(f.prs.get(7).state,'open');
 }
});

test('A member or stale reviewed version cannot publish a module override',async()=>{
 const f=fixture(),staged=await f.stage(),before=f.main();
 assert.equal((await f.api('/api/submissions/7/review','POST',{action:'publish',sha:staged.sha,module:'misc',role:'admin'})).status,403);
 f.setUser({id:11,login:'oslemoncat'});
 assert.equal((await f.api('/api/submissions/7/review','POST',{action:'publish',sha:hash('stale'),module:'misc'})).status,409);
 assert.equal(f.main(),before);
});


test('Subtitle survives member submission, editing and reviewed publication independently of title and summary',async()=>{
 const f=fixture(),draft={...post,subtitle:'  从直觉到证明  '};
 const submitted=await f.api('/api/submissions','POST',{post:draft});assert.equal(submitted.status,201);
 assert.match((await f.api('/api/submissions/7')).data.source,/^subtitle: "从直觉到证明"$/m);
 const updated=await f.api('/api/submissions/7','PATCH',{post:{...post,subtitle:'补充说明 <img src=x onerror=alert(1)>'},sha:submitted.data.sha});assert.equal(updated.status,200,JSON.stringify(updated.data));
 f.setUser({id:11,login:'oslemoncat'});
 const published=await f.api('/api/submissions/7/review','POST',{action:'publish',sha:updated.data.sha});assert.equal(published.status,200,JSON.stringify(published.data));
 assert.match(f.source(),/^subtitle: "补充说明 <img src=x onerror=alert\(1\)>"$/m);
 assert.match(f.source(),/^title: "测试文章"$/m);assert.match(f.source(),/^summary: "摘要"$/m);assert.match(f.source(),/author_id: "github:21"/);
});

test('Older clients preserve an existing subtitle while an explicit empty subtitle clears it',async()=>{
 const f=fixture();f.setUser({id:11,login:'oslemoncat'});
 assert.equal((await f.api('/api/articles','POST',{post:{...post,subtitle:'保留的副标题'}})).status,201);
 assert.equal((await f.api('/api/articles','POST',{post})).status,201);assert.match(f.source(),/^subtitle: "保留的副标题"$/m);
 assert.equal((await f.api('/api/articles','POST',{post:{...post,subtitle:''}})).status,201);assert.match(f.source(),/^subtitle: ""$/m);
});

test('Malformed and oversized subtitles fail before any repository write',async()=>{
 for(const subtitle of [null,42,[],{},'字'.repeat(161)]){
  const f=fixture(),r=await f.api('/api/submissions','POST',{post:{...post,subtitle}});
  assert.equal(r.status,400,JSON.stringify(r.data));assert.match(r.data.message,/副标题/);assert.ok(!f.calls.some(c=>c.m!=='GET'));
 }
});
