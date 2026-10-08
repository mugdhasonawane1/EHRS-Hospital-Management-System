'use strict';

const mongoose = require('mongoose');

const INVOICE_STATUS = ['pending', 'partially_paid', 'paid', 'void'];

const invoiceItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ['cash', 'card', 'upi', 'insurance', 'other'], default: 'cash' },
    reference: { type: String, trim: true },
    paidAt: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    /** 1:1 with an appointment — one invoice per visit. */
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [invoiceItemSchema], default: [] },
    subTotal: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
    taxRate: { type: Number, min: 0, default: 0 },
    tax: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0, default: 0 },
    amountPaid: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: INVOICE_STATUS, default: 'pending', index: true },
    payments: { type: [paymentSchema], default: [] },
    dueDate: { type: Date },
    voidedAt: { type: Date },
    voidReason: { type: String, trim: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

invoiceSchema.virtual('balanceDue').get(function balanceDue() {
  return Math.max(0, Math.round((this.totalAmount - this.amountPaid) * 100) / 100);
});

module.exports = mongoose.model('Invoice', invoiceSchema);
module.exports.INVOICE_STATUS = INVOICE_STATUS;
