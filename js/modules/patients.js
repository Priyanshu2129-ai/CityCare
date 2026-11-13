/* =========================================================
   patients.js - Patient module (MongoDB-backed)
   Renders the patient list, add/edit/view modals, search and
   delete-with-confirmation. Calls the CityCare API (GET/POST/
   PUT/DELETE /api/patients) instead of LocalStorage. Uses the
   shared runtime from common.js. Wrapped in an IIFE to avoid
   global collisions when loaded as classic <script> tags.
   ========================================================= */

(function () {
'use strict';

const BLOOD_GROUPS = ['', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const GENDERS = ['', 'Female', 'Male', 'Other'];

/* ---------- module state + cache ---------- */
let state = { patients: [], loaded: false, loading: false, error: null, q: '' };

/* ---------- shared small helpers ---------- */

function ptAge(p) {
  if (p.dob) return ageFromDOB(p.dob);
  return p.age != null ? p.age : '';
}

function ptDefaults() {
  return {
    id: 'P-' + String(Date.now()).slice(-4),
    name: '', dob: '', gender: '',
    phone: '', email: '', address: '',
    bloodGroup: '', medicalHistory: '', allergies: '',
    emergencyName: '', emergencyPhone: '', createdAt: todayISO()
  };
}

/* ---------- API calls ---------- */

async function loadPatients(force) {
  if (state.loading) return;
  if (!force && state.loaded) return;
  state.loading = true;
  state.error = null;
  render();
  const { ok, data } = await apiRequest('/api/patients');
  if (ok) {
    state.patients = Array.isArray(data.patients) ? data.patients : [];
    syncPatientsToLocal(state.patients); // keep dashboard/departments/reports working
  } else {
    if (data && data.error === 'UNAUTHORIZED') {
      state.error = 'Please sign in to view patients.';
    } else {
      state.error = 'Could not load patients from the server. Check that the MongoDB backend is running.';
    }
  }
  state.loading = false;
  state.loaded = true;
  render();
}

/* ---------- modal form (add + edit) ---------- */

function patientFormHTML(p) {
  const g = { ...ptDefaults(), ...(p || {}) };
  const isEdit = !!p;
  const birth = g.dob || '';

  const bloodOptions = BLOOD_GROUPS
    .map((b) => `<option value="${b}"${b === g.bloodGroup ? ' selected' : ''}>${b || 'Select blood group'}</option>`).join('');
  const genderOptions = GENDERS
    .map((x) => `<option value="${x}"${x === g.gender ? ' selected' : ''}>${x || 'Select gender'}</option>`).join('');

  return `
  <div class="modal-head">
    <div>
      <h2>${isEdit ? 'Edit Patient' : 'Register New Patient'}</h2>
      <p>${isEdit ? 'Update the patient\'s record below.' : 'Fill in the required details to register a new patient.'}</p>
    </div>
    <button type="button" class="icon-button" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
  </div>
  <form id="patientForm" novalidate>
    <div class="form-grid">
      <div class="form-group">
        <label>Patient ID</label>
        <input class="input" value="${esc(g.id)}" disabled>
      </div>
      <div class="form-group">
        <label>Full Name *</label>
        <input class="input" id="pf-name" value="${esc(g.name)}" placeholder="e.g. Amara Osei" autocomplete="name">
      </div>
      <div class="form-group">
        <label>Date of Birth *</label>
        <input class="input" type="date" id="pf-dob" value="${esc(birth)}">
      </div>
      <div class="form-group">
        <label>Gender *</label>
        <select class="input" id="pf-gender">${genderOptions}</select>
      </div>
      <div class="form-group">
        <label>Contact Number *</label>
        <input class="input" id="pf-phone" value="${esc(g.phone)}" placeholder="e.g. 555-2010" autocomplete="tel">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input class="input" type="email" id="pf-email" value="${esc(g.email)}" placeholder="name@email.com" autocomplete="email">
      </div>
      <div class="form-group full">
        <label>Address</label>
        <textarea class="input" id="pf-address" placeholder="Street, city, postal code">${esc(g.address)}</textarea>
      </div>
      <div class="form-group">
        <label>Blood Group</label>
        <select class="input" id="pf-blood">${bloodOptions}</select>
      </div>
      <div class="form-group">
        <label>Emergency Contact (Name)</label>
        <input class="input" id="pf-emergency" value="${esc(g.emergencyName)}" placeholder="Relationship / name">
      </div>
      <div class="form-group">
        <label>Emergency Contact (Phone)</label>
        <input class="input" id="pf-emergency-phone" value="${esc(g.emergencyPhone)}" placeholder="e.g. 555-2090">
      </div>
      <div class="form-group full">
        <label>Medical History</label>
        <textarea class="input" id="pf-history" placeholder="Previous conditions, surgeries, ongoing treatments">${esc(g.medicalHistory)}</textarea>
      </div>
      <div class="form-group full">
        <label>Allergies</label>
        <textarea class="input" id="pf-allergies" placeholder="List known allergies, or None">${esc(g.allergies)}</textarea>
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Cancel</button>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Register Patient'}</button>
    </div>
  </form>`;
}

async function handlePatientForm(e, id) {
  e.preventDefault();
  const val = (sel) => ($(sel) ? $(sel).value.trim() : '');

  const data = {
    id: id || ptDefaults().id,
    name: val('#pf-name'),
    dob: val('#pf-dob'),
    gender: val('#pf-gender'),
    phone: val('#pf-phone'),
    email: val('#pf-email'),
    address: val('#pf-address'),
    bloodGroup: val('#pf-blood'),
    emergencyName: val('#pf-emergency'),
    emergencyPhone: val('#pf-emergency-phone'),
    medicalHistory: val('#pf-history'),
    allergies: val('#pf-allergies')
  };

  const isEdit = !!id;
  const ok = validateForm([
    { id: 'pf-name', value: data.name, test: (v) => v.length >= 2, msg: 'Full name is required (min 2 characters).' },
    { id: 'pf-dob', value: data.dob, test: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v), msg: 'Select a valid date of birth.' },
    { id: 'pf-gender', value: data.gender, test: Boolean, msg: 'Please select a gender.' },
    { id: 'pf-phone', value: data.phone, test: (v) => v.replace(/\D/g, '').length >= 7, msg: 'Enter a valid phone number (min 7 digits).' },
    { id: 'pf-email', value: data.email, test: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), msg: 'Enter a valid email address.' }
  ]);
  if (!ok) return;

  // Keep the send button disabled until the request resolves.
  const btn = $('#patientForm').querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = isEdit ? 'Saving...' : 'Registering...'; }

  const res = isEdit ? await apiRequest('/api/patients/' + encodeURIComponent(id), { method: 'PUT', body: data })
                     : await apiRequest('/api/patients', { method: 'POST', body: data });

  if (btn) { btn.disabled = false; btn.textContent = isEdit ? 'Save Changes' : 'Register Patient'; }

  if (res.ok) {
    closeModal();
    await loadPatients();
    refreshAll();
    toast(isEdit ? 'Patient record updated.' : 'Patient registered successfully.', 'success');
  } else {
    const errors = (res.data && res.data.errors) || {};
    setFieldError('pf-name', errors.name || '');
    setFieldError('pf-dob', errors.dob || '');
    setFieldError('pf-gender', errors.gender || '');
    setFieldError('pf-phone', errors.phone || '');
    setFieldError('pf-email', errors.email || '');
    if (!Object.keys(errors).length) toast((res.data && res.data.message) || 'Could not save the patient.', 'error');
  }
}

