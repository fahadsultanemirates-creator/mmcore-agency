-- Persistent memory + logging for the AI front-desk bots (homepage widget
-- and Telegram). Backs a Supabase Edge Function-only access pattern:
-- nothing browser-side ever queries these tables directly (unlike
-- profiles/requests/projects/billing), so unlike those tables this one
-- gets RLS enabled with zero policies for anon/authenticated -- every
-- read/write goes through an Edge Function using the service_role key,
-- which bypasses RLS by design. Run once via Supabase Dashboard > SQL
-- Editor (or `supabase db push`), after 0001-0007.

-- ============================================================
-- bot_conversations: one row per (channel, external_id) pair.
-- external_id is the widget's localStorage-generated visitor_id for
-- 'widget', or the Telegram chat_id (as text) for 'telegram'. user_id is
-- nullable and unused for now -- reserved for if/when a channel can
-- identify a logged-in dashboard user, not populated by this phase.
-- needs_human is sticky (set true once, left true) so a later review
-- pass can filter "conversations that ever needed a human" rather than
-- just the current turn.
-- ============================================================

create table public.bot_conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('widget', 'telegram')),
  external_id text not null,
  user_id uuid references public.profiles(id) on delete set null,
  language text,
  needs_human boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_id)
);

create trigger set_bot_conversations_updated_at
before update on public.bot_conversations
for each row execute function public.set_updated_at();

-- ============================================================
-- bot_messages: full transcript, flagged per-message for later review.
-- uncertain/handoff_triggered are set by the model's own structured
-- output (see supabase/functions/_shared/bot-core.ts), not inferred
-- after the fact.
-- ============================================================

create table public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.bot_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  detected_language text,
  uncertain boolean not null default false,
  handoff_triggered boolean not null default false,
  created_at timestamptz not null default now()
);

create index on public.bot_messages (conversation_id, created_at);
create index on public.bot_messages (uncertain) where uncertain;
create index on public.bot_messages (handoff_triggered) where handoff_triggered;

alter table public.bot_conversations enable row level security;
alter table public.bot_messages enable row level security;
-- No policies: anon/authenticated get zero access. Only service_role
-- (used exclusively by the Edge Functions) can read/write these tables.
