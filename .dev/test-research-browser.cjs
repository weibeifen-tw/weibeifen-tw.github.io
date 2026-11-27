// Rendered Jekyll fixture only, all remote requests blocked.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(process.argv[2]||'_site');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let f=path.resolve(root,'.'+p);
 if(!f.startsWith(root+path.sep)&&f!==root){res.writeHead(403);return res.end();}
 if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');
 res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));
 }catch(e){res.writeHead(404);res.end('not found');}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [390,1280]){
 const ctx=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 await ctx.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/literature/indigenous/v01/',{waitUntil:'load'});
 assert.equal(await page.locator('[data-ind-piece]').count(),8);
 assert.equal(await page.locator('[data-ind-piece] > a').count(),2);
 assert.equal(await page.locator('.ind-pending a').count(),0);
 assert.equal(await page.locator('.wb-page-nav').count(),0);
 assert.equal(await page.locator('.ind-volume-crumb .wb-reader-back').count(),1);
 await page.locator('[data-research-dialog="volume-limits"]').click();
 assert.equal(await page.locator('#volume-limits').isVisible(),true);
 await page.locator('#volume-limits button').click();
 await page.locator('[data-research-dialog="volume-errata"]').click();
 assert.equal(await page.locator('#volume-errata').isVisible(),true);
 await page.locator('#volume-errata button').click();
 assert.equal((await page.locator('.ind-volume-crumb').textContent()).trim(),'〈 返回研究典藏');
 assert.equal(await page.locator('.ind-volume-head .ind-volume-intro').count(),1);
 const cover=await page.locator('.ind-volume-head img').boundingBox(),intro=await page.locator('.ind-volume-intro').boundingBox();
 assert.ok(width>=768?intro.x>=cover.x+cover.width:intro.y>=cover.y+cover.height);
 assert.equal(await page.locator('.ind-volume-share').count(),0);
 assert.equal(await page.locator('.research-actions .act.share').count(),1);
 assert.equal(await page.locator('.research-actions .act.cmt').count(),1);
 assert.ok(await page.locator('.ind-volume-crumb').evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.ind-volume-head').getBoundingClientRect().top));
 await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:async x=>{window.__shared=x.url;}});});
 await page.locator('.research-actions .act.share').click();
 assert.equal(await page.evaluate(()=>window.__shared),origin+'/literature/indigenous/v01/');
 assert.equal(await page.locator('.ind-volume-page > #comments').count(),0);
 assert.equal(await page.locator('header.top .search-btn').isVisible(),true);
 assert.equal(await page.locator('.wb-catalog-open, .wb-catalog-dialog, .wb-toc-chapter').count(),0);
 assert.ok(await page.locator('.ind-volume-toc').evaluate(e=>e.getBoundingClientRect().top>document.querySelector('.ind-reading-progress').getBoundingClientRect().bottom));
 assert.equal(await page.locator('[data-ind-piece="1.1"] > a').isVisible(),true);
 await page.locator('[data-ind-piece="1.1"] > a').click();
 await page.waitForURL('**/literature/ind-test-a/');
 assert.equal(await page.locator('.lit-time,.lit-share,.lit-share-btn,.lit-kind').count(),0);
 assert.deepEqual(await page.locator('.research-actions .actions > button').evaluateAll(es=>es.map(e=>e.classList[1])),['like','cmt','share']);
 assert.equal(await page.locator('.research-actions .act.cmt').isVisible(),true);
 await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:async x=>{window.__shared=x.url;}});});
 await page.locator('.research-actions .act.share').click();
 assert.equal(await page.evaluate(()=>window.__shared),origin+'/literature/ind-test-a/');
 assert.equal(await page.locator('.r-toc').evaluate(e=>e.open),false);
 assert.equal(await page.locator('.wb-page-nav,.lit-toc,.lit-series,[data-toc-mode]').count(),0);
 await page.locator('.r-toc > summary').click();
 assert.equal(await page.locator('.r-toc [data-ind-piece]').count(),8);
 assert.equal(await page.locator('.r-toc [aria-current="page"]').count(),1);
 await page.locator('.r-toc > summary').click();
 assert.equal(await page.locator('.wb-reader-back').getAttribute('href'),'/literature/indigenous/v01/');
 await page.locator('.fs [data-fs="l"]').click();
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.fs),'l');
 const big=await page.locator('.lit-body').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
 await page.locator('.fs [data-fs="s"]').click();
 assert.ok(await page.locator('.lit-body').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))<big);
 await page.locator('.theme-btn').click();
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'night');
 await page.locator('.theme-btn').click();
 assert.equal(await page.locator('.research-refs').evaluate(e=>e.open),false);
 await page.locator('.lit-body a[href="#ref-1"]').click();
 assert.equal(await page.locator('.research-refs').evaluate(e=>e.open),true);
 assert.equal(await page.locator('#ref-1').count(),1);
 assert.equal(await page.locator('.research-errata-form').count(),0);
 assert.equal(await page.locator('.research-version-toggle').count(),1);
 await page.locator('.research-version-toggle').click();
 assert.equal(await page.locator('#research-version-log').isVisible(),true);
 await page.locator('.research-version-toggle').click();
 assert.equal(await page.locator('#research-version-log').isVisible(),false);
 assert.equal(await page.locator('.lit-meta .lit-cat').count(),0);
 assert.equal(await page.evaluate(()=>window.WBResearch.completion('indigenous-v01',window.WBReadingStore).total),2);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'horizontal overflow at '+width);
 assert.deepEqual(errors,[],'page JS errors at '+width);
 await page.goto(origin+'/literature/indigenous/',{waitUntil:'load'});
 assert.equal(await page.locator('.ind-resume,.ind-zone,.ind-fine').count(),0);
 await page.goto(origin+'/shelf/');
 await page.locator('.shelf-tabs button').nth(1).click();
 assert.equal(await page.locator('.research-shelf-item a[href="/literature/ind-test-a/"]').isVisible(),true);
 assert.equal(await page.locator('.shelf-tabs button').nth(1).textContent(),'研究室');
 assert.equal(await page.locator('.shelf-research-pane h3').count(),0);
 assert.equal(await page.locator('.research-shelf-item a>small').textContent(),'讀到第 1.1 篇');
 assert.equal(await page.getByRole('button',{name:'復原這台裝置的舊閱讀紀錄'}).count(),0);
 await page.goto(origin+'/literature/indigenous/');
 assert.equal(await page.locator('.wb-page-nav').count(),0);
 assert.equal(await page.locator('.wb-catalog-open,.wb-catalog-dialog,[data-ind-piece]').count(),0);
 assert.equal(await page.locator('.ind-shelf .bk').count(),7);
 await page.goto(origin+'/literature/indigenous/v01/');
 assert.equal(await page.locator('.ind-start').textContent(),'繼續閱讀');
 assert.equal(await page.locator('.ind-start').getAttribute('href'),'/literature/ind-test-a/');
 assert.equal(await page.locator('[data-ind-piece="1.1"] > a').evaluate(e=>e.classList.contains('here')),true);
 await page.goto(origin+'/literature/ind-test-b/');
 assert.equal(await page.locator('.r-next').getAttribute('href'),'/literature/indigenous/v01/');
 await page.goto(origin+'/literature/indigenous/v07/');
 assert.equal(await page.locator('[data-ind-piece]').count(),155);
 assert.equal(await page.locator('.wb-toc-chapter').count(),16);
 assert.equal(await page.locator('.wb-toc-chapter[open]').count(),0);
 await page.locator('.wb-toc-chapter > summary').nth(0).click();
 await page.locator('.wb-toc-chapter > summary').nth(1).click();
 assert.equal(await page.locator('.wb-toc-chapter[open]').count(),2);
 assert.equal(await page.locator('.ind-start').isDisabled(),true);
 assert.deepEqual(errors,[],'page JS errors at '+width);
 await page.goto(origin+'/literature/');
 assert.equal(await page.locator('.lit-filter-results').isVisible(),false);
 assert.deepEqual(await page.locator('.drawer .d-sec').allTextContents(),['探索','個人功能']);
 assert.equal(await page.locator('.drawer .d-candy').count(),0);
 assert.equal(await page.locator('.foot p').count(),2);
 assert.equal(await page.locator('.foot a[href="https://portaly.cc/weibeifen/support"]').textContent(),'贊助 → 請MU吃糖果');
 assert.equal(await page.locator('header.top .search-btn').isVisible(),true);
 // Real rendered novel: keep existing list, native reading directory, and theme/font behavior.
 const posts=JSON.parse(fs.readFileSync(path.join(root,'assets/posts.json'),'utf8'));
 const novel=Object.values(posts).find(p=>p.n&&p.u&&fs.existsSync(path.join(root,p.u.replace(/^\//,''),'index.html')));
 assert.ok(novel,'published novel fixture');
 await page.goto(origin+'/novel/'+novel.n+'/');
 assert.ok(await page.locator('.nv-list a.chapter.toc').count()>0);
 await page.goto(origin+novel.u);
 assert.equal(await page.locator('.r-toc').evaluate(e=>e.open),false);
 await page.locator('.r-toc > summary').click();
 await page.waitForFunction(()=>document.querySelector('.r-toc-list [aria-current="page"]'));
 await page.locator('.fs [data-fs="l"]').click();
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.fs),'l');
 await page.locator('.theme-btn').click();
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'night');
 await page.locator('.theme-btn').click();
 assert.deepEqual(errors,[],'novel regression '+width);

 // Isolated member backend: exercise actual cloud.js with a fake verified user and in-memory tables.
 const member=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 await member.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 await member.addInitScript(()=>{
   const uid='fixture-member-v17', key='sb-tqicconarhpddejxdvmf-auth-token';
   localStorage.setItem(key,JSON.stringify({user:{id:uid},refresh_token:'fake-only'}));
   const read=k=>JSON.parse(sessionStorage.getItem(k)||'[]'), save=(k,v)=>sessionStorage.setItem(k,JSON.stringify(v));
   const client={auth:{getSession:async()=>({data:{session:{user:{id:uid}}}})},rpc:async n=>({data:n==='is_banned'?false:[],error:null}),from(table){
     let mode='select',filters=[],payload;
     const q={select(){return q},eq(k,v){filters.push([k,v]);return q},limit(){return q},order(){return q},maybeSingle(){return q},insert(v){mode='insert';payload=v;return q},delete(){mode='delete';return q},upsert(v){mode='upsert';payload=v;return q},then(ok,fail){
       let rows=read('fixture:'+table), match=r=>filters.every(([k,v])=>r[k]===v), data=[];
       if(mode==='insert'){let v={...payload,user_id:uid,id:String(Date.now()),created_at:new Date().toISOString(),profiles:{display_name:'測試會員'}};rows.push(v);save('fixture:'+table,rows);}
       else if(mode==='delete'){save('fixture:'+table,rows.filter(r=>!match(r)));}
       else if(mode==='upsert'){save('fixture:'+table,payload);}
       else data=rows.filter(match);
       return Promise.resolve({data,error:null}).then(ok,fail);
     }};return q;
   }};
   window.WBAuth={configProblem:()=>null,getVerifiedUser:async()=>({user:{id:uid}}),getClient:()=>client,isAdmin:async()=>false,getRole:async()=> 'reader',onChange:()=>()=>{}};
 });
 // Ensure the local comment UI is enabled without contacting any real provider.
 await member.route('**/*',async r=>{
   if(!r.request().url().startsWith(origin+'/'))return r.abort();
   if(r.request().resourceType()!=='document')return r.continue();
   const response=await r.fetch();let html=await response.text();
   html=html.replace('<script src="/assets/cloud.js','<script>window.WB_AUTH_CONFIG=Object.assign({},window.WB_AUTH_CONFIG,{supabaseUrl:"https://fixture.invalid",publishableKey:"fake"});</script><script src="/assets/cloud.js');
   return r.fulfill({response,body:html});
 });
 const mp=await member.newPage();
 await mp.goto(origin+'/literature/indigenous/v01/');
 const heart=mp.locator('.research-actions .act.like');
 await mp.waitForFunction(()=>window.WBReadingStore.identity().state==='member');
 await heart.click();
 await mp.waitForFunction(()=>JSON.parse(sessionStorage.getItem('fixture:favorites')||'[]').some(r=>r.path==='/literature/indigenous/v01/'));
 await mp.goto(origin+'/literature/ind-test-a/');
 await mp.waitForFunction(()=>document.querySelector('.research-actions .act.like')?.getAttribute('aria-pressed')==='false');
 await mp.locator('.research-actions .act.like').click();
 await mp.waitForFunction(()=>JSON.parse(sessionStorage.getItem('fixture:favorites')||'[]').length===2);
 await mp.goto(origin+'/favorites/');
 await mp.waitForSelector('.fav-list .shelf-tabs button');
 await mp.locator('.fav-list .shelf-tabs button').nth(1).click();
 assert.equal(await mp.locator('.fav-list .fav-collection-pane a[href="/literature/indigenous/v01/"]').count(),1);
 await mp.locator('.fav-list .fav-group summary').click();
 assert.equal(await mp.locator('.fav-list a[href="/literature/ind-test-a/"]').isVisible(),true);
 await mp.goto(origin+'/literature/ind-test-a/');
 await mp.waitForFunction(()=>document.querySelector('.research-actions .act.like')?.getAttribute('aria-pressed')==='true');
 await mp.locator('.research-actions .act.like').click();
 await mp.waitForFunction(()=>JSON.parse(sessionStorage.getItem('fixture:favorites')||'[]').length===1);
 assert.equal(await mp.evaluate(()=>JSON.parse(sessionStorage.getItem('fixture:favorites'))[0].path),'/literature/indigenous/v01/');

 await mp.locator('.research-actions .act.cmt').click();
 const articleForm=mp.locator('#comments .cm-form');
 await articleForm.locator('textarea').fill('隔離測試：文章留言');
 await articleForm.locator('.cm-send').click();
 await mp.waitForFunction(()=>JSON.parse(sessionStorage.getItem('fixture:comments')||'[]').some(r=>r.path==='/literature/ind-test-a/'&&r.body==='隔離測試：文章留言'));
 await mp.goto(origin+'/literature/indigenous/v01/');
 await mp.locator('.research-actions .act.cmt').click();
 await mp.locator('#comments .cm-form textarea').fill('隔離測試：卷冊留言');
 await mp.locator('#comments .cm-send').click();
 await mp.waitForFunction(()=>JSON.parse(sessionStorage.getItem('fixture:comments')||'[]').some(r=>r.path==='/literature/indigenous/v01/'&&r.body==='隔離測試：卷冊留言'));
 await mp.waitForFunction(()=>document.querySelector('#comments .cm-list')?.textContent.includes('隔離測試：卷冊留言'));
 assert.equal(await mp.locator('#comments .cm-list').textContent().then(s=>s.includes('隔離測試：文章留言')),false);
 await mp.goto(origin+'/literature/ind-test-a/');
 await mp.locator('.research-actions .act.cmt').click();
 await mp.waitForFunction(()=>document.querySelector('#comments .cm-list')?.textContent.includes('隔離測試：文章留言'));
 assert.equal(await mp.locator('#comments .cm-list').textContent().then(s=>s.includes('隔離測試：卷冊留言')),false);
 await mp.evaluate(({path,novel})=>{const rows=JSON.parse(sessionStorage.getItem('fixture:comments')||'[]');rows.push({id:'novel-comment',user_id:'fixture-member-v17',novel,path,body:'小說留言測試',created_at:'2026-11-20T00:00:00Z'});sessionStorage.setItem('fixture:comments',JSON.stringify(rows));},{path:novel.u,novel:novel.n});
 await mp.goto(origin+'/my-comments/');
 await mp.waitForFunction(()=>document.querySelector('.mycm-list')?.textContent.includes('小說留言測試'));
 const novelLabel=await mp.locator('.mycm-head a[href="'+novel.u+'#comments"]').textContent();
 assert.match(novelLabel,/^《.+》第 .+ 篇$/);
 assert.equal(await mp.locator('.mycm-head a[href="/literature/ind-test-a/#comments"]').textContent(),'《島嶼與人群的起源》第 1.1 篇');
 await member.close();
 await ctx.close();console.log('BUILD07 research rendered browser '+width+'px passed');
 }
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
