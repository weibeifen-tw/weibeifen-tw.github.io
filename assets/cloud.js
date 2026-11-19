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
    var wrap = el('p', 'ch-fav-wrap'); wrap.appendChild(cb);
    var tip = sec.querySelector('.tip');
    if (tip) sec.insertBefore(wrap, tip); else sec.appendChild(wrap);
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
    rows.forEach(function (r) {
      var nv = novels[r.novel];
      if (!nv) return; // 小說已下架
      var item = el('div', 'fav-item');
      var a = el('a');
      if (r.path === '') {
        a.href = BASE + '/novel/' + r.novel + '/';
        a.textContent = '《' + nv.title + '》';
      } else {
        a.href = r.path;
        a.textContent = '《' + nv.title + '》' + (r.no ? '第 ' + r.no + ' 篇・' : '') + (r.title || '');
      }
      var kind = el('small', null, r.path === '' ? '整本' : '書籤');
      var del = el('button', 'fav-del', '移除'); del.type = 'button';
      del.onclick = async function () {
        del.disabled = true;
        var err = await setFav(A, false, { novel: r.novel, path: r.path });
        if (err) { del.disabled = false; window.alert(err); return; }
        item.remove();
        if (!favList.querySelector('.fav-item')) renderFavs(A);
      };
      item.appendChild(a); item.appendChild(kind); item.appendChild(del);
      favList.appendChild(item);
    });
  }

  /* ---------- 公開留言（章節頁最下面） ---------- */
  var AU = window.WB_AUTH_CONFIG || {};
  var CM_COLS = 'id,user_id,body,hidden,created_at,profiles(display_name,username)';

  function cmError(e) {
    var m = (e && e.message) || '';
    if (/WB_TOO_FAST/.test(m)) return '留言太快了，請等 15 秒再試。';
    if (/WB_TOO_MANY/.test(m)) return '一小時最多留 5 則，請晚點再來。';
    if (/WB_LOGIN_REQUIRED/.test(m)) return '請先登入會員。';
    if (e && e.code === '23514') return '留言要 1～500 個字。';
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

  function setTalkCount(n) {
    if (!sec) return;
    sec.querySelectorAll('.actions .talk .n').forEach(function (x) { x.textContent = n ? String(n) : ''; });
  }

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
    if (mount) mount.appendChild(box);
    else { box.classList.add('novel', 'cm-intro'); introList.parentNode.insertBefore(box, introList.nextSibling); }

    var me = null, admin = false, A = null;

    function paint(rows) {
      list.textContent = '';
      var shown = rows.filter(function (r) { return !r.hidden; }).length;
      hn.textContent = shown ? '（' + shown + '）' : '';
      setTalkCount(shown);
      if (!rows.length) { list.appendChild(el('p', 'cm-empty', '還沒有留言，來當第一個吧。')); return; }
      rows.forEach(function (r) {
        var p = r.profiles || {};
        var item = el('div', 'cm-item' + (r.hidden ? ' is-hidden' : ''));
        var top = el('div', 'cm-top');
        top.appendChild(el('b', 'cm-name', p.display_name || '新會員'));
        if (p.username) top.appendChild(el('span', 'cm-user', '@' + p.username));
        top.appendChild(el('time', 'cm-time', fmtDate(r.created_at)));
        item.appendChild(top);
        if (r.hidden) item.appendChild(el('p', 'cm-note', '這則留言因為被檢舉，目前只有作者和管理員看得到。'));
        item.appendChild(el('p', 'cm-body', r.body));
        if (me) {
          var acts = el('div', 'cm-acts');
          if (r.user_id === me || admin) {
            var del = el('button', 'cm-btn', r.user_id === me ? '刪除' : '刪除（管理員）'); del.type = 'button';
            del.onclick = async function () {
              if (!window.confirm('確定要刪除這則留言嗎？')) return;
              del.disabled = true;
              var res = await A.getClient().from('comments').delete().eq('id', r.id);
              if (res.error) { del.disabled = false; window.alert(cmError(res.error)); return; }
              load();
            };
            acts.appendChild(del);
          }
          if (admin && r.hidden) {
            var un = el('button', 'cm-btn', '恢復顯示'); un.type = 'button';
            un.onclick = async function () {
              un.disabled = true;
              var res = await A.getClient().from('comments').update({ hidden: false }).eq('id', r.id);
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
          item.appendChild(acts);
        }
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
      var ta = el('textarea'); ta.maxLength = 500; ta.rows = 3; ta.placeholder = '留言會公開給所有人看，請友善發言。';
      var row = el('div', 'cm-row');
      var cnt = el('small', 'cm-cnt', '0 / 500');
      var b = el('button', 'cm-send', '送出'); b.type = 'submit';
      var msg = el('p', 'mb-form-msg err'); msg.hidden = true;
      ta.oninput = function () { cnt.textContent = ta.value.length + ' / 500'; };
      row.appendChild(cnt); row.appendChild(b);
      f.appendChild(ta); f.appendChild(row); f.appendChild(msg);
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
        ta.value = ''; cnt.textContent = '0 / 500';
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

  /* ---------- 啟動 ---------- */
  if (!signedIn()) { if (favBox) favBox.hidden = true; return; }

  getAuth().then(async function (A) {
    var last = 0;
    try { last = +sessionStorage.getItem(SYNC_KEY) || 0; } catch (e) {}
    if (sec || document.querySelector('.shelf-list') || Date.now() - last > SYNC_EVERY) {
      try { await sync(A); } catch (e) {}
    }
    buttons.forEach(function (x) {
      isFav(A, x[1].novel, x[1].path).then(function (v) { x[0].setOn(v); }).catch(function () {});
    });
    if (favList) {
      try { await renderFavs(A); } catch (e) {}
      A.onChange(function (event) { if (event === 'SIGNED_OUT') favBox.hidden = true; });
    }
  }).catch(function () { /* 載入失敗：維持訪客畫面，不影響閱讀 */ });
})();
