// Run with: node .dev/test-t03-reading.cjs (mock-only; no network or Supabase).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const sessionKey = 'sb-tqicconarhpddejxdvmf-auth-token';
const memory = new Map([
  ['wb:last:yu', JSON.stringify({ url: '/t/shutter/', no: '51' })],
  [sessionKey, JSON.stringify({ user: { id: 'fakeuser-A' }, refresh_token: 'dummy' })]
]);
const localStorage = {
  get length() { return memory.size; },
  key: i => [...memory.keys()][i],
  getItem: k => memory.get(k) || null,
  setItem: (k, v) => memory.set(k, v),
  removeItem: k => memory.delete(k)
};
const window = { addEventListener() {} };
vm.runInNewContext(read('assets/js/reading-store.js'), { window, localStorage });
const Store = window.WBReadingStore;
function extract(src, heading) {
  const start = src.indexOf(heading);
  assert.ok(start >= 0, 'missing ' + heading);
  let depth = 0;
  const open = src.indexOf('{', start);
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unclosed function: ' + heading);
}
async function run() {
  let passed = 0;
  function check(value, label) { assert.ok(value, label); passed++; }
  check(Store.identity().state === 'unknown', 'existing session initially unverified');
  Store.write('last', 'yu', JSON.stringify({ url: '/t/a/', no: '4', t: 100 }));
  check(Store.pendingCount() === 1, 'pending reading kept temporarily');
  check(!Store.setIdentity('member', 'fakeuser-B'), 'reject mismatch with current session');
  check(Store.setIdentity('member', 'fakeuser-A'), 'verified candidate accepted');
  check(Store.listLast().yu.no === '4', 'same-candidate pending reading committed');
  Store.write('read', '/t/a/', '1');
  Store.write('pos', '/t/a/', '0.42');
  memory.set(sessionKey, JSON.stringify({ user: { id: 'fakeuser-B' }, refresh_token: 'dummy' }));
  Store.setIdentity('unknown');
  Store.setIdentity('member', 'fakeuser-B');
  check(!Store.listLast().yu && Store.read('read', '/t/a/') === null &&
    Store.read('pos', '/t/a/') === null, 'all three reading types isolated');
  check(memory.has('wb:last:yu'), 'legacy reading key intact');
  // Same-tab auth changes can occur before a storage event reaches the reading store.
  memory.set(sessionKey, JSON.stringify({ user: { id: 'fakeuser-A' }, refresh_token: 'dummy' }));
  check(Store.identity().state === 'unknown' &&
    Store.read('last', 'yu') === null &&
    Object.keys(Store.listLast()).length === 0 &&
    !Store.write('last', 'yu', JSON.stringify({url:'/t/unsafe/',no:'90'})),
    'same-tab session change blocks stale member reads and writes');
  Store.setIdentity('unknown');
  Store.setIdentity('member', 'fakeuser-A');
  check(Store.listLast().yu.no === '4', 'original verified account history remains intact');
  memory.set(sessionKey, JSON.stringify({ user: { id: 'fakeuser-B' }, refresh_token: 'dummy' }));
  Store.setIdentity('unknown');
  Store.setIdentity('member', 'fakeuser-B');
  check(!Store.listLast().yu, 'other account still isolated after a real session switch');
  // Storage quota failures must be reported, never silently overwrite legacy records.
  const previousWrite = localStorage.setItem;
  const legacyBefore = memory.get('wb:last:yu');
  localStorage.setItem = (k, v) => {
    if (k.startsWith('wb:v2:')) throw new Error('QuotaExceededError');
    previousWrite(k, v);
  };
  check(Store.write('last', 'yu', JSON.stringify({url:'/t/quota/',no:'99'})) === false &&
    memory.get('wb:last:yu') === legacyBefore,
    'storage quota failure retains unchanged legacy source');
  localStorage.setItem = previousWrite;

  const beforeReturn = Store.identity();
  check(beforeReturn.state === 'member' && beforeReturn.uid === 'fakeuser-B',
    'current fake member remains the only confirmed owner before sync tests');
  const sw = read('sw.js');
  check(sw.includes("'/assets/js/reading-store.js?v=' + VER"),
    'reading-store dependency included in offline pre-cache');

  // Independent fake tab: storage and BFCache events must hide stale member data.
  const tabStorage = new Map([
    [sessionKey, JSON.stringify({ user: { id: 'fakeuser-A' }, refresh_token: 'dummy' })]
  ]);
  const tabLocalStorage = {
    get length() { return tabStorage.size; },
    key: i => [...tabStorage.keys()][i],
    getItem: k => tabStorage.get(k) || null,
    setItem: (k, v) => tabStorage.set(k, v),
    removeItem: k => tabStorage.delete(k)
  };
  const tabEvents = {};
  const tabWindow = { addEventListener: (name, cb) => { tabEvents[name] = cb; } };
  vm.runInNewContext(read('assets/js/reading-store.js'), { window: tabWindow, localStorage: tabLocalStorage });
  const tabStore = tabWindow.WBReadingStore;
  tabStore.setIdentity('member', 'fakeuser-A');
  tabStore.write('last', 'yu', JSON.stringify({ url: '/t/a/', no: '9' }));
  tabStorage.delete(sessionKey);
  tabEvents.storage({ key: sessionKey });
  check(tabStore.identity().state === 'guest' && !tabStore.listLast().yu,
    'cross-tab sign-out hides member history without deleting it');
  tabStorage.set(sessionKey, JSON.stringify({ user: { id: 'fakeuser-A' }, refresh_token: 'dummy' }));
  tabEvents.pageshow({ persisted: true });
  check(tabStore.identity().state === 'unknown' && !tabStore.listLast().yu,
    'BFCache restoration remains unverified before network confirmation');

  // Simulated BFCache validation in flight: switching account invalidates the old response.
  const lateMemory = new Map([
    [sessionKey, JSON.stringify({user:{id:'fakeuser-A'},refresh_token:'dummy'})]
  ]);
  const lateStorage = {
    get length(){return lateMemory.size;}, key:i=>[...lateMemory.keys()][i],
    getItem:k=>lateMemory.get(k)||null, setItem:(k,v)=>lateMemory.set(k,v),
    removeItem:k=>lateMemory.delete(k)
  };
  const lateEvents = {};
  let resolveOldVerification;
  const lateWindow = {
    addEventListener:(event,fn)=>{lateEvents[event]=fn;},
    WBAuth:{getVerifiedUser:()=>new Promise(resolve=>{resolveOldVerification=resolve;})}
  };
  vm.runInNewContext(read('assets/js/reading-store.js'),{window:lateWindow,localStorage:lateStorage});
  const lateStore=lateWindow.WBReadingStore;
  lateEvents.pageshow({persisted:true});
  check(lateStore.identity().state==='unknown','BFCache validation begins in unverified state');
  lateMemory.set(sessionKey,JSON.stringify({user:{id:'fakeuser-B'},refresh_token:'dummy'}));
  lateEvents.storage({key:sessionKey});
  lateStore.setIdentity('member','fakeuser-B');
  resolveOldVerification({user:{id:'fakeuser-A'}});
  await Promise.resolve();
  check(lateStore.identity().uid==='fakeuser-B',
    'late BFCache verification cannot revive account A after B is validated');
  // Different account's own reading history remains intact while visiting another account.
  const ownedCount=[...tabStorage.keys()].filter(k=>k.startsWith('wb:v2:member:fakeuser-A:')).length;
  check(ownedCount>0,'sign-out preserves owned member records for later login');

  // Recovery checks: guest and member data are retained independently; account deletion removes only the owner namespace.
  const recoverMemory = new Map([['wb:last:yu', JSON.stringify({url:'/t/legacy/',no:'51'})]]);
  const recoverEvents = {};
  const recoverStorage = {
    get length(){return recoverMemory.size;},
    key:i=>[...recoverMemory.keys()][i],
    getItem:k=>recoverMemory.get(k)||null,
    setItem:(k,v)=>recoverMemory.set(k,v),
    removeItem:k=>recoverMemory.delete(k)
  };
  const recoverWindow={addEventListener:(event,fn)=>{recoverEvents[event]=fn;}};
  vm.runInNewContext(read('assets/js/reading-store.js'),{window:recoverWindow,localStorage:recoverStorage});
  const recoverStore=recoverWindow.WBReadingStore;
  recoverStore.write('last','yu',JSON.stringify({url:'/t/guest/',no:'2'}));
  check(recoverStore.listLast().yu.url==='/t/guest/', 'guest can save independent reading');
  recoverMemory.set(sessionKey,JSON.stringify({user:{id:'fakeuser-A'},refresh_token:'dummy'}));
  recoverEvents.storage({key:sessionKey});
  check(recoverStore.identity().state==='unknown' && !recoverStore.listLast().yu,
    'guest history stays hidden while validating member');
  recoverStore.setIdentity('member','fakeuser-A');
  check(!recoverStore.listLast().yu, 'guest history is not silently imported to member');
  recoverStore.write('last','yu',JSON.stringify({url:'/t/member/',no:'7'}));
  recoverMemory.delete(sessionKey);
  recoverEvents.storage({key:sessionKey});
  check(recoverStore.listLast().yu.url==='/t/guest/',
    'logout restores original guest records without member leakage');
  recoverMemory.set(sessionKey,JSON.stringify({user:{id:'fakeuser-A'},refresh_token:'dummy'}));
  recoverEvents.storage({key:sessionKey});
  recoverStore.setIdentity('member','fakeuser-A');
  check(recoverStore.listLast().yu.url==='/t/member/',
    'relogin restores only the original owner history');
  check(recoverStore.clearMember('fakeuser-A') &&
    !recoverStore.listLast().yu &&
    recoverMemory.has('wb:last:yu'),
    'account deletion clears only scoped v2 owner and preserves quarantined legacy');
  recoverMemory.delete(sessionKey);
  recoverEvents.storage({key:sessionKey});
  check(recoverStore.listLast().yu.url==='/t/guest/',
    'guest history remains after deletion of distinct member account');

  const cloud = read('assets/cloud.js');
  const helpers = ['function cut(', 'function localRecords(', 'function num(', 'function further(', 'async function sync(']
    .map(heading => extract(cloud, heading)).join('\n');
  function syncCase(mode) {
    const writes = [], upserts = [];
    const sessionStorage = { setItem: (k, v) => writes.push({ k, v }) };
    const sync = new Function('Store', 'sessionStorage', 'KEY_RE', 'window', 'var READING_SYNC_ENABLED = true;\n' + helpers + ';return sync;')(
      Store, sessionStorage, /^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$/, {});
    const client = {
      from() {
        return {
          select() {
            return {
              async eq() {
                if (mode === 'read-fail') return { error: { message: 'offline' } };
                if (mode === 'remote-local-write-fail') return { data: [{k:'yu',url:'/t/b/',no:'10',t:10000}] };
                if (mode === 'switch-during-read') Store.setIdentity('unknown');
                return { data: [] };
              }
            };
          },
          async upsert(rows) {
            upserts.push(rows);
            return mode === 'write-fail' ? { error: { message: 'denied' } } : { error: null };
          }
        };
      }
    };
    return {
      writes, upserts,
      execute: () => sync({ getClient: () => client, getVerifiedUser: async () => ({ user: { id: mode === 'wrong-server-user' ? 'fakeuser-A' : 'fakeuser-B' } }) })
    };
  }
  Store.write('last', 'yu', JSON.stringify({ url: '/t/b/', no: '3', t: 90 }));
  const offline = syncCase('read-fail');
  const offlineResult = await offline.execute();
  check(offlineResult.reason === 'read-failed' && offline.writes.length === 0 &&
    offline.upserts.length === 0, 'failed cloud read prevents upload and success marking');
  const failed = syncCase('write-fail');
  const failResult = await failed.execute();
  check(failResult.reason === 'write-failed' && failed.writes.length === 0,
    'failed upload does not record success');
  const verifiedOther = syncCase('wrong-server-user');
  const verifyOtherResult = await verifiedOther.execute();
  check(verifyOtherResult.reason === 'changed-or-unverified' &&
    verifiedOther.upserts.length === 0 && verifiedOther.writes.length === 0,
    'server identity mismatch blocks all cloud uploads');
  const originalStoreWrite = Store.write;
  Store.write = (type, id, value) => type === 'last' ? false : originalStoreWrite(type, id, value);
  const localBroken = syncCase('remote-local-write-fail');
  const localBrokenResult = await localBroken.execute();
  Store.write = originalStoreWrite;
  check(localBrokenResult.reason === 'local-write-failed' &&
    localBroken.upserts.length === 0 && localBroken.writes.length === 0,
    'failure while importing cloud to local store never marks sync successful');
  const success = syncCase('success');
  const successResult = await success.execute();
  check(successResult.ok && success.writes.length === 1 && success.writes[0].k.includes('fakeuser-B'),
    'successful upload records only member-scoped timestamp');
  const switched = syncCase('switch-during-read');
  const changedResult = await switched.execute();
  check(changedResult.reason === 'changed' && switched.upserts.length === 0,
    'identity switch prevents stale upload');
  const app = read('assets/app.js');
  const remapSrc = app.match(/window\.wbRemap = \(function \(\) \{[\s\S]*?\n\}\)\(\);/);
  assert.ok(remapSrc);
  const remapWindow = {};
  new Function('window', remapSrc[0])(remapWindow);
  const moved = remapWindow.wbRemap('yu', { url: '/t/shutter/', no: '51' });
  check(moved[0] === 'lailu' && moved[1].no === '1', 'original chapter remap intact');
  check(!app.includes("localStorage.setItem('wb:mig:yu-split-1'"),
    'global destructive migration no longer executes');
  const withdrawn = remapWindow.wbRemap('yu', { url: '/t/threads/', no: '1' });
  check(withdrawn[0] === 'yu' && withdrawn[1].url === '/t/threads/',
    'withdrawn chapter history remains unchanged');
  check(app.includes("window.WBReadingStore.write('read'") &&
    app.includes("window.WBReadingStore.write('pos'"),
    'chapter completion and scroll position use scoped store');
  const layout = read('_layouts/default.html');
  check(layout.indexOf("reading-store.js") < layout.indexOf("/assets/app.js"),
    'reading-store is loaded ahead of app.js');

  console.log('T03 isolated mock tests: ' + passed + '/' + passed + ' passed.');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
