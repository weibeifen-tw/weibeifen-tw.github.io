/*
 * 未備份｜收藏與雲端書櫃
 *
 * 只有這台瀏覽器「有登入資料」時，才載入 Supabase SDK 與 auth.js；
 * 沒登入的讀者不連會員伺服器、不多載任何檔案，閱讀速度不受影響。
 *
 * 1. 雲端書櫃：僅已驗證會員的 wb:v2:member:<uid>:last:* 可同步到 reading_progress。
 *    舊 wb:last:* 紀錄保持隔離，捲動位置及已讀標記也由 WBReadingStore 依身分管理。
 * 2. 收藏：小說介紹頁可收藏整本，章節頁可加書籤；會員頁列出「我的收藏」。
 * 3. 公開留言：章節頁最下面、小說介紹頁篇章列表下面（整本小說的留言）。訪客也看得到（直接用可公開金鑰讀，不載入 SDK），會員才能留言。
 * 4. （V1.0 S09 私訊已全面退役，前端不再讀寫私訊）原：私訊角色存到雲端（收件匣在 app.js，透過 window.WBDM）。
 *
 * 權限由 Supabase RLS 在伺服器端把關：每個人只能讀寫自己的資料。
 * 所有資料一律用 textContent 寫入，不使用 innerHTML。
 */
