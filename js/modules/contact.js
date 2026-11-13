/* =========================================================
   contact.js - Contact Us page + admin contact messages inbox.
   Public page: hospital info, working hours, emergencies, map,
   social links and a validated inquiry form. Admin inbox lets
   staff view, search, read, resolve and delete inquiries.
   Wrapped in an IIFE to avoid global name collisions.
   ========================================================= */

(function () {
'use strict';

registerPage('contact', { render, open, onAction });

let msgQuery = '';
let msgFilter = 'all'; // all | new | read | resolved

// Where the email backend lives. Defaults to SAME-ORIGIN (''), like the rest
// of the app's apiRequest: the deployed backend (e.g. on Render) and the
// Contact form share one origin, so relative /api/... calls hit the real
// server. This fixes the prior bug where the deployed page posted to the
// visitor's own "localhost:3000" and always showed "Email service offline".
// Set window.CITYCARE_CONTACT_API only when the backend is on another origin.
const CONTACT_API = (window.CITYCARE_CONTACT_API || '').replace(/\/$/, '');
let contactSending = false; // guards against duplicate submissions

const STATUS_META = {
  new: { label: 'New', cls: 'pending' },
  read: { label: 'Read', cls: 'scheduled' },
  resolved: { label: 'Resolved', cls: 'completed' }
};

function initials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function avatarColor(name) {
  const colors = ['purple', 'teal', 'orange', 'green'];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

/* ---------- Icons ---------- */
const IC = {
  pin: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7a2 2 0 0 1 1.7 2.05z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1 4.6 2.6 6.2L8 16v3a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3l.4-.8A9 9 0 0 0 19 9a7 7 0 0 0-7-7z"/><path d="M9.5 5.5L14.5 8.5M9.5 8.5L14.5 5.5"/></svg>`,
  fb: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.6 1.6-1.6H16.5V4.8c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1V11H7.5v3h2.6v7h3.4z"/></svg>`,
  tw: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.6 6.4c.9-.5 1.5-1.3 1.9-2.3-.8.5-1.7.8-2.7 1a4.4 4.4 0 0 0-7.6 4A12.5 12.5 0 0 1 3 5.3a4.4 4.4 0 0 0 1.4 5.9c-.7 0-1.4-.2-2-.6v.1a4.4 4.4 0 0 0 3.5 4.3 4.4 4.4 0 0 1-2 .1 4.4 4.4 0 0 0 4.1 3.1A8.9 8.9 0 0 1 2 19.5a12.5 12.5 0 0 0 6.8 2c8 0 12.3-6.6 12.3-12.3v-.6c.8-.6 1.6-1.4 2.1-2.2-.8.3-1.6.6-2.6.7z"/></svg>`,
  ig: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.9 1.7 4.9 4.9.1 1.2.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.1-1.6 4.8-4.9 4.9-1.2.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.9-1.8-4.9-4.9-.1-1.2-.1-1.6-.1-4.8s0-3.6.1-4.8c.1-3.2 1.7-4.9 4.9-4.9 1.2-.1 1.6-.1 4.8-.1zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm5.2-3.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>`,
  ln: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4.6 3.5a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zM3 9h3.3v11H3V9zm6.2 0h3.1v1.5h.1c.4-.8 1.5-1.7 3.1-1.7 3.3 0 3.9 2.2 3.9 5V20H16v-5c0-1.2 0-2.7-1.7-2.7s-2 1.3-2 2.7V20H9.2V9z"/></svg>`,
  wa: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.2.1-.2 0-.4 0-.5l-.8-1.8c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.9.9-1 2.2-.2 3.8a11 11 0 0 0 4.2 4.3c1.6.9 2.6.8 3.5.4.5-.2 1-.7 1.1-1.3.1-.3 0-.5-.1-.6z"/></svg>`
};

function infoCard(icon, label, value, sub) {
  return `
    <div class="contact-card">
      <span class="contact-card-icon">${icon}</span>
      <div>
        <span class="contact-card-label">${label}</span>
        <span class="contact-card-value">${value}</span>
        ${sub ? `<span class="contact-card-sub">${sub}</span>` : ''}
      </div>
    </div>`;
}

function render() {
  const mount = $('#mount-contact');
  if (!mount) return;
  const base = (typeof getSettings === 'function') ? getSettings() : {};
  // Merge so fields added after a user's settings were saved always resolve.
  const s = Object.assign({}, defaultSettings && typeof defaultSettings === 'function' ? defaultSettings() : {}, base);
  const name = s.hospitalName || 'CityCare Hospital';
  const socials = s.socials || {};
  // Resolve a functional URL for each platform. Falls back to a default
  // profile URL when the saved value is a placeholder ('#') or empty so the
  // icons are always clickable. WhatsApp becomes a wa.me chat link.
  const DEFAULTS = {
    facebook: 'https://facebook.com/citycarehospital',
    twitter: 'https://x.com/citycarehospital',
    instagram: 'https://instagram.com/citycarehospital',
    linkedin: 'https://linkedin.com/company/citycare-hospital'
  };
  function isRealUrl(v) { return typeof v === 'string' && /^https?:\/\/.+/.test(v.trim()); }
  function waLink(v) {
    const digits = String(v || '').replace(/[^\d]/g, '');
    return 'https://wa.me/' + (digits || '15550130') + '?text=' + encodeURIComponent('Hello CityCare Hospital, I would like to make an enquiry.');
  }
  const socialsList = [
    { key: 'facebook', icon: IC.fb, label: 'Facebook', href: isRealUrl(socials.facebook) ? socials.facebook : DEFAULTS.facebook },
    { key: 'twitter', icon: IC.tw, label: 'Twitter / X', href: isRealUrl(socials.twitter) ? socials.twitter : DEFAULTS.twitter },
    { key: 'instagram', icon: IC.ig, label: 'Instagram', href: isRealUrl(socials.instagram) ? socials.instagram : DEFAULTS.instagram },
    { key: 'linkedin', icon: IC.ln, label: 'LinkedIn', href: isRealUrl(socials.linkedin) ? socials.linkedin : DEFAULTS.linkedin },
    { key: 'whatsapp', icon: IC.wa, label: 'WhatsApp', href: isRealUrl(socials.whatsapp) ? socials.whatsapp : waLink(socials.whatsapp) }
  ];
  const socialLinks = socialsList;

  const messages = filteredMessages();

  mount.innerHTML = `
    <div class="page-head">
      <div><h1>Contact Our Hospital</h1><p class="subtitle">${esc(name)} - we are here to help</p></div>
    </div>

    <!-- Hero banner -->
    <div class="contact-hero">
      <div class="contact-hero-brand">
        <span class="logo-sm hero-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l2 6 3-14 3 10 2-2h4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <div>
          <h2>${esc(name)}</h2>
          <p>${esc(s.tagline || 'Care for every life')}</p>
        </div>
      </div>
      <p class="contact-hero-text">Get in touch with our friendly team for appointments, billing help, medical records or general enquiries. We answer every message during working hours.</p>
    </div>

    <!-- Info cards -->
    <div class="contact-cards">
      ${infoCard(IC.pin, 'Address', esc(s.address || ''), esc(s.city || ''))}
      ${infoCard(IC.phone, 'General Enquiries', esc(s.phone || ''), 'Call us Monday to Friday')}
      ${infoCard(IC.mail, 'Email Us', esc(s.email || ''), 'We reply within 1 business day')}
      ${infoCard(IC.clock, 'Working Hours', esc(s.hoursWeek || ''), (s.hoursSat ? esc(s.hoursSat) : 'Weekdays'))}
    </div>

    <!-- Emergency band -->
    <div class="contact-emergency">
      <span class="contact-emergency-icon">${IC.alert}</span>
      <div class="contact-emergency-main">
        <strong>Emergency? We are open 24/7.</strong>
        <span>${esc(s.emergency || 'Dial 911 or call the emergency line at any time')}</span>
      </div>
      <a class="btn btn-danger" href="tel:${esc((s.emergencyPhone || '').replace(/[^+\d]/g, ''))}">
        ${IC.phone}<span style="margin-left:2px">${esc(s.emergencyPhone || '')}</span>
      </a>
    </div>

    <div class="contact-layout">
      <!-- Form -->
      <div class="card contact-form-card">
        <div class="card-head"><h2>Send us a message</h2><span class="chip chip-teal" id="mailStatusHint" title="Email delivery service status">Checking...</span></div>
        <form id="contactForm" novalidate>
          <div class="form-grid">
            <div class="form-group">
              <label for="cf-name">Full Name *</label>
              <input class="input" id="cf-name" placeholder="e.g. Jordan Miles">
            </div>
            <div class="form-group">
              <label for="cf-email">Email Address *</label>
              <input class="input" id="cf-email" type="email" placeholder="you@example.com">
            </div>
            <div class="form-group">
              <label for="cf-phone">Phone Number</label>
              <input class="input" id="cf-phone" placeholder="e.g. 555-7100" maxlength="20">
            </div>
            <div class="form-group">
              <label for="cf-subject">Subject *</label>
              <select class="input" id="cf-subject">
                <option value="">Select a subject</option>
                <option>Appointments</option>
                <option>Billing &amp; Payments</option>
                <option>Medical Records</option>
                <option>Pharmacy</option>
                <option>General Enquiry</option>
                <option>Feedback or Suggestion</option>
              </select>
            </div>
            <div class="form-group full">
              <label for="cf-message">Message *</label>
              <textarea class="input" id="cf-message" placeholder="How can we help you?" rows="5"></textarea>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              Send Message
            </button>
          </div>
        </form>
      </div>

      <!-- Map + socials -->
      <div class="contact-side">
        <div class="card map-card">
          <div class="card-head"><h2>Find us</h2><span class="chip chip-purple">Location placeholder</span></div>
          <div class="map-placeholder">
            <iframe title="Hospital location map" src="${esc(s.mapEmbed || 'https://www.google.com/maps?q=Springfield&output=embed')}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
          </div>
        </div>
        <div class="card social-card">
          <div class="card-head"><h2>Follow us</h2></div>
          <div class="social-row">
            ${socialLinks.map((x) => `
              <a class="social-btn" href="${esc(x.href)}" target="_blank" rel="noopener" aria-label="${esc(x.label)}" title="${esc(x.label)}">${x.icon}</a>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Admin: contact messages inbox -->
    <div class="card" style="margin-top:20px">
      <div class="card-head">
        <h2>Admin - Contact Messages</h2>
        <div class="table-toolbar" style="margin-bottom:0">
          <span class="chip chip-purple" id="msgCount">${messages.length} message${messages.length === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div class="table-toolbar">
        <div class="search-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input type="search" class="input" id="msgSearch" placeholder="Search messages...">
        </div>
        <select class="input filter-select" id="msgFilterSelect" aria-label="Filter messages by status">
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="read">Read</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      <div id="msgTableWrap">
        ${messages.length ? messagesList(messages) : '<p class="empty-block">No messages found.</p>'}
      </div>
    </div>
  `;

  checkMailStatus();
  document.getElementById('msgSearch').value = msgQuery;
  document.getElementById('msgFilterSelect').value = msgFilter;
  document.getElementById('msgSearch').addEventListener('input', (e) => { msgQuery = e.target.value; renderInbox(); });
  document.getElementById('msgFilterSelect').addEventListener('change', (e) => { msgFilter = e.target.value; renderInbox(); });
}

function filterMessages() {
  const list = Store.getAll('contact').slice().reverse();
  const q = msgQuery.toLowerCase().trim();
  return list.filter((m) => {
    if (msgFilter !== 'all' && m.status !== msgFilter) return false;
    if (!q) return true;
    return (m.name || '').toLowerCase().includes(q)
      || (m.email || '').toLowerCase().includes(q)
      || (m.subject || '').toLowerCase().includes(q)
      || (m.id || '').toLowerCase().includes(q);
  });
}

function filteredMessages() { return filterMessages(); }

function messagesList(list) {
  return `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Message</th><th>Date</th><th>Status</th><th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((m) => {
            const meta = STATUS_META[m.status] || STATUS_META.new;
            return `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <span class="avatar ${avatarColor(m.name)}">${esc(initials(m.name))}</span>
                  <div>
                    <div class="primary-text">${esc(m.name)} <span class="muted-text">&middot; ${esc(m.subject)}</span></div>
                    <div class="muted-text">${esc(m.email)}</div>
                  </div>
                </div>
              </td>
              <td class="muted-text">${formatDate(m.date)} ${m.time ? '&middot; ' + esc(m.time) : ''}</td>
              <td><span class="badge ${meta.cls}">${meta.label}</span></td>
              <td class="actions-col">
                <div class="actions">
                  <button class="btn btn-ghost btn-sm" data-action="read" data-id="${esc(m.id)}" data-module="contact">Read</button>
                  <button class="btn btn-sm" data-action="resolve" data-id="${esc(m.id)}" data-module="contact" ${m.status === 'resolved' ? 'disabled' : ''}>Resolve</button>
                  <button class="btn btn-danger btn-sm" data-action="del" data-id="${esc(m.id)}" data-module="contact">Delete</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderInbox() {
  const wrap = $('#msgTableWrap');
  const count = $('#msgCount');
  if (!wrap) return;
  const list = filterMessages();
  if (count) count.textContent = list.length + ' message' + (list.length === 1 ? '' : 's');
  wrap.innerHTML = list.length ? messagesList(list) : '<p class="empty-block">No messages found.</p>';
}

/* ---------- Contact form submit handler ----------
   Attached ONCE via a delegated document listener (see end of file) so the
   handler is never duplicated when render()/refreshAll() run again. The form
   itself is also marked with an attribute so the delegated handler can
   recognise it without re-binding. */
async function handleContactSubmit(e) {
  const form = e.target && e.target.id === 'contactForm' ? e.target : null;
  if (!form) return;
  e.preventDefault();            // never let the browser navigate/reload on submit
  e.stopPropagation();           // stop any other submit handler from firing
  if (contactSending) return;    // prevent duplicate/rapid submissions

  const name = $('#cf-name').value.trim();
  const email = $('#cf-email').value.trim();
  const phone = $('#cf-phone').value.trim();
  const subject = $('#cf-subject').value;
  const message = $('#cf-message').value.trim();

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const rules = [
    { id: 'cf-name', value: name, msg: 'Full name is required' },
    { id: 'cf-email', value: email, msg: 'Email address is required' },
    { id: 'cf-subject', value: subject, msg: 'Please choose a subject' },
    { id: 'cf-message', value: message, msg: 'Please enter your message' }
  ];
  let ok = validateForm(rules);
  if (email && !emailOk) { setFieldError('cf-email', 'Enter a valid email address'); ok = false; }
  if (!ok) { toast('Please fix the highlighted fields.', 'error'); return; }

  // Save locally first so the enquiry is never lost (admin inbox).
  // status reflects what happened to the email once we know.
  const record = {
    id: genMessageId(),
    name, email, phone, subject, message,
    date: todayISO(),
    time: new Date().toTimeString().slice(0, 5),
    status: 'new'
  };
  Store.add('contact', record);

  // Enter "sending" state: disable the form so it cannot be double-submitted.
  const submitBtn = form.querySelector('button[type="submit"]');
  const sentinel = submitBtn ? submitBtn.innerHTML : '';
  contactSending = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Sending...';
  }
  toast('Sending your message...');

  let emailStatus = 'unavailable';
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctrl && ctrl.abort(), 12000);
    const resp = await fetch(CONTACT_API + '/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, subject, message }),
      signal: ctrl ? ctrl.signal : undefined
    });
    clearTimeout(t);
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.ok) {
      emailStatus = 'sent';
    } else if (data.error === 'MAIL_NOT_CONFIGURED') {
      emailStatus = 'unavailable';
    } else {
      emailStatus = 'failed';
    }
  } catch (err) {
    // Network error / backend not running / timeout.
    emailStatus = 'unavailable';
  }

  // Re-enable the form.
  contactSending = false;
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = sentinel;
    submitBtn.setAttribute('aria-live', 'polite');
  }

  if (emailStatus === 'sent') {
    Store.update('contact', record.id, { status: 'new', emailed: true });
    form.reset();
    clearFieldError('cf-name'); clearFieldError('cf-email'); clearFieldError('cf-subject'); clearFieldError('cf-message');
    renderInbox();
    toast('Thank you! Your message has been sent.', 'success');
  } else if (emailStatus === 'unavailable') {
    // The backend is not configured / not reachable. We cannot claim it was
    // emailed, so tell the user clearly. Enquiry is already saved locally and
    // the form retains their input.
    renderInbox();
    toast('Email service is not configured yet. Your message was saved, but no email was sent.', 'error');
  } else {
    renderInbox();
    toast('Your message was saved, but the email could not be sent. Please try again or contact us by phone.', 'error');
  }
}

/* Run once per page load: if the email backend is reachable and configured,
   surface a subtle hint on the contact page. Never authenticates and never
   reads or sends email here - this only pings /api/health.
   Diagnostics are secret-safe: we only log the HTTP status and a coarse
   reason (NETWORK_FAILURE / BAD_RESPONSE / NOT_CONFIGURED), never credentials. */
function checkMailStatus() {
  const badge = $('#mailStatusHint');
  if (!badge) return;
  const endpoint = CONTACT_API + '/api/health';

  fetch(endpoint, { method: 'GET', cache: 'no-store' })
    .then((r) => r.json().catch(() => null).then((data) => ({ status: r.status, ok: r.ok, data })))
    .then(({ status, ok, data }) => {
      const d = data;
      if (!d || typeof d !== 'object' || !d.ok || status !== 200) {
        // Backend responded but not as a healthy health-check (e.g. wrong
        // origin serving HTML/404, or DNS). Log a secret-free diagnostic.
        console.warn(`[contact] health check returned unexpected response status=${status} (endpoint=${endpoint})`);
        badge.textContent = 'Email service offline';
        badge.title = 'Health check did not return a valid response from the server.';
        return;
      }
      // Prefer the structured `email` block; fall back to the legacy flag.
      const email = (d.email && typeof d.email === 'object') ? d.email : { configured: !!d.emailConfigured, sendVerified: false };
      if (email.configured === true) {
        // Configured means a Gmail/SMTP transport can be built. Only treat a
        // message as actually sent when the /api/contact SMTP send succeeds.
        badge.textContent = email.sendVerified ? 'Online' : 'Configured';
        badge.title = (email.setupProblem) ? email.setupProblem : 'Email service is configured.';
        return;
      }
      badge.textContent = 'Email not configured';
      badge.title = 'SMTP/Gmail credentials are not set on the server.';
    })
    .catch((err) => {
      // Network / CORS / mixed-content / blocked request. Log a coarse reason only.
      console.warn('[contact] email health check failed: NETWORK_FAILURE', `endpoint=${endpoint}`);
      badge.textContent = 'Email service offline';
      badge.title = 'Could not reach the email health endpoint (network, CORS, or mixed-content).';
    });
}

/* ---------- Actions (delegated via data-action + data-module="contact") ---------- */
function onAction(e, btn) {
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const m = Store.getById('contact', id);
  if (!m) return;
  if (action === 'read') {
    if (m.status === 'new') Store.update('contact', id, { status: 'read' });
    openModal(`
      <div class="modal-head">
        <div><h2>${esc(m.subject)}</h2><p>From ${esc(m.name)} &middot; ${esc(m.email)}</p></div>
        <button class="icon-button" data-close aria-label="Close"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="meta-grid">
        <div class="meta-cell"><span class="meta-label">Date</span><span class="meta-value">${formatDate(m.date)} ${m.time || ''}</span></div>
        <div class="meta-cell"><span class="meta-label">Phone</span><span class="meta-value">${esc(m.phone || '-')}</span></div>
        <div class="meta-cell"><span class="meta-label">Subject</span><span class="meta-value">${esc(m.subject)}</span></div>
        <div class="meta-cell"><span class="meta-label">Email</span><span class="meta-value">${esc(m.email)}</span></div>
      </div>
      <div class="card" style="margin-top:14px">
        <p style="white-space:pre-wrap;margin:0;color:var(--text-2)">${esc(m.message)}</p>
      </div>
      <div class="form-actions" style="margin-top:16px">
        <button class="btn btn-secondary" data-close>Close</button>
        <button class="btn btn-primary" id="readReply">Mark as Read</button>
      </div>
    `, { onOpen: () => { $('#readReply').addEventListener('click', () => { Store.update('contact', id, { status: 'read' }); closeModal(); renderInbox(); toast('Message marked as read.', 'success'); }); } });
    // mark read immediately on open too
    setTimeout(() => { renderInbox(); }, 0);
  } else if (action === 'resolve') {
    Store.update('contact', id, { status: 'resolved' });
    renderInbox();
    toast('Message marked as resolved.', 'success');
  } else if (action === 'del') {
    confirmDialog({
      title: 'Delete message?',
      message: 'Delete the message from ' + m.name + ' (' + m.id + ')? This cannot be undone.',
      confirmText: 'Delete',
      onConfirm: () => { Store.remove('contact', id); renderInbox(); toast('Message deleted.', 'success'); }
    });
  }
}

function open() { render(); }

// One delegated input listener for the inbox search+filter (safe: re-binds on render is handled natively)
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'msgSearch') { renderInbox(); }
});
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'msgFilterSelect') { renderInbox(); }
});
// Single delegated submit listener for the contact form.
// Registered exactly once here (NOT inside render()), so duplicate / repeated
// page-refresh submissions cannot happen no matter how often render() runs.
document.addEventListener('submit', handleContactSubmit);

})();