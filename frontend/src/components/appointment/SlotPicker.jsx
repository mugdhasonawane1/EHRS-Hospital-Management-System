import { useCallback, useState } from 'react';
import { doctorApi } from '../../api/doctor.api';
import { useFetch } from '../../hooks/useFetch';
import Loader from '../common/Loader.jsx';
import { addDaysKey, dayName, formatDate, toDateKey } from '../../utils/datetime';

/**
 * Fetches the doctor's real availability for a date and disables anything the
 * backend would reject — already booked, in the past, or outside their hours.
 * The rules are computed server-side, so the picker can never offer a slot the
 * conflict detector would refuse.
 */
export default function SlotPicker({ doctorId, value, onChange }) {
  const [dateKey, setDateKey] = useState(() => toDateKey());

  const fetcher = useCallback(
    () => doctorApi.availability(doctorId, dateKey),
    [doctorId, dateKey]
  );
  const { data, loading, error } = useFetch(fetcher, [doctorId, dateKey], { enabled: Boolean(doctorId) });

  if (!doctorId) return <p className="empty-box">Pick a doctor first.</p>;

  const slots = data?.slots || [];

  return (
    <div className="slotpicker">
      <div className="slotpicker__nav">
        <button type="button" className="btn btn--ghost" onClick={() => setDateKey((d) => addDaysKey(d, -1))}>
          ← Prev
        </button>
        <div className="slotpicker__date">
          <input
            type="date"
            value={dateKey}
            min={toDateKey()}
            onChange={(e) => e.target.value && setDateKey(e.target.value)}
          />
          <span className="muted">
            {dayName(new Date(`${dateKey}T00:00:00Z`).getUTCDay())}, {formatDate(`${dateKey}T00:00:00Z`)}
          </span>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => setDateKey((d) => addDaysKey(d, 1))}>
          Next →
        </button>
      </div>

      {loading && <Loader label="Checking availability…" />}
      {error && <p className="error-box">{error.message}</p>}

      {!loading && !error && slots.length === 0 && (
        <p className="empty-box">Dr. does not consult on this day. Try another date.</p>
      )}

      {!loading && !error && slots.length > 0 && (
        <>
          <p className="muted slotpicker__count">
            {data.availableCount} of {data.totalSlots} slots free · {data.slots[0].durationMinutes} min each
          </p>
          <div className="slotgrid">
            {slots.map((s) => {
              const selected = value === s.dateTime;
              return (
                <button
                  key={s.dateTime}
                  type="button"
                  disabled={!s.available}
                  title={s.available ? 'Available' : s.reason === 'booked' ? 'Already booked' : 'Unavailable'}
                  className={`slot${selected ? ' slot--selected' : ''}${!s.available ? ' slot--disabled' : ''}`}
                  onClick={() => onChange(s.dateTime)}
                >
                  {s.startTime}
                  {!s.available && <span className="slot__tag">{s.reason === 'booked' ? 'taken' : 'past'}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
