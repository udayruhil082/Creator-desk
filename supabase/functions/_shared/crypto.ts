// Encryption for stored Instagram tokens (AES-256-GCM) and signatures for Razorpay (HMAC-SHA256).
import { ApiError, env } from "./http.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string { let s = ""; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s); }
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s), out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let keyPromise: Promise<CryptoKey> | null = null;
function key(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const raw = unb64(env("TOKEN_ENC_KEY"));
    if (raw.length !== 32) throw new ApiError(500, "CONFIG", "TOKEN_ENC_KEY must be 32 random bytes in base64.");
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  })();
  return keyPromise;
}

// Output: "v1.<iv>.<ciphertext>" (base64). A database copy alone cannot reveal any token.
export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(plain)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decryptSecret(box: string): Promise<string> {
  const [v, iv, ct] = box.split(".");
  if (v !== "v1" || !iv || !ct) throw new ApiError(500, "SERVER", "Stored token is unreadable.");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct));
  return dec.decode(pt);
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Comparison that takes the same time whatever the input, so signatures cannot be guessed byte by byte.
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
