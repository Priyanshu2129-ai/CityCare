/* =========================================================
   patient.js - Patients module (MongoDB)
   Mongoose schema + model + authenticated Express router for
   patient CRUD proxied from the frontend. Uses only fictional
   demo data. No secrets are logged or exposed.
   ========================================================= */

const express = require('express');
const mongoose = require('mongoose');
const { requireAdmin, csrfGuard } = require('./auth');

const router = express.Router();

/* ---- Mongoose schema (mirrors the existing LocalStorage patient fields) ---- */
const patientSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true }, // e.g. P-007
    name: { type: String, required: true, trim: true },
    dob: { type: String, required: true }, // YYYY-MM-DD
    gender: { type: String, required: true, enum: ['Female', 'Male', 'Other'] },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    bloodGroup: { type: String, default: '' },
    medicalHistory: { type: String, default: '' },
    allergies: { type: String, default: '' },
    emergencyName: { type: String, default: '' },
    emergencyPhone: { type: String, default: '' },
    age: { type: Number, default: 0 },
    createdAt: { type: String, default: '' }
  },
  { collection: 'patients' }
);

// Expose _id as id-ish but keep our business id field as the primary key too.
patientSchema.set('toJSON', { versionKey: false });

const Patient = mongoose.model('Patient', patientSchema);

/* ---- Input validation helpers ---- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;
const GENDERS = ['Female', 'Male', 'Other'];

function computeAge(dob) {
  if (!DOB_RE.test(dob || '')) return 0;
  const b = new Date(dob + 'T00:00:00');
  let a = new Date().getFullYear() - b.getFullYear();
  const m = new Date().getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && new Date().getDate() < b.getDate())) a--;
  return Math.max(0, a);
}

// Validate a patient payload; returns { ok, errors }.
function validatePatient(body) {
  const t = (v) => String(v == null ? '' : v).trim();
  const errors = {};
  const d = {
    name: t(body.name),
    dob: t(body.dob),
    gender: t(body.gender),
    phone: t(body.phone),
    email: t(body.email),
    address: t(body.address),
    bloodGroup: t(body.bloodGroup),
    medicalHistory: t(body.medicalHistory),
    allergies: t(body.allergies),
    emergencyName: t(body.emergencyName),
    emergencyPhone: t(body.emergencyPhone)
  };

  if (d.name.length < 2) errors.name = 'Full name is required (min 2 characters).';
  if (!DOB_RE.test(d.dob)) errors.dob = 'Select a valid date of birth.';
  if (!GENDERS.includes(d.gender)) errors.gender = 'Please select a gender.';
  if (d.phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a valid phone number (min 7 digits).';
  if (d.email && !EMAIL_RE.test(d.email)) errors.email = 'Enter a valid email address.';

  return { ok: Object.keys(errors).length === 0, errors, data: d };
}

function nextPatientId() {
  // P-### based on how many patients exist (matches the LocalStorage generator).
  return 'P-' + String((Date.now() % 10000)).padStart(3, '0');
}

/* ---- Fictional demo patients (same data as the LocalStorage seed) ---- */
const DEMO_PATIENTS = [
  { id: 'P-001', name: 'Amara Osei', age: 41, dob: '1984-06-12', gender: 'Female', phone: '555-2010', email: 'amara.osei@mail.com', address: '42 Maple Street, Springfield', bloodGroup: 'O+', emergencyName: 'Kofi Osei', emergencyPhone: '555-2090', medicalHistory: '', allergies: '', createdAt: '2025-10-04' },
  { id: 'P-002', name: 'Diego Alvarez', age: 27, dob: '1998-03-30', gender: 'Male', phone: '555-2011', email: 'diego.alv@mail.com', address: '8 Cedar Lane, Springfield', bloodGroup: 'A-', emergencyName: 'Lucia Alvarez', emergencyPhone: '555-2091', medicalHistory: '', allergies: 'Penicillin', createdAt: '2025-11-12' },
  { id: 'P-003', name: 'Meera Krishnan', age: 58, dob: '1967-09-02', gender: 'Female', phone: '555-2012', email: 'meera.k@mail.com', address: '19 Birch Avenue, Springfield', bloodGroup: 'B+', emergencyName: 'Ravi Krishnan', emergencyPhone: '555-2092', medicalHistory: 'Type 2 diabetes (managed)', allergies: '', createdAt: '2025-11-28' },
  { id: 'P-004', name: 'Tomás Ferreira', age: 9, dob: '2016-05-21', gender: 'Male', phone: '555-2013', email: 'tomas.f@mail.com', address: '77 Willow Road, Springfield', bloodGroup: 'AB+', emergencyName: 'Sofia Ferreira', emergencyPhone: '555-2093', medicalHistory: '', allergies: '', createdAt: '2025-12-05' },
  { id: 'P-005', name: 'Hana Yoshida', age: 34, dob: '1991-01-15', gender: 'Female', phone: '555-2014', email: 'hana.y@mail.com', address: '5 Oak Court, Springfield', bloodGroup: 'O-', emergencyName: 'Ken Yoshida', emergencyPhone: '555-2094', medicalHistory: '', allergies: 'Sulfa drugs', createdAt: '2026-01-08' },
  { id: 'P-006', name: 'Samuel Otuo', age: 63, dob: '1962-07-19', gender: 'Male', phone: '555-2015', email: 'sam.otuo@mail.com', address: '120 River Street, Springfield', bloodGroup: 'A+', emergencyName: 'Grace Otuo', emergencyPhone: '555-2095', medicalHistory: 'Hypertension', allergies: '', createdAt: '2026-01-20' }
];

