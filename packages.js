// M&MCore Agency — Packages page: "Select & Pay" button.
//
// Inserts into requests the same way the dashboard's package tab does,
// flagged via package_key so staff can give it priority handling with no
// scoping questions -- the deliverables and price are already fixed.
//
// The price is NOT sent from here. public.service_prices /
// public.package_prices and the price_request() trigger (migration 0014)
// decide what a package costs; the number rendered on this page is
// display only, read back from the inserted row so what the client is
// told to pay is always what the server actually recorded.

const USDT_BEP20_ADDRESS = '0xdc496FcA8B8d2743b55Da0d082eAFc90f6609D8f';
const UPFRONT_FRACTION = 0.3;

function formatMoney(amount) {
  return '$' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function renderPackagePaymentPanel(container, { requestId, amountDue }) {
  const wrap = document.createElement('div');
  wrap.className = 'usdt-pay-block';
  wrap.innerHTML = `
    <p class="usdt-pay-amount">Pay <strong>${formatMoney(amountDue)}</strong> in USDT <span>(BEP20 / BNB Smart Chain)</span></p>
    <p class="package-note">That is the 30% needed to start. The remaining 70% is due once the finished work is delivered and approved.</p>
    <div class="usdt-pay-row">
      <img src="images/usdt-bep20-qr.png" alt="QR code for the M&amp;MCore USDT BEP20 deposit address" width="112" height="112">
      <div class="usdt-pay-address">
        <code>${escapeHtml(USDT_BEP20_ADDRESS)}</code>
        <button type="button" class="btn btn-secondary btn-sm copy-usdt-address-btn">Copy address</button>
      </div>
    </div>
    <p class="package-note">
      Send only <strong>USDT on BEP20</strong> — funds sent on another network cannot be recovered.
      Then message us on <a href="https://t.me/mmcore_support" target="_blank" rel="noopener">Telegram</a>
      with your request ID and transaction hash. Payments are confirmed by a person, usually within a few hours.
    </p>
    <p class="usdt-pay-reqid">Request ID: <code>${escapeHtml(requestId)}</code></p>
    <p class="package-note"><a href="dashboard.html">Track this order in your dashboard &rarr;</a></p>
  `;

  const copyBtn = wrap.querySelector('.copy-usdt-address-btn');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(USDT_BEP20_ADDRESS);
      copyBtn.textContent = 'Copied!';
    } catch (e) {
      copyBtn.textContent = 'Copy failed — select it manually';
    }
    setTimeout(() => { copyBtn.textContent = 'Copy address'; }, 2000);
  });

  container.appendChild(wrap);
}

(async () => {
  if (!requireSupabase()) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  const user = session ? session.user : null;

  document.querySelectorAll('.select-package-btn').forEach((btn) => {
    if (!user) {
      btn.textContent = 'Log in to select';
      btn.addEventListener('click', () => {
        window.location.href = 'login.html';
      });
      return;
    }

    const originalLabel = btn.textContent;

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Submitting…';

      const { data: inserted, error } = await supabaseClient
        .from('requests')
        .insert({
          user_id: user.id,
          package_key: btn.dataset.packageKey,
          tier: 'standard',
          description: `${btn.dataset.label} order — priority handling, no additional scoping needed. Ordered from the public packages page.`
        })
        .select('id, agreed_price')
        .single();

      if (error) {
        btn.disabled = false;
        btn.textContent = originalLabel;
        alert('Something went wrong submitting your package order: ' + error.message);
        return;
      }

      btn.textContent = 'Submitted';
      renderPackagePaymentPanel(btn.parentElement, {
        requestId: inserted.id,
        amountDue: Math.round(Number(inserted.agreed_price) * UPFRONT_FRACTION * 100) / 100
      });
    });
  });
})();
