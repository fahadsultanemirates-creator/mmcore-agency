// M&MCore Agency — Dashboard logic

const STATUS_LABELS = {
  draft: 'Draft',
  awaiting_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  awaiting_review: 'Awaiting your review',
  revision_requested: 'Revision requested',
  delivered: 'Delivered',
  approved: 'Approved — awaiting final payment',
  pending: 'Pending',
  paid: 'Paid',
  refunded: 'Refunded'
};

function statusPill(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="status-pill status-${status}">${label}</span>`;
}

function formatMoney(amount) {
  return '$' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// -------- Tabs --------
function initTabs() {
  const tabs = document.querySelectorAll('.dash-tab');
  tabs.forEach((tab) => {
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

const emailSupportBtn = document.getElementById('emailSupportBtn');
if (emailSupportBtn) {
  emailSupportBtn.addEventListener('click', async () => {
    const email = emailSupportBtn.dataset.email;
    const original = emailSupportBtn.textContent;
    try {
      await navigator.clipboard.writeText(email);
      emailSupportBtn.textContent = 'Copied!';
    } catch (e) {
      // Clipboard unavailable -- mailto: still gives the visitor a way
      // to reach us, so fall through to it below regardless.
    }
    window.location.href = `mailto:${email}`;
    setTimeout(() => { emailSupportBtn.textContent = original; }, 1500);
  });
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
      el.innerHTML = `
        <div>
          <h4>${r.service_category}</h4>
          <p>Submitted ${formatDate(r.created_at)}</p>
        </div>
        ${statusPill(r.status)}
      `;
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
          <h4>${p.project_name || 'Untitled project'}</h4>
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
          <h4>${formatMoney(b.amount)} — ${b.payment_type}</h4>
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

// -------- New Request wizard --------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// -------- Checkout: USDT (BEP20), the sole payment method --------
// 30% due upfront, same split shown to visitors on services.html/terms.html.
const UPFRONT_FRACTION = 0.3;
const USDT_BEP20_ADDRESS = '0xdc496FcA8B8d2743b55Da0d082eAFc90f6609D8f';

function upfrontAmountDue(agreedPrice) {
  return Math.round(agreedPrice * UPFRONT_FRACTION * 100) / 100;
}

// Renders the USDT (BEP20) payment instructions into an already-visible
// success banner. Payments aren't automatically confirmed (no webhook
// watches this address), so this asks the client to notify support with
// their request id + transaction hash for manual review.
function renderPaymentCTA(container, { requestId, amountDue }) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = 'var(--space-sm, 0.75rem)';

  const usdtCol = document.createElement('div');
  usdtCol.innerHTML = `
    <p class="dash-card-note" style="margin:0 0 0.4rem;">Pay ${formatMoney(amountDue)} in USDT (BEP20 / BNB Smart Chain) to start your project:</p>
    <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
      <img src="images/usdt-bep20-qr.png" alt="USDT BEP20 address QR code" style="width:80px;height:80px;border-radius:6px;">
      <div>
        <code style="font-size:0.8rem;word-break:break-all;">${USDT_BEP20_ADDRESS}</code><br>
        <button type="button" class="btn btn-secondary btn-sm copy-usdt-address-btn" style="margin-top:0.3rem;">Copy address</button>
      </div>
    </div>
    <p class="dash-card-note" style="margin:0.4rem 0 0;">After sending, message us on <a href="https://t.me/AgenticCoreAgency" target="_blank" rel="noopener">Telegram</a> with your request ID (<code>${requestId}</code>) and transaction hash so we can confirm it — payments are verified manually.</p>
  `;
  wrap.appendChild(usdtCol);

  const copyBtn = usdtCol.querySelector('.copy-usdt-address-btn');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(USDT_BEP20_ADDRESS).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy address'; }, 1500);
    });
  });

  container.appendChild(wrap);
}

// Generic service->task->details->submit catalog wizard, shared by the
// New Request tab (full price) and the Packages tab's 50%-off add-on
// flow (same steps, discounted price + a note on the order). Only one
// tier exists at M&MCore, so unlike AgenticCore's wizard there's no
// separate tier-picking step -- the price shown at the task step is the
// price, full stop.
function initCatalogWizard(cfg) {
  const el = (id) => document.getElementById(id);
  const pointsRow = cfg.pointsRowId ? el(cfg.pointsRowId) : null;
  const pointsNote = cfg.pointsNoteId ? el(cfg.pointsNoteId) : null;
  if (pointsRow && Number(cfg.profile.points_balance) > 0) {
    pointsRow.style.display = 'block';
    pointsNote.textContent = `You have ${formatMoney(cfg.profile.points_balance)} in Points. Check this box and we'll apply up to that amount when your price is finalized.`;
  }

  const state = { category: null, taskType: null };
  let currentStep = 1;

  const stepEls = document.querySelectorAll(cfg.stepsSelector);
  const indicatorEls = document.querySelectorAll(cfg.indicatorSelector);
  const backBtn = el(cfg.backBtnId);
  const nextBtn = el(cfg.nextBtnId);

  function priceFor(item) {
    return Math.round(item.price * cfg.priceMultiplier * 100) / 100;
  }

  function goToStep(n) {
    currentStep = n;
    stepEls.forEach((stepEl) => stepEl.classList.toggle('active', Number(stepEl.dataset.step) === n));
    indicatorEls.forEach((indEl) => indEl.classList.toggle('active', Number(indEl.dataset.step) === n));
    backBtn.style.display = n > 1 ? 'inline-block' : 'none';
    nextBtn.style.display = n === 3 ? 'inline-block' : 'none';
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
    cat.items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wizard-option-card';
      if (item.name === state.taskType) btn.classList.add('selected');
      btn.innerHTML = `<span>${escapeHtml(item.name)}</span><span class="wizard-option-price">${formatMoney(priceFor(item))}</span>`;
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
    const price = item ? priceFor(item) : 0;
    const description = el(cfg.descriptionId).value.trim();
    const file = el(cfg.attachmentId).files[0];
    const summaryEl = el(cfg.summaryId);
    summaryEl.innerHTML = `
      <dt>Service</dt><dd>${escapeHtml(state.category)}</dd>
      <dt>Task</dt><dd>${escapeHtml(state.taskType)}</dd>
      <dt>Price</dt><dd>${formatMoney(price)}${cfg.discountNote ? ' <span style="color:var(--text-tertiary);font-size:0.8rem;">(50% off applied)</span>' : ''}</dd>
      <dt>Description</dt><dd>${escapeHtml(description) || '<em>None provided</em>'}</dd>
      ${file ? `<dt>Attachment</dt><dd>${escapeHtml(file.name)}</dd>` : ''}
    `;
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
    let description = el(cfg.descriptionId).value.trim();
    const applyPoints = cfg.applyPointsToggleId ? el(cfg.applyPointsToggleId).checked : false;
    const attachmentInput = el(cfg.attachmentId);
    const attachmentStatus = el(cfg.attachmentStatusId);
    const file = attachmentInput.files[0];

    if (cfg.discountNote) {
      description += `\n\n[${cfg.discountNote}]`;
    }
    if (applyPoints) {
      description += `\n\n[Requested: apply up to ${formatMoney(cfg.profile.points_balance)} in Points toward this project.]`;
    }

    const btn = el(cfg.submitBtnId);
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    let attachmentPath = null;
    if (file) {
      attachmentStatus.textContent = 'Uploading attachment…';
      const path = `${cfg.profile.id}/${Date.now()}-${file.name}`;
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

    const agreedPrice = priceFor(item);

    const { data: insertedRequest, error } = await supabaseClient
      .from('requests')
      .insert({
        user_id: cfg.profile.id,
        service_category: state.category,
        task_type: state.taskType,
        tier: 'standard',
        description,
        agreed_price: agreedPrice,
        status: 'awaiting_payment',
        attachment_path: attachmentPath
      })
      .select('id')
      .single();

    if (error) {
      btn.disabled = false;
      btn.textContent = originalLabel;
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      return;
    }

    btn.disabled = false;
    btn.textContent = originalLabel;

    state.category = null;
    state.taskType = null;
    el(cfg.descriptionId).value = '';
    attachmentInput.value = '';
    if (cfg.applyPointsToggleId) el(cfg.applyPointsToggleId).checked = false;
    renderServiceOptions();
    goToStep(1);

    successEl.textContent = cfg.successMessage;
    successEl.style.display = 'block';
    renderPaymentCTA(successEl, { requestId: insertedRequest.id, amountDue: upfrontAmountDue(agreedPrice) });
    if (cfg.onSuccess) cfg.onSuccess();
  });

  renderServiceOptions();
  goToStep(1);
}

