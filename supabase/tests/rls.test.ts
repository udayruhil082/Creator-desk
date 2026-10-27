// Security tests for the database rules. Run against a scratch database:
//   TEST_DB_URL=postgres://postgres@localhost:55432/cdtest deno test -A supabase/tests/rls.test.ts
import postgres from "npm:postgres@3.4.5";
import { assert, assertEquals, assertRejects } from "./assert.ts";

const url = Deno.env.get("TEST_DB_URL")!;
const sql = postgres(url, { max: 4, onnotice: () => {} });

type U = { id: string; email: string };
async function user(email: string): Promise<U> {
  const [r] = await sql`insert into auth.users (email, raw_user_meta_data) values (${email}, ${sql.json({ full_name: email.split("@")[0] })}) returning id`;
  return { id: r.id, email };
}
// Run queries exactly as the website would: as role "authenticated" with this person's sign-in claims.
function as<T>(u: U | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    const claims = u ? { sub: u.id, email: u.email, role: "authenticated" } : { role: "anon" };
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    await tx.unsafe(u ? "set local role authenticated" : "set local role anon");
    return await fn(tx);
  }) as Promise<T>;
}
const rejects = (p: Promise<unknown>, text: string) => assertRejects(() => p, Error, text);

let A: U, A2: U, A3: U, B: U, S: U, P: U;
let ca = "", cb = "";

Deno.test({ name: "setup people and companies", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  A = await user("owner.a@example.com");
  A2 = await user("member.a2@example.com");
  A3 = await user("member.a3@example.com");
  B = await user("owner.b@example.com");
  S = await user("stranger@example.com");
  P = await user("udayruhil.82@gmail.com"); // platform owner
  ca = (await as(A, (tx) => tx`select public.create_company('Company A', 'A Pvt Ltd', '07ABCDE1234F1Z5', '+91 98765 43210') as id`))[0].id;
  cb = (await as(B, (tx) => tx`select public.create_company('Company B') as id`))[0].id;
  const ctx = (await as(A, (tx) => tx`select public.my_context() as c`))[0].c;
  assertEquals(ctx.companies.length, 1);
  assertEquals(ctx.companies[0].role, "admin");
  assertEquals(ctx.companies[0].status, "pending_payment");
}});

Deno.test({ name: "nothing works before approval", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await rejects(as(A, (tx) => tx`select public.invite_member(${ca}, 'x@example.com')`), "INACTIVE");
  await rejects(as(A, (tx) => tx`insert into public.creators (company_id, owner_id, name) values (${ca}, ${A.id}, 'abc')`), "row-level security");
}});

Deno.test({ name: "only the platform owner can approve and see all companies", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await rejects(as(A, (tx) => tx`select public.approve_company(${ca}, 'starter')`), "FORBIDDEN");
  await rejects(as(A, (tx) => tx`select * from public.platform_companies()`), "FORBIDDEN");
  await as(P, (tx) => tx`select public.approve_company(${ca}, 'starter', 'monthly')`);
  await as(P, (tx) => tx`select public.approve_company(${cb}, 'growth', 'yearly')`);
  const list = await as(P, (tx) => tx`select * from public.platform_companies()`);
  assertEquals(list.length, 2);
  const a = list.find((r) => r.id === ca)!;
  assertEquals(a.status, "active");
  assertEquals(a.seat_limit, 5);
  assertEquals(a.ig_account_limit, 1);
  assertEquals(a.owner_email, "owner.a@example.com");
}});

Deno.test({ name: "invitations, seat limit and accepting", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const i2 = (await as(A, (tx) => tx`select public.invite_member(${ca}, 'Member.A2@example.com') as id`))[0].id;
  const i3 = (await as(A, (tx) => tx`select public.invite_member(${ca}, 'member.a3@example.com') as id`))[0].id;
  await as(A, (tx) => tx`select public.invite_member(${ca}, 'x1@example.com')`);
  await as(A, (tx) => tx`select public.invite_member(${ca}, 'x2@example.com')`);
  // owner + 4 pending = 5 seats (Starter). The 6th is refused.
  await rejects(as(A, (tx) => tx`select public.invite_member(${ca}, 'x3@example.com')`), "SEAT_LIMIT");
  await rejects(as(A2, (tx) => tx`select public.invite_member(${ca}, 'x4@example.com')`), "FORBIDDEN");
  await rejects(as(B, (tx) => tx`select public.invite_member(${ca}, 'x5@example.com')`), "FORBIDDEN");
  // a stranger cannot accept someone else's invitation
  await rejects(as(S, (tx) => tx`select public.accept_invite(${i2})`), "FORBIDDEN");
  // the invited person sees it and accepts
  const ctx = (await as(A2, (tx) => tx`select public.my_context() as c`))[0].c;
  assertEquals(ctx.invitations.length, 1);
  assertEquals(ctx.invitations[0].company_name, "Company A");
  await as(A2, (tx) => tx`select public.accept_invite(${i2})`);
  await as(A3, (tx) => tx`select public.accept_invite(${i3})`);
  await rejects(as(A2, (tx) => tx`select public.accept_invite(${i2})`), "FORBIDDEN"); // already used
  const members = await as(A2, (tx) => tx`select user_id, role from public.company_members where company_id = ${ca}`);
  assertEquals(members.length, 3);
  // still full: 3 members + 2 pending = 5
  await rejects(as(A, (tx) => tx`select public.invite_member(${ca}, 'x6@example.com')`), "SEAT_LIMIT");
}});

