/* =========================================================
   server.js - CityCare Hospital contact form email backend
   Express + Nodemailer.
   All secrets come from environment variables (.env), never
   from client-side code and never hardcoded here.
   ========================================================= */

// Load server/.env relative to THIS file so it works regardless of the current
// working directory (works when run from server/ or imported from project root,
// e.g. by the Vercel adapter). On PaaS/Vercel these come from the platform env.
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
dotenv.config({ path: path.join(__dirname, '.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { router: patientRouter, seedPatientsIfEmpty } = require('./patient');
const NODE_ENV = String(process.env.NODE_ENV || 'development');
const {
  IS_PROD,
  assertAdminConfigured,
  assertSessionSecret,
  buildSessionMiddleware,
  loginLimiter,
  loginHandler,
  logoutHandler,
  meHandler,
  requireLogin,
  requireAdmin,
  adminAuthDiagnostics,
  csrfGuard
} = require('./auth');

// Fail closed before anything else: the app must have secure admin config
// AND a MongoDB connection string (needed for persistent sessions + patients).
try {
  assertAdminConfigured();
  assertSessionSecret();
  const uri = String(process.env.MONGODB_URI || '').trim();
  if (!uri) {
    throw new Error('DATABASE SECURITY: set MONGODB_URI in server/.env. The app requires MongoDB for sessions and patient data.');
  }
  // Reject malformed MongoDB URIs at startup with a clear message instead of a
  // confusing (and async) MongoParseError crash from connect-mongo. Use the same
  // parser the driver uses so validation is authoritative. Never print the URI
  // (it may contain credentials) - only a safe setup hint.
  try {
    const { ConnectionString } = require('mongodb-connection-string-url');
    new ConnectionString(uri); // throws MongoParseError if malformed
  } catch (uriErr) {
    const hint = String(uriErr && uriErr.message || '').includes('port')
      ? ' Your mongodb+srv URI should NOT include a port number (remove :xxxx after the host).'
      : ' Use the exact "mongodb+srv://" string from MongoDB Atlas.';
    throw new Error('DATABASE SECURITY: MONGODB_URI is not a valid MongoDB connection string.' + hint);
  }
} catch (e) {
  console.error('[STARTUP-FAIL] ' + e.message);
  process.exit(1);
}

// Secret-safe startup email diagnostics (never print credentials).
try {
  const cfg = gmailSetupDiagnostic();
  if (cfg) console.error('[EMAIL-SETUP] ' + cfg);
  else if (process.env.GMAIL_USER || process.env.SMTP_HOST) console.log('[EMAIL-SETUP] SMTP/Gmail credentials present (will still be verified at send time).');
  else console.log('[EMAIL-SETUP] No SMTP/Gmail credentials configured yet.');
} catch (e) { /* diagnostics must never crash the server */ }

// Secret-free startup auth diagnostics: only PRESENCE booleans (never values).
try {
  const d = adminAuthDiagnostics();
  console.log('[AUTH-SETUP]', JSON.stringify({ ...d, bcryptCompare: 'not-run' }));
} catch (e) { console.error('[AUTH-SETUP] diagnostic error'); }

const app = express();
app.disable('x-powered-by'); // remove the Express header

/* ---- Reverse proxy trust (safe, Render-aware) ----
   Must be set BEFORE any middleware that depends on req.ip / req.secure, e.g.
   the login rate limiter and secure-cookie session. Render terminates TLS and
   forwards the client's IP in X-Forwarded-For, so behind Render the client IP
   is correctly resolved only when Express trusts that one proxy hop.

   We deliberately do NOT use trust proxy = true / '*' (that would let any
   client spoof X-Forwarded-For). Instead we trust only the immediate reverse
   proxy hop:
     - production: 1 (Render's single TLS-terminating proxy)
     - development: false (no proxy locally)
   An explicit TRUST_PROXY env value overrides this if your host differs. */
const TRUST_PROXY = String(process.env.TRUST_PROXY || (IS_PROD ? '1' : 'false'));
if (TRUST_PROXY === 'false') {
  app.set('trust proxy', false);
} else if (TRUST_PROXY === 'true' || TRUST_PROXY === 'all') {
  app.set('trust proxy', 1); // never 'all' - always cap at the immediate proxy
} else {
  app.set('trust proxy', Number(TRUST_PROXY));
}

/* ---- Security headers (always, but stricter in production) ---- */
app.use(helmet({
  contentSecurityPolicy: IS_PROD ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'https://www.google.com'],
      scriptSrc: ["'self'", "'unsafe-inline'"]
    }
  } : false,
  crossOriginEmbedderPolicy: false
}));

