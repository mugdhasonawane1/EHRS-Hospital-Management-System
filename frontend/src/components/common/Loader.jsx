export default function Loader({ label = 'Loading…', full = false, inline = false }) {
  if (inline) return <span className="loader-inline" aria-live="polite">{label}</span>;

  return (
    <div className={full ? 'loader-full' : 'loader-block'} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
