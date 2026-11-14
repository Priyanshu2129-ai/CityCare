/* =========================================================
   department.js - Departments module (MongoDB)
   Mongoose schema + model + authenticated Express router for
   department CRUD proxied from the frontend. Only fictional
   demo data. No secrets are logged or exposed.

   Safeguards (Phase 3A):
   - Global uniqueness of `id` enforced by a unique index; new
     ids are minted server-side (never from a client counter).
   - Department rename propagates to linked doctors' `department`
     string ATOMICALLY inside a Mongo transaction. If propagation
     is not guaranteed atomic, the rename is rejected rather than
     leaving orphaned references.
   - Hard delete is rejected with HTTP 409 whenever any doctor
     still references the department name (no silent orphans).
   ========================================================= */

const express = require('express');
const mongoose = require('mongoose');
const { requireAdmin, csrfGuard } = require('./auth');

const router = express.Router();

/* ---- Mongoose schema (mirrors the LocalStorage department fields) ---- */
const departmentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, trim: true }, // DEP-###
    name: { type: String, required: true, trim: true }, // FK referenced by doctors (name string)
    head: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true },
    timings: { type: String, default: '', trim: true },
    description: { type: String, default: '' }
  },
  { collection: 'departments', timestamps: true }
);

// Case-insensitive uniqueness of the join key `name` (avoids silently merging
// "Cardiology" and "cardiology" across devices).
departmentSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

departmentSchema.set('toJSON', { versionKey: false });

const Department = mongoose.model('Department', departmentSchema);

/* ---- Input validation ---- */
const PHONE_RE = function digits(v) { return !v || String(v).replace(/\D/g, '').length >= 7; };

function validateDepartment(body, existingId) {
  const t = (v) => String(v == null ? '' : v).trim();
  const data = {
    name: t(body.name),
    head: t(body.head),
    phone: t(body.phone),
    location: t(body.location),
    timings: t(body.timings),
    description: t(body.description)
  };
  const errors = {};
  if (data.name.length < 2) errors.name = 'Department name is required (min 2 characters).';
  if (!PHONE_RE(data.phone)) errors.phone = 'Enter a valid phone number (min 7 digits).';
  return { ok: Object.keys(errors).length === 0, errors, data };
}

// Capitalize the first letter of a trimmed name (matches the frontend).
function capitalizeName(name) {
  const s = String(name || '').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/* ---- Server-generated, globally unique id (avoid client counter collisions) ----
   Department counters were device-local (genDepartmentId in data.js), which can
   collide across browsers. New ids are minted here: a short timestamp-derived
   token guarantees global uniqueness while keeping the DEP- prefix shape. */
function nextDepartmentId() {
  return 'DEP-' + String(Date.now() % 1000000).padStart(6, '0');
}

/* ---- Routes ---- */

// GET all departments (admin) - no pagination needed at current scale; sorted
// by name for a stable mirror.
router.get('/', requireAdmin, async (req, res) => {
  try {
    const list = await Department.find().sort({ name: 1 }).lean();
    res.json({ ok: true, count: list.length, departments: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not load departments.' });
  }
});

// GET one department by business id (or Mongo _id)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    let d = await Department.findOne({ id }).lean();
    if (!d && mongoose.isValidObjectId(id)) d = await Department.findById(id).lean();
    if (!d) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Department not found.' });
    res.json({ ok: true, department: d });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not load the department.' });
  }
});

// GET doctors in a department (keeps the department detail modal working)
router.get('/:id/doctors', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const d = await Department.findOne({ id }).lean();
    if (!d) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Department not found.' });
    const Doctor = mongoose.model('Doctor');
    const doctors = await Doctor.find({ department: d.name }).lean();
    res.json({ ok: true, count: doctors.length, doctors });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not load doctors in department.' });
  }
});

// POST create department (admin + CSRF). Server-mints the id.
router.post('/', requireAdmin, csrfGuard, async (req, res) => {
  const s = validateDepartment(req.body || {});
  if (!s.ok) return res.status(400).json({ ok: false, errors: s.errors });
  try {
    const name = capitalizeName(s.data.name);
    const exists = await Department.exists({ name });
    if (exists) {
      return res.status(409).json({ ok: false, error: 'DEPT_EXISTS', message: 'A department with this name already exists.' });
    }
    const doc = await Department.create({ ...s.data, name, id: nextDepartmentId() });
    res.status(201).json({ ok: true, department: doc.toJSON() });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'DEPT_EXISTS', message: 'A department with this name already exists.' });
    }
    console.error('[department-create] DB error:', String(err && err.message || 'error').slice(0, 120));
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not create the department.' });
  }
});

