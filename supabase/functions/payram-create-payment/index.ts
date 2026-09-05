// M&MCore Agency — creates a PayRam payment link for 30% of a
// request's agreed price. Authenticated (same pattern as forge-chat):
// resolves the caller's real identity from their own session token,
// never trusts a client-supplied user id, and verifies the request
// actually belongs to them before doing anything.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAYRAM_API_KEY = Deno.env.get('PAYRAM_API_KEY')!;
const PAYRAM_BASE_URL = Deno.env.get('PAYRAM_BASE_URL')!; // e.g. https://pay.mmcore.agency

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const UPFRONT_FRACTION = 0.3;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

// See forge-chat/index.ts for the same pattern -- resolves the caller's
// real identity from their own Authorization header via a narrowly
// scoped client, rather than trusting anything the request body says.
async function resolveCaller(authHeader: string): Promise<{ id: string; email: string | null } | null> {
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
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

  const requestId = body?.requestId;
  if (typeof requestId !== 'string' || !requestId) {
    return jsonResponse({ error: 'Missing requestId' }, 400);
  }

  const { data: reqRow, error: fetchError } = await supabaseAdmin
    .from('requests')
    .select('id, user_id, status, agreed_price, payram_payment_url')
    .eq('id', requestId)
    .maybeSingle();

  // Split deliberately: a genuinely missing row (no error, just zero
  // rows) is a 404 the caller can act on ("check your requestId"). A
  // real query error -- wrong column, permissions, etc. -- is a server
  // malfunction masquerading as "not found" if left to fall through the
  // same message (this happened live: a missing migration left
  // requests.payram_payment_url undefined, and the query's 42703 error
  // was indistinguishable from "no such request" until this split).
  if (fetchError) {
    console.error('payram-create-payment: request lookup errored', { requestId, fetchError });
    return jsonResponse({ error: `Database error looking up the request: ${fetchError.message}` }, 500);
  }
  if (!reqRow) {
    return jsonResponse({ error: 'Request not found' }, 404);
  }

  if (reqRow.user_id !== caller.id) {
    return jsonResponse({ error: 'Not authorized' }, 403);
  }

  if (reqRow.status !== 'awaiting_payment') {
    return jsonResponse({ error: `Request is not awaiting payment (status: ${reqRow.status})` }, 400);
  }

  if (reqRow.agreed_price == null) {
    return jsonResponse({ error: 'This request has no agreed price yet -- contact support' }, 400);
  }

  const amountDue = roundMoney(Number(reqRow.agreed_price) * UPFRONT_FRACTION);

  // Idempotent -- a reload shouldn't spin up a second PayRam invoice for
  // the same request.
  if (reqRow.payram_payment_url) {
    return jsonResponse({ url: reqRow.payram_payment_url, amountDue });
  }

  let payramResp: Response;
  try {
    payramResp = await fetch(`${PAYRAM_BASE_URL}/api/v1/payment`, {
      method: 'POST',
      headers: {
        'API-Key': PAYRAM_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customerEmail: caller.email,
        customerID: caller.id,
        amountInUSD: amountDue,
        invoiceID: requestId
      })
    });
  } catch (err) {
    console.error('PayRam create-payment network error:', err);
    return jsonResponse({ error: 'Could not reach the payment provider. Please try again in a moment.' }, 502);
  }

  if (!payramResp.ok) {
    const text = await payramResp.text().catch(() => '');
    console.error(`PayRam create-payment failed (${payramResp.status}):`, text.slice(0, 500));
    return jsonResponse({ error: 'Could not create a payment link. Please try again in a moment.' }, 502);
  }

  const payramData = await payramResp.json().catch(() => null);
  const paymentUrl = payramData?.url;
  const referenceId = payramData?.reference_id ?? null;

  if (!paymentUrl) {
    console.error('PayRam create-payment response missing url:', JSON.stringify(payramData));
    return jsonResponse({ error: 'Payment provider returned an unexpected response.' }, 502);
  }

  await supabaseAdmin
    .from('requests')
    .update({ payram_payment_url: paymentUrl, payram_reference_id: referenceId })
    .eq('id', requestId);

  return jsonResponse({ url: paymentUrl, amountDue });
}

Deno.serve(handleRequest);
