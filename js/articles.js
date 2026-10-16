import {el,debounce} from '../assets/js/util.js?v=20261015-protection';
import {loadModules,loadArticles,loadSearchIndex,loadTagHistory,decorateModules} from '../assets/js/content.js?v=20261016-subtitles';
import {pageHead,articleList,emptyState,breadcrumbs} from '../assets/js/layout.js?v=20261016-subtitles';
import {matchArticle,searchExcerpt,mergeTagHistory,normalizeTags} from '../assets/js/catalog.js?v=20261016-subtitles';
import {createTagPicker} from '../assets/js/tag-picker.js?v=20261016-subtitles';
import {api} from '../assets/js/auth.js?v=20261015-protection';

export async function renderArticles(container,params=new URLSearchParams(),options={}){
  const [modules,articles,index,registry]=await Promise.all([loadModules(),loadArticles(),loadSearchIndex(),loadTagHistory()]);
  const module=options.announcements?{slug:'announcements',title:'公告栏',description:'喵喵屋的网站动态与公告，由管理员编辑发布。'}:options.module?modules.find(item=>item.slug===options.module):null;
  if(options.module&&!module){container.replaceChildren(el('div',{class:'wrap'},[pageHead('模块不存在','请从知识模块重新选择。')]));return;}
  let activeModule=module?.slug||params.get('module')||'all',keyword=params.get('q')||'',tags=normalizeTags(params.getAll('tag'),20);
  if(activeModule!=='all'&&activeModule!=='announcements'&&!modules.some(item=>item.slug===activeModule))activeModule='all';
  const history=mergeTagHistory([...modules,{slug:'announcements'}],registry,articles),decorated=decorateModules(modules,articles),wrap=el('div',{class:'wrap'});
  if(module)wrap.append(breadcrumbs([{label:'首页',href:'/'},...(options.announcements?[]:[{label:'知识模块',href:'/modules/'}]),{label:module.title}]));
  wrap.append(pageHead(module?.title||(options.search?'搜索文章':'全部文章'),module?.description||'搜索标题、正文和标签，也可以组合关键词与分类筛选。'));
  const filters=el('div',{class:'filters'}),chips=el('div',{class:'module-filters'});
  const search=el('input',{class:'search-input',type:'search',placeholder:'搜索正文、标题或关键词…',value:keyword,'aria-label':'搜索文章'});
  if(!module){
    for(const item of [{slug:'all',title:'全部'},...decorated]){
      const chip=el('button',{class:'filter-chip',type:'button',text:item.title+(item.count!=null?' ('+item.count+')':''),'aria-pressed':String(activeModule===item.slug),dataset:{module:item.slug}});
      chip.addEventListener('click',()=>{activeModule=item.slug;tags=[];picker=makePicker();tagMount.replaceChildren(picker.element);syncUrl();draw();});
      chips.append(chip);
    }
    filters.append(chips);
  }
  filters.append(search);wrap.append(filters);
  const tagMount=el('div'),results=el('div',{'aria-live':'polite'});let picker;
  const tagHistory=()=>activeModule==='all'?normalizeTags(Object.values(history).flat()):history[activeModule]||[];
  function makePicker(){
    return createTagPicker({label:module?'模块标签与筛选':'标签筛选',allowCreate:Boolean(module&&window.__LEMONCAT_USER__&&(!options.announcements||window.__LEMONCAT_USER__.role==='admin')),selected:tags,history:tagHistory(),onChange:values=>{tags=values;syncUrl();draw();},
      ...(module&&window.__LEMONCAT_USER__&&(!options.announcements||window.__LEMONCAT_USER__.role==='admin')?{onCreate:async tag=>{const response=await api('/api/tags',{method:'POST',body:{module:module.slug,tag}});history[module.slug]=response.tags;return response.tags;}}:{})});
  }
  picker=makePicker();tagMount.append(picker.element);wrap.append(tagMount);
  const write=module&&(!options.announcements||window.__LEMONCAT_USER__?.role==='admin')?el('a',{text:options.announcements?'发布公告':'在此模块写文章'}):null;
  if(module)wrap.append(el('p',{class:'field-hint'},[document.createTextNode('筛选同时包含所选标签的文章。 '),write]));
  wrap.append(results);container.replaceChildren(wrap);
  function syncUrl(){
    const query=new URLSearchParams();if(!module&&activeModule!=='all')query.set('module',activeModule);if(keyword.trim())query.set('q',keyword.trim());for(const tag of tags)query.append('tag',tag);
    const suffix=query.toString(),path=options.announcements?'/announcements/':module?'/module/'+module.slug+'/':options.search?'/search/':'/articles/';
    historyReplace(path+(suffix?'?'+suffix:''));
  }
  function historyReplace(url){window.history.replaceState(null,'',url);}
  function draw(){
    if(write){const query=new URLSearchParams(options.announcements?{kind:'announcement'}:{module:module.slug});for(const tag of tags)query.append('tag',tag);write.href='/workspace/?'+query;}
    chips.querySelectorAll('[data-module]').forEach(chip=>chip.setAttribute('aria-pressed',String(chip.dataset.module===activeModule)));
    const filtered=articles.filter(article=>(activeModule==='all'||article.module===activeModule)&&matchArticle(article,index[article.slug]||'',keyword,tags));
    results.replaceChildren(el('p',{class:'field-hint',text:filtered.length+' 篇文章'}));
    if(filtered.length)results.append(articleList(filtered.map(article=>({...article,summary:searchExcerpt(article,index[article.slug]||'',keyword)}))));
    else results.append(emptyState('没有匹配的文章','试试其他关键词或移除已选标签。'));
  }
  search.addEventListener('input',debounce(()=>{keyword=search.value;syncUrl();draw();},180));draw();
}
export const renderSearch=(container,params)=>renderArticles(container,params,{search:true});

export const renderAnnouncements=(container,params)=>renderArticles(container,params,{announcements:true});
