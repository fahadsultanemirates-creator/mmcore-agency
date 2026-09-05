-- Project delivery/revision/approval flow. Run once via Supabase
-- Dashboard > SQL Editor (or `supabase db push`), after 0001-0003.
--
-- projects has no client UPDATE policy (by design, from 0001) --
-- status changes are backend-only. Rather than opening a broad UPDATE
-- policy (which a client could abuse to set any status or bypass the
-- revisions cap), this adds two narrow SECURITY DEFINER RPC functions
-- that each enforce ownership, the current-status precondition, and
-- (for revisions) the 2-revision cap server-side, atomically.

-- ============================================================
-- projects.status: add 'approved' -- the state after a client
-- approves delivered work and before final (70%) payment clears.
-- 'delivered' now specifically means "shown for review, not yet
-- handed over", matching terms.html's existing review-before-handover
-- policy.
-- ============================================================

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('in_progress', 'awaiting_review', 'revision_requested', 'delivered', 'approved'));

-- ============================================================
-- request_project_revision: the project owner spends one of their
-- (max 2) free revisions. Only valid from 'delivered'.
-- ============================================================

create or replace function public.request_project_revision(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
begin
  select * into proj from public.projects where id = p_project_id;

  if proj is null then
    raise exception 'Project not found';
  end if;

  if proj.user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  if proj.status <> 'delivered' then
    raise exception 'Revisions can only be requested while a project is awaiting your review';
  end if;

  if proj.revisions_used >= 2 then
    raise exception 'No free revisions remaining -- further changes are billed separately';
  end if;

  update public.projects
  set status = 'revision_requested', revisions_used = revisions_used + 1
  where id = p_project_id
  returning * into proj;

  return proj;
end;
$$;

-- ============================================================
-- approve_project_delivery: the project owner approves delivered
-- work. Transitions to 'approved' and creates the remaining-70%
-- billing row (status 'pending') -- the 30% upfront row already
-- exists from when the project was confirmed/started. An admin later
-- marks that row 'paid' once payment is actually collected, which
-- fires the existing total_spend/points/Business Pool trigger logic
-- from 0001/0002 automatically.
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

  if proj.status <> 'delivered' then
    raise exception 'Only a delivered project can be approved';
  end if;

  select * into req from public.requests where id = proj.request_id;

  if req.agreed_price is null then
    raise exception 'No agreed price on file for this project -- contact support';
  end if;

  remaining_amount := round(req.agreed_price * 0.70, 2);

  update public.projects set status = 'approved' where id = p_project_id
  returning * into proj;

  insert into public.billing (user_id, project_id, amount, payment_type, status)
  values (proj.user_id, proj.id, remaining_amount, 'milestone', 'pending');

  return proj;
end;
$$;

revoke all on function public.request_project_revision(uuid) from public;
grant execute on function public.request_project_revision(uuid) to authenticated;

revoke all on function public.approve_project_delivery(uuid) from public;
grant execute on function public.approve_project_delivery(uuid) to authenticated;
