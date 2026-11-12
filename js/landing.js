/* ===================================================================
   My Creator Desk — public landing page (Walnut & Teal)
   Renders into #root for signed-out visitors (and #/features, #/pricing).
   Depends on helpers from app.js: $, qsa, esc, ST, signIn, go, homeRoute,
   plans, cyclePrice, cycleInfo, CYCLES, paise, PREVIEW.
   =================================================================== */
(function(){
  var I = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 21.5 19"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4h8l9 9-8 8-9-9Z"/><circle cx="7.5" cy="8.5" r="1.3"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15a8 8 0 1 1 16 0"/><path d="m12 15 4-5"/></svg>',
    rupee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12M6 9h12M6 4c7 0 9 2 9 5s-2 5-9 5l8 6"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4h11l-2 4 2 4H5"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7Z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z"/><circle cx="12" cy="11" r="2"/></svg>',
    off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0"/></svg>',
    google: '<svg viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12Z"/></svg>'
  };
  var MK = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 22V10h6.5a4.5 4.5 0 0 1 0 9H12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var SIGNIN = '#/signin';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cycle = 'monthly';
  var timers = [];
  function later(fn, ms){ timers.push(setTimeout(fn, ms)); }
  function clearTimers(){ timers.forEach(clearTimeout); timers = []; }

  function words(s){ // stagger hero words
    return s.split(' ').map(function(w, i){ var hl = /^\*/.test(w); w = w.replace(/^\*/, ''); return '<span class="w' + (hl ? ' hl' : '') + '" style="animation-delay:' + (0.08 * i + 0.1) + 's">' + w + '</span>'; }).join(' ');
  }
  function cta(cls, label){
    return '<button class="b ' + cls + '" data-signin>' + (ST.user ? 'Open your desk' : (I.google + (label || 'Start with Google'))) + '</button>';
  }

  /* ---------------- sections ---------------- */
  function nav(){
    return '<header class="nav" id="lp-nav"><div class="lwrap">' +
      '<a class="lbrand" href="#/"><span class="mk">' + MK + '</span>My Creator Desk</a>' +
      '<nav class="links" aria-label="Main"><a href="#/features" data-to="features">Features</a><a href="#/" data-to="how">How it works</a><a href="#/pricing" data-to="pricing">Pricing</a><a href="#/" data-to="faq">FAQ</a></nav>' +
      '<div class="nav-r">' + (ST.user ? '' : '<button class="txt" data-signin>Sign in</button>') + cta('p sm') + '</div>' +
      '<button class="burger" id="lp-burger" aria-label="Menu" aria-expanded="false"><span></span></button>' +
      '</div><div class="mob"><a href="#/features" data-to="features">Features</a><a href="#/" data-to="how">How it works</a><a href="#/pricing" data-to="pricing">Pricing</a><a href="#/" data-to="faq">FAQ</a>' + cta('p') + '</div></header>';
  }
  function hero(){
    return '<section class="lhero"><div class="lwrap">' +
      '<div><span class="badge"><b></b>Built for brands &amp; agencies in India</span>' +
      '<h1>' + words('Know what a creator is *worth — before you pay.') + '</h1>' +
      '<p class="llede rv">Look up any Instagram creator and see their real engagement, audience quality and cost per view. Shortlist the best, track every campaign post, and send your manager a clean report.</p>' +
      '<div class="lbtns rv d1">' + cta('p lg') + '<a class="b o lg" href="#/pricing" data-to="pricing">See pricing</a></div>' +
      '<p class="lfine rv d2"><span>' + I.check + 'Official Meta (Instagram) API</span><span>' + I.check + 'Plans from ₹4,999/month</span><span>' + I.check + 'No creator is notified</span></p>' +
      '</div>' +
      '<div class="demo" id="lp-demo" aria-label="Example: a creator checked in My Creator Desk"><div class="lcard">' +
        '<div class="srch">' + I.search + '<span class="ty" id="lp-ty"></span><span class="go">Look up</span></div>' +
        '<div class="res" id="lp-res">' +
          '<div class="lwho"><div style="display:flex;gap:12px;align-items:center"><span class="lav"><i></i></span><div><div class="nm">@glow.with.anaya</div><div class="sb">Skincare creator · Pune · Hindi &amp; English</div></div></div><span class="vd">Good value</span></div>' +
          '<div class="grid3"><div><span>Followers</span><b class="lnum" data-cnt="64000" data-fmt="k">0</b></div><div><span>Engagement</span><b class="lnum" data-cnt="6.66" data-fmt="pct">0%</b></div><div><span>Avg Reel views</span><b class="lnum" data-cnt="72000" data-fmt="k">0</b></div></div>' +
          '<div class="cpv"><div class="t">Cost per view at the quoted ₹28,000</div>' +
            '<div class="lln"><span>This creator</span><span class="tr"><i style="--w:35%;background:#1E7845"></i></span><em>₹0.39</em></div>' +
            '<div class="lln"><span>Your shortlist</span><span class="tr"><i style="--w:55%;background:#E9A23B"></i></span><em>₹0.61</em></div>' +
            '<div class="lln"><span>Costliest</span><span class="tr"><i style="--w:100%;background:#DCCBB2"></i></span><em>₹1.10</em></div></div>' +
          '<div class="chips"><span class="lchip g">Audience quality <b class="lnum" data-cnt="82" data-fmt="int">0</b>/100</span><span class="lchip t">Reels get 1.8× the engagement</span><span class="lchip">No competitor collabs</span></div>' +
        '</div></div>' +
        '<div class="lstamp">36% cheaper per view<small>than your shortlist median</small></div>' +
      '</div>' +
      '</div></section>';
  }
  function marquee(){
    var cats = ['Beauty', 'Fashion', 'Food', 'Fitness', 'Tech', 'Travel', 'Parenting', 'Gaming', 'Finance', 'Comedy', 'Home decor', 'Education'];
    var s = cats.map(function(c){ return '<span>' + c + '</span>'; }).join('');
    return '<div class="mq" aria-hidden="true"><div class="trk">' + s + s + '</div></div>';
  }
  function problem(){
    function p(ic, t, d){ return '<div class="pain rv"><div class="lic">' + ic + '</div><h3>' + t + '</h3><p>' + d + '</p></div>'; }
    return '<section class="sec dark"><div class="lwrap">' +
      '<div class="hd"><span class="eyebrow"><i></i>The problem</span><h2>Choosing creators from screenshots is a gamble.</h2><p class="llede">Every brand team has paid for reach that never arrived. The numbers you were shown were never the numbers you got.</p></div>' +
      '<div class="pains">' +
        p(I.image, 'Screenshots can be edited', 'Insights sent on WhatsApp are easy to crop, inflate or pick from the one post that went viral.') +
        p(I.users, 'Followers hide the truth', 'A big follower count says nothing about how many people actually watch, like or comment today.') +
        p(I.tag, 'Fees with nothing to compare', 'A quote of ₹25,000 is neither cheap nor expensive until you know the cost per view next to your other options.') +
      '</div>' +
      '<div class="ans rv"><strong>My Creator Desk reads public numbers straight from Instagram’s official API, so your team decides on facts.</strong><span class="arrow">' + I.arrow + '</span></div>' +
      '</div></section>';
  }
  function features(){
    function f(cls, ic, t, d, mv){ return '<article class="f rv ' + cls + '"><div class="lic">' + ic + '</div><h3>' + t + '</h3><p>' + d + '</p>' + mv + '</article>'; }
    var bars = '<div class="mv bars">' + [40, 65, 50, 85, 60, 95, 70, 100].map(function(h){ return '<i style="--h:' + h + '%"></i>'; }).join('') + '</div>';
    var ring = '<div class="mv"><div class="ring" style="--v:82"><b>82</b></div></div>';
    var verdict = '<div class="mv verdict"><span class="on">Good value</span><span>Renegotiate</span><span>Avoid</span></div>';
    var duo = '<div class="mv duo"><div style="--h:58px"><small>Organic 6.6%</small></div><div class="ls" style="--h:30px"><small>Sponsored 3.1%</small></div></div>';
    var list = '<div class="mv list"><i style="--w:90%"></i><i style="--w:70%"></i><i style="--w:80%"></i></div>';
    var line = '<div class="mv line"><svg viewBox="0 0 200 64" preserveAspectRatio="none"><path d="M0 50 C 30 48, 40 30, 70 32 S 110 46, 130 28 S 170 12, 200 6"/></svg></div>';
    var doc = '<div class="mv doc"><i style="--w:60%"></i><i style="--w:95%"></i><i style="--w:85%"></i><i style="--w:70%"></i></div>';
    var ppl = '<div class="mv ppl"><b style="background:#17766B">UR</b><b style="background:#E9A23B;color:#2A1C14">VJ</b><b style="background:#7A5C4A">AK</b><b style="background:#3B2A20">+5</b></div>';
    return '<section class="sec" id="features"><div class="lwrap">' +
      '<div class="hd rv" data-par="-30"><span class="eyebrow"><i></i>Features</span><h2>Everything your team checks before booking a creator, in one place.</h2><p class="llede">Every number comes from Instagram through your brand’s own connected account. No scraping, no guesswork.</p></div>' +
      '<div class="bento">' +
        f('big', I.search, 'Creator lookup', 'Followers, average views, likes, comments and engagement rate, worked out from the creator’s last 12 posts.', bars) +
        f('', I.gauge, 'Audience quality score', 'A score out of 100 that spots weak, bought or inactive engagement.', ring) +
        f('', I.rupee, 'Cost per view &amp; verdict', 'Enter the fee quoted and get cost per view, cost per engagement and a clear verdict.', verdict) +
        f('', I.swap, 'Sponsored vs organic', 'See whether a creator’s paid posts perform worse than their normal ones.', duo) +
        f('', I.list, 'Shortlist', 'Every creator you look up is saved for your whole team to compare.', list) +
        f('big', I.flag, 'Campaign tracker', 'Add campaign posts, track views and engagement as they grow, and export everything as CSV.', line) +
        f('', I.doc, 'Manager report', 'One-click summary for WhatsApp, Slack or email, plus a PDF download.', doc) +
        f('', I.users, 'Team workspace', 'Invite teammates. Each company’s data stays private to that company.', ppl) +
      '</div></div></section>';
  }
  function how(){
    function s(n, t, d){ return '<div class="st rv d' + n + '"><div class="n">' + n + '</div><div><h3>' + t + '</h3><p>' + d + '</p></div></div>'; }
    return '<section class="sec" id="how" style="padding-top:0"><div class="lwrap">' +
      '<div class="hd rv"><span class="eyebrow"><i></i>How it works</span><h2>From sign-in to your first creator check in under ten minutes.</h2></div>' +
      '<div class="lsteps" id="lp-steps">' +
        s(1, 'Sign in with Google', 'Create your company workspace. No passwords to manage, no setup calls.') +
        s(2, 'Connect your brand’s Instagram', 'One click through Facebook Login. We only read public data, never post.') +
        s(3, 'Type any creator’s handle', 'Get followers, engagement, audience quality and cost per view in seconds.') +
      '</div></div></section>';
  }
  function numbers(){
    function n(v, suf, l){ return '<div class="rv"><b class="lnum"><span class="v" data-cnt="' + v + '" data-fmt="int">0</span>' + (suf ? '<small>' + suf + '</small>' : '') + '</b><span class="l">' + l + '</span></div>'; }
    return '<section class="sec dark" style="padding:64px 0"><div class="lwrap"><div class="nums">' +
      n(12, '', 'recent posts analysed for every creator') +
      n(6, 'h', 'maximum data age before we refresh it') +
      n(150, '', 'fresh lookups an hour per connected account') +
      n(100, '%', 'official Meta Instagram API, no scraping') +
      '</div></div></section>';
  }
  function pricing(){
    var idx = CYCLES.findIndex(function(c){ return c.id === cycle; });
    var seg = '<div class="seg2" role="group" aria-label="Billing period"><span class="pill" style="transform:translateX(' + (idx * 100) + '%)"></span>' +
      CYCLES.map(function(c){ var sv = saving(c.id); return '<button data-cycle="' + c.id + '" aria-pressed="' + (cycle === c.id) + '">' + c.label + (sv ? '<small>save ' + sv + '%</small>' : '<small>&nbsp;</small>') + '</button>'; }).join('') + '</div>';
    return '<section class="sec" id="pricing"><div class="lwrap">' +
      '<div class="ptop rv"><div class="hd" style="margin:0"><span class="eyebrow"><i></i>Pricing</span><h2>Simple plans, priced per company.</h2><p class="llede" style="margin-top:12px">Every plan has every feature. Choose how many Instagram accounts and teammates you need.</p></div>' + seg + '</div>' +
      '<div class="plans" id="lp-plans">' + planCards() + '</div>' +
      '<p class="pnote">Prices in Indian rupees, + GST if applicable. Secure payment by UPI, card or netbanking through Razorpay.</p>' +
      '</div></section>';
  }
  function saving(cid){
    var p = plans().filter(function(x){ return x.self_checkout; })[0]; if (!p) return 0;
    var cy = cycleInfo(cid); if (cy.months < 2) return 0;
    var amt = cyclePrice(p, cid), full = p.price_monthly_paise * cy.months;
    return amt && full ? Math.round((1 - amt / full) * 100) : 0;
  }
  function planCards(){
    var cy = cycleInfo(cycle);
    return plans().filter(function(p){ return p.self_checkout; }).map(function(p){
      var amt = cyclePrice(p, cycle), hot = p.id === 'growth';
      var eq = cy.months > 1 && amt ? 'Works out to <em>' + paise(amt / cy.months) + ' a month</em>' + (saving(cycle) ? ' · you save ' + paise(p.price_monthly_paise * cy.months - amt) : '') : 'Billed every month, cancel any time';
      var feats = [p.ig_account_limit + ' Instagram account' + (p.ig_account_limit > 1 ? 's' : '') + ' for lookups', 'Up to ' + p.seat_limit + ' team members', (150 * p.ig_account_limit) + ' fresh lookups an hour', 'Creator lookup, shortlist and campaign tracker', 'Audience quality, sponsored vs organic and verdicts', 'Manager report with PDF download'];
      return '<article class="pl rv' + (hot ? ' hot d1' : '') + '">' + (hot ? '<span class="ltag">Most popular</span>' : '') +
        '<div><h3>' + esc(p.name) + '</h3><p class="d">' + esc(p.description || '') + '</p></div>' +
        '<div><div class="pr"><b class="lnum">' + paise(amt) + '</b><span>' + cy.per + '</span></div><div class="eq">' + eq + '</div></div>' +
        '<ul>' + feats.map(function(f){ return '<li>' + I.check + '<span>' + f + '</span></li>'; }).join('') + '</ul>' +
        '<button class="b ' + (hot ? 'p' : 'o') + ' lg" data-signin>' + (ST.user ? 'Open your desk' : 'Start with ' + esc(p.name)) + '</button></article>';
    }).join('');
  }
  function trust(){
    return '<section class="sec" style="padding-top:0"><div class="lwrap"><div class="trust">' +
      '<div class="rv"><span class="eyebrow"><i></i>Trust &amp; privacy</span><h2 style="margin:12px 0 16px">Built on Instagram’s official API. Nothing scraped, nothing posted.</h2>' +
      '<p class="llede">We only read public data of professional Instagram accounts. We never post, never read messages, and never touch personal accounts. Your company’s data is visible only to your team.</p>' +
      '<div class="tb"><span>' + I.shield + 'Official Meta API</span><span>' + I.pin + 'Data stored in India</span><span>' + I.off + 'Disconnect anytime</span><span>' + I.lock + 'Private per company</span></div></div>' +
      '<div class="shield rv d2"><div class="core">' + I.shield + '</div><span class="orb a">API</span><span class="orb b">IN</span><span class="orb c">' + I.lock + '</span></div>' +
      '</div></div></section>';
  }
  function founders(){
    return '<section class="sec" style="padding-top:0"><div class="lwrap">' +
      '<div class="hd rv" style="text-align:center;margin:0 auto"><span class="eyebrow"><i></i>Founders</span><h2>Built by founders who’ve seen the problem first-hand.</h2></div>' +
      '<div class="fd">' +
        '<div class="fo rv"><div class="lav t">U</div><div><h3>Uday Ruhil</h3><div class="role">Founder</div><p>“Brands were paying lakhs on the strength of a screenshot. We built the tool we wished every marketing team had.”</p></div></div>' +
        '<div class="fo rv d1"><div class="lav a">V</div><div><h3>Vanshika Juyal</h3><div class="role">Founder</div><p>“A good creator deal is one where both sides know the real numbers. We make that the default, not the exception.”</p></div></div>' +
      '</div></div></section>';
  }
  function faq(){
    var qs = [
      ['Is this allowed by Instagram?', 'Yes. My Creator Desk uses Meta’s official Instagram Graph API through your own connected Business account. Nothing is scraped.'],
      ['Can I look up any creator?', 'Any public Instagram Business or Creator account. Personal (private) accounts cannot be looked up, which is also why they are rarely used for brand deals.'],
      ['Do creators know I looked them up?', 'No. Lookups read public numbers only. The creator is never notified and nothing appears on their profile.'],
      ['Do I need an Instagram Business account?', 'Yes, one that is linked to a Facebook Page. If your brand has an Instagram account, switching it to Business and linking a Page takes about five minutes.'],
      ['Can my team use it?', 'Yes. Invite teammates by email. Everyone shares the company’s shortlist and campaigns, and each company’s data stays private.'],
      ['Can I cancel?', 'Plans are prepaid per billing cycle (monthly, quarterly, half-yearly or yearly) and simply do not renew if you stop. See our Refunds policy for details.']
    ];
    return '<section class="sec" id="faq" style="padding-top:0"><div class="lwrap">' +
      '<div class="hd rv" style="text-align:center;margin:0 auto"><span class="eyebrow"><i></i>FAQ</span><h2>Questions brand teams ask us.</h2></div>' +
      '<div class="faq">' + qs.map(function(q, i){ return '<div class="q rv' + (i === 0 ? ' open' : '') + '"><button aria-expanded="' + (i === 0) + '">' + q[0] + '<i>' + I.plus + '</i></button><div class="a"><div><p>' + q[1] + '</p></div></div></div>'; }).join('') + '</div>' +
      '</div></section>';
  }
  function finalCta(){
    return '<section class="sec dark cta"><div class="glow"></div><div class="lwrap rv"><span class="eyebrow"><i></i>Get started</span><h2>Stop guessing. Start paying for real reach.</h2>' +
      '<p class="llede" style="margin:0 auto 30px;text-align:center">Sign in with Google, connect your brand’s Instagram, and check your first creator today.</p>' + cta('p lg') + '</div></section>';
  }
  function foot(){
    return '<footer class="foot"><div class="lwrap"><div class="top">' +
      '<div><a class="lbrand" href="#/"><span class="mk">' + MK + '</span>My Creator Desk</a><p>Check Instagram creators’ real numbers before you pay them. Built for brand and agency teams in India.</p></div>' +
      '<div><h4>Product</h4><ul><li><a href="#/features" data-to="features">Features</a></li><li><a href="#/pricing" data-to="pricing">Pricing</a></li><li><a href="#/" data-to="faq">FAQ</a></li><li><a href="' + SIGNIN + '">Sign in</a></li></ul></div>' +
      '<div><h4>Company</h4><ul><li><a href="privacy.html">Privacy policy</a></li><li><a href="terms.html">Terms of service</a></li><li><a href="refund.html">Refunds</a></li><li><a href="contact.html">Contact</a></li></ul></div>' +
      '</div><div class="bot"><span>© ' + new Date().getFullYear() + ' CREATOR DESK · mycreatordesk.co.in</span><span>Made in New Delhi, India</span></div></div></footer>';
  }

  /* ---------------- behaviour ---------------- */
  function fmt(v, f){
    if (f === 'k') return v >= 1000 ? (Math.round(v / 100) / 10).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : Math.round(v);
    if (f === 'pct') return v.toFixed(2) + '%';
    return Math.round(v);
  }
  function count(el, ms){
    var to = parseFloat(el.dataset.cnt), f = el.dataset.fmt, t0 = null;
    if (reduce) { el.textContent = fmt(to, f); return; }
    function step(ts){ if (!t0) t0 = ts; var k = Math.min(1, (ts - t0) / (ms || 1200)); k = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * k, f); if (k < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  function heroLoop(){
    var ty = $('lp-ty'), res = $('lp-res'), demo = $('lp-demo'); if (!ty || !res) return;
    var handle = '@glow.with.anaya';
    function show(){ res.classList.add('on'); demo.classList.add('on'); qsa('[data-cnt]', res).forEach(function(el){ count(el, 1300); }); }
    if (reduce) { ty.textContent = handle; show(); return; }
    function run(){
      clearTimers(); ty.textContent = ''; res.classList.remove('on'); demo.classList.remove('on'); qsa('[data-cnt]', res).forEach(function(el){ el.textContent = fmt(0, el.dataset.fmt); });
      var i = 0;
      (function type(){ if (!document.contains(ty)) return; ty.textContent = handle.slice(0, ++i); if (i < handle.length) later(type, 70 + Math.random() * 60); else later(show, 450); })();
      later(run, 9000);
    }
    later(run, 400);
  }
  function choreograph(){ // give every block its own entrance
    function set(sel, cls, step){ qsa(sel).forEach(function(el, i){ el.classList.add('rv'); if (cls) el.classList.add(cls); if (step) el.style.transitionDelay = (i * step) + 'ms'; }); }
    set('.lp .bento .f', 'rv-s', 0); qsa('.lp .bento .f').forEach(function(el, i){ el.style.transitionDelay = ((i % 4) * 90) + 'ms'; });
    set('.lp .pains .pain', 'rv-up', 120);
    set('.lp .nums > div', 'rv-s', 110);
    set('.lp .faq .q', 'rv-up', 70);
    qsa('.lp .plans .pl').forEach(function(el, i){ el.classList.add(i ? 'rv-r' : 'rv-l'); el.style.transitionDelay = '0ms'; });
    qsa('.lp .fd .fo').forEach(function(el, i){ el.classList.add(i ? 'rv-r' : 'rv-l'); });
    qsa('.lp .trust > div:first-child').forEach(function(el){ el.classList.add('rv-l'); });
    qsa('.lp .shield').forEach(function(el){ el.classList.add('rv-z'); });
    qsa('.lp .ans').forEach(function(el){ el.classList.add('rv-s'); });
    qsa('.lp .st').forEach(function(el, i){ el.classList.add('rv-l'); el.style.transitionDelay = (200 + i * 220) + 'ms'; });
    // split section headings into words that rise one by one
    qsa('.lp main h2').forEach(function(h){
      if (h.dataset.split) return; h.dataset.split = 1;
      h.innerHTML = h.textContent.split(' ').map(function(w, i){ return '<span class="sw"><span style="transition-delay:' + (i * 45) + 'ms">' + w + '</span></span>'; }).join(' ');
      h.classList.add('rvh');
    });
    // dark bands open like a curtain
    qsa('.lp .sec.dark').forEach(function(el){ el.classList.add('rv-wipe'); });
    qsa('.lp .eyebrow').forEach(function(el){ el.classList.add('rv-ey'); });
  }
  function reveal(){
    var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) { e.target.classList.add('in'); qsa('[data-cnt]', e.target).forEach(function(el){ if (!el.closest('#lp-res')) count(el, 1400); }); io.unobserve(e.target); } }); }, {rootMargin: '0px 0px -8% 0px', threshold: 0.12});
    qsa('.lp .rv, #lp-steps, .lp .rvh, .lp .rv-wipe, .lp .rv-ey').forEach(function(el){ io.observe(el); });
  }
  var rafOn = false;
  function onScrollFx(){ // progress bar + parallax, one rAF per frame
    if (rafOn) return; rafOn = true;
    requestAnimationFrame(function(){
      rafOn = false;
      var y = window.scrollY, H = document.documentElement.scrollHeight - innerHeight;
      var bar = $('lp-prog'); if (bar) bar.style.transform = 'scaleX(' + (H > 0 ? y / H : 0) + ')';
      if (reduce) return;
      var demo = $('lp-demo'); if (demo) demo.style.transform = 'translateY(' + (y * -0.12) + 'px) rotate(' + (y * 0.006) + 'deg)';
      qsa('.lp .hero h1').forEach(function(h){ h.style.transform = 'translateY(' + (y * 0.08) + 'px)'; h.style.opacity = Math.max(0, 1 - y / 700); });
      qsa('.lp [data-par]').forEach(function(el){ var r = el.getBoundingClientRect(), c = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; el.style.transform = 'translateY(' + (c * parseFloat(el.dataset.par)) + 'px)'; });
      qsa('.lp .shield .core').forEach(function(el){ var r = el.getBoundingClientRect(); el.style.transform = 'rotate(' + ((r.top - innerHeight / 2) * -0.04) + 'deg) scale(' + (1 + Math.max(0, 1 - Math.abs(r.top - innerHeight / 2) / innerHeight) * 0.12) + ')'; });
      qsa('.lp .cta .glow').forEach(function(el){ var r = el.parentElement.getBoundingClientRect(); var k = 1 - Math.min(1, Math.abs(r.top) / innerHeight); el.style.transform = 'translate(-50%,-50%) scale(' + (0.6 + k * 0.7) + ')'; });
      var mq = qsa('.lp .mq .trk')[0]; if (mq) mq.style.marginLeft = (-y * 0.25) + 'px';
    });
  }
  function tilt(){ // 3D tilt on cards under a mouse
    if (reduce || !matchMedia('(pointer:fine)').matches) return;
    qsa('.lp .f, .lp .pl, .lp .fo, .lp .pain, .lp .demo .lcard').forEach(function(el){
      el.addEventListener('mousemove', function(e){ var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, yy = (e.clientY - r.top) / r.height - .5; el.style.transform = 'perspective(900px) rotateX(' + (-yy * 7) + 'deg) rotateY(' + (x * 9) + 'deg) translateY(-6px)'; el.style.setProperty('--mx', (x + .5) * 100 + '%'); el.style.setProperty('--my', (yy + .5) * 100 + '%'); el.classList.add('tilt'); });
      el.addEventListener('mouseleave', function(){ el.style.transform = ''; el.classList.remove('tilt'); });
    });
    qsa('.lp .b.p').forEach(function(b){ // magnetic buttons
      b.addEventListener('mousemove', function(e){ var r = b.getBoundingClientRect(); b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * .18) + 'px,' + ((e.clientY - r.top - r.height / 2) * .25) + 'px) scale(1.03)'; });
      b.addEventListener('mouseleave', function(){ b.style.transform = ''; });
    });
  }
  function scrollTo(id){ var t = $(id); if (!t) return; var y = t.getBoundingClientRect().top + window.scrollY - 72; window.scrollTo({top: y, behavior: reduce ? 'auto' : 'smooth'}); }
  function bind(){
    qsa('.lp [data-signin]').forEach(function(b){ b.onclick = function(){ if (ST.user) go(homeRoute()); else signIn(); }; });
    qsa('.lp [data-to]').forEach(function(a){ a.onclick = function(e){ e.preventDefault(); var id = a.dataset.to; scrollTo(id); if (id === 'features' || id === 'pricing') history.replaceState(null, '', '#/' + id); $('lp-nav').classList.remove('open'); }; });
    var nav = $('lp-nav'), bg = $('lp-burger');
    bg.onclick = function(){ var o = nav.classList.toggle('open'); bg.setAttribute('aria-expanded', o); };
    var onS = function(){ nav.classList.toggle('on', window.scrollY > 10); onScrollFx(); }; window.onscroll = onS; onS();
    qsa('.lp [data-cycle]').forEach(function(b){ b.onclick = function(){
      cycle = b.dataset.cycle; var idx = CYCLES.findIndex(function(c){ return c.id === cycle; });
      qsa('.lp [data-cycle]').forEach(function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      qsa('.lp .seg2 .pill')[0].style.transform = 'translateX(' + (idx * 100) + '%)';
      var wrap = $('lp-plans'); wrap.innerHTML = planCards(); qsa('.rv', wrap).forEach(function(el){ el.classList.add('in'); }); bind();
    }; });
    qsa('.lp .q button').forEach(function(b){ b.onclick = function(){ var q = b.parentElement, o = q.classList.toggle('open'); b.setAttribute('aria-expanded', o); }; });
  }

  window.LP = { render: function(anchor){
    clearTimers();
    document.title = 'My Creator Desk — Check Instagram creators before you pay';
    var root = $('root');
    root.innerHTML = '<div class="lp"><div class="lp-prog" id="lp-prog"></div>' + (PREVIEW ? '<div class="pv"><strong>Preview mode.</strong> Sample data kept in this browser only.</div>' : '') +
      nav() + '<main>' + hero() + marquee() + problem() + features() + how() + numbers() + pricing() + trust() + founders() + faq() + finalCta() + '</main>' + foot() + '</div>';
    choreograph(); bind(); reveal(); heroLoop(); tilt(); onScrollFx();
    if (anchor) setTimeout(function(){ scrollTo(anchor); }, 60);
  }};
})();
