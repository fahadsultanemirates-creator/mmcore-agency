// M&MCore Agency — "Mint", the dashboard's own project-intake assistant.
// M&MCore's name for what agenticcore-agency calls "Forge". Same brain
// as the Telegram manager bot (handleIncomingMessage on the 'mint'
// channel in ../_shared/bot-core.ts -- xAI's Grok, the same
// manager-task-filing judgment), just reached from inside the dashboard
// by an already-signed-in client instead of from Telegram.
//
// Unlike the anonymous widget-chat, this requires a real session:
// resolves the caller's identity from their own Authorization header via
// a narrowly-scoped client (same pattern as payram-create-payment),
// rejecting with 401 if not logged in. That resolved user id is the
// conversation's external_id -- never a client-supplied value -- so
// persistent memory across visits falls out of the existing schema for
// free, same as Telegram and the widget.
//
// Ported from agenticcore-agency's forge-chat/index.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleIncomingMessage, getConversationHistory } from '../_shared/bot-core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const XAI_API_KEY = Deno.env.get('XAI_API_KEY')!;
const XAI_MODEL = Deno.env.get('XAI_MODEL') || undefined;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const MAX_MESSAGE_LENGTH = 4000;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

// Same pattern as payram-create-payment/index.ts -- resolves the
// caller's real identity from their own Authorization header via a
// narrowly scoped client, rather than trusting anything the request
// body says.
async function resolveCaller(authHeader: string): Promise<{ id: string } | null> {
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const caller = await resolveCaller(authHeader);
  if (!caller) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { action, message } = body || {};

  if (action === 'history') {
    try {
      const history = await getConversationHistory(supabaseAdmin, 'mint', caller.id);
      return jsonResponse({
        messages: history.map((m) => ({ role: m.role, content: m.content }))
      });
    } catch (err) {
      console.error('mint-chat: getConversationHistory failed:', err);
      return jsonResponse({ error: 'Failed to load conversation history' }, 500);
    }
  }

  if (action === 'message') {
    if (typeof message !== 'string' || message.trim() === '') {
      return jsonResponse({ error: 'Missing message' }, 400);
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonResponse({ error: 'Message too long' }, 400);
    }

    // findOrCreateConversation (inside handleIncomingMessage) isn't
    // wrapped in bot-core's own try/catch the way the xAI call is -- a
    // real DB error here (e.g. a channel check-constraint violation)
    // must not surface as an unhandled exception, so it's caught here
    // instead, logged, and returned as a normal JSON error response.
    try {
      const result = await handleIncomingMessage({
        supabaseAdmin,
        channel: 'mint',
        externalId: caller.id,
        userMessage: message,
        xaiApiKey: XAI_API_KEY,
        model: XAI_MODEL
      });

      return jsonResponse({ reply: result.reply, needsHuman: result.needsHuman });
    } catch (err) {
      console.error('mint-chat: handleIncomingMessage failed:', err);
      return jsonResponse({ error: 'Something went wrong on our end. Please try again in a moment.' }, 500);
    }
  }

  return jsonResponse({ error: 'Unknown action -- expected "message" or "history"' }, 400);
}

Deno.serve(handleRequest);
