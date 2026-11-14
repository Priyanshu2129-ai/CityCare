#!/usr/bin/env node
/* =========================================================
   migrate-doctors-depts.js - STANDALONE manual migration CLI for
   Doctors & Departments (LocalStorage exports -> MongoDB).

   SAFETY CONTRACT (Phase 3A):
   - This script NEVER runs automatically. It is invoked by an operator
     explicitly at the shell. It is NOT wired into npm start / dev, NOT
     part of build, and NOT part of deployment.
   - It NEVER writes to patientAppointments, appointments, or any other
     collection. Existing patientAppointments.doctorId / doctorName /
     department values are completely untouched.
   - It upserts ONLY records whose identity is confidently established by
     MULTIPLE consistent fields. Ambiguous or conflicting records are
     quarantined (written to a review file) and never auto-merged or
     overwritten.
   - Import is idempotent (upsert by natural key); re-running does not
     create duplicates.

   USAGE (dry-run first, then --apply):
     node migrate-doctors-depts.js --from ./exports/deviceA/doctors.json ./exports/deviceB/doctors.json \
        --depts ./exports/deviceA/departments.json ./exports/deviceB/departments.json
     node migrate-doctors-depts.js --apply --from ... --depts ...

   Without --apply the script only ANALYZES and prints a plan; nothing is
   written. Never run against live production data without a backup.
   ========================================================= */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.slice(i + 1).filter((a) => !a.startsWith('--')) : [];
};
const fromFiles = flag('--from');
const deptFiles = flag('--depts');

function readJsonFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : (parsed.doctors || parsed.departments || []);
}

/* ---- Identity helpers (multi-field, never phone-only) ---- */
const normS = (v, lower) => { const s = String(v == null ? '' : v).trim(); return lower ? s.toLowerCase() : s; };
const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');

// Two doctor records are the SAME person only if MULTIPLE consistent identity
// fields agree. A phone match alone is NOT proof.
function sameDoctor(a, b) {
  const aPhone = digits(a.phone), bPhone = digits(b.phone);
  const aName = normS(a.name, true), bName = normS(b.name, true);
  const aSpec = normS(a.specialization, true), bSpec = normS(b.specialization, true);
  let score = 0;
  if (aPhone && bPhone && aPhone === bPhone) score++;
  if (aName && bName && aName === bName) score++;
  if (aSpec && bSpec && aSpec === bSpec) score++;
  // Require at least 2 independent fields to agree; and a name by itself must
  // also agree (avoid merging two different present doctors).
  return score >= 2 && aName === bName;
}

function sameDepartment(a, b) {
  // Department natural key is the (case-insensitive) name.
  const aName = normS(a.name, true), bName = normS(b.name, true);
  return !!(aName && bName && aName === bName);
}

function validateDoctor(r) {
  const e = {};
  if (normS(r.name).length < 2) e.name = 'name < 2 chars';
  if (!normS(r.specialization)) e.specialization = 'missing specialization';
  if (!normS(r.department)) e.department = 'missing department';
  if (digits(r.phone).length < 7) e.phone = 'phone < 7 digits';
  return { ok: Object.keys(e).length === 0, errors: e };
}

function validateDepartment(r) {
  const e = {};
  if (normS(r.name).length < 2) e.name = 'name < 2 chars';
  return { ok: Object.keys(e).length === 0, errors: e };
}