/* ---------- view modal ---------- */

function patientDetailHTML(p) {
  const records = Store.getAll('records').filter((r) => String(r.patientId) === String(p.id));
  const appts = Store.getAll('appointments').filter((a) => String(a.patientId) === String(p.id));
  const initials = (p.name || 'P').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const recordRows = records.length
    ? records.map((r) => {
        const doc = Store.getById('doctors', r.doctorId);
        return `<div class="list-item"><div class="list-item-main">
                 <span class="list-item-name">${esc(r.diagnosis || 'Consultation')}</span>
                 <span class="list-item-sub">${formatDate(r.date)} &middot; ${doc ? esc(doc.name) : '—'}</span>
               </div><span class="chip chip-teal">${esc(r.id)}</span></div>`;
      }).join('')
    : '<p class="empty-text" style="color:var(--muted);font-size:12.5px;">No past records yet.</p>';

  return `
  <div class="modal-head">
    <div><h2>Patient Profile</h2><p>${esc(p.id)}</p></div>
    <button type="button" class="icon-button" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
  </div>
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
    <span class="avatar teal" style="width:54px;height:54px;font-size:18px;">${esc(initials)}</span>
    <div>
      <div style="font-size:17px;font-weight:800;">${esc(p.name)}</div>
      <div style="color:var(--muted);font-size:13px;">${ptAge(p)} years &middot; ${esc(p.gender || '—')} &middot; ${esc(p.bloodGroup || 'No blood group')}</div>
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-cell"><span class="meta-label">Phone</span><span class="meta-value">${esc(p.phone || '—')}</span></div>
    <div class="meta-cell"><span class="meta-label">Email</span><span class="meta-value">${esc(p.email || '—')}</span></div>
    <div class="meta-cell"><span class="meta-label">Date of Birth</span><span class="meta-value">${formatDate(p.dob)}</span></div>
    <div class="meta-cell"><span class="meta-label">Registered</span><span class="meta-value">${formatDate(p.createdAt)}</span></div>
    <div class="meta-cell"><span class="meta-label">Emergency Contact</span><span class="meta-value">${esc(p.emergencyName || '—')} ${p.emergencyPhone ? '&middot; ' + esc(p.emergencyPhone) : ''}</span></div>
    <div class="meta-cell"><span class="meta-label">Appointments</span><span class="meta-value">${appts.length}</span></div>
    <div class="meta-cell full" style="grid-column:1/-1;"><span class="meta-label">Address</span><span class="meta-value">${esc(p.address || '—')}</span></div>
    <div class="meta-cell full" style="grid-column:1/-1;"><span class="meta-label">Medical History</span><span class="meta-value" style="font-weight:500;">${esc(p.medicalHistory || 'No history recorded')}</span></div>
    <div class="meta-cell full" style="grid-column:1/-1;"><span class="meta-label">Allergies</span><span class="meta-value" style="font-weight:500;">${esc(p.allergies || 'None')}</span></div>
  </div>
  <h3 style="font-size:15px;margin:20px 0 8px;">Visit History</h3>
  <div class="list-block">${recordRows}</div>
  <div class="form-actions">
    <button type="button" class="btn btn-secondary" data-action="edit" data-module="patients" data-id="${esc(p.id)}">Edit Patient</button>
    <button type="button" class="btn btn-secondary" data-close>Close</button>
  </div>`;
}

