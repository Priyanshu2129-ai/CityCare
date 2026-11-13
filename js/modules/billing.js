/* =========================================================
   billing.js - Billing & Payments
   Generate bills with line items, auto total, discount, tax,
   partial payments and payment history. View, print and delete.
   ========================================================= */

(function () {
'use strict';

registerPage('billing', { render, open, onAction });

/* One delegated search listener for this module, registered once. */
document.addEventListener('input', (e) => {
  if (e.target.dataset && e.target.dataset.search === 'billing') {
    Pages['billing'] && Pages['billing'].render();
  }
});

function searchQuery() {
  const el = $('[data-search="billing"]');
  return (el && (el.value || '').toLowerCase().trim()) || '';
}

function patientName(id) {
  const p = Store.getById('patients', id);
  return p ? p.name : 'Unknown';
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function statusClass(s) {
  const v = (s || '').toLowerCase();
  if (v === 'paid') return 'paid';
  if (v === 'partial') return 'partial';
  if (v === 'unpaid' || v === 'overdue') return 'unpaid';
  return 'pending';
}

function amountInput(label, amount, id) {
  return `
    <div class="bill-row">
      <span>${esc(label)}</span>
      <span class="money"><input class="input charge-input" data-charge="${id}" data-label="${esc(label)}" type="number" min="0" step="0.01" value="${Number(amount) || 0}"></span>
    </div>`;
}

function billRows(list) {
  return list.map((b) => `
    <tr>
      <td><span class="primary-text">${esc(b.number)}</span></td>
      <td>
        <span class="primary-text">${esc(b.patientName || patientName(b.patientId))}</span>
        <div class="muted-text">${esc(b.patientId || '')}</div>
      </td>
      <td>${formatDate(b.date)}</td>
      <td class="primary-text">${formatCurrency(b.total)}</td>
      <td class="primary-text">${formatCurrency(b.paid)}</td>
      <td class="primary-text">${formatCurrency(b.balance)}</td>
      <td><span class="badge ${statusClass(b.status)}">${esc(capitalize(b.status))}</span></td>
      <td class="actions-col">
        <div class="actions">
          <button class="btn btn-ghost btn-sm" data-action="view" data-id="${esc(b.id)}" data-module="billing">View</button>
          <button class="btn btn-sm" data-action="print" data-id="${esc(b.id)}" data-module="billing">Print</button>
          <button class="btn btn-secondary btn-sm" data-action="pay" data-id="${esc(b.id)}" data-module="billing" ${Number(b.balance) <= 0 ? 'disabled' : ''}>Record Payment</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${esc(b.id)}" data-module="billing">Delete</button>
        </div>
      </td>
    </tr>`).join('');
}

function render() {
  const mount = $('#mount-billing');
  if (!mount) return;
  const bills = Store.getAll('bills');
  const q = searchQuery();

  let list = bills.filter((b) =>
    !q || (b.number || '').toLowerCase().includes(q) ||
    (b.patientName || patientName(b.patientId)).toLowerCase().includes(q) ||
    (b.patientId || '').toLowerCase().includes(q) ||
    (b.status || '').toLowerCase().includes(q)
  ).slice().reverse();

  const totalRevenue = bills.reduce((s, b) => s + Number(b.total || 0), 0);
  const collected = bills.reduce((s, b) => s + Number(b.paid || 0), 0);
  const outstanding = bills.reduce((s, b) => s + Number(b.balance || 0), 0);
  const count = bills.length;

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Billing &amp; Payments</h1>
        <p class="subtitle">Generate invoices, track payments and print receipts</p>
      </div>
      <button class="btn btn-primary" data-open-btn="billing">New Bill</button>
    </div>

    <div class="cards-grid">
      <div class="stat-card"><div class="stat-icon teal"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M12 7v10M15 9.5c-.7-.9-1.8-1.4-3-1.4-1.9 0-3.5 1.2-3.5 2.7s1.6 2.7 3.5 2.7 3.5 1.2 3.5 2.7-1.6 2.7-3.5 2.7c-1.2 0-2.3-.5-3-1.4"/></svg></div><div><span class="stat-label">Bills Generated</span><span class="stat-value">${count}</span></div></div>
      <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg></div><div><span class="stat-label">Revenue</span><span class="stat-value">${formatCurrency(totalRevenue)}</span></div></div>
      <div class="stat-card"><div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M3 12h4l2 6 3-14 3 10 2-2h4"/></svg></div><div><span class="stat-label">Collected</span><span class="stat-value">${formatCurrency(collected)}</span></div></div>
      <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></div><div><span class="stat-label">Outstanding</span><span class="stat-value">${formatCurrency(outstanding)}</span></div></div>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <div class="search-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input class="input" data-search="billing" aria-label="Search bills" placeholder="Search bill #, patient, status..."
            value="${esc($('[data-search="billing"]') ? ($('[data-search="billing"]').value || '') : '')}">
        </div>
        <span class="spacer"></span>
        <button class="btn btn-secondary btn-sm" data-export-bill>Export CSV</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Bill #</th><th>Patient</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th class="actions-col">Actions</th></tr></thead>
          <tbody>${list.length ? billRows(list) : '<tr><td colspan="8" class="empty-block">No bills yet. Create one to get started.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  const ex = $('[data-export-bill]');
  if (ex) ex.addEventListener('click', () => {
    exportCSV('bills.csv', ['Bill#', 'Patient', 'Date', 'Total', 'Paid', 'Balance', 'Status'],
      bills.map((b) => [b.number, b.patientName || patientName(b.patientId), b.date, b.total, b.paid, b.balance, b.status]));
  });
}

/* ---- open(): New Bill form ---- */
function open() {
  const patients = Store.getAll('patients');
  if (!patients.length) {
    toast('Add a patient before creating a bill.', 'error');
    return;
  }
  const patientOpts = patients.map((p) => `<option value="${esc(p.id)}">${esc(p.id)} &middot; ${esc(p.name)}</option>`).join('');
  const doctor = Store.getAll('doctors')[0] || null;

  openModal(`
    <div class="modal-head"><div><h2>New Bill</h2><p>Bill number ${esc(genBillNumber())} will be assigned on save</p></div></div>
    <form id="billForm" novalidate>
      <div class="form-grid">
        <div class="form-group">
          <label>Patient</label>
          <select class="input" id="bi-patient"><option value="">Select patient</option>${patientOpts}</select>
        </div>
        <div class="form-group"><label>Bill Date</label><input type="date" class="input" id="bi-date" value="${todayISO()}"></div>
        ${doctor ? `<div class="form-group"><label>Consultation Fee</label><input class="input" type="number" min="0" step="0.01" id="bi-consult" value="${Number(doctor.fees) || 0}"></div>` : ''}
        <div class="form-group"><label>Medicine Charges</label><input class="input" type="number" min="0" step="0.01" id="bi-medicine" value="0"></div>
        <div class="form-group"><label>Laboratory Charges</label><input class="input" type="number" min="0" step="0.01" id="bi-lab" value="0"></div>
        <div class="form-group"><label>Treatment Charges</label><input class="input" type="number" min="0" step="0.01" id="bi-treatment" value="0"></div>
        <div class="form-group"><label>Additional Charges</label><input class="input" type="number" min="0" step="0.01" id="bi-additional" value="0"></div>
        <div class="form-group"><label>Discount ($)</label><input class="input" type="number" min="0" step="0.01" id="bi-discount" value="0"></div>
        <div class="form-group"><label>Tax (%)</label><input class="input" type="number" min="0" step="0.01" id="bi-tax" value="5"></div>
        <div class="form-group full"><label>Payment Method</label>
          <select class="input" id="bi-method"><option>Cash</option><option>Card</option><option>Insurance</option><option>Bank Transfer</option></select>
        </div>
        <div class="form-group full"><label>Amount Paid Now ($)</label><input class="input" type="number" min="0" step="0.01" id="bi-paid" value="0"></div>
      </div>

      <div class="bill-total" style="margin-top:18px">
        <span>Subtotal <span id="bi-subLabel"></span></span>
      </div>
      <div class="bill-total" style="margin-top:8px">
        <span>Total after discount &amp; tax</span>
        <strong id="bi-total">$0.00</strong>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Bill</button>
      </div>
    </form>
  `);

  const calc = () => {
    const sum = ['bi-consult', 'bi-medicine', 'bi-lab', 'bi-treatment', 'bi-additional']
      .reduce((s, id) => s + (Number($('#bi-' + (id.slice(3))) ? $('#' + id).value : 0) || 0), 0);
    const discount = Number($('#bi-discount').value) || 0;
    const taxPct = Number($('#bi-tax').value) || 0;
    const afterDiscount = Math.max(0, sum - discount);
    const tax = round2(afterDiscount * taxPct / 100);
    const total = round2(afterDiscount + tax);
    $('#bi-subLabel').textContent = formatCurrency(sum);
    $('#bi-total').textContent = formatCurrency(total);
    return { subtotal: sum, discount, tax, total };
  };
  ['#bi-consult', '#bi-medicine', '#bi-lab', '#bi-treatment', '#bi-additional', '#bi-discount', '#bi-tax']
    .forEach((sel) => { const el = $(sel); if (el) el.addEventListener('input', calc); });
  calc();

  $('#billForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const patientId = $('#bi-patient').value;
    const ok = validateForm([
      { id: 'bi-patient', value: patientId, test: () => Boolean(patientId), msg: 'Select a patient' }
    ]);
    if (!ok) return;

    const c = calc();
    const patient = Store.getById('patients', patientId);
    const paid = round2(Math.min(Number($('#bi-paid').value) || 0, c.total));
    const balance = round2(c.total - paid);
    const method = $('#bi-method').value;
    const status = balance <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
    const items = [
      { desc: 'Consultation Fee', amount: round2(Number($('#bi-consult').value) || 0) },
      { desc: 'Treatment Charges', amount: round2(Number($('#bi-treatment').value) || 0) },
      { desc: 'Medicine Charges', amount: round2(Number($('#bi-medicine').value) || 0) },
      { desc: 'Laboratory Charges', amount: round2(Number($('#bi-lab').value) || 0) },
      { desc: 'Additional Charges', amount: round2(Number($('#bi-additional').value) || 0) }
    ].filter((it) => it.amount > 0);

    Store.add('bills', {
      id: 'bill-' + Date.now(),
      number: genBillNumber(),
      patientId,
      patientName: patient.name,
      date: $('#bi-date').value || todayISO(),
      items,
      subtotal: round2(c.subtotal),
      discount: round2(c.discount),
      tax: round2(c.tax),
      total: round2(c.total),
      paid,
      balance,
      status,
      method,
      payments: paid > 0 ? [{ date: todayISO(), amount: paid, method }] : [],
      createdAt: todayISO()
    });
    closeModal();
    toast('Bill saved.', 'success');
    refreshAll();
  });
}

/* ---- onAction ---- */
function onAction(e, btn) {
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const bill = Store.getById('bills', id);
  if (!bill) return;
  if (action === 'view') return viewBill(bill);
  if (action === 'print') return printBill(bill);
  if (action === 'pay') return recordPayment(bill);
  if (action === 'delete') return deleteBill(bill);
}

function billSheetHtml(bill) {
  const settings = getSettings();
  const items = (bill.items && bill.items.length) ? bill.items : [{ desc: 'Services', amount: bill.subtotal || bill.total || 0 }];
  const rows = items.map((it) => `
    <div class="bill-row"><span>${esc(it.desc)}</span><span>${formatCurrency(it.amount)}</span></div>`).join('');
  return `
    <div class="bill-sheet">
      <div class="bill-head">
        <div>
          <div class="bill-title">${esc(settings.hospitalName || 'CityCare Hospital')}</div>
          <div class="muted-text">${esc(settings.address || '')}</div>
          <div class="muted-text">${esc(settings.phone || '')} &middot; ${esc(settings.email || '')}</div>
        </div>
        <div style="text-align:right">
          <div class="bill-title" style="color:var(--muted)">INVOICE</div>
          <div class="muted-text">${esc(bill.number)}</div>
          ${bill.status === 'paid' ? '<div class="bill-stamp" style="margin-top:6px">PAID</div>' : ''}
        </div>
      </div>
      <div class="meta-grid" style="margin-bottom:14px">
        <div class="meta-cell"><span class="meta-label">Bill To</span><span class="meta-value">${esc(bill.patientName || patientName(bill.patientId))}</span></div>
        <div class="meta-cell"><span class="meta-label">Patient ID</span><span class="meta-value">${esc(bill.patientId || '')}</span></div>
        <div class="meta-cell"><span class="meta-label">Date</span><span class="meta-value">${formatDate(bill.date)}</span></div>
        <div class="meta-cell"><span class="meta-label">Status</span><span class="meta-value">${esc(capitalize(bill.status))}</span></div>
      </div>
      ${rows}
      <div class="bill-row"><span>Subtotal</span><span>${formatCurrency(bill.subtotal)}</span></div>
      ${Number(bill.discount) ? `<div class="bill-row"><span>Discount</span><span>-${formatCurrency(bill.discount)}</span></div>` : ''}
      ${Number(bill.tax) ? `<div class="bill-row"><span>Tax</span><span>${formatCurrency(bill.tax)}</span></div>` : ''}
      <div class="bill-total"><span>Total Amount</span><strong>${formatCurrency(bill.total)}</strong></div>
      <div class="bill-row"><span>Paid</span><span>${formatCurrency(bill.paid)}</span></div>
      <div class="bill-row"><span>Balance Due</span><span>${formatCurrency(bill.balance)}</span></div>
      ${(bill.payments && bill.payments.length) ? `
        <div style="margin-top:12px">
          <div class="meta-label" style="margin-bottom:6px">Payment History</div>
          ${bill.payments.map((pm) => `
            <div class="bill-row"><span>${esc(pm.method)} &middot; ${formatDate(pm.date)}</span><span>${formatCurrency(pm.amount)}</span></div>`).join('')}
        </div>` : ''}
    </div>`;
}

function viewBill(bill) {
  openModal(`
    <div class="modal-head"><div><h2>Invoice ${esc(bill.number)}</h2><p>Bill details and payment history</p></div></div>
    ${billSheetHtml(bill)}
    <div class="form-actions" style="margin-top:16px">
      <button class="btn btn-secondary" data-action="print" data-id="${esc(bill.id)}" data-module="billing">Print</button>
      <button class="btn btn-secondary" data-close>Close</button>
    </div>
  `);
}

function printBill(bill) {
  // Print the active modal (per the print media rules in style.css).
  if (!$('#modalOverlay') || !$('#modalOverlay').classList.contains('show')) {
    openModal(`<div class="modal-head"><div><h2>Invoice ${esc(bill.number)}</h2></div></div>` + billSheetHtml(bill));
  }
  // Hide the print control itself from the printed page.
  const printControl = $('.modal [data-action="print"]');
  if (printControl) printControl.hidden = true;
  setTimeout(() => {
    window.print();
    setTimeout(() => { if (printControl) printControl.hidden = false; }, 500);
  }, 40);
}

function recordPayment(bill) {
  openModal(`
    <div class="modal-head"><div><h2>Record Payment</h2><p>${esc(bill.number)} for ${esc(bill.patientName || patientName(bill.patientId))}</p></div></div>
    <form id="payForm" class="form-grid" novalidate>
      <div class="form-group full"><label>Balance Due</label><div class="meta-value">${formatCurrency(bill.balance)}</div></div>
      <div class="form-group full"><label>Amount</label><input type="number" min="0.01" max="${Number(bill.balance)}" step="0.01" class="input" id="pay-amount"></div>
      <div class="form-group full"><label>Method</label><select class="input" id="pay-method"><option>Cash</option><option>Card</option><option>Insurance</option><option>Bank Transfer</option></select></div>
      <div class="form-actions full">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Apply Payment</button>
      </div>
    </form>
  `);
  $('#payForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = round2(Number($('#pay-amount').value) || 0);
    const ok = validateForm([
      { id: 'pay-amount', value: amount, test: () => amount > 0 && amount <= Number(bill.balance), msg: 'Enter a valid amount within the balance' }
    ]);
    if (!ok) return;
    const method = $('#pay-method').value;
    const newPaid = round2(Number(bill.paid) + amount);
    const newBalance = round2(Number(bill.total) - newPaid);
    const payments = bill.payments || [];
    payments.push({ date: todayISO(), amount, method });
    Store.update('bills', bill.id, {
      paid: newPaid, balance: newBalance, method,
      payments,
      status: newBalance <= 0 ? 'paid' : 'partial'
    });
    closeModal();
    toast('Payment recorded.', 'success');
    refreshAll();
  });
}

function deleteBill(bill) {
  confirmDialog({
    title: 'Delete Bill',
    message: 'Delete ' + bill.number + ' for ' + (bill.patientName || patientName(bill.patientId)) + '? This cannot be undone.',
    confirmText: 'Delete',
    onConfirm: () => {
      Store.remove('bills', bill.id);
      toast('Bill deleted.', 'success');
      refreshAll();
    }
  });
}

})();