// M&MCore Agency — Admin panel logic.
//
// The is_admin check below only controls what this page *shows*. Real
// enforcement is server-side: every admin_* RPC and the admin_select_all_*
// RLS policies independently re-check is_admin (see
// supabase/migrations/0005_admin_panel.sql). A user who isn't an admin
// gets an empty result set / a "Not authorized" error from the database
// itself, regardless of what this page does.

const PROJECT_STATUSES = ['in_progress', 'awaiting_review', 'revision_requested', 'delivered', 'approved'];
const BILLING_STATUSES = ['pending', 'paid', 'refunded'];

// Client-controlled strings reach this page: a user picks their own
// full_name at signup and writes their own request description, and
// staff type project names by hand. Interpolating any of that straight
// into innerHTML let a user called `<img src=x onerror=...>` run script
// inside an admin's authenticated session. Everything is escaped now.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatMoney(amount) {
  if (amount == null) return '—';
  return '$' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function emptyRow(colspan, text) {
  return `<tr class="admin-empty-row"><td colspan="${colspan}">${escapeHtml(text)}</td></tr>`;
}

function userLabel(profilesById, userId) {
  const p = profilesById[userId];
  if (!p) return userId.slice(0, 8) + '…';
  return p.full_name || (userId.slice(0, 8) + '…');
}

function selectOptions(values, current) {
  return values.map((v) =>
    `<option value="${escapeHtml(v)}"${v === current ? ' selected' : ''}>${escapeHtml(v)}</option>`
  ).join('');
}

let emailsById = {};

async function loadAll() {
  const [{ data: profiles }, { data: requests }, { data: projects }, { data: billing }, { data: emails }] =
    await Promise.all([
      supabaseClient.from('profiles').select('*'),
      supabaseClient.from('requests').select('*').order('created_at', { ascending: false }),
      supabaseClient.from('projects').select('*').order('created_at', { ascending: false }),
      supabaseClient.from('billing').select('*').order('id', { ascending: false }),
      supabaseClient.rpc('admin_list_users')
    ]);

  const profilesById = {};
  (profiles || []).forEach((p) => { profilesById[p.id] = p; });

  emailsById = {};
  (emails || []).forEach((u) => { emailsById[u.id] = u.email; });

  renderRequests(requests || [], projects || [], profilesById);
  renderProjects(projects || [], profilesById);
  renderBilling(billing || [], profilesById);
  renderProfiles(profiles || []);
}

