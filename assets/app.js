// 2026-11-23《上釉》拆書：舊閱讀紀錄（wb:last:yu、wb:last:yu:角色）換成新章號；原第 51–55 篇的紀錄改記在《來路》（lailu）。
// 只換章號與所屬作品，不刪任何紀錄（下架章節的紀錄保留原樣）。雲端書櫃同步（cloud.js）也用同一份對照。
window.wbRemap = (function () {
  var L = {'shutter': 1, 'drumstick': 2, 'net': 3, 'bamboo-goal': 4, 'gutter': 5};
  var Y = {'swipe-left': 1, 'good-morning': 2, 'grass': 3, 'cocktail': 4, 'heart': 5, 'cupcake': 6, 'mumu': 7, 'quilt': 8, 'thick-steak': 9, 'ill-keep-you': 10, 'fish-in-fish': 11, 'pot': 12, '95': 13, 'panda': 14, 'medicine': 15, 'sticky-notes': 16};
  return function (k, r) {
    if (!r || typeof r.url !== 'string' || !/^yu(:|$)/.test(k)) return [k, r];
    var m = r.url.match(/\/t\/([^\/?#]+)\/?/); if (!m) return [k, r];
    var s = m[1], o = {}; for (var x in r) o[x] = r[x];
    if (L[s]) { o.no = String(L[s]); return ['lailu' + k.slice(2), o]; }
    if (Y[s] && String(r.no) !== String(Y[s])) { o.no = String(Y[s]); return [k, o]; }
    return [k, r];
  };
})();
(function () {
  try {
    if (localStorage.getItem('wb:mig:yu-split-1')) return;
    var ks = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^wb:last:yu(:|$)/.test(k)) ks.push(k); }
    ks.forEach(function (k) {
      var r = JSON.parse(localStorage.getItem(k) || 'null'); if (!r) return;
      var n = window.wbRemap(k.slice(8), r), nk = 'wb:last:' + n[0];
      if (n[1] === r) return;
      if (nk === k) localStorage.setItem(k, JSON.stringify(n[1]));
      else if (!localStorage.getItem(nk)) { localStorage.setItem(nk, JSON.stringify(n[1])); localStorage.removeItem(k); }
    });
    localStorage.setItem('wb:mig:yu-split-1', '1');
  } catch (e) {}
})();

// P3-01-B：公開章節索引只控制閱讀連結顯示，不修改任何歷史紀錄或雲端資料。
window.WBChapterGuard = (function () {
  var pending = null;
  function canonical(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      var u = new URL(value, location.origin);
      if (u.origin !== location.origin || !/^\/t\/[A-Za-z0-9_-]+\/$/.test(u.pathname)) return null;
      return u.pathname;
    } catch (e) { return null; }
  }
  function load(force) {
    if (pending && !force) return pending;
    var req = fetch((window.BASE || '') + '/assets/chapter-status.json?v=' + encodeURIComponent(window.VER || ''), { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('chapter index HTTP ' + res.status); return res.json(); })
      .then(function (data) {
        if (!data || data.version !== 1 || !data.chapters || !data.withdrawn || !data.remaps ||
            Array.isArray(data.chapters) || Array.isArray(data.withdrawn) || Array.isArray(data.remaps) ||
            typeof data.chapters !== 'object' || typeof data.withdrawn !== 'object' || typeof data.remaps !== 'object') {
          throw new Error('invalid chapter index');
        }
        return data;
      });
    pending = req;
    req.catch(function () { if (pending === req) pending = null; });
    return req;
  }
  function resolve(data, value) {
    var url = canonical(value), visited = {};
    if (!url) return { status: 'unknown' };
    for (var i = 0; i < 5; i++) {
      if (Object.prototype.hasOwnProperty.call(data.withdrawn, url)) return { status: 'withdrawn' };
      var row = Object.prototype.hasOwnProperty.call(data.chapters, url) ? data.chapters[url] : null;
      if (row && row.status === 'published' && row.url === url) return { status: 'published', url: url, chapter: row };
      if (visited[url] || !Object.prototype.hasOwnProperty.call(data.remaps, url)) return { status: 'unknown' };
      visited[url] = true;
      url = canonical(data.remaps[url]);
      if (!url) return { status: 'unknown' };
    }
    return { status: 'unknown' };
  }
  return { load: load, resolve: resolve, canonical: canonical };
})();

