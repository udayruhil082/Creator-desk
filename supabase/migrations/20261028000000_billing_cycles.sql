-- Four billing periods (monthly, quarterly, half-yearly, yearly) with the same features; Enterprise removed.

alter table public.plans
  add column price_quarterly_paise   integer check (price_quarterly_paise is null or price_quarterly_paise > 0),
  add column price_half_yearly_paise integer check (price_half_yearly_paise is null or price_half_yearly_paise > 0);

update public.plans set price_quarterly_paise = 1399900, price_half_yearly_paise = 2699900 where id = 'starter';
update public.plans set price_quarterly_paise = 2799900, price_half_yearly_paise = 5399900 where id = 'growth';

-- Enterprise is no longer offered. Remove it unless a company or payment already uses it; then just hide it.
delete from public.plans p where p.id = 'enterprise'
  and not exists (select 1 from public.companies c where c.plan_id = p.id)
  and not exists (select 1 from public.payments x where x.plan_id = p.id);
update public.plans set is_public = false where id = 'enterprise';

alter table public.companies drop constraint if exists companies_billing_cycle_check;
alter table public.companies add constraint companies_billing_cycle_check
  check (billing_cycle in ('monthly', 'quarterly', 'half_yearly', 'yearly'));
alter table public.payments drop constraint if exists payments_billing_cycle_check;
alter table public.payments add constraint payments_billing_cycle_check
  check (billing_cycle in ('monthly', 'quarterly', 'half_yearly', 'yearly'));

-- Length of one paid period.
create or replace function public.cycle_interval(p_cycle text) returns interval
language sql immutable set search_path = public as $$
  select case p_cycle when 'yearly' then interval '1 year' when 'half_yearly' then interval '6 months'
                      when 'quarterly' then interval '3 months' else interval '1 month' end;
$$;

-- Price of a plan for a billing period (null when not sold for that period).
create or replace function public.plan_price(pl public.plans, p_cycle text) returns integer
language sql immutable set search_path = public as $$
  select case p_cycle when 'yearly' then pl.price_yearly_paise when 'half_yearly' then pl.price_half_yearly_paise
                      when 'quarterly' then pl.price_quarterly_paise else pl.price_monthly_paise end;
$$;

create or replace function public.approve_company(p_company uuid, p_plan text default null, p_cycle text default null,
  p_seat_limit int default null, p_ig_limit int default null) returns void
language plpgsql security definer set search_path = public as $$
declare c public.companies; pl public.plans; cyc text;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN: platform owners only.' using errcode = 'P0001'; end if;
  select * into c from public.companies where id = p_company for update;
  if c.id is null then raise exception 'NOT_FOUND: company not found.' using errcode = 'P0001'; end if;
  select * into pl from public.plans where id = coalesce(p_plan, c.plan_id);
  if pl.id is null then raise exception 'PLAN: choose a plan for this company.' using errcode = 'P0001'; end if;
  cyc := coalesce(p_cycle, c.billing_cycle, 'monthly');
  if cyc not in ('monthly', 'quarterly', 'half_yearly', 'yearly') then
    raise exception 'PLAN: billing period must be monthly, quarterly, half-yearly or yearly.' using errcode = 'P0001';
  end if;
  update public.companies set
    plan_id = pl.id, billing_cycle = cyc, status = 'active',
    seat_limit = coalesce(p_seat_limit, pl.seat_limit),
    ig_account_limit = coalesce(p_ig_limit, pl.ig_account_limit),
    current_period_end = greatest(coalesce(current_period_end, now()), now()) + public.cycle_interval(cyc),
    approved_at = now(), approved_by = auth.uid(), status_note = null
  where id = p_company;
  perform public.write_audit(p_company, 'platform.approved', jsonb_build_object('plan', pl.id, 'cycle', cyc,
    'seats', coalesce(p_seat_limit, pl.seat_limit), 'ig', coalesce(p_ig_limit, pl.ig_account_limit)));
end $$;

create or replace function public.mark_payment_paid(p_order text, p_payment text, p_raw jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare pay public.payments; c public.companies;
begin
  select * into pay from public.payments where razorpay_order_id = p_order for update;
  if pay.id is null then raise exception 'NOT_FOUND: unknown order.' using errcode = 'P0001'; end if;
  if pay.status = 'paid' then return 'already_paid'; end if;
  update public.payments set status = 'paid', razorpay_payment_id = p_payment, paid_at = now(), raw = coalesce(p_raw, raw)
  where id = pay.id;
  select * into c from public.companies where id = pay.company_id for update;
  if c.status = 'active' and c.plan_id = pay.plan_id then
    update public.companies set
      billing_cycle = pay.billing_cycle,
      current_period_end = greatest(coalesce(current_period_end, now()), now()) + public.cycle_interval(pay.billing_cycle)
    where id = c.id;
    insert into public.audit_log (company_id, actor_id, action, details)
      values (c.id, pay.created_by, 'billing.renewed', jsonb_build_object('order', p_order, 'amount_paise', pay.amount_paise));
    return 'renewed';
  end if;
  update public.companies set plan_id = pay.plan_id, billing_cycle = pay.billing_cycle,
    status = case when status in ('pending_payment', 'cancelled') then 'pending_approval'::public.company_status else status end
  where id = c.id;
  insert into public.audit_log (company_id, actor_id, action, details)
    values (c.id, pay.created_by, 'billing.paid', jsonb_build_object('order', p_order, 'plan', pay.plan_id, 'amount_paise', pay.amount_paise));
  return 'awaiting_approval';
end $$;

-- Same access as before: approve_company for signed-in users (it checks platform owner itself),
-- mark_payment_paid and the helpers for the server only.
revoke execute on function public.cycle_interval(text), public.plan_price(public.plans, text) from public, anon, authenticated;
revoke execute on function public.mark_payment_paid(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.approve_company(uuid, text, text, int, int) from public, anon;
grant execute on function public.approve_company(uuid, text, text, int, int) to authenticated;
