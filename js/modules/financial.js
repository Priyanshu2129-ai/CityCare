/* =========================================================
   financial.js - Financial Overview
   Live revenue summary, monthly billed vs collected, payment
   mix and recent invoices. Read-only analytics.
   Wrapped in an IIFE to avoid global name collisions.
   ========================================================= */

(function () {
'use strict';

registerPage('financial', { render, open, onAction });

const ICON = {
  rev: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  collect: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h18v14H3z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><path d="M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/></svg>',
  due: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  bill: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4L10 21l-2-1.4L6 21V3z"/></svg>'
};

function round2(n) { return Math.round(n * 100) / 100; }

function render() {
  const mount = $('#mount-financial');
  if (!mount) return;
  const bills = Store.getAll('bills');
  const appointments = Store.getAll('appointments');
  const doctors = Store.getAll('doctors');

  const totalRevenue = round2(bills.reduce((s, b) => s + Number(b.total || 0), 0));
  const collected = round2(bills.reduce((s, b) => s + Number(b.paid || 0), 0));
  const outstanding = round2(bills.reduce((s, b) => s + Number(b.balance || 0), 0));
  const paidBills = bills.filter((b) => Number(b.balance || 0) <= 0);
  const partialBills = bills.filter((b) => Number(b.balance || 0) > 0 && Number(b.paid || 0) > 0);
  const unpaidBills = bills.filter((b) => Number(b.paid || 0) <= 0 && Number(b.balance || 0) > 0);

  // Monthly billed vs collected
  const monthKey = {};
  bills.forEach((b) => {
    const k = (b.date || '').slice(0, 7);
    if (!k) return;
    monthKey[k] = monthKey[k] || { billed: 0, collected: 0 };
    monthKey[k].billed += Number(b.total || 0);
    monthKey[k].collected += Number(b.paid || 0);
  });
  const months = Object.keys(monthKey).sort();
  const mLabels = months.length ? months.map((m) => m.slice(5) + '/' + m.slice(2, 4)) : ['No data'];

  // Payment method mix
  const methodCounts = {};
  bills.forEach((b) => { const m = b.method || 'Other'; methodCounts[m] = (methodCounts[m] || 0) + 1; });
  const methodItems = Object.keys(methodCounts).map((m) => ({
    label: m,
    value: methodCounts[m],
    color: CHART_COLORS[m === 'Cash' ? 'emerald' : m === 'Card' ? 'teal' : 'purple']
  })).filter((m) => m.value > 0);

  // Department revenue proxy: consultation fees billed through appointments
  const deptRevenue = {};
  appointments.forEach((a) => {
    const d = doctors.find((x) => x.id === a.doctorId);
    if (d) deptRevenue[a.department] = (deptRevenue[a.department] || 0) + Number(d.fees || 0);
  });
  const deptLabels = Object.keys(deptRevenue);
  const deptVals = deptLabels.map((k) => round2(deptRevenue[k]));

  // Recent invoices sorted by date desc
  const recent = bills.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  mount.innerHTML = `
    <div class="page-head">
      <div><h1>Financial Overview</h1><p class="subtitle">Live revenue and collections from saved billing data</p></div>
    </div>

    <div class="stat-grid" style="margin-bottom:18px">
      <div class="stat-card"><div class="stat-icon teal">${ICON.rev}</div><div><span class="stat-label">Total Billed</span><span class="stat-value">${formatCurrency(totalRevenue)}</span></div></div>
      <div class="stat-card"><div class="stat-icon green">${ICON.collect}</div><div><span class="stat-label">Collected</span><span class="stat-value">${formatCurrency(collected)}</span></div></div>
      <div class="stat-card"><div class="stat-icon orange">${ICON.due}</div><div><span class="stat-label">Outstanding</span><span class="stat-value">${formatCurrency(outstanding)}</span></div></div>
      <div class="stat-card"><div class="stat-icon purple">${ICON.bill}</div><div><span class="stat-label">Invoices</span><span class="stat-value">${bills.length}</span></div></div>
    </div>

    <div class="dash-bottom">
      <div class="card">
        <div class="card-head"><h2>Monthly Revenue</h2><span class="chip chip-teal">Billed vs collected</span></div>
        <div class="chart-box"><canvas id="finMonthChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Payment Methods</h2><span class="chip chip-purple">Invoices</span></div>
        <div class="chart-box"><canvas id="finMethodChart"></canvas></div>
        <div style="padding:0 16px 14px">
          ${methodItems.map((m) => `<div class="legend-row"><span class="legend-dot" style="background:${m.color}"></span>${esc(m.label)}<strong>${m.value}</strong></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="dash-bottom" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>Billing Health</h2><span class="chip chip-orange">Receivables</span></div>
        <div style="padding:16px">
          <div class="health-row"><span>Fully paid</span><span class="health-val">${paidBills.length} invoice${paidBills.length === 1 ? '' : 's'}</span></div>
          <div class="health-row"><span>Partially paid</span><span class="health-val">${partialBills.length}</span></div>
          <div class="health-row"><span>Unpaid</span><span class="health-val">${unpaidBills.length}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Revenue by Department</h2><span class="chip chip-teal">Consultation fees billed</span></div>
        <div class="chart-box"><canvas id="finDeptChart"></canvas></div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Recent Invoices</h2><span class="chip chip-purple">${bills.length}</span></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Invoice</th><th>Patient</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            ${recent.length ? recent.map((b) => `<tr>
              <td>${esc(b.number)}</td>
              <td>${esc(b.patientName)}</td>
              <td>${esc(b.date)}</td>
              <td>${formatCurrency(b.total)}</td>
              <td>${formatCurrency(b.paid)}</td>
              <td>${formatCurrency(b.balance)}</td>
              <td><span class="badge ${b.status === 'paid' ? 'completed' : b.status === 'partial' ? 'partial' : 'unpaid'}">${esc(capitalize(b.status))}</span></td>
            </tr>`).join('') : '<tr><td colspan="7" class="empty-block">No invoices yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (months.length) {
    drawMonthly('finMonthChart', mLabels, months.map((m) => round2(monthKey[m].billed)), months.map((m) => round2(monthKey[m].collected)));
  } else {
    placeholderChart('finMonthChart', 'No billing data yet');
  }
  if (methodItems.length) drawDoughnut('finMethodChart', methodItems, { centerLabel: bills.length });
  else placeholderChart('finMethodChart', 'No invoices');
  if (deptLabels.length) drawBarChart('finDeptChart', deptLabels.map((l) => l.length > 9 ? l.slice(0, 7) + '..' : l), deptVals, deptLabels.map((l, i) => [CHART_COLORS.purple, CHART_COLORS.teal, CHART_COLORS.orange, CHART_COLORS.emerald][i % 4]), { height: 200, labels: true });
  else placeholderChart('finDeptChart', 'No department revenue yet');
}

// Grouped bar chart: billed (teal) and collected (emerald) for each month.
function drawMonthly(canvasId, labels, billedVals, collectedVals) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width || 300, h = 240;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const padL = 38, padB = 26, padT = 12, padR = 8;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const max = Math.max(1, ...billedVals, ...collectedVals);
  ctx.strokeStyle = '#eef2f7'; ctx.fillStyle = '#9aa8b8'; ctx.font = '11px Inter, sans-serif';
  for (let g = 0; g <= 3; g++) {
    const y = padT + (plotH / 3) * g;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText('$' + Math.round(max * (1 - g / 3)), 2, y + 4);
  }
  const n = labels.length, slot = plotW / n, pair = slot * 0.5, barW = pair / 2 - 3;
  labels.forEach((lbl, i) => {
    const gx = padL + slot * i + (slot - pair) / 2;
    [[CHART_COLORS.teal, billedVals[i]], [CHART_COLORS.emerald, collectedVals[i]]].forEach(([color, val], k) => {
      const bh = (Number(val) / max) * plotH;
      const y = padT + plotH - bh;
      const x = gx + k * (barW + 4);
      const grad = ctx.createLinearGradient(0, y, 0, y + bh);
      grad.addColorStop(0, color); grad.addColorStop(1, color + '88');
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, barW, bh, 4); ctx.fill();
    });
    ctx.fillStyle = '#9aa8b8'; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(lbl), gx + pair / 2, h - padB + 14);
  });
  ctx.textAlign = 'left';
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