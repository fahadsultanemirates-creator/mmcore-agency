// M&MCore Agency — Dashboard logic

const STATUS_LABELS = {
  draft: 'Draft',
  awaiting_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  in_progress: 'In progress',
  awaiting_review: 'Awaiting your review',
  revision_requested: 'Revision requested',
  delivered: 'Delivered',
  approved: 'Approved — awaiting final payment',
  pending: 'Pending',
  paid: 'Paid',
  refunded: 'Refunded'
};

// Every string that reaches innerHTML goes through this. A client
// controls their own full_name and description, and staff type project
// names by hand -- none of it is safe to interpolate raw.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function statusPill(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="status-pill status-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function formatMoney(amount) {
  return '$' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// -------- Tabs --------
function initTabs() {
  document.querySelectorAll('.dash-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function switchTab(name) {
  document.querySelectorAll('.dash-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.dash-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
}

// -------- Header: profile, referral link, points, support --------
function renderHeader(profile) {
  document.getElementById('welcomeHeading').textContent = profile.full_name
    ? `Welcome back, ${profile.full_name.split(' ')[0]}`
    : 'Welcome back';

  const referralUrl = `${window.location.origin}${window.location.pathname.replace('dashboard.html', '')}signup.html?ref=${profile.referral_code}`;
  document.getElementById('referralLinkInput').value = referralUrl;

  document.getElementById('pointsBalance').textContent = formatMoney(profile.points_balance);
}

// -------- Business Pool section --------
// Same $5,000 lifetime-spend threshold as AgenticCore.
const BUSINESS_POOL_THRESHOLD = 5000;

function renderBusinessPoolSection(profile) {
  const progressWrap = document.getElementById('bpProgressWrap');
  const progressFill = document.getElementById('bpProgressFill');
  const progressText = document.getElementById('bpProgressText');
  const unlockedText = document.getElementById('bpUnlockedText');
  const managerBtn = document.getElementById('bpManagerBtn');

  if (profile.is_business_pool) {
    progressWrap.style.display = 'none';
    unlockedText.style.display = 'block';
    managerBtn.style.display = 'inline-block';
  } else {
    progressWrap.style.display = 'block';
    unlockedText.style.display = 'none';
    managerBtn.style.display = 'none';
    const spend = Number(profile.total_spend) || 0;
    const pct = Math.max(0, Math.min(100, (spend / BUSINESS_POOL_THRESHOLD) * 100));
    progressFill.style.width = pct + '%';
    progressText.textContent = `${formatMoney(spend)} / ${formatMoney(BUSINESS_POOL_THRESHOLD)}`;
  }
}

document.getElementById('copyReferralBtn').addEventListener('click', async () => {
  const input = document.getElementById('referralLinkInput');
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
    const btn = document.getElementById('copyReferralBtn');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch (e) {
    // Clipboard API unavailable (e.g. insecure context) -- the input is
    // already selected above, so a manual copy still works.
  }
});

// -------- My Projects: pending requests + projects --------
async function renderProjectsPanel(userId) {
  const { data: requests } = await supabaseClient
    .from('requests')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['draft', 'awaiting_payment'])
    .order('created_at', { ascending: false });

  const requestsList = document.getElementById('requestsList');
  const requestsEmpty = document.getElementById('requestsEmpty');
  requestsList.innerHTML = '';
  if (requests && requests.length) {
    requestsEmpty.style.display = 'none';
    requests.forEach((r) => {
      const el = document.createElement('div');
      el.className = 'request-card';
      const due = amountDueNow(r);
      el.innerHTML = `
        <div>
          <h4>${escapeHtml(r.task_type || r.service_category)}</h4>
          <p>Submitted ${formatDate(r.created_at)} · ${formatMoney(r.agreed_price)}${r.is_recurring ? '/mo' : ''}</p>
          <p class="revisions-note">${formatMoney(due)} due to start</p>
        </div>
        ${statusPill(r.status)}
      `;
      const payBtn = document.createElement('button');
      payBtn.type = 'button';
      payBtn.className = 'btn btn-secondary btn-sm';
      payBtn.textContent = 'Payment details';
      payBtn.addEventListener('click', () => {
        const holder = document.createElement('div');
        el.appendChild(holder);
        payBtn.remove();
        renderPaymentCTA(holder, { requestId: r.id, amountDue: due, isRecurring: r.is_recurring });
      });
      el.appendChild(payBtn);
      requestsList.appendChild(el);
    });
  } else {
    requestsEmpty.style.display = 'block';
  }

  const { data: projects } = await supabaseClient
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const projectsList = document.getElementById('projectsList');
  const projectsEmpty = document.getElementById('projectsEmpty');
  projectsList.innerHTML = '';
  if (projects && projects.length) {
    projectsEmpty.style.display = 'none';
    projects.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'project-card';

      const row = document.createElement('div');
      row.className = 'project-card-row';
      row.innerHTML = `
        <div>
          <h4>${escapeHtml(p.project_name || 'Untitled project')}</h4>
          <p>Started ${formatDate(p.created_at)}</p>
          <p class="revisions-note">${p.revisions_used} / 2 free revisions used</p>
        </div>
        ${statusPill(p.status)}
      `;
      el.appendChild(row);

      if (p.status === 'delivered' || p.status === 'awaiting_review') {
        const actions = document.createElement('div');
        actions.className = 'project-actions';

        if (p.revisions_used < 2) {
          const revisionBtn = document.createElement('button');
          revisionBtn.type = 'button';
          revisionBtn.className = 'btn btn-secondary btn-sm';
          revisionBtn.textContent = 'Request Revision';
          revisionBtn.addEventListener('click', () => handleRequestRevision(p.id, userId, revisionBtn));
          actions.appendChild(revisionBtn);
        } else {
          const note = document.createElement('p');
          note.className = 'revisions-note';
          note.textContent = 'No free revisions remaining — further changes are billed separately.';
          actions.appendChild(note);
        }

        const approveBtn = document.createElement('button');
        approveBtn.type = 'button';
        approveBtn.className = 'btn btn-primary btn-sm';
        approveBtn.textContent = 'Approve & Pay Remaining';
        approveBtn.addEventListener('click', () => handleApproveDelivery(p.id, userId, approveBtn));
        actions.appendChild(approveBtn);

        el.appendChild(actions);
      }

      projectsList.appendChild(el);
    });
  } else {
    projectsEmpty.style.display = 'block';
  }
}

