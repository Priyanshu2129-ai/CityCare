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

async function boot() {
  // Admin auth is server-side only (bcrypt + httpOnly session). There is no
  // local credential seeding or client-side auth fallback.
  seedIfEmpty();            // seed departments/patients/doctors/etc if brand new
  initShell();              // bind mobile sidebar toggle on every load (auth-independent)
  const s = Store.read('settings', null) || defaultSettings();

  // Branding
  const brand = $('#brandText'); if (brand) brand.textContent = s.hospitalName;
  const tb = $('#topbarBrand'); if (tb) tb.textContent = s.hospitalName;

  // Login: the SERVER is the ONLY authentication gate. It verifies the bcrypt
  // admin hash and issues a persistent httpOnly session cookie. The dashboard
  // opens ONLY after the server confirms login AND a valid /api/auth/me
  // session. There is no client-side fallback, so a dashboard always has a
  // working server session (protected APIs like /api/patients will not 401).
  //
  // verifyServerSession() returns true only when the backend holds a valid
  // session for this browser. Everything depends on this.
  async function verifyServerSession() {
    try {
      const r = await apiRequest('/api/auth/me');
      return !!(r && r.ok && r.data && r.data.ok);
    } catch (err) {
      return false; // backend unreachable or error
    }
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('#loginUser').value.trim();
    const p = $('#loginPass').value;
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }

    let loginOk = false;
    let serverReachable = true;
    try {
      const r = await apiLogin(u, p);
      loginOk = !!(r && r.ok);
    } catch (err) {
      serverReachable = false; // backend unreachable
    }

    // Even if login returned ok, confirm the session is real before opening.
    let sessionOk = false;
    if (loginOk) {
      const me = await apiRequest('/api/auth/me');
      sessionOk = !!(me && me.ok && me.data && me.data.ok);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    // Greeting uses the server-confirmed session; Admin is a safe fallback.
    const authedName = (() => { try { const a = Auth.get(); return a && a.name; } catch (e) { return null; } })();
    const name = (sessionOk && authedName) || 'Admin';

    if (sessionOk) {
      Session.start();
      showApp();
      toast('Welcome back, ' + name + '.', 'success');
      initApp();
      refreshPatientsFromServer();
    } else if (!serverReachable) {
      toast('Unable to reach the server. Please check that the backend is running.', 'error');
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

  // Public patient portal: if the current route is a patient page, show the
  // patient portal (independent of admin login) and skip the admin gate.
  const hashAtBoot = (window.location.hash || '').replace('#', '');
  if (window.PatientPortal && window.PatientPortal.isPatientRoute && window.PatientPortal.isPatientRoute(hashAtBoot)) {
    // keep patient session if present; the portal module handles its own auth gating
    window.PatientPortal.showPortal();
    return;
  }

  // Route guard: a dashboard requires a VALID server session. If sessionStorage
  // claims we were logged in, confirm with /api/auth/me; if the server session
  // is gone (expired/cleared), show the login screen instead of a dashboard
  // whose protected APIs would all return 401.
  if (Session.isAuthed()) {
    const ok = await verifyServerSession();
    if (ok) {
      showApp();
      initApp();
      refreshPatientsFromServer();
    } else {
      Session.end();
      showLogin();
    }
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