import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { appointmentApi } from '../../api/appointment.api';
import { useFetch } from '../../hooks/useFetch';
import AppointmentCard from '../../components/appointment/AppointmentCard.jsx';
import Loader from '../../components/common/Loader.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import { currency, formatDateTime } from '../../utils/datetime';

const FILTERS = [
  { key: 'booked', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

export default function DoctorAppointments() {
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('booked');
  const [completing, setCompleting] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(
    () => appointmentApi.listMine({ limit: 50, sort: 'asc', ...(filter === 'all' ? {} : { status: filter }) }),
    [filter]
  );
  const { data, loading, error, refetch } = useFetch(fetcher, [filter]);

  /** Completing the visit is what unlocks the medical-record form. */
  async function confirmComplete() {
    setBusy(true);
    try {
      const { data: result } = await appointmentApi.complete(completing._id, { notes: notes || undefined });
      toast.success(
        result.invoice
          ? `Visit completed · invoice ${result.invoice.invoiceNumber} for ${currency(result.invoice.totalAmount)}`
          : 'Visit completed'
      );
      const id = completing._id;
      setCompleting(null);
      setNotes('');
      await refetch();
      navigate(`/doctor/appointments/${id}/record`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>My appointments</h2>
          <p className="muted">Only appointments assigned to you are returned by the API.</p>
        </div>
      </header>

      <div className="tabs">
        {FILTERS.map((f) => (
          <button key={f.key} className={`tab${filter === f.key ? ' is-active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <Loader />}
      {error && <p className="error-box">{error.message}</p>}
      {!loading && !error && data?.length === 0 && <p className="empty-box">Nothing in this list.</p>}

      <div className="stack">
        {(data || []).map((a) => (
          <AppointmentCard
            key={a._id}
            appointment={a}
            perspective="doctor"
            actions={
              <>
                <Link className="btn btn--ghost btn--sm" to={`/doctor/patients/${a.patientId?._id}`}>Chart</Link>
                {a.status === 'booked' && (
                  <button className="btn btn--primary btn--sm" onClick={() => setCompleting(a)}>Complete visit</button>
                )}
                {a.status === 'completed' && (
                  <Link className="btn btn--primary btn--sm" to={`/doctor/appointments/${a._id}/record`}>
                    {a.medicalRecord ? 'View record' : 'Write record'}
                  </Link>
                )}
              </>
            }
          />
        ))}
      </div>

      <Modal
        open={Boolean(completing)}
        title="Complete visit"
        onClose={() => setCompleting(null)}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setCompleting(null)}>Not yet</button>
            <button className="btn btn--primary" onClick={confirmComplete} disabled={busy}>
              {busy ? 'Completing…' : 'Mark completed'}
            </button>
          </>
        }
      >
        <p>
          Mark the visit with <strong>{completing?.patientId?.userId?.name}</strong> on{' '}
          {completing ? formatDateTime(completing.dateTime) : ''} as completed?
        </p>
        <p className="muted">This generates the invoice and unlocks the medical-record form.</p>
        <label className="field">
          <span>Visit notes (optional)</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </Modal>
    </div>
  );
}
