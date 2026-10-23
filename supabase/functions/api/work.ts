// Creators, campaign posts and campaign settings. Everything here runs as the signed-in person,
// so the database rules decide what they can read and change.
import { asUser } from "../_shared/db.ts";
import { ApiError, numOrNull, str, uuid } from "../_shared/http.ts";
import * as A from "../_shared/analysis.ts";
import { type Ctx, requireCompany } from "./context.ts";
import { fetchCreators, logUsage } from "./lookups.ts";

const PLATFORMS = ["Instagram", "Instagram Story", "YouTube", "YouTube Shorts", "Moj / Josh", "Other"];
const HANDLE = /^[a-z0-9._]{1,30}$/;
const MAX_PER_CALL = 25;

// Columns a member may type. Instagram numbers are only editable for manually entered creators.
const EDITABLE: Record<string, "text" | "num"> = {
  category: "text", language: "text", link: "text", yt_link: "text", reach: "num", sentiment: "text",
  deliverables: "text", collab_price: "num", ad_rights_price: "num", fee: "num", platform: "text",
};
const MANUAL_NUMBERS: Record<string, "num"> = { followers: "num", views: "num", likes: "num", comments: "num", posts: "num" };

function clean(fields: Record<string, unknown>, allowed: Record<string, "text" | "num">): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, kind] of Object.entries(allowed)) {
    if (!(k in fields)) continue;
    out[k] = kind === "num" ? numOrNull(fields[k]) : (str(fields[k], 2000) || null);
  }
  if ("platform" in out && !PLATFORMS.includes(String(out.platform))) out.platform = "Other";
  if (out.followers != null) out.followers = Math.round(Number(out.followers));
  if (out.posts != null) out.posts = Math.round(Number(out.posts));
  return out;
}

const nn = (v: unknown): any => (v === "" || v === undefined || v === null || (typeof v === "number" && !Number.isFinite(v)) ? null : v);

// Instagram answer -> creator columns. "always" overwrite; "fill" only fills empty cells.
function creatorFields(a: any) {
  const ins = a.ins ?? {};
  const auto = A.autoDetails(a);
  const status = "✓ Based on last " + a.sampled + " posts" +
    (a.videos ? " (" + a.videos + " with views)" : " (no video views found)") +
    (a.hiddenLikes ? ". " + a.hiddenLikes + " posts hide likes, so engagement is lower than real." : "");
  return {
    always: {
      followers: a.followers, posts: a.posts,
      likes: nn(A.round(a.avgLikes, 0)), comments: nn(A.round(a.avgComments, 0)), views: nn(A.round(a.avgViews, 0)),
      competitors: a.competitors, collabs: a.collabs,
      quality: nn(ins.credibility), quality_score: nn(ins.qualityScore), quality_why: nn(ins.qualityWhy),
      organic_er: nn(ins.organicEr), sponsored_er: nn(ins.sponsoredEr), sponsored_lift: nn(ins.sponsoredLift),
      boosted: nn(ins.boosted), best_format: nn(ins.bestFormat), content_mix: nn(ins.contentMix),
      status, fetched_at: new Date(), source: "Instagram API",
    },
    fill: {
      category: nn(auto.category), language: nn(auto.language), reach: nn(auto.reach), yt_link: nn(auto.ytLink),
      collab_price: nn(auto.collab), ad_rights_price: nn(auto.adRights), sentiment: nn(auto.sentiment),
      deliverables: nn(auto.deliverables),
    },
  };
}

async function competitorsFor(ctx: Ctx, companyId: string): Promise<string> {
  const [s] = await asUser(ctx.claims, (tx) => tx`
    select competitors from public.campaign_settings where company_id = ${companyId} and owner_id = ${ctx.claims.sub}`);
  return String(s?.competitors ?? "");
}

