'use strict';

const Invoice = require('../models/Invoice');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const Department = require('../models/Department');
const Patient = require('../models/Patient');
const env = require('../config/env');
const { ApiError } = require('../utils/apiResponse');
const { paginateQuery } = require('../utils/paginate');
const { calculateInvoice, resolvePaymentStatus, round2 } = require('../utils/invoiceCalculator');
const { addDays } = require('../utils/formatDate');
const rbac = require('./rbac.service');
const notify = require('./notification.service');
const logger = require('../utils/logger');

const { RESOURCES, ACTIONS } = rbac;

/** INV-20260812-0007 — readable, sortable, unique per day. */
async function nextInvoiceNumber(now = new Date()) {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `INV-${datePart}-`;
  const last = await Invoice.findOne({ invoiceNumber: new RegExp(`^${prefix}`) })
    .sort({ invoiceNumber: -1 })
    .select('invoiceNumber')
    .lean();
  const seq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Invoice generation for a completed visit.
 * Line items default to the consultation fee (doctor's, falling back to the
 * department's) plus whatever extra items the caller passes.
 */
async function generateInvoiceForAppointment(user, appointmentId, options = {}) {
  // `system: true` is used when the appointment-completion flow generates the
  // invoice on the doctor's behalf — doctors can't mint invoices themselves.
  if (!options.system) rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.CREATE);

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  if (appointment.status !== 'completed') {
    throw ApiError.conflict('Invoices are only generated for completed appointments', {
      code: 'APPOINTMENT_NOT_COMPLETED',
      details: { currentStatus: appointment.status },
    });
  }

  const existing = await Invoice.findOne({ appointmentId: appointment._id });
  if (existing && existing.status !== 'void') {
    // Idempotent: completing twice or a retry must not mint a second invoice.
    return existing;
  }

  const doctor = await Doctor.findById(appointment.doctorId).lean();
  const department = await Department.findById(appointment.departmentId || doctor?.departmentId).lean();

  const consultationFee = options.consultationFee
    ?? doctor?.consultationFee
    ?? department?.consultationFee
    ?? 500;

  const rawItems = [
    {
      description: `Consultation — ${department?.name || doctor?.specialization || 'General'}`,
      quantity: 1,
      unitPrice: consultationFee,
    },
    ...(options.items || []),
  ];

  const totals = calculateInvoice(rawItems, {
    taxRate: options.taxRate ?? env.INVOICE_TAX_RATE,
    discount: options.discount ?? 0,
  });

  const doc = {
    patientId: appointment.patientId,
    appointmentId: appointment._id,
    ...totals,
    amountPaid: 0,
    status: 'pending',
    dueDate: addDays(new Date(), env.INVOICE_DUE_DAYS),
    generatedBy: user.id,
  };

  let invoice;
  if (existing) {
    // Re-issuing over a voided invoice keeps the same number.
    Object.assign(existing, doc, { voidedAt: undefined, voidReason: undefined });
    invoice = await existing.save();
  } else {
    invoice = await Invoice.create({ ...doc, invoiceNumber: await nextInvoiceNumber() });
  }

  await notifyInvoice(invoice);
  logger.info(`Invoice ${invoice.invoiceNumber} generated for appointment ${appointment._id} (${invoice.totalAmount})`);
  return invoice;
}

async function listInvoices(user, query = {}) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.READ);
  const filter = { ...rbac.ownershipFilter(user, RESOURCES.INVOICE) };
  if (query.status) filter.status = query.status;
  if (query.patientId && user.role === 'admin') filter.patientId = query.patientId;

  return paginateQuery(Invoice, filter, {
    query,
    sort: { createdAt: -1 },
    populate: [
      { path: 'patientId', select: 'userId', populate: { path: 'userId', select: 'name email' } },
      { path: 'appointmentId', select: 'dateTime status doctorId' },
    ],
  });
}

/** GET /api/billing/patient/:patientId */
async function getPatientInvoices(user, patientId, query = {}) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.READ);
  if (user.role === 'patient' && String(patientId) !== String(user.patientId)) {
    throw ApiError.forbidden('You can only view your own invoices');
  }
  if (user.role === 'doctor') {
    // Doctors see billing only for patients they've actually treated.
    const treated = await Appointment.exists({ doctorId: user.doctorId, patientId });
    if (!treated) throw ApiError.forbidden('You have no appointment history with this patient');
  }

  const patient = await Patient.findById(patientId).populate('userId', 'name email');
  if (!patient) throw ApiError.notFound('Patient not found');

  const { items, meta } = await paginateQuery(Invoice, { patientId }, {
    query,
    sort: { createdAt: -1 },
    populate: [{ path: 'appointmentId', select: 'dateTime status' }],
  });

  const summary = items.reduce(
    (acc, inv) => {
      if (inv.status === 'void') return acc;
      acc.billed = round2(acc.billed + inv.totalAmount);
      acc.paid = round2(acc.paid + inv.amountPaid);
      acc.outstanding = round2(acc.billed - acc.paid);
      return acc;
    },
    { billed: 0, paid: 0, outstanding: 0 }
  );

  return { patient, invoices: items, meta, summary };
}

