/* My Creator Desk — company screens (team, usage, Instagram, billing, company details) and the platform owner panel. */
'use strict';

function renderCompanyPage(n){
  if (n === 'team') return renderTeam();
  if (n === 'usage') return renderUsage();
  if (n === 'instagram') return renderInstagram();
  if (n === 'billing') return renderBilling();
  if (n === 'company') return renderCompanyDetails();
}
function roleChip(r){ return r === 'admin' ? '<span class="chip teal">Admin</span>' : '<span class="chip neutral">Member</span>'; }
function avatar(p){ return p.avatar_url ? '<img src="' + esc(p.avatar_url) + '" alt="" referrerpolicy="no-referrer" style="width:32px;height:32px;border-radius:50%;flex:none">' : '<span style="width:32px;height:32px;border-radius:50%;flex:none;display:grid;place-items:center;background:var(--teal-soft);color:var(--teal);font-weight:600;font-size:13px">' + esc(initials(p.full_name || p.email)) + '</span>'; }

/* ================= team ================= */
function renderTeam(){
  loadingBody();
  var c = co();
  api('members.list', {companyId: c.id}).then(function(d){
    if (CURRENT !== 'team') return;
    var adm = isAdmin(), me = ST.user.id, full = d.seatsUsed >= d.seatLimit, admins = d.members.filter(function(m){ return m.role === 'admin'; }).length;
    body(pageHead('Team', adm ? 'Invite the people who work on creators with you. Each person has their own shortlist and campaigns; admins can see everyone’s work.' : 'The people in ' + esc(c.name) + '. Each person has their own shortlist and campaigns.') +
      '<div class="ledger">' + stat('Seats used', d.seatsUsed + ' of ' + d.seatLimit, plural(d.members.length, 'member') + (d.invitations.length ? ', ' + plural(d.invitations.length, 'invite') + ' open' : '')) +
        stat('Admins', admins, 'can invite, pay and connect Instagram') + stat('Plan', esc(planName(c.plan_id)), full ? '<span style="color:var(--warn)">All seats are taken</span>' : (d.seatLimit - d.seatsUsed) + ' seats free') + '</div>' +
      (adm ? '<div class="panel"><div class="stack"><h3>Invite someone</h3><p class="small muted">They sign in with Google using this exact email address and the invite is waiting for them. Invites stay open for 14 days.</p></div>' +
        (full ? '<div class="note warn"><span>All ' + d.seatLimit + ' seats are in use. Remove someone or cancel an open invite, or move to a bigger plan.</span><a class="btn sm" href="#/plan">See plans</a></div>' : '') +
        '<form class="form" id="inv-form" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr) auto" novalidate><fieldset style="display:contents"' + (full || !canWork() ? ' disabled' : '') + '>' +
          '<label class="field">Work email (their Google account)<input id="inv-email" type="email" autocomplete="off" placeholder="riya@yourcompany.com"></label>' +
          '<label class="field">Role<select id="inv-role"><option value="member">Member</option><option value="admin">Admin</option></select></label>' +
          '<button class="btn primary" id="inv-btn" type="submit">' + icon('mail', 16) + 'Send invite</button></fieldset></form>' +
        '<p class="tiny muted">There is no invite email yet: tell them to open mycreatordesk.co.in and sign in. Members look up creators and run campaigns. Admins can also pay, invite people and connect Instagram.</p></div>' : '') +
      '<div class="tbl"><table><thead><tr><th>Person</th><th>Role</th><th>Joined</th><th></th></tr></thead><tbody>' +
        d.members.map(function(m){ var self = m.user_id === me;
          return '<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap">' + avatar(m) + '<div><div class="cname">' + esc(m.full_name || m.email) + (self ? ' <span class="chip neutral">You</span>' : '') + '</div><div class="csub">' + esc(m.email) + '</div></div></div></td>' +
            '<td>' + (adm && !self ? '<select data-role="' + esc(m.user_id) + '" aria-label="Role for ' + esc(m.email) + '" style="width:auto;min-height:34px;padding:5px 8px"><option value="member"' + (m.role === 'member' ? ' selected' : '') + '>Member</option><option value="admin"' + (m.role === 'admin' ? ' selected' : '') + '>Admin</option></select>' : roleChip(m.role)) + '</td>' +
            '<td class="small muted">' + niceDay(m.created_at) + '</td>' +
            '<td style="text-align:right">' + (adm && !self ? '<button class="btn sm danger" data-rmm="' + esc(m.user_id) + '">Remove</button>' : self && !(m.role === 'admin' && admins === 1) ? '<button class="btn sm" data-leave="' + esc(m.user_id) + '">Leave company</button>' : '') + '</td></tr>'; }).join('') +
        d.invitations.map(function(i){ return '<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span style="width:32px;height:32px;border-radius:50%;flex:none;display:grid;place-items:center;border:1.5px dashed var(--line-2);color:var(--muted)">' + icon('mail', 14) + '</span><div><div class="cname">' + esc(i.email) + '</div><div class="csub">Invite open until ' + niceDay(i.expires_at) + '</div></div></div></td><td>' + roleChip(i.role) + ' <span class="chip gold">Invited</span></td><td class="small muted">' + niceDay(i.created_at) + '</td><td style="text-align:right"><button class="btn sm" data-revoke="' + esc(i.id) + '">Cancel invite</button></td></tr>'; }).join('') +
      '</tbody></table></div>');
    var f = $('inv-form');
    if (f) f.onsubmit = function(e){ e.preventDefault(); var em = $('inv-email').value.trim().toLowerCase(), btn = $('inv-btn');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast('That email address does not look right.', true); $('inv-email').focus(); return; }
      busy(btn, true, 'Inviting…');
      api('invites.create', {companyId: c.id, email: em, role: $('inv-role').value}).then(function(){ toast('Invite ready for ' + em + '. Ask them to sign in with that Google account.'); renderTeam(); })
        .catch(function(err){ busy(btn, false); toast(err.message, true); }); };
    qsa('[data-role]').forEach(function(s){ s.onchange = function(){ api('members.role', {companyId: c.id, userId: s.dataset.role, role: s.value}).then(function(){ toast('Role changed'); renderTeam(); }).catch(function(e){ toast(e.message, true); renderTeam(); }); }; });
    qsa('[data-rmm]').forEach(function(b){ b.onclick = function(){ armOnce(b, 'Click again to remove', function(){ busy(b, true, 'Removing…');
      api('members.remove', {companyId: c.id, userId: b.dataset.rmm}).then(function(){ toast('Removed from the team. Their work stays with the company.'); renderTeam(); }).catch(function(e){ busy(b, false); toast(e.message, true); }); }); }; });
    qsa('[data-revoke]').forEach(function(b){ b.onclick = function(){ busy(b, true, 'Cancelling…'); api('invites.revoke', {companyId: c.id, invitationId: b.dataset.revoke}).then(function(){ toast('Invite cancelled'); renderTeam(); }).catch(function(e){ busy(b, false); toast(e.message, true); }); }; });
    qsa('[data-leave]').forEach(function(b){ b.onclick = function(){ armOnce(b, 'Click again to leave', function(){ busy(b, true, 'Leaving…');
      api('members.remove', {companyId: c.id, userId: b.dataset.leave}).then(function(){ store('cd-co', null); return loadMe(); }).then(function(){ toast('You left ' + c.name); ST.work = null; go(homeRoute(), true); }).catch(function(e){ busy(b, false); toast(e.message, true); }); }); }; });
  }).catch(function(e){ errorBody(e, renderTeam); });
}

