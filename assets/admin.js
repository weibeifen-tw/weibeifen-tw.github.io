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
    if (/WB_CANNOT_BAN_ADMIN/.test(m)) return '不能封鎖管理員。';
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
  tabs.querySelectorAll('button').forEach(function (b) { b.onclick = function () { if (b.dataset.tab === 'roles') roleOpen = undefined; show(b.dataset.tab, b.dataset.tab === 'roles'); }; });

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

    var q = c().from('comments').select('id,user_id,novel,path,body,hidden,removed,as_author,created_at,profiles(display_name,username,avatar_color)')
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
      if (window.WBAvatar) top.appendChild(window.WBAvatar.make({ name: pr.display_name || '新會員', color: pr.avatar_color, id: r.user_id, author: r.as_author }, 'cm-av'));
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
    if (!badge) return; // V1.0 S09：私訊分頁已移除，不再呼叫 admin_dm_threads
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

  // 常用語：全部讀一次快取起來（chr 為 null 是通用）
  var snippets = null;
  async function loadSnippets(force) {
    if (snippets && !force) return snippets;
    var r = await c().from('admin_snippets').select('id,chr,body').order('created_at', { ascending: true });
    if (r.error) throw r.error;
    snippets = r.data || [];
    return snippets;
  }
  function snippetsFor(chr) { return (snippets || []).filter(function (s) { return s.chr === chr || s.chr == null; }); }

  // 私訊回覆框下面：這個角色＋通用的常用語，點一下帶入
  function snippetBar(ta, chr) {
    var box = el('div', 'ad-snips');
    loadSnippets().then(function () {
      snippetsFor(chr).forEach(function (s) {
        var use = el('button', 'ad-snip ad-snip-use', s.body.length > 24 ? s.body.slice(0, 24) + '…' : s.body);
        use.type = 'button'; use.title = s.body;
        use.onclick = function () {
          ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + s.body : s.body;
          ta.dispatchEvent(new Event('input')); ta.focus();
        };
        box.appendChild(use);
      });
      var go = el('button', 'ad-link', snippetsFor(chr).length ? '管理常用語' : '設定這個角色的常用語'); go.type = 'button';
      go.onclick = function () { roleOpen = chr; show('roles', true); };
      box.appendChild(go);
    }).catch(function () {});
    return box;
  }

  /* ---------- 角色：每個角色的常用語 ---------- */
  var roleOpen; // undefined＝角色列表；null＝通用；字串＝角色 id
  async function loadRoles() {
    var p = panels.roles;
    p.textContent = ''; p.appendChild(el('p', 'mb-sub', '讀取中…'));
    try { await loadSnippets(true); } catch (e) { p.textContent = ''; p.appendChild(el('p', 'mb-form-msg err', errMsg(e))); return; }
    p.textContent = '';
    if (roleOpen !== undefined) return roleSnippets(p, roleOpen);
    p.appendChild(el('p', 'mb-sub', '點角色設定常用語。回覆私訊時，會出現這個角色的常用語和「通用」的常用語，點一下就帶進回覆框。'));
    var ul = el('ul', 'ad-dm-list');
    function row(id, label, sub) {
      var li = el('li'), b = el('button', 'ad-dm-row'); b.type = 'button';
      if (id) b.appendChild(avatar(id)); else { var g = el('span', 'avatar ad-all', '全'); b.appendChild(g); }
      var who = el('span', 'ad-dm-who'); who.appendChild(el('b', null, label)); who.appendChild(el('small', null, sub));
      b.appendChild(who);
      var n = (snippets || []).filter(function (s) { return s.chr === id; }).length;
      var side = el('span', 'ad-dm-side'); side.appendChild(el('span', 'ib-n', n + ' 句')); b.appendChild(side);
      b.onclick = function () { roleOpen = id; loadRoles(); };
      li.appendChild(b); ul.appendChild(li);
    }
    row(null, '通用', '所有角色都會出現');
    Object.keys(novels).forEach(function (nid) {
      Object.keys(chars).filter(function (cid) { return chars[cid].novel === nid || (chars[cid].also || []).indexOf(nid) >= 0; }).forEach(function (cid) {
        row(cid, chrName(cid), '《' + title(nid) + '》' + (chars[cid].handle ? '　@' + chars[cid].handle : ''));
      });
    });
    p.appendChild(ul);
  }

  function roleSnippets(p, chr) {
    var head = el('div', 'ad-dm-head');
    var back = el('button', 'cm-btn', '‹ 全部角色'); back.type = 'button';
    back.onclick = function () { roleOpen = undefined; loadRoles(); };
    head.appendChild(back);
    if (chr) head.appendChild(avatar(chr));
    var hw = el('span', 'ad-dm-who');
    hw.appendChild(el('b', null, chr ? chrName(chr) + ' 的常用語' : '通用常用語'));
    hw.appendChild(el('small', null, chr ? (chars[chr] && novels[chars[chr].novel] ? '《' + title(chars[chr].novel) + '》' : '') : '所有角色回覆時都會出現'));
    head.appendChild(hw);
    p.appendChild(head);

    var list = el('div', 'ad-snip-list');
    var mine = (snippets || []).filter(function (s) { return s.chr === chr; });
    if (!mine.length) list.appendChild(el('p', 'mb-sub', '還沒有常用語。'));
    mine.forEach(function (s) {
      var item = el('div', 'ad-snip-item');
      item.appendChild(el('p', null, s.body));
      var del = el('button', 'cm-btn', '刪除'); del.type = 'button';
      del.onclick = async function () {
        if (!window.confirm('刪除這句常用語？')) return;
        del.disabled = true;
        var r = await c().from('admin_snippets').delete().eq('id', s.id);
        if (r.error) { del.disabled = false; window.alert(errMsg(r.error)); return; }
        loadRoles();
      };
      item.appendChild(del);
      list.appendChild(item);
    });
    p.appendChild(list);

    var f = el('form', 'ad-dm-form');
    var ta = el('textarea'); ta.maxLength = 500; ta.rows = 2; ta.placeholder = '新增一句' + (chr ? chrName(chr) + '的' : '通用') + '常用語…';
    var sb = el('button', 'cm-btn on', '新增'); sb.type = 'submit';
    var cnt = el('small', 'mb-sub', '0 / 500');
    ta.oninput = function () { cnt.textContent = ta.value.length + ' / 500'; };
    f.onsubmit = async function (e) {
      e.preventDefault();
      var t = ta.value.trim(); if (!t) return;
      ta.disabled = sb.disabled = true;
      var r = await c().from('admin_snippets').insert({ body: t, chr: chr });
      if (r.error) { ta.disabled = sb.disabled = false; window.alert(errMsg(r.error)); return; }
      loadRoles();
    };
    var bar = el('div', 'ad-dm-bar'); bar.appendChild(cnt); bar.appendChild(sb);
    f.appendChild(ta); f.appendChild(bar);
    p.appendChild(f);
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
    f.appendChild(ta);
    f.appendChild(snippetBar(ta, t.chr));
    f.appendChild(bar);
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
    ['顯示名稱', '帳號名稱', '角色', '加入時間', '留言', '狀態'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    tb.appendChild(hr);
    rows.forEach(function (r) {
      var tr = el('tr');
      var nt = el('td', 'ad-who');
      if (window.WBAvatar) nt.appendChild(window.WBAvatar.make({ name: r.display_name || '新會員', color: r.avatar_color, id: r.id, author: r.role === 'admin' }, 'cm-av'));
      nt.appendChild(document.createTextNode(r.display_name || '新會員'));
      tr.appendChild(nt);
      tr.appendChild(el('td', null, r.username ? '@' + r.username : '—'));
      tr.appendChild(el('td', null, r.role === 'admin' ? '管理員' : '讀者'));
      tr.appendChild(el('td', null, fmtDate(r.created_at)));
      tr.appendChild(el('td', 'num', String(r.comments || 0)));
      // 封鎖：不能留言、私訊、檢舉、改個人資料；還能看小說
      var st = el('td', 'ad-ban');
      if (r.banned) st.appendChild(el('span', 'ad-banned', '已封鎖' + (r.ban_reason ? '：' + r.ban_reason : '')));
      if (r.role !== 'admin') {
        var bb = el('button', 'cm-btn', r.banned ? '解除封鎖' : '封鎖'); bb.type = 'button';
        bb.onclick = async function () {
          var name = r.display_name || '新會員', res2;
          if (r.banned) {
            if (!window.confirm('解除封鎖「' + name + '」？解除後可以再留言和傳私訊。')) return;
            bb.disabled = true;
            res2 = await c().rpc('admin_unban', { p_user: r.id });
          } else {
            var why = window.prompt('封鎖「' + name + '」的原因（選填，只有你看得到）：', '');
            if (why === null) return;
            var rm = window.confirm('要一起移除他所有的留言嗎？\n（按「確定」移除，之後可在留言「已隱藏」恢復；按「取消」只封鎖、不動留言）');
            bb.disabled = true;
            res2 = await c().rpc('admin_ban', { p_user: r.id, p_reason: why.trim() || null, p_remove_comments: rm });
          }
          if (res2.error) { bb.disabled = false; window.alert(errMsg(res2.error)); return; }
          loadMembers();
        };
        st.appendChild(bb);
      }
      tr.appendChild(st);
      tb.appendChild(tr);
    });
    p.appendChild(tb);
  }

  /* ---------- 人氣：公開數字基準（只有 is_admin() 後台可操作） ---------- */
  async function loadPopularity() {
    var p = panels.popularity;
    p.textContent = '';
    p.appendChild(el('h2', 'mb-h ad-h', '人氣管理'));
    p.appendChild(el('p', 'mb-sub', '設定的是「目前對外顯示的人氣」。往後有效觀看會從這個基準繼續累加；每次調整會由資料庫留存紀錄。'));
    var form = el('form', 'ad-popularity-form');
    var select = el('select', 'ad-select');
    Object.keys(novels).forEach(function (id) {
      var opt = el('option', null, '《' + title(id) + '》');
      opt.value = id; select.appendChild(opt);
    });
    var number = el('input', 'ad-select');
    number.type = 'number'; number.min = '0'; number.max = '1000000000'; number.step = '1';
    number.inputMode = 'numeric'; number.required = true; number.placeholder = '請輸入要顯示的人氣';
    var submit = el('button', 'cm-btn on', '設定人氣'); submit.type = 'submit';
    var msg = el('p', 'mb-form-msg', '');
    var lbl = el('label', null, '小說'); lbl.appendChild(select);
    var lbl2 = el('label', null, '設定人氣數值'); lbl2.appendChild(number);
    form.appendChild(lbl); form.appendChild(lbl2); form.appendChild(submit); form.appendChild(msg);
    form.onsubmit = async function (ev) {
      ev.preventDefault();
      var val = Number(number.value);
      if (!Number.isSafeInteger(val) || val < 0 || val > 1000000000) {
        msg.textContent = '請輸入 0 至 1,000,000,000 之間的整數。'; return;
      }
      var id = select.value;
      if (!Object.prototype.hasOwnProperty.call(novels, id)) return;
      if (!window.confirm('確定將《' + title(id) + '》目前對外顯示的人氣設定成 ' +
                          val.toLocaleString('zh-TW') + ' 嗎？這次調整會留下紀錄。')) return;
      submit.disabled = true; msg.textContent = '設定中…';
      try {
        // 只有正式 Supabase 的 server-side is_admin()（角色 + MFA）能核准操作。
        var res = await c().rpc('admin_set_popularity', { p_work_id: id, p_target: val });
        if (res.error) throw res.error;
        msg.textContent = '已更新基準；公開數字依下次快照更新。';
      } catch (e) { msg.textContent = '無法設定人氣：' + errMsg(e) + '。如果人氣功能尚未正式啟用，請勿重試。'; }
      submit.disabled = false;
    };
    p.appendChild(form);
    p.appendChild(el('p', 'mb-sub', '若後端尚未完成部署，這個畫面不會自行建立資料或更動人氣。'));
  }

  var LOADERS = { stats: loadStats, comments: loadComments, members: loadMembers, roles: loadRoles, popularity: loadPopularity }; // V1.0 S09：私訊分頁退役（DM-A）

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
    show('stats');
    refreshBadge().catch(function () {});
  }
  init();
});
