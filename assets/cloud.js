/*
 * 未備份｜收藏與雲端書櫃
 *
 * 只有這台瀏覽器「有登入資料」時，才載入 Supabase SDK 與 auth.js；
 * 沒登入的讀者不連會員伺服器、不多載任何檔案，閱讀速度不受影響。
 *
 * 1. 雲端書櫃：瀏覽器裡的 wb:last:*（書櫃、繼續讀）跟資料庫 reading_progress 互相同步，
 *    同一本（或同一個角色線）以「讀得比較後面」的為準；章數一樣時以比較新的為準。
 *    其他本機資料（字級、夜間模式、捲動位置、讀完標記、私訊）完全不動。
 * 2. 收藏：小說介紹頁可收藏整本，章節頁可加書籤；會員頁列出「我的收藏」。
 * 3. 公開留言：章節頁最下面、小說介紹頁篇章列表下面（整本小說的留言）。訪客也看得到（直接用可公開金鑰讀，不載入 SDK），會員才能留言。
 * 4. 私訊角色：登入會員傳給角色的私訊存到雲端，蔡在管理後台用角色身分回覆（收件匣在 app.js，透過 window.WBDM）。
 *
 * 權限由 Supabase RLS 在伺服器端把關：每個人只能讀寫自己的資料。
 * 所有資料一律用 textContent 寫入，不使用 innerHTML。
 */