async function handleRequestRevision(projectId, userId, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const { error } = await supabaseClient.rpc('request_project_revision', { p_project_id: projectId });

  if (error) {
    btn.disabled = false;
    btn.textContent = original;
    alert('Could not request a revision: ' + error.message);
    return;
  }

  renderProjectsPanel(userId);
}

async function handleApproveDelivery(projectId, userId, btn) {
  if (!confirm('Approve this delivery? This will start the final payment (70% of the agreed price).')) {
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const { error } = await supabaseClient.rpc('approve_project_delivery', { p_project_id: projectId });

  if (error) {
    btn.disabled = false;
    btn.textContent = original;
    alert('Could not approve delivery: ' + error.message);
    return;
  }

  renderProjectsPanel(userId);
  renderBillingPanel(userId);
}

// -------- Billing --------
async function renderBillingPanel(userId) {
  const { data: billing } = await supabaseClient
    .from('billing')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: false });

  const billingList = document.getElementById('billingList');
  const billingEmpty = document.getElementById('billingEmpty');
  billingList.innerHTML = '';
  if (billing && billing.length) {
    billingEmpty.style.display = 'none';
    billing.forEach((b) => {
      const el = document.createElement('div');
      el.className = 'billing-row';
      el.innerHTML = `
        <div>
          <h4>${formatMoney(b.amount)} — ${escapeHtml(b.payment_type)}</h4>
          <p>${b.points_used > 0 ? formatMoney(b.points_used) + ' in Points applied' : 'No Points applied'}</p>
        </div>
        ${statusPill(b.status)}
      `;
      billingList.appendChild(el);
    });
  } else {
    billingEmpty.style.display = 'block';
  }
}

// -------- Checkout: USDT (BEP20) --------
// One-off project work is 30% upfront / 70% on completion. Monthly
// services and marketing packages have no "completion" to hold 70%
// against, so they are billed in full for the month, in advance --
// matching terms.html and enforced by approve_project_delivery, which
// skips the 70% row for a recurring request.
const UPFRONT_FRACTION = 0.3;
const USDT_BEP20_ADDRESS = '0xdc496FcA8B8d2743b55Da0d082eAFc90f6609D8f';

function amountDueNow(request) {
  const price = Number(request.agreed_price) || 0;
  const fraction = request.is_recurring ? 1 : UPFRONT_FRACTION;
  return Math.round(price * fraction * 100) / 100;
}

