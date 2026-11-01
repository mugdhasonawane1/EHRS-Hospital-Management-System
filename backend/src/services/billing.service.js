'use strict';

const { prisma } = require('../config/db');
const env = require('../config/env');
const { ApiError } = require('../utils/apiResponse');
const { getPagination, buildMeta } = require('../utils/paginate');
const { calculateInvoice, resolvePaymentStatus, round2 } = require('../utils/invoiceCalculator');
const { addDays } = require('../utils/formatDate');
const rbac = require('./rbac.service');
const notify = require('./notification.service');
const logger = require('../utils/logger');

const { RESOURCES, ACTIONS } = rbac;

const invoiceInclude = {
  patient: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
  appointment: { select: { id: true, dateTime: true, status: true, doctorId: true } },
  items: true,
  payments: true,
};

function asApiInvoice(invoice) {
  if (!invoice) return null;
  const plain = {
    ...invoice,
    subTotal: Number(invoice.subTotal),
    discount: Number(invoice.discount),
    taxRate: Number(invoice.taxRate),
    tax: Number(invoice.tax),
    totalAmount: Number(invoice.totalAmount),
    amountPaid: Number(invoice.amountPaid),
    balanceDue: round2(Number(invoice.totalAmount) - Number(invoice.amountPaid)),
    items: (invoice.items || []).map((item) => ({
      ...item, unitPrice: Number(item.unitPrice), amount: Number(item.amount),
    })),
    payments: (invoice.payments || []).map((payment) => ({
      ...payment, amount: Number(payment.amount),
    })),
  };
  if (invoice.patient) {
    plain.patientId = { ...invoice.patient, userId: invoice.patient.user };
  }
  if (invoice.appointment) plain.appointmentId = invoice.appointment;
  return plain;
}

async function nextInvoiceNumber(now = new Date(), tx = prisma) {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `INV-${datePart}-`;
  const last = await tx.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  const seq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function generateInvoiceForAppointment(user, appointmentId, options = {}) {
  if (!options.system) rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.CREATE);

  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw ApiError.notFound('Appointment not found');
  if (appointment.status !== 'COMPLETED') {
    throw ApiError.conflict('Invoices are only generated for completed appointments', {
      code: 'APPOINTMENT_NOT_COMPLETED',
      details: { currentStatus: appointment.status },
    });
  }

  const existing = await prisma.invoice.findUnique({
    where: { appointmentId }, include: invoiceInclude,
  });
  if (existing && existing.status !== 'VOID') return asApiInvoice(existing);

  const doctor = await prisma.doctor.findUnique({ where: { id: appointment.doctorId } });
  const departmentId = appointment.departmentId || doctor?.departmentId;
  const department = departmentId
    ? await prisma.department.findUnique({ where: { id: departmentId } })
    : null;
  const consultationFee = Number(
    options.consultationFee ?? doctor?.consultationFee ?? department?.consultationFee ?? 500
  );

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

  const invoiceNumber = existing?.invoiceNumber || await nextInvoiceNumber();
  const saved = await prisma.$transaction(async (tx) => {
    const data = {
      patientId: appointment.patientId,
      appointmentId,
      subTotal: totals.subTotal,
      discount: totals.discount || 0,
      taxRate: totals.taxRate,
      tax: totals.tax,
      totalAmount: totals.totalAmount,
      amountPaid: 0,
      status: 'PENDING',
      dueDate: addDays(new Date(), env.INVOICE_DUE_DAYS),
      generatedBy: user.id,
      voidedAt: null,
      voidReason: null,
    };

    let invoice;
    if (existing) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
      invoice = await tx.invoice.update({
        where: { id: existing.id },
        data: {
          ...data,
          items: { create: (totals.items || rawItems).map((item) => ({
            description: item.description,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice,
            amount: item.amount ?? (item.quantity || 1) * item.unitPrice,
          })) },
        },
        include: invoiceInclude,
      });
    } else {
      invoice = await tx.invoice.create({
        data: {
          ...data,
          invoiceNumber,
          items: { create: (totals.items || rawItems).map((item) => ({
            description: item.description,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice,
            amount: item.amount ?? (item.quantity || 1) * item.unitPrice,
          })) },
        },
        include: invoiceInclude,
      });
    }
    return invoice;
  });

  await notifyInvoice(saved);
  logger.info(`Invoice ${saved.invoiceNumber} generated for appointment ${appointmentId}`);
  return asApiInvoice(saved);
}

