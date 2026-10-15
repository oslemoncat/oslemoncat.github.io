import assert from 'node:assert/strict';import crypto from 'node:crypto';import {handleRequest} from '../auth/worker.mjs';
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
  if(p.endsWith('/contents/content/tags.json')&&m==='PUT'){
   if(options.tagConflictOnce){options.tagConflictOnce=false;addMain('content/tags.json',JSON.stringify({version:1,modules:{misc:['并发添加']}}));return respond({message:'Conflict'},409);}
   const current=commits.get(main).files.get('content/tags.json');if((body.sha||null)!==(current||null))return respond({message:'Conflict'},409);
   addMain('content/tags.json',Buffer.from(body.content,'base64').toString('utf8'));return respond({content:{sha:commits.get(main).files.get('content/tags.json')},commit:{sha:main}});
  }
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
 const addMain=(path,value)=>{const blob=hash(value);blobs.set(blob,{content:encode(value),encoding:'base64',size:Buffer.byteLength(value)});const files=new Map(commits.get(main).files);files.set(path,blob);const tree=hash('external-tree-'+(++counter));trees.set(tree,files);main=hash('external-commit-'+counter);commits.set(main,{tree:{sha:tree},files});heads.set('main',main);};
 function file(path){const sha=commits.get(main).files.get(path);return sha?Buffer.from(blobs.get(sha).content,'base64').toString():null;}
 function publications(){const sha=commits.get(main).files.get('content/publications.json');return sha?JSON.parse(Buffer.from(blobs.get(sha).content,'base64').toString()).items:[];}
 async function api(path,method='GET',body,headers={}){const request=new Request('https://auth.test'+path,{method,headers:{Origin:env.CMS_ORIGIN,Authorization:'Bearer test-token',...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const r=await handleRequest(request,env,gh);const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={message:text};}return {status:r.status,data};}
 async function stage(){const result=await api('/api/submissions','POST',{post,files:[]});assert.equal(result.status,201,JSON.stringify(result.data));return result.data;}
 function source(){const sha=commits.get(main).files.get('content/posts/sample-note.md');return sha?Buffer.from(blobs.get(sha).content,'base64').toString():'';}
 return {run:(request,overrides={})=>handleRequest(request,{...env,...overrides},gh),api,stage,calls,heads,prs,options,source,publications,file,addMain,setUser:u=>{user=u;},main:()=>main};
}

export {fixture,post,env,repo,hash};
