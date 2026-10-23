// Razorpay: create orders, confirm payments, check signatures.
// Docs: https://razorpay.com/docs/payments/server-integration/
import { ApiError, env } from "./http.ts";
import { hmacHex, safeEqual } from "./crypto.ts";

const API = "https://api.razorpay.com/v1";

function auth(): string {
  return "Basic " + btoa(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`);
}

async function call(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const r = await fetch(API + path, {
    ...init,
    headers: { Authorization: auth(), "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (body as { error?: { description?: string } })?.error?.description ?? `HTTP ${r.status}`;
    throw new ApiError(502, "PAYMENT", `Razorpay: ${msg}`);
  }
  return body as Record<string, unknown>;
}

export function createOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  return call("/orders", { method: "POST", body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes }) });
}

export function fetchPayment(paymentId: string) {
  return call(`/payments/${encodeURIComponent(paymentId)}`);
}

export function capturePayment(paymentId: string, amountPaise: number) {
  return call(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: "POST", body: JSON.stringify({ amount: amountPaise, currency: "INR" }),
  });
}

// Checkout success handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
export async function checkoutSignatureOk(orderId: string, paymentId: string, signature: string): Promise<boolean> {
  const expected = await hmacHex(env("RAZORPAY_KEY_SECRET"), `${orderId}|${paymentId}`);
  return safeEqual(expected, String(signature || ""));
}

// Webhook signature: HMAC_SHA256(raw request body, webhook secret)
export async function webhookSignatureOk(rawBody: string, signature: string): Promise<boolean> {
  const expected = await hmacHex(env("RAZORPAY_WEBHOOK_SECRET"), rawBody);
  return safeEqual(expected, String(signature || ""));
}

export function keyId(): string { return env("RAZORPAY_KEY_ID"); }
