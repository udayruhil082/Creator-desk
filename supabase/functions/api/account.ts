// Companies, team members, billing, Instagram connections and the platform owner's tools.
import { asServer, asUser } from "../_shared/db.ts";
import { ApiError, env, str, uuid } from "../_shared/http.ts";
import { encryptSecret, decryptSecret } from "../_shared/crypto.ts";
import { checkConnection, exchangeLoginCode, HOURLY_CAP } from "../_shared/graph.ts";
import * as rzp from "../_shared/razorpay.ts";
import { type Ctx, requireCompany } from "./context.ts";

const role = (v: unknown) => (v === "admin" ? "admin" : "member");

export const accountActions = {
  // ---------- who am I ----------
  async "me"(ctx: Ctx) {
    return await asUser(ctx.claims, async (tx) => {
      const [c] = await tx`select public.my_context() as c`;
      const plans = await tx`select * from public.plans order by sort`;
      return { ...c.c, plans };
    });
  },

  // ---------- company ----------
  async "company.create"(ctx: Ctx) {
    const b = ctx.body;
    const [r] = await asUser(ctx.claims, (tx) => tx`
      select public.create_company(${str(b.name, 120)}, ${str(b.legalName, 200) || null}, ${str(b.gstin, 15) || null}, ${str(b.phone, 20) || null}) as id`);
    return { companyId: r.id };
  },

  async "company.get"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { active: false });
    const [c] = await asUser(ctx.claims, (tx) => tx`select * from public.companies where id = ${companyId}`);
    return { company: c };
  },

  async "company.update"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { admin: true, active: false });
    const b = ctx.body;
    const set: Record<string, unknown> = {};
    if ("name" in b) set.name = str(b.name, 120);
    if ("legalName" in b) set.legal_name = str(b.legalName, 200) || null;
    if ("gstin" in b) set.gstin = str(b.gstin, 15).toUpperCase() || null;
    if ("phone" in b) set.phone = str(b.phone, 20) || null;
    if (!Object.keys(set).length) throw new ApiError(400, "INVALID", "Nothing to save.");
    const [c] = await asUser(ctx.claims, (tx) => tx`update public.companies set ${tx(set as any)} where id = ${companyId} returning *`);
    return { company: c };
  },

  // ---------- team ----------
  async "members.list"(ctx: Ctx) {
    const { companyId, a } = await requireCompany(ctx, { active: false });
    return await asUser(ctx.claims, async (tx) => {
      const members = await tx`select m.user_id, m.role, m.created_at, p.email, p.full_name, p.avatar_url
                               from public.company_members m join public.profiles p on p.id = m.user_id
                               where m.company_id = ${companyId} order by m.created_at`;
      const invitations = a.admin
        ? await tx`select id, email, role, created_at, expires_at from public.invitations
                   where company_id = ${companyId} and status = 'pending' and expires_at > now() order by created_at`
        : [];
      const [c] = await tx`select seat_limit from public.companies where id = ${companyId}`;
      return { members, invitations, seatLimit: c.seat_limit, seatsUsed: members.length + invitations.length };
    });
  },

  async "invites.create"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { admin: true });
    const email = str(ctx.body.email, 254).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, "INVALID", "That email address does not look right.");
    const [r] = await asUser(ctx.claims, (tx) => tx`select public.invite_member(${companyId}, ${email}, ${role(ctx.body.role)}) as id`);
    return { invitationId: r.id, email };
  },

  async "invites.revoke"(ctx: Ctx) {
    await asUser(ctx.claims, (tx) => tx`select public.revoke_invite(${uuid(ctx.body.invitationId)})`);
    return { revoked: true };
  },

  async "invites.accept"(ctx: Ctx) {
    const [r] = await asUser(ctx.claims, (tx) => tx`select public.accept_invite(${uuid(ctx.body.invitationId)}) as id`);
    return { companyId: r.id };
  },

  async "members.remove"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { active: false });
    await asUser(ctx.claims, (tx) => tx`select public.remove_member(${companyId}, ${uuid(ctx.body.userId)})`);
    return { removed: true };
  },

  async "members.role"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { admin: true, active: false });
    await asUser(ctx.claims, (tx) => tx`select public.set_member_role(${companyId}, ${uuid(ctx.body.userId)}, ${role(ctx.body.role)})`);
    return { updated: true };
  },

  // Lookups per member and live hourly capacity, for the company admin.
  async "usage.get"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { admin: true, active: false });
    const days = Math.min(365, Math.max(1, Number(ctx.body.days) || 30));
    return await asUser(ctx.claims, async (tx) => {
      const members = await tx`select * from public.company_usage(${companyId}, now() - make_interval(days => ${days}))`;
      const daily = await tx`select date_trunc('day', created_at at time zone 'Asia/Kolkata')::date as day,
                                    count(*) filter (where not cached and ok)::int as lookups, count(*) filter (where cached)::int as from_cache
                             from public.lookup_usage where company_id = ${companyId} and created_at > now() - make_interval(days => ${days})
                             group by 1 order by 1`;
      const capacity = await tx`select * from public.company_capacity(${companyId})`;
      return { days, members, daily, capacity };
    });
  },

  async "audit.list"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { admin: true, active: false });
    const rows = await asUser(ctx.claims, (tx) => tx`
      select a.action, a.details, a.created_at, p.email as actor_email from public.audit_log a
      left join public.profiles p on p.id = a.actor_id
      where a.company_id = ${companyId} order by a.created_at desc limit 200`);
    return { log: rows };
  },

  // ---------- billing ----------
  async "billing.order"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { admin: true, active: false });
    const cycle = ctx.body.cycle === "yearly" ? "yearly" : "monthly";
    const planId = str(ctx.body.planId, 40);
    const [plan] = await asUser(ctx.claims, (tx) => tx`select * from public.plans where id = ${planId}`);
    if (!plan) throw new ApiError(400, "PLAN", "Choose a plan.");
    if (!plan.self_checkout) throw new ApiError(400, "PLAN", "This plan is set up with our team. Please contact us.");
    const amount = cycle === "yearly" ? plan.price_yearly_paise : plan.price_monthly_paise;
    if (!amount) throw new ApiError(400, "PLAN", "This plan has no price for that billing cycle.");
    const [co] = await asServer((tx) => tx`select c.name, c.status, p.email, p.full_name from public.companies c
                                           join public.profiles p on p.id = ${ctx.claims.sub} where c.id = ${companyId}`);
    if (co.status === "pending_approval") throw new ApiError(409, "ALREADY_PAID", "Payment received. Your plan is waiting for approval.");
    if (co.status === "suspended") throw new ApiError(403, "SUSPENDED", "This company is suspended. Please contact us.");
    const order = await rzp.createOrder(amount, `cd_${companyId.slice(0, 8)}_${Date.now().toString(36)}`,
      { company_id: companyId, plan_id: plan.id, cycle });
    await asServer((tx) => tx`insert into public.payments (company_id, plan_id, billing_cycle, amount_paise, razorpay_order_id, created_by)
                              values (${companyId}, ${plan.id}, ${cycle}, ${amount}, ${String(order.id)}, ${ctx.claims.sub})`);
    return {
      keyId: rzp.keyId(), orderId: order.id, amount, currency: "INR", name: "My Creator Desk",
      description: `${plan.name} plan (${cycle})`, prefill: { email: co.email, name: co.full_name ?? "" }, companyName: co.name,
    };
  },

  // Called by the website right after Razorpay Checkout succeeds. The webhook does the same, so either is enough.
  async "billing.verify"(ctx: Ctx) {
    const orderId = str(ctx.body.orderId, 64), paymentId = str(ctx.body.paymentId, 64), signature = str(ctx.body.signature, 128);
    if (!(await rzp.checkoutSignatureOk(orderId, paymentId, signature))) throw new ApiError(400, "PAYMENT", "Payment could not be verified.");
    const [pay] = await asServer((tx) => tx`select * from public.payments where razorpay_order_id = ${orderId}`);
    if (!pay) throw new ApiError(404, "NOT_FOUND", "Unknown order.");
    const [ok] = await asUser(ctx.claims, (tx) => tx`select public.is_company_admin(${pay.company_id}) as a`);
    if (!ok.a) throw new ApiError(403, "FORBIDDEN", "Only company admins can pay for the plan.");
    let p = await rzp.fetchPayment(paymentId);
    if (p.order_id !== orderId || Number(p.amount) !== pay.amount_paise) throw new ApiError(400, "PAYMENT", "Payment does not match the order.");
    if (p.status === "authorized") p = await rzp.capturePayment(paymentId, pay.amount_paise);
    if (p.status !== "captured") throw new ApiError(400, "PAYMENT", `Payment is ${p.status}, not completed.`);
    const [r] = await asServer((tx) => tx`select public.mark_payment_paid(${orderId}, ${paymentId}, ${tx.json({ method: p.method ?? null, email: p.email ?? null } as any)}) as r`);
    return { result: r.r, companyId: pay.company_id };
  },

  async "billing.history"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { admin: true, active: false });
    const rows = await asUser(ctx.claims, (tx) => tx`
      select plan_id, billing_cycle, amount_paise, currency, status, razorpay_payment_id, created_at, paid_at
      from public.payments where company_id = ${companyId} order by created_at desc`);
    return { payments: rows };
  },

  // ---------- Instagram connections (company admins) ----------
  async "ig.connect"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { admin: true });
    const redirectUri = str(ctx.body.redirectUri, 300);
    const allowed = env("FB_REDIRECT_URIS", "https://mycreatordesk.co.in/").split(",").map((s) => s.trim());
    if (!allowed.includes(redirectUri)) throw new ApiError(400, "INVALID", "This page is not allowed to connect Instagram.");
    const code = str(ctx.body.code, 2000);
    if (!code) throw new ApiError(400, "INVALID", "Facebook did not return a login code. Try again.");
    const accounts = await exchangeLoginCode(code, redirectUri);
    if (!accounts.length) {
      throw new ApiError(400, "NO_IG", "No Instagram professional account was found. Link your Instagram Business or Creator account to a Facebook Page, then try again and tick that Page when Facebook asks.");
    }
    const want = str(ctx.body.igUserId, 40);
    const acct = want ? accounts.find((x) => x.igUserId === want) : accounts.length === 1 ? accounts[0] : null;
    if (!acct) {
      return { choose: accounts.map((x) => ({ igUserId: x.igUserId, username: x.username, pageName: x.pageName })) };
    }
    const box = await encryptSecret(acct.pageToken);
    const conn = await asServer(async (tx) => {
      const [ex] = await tx`select id, status from public.ig_connections where company_id = ${companyId} and ig_user_id = ${acct.igUserId}`;
      const [row] = ex
        ? await tx`update public.ig_connections set status = 'active', username = ${acct.username}, page_id = ${acct.pageId},
                   page_name = ${acct.pageName}, connected_by = ${ctx.claims.sub}, last_error = null, last_checked_at = now()
                   where id = ${ex.id} returning id, username, page_name, status`
        : await tx`insert into public.ig_connections (company_id, ig_user_id, username, page_id, page_name, connected_by, last_checked_at)
                   values (${companyId}, ${acct.igUserId}, ${acct.username}, ${acct.pageId}, ${acct.pageName}, ${ctx.claims.sub}, now())
                   returning id, username, page_name, status`;
      await tx`insert into public.ig_connection_secrets (connection_id, token_ciphertext) values (${row.id}, ${box})
               on conflict (connection_id) do update set token_ciphertext = excluded.token_ciphertext, updated_at = now()`;
      await tx`insert into public.audit_log (company_id, actor_id, action, details)
               values (${companyId}, ${ctx.claims.sub}, 'instagram.connected', ${tx.json({ username: acct.username })})`;
      return row;
    });
    return { connection: conn };
  },

  async "ig.disconnect"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx, { admin: true, active: false });
    const id = uuid(ctx.body.connectionId);
    const done = await asServer(async (tx) => {
      const [row] = await tx`update public.ig_connections set status = 'revoked' where id = ${id} and company_id = ${companyId} returning username`;
      if (!row) return null;
      await tx`delete from public.ig_connection_secrets where connection_id = ${id}`;
      await tx`insert into public.audit_log (company_id, actor_id, action, details)
               values (${companyId}, ${ctx.claims.sub}, 'instagram.disconnected', ${tx.json({ username: row.username })})`;
      return row;
    });
    if (!done) throw new ApiError(404, "NOT_FOUND", "Connection not found.");
    return { disconnected: true };
  },

  // "Test connection": one call to Instagram, uses 1 lookup from that account's hour.
  async "ig.test"(ctx: Ctx) {
    const { companyId } = await requireCompany(ctx);
    const id = uuid(ctx.body.connectionId);
    const [c] = await asServer((tx) => tx`select c.id, c.ig_user_id, s.token_ciphertext from public.ig_connections c
                                          join public.ig_connection_secrets s on s.connection_id = c.id
                                          where c.id = ${id} and c.company_id = ${companyId} and c.status = 'active'`);
    if (!c) throw new ApiError(404, "NOT_FOUND", "Active connection not found.");
    const [g] = await asServer((tx) => tx`select public.reserve_budget(${id}, 1, ${HOURLY_CAP}) as n`);
    if (!g.n) return { ok: false, message: "This account's hourly limit is used up. Try after the hour resets." };
    const r = await checkConnection(c.ig_user_id, await decryptSecret(c.token_ciphertext));
    await asServer((tx) => tx`update public.ig_connections set last_checked_at = now(), last_error = ${r.ok ? null : r.error ?? null},
                              status = ${r.dead ? "expired" : "active"} where id = ${id}`);
    const [cap] = await asUser(ctx.claims, (tx) => tx`select * from public.company_capacity(${companyId}) where connection_id = ${id}`);
    return { ok: r.ok, message: r.ok ? `Connected as @${r.username}` : r.error, capacity: cap ?? null };
  },

  // ---------- platform owner ----------
  async "platform.companies"(ctx: Ctx) {
    const rows = await asUser(ctx.claims, (tx) => tx`select * from public.platform_companies()`);
    return { companies: rows };
  },
  async "platform.approve"(ctx: Ctx) {
    const b = ctx.body;
    const int = (v: unknown) => (v === undefined || v === null || v === "" ? null : Math.max(0, Math.round(Number(v))));
    await asUser(ctx.claims, (tx) => tx`select public.approve_company(${uuid(b.companyId)}, ${str(b.planId, 40) || null},
      ${b.cycle === "yearly" ? "yearly" : b.cycle === "monthly" ? "monthly" : null}, ${int(b.seatLimit)}, ${int(b.igLimit)})`);
    return { approved: true };
  },
  async "platform.status"(ctx: Ctx) {
    const st = str(ctx.body.status, 20);
    if (!["active", "suspended", "cancelled"].includes(st)) throw new ApiError(400, "INVALID", "Status must be active, suspended or cancelled.");
    await asUser(ctx.claims, (tx) => tx`select public.set_company_status(${uuid(ctx.body.companyId)}, ${st}::public.company_status, ${str(ctx.body.note, 300) || null})`);
    return { updated: true };
  },
  async "platform.payments"(ctx: Ctx) {
    const rows = await asUser(ctx.claims, (tx) => tx`
      select id, plan_id, billing_cycle, amount_paise, status, razorpay_order_id, razorpay_payment_id, created_at, paid_at
      from public.payments where company_id = ${uuid(ctx.body.companyId)} order by created_at desc`);
    return { payments: rows };
  },
};