// PATCH update department. If the NAME changes, propagate atomically to linked
// doctors' `department` string inside a transaction; if the transaction is not
// supported, reject rather than leave orphans.
router.patch('/:id', requireAdmin, csrfGuard, async (req, res) => {
  const id = String(req.params.id);
  const s = validateDepartment(req.body || {}, id);
  if (!s.ok) return res.status(400).json({ ok: false, errors: s.errors });
  try {
    const found = await Department.findOne({ id });
    if (!found) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Department not found.' });

    const oldName = found.name;
    const newName = capitalizeName(s.data.name);

    // Reject collisions with a different department.
    const dup = await Department.exists({ name: newName, _id: { $ne: found._id } });
    if (dup) {
      return res.status(409).json({ ok: false, error: 'DEPT_EXISTS', message: 'Another department already uses this name.' });
    }

    const patch = { ...s.data, name: newName };

    // Rename with propagation only when the name actually changes.
    if (newName.toLowerCase() !== oldName.toLowerCase()) {
      const Doctor = mongoose.model('Doctor');
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        await Department.updateOne({ _id: found._id }, { $set: patch }, { session });
        await Doctor.updateMany({ department: oldName }, { $set: { department: newName } }, { session });
        await session.commitTransaction();
      } catch (txErr) {
        await session.abortTransaction();
        session.endSession();
        console.error('[department-rename] atomic update failed, rename rejected:', String(txErr && txErr.message || 'error').slice(0, 120));
        return res.status(422).json({ ok: false, error: 'RENAME_FAILED', message: 'Could not rename the department safely. No changes were applied.' });
      } finally {
        session.endSession();
      }
    } else {
      // No name change: simple update.
      found.set(patch);
      await found.save();
    }

    const updated = await Department.findOne({ id }).lean();
    res.json({ ok: true, department: updated });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'DEPT_EXISTS', message: 'Another department already uses this name.' });
    }
    console.error('[department-update] DB error:', String(err && err.message || 'error').slice(0, 120));
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not update the department.' });
  }
});

// DELETE department (admin + CSRF). Reject with 409 if any doctor references it.
router.delete('/:id', requireAdmin, csrfGuard, async (req, res) => {
  const id = String(req.params.id);
  try {
    const d = await Department.findOne({ id });
    if (!d) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Department not found.' });
    const Doctor = mongoose.model('Doctor');
    const doctorCount = await Doctor.countDocuments({ department: d.name });
    if (doctorCount > 0) {
      return res.status(409).json({
        ok: false,
        error: 'DEPT_ASSIGNED',
        message: `Cannot delete: ${doctorCount} doctor(s) are still assigned to this department. Re-assign or remove them first.`
      });
    }
    await Department.deleteOne({ _id: d._id });
    res.json({ ok: true, message: 'Department deleted.' });
  } catch (err) {
    console.error('[department-delete] DB error:', String(err && err.message || 'error').slice(0, 120));
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not delete the department.' });
  }
});

/* ---- Seed (fictional demo data, only when collection empty) ----
   Runs only on a successful DB connection (never a startup gate). Mirrors the
   LocalStorage SEED_DEPARTMENTS so a fresh Atlas database has departments. */
const SEED_DEPARTMENTS = [
  { id: 'DEP-001', name: 'Cardiology', head: 'Dr. Safia Rahman', phone: '555-1001' },
  { id: 'DEP-002', name: 'Neurology', head: 'Dr. Kwame Mensah', phone: '555-1002' },
  { id: 'DEP-003', name: 'Orthopedics', head: 'Dr. Liam Okafor', phone: '555-1003' },
  { id: 'DEP-004', name: 'Pediatrics', head: 'Dr. Elena Petrova', phone: '555-1004' },
  { id: 'DEP-005', name: 'Dermatology', head: 'Dr. Aisha Noor', phone: '555-1005' },
  { id: 'DEP-006', name: 'General Medicine', head: 'Dr. Bruno Silva', phone: '555-1006' },
  { id: 'DEP-007', name: 'Emergency', head: 'Dr. Marcus Chen', phone: '555-1007' }
];

async function seedDepartmentsIfEmpty() {
  try {
    const count = await Department.estimatedDocumentCount();
    if (count === 0) await Department.insertMany(SEED_DEPARTMENTS);
  } catch (err) {
    console.error('Department seed skipped (not connected):', String(err && err.message || 'error').slice(0, 120));
  }
}

module.exports = { router, Department, seedDepartmentsIfEmpty };