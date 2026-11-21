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
    var b0 = mk('a', 'nv-btn');
    if (lr) { b0.textContent = '繼續讀第 ' + lr.no + ' 篇'; b0.href = lr.url; }
    else if (list[0]) { b0.textContent = '從第一篇開始讀'; b0.href = list[0].href; }
    if (b0.href) btns.appendChild(b0);
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
    // 留言：連到角色私訊
    if (talk) talk.onclick = function () { if (window.openDM && cid) window.openDM(cid, key); };
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
  function toggle(open) {
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
  var novels = JSON.parse(document.getElementById('novels').textContent || '{}'), list = [];
  var chars = JSON.parse(document.getElementById('chars').textContent || '{}');
  var split = window.SPLIT || [];
  function rd(k) { try { var r = JSON.parse(localStorage.getItem(k) || 'null'); return r && r.url ? r : null; } catch (e) { return null; } }
  function row(href, label, no, cls) {
    var a = document.createElement('a'); a.href = href; a.textContent = label; if (cls) a.className = cls;
    var sm = document.createElement('small'); sm.textContent = '讀到第 ' + no + ' 篇'; a.appendChild(sm); return a;
  }
  Object.keys(novels).forEach(function (id) {
    if (split.indexOf(id) >= 0 || novels[id].split) {
      // 兩個角色各自一條線：每個角色各記一行
      var rows = [];
      Object.keys(chars).forEach(function (cid) { if (chars[cid].novel !== id) return; var r = rd('wb:last:' + id + ':' + cid); if (r) rows.push([cid, r]); });
      if (!rows.length) { var old = rd('wb:last:' + id); if (old) { if (old.char) rows.push([old.char, old]); else { list.push({ id: id, r: old, t: old.t || 0 }); return; } } }
      if (rows.length) list.push({ id: id, rows: rows, t: Math.max.apply(null, rows.map(function (x) { return x[1].t || 0; })) });
    } else {
      var r = rd('wb:last:' + id); if (r) list.push({ id: id, r: r, t: r.t || 0 });
    }
  });
  list.sort(function (a, b) { return b.t - a.t; });
  if (!list.length) { var p = document.createElement('p'); p.textContent = '還沒有看過的小說。從首頁挑一部開始吧。'; sub.appendChild(p); }
  function add(x) {
    if (x.r) { sub.appendChild(row(x.r.url, novels[x.id].title, x.r.no)); return; }
    var h = document.createElement('a'); h.href = BASE + '/novel/' + x.id + '/'; h.className = 'd-nv'; h.textContent = novels[x.id].title; sub.appendChild(h);
    x.rows.forEach(function (y) { sub.appendChild(row(y[1].url, (chars[y[0]] || {}).name || '', y[1].no, 'd-ch')); });
  }
  // 會員頁：先顯示最近讀的 5 本，「再看 10 本」一次多 10 本；書櫃頁全部顯示
  if (!sub.closest('.member-page')) { list.forEach(add); return; }
  var n = 0, more = document.createElement('button'); more.type = 'button'; more.className = 'mb-btn mycm-more';
  function showMore(k) {
    list.slice(n, n + k).forEach(add); n = Math.min(list.length, n + k);
    var left = list.length - n; more.hidden = left <= 0;
    more.textContent = '再看 ' + Math.min(10, left) + ' 本（還有 ' + left + ' 本）';
    sub.appendChild(more);
  }
  more.onclick = function () { showMore(10); };
  showMore(5);
};
window.WBRenderShelf();

// （臺灣故事地圖已拆到 assets/js/taiwan.js）

