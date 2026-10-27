# My Creator Desk: backend (Supabase + Razorpay)

The multi-company backend: Google sign-in, companies with an admin and team members, plans and
Razorpay billing with manual approval, each company's own Instagram connections, lookups with a
safe hourly budget, and usage per member. Every company's data is kept apart by the database itself.

```
supabase/
  migrations/20261024000000_init.sql   tables, security rules, limits, database functions
  functions/api/                       the dashboard API (one endpoint, many actions)
  functions/razorpay-webhook/          Razorpay payment events
  functions/_shared/                   sign-in check, database, encryption, Instagram, Razorpay, analysis
  tests/                               security tests + end-to-end tests (run.sh)
  config.toml                          function and Google sign-in settings
```

## Live project
- Supabase project `my-creator-desk` (ref `appdoslighvkqifmlyds`, Mumbai), organization "My Creator Desk"
- API: `https://appdoslighvkqifmlyds.supabase.co/functions/v1/api`
- Webhook: `https://appdoslighvkqifmlyds.supabase.co/functions/v1/razorpay-webhook`
- Google sign-in callback: `https://appdoslighvkqifmlyds.supabase.co/auth/v1/callback`

## How it fits together

```
Website (mycreatordesk.co.in)
  │  Google sign-in through Supabase Auth  →  sign-in token (JWT)
  ▼
Edge Function "api"  ── checks the token on every call
  │   runs the person's queries AS THEM, so the database rules below always apply
  ▼
Postgres (Supabase) ── Row Level Security on every table
       └─ Instagram Graph API (the company's own connected accounts)
       └─ Razorpay (orders, payment checks)   ◄── Edge Function "razorpay-webhook"
```

### Who can do what

| | Platform owner (you) | Company admin | Member |
|---|---|---|---|
| Approve / suspend companies, set limits | ✓ | | |
| See all companies, plans, payments, usage totals | ✓ | | |
| Read a company's creators, posts, campaigns | **never** | all of their company | only their own |
| Pay for a plan, connect / disconnect Instagram | | ✓ | |
| Invite / remove members, change roles | | ✓ | |
| Lookups, shortlist, campaign posts | | ✓ | ✓ |
| Team usage dashboard | | ✓ | own only |

### Security in short
- **Company separation is enforced by the database** (Row Level Security), not by the website.
  A request for another company's rows simply returns nothing, and writes are refused.
- **Plan limits live in the database**: members + pending invites can never exceed `seat_limit`;
  active Instagram connections can never exceed `ig_account_limit`.
- **One real Instagram account can be active in only one company** at a time.
- **Instagram tokens are encrypted** (AES-256-GCM with `TOKEN_ENC_KEY`) and kept in a table the website
  cannot read at all.
- **Prices are taken from the `plans` table on the server**; the browser never sends an amount.
  Payments are confirmed by Razorpay's signature **and** by fetching the payment from Razorpay.
  Marking paid is idempotent (webhook + website check never double count).
- **Hourly budget**: at most 150 lookups per Instagram account per hour, reserved atomically; Instagram
  "slow down" answers stop that account for the hour; expired tokens are flagged for the admin.
- **Cache**: answers are reused for 6 hours, per company (never shared between companies).
- **Audit log** of company, billing, approval, Instagram and team changes.
- Expired or suspended companies become read-only (data stays, work stops).

## Plans (edit in the `plans` table)
Every plan has every feature; only the billing period changes.

| Plan | Monthly | Quarterly | Half-yearly | Yearly | Instagram accounts | Team members |
|---|---|---|---|---|---|---|
| Starter | ₹4,999 | ₹13,999 | ₹26,999 | ₹49,990 | 1 | 5 |
| Growth | ₹9,999 | ₹27,999 | ₹53,999 | ₹99,990 | 3 | 15 |

(Enterprise was removed on 28 Oct 2026. The platform owner can still raise limits for one company when approving.)

Flow: sign up → create company → choose plan → pay (Razorpay) → **you approve** → the company admin
connects Instagram and invites the team. Renewals of an active plan extend the period automatically;
a plan change waits for your approval (limits change when you approve).

## Setup (one time)

