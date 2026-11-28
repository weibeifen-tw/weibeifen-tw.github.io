// V2.2 real script integration with synthetic pages and fake accounts only.
'use strict';
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.join(__dirname,'..');
const assets={};
for(const name of ['assets/js/reading-store.js','assets/app.js','assets/js/novel-reading.js','assets/member.js'])
  assets['/'+name]=fs.readFileSync(path.join(root,name));
const SESSION='sb-tqicconarhpddejxdvmf-auth-token';
const status={version:1,chapters:{'/t/demo01/':{status:'published',url:'/t/demo01/',novel:'demo',chapter:1}},withdrawn:{},remaps:{}};
const session=id=>JSON.stringify({user:{id},refresh_token:'fake-local-only'});
const fakeAuth='<script>window.WBAuth={configProblem:()=>null,getVerifiedUser:async()=>{'+
  'let id=null;try{id=JSON.parse(localStorage.getItem("'+SESSION+'")||"null")?.user?.id||null}catch(e){}'+
  'return {user:id?{id:id,email:id+"@example.invalid",provider:"google"}:null,error:null}},'+
  'getRole:async()=>"reader",getMyProfile:async()=>{const v=await window.WBAuth.getVerifiedUser();'+
  'const id=v.user?.id||"";return {profile:{id,display_name:id==="fakeuser-A"?"假會員甲":"假會員乙",'+
  'username:"test",avatar_color:"blue"}}},onChange:fn=>{window.__fakeAuthEvent=fn;return()=>{}},'+
  'signOut:async()=>{localStorage.removeItem("'+SESSION+'");window.__fakeAuthEvent?.("SIGNED_OUT",null);return {error:null}}'+
  '};</script>';
