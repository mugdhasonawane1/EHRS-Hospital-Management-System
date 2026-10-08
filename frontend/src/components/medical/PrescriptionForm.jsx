import { useState } from 'react';

const emptyMedicine = { name: '', dosage: '', frequency: '', duration: '', instructions: '' };

/**
 * Controlled medicine-list editor. The parent owns submission so this form is
 * reusable both inside the "write record" flow and on its own.
 */
export default function PrescriptionForm({ value, onChange, disabled = false }) {
  const { medicines = [emptyMedicine], advice = '' } = value;
  const [touched, setTouched] = useState(false);

  const update = (patch) => onChange({ medicines, advice, ...patch });

  function setMedicine(index, field, fieldValue) {
    const next = medicines.map((m, i) => (i === index ? { ...m, [field]: fieldValue } : m));
    update({ medicines: next });
  }

  const incomplete = touched && medicines.some((m) => m.name && (!m.dosage || !m.duration));

  return (
    <div className="rxform">
      {medicines.map((m, i) => (
        <div className="rxform__row" key={i}>
          <input
            placeholder="Medicine *"
            value={m.name}
            disabled={disabled}
            onChange={(e) => setMedicine(i, 'name', e.target.value)}
            onBlur={() => setTouched(true)}
          />
          <input placeholder="Dosage * (500mg)" value={m.dosage} disabled={disabled} onChange={(e) => setMedicine(i, 'dosage', e.target.value)} />
          <input placeholder="Frequency (twice daily)" value={m.frequency} disabled={disabled} onChange={(e) => setMedicine(i, 'frequency', e.target.value)} />
          <input placeholder="Duration * (5 days)" value={m.duration} disabled={disabled} onChange={(e) => setMedicine(i, 'duration', e.target.value)} />
          <input placeholder="Instructions" value={m.instructions} disabled={disabled} onChange={(e) => setMedicine(i, 'instructions', e.target.value)} />
          <button
            type="button"
            className="icon-btn"
            aria-label="Remove medicine"
            disabled={disabled || medicines.length === 1}
            onClick={() => update({ medicines: medicines.filter((_, idx) => idx !== i) })}
          >
            ×
          </button>
        </div>
      ))}

      <div className="rxform__actions">
        <button type="button" className="btn btn--ghost" disabled={disabled} onClick={() => update({ medicines: [...medicines, { ...emptyMedicine }] })}>
          + Add medicine
        </button>
      </div>

      <label className="field">
        <span>General advice</span>
        <textarea
          rows={2}
          value={advice}
          disabled={disabled}
          placeholder="Rest, hydration, when to return…"
          onChange={(e) => update({ advice: e.target.value })}
        />
      </label>

      {incomplete && <p className="error-box">Each medicine needs a dosage and a duration.</p>}
    </div>
  );
}

export { emptyMedicine };
