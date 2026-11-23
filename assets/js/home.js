// V1.0 S04（Q15）：首頁專用，由 app.js 拆出，只在首頁載入
// V1.0 R04：首頁探索故事——全部作品（每次隨機）／熱門作品（暫依最新上架）＋書架拖曳、鍵盤
(function () {
  var shelf = document.querySelector('.shelf'); if (!shelf) return;
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.ex-tabs [data-sort]')), note = document.querySelector('.ex-note');
  var books = Array.prototype.slice.call(shelf.querySelectorAll('.bk'));
  var rand = books.slice();
  for (var i = rand.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = rand[i]; rand[i] = rand[j]; rand[j] = t; }
  var hot = books.slice().sort(function (a, b) { return (+b.dataset.ord) - (+a.dataset.ord); });
  var hasTrustedSnapshot = false;
  var popularityMap = {};
  var previousRanking = {};
  function snapshotNumber(v) { return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1000000000; }
  function applyPopularityPayload(payload) {
    if (!payload || !Array.isArray(payload.works) || typeof payload.cutoff_at !== 'string' ||
        Number.isNaN(Date.parse(payload.cutoff_at))) return false;
    var map = {}, order = {}, n = 0;
    payload.works.forEach(function (item) {
      if (!item || typeof item.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(item.id) ||
          !snapshotNumber(item.popularity) || Object.prototype.hasOwnProperty.call(map, item.id)) return;
      map[item.id] = item.popularity;
    });
    if (!Object.keys(map).length) return false;
    if (Array.isArray(payload.previous_order)) payload.previous_order.forEach(function (id) {
      if (typeof id === 'string' && !Object.prototype.hasOwnProperty.call(order, id)) order[id] = n++;
    });
    popularityMap = map; previousRanking = order; hasTrustedSnapshot = true;
    var all = Array.prototype.slice.call(document.querySelectorAll('.shelf .bk'));
    all.forEach(function (b) {
      var id = b.dataset.workId, span = b.querySelector('.bk-pop');
      if (!span) return;
      if (Object.prototype.hasOwnProperty.call(map, id)) {
        span.classList.add('has-popularity');
        span.querySelector('.bk-pop-n').textContent = map[id].toLocaleString('zh-TW');
        span.setAttribute('aria-label', '人氣 ' + map[id].toLocaleString('zh-TW'));
      }
    });
    hot = books.slice().sort(function (a, b) {
      var aid = a.dataset.workId, bid = b.dataset.workId;
      var av = Object.prototype.hasOwnProperty.call(map, aid) ? map[aid] : -1;
      var bv = Object.prototype.hasOwnProperty.call(map, bid) ? map[bid] : -1;
      if (av !== bv) return bv - av;
      var ao = Object.prototype.hasOwnProperty.call(order, aid) ? order[aid] : Infinity;
      var bo = Object.prototype.hasOwnProperty.call(order, bid) ? order[bid] : Infinity;
      return ao - bo || (+a.dataset.ord) - (+b.dataset.ord);
    }).slice(0, 10);
    if (note) { note.hidden = true; }
    return true;
  }
  function loadPopularitySnapshot() {
    // 快照由服務端產生，網站只讀公開 RPC；不需每天部署靜態網站。
    if (!window.fetch) return;
    var cfg = window.WB_AUTH_CONFIG || {};
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.supabaseUrl || '') ||
        !cfg.publishableKey || /^sb_secret_/.test(cfg.publishableKey)) return;
    fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/popularity_snapshot_read', {
      method: 'POST', cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', apikey: cfg.publishableKey },
      body: '{}'
    }).then(function (r) { if (!r.ok) throw Error('snapshot_unavailable'); return r.json(); })
      .then(function (payload) {
        if (!applyPopularityPayload(payload)) return;
        var second = document.querySelector('.shelf-hot');
        if (second) { second.textContent = ''; hot.forEach(function (b) { var c=b.cloneNode(true); var im=c.querySelector('img'); if(im) im.loading='lazy'; second.appendChild(c); }); }
        var on = tabs.filter(function (b) { return b.getAttribute('aria-selected') === 'true'; })[0];
        if (on && on.dataset.sort === 'hot') show('hot');
        var heading = document.getElementById('ex-sec-hot');
        if (heading) { var small = heading.querySelector('small'); if (small) small.textContent = ''; }
      }).catch(function () { /* 沒有已驗證快照，維持既有排序與空值 */ });
  }
  function show(k) {
    tabs.forEach(function (b) { var on = b.dataset.sort === k; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on) shelf.setAttribute('aria-labelledby', b.id); });
    note.hidden = k !== 'hot' || hasTrustedSnapshot;
    (k === 'hot' ? hot : rand).forEach(function (b) { shelf.appendChild(b); });
    shelf.scrollLeft = 0;
    // 排序後前 6 本先載入，其餘滑到才載入
    Array.prototype.forEach.call(shelf.querySelectorAll('.bk img'), function (im, i) { im.loading = i < 6 ? 'eager' : 'lazy'; });
  }
  tabs.forEach(function (b, i) {
    b.onclick = function () { show(b.dataset.sort); };
    b.onkeydown = function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); show(n.dataset.sort); e.preventDefault(); } };
  });
  show('all');
  // 電腦：拖曳左右滑（不攔滾輪，頁面照常往下捲）；鍵盤：書架有焦點時左右鍵捲動
  function bind(sh) {
    var down = false, x0 = 0, l0 = 0, moved = false;
    sh.addEventListener('mousedown', function (e) { down = true; moved = false; x0 = e.pageX; l0 = sh.scrollLeft; e.preventDefault(); });
    addEventListener('mousemove', function (e) { if (!down) return; var d = e.pageX - x0; if (Math.abs(d) > 4) moved = true; sh.scrollLeft = l0 - d; });
    addEventListener('mouseup', function () { down = false; });
    sh.addEventListener('click', function (e) { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    sh.addEventListener('keydown', function (e) {
      if (e.target !== sh) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { sh.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * sh.clientWidth * 0.8, behavior: 'smooth' }); e.preventDefault(); }
    });
  }
  bind(shelf);

  // V1.0 S07（Q27）：平板、電腦＝多區書架（全部作品／熱門作品上下排列，整頁往下捲）；手機維持切換（Q28 約 2.5 本）
  var ex = document.querySelector('.explore'), mq = window.matchMedia ? matchMedia('(min-width:768px)') : null;
  var h1 = document.createElement('h2'); h1.className = 'ex-sec'; h1.id = 'ex-sec-all'; h1.textContent = '全部作品';
  var h2 = document.createElement('h2'); h2.className = 'ex-sec'; h2.id = 'ex-sec-hot'; h2.innerHTML = '熱門作品<small>暫依最新上架</small>';
  var hotShelf = document.createElement('div'); hotShelf.className = 'shelf shelf-hot'; hotShelf.tabIndex = 0; hotShelf.setAttribute('aria-labelledby', 'ex-sec-hot');
  hot.forEach(function (b, i) { var c = b.cloneNode(true); var im = c.querySelector('img'); if (im) im.loading = 'lazy'; hotShelf.appendChild(c); });
  shelf.parentNode.insertBefore(h1, shelf); shelf.parentNode.appendChild(h2); shelf.parentNode.appendChild(hotShelf); bind(hotShelf);
  function layout() {
    var multi = !!(mq && mq.matches); ex.classList.toggle('multi', multi);
    if (multi) { show('all'); shelf.removeAttribute('role'); shelf.setAttribute('aria-labelledby', 'ex-sec-all'); }
    else { shelf.setAttribute('role', 'tabpanel'); var on = tabs.filter(function (b) { return b.getAttribute('aria-selected') === 'true'; })[0]; if (on) shelf.setAttribute('aria-labelledby', on.id); }
  }
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', layout); else if (mq.addListener) mq.addListener(layout); }
  layout();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadPopularitySnapshot, { once: true });
  else loadPopularitySnapshot();
})();
