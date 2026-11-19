/*
 * 未備份｜會員登入模組（Supabase Auth v2，Google OAuth，PKCE）
 *
 * 流程：
 *   1. signInWithGoogle()：把「登入前所在頁面」存進 sessionStorage，
 *      SDK 產生 code_verifier 存進 localStorage，帶 code_challenge 跳去 Google。
 *   2. Google → Supabase → 導回 /auth/callback/?code=...
 *   3. handleCallback()：用 code + 同一個瀏覽器裡的 code_verifier 換 session，
 *      成功後只會回到本站內的路徑（拒絕外部網址）。
 *
 * 注意：這裡的登入狀態只用來「顯示」。任何會員專屬資料的權限，
 * 之後都必須由 Supabase RLS 在伺服器端判斷，不能只靠這支前端程式。
 *
 * 不會讀寫既有的 wb: / wb- 開頭的 localStorage（書櫃、閱讀紀錄、字級、夜間模式）。
 * SDK 自己使用的 key 是 sb-<project>-auth-token 與 sb-<project>-auth-token-code-verifier。
 */
(function () {
  'use strict';

  var cfg = window.WB_AUTH_CONFIG || {};
  var CALLBACK_PATH = cfg.callbackPath || '/auth/callback/';
  var RETURN_KEY = 'wb-auth-return'; // sessionStorage，只在這個分頁有效
  var client = null;

  /* ---------- 金鑰檢查：只接受可公開的金鑰 ---------- */
  function keyProblem(key) {
    if (!key) return '尚未設定 Supabase Publishable Key。';
    if (/^sb_secret_/.test(key)) return '偵測到 Secret Key，前端禁止使用，已停止運作。';
    if (/^sb_publishable_/.test(key)) return null;
    // 舊版 anon key（JWT）：解開 payload 確認 role 是 anon
    var parts = key.split('.');
    if (parts.length === 3) {
      try {
        var b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b.length % 4) b += '=';
        var payload = JSON.parse(atob(b));
        if (payload.role === 'anon') return null;
        return '這把金鑰的 role 是「' + payload.role + '」，不是可公開的 anon，已停止運作。';
      } catch (e) { /* fallthrough */ }
    }
    return '無法辨識的金鑰格式，只接受 sb_publishable_ 開頭的 Publishable Key。';
  }

  /* ---------- 返回網址：只允許本站內路徑 ---------- */
  function safeReturnPath(raw) {
    if (typeof raw !== 'string' || raw === '') return '/';
    // 必須是 "/" 開頭的相對路徑；擋 "//evil.com"、"/\evil.com"、控制字元
    if (raw.charAt(0) !== '/' || raw.charAt(1) === '/' || raw.charAt(1) === '\\') return '/';
    if (/[\u0000-\u001f\u007f\\]/.test(raw)) return '/';
    var base = (typeof location !== 'undefined' && location.origin) || cfg.siteOrigin;
    var u;
    try { u = new URL(raw, base); } catch (e) { return '/'; }
    if (u.origin !== base) return '/';
    if (u.pathname.indexOf(CALLBACK_PATH) === 0) return '/';
    return u.pathname + u.search + u.hash;
  }

  function currentPath() {
    return location.pathname + location.search + location.hash;
  }

  /* ---------- 錯誤訊息（中文、給讀者看） ---------- */
  function describeError(err) {
    if (!err) return '發生未知錯誤，請再試一次。';
    var name = err.name || '';
    var code = err.code || err.error || '';
    var msg = err.message || err.error_description || '';
    if (code === 'access_denied' || /access[_ ]denied|cancel/i.test(msg)) {
      return '你取消了 Google 登入，沒有關係，隨時可以再登入。';
    }
    if (name === 'AuthPKCECodeVerifierMissingError' || /code verifier/i.test(msg)) {
      return '登入驗證資料不見了。請在同一個瀏覽器、同一個網址（weibeifen.com）重新登入，不要在登入途中換瀏覽器或用無痕視窗切換。';
    }
    if (code === 'flow_state_expired' || code === 'flow_state_not_found' || /flow state|expired/i.test(msg)) {
      return '這次登入已經過期或用過了，請重新登入一次。';
    }
    if (/fetch|network/i.test(msg)) {
      return '連不上會員伺服器，請檢查網路後再試一次。';
    }
    return '登入失敗：' + (msg || code || name || '未知錯誤') + '。請再試一次。';
  }

  /* ---------- Supabase client（單例） ---------- */
  function getClient() {
    if (client) return client;
    var p = keyProblem(cfg.publishableKey);
    if (p) throw new Error(p);
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase SDK 沒有載入成功（可能是網路問題或檔案雜湊不符）。');
    }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.publishableKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false, // 只有 callback 頁會手動交換授權碼
        persistSession: true,      // 重新整理後保持登入
        autoRefreshToken: true
      }
    });
    return client;
  }

  function configProblem() {
    var p = keyProblem(cfg.publishableKey);
    if (p) return p;
    if (cfg.siteOrigin && location.origin !== cfg.siteOrigin) {
      return '請從 ' + cfg.siteOrigin + ' 登入（目前網址 ' + location.origin + ' 不在登入白名單內）。';
    }
    return null;
  }

  /* ---------- 公開 API ---------- */
  async function signInWithGoogle(returnTo) {
    var p = configProblem();
    if (p) return { error: p };
    try { sessionStorage.setItem(RETURN_KEY, safeReturnPath(returnTo || currentPath())); } catch (e) {}
    try {
      var res = await getClient().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: cfg.siteOrigin + CALLBACK_PATH,
          queryParams: { prompt: 'select_account' }
        }
      });
      if (res.error) return { error: describeError(res.error) };
      return { error: null }; // 瀏覽器會自動跳轉到 Google
    } catch (e) {
      return { error: describeError(e) };
    }
  }

  function readParams() {
    var q = new URLSearchParams(location.search);
    var h = new URLSearchParams(location.hash.replace(/^#/, ''));
    function get(k) { return q.get(k) || h.get(k); }
    return {
      code: q.get('code'),
      error: get('error'),
      errorCode: get('error_code'),
      errorDescription: get('error_description')
    };
  }

  function takeReturnPath() {
    var r = '/';
    try { r = sessionStorage.getItem(RETURN_KEY) || '/'; sessionStorage.removeItem(RETURN_KEY); } catch (e) {}
    return safeReturnPath(r);
  }

  function peekReturnPath() {
    try { return safeReturnPath(sessionStorage.getItem(RETURN_KEY) || '/'); } catch (e) { return '/'; }
  }

  async function handleCallback() {
    var prm = readParams();
    // 先把授權碼 / 錯誤從網址列移除，避免被複製、記錄或留在瀏覽紀錄
    try { history.replaceState(null, '', location.pathname); } catch (e) {}

    if (prm.error || prm.errorCode || prm.errorDescription) {
      var cancelled = prm.error === 'access_denied';
      return {
        ok: false,
        cancelled: cancelled,
        message: describeError({ error: prm.error, code: prm.errorCode, message: prm.errorDescription }),
        returnTo: peekReturnPath()
      };
    }
    if (!prm.code) {
      return { ok: false, message: '網址裡沒有登入授權碼，請從網站上的登入按鈕重新登入。', returnTo: peekReturnPath() };
    }
    var p = configProblem();
    if (p) return { ok: false, message: p, returnTo: peekReturnPath() };
    try {
      var res = await getClient().auth.exchangeCodeForSession(prm.code);
      if (res.error) return { ok: false, message: describeError(res.error), returnTo: peekReturnPath() };
      return { ok: true, returnTo: takeReturnPath() };
    } catch (e) {
      return { ok: false, message: describeError(e), returnTo: peekReturnPath() };
    }
  }

  function toProfile(user) {
    if (!user) return null;
    var m = user.user_metadata || {};
    return {
      id: user.id,
      email: user.email || '',
      name: m.full_name || m.name || (user.email ? user.email.split('@')[0] : '讀者'),
      avatar: m.avatar_url || m.picture || '',
      provider: (user.app_metadata && user.app_metadata.provider) || ''
    };
  }

  // 本機 session（快，離線也可）——只拿來顯示
  async function getSession() {
    if (configProblem()) return null;
    var res = await getClient().auth.getSession();
    return (res.data && res.data.session) || null;
  }

  // 向 Supabase 伺服器確認目前使用者（JWT 有效才會回傳）
  async function getVerifiedUser() {
    if (configProblem()) return { user: null, error: configProblem() };
    var res = await getClient().auth.getUser();
    if (res.error) {
      var e = res.error;
      // 沒有登入、或伺服器明確拒絕（token 失效／被撤銷）→ 視為未登入
      if (e.name === 'AuthSessionMissingError' || e.status === 400 || e.status === 401 || e.status === 403) {
        return { user: null, error: null, expired: e.name !== 'AuthSessionMissingError' };
      }
      // 其他（多半是網路問題）→ 回報錯誤，不當成登出
      return { user: null, error: describeError(e) };
    }
    return { user: toProfile(res.data.user), error: null };
  }

  // 讀取自己的角色（public.user_roles，受 RLS 保護：只能讀到自己那一列）。
  // 這個結果只用來「顯示」管理員標籤；任何管理動作都必須在資料庫端用 is_admin() 檢查。
  // 資料表還沒建立、沒有那一列、或讀取失敗 → 一律回傳 null（一般會員）。
  async function getRole() {
    if (configProblem()) return null;
    var c = getClient();
    var s = await c.auth.getSession();
    var uid = s.data && s.data.session && s.data.session.user && s.data.session.user.id;
    if (!uid) return null;
    var res = await c.from('user_roles').select('role').eq('user_id', uid).maybeSingle();
    if (res.error || !res.data) return null;
    return res.data.role === 'admin' ? 'admin' : null;
  }

  async function signOut() {
    if (configProblem()) return { error: configProblem() };
    var res = await getClient().auth.signOut({ scope: 'local' }); // 只登出這台裝置
    return { error: res.error ? describeError(res.error) : null };
  }

  function onChange(cb) {
    if (configProblem()) return function () {};
    var sub = getClient().auth.onAuthStateChange(function (event, session) {
      // 不在 callback 裡 await 其他 Supabase 呼叫，避免 SDK 鎖死
      setTimeout(function () { cb(event, session ? toProfile(session.user) : null); }, 0);
    });
    return function () { sub.data.subscription.unsubscribe(); };
  }

  window.WBAuth = {
    signInWithGoogle: signInWithGoogle,
    handleCallback: handleCallback,
    signOut: signOut,
    getSession: getSession,
    getVerifiedUser: getVerifiedUser,
    getRole: getRole,
    onChange: onChange,
    toProfile: toProfile,
    configProblem: configProblem,
    // 供測試用
    _getClient: getClient,
    _safeReturnPath: safeReturnPath,
    _keyProblem: keyProblem,
    _describeError: describeError
  };
})();
