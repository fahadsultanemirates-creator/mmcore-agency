-- PayRam checkout integration. Run once via Supabase Dashboard > SQL
-- Editor (or `supabase db push`), after 0001-0008. Numbered 0010, not
-- 0009, deliberately -- 0009_forge_channel.sql exists on a separate,
-- not-yet-merged branch; skipping the number avoids a collision without
-- functionally mattering (Postgres only cares about execution order,
-- not filenames).

-- ============================================================
-- billing.request_id: the 30% upfront payment happens before any
-- project exists -- project creation is still a manual admin step
-- (see 0007_admin_create_project.sql), so billing rows for the upfront
-- payment can't reference a project the way the existing 70%
-- final-payment rows do (via project_id, set in
-- approve_project_delivery). Both columns stay nullable; a given
-- billing row sets exactly one of them depending on which stage of
-- the payment lifecycle it represents.
-- ============================================================

alter table public.billing
  add column if not exists request_id uuid references public.requests(id) on delete set null;

alter table public.billing drop constraint if exists billing_payment_type_check;
alter table public.billing add constraint billing_payment_type_check
  check (payment_type in ('upfront', 'milestone', 'full'));

-- ============================================================
-- requests.payram_reference_id / payram_payment_url: set once
-- payram-create-payment successfully creates a PayRam payment link,
-- so reloading the New Request/Packages page doesn't spin up a
-- duplicate PayRam invoice for the same request -- the function
-- returns the existing link instead of creating a new one.
-- ============================================================

alter table public.requests
  add column if not exists payram_reference_id text,
  add column if not exists payram_payment_url text;
