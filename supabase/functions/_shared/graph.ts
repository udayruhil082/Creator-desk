// Instagram Graph API (Business Discovery) and Facebook Login for Business.
import { ApiError, env } from "./http.ts";

export const API_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;
export const HOURLY_CAP = 150; // safe budget per connection, below Meta's ~200 calls/hour
const MEDIA_FULL = "like_count,comments_count,view_count,media_type,media_product_type,timestamp,permalink,caption";
const MEDIA_BASIC = "like_count,comments_count,media_type,timestamp,permalink,caption";

export type GraphError = { code?: number; error_subcode?: number; message?: string };
export type Discovery = { bd?: Record<string, unknown>; error?: GraphError };

async function get(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${GRAPH}/${path}?${q}`);
  let j: Record<string, unknown> = {};
  try { j = await r.json(); } catch { return { error: { message: `Unexpected answer from Instagram (HTTP ${r.status}).` } }; }
  return j;
}

export async function discovery(igUserId: string, token: string, handle: string, limit: number): Promise<Discovery> {
  const fields = (media: string) =>
    `business_discovery.username(${handle}){username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,media.limit(${limit}){${media}}}`;
  let res = await get(igUserId, { fields: fields(MEDIA_FULL), access_token: token });
  const e = res.error as GraphError | undefined;
  if (e && /view_count|media_product_type/i.test(e.message ?? "")) {
    res = await get(igUserId, { fields: fields(MEDIA_BASIC), access_token: token });
  }
  if (res.error) return { error: res.error as GraphError };
  if (!res.business_discovery) return { error: { message: "No data returned for this account." } };
  return { bd: res.business_discovery as Record<string, unknown> };
}

export function isRateLimit(e?: GraphError): boolean { return !!e && [4, 17, 32, 613].includes(Number(e.code)); }
export function isTokenDead(e?: GraphError): boolean { return !!e && Number(e.code) === 190; }

export function friendlyError(e: GraphError): string {
  const code = Number(e.code), sub = e.error_subcode, msg = e.message ?? "Unknown error";
  if (code === 190) return "This Instagram connection has expired. The company admin needs to reconnect it.";
  if (isRateLimit(e)) return "Instagram's hourly limit is used up for this account. Try again after the hour resets.";
  if (sub === 2207013 || /cannot find|invalid user id|does not exist/i.test(msg)) {
    return "Account not found, or it is a personal account. Only Creator and Business accounts can be read. Check the handle.";
  }
  if (code === 10 || code === 200) return `Permission missing on the Instagram connection (Meta says: ${msg}).`;
  return msg;
}

// Facebook Login for Business: code -> long-lived user token -> Pages with an Instagram professional account.
export type IgAccount = { igUserId: string; username: string; pageId: string; pageName: string; pageToken: string };

export async function exchangeLoginCode(code: string, redirectUri: string): Promise<IgAccount[]> {
  const appId = env("FB_APP_ID"), secret = env("FB_APP_SECRET");
  const must = (j: Record<string, unknown>) => {
    if (j.error) throw new ApiError(400, "META", `Facebook says: ${(j.error as GraphError).message ?? "login failed"}`);
    return j;
  };
  const short = must(await get("oauth/access_token", { client_id: appId, client_secret: secret, redirect_uri: redirectUri, code }));
  const long = must(await get("oauth/access_token", {
    grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: String(short.access_token),
  }));
  const pages = must(await get("me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100", access_token: String(long.access_token),
  }));
  return ((pages.data as Array<Record<string, any>>) ?? [])
    .filter((p) => p.instagram_business_account?.id && p.access_token)
    .map((p) => ({
      igUserId: String(p.instagram_business_account.id), username: String(p.instagram_business_account.username ?? ""),
      pageId: String(p.id), pageName: String(p.name ?? ""), pageToken: String(p.access_token),
    }));
}

// One cheap call to check a connection still works.
export async function checkConnection(igUserId: string, token: string): Promise<{ ok: boolean; username?: string; error?: string; dead?: boolean }> {
  const j = await get(igUserId, { fields: "username,followers_count", access_token: token });
  if (j.error) return { ok: false, error: friendlyError(j.error as GraphError), dead: isTokenDead(j.error as GraphError) };
  return { ok: true, username: String(j.username ?? "") };
}
