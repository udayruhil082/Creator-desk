// functions/_shared/auth.ts
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

// functions/_shared/http.ts
var ApiError = class extends Error {
  status;
  code;
  constructor(status, code, message) {
    super(message), this.status = status, this.code = code;
  }
};
function env(name, fallback) {
  const v = Deno.env.get(name);
  if (v === void 0 || v === "") {
    if (fallback !== void 0) return fallback;
    throw new ApiError(500, "CONFIG", `Server setting ${name} is missing.`);
  }
  return v;
}
function allowedOrigins() {
  return env("ALLOWED_ORIGINS", "https://mycreatordesk.co.in,https://www.mycreatordesk.co.in").split(",").map((s) => s.trim()).filter(Boolean);
}
function corsHeaders(req) {
  const origin = req.headers.get("origin") ?? "";
  const ok = allowedOrigins().includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowedOrigins()[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
var DB_CODES = {
  FORBIDDEN: 403,
  AUTH: 401,
  NOT_FOUND: 404,
  INACTIVE: 402,
  SEAT_LIMIT: 409,
  IG_LIMIT: 409,
  EXISTS: 409,
  EXPIRED: 410,
  OWNER: 409,
  LAST_ADMIN: 409,
  OWNERSHIP: 409,
  LIMIT: 409,
  PLAN: 400
};
function toApiError(e) {
  if (e instanceof ApiError) return e;
  const err = e;
  const msg = String(err?.message ?? e);
  const m = msg.match(/^([A-Z_]+): (.*)$/s);
  if (m && DB_CODES[m[1]]) return new ApiError(DB_CODES[m[1]], m[1], m[2]);
  if (err?.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return new ApiError(403, "FORBIDDEN", "You do not have access to this.");
  }
  if (err?.code === "23505") {
    if (err.constraint_name === "ig_connections_one_active") {
      return new ApiError(409, "IG_IN_USE", "This Instagram account is already connected to another company.");
    }
    return new ApiError(409, "EXISTS", "This already exists.");
  }
  if (err?.code === "23514" || err?.code === "22P02") return new ApiError(400, "INVALID", "Some details are not in the right format.");
  console.error("unexpected", e);
  return new ApiError(500, "SERVER", "Something went wrong on the server. Please try again.");
}
function errorResponse(req, e) {
  const a = toApiError(e);
  return json(req, {
    ok: false,
    error: {
      code: a.code,
      message: a.message
    }
  }, a.status);
}
function str(v, max = 500) {
  return String(v ?? "").trim().slice(0, max);
}
function uuid(v, name = "id") {
  const s = String(v ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    throw new ApiError(400, "INVALID", `${name} is not valid.`);
  }
  return s.toLowerCase();
}
function numOrNull(v) {
  if (v === null || v === void 0 || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// functions/_shared/auth.ts
var jwks = null;
async function verifyRequest(req) {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "AUTH", "Please sign in.");
  let payload;
  try {
    const secret = Deno.env.get("JWT_SECRET");
    const supabaseUrl = env("SUPABASE_URL");
    const opts = {
      issuer: `${supabaseUrl}/auth/v1`,
      audience: "authenticated"
    };
    if (secret) {
      ({ payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
        ...opts,
        algorithms: [
          "HS256"
        ]
      }));
    } else {
      jwks ??= createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
      ({ payload } = await jwtVerify(token, jwks, opts));
    }
  } catch (_e) {
    throw new ApiError(401, "AUTH", "Your sign-in has expired. Please sign in again.");
  }
  if (payload.role !== "authenticated" || typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new ApiError(401, "AUTH", "Please sign in with Google.");
  }
  return {
    sub: payload.sub,
    email: String(payload.email).toLowerCase(),
    role: "authenticated"
  };
}

// functions/_shared/db.ts
import postgres from "npm:postgres@3.4.5";
var sql = null;
function db() {
  sql ??= postgres(env("SUPABASE_DB_URL"), {
    prepare: false,
    max: 4,
    idle_timeout: 20,
    onnotice: () => {
    }
  });
  return sql;
}
function asUser(claims, fn) {
  return db().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    await tx.unsafe("set local role authenticated");
    return await fn(tx);
  });
}
function asServer(fn) {
  return db().begin(fn);
}

// functions/_shared/crypto.ts
var enc = new TextEncoder();
var dec = new TextDecoder();
function b64(bytes) {
  let s = "";
  bytes.forEach((b) => s += String.fromCharCode(b));
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s), out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
var keyPromise = null;
function key() {
  keyPromise ??= (async () => {
    const raw = unb64(env("TOKEN_ENC_KEY"));
    if (raw.length !== 32) throw new ApiError(500, "CONFIG", "TOKEN_ENC_KEY must be 32 random bytes in base64.");
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt"
    ]);
  })();
  return keyPromise;
}
async function encryptSecret(plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv
  }, await key(), enc.encode(plain)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}
async function decryptSecret(box) {
  const [v, iv, ct] = box.split(".");
  if (v !== "v1" || !iv || !ct) throw new ApiError(500, "SERVER", "Stored token is unreadable.");
  const pt = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: unb64(iv)
  }, await key(), unb64(ct));
  return dec.decode(pt);
}
async function hmacHex(secret, message) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// functions/_shared/graph.ts
var API_VERSION = "v26.0";
var GRAPH = `https://graph.facebook.com/${API_VERSION}`;
var HOURLY_CAP = 150;
var MEDIA_FULL = "like_count,comments_count,view_count,media_type,media_product_type,timestamp,permalink,caption";
var MEDIA_BASIC = "like_count,comments_count,media_type,timestamp,permalink,caption";
async function get(path, params) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${GRAPH}/${path}?${q}`);
  let j = {};
  try {
    j = await r.json();
  } catch {
    return {
      error: {
        message: `Unexpected answer from Instagram (HTTP ${r.status}).`
      }
    };
  }
  return j;
}
async function discovery(igUserId, token, handle2, limit) {
  const fields = (media) => `business_discovery.username(${handle2}){username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,media.limit(${limit}){${media}}}`;
  let res = await get(igUserId, {
    fields: fields(MEDIA_FULL),
    access_token: token
  });
  const e = res.error;
  if (e && /view_count|media_product_type/i.test(e.message ?? "")) {
    res = await get(igUserId, {
      fields: fields(MEDIA_BASIC),
      access_token: token
    });
  }
  if (res.error) return {
    error: res.error
  };
  if (!res.business_discovery) return {
    error: {
      message: "No data returned for this account."
    }
  };
  return {
    bd: res.business_discovery
  };
}
function isRateLimit(e) {
  return !!e && [
    4,
    17,
    32,
    613
  ].includes(Number(e.code));
}
function isTokenDead(e) {
  return !!e && Number(e.code) === 190;
}
function friendlyError(e) {
  const code = Number(e.code), sub = e.error_subcode, msg = e.message ?? "Unknown error";
  if (code === 190) return "This Instagram connection has expired. The company admin needs to reconnect it.";
  if (isRateLimit(e)) return "Instagram's hourly limit is used up for this account. Try again after the hour resets.";
  if (sub === 2207013 || /cannot find|invalid user id|does not exist/i.test(msg)) {
    return "Account not found, or it is a personal account. Only Creator and Business accounts can be read. Check the handle.";
  }
  if (code === 10 || code === 200) return `Permission missing on the Instagram connection (Meta says: ${msg}).`;
  return msg;
}
async function exchangeLoginCode(code, redirectUri) {
  const appId = env("FB_APP_ID"), secret = env("FB_APP_SECRET");
  const must = (j) => {
    if (j.error) throw new ApiError(400, "META", `Facebook says: ${j.error.message ?? "login failed"}`);
    return j;
  };
  const short = must(await get("oauth/access_token", {
    client_id: appId,
    client_secret: secret,
    redirect_uri: redirectUri,
    code
  }));
  const long = must(await get("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: secret,
    fb_exchange_token: String(short.access_token)
  }));
  const pages = must(await get("me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username}",
    limit: "100",
    access_token: String(long.access_token)
  }));
  return (pages.data ?? []).filter((p) => p.instagram_business_account?.id && p.access_token).map((p) => ({
    igUserId: String(p.instagram_business_account.id),
    username: String(p.instagram_business_account.username ?? ""),
    pageId: String(p.id),
    pageName: String(p.name ?? ""),
    pageToken: String(p.access_token)
  }));
}
async function checkConnection(igUserId, token) {
  const j = await get(igUserId, {
    fields: "username,followers_count",
    access_token: token
  });
  if (j.error) return {
    ok: false,
    error: friendlyError(j.error),
    dead: isTokenDead(j.error)
  };
  return {
    ok: true,
    username: String(j.username ?? "")
  };
}

// functions/_shared/razorpay.ts
var API = "https://api.razorpay.com/v1";
function auth() {
  return "Basic " + btoa(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`);
}
async function call(path, init = {}) {
  const r = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: auth(),
      "Content-Type": "application/json",
      ...init.headers ?? {}
    }
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = body?.error?.description ?? `HTTP ${r.status}`;
    throw new ApiError(502, "PAYMENT", `Razorpay: ${msg}`);
  }
  return body;
}
function createOrder(amountPaise, receipt, notes) {
  return call("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes
    })
  });
}
function fetchPayment(paymentId) {
  return call(`/payments/${encodeURIComponent(paymentId)}`);
}
function capturePayment(paymentId, amountPaise) {
  return call(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: "POST",
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR"
    })
  });
}
async function checkoutSignatureOk(orderId, paymentId, signature) {
  const expected = await hmacHex(env("RAZORPAY_KEY_SECRET"), `${orderId}|${paymentId}`);
  return safeEqual(expected, String(signature || ""));
}
function keyId() {
  return env("RAZORPAY_KEY_ID");
}
function configured() {
  return !!Deno.env.get("RAZORPAY_KEY_ID") && !!Deno.env.get("RAZORPAY_KEY_SECRET");
}

