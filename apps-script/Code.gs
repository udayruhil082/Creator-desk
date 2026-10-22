/**
 * My Creator Desk — website + Google Sheet for influencer marketing.
 *
 * What it does
 *   • Creator lookup: type an Instagram handle, get followers, average likes,
 *     comments and views, engagement rate and tier (Instagram Business Discovery API).
 *   • Shortlist in the team's format (Category … 1 Month Ad Rights, plus Fee): followers, views,
 *     comments and likes come from Instagram; ER%, Engagement, CPV, CPE, Tier and Verdict are calculated.
 *     Add creators manually or paste rows straight from the team's sheet.
 *   • Campaign tracker: paste each campaign post link, the likes / comments / views
 *     are fetched automatically; add clicks and conversions to get CTR, CPC, CPA.
 *   • Manager summary: one-click text report.
 * All data is stored in this Google Sheet, so the whole team sees the same numbers.
 *
 * Setup (one time)
 *   1. Replace everything in Code.gs with this file. Add an HTML file named "Index"
 *      (File + → HTML) and paste the Index.html code into it. Save.
 *   2. Reload the sheet → Creator Tracker → Save access token (paste the 60-day token).
 *   3. Deploy → New deployment → type "Web app" → Execute as: Me →
 *      Who has access: Anyone → Deploy. The website (SITE_URL) calls this as a JSON API;
 *      every call carries a Google sign-in token, and each person gets their own spreadsheet.
 */

const API_VERSION = 'v26.0';
const DEFAULT_IG_ID = '17841470558993104'; // your own Instagram professional account ID
const POSTS_TO_READ = 12;   // recent posts averaged for a creator
const POSTS_FOR_BRANDS = 25; // recent captions checked for competitor and brand collabs
const POSTS_TO_SEARCH = 50; // recent posts searched to find a campaign post

const SHEET_NAME = 'Creators';
const POSTS_SHEET = 'Campaign posts';
const SETTINGS_SHEET = 'Campaign settings';

// Creators tab: the team's 21 columns in their order, then Fee and the columns this tool adds.
// kind: key = creator name/handle, text / num = typed by the team (or pasted), auto = from Instagram, calc = worked out here.
const CCOLS = [
  ['category', 'Category', 'text'],
  ['language', 'Language', 'text'],
  ['name', 'Name', 'key'],
  ['link', 'Link', 'text'],
  ['followers', 'Followers', 'auto'],
  ['ytLink', 'YT Link', 'text'],
  ['er', 'ER%', 'calc'],
  ['views', 'Average Views', 'auto'],
  ['sales', 'Sales Data', 'text'],
  ['age', 'Age Split 18-24', 'text'],
  ['reach', 'Average Reach', 'num'],
  ['comments', 'Average Comments', 'auto'],
  ['credibility', 'Audience Credibility', 'text'],
  ['sentiment', 'Sentiments & Comments', 'text'],
  ['engagement', 'Engagement', 'calc'],
  ['gender', 'Gender Split', 'text'],
  ['cpv', 'CPV', 'calc'],
  ['cpe', 'CPE', 'calc'],
  ['deliverables', 'Deliverables', 'text'],
  ['collab', 'Collab Reel + Story w link + Autodm', 'num'],
  ['adRights', '1 Month Ad Rights', 'num'],
  ['fee', 'Fee (₹)', 'num'],
  ['platform', 'Platform', 'text'],
  ['tier', 'Tier', 'calc'],
  ['posts', 'Posts', 'auto'],
  ['likes', 'Average Likes', 'auto'],
  ['verdict', 'Verdict', 'calc'],
  ['why', 'Why', 'calc'],
  ['updated', 'Last updated', 'auto'],
  ['status', 'Status', 'auto'],
  ['source', 'Source', 'auto'],
  ['competitors', 'Competitor mentions', 'auto'],
  ['collabs', 'Recent brand collabs', 'auto']
];
const HEADERS = CCOLS.map(function (c) { return c[1]; });
const C = {};
CCOLS.forEach(function (c, i) { C[c[0]] = i + 1; });
const TEAM_COLS = 22; // the team's 21 columns plus Fee: the order used for paste and CSV
// Fields the website may edit. Numbers from Instagram stay locked unless the creator was entered manually.
const EDITABLE = ['category', 'language', 'link', 'ytLink', 'sales', 'age', 'reach', 'credibility', 'sentiment',
  'gender', 'deliverables', 'collab', 'adRights', 'fee', 'platform'];
const MANUAL_NUMBERS = ['followers', 'views', 'comments', 'likes', 'posts', 'engagement'];
const NUMERIC = ['followers', 'views', 'reach', 'comments', 'engagement', 'collab', 'adRights', 'fee', 'posts', 'likes'];

const POST_HEADERS = [
  'Post ID', 'Creator handle', 'Post link', 'Fee (₹)', 'Views', 'Likes', 'Comments',
  'Media type', 'Posted on', 'Last updated', 'Status', 'Platform'
];
const PCOL = {
  id: 1, handle: 2, link: 3, fee: 4, views: 5, likes: 6, comments: 7,
  type: 8, posted: 9, updated: 10, status: 11, platform: 12
};
const PLATFORMS = ['Instagram', 'Instagram Story', 'YouTube', 'YouTube Shorts', 'Moj / Josh', 'Other'];

const SETTING_KEYS = [['name', 'Campaign name'], ['budget', 'Total budget (₹)'], ['start', 'Start date'], ['end', 'End date'], ['competitors', 'Competitor brands']];

// Engagement-rate rules of thumb by tier: [strong, okay] in %
const BENCH = { Nano: [4, 2], Micro: [3, 1.5], Macro: [2, 1], Mega: [1.5, 0.7] };

/* =========================================================
 * Website
 * ======================================================= */

// The old Apps Script page link now just points people to the website, which needs Google sign-in.
function doGet() {
  return ContentService.createTextOutput('My Creator Desk has moved to ' + SITE_URL + ' . Open that link and sign in with Google.');
}

/* =========================================================
 * Sign-in and per-user sheets
 * ======================================================= */

const SITE_URL = 'https://mycreatordesk.co.in';
const GOOGLE_CLIENT_ID = '655428813505-ftd9c22rvrduhe3udiv32j2gn69njqa6.apps.googleusercontent.com'; // OAuth web client used by "Sign in with Google"
const ADMIN_EMAIL = 'vanshikajuyal06@gmail.com'; // uses this spreadsheet; can see and block team members
const USERS_SHEET = 'Users';
const USER_HEADERS = ['Email', 'Name', 'Sheet URL', 'Sheet ID', 'Status', 'Joined', 'Last sign-in'];

let CURRENT_SS = null;   // the signed-in person's spreadsheet for this request
let CURRENT_USER = null;
function ss_() { return CURRENT_SS || SpreadsheetApp.getActive(); }
function mainSs_() { return SpreadsheetApp.getActive(); }

// JSON API for the hosted website. The page sends POST {fn, args, idToken} as text/plain;
// the answer is {ok, result} or {ok:false, error}.
const API_FUNCS = ['api_getState', 'api_lookup', 'api_saveCreator', 'api_setFee', 'api_removeCreator', 'api_clearCreators',
  'api_addCreatorManual', 'api_bulkCreators', 'api_refreshCreators', 'api_fillCreators', 'api_exportShortlist',
  'api_saveSettings', 'api_addPost', 'api_bulkPosts', 'api_updatePost', 'api_removePost', 'api_refreshPosts',
  'api_adminUsers', 'api_adminSetStatus', 'api_connectInstagram', 'api_disconnectInstagram', 'api_igStatus'];
const ADMIN_FUNCS = ['api_adminUsers', 'api_adminSetStatus'];

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { body = {}; }
  return ContentService.createTextOutput(JSON.stringify(handleApi_(body))).setMimeType(ContentService.MimeType.JSON);
}

function handleApi_(body) {
  const fn = String(body.fn || '');
  if (API_FUNCS.indexOf(fn) < 0) return { ok: false, error: 'Unknown action.' };
  try {
    const user = verifyUser_(body.idToken);
    const ctx = openUserSheet_(user);
    CURRENT_SS = ctx.ss;
    CURRENT_USER = { email: user.email, name: user.name, picture: user.picture, isAdmin: ctx.isAdmin };
    if (ADMIN_FUNCS.indexOf(fn) >= 0 && !ctx.isAdmin) return { ok: false, error: 'Only the admin can do that.' };
    return { ok: true, result: globalThis[fn].apply(null, Array.isArray(body.args) ? body.args : []) };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  } finally {
    CURRENT_SS = null; CURRENT_USER = null;
  }
}

// Checks the Google ID token from "Sign in with Google" and returns the person's email and name.
function verifyUser_(idToken) {
  if (!idToken) throw new Error('LOGIN_REQUIRED');
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(idToken))).slice(0, 40);
  let info = null;
  const hit = cache.get(key);
  if (hit) info = JSON.parse(hit);
  else {
    const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('LOGIN_EXPIRED');
    const t = JSON.parse(r.getContentText());
    const verified = t.email_verified === true || t.email_verified === 'true';
    if (t.aud !== GOOGLE_CLIENT_ID || !verified || !t.email) throw new Error('LOGIN_EXPIRED');
    info = { email: String(t.email).toLowerCase(), name: t.name || '', picture: t.picture || '', exp: Number(t.exp) || 0 };
    const ttl = Math.max(60, Math.min(21600, info.exp - Math.floor(Date.now() / 1000)));
    cache.put(key, JSON.stringify(info), ttl);
  }
  if (info.exp && info.exp * 1000 < Date.now()) throw new Error('LOGIN_EXPIRED');
  return info;
}

