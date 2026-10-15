import {renderArticles} from './articles.js?v=20261015-protection';
export const renderModule=(container,slug,params=new URLSearchParams())=>renderArticles(container,params,{module:slug});
