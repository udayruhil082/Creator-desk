-- =====================================================================
-- My Creator Desk: multi-company backend
--
-- Security model
--   * Every business table has company_id. Row Level Security (RLS) is on for
--     every table, and nothing is readable or writable unless a policy allows it.
--   * Company members see only their own company. Members see their own
--     creators, posts and campaign; company admins see everyone's in that company.
--   * The platform owner (you) manages companies, plans and approvals, but cannot
--     read any company's creators, posts or campaigns.
--   * Instagram tokens live in a table with no policies at all (server only), and
--     are encrypted by the server before they are stored.
--   * Seat and Instagram-account limits are enforced by the database itself,
--     so no request can go over the plan, whatever the website sends.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.company_status as enum
  ('pending_payment', 'pending_approval', 'active', 'suspended', 'cancelled');
create type public.member_role as enum ('admin', 'member');

-- ---------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

-- Platform owners (you). Matched by Google email after sign-in.
create table public.platform_admins (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
insert into public.platform_admins (email) values
  ('udayruhil.82@gmail.com'),
  ('vanshikajuyal06@gmail.com');

-- ---------------------------------------------------------------------
-- Plans (prices in paise: ₹4,999 = 499900)
-- ---------------------------------------------------------------------
create table public.plans (
  id                  text primary key,
  name                text not null,
  description         text not null default '',
  price_monthly_paise integer check (price_monthly_paise is null or price_monthly_paise > 0),
  price_yearly_paise  integer check (price_yearly_paise is null or price_yearly_paise > 0),
  ig_account_limit    integer not null check (ig_account_limit >= 0),
  seat_limit          integer not null check (seat_limit >= 1),
  self_checkout       boolean not null default true,  -- false = "contact us" (Enterprise)
  is_public           boolean not null default true,
  sort                integer not null default 0
);
insert into public.plans (id, name, description, price_monthly_paise, price_yearly_paise, ig_account_limit, seat_limit, self_checkout, sort) values
  ('starter',    'Starter',    '1 Instagram account, up to 5 team members',  499900,  4999000,  1,  5, true,  1),
  ('growth',     'Growth',     '3 Instagram accounts, up to 15 team members', 999900,  9999000,  3, 15, true,  2),
  ('enterprise', 'Enterprise', 'Custom accounts, members and support',        null,    null,     10, 50, false, 3);

-- ---------------------------------------------------------------------
-- Companies and members
-- ---------------------------------------------------------------------
create table public.companies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(btrim(name)) between 2 and 120),
  legal_name         text check (legal_name is null or char_length(legal_name) <= 200),
  gstin              text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  phone              text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  owner_id           uuid not null references public.profiles (id),
  plan_id            text references public.plans (id),
  billing_cycle      text check (billing_cycle in ('monthly', 'yearly')),
  status             public.company_status not null default 'pending_payment',
  ig_account_limit   integer not null default 0 check (ig_account_limit >= 0),
  seat_limit         integer not null default 1 check (seat_limit >= 1),
  current_period_end timestamptz,
  approved_at        timestamptz,
  approved_by        uuid references public.profiles (id),
  status_note        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index companies_owner_idx on public.companies (owner_id);
create index companies_status_idx on public.companies (status);

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null default 'member',
  added_by   uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_idx on public.company_members (user_id);

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  email       text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role        public.member_role not null default 'member',
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by  uuid references public.profiles (id),
  accepted_by uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz
);
create unique index invitations_one_pending on public.invitations (company_id, email) where status = 'pending';
create index invitations_email_idx on public.invitations (email) where status = 'pending';