// JSON body parsing with a sane size limit.
app.use(express.json({ limit: '50kb' }));
// Parse cookies so session auth can read the httpOnly session cookie.
app.use(cookieParser());

/* ---- CORS ----
   Only the configured frontend origin is allowed, and credentials (the
   session cookie) are exchanged. Never uses "*". Localhost origins are
   allowed only in development, never in production. */
const DEFAULT_ORIGINS = IS_PROD ? '' : 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:58023,http://127.0.0.1:58023';
const allowedOrigins = (process.env.CORS_ORIGIN || DEFAULT_ORIGINS)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return cb(null, true);
    return cb(null, false); // reject disallowed origins
  },
  credentials: true
}));

const PORT = process.env.PORT || 3000;

/* ---------------- MongoDB (Mongoose) ----------------
   Reads the connection string ONLY from process.env.MONGODB_URI (set in
   server/.env). We never hardcode, log, or expose the URI or its credentials.
   The server keeps running even if the database is unavailable so the email
   + contact endpoints are never taken down by a DB outage. */
const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();

// Track database health for /api/health without leaking secrets.
const DB_STATE = {
  status: 'not-configured', // not-configured | connecting | connected | disconnected | error
  host: null,
  db: null,
  reason: null
};

// Return a safe (credential-free) label derived from the connection string.
function safeDbLabel() {
  if (!MONGODB_URI) return { host: null, db: null };
  try {
    const u = new URL(MONGODB_URI);
    return { host: u.hostname, db: String(u.pathname || '').replace(/^\//, '') || 'unknown' };
  } catch (e) {
    return { host: null, db: null };
  }
}

async function connectDB() {
  if (!MONGODB_URI) {
    DB_STATE.status = 'not-configured';
    DB_STATE.reason = 'MONGODB_URI is not set in server/.env';
    return false;
  }
  const label = safeDbLabel();
  DB_STATE.host = label.host;
  DB_STATE.db = label.db;
  DB_STATE.status = 'connecting';
  DB_STATE.reason = null;
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });
    DB_STATE.status = 'connected';
    DB_STATE.reason = null;
    console.log(`MongoDB connected (host: ${label.host}, db: ${label.db})`);
    return true;
  } catch (err) {
    // Log only a generic reason, never the URI or credentials.
    DB_STATE.status = 'error';
    DB_STATE.reason = 'connection failed (check MONGODB_URI and network)';
    console.error('MongoDB connection failed:', DB_STATE.reason);
    return false;
  }
}

// Connection lifecycle events keep DB_STATE accurate for /api/health.
mongoose.connection.on('error', (err) => {
  if (DB_STATE.status !== 'connecting') {
    DB_STATE.status = 'error';
    DB_STATE.reason = 'connection error';
  }
  console.error('MongoDB runtime error (not rethrown):', DB_STATE.reason);
});
mongoose.connection.on('disconnected', () => {
  if (DB_STATE.status === 'connected') {
    DB_STATE.status = 'disconnected';
    DB_STATE.reason = 'disconnected';
    console.error('MongoDB disconnected.');
  }
});
mongoose.connection.on('connected', () => {
  if (DB_STATE.status !== 'connected') {
    DB_STATE.status = 'connected';
    DB_STATE.reason = null;
  }
  // If a fresh Atlas database was just connected, seed the fictional demo
  // patients so the Patients page has data (only when the collection is empty).
  seedPatientsIfEmpty();
});

