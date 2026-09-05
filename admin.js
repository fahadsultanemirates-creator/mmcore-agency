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

function formatMoney(amount) {
  return '$' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function emptyRow(colspan, text) {
  return `<tr class="admin-empty-row"><td colspan="${colspan}">${text}</td></tr>`;
}

function userLabel(profilesById, userId) {
  const p = profilesById[userId];
  if (!p) return userId.slice(0, 8) + '…';
  return p.full_name || (userId.slice(0, 8) + '…');
}

function selectOptions(values, current) {
  return values.map((v) => `<option value="${v}" ${v === current ? 'selected' : ''}>${v}</option>`).join('');
}

async function loadAll() {
  const [{ data: profiles }, { data: requests }, { data: projects }, { data: billing }] = await Promise.all([
    supabaseClient.from('profiles').select('*'),
    supabaseClient.from('requests').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('projects').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('billing').select('*').order('id', { ascending: false })
  ]);

  const profilesById = {};
  (profiles || []).forEach((p) => { profilesById[p.id] = p; });

  renderRequests(requests || [], projects || [], profilesById);
  renderProjects(projects || [], profilesById);
  renderBilling(billing || [], profilesById);
  renderProfiles(profiles || []);
}

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
    tr.innerHTML = `
      <td>${userLabel(profilesById, r.user_id)}</td>
      <td>${r.service_category}</td>
      <td>${r.task_type || '—'}</td>
      <td>${r.tier}</td>
      <td>${r.status}</td>
      <td>${formatDate(r.created_at)}</td>
      <td>${hasProject ? 'Project created' : '<button type="button" class="btn btn-secondary btn-sm create-project-btn">Create Project</button>'}</td>
    `;
    const btn = tr.querySelector('.create-project-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        const defaultName = `${r.service_category}${r.task_type ? ' — ' + r.task_type : ''}`;
        const projectName = prompt('Project name for this request:', defaultName);
        if (projectName === null) return;

        btn.disabled = true;
        btn.textContent = 'Creating…';
        const { error } = await supabaseClient.rpc('admin_create_project_from_request', {
          p_request_id: r.id,
          p_project_name: projectName
        });
        if (error) {
          alert('Could not create project: ' + error.message);
          btn.disabled = false;
          btn.textContent = 'Create Project';
          return;
        }
        loadAll();
      });
    }
    tbody.appendChild(tr);
  });
}

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
      <td>${userLabel(profilesById, p.user_id)}</td>
      <td>${p.project_name || 'Untitled'}</td>
      <td>${p.status}</td>
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

function renderBilling(billing, profilesById) {
  const tbody = document.querySelector('#billingTable tbody');
  if (!billing.length) {
    tbody.innerHTML = emptyRow(5, 'No billing activity yet.');
    return;
  }
  tbody.innerHTML = '';
  billing.forEach((b) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${userLabel(profilesById, b.user_id)}</td>
      <td>${formatMoney(b.amount)}</td>
      <td>${b.payment_type}</td>
      <td>
        <select class="billing-status-select">${selectOptions(BILLING_STATUSES, b.status)}</select>
        <button type="button" class="btn btn-secondary btn-sm">Update</button>
      </td>
    `;
    const select = tr.querySelector('.billing-status-select');
    const btn = tr.querySelector('button');
    btn.addEventListener('click', async () => {
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

function renderProfiles(profiles) {
  const tbody = document.querySelector('#profilesTable tbody');
  if (!profiles.length) {
    tbody.innerHTML = emptyRow(4, 'No accounts yet.');
    return;
  }
  tbody.innerHTML = '';
  profiles.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.full_name || p.id.slice(0, 8) + '…'}</td>
      <td>${formatMoney(p.total_spend)}</td>
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