/* ---- Grouping with quarantine rules ----
   Two passes are used so that across-device conflicts AND same-id-different-person
   collisions are both caught and quarantined rather than silently merged.

   Pass 1 - identity groups: group by a LOOSE key (name, and phone+specialization
     for doctors) and require every member to be the SAME identity (multi-field
     compare). If two members differ, the whole group is QUARANTINED.

   Pass 2 - id collisions: if two DISTINCT identities share the same `id`,
     quarantine them (they are different people, not duplicates). Never map one
     id to two people.
*/
function groupByNaturalKey(items, keyFn) {
  const groups = new Map();
  for (const it of items) {
    const key = keyFn(it);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  return groups;
}

// LOOSE doctor key: group by NAME ALONE so same-named records from different
// devices land together for conflict detection (two different people sharing a
// name must NOT be silently merged; sameDoctor requires multiple matching
// fields before they count as the same person).
const doctorLooseKey = (r) => normS(r.name, true);
const deptKey = (r) => normS(r.name, true);

function resolveGroups(groups, sameFn, validateFn, isDoctor) {
  const clean = [];      // confident records to upsert
  const quarantine = []; // ambiguous/conflicting -> manual review
  const invalid = [];    // failed validation
  groups.forEach((recs, key) => {
    // All records in a group must be the same identity, or quarantine the group.
    const representative = recs[0];
    for (let i = 1; i < recs.length; i++) {
      if (!sameFn(representative, recs[i])) {
        quarantine.push({ key, records: recs, reason: 'identity conflict between records with the same natural key' });
        return;
      }
    }
    // Merge: last non-empty field wins (only for genuinely identical identities).
    const merged = {};
    recs.forEach((r) => { for (const k of Object.keys(r)) if (r[k] !== undefined && r[k] !== null && r[k] !== '') merged[k] = r[k]; });
    const v = validateFn(merged);
    if (!v.ok) { invalid.push({ key, record: merged, errors: v.errors }); return; }
    clean.push({ record: merged, ids: recs.map((r) => r.id).filter(Boolean) });
  });

  // Pass 2: quarantine any id that maps to two DIFFERENT identities.
  if (isDoctor) {
    const idToRec = new Map(); // id -> {record, key}
    for (const c of clean) {
      for (const id of c.ids) {
        if (idToRec.has(id)) {
          const other = idToRec.get(id);
          if (other.key !== c.key) {
            // Same id, different identity -> quarantine both clean entries.
            quarantine.push({ key: 'id:' + id, reason: `doctor id ${id} is shared by two different doctors`, records: [other.record, c.record] });
            // Mark both for removal (they were just pushed to clean).
            c._dupId = true; other._dupId = true;
          }
        } else {
          idToRec.set(id, { key: c.key, record: c.record });
        }
      }
    }
    return { clean: clean.filter((c) => !c._dupId).map((c) => c.record), quarantine, invalid };
  }

  return { clean: clean.map((c) => c.record), quarantine, invalid };
}

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('ERROR: set MONGODB_URI in server/.env before running this migration.');
    process.exit(1);
  }
  console.log(apply ? 'MODE: APPLY (will write to MongoDB)' : 'MODE: DRY-RUN (analyze only, nothing written)');

  // Load exports. Doctor and department files may be interleaved by device, but
  // dedupe so a file passed to both --from and --depts is read only once.
  const allFiles = [...new Set([...fromFiles, ...deptFiles])];
  const allDoctorRecords = [];
  const allDeptRecords = [];
  for (const f of allFiles) {
    let rows = [];
    try { rows = readJsonFile(f); }
    catch (e) { console.error(`  SKIP file ${f}: ${e.message}`); continue; }
    for (const r of rows) {
      if (r && r.specialization !== undefined && r.name) allDoctorRecords.push(r);
      else if (r && r.name) allDeptRecords.push(r);
    }
  }
  console.log(`Loaded doctors: ${allDoctorRecords.length}, departments: ${allDeptRecords.length}`);

  const doctorGroups = groupByNaturalKey(allDoctorRecords, doctorLooseKey);
  const deptGroups = groupByNaturalKey(allDeptRecords, deptKey);
  const dRes = resolveGroups(doctorGroups, sameDoctor, validateDoctor, true);
  const pRes = resolveGroups(deptGroups, sameDepartment, validateDepartment, false);

  console.log(`\nDOCTORS: ${dRes.clean.length} to upsert, ${dRes.quarantine.length} quarantined, ${dRes.invalid.length} invalid`);
  console.log(`DEPARTMENTS: ${pRes.clean.length} to upsert, ${pRes.quarantine.length} quarantined, ${pRes.invalid.length} invalid`);

  for (const q of dRes.quarantine) console.log(`  [Q] doctor ${q.key}: ${q.reason}`);
  for (const q of pRes.quarantine) console.log(`  [Q] department ${q.key}: ${q.reason}`);
  for (const q of dRes.invalid) console.log(`  [!] invalid doctor ${q.key}: ${JSON.stringify(q.errors)}`);
  for (const q of pRes.invalid) console.log(`  [!] invalid department ${q.key}: ${JSON.stringify(q.errors)}`);

  // Write quarantine review file (always, even in dry-run) so manual review is possible.
  const reportDir = path.join(__dirname, 'data', 'migration');
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { at: stamp, apply, doctors: dRes, departments: pRes };
  const reportPath = path.join(reportDir, `migration-report-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written: ${reportPath}`);

  if (!apply) { console.log('\nDry-run complete. Re-run with --apply to write (after manual review of quarantined/invalid).'); return; }

  // NEVER auto-import if there are quarantined or invalid records without operator
  // sign-off. Require an explicit --force-ambiguous flag.
  const hasUnresolved = dRes.quarantine.length || pRes.quarantine.length || dRes.invalid.length || pRes.invalid.length;
  if (hasUnresolved && !args.includes('--force-ambiguous')) {
    console.error('\nSTOPPED: ambiguous/conflicting/invalid records present. Resolve them in review, then re-run with --force-ambiguous if you intend to import the confident subset anyway.');
    process.exit(2);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const Department = mongoose.models.Department || (await require('./department')).Department;
  const Doctor = mongoose.models.Doctor || (await require('./doctor')).Doctor;

  const serverId = (p, n) => p + '-' + String(Date.now() + Math.floor(Math.random() * 1000) % 1000000).padStart(6, '0');

  // Upsert departments by name (natural key), preserving an existing id when one
  // already exists to keep doctor.department string references stable.
  let deptImported = 0;
  for (const rec of pRes.clean) {
    const existing = await Department.findOne({ name: rec.name }).lean();
    if (existing) { await Department.updateOne({ _id: existing._id }, { $set: rec }); deptImported++; continue; }
    await Department.create({ ...rec, id: rec.id || serverId('DEP', 6) });
    deptImported++;
  }

  // Upsert doctors by natural key; re-map doctorId on APPOINTMENTS is STRICTLY
  // out of scope (patientAppointments untouched), so we rely on doctor `id`
  // preservation when unambiguous and otherwise mint a fresh globally-unique id.
  let docImported = 0;
  const doctorIdMap = {}; // oldId -> newId (for operator review only; NOT applied to appointments)
  for (const rec of dRes.clean) {
    const existing = await Doctor.findOne({
      phone: rec.phone,
      name: rec.name,
      specialization: rec.specialization
    }).lean();
    if (existing) { await Doctor.updateOne({ _id: existing._id }, { $set: rec }); docImported++; continue; }
    const newId = serverId('D', 6);
    if (rec.id && rec.id !== newId) doctorIdMap[rec.id] = newId; // this is a re-key; appointments NOT rewritten
    await Doctor.create({ ...rec, id: rec.id || newId });
    docImported++;
  }

  console.log(`\nImported departments: ${deptImported}, doctors: ${docImported}`);
  if (Object.keys(doctorIdMap).length) {
    console.warn('\nNOTE: some existing doctor ids were not reused (re-keyed).');
    console.warn('The mapping oldId->newId below is logged for review ONLY. patientAppointments.doctorId was NOT and will NOT be rewritten.');
    console.warn(JSON.stringify(doctorIdMap, null, 2));
  }
  await mongoose.disconnect();
  console.log('\nMigration complete.');
}

run().catch((e) => { console.error('Migration error:', e.message); process.exit(1); });