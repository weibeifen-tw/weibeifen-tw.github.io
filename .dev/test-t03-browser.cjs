// T03 V1.9 isolated Chromium browser integration: local HTTP only, no production endpoints.
// Usage: CHROME_PATH=/usr/bin/chromium node .dev/test-t03-browser.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const file = fs.readFileSync(path.join(__dirname, '../assets/js/reading-store.js'), 'utf8');
const SESSION = 'sb-tqicconarhpddejxdvmf-auth-token';
const A = 'fakeuser-A', B = 'fakeuser-B';
const record = (url, n) => JSON.stringify({url, no:String(n), t:100});
const session = id => JSON.stringify({user:{id},refresh_token:'fake-only'});
const server = http.createServer((req, res) => {
  if (req.url === '/reading-store.js') {
    res.writeHead(200, {'Content-Type':'text/javascript', 'Cache-Control':'no-store'});
    return res.end(file);
  }
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'});
  res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>T03 Mock Browser</title><main id="reading">Fake account tests only</main><script src="/reading-store.js"></script>');
});
const listen = () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = () => new Promise(resolve => server.close(resolve));
async function main() {
  await listen();
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({serviceWorkers:'block'});
  let checked=0;
  async function check(page, code, label) {
    const result = await page.evaluate(code);
    assert.ok(result, label);
    checked++;
  }
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  try {
    await p.goto(url);
    await check(p, () => window.WBReadingStore.identity().state === 'guest',
      'browser enters guest identity with no stored session');
    await p.evaluate(v => {
      localStorage.setItem('wb:last:yu', v.legacy);
      window.WBReadingStore.write('last','yu',v.guest);
      window.WBReadingStore.write('read','/t/guest/','1');
    }, {legacy:record('/t/legacy/',51),guest:record('/t/guest/',2)});
    await check(p, () => window.WBReadingStore.listLast().yu.url === '/t/guest/',
      'guest reads scoped guest progress, not legacy');
    await p.evaluate(v => localStorage.setItem(v.key, v.value),{key:SESSION,value:session(A)});
    await p.reload();
    await check(p, () => window.WBReadingStore.identity().state === 'unknown' &&
        Object.keys(window.WBReadingStore.listLast()).length === 0,
      'browser refuses member data before server verification');
    await p.evaluate(() => window.WBReadingStore.setIdentity('member','fakeuser-A'));
    await check(p, () => window.WBReadingStore.identity().uid === 'fakeuser-A' &&
        Object.keys(window.WBReadingStore.listLast()).length === 0,
      'member A does not automatically import guest or legacy history');
    await p.evaluate(v => {
      window.WBReadingStore.write('last','yu',v);
      window.WBReadingStore.write('pos','/t/a/','0.67');
      window.WBReadingStore.write('read','/t/a/','1');
    },record('/t/a/',7));
    await check(p, () => window.WBReadingStore.listLast().yu.url === '/t/a/' &&
      window.WBReadingStore.read('pos','/t/a/') === '0.67',
      'member A reading progress and scroll position persist');
    const p2 = await context.newPage();
    p2.on('pageerror', e => errors.push(e.message));
    await p2.goto(url);
    await check(p2, () => window.WBReadingStore.identity().state === 'unknown',
      'second browser tab begins in unknown state');
    await p2.evaluate(() => window.WBReadingStore.setIdentity('member','fakeuser-A'));
    await check(p2, () => window.WBReadingStore.listLast().yu.url === '/t/a/',
      'second tab sees only verified owner A history');

    await p2.evaluate(v => localStorage.setItem(v.key,v.value), {key:SESSION,value:session(B)});
    await p.waitForFunction(() => window.WBReadingStore.identity().state === 'unknown');
    await check(p, () => window.WBReadingStore.read('last','yu') === null &&
      !window.WBReadingStore.syncKey(),
      'cross-tab switch blocks old member A and its sync key');
    await p2.evaluate(() => window.WBReadingStore.setIdentity('unknown'));
    await p2.evaluate(() => window.WBReadingStore.setIdentity('member','fakeuser-B'));
    await check(p2, () => !window.WBReadingStore.listLast().yu &&
      window.WBReadingStore.read('pos','/t/a/') === null,
      'member B cannot view A reading position or completion');
    await p2.evaluate(v => window.WBReadingStore.write('last','yu',v), record('/t/b/',9));
    await check(p2, () => window.WBReadingStore.listLast().yu.url === '/t/b/',
      'member B gets separate progress');
    await p2.evaluate(key => localStorage.removeItem(key), SESSION);
    await p.waitForFunction(() => window.WBReadingStore.identity().state === 'guest');
    await check(p, () => window.WBReadingStore.listLast().yu.url === '/t/guest/',
      'cross-tab logout restores original guest view');
    await check(p, () => localStorage.getItem('wb:last:yu') !== null,
      'legacy key remains untouched across both members');

    // BFCache verification race: A result arriving after another session begins must be rejected.
    await p.evaluate(v => localStorage.setItem(v.key,v.value),{key:SESSION,value:session(A)});
    await p.reload();
    await p.evaluate(() => {
      window.WBAuth = {getVerifiedUser: () => new Promise(resolve => window.__oldAuthResolve=resolve)};
      window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    });
    await p.evaluate(v => {
      localStorage.setItem(v.key,v.value);
      window.WBReadingStore.setIdentity('unknown');
      window.WBReadingStore.setIdentity('member','fakeuser-B');
      window.__oldAuthResolve({user:{id:'fakeuser-A'}});
    },{key:SESSION,value:session(B)});
    await check(p, async () => {
      await Promise.resolve();
      return window.WBReadingStore.identity().uid === 'fakeuser-B';
    },'stale BFCache validation cannot overwrite newer B identity');
    await check(p, () => !window.WBReadingStore.listLast().yu ||
        window.WBReadingStore.listLast().yu.url === '/t/b/',
      'late result does not reveal A history to B');
    // Cross-tab localStorage.clear() sends a storage event with key === null.
    // This must reset identity and prevent stale member data from staying visible.
    await p2.evaluate(() => localStorage.clear());
    await p.waitForFunction(() => window.WBReadingStore.identity().state === 'guest');
    await check(p, () => window.WBReadingStore.identity().state === 'guest' &&
      Object.keys(window.WBReadingStore.listLast()).length === 0,
      'cross-tab storage.clear revokes old member view');
    await check(p, () => window.WBReadingStore.syncKey() === null,
      'cross-tab storage.clear removes member-scoped sync marker access');
    // V2.0: Chromium device-profile simulations, NOT real Safari/Android devices.
    for (const profile of [
      {name:'iPhone-sized Chromium',width:390,height:844},
      {name:'Android-sized Chromium',width:412,height:915}
    ]) {
      const mobileContext=await browser.newContext({
        viewport:{width:profile.width,height:profile.height},
        deviceScaleFactor:3,hasTouch:true,isMobile:true,serviceWorkers:'block'
      });
      try {
        const mobile=await mobileContext.newPage();
        mobile.on('pageerror',e=>errors.push(profile.name+': '+e.message));
        await mobile.goto(url);
        await check(mobile,() => window.WBReadingStore.identity().state === 'guest' &&
          document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          profile.name+' guest isolated and fake page has no horizontal overflow');
        await mobile.evaluate(v=>{
          window.WBReadingStore.write('last','yu',JSON.stringify({url:'/t/mobile-guest/',no:'1'}));
          localStorage.setItem(v.key,v.session);
          window.WBReadingStore.setIdentity('unknown');
        },{key:SESSION,session:session(A)});
        await check(mobile,()=>window.WBReadingStore.identity().state==='unknown' &&
          Object.keys(window.WBReadingStore.listLast()).length===0,
          profile.name+' unverified member cannot inherit guest reading');
        await mobile.evaluate(()=>window.WBReadingStore.setIdentity('member','fakeuser-A'));
        await mobile.evaluate(()=>window.WBReadingStore.write('last','yu',JSON.stringify({url:'/t/mobile-a/',no:'3'})));
        await check(mobile,()=>window.WBReadingStore.listLast().yu.url==='/t/mobile-a/',
          profile.name+' verified A saves isolated reading');
        await mobile.evaluate(key=>{
          localStorage.removeItem(key);
          window.WBReadingStore.setIdentity('guest');
        },SESSION);
        await check(mobile,()=>window.WBReadingStore.listLast().yu.url==='/t/mobile-guest/',
          profile.name+' logout restores guest and hides A');
      } finally {
        await mobileContext.close();
      }
    }
    assert.equal(errors.length,0,'no browser JavaScript exceptions: '+errors.join('; '));
    checked++;
    await p2.close();
    console.log('T03 isolated Chromium browser integration: '+checked+'/'+checked+' passed (fake data only).');
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(server.listening)await close();});
