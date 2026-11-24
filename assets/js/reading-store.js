/* P3-01 T03-R01: scoped browser reading history; unowned legacy keys are never imported. */
(function () {
  'use strict';
  var SESSION = 'sb-tqicconarhpddejxdvmf-auth-token';
  var PREFIX = 'wb:v2:';
  var state = 'guest', uid = null, version = 0;
  var pending = [], listeners = [], candidateUid = null;
  var UID_RE = /^[a-zA-Z0-9_-]{8,100}$/;
  function sessionUid() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION) || 'null');
      if (!s || !(s.refresh_token || (s.currentSession && s.currentSession.refresh_token))) return null;
      var id = (s.user || (s.currentSession && s.currentSession.user) || {}).id;
      return UID_RE.test(String(id || '')) ? String(id) : null;
    } catch (e) { return null; }
  }
  function hasSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION) || 'null');
      return !!(s && (s.refresh_token || (s.currentSession && s.currentSession.refresh_token)));
    } catch (e) { return false; }
  }
  if (hasSession()) { state = 'unknown'; candidateUid = sessionUid(); }
  function scope() {
    // The JS state may lag behind a same-tab auth update; never expose the previous owner.
    if (state === 'member' && sessionUid() !== uid) return null;
    if (state === 'guest' && hasSession()) return null;
    return state === 'member' ? 'member:' + uid + ':' : state === 'guest' ? 'guest:' : null;
  }
  function key(type, id) {
    if (!/^(last|pos|read)$/.test(type) || typeof id !== 'string' || !id || id.length > 350) return null;
    var s = scope(); return s ? PREFIX + s + type + ':' + id : null;
  }
  function read(type, id) {
    var k = key(type, id);
    if (!k) return null;
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function write(type, id, value) {
    var k = key(type, id);
    if (!k) {
      // Unknown-session writes are temporary and never reassigned to a later login.
      if (state === 'unknown' && pending.length < 300) pending.push({ type: type, id: id, value: String(value), version: version });
      return false;
    }
    try { localStorage.setItem(k, String(value)); return true; } catch (e) { return false; }
  }
  function listLast() {
    var out = {}, s = scope(); if (!s) return out;
    var prefix = PREFIX + s + 'last:';
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) {
          try {
            var r = JSON.parse(localStorage.getItem(k) || 'null');
            if (r && typeof r.url === 'string' && r.url.charAt(0) === '/' && r.url.charAt(1) !== '/') out[k.slice(prefix.length)] = r;
          } catch (e) {}
        }
      }
    } catch (e) {}
    return out;
  }
  function notify() {
    listeners.slice().forEach(function (fn) { try { fn(); } catch (e) {} });
  }
  function setIdentity(next, id) {
    if (next !== 'guest' && next !== 'member' && next !== 'unknown') return false;
    if (next === 'member' && (!UID_RE.test(String(id || '')) || sessionUid() !== String(id))) return false;
    id = next === 'member' ? String(id) : null;
    if (state === next && uid === id) return true;
    // Unknown-session reading belongs only to the candidate validated by the server.
    var replay = next === 'member' && candidateUid === id ?
      pending.filter(function (p) { return p.version === version; }) : [];
    state = next; uid = id; version++; pending = []; candidateUid = next === 'unknown' ? sessionUid() : null;
    replay.forEach(function (p) { write(p.type, p.id, p.value); });
    notify(); return true;
  }
  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
  }
  function clearMember(id) {
    if (!UID_RE.test(String(id || ''))) return false;
    var prefix = PREFIX + 'member:' + id + ':', keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) keys.push(k);
      }
      keys.forEach(function (k) { localStorage.removeItem(k); });
      return true;
    } catch (e) { return false; }
  }
  window.addEventListener('storage', function (e) {
    if (e.key === SESSION) setIdentity(hasSession() ? 'unknown' : 'guest');
    else if (e.key && e.key.indexOf(PREFIX) === 0) notify();
  });
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    if (!hasSession()) { setIdentity('guest'); return; }
    setIdentity('unknown');
    if (window.WBAuth && window.WBAuth.getVerifiedUser) {
      window.WBAuth.getVerifiedUser().then(function (v) {
        if (v.user && v.user.id) setIdentity('member', v.user.id);
      }).catch(function () {});
    }
  });
  window.WBReadingStore = {
    read: read, write: write, listLast: listLast,
    setIdentity: setIdentity, onChange: onChange, clearMember: clearMember,
    identity: function () {
      if (state === 'member' && sessionUid() !== uid) return { state: 'unknown', uid: null, version: version };
      if (state === 'guest' && hasSession()) return { state: 'unknown', uid: null, version: version };
      return { state: state, uid: uid, version: version };
    },
    syncKey: function () { var s = scope(); return state === 'member' ? PREFIX + s + 'sync-success' : null; },
    pendingCount: function () { return pending.length; }
  };
})();