function initNewRequestWizard(profile) {
  initCatalogWizard({
    profile,
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
    summaryId: 'wizardSummary',
    backBtnId: 'wizardBackBtn',
    nextBtnId: 'wizardNextBtn',
    submitBtnId: 'submitRequestBtn',
    errorId: 'requestError',
    successId: 'requestSuccess',
    priceMultiplier: 1,
    discountNote: null,
    successMessage: 'Request submitted — we\'ll follow up shortly. You can track it under My Projects.',
    onSuccess: () => renderProjectsPanel(profile.id)
  });
}

// -------- M&MCore Starter Package tab --------
function initPackagesTab(profile) {
  document.getElementById('packagePrice').textContent = formatMoney(MMCORE_STARTER_PACKAGE.price);

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
      const path = `${profile.id}/${Date.now()}-${file.name}`;
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
        service_category: 'M&MCore Starter Package',
        tier: 'standard',
        description: `${MMCORE_STARTER_PACKAGE.label} order — priority handling, no additional scoping needed.${description ? ' ' + description : ''}`,
        agreed_price: MMCORE_STARTER_PACKAGE.price,
        status: 'awaiting_payment',
        attachment_path: attachmentPath
      })
      .select('id')
      .single();

    if (error) {
      btn.disabled = false;
      btn.textContent = originalLabel;
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      return;
    }

    btn.disabled = false;
    btn.textContent = originalLabel;

    document.getElementById('pkgDescription').value = '';
    attachmentInput.value = '';

    successEl.textContent = 'Package order submitted — you can now add extra services at 50% off below, and track your order under My Projects.';
    successEl.style.display = 'block';
    renderPaymentCTA(successEl, { requestId: insertedRequest.id, amountDue: upfrontAmountDue(MMCORE_STARTER_PACKAGE.price) });
    unlockAddonSection(profile);
    renderProjectsPanel(profile.id);
  });
}

