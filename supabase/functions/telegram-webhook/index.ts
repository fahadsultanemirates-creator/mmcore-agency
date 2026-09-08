// M&MCore Agency — Telegram bot webhook. Registered as the bot's
// webhook URL via Telegram's setWebhook API. Every ordinary message
// Telegram routes here goes through handleIncomingMessage() in
// ../_shared/bot-core.ts (the 'telegram' channel there answers via
// xAI's Grok) -- but this file also owns a small owner-only task-manager
// layer on top: /status, /approve, /reject, an inline "patch this task's
// draft" shortcut, and committing an approved/patched website draft's
// files straight to jobs/AC-MMCORE-XXXX/ on main. All of it lives in
// this file alone so bot-core.ts (shared with the widget and Mint) stays
// untouched. Ported from agenticcore-agency's telegram-webhook/index.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleIncomingMessage } from '../_shared/bot-core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!;
const XAI_API_KEY = Deno.env.get('XAI_API_KEY')!;
const XAI_MODEL = Deno.env.get('XAI_MODEL') || undefined;
// Telegram's numeric user id for the account owner, as a string (compared
// against String(message.from.id)) -- gates /status, /approve, /reject,
// and (together with a task's own external_id) the draft-patch shortcut.
// Unset means nobody can use those (fails closed, not open).
const OWNER_TELEGRAM_ID = Deno.env.get('OWNER_TELEGRAM_ID') || undefined;
// Fine-grained PAT scoped to this repo (mmcore-agency) with
// contents:write, used only to commit an approved website task's files
// into jobs/AC-MMCORE-XXXX/ on main.
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN')!;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
// Telegram's hard limit is 4096 chars; this is just a safety margin so a
// long reply can't itself cause the sendMessage call to fail.
const MAX_TELEGRAM_MESSAGE_LENGTH = 4000;

const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_XAI_MODEL = 'grok-4-1';

const TASK_BRAND = 'mmcore';
const TASK_ID_PATTERN = /AC-MMCORE-\d{4}/i;
const APPROVE_PATTERN = /^\/approve(?:@\S+)?\s+(AC-MMCORE-\d{4})\b/i;
const REJECT_PATTERN = /^\/reject(?:@\S+)?\s+(AC-MMCORE-\d{4})\b/i;
const STATUS_PATTERN = /^\/status(?:@\S+)?$/i;
const APPROVABLE_STATUSES = new Set(['waiting_you', 'review']);

const GITHUB_OWNER = 'fahadsultanemirates-creator';
const GITHUB_REPO = 'mmcore-agency';
const GITHUB_API = 'https://api.github.com';
const JOB_FILES_BRANCH = 'main';
const MAX_COMMIT_ATTEMPTS = 2;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const truncated =
    text.length > MAX_TELEGRAM_MESSAGE_LENGTH ? text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH) + '…' : text;

  const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: truncated })
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error(`Telegram sendMessage failed (${resp.status}):`, body);
  }
}

function isOwner(fromId: number | undefined): boolean {
  return Boolean(OWNER_TELEGRAM_ID) && fromId !== undefined && String(fromId) === OWNER_TELEGRAM_ID;
}

