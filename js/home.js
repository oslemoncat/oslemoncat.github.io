import {el} from '../assets/js/util.js?v=20261015-catalog';
import {loadSite,loadModules,loadArticles,decorateModules} from '../assets/js/content.js?v=20261015-catalog';
import {sectionHead,moduleCard,articleList} from '../assets/js/layout.js?v=20261015-catalog';
export async function renderHome(container){
 const [site,modules,articles]=await Promise.all([loadSite(),loadModules(),loadArticles()]);
 const announcements=articles.filter(article=>article.kind==='announcement'),notes=articles.filter(article=>article.kind!=='announcement');
 const hero=el('section',{class:'hero'},[el('div',{class:'wrap hero__inner'},[
  el('h1',{class:'hero__title',text:site.title}),
  el('p',{class:'hero__lead',text:'把学到的知识、走过的弯路，留在这里。'}),
  el('div',{class:'hero__actions'},[el('a',{class:'btn btn--primary',href:'#/modules',text:'浏览知识模块'}),el('a',{class:'btn btn--ghost',href:'/workspace/',text:'写一篇文章'})]),
 ])]);
 const wrap=el('div',{class:'wrap home-sections'},[
  el('section',{class:'section announcement-board','aria-label':'公告栏'},[sectionHead('公告栏',{more:{href:'/announcements/',label:'查看公告'}}),announcements.length?articleList(announcements.slice(0,3)):el('p',{class:'field-hint',text:'暂时没有公告。'}),window.__LEMONCAT_USER__?.role==='admin'?el('a',{class:'btn btn--ghost',href:'/workspace/?kind=announcement',text:'发布公告'}):null]),
  el('form',{class:'home-search',action:'/search/',method:'get',role:'search'},[el('label',{class:'home-search__label',text:'找一篇文章'},[el('input',{class:'search-input',type:'search',name:'q',placeholder:'搜索正文、标题或关键词…','aria-label':'全站搜索'})]),el('button',{class:'btn btn--ghost',type:'submit',text:'搜索'})]),
  el('section',{class:'section'},[sectionHead('知识模块',{more:{href:'#/modules',label:'查看全部'}}),el('div',{class:'grid module-grid'},decorateModules(modules,articles).map((m,i)=>moduleCard(m,i)))]),
  el('section',{class:'section'},[sectionHead('最近更新',{more:{href:'#/articles',label:'查看全部'}}),notes.length?articleList(notes.slice(0,5)):el('p',{class:'empty',text:'还没有文章，写下第一篇学习记录吧。'})]),
 ]);container.replaceChildren(hero,wrap);
}