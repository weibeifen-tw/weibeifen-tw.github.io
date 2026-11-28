'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../_site');
const asset='assets/css/bookshelf.css';
for(const f of ['index.html','literature/indigenous/index.html']) assert.ok(fs.readFileSync(path.join(root,f),'utf8').includes(asset),f);
for(const f of ['member/index.html','shelf/index.html','novel/shanhai/index.html','t/shanhai01/index.html']) assert.ok(!fs.readFileSync(path.join(root,f),'utf8').includes(asset),f);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:844}});
 await page.route('**/*',r=>r.abort());
 for(const mode of ['home','indigenous']){
 const body=mode==='home'?'<body class="home"><section class="explore"><h2 class="ex-sec">全部作品</h2><div class="shelf"><a class="bk"><span class="bk-cover"><img data-home-src="x"></span><span class="bk-pop">—</span><b class="bk-t">測試</b></a></div></section></body>':'<body><section class="ind-book"><ul class="shelf ind-shelf"><li class="bk"><a><span class="bk-cover"></span><span>文章</span></a></li></ul></section></body>';
 await page.setContent(body);
 for(const file of ['assets/style.css',asset,...(mode==='indigenous'?['assets/css/literature.css']:[])]) await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
 const actual=await page.evaluate(()=>({display:getComputedStyle(document.querySelector('.shelf')).display,ratio:getComputedStyle(document.querySelector('.bk-cover')).aspectRatio,basis:getComputedStyle(document.querySelector('.bk')).flexBasis,overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.equal(actual.display,'flex');assert.equal(actual.ratio,'3 / 4');assert.ok(!actual.overflow);assert.ok(actual.basis.includes('%'));
 if(mode==='home')assert.equal(await page.locator('img').evaluate(e=>getComputedStyle(e).display),'none');
 console.log('PASS '+mode+' '+width+' '+JSON.stringify(actual));
 }
 await page.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