// 會員頭像：白底圓圈＋名字第一個字（管理員顯示 MU），字的顏色由會員在會員頁自己選
window.WBAvatar = (function () {
  var COLORS = [
    ['red', '紅', '#d0473f'], ['orange', '橘', '#d9702a'], ['yellow', '黃', '#b8901a'],
    ['blue', '藍', '#3a6fc2'], ['indigo', '靛', '#5650b5'], ['purple', '紫', '#9248ad'],
    ['pink', '粉', '#cc4f8a'], ['brown', '棕', '#8a5a3c'], ['gray', '灰', '#666666']
  ];
  var ADMIN_ONLY = 'orange'; // 橘色只有管理員能用（資料庫也會擋）；管理員沒選時預設橘色
  var map = {};
  COLORS.forEach(function (c) { map[c[0]] = c[2]; });
  var READER = COLORS.filter(function (c) { return c[0] !== ADMIN_ONLY; });
  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  // 沒選過顏色：管理員橘色；讀者依會員 ID 固定給一個（不會是橘色）
  function color(key, id, author) {
    if (key === ADMIN_ONLY && !author) key = null;
    if (map[key]) return map[key];
    return author ? map[ADMIN_ONLY] : READER[hash(id) % READER.length][2];
  }
  // 會員頁可選的顏色
  function choices(author) { return author ? COLORS : READER; }
  function letter(name) { var a = Array.from(String(name || '').trim()); return a.length ? a[0].toUpperCase() : '新'; }
  // o = { name, color, id, author }
  function paint(box, o) {
    o = o || {};
    box.textContent = o.author ? 'MU' : letter(o.name);
    box.classList.add('lt-av');
    box.classList.toggle('lt-mu', !!o.author);
    box.style.setProperty('--lc', color(o.color, o.id, o.author));
  }
  function make(o, cls) { var s = document.createElement('span'); s.className = 'avatar' + (cls ? ' ' + cls : ''); s.setAttribute('aria-hidden', 'true'); paint(s, o); return s; }
  return { colors: COLORS, choices: choices, color: color, paint: paint, make: make };
})();

(function () {
  var feed = document.querySelector('.feed');
  if (!feed) return;
  var q = new URLSearchParams(location.search);
  var n = q.get('n') || window.NOVEL || '', c = q.get('c') || '';
  var chars = JSON.parse(document.getElementById('chars').textContent || '{}');
  var who = chars[c];
  var novels = JSON.parse(document.getElementById('novels').textContent || '{}');
  // 角色頁已併入作品頁：舊的 ?c= 和 ?n= 網址轉到作品頁
  if (!window.NOVEL) {
    if (who) { location.replace(BASE + '/novel/' + who.novel + '/?c=' + c); return; }
    if (n && novels[n] && !q.get('liked') && !q.get('reposted')) { location.replace(BASE + '/novel/' + n + '/'); return; }
  }
  var nv = window.NOVEL ? novels[window.NOVEL] : null;
  if (nv) who = null;
  var shown = 0;
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  if (nv) {
    // 作品頁：角色分頁（全部／各角色）＋篇章目錄，繼續閱讀按鈕
    var list = Array.prototype.slice.call(document.querySelectorAll('.nv-list .chapter'));
    shown = list.length;
    var tabs = Array.prototype.slice.call(document.querySelectorAll('#roles .tabs [data-tab]'));
    var roles = Array.prototype.slice.call(document.querySelectorAll('#roles .role'));
    function pick(t) {
      if (!tabs.length) return;
      if (t !== 'all' && !roles.some(function (r) { return r.dataset.char === t; })) t = 'all';
      tabs.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t); });
      roles.forEach(function (r) { r.classList.toggle('full', r.dataset.char === t); r.hidden = t !== 'all' && r.dataset.char !== t; });
      list.forEach(function (ch) { ch.hidden = t !== 'all' && ch.dataset.char !== t; });
      try { history.replaceState(null, '', t === 'all' ? location.pathname : location.pathname + '?c=' + t); } catch (e) {}
    }
    tabs.forEach(function (b) { b.onclick = function () { pick(b.dataset.tab); }; });
    // 從限動點進來：只介紹角色
    // V1.0 R03：作品頁下方不再顯示角色區；?roles=1（圖片左下角小人）和 ?c=角色（舊連結、正文角色名）都進「認識角色」
    if (q.get('roles') || c) {
      document.body.classList.add('roles-only'); roles.forEach(function (r) { r.classList.add('full'); });
      var tr = c && roles.filter(function (r) { return r.dataset.char === c; })[0];
      if (tr) setTimeout(function () { tr.scrollIntoView(); }, 50); else window.scrollTo(0, 0);
      return;
    }
    pick('all');
    function rd(k) { try { var r = JSON.parse(localStorage.getItem(k) || 'null'); return r && r.url ? r : null; } catch (e) { return null; } }
    var btns = document.querySelector('.nv-btns'), lr = rd('wb:last:' + window.NOVEL);
    var b0 = mk('a', 'nv-btn'), target = lr ? lr.url : (list[0] && list[0].href);
    if (btns && target) {
      var note = mk('span', 'nv-link-note');
      note.setAttribute('role', 'status');
      note.setAttribute('aria-live', 'polite');
      var retry = mk('button', 'nv-link-retry', '重新確認');
      retry.type = 'button';
      retry.hidden = true;
      btns.appendChild(b0);
      btns.appendChild(note);
      btns.appendChild(retry);
      var requestNo = 0;
      function checkContinue(force) {
        var seq = ++requestNo;
        b0.removeAttribute('href');
        b0.setAttribute('aria-disabled', 'true');
        b0.textContent = '正在確認閱讀位置…';
        note.textContent = '';
        retry.hidden = true;
        window.WBChapterGuard.load(!!force).then(function (data) {
          if (seq !== requestNo) return;
          var result = window.WBChapterGuard.resolve(data, target);
          if (result.status === 'published' && result.chapter.novel === window.NOVEL) {
            b0.textContent = lr ? '繼續讀第 ' + result.chapter.chapter + ' 篇' : '從第一篇開始讀';
            b0.href = result.url;
            b0.removeAttribute('aria-disabled');
            return;
          }
          b0.textContent = '查看其他章節';
          if (result.status === 'withdrawn') {
            note.textContent = '上次閱讀的章節目前無法閱讀，閱讀紀錄會保留。請從下方目錄選擇其他章節。';
          } else {
            note.textContent = '找不到上次閱讀的章節，請從下方目錄選擇其他章節。';
          }
        }).catch(function () {
          if (seq !== requestNo) return;
          b0.textContent = '暫時無法確認閱讀位置';
          note.textContent = '章節狀態暫時無法確認，閱讀紀錄已保留。';
          retry.hidden = false;
        });
      }
      retry.onclick = function () { checkContinue(true); };
      checkContinue(false);
    }
  }
  document.querySelector('.empty').hidden = shown > 0;
})();

