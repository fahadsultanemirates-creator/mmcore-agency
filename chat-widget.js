// M&MCore Agency — homepage chat widget. Deliberately dependency-free
// (no supabase-js SDK load on the marketing homepage for one endpoint) --
// just a fetch() call authenticated with the same publishable anon key
// already used in supabase-client.js. That key is safe for browser use by
// design (security is enforced by RLS/the Edge Function itself, not by
// hiding this key) -- duplicated here rather than pulling in the SDK.
// Keep these two values in sync with supabase-client.js if they change.
const CHAT_SUPABASE_URL = 'https://bnjbxjvnibotshxpdnsg.supabase.co';
const CHAT_SUPABASE_ANON_KEY = 'sb_publishable_3KC3sqeONPkWRlQRYrMSuA_VNFlG6jG';
const CHAT_ENDPOINT = `${CHAT_SUPABASE_URL}/functions/v1/widget-chat`;
const MANAGER_TELEGRAM_URL = 'https://t.me/mmcore_managers';
const VISITOR_ID_STORAGE_KEY = 'mmcore_visitor_id';

function getOrCreateVisitorId() {
  let id = localStorage.getItem(VISITOR_ID_STORAGE_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, id);
  }
  return id;
}

async function callWidgetChat(payload) {
  const resp = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CHAT_SUPABASE_ANON_KEY}`,
      apikey: CHAT_SUPABASE_ANON_KEY
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${resp.status})`);
  }
  return resp.json();
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
  const visitorId = getOrCreateVisitorId();
  const widgetEl = buildWidgetMarkup();
  document.body.appendChild(widgetEl);

  const toggleBtn = document.getElementById('chatWidgetToggle');
  const panel = document.getElementById('chatWidgetPanel');
  const messagesEl = document.getElementById('chatWidgetMessages');
  const form = document.getElementById('chatWidgetForm');
  const input = document.getElementById('chatWidgetInput');

  let historyLoaded = false;
  let sending = false;

  async function openPanel() {
    panel.hidden = false;
    toggleBtn.classList.add('is-open');
    toggleBtn.setAttribute('aria-expanded', 'true');

    if (!historyLoaded) {
      historyLoaded = true;
      try {
        const { messages } = await callWidgetChat({ visitorId, action: 'history' });
        if (messages && messages.length) {
          messages.forEach((m) => appendMessage(messagesEl, m.role, m.content));
        } else {
          appendMessage(messagesEl, 'assistant', "Hi! I'm the M&MCore assistant — ask me about pricing, services, or how to get started.");
        }
      } catch (e) {
        appendMessage(messagesEl, 'assistant', "Hi! I'm the M&MCore assistant — ask me about pricing, services, or how to get started.");
      }
    }
    input.focus();
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
      const { reply, needsHuman } = await callWidgetChat({
        visitorId,
        action: 'message',
        message: text,
        languageHint: navigator.language
      });
      removeTypingIndicator();
      appendMessage(messagesEl, 'assistant', reply);
      if (needsHuman) appendHandoffLink(messagesEl);
    } catch (err) {
      removeTypingIndicator();
      appendMessage(messagesEl, 'assistant', 'Something went wrong on our end. Please try again in a moment, or reach out directly on Telegram.');
      appendHandoffLink(messagesEl);
    } finally {
      sending = false;
      input.disabled = false;
      input.focus();
    }
  });
})();
