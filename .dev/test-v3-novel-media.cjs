'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../_site');
const moduleFile='assets/js/novel-media.js';
for(const p of ['index.html','member/index.html','shelf/index.html','t/shanhai01/index.html']) assert.ok(!fs.readFileSync(path.join(root,p),'utf8').includes(moduleFile),p);
assert.ok(fs.readFileSync(path.join(root,'novel/shanhai/index.html'),'utf8').includes(moduleFile));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort());
 await page.setContent('<div class="intro-post"><div class="ip-slides" style="display:flex;overflow:auto;width:300px"><img style="flex:none;width:300px" src="data:,"/><img style="flex:none;width:300px" data-src="data:,"/></div><div class="ip-dots"><i class="on">1</i><i>2</i></div><div><button class="ip-tagbtn" aria-expanded="false">角色</button><div class="ip-tags" hidden>測試角色</div></div></div>');
 await page.addScriptTag({content:fs.readFileSync(path.join(root,moduleFile),'utf8')});
 await page.locator('.ip-tagbtn').click();assert.equal(await page.locator('.ip-tagbtn').getAttribute('aria-expanded'),'true');assert.ok(await page.locator('.ip-tags').isVisible());
 await page.locator('.ip-tagbtn').click();assert.ok(!(await page.locator('.ip-tags').isVisible()));
 await page.locator('.ip-dots i').nth(1).click();await page.waitForFunction(()=>document.querySelector('.ip-dots i:nth-child(2)').classList.contains('on'));assert.equal(await page.locator('.ip-slides img').nth(1).getAttribute('src'),'data:,');
 assert.deepEqual(errors,[]);console.log('PASS media interactions '+width);await page.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
