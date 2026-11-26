/* Published research registry: no planned or historical article URLs. */
(function(){
'use strict';
var rows={};try{rows=JSON.parse(document.getElementById('wb-research-index').textContent);}catch(e){}
function resolve(path){if(typeof path!=='string')return null;try{var u=new URL(path,location.origin);if(u.origin!==location.origin||!Object.prototype.hasOwnProperty.call(rows,u.pathname)||!rows[u.pathname])return null;return Object.assign({path:u.pathname},rows[u.pathname]);}catch(e){return null;}}
window.WBResearch={resolve:resolve,rows:rows};
var r=resolve(location.pathname), store=window.WBReadingStore, body=document.querySelector('.lit-body');
if(!r||r.kind!=='article'||!store||!body)return;
var path=location.pathname, owner=store.identity(), timer, active=true;
function current(){var n=store.identity();return active&&n.version===owner.version&&n.state===owner.state&&n.uid===owner.uid;}
function record(){if(!current())return;store.write('last',r.id,JSON.stringify({url:path,no:String(r.rank),title:r.title,t:Date.now()}));}
function ratio(){var rect=body.getBoundingClientRect();return Math.max(0,Math.min(1,(innerHeight-rect.top)/Math.max(1,rect.height)));}
function keep(){if(!current())return;var p=ratio();store.write('pos',path,String(p));if(p>=.95)store.write('read',path,'1');}
record();
store.onChange(function(){var n=store.identity();if(owner.state==='unknown'&&n.state==='member'){owner=n;record();}else if(n.version!==owner.version){active=false;clearTimeout(timer);}});
addEventListener('scroll',function(){clearTimeout(timer);timer=setTimeout(keep,250);},{passive:true});addEventListener('pagehide',keep);
var old=Number(store.read('pos',path));if(old>.05&&old<.95&&!location.hash){var b=document.createElement('button');b.type='button';b.className='mb-btn';b.textContent='回到上次閱讀位置';body.before(b);b.onclick=function(){if(!current())return;scrollTo(0,scrollY+body.getBoundingClientRect().top+old*body.offsetHeight-innerHeight);b.remove();};store.onChange(function(){if(!current())b.remove();});}
})();