// functions/api/context.ts
async function access(claims, companyId) {
  const [r] = await asUser(claims, (tx) => tx`
    select public.is_company_member(${companyId}) as member,
           public.is_company_admin(${companyId}) as admin,
           public.company_is_active(${companyId}) as active`);
  return {
    member: !!r.member,
    admin: !!r.admin,
    active: !!r.active
  };
}
async function requireCompany(ctx, opts = {}) {
  const companyId = uuid(ctx.body.companyId, "companyId");
  const a = await access(ctx.claims, companyId);
  if (!a.member) throw new ApiError(403, "FORBIDDEN", "You are not a member of this company.");
  if (opts.admin && !a.admin) throw new ApiError(403, "FORBIDDEN", "Only company admins can do this.");
  if (opts.active !== false && !a.active) {
    throw new ApiError(402, "INACTIVE", "This company's plan is not active. The company admin can check Billing.");
  }
  return {
    companyId,
    a
  };
}

// functions/api/account.ts
var CYCLES = [
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly"
];
var CYCLE_LABEL = {
  monthly: "monthly",
  quarterly: "quarterly",
  half_yearly: "half-yearly",
  yearly: "yearly"
};
function cycleOf(v) {
  return CYCLES.includes(String(v)) ? v : null;
}
function planPrice(plan, c) {
  return {
    monthly: plan.price_monthly_paise,
    quarterly: plan.price_quarterly_paise,
    half_yearly: plan.price_half_yearly_paise,
    yearly: plan.price_yearly_paise
  }[c] ?? null;
}
var role = (v) => v === "admin" ? "admin" : "member";
var accountActions = {
  // ---------- who am I ----------
  async "me"(ctx) {
    return await asUser(ctx.claims, async (tx) => {
      const [c] = await tx`select public.my_context() as c`;
      const plans = await tx`select * from public.plans where is_public order by sort`;
      return {
        ...c.c,
        plans
      };
    });
  },
  // ---------- company ----------
  async "company.create"(ctx) {
    const b = ctx.body;
    const [r] = await asUser(ctx.claims, (tx) => tx`
      select public.create_company(${str(b.name, 120)}, ${str(b.legalName, 200) || null}, ${str(b.gstin, 15) || null}, ${str(b.phone, 20) || null}) as id`);
    return {
      companyId: r.id
    };
  },
  async "company.get"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      active: false
    });
    const [c] = await asUser(ctx.claims, (tx) => tx`select * from public.companies where id = ${companyId}`);
    return {
      company: c
    };
  },
  async "company.update"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      admin: true,
      active: false
    });
    const b = ctx.body;
    const set = {};
    if ("name" in b) set.name = str(b.name, 120);
    if ("legalName" in b) set.legal_name = str(b.legalName, 200) || null;
    if ("gstin" in b) set.gstin = str(b.gstin, 15).toUpperCase() || null;
    if ("phone" in b) set.phone = str(b.phone, 20) || null;
    if (!Object.keys(set).length) throw new ApiError(400, "INVALID", "Nothing to save.");
    const [c] = await asUser(ctx.claims, (tx) => tx`update public.companies set ${tx(set)} where id = ${companyId} returning *`);
    return {
      company: c
    };
  },
  // ---------- team ----------
  async "members.list"(ctx) {
    const { companyId, a } = await requireCompany(ctx, {
      active: false
    });
    return await asUser(ctx.claims, async (tx) => {
      const members = await tx`select m.user_id, m.role, m.created_at, p.email, p.full_name, p.avatar_url
                               from public.company_members m join public.profiles p on p.id = m.user_id
                               where m.company_id = ${companyId} order by m.created_at`;
      const invitations = a.admin ? await tx`select id, email, role, created_at, expires_at from public.invitations
                   where company_id = ${companyId} and status = 'pending' and expires_at > now() order by created_at` : [];
      const [c] = await tx`select seat_limit from public.companies where id = ${companyId}`;
      return {
        members,
        invitations,
        seatLimit: c.seat_limit,
        seatsUsed: members.length + invitations.length
      };
    });
  },
  async "invites.create"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      admin: true
    });
    const email = str(ctx.body.email, 254).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, "INVALID", "That email address does not look right.");
    const [r] = await asUser(ctx.claims, (tx) => tx`select public.invite_member(${companyId}, ${email}, ${role(ctx.body.role)}) as id`);
    return {
      invitationId: r.id,
      email
    };
  },
  async "invites.revoke"(ctx) {
    await asUser(ctx.claims, (tx) => tx`select public.revoke_invite(${uuid(ctx.body.invitationId)})`);
    return {
      revoked: true
    };
  },
  async "invites.accept"(ctx) {
    const [r] = await asUser(ctx.claims, (tx) => tx`select public.accept_invite(${uuid(ctx.body.invitationId)}) as id`);
    return {
      companyId: r.id
    };
  },
  async "members.remove"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      active: false
    });
    await asUser(ctx.claims, (tx) => tx`select public.remove_member(${companyId}, ${uuid(ctx.body.userId)})`);
    return {
      removed: true
    };
  },
  async "members.role"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      admin: true,
      active: false
    });
    await asUser(ctx.claims, (tx) => tx`select public.set_member_role(${companyId}, ${uuid(ctx.body.userId)}, ${role(ctx.body.role)})`);
    return {
      updated: true
    };
  },
  // Lookups per member and live hourly capacity, for the company admin.
  async "usage.get"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      admin: true,
      active: false
    });
    const days = Math.min(365, Math.max(1, Number(ctx.body.days) || 30));
    return await asUser(ctx.claims, async (tx) => {
      const members = await tx`select * from public.company_usage(${companyId}, now() - make_interval(days => ${days}))`;
      const daily = await tx`select date_trunc('day', created_at at time zone 'Asia/Kolkata')::date as day,
                                    count(*) filter (where not cached and ok)::int as lookups, count(*) filter (where cached)::int as from_cache
                             from public.lookup_usage where company_id = ${companyId} and created_at > now() - make_interval(days => ${days})
                             group by 1 order by 1`;
      const capacity = await tx`select * from public.company_capacity(${companyId})`;
      return {
        days,
        members,
        daily,
        capacity
      };
    });
  },
  async "audit.list"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      admin: true,
      active: false
    });
    const rows = await asUser(ctx.claims, (tx) => tx`
      select a.action, a.details, a.created_at, p.email as actor_email from public.audit_log a
      left join public.profiles p on p.id = a.actor_id
      where a.company_id = ${companyId} order by a.created_at desc limit 200`);
    return {
      log: rows
    };
  },
  // ---------- billing ----------
  async "billing.order"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      admin: true,
      active: false
    });
    const cycle = cycleOf(ctx.body.cycle) ?? "monthly";
    const planId = str(ctx.body.planId, 40);
    const [plan] = await asUser(ctx.claims, (tx) => tx`select * from public.plans where id = ${planId}`);
    if (!plan) throw new ApiError(400, "PLAN", "Choose a plan.");
    if (!plan.self_checkout) throw new ApiError(400, "PLAN", "This plan is set up with our team. Please contact us.");
    const amount = planPrice(plan, cycle);
    if (!amount) throw new ApiError(400, "PLAN", "This plan has no price for that billing cycle.");
    const [co] = await asServer((tx) => tx`select c.name, c.status, p.email, p.full_name from public.companies c
                                           join public.profiles p on p.id = ${ctx.claims.sub} where c.id = ${companyId}`);
    if (co.status === "pending_approval") throw new ApiError(409, "ALREADY_PAID", "Payment received. Your plan is waiting for approval.");
    if (co.status === "suspended") throw new ApiError(403, "SUSPENDED", "This company is suspended. Please contact us.");
    if (!configured()) {
      await asServer(async (tx) => {
        await tx`update public.companies set plan_id = ${plan.id}, billing_cycle = ${cycle},
                   status = case when status in ('pending_payment', 'cancelled') then 'pending_approval'::public.company_status else status end
                 where id = ${companyId}`;
        await tx`insert into public.audit_log (company_id, actor_id, action, details)
                 values (${companyId}, ${ctx.claims.sub}, 'billing.offline_request', ${tx.json({
          plan: plan.id,
          cycle,
          amount_paise: amount
        })})`;
      });
      throw new ApiError(409, "OFFLINE_REQUESTED", `Online payment is being set up. We've saved your ${plan.name} plan request and will contact you at ${co.email} to complete payment by UPI or bank transfer, then switch your desk on.`);
    }
    const order = await createOrder(amount, `cd_${companyId.slice(0, 8)}_${Date.now().toString(36)}`, {
      company_id: companyId,
      plan_id: plan.id,
      cycle
    });
    await asServer((tx) => tx`insert into public.payments (company_id, plan_id, billing_cycle, amount_paise, razorpay_order_id, created_by)
                              values (${companyId}, ${plan.id}, ${cycle}, ${amount}, ${String(order.id)}, ${ctx.claims.sub})`);
    return {
      keyId: keyId(),
      orderId: order.id,
      amount,
      currency: "INR",
      name: "My Creator Desk",
      description: `${plan.name} plan (${CYCLE_LABEL[cycle]})`,
      prefill: {
        email: co.email,
        name: co.full_name ?? ""
      },
      companyName: co.name
    };
  },
  // Called by the website right after Razorpay Checkout succeeds. The webhook does the same, so either is enough.
  async "billing.verify"(ctx) {
    const orderId = str(ctx.body.orderId, 64), paymentId = str(ctx.body.paymentId, 64), signature = str(ctx.body.signature, 128);
    if (!await checkoutSignatureOk(orderId, paymentId, signature)) throw new ApiError(400, "PAYMENT", "Payment could not be verified.");
    const [pay] = await asServer((tx) => tx`select * from public.payments where razorpay_order_id = ${orderId}`);
    if (!pay) throw new ApiError(404, "NOT_FOUND", "Unknown order.");
    const [ok] = await asUser(ctx.claims, (tx) => tx`select public.is_company_admin(${pay.company_id}) as a`);
    if (!ok.a) throw new ApiError(403, "FORBIDDEN", "Only company admins can pay for the plan.");
    let p = await fetchPayment(paymentId);
    if (p.order_id !== orderId || Number(p.amount) !== pay.amount_paise) throw new ApiError(400, "PAYMENT", "Payment does not match the order.");
    if (p.status === "authorized") p = await capturePayment(paymentId, pay.amount_paise);
    if (p.status !== "captured") throw new ApiError(400, "PAYMENT", `Payment is ${p.status}, not completed.`);
    const [r] = await asServer((tx) => tx`select public.mark_payment_paid(${orderId}, ${paymentId}, ${tx.json({
      method: p.method ?? null,
      email: p.email ?? null
    })}) as r`);
    return {
      result: r.r,
      companyId: pay.company_id
    };
  },
  async "billing.history"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      admin: true,
      active: false
    });
    const rows = await asUser(ctx.claims, (tx) => tx`
      select plan_id, billing_cycle, amount_paise, currency, status, razorpay_payment_id, created_at, paid_at
      from public.payments where company_id = ${companyId} order by created_at desc`);
    return {
      payments: rows
    };
  },
  // ---------- Instagram connections (company admins) ----------
  async "ig.connect"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      admin: true
    });
    const redirectUri = str(ctx.body.redirectUri, 300);
    const allowed = env("FB_REDIRECT_URIS", "https://mycreatordesk.co.in/").split(",").map((s) => s.trim());
    if (!allowed.includes(redirectUri)) throw new ApiError(400, "INVALID", "This page is not allowed to connect Instagram.");
    const code = str(ctx.body.code, 2e3);
    if (!code) throw new ApiError(400, "INVALID", "Facebook did not return a login code. Try again.");
    const accounts = await exchangeLoginCode(code, redirectUri);
    if (!accounts.length) {
      throw new ApiError(400, "NO_IG", "No Instagram professional account was found. Link your Instagram Business or Creator account to a Facebook Page, then try again and tick that Page when Facebook asks.");
    }
    const want = str(ctx.body.igUserId, 40);
    const acct = want ? accounts.find((x) => x.igUserId === want) : accounts.length === 1 ? accounts[0] : null;
    if (!acct) {
      return {
        choose: accounts.map((x) => ({
          igUserId: x.igUserId,
          username: x.username,
          pageName: x.pageName
        }))
      };
    }
    const box = await encryptSecret(acct.pageToken);
    const conn = await asServer(async (tx) => {
      const [ex] = await tx`select id, status from public.ig_connections where company_id = ${companyId} and ig_user_id = ${acct.igUserId}`;
      const [row] = ex ? await tx`update public.ig_connections set status = 'active', username = ${acct.username}, page_id = ${acct.pageId},
                   page_name = ${acct.pageName}, connected_by = ${ctx.claims.sub}, last_error = null, last_checked_at = now()
                   where id = ${ex.id} returning id, username, page_name, status` : await tx`insert into public.ig_connections (company_id, ig_user_id, username, page_id, page_name, connected_by, last_checked_at)
                   values (${companyId}, ${acct.igUserId}, ${acct.username}, ${acct.pageId}, ${acct.pageName}, ${ctx.claims.sub}, now())
                   returning id, username, page_name, status`;
      await tx`insert into public.ig_connection_secrets (connection_id, token_ciphertext) values (${row.id}, ${box})
               on conflict (connection_id) do update set token_ciphertext = excluded.token_ciphertext, updated_at = now()`;
      await tx`insert into public.audit_log (company_id, actor_id, action, details)
               values (${companyId}, ${ctx.claims.sub}, 'instagram.connected', ${tx.json({
        username: acct.username
      })})`;
      return row;
    });
    return {
      connection: conn
    };
  },
  async "ig.disconnect"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      admin: true,
      active: false
    });
    const id = uuid(ctx.body.connectionId);
    const done = await asServer(async (tx) => {
      const [row] = await tx`update public.ig_connections set status = 'revoked' where id = ${id} and company_id = ${companyId} returning username`;
      if (!row) return null;
      await tx`delete from public.ig_connection_secrets where connection_id = ${id}`;
      await tx`insert into public.audit_log (company_id, actor_id, action, details)
               values (${companyId}, ${ctx.claims.sub}, 'instagram.disconnected', ${tx.json({
        username: row.username
      })})`;
      return row;
    });
    if (!done) throw new ApiError(404, "NOT_FOUND", "Connection not found.");
    return {
      disconnected: true
    };
  },
  // "Test connection": one call to Instagram, uses 1 lookup from that account's hour.
  async "ig.test"(ctx) {
    const { companyId } = await requireCompany(ctx);
    const id = uuid(ctx.body.connectionId);
    const [c] = await asServer((tx) => tx`select c.id, c.ig_user_id, s.token_ciphertext from public.ig_connections c
                                          join public.ig_connection_secrets s on s.connection_id = c.id
                                          where c.id = ${id} and c.company_id = ${companyId} and c.status = 'active'`);
    if (!c) throw new ApiError(404, "NOT_FOUND", "Active connection not found.");
    const [g] = await asServer((tx) => tx`select public.reserve_budget(${id}, 1, ${HOURLY_CAP}) as n`);
    if (!g.n) return {
      ok: false,
      message: "This account's hourly limit is used up. Try after the hour resets."
    };
    const r = await checkConnection(c.ig_user_id, await decryptSecret(c.token_ciphertext));
    await asServer((tx) => tx`update public.ig_connections set last_checked_at = now(), last_error = ${r.ok ? null : r.error ?? null},
                              status = ${r.dead ? "expired" : "active"} where id = ${id}`);
    const [cap] = await asUser(ctx.claims, (tx) => tx`select * from public.company_capacity(${companyId}) where connection_id = ${id}`);
    return {
      ok: r.ok,
      message: r.ok ? `Connected as @${r.username}` : r.error,
      capacity: cap ?? null
    };
  },
  // ---------- platform owner ----------
  async "platform.companies"(ctx) {
    const rows = await asUser(ctx.claims, (tx) => tx`select * from public.platform_companies()`);
    return {
      companies: rows
    };
  },
  async "platform.approve"(ctx) {
    const b = ctx.body;
    const int = (v) => v === void 0 || v === null || v === "" ? null : Math.max(0, Math.round(Number(v)));
    await asUser(ctx.claims, (tx) => tx`select public.approve_company(${uuid(b.companyId)}, ${str(b.planId, 40) || null},
      ${cycleOf(b.cycle)}, ${int(b.seatLimit)}, ${int(b.igLimit)})`);
    return {
      approved: true
    };
  },
  async "platform.status"(ctx) {
    const st = str(ctx.body.status, 20);
    if (![
      "active",
      "suspended",
      "cancelled"
    ].includes(st)) throw new ApiError(400, "INVALID", "Status must be active, suspended or cancelled.");
    await asUser(ctx.claims, (tx) => tx`select public.set_company_status(${uuid(ctx.body.companyId)}, ${st}::public.company_status, ${str(ctx.body.note, 300) || null})`);
    return {
      updated: true
    };
  },
  async "platform.payments"(ctx) {
    const rows = await asUser(ctx.claims, (tx) => tx`
      select id, plan_id, billing_cycle, amount_paise, status, razorpay_order_id, razorpay_payment_id, created_at, paid_at
      from public.payments where company_id = ${uuid(ctx.body.companyId)} order by created_at desc`);
    return {
      payments: rows
    };
  }
};

