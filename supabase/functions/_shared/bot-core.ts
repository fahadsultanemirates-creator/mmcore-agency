// M&MCore Agency — shared front-desk bot logic, used by the homepage
// widget, Telegram, and the dashboard's own "Mint" project-intake
// assistant. Channel-agnostic on purpose: it takes plain text in,
// returns plain text out, and knows nothing about HTTP requests or
// Telegram updates. That split is also what keeps a future voice layer
// (STT before this, TTS after) from requiring a rewrite -- it would
// wrap this function, not replace it.
//
// Unlike agenticcore-agency's version of this file (which keeps the
// widget channel on OpenRouter and only moves telegram/forge to xAI),
// M&MCore runs all three channels on xAI's Grok -- a deliberate choice
// (Grok is already the API used for image/video generation elsewhere,
// so standardizing avoids juggling two provider keys for one bot). The
// channels still diverge on how much structure the reply carries:
// widget keeps the original 4-field JSON (no task-filing -- an
// anonymous visitor shouldn't be able to file a manager task), while
// telegram and 'mint' (the dashboard's own assistant, M&MCore's name for
// what agenticcore-agency calls "Forge") both use the expanded 7-field
// JSON that can additionally file a manager_tasks row.

import { BUSINESS_KNOWLEDGE_PROMPT } from './business-knowledge.ts';

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

export type Channel = 'widget' | 'telegram' | 'mint';

export interface BotConversation {
  id: string;
  channel: Channel;
  external_id: string;
  language: string | null;
  needs_human: boolean;
  created_at: string;
  updated_at: string;
}

export interface BotMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export interface HandleMessageParams {
  supabaseAdmin: SupabaseAdmin;
  channel: Channel;
  externalId: string;
  userMessage: string;
  xaiApiKey: string;
  // Model override -- interpreted as an xAI model id.
  model?: string;
  // Optional signal from the transport layer (Telegram's per-user
  // language_code, or the browser's navigator.language) -- not a
  // default, just an extra hint appended to the system prompt so the
  // model has something to go on before the visitor's own words give it
  // away (e.g. the very first "/start" on Telegram).
  languageHint?: string;
}

export interface HandleMessageResult {
  reply: string;
  needsHuman: boolean;
  rateLimited?: boolean;
}

const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_XAI_MODEL = 'grok-4-1';

const HISTORY_LIMIT = 30;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_USER_MESSAGES = 20;

// manager_tasks id scheme: "AC-MMCORE-0001" -- brand prefix + a count of
// existing rows for that brand, zero-padded to 4 digits. No Postgres
// sequence; see createManagerTask() below for how the count-then-insert
// race is handled without one.
const TASK_BRAND = 'mmcore';
const TASK_ID_PREFIX = 'AC-MMCORE';
const MAX_TASK_ID_ATTEMPTS = 3;

// These two strings are the only bot-authored text that isn't produced
// by the model itself -- rare system-level fallbacks (an actual outage,
// or someone hammering the endpoint), not the bot "defaulting to
// English" in normal conversation. Kept in English deliberately: they're
// infrastructure fallbacks outside the per-message language-mirroring
// the model otherwise always does.
const RATE_LIMIT_MESSAGE =
  "You're sending messages a bit too quickly — please wait a few minutes and try again.";
const GENERIC_ERROR_MESSAGE =
  'Something went wrong on our end. Please try again in a moment, or reach out directly: https://t.me/mmcore_managers';

// Additive context for the 'mint' channel only, appended on top of the
// same BUSINESS_KNOWLEDGE_PROMPT every channel shares -- not a
// replacement persona, just the extra framing Telegram doesn't need
// (whoever's writing is already a signed-in client, not an anonymous
// visitor, and the dashboard has no "/start" message to hang a greeting
// off of the way Telegram does).
const MINT_ADDITIVE_PROMPT = `You're "Mint", embedded directly in the client's own dashboard (not Telegram or the public homepage) -- whoever is writing is already a signed-in client, not an anonymous visitor. If the conversation history above is empty, this is the very first thing they've said to you here: open with a short, warm welcome and invite them to describe a project they'd like to start, rather than diving straight into an answer. If they want to start one, guide them through describing it one step at a time (service, scope, budget expectations, any specifics) rather than demanding everything at once, until you have enough to file it as a task for the team -- same create_task/task_title/task_type judgment you'd use anywhere else.`;

