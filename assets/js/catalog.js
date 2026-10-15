// Shared text matching and tag normalization; also used by the static build.
export function normalizeTags(values,limit=200){
  const seen=new Set(),result=[];
  for(const value of Array.isArray(values)?values:[]){
    if(typeof value!=='string')continue;
    const tag=value.normalize('NFKC').trim().replace(/\s+/g,' '),key=tag.toLowerCase();
    if(!tag||tag.length>40||/[\u0000-\u001f\u007f]/.test(tag)||seen.has(key))continue;
    seen.add(key);result.push(tag);if(result.length===limit)break;
  }
  return result;
}
export function mergeTagHistory(modules,registry={},posts=[]){
  return Object.fromEntries(modules.map(module=>[module.slug,normalizeTags([
    ...(Object.hasOwn(registry,module.slug)?registry[module.slug]:[]),
    ...posts.filter(post=>(post.meta||post).module===module.slug).flatMap(post=>(post.meta||post).tags||[])
  ]).sort((a,b)=>a.localeCompare(b,'zh-CN'))]));
}
export const searchText=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export function matchArticle(article,body,query,tags=[]){
  const own=new Set((article.tags||[]).map(searchText));
  if(tags.some(tag=>!own.has(searchText(tag))))return false;
  const haystack=searchText([article.title,article.summary,article.moduleTitle,...(article.tags||[]),body].join(' '));
  return searchText(query).split(' ').filter(Boolean).every(word=>haystack.includes(word));
}
export function searchExcerpt(article,body,query){
  const text=String(body||'').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[#*`>_]/g,'').replace(/\s+/g,' ').trim();
  if(!query.trim())return article.summary;
  const terms=searchText(query).split(' '),at=terms.map(term=>searchText(text).indexOf(term)).find(index=>index>=0);
  if(at===undefined)return article.summary;
  const start=Math.max(0,at-35);return (start?'…':'')+text.slice(start,start+155)+(text.length>start+155?'…':'');
}
