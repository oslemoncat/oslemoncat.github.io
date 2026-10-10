// Cloudflare Worker: GitHub OAuth bridge for this site's Decap /admin/.
// No tokens or secrets are ever written to logs or to the public repository.
const encoder = new TextEncoder();
const cookieName = '__Host-decap_session';
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const unb64 = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), x => x.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const jsonForScript = data => JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const clearCookie = `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const baseHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' };

async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signSession(data, secret) {
  const payload = b64(encoder.encode(JSON.stringify(data)));
  const signature = b64(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload))));
  return `${payload}.${signature}`;
}
async function readSession(value, secret) {
  if (!value || value.length > 2048) throw new Error('state');
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra) throw new Error('state');
  const valid = await crypto.subtle.verify('HMAC', await signingKey(secret), unb64(signature), encoder.encode(payload));
  if (!valid) throw new Error('state');
  const data = JSON.parse(new TextDecoder().decode(unb64(payload)));
  if (data.expires < Date.now() || !/^[\w-]{43}$/.test(data.state) || !/^[\w-]{43}$/.test(data.verifier)) throw new Error('state');
  return data;
}
function config(env) {
  for (const key of ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'OAUTH_STATE_SECRET', 'CMS_ORIGIN', 'CALLBACK_URL', 'REPOSITORY', 'ALLOWED_GITHUB_LOGIN']) {
    if (!env[key] || String(env[key]).includes('REPLACE')) throw new Error('configuration');
  }
  if (env.OAUTH_STATE_SECRET.length < 32) throw new Error('configuration');
  const cms = new URL(env.CMS_ORIGIN), callback = new URL(env.CALLBACK_URL);
  if (cms.protocol !== 'https:' || cms.origin !== env.CMS_ORIGIN || callback.protocol !== 'https:' || callback.pathname !== '/callback' || callback.search || callback.hash || callback.username || callback.password) throw new Error('configuration');
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.REPOSITORY)) throw new Error('configuration');
  return { cms, callback };
}
function popup(origin, result, payload, status = 200) {
  const nonce = random();
  const message = `authorization:github:${result}:${JSON.stringify(payload)}`;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>GitHub 登录</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p id="status">正在完成登录，请保持此窗口打开。</p><script nonce="${nonce}">
    const origin = ${jsonForScript(origin)};
    const message = ${jsonForScript(message)};
    if (!window.opener) document.getElementById('status').textContent = '请从网站的文章管理页面重新登录。';
    else {
      function onMessage(event) {
        if (event.origin !== origin || event.source !== window.opener || event.data !== 'authorizing:github') return;
        window.removeEventListener('message', onMessage);
        window.opener.postMessage(message, origin);
        document.getElementById('status').textContent = '登录结果已返回网站，可以关闭此窗口。';
      }
      window.addEventListener('message', onMessage);
      window.opener.postMessage('authorizing:github', origin);
    }
  </script></body></html>`;
  return new Response(html, { status, headers: { ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': clearCookie, 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'` } });
}
const errorResponse = (message, status) => new Response(message, { status, headers: { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });

export async function handleRequest(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return handlePortal(request, env, fetcher);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405);
  if (url.pathname === '/health') return new Response('ok', { headers: baseHeaders });
  if (!['/auth', '/callback'].includes(url.pathname)) return errorResponse('Not found', 404);
  let settings;
  try { settings = config(env); } catch { return errorResponse('登录服务尚未配置，请完成 Worker 变量和 Secret 设置。', 503); }
  const { cms, callback } = settings;
  if (url.origin !== callback.origin) return errorResponse('Incorrect authentication origin', 400);
  const origin = request.headers.get('Origin');
  if (origin && origin !== cms.origin) return errorResponse('Origin not allowed', 403);
  if (url.pathname === '/auth') {
    if (url.searchParams.get('provider') !== 'github' || url.searchParams.get('site_id') !== cms.hostname) return errorResponse('Invalid provider or site', 400);
    const state = random(), verifier = random();
    const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
    const portal = url.searchParams.get('mode') === 'portal';
    const session = await signSession({ state, verifier, portal, expires: Date.now() + 600_000 }, env.OAUTH_STATE_SECRET);
    const authorize = new URL('https://github.com/login/oauth/authorize');
    authorize.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: callback.href, scope: 'public_repo', state, code_challenge: challenge, code_challenge_method: 'S256', allow_signup: 'true', ...(portal ? {} : { login: adminNames(env)[0] }) }).toString();
    return new Response(null, { status: 302, headers: { ...baseHeaders, Location: authorize.href, 'Set-Cookie': `${cookieName}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
  }
  let session;
  try {
    const cookie = request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    session = await readSession(cookie, env.OAUTH_STATE_SECRET);
    if (url.searchParams.get('state') !== session.state) throw new Error('state');
  } catch { return popup(cms.origin, 'error', { message: '登录请求已失效或校验失败，请重新登录。' }, 403); }
  if (url.searchParams.has('error')) return popup(cms.origin, 'error', { message: 'GitHub 授权未完成。' }, 401);
  const code = url.searchParams.get('code');
  if (!code || code.length > 512) return popup(cms.origin, 'error', { message: '缺少登录授权码。' }, 400);
  try {
    const tokenResponse = await fetcher('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: callback.href, code_verifier: session.verifier })
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token || token.error) throw new Error('token');
    const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'oslemoncat-decap-oauth' };
    const userResponse = await fetcher('https://api.github.com/user', { headers });
    const user = await userResponse.json();
    if (!userResponse.ok || (!session.portal && !adminNames(env).includes(user.login?.toLowerCase()))) return popup(cms.origin, 'error', { message: '这个 GitHub 账号没有本站的管理权限。' }, 403);
    const repoResponse = await fetcher(`https://api.github.com/repos/${env.REPOSITORY}`, { headers });
    const repo = await repoResponse.json();
    if (!repoResponse.ok || (!session.portal && repo.permissions?.push !== true) || repo.private !== false || repo.full_name?.toLowerCase() !== env.REPOSITORY.toLowerCase()) return popup(cms.origin, 'error', { message: '需要对本站公开仓库拥有写入权限。' }, 403);
    return popup(cms.origin, 'success', { token: token.access_token, provider: 'github', ...(session.portal ? { portal: true } : {}) });
  } catch { return popup(cms.origin, 'error', { message: 'GitHub 登录服务暂时不可用，请稍后重试。' }, 502); }
}
export default { fetch(request, env) { return handleRequest(request, env); } };

