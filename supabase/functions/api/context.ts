import type { Claims } from "../_shared/auth.ts";
import { asUser } from "../_shared/db.ts";
import { ApiError, uuid } from "../_shared/http.ts";

export type Ctx = { claims: Claims; body: Record<string, any>; req: Request };

export type Access = { member: boolean; admin: boolean; active: boolean };

export async function access(claims: Claims, companyId: string): Promise<Access> {
  const [r] = await asUser(claims, (tx) => tx`
    select public.is_company_member(${companyId}) as member,
           public.is_company_admin(${companyId}) as admin,
           public.company_is_active(${companyId}) as active`);
  return { member: !!r.member, admin: !!r.admin, active: !!r.active };
}

// Member of an active company (or admin, when asked). Returns the company id.
export async function requireCompany(ctx: Ctx, opts: { admin?: boolean; active?: boolean } = {}): Promise<{ companyId: string; a: Access }> {
  const companyId = uuid(ctx.body.companyId, "companyId");
  const a = await access(ctx.claims, companyId);
  if (!a.member) throw new ApiError(403, "FORBIDDEN", "You are not a member of this company.");
  if (opts.admin && !a.admin) throw new ApiError(403, "FORBIDDEN", "Only company admins can do this.");
  if (opts.active !== false && !a.active) {
    throw new ApiError(402, "INACTIVE", "This company's plan is not active. The company admin can check Billing.");
  }
  return { companyId, a };
}
