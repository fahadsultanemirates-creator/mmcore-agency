// M&MCore Agency — homepage chat widget.
//
// This was a self-contained placeholder that never made a network call,
// even though its backend (supabase/functions/widget-chat, sharing the
// same handleIncomingMessage brain as the Telegram bot) was already
// built and deployed. It now talks to that function for real, and falls
// back to the Telegram handoff only when the call actually fails.

const MANAGER_TELEGRAM_URL = 'https://t.me/mmcore_managers';
const GREETING = "Hi! I'm the M&MCore assistant. Ask me about any service, what it costs, or how long it takes — I can answer most things myself.";
const VISITOR_ID_KEY = 'mmcore_visitor_id';

// A stable per-browser id so the conversation survives a reload. It is
// only an identifier for an anonymous thread -- it carries no
// authority, and widget-chat treats it as untrusted (it rate-limits on
// the caller's IP as well, precisely because this is resettable).
function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch (e) {
    // Private mode / storage blocked: fall back to a per-page id. The
    // visitor loses history across reloads but the widget still works.
    return 'ephemeral-' + Math.random().toString(36).slice(2);
  }
}

function buildWidgetMarkup() {
  const wrap = document.createElement('div');
  wrap.className = 'chat-widget';
  wrap.innerHTML = `
    <button type="button" class="chat-widget-toggle" id="chatWidgetToggle" aria-label="Chat with M&MCore" aria-expanded="false">
      <svg class="chat-widget-icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      <svg class="chat-widget-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div class="chat-widget-panel" id="chatWidgetPanel" hidden>
      <div class="chat-widget-header">
        <span>M&MCore Assistant</span>
      </div>
      <div class="chat-widget-messages" id="chatWidgetMessages" aria-live="polite"></div>
      <form class="chat-widget-form" id="chatWidgetForm">
        <input type="text" id="chatWidgetInput" class="chat-widget-input" placeholder="Ask about pricing, services, anything…" autocomplete="off" maxlength="4000">
        <button type="submit" class="chat-widget-send" id="chatWidgetSend" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
    </div>
  `;
  return wrap;
}

function appendMessage(container, role, text) {
  const el = document.createElement('div');
  el.className = `chat-widget-message chat-widget-message-${role}`;
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function appendHandoffLink(container) {
  // Don't stack a second handoff link directly under an existing one.
  if (container.lastElementChild &&
      container.lastElementChild.classList.contains('chat-widget-handoff-link')) {
    return;
  }
  const el = document.createElement('a');
  el.href = MANAGER_TELEGRAM_URL;
  el.target = '_blank';
  el.rel = 'noopener';
  el.className = 'chat-widget-handoff-link';
  el.textContent = 'Continue with a human on Telegram →';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function appendTypingIndicator(container) {
  const el = document.createElement('div');
  el.className = 'chat-widget-message chat-widget-message-assistant chat-widget-typing';
  el.id = 'chatWidgetTyping';
  el.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('chatWidgetTyping');
  if (el) el.remove();
}

(function initChatWidget() {
  const widgetEl = buildWidgetMarkup();
  document.body.appendChild(widgetEl);

  const toggleBtn = document.getElementById('chatWidgetToggle');
  const panel = document.getElementById('chatWidgetPanel');
  const messagesEl = document.getElementById('chatWidgetMessages');
  const form = document.getElementById('chatWidgetForm');
  const input = document.getElementById('chatWidgetInput');

  const visitorId = getVisitorId();
  let greeted = false;
  let sending = false;

  async function callWidgetChat(payload) {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/widget-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Anonymous endpoint: the publishable key is what Supabase's
        // platform JWT gate expects, and is already public in
        // supabase-client.js.
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
      },
      body: JSON.stringify({ visitorId, ...payload })
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const err = new Error(data?.error || `Request failed (${resp.status})`);
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  async function openPanel() {
    panel.hidden = false;
    toggleBtn.classList.add('is-open');
    toggleBtn.setAttribute('aria-expanded', 'true');
    input.focus();

    if (greeted) return;
    greeted = true;

    try {
      const data = await callWidgetChat({ action: 'history' });
      if (data.messages && data.messages.length) {
        data.messages.forEach((m) => appendMessage(messagesEl, m.role, m.content));
      } else {
        appendMessage(messagesEl, 'assistant', GREETING);
      }
    } catch (e) {
      appendMessage(messagesEl, 'assistant', GREETING);
    }
  }

  function closePanel() {
    panel.hidden = true;
    toggleBtn.classList.remove('is-open');
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  toggleBtn.addEventListener('click', () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || sending) return;

    appendMessage(messagesEl, 'user', text);
    input.value = '';
    sending = true;
    input.disabled = true;
    appendTypingIndicator(messagesEl);

    try {
      const data = await callWidgetChat({
        action: 'message',
        message: text,
        languageHint: navigator.language || undefined
      });
      removeTypingIndicator();
      appendMessage(messagesEl, 'assistant', data.reply);
      if (data.needsHuman) appendHandoffLink(messagesEl);
    } catch (err) {
      removeTypingIndicator();
      appendMessage(messagesEl, 'assistant', err.status === 429
        ? err.message
        : "Sorry — I couldn't reach my brain just then. Try again in a moment, or talk to a person on Telegram below.");
      if (err.status !== 429) appendHandoffLink(messagesEl);
    } finally {
      sending = false;
      input.disabled = false;
      input.focus();
    }
  });
})();