// 互動按鈕：讚只有動畫、轉發到脆、留言進角色私訊、分享連結
(function () {
  function get(k, d) { try { var v = localStorage.getItem('wb:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem('wb:' + k, JSON.stringify(v)); } catch (e) {} }
  // 假的互動數字：用文章 key 當種子，同一篇每次看到的數字都一樣
  function rnd(seed) { var h = 2166136261; for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
  // 數字裡不出現 4：碰到就往上跳（14→15、40→50）
  function no4(n) { while (String(n).indexOf('4') >= 0) n++; return n; }
  function fake(key) {
    // 愛心 1～100；轉發、分享跟著愛心比例；留言 10～99。全部是假的，同一篇每次都一樣
    var r = rnd(key || 'x');
    var likes = 1 + Math.floor(r() * 100);
    var rp = Math.round(likes * (0.01 + r() * 0.05)), share = Math.round(likes * (0.01 + r() * 0.07));
    var talk = 10 + Math.floor(r() * 90);
    return { like: likes, rp: rp, share: share, talk: Math.min(no4(talk), 99) };
  }
  function fmt(n) { return !n ? '' : n >= 10000 ? (Math.round(n / 1000) / 10) + '萬' : String(no4(n)); }
  document.querySelectorAll('.actions').forEach(function (a) {
    var key = a.dataset.key, base = fake(key), liked = false;
    var host = a.closest('[data-char]'), cid = host ? host.dataset.char : '';
    var like = a.querySelector('.like'), talk = a.querySelector('.talk'), rep = a.querySelector('.repost');
    var url = new URL(a.dataset.url, location.origin).href;
    function draw() {
      like.classList.toggle('on', liked); like.querySelector('.n').textContent = fmt(base.like + (liked ? 1 : 0));
      if (rep) rep.querySelector('.n').textContent = fmt(base.rp);
      if (talk) talk.querySelector('.n').textContent = fmt(base.talk);
      a.querySelector('.share .n').textContent = fmt(base.share);
    }
    // 讚：只有動畫，不記錄
    like.onclick = function () { liked = !liked; like.classList.add('pop'); setTimeout(function () { like.classList.remove('pop'); }, 300); draw(); };
    // 轉發：真的轉發到脆
    if (rep) rep.onclick = function () {
      var t = (a.closest('.chapter.read') ? document.title.replace(/｜未備份$/, '') : (host && host.querySelector('.topic') ? host.querySelector('.topic').textContent : document.title));
      window.open('https://www.threads.net/intent/post?text=' + encodeURIComponent(t + '\n' + url), '_blank', 'noopener');
    };
    // 留言（V1.0 S09：私訊退役）：到這篇的公開留言區
    if (talk) talk.onclick = function () {
      var here = document.getElementById('comments'), u = url.replace(/^https?:\/\/[^/]+/, '');
      if (here && (u === location.pathname || !u)) here.scrollIntoView({ behavior: 'smooth' }); else location.href = url + '#comments';
    };
    a.querySelector('.share').onclick = function () {
      if (navigator.share) { navigator.share({ title: document.title, url: url }).catch(function () {}); return; }
      var toast = a.querySelector('.toast');
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast.hidden = false; setTimeout(function () { toast.hidden = true; }, 1500); }).catch(function () { prompt('複製這個連結：', url); });
    };
    draw();
  });
})();

// 側邊選單
(function () {
  var btn = document.querySelector('.menu-btn'), d = document.querySelector('.drawer'), sc = document.querySelector('.scrim');
  if (!btn) return;
  // V1.0 S06：≥768px 且不是閱讀頁 → 選單固定在左側（不是彈出層，不需要 inert／scrim）
  var mq = window.matchMedia ? matchMedia('(min-width:768px)') : null, reading = document.body.classList.contains('reading');
  function docked() { return document.body.classList.contains('docked'); }
  function dock() {
    var on = !!(mq && mq.matches && !reading);
    document.body.classList.toggle('docked', on);
    if (on) { d.classList.remove('open'); sc.hidden = true; document.body.classList.remove('lock'); btn.setAttribute('aria-expanded', 'false'); d.removeAttribute('aria-hidden'); d.inert = false; }
    else if (!d.classList.contains('open')) { d.setAttribute('aria-hidden', 'true'); d.inert = true; }
  }
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', dock); else if (mq.addListener) mq.addListener(dock); }
  dock();
  function toggle(open) {
    if (docked()) return;
    d.classList.toggle('open', open); sc.hidden = !open; document.body.classList.toggle('lock', open);
    btn.setAttribute('aria-expanded', open); d.setAttribute('aria-hidden', !open); d.inert = !open; if (open) { var f = d.querySelector('a,button'); if (f) f.focus(); } else if (document.activeElement && d.contains(document.activeElement)) btn.focus();
  }
  btn.onclick = function () { toggle(!d.classList.contains('open')); };
  // V1.0 R05：選單裡的「搜尋」＝關掉選單、打開頂端搜尋
  var ds = d.querySelector('.d-search');
  if (ds) ds.onclick = function () { toggle(false); var sb = document.querySelector('.search-btn'); if (sb) { var bx = document.querySelector('.sbox'); if (!bx || bx.hidden) sb.click(); } };
  sc.onclick = function () { toggle(false); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });
})();


// 章節頁：正文裡第一次出現的同一本小說的其他角色，變成可以點的名字
(function () {
  var sec = document.querySelector('.chapter.read');
  if (!sec) return;
  var chars = JSON.parse(document.getElementById('chars').textContent || '{}');
  var text = sec.querySelector('.ch-text'); if (!text) return;
  Object.keys(chars).forEach(function (id) {
    var c = chars[id];
    if (id === sec.dataset.char || c.novel !== sec.dataset.novel || !c.name) return;
    var skip = c.skip || [];
    var tw = document.createTreeWalker(text, NodeFilter.SHOW_TEXT), node;
    while ((node = tw.nextNode())) {
      if (node.parentNode.closest('a')) continue;
      var s = node.nodeValue, i = -1;
      while ((i = s.indexOf(c.name, i + 1)) !== -1) {
        var bad = skip.some(function (w) { var k = w.indexOf(c.name); return k >= 0 && s.substr(i - k, w.length) === w; });
        if (bad) continue;
        var rest = node.splitText(i); rest.nodeValue = rest.nodeValue.slice(c.name.length);
        var a = document.createElement('a'); a.className = 'mention'; a.textContent = c.name;
        a.href = (window.BASE || '') + '/novel/' + c.novel + '/?c=' + id; a.style.setProperty('--c', c.color || '#999');
        rest.parentNode.insertBefore(a, rest);
        return;
      }
    }
  });
})();

// 閱讀頁：字級、夜間模式、記住讀到哪
(function () {
  var sec = document.querySelector('.chapter.read');
  var d = document.documentElement;
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var bs = document.querySelectorAll('.fs button');
  bs.forEach(function (b) {
    b.setAttribute('aria-pressed', d.dataset.fs === b.dataset.fs);
    b.onclick = function () { d.dataset.fs = b.dataset.fs; save('wb:fs', b.dataset.fs); bs.forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); };
  });
  var tb = document.querySelector('.theme-btn');
  function lab() { tb.setAttribute('aria-label', d.dataset.theme === 'night' ? '切換白天模式' : '切換夜間模式'); }
  if (tb) { tb.onclick = function () { d.dataset.theme = d.dataset.theme === 'night' ? 'day' : 'night'; save('wb:theme', d.dataset.theme); lab(); }; lab(); }
  if (sec && sec.dataset.novel) {
    var rec = JSON.stringify({ url: location.pathname, no: sec.dataset.no, title: sec.dataset.title, char: sec.dataset.char, t: Date.now() });
    save('wb:last:' + sec.dataset.novel, rec);
    save('wb:last:' + sec.dataset.novel + ':' + sec.dataset.char, rec);
  }
  // 請瀏覽器把這個網站的紀錄當成要保留的資料（不是每個瀏覽器都會答應）
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  // 記住這一章捲到哪：存正文讀到的比例，回來時捲回去；讀到九成算讀完
  var txt = sec && sec.querySelector('.ch-text');
  if (txt) {
    var pk = 'wb:pos:' + location.pathname, rk = 'wb:read:' + location.pathname;
    function ratio() {
      var r = txt.getBoundingClientRect(), h = r.height - innerHeight * 0.5;
      return h > 0 ? Math.min(1, Math.max(0, (innerHeight * 0.5 - r.top) / h)) : 1;
    }
    function keep() {
      var p = ratio();
      save(pk, String(Math.round(p * 1000) / 1000));
      if (p >= 0.9) save(rk, '1');
    }
    var tm = null;
    addEventListener('scroll', function () { clearTimeout(tm); tm = setTimeout(keep, 300); }, { passive: true });
    addEventListener('pagehide', keep);
    document.addEventListener('visibilitychange', function () { if (document.hidden) keep(); });
    var old = 0; try { old = parseFloat(localStorage.getItem(pk)) || 0; } catch (e) {}
    if (old > 0.03 && old < 0.97 && !location.hash) {
      var go = function () {
        var r = txt.getBoundingClientRect(), h = r.height - innerHeight * 0.5;
        scrollTo(0, scrollY + r.top - innerHeight * 0.5 + old * h);
        var t = document.createElement('div'); t.className = 'resume'; t.textContent = '回到上次讀到的地方';
        var top = document.createElement('button'); top.type = 'button'; top.textContent = '從頭讀';
        top.onclick = function () { scrollTo(0, 0); t.remove(); };
        t.appendChild(top); document.body.appendChild(t);
        setTimeout(function () { t.classList.add('out'); }, 4000);
        setTimeout(function () { t.remove(); }, 4600);
      };
      if (document.readyState === 'complete') go(); else addEventListener('load', go);
    }
  }
})();

