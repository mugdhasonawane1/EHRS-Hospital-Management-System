'use strict';

/**
 * Demo data seeder.
 *
 *   npm run seed          # wipes the HMS collections and reseeds
 *
 * Creates one admin, three doctors, three patients, plus appointments in every
 * state (booked / completed / cancelled) with the medical records, prescriptions
 * and invoices that hang off them — so the UI has something to show on first run.
 */

const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const logger = require('../utils/logger');

const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Department = require('../models/Department');
const Appointment = require('../models/Appointment');
const MedicalRecord = require('../models/MedicalRecord');
const Prescription = require('../models/Prescription');
const Invoice = require('../models/Invoice');

const { hashPassword } = require('../utils/hashPassword');
const { calculateInvoice } = require('../utils/invoiceCalculator');
const { addDays, combineDateAndTime, toDateKey } = require('../utils/formatDate');

const PASSWORD = env.SEED_PASSWORD;

/** Mon–Fri, 09:00–13:00 and 14:00–17:00 UTC, 30-minute slots. */
const WEEKDAY_SLOTS = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
  { dayOfWeek, startTime: '09:00', endTime: '13:00', slotDurationMinutes: 30 },
  { dayOfWeek, startTime: '14:00', endTime: '17:00', slotDurationMinutes: 30 },
]);

/** Tue/Thu/Sat mornings only — gives the SlotPicker a doctor with a different shape. */
const PARTTIME_SLOTS = [2, 4, 6].map((dayOfWeek) => ({
  dayOfWeek, startTime: '10:00', endTime: '14:00', slotDurationMinutes: 20,
}));

/** Next future UTC datetime that lands on `dayOfWeek` at `hhmm`. */
function nextOccurrence(dayOfWeek, hhmm, fromDaysAhead = 1) {
  let cursor = addDays(new Date(), fromDaysAhead);
  for (let i = 0; i < 14; i += 1) {
    if (cursor.getUTCDay() === dayOfWeek) {
      const dt = combineDateAndTime(toDateKey(cursor), hhmm);
      if (dt.getTime() > Date.now()) return dt;
    }
    cursor = addDays(cursor, 1);
  }
  throw new Error(`Could not find an upcoming slot for day ${dayOfWeek} ${hhmm}`);
}

/** A past UTC datetime `daysAgo` days back at `hhmm`. */
function pastOccurrence(daysAgo, hhmm) {
  return combineDateAndTime(toDateKey(addDays(new Date(), -daysAgo)), hhmm);
}

async function wipe() {
  await Promise.all([
    Invoice.deleteMany({}),
    Prescription.deleteMany({}),
    MedicalRecord.deleteMany({}),
    Appointment.deleteMany({}),
    Doctor.deleteMany({}),
    Patient.deleteMany({}),
    Department.deleteMany({}),
    User.deleteMany({}),
  ]);
  logger.info('Cleared existing collections');
}

async function createUser({ name, email, role, phone }) {
  return User.create({ name, email, role, phone, passwordHash: await hashPassword(PASSWORD) });
}

