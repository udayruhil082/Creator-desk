// Responses, CORS and error handling shared by every function.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name);
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new ApiError(500, "CONFIG", `Server setting ${name} is missing.`);
  }
  return v;
}

function allowedOrigins(): string[] {
  return env("ALLOWED_ORIGINS", "https://mycreatordesk.co.in,https://www.mycreatordesk.co.in")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ok = allowedOrigins().includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowedOrigins()[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Database rules raise "CODE: message" (see the migration). Turn them into clean API errors.
const DB_CODES: Record<string, number> = {
  FORBIDDEN: 403, AUTH: 401, NOT_FOUND: 404, INACTIVE: 402, SEAT_LIMIT: 409, IG_LIMIT: 409, EXISTS: 409,
  EXPIRED: 410, OWNER: 409, LAST_ADMIN: 409, OWNERSHIP: 409, LIMIT: 409, PLAN: 400,
};

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const err = e as { message?: string; code?: string; constraint_name?: string };
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

export function errorResponse(req: Request, e: unknown): Response {
  const a = toApiError(e);
  return json(req, { ok: false, error: { code: a.code, message: a.message } }, a.status);
}

// Small input helpers
export function str(v: unknown, max = 500): string {
  return String(v ?? "").trim().slice(0, max);
}
export function uuid(v: unknown, name = "id"): string {
  const s = String(v ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    throw new ApiError(400, "INVALID", `${name} is not valid.`);
  }
  return s.toLowerCase();
}
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