// Look up handles on Instagram and save them to this person's shortlist.
async function lookupAndSave(ctx: Ctx, companyId: string, handles: string[], fee?: number | null) {
  const results = await fetchCreators(companyId, handles);
  await logUsage(companyId, ctx.claims.sub, results);
  const competitors = await competitorsFor(ctx, companyId);
  const rows: any[] = [];
  const report: Array<{ handle: string; ok: boolean; cached: boolean; message: string }> = [];
  await asUser(ctx.claims, async (tx) => {
    for (const h of handles) {
      const r = results.get(h)!;
      const [ex] = await tx`select * from public.creators where company_id = ${companyId} and owner_id = ${ctx.claims.sub} and lower(name) = ${h}`;
      if (!r.bd) {
        if (ex) await tx`update public.creators set status = ${"✗ " + r.error} where id = ${ex.id}`;
        report.push({ handle: h, ok: false, cached: r.cached, message: r.error ?? "Failed" });
        continue;
      }
      const f = creatorFields(A.analyse(r.bd, competitors));
      const set: Record<string, unknown> = { ...f.always, link: `https://www.instagram.com/${h}/`, platform: "Instagram" };
      for (const [k, v] of Object.entries(f.fill)) if (v != null && (!ex || ex[k] === null || ex[k] === "")) set[k] = v;
      if (fee != null) set.fee = fee;
      let row;
      if (ex) [row] = await tx`update public.creators set ${tx(set as any)} where id = ${ex.id} returning *`;
      else [row] = await tx`insert into public.creators ${tx({ ...set, company_id: companyId, owner_id: ctx.claims.sub, name: h } as any)} returning *`;
      rows.push(row);
      report.push({ handle: h, ok: true, cached: r.cached, message: r.cached ? "From cache (no lookup used)" : "Fetched" });
    }
  });
  return { creators: rows, results: report };
}

function handlesFrom(list: unknown): string[] {
  const arr = Array.isArray(list) ? list : [list];
  const hs = [...new Set(arr.map((x) => A.cleanHandle(x)).filter(Boolean))];
  const bad = hs.filter((h) => !HANDLE.test(h));
  if (bad.length) throw new ApiError(400, "INVALID", `These are not Instagram handles: ${bad.slice(0, 5).join(", ")}`);
  if (!hs.length) throw new ApiError(400, "INVALID", "Type an Instagram handle, like itss.vanshikaaa");
  if (hs.length > MAX_PER_CALL) throw new ApiError(400, "INVALID", `Send at most ${MAX_PER_CALL} handles at a time.`);
  return hs;
}

