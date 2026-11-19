/*
 * 未備份｜管理後台 /admin/
 * 畫面只是顯示；權限一律由 Supabase 在伺服器端判斷（is_admin()：admin＋已通過兩步驟驗證）。
 * 所有資料一律用 textContent 寫入，不使用 innerHTML。
 */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var A = window.WBAuth;
  var BASE = window.BASE || '';
  var status = document.querySelector('.ad-status');
  var tabs = document.querySelector('.ad-tabs');
  var panels = {};
  document.querySelectorAll('.ad-panel').forEach(function (p) { panels[p.dataset.panel] = p; });
  var novels = {};
  try { novels = JSON.parse(document.getElementById('novels').textContent || '{}'); } catch (e) {}
  var posts = {};
  try { posts = JSON.parse(document.getElementById('posts-map').textContent || '{}'); } catch (e) {}
  // 留言位置：《書名》第 N 篇・篇名，或《書名》介紹頁
  function whereText(r) {
    if (r.path.indexOf('/novel/') === 0) return '《' + title(r.novel) + '》介紹頁';
    var p = posts[r.path] || posts[decodeURI(r.path)];
    if (!p) return '《' + title(r.novel) + '》' + r.path;
    return '《' + title(r.novel) + '》' + (p.no ? '第 ' + p.no + ' 篇・' : '') + (p.t || '');
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function title(id) { return (novels[id] && novels[id].title) || id; }
  function fmtDate(iso) {
    var d = new Date(iso);
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function errMsg(e) {
    var m = (e && e.message) || '';
    if (/WB_NOT_ADMIN/.test(m)) return '沒有管理員權限，請先到會員頁輸入兩步驟驗證碼。';
    return '讀取失敗：' + ((e && e.code) || '') + ' ' + m.slice(0, 120);
  }
  function say(t) { status.textContent = t; }
  function c() { return A.getClient(); }

  /* ---------- 分頁 ---------- */
  var loaded = {};
  function show(name, force) {
    if (force) loaded[name] = false;
    tabs.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === name)); });
    Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== name; });
    if (!loaded[name]) { loaded[name] = true; LOADERS[name](); }
  }
  tabs.querySelectorAll('button').forEach(function (b) { b.onclick = function () { show(b.dataset.tab); }; });

  /* ---------- 統計 ---------- */
  async function loadStats() {
    var p = panels.stats;
    p.textContent = ''; p.appendChild(el('p', 'mb-sub', '讀取中…'));
    var res = await c().rpc('admin_stats');
    p.textContent = '';
    if (res.error) { p.appendChild(el('p', 'mb-form-msg err', errMsg(res.error))); return; }
    var s = res.data || {};
    var grid = el('div', 'ad-tiles');
    [['會員', s.members, '近 7 天 +' + (s.members_7d || 0)],
     ['留言', s.comments, '近 7 天 +' + (s.comments_7d || 0)],
     ['被檢舉', s.reported, '則留言'],
     ['已隱藏', s.hidden, '則留言']].forEach(function (t) {
      var tile = el('div', 'ad-tile');
      tile.appendChild(el('small', null, t[0]));
      tile.appendChild(el('b', null, String(t[1] || 0)));
      tile.appendChild(el('span', null, t[2]));
      grid.appendChild(tile);
    });
    p.appendChild(grid);

    // 備份：下載全部資料（JSON）
    var bk = el('div', 'ad-backup');
    var bb = el('button', 'cm-btn on', '匯出全部資料'); bb.type = 'button';
    var bm = el('small', 'mb-sub', '會員公開資料、收藏、閱讀進度、留言、檢舉、私訊。不含 email。建議每週下載一次存起來。');
    bb.onclick = async function () {
      bb.disabled = true; bb.textContent = '匯出中…';
      var r = await c().rpc('admin_export');
      bb.disabled = false; bb.textContent = '匯出全部資料';
      if (r.error) { window.alert(errMsg(r.error)); return; }
      var d = new Date(), stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') +
        '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
      var blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'weibeifen-backup-' + stamp + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      var x = r.data || {}, n = function (k) { return (x[k] || []).length; };
      bm.textContent = '已下載：會員 ' + n('profiles') + '、收藏 ' + n('favorites') + '、閱讀進度 ' + n('reading_progress') +
        '、留言 ' + n('comments') + '、檢舉 ' + n('comment_reports') + '、私訊 ' + n('dm_messages') + '。';
    };
    bk.appendChild(bb); bk.appendChild(bm);
    p.appendChild(bk);

    // 熱門章節：留言、書籤最多的頁面
    p.appendChild(el('h2', 'mb-h ad-h', '熱門章節'));
    var top = await c().rpc('admin_top_paths', { p_limit: 20 });
    if (top.error) p.appendChild(el('p', 'mb-form-msg err', errMsg(top.error)));
    else if (!(top.data || []).length) p.appendChild(el('p', 'mb-sub', '還沒有留言或書籤。'));
    else {
      var tt = el('table', 'ad-table'), th = el('tr');
      ['篇章', '留言', '書籤'].forEach(function (h) { th.appendChild(el('th', null, h)); });
      tt.appendChild(th);
      top.data.forEach(function (r) {
        var tr = el('tr'), td = el('td'), a = el('a', null, whereText(r)); a.href = r.path; td.appendChild(a); tr.appendChild(td);
        tr.appendChild(el('td', 'num', String(r.comments || 0)));
        tr.appendChild(el('td', 'num', String(r.marks || 0)));
        tt.appendChild(tr);
      });
      p.appendChild(tt);
    }

    p.appendChild(el('h2', 'mb-h ad-h', '各小說'));
    p.appendChild(el('p', 'mb-sub', '只有總數，不會列出是誰收藏或閱讀。「在讀」＝雲端書櫃裡有這本的會員數。'));
    var rows = s.novels || [];
    if (!rows.length) { p.appendChild(el('p', 'mb-sub', '還沒有資料。')); return; }
    var tb = el('table', 'ad-table');
    var hr = el('tr');
    ['小說', '收藏', '書籤', '在讀', '留言'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    tb.appendChild(hr);
    rows.forEach(function (r) {
      var tr = el('tr');
      var td = el('td'); var a = el('a', null, '《' + title(r.novel) + '》'); a.href = BASE + '/novel/' + r.novel + '/'; td.appendChild(a);
      tr.appendChild(td);
      [r.fav, r.marks, r.readers].forEach(function (v) { tr.appendChild(el('td', 'num', String(v || 0))); });
      var ct = el('td', 'num');
      if (r.comments) {
        var cb = el('button', 'ad-link', String(r.comments)); cb.type = 'button'; cb.title = '看這本的留言';
        cb.onclick = function () { cmFilter = 'all'; cmNovel = r.novel; show('comments', true); };
        ct.appendChild(cb);
      } else ct.textContent = '0';
      tr.appendChild(ct);
      tb.appendChild(tr);
    });
    p.appendChild(tb);
  }

  /* ---------- 留言管理 ---------- */
  var cmFilter = 'all', cmNovel = '';
  async function loadComments() {
    var p = panels.comments;
    p.textContent = '';
    var bar = el('div', 'ad-filter');
    [['all', '全部最新'], ['reported', '被檢舉'], ['hidden', '已隱藏']].forEach(function (f) {
      var b = el('button', 'cm-btn' + (cmFilter === f[0] ? ' on' : ''), f[1]); b.type = 'button';
      b.onclick = function () { cmFilter = f[0]; loadComments(); };
      bar.appendChild(b);
    });
    var sel = el('select', 'ad-select');
    var o0 = el('option', null, '所有小說'); o0.value = ''; sel.appendChild(o0);
    Object.keys(novels).forEach(function (id) { var o = el('option', null, '《' + title(id) + '》'); o.value = id; sel.appendChild(o); });
    sel.value = cmNovel;
    sel.onchange = function () { cmNovel = sel.value; loadComments(); };
    bar.appendChild(sel);
    p.appendChild(bar);
    var list = el('div', 'ad-list'); list.appendChild(el('p', 'mb-sub', '讀取中…'));
    p.appendChild(list);

    var rep = await c().from('comment_reports').select('comment_id,reason,created_at');
    if (rep.error) { list.textContent = ''; list.appendChild(el('p', 'mb-form-msg err', errMsg(rep.error))); return; }
    var reports = {};
    (rep.data || []).forEach(function (r) { (reports[r.comment_id] = reports[r.comment_id] || []).push(r); });

    var q = c().from('comments').select('id,user_id,novel,path,body,hidden,removed,created_at,profiles(display_name,username)')
      .order('created_at', { ascending: false }).limit(100);
    if (cmFilter === 'hidden') q = q.or('hidden.eq.true,removed.eq.true');
    if (cmNovel) q = q.eq('novel', cmNovel);
    if (cmFilter === 'reported') {
      var ids = Object.keys(reports).map(Number);
      if (!ids.length) { list.textContent = ''; list.appendChild(el('p', 'mb-sub', '目前沒有被檢舉的留言。')); return; }
      q = q.in('id', ids);
    }
    var res = await q;
    list.textContent = '';
    if (res.error) { list.appendChild(el('p', 'mb-form-msg err', errMsg(res.error))); return; }
    if (!(res.data || []).length) { list.appendChild(el('p', 'mb-sub', '沒有留言。')); return; }

    res.data.forEach(function (r) {
      var pr = r.profiles || {};
      var item = el('div', 'cm-item' + (r.hidden || r.removed ? ' is-hidden' : ''));
      var top = el('div', 'cm-top');
      top.appendChild(el('b', 'cm-name', pr.display_name || '新會員'));
      if (pr.username) top.appendChild(el('span', 'cm-user', '@' + pr.username));
      var side = el('div', 'cm-side'); side.appendChild(el('time', 'cm-time', fmtDate(r.created_at)));
      item.appendChild(top);
      var where = el('a', 'ad-where', whereText(r));
      where.href = r.path + '#comments';
      item.appendChild(where);
      if (r.removed) item.appendChild(el('p', 'cm-note', '已被管理員刪除（讀者和作者都看不到）'));
      else if (r.hidden) item.appendChild(el('p', 'cm-note', '因檢舉而隱藏（只有作者和管理員看得到）'));
      item.appendChild(el('p', 'cm-body', r.body));
      var rs = reports[r.id] || [];
      if (rs.length) {
        var ul = el('ul', 'ad-reasons');
        rs.forEach(function (x) { ul.appendChild(el('li', null, '檢舉：' + (x.reason || '（沒有寫原因）') + '　' + fmtDate(x.created_at))); });
        item.appendChild(ul);
      }
      var acts = el('div', 'cm-acts');
      function btn(text, fn) {
        var b = el('button', 'cm-btn', text); b.type = 'button';
        b.onclick = async function () {
          b.disabled = true;
          var e = await fn();
          if (e === 'cancel') { b.disabled = false; return; }
          if (e) { b.disabled = false; window.alert(errMsg(e)); return; }
          loadComments();
        };
        acts.appendChild(b);
      }
      if (!r.removed) btn('刪除', async function () {
        if (!window.confirm('確定要刪除嗎？讀者會看不到，之後在「已隱藏」還找得到。')) return 'cancel';
        return (await c().from('comments').update({ removed: true }).eq('id', r.id)).error;
      });
      if (r.hidden || r.removed) btn('恢復顯示', async function () {
        return (await c().from('comments').update({ hidden: false, removed: false }).eq('id', r.id)).error;
      });
      if (r.removed) btn('永久刪除', async function () {
        if (!window.confirm('永久刪除後無法復原，確定嗎？')) return 'cancel';
        return (await c().from('comments').delete().eq('id', r.id)).error;
      });
      if (rs.length) btn('清除檢舉', async function () {
        return (await c().from('comment_reports').delete().eq('comment_id', r.id)).error;
      });
      side.appendChild(acts);
      var main = el('div', 'cm-main'); while (item.firstChild) main.appendChild(item.firstChild); item.appendChild(main); item.appendChild(side);
        list.appendChild(item);
    });
  }

  /* ---------- 私訊：用角色身分回覆 ---------- */
  var chars = {};
  try { chars = JSON.parse(document.getElementById('chars').textContent || '{}'); } catch (e) {}
  var postsByKey = {};
  Object.keys(posts).forEach(function (u) { var p = posts[u]; if (p.s) postsByKey[p.s] = { u: u, no: p.no, t: p.t }; });
  var dmOpen = null; // 目前打開的對話：{ user_id, chr, name, username }
  var badge = tabs.querySelector('[data-tab="dm"] .ad-badge');
  function setBadge(n) { if (!badge) return; badge.hidden = !n; badge.textContent = n ? String(n) : ''; }
  async function refreshBadge() {
    var res = await c().rpc('admin_dm_threads');
    if (!res.error) setBadge((res.data || []).reduce(function (s, r) { return s + (+r.unseen || 0); }, 0));
    if (window.WBDM && window.WBDM.refresh) window.WBDM.refresh();  // 右下角紅點跟著更新
  }
  function chrName(id) { return (chars[id] && chars[id].name) || id; }
  function avatar(id) {
    var ch = chars[id] || {}, s = el('span', 'avatar');
    s.style.setProperty('--c', ch.color || '#999');
    if (ch.avatar) { var img = el('img'); img.alt = ''; img.src = BASE + '/assets/avatars/' + ch.avatar + '?v=' + (window.VER || ''); s.appendChild(img); }
    else s.textContent = ch.glyph || '?';
    return s;
  }
  function loadDM() { return dmOpen ? dmThread() : dmList(); }

  async function dmList() {
    dmOpen = null;
    var p = panels.dm;
    p.textContent = ''; p.appendChild(el('p', 'mb-sub', '讀取中…'));
    var res = await c().rpc('admin_dm_threads');
    p.textContent = '';
    if (res.error) { p.appendChild(el('p', 'mb-form-msg err', errMsg(res.error))); return; }
    var rows = res.data || [];
    setBadge(rows.reduce(function (s, r) { return s + (+r.unseen || 0); }, 0));
    p.appendChild(el('p', 'mb-sub', rows.length ? '每位會員和每個角色的對話各一列。點進去就能用角色的身分回覆。' : '還沒有人傳私訊。'));
    var ul = el('ul', 'ad-dm-list');
    rows.forEach(function (r) {
      var li = el('li'), b = el('button', 'ad-dm-row'); b.type = 'button';
      b.appendChild(avatar(r.chr));
      var who = el('span', 'ad-dm-who'), top = el('span', 'ad-dm-top');
      top.appendChild(el('b', null, chrName(r.chr)));
      top.appendChild(el('span', null, '← ' + (r.display_name || '新會員') + (r.username ? ' @' + r.username : '')));
      who.appendChild(top);
      who.appendChild(el('span', 'ad-dm-last', (r.last_from_char ? chrName(r.chr) + '（你）：' : '') + r.last_body));
      b.appendChild(who);
      var side = el('span', 'ad-dm-side');
      side.appendChild(el('time', null, fmtDate(r.last_at)));
      if (+r.unseen) side.appendChild(el('span', 'ib-n new', String(r.unseen)));
      b.appendChild(side);
      b.onclick = function () { dmOpen = { user_id: r.user_id, chr: r.chr, name: r.display_name || '新會員', username: r.username }; dmThread(); };
      li.appendChild(b); ul.appendChild(li);
    });
    p.appendChild(ul);
  }

  async function dmThread() {
    var t = dmOpen, p = panels.dm;
    p.textContent = '';
    var head = el('div', 'ad-dm-head');
    var back = el('button', 'cm-btn', '‹ 全部對話'); back.type = 'button'; back.onclick = function () { dmList(); };
    head.appendChild(back);
    head.appendChild(avatar(t.chr));
    var hw = el('span', 'ad-dm-who');
    hw.appendChild(el('b', null, chrName(t.chr) + ' ↔ ' + t.name + (t.username ? ' @' + t.username : '')));
    var ch = chars[t.chr];
    if (ch && novels[ch.novel]) hw.appendChild(el('small', null, '《' + title(ch.novel) + '》'));
    head.appendChild(hw);
    p.appendChild(head);
    var box = el('div', 'ad-dm-msgs'); box.appendChild(el('p', 'mb-sub', '讀取中…'));
    p.appendChild(box);

    var res = await c().from('dm_messages').select('id,post,from_char,body,seen,created_at')
      .eq('user_id', t.user_id).eq('chr', t.chr).order('created_at', { ascending: true }).limit(1000);
    box.textContent = '';
    if (res.error) { box.appendChild(el('p', 'mb-form-msg err', errMsg(res.error))); return; }
    var rows = res.data || [], lastRef = null;
    if (!rows.length) box.appendChild(el('p', 'mb-sub', '這段對話沒有訊息了。'));
    rows.forEach(function (m) {
      if (!m.from_char && m.post && m.post !== lastRef) {
        var pp = postsByKey[m.post];
        if (pp) { var a = el('a', 'ib-ref', (pp.no ? '第 ' + pp.no + ' 篇' : '') + '〈' + (pp.t || '') + '〉'); a.href = pp.u; box.appendChild(a); }
        lastRef = m.post;
      }
      // 讀者在左邊，角色（你）在右邊
      var row = el('div', m.from_char ? 'ib-me' : 'ib-them'), wrap = el('div');
      wrap.appendChild(el('span', null, m.body));
      var meta = el('small', null, fmtDate(m.created_at) + (m.from_char ? (m.seen ? '・已讀' : '・未讀') : '') + '　');
      var del = el('button', 'ad-link', '刪除'); del.type = 'button';
      del.onclick = async function () {
        if (!window.confirm('永久刪除這則私訊？讀者那邊也會消失，無法復原。')) return;
        del.disabled = true;
        var r = await c().from('dm_messages').delete().eq('id', m.id);
        if (r.error) { del.disabled = false; window.alert(errMsg(r.error)); return; }
        dmThread();
      };
      meta.appendChild(del);
      wrap.appendChild(meta);
      if (m.from_char) { while (wrap.firstChild) row.appendChild(wrap.firstChild); } else row.appendChild(wrap);
      box.appendChild(row);
    });

    // 回覆
    var f = el('form', 'ad-dm-form');
    var ta = el('textarea'); ta.maxLength = 500; ta.rows = 3; ta.placeholder = '以「' + chrName(t.chr) + '」的身分回覆…（Ctrl／⌘＋Enter 送出）';
    var sb = el('button', 'cm-btn on', '以' + chrName(t.chr) + '回覆'); sb.type = 'submit';
    var cnt = el('small', 'mb-sub', '0 / 500');
    ta.oninput = function () { cnt.textContent = ta.value.length + ' / 500'; };
    ta.onkeydown = function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); f.requestSubmit(); } };
    f.onsubmit = async function (e) {
      e.preventDefault();
      var body = ta.value.trim(); if (!body) return;
      ta.disabled = sb.disabled = true;
      var r = await c().from('dm_messages').insert({ user_id: t.user_id, chr: t.chr, from_char: true, body: body });
      if (r.error) { ta.disabled = sb.disabled = false; window.alert(errMsg(r.error)); return; }
      dmThread();
    };
    var bar = el('div', 'ad-dm-bar'); bar.appendChild(cnt); bar.appendChild(sb);
    f.appendChild(ta); f.appendChild(bar);
    p.appendChild(f);
    box.scrollTop = box.scrollHeight;
    ta.focus();

    // 打開就算看過讀者的訊息
    if (rows.some(function (m) { return !m.from_char && !m.seen; })) {
      await c().rpc('dm_mark_seen', { p_chr: t.chr, p_user: t.user_id });
      refreshBadge();
    }
  }

  /* ---------- 會員列表 ---------- */
  async function loadMembers() {
    var p = panels.members;
    p.textContent = ''; p.appendChild(el('p', 'mb-sub', '讀取中…'));
    var res = await c().rpc('admin_member_list');
    p.textContent = '';
    if (res.error) { p.appendChild(el('p', 'mb-form-msg err', errMsg(res.error))); return; }
    var rows = res.data || [];
    p.appendChild(el('p', 'mb-sub', '共 ' + rows.length + ' 位會員。不顯示 email。'));
    var tb = el('table', 'ad-table');
    var hr = el('tr');
    ['顯示名稱', '帳號名稱', '角色', '加入時間', '留言'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    tb.appendChild(hr);
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', null, r.display_name || '新會員'));
      tr.appendChild(el('td', null, r.username ? '@' + r.username : '—'));
      tr.appendChild(el('td', null, r.role === 'admin' ? '管理員' : '讀者'));
      tr.appendChild(el('td', null, fmtDate(r.created_at)));
      tr.appendChild(el('td', 'num', String(r.comments || 0)));
      tb.appendChild(tr);
    });
    p.appendChild(tb);
  }

  var LOADERS = { stats: loadStats, comments: loadComments, dm: loadDM, members: loadMembers };

  /* ---------- 啟動：確認權限 ---------- */
  async function init() {
    if (!A || A.configProblem()) { say((A && A.configProblem()) || '登入程式沒有載入成功。'); return; }
    var v;
    try { v = await A.getVerifiedUser(); } catch (e) { v = { user: null, error: '連不上會員伺服器。' }; }
    if (!v.user) {
      status.textContent = v.error || '請先登入。';
      var a = el('a', null, '　前往會員頁'); a.href = BASE + '/member/'; status.appendChild(a);
      return;
    }
    var ok = false;
    try { ok = await A.isAdmin(); } catch (e) {}
    if (!ok) {
      status.textContent = '沒有管理員權限。如果你是管理員，請先到會員頁輸入兩步驟驗證碼。';
      var b = el('a', null, '　前往會員頁'); b.href = BASE + '/member/'; status.appendChild(b);
      return;
    }
    say('已通過兩步驟驗證。');
    tabs.hidden = false;
    show(location.hash === '#dm' ? 'dm' : 'stats');
    refreshBadge().catch(function () {});
  }
  init();
});
