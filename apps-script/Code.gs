/**
 * Creator Desk — website + Google Sheet for influencer marketing.
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
 *      Who has access: Anyone → Deploy. Share that URL with the team only.
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

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Creator Desk')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// JSON API for the hosted website (Netlify / any domain). The page sends
// POST {fn, args, code} as text/plain; the answer is {ok, result} or {ok:false, error}.
const API_FUNCS = ['api_getState', 'api_lookup', 'api_saveCreator', 'api_setFee', 'api_removeCreator',
  'api_addCreatorManual', 'api_bulkCreators', 'api_refreshCreators', 'api_fillCreators', 'api_exportShortlist',
  'api_saveSettings', 'api_addPost', 'api_bulkPosts', 'api_updatePost', 'api_removePost', 'api_refreshPosts', 'api_siteHtml'];

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { body = {}; }
  return ContentService.createTextOutput(JSON.stringify(handleApi_(body))).setMimeType(ContentService.MimeType.JSON);
}

function handleApi_(body) {
  const fn = String(body.fn || '');
  if (API_FUNCS.indexOf(fn) < 0) return { ok: false, error: 'Unknown action.' };
  const code = PropertiesService.getScriptProperties().getProperty('TEAM_CODE');
  if (code && String(body.code || '').trim() !== code) return { ok: false, error: 'ACCESS_CODE' };
  try {
    return { ok: true, result: globalThis[fn].apply(null, Array.isArray(body.args) ? body.args : []) };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
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
  const sh = sheet_(SHEET_NAME);
  const last = sh.getLastRow();
  const errors = [];
  for (let row = 2; row <= last; row++) {
    const handle = cleanHandle_(sh.getRange(row, C.name).getValue());
    if (!handle || !isApiRow_(sh, row)) continue;
    try {
      writeCreatorStats_(sh, row, analyse_(fetchCreator_(handle, token)));
    } catch (e) {
      sh.getRange(row, C.status).setValue('✗ ' + e.message);
      errors.push(handle + ': ' + e.message);
    }
    Utilities.sleep(300);
  }
  recomputeAll(sh);
  return { state: buildState_(), errors: errors };
}

// Write several named cells of one row.
function setCells_(sh, row, obj) {
  Object.keys(obj).forEach(function (k) { if (C[k]) sh.getRange(row, C[k]).setValue(obj[k]); });
}

// Upload flow: fetch Instagram data for these creators but only fill cells that are empty.
// Called in small batches by the website so it can show progress.
function api_fillCreators(names) {
  const token = requireToken_();
  const list = getCompetitors_();
  const results = [];
  (names || []).forEach(function (raw) {
    const name = String(raw || '').trim();
    const handle = cleanHandle_(name);
    if (!/^[a-z0-9._]{1,30}$/.test(handle)) {
      withLock_(function () { const sh = sheet_(SHEET_NAME); const row = findRow_(sh, C.name, name); if (row) sh.getRange(row, C.status).setValue('Add the Instagram handle or profile link to fetch data'); });
      results.push({ name: name, ok: false, msg: 'Needs an Instagram handle, not a display name' }); return;
    }
    let a;
    try { a = analyse_(fetchCreator_(handle, token), list); }
    catch (e) {
      withLock_(function () { const sh = sheet_(SHEET_NAME); const row = findRow_(sh, C.name, name) || findRow_(sh, C.name, handle); if (row) sh.getRange(row, C.status).setValue('✗ ' + e.message); });
      results.push({ name: name, ok: false, msg: e.message }); return;
    }
    withLock_(function () {
      const sh = sheet_(SHEET_NAME);
      let row = findRow_(sh, C.name, name) || findRow_(sh, C.name, handle);
      if (!row) { row = Math.max(sh.getLastRow(), 1) + 1; sh.getRange(row, C.name).setValue(handle); }
      const cur = sh.getRange(row, 1, 1, HEADERS.length).getValues()[0];
      const blank = function (k) { const v = cur[C[k] - 1]; return v === '' || v === null; };
      const fill = {
        link: 'https://www.instagram.com/' + handle + '/', followers: a.followers, posts: a.posts,
        views: round_(a.avgViews, 0), comments: round_(a.avgComments, 0), likes: round_(a.avgLikes, 0)
      };
      const out = {};
      Object.keys(fill).forEach(function (k) { if (blank(k) && fill[k] !== '' && fill[k] != null) out[k] = fill[k]; });
      if (blank('platform')) out.platform = 'Instagram';
      if (blank('source') || cur[C.source - 1] === 'Manual') out.source = 'Instagram API';
      out.competitors = a.competitors; out.collabs = a.collabs; out.updated = new Date();
      out.status = '✓ Filled from Instagram (last ' + a.sampled + ' posts)' + (a.hiddenLikes ? '. Some posts hide likes.' : '');
      setCells_(sh, row, out);
    });
    results.push({ name: name, ok: true, msg: 'Filled' });
    Utilities.sleep(250);
  });
  withLock_(function () { recomputeAll(sheet_(SHEET_NAME)); });
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
  let found = null, status = 'Entered manually';
  if (isIg) {
    try {
      found = findPost_(handle, code, requireToken_());
      status = found ? '✓ Numbers fetched from Instagram' :
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
      found ? (found.view_count || '') : keep(PCOL.views, num_(p.views)),
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
      if (!cache[handle]) cache[handle] = fetchMedia_(handle, token, POSTS_TO_SEARCH);
      const m = matchPost_(cache[handle], code);
      if (m) {
        sh.getRange(row, PCOL.views, 1, 3).setValues([[m.view_count || '', m.like_count != null ? m.like_count : '', m.comments_count != null ? m.comments_count : '']]);
        sh.getRange(row, PCOL.updated, 1, 2).setValues([[new Date(), '✓ Numbers fetched from Instagram']]);
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
  const ss = SpreadsheetApp.getActive();
  const tokenOk = !!PropertiesService.getScriptProperties().getProperty('IG_TOKEN');

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
  return { live: true, tokenOk: tokenOk, sheetUrl: ss.getUrl(), creators: creators, posts: posts, settings: settings };
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
  SpreadsheetApp.getActive().toast(r.errors.length ? r.errors.length + ' posts failed, see Status column.' : 'Campaign post numbers updated.', 'Creator Tracker', 6);
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
  SpreadsheetApp.getActive().toast(done + ' updated' + (failed ? ', ' + failed + ' failed (see Status column)' : '') + '.', 'Creator Tracker', 6);
}

/* =========================================================
 * Instagram API
 * ======================================================= */