(function () {
  'use strict';

  var SESSION_KEY = 'sb-tqicconarhpddejxdvmf-auth-token';
  var SYNC_KEY = 'wb-sync-at';            // sessionStorage：這個分頁上次同步的時間
  var SYNC_EVERY = 10 * 60 * 1000;        // 一般頁面最多 10 分鐘同步一次；章節頁、會員頁每次都同步
  var KEY_RE = /^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$/;
  var L = window.WB_AUTH_LAZY || {};
  var BASE = window.BASE || '';
  var novels = {};
  try { novels = JSON.parse(document.getElementById('novels').textContent || '{}'); } catch (e) {}

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function signedIn() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return !!(s && (s.refresh_token || (s.currentSession && s.currentSession.refresh_token)));
    } catch (e) { return false; }
  }

  /* ---------- 有登入才載入 SDK 與 auth.js ---------- */
  function load(src, sri) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src;
      if (sri) { s.integrity = sri; s.crossOrigin = 'anonymous'; }
      s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
  }

  var ready = null;
  function getAuth() {
    if (window.WBAuth && !window.WBAuth.configProblem()) return Promise.resolve(window.WBAuth);
    if (!ready) {
      ready = (window.supabase ? Promise.resolve() : load(L.sdk, L.sri))
        .then(function () { return window.WBAuth ? null : load(L.auth); })
        .then(function () {
          if (!window.WBAuth || window.WBAuth.configProblem()) throw new Error('auth unavailable');
          return window.WBAuth;
        });
      ready.catch(function () { ready = null; });
    }
    return ready;
  }

  async function uidOf(c) {
    var s = await c.auth.getSession();
    return (s.data && s.data.session && s.data.session.user && s.data.session.user.id) || null;
  }

  // 錯誤訊息後面附上錯誤代碼，方便回報問題
  function errText(msg, e) {
    var code = (e && (e.code || e.status)) || '';
    var detail = (e && e.message) ? String(e.message).slice(0, 120) : '';
    return msg + (code || detail ? '\n（錯誤代碼：' + code + (detail ? '｜' + detail : '') + '）' : '');
  }

  function cut(v, n) { return v == null || v === '' ? null : String(v).slice(0, n); }

  /* ---------- 雲端書櫃 ---------- */
  function localRecords() {
    var m = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf('wb:last:') !== 0) continue;
        var id = k.slice(8);
        if (!KEY_RE.test(id)) continue;
        var r = JSON.parse(localStorage.getItem(k) || 'null');
        if (r && typeof r.url === 'string' && r.url.charAt(0) === '/' && r.url.charAt(1) !== '/') m[id] = r;
      }
    } catch (e) {}
    return m;
  }

  function num(v) { var n = parseFloat(v); return isNaN(n) ? -1 : n; }
  // a 是否比 b 讀得更後面（b 不存在就算是）
  function further(a, b) {
    if (!b) return true;
    var x = num(a.no), y = num(b.no);
    if (x !== y) return x > y;
    return (+a.t || 0) > (+b.t || 0);
  }

  async function sync(A) {
    var c = A.getClient();
    var uid = await uidOf(c);
    if (!uid) return;
    var res = await c.from('reading_progress').select('k,url,no,title,chr,t');
    if (res.error) return;

    var cloud = {};
    (res.data || []).forEach(function (r) {
      if (KEY_RE.test(r.k)) cloud[r.k] = { url: r.url, no: r.no, title: r.title, char: r.chr, t: +r.t || 0 };
    });
    var local = localRecords(), up = [], changed = false;

    Object.keys(cloud).forEach(function (k) {
      if (further(cloud[k], local[k])) {
        try { localStorage.setItem('wb:last:' + k, JSON.stringify(cloud[k])); changed = true; } catch (e) {}
      }
    });
    Object.keys(local).forEach(function (k) {
      var r = local[k];
      if (!further(r, cloud[k])) return;
      up.push({
        user_id: uid, k: k, url: r.url.slice(0, 300),
        no: cut(r.no, 10), title: cut(r.title, 100), chr: cut(r.char, 40),
        t: Math.round(+r.t || 0)
      });
    });
    if (up.length) await c.from('reading_progress').upsert(up, { onConflict: 'user_id,k' });

    try { sessionStorage.setItem(SYNC_KEY, String(Date.now())); } catch (e) {}
    if (changed && window.WBRenderShelf) window.WBRenderShelf();
  }

  /* ---------- 收藏 ---------- */
  async function isFav(A, novel, path) {
    var res = await A.getClient().from('favorites').select('path').eq('novel', novel).eq('path', path).maybeSingle();
    return !res.error && !!res.data;
  }

  async function setFav(A, on, row) {
    var c = A.getClient();
    var uid = await uidOf(c);
    if (!uid) return '請先登入。';
    var res;
    if (on) {
      res = await c.from('favorites').insert({
        user_id: uid, novel: row.novel, path: row.path,
        title: cut(row.title, 100), no: cut(row.no, 10)
      });
      if (res.error && res.error.code === '23505') return null; // 已經收藏過了
    } else {
      res = await c.from('favorites').delete().eq('novel', row.novel).eq('path', row.path);
    }
    return res.error ? errText('收藏沒有成功，請稍後再試。', res.error) : null;
  }

  function askLogin() {
    if (window.confirm('收藏需要登入會員，要前往登入嗎？')) location.href = BASE + '/member/';
  }

  // 建一顆收藏按鈕；labels = [未收藏, 已收藏]
  function favButton(cls, labels, row) {
    var b = el('button', cls, labels[0]);
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    var on = false;
    function paint() { b.textContent = labels[on ? 1 : 0]; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); }
    b.onclick = async function () {
      if (!signedIn()) { askLogin(); return; }
      b.disabled = true;
      var err = null;
      try { var A = await getAuth(); err = await setFav(A, !on, row); }
      catch (e) { err = '連不上會員伺服器，請稍後再試。'; }
      b.disabled = false;
      if (err) { window.alert(err); return; }
      on = !on; paint();
    };
    b.setOn = function (v) { on = !!v; paint(); };
    return b;
  }

  var buttons = []; // [按鈕, row]

  // 小說介紹頁：收藏整本
  var btns = document.querySelector('.nv-btns');
  if (btns && window.NOVEL) {
    var nr = { novel: window.NOVEL, path: '', title: (novels[window.NOVEL] || {}).title || '' };
    var nb = favButton('nv-btn nv-fav', ['☆ 收藏這本', '★ 已收藏'], nr);
    btns.appendChild(nb);
    buttons.push([nb, nr]);
  }

  // 章節頁：加書籤
  var sec = document.querySelector('.chapter.read');
  if (sec && sec.dataset.novel) {
    var cr = { novel: sec.dataset.novel, path: location.pathname, title: sec.dataset.title || '', no: sec.dataset.no || '' };
    var cb = favButton('ch-fav', ['🔖 加入書籤', '🔖 已加入書籤'], cr);
    // 放在愛心、留言、轉發、分享那一排的最右邊
    var row = sec.querySelector('.r-acts');
    if (row) row.appendChild(cb);
    else { var wrap = el('p', 'ch-fav-wrap'); wrap.appendChild(cb); sec.appendChild(wrap); }
    buttons.push([cb, cr]);
  }

  /* ---------- 會員頁：我的收藏 ---------- */
  var favBox = document.querySelector('.mb-favs');
  var favList = favBox && favBox.querySelector('.fav-list');

  async function renderFavs(A) {
    if (!favList) return;
    var res = await A.getClient().from('favorites').select('novel,path,title,no,created_at').order('created_at', { ascending: false });
    favList.textContent = '';
    favBox.hidden = false;
    if (res.error) { favList.appendChild(el('p', 'mb-form-msg err', errText('讀取收藏失敗，請重新整理。', res.error))); return; }
    var rows = res.data || [];
    if (!rows.length) { favList.appendChild(el('p', null, '還沒有收藏。在小說介紹頁按「收藏這本」，或在章節最後按「加入書籤」。')); return; }
    rows = rows.filter(function (r) { return novels[r.novel]; }); // 小說已下架的不列
    function item(r, label) {
      var it = el('div', 'fav-item');
      var a = el('a', null, label);
      a.href = r.path === '' ? BASE + '/novel/' + r.novel + '/' : r.path;
      var del = el('button', 'fav-del', '移除'); del.type = 'button';
      del.onclick = async function () {
        del.disabled = true;
        var err = await setFav(A, false, { novel: r.novel, path: r.path });
        if (err) { del.disabled = false; window.alert(err); return; }
        renderFavs(A);
      };
      it.appendChild(a); it.appendChild(del);
      return it;
    }
    // 收藏的小說：直接列出
    var whole = rows.filter(function (r) { return r.path === ''; });
    if (whole.length) {
      favList.appendChild(el('h3', 'fav-h', '收藏的小說'));
      whole.forEach(function (r) { favList.appendChild(item(r, '《' + novels[r.novel].title + '》')); });
    }
    // 書籤：照小說分組，點小說名才展開
    var marks = rows.filter(function (r) { return r.path !== ''; }), groups = {}, order = [];
    marks.forEach(function (r) { if (!groups[r.novel]) { groups[r.novel] = []; order.push(r.novel); } groups[r.novel].push(r); });
    if (order.length) {
      favList.appendChild(el('h3', 'fav-h', '書籤'));
      order.forEach(function (nid) {
        var d = el('details', 'fav-group');
        var sm = el('summary', null, '《' + novels[nid].title + '》');
        sm.appendChild(el('small', null, groups[nid].length + ' 個書籤'));
        d.appendChild(sm);
        groups[nid].sort(function (x, y) { return (parseFloat(x.no) || 0) - (parseFloat(y.no) || 0); });
        groups[nid].forEach(function (r) { d.appendChild(item(r, (r.no ? '第 ' + r.no + ' 篇・' : '') + (r.title || ''))); });
        favList.appendChild(d);
      });
    }
  }

  /* ---------- 公開留言（章節頁最下面） ---------- */
  var AU = window.WB_AUTH_CONFIG || {};
  var CM_COLS = 'id,user_id,body,hidden,removed,as_author,created_at,profiles(display_name,username,avatar_color,bio)';

  function cmError(e) {
    var m = (e && e.message) || '';
    if (/WB_BANNED/.test(m)) return '你的帳號已被停權，不能留言。';
    if (/WB_TOO_LONG/.test(m)) return '留言最多 100 個字。';
    if (/WB_TOO_FAST/.test(m)) return '留言太快了，請等 15 秒再試。';
    if (/WB_TOO_MANY/.test(m)) return '一小時最多留 5 則，請晚點再來。';
    if (/WB_LOGIN_REQUIRED/.test(m)) return '請先登入會員。';
    if (e && e.code === '23514') return '留言要 1～100 個字。';
    if (e && e.code === '23505') return '你已經檢舉過這則留言了。';
    return errText('沒有成功，請稍後再試。', e);
  }

  // 訪客：不載入 SDK，直接用可公開的金鑰讀留言
  async function fetchCommentsPublic(path) {
    var u = AU.supabaseUrl + '/rest/v1/comments?select=' + encodeURIComponent(CM_COLS) +
      '&path=eq.' + encodeURIComponent(path) + '&order=created_at.asc&limit=300';
    var r = await fetch(u, { headers: { apikey: AU.publishableKey } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // 留言按鈕上的數字改成假的（app.js），這裡不再覆蓋
  function setTalkCount() {}

  // 會員小卡片：同一時間只開一張，點外面或按 Esc 關掉
  var cardEl = null;
  function closeCard() { if (cardEl) { cardEl.remove(); cardEl = null; } }
  function showCard(anchor, p, r) {
    var same = cardEl && cardEl._for === anchor;
    closeCard();
    if (same) return;
    var c = el('div', 'cm-card'); c._for = anchor;
    c.setAttribute('role', 'dialog');
    var head = el('div', 'cm-card-head');
    if (window.WBAvatar) head.appendChild(window.WBAvatar.make({ name: p.display_name || '新會員', color: p.avatar_color, id: r.user_id, author: r.as_author }, 'cm-card-av'));
    var nm = el('div', 'cm-card-who');
    var b = el('b', null, p.display_name || '新會員');
    if (r.as_author) b.appendChild(el('span', 'cm-author', '作者'));
    nm.appendChild(b);
    if (p.username) nm.appendChild(el('small', null, '@' + p.username));
    head.appendChild(nm);
    c.appendChild(head);
    c.appendChild(el('p', 'cm-card-bio' + (p.bio ? '' : ' empty'), p.bio || '還沒有寫簡介。'));
    document.body.appendChild(c);
    var a = anchor.getBoundingClientRect(), w = c.offsetWidth;
    var left = Math.max(8, Math.min(a.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - w - 8));
    c.style.left = left + 'px';
    c.style.top = (a.bottom + window.scrollY + 6) + 'px';
    cardEl = c;
  }
  document.addEventListener('click', function (e) { if (cardEl && !cardEl.contains(e.target)) closeCard(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCard(); });

  function initComments() {
    if (!AU.supabaseUrl) return;
    // 章節頁：放在章節最下面；小說介紹頁：放在篇章列表下面（對整本小說留言）
    var novelId, mount, introList = document.querySelector('.chapters.nv-list');
    if (sec && sec.dataset.novel) { novelId = sec.dataset.novel; mount = sec; }
    else if (window.NOVEL && introList) { novelId = window.NOVEL; }
    else return;
    var path = location.pathname;
    var box = el('section', 'cm'); box.id = 'comments';
    var h = el('h2', 'cm-h', '留言'); var hn = el('span', 'cm-n'); h.appendChild(hn);
    box.appendChild(h);
    var formWrap = el('div', 'cm-form-wrap');
    var list = el('div', 'cm-list'); list.appendChild(el('p', 'cm-empty', '載入留言中…'));
    box.appendChild(formWrap); box.appendChild(list);
    var cmtBtn = null;
    if (mount) mount.appendChild(box);
    else {
      // R02-R1：作品頁不再另外顯示整本留言區，改成點留言按鈕跳出視窗
      box.classList.add('cm-intro', 'cm-pop');
      var layer = el('div', 'cm-layer'); layer.hidden = true;
      var dlg = el('div', 'cm-dlg'); dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-label', '整本小說的留言');
      var x = el('button', 'cm-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '關閉留言');
      dlg.appendChild(x); dlg.appendChild(box); layer.appendChild(dlg); document.body.appendChild(layer);
      cmtBtn = document.querySelector('.nv-post .act.cmt');
      var lastFocus = null;
      var openCm = function () { lastFocus = document.activeElement; layer.hidden = false; document.body.classList.add('lock'); x.focus(); };
      var closeCm = function () { if (layer.hidden) return; layer.hidden = true; document.body.classList.remove('lock'); if (location.hash === '#comments') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} } if (lastFocus && lastFocus.focus) lastFocus.focus(); };
      if (cmtBtn) cmtBtn.onclick = openCm;
      x.onclick = closeCm;
      layer.addEventListener('click', function (e) { if (e.target === layer) closeCm(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !cardEl) closeCm(); });
      // 從「我的留言」點進來（網址帶 #comments）：直接打開
      if (location.hash === '#comments') openCm();
    }

    var me = null, admin = false, A = null;

    function paint(rows) {
      list.textContent = '';
      var shown = rows.filter(function (r) { return !r.hidden && !r.removed; }).length;
      hn.textContent = shown ? '（' + shown + '）' : '';
      if (cmtBtn) cmtBtn.querySelector('.n').textContent = shown ? String(shown) : '';
      setTalkCount(shown);
      if (!rows.length) { list.appendChild(el('p', 'cm-empty', '還沒有留言，來當第一個吧。')); return; }
      rows.forEach(function (r) {
        var p = r.profiles || {};
        var item = el('div', 'cm-item' + (r.hidden || r.removed ? ' is-hidden' : ''));
        var top = el('div', 'cm-top');
        // 點頭貼或名字：跳出會員小卡片（頭貼、名字、@帳號、簡介）
        var who = el('button', 'cm-who'); who.type = 'button';
        who.setAttribute('aria-label', '看 ' + (p.display_name || '新會員') + ' 的簡介');
        if (window.WBAvatar) who.appendChild(window.WBAvatar.make({ name: p.display_name || '新會員', color: p.avatar_color, id: r.user_id, author: r.as_author }, 'cm-av'));
        who.appendChild(el('b', 'cm-name', p.display_name || '新會員'));
        who.onclick = function (ev) { ev.stopPropagation(); showCard(who, p, r); };
        top.appendChild(who);
        if (r.as_author) top.appendChild(el('span', 'cm-author', '作者'));
        if (p.username) top.appendChild(el('span', 'cm-user', '@' + p.username));
        var side = el('div', 'cm-side'); side.appendChild(el('time', 'cm-time', fmtDate(r.created_at)));
        item.appendChild(top);
        if (r.removed) item.appendChild(el('p', 'cm-note', '已被管理員刪除，只有管理員看得到。'));
        else if (r.hidden) item.appendChild(el('p', 'cm-note', '這則留言因為被檢舉，目前只有作者和管理員看得到。'));
        item.appendChild(el('p', 'cm-body', r.body));
        if (me) {
          var acts = el('div', 'cm-acts');
          if (r.user_id === me || (admin && !r.removed)) {
            var own = r.user_id === me;
            var del = el('button', 'cm-btn', own ? '刪除' : '刪除（管理員）'); del.type = 'button';
            del.onclick = async function () {
              if (!window.confirm(own ? '確定要刪除這則留言嗎？' : '確定要刪除嗎？讀者會看不到，但後台「已隱藏」還找得到。')) return;
              del.disabled = true;
              // 自己的留言：真的刪除；管理員刪別人的：移除（後台保留）
              var res = own
                ? await A.getClient().from('comments').delete().eq('id', r.id)
                : await A.getClient().from('comments').update({ removed: true }).eq('id', r.id);
              if (res.error) { del.disabled = false; window.alert(cmError(res.error)); return; }
              load();
            };
            acts.appendChild(del);
          }
          if (admin && (r.hidden || r.removed)) {
            var un = el('button', 'cm-btn', '恢復顯示'); un.type = 'button';
            un.onclick = async function () {
              un.disabled = true;
              var res = await A.getClient().from('comments').update({ hidden: false, removed: false }).eq('id', r.id);
              if (res.error) { un.disabled = false; window.alert(cmError(res.error)); return; }
              load();
            };
            acts.appendChild(un);
          }
          if (r.user_id !== me) {
            var rep = el('button', 'cm-btn', '檢舉'); rep.type = 'button';
            rep.onclick = async function () {
              var why = window.prompt('檢舉原因（選填，最多 200 字）：', '');
              if (why === null) return;
              rep.disabled = true;
              var res = await A.getClient().from('comment_reports').insert({ comment_id: r.id, reason: why.trim().slice(0, 200) || null });
              if (res.error) { rep.disabled = false; window.alert(cmError(res.error)); return; }
              rep.textContent = '已檢舉';
            };
            acts.appendChild(rep);
          }
          side.appendChild(acts);
        }
        var main = el('div', 'cm-main'); while (item.firstChild) main.appendChild(item.firstChild); item.appendChild(main); item.appendChild(side);
        list.appendChild(item);
      });
    }

    async function load() {
      try {
        var rows;
        if (A) {
          var res = await A.getClient().from('comments').select(CM_COLS).eq('path', path).order('created_at', { ascending: true }).limit(300);
          if (res.error) throw res.error;
          rows = res.data || [];
        } else {
          rows = await fetchCommentsPublic(path);
        }
        paint(rows);
        // 自己在這頁留過言：看到了就算讀過新回應
        if (A && me && rows.some(function (r) { return r.user_id === me; })) {
          A.getClient().rpc('comment_mark_read', { p_path: path }).then(function () { return dmDot(A); }).catch(function () {});
        }
      } catch (e) {
        list.textContent = '';
        list.appendChild(el('p', 'cm-empty', '留言暫時載入不了，請稍後再試。'));
      }
    }

    function guestForm() {
      formWrap.textContent = '';
      var p = el('p', 'cm-login');
      p.appendChild(document.createTextNode('登入會員後就能留言。'));
      var a = el('a', null, '前往登入'); a.href = BASE + '/member/';
      p.appendChild(a);
      formWrap.appendChild(p);
    }

    function memberForm() {
      formWrap.textContent = '';
      var f = el('form', 'cm-form');
      var ta = el('textarea'); ta.maxLength = 100; ta.rows = 3; ta.placeholder = '留言會公開給所有人看，請友善發言。講髒話、罵人或騷擾，帳號會被封鎖。';
      var row = el('div', 'cm-row');
      var cnt = el('small', 'cm-cnt', '0 / 100');
      var b = el('button', 'cm-send', '送出'); b.type = 'submit';
      var msg = el('p', 'mb-form-msg err'); msg.hidden = true;
      ta.oninput = function () { cnt.textContent = ta.value.length + ' / 100'; };
      row.appendChild(cnt); row.appendChild(b);
      var warn = el('p', 'cm-warn', '⚠️ 講髒話、罵人或騷擾，留言會被刪除，帳號會被封鎖。');
      f.appendChild(warn); f.appendChild(ta); f.appendChild(row); f.appendChild(msg);
      f.onsubmit = async function (ev) {
        ev.preventDefault();
        var body = ta.value.trim();
        if (!body) { msg.textContent = '請先寫點什麼。'; msg.hidden = false; return; }
        b.disabled = true; msg.hidden = true;
        var res;
        try { res = await A.getClient().from('comments').insert({ novel: novelId, path: path, body: body }); }
        catch (e) { res = { error: { message: '連不上會員伺服器' } }; }
        b.disabled = false;
        if (res.error) { msg.textContent = cmError(res.error); msg.hidden = false; return; }
        ta.value = ''; cnt.textContent = '0 / 100';
        load();
      };
      formWrap.appendChild(f);
    }

    if (!signedIn()) { guestForm(); load(); return; }
    formWrap.appendChild(el('p', 'cm-empty', '…'));
    getAuth().then(async function (auth) {
      A = auth;
      me = await uidOf(A.getClient());
      try { admin = await A.isAdmin(); } catch (e) {}
      if (me) memberForm(); else { A = null; guestForm(); }
      load();
    }).catch(function () { guestForm(); load(); });
  }

  initComments();

  /* ---------- 會員頁：我的留言 ---------- */
  var myCmBox = document.querySelector('.mb-mycm');
  var myCmList = myCmBox && myCmBox.querySelector('.mycm-list');
  async function renderMyComments(A) {
    var c = A.getClient(), uid = await uidOf(c);
    if (!uid) return;
    var res = await c.from('comments').select('id,novel,path,body,hidden,created_at')
      .eq('user_id', uid).order('created_at', { ascending: false }).limit(100);
    myCmList.textContent = '';
    myCmBox.hidden = false;
    if (res.error) { myCmList.appendChild(el('p', 'mb-form-msg err', errText('讀取留言失敗，請重新整理。', res.error))); return; }
    var rows = res.data || [];
    if (!rows.length) { myCmList.appendChild(el('p', null, '還沒有留言。章節最下面和小說介紹頁都可以留言。')); return; }
    var byUrl = {};
    try {
      var pj = await (await fetch(BASE + '/assets/posts.json?v=' + (window.VER || ''))).json();
      Object.keys(pj).forEach(function (k) { byUrl[pj[k].u] = pj[k]; });
    } catch (e) {}
    // 先顯示 20 則，「再看 20 則」一次多 20 則
    var shownN = 0, more = el('button', 'mb-btn mycm-more'); more.type = 'button';
    function showMore(n) {
      rows.slice(shownN, shownN + n).forEach(addItem);
      shownN = Math.min(rows.length, shownN + n);
      var left = rows.length - shownN;
      more.hidden = left <= 0;
      more.textContent = '再看 ' + Math.min(20, left) + ' 則（還有 ' + left + ' 則）';
      myCmList.appendChild(more);
    }
    more.onclick = function () { showMore(20); };
    showMore(20);
    function addItem(r) {
      var nv = novels[r.novel] || {}, pp = byUrl[r.path];
      var item = el('div', 'fav-item mycm-item');
      var a = el('a', null, '《' + (nv.title || r.novel) + '》' +
        (pp ? (pp.ch ? '第 ' + pp.ch + ' 篇・' : '') + pp.t : (r.path.indexOf('/novel/') === 0 ? '介紹頁' : '')));
      a.href = r.path + '#comments';
      var meta = el('small', null, fmtDate(r.created_at) + (r.hidden ? '・因檢舉隱藏中' : ''));
      var head = el('div', 'mycm-head'); head.appendChild(a); head.appendChild(meta);
      item.appendChild(head);
      item.appendChild(el('p', 'mycm-body', r.body));
      myCmList.appendChild(item);
    }
  }

  /* ---------- 私訊角色（雲端） ----------
   * 讀者傳給角色的訊息存到 dm_messages；蔡在管理後台用角色身分回覆。
   * app.js 的收件匣透過 window.WBDM 讀寫；沒登入時 WBDM.on() 為 false，收件匣只顯示這台裝置的舊訊息。
   */
  var DM_COLS = 'id,chr,post,from_char,body,seen,created_at';
  function dmError(e) {
    var m = (e && e.message) || '';
    if (/WB_BANNED/.test(m)) return '你的帳號已被停權，不能傳私訊。';
    if (/WB_TOO_FAST/.test(m)) return '傳太快了，隔幾秒再傳。';
    if (/WB_TOO_MANY/.test(m)) return '一小時內傳太多則了，晚一點再傳。';
    if (/WB_LOGIN_REQUIRED/.test(m)) return '登入已過期，請重新登入。';
    if (e && e.code === '23514') return '訊息要 1～500 個字。';
    return errText('傳送失敗，請稍後再試。', e);
  }
  // 右下角私訊按鈕亮紅點：
  //   讀者：有角色的新回覆
  //   管理員（這次登入已通過兩步驟驗證）：有讀者傳來、還沒讀的私訊（不算自己傳的）
  //   一般讀者的第二個查詢因為 RLS 只看得到自己的，又排除自己，所以一定是 0。
  //   所有會員：自己留過言的頁面，之後有別人留言（comment_notices）
  async function dmDot(A) {
    var btn = document.querySelector('.chat-btn'); if (!btn) return;
    var c = A.getClient(), uid = await uidOf(c);
    if (!uid) { btn.classList.remove('has-new'); window.WBDM.adminUnseen = 0; window.WBDM.notices = []; return; }
    var r = await Promise.all([
      c.from('dm_messages').select('id', { count: 'exact', head: true })
        .eq('user_id', uid).eq('from_char', true).eq('seen', false),
      c.from('dm_messages').select('id', { count: 'exact', head: true })
        .neq('user_id', uid).eq('from_char', false).eq('seen', false),
      c.rpc('comment_notices')
    ]);
    window.WBDM.notices = (!r[2].error && r[2].data) || [];
    var mine = !r[0].error && r[0].count > 0;
    window.WBDM.adminUnseen = (!r[1].error && r[1].count) || 0;
    btn.classList.toggle('has-new', mine || window.WBDM.adminUnseen > 0 || window.WBDM.notices.length > 0);
  }
  window.WBDM = {
    on: signedIn,
    // 讀自己全部的私訊；登入過期回傳 null
    load: async function () {
      var A = await getAuth(), c = A.getClient(), uid = await uidOf(c);
      if (!uid) return null;
      var res = await c.from('dm_messages').select(DM_COLS).eq('user_id', uid)
        .order('created_at', { ascending: true }).limit(2000);
      if (res.error) throw res.error;
      return res.data || [];
    },
    // 傳給角色；成功回傳 null，失敗回傳錯誤訊息（中文）
    send: async function (chr, post, body) {
      try {
        var A = await getAuth();
        var res = await A.getClient().from('dm_messages').insert({ chr: chr, post: post || null, body: body });
        return res.error ? dmError(res.error) : null;
      } catch (e) { return dmError(e); }
    },
    // 看過這個角色的回覆
    adminUnseen: 0,
    notices: [],                // 自己留過言的頁面有新回應：[{path, novel, n, last_at}]             // 管理員：讀者還沒讀的私訊數（dmDot 更新）
    refresh: function () { return getAuth().then(dmDot).catch(function () {}); },
    // 刪掉自己跟這個角色的整段對話（含角色回覆）；成功回傳 null，失敗回傳錯誤訊息
    delThread: async function (chr) {
      try {
        var A = await getAuth(), r = await A.getClient().rpc('dm_delete_thread', { p_chr: chr });
        if (r.error) return errText('刪除失敗，請稍後再試。', r.error);
        await dmDot(A); return null;
      } catch (e) { return errText('刪除失敗，請稍後再試。', e); }
    },
    seen: async function (chr) {
      try { var A = await getAuth(); await A.getClient().rpc('dm_mark_seen', { p_chr: chr }); await dmDot(A); } catch (e) {}
    }
  };

  /* ---------- 啟動 ---------- */
  if (!signedIn()) { document.querySelectorAll('.mb-guest').forEach(function (g) { g.hidden = false; }); return; }

  getAuth().then(async function (A) {
    // 被封鎖的帳號：自動登出（小說照樣可以看）
    try {
      var bn = await A.getClient().rpc('is_banned');
      if (!bn.error && bn.data === true) {
        try { localStorage.removeItem('wb:me'); } catch (e) {}
        await A.signOut();
        window.alert('你的帳號已被停權，已自動登出。小說還是可以繼續看。');
        location.reload();
        return;
      }
    } catch (e) {}
    var last = 0;
    try { last = +sessionStorage.getItem(SYNC_KEY) || 0; } catch (e) {}
    if (sec || document.querySelector('.shelf-list') || Date.now() - last > SYNC_EVERY) {
      try { await sync(A); } catch (e) {}
    }
    dmDot(A).catch(function () {});
    buttons.forEach(function (x) {
      isFav(A, x[1].novel, x[1].path).then(function (v) { x[0].setOn(v); }).catch(function () {});
    });
    if (myCmList) { try { await renderMyComments(A); } catch (e) {} }
    if (favList) {
      try { await renderFavs(A); } catch (e) {}
      A.onChange(function (event) { if (event === 'SIGNED_OUT') favBox.hidden = true; });
    }
  }).catch(function () { /* 載入失敗：維持訪客畫面，不影響閱讀 */ });
})();
