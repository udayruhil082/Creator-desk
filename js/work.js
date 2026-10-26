/* My Creator Desk — the workspace: creator lookup, shortlist, campaign and the manager report.
 * Every number and verdict works the same way as on the earlier single-team desk. */
'use strict';

/* ================= data ================= */
var W = null;            // the current company's work, in the shape the screens use
var CUR = null;          // id of the creator open on the lookup screen
var SEL = {};            // creator ids ticked in the shortlist
function normCreator(r){
  return {id: r.id, owner_id: r.owner_id, owner_email: r.owner_email || '', name: r.name, handle: r.name, platform: r.platform || 'Instagram', source: r.source,
    category: r.category || '', language: r.language || '', link: r.link || '', ytLink: r.yt_link || '',
    followers: numz(r.followers), views: numz(r.views), avgViews: numz(r.views), reach: numz(r.reach),
    likes: numz(r.likes), avgLikes: numz(r.likes), comments: numz(r.comments), avgComments: numz(r.comments), posts: numz(r.posts),
    sentiment: r.sentiment || '', deliverables: r.deliverables || '', collab: numz(r.collab_price), adRights: numz(r.ad_rights_price), fee: numz(r.fee),
    credibility: r.quality || '', qualityScore: numz(r.quality_score), qualityWhy: r.quality_why || '', organicEr: numz(r.organic_er), sponsoredEr: numz(r.sponsored_er),
    sponsoredLift: r.sponsored_lift || '', boosted: r.boosted || '', bestFormat: r.best_format || '', contentMix: r.content_mix || '',
    competitors: r.competitors || '', collabs: r.collabs || '', status: r.status || '', updated: r.fetched_at || r.updated_at || r.created_at, created: r.created_at};
}
function normPost(r){
  return {id: r.id, code: r.post_code, handle: r.handle, link: r.link || '', platform: r.platform || 'Instagram', fee: numz(r.fee), views: numz(r.views), likes: numz(r.likes), comments: numz(r.comments),
    type: r.media_type || '', posted: r.posted_at || '', status: r.status || '', owner_id: r.owner_id, owner_email: r.owner_email || '', created: r.created_at};
}
function normSettings(s){ s = s || {}; var d = function(v){ return v ? String(v).slice(0, 10) : ''; };
  return {name: s.name || '', budget: numz(s.budget), start: d(s.start_date), end: d(s.end_date), competitors: s.competitors || ''}; }
function setWork(d){
  W = {creators: (d.creators || []).map(normCreator), posts: (d.posts || []).map(normPost), settings: normSettings(d.settings),
    connections: d.connections || [], capacity: d.capacity || [], scope: d.scope || 'mine', active: d.active !== false, admin: !!d.admin};
  ST.work = W; ST.workCo = ST.coId;
}
function loadWork(){
  return api('work.state', {companyId: ST.coId, scope: ST.scope}).then(function(d){ setWork(d); return W; });
}
function reloadWork(){ return loadWork().then(function(){ refreshView(); }); }
function mine(x){ return !x.owner_id || !ST.user || x.owner_id === ST.user.id; }
function upsertCreators(rows){ (rows || []).forEach(function(r){ var c = normCreator(r); var i = W.creators.findIndex(function(x){ return x.id === c.id; }); if (i >= 0) W.creators[i] = Object.assign(c, {owner_email: W.creators[i].owner_email}); else W.creators.unshift(c); }); }
function upsertPost(r){ var p = normPost(r); var i = W.posts.findIndex(function(x){ return x.id === p.id; }); if (i >= 0) W.posts[i] = Object.assign(p, {owner_email: W.posts[i].owner_email}); else W.posts.push(p); }
function activeIg(){ return (W && W.connections || []).filter(function(c){ return c.status === 'active'; }); }
function canWork(){ return coState() === 'active'; }

/* ================= metrics (same rules as before) ================= */
var BENCH = {Nano: [4, 2], Micro: [3, 1.5], Macro: [2, 1], Mega: [1.5, 0.7]};
var TIERS = ['Nano', 'Micro', 'Macro', 'Mega'];
var TIER_RANGE = {Nano: '1K–10K', Micro: '10K–1L', Macro: '1L–10L', Mega: '10L+'};
var PLATFORMS = ['Instagram', 'Instagram Story', 'YouTube', 'YouTube Shorts', 'Moj / Josh', 'Other'];
var TEAM_COLS = [
  ['category', 'Category', 'text'], ['language', 'Language', 'text'], ['name', 'Name', 'name'], ['link', 'Link', 'url'], ['followers', 'Followers', 'int'],
  ['ytLink', 'YT Link', 'url'], ['er', 'ER%', 'er'], ['views', 'Average Views', 'int'],
  ['reach', 'Average Reach', 'int'], ['comments', 'Average Comments', 'int'], ['credibility', 'Audience Quality', 'quality'], ['sentiment', 'Sentiments & Comments', 'long'],
  ['engagement', 'Engagement', 'eng'], ['cpv', 'CPV', 'rs2'], ['cpe', 'CPE', 'rs2'], ['deliverables', 'Deliverables', 'long'],
  ['collab', 'Collab Reel + Story w link + Autodm', 'rs'], ['adRights', '1 Month Ad Rights', 'rs'], ['fee', 'Fee (₹)', 'fee']
];
var TEAM_KEYS = TEAM_COLS.map(function(c){ return c[0]; });
var TO_API = {ytLink: 'yt_link', collab: 'collab_price', adRights: 'ad_rights_price'};
function hasComp(c){ return !!(c.competitors && c.competitors !== 'None found'); }
function isApi(c){ return (c.platform || 'Instagram') === 'Instagram' && c.source !== 'Manual'; }
function dn(c){ return isApi(c) ? '@' + c.handle : c.handle; }
function pdn(p){ return /^[a-z0-9._]+$/.test(p.handle || '') && (p.platform || 'Instagram').indexOf('Instagram') === 0 ? '@' + p.handle : p.handle; }
function erStatus(tier, er){ if (!ok(er)) return null; var b = BENCH[tier] || BENCH.Micro; return er >= b[0] ? 'good' : er >= b[1] ? 'ok' : 'weak'; }
function creatorRows(){
  var list = (W.creators || []).map(function(c){
    var eng = (c.avgLikes || c.avgComments) ? (c.avgLikes || 0) + (c.avgComments || 0) : 0; var tier = tierFor(c.followers) || '';
    var reach = +c.reach || null, price = +c.fee || +c.collab || 0;
    return {c: c, tier: tier, eng: eng, price: price, priceEst: !c.fee && !!price, er: c.followers && eng ? eng / c.followers * 100 : null,
      cpv: price && c.avgViews ? price / c.avgViews : null, cpe: price && eng ? price / eng : null,
      cpm: price && c.avgViews ? price / c.avgViews * 1000 : null, cpr: price && reach ? price / reach : null,
      cpf: price && c.followers ? price / c.followers * 1000 : null, erR: reach && eng ? eng / reach * 100 : null,
      erV: c.avgViews && eng ? eng / c.avgViews * 100 : null, reachRate: reach && c.followers ? reach / c.followers * 100 : null,
      viewRate: c.avgViews && c.followers ? c.avgViews / c.followers * 100 : null};
  });
  var cpvs = list.map(function(x){ return x.cpv; }).filter(ok); var med = median(cpvs);
  list.forEach(function(x){
    var st = erStatus(x.tier, x.er); x.st = st;
    var erTxt = (st === 'good' ? 'ER strong' : st === 'ok' ? 'ER okay' : 'ER weak') + ' for ' + (x.tier || 'its size');
    if (!x.c.followers && !x.c.avgViews) { x.v = {cls: 'neutral', label: 'Not fetched', why: x.c.status || 'Look this creator up again.'}; }
    else if (!ok(x.cpv)) { x.v = {cls: st === 'good' ? 'good' : st === 'ok' ? 'warn' : 'bad', label: st === 'good' ? 'Good engagement' : st === 'ok' ? 'Average engagement' : 'Low engagement', why: erTxt + '. ' + (x.price ? 'No video views, so CPV can’t be estimated.' : 'Add the fee to judge value.')}; }
    else if (cpvs.length < 2) { x.v = {cls: st === 'weak' ? 'bad' : 'warn', label: st === 'weak' ? 'Low engagement' : 'Add more creators', why: erTxt + '. Add one more creator with a fee to compare prices.'}; }
    else {
      var diff = (x.cpv - med) / med * 100; var cpvTxt = Math.abs(diff) < 1 ? 'CPV at median' : 'CPV ' + Math.abs(diff).toFixed(0) + '% ' + (diff < 0 ? 'below' : 'above') + ' median';
      if (st === 'weak' || x.cpv > med * 1.4) x.v = {cls: 'bad', label: 'Avoid or renegotiate', why: cpvTxt + '; ' + erTxt + '.'};
      else if ((st === 'good' && x.cpv <= med) || (st === 'ok' && x.cpv <= med * 0.7)) x.v = {cls: 'good', label: 'Good value', why: cpvTxt + '; ' + erTxt + '.'};
      else x.v = {cls: 'warn', label: 'Negotiate', why: cpvTxt + '; ' + erTxt + '.'};
    }
  });
  return {list: list, med: med, n: cpvs.length};
}
function postRows(){
  var list = (W.posts || []).map(function(p){
    var eng = (p.likes || 0) + (p.comments || 0);
    return {p: p, eng: eng, erV: p.views ? eng / p.views * 100 : null, cpv: p.fee && p.views ? p.fee / p.views : null, cpe: p.fee && eng ? p.fee / eng : null, cpm: p.fee && p.views ? p.fee / p.views * 1000 : null};
  });
  var medC = median(list.map(function(x){ return x.cpv; }).filter(ok)); var medE = median(list.map(function(x){ return x.erV; }).filter(ok));
  list.forEach(function(x){
    if (!ok(x.cpv) || !ok(medC)) { x.v = {cls: 'neutral', label: 'Need data', why: 'Add fee and views to judge this post.'}; return; }
    var d = (x.cpv - medC) / medC * 100; var t = Math.abs(d) < 1 ? 'CPV at median' : 'CPV ' + Math.abs(d).toFixed(0) + '% ' + (d < 0 ? 'below' : 'above') + ' median';
    var e = ok(x.erV) && ok(medE) ? (x.erV >= medE ? 'engagement above median' : 'engagement below median') : 'no engagement data';
    if (x.cpv > medC * 1.4 || (ok(x.erV) && ok(medE) && x.erV < medE * 0.6)) x.v = {cls: 'bad', label: 'Review', why: t + '; ' + e + '.'};
    else if (x.cpv <= medC && ok(x.erV) && ok(medE) && x.erV >= medE) x.v = {cls: 'good', label: 'Rebook', why: t + '; ' + e + '.'};
    else x.v = {cls: 'warn', label: 'Watch', why: t + '; ' + e + '.'};
  });
  var t = {fee: 0, views: 0, eng: 0};
  list.forEach(function(x){ t.fee += x.p.fee || 0; t.views += x.p.views || 0; t.eng += x.eng; });
  return {list: list, medC: medC, t: t};
}
function dayInfo(){
  var s = W.settings || {}; if (!s.start || !s.end) return null;
  var a = new Date(s.start + 'T00:00:00'), b = new Date(s.end + 'T00:00:00'); var total = Math.round((b - a) / 864e5) + 1; if (!(total > 0)) return null;
  var today = new Date(); today.setHours(0, 0, 0, 0); var day = Math.round((today - a) / 864e5) + 1;
  return {total: total, day: day, frac: Math.min(1, Math.max(0, day / total))};
}
function avgOf(list, k){ var v = list.map(function(x){ return x[k]; }).filter(ok); return v.length ? v.reduce(function(a, b){ return a + b; }, 0) / v.length : null; }

/* ================= insights: audience quality, sponsored vs organic, content mix ================= */
function qualityInfo(c){ var t = String(c && c.credibility || ''); var m = t.match(/^(Genuine|Check|Suspicious) · (\d+)\/100/);
  if (m) return {label: m[1], score: +m[2], cls: m[1] === 'Genuine' ? 'good' : m[1] === 'Check' ? 'warn' : 'bad'};
  if (/Not enough posts/.test(t)) return {label: 'Not enough posts', score: null, cls: 'neutral'};
  return null; }
function parseMix(t){ return String(t || '').split(' | ').map(function(s){ var m = s.match(/^(Reels|Carousel|Photo) (\d+)% \((\d+) posts?\) · ER ([\d.]+%|—)(?: · (.+) views)?$/);
  return m ? {f: m[1], share: +m[2], n: +m[3], er: m[4], views: m[5] || ''} : null; }).filter(Boolean); }
function liftCls(t){ var m = String(t || '').match(/^([+-]\d+)%/); if (!m) return ''; var v = +m[1]; return Math.abs(v) < 10 ? '' : v > 0 ? 'good' : 'bad'; }
function insightBoxes(c){
  var q = qualityInfo(c), mix = parseMix(c.contentMix), none = '<span class="small muted">Refresh this creator to see this.</span>';
  var qBox = '<div class="box"><span class="k">Audience quality</span>' +
    (q ? (q.score != null ? '<span class="v">' + q.score + '<span class="small muted"> / 100</span></span>' : '') + '<span><span class="chip ' + q.cls + '">' + esc(q.label) + '</span></span><span class="small">' + esc(c.qualityWhy || '') + '</span><span class="tiny muted">An estimate from organic posts. Sponsored and boosted posts are left out, so paid promotion is never counted as fake.</span>' : none) + '</div>';
  var lc = liftCls(c.sponsoredLift);
  var sBox = '<div class="box"><span class="k">Sponsored vs organic</span>' +
    (c.sponsoredLift ? '<div class="split"><div><span class="small muted">Organic ER</span><strong>' + pct(c.organicEr, 2) + '</strong></div><div><span class="small muted">Sponsored ER</span><strong>' + pct(c.sponsoredEr, 2) + '</strong></div></div>' +
      '<span class="small">' + (lc ? '<span class="chip ' + lc + '">' + esc(c.sponsoredLift.split(' · ')[0]) + '</span> ' : '') + esc(lc ? c.sponsoredLift.replace(/^[+-]\d+% · /, '') : c.sponsoredLift) + '</span>' +
      (c.boosted && c.boosted !== 'None' ? '<span class="small"><span class="chip gold">Boosted</span> ' + esc(c.boosted) + '</span>' : '') +
      '<span class="tiny muted">Sponsored means captions with #ad, #collab, paid partnership and similar tags.</span>' : none) + '</div>';
  var mBox = '<div class="box"><span class="k">Content mix</span>' +
    (mix.length ? '<div class="mix">' + mix.map(function(r){ return '<div class="mixrow"><span class="small"><strong>' + r.f + '</strong> ' + r.share + '%</span><span class="bar"><i style="width:' + Math.max(4, r.share) + '%"></i></span><span class="tiny muted">ER ' + esc(r.er) + (r.views ? ', ' + esc(r.views) + ' views' : '') + '</span></div>'; }).join('') + '</div>' +
      (c.bestFormat ? '<span class="small">Best format: <strong>' + esc(c.bestFormat) + '</strong></span>' : '') : none) + '</div>';
  return '<div class="boxes">' + qBox + sBox + mBox + '</div>';
}