// Unified website API. GitHub identities and permissions are checked on every request.
class PortalError extends Error { constructor(status, message) { super(message); this.status = status; } }
const postSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 100;
const adminNames = env => String(env.ALLOWED_GITHUB_LOGIN || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
const decodeGithub = text => new TextDecoder().decode(unb64(String(text).replace(/\s/g, '').replaceAll('+', '-').replaceAll('/', '_')));
function portalJson(data, status, origin) {
  return Response.json(data, { status, headers: { ...baseHeaders, 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } });
}
async function portalIdentity(request, env, fetcher) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([\w.-]{1,512})$/)?.[1];
  if (!token) throw new PortalError(401, '请先登录。');
  const gh = async (resource, method = 'GET', body) => {
    const response = await fetcher('https://api.github.com' + resource, { method, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'lemoncat-hub', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new PortalError(response.status === 401 ? 401 : response.status, response.status === 401 ? '登录已失效，请重新登录。' : response.status === 403 ? 'GitHub 权限不足或请求过于频繁，请稍后重试。' : response.status === 404 ? '内容暂时不存在。' : 'GitHub 未能完成操作，请稍后重试。');
    return data;
  };
  const user = await gh('/user');
  const repo = await gh(`/repos/${env.REPOSITORY}`);
  if (!user.login || repo.private !== false || repo.full_name?.toLowerCase() !== env.REPOSITORY.toLowerCase()) throw new PortalError(403, '网站仓库配置不正确。');
  return { gh, user, repo, role: adminNames(env).includes(user.login.toLowerCase()) && repo.permissions?.push === true ? 'admin' : 'member' };
}
const needAdmin = identity => { if (identity.role !== 'admin') throw new PortalError(403, '只有管理员可以审核、发布或删除文章。'); };
async function readPortalBody(request) {
  if (Number(request.headers.get('Content-Length') || 0) > 30_000_000) throw new PortalError(413, '本次附件总量过大，请分批提交。');
  const text = await request.text();
  if (text.length > 30_000_000) throw new PortalError(413, '本次附件总量过大，请分批提交。');
  try { return JSON.parse(text); } catch { throw new PortalError(400, '提交内容格式错误。'); }
}
async function submissionDocuments(input, identity, env, previousSource='') {
  const p = input.post || {};
  if (!postSlug(p.slug) || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 160 || typeof p.body !== 'string' || !p.body.trim() || p.body.length > 400_000) throw new PortalError(400, '请填写有效的文章地址、标题和正文。');
  const modulesFile = await identity.gh(`/repos/${env.REPOSITORY}/contents/content/modules.json`);
  const modules = JSON.parse(decodeGithub(modulesFile.content));
  if (!modules.some(x => x.slug === p.module)) throw new PortalError(400, '请选择有效的知识模块。');
  const isDate = value => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const time = Date.parse(value + 'T00:00:00Z'); return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value; };
  if (!isDate(p.date) || !isDate(p.updated) || p.updated < p.date) throw new PortalError(400, '文章日期无效。');
  const tags = Array.isArray(p.tags) ? p.tags.filter(x => typeof x === 'string' && x.length <= 40).slice(0,20) : [];
  const images = Array.isArray(p.images) ? p.images.slice(0,30) : [];
  const attachments = Array.isArray(p.attachments) ? p.attachments.slice(0,30) : [];
  for (const [records,key,prefix] of [[images,'src','/assets/images/'],[attachments,'file','/assets/files/']]) {
    if (records.some(x => !x || typeof x[key] !== 'string' || !x[key].startsWith(prefix) || /[\\\u0000-\u001f]/.test(x[key]) || x[key].split('/').includes('..') || ['caption','title'].some(k => x[k] != null && (typeof x[k] !== 'string' || x[k].length > 300)))) throw new PortalError(400, '附件地址无效。');
  }
  const files = Array.isArray(input.files) ? input.files : [];
  if (files.length > 12) throw new PortalError(400, '一次最多上传 12 个文件。');
  let bytes = 0;
  const documents = [];
  const seen = new Set();
  for (const f of files) {
    const isImage = /^assets\/images\/uploads\/[a-z0-9-]{1,120}\.(png|jpg|jpeg|gif|webp|avif)$/i.test(f.path || '');
    const isFile = /^assets\/files\/uploads\/[a-z0-9-]{1,120}\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|zip|mp4|webm|ogv|mp3|m4a|wav|ogg|oga|flac)$/i.test(f.path || '');
    if ((!isImage && !isFile) || typeof f.content !== 'string' || f.content.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(f.content) || seen.has(f.path)) throw new PortalError(400, '文件名称或类型无效。');
    seen.add(f.path);
    const size = f.content.length * 3 / 4 - (f.content.endsWith('==') ? 2 : f.content.endsWith('=') ? 1 : 0);
    if (size > (isImage ? 10 : 20) * 1024 * 1024 || (bytes += size) > 20 * 1024 * 1024) throw new PortalError(413, '图片最多 10 MB、附件最多 20 MB，本次文件总量最多 20 MB。');
    documents.push({ path: f.path, content: f.content, encoding: 'base64' });
  }
  const meta = { slug:p.slug, title:p.title.trim(), summary:String(p.summary || '').slice(0,1000), module:p.module, date:sourceField(previousSource,'date')||chinaDay(), updated:[sourceField(previousSource,'date')||'',chinaDay()].sort().at(-1), uploaded_at:sourceField(previousSource,'uploaded_at')||new Date().toISOString(), updated_at:new Date().toISOString(), tags, cover:images[0]?.src || p.cover || '', order:0, draft:false, images, attachments, author:identity.user.login,...(actorId(identity)?{author_id:actorId(identity)}:{}) };
  if (meta.cover && (!meta.cover.startsWith('/assets/images/') && !meta.cover.startsWith('assets/images/'))) throw new PortalError(400, '封面图地址无效。');
  const source = '---\n' + Object.entries(meta).map(([key,value]) => key + ': ' + JSON.stringify(value)).join('\n') + '\n---\n' + p.body.trim() + '\n';
  documents.push({ path:`content/posts/${p.slug}.md`, content:source, encoding:'utf-8' });
  return { documents, post:meta };
}
async function commitPortalFiles(gh,repository,parentSha,documents,message){
 const parent=await gh('/repos/'+repository+'/git/commits/'+parentSha),tree=[];
 for(let start=0;start<documents.length;start+=3){
  const batch=await Promise.all(documents.slice(start,start+3).map(async d=>{const blob=d.sha?{sha:d.sha}:await gh('/repos/'+repository+'/git/blobs','POST',{content:d.content,encoding:d.encoding});return {path:d.path,mode:'100644',type:'blob',sha:blob.sha};}));tree.push(...batch);
 }
 const created=await gh('/repos/'+repository+'/git/trees','POST',{base_tree:parent.tree.sha,tree});
 return (await gh('/repos/'+repository+'/git/commits','POST',{message,tree:created.sha,parents:[parentSha]})).sha;
}
async function getPortalSubmission(identity, env, number) {
  const pr = await identity.gh(`/repos/${env.REPOSITORY}/pulls/${number}`);
  if (pr.base?.repo?.full_name?.toLowerCase() !== env.REPOSITORY.toLowerCase() || pr.base.ref !== 'main' || !/^lemoncat\/(submission|review)-[a-z0-9-]+$/.test(pr.head?.ref || '') || !pr.title?.startsWith('[投稿] ')) throw new PortalError(404, '这不是本站的文章投稿。');
  pr.portalAuthor=await submissionAuthor(pr,env);
  if(identity.role!=='admin'&&pr.portalAuthor.id!==identity.user.id)throw new PortalError(403,'只能查看或修改自己的投稿。');
  return pr;
}
async function inspectPortalSubmission(identity, env, pr) {
  if (pr.changed_files > 13) throw new PortalError(400, '稿件修改的文件过多。');
  const files = await identity.gh(`/repos/${env.REPOSITORY}/pulls/${pr.number}/files?per_page=100`);
  if (files.length !== pr.changed_files) throw new PortalError(409, '文件列表尚未完整，请刷新后重试。');
  const posts = files.filter(f => /^content\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(f.filename));
  if (posts.length !== 1 || files.some(f => !['added','modified'].includes(f.status) || (!posts.includes(f) && (f.status !== 'added' || !/^assets\/(images|files)\/uploads\/[a-z0-9-]+\.(png|jpg|jpeg|gif|webp|avif|pdf|docx?|xlsx?|pptx?|txt|md|csv|zip|mp4|webm|ogv|mp3|m4a|wav|ogg|oga|flac)$/i.test(f.filename))))) throw new PortalError(403, '稿件包含文章和媒体以外的改动，不能从这里发布。');
  const source = await identity.gh(`/repos/${pr.head.repo.full_name}/contents/${posts[0].filename}?ref=${pr.head.sha}`);
  return { files, source:decodeGithub(source.content), path:posts[0].filename };
}
async function handlePortal(request, env, fetcher) {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== env.CMS_ORIGIN) return errorResponse('Origin not allowed',403);
  if (request.method === 'OPTIONS') return portalJson({},200,origin);
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(env.REPOSITORY || '')) throw new PortalError(503,'网站服务尚未配置。');
    const identity = await portalIdentity(request,env,fetcher), {gh,user,role,repo} = identity;
    const url = new URL(request.url), resource = url.pathname;
    const commentsRoute=resource.match(/^\/api\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)\/comments(?:\/([^/]+))?$/);
    if(commentsRoute){const result=await handleComments(request,env,identity,commentsRoute[1],commentsRoute[2]);return portalJson(result.data,result.status,origin);}
    if (resource === '/api/session' && request.method === 'GET') return portalJson({login:user.login,id:actorId(identity),avatar:user.avatar_url,role,comments:Boolean(env.COMMENTS_DB?.prepare),ai:role==='admin' && Boolean(env.DEEPSEEK_API_KEY)},200,origin);
    if(resource==='/api/submissions'&&request.method==='GET'){
      const page=Math.max(1,Math.min(100,Number(url.searchParams.get('page'))||1));
      const prs=await gh('/repos/'+env.REPOSITORY+'/pulls?state=all&base=main&sort=updated&per_page=100&page='+page),publications=await readPublications(gh,env),items=[];
      for(const pr of prs){if(!pr.title?.startsWith('[投稿] ')||!/^lemoncat\/(submission|review)-/.test(pr.head?.ref||''))continue;
        let author;try{author=await submissionAuthor(pr,env);}catch{continue;}if(role!=='admin'&&author.id!==user.id)continue;
        const publication=publications.find(x=>x.submission===pr.number);
        items.push({number:pr.number,title:pr.title.slice(5),author:author.login,state:publication||pr.merged_at?'approved':pr.state==='open'?'pending':'closed',sha:pr.head.sha,date:pr.updated_at,url:pr.html_url,...(publication?{publication}:{})});
      }return portalJson({items,hasMore:prs.length===100},200,origin);
    }
    if (resource === '/api/submissions' && request.method === 'POST') {
      const input = await readPortalBody(request), {documents,post} = await submissionDocuments(input,identity,env);
      const source = await gh(`/repos/${env.REPOSITORY}/git/ref/heads/main`);
      if(env.GITHUB_CONTENT_TOKEN){
        const writer=(resource,method,body)=>contentWriter(env,fetcher,resource,method,body),branch='lemoncat/review-'+user.id+'-'+crypto.randomUUID();
        const sha=await commitPortalFiles(writer,env.REPOSITORY,source.object.sha,documents,'Save review article: '+post.title);
        await writer('/repos/'+env.REPOSITORY+'/git/refs','POST',{ref:'refs/heads/'+branch,sha});
        const marker=await submissionMarker({kind:'submission',repo:env.REPOSITORY,branch,id:user.id,login:user.login},env);
        const pr=await writer('/repos/'+env.REPOSITORY+'/pulls','POST',{title:'[投稿] '+post.title,body:'由 '+user.login+' 提交，等待 Lemoncat 审核。\n\n'+marker,head:branch,base:'main'});
        return portalJson({number:pr.number,url:pr.html_url,sha,uploadedAt:post.uploaded_at,staging:'repository'},201,origin);
      }
      const forkName = env.REPOSITORY.split('/')[1];
      let fork;
      try { fork = await gh(`/repos/${user.login}/${forkName}`); } catch(error) { if(error.status!==404)throw error; fork = await gh(`/repos/${env.REPOSITORY}/forks`,'POST',{}); }
      if (fork.full_name?.toLowerCase()===env.REPOSITORY.toLowerCase()) throw new PortalError(400,'管理员请直接发布文章。');
      if (!fork.fork || fork.parent?.full_name?.toLowerCase()!==env.REPOSITORY.toLowerCase() || fork.owner?.login?.toLowerCase()!==user.login.toLowerCase()) throw new PortalError(409,'同名仓库不属于本站投稿空间，请先在 GitHub 调整同名仓库。');
      const branch = 'lemoncat/submission-' + crypto.randomUUID();
      try { await gh(`/repos/${fork.full_name}/git/refs`,'POST',{ref:'refs/heads/'+branch,sha:source.object.sha}); } catch(error) { if(error.status===422 || error.status===409) throw new PortalError(409,'GitHub 正在准备你的稿件空间，请稍后再次提交。'); throw error; }
      const sha = await commitPortalFiles(gh,fork.full_name,source.object.sha,documents,'Submit article: '+post.title);
      await gh(`/repos/${fork.full_name}/git/refs/heads/${branch}`,'PATCH',{sha,force:false});
      const pr = await gh(`/repos/${env.REPOSITORY}/pulls`,'POST',{title:'[投稿] '+post.title,body:'由 '+user.login+' 提交，等待 Lemoncat 审核。\n\n知识模块：'+post.module,head:user.login+':'+branch,base:'main'});
      return portalJson({number:pr.number,url:pr.html_url,sha,uploadedAt:post.uploaded_at,staging:'fork'},201,origin);
    }
    const submissionMatch = resource.match(/^\/api\/submissions\/(\d+)$/);
    if (submissionMatch && request.method==='GET') {
      const pr = await getPortalSubmission(identity,env,submissionMatch[1]);
      const content = await inspectPortalSubmission(identity,env,pr);
      const publication=(await readPublications(gh,env)).find(x=>x.submission===pr.number);
      return portalJson({number:pr.number,title:pr.title.slice(5),author:pr.portalAuthor.login,authorId:'github:'+pr.portalAuthor.id,sha:pr.head.sha,state:publication?'approved':pr.state,publication,canDelete:role==='admin'||pr.portalAuthor.id===user.id,check:role==='admin'&&pr.state==='open'&&!publication?await submissionCheck(identity,env,pr):null,source:content.source,mediaBase:`https://raw.githubusercontent.com/${pr.head.repo.full_name}/${pr.head.sha}/`,files:content.files.map(f=>({path:f.filename,status:f.status}))},200,origin);
    }
    if(submissionMatch&&request.method==='PATCH'){
      const pr=await getPortalSubmission(identity,env,submissionMatch[1]);
      if(pr.state!=='open'||pr.portalAuthor.id!==user.id)throw new PortalError(403,'只能修改自己尚未审核的投稿。');
      if((await readPublications(gh,env)).some(x=>x.submission===pr.number))throw new PortalError(409,'文章已审核通过，不能再修改待审版本。');
      const current=await inspectPortalSubmission(identity,env,pr),input=await readPortalBody(request),{documents,post}=await submissionDocuments(input,identity,env,current.source);
      if(current.path!=='content/posts/'+post.slug+'.md'||input.sha!==pr.head.sha)throw new PortalError(409,'稿件已经变化，请刷新；修改时请保持文章地址。');
      const writer=pr.head.repo.full_name.toLowerCase()===env.REPOSITORY.toLowerCase()?(r,m,b)=>contentWriter(env,fetcher,r,m,b):gh;
      const sha=await commitPortalFiles(writer,pr.head.repo.full_name,pr.head.sha,documents,'Update review article: '+post.title);
      await writer('/repos/'+pr.head.repo.full_name+'/git/refs/heads/'+pr.head.ref,'PATCH',{sha,force:false});
      await writer('/repos/'+env.REPOSITORY+'/pulls/'+pr.number,'PATCH',{title:'[投稿] '+post.title});
      return portalJson({number:pr.number,sha,uploadedAt:post.uploaded_at},200,origin);
    }
    const reviewMatch=resource.match(/^\/api\/submissions\/(\d+)\/review$/);
    if(reviewMatch&&request.method==='POST'){
      needAdmin(identity);
      const input=await readPortalBody(request),pr=await getPortalSubmission(identity,env,reviewMatch[1]);
      const already=(await readPublications(gh,env)).find(x=>x.submission===pr.number&&x.reviewedSha===input.sha);
      if(already&&input.action==='publish')return portalJson({state:'approved',publication:already,message:'已经审核通过，请查看部署进度。'},200,origin);
      if(pr.state!=='open'||input.sha!==pr.head.sha)throw new PortalError(409,'稿件已变化或已处理，请重新打开。');
      if(input.action==='reject'){await gh('/repos/'+env.REPOSITORY+'/pulls/'+pr.number,'PATCH',{state:'closed'});return portalJson({state:'closed'},200,origin);}
      if(input.action!=='publish')throw new PortalError(400,'审核操作无效。');
      const inspected=await inspectPortalSubmission(identity,env,pr),owner=await checkSubmissionOwner(identity,env,pr,inspected),check=await submissionCheck(identity,env,pr);
      if(check.status!=='success'){const e=new PortalError(409,check.message);e.check=check;throw e;}
      const docs=[],media=inspected.files.filter(f=>f.filename!==inspected.path);let bytes=0;
      for(let start=0;start<media.length;start+=3){docs.push(...await Promise.all(media.slice(start,start+3).map(async f=>{
        if(pr.head.repo.full_name.toLowerCase()===env.REPOSITORY.toLowerCase()&&/^[a-f0-9]{40}$/.test(f.sha||''))return {path:f.filename,sha:f.sha};
        const blob=await gh('/repos/'+pr.head.repo.full_name+'/git/blobs/'+f.sha);if(blob.encoding!=='base64'||typeof blob.content!=='string')throw new PortalError(400,'附件无法读取。');
        bytes+=Number(blob.size)||0;if(bytes>20*1024*1024)throw new PortalError(413,'附件总量超过 20 MB。');
        return {path:f.filename,encoding:'base64',content:blob.content.replace(/\s/g,'')};
      }))); }
      const publication=await publishDocuments(identity,env,docs,inspected.source,owner,{submission:pr.number,reviewedSha:pr.head.sha});
      let message='审核通过，正在部署；上线后会自动更新状态。';
      try{await gh('/repos/'+env.REPOSITORY+'/pulls/'+pr.number,'PATCH',{state:'closed'});}catch{message+='稿件状态同步暂未完成，刷新即可，无需再次发布。';}
      return portalJson({state:'approved',publication,message},200,origin);
    }
    if(resource==='/api/publications'&&request.method==='GET')return portalJson({items:(await readPublications(gh,env)).filter(x=>role==='admin'||x.authorId===actorId(identity))},200,origin);
    const publicationMatch=resource.match(/^\/api\/publications\/([a-f0-9-]{36})$/);
    if(publicationMatch&&request.method==='GET'){
      const item=(await readPublications(gh,env)).find(x=>x.id===publicationMatch[1]);if(!item)throw new PortalError(404,'没有找到这次发布。');
      if(role!=='admin'&&item.authorId!==actorId(identity))throw new PortalError(403,'只能查看自己的发布进度。');
      return portalJson(await publicationStatus(identity,env,item,fetcher),200,origin);
    }
    if(resource==='/api/ownership'&&request.method==='GET'){
      const owners=await readOwners(gh,env),id=actorId(identity);
      return portalJson({owned:Object.entries(owners).filter(([,p])=>id&&p.id===id).map(([slug])=>slug)},200,origin);
    }
    const permission=resource.match(/^\/api\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)\/permissions$/);
    if(permission&&request.method==='GET'){
      if(role==='admin')return portalJson({canDelete:true,canEdit:true},200,origin);
      const owners=await readOwners(gh,env),id=actorId(identity);
      return portalJson({canDelete:Boolean(id&&ownerOf(owners,permission[1])?.id===id),canEdit:false},200,origin);
    }
    if(submissionMatch&&request.method==='DELETE'){
      const pr=await getPortalSubmission(identity,env,submissionMatch[1]);
      if(pr.merged_at||(await readPublications(gh,env)).some(x=>x.submission===pr.number))throw new PortalError(409,'文章已审核通过，请到已发布文章中删除。');
      const writer=pr.head.repo.full_name.toLowerCase()===env.REPOSITORY.toLowerCase()?(r,m,b)=>contentWriter(env,fetcher,r,m,b):gh;
      await writer('/repos/'+env.REPOSITORY+'/pulls/'+pr.number,'PATCH',{state:'closed'});
      return portalJson({deleted:true},200,origin);
    }
    if(resource==='/api/articles'&&request.method==='POST'){
      needAdmin(identity);const input=await readPortalBody(request),slug=input.post?.slug;
      if(!postSlug(slug))throw new PortalError(400,'文章地址无效。');
      let previous='';try{previous=decodeGithub((await gh('/repos/'+env.REPOSITORY+'/contents/content/posts/'+slug+'.md?ref=main')).content);}catch(e){if(e.status!==404)throw e;}
      const {documents,post}=await submissionDocuments(input,identity,env,previous),owners=await readOwners(gh,env);
      const owner={...(ownerOf(owners,slug)||{id:actorId(identity),login:user.login}),slug},source=documents.pop().content;
      const publication=await publishDocuments(identity,env,documents,source,owner);
      return portalJson({slug:post.slug,sha:publication.sha,publication,uploadedAt:publication.uploadedAt,message:'文章已保存，正在部署。'},201,origin);
    }
    const deleteMatch=resource.match(/^\/api\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if(deleteMatch && request.method==='DELETE') {
      const slug=deleteMatch[1],id=actorId(identity),owners=role==='admin'?null:await readOwners(gh,env);
      if(role!=='admin'&&(!id||ownerOf(owners,slug)?.id!==id))throw new PortalError(403,'只能删除自己写的文章。');
      const file=await gh(`/repos/${env.REPOSITORY}/contents/content/posts/${slug}.md?ref=main`);
      if(role!=='admin'&&sourceActor(decodeGithub(file.content))!==id)throw new PortalError(403,'文章作者记录不一致，请联系管理员。');
      const resource=`/repos/${env.REPOSITORY}/contents/content/posts/${slug}.md`,body={message:'Delete article: '+slug,sha:file.sha,branch:'main'};
      if(role==='admin')await gh(resource,'DELETE',body);else await contentWriter(env,fetcher,resource,'DELETE',body);
      return portalJson({deleted:true},200,origin);
    }
    if(resource==='/api/assist' && request.method==='POST') {
      needAdmin(identity);
      if(!env.DEEPSEEK_API_KEY) throw new PortalError(503,'DeepSeek 尚未配置，请先添加 API Key。');
      const input=await readPortalBody(request);
      if(typeof input.prompt!=='string' || !input.prompt.trim() || input.prompt.length>6000) throw new PortalError(400,'请输入 6000 字以内的需求。');
      const response=await fetcher('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.DEEPSEEK_API_KEY},body:JSON.stringify({model:env.DEEPSEEK_MODEL || 'deepseek-flash',messages:[{role:'system',content:'你是 Lemoncat 的网站与写作助手。用中文给出清晰的设计、代码或写作建议。提供建议，不声称已替用户发布或修改网站。'},{role:'user',content:input.prompt}],max_tokens:1800,stream:false}),signal:AbortSignal.timeout(45000)});
      if(!response.ok) throw new PortalError(502,'DeepSeek 请求未完成，请检查密钥、余额或稍后重试。');
      const data=await response.json();
      return portalJson({text:data.choices?.[0]?.message?.content || '没有返回内容，请重试。'},200,origin);
    }
    throw new PortalError(404,'接口不存在。');
  } catch(error) { return portalJson({message:error instanceof PortalError ? error.message : '服务暂时不可用，请稍后重试。',...(error.check?{check:error.check}:{}),...(error.code?{code:error.code}:{})},error instanceof PortalError ? error.status : 502,origin); }
}

