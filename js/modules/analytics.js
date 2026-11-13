/* =========================================================
   analytics.js - Analytics & Insights
   Live operational analytics: patient mix, department load,
   appointment distribution and doctor workload.
   Wrapped in an IIFE to avoid global name collisions.
   ========================================================= */

(function () {
'use strict';

registerPage('analytics', { render, open, onAction });

const ICON = {
  patient: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M17 10v4M19 12h-4"/></svg>',
  doctor: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1"/></svg>',
  cal: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  dept: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/></svg>'
};

function patientName(id) { const p = Store.getById('patients', id); return p ? p.name : 'Unknown'; }
function doctorName(id) { const d = Store.getById('doctors', id); return d ? d.name : 'Unknown'; }

function render() {
  const mount = $('#mount-analytics');
  if (!mount) return;
  const patients = Store.getAll('patients');
  const doctors = Store.getAll('doctors');
  const appointments = Store.getAll('appointments');
  const departments = Store.getAll('departments');

  // Gender mix
  const genderCounts = { Male: 0, Female: 0, Other: 0 };
  patients.forEach((p) => { const g = p.gender || 'Other'; genderCounts[g] = (genderCounts[g] || 0) + 1; });
  const genderItems = [
    { label: 'Female', value: genderCounts.Female || 0, color: CHART_COLORS.purple },
    { label: 'Male', value: genderCounts.Male || 0, color: CHART_COLORS.teal },
    { label: 'Other', value: genderCounts.Other || 0, color: CHART_COLORS.orange }
  ].filter((g) => g.value > 0);

  // Age bands
  const bands = [
    { label: '0-18', min: 0, max: 18 },
    { label: '19-35', min: 19, max: 35 },
    { label: '36-55', min: 36, max: 55 },
    { label: '56+', min: 56, max: 999 }
  ];
  const ageData = bands.map((b) => ({ label: b.label, count: patients.filter((p) => (Number(p.age) || 0) >= b.min && (Number(p.age) || 0) <= b.max).length }));

  // Appointments per department
  const deptAppts = departments.map((dep) => ({
    label: dep.name,
    count: appointments.filter((a) => a.department === dep.name || (a.departmentId && dep.name) ).length,
    color: CHART_COLORS.teal
  })).filter((d) => d.count > 0);

  // Doctor workload: appointments per doctor
  const doctorLoad = doctors.map((d) => ({ label: d.name.split(' ')[0], count: appointments.filter((a) => a.doctorId === d.id).length }));

  // Appointment status mix
  const statusCounts = {};
  appointments.forEach((a) => { statusCounts[a.status || 'pending'] = (statusCounts[a.status || 'pending'] || 0) + 1; });
  const statusItems = [
    { label: 'Scheduled', value: statusCounts.scheduled || 0, color: CHART_COLORS.blue },
    { label: 'Confirmed', value: statusCounts.confirmed || 0, color: CHART_COLORS.teal },
    { label: 'Completed', value: statusCounts.completed || 0, color: CHART_COLORS.emerald },
    { label: 'Cancelled', value: statusCounts.cancelled || 0, color: CHART_COLORS.rose }
  ].filter((s) => s.value > 0);

  mount.innerHTML = `
    <div class="page-head">
      <div><h1>Analytics</h1><p class="subtitle">Live operational insights computed from saved records</p></div>
    </div>

    <div class="stat-grid" style="margin-bottom:18px">
      <div class="stat-card"><div class="stat-icon purple">${ICON.patient}</div><div><span class="stat-label">Total Patients</span><span class="stat-value">${patients.length}</span></div></div>
      <div class="stat-card"><div class="stat-icon teal">${ICON.doctor}</div><div><span class="stat-label">Active Doctors</span><span class="stat-value">${doctors.length}</span></div></div>
      <div class="stat-card"><div class="stat-icon orange">${ICON.cal}</div><div><span class="stat-label">Total Appointments</span><span class="stat-value">${appointments.length}</span></div></div>
      <div class="stat-card"><div class="stat-icon green">${ICON.dept}</div><div><span class="stat-label">Departments</span><span class="stat-value">${departments.length}</span></div></div>
    </div>

    <div class="dash-bottom">
      <div class="card">
        <div class="card-head"><h2>Patient Age Groups</h2><span class="chip chip-teal">Age bands</span></div>
        <div class="chart-box"><canvas id="anAgeChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Gender Mix</h2><span class="chip chip-purple">Patients</span></div>
        <div class="chart-box"><canvas id="anGenderChart"></canvas></div>
        <div style="padding:0 16px 14px">
          ${genderItems.map((g) => `<div class="legend-row"><span class="legend-dot" style="background:${g.color}"></span>${esc(g.label)}<strong>${g.value}</strong></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="dash-bottom" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>Appointments by Department</h2><span class="chip chip-orange">Workload</span></div>
        <div class="chart-box"><canvas id="anDeptChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Doctor Workload</h2><span class="chip chip-teal">Scheduled appointments</span></div>
        <div class="chart-box"><canvas id="anDoctorChart"></canvas></div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Appointment Status Breakdown</h2><span class="chip chip-purple">${appointments.length} total</span></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Status</th><th>Count</th><th>Share</th></tr></thead>
          <tbody>
            ${statusItems.length ? statusItems.map((s) => {
              const share = appointments.length ? Math.round((s.value / appointments.length) * 100) : 0;
              return `<tr><td><span class="badge ${s.label === 'Completed' ? 'completed' : s.label === 'Cancelled' ? 'cancelled' : 'scheduled'}">${esc(s.label)}</span></td><td>${s.value}</td><td><span class="share-row"><span class="share-bar" style="width:${share}%;background:${s.color}"></span>${share}%</span></td></tr>`;
            }).join('') : '<tr><td colspan="3" class="empty-block">No appointments yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (ageData.some((b) => b.count)) {
    drawBarChart('anAgeChart', ageData.map((b) => b.label), ageData.map((b) => b.count), ageData.map(() => CHART_COLORS.purple), { height: 210, labels: true });
  } else {
    placeholderChart('anAgeChart', 'No patient records yet');
  }
  if (genderItems.length) {
    drawDoughnut('anGenderChart', genderItems, { centerLabel: patients.length });
  } else {
    placeholderChart('anGenderChart', 'No patients');
  }
  if (deptAppts.length) {
    drawBarChart('anDeptChart', deptAppts.map((d) => d.label.length > 10 ? d.label.slice(0, 8) + '..' : d.label), deptAppts.map((d) => d.count), deptAppts.map((d) => d.color), { height: 210, labels: true });
  } else {
    placeholderChart('anDeptChart', 'No appointments recorded');
  }
  if (doctorLoad.length) {
    drawBarChart('anDoctorChart', doctorLoad.map((d) => d.label), doctorLoad.map((d) => d.count), doctorLoad.map((d) => CHART_COLORS.emerald), { height: 210, labels: true });
  } else {
    placeholderChart('anDoctorChart', 'No doctors');
  }
}

function placeholderChart(canvasId, text) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = (canvas.parentElement.clientWidth || 300) * dpr;
  canvas.height = 160 * dpr;
  canvas.style.height = '160px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#9aa8b8';
  ctx.font = '13px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / dpr / 2, 80);
}

function open() {}
function onAction() {}

})();