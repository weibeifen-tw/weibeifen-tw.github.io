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
 assert.equal(await page.locator('header.top .search-btn').isVisible(),true);
 assert.equal(await page.locator('.ind-volume-toc').evaluate(e=>e.open),false);
 assert.equal(await page.locator('.wb-catalog-open').evaluate(e=>e.getBoundingClientRect().top<document.querySelector('.ind-volume-head').getBoundingClientRect().top),true);
 await page.locator('.wb-catalog-open').click();
 assert.equal(await page.locator('.ind-volume-toc').evaluate(e=>e.open),true);
 const drawer=await page.locator('.ind-volume-toc').boundingBox();
 assert.ok(width<768?Math.abs(drawer.width-width)<=2:drawer.width>=400&&drawer.width<=480);
 assert.equal(await page.locator('.wb-toc-chapter[open]').count(),0);
 await page.locator('.wb-catalog-close').click();
 assert.equal(await page.locator('.ind-volume-toc').evaluate(e=>e.open),false);
 await page.locator('.wb-catalog-open').click();
 await page.locator('.wb-toc-chapter').first().locator('summary').click();
 await page.locator('[data-ind-piece="1.1"] > a').click();
 await page.waitForURL('**/literature/ind-test-a/');
 assert.equal(await page.locator('.lit-toc').evaluate(e=>e.open),false);
 assert.equal(await page.locator('.wb-page-nav').count(),0);
 await page.locator('.lit-toc > summary').click();
 await page.locator('[data-toc-mode="volume"]').click();
 assert.equal(await page.locator('[data-toc-panel="volume"]').isVisible(),true);
 assert.equal(await page.locator('[data-toc-panel="volume"] [data-ind-piece]').count(),8);
 await page.locator('[data-toc-mode="article"]').click();
 assert.equal(await page.locator('[data-toc-panel="article"]').isVisible(),true);
 await page.locator('.lit-toc > summary').click();
 assert.equal(await page.locator('.research-refs').evaluate(e=>e.open),false);
 await page.locator('.lit-body a[href="#ref-1"]').click();
 assert.equal(await page.locator('.research-refs').evaluate(e=>e.open),true);
 assert.equal(await page.locator('#ref-1').count(),1);
 assert.equal(await page.locator('.research-errata-form').isVisible(),false);
 assert.equal(await page.evaluate(()=>window.WBResearch.completion('indigenous-v01',window.WBReadingStore).total),2);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'horizontal overflow at '+width);
 assert.deepEqual(errors,[],'page JS errors at '+width);
 await page.goto(origin+'/literature/indigenous/',{waitUntil:'load'});
 assert.equal(await page.locator('.ind-resume').isVisible(),true);
 assert.equal(await page.locator('.ind-resume-link').getAttribute('href'),'/literature/ind-test-a/');
 assert.equal(await page.locator('.wb-page-nav').count(),0);
 assert.equal(await page.locator('.ind-home-toc [data-ind-piece]').count(),210);
 assert.equal(await page.locator('.ind-home-toc').evaluate(e=>e.open),false);
 await page.locator('.wb-catalog-open').click();
 assert.equal(await page.locator('.wb-toc-volume[open]').count(),0);
 await page.locator('.wb-toc-volume').first().locator('summary').first().click();
 await page.locator('.wb-toc-chapter').first().locator('summary').click();
 assert.equal(await page.locator('[data-ind-piece="1.1"] .wb-read-mark').textContent(),'目前閱讀');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.ind-home-toc').evaluate(e=>e.open),false);
 assert.deepEqual(errors,[],'page JS errors at '+width);
 await ctx.close();console.log('BUILD07 research rendered browser '+width+'px passed');
 }
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
