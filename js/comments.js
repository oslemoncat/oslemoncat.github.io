import {el} from '../assets/js/util.js?v=20261010-publication-preview';
import {api} from '../assets/js/auth.js?v=20261010-publication-preview';

export function createComments(article,user=window.__LEMONCAT_USER__){
  const endpoint='/api/articles/'+encodeURIComponent(article.slug)+'/comments';
  const root=el('section',{class:'article-comments',id:'comments','aria-labelledby':'comments-heading'});
  const count=el('span',{class:'comment-count',hidden:true});
  const refresh=el('button',{type:'button',class:'btn btn--ghost comment-button',text:'刷新评论'});
  root.append(el('div',{class:'comments-head'},[el('h2',{id:'comments-heading',text:'评论'},[count]),refresh]));
  const status=el('p',{class:'form-status comments-status',role:'status','aria-live':'polite'});
  const list=el('ol',{class:'comments-list','aria-label':'文章评论'});
  const more=el('button',{type:'button',class:'btn btn--ghost comment-button',text:'加载更多',hidden:true});
  let items=[],total=0,next=null,ready=false,busy=false,editing=null;
  let form,body,submit,counter,requestId=crypto.randomUUID(),submittedBody='';
  const draftKey='lemoncat-comment-draft:'+user?.id+':'+article.slug;
  function loginLink(){return el('a',{class:'btn btn--ghost comment-button',target:'_self',href:'/login/?next='+encodeURIComponent(location.pathname+'#comments'),text:'重新登录'});}
  if(user){
    body=el('textarea',{id:'comment-body-'+article.slug,class:'field-input comment-input',rows:4,maxlength:2000,placeholder:'留下你的想法、疑问或补充…',required:true,'aria-describedby':'comment-hint-'+article.slug});
    try{body.value=(localStorage.getItem(draftKey)||'').slice(0,2000);}catch{}
    counter=el('span',{class:'comment-counter','aria-live':'off'});
    submit=el('button',{type:'submit',class:'btn comment-button',text:'发表评论',disabled:true});
    const hint=el('p',{id:'comment-hint-'+article.slug,class:'field-hint',text:'评论会公开展示，请友善交流。'});
    form=el('form',{class:'comment-form'},[
      el('label',{class:'comment-label','for':body.id,text:'以 '+user.login+' 的身份评论'}),body,
      el('div',{class:'comment-form-footer'},[hint,counter,submit])
    ]);
    function remember(){try{if(body.value)localStorage.setItem(draftKey,body.value);else localStorage.removeItem(draftKey);}catch{}counter.textContent=body.value.length+' / 2000';sync();}
    body.addEventListener('input',()=>{if(submittedBody&&submittedBody!==body.value.trim()){requestId=crypto.randomUUID();submittedBody='';}remember();});
    remember();
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy||!ready||editing||!body.value.trim())return;
      const text=body.value.trim();submittedBody=text;setBusy(true);status.textContent='正在发表…';
      try{
        const result=await api(endpoint,{method:'POST',body:{body:text,requestId}});
        if(!root.isConnected)return;
        const exists=items.some(item=>item.id===result.item.id);
        items=[result.item,...items.filter(item=>item.id!==result.item.id)];total=Math.max(items.length,total+(exists?0:1));
        body.value='';submittedBody='';requestId=crypto.randomUUID();remember();draw();
        status.textContent='评论已发表。';body.focus({preventScroll:true});
      }catch(error){failure(error);}
      finally{setBusy(false);}
    });
    root.append(form);
  }else{
    refresh.hidden=true;
    root.append(el('p',{class:'field-hint',text:'登录后可以查看和发表评论。'}),loginLink());
  }
  root.append(status,list,more);
  function sync(){
    refresh.disabled=busy||Boolean(editing);
    more.disabled=busy||Boolean(editing);
    if(submit)submit.disabled=busy||!ready||Boolean(editing)||!body?.value.trim();
    if(body)body.disabled=busy||!ready||Boolean(editing);
    for(const button of root.querySelectorAll('[data-comment-action]'))button.disabled=busy||!ready;
  }
  function setBusy(value){busy=value;sync();root.setAttribute('aria-busy',String(value));}
  function failure(error){
    if(error.status===401){
      ready=false;if(form)form.hidden=true;
      status.replaceChildren(document.createTextNode('登录已失效，重新登录后再参与讨论。 '),loginLink());
    }else if((error.status===404&&error.message==='接口不存在。')||error.code==='COMMENTS_NOT_CONFIGURED'){
      ready=false;if(form)form.hidden=true;status.textContent='评论尚未开放，请稍后再来。';
    }else status.textContent=error.message==='Failed to fetch'?'评论加载失败，请检查网络后重试。':error.message;
  }
  function time(value){return new Date(value).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}
  function draw(){
    count.hidden=false;count.textContent=String(total);
    list.replaceChildren(...items.map(card));more.hidden=!next;
    if(!items.length)list.append(el('li',{class:'comments-empty',text:'还没有评论，来留下第一条吧。'}));
    sync();
  }
  function card(item){
    const row=el('li',{class:'comment',dataset:{commentId:item.id}});
    const actions=el('div',{class:'comment-actions'});
    const edit=el('button',{type:'button',class:'btn btn--ghost comment-button',text:'编辑','data-comment-action':'edit','aria-label':'编辑 '+item.author+' 的评论'});
    if(item.canEdit){edit.addEventListener('click',()=>{if(busy||editing)return;editing=item.id;draw();});actions.append(edit);}
    if(item.canDelete){
      const remove=el('button',{type:'button',class:'btn btn--ghost comment-button danger',text:'删除','data-comment-action':'delete','aria-label':'删除 '+item.author+' 的评论'});
      remove.addEventListener('click',async()=>{
        if(busy||editing||!confirm('确认删除这条评论？'))return;
        setBusy(true);status.textContent='正在删除…';
        try{await api(endpoint+'/'+item.id,{method:'DELETE'});if(!root.isConnected)return;items=items.filter(value=>value.id!==item.id);total=Math.max(0,total-1);draw();status.textContent='评论已删除。';}
        catch(error){failure(error);}finally{setBusy(false);}
      });actions.append(remove);
    }
    row.append(el('div',{class:'comment-header'},[
      el('img',{class:'comment-avatar',src:item.avatar,alt:'',loading:'lazy',width:34,height:34}),
      el('div',{class:'comment-meta'},[
        el('a',{class:'comment-author',href:'https://github.com/'+encodeURIComponent(item.author),target:'_self',rel:'noopener noreferrer',text:item.author}),
        el('time',{datetime:new Date(item.createdAt).toISOString(),text:time(item.createdAt)+(item.updatedAt>item.createdAt?' · 已编辑':'')})
      ]),actions
    ]));
    if(editing===item.id){
      const input=el('textarea',{class:'field-input comment-input',rows:4,maxlength:2000,required:true,'aria-label':'修改评论'});input.value=item.body;
      const save=el('button',{type:'submit',class:'btn comment-button',text:'保存修改','data-comment-action':'save'});
      const cancel=el('button',{type:'button',class:'btn btn--ghost comment-button',text:'取消','data-comment-action':'cancel'});
      const editor=el('form',{class:'comment-edit-form'},[input,el('div',{class:'comment-edit-actions'},[save,cancel])]);
      cancel.addEventListener('click',()=>{if(busy)return;editing=null;draw();});
      editor.addEventListener('submit',async event=>{
        event.preventDefault();if(busy||!input.value.trim())return;
        setBusy(true);status.textContent='正在保存…';
        try{const result=await api(endpoint+'/'+item.id,{method:'PATCH',body:{body:input.value.trim(),updatedAt:item.updatedAt}});if(!root.isConnected)return;items=items.map(value=>value.id===item.id?result.item:value);editing=null;draw();status.textContent='评论已更新。';}
        catch(error){failure(error);}finally{setBusy(false);}
      });
      row.append(editor);queueMicrotask(()=>input.focus({preventScroll:true}));
    }else row.append(el('p',{class:'comment-body',text:item.body}));
    return row;
  }
  async function load(append=false){
    if(busy||editing||!user)return;setBusy(true);status.textContent='正在加载评论…';
    try{
      const result=await api(endpoint+(append&&next?'?cursor='+encodeURIComponent(next):''));
      if(!root.isConnected)return;
      items=append?[...items,...result.items.filter(item=>!items.some(value=>value.id===item.id))]:result.items;
      total=result.total;next=result.nextCursor;ready=true;if(form)form.hidden=false;draw();status.textContent='';
    }catch(error){failure(error);}finally{setBusy(false);}
  }
  refresh.addEventListener('click',()=>load());more.addEventListener('click',()=>load(true));
  queueMicrotask(()=>load());
  return root;
}