async function callXaiPlainText(prompt: string): Promise<string> {
  const resp = await fetch(XAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: XAI_MODEL || DEFAULT_XAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
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
  return content;
}

function draftPrompt(task: { title: string; task_type: string; brief: string | null }): string {
  const briefLine = task.brief ? `\nBrief: ${task.brief}` : '';
  if (task.task_type === 'website') {
    return [
      'You are drafting the first version of a simple website for a client task.',
      `Title: ${task.title}${briefLine}`,
      '',
      'Output a simple multi-file HTML website as plain text. For each file, start with a line "=== filename ===" followed by that file\'s complete contents, then a blank line before the next file. Keep it simple: plain HTML/CSS, no build tooling or frameworks. Output only the files -- no commentary before or after.'
    ].join('\n');
  }
  return [
    'You are drafting the first version of a deliverable for a client task.',
    `Title: ${task.title}${briefLine}`,
    '',
    'Output a first draft in Markdown. Output only the draft -- no commentary before or after.'
  ].join('\n');
}

function patchPrompt(currentDraft: string, requestedChange: string): string {
  return [
    'Here is the current draft:',
    '',
    currentDraft || '(no draft yet)',
    '',
    'Apply this requested change and output the COMPLETE updated draft, in the same format as the original. Output only the updated draft -- no commentary before or after.',
    '',
    `Requested change: ${requestedChange}`
  ].join('\n');
}

// ============================================================
// Draft -> jobs/AC-MMCORE-XXXX/ file split + commit
// ============================================================

interface DraftFile {
  path: string;
  content: string;
}

// Rejects anything that could escape jobs/<publicId>/ -- filenames come
// from the model's own output, not trusted input, so a hallucinated
// "../../supabase/functions/..." or an absolute path must never reach
// the GitHub API. Subdirectories within the job folder are fine (a
// "multi-file website" reasonably includes e.g. css/style.css).
function sanitizeJobFilePath(publicId: string, filename: string): string | null {
  if (!/^AC-MMCORE-\d{4}$/.test(publicId)) return null;

  const trimmed = filename.trim();
  if (!trimmed || trimmed.includes('\0')) return null;
  // Reject outright rather than normalize -- an absolute-looking path
  // (leading "/", a Windows drive letter, or a backslash) from a model's
  // output is treated as suspicious, not silently reinterpreted as
  // relative.
  if (trimmed.startsWith('/') || trimmed.includes('\\') || /^[a-zA-Z]:/.test(trimmed)) return null;

  const segments = trimmed.split('/');
  if (segments.some((seg) => seg === '..' || seg === '.' || seg === '')) return null;

  return `jobs/${publicId}/${segments.join('/')}`;
}

// Parses "=== filename ===" delimited draft text into files. Returns an
// empty array (nothing to commit, not an error) if the draft has no
// recognizable markers -- expected for non-website drafts, which are
// plain Markdown with no file structure to split.
function parseDraftFiles(draftText: string, publicId: string): DraftFile[] {
  const markerPattern = /^===\s*(.+?)\s*===\s*$/gm;
  const matches = [...draftText.matchAll(markerPattern)];
  if (matches.length === 0) return [];

  const files: DraftFile[] = [];
  for (let i = 0; i < matches.length; i++) {
    const filename = matches[i][1];
    const contentStart = matches[i].index! + matches[i][0].length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index! : draftText.length;
    const content = draftText.slice(contentStart, contentEnd).replace(/^\n+/, '').replace(/\s+$/, '\n');

    const path = sanitizeJobFilePath(publicId, filename);
    if (path) files.push({ path, content });
  }
  return files;
}

async function githubRequest(path: string, opts: RequestInit = {}): Promise<any> {
  const resp = await fetch(`${GITHUB_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`GitHub API ${opts.method || 'GET'} ${path} failed (${resp.status}): ${text.slice(0, 500)}`);
  }
  return resp.json();
}

// One atomic commit for all of a task's files, via the Git Data API
// (blob/tree/commit/ref) rather than the single-file contents API, so N
// files land as one commit instead of N. Retries once from a fresh ref
// if updating heads/main lands on a stale parent (another push landed
// in between) -- never force-pushes.
async function commitJobFiles(publicId: string, files: DraftFile[], commitMessage: string): Promise<void> {
  if (files.length === 0) return;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt++) {
    try {
      const ref = await githubRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/ref/heads/${JOB_FILES_BRANCH}`);
      const latestCommitSha = ref.object.sha;

      const latestCommit = await githubRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${latestCommitSha}`);
      const baseTreeSha = latestCommit.tree.sha;

      const tree = await githubRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content }))
        })
      });

      const newCommit = await githubRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message: commitMessage, tree: tree.sha, parents: [latestCommitSha] })
      });

      await githubRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${JOB_FILES_BRANCH}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: newCommit.sha })
      });

      return;
    } catch (err) {
      lastError = err;
      console.error(`telegram-webhook: commitJobFiles attempt ${attempt + 1} failed for ${publicId}`, err);
    }
  }
  throw lastError;
}

// Shared by /approve and a successful draft-patch: only website-type
// tasks get split into files (that's the only draft shape with file
// markers -- everything else is plain Markdown with nothing to split).
// Never throws -- a commit failure degrades to a note in the message
// sent back, it must not undo the draft that was already saved.
async function commitWebsiteDraftIfApplicable(
  task: { task_type: string },
  publicId: string,
  draftText: string,
  commitMessage: string
): Promise<string> {
  if (task.task_type !== 'website') return '';

  const files = parseDraftFiles(draftText, publicId);
  if (files.length === 0) {
    return `\n\nNo "=== filename ===" markers found in the draft -- nothing committed to jobs/${publicId}/.`;
  }

  try {
    await commitJobFiles(publicId, files, commitMessage);
    return `\n\nCommitted ${files.length} file${files.length === 1 ? '' : 's'} to jobs/${publicId}/ on main.`;
  } catch (err) {
    console.error('telegram-webhook: commitWebsiteDraftIfApplicable failed', err);
    return `\n\nDraft saved, but committing files to jobs/${publicId}/ failed -- check the function logs.`;
  }
}

// ============================================================
// Owner commands
// ============================================================

async function handleStatusCommand(chatId: number): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('manager_tasks')
    .select('public_id, title, status')
    .eq('brand', TASK_BRAND)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    console.error('telegram-webhook: /status query failed', error);
    await sendTelegramMessage(chatId, 'Could not load task status right now.');
    return;
  }

  if (!data || data.length === 0) {
    await sendTelegramMessage(chatId, 'No tasks yet.');
    return;
  }

  const lines = data.map((t: any) => `${t.public_id} — ${t.title} [${t.status}]`);
  await sendTelegramMessage(chatId, lines.join('\n'));
}

async function handleApproveCommand(chatId: number, publicId: string): Promise<void> {
  const { data: task, error: fetchError } = await supabaseAdmin
    .from('manager_tasks')
    .select('id, title, task_type, brief, status')
    .eq('public_id', publicId)
    .eq('brand', TASK_BRAND)
    .maybeSingle();

  if (fetchError) {
    console.error('telegram-webhook: /approve lookup failed', fetchError);
    await sendTelegramMessage(chatId, `Could not look up ${publicId}.`);
    return;
  }
  if (!task) {
    await sendTelegramMessage(chatId, `No task found with id ${publicId}.`);
    return;
  }
  if (!APPROVABLE_STATUSES.has(task.status)) {
    await sendTelegramMessage(chatId, `Can't approve ${publicId} -- current status is "${task.status}".`);
    return;
  }

  const { error: buildingError } = await supabaseAdmin
    .from('manager_tasks')
    .update({ status: 'building', updated_at: new Date().toISOString() })
    .eq('id', task.id);

  if (buildingError) {
    console.error('telegram-webhook: /approve status->building failed', buildingError);
    await sendTelegramMessage(chatId, `Could not update ${publicId} to building.`);
    return;
  }

  let draft: string;
  try {
    draft = await callXaiPlainText(draftPrompt(task));
  } catch (err) {
    console.error('telegram-webhook: draft generation failed', err);
    await sendTelegramMessage(chatId, `${publicId} is building, but the first draft failed to generate. Try /approve ${publicId} again in a moment.`);
    return;
  }

  const { error: reviewError } = await supabaseAdmin
    .from('manager_tasks')
    .update({ draft_text: draft, status: 'review', updated_at: new Date().toISOString() })
    .eq('id', task.id);

  if (reviewError) {
    console.error('telegram-webhook: /approve status->review failed', reviewError);
    await sendTelegramMessage(chatId, `Draft generated for ${publicId}, but saving it failed. Please try again.`);
    return;
  }

  const commitNote = await commitWebsiteDraftIfApplicable(task, publicId, draft, `${publicId}: first draft`);

  const preview = draft.length > 1200 ? draft.slice(0, 1200) + '…' : draft;
  await sendTelegramMessage(
    chatId,
    `Draft ready for "${task.title}" (${task.task_type}) — ${publicId}, status: review\n\n${preview}${commitNote}`
  );
}

