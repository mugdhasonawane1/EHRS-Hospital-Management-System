import { StatusBadge } from '../common/Table.jsx';
import { formatDateTime, relativeDay } from '../../utils/datetime';

/**
 * One appointment, rendered for whichever role is looking at it.
 * `actions` is a render slot so each dashboard supplies only the buttons that
 * role is actually allowed to use.
 */
export default function AppointmentCard({ appointment, perspective = 'patient', actions = null }) {
  const doctorName = appointment.doctorId?.userId?.name || 'Doctor';
  const patientName = appointment.patientId?.userId?.name || 'Patient';
  const counterpart = perspective === 'doctor' ? patientName : `Dr. ${doctorName.replace(/^Dr\.\s*/, '')}`;

  return (
    <article className={`card appt appt--${appointment.status}`}>
      <div className="appt__when">
        <span className="appt__day">{relativeDay(appointment.dateTime)}</span>
        <strong>{formatDateTime(appointment.dateTime)}</strong>
        <span className="muted">{appointment.durationMinutes} min</span>
      </div>

      <div className="appt__who">
        <h4>{counterpart}</h4>
        <p className="muted">
          {perspective === 'doctor'
            ? appointment.patientId?.userId?.email
            : `${appointment.doctorId?.specialization || ''}${appointment.departmentId?.name ? ` · ${appointment.departmentId.name}` : ''}`}
        </p>
        {appointment.reason && <p className="appt__reason">“{appointment.reason}”</p>}
        {appointment.status === 'cancelled' && appointment.cancellationReason && (
          <p className="muted">Cancelled: {appointment.cancellationReason}</p>
        )}
      </div>

      <div className="appt__side">
        <StatusBadge status={appointment.status} />
        {actions && <div className="appt__actions">{actions}</div>}
      </div>
    </article>
  );
}