export async function findOrCreateConversation(
  supabaseAdmin: SupabaseAdmin,
  channel: Channel,
  externalId: string
): Promise<BotConversation> {
  const { data: existing } = await supabaseAdmin
    .from('bot_conversations')
    .select('*')
    .eq('channel', channel)
    .eq('external_id', externalId)
    .maybeSingle();

  if (existing) return existing as BotConversation;

  const { data: created, error } = await supabaseAdmin
    .from('bot_conversations')
    .insert({ channel, external_id: externalId })
    .select('*')
    .single();

  if (error) throw error;
  return created as BotConversation;
}

export async function getRecentMessages(
  supabaseAdmin: SupabaseAdmin,
  conversationId: string,
  limit = HISTORY_LIMIT
): Promise<BotMessage[]> {
  const { data } = await supabaseAdmin
    .from('bot_messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return ((data as BotMessage[]) || []).reverse();
}

export async function getConversationHistory(
  supabaseAdmin: SupabaseAdmin,
  channel: Channel,
  externalId: string,
  limit = HISTORY_LIMIT
): Promise<BotMessage[]> {
  const { data: conversation } = await supabaseAdmin
    .from('bot_conversations')
    .select('id')
    .eq('channel', channel)
    .eq('external_id', externalId)
    .maybeSingle();

  if (!conversation) return [];
  return getRecentMessages(supabaseAdmin, conversation.id, limit);
}

async function isRateLimited(supabaseAdmin: SupabaseAdmin, conversationId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from('bot_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .gte('created_at', windowStart);

  return (count || 0) >= RATE_LIMIT_MAX_USER_MESSAGES;
}

const REPLY_JSON_SCHEMA = {
  name: 'mmcore_bot_reply',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description: "The reply to send to the visitor, written entirely in the visitor's own language."
      },
      detected_language: {
        type: 'string',
        description: 'ISO 639-1 code (or best-guess language name) of the language the visitor wrote in.'
      },
      needs_human: {
        type: 'boolean',
        description:
          'True if this conversation should be handed off to a human -- custom/large scope, price/scope negotiation, signs of frustration, or any commitment beyond pre-approved terms.'
      },
      uncertain: {
        type: 'boolean',
        description: 'True if the assistant is not confident in the reply, or the question falls outside the given business knowledge.'
      }
    },
    required: ['reply', 'detected_language', 'needs_human', 'uncertain'],
    additionalProperties: false
  }
};

interface ParsedReply {
  reply: string;
  detected_language: string;
  needs_human: boolean;
  uncertain: boolean;
}

// Telegram/Mint-only: adds create_task/task_title/task_type on top of
// the base reply shape. task_title/task_type are always strings (empty
// when create_task is false) rather than nullable, since strict
// json_schema mode across providers handles a plain required string more
// reliably than a nullable union.
const MANAGER_REPLY_JSON_SCHEMA = {
  name: 'mmcore_manager_bot_reply',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description: "The reply to send, written entirely in the sender's own language."
      },
      detected_language: {
        type: 'string',
        description: 'ISO 639-1 code (or best-guess language name) of the language the sender wrote in.'
      },
      needs_human: {
        type: 'boolean',
        description:
          'True if this conversation should be handed off to a human -- custom/large scope, price/scope negotiation, signs of frustration, or any commitment beyond pre-approved terms.'
      },
      uncertain: {
        type: 'boolean',
        description: 'True if the assistant is not confident in the reply, or the question falls outside the given business knowledge.'
      },
      create_task: {
        type: 'boolean',
        description:
          'True if this conversation describes concrete work the manager should personally track and follow up on (a project inquiry, a specific complaint, a request needing manual verification, anything already flagged as needing human handoff). False for ordinary questions you can already answer.'
      },
      task_title: {
        type: 'string',
        description: 'Short (few-word) title summarizing the task. Empty string if create_task is false.'
      },
      task_type: {
        type: 'string',
        description: 'Short category for the task, e.g. "website", "design", "marketing", "bug", "general". Empty string if create_task is false.'
      }
    },
    required: ['reply', 'detected_language', 'needs_human', 'uncertain', 'create_task', 'task_title', 'task_type'],
    additionalProperties: false
  }
};

interface ManagerParsedReply extends ParsedReply {
  create_task: boolean;
  task_title: string;
  task_type: string;
}