let addonInitialized = false;
function unlockAddonSection(profile) {
  document.getElementById('addonSection').style.display = 'block';
  document.getElementById('addonLockedNote').style.display = 'none';
  if (addonInitialized) return;
  addonInitialized = true;
  initCatalogWizard({
    profile,
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
    priceMultiplier: 0.5,
    discountNote: 'Active M&MCore Package client — 50% off applied',
    successMessage: 'Add-on request submitted at 50% off — you can track it under My Projects.',
    onSuccess: () => renderProjectsPanel(profile.id)
  });
}

async function initPackagesPanel(profile) {
  initPackagesTab(profile);

  const { data: pastPackages } = await supabaseClient
    .from('requests')
    .select('id')
    .eq('user_id', profile.id)
    .eq('service_category', 'M&MCore Starter Package');

  if (pastPackages && pastPackages.length) {
    unlockAddonSection(profile);
  }
}

// -------- Marketing Services packages tab --------
// Same "Select & Pay" pattern as the M&MCore Starter Package tab (insert
// into requests, then show the USDT payment CTA) -- just driven by
// MMCORE_MARKETING_PACKAGES instead of the single starter bundle. The
// Custom Package never has a price, so it links straight to Telegram
// support instead of submitting a request.
function initMarketingPackagesTab(profile) {
  const root = document.getElementById('marketingPackageRoot');
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  root.innerHTML = MMCORE_MARKETING_PACKAGES.map((pkg, idx) => `
    <div class="package-card${pkg.featured ? ' featured' : ''}">
      ${pkg.featured ? '<span class="package-featured-tag">Most popular</span>' : ''}
      <h3>${pkg.name}</h3>
      <div class="package-price">${pkg.price !== null ? `${formatMoney(pkg.price)} <span>${pkg.billing}</span>` : `<span>${pkg.billing}</span>`}</div>
      <p>${pkg.description}</p>
      <ul class="package-list">
        ${pkg.includes.map((line) => `<li>${check} ${line}</li>`).join('')}
      </ul>
      ${pkg.price !== null
        ? `<button type="button" class="btn ${pkg.featured ? 'btn-primary' : 'btn-secondary'}" data-pkg-idx="${idx}">Get started — ${formatMoney(pkg.price)}/mo</button>`
        : `<a href="https://t.me/AgenticCoreAgency" class="btn btn-secondary" target="_blank" rel="noopener">Talk to us</a>`}
      <p class="dash-card-note" id="marketingPkgNote-${idx}"></p>
    </div>
  `).join('');

  root.querySelectorAll('button[data-pkg-idx]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pkg = MMCORE_MARKETING_PACKAGES[Number(btn.dataset.pkgIdx)];
      const note = document.getElementById(`marketingPkgNote-${btn.dataset.pkgIdx}`);
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Submitting…';
      note.textContent = '';

      const { data: insertedRequest, error } = await supabaseClient
        .from('requests')
        .insert({
          user_id: profile.id,
          service_category: `Marketing — ${pkg.name}`,
          tier: 'standard',
          description: `${pkg.name} (Marketing Services package) — monthly package, priority handling, no additional scoping needed. Includes: ${pkg.includes.join('; ')}.`,
          agreed_price: pkg.price,
          status: 'awaiting_payment'
        })
        .select('id')
        .single();

      if (error) {
        btn.disabled = false;
        btn.textContent = originalLabel;
        note.textContent = error.message;
        return;
      }

      btn.disabled = false;
      btn.textContent = 'Submitted — check My Projects';
      note.textContent = 'Order submitted.';
      renderPaymentCTA(note, { requestId: insertedRequest.id, amountDue: upfrontAmountDue(pkg.price) });
      renderProjectsPanel(profile.id);
    });
  });
}