async function seed() {
  await connectDB();
  await wipe();

  // Make sure the partial unique index on (doctorId, dateTime) actually exists.
  await Appointment.syncIndexes();

  /* ----------------------------- departments ----------------------------- */
  const [cardiology, neurology, general, orthopaedics] = await Department.create([
    { name: 'Cardiology', description: 'Heart and vascular care', location: 'Block A, Floor 2', consultationFee: 900 },
    { name: 'Neurology', description: 'Brain, spine and nervous system', location: 'Block B, Floor 3', consultationFee: 1100 },
    { name: 'General Medicine', description: 'Primary care and diagnostics', location: 'Block A, Floor 1', consultationFee: 500 },
    { name: 'Orthopaedics', description: 'Bones, joints and sports injuries', location: 'Block C, Floor 1', consultationFee: 800 },
  ]);

  /* -------------------------------- admin -------------------------------- */
  const adminUser = await createUser({
    name: 'Asha Menon', email: 'admin@hospital.test', role: 'admin', phone: '+91 90000 00001',
  });

  /* ------------------------------- doctors ------------------------------- */
  const doctorSeeds = [
    {
      user: { name: 'Dr. Alice Reed', email: 'doctor@hospital.test', role: 'doctor', phone: '+91 90000 00002' },
      profile: {
        specialization: 'Interventional Cardiology',
        departmentId: cardiology._id,
        additionalDepartmentIds: [general._id],
        licenseNumber: 'MCI-CARD-4411',
        experienceYears: 12,
        consultationFee: 900,
        bio: 'Cardiologist focused on preventive care and post-operative follow-up.',
        availableSlots: WEEKDAY_SLOTS,
      },
    },
    {
      user: { name: 'Dr. Ben Ortiz', email: 'doctor.neuro@hospital.test', role: 'doctor', phone: '+91 90000 00003' },
      profile: {
        specialization: 'Neurology',
        departmentId: neurology._id,
        licenseNumber: 'MCI-NEUR-2210',
        experienceYears: 8,
        consultationFee: 1100,
        bio: 'Treats migraine, epilepsy and movement disorders.',
        availableSlots: PARTTIME_SLOTS,
      },
    },
    {
      user: { name: 'Dr. Chen Wu', email: 'doctor.gp@hospital.test', role: 'doctor', phone: '+91 90000 00004' },
      profile: {
        specialization: 'General Physician',
        departmentId: general._id,
        licenseNumber: 'MCI-GEN-8890',
        experienceYears: 5,
        consultationFee: 500,
        bio: 'Everyday primary care, health checks and referrals.',
        availableSlots: WEEKDAY_SLOTS,
      },
    },
  ];

  const doctors = [];
  for (const s of doctorSeeds) {
    const user = await createUser(s.user);
    doctors.push(await Doctor.create({ userId: user._id, ...s.profile }));
  }
  const [drReed, drOrtiz, drWu] = doctors;

  /* ------------------------------- patients ------------------------------ */
  const patientSeeds = [
    {
      user: { name: 'John Doe', email: 'patient@hospital.test', role: 'patient', phone: '+91 90000 00010' },
      profile: {
        dob: new Date('1988-04-17T00:00:00.000Z'),
        gender: 'male',
        bloodGroup: 'O+',
        address: { line1: '12 Rose Lane', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India' },
        emergencyContact: { name: 'Priya Doe', relationship: 'spouse', phone: '+91 90000 00011' },
        allergies: ['Penicillin'],
        chronicConditions: ['Hypertension'],
      },
    },
    {
      user: { name: 'Maya Singh', email: 'patient.maya@hospital.test', role: 'patient', phone: '+91 90000 00012' },
      profile: {
        dob: new Date('1996-11-02T00:00:00.000Z'),
        gender: 'female',
        bloodGroup: 'A+',
        address: { line1: '88 Lake View', city: 'Pune', state: 'Maharashtra', postalCode: '411001', country: 'India' },
        allergies: [],
        chronicConditions: ['Migraine'],
      },
    },
    {
      user: { name: 'Omar Haddad', email: 'patient.omar@hospital.test', role: 'patient', phone: '+91 90000 00013' },
      profile: {
        dob: new Date('1971-01-25T00:00:00.000Z'),
        gender: 'male',
        bloodGroup: 'B-',
        address: { line1: '5 Hill Road', city: 'Kochi', state: 'Kerala', postalCode: '682001', country: 'India' },
        chronicConditions: ['Type 2 Diabetes'],
      },
    },
  ];

  const patients = [];
  for (const s of patientSeeds) {
    const user = await createUser(s.user);
    patients.push(await Patient.create({ userId: user._id, ...s.profile }));
  }
  const [john, maya, omar] = patients;

  /* ----------------------------- appointments ---------------------------- */
  // Two completed visits in the past...
  const completedJohn = await Appointment.create({
    patientId: john._id,
    doctorId: drReed._id,
    departmentId: cardiology._id,
    dateTime: pastOccurrence(9, '10:00'),
    durationMinutes: 30,
    status: 'completed',
    reason: 'Chest tightness while climbing stairs',
    completedAt: pastOccurrence(9, '10:30'),
    createdBy: john.userId,
  });

  const completedMaya = await Appointment.create({
    patientId: maya._id,
    doctorId: drOrtiz._id,
    departmentId: neurology._id,
    dateTime: pastOccurrence(4, '10:20'),
    durationMinutes: 20,
    status: 'completed',
    reason: 'Recurring migraine, 3x per week',
    completedAt: pastOccurrence(4, '10:40'),
    createdBy: maya.userId,
  });

  // ...three upcoming bookings...
  const upcoming = await Appointment.create([
    {
      patientId: john._id,
      doctorId: drReed._id,
      departmentId: cardiology._id,
      dateTime: nextOccurrence(3, '09:30'), // Wednesday
      durationMinutes: 30,
      status: 'booked',
      reason: 'Follow-up on ECG results',
      createdBy: john.userId,
    },
    {
      patientId: omar._id,
      doctorId: drWu._id,
      departmentId: general._id,
      dateTime: nextOccurrence(2, '11:00'), // Tuesday
      durationMinutes: 30,
      status: 'booked',
      reason: 'Annual diabetes review',
      createdBy: omar.userId,
    },
    {
      patientId: maya._id,
      doctorId: drReed._id,
      departmentId: cardiology._id,
      dateTime: nextOccurrence(5, '14:00'), // Friday
      durationMinutes: 30,
      status: 'booked',
      reason: 'Palpitations after exercise',
      createdBy: maya.userId,
    },
  ]);

  // ...and one cancellation, so the UI shows every status.
  await Appointment.create({
    patientId: omar._id,
    doctorId: drOrtiz._id,
    departmentId: neurology._id,
    dateTime: pastOccurrence(2, '11:00'),
    durationMinutes: 20,
    status: 'cancelled',
    reason: 'Numbness in left hand',
    cancelledAt: pastOccurrence(3, '09:00'),
    cancelledBy: omar.userId,
    cancellationReason: 'Patient rescheduled',
  });

  /* -------------------- records, prescriptions, invoices ------------------ */
  const johnRecord = await MedicalRecord.create({
    patientId: john._id,
    doctorId: drReed._id,
    appointmentId: completedJohn._id,
    diagnosis: 'Stable angina, well-controlled hypertension',
    symptoms: ['Chest tightness on exertion', 'Shortness of breath'],
    notes: 'ECG unremarkable at rest. Advised stress test in 4 weeks. Continue current antihypertensive.',
    vitals: { temperatureC: 36.8, pulseBpm: 78, systolic: 138, diastolic: 86, weightKg: 82, heightCm: 176 },
    followUpDate: addDays(new Date(), 21),
  });

  await Prescription.create({
    medicalRecordId: johnRecord._id,
    patientId: john._id,
    doctorId: drReed._id,
    medicines: [
      { name: 'Amlodipine', dosage: '5mg', frequency: 'once daily', duration: '30 days', instructions: 'Take in the morning' },
      { name: 'Aspirin', dosage: '75mg', frequency: 'once daily', duration: '30 days', instructions: 'After food' },
    ],
    advice: 'Reduce salt intake. 30 minutes of walking, five days a week.',
  });

  const mayaRecord = await MedicalRecord.create({
    patientId: maya._id,
    doctorId: drOrtiz._id,
    appointmentId: completedMaya._id,
    diagnosis: 'Episodic migraine without aura',
    symptoms: ['Unilateral throbbing headache', 'Photophobia', 'Nausea'],
    notes: 'Trigger diary advised. Start prophylaxis if frequency exceeds 4/month.',
    vitals: { temperatureC: 36.6, pulseBpm: 72, systolic: 118, diastolic: 74 },
  });

  await Prescription.create({
    medicalRecordId: mayaRecord._id,
    patientId: maya._id,
    doctorId: drOrtiz._id,
    medicines: [
      { name: 'Sumatriptan', dosage: '50mg', frequency: 'as needed', duration: '10 doses', instructions: 'At onset of headache, max 2/day' },
    ],
    advice: 'Keep a headache diary; avoid skipped meals and irregular sleep.',
  });

  // Invoice 1 — fully paid
  const johnTotals = calculateInvoice(
    [
      { description: 'Consultation — Cardiology', quantity: 1, unitPrice: 900 },
      { description: 'ECG (12-lead)', quantity: 1, unitPrice: 450 },
    ],
    { taxRate: env.INVOICE_TAX_RATE }
  );
  await Invoice.create({
    invoiceNumber: 'INV-SEED-0001',
    patientId: john._id,
    appointmentId: completedJohn._id,
    ...johnTotals,
    amountPaid: johnTotals.totalAmount,
    status: 'paid',
    payments: [{ amount: johnTotals.totalAmount, method: 'card', reference: 'TXN-88213', paidAt: pastOccurrence(9, '11:00'), recordedBy: adminUser._id }],
    dueDate: addDays(new Date(), 5),
    generatedBy: adminUser._id,
  });

  // Invoice 2 — partially paid, so the patient billing view has a live balance
  const mayaTotals = calculateInvoice(
    [
      { description: 'Consultation — Neurology', quantity: 1, unitPrice: 1100 },
      { description: 'Neurological assessment', quantity: 1, unitPrice: 600 },
    ],
    { taxRate: env.INVOICE_TAX_RATE, discount: 100 }
  );
  await Invoice.create({
    invoiceNumber: 'INV-SEED-0002',
    patientId: maya._id,
    appointmentId: completedMaya._id,
    ...mayaTotals,
    amountPaid: 500,
    status: 'partially_paid',
    payments: [{ amount: 500, method: 'upi', reference: 'UPI-4417', paidAt: pastOccurrence(3, '12:00'), recordedBy: adminUser._id }],
    dueDate: addDays(new Date(), 10),
    generatedBy: adminUser._id,
  });

  /* -------------------------------- report ------------------------------- */
  logger.info('Seed complete.');
  // eslint-disable-next-line no-console
  console.log(`
────────────────────────────────────────────────────────────
  Demo accounts (password for all: ${PASSWORD})
────────────────────────────────────────────────────────────
  admin    admin@hospital.test          Asha Menon
  doctor   doctor@hospital.test         Dr. Alice Reed (Cardiology, Mon–Fri)
  doctor   doctor.neuro@hospital.test   Dr. Ben Ortiz  (Neurology, Tue/Thu/Sat)
  doctor   doctor.gp@hospital.test      Dr. Chen Wu    (General Medicine)
  patient  patient@hospital.test        John Doe
  patient  patient.maya@hospital.test   Maya Singh
  patient  patient.omar@hospital.test   Omar Haddad
────────────────────────────────────────────────────────────
  ${await Department.countDocuments()} departments · ${await Doctor.countDocuments()} doctors · ${await Patient.countDocuments()} patients
  ${await Appointment.countDocuments()} appointments (${upcoming.length} upcoming) · ${await MedicalRecord.countDocuments()} records · ${await Invoice.countDocuments()} invoices

  All times are UTC. Doctor availability is stored as UTC "HH:mm" windows.
────────────────────────────────────────────────────────────
`);

  await disconnectDB();
}

seed().catch(async (err) => {
  logger.error(`Seed failed: ${err.message}`);
  // eslint-disable-next-line no-console
  console.error(err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
