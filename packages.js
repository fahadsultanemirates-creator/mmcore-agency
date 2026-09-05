// M&MCore Agency — Packages page: "Select & Pay" button.
// Wired the same way dashboard.js's New Request form submits (an insert
// into requests), but flagged as a package order via service_category so
// staff can flag it for priority handling with no scoping questions --
// the deliverables and price are already fixed for the package.

const PACKAGE_DELIVERABLES = 'Single landing page website, 5 social media posts, 3 branded documents (client choice of business card, receipt, letterhead, or similar), a 10-page business brochure PDF, and an all-in-one strategy report PDF (feasibility snapshot, marketing roadmap, competitive landscape).';

(async () => {
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
      const price = Number(btn.dataset.price);
      const label = btn.dataset.label;

      btn.disabled = true;
      btn.textContent = 'Submitting…';

      const { error } = await supabaseClient.from('requests').insert({
        user_id: user.id,
        service_category: 'M&MCore Starter Package',
        tier: 'standard',
        description: `${label} order — priority handling, no additional scoping needed. Includes: ${PACKAGE_DELIVERABLES}`,
        agreed_price: price,
        status: 'awaiting_payment'
      });

      if (error) {
        btn.disabled = false;
        btn.textContent = originalLabel;
        alert('Something went wrong submitting your package order: ' + error.message);
        return;
      }

      btn.textContent = 'Submitted — check your dashboard';
    });
  });
})();
