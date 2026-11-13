/* =========================================================
   common.js - shared helpers: DOM, toast, modal, dialog,
   router, module registry, quick stats, chart helpers.
   ========================================================= */

/* ---------- DOM helpers ---------- */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(s) {
  const v = (s || '').trim();
  return v ? v[0].toUpperCase() + v.slice(1) : v;
}

/* =========================================================
   API helper - talks to the CityCare backend (patients module
   currently uses MongoDB). Auth is cookie-based: the backend sets
   an httpOnly session cookie at login. NO secret/token ever lives
   in browser JavaScript. 'credentials: include' sends that cookie
   with each request; 'X-Requested-With' marks these as XHR so the
   backend can reject cross-site CSRF-style submissions.
   ========================================================= */
const CITYCARE_API = (window.CITYCARE_API_BASE || '').replace(/\/$/, '');

async function apiRequest(path, { method = 'GET', body } = {}) {
  const opts = { method, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(CITYCARE_API + path, opts);
  let data = {};
  try { data = await resp.json(); } catch (e) { /* empty body */ }
  return { ok: resp.ok, status: resp.status, data };
}

// Session lifecycle helpers (cookie-based). These only call the backend; they
// never read or print any token or password.
async function apiLogin(username, password) {
  return apiRequest('/api/auth/login', { method: 'POST', body: { username, password } });
}
async function apiLogout() {
  return apiRequest('/api/auth/logout', { method: 'POST' });
}

// Re-fetch patients from MongoDB/API after establishing the session (login).
// Lets the Patients page pull data once a httpOnly session cookie exists.
async function refreshPatientsFromServer() {
  const mod = Pages['patients'];
  if (mod && typeof mod.reload === 'function') return mod.reload();
  return null;
}

// After patients are fetched/upserted from MongoDB, mirror them into the
// LocalStorage `patients` store so other modules (dashboard, departments,
// reports, appointments) that still read Store.getAll('patients') stay correct.
function syncPatientsToLocal(patients) {
  if (!Array.isArray(patients)) return;
  Store.write('patients', patients.map((p) => ({ ...p })));
}

/* ---------- Toast ---------- */

let toastTimer;
function toast(message, type) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'toast show ' + (type || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
}

/* ---------- Modal helpers ---------- */

function openModal(html, { onOpen } = {}) {
  const overlay = $('#modalOverlay');
  if (!overlay) return;
  $('#modal').innerHTML = html;
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.inert = false;     // re-enable focus inside the open modal
  document.body.style.overflow = 'hidden';
  if (onOpen) onOpen();
  const firstFocus = $('input, select, textarea, button', $('#modal'));
  if (firstFocus) setTimeout(() => firstFocus.focus(), 30);
}

function closeModal() {
  const overlay = $('#modalOverlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.inert = true;      // prevent focus entering hidden modal
  document.body.style.overflow = '';
}

function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = true, onConfirm }) {
  openModal(`
    <div class="confirm-box">
      <div class="confirm-icon ${danger ? 'danger' : 'warn'}">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
      </div>
      <h3>${esc(title)}</h3>
      <p>${esc(message)}</p>
      <div class="confirm-actions">
        <button class="btn btn-secondary" data-close>${esc(cancelText)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmYes">${esc(confirmText)}</button>
      </div>
    </div>
  `);
  $('#confirmYes').addEventListener('click', () => { closeModal(); if (onConfirm) onConfirm(); });
}

/* --- modal global behavior (backdrop, escape, [data-close]) --- */
setTimeout(() => {
  const overlay = $('#modalOverlay');
  if (!overlay) return;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('show')) closeModal();
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
}, 0);

/* ---------- Form field validation helper ---------- */

// Attach an inline error to the named field inside #modal.
function setFieldError(fieldId, message) {
  const input = $('#' + fieldId);
  if (!input) return false;
  const wrap = input.closest('.form-group');
  if (message) {
    input.classList.add('invalid');
    let msgEl = $('.field-error', wrap);
    if (!msgEl) { msgEl = document.createElement('span'); msgEl.className = 'field-error'; wrap.appendChild(msgEl); }
    msgEl.textContent = message;
    return false;
  }
  input.classList.remove('invalid');
  const msgEl = $('.field-error', wrap);
  if (msgEl) msgEl.remove();
  return true;
}

function clearFieldError(fieldId) { setFieldError(fieldId, ''); }

// curry for compact validation loops
function validateForm(rules) {
  // rules: [{id, value, test, msg}]
  let ok = true;
  rules.forEach((r) => {
    const valid = r.test ? r.test(r.value) : Boolean(r.value);
    if (!valid) { setFieldError(r.id, r.msg); ok = false; }
    else setFieldError(r.id, '');
  });
  return ok;
}

