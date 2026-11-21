// 未備份研究所：研究文章頁專用（原住民族專區 DEV-03；其他分類只會用到目錄與註腳）
//   1. 目錄：手機預設收合，電腦展開
//   2. 研究證據：點正文的證據標記 → 手機底部面板／電腦側邊面板（沒 JS 時照樣跳到文末清單）
//   3. 註腳：跳轉後短暫標示目的地
//   4. 歷史版本：與現行版比較（段落 LCS＋段內字元 LCS，在瀏覽器計算）
(function () {
  // 1. 目錄
  var toc = document.querySelector('.lit-toc');
  if (toc && window.matchMedia && matchMedia('(max-width:767px)').matches) toc.open = false;
  if (toc) toc.addEventListener('click', function (e) { if (e.target.closest('a') && window.matchMedia && matchMedia('(max-width:767px)').matches) toc.open = false; });

  // 3. 註腳、證據清單：跳轉後標示
  function flash(el) { if (!el) return; el.classList.remove('lit-flash'); void el.offsetWidth; el.classList.add('lit-flash'); }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a.footnote, a.reversefootnote, .cite a'); if (!a) return;
    var id = decodeURIComponent((a.getAttribute('href') || '').slice(1)), t = id && document.getElementById(id);
    if (t) setTimeout(function () { flash(t.closest('li, p, sup') || t); }, 30);
  });

  // 2. 研究證據面板
  var panel = document.getElementById('ev-panel');
  if (panel) {
    var body = panel.querySelector('.ev-panel-body'), last = null;
    function close() { if (panel.hidden) return; panel.hidden = true; document.body.classList.remove('ev-open'); if (last) last.focus(); }
    function open(id, from) {
      var card = document.getElementById('ev-' + id); if (!card) return false;
      body.innerHTML = card.innerHTML; body.querySelectorAll('[id]').forEach(function (x) { x.removeAttribute('id'); });
      var more = document.createElement('a'); more.href = '#ev-' + id; more.className = 'ev-more'; more.textContent = '在文末證據清單查看';
      more.onclick = function () { close(); setTimeout(function () { flash(card); }, 30); };
      body.appendChild(more);
      last = from; panel.hidden = false; document.body.classList.add('ev-open'); panel.querySelector('.ev-x').focus();
      return true;
    }
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-ev]'); if (!a) return;
      if (open(a.dataset.ev, a)) e.preventDefault();
    });
    panel.querySelector('.ev-x').onclick = close;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  // 4. 歷史版本比較
  var art = document.querySelector('.lit-old'), go = document.querySelector('.lit-cmp-go');
  if (!art || !go) return;
  var out = document.querySelector('.lit-cmp-out');
  function blocks(root) {
    var c = root.cloneNode(true);
    c.querySelectorAll('.ev-ref, sup.footnote, .footnotes, script').forEach(function (x) { x.remove(); });
    var bs = []; c.querySelectorAll('h2, h3, h4, p, li, blockquote, td, th').forEach(function (el) {
      if (el.querySelector('p, li')) return; var t = el.textContent.replace(/\s+/g, ' ').trim(); if (t) bs.push(t);
    });
    return bs;
  }
  function lcs(a, b, eq) { // 回傳 [['=',x]|['-',x]|['+',y]]
    var n = a.length, m = b.length, w = m + 1, d = new Uint32Array((n + 1) * w), i, j;
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) d[i * w + j] = eq(a[i], b[j]) ? d[(i + 1) * w + j + 1] + 1 : Math.max(d[(i + 1) * w + j], d[i * w + j + 1]);
    var r = []; i = 0; j = 0;
    while (i < n && j < m) { if (eq(a[i], b[j])) { r.push(['=', a[i]]); i++; j++; } else if (d[(i + 1) * w + j] >= d[i * w + j + 1]) r.push(['-', a[i++]]); else r.push(['+', b[j++]]); }
    while (i < n) r.push(['-', a[i++]]); while (j < m) r.push(['+', b[j++]]);
    return r;
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function chars(a, b) {
    if (a.length * b.length > 4e6) return '<del>' + esc(a) + '</del><ins>' + esc(b) + '</ins>';
    return lcs(Array.from(a), Array.from(b), function (x, y) { return x === y; }).map(function (p) {
      return p[0] === '=' ? esc(p[1]) : p[0] === '-' ? '<del>' + esc(p[1]) + '</del>' : '<ins>' + esc(p[1]) + '</ins>';
    }).join('').replace(/<\/del><del>/g, '').replace(/<\/ins><ins>/g, '');
  }
  function render(oldB, curB) {
    var ops = lcs(oldB, curB, function (x, y) { return x === y; }), h = [], same = 0, k;
    for (k = 0; k < ops.length; k++) {
      var o = ops[k];
      if (o[0] === '=') { same++; continue; }
      if (same) { h.push('<p class="cmp-same">（相同 ' + same + ' 段）</p>'); same = 0; }
      if (o[0] === '-' && ops[k + 1] && ops[k + 1][0] === '+') { h.push('<p class="cmp-chg">' + chars(o[1], ops[k + 1][1]) + '</p>'); k++; }
      else if (o[0] === '-') h.push('<p class="cmp-del"><del>' + esc(o[1]) + '</del></p>');
      else h.push('<p class="cmp-add"><ins>' + esc(o[1]) + '</ins></p>');
    }
    if (same) h.push('<p class="cmp-same">（相同 ' + same + ' 段）</p>');
    out.innerHTML = h.length && h.some(function (x) { return x.indexOf('cmp-same') < 0; }) ? h.join('') : '<p class="cmp-same">正文沒有差異。</p>';
  }
  go.onclick = function () {
    go.disabled = true; out.textContent = '比較中…';
    fetch(art.dataset.current).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html'), cb = doc.querySelector('.lit-body');
      if (!cb) throw new Error('no body');
      render(blocks(art.querySelector('.lit-body')), blocks(cb)); go.disabled = false;
    }).catch(function () { out.textContent = '現行版本讀取失敗，請稍後再試。'; go.disabled = false; });
  };
  if (location.hash === '#compare') go.click();
})();
