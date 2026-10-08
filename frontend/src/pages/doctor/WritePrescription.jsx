import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { appointmentApi } from '../../api/appointment.api';
import { medicalRecordApi } from '../../api/patient.api';
import { useFetch } from '../../hooks/useFetch';
import PrescriptionForm, { emptyMedicine } from '../../components/medical/PrescriptionForm.jsx';
import RecordCard from '../../components/medical/RecordCard.jsx';
import Loader from '../../components/common/Loader.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import { formatDateTime } from '../../utils/datetime';

/**
 * The record form only renders for a *completed* appointment — mirroring the
 * server rule that a MedicalRecord can only exist for a completed visit.
 */
export default function WritePrescription() {
  const { appointmentId } = useParams();
  const toast = useToast();
  const navigate = useNavigate();

  const fetcher = useCallback(() => appointmentApi.getById(appointmentId), [appointmentId]);
  const { data: appointment, loading, error, refetch } = useFetch(fetcher, [appointmentId]);

  const [form, setForm] = useState({ diagnosis: '', symptoms: '', notes: '', followUpDate: '' });
  const [vitals, setVitals] = useState({ temperatureC: '', pulseBpm: '', systolic: '', diastolic: '', weightKg: '', heightCm: '' });
  const [rx, setRx] = useState({ medicines: [{ ...emptyMedicine }], advice: '' });
  const [saving, setSaving] = useState(false);

  if (loading) return <Loader full />;
  if (error) return <p className="error-box">{error.message}</p>;

  const existing = appointment?.medicalRecord;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const medicines = rx.medicines.filter((m) => m.name && m.dosage && m.duration);
      const numericVitals = Object.fromEntries(
        Object.entries(vitals).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])
      );

      await medicalRecordApi.create({
        appointmentId,
        diagnosis: form.diagnosis,
        symptoms: form.symptoms ? form.symptoms.split(',').map((s) => s.trim()).filter(Boolean) : [],
        notes: form.notes || undefined,
        followUpDate: form.followUpDate || undefined,
        ...(Object.keys(numericVitals).length ? { vitals: numericVitals } : {}),
        ...(medicines.length ? { prescription: { medicines, advice: rx.advice || undefined } } : {}),
      });

      toast.success('Medical record saved');
      await refetch();
      navigate('/doctor');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const setVital = (k) => (e) => setVitals({ ...vitals, [k]: e.target.value });

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>Visit record</h2>
          <p className="muted">
            {appointment?.patientId?.userId?.name} · {formatDateTime(appointment?.dateTime)} ·{' '}
            <span className={`badge badge--${appointment?.status}`}>{appointment?.status}</span>
          </p>
        </div>
        <Link className="btn btn--ghost" to="/doctor">Back</Link>
      </header>

      {appointment?.status !== 'completed' && (
        <p className="empty-box">
          This appointment is <strong>{appointment?.status}</strong>. Mark the visit completed first — records can only
          be written for completed appointments.
        </p>
      )}

      {existing && (
        <>
          <h3>Saved record</h3>
          <RecordCard record={{ ...existing, prescriptions: existing.prescriptions }} showDoctor={false} />
          <p className="muted">A visit can have only one record. Reach the admin if it needs correcting.</p>
        </>
      )}

      {appointment?.status === 'completed' && !existing && (
        <form className="stack" onSubmit={handleSubmit}>
          <section className="card">
            <h3>Diagnosis</h3>
            <label className="field">
              <span>Diagnosis *</span>
              <input
                required
                minLength={2}
                value={form.diagnosis}
                onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
                placeholder="e.g. Acute bronchitis"
              />
            </label>
            <label className="field">
              <span>Symptoms (comma separated)</span>
              <input
                value={form.symptoms}
                onChange={(e) => setForm({ ...form, symptoms: e.target.value })}
                placeholder="cough, fever, fatigue"
              />
            </label>
            <label className="field">
              <span>Clinical notes</span>
              <textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <label className="field">
              <span>Follow-up date</span>
              <input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
            </label>
          </section>

          <section className="card">
            <h3>Vitals</h3>
            <div className="grid-3">
              <label className="field"><span>Temp (°C)</span><input type="number" step="0.1" value={vitals.temperatureC} onChange={setVital('temperatureC')} /></label>
              <label className="field"><span>Pulse (bpm)</span><input type="number" value={vitals.pulseBpm} onChange={setVital('pulseBpm')} /></label>
              <label className="field"><span>Systolic</span><input type="number" value={vitals.systolic} onChange={setVital('systolic')} /></label>
              <label className="field"><span>Diastolic</span><input type="number" value={vitals.diastolic} onChange={setVital('diastolic')} /></label>
              <label className="field"><span>Weight (kg)</span><input type="number" step="0.1" value={vitals.weightKg} onChange={setVital('weightKg')} /></label>
              <label className="field"><span>Height (cm)</span><input type="number" value={vitals.heightCm} onChange={setVital('heightCm')} /></label>
            </div>
          </section>

          <section className="card">
            <h3>Prescription</h3>
            <PrescriptionForm value={rx} onChange={setRx} />
          </section>

          <div className="row-end">
            <button className="btn btn--primary" disabled={saving || !form.diagnosis}>
              {saving ? 'Saving…' : 'Save record'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
