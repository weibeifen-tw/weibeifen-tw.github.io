// 限動檢視器（山海有痕起）：作品限動、角色專屬限動。
// 只在有限動的作品頁載入；大圖點了才載入，不預載。純圖，不記錄觀看、不送任何資料。
(function () {
  var box = document.querySelector('.sv'); if (!box) return;
  var img = box.querySelector('.sv-img'), bars = box.querySelector('.sv-bars');
  var list = [], k = 0, timer = null, opener = null, DUR = 6000;
  function show(i) {
    if (i < 0) i = 0;
    if (i >= list.length) { close(); return; }
    k = i; img.src = list[k][0]; img.alt = list[k][1] || '';
    Array.prototype.forEach.call(bars.children, function (b, j) { b.className = j < k ? 'done' : (j === k ? 'on' : ''); });
    clearTimeout(timer); timer = setTimeout(function () { show(k + 1); }, DUR);
  }
  function open(btn) {
    list = (btn.dataset.sv || '').split('^').map(function (s) { return s.split('|'); }).filter(function (x) { return x[0]; });
    if (!list.length) return;
    opener = btn; bars.innerHTML = '';
    list.forEach(function () { var b = document.createElement('i'); b.appendChild(document.createElement('b')); bars.appendChild(b); });
    box.style.setProperty('--sv-dur', DUR + 'ms');
    box.hidden = false; document.body.classList.add('lock'); show(0); box.querySelector('.sv-x').focus();
  }
  function close() {
    clearTimeout(timer); box.hidden = true; img.removeAttribute('src'); document.body.classList.remove('lock');
    if (opener) opener.focus();
  }
  document.querySelectorAll('.sv-open').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); open(b); }); });
  box.querySelector('.sv-x').onclick = close;
  box.querySelector('.sv-prev').onclick = function () { show(k - 1); };
  box.querySelector('.sv-next').onclick = function () { show(k + 1); };
  box.addEventListener('click', function (e) { if (e.target === box) close(); });
  document.addEventListener('keydown', function (e) {
    if (box.hidden) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') show(k + 1); else if (e.key === 'ArrowLeft') show(k - 1);
  });
})();
