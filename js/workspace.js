import {el,debounce,formatTimestamp} from '../assets/js/util.js?v=20261010-publication-preview';
import {api,logout} from '../assets/js/auth.js?v=20261010-publication-preview';
import {loadModules,loadArticles,loadArticleBody} from '../assets/js/content.js?v=20261010-publication-preview';
import {renderMarkdown} from '../assets/js/markdown.js?v=20261010-publication-preview';
import {pageHead} from '../assets/js/layout.js?v=20261010-publication-preview';
import {createFilePreview} from '../assets/js/preview.js?v=20261010-publication-preview';
import {createPublicationStatus} from '../assets/js/publication.js?v=20261010-publication-preview';
const today=()=>new Date(Date.now()+8*3600_000).toISOString().slice(0,10);
const labels={pending:'等待审核',approved:'审核通过',published:'审核通过',closed:'未通过'};
function generatedPost(source){const match=/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);if(!match)throw new Error('无法读取稿件。');const post={body:match[2]};for(const line of match[1].split('\n')){const field=/^([a-z_]+):\s*(.*)$/.exec(line);if(field){try{post[field[1]]=JSON.parse(field[2]);}catch{post[field[1]]=field[2];}}}return post;}
export async function renderWorkspace(container,params=new URLSearchParams()){
  const user=window.__LEMONCAT_USER__;if(!user)return;
  const admin=user.role==='admin',view=params.get('view')||'editor';
  const wrap=el('div',{class:'wrap workspace'});
  const head=pageHead('写作区',admin?'欢迎回来。整理自己的文章，也看看大家的新投稿。':'把今天的发现写下来，提交后等待 Lemoncat 审核。');
  const tabs=el('nav',{class:'workspace-nav','aria-label':'写作区导航'});
  const navs=[['editor','写文章','/workspace/'],['submissions',admin?'全部投稿':'我的投稿','/workspace/submissions/'],['approved','审核通过','/workspace/approved/'],['published',admin?'已发布文章':'我的文章','/workspace/published/'],...(admin?[['review','文章审核','/workspace/review/'],['assist','DeepSeek 助手','/workspace/assist/']]:[])];
  for(const [key,label,href]of navs)tabs.append(el('a',{href,target:'_self',text:label,...(view===key?{'aria-current':'page'}:{})}));
  const signout=el('button',{class:'text-button',type:'button',text:'退出登录'});signout.addEventListener('click',logout);tabs.append(signout);
  const status=el('p',{class:'form-status',role:'status'}),stage=el('section',{class:'workspace-stage'});
  wrap.append(head,tabs,status,stage);container.replaceChildren(wrap);
  const safeCheckUrl=value=>typeof value==='string'&&/^https:\/\/github\.com\/oslemoncat\/oslemoncat\.github\.io\/(actions\/runs\/\d+|pull\/\d+\/checks)$/.test(value)?value:null;
  const fail=e=>{status.textContent=e.message;const url=safeCheckUrl(e.check?.url);if(url)status.append(' ',el('a',{href:url,target:'_self',rel:'noopener noreferrer',text:'打开检查详情'}));};
  try{
    if(['review','assist'].includes(view)&&!admin){stage.append(el('p',{text:'这个页面仅管理员可以使用。'}));return;}
    if(view==='assist'){
      stage.append(el('h2',{text:'一起把喵喵屋做得更好'}),el('p',{class:'muted',text:'描述想改进的界面或文章，DeepSeek 会给出建议。'}));
      const input=el('textarea',{class:'field-input ai-prompt',rows:7,maxlength:6000,'aria-label':'给 DeepSeek 的需求',placeholder:'例如：帮我改善知识模块页在手机上的排版…'});
      const button=el('button',{class:'btn btn--primary',type:'button',text:'生成建议'}),output=el('pre',{class:'ai-output',hidden:true});
      button.addEventListener('click',async()=>{button.disabled=true;status.textContent='正在生成建议…';try{const result=await api('/api/assist',{method:'POST',body:{prompt:input.value}});output.textContent=result.text;output.hidden=false;status.textContent='建议已生成，可以按需要采用。';}catch(e){fail(e);}finally{button.disabled=false;}});stage.append(input,button,output);return;
    }
    if(view==='approved'){
      stage.append(el('h2',{text:'审核通过与上线进度'}));
      const result=await api('/api/publications');
      if(!result.items.length)stage.append(el('p',{class:'empty',text:'新的审核通过文章会显示在这里，部署成功后可直接阅读。'}));
      let shown=0;const more=el('button',{class:'btn btn--ghost',type:'button',text:'加载更多'}),show=()=>{for(const item of result.items.slice(shown,shown+20))stage.insertBefore(el('article',{class:'approved-card'},[el('h3',{text:item.title}),el('p',{class:'muted',text:item.author+' · 上传于 '+formatTimestamp(item.uploadedAt)}),createPublicationStatus(item)]),more);shown+=20;more.hidden=shown>=result.items.length;};stage.append(more);more.addEventListener('click',show);show();
      return;
    }
    if(view==='published'){
      let articles=await loadArticles();if(!admin){const result=await api('/api/ownership');const owned=new Set(result.owned);articles=articles.filter(a=>owned.has(a.slug));}stage.append(el('h2',{text:admin?'已发布文章':'我的文章'}));if(!articles.length)stage.append(el('p',{class:'empty',text:admin?'现在没有已发布文章。':'你还没有已发布的文章，审核通过后会显示在这里。'}));
      for(const article of articles){const edit=el('a',{class:'btn btn--ghost article-action',href:'/workspace/?edit='+encodeURIComponent(article.slug),target:'_self',text:'编辑'}),remove=el('button',{class:'btn btn--ghost article-action danger',type:'button',text:'删除'});
        const row=el('div',{class:'submission-row submission-row--published'},[el('div',{},[el('a',{href:`/article/${article.slug}/`,text:article.title}),el('p',{class:'muted',text:article.moduleTitle})]),el('div',{class:'row-actions'},[...(admin?[edit]:[]),remove])]);
        remove.addEventListener('click',async()=>{if(!confirm('确认删除“'+article.title+'”？删除后将从网站移除。'))return;remove.disabled=true;try{await api('/api/articles/'+article.slug,{method:'DELETE'});row.remove();status.textContent='文章已删除，网站将在部署完成后更新。';}catch(e){fail(e);remove.disabled=false;}});stage.append(row);}
      return;
    }
    if(view==='submissions'||view==='review'){
      const id=params.get('id');
      if(id){
        const detail=await api('/api/submissions/'+id),post=generatedPost(detail.source);
        const mediaBase=/^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[a-f0-9]{40}\/$/.test(detail.mediaBase||'')?detail.mediaBase:null;
        const mediaUrl=path=>mediaBase&&/^\/?assets\/(images|files)\//.test(path)?mediaBase+path.replace(/^\//,''):path;
        const prose=el('div',{class:'prose review-prose',html:renderMarkdown(post.body).html});
        for(const image of prose.querySelectorAll('img'))image.src=mediaUrl(image.getAttribute('src')||'');
        for(const link of prose.querySelectorAll('a')){const href=link.getAttribute('href')||'';if(/^\/?assets\//.test(href)){link.href=mediaUrl(href);link.target='_self';link.rel='noopener noreferrer';}}
        stage.append(el('h2',{text:post.title||detail.title}),el('p',{class:'muted',text:'投稿人：'+detail.author}),prose);
        if(post.images?.length)stage.append(el('div',{class:'review-media'},post.images.map(image=>el('figure',{},[el('img',{src:mediaUrl(image.src),alt:image.caption||'',loading:'lazy'}),el('figcaption',{text:image.caption||''})]))));
        if(post.attachments?.length)stage.append(el('ul',{class:'review-files'},post.attachments.map(file=>el('li',{},[el('a',{href:mediaUrl(file.file),text:file.title||file.file.split('/').pop(),target:'_self'}),createFilePreview(mediaUrl(file.file),file.title)]))));
        if(detail.publication)stage.append(createPublicationStatus(detail.publication));
        if(detail.files?.length)stage.append(el('details',{class:'review-details'},[el('summary',{text:'查看本次修改的文件（'+detail.files.length+'）'}),el('ul',{class:'review-files'},detail.files.map(file=>el('li',{text:file.path})))]));
        if(admin&&detail.state==='open'){
          const checkBox=el('div',{class:'review-check',role:'status'}),refresh=el('button',{class:'text-button',type:'button',text:'刷新检查状态'});
          const drawCheck=()=>{checkBox.replaceChildren(el('p',{text:detail.check?.message||'请刷新检查状态。'}));const url=safeCheckUrl(detail.check?.url);if(url)checkBox.append(el('a',{href:url,target:'_self',rel:'noopener noreferrer',text:detail.check.status==='approval_required'?'去 GitHub 批准运行检查':'打开检查详情'}));checkBox.append(refresh);};
          stage.append(checkBox);
          const confirmed=el('input',{type:'checkbox'}),confirmation=el('label',{class:'review-confirmation'},[confirmed,el('span',{text:'我已阅读这版稿件，确认审核通过'})]);
          stage.append(confirmation);
          const publish=el('button',{class:'btn btn--primary',type:'button',text:'审核通过并发布'}),reject=el('button',{class:'btn btn--ghost danger',type:'button',text:'退回投稿'});
          const updateCheck=()=>{drawCheck();publish.disabled=!confirmed.checked||detail.check?.status!=='success';};
          refresh.addEventListener('click',async()=>{refresh.disabled=true;try{const fresh=await api('/api/submissions/'+id);if(fresh.sha!==detail.sha||fresh.state!==detail.state){await renderWorkspace(container,params);return;}detail.check=fresh.check;updateCheck();}catch(e){fail(e);}finally{refresh.disabled=false;}});confirmed.addEventListener('change',updateCheck);updateCheck();
          for(const [button,action]of [[publish,'publish'],[reject,'reject']])button.addEventListener('click',async()=>{if(action==='reject'&&!confirm('确认退回这篇投稿？'))return;publish.disabled=reject.disabled=true;try{const result=await api('/api/submissions/'+id+'/review',{method:'POST',body:{action,sha:detail.sha,confirmed:confirmed.checked}});status.textContent=result.message||(action==='publish'?'审核通过，文章将在部署完成后显示。':'投稿已退回。');if(result.publication){checkBox.remove();confirmation.remove();stage.append(createPublicationStatus(result.publication));status.append(' ',el('a',{href:'/workspace/approved/',target:'_self',text:'查看审核通过列表'}));}}catch(e){fail(e);if(e.check)detail.check=e.check;updateCheck();reject.disabled=false;}});
          stage.append(el('div',{class:'editor-actions'},[publish,reject]));
        }else if(detail.state==='open'&&detail.author.toLowerCase()===user.login.toLowerCase())stage.append(el('a',{class:'btn btn--primary',href:'/workspace/?submission='+id,text:'继续编辑'}));
        if(detail.state==='open'&&(admin||detail.canDelete||detail.author.toLowerCase()===user.login.toLowerCase())){const withdraw=el('button',{class:'text-button danger',type:'button',text:'撤回投稿'});withdraw.addEventListener('click',async()=>{if(!confirm('确认撤回这篇待审投稿？'))return;withdraw.disabled=true;try{await api('/api/submissions/'+id,{method:'DELETE'});stage.replaceChildren(el('p',{text:'投稿已撤回，不会发布到网站。'}));}catch(e){fail(e);withdraw.disabled=false;}});stage.append(withdraw);}
        return;
      }
      stage.append(el('h2',{text:view==='review'?'等待你审核的文章':admin?'全部投稿':'我的投稿'}));
      let page=1;const rows=el('div',{class:'submission-list'}),more=el('button',{class:'btn btn--ghost',type:'button',text:'加载更多'});stage.append(rows,more);
      const load=async()=>{more.disabled=true;try{const result=await api('/api/submissions?page='+page++);const items=result.items.filter(x=>view!=='review'||x.state==='pending');for(const item of items)rows.append(el('div',{class:'submission-row'},[el('div',{},[el('a',{href:`/workspace/${admin?'review':'submissions'}/?id=${item.number}`,text:item.title}),el('p',{class:'muted',text:item.author+' · '+item.date.slice(0,10)})]),el('span',{class:'submission-state',text:labels[item.state]})]));more.hidden=!result.hasMore;if(!rows.children.length&&!result.hasMore)rows.append(el('p',{class:'empty',text:view==='review'?'现在没有等待审核的文章。':'还没有投稿，去写下第一篇吧。'}));}catch(e){fail(e);}finally{more.disabled=false;}};more.addEventListener('click',load);await load();return;
    }
    const modules=await loadModules(),draftKey='lemoncat-draft:'+user.login;
    let post={slug:'',title:'',summary:'',module:'misc',date:today(),updated:today(),tags:[],body:'',images:[],attachments:[]},submission=null;
    const editing=params.get('edit'),pending=params.get('submission');
    if(editing){const articles=await loadArticles(),article=articles.find(a=>a.slug===editing);if(!article)throw new Error('没有找到这篇文章。');post={...post,...article,body:await loadArticleBody(editing),updated:today()};}
    else if(pending){submission=await api('/api/submissions/'+pending);if((submission.authorId?submission.authorId!==user.id:submission.author.toLowerCase()!==user.login.toLowerCase())||submission.state!=='open')throw new Error('只能编辑自己尚未审核的稿件。');post={...post,...generatedPost(submission.source),updated:today()};}
    else{try{const saved=JSON.parse(localStorage.getItem(draftKey));if(saved)post={...post,...saved};}catch{}}
    const fields={},form=el('form',{class:'editor-form'}),files=[],resources=el('div',{class:'upload-list'}),preview=el('div',{class:'prose editor-preview',hidden:true});
    const field=(name,label,tag='input',attrs={})=>{const input=el(tag,{class:'field-input',...(tag==='input'?{type:'text'}:{}),...attrs});if(tag!=='select')input.value=name==='tags'?(post.tags||[]).join(', '):post[name]||'';fields[name]=input;return el('label',{class:'field'},[el('span',{text:label}),input]);};
    const title=field('title','文章标题','input',{required:true,maxlength:160,placeholder:'给今天的发现起个名字'});
    const body=field('body','正文','textarea',{required:true,rows:18,placeholder:'从这里开始写。支持 Markdown、代码、数学公式…'});
    const slug=field('slug','文章地址','input',{required:true,pattern:'[a-z0-9]+(-[a-z0-9]+)*',maxlength:100,placeholder:'例如 my-study-notes',...(editing||pending?{readonly:true}:{})});
    const module=field('module','知识模块','select');for(const m of modules)fields.module.append(el('option',{value:m.slug,text:m.title}));fields.module.value=post.module;
    const summary=field('summary','摘要','textarea',{rows:3,maxlength:1000,placeholder:'一两句话介绍这篇文章'}),date=field('date','首次发布日期','input',{type:'text',readonly:true}),tags=field('tags','标签','input',{placeholder:'用逗号分隔'});
    fields.date.value=editing?formatTimestamp(post.publishedAt||post.published_at||post.date):'发布时由系统记录';
    const uploadedInfo=el('p',{class:'field-hint',text:'上传成功时间：'+(formatTimestamp(post.uploadedAt||post.uploaded_at)||'提交成功后由系统记录（北京时间）')});
    const fileInput=el('input',{type:'file',multiple:true,hidden:true,accept:'.png,.jpg,.jpeg,.gif,.webp,.avif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.zip,.mp4,.webm,.ogv,.mp3,.m4a,.wav,.ogg,.oga,.flac'});
    const upload=el('button',{class:'btn btn--ghost',type:'button',text:'添加图片或附件'}),previewButton=el('button',{class:'text-button',type:'button',text:'预览正文'});upload.addEventListener('click',()=>fileInput.click());
    const collect=()=>({...post,slug:fields.slug.value.trim(),title:fields.title.value.trim(),summary:fields.summary.value,module:fields.module.value,date:post.date||today(),updated:today(),tags:fields.tags.value.split(/[,，]/).map(x=>x.trim()).filter(Boolean),body:fields.body.value});
    const saveDraft=debounce(()=>{if(!editing&&!pending){try{localStorage.setItem(draftKey,JSON.stringify({...collect(),images:post.images.filter(x=>!files.some(f=>'/'+f.path===x.src)),attachments:post.attachments.filter(x=>!files.some(f=>'/'+f.path===x.file))}));}catch{}}},400);form.addEventListener('input',saveDraft);
    const drawFiles=()=>{resources.replaceChildren();for(const [key,list,label]of [['images',post.images,'图片'],['attachments',post.attachments,'附件']])for(const record of list){const path=record.src||record.file,button=el('button',{class:'text-button',type:'button',text:'移除','aria-label':'移除 '+path});button.addEventListener('click',()=>{list.splice(list.indexOf(record),1);const i=files.findIndex(f=>'/'+f.path===path);if(i>=0)files.splice(i,1);drawFiles();saveDraft();});const current=files.find(f=>'/'+f.path===path),name=record.caption||record.title||path.split('/').pop();const row=el('div',{class:'upload-row'},[el('span',{text:label+' · '+name}),button]);resources.append(row);if(key==='attachments'){const preview=createFilePreview(path,name,current?{getBytes:async()=>Uint8Array.from(atob(current.content),c=>c.charCodeAt(0)).buffer}:{});if(preview)resources.append(preview);}}};
    fileInput.addEventListener('change',async()=>{upload.disabled=true;try{for(const file of fileInput.files){const ext=file.name.split('.').pop().toLowerCase(),image=['png','jpg','jpeg','gif','webp','avif'].includes(ext),max=(image?10:20)*1024*1024;
      if(file.size>max||files.reduce((n,f)=>n+f.size,0)+file.size>20*1024*1024||files.length>=12)throw new Error('图片最多 10 MB、附件最多 20 MB，一次最多 12 个文件且总计 20 MB。');
      const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
      const safeName=(file.name.slice(0,-ext.length-1).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'file')+'-'+crypto.randomUUID()+'.'+ext;
      const path=`assets/${image?'images':'files'}/uploads/${safeName}`;files.push({path,content,size:file.size});(image?post.images:post.attachments).push(image?{src:'/'+path,caption:file.name}:{file:'/'+path,title:file.name});
    }drawFiles();status.textContent='文件已加入本次稿件，提交时一起上传。';}catch(e){fail(e);}finally{fileInput.value='';upload.disabled=false;}});
    previewButton.addEventListener('click',()=>{preview.hidden=!preview.hidden;body.hidden=!preview.hidden;previewButton.textContent=preview.hidden?'预览正文':'继续编辑';if(!preview.hidden)preview.innerHTML=renderMarkdown(fields.body.value).html;});
    const uploadProgress=el('progress',{class:'upload-progress',max:1,value:0,'aria-label':'文件上传进度',hidden:true});
    const submit=el('button',{class:'btn btn--primary',type:'submit',text:admin?'发布文章':pending?'更新投稿':'提交审核'});
    form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=true;upload.disabled=true;status.textContent=admin?'正在发布文章…':'正在上传并提交审核…';try{
      const result=await api(admin?'/api/articles':pending?'/api/submissions/'+pending:'/api/submissions',{method:pending&&!admin?'PATCH':'POST',body:{post:collect(),files:files.map(({size,...f})=>f),...(submission?{sha:submission.sha}:{})},onUploadProgress:ratio=>{uploadProgress.hidden=false;uploadProgress.value=ratio;status.textContent=ratio<1?'上传中 '+Math.floor(ratio*100)+'%':'上传完成，正在保存到仓库…';}});
      if(submission&&result.sha)submission.sha=result.sha;
      uploadProgress.hidden=true;uploadedInfo.textContent='上传成功时间：'+(formatTimestamp(result.uploadedAt||result.publication?.uploadedAt)||'已上传');if(result.publication)stage.append(createPublicationStatus(result.publication));
      localStorage.removeItem(draftKey);files.length=0;status.textContent=admin?'文章已发布，网站将在部署完成后更新。':'投稿已提交，等待 Lemoncat 审核。';
      // Lock the submitted form so attachments are not accidentally resubmitted without their bytes.
      for(const input of form.querySelectorAll('input,textarea,select,button'))input.disabled=true;
      status.append(' ',el('a',{href:'/workspace/submissions/',text:'查看投稿'}));
    }catch(e){fail(e);submit.disabled=upload.disabled=false;}});
    form.append(el('div',{class:'editor-main'},[title,el('div',{class:'editor-toolbar'},[upload,previewButton,fileInput]),body,preview]),el('aside',{class:'editor-details'},[slug,module,summary,date,uploadedInfo,tags,resources,uploadProgress,el('p',{class:'field-hint',text:admin?'发布后会更新网站内容。':'提交的稿件与附件会进入公开仓库，审核通过后才显示在本站。'}),submit]));drawFiles();stage.append(form);
  }catch(e){fail(e);}
}