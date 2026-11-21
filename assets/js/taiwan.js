// V1.0 S08（D04）：臺灣故事頁專用。縣市列可點開／收合；電腦地圖點縣市＝打開那一列並標示
(function () {
  var wrap = document.querySelector('.cty'); if (!wrap) return;
  function row(k) { return document.getElementById('cty-' + k); }
  function open(k, on, scroll) {
    var r = row(k); if (!r) return; var b = r.querySelector('.cty-btn'), u = r.querySelector('.cty-novels');
    if (b.getAttribute('aria-disabled') === 'true') on = false;
    b.setAttribute('aria-expanded', on ? 'true' : 'false'); if (u) u.hidden = !on; r.classList.toggle('on', on);
    var a = wrap.querySelector('.cty-a[data-k="' + k + '"]'); if (a) a.classList.toggle('on', on);
    if (on && scroll) r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function only(k, scroll) { [].forEach.call(wrap.querySelectorAll('.cty-row.on'), function (r) { if (r.dataset.k !== k) open(r.dataset.k, false); }); open(k, true, scroll); }
  [].forEach.call(wrap.querySelectorAll('.cty-btn'), function (b) {
    b.addEventListener('click', function () { var k = b.parentNode.dataset.k; if (b.getAttribute('aria-expanded') === 'true') open(k, false); else only(k, false); });
  });
  [].forEach.call(wrap.querySelectorAll('.cty-a'), function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); only(a.dataset.k, true); var b = row(a.dataset.k).querySelector('.cty-btn'); if (b) b.focus({ preventScroll: true }); });
  });
  var h = location.hash.replace('#cty-', ''); if (h && row(h)) only(h, true);
})();
