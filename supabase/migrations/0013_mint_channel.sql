-- Widens bot_conversations.channel to accept 'mint' -- the dashboard's
-- own project-intake assistant, reusing the exact same
-- handleIncomingMessage()/xAI/manager_tasks pipeline as the Telegram
-- bot (see bot-core.ts). external_id for a 'mint' conversation is the
-- authenticated user's own id, resolved server-side from their session
-- in mint-chat/index.ts, never client-supplied -- so persistent memory
-- across visits falls out of the existing schema for free, same as the
-- other two channels.
--
-- "Mint" is M&MCore's own name for what AgenticCore Agency calls
-- "Forge" (agenticcore-agency's 0013_forge_channel.sql) -- same brain
-- and pipeline, brand-appropriate name, chosen since the user asked for
-- "forje but with some different name" for M&MCore. Easy to rename
-- later; only this constraint and the channel literal in mint-chat's
-- Edge Function need to change if so.

alter table public.bot_conversations drop constraint if exists bot_conversations_channel_check;
alter table public.bot_conversations add constraint bot_conversations_channel_check
  check (channel in ('widget', 'telegram', 'mint'));
