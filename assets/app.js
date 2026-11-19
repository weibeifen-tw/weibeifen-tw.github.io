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
    if (q.get('roles')) { document.body.classList.add('roles-only'); roles.forEach(function (r) { r.classList.add('full'); }); window.scrollTo(0, 0); return; }
    if (c) { pick(c); setTimeout(function () { document.getElementById('roles').scrollIntoView(); }, 50); } else pick('all');
    function rd(k) { try { var r = JSON.parse(localStorage.getItem(k) || 'null'); return r && r.url ? r : null; } catch (e) { return null; } }
    var btns = document.querySelector('.nv-btns'), lr = rd('wb:last:' + window.NOVEL);
    var b0 = mk('a', 'nv-btn');
    if (lr) { b0.textContent = '繼續讀第 ' + lr.no + ' 篇'; b0.href = lr.url; }
    else if (list[0]) { b0.textContent = '從第一篇開始讀'; b0.href = list[0].href; }
    if (b0.href) btns.appendChild(b0);
  } else if (who) {
    // 個人頁：像她的社群主頁，動態牆只放她發的貼文，照章節順序從第一則往下滑
    var box = document.querySelector('.chapters');
    box.hidden = true;
    var mineT = Array.prototype.slice.call(feed.querySelectorAll('.teaser')).filter(function (t) {
      t.hidden = true; return t.dataset.char === c && (!n || t.dataset.novel === n);
    });
    mineT.sort(function (a, b) { return (+a.dataset.no || 0) - (+b.dataset.no || 0); });
    mineT.forEach(function (t) { feed.appendChild(t); });
    shown = mineT.length;
    var PAGE1 = 15, upto1 = 0, more1 = document.querySelector('.more-btn');
    function step1() { mineT.slice(upto1, upto1 + PAGE1).forEach(function (t) { t.hidden = false; }); upto1 += PAGE1; more1.hidden = upto1 >= mineT.length; }
    more1.onclick = step1; step1();

    var prof = document.getElementById('profile');
    var av = document.createElement('div');
    av.className = 'avatar'; av.style.setProperty('--c', who.color || '#999');
    if (who.avatar) { var im = new Image(); im.src = BASE + '/assets/avatars/' + who.avatar + '?v=' + (window.VER || ''); im.alt = ''; av.appendChild(im); }
    else av.textContent = who.glyph || who.name.charAt(0);
    var info = document.createElement('div');
    var h = document.createElement('h1'); h.textContent = who.name;
    var hd = document.createElement('span'); hd.className = 'handle'; hd.textContent = '@' + who.handle;
    var bio = document.createElement('p'); bio.textContent = who.bio || '';
    info.append(h, hd, bio);
    prof.append(av, info); prof.hidden = false;
    prof.style.setProperty('--c', who.color || '#999');
    function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    function chLink(no) { return no ? box.querySelector('a.toc[data-novel="' + who.novel + '"][data-no="' + no + '"]') : null; }
    // 置頂一句話
    if (who.pin) {
      var pin = el('blockquote', 'pin', who.pin);
      var src = chLink(who.pin_ch);
      if (src) { var sm = el('small', null, '—— '); var sa = el('a', null, '〈' + src.querySelector('.ch-title').textContent + '〉'); sa.href = src.href; sm.appendChild(sa); pin.appendChild(sm); }
      prof.appendChild(pin);
    }
    var after = prof;
    function addBox(title, list) { var s = el('section', 'pbox'); s.style.setProperty('--c', who.color || '#999'); s.append(el('h3', null, title), list); after.after(s); after = s; }
    // 那些年
    if (who.eras && who.eras.length) {
      var ul = el('ul', 'eras');
      who.eras.forEach(function (e) { var li = el('li'); li.append(el('b', null, e.year), el('span', null, e.bio)); ul.appendChild(li); });
      addBox('那些年的' + who.name, ul);
    }
    // 她的東西
    if (who.items && who.items.length) {
      var il = el('ul', 'items');
      who.items.forEach(function (it) {
        var li = el('li'), src = chLink(it.ch), w = src ? el('a') : el('div');
        if (src) w.href = src.href;
        w.append(el('b', null, it.name), el('span', null, it.note));
        if (src) w.appendChild(el('em', null, '第一次出現：〈' + src.querySelector('.ch-title').textContent + '〉 ›'));
        li.appendChild(w); il.appendChild(li);
      });
      addBox('她的東西', il);
    }
    document.title = who.name + '｜未備份';

    if (location.hash) {
      var key0 = decodeURIComponent(location.hash.slice(1)), idx = -1;
      mineT.forEach(function (t, i) { if (t.querySelector('.actions').dataset.key === key0) idx = i; });
      if (idx >= 0) { while (upto1 <= idx) step1(); setTimeout(function () { mineT[idx].scrollIntoView(); }, 50); }
    }
  } else {
    // 動態牆：每章一則重點（也可篩選小說、已說讚、已轉發）
    var liked = q.get('liked'), rp = q.get('reposted');
    function has(k) { try { return JSON.parse(localStorage.getItem('wb:' + k)) === true; } catch (e) { return false; } }
    var hits = [];
    feed.querySelectorAll('.teaser').forEach(function (t) {
      var key = t.querySelector('.actions').dataset.key;
      var ok = (!n || t.dataset.novel === n) && (!liked || has('like:' + key)) && (!rp || has('rp:' + key));
      t.hidden = true; if (ok) { shown++; hits.push(t); }
    });
    // 首頁動態：每次打開都隨機排，盡量讓相鄰兩則不是同一部小說
    if (!liked && !rp && !n) {
      for (var i = hits.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), tmp = hits[i]; hits[i] = hits[j]; hits[j] = tmp; }
      var out = [], prev = null;
      while (hits.length) {
        var k = 0; while (k < hits.length && hits[k].dataset.novel === prev) k++;
        if (k === hits.length) k = 0;
        prev = hits[k].dataset.novel; out.push(hits.splice(k, 1)[0]);
      }
      hits = out;
      // 作品介紹貼文：滿 4 部就只放介紹；不到 4 部先放在最上面，下面接章節動態
      var ips = Array.prototype.slice.call(document.querySelectorAll('.intros .intro-post'));
      for (var a = ips.length - 1; a > 0; a--) { var b = Math.floor(Math.random() * (a + 1)), tt = ips[a]; ips[a] = ips[b]; ips[b] = tt; }
      // 有插畫的排前面（各自隨機），沒插畫的排後面
      ips = ips.filter(function (x) { return x.dataset.has === '1'; }).concat(ips.filter(function (x) { return x.dataset.has !== '1'; }));
      if (ips.length >= 4) { hits.forEach(function (t) { t.remove(); }); hits = ips; }
      else if (ips.length) { hits = ips.concat(hits); }
      hits.forEach(function (t) { feed.appendChild(t); });
    }
    // 一次先放 15 則，按「載入更多」再放 15 則
    var PAGE = 15, upto = 0, more = document.querySelector('.more-btn');
    function step() { hits.slice(upto, upto + PAGE).forEach(function (t) { t.hidden = false; }); upto += PAGE; more.hidden = upto >= hits.length; }
    more.onclick = step; step();
  }
  document.querySelector('.empty').hidden = shown > 0;
})();

