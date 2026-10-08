import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doctorApi, departmentApi } from '../../api/doctor.api';
import { appointmentApi } from '../../api/appointment.api';
import { useFetch } from '../../hooks/useFetch';
import SlotPicker from '../../components/appointment/SlotPicker.jsx';
import Loader from '../../components/common/Loader.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import { currency, formatDateTime } from '../../utils/datetime';

export default function BookAppointment() {
  const toast = useToast();
  const navigate = useNavigate();

  const [departmentId, setDepartmentId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [slot, setSlot] = useState('');
  const [reason, setReason] = useState('');
  const [booking, setBooking] = useState(false);

  const { data: departments } = useFetch(useCallback(() => departmentApi.list({ limit: 100 }), []), []);
  const doctorsFetcher = useCallback(
    () => doctorApi.list({ limit: 100, acceptingOnly: 'true', ...(departmentId ? { departmentId } : {}) }),
    [departmentId]
  );
  const { data: doctors, loading: doctorsLoading } = useFetch(doctorsFetcher, [departmentId]);

  const selectedDoctor = (doctors || []).find((d) => d._id === doctorId);

  async function handleBook(e) {
    e.preventDefault();
    if (!slot) return;
    setBooking(true);
    try {
      const { data } = await appointmentApi.book({ doctorId, dateTime: slot, reason: reason || undefined });
      toast.success(`Booked for ${formatDateTime(data.dateTime)}`);
      navigate('/patient');
    } catch (err) {
      // Conflict codes come straight from the backend detector.
      toast.error(err.message);
      setSlot('');
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="page">
      <header className="page__head">
        <h2>Book an appointment</h2>
        <p className="muted">Slots come from the doctor’s live availability — already-booked times are disabled.</p>
      </header>

      <form onSubmit={handleBook} className="stack">
        <section className="card">
          <div className="grid-2">
            <label className="field">
              <span>Department</span>
              <select
                value={departmentId}
                onChange={(e) => { setDepartmentId(e.target.value); setDoctorId(''); setSlot(''); }}
              >
                <option value="">All departments</option>
                {(departments || []).map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Doctor</span>
              {doctorsLoading ? (
                <Loader inline label="Loading doctors…" />
              ) : (
                <select value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setSlot(''); }}>
                  <option value="">Select a doctor…</option>
                  {(doctors || []).map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.userId?.name} — {d.specialization}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>

          {selectedDoctor && (
            <p className="muted">
              {selectedDoctor.departmentId?.name} · consultation {currency(selectedDoctor.consultationFee)}
              {selectedDoctor.experienceYears ? ` · ${selectedDoctor.experienceYears} yrs experience` : ''}
            </p>
          )}
        </section>

        <section className="card">
          <h3>Pick a slot</h3>
          <SlotPicker doctorId={doctorId} value={slot} onChange={setSlot} />
        </section>

        <section className="card">
          <label className="field">
            <span>Reason for visit</span>
            <textarea
              rows={3}
              maxLength={500}
              value={reason}
              placeholder="Briefly describe your symptoms…"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>

          <div className="row-end">
            <span className="muted">{slot ? `Selected: ${formatDateTime(slot)}` : 'No slot selected'}</span>
            <button className="btn btn--primary" disabled={!slot || booking}>
              {booking ? 'Booking…' : 'Confirm booking'}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