/* ---------- Router / module registry ---------- */

const Pages = {}; // pageId -> { render() } ; define w/ registerPage

function registerPage(id, fn) {
  Pages[id] = typeof fn === 'function' ? { render: fn } : fn;
}

// Re-render the active page and the dashboard meta. Called on every navigation
// and after CRUD changes so data is always live.
function refreshAll() {
  const keys = Object.keys(Pages);
  keys.forEach((k) => { try { Pages[k].render && Pages[k].render(); } catch (e) { /* keep app alive */ } });
  renderDashboardMeta();
  renderSiteFooter();
}

/* ---------- Global footer ---------- */
function renderSiteFooter() {
  const host = $('#siteFooter');
  if (!host) return;
  const s = (typeof getSettings === 'function' ? getSettings() : {});
  const name = s.hospitalName || 'CityCare Hospital';
  const depts = (typeof Store !== 'undefined') ? Store.getAll('departments').slice(0, 6) : [];
  const deptNames = depts.map((d) => d.name).filter(Boolean);
  host.innerHTML = `
    <div class="footer-grid">
      <div class="footer-col">
        <div class="footer-brand">
          <span class="logo-sm" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l2 6 3-14 3 10 2-2h4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="footer-brand-name">${esc(name)}</span>
        </div>
        <p class="footer-about">Providing compassionate, quality healthcare for every member of our community.${s.tagline ? ' ' + esc(s.tagline) + '.' : ''}</p>
      </div>
      <div class="footer-col">
        <h3>Quick Links</h3>
        <ul>
          <li><a href="#dashboard" data-page="dashboard">Dashboard</a></li>
          <li><a href="#patients" data-page="patients">Patients</a></li>
          <li><a href="#doctors" data-page="doctors">Doctors</a></li>
          <li><a href="#appointments" data-page="appointments">Appointments</a></li>
          <li><a href="#billing" data-page="billing">Billing</a></li>
          <li><a href="#contact" data-page="contact">Contact Us</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h3>Our Departments</h3>
        <ul>${deptNames.length ? deptNames.map((d) => `<li><a href="#departments" data-page="departments">${esc(d)}</a></li>`).join('') : '<li>General Medicine</li>'}</ul>
      </div>
      <div class="footer-col">
        <h3>Contact</h3>
        <ul class="footer-contact">
          <li>${esc(s.address || '')}, ${esc(s.city || '')}</li>
          <li>Phone: ${esc(s.phone || '')}</li>
          <li>Email: ${esc(s.email || '')}</li>
          <li>${esc(s.hoursWeek || '')}</li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&copy; ${new Date().getFullYear()} ${esc(name)}. All rights reserved.</span>
      <span>Demo application - fictional data only.</span>
    </div>
  `;
}

function navigateTo(page) {
  closeMobileNav();
  $$('.page').forEach((p) => p.classList.remove('active'));
  const target = $('#page-' + page);
  if (target) target.classList.add('active');
  $$('.nav-link').forEach((l) => l.classList.toggle('active', l.dataset.page === page));
  window.scrollTo(0, 0);
  if (window.location.hash !== '#' + page) {
    history.replaceState(null, '', '#' + page);
  }
  if (Pages[page] && Pages[page].render) Pages[page].render();
  renderDashboardMeta();
  renderSiteFooter();
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('.nav-link');
  if (link) {
    e.preventDefault();
    navigateTo(link.dataset.page);
  }
});

window.addEventListener('hashchange', () => {
  const page = (window.location.hash || '#dashboard').replace('#', '');
  if (Pages[page]) navigateTo(page);
});

// Global open-form buttons: data-open-btn="moduleName"
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-open-btn]');
  if (!btn) return;
  const kind = btn.dataset.openBtn;
  if (Pages[kind] && Pages[kind].open && typeof Pages[kind].open === 'function') {
    Pages[kind].open();
  } else if (Pages[kind] && typeof Pages[kind].open === 'function') {
    Pages[kind].open();
  }
});

// Delegate per-page row actions: data-action attributes are handled by each module.
// Modules register a single delegated listener keyed by data-module.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action],[data-view],[data-edit],[data-del],[data-print],[data-status],[data-resched]');
  if (!btn) return;
  const module = btn.dataset.module;
  if (module && Pages[module] && Pages[module].onAction) {
    Pages[module].onAction(e, btn);
  }
});

/* ---------- Sidebar / mobile ---------- */

