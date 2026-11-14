/* =========================================================
   settings.js - Settings page: hospital info, admin profile,
   change password, theme, notifications.
   Wrapped in an IIFE to avoid global name collisions.
   ========================================================= */

(function () {
'use strict';

registerPage('settings', { render, open, onAction });

function S() { return Store.read('settings', null) || defaultSettings(); }

function render() {
  const mount = $('#mount-settings');
  if (!mount) return;
  const s = S();
  const a = Auth.get() || Auth.defaults;

  mount.innerHTML = `
    <div class="page-head">
      <div><h1>Settings</h1><p class="subtitle">Hospital profile and preferences</p></div>
    </div>

    <div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">

      <div class="card">
        <div class="card-head"><h2>Hospital Information</h2></div>
        <form id="settingsForm" class="form-grid" novalidate>
          <div class="form-group"><label>Hospital Name</label><input class="input" id="set-name" value="${esc(s.hospitalName)}"></div>
          <div class="form-group"><label>Tagline</label><input class="input" id="set-tagline" value="${esc(s.tagline || '')}"></div>
          <div class="form-group full"><label>Address</label><input class="input" id="set-address" value="${esc(s.address || '')}"></div>
          <div class="form-group full"><label>City / Region</label><input class="input" id="set-city" value="${esc(s.city || '')}"></div>
          <div class="form-group"><label>Phone</label><input class="input" id="set-phone" value="${esc(s.phone || '')}"></div>
          <div class="form-group"><label>Email</label><input class="input" id="set-email" value="${esc(s.email || '')}"></div>
          <div class="form-actions full"><button type="submit" class="btn btn-primary">Save Hospital Info</button></div>
        </form>
      </div>

      <div class="card">
        <div class="card-head"><h2>Admin Profile</h2></div>
        <form id="profileForm" class="form-grid" novalidate>
          <div class="form-group full"><label>Admin Name</label><input class="input" id="prof-name" value="${esc(a.name || '')}"></div>
          <div class="form-group full"><label>Username</label><input class="input" id="prof-user" value="${esc(a.username || '')}"></div>
          <div class="form-actions full"><button type="submit" class="btn btn-primary">Update Profile</button></div>
        </form>
      </div>

      <div class="card">
        <div class="card-head"><h2>Change Password</h2></div>
        <form id="pwdForm" class="form-grid" novalidate>
          <div class="form-group full"><label>Current Password</label><input type="password" class="input" id="pwd-old"></div>
          <div class="form-group"><label>New Password</label><input type="password" class="input" id="pwd-new"></div>
          <div class="form-group"><label>Confirm Password</label><input type="password" class="input" id="pwd-confirm"></div>
          <div class="form-actions full"><button type="submit" class="btn btn-warn">Update Password</button></div>
        </form>
      </div>

      <div class="card">
        <div class="card-head"><h2>Theme</h2></div>
        <div class="form-group">
          <label>Accent theme</label>
          <select class="input" id="themeSelect">
            <option value="light" ${s.theme === 'light' || !s.theme ? 'selected' : ''}>Modern (light)</option>
            <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark sidebar (current)</option>
          </select>
        </div>
        <div class="form-group" style="margin-top:12px"><span class="meta-label">Notifications</span></div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:500;margin-top:6px">
          <input type="checkbox" id="notifToggle" ${s.notifications === false ? '' : 'checked'} style="width:16px;height:16px">
          Show toast notifications on actions
        </label>
        <div class="form-actions"><button class="btn btn-secondary" id="prefsSave">Save Preferences</button></div>
      </div>

    </div>
  `;

  $('#settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#set-name').value.trim() || 'CityCare Hospital';
    const patch = {
      hospitalName: name,
      tagline: $('#set-tagline').value.trim(),
      address: $('#set-address').value.trim(),
      city: $('#set-city').value.trim(),
      phone: $('#set-phone').value.trim(),
      email: $('#set-email').value.trim()
    };
    Store.write('settings', { ...S(), ...patch });
    applyBranding(patch);
    toast('Hospital settings saved.', 'success');
    render();
  });

  $('#profileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#prof-name').value.trim();
    const user = $('#prof-user').value.trim();
    if (!name) { setFieldError('prof-name', 'Name is required'); return; }
    if (!user) { setFieldError('prof-user', 'Username is required'); return; }
    Auth.update({ name, username: user });
    toast('Profile updated.', 'success');
    render();
  });

  $('#pwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPw = $('#pwd-old').value;
    const newPw = $('#pwd-new').value;
    const confirmPw = $('#pwd-confirm').value;
    let ok = true;
    if (!oldPw) { setFieldError('pwd-old', 'Enter current password'); ok = false; } else clearFieldError('pwd-old');
    if (newPw.length < 10) { setFieldError('pwd-new', 'New password must be at least 10 characters'); ok = false; }
    else if (!/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) || !/\d/.test(newPw)) { setFieldError('pwd-new', 'Use upper and lower case letters and a number'); ok = false; }
    else clearFieldError('pwd-new');
    if (newPw !== confirmPw) { setFieldError('pwd-confirm', 'Passwords do not match'); ok = false; } else clearFieldError('pwd-confirm');
    if (!ok) return;

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }
    const r = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: oldPw, newPassword: newPw, confirmPassword: confirmPw }
    });
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
    if (r && r.ok && r.data && r.data.ok) {
      e.target.reset();
      toast(r.data.message || 'Password changed successfully.', 'success');
    } else if (r && r.status === 401) {
      setFieldError('pwd-old', r.data && r.data.message || 'Current password is incorrect');
    } else if (r && r.status === 400) {
      const msg = r.data && r.data.message || 'Invalid password.';
      if (msg.toLowerCase().includes('current')) setFieldError('pwd-old', msg);
      else setFieldError('pwd-new', msg);
    } else {
      toast((r && r.data && r.data.message) || 'Could not change the password.', 'error');
    }
  });

  $('#prefsSave').addEventListener('click', () => {
    const theme = $('#themeSelect').value;
    const notifications = $('#notifToggle').checked;
    Store.write('settings', { ...S(), theme, notifications });
    applyTheme(theme);
    toast('Preferences saved.', 'success');
  });
}

function applyBranding(patch) {
  const name = patch.hospitalName || 'CityCare';
  const b = $('#brandText'); if (b) b.textContent = name;
  const t = $('#topbarBrand'); if (t) t.textContent = name;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

function open() { render(); }
function onAction(e, btn) {}

/* Keep login/backdrop theme in sync with saved preference at boot. */
document.addEventListener('DOMContentLoaded', () => {
  const s = Store.read('settings', null) || defaultSettings();
  applyTheme(s.theme || 'light');
});

})();