/* ================= routing inside the workspace ================= */
function renderWork(view){
  var c = co();
  if (!W || ST.workCo !== c.id) {
    loadingBody();
    loadWork().then(function(){ if (CURRENT === view) renderShell(view, function(){ renderWorkView(view); }); }).catch(function(e){ errorBody(e, function(){ renderWork(view); }); });
    return;
  }
  renderWorkView(view);
}
function renderWorkView(v){
  if (v === 'lookup') return renderLookup();
  if (v === 'shortlist') return renderShortlist();
  if (v === 'campaign') return renderCampaign();
  if (v === 'report') return renderReport();
}
function refreshView(){
  if (WORK_ROUTES.indexOf(CURRENT) >= 0) {
    var y = window.scrollY; renderWorkView(CURRENT); window.scrollTo(0, y);
  }
  var setCnt = function(k, n){ var a = document.querySelector('.side a.nl[href="#/' + k + '"]'); if (!a) return; var s = a.querySelector('.cnt'); if (!n) { if (s) s.remove(); return; } if (!s) { s = document.createElement('span'); s.className = 'cnt'; a.appendChild(s); } s.textContent = n; };
  if (W) { setCnt('shortlist', W.creators.length); setCnt('campaign', W.posts.length); }
  $('handles').innerHTML = (W ? W.creators : []).map(function(c){ return '<option value="' + esc(c.handle) + '">'; }).join('');
}
function scopeToggle(){
  if (!isAdmin()) return '';
  return '<div class="seg" role="group" aria-label="Whose work to show"><button data-scope="mine" aria-pressed="' + (ST.scope === 'mine') + '">My work</button><button data-scope="team" aria-pressed="' + (ST.scope === 'team') + '">Whole team</button></div>';
}
function bindScope(){
  qsa('[data-scope]').forEach(function(b){ b.onclick = function(){ if (ST.scope === b.dataset.scope) return; ST.scope = b.dataset.scope; SEL = {}; loadingBody();
    loadWork().then(function(){ renderShell(CURRENT, function(){ renderWorkView(CURRENT); }); }).catch(function(e){ toast(e.message, true); }); }; });
}
function teamNote(){ return W.scope === 'team' ? '<div class="note"><span>You’re looking at the <strong>whole team’s</strong> work. Rows added by others are read-only here; switch to <em>My work</em> to make changes.</span></div>' : ''; }
function igMissingNote(){
  if (activeIg().length || !canWork()) return '';
  var exp = (W.connections || []).filter(function(c){ return c.status === 'expired'; });
  return '<div class="note warn"><span><strong>' + (exp.length ? 'Your Instagram connection has expired.' : 'No Instagram account is connected yet.') + '</strong> ' +
    (isAdmin() ? 'Lookups need one. It takes about a minute.' : 'Lookups need one. Ask your company admin to connect it.') + '</span>' + (isAdmin() ? '<a class="btn primary sm" href="#/instagram">' + (exp.length ? 'Reconnect Instagram' : 'Connect Instagram') + '</a>' : '') + '</div>';
}

/* ================= lookup ================= */
var DETAILS = [['category', 'Category', 'text'], ['language', 'Language', 'text'], ['platform', 'Platform', 'platform'], ['fee', 'Fee (₹)', 'num'],
  ['collab', 'Collab Reel + Story w link + Autodm (₹)', 'num'], ['adRights', '1 Month Ad Rights (₹)', 'num'], ['link', 'Link', 'text'], ['ytLink', 'YT Link', 'text'],
  ['reach', 'Average Reach', 'num'], ['sentiment', 'Sentiments & Comments', 'long'], ['deliverables', 'Deliverables', 'long']];
var MANUAL_DETAILS = [['followers', 'Followers', 'num'], ['views', 'Average Views', 'num'], ['likes', 'Average Likes', 'num'], ['comments', 'Average Comments', 'num'], ['posts', 'Posts', 'num']];
var CATEGORIES = ['Beauty', 'Skincare', 'Haircare', 'Fashion', 'Lifestyle', 'Travel', 'Food', 'Fitness', 'Health & Wellness', 'Parenting', 'Tech', 'Gaming', 'Comedy', 'Entertainment', 'Music', 'Dance', 'Education', 'Finance', 'Business', 'Home & Decor', 'Pets', 'Automotive', 'Photography', 'Art & DIY', 'Sports', 'Spirituality', 'Books', 'Motivation', 'Other'];
var LANGUAGES = ['Hindi', 'English', 'Hindi, English', 'Marathi', 'Bengali', 'Punjabi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Odia', 'Urdu', 'Assamese', 'Bhojpuri'];
var DETAIL_HINT = {reach: 'Auto estimate, or from insights', ytLink: 'Auto from bio, or paste link', collab: 'Auto estimate, or quoted price', adRights: 'Auto estimate, or quoted price'};
function stat(k, v, s){ return '<div><span class="k">' + k + '</span><span class="v">' + v + '</span><span class="s">' + s + '</span></div>'; }

