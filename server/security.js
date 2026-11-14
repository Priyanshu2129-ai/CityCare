/* =========================================================
   security.js - Persistent server-side admin credential store.
   The admin password hash is persisted in MongoDB (collection
   `adminConfig`) so a password change survives a backend restart,
   unlike an environment-variable-only hash which would be lost.

   Resolution order for the effective admin hash:
     1. DB hash (after the admin has changed the password once)
     2. fallback: process.env.ADMIN_PASSWORD_HASH (existing env config)

   The password hash is never returned to clients and never logged.
   ========================================================= */
'use strict';

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

/* ---- AdminConfig model ----
   A single document (key:'admin') holds the current bcrypt password hash. */
const adminConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'admin' },
    passwordHash: { type: String, required: true }
  },
  { collection: 'adminConfig' }
);
const AdminConfig =
  mongoose.models.AdminConfig || mongoose.model('AdminConfig', adminConfigSchema);

/* Return the current effective admin bcrypt hash, or null.
   NEVER log or expose the hash. */
async function currentAdminHash() {
  try {
    const doc = await AdminConfig.findOne({ key: 'admin' }).lean();
    if (doc && doc.passwordHash) return doc.passwordHash;
  } catch (e) {
    // DB unreachable -> fall through to env hash (authority remains env).
  }
  const envHash = String(process.env.ADMIN_PASSWORD_HASH || '');
  return envHash || null;
}

/* Verify a plain password against the effective admin hash.
   Returns { ok:true } on match, else a secret-free failure reason. */
async function verifyAdminPassword(plain) {
  const hash = await currentAdminHash();
  if (!hash || !/^\$2[aby]\$/.test(hash)) return { ok: false, reason: 'BAD_HASH_CONFIG' };
  try {
    const matched = await bcrypt.compare(String(plain || ''), hash);
    return { ok: !!matched, reason: matched ? 'MATCH' : 'MISMATCH' };
  } catch (e) {
    return { ok: false, reason: 'BCRYPT_ERROR' };
  }
}

/* Strength policy for new passwords. Returns { ok:true } or { ok:false, message }. */
function validateNewPassword(pw) {
  const s = String(pw || '');
  if (s.length < 10) return { ok: false, message: 'New password must be at least 10 characters.' };
  if (!/[A-Z]/.test(s)) return { ok: false, message: 'New password must contain an uppercase letter.' };
  if (!/[a-z]/.test(s)) return { ok: false, message: 'New password must contain a lowercase letter.' };
  if (!/\d/.test(s)) return { ok: false, message: 'New password must contain a number.' };
  return { ok: true };
}

/* Persist a new admin password hash in MongoDB (bcrypt). */
async function saveAdminPasswordHash(newHash) {
  await AdminConfig.findOneAndUpdate(
    { key: 'admin' },
    { $set: { passwordHash: newHash } },
    { upsert: true, new: true }
  );
}

/* Invalidate OTHER admin sessions so a password change logs out everyone
   except the current session. Sessions live in the connect-mongo `sessions`
   collection keyed by _id (the SID). Non-fatal if it fails. */
async function invalidateOtherAdminSessions(currentSid) {
  try {
    const conn = mongoose.connection;
    const col = conn && conn.collections && conn.collections.sessions;
    if (col) {
      await col.deleteMany({
        _id: { $ne: currentSid },
        $or: [
          { 'session.user.role': 'admin' },
          { session: { $regex: '"role":"admin"' } }
        ]
      });
    }
  } catch (e) {
    /* best-effort - never fail the request over session cleanup */
  }
}

module.exports = {
  AdminConfig,
  verifyAdminPassword,
  validateNewPassword,
  saveAdminPasswordHash,
  invalidateOtherAdminSessions,
  currentAdminHash
};