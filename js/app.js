/* My Creator Desk — core: helpers, API, sign-in, routing, app shell, public pages and onboarding.
 * Work screens are in work.js; company admin and platform owner screens are in admin.js. */
'use strict';

/* ================= helpers ================= */
var CFG = window.CD_CONFIG || {};
var PREVIEW = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || /[?&]preview\b/.test(location.search);
var SITE_URL = location.origin + '/';
function $(id){ return document.getElementById(id); }
function qsa(sel, el){ return Array.prototype.slice.call((el||document).querySelectorAll(sel)); }
function ok(v){ return v != null && v !== '' && isFinite(v); }
function num(v){ if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null; var n = parseFloat(String(v == null ? '' : v).replace(/[₹,\s]/g, '')); return isFinite(n) && n > 0 ? n : null; }
function numz(v){ if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function cleanHandle(v){ var h = String(v || '').trim(); if (!h) return ''; var m = h.match(/instagram\.com\/([^/?#\s]+)/i); if (m) h = m[1]; return h.replace(/^@/, '').replace(/[/?#].*$/, '').toLowerCase(); }
function shortcode(l){ var m = String(l || '').match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i); return m ? m[1] : ''; }
function tierFor(f){ if (!f) return ''; return f < 1e4 ? 'Nano' : f < 1e5 ? 'Micro' : f < 1e6 ? 'Macro' : 'Mega'; }
function median(a){ if (!a.length) return null; var s = a.slice().sort(function(x, y){ return x - y; }); var m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function short(v){ if (!ok(v)) return '—'; v = Number(v); var a = Math.abs(v);
  if (a >= 1e7) return (v / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
  if (a >= 1e5) return (v / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L';
  if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(v)); }
function n0(v){ return ok(v) ? Math.round(v).toLocaleString('en-IN') : '—'; }
function rs(v, d){ d = d || 0; return ok(v) ? '₹' + Number(v).toLocaleString('en-IN', {minimumFractionDigits: d, maximumFractionDigits: d}) : '—'; }
function rShort(v){ return ok(v) ? '₹' + short(v) : '—'; }
function paise(p){ return ok(p) ? rs(p / 100) : '—'; }
function pct(v, d){ return ok(v) ? Number(v).toFixed(d == null ? 1 : d) + '%' : '—'; }
function ago(iso){ if (!iso) return ''; var t = new Date(iso); if (isNaN(t)) return ''; var m = Math.round((Date.now() - t) / 6e4);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 24) return h + ' hr ago'; var d = Math.round(h / 24); return d + ' day' + (d > 1 ? 's' : '') + ' ago'; }
function niceDate(v){ if (!v) return '—'; var d = new Date(v); if (isNaN(d)) return String(v); return d.toLocaleString('en-IN', {day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'}); }
function niceDay(v){ if (!v) return '—'; var d = new Date(v); if (isNaN(d)) return String(v); return d.toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'}); }
function niceMax(v){ if (!(v > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))); var f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
function plural(n, w){ return n + ' ' + w + (n === 1 ? '' : 's'); }
function initials(s){ s = String(s || '?').trim(); var p = s.split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
function store(k, v){ try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
function sstore(k, v){ try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
function loadScript(src, test){ return new Promise(function(res, rej){ if (test && test()) return res(); var s = document.createElement('script'); s.src = src; s.onload = function(){ res(); }; s.onerror = function(){ rej(new Error('Could not load a part of the page. Check your internet and try again.')); }; document.head.appendChild(s); }); }

var toastT;
function toast(msg, err){ var t = $('toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function(){ t.hidden = true; }, err ? 7000 : 3600); }
function busy(btn, on, label){ if (!btn) return; if (on) { btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> ' + esc(label || 'Working…'); } else { btn.disabled = false; if (btn.dataset.l) btn.innerHTML = btn.dataset.l; } }
// Two-click confirm for anything destructive, so there are no browser pop-ups.
function armOnce(btn, label, fn){
  if (btn.dataset.armed) { clearTimeout(+btn.dataset.armed); delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = btn.dataset.orig; fn(); return; }
  btn.dataset.orig = btn.innerHTML; btn.innerHTML = esc(label); btn.classList.add('armed');
  btn.dataset.armed = String(setTimeout(function(){ delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = btn.dataset.orig; }, 3500));
}
function copyText(text, btn, label){
  var done = function(){ if (btn) { var o = btn.innerHTML; btn.textContent = 'Copied'; setTimeout(function(){ btn.innerHTML = o; }, 1600); } toast((label || 'Text') + ' copied'); };
  var fb = function(){ openDialog('<h3>Copy this</h3><p class="small muted">Select all the text below and copy it.</p><textarea id="copy-box" style="min-height:220px;font-size:12.5px">' + esc(text) + '</textarea>', '<button class="btn primary" data-close>Done</button>'); var b = $('copy-box'); b.focus(); b.select(); };
  try { navigator.clipboard.writeText(text).then(done, fb); } catch (e) { fb(); }
}
function openDialog(body, foot, opts){
  closeDialog(); var d = document.createElement('dialog'); d.id = 'dlg';
  d.innerHTML = '<div class="d-body">' + body + '</div>' + (foot ? '<div class="d-foot">' + foot + '</div>' : '');
  if (opts && opts.wide) d.style.width = 'min(720px, calc(100% - 32px))';
  document.body.appendChild(d);
  d.addEventListener('click', function(e){ if (e.target === d || e.target.closest('[data-close]')) closeDialog(); });
  d.addEventListener('close', function(){ d.remove(); });
  d.showModal(); return d;
}
function closeDialog(){ var d = $('dlg'); if (d) { try { d.close(); } catch (e) {} d.remove(); } }

var ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  ig: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  out: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chev: '<path d="m7 10 5 5 5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/>',
  down: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
};
function icon(n, s){ s = s || 18; return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }
var LOGO = '<svg class="mk" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0D6A65"/><path d="M9 22V10h6.5a4.5 4.5 0 0 1 0 9H12" fill="none" stroke="#F2B93B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var GLOGO = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

/* ================= API ================= */
var sb = null;
function supa(){
  if (!sb) {
    if (!window.supabase || !window.supabase.createClient) throw new Error('Sign-in could not load. Check your internet and refresh the page.');
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {auth: {flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  }
  return sb;
}
function apiError(msg, code){ var e = new Error(msg); e.code = code; return e; }
function api(action, params){
  params = params || {};
  if (PREVIEW) return Preview.call(action, params);
  return supa().auth.getSession().then(function(r){
    var s = r.data && r.data.session; if (!s) throw apiError('Please sign in.', 'AUTH');
    return fetch(CFG.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/api', {
      method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token, 'apikey': CFG.SUPABASE_ANON_KEY},
      body: JSON.stringify(Object.assign({action: action}, params))
    }).catch(function(){ throw apiError('Could not reach My Creator Desk. Check your internet and try again.', 'NETWORK'); });
  }).then(function(res){
    return res.json().catch(function(){ throw apiError('The server sent an unexpected answer (' + res.status + '). Try again in a minute.', 'SERVER'); });
  }).then(function(j){
    if (j && j.ok) return j.data;
    var er = (j && j.error) || {};
    var e = apiError(er.message || 'Something went wrong. Try again.', er.code || 'ERROR');
    if (e.code === 'AUTH') { signedOut('Your sign-in has expired. Please sign in again.'); }
    throw e;
  });
}

/* ================= state ================= */
var ST = { user: null, me: null, coId: null, work: null, workCo: null, scope: 'mine', ready: false, signinMsg: '' };
function companies(){ return (ST.me && ST.me.companies) || []; }
function co(){ var l = companies(); return l.find(function(c){ return c.id === ST.coId; }) || l[0] || null; }
function isAdmin(){ var c = co(); return !!(c && c.role === 'admin'); }
function isOwner(){ return !!(ST.me && ST.me.is_platform_admin); }
function plans(){ return (ST.me && ST.me.plans) || DEFAULT_PLANS; }
function planName(id){ var p = plans().find(function(x){ return x.id === id; }); return p ? p.name : (id ? id[0].toUpperCase() + id.slice(1) : '—'); }
function coState(c){ // what the screens need to know about a company's plan
  c = c || co(); if (!c) return 'none';
  if (c.status === 'pending_payment') return 'unpaid';
  if (c.status === 'pending_approval') return 'pending';
  if (c.status === 'suspended') return 'suspended';
  if (c.status === 'cancelled') return 'cancelled';
  if (c.status === 'active' && !c.active) return 'expired';
  return 'active';
}
var DEFAULT_PLANS = [
  {id: 'starter', name: 'Starter', description: '1 Instagram account, up to 5 team members', price_monthly_paise: 499900, price_yearly_paise: 4999000, ig_account_limit: 1, seat_limit: 5, self_checkout: true, sort: 1},
  {id: 'growth', name: 'Growth', description: '3 Instagram accounts, up to 15 team members', price_monthly_paise: 999900, price_yearly_paise: 9999000, ig_account_limit: 3, seat_limit: 15, self_checkout: true, sort: 2},
  {id: 'enterprise', name: 'Enterprise', description: 'Custom accounts, members and support', price_monthly_paise: null, price_yearly_paise: null, ig_account_limit: 10, seat_limit: 50, self_checkout: false, sort: 3}
];

function loadMe(){
  return api('me').then(function(m){
    ST.me = m;
    var l = m.companies || []; var saved = store('cd-co');
    ST.coId = (l.find(function(c){ return c.id === saved; }) || l.find(function(c){ return c.status === 'active'; }) || l[0] || {}).id || null;
    ST.user = Object.assign({}, ST.user || {}, profileUser(m.profile));
    return m;
  });
}
function profileUser(p){ p = p || {}; return {id: p.id, email: p.email, name: p.full_name || '', picture: p.avatar_url || ''}; }
function switchCompany(id){ ST.coId = id; store('cd-co', id); ST.work = null; ST.workCo = null; ST.scope = 'mine'; go(homeRoute(), true); }

/* ================= sign-in ================= */
function signIn(){
  if (PREVIEW) { go('signin'); return; }
  try {
    sstore('cd-after', location.hash && !/signin/.test(location.hash) ? location.hash : '');
    supa().auth.signInWithOAuth({provider: 'google', options: {redirectTo: SITE_URL, queryParams: {prompt: 'select_account'}}})
      .then(function(r){ if (r.error) toast(r.error.message, true); });
  } catch (e) { toast(e.message, true); }
}
function signOut(){
  var p = PREVIEW ? Preview.signOut() : supa().auth.signOut();
  Promise.resolve(p).catch(function(){}).then(function(){ signedOut(''); });
}
function signedOut(msg){
  ST.user = null; ST.me = null; ST.work = null; ST.workCo = null; ST.signinMsg = msg || '';
  if (msg) { go('signin', true); } else { go('', true); }
}

/* ================= routing ================= */
var WORK_ROUTES = ['lookup', 'shortlist', 'campaign', 'report'];
var CO_ROUTES = ['team', 'usage', 'instagram', 'billing', 'company'];
function parseHash(){ var h = (location.hash || '').replace(/^#\/?/, ''); var p = h.split('/'); return {name: p[0] || '', arg: p[1] || ''}; }
function go(name, replace){
  var h = '#/' + name;
  if (location.hash === h) { route(); return; }
  if (replace) { history.replaceState(null, '', location.pathname + location.search + h); route(); } else location.hash = h;
}
function homeRoute(){
  var c = co();
  if (!c) return isOwner() ? 'owner' : 'start';
  var s = coState(c);
  if (s === 'unpaid') return 'plan';
  if (s === 'pending') return 'pending';
  return 'lookup';
}
var CURRENT = '';
function route(){
  if (!ST.ready) return;
  closeDialog();
  var r = parseHash(), n = r.name;
  window.scrollTo(0, 0);
  if (!ST.user) {
    if (n === 'signin') return renderSignin();
    if (n === '' || n === 'pricing' || n === 'features') return renderLanding(n);
    sstore('cd-after', '#/' + n + (r.arg ? '/' + r.arg : ''));
    return go('signin', true);
  }
  if (n === 'signin' || n === '') return go(homeRoute(), true);
  if (n === 'pricing' || n === 'features') return renderLanding(n);
  if (n === 'start') return renderStart();
  if (n === 'owner') { if (!isOwner()) return go(homeRoute(), true); return renderShell('owner', renderOwner); }
  var c = co();
  if (!c) return go(homeRoute(), true);
  var s = coState(c);
  if (n === 'plan') return renderPlan();
  if (n === 'pending') { if (s !== 'pending') return go(homeRoute(), true); return renderPending(); }
  if (s === 'unpaid' || s === 'pending') return go(homeRoute(), true);
  if (WORK_ROUTES.indexOf(n) >= 0) return renderShell(n, function(){ return renderWork(n); });
  if (CO_ROUTES.indexOf(n) >= 0) {
    if (!isAdmin() && (n === 'usage' || n === 'billing')) return go('lookup', true);
    return renderShell(n, function(){ return renderCompanyPage(n); });
  }
  go(homeRoute(), true);
}

/* ================= public pages ================= */
function pubNav(){
  var signed = !!ST.user;
  return '<header class="pub-nav gut" id="pubnav"><div class="wrap"><a class="brand" href="#/">' + LOGO + 'My Creator Desk</a>' +
    '<nav aria-label="Main"><a class="navl" href="#/features" data-scroll="features">Features</a><a class="navl" href="#/pricing" data-scroll="pricing">Pricing</a>' +
    (signed ? '<a class="btn primary sm" href="#/' + homeRoute() + '">Open your desk</a>' : '<button class="btn sm" id="nav-signin">Sign in</button>') +
    '</nav></div></header>';
}
function pubFoot(){
  return '<footer class="pub-foot gut"><div class="wrap"><span>© ' + new Date().getFullYear() + ' My Creator Desk · mycreatordesk.co.in</span>' +
    '<span class="row"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a>' + (CFG.SUPPORT_EMAIL ? '<a href="mailto:' + esc(CFG.SUPPORT_EMAIL) + '">Contact</a>' : '') + '</span></div></footer>';
}
function previewBar(){
  return PREVIEW ? '<div class="note gold gut" style="border-radius:0;justify-content:center;text-align:center"><span><strong>Preview mode.</strong> Sample data kept in this browser only. Nothing is charged and nothing is sent to Instagram.</span></div>' : '';
}
function bindPub(){
  var sb2 = $('nav-signin'); if (sb2) sb2.onclick = function(){ signIn(); };
  qsa('[data-signin]').forEach(function(b){ b.onclick = function(){ if (ST.user) go(homeRoute()); else signIn(); }; });
  qsa('[data-scroll]').forEach(function(a){ a.onclick = function(e){ var t = $(a.dataset.scroll); if (t) { e.preventDefault(); t.scrollIntoView({behavior: 'smooth'}); history.replaceState(null, '', '#/' + a.dataset.scroll); } }; });
  var nav = $('pubnav'); if (nav) { var f = function(){ nav.classList.toggle('scrolled', window.scrollY > 8); }; window.onscroll = f; f(); }
}
function check(){ return icon('check', 16); }

function planCard(p, cycle, opts){
  opts = opts || {};
  var yearly = cycle === 'yearly';
  var amt = yearly ? p.price_yearly_paise : p.price_monthly_paise;
  var monthlyEq = yearly && p.price_yearly_paise ? p.price_yearly_paise / 12 : null;
  var saving = yearly && p.price_monthly_paise && p.price_yearly_paise ? p.price_monthly_paise * 12 - p.price_yearly_paise : 0;
  var feats = p.self_checkout ? [
    p.ig_account_limit + ' Instagram account' + (p.ig_account_limit > 1 ? 's' : '') + ' for lookups',
    'Up to ' + p.seat_limit + ' team members',
    (150 * p.ig_account_limit) + ' fresh lookups an hour, cached answers free',
    'Shortlists, campaign tracking and PDF reports',
    'Audience quality, sponsored vs organic and competitor checks'
  ] : ['As many Instagram accounts and team members as you need', 'Higher hourly lookup capacity', 'Limits set up with our team for you', 'Priority support'];
  var priceHtml = p.self_checkout && amt
    ? '<div class="price"><b>' + paise(amt) + '</b><span>' + (yearly ? 'a year' : 'a month') + '</span></div>' +
      '<span class="tiny muted">' + (yearly ? 'Works out to ' + paise(monthlyEq) + ' a month' + (saving ? ' · <span class="save">you save ' + paise(saving) + '</span>' : '') : 'Billed every month') + '</span>'
    : '<div class="price"><b>Let’s talk</b></div><span class="tiny muted">Priced for your team size</span>';
  var btn = opts.button || (p.self_checkout
    ? '<button class="btn ' + (p.id === 'growth' ? 'primary' : '') + ' lg" data-signin>Start with ' + esc(p.name) + '</button>'
    : '<a class="btn lg" href="mailto:' + esc(CFG.SUPPORT_EMAIL || '') + '?subject=' + encodeURIComponent('My Creator Desk Enterprise') + '">Contact us</a>');
  return '<article class="plan' + (opts.selected ? ' sel' : p.id === 'growth' && !opts.picker ? ' pick' : '') + '"' + (opts.picker ? ' data-plan="' + esc(p.id) + '" role="radio" tabindex="0" aria-checked="' + (opts.selected ? 'true' : 'false') + '" style="cursor:' + (p.self_checkout ? 'pointer' : 'default') + '"' : '') + '>' +
    (p.id === 'growth' && !opts.picker ? '<span class="tag">Most teams pick this</span>' : '') +
    '<div class="stack"><h3>' + esc(p.name) + '</h3><span class="small muted">' + esc(p.description || '') + '</span></div>' +
    '<div class="stack" style="gap:2px">' + priceHtml + '</div>' +
    '<ul>' + feats.map(function(f){ return '<li>' + check() + '<span>' + f + '</span></li>'; }).join('') + '</ul>' + btn + '</article>';
}

var landCycle = 'monthly';
function renderLanding(anchor){
  document.title = 'My Creator Desk · Check Instagram creators before you pay';
  var root = $('root');
  root.innerHTML = '<div class="pub">' + previewBar() + pubNav() +
  '<main>' +
  '<section class="hero gut"><div class="wrap">' +
    '<div>' +
      '<h1>Know what a creator is worth before you pay.</h1>' +
      '<p class="lede">Look up any Instagram creator and see their real engagement, audience quality, competitor collabs and cost per view. Then track every campaign post and send your manager a clean PDF report.</p>' +
      '<div class="btns"><button class="btn primary lg" data-signin>' + (ST.user ? 'Open your desk' : 'Sign in with Google') + '</button><a class="btn lg ghost" href="#/pricing" data-scroll="pricing">See pricing</a></div>' +
      '<p class="fine">Built for brand and agency teams in India. Plans from ₹4,999 a month.</p>' +
    '</div>' +
    '<div class="slip-wrap" aria-label="Example: a creator checked in My Creator Desk">' +
      '<div class="slip">' +
        '<div class="slip-top"><div class="who"><span class="av"><i></i></span><div><div class="h">@glow.with.anaya</div><div class="tiny muted">Skincare creator, Pune, Hindi and English</div></div></div><span class="verdict">Good value</span></div>' +
        '<div class="slip-nums"><div><span>Followers</span><b>64K</b></div><div><span>Engagement rate</span><b>6.66%</b></div><div><span>Avg Reel views</span><b>72K</b></div></div>' +
        '<div class="slip-cpv"><div class="tiny muted">Cost per view at the quoted ₹28,000</div>' +
          '<div class="ln"><span>This creator</span><span class="tr"><i style="width:35%;background:var(--good)"></i></span><span>₹0.39</span></div>' +
          '<div class="ln"><span>Your shortlist</span><span class="tr"><i style="width:55%;background:var(--gold)"></i></span><span>₹0.61</span></div>' +
          '<div class="ln"><span>Costliest</span><span class="tr"><i style="width:100%;background:var(--faint)"></i></span><span>₹1.10</span></div></div>' +
        '<div class="slip-foot"><span class="chip good">Audience quality 82/100</span><span class="chip neutral">No competitor collabs</span><span class="chip teal">Reels get 1.8x the engagement</span></div>' +
      '</div>' +
      '<div class="stamp">36% cheaper per view<small>than your shortlist median</small></div>' +
    '</div>' +
  '</div></section>' +

  '<section class="band desk gut" id="features"><div class="wrap">' +
    '<h2>Everything your team checks before booking a creator, in one place.</h2>' +
    '<p class="intro muted">No more screenshots of insights, copy-pasted follower counts or guessing whether a quote is fair. Every number comes from Instagram through your own connected account.</p>' +
    '<div class="feat">' +
      feat('search', 'Look up any handle', 'Followers, average views, likes and comments from the creator’s last 12 posts, with engagement rate checked against their size.') +
      feat('shield', 'Spot fake followers', 'An audience quality score out of 100 worked out from organic posts only, so paid promotion is never counted as fake.') +
      feat('swap', 'Sponsored vs organic', 'See how a creator’s brand posts do against their normal ones, and which sponsored posts look boosted.') +
      feat('flag', 'Competitor check', 'The last 25 captions are scanned for your competitor brands, their handles and hashtags, plus #ad and paid partnership tags.') +
      feat('upload', 'Bring your own sheet', 'Upload any Excel or CSV list of creators. Handles are looked up and only the empty cells are filled.') +
      feat('file', 'Track and report', 'Paste campaign post links to get views, CPV, CPE and budget burn, then download a manager-ready PDF.') +
    '</div>' +
  '</div></section>' +

  '<section class="band gut"><div class="wrap">' +
    '<h2>Up and running in a day.</h2>' +
    '<ol class="steps">' +
      '<li><strong>Sign in with Google</strong><span>No passwords to manage.</span></li>' +
      '<li><strong>Create your company</strong><span>Name, and GSTIN if you want it on invoices.</span></li>' +
      '<li><strong>Pick a plan and pay</strong><span>UPI, cards or netbanking through Razorpay.</span></li>' +
      '<li><strong>We approve your desk</strong><span>Usually within one working day.</span></li>' +
      '<li><strong>Connect Instagram, invite your team</strong><span>Everyone gets their own shortlist and campaigns.</span></li>' +
    '</ol>' +
  '</div></section>' +

  '<section class="band gut" id="pricing" style="padding-top:24px"><div class="wrap">' +
    '<div class="spread"><div class="stack"><h2>Simple plans, priced per company.</h2><p class="intro muted" style="margin-top:4px">Every plan has every feature. You choose how many Instagram accounts and team members you need.</p></div>' +
    '<div class="seg" role="group" aria-label="Billing period"><button data-cycle="monthly" aria-pressed="' + (landCycle === 'monthly') + '">Monthly</button><button data-cycle="yearly" aria-pressed="' + (landCycle === 'yearly') + '">Yearly, 2 months free</button></div></div>' +
    '<div class="pricing" id="price-cards">' + plans().map(function(p){ return planCard(p, landCycle); }).join('') + '</div>' +
    '<p class="small muted" style="margin-top:18px">Prices are in Indian rupees. Payments go through Razorpay; your company is switched on once we approve the payment.</p>' +
  '</div></section>' +
  '</main>' + pubFoot() + '</div>';
  bindPub();
  qsa('[data-cycle]').forEach(function(b){ b.onclick = function(){ landCycle = b.dataset.cycle; qsa('[data-cycle]').forEach(function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); $('price-cards').innerHTML = plans().map(function(p){ return planCard(p, landCycle); }).join(''); bindPub(); }; });
  if (anchor) setTimeout(function(){ var t = $(anchor); if (t) t.scrollIntoView(); }, 30);
}
function feat(ic, t, d){ return '<div><div class="ic">' + icon(ic, 18) + '</div><h3>' + t + '</h3><p>' + d + '</p></div>'; }

function renderSignin(){
  document.title = 'Sign in · My Creator Desk';
  var msg = ST.signinMsg; ST.signinMsg = '';
  var body;
  if (PREVIEW) {
    body = '<p class="muted">Preview mode: pick who you want to be. Each one shows a different part of the desk.</p>' +
      '<div class="stack" style="gap:10px">' + Preview.personas().map(function(p){
        return '<button class="persona" data-persona="' + esc(p.id) + '"><span class="pi">' + esc(initials(p.name)) + '</span><span><b>' + esc(p.name) + '</b><span>' + esc(p.about) + '</span></span></button>'; }).join('') + '</div>' +
      '<button class="link small" id="pv-reset" style="align-self:flex-start">Reset preview data</button>';
  } else {
    body = '<button class="btn g-btn" id="g-signin">' + GLOGO + 'Continue with Google</button>' +
      '<p class="small muted">We only use your name, email and photo to set up your desk. Your company’s creators and campaigns are never visible to any other company.</p>';
  }
  $('root').innerHTML = '<div class="pub">' + previewBar() + pubNav() + '<div class="center"><div class="card">' +
    '<div class="stack"><h1>Sign in to your desk</h1><p class="muted">New here? Signing in is also how you start: you’ll set up your company next.</p></div>' +
    (msg ? '<div class="note warn" role="alert">' + esc(msg) + '</div>' : '') + body +
    '</div></div>' + pubFoot() + '</div>';
  bindPub();
  var g = $('g-signin'); if (g) g.onclick = function(){ busy(g, true, 'Opening Google…'); signIn(); setTimeout(function(){ busy(g, false); }, 6000); };
  qsa('[data-persona]').forEach(function(b){ b.onclick = function(){ busy(b, true, 'Signing in…'); Preview.signIn(b.dataset.persona); afterSignIn(); }; });
  var rr = $('pv-reset'); if (rr) rr.onclick = function(){ armOnce(rr, 'Click again to reset', function(){ Preview.reset(); toast('Preview data reset'); }); };
}

function afterSignIn(){
  ST.user = PREVIEW ? Preview.user() : ST.user;
  $('root').innerHTML = '<div class="center" style="min-height:100vh"><span class="row muted"><span class="spin"></span> Opening your desk…</span></div>';
  return loadMe().then(function(){
    var after = sstore('cd-after'); sstore('cd-after', null);
    handleFacebookReturn();
    if (after && !/signin|^#\/?$/.test(after)) { location.hash = after; route(); } else go(homeRoute(), true);
  }).catch(function(e){
    $('root').innerHTML = '<div class="pub">' + pubNav() + '<div class="center"><div class="card"><h2>Your desk did not open</h2><p class="muted">' + esc(e.message) + '</p><div class="btns"><button class="btn primary" id="retry">Try again</button><button class="btn" id="so">Sign out</button></div></div></div></div>';
    $('retry').onclick = afterSignIn; $('so').onclick = signOut;
  });
}

/* ================= onboarding ================= */
function steps(now){
  var names = ['Company', 'Plan', 'Payment', 'Approval'];
  return '<ol class="progress-steps" aria-label="Setup progress">' + names.map(function(n, i){ return '<li class="' + (i < now ? 'done' : i === now ? 'now' : '') + '"' + (i === now ? ' aria-current="step"' : '') + '>' + n + '</li>'; }).join('') + '</ol>';
}
function setupPage(inner, wide){
  $('root').innerHTML = '<div class="pub">' + previewBar() +
    '<header class="pub-nav gut scrolled"><div class="wrap"><a class="brand" href="#/">' + LOGO + 'My Creator Desk</a><nav class="row">' +
    (isOwner() ? '<a class="navl" href="#/owner">Platform panel</a>' : '') +
    (companies().length > 1 ? '<button class="btn sm ghost" id="setup-switch">' + icon('swap', 16) + 'Switch company</button>' : '') +
    '<button class="btn sm ghost" id="setup-out">' + icon('out', 16) + 'Sign out</button></nav></div></header>' +
    '<div class="center"><div class="card ' + (wide || '') + '">' + inner + '</div></div></div>';
  $('setup-out').onclick = signOut;
  var sw = $('setup-switch'); if (sw) sw.onclick = function(e){ companyMenu(sw); };
}

function renderStart(){
  document.title = 'Set up your company · My Creator Desk';
  var inv = (ST.me && ST.me.invitations) || [];
  var first = (ST.user && ST.user.name || '').split(' ')[0];
  var invHtml = inv.length ? '<div class="panel flat"><div class="stack"><h3>You’ve been invited</h3><p class="small muted">Join your team’s desk instead of creating a new company.</p></div>' +
    inv.map(function(i){ return '<div class="spread" style="align-items:center"><div><b>' + esc(i.company_name) + '</b><div class="tiny muted">As ' + (i.role === 'admin' ? 'an admin' : 'a team member') + ', invite open until ' + niceDay(i.expires_at) + '</div></div><button class="btn primary sm" data-join="' + esc(i.id) + '">Join</button></div>'; }).join('') + '</div>' : '';
  setupPage(steps(0) +
    '<div class="stack"><h1>' + (first ? 'Welcome, ' + esc(first) + '.' : 'Welcome.') + '</h1><p class="muted">Set up your company. Everyone you invite later works inside it, and its data is kept apart from every other company.</p></div>' +
    invHtml +
    (inv.length ? '<h3>Or create a new company</h3>' : '') +
    '<form class="form cols-2" id="co-form" novalidate>' +
      '<label class="field full">Company or brand name<input id="co-name" required maxlength="120" autocomplete="organization" placeholder="Glowkart Beauty"></label>' +
      '<label class="field full">Legal name <span class="hint">Optional, for invoices</span><input id="co-legal" maxlength="200" placeholder="Glowkart Retail Pvt Ltd"></label>' +
      '<label class="field">GSTIN <span class="hint">Optional</span><input id="co-gst" maxlength="15" style="text-transform:uppercase" placeholder="27ABCDE1234F1Z5"></label>' +
      '<label class="field">Phone <span class="hint">Optional</span><input id="co-phone" type="tel" maxlength="20" autocomplete="tel" placeholder="+91 98765 43210"></label>' +
      '<button class="btn primary lg full" id="co-btn" type="submit" style="justify-self:stretch">Create company and choose a plan</button>' +
    '</form>', 'wide');
  qsa('[data-join]').forEach(function(b){ b.onclick = function(){ busy(b, true, 'Joining…');
    api('invites.accept', {invitationId: b.dataset.join}).then(function(r){ return loadMe().then(function(){ switchCompany(r.companyId); toast('You joined the team'); }); })
      .catch(function(e){ busy(b, false); toast(e.message, true); }); }; });
  $('co-form').onsubmit = function(e){ e.preventDefault();
    var name = $('co-name').value.trim(), gst = $('co-gst').value.trim().toUpperCase(), phone = $('co-phone').value.trim();
    if (name.length < 2) { toast('Type your company name (at least 2 letters).', true); $('co-name').focus(); return; }
    if (gst && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gst)) { toast('A GSTIN has 15 characters and starts with 2 digits, like 27ABCDE1234F1Z5.', true); $('co-gst').focus(); return; }
    if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) { toast('That phone number does not look right.', true); $('co-phone').focus(); return; }
    var btn = $('co-btn'); busy(btn, true, 'Creating…');
    api('company.create', {name: name, legalName: $('co-legal').value.trim(), gstin: gst, phone: phone})
      .then(function(r){ return loadMe().then(function(){ ST.coId = r.companyId; store('cd-co', r.companyId); go('plan'); }); })
      .catch(function(err){ busy(btn, false); toast(err.message, true); });
  };
}

var planSel = null, planCycle = 'monthly';
function renderPlan(){
  var c = co(); var s = coState(c);
  document.title = 'Choose a plan · My Creator Desk';
  if (!isAdmin()) {
    setupPage('<div class="stack"><h1>' + esc(c.name) + ' is not switched on yet</h1><p class="muted">Your company admin needs to choose a plan and pay. You’ll get access as soon as it’s approved.</p></div><button class="btn" id="chk">' + icon('refresh', 16) + 'Check again</button>');
    $('chk').onclick = function(){ var b = this; busy(b, true, 'Checking…'); loadMe().then(function(){ go(homeRoute(), true); }); };
    return;
  }
  var renew = s !== 'unpaid';
  var list = plans().filter(function(p){ return p.is_public !== false; });
  if (!planSel || !list.find(function(p){ return p.id === planSel && p.self_checkout; })) planSel = (renew && c.plan_id && list.find(function(p){ return p.id === c.plan_id && p.self_checkout; })) ? c.plan_id : 'growth';
  if (renew && c.billing_cycle && !renderPlan.touched) planCycle = c.billing_cycle;
  var p = list.find(function(x){ return x.id === planSel; }) || list[0];
  var amt = planCycle === 'yearly' ? p.price_yearly_paise : p.price_monthly_paise;
  var change = renew && c.plan_id && c.plan_id !== p.id;
  var head = renew
    ? '<div class="spread"><div class="stack"><h1>' + (change ? 'Change your plan' : 'Renew your plan') + '</h1><p class="muted">' + esc(c.name) + ' is on ' + esc(planName(c.plan_id)) + (c.current_period_end ? ', paid until ' + niceDay(c.current_period_end) : '') + '.</p></div><a class="btn" href="#/billing">Back to billing</a></div>'
    : steps(1) + '<div class="stack"><h1>Choose a plan for ' + esc(c.name) + '</h1><p class="muted">Every plan has every feature. Pick by how many Instagram accounts and people you need. You can change later.</p></div>';
  setupPage(head +
    '<div class="row"><div class="seg" role="group" aria-label="Billing period"><button data-cyc="monthly" aria-pressed="' + (planCycle === 'monthly') + '">Monthly</button><button data-cyc="yearly" aria-pressed="' + (planCycle === 'yearly') + '">Yearly, 2 months free</button></div></div>' +
    '<div class="pricing" role="radiogroup" aria-label="Plans" style="margin-top:0">' + list.map(function(x){
      return planCard(x, planCycle, {picker: true, selected: x.id === planSel, button: x.self_checkout ? '<span class="btn ' + (x.id === planSel ? 'gold' : '') + '">' + (x.id === planSel ? icon('check', 16) + 'Selected' : 'Choose ' + esc(x.name)) + '</span>' : '<a class="btn" href="mailto:' + esc(CFG.SUPPORT_EMAIL || '') + '?subject=' + encodeURIComponent('Enterprise plan for ' + c.name) + '">Contact us</a>'}); }).join('') + '</div>' +
    '<div class="panel" style="gap:14px"><div class="spread" style="align-items:center"><div class="stack" style="gap:2px"><span class="small muted">You pay now</span><span style="font-family:var(--f-display);font-size:30px;font-weight:700" class="num">' + paise(amt) + '</span><span class="small muted">' + esc(p.name) + ', ' + (planCycle === 'yearly' ? 'one year' : 'one month') + '</span></div>' +
    '<button class="btn primary lg" id="pay-btn">' + icon('card', 18) + 'Pay ' + paise(amt) + ' securely</button></div>' +
    '<p class="small muted">' + (change ? 'A plan change is switched on after we approve it, usually within one working day. Your current limits stay until then.' : renew && s === 'active' ? 'Renewing the same plan extends your paid period straight away.' : 'UPI, cards and netbanking through Razorpay. After payment we approve your company, usually within one working day.') + '</p></div>',
    'xwide');
  qsa('[data-cyc]').forEach(function(b){ b.onclick = function(){ planCycle = b.dataset.cyc; renderPlan.touched = true; renderPlan(); }; });
  qsa('[data-plan]').forEach(function(el){
    var pick = function(){ var x = list.find(function(y){ return y.id === el.dataset.plan; }); if (x && x.self_checkout) { planSel = x.id; renderPlan(); var n = document.querySelector('[data-plan="' + x.id + '"]'); if (n) n.focus(); } };
    el.onclick = function(e){ if (e.target.closest('a')) return; pick(); };
    el.onkeydown = function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
  });
  $('pay-btn').onclick = function(){ startPayment(this, c, p, planCycle); };
}

function startPayment(btn, c, p, cycle){
  busy(btn, true, 'Opening payment…');
  var order;
  api('billing.order', {companyId: c.id, planId: p.id, cycle: cycle}).then(function(o){
    order = o;
    if (PREVIEW) return Preview.checkout(o);
    return loadScript(CFG.RAZORPAY_SCRIPT, function(){ return !!window.Razorpay; }).then(function(){
      return new Promise(function(res, rej){
        var rz = new window.Razorpay({
          key: o.keyId, amount: o.amount, currency: o.currency, order_id: o.orderId, name: o.name, description: o.description,
          prefill: o.prefill, notes: {company: o.companyName}, theme: {color: '#0D6A65'},
          handler: function(resp){ res(resp); },
          modal: {ondismiss: function(){ rej(apiError('Payment was not completed. You can try again whenever you are ready.', 'DISMISSED')); }}
        });
        rz.on('payment.failed', function(r){ rej(apiError('Payment failed: ' + ((r && r.error && r.error.description) || 'please try another method.'), 'PAYMENT')); });
        rz.open();
      });
    });
  }).then(function(resp){
    busy(btn, true, 'Confirming payment…');
    return api('billing.verify', {orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature});
  }).then(function(r){
    return loadMe().then(function(){
      if (r.result === 'renewed') { toast('Payment received. Your plan is renewed.'); go('billing'); }
      else go(homeRoute(), true);
    });
  }).catch(function(e){
    busy(btn, false);
    if (e.code === 'ALREADY_PAID') { loadMe().then(function(){ go(homeRoute(), true); }); return; }
    toast(e.message, e.code !== 'DISMISSED');
  });
}

var pendingPoll;
function renderPending(){
  var c = co();
  document.title = 'Waiting for approval · My Creator Desk';
  setupPage(steps(3) +
    '<div class="row" style="gap:18px;align-items:center"><div class="pulse">' + icon('clock', 30) + '</div><div class="stack grow"><h1>Payment received.</h1><p class="muted">We’re checking ' + esc(c.name) + ' and will switch your desk on soon, usually within one working day.</p></div></div>' +
    '<ul class="checklist">' +
      '<li class="done"><span class="ck">' + icon('check', 14) + '</span><div><b>Company created</b><div class="small muted">' + esc(c.name) + '</div></div></li>' +
      '<li class="done"><span class="ck">' + icon('check', 14) + '</span><div><b>' + esc(planName(c.plan_id)) + ' plan paid</b><div class="small muted">' + (c.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly') + ' billing</div></div></li>' +
      '<li class="now"><span class="ck">3</span><div><b>Approval</b><div class="small muted">This page updates by itself when you’re approved.</div></div></li>' +
      '<li><span class="ck">4</span><div><b>Connect your Instagram account</b><div class="small muted">A Business or Creator account linked to a Facebook Page.</div></div></li>' +
      '<li><span class="ck">5</span><div><b>Invite your team</b><div class="small muted">Up to ' + c.seat_limit + ' people on your plan.</div></div></li>' +
    '</ul>' +
    '<div class="btns"><button class="btn primary" id="chk">' + icon('refresh', 16) + 'Check status now</button>' + (CFG.SUPPORT_EMAIL ? '<a class="btn ghost" href="mailto:' + esc(CFG.SUPPORT_EMAIL) + '?subject=' + encodeURIComponent('Approval for ' + c.name) + '">Email us</a>' : '') + '</div>', 'wide');
  var check2 = function(btn){ if (btn) busy(btn, true, 'Checking…'); return loadMe().then(function(){ if (coState() !== 'pending') { clearInterval(pendingPoll); toast('Your desk is switched on'); go(homeRoute(), true); } else if (btn) { busy(btn, false); toast('Still waiting for approval'); } }).catch(function(e){ if (btn) { busy(btn, false); toast(e.message, true); } }); };
  $('chk').onclick = function(){ check2(this); };
  clearInterval(pendingPoll); pendingPoll = setInterval(function(){ if (parseHash().name !== 'pending') return clearInterval(pendingPoll); if (!document.hidden) check2(); }, 45000);
}

/* ================= app shell ================= */
function companyMenu(anchor){
  var old = $('co-menu'); if (old) { old.remove(); return; }
  var r = anchor.getBoundingClientRect();
  var m = document.createElement('div'); m.className = 'co-menu'; m.id = 'co-menu'; m.setAttribute('role', 'menu');
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 270)) + 'px'; m.style.top = (r.bottom + window.scrollY + 6) + 'px';
  m.innerHTML = companies().map(function(c){ return '<button role="menuitem" data-co="' + esc(c.id) + '"><span>' + esc(c.name) + '<span class="tiny muted" style="display:block">' + (c.role === 'admin' ? 'Admin' : 'Member') + ' · ' + esc(statusLabel(c)) + '</span></span>' + (c.id === ST.coId ? icon('check', 16) : '') + '</button>'; }).join('') +
    '<hr><a role="menuitem" href="#/start">' + 'Create or join a company' + icon('plus', 16) + '</a>' + (isOwner() ? '<a role="menuitem" href="#/owner">Platform panel' + icon('shield', 16) + '</a>' : '');
  document.body.appendChild(m);
  qsa('[data-co]', m).forEach(function(b){ b.onclick = function(){ m.remove(); if (b.dataset.co !== ST.coId) switchCompany(b.dataset.co); }; });
  qsa('a', m).forEach(function(a){ a.addEventListener('click', function(){ m.remove(); }); });
  var first = m.querySelector('button,a'); if (first) first.focus();
  setTimeout(function(){ document.addEventListener('click', function h(e){ if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', h); } }); }, 0);
  m.addEventListener('keydown', function(e){ if (e.key === 'Escape') { m.remove(); anchor.focus(); } });
}
function statusLabel(c){ var s = coState(c); return {active: 'Active', unpaid: 'Not paid yet', pending: 'Waiting for approval', suspended: 'Suspended', cancelled: 'Cancelled', expired: 'Plan ended'}[s] || s; }

function navLink(key, label, ic, extra){
  return '<a class="nl" href="#/' + key + '"' + (CURRENT === key ? ' aria-current="page"' : '') + '>' + icon(ic, 18) + '<span>' + label + '</span>' + (extra || '') + '</a>';
}
var PAGE_TITLES = {lookup: 'Creator lookup', shortlist: 'Shortlist', campaign: 'Campaign', report: 'Manager report', team: 'Team', usage: 'Usage', instagram: 'Instagram', billing: 'Billing', company: 'Company details', owner: 'Platform panel'};
function renderShell(key, renderPage){
  CURRENT = key;
  document.title = (PAGE_TITLES[key] || 'Desk') + ' · My Creator Desk';
  var c = co(), u = ST.user || {}, w = ST.workCo === (c && c.id) ? ST.work : null;
  var cnt = function(n, gold){ return n ? '<span class="cnt' + (gold ? ' gold' : '') + '">' + n + '</span>' : ''; };
  var nav = '';
  if (c && coState(c) !== 'unpaid' && coState(c) !== 'pending') {
    nav += '<div class="grp">Workspace</div>' +
      navLink('lookup', 'Creator lookup', 'search') +
      navLink('shortlist', 'Shortlist', 'list', cnt(w ? w.creators.length : 0)) +
      navLink('campaign', 'Campaign', 'flag', cnt(w ? w.posts.length : 0)) +
      navLink('report', 'Manager report', 'file');
    nav += '<div class="grp">' + esc(c.name) + '</div>' +
      navLink('team', 'Team', 'users') +
      (isAdmin() ? navLink('usage', 'Usage', 'chart') : '') +
      navLink('instagram', 'Instagram', 'ig', w && w.connections && !w.connections.filter(function(x){ return x.status === 'active'; }).length ? '<span class="cnt gold">!</span>' : '') +
      (isAdmin() ? navLink('billing', 'Billing', 'card') + navLink('company', 'Company details', 'building') : '');
  }
  if (isOwner()) nav += '<div class="grp">My Creator Desk</div>' + navLink('owner', 'Platform panel', 'shield', cnt(ownerPendingCount(), true));
  var capHtml = '';
  if (w && w.capacity && w.capacity.length) {
    var act = w.capacity.filter(function(x){ return x.status === 'active'; });
    var used = act.reduce(function(a, x){ return a + (+x.used_this_hour || 0); }, 0), lim = act.reduce(function(a, x){ return a + (+x.hourly_limit || 0); }, 0);
    if (lim) capHtml = '<div class="cap" title="Fresh Instagram lookups this hour. Answers from the last 6 hours are free and don’t count."><div class="spread" style="align-items:center"><b>' + (lim - used) + ' lookups left</b><span>this hour</span></div><div class="track"><div class="fill" style="width:' + Math.min(100, used / lim * 100) + '%"></div></div><span>' + used + ' of ' + lim + ' used, resets at ' + new Date(act[0].resets_at).toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'}) + '</span></div>';
  }
  var banner = shellBanner(c);
  $('root').innerHTML = (PREVIEW ? previewBar() : '') + '<div class="desk-app" id="desk">' +
    '<aside class="side" aria-label="Main navigation">' +
      '<a class="brand" href="#/' + homeRoute() + '">' + LOGO + 'My Creator Desk</a>' +
      (c ? '<button class="co-switch" id="co-switch" aria-haspopup="menu"><span class="co-mark">' + esc(initials(c.name)) + '</span><span style="min-width:0"><b>' + esc(c.name) + '</b><span>' + esc(planName(c.plan_id)) + ' · ' + (c.role === 'admin' ? 'Admin' : 'Member') + '</span></span>' + icon('chev', 16) + '</button>'
         : '<a class="co-switch" href="#/start"><span class="co-mark">+</span><span><b>Create a company</b><span>Or join your team</span></span></a>') +
      '<nav>' + nav + '</nav>' +
      '<div class="side-foot">' + capHtml +
        '<div class="me">' + (u.picture ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">' : '<span class="av">' + esc(initials(u.name || u.email)) + '</span>') +
        '<div style="min-width:0"><b>' + esc(u.name || u.email || '') + '</b><span>' + esc(u.email || '') + '</span></div><button id="sign-out" title="Sign out" aria-label="Sign out">' + icon('out', 18) + '</button></div>' +
      '</div>' +
    '</aside><div class="scrim" id="scrim"></div>' +
    '<div class="main"><div class="topbar"><button class="btn sm menu" id="menu-btn" aria-label="Open menu">' + icon('menu', 18) + '</button><span class="brand" style="font-size:16px" id="top-title"></span></div>' +
    '<main class="page" id="page">' + banner + '<div id="page-body"></div></main></div></div>';
  var t = $('top-title'); if (t && window.innerWidth <= 920) t.textContent = PAGE_TITLES[key] || '';
  var cs = $('co-switch'); if (cs && cs.tagName === 'BUTTON') cs.onclick = function(){ companyMenu(cs); };
  $('sign-out').onclick = signOut;
  var desk = $('desk');
  $('menu-btn').onclick = function(){ desk.classList.add('open'); var f = desk.querySelector('.side a,.side button'); if (f) f.focus(); };
  $('scrim').onclick = function(){ desk.classList.remove('open'); };
  qsa('.side a.nl').forEach(function(a){ a.addEventListener('click', function(){ desk.classList.remove('open'); }); });
  try { renderPage(); } catch (e) { console.error(e); $('page-body').innerHTML = '<div class="note bad">This page hit a problem: ' + esc(e.message) + '</div>'; }
}
function shellBanner(c){
  if (!c) return '';
  var s = coState(c), adm = isAdmin();
  if (s === 'expired') return '<div class="note warn"><span><strong>Your plan ended on ' + niceDay(c.current_period_end) + '.</strong> Everything is saved and you can still view it, but lookups and changes are paused.' + (adm ? '' : ' Ask your company admin to renew.') + '</span>' + (adm ? '<a class="btn primary sm" href="#/plan">Renew plan</a>' : '') + '</div>';
  if (s === 'suspended') return '<div class="note bad"><span><strong>' + esc(c.name) + ' is suspended.</strong> Your data is kept and visible, but work is paused. ' + (CFG.SUPPORT_EMAIL ? 'Write to <a href="mailto:' + esc(CFG.SUPPORT_EMAIL) + '">' + esc(CFG.SUPPORT_EMAIL) + '</a> to sort it out.' : '') + '</span></div>';
  if (s === 'cancelled') return '<div class="note bad"><span><strong>This company’s plan is cancelled.</strong> Data stays visible; work is paused.</span>' + (adm ? '<a class="btn primary sm" href="#/plan">Choose a plan</a>' : '') + '</div>';
  if (s === 'active' && c.current_period_end) {
    var days = Math.ceil((new Date(c.current_period_end) - Date.now()) / 864e5);
    if (days <= 5 && adm) return '<div class="note gold"><span><strong>Your plan renews by ' + niceDay(c.current_period_end) + '</strong> (' + plural(days, 'day') + ' left). Pay before then to keep working without a break.</span><a class="btn gold sm" href="#/plan">Renew now</a></div>';
  }
  return '';
}
function pageHead(title, sub, actions){
  return '<div class="page-head"><div class="stack"><h1>' + title + '</h1>' + (sub ? '<p class="muted">' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="btns">' + actions + '</div>' : '') + '</div>';
}
function body(html){ var b = $('page-body'); b.innerHTML = html; b.style.display = 'flex'; b.style.flexDirection = 'column'; b.style.gap = '22px'; return b; }
function loadingBody(){ body('<div class="stack" style="gap:14px"><div class="skel" style="height:34px;width:40%"></div><div class="skel" style="height:110px"></div><div class="skel" style="height:220px"></div></div>'); }
function errorBody(e, retry){ body('<div class="empty"><strong>That didn’t load</strong><span>' + esc(e.message) + '</span><button class="btn primary" id="err-retry">Try again</button></div>'); $('err-retry').onclick = retry; }

/* ================= Instagram connect (Facebook Login) ================= */
function connectInstagram(igUserId){
  var c = co(); if (!c) return;
  var st = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sstore('cd-fb', JSON.stringify({state: st, companyId: c.id, igUserId: igUserId || ''}));
  if (PREVIEW) { location.href = location.pathname + '?' + (/[?&]preview\b/.test(location.search) ? 'preview&' : '') + 'code=preview-' + st + '&state=' + st + '#/instagram'; return; }
  var q = {client_id: CFG.FB_APP_ID, redirect_uri: SITE_URL, state: st, response_type: 'code'};
  if (CFG.FB_CONFIG_ID) q.config_id = CFG.FB_CONFIG_ID; else q.scope = 'instagram_basic,pages_show_list,pages_read_engagement,business_management';
  location.href = 'https://www.facebook.com/v26.0/dialog/oauth?' + Object.keys(q).map(function(k){ return k + '=' + encodeURIComponent(q[k]); }).join('&');
}
// Facebook sends people back to the home page with ?code=…&state=…; read it before anything else and clean the address.
var FB_RETURN = (function(){
  var sp = new URLSearchParams(location.search); var code = sp.get('code'), st = sp.get('state'), err = sp.get('error_description') || sp.get('error');
  if (!st || (!code && !err)) return null;
  var saved = {}; try { saved = JSON.parse(sstore('cd-fb') || '{}'); } catch (e) {}
  sstore('cd-fb', null);
  sp.delete('code'); sp.delete('state'); sp.delete('error'); sp.delete('error_description'); sp.delete('error_reason'); sp.delete('error_code');
  var qs = sp.toString();
  try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + (location.hash && !/access_token=/.test(location.hash) ? location.hash : '#/instagram')); } catch (e) {}
  if (err) return {error: 'Instagram was not connected: ' + err};
  if (!saved.state || saved.state !== st) return {error: 'The Instagram connection could not be confirmed. Please try again.'};
  return {code: code, companyId: saved.companyId, igUserId: saved.igUserId};
})();
function handleFacebookReturn(){
  var fr = FB_RETURN; FB_RETURN = null; if (!fr) return;
  if (fr.error) { toast(fr.error, true); return; }
  if (fr.companyId && fr.companyId !== ST.coId && companies().some(function(c){ return c.id === fr.companyId; })) { ST.coId = fr.companyId; store('cd-co', fr.companyId); }
  toast('Connecting your Instagram…');
  api('ig.connect', {companyId: fr.companyId || ST.coId, code: fr.code, redirectUri: SITE_URL, igUserId: fr.igUserId || undefined}).then(function(r){
    if (r.choose) { ST.igChoose = r.choose; go('instagram', true); return; }
    ST.work = null; toast('Instagram connected: @' + ((r.connection && r.connection.username) || ''));
    return loadMe().then(function(){ go('instagram', true); });
  }).catch(function(e){ toast(e.message, true); });
}

/* ================= boot ================= */
function boot(){
  window.addEventListener('hashchange', route);
  if (PREVIEW) {
    Preview.init();
    var u = Preview.user();
    ST.ready = true;
    if (u) { ST.user = u; afterSignIn(); } else route();
    return;
  }
  var client;
  try { client = supa(); } catch (e) { ST.ready = true; $('root').innerHTML = '<div class="center" style="min-height:100vh"><div class="card"><h2>The page could not start</h2><p class="muted">' + esc(e.message) + '</p></div></div>'; return; }
  client.auth.getSession().then(function(r){
    var s = r.data && r.data.session;
    if (r.error) ST.signinMsg = r.error.message;
    var h = location.hash || '';
    if (/access_token=|error_description=/.test(h)) history.replaceState(null, '', location.pathname + location.search + (sstore('cd-after') || '#/'));
    ST.ready = true;
    if (s && s.user) { ST.user = {id: s.user.id, email: s.user.email, name: (s.user.user_metadata || {}).full_name || '', picture: (s.user.user_metadata || {}).avatar_url || ''}; afterSignIn(); }
    else route();
  });
  client.auth.onAuthStateChange(function(ev){ if (ev === 'SIGNED_OUT' && ST.user) signedOut(''); });
}
function fixHints(root){ qsa('label.field .hint', root).forEach(function(h){ var t = h.previousSibling; if (!t || t.nodeType !== 3 || h.parentNode.classList.contains('lt')) return; var w = document.createElement('span'); w.className = 'lt'; h.parentNode.insertBefore(w, t); w.appendChild(t); w.appendChild(h); }); }
document.addEventListener('DOMContentLoaded', function(){ new MutationObserver(function(){ fixHints(document.body); }).observe(document.body, {childList: true, subtree: true}); boot(); });