// Renders the payment instructions into a container. USDT only: the
// PayRam card/other-crypto path has been removed from the dashboard for
// now, so there is exactly one way to pay and no branch that can fail
// half-open. USDT is confirmed manually -- nothing watches this address
// -- so the client is asked to send their request id and transaction
// hash to support.
function renderPaymentCTA(container, { requestId, amountDue, isRecurring }) {
  const wrap = document.createElement('div');
  wrap.className = 'usdt-pay-block';
  wrap.innerHTML = `
    <p class="usdt-pay-amount">Pay <strong>${formatMoney(amountDue)}</strong> in USDT
      <span>(BEP20 / BNB Smart Chain)</span></p>
    <p class="dash-card-note">${isRecurring
      ? 'This covers your first month. Monthly services are billed in advance, each month.'
      : 'That is the 30% needed to start. The remaining 70% is due once the finished work is delivered and approved.'}</p>
    <div class="usdt-pay-row">
      <img src="images/usdt-bep20-qr.png" alt="QR code for the M&amp;MCore USDT BEP20 deposit address" width="112" height="112">
      <div class="usdt-pay-address">
        <code>${escapeHtml(USDT_BEP20_ADDRESS)}</code>
        <button type="button" class="btn btn-secondary btn-sm copy-usdt-address-btn">Copy address</button>
      </div>
    </div>
    <p class="dash-card-note usdt-pay-confirm">
      Send only <strong>USDT on BEP20</strong> to this address — funds sent on another network cannot be recovered.
      Once sent, message us on <a href="https://t.me/mmcore_support" target="_blank" rel="noopener">Telegram</a>
      with your request ID and the transaction hash so we can confirm it. Payments are verified by a person,
      usually within a few hours.
    </p>
    <p class="usdt-pay-reqid">Request ID: <code>${escapeHtml(requestId)}</code>
      <button type="button" class="btn btn-secondary btn-sm copy-reqid-btn">Copy ID</button></p>
  `;

  function wireCopy(selector, value, doneLabel) {
    const btn = wrap.querySelector(selector);
    const original = btn.textContent;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(value);
        btn.textContent = doneLabel;
      } catch (e) {
        // Clipboard blocked (insecure context / permissions): select the
        // text instead so a manual copy still works, rather than
        // silently doing nothing like the old handler did on reject.
        const range = document.createRange();
        range.selectNodeContents(btn.previousElementSibling || btn);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        btn.textContent = 'Select & copy';
      }
      setTimeout(() => { btn.textContent = original; }, 2000);
    });
  }

  wireCopy('.copy-usdt-address-btn', USDT_BEP20_ADDRESS, 'Copied!');
  wireCopy('.copy-reqid-btn', requestId, 'Copied!');

  container.appendChild(wrap);
}

// -------- Pricing preview --------
// Mirrors price_request() in migration 0014 purely so the wizard can
// show the right number before submitting. The server recomputes it
// regardless -- this is display, never authority.
function discountRateFor(profile, state) {
  if (state.hasPaidPackage) return 0.5;
  if (profile.is_business_pool) return 0.8;
  return 1;
}

function discountLabelFor(profile, state) {
  if (state.hasPaidPackage) return 'Package client — 50% off';
  if (profile.is_business_pool) return 'Business Pool — 20% off';
  return null;
}