// 互動按鈕：讚只有動畫、轉發到脆、留言進角色私訊、分享連結
(function () {
  function get(k, d) { try { var v = localStorage.getItem('wb:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem('wb:' + k, JSON.stringify(v)); } catch (e) {} }
  // 假的互動數字：用文章 key 當種子，同一篇每次看到的數字都一樣
  function rnd(seed) { var h = 2166136261; for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
  function fake(key) {
    var r = rnd(key || 'x'), viral = r() < 0.02;
    var likes = Math.round(Math.exp(Math.log(viral ? 1000 : 3) + r() * Math.log(viral ? 5 : 330)));
    return { like: likes, talk: Math.round(likes * (0.02 + r() * 0.08)), rp: Math.round(likes * (0.01 + r() * 0.05)), share: Math.round(likes * (0.01 + r() * 0.07)) };
  }
  function fmt(n) { return !n ? '' : n >= 10000 ? (Math.round(n / 1000) / 10) + '萬' : String(n); }
  document.querySelectorAll('.actions').forEach(function (a) {
    var key = a.dataset.key, base = fake(key), liked = false;
    var host = a.closest('[data-char]'), cid = host ? host.dataset.char : '';
    var like = a.querySelector('.like'), talk = a.querySelector('.talk'), rep = a.querySelector('.repost');
    var url = new URL(a.dataset.url, location.origin).href;
    function draw() {
      like.classList.toggle('on', liked); like.querySelector('.n').textContent = fmt(base.like + (liked ? 1 : 0));
      if (rep) rep.querySelector('.n').textContent = fmt(base.rp);
      if (talk) talk.querySelector('.n').textContent = fmt(base.talk + get('c:' + key, []).length);
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
    btn.setAttribute('aria-expanded', open); d.setAttribute('aria-hidden', !open);
  }
  btn.onclick = function () { toggle(!d.classList.contains('open')); };
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
  list.forEach(function (x) {
    if (x.r) { sub.appendChild(row(x.r.url, novels[x.id].title, x.r.no)); return; }
    var h = document.createElement('a'); h.href = BASE + '/novel/' + x.id + '/'; h.className = 'd-nv'; h.textContent = novels[x.id].title; sub.appendChild(h);
    x.rows.forEach(function (y) { sub.appendChild(row(y[1].url, (chars[y[0]] || {}).name || '', y[1].no, 'd-ch')); });
  });
};
window.WBRenderShelf();

// 小說總覽的台灣地圖：滑到（手機點）一個地形區，旁邊列出那區的小說
(function () {
  var wrap = document.querySelector('.tw-wrap'); if (!wrap) return;
  var panel = wrap.querySelector('.tw-panel'), hint = panel.innerHTML;
  var novels = JSON.parse(document.getElementById('novels').textContent || '{}');
  var chars = JSON.parse(document.getElementById('chars').textContent || '{}');
  var regions = JSON.parse(document.getElementById('regions').textContent || '[]'), names = {};
  var notes = {}, places = JSON.parse((document.getElementById('places') || {}).textContent || '{}');
  regions.forEach(function (s) { (s.areas || []).forEach(function (a) { names[a.key] = a.name; notes[a.key] = a.note || ''; }); });
  function color(id) { for (var k in chars) if (chars[k].novel === id) return chars[k].color; return '#6b665c'; }
  function list(key) { return Object.keys(novels).filter(function (id) { return novels[id].region === key; }); }
  var cur = null, pinned = null;
  function show(key) {
    if (key === cur) return; cur = key;
    wrap.querySelectorAll('.tw-rg').forEach(function (r) { r.classList.toggle('on', r.dataset.rg === key); });
    panel.innerHTML = '';
    // 手機版：小說列表從底部滑出，右上角可以收起來
    var x = document.createElement('button'); x.type = 'button'; x.className = 'tw-close'; x.setAttribute('aria-label', '收起'); x.textContent = '✕';
    x.onclick = function (e) { e.stopPropagation(); wrap.classList.remove('open'); pinned = null; cur = null; wrap.querySelectorAll('.tw-rg').forEach(function (r) { r.classList.remove('on', 'pin'); }); };
    panel.appendChild(x); wrap.classList.add('open');
    var h = document.createElement('h3'); h.textContent = names[key] || ''; panel.appendChild(h);
    if (notes[key]) { var nt = document.createElement('p'); nt.className = 'tw-note'; nt.textContent = notes[key]; panel.appendChild(nt); }
    var ids = list(key);
    if (!ids.length) { var p = document.createElement('p'); p.className = 'tw-empty'; p.textContent = '這裡還沒有小說。'; panel.appendChild(p); return; }
    ids.forEach(function (id) {
      var a = document.createElement('a'); a.className = 'tw-item'; a.href = BASE + '/novel/' + id + '/'; a.style.color = color(id);
      var row = document.createElement('span'); row.className = 'tw-row';
      var b = document.createElement('b'); b.textContent = novels[id].title; row.appendChild(b);
      a.appendChild(row);
      if (novels[id].era) { var s = document.createElement('small'); s.textContent = novels[id].era; a.appendChild(s); }
      if (places[id]) { var pl = document.createElement('span'); pl.className = 'tw-place'; pl.textContent = places[id]; a.appendChild(pl); }
      panel.appendChild(a);
    });
  }
  wrap.querySelectorAll('.tw-rg').forEach(function (r) {
    if (list(r.dataset.rg).length) r.classList.add('has');
    // 還沒點選時，滑過去先預覽；點了就固定，滑到別區也不會換
    r.addEventListener('mouseenter', function () { if (!pinned) show(r.dataset.rg); });
    r.addEventListener('click', function () {
      pinned = r.dataset.rg; cur = null; show(pinned);
      wrap.querySelectorAll('.tw-rg').forEach(function (x) { x.classList.toggle('pin', x.dataset.rg === pinned); });
    });
  });
})();

// 私訊：把讀者在各篇的留言，依角色整理成對話框
(function () {
  var btn = document.querySelector('.chat-btn'), box = document.querySelector('.inbox');
  if (!btn || !box) return;
  var chars = JSON.parse(document.getElementById('chars').textContent || '{}');
  var novels = JSON.parse(document.getElementById('novels').textContent || '{}');
  var posts = null;
  function get(k, d) { try { var v = localStorage.getItem('wb:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem('wb:' + k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function av(id) { var c = chars[id] || {}; return '<span class="avatar" style="--c:' + (c.color || '#999') + '">' + (c.avatar ? '<img src="' + window.BASE + '/assets/avatars/' + c.avatar + '?v=' + window.VER + '" alt="">' : esc(c.glyph || '?')) + '</span>'; }
  function when(ms) { if (!ms) return ''; var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  // 收集：每個角色 → [{t, at, post}]
  function collect() {
    var by = {};
    function add(cid, m) { (by[cid] = by[cid] || []).push(m); }
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf('wb:c:') === 0) {
          var p = posts[k.slice(5)]; if (!p) continue;
          (get(k.slice(3), []) || []).forEach(function (m, j) { var o = typeof m === 'string' ? { t: m } : m; add(p.c, { t: o.t, at: o.at || 0, ord: p.d * 1000 + j, post: p }); });
        } else if (k.indexOf('wb:dm:') === 0) {
          var cid = k.slice(6);
          (get(k.slice(3), []) || []).forEach(function (o) { add(cid, { t: o.t, at: o.at, ord: o.at }); });
        }
      }
    } catch (e) {}
    Object.keys(by).forEach(function (c) { by[c].sort(function (a, b) { return (a.at || a.ord) - (b.at || b.ord); }); });
    return by;
  }
  function listView() {
    var by = collect(), ids = Object.keys(by).filter(function (c) { return chars[c]; });
    ids.sort(function (a, b) { var x = by[a][by[a].length - 1], y = by[b][by[b].length - 1]; return (y.at || 0) - (x.at || 0); });
    var h = '<div class="ib-head"><b>私訊</b><button type="button" class="ib-x" aria-label="關閉">✕</button></div>';
    if (!ids.length) h += '<p class="ib-empty">還沒有對話。<br>在貼文下面留言，就會出現在這裡。</p>';
    else h += '<ul class="ib-list">' + ids.map(function (c) { var last = by[c][by[c].length - 1], ch = chars[c]; return '<li><button type="button" data-c="' + c + '">' + av(c) + '<span class="ib-who"><b>' + esc(ch.name) + '</b><small>@' + esc(ch.handle || '') + '</small><span class="ib-last">你：' + esc(last.t) + '</span></span><span class="ib-n">' + by[c].length + '</span></button></li>'; }).join('') + '</ul>';
    box.innerHTML = '<div class="ib-panel">' + h + '</div>';
  }
  var ctx = null; // 從貼文點留言進來時，記住是哪一篇
  function chatView(c) {
    var msgs = collect()[c] || [], ch = chars[c] || {}, nv = novels[ch.novel] || {}, last = null;
    var h = '<div class="ib-head"><button type="button" class="ib-back" aria-label="返回">‹</button>' + av(c) + '<span class="ib-who"><b>' + esc(ch.name) + '</b><small>' + (nv.title ? '《' + esc(nv.title) + '》' : '') + '</small></span><button type="button" class="ib-x" aria-label="關閉">✕</button></div><div class="ib-msgs">';
    msgs.forEach(function (m) {
      var tag = m.post ? m.post.u : 'dm';
      if (tag !== last) { h += m.post ? '<a class="ib-ref" href="' + m.post.u + '">' + (m.post.ch ? '第 ' + m.post.ch + ' 篇' : '') + '〈' + esc(m.post.t) + '〉</a>' : '<span class="ib-ref">直接私訊</span>'; last = tag; }
      h += '<div class="ib-me"><span>' + esc(m.t) + '</span>' + (m.at ? '<small>' + when(m.at) + '</small>' : '') + '</div>';
    });
    h += '</div><form class="ib-form"><input type="text" maxlength="200" placeholder="傳訊息給' + esc(ch.name) + '…（只有你看得到）"><button type="submit">送出</button></form>';
    box.innerHTML = '<div class="ib-panel chat">' + h + '</div>';
    var ms = box.querySelector('.ib-msgs'); ms.scrollTop = ms.scrollHeight;
    box.querySelector('.ib-form').onsubmit = function (e) { e.preventDefault(); var i = this.querySelector('input'), t = i.value.trim(); if (!t) return; var kk = ctx && ctx.c === c && posts && posts[ctx.key] ? 'c:' + ctx.key : 'dm:' + c; var a = get(kk, []); a.push({ t: t, at: Date.now() }); set(kk, a); chatView(c); box.querySelector('.ib-form input').focus(); };
  }
  function open(then) {
    box.hidden = false; document.body.classList.add('ib-open');
    then = typeof then === 'function' ? then : listView;
    if (posts) return then();
    box.innerHTML = '<div class="ib-panel"><p class="ib-empty">載入中…</p></div>';
    fetch(window.BASE + '/assets/posts.json?v=' + window.VER).then(function (r) { return r.json(); }).then(function (j) { posts = j; then(); }).catch(function () { posts = {}; then(); });
  }
  function close() { box.hidden = true; document.body.classList.remove('ib-open'); }
  btn.onclick = function () { ctx = null; open(); };
  // 貼文的留言按鈕：直接打開跟這個角色的私訊
  window.openDM = function (c, key) { if (!chars[c]) return; ctx = { c: c, key: key }; open(function () { chatView(c); }); };
  box.addEventListener('click', function (e) {
    if (e.target === box || e.target.closest('.ib-x')) return close();
    if (e.target.closest('.ib-back')) { ctx = null; return listView(); }
    var b = e.target.closest('[data-c]'); if (b) chatView(b.dataset.c);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) close(); });
})();

// 首頁頭像列：點了跳出角色卡片
(function () {
  var layer = document.querySelector('.st-layer'); if (!layer) return;
  var box = layer.querySelector('.st-in');
  function close() { layer.hidden = true; document.body.style.overflow = ''; box.innerHTML = ''; }
  document.querySelectorAll('.story').forEach(function (b) {
    b.onclick = function () {
      var t = document.getElementById('st-' + b.dataset.story); if (!t) return;
      box.innerHTML = ''; box.appendChild(t.content.cloneNode(true));
      layer.hidden = false; document.body.style.overflow = 'hidden';
    };
  });
  layer.querySelector('.st-x').onclick = close;
  layer.onclick = function (e) { if (e.target === layer) close(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !layer.hidden) close(); });
})();

// 頭像列：電腦用滑鼠滾輪、拖曳也能左右滑
(function () {
  var s = document.querySelector('.stories'); if (!s) return;
  s.addEventListener('wheel', function (e) { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && s.scrollWidth > s.clientWidth) { e.preventDefault(); s.scrollLeft += e.deltaY; } }, { passive: false });
  var down = false, x0 = 0, l0 = 0, moved = false;
  s.addEventListener('mousedown', function (e) { down = true; moved = false; x0 = e.pageX; l0 = s.scrollLeft; });
  addEventListener('mousemove', function (e) { if (!down) return; var d = e.pageX - x0; if (Math.abs(d) > 4) moved = true; s.scrollLeft = l0 - d; });
  addEventListener('mouseup', function () { down = false; });
  s.addEventListener('click', function (e) { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
})();

// 作品介紹貼文：多張圖左右滑，下方圓點
(function () {
  document.querySelectorAll('.intro-post').forEach(function (p) {
    var sl = p.querySelector('.ip-slides'), dots = p.querySelectorAll('.ip-dots i'); if (!sl) return;
    function go(k) { sl.scrollTo({ left: k * sl.clientWidth, behavior: 'smooth' }); }
    dots.forEach(function (d, i) { d.onclick = function () { go(i); }; });
    sl.onclick = function (e) { var r = sl.getBoundingClientRect(), k = Math.round(sl.scrollLeft / sl.clientWidth); go(e.clientX - r.left > r.width / 2 ? Math.min(k + 1, dots.length - 1) : Math.max(k - 1, 0)); };
    sl.addEventListener('scroll', function () { var k = Math.round(sl.scrollLeft / sl.clientWidth); dots.forEach(function (d, i) { d.classList.toggle('on', i === k); }); }, { passive: true });
  });
})();

// 作品介紹貼文：讀過的人，按鈕改成「繼續讀第 N 篇」
(function () {
  document.querySelectorAll('.st-go[data-novel]').forEach(function (a) {
    try { var r = JSON.parse(localStorage.getItem('wb:last:' + a.dataset.novel) || 'null'); if (r && r.url) { a.href = r.url; var rl = a.querySelector('.rl'); if (rl) rl.textContent = '讀第 ' + r.no + ' 篇'; else a.textContent = '繼續讀第 ' + r.no + ' 篇'; } } catch (e) {}
  });
})();

// 頂端搜尋：點放大鏡展開，即時列出符合的小說
(function () {
  var btn = document.querySelector('.search-btn'), box = document.querySelector('.sbox'); if (!btn || !box) return;
  var q = box.querySelector('.sbox-q'), out = box.querySelector('.sbox-r');
  var nv = {}, ch = {};
  try { nv = JSON.parse(document.getElementById('novels').textContent); ch = JSON.parse(document.getElementById('chars').textContent); } catch (e) {}
  var list = Object.keys(nv).map(function (id) {
    var n = nv[id], who = Object.keys(ch).filter(function (c) { return ch[c].novel === id; }).map(function (c) { return ch[c].name + ' ' + ch[c].handle; }).join(' ');
    return { id: id, t: n.title, era: n.era || '', key: [n.title, n.era, n.tag, (n.tags || []).join(' '), n.blurb, n.intro, who].join(' ').toLowerCase() };
  });
  function open(v) { box.hidden = !v; btn.setAttribute('aria-expanded', v); if (v) { q.focus(); } else { q.value = ''; out.innerHTML = ''; } }
  btn.onclick = function () { open(box.hidden); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) open(false); });
  q.addEventListener('input', function () {
    var v = q.value.trim().toLowerCase(); out.innerHTML = ''; if (!v) return;
    var hit = list.filter(function (x) { return x.key.indexOf(v) >= 0; });
    if (!hit.length) { var li = document.createElement('li'); li.className = 'none'; li.textContent = '找不到符合的小說'; out.appendChild(li); return; }
    hit.forEach(function (x) { var li = document.createElement('li'), a = document.createElement('a'), b = document.createElement('b'), sm = document.createElement('small'); a.href = (window.BASE || '') + '/novel/' + x.id + '/'; b.textContent = x.t; sm.textContent = x.era; a.append(b, sm); li.appendChild(a); out.appendChild(li); });
  });
})();

// 作品貼文：點人像圖示顯示／收起標註的角色
document.querySelectorAll('.ip-tagbtn').forEach(function (b) {
  var t = b.parentNode.querySelector('.ip-tags');
  b.onclick = function (e) { e.stopPropagation(); t.hidden = !t.hidden; b.setAttribute('aria-expanded', !t.hidden); };
});