// 私訊：讀者跟角色的對話
//   登入會員：訊息存在雲端（cloud.js 的 window.WBDM），蔡在管理後台用角色身分回覆，回覆出現在左邊。
//   沒登入：只顯示這台裝置上的舊訊息（以前存在 wb:dm: / wb:c:），要傳新訊息請先登入。
(function () {
  var btn = document.querySelector('.chat-btn'), box = document.querySelector('.inbox');
  if (!btn || !box) return;
  var chars = JSON.parse(document.getElementById('chars').textContent || '{}');
  var novels = JSON.parse(document.getElementById('novels').textContent || '{}');
  var posts = null, cloud = null; // cloud：雲端訊息陣列；null＝沒登入或讀不到
  function get(k, d) { try { var v = localStorage.getItem('wb:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function av(id) { var c = chars[id] || {}; return '<span class="avatar" style="--c:' + esc(c.color || '#999') + '">' + (c.avatar ? '<img src="' + window.BASE + '/assets/avatars/' + esc(c.avatar) + '?v=' + window.VER + '" alt="">' : esc(c.glyph || '?')) + '</span>'; }
  function when(ms) { if (!ms) return ''; var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function dm() { return window.WBDM && window.WBDM.on() ? window.WBDM : null; }
  // 收集：每個角色 → [{t, at, post, me, local, unseen}]
  function collect() {
    var by = {};
    function add(cid, m) { (by[cid] = by[cid] || []).push(m); }
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf('wb:c:') === 0) {
          var p = posts[k.slice(5)]; if (!p) continue;
          (get(k.slice(3), []) || []).forEach(function (m, j) { var o = typeof m === 'string' ? { t: m } : m; add(p.c, { t: o.t, at: o.at || 0, ord: p.d * 1000 + j, post: p, me: true, local: true }); });
        } else if (k.indexOf('wb:dm:') === 0) {
          var cid = k.slice(6);
          (get(k.slice(3), []) || []).forEach(function (o) { add(cid, { t: o.t, at: o.at, ord: o.at, me: true, local: true }); });
        }
      }
    } catch (e) {}
    (cloud || []).forEach(function (r) {
      var at = Date.parse(r.created_at) || 0;
      add(r.chr, { t: r.body, at: at, ord: at, post: (r.post && posts[r.post]) || null, me: !r.from_char, unseen: r.from_char && !r.seen });
    });
    Object.keys(by).forEach(function (c) { by[c].sort(function (a, b) { return (a.at || a.ord) - (b.at || b.ord); }); });
    return by;
  }
  function listView() {
    var by = collect(), ids = Object.keys(by).filter(function (c) { return chars[c]; });
    ids.sort(function (a, b) { var x = by[a][by[a].length - 1], y = by[b][by[b].length - 1]; return (y.at || y.ord || 0) - (x.at || x.ord || 0); });
    // V1.0 R02-R1：私訊角色入口取消，收件匣只當通知用（留言新回應、管理員未讀私訊）。舊私訊資料保留在資料庫，不顯示。
    ids = [];
    var h = '<div class="ib-head"><b>通知</b><button type="button" class="ib-x" aria-label="關閉">✕</button></div>';
    var au = window.WBDM && window.WBDM.adminUnseen;
    if (au > 0) h += '<a class="ib-admin" href="' + window.BASE + '/admin/#dm">讀者傳來 ' + au + ' 則未讀私訊，前往後台回覆 ›</a>';
    var nt = (window.WBDM && window.WBDM.notices) || [];
    if (nt.length) {
      var byUrl = {}; Object.keys(posts || {}).forEach(function (k) { byUrl[posts[k].u] = posts[k]; });
      h += '<div class="ib-notices"><b>你留言的地方有新回應</b>' + nt.map(function (x) {
        var pp = byUrl[x.path], nv = novels[x.novel] || {}, t = '《' + (nv.title || x.novel) + '》' +
          (pp ? (pp.ch ? '第 ' + pp.ch + ' 篇・' : '') + pp.t : (x.path.indexOf('/novel/') === 0 ? '介紹頁' : ''));
        return '<a href="' + esc(x.path) + '#comments">' + esc(t) + '<span>' + x.n + ' 則新留言</span></a>';
      }).join('') + '</div>';
    }
    if (!ids.length && !nt.length && !(au > 0)) h += '<p class="ib-empty">' + (dm() ? '目前沒有新通知。<br>有人在你留過言的地方留言，會顯示在這裡。' : '登入會員後，有人在你留過言的地方留言，會通知你。') + '</p>';
    else h += '<ul class="ib-list">' + ids.map(function (c) {
      var ms = by[c], last = ms[ms.length - 1], ch = chars[c];
      var nNew = ms.filter(function (m) { return m.unseen; }).length;
      return '<li><button type="button" data-c="' + esc(c) + '">' + av(c) + '<span class="ib-who"><b>' + esc(ch.name) + '</b><small>@' + esc(ch.handle || '') + '</small><span class="ib-last">' + (last.me ? '你' : esc(ch.name)) + '：' + esc(last.t) + '</span></span>' +
        (nNew ? '<span class="ib-n new">' + nNew + '</span>' : '<span class="ib-n">' + ms.length + '</span>') + '</button></li>';
    }).join('') + '</ul>';
    box.innerHTML = '<div class="ib-panel">' + h + '</div>';
  }
  var ctx = null; // 從貼文點留言進來時，記住是哪一篇
  function chatView(c) {
    var msgs = collect()[c] || [], ch = chars[c] || {}, nv = novels[ch.novel] || {}, last = null;
    var h = '<div class="ib-head"><button type="button" class="ib-back" aria-label="返回">‹</button>' + av(c) + '<span class="ib-who"><b>' + esc(ch.name) + '</b><small>' + (nv.title ? '《' + esc(nv.title) + '》' : '') + '</small></span>' + (msgs.length ? '<button type="button" class="ib-del" data-del="' + esc(c) + '">刪除對話</button>' : '') + '<button type="button" class="ib-x" aria-label="關閉">✕</button></div><div class="ib-msgs">';
    if (msgs.some(function (m) { return m.local; })) h += '<p class="ib-note">淡色的訊息只存在這台裝置，' + esc(ch.name) + '看不到。</p>';
    msgs.forEach(function (m) {
      var tag = m.post ? m.post.u : 'dm';
      if (m.me && tag !== last) { h += m.post ? '<a class="ib-ref" href="' + esc(m.post.u) + '">' + (m.post.ch ? '第 ' + m.post.ch + ' 篇' : '') + '〈' + esc(m.post.t) + '〉</a>' : ''; last = tag; }
      var tm = m.at ? '<small>' + when(m.at) + '</small>' : '';
      h += m.me ? '<div class="ib-me' + (m.local ? ' local' : '') + '"><span>' + esc(m.t) + '</span>' + tm + '</div>'
                : '<div class="ib-them">' + av(c) + '<div><span>' + esc(m.t) + '</span>' + tm + '</div></div>';
    });
    h += '</div>';
    h += cloud
      ? '<form class="ib-form"><input type="text" maxlength="500" placeholder="傳訊息給' + esc(ch.name) + '…"><button type="submit">送出</button></form>'
      : '<div class="ib-login">登入會員就能私訊' + esc(ch.name) + '，' + esc(ch.name) + '會回覆你。<a href="' + window.BASE + '/member/">前往登入</a></div>';
    box.innerHTML = '<div class="ib-panel chat">' + h + '</div>';
    var ms = box.querySelector('.ib-msgs'); ms.scrollTop = ms.scrollHeight;
    if (cloud && msgs.some(function (m) { return m.unseen; })) {
      cloud.forEach(function (r) { if (r.chr === c && r.from_char) r.seen = true; });
      window.WBDM.seen(c);
    }
    var f = box.querySelector('.ib-form'); if (!f) return;
    f.onsubmit = async function (e) {
      e.preventDefault();
      var i = f.querySelector('input'), b = f.querySelector('button'), t = i.value.trim(); if (!t) return;
      var key = ctx && ctx.c === c && posts && posts[ctx.key] ? ctx.key : null;
      i.disabled = b.disabled = true;
      var err = await window.WBDM.send(c, key, t);
      if (err) { i.disabled = b.disabled = false; window.alert(err); i.focus(); return; }
      try { cloud = (await window.WBDM.load()) || cloud; } catch (x) {}
      chatView(c);
      var ni = box.querySelector('.ib-form input'); if (ni) ni.focus();
    };
  }
  async function open(then) {
    box.hidden = false; document.body.classList.add('ib-open');
    then = typeof then === 'function' ? then : listView;
    box.innerHTML = '<div class="ib-panel"><p class="ib-empty">載入中…</p></div>';
    if (!posts) {
      try { posts = await (await fetch(window.BASE + '/assets/posts.json?v=' + window.VER)).json(); } catch (e) { posts = {}; }
    }
    cloud = null;
    if (dm()) { try { var lr = await Promise.all([dm().load(), dm().refresh()]); cloud = lr[0]; } catch (e) { cloud = null; } }
    if (!box.hidden) then();
  }
  function close() { box.hidden = true; document.body.classList.remove('ib-open'); }
  // 刪除跟某個角色的整段對話：雲端的（含角色回覆）＋這台裝置上的舊訊息
  async function delThread(c, b) {
    var name = (chars[c] || {}).name || '';
    if (!window.confirm('刪除跟' + name + '的整段對話？' + (cloud ? name + '的回覆也會一起刪掉，' : '') + '刪了就找不回來。')) return;
    b.disabled = true;
    if (cloud) {
      var err = await window.WBDM.delThread(c);
      if (err) { b.disabled = false; window.alert(err); return; }
      cloud = cloud.filter(function (r) { return r.chr !== c; });
    }
    try {
      localStorage.removeItem('wb:dm:' + c);
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf('wb:c:') === 0 && posts[k.slice(5)] && posts[k.slice(5)].c === c) localStorage.removeItem(k);
      }
    } catch (x) {}
    ctx = null; listView();
  }
  btn.onclick = function () { ctx = null; open(); };
  // 貼文的留言按鈕：直接打開跟這個角色的私訊
  window.openDM = function () { ctx = null; open(); };
  box.addEventListener('click', function (e) {
    if (e.target === box || e.target.closest('.ib-x')) return close();
    if (e.target.closest('.ib-back')) { ctx = null; return listView(); }
    var d = e.target.closest('[data-del]'); if (d) return delThread(d.dataset.del, d);
    var b = e.target.closest('[data-c]'); if (b) chatView(b.dataset.c);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) close(); });
})();

