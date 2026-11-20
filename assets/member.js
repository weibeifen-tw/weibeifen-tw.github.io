/*
 * 未備份｜會員入口與會員頁
 *
 * 1. 全站（首頁限動列、左側選單）：只讀瀏覽器裡的登入資料，把「我的帳號」換成頭像。
 *    這部分不載入 Supabase SDK、不連網，只做顯示；真正的驗證在 /member/ 進行。
 * 2. /member/：顯示訪客或會員畫面、Google 登入、登出（含所有裝置）、
 *    個人資料編輯（profiles，RLS）、管理員兩步驟驗證。
 *    需要頁面先載入 _includes/auth-config.html（Supabase SDK + auth.js）。
 *
 * 不讀寫任何 wb: / wb- 開頭的資料（書櫃、閱讀紀錄），書櫃列表由 app.js 原本的程式負責。
 * 所有使用者資料一律用 textContent 寫入，不使用 innerHTML。
 */
(function () {
  'use strict';

  var SESSION_KEY = 'sb-tqicconarhpddejxdvmf-auth-token';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function profileFromUser(user) {
    if (!user) return null;
    var m = user.user_metadata || {};
    return {
      id: user.id || '',
      email: user.email || '',
      name: m.full_name || m.name || (user.email ? user.email.split('@')[0] : '讀者'),
      avatar: '', // 不顯示 Google 大頭貼（隱私）；會員頁改用 profiles.avatar_url
      provider: (user.app_metadata && user.app_metadata.provider) || ''
    };
  }

  // 只讀本機登入資料（不驗證、不連網），用來立刻顯示頭像
  function localProfile() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      var user = s && (s.user || (s.currentSession && s.currentSession.user));
      if (!user || !s.refresh_token && !(s.currentSession && s.currentSession.refresh_token)) return null;
      return profileFromUser(user);
    } catch (e) { return null; }
  }

  // 只允許 https 的頭像網址
  function safeImg(url) { return /^https:\/\//.test(url || '') ? url : ''; }

  // 把一個 .avatar 容器畫成會員頭像或預設頭像
  function paintAvatar(box, p) {
    if (!box) return;
    var tpl = document.getElementById('member-default-avatar');
    box.textContent = '';
    var src = p && safeImg(p.avatar);
    if (src) {
      var img = el('img');
      img.alt = ''; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
      img.onerror = function () { paintAvatar(box, null); };
      img.src = src;
      box.appendChild(img);
    } else if (tpl) {
      box.appendChild(tpl.content.cloneNode(true));
    }
    box.classList.toggle('is-member', !!src || !!p);
  }

  // 這台裝置記住自己的頭貼（名字、顏色、是不是管理員），讓全站「我的帳號」入口顯示
  var ME_KEY = 'wb:me';
  function myAvatar() { try { return JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch (e) { return null; } }
  function saveMyAvatar(o) { try { if (o) localStorage.setItem(ME_KEY, JSON.stringify(o)); else localStorage.removeItem(ME_KEY); } catch (e) {} }
  function paintEntries(p) {
    var me = p && myAvatar();
    document.querySelectorAll('[data-member-avatar]').forEach(function (b) {
      if (me && window.WBAvatar) { window.WBAvatar.paint(b, me); b.classList.add('is-member'); }
      else { b.classList.remove('lt-av', 'lt-mu'); paintAvatar(b, p); }
    });
    document.querySelectorAll('[data-member-entry]').forEach(function (a) {
      a.classList.toggle('signed-in', !!p);
      // 首頁頭貼下面：沒登入「登入」；有帳號名稱顯示帳號名稱；還沒設定顯示「我的資料」
      var t = a.querySelector('.s-t');
      if (t) t.textContent = !p ? '登入' : (me && me.username) ? me.username : '我的資料';
    });
    document.querySelectorAll('[data-member-only]').forEach(function (a) { a.hidden = !p; });
  }

  // 全站入口：一載入就依本機資料顯示
  paintEntries(localProfile());
  // 從別的分頁登入／登出時同步
  window.addEventListener('storage', function (e) { if (e.key === SESSION_KEY) paintEntries(localProfile()); });
  // 用「上一頁」回到頁面時，瀏覽器可能從快取（BFCache）還原、不重跑程式：重新讀取本機登入資料更新頭像
  window.addEventListener('pageshow', function (e) { if (e.persisted) paintEntries(localProfile()); });

  /* ---------------- /member/ 會員頁 ---------------- */
  var page = document.querySelector('.member-page');
  if (!page) return;

  var card = page.querySelector('.mb-card');
  var note = page.querySelector('.mb-note');
  var future = page.querySelector('.mb-future');
  var A = window.WBAuth;
  var busy = false;

  function setNote(text, isErr) { note.textContent = text || ''; note.classList.toggle('err', !!isErr); note.hidden = !text; }

  function renderGuest() {
    saveMyAvatar(null);
    card.textContent = '';
    var av = el('span', 'avatar mb-av'); paintAvatar(av, null); card.appendChild(av);
    card.appendChild(el('h1', 'mb-title', '登入你的帳號'));
    card.appendChild(el('p', 'mb-sub', '用 Google 帳號登入，之後就能使用留言、收藏等會員功能。不登入也能看所有小說。'));
    var b = el('button', 'mb-btn primary mb-login', '用 Google 登入');
    b.type = 'button';
    b.disabled = busy || !A || !!(A && A.configProblem());
    b.onclick = login;
    card.appendChild(b);
    if (future) future.hidden = true;
    paintEntries(null);
  }

  function renderMember(p, prof, role) {
    card.textContent = '';
    prof = prof || {};
    var name = prof.display_name || '新會員';
    var head = el('div', 'mb-head');
    var me = { name: name, color: prof.avatar_color || null, id: prof.id || p.id, author: role === 'admin', username: prof.username || '' };
    saveMyAvatar(me);
    var av = el('span', 'avatar mb-av');
    if (window.WBAvatar) window.WBAvatar.paint(av, me); else paintAvatar(av, null);
    head.appendChild(av);
    var who = el('div', 'mb-who');
    var nm = el('h1', 'mb-title', name);
    if (role === 'admin') nm.appendChild(el('span', 'mb-badge', '管理員'));
    who.appendChild(nm);
    if (prof.username) who.appendChild(el('p', 'mb-sub', '@' + prof.username));
    who.appendChild(el('p', 'mb-sub', p.email + '（只有你看得到）'));
    head.appendChild(who);
    card.appendChild(head);

    var dl = el('dl', 'mb-info');
    function row(k, v) { dl.appendChild(el('dt', null, k)); var dd = el('dd', null, v); dl.appendChild(dd); return dd; }
    row('登入方式', p.provider === 'google' ? 'Google' : (p.provider || '—'));
    card.appendChild(dl);

    if (prof.id) card.appendChild(profileForm(prof, me, av));
    if (role === 'admin') card.appendChild(adminBox());

    var acts = el('div', 'mb-acts');
    // 只有一顆「登出」：一次登出所有裝置；靠左。儲存靠右（屬於上面的個人資料表單）
    var out = el('button', 'mb-btn mb-logout', '登出');
    out.type = 'button'; out.onclick = logoutAll;
    acts.appendChild(out);
    var sv = card.querySelector('.mb-save');
    if (sv) acts.appendChild(sv);
    card.appendChild(acts);
    // 刪除帳號（管理員不顯示）：灰色小字，放在最下面
    if (role !== 'admin') {
      var del = el('button', 'mb-del', '刪除帳號');
      del.type = 'button'; del.onclick = deleteAccount;
      card.appendChild(del);
    }
    if (future) future.hidden = false;
    paintEntries(p);
  }

  /* ---------- 個人資料表單（公開資料） ---------- */
  function field(labelText, input, hint) {
    var w = el('label', 'mb-field');
    w.appendChild(el('span', 'mb-lbl', labelText));
    w.appendChild(input);
    if (hint) w.appendChild(el('small', 'mb-hint', hint));
    return w;
  }

  function profileForm(prof, me, headAv) {
    var f = el('form', 'mb-form');
    f.noValidate = true;
    var fH = el('h2', 'mb-h', '個人資料'); f.appendChild(fH);
    var fSub = el('p', 'mb-sub', '以下資料所有人都看得到，請不要填真實姓名或聯絡方式。'); f.appendChild(fSub);

    var dn = el('input'); dn.name = 'display_name'; dn.maxLength = 5; dn.value = prof.display_name || ''; dn.autocomplete = 'off';
    var un = el('input'); un.name = 'username'; un.maxLength = 8; un.value = prof.username || ''; un.autocomplete = 'off';
    un.setAttribute('autocapitalize', 'off'); un.spellcheck = false;
    var bio = el('textarea'); bio.name = 'bio'; bio.maxLength = 30; bio.rows = 2; bio.value = prof.bio || '';

    // 讀者的顯示名稱、頭貼顏色只能各改一次（資料庫也會擋）；管理員不限
    var nameLocked = !me.author && !!prof.name_changed_at;
    var colorLocked = !me.author && !!prof.color_changed_at;
    var userLocked = !me.author && !!prof.username_changed_at;
    var dnHint = el('small', 'mb-hint');
    var dnStatic = el('p', 'mb-static');
    function paintNameHint() {
      // 改過之後：輸入框和灰字都收起來，只顯示目前的名字
      dnHint.textContent = '1～5 個字，留空會顯示「新會員」。' + (me.author ? '' : '只能改一次，存了就不能再改。頭貼會顯示名稱的第一個字。');
      dnStatic.textContent = dn.value.trim() || '新會員';
      dn.disabled = nameLocked;
      dn.hidden = nameLocked; dnHint.hidden = nameLocked; dnStatic.hidden = !nameLocked;
    }
    paintNameHint();
    // 順序：顯示名稱 → 頭貼顏色 → 帳號名稱 → 簡介
    var dnField = field('顯示名稱', dn); dnField.appendChild(dnStatic); dnField.appendChild(dnHint);
    f.appendChild(dnField);

    // 頭貼顏色：白底圓圈，名字第一個字（管理員是 MU）用選的顏色
    var picked = prof.avatar_color || '';
    var pk = el('div', 'mb-field');
    pk.appendChild(el('span', 'mb-lbl', '頭貼顏色'));
    var sw = el('div', 'mb-colors');
    sw.setAttribute('role', 'radiogroup');
    function preview() { if (window.WBAvatar && headAv) window.WBAvatar.paint(headAv, { name: dn.value.trim() || '新會員', color: picked || null, id: me.id, author: me.author }); }
    var palette = window.WBAvatar ? window.WBAvatar.choices(me.author) : [];
    if (picked === 'orange' && !me.author) picked = '';
    palette.forEach(function (c) {
      var b = el('button', 'mb-color'); b.type = 'button';
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c[1]); b.title = c[1];
      var dot = window.WBAvatar.make({ name: dn.value.trim() || '新會員', color: c[0], id: me.id, author: me.author });
      b.appendChild(dot);
      function mark() { sw.querySelectorAll('.mb-color').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); }); }
      b.onclick = function () { if (colorLocked) return; picked = c[0]; mark(); preview(); };
      if (picked === c[0]) b.setAttribute('aria-checked', 'true'); else b.setAttribute('aria-checked', 'false');
      sw.appendChild(b);
    });
    pk.appendChild(sw);
    var pkNow = el('div', 'mb-colors mb-color-now');
    pk.appendChild(pkNow);
    var pkHint = el('small', 'mb-hint');
    function paintColorHint() {
      // 選過之後：色票和灰字都收起來，只顯示目前的顏色
      pkHint.textContent = '選好按「儲存」。留言區和全站都會顯示這個頭貼。' + (me.author ? '' : '只能選一次。');
      sw.querySelectorAll('.mb-color').forEach(function (x) { x.disabled = colorLocked; });
      sw.hidden = colorLocked; pkHint.hidden = colorLocked; pkNow.hidden = !colorLocked;
      pkNow.textContent = '';
      if (colorLocked && window.WBAvatar) pkNow.appendChild(window.WBAvatar.make({ name: dn.value.trim() || '新會員', color: picked || null, id: me.id, author: me.author }));
    }
    pk.appendChild(pkHint);
    f.appendChild(pk); // 放在顯示名稱下面
    var unField = field('帳號名稱（選填）', un, '小寫英文、數字、底線，3～8 個字。首頁頭貼下面會顯示帳號名稱。' + (me.author ? '' : '只能改一次，存了就不能再改。'));
    f.appendChild(unField);
    var bioField = field('簡介（選填）', bio, '最多 30 個字');
    f.appendChild(bioField);
    // 名稱、顏色、帳號名稱都改過之後：上面卡片已經有名字、頭貼、@帳號，這區只留「簡介」
    function paintLocks() {
      unField.hidden = userLocked;
      var all = nameLocked && colorLocked && userLocked;
      dnField.hidden = all; pk.hidden = all; fSub.hidden = all;
      fH.textContent = all ? '簡介' : '個人資料';
      bioField.querySelector('.mb-lbl').hidden = all;
    }
    paintLocks();
    paintColorHint();
    dn.addEventListener('input', function () {
      preview();
      sw.querySelectorAll('.lt-av').forEach(function (d, i) { window.WBAvatar.paint(d, { name: dn.value.trim() || '新會員', color: palette[i][0], id: me.id, author: me.author }); });
    });

    var msg = el('p', 'mb-form-msg'); msg.hidden = true;
    var save = el('button', 'mb-btn primary mb-save', '儲存');
    save.type = 'submit';
    f.id = 'mb-profile-form'; save.setAttribute('form', f.id); // 按鈕移到最下面那排也能送出這個表單
    f.appendChild(save); f.appendChild(msg);

    function say(t, err) { msg.textContent = t; msg.hidden = !t; msg.classList.toggle('err', !!err); }

    f.onsubmit = async function (ev) {
      ev.preventDefault();
      var u = un.value.trim().toLowerCase();
      if (u && !/^[a-z0-9_]{3,8}$/.test(u)) { say('帳號名稱只能用小寫英文、數字、底線，3～8 個字。', true); return; }
      if (Array.from(dn.value.trim()).length > 5) { say('顯示名稱最多 5 個字。', true); return; }
      // 第一次改名字或顏色：先確認
      var newName = dn.value.trim() || '新會員', oldName = prof.display_name || '新會員';
      var nameChg = !nameLocked && !me.author && newName !== oldName;
      var colorChg = !colorLocked && !me.author && (picked || null) !== (prof.avatar_color || null);
      var userChg = !userLocked && !me.author && (u || null) !== (prof.username || null);
      if (nameChg || colorChg || userChg) {
        var parts = [];
        if (nameChg) parts.push('顯示名稱'); if (colorChg) parts.push('頭貼顏色'); if (userChg) parts.push('帳號名稱');
        var what = parts.join('、');
        if (!window.confirm(what + '只能改一次，存了之後就不能再改。確定要儲存嗎？')) return;
      }
      save.disabled = true; say('儲存中…');
      var r;
      try { r = await A.updateMyProfile({ display_name: dn.value, username: u, bio: bio.value, avatar_color: picked }); }
      catch (e) { r = { error: '連不上會員伺服器，請稍後再試。' }; }
      save.disabled = false;
      if (r.error) { say(r.error, true); return; }
      dn.value = r.profile.display_name || ''; un.value = r.profile.username || ''; bio.value = r.profile.bio || '';
      var t = card.querySelector('.mb-title');
      if (t && t.firstChild && t.firstChild.nodeType === 3) t.firstChild.nodeValue = r.profile.display_name || '新會員';
      me.name = r.profile.display_name || '新會員'; me.color = r.profile.avatar_color || null; me.username = r.profile.username || '';
      prof.display_name = r.profile.display_name; prof.avatar_color = r.profile.avatar_color;
      prof.name_changed_at = r.profile.name_changed_at; prof.color_changed_at = r.profile.color_changed_at;
      prof.username = r.profile.username; prof.username_changed_at = r.profile.username_changed_at;
      nameLocked = !me.author && !!prof.name_changed_at; colorLocked = !me.author && !!prof.color_changed_at;
      userLocked = !me.author && !!prof.username_changed_at;
      paintNameHint(); paintColorHint(); paintLocks();
      saveMyAvatar(me); preview(); paintEntries(me);
      say('已儲存。');
    };
    return f;
  }

  /* ---------- 管理員：兩步驟驗證 ---------- */
  function adminBox() {
    var box = el('section', 'mb-admin');
    box.appendChild(el('h2', 'mb-h', '管理員驗證'));
    var body = el('div', 'mb-admin-body');
    body.appendChild(el('p', 'mb-sub', '檢查中…'));
    box.appendChild(body);
    paintAdmin(body);
    return box;
  }

  function codeForm(onCode, btnText) {
    var f = el('form', 'mb-code');
    var inp = el('input'); inp.inputMode = 'numeric'; inp.autocomplete = 'one-time-code'; inp.maxLength = 6; inp.placeholder = '6 位數字';
    var b = el('button', 'mb-btn primary', btnText || '驗證'); b.type = 'submit';
    var m = el('p', 'mb-form-msg err'); m.hidden = true;
    f.appendChild(inp); f.appendChild(b); f.appendChild(m);
    f.onsubmit = async function (ev) {
      ev.preventDefault();
      b.disabled = true; m.hidden = true;
      var r;
      try { r = await onCode(inp.value); } catch (e) { r = { error: '連不上會員伺服器，請稍後再試。' }; }
      b.disabled = false;
      if (r && r.error) { m.textContent = r.error; m.hidden = false; inp.select(); }
    };
    setTimeout(function () { inp.focus(); }, 0);
    return f;
  }

  async function paintAdmin(body) {
    var st;
    try { st = await A.mfaStatus(); } catch (e) { st = { error: '連不上會員伺服器，請稍後再試。' }; }
    body.textContent = '';
    if (st.error) { body.appendChild(el('p', 'mb-form-msg err', st.error)); return; }

    if (st.level === 'aal2') {
      var ok = false;
      try { ok = await A.isAdmin(); } catch (e) {}
      body.appendChild(el('p', 'mb-sub', ok
        ? '✓ 這次登入已通過兩步驟驗證，管理員權限已啟用。'
        : '已通過兩步驟驗證，但資料庫沒有確認你的管理員權限。請確認 002 的 SQL 已執行。'));
      if (ok) {
        // 「前往管理後台」放在最下面登出按鈕的左邊
        var go = el('a', 'mb-btn primary mb-go-admin', '前往管理後台'); go.href = (window.BASE || '') + '/admin/';
        var acts = card.querySelector('.mb-acts'), old = card.querySelector('.mb-go-admin');
        if (old) old.remove();
        if (acts) { acts.insertBefore(go, acts.firstChild); acts.classList.add('has-admin'); } else body.appendChild(go);
      }
      return;
    }

    if (st.verified.length) {
      body.appendChild(el('p', 'mb-sub', '請輸入驗證 App 上的 6 位數字，通過後這次登入才有管理員權限。'));
      body.appendChild(codeForm(async function (code) {
        var r = await A.mfaVerify(st.verified[0].id, code);
        if (!r.error) paintAdmin(body);
        return r;
      }));
      return;
    }

    body.appendChild(el('p', 'mb-sub', '管理員必須設定兩步驟驗證。請先在手機安裝 Google Authenticator 之類的驗證 App。'));
    var start = el('button', 'mb-btn primary', '開始設定');
    start.type = 'button';
    start.onclick = async function () {
      start.disabled = true;
      var r;
      try { r = await A.mfaEnroll(); } catch (e) { r = { error: '連不上會員伺服器，請稍後再試。' }; }
      if (r.error) { start.disabled = false; body.appendChild(el('p', 'mb-form-msg err', r.error)); return; }
      body.textContent = '';
      body.appendChild(el('p', 'mb-sub', '1. 用驗證 App 掃描這個 QR code：'));
      var img = el('img', 'mb-qr'); img.alt = '兩步驟驗證 QR code';
      if (/^data:image\/svg\+xml/.test(r.qr)) img.src = r.qr;
      body.appendChild(img);
      body.appendChild(el('p', 'mb-sub', '無法掃描時，手動輸入這串金鑰：'));
      body.appendChild(el('code', 'mb-secret', r.secret));
      body.appendChild(el('p', 'mb-sub', '2. 輸入 App 上顯示的 6 位數字完成設定：'));
      body.appendChild(codeForm(async function (code) {
        var v = await A.mfaVerify(r.factorId, code);
        if (!v.error) paintAdmin(body);
        return v;
      }, '完成設定'));
    };
    body.appendChild(start);
  }

  async function login() {
    if (busy || !A) return;
    busy = true; setNote('正在前往 Google…');
    var b = card.querySelector('.mb-login'); if (b) b.disabled = true;
    var r = await A.signInWithGoogle('/member/');
    if (r.error) { busy = false; setNote(r.error, true); if (b) b.disabled = false; }
  }

  async function logout() {
    if (busy || !A) return;
    busy = true;
    var b = card.querySelector('.mb-logout'); if (b) b.disabled = true;
    var r = await A.signOut();
    busy = false;
    if (r.error) { setNote(r.error, true); if (b) b.disabled = false; return; }
    setNote('已登出。書櫃留在這台裝置，不受影響。');
    renderGuest();
  }

  async function deleteAccount() {
    if (busy || !A) return;
    var t = prompt('刪除帳號後，你的個人資料、留言、私訊、收藏和書籤都會永久刪除，無法復原。\n\n確定要刪除，請輸入「刪除」兩個字：');
    if (t === null) return;
    if (t.trim() !== '刪除') { setNote('沒有刪除。要刪除帳號，請輸入「刪除」兩個字。', true); return; }
    busy = true;
    var b = card.querySelector('.mb-del'); if (b) b.disabled = true;
    var res;
    try { res = await A.getClient().rpc('delete_my_account'); } catch (e) { res = { error: e }; }
    if (res && res.error) {
      busy = false; if (b) b.disabled = false;
      var m = String(res.error.message || '');
      setNote(m.indexOf('WB_BANNED') >= 0 ? '這個帳號已被封鎖，無法自行刪除。如有疑問請私訊 @weibe.ifen。'
        : m.indexOf('WB_ADMIN_CANNOT_DELETE') >= 0 ? '管理員帳號不能在這裡刪除。'
        : '刪除失敗，請稍後再試。', true);
      return;
    }
    try { await A.signOut(); } catch (e) {}
    try { localStorage.removeItem(ME_KEY); } catch (e) {}
    busy = false;
    renderGuest();
    setNote('帳號已刪除。謝謝你來讀過這些故事。書櫃（閱讀紀錄）是存在這台裝置上的，不受影響。');
  }

  async function logoutAll() {
    if (busy || !A) return;
    busy = true;
    var b = card.querySelector('.mb-logout'); if (b) b.disabled = true;
    var r = await A.signOutAll();
    busy = false;
    if (r.error) { setNote(r.error, true); if (b) b.disabled = false; return; }
    setNote('已登出所有裝置。書櫃留在這台裝置，不受影響。');
    renderGuest();
  }

  // 從 Google 頁按「上一頁」回來時，頁面可能從快取還原：重設按鈕狀態
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && busy) { busy = false; setNote(''); var b = card.querySelector('.mb-login'); if (b) b.disabled = false; }
  });

  async function init() {
    var lp = localProfile();
    if (lp) renderMember(lp, null, null); else renderGuest();

    if (!A) { setNote('登入功能暫時無法使用（登入程式沒有載入），書櫃仍可正常查看。', true); return; }
    var problem = A.configProblem();
    if (problem) { setNote(problem, true); renderGuest(); return; }
    if (!lp) return; // 訪客：不需要連伺服器

    // 有本機登入資料：向伺服器確認仍然有效
    var v;
    try { v = await A.getVerifiedUser(); } catch (e) { v = { user: null, error: '連不上會員伺服器，以下是這台裝置上次的登入資料。' }; }
    if (v.user) {
      var role = null, prof = null;
      try { role = await A.getRole(); } catch (e) {}
      try {
        var pr = await A.getMyProfile();
        prof = pr.profile;
        if (pr.error) setNote(pr.error, true);
      } catch (e) { setNote('讀取個人資料失敗，請重新整理。', true); }
      renderMember(v.user, prof, role);
      return;
    }
    if (v.error) { setNote(v.error, true); return; } // 網路問題：保留畫面，不強制登出
    // 伺服器確認登入已失效：清掉本機登入資料
    try { await A.signOut(); } catch (e) {}
    setNote('登入已過期，請重新登入。');
    renderGuest();
  }

  if (A) {
    A.onChange(function (event, p) {
      if (event === 'SIGNED_OUT') renderGuest();
    });
  }
  init();
})();
