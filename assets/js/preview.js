/* Shared in-page previews. Heavy parsers load only when a file is opened. */
import {el,safeUrl} from './util.js?v=20261010-publication-preview';
import {renderMarkdown} from './markdown.js?v=20261010-publication-preview';
const libraries=new Map();
function script(name,global){
 if(window[global])return Promise.resolve(window[global]);
 if(!libraries.has(name))libraries.set(name,new Promise((resolve,reject)=>{
  const node=el('script',{src:new URL('../vendor/'+name,import.meta.url).href});
  node.addEventListener('load',()=>window[global]?resolve(window[global]):reject(new Error('预览工具加载失败。')));
  node.addEventListener('error',()=>{libraries.delete(name);reject(new Error('预览工具加载失败，可以下载文件查看。'));});document.head.append(node);
 }));
 return libraries.get(name);
}
function sanitizedWord(html){
 const doc=new DOMParser().parseFromString(html,'text/html');
 const allowed=new Set(['P','BR','H1','H2','H3','H4','H5','H6','STRONG','EM','B','I','U','S','UL','OL','LI','TABLE','THEAD','TBODY','TR','TH','TD','BLOCKQUOTE','A','IMG','SUP','SUB','HR','SPAN','DIV']);
 for(const node of [...doc.body.querySelectorAll('*')]){
  if(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','FORM','INPUT','LINK','META'].includes(node.tagName)){node.remove();continue;}
  if(!allowed.has(node.tagName)){node.replaceWith(...node.childNodes);continue;}
  const href=node.tagName==='A'?node.getAttribute('href'):null,src=node.tagName==='IMG'?node.getAttribute('src'):null;
  for(const attr of [...node.attributes])node.removeAttribute(attr.name);
  if(href&&safeUrl(href)!=='#'&&!href.startsWith('//'))node.setAttribute('href',safeUrl(href));
  if(src&&/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src))node.setAttribute('src',src);
 }
 return doc.body.innerHTML;
}
export function createFilePreview(url,title,options={}){
 const filename=String(title||url.split('/').pop()||'文件');
 const pathname=(()=>{try{return new URL(url,location.origin).pathname;}catch{return '';}})();
 const ext=(options.extension||pathname.split('.').pop()||'').toLowerCase();
 const supported=['pdf','md','markdown','txt','csv','docx','doc','xlsx','xls','ods','ppt','pptx'];
 if(!supported.includes(ext))return null;
 const details=el('details',{class:'file-preview'}),summary=el('summary',{text:'预览 '+filename}),stage=el('div',{class:'file-preview__stage'});details.append(summary,stage);
 let loaded=false,loading=false;
 async function bytes(){
  if(options.getBytes)return options.getBytes();
  const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw Error('文件暂时无法读取，可以下载后查看。');
  const data=await response.arrayBuffer();if(data.byteLength>20*1024*1024)throw Error('文件较大，请下载后查看。');return data;
 }
 details.addEventListener('toggle',async()=>{
  if(!details.open||loaded||loading)return;loading=true;stage.replaceChildren(el('p',{role:'status',text:'正在加载预览…'}));
  try{
   if(ext==='pdf'){
    const pdfjs=await import('../vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.mjs',import.meta.url).href;
    const document=await pdfjs.getDocument({data:new Uint8Array(await bytes()),isEvalSupported:false,useSystemFonts:true}).promise;
    let number=1;const canvas=el('canvas',{'aria-label':filename}),previous=el('button',{type:'button',class:'btn btn--ghost',text:'上一页'}),next=el('button',{type:'button',class:'btn btn--ghost',text:'下一页'}),label=el('span',{role:'status'}),surface=el('div',{class:'pdf-surface'},[canvas]);
    const draw=async()=>{previous.disabled=next.disabled=true;const page=await document.getPage(number),initial=page.getViewport({scale:1}),width=Math.max(200,Math.min(surface.clientWidth||stage.clientWidth||300,1000)),ratio=Math.min(devicePixelRatio||1,2),viewport=page.getViewport({scale:width/initial.width*ratio});
     canvas.width=viewport.width;canvas.height=viewport.height;canvas.style.width=width+'px';canvas.style.height=viewport.height/ratio+'px';await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;label.textContent=number+' / '+document.numPages+' 页';previous.disabled=number<=1;next.disabled=number>=document.numPages;};
    const controls=el('div',{class:'preview-toolbar'},[previous,label,next]);stage.replaceChildren(controls,surface);
    previous.addEventListener('click',async()=>{if(number>1){number--;await draw();}});next.addEventListener('click',async()=>{if(number<document.numPages){number++;await draw();}});await draw();
   }else if(['md','markdown','txt'].includes(ext)){
    const text=new TextDecoder().decode(await bytes()),view=el(ext==='txt'?'pre':'div',{class:ext==='txt'?'file-text':'prose'});
    if(ext==='txt')view.textContent=text;else view.innerHTML=renderMarkdown(text).html;stage.replaceChildren(view);
   }else if(ext==='docx'){
    const mammoth=await script('mammoth.browser.js','mammoth'),result=await mammoth.convertToHtml({arrayBuffer:await bytes()},{externalFileAccess:false});
    stage.replaceChildren(el('div',{class:'prose word-preview',html:sanitizedWord(result.value)}));
   }else if(['xlsx','xls','csv','ods'].includes(ext)){
    const xlsx=await script('xlsx.full.min.js','XLSX'),book=xlsx.read(await bytes(),{type:'array',cellFormula:false,cellHTML:false,cellStyles:false,sheetRows:501,dense:true});
    const select=el('select',{'aria-label':'工作表',class:'field-input'}),tableBox=el('div',{class:'sheet-preview'});
    for(const name of book.SheetNames.slice(0,100))select.append(el('option',{value:name,text:name}));
    const draw=()=>{const rows=xlsx.utils.sheet_to_json(book.Sheets[select.value],{header:1,raw:false,defval:''}),table=el('table');
     for(const cells of rows.slice(0,500))table.append(el('tr',{},cells.slice(0,50).map(value=>el('td',{text:String(value).slice(0,2000)}))));tableBox.replaceChildren(table);};
    select.value=book.SheetNames[0];select.addEventListener('change',draw);stage.replaceChildren(el('div',{class:'preview-toolbar'},[select]),el('p',{class:'muted',text:'显示前 500 行、50 列，可切换工作表；完整内容请下载。'}),tableBox);draw();
   }else{
    if(options.getBytes)throw Error('旧 DOC/PPT 需要文件上传后才能在线预览；也可转成 DOCX/PDF。');
    const absolute=new URL(url,location.origin);if(absolute.protocol!=='https:')throw Error('该文件请下载后查看。');
    stage.replaceChildren(el('p',{class:'muted',text:'由微软在线查看器提供预览，需要联网，查看器将读取这个公开附件。'}),el('iframe',{class:'office-preview',src:'https://view.officeapps.live.com/op/embed.aspx?src='+encodeURIComponent(absolute.href),title:filename,loading:'lazy',referrerpolicy:'no-referrer',sandbox:'allow-scripts allow-same-origin allow-forms allow-popups'}));
   }
   loaded=true;
  }catch(error){stage.replaceChildren(el('p',{role:'status',text:error.message}));}finally{loading=false;}
 });
 return details;
}
