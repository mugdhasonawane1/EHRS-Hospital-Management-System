import Loader from './Loader.jsx';

/**
 * @param {Array}  columns  [{ key, header, render?, width? }]
 * @param {Array}  rows
 */
export default function Table({ columns, rows, loading, error, empty = 'Nothing to show yet.', rowKey = (r) => r._id }) {
  if (loading) return <Loader />;
  if (error) return <p className="error-box">{error.message}</p>;
  if (!rows?.length) return <p className="empty-box">{empty}</p>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header}>
                  {c.render ? c.render(row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge badge--${status}`}>{String(status).replace(/_/g, ' ')}</span>;
}
