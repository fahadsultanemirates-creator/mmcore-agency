// M&MCore Agency — shared front-desk bot logic, used by both the
// homepage widget and Telegram Edge Functions. Channel-agnostic on
// purpose: it takes plain text in, returns plain text out, and knows
// nothing about HTTP requests or Telegram updates. That split is also
// what keeps a future voice layer (STT before this, TTS after) from
// requiring a rewrite -- it would wrap this function, not replace it.

import { BUSINESS_KNOWLEDGE_PROMPT } from './business-knowledge.ts';

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

export type Channel = 'widget' | 'telegram';

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
  openRouterApiKey: string;
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

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-5';
const HISTORY_LIMIT = 30;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_USER_MESSAGES = 20;

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

async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[]
): Promise<ParsedReply> {
  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://mmcore.agency',
      'X-Title': 'M&MCore Front-Desk Bot'
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_schema', json_schema: REPLY_JSON_SCHEMA },
      temperature: 0.4
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`OpenRouter request failed (${resp.status}): ${text.slice(0, 500)}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter response missing message content');
  return JSON.parse(content) as ParsedReply;
}

export async function handleIncomingMessage(params: HandleMessageParams): Promise<HandleMessageResult> {
  const { supabaseAdmin, channel, externalId, userMessage, openRouterApiKey, model, languageHint } = params;

  const conversation = await findOrCreateConversation(supabaseAdmin, channel, externalId);

  if (await isRateLimited(supabaseAdmin, conversation.id)) {
    return { reply: RATE_LIMIT_MESSAGE, needsHuman: false, rateLimited: true };
  }

  const history = await getRecentMessages(supabaseAdmin, conversation.id);

  const systemPrompt = languageHint
    ? `${BUSINESS_KNOWLEDGE_PROMPT}\n\n(Platform hint, not a rule: this visitor's device/client language looks like "${languageHint}". Use it only if their own message gives you no better signal -- their actual words always win.)`
    : BUSINESS_KNOWLEDGE_PROMPT;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];

  let parsed: ParsedReply;
  try {
    parsed = await callOpenRouter(openRouterApiKey, model || DEFAULT_MODEL, messages);
  } catch (err) {
    console.error('OpenRouter call failed:', err);
    return { reply: GENERIC_ERROR_MESSAGE, needsHuman: false };
  }

  const needsHuman = Boolean(parsed.needs_human);
  const uncertain = Boolean(parsed.uncertain);

  await supabaseAdmin.from('bot_messages').insert([
    {
      conversation_id: conversation.id,
      role: 'user',
      content: userMessage,
      detected_language: parsed.detected_language || null
    },
    {
      conversation_id: conversation.id,
      role: 'assistant',
      content: parsed.reply,
      detected_language: parsed.detected_language || null,
      uncertain,
      handoff_triggered: needsHuman
    }
  ]);

  await supabaseAdmin
    .from('bot_conversations')
    .update({
      language: parsed.detected_language || conversation.language,
      needs_human: conversation.needs_human || needsHuman
    })
    .eq('id', conversation.id);

  return { reply: parsed.reply, needsHuman };
}
