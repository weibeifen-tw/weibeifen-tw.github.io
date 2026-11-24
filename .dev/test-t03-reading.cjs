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
  const sw = read('sw.js');
  check(sw.includes("'/assets/js/reading-store.js?v=' + VER"),
    'reading-store dependency included in offline pre-cache');

  const cloud = read('assets/cloud.js');
  const helpers = ['function cut(', 'function localRecords(', 'function num(', 'function further(', 'async function sync(']
    .map(heading => extract(cloud, heading)).join('\n');
  function syncCase(mode) {
    const writes = [], upserts = [];
    const sessionStorage = { setItem: (k, v) => writes.push({ k, v }) };
    const sync = new Function('Store', 'sessionStorage', 'KEY_RE', 'window', helpers + ';return sync;')(
      Store, sessionStorage, /^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$/, {});
    const client = {
      from() {
        return {
          select() {
            return {
              async eq() {
                if (mode === 'read-fail') return { error: { message: 'offline' } };
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
      execute: () => sync({ getClient: () => client, getVerifiedUser: async () => ({ user: { id: 'fakeuser-B' } }) })
    };
  }
  Store.write('last', 'yu', JSON.stringify({ url: '/t/b/', no: '3', t: 90 }));
  const failed = syncCase('write-fail');
  const failResult = await failed.execute();
  check(failResult.reason === 'write-failed' && failed.writes.length === 0,
    'failed upload does not record success');
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
