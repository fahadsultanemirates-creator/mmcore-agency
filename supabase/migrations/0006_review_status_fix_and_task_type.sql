-- Fixes a real bug found in live testing: the review/approval RPCs from
-- 0004 only accepted 'delivered' as a starting status, but the schema
-- also has 'awaiting_review' (labeled "Awaiting your review" in the
-- dashboard) with no action ever wired to it. If a project sat in
-- 'awaiting_review' instead of 'delivered', the client-side review UI
-- never had anything to trigger from. Both statuses are now treated as
-- equivalent "ready for client review" states.
--
-- Also adds requests.task_type, so the consolidated New Request wizard
-- can record which specific catalog item was requested (not just the
-- broader service_category) without parsing it out of free-text
-- description. Run once via Supabase Dashboard > SQL Editor (or
-- `supabase db push`), after 0001-0005.

alter table public.requests
  add column if not exists task_type text;

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

  if proj.status not in ('delivered', 'awaiting_review') then
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

  remaining_amount := round(req.agreed_price * 0.70, 2);

  update public.projects set status = 'approved' where id = p_project_id
  returning * into proj;

  insert into public.billing (user_id, project_id, amount, payment_type, status)
  values (proj.user_id, proj.id, remaining_amount, 'milestone', 'pending');

  return proj;
end;
$$;
