-- Referral point crediting, revisions_used cap, and two bug fixes found
-- while building the dashboard. Run once via Supabase Dashboard > SQL
-- Editor (or `supabase db push`), after 0001_init_dashboard_schema.sql.

-- ============================================================
-- Fix: auth.js sends the referral code as options.data.referred_by,
-- but this trigger was reading referred_by_code -- a key mismatch that
-- meant referral links have never actually resolved referred_by.
-- ============================================================

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
  ref_code := new.raw_user_meta_data ->> 'referred_by';
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

-- ============================================================
-- projects.revisions_used: cap enforced at the schema level, matching
-- the "2 free revision rounds" promised on tiers.html.
-- ============================================================

alter table public.projects
  add constraint revisions_used_max check (revisions_used between 0 and 2);

-- ============================================================
-- Referral point crediting: full 3-level chain (20% / 10% / 5%),
-- matching referral.html's published copy and the schema's
-- referral_tier/task_number columns. The L1-referred user also gets
-- their own 10% back as points (there's no pre-payment pricing engine
-- in this codebase to apply a literal price discount, so points-back
-- is the buildable equivalent of the same value).
--
-- "Task" = a distinct paid PROJECT, not a billing row. Top-tier /
-- Business Pool work bills in milestones (multiple billing rows per
-- project), so crediting fires once -- on a project's first paid
-- billing row -- and task_number counts distinct paid project_ids,
-- not billing rows. Otherwise a 3-milestone project would look like
-- 3 separate tasks and over-credit on every milestone.
-- ============================================================

create or replace function public.handle_billing_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first_payment_for_project boolean;
  qualifying_task_number int;
  l1_id uuid;
  l2_id uuid;
  l3_id uuid;
  l1_share numeric(12,2);
  l2_share numeric(12,2);
  l3_share numeric(12,2);
  referred_share numeric(12,2);
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    update public.profiles
    set total_spend = total_spend + new.amount,
        is_business_pool = is_business_pool or (total_spend + new.amount) >= 5000
    where id = new.user_id;

    if new.project_id is not null then
      select not exists (
        select 1 from public.billing
        where project_id = new.project_id and status = 'paid' and id <> new.id
      ) into is_first_payment_for_project;

      if is_first_payment_for_project then
        select count(distinct project_id) into qualifying_task_number
        from public.billing
        where user_id = new.user_id and status = 'paid' and project_id is not null;

        if qualifying_task_number <= 3 then
          select referred_by into l1_id from public.profiles where id = new.user_id;

          if l1_id is not null then
            referred_share := round(new.amount * 0.10, 2);
            insert into public.points_transactions
              (user_id, type, amount, source_project_id, referral_tier, task_number)
            values
              (new.user_id, 'earned_referral', referred_share, new.project_id, null, qualifying_task_number);
            update public.profiles set points_balance = points_balance + referred_share where id = new.user_id;

            l1_share := round(new.amount * 0.20, 2);
            insert into public.points_transactions
              (user_id, type, amount, source_project_id, referral_tier, task_number)
            values
              (l1_id, 'earned_referral', l1_share, new.project_id, 1, qualifying_task_number);
            update public.profiles set points_balance = points_balance + l1_share where id = l1_id;

            select referred_by into l2_id from public.profiles where id = l1_id;
            if l2_id is not null then
              l2_share := round(new.amount * 0.10, 2);
              insert into public.points_transactions
                (user_id, type, amount, source_project_id, referral_tier, task_number)
              values
                (l2_id, 'earned_referral', l2_share, new.project_id, 2, qualifying_task_number);
              update public.profiles set points_balance = points_balance + l2_share where id = l2_id;

              select referred_by into l3_id from public.profiles where id = l2_id;
              if l3_id is not null then
                l3_share := round(new.amount * 0.05, 2);
                insert into public.points_transactions
                  (user_id, type, amount, source_project_id, referral_tier, task_number)
                values
                  (l3_id, 'earned_referral', l3_share, new.project_id, 3, qualifying_task_number);
                update public.profiles set points_balance = points_balance + l3_share where id = l3_id;
              end if;
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;