function initShell() {
  const menuToggle = $('#menuToggle');
  const sidebar = $('#sidebar');
  const backdrop = $('#sidebarBackdrop');
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      const open = sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('show', open);
      menuToggle.setAttribute('aria-expanded', String(open));
    });
  }
  if (backdrop) backdrop.addEventListener('click', closeMobileNav);
}
function closeMobileNav() {
  const sidebar = $('#sidebar'); const backdrop = $('#sidebarBackdrop'); const menuToggle = $('#menuToggle');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');
  if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
}

/* ---------- Small helper: month name / revenue buckets ---------- */

function monthBuckets(records, dateField) {
  const out = {};
  records.forEach((r) => {
    const d = r[dateField] || '';
    if (!d) return;
    const key = d.slice(0, 7); // YYYY-MM
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

/* ---------- Lightweight canvas charts (no external libs) ---------- */

const CHART_COLORS = { teal: '#0d9488', emerald: '#059669', purple: '#8b5cf6', orange: '#f97316', blue: '#3b82f6', rose: '#f43f5e' };

// Bar chart (vertical). canvasId, labels[], series: [[value, color]] or [{label,value,color}]
function drawBarChart(canvasId, labels, values, colors, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width || 300, h = opts.height || 220;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const padL = 34, padB = 26, padT = 12, padR = 8;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const max = Math.max(1, ...values.map(Number));
  ctx.strokeStyle = '#eef2f7'; ctx.fillStyle = '#9aa8b8'; ctx.font = '11px Inter, sans-serif';
  for (let g = 0; g <= 3; g++) {
    const y = padT + (plotH / 3) * g;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(Math.round(max * (1 - g / 3)), 4, y + 4);
  }
  const n = labels.length, slot = plotW / n, barW = Math.min(34, slot * 0.5);
  values.forEach((v, i) => {
    const x = padL + slot * i + (slot - barW) / 2;
    const bh = (Number(v) / max) * plotH;
    const y = padT + plotH - bh;
    const grad = ctx.createLinearGradient(0, y, 0, y + bh);
    const c = colors[i] || CHART_COLORS.teal;
    grad.addColorStop(0, c); grad.addColorStop(1, c + '88');
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, barW, bh, 4); ctx.fill();
    if (opts.labels) {
      ctx.fillStyle = '#122335'; ctx.font = '600 11px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(Number(v).toFixed(0), x + barW / 2, y - 4);
    }
    ctx.fillStyle = '#9aa8b8'; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(labels[i]), x + barW / 2, h - padB + 14);
  });
  ctx.textAlign = 'left';
}

// Doughnut chart. canvasId, items: [{label,value,color}]
function drawDoughnut(canvasId, items, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !items.length) return;
  const centerLbl = opts.centerLabel || items.reduce((s, i) => s + Number(i.value), 0);
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.min(rect.width || 220, opts.height || 200) - 20;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2, R = size / 2 - 6, r = R * 0.6;
  const total = items.reduce((s, i) => s + Number(i.value), 0) || 1;
  let start = -Math.PI / 2;
  items.forEach((it) => {
    const frac = Number(it.value) / total;
    const end = start + frac * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, end);
    ctx.arc(cx, cy, r, end, start, true);
    ctx.closePath();
    ctx.fillStyle = it.color || CHART_COLORS.teal;
    ctx.fill();
    start = end;
  });
  ctx.fillStyle = '#122335'; ctx.font = '800 ' + Math.max(16, size * 0.12) + 'px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(centerLbl), cx, cy);
  ctx.textBaseline = 'alphabetic';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- Export CSV ---------- */

function exportCSV(filename, headers, rows) {
  const csvContent = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 400);
}

/* ---------- Print ---------- */

function printElement(selector) {
  const el = $(selector);
  if (el) el.classList.add('print-active');
  setTimeout(() => { window.print(); setTimeout(() => el && el.classList.remove('print-active'), 300); }, 30);
}

/* ---------- Dashboard meta (numbers in the top stat row) ---------- */

function renderDashboardMeta() {
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('#statPatients', Store.getAll('patients').length);
  set('#statDoctors', Store.getAll('doctors').length);
  const appts = Store.getAll('appointments');
  set('#statTodayAppts', appts.filter((a) => a.date === todayISO() && a.status !== 'cancelled').length);
  set('#statPendingAppts', appts.filter((a) => a.status === 'pending' || a.status === 'confirmed').length);
  const revenue = Store.getAll('bills').reduce((s, b) => s + Number(b.total || 0), 0);
  set('#statRevenue', formatCurrency(revenue));
  const due = Store.getAll('bills').reduce((s, b) => s + Number(b.balance || 0), 0);
  set('#statDue', formatCurrency(due));
}