Deno.test({ name: "company B can never see or touch company A", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await as(A2, (tx) => tx`insert into public.creators (company_id, owner_id, name, followers) values (${ca}, ${A2.id}, 'creator.of.a2', 1000)`);
  const fromB = await as(B, async (tx) => ({
    companies: await tx`select id from public.companies where id = ${ca}`,
    members: await tx`select * from public.company_members where company_id = ${ca}`,
    creators: await tx`select * from public.creators where company_id = ${ca}`,
    invites: await tx`select * from public.invitations where company_id = ${ca}`,
    profiles: await tx`select * from public.profiles where id = ${A2.id}`,
  }));
  assertEquals(fromB.companies.length, 0);
  assertEquals(fromB.members.length, 0);
  assertEquals(fromB.creators.length, 0);
  assertEquals(fromB.invites.length, 0);
  assertEquals(fromB.profiles.length, 0);
  await rejects(as(B, (tx) => tx`insert into public.creators (company_id, owner_id, name) values (${ca}, ${B.id}, 'sneaky')`), "row-level security");
  await rejects(as(B, (tx) => tx`insert into public.creators (company_id, owner_id, name) values (${cb}, ${A2.id}, 'fake owner')`), "row-level security");
  const upd = await as(B, (tx) => tx`update public.creators set fee = 1 where company_id = ${ca} returning id`);
  assertEquals(upd.length, 0);
  const del = await as(B, (tx) => tx`delete from public.creators where company_id = ${ca} returning id`);
  assertEquals(del.length, 0);
  const anon = await as(null, (tx) => tx`select * from public.plans`);
  assertEquals(anon.length, 2);
  await rejects(as(null, (tx) => tx`select * from public.companies`), "permission denied");
}});

Deno.test({ name: "members see their own work; admins see everyone's in their company", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await as(A, (tx) => tx`insert into public.creators (company_id, owner_id, name) values (${ca}, ${A.id}, 'creator.of.owner')`);
  const a2sees = await as(A2, (tx) => tx`select name from public.creators order by name`);
  assertEquals(a2sees.map((r) => r.name), ["creator.of.a2"]);
  const a3sees = await as(A3, (tx) => tx`select name from public.creators`);
  assertEquals(a3sees.length, 0);
  const adminSees = await as(A, (tx) => tx`select name from public.creators order by name`);
  assertEquals(adminSees.map((r) => r.name), ["creator.of.a2", "creator.of.owner"]);
  const a3edit = await as(A3, (tx) => tx`update public.creators set fee = 5 where name = 'creator.of.a2' returning id`);
  assertEquals(a3edit.length, 0);
  const adminEdit = await as(A, (tx) => tx`update public.creators set fee = 5 where name = 'creator.of.a2' returning id`);
  assertEquals(adminEdit.length, 1);
  // rows can never be moved to another person or company
  await rejects(as(A, (tx) => tx`update public.creators set owner_id = ${A.id} where name = 'creator.of.a2'`), "OWNERSHIP");
  await rejects(as(A2, (tx) => tx`update public.creators set company_id = ${cb} where name = 'creator.of.a2'`), "OWNERSHIP");
}});

Deno.test({ name: "the platform owner cannot read company work data", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const r = await as(P, async (tx) => ({
    creators: await tx`select * from public.creators`,
    posts: await tx`select * from public.campaign_posts`,
    usage: await tx`select * from public.lookup_usage`,
  }));
  assertEquals(r.creators.length, 0);
  assertEquals(r.posts.length, 0);
  assertEquals(r.usage.length, 0);
}});