// -------- Requests --------
function renderRequests(requests, projects, profilesById) {
  const tbody = document.querySelector('#requestsTable tbody');
  if (!requests.length) {
    tbody.innerHTML = emptyRow(7, 'No requests yet.');
    return;
  }
  const requestIdsWithProjects = new Set(projects.map((p) => p.request_id));
  tbody.innerHTML = '';
  requests.forEach((r) => {
    const tr = document.createElement('tr');
    const hasProject = requestIdsWithProjects.has(r.id);

    // Staff previously saw category/task/tier and nothing else -- not
    // the price, not the brief the client wrote, not the file they
    // attached. A project had to be created blind.
    const discount = Number(r.discount_rate) < 1
      ? ` <span class="admin-tag">${Math.round((1 - Number(r.discount_rate)) * 100)}% off</span>` : '';
    const points = Number(r.points_applied) > 0
      ? ` <span class="admin-tag">${formatMoney(r.points_applied)} pts</span>` : '';

    tr.innerHTML = `
      <td>${escapeHtml(userLabel(profilesById, r.user_id))}</td>
      <td>${escapeHtml(r.service_category || '—')}${r.task_type ? '<br><small>' + escapeHtml(r.task_type) + '</small>' : ''}${r.is_recurring ? ' <span class="admin-tag">monthly</span>' : ''}</td>
      <td>${formatMoney(r.agreed_price)}${discount}${points}${r.list_price != null && Number(r.list_price) !== Number(r.agreed_price) ? '<br><small>list ' + formatMoney(r.list_price) + '</small>' : ''}</td>
      <td>${escapeHtml(r.status)}</td>
      <td>${formatDate(r.created_at)}</td>
      <td><button type="button" class="btn btn-secondary btn-sm view-brief-btn">View</button></td>
      <td class="admin-actions"></td>
    `;

    tr.querySelector('.view-brief-btn').addEventListener('click', () =>
      showRequestDetail(r, profilesById));

    const actions = tr.querySelector('.admin-actions');

    if (hasProject) {
      actions.textContent = 'Project created';
    } else if (r.status === 'cancelled') {
      actions.textContent = 'Cancelled';
    } else {
      const createBtn = document.createElement('button');
      createBtn.type = 'button';
      createBtn.className = 'btn btn-secondary btn-sm';
      createBtn.textContent = 'Create Project';
      createBtn.addEventListener('click', async () => {
        const defaultName = `${r.service_category}${r.task_type ? ' — ' + r.task_type : ''}`;
        const projectName = prompt('Project name for this request:', defaultName);
        if (projectName === null) return;

        createBtn.disabled = true;
        createBtn.textContent = 'Creating…';
        const { error } = await supabaseClient.rpc('admin_create_project_from_request', {
          p_request_id: r.id,
          p_project_name: projectName
        });
        if (error) {
          alert('Could not create project: ' + error.message);
          createBtn.disabled = false;
          createBtn.textContent = 'Create Project';
          return;
        }
        loadAll();
      });
      actions.appendChild(createBtn);

      // Bespoke pricing for custom-scoped work. price_request()
      // overrides anything a signed-in client sends -- including an
      // admin's own browser session -- so a one-off price has to go
      // through this RPC, which opts out for its own transaction.
      const priceBtn = document.createElement('button');
      priceBtn.type = 'button';
      priceBtn.className = 'btn btn-secondary btn-sm';
      priceBtn.textContent = 'Set price';
      priceBtn.addEventListener('click', async () => {
        const raw = prompt(
          `Custom price for this request (USD).\nCurrent: ${formatMoney(r.agreed_price)}`,
          String(r.agreed_price ?? ''));
        if (raw === null) return;
        const price = Number(raw);
        if (!Number.isFinite(price) || price < 0) {
          alert('Enter a number of zero or more.');
          return;
        }
        const { error } = await supabaseClient.rpc('admin_set_request_price', {
          p_request_id: r.id,
          p_price: price
        });
        if (error) { alert('Could not set the price: ' + error.message); return; }
        loadAll();
      });
      actions.appendChild(priceBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-secondary btn-sm';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', async () => {
        if (!confirm('Cancel this request? Any Points the client spent on it are returned to their balance.')) return;
        const { error } = await supabaseClient.rpc('admin_cancel_request', { p_request_id: r.id });
        if (error) { alert('Could not cancel: ' + error.message); return; }
        loadAll();
      });
      actions.appendChild(cancelBtn);
    }

    tbody.appendChild(tr);
  });
}

// Staff could not open a client's attachment at all -- the storage
// policies from 0003 were owner-only. Migration 0014 adds an admin read
// policy, so a signed URL can now be minted here.
async function showRequestDetail(r, profilesById) {
  const section = document.getElementById('requestDetailSection');
  const el = document.getElementById('requestDetail');
  section.style.display = 'block';

  el.innerHTML = `
    <dl class="admin-detail">
      <dt>Client</dt><dd>${escapeHtml(userLabel(profilesById, r.user_id))} &middot; ${escapeHtml(emailsById[r.user_id] || 'email unavailable')}</dd>
      <dt>Service</dt><dd>${escapeHtml(r.service_category || '—')}${r.task_type ? ' — ' + escapeHtml(r.task_type) : ''}</dd>
      <dt>Price</dt><dd>${formatMoney(r.agreed_price)}${r.is_recurring ? ' per month' : ''}${
        Number(r.discount_rate) < 1 ? ` (list ${formatMoney(r.list_price)}, ${Math.round((1 - Number(r.discount_rate)) * 100)}% off)` : ''}${
        Number(r.points_applied) > 0 ? `, ${formatMoney(r.points_applied)} paid in Points` : ''}</dd>
      <dt>Status</dt><dd>${escapeHtml(r.status)}</dd>
      <dt>Request ID</dt><dd><code>${escapeHtml(r.id)}</code></dd>
      <dt>Brief</dt><dd class="admin-brief">${escapeHtml(r.description || 'None provided')}</dd>
      <dt>Attachment</dt><dd id="adminAttachmentCell">${r.attachment_path ? 'Preparing link…' : 'None'}</dd>
    </dl>
  `;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!r.attachment_path) return;

  const cell = document.getElementById('adminAttachmentCell');
  const { data, error } = await supabaseClient.storage
    .from('request-attachments')
    .createSignedUrl(r.attachment_path, 60 * 10);

  if (error || !data?.signedUrl) {
    cell.textContent = 'Could not open the attachment: ' + (error?.message || 'unknown error');
    return;
  }
  cell.innerHTML = '';
  const link = document.createElement('a');
  link.href = data.signedUrl;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = r.attachment_path.split('/').pop();
  cell.appendChild(link);
}

