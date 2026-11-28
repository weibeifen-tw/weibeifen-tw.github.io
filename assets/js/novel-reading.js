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

// Chapter-only reading persistence; shared typography and theme stay in app.js.
(function () {
  var sec = document.querySelector('.chapter.read');
  if (!sec) return;
  if (sec && sec.dataset.novel) {
    var rec = JSON.stringify({ url: location.pathname, no: sec.dataset.no, title: sec.dataset.title, char: sec.dataset.char, t: Date.now() });
    window.WBReadingStore.write('last', sec.dataset.novel, rec);
    window.WBReadingStore.write('last', sec.dataset.novel + ':' + sec.dataset.char, rec);
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
      window.WBReadingStore.write('pos', pk.slice(7), String(Math.round(p * 1000) / 1000));
      if (p >= 0.9) window.WBReadingStore.write('read', rk.slice(8), '1');
    }
    var tm = null;
    addEventListener('scroll', function () { clearTimeout(tm); tm = setTimeout(keep, 300); }, { passive: true });
    addEventListener('pagehide', keep);
    document.addEventListener('visibilitychange', function () { if (document.hidden) keep(); });
    var old = 0; try { old = parseFloat(window.WBReadingStore.read('pos', pk.slice(7))) || 0; } catch (e) {}
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
    // A saved member position may become available only after async identity verification.
    // Never auto-jump after the reader has already started scrolling.
    window.WBReadingStore.onChange(function () {
      if (location.hash || scrollY > 20) return;
      var p = parseFloat(window.WBReadingStore.read('pos', pk.slice(7))) || 0;
      if (!(p > 0.03 && p < 0.97)) return;
      var existing = document.querySelector('.resume');
      if (existing) existing.remove();
      var t = document.createElement('div'); t.className = 'resume';
      t.textContent = '找到上次閱讀位置';
      var button = document.createElement('button'); button.type = 'button';
      button.textContent = '回到位置';
      button.onclick = function () {
        var rect = txt.getBoundingClientRect(), height = rect.height - innerHeight * 0.5;
        scrollTo(0, scrollY + rect.top - innerHeight * 0.5 + p * height);
        t.remove();
      };
      t.appendChild(button); document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.remove(); }, 8000);
    });
  }
})();