/* A minimal Mongoose model so the schema/model layer is wired and verified.
   NOT used for persistence yet - module migration is intentionally out of
   scope for this step. It links a collection to the connected database. */
const contactEnquirySchema = new mongoose.Schema({
  id: String,
  name: String,
  email: String,
  phone: String,
  subject: String,
  message: String,
  date: String,
  time: String,
  status: { type: String, default: 'new' }
}, { collection: 'contactEnquiries' });
const ContactEnquiry = mongoose.model('ContactEnquiry', contactEnquirySchema);

/* ---- Email transport (Nodemailer) ----
   Reads credentials ONLY from environment variables.
   Supports real SMTP (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS)
   or a Gmail account via GMAIL_USER / GMAIL_APP_PASSWORD. */
function buildTransport() {
  if (!process.env.SMTP_HOST) {
    // Gmail fallback configuration (use an App Password, not the account password).
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('MAIL_NOT_CONFIGURED');
    }
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
  }
  const secure = String(process.env.SMTP_SECURE || 'true') === 'true';
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || (secure ? 465 : 587)),
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

/* ---- Secret-safe SMTP diagnostics ----
   We never log credentials. Nodemailer/SMTP errors are classified into a
   small set of safe reason codes so the deployed server can tell us WHY an
   email failed (auth vs network vs blocked) without exposing the password,
   token, or connection string. */
const SMTP_DIAGNOSTIC_TIMEOUT_MS = 15000;

// ---- Email delivery verification state ----
// `emailVerified` is ONLY set true after a real transporter.sendMail() succeeds.
// Credentials/config present (emailConfigured) does NOT mean delivery works.
// resetting it to false on any new attempt keeps the health state honest.
let emailVerified = false; // changed only by the email verification endpoint
const emailVerify = { lastAttempt: 0, cooldownMs: 60000 }; // >1 min between live SMTP probes

function classifySendError(err) {
  // Nodemailer wraps transport errors in code=EAUTH, ECONNECTION etc.
  const code = String((err && err.code) || (err && err.responseCode) || '');
  const raw = String((err && err.message) || '').toLowerCase();
  const rc = {
    reason: 'UNKNOWN',
    detail: 'Email delivery failed with an unknown error.',
    redacted: true
  };

  // Identifier: never echo credentials. Errors are classified by code/text.
  // Authentication failure (bad password / app password / user)
  if (code === 'EAUTH' || /(authentication failed|invalid login|bad username|535|username and password not accepted)/.test(raw)) {
    rc.reason = 'SMTP_AUTH_FAILED';
    rc.detail = 'SMTP/Gmail rejected the credentials (wrong user, wrong App Password, or the Google account is not using 2-Step Verification + an App Password).';
    return rc;
  }
  // Relay / access denied
  if (/(relay|access is denied|530|not permitted|sender is not allowed)/.test(raw)) {
    rc.reason = 'SMTP_ACCESS_DENIED';
    rc.detail = 'SMTP relay/access denied for this sender. Check FROM_EMAIL and sender permissions for the account.';
    return rc;
  }
  // Connection/host/network failure (check the error code first, then text)
  if (/^(ECONNECTION|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|ESOCKET)$/.test(code) ||
      /econnection|econnreset|econnrefused|enetunreach|eai_again|etimedout|timed out|dns|getaddrinfo|socket hang up/.test(raw)) {
    rc.reason = 'SMTP_NETWORK';
    rc.detail = 'Could not reach the SMTP/Gmail server (network, timeout, or blocked SMTP port).';
    return rc;
  }
  // Rate limiting / throttling
  if (/(rate limit|too many|throttl|quota|421)/.test(raw)) {
    rc.reason = 'SMTP_RATE_LIMITED';
    rc.detail = 'The email provider rate-limited or rejected the message as possible spam.';
    return rc;
  }
  // Sender/recipient validation
  if (/(sender address rejected|553|recipient address rejected|550)/.test(raw)) {
    rc.reason = 'SMTP_ADDRESS_REJECTED';
    rc.detail = 'The sender or recipient address was rejected. Check FROM_EMAIL / ADMIN_EMAIL format.';
    return rc;
  }

  rc.reason = 'SMTP_OTHER';
  rc.detail = 'Email delivery failed (see classified reason).';
  return rc;
}