// 作品介紹貼文：多張圖左右滑，下方圓點
(function () {
  document.querySelectorAll('.intro-post, .nv-gallery').forEach(function (p) {
    var sl = p.querySelector('.ip-slides'), dots = p.querySelectorAll('.ip-dots i'); if (!sl) return;
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
  var CATS = [['all', '全部'], ['novels', '小說'], ['chars', '角色'], ['events', '歷史事件'], ['arts', '文學文章']];
  var tabs = document.createElement('div'); tabs.className = 'sbox-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '搜尋分類');
  var cat = 'all';
  CATS.forEach(function (c) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.cat = c[0]; b.textContent = c[1]; b.setAttribute('aria-selected', c[0] === cat); b.onclick = function () { cat = c[0]; tabs.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-selected', x.dataset.cat === cat); }); run(); }; tabs.appendChild(b); });
  box.insertBefore(tabs, out);
  var idx = null, loading = null;
  function load() {
    if (idx || loading) return loading;
    loading = fetch((window.BASE || '') + '/assets/search.json?v=' + (window.VER || '')).then(function (r) { return r.json(); })
      .then(function (d) { idx = d; ['novels', 'chars', 'events', 'arts'].forEach(function (k) { (idx[k] || []).forEach(function (x) { x._k = String(x.k || '').toLowerCase(); }); }); })
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
    var v = q.value.trim().toLowerCase(); out.innerHTML = ''; if (!v) return;
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
