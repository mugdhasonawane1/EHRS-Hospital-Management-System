'use strict';

const { z } = require('zod');
const { objectId, paginationQuery } = require('./common.validator');

const invoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().min(0).default(1),
  unitPrice: z.coerce.number().min(0),
});

const generateInvoiceSchema = z.object({
  items: z.array(invoiceItemSchema).optional(),
  consultationFee: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(1).optional(),
});

const updateInvoiceSchema = z.object({
  items: z.array(invoiceItemSchema).optional(),
  discount: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(1).optional(),
});

const payInvoiceSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  method: z.enum(['cash', 'card', 'upi', 'insurance', 'other']).optional(),
  reference: z.string().max(120).optional(),
});

const voidInvoiceSchema = z.object({
  reason: z.string().max(500).optional(),
});

const listInvoicesQuery = paginationQuery.extend({
  status: z.enum(['pending', 'partially_paid', 'paid', 'void']).optional(),
  patientId: objectId.optional(),
});

module.exports = {
  generateInvoiceSchema,
  updateInvoiceSchema,
  payInvoiceSchema,
  voidInvoiceSchema,
  listInvoicesQuery,
  invoiceItemSchema,
};