// Validate the Google App Password shape early (16 chars, no spaces) so the
// admin sees a clear setup error instead of a confusing send-time failure.
// Returns null when OK, or a safe setup-instruction string when not.
function gmailSetupDiagnostic() {
  if (!process.env.GMAIL_USER) return null;
  const appPass = String(process.env.GMAIL_APP_PASSWORD || '');
  if (!appPass) {
    return 'GMAIL_APP_PASSWORD is empty. Set a Google App Password (not your account password).';
  }
  const stripped = appPass.replace(/[-\s]/g, '');
  if (stripped.length !== 16 || !/^[a-z]{4}[a-z]{4}[a-z]{4}[a-z]{4}$/i.test(stripped)) {
    return 'GMAIL_APP_PASSWORD does not look like a Google App Password (it must be 16 characters with no spaces). Get one at https://myaccount.google.com/apppasswords after enabling 2-Step Verification.';
  }
  return null;
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || (process.env.GMAIL_USER || process.env.SMTP_USER || 'admin@citycare.example');
const FROM_EMAIL = process.env.FROM_EMAIL || ADMIN_EMAIL;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Persist enquiries server-side too (JSON file). This is separate from the
   browser's localStorage so a copy survives even if the visitor clears their cache. */
const DATA_FILE = path.join(__dirname, 'data', 'enquiries.json');
function loadEnquiries() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return []; }
}
function saveEnquiry(record) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); // ensure server/data exists
  const list = loadEnquiries();
  list.push(record);
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

/* ---- Health check (used by the frontend to detect whether email is available) ---- */
app.get('/api/health', (req, res) => {
  let configured = false;
  try { buildTransport(); configured = true; } catch (e) { /* not configured */ }
  res.json({
    ok: true,
    emailConfigured: configured,
    email: {
      configured,
      provider: process.env.SMTP_HOST ? 'smtp' : 'gmail',
      setupProblem: gmailSetupDiagnostic(), // safe setup guidance, never credentials
      sendVerified: emailVerified // true ONLY after a real SMTP send succeeds
    },
    database: {
      configured: DB_STATE.status !== 'not-configured',
      status: DB_STATE.status,
      connected: DB_STATE.status === 'connected',
      readyState: mongoose.connection.readyState, // 0=disconnected 1=connected 2=connecting 3=disconnecting
      host: DB_STATE.host,
      db: DB_STATE.db
    }
  });
});

/* ---- Session middleware (persistent MongoDB store, secure cookie) ----
   Mounted before the authenticated routes. Session is only created after a
   successful login (saveUninitialized:false).
   The store is constructed eagerly by connect-mongo, which throws a
   MongoParseError for a malformed URI. Wrap it so a bad/misconfigured
   MONGODB_URI produces a clear, secret-safe startup failure instead of a raw
   stack trace - and never expose the URI/credentials in the message. */
let sessionMiddleware;
try {
  sessionMiddleware = buildSessionMiddleware();
} catch (e) {
  const hint = String(e && e.message || '').includes('port') ? ' (detected: mongodb+srv URI contains a port - remove it)' : '';
  console.error(
    '[STARTUP-FAIL] Session store could not be created. Check that MONGODB_URI is a valid, reachable MongoDB connection string.' + hint
  );
  process.exit(1);
}
app.use(sessionMiddleware);

/* ---- Auth routes (cookie-based sessions). Login/logout are the gate; only
   /api/auth/me and protected resources require an existing session. ---- */