/* ================= usage ================= */
var usageDays = 30;
function renderUsage(){
  loadingBody();
  var c = co();
  Promise.all([api('usage.get', {companyId: c.id, days: usageDays}), api('audit.list', {companyId: c.id})]).then(function(rs2){
    if (CURRENT !== 'usage') return;
    var d = rs2[0], log = rs2[1].log || [];
    var mem = d.members || [], daily = d.daily || [], cap = d.capacity || [];
    var tot = mem.reduce(function(a, m){ return a + (+m.lookups || 0); }, 0), cached = mem.reduce(function(a, m){ return a + (+m.from_cache || 0); }, 0), failed = mem.reduce(function(a, m){ return a + (+m.failed || 0); }, 0);
    var act = cap.filter(function(x){ return x.status === 'active'; });
    var used = act.reduce(function(a, x){ return a + (+x.used_this_hour || 0); }, 0), lim = act.reduce(function(a, x){ return a + (+x.hourly_limit || 0); }, 0);
    var maxL = Math.max.apply(null, mem.map(function(m){ return +m.lookups || 0; }).concat([1]));
    body(pageHead('Usage', 'How many Instagram lookups each person uses. Answers reused from the last 6 hours are free and don’t touch your hourly limit.',
        '<div class="seg" role="group" aria-label="Period">' + [7, 30, 90].map(function(n){ return '<button data-days="' + n + '" aria-pressed="' + (usageDays === n) + '">' + n + ' days</button>'; }).join('') + '</div>') +
      '<div class="ledger">' + stat('Fresh lookups', n0(tot), 'last ' + usageDays + ' days') + stat('Reused for free', n0(cached), tot + cached ? Math.round(cached / (tot + cached) * 100) + '% of all lookups' : 'from the 6-hour cache') +
        stat('Failed', n0(failed), 'handle not found or a private account') + stat('Right now', lim ? (lim - used) + ' left' : '—', lim ? used + ' of ' + lim + ' used this hour' : 'No Instagram account connected') + '</div>' +
      '<div class="panel"><div class="spread"><h3>Lookups per day</h3><div class="legend"><span><span class="dot" style="background:var(--teal)"></span>Fresh</span><span><span class="dot" style="background:var(--gold)"></span>Reused for free</span></div></div><div id="usage-chart"></div></div>' +
      '<div class="two"><div class="panel"><h3>By person</h3>' + (mem.length ? '<div class="tbl"><table><thead><tr><th>Person</th><th class="n">Fresh</th><th style="width:35%"><span class="sr">Share</span></th><th class="n">Reused</th><th class="n">Failed</th><th>Last lookup</th></tr></thead><tbody>' +
          mem.map(function(m){ return '<tr><td><div class="cname">' + esc(m.full_name || m.email) + '</div><div class="csub">' + esc(m.email) + '</div></td><td class="n"><strong>' + n0(m.lookups) + '</strong></td><td><div class="track" style="height:8px"><div class="fill" style="width:' + ((+m.lookups || 0) / maxL * 100) + '%"></div></div></td><td class="n">' + n0(m.from_cache) + '</td><td class="n">' + n0(m.failed) + '</td><td class="small muted">' + (m.last_lookup ? ago(m.last_lookup) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small">Nobody has looked anyone up yet.</p>') + '</div>' +
        '<div class="panel"><h3>Instagram accounts this hour</h3>' + (cap.length ? cap.map(function(x){ var p = (+x.used_this_hour || 0) / (+x.hourly_limit || 150) * 100;
            return '<div class="stack" style="gap:6px"><div class="spread"><b>@' + esc(x.username || 'account') + '</b><span class="small muted">' + (x.status === 'active' ? x.used_this_hour + ' of ' + x.hourly_limit + ' used' : '<span class="chip warn">' + esc(x.status === 'expired' ? 'Expired' : x.status) + '</span>') + '</span></div><div class="track"><div class="fill' + (p >= 90 ? ' over' : p >= 60 ? ' gold' : '') + '" style="width:' + Math.min(100, p) + '%"></div></div></div>'; }).join('') +
            '<p class="tiny muted">Each account allows 150 fresh lookups an hour, kept safely under Instagram’s own limit. It resets on the hour.</p>' : '<p class="muted small">No Instagram account connected yet. <a href="#/instagram">Connect one</a>.</p>') + '</div></div>' +
      '<div class="panel"><div class="stack"><h3>Activity</h3><p class="small muted">Changes to the company, billing, Instagram and the team. Latest first.</p></div>' + (log.length ? '<div class="tbl" style="max-height:420px"><table><thead><tr><th>When</th><th>What happened</th><th>Who</th></tr></thead><tbody>' +
        log.slice(0, 100).map(function(a){ return '<tr><td class="small muted">' + niceDate(a.created_at) + '</td><td style="white-space:normal">' + esc(auditText(a)) + '</td><td class="small">' + esc(a.actor_email || 'My Creator Desk') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small">Nothing yet.</p>') + '</div>');
    qsa('[data-days]').forEach(function(b){ b.onclick = function(){ usageDays = +b.dataset.days; renderUsage(); }; });
    drawDaily(daily);
  }).catch(function(e){ errorBody(e, renderUsage); });
}
function drawDaily(daily){
  var el = $('usage-chart'); if (!el) return;
  var map = {}; daily.forEach(function(d){ map[String(d.day).slice(0, 10)] = d; });
  var days = []; for (var i = usageDays - 1; i >= 0; i--) { var dt = new Date(Date.now() - i * 864e5); var k = dt.toLocaleDateString('en-CA', {timeZone: 'Asia/Kolkata'}); days.push({k: k, d: dt, f: +(map[k] && map[k].lookups) || 0, c: +(map[k] && map[k].from_cache) || 0}); }
  if (!days.some(function(x){ return x.f || x.c; })) { el.innerHTML = '<p class="muted small">No lookups in this period.</p>'; return; }
  var Wd = 760, H = 200, L = 36, B = 26, T = 10, bw = (Wd - L - 6) / days.length;
  var max = niceMax(Math.max.apply(null, days.map(function(x){ return x.f + x.c; })));
  var Y = function(v){ return T + (H - T - B) * (1 - v / max); };
  var s = '<svg viewBox="0 0 ' + Wd + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="Lookups per day">';
  [0, max / 2, max].forEach(function(v){ s += '<line class="g-line" x1="' + L + '" x2="' + Wd + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="t-mut" x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + Math.round(v) + '</text>'; });
  var every = Math.ceil(days.length / 8);
  days.forEach(function(x, i){ var x0 = L + 3 + i * bw, w = Math.max(2, bw - (bw > 8 ? 3 : 1));
    if (x.f) s += '<rect class="b-teal" x="' + x0 + '" y="' + Y(x.f) + '" width="' + w + '" height="' + (Y(0) - Y(x.f)) + '" rx="2"><title>' + x.k + ': ' + x.f + ' fresh, ' + x.c + ' reused</title></rect>';
    if (x.c) s += '<rect class="b-gold" x="' + x0 + '" y="' + Y(x.f + x.c) + '" width="' + w + '" height="' + (Y(x.f) - Y(x.f + x.c)) + '" rx="2"><title>' + x.k + ': ' + x.c + ' reused</title></rect>';
    if (i % every === 0) s += '<text class="t-mut" x="' + (x0 + w / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + x.d.toLocaleDateString('en-IN', {day: 'numeric', month: 'short'}) + '</text>'; });
  el.innerHTML = s + '</svg>';
}
function auditText(a){
  var d = a.details || {};
  var m = {
    'company.created': 'Company created',
    'member.invited': 'Invited ' + (d.email || 'someone') + ' as ' + (d.role || 'member'),
    'member.invite_revoked': 'Cancelled an invite',
    'member.joined': (d.email || 'Someone') + ' joined as ' + (d.role || 'member'),
    'member.removed': 'Removed a team member',
    'member.left': 'A team member left',
    'member.role_changed': 'Changed a team member’s role to ' + (d.role || ''),
    'instagram.connected': 'Connected Instagram @' + (d.username || ''),
    'instagram.disconnected': 'Disconnected Instagram @' + (d.username || ''),
    'billing.paid': 'Paid ' + paise(d.amount_paise) + ' for the ' + planName(d.plan) + ' plan',
    'billing.renewed': 'Renewed the plan, ' + paise(d.amount_paise),
    'platform.approved': 'My Creator Desk approved the ' + planName(d.plan) + ' plan (' + (d.cycle || '') + ', ' + (d.seats || '?') + ' seats, ' + (d.ig || '?') + ' Instagram)',
    'platform.status': 'My Creator Desk set the company to ' + (d.status || '') + (d.note ? ': ' + d.note : '')
  };
  return m[a.action] || a.action;
}

/* ================= Instagram ================= */
function renderInstagram(){
  if (!W || ST.workCo !== ST.coId) { loadingBody(); loadWork().then(function(){ if (CURRENT === 'instagram') renderShell('instagram', renderInstagram); }).catch(function(e){ errorBody(e, renderInstagram); }); return; }
  var c = co(), adm = isAdmin(), conns = W.connections || [], capBy = {};
  (W.capacity || []).forEach(function(x){ capBy[x.connection_id] = x; });
  var active = conns.filter(function(x){ return x.status === 'active'; }).length, lim = c.ig_account_limit, room = active < lim;
  var choose = ST.igChoose; ST.igChoose = null;
  body(pageHead('Instagram', 'Lookups run through your company’s own Instagram account, so your numbers never depend on anyone else. Up to ' + plural(lim, 'account') + ' on your plan.',
      adm ? '<button class="btn primary" id="ig-connect"' + (room && canWork() ? '' : ' disabled') + '>' + icon('ig', 18) + 'Connect an Instagram account</button>' : '') +
    (choose ? '<div class="panel" style="border:2px solid var(--gold)"><div class="stack"><h3>Which account should we connect?</h3><p class="small muted">Facebook gave access to more than one Instagram account. Pick one; you’ll confirm with Facebook once more.</p></div>' +
      choose.map(function(a){ var already = conns.some(function(x){ return x.status === 'active' && x.username === a.username; }); return '<div class="spread" style="align-items:center"><div><b>@' + esc(a.username || a.igUserId) + '</b><div class="tiny muted">Facebook Page: ' + esc(a.pageName || '—') + '</div></div>' + (already ? '<span class="chip good">Already connected</span>' : '<button class="btn primary sm" data-pick="' + esc(a.igUserId) + '">Connect this one</button>') + '</div>'; }).join('') + '</div>' : '') +
    (!adm ? '<div class="note"><span>Only company admins can connect or remove Instagram accounts.</span></div>' : !room ? '<div class="note gold"><span>You’re using all ' + plural(lim, 'Instagram account') + ' on your plan. Disconnect one, or move to a bigger plan for more lookups an hour.</span><a class="btn sm" href="#/plan">See plans</a></div>' : '') +
    (conns.length ? '<div class="stack" style="gap:12px">' + conns.map(function(x){ var cp = capBy[x.id] || {}; var p = cp.hourly_limit ? (+cp.used_this_hour || 0) / cp.hourly_limit * 100 : 0;
        var st = x.status === 'active' ? '<span class="chip good">Connected</span>' : '<span class="chip bad">Expired</span>';
        return '<div class="panel tight"><div class="spread" style="align-items:center"><div class="row" style="gap:12px;flex-wrap:nowrap"><span style="width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--teal-soft);color:var(--teal);flex:none">' + icon('ig', 22) + '</span><div><div class="row" style="gap:8px"><b style="font-size:16px">@' + esc(x.username || 'account') + '</b>' + st + '</div><div class="tiny muted">Facebook Page: ' + esc(x.page_name || '—') + ', connected ' + niceDay(x.created_at) + (x.last_checked_at ? ', checked ' + ago(x.last_checked_at) : '') + '</div></div></div>' +
          '<div class="btns">' + (x.status === 'active' ? '<button class="btn sm" data-test="' + esc(x.id) + '">Test connection</button>' : (adm ? '<button class="btn primary sm" data-reconnect>Reconnect</button>' : '')) + (adm ? '<button class="btn sm danger" data-disc="' + esc(x.id) + '">Disconnect</button>' : '') + '</div></div>' +
          (x.last_error ? '<div class="note warn small"><span>' + esc(x.last_error) + '</span></div>' : '') +
          (x.status === 'active' ? '<div class="stack" style="gap:6px"><div class="spread small"><span>' + (cp.used_this_hour || 0) + ' of ' + (cp.hourly_limit || 150) + ' lookups used this hour</span><span class="muted">' + (cp.resets_at ? 'resets at ' + new Date(cp.resets_at).toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'}) : '') + '</span></div><div class="track"><div class="fill' + (p >= 90 ? ' over' : p >= 60 ? ' gold' : '') + '" style="width:' + Math.min(100, p) + '%"></div></div></div>' : '') + '</div>'; }).join('') + '</div>'
      : '<div class="empty"><strong>No Instagram account connected yet</strong><span>' + (adm ? 'Connect your brand’s Instagram so the team can look up creators.' : 'Ask your company admin to connect one.') + '</span>' + (adm && canWork() ? '<button class="btn primary" data-connect2>' + icon('ig', 18) + 'Connect Instagram</button>' : '') + '</div>') +
    '<div class="panel flat"><h3>Before you connect</h3><ul class="checklist">' +
      '<li><span class="ck">1</span><div><b>Use a Business or Creator Instagram account</b><div class="small muted">Personal accounts can’t be used. You can switch for free in Instagram settings, under account type.</div></div></li>' +
      '<li><span class="ck">2</span><div><b>Link it to a Facebook Page</b><div class="small muted">Instagram only lets apps look up creators through an account that is linked to a Page.</div></div></li>' +
      '<li><span class="ck">3</span><div><b>Tick that Page when Facebook asks</b><div class="small muted">We only read public numbers about the creators you look up. We never post anything or read your messages.</div></div></li>' +
      '<li><span class="ck">4</span><div><b>One account, one company</b><div class="small muted">An Instagram account can be active in only one company on My Creator Desk at a time.</div></div></li>' +
    '</ul></div>');
  var cn = function(){ connectInstagram(); };
  var b1 = $('ig-connect'); if (b1) b1.onclick = cn;
  qsa('[data-connect2],[data-reconnect]').forEach(function(b){ b.onclick = cn; });
  qsa('[data-pick]').forEach(function(b){ b.onclick = function(){ connectInstagram(b.dataset.pick); }; });
  qsa('[data-test]').forEach(function(b){ b.onclick = function(){ busy(b, true, 'Testing…');
    api('ig.test', {companyId: c.id, connectionId: b.dataset.test}).then(function(r){ toast(r.message, !r.ok); return loadWork().then(function(){ renderShell('instagram', renderInstagram); }); }).catch(function(e){ busy(b, false); toast(e.message, true); }); }; });
  qsa('[data-disc]').forEach(function(b){ b.onclick = function(){ armOnce(b, 'Click again to disconnect', function(){ busy(b, true, 'Disconnecting…');
    api('ig.disconnect', {companyId: c.id, connectionId: b.dataset.disc}).then(function(){ toast('Instagram disconnected'); return loadMe().then(loadWork).then(function(){ renderShell('instagram', renderInstagram); }); }).catch(function(e){ busy(b, false); toast(e.message, true); }); }); }; });
}

/* ================= billing ================= */
function renderBilling(){
  loadingBody();
  var c = co();
  api('billing.history', {companyId: c.id}).then(function(d){
    if (CURRENT !== 'billing') return;
    var p = plans().find(function(x){ return x.id === c.plan_id; }) || {};
    var amt = cyclePrice(p, c.billing_cycle);
    var days = c.current_period_end ? Math.ceil((new Date(c.current_period_end) - Date.now()) / 864e5) : null;
    var pays = d.payments || [];
    body(pageHead('Billing', 'Your plan, when it renews and every payment. Renewing the same plan extends your period straight away; a plan change is switched on once we approve it.') +
      '<div class="panel"><div class="spread" style="align-items:center"><div class="stack" style="gap:4px"><span class="small muted">Current plan</span><span style="font-family:var(--f-display);font-size:30px;font-weight:700;letter-spacing:-.02em">' + esc(planName(c.plan_id)) + '</span>' +
        '<span class="row" style="gap:6px"><span class="chip ' + (coState(c) === 'active' ? 'good' : 'warn') + '">' + esc(statusLabel(c)) + '</span><span class="chip neutral">' + cycleInfo(c.billing_cycle).adj + '</span>' + (amt ? '<span class="chip neutral">' + paise(amt) + ' ' + cycleInfo(c.billing_cycle).per + '</span>' : '') + '</span></div>' +
        '<div class="btns"><a class="btn primary lg" href="#/plan">' + (coState(c) === 'active' ? 'Renew or change plan' : 'Renew plan') + '</a></div></div>' +
        '<div class="ledger">' + stat('Paid until', c.current_period_end ? niceDay(c.current_period_end) : '—', days == null ? '' : days >= 0 ? plural(days, 'day') + ' left' : 'ended ' + plural(-days, 'day') + ' ago') +
          stat('Instagram accounts', c.ig_accounts + ' of ' + c.ig_account_limit, 'connected') + stat('Team seats', c.members + ' of ' + c.seat_limit, 'people in the team') + '</div></div>' +
      '<div class="stack" style="gap:10px"><h3>Payments</h3>' + (pays.length ? '<div class="tbl"><table><thead><tr><th>Date</th><th>Plan</th><th class="n">Amount</th><th>Status</th><th>Payment id</th></tr></thead><tbody>' +
        pays.map(function(x){ var st = x.status === 'paid' ? '<span class="chip good">Paid</span>' : x.status === 'failed' ? '<span class="chip bad">Failed</span>' : '<span class="chip neutral">Not completed</span>';
          return '<tr><td>' + niceDay(x.paid_at || x.created_at) + '</td><td>' + esc(planName(x.plan_id)) + ', ' + cycleInfo(x.billing_cycle).label.toLowerCase() + '</td><td class="n"><strong>' + paise(x.amount_paise) + '</strong></td><td>' + st + '</td><td class="small muted">' + esc(x.razorpay_payment_id || '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small">No payments yet.</p>') +
        '<p class="tiny muted">Need a GST invoice? Add your legal name and GSTIN in <a href="#/company">Company details</a>' + (CFG.SUPPORT_EMAIL ? ' and write to <a href="mailto:' + esc(CFG.SUPPORT_EMAIL) + '">' + esc(CFG.SUPPORT_EMAIL) + '</a>' : '') + '.</p></div>');
  }).catch(function(e){ errorBody(e, renderBilling); });
}

/* ================= company details ================= */
function renderCompanyDetails(){
  loadingBody();
  var cc = co();
  api('company.get', {companyId: cc.id}).then(function(d){
    if (CURRENT !== 'company') return;
    var c = d.company;
    body(pageHead('Company details', 'Shown to your team and used on invoices.') +
      '<div class="panel" style="max-width:720px"><form class="form cols-2" id="cd-form" novalidate>' +
        '<label class="field full">Company or brand name<input id="cdf-name" maxlength="120" value="' + esc(c.name) + '"></label>' +
        '<label class="field full">Legal name <span class="hint">Optional</span><input id="cdf-legal" maxlength="200" value="' + esc(c.legal_name || '') + '"></label>' +
        '<label class="field">GSTIN <span class="hint">Optional</span><input id="cdf-gst" maxlength="15" style="text-transform:uppercase" value="' + esc(c.gstin || '') + '"></label>' +
        '<label class="field">Phone <span class="hint">Optional</span><input id="cdf-phone" type="tel" maxlength="20" value="' + esc(c.phone || '') + '"></label>' +
        '<button class="btn primary" id="cdf-btn" type="submit">Save changes</button></form></div>' +
      '<p class="tiny muted">Company created ' + niceDay(c.created_at) + (c.approved_at ? ', approved ' + niceDay(c.approved_at) : '') + '.</p>');
    $('cd-form').onsubmit = function(e){ e.preventDefault(); var btn = $('cdf-btn');
      var name = $('cdf-name').value.trim(), gst = $('cdf-gst').value.trim().toUpperCase(), phone = $('cdf-phone').value.trim();
      if (name.length < 2) { toast('Type your company name.', true); return; }
      if (gst && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gst)) { toast('A GSTIN has 15 characters and starts with 2 digits.', true); return; }
      if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) { toast('That phone number does not look right.', true); return; }
      busy(btn, true, 'Saving…');
      api('company.update', {companyId: c.id, name: name, legalName: $('cdf-legal').value.trim(), gstin: gst, phone: phone})
        .then(function(){ return loadMe(); }).then(function(){ toast('Company details saved'); renderShell('company', renderCompanyDetails); })
        .catch(function(err){ busy(btn, false); toast(err.message, true); }); };
  }).catch(function(e){ errorBody(e, renderCompanyDetails); });
}

/* ================= platform owner ================= */
var OWN = {list: null, filter: 'pending', q: ''};
function ownerPendingCount(){ return OWN.list ? OWN.list.filter(function(c){ return c.status === 'pending_approval'; }).length : 0; }
function renderOwner(){
  if (!OWN.list) { loadingBody(); api('platform.companies').then(function(d){ OWN.list = d.companies || []; if (!OWN.list.some(function(c){ return c.status === 'pending_approval'; }) && OWN.filter === 'pending') OWN.filter = 'all'; renderShell('owner', renderOwner); }).catch(function(e){ errorBody(e, renderOwner); }); return; }
  var L = OWN.list, plansById = {}; plans().forEach(function(p){ plansById[p.id] = p; });
  var cnt = function(s){ return L.filter(function(c){ return c.status === s; }).length; };
  var mrr = L.filter(function(c){ return c.status === 'active' && (!c.current_period_end || new Date(c.current_period_end) > Date.now()); }).reduce(function(a, c){ var p = plansById[c.plan_id] || {}; return a + (cyclePrice(p, c.billing_cycle) || 0) / cycleInfo(c.billing_cycle).months; }, 0);
  var F = {pending: function(c){ return c.status === 'pending_approval'; }, active: function(c){ return c.status === 'active'; }, unpaid: function(c){ return c.status === 'pending_payment'; }, stopped: function(c){ return c.status === 'suspended' || c.status === 'cancelled'; }, all: function(){ return true; }};
  var qq = OWN.q.trim().toLowerCase();
  var rows = L.filter(F[OWN.filter]).filter(function(c){ return !qq || (c.name + ' ' + c.owner_email).toLowerCase().indexOf(qq) >= 0; });
  var stChip = function(c){ var m = {pending_approval: ['gold', 'Needs approval'], active: [c.current_period_end && new Date(c.current_period_end) < Date.now() ? 'warn' : 'good', c.current_period_end && new Date(c.current_period_end) < Date.now() ? 'Plan ended' : 'Active'], pending_payment: ['neutral', 'Not paid'], suspended: ['bad', 'Suspended'], cancelled: ['bad', 'Cancelled']}[c.status] || ['neutral', c.status]; return '<span class="chip ' + m[0] + '">' + m[1] + '</span>'; };
  body(pageHead('Platform panel', 'Every company on My Creator Desk. Approve paid companies, adjust limits, and suspend if needed. You never see a company’s creators or campaigns.', '<button class="btn" id="own-reload">' + icon('refresh', 16) + 'Refresh</button>') +
    '<div class="ledger">' + stat('Waiting for approval', cnt('pending_approval'), cnt('pending_approval') ? '<span style="color:var(--gold-ink)">needs you</span>' : 'all clear') + stat('Active companies', cnt('active'), (function(n){ return n + (n === 1 ? ' person' : ' people'); })(L.filter(function(c){ return c.status === 'active'; }).reduce(function(a, c){ return a + (+c.members || 0); }, 0)) + ' using the desk') +
      stat('Monthly revenue', rShort(mrr / 100), 'longer plans counted per month') + stat('Not paid yet', cnt('pending_payment'), 'signed up, no payment') + '</div>' +
    '<div class="spread" style="align-items:center"><div class="tabs" role="tablist" style="border:none">' + [['pending', 'Needs approval', cnt('pending_approval')], ['active', 'Active', cnt('active')], ['unpaid', 'Not paid', cnt('pending_payment')], ['stopped', 'Suspended or cancelled', cnt('suspended') + cnt('cancelled')], ['all', 'All', L.length]]
      .map(function(t){ return '<button role="tab" data-of="' + t[0] + '" aria-selected="' + (OWN.filter === t[0]) + '">' + t[1] + ' <span class="count">' + t[2] + '</span></button>'; }).join('') + '</div>' +
      '<input id="own-q" type="search" placeholder="Search company or email" value="' + esc(OWN.q) + '" style="max-width:280px"></div>' +
    (rows.length ? '<div class="tbl"><table><thead><tr><th>Company</th><th>Status</th><th>Plan</th><th class="n">Last payment</th><th class="n">Seats</th><th class="n">Instagram</th><th class="n">Lookups 30d</th><th>Paid until</th><th></th></tr></thead><tbody>' +
      rows.map(function(c){ return '<tr><td style="white-space:normal;min-width:180px"><div class="cname">' + esc(c.name) + '</div><div class="csub">' + esc(c.owner_email) + '</div><div class="csub">Joined ' + niceDay(c.created_at) + '</div></td><td>' + stChip(c) + '</td>' +
        '<td>' + esc(planName(c.plan_id)) + (c.billing_cycle ? '<div class="csub">' + cycleInfo(c.billing_cycle).label + '</div>' : '') + '</td>' +
        '<td class="n">' + (c.last_payment_paise ? paise(c.last_payment_paise) + '<div class="csub">' + esc(c.last_payment_status || '') + '</div>' : '—') + '</td>' +
        '<td class="n">' + c.members + ' / ' + c.seat_limit + '</td><td class="n">' + c.ig_accounts + ' / ' + c.ig_account_limit + '</td><td class="n">' + n0(c.lookups_30d) + '</td><td class="small">' + (c.current_period_end ? niceDay(c.current_period_end) : '—') + '</td>' +
        '<td style="text-align:right"><div class="btns" style="justify-content:flex-end;flex-wrap:nowrap">' + (c.status === 'pending_approval' ? '<button class="btn gold sm" data-approve="' + esc(c.id) + '">Approve</button>' : '') + '<button class="btn sm" data-manage="' + esc(c.id) + '">Manage</button></div></td></tr>'; }).join('') + '</tbody></table></div>'
      : '<div class="empty"><strong>' + (OWN.filter === 'pending' ? 'Nothing waiting for approval' : 'No companies here') + '</strong><span>' + (OWN.filter === 'pending' ? 'New payments show up here.' : 'Try another tab or search.') + '</span></div>'));
  $('own-reload').onclick = function(){ OWN.list = null; renderOwner(); };
  qsa('[data-of]').forEach(function(b){ b.onclick = function(){ OWN.filter = b.dataset.of; renderOwner(); }; });
  var qi = $('own-q'); qi.oninput = function(){ OWN.q = qi.value; var pos = qi.selectionStart; renderOwner(); var n = $('own-q'); n.focus(); n.setSelectionRange(pos, pos); };
  qsa('[data-approve]').forEach(function(b){ b.onclick = function(){ ownerManage(b.dataset.approve, true); }; });
  qsa('[data-manage]').forEach(function(b){ b.onclick = function(){ ownerManage(b.dataset.manage, false); }; });
  var nav = document.querySelector('.side a.nl[href="#/owner"]'); if (nav) { var s = nav.querySelector('.cnt'); var n2 = ownerPendingCount(); if (n2) { if (!s) { s = document.createElement('span'); s.className = 'cnt gold'; nav.appendChild(s); } s.textContent = n2; } else if (s) s.remove(); }
}
function ownerManage(id, approveFirst){
  var c = OWN.list.find(function(x){ return x.id === id; }); if (!c) return;
  var pl = plans(), cur = pl.find(function(p){ return p.id === c.plan_id; }) || pl[0];
  var d = openDialog('<div class="spread"><div class="stack"><h3>' + esc(c.name) + '</h3><span class="small muted">' + esc(c.owner_email) + '</span></div><button class="x" data-close aria-label="Close">×</button></div>' +
    '<div class="panel flat tight"><b>' + (c.status === 'pending_approval' ? 'Approve the plan' : 'Approve, renew or change limits') + '</b>' +
      '<p class="tiny muted">Approving switches the company on and adds ' + '<span id="ap-cyc-word">' + cycleInfo(c.billing_cycle).span + '</span> to its paid period. Leave limits blank to use the plan’s own.</p>' +
      '<div class="form cols-2"><label class="field">Plan<select id="ap-plan">' + pl.map(function(p){ return '<option value="' + esc(p.id) + '"' + (p.id === (c.plan_id || cur.id) ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field">Billing period<select id="ap-cycle">' + CYCLES.map(function(y){ return '<option value="' + y.id + '"' + (y.id === cycleInfo(c.billing_cycle).id ? ' selected' : '') + '>' + y.label + '</option>'; }).join('') + '</select></label>' +
        '<label class="field">Team seats<input id="ap-seats" type="number" min="1" placeholder="Plan default"></label>' +
        '<label class="field">Instagram accounts<input id="ap-ig" type="number" min="0" placeholder="Plan default"></label></div>' +
      '<div class="btns"><button class="btn gold" id="ap-go">' + icon('check', 16) + (c.status === 'pending_approval' ? 'Approve company' : 'Approve and extend') + '</button></div></div>' +
    '<div class="panel flat tight"><b>Status</b><label class="field">Note to keep with the change <span class="hint">Optional</span><input id="st-note" maxlength="300" placeholder="Payment bounced, waiting for KYC…"></label>' +
      '<div class="btns">' + (c.status !== 'suspended' ? '<button class="btn danger sm" data-st="suspended">Suspend</button>' : '') + (c.status !== 'active' && c.plan_id ? '<button class="btn sm" data-st="active">Set active</button>' : '') + (c.status !== 'cancelled' ? '<button class="btn danger sm" data-st="cancelled">Cancel</button>' : '') + '</div></div>' +
    '<div class="stack"><b>Payments</b><div id="own-pays"><span class="small muted"><span class="spin"></span> Loading…</span></div></div>', '', {wide: true});
  $('ap-cycle').onchange = function(){ $('ap-cyc-word').textContent = cycleInfo(this.value).span; };
  $('ap-go').onclick = function(){ var b = this; busy(b, true, 'Approving…');
    api('platform.approve', {companyId: id, planId: $('ap-plan').value, cycle: $('ap-cycle').value, seatLimit: $('ap-seats').value, igLimit: $('ap-ig').value})
      .then(function(){ closeDialog(); toast(c.name + ' approved'); OWN.list = null; return loadMe(); }).then(function(){ renderOwner(); }).catch(function(e){ busy(b, false); toast(e.message, true); }); };
  qsa('[data-st]', d).forEach(function(b){ b.onclick = function(){ var go2 = function(){ busy(b, true, 'Saving…');
      api('platform.status', {companyId: id, status: b.dataset.st, note: $('st-note').value.trim()}).then(function(){ closeDialog(); toast(c.name + ' is now ' + b.dataset.st); OWN.list = null; return loadMe(); }).then(function(){ renderOwner(); }).catch(function(e){ busy(b, false); toast(e.message, true); }); };
    if (b.dataset.st === 'active') go2(); else armOnce(b, 'Click again', go2); }; });
  api('platform.payments', {companyId: id}).then(function(r){ var el = $('own-pays'); if (!el) return; var p = r.payments || [];
    el.innerHTML = p.length ? '<div class="tbl"><table><thead><tr><th>Date</th><th>Plan</th><th class="n">Amount</th><th>Status</th><th>Razorpay</th></tr></thead><tbody>' + p.map(function(x){ return '<tr><td class="small">' + niceDate(x.paid_at || x.created_at) + '</td><td>' + esc(planName(x.plan_id)) + ', ' + esc(cycleInfo(x.billing_cycle).label.toLowerCase()) + '</td><td class="n">' + paise(x.amount_paise) + '</td><td><span class="chip ' + (x.status === 'paid' ? 'good' : x.status === 'failed' ? 'bad' : 'neutral') + '">' + esc(x.status) + '</span></td><td class="tiny muted">' + esc(x.razorpay_payment_id || x.razorpay_order_id) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<span class="small muted">No payments.</span>';
  }).catch(function(e){ var el = $('own-pays'); if (el) el.textContent = e.message; });
  if (approveFirst) setTimeout(function(){ var g = $('ap-go'); if (g) g.focus(); }, 50);
}
