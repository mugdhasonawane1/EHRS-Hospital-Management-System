import { useCallback, useState } from 'react';
import { billingApi } from '../../api/billing.api';
import { useFetch } from '../../hooks/useFetch';
import Table, { StatusBadge } from '../../components/common/Table.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import { currency, formatDateTime } from '../../utils/datetime';

const FILTERS = ['all', 'pending', 'partially_paid', 'paid', 'void'];

export default function AdminBilling() {
  const toast = useToast();
  const [status, setStatus] = useState('all');
  const [paying, setPaying] = useState(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(
    () => billingApi.list({ limit: 50, ...(status === 'all' ? {} : { status }) }),
    [status]
  );
  const { data, loading, error, refetch } = useFetch(fetcher, [status]);
  const { data: summary, refetch: refetchSummary } = useFetch(useCallback(() => billingApi.summary(), []), []);

  async function recordPayment() {
    setBusy(true);
    try {
      await billingApi.pay(paying._id, { amount: Number(amount), method: 'cash' });
      toast.success('Payment recorded');
      setPaying(null);
      refetch();
      refetchSummary();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function voidInvoice(invoice) {
    try {
      await billingApi.void(invoice._id, 'Voided by administration');
      toast.success('Invoice voided');
      refetch();
      refetchSummary();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const columns = [
    { key: 'invoiceNumber', header: 'Invoice', render: (r) => <code>{r.invoiceNumber}</code> },
    { key: 'patient', header: 'Patient', render: (r) => r.patientId?.userId?.name || '—' },
    { key: 'visit', header: 'Visit', render: (r) => (r.appointmentId?.dateTime ? formatDateTime(r.appointmentId.dateTime) : '—') },
    { key: 'totalAmount', header: 'Total', render: (r) => currency(r.totalAmount) },
    { key: 'amountPaid', header: 'Paid', render: (r) => currency(r.amountPaid) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'actions', header: '', render: (r) => (
      <div className="row-gap">
        {(r.status === 'pending' || r.status === 'partially_paid') && (
          <button className="btn btn--primary btn--sm" onClick={() => { setPaying(r); setAmount(String(r.totalAmount - r.amountPaid)); }}>
            Record payment
          </button>
        )}
        {r.amountPaid === 0 && r.status !== 'void' && (
          <button className="btn btn--danger btn--sm" onClick={() => voidInvoice(r)}>Void</button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="page">
      <header className="page__head">
        <h2>Billing</h2>
      </header>

      {summary && (
        <div className="stat-row">
          <div className="stat"><span>Billed</span><strong>{currency(summary.totalBilled)}</strong></div>
          <div className="stat"><span>Collected</span><strong>{currency(summary.totalCollected)}</strong></div>
          <div className="stat stat--warn"><span>Outstanding</span><strong>{currency(summary.outstanding)}</strong></div>
          <div className="stat"><span>Invoices</span><strong>{summary.invoiceCount}</strong></div>
        </div>
      )}

      <div className="tabs">
        {FILTERS.map((f) => (
          <button key={f} className={`tab${status === f ? ' is-active' : ''}`} onClick={() => setStatus(f)}>
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      <Table columns={columns} rows={data} loading={loading} error={error} empty="No invoices." />

      <Modal
        open={Boolean(paying)}
        title={`Record payment — ${paying?.invoiceNumber || ''}`}
        onClose={() => setPaying(null)}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setPaying(null)}>Cancel</button>
            <button className="btn btn--primary" onClick={recordPayment} disabled={busy || !Number(amount)}>
              {busy ? 'Saving…' : 'Record'}
            </button>
          </>
        }
      >
        <label className="field">
          <span>Amount received (max {currency((paying?.totalAmount || 0) - (paying?.amountPaid || 0))})</span>
          <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      </Modal>
    </div>
  );
}
