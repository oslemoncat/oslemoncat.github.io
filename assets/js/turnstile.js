import {el} from './util.js?v=20261015-protection';
let loading;
function sdk(){
  if(window.turnstile)return Promise.resolve(window.turnstile);
  if(!loading)loading=new Promise((resolve,reject)=>{
    const script=el('script',{src:'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',async:true});
    const fail=()=>{clearTimeout(timer);script.remove();loading=null;reject(new Error('人机验证加载失败，请检查网络后重试。'));};
    const timer=setTimeout(fail,15000);
    script.addEventListener('load',()=>{clearTimeout(timer);if(window.turnstile)resolve(window.turnstile);else fail();});
    script.addEventListener('error',fail);
    document.head.append(script);
  });
  return loading;
}
export function createHumanCheck(user,onChange=()=>{}){
  let widget=null,key='',token='',disposed=false,starting=false;
  const mount=el('div',{class:'human-check__widget'}),status=el('p',{class:'field-hint',role:'status',text:'正在准备人机验证…'});
  const retry=el('button',{type:'button',class:'btn btn--ghost comment-button',text:'重新验证',hidden:true});
  const root=el('section',{class:'human-check','aria-label':'评论人机验证'},[mount,status,retry]);
  const update=value=>{if(!disposed){token=value;onChange();}};
  async function configure(config){
    if(!config?.ready){status.textContent=config?.message||'后台尚未更新评论防护，请稍后再试。';return;}
    if(disposed||starting||(widget!==null&&key===config.siteKey))return;
    key=config.siteKey;starting=true;retry.hidden=true;status.textContent='正在加载人机验证…';
    try{
      const api=await sdk();if(disposed||!root.isConnected)return;
      widget=api.render(mount,{sitekey:key,action:'comment',cData:user.id.replace(':','_'),theme:'auto',size:'flexible','response-field':false,
        callback:value=>{update(value);status.textContent='人机验证已通过。';retry.hidden=true;},
        'expired-callback':()=>{update('');status.textContent='验证已过期，请重新验证。';retry.hidden=false;},
        'error-callback':()=>{update('');status.textContent='人机验证失败，请重试。';retry.hidden=false;}
      });
      const observer=new MutationObserver(()=>{if(!root.isConnected){disposed=true;api.remove(widget);observer.disconnect();}});
      observer.observe(document.body,{childList:true,subtree:true});
    }catch(error){status.textContent=error.message;retry.hidden=false;}finally{starting=false;}
  }
  function reset(){update('');if(widget!==null&&!disposed){status.textContent='正在重新验证…';window.turnstile.reset(widget);}else if(key)configure({ready:true,siteKey:key});}
  retry.addEventListener('click',reset);
  return {element:root,configure,value:()=>token,reset};
}
