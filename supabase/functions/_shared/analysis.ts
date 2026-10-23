// @ts-nocheck  Ported unchanged from the Apps Script backend (apps-script/Code.gs), so both give the same numbers.
// Instagram analysis: engagement, audience quality (fake-follower check), sponsored vs organic,
// content mix, category, language, reach and price estimates, competitor and collab scan.

export const POSTS_TO_READ = 12;   // recent posts averaged for a creator
export const POSTS_FOR_BRANDS = 25; // recent posts fetched for each creator
export const POSTS_TO_SEARCH = 50;  // recent posts searched to find a campaign post

const BENCH = { Nano: [4, 2], Micro: [3, 1.5], Macro: [2, 1], Mega: [1.5, 0.7] };

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

const HINGLISH = /\b(hai|hain|nahi|nhi|kya|kyu|kaise|mera|meri|tera|teri|aur|bhi|kar|karo|karna|ke|ki|ko|se|yaar|bhai|accha|acha|hum|tum|aap|apna|apni|wala|wali|bahut|bohot|sab|toh|jab|kuch|matlab|dekho|zindagi|pyaar|dil)\b/g;

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
      (h.last ? ', latest ' + h.last.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '') + ')';
  }).join('; ');
  const col = Object.keys(collabs).sort(function (a, b) { return collabs[b] - collabs[a]; }).slice(0, 8).join(', ');
  return { competitors: comp || 'None found', collabs: col || 'None found', checked: posts.length };
}

function analyse_(bd, competitorList) {
  const all = (bd.media && bd.media.data) || [];
  const posts = all.slice(0, POSTS_TO_READ);
  const brands = scanBrands_(all, bd.username, competitorList || '');
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
    category: detectCategory_(bd, all), language: detectLanguage_(bd, all), ytLink: findYouTube_(bd, all),
    ins: insights_(bd, all)
  };
}

function findYouTube_(bd, media) {
  const text = [bd.website || '', bd.biography || ''].concat((media || []).map(function (p) { return p.caption || ''; })).join(' ');
  const m = text.match(/(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(@[\w.-]+|c\/[\w.-]+|channel\/[\w-]+|user\/[\w.-]+)|youtu\.be\/[\w-]+)/i);
  if (m) return (/^https?:/i.test(m[0]) ? '' : 'https://') + m[0];
  return 'None in bio';
}

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

function countHits_(text, word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tail = word.length <= 4 ? '(?![a-z])' : '';
  const m = text.match(new RegExp('(^|[^a-z])#?' + esc + tail, 'g'));
  return m ? m.length : 0;
}

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

function estimateReach_(a) {
  if (a.avgViews) return Math.round(a.avgViews * 0.8);
  const rate = { Nano: 0.3, Micro: 0.2, Macro: 0.15, Mega: 0.1 }[tierFor_(a.followers)] || 0.2;
  return a.followers ? Math.round(a.followers * rate) : '';
}

function autoDetails_(a) {
  const price = reelPriceEstimate_(a);
  const big = /Macro|Mega/.test(tierFor_(a.followers));
  return {
    category: a.category, language: a.language, reach: estimateReach_(a),
    ytLink: a.ytLink || '',
    collab: price ? Math.round(price * 1.4 / 500) * 500 : '',
    adRights: price ? Math.max(500, Math.round(price * 0.3 / 500) * 500) : '',
    sentiment: sentimentEstimate_(a),
    deliverables: big ? '1 Reel + 3 Stories (with link) + Auto-DM (suggested)' : '1 Reel + 2 Stories (with link) + Auto-DM (suggested)'
  };
}

function postViews_(m, bd) {
  if (m.view_count) return { views: m.view_count, est: false };
  const media = (bd && bd.media && bd.media.data) || [];
  const vids = media.filter(function (p) { return p.view_count > 0; }).map(function (p) { return p.view_count; });
  const followers = (bd && bd.followers_count) || 0;
  let v = vids.length ? avg_(vids) * 0.6 : estimateReach_({ followers: followers, avgViews: null });
  if (m.like_count) v = Math.max(v || 0, m.like_count * 8);
  return { views: v ? Math.round(v) : '', est: !!v };
}

function isSponsored_(p) { return COLLAB_MARK.test(String(p.caption || '')); }

function formatOf_(p) {
  const t = String(p.media_type || ''), pt = String(p.media_product_type || '');
  if (pt === 'REELS' || t === 'VIDEO') return 'Reels';
  if (t === 'CAROUSEL_ALBUM') return 'Carousel';
  return 'Photo';
}

function engOf_(p) { return (typeof p.like_count === 'number' ? p.like_count : 0) + (p.comments_count || 0); }

function shortNum_(v) {
  if (v == null || !isFinite(v)) return '—';
  if (v >= 1e7) return (v / 1e7).toFixed(1).replace(/\.0$/, '') + ' Cr';
  if (v >= 1e5) return (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(v));
}

