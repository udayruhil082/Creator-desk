// Razorpay webhook (events: payment.captured, order.paid, payment.failed).
// Razorpay signs every call; anything without a valid signature is refused.
// Marking a payment as paid is idempotent, so retries and the website's own check never double count.
import { asServer } from "../_shared/db.ts";
import { webhookSignatureOk } from "../_shared/razorpay.ts";

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") return res(405, { ok: false });
  const raw = await req.text();
  if (raw.length > 500_000) return res(413, { ok: false });
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!(await webhookSignatureOk(raw, sig))) return res(400, { ok: false, error: "bad signature" });
  let evt: any;
  try { evt = JSON.parse(raw); } catch { return res(400, { ok: false }); }
  const type = String(evt?.event ?? "");
  const payment = evt?.payload?.payment?.entity ?? {};
  const orderId = String(evt?.payload?.order?.entity?.id ?? payment.order_id ?? "");
  if (!orderId) return res(200, { ok: true, ignored: type });
  try {
    if (type === "payment.captured" || type === "order.paid") {
      const result = await asServer(async (tx) => {
        const [pay] = await tx`select amount_paise, currency from public.payments where razorpay_order_id = ${orderId}`;
        if (!pay) return "unknown_order";
        if (Number(payment.amount) !== pay.amount_paise || String(payment.currency ?? "INR") !== pay.currency) return "amount_mismatch";
        const [r] = await tx`select public.mark_payment_paid(${orderId}, ${String(payment.id)}, ${tx.json({ event: type, method: payment.method ?? null })}) as r`;
        return r.r;
      });
      if (result === "amount_mismatch") console.error("razorpay amount mismatch", orderId);
      return res(200, { ok: true, result });
    }
    if (type === "payment.failed") {
      await asServer((tx) => tx`update public.payments set status = 'failed', raw = ${tx.json({ event: type, reason: payment.error_description ?? null })}
                                where razorpay_order_id = ${orderId} and status = 'created'`);
      return res(200, { ok: true, result: "failed" });
    }
    return res(200, { ok: true, ignored: type });
  } catch (e) {
    console.error("webhook error", e);
    return res(500, { ok: false }); // Razorpay retries later
  }
}
