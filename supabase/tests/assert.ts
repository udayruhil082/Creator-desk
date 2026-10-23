// Tiny assertion helpers (no network needed for tests).
export function assert(c: unknown, msg = "assertion failed"): asserts c { if (!c) throw new Error(msg); }
export function assertEquals(a: unknown, b: unknown, msg = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg} expected ${y}, got ${x}`);
}
export async function assertRejects(fn: () => Promise<unknown>, _cls: unknown, text: string) {
  try { await fn(); } catch (e) {
    const m = String((e as Error)?.message ?? e);
    if (!m.includes(text)) throw new Error(`expected error containing "${text}", got: ${m}`);
    return;
  }
  throw new Error(`expected an error containing "${text}", but it succeeded`);
}
