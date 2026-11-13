/* =========================================================
   activity.js - Activity Logs
   A live, chronological feed of system activity derived from
   saved records: registrations, appointments, billing, records,
   lab work and contact messages. Filterable by category.
   Wrapped in an IIFE to avoid global name collisions.
   ========================================================= */

(function () {
'use strict';

registerPage('activity', { render, open, onAction });

let actFilter = 'all';
let actQuery = '';

function patientName(id) { const p = Store.getById('patients', id); return p ? p.name : 'Unknown'; }
function doctorName(id) { const d = Store.getById('doctors', id); return d ? d.name : 'Unknown'; }

function resolveName(kind, id) {
  if (kind === 'doctor') return doctorName(id);
  if (kind === 'patient') return patientName(id);
  return '';
}

function buildActivities() {
  const out = [];

  const now = todayISO();
  const key = (r, fallback) => r.createdAt || r.date || fallback || now;

  Store.getAll('patients').forEach((p) => out.push({ id: 'P-' + p.id, kind: 'patient', icon: 'patient', title: 'Patient registered', detail: p.name, who: 'Administrator', date: p.createdAt || now }));
  Store.getAll('doctors').forEach((d) => out.push({ id: 'D-' + d.id, kind: 'doctor', icon: 'doctor', title: 'Doctor added', detail: d.name + ' - ' + (d.specialization || '') , who: 'Administrator', date: d.joined || now }));
  Store.getAll('appointments').forEach((a) => out.push({ id: 'A-' + a.id, kind: 'appointment', icon: 'cal', title: 'Appointment ' + (a.status || 'booked'), detail: patientName(a.patientId) + ' with ' + doctorName(a.doctorId) + ' on ' + a.date, who: 'Front Desk', date: key(a, a.date) }));
  Store.getAll('bills').forEach((b) => out.push({ id: 'B-' + b.number, kind: 'billing', icon: 'bill', title: 'Invoice ' + b.number, detail: formatCurrency(b.total) + ' - ' + b.patientName + (b.status === 'paid' ? ' (paid)' : ' (' + b.status + ')'), who: 'Billing', date: b.date || now }));
  Store.getAll('records').forEach((r) => out.push({ id: 'R-' + r.id, kind: 'record', icon: 'clipboard', title: 'Medical record added', detail: patientName(r.patientId) + ': ' + (r.diagnosis || ''), who: doctorName(r.doctorId), date: r.date || now }));
  Store.getAll('lab').forEach((l) => out.push({ id: 'L-' + l.id, kind: 'lab', icon: 'lab', title: 'Lab test - ' + (l.name || '') , detail: patientName(l.patientId) + ' (' + (l.status || '') + ')', who: doctorName(l.doctorId), date: l.date || now }));
  Store.getAll('contact').forEach((m) => out.push({ id: 'M-' + m.id, kind: 'message', icon: 'message', title: 'Contact inquiry', detail: m.name + ': ' + (m.subject || ''), who: 'Website', date: m.date || now }));

  return out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function categorize(kind) {
  const map = {
    patient: 'Registrations', doctor: 'Doctors', appointment: 'Appointments',
    billing: 'Billing', record: 'Medical Records', lab: 'Laboratory', message: 'Inquiries'
  };
  return map[kind] || 'Other';
}

function iconSvg(kind) {
  const common = 'fill="none" stroke="currentColor" stroke-width="1.8"';
  const paths = {
    patient: '<circle cx="9.5" cy="7.5" r="3.5"/><path d="M4 21v-1a5 5 0 0 1 5-5h4"/>',
    doctor: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    bill: '<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4L10 21l-2-1.4L6 21V3z"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6"/>',
    lab: '<path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7 15h10"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
  };
  return `<svg viewBox="0 0 24 24" ${common}>${paths[kind] || paths.message}</svg>`;
}

function render() {
  const mount = $('#mount-activity');
  if (!mount) return;
  const all = buildActivities();
  const filtered = all.filter((a) => {
    if (actFilter !== 'all' && a.kind !== actFilter) return false;
    if (actQuery && !((a.detail + ' ' + a.title + ' ' + a.who).toLowerCase().includes(actQuery.toLowerCase()))) return false;
    return true;
  });
  const cats = ['all', 'patient', 'doctor', 'appointment', 'billing', 'record', 'lab', 'message'];

  mount.innerHTML = `
    <div class="page-head">
      <div><h1>Activity Logs</h1><p class="subtitle">Chronological record of all system activity, derived live from saved data</p></div>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <input type="text" class="input" id="actSearch" placeholder="Search activity..." value="${esc(actQuery)}" style="max-width:260px">
        <select class="filter-select" id="actFilter">
          ${cats.map((c) => `<option value="${c}" ${c === actFilter ? 'selected' : ''}>${c === 'all' ? 'All categories' : categorize(c)}</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <span class="chip chip-teal" style="margin-left:auto">${filtered.length} events</span>
      </div>

      ${filtered.length ? `
      <div class="activity-list">
        ${filtered.slice(0, 60).map((a) => `
          <div class="activity-row">
            <span class="activity-icon ${catTone(a.kind)}">${iconSvg(a.kind)}</span>
            <div class="activity-main">
              <div class="activity-title">${esc(a.title)} <span class="chip chip-soft">${esc(categorize(a.kind))}</span></div>
              <div class="activity-detail">${esc(a.detail)}</div>
            </div>
            <div class="activity-meta">
              <div class="activity-who">${esc(a.who)}</div>
              <div class="activity-date">${esc(a.date)}</div>
            </div>
          </div>`).join('')}
      </div>` : '<div class="empty-block">No activity found</div>'}
    </div>
  `;

  const search = $('#actSearch');
  if (search) search.addEventListener('input', () => { actQuery = search.value; render(); });
  const filter = $('#actFilter');
  if (filter) filter.addEventListener('change', () => { actFilter = filter.value; render(); });
}

function catTone(kind) {
  const tones = {
    patient: 'purple', doctor: 'teal', appointment: 'blue', billing: 'orange',
    record: 'emerald', lab: 'rose', message: 'teal'
  };
  return tones[kind] || 'teal';
}

function open() {}
function onAction() {}

})();