/* ---------- search ---------- */

function patientQuery() {
  return ((($('#patientsSearch') || $('[data-patients-search]') || {}).value) || '');
}

/* ---------- render ---------- */

function patientsTableHTML(list) {
  if (!list.length) {
    return `<div class="table-wrap"><div class="empty-block">No patients found. Click <b>Add Patient</b> to register one.</div></div>`;
  }
  const rows = list.map((p) => {
    const initials = (p.name || 'P').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="avatar teal">${esc(initials)}</span>
          <div><div class="primary-text">${esc(p.name)}</div><div class="muted-text">${esc(p.email || p.phone || '')}</div></div>
        </div>
      </td>
      <td><span class="chip chip-teal">${esc(p.id)}</span></td>
      <td>${ptAge(p)} yrs</td>
      <td>${esc(p.gender || '—')}</td>
      <td><span class="badge ${p.bloodGroup ? 'available' : 'unavailable'}">${esc(p.bloodGroup || '—')}</span></td>
      <td>${esc(p.phone || '—')}</td>
      <td class="actions-col">
        <div class="actions">
          <button class="btn btn-sm btn-ghost" data-action="view" data-module="patients" data-id="${esc(p.id)}">View</button>
          <button class="btn btn-sm btn-secondary" data-action="edit" data-module="patients" data-id="${esc(p.id)}">Edit</button>
          <button class="btn btn-sm btn-danger" data-action="del" data-module="patients" data-id="${esc(p.id)}">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="table">
    <thead><tr>
      <th>Patient</th><th>ID</th><th>Age</th><th>Gender</th><th>Blood</th><th>Phone</th>
      <th class="actions-col">Actions</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function render() {
  const mount = document.getElementById('mount-patients');
  if (!mount) return;
  const q = state.q || '';
  const list = state.patients.filter((p) => {
    const s = q.toLowerCase();
    return !s || p.name.toLowerCase().includes(s) || String(p.id).toLowerCase().includes(s);
  });

  const body = state.error
    ? `<div class="empty-block" style="color:var(--rose-600)">${esc(state.error)}</div>`
    : state.loading && !state.patients.length
      ? `<div class="empty-block">Loading patients...</div>`
      : patientsTableHTML(list);

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Patients</h1>
        <p class="subtitle">Manage patient registrations, profiles and records (MongoDB).</p>
      </div>
      <button type="button" class="btn btn-primary" data-open-btn="patients">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        Add Patient
      </button>
    </div>
    <div class="table-toolbar">
      <div class="search-input">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input class="input" id="patientsSearch" data-patients-search value="${esc(q)}" placeholder="Search by name or ID...">
      </div>
      <span class="muted-text" style="color:var(--muted);font-size:12.5px;">${state.patients.length} patient${state.patients.length === 1 ? '' : 's'}</span>
    </div>
    ${body}
  `;
}

/* ---------- actions ---------- */

function open() {
  openModal(patientFormHTML(null));
  $('#patientForm').addEventListener('submit', (e) => handlePatientForm(e, null));
}

function currentPatient(id) {
  return state.patients.find((p) => String(p.id) === String(id));
}

function onAction(e, btn) {
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const p = currentPatient(id);
  if (!p) return;

  if (action === 'view') {
    openModal(patientDetailHTML(p));
  } else if (action === 'edit') {
    openModal(patientFormHTML(p));
    $('#patientForm').addEventListener('submit', (ev) => handlePatientForm(ev, id));
  } else if (action === 'del') {
    confirmDialog({
      title: 'Delete Patient',
      message: `Delete the record for ${p.name} (${p.id})? This cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        const res = await apiRequest('/api/patients/' + encodeURIComponent(id), { method: 'DELETE' });
        if (res.ok) {
          state.patients = state.patients.filter((x) => String(x.id) !== String(id));
          syncPatientsToLocal(state.patients);
          refreshAll();
          render();
          toast('Patient record deleted.', 'success');
        } else {
          toast((res.data && res.data.message) || 'Could not delete the patient.', 'error');
        }
      }
    });
  }
}

/* search input listener - registered once at load */
document.addEventListener('input', (e) => {
  if (e.target && e.target.matches && (e.target.matches('#patientsSearch') || e.target.matches('[data-patients-search]'))) {
    state.q = e.target.value;
    render();
  }
});

// Fetch patients from MongoDB on first (re)load of the page.
let started = false;
function ensureLoaded() {
  if (!started) { started = true; loadPatients(false); }
}
// Force a fresh pull from the server (called after login establishes a session).
async function reload() { await loadPatients(true); }

registerPage('patients', { render, open, onAction, reload });
ensureLoaded();
})();