// -------- New Request wizard --------
// Generic service->task->details->submit catalog wizard, shared by the
// New Request tab and the Packages tab's 50%-off add-on flow. Only one
// tier exists at M&MCore, so unlike AgenticCore's wizard there's no
// separate tier-picking step -- the price shown at the task step is the
// price, full stop.
function initCatalogWizard(cfg) {
  const el = (id) => document.getElementById(id);
  const pointsRow = cfg.pointsRowId ? el(cfg.pointsRowId) : null;
  const pointsNote = cfg.pointsNoteId ? el(cfg.pointsNoteId) : null;
  const pointsToggle = cfg.applyPointsToggleId ? el(cfg.applyPointsToggleId) : null;
  const breakdownEl = cfg.breakdownId ? el(cfg.breakdownId) : null;

  const state = { category: null, taskType: null };
  let currentStep = 1;

  const stepEls = document.querySelectorAll(cfg.stepsSelector);
  const indicatorEls = document.querySelectorAll(cfg.indicatorSelector);
  const backBtn = el(cfg.backBtnId);
  const nextBtn = el(cfg.nextBtnId);

  function rate() {
    return cfg.fixedRate != null ? cfg.fixedRate : discountRateFor(cfg.profile, cfg.shared);
  }

  function rateLabel() {
    return cfg.fixedRate != null ? cfg.discountNote : discountLabelFor(cfg.profile, cfg.shared);
  }

  function priceFor(item) {
    return Math.round(item.price * rate() * 100) / 100;
  }

  function refreshPointsControl() {
    if (!pointsRow) return;
    const balance = Number(cfg.profile.points_balance) || 0;
    if (balance <= 0) {
      pointsRow.style.display = 'none';
      return;
    }
    pointsRow.style.display = 'block';
    const item = getCatalogItem(state.category, state.taskType);
    const price = item ? priceFor(item) : null;
    pointsNote.textContent = price == null
      ? `You have ${formatMoney(balance)} in Points. 1 Point = $1 off any service.`
      : `You have ${formatMoney(balance)} in Points — ${formatMoney(Math.min(balance, price))} of it applies to this order.`;
  }

  function renderBreakdown() {
    if (!breakdownEl) return;
    const item = getCatalogItem(state.category, state.taskType);
    if (!item) {
      breakdownEl.style.display = 'none';
      return;
    }
    const gross = priceFor(item);
    const points = pointsToggle && pointsToggle.checked
      ? Math.min(Number(cfg.profile.points_balance) || 0, gross)
      : 0;
    const label = rateLabel();
    const rows = [`<div><span>${escapeHtml(item.name)}</span><span>${formatMoney(item.price)}</span></div>`];
    if (rate() !== 1) {
      rows.push(`<div class="discount"><span>${escapeHtml(label)}</span><span>−${formatMoney(item.price - gross)}</span></div>`);
    }
    if (points > 0) {
      rows.push(`<div class="discount"><span>M&amp;MCore Points applied</span><span>−${formatMoney(points)}</span></div>`);
    }
    rows.push(`<div class="total"><span>Total</span><span>${formatMoney(gross - points)}${item.is_recurring ? ' /mo' : ''}</span></div>`);
    breakdownEl.innerHTML = rows.join('');
    breakdownEl.style.display = 'block';
  }

  function goToStep(n) {
    currentStep = n;
    stepEls.forEach((stepEl) => stepEl.classList.toggle('active', Number(stepEl.dataset.step) === n));
    indicatorEls.forEach((indEl) => indEl.classList.toggle('active', Number(indEl.dataset.step) === n));
    backBtn.style.display = n > 1 ? 'inline-block' : 'none';
    nextBtn.style.display = n === 3 ? 'inline-block' : 'none';
    if (n === 3) { refreshPointsControl(); renderBreakdown(); }
    if (n === 4) renderSummary();
  }

  function renderServiceOptions() {
    const optsEl = el(cfg.serviceOptionsId);
    optsEl.innerHTML = '';
    PRICING_CATALOG.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wizard-option-card';
      if (cat.category === state.category) btn.classList.add('selected');
      btn.innerHTML = `<span>${escapeHtml(cat.label || cat.category)}</span>`;
      btn.addEventListener('click', () => {
        state.category = cat.category;
        state.taskType = null;
        renderServiceOptions();
        renderTaskOptions();
        goToStep(2);
      });
      optsEl.appendChild(btn);
    });
  }

  function renderTaskOptions() {
    const optsEl = el(cfg.taskOptionsId);
    optsEl.innerHTML = '';
    const cat = getCatalogCategory(state.category);
    if (!cat) return;

    // Categories that explain their own scope (the AI marketing
    // programmes) render that note above their price list, so the gap
    // against the core catalogue reads as a different product rather
    // than an inconsistency.
    if (cat.note) {
      const note = document.createElement('p');
      note.className = 'dash-card-note wizard-category-note';
      note.textContent = cat.note;
      optsEl.appendChild(note);
    }

    const label = rateLabel();
    if (label) {
      const badge = document.createElement('p');
      badge.className = 'wizard-discount-badge';
      badge.textContent = label + ' — already applied to the prices below';
      optsEl.appendChild(badge);
    }

    cat.items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wizard-option-card';
      if (item.name === state.taskType) btn.classList.add('selected');
      const discounted = priceFor(item);
      const priceHtml = discounted !== item.price
        ? `<span class="wizard-option-price"><s>${formatMoney(item.price)}</s> ${formatMoney(discounted)}</span>`
        : `<span class="wizard-option-price">${formatMoney(discounted)}</span>`;
      btn.innerHTML = `<span>${escapeHtml(item.name)}</span>${priceHtml}`;
      btn.addEventListener('click', () => {
        state.taskType = item.name;
        renderTaskOptions();
        goToStep(3);
      });
      optsEl.appendChild(btn);
    });
  }

  function renderSummary() {
    const item = getCatalogItem(state.category, state.taskType);
    const gross = item ? priceFor(item) : 0;
    const points = pointsToggle && pointsToggle.checked
      ? Math.min(Number(cfg.profile.points_balance) || 0, gross)
      : 0;
    const description = el(cfg.descriptionId).value.trim();
    const file = el(cfg.attachmentId).files[0];
    const label = rateLabel();
    const summaryEl = el(cfg.summaryId);
    summaryEl.innerHTML = `
      <dt>Service</dt><dd>${escapeHtml(state.category)}</dd>
      <dt>Task</dt><dd>${escapeHtml(state.taskType)}</dd>
      <dt>List price</dt><dd>${formatMoney(item ? item.price : 0)}</dd>
      ${label ? `<dt>Discount</dt><dd>${escapeHtml(label)}</dd>` : ''}
      ${points > 0 ? `<dt>Points applied</dt><dd>−${formatMoney(points)}</dd>` : ''}
      <dt>Total</dt><dd><strong>${formatMoney(gross - points)}</strong></dd>
      <dt>Description</dt><dd>${escapeHtml(description) || '<em>None provided</em>'}</dd>
      ${file ? `<dt>Attachment</dt><dd>${escapeHtml(file.name)}</dd>` : ''}
    `;
  }

  if (pointsToggle) {
    pointsToggle.addEventListener('change', renderBreakdown);
  }

  backBtn.addEventListener('click', () => {
    if (currentStep > 1) goToStep(currentStep - 1);
  });

  nextBtn.addEventListener('click', () => {
    const description = el(cfg.descriptionId).value.trim();
    const errorEl = el(cfg.errorId);
    if (!description) {
      errorEl.textContent = 'Please describe what you need before continuing.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';
    goToStep(4);
  });

  el(cfg.submitBtnId).addEventListener('click', async () => {
    const errorEl = el(cfg.errorId);
    const successEl = el(cfg.successId);
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    const item = getCatalogItem(state.category, state.taskType);
    if (!item) {
      errorEl.textContent = 'Pick a service and a task before submitting.';
      errorEl.style.display = 'block';
      return;
    }

    const description = el(cfg.descriptionId).value.trim();
    const applyPoints = pointsToggle ? pointsToggle.checked : false;
    const attachmentInput = el(cfg.attachmentId);
    const attachmentStatus = el(cfg.attachmentStatusId);
    const file = attachmentInput.files[0];

    const btn = el(cfg.submitBtnId);
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    let attachmentPath = null;
    if (file) {
      attachmentStatus.textContent = 'Uploading attachment…';
      const path = `${cfg.profile.id}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabaseClient.storage
        .from('request-attachments')
        .upload(path, file);

      if (uploadError) {
        btn.disabled = false;
        btn.textContent = originalLabel;
        attachmentStatus.textContent = '';
        errorEl.textContent = 'Attachment failed to upload: ' + uploadError.message;
        errorEl.style.display = 'block';
        return;
      }
      attachmentPath = path;
      attachmentStatus.textContent = '';
    }

    // agreed_price is deliberately NOT sent: price_request() computes it
    // server-side from public.service_prices and overwrites anything the
    // browser supplies. points_applied is a request, not an instruction
    // -- the trigger caps it at the balance and at the order total.
    const { data: insertedRequest, error } = await supabaseClient
      .from('requests')
      .insert({
        user_id: cfg.profile.id,
        service_category: state.category,
        task_type: state.taskType,
        tier: 'standard',
        description,
        points_applied: applyPoints ? Number(cfg.profile.points_balance) || 0 : 0,
        attachment_path: attachmentPath
      })
      .select('id, agreed_price, points_applied, is_recurring')
      .single();

    btn.disabled = false;
    btn.textContent = originalLabel;

    if (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      return;
    }

    if (insertedRequest.points_applied > 0) {
      cfg.profile.points_balance = Math.max(
        0, Number(cfg.profile.points_balance) - Number(insertedRequest.points_applied));
      document.getElementById('pointsBalance').textContent = formatMoney(cfg.profile.points_balance);
    }

    state.category = null;
    state.taskType = null;
    el(cfg.descriptionId).value = '';
    attachmentInput.value = '';
    if (pointsToggle) pointsToggle.checked = false;
    if (breakdownEl) breakdownEl.style.display = 'none';
    renderServiceOptions();
    goToStep(1);

    successEl.textContent = cfg.successMessage;
    successEl.style.display = 'block';
    renderPaymentCTA(successEl, {
      requestId: insertedRequest.id,
      amountDue: amountDueNow(insertedRequest),
      isRecurring: insertedRequest.is_recurring
    });
    if (cfg.onSuccess) cfg.onSuccess();
  });

  renderServiceOptions();
  goToStep(1);

  return { refresh: () => { renderServiceOptions(); renderTaskOptions(); } };
}

// Storage object keys are path-like: a filename containing "/" would
// silently land in a different folder and fail the own-folder RLS check.
function safeFileName(name) {
  return String(name).replace(/[^\w.\- ]+/g, '_').slice(-120);
}

function initNewRequestWizard(profile, shared) {
  return initCatalogWizard({
    profile,
    shared,
    stepsSelector: '#requestWizard .wizard-step',
    indicatorSelector: '#wizardStepsIndicator li',
    serviceOptionsId: 'wizardServiceOptions',
    taskOptionsId: 'wizardTaskOptions',
    descriptionId: 'reqDescription',
    attachmentId: 'reqAttachment',
    attachmentStatusId: 'attachmentStatus',
    pointsRowId: 'pointsToggleRow',
    pointsNoteId: 'pointsToggleNote',
    applyPointsToggleId: 'applyPointsToggle',
    breakdownId: 'requestPriceBreakdown',
    summaryId: 'wizardSummary',
    backBtnId: 'wizardBackBtn',
    nextBtnId: 'wizardNextBtn',
    submitBtnId: 'submitRequestBtn',
    errorId: 'requestError',
    successId: 'requestSuccess',
    fixedRate: null,
    discountNote: null,
    successMessage: 'Request submitted. Pay the amount below to start it — you can track it under My Projects.',
    onSuccess: () => renderProjectsPanel(profile.id)
  });
}

// -------- M&MCore Starter Package tab --------
function initPackagesTab(profile) {
  document.getElementById('packagePrice').textContent = formatMoney(MMCORE_STARTER_PACKAGE.price);
  document.getElementById('packageSavingNote').textContent =
    `The same items ordered separately come to ${formatMoney(STARTER_PACKAGE_ALACARTE_TOTAL)} — the package saves you ` +
    `${formatMoney(STARTER_PACKAGE_ALACARTE_TOTAL - MMCORE_STARTER_PACKAGE.price)}, and unlocks 50% off every later order.`;

  document.getElementById('submitPackageBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('packageError');
    const successEl = document.getElementById('packageSuccess');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    const description = document.getElementById('pkgDescription').value.trim();
    const attachmentInput = document.getElementById('pkgAttachment');
    const attachmentStatus = document.getElementById('pkgAttachmentStatus');
    const file = attachmentInput.files[0];

    const btn = document.getElementById('submitPackageBtn');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    let attachmentPath = null;
    if (file) {
      attachmentStatus.textContent = 'Uploading attachment…';
      const path = `${profile.id}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabaseClient.storage
        .from('request-attachments')
        .upload(path, file);

      if (uploadError) {
        btn.disabled = false;
        btn.textContent = originalLabel;
        attachmentStatus.textContent = '';
        errorEl.textContent = 'Attachment failed to upload: ' + uploadError.message;
        errorEl.style.display = 'block';
        return;
      }
      attachmentPath = path;
      attachmentStatus.textContent = '';
    }

    const { data: insertedRequest, error } = await supabaseClient
      .from('requests')
      .insert({
        user_id: profile.id,
        package_key: MMCORE_STARTER_PACKAGE.key,
        tier: 'standard',
        description: `${MMCORE_STARTER_PACKAGE.label} order — priority handling, no additional scoping needed.${description ? ' ' + description : ''}`,
        attachment_path: attachmentPath
      })
      .select('id, agreed_price, is_recurring')
      .single();

    btn.disabled = false;
    btn.textContent = originalLabel;

    if (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      return;
    }

    document.getElementById('pkgDescription').value = '';
    attachmentInput.value = '';

    successEl.textContent = 'Package order submitted. Pay the amount below to start it — the 50% add-on discount unlocks once this payment is confirmed.';
    successEl.style.display = 'block';
    renderPaymentCTA(successEl, {
      requestId: insertedRequest.id,
      amountDue: amountDueNow(insertedRequest),
      isRecurring: insertedRequest.is_recurring
    });
    renderProjectsPanel(profile.id);
  });
}

