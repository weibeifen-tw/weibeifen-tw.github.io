// Isolated service-worker regression, no production network or user data.
const assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs');
const origin='https://qa.invalid', listeners={}, stores=new Map();
let offline=false, withdrawn=[], removed=new Set(), claimed=0, skipped=0;
const absolute=x=>new URL(typeof x==='string'?x:x.url,origin).href;
class Cache {
  constructor(){this.rows=new Map();}
  async keys(){return [...this.rows.keys()].map(url=>new Request(url));}
  async match(x,o={}){const u=absolute(x);for(const [k,v] of this.rows){if(k===u||(o.ignoreSearch&&new URL(k).pathname===new URL(u).pathname))return v.clone();}}
  async put(x,v){this.rows.set(absolute(x),v.clone());}
  async delete(x){return this.rows.delete(absolute(x));}
  async addAll(xs){for(const x of xs)await this.put(x,new Response('precache:'+x));}
}
const caches={async open(n){if(!stores.has(n))stores.set(n,new Cache());return stores.get(n);},async keys(){return [...stores.keys()];},async delete(n){return stores.delete(n);},async match(x,o){for(const c of stores.values()){const v=await c.match(x,o);if(v)return v;}}};
async function fetchMock(x){if(offline)throw Error('offline');const u=new URL(absolute(x));if(u.pathname==='/withdrawn.json')return new Response(JSON.stringify({urls:withdrawn}));const res=new Response('online:'+u.pathname,{status:removed.has(u.pathname)?410:200});Object.defineProperty(res,'type',{value:'basic'});return res;}
const src=fs.readFileSync('sw.js','utf8').replace(/^---[\s\S]*?---\s*/,'').replace(/\{\{[^}]+\}\}/g,'qa');
vm.runInNewContext(src,{URL,Request,Response,Date,Promise,caches,fetch:fetchMock,location:{origin},self:{addEventListener:(n,f)=>listeners[n]=f,clients:{claim:async()=>{claimed++;}},skipWaiting:()=>{skipped++;}}});
async function event(n,props={}){const pending=[];let response;listeners[n]({...props,waitUntil:p=>pending.push(p),respondWith:p=>{response=p;}});const result=await response;for(let i=0;i<pending.length;i++)await pending[i];return result;}
const nav=p=>event('fetch',{request:{url:absolute(p),method:'GET',mode:'navigate'}});
(async()=>{
 await event('install');assert.equal(skipped,0);
 const pages=await caches.open('wb-pages');
 await pages.put('/member.html',new Response('private'));
 await pages.put('/t/withdrawn/',new Response('old'));
 withdrawn=['/t/withdrawn/'];
 await caches.open('wb-static-old');
 await event('activate');
 assert.equal(claimed,1);assert.equal(await pages.match('/member.html'),undefined);assert.equal(await pages.match('/t/withdrawn/'),undefined);assert.ok(!(await caches.keys()).includes('wb-static-old'));
 await nav('/t/example/');assert.ok(await pages.match('/t/example/'));
 offline=true;assert.equal(await (await nav('/t/example/')).text(),'online:/t/example/');
 assert.equal(await (await nav('/member/')).text(),'precache:/offline/');
 assert.equal(await (await nav('/member.html')).text(),'precache:/offline/');
 assert.equal(await (await nav('/t/never/')).text(),'precache:/offline/');
 offline=false;await nav('/admin/');assert.equal(await pages.match('/admin/'),undefined);
 await pages.put('/t/example/?x=1',new Response('old variant'));
 removed.add('/t/example/');assert.equal((await nav('/t/example/')).status,410);
 assert.equal(await pages.match('/t/example/'),undefined);assert.equal(await pages.match('/t/example/?x=1'),undefined);
 assert.equal(await event('fetch',{request:{url:'https://external.invalid/a.json',method:'GET',mode:'cors'}}),undefined);
 await event('message',{data:'SKIP_WAITING'});assert.equal(skipped,1);
 console.log('PASS PWA mock regression: install, activation, offline, privacy, withdrawal, external bypass, update');
})().catch(e=>{console.error(e);process.exitCode=1;});