// -------- Forge FAB: "Mint", the dashboard's own project-intake assistant --------
// Same visual pattern as the homepage chat-widget, wired to the mint-chat
// Edge Function instead of widget-chat -- authenticated, and able to file
// a manager task directly from the conversation.
const MINT_TELEGRAM_URL = 'https://t.me/AgenticCoreAgency';
const MINT_GREETING = "Hi, I'm Mint — describe a project you'd like to start, or ask about pricing, timelines, or how anything here works.";
const MINT_ERROR_REPLY = "Something went wrong reaching Mint just now. Please try again in a moment, or message us directly on Telegram.";

async function callMintChat(action, payload) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/mint-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(data?.error || `mint-chat failed (${resp.status})`);
  return data;
}

function buildForgeFabMarkup() {
  const wrap = document.createElement('div');
  wrap.className = 'forge-fab';
  wrap.innerHTML = `
    <button type="button" class="forge-fab-toggle" id="forgeFabToggle" aria-label="Chat with Mint" aria-expanded="false">
      <svg id="forgeFabIconChat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      <svg id="forgeFabIconClose" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div class="forge-fab-panel" id="forgeFabPanel" hidden>
      <div class="forge-fab-header"><span>Mint — Project Assistant</span></div>
      <div class="forge-fab-messages" id="forgeFabMessages" aria-live="polite"></div>
      <form class="forge-fab-form" id="forgeFabForm">
        <input type="text" id="forgeFabInput" class="forge-fab-input" placeholder="Describe your project or ask a question…" autocomplete="off" maxlength="4000">
        <button type="submit" class="forge-fab-send" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
    </div>
  `;
  return wrap;
}