-- ---------------------------------------------------------------------
-- Instagram connections (each one is the company's own account)
-- ---------------------------------------------------------------------
create table public.ig_connections (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  ig_user_id       text not null,
  username         text,
  page_id          text,
  page_name        text,
  status           text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  connected_by     uuid references public.profiles (id),
  last_checked_at  timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index ig_connections_company_idx on public.ig_connections (company_id);
-- One real Instagram account can be active in only one company at a time.
create unique index ig_connections_one_active on public.ig_connections (ig_user_id) where status = 'active';

-- Encrypted tokens. RLS on with no policies: only the server can read this.
create table public.ig_connection_secrets (
  connection_id    uuid primary key references public.ig_connections (id) on delete cascade,
  token_ciphertext text not null,
  updated_at       timestamptz not null default now()
);

-- Safe hourly budget per connection (kept under Meta's limit).
create table public.ig_budget (
  connection_id uuid not null references public.ig_connections (id) on delete cascade,
  hour_start    timestamptz not null,
  used          integer not null default 0,
  primary key (connection_id, hour_start)
);

-- ---------------------------------------------------------------------
-- Billing (Razorpay)
-- ---------------------------------------------------------------------
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  plan_id             text not null references public.plans (id),
  billing_cycle       text not null check (billing_cycle in ('monthly', 'yearly')),
  amount_paise        integer not null check (amount_paise > 0),
  currency            text not null default 'INR',
  razorpay_order_id   text not null unique,
  razorpay_payment_id text unique,
  status              text not null default 'created' check (status in ('created', 'paid', 'failed')),
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  raw                 jsonb
);
create index payments_company_idx on public.payments (company_id, created_at desc);

-- ---------------------------------------------------------------------
-- Work data (owned by one member inside one company)
-- ---------------------------------------------------------------------
create table public.creators (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  platform        text not null default 'Instagram',
  source          text not null default 'Instagram API' check (source in ('Instagram API', 'Manual')),
  category        text, language text, link text, yt_link text,
  followers       bigint, views numeric, reach numeric, likes numeric, comments numeric, posts integer,
  sentiment       text, deliverables text,
  collab_price    numeric, ad_rights_price numeric, fee numeric,
  quality         text, quality_score integer, quality_why text,
  organic_er      numeric, sponsored_er numeric, sponsored_lift text, boosted text,
  best_format     text, content_mix text,
  competitors     text, collabs text,
  status          text,
  fetched_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index creators_unique_name on public.creators (company_id, owner_id, lower(name));
create index creators_company_idx on public.creators (company_id);

create table public.campaign_posts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  post_code   text not null,
  handle      text not null,
  link        text,
  platform    text not null default 'Instagram',
  fee         numeric, views numeric, likes numeric, comments numeric,
  media_type  text,
  posted_at   timestamptz,
  status      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index campaign_posts_unique on public.campaign_posts (company_id, owner_id, post_code);

create table public.campaign_settings (
  company_id  uuid not null references public.companies (id) on delete cascade,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text, budget numeric, start_date date, end_date date, competitors text,
  updated_at  timestamptz not null default now(),
  primary key (company_id, owner_id)
);

-- ---------------------------------------------------------------------
-- Usage, cache, audit
-- ---------------------------------------------------------------------
create table public.lookup_usage (
  id            bigserial primary key,
  company_id    uuid not null references public.companies (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  connection_id uuid references public.ig_connections (id) on delete set null,
  handle        text not null,
  cached        boolean not null default false,
  ok            boolean not null default true,
  error         text,
  created_at    timestamptz not null default now()
);
create index lookup_usage_company_idx on public.lookup_usage (company_id, created_at desc);
create index lookup_usage_user_idx on public.lookup_usage (user_id, created_at desc);

-- Instagram answers kept for 6 hours, per company (never shared between companies).
create table public.bd_cache (
  company_id uuid not null references public.companies (id) on delete cascade,
  handle     text not null,
  data       jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (company_id, handle)
);

create table public.audit_log (
  id         bigserial primary key,
  company_id uuid references public.companies (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_company_idx on public.audit_log (company_id, created_at desc);

-- =====================================================================
-- Helper functions (security definer: they read membership without
-- being blocked by RLS, and only ever answer about the caller)
-- =====================================================================
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.platform_admins a on a.email = lower(p.email)
    where p.id = auth.uid()
  );
$$;

create or replace function public.company_role(cid uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.company_members where company_id = cid and user_id = auth.uid();
$$;

create or replace function public.is_company_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.company_members where company_id = cid and user_id = auth.uid());
$$;

create or replace function public.is_company_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.company_members where company_id = cid and user_id = auth.uid() and role = 'admin');
$$;

-- Active = approved, not suspended, and the paid period has not ended.
create or replace function public.company_is_active(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies
    where id = cid and status = 'active' and (current_period_end is null or current_period_end > now())
  );
$$;

create or replace function public.can_work_in(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_company_member(cid) and public.company_is_active(cid);
$$;

create or replace function public.shares_company_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members a
    join public.company_members b on a.company_id = b.company_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create or replace function public.write_audit(cid uuid, act text, det jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (company_id, actor_id, action, details) values (cid, auth.uid(), act, coalesce(det, '{}'::jsonb));
$$;

-- =====================================================================
-- Triggers
-- =====================================================================
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger companies_touch before update on public.companies for each row execute function public.touch_updated_at();
create trigger ig_connections_touch before update on public.ig_connections for each row execute function public.touch_updated_at();
create trigger creators_touch before update on public.creators for each row execute function public.touch_updated_at();
create trigger campaign_posts_touch before update on public.campaign_posts for each row execute function public.touch_updated_at();
create trigger campaign_settings_touch before update on public.campaign_settings for each row execute function public.touch_updated_at();

-- New Google sign-in -> profile row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, lower(new.email),
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
          new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
create trigger on_auth_user_created after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

-- Seats: members + pending invitations may never go over the plan.
create or replace function public.enforce_seat_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; used int;
begin
  select seat_limit into lim from public.companies where id = new.company_id for update;
  if tg_table_name = 'company_members' then
    select count(*) into used from public.company_members where company_id = new.company_id;
    -- the person accepting an invitation already holds a seat through that invitation
    select used + count(*) into used from public.invitations i
      join public.profiles p on p.id = new.user_id
      where i.company_id = new.company_id and i.status = 'pending' and i.email <> p.email;
  else
    if new.status <> 'pending' then return new; end if;
    select count(*) into used from public.company_members where company_id = new.company_id;
    select used + count(*) into used from public.invitations where company_id = new.company_id and status = 'pending';
  end if;
  if used >= lim then
    raise exception 'SEAT_LIMIT: this plan allows % team members. Upgrade the plan or remove someone first.', lim
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger company_members_seat_limit before insert on public.company_members
  for each row execute function public.enforce_seat_limit();
create trigger invitations_seat_limit before insert on public.invitations
  for each row execute function public.enforce_seat_limit();

-- Instagram accounts: active connections may never go over the plan.
create or replace function public.enforce_ig_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; used int;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  select ig_account_limit into lim from public.companies where id = new.company_id for update;
  select count(*) into used from public.ig_connections where company_id = new.company_id and status = 'active' and id <> new.id;
  if used >= lim then
    raise exception 'IG_LIMIT: this plan allows % Instagram account(s). Upgrade the plan or disconnect one first.', lim
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger ig_connections_limit before insert or update of status on public.ig_connections
  for each row execute function public.enforce_ig_limit();

-- The company owner always stays an admin, and a company always keeps an admin.
create or replace function public.protect_admins() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; admins int;
begin
  select owner_id into owner from public.companies where id = old.company_id;
  if owner is null then return coalesce(new, old); end if;  -- company is being deleted
  if old.user_id = owner and (tg_op = 'DELETE' or new.role <> 'admin') then
    raise exception 'OWNER: the company owner cannot be removed or made a member.' using errcode = 'P0001';
  end if;
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    select count(*) into admins from public.company_members where company_id = old.company_id and role = 'admin' and user_id <> old.user_id;
    if admins = 0 then raise exception 'LAST_ADMIN: a company needs at least one admin.' using errcode = 'P0001'; end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger company_members_protect before update or delete on public.company_members
  for each row execute function public.protect_admins();

-- Rows can never be moved to another company or another owner.
create or replace function public.lock_ownership() returns trigger
language plpgsql as $$
begin
  if new.company_id <> old.company_id or new.owner_id <> old.owner_id then
    raise exception 'OWNERSHIP: company and owner of a row cannot be changed.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger creators_lock before update on public.creators for each row execute function public.lock_ownership();
create trigger campaign_posts_lock before update on public.campaign_posts for each row execute function public.lock_ownership();
create trigger campaign_settings_lock before update on public.campaign_settings for each row execute function public.lock_ownership();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles              enable row level security;
alter table public.platform_admins       enable row level security;
alter table public.plans                 enable row level security;
alter table public.companies             enable row level security;
alter table public.company_members       enable row level security;
alter table public.invitations           enable row level security;
alter table public.ig_connections        enable row level security;
alter table public.ig_connection_secrets enable row level security;
alter table public.ig_budget             enable row level security;
alter table public.payments              enable row level security;
alter table public.creators              enable row level security;
alter table public.campaign_posts        enable row level security;
alter table public.campaign_settings     enable row level security;
alter table public.lookup_usage          enable row level security;
alter table public.bd_cache              enable row level security;
alter table public.audit_log             enable row level security;

-- Start from nothing, then grant only what the website needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- profiles
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_company_with(id) or public.is_platform_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- plans: public price list
grant select on public.plans to anon, authenticated;
create policy plans_read on public.plans for select to anon, authenticated using (is_public);

-- companies: members read; admins edit the profile fields only
grant select on public.companies to authenticated;
grant update (name, legal_name, gstin, phone) on public.companies to authenticated;
create policy companies_read on public.companies for select to authenticated
  using (public.is_company_member(id) or public.is_platform_admin());
create policy companies_admin_edit on public.companies for update to authenticated
  using (public.is_company_admin(id)) with check (public.is_company_admin(id));

-- members: visible inside the company; changed only through the functions below
grant select on public.company_members to authenticated;
create policy members_read on public.company_members for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());

-- invitations: company admins, and the invited person
grant select on public.invitations to authenticated;
create policy invitations_read on public.invitations for select to authenticated
  using (public.is_company_admin(company_id)
         or email = (select lower(email) from public.profiles where id = auth.uid())
         or public.is_platform_admin());

-- Instagram connections: details visible to members (never the token)
grant select on public.ig_connections to authenticated;
create policy ig_read on public.ig_connections for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());

-- payments: company admins and platform owner
grant select on public.payments to authenticated;
create policy payments_read on public.payments for select to authenticated
  using (public.is_company_admin(company_id) or public.is_platform_admin());

-- work data: your own rows, or every row in your company if you are its admin.
-- The platform owner is deliberately NOT allowed here.
grant select, insert, update, delete on public.creators, public.campaign_posts, public.campaign_settings to authenticated;

create policy creators_read on public.creators for select to authenticated
  using (public.is_company_member(company_id) and (owner_id = auth.uid() or public.is_company_admin(company_id)));
create policy creators_insert on public.creators for insert to authenticated
  with check (owner_id = auth.uid() and public.can_work_in(company_id));
create policy creators_update on public.creators for update to authenticated
  using (public.can_work_in(company_id) and (owner_id = auth.uid() or public.is_company_admin(company_id)))
  with check (public.can_work_in(company_id) and (owner_id = auth.uid() or public.is_company_admin(company_id)));
create policy creators_delete on public.creators for delete to authenticated
  using (public.can_work_in(company_id) and (owner_id = auth.uid() or public.is_company_admin(company_id)));

create policy posts_read on public.campaign_posts for select to authenticated
  using (public.is_company_member(company_id) and (owner_id = auth.uid() or public.is_company_admin(company_id)));
create policy posts_insert on public.campaign_posts for insert to authenticated
  with check (owner_id = auth.uid() and public.can_work_in(company_id));
create policy posts_update on public.campaign_posts for update to authenticated
  using (public.can_work_in(company_id) and (owner_id = auth.uid() or public.is_company_admin(company_id)))
  with check (public.can_work_in(company_id) and (owner_id = auth.uid() or public.is_company_admin(company_id)));
create policy posts_delete on public.campaign_posts for delete to authenticated
  using (public.can_work_in(company_id) and (owner_id = auth.uid() or public.is_company_admin(company_id)));

create policy settings_read on public.campaign_settings for select to authenticated
  using (public.is_company_member(company_id) and (owner_id = auth.uid() or public.is_company_admin(company_id)));
create policy settings_insert on public.campaign_settings for insert to authenticated
  with check (owner_id = auth.uid() and public.can_work_in(company_id));
create policy settings_update on public.campaign_settings for update to authenticated
  using (owner_id = auth.uid() and public.can_work_in(company_id))
  with check (owner_id = auth.uid() and public.can_work_in(company_id));
create policy settings_delete on public.campaign_settings for delete to authenticated
  using (owner_id = auth.uid() and public.can_work_in(company_id));

-- usage: your own lookups, or the whole company's if you are its admin
grant select on public.lookup_usage to authenticated;
create policy usage_read on public.lookup_usage for select to authenticated
  using (user_id = auth.uid() or public.is_company_admin(company_id));

-- audit: company admins see their company's trail; platform owner sees all
grant select on public.audit_log to authenticated;
create policy audit_read on public.audit_log for select to authenticated
  using ((company_id is not null and public.is_company_admin(company_id)) or public.is_platform_admin());

-- ig_connection_secrets, ig_budget, bd_cache, platform_admins: no policies (server only).

-- =====================================================================
-- Functions the website calls (each checks who is calling)
-- =====================================================================

-- Everything the dashboard needs to start: who am I, my companies, my invites.
create or replace function public.my_context() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'is_platform_admin', public.is_platform_admin(),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'role', m.role, 'status', c.status,
        'active', public.company_is_active(c.id),
        'plan_id', c.plan_id, 'billing_cycle', c.billing_cycle,
        'seat_limit', c.seat_limit, 'ig_account_limit', c.ig_account_limit,
        'current_period_end', c.current_period_end,
        'is_owner', c.owner_id = auth.uid(),
        'members', (select count(*) from public.company_members x where x.company_id = c.id),
        'ig_accounts', (select count(*) from public.ig_connections x where x.company_id = c.id and x.status = 'active')
      ) order by c.created_at)
      from public.company_members m join public.companies c on c.id = m.company_id
      where m.user_id = auth.uid()), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'company_id', i.company_id, 'company_name', c.name,
                                          'role', i.role, 'expires_at', i.expires_at))
      from public.invitations i join public.companies c on c.id = i.company_id
      where i.status = 'pending' and i.expires_at > now()
        and i.email = (select lower(email) from public.profiles where id = auth.uid())), '[]'::jsonb)
  );
