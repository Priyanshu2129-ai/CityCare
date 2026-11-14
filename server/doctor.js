/* =========================================================
   doctor.js - Doctors module (MongoDB)
   Mongoose schema + model + Express router for doctor CRUD.
   Department is referenced by NAME string (matches all existing
   joins in the dashboard, reports, analytics and Patient Portal).
   Only fictional demo data. No secrets are logged or exposed.

   Safeguards (Phase 3A):
   - `id` global uniqueness enforced by unique index; new ids are
     minted server-side (never from a client counter).
   - POST rejects client-supplied ids that collide.
   - Hard delete leaves historical appointment snapshots readable
     (patientAppointments stores doctorName/department at booking),
     and is the current UI behaviour.
   - /api/doctors/available is PUBLIC with a whitelisted field
     subset (no phone/email/qualification) and only returns doctors
     marked available, so the Patient Portal directory works.
   ========================================================= */

const express = require('express');
const mongoose = require('mongoose');
const { requireAdmin, csrfGuard } = require('./auth');

const router = express.Router();

/* ---- Constants (mirror frontend validation) ---- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const AVATAR_COLORS = ['teal', 'purple', 'orange', 'green'];

/* ---- Mongoose schema (mirrors the LocalStorage doctor fields) ---- */
const doctorSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true }, // D-### (unique via collation index)
    name: { type: String, required: true, trim: true },
    specialization: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true }, // FK by NAME
    qualification: { type: String, default: '', trim: true },
    experience: { type: Number, default: 0, min: 0, max: 60 },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    fees: { type: Number, default: 0, min: 0 },
    hours: { type: String, default: '', trim: true },
    availableDays: { type: [String], default: [] },
    available: { type: Boolean, default: true },
    avatarColor: { type: String, default: 'teal' },
    joined: { type: String, default: '' } // YYYY-MM-DD (kept String to match current UI)
  },
  { collection: 'doctors', timestamps: true }
);

// Case-insensitive unique `id` (prevent cross-device D-### collisions).
doctorSchema.index({ id: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
doctorSchema.index({ department: 1 });
doctorSchema.index({ available: 1, department: 1 });
doctorSchema.index({ name: 1 });

doctorSchema.set('toJSON', { versionKey: false });

const Doctor = mongoose.model('Doctor', doctorSchema);

/* ---- Whitelisted fields exposed publicly to the Patient Portal ---- */
const PUBLIC_DOCTOR_FIELDS = 'id name specialization department fees availableDays hours';
const PUBLIC_SELECT = Object.fromEntries(PUBLIC_DOCTOR_FIELDS.split(' ').map((f) => [f, 1]));

/* ---- Input validation (mirror form rules) ---- */
function validateDoctor(body) {
  const t = (v) => String(v == null ? '' : v).trim();
  const n = (v) => Number(v == null ? 0 : v) || 0;
  const days = Array.isArray(body.availableDays)
    ? body.availableDays.map((d) => String(d).trim()).filter((d) => DAYS.includes(d))
    : [];
  const data = {
    name: t(body.name),
    specialization: t(body.specialization),
    department: t(body.department),
    qualification: t(body.qualification),
    experience: n(body.experience),
    phone: t(body.phone),
    email: t(body.email),
    fees: n(body.fees),
    hours: t(body.hours),
    availableDays: days,
    available: body.available !== false,
    avatarColor: AVATAR_COLORS.includes(String(body.avatarColor || '')) ? String(body.avatarColor) : 'teal',
    joined: t(body.joined) || ''
  };
  const errors = {};
  if (data.name.length < 2) errors.name = 'Doctor name is required (min 2 characters).';
  if (!data.specialization) errors.specialization = 'Specialization is required.';
  if (!data.department) errors.department = 'Department is required.';
  if (data.phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a valid phone number (min 7 digits).';
  if (data.fees < 0) errors.fees = 'Enter a valid consultation fee.';
  if (data.email && !EMAIL_RE.test(data.email)) errors.email = 'Enter a valid email address.';
  return { ok: Object.keys(errors).length === 0, errors, data };
}

/* ---- Server-generated, globally unique id (avoid client counter collisions) ---- */
function nextDoctorId() {
  return 'D-' + String(Date.now() % 1000000).padStart(6, '0');
}

/* ---- Routes ---- */

// GET all doctors (admin) - mirrors to the local cache. Deterministic sort.
router.get('/', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const department = String(req.query.department || '').trim();
  const onlyAvailable = req.query.available === 'true';
  try {
    let filter = {};
    if (department) filter.department = department;
    if (onlyAvailable) filter.available = { $ne: false };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { id: rx }, { specialization: rx }, { department: rx }];
    }
    const list = await Doctor.find(filter).sort({ name: 1 }).lean();
    res.json({ ok: true, count: list.length, doctors: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not load doctors.' });
  }
});

// GET available doctors - PUBLIC (Patient Portal), whitelisted field subset.
router.get('/available', async (req, res) => {
  try {
    const list = await Doctor.find({ available: { $ne: false } }, PUBLIC_SELECT).sort({ name: 1 }).lean();
    res.json({ ok: true, count: list.length, doctors: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not load doctors.' });
  }
});

// GET one doctor by business id (or Mongo _id)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    let d = await Doctor.findOne({ id }).lean();
    if (!d && mongoose.isValidObjectId(id)) d = await Doctor.findById(id).lean();
    if (!d) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Doctor not found.' });
    res.json({ ok: true, doctor: d });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not load the doctor.' });
  }
});

// POST create doctor (admin + CSRF). Server-mints the id; rejects collisions.
router.post('/', requireAdmin, csrfGuard, async (req, res) => {
  const v = validateDoctor(req.body || {});
  if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
  try {
    // Departure only: reject a client-supplied id that already exists.
    if (req.body && req.body.id) {
      const id = String(req.body.id).trim();
      if (id) {
        const existing = await Doctor.exists({ id });
        if (existing) {
          return res.status(409).json({ ok: false, error: 'DUP_DOCTOR_ID', message: `A doctor with id ${id} already exists.` });
        }
      }
    }
    const doc = await Doctor.create({ ...v.data, id: nextDoctorId() });
    res.status(201).json({ ok: true, doctor: doc.toJSON() });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'DUP_DOCTOR_ID', message: 'A doctor with this id already exists.' });
    }
    console.error('[doctor-create] DB error:', String(err && err.message || 'error').slice(0, 120));
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not create the doctor.' });
  }
});

