// V1.0 S07（Q30、Q36）：章節頁專用。目錄預設收合，第一次展開才下載 posts.json；目前這篇標示出來
(function () {
  var t = document.querySelector('.r-toc'); if (!t) return;
  var list = t.querySelector('.r-toc-list'), done = false;
  t.addEventListener('toggle', function () {
    if (!t.open || done) return; done = true;
    list.innerHTML = '<li class="r-toc-wait">載入中…</li>';
    fetch((window.BASE || '') + '/assets/posts.json?v=' + (window.VER || '')).then(function (r) { return r.json(); }).then(function (all) {
      var n = t.dataset.novel, split = t.dataset.split === '1', here = location.pathname.replace(/index\.html$/, '');
      var rows = Object.keys(all).map(function (k) { return all[k]; }).filter(function (p) { return p.n === n; });
      rows.sort(split ? function (a, b) { return a.d - b.d; } : function (a, b) { return a.ch - b.ch || a.d - b.d; });
      list.innerHTML = '';
      rows.forEach(function (p) {
        var li = document.createElement('li'), a = document.createElement('a');
        a.href = (window.BASE || '') + p.u; a.textContent = p.t;
        var no = document.createElement('small'); no.textContent = '第 ' + p.ch + ' 篇'; a.prepend(no);
        if (p.u === here) { a.setAttribute('aria-current', 'page'); li.className = 'on'; }
        li.appendChild(a); list.appendChild(li);
      });
      var cur = list.querySelector('.on'); if (cur) cur.scrollIntoView({ block: 'nearest' });
    }).catch(function () { list.innerHTML = '<li class="r-toc-wait">目錄載入失敗，請稍後再試</li>'; done = false; });
  });
})();
