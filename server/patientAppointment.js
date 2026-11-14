/* =========================================================
   patientAppointment.js - Patient Portal appointments.
   Patients book appointments against doctors; ONLY their own are
   returned/modifiable (ownership enforced server-side). Admins
   list all and update status (Pending/Approved/Rejected/Completed).
   Stored in MongoDB (never LocalStorage).
   ========================================================= */

const express = require('express');
const mongoose = require('mongoose');
const { requireAdmin, csrfGuard, requireLogin } = require('./auth');
const { requirePatient } = require('./patientAccount');

const router = express.Router();

/* ---- Appointment model ---- */
const patientApptSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true }, // PA-###
    patientAccountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    patientName: { type: String, default: '' },
    doctorId: { type: String, required: true },          // Doctor.id (P-### style)
    doctorName: { type: String, default: '' },
    department: { type: String, default: '' },
    date: { type: String, required: true },              // YYYY-MM-DD
    time: { type: String, required: true },              // HH:MM
    reason: { type: String, default: '' },
    status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected', 'completed'] },
    createdAt: { type: Date, default: Date.now }
  },
  { collection: 'patientAppointments' }
);
patientApptSchema.set('toJSON', { versionKey: false, transform: (d, r) => { delete r._id; return r; } });
const PatientAppointment = mongoose.model('PatientAppointment', patientApptSchema);

function nextApptId() {
  return 'PA-' + String(Date.now() % 1000000).padStart(6, '0');
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// Friendly doctor name fallback (LocalStorage doctors live on the frontend; the
// API receives the doctorId the patient picked from the public doctor list).
function doctorLabel(body) {
  return String(body && body.doctorName || 'Doctor').trim();
}

/* ---- POST /api/patient/appointments  (patient, ownership-scoped)
   body: { doctorId, doctorName, department, date, time, reason } ---- */
router.post('/appointments', csrfGuard, requirePatient, async (req, res) => {
  const body = req.body || {};
  const date = String(body.date || '').trim();
  const time = String(body.time || '').trim();
  const doctorId = String(body.doctorId || '').trim();
  const reason = String(body.reason || '').trim();

  const errors = {};
  if (!doctorId) errors.doctorId = 'Select a doctor.';
  if (!DATE_RE.test(date)) errors.date = 'Select a valid date.';
  if (!TIME_RE.test(time)) errors.time = 'Select a valid time.';
  if (reason.length > 0 && reason.length < 3) errors.reason = 'Reason must be at least 3 characters.';
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });

  // Ownership is derived from the SESSION (req.patient.patientAccountId), never
  // from the client. A patient cannot create an appointment for anyone else.
  const rec = {
    id: nextApptId(),
    patientAccountId: req.patient.patientAccountId,
    patientName: req.patient.name || '',
    doctorId,
    doctorName: doctorLabel(body),
    department: String(body.department || '').trim(),
    date,
    time,
    reason,
    status: 'pending'
  };
  try {
    const created = await PatientAppointment.create(rec);
    return res.status(201).json({ ok: true, appointment: created });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'DUPLICATE', message: 'That appointment was already created.' });
    }
    console.error('[patient-appt] create error:', String(err && err.message || 'error').slice(0, 120));
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Could not book the appointment. Please try again.' });
  }
});

/* ---- GET /api/patient/appointments  (patient -> ONLY their own) ---- */
router.get('/appointments', requirePatient, async (req, res) => {
  try {
    const list = await PatientAppointment.find({ patientAccountId: req.patient.patientAccountId }).sort({ createdAt: -1 }).lean();
    return res.json({ ok: true, count: list.length, appointments: list });
  } catch (err) {
    console.error('[patient-appt] list error:', String(err && err.message || 'error').slice(0, 120));
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Could not load appointments.' });
  }
});

/* ---- GET /api/patient/appointments/:id  (patient -> ownership checked) ---- */
router.get('/appointments/:id', requirePatient, async (req, res) => {
  try {
    const a = await PatientAppointment.findOne({ id: req.params.id, patientAccountId: req.patient.patientAccountId }).lean();
    if (!a) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Appointment not found.' });
    return res.json({ ok: true, appointment: a });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Could not load appointment.' });
  }
});

/* ---- POST /api/patient/appointments/:id/cancel  (patient, ownership) ---- */
router.post('/appointments/:id/cancel', csrfGuard, requirePatient, async (req, res) => {
  try {
    const a = await PatientAppointment.findOneAndUpdate(
      { id: req.params.id, patientAccountId: req.patient.patientAccountId, status: { $nin: ['completed'] } },
      { status: 'rejected' },
      { new: true }
    );
    if (!a) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Appointment not found or cannot be cancelled.' });
    return res.json({ ok: true, appointment: a });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Could not cancel the appointment.' });
  }
});

/* ---- ADMIN: list all patient appointment requests ---- */
router.get('/admin/appointments', requireAdmin, async (req, res) => {
  try {
    const list = await PatientAppointment.find().sort({ createdAt: -1 }).lean();
    return res.json({ ok: true, count: list.length, appointments: list });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Could not load appointments.' });
  }
});

/* ---- ADMIN: update appointment status ---- */
router.patch('/admin/appointments/:id', csrfGuard, requireAdmin, async (req, res) => {
  const status = String(req.body && req.body.status || '').trim();
  const allowed = ['pending', 'approved', 'rejected', 'completed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ ok: false, error: 'INVALID_STATUS', message: 'Status must be one of: ' + allowed.join(', ') });
  }
  try {
    const a = await PatientAppointment.findOneAndUpdate({ id: req.params.id }, { status }, { new: true });
    if (!a) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Appointment not found.' });
    return res.json({ ok: true, appointment: a });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Could not update the appointment.' });
  }
});

module.exports = { router, PatientAppointment };