// functions/_shared/analysis.ts
var POSTS_TO_READ = 12;
var POSTS_FOR_BRANDS = 25;
var POSTS_TO_SEARCH = 50;
var BENCH = {
  Nano: [
    4,
    2
  ],
  Micro: [
    3,
    1.5
  ],
  Macro: [
    2,
    1
  ],
  Mega: [
    1.5,
    0.7
  ]
};
var BRAND_ALIASES = {
  "dove": {
    tags: [
      "dove",
      "doveindia",
      "dovebodywash",
      "dovebeautybar"
    ],
    phrase: /\bdove\b/
  },
  "ghar soaps": {
    tags: [
      "gharsoaps",
      "gharsoap",
      "gharsoapsofficial",
      "gharsoapsindia"
    ],
    phrase: /\bghar\s?soaps?\b/
  },
  "pears": {
    tags: [
      "pears",
      "pearsindia",
      "pearssoap"
    ],
    phrase: /\bpears\s+(soap|body|india|bodywash|pure)\b/
  },
  "lux": {
    tags: [
      "lux",
      "luxindia",
      "luxsoap",
      "luxbodywash"
    ],
    phrase: /\blux\s+(soap|body|india|bodywash)\b/
  },
  "nivea": {
    tags: [
      "nivea",
      "niveaindia",
      "niveamen",
      "niveamenindia"
    ],
    phrase: /\bnivea\b/
  },
  "palmolive": {
    tags: [
      "palmolive",
      "palmoliveindia"
    ],
    phrase: /\bpalmolive\b/
  },
  "mamaearth": {
    tags: [
      "mamaearth",
      "mamaearthindia",
      "mamaearth.in"
    ],
    phrase: /\bmamaearth\b/
  },
  "plum": {
    tags: [
      "plumgoodness",
      "plum_goodness",
      "plumbodylovin",
      "plumgoodnessindia"
    ],
    phrase: /\bplum\s+(goodness|bodylovin|body lovin)\b/
  },
  "the body shop": {
    tags: [
      "thebodyshop",
      "thebodyshopindia",
      "tbsindia"
    ],
    phrase: /\bthe body shop\b/
  },
  "bath & body works": {
    tags: [
      "bathandbodyworks",
      "bathandbodyworksindia",
      "bbwindia"
    ],
    phrase: /\bbath\s*(&|and)\s*body\s*works\b/
  },
  "dettol": {
    tags: [
      "dettol",
      "dettolindia"
    ],
    phrase: /\bdettol\b/
  },
  "lifebuoy": {
    tags: [
      "lifebuoy",
      "lifebuoyindia"
    ],
    phrase: /\blifebuoy\b/
  },
  "santoor": {
    tags: [
      "santoor",
      "santoorsoap",
      "santoorindia"
    ],
    phrase: /\bsantoor\b/
  },
  "cinthol": {
    tags: [
      "cinthol",
      "cintholindia"
    ],
    phrase: /\bcinthol\b/
  },
  "medimix": {
    tags: [
      "medimix",
      "medimixindia",
      "medimixsoap"
    ],
    phrase: /\bmedimix\b/
  },
  "biotique": {
    tags: [
      "biotique",
      "biotiqueindia"
    ],
    phrase: /\bbiotique\b/
  },
  "hamam": {
    tags: [
      "hamam",
      "hamamindia",
      "hamamsoap"
    ],
    phrase: /\bhamam\b/
  },
  "liril": {
    tags: [
      "liril",
      "lirilindia",
      "liril2000"
    ],
    phrase: /\bliril\b/
  }
};
var COLLAB_MARK = /(#(ad|ads|advert|advertisement|sponsored|collab|collaboration|partner|partnership|paidpartnership|paidpromotion|gifted|pr|brandpartner|brandcollab)\b)|paid partnership|in collaboration with|in association with|sponsored by|powered by|#ambassador/i;
var CATEGORY_WORDS = {
  "Beauty": [
    "beauty",
    "makeup",
    "make up",
    "mua",
    "lipstick",
    "foundation",
    "cosmetic",
    "glam",
    "nykaa",
    "blush",
    "eyeliner",
    "kajal",
    "beautyblogger",
    "makeupartist",
    "swatch"
  ],
  "Skincare": [
    "skincare",
    "skin care",
    "serum",
    "moisturi",
    "sunscreen",
    "spf",
    "acne",
    "glowing skin",
    "cleanser",
    "toner",
    "niacinamide",
    "retinol",
    "dermat",
    "skin routine",
    "body wash",
    "bodywash",
    "soap"
  ],
  "Haircare": [
    "haircare",
    "hair care",
    "hair oil",
    "shampoo",
    "conditioner",
    "hairstyle",
    "hair growth",
    "hair fall",
    "curly hair"
  ],
  "Fashion": [
    "fashion",
    "outfit",
    "ootd",
    "styling",
    "style",
    "saree",
    "kurti",
    "lehenga",
    "wardrobe",
    "streetwear",
    "lookbook",
    "fashionblogger",
    "myntra",
    "zara",
    "h&m"
  ],
  "Lifestyle": [
    "lifestyle",
    "daily vlog",
    "vlog",
    "day in my life",
    "routine",
    "aesthetic",
    "life update",
    "diml"
  ],
  "Travel": [
    "travel",
    "trip",
    "wanderlust",
    "explore",
    "vacation",
    "mountains",
    "beach",
    "travelgram",
    "backpack",
    "itinerary",
    "hotel",
    "resort",
    "goa",
    "manali",
    "ladakh",
    "kashmir",
    "himachal",
    "kerala",
    "bali",
    "dubai"
  ],
  "Food": [
    "food",
    "recipe",
    "foodie",
    "cooking",
    "cook",
    "chef",
    "restaurant",
    "cafe",
    "street food",
    "tasty",
    "delicious",
    "baking",
    "dessert",
    "biryani",
    "foodblogger",
    "zomato",
    "swiggy"
  ],
  "Fitness": [
    "fitness",
    "workout",
    "gym",
    "yoga",
    "exercise",
    "abs",
    "fit",
    "weight loss",
    "fatloss",
    "protein",
    "bodybuilding",
    "running",
    "pilates"
  ],
  "Health & Wellness": [
    "wellness",
    "health",
    "healthy",
    "nutrition",
    "diet",
    "mental health",
    "self care",
    "selfcare",
    "ayurveda",
    "holistic",
    "mindful"
  ],
  "Parenting": [
    "mom",
    "mommy",
    "mother",
    "parenting",
    "baby",
    "toddler",
    "kids",
    "momlife",
    "motherhood",
    "newborn",
    "pregnancy",
    "dad"
  ],
  "Tech": [
    "tech",
    "gadget",
    "smartphone",
    "iphone",
    "android",
    "laptop",
    "unboxing",
    "review",
    "ai ",
    "coding",
    "software",
    "apps"
  ],
  "Gaming": [
    "gaming",
    "gamer",
    "bgmi",
    "pubg",
    "free fire",
    "valorant",
    "esports",
    "stream",
    "minecraft",
    "gta"
  ],
  "Comedy": [
    "comedy",
    "funny",
    "meme",
    "memes",
    "humor",
    "humour",
    "skit",
    "relatable",
    "standup",
    "stand up",
    "prank",
    "lol"
  ],
  "Entertainment": [
    "entertainment",
    "actor",
    "actress",
    "film",
    "movie",
    "bollywood",
    "web series",
    "celebrity",
    "acting"
  ],
  "Music": [
    "music",
    "singer",
    "song",
    "cover",
    "musician",
    "guitar",
    "rapper",
    "singing",
    "producer"
  ],
  "Dance": [
    "dance",
    "dancer",
    "choreograph",
    "kathak",
    "bharatanatyam",
    "hip hop"
  ],
  "Education": [
    "education",
    "learn",
    "tips",
    "study",
    "exam",
    "upsc",
    "teacher",
    "students",
    "career",
    "english speaking",
    "knowledge",
    "facts"
  ],
  "Finance": [
    "finance",
    "money",
    "invest",
    "stock",
    "trading",
    "mutual fund",
    "crypto",
    "personal finance",
    "savings",
    "tax",
    "sip"
  ],
  "Business": [
    "business",
    "entrepreneur",
    "startup",
    "marketing",
    "founder",
    "brand building",
    "linkedin",
    "sales"
  ],
  "Home & Decor": [
    "home decor",
    "homedecor",
    "interior",
    "decor",
    "diy home",
    "organisation",
    "organization",
    "cleaning",
    "kitchen",
    "home tour"
  ],
  "Pets": [
    "pet",
    "dog",
    "puppy",
    "cat",
    "kitten",
    "petsofinstagram",
    "dogsofinstagram"
  ],
  "Automotive": [
    "car",
    "cars",
    "bike",
    "motorcycle",
    "automobile",
    "supercar",
    "ride",
    "biker"
  ],
  "Photography": [
    "photography",
    "photographer",
    "photo",
    "portrait",
    "lightroom",
    "canon",
    "nikon",
    "sony alpha"
  ],
  "Art & DIY": [
    "art",
    "artist",
    "drawing",
    "painting",
    "sketch",
    "craft",
    "diy",
    "handmade",
    "illustration"
  ],
  "Sports": [
    "cricket",
    "football",
    "sports",
    "athlete",
    "badminton",
    "tennis",
    "kabaddi"
  ],
  "Spirituality": [
    "spiritual",
    "astrology",
    "tarot",
    "meditation",
    "mahadev",
    "krishna",
    "bhakti",
    "manifest"
  ],
  "Books": [
    "book",
    "books",
    "reading",
    "bookstagram",
    "author",
    "novel",
    "poetry",
    "poet",
    "shayari"
  ],
  "Motivation": [
    "motivation",
    "motivational",
    "inspiration",
    "mindset",
    "success",
    "self improvement",
    "growth",
    "discipline"
  ]
};
var CATEGORY_LIST = Object.keys(CATEGORY_WORDS).concat([
  "Other"
]);
var HINGLISH = /\b(hai|hain|nahi|nhi|kya|kyu|kaise|mera|meri|tera|teri|aur|bhi|kar|karo|karna|ke|ki|ko|se|yaar|bhai|accha|acha|hum|tum|aap|apna|apni|wala|wali|bahut|bohot|sab|toh|jab|kuch|matlab|dekho|zindagi|pyaar|dil)\b/g;
function brandMatchers_(listText) {
  return String(listText || "").split(/[,\n;]+/).map(function(s) {
    return s.trim();
  }).filter(Boolean).map(function(name) {
    const key2 = name.toLowerCase();
    const known = BRAND_ALIASES[key2];
    if (known) return {
      name,
      tags: known.tags,
      phrase: known.phrase
    };
    const base = key2.replace(/[^a-z0-9]/g, "");
    const tags = [
      base,
      base + "india",
      base + "official",
      base + "_india",
      base + ".in",
      base + "in"
    ];
    const esc = key2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
    return {
      name,
      tags,
      phrase: base.length >= 4 ? new RegExp("\\b" + esc + "\\b") : null
    };
  });
}
function scanBrands_(posts, ownHandle, listText) {
  const matchers = brandMatchers_(listText);
  const hits = {};
  const collabs = {};
  const own = String(ownHandle || "").toLowerCase();
  posts.forEach(function(p) {
    const cap = String(p.caption || "");
    if (!cap) return;
    const low = cap.toLowerCase();
    const paid = COLLAB_MARK.test(cap);
    const tokens = (low.match(/[@#][a-z0-9._]+/g) || []).map(function(t) {
      return t.slice(1).replace(/[._]+$/, "");
    });
    matchers.forEach(function(m) {
      const tagHit = tokens.some(function(t) {
        return m.tags.indexOf(t) >= 0 || m.tags.indexOf(t.replace(/[._]/g, "")) >= 0;
      });
      const textHit = m.phrase ? m.phrase.test(low) : false;
      if (!tagHit && !textHit) return;
      const h = hits[m.name] || (hits[m.name] = {
        n: 0,
        paid: 0,
        last: null
      });
      h.n++;
      if (paid) h.paid++;
      const d = p.timestamp ? new Date(p.timestamp) : null;
      if (d && (!h.last || d > h.last)) h.last = d;
    });
    if (paid) {
      (cap.match(/@[A-Za-z0-9._]+/g) || []).forEach(function(m) {
        const t = m.replace(/[._]+$/, "");
        if (t.slice(1).toLowerCase() === own) return;
        collabs[t] = (collabs[t] || 0) + 1;
      });
    }
  });
  const comp = Object.keys(hits).sort(function(a, b) {
    return hits[b].n - hits[a].n;
  }).map(function(k) {
    const h = hits[k];
    return k + " (" + h.n + " post" + (h.n > 1 ? "s" : "") + (h.paid ? ", " + h.paid + " marked as ad/collab" : "") + (h.last ? ", latest " + h.last.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata"
    }) : "") + ")";
  }).join("; ");
  const col = Object.keys(collabs).sort(function(a, b) {
    return collabs[b] - collabs[a];
  }).slice(0, 8).join(", ");
  return {
    competitors: comp || "None found",
    collabs: col || "None found",
    checked: posts.length
  };
}
function analyse_(bd, competitorList) {
  const all = bd.media && bd.media.data || [];
  const posts = all.slice(0, POSTS_TO_READ);
  const brands = scanBrands_(all, bd.username, competitorList || "");
  const isNum = function(v) {
    return typeof v === "number" && isFinite(v);
  };
  const withLikes = posts.filter(function(p) {
    return isNum(p.like_count);
  });
  const withComments = posts.filter(function(p) {
    return isNum(p.comments_count);
  });
  const withViews = posts.filter(function(p) {
    return isNum(p.view_count) && p.view_count > 0;
  });
  return {
    followers: bd.followers_count || 0,
    posts: bd.media_count || 0,
    sampled: posts.length,
    videos: withViews.length,
    hiddenLikes: posts.length - withLikes.length,
    avgLikes: avg_(withLikes.map(function(p) {
      return p.like_count;
    })),
    avgComments: avg_(withComments.map(function(p) {
      return p.comments_count;
    })),
    avgViews: avg_(withViews.map(function(p) {
      return p.view_count;
    })),
    competitors: brands.competitors,
    collabs: brands.collabs,
    captionsChecked: brands.checked,
    category: detectCategory_(bd, all),
    language: detectLanguage_(bd, all),
    ytLink: findYouTube_(bd, all),
    ins: insights_(bd, all)
  };
}
function findYouTube_(bd, media) {
  const text = [
    bd.website || "",
    bd.biography || ""
  ].concat((media || []).map(function(p) {
    return p.caption || "";
  })).join(" ");
  const m = text.match(/(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(@[\w.-]+|c\/[\w.-]+|channel\/[\w-]+|user\/[\w.-]+)|youtu\.be\/[\w-]+)/i);
  if (m) return (/^https?:/i.test(m[0]) ? "" : "https://") + m[0];
  return "None in bio";
}
function reelPriceEstimate_(a) {
  if (!a.followers) return null;
  const tier = tierFor_(a.followers);
  const perK = {
    Nano: 400,
    Micro: 300,
    Macro: 220,
    Mega: 150
  }[tier] || 300;
  let p = a.followers / 1e3 * perK;
  const er = ((a.avgLikes || 0) + (a.avgComments || 0)) / a.followers * 100;
  const st = erStatus_(tier, er);
  p *= st === "good" ? 1.2 : st === "ok" ? 1 : 0.75;
  if (a.avgViews && a.avgViews > a.followers) p *= 1.2;
  return Math.max(500, Math.round(p / 500) * 500);
}
function sentimentEstimate_(a) {
  if (!a.sampled) return "";
  const cr = a.avgLikes ? (a.avgComments || 0) / a.avgLikes * 100 : null;
  const label = cr == null ? "Comment activity" : cr >= 3 ? "Active, talkative audience" : cr >= 1 ? "Normal comment activity" : "Quiet audience";
  return label + " (est.): " + Math.round(a.avgComments || 0) + " comments per post" + (cr != null ? ", " + cr.toFixed(1) + "% of likes" : "");
}
function countHits_(text, word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tail = word.length <= 4 ? "(?![a-z])" : "";
  const m = text.match(new RegExp("(^|[^a-z])#?" + esc + tail, "g"));
  return m ? m.length : 0;
}
function detectCategory_(bd, media) {
  const bio = (String(bd.biography || "") + " " + String(bd.name || "") + " " + String(bd.username || "").replace(/[._]/g, " ")).toLowerCase();
  const caps = (media || []).map(function(p) {
    return String(p.caption || "");
  }).join(" \n ").toLowerCase();
  const scores = Object.keys(CATEGORY_WORDS).map(function(cat) {
    let sc = 0;
    CATEGORY_WORDS[cat].forEach(function(w) {
      sc += countHits_(bio, w) * 4 + Math.min(countHits_(caps, w), 6);
    });
    return [
      cat,
      sc
    ];
  }).sort(function(a, b) {
    return b[1] - a[1];
  });
  if (!scores[0][1]) return "Lifestyle";
  if (scores[1][1] >= scores[0][1] * 0.6 && scores[1][1] >= 3) return scores[0][0] + ", " + scores[1][0];
  return scores[0][0];
}
function detectLanguage_(bd, media) {
  const text = String(bd.biography || "") + " " + (media || []).map(function(p) {
    return String(p.caption || "");
  }).join(" ");
  const scripts = [
    [
      "Hindi",
      /[\u0900-\u097F]/g
    ],
    [
      "Bengali",
      /[\u0980-\u09FF]/g
    ],
    [
      "Punjabi",
      /[\u0A00-\u0A7F]/g
    ],
    [
      "Gujarati",
      /[\u0A80-\u0AFF]/g
    ],
    [
      "Odia",
      /[\u0B00-\u0B7F]/g
    ],
    [
      "Tamil",
      /[\u0B80-\u0BFF]/g
    ],
    [
      "Telugu",
      /[\u0C00-\u0C7F]/g
    ],
    [
      "Kannada",
      /[\u0C80-\u0CFF]/g
    ],
    [
      "Malayalam",
      /[\u0D00-\u0D7F]/g
    ],
    [
      "Urdu",
      /[\u0600-\u06FF]/g
    ]
  ];
  const latin = (text.match(/[a-z]/gi) || []).length;
  let best = null, bestN = 0;
  scripts.forEach(function(s) {
    const n = (text.match(s[1]) || []).length;
    if (n > bestN) {
      best = s[0];
      bestN = n;
    }
  });
  const hing = (text.toLowerCase().match(HINGLISH) || []).length;
  const words = (text.match(/[a-z]+/gi) || []).length || 1;
  if (best && bestN >= 20 && bestN >= latin * 0.3) return latin > bestN * 0.5 ? best + ", English" : best;
  if (hing >= 5 && hing / words > 0.04) return "Hindi, English";
  if (latin < 15) return best || "";
  return "English";
}
function estimateReach_(a) {
  if (a.avgViews) return Math.round(a.avgViews * 0.8);
  const rate = {
    Nano: 0.3,
    Micro: 0.2,
    Macro: 0.15,
    Mega: 0.1
  }[tierFor_(a.followers)] || 0.2;
  return a.followers ? Math.round(a.followers * rate) : "";
}
function autoDetails_(a) {
  const price = reelPriceEstimate_(a);
  const big = /Macro|Mega/.test(tierFor_(a.followers));
  return {
    category: a.category,
    language: a.language,
    reach: estimateReach_(a),
    ytLink: a.ytLink || "",
    collab: price ? Math.round(price * 1.4 / 500) * 500 : "",
    adRights: price ? Math.max(500, Math.round(price * 0.3 / 500) * 500) : "",
    sentiment: sentimentEstimate_(a),
    deliverables: big ? "1 Reel + 3 Stories (with link) + Auto-DM (suggested)" : "1 Reel + 2 Stories (with link) + Auto-DM (suggested)"
  };
}
function postViews_(m, bd) {
  if (m.view_count) return {
    views: m.view_count,
    est: false
  };
  const media = bd && bd.media && bd.media.data || [];
  const vids = media.filter(function(p) {
    return p.view_count > 0;
  }).map(function(p) {
    return p.view_count;
  });
  const followers = bd && bd.followers_count || 0;
  let v = vids.length ? avg_(vids) * 0.6 : estimateReach_({
    followers,
    avgViews: null
  });
  if (m.like_count) v = Math.max(v || 0, m.like_count * 8);
  return {
    views: v ? Math.round(v) : "",
    est: !!v
  };
}
function isSponsored_(p) {
  return COLLAB_MARK.test(String(p.caption || ""));
}
function formatOf_(p) {
  const t = String(p.media_type || ""), pt = String(p.media_product_type || "");
  if (pt === "REELS" || t === "VIDEO") return "Reels";
  if (t === "CAROUSEL_ALBUM") return "Carousel";
  return "Photo";
}
function engOf_(p) {
  return (typeof p.like_count === "number" ? p.like_count : 0) + (p.comments_count || 0);
}
function shortNum_(v) {
  if (v == null || !isFinite(v)) return "\u2014";
  if (v >= 1e7) return (v / 1e7).toFixed(1).replace(/\.0$/, "") + " Cr";
  if (v >= 1e5) return (v / 1e5).toFixed(1).replace(/\.0$/, "") + "L";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(v));
}
function insights_(bd, media) {
  const followers = bd.followers_count || 0;
  const follows = bd.follows_count;
  const out = {
    credibility: "",
    qualityWhy: "",
    organicEr: "",
    sponsoredEr: "",
    sponsoredLift: "",
    boosted: "",
    bestFormat: "",
    contentMix: "",
    qualityScore: null
  };
  if (!followers || !media || !media.length) return out;
  const tier = tierFor_(followers);
  const bench = BENCH[tier] || BENCH.Micro;
  const withLikes = media.filter(function(p) {
    return typeof p.like_count === "number";
  });
  const organic = withLikes.filter(function(p) {
    return !isSponsored_(p);
  });
  const sponsored = withLikes.filter(isSponsored_);
  const erOf = function(list) {
    return list.length ? avg_(list.map(engOf_)) / followers * 100 : null;
  };
  const orgEr = erOf(organic);
  const orgViews = organic.map(function(p) {
    return p.view_count;
  }).filter(function(v) {
    return v > 0;
  });
  const orgViewMed = median_(orgViews), orgEngMed = median_(organic.map(engOf_));
  const boosted = sponsored.filter(function(p) {
    if (p.view_count > 0 && orgViewMed) return p.view_count > orgViewMed * 3 && p.view_count > followers * 0.5;
    return orgEngMed ? engOf_(p) > orgEngMed * 3 : false;
  });
  out.boosted = sponsored.length ? boosted.length ? boosted.length + " of " + sponsored.length + " sponsored posts look boosted (paid promotion)" : "None" : "";
  const fair = sponsored.filter(function(p) {
    return boosted.indexOf(p) < 0;
  });
  const sponEr = erOf(fair.length ? fair : sponsored);
  if (orgEr != null) out.organicEr = round_(orgEr, 2);
  if (sponEr != null) out.sponsoredEr = round_(sponEr, 2);
  if (!sponsored.length) out.sponsoredLift = "No sponsored posts in last " + media.length;
  else if (orgEr == null || !organic.length) out.sponsoredLift = "Only sponsored posts found";
  else {
    const lift = (sponEr - orgEr) / orgEr * 100;
    const word = Math.abs(lift) < 10 ? "Same as organic" : lift > 0 ? "Sponsored does better" : "Sponsored does worse";
    out.sponsoredLift = (lift >= 0 ? "+" : "") + Math.round(lift) + "% \xB7 " + word + " (" + sponsored.length + " sponsored, " + organic.length + " organic" + (boosted.length && fair.length ? ", boosted left out" : "") + ")";
  }
  if (organic.length < 4) {
    out.credibility = "Not enough posts";
    out.qualityWhy = "Needs at least 4 organic posts with visible likes (found " + organic.length + ").";
  } else {
    let score = 0;
    const why = [];
    const qEr = median_(organic.map(engOf_)) / followers * 100;
    if (qEr >= bench[0]) {
      score += 35;
      why.push("Typical ER " + qEr.toFixed(2) + "% is strong for " + tier);
    } else if (qEr >= bench[1]) {
      score += 26;
      why.push("Typical ER " + qEr.toFixed(2) + "% is normal for " + tier);
    } else if (qEr >= bench[1] * 0.5) {
      score += 12;
      why.push("Typical ER " + qEr.toFixed(2) + "% is low for " + tier + " (normal " + bench[1] + "\u2013" + bench[0] + "%)");
    } else why.push("Typical ER " + qEr.toFixed(2) + "% is very low for " + tier + " (normal " + bench[1] + "\u2013" + bench[0] + "%)");
    const likes = avg_(organic.map(function(p) {
      return p.like_count;
    })), comm = avg_(organic.map(function(p) {
      return p.comments_count || 0;
    }));
    const cr = likes ? comm / likes * 100 : null;
    if (cr == null) score += 10;
    else if (cr >= 0.5 && cr <= 15) {
      score += 20;
    } else if (cr >= 0.2 && cr <= 30) {
      score += 10;
      why.push("Comments are " + cr.toFixed(1) + "% of likes (a bit unusual)");
    } else why.push(cr < 0.2 ? "Very few comments for the likes (" + cr.toFixed(2) + "%), a sign of bought likes" : "Comments are " + Math.round(cr) + "% of likes, a sign of comment pods");
    const med = median_(organic.map(function(p) {
      return p.like_count;
    }));
    const spikes = organic.filter(function(p) {
      const c = p.like_count ? (p.comments_count || 0) / p.like_count * 100 : 0;
      return med > 0 && p.like_count > med * 4 && c < 0.3;
    });
    if (!spikes.length) score += 20;
    else if (spikes.length === 1) {
      score += 8;
      why.push("1 normal post has a sudden like spike with few comments");
    } else why.push(spikes.length + " normal posts have sudden like spikes with few comments");
    const vr = orgViews.length ? median_(orgViews) / followers : null;
    if (vr == null) score += 12;
    else if (vr >= 0.3) {
      score += 25;
      why.push("Reels reach " + Math.round(vr * 100) + "% of followers");
    } else if (vr >= 0.1) {
      score += 16;
    } else if (vr >= 0.03) {
      score += 6;
      why.push("Reels reach only " + Math.round(vr * 100) + "% of followers");
    } else why.push("Reels reach under 3% of followers");
    if (follows != null && followers >= 5e3 && follows > followers * 0.8) {
      score -= 15;
      why.push("Follows " + shortNum_(follows) + " accounts (follow-for-follow sign)");
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    if (spikes.length) score = Math.min(score, 69);
    const label = score >= 70 ? "Genuine" : score >= 45 ? "Check" : "Suspicious";
    out.qualityScore = score;
    out.credibility = label + " \xB7 " + score + "/100";
    const warn = /\blow\b|spike|\bfew\b|Follows|unusual|\bsign\b|\bonly\b|\bunder\b/;
    why.sort(function(x, y) {
      return (warn.test(y) ? 1 : 0) - (warn.test(x) ? 1 : 0);
    });
    out.qualityWhy = (why.length ? why.slice(0, 3).join(". ") : "Engagement, comments and views all look normal") + ". Based on " + organic.length + " organic posts; sponsored posts are left out.";
  }
  const groups = {};
  media.forEach(function(p) {
    const f = formatOf_(p);
    (groups[f] = groups[f] || []).push(p);
  });
  const rows = [
    "Reels",
    "Carousel",
    "Photo"
  ].filter(function(f) {
    return groups[f];
  }).map(function(f) {
    const g = groups[f], gl = g.filter(function(p) {
      return typeof p.like_count === "number";
    });
    const v = g.map(function(p) {
      return p.view_count;
    }).filter(function(x) {
      return x > 0;
    });
    return {
      f,
      n: g.length,
      share: Math.round(g.length / media.length * 100),
      er: gl.length ? avg_(gl.map(engOf_)) / followers * 100 : null,
      views: v.length ? avg_(v) : null
    };
  });
  out.contentMix = rows.map(function(r) {
    return r.f + " " + r.share + "% (" + r.n + (r.n === 1 ? " post" : " posts") + ") \xB7 ER " + (r.er != null ? r.er.toFixed(2) + "%" : "\u2014") + (r.views ? " \xB7 " + shortNum_(r.views) + " views" : "");
  }).join(" | ");
  const ranked = rows.filter(function(r) {
    return r.n >= 2 && r.er != null;
  }).sort(function(a, b) {
    return b.er - a.er;
  });
  if (!ranked.length) out.bestFormat = rows.length ? rows[0].f + " (only format with enough posts)" : "";
  else if (ranked.length === 1) out.bestFormat = ranked[0].f + " (only format with enough posts)";
  else {
    const x = ranked[0].er / Math.max(ranked[ranked.length - 1].er, 0.01);
    out.bestFormat = ranked[0].f + (x >= 1.15 ? " (" + x.toFixed(1) + "x the ER of " + ranked[ranked.length - 1].f + ")" : " (all formats do about the same)");
  }
  return out;
}
function tierFor_(f) {
  if (!f) return "";
  if (f < 1e4) return "Nano";
  if (f < 1e5) return "Micro";
  if (f < 1e6) return "Macro";
  return "Mega";
}
function erStatus_(tier, er) {
  const b = BENCH[tier] || BENCH.Micro;
  if (er == null) return "weak";
  return er >= b[0] ? "good" : er >= b[1] ? "ok" : "weak";
}
function avg_(arr) {
  return arr.length ? arr.reduce(function(s, v) {
    return s + v;
  }, 0) / arr.length : null;
}
function median_(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort(function(a, b) {
    return a - b;
  });
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function round_(v, d) {
  return v == null ? "" : Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
}
function cleanHandle_(v) {
  let h = String(v || "").trim();
  if (!h) return "";
  const m = h.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) h = m[1];
  return h.replace(/^@/, "").replace(/[/?#].*$/, "").toLowerCase();
}
function shortcode_(link) {
  const m = String(link || "").match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : "";
}
function matchPost_(media, code) {
  for (let i = 0; i < media.length; i++) {
    if (shortcode_(media[i].permalink) === code) return media[i];
  }
  return null;
}

// functions/api/lookups.ts
var CACHE_HOURS = 6;
function resetTimeText() {
  const next = new Date((Math.floor(Date.now() / 36e5) + 1) * 36e5);
  return next.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata"
  }) + " IST";
}
async function fetchCreators(companyId, handles, limit = POSTS_FOR_BRANDS) {
  const out = /* @__PURE__ */ new Map();
  const key2 = (h) => limit === POSTS_FOR_BRANDS ? h : `${h}#${limit}`;
  if (!handles.length) return out;
  const cached = await asServer((tx) => tx`
    select handle, data from public.bd_cache
    where company_id = ${companyId} and handle = any(${handles.map(key2)})
      and fetched_at > now() - make_interval(hours => ${CACHE_HOURS})`);
  const hit = new Map(cached.map((r) => [
    r.handle,
    r.data
  ]));
  const need = [];
  for (const h of handles) {
    const d = hit.get(key2(h));
    if (d) out.set(h, {
      bd: d,
      cached: true
    });
    else need.push(h);
  }
  if (!need.length) return out;
  const conns = await asServer((tx) => tx`
    select c.id, c.ig_user_id, s.token_ciphertext
    from public.ig_connections c join public.ig_connection_secrets s on s.connection_id = c.id
    where c.company_id = ${companyId} and c.status = 'active'
    order by c.created_at`);
  if (!conns.length) {
    for (const h of need) out.set(h, {
      cached: false,
      error: "No Instagram account is connected yet. Ask your company admin to connect one in Settings."
    });
    return out;
  }
  const plan = [];
  let rest = need.slice();
  for (const c of conns) {
    if (!rest.length) break;
    const [g] = await asServer((tx) => tx`select public.reserve_budget(${c.id}, ${rest.length}, ${HOURLY_CAP}) as n`);
    const n = Number(g.n);
    if (n > 0) {
      plan.push({
        conn: c,
        handles: rest.slice(0, n)
      });
      rest = rest.slice(n);
    }
  }
  const limitMsg = `Safe hourly limit reached on your company's Instagram accounts (${HOURLY_CAP} lookups per account per hour). Try again after ${resetTimeText()}.`;
  for (const h of rest) out.set(h, {
    cached: false,
    error: limitMsg
  });
  const fresh = [];
  await Promise.all(plan.map(async ({ conn, handles: hs }) => {
    let token;
    try {
      token = await decryptSecret(conn.token_ciphertext);
    } catch {
      for (const h of hs) out.set(h, {
        cached: false,
        error: "The stored Instagram connection could not be read. Reconnect it."
      });
      return;
    }
    let stop = null;
    for (let i = 0; i < hs.length; i += 10) {
      const part = hs.slice(i, i + 10);
      if (stop) {
        for (const h of part) out.set(h, {
          cached: false,
          error: stop,
          connectionId: conn.id
        });
        continue;
      }
      const res = await Promise.all(part.map((h) => discovery(conn.ig_user_id, token, h, limit).catch((e) => ({
        error: {
          message: String(e?.message ?? e)
        }
      }))));
      for (let k = 0; k < part.length; k++) {
        const h = part[k], r = res[k];
        if (r.bd) {
          out.set(h, {
            bd: r.bd,
            cached: false,
            connectionId: conn.id
          });
          fresh.push([
            key2(h),
            r.bd
          ]);
          continue;
        }
        const e = r.error ?? {};
        out.set(h, {
          cached: false,
          error: friendlyError(e),
          connectionId: conn.id
        });
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
  if (fresh.length) {
    await asServer(async (tx) => {
      for (const [h, bd] of fresh) {
        await tx`insert into public.bd_cache (company_id, handle, data, fetched_at) values (${companyId}, ${h}, ${tx.json(bd)}, now())
                 on conflict (company_id, handle) do update set data = excluded.data, fetched_at = now()`;
      }
      await tx`delete from public.bd_cache where company_id = ${companyId} and fetched_at < now() - interval '2 days'`;
    });
  }
  return out;
}
async function logUsage(companyId, userId, results) {
  if (!results.size) return;
  const rows = [
    ...results.entries()
  ].map(([h, r]) => ({
    company_id: companyId,
    user_id: userId,
    connection_id: r.connectionId ?? null,
    handle: h,
    cached: r.cached,
    ok: !r.error,
    error: r.error ? r.error.slice(0, 300) : null
  }));
  await asServer((tx) => tx`insert into public.lookup_usage ${tx(rows)}`);
}

// functions/api/work.ts
var PLATFORMS = [
  "Instagram",
  "Instagram Story",
  "YouTube",
  "YouTube Shorts",
  "Moj / Josh",
  "Other"
];
var HANDLE = /^[a-z0-9._]{1,30}$/;
var MAX_PER_CALL = 25;
var EDITABLE = {
  category: "text",
  language: "text",
  link: "text",
  yt_link: "text",
  reach: "num",
  sentiment: "text",
  deliverables: "text",
  collab_price: "num",
  ad_rights_price: "num",
  fee: "num",
  platform: "text"
};
var MANUAL_NUMBERS = {
  followers: "num",
  views: "num",
  likes: "num",
  comments: "num",
  posts: "num"
};
function clean(fields, allowed) {
  const out = {};
  for (const [k, kind] of Object.entries(allowed)) {
    if (!(k in fields)) continue;
    out[k] = kind === "num" ? numOrNull(fields[k]) : str(fields[k], 2e3) || null;
  }
  if ("platform" in out && !PLATFORMS.includes(String(out.platform))) out.platform = "Other";
  if (out.followers != null) out.followers = Math.round(Number(out.followers));
  if (out.posts != null) out.posts = Math.round(Number(out.posts));
  return out;
}
var nn = (v) => v === "" || v === void 0 || v === null || typeof v === "number" && !Number.isFinite(v) ? null : v;
function creatorFields(a) {
  const ins = a.ins ?? {};
  const auto = autoDetails_(a);
  const status = "\u2713 Based on last " + a.sampled + " posts" + (a.videos ? " (" + a.videos + " with views)" : " (no video views found)") + (a.hiddenLikes ? ". " + a.hiddenLikes + " posts hide likes, so engagement is lower than real." : "");
  return {
    always: {
      followers: a.followers,
      posts: a.posts,
      likes: nn(round_(a.avgLikes, 0)),
      comments: nn(round_(a.avgComments, 0)),
      views: nn(round_(a.avgViews, 0)),
      competitors: a.competitors,
      collabs: a.collabs,
      quality: nn(ins.credibility),
      quality_score: nn(ins.qualityScore),
      quality_why: nn(ins.qualityWhy),
      organic_er: nn(ins.organicEr),
      sponsored_er: nn(ins.sponsoredEr),
      sponsored_lift: nn(ins.sponsoredLift),
      boosted: nn(ins.boosted),
      best_format: nn(ins.bestFormat),
      content_mix: nn(ins.contentMix),
      status,
      fetched_at: /* @__PURE__ */ new Date(),
      source: "Instagram API"
    },
    fill: {
      category: nn(auto.category),
      language: nn(auto.language),
      reach: nn(auto.reach),
      yt_link: nn(auto.ytLink),
      collab_price: nn(auto.collab),
      ad_rights_price: nn(auto.adRights),
      sentiment: nn(auto.sentiment),
      deliverables: nn(auto.deliverables)
    }
  };
}
async function competitorsFor(ctx, companyId) {
  const [s] = await asUser(ctx.claims, (tx) => tx`
    select competitors from public.campaign_settings where company_id = ${companyId} and owner_id = ${ctx.claims.sub}`);
  return String(s?.competitors ?? "");
}
async function lookupAndSave(ctx, companyId, handles, fee) {
  const results = await fetchCreators(companyId, handles);
  await logUsage(companyId, ctx.claims.sub, results);
  const competitors = await competitorsFor(ctx, companyId);
  const rows = [];
  const report = [];
  await asUser(ctx.claims, async (tx) => {
    for (const h of handles) {
      const r = results.get(h);
      const [ex] = await tx`select * from public.creators where company_id = ${companyId} and owner_id = ${ctx.claims.sub} and lower(name) = ${h}`;
      if (!r.bd) {
        if (ex) await tx`update public.creators set status = ${"\u2717 " + r.error} where id = ${ex.id}`;
        report.push({
          handle: h,
          ok: false,
          cached: r.cached,
          message: r.error ?? "Failed"
        });
        continue;
      }
      const f = creatorFields(analyse_(r.bd, competitors));
      const set = {
        ...f.always,
        link: `https://www.instagram.com/${h}/`,
        platform: "Instagram"
      };
      for (const [k, v] of Object.entries(f.fill)) if (v != null && (!ex || ex[k] === null || ex[k] === "")) set[k] = v;
      if (fee != null) set.fee = fee;
      let row;
      if (ex) [row] = await tx`update public.creators set ${tx(set)} where id = ${ex.id} returning *`;
      else [row] = await tx`insert into public.creators ${tx({
        ...set,
        company_id: companyId,
        owner_id: ctx.claims.sub,
        name: h
      })} returning *`;
      rows.push(row);
      report.push({
        handle: h,
        ok: true,
        cached: r.cached,
        message: r.cached ? "From cache (no lookup used)" : "Fetched"
      });
    }
  });
  return {
    creators: rows,
    results: report
  };
}
function handlesFrom(list) {
  const arr = Array.isArray(list) ? list : [
    list
  ];
  const hs = [
    ...new Set(arr.map((x) => cleanHandle_(x)).filter(Boolean))
  ];
  const bad = hs.filter((h) => !HANDLE.test(h));
  if (bad.length) throw new ApiError(400, "INVALID", `These are not Instagram handles: ${bad.slice(0, 5).join(", ")}`);
  if (!hs.length) throw new ApiError(400, "INVALID", "Type an Instagram handle, like itss.vanshikaaa");
  if (hs.length > MAX_PER_CALL) throw new ApiError(400, "INVALID", `Send at most ${MAX_PER_CALL} handles at a time.`);
  return hs;
}
var workActions = {
  // Everything the dashboard shows for one company. scope "team" (admins only) includes everyone's rows.
  async "work.state"(ctx) {
    const { companyId, a } = await requireCompany(ctx, {
      active: false
    });
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
      return {
        creators,
        posts,
        settings: settings ?? null,
        connections,
        capacity,
        scope: team ? "team" : "mine",
        active: a.active,
        admin: a.admin
      };
    });
  },
  async "creators.lookup"(ctx) {
    const { companyId } = await requireCompany(ctx);
    return await lookupAndSave(ctx, companyId, handlesFrom(ctx.body.handles ?? ctx.body.handle), numOrNull(ctx.body.fee));
  },
  // Re-fetch this person's Instagram creators that are older than 12 hours (or missing the newer columns).
  async "creators.refresh"(ctx) {
    const { companyId } = await requireCompany(ctx);
    const stale = await asUser(ctx.claims, (tx) => tx`
      select lower(name) as h from public.creators
      where company_id = ${companyId} and owner_id = ${ctx.claims.sub} and platform = 'Instagram' and source = 'Instagram API'
        and (fetched_at is null or fetched_at < now() - interval '12 hours' or best_format is null)
      order by fetched_at nulls first limit ${MAX_PER_CALL}`);
    const hs = stale.map((r) => r.h).filter((h) => HANDLE.test(h));
    if (!hs.length) return {
      creators: [],
      results: [],
      remaining: 0
    };
    const res = await lookupAndSave(ctx, companyId, hs);
    const [left] = await asUser(ctx.claims, (tx) => tx`
      select count(*)::int as n from public.creators
      where company_id = ${companyId} and owner_id = ${ctx.claims.sub} and platform = 'Instagram' and source = 'Instagram API'
        and (fetched_at is null or fetched_at < now() - interval '12 hours' or best_format is null)`);
    return {
      ...res,
      remaining: left.n
    };
  },
  async "creators.save"(ctx) {
    const { companyId } = await requireCompany(ctx);
    const id = uuid(ctx.body.id);
    return await asUser(ctx.claims, async (tx) => {
      const [ex] = await tx`select source from public.creators where id = ${id} and company_id = ${companyId}`;
      if (!ex) throw new ApiError(404, "NOT_FOUND", "Creator not found.");
      const set = clean(ctx.body.fields ?? {}, ex.source === "Manual" ? {
        ...EDITABLE,
        ...MANUAL_NUMBERS
      } : EDITABLE);
      if (!Object.keys(set).length) throw new ApiError(400, "INVALID", "Nothing to save.");
      const [row] = await tx`update public.creators set ${tx(set)} where id = ${id} returning *`;
      if (!row) throw new ApiError(403, "FORBIDDEN", "You can only edit your own creators.");
      return {
        creator: row
      };
    });
  },
  // Manual creator (YouTube, Moj, or numbers you already have), or pasted rows.
  async "creators.add"(ctx) {
    const { companyId } = await requireCompany(ctx);
    const list = Array.isArray(ctx.body.rows) ? ctx.body.rows : [
      ctx.body.creator ?? {}
    ];
    if (list.length > 500) throw new ApiError(400, "INVALID", "Paste at most 500 rows at a time.");
    const manual = ctx.body.manual === true;
    const saved = [];
    await asUser(ctx.claims, async (tx) => {
      for (const c of list) {
        let name = str(c?.name, 120);
        const linkHandle = /instagram\.com\//i.test(String(c?.link ?? "")) ? cleanHandle_(c.link) : "";
        if (/instagram\.com\//i.test(name) || name.startsWith("@")) name = cleanHandle_(name);
        if (!name && linkHandle) name = linkHandle;
        if (!name) continue;
        const handleLike = HANDLE.test(name.toLowerCase());
        let platform = PLATFORMS.includes(c?.platform) ? c.platform : linkHandle || handleLike ? "Instagram" : "Other";
        const ig = !manual && platform === "Instagram" && (linkHandle || handleLike);
        if (ig) name = name.toLowerCase();
        const set = {
          ...clean(c ?? {}, {
            ...EDITABLE,
            ...MANUAL_NUMBERS
          }),
          platform
        };
        for (const k of Object.keys(set)) if (set[k] === null) delete set[k];
        if (!set.link && platform === "Instagram" && handleLike) set.link = `https://www.instagram.com/${name}/`;
        set.source = ig ? "Instagram API" : "Manual";
        set.status = ig ? "Added. Use Refresh to fetch live numbers from Instagram." : "Entered manually";
        const [ex] = await tx`select id from public.creators where company_id = ${companyId} and owner_id = ${ctx.claims.sub} and lower(name) = ${name.toLowerCase()}`;
        const [row] = ex ? await tx`update public.creators set ${tx(set)} where id = ${ex.id} returning *` : await tx`insert into public.creators ${tx({
          ...set,
          company_id: companyId,
          owner_id: ctx.claims.sub,
          name
        })} returning *`;
        saved.push(row);
      }
    });
    return {
      creators: saved,
      added: saved.length
    };
  },
  async "creators.remove"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      active: false
    });
    const ids = (Array.isArray(ctx.body.ids) ? ctx.body.ids : [
      ctx.body.id
    ]).map((x) => uuid(x));
    const gone = await asUser(ctx.claims, (tx) => tx`delete from public.creators where company_id = ${companyId} and id = any(${ids}) returning id`);
    return {
      removed: gone.length
    };
  },
  // Remove all of MY creators (never other people's).
  async "creators.clear"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      active: false
    });
    const gone = await asUser(ctx.claims, (tx) => tx`delete from public.creators where company_id = ${companyId} and owner_id = ${ctx.claims.sub} returning id`);
    return {
      removed: gone.length
    };
  },
  async "settings.save"(ctx) {
    const { companyId } = await requireCompany(ctx);
    const s = ctx.body.settings ?? {};
    const date = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null;
    const row = {
      company_id: companyId,
      owner_id: ctx.claims.sub,
      name: str(s.name, 120) || null,
      budget: numOrNull(s.budget),
      start_date: date(s.start),
      end_date: date(s.end),
      competitors: str(s.competitors, 4e3) || null
    };
    const [saved] = await asUser(ctx.claims, (tx) => tx`
      insert into public.campaign_settings ${tx(row)}
      on conflict (company_id, owner_id) do update set name = excluded.name, budget = excluded.budget,
        start_date = excluded.start_date, end_date = excluded.end_date, competitors = excluded.competitors
      returning *`);
    return {
      settings: saved
    };
  },
  // Campaign post: Instagram link -> numbers fetched; anything else -> numbers typed.
  async "posts.add"(ctx) {
    const { companyId } = await requireCompany(ctx);
    const p = ctx.body.post ?? {};
    const platform = PLATFORMS.includes(p.platform) ? p.platform : "Instagram";
    const code = shortcode_(p.link);
    const isIg = !!code && platform.startsWith("Instagram") && platform !== "Instagram Story";
    const handle2 = isIg ? cleanHandle_(p.handle) : str(p.handle, 120);
    if (!handle2) throw new ApiError(400, "INVALID", "Add the creator's name or Instagram handle.");
    if (isIg && !HANDLE.test(handle2)) throw new ApiError(400, "INVALID", "That is not an Instagram handle.");
    if (!isIg && numOrNull(p.views) == null) throw new ApiError(400, "INVALID", "For posts without an Instagram post link, type the views yourself.");
    let found = null, status = "Entered manually", pv = null;
    if (isIg) {
      const res = await fetchCreators(companyId, [
        handle2
      ], POSTS_TO_SEARCH);
      await logUsage(companyId, ctx.claims.sub, res);
      const r = res.get(handle2);
      if (r.bd) {
        found = matchPost_(r.bd.media?.data ?? [], code);
        if (found) pv = postViews_(found, r.bd);
        status = found ? pv?.est ? "\u2713 Likes and comments from Instagram. Views estimated (Instagram doesn't share views for photo posts)." : "\u2713 Numbers fetched from Instagram" : `Post not found in the creator's last ${POSTS_TO_SEARCH} posts. Type the numbers yourself.`;
      } else status = "\u2717 " + r.error;
    }
    const row = {
      company_id: companyId,
      owner_id: ctx.claims.sub,
      post_code: code || "M" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      handle: handle2,
      platform,
      status,
      link: found?.permalink ?? (code ? `https://www.instagram.com/p/${code}/` : str(p.link, 500) || null),
      fee: numOrNull(p.fee),
      views: found ? numOrNull(p.views) ?? nn(pv?.views) : numOrNull(p.views),
      likes: found ? nn(found.like_count) : numOrNull(p.likes),
      comments: found ? nn(found.comments_count) : numOrNull(p.comments),
      media_type: found ? found.media_product_type || found.media_type || null : null,
      posted_at: found?.timestamp ? new Date(found.timestamp) : null
    };
    const [saved] = await asUser(ctx.claims, (tx) => tx`
      insert into public.campaign_posts ${tx(row)}
      on conflict (company_id, owner_id, post_code) do update set
        handle = excluded.handle, platform = excluded.platform, status = excluded.status, link = excluded.link,
        fee = coalesce(excluded.fee, public.campaign_posts.fee), views = coalesce(excluded.views, public.campaign_posts.views),
        likes = coalesce(excluded.likes, public.campaign_posts.likes), comments = coalesce(excluded.comments, public.campaign_posts.comments),
        media_type = coalesce(excluded.media_type, public.campaign_posts.media_type), posted_at = coalesce(excluded.posted_at, public.campaign_posts.posted_at)
      returning *`);
    return {
      post: saved,
      status
    };
  },
  async "posts.update"(ctx) {
    const { companyId } = await requireCompany(ctx);
    const id = uuid(ctx.body.id);
    const set = clean(ctx.body.fields ?? {}, {
      fee: "num",
      views: "num",
      likes: "num",
      comments: "num"
    });
    if (!Object.keys(set).length) throw new ApiError(400, "INVALID", "Nothing to save.");
    const [row] = await asUser(ctx.claims, (tx) => tx`update public.campaign_posts set ${tx(set)} where id = ${id} and company_id = ${companyId} returning *`);
    if (!row) throw new ApiError(404, "NOT_FOUND", "Post not found.");
    return {
      post: row
    };
  },
  async "posts.remove"(ctx) {
    const { companyId } = await requireCompany(ctx, {
      active: false
    });
    const id = uuid(ctx.body.id);
    const gone = await asUser(ctx.claims, (tx) => tx`delete from public.campaign_posts where id = ${id} and company_id = ${companyId} returning id`);
    return {
      removed: gone.length
    };
  },
  // Refresh numbers of this person's Instagram campaign posts (one lookup per creator).
  async "posts.refresh"(ctx) {
    const { companyId } = await requireCompany(ctx);
    const posts = await asUser(ctx.claims, (tx) => tx`
      select * from public.campaign_posts where company_id = ${companyId} and owner_id = ${ctx.claims.sub}
        and platform like 'Instagram%' and platform <> 'Instagram Story'`);
    const ig = posts.filter((p) => shortcode_(p.link) && HANDLE.test(p.handle));
    const handles = [
      ...new Set(ig.map((p) => p.handle))
    ].slice(0, MAX_PER_CALL);
    const res = await fetchCreators(companyId, handles, POSTS_TO_SEARCH);
    await logUsage(companyId, ctx.claims.sub, res);
    const errors = [];
    await asUser(ctx.claims, async (tx) => {
      for (const p of ig) {
        const r = res.get(p.handle);
        if (!r) continue;
        if (!r.bd) {
          await tx`update public.campaign_posts set status = ${"\u2717 " + r.error} where id = ${p.id}`;
          errors.push(`${p.handle}: ${r.error}`);
          continue;
        }
        const m = matchPost_(r.bd.media?.data ?? [], shortcode_(p.link));
        if (!m) {
          await tx`update public.campaign_posts set status = ${`Post not found in the last ${POSTS_TO_SEARCH} posts. Numbers kept as they were.`} where id = ${p.id}`;
          continue;
        }
        const pv = postViews_(m, r.bd);
        const keepTyped = pv.est && p.views != null && !String(p.status ?? "").includes("estimated");
        const views = keepTyped ? p.views : nn(pv.views);
        await tx`update public.campaign_posts set views = ${views}, likes = ${nn(m.like_count)}, comments = ${nn(m.comments_count)},
                 status = ${pv.est && !keepTyped ? "\u2713 Likes and comments from Instagram. Views estimated (Instagram doesn't share views for photo posts)." : "\u2713 Numbers fetched from Instagram"}
                 where id = ${p.id}`;
      }
    });
    return {
      refreshed: ig.length,
      errors
    };
  }
};

// functions/api/handler.ts
var ACTIONS = {
  ...accountActions,
  ...workActions
};
async function handle(req) {
  if (req.method === "OPTIONS") return json(req, {
    ok: true
  });
  try {
    if (req.method !== "POST") throw new ApiError(405, "METHOD", "Use POST.");
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > 1e6) throw new ApiError(413, "TOO_BIG", "Request is too large.");
    const claims = await verifyRequest(req);
    let body;
    try {
      body = await req.json();
    } catch {
      throw new ApiError(400, "INVALID", "Send JSON.");
    }
    const name = String(body?.action ?? "");
    const fn = Object.prototype.hasOwnProperty.call(ACTIONS, name) ? ACTIONS[name] : void 0;
    if (!fn) throw new ApiError(404, "UNKNOWN_ACTION", `Unknown action: ${name.slice(0, 60)}`);
    const data = await fn({
      claims,
      body,
      req
    });
    return json(req, {
      ok: true,
      data
    });
  } catch (e) {
    return errorResponse(req, e);
  }
}

// functions/api/index.ts
Deno.serve(handle);
