/* =========================================================
   laboratory.js - Laboratory & Diagnostic Test Management
   Registered page: 'laboratory'  ->  mount container '#mount-laboratory'
   Runtime globals (provided by data.js / common.js): $, $$, esc, capitalize,
   toast, openModal, closeModal, confirmDialog, setFieldError, validateForm,
   formatCurrency, todayISO, formatDate, refreshAll, Store, genLabTestId,
   registerPage.
   ========================================================= */

/* ---- delegated search: single listener, fires only for this module ---- */
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'labSearch' || t.id === 'labFilter' || t.id === 'labStatusFilter') renderLab();
});

function labList() {
  const q = (($('#labSearch') || {}).value || '').toLowerCase().trim();
  const patientFilter = (($('#labFilter') || {}).value || '').trim();
  const statusFilter = (($('#labStatusFilter') || {}).value || '').trim();
  return Store.getAll('lab')
    .filter((t) => {
      const patient = Store.getById('patients', t.patientId);
      const pName = patient ? patient.name.toLowerCase() : '';
      if (q && !t.name.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q) && !pName.includes(q)) return false;
      if (patientFilter && t.patientId !== patientFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    })
    .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function labStatusBadge(status) {
  const map = {
    pending: '<span class="badge pending">Pending</span>',
    'in-progress': '<span class="badge scheduled">In Progress</span>',
    completed: '<span class="badge completed">Completed</span>'
  };
  return map[status] || map.pending;
}

function renderLab() {
  const mount = document.getElementById('mount-laboratory');
  if (!mount) return;
  const list = labList();
  const tests = Store.getAll('lab');
  const patients = Store.getAll('patients');
  const pending = tests.filter((t) => t.status === 'pending').length;
  const inProgress = tests.filter((t) => t.status === 'in-progress').length;
  const completed = tests.filter((t) => t.status === 'completed').length;

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Laboratory</h1>
        <p class="subtitle">Diagnostic tests, results and laboratory history</p>
      </div>
      <button class="btn btn-primary" data-open-btn="laboratory">New Lab Test</button>
    </div>

    <div class="cards-grid">
      <div class="card stat-card"><div class="stat-icon" style="background:linear-gradient(135deg,#0d9488,#14b8a6)"><span class="stat-icon-label">M</span></div><div><div class="stat-value">${tests.length}</div><div class="stat-label">Total Tests</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:linear-gradient(135deg,#f59e0b,#fbbf24)"><span class="stat-icon-label">P</span></div><div><div class="stat-value">${pending}</div><div class="stat-label">Pending</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:linear-gradient(135deg,#0891b2,#38bdf8)"><span class="stat-icon-label">R</span></div><div><div class="stat-value">${inProgress}</div><div class="stat-label">In Progress</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:linear-gradient(135deg,#059669,#34d399)"><span class="stat-icon-label">D</span></div><div><div class="stat-value">${completed}</div><div class="stat-label">Completed</div></div></div>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <div class="search-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input class="input" id="labSearch" placeholder="Search by test, patient or ID">
        </div>
        <select class="input filter-select" id="labFilter">
          <option value="">All patients</option>
          ${patients.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
        </select>
        <select class="input filter-select" id="labStatusFilter">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <div class="spacer"></div>
        <span class="muted-text">${list.length} of ${tests.length} tests</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Test ID</th><th>Test Name</th><th>Patient</th><th>Doctor</th><th>Date</th><th>Charges</th><th>Status</th><th class="actions-col">Actions</th></tr>
          </thead>
          <tbody id="labTableBody">
            ${list.map((t) => {
              const patient = Store.getById('patients', t.patientId);
              const doctor = Store.getById('doctors', t.doctorId);
              return `
              <tr>
                <td><span class="muted-text">${esc(t.id)}</span></td>
                <td class="primary-text">${esc(t.name)}</td>
                <td>${patient ? esc(patient.name) : '<em class="muted-text">Deleted</em>'}</td>
                <td>${doctor ? esc(doctor.name) : '<em class="muted-text">Deleted</em>'}</td>
                <td>${esc(formatDate(t.date))}</td>
                <td>${formatCurrency(t.charges)}</td>
                <td>${labStatusBadge(t.status)}</td>
                <td class="actions-col">
                  <div class="actions">
                    <button class="btn btn-secondary btn-sm" data-action="view" data-id="${esc(t.id)}" data-module="laboratory">View</button>
                    ${t.status !== 'completed' ? `<button class="btn btn-secondary btn-sm" data-action="result" data-id="${esc(t.id)}" data-module="laboratory">${t.status === 'in-progress' ? 'Edit Result' : 'Add Result'}</button>` : ''}
                    <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${esc(t.id)}" data-module="laboratory">Edit</button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${esc(t.id)}" data-module="laboratory">Delete</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${list.length === 0 ? '<div class="empty-block">No laboratory tests found.</div>' : ''}
    </div>
  `;
}

/* ---- form helpers ---- */
function labPatientOptions(selected) {
  const patients = Store.getAll('patients');
  return '<option value="">Select patient</option>' + patients.map((p) =>
    `<option value="${esc(p.id)}" ${selected === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.id)})</option>`).join('');
}

function labDoctorOptions(selected) {
  const doctors = Store.getAll('doctors');
  return '<option value="">Select doctor</option>' + doctors.map((d) =>
    `<option value="${esc(d.id)}" ${selected === d.id ? 'selected' : ''}>${esc(d.name)} (${esc(d.specialization || '')})</option>`).join('');
}

function labForm(id) {
  const t = id ? Store.getById('lab', id) : null;
  return `
    <div class="modal-head">
      <div>
        <h2>${id ? 'Edit Lab Test' : 'New Lab Test'}</h2>
        <p>${id ? 'Update the laboratory test details.' : 'Register a new diagnostic test request.'}</p>
      </div>
      <button class="icon-button" data-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <form id="labForm" novalidate>
      <div class="form-grid">
        <div class="form-group">
          <label for="lf-name">Test Name *</label>
          <input class="input" id="lf-name" value="${esc(t ? t.name : '')}" placeholder="e.g. Complete Blood Count">
        </div>
        <div class="form-group">
          <label for="lf-patient">Patient *</label>
          <select class="input" id="lf-patient">${labPatientOptions(t ? t.patientId : '')}</select>
        </div>
        <div class="form-group">
          <label for="lf-doctor">Referring Doctor *</label>
          <select class="input" id="lf-doctor">${labDoctorOptions(t ? t.doctorId : '')}</select>
        </div>
        <div class="form-group">
          <label for="lf-date">Test Date *</label>
          <input class="input" id="lf-date" type="date" value="${t ? t.date : todayISO()}">
        </div>
        <div class="form-group">
          <label for="lf-charges">Charges ($) *</label>
          <input class="input" id="lf-charges" type="number" min="0" step="0.01" value="${t ? t.charges : ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label for="lf-status">Status</label>
          <select class="input" id="lf-status">
            <option value="pending" ${t && t.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="in-progress" ${t && t.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${t && t.status === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div class="form-group full">
          <label for="lf-result">Test Result</label>
          <textarea class="input" id="lf-result" placeholder="Enter the test result here...">${esc(t ? (t.result || '') : '')}</textarea>
        </div>
        <div class="form-group full">
          <label for="lf-notes">Notes</label>
          <textarea class="input" id="lf-notes" placeholder="Lab notes...">${esc(t ? (t.notes || '') : '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? 'Save Changes' : 'Schedule Test'}</button>
      </div>
    </form>
  `;
}

function handleLabForm(e) {
  e.preventDefault();
  const name = $('#lf-name').value.trim();
  const patientId = $('#lf-patient').value;
  const doctorId = $('#lf-doctor').value;
  const date = $('#lf-date').value;
  const charges = parseFloat($('#lf-charges').value);
  const status = $('#lf-status').value;
  const result = $('#lf-result').value.trim();
  const notes = $('#lf-notes').value.trim();
  const editingId = window.__labEditingId;

  const rules = [
    { id: 'lf-name', value: name, msg: 'Test name is required' },
    { id: 'lf-patient', value: patientId, msg: 'Select a patient' },
    { id: 'lf-doctor', value: doctorId, msg: 'Select a doctor' },
    { id: 'lf-date', value: date, msg: 'Select a test date' },
    { id: 'lf-charges', value: charges, test: () => Number.isFinite(charges) && charges >= 0, msg: 'Enter a valid charge' }
  ];
  if (!validateForm(rules)) return;

  const data = {
    id: editingId, name, patientId, doctorId, date, charges, status,
    result: status === 'completed' ? result : (editingId ? Store.getById('lab', editingId).result : ''),
    notes
  };
  if (editingId) Store.update('lab', editingId, data);
  else Store.add('lab', { ...data, id: genLabTestId() });

  closeModal();
  toast(editingId ? 'Lab test updated.' : 'Lab test scheduled.', 'success');
  refreshAll();
}

function resultForm(id) {
  const t = Store.getById('lab', id);
  if (!t) return;
  const patient = Store.getById('patients', t.patientId);
  return `
    <div class="modal-head">
      <div>
        <h2>${t.status === 'completed' ? 'Edit Result' : 'Add Test Result'}</h2>
        <p>${esc(t.name)} for ${patient ? esc(patient.name) : 'patient'}</p>
      </div>
      <button class="icon-button" data-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <form id="labResultForm" novalidate>
      <div class="form-group">
        <label for="lrf-result">Test Result *</label>
        <textarea class="input" id="lrf-result" placeholder="Enter the test result...">${esc(t.result || '')}</textarea>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label for="lrf-status">Mark as</label>
          <select class="input" id="lrf-status">
            <option value="in-progress" ${t.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Result</button>
      </div>
    </form>
  `;
}

function handleLabResultForm(e) {
  e.preventDefault();
  const id = window.__labResultId;
  const t = Store.getById('lab', id);
  if (!t) return;
  const result = $('#lrf-result').value.trim();
  if (!validateForm([{ id: 'lrf-result', value: result, msg: 'Enter the test result' }])) return;
  const status = $('#lrf-status').value;
  Store.update('lab', id, { result, status });
  closeModal();
  toast('Test result saved.', 'success');
  refreshAll();
}

function viewLab(id) {
  const t = Store.getById('lab', id);
  if (!t) return;
  const patient = Store.getById('patients', t.patientId);
  const doctor = Store.getById('doctors', t.doctorId);
  openModal(`
    <div class="modal-head">
      <div>
        <h2>Lab Test Details</h2>
        <p>${esc(t.id)}</p>
      </div>
      <button class="icon-button" data-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="meta-grid">
      <div class="meta-cell"><span class="meta-label">Test Name</span><span class="meta-value">${esc(t.name)}</span></div>
      <div class="meta-cell"><span class="meta-label">Patient</span><span class="meta-value">${patient ? esc(patient.name) : 'Deleted'}</span></div>
      <div class="meta-cell"><span class="meta-label">Doctor</span><span class="meta-value">${doctor ? esc(doctor.name) : 'Deleted'}</span></div>
      <div class="meta-cell"><span class="meta-label">Date</span><span class="meta-value">${esc(formatDate(t.date))}</span></div>
      <div class="meta-cell"><span class="meta-label">Charges</span><span class="meta-value">${formatCurrency(t.charges)}</span></div>
      <div class="meta-cell"><span class="meta-label">Status</span><span class="meta-value">${labStatusBadge(t.status)}</span></div>
    </div>
    <div class="form-group">
      <label>Test Result</label>
      <div class="meta-value">${t.result ? esc(t.result) : '<em class="muted-text">Result not yet recorded.</em>'}</div>
    </div>
    ${t.notes ? `<div class="form-group"><label>Notes</label><div class="meta-value">${esc(t.notes)}</div></div>` : ''}
    <div class="form-actions">
      <button type="button" class="btn btn-primary" data-action="edit" data-id="${esc(t.id)}" data-module="laboratory">Edit</button>
    </div>
  `);
}

function deleteLab(id) {
  const t = Store.getById('lab', id);
  if (!t) return;
  confirmDialog({
    title: 'Delete Lab Test?',
    message: 'Delete ' + t.name + ' (' + t.id + ')? This cannot be undone.',
    confirmText: 'Delete Test',
    onConfirm: () => {
      Store.remove('lab', id);
      closeModal();
      toast('Lab test deleted.', '');
      refreshAll();
    }
  });
}

function bindLabForm() {
  const f = $('#labForm');
  if (!f) return;
  f.addEventListener('submit', handleLabForm);
  f.addEventListener('input', (ev) => { if (ev.target && ev.target.id) setFieldError(ev.target.id, ''); });
}

function bindLabResultForm() {
  const f = $('#labResultForm');
  if (!f) return;
  f.addEventListener('submit', handleLabResultForm);
  f.addEventListener('input', (ev) => { if (ev.target && ev.target.id) setFieldError(ev.target.id, ''); });
}

function onLabAction(e, btn) {
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === 'view') viewLab(id);
  else if (action === 'edit') {
    window.__labEditingId = id;
    openModal(labForm(id));
    bindLabForm();
  } else if (action === 'result') {
    window.__labResultId = id;
    openModal(resultForm(id));
    bindLabResultForm();
  } else if (action === 'delete') deleteLab(id);
}

function openLab() {
  window.__labEditingId = null;
  openModal(labForm(null));
  bindLabForm();
}

registerPage('laboratory', {
  render: renderLab,
  open: openLab,
  onAction: onLabAction
});