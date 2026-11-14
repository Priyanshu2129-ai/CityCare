/* =========================================================
   patientPortal.js - Public Patient Portal (role 'patient').
   Fully separate from the Admin SPA: its own session (PatientSession),
   its own pages (Home / Login / Register / Dashboard / Book / Appointments)
   rendered into #patientMount, and its own header nav. Talks to the
   /api/patient/* endpoints using the shared apiRequest conventions
   (credentials:include + X-Requested-With). Never stores passwords in the
   browser and renders no secrets.
   ========================================================= */

(function () {
  'use strict';

  const API = (window.CITYCARE_API_BASE || '');

  // Separate patient session (distinct key from admin Session in app.js).
  const PatientSession = {
    key: 'citycare_patient',
    isAuthed() { return sessionStorage.getItem(this.key) === '1'; },
    start() { sessionStorage.setItem(this.key, '1'); },
    end() { sessionStorage.removeItem(this.key); }
  };

  // Canonical route name (case + separator insensitive). Accepts both the
  // task's forms (#patientLogin, #patientPortal) and the fallback dash form
  // (#patient-login, #patient-home).
  function canon(hash) {
    return String(hash || '').replace('#', '')
      .replace(/[_-]+/g, '')      // strip dashes/underscores
      .toLowerCase();             // case-insensitive -> 'patientlogin'
  }
  function isPatientRoute(hash) {
    const c = canon(hash);
    return ['patienthome', 'patientlogin', 'patientregister', 'patientdashboard', 'patientbook', 'patientappointments', 'patientportal'].includes(c);
  }
  // Map a route to its canonical dash form used by the render() switch.
  function routeName(hash) {
    const c = canon(hash);
    return c === 'patientlogin' ? 'patient-login'
      : c === 'patientregister' ? 'patient-register'
      : c === 'patientdashboard' ? 'patient-dashboard'
      : c === 'patientbook' ? 'patient-book'
      : c === 'patientappointments' ? 'patient-appointments'
      : c === 'patientportal' || c === 'patienthome' ? 'patient-home'
      : 'patient-home';
  }

  const $ = (s) => document.querySelector(s);
  const portal = $('#patientPortal');
  const adminLayout = $('#appLayout');
  const loginScreen = $('#loginScreen');

  function showPortal() {
    // Always isolate the patient portal: hide the admin shell, admin login and
    // the welcome screen.
    if (portal) portal.hidden = false;
    if (adminLayout) adminLayout.hidden = true;
    if (loginScreen) loginScreen.classList.remove('show');
    const w = $('#welcomeScreen'); if (w) w.classList.remove('show');
  }
  function hidePortal() {
    // Hide the patient portal and admin shell. The current screen (welcome,
    // admin login, or admin app) is managed by app.js' show* functions, this
    // only clears the portal so those screens are not covered by it.
    if (portal) portal.hidden = true;
    if (adminLayout) adminLayout.hidden = true;
  }

  // Async wrapper like apiRequest but returning {ok,status,data}.
  async function api(path, opts) {
    try {
      const ctrl = window.AbortController ? new AbortController() : null;
      const t = setTimeout(() => ctrl && ctrl.abort(), 12000);
      const resp = await fetch(API + path, Object.assign({
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        signal: ctrl ? ctrl.signal : undefined
      }, opts || {}));
      clearTimeout(t);
      let data = {};
      try { data = await resp.json(); } catch (e) { /* non-JSON */ }
      return { ok: resp.ok, status: resp.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'NETWORK', message: 'Could not reach the server.' } };
    }
  }

  function initials(name) {
    return (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }
  function avatarColor(name) {
    const colors = ['purple', 'teal', 'orange', 'green'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % colors.length;
    return colors[h];
  }
  function fieldError(html) {
    return `<p class="field-error">${html}</p>`;
  }

  /* ---------- State ---------- */
  const state = { user: null, q: '' };

  function requireAuth(next) {
    if (PatientSession.isAuthed()) { next(); return; }
    go('patient-login');
  }

  /* ---------- Navigation ---------- */
  function go(hash) {
    const target = routeName(hash); // canonical dash form for the URL
    if (window.location.hash !== '#' + target) history.pushState(null, '', '#' + target);
    render();
  }

  /* ---------- Renders ---------- */
  function render() {
    const hash = (window.location.hash || '#patient-home').replace('#', '');
    if (!isPatientRoute(hash)) return;
    showPortal();
    const route = routeName(hash);
    updateHeader(route);
    if (route === 'patient-home') renderHome();
    else if (route === 'patient-login') renderLogin();
    else if (route === 'patient-register') renderRegister();
    else if (route === 'patient-dashboard') requireAuth(renderDashboard);
    else if (route === 'patient-book') requireAuth(renderBook);
    else if (route === 'patient-appointments') requireAuth(renderAppointments);
  }

  function updateHeader(hash) {
    const authed = PatientSession.isAuthed();
    const links = $('#patientAuthedLinks');
    if (links) links.hidden = !authed;
    document.querySelectorAll('[data-patient-nav]').forEach((a) => {
      a.classList.toggle('active', a.dataset.patientNav === hash.replace('patient-', ''));
    });
    const brand = $('#patientBrand');
    if (brand && state.user) brand.innerHTML = 'CityCare <small>Patient Portal · ' + window.esc(state.user.name || '') + '</small>';
    else if (brand) brand.innerHTML = 'CityCare <small>Patient Portal</small>';
  }

  function renderHome() {
    const mount = $('#patientMount');
    mount.innerHTML = `
      <div class="patient-hero">
        <h1>Welcome to CityCare Patient Portal</h1>
        <p>Book appointments, view their status and manage your care - all in one place.</p>
        <div class="patient-hero-actions">
          <a href="#patient-register" class="btn btn-primary">Create an account</a>
          <a href="#patient-login" class="btn btn-secondary">Sign in</a>
        </div>
      </div>
      <div class="patient-features">
        <div class="card"><h3>Book an appointment</h3><p>Choose a doctor and a time that suits you.</p></div>
        <div class="card"><h3>Track status</h3><p>See if your request is pending, approved, rejected or completed.</p></div>
        <div class="card"><h3>Your history</h3><p>Review past and upcoming appointments.</p></div>
      </div>`;
  }

  function renderLogin() {
    const mount = $('#patientMount');
    mount.innerHTML = `
      <div class="patient-card">
        <h2>Patient Sign In</h2>
        <p class="patient-muted">Use the phone number and password you registered with.</p>
        <form id="patientLoginForm" novalidate>
          <div class="form-group"><label for="pl-phone">Phone Number</label><input class="input" id="pl-phone" inputmode="tel" autocomplete="tel" placeholder="e.g. 555-7100"></div>
          <div class="form-group"><label for="pl-pass">Password</label><input class="input" id="pl-pass" type="password" autocomplete="current-password"></div>
          <div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Sign In</button></div>
          <p class="patient-muted" style="text-align:center">New here? <a href="#patient-register" class="text-link">Create an account</a></p>
        </form>
      </div>`;
    $('#patientLoginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = $('#pl-phone').value.trim();
      const password = $('#pl-pass').value;
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
      const r = await api('/api/patient/login', { method: 'POST', body: JSON.stringify({ phone, password }) });
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
      if (r.ok && r.data && r.data.ok) {
        PatientSession.start();
        state.user = r.data.user || {};
        window.toast('Welcome, ' + (state.user.name || '') + '.', 'success');
        go('patient-dashboard');
      } else if (r.status === 401) {
        const mountEl = $('#patientMount');
        mountEl.insertAdjacentHTML('beforeend', fieldError('Invalid phone number or password.'));
      } else if (r.status === 429) {
        window.toast(r.data.message || 'Too many attempts. Try again later.', 'error');
      } else {
        window.toast(r.data.message || 'Could not sign in.', 'error');
      }
    });
  }

  function renderRegister() {
    const mount = $('#patientMount');
    mount.innerHTML = `
      <div class="patient-card">
        <h2>Create a Patient Account</h2>
        <p class="patient-muted">Register with your phone number so you can book and track appointments.</p>
        <form id="patientRegisterForm" novalidate>
          <div class="form-group"><label for="pr-name">Full Name</label><input class="input" id="pr-name" autocomplete="name" placeholder="e.g. Jordan Miles"></div>
          <div class="form-group"><label for="pr-phone">Phone Number</label><input class="input" id="pr-phone" inputmode="tel" autocomplete="tel" placeholder="e.g. 555-7100"></div>
          <div class="form-group"><label for="pr-pass">Password</label><input class="input" id="pr-pass" type="password" autocomplete="new-password" placeholder="At least 6 characters"></div>
          <div class="form-group"><label for="pr-confirm">Confirm Password</label><input class="input" id="pr-confirm" type="password" autocomplete="new-password"></div>
          <div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Create Account</button></div>
          <p class="patient-muted" style="text-align:center">Already registered? <a href="#patient-login" class="text-link">Sign in</a></p>
        </form>
      </div>`;
    $('#patientRegisterForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#pr-name').value.trim();
      const phone = $('#pr-phone').value.trim();
      const password = $('#pr-pass').value;
      const confirmPassword = $('#pr-confirm').value;
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }
      const r = await api('/api/patient/register', { method: 'POST', body: JSON.stringify({ name, phone, password, confirmPassword }) });
      if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
      if (r.ok && r.data && r.data.ok) {
        window.toast('Account created! Please sign in.', 'success');
        go('patient-login');
      } else if (r.status === 409) {
        window.toast(r.data.message || 'That phone number is already registered.', 'error');
      } else {
        const errors = r.data && r.data.errors;
        const mountEl = $('#patientMount');
        if (errors) {
          const any = $('#pr-name'); // re-anchor errors near the form
          const box = $('#patientRegisterForm');
          if (box) box.insertAdjacentHTML('afterbegin', fieldError(Object.values(errors).join(' &middot; ')));
        } else {
          window.toast(r.data.message || 'Could not create account.', 'error');
        }
      }
    });
  }

  function renderDashboard() {
    const mount = $('#patientMount');
    const u = state.user || {};
    mount.innerHTML = `
      <div class="patient-hero">
        <h1>Hello, ${window.esc(u.name || '')}.</h1>
        <p>Welcome to the CityCare Patient Dashboard.</p>
      </div>
      <div class="patient-actions">
        <a href="#patient-book" class="btn btn-primary">Book Appointment</a>
        <a href="#patient-appointments" class="btn btn-secondary">My Appointments</a>
      </div>`;
  }

  async function renderBook() {
    const mount = $('#patientMount');
    mount.innerHTML = '<div class="patient-card"><p>Loading doctors...</p></div>';
    // Doctors are stored in LocalStorage on the frontend (existing admin module).
    const doctors = window.Store ? window.Store.getAll('doctors') : [];
    if (!doctors.length) {
      mount.innerHTML = '<div class="patient-card"><p class="patient-muted">No doctors are currently available.</p></div>';
      return;
    }
    mount.innerHTML = `
      <div class="patient-card">
        <h2>Book an Appointment</h2>
        <form id="patientBookForm" novalidate>
          <div class="form-group">
            <label for="pb-doctor">Doctor</label>
            <select class="input" id="pb-doctor">
              <option value="">Select a doctor</option>
              ${doctors.map((d) => `<option value="${window.esc(d.id)}" data-name="${window.esc(d.name)}" data-dept="${window.esc(d.specialization || '')}">${window.esc(d.name)} - ${window.esc(d.specialization || '')}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label for="pb-date">Date</label><input class="input" id="pb-date" type="date"></div>
          <div class="form-group"><label for="pb-time">Time</label><input class="input" id="pb-time" type="time"></div>
          <div class="form-group"><label for="pb-reason">Reason (optional)</label><textarea class="input" id="pb-reason" rows="3" placeholder="e.g. yearly check-up"></textarea></div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Submit Request</button></div>
        </form>
      </div>`;
    $('#patientBookForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const sel = $('#pb-doctor');
      const opt = sel.selectedOptions[0];
      const doctorId = sel.value;
      const doctorName = opt ? opt.dataset.name : '';
      const department = opt ? opt.dataset.dept : '';
      const date = $('#pb-date').value;
      const time = $('#pb-time').value;
      const reason = $('#pb-reason').value.trim();
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Booking...'; }
      const r = await api('/api/patient/appointments', { method: 'POST', body: JSON.stringify({ doctorId, doctorName, department, date, time, reason }) });
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Request'; }
      if (r.ok && r.data && r.data.ok) {
        window.toast('Appointment requested!', 'success');
        go('patient-appointments');
      } else {
        const errors = r.data && r.data.errors;
        window.toast(errors ? Object.values(errors)[0] : (r.data && r.data.message) || 'Could not book the appointment.', 'error');
      }
    });
  }

  async function renderAppointments() {
    const mount = $('#patientMount');
    mount.innerHTML = '<div class="patient-card"><p>Loading appointments...</p></div>';
    const r = await api('/api/patient/appointments', {});
    if (!r.ok || !r.data || !r.data.ok) {
      if (r.status === 401) { go('patient-login'); }
      else mount.innerHTML = '<div class="patient-card"><p class="patient-muted">Could not load appointments.</p></div>';
      return;
    }
    const list = r.data.appointments || [];
    mount.innerHTML = `
      <div class="patient-card">
        <h2>My Appointments</h2>
        ${list.length ? `<table class="table"><thead><tr><th>Doctor</th><th>Date</th><th>Time</th><th>Status</th></tr></thead><tbody>
          ${list.map((a) => `<tr>
            <td>${window.esc(a.doctorName || a.doctorId)}</td>
            <td>${window.esc(a.date)}</td>
            <td>${window.esc(a.time)}</td>
            <td><span class="badge ${statusClass(a.status)}">${window.capitalize(a.status)}</span></td>
          </tr>`).join('')}
        </tbody></table>` : '<p class="patient-muted">You have no appointments yet.</p>'}
      </div>`;
  }

  function statusClass(s) {
    return { pending: 'pending', approved: 'confirmed', rejected: 'cancelled', completed: 'completed' }[s] || 'pending';
  }

  /* ---------- Logout ---------- */
  function doLogout() {
    PatientSession.end();
    state.user = null;
    api('/api/patient/logout', { method: 'POST' }).catch(() => {});
    // Return to the Welcome / role selection screen.
    if (window.showWelcome) { window.showWelcome(); }
    history.replaceState(null, '', '#welcome');
    window.toast('You have been logged out.', 'success');
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-patient-nav]');
    if (nav) { e.preventDefault(); go(nav.dataset.patientNav === 'home' ? 'patient-home' : 'patient-' + nav.dataset.patientNav); }
    const logout = e.target.closest('#patientLogout');
    if (logout) { e.preventDefault(); doLogout(); }
    const toAdmin = e.target.closest('#patientToAdmin');
    if (toAdmin) { e.preventDefault(); window.location.hash = '#admin-login'; }
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (isPatientRoute(hash)) {
      showPortal();
      const c = canon(hash);
      const needsAuth = c.includes('dashboard') || c.includes('book') || c.includes('appointments');
      if (!PatientSession.isAuthed() && needsAuth) {
        go('patient-login');
      } else {
        render();
      }
    } else {
      // Leaving the patient portal: delegate to the correct screen.
      if (hash === 'welcome' && window.showWelcome) window.showWelcome();
      else if (hash === 'admin-login' && window.showLogin) window.showLogin();
      else hidePortal();
    }
  });

  // Boot: if a patient session already exists or the route is a patient route,
  // show the portal immediately (even without an admin session).
  (function init() {
    const hash = window.location.hash;
    if (PatientSession.isAuthed()) {
      state.user = { name: '' };
      if (isPatientRoute(hash)) { showPortal(); render(); }
    } else if (isPatientRoute(hash)) {
      showPortal(); render();
    } else {
      // Non-patient route: ensure the admin login/app is not left corrupted.
      if (portal) portal.hidden = true;
    }
  })();

  // Expose for app.js routing decisions (minimal integration with admin boot).
  window.PatientPortal = { isPatientRoute, routeName, canon, showPortal, hidePortal };
})();