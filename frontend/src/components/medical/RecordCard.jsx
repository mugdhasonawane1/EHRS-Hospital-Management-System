import { formatDate, formatDateTime } from '../../utils/datetime';

export default function RecordCard({ record, showDoctor = true }) {
  const vitals = record.vitals || {};
  const hasVitals = Object.values(vitals).some((v) => v !== undefined && v !== null);

  return (
    <article className="card record">
      <header className="record__head">
        <div>
          <h4>{record.diagnosis}</h4>
          <p className="muted">
            {record.appointmentId?.dateTime ? formatDateTime(record.appointmentId.dateTime) : formatDate(record.createdAt)}
            {showDoctor && record.doctorId?.userId?.name ? ` · ${record.doctorId.userId.name}` : ''}
            {record.doctorId?.specialization ? ` (${record.doctorId.specialization})` : ''}
          </p>
        </div>
        {record.followUpDate && (
          <span className="badge badge--info">Follow-up {formatDate(record.followUpDate)}</span>
        )}
      </header>

      {record.symptoms?.length > 0 && (
        <p className="record__symptoms">
          {record.symptoms.map((s) => (
            <span key={s} className="chip">{s}</span>
          ))}
        </p>
      )}

      {record.notes && <p className="record__notes">{record.notes}</p>}

      {hasVitals && (
        <ul className="vitals">
          {vitals.temperatureC != null && <li><span>Temp</span>{vitals.temperatureC} °C</li>}
          {vitals.pulseBpm != null && <li><span>Pulse</span>{vitals.pulseBpm} bpm</li>}
          {vitals.systolic != null && <li><span>BP</span>{vitals.systolic}/{vitals.diastolic}</li>}
          {vitals.weightKg != null && <li><span>Weight</span>{vitals.weightKg} kg</li>}
          {vitals.heightCm != null && <li><span>Height</span>{vitals.heightCm} cm</li>}
        </ul>
      )}

      {record.prescriptions?.length > 0 && (
        <div className="rx">
          <h5>Prescription</h5>
          {record.prescriptions.map((rx) => (
            <div key={rx._id}>
              <ul className="rx__list">
                {rx.medicines.map((m, i) => (
                  <li key={`${m.name}-${i}`}>
                    <strong>{m.name}</strong> {m.dosage}
                    {m.frequency ? ` · ${m.frequency}` : ''} · {m.duration}
                    {m.instructions ? <em> — {m.instructions}</em> : null}
                  </li>
                ))}
              </ul>
              {rx.advice && <p className="muted">Advice: {rx.advice}</p>}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