// -------- Projects --------
function renderProjects(projects, profilesById) {
  const tbody = document.querySelector('#projectsTable tbody');
  if (!projects.length) {
    tbody.innerHTML = emptyRow(5, 'No projects yet.');
    return;
  }
  tbody.innerHTML = '';
  projects.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(userLabel(profilesById, p.user_id))}</td>
      <td>${escapeHtml(p.project_name || 'Untitled')}</td>
      <td>${escapeHtml(p.status)}</td>
      <td>${p.revisions_used} / 2</td>
      <td>
        <select class="project-status-select">${selectOptions(PROJECT_STATUSES, p.status)}</select>
        <button type="button" class="btn btn-secondary btn-sm">Update</button>
      </td>
    `;
    const select = tr.querySelector('.project-status-select');
    const btn = tr.querySelector('button');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Saving…';
      const { error } = await supabaseClient.rpc('admin_update_project_status', {
        p_project_id: p.id,
        p_new_status: select.value
      });
      if (error) {
        alert('Could not update project: ' + error.message);
        btn.disabled = false;
        btn.textContent = 'Update';
        return;
      }
      loadAll();
    });
    tbody.appendChild(tr);
  });
}

// -------- Billing --------
function renderBilling(billing, profilesById) {
  const tbody = document.querySelector('#billingTable tbody');
  if (!billing.length) {
    tbody.innerHTML = emptyRow(5, 'No billing activity yet.');
    return;
  }
  tbody.innerHTML = '';
  billing.forEach((b) => {
    const tr = document.createElement('tr');
    // The header declares five columns; this used to emit four, with no
    // cell for "Current status" -- so every row was shifted left and the
    // status dropdown sat under the wrong heading.
    tr.innerHTML = `
      <td>${escapeHtml(userLabel(profilesById, b.user_id))}</td>
      <td>${formatMoney(b.amount)}</td>
      <td>${escapeHtml(b.payment_type)}</td>
      <td>${escapeHtml(b.status)}${b.paid_at ? '<br><small>' + formatDate(b.paid_at) + '</small>' : ''}</td>
      <td>
        <select class="billing-status-select">${selectOptions(BILLING_STATUSES, b.status)}</select>
        <button type="button" class="btn btn-secondary btn-sm">Update</button>
      </td>
    `;
    const select = tr.querySelector('.billing-status-select');
    const btn = tr.querySelector('button');
    btn.addEventListener('click', async () => {
      if (select.value === b.status) return;
      if (select.value === 'paid' && !confirm(
        `Mark ${formatMoney(b.amount)} as paid?\n\nThis credits the client's lifetime spend, may promote them into the Business Pool, and pays out referral Points up their chain. Only do this once the funds have actually arrived.`)) {
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Saving…';
      const { error } = await supabaseClient.rpc('admin_update_billing_status', {
        p_billing_id: b.id,
        p_new_status: select.value
      });
      if (error) {
        alert('Could not update billing: ' + error.message);
        btn.disabled = false;
        btn.textContent = 'Update';
        return;
      }
      loadAll();
    });
    tbody.appendChild(tr);
  });
}

// -------- Profiles --------
function renderProfiles(profiles) {
  const tbody = document.querySelector('#profilesTable tbody');
  if (!profiles.length) {
    tbody.innerHTML = emptyRow(6, 'No accounts yet.');
    return;
  }
  tbody.innerHTML = '';
  profiles.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.full_name || p.id.slice(0, 8) + '…')}${p.is_admin ? ' <span class="admin-tag">admin</span>' : ''}</td>
      <td>${escapeHtml(emailsById[p.id] || '—')}</td>
      <td>${formatMoney(p.total_spend)}</td>
      <td>${formatMoney(p.points_balance)}</td>
      <td>${p.is_business_pool ? 'Yes' : 'No'}</td>
      <td><button type="button" class="btn btn-secondary btn-sm">${p.is_business_pool ? 'Remove' : 'Flag'}</button></td>
    `;
    const btn = tr.querySelector('button');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Saving…';
      const { error } = await supabaseClient.rpc('admin_set_business_pool', {
        p_user_id: p.id,
        p_is_business_pool: !p.is_business_pool
      });
      if (error) {
        alert('Could not update Business Pool status: ' + error.message);
        btn.disabled = false;
        btn.textContent = p.is_business_pool ? 'Remove' : 'Flag';
        return;
      }
      loadAll();
    });
    tbody.appendChild(tr);
  });
}

(async () => {
  const session = await requireAuth();
  if (!session) return;

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profile || !profile.is_admin) {
    document.getElementById('adminGate').style.display = 'block';
    return;
  }

  document.getElementById('adminBody').style.display = 'block';
  loadAll();

  document.getElementById('logoutBtn').addEventListener('click', logOut);
})();
