// M&MCore Agency — homepage chat widget backend. Thin wrapper around
// the same handleIncomingMessage() core the Telegram bot uses, so the
// pre-signup homepage widget is not a downgraded version of the
// Telegram bot -- same model, same knowledge, same handoff judgment.
//
// Auth: called with the existing publishable anon key as a Bearer token
// (the same key already embedded in supabase-client.js) -- Supabase's
// platform-level JWT verification on Edge Functions accepts that as-is,
// so there's no custom auth check needed here. This endpoint is reached
// by anonymous, pre-signup visitors by design.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleIncomingMessage, getConversationHistory } from '../_shared/bot-core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const XAI_API_KEY = Deno.env.get('XAI_API_KEY')!;
const XAI_MODEL = Deno.env.get('XAI_MODEL') || undefined;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const MAX_VISITOR_ID_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 4000;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

function isValidVisitorId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= MAX_VISITOR_ID_LENGTH;
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { visitorId, action, message, languageHint } = body || {};

  if (!isValidVisitorId(visitorId)) {
    return jsonResponse({ error: 'Missing or invalid visitorId' }, 400);
  }

  if (action === 'history') {
    const history = await getConversationHistory(supabaseAdmin, 'widget', visitorId);
    return jsonResponse({
      messages: history.map((m) => ({ role: m.role, content: m.content }))
    });
  }

  if (action === 'message') {
    if (typeof message !== 'string' || message.trim() === '') {
      return jsonResponse({ error: 'Missing message' }, 400);
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonResponse({ error: 'Message too long' }, 400);
    }

    const result = await handleIncomingMessage({
      supabaseAdmin,
      channel: 'widget',
      externalId: visitorId,
      userMessage: message,
      xaiApiKey: XAI_API_KEY,
      model: XAI_MODEL,
      languageHint: typeof languageHint === 'string' ? languageHint : undefined
    });

    return jsonResponse({ reply: result.reply, needsHuman: result.needsHuman });
  }

  return jsonResponse({ error: 'Unknown action -- expected "message" or "history"' }, 400);
}

Deno.serve(handleRequest);
