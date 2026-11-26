/* NAV V1.0: enhance existing links and inline directories; no JS = original controls. */
(function () {
  'use strict';
  var bar = document.querySelector('.wb-page-nav'), main = document.querySelector('main.wrap'), top = document.querySelector('header.top');
  if (!main || !top) return;
  var share = main.querySelector('[data-wb-volume-share]');
  if(share) share.addEventListener('click',async function(){var msg=share.nextElementSibling;try{if(navigator.share){await navigator.share({title:document.title,url:location.origin+location.pathname});}else{await navigator.clipboard.writeText(location.origin+location.pathname);msg.textContent='已複製網址';}}catch(e){if(e.name!=='AbortError')msg.textContent='分享未完成，請複製網址列。';}});

  var dialog = main.querySelector('.wb-catalog-dialog'), opener = main.querySelector('.wb-catalog-open');
  if(dialog && opener){
    var close=dialog.querySelector('.wb-catalog-close');
    opener.addEventListener('click',function(){if(!dialog.open){dialog.showModal();document.documentElement.classList.add('wb-catalog-lock');close.focus();}});
    close.addEventListener('click',function(){dialog.close();});
    dialog.addEventListener('click',function(e){if(e.target===dialog){var r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    dialog.addEventListener('close',function(){document.documentElement.classList.remove('wb-catalog-lock');opener.focus();});
  }
  var readerBack = main.querySelector('.wb-reader-back');
  if (readerBack) {
    try {
      var from = new URL(document.referrer);
      if (from.origin === location.origin && from.pathname !== location.pathname && !from.pathname.startsWith('/auth/') && !from.pathname.startsWith('/login-test/')) {
        readerBack.href = from.href;
        readerBack.addEventListener('click',function(e){if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&e.button===0&&history.length>1){e.preventDefault();history.back();}});
      }
    } catch(e) {}
    return;
  }
  if (!bar) return;
  var back = bar.querySelector('.wb-page-back'), btn = bar.querySelector('.wb-page-toc');
  var original = main.querySelector('.nv-back, .r-crumb a');
  var toc = main.querySelector('details.r-toc, details.lit-toc, [data-page-toc], .nv-list');
  if (!original && !toc) return;
  if (original) back.href = original.href;
  function internal(url) { try { var u = new URL(url, location.href); return u.origin === location.origin && /^https?:$/.test(u.protocol) && u.href !== location.href && u.pathname !== '/auth/callback/' && u.pathname !== '/login-test/' ? u : null; } catch(e) { return null; } }
  var source = document.referrer ? internal(document.referrer) : null;
  if (source && source.pathname !== location.pathname) back.href = source.href;
  back.addEventListener('click', function(e) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (source && source.pathname !== location.pathname && history.length > 1) { e.preventDefault(); history.back(); }
  });
  if (original && original.matches('.nv-back') && !original.classList.contains('ind-title-back')) original.hidden = true;
  if (original && original.classList.contains('ind-title-back')) { back.hidden=true; original.href=back.href; original.addEventListener('click',function(e){if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&e.button===0&&source&&history.length>1){e.preventDefault();history.back();}}); }
  if (toc) {
    if (!toc.id) toc.id = 'wb-page-toc-target';
    btn.hidden = false; btn.setAttribute('aria-controls', toc.id);
    var isDetails = toc.tagName === 'DETAILS';
    if (isDetails) {
      toc.open = false;
      var sync = function () { btn.setAttribute('aria-expanded', String(toc.open)); if(toc.open) bar.classList.remove('wb-nav-away'); };
      toc.addEventListener('toggle', sync); sync();
      btn.addEventListener('click', function () { toc.open = !toc.open; if (toc.open) toc.scrollIntoView({block:'start',behavior:'auto'}); });
    } else {
      btn.removeAttribute('aria-expanded');
      btn.addEventListener('click', function () { toc.scrollIntoView({block:'start',behavior:'auto'}); });
    }
  }
  bar.hidden = false;
  function size(){ bar.style.setProperty('--wb-header-height',top.getBoundingClientRect().height+'px'); if(toc) toc.style.scrollMarginTop=(top.getBoundingClientRect().height+bar.offsetHeight+12)+'px'; }
  size(); if(window.ResizeObserver) new ResizeObserver(size).observe(top); else addEventListener('resize',size);
  var last = Math.max(0,scrollY), pending = false;
  addEventListener('scroll',function(){ if(pending)return; pending=true; requestAnimationFrame(function(){ pending=false; var y=Math.max(0,scrollY); if(y<40 || (toc && toc.tagName==='DETAILS' && toc.open) || bar.contains(document.activeElement)) bar.classList.remove('wb-nav-away'); else if(y-last>8) bar.classList.add('wb-nav-away'); else if(last-y>8) bar.classList.remove('wb-nav-away'); if(Math.abs(y-last)>8 || y<40)last=y; }); },{passive:true});
  bar.addEventListener('focusin',function(){bar.classList.remove('wb-nav-away');});
})();