function appendForgeMessage(container, role, text) {
  const el = document.createElement('div');
  el.className = `forge-fab-message forge-fab-message-${role}`;
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function appendForgeHandoffLink(container) {
  const el = document.createElement('a');
  el.href = MINT_TELEGRAM_URL;
  el.target = '_blank';
  el.rel = 'noopener';
  el.style.cssText = 'align-self:flex-start;color:var(--accent-magenta);font-size:0.82rem;border-bottom:1px solid rgba(229,22,154,0.3);padding-bottom:2px;';
  el.textContent = 'Continue with a human on Telegram →';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function appendForgeTyping(container) {
  const el = document.createElement('div');
  el.className = 'forge-fab-message forge-fab-message-assistant forge-fab-typing';
  el.id = 'forgeFabTyping';
  el.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function removeForgeTyping() {
  const el = document.getElementById('forgeFabTyping');
  if (el) el.remove();
}

function initForgeFab() {
  document.body.appendChild(buildForgeFabMarkup());

  const toggleBtn = document.getElementById('forgeFabToggle');
  const iconChat = document.getElementById('forgeFabIconChat');
  const iconClose = document.getElementById('forgeFabIconClose');
  const panel = document.getElementById('forgeFabPanel');
  const messagesEl = document.getElementById('forgeFabMessages');
  const form = document.getElementById('forgeFabForm');
  const input = document.getElementById('forgeFabInput');

  let opened = false;
  let sending = false;

  async function openPanel() {
    panel.hidden = false;
    iconChat.style.display = 'none';
    iconClose.style.display = 'block';
    toggleBtn.setAttribute('aria-expanded', 'true');
    input.focus();

    if (opened) return;
    opened = true;

    try {
      const { messages } = await callMintChat('history', {});
      if (messages && messages.length) {
        messages.forEach((m) => appendForgeMessage(messagesEl, m.role, m.content));
        return;
      }
    } catch (e) {
      console.error('forge-fab: history load failed', e);
    }
    appendForgeMessage(messagesEl, 'assistant', MINT_GREETING);
  }

  function closePanel() {
    panel.hidden = true;
    iconChat.style.display = 'block';
    iconClose.style.display = 'none';
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  toggleBtn.addEventListener('click', () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || sending) return;

    appendForgeMessage(messagesEl, 'user', text);
    input.value = '';
    sending = true;
    input.disabled = true;
    appendForgeTyping(messagesEl);

    try {
      const result = await callMintChat('message', { message: text });
      removeForgeTyping();
      appendForgeMessage(messagesEl, 'assistant', result.reply);
      if (result.needsHuman) appendForgeHandoffLink(messagesEl);
    } catch (err) {
      console.error('forge-fab: message failed', err);
      removeForgeTyping();
      appendForgeMessage(messagesEl, 'assistant', MINT_ERROR_REPLY);
      appendForgeHandoffLink(messagesEl);
    } finally {
      sending = false;
      input.disabled = false;
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

  if (error || !profile) {
    console.error('Failed to load profile', error);
    return;
  }

  renderHeader(profile);
  renderBusinessPoolSection(profile);
  initTabs();
  initNewRequestWizard(profile);
  initPackagesPanel(profile);
  initMarketingPackagesTab(profile);
  renderProjectsPanel(userId);
  renderBillingPanel(userId);
  initForgeFab();

  document.getElementById('logoutBtn').addEventListener('click', logOut);
})();
