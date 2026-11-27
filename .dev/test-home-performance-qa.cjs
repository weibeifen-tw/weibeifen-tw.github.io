const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
 try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'?route.continue():route.abort();});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8766/',{waitUntil:'load'});
  const shelf=page.locator('#ex-shelf'), cards=shelf.locator('.bk');
  const ids=await cards.evaluateAll(a=>a.map(x=>x.dataset.workId));
  assert.ok(ids.length>0);assert.equal(new Set(ids).size,ids.length);
  assert.equal(await shelf.getAttribute('data-initialized'),'1');
  assert.ok(await cards.first().locator('img').getAttribute('src'));
  assert.equal(await cards.first().locator('img').getAttribute('fetchpriority'),'high');
  assert.equal(await page.locator('.shelf-hot .bk').count()>0,width>=768);
  if(width<768){await page.locator('#ex-t-hot').click();assert.ok(await cards.count()>0);await page.locator('#ex-t-all').click();assert.deepEqual(await cards.evaluateAll(a=>a.map(x=>x.dataset.workId)),ids);}
  await page.locator('.search-btn').click();assert.equal(await page.locator('.sbox').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(errors,[]);
  await page.close();console.log('PASS home browser '+width);
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