// 章節列表：讀完的打勾變淡，最後讀到的那章標「讀到這」
(function () {
  var tocs = document.querySelectorAll('.chapter.toc');
  if (!tocs.length) return;
  var here = {};
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k.indexOf('wb:last:') === 0) { var r = JSON.parse(localStorage.getItem(k) || 'null'); if (r && r.url) here[r.url] = 1; }
    }
  } catch (e) {}
  tocs.forEach(function (a) {
    var p = a.pathname, done = false;
    try { done = localStorage.getItem('wb:read:' + p) === '1'; } catch (e) {}
    if (here[p]) a.classList.add('here');
    else if (done) a.classList.add('done');
  });
})();

// 我的書櫃：看過的小說和讀到第幾篇
// （雲端書櫃同步後，cloud.js 會呼叫 window.WBRenderShelf() 重畫一次）
window.WBRenderShelf = function () {
  var sub = document.querySelector('.shelf-list'); if (!sub) return;
  sub.textContent = '';
  // 每次雲端同步重畫會使上一次索引回應失效，避免舊請求覆蓋新內容。
  var renderToken = (window.WBShelfRenderToken || 0) + 1;
  window.WBShelfRenderToken = renderToken;
  var novels = JSON.parse(document.getElementById('novels').textContent || '{}'), list = [];
  var chars = JSON.parse(document.getElementById('chars').textContent || '{}');
  var split = window.SPLIT || [], links = [];
  function rd(k) { try { var r = JSON.parse(localStorage.getItem(k) || 'null'); return r && r.url ? r : null; } catch (e) { return null; } }
  function row(href, label, no, cls, novelId) {
    var a = document.createElement('a');
    a.textContent = label;
    if (cls) a.className = cls;
    a.setAttribute('aria-disabled', 'true');
    var sm = document.createElement('small');
    sm.textContent = '正在確認第 ' + no + ' 篇…';
    a.appendChild(sm);
    links.push({ a: a, small: sm, url: href, no: no, novel: novelId });
    return a;
  }
  Object.keys(novels).forEach(function (id) {
    if (split.indexOf(id) >= 0 || novels[id].split) {
      var rows = [];
      Object.keys(chars).forEach(function (cid) {
        if (chars[cid].novel !== id && (chars[cid].also || []).indexOf(id) < 0) return;
        var r = rd('wb:last:' + id + ':' + cid); if (r) rows.push([cid, r]);
      });
      if (!rows.length) {
        var old = rd('wb:last:' + id);
        if (old) {
          if (old.char) rows.push([old.char, old]);
          else { list.push({ id: id, r: old, t: old.t || 0 }); return; }
        }
      }
      if (rows.length) list.push({ id: id, rows: rows, t: Math.max.apply(null, rows.map(function (x) { return x[1].t || 0; })) });
    } else {
      var rec = rd('wb:last:' + id);
      if (rec) list.push({ id: id, r: rec, t: rec.t || 0 });
    }
  });
  list.sort(function (a, b) { return b.t - a.t; });
  if (!list.length) { var p = document.createElement('p'); p.textContent = '還沒有看過的小說。從首頁挑一部開始吧。'; sub.appendChild(p); }
  function add(x) {
    if (x.r) { sub.appendChild(row(x.r.url, novels[x.id].title, x.r.no, '', x.id)); return; }
    var h = document.createElement('a'); h.href = BASE + '/novel/' + x.id + '/';
    h.className = 'd-nv'; h.textContent = novels[x.id].title; sub.appendChild(h);
    x.rows.forEach(function (y) {
      sub.appendChild(row(y[1].url, (chars[y[0]] || {}).name || '', y[1].no, 'd-ch', x.id));
    });
  }
  if (!sub.closest('.member-page')) list.forEach(add);
  else {
    var n = 0, more = document.createElement('button'); more.type = 'button'; more.className = 'mb-btn mycm-more';
    function showMore(k) {
      list.slice(n, n + k).forEach(add); n = Math.min(list.length, n + k);
      var left = list.length - n; more.hidden = left <= 0;
      more.textContent = '再看 ' + Math.min(10, left) + ' 本（還有 ' + left + ' 本）';
      sub.appendChild(more);
      // 展開後新增的書櫃項目，同樣要套用已取得的索引。
      if (window.WBShelfIndex && window.WBShelfRenderToken === renderToken) apply(window.WBShelfIndex);
    }
    more.onclick = function () { showMore(10); };
    showMore(5);
  }
  var status = document.createElement('p');
  status.className = 'nv-link-note';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  var retry = document.createElement('button');
  retry.type = 'button'; retry.className = 'nv-link-retry';
  retry.textContent = '重新確認'; retry.hidden = true;
  sub.appendChild(status); sub.appendChild(retry);
  function apply(data) {
    if (window.WBShelfRenderToken !== renderToken) return;
    links.forEach(function (x) {
      var result = window.WBChapterGuard.resolve(data, x.url);
      x.a.removeAttribute('href');
      x.a.setAttribute('aria-disabled', 'true');
      if (result.status === 'published' && result.chapter.novel === x.novel) {
        x.a.href = result.url;
        x.a.removeAttribute('aria-disabled');
        x.small.textContent = '讀到第 ' + result.chapter.chapter + ' 篇';
      } else if (result.status === 'withdrawn') {
        x.small.textContent = '（此章節已撤回，紀錄保留）';
      } else {
        x.small.textContent = '（原章節無法使用，紀錄保留）';
      }
    });
    status.textContent = ''; retry.hidden = true;
  }
  function check(force) {
    var seq = renderToken;
    links.forEach(function (x) {
      x.a.removeAttribute('href');
      x.a.setAttribute('aria-disabled', 'true');
      x.small.textContent = '正在確認第 ' + x.no + ' 篇…';
    });
    status.textContent = '正在確認閱讀位置…';
    retry.hidden = true;
    window.WBChapterGuard.load(!!force).then(function (data) {
      if (window.WBShelfRenderToken !== seq) return;
      window.WBShelfIndex = data;
      apply(data);
    }).catch(function () {
      if (window.WBShelfRenderToken !== seq) return;
      links.forEach(function (x) { x.small.textContent = '（暫時無法確認，紀錄保留）'; });
      status.textContent = '暫時無法確認書櫃閱讀位置。';
      retry.hidden = false;
    });
  }
  retry.onclick = function () { check(true); };
  if (links.length) check(false);
};
window.WBRenderShelf();

