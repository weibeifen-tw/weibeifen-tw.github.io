// 作品介紹貼文：多張圖左右滑，下方圓點
(function () {
  document.querySelectorAll('.intro-post, .nv-gallery').forEach(function (p) {
    var sl = p.querySelector('.ip-slides'), dots = p.querySelectorAll('.ip-dots i'); if (!sl) return;
    // V1.0 S12：延後下載的第 2、3 張（data-src）——讀者一碰輪播、或整頁載完後空檔，才開始載
    var rest = function () { sl.querySelectorAll('img[data-src]').forEach(function (im) { im.src = im.dataset.src; im.removeAttribute('data-src'); }); rest = function () {}; };
    ['pointerdown', 'touchstart', 'scroll', 'focusin'].forEach(function (ev) { sl.addEventListener(ev, function () { rest(); }, { once: true, passive: true }); });
    dots.forEach(function (d) { d.addEventListener('click', function () { rest(); }); });
    // V2.09: only prepare deferred slides near the viewport, or immediately on interaction.
    if (sl.querySelector('img[data-src]')) {
      if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
          if (entries.some(function (entry) { return entry.isIntersecting; })) { observer.disconnect(); rest(); }
        }, { rootMargin: '160px' });
        observer.observe(sl);
      } else {
        var later = function () { if (window.requestIdleCallback) window.requestIdleCallback(function () { rest(); }, { timeout: 2500 }); else setTimeout(function () { rest(); }, 0); };
        if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
      }
    }
    function go(k) { sl.scrollTo({ left: k * sl.clientWidth, behavior: 'smooth' }); }
    dots.forEach(function (d, i) { d.onclick = function () { go(i); }; });
    sl.onclick = function (e) { var r = sl.getBoundingClientRect(), k = Math.round(sl.scrollLeft / sl.clientWidth); go(e.clientX - r.left > r.width / 2 ? Math.min(k + 1, dots.length - 1) : Math.max(k - 1, 0)); };
    sl.addEventListener('scroll', function () { var k = Math.round(sl.scrollLeft / sl.clientWidth); dots.forEach(function (d, i) { d.classList.toggle('on', i === k); }); }, { passive: true });
  });
})();

// 作品貼文：點人像圖示顯示／收起標註的角色
document.querySelectorAll('.ip-tagbtn').forEach(function (b) {
  var t = b.parentNode.querySelector('.ip-tags');
  b.onclick = function (e) { e.stopPropagation(); t.hidden = !t.hidden; b.setAttribute('aria-expanded', !t.hidden); };
});

