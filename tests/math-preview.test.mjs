import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom} from './dom-shim.mjs';
import {renderMarkdown,renderMath} from '../assets/js/markdown.js';
const sample=String.raw`行内 $a_n=\frac{1}{n}$，正文继续。

$$
\lim_{n\to\infty}\frac{1}{n}=0
$$

\`\`\`python
print("$not_math$")
\`\`\`
`.replaceAll('\\`','`');
function fixture(){const env=installDom({repoRoot:process.cwd(),port:'57040'}),root=env.document.createElement('div');root.innerHTML=renderMarkdown(sample).html;env.document.body.appendChild(root);return {...env,root};}
const script=doc=>doc.querySelectorAll('script').find(node=>(node.getAttribute('src')||'').includes('katex.min.js'));

test('Pasted Markdown math stays readable before the library loads, then typesets without changing code or TeX',async()=>{
 const f=fixture(),nodes=f.root.querySelectorAll('.math-inline, .math-display'),pending=renderMath(f.root),calls=[];
 assert.equal(nodes.length,2);assert.equal(nodes[0].textContent,'$a_n=\\frac{1}{n}$');assert.equal(nodes[1].textContent,'$$\\lim_{n\\to\\infty}\\frac{1}{n}=0$$');
 assert.equal(f.root.querySelector('code').textContent,'print("$not_math$")');
 f.window.katex={render(tex,node,options){calls.push({tex,options});node.textContent='排版:'+tex;}};script(f.document).dispatchEvent({type:'load'});await pending;
 assert.equal(calls.length,2);assert.equal(calls[0].options.displayMode,false);assert.equal(calls[1].options.displayMode,true);assert.equal(calls[0].options.trust,false);
 assert.ok(nodes.every(node=>!node.classList.contains('math-error')));assert.equal(nodes[0].getAttribute('data-tex'),'a_n=\\frac{1}{n}');assert.equal(sample.includes('\\frac'),true);
});

test('An unavailable formula library preserves readable formulas and a later preview can retry',async()=>{
 const f=fixture(),pending=renderMath(f.root);script(f.document).dispatchEvent({type:'error'});await pending;
 assert.match(f.root.textContent,/\\lim/);assert.equal(f.root.querySelectorAll('.math-error').length,2);assert.equal(script(f.document),undefined);
 const retried=renderMath(f.root);assert.ok(script(f.document));f.window.katex={render(tex,node){node.textContent=tex;}};script(f.document).dispatchEvent({type:'load'});await retried;
 assert.equal(f.root.querySelectorAll('.math-error').length,0);
});

test('Concurrent writing and review previews share a single library request',async()=>{
 const f=fixture(),other=f.document.createElement('div');other.innerHTML=renderMarkdown('$x^2$').html;
 const pending=[renderMath(f.root),renderMath(other)];assert.equal(f.document.querySelectorAll('script').length,1);assert.equal(f.document.querySelectorAll('link').length,1);
 f.window.katex={render(tex,node){node.textContent=tex;}};script(f.document).dispatchEvent({type:'load'});await Promise.all(pending);assert.equal(other.textContent,'x^2');
});

test('Plain text and explicitly disabled math never request the formula library',async()=>{
 const f=fixture(),plain=f.document.createElement('div');plain.textContent='普通正文';await renderMath(plain);assert.equal(script(f.document),undefined);
 await renderMath(f.root,{enabled:false});assert.equal(script(f.document),undefined);assert.match(f.root.textContent,/\\frac/);
});

test('Existing loaded formula rendering is reused safely across repeated previews',async()=>{
 const f=fixture(),calls=[];f.window.katex={render(tex,node,options){calls.push(options);node.textContent=tex;}};
 await renderMath(f.root);f.root.innerHTML=renderMarkdown('$\\sqrt{2}$').html;await renderMath(f.root);
 assert.equal(script(f.document),undefined);assert.equal(f.root.textContent,'\\sqrt{2}');assert.ok(calls.every(options=>options.trust===false&&options.throwOnError===false));
});