1. **Supabase project**: create one at supabase.com (region Mumbai, `ap-south-1`).
2. **Google sign-in**: Supabase → Authentication → Providers → Google: paste the Google OAuth client ID
   and secret (Google Cloud project `creator-desk-512316`). In Google Cloud, add the redirect URI that
   Supabase shows (`https://<project>.supabase.co/auth/v1/callback`).
   **Turn the Email provider off** so the only way in is a verified Google account.
   Authentication → URL configuration: Site URL `https://mycreatordesk.co.in`.
3. **Database**: `supabase link --project-ref <ref>` then `supabase db push`
   (or paste `migrations/20261024000000_init.sql` into the SQL editor).
4. **Platform owners**: the migration adds `udayruhil.82@gmail.com` and `vanshikajuyal06@gmail.com`.
   Change with: `insert into platform_admins (email) values ('you@gmail.com');` /
   `delete from platform_admins where email = '...';`
5. **Secrets** (Supabase → Edge Functions → Secrets, or `supabase secrets set NAME=value`):

   | Name | Value |
   |---|---|
   | `TOKEN_ENC_KEY` | `openssl rand -base64 32` (keep a copy safe; changing it means reconnecting Instagram) |
   | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay Dashboard → Account & Settings → API keys |
   | `RAZORPAY_WEBHOOK_SECRET` | the secret you type when adding the webhook (step 7) |
   | `FB_APP_ID` | `1113383891047813` |
   | `FB_APP_SECRET` | Meta app → Settings → Basic |
   | `FB_REDIRECT_URIS` | `https://mycreatordesk.co.in/` (comma-separated if more) |
   | `ALLOWED_ORIGINS` | `https://mycreatordesk.co.in,https://www.mycreatordesk.co.in` |
   | `JWT_SECRET` | only if the project still uses the legacy JWT secret; leave unset for the new signing keys |

   `SUPABASE_URL` and `SUPABASE_DB_URL` are provided by Supabase automatically.
6. **Deploy functions**: `supabase functions deploy api` and `supabase functions deploy razorpay-webhook`.
7. **Razorpay webhook**: Razorpay Dashboard → Webhooks → Add:
   URL `https://<project>.supabase.co/functions/v1/razorpay-webhook`, events
   `payment.captured`, `order.paid`, `payment.failed`, and the secret from step 5.
   Start in **Test mode** keys; switch to Live keys after KYC.

## API

`POST https://<project>.supabase.co/functions/v1/api` with header `Authorization: Bearer <Supabase sign-in token>`
and a JSON body `{ "action": "...", ...params }`. Answer: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

| Area | Actions |
|---|---|
| Account | `me` (profile, companies, invites, plans) |
| Company | `company.create`, `company.get`, `company.update` |
| Team | `members.list`, `invites.create`, `invites.revoke`, `invites.accept`, `members.remove`, `members.role` |
| Usage | `usage.get` (per member, per day, live capacity), `audit.list` |
| Billing | `billing.order` → Razorpay Checkout → `billing.verify`; `billing.history` |
| Instagram | `ig.connect` (Facebook Login code), `ig.disconnect`, `ig.test` |
| Work | `work.state`, `creators.lookup`, `creators.refresh`, `creators.save`, `creators.add`, `creators.remove`, `creators.clear`, `settings.save`, `posts.add`, `posts.update`, `posts.remove`, `posts.refresh` |
| Platform owner | `platform.companies`, `platform.approve`, `platform.status`, `platform.payments` |

Error codes include `AUTH`, `FORBIDDEN`, `INACTIVE` (plan not active), `SEAT_LIMIT`, `IG_LIMIT`, `IG_IN_USE`,
`ALREADY_PAID`, `PAYMENT`, `PLAN`, `INVALID`, `NOT_FOUND`, `OWNER`, `LAST_ADMIN`.

## Tests

Needs Postgres and Deno locally. `tests/run.sh` creates a scratch database, applies the real migration and runs:
- `rls.test.ts`: 15 security tests (company separation, roles, seats, Instagram limit, budget, payments, suspension, usage).
- `api.test.ts`: 12 end-to-end tests of the API and webhook with Instagram and Razorpay faked.

```
PGHOST=/var/tmp PGPORT=55432 supabase/tests/run.sh
```