async function callXai(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  schema: typeof REPLY_JSON_SCHEMA | typeof MANAGER_REPLY_JSON_SCHEMA
): Promise<ParsedReply | ManagerParsedReply> {
  const resp = await fetch(XAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_schema', json_schema: schema },
      temperature: 0.4
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`xAI request failed (${resp.status}): ${text.slice(0, 500)}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('xAI response missing message content');
  return JSON.parse(content);
}

// Count-then-insert, exactly as specified (no Postgres sequence): count
// existing rows for this brand, propose brand-1, pad to 4 digits. Two
// messages arriving close together could compute the same count, so this
// retries on a unique-violation against public_id's unique constraint
// (the actual race guard) rather than trusting the count alone.
async function createManagerTask(
  supabaseAdmin: SupabaseAdmin,
  params: { channel: Channel; externalId: string; title: string; taskType: string }
): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_TASK_ID_ATTEMPTS; attempt++) {
    const { count, error: countError } = await supabaseAdmin
      .from('manager_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('brand', TASK_BRAND);

    if (countError) throw countError;

    const publicId = `${TASK_ID_PREFIX}-${String((count || 0) + 1).padStart(4, '0')}`;

    const { error: insertError } = await supabaseAdmin.from('manager_tasks').insert({
      public_id: publicId,
      brand: TASK_BRAND,
      channel: params.channel,
      external_id: params.externalId,
      title: params.title,
      task_type: params.taskType,
      status: 'waiting_you'
    });

    if (!insertError) return publicId;

    // 23505 = unique_violation on public_id -- another message raced on
    // the same count-based id. Recompute and retry; anything else is a
    // real error worth surfacing immediately.
    if (insertError.code !== '23505') throw insertError;
    lastError = insertError;
  }

  throw lastError ?? new Error('Could not allocate a unique manager task id after retries');
}

export async function handleIncomingMessage(params: HandleMessageParams): Promise<HandleMessageResult> {
  const { supabaseAdmin, channel, externalId, userMessage, xaiApiKey, model, languageHint } = params;

  const conversation = await findOrCreateConversation(supabaseAdmin, channel, externalId);

  if (await isRateLimited(supabaseAdmin, conversation.id)) {
    return { reply: RATE_LIMIT_MESSAGE, needsHuman: false, rateLimited: true };
  }

  const history = await getRecentMessages(supabaseAdmin, conversation.id);

  let systemPrompt = BUSINESS_KNOWLEDGE_PROMPT;
  if (languageHint) {
    systemPrompt += `\n\n(Platform hint, not a rule: this visitor's device/client language looks like "${languageHint}". Use it only if their own message gives you no better signal -- their actual words always win.)`;
  }
  if (channel === 'mint') {
    systemPrompt += `\n\n${MINT_ADDITIVE_PROMPT}`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];

  const isManagerChannel = channel === 'telegram' || channel === 'mint';
  const schema = isManagerChannel ? MANAGER_REPLY_JSON_SCHEMA : REPLY_JSON_SCHEMA;

  let reply: string;
  let detectedLanguage: string;
  let needsHuman: boolean;
  let uncertain: boolean;

  let parsed: ParsedReply | ManagerParsedReply;
  try {
    parsed = await callXai(xaiApiKey, model || DEFAULT_XAI_MODEL, messages, schema);
  } catch (err) {
    console.error('xAI call failed:', err);
    return { reply: GENERIC_ERROR_MESSAGE, needsHuman: false };
  }

  detectedLanguage = parsed.detected_language;
  needsHuman = Boolean(parsed.needs_human);
  uncertain = Boolean(parsed.uncertain);
  reply = parsed.reply;

  if (isManagerChannel && (parsed as ManagerParsedReply).create_task) {
    const managerParsed = parsed as ManagerParsedReply;
    try {
      const publicId = await createManagerTask(supabaseAdmin, {
        channel,
        externalId,
        title: managerParsed.task_title || 'Untitled task',
        taskType: managerParsed.task_type || 'general'
      });
      reply = `${reply}\n\nTask ID: ${publicId}`;
    } catch (err) {
      // A task-filing failure must not break the reply itself -- the
      // conversation still gets a normal answer, just without a task
      // filed. Logged so it's visible in the function's logs rather
      // than silently lost.
      console.error('createManagerTask failed:', err);
    }
  }

  await supabaseAdmin.from('bot_messages').insert([
    {
      conversation_id: conversation.id,
      role: 'user',
      content: userMessage,
      detected_language: detectedLanguage || null
    },
    {
      conversation_id: conversation.id,
      role: 'assistant',
      content: reply,
      detected_language: detectedLanguage || null,
      uncertain,
      handoff_triggered: needsHuman
    }
  ]);

  await supabaseAdmin
    .from('bot_conversations')
    .update({
      language: detectedLanguage || conversation.language,
      needs_human: conversation.needs_human || needsHuman
    })
    .eq('id', conversation.id);

  return { reply, needsHuman };
}
