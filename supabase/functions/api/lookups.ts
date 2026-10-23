// The lookup engine.
//   1. Answers less than 6 hours old come from this company's own cache (free).
//   2. The rest are spread over the company's OWN connected Instagram accounts, never more than
//      the safe hourly budget on each one (reserved atomically in the database).
//   3. Instagram is called 10 at a time. A "slow down" answer stops that account for the hour;
//      an expired token marks the connection as expired so the admin sees it.
import { asServer } from "../_shared/db.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { discovery, friendlyError, HOURLY_CAP, isRateLimit, isTokenDead, type GraphError } from "../_shared/graph.ts";
import { POSTS_FOR_BRANDS } from "../_shared/analysis.ts";

export type LookupResult = { bd?: Record<string, any>; error?: string; cached: boolean; connectionId?: string };

const CACHE_HOURS = 6;

export function resetTimeText(): string {
  const next = new Date((Math.floor(Date.now() / 3600000) + 1) * 3600000);
  return next.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
}

export async function fetchCreators(companyId: string, handles: string[], limit = POSTS_FOR_BRANDS): Promise<Map<string, LookupResult>> {
  const out = new Map<string, LookupResult>();
  const key = (h: string) => (limit === POSTS_FOR_BRANDS ? h : `${h}#${limit}`);
  if (!handles.length) return out;

  // 1. cache
  const cached = await asServer((tx) => tx`
    select handle, data from public.bd_cache
    where company_id = ${companyId} and handle = any(${handles.map(key)})
      and fetched_at > now() - make_interval(hours => ${CACHE_HOURS})`);
  const hit = new Map(cached.map((r) => [r.handle as string, r.data]));
  const need: string[] = [];
  for (const h of handles) {
    const d = hit.get(key(h));
    if (d) out.set(h, { bd: d, cached: true }); else need.push(h);
  }
  if (!need.length) return out;

  // 2. the company's own active Instagram accounts
  const conns = await asServer((tx) => tx`
    select c.id, c.ig_user_id, s.token_ciphertext
    from public.ig_connections c join public.ig_connection_secrets s on s.connection_id = c.id
    where c.company_id = ${companyId} and c.status = 'active'
    order by c.created_at`);
  if (!conns.length) {
    for (const h of need) out.set(h, { cached: false, error: "No Instagram account is connected yet. Ask your company admin to connect one in Settings." });
    return out;
  }
  const plan: Array<{ conn: any; handles: string[] }> = [];
  let rest = need.slice();
  for (const c of conns) {
    if (!rest.length) break;
    const [g] = await asServer((tx) => tx`select public.reserve_budget(${c.id}, ${rest.length}, ${HOURLY_CAP}) as n`);
    const n = Number(g.n);
    if (n > 0) { plan.push({ conn: c, handles: rest.slice(0, n) }); rest = rest.slice(n); }
  }
  const limitMsg = `Safe hourly limit reached on your company's Instagram accounts (${HOURLY_CAP} lookups per account per hour). Try again after ${resetTimeText()}.`;
  for (const h of rest) out.set(h, { cached: false, error: limitMsg });

  // 3. call Instagram
  const fresh: Array<[string, unknown]> = [];
  await Promise.all(plan.map(async ({ conn, handles: hs }) => {
    let token: string;
    try { token = await decryptSecret(conn.token_ciphertext); }
    catch { for (const h of hs) out.set(h, { cached: false, error: "The stored Instagram connection could not be read. Reconnect it." }); return; }
    let stop: string | null = null;
    for (let i = 0; i < hs.length; i += 10) {
      const part = hs.slice(i, i + 10);
      if (stop) { for (const h of part) out.set(h, { cached: false, error: stop, connectionId: conn.id }); continue; }
      const res = await Promise.all(part.map((h) => discovery(conn.ig_user_id, token, h, limit).catch((e) => ({ error: { message: String(e?.message ?? e) } as GraphError }))));
      for (let k = 0; k < part.length; k++) {
        const h = part[k], r = res[k] as { bd?: any; error?: GraphError };
        if (r.bd) { out.set(h, { bd: r.bd, cached: false, connectionId: conn.id }); fresh.push([key(h), r.bd]); continue; }
        const e = r.error ?? {};
        out.set(h, { cached: false, error: friendlyError(e), connectionId: conn.id });
        if (isRateLimit(e)) {
          stop = friendlyError(e);
          await asServer((tx) => tx`select public.exhaust_budget(${conn.id}, ${HOURLY_CAP})`);
        } else if (isTokenDead(e)) {
          stop = friendlyError(e);
          await asServer((tx) => tx`update public.ig_connections set status = 'expired', last_error = ${stop}, last_checked_at = now() where id = ${conn.id}`);
        }
      }
    }
  }));

  // 4. save fresh answers to this company's cache
  if (fresh.length) {
    await asServer(async (tx) => {
      for (const [h, bd] of fresh) {
        await tx`insert into public.bd_cache (company_id, handle, data, fetched_at) values (${companyId}, ${h}, ${tx.json(bd as any)}, now())
                 on conflict (company_id, handle) do update set data = excluded.data, fetched_at = now()`;
      }
      await tx`delete from public.bd_cache where company_id = ${companyId} and fetched_at < now() - interval '2 days'`;
    });
  }
  return out;
}

export async function logUsage(companyId: string, userId: string, results: Map<string, LookupResult>) {
  if (!results.size) return;
  const rows = [...results.entries()].map(([h, r]) => ({
    company_id: companyId, user_id: userId, connection_id: r.connectionId ?? null, handle: h,
    cached: r.cached, ok: !r.error, error: r.error ? r.error.slice(0, 300) : null,
  }));
  await asServer((tx) => tx`insert into public.lookup_usage ${tx(rows)}`);
}
