/* =========================================================
   doctors.js - Doctor module
   Renders the doctor list, add/edit/view modals, search,
   availability, delete with confirmation.
   Wrapped in an IIFE so naming collisions with other modules
   do not occur when loaded as classic <script> tags.
   ========================================================= */

(function () {
'use strict';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function drDefaults() {
  return {
    id: genDoctorId(),
    name: '', specialization: '', department: '',
    qualification: '', experience: 0,
    phone: '', email: '', fees: 0,
    availableDays: [], hours: '', available: true,
    avatarColor: ['teal', 'purple', 'orange', 'green'][Math.floor(Math.random() * 4)],
    joined: todayISO()
  };
}

function departmentNames() {
  return Store.getAll('departments').map((d) => d.name).filter(Boolean);
}

function departmentDatalistHTML() {
  const names = departmentNames();
  if (!names.length) return '<datalist id="drDeptList"></datalist>';
  return `<datalist id="drDeptList">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;
}

/* ---------- modal form (add + edit) ---------- */

function doctorFormHTML(p) {
  const g = { ...drDefaults(), ...(p || {}) };
  const isEdit = !!p;

  const dayChecks = DAYS.map((d) => {
    const on = (g.availableDays || []).includes(d);
    return `<label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;color:var(--text-2);margin-right:8px;">
      <input type="checkbox" id="df-day" value="${d}"${on ? ' checked' : ''}> ${d}
    </label>`;
  }).join('');

  return `
  <div class="modal-head">
    <div>
      <h2>${isEdit ? 'Edit Doctor' : 'Add New Doctor'}</h2>
      <p>${isEdit ? 'Update the doctor\'s profile below.' : 'Register a new doctor to the hospital.'}</p>
    </div>
    <button type="button" class="icon-button" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
  </div>
  <form id="doctorForm" novalidate>
    ${departmentDatalistHTML()}
    <div class="form-grid">
      <div class="form-group">
        <label>Doctor ID</label>
        <input class="input" value="${esc(g.id)}" disabled>
      </div>
      <div class="form-group">
        <label>Full Name *</label>
        <input class="input" id="df-name" value="${esc(g.name)}" placeholder="e.g. Dr. Safia Rahman">
      </div>
      <div class="form-group">
        <label>Specialization *</label>
        <input class="input" id="df-spec" value="${esc(g.specialization)}" placeholder="e.g. Cardiology">
      </div>
      <div class="form-group">
        <label>Department *</label>
        <input class="input" id="df-dept" value="${esc(g.department)}" list="drDeptList" placeholder="e.g. Cardiology">
      </div>
      <div class="form-group">
        <label>Qualification</label>
        <input class="input" id="df-qual" value="${esc(g.qualification)}" placeholder="e.g. MD, FACC">
      </div>
      <div class="form-group">
        <label>Experience (years)</label>
        <input class="input" type="number" id="df-exp" min="0" max="60" value="${Number(g.experience) || 0}">
      </div>
      <div class="form-group">
        <label>Phone *</label>
        <input class="input" id="df-phone" value="${esc(g.phone)}" placeholder="e.g. 555-3001">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input class="input" type="email" id="df-email" value="${esc(g.email)}" placeholder="dr@email.com">
      </div>
      <div class="form-group">
        <label>Consultation Fees ($) *</label>
        <input class="input" type="number" id="df-fees" min="0" step="0.01" value="${Number(g.fees) || ''}" placeholder="e.g. 120">
      </div>
      <div class="form-group">
        <label>Working Hours</label>
        <input class="input" id="df-hours" value="${esc(g.hours)}" placeholder="e.g. 9:00-17:00">
      </div>
      <div class="form-group full">
        <label>Available Days</label>
        <div>${dayChecks}</div>
      </div>
      <div class="form-group">
        <label>Joining Date</label>
        <input class="input" type="date" id="df-joined" value="${esc(g.joined)}">
      </div>
      <div class="form-group">
        <label>Availability Status</label>
        <select class="input" id="df-available">
          <option value="true"${g.available ? ' selected' : ''}>Available</option>
          <option value="false"${!g.available ? ' selected' : ''}>Not Available</option>
        </select>
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Cancel</button>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Doctor'}</button>
    </div>
  </form>`;
}

function handleDoctorForm(e, id) {
  e.preventDefault();
  const val = (sel) => ($(sel) ? $(sel).value.trim() : '');
  const num = (sel) => Number($(sel) ? $(sel).value.trim() : 0) || 0;

  const days = Array.from(document.querySelectorAll('#df-day:checked')).map((c) => c.value);

  const data = {
    name: val('#df-name'),
    specialization: val('#df-spec'),
    department: val('#df-dept'),
    qualification: val('#df-qual'),
    experience: num('#df-exp'),
    phone: val('#df-phone'),
    email: val('#df-email'),
    fees: num('#df-fees'),
    hours: val('#df-hours'),
    availableDays: days,
    available: ($('#df-available') ? $('#df-available').value : 'true') === 'true',
    joined: val('#df-joined') || todayISO()
  };

  const isEdit = !!id;
  const ok = validateForm([
    { id: 'df-name', value: data.name, test: (v) => v.length >= 2, msg: 'Doctor name is required (min 2 characters).' },
    { id: 'df-spec', value: data.specialization, test: Boolean, msg: 'Specialization is required.' },
    { id: 'df-dept', value: data.department, test: Boolean, msg: 'Department is required.' },
    { id: 'df-phone', value: data.phone, test: (v) => v.replace(/\D/g, '').length >= 7, msg: 'Enter a valid phone number (min 7 digits).' },
    { id: 'df-fees', value: data.fees, test: (v) => Number(v) >= 0, msg: 'Enter a valid consultation fee.' },
    { id: 'df-email', value: data.email, test: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), msg: 'Enter a valid email address.' }
  ]);
  if (!ok) return;

  const record = { ...data, id: isEdit ? id : genDoctorId(), avatarColor: (Store.getById('doctors', id) || {}).avatarColor || data.avatarColor || 'teal' };

  if (isEdit) Store.update('doctors', id, record);
  else Store.add('doctors', record);

  closeModal();
  refreshAll();
  toast(isEdit ? 'Doctor record updated.' : 'Doctor added successfully.', 'success');
}

/* ---------- view modal ---------- */

function doctorDetailHTML(d) {
  const initials = (d.name || 'D').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const color = d.avatarColor || 'teal';
  const av = d.available;
  const appts = Store.getAll('appointments').filter((a) => String(a.doctorId) === String(d.id));
  const depts = departmentNames();

  return `
  <div class="modal-head">
    <div><h2>Doctor Profile</h2><p>${esc(d.id)}</p></div>
    <button type="button" class="icon-button" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
  </div>
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
    <span class="avatar ${color}" style="width:54px;height:54px;font-size:18px;">${esc(initials)}</span>
    <div>
      <div style="font-size:17px;font-weight:800;">${esc(d.name)}</div>
      <div style="color:var(--muted);font-size:13px;">${esc(d.specialization || '—')} &middot; ${esc(d.department || '—')}</div>
      <span class="badge ${av ? 'available' : 'unavailable'}" style="margin-top:6px;">${av ? 'Available' : 'Not Available'}</span>
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-cell"><span class="meta-label">Qualification</span><span class="meta-value">${esc(d.qualification || '—')}</span></div>
    <div class="meta-cell"><span class="meta-label">Experience</span><span class="meta-value">${Number(d.experience) || 0} years</span></div>
    <div class="meta-cell"><span class="meta-label">Phone</span><span class="meta-value">${esc(d.phone || '—')}</span></div>
    <div class="meta-cell"><span class="meta-label">Email</span><span class="meta-value">${esc(d.email || '—')}</span></div>
    <div class="meta-cell"><span class="meta-label">Consultation Fee</span><span class="meta-value">${formatCurrency(d.fees)}</span></div>
    <div class="meta-cell"><span class="meta-label">Working Hours</span><span class="meta-value">${esc(d.hours || '—')}</span></div>
    <div class="meta-cell"><span class="meta-label">Available Days</span><span class="meta-value">${(d.availableDays || []).length ? esc((d.availableDays || []).join(', ')) : '—'}</span></div>
    <div class="meta-cell"><span class="meta-label">Department</span><span class="meta-value">${esc(d.department || '—')}</span></div>
    <div class="meta-cell"><span class="meta-label">Appointments</span><span class="meta-value">${appts.length}</span></div>
    <div class="meta-cell"><span class="meta-label">Joined</span><span class="meta-value">${formatDate(d.joined)}</span></div>
  </div>
  ${depts.length ? '' : ''}
  <div class="form-actions">
    <button type="button" class="btn btn-secondary" data-action="edit" data-module="doctors" data-id="${esc(d.id)}">Edit Doctor</button>
    <button type="button" class="btn btn-secondary" data-close>Close</button>
  </div>`;
}

/* ---------- search ---------- */

function doctorFilter() {
  const box = $('#doctorsSearch') || $('[data-doctors-search]');
  const q = (box ? box.value : '').toLowerCase().trim();
  return Store.getAll('doctors')
    .filter((d) => !q ||
      d.name.toLowerCase().includes(q) ||
      (d.id || '').toLowerCase().includes(q) ||
      (d.specialization || '').toLowerCase().includes(q) ||
      (d.department || '').toLowerCase().includes(q));
}

function doctorQuery() {
  return ((($('#doctorsSearch') || $('[data-doctors-search]') || {}).value) || '');
}

/* ---------- render ---------- */

function doctorsTableHTML(list) {
  if (!list.length) {
    return `<div class="table-wrap"><div class="empty-block">No doctors found. Click <b>Add Doctor</b> to register one.</div></div>`;
  }
  const rows = list.map((d) => {
    const initials = (d.name || 'D').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const color = d.avatarColor || 'teal';
    const days = (d.availableDays || []).length ? (d.availableDays || []).join(', ') : '—';
    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="avatar ${color}">${esc(initials)}</span>
          <div><div class="primary-text">${esc(d.name)}</div><div class="muted-text">${esc(d.qualification || '')}</div></div>
        </div>
      </td>
      <td><span class="chip chip-purple">${esc(d.id)}</span></td>
      <td>${esc(d.specialization || '—')}</td>
      <td>${esc(d.department || '—')}</td>
      <td>${Number(d.experience) || 0} yrs</td>
      <td>${formatCurrency(d.fees)}</td>
      <td>${esc(days)}</td>
      <td><span class="badge ${d.available ? 'available' : 'unavailable'}">${d.available ? 'Available' : 'Not Available'}</span></td>
      <td class="actions-col">
        <div class="actions">
          <button class="btn btn-sm btn-ghost" data-action="view" data-module="doctors" data-id="${esc(d.id)}">View</button>
          <button class="btn btn-sm btn-secondary" data-action="edit" data-module="doctors" data-id="${esc(d.id)}">Edit</button>
          <button class="btn btn-sm btn-danger" data-action="del" data-module="doctors" data-id="${esc(d.id)}">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="table">
    <thead><tr>
      <th>Doctor</th><th>ID</th><th>Specialization</th><th>Department</th><th>Experience</th><th>Fees</th><th>Days</th><th>Status</th>
      <th class="actions-col">Actions</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function render() {
  const mount = document.getElementById('mount-doctors');
  if (!mount) return;
  const q = doctorQuery().trim();
  const list = Store.getAll('doctors').filter((d) => {
    const s = q.toLowerCase();
    return !s ||
      d.name.toLowerCase().includes(s) ||
      (d.id || '').toLowerCase().includes(s) ||
      (d.specialization || '').toLowerCase().includes(s) ||
      (d.department || '').toLowerCase().includes(s);
  });

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Doctors</h1>
        <p class="subtitle">Manage doctor profiles, specialization and availability.</p>
      </div>
      <button type="button" class="btn btn-primary" data-open-btn="doctors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        Add Doctor
      </button>
    </div>
    <div class="table-toolbar">
      <div class="search-input">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input class="input" id="doctorsSearch" data-doctors-search value="${esc(q)}" placeholder="Search name, ID, specialization...">
      </div>
      <span class="muted-text" style="color:var(--muted);font-size:12.5px;">${list.length} doctor${list.length === 1 ? '' : 's'}</span>
    </div>
    ${doctorsTableHTML(list)}
  `;
}

/* ---------- actions ---------- */

function open() {
  openModal(doctorFormHTML(null));
  $('#doctorForm').addEventListener('submit', (e) => handleDoctorForm(e, null));
}

function onAction(e, btn) {
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const d = Store.getById('doctors', id);
  if (!d) return;

  if (action === 'view') {
    openModal(doctorDetailHTML(d));
  } else if (action === 'edit') {
    openModal(doctorFormHTML(d));
    $('#doctorForm').addEventListener('submit', (ev) => handleDoctorForm(ev, id));
  } else if (action === 'del') {
    confirmDialog({
      title: 'Delete Doctor',
      message: `Delete the record for ${d.name} (${d.id})? This cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: () => {
        Store.remove('doctors', id);
        refreshAll();
        toast('Doctor record deleted.', 'success');
      }
    });
  }
}

/* search input listener - registered once at load */
document.addEventListener('input', (e) => {
  if (e.target && e.target.matches && (e.target.matches('#doctorsSearch') || e.target.matches('[data-doctors-search]'))) {
    render();
  }
});

registerPage('doctors', { render, open, onAction });
})();