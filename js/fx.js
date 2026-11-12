/* ===================================================================
   My Creator Desk — site-wide motion
   1. Bubble burst on every click / tap
   2. App pages: content cards rise in as they scroll into view
   Respects prefers-reduced-motion.
   =================================================================== */
(function(){
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !Element.prototype.animate) return;
  var COLORS = ['#17766B', '#E9A23B', '#3B2A20', '#4FB7A9', '#F2C77A'];

  /* ---------- 1. click bubbles ---------- */
  var layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:hidden';
  function attach(){ if (!layer.isConnected) document.body.appendChild(layer); }
  if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach);

  function dot(x, y, size, color, styles){
    var d = document.createElement('span');
    d.style.cssText = 'position:absolute;left:' + (x - size / 2) + 'px;top:' + (y - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px;border-radius:50%;' + (styles || 'background:' + color);
    layer.appendChild(d);
    return d;
  }
  function burst(x, y){
    attach();
    // soft ring
    var ring = dot(x, y, 18, null, 'border:2px solid rgba(23,118,107,.55);background:rgba(23,118,107,.08)');
    ring.animate([{transform: 'scale(.3)', opacity: 1}, {transform: 'scale(3.2)', opacity: 0}], {duration: 560, easing: 'cubic-bezier(.22,.61,.36,1)'}).onfinish = function(){ ring.remove(); };
    // bubbles
    var n = 9 + Math.floor(Math.random() * 4);
    for (var i = 0; i < n; i++) {
      var ang = (Math.PI * 2 * i) / n + (Math.random() - .5) * .6;
      var dist = 26 + Math.random() * 38;
      var size = 5 + Math.random() * 8;
      var c = COLORS[i % COLORS.length];
      var hollow = Math.random() < .35;
      var b = dot(x, y, size, c, hollow ? 'border:1.5px solid ' + c + ';background:transparent' : 'background:' + c);
      var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 10;
      b.animate([
        {transform: 'translate(0,0) scale(.4)', opacity: .95},
        {transform: 'translate(' + dx * .7 + 'px,' + dy * .7 + 'px) scale(1)', opacity: .9, offset: .55},
        {transform: 'translate(' + dx + 'px,' + (dy - 14) + 'px) scale(.2)', opacity: 0}
      ], {duration: 620 + Math.random() * 260, easing: 'cubic-bezier(.2,.7,.3,1)'}).onfinish = (function(el){ return function(){ el.remove(); }; })(b);
    }
  }
  document.addEventListener('pointerdown', function(e){
    if (e.button > 0) return;
    burst(e.clientX, e.clientY);
  }, {passive: true});

  /* ---------- 2. app pages: cards rise in on scroll ---------- */
  var SEL = '.page .card, .page .plan, .page .note, .page table, .page .stat, .page .tile, .page section, .page article, .page .panel, .page .grid > *';
  var io = new IntersectionObserver(function(es){
    es.forEach(function(en){
      if (!en.isIntersecting) return;
      var el = en.target; io.unobserve(el);
      var i = +el.dataset.fxI || 0;
      el.animate([{opacity: 0, transform: 'translateY(22px) scale(.985)'}, {opacity: 1, transform: 'none'}], {duration: 520, delay: Math.min(i, 6) * 60, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'backwards'});
    });
  }, {rootMargin: '0px 0px -6% 0px', threshold: .08});
  function scan(){
    var page = document.getElementById('page'); if (!page) return;
    var k = 0;
    Array.prototype.forEach.call(page.querySelectorAll(SEL), function(el){
      if (el.dataset.fx) return;
      if (el.parentElement && el.parentElement.closest('[data-fx]')) return; // only outermost
      el.dataset.fx = '1'; el.dataset.fxI = k++;
      io.observe(el);
    });
  }
  var mo = new MutationObserver(function(){ requestAnimationFrame(scan); });
  function start(){ var r = document.getElementById('root'); if (r) mo.observe(r, {childList: true, subtree: true}); scan(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
