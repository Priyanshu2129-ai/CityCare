/* =========================================================
   auth.js - server-side session authentication (production-grade)
   - Strong admin password: bcrypt hash from env; fails closed if
     the hash is missing/invalid in production.
   - Persistent sessions stored in MongoDB (survives restarts).
   - HttpOnly + Secure + SameSite cookies.
   - No passwords/tokens/secrets in the frontend or logs.
   ========================================================= */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const NODE_ENV = String(process.env.NODE_ENV || 'development');
const IS_PROD = NODE_ENV === 'production';

/* ---- Admin identity (from server/.env, never logged) ---- */
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').trim();
const ADMIN_PASSWORD_HASH = String(process.env.ADMIN_PASSWORD_HASH || '').trim();

/* ---- Failing closed ----
   In production there is NO default password. If the admin bcrypt hash is
   missing or obviously not a bcrypt hash, the server must not expose a
   guessable admin account. */
function assertAdminConfigured() {
  const looksBcrypt = /^\$2[aby]\$/.test(ADMIN_PASSWORD_HASH);
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH || !looksBcrypt) {
    throw new Error(
      'ADMIN SECURITY: set ADMIN_USERNAME and ADMIN_PASSWORD_HASH (a bcrypt hash) in server/.env. ' +
      'Generate one with: node -e "console.log(require(\'bcryptjs\').hashSync(process.env.ADMIN_PASSWORD, 12))"'
    );
  }
}

// Verify a provided password against the stored bcrypt hash. Returns a result
// object so callers can distinguish "password wrong" from "hash unusable"
// without ever exposing the hash/password. Never logs secrets.
async function verifyPassword(plain) {
  // Guard: a malformed env hash must fail closed (and be reported) rather than
  // throwing inside the request handler.
  if (!ADMIN_PASSWORD_HASH || !/^\$2[aby]\$/.test(ADMIN_PASSWORD_HASH)) {
    return { ok: false, reason: 'BAD_HASH_CONFIG' };
  }
  try {
    const matched = await bcrypt.compare(String(plain || ''), ADMIN_PASSWORD_HASH);
    return { ok: !!matched, reason: matched ? 'MATCH' : 'MISMATCH' };
  } catch (err) {
    return { ok: false, reason: 'BCRYPT_ERROR' };
  }
}

// Safe, secret-free diagnostics. Reports only whether each required variable is
// PRESENT and whether a compare SUCCEEDED or FAILED - never their values.
function adminAuthDiagnostics(compareResult) {
  return {
    adminUsernamePresent: Boolean(process.env.ADMIN_USERNAME),
    adminPasswordHashPresent: Boolean(process.env.ADMIN_PASSWORD_HASH),
    adminPasswordHashLooksBcrypt: /^\$2[aby]\$/.test(String(process.env.ADMIN_PASSWORD_HASH || '')),
    sessionSecretPresent: Boolean(process.env.SESSION_SECRET),
    bcryptCompare: compareResult || 'not-run' // 'not-run' | 'MATCH' | 'MISMATCH' | 'ERROR'
  };
}

/* ---- Session configuration ----
   secret, cookie naming, duration, cookie flags. */
const SESSION_SECRET = String(process.env.SESSION_SECRET || '').trim();
function assertSessionSecret() {
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    throw new Error('ADMIN SECURITY: set a SESSION_SECRET of at least 32 characters in server/.env.');
  }
}

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MINUTES || 480) * 60 * 1000; // default 8h
const SESSION_NAME = 'citycare_sid';
// Secure cookies default to true in production (HTTPS), off in development
// (http). An explicit COOKIE_SECURE override is respected in either mode.
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || (IS_PROD ? 'true' : 'false')) === 'true';

/* ---- Login rate limiting (brute-force protection) ---- */
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,          // 15 minutes
  max: IS_PROD ? 5 : 100,            // 5 attempts in prod, gentler locally
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' }
});

/* ---- Session store factory ----
   Persistent MongoDB-backed store so sessions survive backend restarts.
   connect-mongo v6 exposes the MongoStore class directly. */
const MongoStore = require('connect-mongo').MongoStore;

/* ---- createSession: returns an express-session middleware ---- */
function buildSessionMiddleware() {
  const session = require('express-session');

  return session({
    name: SESSION_NAME,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,          // no cookie until logged in
    rolling: true,                     // slide expiration on activity
    store: new MongoStore({
      mongoUrl: String(process.env.MONGODB_URI || ''),
      touchAfter: 24 * 3600
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: SESSION_TTL_MS
    }
  });
}

/* ---- Middleware: must have a valid session ---- */
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user || !req.session.user.username) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required.' });
  }
  req.user = req.session.user;
  next();
}

/* ---- Middleware: must be an admin ---- */
function requireAdmin(req, res, next) {
  requireLogin(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'Admin access required.' });
    }
    next();
  });
}

/* ---- Routes ---- */

// POST /api/auth/login  body: { username, password }
async function loginHandler(req, res) {
  const u = String(req.body && req.body.username || '').trim();
  const p = String(req.body && req.body.password || '');
  const okUser = !!ADMIN_USERNAME && u === ADMIN_USERNAME;
  const pw = await verifyPassword(p);
  // okUser can still gate, but we only reveal login success when BOTH match.
  if (!okUser || !pw.ok) {
    // X-Forwarded-For is the client IP when trust proxy honours Render's proxy.
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    // Secret-free diagnostic: presence booleans + compare result only.
    console.warn('[AUTH] login failed', JSON.stringify(adminAuthDiagnostics(pw.reason)), `ip=${ip}`);
    return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
  }
  // Regenerate the session id on login to prevent session fixation.
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Could not start a session.' });
    req.session.user = { username: u, role: 'admin' };
    return res.json({ ok: true, user: { username: u, role: 'admin' } });
  });
}

// POST /api/auth/logout  - destroys the session + clears cookie
function logoutHandler(req, res) {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie(SESSION_NAME, { path: '/', httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE });
      return res.json({ ok: true });
    });
  } else {
    return res.json({ ok: true });
  }
}

// GET /api/auth/me  - returns the current session (or 401)
function meHandler(req, res) {
  requireLogin(req, res, () => res.json({ ok: true, user: req.user }));
}

/* ---- CSRF-hardening for cookie-based state-changing requests ----
   Browsers cannot set the X-Requested-With: XMLHttpRequest header on a
   cross-origin submission, so requiring it on POST/PUT/DELETE blocks
   classic CSRF form attacks (in addition to SameSite=Lax cookies). */
function csrfGuard(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      return res.status(403).json({ ok: false, error: 'CSRF', message: 'Cross-site request rejected.' });
    }
  }
  next();
}

module.exports = {
  IS_PROD,
  assertAdminConfigured,
  assertSessionSecret,
  buildSessionMiddleware,
  loginLimiter,
  requireLogin,
  requireAdmin,
  csrfGuard,
  loginHandler,
  logoutHandler,
  meHandler,
  adminAuthDiagnostics,
  verifyPassword
};