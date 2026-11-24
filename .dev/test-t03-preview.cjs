// Strictly offline T03 preview integration assertions. No network.
'use strict';
const strictAssert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let passed=0;
const assert=new Proxy(strictAssert,{get(target,key){
  const value=target[key];
  return typeof value==='function'? (...args)=>{value(...args);passed++;}:value;
}});
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('.dev/t03-preview/index.html');
const css=read('.dev/t03-preview/style.css');
const app=read('.dev/t03-preview/preview.js');
const storeSrc=read('assets/js/reading-store.js');
for(const [label,source] of [['HTML',html],['CSS',css],['preview JS',app],['reading store',storeSrc]]) {
  assert.doesNotMatch(source,/(https?:\/\/|supabase\.co|sb_publishable_|sb_secret_|service_role|weibeifen\.com)/i,label+' must not reference a production or external endpoint');
}
assert.match(html,/connect-src 'none'/,'CSP must forbid all API or fetch connections');
assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
assert.doesNotMatch(html,/<iframe|<form|<script(?![^>]*src=)/i);
assert.doesNotMatch(app,/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsupabase\b/i);
assert.match(html,/src="\.\/reading-store\.js"/);
assert.match(html,/src="\.\/preview\.js"/);
const mem=new Map();
const localStorage={
  get length(){return mem.size;},
  key:i=>[...mem.keys()][i],
  getItem:k=>mem.has(k)?mem.get(k):null,
  setItem:(k,v)=>mem.set(k,String(v)),
  removeItem:k=>mem.delete(k)
};
const elements={};
const handlers={};
const document={
  getElementById:id=>elements[id]||(elements[id]={textContent:'',dataset:{}}),
  addEventListener:(name,fn)=>{handlers[name]=fn;},
  querySelectorAll:()=>[{},{}]
};
const window={addEventListener(){}};
const context=vm.createContext({window,document,localStorage,console,Date});
vm.runInContext(storeSrc,context,{filename:'reading-store.js'});
vm.runInContext(app,context,{filename:'preview.js'});
const store=window.WBReadingStore;
function click(action){
  const button={dataset:{action},closest:()=>button};
  handlers.click({target:button});
}
assert.equal(store.identity().state,'guest');
click('read');
assert.ok(store.listLast()['preview-demo']);
click('a');
assert.equal(store.identity().uid,'fakeuser-A');
assert.equal(store.listLast()['preview-demo'],undefined);
click('read');
click('b');
assert.equal(store.identity().uid,'fakeuser-B');
assert.equal(store.listLast()['preview-demo'],undefined);
click('guest');
assert.ok(store.listLast()['preview-demo']);
click('run-checks');
assert.match(elements.report.textContent,/5\/5 通過/);
click('unknown');
assert.equal(store.identity().state,'unknown');
assert.equal(store.syncKey(),null);
click('clear-demo');
assert.equal(store.identity().state,'guest');
assert.equal(store.listLast()['preview-demo'],undefined);
assert.equal([...mem.keys()].filter(k=>k.includes('preview-demo')).length,0);
console.log('T03 standalone preview safety and UI fake integration: '+passed+'/'+passed+' passed (local only).');