// Article ownership is maintained by the server in a separate file.
// Submission PRs may not modify this file, so displayed names cannot grant delete rights.
const actorId=identity=>Number.isSafeInteger(identity.user.id)?'github:'+identity.user.id:null;
async function readOwners(gh,env,ref='main'){
  try{
    const file=await gh('/repos/'+env.REPOSITORY+'/contents/content/ownership.json?ref='+ref);
    const data=JSON.parse(decodeGithub(file.content));
    if(data.version!==1||!data.articles||Array.isArray(data.articles))throw new PortalError(503,'文章作者记录格式异常，请联系管理员。');
    for(const [slug,item]of Object.entries(data.articles))if(!postSlug(slug)||!/^github:\d+$/.test(item?.id||''))throw new PortalError(503,'文章作者记录格式异常，请联系管理员。');
    return data.articles;
  }catch(e){if(e.status===404)return {};throw e;}
}
function ownerOf(owners,slug){return Object.hasOwn(owners,slug)?owners[slug]:null;}
function sourceActor(source){
  const front=/^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1]||'';
  try{const value=JSON.parse(front.match(/^author_id:\s*(.+)$/m)?.[1]||'null');return typeof value==='string'?value:null;}catch{return null;}
}
async function checkSubmissionOwner(identity,env,pr,content){
  const slug=content.path.split('/').pop().replace(/\.md$/,'');
  const owners=await readOwners(identity.gh,env),owner=ownerOf(owners,slug);
  let exists=false;
  try{await identity.gh('/repos/'+env.REPOSITORY+'/contents/'+content.path+'?ref=main');exists=true;}catch(e){if(e.status!==404)throw e;}
  const person=pr.portalAuthor||pr.user;
  const author=Number.isSafeInteger(person?.id)?'github:'+person.id:null;
  if(exists&&(!author||owner?.id!==author))throw new PortalError(403,'稿件试图覆盖别人的文章，请使用新的文章地址。');
  return {slug,id:author,login:person.login};
}
async function contentWriter(env,fetcher,resource,method='GET',body){
  if(!env.GITHUB_CONTENT_TOKEN)throw new PortalError(503,'内容服务尚未配置，请联系 Lemoncat 添加内容授权。');
  const response=await fetcher('https://api.github.com'+resource,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+env.GITHUB_CONTENT_TOKEN,'User-Agent':'lemoncat-content','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=response.status===204?{}:await response.json();
  if(!response.ok)throw new PortalError(response.status===409?409:502,response.status===409?'文章已变化，请刷新后再删除。':'仓库操作未完成；预审投稿需要内容令牌具备 Contents 和 Pull requests 读写权限。');
  return data;
}
async function submissionCheck(identity,env,pr){
  const runs=await identity.gh('/repos/'+env.REPOSITORY+'/actions/runs?head_sha='+pr.head.sha+'&event=pull_request&per_page=30');
  const run=(runs.workflow_runs||[]).filter(r=>r.head_sha===pr.head.sha&&r.path==='.github/workflows/pages.yml'&&r.event==='pull_request').sort((a,b)=>b.id-a.id)[0];
  const detailUrl='https://github.com/'+env.REPOSITORY+'/pull/'+pr.number+'/checks';
  if(!run)return {status:'queued',message:'自动检查尚未开始，请稍后刷新。',url:detailUrl};
  const url='https://github.com/'+env.REPOSITORY+'/actions/runs/'+run.id;
  if(run.conclusion==='action_required')return {status:'approval_required',message:'等待你在 GitHub 批准外部投稿运行检查。批准前不会开始，请打开检查详情，点击“Approve and run workflows”。',url};
  if(run.status!=='completed')return {status:'running',message:'自动检查正在排队或运行。最近检查约 10 秒，整次运行约半分钟，请稍后刷新。',url};
  if(run.conclusion!=='success')return {status:'failed',message:'自动检查失败，请打开检查详情查看原因；修改稿件后会重新检查。',url};
  const jobs=await identity.gh('/repos/'+env.REPOSITORY+'/actions/runs/'+run.id+'/jobs?filter=latest&per_page=100');
  if(!jobs.jobs?.some(j=>j.name==='build'&&j.conclusion==='success'))return {status:'failed',message:'本次运行没有通过网页构建检查。',url};
  return {status:'success',message:'自动检查已通过，可以审核发布。',url};
}

// Article comments use the existing authenticated GitHub identity and a D1 binding.
const commentId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function commentError(status,message,code){const error=new PortalError(status,message);error.code=code;return error;}
async function commentInput(request){
  if(Number(request.headers.get('Content-Length')||0)>12000)throw new PortalError(413,'评论内容过长。');
  const raw=await request.text();if(raw.length>6000)throw new PortalError(413,'评论内容过长。');
  let input;try{input=JSON.parse(raw);}catch{throw new PortalError(400,'评论格式无效。');}
  if(!input||typeof input.body!=='string')throw new PortalError(400,'请填写评论内容。');
  const body=input.body.replace(/\r\n?/g,'\n').trim();
  if(!body||body.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body))throw new PortalError(400,'评论需要 1 至 2000 字。');
  return {...input,body};
}
function commentView(row,identity){
  const own=row.author_id===actorId(identity);
  return {id:row.id,body:row.body,author:row.author_login,avatar:'https://avatars.githubusercontent.com/u/'+row.author_id.slice(7)+'?s=80&v=4',
    createdAt:row.created_at,updatedAt:row.updated_at,canEdit:own,canDelete:own||identity.role==='admin'};
}
async function publishedCommentArticle(identity,env,slug){
  if(!postSlug(slug))throw new PortalError(400,'文章地址无效。');
  const source=await identity.gh('/repos/'+env.REPOSITORY+'/contents/content/posts/'+slug+'.md?ref=main');
  const front=/^---\r?\n([\s\S]*?)\r?\n---/.exec(decodeGithub(source.content));
  if(!front||/^draft:\s*true\s*$/im.test(front[1]))throw new PortalError(404,'文章尚未发布或已删除。');
}
async function handleComments(request,env,identity,slug,id){
  if(!env.COMMENTS_DB?.prepare)throw commentError(503,'评论尚未开放，请稍后再来。','COMMENTS_NOT_CONFIGURED');
  if(id&&!commentId(id))throw new PortalError(400,'评论地址无效。');
  const method=request.method;
  if((!id&&!['GET','POST'].includes(method))||(id&&!['PATCH','DELETE'].includes(method)))throw new PortalError(405,'不支持这个评论操作。');
  const actor=actorId(identity);
  if(!actor)throw new PortalError(403,'无法确认评论账号，请重新登录。');
  await publishedCommentArticle(identity,env,slug);
  const db=env.COMMENTS_DB;
  try{
    if(!id&&method==='GET'){
      const url=new URL(request.url),raw=url.searchParams.get('cursor');
      let cursor=null;
      if(raw){
        try{cursor=JSON.parse(new TextDecoder().decode(unb64(raw)));}catch{throw new PortalError(400,'评论分页地址无效，请刷新。');}
        if(!Array.isArray(cursor)||cursor.length!==2||!Number.isSafeInteger(cursor[0])||cursor[0]<0||!commentId(cursor[1]))throw new PortalError(400,'评论分页地址无效，请刷新。');
      }
      const size=20;
      const statement=cursor
        ?db.prepare('SELECT * FROM comments WHERE article_slug=?1 AND (created_at<?2 OR (created_at=?2 AND id<?3)) ORDER BY created_at DESC,id DESC LIMIT ?4').bind(slug,cursor[0],cursor[1],size+1)
        :db.prepare('SELECT * FROM comments WHERE article_slug=?1 ORDER BY created_at DESC,id DESC LIMIT ?2').bind(slug,size+1);
      const [page,count]=await db.batch([statement,db.prepare('SELECT COUNT(*) AS total FROM comments WHERE article_slug=?1').bind(slug)]);
      const rows=page.results.slice(0,size),last=rows.at(-1);
      return {status:200,data:{items:rows.map(row=>commentView(row,identity)),total:count.results[0].total,nextCursor:page.results.length>size?b64(encoder.encode(JSON.stringify([last.created_at,last.id]))):null}};
    }
    if(!id&&method==='POST'){
      const input=await commentInput(request);
      if(!commentId(input.requestId))throw new PortalError(400,'提交标识无效，请刷新后重试。');
      const previous=await db.prepare('SELECT * FROM comments WHERE id=?1').bind(input.requestId).first();
      const same=row=>row&&row.author_id===actor&&row.article_slug===slug&&row.body===input.body;
      if(previous){
        if(!same(previous))throw new PortalError(409,'这次提交已经变化，请刷新后重试。');
        return {status:200,data:{item:commentView(previous,identity),created:false}};
      }
      const now=Date.now(),reservation=crypto.randomUUID();
      // D1 batch is transactional; a request-specific reservation survives deletion.
      const [,result]=await db.batch([
        db.prepare('INSERT INTO comment_rate_limits (author_id,reservation_id,last_post_at) VALUES (?1,?2,?3) ON CONFLICT(author_id) DO UPDATE SET reservation_id=excluded.reservation_id,last_post_at=excluded.last_post_at WHERE comment_rate_limits.last_post_at<=?4').bind(actor,reservation,now,now-20000),
        db.prepare('INSERT INTO comments (id,article_slug,author_id,author_login,body,created_at,updated_at) SELECT ?1,?2,?3,?4,?5,?6,?6 WHERE EXISTS (SELECT 1 FROM comment_rate_limits WHERE author_id=?3 AND reservation_id=?7) ON CONFLICT(id) DO NOTHING').bind(input.requestId,slug,actor,identity.user.login,input.body,now,reservation)
      ]);
      const row=await db.prepare('SELECT * FROM comments WHERE id=?1').bind(input.requestId).first();
      if(!result.meta.changes){
        if(same(row))return {status:200,data:{item:commentView(row,identity),created:false}};
        if(row)throw new PortalError(409,'提交标识已使用，请刷新后重试。');
        throw commentError(429,'评论发表得太快，请间隔 20 秒再试。','COMMENTS_RATE_LIMITED');
      }
      return {status:201,data:{item:commentView(row,identity),created:true}};
    }
    const row=await db.prepare('SELECT * FROM comments WHERE id=?1 AND article_slug=?2').bind(id,slug).first();
    if(!row)throw new PortalError(404,'评论已删除或不属于这篇文章。');
    if(method==='PATCH'){
      if(row.author_id!==actor)throw new PortalError(403,'只能编辑自己的评论。');
      const input=await commentInput(request);
      if(input.updatedAt!==row.updated_at)throw new PortalError(409,'评论已变化，请刷新后再编辑。');
      const updated=Math.max(Date.now(),row.updated_at+1);
      const result=await db.prepare('UPDATE comments SET body=?1,updated_at=?2 WHERE id=?3 AND article_slug=?4 AND author_id=?5 AND updated_at=?6')
        .bind(input.body,updated,id,slug,actor,input.updatedAt).run();
      if(!result.meta.changes)throw new PortalError(409,'评论已变化，请刷新后再编辑。');
      return {status:200,data:{item:commentView({...row,body:input.body,updated_at:updated},identity)}};
    }
    if(identity.role!=='admin'&&row.author_id!==actor)throw new PortalError(403,'只能删除自己的评论。');
    const statement=identity.role==='admin'
      ?db.prepare('DELETE FROM comments WHERE id=?1 AND article_slug=?2').bind(id,slug)
      :db.prepare('DELETE FROM comments WHERE id=?1 AND article_slug=?2 AND author_id=?3').bind(id,slug,actor);
    await statement.run();
    return {status:200,data:{deleted:true}};
  }catch(error){
    if(error instanceof PortalError)throw error;
    throw commentError(503,'评论暂时不可用，请稍后重试。','COMMENTS_UNAVAILABLE');
  }
}

