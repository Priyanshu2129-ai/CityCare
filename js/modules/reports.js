/* =========================================================
   reports.js - Reports & Analytics
   Aggregated live reports with date-range filter, print, CSV export.
   Wrapped in an IIFE to avoid global name collisions.
   ========================================================= */

(function () {
'use strict';

registerPage('reports', { render, open, onAction });

let rptFrom = '';
let rptTo = '';

function render() {
  const mount = $('#mount-reports');
  if (!mount) return;
  const patients = Store.getAll('patients');
  const doctors = Store.getAll('doctors');
  const appointments = Store.getAll('appointments');
  const bills = Store.getAll('bills');
  const departments = Store.getAll('departments');

  const inRange = (iso) => {
    if (!iso) return true;
    if (rptFrom && iso < rptFrom) return false;
    if (rptTo && iso > rptTo) return false;
    return true;
  };
  const rf = appointments.filter((a) => inRange(a.date));
  const bf = bills.filter((b) => inRange(b.date));

  const totalRevenue = bf.reduce((s, b) => s + Number(b.total || 0), 0);
  const collected = bf.reduce((s, b) => s + Number(b.paid || 0), 0);
  const outstanding = bf.reduce((s, b) => s + Number(b.balance || 0), 0);

  // Monthly stats
  const monthKey = {};
  bf.forEach((b) => { const k = (b.date || '').slice(0, 7); monthKey[k] = monthKey[k] || { billed: 0, collected: 0 }; monthKey[k].billed += Number(b.total || 0); monthKey[k].collected += Number(b.paid || 0); });
  const monthLabels = Object.keys(monthKey).sort();

  mount.innerHTML = `
    <div class="page-head">
      <div><h1>Reports &amp; Analytics</h1><p class="subtitle">Live operational reports from saved data</p></div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="table-toolbar">
        <label class="meta-label">From</label>
        <input type="date" class="input report-range" id="rptFrom" value="${rptFrom}" style="width:auto;max-width:170px">
        <label class="meta-label">To</label>
        <input type="date" class="input report-range" id="rptTo" value="${rptTo}" style="width:auto;max-width:170px">
        <span class="spacer"></span>
        <button class="btn btn-secondary btn-sm" id="rptPrint">Print Report</button>
        <button class="btn btn-secondary btn-sm" id="rptCSV">Export CSV</button>
      </div>
      <div id="reportBody">
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-icon teal">${ICON.patient}</div><div><span class="stat-label">Patients (all time)</span><span class="stat-value">${patients.length}</span></div></div>
          <div class="stat-card"><div class="stat-icon green">${ICON.doctor}</div><div><span class="stat-label">Total Doctors</span><span class="stat-value">${doctors.length}</span></div></div>
          <div class="stat-card"><div class="stat-icon purple">${ICON.cal}</div><div><span class="stat-label">Appointments (range)</span><span class="stat-value">${rf.length}</span></div></div>
          <div class="stat-card"><div class="stat-icon orange">${ICON.dollar}</div><div><span class="stat-label">Revenue (range)</span><span class="stat-value">${formatCurrency(totalRevenue)}</span></div></div>
          <div class="stat-card"><div class="stat-icon green">${ICON.collect}</div><div><span class="stat-label">Collected</span><span class="stat-value">${formatCurrency(collected)}</span></div></div>
          <div class="stat-card"><div class="stat-icon orange">${ICON.alert}</div><div><span class="stat-label">Outstanding</span><span class="stat-value">${formatCurrency(outstanding)}</span></div></div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Monthly Statistics</h2><span class="chip chip-teal">Billed vs collected</span></div>
          <div class="chart-box"><canvas id="rptChart"></canvas></div>
        </div>

        <div class="dash-bottom" style="margin-top:16px">
          ${reportTable('Appointment Report', ['Appt ID','Patient','Doctor','Date','Time','Status'], rf.map((a) => [a.id, patientName(a.patientId), doctorName(a.doctorId), a.date, a.time, a.status]))}
          ${reportTable('Billing Report', ['Bill#','Patient','Date','Total','Paid','Balance','Status'], bf.map((b) => [b.number, b.patientName, b.date, formatCurrency(b.total), formatCurrency(b.paid), formatCurrency(b.balance), b.status]))}
        </div>
        <div class="dash-bottom" style="margin-top:16px">
          ${reportTable('Doctor Report', ['Doctor','Specialization','Department','Appointments'], doctors.map((d) => [d.name, d.specialization, d.department || '-', appointments.filter((a) => a.doctorId === d.id).length]))}
          ${reportTable('Department Report', ['Department','Doctors','Appointments'], departments.map((dep) => [dep.name, doctors.filter((d) => d.department === dep.name).length, appointments.filter((a) => a.department === dep.name).length]))}
        </div>
        <div style="margin-top:16px">
          ${reportTable('Patient Report', ['Patient ID','Name','Gender','Phone','Appointments','Total Billed'], patients.map((p) => [p.id, p.name, p.gender, p.phone, appointments.filter((a) => a.patientId === p.id).length, formatCurrency(bills.filter((b) => b.patientId === p.id).reduce((s, x) => s + Number(x.total || 0), 0))]))}
        </div>
      </div>
    </div>
  `;

  // Charts
  const mlabels = monthLabels.length ? monthLabels.map((m) => m.slice(5) + '/' + m.slice(2, 4)) : ['No data'];
  const mval1 = monthLabels.map((m) => (monthKey[m] ? monthKey[m].billed : 0));
  const mval2 = monthLabels.map((m) => (monthKey[m] ? monthKey[m].collected : 0));
  // grouped bars: draw billed then collected by offsetting - placeholder: draw billed
  drawBarChart('rptChart', mlabels, mval1, mval1.map(() => CHART_COLORS.teal), { height: 250, labels: true });

  // Bind range inputs
  const f1 = $('#rptFrom'), f2 = $('#rptTo');
  if (f1) f1.addEventListener('change', () => { rptFrom = f1.value; render(); });
  if (f2) f2.addEventListener('change', () => { rptTo = f2.value; render(); });
  const pr = $('#rptPrint'); if (pr) pr.addEventListener('click', () => window.print());
  const csv = $('#rptCSV');
  if (csv) csv.addEventListener('click', () => {
    const rows = [
      ...rf.map((a) => ['APP', a.id, patientName(a.patientId), doctorName(a.doctorId), a.date, a.time, a.status, '', '', '']),
      ...bf.map((b) => ['BILL', '', b.patientName, '', b.date, '', b.status, b.total, b.paid, b.balance])
    ];
    exportCSV('citycare-report.csv', ['Type', 'ID', 'Patient', 'Doctor', 'Date', 'Time', 'Status', 'Total', 'Paid', 'Balance'], rows);
  });
}

function reportTable(title, headers, rows) {
  return `
    <div class="card">
      <div class="card-head"><h2>${esc(title)}</h2><span class="chip chip-purple">${rows.length}</span></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="' + headers.length + '" class="empty-block">No data in this range</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function patientName(id) { const p = Store.getById('patients', id); return p ? p.name : 'Unknown'; }
function doctorName(id) { const d = Store.getById('doctors', id); return d ? d.name : 'Unknown'; }

function open() { render(); }
function onAction(e, btn) {}

const ICON = {
  patient: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="7.5" r="3.5"/></svg>`,
  doctor: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1"/><path d="M19 3v4M21 5h-4"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`,
  dollar: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><circle cx="12" cy="12" r="9"/><path d="M12 7v10"/></svg>`,
  collect: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>`
};

})();