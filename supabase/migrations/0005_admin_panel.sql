-- Admin panel: an is_admin flag (the real, server-side-enforced gate --
-- an admin.html client-side check is UX only), admin read access across
-- all users' data, and admin-only RPCs for the writes an admin needs
-- (project status, billing status, Business Pool override). Run once
-- via Supabase Dashboard > SQL Editor (or `supabase db push`), after
-- 0001-0004.

-- ============================================================
-- is_admin: protected the same way total_spend/is_business_pool/etc
-- already are -- a user can never set it on their own profile via a
-- direct client update, only a trusted (service_role or SECURITY
-- DEFINER) context can.
-- ============================================================

alter table public.profiles add column if not exists is_admin boolean not null default false;

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
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

-- ============================================================
-- is_current_user_admin(): SECURITY DEFINER so its internal lookup
-- bypasses RLS entirely, rather than a raw
-- "exists (select ... from profiles ...)" inline in each policy's
-- USING clause. That raw form was tried first and hit Postgres'
-- classic self-referencing RLS trap: a policy on `profiles` that
-- queries `profiles` inside its own USING clause re-triggers RLS
-- evaluation on `profiles`, which re-evaluates the same policy again,
-- infinitely -- confirmed locally ("infinite recursion detected in
-- policy for relation profiles") before switching to this function.
-- ============================================================

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ============================================================
-- Admin read access: broadens SELECT to all rows (not just
-- auth.uid() = user_id) when the caller is an admin. Read-only --
-- writes still go through the RPCs below, which re-check is_admin
-- themselves rather than trusting RLS alone for anything mutating.
-- ============================================================

create policy "admin_select_all_profiles" on public.profiles
  for select using (public.is_current_user_admin());

create policy "admin_select_all_requests" on public.requests
  for select using (public.is_current_user_admin());

create policy "admin_select_all_projects" on public.projects
  for select using (public.is_current_user_admin());

create policy "admin_select_all_billing" on public.billing
  for select using (public.is_current_user_admin());

-- ============================================================
-- Admin RPCs. Each independently re-verifies is_admin server-side --
-- do not rely on RLS alone here, since these mutate data outside the
-- caller's own rows. A broad admin UPDATE policy on profiles was
-- deliberately avoided: it would still get silently blocked by
-- protect_profile_fields' guard (current_user is 'authenticated' for
-- an admin's own session same as any user), the same class of bug
-- already found and fixed once in 0002 for the billing trigger. RPCs
-- sidestep that entirely by mutating from inside a SECURITY DEFINER
-- context, same pattern as request_project_revision/
-- approve_project_delivery from 0004.
-- ============================================================

create or replace function public.admin_update_project_status(p_project_id uuid, p_new_status text)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
begin
  if not public.is_current_user_admin() then
    raise exception 'Not authorized';
  end if;

  update public.projects set status = p_new_status where id = p_project_id
  returning * into proj;

  if proj is null then
    raise exception 'Project not found';
  end if;

  return proj;
end;
$$;

create or replace function public.admin_update_billing_status(p_billing_id uuid, p_new_status text)
returns public.billing
language plpgsql
security definer
set search_path = public
as $$
declare
  bill public.billing;
begin
  if not public.is_current_user_admin() then
    raise exception 'Not authorized';
  end if;

  update public.billing
  set status = p_new_status,
      paid_at = case when p_new_status = 'paid' then now() else paid_at end
  where id = p_billing_id
  returning * into bill;

  if bill is null then
    raise exception 'Billing row not found';
  end if;

  return bill;
end;
$$;

create or replace function public.admin_set_business_pool(p_user_id uuid, p_is_business_pool boolean)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles;
begin
  if not public.is_current_user_admin() then
    raise exception 'Not authorized';
  end if;

  update public.profiles set is_business_pool = p_is_business_pool where id = p_user_id
  returning * into prof;

  if prof is null then
    raise exception 'Profile not found';
  end if;

  return prof;
end;
$$;

revoke all on function public.admin_update_project_status(uuid, text) from public;
grant execute on function public.admin_update_project_status(uuid, text) to authenticated;

revoke all on function public.admin_update_billing_status(uuid, text) from public;
grant execute on function public.admin_update_billing_status(uuid, text) to authenticated;

revoke all on function public.admin_set_business_pool(uuid, boolean) from public;
grant execute on function public.admin_set_business_pool(uuid, boolean) to authenticated;

-- ============================================================
-- Bootstrapping: is_admin defaults to false for everyone and can
-- only be set from a trusted context (service_role or the SQL
-- Editor, which runs as the table owner and bypasses RLS/triggers).
-- After running this migration, make your own account an admin with:
--
--   update public.profiles set is_admin = true where id = '<your-user-id>';
--
-- (Find your user id under Authentication > Users in the dashboard.)
-- ============================================================
