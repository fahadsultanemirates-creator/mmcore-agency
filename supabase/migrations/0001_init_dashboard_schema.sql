-- M&MCore dashboard schema: profiles, requests, projects, billing, points_transactions
-- Run once via Supabase Dashboard > SQL Editor, or `supabase db push` with the CLI.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- Tables
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company_name text,
  referral_code text not null unique,
  referred_by uuid references public.profiles(id),
  total_spend numeric(12,2) not null default 0,
  is_business_pool boolean not null default false,
  points_balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_category text not null,
  tier text not null check (tier in ('standard')),
  description text,
  status text not null default 'draft' check (status in ('draft', 'awaiting_payment', 'confirmed')),
  agreed_price numeric(12,2),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_name text,
  status text not null default 'in_progress' check (status in ('in_progress', 'awaiting_review', 'revision_requested', 'delivered')),
  revisions_used int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  amount numeric(12,2) not null,
  points_used numeric(12,2) not null default 0,
  payment_type text not null check (payment_type in ('full', 'milestone')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  paid_at timestamptz
);

create table public.points_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('earned_referral', 'spent_checkout', 'admin_adjustment')),
  amount numeric(12,2) not null,
  source_project_id uuid references public.projects(id) on delete set null,
  referral_tier int check (referral_tier in (1, 2, 3)),
  task_number int check (task_number between 1 and 3),
  created_at timestamptz not null default now()
);

create index on public.requests (user_id);
create index on public.projects (user_id);
create index on public.projects (request_id);
create index on public.billing (user_id);
create index on public.billing (project_id);
create index on public.points_transactions (user_id);
create index on public.points_transactions (source_project_id);

-- ============================================================
-- Signup trigger: auto-create profile, generate referral_code,
-- resolve referred_by from a referral code passed in signup metadata
-- ============================================================

create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I, avoids visual ambiguity
  code text;
  code_taken boolean;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    select exists(select 1 from public.profiles where referral_code = code) into code_taken;
    exit when not code_taken;
  end loop;
  return code;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  referrer_id uuid;
  ref_code text;
begin
  ref_code := new.raw_user_meta_data ->> 'referred_by_code';
  if ref_code is not null then
    select id into referrer_id from public.profiles where referral_code = ref_code;
  end if;

  insert into public.profiles (id, full_name, company_name, referral_code, referred_by)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company_name',
    public.generate_referral_code(),
    referrer_id
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- Guard trigger: financial/loyalty fields on profiles can only be
-- changed by backend logic (service_role or a SECURITY DEFINER
-- function such as handle_billing_paid below), never by the row
-- owner via the anon/authenticated API roles.
--
-- This checks current_user rather than auth.role(): auth.role()
-- reflects the JWT of the original API caller, which does not
-- reliably propagate into nested trigger calls made from inside a
-- SECURITY DEFINER function (that function's UPDATE runs as its
-- owner). Keying off current_user correctly recognizes any trusted
-- execution context -- direct service_role connections, the SQL
-- editor, and definer-function cascades alike -- without depending
-- on JWT context surviving the call chain.
--
-- This function is deliberately NOT security definer: it must run
-- as the invoker so current_user reflects the real caller. Marking
-- it definer would make current_user resolve to the function owner
-- on every invocation, silently defeating the check for direct
-- client calls (verified against a local Postgres instance while
-- building this migration).
-- ============================================================

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.total_spend := old.total_spend;
    new.is_business_pool := old.is_business_pool;
    new.points_balance := old.points_balance;
    new.referral_code := old.referral_code;
    new.referred_by := old.referred_by;
  end if;
  return new;
end;
$$;

create trigger protect_profile_fields_trigger
before update on public.profiles
for each row execute function public.protect_profile_fields();

-- ============================================================
-- projects.updated_at maintenance
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- ============================================================
-- Business Pool trigger: total_spend is a permanent lifetime total
-- (refunds do not decrement it), and is_business_pool only ever
-- flips false -> true once total_spend crosses $3,250; never reverts.
-- ============================================================

create or replace function public.handle_billing_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    update public.profiles
    set total_spend = total_spend + new.amount,
        is_business_pool = is_business_pool or (total_spend + new.amount) >= 3250
    where id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger on_billing_paid
after insert or update on public.billing
for each row execute function public.handle_billing_paid();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.requests enable row level security;
alter table public.projects enable row level security;
alter table public.billing enable row level security;
alter table public.points_transactions enable row level security;

-- profiles: users can read and update their own row (protected fields
-- are silently reverted by the guard trigger above). No client insert
-- policy — rows are created only by the on_auth_user_created trigger.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- requests: users manage their own requests end to end
create policy "requests_select_own" on public.requests
  for select using (auth.uid() = user_id);

create policy "requests_insert_own" on public.requests
  for insert with check (auth.uid() = user_id);

create policy "requests_update_own" on public.requests
  for update using (auth.uid() = user_id);

-- projects: read-only for the owner; created/updated by backend (service_role)
create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);

-- billing: read-only for the owner; created/updated by backend (service_role)
create policy "billing_select_own" on public.billing
  for select using (auth.uid() = user_id);

-- points_transactions: read-only for the owner; written only by backend
create policy "points_transactions_select_own" on public.points_transactions
  for select using (auth.uid() = user_id);
