/* =========================================================
   appointments.js - Appointment Management
   Book, view, reschedule, complete and cancel appointments.
   Uses real patient + doctor + department records from Store.
   ========================================================= */

(function () {
'use strict';

/* ---- module-local filter state ---- */
let apptStatus = '';
let apptView = 'list'; // 'list' | 'day' | 'month'

/* One delegated search listener for this module, registered once. */
document.addEventListener('input', (e) => {
  if (e.target.dataset && e.target.dataset.search === 'appointments') {
    Pages['appointments'] && Pages['appointments'].render();
  }
});

function searchQuery() {
  const el = $('[data-search="appointments"]');
  return (el && (el.value || '').toLowerCase().trim()) || '';
}

function patientName(id) {
  const p = Store.getById('patients', id);
  return p ? p.name : 'Unknown';
}

function doctorName(id) {
  const d = Store.getById('doctors', id);
  return d ? d.name : 'Unknown';
}

function statusClass(s) {
  return (s || 'pending').toLowerCase();
}

/* day / month grouping helpers */
function dayAppointments(list) {
  const today = todayISO();
  return list
    .filter((a) => a.date === today && a.status !== 'cancelled')
    .sort((a, b) => (a.date + ' ' + a.time).localeCompare(b.date + ' ' + b.time));
}

function monthAppointments(list) {
  const out = {};
  list.forEach((a) => {
    const k = (a.date || '').slice(0, 7);
    if (!k) return;
    out[k] = out[k] || [];
    out[k].push(a);
  });
  return Object.keys(out).sort().map((k) => ({ key: k, items: out[k] }));
}

function appointmentRows(list) {
  return list.map((a) => `
    <tr>
      <td><span class="primary-text">${esc(a.id)}</span></td>
      <td>
        <span class="primary-text">${esc(patientName(a.patientId))}</span>
        <div class="muted-text">${esc(a.patientId)}</div>
      </td>
      <td>
        <span class="primary-text">${esc(doctorName(a.doctorId))}</span>
        <div class="muted-text">${esc(a.department || '-')}</div>
      </td>
      <td>${formatDate(a.date)}<div class="muted-text">${esc(a.time)}</div></td>
      <td>${esc(a.type || '-')}</td>
      <td><span class="badge ${statusClass(a.status)}">${esc(capitalize(a.status))}</span></td>
      <td class="actions-col">
        <div class="actions">
          <button class="btn btn-ghost btn-sm" data-action="view" data-id="${esc(a.id)}" data-module="appointments">View</button>
          <button class="btn btn-sm" data-action="reschedule" data-id="${esc(a.id)}" data-module="appointments" ${a.status === 'cancelled' || a.status === 'completed' ? 'disabled' : ''}>Reschedule</button>
          <button class="btn btn-secondary btn-sm" data-action="complete" data-id="${esc(a.id)}" data-module="appointments" ${a.status === 'completed' || a.status === 'cancelled' ? 'disabled' : ''}>Complete</button>
          <button class="btn btn-danger btn-sm" data-action="cancel" data-id="${esc(a.id)}" data-module="appointments" ${a.status === 'cancelled' ? 'disabled' : ''}>Cancel</button>
        </div>
      </td>
    </tr>`).join('');
}

function emptyRow(cols) {
  return `<tr><td colspan="${cols}" class="empty-block">No appointments match your filters.</td></tr>`;
}

function render() {
  const mount = $('#mount-appointments');
  if (!mount) return;
  const all = Store.getAll('appointments');
  const q = searchQuery();

  let list = all;
  if (apptStatus) list = list.filter((a) => (a.status || '').toLowerCase() === apptStatus.toLowerCase());
  if (q) list = list.filter((a) =>
    (a.id || '').toLowerCase().includes(q) ||
    patientName(a.patientId).toLowerCase().includes(q) ||
    doctorName(a.doctorId).toLowerCase().includes(q) ||
    (a.type || '').toLowerCase().includes(q) ||
    (a.department || '').toLowerCase().includes(q) ||
    (a.reason || '').toLowerCase().includes(q)
  );

  const pending = all.filter((a) => a.status === 'pending').length;
  const todayCount = dayAppointments(all).length;
  const completed = all.filter((a) => a.status === 'completed').length;

  let bodyHtml = '';
  if (apptView === 'day') {
    const day = dayAppointments(all);
    bodyHtml = day.length ? appointmentRows(day) : emptyRow(8);
  } else if (apptView === 'month') {
    const groups = monthAppointments(all);
    bodyHtml = groups.length
      ? groups.map((g) => `
          <tr><td colspan="8" class="month-group"><strong>${esc(g.key)}</strong> &middot; ${g.items.length} appointment(s)</td></tr>
          ${appointmentRows(g.items)}
        `).join('')
      : emptyRow(8);
  } else {
    bodyHtml = list.length ? appointmentRows(list) : emptyRow(8);
  }

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Appointments</h1>
        <p class="subtitle">Manage bookings with real patient and doctor records</p>
      </div>
      <button class="btn btn-primary" data-open-btn="appointments">New Appointment</button>
    </div>

    <div class="cards-grid">
      <div class="stat-card"><div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/></svg></div><div><span class="stat-label">Pending</span><span class="stat-value">${pending}</span></div></div>
      <div class="stat-card"><div class="stat-icon teal"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg></div><div><span class="stat-label">Today</span><span class="stat-value">${todayCount}</span></div></div>
      <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/></svg></div><div><span class="stat-label">Completed</span><span class="stat-value">${completed}</span></div></div>
      <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M3 5h18M4 5v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5"/></svg></div><div><span class="stat-label">All Bookings</span><span class="stat-value">${all.length}</span></div></div>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <div class="search-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input class="input" data-search="appointments" aria-label="Search appointments" placeholder="Search patient, doctor, type..."
            value="${esc($('[data-search="appointments"]') ? ($('[data-search="appointments"]').value || '') : '')}">
        </div>
        <select class="input filter-select" data-filter-status aria-label="Filter appointments by status">
          <option value="">All statuses</option>
          <option value="pending" ${apptStatus === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="confirmed" ${apptStatus === 'confirmed' ? 'selected' : ''}>Confirmed</option>
          <option value="completed" ${apptStatus === 'completed' ? 'selected' : ''}>Completed</option>
          <option value="cancelled" ${apptStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
        <div class="actions">
          <button class="btn btn-sm ${apptView === 'list' ? 'btn-primary' : 'btn-secondary'}" data-view-all>List</button>
          <button class="btn btn-sm ${apptView === 'day' ? 'btn-primary' : 'btn-secondary'}" data-view-day>Daily</button>
          <button class="btn btn-sm ${apptView === 'month' ? 'btn-primary' : 'btn-secondary'}" data-view-month>Monthly</button>
        </div>
        <span class="spacer"></span>
        <button class="btn btn-secondary btn-sm" data-export-appt>Export CSV</button>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>ID</th><th>Patient</th><th>Doctor</th><th>Date / Time</th><th>Type</th><th>Status</th><th class="actions-col">Actions</th>
          </tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    </div>
  `;

  const stSel = $('[data-filter-status]');
  if (stSel) stSel.addEventListener('change', () => { apptStatus = stSel.value; Pages['appointments'].render(); });
  const va = $('[data-view-all]'); if (va) va.addEventListener('click', () => { apptView = 'list'; Pages['appointments'].render(); });
  const vd = $('[data-view-day]'); if (vd) vd.addEventListener('click', () => { apptView = 'day'; Pages['appointments'].render(); });
  const vm = $('[data-view-month]'); if (vm) vm.addEventListener('click', () => { apptView = 'month'; Pages['appointments'].render(); });
  const ex = $('[data-export-appt]');
  if (ex) ex.addEventListener('click', () => {
    exportCSV('appointments.csv', ['ID', 'Patient', 'Doctor', 'Department', 'Date', 'Time', 'Type', 'Status', 'Reason'],
      all.map((a) => [a.id, patientName(a.patientId), doctorName(a.doctorId), a.department, a.date, a.time, a.type, a.status, a.reason || '']));
  });
}

/* ---- open(): New Appointment form ---- */
function open() {
  const patients = Store.getAll('patients');
  const doctors = Store.getAll('doctors').filter((d) => d.available !== false);
  if (!patients.length) {
    toast('Add a patient before booking an appointment.', 'error');
    return;
  }
  if (!doctors.length) {
    toast('Add a doctor before booking an appointment.', 'error');
    return;
  }
  const patientOpts = patients.map((p) => `<option value="${esc(p.id)}">${esc(p.id)} &middot; ${esc(p.name)} (${p.age || ''} ${p.age ? 'yrs' : ''})</option>`).join('');
  const doctorOpts = doctors.map((d) => `<option value="${esc(d.id)}" ${d.department ? `data-dept="${esc(d.department)}"` : ''}>${esc(d.name)} &middot; ${esc(d.specialization || '')}</option>`).join('');

  openModal(`
    <div class="modal-head"><div><h2>New Appointment</h2><p>Book a slot for a saved patient with a saved doctor</p></div></div>
    <form id="apptForm" class="form-grid" novalidate>
      <div class="form-group full">
        <label>Patient</label>
        <select class="input" id="ap-patient"><option value="">Select patient</option>${patientOpts}</select>
      </div>
      <div class="form-group full">
        <label>Doctor</label>
        <select class="input" id="ap-doctor"><option value="">Select doctor</option>${doctorOpts}</select>
      </div>
      <div class="form-group"><label>Department</label><input class="input" id="ap-dept" placeholder="Auto from doctor" readonly></div>
      <div class="form-group"><label>Appointment Type</label>
        <select class="input" id="ap-type">
          <option value="Consultation">Consultation</option>
          <option value="Follow-up">Follow-up</option>
          <option value="Emergency">Emergency</option>
          <option value="Surgery">Surgery</option>
          <option value="Check-up">Check-up</option>
        </select>
      </div>
      <div class="form-group"><label>Date</label><input type="date" class="input" id="ap-date" min="${todayISO()}"></div>
      <div class="form-group"><label>Time</label><input type="time" class="input" id="ap-time"></div>
      <div class="form-group full"><label>Reason (optional)</label><textarea class="input" id="ap-reason" rows="2" placeholder="Reason for visit"></textarea></div>
      <div class="form-actions full">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Book Appointment</button>
      </div>
    </form>
  `);

  const doctorSel = $('#ap-doctor');
  doctorSel.addEventListener('change', () => {
    const d = Store.getById('doctors', doctorSel.value);
    $('#ap-dept').value = d && d.department ? d.department : '';
  });

  $('#apptForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      patientId: $('#ap-patient').value,
      doctorId: $('#ap-doctor').value,
      date: $('#ap-date').value,
      time: $('#ap-time').value,
      type: $('#ap-type').value
    };
    const ok = validateForm([
      { id: 'ap-patient', value: data.patientId, test: () => Boolean(data.patientId), msg: 'Select a patient' },
      { id: 'ap-doctor', value: data.doctorId, test: () => Boolean(data.doctorId), msg: 'Select a doctor' },
      { id: 'ap-date', value: data.date, test: () => Boolean(data.date), msg: 'Select a date' },
      { id: 'ap-time', value: data.time, test: () => Boolean(data.time), msg: 'Select a time' }
    ]);
    if (!ok) return;

    const doctor = Store.getById('doctors', data.doctorId);
    const department = (doctor && doctor.department) || 'General';

    // Prevent conflicting bookings for the same doctor, date and time.
    const conflict = Store.getAll('appointments').some((a) =>
      a.doctorId === data.doctorId && a.date === data.date && a.time === data.time && a.status !== 'cancelled'
    );
    if (conflict) {
      setFieldError('ap-time', 'This doctor already has an appointment at this time.');
      return;
    }

    Store.add('appointments', {
      id: genAppointmentId(),
      patientId: data.patientId,
      doctorId: data.doctorId,
      department: department,
      date: data.date,
      time: data.time,
      type: data.type,
      reason: $('#ap-reason').value.trim(),
      status: 'pending',
      createdAt: todayISO()
    });
    closeModal();
    toast('Appointment booked.', 'success');
    refreshAll();
  });
}

/* ---- onAction: view / reschedule / complete / cancel ---- */
function onAction(e, btn) {
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const appt = Store.getById('appointments', id);
  if (!appt) return;

  if (action === 'view') return viewAppointment(appt);
  if (action === 'reschedule') return reschedule(appt);
  if (action === 'complete') return completeAppt(appt);
  if (action === 'cancel') return cancelAppt(appt);
}

function viewAppointment(appt) {
  openModal(`
    <div class="modal-head"><div><h2>Appointment ${esc(appt.id)}</h2><p><span class="badge ${statusClass(appt.status)}">${esc(capitalize(appt.status))}</span></p></div></div>
    <div class="meta-grid">
      <div class="meta-cell"><span class="meta-label">Patient</span><span class="meta-value">${esc(patientName(appt.patientId))} (${esc(appt.patientId)})</span></div>
      <div class="meta-cell"><span class="meta-label">Doctor</span><span class="meta-value">${esc(doctorName(appt.doctorId))}</span></div>
      <div class="meta-cell"><span class="meta-label">Department</span><span class="meta-value">${esc(appt.department || '-')}</span></div>
      <div class="meta-cell"><span class="meta-label">Type</span><span class="meta-value">${esc(appt.type || '-')}</span></div>
      <div class="meta-cell"><span class="meta-label">Date</span><span class="meta-value">${formatDate(appt.date)}</span></div>
      <div class="meta-cell"><span class="meta-label">Time</span><span class="meta-value">${esc(appt.time)}</span></div>
      ${appt.reason ? `<div class="meta-cell"><span class="meta-label">Reason</span><span class="meta-value">${esc(appt.reason)}</span></div>` : ''}
      <div class="meta-cell"><span class="meta-label">Booked On</span><span class="meta-value">${formatDate(appt.createdAt)}</span></div>
    </div>
    <div class="form-actions"><button class="btn btn-secondary" data-close>Close</button></div>
  `);
}

function reschedule(appt) {
  openModal(`
    <div class="modal-head"><div><h2>Reschedule ${esc(appt.id)}</h2><p>${esc(patientName(appt.patientId))} with ${esc(doctorName(appt.doctorId))}</p></div></div>
    <form id="reschedForm" class="form-grid" novalidate>
      <div class="form-group"><label>Date</label><input type="date" class="input" id="rs-date" value="${esc(appt.date || '')}" min="${todayISO()}"></div>
      <div class="form-group"><label>Time</label><input type="time" class="input" id="rs-time" value="${esc(appt.time || '')}"></div>
      <div class="form-actions full">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save New Slot</button>
      </div>
    </form>
  `);

  $('#reschedForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const date = $('#rs-date').value;
    const time = $('#rs-time').value;
    const ok = validateForm([
      { id: 'rs-date', value: date, test: () => Boolean(date), msg: 'Select a date' },
      { id: 'rs-time', value: time, test: () => Boolean(time), msg: 'Select a time' }
    ]);
    if (!ok) return;

    const conflict = Store.getAll('appointments').some((a) =>
      a.id !== appt.id && a.doctorId === appt.doctorId && a.date === date && a.time === time && a.status !== 'cancelled'
    );
    if (conflict) {
      setFieldError('rs-time', 'Doctor already has an appointment at this time.');
      return;
    }
    Store.update('appointments', appt.id, { date, time, status: 'confirmed' });
    closeModal();
    toast('Appointment rescheduled and confirmed.', 'success');
    refreshAll();
  });
}

function completeAppt(appt) {
  confirmDialog({
    title: 'Complete Appointment',
    message: 'Mark appointment ' + appt.id + ' as completed?',
    confirmText: 'Complete',
    danger: false,
    onConfirm: () => {
      Store.update('appointments', appt.id, { status: 'completed' });
      toast('Appointment completed.', 'success');
      refreshAll();
    }
  });
}

function cancelAppt(appt) {
  confirmDialog({
    title: 'Cancel Appointment',
    message: 'Cancel appointment ' + appt.id + ' for ' + patientName(appt.patientId) + '?',
    confirmText: 'Cancel Appointment',
    onConfirm: () => {
      Store.update('appointments', appt.id, { status: 'cancelled' });
      toast('Appointment cancelled.', 'success');
      refreshAll();
    }
  });
}

/* Register the page via the IIFE-local functions to avoid global name collisions. */
registerPage('appointments', { render, open, onAction });

})();