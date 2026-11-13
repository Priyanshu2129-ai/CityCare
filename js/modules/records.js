/* =========================================================
   records.js - Medical Records Management
   Registered page: 'records'  ->  mount container '#mount-records'
   Runtime globals (provided by data.js / common.js): $, $$, esc, capitalize,
   toast, openModal, closeModal, confirmDialog, setFieldError, validateForm,
   todayISO, formatDate, ageFromDOB, refreshAll, Store, genRecordId,
   registerPage.
   ========================================================= */

/* ---- delegated search: single listener, fires only for this module ---- */
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'recordSearch' || t.id === 'recordFilter' || t.id === 'recordDateFilter') renderRecords();
});

function recordsList() {
  const q = (($('#recordSearch') || {}).value || '').toLowerCase().trim();
  const patientFilter = (($('#recordFilter') || {}).value || '').trim();
  const dateFilter = (($('#recordDateFilter') || {}).value || '').trim();
  return Store.getAll('records')
    .filter((r) => {
      const patient = Store.getById('patients', r.patientId);
      const pName = patient ? patient.name.toLowerCase() : '';
      if (q && !r.id.toLowerCase().includes(q) && !String(r.diagnosis || '').toLowerCase().includes(q) && !pName.includes(q)) return false;
      if (patientFilter && r.patientId !== patientFilter) return false;
      if (dateFilter && r.date && r.date.slice(0, 7) !== dateFilter) return false;
      return true;
    })
    .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function renderRecords() {
  const mount = document.getElementById('mount-records');
  if (!mount) return;
  const list = recordsList();
  const all = Store.getAll('records');
  const patients = Store.getAll('patients');
  const monthOptions = [...new Set(all.map((r) => (r.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const followUpsDue = all.filter((r) => r.followUp && r.followUp >= todayISO() && r.followUp <= todayISO()).length;

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Medical Records</h1>
        <p class="subtitle">Diagnosis, treatment and patient medical history</p>
      </div>
      <button class="btn btn-primary" data-open-btn="records">Add Record</button>
    </div>

    <div class="cards-grid">
      <div class="card stat-card"><div class="stat-icon" style="background:linear-gradient(135deg,#0d9488,#14b8a6)"><span class="stat-icon-label">R</span></div><div><div class="stat-value">${all.length}</div><div class="stat-label">Total Records</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:linear-gradient(135deg,#7c3aed,#a78bfa)"><span class="stat-icon-label">P</span></div><div><div class="stat-value">${new Set(all.map((r) => r.patientId)).size}</div><div class="stat-label">Patients Covered</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:linear-gradient(135deg,#f59e0b,#fbbf24)"><span class="stat-icon-label">D</span></div><div><div class="stat-value">${new Set(all.map((r) => r.doctorId)).size}</div><div class="stat-label">Doctors</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:linear-gradient(135deg,#f97316,#fb923c)"><span class="stat-icon-label">*</span></div><div><div class="stat-value">${followUpsDue}</div><div class="stat-label">Follow-ups Due Today</div></div></div>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <div class="search-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input class="input" id="recordSearch" placeholder="Search by record, patient or diagnosis">
        </div>
        <select class="input filter-select" id="recordFilter">
          <option value="">All patients</option>
          ${patients.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
        </select>
        <select class="input filter-select" id="recordDateFilter">
          <option value="">All months</option>
          ${monthOptions.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <span class="muted-text">${list.length} of ${all.length} records</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Record ID</th><th>Patient</th><th>Doctor</th><th>Date</th><th>Diagnosis</th><th>Follow-up</th><th class="actions-col">Actions</th></tr>
          </thead>
          <tbody id="recordTableBody">
            ${list.map((r) => {
              const patient = Store.getById('patients', r.patientId);
              const doctor = Store.getById('doctors', r.doctorId);
              const followUpChip = r.followUp
                ? (r.followUp >= todayISO() ? `<span class="chip chip-teal">Upcoming</span>` : `<span class="chip chip-orange">Past</span>`)
                : '<span class="muted-text">-</span>';
              return `
              <tr>
                <td><span class="muted-text">${esc(r.id)}</span></td>
                <td class="primary-text">${patient ? esc(patient.name) : '<em class="muted-text">Deleted</em>'}</td>
                <td>${doctor ? esc(doctor.name) : '<em class="muted-text">Deleted</em>'}</td>
                <td>${esc(formatDate(r.date))}</td>
                <td>${esc(r.diagnosis || '-')}</td>
                <td>${r.followUp ? esc(formatDate(r.followUp)) : '<span class="muted-text">-</span>'} ${followUpChip}</td>
                <td class="actions-col">
                  <div class="actions">
                    <button class="btn btn-secondary btn-sm" data-action="view" data-id="${esc(r.id)}" data-module="records">View</button>
                    <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${esc(r.id)}" data-module="records">Edit</button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${esc(r.id)}" data-module="records">Delete</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${list.length === 0 ? '<div class="empty-block">No medical records found.</div>' : ''}
    </div>
  `;
}

/* ---- form helpers ---- */
function recordPatientOptions(selected) {
  const patients = Store.getAll('patients');
  return '<option value="">Select patient</option>' + patients.map((p) =>
    `<option value="${esc(p.id)}" ${selected === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.id)})</option>`).join('');
}

function recordDoctorOptions(selected) {
  const doctors = Store.getAll('doctors');
  return '<option value="">Select doctor</option>' + doctors.map((d) =>
    `<option value="${esc(d.id)}" ${selected === d.id ? 'selected' : ''}>${esc(d.name)} (${esc(d.specialization || '')})</option>`).join('');
}

function recordForm(id) {
  const r = id ? Store.getById('records', id) : null;
  return `
    <div class="modal-head">
      <div>
        <h2>${id ? 'Edit Medical Record' : 'Add Medical Record'}</h2>
        <p>${id ? 'Update the medical record details.' : 'Create a new patient medical record.'}</p>
      </div>
      <button class="icon-button" data-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <form id="recordForm" novalidate>
      <div class="form-grid">
        <div class="form-group">
          <label for="rf-patient">Patient *</label>
          <select class="input" id="rf-patient">${recordPatientOptions(r ? r.patientId : '')}</select>
        </div>
        <div class="form-group">
          <label for="rf-doctor">Doctor *</label>
          <select class="input" id="rf-doctor">${recordDoctorOptions(r ? r.doctorId : '')}</select>
        </div>
        <div class="form-group">
          <label for="rf-date">Visit Date *</label>
          <input class="input" id="rf-date" type="date" value="${r ? r.date : todayISO()}">
        </div>
        <div class="form-group">
          <label for="rf-followup">Follow-up Date</label>
          <input class="input" id="rf-followup" type="date" min="${todayISO()}" value="${r ? (r.followUp || '') : ''}">
        </div>
        <div class="form-group full">
          <label for="rf-symptoms">Symptoms</label>
          <textarea class="input" id="rf-symptoms" placeholder="Reported symptoms...">${esc(r ? (r.symptoms || '') : '')}</textarea>
        </div>
        <div class="form-group full">
          <label for="rf-diagnosis">Diagnosis *</label>
          <input class="input" id="rf-diagnosis" value="${esc(r ? (r.diagnosis || '') : '')}" placeholder="e.g. Mild hypertension">
        </div>
        <div class="form-group full">
          <label for="rf-treatment">Treatment Notes *</label>
          <textarea class="input" id="rf-treatment" placeholder="Treatment plan...">${esc(r ? (r.treatment || '') : '')}</textarea>
        </div>
        <div class="form-group full">
          <label for="rf-prescription">Prescription</label>
          <textarea class="input" id="rf-prescription" placeholder="Medication and dosage...">${esc(r ? (r.prescription || '') : '')}</textarea>
        </div>
        <div class="form-group full">
          <label for="rf-notes">Doctor's Notes</label>
          <textarea class="input" id="rf-notes" placeholder="Additional notes...">${esc(r ? (r.notes || '') : '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? 'Save Changes' : 'Add Record'}</button>
      </div>
    </form>
  `;
}

function handleRecordForm(e) {
  e.preventDefault();
  const patientId = $('#rf-patient').value;
  const doctorId = $('#rf-doctor').value;
  const date = $('#rf-date').value;
  const followUp = $('#rf-followup').value;
  const symptoms = $('#rf-symptoms').value.trim();
  const diagnosis = $('#rf-diagnosis').value.trim();
  const treatment = $('#rf-treatment').value.trim();
  const prescription = $('#rf-prescription').value.trim();
  const notes = $('#rf-notes').value.trim();
  const editingId = window.__recordEditingId;

  const rules = [
    { id: 'rf-patient', value: patientId, msg: 'Select a patient' },
    { id: 'rf-doctor', value: doctorId, msg: 'Select a doctor' },
    { id: 'rf-date', value: date, msg: 'Select a visit date' },
    { id: 'rf-diagnosis', value: diagnosis, msg: 'Diagnosis is required' },
    { id: 'rf-treatment', value: treatment, msg: 'Treatment notes are required' }
  ];
  if (!validateForm(rules)) return;

  const data = { id: editingId, patientId, doctorId, date, followUp, symptoms, diagnosis, treatment, prescription, notes };
  if (editingId) Store.update('records', editingId, data);
  else Store.add('records', { ...data, id: genRecordId() });

  closeModal();
  toast(editingId ? 'Record updated.' : 'Medical record added.', 'success');
  refreshAll();
}

function viewRecord(id) {
  const r = Store.getById('records', id);
  if (!r) return;
  const patient = Store.getById('patients', r.patientId);
  const doctor = Store.getById('doctors', r.doctorId);
  openModal(`
    <div class="modal-head">
      <div>
        <h2>Medical Record</h2>
        <p>${esc(r.id)}</p>
      </div>
      <button class="icon-button" data-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="meta-grid">
      <div class="meta-cell"><span class="meta-label">Patient</span><span class="meta-value">${patient ? esc(patient.name) : 'Deleted'}</span></div>
      <div class="meta-cell"><span class="meta-label">Doctor</span><span class="meta-value">${doctor ? esc(doctor.name) : 'Deleted'}</span></div>
      <div class="meta-cell"><span class="meta-label">Visit Date</span><span class="meta-value">${esc(formatDate(r.date))}</span></div>
      <div class="meta-cell"><span class="meta-label">Follow-up</span><span class="meta-value">${r.followUp ? esc(formatDate(r.followUp)) : '-'}</span></div>
      <div class="meta-cell"><span class="meta-label">Diagnosis</span><span class="meta-value">${esc(r.diagnosis || '-')}</span></div>
      <div class="meta-cell"><span class="meta-label">Patient Age</span><span class="meta-value">${patient ? (ageFromDOB(patient.dob) ? ageFromDOB(patient.dob) + ' years' : (patient.age || '-')) : '-'}</span></div>
    </div>
    <div class="form-group"><label>Symptoms</label><div class="meta-value">${r.symptoms ? esc(r.symptoms) : '<em class="muted-text">None recorded</em>'}</div></div>
    <div class="form-group"><label>Treatment Notes</label><div class="meta-value">${esc(r.treatment || '-')}</div></div>
    <div class="form-group"><label>Prescription</label><div class="meta-value">${r.prescription ? esc(r.prescription) : '<em class="muted-text">None</em>'}</div></div>
    <div class="form-group"><label>Doctor's Notes</label><div class="meta-value">${r.notes ? esc(r.notes) : '<em class="muted-text">None</em>'}</div></div>
    <div class="form-actions">
      <button type="button" class="btn btn-primary" data-action="edit" data-id="${esc(r.id)}" data-module="records">Edit</button>
    </div>
  `);
}

function deleteRecord(id) {
  const r = Store.getById('records', id);
  if (!r) return;
  const patient = Store.getById('patients', r.patientId);
  confirmDialog({
    title: 'Delete Medical Record?',
    message: 'Delete record ' + r.id + ' for ' + (patient ? patient.name : 'patient') + '? This cannot be undone.',
    confirmText: 'Delete Record',
    onConfirm: () => {
      Store.remove('records', id);
      closeModal();
      toast('Medical record deleted.', '');
      refreshAll();
    }
  });
}

function bindRecordForm() {
  const f = $('#recordForm');
  if (!f) return;
  f.addEventListener('submit', handleRecordForm);
  f.addEventListener('input', (ev) => { if (ev.target && ev.target.id) setFieldError(ev.target.id, ''); });
}

function onRecordAction(e, btn) {
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === 'view') viewRecord(id);
  else if (action === 'edit') {
    window.__recordEditingId = id;
    openModal(recordForm(id));
    bindRecordForm();
  } else if (action === 'delete') deleteRecord(id);
}

function openRecord() {
  window.__recordEditingId = null;
  openModal(recordForm(null));
  bindRecordForm();
}

registerPage('records', {
  render: renderRecords,
  open: openRecord,
  onAction: onRecordAction
});