async function listInvoices(user, query = {}) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.READ);
  const where = {};
  if (user.role === 'patient') where.patientId = user.patientId;
  if (query.status) where.status = String(query.status).toUpperCase();
  if (query.patientId && user.role === 'admin') where.patientId = query.patientId;

  const { page, limit, skip } = getPagination(query);
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: invoiceInclude,
    }),
    prisma.invoice.count({ where }),
  ]);
  return { items: rows.map(asApiInvoice), meta: buildMeta({ page, limit, total }) };
}

async function getPatientInvoices(user, patientId, query = {}) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.READ);
  if (user.role === 'patient' && String(patientId) !== String(user.patientId)) {
    throw ApiError.forbidden('You can only view your own invoices');
  }
  if (user.role === 'doctor') {
    const treated = await prisma.appointment.findFirst({
      where: { doctorId: user.doctorId, patientId }, select: { id: true },
    });
    if (!treated) throw ApiError.forbidden('You have no appointment history with this patient');
  }
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: { select: { name: true, email: true, phone: true } } },
  });
  if (!patient) throw ApiError.notFound('Patient not found');

  const { page, limit, skip } = getPagination(query);
  const where = { patientId };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: invoiceInclude,
    }),
    prisma.invoice.count({ where }),
  ]);
  const invoices = rows.map(asApiInvoice);
  const summary = invoices.reduce((acc, inv) => {
    if (inv.status === 'VOID') return acc;
    acc.billed = round2(acc.billed + inv.totalAmount);
    acc.paid = round2(acc.paid + inv.amountPaid);
    acc.outstanding = round2(acc.billed - acc.paid);
    return acc;
  }, { billed: 0, paid: 0, outstanding: 0 });
  return {
    patient: { ...patient, userId: patient.user },
    invoices,
    meta: buildMeta({ page, limit, total }),
    summary,
  };
}

async function getInvoiceById(user, id) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.READ);
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
  if (!invoice) throw ApiError.notFound('Invoice not found');

  if (user.role === 'doctor') {
    if (invoice.appointment?.doctorId !== user.doctorId) {
      throw ApiError.forbidden('You do not have access to this invoice');
    }
  } else {
    rbac.assertAccess(user, RESOURCES.INVOICE, ACTIONS.READ, {
      ...invoice, _id: invoice.id,
    });
  }
  return asApiInvoice(invoice);
}

async function recordPayment(user, invoiceId, { amount, method, reference }) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.PAY);
  const paymentAmount = round2(Number(amount));
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw ApiError.badRequest('Payment amount must be greater than zero');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw ApiError.notFound('Invoice not found');
    rbac.assertAccess(user, RESOURCES.INVOICE, ACTIONS.PAY, { ...invoice, _id: invoice.id });
    if (invoice.status === 'VOID') throw ApiError.conflict('This invoice has been voided');
    if (invoice.status === 'PAID') throw ApiError.conflict('This invoice is already fully paid');

    const balance = round2(Number(invoice.totalAmount) - Number(invoice.amountPaid));
    if (paymentAmount > balance) {
      throw ApiError.badRequest(`Payment exceeds the outstanding balance of ${balance}`, {
        code: 'OVERPAYMENT', details: { balance },
      });
    }
    const amountPaid = round2(Number(invoice.amountPaid) + paymentAmount);
    const status = resolvePaymentStatus({
      totalAmount: Number(invoice.totalAmount),
      amountPaid,
      currentStatus: invoice.status.toLowerCase(),
    }).toUpperCase();

    await tx.payment.create({
      data: {
        invoiceId,
        amount: paymentAmount,
        method: String(method || 'cash').toUpperCase(),
        reference: reference || null,
        recordedBy: user.id,
      },
    });
    return tx.invoice.update({
      where: { id: invoiceId }, data: { amountPaid, status }, include: invoiceInclude,
    });
  });
  logger.info(`Payment ${paymentAmount} recorded on ${updated.invoiceNumber} -> ${updated.status}`);
  return asApiInvoice(updated);
}

