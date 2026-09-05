-- File/image attachments on New Request: a private storage bucket plus
-- RLS scoping uploads/reads to their own folder, and a column on requests
-- to record the uploaded file's path. Run once via Supabase Dashboard >
-- SQL Editor (or `supabase db push`), after 0001 and 0002.

-- ============================================================
-- Bucket: request-attachments (private -- not publicly readable;
-- access is granted per-object via the RLS policies below, so files
-- are only reachable by their owner through an authenticated client).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('request-attachments', 'request-attachments', false)
on conflict (id) do nothing;

-- ============================================================
-- requests.attachment_path: records the uploaded object's path
-- (e.g. "<user_id>/<timestamp>-<filename>") once a file is attached.
-- ============================================================

alter table public.requests
  add column if not exists attachment_path text;

-- ============================================================
-- Storage RLS: users may only upload to, read, and delete objects
-- inside their own "<user_id>/..." folder in this bucket. The path
-- convention (first path segment = auth.uid()) is enforced here, not
-- just assumed client-side -- a client that tried to upload under a
-- different user's folder would be rejected by this policy.
--
-- No "alter table storage.objects enable row level security" here:
-- Supabase enables RLS on storage.objects by default in every
-- project, and storage.objects is owned by the internal
-- supabase_storage_admin role rather than the role a SQL Editor
-- session runs as, so re-issuing that ALTER TABLE fails with
-- "must be owner of table objects". CREATE POLICY itself doesn't
-- require ownership -- Supabase grants that separately -- so the
-- policies below still work without it.
-- ============================================================

create policy "request_attachments_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'request-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "request_attachments_select_own"
  on storage.objects for select
  using (
    bucket_id = 'request-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "request_attachments_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'request-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
