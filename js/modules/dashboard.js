/* =========================================================
   dashboard.js - Dashboard page
   All statistics are computed live from LocalStorage.
   Wrapped in an IIFE so its helper names do not collide with
   other modules loaded as classic <script> tags.
   ========================================================= */

(function () {
'use strict';

registerPage('dashboard', { render, open, onAction });

function initials(name) {
  return (name || '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function avatarColor(name) {
  const colors = ['teal', 'purple', 'orange', 'green'];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

function statCard(icon, label, value, color) {
  return `
    <div class="stat-card">
      <div class="stat-icon ${color}">${icon}</div>
      <div>
        <span class="stat-label">${label}</span>
        <span class="stat-value">${value}</span>
      </div>
    </div>`;
}

function render() {
  const mount = $('#mount-dashboard');
  if (!mount) return;
  const patients = Store.getAll('patients');
  const doctors = Store.getAll('doctors');
  const appointments = Store.getAll('appointments');
  const bills = Store.getAll('bills');
  const today = todayISO();

  const todayAppts = appointments.filter((a) => a.date === today && a.status !== 'cancelled');
  const upcoming = appointments
    .filter((a) => a.status === 'pending' || a.status === 'confirmed')
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 6);

  const recent = patients.slice(-5).reverse();
  const recentDocs = doctors.slice(-4).reverse();

  // Recent activity: combine recent bills + recent appointments + recent patients
  const activity = [];
  bills.slice(-3).forEach((b) => activity.push({ icon: 'bill', text: 'Bill ' + b.number + ' created for ' + b.patientName, time: b.date }));
  appointments.slice(-3).forEach((a) => activity.push({ icon: 'appt', text: 'Appointment ' + a.id + ' (' + a.status + ') for ' + patientName(a.patientId), time: a.date }));
  patients.slice(-3).forEach((p) => activity.push({ icon: 'patient', text: p.name + ' registered as ' + p.id, time: p.createdAt }));
  activity.sort((a, b) => (b.time || '').localeCompare(a.time || '')).slice(0, 6);

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p class="subtitle" id="dashSubtitle">${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
    </div>

    <div class="cards-grid">
      ${statCard(ICONS.patient, 'Total Patients', patients.length, 'teal')}
      ${statCard(ICONS.doctor, 'Total Doctors', doctors.length, 'green')}
      ${statCard(ICONS.cal, "Today's Appointments", todayAppts.length, 'purple')}
      ${statCard(ICONS.clock, 'Pending Appointments', appointments.filter((a) => a.status === 'pending').length, 'orange')}
      ${statCard(ICONS.dollar, 'Total Revenue', formatCurrency(bills.reduce((s, b) => s + Number(b.total || 0), 0)), 'teal')}
      ${statCard(ICONS.alert, 'Pending Payments', formatCurrency(bills.reduce((s, b) => s + Number(b.balance || 0), 0)), 'orange')}
    </div>

    <div class="dash-top">
      <div class="card">
        <div class="card-head"><h2>Monthly Revenue</h2><span class="chip chip-teal">Billed amount</span></div>
        <div class="chart-box"><canvas id="revenueChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Patient Statistics</h2><span class="chip chip-orange">Gender mix</span></div>
        <div class="chart-box" style="display:grid;place-items:center"><canvas id="patientChart" style="max-width:200px"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Department Statistics</h2><span class="chip chip-purple">Appointments</span></div>
        <div class="chart-box"><canvas id="deptChart"></canvas></div>
      </div>
    </div>

    <div class="dash-bottom">
      <div class="card">
        <div class="card-head"><h2>Upcoming Appointments</h2><a href="#appointments" data-page="appointments" class="text-link">View all</a></div>
        <div class="list-block" id="dashUpcoming">${upcomingList(upcoming)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Recent Patient Registrations</h2><a href="#patients" data-page="patients" class="text-link">View all</a></div>
        <div class="list-block" id="dashRecent">${recentList(recent)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Recent Activity</h2></div>
        <div class="list-block" id="dashActivity">${activityList(activity)}</div>
      </div>
    </div>
  `;

  drawCharts({ patients, doctors, appointments, bills });
}

function patientName(id) {
  const p = Store.getById('patients', id);
  return p ? p.name : 'Unknown';
}

function doctorName(id) {
  const d = Store.getById('doctors', id);
  return d ? d.name : 'Unknown';
}

function upcomingList(list) {
  if (!list.length) return '<p class="empty-text" style="color:var(--muted);font-size:13px">No upcoming appointments.</p>';
  return list.map((a) => `
    <div class="list-item">
      <div class="list-item-main">
        <span class="list-item-name">${esc(patientName(a.patientId))}</span>
        <span class="list-item-sub">${formatDate(a.date)} &middot; ${a.time} &middot; ${esc(doctorName(a.doctorId))}</span>
      </div>
      <span class="badge ${a.status}">${esc(capitalize(a.status))}</span>
    </div>`).join('');
}

function recentList(list) {
  if (!list.length) return '<p class="empty-text" style="color:var(--muted);font-size:13px">No patients registered yet.</p>';
  return list.map((p) => `
    <div class="list-item">
      <span class="avatar ${avatarColor(p.name)}">${esc(initials(p.name))}</span>
      <div class="list-item-main">
        <span class="list-item-name">${esc(p.name)}</span>
        <span class="list-item-sub">${esc(p.id)} &middot; ${p.gender} ${p.age ? ', ' + p.age + ' yrs' : ''}</span>
      </div>
    </div>`).join('');
}

function activityList(list) {
  if (!list.length) return '<p class="empty-text" style="color:var(--muted);font-size:13px">No activity yet.</p>';
  return list.map((it) => `
    <div class="list-item">
      <span class="avatar ${it.icon === 'bill' ? 'purple' : it.icon === 'appt' ? 'teal' : 'orange'}">${it.icon === 'bill' ? ICONS.dollarSmall : it.icon === 'appt' ? ICONS.calSmall : ICONS.patientSmall}</span>
      <div class="list-item-main">
        <span class="list-item-name">${esc(it.text)}</span>
        <span class="list-item-sub">${formatDate(it.time)}</span>
      </div>
    </div>`).join('');
}

function drawCharts({ patients, doctors, appointments, bills }) {
  // Monthly revenue, last 6 months
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: d.toLocaleString('en', { month: 'short' }) });
  }
  const revenueByMonth = {};
  bills.forEach((b) => { const k = (b.date || '').slice(0, 7); if (k && revenueByMonth[k] !== undefined) revenueByMonth[k] += Number(b.total || 0); });
  const revLabels = months.map((m) => m.label);
  const revValues = months.map((m) => revenueByMonth[m.key] || 0);
  drawBarChart('revenueChart', revLabels, revValues, revValues.map(() => CHART_COLORS.teal), { height: 230, labels: true });

  // Patient gender doughnut
  const genderData = [
    { label: 'Male', value: patients.filter((p) => (p.gender || '').toLowerCase() === 'male').length, color: CHART_COLORS.teal },
    { label: 'Female', value: patients.filter((p) => (p.gender || '').toLowerCase() === 'female').length, color: CHART_COLORS.purple },
    { label: 'Other', value: patients.filter((p) => (p.gender || '').toLowerCase() === 'other').length, color: CHART_COLORS.orange }
  ].filter((g) => g.value > 0);
  drawDoughnut('patientChart', genderData, { centerLabel: patients.length });

  // Department stats: appointments per doctor's department
  const docDept = {};
  doctors.forEach((d) => { const dname = d.department || 'General'; if (docDept[dname] === undefined) docDept[dname] = 0; });
  appointments.forEach((a) => { const doc = Store.getById('doctors', a.doctorId); const dname = (doc && doc.department) || (a.department) || 'General'; docDept[dname] = (docDept[dname] || 0) + 1; });
  const deptLabels = Object.keys(docDept).slice(0, 7);
  const deptValues = deptLabels.map((k) => docDept[k] || 0);
  const deptColors = deptLabels.map((_, i) => [CHART_COLORS.teal, CHART_COLORS.purple, CHART_COLORS.orange, CHART_COLORS.emerald, CHART_COLORS.blue, CHART_COLORS.rose, CHART_COLORS.teal][i % 7]);
  drawBarChart('deptChart', deptLabels, deptValues, deptColors, { height: 230 });
}

function open() { navigateTo('dashboard'); }
function onAction(e, btn) {
  if (btn && btn.dataset.page) navigateTo(btn.dataset.page);
}

/* Small inline SVG icon set */
const ICONS = {
  patient: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M17 10v4M19 12h-4"/></svg>`,
  doctor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1"/><path d="M19 3v4M21 5h-4"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  dollar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c-.7-.9-1.8-1.4-3-1.4-1.9 0-3.5 1.2-3.5 2.7s1.6 2.7 3.5 2.7 3.5 1.2 3.5 2.7-1.6 2.7-3.5 2.7c-1.2 0-2.3-.5-3-1.4"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>`,
  dollarSmall: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2"><path d="M12 7v10M15 9.5c-.7-.9-1.8-1.4-3-1.4-1.9 0-3.5 1.2-3.5 2.7s1.6 2.7 3.5 2.7 3.5 1.2 3.5 2.7-1.6 2.7-3.5 2.7c-1.2 0-2.3-.5-3-1.4"/></svg>`,
  calSmall: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`,
  patientSmall: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1"/></svg>`
};

})();