export const workActions = {
  // Everything the dashboard shows for one company. scope "team" (admins only) includes everyone's rows.
  async "work.state"(ctx: Ctx) {
    const { companyId, a } = await requireCompany(ctx, { active: false });
    const team = ctx.body.scope === "team" && a.admin;
    return await asUser(ctx.claims, async (tx) => {
      const mine = team ? tx`true` : tx`owner_id = ${ctx.claims.sub}`;
      const creators = await tx`select c.*, p.email as owner_email from public.creators c join public.profiles p on p.id = c.owner_id
                                where c.company_id = ${companyId} and ${mine} order by c.updated_at desc`;
      const posts = await tx`select c.*, p.email as owner_email from public.campaign_posts c join public.profiles p on p.id = c.owner_id
                             where c.company_id = ${companyId} and ${mine} order by c.created_at`;
      const [settings] = await tx`select * from public.campaign_settings where company_id = ${companyId} and owner_id = ${ctx.claims.sub}`;
      const connections = await tx`select id, username, page_name, status, last_error, last_checked_at, created_at
                                   from public.ig_connections where company_id = ${companyId} and status <> 'revoked' order by created_at`;
      const capacity = await tx`select * from public.company_capacity(${companyId})`;
      return { creators, posts, settings: settings ?? null, connections, capacity, scope: team ? "team" : "mine", active: a.active, admin: a.admin };
    });
  },

  async "creators.lookup"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx);
    return await lookupAndSave(ctx, companyId, handlesFrom(ctx.body.handles ?? ctx.body.handle), numOrNull(ctx.body.fee));
  },

  // Re-fetch this person's Instagram creators that are older than 12 hours (or missing the newer columns).
  async "creators.refresh"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx);
    const stale = await asUser(ctx.claims, (tx) => tx`
      select lower(name) as h from public.creators
      where company_id = ${companyId} and owner_id = ${ctx.claims.sub} and platform = 'Instagram' and source = 'Instagram API'
        and (fetched_at is null or fetched_at < now() - interval '12 hours' or best_format is null)
      order by fetched_at nulls first limit ${MAX_PER_CALL}`);
    const hs = stale.map((r) => r.h as string).filter((h) => HANDLE.test(h));
    if (!hs.length) return { creators: [], results: [], remaining: 0 };
    const res = await lookupAndSave(ctx, companyId, hs);
    const [left] = await asUser(ctx.claims, (tx) => tx`
      select count(*)::int as n from public.creators
      where company_id = ${companyId} and owner_id = ${ctx.claims.sub} and platform = 'Instagram' and source = 'Instagram API'
        and (fetched_at is null or fetched_at < now() - interval '12 hours' or best_format is null)`);
    return { ...res, remaining: left.n };
  },

  async "creators.save"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx);
    const id = uuid(ctx.body.id);
    return await asUser(ctx.claims, async (tx) => {
      const [ex] = await tx`select source from public.creators where id = ${id} and company_id = ${companyId}`;
      if (!ex) throw new ApiError(404, "NOT_FOUND", "Creator not found.");
      const set = clean(ctx.body.fields ?? {}, ex.source === "Manual" ? { ...EDITABLE, ...MANUAL_NUMBERS } : EDITABLE);
      if (!Object.keys(set).length) throw new ApiError(400, "INVALID", "Nothing to save.");
      const [row] = await tx`update public.creators set ${tx(set as any)} where id = ${id} returning *`;
      if (!row) throw new ApiError(403, "FORBIDDEN", "You can only edit your own creators.");
      return { creator: row };
    });
  },

  // Manual creator (YouTube, Moj, or numbers you already have), or pasted rows.
  async "creators.add"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx);
    const list = Array.isArray(ctx.body.rows) ? ctx.body.rows : [ctx.body.creator ?? {}];
    if (list.length > 500) throw new ApiError(400, "INVALID", "Paste at most 500 rows at a time.");
    const manual = ctx.body.manual === true;
    const saved: any[] = [];
    await asUser(ctx.claims, async (tx) => {
      for (const c of list) {
        let name = str(c?.name, 120);
        const linkHandle = /instagram\.com\//i.test(String(c?.link ?? "")) ? A.cleanHandle(c.link) : "";
        if (/instagram\.com\//i.test(name) || name.startsWith("@")) name = A.cleanHandle(name);
        if (!name && linkHandle) name = linkHandle;
        if (!name) continue;
        const handleLike = HANDLE.test(name.toLowerCase());
        let platform = PLATFORMS.includes(c?.platform) ? c.platform : ((linkHandle || handleLike) ? "Instagram" : "Other");
        const ig = !manual && platform === "Instagram" && (linkHandle || handleLike);
        if (ig) name = name.toLowerCase();
        const set: Record<string, any> = { ...clean(c ?? {}, { ...EDITABLE, ...MANUAL_NUMBERS }), platform };
        for (const k of Object.keys(set)) if (set[k] === null) delete set[k];
        if (!set.link && platform === "Instagram" && handleLike) set.link = `https://www.instagram.com/${name}/`;
        set.source = ig ? "Instagram API" : "Manual";
        set.status = ig ? "Added. Use Refresh to fetch live numbers from Instagram." : "Entered manually";
        const [ex] = await tx`select id from public.creators where company_id = ${companyId} and owner_id = ${ctx.claims.sub} and lower(name) = ${name.toLowerCase()}`;
        const [row] = ex
          ? await tx`update public.creators set ${tx(set as any)} where id = ${ex.id} returning *`
          : await tx`insert into public.creators ${tx({ ...set, company_id: companyId, owner_id: ctx.claims.sub, name } as any)} returning *`;
        saved.push(row);
      }
    });
    return { creators: saved, added: saved.length };
  },

  async "creators.remove"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { active: false });
    const ids = (Array.isArray(ctx.body.ids) ? ctx.body.ids : [ctx.body.id]).map((x: unknown) => uuid(x));
    const gone = await asUser(ctx.claims, (tx) => tx`delete from public.creators where company_id = ${companyId} and id = any(${ids}) returning id`);
    return { removed: gone.length };
  },

  // Remove all of MY creators (never other people's).
  async "creators.clear"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { active: false });
    const gone = await asUser(ctx.claims, (tx) => tx`delete from public.creators where company_id = ${companyId} and owner_id = ${ctx.claims.sub} returning id`);
    return { removed: gone.length };
  },

  async "settings.save"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx);
    const s = ctx.body.settings ?? {};
    const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
    const row = {
      company_id: companyId, owner_id: ctx.claims.sub, name: str(s.name, 120) || null, budget: numOrNull(s.budget),
      start_date: date(s.start), end_date: date(s.end), competitors: str(s.competitors, 4000) || null,
    };
    const [saved] = await asUser(ctx.claims, (tx) => tx`
      insert into public.campaign_settings ${tx(row)}
      on conflict (company_id, owner_id) do update set name = excluded.name, budget = excluded.budget,
        start_date = excluded.start_date, end_date = excluded.end_date, competitors = excluded.competitors
      returning *`);
    return { settings: saved };
  },

  // Campaign post: Instagram link -> numbers fetched; anything else -> numbers typed.
  async "posts.add"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx);
    const p = ctx.body.post ?? {};
    const platform = PLATFORMS.includes(p.platform) ? p.platform : "Instagram";
    const code = A.shortcode(p.link);
    const isIg = !!code && platform.startsWith("Instagram") && platform !== "Instagram Story";
    const handle = isIg ? A.cleanHandle(p.handle) : str(p.handle, 120);
    if (!handle) throw new ApiError(400, "INVALID", "Add the creator's name or Instagram handle.");
    if (isIg && !HANDLE.test(handle)) throw new ApiError(400, "INVALID", "That is not an Instagram handle.");
    if (!isIg && numOrNull(p.views) == null) throw new ApiError(400, "INVALID", "For posts without an Instagram post link, type the views yourself.");
    let found: any = null, status = "Entered manually", pv: any = null;
    if (isIg) {
      const res = await fetchCreators(companyId, [handle], A.POSTS_TO_SEARCH);
      await logUsage(companyId, ctx.claims.sub, res);
      const r = res.get(handle)!;
      if (r.bd) {
        found = A.matchPost(r.bd.media?.data ?? [], code);
        if (found) pv = A.postViews(found, r.bd);
        status = found
          ? (pv?.est ? "✓ Likes and comments from Instagram. Views estimated (Instagram doesn't share views for photo posts)." : "✓ Numbers fetched from Instagram")
          : `Post not found in the creator's last ${A.POSTS_TO_SEARCH} posts. Type the numbers yourself.`;
      } else status = "✗ " + r.error;
    }
    const row = {
      company_id: companyId, owner_id: ctx.claims.sub,
      post_code: code || ("M" + crypto.randomUUID().slice(0, 8).toUpperCase()),
      handle, platform, status,
      link: found?.permalink ?? (code ? `https://www.instagram.com/p/${code}/` : (str(p.link, 500) || null)),
      fee: numOrNull(p.fee),
      views: found ? (numOrNull(p.views) ?? nn(pv?.views)) : numOrNull(p.views),
      likes: found ? nn(found.like_count) : numOrNull(p.likes),
      comments: found ? nn(found.comments_count) : numOrNull(p.comments),
      media_type: found ? (found.media_product_type || found.media_type || null) : null,
      posted_at: found?.timestamp ? new Date(found.timestamp) : null,
    };
    const [saved] = await asUser(ctx.claims, (tx) => tx`
      insert into public.campaign_posts ${tx(row as any)}
      on conflict (company_id, owner_id, post_code) do update set
        handle = excluded.handle, platform = excluded.platform, status = excluded.status, link = excluded.link,
        fee = coalesce(excluded.fee, public.campaign_posts.fee), views = coalesce(excluded.views, public.campaign_posts.views),
        likes = coalesce(excluded.likes, public.campaign_posts.likes), comments = coalesce(excluded.comments, public.campaign_posts.comments),
        media_type = coalesce(excluded.media_type, public.campaign_posts.media_type), posted_at = coalesce(excluded.posted_at, public.campaign_posts.posted_at)
      returning *`);
    return { post: saved, status };
  },

  async "posts.update"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx);
    const id = uuid(ctx.body.id);
    const set = clean(ctx.body.fields ?? {}, { fee: "num", views: "num", likes: "num", comments: "num" });
    if (!Object.keys(set).length) throw new ApiError(400, "INVALID", "Nothing to save.");
    const [row] = await asUser(ctx.claims, (tx) => tx`update public.campaign_posts set ${tx(set as any)} where id = ${id} and company_id = ${companyId} returning *`);
    if (!row) throw new ApiError(404, "NOT_FOUND", "Post not found.");
    return { post: row };
  },

  async "posts.remove"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { active: false });
    const id = uuid(ctx.body.id);
    const gone = await asUser(ctx.claims, (tx) => tx`delete from public.campaign_posts where id = ${id} and company_id = ${companyId} returning id`);
    return { removed: gone.length };
  },

  // Refresh numbers of this person's Instagram campaign posts (one lookup per creator).
  async "posts.refresh"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx);
    const posts = await asUser(ctx.claims, (tx) => tx`
      select * from public.campaign_posts where company_id = ${companyId} and owner_id = ${ctx.claims.sub}
        and platform like 'Instagram%' and platform <> 'Instagram Story'`);
    const ig = posts.filter((p) => A.shortcode(p.link) && HANDLE.test(p.handle));
    const handles = [...new Set(ig.map((p) => p.handle as string))].slice(0, MAX_PER_CALL);
    const res = await fetchCreators(companyId, handles, A.POSTS_TO_SEARCH);
    await logUsage(companyId, ctx.claims.sub, res);
    const errors: string[] = [];
    await asUser(ctx.claims, async (tx) => {
      for (const p of ig) {
        const r = res.get(p.handle);
        if (!r) continue;
        if (!r.bd) { await tx`update public.campaign_posts set status = ${"✗ " + r.error} where id = ${p.id}`; errors.push(`${p.handle}: ${r.error}`); continue; }
        const m = A.matchPost(r.bd.media?.data ?? [], A.shortcode(p.link));
        if (!m) { await tx`update public.campaign_posts set status = ${`Post not found in the last ${A.POSTS_TO_SEARCH} posts. Numbers kept as they were.`} where id = ${p.id}`; continue; }
        const pv = A.postViews(m, r.bd);
        const keepTyped = pv.est && p.views != null && !String(p.status ?? "").includes("estimated");
        const views = keepTyped ? p.views : nn(pv.views);
        await tx`update public.campaign_posts set views = ${views}, likes = ${nn(m.like_count)}, comments = ${nn(m.comments_count)},
                 status = ${pv.est && !keepTyped ? "✓ Likes and comments from Instagram. Views estimated (Instagram doesn't share views for photo posts)." : "✓ Numbers fetched from Instagram"}
                 where id = ${p.id}`;
      }
    });
    return { refreshed: ig.length, errors };
  },
};
