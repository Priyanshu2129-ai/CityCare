/* =========================================================
   patientAccount.js - Patient Portal accounts & authentication.
   Separate from the Admin auth (server/auth.js). Patients register
   with a phone number + password (bcrypt), log in via a distinct
   session role ('patient'), and can ONLY access their own data.
   Passwords are never stored in plain text and hashes are never
   returned by the API.
   ========================================================= */

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { requireLogin, csrfGuard, loginLimiter } = require('./auth');

const router = express.Router();

/* ---- Phone validation ----
   Accepts digits, spaces, +, -, () — between 7 and 15 digits. Stored normalized
   (digits only, leading '+' preserved) so a phone is unique regardless of format. */
const PHONE_RE = /^\+?[\d\s()-]{7,17}$/;
function normalizePhone(p) {
  const s = String(p || '').trim().replace(/[^\d+]/g, '');
  return s;
}
function isValidPhone(p) {
  const digits = String(p || '').replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

/* ---- PatientAccount model
   Each account is linked to an existing Patient record (patientId) when the
   patient's phone already exists in the patients collection on registration,
   or null for a self-registered account. Fictional demo data only. */
const patientAccountSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true }, // normalized
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true }, // bcrypt only
    patientId: { type: String, default: null },     // link to Patient.id when known
    role: { type: String, default: 'patient' },
    createdAt: { type: Date, default: Date.now }
  },
  { collection: 'patientAccounts' }
);
// Never expose the password hash via JSON.
patientAccountSchema.set('toJSON', {
  transform: (doc, ret) => { delete ret.passwordHash; delete ret.__v; delete ret._id; return ret; }
});
const PatientAccount = mongoose.model('PatientAccount', patientAccountSchema);

// Separate (lighter) login limiter for patient auth. Reuses the same window.
const patientLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // patients are many; keep it generous but bounded
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }
});

/* ---- Link a new account to an existing Patient record by phone, if present.
   This lets a returning patient keep using their existing record. Never trusts
   a client-supplied patientId. */
async function linkAccountToPatient(account) {
  try {
    const Patient = mongoose.model('Patient');
    const found = await Patient.findOne({ phone: { $regex: escapeRegExp(account.phone), $options: 'i' } }).exec();
    if (found && !account.patientId) {
      account.patientId = found.id || String(found._id);
      await account.save();
    }
  } catch (e) {
    /* non-fatal: account still works without a linked record */
  }
}
function escapeRegExp(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ---- POST /api/patient/register  { name, phone, password, confirmPassword } ---- */
router.post('/register', csrfGuard, async (req, res) => {
  const name = String(req.body && req.body.name || '').trim();
  const phoneRaw = String(req.body && req.body.phone || '').trim();
  const password = String(req.body && req.body.password || '');
  const confirm = String(req.body && req.body.confirmPassword || '');

  const errors = {};
  if (name.length < 2) errors.name = 'Full name is required (min 2 characters).';
  if (!phoneRaw || !isValidPhone(phoneRaw)) errors.phone = 'Enter a valid phone number (7-15 digits).';
  if (password.length < 6) errors.password = 'Password must be at least 6 characters.';
  if (password !== confirm) errors.confirmPassword = 'Passwords do not match.';
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });

  const phone = normalizePhone(phoneRaw);
  try {
    const existing = await PatientAccount.findOne({ phone }).exec();
    if (existing) {
      return res.status(409).json({ ok: false, error: 'PHONE_EXISTS', message: 'An account with this phone number already exists.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const account = await PatientAccount.create({ name, phone, passwordHash, role: 'patient' });
    await linkAccountToPatient(account);

    // No password hash in the response: the toJSON transform strips it.
    return res.status(201).json({ ok: true, account: account.toJSON() });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'PHONE_EXISTS', message: 'An account with this phone number already exists.' });
    }
    console.error('[patient-register] DB error:', String(err && err.message || 'error').slice(0, 120));
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Could not create account. Please try again.' });
  }
});

/* ---- POST /api/patient/login  { phone, password } ---- */
router.post('/login', patientLoginLimiter, csrfGuard, async (req, res) => {
  const phone = normalizePhone(String(req.body && req.body.phone || '').trim());
  const password = String(req.body && req.body.password || '');
  if (!phone || !password) {
    return res.status(400).json({ ok: false, error: 'INVALID_INPUT', message: 'Phone and password are required.' });
  }
  let account;
  try { account = await PatientAccount.findOne({ phone }).exec(); }
  catch (e) {
    console.error('[patient-login] DB error:', String(e && e.message || 'error').slice(0, 120));
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Could not sign in. Please try again.' });
  }
  if (!account) {
    return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS', message: 'Invalid phone number or password.' });
  }
  let ok = false;
  try { ok = await bcrypt.compare(password, account.passwordHash); } catch (e) { ok = false; }
  if (!ok) {
    return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS', message: 'Invalid phone number or password.' });
  }
  // Anti-fixation: regenerate the session id, then set role 'patient'. This is
  // a SEPARATE role from admin, so a patient session cannot pass requireAdmin
  // and an admin session cannot pass requirePatient.
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Could not start a session.' });
    req.session.user = { username: account.phone, name: account.name, role: 'patient', patientAccountId: String(account._id) };
    return res.json({ ok: true, user: { name: account.name, phone: account.phone, role: 'patient' } });
  });
});

/* ---- POST /api/patient/logout ---- */
router.post('/logout', csrfGuard, (req, res) => {
  if (req.session) {
    req.session.destroy(() => res.json({ ok: true }));
  } else {
    res.json({ ok: true });
  }
});

/* ---- GET /api/patient/me  (requirePatient) ---- */
router.get('/me', requirePatient, (req, res) => res.json({ ok: true, user: req.patientSafe }));

/* ---- Middleware: must be an authenticated PATIENT ----
   Requires a session whose role is 'patient' (the account id is stored on the
   session). Admin sessions (role 'admin') are rejected here, and patient
   sessions are rejected by requireAdmin — the two roles are fully separated. */
function requirePatient(req, res, next) {
  requireLogin(req, res, () => {
    const u = req.user;
    if (u.role !== 'patient' || !u.patientAccountId) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'Patient access required.' });
    }
    req.patient = { patientAccountId: u.patientAccountId, phone: u.username, name: u.name };
    // Safe projection for responses (never passwords/hashes).
    req.patientSafe = { role: 'patient', phone: u.username, name: u.name };
    next();
  });
}

/* ---- Ownership guard: ensure the requested patient id == the logged-in patient.
   Patients may ONLY access their own records. Never trust a client-supplied id. */
function requireOwnPatient(patientId) {
  return (req, res, next) => {
    requirePatient(req, res, () => {
      // patientId here is the Patient.id the client wants; compare against the
      // session's linked record. If not linked, reject.
      const target = String(patientId == null ? '' : patientId);
      const linked = String(req.patient && req.patient.patientAccountId || '');
      // Ownership is enforced by patientAccountId on the session - the client
      // cannot change it.
      if (!target || String(target) !== linked) {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'You may only access your own records.' });
      }
      next();
    });
  };
}

module.exports = { router, PatientAccount, requirePatient, requireOwnPatient, normalizePhone, isValidPhone, escapeRegExp };