// Server-owned metadata, staging authors and deployment evidence.
function chinaDay(value=new Date().toISOString()){return new Date(Date.parse(value)+8*3600000).toISOString().slice(0,10);}
function sourceField(source,key){
 const front=/^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1]||'',raw=front.match(new RegExp('^'+key+':\\s*(.*)$','m'))?.[1]?.trim();
 if(!raw)return '';try{const value=JSON.parse(raw);return typeof value==='string'?value:'';}catch{return raw.replace(/^['"]|['"]$/g,'');}
}
function setSourceFields(source,fields){
 const match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);if(!match)throw new PortalError(400,'文章元数据无效。');
 const lines=match[1].split(/\r?\n/).filter(line=>!Object.keys(fields).some(key=>line.startsWith(key+':')));
 return '---\n'+lines.join('\n').trimEnd()+'\n'+Object.entries(fields).map(([k,v])=>k+': '+JSON.stringify(v)).join('\n')+'\n---\n'+match[2];
}
async function submissionMarker(meta,env){
 const payload=b64(encoder.encode(JSON.stringify(meta))),signature=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env.OAUTH_STATE_SECRET),encoder.encode(payload))));
 return '<!--lemoncat-submission:'+payload+'.'+signature+'-->';
}
async function submissionAuthor(pr,env){
 if(!pr.head?.ref?.startsWith('lemoncat/review-'))return pr.user;
 if(pr.head.repo?.full_name?.toLowerCase()!==env.REPOSITORY.toLowerCase())throw new PortalError(403,'预审空间不正确。');
 const signed=pr.body?.match(/<!--lemoncat-submission:([\w-]+)\.([\w-]+)-->/);if(!signed||signed[1].length>2048)throw new PortalError(403,'投稿作者记录无效。');
 let data;try{if(!await crypto.subtle.verify('HMAC',await signingKey(env.OAUTH_STATE_SECRET),unb64(signed[2]),encoder.encode(signed[1])))throw Error('signature');data=JSON.parse(new TextDecoder().decode(unb64(signed[1])));}catch{throw new PortalError(403,'投稿作者记录校验失败。');}
 if(data.kind!=='submission'||data.repo!==env.REPOSITORY||data.branch!==pr.head.ref||!Number.isSafeInteger(data.id)||!/^[\w-]{1,100}$/.test(data.login||''))throw new PortalError(403,'投稿作者记录不一致。');
 return {id:data.id,login:data.login};
}
async function readPublications(gh,env,ref='main'){
 try{
  const file=await gh('/repos/'+env.REPOSITORY+'/contents/content/publications.json?ref='+ref),data=JSON.parse(decodeGithub(file.content));
  if(data.version!==1||!Array.isArray(data.items)||data.items.length>200||data.items.some(x=>!postSlug(x.slug)||!/^[a-f0-9-]{36}$/.test(x.id)||!/^github:\d+$/.test(x.authorId||'')))throw new PortalError(503,'发布记录格式异常。');
  return data.items;
 }catch(e){if(e.status===404)return [];throw e;}
}
async function publishDocuments(identity,env,documents,source,owner,extra={}){
 const gh=identity.gh,parent=await gh('/repos/'+env.REPOSITORY+'/git/ref/heads/main'),ref=parent.object.sha;
 const [owners,records]=await Promise.all([readOwners(gh,env,ref),readPublications(gh,env,ref)]);
 const concurrent=records.find(x=>extra.submission&&x.submission===extra.submission&&x.reviewedSha===extra.reviewedSha);if(concurrent)return concurrent;
 let previous='';try{previous=decodeGithub((await gh('/repos/'+env.REPOSITORY+'/contents/content/posts/'+owner.slug+'.md?ref='+ref)).content);}catch(e){if(e.status!==404)throw e;}
 if(extra.submission&&previous&&ownerOf(owners,owner.slug)?.id!==owner.id)throw new PortalError(403,'文章作者记录已变化，请重新审核。');
 if(documents.length){const parentCommit=await gh('/repos/'+env.REPOSITORY+'/git/commits/'+ref),tree=await gh('/repos/'+env.REPOSITORY+'/git/trees/'+parentCommit.tree.sha+'?recursive=1');if(tree.truncated||!Array.isArray(tree.tree))throw new PortalError(409,'文件目录尚未完整，请稍后重试。');const existing=new Set(tree.tree.map(x=>x.path));if(documents.some(x=>existing.has(x.path)))throw new PortalError(409,'附件路径已经存在，请重新上传，避免覆盖已有文件。');}
 const at=new Date().toISOString(),id=crypto.randomUUID(),uploadedAt=sourceField(previous,'uploaded_at')||sourceField(source,'uploaded_at')||at;
 const publication={id,slug:owner.slug,title:sourceField(source,'title'),authorId:owner.id,author:owner.login,uploadedAt,publishedAt:sourceField(previous,'published_at')||at,updatedAt:at,...extra};
 const stamped=setSourceFields(source,{date:sourceField(previous,'date')||chinaDay(at),updated:[sourceField(previous,'date')||'',chinaDay(at)].sort().at(-1),uploaded_at:uploadedAt,published_at:publication.publishedAt,updated_at:at,publication_id:id,author:owner.login,author_id:owner.id});
 const sha=await commitPortalFiles(gh,env.REPOSITORY,ref,[...documents,
  {path:'content/posts/'+owner.slug+'.md',encoding:'utf-8',content:stamped},
  {path:'content/ownership.json',encoding:'utf-8',content:JSON.stringify({version:1,articles:{...owners,[owner.slug]:{id:owner.id,login:owner.login}}},null,2)+'\n'},
  {path:'content/publications.json',encoding:'utf-8',content:JSON.stringify({version:1,items:[publication,...records.filter(x=>x.slug!==owner.slug)].slice(0,200)},null,2)+'\n'}
 ],'Publish article: '+publication.title);
 await gh('/repos/'+env.REPOSITORY+'/git/refs/heads/main','PATCH',{sha,force:false});return {...publication,sha};
}
async function publicationStatus(identity,env,item,fetcher){
 const result={id:item.id,slug:item.slug,status:'queued',message:'已保存到仓库，等待部署开始。'};
 try{const response=await fetcher(env.CMS_ORIGIN+'/build-info.json?publication='+item.id,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(response.ok){const live=await response.json();if(live.publications?.some(x=>x.id===item.id&&x.slug===item.slug))return {...result,status:'success',message:'已上线，可在网站阅读。',url:env.CMS_ORIGIN+'/article/'+item.slug+'/',commit:live.commit};}}catch{}
 try{await identity.gh('/repos/'+env.REPOSITORY+'/contents/content/posts/'+item.slug+'.md?ref=main');}catch(e){if(e.status===404)return {...result,status:'removed',message:'文章已移除。'};throw e;}
 const commits=await identity.gh('/repos/'+env.REPOSITORY+'/commits?path='+encodeURIComponent('content/posts/'+item.slug+'.md')+'&per_page=1');if(!commits.length)return {...result,status:'removed',message:'文章已移除。'};
 const sha=commits[0].sha,runs=await identity.gh('/repos/'+env.REPOSITORY+'/actions/runs?head_sha='+sha+'&event=push&per_page=20');
 const run=(runs.workflow_runs||[]).filter(x=>x.head_sha===sha&&x.path==='.github/workflows/pages.yml'&&x.event==='push').sort((a,b)=>b.id-a.id)[0];if(!run)return result;
 result.url='https://github.com/'+env.REPOSITORY+'/actions/runs/'+run.id;
 if(run.status==='completed'&&run.conclusion!=='success')return {...result,status:'failed',message:'部署未完成，请查看详情；文章已保存在仓库。'};
 if(run.status==='completed')return {...result,status:'deploying',message:'部署完成，等待网站资源更新。'};
 const jobs=await identity.gh('/repos/'+env.REPOSITORY+'/actions/runs/'+run.id+'/jobs?filter=latest&per_page=100'),build=jobs.jobs?.find(x=>x.name==='build');
 return build?.conclusion==='success'?{...result,status:'deploying',message:'构建检查通过，正在部署网页。'}:{...result,status:'building',message:'正在检查并构建网页。'};
}
