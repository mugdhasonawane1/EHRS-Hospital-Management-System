import { useCallback, useEffect, useState } from 'react';
import { doctorApi } from '../../api/doctor.api';
import { useFetch } from '../../hooks/useFetch';
import Loader from '../../components/common/Loader.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import { dayName } from '../../utils/datetime';

const emptyWindow = { dayOfWeek: 1, startTime: '09:00', endTime: '13:00', slotDurationMinutes: 30 };

/** Weekly availability template — the source of truth the booking check uses. */
export default function DoctorAvailability() {
  const toast = useToast();
  const { data: doctor, loading, error, refetch } = useFetch(useCallback(() => doctorApi.me(), []), []);
  const [slots, setSlots] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doctor?.availableSlots) {
      setSlots(doctor.availableSlots.map((s) => ({ ...s })));
    }
  }, [doctor]);

  if (loading) return <Loader full />;
  if (error) return <p className="error-box">{error.message}</p>;

  const setSlot = (i, field, value) =>
    setSlots(slots.map((s, idx) => (idx === i ? { ...s, [field]: field === 'dayOfWeek' || field === 'slotDurationMinutes' ? Number(value) : value } : s)));

  async function save() {
    setSaving(true);
    try {
      const { data } = await doctorApi.updateAvailability(doctor._id, slots);
      toast.success(
        data.upcomingAppointments
          ? `Availability saved. ${data.upcomingAppointments} upcoming booking(s) are unaffected.`
          : 'Availability saved'
      );
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>My availability</h2>
          <p className="muted">
            Weekly template in UTC. Patients can only book slots that fit entirely inside one of these windows.
          </p>
        </div>
        <button className="btn btn--primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save availability'}
        </button>
      </header>

      <section className="card">
        {slots.length === 0 && <p className="empty-box">No windows defined — patients cannot book you.</p>}

        {slots.map((s, i) => (
          <div className="rxform__row" key={i}>
            <select value={s.dayOfWeek} onChange={(e) => setSlot(i, 'dayOfWeek', e.target.value)}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{dayName(d)}</option>)}
            </select>
            <input type="time" value={s.startTime} onChange={(e) => setSlot(i, 'startTime', e.target.value)} />
            <input type="time" value={s.endTime} onChange={(e) => setSlot(i, 'endTime', e.target.value)} />
            <select value={s.slotDurationMinutes} onChange={(e) => setSlot(i, 'slotDurationMinutes', e.target.value)}>
              {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min slots</option>)}
            </select>
            <button type="button" className="icon-btn" aria-label="Remove window" onClick={() => setSlots(slots.filter((_, idx) => idx !== i))}>×</button>
          </div>
        ))}

        <button type="button" className="btn btn--ghost" onClick={() => setSlots([...slots, { ...emptyWindow }])}>
          + Add window
        </button>
      </section>
    </div>
  );
}
