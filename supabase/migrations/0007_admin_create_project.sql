-- Fixes a real bug found in live testing: the delivery/revision/approval
-- flow (dashboard.js gating fixed in 0006) never appeared for any client
-- because nothing anywhere -- no client code, no admin UI, no trigger --
-- ever inserted a row into public.projects. projects has no client INSERT
-- policy (by design, from 0001), and the admin panel's "All Projects"
-- table only lets staff update the status of a project that already
-- exists. With zero projects ever created, no status could ever be
-- reached, so the review/approval UI had nothing to render for. This adds
-- the missing admin-only RPC to convert a request into a project. Run
-- once via Supabase Dashboard > SQL Editor (or `supabase db push`), after
-- 0001-0006.

create or replace function public.admin_create_project_from_request(p_request_id uuid, p_project_name text)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.requests;
  proj public.projects;
begin
  if not public.is_current_user_admin() then
    raise exception 'Not authorized';
  end if;

  select * into req from public.requests where id = p_request_id;

  if req is null then
    raise exception 'Request not found';
  end if;

  if exists (select 1 from public.projects where request_id = p_request_id) then
    raise exception 'A project already exists for this request';
  end if;

  insert into public.projects (request_id, user_id, project_name, status)
  values (p_request_id, req.user_id, p_project_name, 'in_progress')
  returning * into proj;

  return proj;
end;
$$;

revoke all on function public.admin_create_project_from_request(uuid, text) from public;
grant execute on function public.admin_create_project_from_request(uuid, text) to authenticated;