// （臺灣故事地圖已拆到 assets/js/taiwan.js）

// V1.0 S09（DM-A 私訊全面退役）：右下角只當通知（你留過言的地方有新回應）。私訊入口、對話、傳送、刪除都已移除；舊私訊資料保留在資料庫，前端不讀不寫。
(function () {
  var btn = document.querySelector('.chat-btn'), box = document.querySelector('.inbox');
  if (!btn || !box) return;
  var novels = JSON.parse(document.getElementById('novels').textContent || '{}');
  var posts = null;
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function on() { return !!(window.WBDM && window.WBDM.on && window.WBDM.on()); }
  function view() {
    var h = '<div class="ib-head"><b>通知</b><button type="button" class="ib-x" aria-label="關閉">✕</button></div>';
    var nt = (window.WBDM && window.WBDM.notices) || [];
    if (nt.length) {
      var byUrl = {}; Object.keys(posts || {}).forEach(function (k) { byUrl[posts[k].u] = posts[k]; });
      h += '<div class="ib-notices"><b>你留言的地方有新回應</b>' + nt.map(function (x) {
        var pp = byUrl[x.path], nv = novels[x.novel] || {}, t = '《' + (nv.title || x.novel) + '》' +
          (pp ? (pp.ch ? '第 ' + pp.ch + ' 篇・' : '') + pp.t : (x.path.indexOf('/novel/') === 0 ? '介紹頁' : ''));
        return '<a href="' + esc(x.path) + '#comments">' + esc(t) + '<span>' + x.n + ' 則新留言</span></a>';
      }).join('') + '</div>';
    } else h += '<p class="ib-empty">' + (on() ? '目前沒有新通知。<br>有人在你留過言的地方留言，會顯示在這裡。' : '登入會員後，有人在你留過言的地方留言，會通知你。<br><a href="' + window.BASE + '/member/">前往登入</a>') + '</p>';
    box.innerHTML = '<div class="ib-panel">' + h + '</div>';
  }
  async function open() {
    box.hidden = false; document.body.classList.add('ib-open');
    box.innerHTML = '<div class="ib-panel"><p class="ib-empty">載入中…</p></div>';
    if (!posts) { try { posts = await (await fetch(window.BASE + '/assets/posts.json?v=' + window.VER)).json(); } catch (e) { posts = {}; } }
    if (on() && window.WBDM.refresh) { try { await window.WBDM.refresh(); } catch (e) {} }
    if (!box.hidden) view();
  }
  function close() { box.hidden = true; document.body.classList.remove('ib-open'); }
  btn.onclick = function () { open(); };
  box.addEventListener('click', function (e) { if (e.target === box || e.target.closest('.ib-x')) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) close(); });
})();

