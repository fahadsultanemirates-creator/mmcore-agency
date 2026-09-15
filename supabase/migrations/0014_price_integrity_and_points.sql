-- Price integrity, Points redemption, Business Pool discount, and the
-- referral-value fix. Run once via Supabase Dashboard > SQL Editor (or
-- `supabase db push`), after 0001-0013.
--
-- THE BUG THIS PRIMARILY FIXES
-- ---------------------------
-- requests.agreed_price was written directly by the browser
-- (dashboard.js's insert) and nothing anywhere checked it. The
-- requests_insert_own policy from 0001 only ever verified
-- auth.uid() = user_id -- never the amount -- so anyone with devtools
-- could order the $650 custom web app for $1, and payram-create-payment
-- would faithfully bill 30% of that. requests_update_own made it worse:
-- the price could be edited again after submission.
--
-- The fix follows the pattern already established by
-- protect_profile_fields in 0001: rather than trying to validate what
-- the client sent, the client's value is simply overwritten with the
-- authoritative one computed here. The browser can send whatever it
-- likes; only the catalogue below decides what anything costs.

-- ============================================================
-- Authoritative price list. Mirrors pricing-catalog.js and
-- marketing-pricing-catalog.js -- those stay as the display/wizard
-- source, this is the enforcement source. Keep the three in sync.
-- ============================================================

create table if not exists public.service_prices (
  category text not null,
  item_name text not null,
  price numeric(12,2) not null check (price >= 0),
  is_recurring boolean not null default false,
  active boolean not null default true,
  primary key (category, item_name)
);

create table if not exists public.package_prices (
  key text primary key,
  display_name text not null,
  service_category text not null,
  price numeric(12,2) not null check (price >= 0),
  is_recurring boolean not null default false,
  active boolean not null default true
);

alter table public.service_prices enable row level security;
alter table public.package_prices enable row level security;

-- Readable by anyone (it is a public price list, already fully visible
-- in pricing-catalog.js), writable only by service_role / SQL editor.
drop policy if exists "service_prices_public_read" on public.service_prices;
create policy "service_prices_public_read" on public.service_prices for select using (true);

drop policy if exists "package_prices_public_read" on public.package_prices;
create policy "package_prices_public_read" on public.package_prices for select using (true);

-- ---------- Seed: core catalogue ----------
insert into public.service_prices (category, item_name, price) values
  ('Websites', 'Single landing page website', 32.5),
  ('Websites', 'Multi-page website (3-5 pages)', 97.5),
  ('Websites', 'Multi-page website (6-10 pages)', 195),
  ('Websites', 'E-commerce website', 520),
  ('Websites', 'Custom dashboard / web app', 650),
  ('Websites', 'Website redesign', 130),
  ('Websites', 'Blog setup', 32.5),
  ('Websites', 'Domain + hosting setup (one-time)', 19.5),
  ('Websites', 'Website maintenance (monthly)', 13),

  ('Design & Media', 'Logo design', 3.25),
  ('Design & Media', 'Business card design', 3.25),
  ('Design & Media', 'Letterhead or receipt design', 3.25),
  ('Design & Media', 'Brand style guide', 13),
  ('Design & Media', 'Social media single post', 3.25),
  ('Design & Media', 'Social media post pack (5 posts)', 16.25),
  ('Design & Media', 'Social media post pack (10 posts)', 32.5),
  ('Design & Media', 'Social media post pack (20 posts)', 48.75),
  ('Design & Media', 'Marketing banner', 3.25),
  ('Design & Media', 'Video (8-15 sec)', 9.75),
  ('Design & Media', 'Video (30-60 sec)', 26),
  ('Design & Media', 'Photo editing', 3.25),
  ('Design & Media', 'PDF proposal design', 9.75),
  ('Design & Media', 'PDF report design', 9.75),
  ('Design & Media', 'PDF brochure design', 16.25),
  ('Design & Media', 'Email (design)', 3.25),

  ('Marketing Essentials', 'Social media handling (monthly)', 39),
  ('Marketing Essentials', 'Auto social media posting (monthly)', 32.5),
  ('Marketing Essentials', 'Marketing strategy & feasibility plan', 16.25),
  ('Marketing Essentials', 'Full marketing management retainer (monthly)', 117),
  ('Marketing Essentials', 'Ad campaign management (monthly)', 39),
  ('Marketing Essentials', 'SEO optimization (one-time)', 39),
  ('Marketing Essentials', 'SEO maintenance (monthly)', 32.5),
  ('Marketing Essentials', 'AI marketing framework build', 227.5),
  ('Marketing Essentials', 'AI marketing framework maintenance (monthly)', 32.5),
  ('Marketing Essentials', 'Email marketing setup', 16.25),

  ('Bookkeeping & Reports', 'Bookkeeping cleanup', 39),
  ('Bookkeeping & Reports', 'Ongoing bookkeeping (monthly)', 32.5),
  ('Bookkeeping & Reports', 'Monthly balance sheet', 19.5),
  ('Bookkeeping & Reports', 'Yearly balance sheet / annual report', 65),
  ('Bookkeeping & Reports', 'Invoicing & receipts setup', 16.25),
  ('Bookkeeping & Reports', 'Payroll setup', 32.5),
  ('Bookkeeping & Reports', 'Tax preparation support', 39),

  ('Audits & Feasibility Reports', 'Business feasibility report', 26),
  ('Audits & Feasibility Reports', 'Business audit', 32.5),
  ('Audits & Feasibility Reports', 'Market research report', 26),
  ('Audits & Feasibility Reports', 'Competitor analysis report', 19.5),
  ('Audits & Feasibility Reports', 'Real estate project feasibility report', 65),

  ('Custom AI Agents', 'Single-task AI agent', 97.5),
  ('Custom AI Agents', 'Multi-agent framework (2-4 agents)', 325),
  ('Custom AI Agents', 'Multi-agent framework (full business system)', 650),
  ('Custom AI Agents', 'Telegram/WhatsApp customer support agent', 130),
  ('Custom AI Agents', 'Voice AI agent', 195),
  ('Custom AI Agents', 'Agent hosting & maintenance (monthly)', 16.25),
  ('Custom AI Agents', 'Framework handover (client owns & runs it)', 97.5),

  ('AI Video & Creative', 'Multilingual AI avatar spokesperson video (per 60-90s video)', 127.5),
  ('AI Video & Creative', 'Automated video repurposing (monthly, 12 vertical shorts/reels)', 360),
  ('AI Video & Creative', 'Dynamic ad creative production (15-20 modular ad variants)', 285),

  ('Lead Generation & Outreach', 'Multi-agent lead scraping & enrichment (1,000 ICP-verified B2B leads)', 330),
  ('Lead Generation & Outreach', 'Hyper-personalized cold outreach (monthly, full outbound infrastructure)', 900),
  ('Lead Generation & Outreach', 'Automated lead qualification & scoring (setup)', 420),

  ('Customer Engagement', '24/7 AI sales & support chatbot (setup)', 390),
  ('Customer Engagement', '24/7 AI sales & support chatbot (monthly)', 90),
  ('Customer Engagement', 'Automated review & reputation management (monthly)', 225),
  ('Customer Engagement', 'Behavioral re-engagement workflows (setup)', 375),

  ('Paid Media & Optimization', 'Predictive audience targeting & setup', 315),
  ('Paid Media & Optimization', 'Autonomous ad budget allocation (monthly)', 480),
  ('Paid Media & Optimization', 'Algorithmic A/B testing & CRO (monthly)', 405),

  ('Organic Growth & Intelligence', 'Programmatic SEO & content hubs (setup)', 690),
  ('Organic Growth & Intelligence', 'Real-time competitor & market tracking (monthly)', 255)
on conflict (category, item_name) do update
  set price = excluded.price, active = true;

-- Anything billed per month is recurring; derived from the item name so
-- the seed above stays a plain price list.
update public.service_prices set is_recurring = true where item_name ilike '%monthly%';

-- ---------- Seed: packages ----------
-- The Starter Package was priced at $97.50 while its own contents came
-- to $84.50 at catalogue prices (landing page 32.50 + 5-post pack 16.25
-- + 3 branded documents 9.75 + brochure 16.25 + report 9.75) -- i.e. the
-- "bundle" cost more than buying the parts. Repriced to $69.00, a real
-- ~18% saving against the a la carte total.
insert into public.package_prices (key, display_name, service_category, price, is_recurring) values
  ('starter', 'M&MCore Starter Package', 'M&MCore Starter Package', 69.00, false),
  ('marketing-starter-engine', 'AI Starter Engine', 'Marketing — AI Starter Engine', 570.00, true),
  ('marketing-omni-scale-growth-engine', 'Omni-Scale Growth Engine', 'Marketing — Omni-Scale Growth Engine', 2070.00, true)
on conflict (key) do update
  set display_name = excluded.display_name,
      service_category = excluded.service_category,
      price = excluded.price,
      is_recurring = excluded.is_recurring,
      active = true;

-- ============================================================
-- requests: the columns the pricing trigger needs.
--   list_price     -- catalogue price before any discount
--   discount_rate  -- 1.00 / 0.80 (Business Pool) / 0.50 (package add-on)
--   points_applied -- Points spent on this order
--   agreed_price   -- round(list_price * discount_rate) - points_applied
--   package_key    -- set for package orders, null for catalogue orders
--   is_recurring   -- monthly service: billed in full each month, not 30/70
-- ============================================================

alter table public.requests
  add column if not exists list_price numeric(12,2),
  add column if not exists discount_rate numeric(4,2) not null default 1.00,
  add column if not exists points_applied numeric(12,2) not null default 0,
  add column if not exists package_key text references public.package_prices(key),
  add column if not exists is_recurring boolean not null default false;

alter table public.requests drop constraint if exists requests_status_check;
alter table public.requests add constraint requests_status_check
  check (status in ('draft', 'awaiting_payment', 'confirmed', 'cancelled'));

-- ============================================================
-- price_request(): the single authority on what anything costs.
--
-- Runs BEFORE INSERT. For a client-role caller every price-bearing
-- column is recomputed from service_prices/package_prices and whatever
-- the browser sent is discarded.
--
-- WHY auth.uid() AND NOT current_user
-- -----------------------------------
-- protect_profile_fields (0001) gates on current_user and documents at
-- length why it must NOT be SECURITY DEFINER to do so. This function has
-- the opposite requirement: it has to read profiles, service_prices and
-- another user's billing rows, and take a FOR UPDATE lock, so it must be
-- SECURITY DEFINER -- which makes current_user resolve to the function
-- owner on every call and would silently skip the recompute for
-- everyone. (Confirmed locally: a client insert of agreed_price = 1.00
-- for the $650 item sailed straight through the first version of this
-- function.)
--
-- auth.uid() is the right test here precisely because of the property
-- 0001 flagged as a weakness in its own context: it reflects the JWT of
-- the ORIGINAL API caller. That is exactly what we want -- a real signed
-- in client always has one, while service_role calls, Edge Functions
-- holding the service key, and the SQL editor all have none.
--
-- An admin agreeing a bespoke price for custom-scoped work goes through
-- admin_create_custom_request / admin_set_request_price below, which set
-- the mmcore.allow_custom_price flag for their transaction only.
--
-- Discounts do NOT stack: a Business Pool client who also holds a paid
-- Starter Package gets the better of the two (50%), not 40% of list.
-- ============================================================

create or replace function public.price_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles;
  base numeric(12,2);
  rate numeric(4,2) := 1.00;
  recurring boolean := false;
  gross numeric(12,2);
  has_paid_package boolean;
  requested_points numeric(12,2);
begin
  -- Trusted contexts keep manual control: no end-user JWT (service_role,
  -- Edge Functions, SQL editor), or an admin RPC that explicitly opted
  -- out for its own transaction.
  if auth.uid() is null
     or coalesce(current_setting('mmcore.allow_custom_price', true), '') = 'on' then
    return new;
  end if;

  -- Lock the profile row for the duration of this transaction. Without
  -- this, two concurrent submissions could each read the same Points
  -- balance and both spend it.
  -- RLS already restricts inserts to auth.uid() = user_id; pin it here
  -- too so the pricing below can never be computed against another
  -- account's Business Pool status or Points balance.
  new.user_id := auth.uid();

  select * into prof from public.profiles where id = new.user_id for update;
  if prof is null then
    raise exception 'Profile not found';
  end if;

  if new.package_key is not null then
    select p.price, p.is_recurring, p.service_category
      into base, recurring, new.service_category
      from public.package_prices p
     where p.key = new.package_key and p.active;

    if base is null then
      raise exception 'Unknown or inactive package: %', new.package_key;
    end if;

    -- Packages are already bundle-priced; no further discount stacks.
    rate := 1.00;
    new.task_type := null;
  else
    select s.price, s.is_recurring
      into base, recurring
      from public.service_prices s
     where s.category = new.service_category
       and s.item_name = new.task_type
       and s.active;

    if base is null then
      raise exception 'Unknown service/task combination: % / %',
        coalesce(new.service_category, '(null)'), coalesce(new.task_type, '(null)');
    end if;

    -- The 50% package add-on requires a package order that was actually
    -- PAID. Previously the dashboard unlocked it on any package row
    -- regardless of status, so submitting an order and never paying for
    -- it discounted everything else forever.
    select exists (
      select 1
        from public.requests r
        join public.billing b on b.request_id = r.id
       where r.user_id = new.user_id
         and r.package_key = 'starter'
         and b.status = 'paid'
    ) into has_paid_package;

    if has_paid_package then
      rate := 0.50;
    elsif prof.is_business_pool then
      -- The published "20% off every service" Business Pool perk, which
      -- until now was advertised on four pages and implemented nowhere.
      rate := 0.80;
    end if;
  end if;

  gross := round(base * rate, 2);

  requested_points := greatest(coalesce(new.points_applied, 0), 0);
  new.points_applied := least(requested_points, prof.points_balance, gross);

  new.list_price    := base;
  new.discount_rate := rate;
  new.is_recurring  := recurring;
  new.agreed_price  := round(gross - new.points_applied, 2);
  new.tier          := 'standard';
  new.status        := 'awaiting_payment';

  -- These are set only by payram-create-payment (service_role); a
  -- client must never be able to plant its own payment URL.
  new.payram_payment_url := null;
  new.payram_reference_id := null;

  return new;
end;
$$;

drop trigger if exists price_request_trigger on public.requests;
create trigger price_request_trigger
before insert on public.requests
for each row execute function public.price_request();

-- ============================================================
-- Points are debited AFTER the row exists, so a failed insert can't
-- burn a balance. The profile row is already locked by price_request()
-- in this same transaction.
-- ============================================================

create or replace function public.spend_points_on_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.points_applied > 0 then
    update public.profiles
       set points_balance = points_balance - new.points_applied
     where id = new.user_id;

    insert into public.points_transactions (user_id, type, amount)
    values (new.user_id, 'spent_checkout', -new.points_applied);
  end if;
  return new;
end;
$$;

drop trigger if exists spend_points_on_request_trigger on public.requests;
create trigger spend_points_on_request_trigger
after insert on public.requests
for each row execute function public.spend_points_on_request();

alter table public.profiles drop constraint if exists profiles_points_balance_nonneg;
alter table public.profiles add constraint profiles_points_balance_nonneg
  check (points_balance >= 0);

-- ============================================================
-- Clients no longer update requests at all. Nothing in the dashboard
-- ever did; the policy just left agreed_price and status editable
-- after the fact.
-- ============================================================

drop policy if exists "requests_update_own" on public.requests;

-- ============================================================
-- Referral crediting, corrected.
--
-- The old version valued a referral at the amount of the billing row
-- that triggered it. Because crediting fires on the first billing row
-- carrying a project_id -- and the 30% upfront row carries request_id
-- instead -- that was always the 70% milestone row. So "20% of their
-- task value" actually paid 20% x 70% = 14%, and L2/L3 were short by
-- the same 30%.
--
-- Referral value is now the project's own pre-Points, post-discount
-- price, read from the originating request, exactly as the published
-- Referral Points Policy describes it.
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
  referral_value numeric(12,2);
  l1_id uuid;
  l2_id uuid;
  l3_id uuid;
begin
  if not (new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid')) then
    return new;
  end if;

  -- Lifetime spend counts cash actually collected, so it stays the sum
  -- of paid billing rows (30% + 70% = the full price).
  update public.profiles
     set total_spend = total_spend + new.amount,
         is_business_pool = is_business_pool or (total_spend + new.amount) >= 5000
   where id = new.user_id;

  if new.project_id is null then
    return new;
  end if;

  select not exists (
    select 1 from public.billing
     where project_id = new.project_id and status = 'paid' and id <> new.id
  ) into is_first_payment_for_project;

  if not is_first_payment_for_project then
    return new;
  end if;

  select count(distinct project_id) into qualifying_task_number
    from public.billing
   where user_id = new.user_id and status = 'paid' and project_id is not null;

  if qualifying_task_number > 3 then
    return new;
  end if;

  -- The full value of the project, before Points were applied.
  select round(coalesce(r.list_price, r.agreed_price + r.points_applied) * r.discount_rate, 2)
    into referral_value
    from public.projects p
    join public.requests r on r.id = p.request_id
   where p.id = new.project_id;

  if referral_value is null or referral_value <= 0 then
    return new;
  end if;

  select referred_by into l1_id from public.profiles where id = new.user_id;
  if l1_id is null then
    return new;
  end if;

  -- The referred client's own 10% back.
  insert into public.points_transactions
    (user_id, type, amount, source_project_id, referral_tier, task_number)
  values
    (new.user_id, 'earned_referral', round(referral_value * 0.10, 2), new.project_id, null, qualifying_task_number);
  update public.profiles
     set points_balance = points_balance + round(referral_value * 0.10, 2)
   where id = new.user_id;

  insert into public.points_transactions
    (user_id, type, amount, source_project_id, referral_tier, task_number)
  values
    (l1_id, 'earned_referral', round(referral_value * 0.20, 2), new.project_id, 1, qualifying_task_number);
  update public.profiles
     set points_balance = points_balance + round(referral_value * 0.20, 2)
   where id = l1_id;

  select referred_by into l2_id from public.profiles where id = l1_id;
  if l2_id is null then
    return new;
  end if;

  insert into public.points_transactions
    (user_id, type, amount, source_project_id, referral_tier, task_number)
  values
    (l2_id, 'earned_referral', round(referral_value * 0.10, 2), new.project_id, 2, qualifying_task_number);
  update public.profiles
     set points_balance = points_balance + round(referral_value * 0.10, 2)
   where id = l2_id;

  select referred_by into l3_id from public.profiles where id = l2_id;
  if l3_id is null then
    return new;
  end if;

  insert into public.points_transactions
    (user_id, type, amount, source_project_id, referral_tier, task_number)
  values
    (l3_id, 'earned_referral', round(referral_value * 0.05, 2), new.project_id, 3, qualifying_task_number);
  update public.profiles
     set points_balance = points_balance + round(referral_value * 0.05, 2)
   where id = l3_id;

  return new;
end;
$$;

-- ============================================================
-- A monthly service is billed in full for the month, not 30/70 -- there
-- is no "completion" to hold 70% against. approve_project_delivery
-- therefore must not invent a 70% balance for one.
-- ============================================================

create or replace function public.approve_project_delivery(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  req public.requests;
  remaining_amount numeric(12,2);
begin
  select * into proj from public.projects where id = p_project_id;

  if proj is null then
    raise exception 'Project not found';
  end if;

  if proj.user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  if proj.status not in ('delivered', 'awaiting_review') then
    raise exception 'Only a project awaiting your review can be approved';
  end if;

  select * into req from public.requests where id = proj.request_id;

  if req.agreed_price is null then
    raise exception 'No agreed price on file for this project -- contact support';
  end if;

  update public.projects set status = 'approved' where id = p_project_id
  returning * into proj;

  if not coalesce(req.is_recurring, false) then
    remaining_amount := round(req.agreed_price * 0.70, 2);
    if remaining_amount > 0 then
      insert into public.billing (user_id, project_id, amount, payment_type, status)
      values (proj.user_id, proj.id, remaining_amount, 'milestone', 'pending');
    end if;
  end if;

  return proj;
end;
$$;

-- ============================================================
-- admin_cancel_request: cancel an unpaid order and return any Points
-- the client spent on it, per the published policy ("if an order is
-- cancelled before work starts, the Points are returned").
-- ============================================================

create or replace function public.admin_cancel_request(p_request_id uuid)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.requests;
begin
  if not public.is_current_user_admin() then
    raise exception 'Not authorized';
  end if;

  select * into req from public.requests where id = p_request_id for update;
  if req is null then
    raise exception 'Request not found';
  end if;

  if req.status = 'cancelled' then
    return req;
  end if;

  if exists (select 1 from public.billing where request_id = p_request_id and status = 'paid') then
    raise exception 'This request has already been paid -- refund the billing row instead of cancelling';
  end if;

  if req.points_applied > 0 then
    update public.profiles
       set points_balance = points_balance + req.points_applied
     where id = req.user_id;

    insert into public.points_transactions (user_id, type, amount)
    values (req.user_id, 'admin_adjustment', req.points_applied);
  end if;

  update public.requests
     set status = 'cancelled', points_applied = 0
   where id = p_request_id
  returning * into req;

  return req;
end;
$$;

-- ============================================================
-- admin_list_users: the admin panel could only ever show a truncated
-- uuid or a display name -- profiles has no email column, and auth.users
-- is not readable from the client at all. This exposes just the email,
-- to admins only.
-- ============================================================

create or replace function public.admin_list_users()
returns table (id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Not authorized';
  end if;

  return query select u.id, u.email::text from auth.users u;
end;
$$;

revoke all on function public.admin_cancel_request(uuid) from public;
grant execute on function public.admin_cancel_request(uuid) to authenticated;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

-- ============================================================
-- Admins need to read the rest of a client's record too: the
-- points_transactions ledger (to answer "where did my balance go?")
-- and the request attachments a client uploaded. The storage policies
-- from 0003 were owner-only, which meant staff literally could not open
-- the brief a client attached to their own order.
-- ============================================================

drop policy if exists "admin_select_all_points_transactions" on public.points_transactions;
create policy "admin_select_all_points_transactions" on public.points_transactions
  for select using (public.is_current_user_admin());

drop policy if exists "request_attachments_select_admin" on storage.objects;
create policy "request_attachments_select_admin"
  on storage.objects for select
  using (
    bucket_id = 'request-attachments'
    and public.is_current_user_admin()
  );

-- ============================================================
-- Bespoke pricing for custom-scoped work. price_request() deliberately
-- overrides anything a signed-in client sends, including an admin's own
-- session -- so an admin agreeing a one-off price uses these instead.
-- Both set mmcore.allow_custom_price for their transaction only
-- (set_config's third argument is `is_local`).
-- ============================================================

create or replace function public.admin_create_custom_request(
  p_user_id uuid,
  p_service_category text,
  p_task_type text,
  p_description text,
  p_price numeric,
  p_is_recurring boolean default false
)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.requests;
begin
  if not public.is_current_user_admin() then
    raise exception 'Not authorized';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'A custom price must be zero or greater';
  end if;

  perform set_config('mmcore.allow_custom_price', 'on', true);

  insert into public.requests
    (user_id, service_category, task_type, tier, description,
     list_price, discount_rate, agreed_price, is_recurring, status)
  values
    (p_user_id, p_service_category, p_task_type, 'standard', p_description,
     p_price, 1.00, round(p_price, 2), coalesce(p_is_recurring, false), 'awaiting_payment')
  returning * into req;

  perform set_config('mmcore.allow_custom_price', 'off', true);

  return req;
end;
$$;

create or replace function public.admin_set_request_price(p_request_id uuid, p_price numeric)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.requests;
begin
  if not public.is_current_user_admin() then
    raise exception 'Not authorized';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'A custom price must be zero or greater';
  end if;

  if exists (select 1 from public.billing where request_id = p_request_id and status = 'paid') then
    raise exception 'This request has already been paid -- its price can no longer be changed';
  end if;

  update public.requests
     set list_price = p_price,
         discount_rate = 1.00,
         agreed_price = round(p_price - points_applied, 2),
         payram_payment_url = null,
         payram_reference_id = null
   where id = p_request_id
  returning * into req;

  if req is null then
    raise exception 'Request not found';
  end if;

  return req;
end;
$$;

revoke all on function public.admin_create_custom_request(uuid, text, text, text, numeric, boolean) from public;
grant execute on function public.admin_create_custom_request(uuid, text, text, text, numeric, boolean) to authenticated;

revoke all on function public.admin_set_request_price(uuid, numeric) from public;
grant execute on function public.admin_set_request_price(uuid, numeric) to authenticated;

create index if not exists requests_package_key_idx on public.requests (package_key);
create index if not exists billing_request_id_idx on public.billing (request_id);

-- ============================================================
-- get_my_referral_chain: the dashboard's Referrals view.
--
-- referral.html has always promised "a dedicated Referrals view showing
-- your direct and indirect referrals at every level". Building it
-- against the profiles table directly does not work: profiles_select_own
-- (0001) restricts SELECT to auth.uid() = id, so a client querying
-- .eq('referred_by', me) gets an empty set every time -- the view would
-- silently render "nobody has signed up with your link yet" no matter
-- how many people had.
--
-- This resolves the three levels server-side instead. It deliberately
-- does NOT return the referrals' full names or ids: a referrer has no
-- business reading another account's identity out of the API just
-- because they shared a link. A first name plus a last initial is
-- enough to recognise someone you invited, and the join date is what
-- the view actually displays.
-- ============================================================

create or replace function public.get_my_referral_chain()
returns table (level int, display_name text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return;
  end if;

  return query
  with recursive chain as (
    select p.id, p.full_name, p.created_at, 1 as lvl
      from public.profiles p
     where p.referred_by = me
    union all
    select p.id, p.full_name, p.created_at, c.lvl + 1
      from public.profiles p
      join chain c on p.referred_by = c.id
     where c.lvl < 3
  )
  select
    c.lvl,
    case
      when c.full_name is null or btrim(c.full_name) = '' then 'Member'
      when strpos(btrim(c.full_name), ' ') = 0 then btrim(c.full_name)
      else split_part(btrim(c.full_name), ' ', 1) || ' ' ||
           left(split_part(btrim(c.full_name), ' ', 2), 1) || '.'
    end,
    c.created_at
  from chain c
  order by c.lvl, c.created_at;
end;
$$;

revoke all on function public.get_my_referral_chain() from public;
grant execute on function public.get_my_referral_chain() to authenticated;