function getIgId() {
  return PropertiesService.getScriptProperties().getProperty('IG_ID') || DEFAULT_IG_ID;
}

function requireToken_() {
  const t = PropertiesService.getScriptProperties().getProperty('IG_TOKEN');
  if (!t) throw new Error('Access token missing. In the Google Sheet use Creator Tracker → Save access token.');
  return t;
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

function callApi_(handle, mediaFields, token, limit) {
  const fields = 'business_discovery.username(' + handle + '){username,name,profile_picture_url,followers_count,media_count,media.limit(' +
    limit + '){' + mediaFields + '}}';
  const url = 'https://graph.facebook.com/' + API_VERSION + '/' + getIgId() +
    '?fields=' + encodeURIComponent(fields) + '&access_token=' + encodeURIComponent(token);
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
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
  if (code === 4 || code === 17 || code === 32 || code === 613) return 'Instagram rate limit reached. Wait about an hour and try again.';
  if (sub === 2207013 || /cannot find|invalid user id|does not exist/i.test(msg)) {
    return 'Account not found, or it is a personal account. Only Creator and Business accounts can be read. Check the handle.';
  }
  if (code === 10 || code === 200) return 'Permission missing. Regenerate the token with instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement and business_management.';
  return msg;
}

/* =========================================================
 * Competitor and brand-collab detection (from public captions)
 * ======================================================= */

const DEFAULT_COMPETITORS = 'Dove, Ghar Soaps, Pears, Lux, Nivea, Palmolive, Mamaearth, Plum, The Body Shop, Bath & Body Works, Dettol, Lifebuoy, Santoor, Cinthol, Medimix, Biotique, Hamam, Liril';
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
  const sh = SpreadsheetApp.getActive().getSheetByName(SETTINGS_SHEET);
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
    competitors: brands.competitors, collabs: brands.collabs, captionsChecked: brands.checked
  };
}

function writeCreatorStats_(sh, row, a) {
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
    const fee = num_(g(r, 'fee')), followers = num_(g(r, 'followers')), views = num_(g(r, 'views'));
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
  const ss = SpreadsheetApp.getActive();
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
  return SpreadsheetApp.getActive().getSheetByName(name);
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