async function getInvoiceById(user, id) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.READ);
  const invoice = await Invoice.findById(id)
    .populate({ path: 'patientId', select: 'userId', populate: { path: 'userId', select: 'name email' } })
    .populate({ path: 'appointmentId', select: 'dateTime status doctorId' });
  if (!invoice) throw ApiError.notFound('Invoice not found');

  if (user.role === 'doctor') {
    // Ownership for a doctor is resolved through the appointment.
    const appt = await Appointment.findById(invoice.appointmentId).select('doctorId').lean();
    if (!appt || String(appt.doctorId) !== String(user.doctorId)) {
      throw ApiError.forbidden('You do not have access to this invoice');
    }
    return invoice;
  }

  rbac.assertAccess(user, RESOURCES.INVOICE, ACTIONS.READ, invoice);
  return invoice;
}

/** Record a payment. Patients may pay their own; admins may record any. */
async function recordPayment(user, invoiceId, { amount, method, reference }) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.PAY);

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found');
  rbac.assertAccess(user, RESOURCES.INVOICE, ACTIONS.PAY, invoice);

  if (invoice.status === 'void') throw ApiError.conflict('This invoice has been voided');
  if (invoice.status === 'paid') throw ApiError.conflict('This invoice is already fully paid');

  const balance = round2(invoice.totalAmount - invoice.amountPaid);
  const payment = round2(Number(amount));
  if (payment <= 0) throw ApiError.badRequest('Payment amount must be greater than zero');
  if (payment > balance) {
    throw ApiError.badRequest(`Payment exceeds the outstanding balance of ${balance}`, {
      code: 'OVERPAYMENT',
      details: { balance },
    });
  }

  invoice.payments.push({ amount: payment, method, reference, recordedBy: user.id, paidAt: new Date() });
  invoice.amountPaid = round2(invoice.amountPaid + payment);
  invoice.status = resolvePaymentStatus({
    totalAmount: invoice.totalAmount,
    amountPaid: invoice.amountPaid,
    currentStatus: invoice.status,
  });
  await invoice.save();

  logger.info(`Payment ${payment} recorded on ${invoice.invoiceNumber} -> ${invoice.status}`);
  return invoice;
}

/** Admin: add/replace line items on a pending invoice and re-total it. */
async function updateInvoiceItems(user, invoiceId, { items, discount, taxRate }) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.UPDATE);
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (invoice.status === 'paid' || invoice.status === 'void') {
    throw ApiError.conflict(`A ${invoice.status} invoice cannot be edited`);
  }

  const totals = calculateInvoice(items ?? invoice.items, {
    discount: discount ?? invoice.discount,
    taxRate: taxRate ?? invoice.taxRate,
  });
  Object.assign(invoice, totals);
  invoice.status = resolvePaymentStatus({
    totalAmount: invoice.totalAmount,
    amountPaid: invoice.amountPaid,
    currentStatus: invoice.status,
  });
  await invoice.save();
  return invoice;
}

async function voidInvoice(user, invoiceId, reason) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.DELETE);
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (invoice.amountPaid > 0) throw ApiError.conflict('An invoice with recorded payments cannot be voided');

  invoice.status = 'void';
  invoice.voidedAt = new Date();
  invoice.voidReason = reason || 'Voided by admin';
  await invoice.save();
  return invoice;
}

/** Admin dashboard numbers. */
async function getBillingSummary(user) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.READ);
  if (user.role !== 'admin') throw ApiError.forbidden('Billing overview is admin-only');

  const rows = await Invoice.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' }, paid: { $sum: '$amountPaid' } } },
  ]);

  const byStatus = {};
  let totalBilled = 0;
  let totalCollected = 0;
  for (const r of rows) {
    byStatus[r._id] = { count: r.count, total: round2(r.total), paid: round2(r.paid) };
    if (r._id !== 'void') {
      totalBilled = round2(totalBilled + r.total);
      totalCollected = round2(totalCollected + r.paid);
    }
  }

  return {
    byStatus,
    totalBilled,
    totalCollected,
    outstanding: round2(totalBilled - totalCollected),
    invoiceCount: rows.reduce((s, r) => s + r.count, 0),
  };
}

async function notifyInvoice(invoice) {
  try {
    const patient = await Patient.findById(invoice.patientId).populate('userId', 'name email').lean();
    notify.invoiceGenerated({
      to: patient?.userId?.email || 'unknown@example.com',
      patientName: patient?.userId?.name || 'patient',
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
    });
  } catch (err) {
    logger.warn(`Invoice notification failed: ${err.message}`);
  }
}

module.exports = {
  generateInvoiceForAppointment,
  listInvoices,
  getPatientInvoices,
  getInvoiceById,
  recordPayment,
  updateInvoiceItems,
  voidInvoice,
  getBillingSummary,
  nextInvoiceNumber,
};
