import {el} from '../assets/js/util.js?v=20261010-publication-preview';
import {login} from '../assets/js/auth.js?v=20261010-publication-preview';
export function safeNext(value){try{const url=new URL(value||'/',location.origin);if(url.origin!==location.origin||url.pathname.startsWith('/login')||url.pathname.startsWith('/admin'))return '/';return url.pathname+url.search;}catch{return '/';}}
export function renderLogin(container, params=new URLSearchParams(), error=''){
  const status=el('p',{class:'form-status',role:'status',text:error});
  const button=el('button',{class:'btn btn--primary signin-button',type:'button',text:'使用 GitHub 登录'});
  const scene=el('section',{class:'login-scene'},[el('div',{class:'wrap'},[
    el('div',{class:'login-copy'},[
      el('h1',{text:'欢迎来到喵喵屋'}),
      el('p',{class:'login-lead',text:'用 GitHub 登录，写下你的学习与发现。'}),
      el('p',{class:'login-note',text:'文章提交后，由 Lemoncat 审核发布。'}),button,status,
    ]),
  ])]);
  button.addEventListener('click',async()=>{button.disabled=true;status.textContent='正在打开 GitHub 登录…';try{await login();location.replace(safeNext(params.get('next')));}catch(e){status.textContent=e.message;button.disabled=false;}});
  container.replaceChildren(scene);
}