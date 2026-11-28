'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../_site');
const media='assets/css/novel-media.css',reader='assets/css/novel-reading.css';
for(const [f,m,n] of [['index.html',false,false],['novel/shanhai/index.html',true,false],['t/shanhai01/index.html',false,true],['literature/indigenous/index.html',false,false],['member/index.html',false,false]]){const h=fs.readFileSync(path.join(root,f),'utf8');assert.equal(h.includes(media),m,f);assert.equal(h.includes(reader),n,f);}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
for(const width of [390,1280]){const page=await browser.newPage({viewport:{width,height:844}});await page.route('**/*',r=>r.abort());
await page.setContent('<div class="nv-post"><div class="ip-media"><div class="ip-slides"><img src="data:,"></div><button class="ip-tagbtn">角色</button><div class="ip-tags" hidden>角色</div></div></div><div class="nv-gallery"><div class="ip-slides"></div></div><article class="chapter read"><a class="r-who">作者</a><div class="r-end"><span></span></div></article>');
for(const file of ['assets/style.css',media,reader])await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
const c=(sel,prop)=>page.locator(sel).first().evaluate((e,p)=>getComputedStyle(e)[p],prop);
assert.equal(await c('.ip-slides','display'),'flex');assert.equal(await c('.ip-slides img','aspectRatio'),'4 / 5');assert.equal(await c('.ip-tags','display'),'none');assert.equal(await c('.ip-tagbtn','position'),'absolute');assert.equal(await c('.nv-gallery .ip-slides','borderRadius'),'12px');assert.equal(await c('.r-who','display'),'inline-flex');assert.equal(await c('.r-end','display'),'flex');assert.equal(await c('.r-end span','width'),'5px');console.log('PASS CSS '+width);await page.close();}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
