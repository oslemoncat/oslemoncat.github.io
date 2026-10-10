
import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../auth/worker.mjs';
const env={CMS_ORIGIN:'https://oslemoncat.github.io',CALLBACK_URL:'https://auth.test/callback',REPOSITORY:'oslemoncat/oslemoncat.github.io',ALLOWED_GITHUB_LOGIN:'oslemoncat',GITHUB_CLIENT_ID:'fake-client',GITHUB_CLIENT_SECRET:'fake-secret',OAUTH_STATE_SECRET:'test-only-state-secret-at-least-32-characters'};
const head='a'.repeat(40),uid=21,encode=text=>Buffer.from(typeof text==='string'?text:JSON.stringify(text)).toString('base64');
const pr={number:2,title:'[投稿] 测试文章',changed_files:1,state:'open',user:{login:'member',id:uid},base:{ref:'main',repo:{full_name:env.REPOSITORY}},head:{ref:'lemoncat/submission-test',sha:head,repo:{full_name:'member/oslemoncat.github.io'}}};
function request(path,method='GET',body){return new Request('https://auth.test'+path,{method,headers:{Origin:env.CMS_ORIGIN,Authorization:'Bearer test-token',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
function fixture(options={}){
 const calls=[],owners=options.owners||{'own-note':{id:'github:21',login:'member'},'foreign-note':{id:'github:22',login:'member'}};
 const name=options.admin?'oslemoncat':'member';
 let source='---\nslug: "own-note"\ntitle: "文章"\nauthor_id: "'+(options.fakeAuthor?'github:22':'github:21')+'"\n---\n正文\n';
 let registry={version:1,articles:owners};
 const blobs=new Map(),trees=new Map();let fresh=0;
 const gh=async(url,input={})=>{
  const u=new URL(url),p=u.pathname,m=input.method||'GET';let body;try{body=JSON.parse(input.body);}catch{}
  calls.push({p,m,body,headers:input.headers});
  if(p==='/user')return Response.json({login:name,id:options.admin?11:uid});
  if(p==='/repos/'+env.REPOSITORY)return Response.json({private:false,full_name:env.REPOSITORY,permissions:{push:!!options.admin}});
  if(p.endsWith('/contents/content/publications.json'))return Response.json({message:'not found'},{status:404});
  if(p.endsWith('/contents/content/ownership.json'))return options.malformed?Response.json({content:encode({version:0,articles:{}})}):Response.json({content:encode(registry)});
  if(p.includes('/contents/content/posts/')){
   if(p.startsWith('/repos/'+env.REPOSITORY+'/')&&['main','main-parent'].includes(u.searchParams.get('ref'))&&!options.mainExists&&p.endsWith('own-note.md')&&m==='GET')return Response.json({message:'not found'},{status:404});
   if(m==='DELETE')return Response.json({commit:{sha:'deleted-sha'}});
   return Response.json({sha:'current-file-sha',content:encode(source)});
  }
  if(p.endsWith('/pulls/2/files'))return Response.json([{filename:'content/posts/own-note.md',status:options.mainExists?'modified':'added'}]);
  if(p.endsWith('/pulls/2/merge'))return Response.json({merged:true});
  if(p.endsWith('/pulls/2'))return Response.json({...pr,...(options.prOwner?{user:options.prOwner}:{})});
  if(p.endsWith('/actions/runs'))return Response.json({workflow_runs:options.noRun?[]:[{id:50,head_sha:options.wrongHead?'b'.repeat(40):head,path:options.wrongWorkflow?'.github/workflows/other.yml':'.github/workflows/pages.yml',event:'pull_request',status:options.running?'in_progress':'completed',conclusion:options.approval?'action_required':options.failed?'failure':'success'}]});
  if(p.endsWith('/actions/runs/50/jobs'))return Response.json({jobs:[{name:'build',conclusion:options.failedJob?'failure':'success'}]});
  if(p.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'main-parent'}});
  if(p.includes('/git/commits/')&&m==='GET')return Response.json({tree:{sha:'parent-tree'}});
  if(p.endsWith('/git/blobs')){const id='blob-'+(++fresh);blobs.set(id,body.content);return Response.json({sha:id});}
  if(p.endsWith('/git/trees')){const id='tree-'+(++fresh);trees.set(id,body.tree);return Response.json({sha:id});}
  if(p.endsWith('/git/commits'))return Response.json({sha:'ownership-commit'});
  if(p.includes('/git/refs/heads/'))return Response.json({object:{sha:body.sha}});
  throw Error('Unexpected endpoint '+m+' '+p);
 };
 return {gh,calls,blobs,trees};
}
test('Administrator deletes any article with no new content token',async()=>{
 const f=fixture({admin:true,mainExists:true});const r=await handleRequest(request('/api/articles/foreign-note','DELETE'),env,f.gh);
 assert.equal(r.status,200);const write=f.calls.find(x=>x.m==='DELETE');assert.equal(write.body.sha,'current-file-sha');assert.equal(write.body.branch,'main');assert.equal(write.headers.Authorization,'Bearer test-token');
});
test('Member can delete their own article only through the configured server content grant',async()=>{
 const f=fixture({mainExists:true});const r=await handleRequest(request('/api/articles/own-note','DELETE'),{...env,GITHUB_CONTENT_TOKEN:'fake-private-content-key'},f.gh);
 assert.equal(r.status,200);const write=f.calls.find(x=>x.m==='DELETE');assert.equal(write.headers.Authorization,'Bearer fake-private-content-key');assert.equal(write.body.sha,'current-file-sha');
 assert.ok(!(await r.text()).includes('fake-private-content-key'));
});
test('Display-name collision or client-supplied role cannot delete another author',async()=>{
 const f=fixture({mainExists:true});const r=await handleRequest(request('/api/articles/foreign-note','DELETE',{role:'admin',author:'member'}),{...env,GITHUB_CONTENT_TOKEN:'fake-key'},f.gh);
 assert.equal(r.status,403);assert.ok(f.calls.every(x=>x.m==='GET'));
});
test('Ownership/source disagreement fails closed even with valid server grant',async()=>{
 const f=fixture({mainExists:true,fakeAuthor:true});assert.equal((await handleRequest(request('/api/articles/own-note','DELETE'),{...env,GITHUB_CONTENT_TOKEN:'fake-key'},f.gh)).status,403);assert.ok(!f.calls.some(x=>x.m==='DELETE'));
});
test('Unattributed legacy articles remain deletable only by administrators',async()=>{
 const f=fixture({owners:{},mainExists:true});assert.equal((await handleRequest(request('/api/articles/own-note','DELETE'),env,f.gh)).status,403);
});
test('Missing content service grant gives an actionable error and makes no deletion',async()=>{
 const f=fixture({mainExists:true});const r=await handleRequest(request('/api/articles/own-note','DELETE'),env,f.gh);assert.equal(r.status,503);assert.match((await r.json()).message,/授权/);assert.ok(!f.calls.some(x=>x.m==='DELETE'));
});
test('Malformed author registry is rejected instead of granting access',async()=>{
 const f=fixture({malformed:true});assert.equal((await handleRequest(request('/api/ownership'),env,f.gh)).status,503);
});
test('Member article list and permissions use stable GitHub ID, not name',async()=>{
 const f=fixture();const list=await handleRequest(request('/api/ownership'),env,f.gh);assert.deepEqual((await list.json()).owned,['own-note']);
 const own=await handleRequest(request('/api/articles/own-note/permissions'),env,f.gh);assert.equal((await own.json()).canDelete,true);
 const foreign=await handleRequest(request('/api/articles/foreign-note/permissions'),env,f.gh);assert.equal((await foreign.json()).canDelete,false);
});
test('Approval-required run is distinguished from a failed build and does not merge',async()=>{
 const f=fixture({admin:true,approval:true});const r=await handleRequest(request('/api/submissions/2/review','POST',{action:'publish',sha:head}),env,f.gh);
 assert.equal(r.status,409);const data=await r.json();assert.equal(data.check.status,'approval_required');assert.match(data.message,/批准/);assert.equal(data.check.url,'https://github.com/'+env.REPOSITORY+'/actions/runs/50');assert.ok(!f.calls.some(x=>x.p.endsWith('/merge')));
});
test('Queued, running, failed and successful checks appear on the review detail',async()=>{
 for(const [options,status]of [[{noRun:true},'queued'],[{running:true},'running'],[{failed:true},'failed'],[{},'success']]){
  const f=fixture({admin:true,...options});const r=await handleRequest(request('/api/submissions/2'),env,f.gh);assert.equal(r.status,200);assert.equal((await r.json()).check.status,status);
 }
});
test('Successful build on another head or workflow cannot authorize this publication',async()=>{
 for(const options of [{wrongHead:true},{wrongWorkflow:true},{failedJob:true}]){const f=fixture({admin:true,...options});const r=await handleRequest(request('/api/submissions/2/review','POST',{action:'publish',sha:head}),env,f.gh);assert.equal(r.status,409);assert.ok(!f.calls.some(x=>x.p.endsWith('/merge')));}
});
test('Successful PR workflow binds its head but can test the GitHub merge revision',async()=>{
 const f=fixture({admin:true,owners:{}});const r=await handleRequest(request('/api/submissions/2/review','POST',{action:'publish',sha:head}),env,f.gh);assert.equal(r.status,200);assert.equal((await r.json()).publication.reviewedSha,head);assert.equal(f.calls.filter(x=>x.m==='PATCH'&&x.p.endsWith('/heads/main')).length,1);assert.ok(!f.calls.some(x=>x.p.endsWith('/check-runs')));
 const ownerBlob=[...f.blobs.values()].find(x=>x.includes('"version": 1'));assert.equal(JSON.parse(ownerBlob).articles['own-note'].id,'github:21');
 const articleBlob=[...f.blobs.values()].find(x=>x.startsWith('---'));assert.match(articleBlob,/author_id: "github:21"/);
});
test('Member cannot overwrite an article owned by another author through a submission',async()=>{
 const f=fixture({admin:true,mainExists:true,owners:{'own-note':{id:'github:22',login:'someone-else'}}});const r=await handleRequest(request('/api/submissions/2/review','POST',{action:'publish',sha:head}),env,f.gh);assert.equal(r.status,403);assert.ok(!f.calls.some(x=>x.p.endsWith('/merge')));
});
test('Member can withdraw only their own pending submission',async()=>{
 const f=fixture();assert.equal((await handleRequest(request('/api/submissions/2','DELETE'),env,f.gh)).status,200);assert.equal(f.calls.find(x=>x.m==='PATCH').body.state,'closed');
 const other=fixture({prOwner:{id:22,login:'other'}});assert.equal((await handleRequest(request('/api/submissions/2','DELETE'),env,other.gh)).status,403);assert.ok(!other.calls.some(x=>x.m==='PATCH'));
});