// PATCH update doctor (admin + CSRF). Preserves avatarColor by default client-side.
router.patch('/:id', requireAdmin, csrfGuard, async (req, res) => {
  const v = validateDoctor(req.body || {});
  if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
  try {
    const found = await Doctor.findOne({ id: String(req.params.id) });
    if (!found) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Doctor not found.' });
    const patch = { ...v.data, avatarColor: v.data.avatarColor || found.avatarColor || 'teal' };
    found.set(patch);
    await found.save();
    res.json({ ok: true, doctor: found.toJSON() });
  } catch (err) {
    console.error('[doctor-update] DB error:', String(err && err.message || 'error').slice(0, 120));
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not update the doctor.' });
  }
});

// DELETE doctor (admin + CSRF). Hard-delete (current UI behaviour). Historical
// patientAppointments keep their own doctorId/doctorName snapshots, so no
// rewrite is needed and history stays readable.
router.delete('/:id', requireAdmin, csrfGuard, async (req, res) => {
  try {
    const p = await Doctor.findOneAndDelete({ id: String(req.params.id) });
    if (!p) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Doctor not found.' });
    res.json({ ok: true, message: 'Doctor deleted.' });
  } catch (err) {
    console.error('[doctor-delete] DB error:', String(err && err.message || 'error').slice(0, 120));
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not delete the doctor.' });
  }
});

/* ---- Seed (fictional demo data, only when collection empty) ---- */
const SEED_DOCTORS = [
  { id: 'D-001', name: 'Dr. Safia Rahman', specialization: 'Cardiology', department: 'Cardiology', qualification: 'MD, FACC', experience: 15, phone: '555-3001', email: 's.rahman@citycare.example', fees: 120, availableDays: ['Mon', 'Tue', 'Wed', 'Thu'], hours: '9:00-17:00', available: true, joined: '2018-03-12' },
  { id: 'D-002', name: 'Dr. Kwame Mensah', specialization: 'Neurology', department: 'Neurology', qualification: 'MD, PhD', experience: 12, phone: '555-3002', email: 'k.mensah@citycare.example', fees: 140, availableDays: ['Mon', 'Wed', 'Fri'], hours: '10:00-18:00', available: true, joined: '2019-06-01' },
  { id: 'D-003', name: 'Dr. Elena Petrova', specialization: 'Pediatrics', department: 'Pediatrics', qualification: 'MBBS, DCH', experience: 9, phone: '555-3003', email: 'e.petrova@citycare.example', fees: 90, availableDays: ['Tue', 'Thu', 'Sat'], hours: '8:00-14:00', available: true, joined: '2020-01-20' },
  { id: 'D-004', name: 'Dr. Liam Okafor', specialization: 'Orthopedics', department: 'Orthopedics', qualification: 'MS (Ortho)', experience: 18, phone: '555-3004', email: 'l.okafor@citycare.example', fees: 150, availableDays: ['Mon', 'Tue', 'Fri'], hours: '9:00-17:00', available: false, joined: '2016-09-15' }
];

async function seedDoctorsIfEmpty() {
  // Only seed after departments exist so doctor.department names resolve.
  try {
    const count = await Doctor.estimatedDocumentCount();
    if (count === 0) await Doctor.insertMany(SEED_DOCTORS);
  } catch (err) {
    console.error('Doctor seed skipped (not connected):', String(err && err.message || 'error').slice(0, 120));
  }
}

module.exports = { router, Doctor, seedDoctorsIfEmpty };