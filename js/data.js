/* =========================================================
   data.js - LocalStorage data layer + seed data
   All CRUD operations and data persistence live here.
   ========================================================= */

const Store = {
  keys: {
    patients: 'hc_patients',
    doctors: 'hc_doctors',
    appointments: 'hc_appointments',
    bills: 'hc_bills',
    departments: 'hc_departments',
    staff: 'hc_staff',
    records: 'hc_records',
    pharmacy: 'hc_pharmacy',
    lab: 'hc_lab',
    settings: 'hc_settings',
    auth: 'hc_auth',
    contact: 'hc_contact'
  },

  read(key, fallback) {
    try {
      const raw = localStorage.getItem(this.keys[key]);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  write(key, value) {
    localStorage.setItem(this.keys[key], JSON.stringify(value));
  },

  getAll(key) {
    return this.read(key, []);
  },

  getById(key, id) {
    return this.read(key, []).find((item) => String(item.id) === String(id)) || null;
  },

  add(key, item) {
    const list = this.read(key, []);
    list.push(item);
    this.write(key, list);
    return item;
  },

  update(key, id, patch) {
    const list = this.read(key, []);
    const idx = list.findIndex((item) => String(item.id) === String(id));
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    this.write(key, list);
    return list[idx];
  },

  remove(key, id) {
    const list = this.read(key, []).filter((item) => String(item.id) !== String(id));
    this.write(key, list);
  }
};

/* ---------- ID generators ---------- */

function genId(prefix, key, pad) {
  const count = Store.getAll(key).length + 1;
  return prefix + String(count).padStart(pad, '0');
}

function genPatientId() { return genId('P-', 'patients', 3); }
function genDoctorId() { return genId('D-', 'doctors', 3); }
function genAppointmentId() { return genId('AP-', 'appointments', 3); }
function genBillNumber() { return genId('INV-', 'bills', 4); }
function genDepartmentId() { return genId('DEP-', 'departments', 3); }
function genStaffId() { return genId('STF-', 'staff', 3); }
function genRecordId() { return genId('REC-', 'records', 4); }
function genMedicineId() { return genId('MED-', 'pharmacy', 3); }
function genLabTestId() { return genId('LAB-', 'lab', 3); }
function genMessageId() { return genId('MSG-', 'contact', 4); }

/* ---------- Formatters ---------- */

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function formatCurrency(amount) {
  return '$' + Number(amount || 0).toFixed(2);
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch (e) { return iso; }
}

function ageFromDOB(dobISO) {
  if (!dobISO) return '';
  const dob = new Date(dobISO + 'T00:00:00');
  let age = new Date().getFullYear() - dob.getFullYear();
  const m = new Date().getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && new Date().getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}

/* ---------- Auth (profile store only — no client-side authentication) ----------
   Admin authentication is handled entirely server-side: bcrypt password hash in
   the server env + httpOnly session cookie. There is NO client-side password
   hash, verify function, or demo credential. The local store is used only to
   read/update the admin display name on the Settings page, never to log in. */

const Auth = {
  /* Profile fallback for the Admin Profile display. This is NOT authentication:
     the real admin login is validated server-side only (bcrypt + httpOnly
     session), and no demo credential is seeded into LocalStorage. There is no
     client-side password hash or verify path. */
  defaults: { username: 'admin', name: 'Dr. Amina Yusuf', role: 'admin' },

  get() { return Store.read('auth', null); },
  update(patch) { Store.write('auth', { ...(this.get() || this.defaults), ...patch }); },
  changePassword() {
    // Obsolete: admin passwords are managed server-side (bcrypt ADMIN_PASSWORD_HASH
    // in the server environment). There is no stored client password to change,
    // so client-side "change password" always reports failure - it can never
    // replace the server credential.
    return false;
  }
};

/* ---------- Settings ---------- */

function defaultSettings() {
  return {
    hospitalName: 'CityCare Hospital',
    tagline: 'Care for every life',
    address: '123 Health Avenue, Springfield',
    city: 'Springfield, IL 62704',
    phone: '+1 (217) 555-0130',
    email: 'contact@citycare.example',
    emergencyPhone: '+1 (217) 555-0199',
    appointmentPhone: '+1 (217) 555-0140',
    hoursWeek: 'Mon - Fri: 8:00 AM - 8:00 PM',
    hoursSat: 'Saturday: 9:00 AM - 5:00 PM',
    hoursSun: 'Sunday & Emergency: 24 Hours',
    emergency: 'Dial 911 or call the emergency line 24/7',
    mapEmbed: 'https://www.google.com/maps?q=Springfield,Illinois&output=embed',
    socials: {
      facebook: 'https://facebook.com/citycarehospital',
      twitter: 'https://x.com/citycarehospital',
      instagram: 'https://instagram.com/citycarehospital',
      linkedin: 'https://linkedin.com/company/citycare-hospital',
      whatsapp: '+1 (217) 555-0130'
    },
    theme: 'light'
  };
}

function getSettings() {
  const s = Store.getAll('settings');
  return s && s.hospitalName ? s : defaultSettings();
}

/* =========================================================
   SEED / DEMO DATA (first-run only)
   ========================================================= */

const SEED_DEPARTMENTS = [
  { id: 'DEP-001', name: 'Cardiology', head: 'Dr. Safia Rahman', phone: '555-1001' },
  { id: 'DEP-002', name: 'Neurology', head: 'Dr. Kwame Mensah', phone: '555-1002' },
  { id: 'DEP-003', name: 'Orthopedics', head: 'Dr. Liam Okafor', phone: '555-1003' },
  { id: 'DEP-004', name: 'Pediatrics', head: 'Dr. Elena Petrova', phone: '555-1004' },
  { id: 'DEP-005', name: 'Dermatology', head: 'Dr. Aisha Noor', phone: '555-1005' },
  { id: 'DEP-006', name: 'General Medicine', head: 'Dr. Bruno Silva', phone: '555-1006' },
  { id: 'DEP-007', name: 'Emergency', head: 'Dr. Marcus Chen', phone: '555-1007' }
];

const SEED_PATIENTS = [
  { id: 'P-001', name: 'Amara Osei', age: 41, dob: '1984-06-12', gender: 'Female', phone: '555-2010', email: 'amara.osei@mail.com', address: '42 Maple Street, Springfield', bloodGroup: 'O+', emergencyName: 'Kofi Osei', emergencyPhone: '555-2090', createdAt: '2025-10-04' },
  { id: 'P-002', name: 'Diego Alvarez', age: 27, dob: '1998-03-30', gender: 'Male', phone: '555-2011', email: 'diego.alv@mail.com', address: '8 Cedar Lane, Springfield', bloodGroup: 'A-', emergencyName: 'Lucia Alvarez', emergencyPhone: '555-2091', createdAt: '2025-11-12' },
  { id: 'P-003', name: 'Meera Krishnan', age: 58, dob: '1967-09-02', gender: 'Female', phone: '555-2012', email: 'meera.k@mail.com', address: '19 Birch Avenue, Springfield', bloodGroup: 'B+', emergencyName: 'Ravi Krishnan', emergencyPhone: '555-2092', createdAt: '2025-11-28' },
  { id: 'P-004', name: 'Tomás Ferreira', age: 9, dob: '2016-05-21', gender: 'Male', phone: '555-2013', email: 'tomas.f@mail.com', address: '77 Willow Road, Springfield', bloodGroup: 'AB+', emergencyName: 'Sofia Ferreira', emergencyPhone: '555-2093', createdAt: '2025-12-05' },
  { id: 'P-005', name: 'Hana Yoshida', age: 34, dob: '1991-01-15', gender: 'Female', phone: '555-2014', email: 'hana.y@mail.com', address: '5 Oak Court, Springfield', bloodGroup: 'O-', emergencyName: 'Ken Yoshida', emergencyPhone: '555-2094', createdAt: '2026-01-08' },
  { id: 'P-006', name: 'Samuel Otuo', age: 63, dob: '1962-07-19', gender: 'Male', phone: '555-2015', email: 'sam.otuo@mail.com', address: '120 River Street, Springfield', bloodGroup: 'A+', emergencyName: 'Grace Otuo', emergencyPhone: '555-2095', createdAt: '2026-01-20' }
];

const SEED_DOCTORS = [
  { id: 'D-001', name: 'Dr. Safia Rahman', specialization: 'Cardiology', department: 'Cardiology', qualification: 'MD, FACC', experience: 15, phone: '555-3001', email: 's.rahman@citycare.example', fees: 120, availableDays: ['Mon', 'Tue', 'Wed', 'Thu'], hours: '9:00-17:00', available: true, joined: '2018-03-12' },
  { id: 'D-002', name: 'Dr. Kwame Mensah', specialization: 'Neurology', department: 'Neurology', qualification: 'MD, PhD', experience: 12, phone: '555-3002', email: 'k.mensah@citycare.example', fees: 140, availableDays: ['Mon', 'Wed', 'Fri'], hours: '10:00-18:00', available: true, joined: '2019-06-01' },
  { id: 'D-003', name: 'Dr. Elena Petrova', specialization: 'Pediatrics', department: 'Pediatrics', qualification: 'MBBS, DCH', experience: 9, phone: '555-3003', email: 'e.petrova@citycare.example', fees: 90, availableDays: ['Tue', 'Thu', 'Sat'], hours: '8:00-14:00', available: true, joined: '2020-01-20' },
  { id: 'D-004', name: 'Dr. Liam Okafor', specialization: 'Orthopedics', department: 'Orthopedics', qualification: 'MS (Ortho)', experience: 18, phone: '555-3004', email: 'l.okafor@citycare.example', fees: 150, availableDays: ['Mon', 'Tue', 'Fri'], hours: '9:00-17:00', available: false, joined: '2016-09-15' }
];

const SEED_PHARMACY = [
  { id: 'MED-001', name: 'Paracetamol 500mg', category: 'Analgesic', manufacturer: 'CignaMed', price: 3.5, stock: 240, expiry: '2027-05-01', lowStock: 50 },
  { id: 'MED-002', name: 'Amoxicillin 250mg', category: 'Antibiotic', manufacturer: 'NordPharma', price: 8.25, stock: 120, expiry: '2026-11-20', lowStock: 30 },
  { id: 'MED-003', name: 'Insulin Glargine 100U', category: 'Endocrine', manufacturer: 'LifeWell', price: 42.0, stock: 18, expiry: '2026-08-15', lowStock: 25 },
  { id: 'MED-004', name: 'Vitamin D3 2000IU', category: 'Supplement', manufacturer: 'WellSpring', price: 6.75, stock: 320, expiry: '2027-12-01', lowStock: 60 },
  { id: 'MED-005', name: 'Cetirizine 10mg', category: 'Antihistamine', manufacturer: 'AllerGo', price: 4.1, stock: 15, expiry: '2026-09-10', lowStock: 40 }
];

const SEED_LAB = [
  { id: 'LAB-001', name: 'Complete Blood Count', patientId: 'P-001', doctorId: 'D-001', charges: 45, date: '2026-01-22', status: 'completed', result: 'Within normal limits. WBC 6.2k/uL' },
  { id: 'LAB-002', name: 'Blood Glucose', patientId: 'P-003', doctorId: 'D-002', charges: 30, date: '2026-02-01', status: 'completed', result: 'Fasting glucose 128 mg/dL (elevated)' },
  { id: 'LAB-003', name: 'Lipid Panel', patientId: 'P-005', doctorId: 'D-002', charges: 55, date: '2026-02-10', status: 'pending', result: '' }
];

const SEED_STAFF = [
  { id: 'STF-001', name: 'Grace Wanjiru', designation: 'Head Nurse', department: 'Nursing', phone: '555-4001', email: 'g.wanjiru@citycare.example', salary: 3200, joining: '2019-04-01', status: 'active' },
  { id: 'STF-002', name: 'Peter Novak', designation: 'Lab Technician', department: 'Laboratory', phone: '555-4002', email: 'p.novak@citycare.example', salary: 2750, joining: '2021-08-16', status: 'active' },
  { id: 'STF-003', name: 'Ines Duarte', designation: 'Pharmacist', department: 'Pharmacy', phone: '555-4003', email: 'i.duarte@citycare.example', salary: 2900, joining: '2020-02-10', status: 'active' },
  { id: 'STF-004', name: 'Raymond Ali', designation: 'Receptionist', department: 'Front Desk', phone: '555-4004', email: 'r.ali@citycare.example', salary: 2100, joining: '2022-11-30', status: 'on-leave' }
];

const SEED_APPOINTMENTS = [
  { id: 'AP-001', patientId: 'P-001', doctorId: 'D-001', department: 'Cardiology', date: todayISO(), time: '09:30', type: 'Consultation', reason: 'Annual cardiac check-up', status: 'confirmed', createdAt: '2026-02-05' },
  { id: 'AP-002', patientId: 'P-003', doctorId: 'D-002', department: 'Neurology', date: todayISO(), time: '11:00', type: 'Follow-up', reason: 'Migraine follow-up', status: 'pending', createdAt: '2026-02-06' },
  { id: 'AP-003', patientId: 'P-002', doctorId: 'D-003', department: 'Pediatrics', date: '2026-03-02', time: '10:15', type: 'Consultation', reason: 'Vaccination schedule', status: 'confirmed', createdAt: '2026-02-01' }
];

const SEED_BILLS = [
  { id: 'bill-seed-1', number: 'INV-0001', patientId: 'P-001', patientName: 'Amara Osei', date: todayISO(), items: [{ desc: 'Consultation Fee', amount: 120 }, { desc: 'Laboratory Charges', amount: 45 }, { desc: 'Medication Charges', amount: 22 }], subtotal: 187, discount: 10, tax: 12.41, total: 189.41, paid: 189.41, balance: 0, status: 'paid', method: 'Card', createdAt: todayISO() },
  { id: 'bill-seed-2', number: 'INV-0002', patientId: 'P-003', patientName: 'Meera Krishnan', date: todayISO(), items: [{ desc: 'Consultation Fee', amount: 140 }, { desc: 'Laboratory Charges', amount: 30 }], subtotal: 170, discount: 0, tax: 11.9, total: 181.9, paid: 100, balance: 81.9, status: 'partial', method: 'Cash', createdAt: todayISO() }
];

const SEED_RECORDS = [
  { id: 'REC-0001', patientId: 'P-001', doctorId: 'D-001', date: '2026-01-22', diagnosis: 'Mild hypertension', symptoms: 'Headache, fatigue', treatment: 'Lifestyle changes, medication review', prescription: 'Amlodipine 5mg once daily', notes: 'Recheck blood pressure in 8 weeks.', followUp: '2026-03-12' },
  { id: 'REC-0002', patientId: 'P-003', doctorId: 'D-002', date: '2026-01-15', diagnosis: 'Chronic migraine', symptoms: 'Throbbing headache, sensitivity to light', treatment: 'Prescribed triptan therapy', prescription: 'Sumatriptan 50mg at onset', notes: 'Avoid known triggers.', followUp: '2026-03-05' },
  { id: 'REC-0003', patientId: 'P-005', doctorId: 'D-002', date: '2026-02-10', diagnosis: 'Type 2 diabetes (new)', symptoms: 'Increased thirst, frequent urination', treatment: 'Metformin therapy, dietary plan', prescription: 'Metformin 500mg twice daily', notes: 'Refer to nutritionist.', followUp: '2026-04-02' }
];

const SEED_CONTACT = [
  { id: 'MSG-0001', name: 'Olivia Bennett', email: 'olivia.bennett@mail.com', phone: '555-7100', subject: 'Billing question', message: 'Hello, I would like to ask about the payment options available for my recent treatment bill. Thank you.', date: '2026-02-08', time: '10:24', status: 'read' },
  { id: 'MSG-0002', name: 'James Carter', email: 'james.carter@mail.com', phone: '555-7101', subject: 'Appointment reschedule', message: 'I need to reschedule my appointment with Dr. Safia Rahman next Tuesday if possible. Please let me know what times are open.', date: '2026-02-09', time: '14:05', status: 'new' }
];

function seedIfEmpty() {
  // departments, doctors, patients, pharmacy, lab, staff are seeded only if empty so
  // existing user data is preserved on upgrade.
  const table = {
    departments: SEED_DEPARTMENTS,
    doctors: SEED_DOCTORS,
    patients: SEED_PATIENTS,
    pharmacy: SEED_PHARMACY,
    lab: SEED_LAB,
    staff: SEED_STAFF,
    appointments: SEED_APPOINTMENTS,
    bills: SEED_BILLS,
    records: SEED_RECORDS,
    contact: SEED_CONTACT
  };
  Object.keys(table).forEach((key) => {
    if (Store.getAll(key).length === 0) {
      table[key].forEach((row) => Store.add(key, row));
    }
  });
  // NOTE: Auth demo credentials are intentionally NOT seeded. Admin auth is
  // server-side only (bcrypt + httpOnly session); there is no local fallback.
  if (!Store.read('settings', null)) Store.write('settings', defaultSettings());
}