// 作品介紹貼文：多張圖左右滑，下方圓點
(function () {
  document.querySelectorAll('.intro-post, .nv-gallery').forEach(function (p) {
    var sl = p.querySelector('.ip-slides'), dots = p.querySelectorAll('.ip-dots i'); if (!sl) return;
    // V1.0 S12：延後下載的第 2、3 張（data-src）——讀者一碰輪播、或整頁載完後空檔，才開始載
    var rest = function () { sl.querySelectorAll('img[data-src]').forEach(function (im) { im.src = im.dataset.src; im.removeAttribute('data-src'); }); rest = function () {}; };
    ['pointerdown', 'touchstart', 'scroll', 'focusin'].forEach(function (ev) { sl.addEventListener(ev, function () { rest(); }, { once: true, passive: true }); });
    dots.forEach(function (d) { d.addEventListener('click', function () { rest(); }); });
    var later = function () { (window.requestIdleCallback || setTimeout)(function () { rest(); }, { timeout: 2500 }); };
    if (document.readyState === 'complete') later(); else addEventListener('load', later);
    function go(k) { sl.scrollTo({ left: k * sl.clientWidth, behavior: 'smooth' }); }
    dots.forEach(function (d, i) { d.onclick = function () { go(i); }; });
    sl.onclick = function (e) { var r = sl.getBoundingClientRect(), k = Math.round(sl.scrollLeft / sl.clientWidth); go(e.clientX - r.left > r.width / 2 ? Math.min(k + 1, dots.length - 1) : Math.max(k - 1, 0)); };
    sl.addEventListener('scroll', function () { var k = Math.round(sl.scrollLeft / sl.clientWidth); dots.forEach(function (d, i) { d.classList.toggle('on', i === k); }); }, { passive: true });
  });
})();

