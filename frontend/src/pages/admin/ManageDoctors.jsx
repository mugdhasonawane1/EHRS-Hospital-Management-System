import { useCallback, useState } from 'react';
import { doctorApi, departmentApi } from '../../api/doctor.api';
import { authApi } from '../../api/auth.api';
import { useFetch } from '../../hooks/useFetch';
import Table from '../../components/common/Table.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import { currency, dayName } from '../../utils/datetime';

const BLANK = {
  name: '', email: '', password: '', phone: '', specialization: '', departmentId: '',
  licenseNumber: '', experienceYears: '', consultationFee: '',
};

/** Weekdays 09:00–13:00, 30-minute slots — a sensible default for a new hire. */
const DEFAULT_SLOTS = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek, startTime: '09:00', endTime: '13:00', slotDurationMinutes: 30,
}));

export default function ManageDoctors() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(() => doctorApi.list({ limit: 50, ...(search ? { search } : {}) }), [search]);
  const { data, loading, error, refetch } = useFetch(fetcher, [search]);
  const { data: departments } = useFetch(useCallback(() => departmentApi.list({ limit: 100 }), []), []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function createDoctor(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.createStaff({
        name: form.name,
        email: form.email,
        password: form.password,
        role: 'doctor',
        phone: form.phone || undefined,
        specialization: form.specialization,
        departmentId: form.departmentId,
        licenseNumber: form.licenseNumber || undefined,
        experienceYears: form.experienceYears ? Number(form.experienceYears) : undefined,
        consultationFee: form.consultationFee ? Number(form.consultationFee) : undefined,
        availableSlots: DEFAULT_SLOTS,
      });
      toast.success(`${form.name} added — they can sign in with that email`);
      setCreating(false);
      setForm(BLANK);
      refetch();
    } catch (err) {
      toast.error(err.details?.map((d) => d.message).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleAccepting(doctor) {
    try {
      await doctorApi.update(doctor._id, { isAcceptingPatients: !doctor.isAcceptingPatients });
      toast.success(`${doctor.userId?.name} is ${doctor.isAcceptingPatients ? 'no longer' : 'now'} accepting patients`);
      refetch();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const columns = [
    { key: 'name', header: 'Doctor', render: (d) => (
      <div>
        <strong>{d.userId?.name}</strong>
        <div className="muted">{d.userId?.email}</div>
      </div>
    ) },
    { key: 'specialization', header: 'Specialization' },
    { key: 'department', header: 'Department', render: (d) => d.departmentId?.name || '—' },
    { key: 'fee', header: 'Fee', render: (d) => currency(d.consultationFee) },
    { key: 'experienceYears', header: 'Exp.', render: (d) => `${d.experienceYears || 0} yrs` },
    { key: 'slots', header: 'Consulting days', render: (d) => {
      const days = [...new Set((d.availableSlots || []).map((s) => s.dayOfWeek))].sort();
      return days.length ? days.map((x) => dayName(x).slice(0, 3)).join(', ') : <span className="muted">none set</span>;
    } },
    { key: 'status', header: 'Accepting', render: (d) => (
      <button className={`btn btn--sm ${d.isAcceptingPatients ? 'btn--success' : 'btn--danger'}`} onClick={() => toggleAccepting(d)}>
        {d.isAcceptingPatients ? 'Yes' : 'Paused'}
      </button>
    ) },
  ];

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>Doctors</h2>
          <p className="muted">Creating a doctor provisions both the login and the doctor profile.</p>
        </div>
        <button className="btn btn--primary" onClick={() => setCreating(true)}>+ Add doctor</button>
      </header>

      <input
        className="search"
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Table columns={columns} rows={data} loading={loading} error={error} empty="No doctors yet." />

      <Modal
        open={creating}
        title="Add a doctor"
        width={640}
        onClose={() => setCreating(false)}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn btn--primary" form="new-doctor" disabled={busy}>
              {busy ? 'Creating…' : 'Create doctor'}
            </button>
          </>
        }
      >
        <form id="new-doctor" onSubmit={createDoctor}>
          <div className="grid-2">
            <label className="field"><span>Full name *</span><input required value={form.name} onChange={set('name')} /></label>
            <label className="field"><span>Email *</span><input type="email" required value={form.email} onChange={set('email')} /></label>
            <label className="field"><span>Temporary password *</span><input type="text" required minLength={8} value={form.password} onChange={set('password')} placeholder="min 8 characters" /></label>
            <label className="field"><span>Phone</span><input value={form.phone} onChange={set('phone')} /></label>
            <label className="field"><span>Specialization *</span><input required value={form.specialization} onChange={set('specialization')} placeholder="Cardiology" /></label>
            <label className="field">
              <span>Department *</span>
              <select required value={form.departmentId} onChange={set('departmentId')}>
                <option value="">Select…</option>
                {(departments || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </label>
            <label className="field"><span>License number</span><input value={form.licenseNumber} onChange={set('licenseNumber')} /></label>
            <label className="field"><span>Experience (years)</span><input type="number" min="0" value={form.experienceYears} onChange={set('experienceYears')} /></label>
            <label className="field"><span>Consultation fee</span><input type="number" min="0" value={form.consultationFee} onChange={set('consultationFee')} /></label>
          </div>
          <p className="muted">
            Default availability: Mon–Fri, 09:00–13:00 UTC in 30-minute slots. The doctor can change this from their
            own portal.
          </p>
        </form>
      </Modal>
    </div>
  );
}
