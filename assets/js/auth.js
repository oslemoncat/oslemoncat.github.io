const WORKER = 'https://lemoncat-cms-auth.zhounanxuan071106.workers.dev';
const KEY = 'lemoncat-session-v1';
export function token() {
  try { const session=JSON.parse(localStorage.getItem(KEY)); if(session?.expires>Date.now() && typeof session.token==='string')return session.token; } catch {}
  return '';
}
export function logout() { localStorage.removeItem(KEY); location.assign('/login/'); }
export async function api(path,options={}){
 const current=token();if(!current)throw new Error('请先登录。');
 const body=options.body?JSON.stringify(options.body):null;
 const headers={Authorization:'Bearer '+current,...(body?{'Content-Type':'application/json'}:{})};
 let response;
 if(options.onUploadProgress&&body){
  response=await new Promise((resolve,reject)=>{
   const request=new XMLHttpRequest();request.open(options.method||'POST',WORKER+path);
   for(const [name,value]of Object.entries(headers))request.setRequestHeader(name,value);
   request.timeout=120000;
   request.upload.addEventListener('progress',e=>{if(e.lengthComputable)options.onUploadProgress(e.loaded/e.total);});
   request.upload.addEventListener('load',()=>options.onUploadProgress(1));
   request.addEventListener('load',()=>resolve({status:request.status,ok:request.status>=200&&request.status<300,json:async()=>JSON.parse(request.responseText)}));
   request.addEventListener('error',()=>reject(new Error('网络连接中断，稿件仍保留在页面；请查看投稿状态后重试。')));
   request.addEventListener('timeout',()=>reject(new Error('保存响应超时，请先查看投稿是否已收到，再决定是否重试。')));
   request.send(body);
  });
 }else response=await fetch(WORKER+path,{method:options.method||'GET',headers,...(body?{body}:{}),cache:'no-store'});
 let data;try{data=await response.json();}catch{throw new Error('登录服务需要升级，请先部署新版 Worker。');}
 if(response.status===401)localStorage.removeItem(KEY);
 if(!response.ok){const error=new Error(data.message||'操作未完成，请稍后重试。');Object.assign(error,{check:data.check,status:response.status,code:data.code});throw error;}
 return data;
}
export async function restoreSession(){if(!token())return null;return api('/api/session');}
export function login() {
  return new Promise((resolve,reject)=>{
    const url=WORKER+'/auth?provider=github&site_id=oslemoncat.github.io&mode=portal';
    const popup=window.open(url,'lemoncat-signin','popup,width=700,height=760');
    if(!popup){reject(new Error('请允许本站弹窗，再点击登录。'));return;}
    let timer;
    const cleanup=()=>{clearInterval(timer);window.removeEventListener('message',receive);};
    const receive=async event=>{
      if(event.origin!==WORKER || event.source!==popup || typeof event.data!=='string')return;
      if(event.data==='authorizing:github'){popup.postMessage('authorizing:github',WORKER);return;}
      const match=event.data.match(/^authorization:github:(success|error):([\s\S]+)$/);if(!match)return;
      cleanup();
      try{
        const data=JSON.parse(match[2]);if(match[1]!=='success'||!data.token)throw new Error(data.message||'GitHub 登录未完成。');
        localStorage.setItem(KEY,JSON.stringify({token:data.token,expires:Date.now()+8*3600_000}));
        const user=await restoreSession();popup.close();resolve(user);
      }catch(error){reject(error);}
    };
    window.addEventListener('message',receive);
    const started=Date.now();timer=setInterval(()=>{if(popup.closed||Date.now()-started>600_000){cleanup();reject(new Error('登录窗口已关闭或超时，请重试。'));}},750);
  });
}
window.addEventListener('storage',event=>{if(event.key===KEY&&!token())location.assign('/login/');});