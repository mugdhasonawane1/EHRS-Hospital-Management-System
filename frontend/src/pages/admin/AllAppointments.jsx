import { useCallback, useState } from 'react';
import { appointmentApi } from '../../api/appointment.api';
import { useFetch } from '../../hooks/useFetch';
import Table, { StatusBadge } from '../../components/common/Table.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import { formatDateTime } from '../../utils/datetime';

const FILTERS = ['all', 'booked', 'completed', 'cancelled'];

export default function AllAppointments() {
  const toast = useToast();
  const [status, setStatus] = useState('all');

  const fetcher = useCallback(
    () => appointmentApi.listMine({ limit: 50, ...(status === 'all' ? {} : { status }) }),
    [status]
  );
  const { data, loading, error, refetch } = useFetch(fetcher, [status]);

  async function cancel(appointment) {
    try {
      await appointmentApi.cancel(appointment._id, 'Cancelled by administration');
      toast.success('Appointment cancelled');
      refetch();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const columns = [
    { key: 'dateTime', header: 'When', render: (a) => formatDateTime(a.dateTime) },
    { key: 'patient', header: 'Patient', render: (a) => a.patientId?.userId?.name || '—' },
    { key: 'doctor', header: 'Doctor', render: (a) => a.doctorId?.userId?.name || '—' },
    { key: 'department', header: 'Department', render: (a) => a.departmentId?.name || '—' },
    { key: 'reason', header: 'Reason', render: (a) => a.reason || '—' },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
    { key: 'actions', header: '', render: (a) => (a.status === 'booked'
      ? <button className="btn btn--danger btn--sm" onClick={() => cancel(a)}>Cancel</button>
      : null) },
  ];

  return (
    <div className="page">
      <header className="page__head">
        <h2>All appointments</h2>
      </header>

      <div className="tabs">
        {FILTERS.map((f) => (
          <button key={f} className={`tab${status === f ? ' is-active' : ''}`} onClick={() => setStatus(f)}>{f}</button>
        ))}
      </div>

      <Table columns={columns} rows={data} loading={loading} error={error} empty="No appointments." />
    </div>
  );
}