// Seed the demo patients if the collection is empty. Called after a successful
// MongoDB connection so the Patients page has fictional data to show.
async function seedPatientsIfEmpty() {
  try {
    const count = await Patient.estimatedDocumentCount();
    if (count === 0) await Patient.insertMany(DEMO_PATIENTS.map((p) => ({ ...p, age: p.age })));
  } catch (err) {
    console.error('Patient seed skipped (not connected):', err.message);
  }
}

/* ---- Routes ---- */

// GET all patients
router.get('/', requireAdmin, async (req, res) => {
  try {
    const patients = await Patient.find().sort({ createdAt: -1, _id: -1 }).lean();
    res.json({ ok: true, count: patients.length, patients });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not load patients from the database.' });
  }
});

// GET one patient by business id (or Mongo _id)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    let p = await Patient.findOne({ id }).lean();
    if (!p && mongoose.isValidObjectId(id)) p = await Patient.findById(id).lean();
    if (!p) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Patient not found.' });
    res.json({ ok: true, patient: p });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not load the patient.' });
  }
});

// POST new patient
router.post('/', requireAdmin, csrfGuard, async (req, res) => {
  const v = validatePatient(req.body || {});
  if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
  try {
    const existing = await Patient.findOne({ id: req.body.id }).lean();
    if (existing && existing._id) {
      return res.status(409).json({ ok: false, error: 'DUPLICATE_ID', message: 'A patient with this ID already exists.' });
    }
    const doc = await Patient.create({
      ...v.data,
      id: String(req.body.id || '').trim() || nextPatientId(),
      age: computeAge(v.data.dob),
      createdAt: String(v.data.createdAt || new Date().toISOString().slice(0, 10))
    });
    res.status(201).json({ ok: true, patient: doc.toJSON() });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not create the patient.' });
  }
});

// PUT update patient by business id
router.put('/:id', requireAdmin, csrfGuard, async (req, res) => {
  const v = validatePatient(req.body || {});
  if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
  try {
    const found = await Patient.findOne({ id: String(req.params.id) });
    if (!found) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Patient not found.' });
    found.set({ ...v.data, age: computeAge(v.data.dob) });
    await found.save();
    res.json({ ok: true, patient: found.toJSON() });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not update the patient.' });
  }
});

// DELETE patient by business id
router.delete('/:id', requireAdmin, csrfGuard, async (req, res) => {
  try {
    const p = await Patient.findOneAndDelete({ id: String(req.params.id) });
    if (!p) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Patient not found.' });
    res.json({ ok: true, message: 'Patient deleted.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB_ERROR', message: 'Could not delete the patient.' });
  }
});

module.exports = { router, Patient, seedPatientsIfEmpty };