let addonInitialized = false;
function unlockAddonSection(profile, shared) {
  document.getElementById('addonSection').style.display = 'block';
  document.getElementById('addonLockedNote').style.display = 'none';
  if (addonInitialized) return;
  addonInitialized = true;
  initCatalogWizard({
    profile,
    shared,
    stepsSelector: '#addonWizard .wizard-step',
    indicatorSelector: '#addonStepsIndicator li',
    serviceOptionsId: 'addonServiceOptions',
    taskOptionsId: 'addonTaskOptions',
    descriptionId: 'addonDescription',
    attachmentId: 'addonAttachment',
    attachmentStatusId: 'addonAttachmentStatus',
    summaryId: 'addonSummary',
    backBtnId: 'addonBackBtn',
    nextBtnId: 'addonNextBtn',
    submitBtnId: 'submitAddonBtn',
    errorId: 'addonError',
    successId: 'addonSuccess',
    fixedRate: 0.5,
    discountNote: 'Package client — 50% off',
    successMessage: 'Add-on request submitted at 50% off. Pay the amount below to start it.',
    onSuccess: () => renderProjectsPanel(profile.id)
  });
}

// The 50%-off add-on flow previously unlocked on ANY Starter Package
// row regardless of status, so submitting an order and never paying for
// it discounted everything else forever. It now requires a package
// order with a paid billing row -- the same condition price_request()
// enforces server-side, so the UI can no longer promise a discount the
// database will refuse to apply.
async function hasPaidStarterPackage(userId) {
  const { data } = await supabaseClient
    .from('requests')
    .select('id, billing!billing_request_id_fkey(status)')
    .eq('user_id', userId)
    .eq('package_key', 'starter');

  return Boolean(data && data.some((r) => (r.billing || []).some((b) => b.status === 'paid')));
}

