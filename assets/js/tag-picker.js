import {el} from './util.js?v=20261015-protection';
import {normalizeTags,searchText} from './catalog.js?v=20261016-subtitles';

export function createTagPicker({label='标签',selected=[],history=[],onChange=()=>{},onCreate,allowCreate=true,limit=20}={}){
  let chosen=normalizeTags(selected,limit),available=normalizeTags([...history,...selected]),busy=false;
  const root=el('section',{class:'tag-picker',role:'group','aria-label':label});
  const selectedBox=el('div',{class:'tag-selection'}),suggestions=el('div',{class:'tag-history',tabindex:0,role:'group','aria-label':'可滚动的历史标签'});
  const historyBox=el('details',{class:'tag-library'}),historyTitle=el('summary',{class:'tag-library__toggle'});historyBox.append(historyTitle,suggestions);
  const input=el('input',{class:'field-input',type:'text',maxlength:40,placeholder:allowCreate?'输入新标签，也可搜索历史标签':'搜索历史标签','aria-label':'新标签'});
  const add=el('button',{class:'btn btn--ghost',type:'button',text:'添加标签',hidden:!allowCreate});
  const status=el('p',{class:'field-hint tag-status',role:'status','aria-live':'polite'});
  root.append(el('p',{class:'tag-picker__label',text:label}),selectedBox,el('div',{class:'tag-create'},[input,add]),status,historyBox);
  const change=()=>{draw();onChange([...chosen]);};
  function choose(tag){
    if(busy)return;if(chosen.length>=limit){status.textContent='最多选择 '+limit+' 个标签。';return;}
    chosen=normalizeTags([...chosen,tag],limit);status.textContent='';change();
  }
  function draw(){
    selectedBox.replaceChildren(...chosen.map(tag=>{
      const button=el('button',{class:'tag-token',type:'button',text:tag+' ×','aria-label':'移除标签 '+tag});
      button.addEventListener('click',()=>{if(!busy){chosen=chosen.filter(value=>value!==tag);change();}});return button;
    }));
    const selectedKeys=new Set(chosen.map(searchText)),needle=searchText(input.value);
    historyTitle.textContent='历史标签（'+available.length+'） · 展开 / 收起';
    const visible=available.filter(tag=>!selectedKeys.has(searchText(tag))&&searchText(tag).includes(needle));
    suggestions.replaceChildren(...visible.map(tag=>{const button=el('button',{class:'filter-chip',type:'button',text:tag,'aria-label':'选用标签 '+tag});button.addEventListener('click',()=>choose(tag));return button;}));
    if(!visible.length)suggestions.append(el('span',{class:'field-hint',text:needle?(allowCreate?'没有匹配的历史标签，可点击“添加标签”。':'没有匹配的历史标签。'):'暂无其他历史标签。'}));
    for(const button of root.querySelectorAll('button'))button.disabled=busy;
  }
  async function create(){
    if(busy||!allowCreate)return;
    const [tag]=normalizeTags([input.value]);if(!tag){status.textContent='请输入 1 至 40 字的标签。';return;}
    if(chosen.some(value=>searchText(value)===searchText(tag))){input.value='';draw();return;}
    if(chosen.length>=limit){status.textContent='最多选择 '+limit+' 个标签。';return;}
    busy=true;draw();status.textContent=onCreate?'正在保存标签…':'';
    try{
      const existing=available.find(value=>searchText(value)===searchText(tag));
      if(!existing&&onCreate){const result=await onCreate(tag);if(result)available=normalizeTags(result);}
      available=normalizeTags([...available,existing||tag]);chosen=normalizeTags([...chosen,existing||tag],limit);input.value='';status.textContent='';if(root.isConnected)onChange([...chosen]);
    }catch(error){status.textContent=error.message;}finally{busy=false;draw();}
  }
  input.addEventListener('input',()=>{if(input.value.trim())historyBox.open=true;draw();});input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();create();}});
  add.addEventListener('click',create);draw();
  return {element:root,value:()=>[...chosen],setHistory(values){available=normalizeTags(values);draw();}};
}