app.post('/api/auth/login', loginLimiter, loginHandler);
app.post('/api/auth/logout', csrfGuard, logoutHandler);
app.get('/api/auth/me', meHandler);

/* ---- Email delivery verification ----
   Admin-only + CSRF-protected + rate-limited. Registered AFTER the session
   middleware so requireAdmin can read req.session. It sends ONE real test
   email to ADMIN_EMAIL to prove Gmail/SMTP delivery. Only reports success after
   transporter.sendMail() resolves; on failure returns a classified, secret-safe
   reason. The 60s cooldown is an ADDITIONAL safeguard, not a substitute for
   auth. */
app.post('/api/email/verify', requireAdmin, csrfGuard, async (req, res) => {
  const now = Date.now();
  if (now - emailVerify.lastAttempt < emailVerify.cooldownMs) {
    return res.status(429).json({
      ok: false, error: 'COOLDOWN',
      message: 'Wait a moment before sending another test email.'
    });
  }
  let transporter;
  try { transporter = buildTransport(); }
  catch (e) {
    return res.status(503).json({
      ok: false, error: 'MAIL_NOT_CONFIGURED',
      message: 'Email is not configured. Add SMTP or Gmail credentials to the server environment and restart.'
    });
  }
  emailVerify.lastAttempt = now;
  emailVerified = false; // a new attempt invalidates any previous "verified" state
  const mailOptions = {
    from: `CityCare <${process.env.FROM_EMAIL || ADMIN_EMAIL}>`,
    to: ADMIN_EMAIL,
    replyTo: ADMIN_EMAIL,
    subject: '[CityCare] Email delivery verification test',
    text: 'This is a delivery-verification test from the CityCare Hospital contact system. If you received this, outgoing email is working.'
  };
  try {
    await transporter.sendMail(mailOptions);
    emailVerified = true;
    return res.json({ ok: true, emailVerified: true, message: 'Test email accepted by the email provider. Delivery verified.' });
  } catch (err) {
    const diag = classifySendError(err);
    const redactedMsg = String(err && err.message || '').replace(/[\r\n]/g, ' ').slice(0, 200);
    console.error('Email verification FAILED:', `reason=${diag.reason}`, redactedMsg ? `| (${redactedMsg})` : '');
    return res.status(500).json({
      ok: false,
      error: 'SEND_FAILED',
      reason: diag.reason,
      setupProblem: gmailSetupDiagnostic(),
      message: diag.detail + ' No email was sent.'
    });
  }
});

/* ---- Patients module (MongoDB CRUD, admin-only) ---- */
app.use('/api/patients', patientRouter);

