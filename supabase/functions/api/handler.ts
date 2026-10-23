// One endpoint for the whole dashboard: POST { action: "creators.lookup", ...params }
// Answers { ok: true, data } or { ok: false, error: { code, message } }.
import { verifyRequest } from "../_shared/auth.ts";
import { ApiError, errorResponse, json } from "../_shared/http.ts";
import { type Ctx } from "./context.ts";
import { accountActions } from "./account.ts";
import { workActions } from "./work.ts";

type Action = (ctx: Ctx) => Promise<unknown>;
const ACTIONS: Record<string, Action> = { ...accountActions, ...workActions };

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return json(req, { ok: true });
  try {
    if (req.method !== "POST") throw new ApiError(405, "METHOD", "Use POST.");
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > 1_000_000) throw new ApiError(413, "TOO_BIG", "Request is too large.");
    const claims = await verifyRequest(req);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { throw new ApiError(400, "INVALID", "Send JSON."); }
    const name = String(body?.action ?? "");
    const fn = Object.prototype.hasOwnProperty.call(ACTIONS, name) ? ACTIONS[name] : undefined;
    if (!fn) throw new ApiError(404, "UNKNOWN_ACTION", `Unknown action: ${name.slice(0, 60)}`);
    const data = await fn({ claims, body, req });
    return json(req, { ok: true, data });
  } catch (e) {
    return errorResponse(req, e);
  }
}

export const actionNames = () => Object.keys(ACTIONS).sort();
