---
layout: null
---
// 未備份 service worker — build {{ site.time | date: '%s' }}
const VER = 'wb-{{ site.time | date: "%s" }}';
const OFFLINE = '/offline/';
const PRECACHE = [OFFLINE, '/assets/style.css', '/assets/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 只處理本站檔案；登入、留言、統計等外部連線一律不碰
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/auth')) return;

  // 網頁：先上網拿最新（新章節才會馬上出現），沒網路才用看過的存檔
  if (req.mode === 'navigate' || url.pathname.endsWith('.json')) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VER).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? caches.match(OFFLINE) : Response.error()))));
    return;
  }

  // 圖片、CSS、JS：有存檔先用，同時在背景更新
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VER).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit || caches.match(req, { ignoreSearch: true }));
    return hit || net;
  }));
});