function insights_(bd, media) {
  const followers = bd.followers_count || 0;
  const follows = bd.follows_count;
  const out = { credibility: '', qualityWhy: '', organicEr: '', sponsoredEr: '', sponsoredLift: '', boosted: '', bestFormat: '', contentMix: '', qualityScore: null };
  if (!followers || !media || !media.length) return out;
  const tier = tierFor_(followers);
  const bench = BENCH[tier] || BENCH.Micro;
  const withLikes = media.filter(function (p) { return typeof p.like_count === 'number'; });
  const organic = withLikes.filter(function (p) { return !isSponsored_(p); });
  const sponsored = withLikes.filter(isSponsored_);
  const erOf = function (list) { return list.length ? avg_(list.map(engOf_)) / followers * 100 : null; };
  const orgEr = erOf(organic);

  // Boosted: a sponsored post that got far more than the creator's normal organic numbers (paid promotion).
  const orgViews = organic.map(function (p) { return p.view_count; }).filter(function (v) { return v > 0; });
  const orgViewMed = median_(orgViews), orgEngMed = median_(organic.map(engOf_));
  const boosted = sponsored.filter(function (p) {
    if (p.view_count > 0 && orgViewMed) return p.view_count > orgViewMed * 3 && p.view_count > followers * 0.5;
    return orgEngMed ? engOf_(p) > orgEngMed * 3 : false;
  });
  out.boosted = sponsored.length ? (boosted.length ? boosted.length + ' of ' + sponsored.length + ' sponsored posts look boosted (paid promotion)' : 'None') : '';

  /* ---- sponsored vs organic: boosted posts are left out so paid reach does not hide the real response ---- */
  const fair = sponsored.filter(function (p) { return boosted.indexOf(p) < 0; });
  const sponEr = erOf(fair.length ? fair : sponsored);
  if (orgEr != null) out.organicEr = round_(orgEr, 2);
  if (sponEr != null) out.sponsoredEr = round_(sponEr, 2);
  if (!sponsored.length) out.sponsoredLift = 'No sponsored posts in last ' + media.length;
  else if (orgEr == null || !organic.length) out.sponsoredLift = 'Only sponsored posts found';
  else {
    const lift = (sponEr - orgEr) / orgEr * 100;
    const word = Math.abs(lift) < 10 ? 'Same as organic' : lift > 0 ? 'Sponsored does better' : 'Sponsored does worse';
    out.sponsoredLift = (lift >= 0 ? '+' : '') + Math.round(lift) + '% · ' + word + ' (' + sponsored.length + ' sponsored, ' + organic.length + ' organic' +
      (boosted.length && fair.length ? ', boosted left out' : '') + ')';
  }

  /* ---- audience quality: organic posts only, so boosted brand posts never count as fake ---- */
  if (organic.length < 4) {
    out.credibility = 'Not enough posts';
    out.qualityWhy = 'Needs at least 4 organic posts with visible likes (found ' + organic.length + ').';
  } else {
    let score = 0;
    const why = [];
    // Typical (median) engagement, so one viral or bought-likes post cannot lift the score.
    const qEr = median_(organic.map(engOf_)) / followers * 100;
    // 1. Engagement for the size (35)
    if (qEr >= bench[0]) { score += 35; why.push('Typical ER ' + qEr.toFixed(2) + '% is strong for ' + tier); }
    else if (qEr >= bench[1]) { score += 26; why.push('Typical ER ' + qEr.toFixed(2) + '% is normal for ' + tier); }
    else if (qEr >= bench[1] * 0.5) { score += 12; why.push('Typical ER ' + qEr.toFixed(2) + '% is low for ' + tier + ' (normal ' + bench[1] + '–' + bench[0] + '%)'); }
    else why.push('Typical ER ' + qEr.toFixed(2) + '% is very low for ' + tier + ' (normal ' + bench[1] + '–' + bench[0] + '%)');
    // 2. Comments compared with likes (20)
    const likes = avg_(organic.map(function (p) { return p.like_count; })), comm = avg_(organic.map(function (p) { return p.comments_count || 0; }));
    const cr = likes ? comm / likes * 100 : null;
    if (cr == null) score += 10;
    else if (cr >= 0.5 && cr <= 15) { score += 20; }
    else if (cr >= 0.2 && cr <= 30) { score += 10; why.push('Comments are ' + cr.toFixed(1) + '% of likes (a bit unusual)'); }
    else why.push(cr < 0.2 ? 'Very few comments for the likes (' + cr.toFixed(2) + '%), a sign of bought likes' : 'Comments are ' + Math.round(cr) + '% of likes, a sign of comment pods');
    // 3. Steady likes, no sudden spikes on normal posts (20)
    const med = median_(organic.map(function (p) { return p.like_count; }));
    const spikes = organic.filter(function (p) {
      const c = p.like_count ? (p.comments_count || 0) / p.like_count * 100 : 0;
      return med > 0 && p.like_count > med * 4 && c < 0.3;
    });
    if (!spikes.length) score += 20;
    else if (spikes.length === 1) { score += 8; why.push('1 normal post has a sudden like spike with few comments'); }
    else why.push(spikes.length + ' normal posts have sudden like spikes with few comments');
    // 4. Views compared with followers, for Reels (25)
    const vr = orgViews.length ? median_(orgViews) / followers : null;
    if (vr == null) score += 12;
    else if (vr >= 0.3) { score += 25; why.push('Reels reach ' + Math.round(vr * 100) + '% of followers'); }
    else if (vr >= 0.1) { score += 16; }
    else if (vr >= 0.03) { score += 6; why.push('Reels reach only ' + Math.round(vr * 100) + '% of followers'); }
    else why.push('Reels reach under 3% of followers');
    // 5. Follows a lot of accounts (follow-for-follow)
    if (follows != null && followers >= 5000 && follows > followers * 0.8) { score -= 15; why.push('Follows ' + shortNum_(follows) + ' accounts (follow-for-follow sign)'); }
    score = Math.max(0, Math.min(100, Math.round(score)));
    if (spikes.length) score = Math.min(score, 69); // a like spike always needs a human check
    const label = score >= 70 ? 'Genuine' : score >= 45 ? 'Check' : 'Suspicious';
    out.qualityScore = score;
    out.credibility = label + ' · ' + score + '/100';
    const warn = /\blow\b|spike|\bfew\b|Follows|unusual|\bsign\b|\bonly\b|\bunder\b/;
    why.sort(function (x, y) { return (warn.test(y) ? 1 : 0) - (warn.test(x) ? 1 : 0); });
    out.qualityWhy = (why.length ? why.slice(0, 3).join('. ') : 'Engagement, comments and views all look normal') +
      '. Based on ' + organic.length + ' organic posts; sponsored posts are left out.';
  }

  /* ---- content mix ---- */
  const groups = {};
  media.forEach(function (p) { const f = formatOf_(p); (groups[f] = groups[f] || []).push(p); });
  const rows = ['Reels', 'Carousel', 'Photo'].filter(function (f) { return groups[f]; }).map(function (f) {
    const g = groups[f], gl = g.filter(function (p) { return typeof p.like_count === 'number'; });
    const v = g.map(function (p) { return p.view_count; }).filter(function (x) { return x > 0; });
    return { f: f, n: g.length, share: Math.round(g.length / media.length * 100),
      er: gl.length ? avg_(gl.map(engOf_)) / followers * 100 : null, views: v.length ? avg_(v) : null };
  });
  out.contentMix = rows.map(function (r) {
    return r.f + ' ' + r.share + '% (' + r.n + (r.n === 1 ? ' post' : ' posts') + ') · ER ' + (r.er != null ? r.er.toFixed(2) + '%' : '—') + (r.views ? ' · ' + shortNum_(r.views) + ' views' : '');
  }).join(' | ');
  const ranked = rows.filter(function (r) { return r.n >= 2 && r.er != null; }).sort(function (a, b) { return b.er - a.er; });
  if (!ranked.length) out.bestFormat = rows.length ? rows[0].f + ' (only format with enough posts)' : '';
  else if (ranked.length === 1) out.bestFormat = ranked[0].f + ' (only format with enough posts)';
  else {
    const x = ranked[0].er / Math.max(ranked[ranked.length - 1].er, 0.01);
    out.bestFormat = ranked[0].f + (x >= 1.15 ? ' (' + x.toFixed(1) + 'x the ER of ' + ranked[ranked.length - 1].f + ')' : ' (all formats do about the same)');
  }
  return out;
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

function avg_(arr) { return arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : null; }

function median_(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort(function (a, b) { return a - b; });
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round_(v, d) { return v == null ? '' : Math.round(v * Math.pow(10, d)) / Math.pow(10, d); }

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

function matchPost_(media, code) {
  for (let i = 0; i < media.length; i++) {
    if (shortcode_(media[i].permalink) === code) return media[i];
  }
  return null;
}

export {
  BENCH, COLLAB_MARK, CATEGORY_LIST, brandMatchers_ as brandMatchers, scanBrands_ as scanBrands, analyse_ as analyse,
  autoDetails_ as autoDetails, postViews_ as postViews, insights_ as insights, tierFor_ as tierFor, erStatus_ as erStatus,
  estimateReach_ as estimateReach, reelPriceEstimate_ as reelPriceEstimate, num_ as num, round_ as round,
  cleanHandle_ as cleanHandle, shortcode_ as shortcode, matchPost_ as matchPost, median_ as median, avg_ as avg,
};
