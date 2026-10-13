import {el} from '../assets/js/util.js?v=20261012-comment-replies';
import {api} from '../assets/js/auth.js?v=20261012-comment-replies';

export function createComments(article,user=window.__LEMONCAT_USER__){
  const endpoint='/api/articles/'+encodeURIComponent(article.slug)+'/comments';
  const root=el('section',{class:'article-comments',id:'comments','aria-labelledby':'comments-heading'});
  const count=el('span',{class:'comment-count',hidden:true}),refresh=el('button',{type:'button',class:'btn btn--ghost comment-button',text:'刷新评论'});
  root.append(el('div',{class:'comments-head'},[el('h2',{id:'comments-heading',text:'评论'},[count]),refresh]));
  const status=el('p',{class:'form-status comments-status',role:'status','aria-live':'polite'});
  const replyNotice=el('p',{class:'field-hint',text:'回复功能暂未开放。',hidden:true});
  const list=el('ol',{class:'comments-list','aria-label':'文章评论'}),more=el('button',{type:'button',class:'btn btn--ghost comment-button',text:'加载更多',hidden:true});
  let items=[],total=0,next=null,ready=false,busy=false,editing=null,replying=null,repliesSupported=false;
  let form,body,submit,counter,label,cancelReply,requestId=crypto.randomUUID(),submittedBody='';
  const draftBase='lemoncat-comment-draft:'+user?.id+':'+article.slug;
  const draftKey=()=>draftBase+(replying?':reply:'+replying.id:'');
  function loginLink(){return el('a',{class:'btn btn--ghost comment-button',target:'_self',href:'/login/?next='+encodeURIComponent(location.pathname+'#comments'),text:'重新登录'});}
  function remember(){
    if(!body)return;try{if(body.value)localStorage.setItem(draftKey(),body.value);else localStorage.removeItem(draftKey());}catch{}
    counter.textContent=body.value.length+' / 2000';sync();
  }
  function setTarget(item){
    if(busy||editing)return;remember();replying=item;requestId=crypto.randomUUID();submittedBody='';
    try{body.value=(localStorage.getItem(draftKey())||'').slice(0,2000);}catch{body.value='';}
    label.textContent=item?'回复 @'+item.author:'以 '+user.login+' 的身份评论';
    submit.textContent=item?'发送回复':'发表评论';cancelReply.hidden=!item;remember();
    form.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});body.focus({preventScroll:true});
  }
  if(user){
    body=el('textarea',{id:'comment-body-'+article.slug,class:'field-input comment-input',rows:4,maxlength:2000,placeholder:'留下你的想法、疑问或补充…',required:true,'aria-describedby':'comment-hint-'+article.slug});
    try{body.value=(localStorage.getItem(draftKey())||'').slice(0,2000);}catch{}
    counter=el('span',{class:'comment-counter','aria-live':'off'});
    submit=el('button',{type:'submit',class:'btn comment-button',text:'发表评论',disabled:true});
    label=el('label',{class:'comment-label','for':body.id,text:'以 '+user.login+' 的身份评论'});
    cancelReply=el('button',{type:'button',class:'btn btn--ghost comment-button',text:'取消回复',hidden:true});
    cancelReply.addEventListener('click',()=>setTarget(null));
    const hint=el('p',{id:'comment-hint-'+article.slug,class:'field-hint',text:'评论会公开展示，请友善交流。'});
    form=el('form',{class:'comment-form'},[label,body,el('div',{class:'comment-form-footer'},[hint,counter,cancelReply,submit])]);
    body.addEventListener('input',()=>{if(submittedBody&&submittedBody!==body.value.trim()){requestId=crypto.randomUUID();submittedBody='';}remember();});remember();
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy||!ready||editing||!body.value.trim())return;
      const text=body.value.trim(),target=replying;submittedBody=text;setBusy(true);status.textContent=target?'正在发送回复…':'正在发表…';
      try{
        const result=await api(endpoint,{method:'POST',body:{body:text,requestId,...(target?{parentId:target.id}:{})}});
        if(!root.isConnected)return;
        if(target&&result.item.parentId!==target.id)throw new Error('回复暂未启用，请刷新后查看这次提交，再决定是否重试。');
        const existing=items.some(row=>row.id===result.item.id||row.replies?.some(reply=>reply.id===result.item.id));
        if(result.item.parentId){
          const parent=items.find(row=>row.id===result.item.rootId);
          if(parent){parent.replies=sortReplies([...(parent.replies||[]).filter(row=>row.id!==result.item.id),result.item]);parent.replyCount=Math.max(parent.replies.length,(parent.replyCount||0)+(existing?0:1));}
        }else items=[{replies:[],replyCount:0,...result.item},...items.filter(row=>row.id!==result.item.id)];
        total=Math.max(0,total+(existing?0:1));body.value='';submittedBody='';requestId=crypto.randomUUID();remember();draw();
        status.textContent=target?'回复已发表。':'评论已发表。';body.focus({preventScroll:true});
      }catch(error){failure(error);}finally{setBusy(false);}
    });root.append(form);
  }else{refresh.hidden=true;root.append(el('p',{class:'field-hint',text:'登录后可以查看和发表评论。'}),loginLink());}
  root.append(replyNotice,status,list,more);
  function sync(){
    refresh.disabled=busy||Boolean(editing);more.disabled=busy||Boolean(editing);
    if(submit)submit.disabled=busy||!ready||Boolean(editing)||!body?.value.trim();
    if(body)body.disabled=busy||!ready||Boolean(editing);if(cancelReply)cancelReply.disabled=busy||!ready||Boolean(editing);
    for(const button of root.querySelectorAll('[data-comment-action]'))button.disabled=busy||!ready||(Boolean(editing)&&!['save','cancel'].includes(button.dataset.commentAction));
    for(const input of root.querySelectorAll('.comment-edit-form textarea'))input.disabled=busy;
  }
  function setBusy(value){busy=value;sync();root.setAttribute('aria-busy',String(value));}
  function failure(error){
    if(error.status===401){ready=false;if(form)form.hidden=true;status.replaceChildren(document.createTextNode('登录已失效，重新登录后再参与讨论。 '),loginLink());}
    else if((error.status===404&&error.message==='接口不存在。')||error.code==='COMMENTS_NOT_CONFIGURED'){ready=false;if(form)form.hidden=true;status.textContent='评论尚未开放，请稍后再来。';}
    else if(error.code==='COMMENTS_REPLIES_NOT_CONFIGURED'){repliesSupported=false;replyNotice.hidden=false;status.textContent=error.message;}
    else status.textContent=error.message==='Failed to fetch'?'评论加载失败，请检查网络后重试。':error.message;
  }
  function time(value){return new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}
  function sortReplies(rows){return rows.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));}
  function updateItem(item){items=items.map(row=>row.id===item.id?{...row,...item}:{...row,replies:row.replies?.map(reply=>reply.id===item.id?{...reply,...item}:reply)});}
  function draw(){
    count.hidden=false;count.textContent=String(total);list.replaceChildren(...items.map(row=>card(row,true)));more.hidden=!next;
    if(!items.length)list.append(el('li',{class:'comments-empty',text:'还没有评论，来留下第一条吧。'}));sync();
  }
  function card(item,thread=false){
    const row=el('li',{class:'comment'+(thread?'':' comment--reply')+(item.deleted?' comment--deleted':''),dataset:{commentId:item.id}});
    const actions=el('div',{class:'comment-actions'});
    if(repliesSupported&&!item.deleted){
      const reply=el('button',{type:'button',class:'btn btn--ghost comment-button',text:'回复','data-comment-action':'reply','aria-label':'回复 '+item.author+' 的评论'});
      reply.addEventListener('click',()=>setTarget({id:item.id,rootId:item.rootId||item.id,author:item.author}));actions.append(reply);
    }
    if(item.canEdit){
      const edit=el('button',{type:'button',class:'btn btn--ghost comment-button',text:'编辑','data-comment-action':'edit','aria-label':'编辑 '+item.author+' 的评论'});
      edit.addEventListener('click',()=>{if(busy||editing)return;editing=item.id;draw();});actions.append(edit);
    }
    if(item.canDelete){
      const remove=el('button',{type:'button',class:'btn btn--ghost comment-button danger',text:'删除','data-comment-action':'delete','aria-label':'删除 '+item.author+' 的评论'});
      remove.addEventListener('click',async()=>{
        if(busy||editing||!confirm('确认删除这条评论？已有的其他回复会保留。'))return;
        setBusy(true);status.textContent='正在删除…';
        try{
          const result=await api(endpoint+'/'+item.id,{method:'DELETE'});if(!root.isConnected)return;
          if(thread&&result.item&&item.replyCount>0)updateItem(result.item);
          else if(thread)items=items.filter(value=>value.id!==item.id);
          else items=items.map(value=>({...value,replies:value.replies?.filter(reply=>reply.id!==item.id),replyCount:value.id===item.rootId?Math.max(0,value.replyCount-1):value.replyCount})).filter(value=>!value.deleted||value.replyCount>0);
          total=Math.max(0,total-1);
          if(replying?.id===item.id){remember();replying=null;requestId=crypto.randomUUID();submittedBody='';try{body.value=localStorage.getItem(draftKey())||'';}catch{body.value='';}label.textContent='以 '+user.login+' 的身份评论';submit.textContent='发表评论';cancelReply.hidden=true;remember();}
          draw();status.textContent='评论已删除。';
        }catch(error){failure(error);}finally{setBusy(false);}
      });actions.append(remove);
    }
    const author=item.deleted?el('span',{class:'comment-author',text:'已删除的评论'}):el('a',{class:'comment-author',href:'https://github.com/'+encodeURIComponent(item.author),target:'_self',rel:'noopener noreferrer',text:item.author});
    row.append(el('div',{class:'comment-header'},[
      el('img',{class:'comment-avatar',src:item.avatar,alt:'',loading:'lazy',width:34,height:34}),
      el('div',{class:'comment-meta'},[author,el('time',{datetime:new Date(item.createdAt).toISOString(),text:time(item.createdAt)+(item.updatedAt>item.createdAt&&!item.deleted?' · 已编辑':'')})]),actions
    ]));
    if(item.replyTo)row.append(el('p',{class:'comment-reply-to',text:'回复 @'+item.replyTo.author}));
    if(editing===item.id){
      const input=el('textarea',{class:'field-input comment-input',rows:4,maxlength:2000,required:true,'aria-label':'修改评论'});input.value=item.body;
      const save=el('button',{type:'submit',class:'btn comment-button',text:'保存修改','data-comment-action':'save'}),cancel=el('button',{type:'button',class:'btn btn--ghost comment-button',text:'取消','data-comment-action':'cancel'});
      const editor=el('form',{class:'comment-edit-form'},[input,el('div',{class:'comment-edit-actions'},[save,cancel])]);
      cancel.addEventListener('click',()=>{if(busy)return;editing=null;draw();});
      editor.addEventListener('submit',async event=>{
        event.preventDefault();if(busy||!input.value.trim())return;setBusy(true);status.textContent='正在保存…';
        try{const result=await api(endpoint+'/'+item.id,{method:'PATCH',body:{body:input.value.trim(),updatedAt:item.updatedAt}});if(!root.isConnected)return;updateItem(result.item);editing=null;draw();status.textContent='评论已更新。';}
        catch(error){failure(error);}finally{setBusy(false);}
      });row.append(editor);queueMicrotask(()=>input.focus({preventScroll:true}));
    }else row.append(el('p',{class:'comment-body',text:item.body}));
    if(thread&&(item.replyCount||item.replies?.length)){
      row.append(el('ol',{class:'comment-replies','aria-label':'这条评论的回复'},(item.replies||[]).map(reply=>card(reply))));
      if(item.nextRepliesCursor){
        const load=el('button',{type:'button',class:'btn btn--ghost comment-button comment-replies-more',text:'加载更多回复','data-comment-action':'more-replies'});
        load.addEventListener('click',async()=>{
          if(busy||editing)return;setBusy(true);status.textContent='正在加载回复…';
          try{const result=await api(endpoint+'?thread='+encodeURIComponent(item.id)+'&cursor='+encodeURIComponent(item.nextRepliesCursor));if(!root.isConnected)return;
            item.replies=sortReplies([...item.replies,...result.items.filter(reply=>!item.replies.some(value=>value.id===reply.id))]);item.replyCount=result.total;item.nextRepliesCursor=result.nextCursor;draw();status.textContent='';
          }catch(error){failure(error);}finally{setBusy(false);}
        });row.append(load);
      }
    }return row;
  }
  async function load(append=false){
    if(busy||editing||!user)return;setBusy(true);status.textContent='正在加载评论…';
    try{
      const result=await api(endpoint+(append&&next?'?cursor='+encodeURIComponent(next):''));if(!root.isConnected)return;
      const rows=result.items.map(item=>({replies:[],replyCount:0,...item}));
      items=append?[...items,...rows.filter(item=>!items.some(value=>value.id===item.id))]:rows;
      total=result.total;next=result.nextCursor;repliesSupported=result.repliesSupported===true;replyNotice.hidden=repliesSupported;
      ready=true;if(form)form.hidden=false;draw();status.textContent='';
    }catch(error){failure(error);}finally{setBusy(false);}
  }
  refresh.addEventListener('click',()=>load());more.addEventListener('click',()=>load(true));queueMicrotask(()=>load());return root;
}