// Finds (or on first sign-in creates) the person's own spreadsheet.
function openUserSheet_(user) {
  const isAdmin = user.email === ADMIN_EMAIL;
  const users = usersSheet_();
  let row = findRow_(users, 1, user.email);
  if (row) {
    const r = users.getRange(row, 1, 1, USER_HEADERS.length).getValues()[0];
    if (String(r[4]).toLowerCase() === 'blocked') throw new Error('ACCESS_BLOCKED');
    touchLogin_(users, row, user);
    if (isAdmin) return { ss: mainSs_(), isAdmin: true };
    return { ss: SpreadsheetApp.openById(String(r[3])), isAdmin: false };
  }
  if (isAdmin) {
    users.appendRow([user.email, user.name, mainSs_().getUrl(), mainSs_().getId(), 'active', new Date(), new Date()]);
    return { ss: mainSs_(), isAdmin: true };
  }
  return withLock_(function () {
    row = findRow_(users, 1, user.email); // another request may have just created it
    if (row) return { ss: SpreadsheetApp.openById(String(users.getRange(row, 4).getValue())), isAdmin: false };
    const ss = SpreadsheetApp.create('My Creator Desk · ' + (user.name || user.email));
    CURRENT_SS = ss;
    ensureSheets_();
    const first = ss.getSheetByName('Sheet1');
    if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
    try { ss.addEditor(user.email); } catch (e) { /* the sheet still works through the website */ }
    users.appendRow([user.email, user.name, ss.getUrl(), ss.getId(), 'active', new Date(), new Date()]);
    return { ss: ss, isAdmin: false };
  });
}

function touchLogin_(users, row, user) {
  const cache = CacheService.getScriptCache();
  if (cache.get('seen_' + user.email)) return;
  if (user.name) users.getRange(row, 2).setValue(user.name);
  users.getRange(row, 7).setValue(new Date());
  cache.put('seen_' + user.email, '1', 1800);
}

function usersSheet_() {
  const ss = mainSs_();
  let sh = ss.getSheetByName(USERS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(USERS_SHEET);
    sh.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]);
    styleHeader_(sh, USER_HEADERS.length);
    sh.setColumnWidth(1, 220); sh.setColumnWidth(3, 300);
  }
  return sh;
}

function api_adminUsers() {
  const sh = usersSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, USER_HEADERS.length).getValues().filter(function (r) { return r[0]; }).map(function (r) {
    return { email: String(r[0]), name: String(r[1] || ''), sheetUrl: String(r[2] || ''), status: String(r[4] || 'active'),
      joined: dateStr_(r[5]), lastLogin: dateStr_(r[6]), isAdmin: String(r[0]).toLowerCase() === ADMIN_EMAIL };
  });
}

function api_adminSetStatus(email, status) {
  const e = String(email || '').trim().toLowerCase();
  if (e === ADMIN_EMAIL) throw new Error('The admin account cannot be blocked.');
  const st = status === 'blocked' ? 'blocked' : 'active';
  withLock_(function () {
    const sh = usersSheet_();
    const row = findRow_(sh, 1, e);
    if (!row) throw new Error('That person has not signed in yet.');
    sh.getRange(row, 5).setValue(st);
  });
  return api_adminUsers();
}

// Removes every creator from the signed-in person's shortlist.
function api_clearCreators() {
  withLock_(function () {
    const sh = sheet_(SHEET_NAME);
    const last = sh.getLastRow();
    if (last >= 2) sh.deleteRows(2, last - 1);
  });
  return buildState_();
}

// The website page itself, so the hosted copy can be refreshed from here.
function api_siteHtml() {
  return HtmlService.createHtmlOutputFromFile('Index').getContent();
}

// Optional: require a team access code on the hosted website. Run from the sheet menu.
function setTeamCode() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Team access code', 'Type a code your team will enter once on the website. Leave empty to remove it.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const v = res.getResponseText().trim();
  if (v) PropertiesService.getScriptProperties().setProperty('TEAM_CODE', v);
  else PropertiesService.getScriptProperties().deleteProperty('TEAM_CODE');
  ui.alert(v ? 'Access code saved.' : 'Access code removed. Anyone with the link can use the website.');
}

// Everything the website needs in one call.
function api_getState() {
  ensureSheets_();
  return buildState_();
}

function api_lookup(handleInput, fee) {
  const handle = cleanHandle_(handleInput);
  if (!handle) throw new Error('Type an Instagram handle, like itss.vanshikaaa');
  const token = requireToken_();
  const a = analyse_(fetchCreator_(handle, token));
  withLock_(function () {
    ensureSheets_();
    const sh = sheet_(SHEET_NAME);
    let row = findRow_(sh, C.name, handle);
    if (!row) { row = Math.max(sh.getLastRow(), 1) + 1; sh.getRange(row, C.name).setValue(handle); }
    const feeNum = num_(fee);
    if (feeNum) sh.getRange(row, C.fee).setValue(feeNum);
    setCells_(sh, row, { link: 'https://www.instagram.com/' + handle + '/', platform: 'Instagram', source: 'Instagram API' });
    writeCreatorStats_(sh, row, a);
    recomputeAll(sh);
  });
  return { state: buildState_(), handle: handle };
}

// Save the details the team types for one creator (category, language, prices, audience notes…).
function api_saveCreator(name, fields) {
  withLock_(function () {
    const sh = sheet_(SHEET_NAME);
    const row = findRow_(sh, C.name, String(name || '').trim());
    if (!row) throw new Error('Creator not found in the shortlist.');
    const manual = String(sh.getRange(row, C.source).getValue()) === 'Manual';
    const allowed = EDITABLE.concat(manual ? MANUAL_NUMBERS : []);
    const out = {};
    Object.keys(fields || {}).forEach(function (k) {
      if (allowed.indexOf(k) < 0) return;
      out[k] = NUMERIC.indexOf(k) >= 0 ? (num_(fields[k]) || '') : String(fields[k] == null ? '' : fields[k]).trim();
    });
    if (out.platform !== undefined && PLATFORMS.indexOf(out.platform) < 0) out.platform = 'Other';
    setCells_(sh, row, out);
    recomputeAll(sh);
  });
  return buildState_();
}

function api_setFee(name, fee) { return api_saveCreator(name, { fee: fee }); }

function api_removeCreator(name) {
  withLock_(function () {
    const sh = sheet_(SHEET_NAME);
    const row = findRow_(sh, C.name, String(name || '').trim());
    if (row) sh.deleteRow(row);
    recomputeAll(sh);
  });
  return buildState_();
}

// Add or update a creator without calling Instagram (YouTube, Moj, Stories, or numbers you already have).
function api_addCreatorManual(c) {
  withLock_(function () { ensureSheets_(); const sh = sheet_(SHEET_NAME); upsertCreator_(sh, c, true); recomputeAll(sh); });
  return buildState_();
}

// Rows pasted from the team's sheet, in the team's column order.
function api_bulkCreators(rows) {
  let n = 0;
  withLock_(function () {
    ensureSheets_();
    const sh = sheet_(SHEET_NAME);
    (rows || []).forEach(function (c) { if (upsertCreator_(sh, c, false)) n++; });
    recomputeAll(sh);
  });
  return { state: buildState_(), added: n };
}

