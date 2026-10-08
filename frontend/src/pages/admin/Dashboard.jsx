import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { doctorApi, departmentApi } from '../../api/doctor.api';
import { patientApi } from '../../api/patient.api';
import { appointmentApi } from '../../api/appointment.api';
import { billingApi } from '../../api/billing.api';
import { useFetch } from '../../hooks/useFetch';
import AppointmentCard from '../../components/appointment/AppointmentCard.jsx';
import Loader from '../../components/common/Loader.jsx';
import { currency } from '../../utils/datetime';

export default function AdminDashboard() {
  const { data: doctors, meta: doctorMeta } = useFetch(useCallback(() => doctorApi.list({ limit: 1 }), []), []);
  const { meta: patientMeta } = useFetch(useCallback(() => patientApi.list({ limit: 1 }), []), []);
  const { meta: departmentMeta } = useFetch(useCallback(() => departmentApi.list({ limit: 1 }), []), []);
  const { data: upcoming, meta: apptMeta, loading } = useFetch(
    useCallback(() => appointmentApi.listMine({ limit: 5, upcoming: 'true', sort: 'asc' }), []),
    []
  );
  const { data: billing } = useFetch(useCallback(() => billingApi.summary(), []), []);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>Hospital overview</h2>
          <p className="muted">Everything below is served by role-scoped endpoints — admins see all records.</p>
        </div>
      </header>

      <div className="stat-row">
        <div className="stat"><span>Doctors</span><strong>{doctorMeta?.total ?? '—'}</strong></div>
        <div className="stat"><span>Patients</span><strong>{patientMeta?.total ?? '—'}</strong></div>
        <div className="stat"><span>Departments</span><strong>{departmentMeta?.total ?? '—'}</strong></div>
        <div className="stat"><span>Upcoming visits</span><strong>{apptMeta?.total ?? '—'}</strong></div>
      </div>

      {billing && (
        <div className="stat-row">
          <div className="stat"><span>Billed</span><strong>{currency(billing.totalBilled)}</strong></div>
          <div className="stat"><span>Collected</span><strong>{currency(billing.totalCollected)}</strong></div>
          <div className="stat stat--warn"><span>Outstanding</span><strong>{currency(billing.outstanding)}</strong></div>
          <div className="stat"><span>Invoices</span><strong>{billing.invoiceCount}</strong></div>
        </div>
      )}

      <section>
        <div className="page__head">
          <h3>Next appointments</h3>
          <Link className="btn btn--ghost btn--sm" to="/admin/appointments">See all</Link>
        </div>
        {loading && <Loader />}
        {!loading && upcoming?.length === 0 && <p className="empty-box">No upcoming appointments.</p>}
        <div className="stack">
          {(upcoming || []).map((a) => <AppointmentCard key={a._id} appointment={a} perspective="admin" />)}
        </div>
      </section>

      <section>
        <div className="page__head">
          <h3>Quick actions</h3>
        </div>
        <div className="quick">
          <Link className="btn btn--primary" to="/admin/doctors">Add a doctor</Link>
          <Link className="btn btn--ghost" to="/admin/departments">Manage departments</Link>
          <Link className="btn btn--ghost" to="/admin/billing">Review billing</Link>
        </div>
        {doctors?.length === 0 && <p className="empty-box">No doctors yet — add one to start taking bookings.</p>}
      </section>
    </div>
  );
}
