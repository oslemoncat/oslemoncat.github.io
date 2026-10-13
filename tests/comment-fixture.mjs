import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleRequest} from '../auth/worker.mjs';

const base={CMS_ORIGIN:'https://oslemoncat.github.io',REPOSITORY:'oslemoncat/oslemoncat.github.io',ALLOWED_GITHUB_LOGIN:'oslemoncat'};
const schema=readFileSync(new URL('../auth/migrations/0001_comments.sql',import.meta.url),'utf8');
const replySchema=readFileSync(new URL('../auth/migrations/0002_comment_replies.sql',import.meta.url),'utf8');
const route='/api/articles/test-note/comments';
const encode=text=>Buffer.from(text).toString('base64');
function request(path=route,method='GET',body,headers={}){
 return new Request('https://auth.test'+path,{method,headers:{Origin:base.CMS_ORIGIN,Authorization:'Bearer test-token',...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
function fixture(t,options={}){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);if(!options.legacy)sqlite.exec(replySchema);t.after(()=>sqlite.close());
 let user={login:'member',id:21},push=false;
 const calls=[],sqlCalls=[];
 const d1={prepare(sql){const stmt=sqlite.prepare(sql);let args=[];
  const prepared={
   bind(...values){args=values;return prepared;},
   async first(){sqlCalls.push(sql);return stmt.get(...args)||null;},
   async run(){sqlCalls.push(sql);const r=stmt.run(...args);return {success:true,results:[],meta:{changes:Number(r.changes)}};},
   execute(){sqlCalls.push(sql);if(stmt.columns().length)return {success:true,results:stmt.all(...args),meta:{changes:0}};const r=stmt.run(...args);return {success:true,results:[],meta:{changes:Number(r.changes)}}}
  };return prepared;
 },async batch(statements){if(options.beforeBatch){const hook=options.beforeBatch;options.beforeBatch=null;hook(sqlite);}sqlite.exec('BEGIN IMMEDIATE');try{const result=statements.map(stmt=>stmt.execute());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const gh=async(url,input={})=>{
  const p=new URL(url).pathname;calls.push({p,m:input.method||'GET'});
  if(p==='/user')return Response.json(user);
  if(p==='/repos/'+base.REPOSITORY)return Response.json({private:false,full_name:base.REPOSITORY,permissions:{push}});
  if(p.startsWith('/repos/'+base.REPOSITORY+'/contents/content/posts/')){
   if(options.missing)return Response.json({message:'not found'},{status:404});
   return Response.json({content:encode('---\nslug: "test-note"\ndraft: '+Boolean(options.draft)+'\n---\n正文\n')});
  }
  throw Error('Unexpected endpoint '+p);
 };
 const env={...base,COMMENTS_DB:d1};
 function identity(id=21,login='member',canPush=false){user={id,login};push=canPush;}
 function seed({id=crypto.randomUUID(),slug='test-note',author=21,login='member',body='已有评论',created=Date.now()-30000,parent=null,root=null}={}){
  sqlite.prepare('INSERT INTO comments (id,article_slug,author_id,author_login,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id,slug,'github:'+author,login,body,created,created);if(parent)sqlite.prepare('INSERT INTO comment_links VALUES (?,?,?)').run(id,parent,root||parent);return id;
 }
 return {sqlite,env,gh,calls,sqlCalls,identity,seed,options,run:(req,extra={})=>handleRequest(req,{...env,...extra},gh)};
}
const post=(body='一条评论',id=crypto.randomUUID())=>({body,requestId:id});


export {base,schema,replySchema,route,request,fixture,post};
