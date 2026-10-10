import {el} from './util.js?v=20261010-publication-preview';
import {api} from './auth.js?v=20261010-publication-preview';
export function createPublicationStatus(record){
 const box=el('div',{class:'publication-progress',role:'status'}),message=el('p',{text:'审核通过，正在查询部署进度…'}),progress=el('progress',{'aria-label':'发布进度',max:1}),steps=el('ol',{class:'publication-steps'},['已上传','审核通过','检查构建','部署上线'].map(text=>el('li',{text}))),refresh=el('button',{type:'button',class:'btn btn--ghost',text:'刷新进度'});
 box.append(steps,progress,message,refresh);let timer=null,busy=false,attempts=0,finished=false;
 const tick=async()=>{
  clearTimeout(timer);if(busy||finished||(!box.isConnected&&attempts))return;if(document.hidden){timer=setTimeout(tick,10000);return;}
  busy=true;refresh.disabled=true;attempts++;
  try{
   const result=await api('/api/publications/'+record.id);box.dataset.state=result.status;message.textContent=result.message;
   const active={queued:2,building:2,deploying:3,success:4,failed:2,removed:2}[result.status]||1;
   [...steps.children].forEach((node,i)=>node.classList.toggle('is-complete',i<active));
   if(result.status==='success'){progress.value=1;finished=true;refresh.remove();message.append(' ',el('a',{href:'/article/'+record.slug+'/',target:'_self',text:'阅读文章'}));box.dispatchEvent(new CustomEvent('publication-ready',{bubbles:true}));}
   else if(['failed','removed'].includes(result.status)){finished=true;progress.removeAttribute('value');if(result.url)message.append(' ',el('a',{href:result.url,target:'_self',text:'查看详情'}));}
   else progress.removeAttribute('value');
  }catch(e){message.textContent=e.status===404?'请部署新版登录服务后查看进度；内容已保存。':e.message;finished=e.status===404;}
  finally{busy=false;refresh.disabled=false;if(!finished&&attempts<30)timer=setTimeout(tick,10000);}
 };
 refresh.addEventListener('click',()=>{finished=false;tick();});
 setTimeout(tick,0);return box;
}
