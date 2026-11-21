---
layout: null
---
// 未備份 service worker — build {{ site.time | date: '%s' }}
// V1.0 S10（Q42–Q46、規格第 35–36 節）：
//   - 依資源分快取：網頁／章節／研究文章網路優先、失敗才用離線副本；CSS／JS 依版本號快取；圖片按需快取
//   - 會員、收藏、留言、管理、登入、測試頁一律不快取；外部連線（Supabase、字型、統計）一律不碰
//   - 每類設上限，超過就淘汰最久沒用的（最近使用淘汰）
//   - 404／410：刪掉舊副本，不再顯示已撤回的內容
//   - 新版本不自動接管：頁面詢問讀者，按「更新」才換（保留閱讀位置）
const VER = '{{ site.time | date: "%s" }}';
const C = { pages: 'wb-pages', static: 'wb-static-' + VER, img: 'wb-img', meta: 'wb-meta' };
const LIMIT = { pages: 160, img: 300 };          // 頁面（含章節、研究文章）、圖片的筆數上限；待實測後核定
const OFFLINE = '/offline/';
const PRECACHE = [OFFLINE, '/assets/style.css?v=' + VER, '/assets/app.js?v=' + VER, '/assets/icons/icon-192.png'];
const NOCACHE = /^\/(admin|auth|member|favorites|my-comments|login-test|privacy\/delete)(\/|$)/;

self.addEventListener('install', e => {
  // 不 skipWaiting：等讀者在頁面上按「更新」
  e.waitUntil(caches.open(C.static).then(c => c.addAll(PRECACHE)).catch(() => {}));
});

// 撤回清單（/withdrawn.json，只有網址）：清掉讀者裝置上這些網址的離線副本
async function purgeWithdrawn() {
  try {
    const r = await fetch('/withdrawn.json', { cache: 'no-store' }); if (!r.ok) return;
    const urls = ((await r.json()).urls || []).map(u => new URL(u, location.origin).pathname);
    if (!urls.length) return;
    const c = await caches.open(C.pages), m = await caches.open(C.meta);
    for (const k of await c.keys()) {
      const p = new URL(k.url).pathname;
      if (urls.some(u => p === u || p.startsWith(u.endsWith('/') ? u : u + '/'))) { await c.delete(k); await m.delete(k.url); }
    }
  } catch (e) {}
}

self.addEventListener('activate', e => {
  e.waitUntil(purgeWithdrawn());
  e.waitUntil(caches.keys().then(keys => Promise.all(keys
    // 舊版本的 CSS／JS 快取、舊架構的 wb-<時間> 快取：刪掉；頁面、圖片快取跨版本保留（網路優先，會自己更新）
    .filter(k => (k.startsWith('wb-static-') && k !== C.static) || /^wb-\d+$/.test(k))
    .map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// 最近使用淘汰：wb-meta 記每個網址最後使用時間
async function touch(url) {
  try { const m = await caches.open(C.meta); await m.put(url, new Response(String(Date.now()))); } catch (e) {}
}
async function trim(name, max) {
  try {
    const c = await caches.open(name), keys = await c.keys();
    if (keys.length <= max) return;
    const m = await caches.open(C.meta);
    const ts = await Promise.all(keys.map(async k => { const r = await m.match(k.url); return [k, r ? +(await r.text()) : 0]; }));
    ts.sort((a, b) => a[1] - b[1]);
    for (const [k] of ts.slice(0, keys.length - max)) { await c.delete(k); await m.delete(k.url); }
  } catch (e) {}
}
async function forget(req) {
  const c = await caches.open(C.pages); await c.delete(req, { ignoreSearch: true });
  const m = await caches.open(C.meta); await m.delete(req.url);
}

let lastPurge = 0;
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // Supabase、字型、統計：不碰
  if (NOCACHE.test(url.pathname)) {                     // 會員、管理、登入：不快取；離線時只給離線頁
    if (req.mode === 'navigate') e.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
    return;
  }
  if (url.pathname === '/sw.js' || url.pathname === '/withdrawn.json') return;

  if (req.mode === 'navigate' && Date.now() - lastPurge > 3600e3) { lastPurge = Date.now(); e.waitUntil(purgeWithdrawn()); }
  // 網頁（含已讀章節、研究文章）與 JSON 索引：網路優先，成功才存；離線才用副本
  if (req.mode === 'navigate' || url.pathname.endsWith('.json')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') {
          const copy = res.clone(); const key = url.pathname.endsWith('.json') ? req : new Request(url.origin + url.pathname);
          e.waitUntil(caches.open(C.pages).then(c => c.put(key, copy)).then(() => touch(key.url)).then(() => trim(C.pages, LIMIT.pages)));
        } else if (res.status === 404 || res.status === 410) {
          e.waitUntil(forget(req));                     // 已撤回：不再顯示舊副本
        }
        return res;
      } catch (err) {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) { e.waitUntil(touch(req.url)); return hit; }
        return req.mode === 'navigate' ? (await caches.match(OFFLINE)) || Response.error() : Response.error();
      }
    })());
    return;
  }

  // CSS、JS：網址帶版本號（?v=建置時間），同版本快取優先
  if (/\.(css|js)$/.test(url.pathname)) {
    e.respondWith(caches.open(C.static).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && url.search) c.put(req, res.clone());
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }

  // 圖片、SVG、字型檔：有副本先用，背景更新；按需快取、有上限
  if (/\.(svg|webp|png|jpe?g|gif|avif|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.open(C.img).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => {
        if (res.ok) { c.put(req, res.clone()).then(() => touch(req.url)).then(() => trim(C.img, LIMIT.img)); }
        else if (res.status === 404 || res.status === 410) c.delete(req);
        return res;
      }).catch(() => hit || Response.error());
      if (hit) { e.waitUntil(net.catch(() => {})); touch(req.url); return hit; }
      return net;
    }));
  }
});
