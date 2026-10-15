import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTags,mergeTagHistory,matchArticle,searchExcerpt} from '../assets/js/catalog.js';

test('Tag choices normalize full-width text, deduplicate case and preserve C# / C++',()=>{
 assert.deepEqual(normalizeTags([' C++ ','Ｃ＋＋','C#','Ｃ＃','Python','python','数列　极限']),['C++','C#','Python','数列 极限']);
 assert.deepEqual(normalizeTags(['','x'.repeat(41),null]),[]);
});
test('Module histories remain independent and retain saved or archived labels',()=>{
 const result=mergeTagHistory([{slug:'math'},{slug:'python'}],{math:['历史']},[{meta:{module:'math',tags:['极限'],draft:true}},{meta:{module:'python',tags:['Python']}}]);
 assert.deepEqual(new Set(result.math),new Set(['历史','极限']));assert.deepEqual(result.python,['Python']);
});
test('Search finds partial title, body and tags with multiple case-insensitive words',()=>{
 const article={title:'开始营业',summary:'一段介绍',moduleTitle:'杂记',tags:['C++','柠檬猫']},body='这里分享线性空间以及 Python 的实践。';
 for(const query of ['营业','线性','python','柠檬','C++','营业 Python','PYTH'])assert.equal(matchArticle(article,body,query),true,query);
 assert.equal(matchArticle(article,body,'不存在'),false);assert.equal(matchArticle(article,body,'Python 不存在'),false);
});
test('Tag filtering combines with search and requires all selected tags',()=>{
 const article={title:'学习',tags:['Python','自动化']};assert.equal(matchArticle(article,'脚本实践','脚本',['python','自动化']),true);
 assert.equal(matchArticle(article,'脚本实践','脚本',['C#']),false);assert.equal(matchArticle(article,'脚本实践','不存在',['Python']),false);
});
test('Search excerpts include body matches without changing the original body',()=>{
 const body='前言 '.repeat(30)+'只在正文出现的关键词'+ ' 结束'.repeat(50),article={summary:'默认摘要'};
 assert.match(searchExcerpt(article,body,'关键词'),/关键词/);assert.equal(searchExcerpt(article,body,''),'默认摘要');assert.equal(body.includes('关键词'),true);
});