/* ---- Contact endpoint ---- */
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, subject, message } = req.body || {};

  // Server-side validation (never trust the client).
  const trimmed = (s) => String(s == null ? '' : s).trim();
  const body = {
    name: trimmed(name),
    email: trimmed(email),
    phone: trimmed(phone),
    subject: trimmed(subject),
    message: trimmed(message)
  };

  const errors = {};
  if (!body.name) errors.name = 'Full name is required';
  if (!body.email) errors.email = 'Email address is required';
  else if (!EMAIL_RE.test(body.email)) errors.email = 'Enter a valid email address';
  if (!body.subject) errors.subject = 'Please choose a subject';
  if (!body.message) errors.message = 'Please enter your message';
  if (Object.keys(errors).length) {
    return res.status(400).json({ ok: false, errors });
  }

  const record = {
    id: 'MSG-' + Date.now(),
    ...body,
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    status: 'new'
  };

  // Validate email transport exists before attempting to send.
  let transporter;
  try { transporter = buildTransport(); }
  catch (e) {
    // Not configured: persist locally, but do NOT claim email was sent.
    saveEnquiry(record);
    return res.status(503).json({
      ok: false,
      savedLocally: true,
      error: 'MAIL_NOT_CONFIGURED',
      message: 'Email sending is not configured on the server. Add SMTP or Gmail credentials to server/.env and restart the server. Your enquiry was saved but no email was sent.'
    });
  }

  const mailOptions = {
    from: `${body.name} <${body.email}>`,
    to: ADMIN_EMAIL,
    replyTo: body.email,
    subject: `[CityCare Contact] ${body.subject}`,
    text: [
      `New contact enquiry from the CityCare Hospital website.`,
      '',
      `Name:    ${body.name}`,
      `Email:   ${body.email}`,
      `Phone:   ${body.phone || '-'}`,
      `Subject: ${body.subject}`,
      '',
      `Message:`,
      body.message
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
        <div style="background:#0d9488;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
          <strong>CityCare Hospital</strong> - New Contact Enquiry
        </div>
        <div style="border:1px solid #e6ecf3;border-top:0;padding:20px 24px;border-radius:0 0 10px 10px">
          <p style="margin:0 0 14px">Someone submitted the contact form on the website.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#5d7289">Name</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(body.name)}</td></tr>
            <tr><td style="padding:6px 0;color:#5d7289">Email</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(body.email)}</td></tr>
            <tr><td style="padding:6px 0;color:#5d7289">Phone</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(body.phone || '-')}</td></tr>
            <tr><td style="padding:6px 0;color:#5d7289">Subject</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(body.subject)}</td></tr>
          </table>
          <div style="margin-top:16px;padding:14px 16px;background:#f9fbfd;border-radius:8px;white-space:pre-wrap">${escapeHtml(body.message)}</div>
        </div>
      </div>`
  };

  try {
    await transporter.sendMail(mailOptions);
    saveEnquiry(record);
    return res.json({ ok: true, id: record.id, message: 'Your message has been sent.' });
  } catch (err) {
    // Persist the enquiry regardless so it is not lost, but report clearly.
    saveEnquiry(record);
    // Secret-safe: log only the classified reason + a redacted error message,
    // never credentials, the App Password, or the connection string.
    const diag = classifySendError(err);
    const redactedMsg = String(err && err.message || '').replace(/[\r\n]/g, ' ').slice(0, 200);
    console.error(`Email send failed: reason=${diag.reason}`, redactedMsg ? `| (${redactedMsg})` : '');
    return res.status(500).json({
      ok: false,
      savedLocally: true,
      error: 'SEND_FAILED',
      reason: diag.reason,
      setupProblem: gmailSetupDiagnostic(), // safe, credential-free guidance
      message: diag.detail + ' Your enquiry was saved but the email was not sent.'
    });
  }
});

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---- Generic error handler ----
   Returns a generic JSON message; never leaks stack traces or internals. */
app.use((err, req, res, next) => {
  // Body-parser size-limit errors -> 413
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'PAYLOAD_TOO_LARGE', message: 'Request body too large.' });
  }
  console.error('Unhandled error:', err && err.message ? err.message : err);
  return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Internal server error.' });
});

/* ---- Serve the frontend from the same origin ----
   This makes the httpOnly session cookie a first-party cookie (no cross-site
   third-party-cookie blocking) and is the recommended deployment layout: the
   web app and its API share one origin. */
const WEB_ROOT = path.join(__dirname, '..');
app.use(express.static(WEB_ROOT));
app.get('/', (req, res) => res.sendFile(path.join(WEB_ROOT, 'index.html')));
app.use((req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Not found.' }));

// Run as a long-lived server only when executed directly (node server.js).
// When imported (e.g. by a Vercel serverless wrapper at api/index.js), don't
// bind a port; the platform calls app as a handler instead.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CityCare contact server listening on http://localhost:${PORT} (NODE_ENV=${NODE_ENV})`);
    console.log(`Frontend served at http://localhost:${PORT}/`);
    // Establish MongoDB in the background so the HTTP server is never blocked.
    // If the DB is unreachable, email + contact routes continue to work.
    connectDB();
  });
}

// Export the Express app for platform adapters (e.g. Vercel serverless via
// api/index.js that does: module.exports = require('../server/server')).
module.exports = app;