function renderLookup(){
  var b = body(pageHead('Creator lookup', 'Type an Instagram handle or paste a profile link. Add the fee they quoted to see cost per view and a verdict. Every creator you look up is saved to your shortlist.') +
    igMissingNote() +
    '<div class="panel"><form class="lookup-bar" id="lookup-form" novalidate>' +
      '<label class="field">Instagram handle or profile link<input id="lk-handle" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="itss.vanshikaaa"></label>' +
      '<label class="field">Quoted fee (₹) <span class="hint">Optional</span><input id="lk-fee" type="number" min="0" step="any" inputmode="numeric" placeholder="25000"></label>' +
      '<button class="btn primary lg" id="lk-btn" type="submit"' + (canWork() ? '' : ' disabled') + '>' + icon('search', 18) + 'Look up creator</button>' +
    '</form></div>' +
    '<div id="lookup-result"></div>' +
    '<div class="panel"><div class="stack"><h3>Before you book a creator</h3><p class="small muted">Estimates what a new creator would deliver, based on how creators of the same size in your shortlist perform. Useful for YouTube, Moj or anyone you can’t look up.</p></div>' +
      '<div class="form cols-4"><label class="field">Quoted fee (₹)<input id="est-fee" type="number" min="0" step="any" value="60000"></label>' +
      '<label class="field">Followers or subscribers<input id="est-fol" type="number" min="0" step="any" value="150000"></label>' +
      '<label class="field">Average views per post <span class="hint">Optional</span><input id="est-views" type="number" min="0" step="any" placeholder="Leave blank to estimate"></label></div>' +
      '<div class="panel flat tight" id="est-out"></div></div>');
  $('lookup-form').onsubmit = function(e){
    e.preventDefault();
    var h = $('lk-handle').value, fee = $('lk-fee').value, btn = $('lk-btn');
    if (!cleanHandle(h)) { toast('Type an Instagram handle first.', true); $('lk-handle').focus(); return; }
    busy(btn, true, 'Fetching…');
    api('creators.lookup', {companyId: ST.coId, handles: [cleanHandle(h)], fee: num(fee)}).then(function(r){
      var res = (r.results || [])[0] || {};
      if (r.creators && r.creators.length) { if (W.scope === 'team') { r.creators.forEach(function(x){ x.owner_email = ST.user.email; }); } upsertCreators(r.creators); CUR = r.creators[0].id; }
      if (!res.ok) toast(res.message || 'Could not fetch that creator.', true);
      else { toast('Saved @' + res.handle + ' to your shortlist' + (res.cached ? '. From the last 6 hours, so no lookup was used.' : '')); $('lk-handle').value = ''; $('lk-fee').value = ''; }
      refreshView(); refreshCapacity();
    }).catch(function(err){ toast(err.message, true); }).then(function(){ busy(btn, false); });
  };
  ['est-fee', 'est-fol', 'est-views'].forEach(function(id){ $(id).addEventListener('input', renderEstimator); });
  renderLookupCard(); renderEstimator(); bindScope();
}
function renderLookupCard(){
  var R = creatorRows(); var box = $('lookup-result'); if (!box) return;
  var pick = null;
  if (CUR) pick = R.list.find(function(x){ return x.c.id === CUR; });
  if (!pick && R.list.length) pick = R.list.filter(function(x){ return mine(x.c); }).sort(function(a, b){ return String(b.c.updated).localeCompare(String(a.c.updated)); })[0] || null;
  if (!pick) { box.innerHTML = '<div class="empty"><strong>Your first creator goes here</strong><span>Type a handle above to see followers, engagement rate, audience quality and cost per view.</span></div>'; return; }
  var c = pick.c, bm = BENCH[pick.tier] || BENCH.Micro, own = mine(c);
  var stCls = pick.st === 'good' ? 'good' : pick.st === 'ok' ? 'warn' : 'bad';
  var stTxt = pick.st === 'good' ? 'Strong' : pick.st === 'ok' ? 'Okay' : 'Weak';
  var link = isApi(c) ? '<a class="btn sm" href="https://www.instagram.com/' + encodeURIComponent(c.handle) + '/" target="_blank" rel="noopener">Open on Instagram</a>' : '';
  var fields = DETAILS.concat(isApi(c) ? [] : MANUAL_DETAILS);
  var form = fields.map(function(f){ var v = c[f[0]]; var id = 'cd-' + f[0];
    if (f[2] === 'platform') return '<label class="field">' + f[1] + '<select id="' + id + '" data-d="' + f[0] + '">' + PLATFORMS.map(function(p){ return '<option' + (p === (c.platform || 'Instagram') ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label>';
    if (f[2] === 'long') return '<label class="field full">' + f[1] + '<textarea id="' + id + '" data-d="' + f[0] + '" rows="2" style="min-height:58px">' + esc(v || '') + '</textarea></label>';
    var extra = f[0] === 'category' ? ' list="cat-list" placeholder="Auto from Instagram"' : f[0] === 'language' ? ' list="lang-list" placeholder="Auto from Instagram"' : DETAIL_HINT[f[0]] ? ' placeholder="' + DETAIL_HINT[f[0]] + '"' : '';
    return '<label class="field">' + f[1] + '<input id="' + id + '" data-d="' + f[0] + '" type="' + (f[2] === 'num' ? 'number" min="0" step="any' : 'text') + '"' + extra + ' value="' + esc(v == null ? '' : v) + '"></label>';
  }).join('');
  var meta = [c.category, c.language, c.platform || 'Instagram', pick.tier ? pick.tier + ' creator' : ''].filter(Boolean);
  box.innerHTML =
   '<div class="panel">' +
    '<div class="spread" style="align-items:flex-start"><div class="stack" style="gap:6px"><span class="handle-big">' + esc(dn(c)) + '</span>' +
      '<div class="row" style="gap:6px">' + meta.map(function(m){ return '<span class="chip neutral">' + esc(m) + '</span>'; }).join('') + '</div>' +
      '<span class="small muted">Updated ' + esc(ago(c.updated) || '—') + (c.status ? '. ' + esc(c.status) : '') + (W.scope === 'team' && c.owner_email ? '. Added by ' + esc(c.owner_email) : '') + '</span></div>' +
      '<div class="btns">' + link + '<span class="chip ' + pick.v.cls + '" style="font-size:14px;padding:5px 12px">' + esc(pick.v.label) + '</span></div></div>' +
    '<div class="ledger">' +
      stat('Followers', short(c.followers), esc(pick.tier || '—') + ' tier') +
      stat('Average views', short(c.avgViews), c.avgViews ? (isApi(c) ? 'Reels and videos' : 'entered manually') : 'no videos found') +
      stat('Average comments', short(c.avgComments), isApi(c) ? 'last 12 posts' : 'entered manually') +
      stat('Average likes', short(c.avgLikes), isApi(c) ? 'last 12 posts' : 'entered manually') +
      stat('Engagement', short(pick.eng), 'avg likes + comments') +
      stat('ER%', pct(pick.er, 2), '<span class="dot ' + stCls + '" style="margin-right:5px"></span>' + stTxt + ' for its size (strong from ' + bm[0] + '%)') +
    '</div>' +
    '<div class="boxes">' +
      '<div class="box money"><span class="k">Cost per view</span><span class="v">' + rs(pick.cpv, 2) + '</span><span class="small muted">' + (c.fee ? 'Fee ' + rs(c.fee) + ' ÷ average views' : c.collab ? 'Collab price ' + rs(+c.collab) + ' (est.) ÷ average views' : 'Add the fee below') + '</span></div>' +
      '<div class="box"><span class="k">Cost per engagement</span><span class="v">' + rs(pick.cpe, 2) + '</span><span class="small muted">Fee ÷ engagement</span></div>' +
      '<div class="box"><span class="k">Shortlist median CPV</span><span class="v">' + rs(R.med, 2) + '</span><span class="small muted">' + (R.n > 1 ? 'Across ' + R.n + ' creators with fee and views' : 'Add more creators with fees to compare') + '</span></div>' +
      '<div class="box"><span class="k">Verdict</span><span><span class="chip ' + pick.v.cls + '">' + esc(pick.v.label) + '</span></span><span class="small muted">' + esc(pick.v.why) + '</span></div>' +
    '</div>' +
    (isApi(c) ? '<div class="boxes">' +
      '<div class="box ' + (hasComp(c) ? 'hit' : '') + '"><span class="k">Competitor mentions</span>' +
        (hasComp(c) ? '<span><span class="chip warn">Worked with a competitor</span></span><span class="small">' + esc(c.competitors) + '</span>' : '<span class="small">' + (c.competitors ? 'No competitor brands found in the last 25 captions.' : 'Refresh this creator to check.') + '</span>') +
        '<a class="tiny link" href="#/shortlist/competitors">Edit your competitor list</a></div>' +
      '<div class="box"><span class="k">Recent brand collabs</span><span class="small">' + esc(c.collabs && c.collabs !== 'None found' ? c.collabs : (c.collabs ? 'No posts marked as ads or collabs in the last 25 captions.' : 'Refresh this creator to check.')) + '</span><span class="tiny muted">From captions with #ad, #collab, paid partnership and similar tags. Collabs not written in captions won’t show.</span></div>' +
    '</div>' + insightBoxes(c) : '') +
    '<div class="stack"><h3>Creator details</h3><p class="small muted">The columns your team fills in. ' + (isApi(c) ? 'Followers, views, likes and comments come from Instagram.' : 'This creator was entered manually, so you can edit every number.') + (own ? '' : ' Only ' + esc(c.owner_email || 'the person who added this creator') + ' can edit it.') + '</p></div>' +
    '<form class="form cols-4" id="details-form"><fieldset style="display:contents"' + (own ? '' : ' disabled') + '>' + form + '</fieldset>' + (own ? '<button class="btn primary" type="submit" id="cd-save">Save details</button>' : '') + '</form>' +
   '</div>';
  var f = $('details-form');
  f.onsubmit = function(e){ e.preventDefault(); var btn = $('cd-save'); var out = {};
    qsa('[data-d]', f).forEach(function(el){ var k = el.dataset.d; out[TO_API[k] || k] = el.value; });
    busy(btn, true, 'Saving…');
    api('creators.save', {companyId: ST.coId, id: c.id, fields: out}).then(function(r){ upsertCreators([r.creator]); CUR = c.id; refreshView(); toast('Details saved'); })
      .catch(function(err){ toast(err.message, true); }).then(function(){ busy(btn, false); });
  };
}
function renderEstimator(){
  var out = $('est-out'); if (!out) return;
  var fee = num($('est-fee').value), fol = num($('est-fol').value), given = num($('est-views').value);
  if (!fee || (!fol && !given)) { out.innerHTML = '<p class="small muted">Enter the quoted fee and follower count.</p>'; return; }
  var tier = tierFor(fol) || 'Micro';
  var R = creatorRows();
  var withViews = R.list.filter(function(x){ return x.c.followers && x.c.avgViews; });
  var peers = withViews.filter(function(x){ return x.tier === tier; }); var pool = peers.length ? peers : withViews;
  if (!pool.length && !given) { out.innerHTML = '<p class="small muted">Add at least one creator with followers and views to the shortlist, or type this creator’s average views.</p>'; return; }
  var avg = function(f){ return pool.length ? pool.reduce(function(s, x){ return s + (f(x) || 0); }, 0) / pool.length : 0; };
  var views = given || fol * avg(function(x){ return x.c.avgViews / x.c.followers; });
  var erV = avg(function(x){ return x.eng / x.c.avgViews; }); var eng = views * erV; var cpv = views ? fee / views : null;
  var basis = given ? 'the views you entered' : peers.length ? plural(peers.length, tier + ' creator') + ' in your shortlist' : 'all creators in your shortlist (no ' + tier + ' creators yet)';
  var call2 = '';
  if (ok(cpv) && ok(R.med)) { var d = (cpv - R.med) / R.med * 100; var cls = d <= 0 ? 'good' : d <= 40 ? 'warn' : 'bad';
    call2 = '<p class="small"><span class="chip ' + cls + '" style="margin-right:6px">' + (d <= 0 ? 'Cheaper than your shortlist' : d <= 40 ? 'Slightly expensive' : 'Expensive') + '</span>' +
      (Math.abs(d) < 1 ? 'Same cost per view as your shortlist median.' : 'About ' + Math.abs(d).toFixed(0) + '% ' + (d < 0 ? 'cheaper' : 'costlier') + ' per view than your shortlist median of ' + rs(R.med, 2) + '.') + '</p>'; }
  out.innerHTML = '<div class="ledger" style="background:transparent;border:none;gap:16px">' + stat('Tier', tier, TIER_RANGE[tier]) + stat('Expected views', short(views), 'per post') + stat('Expected CPV', rs(cpv, 2), 'fee ÷ views') + stat('Expected CPE', eng ? rs(fee / eng, 2) : '—', 'fee ÷ engagement') + '</div>' + call2 +
    '<p class="tiny muted">Based on ' + esc(basis) + '. A starting point for planning, not a promise.</p>';
  qsa('.ledger>div', out).forEach(function(d){ d.style.background = 'transparent'; d.style.padding = '0'; });
}

/* ================= shortlist ================= */
var sKey = 'cpv', sDir = 1, shortTab = 'creators';
var VORD = {'Good value': 0, 'Good engagement': 1, 'Negotiate': 2, 'Average engagement': 3, 'Add more creators': 4, 'Not fetched': 5, 'Low engagement': 6, 'Avoid or renegotiate': 7};
var NUMSORT = {followers: 1, views: 1, reach: 1, comments: 1, collab: 1, adRights: 1, fee: 1};
function sval(x, k){ if (k === 'name') return x.c.handle.toLowerCase(); if (k === 'competitors') return hasComp(x.c) ? 0 : (x.c.competitors ? 1 : null); if (k === 'verdict') return VORD[x.v.label]; if (k === 'engagement') return x.eng;
  if (k === 'er' || k === 'cpv' || k === 'cpe' || k === 'cpm' || k === 'cpr') return x[k]; if (k === 'credibility') { var qq = qualityInfo(x.c); return qq ? qq.score : null; } if (k === 'sponsoredLift') { var lm = String(x.c.sponsoredLift || '').match(/^([+-]\d+)%/); return lm ? +lm[1] : null; } if (k === 'tier') return TIERS.indexOf(x.tier) >= 0 ? TIERS.indexOf(x.tier) : null; if (NUMSORT[k]) return x.c[k]; var v = x.c[k]; return v ? String(v).toLowerCase() : null; }
function sortList(list, key, dir, fn){
  return list.slice().sort(function(a, b){ var va = fn(a, key), vb = fn(b, key); var na = va == null || va === '' || (typeof va === 'number' && !isFinite(va)), nb = vb == null || vb === '' || (typeof vb === 'number' && !isFinite(vb));
    if (na && nb) return 0; if (na) return 1; if (nb) return -1; return (va < vb ? -1 : va > vb ? 1 : 0) * dir; });
}
function urlCell(u){ if (!u) return '<span class="muted">—</span>'; if (/\s/.test(String(u).trim()) || !/[.\/]/.test(u)) return '<span class="muted small">' + esc(u) + '</span>'; var href = /^https?:/i.test(u) ? u : 'https://' + u; return '<a class="lnk" href="' + esc(href) + '" target="_blank" rel="noopener">Open</a>'; }
function selIds(){ return Object.keys(SEL).filter(function(k){ return SEL[k] && W.creators.some(function(c){ return c.id === k; }); }); }

function renderShortlist(){
  var arg = parseHash().arg; if (arg === 'add' || arg === 'competitors' || arg === 'creators') shortTab = arg;
  var n = W.creators.length, mineN = W.creators.filter(mine).length;
  body(pageHead('Shortlist', 'Your team’s columns, in your sheet’s order. Followers, views, likes and comments come from Instagram; ER%, CPV and CPE are worked out from the fee.',
      scopeToggle()) + teamNote() +
    '<div class="tabs" role="tablist">' +
      '<button role="tab" data-st="creators" aria-selected="' + (shortTab === 'creators') + '">Creators <span class="count">' + n + '</span></button>' +
      '<button role="tab" data-st="add" aria-selected="' + (shortTab === 'add') + '">Add creators</button>' +
      '<button role="tab" data-st="competitors" aria-selected="' + (shortTab === 'competitors') + '">Competitor brands</button></div>' +
    '<div id="short-body" style="display:flex;flex-direction:column;gap:22px"></div>');
  qsa('[data-st]').forEach(function(b){ b.onclick = function(){ shortTab = b.dataset.st; history.replaceState(null, '', '#/shortlist/' + shortTab); renderShortlist(); }; });
  bindScope();
  var sbody = $('short-body');
  if (shortTab === 'add') return renderAddCreators(sbody);
  if (shortTab === 'competitors') return renderCompetitors(sbody);
  sbody.innerHTML =
    '<div class="spread" style="align-items:center"><div class="row"><span class="chip neutral" id="sel-count">0 selected</span><span class="small muted">Tick creators to export only those.</span></div>' +
    '<div class="btns"><button class="btn sm" id="xl-creators">' + icon('down', 16) + 'Download Excel</button><button class="btn sm" id="csv-creators">Copy as CSV</button>' +
      (W.scope === 'mine' && canWork() && mineN ? '<button class="btn sm" id="refresh-creators">' + icon('refresh', 16) + 'Refresh from Instagram</button>' : '') +
      (W.scope === 'mine' && mineN ? '<button class="btn sm danger" id="clear-creators">Remove all</button>' : '') + '</div></div>' +
    '<div class="tbl" style="max-height:72vh"><table class="t-short" id="short-table"></table></div>' +
    '<div class="panel"><div class="spread"><h3>Estimated cost per view</h3><div class="legend"><span><span class="dot good"></span>Good value</span><span><span class="dot warn"></span>Negotiate</span><span><span class="dot bad"></span>Avoid</span><span><span style="display:inline-block;width:14px;border-top:2px dashed var(--gold)"></span>Median</span></div></div><div id="short-chart"></div></div>';
  renderShortTable();
  $('csv-creators').onclick = function(){ var ids = selIds(); copyText(creatorsCSV(ids), this, ids.length ? 'Selected creators' : 'Shortlist'); };
  $('xl-creators').onclick = function(){ downloadExcel(this, selIds()); };
  var rf = $('refresh-creators'); if (rf) rf.onclick = function(){ refreshCreators(rf); };
  var cl = $('clear-creators'); if (cl) cl.onclick = function(){ var b = this; armOnce(b, 'Click again to remove ' + plural(mineN, 'creator'), function(){ busy(b, true, 'Removing…');
    api('creators.clear', {companyId: ST.coId}).then(function(r){ SEL = {}; CUR = null; W.creators = W.creators.filter(function(c){ return !mine(c); }); refreshView(); toast('Removed ' + plural(r.removed, 'creator')); }).catch(function(e){ busy(b, false); toast(e.message, true); }); }); };
}
function updateSelCount(){ var e = $('sel-count'); if (!e) return; var n = selIds().length; e.textContent = n + ' selected'; e.className = 'chip ' + (n ? 'gold' : 'neutral'); }
function renderShortTable(){
  var R = creatorRows(); var list = sortList(R.list, sKey, sDir, sval);
  var cols = TEAM_COLS.concat([['cpm', 'CPM', 'rs2'], ['cpr', 'CPR', 'rs2'], ['platform', 'Platform', 'text'], ['tier', 'Tier', 'text'], ['sponsoredLift', 'Sponsored vs organic', 'lift'], ['bestFormat', 'Best format', 'long'], ['verdict', 'Verdict', 'verdict'], ['competitors', 'Competitor mentions', 'comp'], ['collabs', 'Recent brand collabs', 'long']]);
  if (W.scope === 'team') cols.push(['owner_email', 'Added by', 'text']);
  var allSel = list.length && list.every(function(x){ return SEL[x.c.id]; });
  var head = '<thead><tr><th><input type="checkbox" id="sel-all" aria-label="Select all creators"' + (allSel ? ' checked' : '') + '></th>' + cols.map(function(c){ var n = ['int', 'er', 'eng', 'rs2', 'rs', 'fee'].indexOf(c[2]) >= 0;
    return '<th class="' + (n ? 'n' : '') + (c[0] === 'name' ? ' stick' : '') + '"><button class="sort ' + (sKey === c[0] ? 'on' : '') + '" data-k="' + c[0] + '">' + esc(c[1]) + '<span class="arr">' + (sKey === c[0] && sDir < 0 ? '▼' : '▲') + '</span></button></th>'; }).join('') + '<th><span class="sr">Remove</span></th></tr></thead>';
  var hi = function(k){ return sKey === k ? ' hi' : ''; };
  var body2 = list.length ? list.map(function(x){ var c = x.c, own = mine(c); var stc = x.st === 'good' ? 'good' : x.st === 'ok' ? 'warn' : x.st ? 'bad' : '';
    return '<tr><td><input type="checkbox" data-sel="' + esc(c.id) + '" aria-label="Select ' + esc(c.handle) + '"' + (SEL[c.id] ? ' checked' : '') + '></td>' + cols.map(function(col){ var k = col[0], t = col[2], v = c[k];
      if (t === 'name') return '<td class="stick' + hi(k) + '"><button class="cname" data-open="' + esc(c.id) + '">' + esc(dn(c)) + '</button><div class="csub">' + esc(ago(c.updated)) + '</div></td>';
      if (t === 'url') return '<td class="' + hi(k).trim() + '">' + urlCell(v) + '</td>';
      if (t === 'int') return '<td class="n' + hi(k) + '">' + (ok(v) ? short(v) : '—') + '</td>';
      if (t === 'er') return '<td class="n' + hi(k) + '">' + (stc ? '<span class="dot ' + stc + '" style="margin-right:6px"></span>' : '') + pct(x.er, 2) + '</td>';
      if (t === 'eng') return '<td class="n' + hi(k) + '">' + (ok(x.eng) && x.eng ? short(x.eng) : '—') + '</td>';
      if (t === 'rs2') return '<td class="n' + hi(k) + '"><strong>' + rs(x[k], 2) + '</strong></td>';
      if (t === 'rs') return '<td class="n' + hi(k) + '">' + rs(v) + '</td>';
      if (t === 'fee') return '<td class="n' + hi(k) + '">' + (own ? '<input class="cell-in fee" type="number" min="0" step="any" data-fee="' + esc(c.id) + '" value="' + (c.fee || '') + '" placeholder="Add fee" aria-label="Fee for ' + esc(c.handle) + '">' : rs(c.fee)) + '</td>';
      if (t === 'long') return '<td class="' + hi(k).trim() + '"><div class="why" style="margin:0">' + (v ? esc(v) : '<span class="muted">—</span>') + '</div></td>';
      if (t === 'verdict') return '<td class="' + hi(k).trim() + '"><span class="chip ' + x.v.cls + '">' + esc(x.v.label) + '</span><div class="why">' + esc(x.v.why) + '</div></td>';
      if (t === 'quality') { var qi = qualityInfo(c); return '<td class="' + hi(k).trim() + '">' + (qi ? '<span class="chip ' + qi.cls + '">' + esc(qi.label + (qi.score != null ? ' · ' + qi.score : '')) + '</span><div class="why">' + esc(String(c.qualityWhy || '').replace(/ Based on.*$/, '')) + '</div>' : '<span class="muted">—</span>') + '</td>'; }
      if (t === 'lift') { var lc2 = liftCls(v); return '<td class="' + hi(k).trim() + '">' + (v ? (lc2 ? '<span class="chip ' + lc2 + '">' + esc(String(v).split(' · ')[0]) + '</span><div class="why">' + esc(String(v).replace(/^[+-]\d+% · /, '')) + '</div>' : '<span class="small muted">' + esc(v) + '</span>') : '<span class="muted">—</span>') + '</td>'; }
      if (t === 'comp') return '<td class="' + hi(k).trim() + '">' + (hasComp(c) ? '<span class="chip warn">Competitor</span><div class="why">' + esc(v) + '</div>' : (v ? '<span class="muted small">None found</span>' : '<span class="muted">—</span>')) + '</td>';
      if (k === 'tier') return '<td class="' + hi(k).trim() + '">' + esc(x.tier || '—') + '</td>';
      return '<td class="' + hi(k).trim() + '">' + (v ? esc(v) : '<span class="muted">—</span>') + '</td>';
    }).join('') + '<td>' + (own ? '<button class="x" data-rm="' + esc(c.id) + '" aria-label="Remove ' + esc(c.handle) + '">×</button>' : '') + '</td></tr>';
  }).join('') : '<tr><td colspan="' + (cols.length + 2) + '" style="white-space:normal"><div class="empty" style="border:none"><strong>No creators yet</strong><span>Look one up, upload your creator sheet, or add someone manually.</span><div class="btns" style="justify-content:center"><a class="btn primary" href="#/lookup">Look up a creator</a><button class="btn" data-goadd>Upload a sheet</button></div></div></td></tr>';
  var t = $('short-table'); t.innerHTML = head + '<tbody>' + body2 + '</tbody>';
  qsa('.sort[data-k]', t).forEach(function(b){ b.onclick = function(){ var k = b.dataset.k; if (sKey === k) sDir *= -1; else { sKey = k; sDir = 1; } renderShortTable(); }; });
  qsa('[data-open]', t).forEach(function(b){ b.onclick = function(){ CUR = b.dataset.open; go('lookup'); }; });
  qsa('[data-goadd]', t).forEach(function(b){ b.onclick = function(){ shortTab = 'add'; renderShortlist(); }; });
  qsa('[data-fee]', t).forEach(function(i){ i.onchange = function(){ api('creators.save', {companyId: ST.coId, id: i.dataset.fee, fields: {fee: i.value}}).then(function(r){ upsertCreators([r.creator]); renderShortTable(); toast('Fee saved'); }).catch(function(e){ toast(e.message, true); }); }; });
  qsa('[data-sel]', t).forEach(function(i){ i.onchange = function(){ SEL[i.dataset.sel] = i.checked; updateSelCount(); var a = $('sel-all'); if (a) a.checked = list.every(function(x){ return SEL[x.c.id]; }); }; });
  var sa = $('sel-all'); if (sa) sa.onchange = function(){ list.forEach(function(x){ SEL[x.c.id] = sa.checked; }); renderShortTable(); };
  qsa('[data-rm]', t).forEach(function(b){ b.onclick = function(){ armOnce(b, 'Remove?', function(){ var id = b.dataset.rm;
    api('creators.remove', {companyId: ST.coId, ids: [id]}).then(function(){ W.creators = W.creators.filter(function(c){ return c.id !== id; }); delete SEL[id]; if (CUR === id) CUR = null; refreshView(); toast('Creator removed'); }).catch(function(e){ toast(e.message, true); }); }); }; });
  updateSelCount(); renderShortChart(R);
}
function renderShortChart(R){
  var el = $('short-chart'); if (!el) return;
  var rows = R.list.filter(function(x){ return ok(x.cpv); }).sort(function(a, b){ return a.cpv - b.cpv; }).slice(0, 30);
  if (!rows.length) { el.innerHTML = '<p class="muted small">Add fees to creators with video views to compare their cost per view.</p>'; return; }
  var Wd = 680, L = 190, Rm = 72, top = 34, rowH = 30, H = top + rows.length * rowH + 30;
  var max = niceMax(Math.max.apply(null, rows.map(function(x){ return x.cpv; }).concat([R.med || 0])));
  var X = function(v){ return L + (v / max) * (Wd - L - Rm); }; var dec = max < 1 ? 2 : max < 10 ? 1 : 0;
  var s = '<svg viewBox="0 0 ' + Wd + ' ' + H + '" style="width:100%;max-width:820px;height:auto" role="img" aria-label="Estimated cost per view by creator">';
  [0, max / 2, max].forEach(function(t){ s += '<line class="g-line" x1="' + X(t) + '" x2="' + X(t) + '" y1="' + (top - 6) + '" y2="' + (H - 24) + '"/><text class="t-mut" x="' + X(t) + '" y="' + (H - 8) + '" text-anchor="middle">₹' + t.toFixed(dec) + '</text>'; });
  rows.forEach(function(r, i){ var y = top + i * rowH; var nm = dn(r.c); if (nm.length > 24) nm = nm.slice(0, 23) + '…';
    s += '<text class="t-ink" x="' + (L - 10) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end">' + esc(nm) + '</text>';
    s += '<rect class="b-' + r.v.cls + '" x="' + L + '" y="' + (y + 7) + '" width="' + Math.max(2, X(r.cpv) - L) + '" height="' + (rowH - 14) + '" rx="3"/>';
    s += '<text class="t-ink" x="' + (X(r.cpv) + 6) + '" y="' + (y + rowH / 2 + 4) + '" font-weight="600">₹' + r.cpv.toFixed(2) + '</text>'; });
  if (ok(R.med)) { var mx = X(R.med), lx = Math.min(Wd - 60, Math.max(L + 40, mx));
    s += '<line class="m-line" x1="' + mx + '" x2="' + mx + '" y1="' + (top - 4) + '" y2="' + (H - 24) + '"/><text class="t-mut" x="' + lx + '" y="' + (top - 12) + '" text-anchor="middle">Median ₹' + R.med.toFixed(2) + '</text>'; }
  el.innerHTML = s + '</svg>';
}
function refreshCreators(btn){
  busy(btn, true, 'Refreshing…'); var total = 0, failed = 0, rounds = 0;
  var step = function(){
    rounds++;
    return api('creators.refresh', {companyId: ST.coId}).then(function(r){
      upsertCreators(r.creators); total += (r.results || []).filter(function(x){ return x.ok; }).length; failed += (r.results || []).filter(function(x){ return !x.ok; }).length;
      var stop = (r.results || []).some(function(x){ return !x.ok && /limit|No Instagram|expired|connection/i.test(x.message); });
      if (r.remaining > 0 && !stop && rounds < 8 && (r.results || []).length) { btn.innerHTML = '<span class="spin"></span> ' + r.remaining + ' left…'; return step(); }
      return r;
    });
  };
  step().then(function(r){ refreshView(); refreshCapacity();
    if (!total && !failed) toast('Everything is up to date. Creators refresh after 12 hours.');
    else toast('Refreshed ' + plural(total, 'creator') + (failed ? ', ' + failed + ' could not be fetched' : '') + (r && r.remaining ? '. ' + r.remaining + ' still to do; try again later.' : ''), !!failed);
  }).catch(function(e){ toast(e.message, true); }).then(function(){ busy(btn, false); });
}
function refreshCapacity(){
  // Lookups use the hourly budget; reload quietly so the sidebar meter stays true.
  api('work.state', {companyId: ST.coId, scope: ST.scope}).then(function(d){ if (!W) return; W.capacity = d.capacity || []; W.connections = d.connections || [];
    var cap = document.querySelector('.cap'); var act = W.capacity.filter(function(x){ return x.status === 'active'; });
    if (cap && act.length) { var used = act.reduce(function(a, x){ return a + (+x.used_this_hour || 0); }, 0), lim = act.reduce(function(a, x){ return a + (+x.hourly_limit || 0); }, 0);
      cap.querySelector('b').textContent = (lim - used) + ' lookups left'; cap.querySelector('.fill').style.width = Math.min(100, used / lim * 100) + '%'; cap.lastElementChild.textContent = used + ' of ' + lim + ' used, resets at ' + new Date(act[0].resets_at).toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'}); }
  }).catch(function(){});
}

/* ---------- add creators: upload, manual, paste ---------- */
function renderAddCreators(el){
  var dis = canWork() && W.scope === 'mine' ? '' : ' disabled';
  el.innerHTML = igMissingNote() +
    '<div class="panel"><div class="stack"><h3>Upload a creator sheet</h3><p class="small muted">Any Excel or CSV file works: a full sheet, a half-filled one, or just a list of names. Every Instagram handle or profile link is looked up, and only the empty cells are filled. Whatever is already in your file stays as it is.</p></div>' +
      '<label class="drop" id="drop" for="up-file"><input id="up-file" type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" hidden' + dis + '>' + icon('upload', 20) + '<strong>Choose a file</strong> <span class="muted">or drag it here. .xlsx, .xls or .csv</span></label>' +
      '<div id="up-preview" hidden></div>' +
      '<div id="up-progress" hidden class="stack"><div class="spread"><span id="up-prog-l">Fetching…</span><span class="muted" id="up-prog-r"></span></div><div class="track"><div class="fill" id="up-fill" style="width:0%"></div></div></div>' +
      '<div id="up-result" hidden></div>' +
      '<p class="tiny muted">Instagram finds creators only by their exact handle (like itss.vanshikaaa) or profile link, not by display name. Rows with only a display name are added so you can fill them in.</p></div>' +
    '<div class="two">' +
      '<div class="panel"><div class="stack"><h3>Add a creator manually</h3><p class="small muted">For YouTube, Moj, Stories or anyone whose numbers you already have. Type averages from their recent posts.</p></div>' +
        '<form class="form cols-2" id="manual-form"><fieldset style="display:contents"' + dis + '>' +
          '<label class="field full">Creator name or handle<input id="mf-name" type="text" autocomplete="off" placeholder="Beauty with Riya"></label>' +
          '<label class="field">Category<input id="mf-category" type="text" list="cat-list" placeholder="Beauty"></label>' +
          '<label class="field">Language<input id="mf-language" type="text" list="lang-list" placeholder="Hindi"></label>' +
          '<label class="field">Platform<select id="mf-platform">' + PLATFORMS.map(function(p){ return '<option' + (p === 'YouTube' ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label>' +
          '<label class="field">Followers<input id="mf-fol" type="number" min="0" step="any"></label>' +
          '<label class="field">Fee (₹)<input id="mf-fee" type="number" min="0" step="any"></label>' +
          '<label class="field">Avg views<input id="mf-views" type="number" min="0" step="any"></label>' +
          '<label class="field">Avg likes<input id="mf-likes" type="number" min="0" step="any"></label>' +
          '<label class="field">Avg comments<input id="mf-comments" type="number" min="0" step="any"></label>' +
          '<button class="btn primary" id="mf-btn" type="submit">Add to shortlist</button></fieldset></form></div>' +
      '<div class="panel"><div class="stack"><h3>Paste creators from Excel or Google Sheets</h3><p class="small muted">Copy rows straight from your team sheet, from the Category column to 1 Month Ad Rights, plus Fee as the 22nd column if you have it. A header row is skipped.</p></div>' +
        '<textarea class="paste" id="paste-creators"' + dis + ' placeholder="Beauty	Hindi	itss.vanshikaaa	https://www.instagram.com/itss.vanshikaaa/	452	…"></textarea>' +
        '<div class="btns"><button class="btn primary" id="paste-creators-btn"' + dis + '>Add these creators</button><span class="small muted" id="paste-creators-msg" role="status"></span></div></div>' +
    '</div>';
  $('up-file').onchange = function(){ var f = this.files && this.files[0]; if (f) handleUpload(f); };
  var d = $('drop');
  ['dragenter', 'dragover'].forEach(function(ev){ d.addEventListener(ev, function(e){ e.preventDefault(); d.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function(ev){ d.addEventListener(ev, function(e){ e.preventDefault(); d.classList.remove('over'); }); });
  d.addEventListener('drop', function(e){ if (dis) return; var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleUpload(f); });
  $('manual-form').onsubmit = function(e){
    e.preventDefault(); var btn = $('mf-btn');
    var c = {name: $('mf-name').value.trim(), category: $('mf-category').value, language: $('mf-language').value, platform: $('mf-platform').value, followers: $('mf-fol').value, fee: $('mf-fee').value, views: $('mf-views').value, likes: $('mf-likes').value, comments: $('mf-comments').value};
    if (!c.name) { toast('Type the creator’s name or handle.', true); $('mf-name').focus(); return; }
    if (!num(c.followers) && !num(c.views)) { toast('Add followers or average views so the creator can be compared.', true); $('mf-fol').focus(); return; }
    busy(btn, true, 'Saving…');
    api('creators.add', {companyId: ST.coId, creator: c, manual: true}).then(function(r){ upsertCreators(r.creators); if (r.creators[0]) CUR = r.creators[0].id; $('manual-form').reset(); $('mf-platform').value = 'YouTube'; refreshView(); toast('Added ' + c.name + ' to the shortlist'); })
      .catch(function(err){ toast(err.message, true); }).then(function(){ busy(btn, false); });
  };
  $('paste-creators-btn').onclick = function(){ var b = this;
    var rows = pasteRows($('paste-creators').value).filter(function(c){ return !/^(category|name|creator)$/i.test(String(c[0] || '').trim()) && !/^name$/i.test(String(c[2] || '').trim()); }).map(function(cells){
      var o = {}; TEAM_KEYS.forEach(function(k, i){ o[k] = cells[i] != null ? String(cells[i]).trim() : ''; });
      var ln = String(o.link || ''); o.platform = /instagram\.com/i.test(ln) ? 'Instagram' : (!o.link && o.ytLink ? 'YouTube' : ''); return o; }).filter(function(r){ return r.name || /instagram\.com/i.test(r.link); });
    if (!rows.length) { $('paste-creators-msg').textContent = 'No rows found. Copy the rows from your sheet, starting at the Category column.'; return; }
    busy(b, true, 'Adding…');
    addCreatorRows(rows).then(function(n){ $('paste-creators').value = ''; $('paste-creators-msg').textContent = 'Added ' + plural(n, 'creator') + '. Use Refresh from Instagram on the Creators tab to fetch live numbers.'; refreshView(); })
      .catch(function(e){ toast(e.message, true); }).then(function(){ busy(b, false); });
  };
}
function toApiRow(o){
  var r = {};
  ['name', 'category', 'language', 'link', 'ytLink', 'followers', 'views', 'reach', 'comments', 'likes', 'posts', 'sentiment', 'deliverables', 'collab', 'adRights', 'fee', 'platform'].forEach(function(k){
    var v = o[k]; if (v == null || String(v).trim() === '') return; r[TO_API[k] || k] = typeof v === 'string' ? v.trim() : v; });
  if (!num(o.likes) && num(o.engagement)) r.likes = Math.max(0, num(o.engagement) - (num(o.comments) || 0)) || undefined;
  if (r.platform && PLATFORMS.indexOf(r.platform) < 0) r.platform = matchPlatform(r.platform, 'Other');
  return r;
}
function addCreatorRows(rows){
  var out = 0, chunks = [];
  for (var i = 0; i < rows.length; i += 400) chunks.push(rows.slice(i, i + 400));
  return chunks.reduce(function(p, ch){ return p.then(function(){ return api('creators.add', {companyId: ST.coId, rows: ch.map(toApiRow)}).then(function(r){ upsertCreators(r.creators); out += r.added || 0; }); }); }, Promise.resolve()).then(function(){ return out; });
}
function matchPlatform(v, def){ v = String(v || '').trim().toLowerCase(); if (!v) return def;
  var exact = PLATFORMS.find(function(p){ return p.toLowerCase() === v; }); if (exact) return exact;
  if (v.indexOf('story') >= 0) return 'Instagram Story'; if (v.indexOf('short') >= 0) return 'YouTube Shorts';
  if (v.indexOf('insta') >= 0 || v === 'ig' || v.indexOf('reel') >= 0) return 'Instagram'; if (v.indexOf('you') >= 0 || v === 'yt') return 'YouTube';
  if (v.indexOf('moj') >= 0 || v.indexOf('josh') >= 0) return 'Moj / Josh'; return 'Other'; }
function pasteRows(txt){ return String(txt || '').split(/\r?\n/).filter(function(l){ return l.trim(); }).map(function(l){ return l.indexOf('\t') >= 0 ? l.split('\t') : l.split(','); }); }
function isHeader(cells){ return /^(creator|name|handle|instagram)/i.test(String(cells[0] || '').trim()); }

var HEAD_ALIAS = {
  category: ['category', 'niche', 'genre', 'vertical'], language: ['language', 'languages', 'lang'],
  name: ['name', 'creator', 'creatorname', 'creators', 'influencer', 'influencername', 'influencers', 'fullname', 'displayname', 'account'],
  handle: ['handle', 'handles', 'instagramhandle', 'ighandle', 'username', 'usernames', 'instagram', 'instagramid', 'igid', 'instahandle', 'instagramusername', 'iguser', 'igusername', 'insta', 'instaid'],
  link: ['link', 'profilelink', 'instagramlink', 'iglink', 'url', 'profileurl', 'instagramurl', 'instaprofile', 'instagramprofile', 'instalink', 'profile'],
  followers: ['followers', 'followercount', 'igfollowers', 'instagramfollowers', 'followerscount'], ytLink: ['ytlink', 'youtube', 'youtubelink', 'ytchannel', 'youtubechannel', 'yt'],
  views: ['averageviews', 'avgviews', 'views', 'avgreelviews', 'averagereelviews'],
  reach: ['averagereach', 'avgreach', 'reach'], comments: ['averagecomments', 'avgcomments', 'comments'],
  sentiment: ['sentimentscomments', 'sentimentcomments', 'sentiments', 'sentiment'], engagement: ['engagement', 'avgengagement', 'averageengagement'],
  deliverables: ['deliverables', 'deliverable'], adRights: ['1monthadrights', 'adrights', 'monthadrights', 'onemonthadrights'],
  fee: ['fee', 'fees', 'cost', 'price', 'commercials', 'commercial', 'quote', 'rate', 'fees₹'], platform: ['platform'], likes: ['averagelikes', 'avglikes', 'likes']
};
function hnorm(h){ return String(h || '').toLowerCase().replace(/[^a-z0-9₹]/g, ''); }
function headKey(h){ var n = hnorm(h); if (!n) return null; if (n.indexOf('collabreel') === 0 || n === 'collab' || n === 'collabprice') return 'collab';
  if (['er', 'erpercent', 'engagementrate', 'cpv', 'cpe'].indexOf(n) >= 0) return 'skip';
  for (var k in HEAD_ALIAS) { if (HEAD_ALIAS[k].indexOf(n) >= 0 || HEAD_ALIAS[k].indexOf(n.replace(/₹/g, '')) >= 0) return k; } return null; }
function looksHandle(v){ return /^@?[a-z0-9._]{2,30}$/i.test(String(v || '').trim()); }
function csvParse(text){ var rows = [], row = [], cur = '', q = false, sep = text.indexOf('\t') >= 0 && text.split('\n')[0].indexOf('\t') >= 0 ? '\t' : ',';
  for (var i = 0; i < text.length; i++) { var ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); } return rows; }
var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
function readUpload(file){
  var isCsv = /\.(csv|tsv|txt)$/i.test(file.name);
  return (isCsv ? Promise.resolve() : loadScript(XLSX_URL, function(){ return !!window.XLSX; })).then(function(){
    return new Promise(function(res, rej){
      var fr = new FileReader();
      fr.onerror = function(){ rej(new Error('Could not read that file.')); };
      fr.onload = function(){ try {
        if (isCsv) { res(csvParse(String(fr.result))); return; }
        var wb = XLSX.read(new Uint8Array(fr.result), {type: 'array'}); var ws = wb.Sheets[wb.SheetNames[0]];
        res(XLSX.utils.sheet_to_json(ws, {header: 1, raw: false, defval: ''}));
      } catch (e) { rej(new Error('Could not read that file. Check it is an Excel or CSV file.')); } };
      if (isCsv) fr.readAsText(file); else fr.readAsArrayBuffer(file);
    });
  });
}
function rowsToCreators(rows){
  rows = (rows || []).map(function(r){ return (r || []).map(function(v){ return String(v == null ? '' : v).trim(); }); }).filter(function(r){ return r.some(function(v){ return v; }); });
  if (!rows.length) return {list: [], mapped: []};
  var best = -1, bestScore = 0, bestMap = null;
  for (var i = 0; i < Math.min(rows.length, 6); i++) { var map = {}, score = 0; rows[i].forEach(function(h, j){ var k = headKey(h); if (k && k !== 'skip' && map[k] == null) { map[k] = j; score += (k === 'name' || k === 'link') ? 2 : 1; } else if (k === 'skip') score += 0.5; });
    if (score > bestScore) { bestScore = score; best = i; bestMap = map; } }
  var mp, bd, headerless = false;
  if (best >= 0 && bestScore >= 2) { mp = bestMap; bd = rows.slice(best + 1); } else { mp = {name: 0}; bd = rows; headerless = true; }
  if (mp.name == null && mp.link == null && mp.handle == null) mp.name = 0;
  var list = bd.map(function(r){ var o = {}; Object.keys(mp).forEach(function(k){ o[k] = r[mp[k]] || ''; });
    var nm = o.name || '', hd = o.handle || ''; delete o.handle;
    if (/instagram\.com\//i.test(nm) && !o.link) o.link = nm;
    if (/instagram\.com\//i.test(hd) && !o.link) o.link = hd;
    // Where the handle comes from, most reliable first: profile link, handle column, then the name if it clearly is one.
    var h = '';
    if (/instagram\.com\//i.test(o.link || '')) h = cleanHandle(o.link);
    else if (hd && looksHandle(hd.replace(/\s+/g, ''))) h = cleanHandle(hd.replace(/\s+/g, ''));
    else if (looksHandle(nm) && (headerless || /[@._0-9]/.test(nm))) h = cleanHandle(nm);
    if (/instagram\.com\//i.test(nm)) nm = h;
    o.ig = h; o.name = h || nm; if (h) { o.platform = o.platform || 'Instagram'; o.link = o.link || ('https://www.instagram.com/' + h + '/'); }
    o.display = (nm && nm !== h) ? nm : '';
    return o; }).filter(function(o){ return o.name; });
  var seen = {}; list = list.filter(function(o){ var k = o.name.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; });
  return {list: list, mapped: Object.keys(mp)};
}
var UP = null;
function handleUpload(f){ readUpload(f).then(function(rows){ var p = rowsToCreators(rows); if (!p.list.length) { toast('No creators found in that file.', true); return; } showUploadPreview(f, p); }).catch(function(e){ toast(e.message, true); }); }
function showUploadPreview(file, parsed){
  var ig = parsed.list.filter(function(o){ return o.ig; }), other = parsed.list.length - ig.length;
  UP = parsed; var box = $('up-preview'); box.hidden = false; $('up-result').hidden = true;
  var labels = parsed.mapped.map(function(k){ var c = TEAM_COLS.find(function(t){ return t[0] === k; }); return c ? c[1] : (k === 'platform' ? 'Platform' : k === 'likes' ? 'Average Likes' : k === 'handle' ? 'Handle' : k === 'engagement' ? 'Engagement' : k); });
  var hourly = (W.capacity || []).filter(function(x){ return x.status === 'active'; }).reduce(function(a, x){ return a + (+x.hourly_limit || 0) - (+x.used_this_hour || 0); }, 0);
  box.innerHTML = '<div class="panel flat tight"><div class="ledger">' + stat('File', '<span style="font-size:15px;overflow-wrap:anywhere">' + esc(file.name) + '</span>', '') + stat('Creators found', parsed.list.length, '') + stat('With Instagram handle', ig.length, 'will be looked up') + stat('Display name only', other, 'added as they are') + '</div>' +
    '<p class="small muted">Columns recognised: ' + esc(labels.join(', ') || 'none, so the first column is read as creator names') + '.</p>' +
    (ig.length > hourly ? '<p class="small"><span class="chip warn">Large file</span> You have about ' + hourly + ' lookups left this hour. If it stops partway, upload the same file again later; creators already filled are skipped.</p>' : '') +
    '<div class="tbl"><table><thead><tr><th>Creator</th><th>Instagram</th><th>What happens</th></tr></thead><tbody>' +
    parsed.list.slice(0, 8).map(function(o){ return '<tr><td>' + esc(o.display || o.name) + '</td><td>' + (o.ig ? '@' + esc(o.ig) : '<span class="muted">—</span>') + '</td><td>' + (o.ig ? '<span class="chip good">Fetch and fill blanks</span>' : '<span class="chip warn">Added, needs a handle</span>') + '</td></tr>'; }).join('') +
    (parsed.list.length > 8 ? '<tr><td colspan="3" class="muted">and ' + (parsed.list.length - 8) + ' more</td></tr>' : '') +
    '</tbody></table></div>' +
    '<div class="btns"><button class="btn primary" id="up-go">Add ' + plural(parsed.list.length, 'creator') + ' and fetch data</button><button class="btn" id="up-cancel">Cancel</button></div></div>';
  $('up-go').onclick = runUpload; $('up-cancel').onclick = function(){ UP = null; box.hidden = true; $('up-file').value = ''; };
}
function runUpload(){
  if (!UP) return; var list = UP.list; var btn = $('up-go'); busy(btn, true, 'Adding…'); $('up-cancel').disabled = true;
  var have = {}; W.creators.filter(mine).forEach(function(c){ have[c.handle.toLowerCase()] = c; });
  var todo = list.filter(function(o){ if (!o.ig) return false; var c = have[o.ig]; return !c || !c.followers || !c.avgViews || !c.competitors || !c.category || !c.language || !c.reach; }).map(function(o){ return o.ig; });
  var skipped = list.filter(function(o){ return o.ig; }).length - todo.length;
  addCreatorRows(list.map(function(o){ var c = {}; Object.keys(o).forEach(function(k){ if (k !== 'ig' && k !== 'display') c[k] = o[k]; }); return c; })).then(function(){
    $('up-preview').hidden = true; var pr = $('up-progress'); pr.hidden = false;
    var done = 0, results = [], size = 10;
    var step = function(){
      $('up-prog-l').textContent = todo.length ? 'Fetching from Instagram… ' + done + ' of ' + todo.length : 'Nothing new to fetch';
      $('up-prog-r').textContent = todo.length ? Math.round(done / todo.length * 100) + '%' : ''; $('up-fill').style.width = (todo.length ? done / todo.length * 100 : 100) + '%';
      if (done >= todo.length) return finish();
      var chunk = todo.slice(done, done + size);
      api('creators.lookup', {companyId: ST.coId, handles: chunk}).then(function(r){ upsertCreators(r.creators); results = results.concat(r.results || []); done += chunk.length;
        if ((r.results || []).some(function(x){ return !x.ok && /hourly limit|No Instagram account|expired|Reconnect/i.test(x.message); })) { results = results.concat(todo.slice(done).map(function(n){ return {handle: n, ok: false, message: 'Not tried: lookups are paused. Upload again later.'}; })); done = todo.length; }
        step(); })
      .catch(function(e){ results = results.concat(chunk.map(function(n){ return {handle: n, ok: false, message: e.message}; })); done += chunk.length; if (/INACTIVE|limit/i.test(e.code + e.message)) done = todo.length; step(); });
    };
    var finish = function(){
      pr.hidden = true; refreshCapacity();
      var okN = results.filter(function(x){ return x.ok; }).length, bad = results.filter(function(x){ return !x.ok; });
      var noHandle = list.filter(function(o){ return !o.ig; });
      var box = $('up-result'); box.hidden = false;
      box.innerHTML = '<div class="panel flat tight"><div class="ledger">' + stat('Filled from Instagram', okN, '') + (skipped ? stat('Already complete', skipped, '') : '') + stat('Could not fetch', bad.length, '') + stat('Need a handle', noHandle.length, '') + '</div>' +
        (bad.length ? '<p class="small"><strong>Could not fetch:</strong> ' + bad.slice(0, 12).map(function(x){ return esc(x.handle) + ' (' + esc(x.message) + ')'; }).join('; ') + (bad.length > 12 ? '…' : '') + '</p>' : '') +
        (noHandle.length ? '<p class="small"><strong>Add their Instagram handle:</strong> ' + noHandle.slice(0, 15).map(function(o){ return esc(o.display || o.name); }).join(', ') + (noHandle.length > 15 ? '…' : '') + '</p>' : '') +
        '<div class="btns"><button class="btn primary" id="up-see">See the shortlist</button></div></div>';
      $('up-see').onclick = function(){ shortTab = 'creators'; history.replaceState(null, '', '#/shortlist/creators'); renderShortlist(); };
      $('up-file').value = ''; UP = null; toast('Upload finished: ' + okN + ' filled from Instagram');
      var a = document.querySelector('.side a.nl[href="#/shortlist"] .cnt'); if (a) a.textContent = W.creators.length;
    };
    step();
  }).catch(function(e){ toast(e.message, true); busy(btn, false); $('up-cancel').disabled = false; });
}

/* ---------- competitor brands ---------- */
function renderCompetitors(el){
  el.innerHTML = '<div class="panel"><div class="stack"><h3>Competitor brands</h3><p class="small muted">Each creator’s last 25 captions are checked for these brands (names, @handles and hashtags), and for posts marked as ads or collabs. Separate brands with commas. After changing the list, use Refresh from Instagram to check your creators again. This list is yours; teammates keep their own.</p></div>' +
    '<textarea class="paste" id="comp-list" rows="4" placeholder="Your competitor brands, separated by commas. For example: Nivea, Mamaearth, Plum">' + esc(W.settings.competitors || '') + '</textarea>' +
    '<div class="btns"><button class="btn primary" id="comp-save"' + (canWork() ? '' : ' disabled') + '>Save competitor list</button><span class="small muted" id="comp-msg" role="status"></span></div></div>';
  $('comp-save').onclick = function(){ var b = this; busy(b, true, 'Saving…');
    var s = Object.assign({}, W.settings, {competitors: $('comp-list').value});
    saveSettings(s).then(function(){ $('comp-msg').textContent = 'Saved. Refresh your creators to check them against the new list.'; }).catch(function(e){ toast(e.message, true); }).then(function(){ busy(b, false); }); };
}
function saveSettings(s){
  return api('settings.save', {companyId: ST.coId, settings: {name: s.name || '', budget: s.budget || null, start: s.start || '', end: s.end || '', competitors: s.competitors || ''}})
    .then(function(r){ W.settings = normSettings(r.settings); return W.settings; });
}

/* ================= campaign ================= */
var settingsDirty = false;
function renderCampaign(){
  settingsDirty = false;
  var s = W.settings || {}, dis = W.scope === 'mine' && canWork() ? '' : ' disabled';
  body(pageHead('Campaign', 'Track every post you paid for. Instagram post links fetch views, likes and comments by themselves; for other platforms, type the numbers from the creator’s insights.', scopeToggle()) + teamNote() +
    '<div class="panel"><div class="spread"><h3>Campaign details</h3><button class="btn sm" id="save-settings"' + (canWork() ? '' : ' disabled') + '>Save details</button></div>' +
      '<div class="form cols-4"><label class="field">Campaign name<input id="cs-name" type="text" value="' + esc(s.name || '') + '" placeholder="Diwali launch"></label>' +
      '<label class="field">Total budget (₹)<input id="cs-budget" type="number" min="0" step="any" value="' + (s.budget || '') + '"></label>' +
      '<label class="field">Start date<input id="cs-start" type="date" value="' + esc(s.start || '') + '"></label>' +
      '<label class="field">End date<input id="cs-end" type="date" value="' + esc(s.end || '') + '"></label></div></div>' +
    '<div class="ledger" id="kpis"></div>' +
    '<div class="stack" style="gap:8px"><div class="spread small"><span id="budget-l"></span><span class="muted" id="budget-r"></span></div>' +
      '<div class="track"><div class="fill" id="budget-fill"></div><div class="tick" id="time-tick"></div></div>' +
      '<span class="tiny muted">The dark marker shows how far through the campaign dates you are.</span></div>' +
    '<div class="panel"><div class="stack"><h3>Add a campaign post</h3><p class="small muted">For an Instagram post or Reel, paste the link and the numbers are fetched for you. For YouTube, Moj or Stories, type views, likes and comments from the creator’s insights.</p></div>' +
      '<form class="form cols-4" id="post-form" novalidate><fieldset style="display:contents"' + dis + '>' +
        '<label class="field">Creator handle or name<input id="pf-handle" type="text" list="handles" autocomplete="off" spellcheck="false" placeholder="itss.vanshikaaa"></label>' +
        '<label class="field">Platform<select id="pf-platform">' + PLATFORMS.map(function(p){ return '<option' + (p === 'Instagram' ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label>' +
        '<label class="field" style="grid-column:span 2">Post link<input id="pf-link" type="url" spellcheck="false" placeholder="https://www.instagram.com/reel/…"></label>' +
        '<label class="field">Fee paid (₹)<input id="pf-fee" type="number" min="0" step="any"></label>' +
        '<label class="field">Views<input id="pf-views" type="number" min="0" step="any" placeholder="Auto from Instagram"></label>' +
        '<label class="field">Likes<input id="pf-likes" type="number" min="0" step="any" placeholder="Auto from Instagram"></label>' +
        '<label class="field">Comments<input id="pf-comments" type="number" min="0" step="any" placeholder="Auto from Instagram"></label>' +
        '<button class="btn primary" id="pf-btn" type="submit">Add post</button></fieldset></form></div>' +
    '<div class="sec-head"><div class="stack"><h2>Campaign posts</h2><p class="small muted">Change any number in the table and it saves by itself. Rebook, Watch and Review compare each post’s CPV and engagement with the campaign median.</p></div>' +
      '<div class="btns"><button class="btn sm" id="csv-posts">Copy as CSV</button>' + (W.scope === 'mine' && canWork() ? '<button class="btn sm" id="refresh-posts">' + icon('refresh', 16) + 'Refresh from Instagram</button>' : '') + '</div></div>' +
    '<div class="tbl"><table class="t-posts" id="post-table"></table></div>' +
    '<details class="panel"><summary style="cursor:pointer;font-family:var(--f-display);font-weight:600;font-size:17px">Paste campaign posts from Excel or Google Sheets</summary>' +
      '<p class="small muted">Copy cells in this order: Creator, Platform, Post link, Fee, Views, Likes, Comments. A header row is skipped. Instagram links are fetched one by one.</p>' +
      '<textarea class="paste" id="paste-posts"' + dis + ' placeholder="itss.vanshikaaa	Instagram	https://www.instagram.com/reel/ABC123/	15000	22000	1800	90"></textarea>' +
      '<div class="btns"><button class="btn primary" id="paste-posts-btn"' + dis + '>Add these posts</button><span class="small muted" id="paste-posts-msg" role="status"></span></div></details>');
  bindScope();
  ['cs-name', 'cs-budget', 'cs-start', 'cs-end'].forEach(function(id){ $(id).addEventListener('input', function(){ settingsDirty = true; W.settings = Object.assign({}, W.settings, readSettings()); var P = postRows(); renderKPIs(P); renderBudget(P); }); });
  $('save-settings').onclick = function(){ var b = this; busy(b, true, 'Saving…');
    saveSettings(Object.assign({}, W.settings, readSettings())).then(function(){ settingsDirty = false; toast('Campaign details saved'); }).catch(function(e){ toast(e.message, true); }).then(function(){ busy(b, false); }); };
  $('pf-handle').addEventListener('change', function(){ var h = cleanHandle(this.value); var c = W.creators.find(function(x){ return x.handle === h && mine(x); }); if (c && c.fee && !$('pf-fee').value) $('pf-fee').value = c.fee; });
  $('post-form').onsubmit = function(e){
    e.preventDefault(); var btn = $('pf-btn');
    var p = {handle: $('pf-handle').value.trim(), link: $('pf-link').value.trim(), fee: $('pf-fee').value, platform: $('pf-platform').value, views: $('pf-views').value, likes: $('pf-likes').value, comments: $('pf-comments').value};
    var igLink = !!shortcode(p.link) && p.platform.indexOf('Instagram') === 0 && p.platform !== 'Instagram Story';
    if (!p.handle) { toast('Add the creator’s handle or name.', true); $('pf-handle').focus(); return; }
    if (!igLink && !num(p.views)) { toast(p.platform.indexOf('Instagram') === 0 && p.platform !== 'Instagram Story' ? 'Paste the Instagram post link, or type the views yourself.' : 'Type the views from the creator’s insights.', true); $('pf-views').focus(); return; }
    busy(btn, true, igLink ? 'Fetching numbers…' : 'Adding…');
    addPost(p).then(function(r){ $('post-form').reset(); $('pf-platform').value = 'Instagram'; refreshView(); if (igLink) refreshCapacity();
      toast(/^Entered manually$/i.test(r.status || '') ? 'Post added' : r.status, /^✗|not found/i.test(r.status)); })
      .catch(function(err){ toast(err.message, true); }).then(function(){ busy(btn, false); });
  };
  $('csv-posts').onclick = function(){ copyText(postsCSV(), this, 'Campaign posts'); };
  var rp = $('refresh-posts'); if (rp) rp.onclick = function(){ var b = this; busy(b, true, 'Refreshing…');
    api('posts.refresh', {companyId: ST.coId}).then(function(r){ return loadWork().then(function(){ refreshView(); refreshCapacity(); toast(r.errors && r.errors.length ? r.errors.length + ' creators could not be refreshed: ' + r.errors.slice(0, 2).join('; ') : 'Post numbers refreshed', !!(r.errors && r.errors.length)); }); })
      .catch(function(e){ toast(e.message, true); }).then(function(){ busy(b, false); }); };
  $('paste-posts-btn').onclick = function(){ var b = this;
    var rows = pasteRows($('paste-posts').value).filter(function(c){ return !isHeader(c); }).map(function(c){
      return {handle: String(c[0] || '').trim(), platform: matchPlatform(c[1], shortcode(c[2]) ? 'Instagram' : 'Other'), link: String(c[2] || '').trim(), fee: c[3], views: c[4], likes: c[5], comments: c[6]}; }).filter(function(r){ return r.handle; });
    if (!rows.length) { $('paste-posts-msg').textContent = 'No rows found. Paste cells copied from your sheet.'; return; }
    if (rows.length > 100) { $('paste-posts-msg').textContent = 'Paste up to 100 posts at a time.'; return; }
    busy(b, true, 'Adding…'); var done = 0, fails = [];
    rows.reduce(function(pr, row){ return pr.then(function(){ b.innerHTML = '<span class="spin"></span> ' + (done + 1) + ' of ' + rows.length + '…';
      return addPost(row).then(function(){ done++; }, function(e){ done++; fails.push(row.handle + ': ' + e.message); }); }); }, Promise.resolve())
      .then(function(){ $('paste-posts').value = ''; $('paste-posts-msg').textContent = 'Added ' + plural(rows.length - fails.length, 'post') + '.' + (fails.length ? ' Not added: ' + fails.slice(0, 4).join('; ') : ''); refreshView(); refreshCapacity(); })
      .then(function(){ busy(b, false); });
  };
  var P = postRows(); renderKPIs(P); renderBudget(P); renderPosts(P);
}
function addPost(p){
  return api('posts.add', {companyId: ST.coId, post: {handle: p.handle, link: p.link, platform: p.platform, fee: num(p.fee), views: num(p.views), likes: num(p.likes), comments: num(p.comments)}})
    .then(function(r){ if (W.scope === 'team') r.post.owner_email = ST.user.email; upsertPost(r.post); return r; });
}
function readSettings(){ return {name: $('cs-name').value.trim(), budget: num($('cs-budget').value), start: $('cs-start').value, end: $('cs-end').value}; }
function renderKPIs(P){
  var t = P.t, budget = (W.settings || {}).budget, n = W.posts.length;
  var tiles = [
    ['Spend', rShort(t.fee), budget ? pct(t.fee / budget * 100, 0) + ' of ' + rShort(budget) + ' budget' : 'Set a budget above'],
    ['Views', short(t.views), plural(n, 'post')],
    ['Blended CPV', t.views ? rs(t.fee / t.views, 2) : '—', t.views ? 'CPM ' + rs(t.fee / t.views * 1000, 0) : 'Needs views'],
    ['Engagement rate', t.views ? pct(t.eng / t.views * 100, 2) : '—', 'Engagement ÷ views'],
    ['Engagement', short(t.eng), 'Likes + comments on all posts'],
    ['CPE', t.eng ? rs(t.fee / t.eng, 2) : '—', 'Spend ÷ engagement']
  ];
  $('kpis').innerHTML = tiles.map(function(x){ return stat(x[0], x[1], x[2]); }).join('');
}
function renderBudget(P){
  var budget = (W.settings || {}).budget, spent = P.t.fee, p = budget ? spent / budget * 100 : 0;
  $('budget-fill').style.width = Math.min(100, p) + '%'; $('budget-fill').classList.toggle('over', p > 100);
  $('budget-l').innerHTML = budget ? '<strong>' + rs(spent) + '</strong> spent of ' + rs(budget) + ', ' + (p > 100 ? '<span style="color:var(--bad)">' + rs(spent - budget) + ' over budget</span>' : rs(budget - spent) + ' left') : 'Set a total budget to track spend';
  var di = dayInfo();
  if (di) { $('time-tick').hidden = false; $('time-tick').style.left = 'calc(' + (di.frac * 100) + '% - 1px)';
    $('budget-r').textContent = di.day < 1 ? 'Starts in ' + plural(1 - di.day, 'day') : di.day > di.total ? 'Ended, ran ' + di.total + ' days' : 'Day ' + di.day + ' of ' + di.total; }
  else { $('time-tick').hidden = true; $('budget-r').textContent = 'Add start and end dates'; }
}
var EDIT = ['fee', 'views', 'likes', 'comments'];
function renderPosts(P){
  var team = W.scope === 'team';
  var head = '<thead><tr><th>Creator and post</th>' + (team ? '<th>Added by</th>' : '') + '<th class="n">Fee</th><th class="n">Views</th><th class="n">Likes</th><th class="n">Comments</th><th class="n">ER (views)</th><th class="n">CPV</th><th class="n">CPE</th><th class="n">CPM</th><th>Verdict</th><th><span class="sr">Remove</span></th></tr></thead>';
  var list = P.list.slice().sort(function(a, b){ return String(a.p.posted || a.p.created || '').localeCompare(String(b.p.posted || b.p.created || '')); });
  var bd = list.length ? list.map(function(x){ var p = x.p, own = mine(p);
    var lk = /^https?:/.test(p.link || '') ? '<a class="lnk" href="' + esc(p.link) + '" target="_blank" rel="noopener">' + esc(/^M[0-9A-F]{8}$/.test(p.code) ? 'link' : p.code) + '</a>' : 'manual entry';
    return '<tr><td><div class="cname">' + esc(pdn(p)) + '</div><div class="csub">' + esc(p.platform || 'Instagram') + ', ' + lk + (p.posted ? ', ' + esc(new Date(p.posted).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})) : '') + '</div><div class="status-note">' + esc(p.status || '') + '</div></td>' +
      (team ? '<td class="small muted">' + esc(p.owner_email || '') + '</td>' : '') +
      EDIT.map(function(k){ return '<td class="n">' + (own ? '<input class="cell-in' + (k === 'fee' ? ' fee' : '') + '" type="number" min="0" step="any" data-post="' + esc(p.id) + '" data-k="' + k + '" value="' + (p[k] || '') + '" placeholder="—" aria-label="' + k + ' for ' + esc(p.handle) + '">' : (k === 'fee' ? rs(p[k]) : n0(p[k]))) + '</td>'; }).join('') +
      '<td class="n">' + pct(x.erV, 2) + '</td><td class="n"><strong>' + rs(x.cpv, 2) + '</strong></td><td class="n">' + rs(x.cpe, 2) + '</td><td class="n">' + rs(x.cpm, 0) + '</td>' +
      '<td><span class="chip ' + x.v.cls + '">' + esc(x.v.label) + '</span><div class="why">' + esc(x.v.why) + '</div></td>' +
      '<td>' + (own ? '<button class="x" data-rmp="' + esc(p.id) + '" aria-label="Remove post">×</button>' : '') + '</td></tr>';
  }).join('') : '<tr><td colspan="' + (team ? 12 : 11) + '" class="muted" style="white-space:normal;padding:22px">No campaign posts yet. Add the first one with the form above.</td></tr>';
  var t = $('post-table'); t.innerHTML = head + '<tbody>' + bd + '</tbody>';
  qsa('input[data-post]', t).forEach(function(i){ i.onchange = function(){ var f = {}; f[i.dataset.k] = i.value;
    api('posts.update', {companyId: ST.coId, id: i.dataset.post, fields: f}).then(function(r){ upsertPost(r.post); var y = window.scrollY; var P2 = postRows(); renderKPIs(P2); renderBudget(P2); renderPosts(P2); window.scrollTo(0, y); toast('Saved'); }).catch(function(e){ toast(e.message, true); }); }; });
  qsa('[data-rmp]', t).forEach(function(b){ b.onclick = function(){ armOnce(b, 'Remove?', function(){ var id = b.dataset.rmp;
    api('posts.remove', {companyId: ST.coId, id: id}).then(function(){ W.posts = W.posts.filter(function(x){ return x.id !== id; }); refreshView(); toast('Post removed'); }).catch(function(e){ toast(e.message, true); }); }); }; });
}

/* ================= manager report ================= */
function summaryText(){
  var P = postRows(), R = creatorRows(), t = P.t, s = W.settings || {}, di = dayInfo(), L = [];
  L.push((s.name || 'Campaign') + ' update' + (di && di.day >= 1 && di.day <= di.total ? ' (day ' + di.day + ' of ' + di.total + ')' : ''));
  if (W.posts.length) {
    L.push('');
    L.push('Spend: ' + rs(t.fee) + (s.budget ? ' of ' + rs(s.budget) + ' (' + pct(t.fee / s.budget * 100, 0) + ')' : ''));
    L.push('Views: ' + n0(t.views) + ' across ' + plural(W.posts.length, 'post'));
    L.push('Blended CPV: ' + (t.views ? rs(t.fee / t.views, 2) : '—') + ' | CPM: ' + (t.views ? rs(t.fee / t.views * 1000, 0) : '—'));
    L.push('Engagement rate: ' + (t.views ? pct(t.eng / t.views * 100, 2) : '—') + ' by views | CPE: ' + (t.eng ? rs(t.fee / t.eng, 2) : '—'));
    var best = P.list.filter(function(x){ return ok(x.cpv); }).sort(function(a, b){ return a.cpv - b.cpv; })[0];
    if (best) L.push('Best value post: ' + pdn(best.p) + ' at ' + rs(best.cpv, 2) + ' per view');
    var reb = P.list.filter(function(x){ return x.v.label === 'Rebook'; }).map(function(x){ return pdn(x.p); });
    var rev = P.list.filter(function(x){ return x.v.label === 'Review'; }).map(function(x){ return pdn(x.p); });
    if (reb.length) L.push('Rebook: ' + reb.join(', '));
    if (rev.length) L.push('Needs review: ' + rev.join(', '));
  } else { L.push(''); L.push('No campaign posts tracked yet.'); }
  var good = R.list.filter(function(x){ return x.v.label === 'Good value'; });
  var neg = R.list.filter(function(x){ return x.v.label === 'Negotiate'; });
  var avoid = R.list.filter(function(x){ return x.v.label === 'Avoid or renegotiate'; });
  if (R.list.length) {
    var withFee = R.list.filter(function(x){ return x.price; });
    if (withFee.length) { L.push(''); L.push('Shortlist averages (' + withFee.length + ' creators with fee or est. price):');
      L.push('Avg CPV ' + rs(avgOf(withFee, 'cpv'), 2) + ' | Avg CPE ' + rs(avgOf(withFee, 'cpe'), 2) + ' | Avg CPM ' + rs(avgOf(withFee, 'cpm'), 0) + ' | Avg CPR ' + rs(avgOf(withFee, 'cpr'), 2) + ' (est.)');
      L.push('Avg ER ' + pct(avgOf(withFee, 'er'), 2) + ' | Total price ' + rs(withFee.reduce(function(a, x){ return a + (x.price || 0); }, 0))); }
    L.push(''); L.push('Shortlist for next booking (' + R.list.length + ' creators checked):');
    good.forEach(function(x){ L.push('• ' + dn(x.c) + ' (' + (x.c.platform || 'Instagram') + '): good value, ER ' + pct(x.er, 2) + ', est. CPV ' + rs(x.cpv, 2)); });
    neg.forEach(function(x){ L.push('• ' + dn(x.c) + ' (' + (x.c.platform || 'Instagram') + '): negotiate (' + x.v.why.replace(/\.$/, '') + ')'); });
    avoid.forEach(function(x){ L.push('• ' + dn(x.c) + ' (' + (x.c.platform || 'Instagram') + '): avoid or renegotiate (' + x.v.why.replace(/\.$/, '') + ')'); });
    if (!good.length && !neg.length && !avoid.length) L.push('• Add fees to compare prices.');
    var qs = R.list.map(function(x){ return {x: x, q: qualityInfo(x.c)}; }).filter(function(o){ return o.q && o.q.score != null; });
    if (qs.length) { var cnt = function(l){ return qs.filter(function(o){ return o.q.label === l; }).length; };
      L.push(''); L.push('Audience quality (est.): ' + cnt('Genuine') + ' genuine, ' + cnt('Check') + ' to check, ' + cnt('Suspicious') + ' suspicious');
      qs.filter(function(o){ return o.q.label !== 'Genuine'; }).forEach(function(o){ L.push('• ' + dn(o.x.c) + ': ' + o.q.label.toLowerCase() + ' (' + o.q.score + '/100). ' + String(o.x.c.qualityWhy || '').replace(/\. Based on.*$/, '')); }); }
    var comp = R.list.filter(function(x){ return hasComp(x.c); });
    if (comp.length) { L.push(''); L.push('Worked with competitors recently:'); comp.forEach(function(x){ L.push('• ' + dn(x.c) + ': ' + x.c.competitors); }); }
  }
  return L.join('\n');
}
function metricData(){
  var R = creatorRows(), P = postRows(), L = R.list.filter(function(x){ return x.price; }), t = P.t, s = W.settings || {};
  var sum = function(k){ return L.reduce(function(a, x){ return a + (+x.c[k] || 0); }, 0); };
  var fees = L.reduce(function(a, x){ return a + (x.price || 0); }, 0), views = sum('avgViews'), reach = sum('reach'), fol = sum('followers'), eng = L.reduce(function(a, x){ return a + (x.eng || 0); }, 0);
  return {n: L.length, posts: W.posts.length, rows: [
    ['Total fees / spend', 'sum of fees', rs(fees), rs(t.fee)],
    ['Budget used', 'spend ÷ budget × 100', '—', s.budget ? pct(t.fee / s.budget * 100, 1) : '—'],
    ['Budget left', 'budget − spend', '—', s.budget ? rs(s.budget - t.fee) : '—'],
    ['Avg ER (followers)', 'engagement ÷ followers × 100', pct(avgOf(L, 'er'), 2), '—'],
    ['Avg ER (views)', 'engagement ÷ views × 100', pct(avgOf(L, 'erV'), 2), t.views ? pct(t.eng / t.views * 100, 2) : '—'],
    ['Avg ER (reach)', 'engagement ÷ reach × 100', pct(avgOf(L, 'erR'), 2), '—'],
    ['Avg CPV', 'average of CPV', rs(avgOf(L, 'cpv'), 2), rs(avgOf(P.list, 'cpv'), 2)],
    ['Blended CPV', 'total fees ÷ total views', views ? rs(fees / views, 2) : '—', t.views ? rs(t.fee / t.views, 2) : '—'],
    ['Avg CPE', 'average of CPE', rs(avgOf(L, 'cpe'), 2), rs(avgOf(P.list, 'cpe'), 2)],
    ['Blended CPE', 'total fees ÷ total engagement', eng ? rs(fees / eng, 2) : '—', t.eng ? rs(t.fee / t.eng, 2) : '—'],
    ['Avg CPM', 'average of fee ÷ views × 1,000', rs(avgOf(L, 'cpm'), 0), rs(avgOf(P.list, 'cpm'), 0)],
    ['Blended CPM', 'total fees ÷ total views × 1,000', views ? rs(fees / views * 1000, 0) : '—', t.views ? rs(t.fee / t.views * 1000, 0) : '—'],
    ['Avg CPR', 'average of fee ÷ reach', rs(avgOf(L, 'cpr'), 2), '—'],
    ['Blended CPR', 'total fees ÷ total reach', reach ? rs(fees / reach, 2) : '—', '—'],
    ['Cost per 1K followers', 'fee ÷ followers × 1,000', rs(avgOf(L, 'cpf'), 0), '—'],
    ['Avg reach rate', 'reach ÷ followers × 100', pct(avgOf(L, 'reachRate'), 1), '—'],
    ['Avg view rate', 'views ÷ followers × 100', pct(avgOf(L, 'viewRate'), 1), '—'],
    ['Total views', 'sum of views', short(views), short(t.views)],
    ['Total engagement', 'likes + comments', short(eng), short(t.eng)],
    ['Total followers reached', 'sum of followers', short(fol), '—']
  ]};
}
function renderReport(){
  var M = metricData();
  body(pageHead('Manager report', 'A short update to paste into WhatsApp, Slack or email, and a full PDF report. Both update whenever the numbers change.',
      scopeToggle() + '<button class="btn" id="copy-summary">Copy text</button><button class="btn primary" id="dl-report">' + icon('down', 16) + 'Download PDF report</button>') + teamNote() +
    '<div class="two"><div class="panel"><h3>Update for your manager</h3><pre class="summary" id="summary-text"></pre></div>' +
    '<div class="panel"><h3>How the numbers are worked out</h3><dl class="formulas">' +
      [['Engagement', 'likes + comments'], ['ER (followers)', 'avg engagement ÷ followers × 100'], ['ER (views)', 'engagement ÷ views × 100'], ['CPV', 'fee ÷ views'], ['CPE', 'fee ÷ engagement'], ['CPM', 'fee ÷ views × 1,000'], ['CPR', 'fee ÷ average reach'],
       ['Avg CPV, CPE, CPR', 'average of each creator’s value'], ['Blended CPV, CPR', 'total fees ÷ total views (or reach)'], ['Cost per 1K followers', 'fee ÷ followers × 1,000'], ['Reach rate', 'reach ÷ followers × 100'], ['View rate', 'avg views ÷ followers × 100'],
       ['Audience quality', 'score out of 100 from organic posts: ER for the size, comments vs likes, like spikes, Reel views vs followers, follow count'], ['Sponsored vs organic', '(sponsored ER − organic ER) ÷ organic ER × 100, boosted posts left out'], ['Likely boosted', 'sponsored post with about 3× the creator’s normal views']]
        .map(function(r){ return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>' +
      '<p class="tiny muted">Average reach isn’t public on Instagram. When nobody has typed it from the creator’s insights, it is estimated as 80% of average views (or a typical reach rate for the tier), so CPR is an estimate too.</p>' +
      '<div class="tbl"><table><thead><tr><th>Tier</th><th>Followers</th><th class="n">Strong ER</th><th class="n">Okay ER</th></tr></thead><tbody>' +
        TIERS.map(function(t){ return '<tr><td>' + t + '</td><td>' + TIER_RANGE[t] + '</td><td class="n">' + BENCH[t][0] + '% or more</td><td class="n">' + BENCH[t][1] + '% or more</td></tr>'; }).join('') + '</tbody></table></div></div></div>' +
    '<div class="panel"><div class="stack"><h3>All metrics</h3><p class="small muted">Shortlist values use creators with a fee. Campaign values use every tracked post.</p></div>' +
      '<div class="tbl"><table><thead><tr><th>Metric</th><th>Formula</th><th class="n">Shortlist (' + M.n + ' with fee or est. price)</th><th class="n">Campaign (' + plural(M.posts, 'post') + ')</th></tr></thead><tbody>' +
      M.rows.map(function(r){ return '<tr><td><strong>' + esc(r[0]) + '</strong></td><td class="small muted">' + esc(r[1]) + '</td><td class="n">' + r[2] + '</td><td class="n">' + r[3] + '</td></tr>'; }).join('') + '</tbody></table></div></div>');
  $('summary-text').textContent = summaryText();
  bindScope();
  $('copy-summary').onclick = function(){ copyText(summaryText(), this, 'Update'); };
  $('dl-report').onclick = function(){ downloadReport(this); };
}

/* ---------- PDF report ---------- */
var H2P_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
function rpSum(list, f){ return list.reduce(function(a, x){ var v = f(x); return a + (ok(v) ? v : 0); }, 0); }
function rpAvg(list, f){ var v = list.map(f).filter(ok); return v.length ? v.reduce(function(a, b){ return a + b; }, 0) / v.length : null; }
function reportHTML(){
  var P = postRows(), R = creatorRows(), s = W.settings || {}, user = (ST.user && (ST.user.name || ST.user.email)) || '', posts = P.list, cr = R.list, company = (co() || {}).name || '';
  var today = new Date().toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'});
  var dates = s.start && s.end ? new Date(s.start).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'}) + ' – ' + new Date(s.end).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'}) : '';
  var A = '#0D6A65', GOLD = '#E3A21A', INK = '#15211F', MU = '#586966', LN = '#D5DFDC', SK = '#EEF3F1';
  var th = 'style="text-align:left;padding:6px 7px;font-size:9.5px;color:#fff;background:' + A + ';font-weight:600"', thn = 'style="text-align:right;padding:6px 7px;font-size:9.5px;color:#fff;background:' + A + ';font-weight:600"';
  var td = function(v, n, b){ return '<td style="padding:5px 7px;font-size:9.5px;border-bottom:1px solid ' + LN + ';' + (n ? 'text-align:right;' : '') + (b ? 'font-weight:700;' : '') + '">' + v + '</td>'; };
  var h2 = function(t, sub){ return '<div class="avoid" style="margin:22px 0 8px"><div style="font-size:15px;font-weight:700;color:' + INK + '">' + t + '</div>' + (sub ? '<div style="font-size:9.5px;color:' + MU + '">' + sub + '</div>' : '') + '</div>'; };
  var tile = function(k, v, sub){ return '<div style="flex:1;background:' + SK + ';border-radius:8px;padding:10px 12px"><div style="font-size:9px;color:' + MU + '">' + k + '</div><div style="font-size:18px;font-weight:700;color:' + INK + ';margin-top:2px">' + v + '</div><div style="font-size:8.5px;color:' + MU + '">' + (sub || '') + '</div></div>'; };
  var out = [];
  out.push('<div style="border-bottom:3px solid ' + A + ';padding-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end">' +
    '<div><div style="font-size:9.5px;color:' + A + ';font-weight:600">' + esc(company ? company + ' · campaign report' : 'Campaign report') + '</div>' +
    '<div style="font-size:24px;font-weight:700;color:' + INK + ';margin-top:2px">' + esc(s.name || 'Influencer campaign') + '</div>' +
    '<div style="font-size:10px;color:' + MU + '">' + [dates, s.budget ? 'Budget ' + rs(s.budget) : '', plural(posts.length, 'post') + ', ' + plural(cr.length, 'creator') + ' on the shortlist'].filter(Boolean).map(esc).join(' · ') + '</div></div>' +
    '<div style="text-align:right;font-size:9px;color:' + MU + '">' + esc(today) + (user ? '<br>Prepared by ' + esc(user) : '') + '<br><strong style="color:' + A + '">My Creator Desk</strong></div></div>');
  if (posts.length) {
    var t = P.t, likes = rpSum(posts, function(x){ return x.p.likes; }), comm = rpSum(posts, function(x){ return x.p.comments; }), n = posts.length;
    out.push('<div class="avoid" style="display:flex;gap:8px;margin-top:14px">' +
      tile('Total spend', rs(t.fee), s.budget ? pct(t.fee / s.budget * 100, 0) + ' of budget' : 'avg ' + rs(t.fee / n) + ' per post') +
      tile('Total views', short(t.views), 'avg ' + short(t.views / n) + ' per post') +
      tile('Blended CPV', t.views ? rs(t.fee / t.views, 2) : '—', 'avg of posts ' + rs(rpAvg(posts, function(x){ return x.cpv; }), 2)) +
      tile('ER by views', t.views ? pct(t.eng / t.views * 100, 2) : '—', 'avg of posts ' + pct(rpAvg(posts, function(x){ return x.erV; }), 2)) + '</div>');
    out.push(h2('Totals and averages', 'Total = everything added up. Average = per post. Blended = total cost ÷ total result.'));
    var rows = [['Spend', rs(t.fee), rs(t.fee / n)], ['Views', n0(t.views), n0(t.views / n)], ['Likes', n0(likes), n0(likes / n)], ['Comments', n0(comm), n0(comm / n)], ['Engagement (likes + comments)', n0(t.eng), n0(t.eng / n)],
      ['CPV (cost per view)', t.views ? rs(t.fee / t.views, 2) + ' blended' : '—', rs(rpAvg(posts, function(x){ return x.cpv; }), 2)],
      ['CPE (cost per engagement)', t.eng ? rs(t.fee / t.eng, 2) + ' blended' : '—', rs(rpAvg(posts, function(x){ return x.cpe; }), 2)],
      ['CPM (cost per 1,000 views)', t.views ? rs(t.fee / t.views * 1000, 0) + ' blended' : '—', rs(rpAvg(posts, function(x){ return x.cpm; }), 0)],
      ['ER by views', t.views ? pct(t.eng / t.views * 100, 2) + ' blended' : '—', pct(rpAvg(posts, function(x){ return x.erV; }), 2)]];
    if (s.budget) rows.push(['Budget used', pct(t.fee / s.budget * 100, 1) + ' (' + rs(s.budget - t.fee) + ' left)', '—']);
    out.push('<table style="width:100%;border-collapse:collapse"><thead><tr><th ' + th + '>Metric</th><th ' + thn + '>Total</th><th ' + thn + '>Average per post</th></tr></thead><tbody>' + rows.map(function(r){ return '<tr>' + td('<strong>' + r[0] + '</strong>') + td(r[1], 1) + td(r[2], 1) + '</tr>'; }).join('') + '</tbody></table>');
    var top = posts.slice().sort(function(a, b){ return (b.p.fee || 0) - (a.p.fee || 0); }).slice(0, 10);
    var mf = Math.max.apply(null, top.map(function(x){ return x.p.fee || 0; }).concat([1])), mv = Math.max.apply(null, top.map(function(x){ return x.p.views || 0; }).concat([1]));
    out.push(h2('Spend vs views', 'Top ' + top.length + ' posts by spend. A long green bar with a short grey bar means good value.'));
    out.push('<div class="avoid">' + top.map(function(x){ var p = x.p;
      return '<div style="display:grid;grid-template-columns:130px 1fr;gap:8px;align-items:center;margin:3px 0"><div style="font-size:9px;color:' + INK + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(pdn(p)) + '</div>' +
        '<div><div style="display:flex;align-items:center;gap:6px"><div style="height:7px;border-radius:3px;background:#9AA9A6;width:' + Math.max(1, (p.fee || 0) / mf * 75) + '%"></div><span style="font-size:8px;color:' + MU + '">' + rs(p.fee) + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-top:2px"><div style="height:7px;border-radius:3px;background:' + A + ';width:' + Math.max(1, (p.views || 0) / mv * 75) + '%"></div><span style="font-size:8px;color:' + MU + '">' + short(p.views) + ' views</span></div></div></div>'; }).join('') +
      '<div style="font-size:8.5px;color:' + MU + ';margin-top:4px"><span style="display:inline-block;width:9px;height:7px;background:#9AA9A6;border-radius:2px"></span> Spend &nbsp; <span style="display:inline-block;width:9px;height:7px;background:' + A + ';border-radius:2px"></span> Views</div></div>');
    out.push(h2('Every post', 'Sorted by cost per view, best first.'));
    var ps = posts.slice().sort(function(a, b){ return (ok(a.cpv) ? a.cpv : 1e9) - (ok(b.cpv) ? b.cpv : 1e9); });
    out.push('<table style="width:100%;border-collapse:collapse"><thead><tr><th ' + th + '>Creator</th><th ' + th + '>Platform</th><th ' + thn + '>Fee</th><th ' + thn + '>Views</th><th ' + thn + '>Likes</th><th ' + thn + '>Comments</th><th ' + thn + '>ER views</th><th ' + thn + '>CPV</th><th ' + thn + '>CPE</th><th ' + thn + '>CPM</th><th ' + th + '>Verdict</th></tr></thead><tbody>' +
      ps.map(function(x){ var p = x.p; return '<tr>' + td(esc(pdn(p))) + td(esc(p.platform || 'Instagram')) + td(rs(p.fee), 1) + td(n0(p.views), 1) + td(n0(p.likes), 1) + td(n0(p.comments), 1) + td(pct(x.erV, 2), 1) + td(rs(x.cpv, 2), 1) + td(rs(x.cpe, 2), 1) + td(rs(x.cpm, 0), 1) + td(esc(x.v.label)) + '</tr>'; }).join('') +
      '<tr style="background:' + SK + '">' + td('Total', 0, 1) + td('') + td(rs(t.fee), 1, 1) + td(n0(t.views), 1, 1) + td(n0(likes), 1, 1) + td(n0(comm), 1, 1) + td(t.views ? pct(t.eng / t.views * 100, 2) : '—', 1, 1) + td(t.views ? rs(t.fee / t.views, 2) : '—', 1, 1) + td(t.eng ? rs(t.fee / t.eng, 2) : '—', 1, 1) + td(t.views ? rs(t.fee / t.views * 1000, 0) : '—', 1, 1) + td('') + '</tr>' +
      '<tr style="background:' + SK + '">' + td('Average', 0, 1) + td('') + td(rs(t.fee / n), 1, 1) + td(n0(t.views / n), 1, 1) + td(n0(likes / n), 1, 1) + td(n0(comm / n), 1, 1) + td(pct(rpAvg(posts, function(x){ return x.erV; }), 2), 1, 1) + td(rs(rpAvg(posts, function(x){ return x.cpv; }), 2), 1, 1) + td(rs(rpAvg(posts, function(x){ return x.cpe; }), 2), 1, 1) + td(rs(rpAvg(posts, function(x){ return x.cpm; }), 0), 1, 1) + td('') + '</tr></tbody></table>');
    var ranked = posts.filter(function(x){ return ok(x.cpv); }).sort(function(a, b){ return a.cpv - b.cpv; });
    if (ranked.length >= 2) {
      var k = Math.min(3, Math.floor(ranked.length / 2) || 1);
      var li = function(x){ return '<li style="font-size:9.5px;margin:2px 0">' + esc(pdn(x.p)) + ': ' + rs(x.cpv, 2) + ' per view, ' + short(x.p.views) + ' views for ' + rs(x.p.fee) + '</li>'; };
      out.push('<div class="avoid" style="display:flex;gap:10px;margin-top:16px">' +
        '<div style="flex:1;border-left:3px solid #1E7845;padding:6px 10px;background:#F2FAF5"><div style="font-size:10.5px;font-weight:700;color:#1E7845">Best value (top ' + k + ')</div><ul style="margin:4px 0 0;padding-left:14px">' + ranked.slice(0, k).map(li).join('') + '</ul></div>' +
        '<div style="flex:1;border-left:3px solid #B13529;padding:6px 10px;background:#FCF3F1"><div style="font-size:10.5px;font-weight:700;color:#B13529">Costliest per view (bottom ' + k + ')</div><ul style="margin:4px 0 0;padding-left:14px">' + ranked.slice(-k).reverse().map(li).join('') + '</ul></div></div>');
    }
  }
  if (cr.length) {
    var priced = cr.filter(function(x){ return x.price; });
    out.push(h2('Creator shortlist', plural(cr.length, 'creator') + '. Prices marked (est.) are estimates when no fee was typed.'));
    var ths = 'style="text-align:left;padding:5px 5px;font-size:8.5px;color:#fff;background:' + A + ';font-weight:600"', thns = 'style="text-align:right;padding:5px 5px;font-size:8.5px;color:#fff;background:' + A + ';font-weight:600"';
    var tds = function(v, n, b){ return '<td style="padding:4px 5px;font-size:8.5px;border-bottom:1px solid ' + LN + ';' + (n ? 'text-align:right;' : '') + (b ? 'font-weight:700;' : '') + '">' + v + '</td>'; };
    var qAvg = rpAvg(cr, function(x){ var q = qualityInfo(x.c); return q && q.score; });
    out.push('<table style="width:100%;border-collapse:collapse"><thead><tr><th ' + ths + '>Creator</th><th ' + thns + '>Followers</th><th ' + thns + '>Avg views</th><th ' + thns + '>ER</th><th ' + ths + '>Audience quality</th><th ' + ths + '>Best format</th><th ' + thns + '>Sponsored vs organic</th><th ' + thns + '>Price</th><th ' + thns + '>CPV</th><th ' + ths + '>Verdict</th></tr></thead><tbody>' +
      cr.map(function(x){ var c = x.c, q = qualityInfo(c); return '<tr>' + tds(esc(dn(c))) + tds(short(c.followers), 1) + tds(short(c.avgViews), 1) + tds(pct(x.er, 2), 1) + tds(q ? esc(q.label + (q.score != null ? ' ' + q.score : '')) : '—') + tds(esc(String(c.bestFormat || '—').replace(/ \(.*$/, ''))) + tds(esc((String(c.sponsoredLift || '').match(/^[+-]\d+%/) || [c.sponsoredLift ? 'None' : '—'])[0]), 1) + tds(x.price ? rs(x.price) + (x.priceEst ? ' (est.)' : '') : '—', 1) + tds(rs(x.cpv, 2), 1) + tds(esc(x.v.label)) + '</tr>'; }).join('') +
      '<tr style="background:' + SK + '">' + tds('Total', 0, 1) + tds(short(rpSum(cr, function(x){ return x.c.followers; })), 1, 1) + tds(short(rpSum(cr, function(x){ return x.c.avgViews; })), 1, 1) + tds('') + tds('') + tds('') + tds('') + tds(rs(rpSum(priced, function(x){ return x.price; })), 1, 1) + tds('') + tds('') + '</tr>' +
      '<tr style="background:' + SK + '">' + tds('Average', 0, 1) + tds(short(rpAvg(cr, function(x){ return x.c.followers; })), 1, 1) + tds(short(rpAvg(cr, function(x){ return x.c.avgViews; })), 1, 1) + tds(pct(rpAvg(cr, function(x){ return x.er; }), 2), 1, 1) + tds(ok(qAvg) ? Math.round(qAvg) + '/100' : '', 0, 1) + tds('') + tds('') + tds(priced.length ? rs(rpAvg(priced, function(x){ return x.price; })) : '—', 1, 1) + tds(rs(rpAvg(cr, function(x){ return x.cpv; }), 2), 1, 1) + tds('') + '</tr></tbody></table>');
    var flags = cr.filter(function(x){ var q = qualityInfo(x.c); return q && (q.label === 'Suspicious' || q.label === 'Check'); });
    var comp = cr.filter(function(x){ return hasComp(x.c); });
    if (flags.length || comp.length) {
      out.push(h2('Things to check before booking'));
      out.push('<ul class="avoid" style="margin:0;padding-left:16px">' + flags.map(function(x){ var q = qualityInfo(x.c); return '<li style="font-size:9.5px;margin:3px 0"><strong>' + esc(dn(x.c)) + '</strong>: audience quality ' + esc(q.label.toLowerCase()) + (q.score != null ? ' (' + q.score + '/100)' : '') + '. ' + esc(String(x.c.qualityWhy || '').replace(/\. Based on.*$/, '')) + '</li>'; }).join('') +
        comp.map(function(x){ return '<li style="font-size:9.5px;margin:3px 0"><strong>' + esc(dn(x.c)) + '</strong>: worked with a competitor: ' + esc(x.c.competitors) + '</li>'; }).join('') + '</ul>');
    }
  }
  if (!posts.length && !cr.length) out.push('<p style="font-size:11px;color:' + MU + ';margin-top:20px">No creators or campaign posts yet.</p>');
  out.push('<div class="avoid" style="margin-top:22px;padding-top:8px;border-top:1px solid ' + LN + ';font-size:8px;color:' + MU + ';line-height:1.5"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + GOLD + ';margin-right:5px"></span>Views, likes, comments and followers come from Instagram. Audience quality, boosted posts and estimated prices are estimates worked out from public numbers. Instagram views for photo posts are estimated. Generated with My Creator Desk · mycreatordesk.co.in</div>');
  return '<div style="font-family:\'IBM Plex Sans\',Arial,sans-serif;color:' + INK + ';background:#fff;width:718px;padding:4px 2px">' + out.join('') + '</div>';
}
function downloadReport(btn){
  busy(btn, true, 'Making PDF…');
  loadScript(H2P_URL, function(){ return !!window.html2pdf; }).then(function(){
    var holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff'; holder.innerHTML = reportHTML(); document.body.appendChild(holder);
    var d0 = new Date(), name = ((W.settings && W.settings.name) || 'Campaign') + ' report ' + d0.getFullYear() + '-' + ('0' + (d0.getMonth() + 1)).slice(-2) + '-' + ('0' + d0.getDate()).slice(-2);
    return html2pdf().set({margin: [10, 10, 12, 10], filename: name.replace(/[\\/:*?"<>|]+/g, '-') + '.pdf', image: {type: 'jpeg', quality: 0.96},
      html2canvas: {scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false}, jsPDF: {unit: 'mm', format: 'a4', orientation: 'portrait'},
      pagebreak: {mode: ['css', 'legacy'], avoid: ['tr', '.avoid']}}).from(holder.firstChild).save().then(function(){ holder.remove(); toast('Report downloaded'); }, function(e){ holder.remove(); throw e; });
  }).catch(function(e){ toast(e.message || 'Could not make the PDF', true); }).then(function(){ busy(btn, false); });
}

/* ---------- CSV + Excel ---------- */
function q(v){ v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function fx(v, d){ return ok(v) ? Number(v).toFixed(d) : ''; }
var EXTRA_HEAD = ['Platform', 'Tier', 'Average Likes', 'Verdict', 'Why', 'Competitor mentions', 'Recent brand collabs', 'Quality reasons', 'Organic ER%', 'Sponsored ER%', 'Sponsored vs organic', 'Likely boosted posts', 'Best format', 'Content mix'];
function creatorTable(only){
  var R = creatorRows(); var rows = R.list; if (only && only.length) rows = rows.filter(function(x){ return only.indexOf(x.c.id) >= 0; });
  var head = TEAM_COLS.map(function(c){ return c[1]; }).concat(EXTRA_HEAD).concat(W.scope === 'team' ? ['Added by'] : []);
  return [head].concat(rows.map(function(x){ var c = x.c;
    return TEAM_COLS.map(function(col){ var k = col[0];
      if (k === 'name') return c.handle; if (k === 'er') return ok(x.er) ? +x.er.toFixed(2) : ''; if (k === 'engagement') return x.eng ? Math.round(x.eng) : ''; if (k === 'cpv' || k === 'cpe') return ok(x[k]) ? +x[k].toFixed(2) : '';
      if (k === 'credibility') return c.credibility || '';
      var v = c[k]; return v == null ? '' : v; }).concat([c.platform || 'Instagram', x.tier, c.likes || '', x.v.label, x.v.why, c.competitors || '', c.collabs || '', c.qualityWhy || '', c.organicEr || '', c.sponsoredEr || '', c.sponsoredLift || '', c.boosted || '', c.bestFormat || '', c.contentMix || '']).concat(W.scope === 'team' ? [c.owner_email] : []); }));
}
function creatorsCSV(only){ return creatorTable(only).map(function(r){ return r.map(q).join(','); }).join('\n'); }
function postsCSV(){ var P = postRows();
  return [['Creator', 'Platform', 'Post', 'Fee', 'Views', 'Likes', 'Comments', 'ER views %', 'CPV', 'CPE', 'CPM', 'Verdict'].join(',')].concat(P.list.map(function(x){ var p = x.p;
    return [q(pdn(p)), q(p.platform || 'Instagram'), q(p.link || p.code), p.fee || '', p.views || '', p.likes || '', p.comments || '', fx(x.erV, 2), fx(x.cpv, 3), fx(x.cpe, 2), fx(x.cpm, 0), q(x.v.label)].join(','); })).join('\n'); }
function downloadExcel(btn, ids){
  busy(btn, true, 'Making file…');
  loadScript(XLSX_URL, function(){ return !!window.XLSX; }).then(function(){
    var data = creatorTable(ids); var ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = data[0].map(function(h, i){ return {wch: i === 2 ? 26 : Math.min(40, Math.max(10, String(h).length + 2))}; });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Shortlist');
    var d0 = new Date(); XLSX.writeFile(wb, ((co() || {}).name || 'Creator') + ' shortlist ' + d0.toISOString().slice(0, 10) + '.xlsx');
    toast((ids.length ? plural(ids.length, 'selected creator') : 'Shortlist') + ' downloaded');
  }).catch(function(e){ toast(e.message, true); }).then(function(){ busy(btn, false); });
}

/* lists for the form fields */
document.addEventListener('DOMContentLoaded', function(){
  $('cat-list').innerHTML = CATEGORIES.map(function(c){ return '<option value="' + esc(c) + '">'; }).join('');
  $('lang-list').innerHTML = LANGUAGES.map(function(c){ return '<option value="' + esc(c) + '">'; }).join('');
});
