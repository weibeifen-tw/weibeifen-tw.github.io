// V1.0 S04（Q15）：臺灣故事頁專用，由 app.js 拆出，只在 /taiwan/ 載入
// 小說總覽的台灣地圖：滑到（手機點）一個地形區，旁邊列出那區的小說
(function () {
  var wrap = document.querySelector('.tw-wrap'); if (!wrap) return;
  var panel = wrap.querySelector('.tw-panel'), hint = panel.innerHTML;
  var novels = JSON.parse(document.getElementById('novels').textContent || '{}');
  var chars = JSON.parse(document.getElementById('chars').textContent || '{}');
  var regions = JSON.parse(document.getElementById('regions').textContent || '[]'), names = {};
  var notes = {}, places = JSON.parse((document.getElementById('places') || {}).textContent || '{}');
  regions.forEach(function (s) { (s.areas || []).forEach(function (a) { names[a.key] = a.name; notes[a.key] = a.note || ''; }); });
  function color(id) { for (var k in chars) if (chars[k].novel === id) return chars[k].color; return '#6b665c'; }
  function list(key) { return Object.keys(novels).filter(function (id) { return novels[id].region === key; }); }
  var cur = null, pinned = null;
  function show(key) {
    if (key === cur) return; cur = key;
    wrap.querySelectorAll('.tw-rg').forEach(function (r) { r.classList.toggle('on', r.dataset.rg === key); });
    panel.innerHTML = '';
    // 手機版：小說列表從底部滑出，右上角可以收起來
    var x = document.createElement('button'); x.type = 'button'; x.className = 'tw-close'; x.setAttribute('aria-label', '收起'); x.textContent = '✕';
    x.onclick = function (e) { e.stopPropagation(); wrap.classList.remove('open'); pinned = null; cur = null; wrap.querySelectorAll('.tw-rg').forEach(function (r) { r.classList.remove('on', 'pin'); }); };
    panel.appendChild(x); wrap.classList.add('open');
    var h = document.createElement('h3'); h.textContent = names[key] || ''; panel.appendChild(h);
    if (notes[key]) { var nt = document.createElement('p'); nt.className = 'tw-note'; nt.textContent = notes[key]; panel.appendChild(nt); }
    var ids = list(key);
    if (!ids.length) { var p = document.createElement('p'); p.className = 'tw-empty'; p.textContent = '這裡還沒有小說。'; panel.appendChild(p); return; }
    ids.forEach(function (id) {
      var a = document.createElement('a'); a.className = 'tw-item'; a.href = BASE + '/novel/' + id + '/'; a.style.color = color(id);
      var row = document.createElement('span'); row.className = 'tw-row';
      var b = document.createElement('b'); b.textContent = novels[id].title; row.appendChild(b);
      a.appendChild(row);
      if (novels[id].era) { var s = document.createElement('small'); s.textContent = novels[id].era; a.appendChild(s); }
      if (places[id]) { var pl = document.createElement('span'); pl.className = 'tw-place'; pl.textContent = places[id]; a.appendChild(pl); }
      panel.appendChild(a);
    });
  }
  wrap.querySelectorAll('.tw-rg').forEach(function (r) {
    if (list(r.dataset.rg).length) r.classList.add('has');
    // 還沒點選時，滑過去先預覽；點了就固定，滑到別區也不會換
    r.addEventListener('mouseenter', function () { if (!pinned) show(r.dataset.rg); });
    r.addEventListener('click', function () {
      pinned = r.dataset.rg; cur = null; show(pinned);
      wrap.querySelectorAll('.tw-rg').forEach(function (x) { x.classList.toggle('pin', x.dataset.rg === pinned); });
    });
  });
})();
