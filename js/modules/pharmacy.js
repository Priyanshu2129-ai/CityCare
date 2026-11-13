/* =========================================================
   pharmacy.js - Pharmacy & Medicine Management
   Registered page: 'pharmacy'  ->  mount container '#mount-pharmacy'
   Runtime globals (provided by data.js / common.js): $, $$, esc, toast,
   openModal, closeModal, confirmDialog, setFieldError, validateForm,
   formatCurrency, todayISO, formatDate, refreshAll, Store, genMedicineId,
   registerPage.
   ========================================================= */

/* ---- delegated search: single listener, fires only for this module ---- */
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'pharmacySearch' || t.id === 'pharmacyFilter') renderPharmacy();
});

function pharmacyList() {
  const q = (($('#pharmacySearch') || {}).value || '').toLowerCase().trim();
  const cat = (($('#pharmacyFilter') || {}).value || '').trim();
  return Store.getAll('pharmacy')
    .filter((m) => (!q || m.name.toLowerCase().includes(q)
      || (m.manufacturer || '').toLowerCase().includes(q)
      || m.id.toLowerCase().includes(q)))
    .filter((m) => !cat || (m.category || '') === cat)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function medicineStockBadge(m) {
  const stock = Number(m.stock) || 0;
  const low = Number(m.lowStock) || 0;
  if (stock <= 0) return '<span class="badge unavailable">Out of stock</span>';
  if (low && stock <= low) return '<span class="badge pending">Low stock</span>';
  return '<span class="badge available">In stock</span>';
}

function renderPharmacy() {
  const mount = document.getElementById('mount-pharmacy');
  if (!mount) return;
  const list = pharmacyList();
  const medicines = Store.getAll('pharmacy');
  const categories = [...new Set(medicines.map((m) => m.category).filter(Boolean))].sort();
  const totalValue = medicines.reduce((s, m) => s + (Number(m.price) || 0) * (Number(m.stock) || 0), 0);
  const lowStockCount = medicines.filter((m) => {
    const stock = Number(m.stock) || 0;
    const low = Number(m.lowStock) || 0;
    return low && stock <= low;
  }).length;

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Pharmacy</h1>
        <p class="subtitle">Manage medicines, stock and inventory</p>
      </div>
      <button class="btn btn-primary" data-open-btn="pharmacy">Add Medicine</button>
    </div>

    <div class="cards-grid">
      <div class="card stat-card"><div class="stat-icon" style="background:linear-gradient(135deg,#0d9488,#14b8a6)"><span class="stat-icon-label">M</span></div><div><div class="stat-value">${medicines.length}</div><div class="stat-label">Medicines</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:linear-gradient(135deg,#f59e0b,#fbbf24)"><span class="stat-icon-label">$</span></div><div><div class="stat-value">${formatCurrency(medicines.reduce((s, m) => s + (Number(m.price) || 0), 0))}</div><div class="stat-label">Medicine Price Range</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:linear-gradient(135deg,#f97316,#fb923c)"><span class="stat-icon-label">!</span></div><div><div class="stat-value">${lowStockCount}</div><div class="stat-label">Low Stock Alerts</div></div></div>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <div class="search-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input class="input" id="pharmacySearch" placeholder="Search by name, ID or manufacturer">
        </div>
        <select class="input filter-select" id="pharmacyFilter">
          <option value="">All categories</option>
          ${categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <span class="muted-text">${list.length} of ${medicines.length} medicines</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Medicine ID</th><th>Name</th><th>Category</th><th>Manufacturer</th><th>Price</th><th>Stock</th><th>Expiry</th><th>Status</th><th class="actions-col">Actions</th></tr>
          </thead>
          <tbody id="pharmacyTableBody">
            ${list.map((m) => `
              <tr>
                <td><span class="muted-text">${esc(m.id)}</span></td>
                <td class="primary-text">${esc(m.name)}</td>
                <td>${m.category ? `<span class="chip chip-teal">${esc(m.category)}</span>` : '<span class="muted-text">-</span>'}</td>
                <td>${esc(m.manufacturer || '-')}</td>
                <td>${formatCurrency(m.price)}</td>
                <td>${esc(m.stock)}</td>
                <td>${m.expiry ? esc(formatDate(m.expiry)) : '<span class="muted-text">-</span>'}</td>
                <td>${medicineStockBadge(m)}</td>
                <td class="actions-col">
                  <div class="actions">
                    <button class="btn btn-secondary btn-sm" data-action="view" data-id="${esc(m.id)}" data-module="pharmacy">View</button>
                    <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${esc(m.id)}" data-module="pharmacy">Edit</button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${esc(m.id)}" data-module="pharmacy">Delete</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${list.length === 0 ? '<div class="empty-block">No medicines found.</div>' : ''}
    </div>
  `;
}

/* ---- data helpers for the form ---- */
function pharmacyCategoryOptions(selected) {
  const cats = [...new Set(Store.getAll('pharmacy').map((m) => m.category).filter(Boolean))];
  const known = ['Analgesic', 'Antibiotic', 'Antihistamine', 'Supplement', 'Endocrine', 'Cardiovascular', 'Other'];
  const all = [...new Set([...known, ...cats])];
  return all.map((c) => `<option value="${esc(c)}" ${selected === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
}

function pharmacyForm(id) {
  const m = id ? Store.getById('pharmacy', id) : null;
  return `
    <div class="modal-head">
      <div>
        <h2>${id ? 'Edit Medicine' : 'Add Medicine'}</h2>
        <p>${id ? 'Update the medicine stock information.' : 'Register a new medicine in the pharmacy.'}</p>
      </div>
      <button class="icon-button" data-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <form id="medicineForm" novalidate>
      <div class="form-grid">
        <div class="form-group">
          <label for="mf-name">Medicine Name *</label>
          <input class="input" id="mf-name" value="${esc(m ? m.name : '')}" placeholder="e.g. Paracetamol 500mg">
        </div>
        <div class="form-group">
          <label for="mf-category">Category *</label>
          <select class="input" id="mf-category">${pharmacyCategoryOptions(m ? m.category : '')}</select>
        </div>
        <div class="form-group">
          <label for="mf-manufacturer">Manufacturer</label>
          <input class="input" id="mf-manufacturer" value="${esc(m ? (m.manufacturer || '') : '')}" placeholder="e.g. CignaMed">
        </div>
        <div class="form-group">
          <label for="mf-price">Unit Price ($) *</label>
          <input class="input" id="mf-price" type="number" min="0" step="0.01" value="${m ? m.price : ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label for="mf-stock">Stock Quantity *</label>
          <input class="input" id="mf-stock" type="number" min="0" step="1" value="${m ? m.stock : ''}" placeholder="0">
        </div>
        <div class="form-group">
          <label for="mf-low">Low Stock Alert At</label>
          <input class="input" id="mf-low" type="number" min="0" step="1" value="${m ? m.lowStock : ''}" placeholder="0">
        </div>
        <div class="form-group full">
          <label for="mf-expiry">Expiry Date</label>
          <input class="input" id="mf-expiry" type="date" min="${todayISO()}" value="${m ? (m.expiry || '') : ''}">
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? 'Save Changes' : 'Add Medicine'}</button>
      </div>
    </form>
  `;
}

function handlePharmacyForm(e) {
  e.preventDefault();
  const name = $('#mf-name').value.trim();
  const category = $('#mf-category').value;
  const manufacturer = $('#mf-manufacturer').value.trim();
  const price = parseFloat($('#mf-price').value);
  const stock = parseInt($('#mf-stock').value, 10);
  const low = parseInt($('#mf-low').value, 10) || 0;
  const expiry = $('#mf-expiry').value;
  const editingId = window.__medicineEditingId;

  const rules = [
    { id: 'mf-name', value: name, msg: 'Medicine name is required' },
    { id: 'mf-category', value: category, msg: 'Select a category' },
    { id: 'mf-price', value: price, test: () => Number.isFinite(price) && price >= 0, msg: 'Enter a valid price' },
    { id: 'mf-stock', value: stock, test: () => Number.isFinite(stock) && stock >= 0, msg: 'Enter a valid stock quantity' }
  ];
  if (!validateForm(rules)) return;

  const data = { id: editingId, name, category, manufacturer, price, stock, lowStock: low, expiry };
  if (editingId) Store.update('pharmacy', editingId, data);
  else Store.add('pharmacy', { ...data, id: genMedicineId() });

  closeModal();
  toast(editingId ? 'Medicine updated.' : 'Medicine added.', 'success');
  refreshAll();
}

function viewPharmacy(id) {
  const m = Store.getById('pharmacy', id);
  if (!m) return;
  const stock = Number(m.stock) || 0;
  const low = Number(m.lowStock) || 0;
  const status = stock <= 0 ? '<span class="badge unavailable">Out of stock</span>'
    : (low && stock <= low) ? '<span class="badge pending">Low stock</span>'
    : '<span class="badge available">In stock</span>';
  openModal(`
    <div class="modal-head">
      <div>
        <h2>Medicine Details</h2>
        <p>${esc(m.id)}</p>
      </div>
      <button class="icon-button" data-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="meta-grid">
      <div class="meta-cell"><span class="meta-label">Name</span><span class="meta-value">${esc(m.name)}</span></div>
      <div class="meta-cell"><span class="meta-label">Category</span><span class="meta-value">${esc(m.category || '-')}</span></div>
      <div class="meta-cell"><span class="meta-label">Manufacturer</span><span class="meta-value">${esc(m.manufacturer || '-')}</span></div>
      <div class="meta-cell"><span class="meta-label">Unit Price</span><span class="meta-value">${formatCurrency(m.price)}</span></div>
      <div class="meta-cell"><span class="meta-label">Stock</span><span class="meta-value">${esc(m.stock)} units</span></div>
      <div class="meta-cell"><span class="meta-label">Low Stock At</span><span class="meta-value">${esc(m.lowStock || 0)}</span></div>
      <div class="meta-cell"><span class="meta-label">Expiry Date</span><span class="meta-value">${m.expiry ? esc(formatDate(m.expiry)) : '-'}</span></div>
      <div class="meta-cell"><span class="meta-label">Status</span><span class="meta-value">${status}</span></div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-primary" data-action="edit" data-id="${esc(m.id)}" data-module="pharmacy">Edit</button>
    </div>
  `);
}

function deletePharmacy(id) {
  const m = Store.getById('pharmacy', id);
  if (!m) return;
  confirmDialog({
    title: 'Delete Medicine?',
    message: 'Delete ' + m.name + ' (' + m.id + ') from the pharmacy? This cannot be undone.',
    confirmText: 'Delete Medicine',
    onConfirm: () => {
      Store.remove('pharmacy', id);
      closeModal();
      toast('Medicine deleted.', '');
      refreshAll();
    }
  });
}

function onPharmacyAction(e, btn) {
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === 'view') viewPharmacy(id);
  else if (action === 'edit') {
    window.__medicineEditingId = id;
    openModal(pharmacyForm(id));
    bindPharmacyForm();
  } else if (action === 'delete') deletePharmacy(id);
}

function bindPharmacyForm() {
  const f = $('#medicineForm');
  if (!f) return;
  f.addEventListener('submit', handlePharmacyForm);
  f.addEventListener('input', (ev) => { if (ev.target && ev.target.id) setFieldError(ev.target.id, ''); });
}

function openPharmacy() {
  window.__medicineEditingId = null;
  openModal(pharmacyForm(null));
  bindPharmacyForm();
}

registerPage('pharmacy', {
  render: renderPharmacy,
  open: openPharmacy,
  onAction: onPharmacyAction
});