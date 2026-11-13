/* =========================================================
   staff.js - Staff Management
   Add, view, edit, delete and search staff records.
   ========================================================= */

(function () {
'use strict';

registerPage('staff', { render, open, onAction });

let staffStatus = '';

/* One delegated search listener for this module, registered once. */
document.addEventListener('input', (e) => {
  if (e.target.dataset && e.target.dataset.search === 'staff') {
    Pages['staff'] && Pages['staff'].render();
  }
});

function searchQuery() {
  const el = $('[data-search="staff"]');
  return (el && (el.value || '').toLowerCase().trim()) || '';
}

function departmentName(id) {
  const d = Store.getById('departments', id);
  return d ? d.name : '';
}

function statusClass(s) {
  const v = (s || '').toLowerCase();
  if (v === 'active') return 'active';
  if (v === 'on-leave') return 'on-leave';
  if (v === 'inactive') return 'unavailable';
  return 'pending';
}

function initials(name) {
  return (name || '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function avatarColor(name) {
  const colors = ['teal', 'purple', 'orange', 'green'];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

function staffRows(list) {
  return list.map((s) => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="avatar ${avatarColor(s.name)}">${esc(initials(s.name))}</span>
          <div>
            <span class="primary-text">${esc(s.name)}</span>
            <div class="muted-text">${esc(s.id)}</div>
          </div>
        </div>
      </td>
      <td>${esc(s.designation || '-')}</td>
      <td>${esc(s.department || departmentName(s.departmentId) || '-')}</td>
      <td>${esc(s.phone || '-')}<div class="muted-text">${esc(s.email || '')}</div></td>
      <td>${formatCurrency(s.salary)}</td>
      <td>${formatDate(s.joining)}</td>
      <td><span class="badge ${statusClass(s.status)}">${esc(capitalize(s.status))}</span></td>
      <td class="actions-col">
        <div class="actions">
          <button class="btn btn-ghost btn-sm" data-action="view" data-id="${esc(s.id)}" data-module="staff">View</button>
          <button class="btn btn-sm" data-action="edit" data-id="${esc(s.id)}" data-module="staff">Edit</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${esc(s.id)}" data-module="staff">Delete</button>
        </div>
      </td>
    </tr>`).join('');
}

function render() {
  const mount = $('#mount-staff');
  if (!mount) return;
  const all = Store.getAll('staff');
  const q = searchQuery();

  let list = all;
  if (staffStatus) list = list.filter((s) => (s.status || '').toLowerCase() === staffStatus.toLowerCase());
  if (q) list = list.filter((s) =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.id || '').toLowerCase().includes(q) ||
    (s.designation || '').toLowerCase().includes(q) ||
    (s.department || '').toLowerCase().includes(q) ||
    (s.phone || '').toLowerCase().includes(q)
  );

  const active = all.filter((s) => (s.status || '').toLowerCase() === 'active').length;
  const onLeave = all.filter((s) => (s.status || '').toLowerCase() === 'on-leave').length;
  const depts = new Set(all.map((s) => s.department || '').filter(Boolean)).size;

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Staff</h1>
        <p class="subtitle">Manage hospital staff and their information</p>
      </div>
      <button class="btn btn-primary" data-open-btn="staff">Add Staff</button>
    </div>

    <div class="cards-grid">
      <div class="stat-card"><div class="stat-icon teal"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M17 10v4M19 12h-4"/></svg></div><div><span class="stat-label">Total Staff</span><span class="stat-value">${all.length}</span></div></div>
      <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg></div><div><span class="stat-label">Active</span><span class="stat-value">${active}</span></div></div>
      <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M12 8v4l2 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/></svg></div><div><span class="stat-label">On Leave</span><span class="stat-value">${onLeave}</span></div></div>
      <div class="stat-card"><div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="22" height="22"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 12h.01M9 15h.01M15 9h.01M15 12h.01M15 15h.01"/></svg></div><div><span class="stat-label">Departments</span><span class="stat-value">${depts}</span></div></div>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <div class="search-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input class="input" data-search="staff" aria-label="Search staff" placeholder="Search name, ID, role, department..."
            value="${esc($('[data-search="staff"]') ? ($('[data-search="staff"]').value || '') : '')}">
        </div>
        <select class="input filter-select" data-filter-staff aria-label="Filter staff by status">
          <option value="">All statuses</option>
          <option value="active" ${staffStatus === 'active' ? 'selected' : ''}>Active</option>
          <option value="on-leave" ${staffStatus === 'on-leave' ? 'selected' : ''}>On Leave</option>
          <option value="inactive" ${staffStatus === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
        <span class="spacer"></span>
        <button class="btn btn-secondary btn-sm" data-export-staff>Export CSV</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Staff</th><th>Designation</th><th>Department</th><th>Contact</th><th>Salary</th><th>Joined</th><th>Status</th><th class="actions-col">Actions</th></tr></thead>
          <tbody>${list.length ? staffRows(list) : '<tr><td colspan="8" class="empty-block">No staff records found.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  const fs = $('[data-filter-staff]');
  if (fs) fs.addEventListener('change', () => { staffStatus = fs.value; render(); });
  const ex = $('[data-export-staff]');
  if (ex) ex.addEventListener('click', () => {
    exportCSV('staff.csv', ['ID', 'Name', 'Designation', 'Department', 'Phone', 'Email', 'Salary', 'Joined', 'Status'],
      all.map((s) => [s.id, s.name, s.designation, s.department, s.phone, s.email, s.salary, s.joining, s.status]));
  });
}

/* ---- open(): Add Staff form ---- */
function open() {
  const departments = Store.getAll('departments');
  const deptOpts = departments.length
    ? departments.map((d) => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('')
    : '<option value="Nursing">Nursing</option><option value="Laboratory">Laboratory</option><option value="Pharmacy">Pharmacy</option><option value="Front Desk">Front Desk</option><option value="Administration">Administration</option>';

  openModal(`
    <div class="modal-head"><div><h2>Add Staff Member</h2><p>New staff ID ${esc(genStaffId())} will be assigned</p></div></div>
    <form id="staffForm" class="form-grid" novalidate>
      <div class="form-group"><label>Full Name</label><input class="input" id="st-name" placeholder="e.g. Grace Wanjiru"></div>
      <div class="form-group"><label>Designation</label><input class="input" id="st-designation" placeholder="e.g. Head Nurse"></div>
      <div class="form-group"><label>Department</label><select class="input" id="st-department">${deptOpts}</select></div>
      <div class="form-group"><label>Status</label>
        <select class="input" id="st-status"><option value="active">Active</option><option value="on-leave">On Leave</option><option value="inactive">Inactive</option></select>
      </div>
      <div class="form-group"><label>Phone</label><input class="input" id="st-phone" placeholder="e.g. 555-4001"></div>
      <div class="form-group"><label>Email</label><input class="input" id="st-email" type="email" placeholder="name@citycare.example"></div>
      <div class="form-group"><label>Monthly Salary ($)</label><input class="input" id="st-salary" type="number" min="0" step="0.01" placeholder="0.00"></div>
      <div class="form-group"><label>Joining Date</label><input class="input" id="st-joining" type="date" value="${todayISO()}"></div>
      <div class="form-actions full">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Add Staff</button>
      </div>
    </form>
  `);

  $('#staffForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      name: $('#st-name').value.trim(),
      designation: $('#st-designation').value.trim(),
      phone: $('#st-phone').value.trim(),
      email: $('#st-email').value.trim(),
      salary: Number($('#st-salary').value),
      joining: $('#st-joining').value
    };
    const ok = validateForm([
      { id: 'st-name', value: data.name, test: () => Boolean(data.name), msg: 'Name is required' },
      { id: 'st-designation', value: data.designation, test: () => Boolean(data.designation), msg: 'Designation is required' },
      { id: 'st-phone', value: data.phone, test: () => Boolean(data.phone), msg: 'Phone is required' },
      { id: 'st-email', value: data.email, test: (v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), msg: 'Enter a valid email' },
      { id: 'st-salary', value: data.salary, test: () => Number(data.salary) >= 0, msg: 'Enter a valid salary' },
      { id: 'st-joining', value: data.joining, test: () => Boolean(data.joining), msg: 'Select a joining date' }
    ]);
    if (!ok) return;

    Store.add('staff', {
      id: genStaffId(),
      name: data.name,
      designation: data.designation,
      department: $('#st-department').value,
      phone: data.phone,
      email: data.email,
      salary: data.salary,
      joining: data.joining,
      status: $('#st-status').value
    });
    closeModal();
    toast('Staff member added.', 'success');
    refreshAll();
  });
}

/* ---- onAction: view / edit / delete ---- */
function onAction(e, btn) {
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const staff = Store.getById('staff', id);
  if (!staff) return;
  if (action === 'view') return viewStaff(staff);
  if (action === 'edit') return editStaff(staff);
  if (action === 'delete') return deleteStaff(staff);
}

function viewStaff(s) {
  openModal(`
    <div class="modal-head">
      <div><h2>Staff Member</h2><p><span class="badge ${statusClass(s.status)}">${esc(capitalize(s.status))}</span></p></div>
      <span class="avatar ${avatarColor(s.name)}">${esc(initials(s.name))}</span>
    </div>
    <div class="meta-grid">
      <div class="meta-cell"><span class="meta-label">Full Name</span><span class="meta-value">${esc(s.name)}</span></div>
      <div class="meta-cell"><span class="meta-label">Staff ID</span><span class="meta-value">${esc(s.id)}</span></div>
      <div class="meta-cell"><span class="meta-label">Designation</span><span class="meta-value">${esc(s.designation || '-')}</span></div>
      <div class="meta-cell"><span class="meta-label">Department</span><span class="meta-value">${esc(s.department || '-')}</span></div>
      <div class="meta-cell"><span class="meta-label">Phone</span><span class="meta-value">${esc(s.phone || '-')}</span></div>
      <div class="meta-cell"><span class="meta-label">Email</span><span class="meta-value">${esc(s.email || '-')}</span></div>
      <div class="meta-cell"><span class="meta-label">Monthly Salary</span><span class="meta-value">${formatCurrency(s.salary)}</span></div>
      <div class="meta-cell"><span class="meta-label">Joining Date</span><span class="meta-value">${formatDate(s.joining)}</span></div>
    </div>
    <div class="form-actions"><button class="btn btn-secondary" data-close>Close</button></div>
  `);
}

function editStaff(s) {
  const departments = Store.getAll('departments');
  const deptOpts = departments.length
    ? departments.map((d) => `<option value="${esc(d.name)}" ${s.department === d.name ? 'selected' : ''}>${esc(d.name)}</option>`).join('')
    : `<option value="${esc(s.department || 'Nursing')}">${esc(s.department || 'Nursing')}</option>`;

  openModal(`
    <div class="modal-head"><div><h2>Edit Staff</h2><p>${esc(s.id)} &middot; ${esc(s.name)}</p></div></div>
    <form id="staffEditForm" class="form-grid" novalidate>
      <div class="form-group"><label>Full Name</label><input class="input" id="se-name" value="${esc(s.name)}"></div>
      <div class="form-group"><label>Designation</label><input class="input" id="se-designation" value="${esc(s.designation || '')}"></div>
      <div class="form-group"><label>Department</label><select class="input" id="se-department">${deptOpts}</select></div>
      <div class="form-group"><label>Status</label>
        <select class="input" id="se-status">
          <option value="active" ${s.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="on-leave" ${s.status === 'on-leave' ? 'selected' : ''}>On Leave</option>
          <option value="inactive" ${s.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
      <div class="form-group"><label>Phone</label><input class="input" id="se-phone" value="${esc(s.phone || '')}"></div>
      <div class="form-group"><label>Email</label><input class="input" id="se-email" type="email" value="${esc(s.email || '')}"></div>
      <div class="form-group"><label>Monthly Salary ($)</label><input class="input" id="se-salary" type="number" min="0" step="0.01" value="${Number(s.salary) || 0}"></div>
      <div class="form-group"><label>Joining Date</label><input class="input" id="se-joining" type="date" value="${esc(s.joining || '')}"></div>
      <div class="form-actions full">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Changes</button>
      </div>
    </form>
  `);

  $('#staffEditForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#se-name').value.trim();
    const designation = $('#se-designation').value.trim();
    const phone = $('#se-phone').value.trim();
    const email = $('#se-email').value.trim();
    const salary = Number($('#se-salary').value);
    const joining = $('#se-joining').value;
    const ok = validateForm([
      { id: 'se-name', value: name, test: () => Boolean(name), msg: 'Name is required' },
      { id: 'se-designation', value: designation, test: () => Boolean(designation), msg: 'Designation is required' },
      { id: 'se-phone', value: phone, test: () => Boolean(phone), msg: 'Phone is required' },
      { id: 'se-email', value: email, test: (v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), msg: 'Enter a valid email' }
    ]);
    if (!ok) return;
    Store.update('staff', s.id, {
      name, designation, department: $('#se-department').value,
      phone, email, salary, joining, status: $('#se-status').value
    });
    closeModal();
    toast('Staff record updated.', 'success');
    refreshAll();
  });
}

function deleteStaff(s) {
  confirmDialog({
    title: 'Delete Staff',
    message: 'Delete ' + s.name + ' (' + s.id + ')? This cannot be undone.',
    confirmText: 'Delete',
    onConfirm: () => {
      Store.remove('staff', s.id);
      toast('Staff deleted.', 'success');
      refreshAll();
    }
  });
}

})();