function html(type){
 const meta='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<script id="chars" type="application/json">{}</script><script id="novels" type="application/json">'+
  '{"demo":{"title":"假資料測試作品"}}</script>'+
  '<script>window.BASE="";window.VER="fixture";window.SPLIT=[];'+
  (type==='novel'?'window.NOVEL="demo";':'')+'</script>';
 const chapter='<section class="chapter read" data-novel="demo" data-char="fake" data-no="1" data-title="假資料章節">'+
  '<div class="ch-text" style="height:2500px">測試用占位文字，非真實小說正文。</div></section>';
 const shelf='<div class="shelf-list"></div>';
 const novel='<div class="feed"><div class="nv-list"><a class="chapter" href="/t/demo01/">第 1 篇</a></div>'+
  '<div class="nv-btns"></div><div class="empty" hidden></div></div>';
 const member='<section class="member-page"><div class="mb-card"></div><div class="mb-note" hidden></div>'+
  '<div class="mb-future" hidden></div></section>';
 return '<!doctype html><html><head>'+meta+'</head><body>'+
  (type==='chapter'?chapter:type==='shelf'?shelf:type==='novel'?novel:member)+fakeAuth+
  '<script src="/assets/js/reading-store.js"></script><script src="/assets/app.js"></script>'+
  (type==='chapter'?'<script src="/assets/js/novel-reading.js"></script>':'')+'<script src="/assets/member.js"></script></body></html>';
}
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://127.0.0.1').pathname;
 if(assets[p]){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(assets[p]);}
 if(p==='/assets/chapter-status.json'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(status));}
 if(p==='/t/demo01/'||p==='/shelf/'||p==='/member/'||p==='/novel/demo/'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html(p==='/t/demo01/'?'chapter':p==='/shelf/'?'shelf':p==='/novel/demo/'?'novel':'member'));
 }
 res.writeHead(404);res.end('fake-only, not found');
});
let total=0;
function check(value,label){assert.ok(value,label);total++;}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await ctx.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push('browser: '+e.message));
 page.on('request',r=>{if(!r.url().startsWith(origin+'/'))errors.push('external network: '+r.url());});
 async function go(p){await page.goto(origin+p,{waitUntil:'load'});}
 async function verify(fn,label){check(await page.evaluate(fn),label);}
 try{
  await go('/t/demo01/');
  await verify(()=>window.WBReadingStore.identity().state==='guest'&&
    window.WBReadingStore.listLast().demo?.url==='/t/demo01/',
    'real app chapter records guest reading');
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForTimeout(480);
  await verify(()=>parseFloat(window.WBReadingStore.read('pos','/t/demo01/'))>0.1,
    'real app records guest scroll position');
  await go('/shelf/');
  await page.waitForFunction(()=>document.querySelector('.shelf-list a[href="/t/demo01/"]'));
  await verify(()=>document.querySelector('.shelf-list').textContent.includes('假資料測試作品'),
    'real shelf renders fake chapter and validates local fake status index');
  await go('/novel/demo/');
  await page.waitForFunction(()=>document.querySelector('.nv-btns a[href="/t/demo01/"]'));
  await verify(()=>document.querySelector('.nv-btns a').textContent.includes('繼續讀第 1 篇'),
    'actual novel page continue-reading resolves guest progress from fake chapter index');
  await page.evaluate(v=>localStorage.setItem(v.k,v.v),{k:SESSION,v:session('fakeuser-A')});
  await page.reload();
  await verify(()=>window.WBReadingStore.identity().state==='unknown'&&
    !document.querySelector('.shelf-list a[href="/t/demo01/"]'),
    'unknown session has no guest shelf');
  await page.evaluate(()=>window.WBReadingStore.setIdentity('member','fakeuser-A'));
  await verify(()=>!document.querySelector('.shelf-list a[href="/t/demo01/"]'),
    'A does not import guest reading records');
  await go('/t/demo01/');
  await page.evaluate(()=>window.WBReadingStore.setIdentity('member','fakeuser-A'));
  await verify(()=>window.WBReadingStore.listLast().demo?.url==='/t/demo01/',
    'real chapter pending write assigns only to verified A');
  await go('/shelf/');
  await page.evaluate(()=>window.WBReadingStore.setIdentity('member','fakeuser-A'));
  await page.waitForFunction(()=>document.querySelector('.shelf-list a[href="/t/demo01/"]'));
  await verify(()=>document.querySelector('.shelf-list').textContent.includes('假資料測試作品'),
    'real shelf sees A scoped record');
  await page.evaluate(v=>{localStorage.setItem(v.k,v.v);window.WBReadingStore.setIdentity('unknown')},
    {k:SESSION,v:session('fakeuser-B')});
  await verify(()=>!document.querySelector('.shelf-list a[href="/t/demo01/"]'),
    'switch to B removes A shelf immediately');
  await page.evaluate(()=>window.WBReadingStore.setIdentity('member','fakeuser-B'));
  await verify(()=>!window.WBReadingStore.listLast().demo&&
    !document.querySelector('.shelf-list a[href="/t/demo01/"]'),
    'verified B cannot read A record');
  await go('/member/');
  await page.waitForFunction(()=>document.querySelector('.mb-title')?.textContent.includes('假會員乙'));
  await verify(()=>window.WBReadingStore.identity().uid==='fakeuser-B'&&
    document.querySelector('.mb-title').textContent.includes('假會員乙'),
    'actual member.js paints fake verified B');
  await page.evaluate(v=>{
    localStorage.setItem(v.k,v.v);window.WBReadingStore.setIdentity('unknown');
    window.__fakeAuthEvent('SIGNED_IN',{id:'fakeuser-A'});
  },{k:SESSION,v:session('fakeuser-A')});
  await page.waitForFunction(()=>document.querySelector('.mb-title')?.textContent.includes('假會員甲'));
  await verify(()=>window.WBReadingStore.identity().uid==='fakeuser-A'&&
    !document.querySelector('.mb-title').textContent.includes('假會員乙'),
    'real member page switches B to A without stale UI');
  await page.evaluate(k=>{localStorage.removeItem(k);window.__fakeAuthEvent('SIGNED_OUT',null)},SESSION);
  await verify(()=>window.WBReadingStore.identity().state==='guest'&&
    document.querySelector('.mb-title').textContent.includes('登入你的帳號'),
    'signout hides member and restores guest');
  // V2.3 round 2: real member.js must react to a different tab's auth changes.
  await page.evaluate(v=>localStorage.setItem(v.k,v.v),
    {k:SESSION,v:session('fakeuser-A')});
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('.mb-title')?.textContent.includes('假會員甲'));
  const other=await ctx.newPage();
  other.on('pageerror',e=>errors.push('second tab: '+e.message));
  other.on('request',r=>{if(!r.url().startsWith(origin+'/'))errors.push('second tab external: '+r.url())});
  try{
    await other.goto(origin+'/member/',{waitUntil:'load'});
    await other.waitForFunction(()=>document.querySelector('.mb-title')?.textContent.includes('假會員甲'));
    check(true,'two real member.js tabs initialized as fake owner A');
    await other.evaluate(k=>localStorage.removeItem(k),SESSION);
    await page.waitForFunction(()=>document.querySelector('.mb-title')?.textContent.includes('登入你的帳號'));
    await verify(()=>window.WBReadingStore.identity().state==='guest'&&
      !document.querySelector('.mb-title').textContent.includes('假會員甲'),
      'other-tab logout immediately hides A member card and history');
    await other.evaluate(v=>localStorage.setItem(v.k,v.v),
      {k:SESSION,v:session('fakeuser-B')});
    await page.waitForFunction(()=>document.querySelector('.mb-title')?.textContent.includes('假會員乙'));
    await verify(()=>window.WBReadingStore.identity().uid==='fakeuser-B'&&
      !document.querySelector('.mb-title').textContent.includes('假會員甲'),
      'other-tab login changes page to verified B without retaining A');
    await other.evaluate(()=>localStorage.clear());
    await page.waitForFunction(()=>document.querySelector('.mb-title')?.textContent.includes('登入你的帳號'));
    await verify(()=>window.WBReadingStore.identity().state==='guest',
      'cross-tab localStorage.clear hides member and returns to guest');
  }finally{await other.close()}
  check(!errors.length,'browser JavaScript and external network errors: '+errors.join('; '));
  console.log('T03 full app synthetic pages: '+total+'/'+total+' browser integration checks passed.');
 }finally{await ctx.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
