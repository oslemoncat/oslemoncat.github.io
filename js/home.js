import {el} from '../assets/js/util.js';
import {loadSite,loadModules,loadArticles,decorateModules} from '../assets/js/content.js';
import {sectionHead,moduleCard,articleList} from '../assets/js/layout.js?v=20261009-module-cards-v2';
export async function renderHome(container){
 const [site,modules,articles]=await Promise.all([loadSite(),loadModules(),loadArticles()]);
 const hero=el('section',{class:'hero'},[el('div',{class:'wrap hero__inner'},[
  el('h1',{class:'hero__title',text:site.title}),
  el('p',{class:'hero__lead',text:'把学到的知识、走过的弯路，留在这里。'}),
  el('div',{class:'hero__actions'},[el('a',{class:'btn btn--primary',href:'#/modules',text:'浏览知识模块'}),el('a',{class:'btn btn--ghost',href:'/workspace/',text:'写一篇文章'})]),
 ])]);
 const wrap=el('div',{class:'wrap home-sections'},[
  el('section',{class:'section'},[sectionHead('知识模块',{more:{href:'#/modules',label:'查看全部'}}),el('div',{class:'grid module-grid'},decorateModules(modules,articles).map((m,i)=>moduleCard(m,i)))]),
  el('section',{class:'section'},[sectionHead('最近更新',{more:{href:'#/articles',label:'查看全部'}}),articles.length?articleList(articles.slice(0,5)):el('p',{class:'empty',text:'还没有文章，写下第一篇学习记录吧。'})]),
 ]);container.replaceChildren(hero,wrap);
}