async function handleRejectCommand(chatId: number, publicId: string): Promise<void> {
  const { data: task, error: fetchError } = await supabaseAdmin
    .from('manager_tasks')
    .select('id, status')
    .eq('public_id', publicId)
    .eq('brand', TASK_BRAND)
    .maybeSingle();

  if (fetchError) {
    console.error('telegram-webhook: /reject lookup failed', fetchError);
    await sendTelegramMessage(chatId, `Could not look up ${publicId}.`);
    return;
  }
  if (!task) {
    await sendTelegramMessage(chatId, `No task found with id ${publicId}.`);
    return;
  }
  if (!APPROVABLE_STATUSES.has(task.status)) {
    await sendTelegramMessage(chatId, `Can't reject ${publicId} -- current status is "${task.status}".`);
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from('manager_tasks')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', task.id);

  if (updateError) {
    console.error('telegram-webhook: /reject failed', updateError);
    await sendTelegramMessage(chatId, `Could not cancel ${publicId}.`);
    return;
  }

  await sendTelegramMessage(chatId, `${publicId} cancelled.`);
}

// Returns true if this message was handled as a draft-patch request
// (whether it succeeded or failed) -- false when publicId doesn't match
// a real task, OR when the sender isn't authorized for it, so the
// caller falls through to ordinary chat handling instead of confirming
// a task's existence (or lack of authorization) to someone who
// shouldn't be able to tell either way.
async function tryHandleDraftPatch(chatId: number, fromId: number | undefined, publicId: string, requestedChange: string): Promise<boolean> {
  const { data: task, error: fetchError } = await supabaseAdmin
    .from('manager_tasks')
    .select('id, draft_text, task_type, external_id')
    .eq('public_id', publicId)
    .eq('brand', TASK_BRAND)
    .maybeSingle();

  if (fetchError) {
    console.error('telegram-webhook: draft-patch lookup failed', fetchError);
    return false;
  }
  if (!task) return false;

  const authorized = isOwner(fromId) || (task.external_id !== null && fromId !== undefined && String(fromId) === task.external_id);
  if (!authorized) return false;

  let updatedDraft: string;
  try {
    updatedDraft = await callXaiPlainText(patchPrompt(task.draft_text || '', requestedChange));
  } catch (err) {
    console.error('telegram-webhook: draft patch generation failed', err);
    await sendTelegramMessage(chatId, `Could not apply that change to ${publicId} right now.`);
    return true;
  }

  const { error: updateError } = await supabaseAdmin
    .from('manager_tasks')
    .update({ draft_text: updatedDraft, updated_at: new Date().toISOString() })
    .eq('id', task.id);

  if (updateError) {
    console.error('telegram-webhook: draft patch save failed', updateError);
    await sendTelegramMessage(chatId, `Generated an updated draft for ${publicId}, but saving it failed.`);
    return true;
  }

  const commitNote = await commitWebsiteDraftIfApplicable(task, publicId, updatedDraft, `${publicId}: patch draft`);

  const preview = updatedDraft.length > 800 ? updatedDraft.slice(0, 800) + '…' : updatedDraft;
  await sendTelegramMessage(chatId, `Updated draft for ${publicId}:\n\n${preview}${commitNote}`);
  return true;
}

// Exported separately from the Deno.serve() call below purely so it can
// be exercised directly in tests without needing a real Deno HTTP server.
export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Only accept requests carrying the secret Telegram was configured
  // (via setWebhook's secret_token) to send on every call -- rejects
  // anyone who discovers this URL and tries to post fake updates.
  const secretHeader = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = message?.text;

  // Always ack 200 for anything we're deliberately not handling
  // (edited messages, photos/stickers with no text, channel posts,
  // etc.) -- returning a non-2xx here makes Telegram retry the same
  // update repeatedly.
  if (!chatId || typeof text !== 'string' || text.trim() === '') {
    return new Response('ok');
  }

  const trimmed = text.trim();
  const fromId = message?.from?.id;
  const owner = isOwner(fromId);

  try {
    if (owner && STATUS_PATTERN.test(trimmed)) {
      await handleStatusCommand(chatId);
      return new Response('ok');
    }

    if (owner) {
      const approveMatch = trimmed.match(APPROVE_PATTERN);
      if (approveMatch) {
        await handleApproveCommand(chatId, approveMatch[1].toUpperCase());
        return new Response('ok');
      }

      const rejectMatch = trimmed.match(REJECT_PATTERN);
      if (rejectMatch) {
        await handleRejectCommand(chatId, rejectMatch[1].toUpperCase());
        return new Response('ok');
      }
    }

    // Inline draft-edit shortcut: the owner, or the task's own original
    // requester (external_id), mentioning a real task id plus additional
    // text patches that task's draft_text directly -- it never creates a
    // new task and never runs the normal conversational reply for that
    // message. Skipped for anything that looks like an /approve or
    // /reject attempt (including a non-owner's attempt at one) -- that
    // text is a command, not a requested edit, even though it still
    // matches TASK_ID_PATTERN.
    const looksLikeOwnerCommand = APPROVE_PATTERN.test(trimmed) || REJECT_PATTERN.test(trimmed);
    const taskIdMatch = !looksLikeOwnerCommand ? trimmed.match(TASK_ID_PATTERN) : null;
    if (taskIdMatch) {
      const requestedChange = trimmed.replace(taskIdMatch[0], '').trim();
      if (requestedChange) {
        const handled = await tryHandleDraftPatch(chatId, fromId, taskIdMatch[0].toUpperCase(), requestedChange);
        if (handled) return new Response('ok');
      }
    }
  } catch (err) {
    console.error('telegram-webhook: manager command failed', err);
    await sendTelegramMessage(chatId, 'Something went wrong handling that command.').catch(() => {});
    return new Response('ok');
  }

  const languageHint: string | undefined = message?.from?.language_code || undefined;

  try {
    const result = await handleIncomingMessage({
      supabaseAdmin,
      channel: 'telegram',
      externalId: String(chatId),
      userMessage: text,
      xaiApiKey: XAI_API_KEY,
      model: XAI_MODEL,
      languageHint
    });

    await sendTelegramMessage(chatId, result.reply);
  } catch (err) {
    console.error('telegram-webhook: unhandled error', err);
    // Best-effort -- if this also fails, there's nothing more to do
    // short of dropping the update, which is the safer failure mode.
    await sendTelegramMessage(
      chatId,
      'Something went wrong on our end. Please try again in a moment, or reach out directly: https://t.me/mmcore_managers'
    ).catch(() => {});
  }

  return new Response('ok');
}

Deno.serve(handleRequest);
