/* =========================================================
   app.js - bootstrap: auth gate, seed, login/logout, init.
   ========================================================= */

/* ---- Session (in-memory + sessionStorage) ---- */
const Session = {
  key: 'citycare_session',
  isAuthed() { return sessionStorage.getItem(this.key) === '1'; },
  start() { sessionStorage.setItem(this.key, '1'); },
  end() { sessionStorage.removeItem(this.key); }
};

function showApp() {
  $('#loginScreen').classList.remove('show');
  $('#appLayout').hidden = false;
}

function showLogin() {
  $('#appLayout').hidden = true;
  $('#loginScreen').classList.add('show');
  const u = $('#loginUser'); if (u) u.focus();
}

function boot() {
  Auth.ensure();            // ensure admin exists (default admin/admin123)
  seedIfEmpty();            // seed departments/patients/doctors/etc if brand new
  initShell();              // bind mobile sidebar toggle on every load (auth-independent)
  const s = Store.read('settings', null) || defaultSettings();

  // Branding
  const brand = $('#brandText'); if (brand) brand.textContent = s.hospitalName;
  const tb = $('#topbarBrand'); if (tb) tb.textContent = s.hospitalName;

  // Login: the SERVER is the authoritative authentication gate (verifies the
  // bcrypt admin hash and issues a persistent httpOnly session). The local
  // Auth.verify is only used as an offline-dev fallback when the backend is
  // unreachable (the protected patient API will still 401 in that case).
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('#loginUser').value.trim();
    const p = $('#loginPass').value;
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }

    let serverOk = false;
    try {
      const r = await apiLogin(u, p);
      serverOk = !!(r && r.ok);
    } catch (err) {
      serverOk = false; // backend unreachable
    }

    const localOk = Auth.verify(u, p);
    const authed = serverOk || (localOk && !serverOk); // server wins; local only when offline

    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }

    if (authed) {
      Session.start();
      showApp();
      toast('Welcome back, ' + (Auth.get().name || 'Admin'), 'success');
      initApp();
      if (serverOk) refreshPatientsFromServer();
    } else {
      toast('Invalid username or password.', 'error');
    }
  });

  // Logout: clear the local session and the server-side session cookie.
  $('#logoutLink').addEventListener('click', (e) => {
    e.preventDefault();
    Session.end();
    apiLogout().catch(() => { /* ignore */ });
    showLogin();
    toast('You have been logged out.');
    // reset hash to dashboard so it's not blocked by role logic
    history.replaceState(null, '', '#dashboard');
  });

  // Route guard: if logged in, boot; else login screen.
  if (Session.isAuthed()) {
    showApp();
    initApp();
  } else {
    showLogin();
  }
}

function initApp() {
  // Refresh all registered module pages and set topbar date
  $('#topbarDate').textContent = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  // Hash routing
  const validPages = Object.keys(Pages);
  const hash = (window.location.hash || '#dashboard').replace('#', '');
  navigateTo(validPages.includes(hash) ? hash : 'dashboard');

  // Keep dashboard meta in topbar stat row refreshed too.
  renderDashboardMeta();

  // Refresh all pages initially (modules are registered by now)
  refreshAll();
}

/* Print applies only to open modal (invoice). */
window.addEventListener('afterprint', () => {});

document.addEventListener('DOMContentLoaded', boot);