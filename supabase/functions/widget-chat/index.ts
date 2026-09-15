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
//
// Because it IS anonymous and every 'message' call costs a real xAI
// completion, it is also the one endpoint anyone on the internet can
// loop to burn credit. The rate limit below is the cheapest useful
// defence: a per-visitor and per-IP budget, held in memory.

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

// Rate limiting. A visitorId is client-generated (localStorage) so it is
// trivially resettable -- hence the second, coarser budget keyed on the
// caller's IP, which a single abuser cannot rotate as cheaply. Both are
// in-memory: an Edge Function instance is short-lived and there may be
// several, so this is a cost ceiling per instance rather than a strict
// global guarantee. It costs nothing and stops the obvious script; a
// determined attacker needs a real WAF rule in front of the function.
const RATE_WINDOW_MS = 60_000;
const MAX_MESSAGES_PER_VISITOR_PER_WINDOW = 8;
const MAX_MESSAGES_PER_IP_PER_WINDOW = 30;

const hits = new Map<string, number[]>();

function tooManyRequests(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map can't grow without bound across a
  // long-lived instance.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (!times.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
    }
  }

  return recent.length > limit;
}

function callerIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : '').trim() || 'unknown';
}

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
    try {
      const history = await getConversationHistory(supabaseAdmin, 'widget', visitorId);
      return jsonResponse({
        messages: history.map((m) => ({ role: m.role, content: m.content }))
      });
    } catch (err) {
      console.error('widget-chat: getConversationHistory failed:', err);
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

    if (tooManyRequests(`v:${visitorId}`, MAX_MESSAGES_PER_VISITOR_PER_WINDOW) ||
        tooManyRequests(`ip:${callerIp(req)}`, MAX_MESSAGES_PER_IP_PER_WINDOW)) {
      return jsonResponse({
        error: "You're sending messages faster than I can answer. Give it a moment, or message us on Telegram at t.me/mmcore_support."
      }, 429);
    }

    try {
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
    } catch (err) {
      console.error('widget-chat: handleIncomingMessage failed:', err);
      return jsonResponse({ error: 'Something went wrong on our end. Please try again in a moment.' }, 500);
    }
  }

  return jsonResponse({ error: 'Unknown action -- expected "message" or "history"' }, 400);
}

Deno.serve(handleRequest);
