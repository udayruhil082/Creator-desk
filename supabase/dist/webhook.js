// functions/_shared/db.ts
import postgres from "npm:postgres@3.4.5";

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

// functions/_shared/db.ts
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
function asServer(fn) {
  return db().begin(fn);
}

// functions/_shared/crypto.ts
var enc = new TextEncoder();
var dec = new TextDecoder();
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

// functions/_shared/razorpay.ts
async function webhookSignatureOk(rawBody, signature) {
  const expected = await hmacHex(env("RAZORPAY_WEBHOOK_SECRET"), rawBody);
  return safeEqual(expected, String(signature || ""));
}

// functions/razorpay-webhook/handler.ts
var res = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json"
  }
});
async function handleWebhook(req) {
  if (req.method !== "POST") return res(405, {
    ok: false
  });
  const raw = await req.text();
  if (raw.length > 5e5) return res(413, {
    ok: false
  });
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!await webhookSignatureOk(raw, sig)) return res(400, {
    ok: false,
    error: "bad signature"
  });
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return res(400, {
      ok: false
    });
  }
  const type = String(evt?.event ?? "");
  const payment = evt?.payload?.payment?.entity ?? {};
  const orderId = String(evt?.payload?.order?.entity?.id ?? payment.order_id ?? "");
  if (!orderId) return res(200, {
    ok: true,
    ignored: type
  });
  try {
    if (type === "payment.captured" || type === "order.paid") {
      const result = await asServer(async (tx) => {
        const [pay] = await tx`select amount_paise, currency from public.payments where razorpay_order_id = ${orderId}`;
        if (!pay) return "unknown_order";
        if (Number(payment.amount) !== pay.amount_paise || String(payment.currency ?? "INR") !== pay.currency) return "amount_mismatch";
        const [r] = await tx`select public.mark_payment_paid(${orderId}, ${String(payment.id)}, ${tx.json({
          event: type,
          method: payment.method ?? null
        })}) as r`;
        return r.r;
      });
      if (result === "amount_mismatch") console.error("razorpay amount mismatch", orderId);
      return res(200, {
        ok: true,
        result
      });
    }
    if (type === "payment.failed") {
      await asServer((tx) => tx`update public.payments set status = 'failed', raw = ${tx.json({
        event: type,
        reason: payment.error_description ?? null
      })}
                                where razorpay_order_id = ${orderId} and status = 'created'`);
      return res(200, {
        ok: true,
        result: "failed"
      });
    }
    return res(200, {
      ok: true,
      ignored: type
    });
  } catch (e) {
    console.error("webhook error", e);
    return res(500, {
      ok: false
    });
  }
}

// functions/razorpay-webhook/index.ts
Deno.serve(handleWebhook);
