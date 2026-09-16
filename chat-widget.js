// M&MCore Agency — homepage chat widget, wired to the widget-chat Edge
// Function (../supabase/functions/widget-chat), which shares the same
// xAI-powered brain as the Telegram bot and the dashboard's "Mint"
// assistant via ../supabase/functions/_shared/bot-core.ts. A per-visitor
// id is kept in localStorage so a returning visitor's conversation
// picks up where it left off (server-side history, not just this tab).
const MANAGER_TELEGRAM_URL = 'https://t.me/AgenticCoreAgency';
const VISITOR_ID_KEY = 'mmcore_chat_visitor_id';
const GREETING = "Hi! I'm the M&MCore assistant — ask me about pricing, services, or how anything works. For something urgent right now, you can also message us directly on Telegram.";
const ERROR_REPLY = "Something went wrong reaching the assistant just now. Please try again in a moment, or message us on Telegram below.";

function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch (e) {
    // localStorage unavailable (private mode, blocked storage) -- fall
    // back to a per-page-load id rather than breaking the widget.
    return `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

async function callWidgetChat(action, payload) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/widget-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
    },
    body: JSON.stringify({ action, visitorId: getVisitorId(), ...payload })
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(data?.error || `widget-chat failed (${resp.status})`);
  return data;
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
  const widgetEl = buildWidgetMarkup();
  document.body.appendChild(widgetEl);

  const toggleBtn = document.getElementById('chatWidgetToggle');
  const panel = document.getElementById('chatWidgetPanel');
  const messagesEl = document.getElementById('chatWidgetMessages');
  const form = document.getElementById('chatWidgetForm');
  const input = document.getElementById('chatWidgetInput');

  let opened = false;
  let sending = false;

  async function openPanel() {
    panel.hidden = false;
    toggleBtn.classList.add('is-open');
    toggleBtn.setAttribute('aria-expanded', 'true');
    input.focus();

    if (opened) return;
    opened = true;

    try {
      const { messages } = await callWidgetChat('history', {});
      if (messages && messages.length) {
        messages.forEach((m) => appendMessage(messagesEl, m.role, m.content));
        return;
      }
    } catch (e) {
      console.error('chat-widget: history load failed', e);
    }
    appendMessage(messagesEl, 'assistant', GREETING);
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
      const result = await callWidgetChat('message', {
        message: text,
        languageHint: navigator.language
      });
      removeTypingIndicator();
      appendMessage(messagesEl, 'assistant', result.reply);
      if (result.needsHuman) appendHandoffLink(messagesEl);
    } catch (err) {
      console.error('chat-widget: message failed', err);
      removeTypingIndicator();
      appendMessage(messagesEl, 'assistant', ERROR_REPLY);
      appendHandoffLink(messagesEl);
    } finally {
      sending = false;
      input.disabled = false;
      input.focus();
    }
  });
})();
