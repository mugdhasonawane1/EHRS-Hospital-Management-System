import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { medicalRecordApi } from '../../api/patient.api';
import { useFetch } from '../../hooks/useFetch';
import RecordCard from '../../components/medical/RecordCard.jsx';
import Loader from '../../components/common/Loader.jsx';
import { formatDate } from '../../utils/datetime';

/**
 * A doctor's view of one patient's chart. The API returns 403 unless this
 * doctor has an appointment with the patient — the "have you treated them?"
 * ownership rule, checked server-side.
 */
export default function PatientRecord() {
  const { patientId } = useParams();
  const fetcher = useCallback(() => medicalRecordApi.patientHistory(patientId, { limit: 50 }), [patientId]);
  const { data, loading, error } = useFetch(fetcher, [patientId]);

  if (loading) return <Loader full />;
  if (error) {
    return (
      <div className="page">
        <p className="error-box">{error.message}</p>
        <Link className="btn btn--ghost" to="/doctor">Back to my appointments</Link>
      </div>
    );
  }

  const patient = data?.patient;
  const records = data?.records || [];

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>{patient?.userId?.name}</h2>
          <p className="muted">
            {patient?.gender} · {patient?.dob ? `born ${formatDate(patient.dob)}` : 'DOB not recorded'} ·
            blood group {patient?.bloodGroup} · {patient?.userId?.email}
          </p>
        </div>
        <Link className="btn btn--ghost" to="/doctor">Back</Link>
      </header>

      {(patient?.allergies?.length > 0 || patient?.chronicConditions?.length > 0) && (
        <section className="card">
          {patient.allergies?.length > 0 && (
            <p><strong>Allergies:</strong> {patient.allergies.map((a) => <span key={a} className="chip chip--warn">{a}</span>)}</p>
          )}
          {patient.chronicConditions?.length > 0 && (
            <p><strong>Chronic:</strong> {patient.chronicConditions.map((c) => <span key={c} className="chip">{c}</span>)}</p>
          )}
        </section>
      )}

      <h3>Visit history ({records.length})</h3>
      {records.length === 0 && <p className="empty-box">You have no completed visits with this patient yet.</p>}
      <div className="stack">
        {records.map((r) => <RecordCard key={r._id} record={r} showDoctor={false} />)}
      </div>
    </div>
  );
}
