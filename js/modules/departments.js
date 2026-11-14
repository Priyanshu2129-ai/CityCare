/* =========================================================
   departments.js - Departments module
   Renders the department list, add/edit/view modals, search,
   delete with confirmation.
   Wrapped in an IIFE so naming collisions with other modules
   do not occur when loaded as classic <script> tags.
   ========================================================= */

(function () {
'use strict';

function depDefaults() {
  return {
    id: genDepartmentId(),
    name: '', head: '', phone: '',
    location: '', timings: '', description: ''
  };
}

/* ---- MongoDB-backed module state. Mongo is the single source of truth;
   renderers read `state` and mirror to LocalStorage through
   syncDepartmentsToLocal so other pages keep working unchanged. ---- */
let state = { departments: [], loaded: false, loading: false, error: null, q: '' };
let deptEditId = null;

async function loadDepartments(force) {
  if (state.loading) return;
  if (!force && state.loaded) return;
  state.loading = true;
  state.error = null;
  render();
  const { ok, data } = await apiRequest('/api/departments');
  if (ok && data && data.ok) {
    state.departments = Array.isArray(data.departments) ? data.departments : [];
    syncDepartmentsToLocal(state.departments); // read-only mirror for other pages
    state.error = null;
  } else {
    state.error = (data && data.error === 'UNAUTHORIZED')
      ? 'Please sign in to manage departments.'
      : 'Could not load departments from the server.';
  }
  state.loading = false;
  state.loaded = true;
  render();
}

function departmentCardIcon(name) {
  // simple deterministic color by department name
  const colors = ['teal', 'purple', 'orange', 'green'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

/* ---------- modal form (add + edit) ---------- */

function departmentFormHTML(p) {
  const g = { ...depDefaults(), ...(p || {}) };
  const isEdit = !!p;

  return `
  <div class="modal-head">
    <div>
      <h2>${isEdit ? 'Edit Department' : 'Add Department'}</h2>
      <p>${isEdit ? 'Update the department information.' : 'Register a new department.'}</p>
    </div>
    <button type="button" class="icon-button" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
  </div>
  <form id="departmentForm" novalidate>
    <div class="form-grid">
      <div class="form-group">
        <label>Department ID</label>
        <input class="input" value="${esc(g.id)}" disabled>
      </div>
      <div class="form-group">
        <label>Department Name *</label>
        <input class="input" id="dep-name" value="${esc(g.name)}" placeholder="e.g. Cardiology" list="depNameList">
        <datalist id="depNameList">
          <option value="Cardiology"><option value="Neurology"><option value="Orthopedics">
          <option value="Pediatrics"><option value="Dermatology"><option value="General Medicine">
          <option value="Emergency">
        </datalist>
      </div>
      <div class="form-group">
        <label>Department Head</label>
        <input class="input" id="dep-head" value="${esc(g.head)}" placeholder="e.g. Dr. Safia Rahman">
      </div>
      <div class="form-group">
        <label>Contact Phone</label>
        <input class="input" id="dep-phone" value="${esc(g.phone)}" placeholder="e.g. 555-1001">
      </div>
      <div class="form-group">
        <label>Location / Building</label>
        <input class="input" id="dep-location" value="${esc(g.location)}" placeholder="e.g. Block A, 2nd Floor">
      </div>
      <div class="form-group">
        <label>Working Hours</label>
        <input class="input" id="dep-timings" value="${esc(g.timings)}" placeholder="e.g. 8:00-16:00">
      </div>
      <div class="form-group full">
        <label>Description</label>
        <textarea class="input" id="dep-desc" placeholder="Short description of the department">${esc(g.description)}</textarea>
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Cancel</button>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Department'}</button>
    </div>
  </form>`;
}

async function handleDepartmentForm(e, id) {
  e.preventDefault();
  const val = (sel) => ($(sel) ? $(sel).value.trim() : '');

  const data = {
    name: val('#dep-name'),
    head: val('#dep-head'),
    phone: val('#dep-phone'),
    location: val('#dep-location'),
    timings: val('#dep-timings'),
    description: val('#dep-desc')
  };

  const isEdit = !!id;

  const ok = validateForm([
    { id: 'dep-name', value: data.name, test: (v) => v.length >= 2, msg: 'Department name is required (min 2 characters).' },
    { id: 'dep-phone', value: data.phone, test: (v) => !v || v.replace(/\D/g, '').length >= 7, msg: 'Enter a valid phone number.' }
  ]);
  if (!ok) return;

  const btn = $('#departmentForm') && $('#departmentForm').querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  // Write through the API (Mongo is the source of truth). Unique-name and other
  // server checks apply; a failed write is NOT saved locally and the modal stays.
  const res = isEdit
    ? await apiRequest('/api/departments/' + encodeURIComponent(id), { method: 'PATCH', body: data })
    : await apiRequest('/api/departments', { method: 'POST', body: data });

  if (btn) { btn.disabled = false; btn.textContent = isEdit ? 'Save Changes' : 'Add Department'; }

  if (res.ok && res.data && res.data.ok) {
    closeModal();
    state.loaded = false;
    await loadDepartments(true);
    refreshAll();
    toast(isEdit ? 'Department updated.' : 'Department added successfully.', 'success');
  } else {
    const errors = (res.data && res.data.errors) || {};
    setFieldError('dep-name', errors.name || '');
    setFieldError('dep-phone', errors.phone || '');
    const msg = (res.data && res.data.message) || '';
    // Distinguish the 409 duplicate-name/assigned cases for a clear message.
    if (!Object.keys(errors).length) {
      if (res.status === 409) setFieldError('dep-name', msg || 'A department with this name already exists.');
      else toast(msg || 'Could not save the department.', 'error');
    }
  }
}

/* ---------- view modal ---------- */

function departmentDetailHTML(d) {
  // count doctors in this department and appointments
  const doctors = Store.getAll('doctors').filter((x) => (x.department || '').toLowerCase() === (d.name || '').toLowerCase());
  const appts = Store.getAll('appointments').filter((a) => (a.department || '').toLowerCase() === (d.name || '').toLowerCase());

  return `
  <div class="modal-head">
    <div><h2>Department Profile</h2><p>${esc(d.id)}</p></div>
    <button type="button" class="icon-button" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
  </div>
  <div class="meta-grid">
    <div class="meta-cell"><span class="meta-label">Department</span><span class="meta-value">${esc(d.name)}</span></div>
    <div class="meta-cell"><span class="meta-label">Head</span><span class="meta-value">${esc(d.head || '—')}</span></div>
    <div class="meta-cell"><span class="meta-label">Phone</span><span class="meta-value">${esc(d.phone || '—')}</span></div>
    <div class="meta-cell"><span class="meta-label">Location</span><span class="meta-value">${esc(d.location || '—')}</span></div>
    <div class="meta-cell"><span class="meta-label">Working Hours</span><span class="meta-value">${esc(d.timings || '—')}</span></div>
    <div class="meta-cell"><span class="meta-label">Doctors</span><span class="meta-value">${doctors.length}</span></div>
    <div class="meta-cell"><span class="meta-label">Appointments</span><span class="meta-value">${appts.length}</span></div>
    <div class="meta-cell full" style="grid-column:1/-1;"><span class="meta-label">Description</span><span class="meta-value" style="font-weight:500;">${esc(d.description || 'No description')}</span></div>
  </div>
  ${doctors.length ? `
    <h3 style="font-size:15px;margin:18px 0 8px;">Doctors in <b>${esc(d.name)}</b></h3>
    <div class="list-block">${doctors.map((doc) => `
      <div class="list-item"><div class="list-item-main">
        <span class="list-item-name">${esc(doc.name)}</span><span class="list-item-sub">${esc(doc.specialization || '')}</span>
      </div><span class="badge ${doc.available ? 'available' : 'unavailable'}">${doc.available ? 'Available' : 'Not Available'}</span></div>`).join('')}
    </div>` : ''}
  <div class="form-actions">
    <button type="button" class="btn btn-secondary" data-action="edit" data-module="departments" data-id="${esc(d.id)}">Edit Department</button>
    <button type="button" class="btn btn-secondary" data-close>Close</button>
  </div>`;
}

/* ---------- search ---------- */

function departmentFilter() {
  const box = $('#departmentsSearch') || $('[data-departments-search]');
  const q = (box ? box.value : '').toLowerCase().trim();
  return Store.getAll('departments')
    .filter((d) => !q ||
      d.name.toLowerCase().includes(q) ||
      (d.id || '').toLowerCase().includes(q) ||
      (d.head || '').toLowerCase().includes(q));
}

function departmentQuery() {
  return ((($('#departmentsSearch') || $('[data-departments-search]') || {}).value) || '');
}

/* ---------- render ---------- */

function departmentsTableHTML(list) {
  if (!list.length) {
    return `<div class="table-wrap"><div class="empty-block">No departments found. Click <b>Add Department</b> to create one.</div></div>`;
  }
  const rows = list.map((d) => {
    const icon = departmentCardIcon(d.name || 'Dept');
    const doctors = Store.getAll('doctors').filter((x) => (x.department || '').toLowerCase() === (d.name || '').toLowerCase()).length;
    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="avatar ${icon}">${esc((d.name || 'Dept')[0].toUpperCase())}</span>
          <div><div class="primary-text">${esc(d.name)}</div><div class="muted-text">${esc(d.location || '')}</div></div>
        </div>
      </td>
      <td><span class="chip chip-orange">${esc(d.id)}</span></td>
      <td>${esc(d.head || '—')}</td>
      <td>${esc(d.timings || '—')}</td>
      <td>${doctors}</td>
      <td>${esc(d.phone || '—')}</td>
      <td class="actions-col">
        <div class="actions">
          <button class="btn btn-sm btn-ghost" data-action="view" data-module="departments" data-id="${esc(d.id)}">View</button>
          <button class="btn btn-sm btn-secondary" data-action="edit" data-module="departments" data-id="${esc(d.id)}">Edit</button>
          <button class="btn btn-sm btn-danger" data-action="del" data-module="departments" data-id="${esc(d.id)}">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="table">
    <thead><tr>
      <th>Department</th><th>ID</th><th>Head</th><th>Hours</th><th>Doctors</th><th>Phone</th>
      <th class="actions-col">Actions</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function render() {
  const mount = document.getElementById('mount-departments');
  if (!mount) return;
  if (!state.loaded && !state.loading) { loadDepartments(); }
  const q = (state.q || '').trim().toLowerCase();
  const list = state.departments.filter((d) => {
    return !q ||
      String(d.name || '').toLowerCase().includes(q) ||
      String(d.id || '').toLowerCase().includes(q) ||
      String(d.head || '').toLowerCase().includes(q);
  });

  const body = state.error
    ? `<div class="empty-block" style="color:var(--rose-600)">${esc(state.error)}</div>`
    : (state.loading && !state.departments.length)
      ? `<div class="empty-block">Loading departments...</div>`
      : departmentsTableHTML(list);

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Departments</h1>
        <p class="subtitle">Organize and manage hospital departments.</p>
      </div>
      <button type="button" class="btn btn-primary" data-open-btn="departments">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        Add Department
      </button>
    </div>
    <div class="table-toolbar">
      <div class="search-input">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input class="input" id="departmentsSearch" data-departments-search value="${esc(state.q || '')}" placeholder="Search name, ID or head...">
      </div>
      <span class="muted-text" style="color:var(--muted);font-size:12.5px;">${list.length} department${list.length === 1 ? '' : 's'}</span>
    </div>
    ${body}
  `;
}

/* ---------- actions ---------- */

function open() {
  openModal(departmentFormHTML(null));
  $('#departmentForm').addEventListener('submit', (e) => handleDepartmentForm(e, null));
}

function onAction(e, btn) {
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const d = state.departments.find((x) => String(x.id) === String(id)) || Store.getById('departments', id);
  if (!d) return;

  if (action === 'view') {
    openModal(departmentDetailHTML(d));
  } else if (action === 'edit') {
    openModal(departmentFormHTML(d));
    $('#departmentForm').addEventListener('submit', (ev) => handleDepartmentForm(ev, id));
  } else if (action === 'del') {
    confirmDialog({
      title: 'Delete Department',
      message: `Delete the ${d.name} department (${d.id})? This cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        const res = await apiRequest('/api/departments/' + encodeURIComponent(id), { method: 'DELETE' });
        if (res.ok && res.data && res.data.ok) {
          state.departments = state.departments.filter((x) => String(x.id) !== String(id));
          syncDepartmentsToLocal(state.departments);
          refreshAll();
          toast('Department deleted.', 'success');
        } else if (res.status === 409) {
          toast((res.data && res.data.message) || 'Cannot delete: doctors are still assigned to this department.', 'error');
        } else {
          toast((res.data && res.data.message) || 'Could not delete the department.', 'error');
        }
      }
    });
  }
}

/* search input listener - registered once at load */
document.addEventListener('input', (e) => {
  if (e.target && e.target.matches && (e.target.matches('#departmentsSearch') || e.target.matches('[data-departments-search]'))) {
    state.q = e.target.value;
    render();
  }
});

registerPage('departments', { render, open, onAction });
})();