async function initPackagesPanel(profile, shared) {
  initPackagesTab(profile);
  if (shared.hasPaidPackage) unlockAddonSection(profile, shared);
}

// -------- Marketing Services packages tab --------
function initMarketingPackagesTab(profile) {
  const root = document.getElementById('marketingPackageRoot');
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  root.innerHTML = MMCORE_MARKETING_PACKAGES.map((pkg, idx) => `
    <div class="package-card${pkg.featured ? ' featured' : ''}">
      ${pkg.featured ? '<span class="package-featured-tag">Most popular</span>' : ''}
      <h3>${escapeHtml(pkg.name)}</h3>
      <div class="package-price">${pkg.price !== null ? `${formatMoney(pkg.price)} <span>${escapeHtml(pkg.billing)}</span>` : `<span>${escapeHtml(pkg.billing)}</span>`}</div>
      <p>${escapeHtml(pkg.description)}</p>
      <ul class="package-list">
        ${pkg.includes.map((line) => `<li>${check} ${escapeHtml(line)}</li>`).join('')}
      </ul>
      ${pkg.price !== null
        ? `<button type="button" class="btn ${pkg.featured ? 'btn-primary' : 'btn-secondary'}" data-pkg-idx="${idx}">Start — ${formatMoney(pkg.price)}/mo</button>
           <p class="dash-card-note">${escapeHtml(MARKETING_PACKAGE_BILLING_NOTE)}</p>`
        : `<a href="https://t.me/mmcore_support" class="btn btn-secondary" target="_blank" rel="noopener">Talk to us</a>`}
      <p class="dash-card-note" id="marketingPkgNote-${idx}"></p>
    </div>
  `).join('');

  root.querySelectorAll('button[data-pkg-idx]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pkg = MMCORE_MARKETING_PACKAGES[Number(btn.dataset.pkgIdx)];
      const note = document.getElementById(`marketingPkgNote-${btn.dataset.pkgIdx}`);
      const originalLabel = btn.textContent;

      if (!confirm(`Start ${pkg.name} at ${formatMoney(pkg.price)} per month?\n\nBilled monthly in advance. You can cancel any time before the next month starts.`)) {
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Submitting…';
      note.textContent = '';

      const { data: insertedRequest, error } = await supabaseClient
        .from('requests')
        .insert({
          user_id: profile.id,
          package_key: pkg.key,
          tier: 'standard',
          description: `${pkg.name} (Marketing Services package) — monthly package, priority handling, no additional scoping needed. Includes: ${pkg.includes.join('; ')}.`
        })
        .select('id, agreed_price, is_recurring')
        .single();

      if (error) {
        btn.disabled = false;
        btn.textContent = originalLabel;
        note.textContent = error.message;
        return;
      }

      btn.textContent = 'Submitted — check My Projects';
      renderPaymentCTA(note, {
        requestId: insertedRequest.id,
        amountDue: amountDueNow(insertedRequest),
        isRecurring: insertedRequest.is_recurring
      });
      renderProjectsPanel(profile.id);
    });
  });
}