Deno.test({ name: "roles, owner protection and company edits", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await rejects(as(A, (tx) => tx`select public.remove_member(${ca}, ${A.id})`), "OWNER");
  await rejects(as(A, (tx) => tx`select public.set_member_role(${ca}, ${A.id}, 'member')`), "OWNER");
  await rejects(as(A2, (tx) => tx`select public.set_member_role(${ca}, ${A3.id}, 'admin')`), "FORBIDDEN");
  await rejects(as(A2, (tx) => tx`select public.remove_member(${ca}, ${A3.id})`), "FORBIDDEN");
  await as(A, (tx) => tx`select public.set_member_role(${ca}, ${A3.id}, 'admin')`);
  assertEquals((await as(A3, (tx) => tx`select name from public.creators where company_id = ${ca}`)).length, 2);
  await as(A, (tx) => tx`select public.set_member_role(${ca}, ${A3.id}, 'member')`);
  // admins edit the company profile, but never its plan, limits or status
  await as(A, (tx) => tx`update public.companies set name = 'Company A Renamed' where id = ${ca}`);
  await rejects(as(A, (tx) => tx`update public.companies set status = 'active', seat_limit = 999 where id = ${ca}`), "permission denied");
  await rejects(as(A, (tx) => tx`update public.companies set ig_account_limit = 99 where id = ${ca}`), "permission denied");
  const memberEdit = await as(A2, (tx) => tx`update public.companies set name = 'hacked' where id = ${ca} returning id`);
  assertEquals(memberEdit.length, 0);
  // a member can leave by themselves
  await as(A3, (tx) => tx`select public.remove_member(${ca}, ${A3.id})`);
  assertEquals((await as(A3, (tx) => tx`select * from public.companies where id = ${ca}`)).length, 0);
}});

Deno.test({ name: "server-only tables and functions are closed to the website", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await rejects(as(A, (tx) => tx`select * from public.ig_connection_secrets`), "permission denied");
  await rejects(as(A, (tx) => tx`select * from public.ig_budget`), "permission denied");
  await rejects(as(A, (tx) => tx`select * from public.bd_cache`), "permission denied");
  await rejects(as(A, (tx) => tx`select * from public.platform_admins`), "permission denied");
  await rejects(as(A, (tx) => tx`insert into public.companies (name, owner_id) values ('x', ${A.id})`), "permission denied");
  await rejects(as(A, (tx) => tx`insert into public.company_members (company_id, user_id) values (${ca}, ${S.id})`), "permission denied");
  await rejects(as(A, (tx) => tx`select public.mark_payment_paid('order_x', 'pay_x')`), "permission denied");
  await rejects(as(A, (tx) => tx`select public.reserve_budget(gen_random_uuid(), 10)`), "permission denied");
  await rejects(as(A, (tx) => tx`select public.write_audit(${ca}, 'fake')`), "permission denied");
  await rejects(as(A, (tx) => tx`insert into public.payments (company_id, plan_id, billing_cycle, amount_paise, razorpay_order_id) values (${ca}, 'growth', 'monthly', 1, 'o1')`), "permission denied");
}});

Deno.test({ name: "Instagram account limit and one company per account", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await sql`insert into public.ig_connections (company_id, ig_user_id, username) values (${ca}, 'ig_111', 'brand_a')`;
  await rejects(sql`insert into public.ig_connections (company_id, ig_user_id, username) values (${ca}, 'ig_222', 'brand_a2')`, "IG_LIMIT");
  await rejects(sql`insert into public.ig_connections (company_id, ig_user_id, username) values (${cb}, 'ig_111', 'brand_a')`, "duplicate key");
  // members see the connection details, never the token
  const seen = await as(A2, (tx) => tx`select username from public.ig_connections where company_id = ${ca}`);
  assertEquals(seen.length, 1);
  assertEquals((await as(B, (tx) => tx`select * from public.ig_connections where company_id = ${ca}`)).length, 0);
}});

Deno.test({ name: "hourly budget is never exceeded", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const [c] = await sql`select id from public.ig_connections where ig_user_id = 'ig_111'`;
  const got = [];
  for (const want of [100, 100, 10]) got.push((await sql`select public.reserve_budget(${c.id}, ${want}) as n`)[0].n);
  assertEquals(got, [100, 50, 0]);
  const cap = await as(A, (tx) => tx`select * from public.company_capacity(${ca})`);
  assertEquals(cap[0].used_this_hour, 150);
}});

