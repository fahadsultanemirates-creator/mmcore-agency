// M&MCore Agency — homepage chat widget. The visual widget (floating
// button + panel) is in place now, but the AI assistant itself is
// deferred until the rest of the site is finished -- there's no
// widget-chat Edge Function behind this yet. It's a self-contained
// placeholder: no network calls, just a static greeting and an instant
// canned reply, plus a real link to Telegram for anyone who wants a
// human now. Swap this file out once the assistant is actually built.
const MANAGER_TELEGRAM_URL = 'https://t.me/mmcore_managers';
const PLACEHOLDER_GREETING = "Hi! I'm the M&MCore assistant — I'm still being set up. For anything urgent right now, message us on Telegram and a real person will get back to you.";
const PLACEHOLDER_REPLY = "Thanks for the message! I can't answer yet -- my setup isn't finished. Message us on Telegram below and a real person will help in the meantime.";

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

  let greeted = false;
  let sending = false;

  function openPanel() {
    panel.hidden = false;
    toggleBtn.classList.add('is-open');
    toggleBtn.setAttribute('aria-expanded', 'true');

    if (!greeted) {
      greeted = true;
      appendMessage(messagesEl, 'assistant', PLACEHOLDER_GREETING);
      appendHandoffLink(messagesEl);
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

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || sending) return;

    appendMessage(messagesEl, 'user', text);
    input.value = '';
    sending = true;
    input.disabled = true;
    appendTypingIndicator(messagesEl);

    // No backend yet -- a short delay just keeps the "thinking" indicator
    // from flashing instantly, so it still feels like a real reply.
    setTimeout(() => {
      removeTypingIndicator();
      appendMessage(messagesEl, 'assistant', PLACEHOLDER_REPLY);
      appendHandoffLink(messagesEl);
      sending = false;
      input.disabled = false;
      input.focus();
    }, 500);
  });
})();
