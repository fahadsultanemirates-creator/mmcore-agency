-- manager_tasks: lightweight task queue filed by the Telegram bot
-- (see supabase/functions/_shared/bot-core.ts's createManagerTask) when
-- a conversation describes something the account owner should
-- personally follow up on. public_id (e.g. "AC-MMCORE-0001") is
-- generated in code, not by a Postgres sequence: count existing rows
-- for the brand, add one, pad to 4 digits.
--
-- Mirrors agenticcore-agency's 0011_manager_tasks.sql exactly, with the
-- brand default switched to 'mmcore'.

create table if not exists public.manager_tasks (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  brand text not null default 'mmcore',
  channel text not null default 'telegram',
  external_id text,
  title text not null,
  task_type text not null default 'general',
  brief text,
  status text not null default 'waiting_you'
    check (status in ('new', 'scoped', 'waiting_you', 'building', 'review', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.manager_tasks enable row level security;
-- No policies: same access pattern as bot_conversations/bot_messages --
-- only service_role (used exclusively by the Edge Functions) can
-- read/write this table. The Telegram bot is the only client.