async function updateInvoiceItems(user, invoiceId, { items, discount, taxRate }) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.UPDATE);
  const current = await prisma.invoice.findUnique({
    where: { id: invoiceId }, include: { items: true },
  });
  if (!current) throw ApiError.notFound('Invoice not found');
  if (current.status === 'PAID' || current.status === 'VOID') {
    throw ApiError.conflict(`A ${current.status.toLowerCase()} invoice cannot be edited`);
  }

  const currentItems = current.items.map((item) => ({
    description: item.description, quantity: item.quantity,
    unitPrice: Number(item.unitPrice), amount: Number(item.amount),
  }));
  const totals = calculateInvoice(items ?? currentItems, {
    discount: discount ?? Number(current.discount),
    taxRate: taxRate ?? Number(current.taxRate),
  });
  const status = resolvePaymentStatus({
    totalAmount: totals.totalAmount,
    amountPaid: Number(current.amountPaid),
    currentStatus: current.status.toLowerCase(),
  }).toUpperCase();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId } });
    return tx.invoice.update({
      where: { id: invoiceId },
      data: {
        subTotal: totals.subTotal, discount: totals.discount || 0,
        taxRate: totals.taxRate, tax: totals.tax, totalAmount: totals.totalAmount, status,
        items: { create: (totals.items || items || currentItems).map((item) => ({
          description: item.description, quantity: item.quantity || 1,
          unitPrice: item.unitPrice,
          amount: item.amount ?? (item.quantity || 1) * item.unitPrice,
        })) },
      },
      include: invoiceInclude,
    });
  });
  return asApiInvoice(updated);
}

async function voidInvoice(user, invoiceId, reason) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.DELETE);
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (Number(invoice.amountPaid) > 0) {
    throw ApiError.conflict('An invoice with recorded payments cannot be voided');
  }
  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'VOID', voidedAt: new Date(), voidReason: reason || 'Voided by admin' },
    include: invoiceInclude,
  });
  return asApiInvoice(updated);
}

async function getBillingSummary(user) {
  rbac.assertCan(user, RESOURCES.INVOICE, ACTIONS.READ);
  if (user.role !== 'admin') throw ApiError.forbidden('Billing overview is admin-only');
  const rows = await prisma.invoice.groupBy({
    by: ['status'],
    _count: { _all: true },
    _sum: { totalAmount: true, amountPaid: true },
  });
  const byStatus = {};
  let totalBilled = 0;
  let totalCollected = 0;
  let invoiceCount = 0;
  for (const row of rows) {
    const total = Number(row._sum.totalAmount || 0);
    const paid = Number(row._sum.amountPaid || 0);
    const count = row._count._all;
    byStatus[row.status.toLowerCase()] = { count, total: round2(total), paid: round2(paid) };
    invoiceCount += count;
    if (row.status !== 'VOID') {
      totalBilled = round2(totalBilled + total);
      totalCollected = round2(totalCollected + paid);
    }
  }
  return {
    byStatus, totalBilled, totalCollected,
    outstanding: round2(totalBilled - totalCollected), invoiceCount,
  };
}

async function notifyInvoice(invoice) {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: invoice.patientId },
      include: { user: { select: { name: true, email: true } } },
    });
    notify.invoiceGenerated({
      to: patient?.user?.email || 'unknown@example.com',
      patientName: patient?.user?.name || 'patient',
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: Number(invoice.totalAmount),
    });
  } catch (err) {
    logger.warn(`Invoice notification failed: ${err.message}`);
  }
}

module.exports = {
  generateInvoiceForAppointment, listInvoices, getPatientInvoices, getInvoiceById,
  recordPayment, updateInvoiceItems, voidInvoice, getBillingSummary, nextInvoiceNumber,
};
