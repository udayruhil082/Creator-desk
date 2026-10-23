// Database access.
//   asUser:    runs as the signed-in person ("authenticated" role + their claims), so every
//              Row Level Security rule in the migration applies, exactly as for the website.
//   asServer:  runs with full rights. Used only for server-only tables (tokens, budget, cache,
//              payments, usage) after the code has checked who is asking.
import postgres from "npm:postgres@3.4.5";
import type { Claims } from "./auth.ts";
import { env } from "./http.ts";

export type Tx = postgres.TransactionSql;

let sql: postgres.Sql | null = null;
export function db(): postgres.Sql {
  // Supabase's pooler runs in transaction mode, so prepared statements are turned off.
  sql ??= postgres(env("SUPABASE_DB_URL"), { prepare: false, max: 4, idle_timeout: 20, onnotice: () => {} });
  return sql;
}

export function asUser<T>(claims: Claims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    await tx.unsafe("set local role authenticated");
    return await fn(tx);
  }) as Promise<T>;
}

export function asServer<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(fn) as Promise<T>;
}
