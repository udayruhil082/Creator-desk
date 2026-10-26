// End-to-end test of the API and the Razorpay webhook on a scratch database.
// Instagram (graph.facebook.com) and Razorpay (api.razorpay.com) are replaced by fakes.
import { SignJWT } from "npm:jose@5.9.6";
import postgres from "npm:postgres@3.4.5";
import { assert, assertEquals } from "./assert.ts";

const DB = Deno.env.get("TEST_DB_URL")!;
const SUPA = "https://test-project.supabase.co";
const JWT_SECRET = "test-jwt-secret-that-is-long-enough-123";
const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
Object.entries({
  SUPABASE_DB_URL: DB, SUPABASE_URL: SUPA, JWT_SECRET, TOKEN_ENC_KEY: KEY,
  RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: "rzp_secret_xyz", RAZORPAY_WEBHOOK_SECRET: "whsec_123",
  FB_APP_ID: "1113383891047813", FB_APP_SECRET: "fb_secret", FB_REDIRECT_URIS: "https://mycreatordesk.co.in/",
  ALLOWED_ORIGINS: "https://mycreatordesk.co.in",
}).forEach(([k, v]) => Deno.env.set(k, v));

const { handle } = await import("../functions/api/handler.ts");
const { handleWebhook } = await import("../functions/razorpay-webhook/handler.ts");
const { hmacHex } = await import("../functions/_shared/crypto.ts");
const sql = postgres(DB, { max: 2, onnotice: () => {} });

// ---------------- fakes ----------------
const calls = { discovery: 0, razorpay: 0 };
const fake = {
  rateLimitFor: new Set<string>(), deadTokenFor: new Set<string>(), notFound: new Set(["ghost.account"]),
  pages: [{ id: "page_1", name: "Brand A Page", access_token: "PAGE_TOKEN_A", instagram_business_account: { id: "ig_brand_a", username: "brand_a" } }],
  payments: {} as Record<string, any>,
};
function bdFor(h: string) {
  const sponsored = (i: number) => i % 8 === 0;
  return {
    username: h, name: h, biography: "fashion and lifestyle creator", followers_count: 52000, follows_count: 800, media_count: 300,
    media: { data: Array.from({ length: 25 }, (_, i) => ({
      id: `${h}_${i}`, like_count: 1500 + i * 7, comments_count: 45 + (i % 5), view_count: i % 5 === 1 ? undefined : 18000 + i * 100,
      media_type: i % 5 === 1 ? "CAROUSEL_ALBUM" : "VIDEO", media_product_type: i % 5 === 1 ? "FEED" : "REELS",
      caption: sponsored(i) ? "Loving @glowbrand #ad" : "ootd", timestamp: "2026-10-01T10:00:00+0000",
      permalink: `https://www.instagram.com/reel/CODE${i}${h.length}/`,
    })) },
  };
}
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
  if (url.host === "graph.facebook.com") {
    const p = url.pathname.replace(/^\/v26\.0\//, "");
    const token = url.searchParams.get("access_token") ?? "";
    if (p === "oauth/access_token") return ok({ access_token: url.searchParams.get("code") ? "SHORT" : "LONG" });
    if (p === "me/accounts") return ok({ data: fake.pages });
    const fields = url.searchParams.get("fields") ?? "";
    const m = fields.match(/business_discovery\.username\(([^)]+)\)/);
    if (m) {
      calls.discovery++;
      const h = m[1];
      if (fake.deadTokenFor.has(token)) return ok({ error: { code: 190, message: "Error validating access token" } }, 400);
      if (fake.rateLimitFor.has(token)) return ok({ error: { code: 4, message: "Application request limit reached" } }, 400);
      if (fake.notFound.has(h)) return ok({ error: { code: 110, error_subcode: 2207013, message: "Cannot find User" } }, 400);
      return ok({ business_discovery: bdFor(h) });
    }
    if (fields.startsWith("username")) return ok({ username: "brand_a", followers_count: 1000 });
    return ok({ error: { message: "unexpected " + p } }, 400);
  }
  if (url.host === "api.razorpay.com") {
    calls.razorpay++;
    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== "Basic " + btoa("rzp_test_abc:rzp_secret_xyz")) return ok({ error: { description: "bad key" } }, 401);
    if (url.pathname === "/v1/orders") {
      const b = JSON.parse(String(init?.body));
      return ok({ id: "order_" + crypto.randomUUID().slice(0, 8), amount: b.amount, currency: "INR", status: "created" });
    }
    const pm = url.pathname.match(/^\/v1\/payments\/([^/]+)(\/capture)?$/);
    if (pm) return ok(fake.payments[pm[1]] ?? { error: { description: "no such payment" } }, fake.payments[pm[1]] ? 200 : 404);
  }
  return realFetch(input, init);
}) as typeof fetch;