// 頂端搜尋（V1.0 R06）：分類「全部／小說／角色／歷史事件／文學文章」，索引 /assets/search.json 第一次打開才載入
(function () {
  var btn = document.querySelector('.search-btn'), box = document.querySelector('.sbox'); if (!btn || !box) return;
  var q = box.querySelector('.sbox-q'), out = box.querySelector('.sbox-r');
  var CATS = [['all', '全部'], ['novels', '小說'], ['chars', '角色'], ['events', '歷史事件'], ['arts', '研究文章']];
  var tabs = document.createElement('div'); tabs.className = 'sbox-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '搜尋分類');
  var cat = 'all';
  CATS.forEach(function (c) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.cat = c[0]; b.textContent = c[1]; b.setAttribute('aria-selected', c[0] === cat); b.onclick = function () { cat = c[0]; tabs.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-selected', x.dataset.cat === cat); }); run(); }; tabs.appendChild(b); });
  box.insertBefore(tabs, out);
  var idx = null, loading = null;
  function load() {
    if (idx || loading) return loading;
    loading = fetch((window.BASE || '') + '/assets/search.json?v=' + (window.VER || '')).then(function (r) { return r.json(); })
      .then(function (d) { idx = d; ['novels', 'chars', 'events', 'arts'].forEach(function (k) { (idx[k] || []).forEach(function (x) { x._k = String(x.k || '').toLowerCase().replace(/臺/g, '台'); }); }); })
      .catch(function () { idx = { novels: [], chars: [], events: [], arts: [] }; });
    return loading;
  }
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  function pic(x) { var s = el('span', 'avatar sr-pic'); s.style.setProperty('--c', x.c || '#999'); if (x.img) { var i = new Image(); i.src = x.img; i.alt = ''; i.loading = 'lazy'; s.appendChild(i); } else s.textContent = x.g || (x.t || '').charAt(0); return s; }
  function item(kind, x) {
    var li = el('li', 'sr-' + kind), a = el('a'); a.href = x.u;
    if (kind === 'novels') { a.append(pic(x), wrap(x.t, x.b)); }
    else if (kind === 'chars') { a.append(pic(x), wrap(x.t, '《' + x.n + '》' + (x.h ? '・@' + x.h : ''))); }
    else if (kind === 'events') { a.append(wrap(x.t, [x.y, x.p].filter(Boolean).join('・') + '　《' + x.n + '》')); }
    else { a.append(wrap(x.t, x.s)); }
    li.appendChild(a); return li;
  }
  function wrap(t, sub) { var w = el('span', 'sr-txt'); w.appendChild(el('b', null, t)); if (sub) w.appendChild(el('small', null, sub)); return w; }
  function run() {
    var v = q.value.trim().toLowerCase().replace(/臺/g, '台'); out.innerHTML = ''; if (!v) return; // V1.0 S08：臺／台都搜得到
    if (!idx) { load().then(run); return; }
    var kinds = cat === 'all' ? ['novels', 'chars', 'events', 'arts'] : [cat], n = 0;
    kinds.forEach(function (k) {
      var hit = (idx[k] || []).filter(function (x) { return x._k.indexOf(v) >= 0; });
      if (!hit.length) return;
      if (cat === 'all') out.appendChild(el('li', 'sr-h', CATS.filter(function (c) { return c[0] === k; })[0][1]));
      hit.slice(0, cat === 'all' ? 6 : 50).forEach(function (x) { out.appendChild(item(k, x)); n++; });
    });
    if (!n) out.appendChild(el('li', 'none', '找不到符合的結果'));
  }
  function open(v) { box.hidden = !v; btn.setAttribute('aria-expanded', v); if (v) { load(); q.focus(); } else { q.value = ''; out.innerHTML = ''; } }
  btn.onclick = function () { open(box.hidden); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) open(false); });
  q.addEventListener('input', run);
})();

// 年代誌：從搜尋點進來（#ev-事件 id）時捲到那張事件卡
(function () {
  if (location.hash.indexOf('#ev-') !== 0) return;
  addEventListener('load', function () { var e = document.querySelector('.ev[data-id="' + decodeURIComponent(location.hash.slice(4)) + '"]'); if (e && e.offsetParent) e.scrollIntoView({ block: 'center' }); });
})();

// 作品貼文：點人像圖示顯示／收起標註的角色
document.querySelectorAll('.ip-tagbtn').forEach(function (b) {
  var t = b.parentNode.querySelector('.ip-tags');
  b.onclick = function (e) { e.stopPropagation(); t.hidden = !t.hidden; b.setAttribute('aria-expanded', !t.hidden); };
});

// （首頁探索故事書架已拆到 assets/js/home.js）