$$;

create or replace function public.create_company(p_name text, p_legal_name text default null,
  p_gstin text default null, p_phone text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; owned int;
begin
  if auth.uid() is null then raise exception 'AUTH: sign in first.' using errcode = 'P0001'; end if;
  select count(*) into owned from public.companies where owner_id = auth.uid() and status <> 'cancelled';
  if owned >= 3 then raise exception 'LIMIT: you already own 3 companies.' using errcode = 'P0001'; end if;
  insert into public.companies (name, legal_name, gstin, phone, owner_id)
  values (btrim(p_name), nullif(btrim(p_legal_name), ''), nullif(upper(btrim(p_gstin)), ''), nullif(btrim(p_phone), ''), auth.uid())
  returning id into cid;
  insert into public.company_members (company_id, user_id, role, added_by) values (cid, auth.uid(), 'admin', auth.uid());
  perform public.write_audit(cid, 'company.created', jsonb_build_object('name', p_name));
  return cid;
end $$;

create or replace function public.invite_member(p_company uuid, p_email text, p_role public.member_role default 'member')
returns uuid
language plpgsql security definer set search_path = public as $$
declare iid uuid; em text := lower(btrim(p_email));
begin
  if not public.is_company_admin(p_company) then raise exception 'FORBIDDEN: only company admins can invite.' using errcode = 'P0001'; end if;
  if not public.company_is_active(p_company) then raise exception 'INACTIVE: the company plan is not active yet.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.company_members m join public.profiles p on p.id = m.user_id
             where m.company_id = p_company and p.email = em) then
    raise exception 'EXISTS: this person is already in the team.' using errcode = 'P0001';
  end if;
  update public.invitations set status = 'revoked' where company_id = p_company and email = em and status = 'pending' and expires_at <= now();
  insert into public.invitations (company_id, email, role, invited_by) values (p_company, em, p_role, auth.uid())
  returning id into iid;
  perform public.write_audit(p_company, 'member.invited', jsonb_build_object('email', em, 'role', p_role));
  return iid;