Deno.test({ name: "payments: first payment waits for approval, renewals extend, repeats are ignored", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const C = await user("owner.c@example.com");
  const cc = (await as(C, (tx) => tx`select public.create_company('Company C') as id`))[0].id;
  await sql`insert into public.payments (company_id, plan_id, billing_cycle, amount_paise, razorpay_order_id, created_by)
            values (${cc}, 'growth', 'monthly', 999900, 'order_c1', ${C.id})`;
  assertEquals((await sql`select public.mark_payment_paid('order_c1', 'pay_c1') as r`)[0].r, "awaiting_approval");
  assertEquals((await sql`select public.mark_payment_paid('order_c1', 'pay_c1') as r`)[0].r, "already_paid");
  const [st] = await sql`select status, plan_id, seat_limit from public.companies where id = ${cc}`;
  assertEquals([st.status, st.plan_id, st.seat_limit], ["pending_approval", "growth", 1]);
  await as(P, (tx) => tx`select public.approve_company(${cc})`);
  const [before] = await sql`select current_period_end as e, seat_limit from public.companies where id = ${cc}`;
  assertEquals(before.seat_limit, 15);
  await sql`insert into public.payments (company_id, plan_id, billing_cycle, amount_paise, razorpay_order_id, created_by)
            values (${cc}, 'growth', 'monthly', 999900, 'order_c2', ${C.id})`;
  assertEquals((await sql`select public.mark_payment_paid('order_c2', 'pay_c2') as r`)[0].r, "renewed");
  const [after] = await sql`select current_period_end as e from public.companies where id = ${cc}`;
  assert(new Date(after.e).getTime() - new Date(before.e).getTime() > 27 * 864e5);
  // the company admin sees its own payments, nobody else does
  assertEquals((await as(C, (tx) => tx`select * from public.payments`)).length, 2);
  assertEquals((await as(A, (tx) => tx`select * from public.payments where company_id = ${cc}`)).length, 0);
}});

Deno.test({ name: "expired or suspended companies become read-only", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await sql`update public.companies set current_period_end = now() - interval '1 day' where id = ${ca}`;
  await rejects(as(A2, (tx) => tx`insert into public.creators (company_id, owner_id, name) values (${ca}, ${A2.id}, 'late')`), "row-level security");
  assertEquals((await as(A2, (tx) => tx`select * from public.creators`)).length, 1); // can still read
  await as(P, (tx) => tx`select public.approve_company(${ca})`); // renewed
  await as(A2, (tx) => tx`insert into public.creators (company_id, owner_id, name) values (${ca}, ${A2.id}, 'back.again')`);
  await as(P, (tx) => tx`select public.set_company_status(${ca}, 'suspended', 'test')`);
  await rejects(as(A2, (tx) => tx`insert into public.creators (company_id, owner_id, name) values (${ca}, ${A2.id}, 'while.suspended')`), "row-level security");
  await rejects(as(A, (tx) => tx`select public.invite_member(${ca}, 'y@example.com')`), "INACTIVE");
  await as(P, (tx) => tx`select public.set_company_status(${ca}, 'active')`);
}});

Deno.test({ name: "quarterly and half-yearly periods; Enterprise not offered", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const plans = await as(A, (tx) => tx`select id, price_quarterly_paise, price_half_yearly_paise from public.plans where is_public order by sort`);
  assertEquals(plans.map((p) => p.id), ["starter", "growth"]);
  assertEquals([plans[0].price_quarterly_paise, plans[0].price_half_yearly_paise], [1399900, 2699900]);
  const [b0] = await sql`select current_period_end as e from public.companies where id = ${cb}`;
  await as(P, (tx) => tx`select public.approve_company(${cb}, 'growth', 'half_yearly')`);
  const [b1] = await sql`select current_period_end as e, billing_cycle from public.companies where id = ${cb}`;
  assertEquals(b1.billing_cycle, "half_yearly");
  const days = (new Date(b1.e).getTime() - new Date(b0.e).getTime()) / 864e5;
  assert(days > 180 && days < 185);
  await as(P, (tx) => tx`select public.approve_company(${cb}, 'growth', 'quarterly')`);
  await rejects(as(P, (tx) => tx`select public.approve_company(${cb}, 'growth', 'weekly')`), "billing period");
  await rejects(as(A, (tx) => tx`select public.cycle_interval('yearly')`), "permission denied");
}});

Deno.test({ name: "usage dashboard is for company admins only", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await sql`insert into public.lookup_usage (company_id, user_id, handle) values (${ca}, ${A2.id}, 'h1'), (${ca}, ${A2.id}, 'h2'), (${ca}, ${A.id}, 'h3')`;
  await sql`insert into public.lookup_usage (company_id, user_id, handle, cached) values (${ca}, ${A2.id}, 'h1', true)`;
  const rows = await as(A, (tx) => tx`select * from public.company_usage(${ca})`);
  const a2 = rows.find((r) => r.user_id === A2.id)!;
  assertEquals([Number(a2.lookups), Number(a2.from_cache)], [2, 1]);
  await rejects(as(A2, (tx) => tx`select * from public.company_usage(${ca})`), "FORBIDDEN");
  await rejects(as(B, (tx) => tx`select * from public.company_usage(${ca})`), "FORBIDDEN");
  assertEquals((await as(A2, (tx) => tx`select * from public.lookup_usage`)).length, 3); // own only
  assertEquals((await as(B, (tx) => tx`select * from public.lookup_usage`)).length, 0);
  await sql.end();
}});