// -------- Referrals panel --------
// referral.html has always promised "a dedicated Referrals view showing
// your direct and indirect referrals at every level, plus your current
// Points balance". The dashboard only ever had a link and a number.
async function renderReferralsPanel(profile) {
  // Resolved server-side by get_my_referral_chain() (migration 0014),
  // not by querying profiles. profiles_select_own restricts SELECT to
  // auth.uid() = id, so .eq('referred_by', me) returns an empty set to
  // a client no matter how many people are actually in the chain --
  // this panel would have rendered "nobody has signed up yet" forever.
  // The RPC also masks the names it returns: sharing a link shouldn't
  // let you read another account's identity out of the API.
  const [{ data: chain, error: chainError }, { data: ledger }] = await Promise.all([
    supabaseClient.rpc('get_my_referral_chain'),
    supabaseClient.from('points_transactions').select('*').eq('user_id', profile.id)
      .order('created_at', { ascending: false }).limit(50)
  ]);

  if (chainError) console.error('Failed to load referral chain', chainError);

  const rows = chain || [];
  const level1 = rows.filter((r) => r.level === 1);
  const level2 = rows.filter((r) => r.level === 2);
  const level3 = rows.filter((r) => r.level === 3);

  const earned = (ledger || [])
    .filter((t) => t.type === 'earned_referral')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  document.getElementById('referralSummary').innerHTML = `
    <div class="referral-stat"><span class="referral-stat-value">${rows.length}</span><span>people in your chain</span></div>
    <div class="referral-stat"><span class="referral-stat-value">${formatMoney(earned)}</span><span>Points earned so far</span></div>
    <div class="referral-stat"><span class="referral-stat-value">${formatMoney(profile.points_balance)}</span><span>available to spend</span></div>
  `;

  const levels = [
    { n: 1, share: '20%', people: level1 },
    { n: 2, share: '10%', people: level2 },
    { n: 3, share: '5%', people: level3 }
  ];

  const listEl = document.getElementById('referralLevels');
  const emptyEl = document.getElementById('referralsEmpty');

  if (!level1.length) {
    emptyEl.style.display = 'block';
    listEl.innerHTML = '';
  } else {
    emptyEl.style.display = 'none';
    listEl.innerHTML = levels.map((lv) => `
      <div class="referral-level l${lv.n}">
        <div class="referral-level-head">
          <span class="level-badge">L${lv.n}</span>
          <span>${lv.share} of each project's value, on their first 3 projects</span>
          <span class="referral-level-count">${lv.people.length}</span>
        </div>
        ${lv.people.length
          ? `<ul>${lv.people.map((p) => `<li>${escapeHtml(p.display_name || 'Member')}<span>joined ${formatDate(p.joined_at)}</span></li>`).join('')}</ul>`
          : '<p class="dash-card-note">Nobody at this level yet.</p>'}
      </div>
    `).join('');
  }

  const ledgerEl = document.getElementById('pointsLedger');
  const ledgerEmpty = document.getElementById('pointsLedgerEmpty');
  if (ledger && ledger.length) {
    ledgerEmpty.style.display = 'none';
    const LABELS = {
      earned_referral: 'Referral reward',
      spent_checkout: 'Applied to an order',
      admin_adjustment: 'Adjustment'
    };
    ledgerEl.innerHTML = ledger.map((t) => `
      <div class="points-ledger-row">
        <div>
          <h4>${escapeHtml(LABELS[t.type] || t.type)}${t.referral_tier ? ` · Level ${t.referral_tier}` : ''}</h4>
          <p>${formatDate(t.created_at)}</p>
        </div>
        <span class="points-delta ${Number(t.amount) < 0 ? 'negative' : 'positive'}">${Number(t.amount) < 0 ? '−' : '+'}${formatMoney(Math.abs(t.amount))}</span>
      </div>
    `).join('');
  } else {
    ledgerEmpty.style.display = 'block';
    ledgerEl.innerHTML = '';
  }
}