end $$;

create or replace function public.revoke_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select company_id into cid from public.invitations where id = p_invite and status = 'pending';
  if cid is null or not public.is_company_admin(cid) then raise exception 'FORBIDDEN: invitation not found.' using errcode = 'P0001'; end if;
  update public.invitations set status = 'revoked' where id = p_invite;
  perform public.write_audit(cid, 'member.invite_revoked', jsonb_build_object('invitation', p_invite));
end $$;

create or replace function public.accept_invite(p_invite uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invitations; me text;
begin
  select lower(email) into me from public.profiles where id = auth.uid();
  select * into inv from public.invitations where id = p_invite for update;
  if inv.id is null or inv.status <> 'pending' or inv.email <> me then
    raise exception 'FORBIDDEN: invitation not found for your email.' using errcode = 'P0001';
  end if;
  if inv.expires_at <= now() then raise exception 'EXPIRED: this invitation has expired. Ask your admin for a new one.' using errcode = 'P0001'; end if;
  if not public.company_is_active(inv.company_id) then raise exception 'INACTIVE: the company plan is not active.' using errcode = 'P0001'; end if;
  insert into public.company_members (company_id, user_id, role, added_by)
  values (inv.company_id, auth.uid(), inv.role, inv.invited_by)
  on conflict (company_id, user_id) do nothing;
  update public.invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = p_invite;
  perform public.write_audit(inv.company_id, 'member.joined', jsonb_build_object('email', me, 'role', inv.role));
  return inv.company_id;
end $$;

create or replace function public.remove_member(p_company uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_company_admin(p_company) or (p_user = auth.uid() and public.is_company_member(p_company))) then
    raise exception 'FORBIDDEN: only company admins can remove members.' using errcode = 'P0001';
  end if;
  delete from public.company_members where company_id = p_company and user_id = p_user;
  perform public.write_audit(p_company, case when p_user = auth.uid() then 'member.left' else 'member.removed' end,
                             jsonb_build_object('user', p_user));
end $$;

create or replace function public.set_member_role(p_company uuid, p_user uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_company_admin(p_company) then raise exception 'FORBIDDEN: only company admins can change roles.' using errcode = 'P0001'; end if;
  update public.company_members set role = p_role where company_id = p_company and user_id = p_user;
  if not found then raise exception 'NOT_FOUND: member not found.' using errcode = 'P0001'; end if;
  perform public.write_audit(p_company, 'member.role_changed', jsonb_build_object('user', p_user, 'role', p_role));
end $$;

-- Lookups per member, for the company admin's dashboard.
create or replace function public.company_usage(p_company uuid, p_since timestamptz default now() - interval '30 days')
returns table (user_id uuid, email text, full_name text, lookups bigint, from_cache bigint, failed bigint, last_lookup timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_company_admin(p_company) then raise exception 'FORBIDDEN: only company admins can see team usage.' using errcode = 'P0001'; end if;
  return query
    select m.user_id, p.email, p.full_name,
           count(u.id) filter (where not u.cached and u.ok),
           count(u.id) filter (where u.cached),
           count(u.id) filter (where not u.ok),
           max(u.created_at)
    from public.company_members m
    join public.profiles p on p.id = m.user_id
    left join public.lookup_usage u on u.user_id = m.user_id and u.company_id = p_company and u.created_at >= p_since
    where m.company_id = p_company
    group by m.user_id, p.email, p.full_name
    order by 4 desc;
end $$;

-- Hourly capacity for each of the company's Instagram accounts.
create or replace function public.company_capacity(p_company uuid)
returns table (connection_id uuid, username text, status text, used_this_hour integer, hourly_limit integer, resets_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_company_member(p_company) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return query
    select c.id, c.username, c.status, coalesce(b.used, 0), 150, date_trunc('hour', now()) + interval '1 hour'
    from public.ig_connections c
    left join public.ig_budget b on b.connection_id = c.id and b.hour_start = date_trunc('hour', now())
    where c.company_id = p_company and c.status <> 'revoked'
    order by c.created_at;
end $$;

-- ---------------------------------------------------------------------
-- Platform owner (you)
-- ---------------------------------------------------------------------
create or replace function public.platform_companies() returns table (
  id uuid, name text, owner_email text, status public.company_status, plan_id text, billing_cycle text,
  seat_limit int, ig_account_limit int, members bigint, ig_accounts bigint, lookups_30d bigint,
  last_payment_status text, last_payment_paise int, current_period_end timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN: platform owners only.' using errcode = 'P0001'; end if;
  return query
    select c.id, c.name, p.email, c.status, c.plan_id, c.billing_cycle, c.seat_limit, c.ig_account_limit,
      (select count(*) from public.company_members m where m.company_id = c.id),
      (select count(*) from public.ig_connections g where g.company_id = c.id and g.status = 'active'),
      (select count(*) from public.lookup_usage u where u.company_id = c.id and not u.cached and u.created_at > now() - interval '30 days'),
      (select y.status from public.payments y where y.company_id = c.id order by y.created_at desc limit 1),
      (select y.amount_paise from public.payments y where y.company_id = c.id order by y.created_at desc limit 1),
      c.current_period_end, c.created_at
    from public.companies c join public.profiles p on p.id = c.owner_id
    order by case c.status when 'pending_approval' then 0 when 'active' then 1 else 2 end, c.created_at desc;
end $$;

-- Approve (or renew) a company. Limits come from the plan unless given (Enterprise).
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
  if cyc not in ('monthly', 'yearly') then raise exception 'PLAN: billing cycle must be monthly or yearly.' using errcode = 'P0001'; end if;
  update public.companies set
    plan_id = pl.id, billing_cycle = cyc, status = 'active',
    seat_limit = coalesce(p_seat_limit, pl.seat_limit),
    ig_account_limit = coalesce(p_ig_limit, pl.ig_account_limit),
    current_period_end = greatest(coalesce(current_period_end, now()), now())
                         + case cyc when 'yearly' then interval '1 year' else interval '1 month' end,
    approved_at = now(), approved_by = auth.uid(), status_note = null
  where id = p_company;
  perform public.write_audit(p_company, 'platform.approved', jsonb_build_object('plan', pl.id, 'cycle', cyc,
    'seats', coalesce(p_seat_limit, pl.seat_limit), 'ig', coalesce(p_ig_limit, pl.ig_account_limit)));
end $$;

create or replace function public.set_company_status(p_company uuid, p_status public.company_status, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN: platform owners only.' using errcode = 'P0001'; end if;
  if p_status = 'active' and not exists (select 1 from public.companies where id = p_company and plan_id is not null) then
    raise exception 'PLAN: approve the company with a plan first.' using errcode = 'P0001';
  end if;
  update public.companies set status = p_status, status_note = p_note where id = p_company;
  if not found then raise exception 'NOT_FOUND: company not found.' using errcode = 'P0001'; end if;
  perform public.write_audit(p_company, 'platform.status', jsonb_build_object('status', p_status, 'note', p_note));
end $$;

-- ---------------------------------------------------------------------
-- Server-only functions (called by the Edge Functions with the service key)
-- ---------------------------------------------------------------------

-- Reserve up to p_want lookups on a connection for this hour. Returns how many were granted.
create or replace function public.reserve_budget(p_connection uuid, p_want int, p_cap int default 150) returns int
language plpgsql security definer set search_path = public as $$
declare h timestamptz := date_trunc('hour', now()); cur int; grant_n int;
begin
  insert into public.ig_budget (connection_id, hour_start, used) values (p_connection, h, 0)
  on conflict (connection_id, hour_start) do nothing;
  select used into cur from public.ig_budget where connection_id = p_connection and hour_start = h for update;
  grant_n := greatest(0, least(p_want, p_cap - cur));
  update public.ig_budget set used = used + grant_n where connection_id = p_connection and hour_start = h;
  delete from public.ig_budget where hour_start < h - interval '2 days';
  return grant_n;
end $$;

-- Instagram said "slow down": treat this connection's hour as used up.
create or replace function public.exhaust_budget(p_connection uuid, p_cap int default 150) returns void
language sql security definer set search_path = public as $$
  insert into public.ig_budget (connection_id, hour_start, used) values (p_connection, date_trunc('hour', now()), p_cap)
  on conflict (connection_id, hour_start) do update set used = greatest(public.ig_budget.used, p_cap);
$$;

-- Payment confirmed by Razorpay: idempotent. First payment -> waits for your approval.
-- Renewal of an active company -> period extended straight away.
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
      current_period_end = greatest(coalesce(current_period_end, now()), now())
                           + case pay.billing_cycle when 'yearly' then interval '1 year' else interval '1 month' end
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

-- Who may call what. First take every function away from everyone (Supabase grants new
-- functions to anon and authenticated by default), then give back only the public ones.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
grant execute on function public.is_platform_admin(), public.company_role(uuid), public.is_company_member(uuid),
  public.is_company_admin(uuid), public.company_is_active(uuid), public.can_work_in(uuid), public.shares_company_with(uuid)
  to authenticated;
grant execute on function public.my_context(), public.create_company(text, text, text, text),
  public.invite_member(uuid, text, public.member_role), public.revoke_invite(uuid), public.accept_invite(uuid),
  public.remove_member(uuid, uuid), public.set_member_role(uuid, uuid, public.member_role),
  public.company_usage(uuid, timestamptz), public.company_capacity(uuid),
  public.platform_companies(), public.approve_company(uuid, text, text, int, int),
  public.set_company_status(uuid, public.company_status, text)
  to authenticated;
-- reserve_budget, exhaust_budget, mark_payment_paid, write_audit: server only (no grant).
