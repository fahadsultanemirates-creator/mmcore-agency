// M&MCore Agency — receives PayRam's payment-confirmed webhook.
// Adapted from AgenticCore Agency's proven payram-webhook function (same
// signature scheme, same idempotency ordering) -- only env var names
// and M&MCore's own schema differ.
//
// Public endpoint (server-to-server, no Supabase JWT -- verify_jwt =
// false in supabase/config.toml). Two ways in are trusted:
//   1. PayRam itself, verified via the X-Payram-Signature header
//      (HMAC-SHA256 of the *raw* body, keyed with the same project API
//      key used to create payments -- PayRam has no separate webhook
//      signing secret).
//   2. .agency's shared PayRam relay: since M&MCore reuses .agency's
//      PayRam project/keys (one shared wallet -- see
//      payram-create-payment's header comment), PayRam's own webhook
//      only ever reaches .agency's endpoint, which strips the
//      "mmcore-" invoiceID prefix and re-dispatches M&MCore's events
//      here. Those calls carry X-Internal-Relay-Secret instead of a
//      PayRam signature -- if it matches INTERNAL_RELAY_SECRET, the
//      payload is treated as pre-verified and PayRam's own signature
//      check is skipped for that request only. Everything after
//      authentication -- parsing, idempotency, the requests/billing
//      writes -- is identical either way.
//
// invoice_id in the relayed payload still carries the "mmcore-" prefix
// (the relay forwards the raw body unmodified) -- it is stripped here,
// before the local requests.id lookup, since that column is a plain
// uuid and would never match the prefixed string.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAYRAM_API_KEY = Deno.env.get('PAYRAM_API_KEY')!;
const INTERNAL_RELAY_SECRET = Deno.env.get('INTERNAL_RELAY_SECRET') || undefined;
const MMCORE_INVOICE_PREFIX = 'mmcore-';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Only these move a request forward. OPEN/PARTIALLY_FILLED/CANCELLED
// just ack 200 with no state change.
const CONFIRMING_STATUSES = new Set(['FILLED', 'OVER_FILLED']);

async function computeHmacSha256Hex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Read the raw body first -- signature verification must be against
  // the exact bytes PayRam sent, before any JSON parsing.
  const rawBody = await req.text();

  const relaySecretHeader = req.headers.get('X-Internal-Relay-Secret');
  const isVerifiedRelay = Boolean(INTERNAL_RELAY_SECRET) && Boolean(relaySecretHeader) && constantTimeEqual(relaySecretHeader!, INTERNAL_RELAY_SECRET!);

  if (!isVerifiedRelay) {
    const signatureHeader = req.headers.get('X-Payram-Signature');
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return new Response('Unauthorized', { status: 401 });
    }

    const expectedHex = await computeHmacSha256Hex(PAYRAM_API_KEY, rawBody);
    const providedHex = signatureHeader.slice('sha256='.length);

    if (!constantTimeEqual(providedHex, expectedHex)) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const rawInvoiceId = payload?.invoice_id;
  const status = payload?.status;

  if (!rawInvoiceId || typeof rawInvoiceId !== 'string') {
    return new Response('ok');
  }

  // Strip the "mmcore-" prefix before using this as a local requests.id
  // lookup -- PayRam's own invoice_id (and the relayed payload, which is
  // forwarded unmodified) still carries it, but requests.id is a plain
  // uuid column that would never match the prefixed string.
  const invoiceId = rawInvoiceId.startsWith(MMCORE_INVOICE_PREFIX)
    ? rawInvoiceId.slice(MMCORE_INVOICE_PREFIX.length)
    : rawInvoiceId;

  if (!CONFIRMING_STATUSES.has(status)) {
    return new Response('ok');
  }

  const { data: request, error: fetchError } = await supabaseAdmin
    .from('requests')
    .select('id, user_id, status')
    .eq('id', invoiceId)
    .maybeSingle();

  // A genuine query error must NOT return 200 -- PayRam won't retry a
  // 200, so a real server error disguised as "ok" would silently lose
  // the confirmation for good. Only a truly missing request (no error,
  // zero rows) acks 200 with no further action.
  if (fetchError) {
    console.error('payram-webhook: request lookup errored', { invoiceId, fetchError });
    return new Response('Database error', { status: 500 });
  }
  if (!request) {
    console.error('payram-webhook: no request found for invoice_id', invoiceId);
    return new Response('ok');
  }

  // Idempotent -- a retried webhook for an already-confirmed request
  // must not insert a second billing row.
  if (request.status === 'confirmed') {
    return new Response('ok');
  }

  const filledAmount = Number(payload?.filled_amount_in_usd ?? payload?.amount ?? 0);

  // Insert the billing row before flipping status, not after: the
  // idempotency check above gates on status = 'confirmed', so if status
  // flipped first and the insert then failed, a retry would hit that
  // gate and skip the insert forever, marking the request paid with no
  // billing record. This order keeps a retry able to complete the insert
  // if the first attempt only got partway -- but that same ordering means
  // a retry landing between a successful insert and a failed status
  // update would otherwise insert a second billing row, so check for one
  // first rather than inserting unconditionally.
  const { data: existingBilling, error: existingBillingError } = await supabaseAdmin
    .from('billing')
    .select('id')
    .eq('request_id', request.id)
    .maybeSingle();

  if (existingBillingError) {
    console.error('payram-webhook: existing-billing lookup errored', { invoiceId, existingBillingError });
    return new Response('Database error', { status: 500 });
  }

  if (!existingBilling) {
    const { error: insertError } = await supabaseAdmin.from('billing').insert({
      user_id: request.user_id,
      request_id: request.id,
      amount: filledAmount,
      payment_type: 'upfront',
      status: 'paid',
      paid_at: new Date().toISOString()
    });

    if (insertError) {
      console.error('payram-webhook: billing insert failed', { invoiceId, insertError });
      return new Response('Database error', { status: 500 });
    }
  }

  const { error: updateError } = await supabaseAdmin.from('requests').update({ status: 'confirmed' }).eq('id', request.id);

  if (updateError) {
    console.error('payram-webhook: request status update failed', { invoiceId, updateError });
    return new Response('Database error', { status: 500 });
  }

  return new Response('ok');
}

Deno.serve(handleRequest);
