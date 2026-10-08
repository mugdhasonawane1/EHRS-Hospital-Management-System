'use strict';

require('./setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateInvoice, resolvePaymentStatus } = require('../src/utils/invoiceCalculator');

test('totals line items, applies discount before tax', () => {
  const result = calculateInvoice(
    [
      { description: 'Consultation', quantity: 1, unitPrice: 900 },
      { description: 'ECG', quantity: 2, unitPrice: 450 },
    ],
    { taxRate: 0.1, discount: 100 }
  );

  assert.equal(result.subTotal, 1800);
  assert.equal(result.discount, 100);
  assert.equal(result.tax, 170);
  assert.equal(result.totalAmount, 1870);
  assert.equal(result.items[1].amount, 900);
});

test('discount is capped at the subtotal', () => {
  const result = calculateInvoice([{ description: 'X', quantity: 1, unitPrice: 100 }], { taxRate: 0, discount: 500 });
  assert.equal(result.discount, 100);
  assert.equal(result.totalAmount, 0);
});

test('payment status follows the amount actually paid', () => {
  assert.equal(resolvePaymentStatus({ totalAmount: 100, amountPaid: 0 }), 'pending');
  assert.equal(resolvePaymentStatus({ totalAmount: 100, amountPaid: 40 }), 'partially_paid');
  assert.equal(resolvePaymentStatus({ totalAmount: 100, amountPaid: 100 }), 'paid');
  assert.equal(resolvePaymentStatus({ totalAmount: 100, amountPaid: 100, currentStatus: 'void' }), 'void');
});