// forceManual: true for the manual form. Pasted Instagram handles stay refreshable from Instagram.
function upsertCreator_(sh, c, forceManual) {
  c = c || {};
  let name = String(c.name || '').trim();
  const linkHandle = /instagram\.com\//i.test(String(c.link || '')) ? cleanHandle_(c.link) : '';
  if (/instagram\.com\//i.test(name) || /^@/.test(name)) name = cleanHandle_(name);
  if (!name && linkHandle) name = linkHandle;
  if (!name) return false;
  let platform = PLATFORMS.indexOf(c.platform) >= 0 ? c.platform : '';
  const handleLike = /^[a-z0-9._]{2,30}$/i.test(name);
  if (!platform) platform = (linkHandle || handleLike) ? 'Instagram' : 'Other';
  const igRefreshable = !forceManual && platform === 'Instagram' && (linkHandle || handleLike);
  if (igRefreshable && handleLike) name = name.toLowerCase();
  let row = findRow_(sh, C.name, name);
  const isNew = !row;
  if (isNew) row = Math.max(sh.getLastRow(), 1) + 1;
  const out = { name: name, platform: platform };
  CCOLS.forEach(function (col) {
    const k = col[0];
    if (k === 'name' || k === 'platform' || col[2] === 'calc' && k !== 'engagement') return;
    if (c[k] === undefined || c[k] === null || String(c[k]).trim() === '') return;
    out[k] = NUMERIC.indexOf(k) >= 0 ? (num_(c[k]) || '') : String(c[k]).trim();
  });
  // A pasted Engagement with no likes: keep likes consistent with it.
  if (!out.likes && num_(out.engagement)) out.likes = Math.max(0, num_(out.engagement) - (num_(out.comments) || 0)) || '';
  delete out.engagement;
  if (!out.link && platform === 'Instagram' && handleLike) out.link = 'https://www.instagram.com/' + name + '/';
  out.updated = new Date();
  out.source = igRefreshable ? 'Instagram API' : 'Manual';
  out.status = igRefreshable ? (isNew ? 'Added from paste. Use Refresh all from Instagram to fetch live numbers.' : 'Updated from paste') : 'Entered manually';
  setCells_(sh, row, out);
  return true;
}

function isApiRow_(sh, row) {
  const v = sh.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  const plat = String(v[C.platform - 1] || 'Instagram');
  return plat === 'Instagram' && String(v[C.source - 1]) !== 'Manual';
}

function api_refreshCreators() {
  const token = requireToken_();
  const list = getCompetitors_();
  const sh = sheet_(SHEET_NAME);
  const last = sh.getLastRow();
  const errors = [];
  if (last < 2) return { state: buildState_(), errors: errors };
  const data = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const todo = [];
  data.forEach(function (r, i) {
    const handle = cleanHandle_(r[C.name - 1]);
    const plat = String(r[C.platform - 1] || 'Instagram');
    if (handle && plat === 'Instagram' && String(r[C.source - 1]) !== 'Manual') todo.push({ row: i + 2, handle: handle, cur: r });
  });
  const got = fetchMany_(todo.map(function (t) { return t.handle; }), token);
  todo.forEach(function (t, k) {
    if (got[k].error) { sh.getRange(t.row, C.status).setValue('✗ ' + got[k].error); errors.push(t.handle + ': ' + got[k].error); return; }
    const a = analyse_(got[k].bd, list);
    writeCreatorStats_(sh, t.row, a, t.cur);
    setCells_(sh, t.row, { competitors: a.competitors, collabs: a.collabs });
  });
  recomputeAll(sh);
  return { state: buildState_(), errors: errors };
}

// Write several named cells of one row.
function setCells_(sh, row, obj) {
  Object.keys(obj).forEach(function (k) { if (C[k]) sh.getRange(row, C[k]).setValue(obj[k]); });
}

// Upload flow: fetch Instagram data for these creators but only fill cells that are empty.
// All handles in a batch are fetched from Instagram at the same time, then written in one go.
function api_fillCreators(names) {
  const token = requireToken_();
  const list = getCompetitors_();
  const results = [];
  const items = (names || []).map(function (raw) { const name = String(raw || '').trim(); return { name: name, handle: cleanHandle_(name) }; });
  const valid = items.filter(function (it) { return /^[a-z0-9._]{1,30}$/.test(it.handle); });
  const got = valid.length ? fetchMany_(valid.map(function (it) { return it.handle; }), token) : [];
  valid.forEach(function (it, k) { it.res = got[k]; });
  withLock_(function () {
    const sh = sheet_(SHEET_NAME);
    const last = sh.getLastRow();
    const data = last >= 2 ? sh.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];
    const index = {};
    data.forEach(function (r, i) { const k = String(r[C.name - 1]).replace(/^'/, '').trim().toLowerCase(); if (k && !index[k]) index[k] = i + 2; });
    let next = Math.max(last, 1) + 1;
    items.forEach(function (it) {
      let row = index[it.name.toLowerCase()] || index[it.handle];
      if (!it.res) {
        if (row) sh.getRange(row, C.status).setValue('Add the Instagram handle or profile link to fetch data');
        results.push({ name: it.name, ok: false, msg: 'Needs an Instagram handle, not a display name' }); return;
      }
      if (it.res.error) {
        if (row) sh.getRange(row, C.status).setValue('✗ ' + it.res.error);
        results.push({ name: it.name, ok: false, msg: it.res.error }); return;
      }
      const a = analyse_(it.res.bd, list);
      let cur;
      if (row && row - 2 < data.length) cur = data[row - 2];
      else {
        if (!row) { row = next++; index[it.handle] = row; sh.getRange(row, C.name).setValue(it.handle); }
        cur = HEADERS.map(function () { return ''; });
      }
      const blank = function (k) { const v = cur[C[k] - 1]; return v === '' || v === null; };
      const fill = {
        link: 'https://www.instagram.com/' + it.handle + '/', followers: a.followers, posts: a.posts,
        views: round_(a.avgViews, 0), comments: round_(a.avgComments, 0), likes: round_(a.avgLikes, 0)
      };
      const auto = autoDetails_(a);
      Object.keys(auto).forEach(function (k) { fill[k] = auto[k]; });
      const out = {};
      Object.keys(fill).forEach(function (k) { if (blank(k) && fill[k] !== '' && fill[k] != null) out[k] = fill[k]; });
      if (blank('platform')) out.platform = 'Instagram';
      if (blank('source') || cur[C.source - 1] === 'Manual') out.source = 'Instagram API';
      out.competitors = a.competitors; out.collabs = a.collabs; out.updated = new Date();
      out.status = '✓ Filled from Instagram (last ' + a.sampled + ' posts)' + (a.hiddenLikes ? '. Some posts hide likes.' : '');
      setCells_(sh, row, out);
      results.push({ name: it.name, ok: true, msg: 'Filled' });
    });
    recomputeAll(sh);
  });
  return { results: results };
}

// Make a new Google Sheet with the selected creators, in the team's format, and share it.
function api_exportShortlist(names, title, email, access) {
  const want = (names || []).map(function (n) { return String(n).trim().toLowerCase(); });
  if (!want.length) throw new Error('Select at least one creator.');
  const sh = sheet_(SHEET_NAME);
  const last = sh.getLastRow();
  const vals = last >= 2 ? sh.getRange(2, 1, last - 1, HEADERS.length).getDisplayValues() : [];
  const keys = CCOLS.slice(0, TEAM_COLS).map(function (c) { return c[0]; }).concat(['platform', 'tier', 'verdict', 'why', 'competitors', 'collabs']);
  const head = keys.map(function (k) { return HEADERS[C[k] - 1]; });
  const rows = vals.filter(function (r) { return want.indexOf(String(r[C.name - 1]).trim().toLowerCase()) >= 0; })
    .map(function (r) { return keys.map(function (k) { return r[C[k] - 1]; }); });
  if (!rows.length) throw new Error('None of the selected creators were found in the shortlist.');
  const name = String(title || '').trim() || 'Creator shortlist ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM yyyy');
  const out = SpreadsheetApp.create(name);
  const tab = out.getSheets()[0];
  tab.setName('Shortlist');
  if (tab.getMaxColumns() < head.length) tab.insertColumnsAfter(tab.getMaxColumns(), head.length - tab.getMaxColumns());
  tab.getRange(1, 1, 1, head.length).setValues([head]);
  tab.getRange(2, 1, rows.length, head.length).setValues(rows);
  styleHeader_(tab, head.length);
  tab.setFrozenColumns(3);
  tab.getRange(2, 1, rows.length, head.length).setVerticalAlignment('top');
  head.forEach(function (h, i) { tab.setColumnWidth(i + 1, /Sentiments|Deliverables|Why|Competitor|collabs|Link/.test(h) ? 220 : 120); });
  let shared = '';
  const em = String(email || '').trim();
  if (em) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error('That email address does not look right.');
    if (access === 'edit') out.addEditor(em); else out.addViewer(em);
    shared = em;
  }
  return { url: out.getUrl(), name: name, count: rows.length, shared: shared };
}

// Run this once from the Apps Script editor after updating the code, so Google asks for any new permissions.
function setupPermissions() {
  ensureSheets_();
  return 'Permissions OK';
}

function api_saveSettings(s) {
  withLock_(function () {
    ensureSheets_();
    const sh = sheet_(SETTINGS_SHEET);
    SETTING_KEYS.forEach(function (k, i) {
      if (!s || s[k[0]] === undefined) return; // only save what was sent
      let v = s[k[0]] != null ? s[k[0]] : '';
      if (k[0] === 'budget') v = num_(v) || '';
      if ((k[0] === 'start' || k[0] === 'end') && v) v = "'" + String(v).slice(0, 10); // keep yyyy-mm-dd as text
      sh.getRange(i + 2, 2).setValue(v);
    });
  });
  return buildState_();
}

function api_addPost(p) {
  p = p || {};
  const platform = PLATFORMS.indexOf(p.platform) >= 0 ? p.platform : 'Instagram';
  const code = shortcode_(p.link);
  const isIg = !!code && platform.indexOf('Instagram') === 0 && platform !== 'Instagram Story';
  let handle = isIg ? cleanHandle_(p.handle) : String(p.handle || '').trim();
  if (!handle) throw new Error('Add the creator’s name or Instagram handle.');
  if (!isIg && !num_(p.views)) throw new Error('For posts without an Instagram post link, type the views yourself.');
  let found = null, status = 'Entered manually', pv = null;
  if (isIg) {
    try {
      const bd = discovery_(handle, requireToken_(), POSTS_TO_SEARCH);
      found = matchPost_((bd.media && bd.media.data) || [], code);
      if (found) pv = postViews_(found, bd);
      status = found ? (pv && pv.est ? '✓ Likes and comments from Instagram. Views estimated (Instagram doesn’t share views for photo posts).' : '✓ Numbers fetched from Instagram') :
        'Post not found in the creator’s last ' + POSTS_TO_SEARCH + ' posts. Type the numbers yourself.';
    } catch (e) { status = '✗ ' + e.message; }
  }
  const id = code || newId_();
  withLock_(function () {
    ensureSheets_();
    const sh = sheet_(POSTS_SHEET);
    let row = findRow_(sh, PCOL.id, id);
    if (!row) { row = Math.max(sh.getLastRow(), 1) + 1; }
    const existing = row <= sh.getLastRow() ? sh.getRange(row, 1, 1, POST_HEADERS.length).getValues()[0] : [];
    const keep = function (c, v) { return v !== undefined && v !== null && v !== '' ? v : (existing[c - 1] || ''); };
    const link = found && found.permalink ? found.permalink : (code ? 'https://www.instagram.com/p/' + code + '/' : String(p.link || ''));
    const values = [
      "'" + id, handle, link,
      keep(PCOL.fee, num_(p.fee)),
      found ? (num_(p.views) || pv.views) : keep(PCOL.views, num_(p.views)),
      found ? (found.like_count != null ? found.like_count : '') : keep(PCOL.likes, num_(p.likes)),
      found ? (found.comments_count != null ? found.comments_count : '') : keep(PCOL.comments, num_(p.comments)),
      found ? (found.media_product_type || found.media_type || '') : (existing[PCOL.type - 1] || ''),
      found && found.timestamp ? new Date(found.timestamp) : (existing[PCOL.posted - 1] || new Date()),
      new Date(), status, platform
    ];
    sh.getRange(row, 1, 1, values.length).setValues([values]);
  });
  return { state: buildState_(), status: status };
}

// Rows pasted from Excel / Sheets. No Instagram calls; use Refresh afterwards for Instagram links.
function api_bulkPosts(rows) {
  let n = 0;
  withLock_(function () {
    ensureSheets_();
    const sh = sheet_(POSTS_SHEET);
    (rows || []).forEach(function (p) {
      const handle = String(p.handle || '').trim();
      if (!handle) return;
      const code = shortcode_(p.link);
      const id = code || newId_();
      let row = findRow_(sh, PCOL.id, id);
      if (!row) row = Math.max(sh.getLastRow(), 1) + 1;
      const platform = PLATFORMS.indexOf(p.platform) >= 0 ? p.platform : (code ? 'Instagram' : 'Other');
      sh.getRange(row, 1, 1, POST_HEADERS.length).setValues([[
        "'" + id, code ? cleanHandle_(handle) : handle, code ? 'https://www.instagram.com/p/' + code + '/' : String(p.link || ''),
        num_(p.fee) || '', num_(p.views) || '', num_(p.likes) || '', num_(p.comments) || '',
        '', new Date(), new Date(), 'Imported from paste' + (code ? '. Use Refresh to fetch Instagram numbers.' : ''), platform
      ]]);
      n++;
    });
  });
  return { state: buildState_(), added: n };
}

function newId_() {
  return 'M' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase();
}

function api_updatePost(id, fields) {
  const allowed = ['fee', 'views', 'likes', 'comments'];
  withLock_(function () {
    const sh = sheet_(POSTS_SHEET);
    const row = findRow_(sh, PCOL.id, String(id));
    if (!row) throw new Error('Post not found.');
    Object.keys(fields || {}).forEach(function (k) {
      if (allowed.indexOf(k) < 0) return;
      sh.getRange(row, PCOL[k]).setValue(num_(fields[k]) || '');
    });
    sh.getRange(row, PCOL.updated).setValue(new Date());
  });
  return buildState_();
}

function api_removePost(id) {
  withLock_(function () {
    const sh = sheet_(POSTS_SHEET);
    const row = findRow_(sh, PCOL.id, String(id));
    if (row) sh.deleteRow(row);
  });
  return buildState_();
}

function api_refreshPosts() {
  const token = requireToken_();
  const sh = sheet_(POSTS_SHEET);
  const last = sh.getLastRow();
  const errors = [];
  const cache = {};
  for (let row = 2; row <= last; row++) {
    const r = sh.getRange(row, 1, 1, POST_HEADERS.length).getValues()[0];
    const code = shortcode_(r[PCOL.link - 1]);
    const handle = cleanHandle_(r[PCOL.handle - 1]);
    const plat = String(r[PCOL.platform - 1] || 'Instagram');
    if (!code || !handle || plat.indexOf('Instagram') !== 0 || plat === 'Instagram Story') continue;
    try {
      if (!cache[handle]) cache[handle] = discovery_(handle, token, POSTS_TO_SEARCH);
      const m = matchPost_((cache[handle].media && cache[handle].media.data) || [], code);
      if (m) {
        const pv = postViews_(m, cache[handle]);
        const views = pv.est && num_(r[PCOL.views - 1]) && String(r[PCOL.status - 1]).indexOf('estimated') < 0 ? num_(r[PCOL.views - 1]) : pv.views;
        sh.getRange(row, PCOL.views, 1, 3).setValues([[views, m.like_count != null ? m.like_count : '', m.comments_count != null ? m.comments_count : '']]);
        sh.getRange(row, PCOL.updated, 1, 2).setValues([[new Date(), pv.est && views === pv.views ? '✓ Likes and comments from Instagram. Views estimated (Instagram doesn’t share views for photo posts).' : '✓ Numbers fetched from Instagram']]);
      } else {
        sh.getRange(row, PCOL.status).setValue('Post not found in the last ' + POSTS_TO_SEARCH + ' posts. Numbers kept as they were.');
      }
    } catch (e) {
      sh.getRange(row, PCOL.status).setValue('✗ ' + e.message);
      errors.push(handle + ': ' + e.message);
    }
    Utilities.sleep(300);
  }
  return { state: buildState_(), errors: errors };
}

/* ---------- state ---------- */

function buildState_() {
  const ss = ss_();
  const tokenOk = !!(ownConnection_() || PropertiesService.getScriptProperties().getProperty('IG_TOKEN'));

  const creators = [];
  const csh = ss.getSheetByName(SHEET_NAME);
  if (csh && csh.getLastRow() >= 2) {
    csh.getRange(2, 1, csh.getLastRow() - 1, HEADERS.length).getValues().forEach(function (r) {
      const name = String(r[C.name - 1] || '').trim();
      if (!name) return;
      const o = {};
      CCOLS.forEach(function (col, i) {
        const k = col[0], v = r[i];
        if (k === 'updated') o[k] = dateStr_(v);
        else if (NUMERIC.indexOf(k) >= 0 || k === 'er' || k === 'cpv' || k === 'cpe') o[k] = num_(v);
        else o[k] = v instanceof Date ? dateStr_(v) : String(v == null ? '' : v);
      });
      o.platform = o.platform || 'Instagram';
      o.source = o.source || 'Instagram API';
      creators.push(o);
    });
  }

  const posts = [];
  const psh = ss.getSheetByName(POSTS_SHEET);
  if (psh && psh.getLastRow() >= 2) {
    psh.getRange(2, 1, psh.getLastRow() - 1, POST_HEADERS.length).getValues().forEach(function (r) {
      const id = String(r[PCOL.id - 1] || '').replace(/^'/, '');
      if (!id) return;
      posts.push({
        id: id, handle: String(r[PCOL.handle - 1] || ''), link: String(r[PCOL.link - 1] || ''),
        fee: num_(r[PCOL.fee - 1]), views: num_(r[PCOL.views - 1]), likes: num_(r[PCOL.likes - 1]),
        comments: num_(r[PCOL.comments - 1]), type: String(r[PCOL.type - 1] || ''),
        posted: dateStr_(r[PCOL.posted - 1]), updated: dateStr_(r[PCOL.updated - 1]), status: String(r[PCOL.status - 1] || ''),
        platform: String(r[PCOL.platform - 1] || 'Instagram')
      });
    });
  }

  const settings = { name: '', budget: null, start: '', end: '', competitors: '' };
  const ssh = ss.getSheetByName(SETTINGS_SHEET);
  if (ssh) {
    const v = ssh.getRange(2, 2, SETTING_KEYS.length, 1).getValues();
    SETTING_KEYS.forEach(function (k, i) {
      let val = v[i][0];
      if (k[0] === 'budget') val = num_(val);
      else if (val instanceof Date) val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      else val = String(val || '').replace(/^'/, '');
      settings[k[0]] = val;
    });
  }

  if (!settings.competitors) settings.competitors = DEFAULT_COMPETITORS;
  return { live: true, tokenOk: tokenOk, sheetUrl: ss.getUrl(), creators: creators, posts: posts, settings: settings,
    ig: api_igStatus(),
    user: CURRENT_USER ? { email: CURRENT_USER.email, name: CURRENT_USER.name, picture: CURRENT_USER.picture, isAdmin: CURRENT_USER.isAdmin } : null };
}

/* =========================================================
 * Sheet menu (still works from the spreadsheet)
 * ======================================================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Creator Tracker')
    .addItem('Fetch data for all creators', 'fetchAll')
    .addItem('Fetch data for selected rows', 'fetchSelected')
    .addItem('Refresh campaign post numbers', 'menuRefreshPosts')
    .addSeparator()
    .addItem('Set up sheet', 'setupSheet')
    .addItem('Save access token', 'saveToken')
    .addItem('Change Instagram ID', 'saveIgId')
    .addItem('Set team access code', 'setTeamCode')
    .addToUi();
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== SHEET_NAME || e.range.getRow() < 2) return;
  recomputeAll(sh);
}

function setupSheet() {
  ensureSheets_();
  SpreadsheetApp.getUi().alert('Sheet is ready.\n\nNext: Creator Tracker → Save access token.');
}

function saveToken() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Save access token',
    'Paste your 60-day Instagram access token. It is stored privately in this script, not in the sheet.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const token = res.getResponseText().trim();
  if (token.length < 50) { ui.alert('That does not look like a full token. Copy it again and retry.'); return; }
  PropertiesService.getScriptProperties().setProperty('IG_TOKEN', token);
  ui.alert('Token saved. You can now fetch creator data.');
}

function saveIgId() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Change Instagram ID',
    'Current ID: ' + getIgId() + '\nPaste a new Instagram professional account ID, or Cancel to keep it.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const id = res.getResponseText().trim();
  if (!/^\d{8,}$/.test(id)) { ui.alert('The ID should be a long number, like 17841470558993104.'); return; }
  PropertiesService.getScriptProperties().setProperty('IG_ID', id);
  ui.alert('Instagram ID saved.');
}

function fetchAll() {
  const sh = sheet_(SHEET_NAME);
  const last = sh.getLastRow();
  if (last < 2) { SpreadsheetApp.getUi().alert('Add at least one Instagram handle in the Name column.'); return; }
  fetchRows_(sh, range_(2, last));
}

function fetchSelected() {
  const sh = sheet_(SHEET_NAME);
  const sel = sh.getActiveRange();
  if (!sel) return;
  const start = Math.max(2, sel.getRow()), end = sel.getLastRow();
  if (end < 2) { SpreadsheetApp.getUi().alert('Select one or more creator rows (row 2 or below).'); return; }
  fetchRows_(sh, range_(start, end));
}

function menuRefreshPosts() {
  const r = api_refreshPosts();
  ss_().toast(r.errors.length ? r.errors.length + ' posts failed, see Status column.' : 'Campaign post numbers updated.', 'Creator Tracker', 6);
}

function fetchRows_(sh, rowNumbers) {
  const token = PropertiesService.getScriptProperties().getProperty('IG_TOKEN');
  if (!token) { SpreadsheetApp.getUi().alert('Access token missing. Use Creator Tracker → Save access token first.'); return; }
  let done = 0, failed = 0;
  rowNumbers.forEach(function (row) {
    if (!isApiRow_(sh, row)) return;
    const raw = sh.getRange(row, C.name).getValue();
    const handle = cleanHandle_(raw);
    if (!handle) return;
    if (handle !== String(raw).trim()) sh.getRange(row, C.name).setValue(handle);
    if (!sh.getRange(row, C.link).getValue()) sh.getRange(row, C.link).setValue('https://www.instagram.com/' + handle + '/');
    sh.getRange(row, C.status).setValue('Fetching…');
    SpreadsheetApp.flush();
    try { writeCreatorStats_(sh, row, analyse_(fetchCreator_(handle, token))); done++; }
    catch (err) { sh.getRange(row, C.status).setValue('✗ ' + err.message); failed++; }
    Utilities.sleep(400);
  });
  recomputeAll(sh);
  ss_().toast(done + ' updated' + (failed ? ', ' + failed + ' failed (see Status column)' : '') + '.', 'Creator Tracker', 6);
}

/* =========================================================
 * Instagram API
 * ======================================================= */

// Each person can connect their own Instagram professional account ("Connect Instagram" on the website).
// Lookups then use their own connection and their own Meta limits; otherwise the team connection is used.
function ownConnection_() {
  if (!CURRENT_USER || !CURRENT_USER.email) return null;
  const raw = PropertiesService.getScriptProperties().getProperty('IGC_' + CURRENT_USER.email);
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

function getIgId() {
  const own = ownConnection_();
  if (own && own.igId) return own.igId;
  return PropertiesService.getScriptProperties().getProperty('IG_ID') || DEFAULT_IG_ID;
}

function requireToken_() {
  const own = ownConnection_();
  if (own && own.token) return own.token;
  const t = PropertiesService.getScriptProperties().getProperty('IG_TOKEN');
  if (!t) throw new Error('Instagram is not connected. Press Connect Instagram at the top of the page.');
  return t;
}

/* ---------- Connect Instagram (Facebook Login for Business) ---------- */

const FB_APP_ID = '1113383891047813';

function graphGet_(path, params) {
  const q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  const r = UrlFetchApp.fetch('https://graph.facebook.com/' + API_VERSION + '/' + path + '?' + q, { muteHttpExceptions: true });
  let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (e) { throw new Error('Unexpected answer from Facebook (HTTP ' + r.getResponseCode() + ').'); }
  if (j.error) throw new Error('Facebook says: ' + (j.error.message || 'unknown error'));
  return j;
}

// Called after Facebook sends the person back with ?code=…  Stores a Page token that does not expire.
function api_connectInstagram(code, redirectUri) {
  const secret = PropertiesService.getScriptProperties().getProperty('FB_APP_SECRET');
  if (!secret) throw new Error('The Facebook app secret is not set up yet (Apps Script → Project settings → Script properties → FB_APP_SECRET).');
  if (!code) throw new Error('Facebook did not return a login code. Try Connect Instagram again.');
  const short = graphGet_('oauth/access_token', { client_id: FB_APP_ID, client_secret: secret, redirect_uri: redirectUri, code: code });
  const long = graphGet_('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: FB_APP_ID, client_secret: secret, fb_exchange_token: short.access_token });
  const pages = graphGet_('me/accounts', { fields: 'name,access_token,instagram_business_account{id,username}', limit: 100, access_token: long.access_token });
  const withIg = (pages.data || []).filter(function (p) { return p.instagram_business_account && p.access_token; });
  if (!withIg.length) throw new Error('No Instagram professional account was found. Link your Instagram Business or Creator account to a Facebook Page, then try again, and tick that Page and Instagram account when Facebook asks.');
  const p = withIg[0];
  const conn = { token: p.access_token, igId: p.instagram_business_account.id, username: p.instagram_business_account.username || '', page: p.name || '', connected: new Date().toISOString() };
  PropertiesService.getScriptProperties().setProperty('IGC_' + CURRENT_USER.email, JSON.stringify(conn));
  return api_igStatus();
}

function api_disconnectInstagram() {
  if (CURRENT_USER && CURRENT_USER.email) PropertiesService.getScriptProperties().deleteProperty('IGC_' + CURRENT_USER.email);
  return api_igStatus();
}

function api_igStatus() {
  const own = ownConnection_();
  if (own) return { own: true, username: own.username, page: own.page, connected: own.connected };
  return { own: false, team: !!PropertiesService.getScriptProperties().getProperty('IG_TOKEN') };
}

function fetchCreator_(handle, token) {
  return discovery_(handle, token, POSTS_FOR_BRANDS);
}

function fetchMedia_(handle, token, limit) {
  const bd = discovery_(handle, token, limit);
  return (bd.media && bd.media.data) || [];
}

function discovery_(handle, token, limit) {
  const full = 'like_count,comments_count,view_count,media_type,media_product_type,timestamp,permalink,caption';
  const basic = 'like_count,comments_count,media_type,timestamp,permalink,caption';
  let res = callApi_(handle, full, token, limit);
  if (res.error && /view_count|media_product_type/i.test(res.error.message || '')) {
    res = callApi_(handle, basic, token, limit);
  }
  if (res.error) throw new Error(friendlyError_(res.error));
  if (!res.business_discovery) throw new Error('No data returned for this account.');
  return res.business_discovery;
}

const MEDIA_FULL = 'like_count,comments_count,view_count,media_type,media_product_type,timestamp,permalink,caption';
const MEDIA_BASIC = 'like_count,comments_count,media_type,timestamp,permalink,caption';

function apiUrl_(handle, mediaFields, token, limit) {
  const fields = 'business_discovery.username(' + handle + '){username,name,biography,website,profile_picture_url,followers_count,media_count,media.limit(' +
    limit + '){' + mediaFields + '}}';
  return 'https://graph.facebook.com/' + API_VERSION + '/' + getIgId() +
    '?fields=' + encodeURIComponent(fields) + '&access_token=' + encodeURIComponent(token);
}

// Fetches many creators at the same time (much faster than one by one).
// Returns one {bd} or {error} per handle, in the same order.
// Answers are kept for 30 minutes, so uploading the same sheet again does not use up Instagram's hourly limit.
function fetchMany_(handles, token) {
  const cache = CacheService.getScriptCache();
  const out = handles.map(function () { return null; });
  const need = [];
  handles.forEach(function (h, i) {
    let hit = null; try { hit = cache.get('bd_' + h); } catch (e) { }
    if (hit) out[i] = { bd: JSON.parse(hit) }; else need.push(i);
  });
  let limited = false;
  for (let s = 0; s < need.length; s += 10) {
    const part = need.slice(s, s + 10);
    if (limited) { part.forEach(function (i) { out[i] = { error: friendlyError_({ code: 4 }) }; }); continue; }
    const resps = UrlFetchApp.fetchAll(part.map(function (i) {
      return { url: apiUrl_(handles[i], MEDIA_FULL, token, POSTS_FOR_BRANDS), muteHttpExceptions: true };
    }));
    part.forEach(function (i, k) {
      const h = handles[i];
      let res;
      try { res = JSON.parse(resps[k].getContentText()); }
      catch (e) { res = { error: { message: 'Unexpected response from Instagram (HTTP ' + resps[k].getResponseCode() + ').' } }; }
      if (res.error && /view_count|media_product_type/i.test(res.error.message || '')) res = callApi_(h, MEDIA_BASIC, token, POSTS_FOR_BRANDS);
      if (res.error) {
        if ([4, 17, 32, 613].indexOf(res.error.code) >= 0) limited = true; // stop asking once Instagram says slow down
        out[i] = { error: friendlyError_(res.error) };
      } else if (!res.business_discovery) out[i] = { error: 'No data returned for this account.' };
      else {
        out[i] = { bd: res.business_discovery };
        try { cache.put('bd_' + h, JSON.stringify(res.business_discovery), 1800); } catch (e) { /* too big to cache */ }
      }
    });
  }
  return out;
}

function callApi_(handle, mediaFields, token, limit) {
  const r = UrlFetchApp.fetch(apiUrl_(handle, mediaFields, token, limit), { muteHttpExceptions: true });
  try { return JSON.parse(r.getContentText()); }
  catch (e) { return { error: { message: 'Unexpected response from Instagram (HTTP ' + r.getResponseCode() + ').' } }; }
}

function findPost_(handle, code, token) {
  return matchPost_(fetchMedia_(handle, token, POSTS_TO_SEARCH), code);
}

function matchPost_(media, code) {
  for (let i = 0; i < media.length; i++) {
    if (shortcode_(media[i].permalink) === code) return media[i];
  }
  return null;
}

function friendlyError_(e) {
  const code = e.code, sub = e.error_subcode, msg = e.message || 'Unknown error';
  if (code === 190) return 'Access token expired or invalid. Make a new 60-day token and use Save access token in the sheet.';
  if (code === 4 || code === 17 || code === 32 || code === 613) return 'Instagram’s hourly limit is used up. Wait about an hour, then press Refresh all from Instagram.';
  if (sub === 2207013 || /cannot find|invalid user id|does not exist/i.test(msg)) {
    return 'Account not found, or it is a personal account. Only Creator and Business accounts can be read. Check the handle.';
  }
  if (code === 10 || code === 200) return 'Permission missing. Regenerate the token with instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement and business_management. (Meta says: ' + msg + (sub ? ', subcode ' + sub : '') + ')';
  return msg;
}

/* =========================================================
 * Competitor and brand-collab detection (from public captions)
 * ======================================================= */

const DEFAULT_COMPETITORS = '';
// Known handles / hashtags and caption phrases, so short names like Lux or Pears don't match "luxury" or the fruit.
const BRAND_ALIASES = {
  'dove': { tags: ['dove', 'doveindia', 'dovebodywash', 'dovebeautybar'], phrase: /\bdove\b/ },
  'ghar soaps': { tags: ['gharsoaps', 'gharsoap', 'gharsoapsofficial', 'gharsoapsindia'], phrase: /\bghar\s?soaps?\b/ },
  'pears': { tags: ['pears', 'pearsindia', 'pearssoap'], phrase: /\bpears\s+(soap|body|india|bodywash|pure)\b/ },
  'lux': { tags: ['lux', 'luxindia', 'luxsoap', 'luxbodywash'], phrase: /\blux\s+(soap|body|india|bodywash)\b/ },
  'nivea': { tags: ['nivea', 'niveaindia', 'niveamen', 'niveamenindia'], phrase: /\bnivea\b/ },
  'palmolive': { tags: ['palmolive', 'palmoliveindia'], phrase: /\bpalmolive\b/ },
  'mamaearth': { tags: ['mamaearth', 'mamaearthindia', 'mamaearth.in'], phrase: /\bmamaearth\b/ },
  'plum': { tags: ['plumgoodness', 'plum_goodness', 'plumbodylovin', 'plumgoodnessindia'], phrase: /\bplum\s+(goodness|bodylovin|body lovin)\b/ },
  'the body shop': { tags: ['thebodyshop', 'thebodyshopindia', 'tbsindia'], phrase: /\bthe body shop\b/ },
  'bath & body works': { tags: ['bathandbodyworks', 'bathandbodyworksindia', 'bbwindia'], phrase: /\bbath\s*(&|and)\s*body\s*works\b/ },
  'dettol': { tags: ['dettol', 'dettolindia'], phrase: /\bdettol\b/ },
  'lifebuoy': { tags: ['lifebuoy', 'lifebuoyindia'], phrase: /\blifebuoy\b/ },
  'santoor': { tags: ['santoor', 'santoorsoap', 'santoorindia'], phrase: /\bsantoor\b/ },
  'cinthol': { tags: ['cinthol', 'cintholindia'], phrase: /\bcinthol\b/ },
  'medimix': { tags: ['medimix', 'medimixindia', 'medimixsoap'], phrase: /\bmedimix\b/ },
  'biotique': { tags: ['biotique', 'biotiqueindia'], phrase: /\bbiotique\b/ },
  'hamam': { tags: ['hamam', 'hamamindia', 'hamamsoap'], phrase: /\bhamam\b/ },
  'liril': { tags: ['liril', 'lirilindia', 'liril2000'], phrase: /\bliril\b/ }
};
const COLLAB_MARK = /(#(ad|ads|advert|advertisement|sponsored|collab|collaboration|partner|partnership|paidpartnership|paidpromotion|gifted|pr|brandpartner|brandcollab)\b)|paid partnership|in collaboration with|in association with|sponsored by|powered by|#ambassador/i;

function getCompetitors_() {
  const sh = ss_().getSheetByName(SETTINGS_SHEET);
  let v = '';
  if (sh) {
    const rows = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 2).getValues();
    rows.forEach(function (r) { if (String(r[0]) === 'Competitor brands') v = String(r[1] || ''); });
  }
  return v.trim() ? v : DEFAULT_COMPETITORS;
}

function brandMatchers_(listText) {
  return String(listText || '').split(/[,\n;]+/).map(function (s) { return s.trim(); }).filter(Boolean).map(function (name) {
    const key = name.toLowerCase();
    const known = BRAND_ALIASES[key];
    if (known) return { name: name, tags: known.tags, phrase: known.phrase };
    const base = key.replace(/[^a-z0-9]/g, '');
    const tags = [base, base + 'india', base + 'official', base + '_india', base + '.in', base + 'in'];
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    return { name: name, tags: tags, phrase: base.length >= 4 ? new RegExp('\\b' + esc + '\\b') : null };
  });
}

// posts: recent media with caption. Returns text for the two sheet columns.
function scanBrands_(posts, ownHandle, listText) {
  const matchers = brandMatchers_(listText);
  const hits = {};      // competitor name -> {n, paid, last}
  const collabs = {};   // @brand -> count, from posts marked as ads / collabs
  const own = String(ownHandle || '').toLowerCase();
  posts.forEach(function (p) {
    const cap = String(p.caption || '');
    if (!cap) return;
    const low = cap.toLowerCase();
    const paid = COLLAB_MARK.test(cap);
    const tokens = (low.match(/[@#][a-z0-9._]+/g) || []).map(function (t) { return t.slice(1).replace(/[._]+$/, ''); });
    matchers.forEach(function (m) {
      const tagHit = tokens.some(function (t) { return m.tags.indexOf(t) >= 0 || m.tags.indexOf(t.replace(/[._]/g, '')) >= 0; });
      const textHit = m.phrase ? m.phrase.test(low) : false;
      if (!tagHit && !textHit) return;
      const h = hits[m.name] || (hits[m.name] = { n: 0, paid: 0, last: null });
      h.n++; if (paid) h.paid++;
      const d = p.timestamp ? new Date(p.timestamp) : null;
      if (d && (!h.last || d > h.last)) h.last = d;
    });
    if (paid) {
      (cap.match(/@[A-Za-z0-9._]+/g) || []).forEach(function (m) {
        const t = m.replace(/[._]+$/, '');
        if (t.slice(1).toLowerCase() === own) return;
        collabs[t] = (collabs[t] || 0) + 1;
      });
    }
  });
  const comp = Object.keys(hits).sort(function (a, b) { return hits[b].n - hits[a].n; }).map(function (k) {
    const h = hits[k];
    return k + ' (' + h.n + ' post' + (h.n > 1 ? 's' : '') + (h.paid ? ', ' + h.paid + ' marked as ad/collab' : '') +
      (h.last ? ', latest ' + Utilities.formatDate(h.last, Session.getScriptTimeZone(), 'd MMM yyyy') : '') + ')';
  }).join('; ');
  const col = Object.keys(collabs).sort(function (a, b) { return collabs[b] - collabs[a]; }).slice(0, 8).join(', ');
  return { competitors: comp || 'None found', collabs: col || 'None found', checked: posts.length };
}

/* =========================================================
 * Analysis
 * ======================================================= */

function analyse_(bd, competitorList) {
  const all = (bd.media && bd.media.data) || [];
  const posts = all.slice(0, POSTS_TO_READ);
  const brands = scanBrands_(all, bd.username, competitorList || getCompetitors_());
  const isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  const withLikes = posts.filter(function (p) { return isNum(p.like_count); });
  const withComments = posts.filter(function (p) { return isNum(p.comments_count); });
  const withViews = posts.filter(function (p) { return isNum(p.view_count) && p.view_count > 0; });
  return {
    followers: bd.followers_count || 0, posts: bd.media_count || 0,
    sampled: posts.length, videos: withViews.length, hiddenLikes: posts.length - withLikes.length,
    avgLikes: avg_(withLikes.map(function (p) { return p.like_count; })),
    avgComments: avg_(withComments.map(function (p) { return p.comments_count; })),
    avgViews: avg_(withViews.map(function (p) { return p.view_count; })),
    competitors: brands.competitors, collabs: brands.collabs, captionsChecked: brands.checked,
    category: detectCategory_(bd, all), language: detectLanguage_(bd, all), ytLink: findYouTube_(bd, all)
  };
}

// A YouTube link from the bio, website or captions, if the creator shares one.
function findYouTube_(bd, media) {
  const text = [bd.website || '', bd.biography || ''].concat((media || []).map(function (p) { return p.caption || ''; })).join(' ');
  const m = text.match(/(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(@[\w.-]+|c\/[\w.-]+|channel\/[\w-]+|user\/[\w.-]+)|youtu\.be\/[\w-]+)/i);
  if (m) return (/^https?:/i.test(m[0]) ? '' : 'https://') + m[0];
  return 'None in bio';
}

// Rough Indian market price for one Reel, from followers, engagement and views.
function reelPriceEstimate_(a) {
  if (!a.followers) return null;
  const tier = tierFor_(a.followers);
  const perK = { Nano: 400, Micro: 300, Macro: 220, Mega: 150 }[tier] || 300; // ₹ per 1,000 followers
  let p = a.followers / 1000 * perK;
  const er = ((a.avgLikes || 0) + (a.avgComments || 0)) / a.followers * 100;
  const st = erStatus_(tier, er);
  p *= st === 'good' ? 1.2 : st === 'ok' ? 1 : 0.75;
  if (a.avgViews && a.avgViews > a.followers) p *= 1.2;
  return Math.max(500, Math.round(p / 500) * 500);
}

function sentimentEstimate_(a) {
  if (!a.sampled) return '';
  const cr = a.avgLikes ? (a.avgComments || 0) / a.avgLikes * 100 : null;
  const label = cr == null ? 'Comment activity' : cr >= 3 ? 'Active, talkative audience' : cr >= 1 ? 'Normal comment activity' : 'Quiet audience';
  return label + ' (est.): ' + Math.round(a.avgComments || 0) + ' comments per post' + (cr != null ? ', ' + cr.toFixed(1) + '% of likes' : '');
}

/* =========================================================
 * Auto-filled details: category, language, reach and credibility
 * (worked out from the public bio, captions and numbers)
 * ======================================================= */

const CATEGORY_WORDS = {
  'Beauty': ['beauty', 'makeup', 'make up', 'mua', 'lipstick', 'foundation', 'cosmetic', 'glam', 'nykaa', 'blush', 'eyeliner', 'kajal', 'beautyblogger', 'makeupartist', 'swatch'],
  'Skincare': ['skincare', 'skin care', 'serum', 'moisturi', 'sunscreen', 'spf', 'acne', 'glowing skin', 'cleanser', 'toner', 'niacinamide', 'retinol', 'dermat', 'skin routine', 'body wash', 'bodywash', 'soap'],
  'Haircare': ['haircare', 'hair care', 'hair oil', 'shampoo', 'conditioner', 'hairstyle', 'hair growth', 'hair fall', 'curly hair'],
  'Fashion': ['fashion', 'outfit', 'ootd', 'styling', 'style', 'saree', 'kurti', 'lehenga', 'wardrobe', 'streetwear', 'lookbook', 'fashionblogger', 'myntra', 'zara', 'h&m'],
  'Lifestyle': ['lifestyle', 'daily vlog', 'vlog', 'day in my life', 'routine', 'aesthetic', 'life update', 'diml'],
  'Travel': ['travel', 'trip', 'wanderlust', 'explore', 'vacation', 'mountains', 'beach', 'travelgram', 'backpack', 'itinerary', 'hotel', 'resort', 'goa', 'manali', 'ladakh', 'kashmir', 'himachal', 'kerala', 'bali', 'dubai'],
  'Food': ['food', 'recipe', 'foodie', 'cooking', 'cook', 'chef', 'restaurant', 'cafe', 'street food', 'tasty', 'delicious', 'baking', 'dessert', 'biryani', 'foodblogger', 'zomato', 'swiggy'],
  'Fitness': ['fitness', 'workout', 'gym', 'yoga', 'exercise', 'abs', 'fit', 'weight loss', 'fatloss', 'protein', 'bodybuilding', 'running', 'pilates'],
  'Health & Wellness': ['wellness', 'health', 'healthy', 'nutrition', 'diet', 'mental health', 'self care', 'selfcare', 'ayurveda', 'holistic', 'mindful'],
  'Parenting': ['mom', 'mommy', 'mother', 'parenting', 'baby', 'toddler', 'kids', 'momlife', 'motherhood', 'newborn', 'pregnancy', 'dad'],
  'Tech': ['tech', 'gadget', 'smartphone', 'iphone', 'android', 'laptop', 'unboxing', 'review', 'ai ', 'coding', 'software', 'apps'],
  'Gaming': ['gaming', 'gamer', 'bgmi', 'pubg', 'free fire', 'valorant', 'esports', 'stream', 'minecraft', 'gta'],
  'Comedy': ['comedy', 'funny', 'meme', 'memes', 'humor', 'humour', 'skit', 'relatable', 'standup', 'stand up', 'prank', 'lol'],
  'Entertainment': ['entertainment', 'actor', 'actress', 'film', 'movie', 'bollywood', 'web series', 'celebrity', 'acting'],
  'Music': ['music', 'singer', 'song', 'cover', 'musician', 'guitar', 'rapper', 'singing', 'producer'],
  'Dance': ['dance', 'dancer', 'choreograph', 'kathak', 'bharatanatyam', 'hip hop'],
  'Education': ['education', 'learn', 'tips', 'study', 'exam', 'upsc', 'teacher', 'students', 'career', 'english speaking', 'knowledge', 'facts'],
  'Finance': ['finance', 'money', 'invest', 'stock', 'trading', 'mutual fund', 'crypto', 'personal finance', 'savings', 'tax', 'sip'],
  'Business': ['business', 'entrepreneur', 'startup', 'marketing', 'founder', 'brand building', 'linkedin', 'sales'],
  'Home & Decor': ['home decor', 'homedecor', 'interior', 'decor', 'diy home', 'organisation', 'organization', 'cleaning', 'kitchen', 'home tour'],
  'Pets': ['pet', 'dog', 'puppy', 'cat', 'kitten', 'petsofinstagram', 'dogsofinstagram'],
  'Automotive': ['car', 'cars', 'bike', 'motorcycle', 'automobile', 'supercar', 'ride', 'biker'],
  'Photography': ['photography', 'photographer', 'photo', 'portrait', 'lightroom', 'canon', 'nikon', 'sony alpha'],
  'Art & DIY': ['art', 'artist', 'drawing', 'painting', 'sketch', 'craft', 'diy', 'handmade', 'illustration'],
  'Sports': ['cricket', 'football', 'sports', 'athlete', 'badminton', 'tennis', 'kabaddi'],
  'Spirituality': ['spiritual', 'astrology', 'tarot', 'meditation', 'mahadev', 'krishna', 'bhakti', 'manifest'],
  'Books': ['book', 'books', 'reading', 'bookstagram', 'author', 'novel', 'poetry', 'poet', 'shayari'],
  'Motivation': ['motivation', 'motivational', 'inspiration', 'mindset', 'success', 'self improvement', 'growth', 'discipline']
};
const CATEGORY_LIST = Object.keys(CATEGORY_WORDS).concat(['Other']);

function countHits_(text, word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tail = word.length <= 4 ? '(?![a-z])' : '';
  const m = text.match(new RegExp('(^|[^a-z])#?' + esc + tail, 'g'));
  return m ? m.length : 0;
}

// Picks the best one or two categories. The bio counts more than captions.
function detectCategory_(bd, media) {
  const bio = (String(bd.biography || '') + ' ' + String(bd.name || '') + ' ' + String(bd.username || '').replace(/[._]/g, ' ')).toLowerCase();
  const caps = (media || []).map(function (p) { return String(p.caption || ''); }).join(' \n ').toLowerCase();
  const scores = Object.keys(CATEGORY_WORDS).map(function (cat) {
    let sc = 0;
    CATEGORY_WORDS[cat].forEach(function (w) { sc += countHits_(bio, w) * 4 + Math.min(countHits_(caps, w), 6); });
    return [cat, sc];
  }).sort(function (a, b) { return b[1] - a[1]; });
  if (!scores[0][1]) return 'Lifestyle';
  if (scores[1][1] >= scores[0][1] * 0.6 && scores[1][1] >= 3) return scores[0][0] + ', ' + scores[1][0];
  return scores[0][0];
}

const HINGLISH = /\b(hai|hain|nahi|nhi|kya|kyu|kaise|mera|meri|tera|teri|aur|bhi|kar|karo|karna|ke|ki|ko|se|yaar|bhai|accha|acha|hum|tum|aap|apna|apni|wala|wali|bahut|bohot|sab|toh|jab|kuch|matlab|dekho|zindagi|pyaar|dil)\b/g;
// Works out the main language from the scripts and words used in captions and bio.
function detectLanguage_(bd, media) {
  const text = String(bd.biography || '') + ' ' + (media || []).map(function (p) { return String(p.caption || ''); }).join(' ');
  const scripts = [['Hindi', /[\u0900-\u097F]/g], ['Bengali', /[\u0980-\u09FF]/g], ['Punjabi', /[\u0A00-\u0A7F]/g], ['Gujarati', /[\u0A80-\u0AFF]/g],
    ['Odia', /[\u0B00-\u0B7F]/g], ['Tamil', /[\u0B80-\u0BFF]/g], ['Telugu', /[\u0C00-\u0C7F]/g], ['Kannada', /[\u0C80-\u0CFF]/g],
    ['Malayalam', /[\u0D00-\u0D7F]/g], ['Urdu', /[\u0600-\u06FF]/g]];
  const latin = (text.match(/[a-z]/gi) || []).length;
  let best = null, bestN = 0;
  scripts.forEach(function (s) { const n = (text.match(s[1]) || []).length; if (n > bestN) { best = s[0]; bestN = n; } });
  const hing = (text.toLowerCase().match(HINGLISH) || []).length;
  const words = (text.match(/[a-z]+/gi) || []).length || 1;
  if (best && bestN >= 20 && bestN >= latin * 0.3) return latin > bestN * 0.5 ? best + ', English' : best;
  if (hing >= 5 && hing / words > 0.04) return 'Hindi, English';
  if (latin < 15) return best || '';
  return 'English';
}

// Average reach is not public. Estimate it from average views (Reels) or a typical reach rate for the tier.
function estimateReach_(a) {
  if (a.avgViews) return Math.round(a.avgViews * 0.8);
  const rate = { Nano: 0.3, Micro: 0.2, Macro: 0.15, Mega: 0.1 }[tierFor_(a.followers)] || 0.2;
  return a.followers ? Math.round(a.followers * rate) : '';
}

// A quick audience-quality signal from engagement rate, comment share and views vs followers.
function estimateCredibility_(a) {
  if (!a.followers) return '';
  const eng = (a.avgLikes || 0) + (a.avgComments || 0);
  const er = eng / a.followers * 100;
  const st = erStatus_(tierFor_(a.followers), er);
  let score = st === 'good' ? 2 : st === 'ok' ? 1 : 0;
  const cr = a.avgLikes ? (a.avgComments || 0) / a.avgLikes * 100 : null;
  if (cr != null && cr >= 0.5 && cr <= 15) score += 1;
  if (a.avgViews && a.avgViews >= a.followers * 0.25) score += 1;
  const label = score >= 3 && st !== 'weak' ? 'High' : score >= 2 && st !== 'weak' ? 'Medium' : 'Low';
  return label + ' (est.): ER ' + er.toFixed(2) + '%' + (cr != null ? ', comments ' + cr.toFixed(1) + '% of likes' : '') +
    (a.avgViews ? ', views ' + Math.round(a.avgViews / a.followers * 100) + '% of followers' : '');
}

// Details that are only filled when the cell is empty, so the team's own entries stay.
function autoDetails_(a) {
  const price = reelPriceEstimate_(a);
  const big = /Macro|Mega/.test(tierFor_(a.followers));
  return {
    category: a.category, language: a.language, reach: estimateReach_(a), credibility: estimateCredibility_(a),
    ytLink: a.ytLink || '',
    collab: price ? Math.round(price * 1.4 / 500) * 500 : '',
    adRights: price ? Math.max(500, Math.round(price * 0.3 / 500) * 500) : '',
    sentiment: sentimentEstimate_(a),
    deliverables: big ? '1 Reel + 3 Stories (with link) + Auto-DM (suggested)' : '1 Reel + 2 Stories (with link) + Auto-DM (suggested)',
    age: 'Ask creator for insights screenshot',
    gender: 'Ask creator for insights screenshot',
    sales: 'No past campaign yet'
  };
}

// Instagram does not share views for photo and carousel posts. Estimate them from followers or Reel views.
function postViews_(m, bd) {
  if (m.view_count) return { views: m.view_count, est: false };
  const media = (bd && bd.media && bd.media.data) || [];
  const vids = media.filter(function (p) { return p.view_count > 0; }).map(function (p) { return p.view_count; });
  const followers = (bd && bd.followers_count) || 0;
  let v = vids.length ? avg_(vids) * 0.6 : estimateReach_({ followers: followers, avgViews: null });
  if (m.like_count) v = Math.max(v || 0, m.like_count * 8);
  return { views: v ? Math.round(v) : '', est: !!v };
}

function writeCreatorStats_(sh, row, a, cur) {
  cur = cur || sh.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  const extra = {}, auto = autoDetails_(a);
  Object.keys(auto).forEach(function (k) { const v = cur[C[k] - 1]; if ((v === '' || v === null) && auto[k] !== '' && auto[k] != null) extra[k] = auto[k]; });
  setCells_(sh, row, extra);
  setCells_(sh, row, {
    followers: a.followers, posts: a.posts,
    likes: round_(a.avgLikes, 0), comments: round_(a.avgComments, 0), views: round_(a.avgViews, 0),
    competitors: a.competitors, collabs: a.collabs,
    updated: new Date(),
    status: '✓ Based on last ' + a.sampled + ' posts' +
      (a.videos ? ' (' + a.videos + ' with views)' : ' (no video views found)') +
      (a.hiddenLikes ? '. ' + a.hiddenLikes + ' posts hide likes, so engagement is lower than real.' : '')
  });
}

// Works out Engagement, ER%, CPV, CPE, Tier and Verdict for every creator row.
function recomputeAll(sh) {
  sh = sh || sheet_(SHEET_NAME);
  const last = sh.getLastRow();
  if (last < 2) return;
  const data = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const g = function (r, k) { return r[C[k] - 1]; };
  const rows = data.map(function (r) {
    const fee = num_(g(r, 'fee')) || num_(g(r, 'collab')), followers = num_(g(r, 'followers')), views = num_(g(r, 'views'));
    const likes = num_(g(r, 'likes')), comments = num_(g(r, 'comments'));
    const eng = (likes || comments) ? (likes || 0) + (comments || 0) : num_(g(r, 'engagement'));
    const tier = tierFor_(followers);
    return {
      name: String(g(r, 'name') || '').trim(), tier: tier, fee: fee, views: views, eng: eng,
      has: !!(followers || views),
      er: followers && eng ? eng / followers * 100 : null,
      cpv: fee && views ? fee / views : null, cpe: fee && eng ? fee / eng : null
    };
  });
  const cpvs = rows.map(function (x) { return x.cpv; }).filter(function (v) { return v != null; });
  const med = median_(cpvs);
  const cols = { er: [], engagement: [], cpv: [], cpe: [], tier: [], verdict: [], why: [] };
  const bg = [];
  rows.forEach(function (x) {
    let v = { label: '', why: '', color: null };
    if (x.name && x.has) v = verdict_(x, med, cpvs.length);
    cols.er.push([x.er != null ? round_(x.er, 2) : '']);
    cols.engagement.push([x.eng != null ? Math.round(x.eng) : '']);
    cols.cpv.push([x.cpv != null ? round_(x.cpv, 2) : '']);
    cols.cpe.push([x.cpe != null ? round_(x.cpe, 2) : '']);
    cols.tier.push([x.tier]);
    cols.verdict.push([v.label]);
    cols.why.push([v.why]);
    bg.push([v.color]);
  });
  Object.keys(cols).forEach(function (k) { sh.getRange(2, C[k], cols[k].length, 1).setValues(cols[k]); });
  sh.getRange(2, C.verdict, bg.length, 1).setBackgrounds(bg);
}

function verdict_(x, med, count) {
  const st = erStatus_(x.tier, x.er);
  const erTxt = (st === 'good' ? 'ER strong' : st === 'ok' ? 'ER okay' : 'ER weak') + ' for ' + x.tier;
  if (x.cpv == null) {
    return {
      label: st === 'good' ? 'Good engagement' : st === 'ok' ? 'Average engagement' : 'Low engagement',
      why: erTxt + '. ' + (x.fee ? 'No video views found, so CPV cannot be estimated.' : 'Add the fee to judge value.'),
      color: st === 'good' ? '#DFF1E5' : st === 'ok' ? '#FAEED3' : '#F8E1DD'
    };
  }
  if (count < 2) {
    return { label: st === 'weak' ? 'Low engagement' : 'Add more creators',
      why: erTxt + '. Add one more creator with a fee to compare prices.', color: st === 'weak' ? '#F8E1DD' : '#FAEED3' };
  }
  const diff = (x.cpv - med) / med * 100;
  const cpvTxt = Math.abs(diff) < 1 ? 'CPV at median' : 'CPV ' + Math.abs(diff).toFixed(0) + '% ' + (diff < 0 ? 'below' : 'above') + ' median';
  if (st === 'weak' || x.cpv > med * 1.4) return { label: 'Avoid or renegotiate', why: cpvTxt + '; ' + erTxt + '.', color: '#F8E1DD' };
  if ((st === 'good' && x.cpv <= med) || (st === 'ok' && x.cpv <= med * 0.7)) return { label: 'Good value', why: cpvTxt + '; ' + erTxt + '.', color: '#DFF1E5' };
  return { label: 'Negotiate', why: cpvTxt + '; ' + erTxt + '.', color: '#FAEED3' };
}

/* =========================================================
 * Sheet helpers
 * ======================================================= */

function ensureSheets_() {
  const ss = ss_();
  let c = ss.getSheetByName(SHEET_NAME);
  if (c && String(c.getRange(1, C.name).getValue()) !== 'Name') {
    // Older Creator Tracker layout: keep it as a backup tab and move its creators into the team format.
    const oldName = SHEET_NAME + ' (old layout)';
    if (ss.getSheetByName(oldName)) ss.deleteSheet(ss.getSheetByName(oldName));
    c.setName(oldName);
    const old = c;
    c = null;
    migrateOld_(ss, old);
    c = ss.getSheetByName(SHEET_NAME);
  }
  if (!c) c = createCreatorsSheet_(ss);
  if (String(c.getRange(1, C.collabs).getValue()) !== 'Recent brand collabs') {
    // Add the competitor columns to an existing team-format sheet.
    if (c.getMaxColumns() < HEADERS.length) c.insertColumnsAfter(c.getMaxColumns(), HEADERS.length - c.getMaxColumns());
    c.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    styleHeader_(c, HEADERS.length);
    c.getRange(2, C.competitors, 500, 2).setWrap(true);
    c.setColumnWidth(C.competitors, 280); c.setColumnWidth(C.collabs, 240);
  }
  let p0 = ss.getSheetByName(POSTS_SHEET);
  if (p0) {
    const h = p0.getRange(1, 1, 1, Math.max(p0.getLastColumn(), 1)).getValues()[0].map(String);
    if (h[7] === 'Shares') p0.deleteColumns(8, 4); // Shares, Saves, Link clicks, Conversions are no longer tracked
    if (String(p0.getRange(1, PCOL.platform).getValue()) !== 'Platform' || h[7] === 'Shares') {
      p0.getRange(1, 1, 1, POST_HEADERS.length).setValues([POST_HEADERS]);
      styleHeader_(p0, POST_HEADERS.length);
    }
  }
  let p = ss.getSheetByName(POSTS_SHEET);
  if (!p) {
    p = ss.insertSheet(POSTS_SHEET);
    p.getRange(1, 1, 1, POST_HEADERS.length).setValues([POST_HEADERS]);
    styleHeader_(p, POST_HEADERS.length);
    p.getRange(2, PCOL.id, 500, 1).setNumberFormat('@');
    p.getRange(2, PCOL.fee, 500, 1).setNumberFormat('₹#,##0');
    p.getRange(2, PCOL.views, 500, 3).setNumberFormat('#,##0');
    p.getRange(2, PCOL.posted, 500, 2).setNumberFormat('dd mmm yyyy, hh:mm');
    p.setColumnWidth(PCOL.link, 260);
    p.setColumnWidth(PCOL.status, 300);
  }
  let s = ss.getSheetByName(SETTINGS_SHEET);
  if (!s) {
    s = ss.insertSheet(SETTINGS_SHEET);
    s.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']]);
    styleHeader_(s, 2);
    s.getRange(2, 1, SETTING_KEYS.length, 1).setValues(SETTING_KEYS.map(function (k) { return [k[1]]; }));
    s.getRange(3, 2).setNumberFormat('₹#,##0');
    s.getRange(4, 2, 2, 1).setNumberFormat('@');
    s.setColumnWidth(1, 180); s.setColumnWidth(2, 240);
  }
  if (String(s.getRange(SETTING_KEYS.length + 1, 1).getValue()) !== 'Competitor brands') {
    s.getRange(SETTING_KEYS.length + 1, 1, 1, 2).setValues([['Competitor brands', DEFAULT_COMPETITORS]]);
    s.getRange(SETTING_KEYS.length + 1, 2).setWrap(true);
  }
}

function createCreatorsSheet_(ss) {
  const c = ss.insertSheet(SHEET_NAME, 0);
  if (c.getMaxColumns() < HEADERS.length) c.insertColumnsAfter(c.getMaxColumns(), HEADERS.length - c.getMaxColumns());
  c.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  styleHeader_(c, HEADERS.length);
  c.setFrozenColumns(C.name);
  const rows = 500;
  CCOLS.forEach(function (col, i) {
    const r = c.getRange(2, i + 1, rows, 1);
    const k = col[0];
    if (col[2] === 'text' || col[2] === 'num' || col[2] === 'key') r.setBackground('#FFFDE7');
    if (['followers', 'views', 'reach', 'comments', 'engagement', 'posts', 'likes'].indexOf(k) >= 0) r.setNumberFormat('#,##0');
    if (['collab', 'adRights', 'fee'].indexOf(k) >= 0) r.setNumberFormat('₹#,##0');
    if (k === 'cpv' || k === 'cpe') r.setNumberFormat('₹0.00');
    if (k === 'er') r.setNumberFormat('0.00"%"');
    if (k === 'updated') r.setNumberFormat('dd mmm yyyy, hh:mm');
    if (['sentiment', 'deliverables', 'why', 'status', 'competitors', 'collabs'].indexOf(k) >= 0) { r.setWrap(true); c.setColumnWidth(i + 1, 260); }
  });
  c.setColumnWidth(C.name, 170);
  c.setColumnWidth(C.link, 200);
  c.setColumnWidth(C.collab, 150);
  c.getRange(1, C.category).setNote('Light yellow columns are typed by the team (or pasted). White columns are filled from Instagram or calculated.');
  c.getRange(1, C.er).setNote('Engagement ÷ Followers × 100');
  c.getRange(1, C.engagement).setNote('Average likes + average comments per post');
  c.getRange(1, C.cpv).setNote('Fee ÷ Average Views');
  c.getRange(1, C.cpe).setNote('Fee ÷ Engagement');
  return c;
}

function migrateOld_(ss, old) {
  const c = createCreatorsSheet_(ss);
  const last = old.getLastRow();
  if (last < 2) return;
  const head = old.getRange(1, 1, 1, old.getLastColumn()).getValues()[0].map(String);
  const idx = function (h) { return head.indexOf(h); };
  const map = { name: idx('Instagram handle'), fee: idx('Fee (₹)'), followers: idx('Followers'), posts: idx('Posts'),
    likes: idx('Avg likes'), comments: idx('Avg comments'), views: idx('Avg views (videos)'), updated: idx('Last updated'),
    status: idx('Status'), platform: idx('Platform'), source: idx('Source') };
  const data = old.getRange(2, 1, last - 1, head.length).getValues();
  let row = 2;
  data.forEach(function (r) {
    const name = String(r[map.name] || '').trim();
    if (!name) return;
    const o = {};
    Object.keys(map).forEach(function (k) { if (map[k] >= 0 && r[map[k]] !== '') o[k] = r[map[k]]; });
    o.platform = o.platform || 'Instagram';
    o.source = o.source || 'Instagram API';
    if (o.platform === 'Instagram' && /^[a-z0-9._]+$/.test(name)) o.link = 'https://www.instagram.com/' + name + '/';
    setCells_(c, row, o);
    row++;
  });
  recomputeAll(c);
}

function styleHeader_(sh, n) {
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#0D6A65').setFontColor('#FFFFFF')
    .setWrap(true).setVerticalAlignment('middle');
  sh.setRowHeight(1, 42);
  sh.setFrozenRows(1);
}

function sheet_(name) {
  ensureSheets_();
  return ss_().getSheetByName(name);
}

function findRow_(sh, col, value) {
  const last = sh.getLastRow();
  if (last < 2 || !value) return 0;
  const vals = sh.getRange(2, col, last - 1, 1).getValues();
  const target = String(value).toLowerCase();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).replace(/^'/, '').trim().toLowerCase() === target) return i + 2;
  }
  return 0;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* =========================================================
 * Small helpers
 * ======================================================= */

function cleanHandle_(v) {
  let h = String(v || '').trim();
  if (!h) return '';
  const m = h.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) h = m[1];
  return h.replace(/^@/, '').replace(/[/?#].*$/, '').toLowerCase();
}

function shortcode_(link) {
  const m = String(link || '').match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : '';
}

function tierFor_(f) {
  if (!f) return '';
  if (f < 10000) return 'Nano';
  if (f < 100000) return 'Micro';
  if (f < 1000000) return 'Macro';
  return 'Mega';
}

function erStatus_(tier, er) {
  const b = BENCH[tier] || BENCH.Micro;
  if (er == null) return 'weak';
  return er >= b[0] ? 'good' : er >= b[1] ? 'ok' : 'weak';
}

function num_(v) {
  if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
  const n = parseFloat(String(v == null ? '' : v).replace(/[₹,\s]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
}

function dateStr_(v) {
  if (v instanceof Date) return v.toISOString();
  return v ? String(v) : '';
}

function avg_(arr) { return arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : null; }

function median_(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort(function (a, b) { return a - b; });
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round_(v, d) { return v == null ? '' : Math.round(v * Math.pow(10, d)) / Math.pow(10, d); }

function range_(a, b) { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; }
