/*
 * 未備份｜會員入口與會員頁
 *
 * 1. 全站（首頁限動列、左側選單）：只讀瀏覽器裡的登入資料，把「我的帳號」換成頭像。
 *    這部分不載入 Supabase SDK、不連網，只做顯示；真正的驗證在 /member/ 進行。
 * 2. /member/：顯示訪客或會員畫面、Google 登入、登出、管理員標籤。
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
      avatar: m.avatar_url || m.picture || '',
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

  function paintEntries(p) {
    document.querySelectorAll('[data-member-avatar]').forEach(function (b) { paintAvatar(b, p); });
    document.querySelectorAll('[data-member-entry]').forEach(function (a) { a.classList.toggle('signed-in', !!p); });
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

  function renderMember(p, isAdmin) {
    card.textContent = '';
    var head = el('div', 'mb-head');
    var av = el('span', 'avatar mb-av'); paintAvatar(av, p); head.appendChild(av);
    var who = el('div', 'mb-who');
    var nm = el('h1', 'mb-title', p.name);
    if (isAdmin) nm.appendChild(el('span', 'mb-badge', '管理員'));
    who.appendChild(nm);
    who.appendChild(el('p', 'mb-sub', p.email));
    head.appendChild(who);
    card.appendChild(head);

    var dl = el('dl', 'mb-info');
    function row(k, v) { dl.appendChild(el('dt', null, k)); var dd = el('dd', null, v); dl.appendChild(dd); return dd; }
    row('登入方式', p.provider === 'google' ? 'Google' : (p.provider || '—'));
    var idd = row('會員 ID', p.id);
    idd.classList.add('mb-id');
    card.appendChild(dl);

    var out = el('button', 'mb-btn mb-logout', '登出');
    out.type = 'button';
    out.onclick = logout;
    card.appendChild(out);
    if (future) future.hidden = false;
    paintEntries(p);
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

  // 從 Google 頁按「上一頁」回來時，頁面可能從快取還原：重設按鈕狀態
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && busy) { busy = false; setNote(''); var b = card.querySelector('.mb-login'); if (b) b.disabled = false; }
  });

  async function init() {
    var lp = localProfile();
    if (lp) renderMember(lp, false); else renderGuest();

    if (!A) { setNote('登入功能暫時無法使用（登入程式沒有載入），書櫃仍可正常查看。', true); return; }
    var problem = A.configProblem();
    if (problem) { setNote(problem, true); renderGuest(); return; }
    if (!lp) return; // 訪客：不需要連伺服器

    // 有本機登入資料：向伺服器確認仍然有效
    var v;
    try { v = await A.getVerifiedUser(); } catch (e) { v = { user: null, error: '連不上會員伺服器，以下是這台裝置上次的登入資料。' }; }
    if (v.user) {
      var role = null;
      try { role = await A.getRole(); } catch (e) {}
      renderMember(v.user, role === 'admin');
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
