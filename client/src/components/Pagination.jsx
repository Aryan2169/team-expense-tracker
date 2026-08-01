export default function Pagination({ offset, limit, total, onChange }) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);

  return (
    <div className="pagination">
      <button type="button" onClick={() => onChange(Math.max(0, offset - limit))} disabled={offset === 0}>
        ← Previous
      </button>
      <span className="muted">
        {first}–{last} of {total} · page {page} of {pages}
      </span>
      <button
        type="button"
        onClick={() => onChange(offset + limit)}
        disabled={offset + limit >= total}
      >
        Next →
      </button>
    </div>
  );
}
