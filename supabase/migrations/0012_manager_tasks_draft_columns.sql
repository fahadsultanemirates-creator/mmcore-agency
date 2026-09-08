-- Adds the two columns the owner-only task manager (telegram-webhook's
-- /status, /approve, /reject, and inline draft-patch commands) needs:
-- draft_text holds the generated first draft (and any patched
-- revisions), owner_notes is reserved for a future slice -- nothing in
-- this slice writes to it yet.
--
-- Mirrors agenticcore-agency's 0012_manager_tasks_draft_columns.sql.

alter table public.manager_tasks add column if not exists draft_text text;
alter table public.manager_tasks add column if not exists owner_notes text;
