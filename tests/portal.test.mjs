import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../auth/worker.mjs';
const env={CMS_ORIGIN:'https://oslemoncat.github.io',CALLBACK_URL:'https://auth.example.test/callback',REPOSITORY:'oslemoncat/oslemoncat.github.io',ALLOWED_GITHUB_LOGIN:'oslemoncat',GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret',OAUTH_STATE_SECRET:'test-only-state-key-with-at-least-32-chars'};
const sha='a'.repeat(40);
const post={slug:'test-note',title:'测试文章',module:'misc',summary:'摘要',date:'2026-10-09',updated:'2026-10-09',tags:[],body:'## 内容\n\n正文',images:[],attachments:[]};
const pr={number:7,title:'[投稿] 测试文章',changed_files:1,state:'open',user:{login:'member',id:21},base:{ref:'main',repo:{full_name:env.REPOSITORY}},head:{ref:'lemoncat/submission-test',sha,repo:{full_name:'member/oslemoncat.github.io'}}};
const encoded=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64');
function github(login='member',options={}){
 const calls=[];
 const fetcher=async(url,request={})=>{
  const p=new URL(url).pathname,method=request.method||'GET',body=request.body?JSON.parse(request.body):undefined;calls.push({p,method,body,headers:request.headers});
  if(p.endsWith('/access_token'))return Response.json({access_token:'test-token'});
  if(p==='/user')return Response.json({login,id:login==='oslemoncat'?11:21,avatar_url:'https://example.test/avatar.png'});
  if(p===`/repos/${env.REPOSITORY}`)return Response.json({full_name:env.REPOSITORY,private:false,permissions:{push:login==='oslemoncat'}});
  if(p.endsWith('/contents/content/modules.json'))return Response.json({content:encoded([{slug:'misc',title:'杂记与效率'}])});
  if(p===`/repos/member/oslemoncat.github.io`)return Response.json({full_name:'member/oslemoncat.github.io',fork:true,parent:{full_name:env.REPOSITORY},owner:{login:'member'}});
  if(p.endsWith('/contents/content/publications.json'))return Response.json({message:'not found'},{status:404});
  if(p.endsWith('/contents/content/ownership.json'))return Response.json({message:'Not found'},{status:404});
  if(p==='/repos/'+env.REPOSITORY+'/contents/content/posts/test-note.md'&&method==='GET'&&['main',sha].includes(new URL(url).searchParams.get('ref')))return Response.json({message:'Not found'},{status:404});
  if(p.endsWith('/actions/runs'))return Response.json({workflow_runs:[{id:90,path:'.github/workflows/pages.yml',head_sha:sha,event:'pull_request',status:options.pending?'in_progress':'completed',conclusion:options.pending?null:'success'}]});
  if(p.endsWith('/actions/runs/90/jobs'))return Response.json({jobs:[{name:'build',conclusion:'success'}]});
  if(p.endsWith('/git/ref/heads/main'))return Response.json({object:{sha}});
  if(p.includes('/git/commits/')&&method==='GET')return Response.json({tree:{sha:'tree-parent'}});
  if(p.endsWith('/git/blobs'))return Response.json({sha:'blob-sha'});
  if(p.endsWith('/git/trees'))return Response.json({sha:'tree-sha'});
  if(p.endsWith('/git/commits'))return Response.json({sha:'new-sha'});
  if(p.endsWith('/git/refs')||p.includes('/git/refs/heads/'))return Response.json({ref:body?.ref,object:{sha:body?.sha}});
  if(p.endsWith('/pulls')&&method==='POST')return Response.json({number:7,html_url:'https://github.com/'+env.REPOSITORY+'/pull/7'});
  if(p.endsWith('/pulls/7/files'))return Response.json(options.badFiles?[{filename:'.github/workflows/pages.yml',status:'modified'}]:[{filename:'content/posts/test-note.md',status:'added'}]);
  if(p.endsWith('/pulls/7/merge'))return Response.json({merged:true});
  if(p.endsWith('/pulls/7'))return Response.json(pr);
  if(p.endsWith('/check-runs'))return Response.json({check_runs:[{name:'build',conclusion:options.pending?'pending':'success',app:{slug:'github-actions'}}]});
  if(p.includes('/contents/content/posts/'))return Response.json({sha:'file-sha',content:encoded('---\nslug: "test-note"\ntitle: "测试文章"\n---\n正文')});
  if(url.startsWith('https://api.deepseek.com/'))return Response.json({choices:[{message:{content:'建议内容'}}]});
  throw new Error('Unexpected mocked GitHub endpoint '+method+' '+p);
 };return {fetcher,calls};
}
function request(path,method='GET',body,token='test-token',origin=env.CMS_ORIGIN){return new Request('https://auth.example.test'+path,{method,headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
test('Portal OAuth allows member login while legacy admin OAuth remains restricted',async()=>{
 const mock=github();const start=await handleRequest(new Request('https://auth.example.test/auth?provider=github&site_id=oslemoncat.github.io&mode=portal'),env);
 const redirect=new URL(start.headers.get('Location'));assert.equal(redirect.searchParams.has('login'),false);
 const cookie=start.headers.get('Set-Cookie').split(';')[0];const done=await handleRequest(new Request('https://auth.example.test/callback?code=test-code&state='+redirect.searchParams.get('state'),{headers:{Cookie:cookie}}),env,mock.fetcher);
 assert.equal(done.status,200);assert.ok((await done.text()).includes('test-token'));
});
test('Member identity comes from GitHub and cannot be promoted by request body',async()=>{const mock=github();const r=await handleRequest(request('/api/session'),env,mock.fetcher);assert.equal((await r.json()).role,'member');});
test('Unauthenticated and cross-origin API requests fail before GitHub calls',async()=>{const mock=github();assert.equal((await handleRequest(request('/api/session','GET',undefined,''),env,mock.fetcher)).status,401);assert.equal((await handleRequest(request('/api/session','GET',undefined,'test-token','https://evil.test'),env,mock.fetcher)).status,403);assert.equal(mock.calls.length,0);});
test('Members cannot publish, delete foreign articles, review or spend administrator AI credits',async()=>{for(const [path,method]of [['/api/articles','POST'],['/api/articles/test-note','DELETE'],['/api/submissions/7/review','POST'],['/api/assist','POST']]){const mock=github();const r=await handleRequest(request(path,method,{role:'admin',post,action:'publish',sha}),env,mock.fetcher);assert.equal(r.status,403);assert.equal(mock.calls.filter(c=>c.method!=='GET').length,0);}});
test('Member submission writes only to their fork and creates a review request',async()=>{const mock=github();const r=await handleRequest(request('/api/submissions','POST',{post,files:[]}),env,mock.fetcher);assert.equal(r.status,201);const writes=mock.calls.filter(c=>c.method!=='GET');assert.ok(writes.filter(c=>c.p.includes('/git/')).every(c=>c.p.startsWith('/repos/member/')));const creation=writes.find(c=>c.p.endsWith('/pulls'));assert.equal(creation.body.base,'main');assert.match(creation.body.head,/^member:lemoncat\/submission-/);});
test('Upload paths outside article media are rejected without writes',async()=>{const mock=github();const r=await handleRequest(request('/api/submissions','POST',{post,files:[{path:'.github/workflows/pages.yml',content:'YQ=='}]}),env,mock.fetcher);assert.equal(r.status,400);assert.ok(mock.calls.every(c=>c.method==='GET'));});
test('Administrators cannot merge unreviewed changes to scripts or workflows',async()=>{const mock=github('oslemoncat',{badFiles:true});const r=await handleRequest(request('/api/submissions/7/review','POST',{action:'publish',sha}),env,mock.fetcher);assert.equal(r.status,403);assert.ok(!mock.calls.some(c=>c.p.endsWith('/merge')));});
test('Changed article head or pending build blocks publication',async()=>{for(const input of [{sha:'old-sha',options:{}},{sha,options:{pending:true}}]){const mock=github('oslemoncat',input.options);assert.equal((await handleRequest(request('/api/submissions/7/review','POST',{action:'publish',sha:input.sha}),env,mock.fetcher)).status,409);assert.ok(!mock.calls.some(c=>c.p.endsWith('/merge')));}});
test('Approval publishes only the reviewed SHA after its successful workflow build',async()=>{const mock=github('oslemoncat');const r=await handleRequest(request('/api/submissions/7/review','POST',{action:'publish',sha}),env,mock.fetcher);assert.equal(r.status,200);assert.equal((await r.json()).publication.reviewedSha,sha);assert.equal(mock.calls.filter(c=>c.method==='PATCH'&&c.p.endsWith('/heads/main')).length,1);});
test('DeepSeek uses only server secret and configuration failure is explicit',async()=>{const mock=github('oslemoncat');assert.equal((await handleRequest(request('/api/assist','POST',{prompt:'改善手机排版'}),env,mock.fetcher)).status,503);const result=await handleRequest(request('/api/assist','POST',{prompt:'改善手机排版'}),{...env,DEEPSEEK_API_KEY:'fake-server-key'},mock.fetcher);assert.equal(result.status,200);assert.equal(mock.calls.find(c=>c.p==='/chat/completions').headers.Authorization,'Bearer fake-server-key');assert.ok(!(await result.text()).includes('fake-server-key'));});
test('Invalid calendar dates return a validation error without writes',async()=>{const mock=github();const result=await handleRequest(request('/api/submissions','POST',{post:{...post,date:'2026-99-99'},files:[]}),env,mock.fetcher);assert.equal(result.status,400);assert.ok(mock.calls.every(c=>c.method==='GET'));});
test('Review media is read from the exact submission commit',async()=>{const mock=github('oslemoncat');const result=await handleRequest(request('/api/submissions/7'),env,mock.fetcher);assert.equal(result.status,200);const data=await result.json();assert.equal(data.mediaBase,`https://raw.githubusercontent.com/member/oslemoncat.github.io/${sha}/`);assert.equal(data.files[0].path,'content/posts/test-note.md');});