// -------- Mint: the dashboard's project-intake assistant --------
// The mint-chat Edge Function and its 'mint' conversation channel
// (migration 0013) were both built and deployed, but nothing in the
// frontend ever called them. This wires it up.
function initMintChat() {
  const messagesEl = document.getElementById('mintMessages');
  const form = document.getElementById('mintForm');
  const input = document.getElementById('mintInput');
  const sendBtn = document.getElementById('mintSend');
  let loaded = false;
  let sending = false;

  function append(role, text) {
    const el = document.createElement('div');
    el.className = `mint-message mint-message-${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function appendHandoff() {
    const a = document.createElement('a');
    a.href = 'https://t.me/mmcore_managers';
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'mint-handoff-link';
    a.textContent = 'Continue with a person on Telegram →';
    messagesEl.appendChild(a);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function callMint(payload) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Not signed in');
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/mint-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error(data?.error || `Request failed (${resp.status})`);
    return data;
  }

  async function loadHistory() {
    if (loaded) return;
    loaded = true;
    try {
      const data = await callMint({ action: 'history' });
      if (data.messages && data.messages.length) {
        data.messages.forEach((m) => append(m.role, m.content));
      } else {
        append('assistant', "Hi — I'm Mint. Tell me what you're trying to build or fix and I'll help you scope it, price it, and get it into a request.");
      }
    } catch (err) {
      append('assistant', "I couldn't load our previous conversation just now. You can still send a message, or reach a person on Telegram.");
      appendHandoff();
    }
  }

  // Only talk to the Edge Function once the tab is actually opened --
  // no reason to spend a model call for someone who never looks at it.
  document.querySelector('.dash-tab[data-tab="assistant"]').addEventListener('click', loadHistory);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || sending) return;

    append('user', text);
    input.value = '';
    sending = true;
    input.disabled = true;
    sendBtn.disabled = true;
    const typing = append('assistant', '…');

    try {
      const data = await callMint({ action: 'message', message: text });
      typing.textContent = data.reply;
      if (data.needsHuman) appendHandoff();
    } catch (err) {
      typing.textContent = "Something went wrong reaching me just now. Try again in a moment, or message a person on Telegram.";
      appendHandoff();
    } finally {
      sending = false;
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  });
}

// -------- Init --------
(async () => {
  const session = await requireAuth();
  if (!session) return;

  const userId = session.user.id;
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  // Previously this only console.error'd, leaving a signed-in user
  // staring at a dashboard that silently never populated.
  if (error || !profile) {
    console.error('Failed to load profile', error);
    document.getElementById('welcomeHeading').textContent = 'We could not load your account';
    const banner = document.createElement('div');
    banner.className = 'dash-error';
    banner.style.display = 'block';
    banner.textContent = 'Your profile could not be loaded. Refresh the page, and if it keeps happening message us on Telegram — your data is safe.';
    document.querySelector('.dash-header .container').appendChild(banner);
    return;
  }

  // Shared between the wizards so both price against the same state.
  const shared = { hasPaidPackage: await hasPaidStarterPackage(userId) };

  renderHeader(profile);
  renderBusinessPoolSection(profile);
  initTabs();
  initNewRequestWizard(profile, shared);
  initPackagesPanel(profile, shared);
  initMarketingPackagesTab(profile);
  initMintChat();
  renderProjectsPanel(userId);
  renderBillingPanel(userId);
  renderReferralsPanel(profile);

  document.getElementById('logoutBtn').addEventListener('click', logOut);
})();
