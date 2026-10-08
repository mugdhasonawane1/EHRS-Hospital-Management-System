import { useCallback, useState } from 'react';
import { billingApi } from '../../api/billing.api';
import { useFetch } from '../../hooks/useFetch';
import Table, { StatusBadge } from '../../components/common/Table.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import { useRole } from '../../hooks/useRole';
import { currency, formatDate, formatDateTime } from '../../utils/datetime';

export default function MyInvoices() {
  const toast = useToast();
  const { patientId } = useRole();

  const fetcher = useCallback(() => billingApi.forPatient(patientId, { limit: 50 }), [patientId]);
  const { data, loading, error, refetch } = useFetch(fetcher, [patientId], { enabled: Boolean(patientId) });

  const [paying, setPaying] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState(false);

  function openPay(invoice) {
    setPaying(invoice);
    setAmount(String(Math.max(0, invoice.totalAmount - invoice.amountPaid)));
  }

  async function submitPayment() {
    setBusy(true);
    try {
      const { data: updated } = await billingApi.pay(paying._id, { amount: Number(amount), method });
      toast.success(updated.status === 'paid' ? 'Invoice settled in full' : 'Payment recorded');
      setPaying(null);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const summary = data?.summary;
  const invoices = data?.invoices || [];

  const columns = [
    { key: 'invoiceNumber', header: 'Invoice', render: (r) => <code>{r.invoiceNumber}</code> },
    { key: 'date', header: 'Visit', render: (r) => (r.appointmentId?.dateTime ? formatDateTime(r.appointmentId.dateTime) : formatDate(r.createdAt)) },
    { key: 'items', header: 'Items', render: (r) => r.items.map((i) => i.description).join(', ') },
    { key: 'totalAmount', header: 'Total', render: (r) => currency(r.totalAmount) },
    { key: 'balance', header: 'Balance', render: (r) => currency(Math.max(0, r.totalAmount - r.amountPaid)) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        r.status === 'pending' || r.status === 'partially_paid' ? (
          <button className="btn btn--primary btn--sm" onClick={() => openPay(r)}>Pay</button>
        ) : null,
    },
  ];

  return (
    <div className="page">
      <header className="page__head">
        <h2>My invoices</h2>
      </header>

      {summary && (
        <div className="stat-row">
          <div className="stat"><span>Billed</span><strong>{currency(summary.billed)}</strong></div>
          <div className="stat"><span>Paid</span><strong>{currency(summary.paid)}</strong></div>
          <div className="stat stat--warn"><span>Outstanding</span><strong>{currency(summary.outstanding)}</strong></div>
        </div>
      )}

      <Table columns={columns} rows={invoices} loading={loading} error={error} empty="No invoices yet." />

      <Modal
        open={Boolean(paying)}
        title={`Pay ${paying?.invoiceNumber || ''}`}
        onClose={() => setPaying(null)}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setPaying(null)}>Cancel</button>
            <button className="btn btn--primary" onClick={submitPayment} disabled={busy || !Number(amount)}>
              {busy ? 'Processing…' : `Pay ${currency(Number(amount) || 0)}`}
            </button>
          </>
        }
      >
        {paying && (
          <>
            <ul className="rx__list">
              {paying.items.map((i, idx) => (
                <li key={idx}>{i.description} × {i.quantity} — {currency(i.amount)}</li>
              ))}
            </ul>
            <p className="muted">
              Total {currency(paying.totalAmount)} · already paid {currency(paying.amountPaid)}
            </p>
            <div className="grid-2">
              <label className="field">
                <span>Amount</span>
                <input
                  type="number"
                  min="1"
                  max={paying.totalAmount - paying.amountPaid}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Method</span>
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {['upi', 'card', 'cash', 'insurance', 'other'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <p className="muted">Partial payments are allowed; the balance stays on the invoice.</p>
          </>
        )}
      </Modal>
    </div>
  );
}
