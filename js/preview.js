/* My Creator Desk — Preview mode.
 * Runs only while js/config.js has no Supabase settings (or with ?preview in the address).
 * It copies the real API (same actions, same answers, same error codes) with sample data kept in this browser,
 * so every screen can be tried without a backend. Numbers are made up and nothing is sent anywhere. */
'use strict';
var Preview = (function(){
  var KEY = 'cd-preview-db-v1', UKEY = 'cd-preview-user';
  var db = null;
  var now = function(){ return new Date().toISOString(); };
  var daysAgo = function(n, h){ return new Date(Date.now() - n * 864e5 - (h || 0) * 36e5).toISOString(); };
  var uid = function(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){ var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); };
  function hashStr(s){ var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed){ return function(){ seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function fail(msg, code){ var e = new Error(msg); e.code = code || 'ERROR'; throw e; }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  function sh(v){ var a = Math.abs(v); return a >= 1e5 ? (v / 1e5).toFixed(1).replace(/\.0$/, '') + ' L' : a >= 1e3 ? (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(Math.round(v)); }

  var PERSONAS = [
    {id: 'u-admin', name: 'Aarav Mehta', email: 'aarav@glowkart.in', about: 'Company admin at Glowkart Beauty: everything, including team, usage and billing'},
    {id: 'u-member', name: 'Riya Sharma', email: 'riya@glowkart.in', about: 'Team member at Glowkart Beauty: lookups, shortlist, campaign and report'},
    {id: 'u-new', name: 'Neha Kapoor', email: 'neha@snackyco.in', about: 'New here: create a company, pay, wait for approval (also has an invite)'},
    {id: 'u-owner', name: 'Uday (platform owner)', email: 'udayruhil.82@gmail.com', about: 'Platform panel: approve and suspend companies'}
  ];

  /* ---------- sample creators ---------- */
  function insights(r, f, er){
    var score = Math.round(35 + r() * 62), label = score >= 70 ? 'Genuine' : score >= 45 ? 'Check' : 'Suspicious';
    var reels = Math.round(45 + r() * 40), car = Math.round((100 - reels) * 0.6), ph = 100 - reels - car;
    var e = er * 100, re = e * (1.1 + r() * 0.6), ce = e * (0.8 + r() * 0.3), pe = e * (0.6 + r() * 0.3), lift = Math.round(-45 + r() * 60);
    var sp = Math.round(r() * 5);
    return {quality: label + ' · ' + score + '/100', quality_score: score,
      quality_why: (label === 'Genuine' ? 'ER ' + e.toFixed(2) + '% is normal for the size. Reels reach ' + Math.round(30 + r() * 40) + '% of followers' : label === 'Check' ? '1 normal post has a sudden like spike with few comments. ER ' + e.toFixed(2) + '% is normal for the size' : 'ER ' + e.toFixed(2) + '% is low for the size. Very few comments for the likes') + '. Based on ' + (25 - sp) + ' organic posts; sponsored posts are left out.',
      organic_er: +e.toFixed(2), sponsored_er: sp ? +(e * (1 + lift / 100)).toFixed(2) : null,
      sponsored_lift: sp ? (lift >= 0 ? '+' : '') + lift + '% · ' + (Math.abs(lift) < 10 ? 'Same as organic' : lift > 0 ? 'Sponsored does better' : 'Sponsored does worse') + ' (' + sp + ' sponsored, ' + (25 - sp) + ' organic)' : 'No sponsored posts in last 25',
      boosted: sp ? (r() < 0.4 ? '1 of ' + sp + ' sponsored posts look boosted (paid promotion)' : 'None') : '',
      best_format: 'Reels (' + (re / pe).toFixed(1) + 'x the ER of Photo)',
      content_mix: 'Reels ' + reels + '% (' + Math.round(reels / 4) + ' posts) · ER ' + re.toFixed(2) + '% · ' + sh(f * (0.3 + r() * 0.6)) + ' views | Carousel ' + car + '% (' + Math.round(car / 4) + ' posts) · ER ' + ce.toFixed(2) + '% | Photo ' + ph + '% (' + Math.max(1, Math.round(ph / 4)) + ' posts) · ER ' + pe.toFixed(2) + '%'};
  }
  function fakeIg(handle, competitors){
    var r = rng(hashStr(handle)); var f = Math.round(Math.pow(10, 3.6 + r() * 2.6));
    var er = (f < 1e4 ? 3 + r() * 4 : f < 1e5 ? 1.2 + r() * 3.5 : f < 1e6 ? 0.8 + r() * 2.2 : 0.4 + r() * 1.4) / 100;
    var eng = f * er; var views = Math.round(f * (0.4 + r() * 1.4));
    var comps = String(competitors || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    var hit = comps.length && r() < 0.3 ? comps[Math.floor(r() * comps.length)] : '';
    var cats = ['Beauty', 'Skincare', 'Lifestyle', 'Fashion', 'Food', 'Fitness'], langs = ['Hindi', 'English', 'Hindi, English'];
    return Object.assign({followers: f, posts: Math.round(80 + r() * 1500), likes: Math.round(eng * 0.96), comments: Math.round(eng * 0.04), views: views,
      competitors: hit ? hit + ' (1 post, 1 marked as ad/collab, latest ' + new Date(Date.now() - r() * 40 * 864e5).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'}) + ')' : 'None found',
      collabs: r() < 0.5 ? '@brand.' + Math.floor(r() * 90 + 10) + ', @sample.label' : 'None found',
      category: cats[Math.floor(r() * cats.length)], language: langs[Math.floor(r() * langs.length)], reach: Math.round(views * 0.8),
      collab_price: Math.round(f * (0.25 + r() * 0.4) / 500) * 500, ad_rights_price: Math.round(f * (0.06 + r() * 0.1) / 500) * 500}, insights(r, f, er));
  }
  function creatorRow(co, owner, name, extra, ago){
    var base = {id: uid(), company_id: co, owner_id: owner, name: name, platform: 'Instagram', source: 'Instagram API', category: null, language: null, link: 'https://www.instagram.com/' + name + '/', yt_link: null,
      followers: null, views: null, reach: null, likes: null, comments: null, posts: null, sentiment: null, deliverables: null, collab_price: null, ad_rights_price: null, fee: null,
      quality: null, quality_score: null, quality_why: null, organic_er: null, sponsored_er: null, sponsored_lift: null, boosted: null, best_format: null, content_mix: null,
      competitors: null, collabs: null, status: null, fetched_at: daysAgo(ago || 1), created_at: daysAgo((ago || 1) + 3), updated_at: daysAgo(ago || 1)};
    return Object.assign(base, extra || {});
  }

  function seed(){
    var t = now();
    var P = {};
    PERSONAS.forEach(function(p){ P[p.id] = {id: p.id, email: p.email, full_name: p.name, avatar_url: null, created_at: daysAgo(60)}; });
    P['u-v'] = {id: 'u-v', email: 'vanshika@glowkart.in', full_name: 'Vanshika Juyal', avatar_url: null, created_at: daysAgo(40)};
    P['u-k'] = {id: 'u-k', email: 'kabir@urbanthreads.in', full_name: 'Kabir Rao', avatar_url: null, created_at: daysAgo(3)};
    P['u-s'] = {id: 'u-s', email: 'sana@oldbrand.in', full_name: 'Sana Iqbal', avatar_url: null, created_at: daysAgo(200)};
    var G = 'c-glowkart', U = 'c-urban', O = 'c-oldbrand';
    var d = {
      profiles: P, platform_admins: ['udayruhil.82@gmail.com'], plans: JSON.parse(JSON.stringify(DEFAULT_PLANS)),
      companies: [
        {id: G, name: 'Glowkart Beauty', legal_name: 'Glowkart Retail Pvt Ltd', gstin: '27ABCDE1234F1Z5', phone: '+91 98200 11223', owner_id: 'u-admin', plan_id: 'growth', billing_cycle: 'monthly', status: 'active', ig_account_limit: 3, seat_limit: 15, current_period_end: daysAgo(-24), approved_at: daysAgo(36), approved_by: 'u-owner', status_note: null, created_at: daysAgo(38)},
        {id: U, name: 'Urban Threads', legal_name: null, gstin: null, phone: null, owner_id: 'u-k', plan_id: 'starter', billing_cycle: 'yearly', status: 'pending_approval', ig_account_limit: 0, seat_limit: 1, current_period_end: null, approved_at: null, approved_by: null, status_note: null, created_at: daysAgo(1)},
        {id: O, name: 'Old Brand Co', legal_name: null, gstin: null, phone: null, owner_id: 'u-s', plan_id: 'starter', billing_cycle: 'monthly', status: 'suspended', ig_account_limit: 1, seat_limit: 5, current_period_end: daysAgo(12), approved_at: daysAgo(160), approved_by: 'u-owner', status_note: 'Payment reversed', created_at: daysAgo(190)}
      ],
      members: [
        {company_id: G, user_id: 'u-admin', role: 'admin', created_at: daysAgo(38)}, {company_id: G, user_id: 'u-member', role: 'member', created_at: daysAgo(30)}, {company_id: G, user_id: 'u-v', role: 'member', created_at: daysAgo(20)},
        {company_id: U, user_id: 'u-k', role: 'admin', created_at: daysAgo(1)}, {company_id: O, user_id: 'u-s', role: 'admin', created_at: daysAgo(190)}
      ],
      invitations: [
        {id: uid(), company_id: G, email: 'neha@snackyco.in', role: 'member', status: 'pending', invited_by: 'u-admin', created_at: daysAgo(2), expires_at: daysAgo(-12)},
        {id: uid(), company_id: G, email: 'dev@glowkart.in', role: 'member', status: 'pending', invited_by: 'u-admin', created_at: daysAgo(1), expires_at: daysAgo(-13)}
      ],
      connections: [{id: 'ig-1', company_id: G, ig_user_id: '1784', username: 'glowkart.beauty', page_id: 'p1', page_name: 'Glowkart Beauty', status: 'active', connected_by: 'u-admin', last_checked_at: daysAgo(0, 3), last_error: null, created_at: daysAgo(35)}],
      budget: {'ig-1': {hour: hourStart(), used: 37}},
      payments: [
        {id: uid(), company_id: G, plan_id: 'growth', billing_cycle: 'monthly', amount_paise: 999900, currency: 'INR', razorpay_order_id: 'order_pv1', razorpay_payment_id: 'pay_PV8sd7A1', status: 'paid', created_by: 'u-admin', created_at: daysAgo(37), paid_at: daysAgo(37)},
        {id: uid(), company_id: G, plan_id: 'growth', billing_cycle: 'monthly', amount_paise: 999900, currency: 'INR', razorpay_order_id: 'order_pv2', razorpay_payment_id: 'pay_PV93kQ2', status: 'paid', created_by: 'u-admin', created_at: daysAgo(7), paid_at: daysAgo(7)},
        {id: uid(), company_id: U, plan_id: 'starter', billing_cycle: 'yearly', amount_paise: 4999000, currency: 'INR', razorpay_order_id: 'order_pv3', razorpay_payment_id: 'pay_PVu71', status: 'paid', created_by: 'u-k', created_at: daysAgo(1), paid_at: daysAgo(1)},
        {id: uid(), company_id: O, plan_id: 'starter', billing_cycle: 'monthly', amount_paise: 499900, currency: 'INR', razorpay_order_id: 'order_pv4', razorpay_payment_id: 'pay_PVo1', status: 'paid', created_by: 'u-s', created_at: daysAgo(42), paid_at: daysAgo(42)}
      ],
      creators: [], posts: [], settings: [], usage: [], audit: []
    };
    var comp = 'Dove, Mamaearth, Pears, Lux, Nivea, Plum, The Body Shop, Biotique';
    d.settings.push({company_id: G, owner_id: 'u-admin', name: 'Festive glow launch', budget: 400000, start_date: daysAgo(14).slice(0, 10), end_date: daysAgo(-16).slice(0, 10), competitors: comp, updated_at: t});
    d.settings.push({company_id: G, owner_id: 'u-member', name: 'Winter skincare', budget: 150000, start_date: daysAgo(5).slice(0, 10), end_date: daysAgo(-25).slice(0, 10), competitors: comp, updated_at: t});
    var mk = function(owner, name, extra, ago){ var c = creatorRow(G, owner, name, Object.assign(fakeIg(name, comp), {status: '✓ Based on last 12 posts (9 with views)'}, extra), ago); d.creators.push(c); return c; };
    mk('u-admin', 'glow.with.anaya', {followers: 64000, views: 72000, likes: 4100, comments: 160, fee: 28000, competitors: 'None found', sentiment: 'Asks about routine, positive', deliverables: '1 Reel + 2 Stories with link'}, 1);
    mk('u-admin', 'mumbai.beautyedit', {followers: 480000, views: 410000, likes: 9800, comments: 300, fee: 180000, competitors: 'Dove (2 posts, 1 marked as ad/collab, latest 3 Oct 2026)'}, 2);
    mk('u-admin', 'campus.diaries.jpr', {followers: 9200, views: 14500, likes: 520, comments: 40, fee: 6000}, 3);
    mk('u-admin', 'delhi.lifestyle.co', {followers: 1900000, views: 820000, likes: 14000, comments: 380, fee: 450000}, 1);
    mk('u-admin', 'groomed.in.blr', {followers: 88000, views: 41000, likes: 1200, comments: 45, fee: 35000}, 4);
    mk('u-admin', 'wellness.hyd', {followers: 310000, views: 260000, likes: 6900, comments: 210}, 2);
    d.creators.push(creatorRow(G, 'u-admin', 'Kitchen Diaries with Meera', {platform: 'YouTube', source: 'Manual', link: null, yt_link: 'youtube.com/@kitchendiaries', followers: 240000, views: 90000, likes: 5200, comments: 310, fee: 45000, category: 'Food', language: 'Hindi', status: 'Entered manually', deliverables: '1 integrated video'}, 5));
    mk('u-member', 'skin.by.sneha', {followers: 41000, views: 38000, likes: 2100, comments: 95, fee: 15000}, 1);
    mk('u-member', 'pune.makeup.files', {followers: 152000, views: 99000, likes: 3600, comments: 140, fee: 52000}, 2);
    mk('u-v', 'goa.glowup', {followers: 23000, views: 31000, likes: 1900, comments: 88, fee: 9000}, 3);
    var post = function(owner, handle, code, fee, views, likes, comments, ago){ d.posts.push({id: uid(), company_id: G, owner_id: owner, post_code: code, handle: handle, link: 'https://www.instagram.com/reel/' + code + '/', platform: 'Instagram', fee: fee, views: views, likes: likes, comments: comments, media_type: 'REELS', posted_at: daysAgo(ago), status: '✓ Numbers fetched from Instagram', created_at: daysAgo(ago), updated_at: daysAgo(0, 2)}); };
    post('u-admin', 'glow.with.anaya', 'DGa1Xk2', 28000, 98000, 6200, 410, 11);
    post('u-admin', 'mumbai.beautyedit', 'DGb7Pq9', 180000, 620000, 21400, 860, 10);
    post('u-admin', 'campus.diaries.jpr', 'DGc3Lm4', 6000, 21000, 1800, 190, 9);
    post('u-admin', 'groomed.in.blr', 'DGd8Rt1', 35000, 71000, 3100, 140, 7);
    d.posts.push({id: uid(), company_id: G, owner_id: 'u-admin', post_code: 'M1A2B3C4D', handle: 'Kitchen Diaries with Meera', link: null, platform: 'YouTube', fee: 45000, views: 120000, likes: 6100, comments: 420, media_type: null, posted_at: null, status: 'Entered manually', created_at: daysAgo(6), updated_at: daysAgo(6)});
    post('u-member', 'skin.by.sneha', 'DGe2Wq7', 15000, 44000, 2500, 120, 3);
    var ppl = ['u-admin', 'u-member', 'u-v'];
    for (var i = 0; i < 30; i++) { var n = Math.round(4 + Math.abs(Math.sin(i * 1.7)) * 18); for (var j = 0; j < n; j++) d.usage.push({company_id: G, user_id: ppl[(i + j) % 3], connection_id: 'ig-1', handle: 'h' + j, cached: j % 4 === 0, ok: j % 11 !== 5, created_at: daysAgo(i, j % 9)}); }
    [['company.created', 'u-admin', {name: 'Glowkart Beauty'}, 38], ['billing.paid', 'u-admin', {plan: 'growth', amount_paise: 999900}, 37], ['platform.approved', 'u-owner', {plan: 'growth', cycle: 'monthly', seats: 15, ig: 3}, 36], ['instagram.connected', 'u-admin', {username: 'glowkart.beauty'}, 35],
     ['member.invited', 'u-admin', {email: 'riya@glowkart.in', role: 'member'}, 31], ['member.joined', 'u-member', {email: 'riya@glowkart.in', role: 'member'}, 30], ['member.joined', 'u-v', {email: 'vanshika@glowkart.in', role: 'member'}, 20], ['billing.renewed', 'u-admin', {amount_paise: 999900}, 7],
     ['member.invited', 'u-admin', {email: 'neha@snackyco.in', role: 'member'}, 2], ['member.invited', 'u-admin', {email: 'dev@glowkart.in', role: 'member'}, 1]]
      .forEach(function(a){ d.audit.push({company_id: G, actor_id: a[1], action: a[0], details: a[2], created_at: daysAgo(a[3])}); });
    return d;
  }
  function hourStart(){ var d = new Date(); d.setMinutes(0, 0, 0); return d.toISOString(); }

  /* ---------- access helpers (mirror the database rules) ---------- */
  var me = function(){ return store(UKEY); };
  function prof(){ var p = db.profiles[me()]; if (!p) fail('Please sign in.', 'AUTH'); return p; }
  function company(id){ return db.companies.find(function(c){ return c.id === id; }); }
  function member(cid, u){ return db.members.find(function(m){ return m.company_id === cid && m.user_id === (u || me()); }); }
  function isActive(c){ return c && c.status === 'active' && (!c.current_period_end || new Date(c.current_period_end) > Date.now()); }
  function isPlatform(){ var p = db.profiles[me()]; return !!p && db.platform_admins.indexOf(p.email) >= 0; }
  function need(b, opts){ opts = opts || {}; var c = company(b.companyId); var m = c && member(c.id);
    if (!m) fail('You are not a member of this company.', 'FORBIDDEN');
    if (opts.admin && m.role !== 'admin') fail('Only company admins can do this.', 'FORBIDDEN');
    if (opts.active !== false && !isActive(c)) fail('This company\'s plan is not active. The company admin can check Billing.', 'INACTIVE');
    return {c: c, m: m}; }
  function audit(cid, action, det){ db.audit.push({company_id: cid, actor_id: me(), action: action, details: det || {}, created_at: now()}); }
  function capacity(cid){ var h = hourStart();
    return db.connections.filter(function(x){ return x.company_id === cid && x.status !== 'revoked'; }).map(function(x){ var b = db.budget[x.id]; var used = b && b.hour === h ? b.used : 0;
      return {connection_id: x.id, username: x.username, status: x.status, used_this_hour: used, hourly_limit: 150, resets_at: new Date(new Date(h).getTime() + 36e5).toISOString()}; }); }
  function reserve(cid, n){ var h = hourStart(); var act = db.connections.filter(function(x){ return x.company_id === cid && x.status === 'active'; }); var got = 0, conn = null;
    act.forEach(function(x){ var b = db.budget[x.id]; if (!b || b.hour !== h) b = db.budget[x.id] = {hour: h, used: 0}; var g = Math.max(0, Math.min(n - got, 150 - b.used)); b.used += g; got += g; if (g) conn = x.id; }); return {got: got, conn: conn, any: act.length}; }
  function withEmail(rows){ return rows.map(function(r){ var p = db.profiles[r.owner_id] || {}; return Object.assign({}, r, {owner_email: p.email}); }); }
  function settingsOf(cid, u){ return db.settings.find(function(s){ return s.company_id === cid && s.owner_id === (u || me()); }); }
  function clean(fields, allowed){ var o = {}; Object.keys(fields || {}).forEach(function(k){ if (allowed.indexOf(k) < 0) return; var v = fields[k];
    o[k] = ['reach', 'collab_price', 'ad_rights_price', 'fee', 'followers', 'views', 'likes', 'comments', 'posts'].indexOf(k) >= 0 ? (v === '' || v == null || !isFinite(+v) || +v <= 0 ? null : +v) : (String(v == null ? '' : v).trim() || null); }); return o; }
  var EDITABLE = ['category', 'language', 'link', 'yt_link', 'reach', 'sentiment', 'deliverables', 'collab_price', 'ad_rights_price', 'fee', 'platform'];
  var MANUAL = ['followers', 'views', 'likes', 'comments', 'posts'];
  var PLATS = ['Instagram', 'Instagram Story', 'YouTube', 'YouTube Shorts', 'Moj / Josh', 'Other'];
  var HANDLE = /^[a-z0-9._]{1,30}$/;

  function lookup(b, c, handles, fee){
    var comps = (settingsOf(c.id) || {}).competitors || '';
    var report = [], rows = [], h = hourStart();
    var anyConn = db.connections.some(function(x){ return x.company_id === c.id && x.status === 'active'; });
    handles.forEach(function(hd){
      var cachedRow = db.creators.find(function(x){ return x.company_id === c.id && x.name.toLowerCase() === hd && x.fetched_at && Date.now() - new Date(x.fetched_at) < 6 * 36e5 && x.source === 'Instagram API' && x.followers; });
      var ex = db.creators.find(function(x){ return x.company_id === c.id && x.owner_id === me() && x.name.toLowerCase() === hd; });
      if (!anyConn) { report.push({handle: hd, ok: false, cached: false, message: 'No Instagram account is connected yet. Ask your company admin to connect one in Settings.'}); if (ex) ex.status = '✗ No Instagram account connected'; return; }
      var cached = !!cachedRow;
      if (!cached) { var r = reserve(c.id, 1); if (!r.got) { report.push({handle: hd, ok: false, cached: false, message: 'This hour\'s Instagram lookups are used up. Try again after ' + new Date(new Date(h).getTime() + 36e5).toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'}) + '.'}); return; } }
      if (/^(notfound|xx|private)/.test(hd) || hd.length < 3) { db.usage.push({company_id: c.id, user_id: me(), connection_id: 'ig-1', handle: hd, cached: false, ok: false, created_at: now()}); report.push({handle: hd, ok: false, cached: false, message: 'No Instagram Business or Creator account called @' + hd + '. Check the spelling; personal accounts can’t be looked up.'}); if (ex) ex.status = '✗ Not found'; return; }
      db.usage.push({company_id: c.id, user_id: me(), connection_id: 'ig-1', handle: hd, cached: cached, ok: true, created_at: now()});
      var f = fakeIg(hd, comps);
      var always = {followers: f.followers, posts: f.posts, likes: f.likes, comments: f.comments, views: f.views, competitors: f.competitors, collabs: f.collabs, quality: f.quality, quality_score: f.quality_score, quality_why: f.quality_why,
        organic_er: f.organic_er, sponsored_er: f.sponsored_er, sponsored_lift: f.sponsored_lift, boosted: f.boosted, best_format: f.best_format, content_mix: f.content_mix,
        status: '✓ Based on last 12 posts (9 with views) [preview numbers]', fetched_at: now(), source: 'Instagram API', link: 'https://www.instagram.com/' + hd + '/', platform: 'Instagram', updated_at: now()};
      var fill = {category: f.category, language: f.language, reach: f.reach, collab_price: f.collab_price, ad_rights_price: f.ad_rights_price};
      var row = ex || creatorRow(c.id, me(), hd, {}, 0);
      Object.assign(row, always); Object.keys(fill).forEach(function(k){ if (row[k] == null || row[k] === '') row[k] = fill[k]; });
      if (fee != null) row.fee = fee;
      if (!ex) db.creators.push(row);
      rows.push(Object.assign({}, row)); report.push({handle: hd, ok: true, cached: cached, message: cached ? 'From cache (no lookup used)' : 'Fetched'});
    });
    return {creators: rows, results: report};
  }
  function handlesFrom(v){ var arr = Array.isArray(v) ? v : [v]; var hs = []; arr.forEach(function(x){ var h = cleanHandle(x); if (h && hs.indexOf(h) < 0) hs.push(h); });
    var bad = hs.filter(function(h){ return !HANDLE.test(h); }); if (bad.length) fail('These are not Instagram handles: ' + bad.slice(0, 5).join(', '), 'INVALID');
    if (!hs.length) fail('Type an Instagram handle, like itss.vanshikaaa', 'INVALID'); if (hs.length > 25) fail('Send at most 25 handles at a time.', 'INVALID'); return hs; }

  var A = {
    'me': function(){ var p = prof();
      return {profile: p, is_platform_admin: isPlatform(), plans: db.plans,
        companies: db.members.filter(function(m){ return m.user_id === p.id; }).map(function(m){ var c = company(m.company_id);
          return {id: c.id, name: c.name, role: m.role, status: c.status, active: isActive(c), plan_id: c.plan_id, billing_cycle: c.billing_cycle, seat_limit: c.seat_limit, ig_account_limit: c.ig_account_limit, current_period_end: c.current_period_end, is_owner: c.owner_id === p.id,
            members: db.members.filter(function(x){ return x.company_id === c.id; }).length, ig_accounts: db.connections.filter(function(x){ return x.company_id === c.id && x.status === 'active'; }).length}; }),
        invitations: db.invitations.filter(function(i){ return i.status === 'pending' && i.email === p.email && new Date(i.expires_at) > Date.now(); }).map(function(i){ return {id: i.id, company_id: i.company_id, company_name: company(i.company_id).name, role: i.role, expires_at: i.expires_at}; })}; },
    'company.create': function(b){ prof(); var name = String(b.name || '').trim(); if (name.length < 2) fail('Company name must be 2 to 120 characters.', 'INVALID');
      if (db.companies.filter(function(c){ return c.owner_id === me() && c.status !== 'cancelled'; }).length >= 3) fail('you already own 3 companies.', 'LIMIT');
      var c = {id: uid(), name: name, legal_name: b.legalName || null, gstin: b.gstin || null, phone: b.phone || null, owner_id: me(), plan_id: null, billing_cycle: null, status: 'pending_payment', ig_account_limit: 0, seat_limit: 1, current_period_end: null, approved_at: null, approved_by: null, status_note: null, created_at: now()};
      db.companies.push(c); db.members.push({company_id: c.id, user_id: me(), role: 'admin', created_at: now()}); audit(c.id, 'company.created', {name: name}); return {companyId: c.id}; },
    'company.get': function(b){ return {company: need(b, {active: false}).c}; },
    'company.update': function(b){ var c = need(b, {admin: true, active: false}).c; if ('name' in b) c.name = String(b.name).trim(); if ('legalName' in b) c.legal_name = b.legalName || null; if ('gstin' in b) c.gstin = String(b.gstin || '').toUpperCase() || null; if ('phone' in b) c.phone = b.phone || null; return {company: c}; },
    'members.list': function(b){ var x = need(b, {active: false}); var adm = x.m.role === 'admin';
      var members = db.members.filter(function(m){ return m.company_id === x.c.id; }).map(function(m){ var p = db.profiles[m.user_id]; return {user_id: m.user_id, role: m.role, created_at: m.created_at, email: p.email, full_name: p.full_name, avatar_url: p.avatar_url}; });
      var inv = adm ? db.invitations.filter(function(i){ return i.company_id === x.c.id && i.status === 'pending' && new Date(i.expires_at) > Date.now(); }) : [];
      return {members: members, invitations: inv, seatLimit: x.c.seat_limit, seatsUsed: members.length + inv.length}; },
    'invites.create': function(b){ var x = need(b, {admin: true}); var em = String(b.email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) fail('That email address does not look right.', 'INVALID');
      if (db.members.some(function(m){ return m.company_id === x.c.id && db.profiles[m.user_id].email === em; })) fail('this person is already in the team.', 'EXISTS');
      var used = db.members.filter(function(m){ return m.company_id === x.c.id; }).length + db.invitations.filter(function(i){ return i.company_id === x.c.id && i.status === 'pending' && new Date(i.expires_at) > Date.now(); }).length;
      if (used >= x.c.seat_limit) fail('Your plan allows ' + x.c.seat_limit + ' team members, including open invites. Remove someone or change plan.', 'SEAT_LIMIT');
      if (db.invitations.some(function(i){ return i.company_id === x.c.id && i.email === em && i.status === 'pending'; })) fail('This already exists.', 'EXISTS');
      var inv = {id: uid(), company_id: x.c.id, email: em, role: b.role === 'admin' ? 'admin' : 'member', status: 'pending', invited_by: me(), created_at: now(), expires_at: daysAgo(-14)};
      db.invitations.push(inv); audit(x.c.id, 'member.invited', {email: em, role: inv.role}); return {invitationId: inv.id, email: em}; },
    'invites.revoke': function(b){ var i = db.invitations.find(function(x){ return x.id === b.invitationId && x.status === 'pending'; }); if (!i || !member(i.company_id) || member(i.company_id).role !== 'admin') fail('invitation not found.', 'FORBIDDEN'); i.status = 'revoked'; audit(i.company_id, 'member.invite_revoked', {}); return {revoked: true}; },
    'invites.accept': function(b){ var p = prof(); var i = db.invitations.find(function(x){ return x.id === b.invitationId; });
      if (!i || i.status !== 'pending' || i.email !== p.email) fail('invitation not found for your email.', 'FORBIDDEN');
      if (!isActive(company(i.company_id))) fail('the company plan is not active.', 'INACTIVE');
      if (!member(i.company_id)) db.members.push({company_id: i.company_id, user_id: p.id, role: i.role, created_at: now()});
      i.status = 'accepted'; audit(i.company_id, 'member.joined', {email: p.email, role: i.role}); return {companyId: i.company_id}; },
    'members.remove': function(b){ var x = need(b, {active: false}); if (x.m.role !== 'admin' && b.userId !== me()) fail('only company admins can remove members.', 'FORBIDDEN');
      if (b.userId === x.c.owner_id && b.userId !== me()) fail('The company owner can’t be removed.', 'OWNER');
      var tgt = member(x.c.id, b.userId); if (tgt && tgt.role === 'admin' && db.members.filter(function(m){ return m.company_id === x.c.id && m.role === 'admin'; }).length === 1) fail('A company needs at least one admin.', 'LAST_ADMIN');
      db.members = db.members.filter(function(m){ return !(m.company_id === x.c.id && m.user_id === b.userId); }); audit(x.c.id, b.userId === me() ? 'member.left' : 'member.removed', {}); return {removed: true}; },
    'members.role': function(b){ var x = need(b, {admin: true, active: false}); var t = member(x.c.id, b.userId); if (!t) fail('member not found.', 'NOT_FOUND');
      if (t.role === 'admin' && b.role !== 'admin' && db.members.filter(function(m){ return m.company_id === x.c.id && m.role === 'admin'; }).length === 1) fail('A company needs at least one admin.', 'LAST_ADMIN');
      if (b.userId === x.c.owner_id && b.role !== 'admin') fail('The company owner stays an admin.', 'OWNER');
      t.role = b.role === 'admin' ? 'admin' : 'member'; audit(x.c.id, 'member.role_changed', {role: t.role}); return {updated: true}; },
    'usage.get': function(b){ var x = need(b, {admin: true, active: false}); var days = Math.min(365, Math.max(1, +b.days || 30)); var since = Date.now() - days * 864e5;
      var U = db.usage.filter(function(u){ return u.company_id === x.c.id && new Date(u.created_at) > since; });
      var members = db.members.filter(function(m){ return m.company_id === x.c.id; }).map(function(m){ var p = db.profiles[m.user_id], mine = U.filter(function(u){ return u.user_id === m.user_id; });
        return {user_id: m.user_id, email: p.email, full_name: p.full_name, lookups: mine.filter(function(u){ return !u.cached && u.ok; }).length, from_cache: mine.filter(function(u){ return u.cached; }).length, failed: mine.filter(function(u){ return !u.ok; }).length, last_lookup: mine.length ? mine.map(function(u){ return u.created_at; }).sort().pop() : null}; }).sort(function(a, b2){ return b2.lookups - a.lookups; });
      var byDay = {}; U.forEach(function(u){ var k = new Date(u.created_at).toLocaleDateString('en-CA', {timeZone: 'Asia/Kolkata'}); var d = byDay[k] || (byDay[k] = {day: k, lookups: 0, from_cache: 0}); if (u.cached) d.from_cache++; else if (u.ok) d.lookups++; });
      return {days: days, members: members, daily: Object.keys(byDay).sort().map(function(k){ return byDay[k]; }), capacity: capacity(x.c.id)}; },
    'audit.list': function(b){ var x = need(b, {admin: true, active: false});
      return {log: db.audit.filter(function(a){ return a.company_id === x.c.id; }).slice().reverse().map(function(a){ return {action: a.action, details: a.details, created_at: a.created_at, actor_email: (db.profiles[a.actor_id] || {}).email || null}; })}; },
    'billing.order': function(b){ var x = need(b, {admin: true, active: false}); var p = db.plans.find(function(y){ return y.id === b.planId; }); if (!p) fail('Choose a plan.', 'PLAN');
      if (!p.self_checkout) fail('This plan is set up with our team. Please contact us.', 'PLAN');
      if (x.c.status === 'pending_approval') fail('Payment received. Your plan is waiting for approval.', 'ALREADY_PAID');
      if (x.c.status === 'suspended') fail('This company is suspended. Please contact us.', 'SUSPENDED');
      var cyc = cycleInfo(b.cycle).id, amt = cyclePrice(p, cyc);
      var oid = 'order_pv' + Date.now().toString(36);
      db.payments.push({id: uid(), company_id: x.c.id, plan_id: p.id, billing_cycle: cyc, amount_paise: amt, currency: 'INR', razorpay_order_id: oid, razorpay_payment_id: null, status: 'created', created_by: me(), created_at: now(), paid_at: null});
      var pr = prof(); return {keyId: 'rzp_test_preview', orderId: oid, amount: amt, currency: 'INR', name: 'My Creator Desk', description: p.name + ' plan (' + cyc + ')', prefill: {email: pr.email, name: pr.full_name}, companyName: x.c.name}; },
    'billing.verify': function(b){ var pay = db.payments.find(function(p){ return p.razorpay_order_id === b.orderId; }); if (!pay) fail('Unknown order.', 'NOT_FOUND');
      if (b.signature !== 'preview-ok') fail('Payment could not be verified.', 'PAYMENT');
      if (pay.status === 'paid') return {result: 'already_paid', companyId: pay.company_id};
      pay.status = 'paid'; pay.razorpay_payment_id = b.paymentId; pay.paid_at = now();
      var c = company(pay.company_id);
      if (c.status === 'active' && c.plan_id === pay.plan_id) { c.billing_cycle = pay.billing_cycle; var base = Math.max(Date.now(), new Date(c.current_period_end || Date.now()).getTime()); var e = new Date(base); e.setMonth(e.getMonth() + cycleInfo(pay.billing_cycle).months); c.current_period_end = e.toISOString(); audit(c.id, 'billing.renewed', {amount_paise: pay.amount_paise}); return {result: 'renewed', companyId: c.id}; }
      c.plan_id = pay.plan_id; c.billing_cycle = pay.billing_cycle; if (c.status === 'pending_payment' || c.status === 'cancelled') c.status = 'pending_approval';
      audit(c.id, 'billing.paid', {plan: pay.plan_id, amount_paise: pay.amount_paise}); return {result: 'awaiting_approval', companyId: c.id}; },
    'billing.history': function(b){ var x = need(b, {admin: true, active: false}); return {payments: db.payments.filter(function(p){ return p.company_id === x.c.id; }).slice().sort(function(a, b2){ return b2.created_at.localeCompare(a.created_at); })}; },
    'ig.connect': function(b){ var x = need(b, {admin: true}); if (b.redirectUri !== location.origin + '/') fail('This page is not allowed to connect Instagram.', 'INVALID');
      var accounts = [{igUserId: '9001', username: x.c.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, ''), pageName: x.c.name}, {igUserId: '9002', username: x.c.name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.offers', pageName: x.c.name + ' Offers'}];
      var act = db.connections.filter(function(y){ return y.company_id === x.c.id && y.status === 'active'; });
      if (!b.igUserId && act.length === 0) accounts = accounts.slice(0, 1);
      var acct = b.igUserId ? accounts.find(function(a){ return a.igUserId === b.igUserId; }) : accounts.length === 1 ? accounts[0] : null;
      if (!acct) return {choose: accounts};
      var ex = db.connections.find(function(y){ return y.company_id === x.c.id && y.ig_user_id === acct.igUserId; });
      if (!ex || ex.status !== 'active') { if (act.length >= x.c.ig_account_limit) fail('Your plan allows ' + x.c.ig_account_limit + ' Instagram account' + (x.c.ig_account_limit === 1 ? '' : 's') + '. Disconnect one or change plan.', 'IG_LIMIT'); }
      if (ex) Object.assign(ex, {status: 'active', last_error: null, last_checked_at: now(), username: acct.username});
      else { ex = {id: uid(), company_id: x.c.id, ig_user_id: acct.igUserId, username: acct.username, page_id: 'p' + acct.igUserId, page_name: acct.pageName, status: 'active', connected_by: me(), last_checked_at: now(), last_error: null, created_at: now()}; db.connections.push(ex); }
      audit(x.c.id, 'instagram.connected', {username: acct.username}); return {connection: {id: ex.id, username: ex.username, page_name: ex.page_name, status: ex.status}}; },
    'ig.disconnect': function(b){ var x = need(b, {admin: true, active: false}); var cn = db.connections.find(function(y){ return y.id === b.connectionId && y.company_id === x.c.id; }); if (!cn) fail('Connection not found.', 'NOT_FOUND');
      cn.status = 'revoked'; audit(x.c.id, 'instagram.disconnected', {username: cn.username}); return {disconnected: true}; },
    'ig.test': function(b){ var x = need(b); var cn = db.connections.find(function(y){ return y.id === b.connectionId && y.company_id === x.c.id && y.status === 'active'; }); if (!cn) fail('Active connection not found.', 'NOT_FOUND');
      var r = reserve(x.c.id, 1); if (!r.got) return {ok: false, message: 'This account\'s hourly limit is used up. Try after the hour resets.'};
      cn.last_checked_at = now(); return {ok: true, message: 'Connected as @' + cn.username, capacity: capacity(x.c.id).find(function(y){ return y.connection_id === cn.id; })}; },
    'work.state': function(b){ var x = need(b, {active: false}); var team = b.scope === 'team' && x.m.role === 'admin';
      var mineF = function(r){ return r.company_id === x.c.id && (team || r.owner_id === me()); };
      return {creators: withEmail(db.creators.filter(mineF)).sort(function(a, b2){ return String(b2.updated_at).localeCompare(String(a.updated_at)); }), posts: withEmail(db.posts.filter(mineF)), settings: settingsOf(x.c.id) || null,
        connections: db.connections.filter(function(y){ return y.company_id === x.c.id && y.status !== 'revoked'; }).map(function(y){ return {id: y.id, username: y.username, page_name: y.page_name, status: y.status, last_error: y.last_error, last_checked_at: y.last_checked_at, created_at: y.created_at}; }),
        capacity: capacity(x.c.id), scope: team ? 'team' : 'mine', active: isActive(x.c), admin: x.m.role === 'admin'}; },
    'creators.lookup': function(b){ var x = need(b); return lookup(b, x.c, handlesFrom(b.handles || b.handle), b.fee != null && +b.fee > 0 ? +b.fee : null); },
    'creators.refresh': function(b){ var x = need(b);
      var stale = db.creators.filter(function(c){ return c.company_id === x.c.id && c.owner_id === me() && c.platform === 'Instagram' && c.source === 'Instagram API' && (!c.fetched_at || Date.now() - new Date(c.fetched_at) > 12 * 36e5 || !c.best_format); });
      var hs = stale.slice(0, 25).map(function(c){ return c.name.toLowerCase(); }).filter(function(h){ return HANDLE.test(h); });
      if (!hs.length) return {creators: [], results: [], remaining: 0};
      var r = lookup(b, x.c, hs);
      var left = db.creators.filter(function(c){ return c.company_id === x.c.id && c.owner_id === me() && c.platform === 'Instagram' && c.source === 'Instagram API' && (!c.fetched_at || Date.now() - new Date(c.fetched_at) > 12 * 36e5 || !c.best_format); }).length;
      return Object.assign(r, {remaining: left}); },
    'creators.save': function(b){ var x = need(b); var c = db.creators.find(function(y){ return y.id === b.id && y.company_id === x.c.id; }); if (!c) fail('Creator not found.', 'NOT_FOUND');
      if (c.owner_id !== me()) fail('You can only edit your own creators.', 'FORBIDDEN');
      var set = clean(b.fields, c.source === 'Manual' ? EDITABLE.concat(MANUAL) : EDITABLE); if (!Object.keys(set).length) fail('Nothing to save.', 'INVALID');
      if (set.platform && PLATS.indexOf(set.platform) < 0) set.platform = 'Other';
      Object.assign(c, set, {updated_at: now()}); return {creator: Object.assign({}, c)}; },
    'creators.add': function(b){ var x = need(b); var list = Array.isArray(b.rows) ? b.rows : [b.creator || {}]; if (list.length > 500) fail('Paste at most 500 rows at a time.', 'INVALID');
      var saved = [];
      list.forEach(function(r){ var name = String(r.name || '').trim().slice(0, 120); var lh = /instagram\.com\//i.test(String(r.link || '')) ? cleanHandle(r.link) : '';
        if (/instagram\.com\//i.test(name) || name.charAt(0) === '@') name = cleanHandle(name); if (!name && lh) name = lh; if (!name) return;
        var hl = HANDLE.test(name.toLowerCase()); var plat = PLATS.indexOf(r.platform) >= 0 ? r.platform : ((lh || hl) ? 'Instagram' : 'Other');
        var ig = b.manual !== true && plat === 'Instagram' && (lh || hl); if (ig) name = name.toLowerCase();
        var set = clean(r, EDITABLE.concat(MANUAL)); Object.keys(set).forEach(function(k){ if (set[k] == null) delete set[k]; }); set.platform = plat;
        if (!set.link && plat === 'Instagram' && hl) set.link = 'https://www.instagram.com/' + name + '/';
        set.source = ig ? 'Instagram API' : 'Manual'; set.status = ig ? 'Added. Use Refresh to fetch live numbers from Instagram.' : 'Entered manually'; set.updated_at = now();
        var ex = db.creators.find(function(y){ return y.company_id === x.c.id && y.owner_id === me() && y.name.toLowerCase() === name.toLowerCase(); });
        if (ex) Object.assign(ex, set); else { ex = creatorRow(x.c.id, me(), name, Object.assign(set, {fetched_at: null}), 0); ex.fetched_at = null; db.creators.push(ex); }
        saved.push(Object.assign({}, ex)); });
      return {creators: saved, added: saved.length}; },
    'creators.remove': function(b){ var x = need(b, {active: false}); var ids = Array.isArray(b.ids) ? b.ids : [b.id]; var n = 0;
      db.creators = db.creators.filter(function(c){ var go = c.company_id === x.c.id && ids.indexOf(c.id) >= 0 && (c.owner_id === me() || x.m.role === 'admin'); if (go) n++; return !go; }); return {removed: n}; },
    'creators.clear': function(b){ var x = need(b, {active: false}); var n = 0; db.creators = db.creators.filter(function(c){ var go = c.company_id === x.c.id && c.owner_id === me(); if (go) n++; return !go; }); return {removed: n}; },
    'settings.save': function(b){ var x = need(b); var s = b.settings || {}; var d = function(v){ return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null; };
      var row = settingsOf(x.c.id); if (!row) { row = {company_id: x.c.id, owner_id: me()}; db.settings.push(row); }
      Object.assign(row, {name: s.name || null, budget: s.budget != null && +s.budget > 0 ? +s.budget : null, start_date: d(s.start), end_date: d(s.end), competitors: s.competitors || null, updated_at: now()}); return {settings: Object.assign({}, row)}; },
    'posts.add': function(b){ var x = need(b); var p = b.post || {}; var plat = PLATS.indexOf(p.platform) >= 0 ? p.platform : 'Instagram';
      var code = shortcode(p.link); var isIg = !!code && plat.indexOf('Instagram') === 0 && plat !== 'Instagram Story';
      var handle = isIg ? cleanHandle(p.handle) : String(p.handle || '').trim(); if (!handle) fail('Add the creator\'s name or Instagram handle.', 'INVALID');
      if (isIg && !HANDLE.test(handle)) fail('That is not an Instagram handle.', 'INVALID');
      if (!isIg && !(+p.views > 0)) fail('For posts without an Instagram post link, type the views yourself.', 'INVALID');
      var views = +p.views || null, likes = +p.likes || null, comments = +p.comments || null, status = 'Entered manually', posted = null, mt = null;
      if (isIg) { var r = reserve(x.c.id, 1); if (!r.any) status = '✗ No Instagram account is connected yet. Ask your company admin to connect one in Settings.'; else if (!r.got) status = '✗ This hour\'s Instagram lookups are used up.';
        else { var g = rng(hashStr(code)); views = views || Math.round(20000 + g() * 160000); likes = Math.round(views * (0.03 + g() * 0.05)); comments = Math.round(likes * 0.05); status = '✓ Numbers fetched from Instagram [preview numbers]'; posted = daysAgo(Math.round(g() * 10)); mt = 'REELS';
          db.usage.push({company_id: x.c.id, user_id: me(), connection_id: r.conn, handle: handle, cached: false, ok: true, created_at: now()}); } }
      var pc = code || ('M' + uid().slice(0, 8).toUpperCase());
      var ex = db.posts.find(function(y){ return y.company_id === x.c.id && y.owner_id === me() && y.post_code === pc; });
      var row = ex || {id: uid(), company_id: x.c.id, owner_id: me(), post_code: pc, created_at: now()};
      Object.assign(row, {handle: handle, platform: plat, status: status, link: code ? 'https://www.instagram.com/p/' + code + '/' : (p.link || null), fee: +p.fee > 0 ? +p.fee : (row.fee || null), views: views != null ? views : row.views, likes: likes != null ? likes : row.likes, comments: comments != null ? comments : row.comments, media_type: mt || row.media_type || null, posted_at: posted || row.posted_at || null, updated_at: now()});
      if (!ex) db.posts.push(row); return {post: Object.assign({}, row), status: status}; },
    'posts.update': function(b){ var x = need(b); var p = db.posts.find(function(y){ return y.id === b.id && y.company_id === x.c.id && y.owner_id === me(); }); if (!p) fail('Post not found.', 'NOT_FOUND');
      var set = clean(b.fields, ['fee', 'views', 'likes', 'comments']); if (!Object.keys(set).length) fail('Nothing to save.', 'INVALID'); Object.assign(p, set, {updated_at: now()}); return {post: Object.assign({}, p)}; },
    'posts.remove': function(b){ var x = need(b, {active: false}); var n = db.posts.length; db.posts = db.posts.filter(function(p){ return !(p.id === b.id && p.company_id === x.c.id && (p.owner_id === me() || x.m.role === 'admin')); }); return {removed: n - db.posts.length}; },
    'posts.refresh': function(b){ var x = need(b); var ig = db.posts.filter(function(p){ return p.company_id === x.c.id && p.owner_id === me() && /^Instagram/.test(p.platform) && p.platform !== 'Instagram Story' && shortcode(p.link); });
      var hs = []; ig.forEach(function(p){ if (hs.indexOf(p.handle) < 0) hs.push(p.handle); }); var r = reserve(x.c.id, hs.length);
      if (!r.any && ig.length) return {refreshed: 0, errors: ['No Instagram account is connected yet.']};
      ig.forEach(function(p){ p.views = Math.round((p.views || 20000) * (1.01 + Math.random() * 0.06)); p.likes = Math.round((p.likes || 800) * (1 + Math.random() * 0.04)); p.status = '✓ Numbers fetched from Instagram [preview numbers]'; p.updated_at = now(); });
      return {refreshed: ig.length, errors: []}; },
    'platform.companies': function(){ if (!isPlatform()) fail('platform owners only.', 'FORBIDDEN');
      return {companies: db.companies.map(function(c){ var pays = db.payments.filter(function(p){ return p.company_id === c.id; }).sort(function(a, b2){ return b2.created_at.localeCompare(a.created_at); });
        return {id: c.id, name: c.name, owner_email: db.profiles[c.owner_id].email, status: c.status, plan_id: c.plan_id, billing_cycle: c.billing_cycle, seat_limit: c.seat_limit, ig_account_limit: c.ig_account_limit,
          members: db.members.filter(function(m){ return m.company_id === c.id; }).length, ig_accounts: db.connections.filter(function(y){ return y.company_id === c.id && y.status === 'active'; }).length,
          lookups_30d: db.usage.filter(function(u){ return u.company_id === c.id && !u.cached && Date.now() - new Date(u.created_at) < 30 * 864e5; }).length,
          last_payment_status: pays[0] ? pays[0].status : null, last_payment_paise: pays[0] ? pays[0].amount_paise : null, current_period_end: c.current_period_end, created_at: c.created_at}; })
        .sort(function(a, b2){ var o = function(s){ return s === 'pending_approval' ? 0 : s === 'active' ? 1 : 2; }; return o(a.status) - o(b2.status) || b2.created_at.localeCompare(a.created_at); })}; },
    'platform.approve': function(b){ if (!isPlatform()) fail('platform owners only.', 'FORBIDDEN'); var c = company(b.companyId); if (!c) fail('company not found.', 'NOT_FOUND');
      var p = db.plans.find(function(y){ return y.id === (b.planId || c.plan_id); }); if (!p) fail('choose a plan for this company.', 'PLAN');
      var cyc = cycleInfo(b.cycle || c.billing_cycle).id; var int = function(v){ return v === '' || v == null ? null : Math.max(0, Math.round(+v)); };
      var base = Math.max(Date.now(), new Date(c.current_period_end || Date.now()).getTime()); var e = new Date(base); e.setMonth(e.getMonth() + cycleInfo(cyc).months);
      Object.assign(c, {plan_id: p.id, billing_cycle: cyc, status: 'active', seat_limit: int(b.seatLimit) || p.seat_limit, ig_account_limit: int(b.igLimit) != null ? int(b.igLimit) : p.ig_account_limit, current_period_end: e.toISOString(), approved_at: now(), approved_by: me(), status_note: null});
      audit(c.id, 'platform.approved', {plan: p.id, cycle: cyc, seats: c.seat_limit, ig: c.ig_account_limit}); return {approved: true}; },
    'platform.status': function(b){ if (!isPlatform()) fail('platform owners only.', 'FORBIDDEN'); var c = company(b.companyId); if (!c) fail('company not found.', 'NOT_FOUND');
      if (['active', 'suspended', 'cancelled'].indexOf(b.status) < 0) fail('Status must be active, suspended or cancelled.', 'INVALID');
      if (b.status === 'active' && !c.plan_id) fail('approve the company with a plan first.', 'PLAN');
      c.status = b.status; c.status_note = b.note || null; audit(c.id, 'platform.status', {status: b.status, note: b.note || null}); return {updated: true}; },
    'platform.payments': function(b){ if (!isPlatform()) fail('platform owners only.', 'FORBIDDEN'); return {payments: db.payments.filter(function(p){ return p.company_id === b.companyId; }).slice().reverse()}; }
  };

  return {
    init: function(){ try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; } if (!db || !db.profiles) { db = seed(); save(); } },
    reset: function(){ db = seed(); save(); },
    personas: function(){ return PERSONAS; },
    user: function(){ var id = me(); var p = id && db.profiles[id]; return p ? {id: p.id, email: p.email, name: p.full_name, picture: p.avatar_url || ''} : null; },
    signIn: function(id){ store(UKEY, id); },
    signOut: function(){ store(UKEY, null); store('cd-co', null); },
    call: function(action, params){
      return new Promise(function(res, rej){
        var slow = /lookup|refresh|posts\.add|ig\./.test(action) ? 700 : 220;
        setTimeout(function(){
          try {
            if (!me()) fail('Please sign in.', 'AUTH');
            var fn = A[action]; if (!fn) fail('Unknown action: ' + action, 'UNKNOWN_ACTION');
            var out = fn(JSON.parse(JSON.stringify(params || {}))); save(); res(JSON.parse(JSON.stringify(out)));
          } catch (e) { rej(e); }
        }, slow + Math.random() * 200);
      });
    },
    // Stand-in for Razorpay Checkout.
    checkout: function(o){
      return new Promise(function(res, rej){
        var d = openDialog('<div class="stack"><span class="chip gold" style="align-self:flex-start">Preview payment</span><h3>' + esc(o.description) + '</h3><p class="muted">' + esc(o.companyName) + ' · ' + esc(o.prefill.email) + '</p></div>' +
          '<div class="panel flat tight"><div class="spread"><span>Amount</span><b style="font-family:var(--f-display);font-size:24px">' + paise(o.amount) + '</b></div><span class="tiny muted">On the live site this is the Razorpay window with UPI, cards and netbanking. Nothing is charged here.</span></div>',
          '<button class="btn" id="pv-cancel">Close</button><button class="btn" id="pv-fail">Fail payment</button><button class="btn primary" id="pv-pay">Pay ' + paise(o.amount) + '</button>');
        var done = false;
        $('pv-pay').onclick = function(){ done = true; closeDialog(); res({razorpay_order_id: o.orderId, razorpay_payment_id: 'pay_PV' + Date.now().toString(36).toUpperCase(), razorpay_signature: 'preview-ok'}); };
        $('pv-fail').onclick = function(){ done = true; closeDialog(); rej(Object.assign(new Error('Payment failed: your bank declined it (preview). Try another method.'), {code: 'PAYMENT'})); };
        $('pv-cancel').onclick = function(){ closeDialog(); };
        d.addEventListener('close', function(){ if (!done) rej(Object.assign(new Error('Payment was not completed. You can try again whenever you are ready.'), {code: 'DISMISSED'})); });
      });
    }
  };
})();
