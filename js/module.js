import {renderArticles} from './articles.js?v=20261016-subtitles';
export const renderModule=(container,slug,params=new URLSearchParams())=>renderArticles(container,params,{module:slug});
