// Checks the Supabase sign-in token sent by the website (Google sign-in through Supabase Auth).
// Works with both Supabase signing modes: the new asymmetric keys (JWKS) and the legacy shared secret.
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "npm:jose@5.9.6";
import { ApiError, env } from "./http.ts";

export type Claims = { sub: string; email: string; role: "authenticated" };

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function verifyRequest(req: Request): Promise<Claims> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "AUTH", "Please sign in.");
  let payload: JWTPayload;
  try {
    const secret = Deno.env.get("JWT_SECRET");
    const supabaseUrl = env("SUPABASE_URL");
    const opts = { issuer: `${supabaseUrl}/auth/v1`, audience: "authenticated" };
    if (secret) {
      ({ payload } = await jwtVerify(token, new TextEncoder().encode(secret), { ...opts, algorithms: ["HS256"] }));
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
  return { sub: payload.sub, email: String(payload.email).toLowerCase(), role: "authenticated" };
}
