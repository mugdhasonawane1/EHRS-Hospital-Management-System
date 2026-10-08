import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { appointmentApi } from '../../api/appointment.api';
import { patientApi } from '../../api/patient.api';
import { useFetch } from '../../hooks/useFetch';
import AppointmentCard from '../../components/appointment/AppointmentCard.jsx';
import Loader from '../../components/common/Loader.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import { formatDateTime } from '../../utils/datetime';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'booked', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function PatientAppointments() {
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(
    () => appointmentApi.listMine({ limit: 50, ...(filter === 'all' ? {} : { status: filter }) }),
    [filter]
  );
  const { data, loading, error, refetch } = useFetch(fetcher, [filter]);
  const { data: profile } = useFetch(useCallback(() => patientApi.me(), []), []);

  async function confirmCancel() {
    setBusy(true);
    try {
      await appointmentApi.cancel(cancelling._id, reason || undefined);
      toast.success('Appointment cancelled');
      setCancelling(null);
      setReason('');
      refetch();
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
          {profile?.stats && (
            <p className="muted">
              {profile.stats.upcomingAppointments} upcoming · {profile.stats.completedVisits} completed visits
            </p>
          )}
        </div>
        <Link className="btn btn--primary" to="/patient/book">+ Book appointment</Link>
      </header>

      <div className="tabs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`tab${filter === f.key ? ' is-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <Loader />}
      {error && <p className="error-box">{error.message}</p>}
      {!loading && !error && data?.length === 0 && <p className="empty-box">No appointments here yet.</p>}

      <div className="stack">
        {(data || []).map((a) => (
          <AppointmentCard
            key={a._id}
            appointment={a}
            perspective="patient"
            actions={
              a.status === 'booked' ? (
                <button className="btn btn--danger" onClick={() => setCancelling(a)}>Cancel</button>
              ) : a.status === 'completed' ? (
                <Link className="btn btn--ghost" to="/patient/records">View record</Link>
              ) : null
            }
          />
        ))}
      </div>

      <Modal
        open={Boolean(cancelling)}
        title="Cancel appointment"
        onClose={() => setCancelling(null)}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setCancelling(null)}>Keep it</button>
            <button className="btn btn--danger" onClick={confirmCancel} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel appointment'}
            </button>
          </>
        }
      >
        <p>
          Cancel your appointment with <strong>{cancelling?.doctorId?.userId?.name}</strong> on{' '}
          {cancelling ? formatDateTime(cancelling.dateTime) : ''}?
        </p>
        <p className="muted">Cancellations must be made at least 2 hours in advance.</p>
        <label className="field">
          <span>Reason (optional)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Feeling better, schedule clash…" />
        </label>
      </Modal>
    </div>
  );
}