// ---------------- helpers ----------------
type U = { id: string; email: string; token: string };
async function user(email: string): Promise<U> {
  const [r] = await sql`insert into auth.users (email, raw_user_meta_data) values (${email}, ${sql.json({ full_name: email.split("@")[0] })}) returning id`;
  const token = await new SignJWT({ role: "authenticated", email })
    .setProtectedHeader({ alg: "HS256" }).setSubject(r.id).setIssuer(`${SUPA}/auth/v1`).setAudience("authenticated")
    .setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(JWT_SECRET));
  return { id: r.id, email, token };
}
async function api(u: U | null, action: string, params: Record<string, unknown> = {}) {
  const res = await handle(new Request(`${SUPA}/functions/v1/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://mycreatordesk.co.in", ...(u ? { Authorization: `Bearer ${u.token}` } : {}) },
    body: JSON.stringify({ action, ...params }),
  }));
  const body = await res.json();
  return { status: res.status, ...body, cors: res.headers.get("access-control-allow-origin") };
}
async function must(u: U, action: string, params: Record<string, unknown> = {}) {
  const r = await api(u, action, params);
  if (!r.ok) throw new Error(`${action} failed: ${JSON.stringify(r.error)}`);
  return r.data;
}
async function webhook(body: unknown, secret = "whsec_123") {
  const raw = JSON.stringify(body);
  const res = await handleWebhook(new Request(`${SUPA}/functions/v1/razorpay-webhook`, {
    method: "POST", headers: { "x-razorpay-signature": await hmacHex(secret, raw) }, body: raw,
  }));
  return { status: res.status, ...(await res.json()) };
}
async function payAndVerify(u: U, companyId: string, planId: string) {
  const order = await must(u, "billing.order", { companyId, planId, cycle: "monthly" });
  const paymentId = "pay_" + crypto.randomUUID().slice(0, 8);
  fake.payments[paymentId] = { id: paymentId, order_id: order.orderId, amount: order.amount, currency: "INR", status: "captured", method: "upi" };
  const signature = await hmacHex("rzp_secret_xyz", `${order.orderId}|${paymentId}`);
  return { order, paymentId, signature };
}

const T = (name: string, fn: () => Promise<void>) => Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });
let owner: U, member: U, outsider: U, platform: U, ca = "", cb = "";

T("sign-in is required and unknown actions are refused", async () => {
  owner = await user("owner@brand-a.in"); member = await user("exec@brand-a.in");
  outsider = await user("owner@brand-b.in"); platform = await user("udayruhil.82@gmail.com");
  assertEquals((await api(null, "me")).status, 401);
  const bad = await handle(new Request(`${SUPA}/functions/v1/api`, { method: "POST", headers: { Authorization: "Bearer not.a.token" }, body: "{}" }));
  assertEquals(bad.status, 401);
  const r = await api(owner, "drop.everything");
  assertEquals([r.status, r.error.code], [404, "UNKNOWN_ACTION"]);
  assertEquals(r.cors, "https://mycreatordesk.co.in");
});

T("company signs up, pays with Razorpay, and waits for approval", async () => {
  ca = (await must(owner, "company.create", { name: "Brand A", gstin: "07ABCDE1234F1Z5", phone: "+91 98765 43210" })).companyId;
  cb = (await must(outsider, "company.create", { name: "Brand B" })).companyId;
  const me = await must(owner, "me");
  assertEquals(me.companies[0].status, "pending_payment");
  assertEquals(me.plans.length, 3);
  // members-only actions are blocked before approval
  assertEquals((await api(owner, "creators.lookup", { companyId: ca, handles: ["abc"] })).error.code, "INACTIVE");
  // enterprise cannot be bought online
  assertEquals((await api(owner, "billing.order", { companyId: ca, planId: "enterprise" })).error.code, "PLAN");
  const { order, paymentId, signature } = await payAndVerify(owner, ca, "starter");
  assertEquals(order.amount, 499900); // price always comes from the server, never the browser
  // a forged signature is refused
  assertEquals((await api(owner, "billing.verify", { orderId: order.orderId, paymentId, signature: "0".repeat(64) })).error.code, "PAYMENT");
  // someone from another company cannot confirm this payment
  assertEquals((await api(outsider, "billing.verify", { orderId: order.orderId, paymentId, signature })).error.code, "FORBIDDEN");
  const v = await must(owner, "billing.verify", { orderId: order.orderId, paymentId, signature });
  assertEquals(v.result, "awaiting_approval");
  assertEquals((await must(owner, "billing.verify", { orderId: order.orderId, paymentId, signature })).result, "already_paid");
  assertEquals((await api(owner, "billing.order", { companyId: ca, planId: "starter" })).error.code, "ALREADY_PAID");
});

T("only the platform owner approves", async () => {
  assertEquals((await api(owner, "platform.approve", { companyId: ca })).error.code, "FORBIDDEN");
  assertEquals((await api(owner, "platform.companies")).error.code, "FORBIDDEN");
  const list = (await must(platform, "platform.companies")).companies;
  assertEquals(list.find((c: any) => c.id === ca).status, "pending_approval");
  await must(platform, "platform.approve", { companyId: ca });
  const me = await must(owner, "me");
  assertEquals([me.companies[0].status, me.companies[0].seat_limit, me.companies[0].ig_account_limit], ["active", 5, 1]);
});

T("company admin connects its own Instagram; token is stored encrypted; plan limit holds", async () => {
  assertEquals((await api(owner, "ig.connect", { companyId: ca, code: "abc", redirectUri: "https://evil.example/" })).error.code, "INVALID");
  const c = (await must(owner, "ig.connect", { companyId: ca, code: "abc", redirectUri: "https://mycreatordesk.co.in/" })).connection;
  assertEquals(c.username, "brand_a");
  const [s] = await sql`select token_ciphertext from public.ig_connection_secrets where connection_id = ${c.id}`;
  assert(s.token_ciphertext.startsWith("v1.") && !s.token_ciphertext.includes("PAGE_TOKEN_A"), "token must be encrypted");
  // reconnecting the same account just refreshes it
  await must(owner, "ig.connect", { companyId: ca, code: "abc2", redirectUri: "https://mycreatordesk.co.in/" });
  // a second account is over the Starter limit (1)
  fake.pages = [{ id: "page_2", name: "Second", access_token: "PAGE_TOKEN_A2", instagram_business_account: { id: "ig_brand_a2", username: "brand_a2" } }];
  assertEquals((await api(owner, "ig.connect", { companyId: ca, code: "x", redirectUri: "https://mycreatordesk.co.in/" })).error.code, "IG_LIMIT");
  // the same Instagram account cannot be used by another company
  fake.pages = [{ id: "page_1", name: "Brand A Page", access_token: "PAGE_TOKEN_A", instagram_business_account: { id: "ig_brand_a", username: "brand_a" } }];
  const { order, paymentId, signature } = await payAndVerify(outsider, cb, "growth");
  await must(outsider, "billing.verify", { orderId: order.orderId, paymentId, signature });
  await must(platform, "platform.approve", { companyId: cb });
  assertEquals((await api(outsider, "ig.connect", { companyId: cb, code: "x", redirectUri: "https://mycreatordesk.co.in/" })).error.code, "IG_IN_USE");
  const t = await must(owner, "ig.test", { companyId: ca, connectionId: c.id });
  assertEquals([t.ok, t.message], [true, "Connected as @brand_a"]);
});

T("team: invite, accept, and members only see their own work", async () => {
  assertEquals((await api(member, "ig.connect", { companyId: ca, code: "x", redirectUri: "https://mycreatordesk.co.in/" })).error.code, "FORBIDDEN");
  const inv = await must(owner, "invites.create", { companyId: ca, email: "Exec@Brand-A.in" });
  assertEquals((await api(outsider, "invites.accept", { invitationId: inv.invitationId })).error.code, "FORBIDDEN");
  const me = await must(member, "me");
  assertEquals(me.invitations.length, 1);
  await must(member, "invites.accept", { invitationId: inv.invitationId });
  const team = await must(owner, "members.list", { companyId: ca });
  assertEquals([team.members.length, team.seatLimit], [2, 5]);
  assertEquals((await must(member, "members.list", { companyId: ca })).invitations.length, 0); // members don't see invites
});

T("lookups: fetched once, then from cache; quality and content mix saved; usage logged", async () => {
  const before = calls.discovery;
  const r = await must(owner, "creators.lookup", { companyId: ca, handles: ["@Glow.With.Riya", "https://www.instagram.com/style.by.sam/", "ghost.account"], fee: 15000 });
  assertEquals(calls.discovery - before, 3);
  assertEquals(r.results.map((x: any) => x.ok), [true, true, false]);
  const riya = r.creators.find((c: any) => c.name === "glow.with.riya");
  assert(/^(Genuine|Check|Suspicious) · \d+\/100$/.test(riya.quality), riya.quality);
  assert(riya.content_mix.startsWith("Reels"), riya.content_mix);
  assertEquals(Number(riya.fee), 15000);
  assertEquals(riya.category, "Fashion");
  const again = await must(owner, "creators.lookup", { companyId: ca, handles: ["glow.with.riya"] });
  assertEquals(calls.discovery - before, 3); // no new Instagram call
  assertEquals(again.results[0].cached, true);
  await must(member, "creators.lookup", { companyId: ca, handles: ["member.pick"] });
  const mine = await must(member, "work.state", { companyId: ca });
  assertEquals(mine.creators.map((c: any) => c.name), ["member.pick"]);
  const asTeam = await must(member, "work.state", { companyId: ca, scope: "team" }); // members cannot widen their view
  assertEquals(asTeam.creators.length, 1);
  const admin = await must(owner, "work.state", { companyId: ca, scope: "team" });
  assertEquals(admin.creators.length, 3);
  assertEquals((await api(outsider, "work.state", { companyId: ca })).error.code, "FORBIDDEN");
  const usage = await must(owner, "usage.get", { companyId: ca });
  const byEmail = Object.fromEntries(usage.members.map((m: any) => [m.email, m]));
  assertEquals(Number(byEmail["owner@brand-a.in"].lookups), 2);
  assertEquals(Number(byEmail["owner@brand-a.in"].from_cache), 1);
  assertEquals(Number(byEmail["exec@brand-a.in"].lookups), 1);
  assertEquals((await api(member, "usage.get", { companyId: ca })).error.code, "FORBIDDEN");
});

T("editing: own rows only, Instagram numbers locked, other companies blocked", async () => {
  const st = await must(owner, "work.state", { companyId: ca, scope: "team" });
  const memberRow = st.creators.find((c: any) => c.name === "member.pick");
  const ownerRow = st.creators.find((c: any) => c.name === "glow.with.riya");
  const saved = (await must(member, "creators.save", { companyId: ca, id: memberRow.id, fields: { fee: "₹12,000", followers: 99, category: "Beauty" } })).creator;
  assertEquals([Number(saved.fee), Number(saved.followers), saved.category], [12000, 52000, "Beauty"]); // followers stay from Instagram
  assertEquals((await api(member, "creators.save", { companyId: ca, id: ownerRow.id, fields: { fee: 1 } })).error.code, "NOT_FOUND");
  assertEquals((await api(outsider, "creators.save", { companyId: ca, id: ownerRow.id, fields: { fee: 1 } })).error.code, "FORBIDDEN");
  assertEquals((await api(outsider, "creators.remove", { companyId: cb, ids: [ownerRow.id] })).data.removed, 0);
  const manual = (await must(member, "creators.add", { companyId: ca, manual: true, creator: { name: "Kitchen Diaries", platform: "YouTube", followers: 240000, views: 90000 } })).creators[0];
  assertEquals([manual.source, Number(manual.followers)], ["Manual", 240000]);
});

T("hourly budget: never more than 150 per account; Instagram 'slow down' and expired token are handled", async () => {
  const [c] = await sql`select id from public.ig_connections where company_id = ${ca} and status = 'active'`;
  await sql`update public.ig_budget set used = 149 where connection_id = ${c.id}`;
  const before = calls.discovery;
  const r = await must(owner, "creators.lookup", { companyId: ca, handles: ["n.one", "n.two", "n.three"] });
  assertEquals(calls.discovery - before, 1);
  assertEquals(r.results.filter((x: any) => x.ok).length, 1);
  assert(r.results[1].message.includes("Safe hourly limit"), r.results[1].message);
  await sql`update public.ig_budget set used = 0 where connection_id = ${c.id}`;
  fake.rateLimitFor.add("PAGE_TOKEN_A");
  const rl = await must(owner, "creators.lookup", { companyId: ca, handles: ["r.one"] });
  assert(rl.results[0].message.includes("hourly limit"), rl.results[0].message);
  const [b] = await sql`select used from public.ig_budget where connection_id = ${c.id} and hour_start = date_trunc('hour', now())`;
  assertEquals(b.used, 150);
  fake.rateLimitFor.clear();
  await sql`update public.ig_budget set used = 0 where connection_id = ${c.id}`;
  fake.deadTokenFor.add("PAGE_TOKEN_A");
  await must(owner, "creators.lookup", { companyId: ca, handles: ["d.one"] });
  const [conn] = await sql`select status from public.ig_connections where id = ${c.id}`;
  assertEquals(conn.status, "expired");
  const none = await must(owner, "creators.lookup", { companyId: ca, handles: ["d.two"] });
  assert(none.results[0].message.includes("No Instagram account is connected"), none.results[0].message);
  fake.deadTokenFor.clear();
  await must(owner, "ig.connect", { companyId: ca, code: "again", redirectUri: "https://mycreatordesk.co.in/" });
});

T("campaign posts: Instagram link fetched, manual post needs views", async () => {
  const p = await must(member, "posts.add", { companyId: ca, post: { handle: "style.by.sam", link: "https://www.instagram.com/reel/CODE012/", fee: 20000 } });
  assertEquals([Number(p.post.views), Number(p.post.likes), p.post.status], [18000, 1500, "✓ Numbers fetched from Instagram"]);
  assertEquals((await api(member, "posts.add", { companyId: ca, post: { handle: "Kitchen Diaries", platform: "YouTube" } })).error.code, "INVALID");
  const m = await must(member, "posts.add", { companyId: ca, post: { handle: "Kitchen Diaries", platform: "YouTube", views: 50000, fee: 9000 } });
  assertEquals(m.post.status, "Entered manually");
  const ref = await must(member, "posts.refresh", { companyId: ca });
  assertEquals(ref.refreshed, 1);
  assertEquals((await must(owner, "work.state", { companyId: ca })).posts.length, 0);        // owner's own view
  assertEquals((await must(owner, "work.state", { companyId: ca, scope: "team" })).posts.length, 2);
});

T("without Razorpay keys: the plan request is saved for offline payment, nothing is marked paid", async () => {
  const u = await user("owner@brand-offline.in");
  const c = (await must(u, "company.create", { name: "Brand Offline" })).companyId;
  const keep = Deno.env.get("RAZORPAY_KEY_ID")!;
  Deno.env.delete("RAZORPAY_KEY_ID");
  const before = calls.razorpay;
  const r = await api(u, "billing.order", { companyId: c, planId: "growth", cycle: "yearly" });
  Deno.env.set("RAZORPAY_KEY_ID", keep);
  assertEquals([r.status, r.error.code], [409, "OFFLINE_REQUESTED"]);
  assert(r.error.message.includes("owner@brand-offline.in"), r.error.message);
  assertEquals(calls.razorpay, before); // Razorpay never called
  const [co] = await sql`select status, plan_id, billing_cycle from public.companies where id = ${c}`;
  assertEquals([co.status, co.plan_id, co.billing_cycle], ["pending_approval", "growth", "yearly"]);
  assertEquals((await sql`select count(*)::int as n from public.payments where company_id = ${c}`)[0].n, 0);
  await must(platform, "platform.approve", { companyId: c });
  const me = await must(u, "me");
  assertEquals([me.companies[0].status, me.companies[0].seat_limit], ["active", 15]);
});

T("Razorpay webhook: signature checked, amount checked, repeats ignored", async () => {
  const c = (await must(await user("owner@brand-c.in"), "company.create", { name: "Brand C" })).companyId;
  const [ow] = await sql`select owner_id from public.companies where id = ${c}`;
  await sql`insert into public.payments (company_id, plan_id, billing_cycle, amount_paise, razorpay_order_id, created_by)
            values (${c}, 'growth', 'monthly', 999900, 'order_web_1', ${ow.owner_id})`;
  const evt = (amount: number) => ({ event: "payment.captured", payload: { payment: { entity: { id: "pay_web_1", order_id: "order_web_1", amount, currency: "INR", method: "card" } } } });
  assertEquals((await webhook(evt(999900), "wrong_secret")).status, 400);
  assertEquals((await webhook(evt(100))).result, "amount_mismatch");
  assertEquals((await sql`select status from public.payments where razorpay_order_id = 'order_web_1'`)[0].status, "created");
  assertEquals((await webhook(evt(999900))).result, "awaiting_approval");
  assertEquals((await webhook(evt(999900))).result, "already_paid");
  assertEquals((await sql`select status from public.companies where id = ${c}`)[0].status, "pending_approval");
});

T("suspension stops work but keeps data readable; removing people frees seats", async () => {
  await must(platform, "platform.status", { companyId: ca, status: "suspended", note: "test" });
  assertEquals((await api(member, "creators.lookup", { companyId: ca, handles: ["x.y"] })).error.code, "INACTIVE");
  assert((await must(member, "work.state", { companyId: ca })).creators.length > 0);
  await must(platform, "platform.status", { companyId: ca, status: "active" });
  await must(owner, "members.remove", { companyId: ca, userId: member.id });
  assertEquals((await api(member, "work.state", { companyId: ca })).error.code, "FORBIDDEN");
  assertEquals((await api(owner, "members.remove", { companyId: ca, userId: owner.id })).error.code, "OWNER");
  const log = (await must(owner, "audit.list", { companyId: ca })).log.map((x: any) => x.action);
  for (const a of ["company.created", "billing.paid", "platform.approved", "instagram.connected", "member.invited", "member.joined", "member.removed"]) {
    assert(log.includes(a), "audit missing " + a);
  }
  await sql.end();
  const { db } = await import("../functions/_shared/db.ts");
  await db().end();
});