(function () {
  'use strict';

  var SESSION_KEY = 'sb-tqicconarhpddejxdvmf-auth-token';
  // T03-R01/R03: sync timestamps are scoped to a verified member, never global.
  var Store = window.WBReadingStore;
  // T03 safe rollback: change to false ONLY in a separately reviewed emergency build.
  // This is a build-time switch, not a runtime setting or a live remote control.
  var READING_SYNC_ENABLED = true;
  var SYNC_EVERY = 10 * 60 * 1000;        // 一般頁面最多 10 分鐘同步一次；章節頁、會員頁每次都同步
  var KEY_RE = /^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$/;
  var L = window.WB_AUTH_LAZY || {};
  var BASE = window.BASE || '';
  var novels = {};
  var CHARS = {}; try { CHARS = JSON.parse(document.getElementById('chars').textContent || '{}'); } catch (e) {}
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
    var out = {}, scoped = Store.listLast();
    Object.keys(scoped).forEach(function (id) {
      var r = scoped[id];
      if (KEY_RE.test(id) && r && typeof r.url === 'string' &&
          r.url.charAt(0) === '/' && r.url.charAt(1) !== '/') out[id] = r;
    });
    return out;
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
    if (!READING_SYNC_ENABLED) return { ok: false, reason: 'paused' };
    var identity = Store.identity();
    if (identity.state !== 'member' || !identity.uid) return { ok: false, reason: 'unverified' };
    var uid = identity.uid, version = identity.version, c = A.getClient();
    function current() {
      var n = Store.identity();
      return READING_SYNC_ENABLED && n.state === 'member' && n.uid === uid && n.version === version;
    }
    if (!current()) return { ok: false, reason: 'changed' };
    var res = await c.from('reading_progress').select('k,url,no,title,chr,t').eq('user_id', uid);
    if (!current()) return { ok: false, reason: 'changed' };
    if (res.error) return { ok: false, reason: 'read-failed', error: res.error };
    var cloud = {};
    (res.data || []).forEach(function (r) {
      if (KEY_RE.test(r.k)) cloud[r.k] = { url: r.url, no: r.no, title: r.title, char: r.chr, t: +r.t || 0 };
    });
    // Project legacy cloud records without changing stored rows; never overwrite a colliding destination.
    if (window.wbRemap) Object.keys(cloud).forEach(function (k) {
      var n = window.wbRemap(k, cloud[k]);
      if (n[1] === cloud[k]) return;
      if (n[0] === k) cloud[k] = n[1];
      else if (!cloud[n[0]]) { cloud[n[0]] = n[1]; delete cloud[k]; }
      // When destination already exists, both originals stay intact for later review.
    });
    var local = localRecords(), up = [], changed = false, localWriteFailed = false;
    Object.keys(cloud).forEach(function (k) {
      if (!current()) return;
      if (further(cloud[k], local[k])) {
        if (Store.write('last', k, JSON.stringify(cloud[k]))) changed = true;
        else localWriteFailed = true;
      }
    });
    if (!current()) return { ok: false, reason: 'changed' };
    if (localWriteFailed) return { ok: false, reason: 'local-write-failed' };
    // A failed browser write must not mark the overall sync as successful.
    var refreshed = localRecords();
    Object.keys(refreshed).forEach(function (k) {
      var r = refreshed[k];
      if (!further(r, cloud[k])) return;
      up.push({
        user_id: uid, k: k, url: r.url.slice(0, 300),
        no: cut(r.no, 10), title: cut(r.title, 100), chr: cut(r.char, 40),
        t: Math.round(+r.t || 0)
      });
    });
    if (up.length) {
      // Validate the live user again before sending the write.
      var verified = await A.getVerifiedUser();
      if (!current() || !verified.user || verified.user.id !== uid)
        return { ok: false, reason: 'changed-or-unverified' };
      var upResult = await c.from('reading_progress').upsert(up, { onConflict: 'user_id,k' });
      if (!current()) return { ok: false, reason: 'changed' };
      if (upResult.error) return { ok: false, reason: 'write-failed', error: upResult.error };
    }
    if (!current()) return { ok: false, reason: 'changed' };
    var successKey = Store.syncKey();
    if (successKey) try { sessionStorage.setItem(successKey, String(Date.now())); } catch (e) {}
    if (changed && window.WBRenderShelf) window.WBRenderShelf();
    return { ok: true };
  }

  /* ---------- 收藏 ---------- */
  async function isFav(A, novel, path) {
    // 章節書籤用網址判斷（2026-11-23 拆書後，舊書籤的 novel 可能還是原作品）；整本收藏（path 空白）照舊用 novel
    var q = A.getClient().from('favorites').select('path');
    var res = path ? await q.eq('path', path).limit(1) : await q.eq('novel', novel).eq('path', path).maybeSingle();
    return !res.error && (path ? !!(res.data && res.data.length) : !!res.data);
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
      res = row.path ? await c.from('favorites').delete().eq('path', row.path)
        : await c.from('favorites').delete().eq('novel', row.novel).eq('path', '');
    }
    return res.error ? errText('收藏沒有成功，請稍後再試。', res.error) : null;
  }

  function askLogin() {
    if (window.confirm('收藏需要登入會員，要前往登入嗎？')) location.href = BASE + '/member/';
  }

  // （R02-R1 起不再使用，保留備查）建一顆收藏按鈕；labels = [未收藏, 已收藏]
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

  // V1.0 R02-R1：愛心＝收藏。作品頁貼文的愛心收藏整本，章節頁的愛心加書籤。
  // 沿用 favorites 原本的資料（整本 path=''，章節 path=網址），再按一次取消。空心＝未收藏，紅心＝已收藏。
  function favHeart(b, labels, row) {
    if (!b) return;
    var nEl = b.querySelector('.n'), base = parseInt(nEl && nEl.textContent, 10) || 0, on = false;
    function no4(n) { while (String(n).indexOf('4') >= 0) n++; return n; }
    function paint() {
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', labels[on ? 1 : 0]);
      if (nEl && base) nEl.textContent = String(on ? no4(base + 1) : base);
    }
    b.onclick = async function () {
      if (!signedIn()) { askLogin(); return; }
      b.disabled = true;
      var err = null;
      try { var A = await getAuth(); err = await setFav(A, !on, row); }
      catch (e) { err = '連不上會員伺服器，請稍後再試。'; }
      b.disabled = false;
      if (err) { window.alert(err); return; }
      on = !on; paint();
      b.classList.add('pop'); setTimeout(function () { b.classList.remove('pop'); }, 300);
    };
    b.setOn = function (v) { on = !!v; paint(); };
    paint();
    buttons.push([b, row]);
  }

  // 小說介紹頁：作品貼文的愛心＝收藏整本
  if (window.NOVEL) {
    favHeart(document.querySelector('.nv-post .act.like'), ['收藏這本', '已收藏，再按一次取消'],
      { novel: window.NOVEL, path: '', title: (novels[window.NOVEL] || {}).title || '' });
  }

  // 章節頁：章節下方的愛心＝加書籤
  var sec = document.querySelector('.chapter.read');
  if (sec && sec.dataset.novel) {
    favHeart(sec.querySelector('.r-acts .act.like'), ['加入書籤', '已加入書籤，再按一次取消'],
      { novel: sec.dataset.novel, path: location.pathname, title: sec.dataset.title || '', no: sec.dataset.no || '' });
  }

  /* ---------- 會員頁：我的收藏 ---------- */
  var favBox = document.querySelector('.mb-favs');
  var favList = favBox && favBox.querySelector('.fav-list');

  // P3-01-C：只控制收藏／留言連結；不修改、遷移或刪除歷史會員資料。
  function validNovelPath(path) {
    if (typeof path !== 'string') return null;
    try {
      var url = new URL(path, location.origin);
      if (url.origin !== location.origin) return null;
      var m = url.pathname.match(/^\/novel\/([a-z0-9_-]+)\/$/);
      return m && Object.prototype.hasOwnProperty.call(novels, m[1]) ? url.pathname : null;
    } catch (e) { return null; }
  }
  function guardedChapter(index, path) {
    if (!index || !window.WBChapterGuard) return { status: 'unavailable' };
    return window.WBChapterGuard.resolve(index, path);
  }
  var favRenderSequence = 0;
  async function renderFavs(A) {
    if (!favList) return;
    var seq = ++favRenderSequence;
    var res = await A.getClient().from('favorites').select('novel,path,title,no,created_at').order('created_at', { ascending: false });
    if (seq !== favRenderSequence) return;
    favList.textContent = '';
    favBox.hidden = false;
    if (res.error) { favList.appendChild(el('p', 'mb-form-msg err', errText('讀取收藏失敗，請重新整理。', res.error))); return; }
    var rows = res.data || [];
    if (!rows.length) { favList.appendChild(el('p', null, '還沒有收藏。在小說介紹頁按「收藏這本」，或在章節最後按「加入書籤」。')); return; }

    var attempt = 0;
    function paint(index, failed) {
      if (seq !== favRenderSequence) return;
      favList.textContent = '';
      function item(r, label, result, isWhole) {
        var it = el('div', 'fav-item'), a, note = '';
        var path = isWhole && Object.prototype.hasOwnProperty.call(novels, r.novel) ? validNovelPath(BASE + '/novel/' + r.novel + '/') : null;
        if (!isWhole && result && result.status === 'published') path = result.url;
        if (path) {
          a = el('a', null, label);
          a.href = path;
        } else {
          a = el('span', null, label);
          note = isWhole ? '（作品目前無法確認）' :
            failed ? '（暫時無法確認章節狀態，收藏仍保留）' :
            result && result.status === 'withdrawn' ? '（章節已撤回，收藏仍保留）' :
            '（原章節無法使用，收藏仍保留）';
        }
        it.appendChild(a);
        if (note) it.appendChild(el('small', null, note));
        var del = el('button', 'fav-del', '移除'); del.type = 'button';
        del.onclick = async function () {
          del.disabled = true;
          var err = await setFav(A, false, { novel: r.novel, path: r.path });
          if (err) { del.disabled = false; window.alert(err); return; }
          renderFavs(A);
        };
        it.appendChild(del);
        return it;
      }
      var whole = rows.filter(function (r) { return r.path === ''; });
      if (whole.length) {
        favList.appendChild(el('h3', 'fav-h', '收藏的小說'));
        whole.forEach(function (r) {
          var title = novels[r.novel] ? novels[r.novel].title : r.novel;
          favList.appendChild(item(r, '《' + title + '》', null, true));
        });
      }
      var marks = rows.filter(function (r) { return r.path !== ''; }), groups = Object.create(null), order = [];
      marks.forEach(function (r) {
        var result = guardedChapter(index, r.path);
        // 舊作品 ID 保留在資料庫；公開章節可依索引顯示目前正確的歸屬。
        var nid = result.status === 'published' && novels[result.chapter.novel] ? result.chapter.novel : r.novel;
        if (!Object.prototype.hasOwnProperty.call(groups, nid)) { groups[nid] = []; order.push(nid); }
        groups[nid].push({ row: r, result: result });
      });
      if (order.length) {
        favList.appendChild(el('h3', 'fav-h', '書籤'));
        order.forEach(function (nid) {
          var d = el('details', 'fav-group');
          var title = novels[nid] ? novels[nid].title : nid;
          var sm = el('summary', null, '《' + title + '》');
          sm.appendChild(el('small', null, groups[nid].length + ' 個書籤'));
          d.appendChild(sm);
          groups[nid].sort(function (x, y) { return (parseFloat(x.row.no) || 0) - (parseFloat(y.row.no) || 0); });
          groups[nid].forEach(function (entry) {
            var r = entry.row, st = entry.result;
            var no = st.status === 'published' ? st.chapter.chapter : r.no;
            d.appendChild(item(r, (no ? '第 ' + no + ' 篇・' : '') + (r.title || ''), st, false));
          });
          favList.appendChild(d);
        });
      }
      if (failed && marks.length) {
        var info = el('p', 'mb-form-msg', '暫時無法確認章節書籤，請重新確認。');
        var retry = el('button', 'mb-btn', '重新確認'); retry.type = 'button';
        retry.onclick = function () { check(true); };
        favList.appendChild(info); favList.appendChild(retry);
      }
    }
    function check(force) {
      var turn = ++attempt;
      // 全部只有整本小說收藏時，不需要讀取章節索引。
      if (!rows.some(function (r) { return r.path !== ''; })) { paint(null, false); return; }
      favList.textContent = '';
      favList.appendChild(el('p', 'mb-form-msg', '正在確認收藏連結…'));
      var guard = window.WBChapterGuard;
      if (!guard) { paint(null, true); return; }
      guard.load(!!force).then(function (index) {
        if (seq !== favRenderSequence || turn !== attempt) return;
        paint(index, false);
      }).catch(function () {
        if (seq !== favRenderSequence || turn !== attempt) return;
        paint(null, true);
      });
    }
    check(false);
  }

  /* ---------- 公開留言（章節頁最下面） ---------- */
  var AU = window.WB_AUTH_CONFIG || {};
  var CM_COLS = 'id,user_id,body,hidden,removed,as_author,as_char,created_at,profiles(display_name,username,avatar_color,bio)';

  function cmError(e) {
    var m = (e && e.message) || '';
    if (/WB_BANNED/.test(m)) return '你的帳號已被停權，不能留言。';
    if (/WB_TOO_LONG/.test(m)) return '留言最多 100 個字。';
    if (/WB_TOO_FAST/.test(m)) return '留言太快了，請等 15 秒再試。';
    if (/WB_TOO_MANY/.test(m)) return '一小時最多留 5 則，請晚點再來。';
    if (/WB_LOGIN_REQUIRED/.test(m)) return '請先登入會員。';
    if (/WB_NOT_ADMIN/.test(m)) return '只有管理員（通過兩步驟驗證）能用角色身分留言。';
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
    var cmtBtn = null, sheetMode = false, sheetN = null;
    if (mount) {
      mount.appendChild(box);
      // V1.1：手機（≤767px）章節頁不展開大留言區，按留言按鈕從底部滑出視窗；桌機維持原本章末留言區
      cmtBtn = mount.querySelector('.r-acts .act.cmt');
      if (cmtBtn && window.matchMedia) setupSheet();
    }
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

    function setupSheet() {
      var mq = window.matchMedia('(max-width:767px)');
      var U = (window.CSS && CSS.supports && CSS.supports('height', '1dvh')) ? 'dvh' : 'vh';
      var veil = el('div', 'cm-sheet-layer'); veil.hidden = true;
      var sh = el('div', 'cm-sheet'); sh.hidden = true;
      sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', '這一章的留言');
      var top = el('div', 'cm-sh-top');
      var grip = el('span', 'cm-grip'); grip.setAttribute('aria-hidden', 'true');
      var tt = el('h2', 'cm-sh-t', '留言'); sheetN = el('span', 'cm-n'); tt.appendChild(sheetN);
      var x2 = el('button', 'cm-x', '✕'); x2.type = 'button'; x2.setAttribute('aria-label', '關閉留言');
      top.appendChild(grip); top.appendChild(tt); top.appendChild(x2); sh.appendChild(top);
      document.body.appendChild(veil); document.body.appendChild(sh);
      var isOpen = false, savedY = 0, lastFocus = null, H = 65, drag = null;
      function setH(v) { H = v; sh.style.setProperty('--sh', v + U); }
      function fit() {
        var v = window.visualViewport, vh = v ? v.height : window.innerHeight;
        var kb = v ? Math.max(0, window.innerHeight - v.height - v.offsetTop) : 0;
        sh.style.setProperty('--vvh', vh + 'px'); sh.style.setProperty('--kb', kb + 'px');
      }
      function open() {
        if (isOpen || !sheetMode) return;
        isOpen = true; lastFocus = document.activeElement; savedY = window.scrollY || window.pageYOffset || 0;
        // 鎖住背景但記住閱讀位置（iOS 只用 overflow:hidden 鎖不住）
        document.body.style.top = (-savedY) + 'px'; document.body.classList.add('sheet-lock');
        setH(65); fit(); veil.hidden = false; sh.hidden = false;
        requestAnimationFrame(function () { veil.classList.add('on'); sh.classList.add('on'); });
        // Q03：不主動聚焦輸入欄，點了輸入欄才開鍵盤
        try { x2.focus({ preventScroll: true }); } catch (e) { x2.focus(); }
      }
      function close() {
        if (!isOpen) return;
        isOpen = false;
        var ta = sh.querySelector('textarea'); if (ta) ta.blur();
        veil.classList.remove('on'); sh.classList.remove('on');
        setTimeout(function () { if (!isOpen) { veil.hidden = true; sh.hidden = true; } }, 230);
        document.body.classList.remove('sheet-lock'); document.body.style.top = '';
        var de = document.documentElement, sb = de.style.scrollBehavior;
        de.style.scrollBehavior = 'auto'; window.scrollTo(0, savedY); de.style.scrollBehavior = sb;
        if (location.hash === '#comments') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
        if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
      }
      function place() {
        sheetMode = mq.matches;
        if (sheetMode) { if (box.parentNode !== sh) sh.appendChild(box); }
        else { close(); if (box.parentNode !== mount) mount.appendChild(box); }
      }
      // 拖拉上方把手：往上拉到 90%，往下拉關閉或回到 65%
      top.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.cm-x')) return;
        drag = { y: e.clientY, h: sh.getBoundingClientRect().height };
        sh.classList.add('drag'); try { top.setPointerCapture(e.pointerId); } catch (er) {}
      });
      top.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var vh = window.innerHeight, nh = Math.max(vh * 0.15, Math.min(vh * 0.9, drag.h + (drag.y - e.clientY)));
        sh.style.setProperty('--sh', nh + 'px');
      });
      function end(e) {
        if (!drag) return;
        var dy = e.clientY - drag.y, vh = window.innerHeight, nh = sh.getBoundingClientRect().height;
        drag = null; sh.classList.remove('drag');
        if (Math.abs(dy) < 6) { setH(H); return; }
        if (nh < vh * 0.45) { close(); return; }
        setH(nh > vh * 0.775 ? 90 : 65);
      }
      top.addEventListener('pointerup', end); top.addEventListener('pointercancel', end);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function () { if (isOpen) fit(); });
        window.visualViewport.addEventListener('scroll', function () { if (isOpen) fit(); });
      }
      x2.onclick = close;
      veil.onclick = close;
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen && !cardEl) close(); });
      cmtBtn.onclick = function () { if (sheetMode) open(); else box.scrollIntoView({ behavior: 'smooth' }); };
      if (mq.addEventListener) mq.addEventListener('change', place); else if (mq.addListener) mq.addListener(place);
      place();
      document.body.classList.add('cm-ready');
      if (location.hash === '#comments' && sheetMode) open();
    }

    // V1.1 Q04：送出成功後，視窗保持開啟並捲到自己剛留的那則
    function scrollToMine() {
      var mine = list.querySelectorAll('.cm-item.mine');
      var last = mine[mine.length - 1];
      if (!last) return;
      list.scrollTop += last.getBoundingClientRect().top - list.getBoundingClientRect().top - 8;
      last.classList.add('mine-new');
    }

    var me = null, admin = false, A = null;

    function paint(rows) {
      list.textContent = '';
      var shown = rows.filter(function (r) { return !r.hidden && !r.removed; }).length;
      hn.textContent = shown ? '（' + shown + '）' : '';
      if (cmtBtn) cmtBtn.querySelector('.n').textContent = shown ? String(shown) : '';
      if (sheetN) sheetN.textContent = hn.textContent;
      setTalkCount(shown);
      if (!rows.length) { list.appendChild(el('p', 'cm-empty', '還沒有留言，來當第一個吧。')); return; }
      rows.forEach(function (r) {
        var p = r.profiles || {};
        var item = el('div', 'cm-item' + (r.hidden || r.removed ? ' is-hidden' : ''));
        if (me && r.user_id === me) item.classList.add('mine');
        var top = el('div', 'cm-top');
        // 點頭貼或名字：跳出會員小卡片（頭貼、名字、@帳號、簡介）
        var rc = r.as_char && CHARS[r.as_char];
        if (rc) {
          // 管理員用角色身分回覆：顯示角色的頭貼、名字、@帳號，點了到作品頁的角色介紹
          var ca = el('a', 'cm-who cm-as-char'); ca.href = BASE + '/novel/' + rc.novel + '/?c=' + r.as_char;
          var cav = el('span', 'avatar cm-av'); cav.style.setProperty('--c', rc.color || '#999');
          if (rc.avatar) { var ci = new Image(); ci.src = BASE + '/assets/avatars/' + rc.avatar; ci.alt = ''; cav.appendChild(ci); } else cav.textContent = rc.glyph || rc.name.charAt(0);
          ca.appendChild(cav); ca.appendChild(el('b', 'cm-name', rc.name));
          top.appendChild(ca);
          if (rc.handle) top.appendChild(el('span', 'cm-user', '@' + rc.handle));
        } else {
        var who = el('button', 'cm-who'); who.type = 'button';
        who.setAttribute('aria-label', '看 ' + (p.display_name || '新會員') + ' 的簡介');
        if (window.WBAvatar) who.appendChild(window.WBAvatar.make({ name: p.display_name || '新會員', color: p.avatar_color, id: r.user_id, author: r.as_author }, 'cm-av'));
        who.appendChild(el('b', 'cm-name', p.display_name || '新會員'));
        who.onclick = function (ev) { ev.stopPropagation(); showCard(who, p, r); };
        top.appendChild(who);
        if (r.as_author) top.appendChild(el('span', 'cm-author', '作者'));
        if (p.username) top.appendChild(el('span', 'cm-user', '@' + p.username));
        }
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
      var asSel = null;
      if (admin) {
        // 管理員：選擇用畝 MU 或這部小說的角色身分回覆
        var cs = Object.keys(CHARS).filter(function (k) { return CHARS[k].novel === novelId || (CHARS[k].also || []).indexOf(novelId) >= 0; });
        if (cs.length) {
          asSel = el('select', 'cm-as'); asSel.setAttribute('aria-label', '用誰的身分留言');
          var o0 = el('option', null, '畝 MU（作者）'); o0.value = ''; asSel.appendChild(o0);
          cs.forEach(function (k) { var o = el('option', null, CHARS[k].name + '（角色）'); o.value = k; asSel.appendChild(o); });
          var lab = el('label', 'cm-as-row'); lab.appendChild(el('span', null, '回覆身分')); lab.appendChild(asSel);
          f.appendChild(lab);
        }
      }
      f.appendChild(warn); f.appendChild(ta); f.appendChild(row); f.appendChild(msg);
      f.onsubmit = async function (ev) {
        ev.preventDefault();
        if (b.disabled) return; // 防止連點重複送出
        var body = ta.value.trim();
        if (!body) { msg.textContent = '請先寫點什麼。'; msg.hidden = false; return; }
        b.disabled = true; msg.hidden = true;
        var res;
        var rowIn = { novel: novelId, path: path, body: body };
        if (asSel && asSel.value) rowIn.as_char = asSel.value;
        try { res = await A.getClient().from('comments').insert(rowIn); }
        catch (e) { res = { error: { message: '連不上會員伺服器' } }; }
        b.disabled = false;
        if (res.error) { msg.textContent = cmError(res.error); msg.hidden = false; return; }
        ta.value = ''; cnt.textContent = '0 / 100';
        load().then(function () { if (sheetMode) scrollToMine(); });
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
  var myCmRenderSequence = 0;
  async function renderMyComments(A) {
    if (!myCmList) return;
    var seq = ++myCmRenderSequence;
    var c = A.getClient(), uid = await uidOf(c);
    if (!uid || seq !== myCmRenderSequence) return;
    var res = await c.from('comments').select('id,novel,path,body,hidden,created_at')
      .eq('user_id', uid).order('created_at', { ascending: false }).limit(100);
    if (seq !== myCmRenderSequence) return;
    myCmList.textContent = '';
    myCmBox.hidden = false;
    if (res.error) { myCmList.appendChild(el('p', 'mb-form-msg err', errText('讀取留言失敗，請重新整理。', res.error))); return; }
    var rows = res.data || [];
    if (!rows.length) { myCmList.appendChild(el('p', null, '還沒有留言。章節最下面和小說介紹頁都可以留言。')); return; }
    var byUrl = {};
    try {
      var response = await fetch(BASE + '/assets/posts.json?v=' + (window.VER || ''));
      if (response.ok) {
        var pj = await response.json();
        Object.keys(pj).forEach(function (k) { byUrl[pj[k].u] = pj[k]; });
      }
    } catch (e) {}
    if (seq !== myCmRenderSequence) return;
    var attempt = 0;
    function paint(index, failed) {
      if (seq !== myCmRenderSequence) return;
      myCmList.textContent = '';
      var shownN = 0, more = el('button', 'mb-btn mycm-more'); more.type = 'button';
      function addItem(r) {
        var path = typeof r.path === 'string' ? r.path : '';
        var pp = byUrl[path];
        var st = path.indexOf('/novel/') === 0 ? null : guardedChapter(index, path);
        var safePath = path.indexOf('/novel/') === 0 ? validNovelPath(path) :
          st && st.status === 'published' ? st.url : null;
        var actualNovel = st && st.status === 'published' ? st.chapter.novel : r.novel;
        var nv = novels[actualNovel] || novels[r.novel] || {};
        var title = '《' + (nv.title || r.novel || '未知作品') + '》' +
          (pp ? (pp.ch ? '第 ' + pp.ch + ' 篇・' : '') + pp.t : (safePath && path.indexOf('/novel/') === 0 ? '介紹頁' : ''));
        var item = el('div', 'fav-item mycm-item');
        var a = el(safePath ? 'a' : 'span', null, title);
        if (safePath) a.href = safePath + '#comments';
        else {
          var reason = st && st.status === 'withdrawn' ? '（原章節已撤回，留言紀錄保留）' :
            failed && path.indexOf('/novel/') !== 0 ? '（暫時無法確認章節，留言紀錄保留）' :
            '（原頁面無法使用，留言紀錄保留）';
          a.appendChild(el('small', null, reason));
        }
        var meta = el('small', null, fmtDate(r.created_at) + (r.hidden ? '・因檢舉隱藏中' : ''));
        var head = el('div', 'mycm-head'); head.appendChild(a); head.appendChild(meta);
        item.appendChild(head);
        item.appendChild(el('p', 'mycm-body', r.body));
        myCmList.appendChild(item);
      }
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
      if (failed && rows.some(function (r) { return typeof r.path === 'string' && r.path.indexOf('/novel/') !== 0; })) {
        myCmList.appendChild(el('p', 'mb-form-msg', '暫時無法確認章節留言的位置，請重新確認。'));
        var retry = el('button', 'mb-btn', '重新確認'); retry.type = 'button';
        retry.onclick = function () { check(true); };
        myCmList.appendChild(retry);
      }
    }
    function check(force) {
      var turn = ++attempt;
      if (!rows.some(function (r) { return typeof r.path !== 'string' || r.path.indexOf('/novel/') !== 0; })) { paint(null, false); return; }
      myCmList.textContent = '';
      myCmList.appendChild(el('p', 'mb-form-msg', '正在確認留言所在頁面…'));
      var guard = window.WBChapterGuard;
      if (!guard) { paint(null, true); return; }
      guard.load(!!force).then(function (index) {
        if (seq !== myCmRenderSequence || turn !== attempt) return;
        paint(index, false);
      }).catch(function () {
        if (seq !== myCmRenderSequence || turn !== attempt) return;
        paint(null, true);
      });
    }
    check(false);
  }

  /* ---------- 通知（V1.0 S09：私訊全面退役 DM-A） ----------
   * 前端不再讀寫 dm_messages、不呼叫 dm_delete_thread／dm_mark_seen；舊私訊資料暫時保留在資料庫。
   * 後端封鎖（撤銷 INSERT、停用 RPC）要由站長在 SQL Editor 執行 supabase/drafts/ 的草案後才算完成。
   * 右下角紅點：只看 comment_notices（自己留過言的頁面之後有別人留言）。
   */
  async function dmDot(A) {
    var btn = document.querySelector('.chat-btn'); if (!btn) return;
    var c = A.getClient(), uid = await uidOf(c);
    if (!uid) { btn.classList.remove('has-new'); window.WBDM.notices = []; return; }
    var r = await c.rpc('comment_notices');
    window.WBDM.notices = (!r.error && r.data) || [];
    btn.classList.toggle('has-new', window.WBDM.notices.length > 0);
  }
  window.WBDM = {
    on: signedIn,
    notices: [],                // 自己留過言的頁面有新回應：[{path, novel, n, last_at}]
    refresh: function () { return getAuth().then(dmDot).catch(function () {}); }
  };

  /* ---------- 啟動 ---------- */
  if (!signedIn()) { document.querySelectorAll('.mb-guest').forEach(function (g) { g.hidden = false; }); return; }

  getAuth().then(async function (A) {
    // Register before any network round-trip. Authentication events may arrive
    // during is_banned/getUser/sync, so invalidate older verification results.
    var authGeneration = 0;
    A.onChange(function (event) {
      var generation = ++authGeneration;
      if (event === 'SIGNED_OUT') Store.setIdentity('guest');
      else if (event === 'SIGNED_IN') {
        Store.setIdentity('unknown');
        var expectedVersion = Store.identity().version;
        A.getVerifiedUser().then(function (v) {
          var now = Store.identity();
          if (generation !== authGeneration || now.version !== expectedVersion ||
              now.state !== 'unknown') return;
          if (v.user && v.user.id) Store.setIdentity('member', v.user.id);
        }).catch(function () {});
      }
    });
    var startingGeneration = authGeneration;
    // 被封鎖的帳號：自動登出（小說照樣可以看）
    try {
      var bn = await A.getClient().rpc('is_banned');
      if (!bn.error && bn.data === true && authGeneration === startingGeneration &&
          signedIn()) {
        try { localStorage.removeItem('wb:me'); } catch (e) {}
        await A.signOut();
        window.alert('你的帳號已被停權，已自動登出。小說還是可以繼續看。');
        location.reload();
        return;
      }
    } catch (e) {}
    // Do not promote a local refresh token to a verified reading identity.
    var identityCheck = await A.getVerifiedUser();
    // A newer sign-in/out invalidates this initial verification response.
    if (authGeneration !== startingGeneration) return;
    if (!identityCheck.user || !identityCheck.user.id) {
      Store.setIdentity(identityCheck.error ? 'unknown' : 'guest');
      return;
    }
    if (!Store.setIdentity('member', identityCheck.user.id)) return;
    var last = 0, successKey = Store.syncKey();
    try { if (successKey) last = +sessionStorage.getItem(successKey) || 0; } catch (e) {}
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
