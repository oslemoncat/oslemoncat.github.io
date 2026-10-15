import {renderArticles} from './articles.js?v=20261015-catalog';
export const renderModule=(container,slug,params=new URLSearchParams())=>renderArticles(container,params,{module:slug});
