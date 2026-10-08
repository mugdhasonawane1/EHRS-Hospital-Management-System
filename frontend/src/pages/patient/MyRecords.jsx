import { useCallback } from 'react';
import { medicalRecordApi } from '../../api/patient.api';
import { useFetch } from '../../hooks/useFetch';
import RecordCard from '../../components/medical/RecordCard.jsx';
import Loader from '../../components/common/Loader.jsx';

export default function MyRecords() {
  // The API scopes this to the caller's own records — no patientId needed.
  const { data, loading, error } = useFetch(useCallback(() => medicalRecordApi.list({ limit: 50 }), []), []);

  return (
    <div className="page">
      <header className="page__head">
        <h2>My medical records</h2>
        <p className="muted">Written by your doctor after each completed visit.</p>
      </header>

      {loading && <Loader />}
      {error && <p className="error-box">{error.message}</p>}
      {!loading && !error && data?.length === 0 && (
        <p className="empty-box">No records yet — they appear once a doctor completes your visit.</p>
      )}

      <div className="stack">
        {(data || []).map((r) => <RecordCard key={r._id} record={r} />)}
      </div>
    </div>
  );
}
