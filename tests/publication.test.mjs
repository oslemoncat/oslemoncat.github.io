import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {handleRequest} from '../auth/worker.mjs';
const repo='oslemoncat/oslemoncat.github.io',env={CMS_ORIGIN:'https://oslemoncat.github.io',CALLBACK_URL:'https://auth.test/callback',REPOSITORY:repo,ALLOWED_GITHUB_LOGIN:'oslemoncat',OAUTH_STATE_SECRET:'candidate-test-key-with-more-than-32-characters',GITHUB_CONTENT_TOKEN:'fake-service-key'};
const hash=text=>crypto.createHash('sha1').update(text).digest('hex'),encode=text=>Buffer.from(text).toString('base64');
const post={slug:'sample-note',title:'测试文章',module:'misc',summary:'摘要',date:'2026-10-01',updated:'2026-10-01',body:'## 正文\n安全内容',tags:[],images:[],attachments:[]};
function fixture(options={}){
 const calls=[],blobs=new Map(),trees=new Map(),commits=new Map(),heads=new Map(),prs=new Map();let counter=0,user={id:21,login:'member'},main=hash('original-main');
 const initial={'content/modules.json':JSON.stringify([{slug:'misc',title:'杂记'}]),'content/ownership.json':JSON.stringify({version:1,articles:options.owner?{'sample-note':options.owner}:{}})};
 if(options.previous)initial['content/posts/sample-note.md']=options.previous;
 const rootTree=new Map(Object.entries(initial).map(([path,value])=>{const sha=hash(value);blobs.set(sha,{content:encode(value),encoding:'base64',size:Buffer.byteLength(value)});return [path,sha];}));
 const parentTree=hash('parent-tree');trees.set(parentTree,rootTree);commits.set(main,{tree:{sha:parentTree},files:rootTree});heads.set('main',main);
 const respond=(data,status=200)=>Response.json(data,{status});
 const gh=async(url,input={})=>{
  const u=new URL(url),p=u.pathname,m=input.method||'GET',body=input.body?JSON.parse(input.body):null;calls.push({p,m,body});
  if(options.enforceService&&user.login!=='oslemoncat'&&m!=='GET'&&input.headers?.Authorization!=='Bearer '+env.GITHUB_CONTENT_TOKEN)return respond({message:'Insufficient user permissions'},403);
  if(u.origin===env.CMS_ORIGIN){const items=options.live?publications():[];return respond({commit:main,publications:items.map(x=>({id:x.id,slug:x.slug}))});}
  if(p==='/user')return respond(user);
  if(p==='/repos/'+repo)return respond({full_name:repo,private:false,permissions:{push:user.login==='oslemoncat'}});
  if(p.includes('/contents/')){
   const path=p.split('/contents/')[1],ref=u.searchParams.get('ref')||'main',sha=heads.get(ref)||ref,files=commits.get(sha)?.files||commits.get(main).files,blob=blobs.get(files.get(path));
   return blob?respond({...blob,sha:files.get(path)}):respond({message:'not found'},404);
  }
  if(p.endsWith('/git/ref/heads/main'))return respond({object:{sha:main}});
  if(p.endsWith('/git/blobs')&&m==='POST'){const raw=body.encoding==='base64'?Buffer.from(body.content,'base64'):Buffer.from(body.content),sha=hash(raw);blobs.set(sha,{content:raw.toString('base64'),encoding:'base64',size:raw.length});return respond({sha});}
  if(p.includes('/git/blobs/')&&m==='GET')return respond(blobs.get(p.split('/').pop()));
  if(p.includes('/git/trees/')&&m==='GET')return respond({tree:[...trees.get(p.split('/').pop())].map(([path,sha])=>({path,sha})),truncated:false});
  if(p.endsWith('/git/trees')&&m==='POST'){const files=new Map(trees.get(body.base_tree));for(const row of body.tree)files.set(row.path,row.sha);const sha=hash('tree-'+(++counter));trees.set(sha,files);return respond({sha});}
  if(p.endsWith('/git/commits')&&m==='POST'){const sha=hash('commit-'+(++counter));commits.set(sha,{tree:{sha:body.tree},files:trees.get(body.tree)});return respond({sha});}
  if(p.includes('/git/commits/')&&m==='GET')return respond(commits.get(p.split('/').pop()));
  if(p.endsWith('/git/refs')&&m==='POST'){heads.set(body.ref.slice('refs/heads/'.length),body.sha);return respond({object:{sha:body.sha}});}
  if(p.includes('/git/refs/heads/')&&m==='PATCH'){const branch=p.split('/git/refs/heads/')[1];if(options.conflict&&branch==='main')return respond({message:'Conflict'},409);heads.set(branch,body.sha);if(branch==='main')main=body.sha;return respond({object:{sha:body.sha}});}
  if(p.endsWith('/pulls')&&m==='POST'){
   const sha=heads.get(body.head),pr={number:7,title:body.title,body:body.body,html_url:'https://github.com/'+repo+'/pull/7',state:'open',updated_at:new Date().toISOString(),user:{id:11,login:'oslemoncat'},base:{ref:'main',repo:{full_name:repo}},head:{ref:body.head,sha,repo:{full_name:repo}},changed_files:[...commits.get(sha).files].filter(([path,value])=>commits.get(main).files.get(path)!==value).length};prs.set(7,pr);return respond(pr);
  }
  if(p.endsWith('/pulls')&&m==='GET')return respond([...prs.values()]);
  if(p.endsWith('/pulls/7/files')){
   const pr=prs.get(7),branchFiles=commits.get(pr.head.sha).files;
   return respond([...branchFiles].filter(([path,value])=>rootTree.get(path)!==value).map(([filename,sha])=>({filename,sha,status:rootTree.has(filename)?'modified':'added'})));
  }
  if(p.endsWith('/pulls/7')){const pr=prs.get(7);if(m==='PATCH'){if(options.closeFailure)return respond({message:'Unavailable'},502);Object.assign(pr,body);}return respond(pr);}
  if(p.endsWith('/actions/runs')){
   const sha=u.searchParams.get('head_sha'),event=u.searchParams.get('event');return respond({workflow_runs:options.noRun?[]:[{id:1,path:options.wrongWorkflow?'.github/workflows/other.yml':'.github/workflows/pages.yml',head_sha:options.wrongHead?hash('wrong'):sha,event,status:options.running?'in_progress':'completed',conclusion:options.failed?'failure':options.approval?'action_required':options.running?null:'success'}]});
  }
  if(p.endsWith('/actions/runs/1/jobs'))return respond({jobs:[{name:'build',conclusion:options.failedJob?'failure':options.buildPending?null:'success'}]});
  if(p.endsWith('/commits')&&m==='GET')return respond([{sha:main}]);
  throw Error('Unexpected '+m+' '+p);
 };
 function publications(){const sha=commits.get(main).files.get('content/publications.json');return sha?JSON.parse(Buffer.from(blobs.get(sha).content,'base64').toString()).items:[];}
 async function api(path,method='GET',body){const request=new Request('https://auth.test'+path,{method,headers:{Origin:env.CMS_ORIGIN,Authorization:'Bearer test-token',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const r=await handleRequest(request,env,gh);return {status:r.status,data:await r.json()};}
 async function stage(){const result=await api('/api/submissions','POST',{post,files:[]});assert.equal(result.status,201,JSON.stringify(result.data));return result.data;}
 function source(){const sha=commits.get(main).files.get('content/posts/sample-note.md');return sha?Buffer.from(blobs.get(sha).content,'base64').toString():'';}
 return {api,stage,calls,heads,prs,options,source,publications,addMain:(path,value)=>{const blob=hash(value);blobs.set(blob,{content:encode(value),encoding:'base64',size:Buffer.byteLength(value)});const files=new Map(commits.get(main).files);files.set(path,blob);const tree=hash('external-tree-'+(++counter));trees.set(tree,files);main=hash('external-commit-'+counter);commits.set(main,{tree:{sha:tree},files});heads.set('main',main);},setUser:u=>{user=u;},main:()=>main};
}
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
