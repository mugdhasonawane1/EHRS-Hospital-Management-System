'use strict';

const env = require('../config/env');

/**
 * Invoice math, kept pure so it is trivially testable.
 * Money is handled in whole currency units rounded to 2 decimals.
 */

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Normalise a raw line item and compute its amount. */
function normaliseItem(item) {
  const quantity = Number(item.quantity ?? 1);
  const unitPrice = Number(item.unitPrice ?? 0);
  return {
    description: String(item.description || 'Service'),
    quantity,
    unitPrice: round2(unitPrice),
    amount: round2(quantity * unitPrice),
  };
}

/**
 * @param {Array} rawItems  [{ description, quantity, unitPrice }]
 * @param {Object} opts     { taxRate, discount }
 * @returns {{ items, subTotal, tax, discount, totalAmount }}
 */
function calculateInvoice(rawItems = [], opts = {}) {
  const taxRate = opts.taxRate ?? env.INVOICE_TAX_RATE;
  const items = rawItems.map(normaliseItem);

  const subTotal = round2(items.reduce((sum, i) => sum + i.amount, 0));
  const discount = round2(Math.min(Number(opts.discount || 0), subTotal));
  const taxable = round2(subTotal - discount);
  const tax = round2(taxable * taxRate);
  const totalAmount = round2(taxable + tax);

  return { items, subTotal, discount, tax, taxRate, totalAmount };
}

/** Derive payment status from what has actually been paid. */
function resolvePaymentStatus({ totalAmount, amountPaid = 0, currentStatus }) {
  if (currentStatus === 'void') return 'void';
  if (amountPaid <= 0) return 'pending';
  if (round2(amountPaid) >= round2(totalAmount)) return 'paid';
  return 'partially_paid';
}

module.exports = { calculateInvoice, resolvePaymentStatus, normaliseItem, round2 };
